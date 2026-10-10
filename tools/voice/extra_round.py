"""補救回合：3 次都沒過的「可疑」句，換比較平穩的語氣指令再送 2 次（Batch API）。
起因（2026-10-10 第一次整套生成）：
- 「水／飯／薯條…，謝謝你！」開頭的食物詞常被吞掉或含糊，「朋友都孵出來了」用「興奮」語氣時會自己加「哈哈」。
- 「馬」「球」單字三次都被聽成別的聲調或韻母。
做法：語氣改成平穩、清楚、句尾下降、不要笑；挑問題最少的那次（舊的那次也算進去）。
用法：python tools/voice/extra_round.py   跑完會重建 manifest.json / review.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_batch as gb  # noqa: E402
import gen_full as gf  # noqa: E402

CALM_WORD = "calm and clear, pronounce the word fully with its standard tone and a falling statement intonation, no laughing"
CALM_LINE = "warm and calm, clear and steady, pronounce every word fully from the very first word, no laughing or extra words"
_orig = gf.style_of


def style_of(l):
    if l["id"] in TARGET:
        return CALM_WORD if l["cat"] in ("word", "phrase") else CALM_LINE
    return _orig(l)


gf.style_of = style_of
TARGET = set()


def main():
    state = json.loads(gf.STATE_P.read_text(encoding="utf-8"))
    by_id = {l["id"]: l for l in gf.LINES}
    for b in [b for b in state.get("batches", []) if not b["done"]]:   # 接回中斷的
        if not gb.collect(b, state, by_id):
            return
    # 第二次補救（2026-10-10）：定案那次還是「漏字／多字」的，再給 2 次（挑選規則已改成漏字最嚴重，見 gen_full.rank）
    for lid, r in state["lines"].items():
        if r["status"] == "review" and gf.rank(r["attempts"][r["chosen"]])[1] > 0:
            TARGET.add(lid)
    if not TARGET:
        gf.finalize(state); return
    n0 = min(len(state["lines"][lid]["attempts"]) for lid in TARGET)
    gf.MAX_TRIES = n0 + 2
    for rnd in (n0, n0 + 1):
        todo = []
        for lid in sorted(TARGET):
            r = state["lines"][lid]
            if r["status"] == "review" and len(r["attempts"]) == rnd:
                r["status"] = "retry"
                todo.append((by_id[lid], rnd))
        if not todo:
            break
        print(f"補救：第 {rnd + 1} 次生成，{len(todo)} 句", flush=True)
        gb.submit(todo, state, rnd)
        for b in [b for b in state["batches"] if not b["done"]]:
            if not gb.collect(b, state, by_id):
                return
        for lid in TARGET:                               # 這輪沒過的，先回到 review（下一輪再撿）
            r = state["lines"][lid]
            if r["status"] == "retry":
                gb.settle(r)
        gb.save(state)
    gf.finalize(state)


if __name__ == "__main__":
    main()
