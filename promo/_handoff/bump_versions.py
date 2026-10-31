"""統一升 ?v= 版號（每個替換都要剛好命中預期次數，不然整批不寫）。
10-31 第二次：陀螺標題列放不下自動藏標題、手機橫式結算星星條縮小 → zhuyin-tops.js v4（zhuyin.js import 跟著）→ zhuyin.js v34、zhuyin-tops.css v4。"""
from pathlib import Path

ROOT = Path(r"D:/Claude/Projects/GAME DIY")
PLAN = {
    "zhuyin.html": [
        ("js/zhuyin.js?v=33", "js/zhuyin.js?v=34", 2),
        ("css/zhuyin-tops.css?v=3", "css/zhuyin-tops.css?v=4", 1),
    ],
    "js/zhuyin.js": [
        ("./zhuyin-tops.js?v=3", "./zhuyin-tops.js?v=4", 1),
    ],
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
