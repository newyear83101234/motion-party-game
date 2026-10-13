"""統一升 ?v= 版號（每個替換都要剛好命中預期次數，不然整批不寫）。
10-13 陀螺第一次免費試玩：zhuyin.js 改了 → v32；新字串進注音字典 → ui v11 → ann v11（zhuyin.js／detective.js 的 import 也要跟著）→ detective v5。"""
from pathlib import Path

ROOT = Path(r"D:\Claude\Projects\GAME DIY")
PLAN = {
    "zhuyin.html": [
        ("js/zhuyin.js?v=31", "js/zhuyin.js?v=32", 2),
        ("js/zhuyin-ann.js?v=10", "js/zhuyin-ann.js?v=11", 1),
        ("js/zhuyin-ui.js?v=10", "js/zhuyin-ui.js?v=11", 1),
    ],
    "js/zhuyin.js": [
        ("./zhuyin-ann.js?v=10", "./zhuyin-ann.js?v=11", 1),
        ("./zhuyin-detective.js?v=4", "./zhuyin-detective.js?v=5", 1),
    ],
    "js/zhuyin-ann.js": [("./zhuyin-ui.js?v=10", "./zhuyin-ui.js?v=11", 1)],
    "js/zhuyin-detective.js": [("./zhuyin-ann.js?v=10", "./zhuyin-ann.js?v=11", 1)],
}
new = {}
for f, reps in PLAN.items():
    p = ROOT / f
    s = p.read_bytes().decode("utf-8")
    for a, b, n in reps:
        c = s.count(a)
        if c != n:
            raise SystemExit(f"{f}: 「{a}」出現 {c} 次，預期 {n} 次 → 整批不寫")
        s = s.replace(a, b)
    new[p] = s
for p, s in new.items():
    p.write_bytes(s.encode("utf-8"))
    print("ok", p.name)
