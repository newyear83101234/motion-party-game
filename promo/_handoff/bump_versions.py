"""統一升 ?v= 版號（每個替換都要剛好命中預期次數，不然整批不寫）。
10-13 v7 上線（陀螺合體三戰兩勝、寵物進化、介紹卡難度、新音樂音效）：
改過內容的模組 +1；被 import 的網址變了 → import 它的那個也要 +1（ui→ann→zhuyin.js／detective.js；rewards→hub3d／dress／zhuyin.js；tops-sim→tops）。
audio.js 的 AV（音檔與 manifest 版本）1→2：manifest 多了 battle／evolve 與 13 個音效。新檔 zhuyin-evolve.js 第一次上線維持 v1。"""
from pathlib import Path

ROOT = Path(r"D:\Claude\Projects\GAME DIY")
PLAN = {
    "zhuyin.html": [
        ("js/zhuyin.js?v=30", "js/zhuyin.js?v=31", 2),
        ("js/zhuyin-ann.js?v=9", "js/zhuyin-ann.js?v=10", 1),
        ("js/zhuyin-ui.js?v=9", "js/zhuyin-ui.js?v=10", 1),
        ("js/zhuyin-hub3d.js?v=12", "js/zhuyin-hub3d.js?v=13", 1),
        ("js/zhuyin-rewards.js?v=2", "js/zhuyin-rewards.js?v=3", 1),
        ("js/zhuyin-audio.js?v=2", "js/zhuyin-audio.js?v=3", 1),
        ("css/zhuyin.css?v=25", "css/zhuyin.css?v=26", 1),
        ("css/zhuyin-tops.css?v=1", "css/zhuyin-tops.css?v=2", 1),
    ],
    "js/zhuyin.js": [
        ("./zhuyin-ann.js?v=9", "./zhuyin-ann.js?v=10", 1),
        ("./zhuyin-audio.js?v=2", "./zhuyin-audio.js?v=3", 1),
        ("./zhuyin-rewards.js?v=2", "./zhuyin-rewards.js?v=3", 1),
        ("./zhuyin-hub3d.js?v=12", "./zhuyin-hub3d.js?v=13", 1),
        ("./zhuyin-detective.js?v=3", "./zhuyin-detective.js?v=4", 1),
        ("./zhuyin-tops.js?v=1", "./zhuyin-tops.js?v=2", 1),
        ("./zhuyin-dress.js?v=1", "./zhuyin-dress.js?v=2", 1),
    ],
    "js/zhuyin-ann.js": [("./zhuyin-ui.js?v=9", "./zhuyin-ui.js?v=10", 1)],
    "js/zhuyin-detective.js": [("./zhuyin-ann.js?v=9", "./zhuyin-ann.js?v=10", 1)],
    "js/zhuyin-hub3d.js": [("./zhuyin-rewards.js?v=2", "./zhuyin-rewards.js?v=3", 1)],
    "js/zhuyin-dress.js": [("./zhuyin-rewards.js?v=2", "./zhuyin-rewards.js?v=3", 1)],
    "js/zhuyin-tops.js": [("./zhuyin-tops-sim.js?v=1", "./zhuyin-tops-sim.js?v=2", 1)],
    "js/zhuyin-audio.js": [('const AV = "1";', 'const AV = "2";', 1)],
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
