"""配音一鍵更新（10-13 v6）：改完台詞／加新遊戲之後只要跑這一支。

    PYTHONIOENCODING=utf-8 python tools/voice/update.py          # 盤點 → 找出新句子與「改過的句子」→ 只錄這些 → 盲聽檢查 → 寫 manifest
    PYTHONIOENCODING=utf-8 python tools/voice/update.py --dry    # 只列出會錄哪些，不花錢

為什麼要有這支（以前要人工記得的三件事，現在自動做）：
1. 改了既有台詞的字（或 build_lines.py 的 TTS 替換寫法）→ 以前要手動從 progress.json 刪編號，不然 manifest 會把新字對到舊音檔（唸舊的）。
   現在每句記一個「簽名」（原字＋送 TTS 的字＋類別），簽名變了就自動重錄。
2. 重錄後檔名不變（檔名由原字算出來）→ 平板可能吃到舊快取。現在重錄的檔在 rev.json 記版次，manifest 帶 rev，
   js/zhuyin-voice.js 下載時加 ?r=版次。manifest 本身每次開遊戲都跟伺服器確認（no-cache），所以**配音更新不用再升 voice.js／zhuyin.js 版號**。
3. 一個指令跑完：build_lines.py → gen_batch.py（Batch API 半價、不吃每日上限、最多 3 輪自動重生）→ finalize。
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "voice" / "gemini_d"
STATE_P = OUT / "progress.json"
REV_P = OUT / "rev.json"
LINES_P = HERE / "lines.json"


def sig(l):
    """這句「錄出來的聲音」由什麼決定：原字、實際送 TTS 的字、類別（類別決定語氣）。"""
    send = l.get("tts_text_gemini") or l.get("tts_text") or l["text"]
    return f"{l['text']}\u0001{send}\u0001{l['cat']}"


def run(cmd):
    print("$", " ".join(str(c) for c in cmd), flush=True)
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode:
        raise SystemExit(f"失敗（exit {r.returncode}）：{' '.join(str(c) for c in cmd)}")


def main():
    dry = "--dry" in sys.argv
    run([sys.executable, str(HERE / "build_lines.py")])
    lines = json.loads(LINES_P.read_text(encoding="utf-8"))["lines"]
    state = json.loads(STATE_P.read_text(encoding="utf-8")) if STATE_P.exists() else {"lines": {}, "cost": {}}
    rev = json.loads(REV_P.read_text(encoding="utf-8")) if REV_P.exists() else {}
    by_id = {l["id"]: l for l in lines}

    new, changed, adopted = [], [], 0
    for l in lines:
        rec = state["lines"].get(l["id"])
        if rec is None:
            new.append(l)
        elif rec.get("text") != l["text"] or ("sig" in rec and rec["sig"] != sig(l)):
            changed.append((l, rec))
        elif "sig" not in rec:
            rec["sig"] = sig(l); adopted += 1               # 第一次用這支：現有錄音視為跟目前台詞一致
    gone = [i for i in state["lines"] if i not in by_id]
    pending = [l for l in lines if l["id"] in state["lines"] and "chosen" not in state["lines"][l["id"]]]   # 上次重生到一半（還沒定案）：接著錄

    print(f"\n新句子 {len(new)}、改過要重錄 {len(changed)}、上次沒錄完 {len(pending)}、程式裡已經沒有的 {len(gone)}（保留不刪）、第一次登記簽名 {adopted}")
    for l in new[:40]:
        print("  ＋", l["id"], l["text"])
    for l, rec in changed[:40]:
        print("  ↻", l["id"], rec.get("text"), "→", l["text"], "" if rec.get("text") != l["text"] else "（送 TTS 的字或類別變了）")
    if dry:
        print("\n--dry：不錄音。")
        return

    for l, rec in changed:                                   # 重錄：從進度移除；檔名沒變的記版次（破平板快取）
        state["lines"].pop(l["id"], None)
        if rec.get("file"):
            from gen_full import fname  # noqa: E402（延後載入：gen_full 開頭會讀 lines.json，要等 build_lines 跑完）
            if fname(l) == rec["file"]:
                rev[rec["file"]] = rev.get(rec["file"], 1) + 1
    STATE_P.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    REV_P.write_text(json.dumps(rev, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")

    if new or changed or pending:
        run([sys.executable, str(HERE / "gen_batch.py")])
    else:
        run([sys.executable, str(HERE / "gen_full.py"), "--finalize"])   # 沒有要錄的也重寫一次 manifest（帶 rev）

    state = json.loads(STATE_P.read_text(encoding="utf-8"))   # gen_batch 改過進度檔：補上新錄的簽名
    for l in lines:
        rec = state["lines"].get(l["id"])
        if rec is not None and rec.get("status") == "ok" and "sig" not in rec:
            rec["sig"] = sig(l)
        elif rec is not None and "sig" not in rec and rec.get("chosen") is not None:
            rec["sig"] = sig(l)                                # 3 輪都沒過、挑最好那次定案的也算錄過（列在 review.json 請人耳確認）
    STATE_P.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    left = [l["id"] for l in lines if l["id"] not in state["lines"] or not (OUT / state["lines"][l["id"]].get("file", "_")).exists()]
    print(f"\n完成。還沒有音檔的句子：{len(left)}" + (f"（{', '.join(left[:10])}…）重跑這支會接著錄" if left else ""))
    print("記得：新的 mp3 要 git add -f（voice/gemini_d/ 底下），manifest.json、rev.json 也要 add；不用升版號。")


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    main()
