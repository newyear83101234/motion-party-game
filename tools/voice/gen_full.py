"""用 Gemini 設計聲音 D「兒童節目大姐姐」生成整套台詞 → voice/gemini_d/

用法：python tools/voice/gen_full.py            （可中斷，重跑會從沒做完的句子接著做）
      python tools/voice/gen_full.py --finalize （只用 progress.json 重建 manifest.json / review.json）

每句流程：生成 → 去頭尾靜音＋響度正規化 → 48kbps 單聲道 mp3 → Gemini 3.8 Flash 盲聽寫 →
跟正確讀音比對（詞庫詞用 js/zhuyin-words.js 的注音，其餘見 readings.py）→ 不合格自動重生，最多再 2 次。
仍可疑的寫進 review.json 給阿葉人工聽。
金鑰只從環境變數 GEMINI_API_KEY 讀（gemini_rest.py），不寫檔、不印出。
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini_rest as g  # noqa: E402
import make_samples as ms  # noqa: E402  （共用：限速、wav→mp3 處理）
import readings as R  # noqa: E402
import verify_samples as vs  # noqa: E402  （共用：盲聽寫）

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "voice" / "gemini_d"
TMP = OUT / "_tmp"
STATE_P = OUT / "progress.json"
LINES = json.loads((Path(__file__).resolve().parent / "lines.json").read_text(encoding="utf-8"))["lines"]
VOICE_ID = ms.VOICES["tw_sister"]["id"]
MODEL = "gemini-3.8-flash-tts"
MAX_TRIES = 3            # 第 1 次＋重生 2 次

STYLE = {
    "word": "clear and natural, at a relaxed normal pace, like a friendly teacher saying a word to a young child",
    "praise": "genuinely delighted and proud of the child, warm and encouraging",
    "excited": "happy and excited, celebrating together with a child",
    "order_want": "cheerful and polite, like a cute little customer ordering at a shop",
    "order_thanks": "happy and grateful, like a cute little customer thanking the shopkeeper",
    "calm": "calm and gentle",
    "warm": "warm, gentle and cheerful, speaking clearly to a five-year-old child",
    # 10-12 詞句小偵探題目句：像平常說話一樣念出一句熟悉的歌詞，不唱、不加旋律、不刻意加重任何字（不能用重音洩漏答案）
    "detective": "speaking the sentence in a natural, gentle, clear and slightly slow everyday voice; do not sing, no melody, keep every word evenly stressed",
}
# 重生時改送的同音字（第 1 次照原字或 tts_text_gemini；第 2、3 次才換）
RETRY_SUB = {"企鵝": "器鵝", "餅乾": "餅干", "睡覺": "睡叫", "長頸鹿": "常頸鹿"}


def style_of(l):
    i, c = l["id"], l["cat"]
    if i.startswith("dt_q_"):                     # 詞句小偵探題目句（類別是 phrase，仍走最嚴格聽寫檢查）
        return STYLE["detective"]
    if i == "dt_retry":
        return STYLE["calm"]
    if c in ("word", "phrase", "friend"):
        return STYLE["word"]
    if c == "praise":
        return STYLE["praise"]
    if i.startswith(("result_stickers_", "hatch_", "match_allfound", "guide_allhatched", "hunt_found")):
        return STYLE["excited"]
    if i.startswith("order_want_"):
        return STYLE["order_want"]
    if i.startswith("order_thanks_"):
        return STYLE["order_thanks"]
    if i == "sys_pause":
        return STYLE["calm"]
    return STYLE["warm"]


def fname(l):
    return f"{l['cat']}_{hashlib.sha1(l['text'].encode('utf-8')).hexdigest()[:8]}.mp3"


def spoken(l):
    return l.get("tts_text", l["text"])


def send_text(l, attempt):
    base = l.get("tts_text_gemini") or spoken(l)
    if attempt >= 1 and l["text"] in RETRY_SUB:
        return RETRY_SUB[l["text"]]
    return base


def dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(p)],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


lock = threading.Lock()
cost = {"tts_out": 0, "tts_in": 0, "asr_in": 0, "asr_out": 0, "tts_calls": 0, "asr_calls": 0}
STOP = threading.Event()


def tts_once(text, style):
    last = None
    for attempt in range(6):
        if STOP.is_set():
            raise RuntimeError("stopped")
        ms._slot()
        try:
            wav, usage = g.tts(text, VOICE_ID, model=MODEL, style=style)
            with lock:
                cost["tts_out"] += usage.get("total_output_tokens", 0); cost["tts_in"] += usage.get("total_input_tokens", 0)
                cost["tts_calls"] += 1
            return wav
        except Exception as e:
            last = e
            msg = str(e)
            if "per day" in msg.lower() or "daily" in msg.lower():
                STOP.set()
                raise RuntimeError("今日額度用完：" + msg[:200])
            m = re.search(r"retry in (\d+)s", msg)
            time.sleep(int(m.group(1)) + 2 if m else 5 * (attempt + 1))
    raise last


def asr(p):
    for model in ("gemini-3.8-flash", "gemini-3.8-flash", "gemini-2.5-flash"):   # 3.8 連兩次失敗（例如每日上限）就改用 2.5
        out = vs.transcribe(p, model)
        if "error" not in out and "raw" not in out:
            t = out.get("_tokens") or {}
            with lock:
                cost["asr_in"] += t.get("input", 0); cost["asr_out"] += t.get("output", 0); cost["asr_calls"] += 1
            return out
        time.sleep(5)
    return out


def judge(l, out, d):
    hard, soft = R.compare(spoken(l), out.get("pinyin", ""))
    n = len(re.sub(r"[，！？。、\s]", "", spoken(l)))
    if d < 0.12 * n + 0.15:
        hard.append(f"太短（{d:.2f} 秒）可能沒唸完")
    if d > 0.55 * n + 2.0:
        hard.append(f"太長（{d:.2f} 秒）可能有怪停頓或多唸")
    learning = l["cat"] in ("word", "phrase")
    return hard, soft, (not hard and (not soft or not learning))


def rank(a):
    """挑最好的那次：合格優先；再來「音節數不同／太短／太長」這種漏字多字的最嚴重；再比問題數。"""
    severe = sum(1 for h in a["hard"] if h.startswith(("音節數不同", "太短", "太長")))
    return (not a["ok"], severe, len(a["hard"]), len(a["soft"]))


def do_line(l, state):
    if STOP.is_set():
        return
    TMP.mkdir(parents=True, exist_ok=True)
    attempts = []
    for a in range(MAX_TRIES):
        text = send_text(l, a)
        wav = tts_once(text, style_of(l))
        tw = TMP / f"{l['id']}_{a}.wav"; tm = TMP / f"{fname(l)[:-4]}_{a}.mp3"
        tw.write_bytes(wav)
        ms.wav_to_mp3(tw, tm); tw.unlink()
        d = dur(tm)
        out = asr(tm)
        hard, soft, ok = judge(l, out, d)
        attempts.append(dict(sent=text, file=tm.name, duration=round(d, 2), heard=out.get("hanzi"), pinyin=out.get("pinyin"),
                             natural=out.get("natural"), issues=out.get("issues"), hard=hard, soft=soft, ok=ok))
        if ok:
            break
    best = min(range(len(attempts)), key=lambda k: rank(attempts[k]))
    shutil.move(str(TMP / attempts[best]["file"]), str(OUT / fname(l)))
    for k, at in enumerate(attempts):
        if k != best and (TMP / at["file"]).exists():
            (TMP / at["file"]).unlink()
    rec = dict(text=l["text"], cat=l["cat"], file=fname(l), chosen=best, status="ok" if attempts[best]["ok"] else "review", attempts=attempts)
    with lock:
        state["lines"][l["id"]] = rec
        old = state.get("cost", {})
        state["cost"] = {k: old.get(k, 0) + cost.get(k, 0) for k in set(old) | set(cost)}
        for k in cost:
            cost[k] = 0
        STATE_P.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    flag = "OK " if rec["status"] == "ok" else "?? "
    print(f"{flag}{len(state['lines'])}/{len(LINES)} {l['text']} tries={len(attempts)} {attempts[best]['pinyin']}", flush=True)


def finalize(state):
    P = dict(tts_out=9.0, tts_in=0.5, asr_in=0.75, asr_out=3.75,       # US$ / 100 萬 token（2026-10-10 官方價）
             tts_out_batch=4.5, tts_in_batch=0.25)                    # Batch API 半價
    c = state.get("cost", {})
    usd = sum(c.get(k, 0) * P[k] for k in P) / 1e6
    files, durs, review = {}, {}, []
    for l in LINES:
        r = state["lines"].get(l["id"])
        if not r or not (OUT / r["file"]).exists():
            continue
        files[l["text"]] = r["file"]
        durs[r["file"]] = r["attempts"][r["chosen"]]["duration"]
        # 一般句子的輕聲（例如 謝謝 的第二個謝、星星、哪個）是台灣口語本來就有的，不列；學習詞的輕聲才列
        if r["status"] != "ok" or (l["cat"] in ("word", "phrase") and r["attempts"][r["chosen"]]["soft"]):
            at = r["attempts"][r["chosen"]]
            review.append(dict(text=l["text"], file=r["file"], level="可疑" if r["status"] != "ok" else "輕微（輕聲）",
                               why=at["hard"] + at["soft"], heard=at["heard"], pinyin=at["pinyin"],
                               correct=" ".join(p for _, p in R.expected(spoken(l))), zhuyin=l.get("zhuyin"), tries=len(r["attempts"]),
                               all_takes=[dict(sent=x["sent"], pinyin=x["pinyin"], why=x["hard"] + x["soft"]) for x in r["attempts"]]))
    man = dict(voice=f"Gemini {MODEL}／設計聲音 D「兒童節目大姐姐」({VOICE_ID})", generated=datetime.now().strftime("%Y-%m-%d %H:%M"),
               note="key＝遊戲傳給 say() 的原字串（含標點）。split：『前綴＋詞』拆兩段播（前綴音檔＋詞音檔）。",
               files=files, split={"找到了，": "找到了！", "對手是：": "對手是："}, durations=durs)   # 「對手是：」＋內建詞句（10-12 陀螺，build_lines.py tp_vsPre／tp_insp_*）
    rev_p = OUT / "rev.json"                                   # 10-13：重錄但檔名沒變的檔（update.py 記版次）→ 前端下載時加 ?r=版次，破平板快取
    if rev_p.exists():
        rv = json.loads(rev_p.read_text(encoding="utf-8"))
        man["rev"] = {f: n for f, n in rv.items() if f in durs}
    (OUT / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
    review.sort(key=lambda x: x["level"] != "可疑")
    (OUT / "review.json").write_text(json.dumps(dict(
        how="每句由 Gemini 3.8 Flash 盲聽寫（不給答案），拼音跟正確讀音比對；詞庫詞以遊戲注音為準。AI 聽寫本身也會錯，所以這份是『請人耳確認』清單，不代表一定唸錯。",
        count=len(review), suspicious=sum(1 for x in review if x["level"] == "可疑"), items=review), ensure_ascii=False, indent=1), encoding="utf-8")
    size = sum((OUT / f).stat().st_size for f in set(files.values()))
    summary = dict(lines_total=len(LINES), files=len(set(files.values())), keys=len(files), review=len(review),
                   suspicious=sum(1 for x in review if x["level"] == "可疑"), size_mb=round(size / 1e6, 2),
                   audio_sec=round(sum(durs.values())), cost=c, usd=round(usd, 3))
    print(json.dumps(summary, ensure_ascii=False))
    return summary


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    state = json.loads(STATE_P.read_text(encoding="utf-8")) if STATE_P.exists() else {"lines": {}, "cost": {}}
    if "--finalize" not in sys.argv:
        todo = [l for l in LINES if l["id"] not in state["lines"] or not (OUT / state["lines"][l["id"]]["file"]).exists()]
        if "--limit" in sys.argv:
            todo = todo[:int(sys.argv[sys.argv.index("--limit") + 1])]
        print(f"待做 {len(todo)} 句（已完成 {len(state['lines'])}）", flush=True)
        with ThreadPoolExecutor(6) as ex:
            futs = [ex.submit(do_line, l, state) for l in todo]
            for f in futs:
                try:
                    f.result()
                except Exception as e:
                    print("[錯誤]", str(e)[:300], flush=True)
        try:
            if TMP.exists() and not any(TMP.iterdir()):
                TMP.rmdir()
        except OSError:
            pass                                              # D:\Claude 有雲端同步，空資料夾偶爾被鎖住，留著無害
    finalize(state)


if __name__ == "__main__":
    main()
