"""統一升 ?v= 版號（每個替換都要剛好命中預期次數，不然整批不寫）。
10-31 v8 第一批（我的家）：zhuyin-ui.js 重新產生 → zhuyin-ann.js v13（它 import ui）→ zhuyin-detective.js v7（它 import ann）；
zhuyin-hub3d.js v14、zhuyin-audio.js v4（AV 3：多了 hammer 音效）、zhuyin-tops.js v5（「我的星星」字樣）；新檔 zhuyin-home.js v1、zhuyin-home.css v1 → zhuyin.js v35。"""
from pathlib import Path

ROOT = Path(r"D:/Claude/Projects/GAME DIY")
PLAN = {   # 11-01 v8 第二批（音樂島＋接接樂＋唱片行＋我的歌）：新檔 records/mysongs/catch/catch.css/records.css/music.css 都是 v1 不用升
    "zhuyin.html": [
        ("js/zhuyin.js?v=37", "js/zhuyin.js?v=38", 2),
        ("js/zhuyin-ann.js?v=14", "js/zhuyin-ann.js?v=15", 1),
        ("js/zhuyin-ui.js?v=14", "js/zhuyin-ui.js?v=15", 1),
        ("js/zhuyin-hub3d.js?v=15", "js/zhuyin-hub3d.js?v=16", 1),
        ("js/zhuyin-audio.js?v=4", "js/zhuyin-audio.js?v=5", 1),
        ("js/zhuyin-ocean.js?v=3", "js/zhuyin-ocean.js?v=4", 1),
        ("js/zhuyin-stats.js?v=3", "js/zhuyin-stats.js?v=4", 1),
        ("js/zhuyin-home.js?v=1", "js/zhuyin-home.js?v=2", 1),
        ("css/zhuyin.css?v=27", "css/zhuyin.css?v=28", 1),
    ],
    "js/zhuyin-ann.js": [("./zhuyin-ui.js?v=14", "./zhuyin-ui.js?v=15", 1)],
    "js/zhuyin-detective.js": [("./zhuyin-ann.js?v=14", "./zhuyin-ann.js?v=15", 1)],
    "js/zhuyin.js": [
        ("./zhuyin-ann.js?v=14", "./zhuyin-ann.js?v=15", 1),
        ("./zhuyin-audio.js?v=4", "./zhuyin-audio.js?v=5", 1),
        ("./zhuyin-hub3d.js?v=15", "./zhuyin-hub3d.js?v=16", 1),
        ("./zhuyin-ocean.js?v=3", "./zhuyin-ocean.js?v=4", 1),
        ("./zhuyin-stats.js?v=3", "./zhuyin-stats.js?v=4", 1),
        ("./zhuyin-home.js?v=1", "./zhuyin-home.js?v=2", 1),
        ("./zhuyin-detective.js?v=8", "./zhuyin-detective.js?v=9", 1),
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
