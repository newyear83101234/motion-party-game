"""改走 Batch API 生成剩下的句子（gen_full.py 的接力版）

為什麼：這把金鑰是 Tier 1，gemini-3.8-flash-tts 一般呼叫每天只有 100 次（2026-10-10 實測 429：limit 100 requests per day）。
Batch API 不吃這個每日上限（實測 2 句約 3 分鐘回來），而且半價。

流程（最多 3 輪＝第 1 次＋重生 2 次）：
  每輪把「還沒合格」的句子一次送一批（每 50 句一個 batch）→ 輪詢等結果 → 每句轉 mp3＋盲聽寫＋比對讀音（同 gen_full.py）
  → 合格的定案；不合格的進下一輪（第 2、3 輪會換同音字，見 gen_full.RETRY_SUB）。
  3 輪後還不合格：挑問題最少的那次定案，寫進 review.json。
可中斷：送出的 batch 名稱存在 progress.json，重跑會先接回還在跑的 batch，不會重送。
用法：python tools/voice/gen_batch.py
"""
import base64
import json
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini_rest as g  # noqa: E402
import gen_full as gf  # noqa: E402
import make_samples as ms  # noqa: E402

CHUNK = 50
POLL_MAX = 3 * 3600      # 一次最多等 3 小時，沒好就先離開，重跑會接回


def save(state):
    with gf.lock:
        old = state.get("cost", {})
        state["cost"] = {k: old.get(k, 0) + gf.cost.get(k, 0) for k in set(old) | set(gf.cost)}   # 聯集：避免新 key 還沒出現時把舊累計洗掉
        for k in gf.cost:
            gf.cost[k] = 0
        gf.STATE_P.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")


def req(l, attempt):
    return {"request": {"contents": [{"role": "user", "parts": [{"text": gf.send_text(l, attempt), "speech_metadata": {"style": gf.style_of(l)}}]}],
                        "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"voice": gf.VOICE_ID}}}},
            "metadata": {"key": f"{l['id']}|{attempt}"}}


def submit(lines_attempts, state, rnd):
    names = []
    for i in range(0, len(lines_attempts), CHUNK):
        part = lines_attempts[i:i + CHUNK]
        body = {"batch": {"display_name": f"zy-voice-r{rnd}-{i // CHUNK}",
                          "input_config": {"requests": {"requests": [req(l, a) for l, a in part]}}}}
        st, js = g.call("POST", f"/models/{gf.MODEL}:batchGenerateContent", body)
        if st != 200:
            raise RuntimeError(f"batch 送出失敗 HTTP {st}: {json.dumps(js, ensure_ascii=False)[:300]}")
        names.append(js["name"])
        print(f"送出 {js['name']}（{len(part)} 句）", flush=True)
    state.setdefault("batches", []).extend({"name": n, "round": rnd, "done": False} for n in names)
    save(state)


def poll(name):
    t0 = time.time()
    while time.time() - t0 < POLL_MAX:
        st, js = g.call("GET", "/" + name)
        md = js.get("metadata", js)
        s = md.get("state", "")
        if s.endswith(("SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED")):
            return s, md
        time.sleep(30)
    return "TIMEOUT", None


def handle(l, attempt, wav, usage, state):
    gf.TMP.mkdir(parents=True, exist_ok=True)
    tw = gf.TMP / f"{l['id']}_{attempt}.wav"; tm = gf.TMP / f"{gf.fname(l)[:-4]}_{attempt}.mp3"
    tw.write_bytes(wav); ms.wav_to_mp3(tw, tm); tw.unlink()
    d = gf.dur(tm)
    out = gf.asr(tm)
    hard, soft, ok = gf.judge(l, out, d)
    with gf.lock:
        gf.cost["tts_out_batch"] = gf.cost.get("tts_out_batch", 0) + usage.get("candidatesTokenCount", 0)
        gf.cost["tts_in_batch"] = gf.cost.get("tts_in_batch", 0) + usage.get("promptTokenCount", 0)
        rec = state["lines"].setdefault(l["id"], dict(text=l["text"], cat=l["cat"], file=gf.fname(l), status="retry", attempts=[]))
        rec["attempts"].append(dict(sent=gf.send_text(l, attempt), file=tm.name, duration=round(d, 2), heard=out.get("hanzi"),
                                    pinyin=out.get("pinyin"), natural=out.get("natural"), issues=out.get("issues"),
                                    hard=hard, soft=soft, ok=ok, via="batch"))
        if ok or len(rec["attempts"]) >= gf.MAX_TRIES:
            settle(rec)
    flag = "OK " if ok else "?? "
    print(f"{flag}{l['text']} 第{attempt + 1}次 {out.get('pinyin')} {'' if ok else hard + soft}", flush=True)


def settle(rec):
    at = rec["attempts"]
    # 只能從「檔案還在」的版本挑：這次新生成的（在 _tmp）＋目前定案的那個（已在正式資料夾）
    avail = [k for k in range(len(at)) if (gf.TMP / at[k]["file"]).exists() or k == rec.get("chosen")]
    best = min(avail, key=lambda k: gf.rank(at[k]))
    src = gf.TMP / at[best]["file"]
    if src.exists():
        shutil.move(str(src), str(gf.OUT / rec["file"]))
    for k, a in enumerate(at):
        if k != best and (gf.TMP / a["file"]).exists():
            (gf.TMP / a["file"]).unlink()
    rec["chosen"] = best
    rec["status"] = "ok" if at[best]["ok"] else "review"


def collect(b, state, by_id):
    s, md = poll(b["name"])
    if s == "TIMEOUT":
        print("還沒好，先離開；重跑會接回", b["name"], flush=True)
        return False
    if not s.endswith("SUCCEEDED"):
        print("batch 失敗：", b["name"], s, flush=True)
        b["done"] = True; save(state)
        return True
    resps = md["output"]["inlinedResponses"]["inlinedResponses"]
    jobs = []
    for r in resps:
        lid, attempt = r["metadata"]["key"].rsplit("|", 1)
        l = by_id[lid]
        try:
            part = r["response"]["candidates"][0]["content"]["parts"][0]["inlineData"]
            jobs.append((l, int(attempt), base64.b64decode(part["data"]), r["response"].get("usageMetadata", {})))
        except Exception:
            print("這句沒有聲音回來：", l["text"], json.dumps(r.get("error") or r, ensure_ascii=False)[:200], flush=True)
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(lambda j: handle(*j, state), jobs))
    b["done"] = True
    save(state)
    return True


def main():
    gf.OUT.mkdir(parents=True, exist_ok=True)
    state = json.loads(gf.STATE_P.read_text(encoding="utf-8"))
    by_id = {l["id"]: l for l in gf.LINES}
    # 先接回之前送出但還沒收的 batch
    for b in [b for b in state.get("batches", []) if not b["done"]]:
        if not collect(b, state, by_id):
            return
    for rnd in range(gf.MAX_TRIES):
        todo = []
        for l in gf.LINES:
            rec = state["lines"].get(l["id"])
            if rec is None:
                todo.append((l, 0))
            elif rec["status"] == "retry":
                todo.append((l, len(rec["attempts"])))
            elif not (gf.OUT / rec["file"]).exists():
                todo.append((l, 0)); state["lines"].pop(l["id"])
        if not todo:
            break
        print(f"第 {rnd + 1} 輪：{len(todo)} 句", flush=True)
        submit(todo, state, rnd)
        for b in [b for b in state["batches"] if not b["done"]]:
            if not collect(b, state, by_id):
                return
    gf.finalize(state)


if __name__ == "__main__":
    main()
