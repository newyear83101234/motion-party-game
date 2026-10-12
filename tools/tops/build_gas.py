# -*- coding: utf-8 -*-
"""注音戰鬥陀螺：產生 Apps Script（同樂廣場後端）要貼的兩個檔
  tools/tops/gas/TopsPower.gs ← js/zhuyin-tops-power.js 拿掉最後的 export（同一份戰力公式，前後端不會不一致）
  tools/tops/gas/TopsDict.gs  ← js/zhuyin-tops-dict.json 包成 var TOPS_DICT_RAW＋topsDict()（解碼一次後快取）
用法：python tools/tops/build_gas.py（build_dict.py 跑完會自動呼叫；只改了 power.js 的話單獨跑這支就好）
後端用法（GAS）：var r = topsPowerOf(p, topsDict());  var bad = topsPhraseIssue(p, topsDict());  // bad 不是 null 就不收
"""
import io, os, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTD = os.path.join(ROOT, "tools", "tops", "gas")
os.makedirs(OUTD, exist_ok=True)

src = io.open(os.path.join(ROOT, "js", "zhuyin-tops-power.js"), encoding="utf-8").read()
mark = "// @@ESM-EXPORT"
assert mark in src, "zhuyin-tops-power.js 找不到 @@ESM-EXPORT 標記"
body = src.split(mark)[0].rstrip() + "\n"
code = "\n".join(l.split("//")[0] for l in body.splitlines())   # 只查程式碼（註解裡提到不算）
for bad in ("import ", "export ", "class ", "new Map", "new Set"):
    assert bad not in code, f"zhuyin-tops-power.js 用了 GAS 不支援／約定不用的寫法：{bad}"
head = "// 自動產生，請勿手改：python tools/tops/build_gas.py（來源 js/zhuyin-tops-power.js）\n"
io.open(os.path.join(OUTD, "TopsPower.gs"), "w", encoding="utf-8", newline="\n").write(head + body)

raw = io.open(os.path.join(ROOT, "js", "zhuyin-tops-dict.json"), encoding="utf-8").read().strip()
dict_gs = ("// 自動產生，請勿手改：python tools/tops/build_gas.py（來源 js/zhuyin-tops-dict.json，授權見 docs/zhuyin-tops-data.md）\n"
           "var TOPS_DICT_RAW = " + raw + ";\n"
           "var TOPS_DICT_CACHE = null;\n"
           "function topsDict() { if (!TOPS_DICT_CACHE) TOPS_DICT_CACHE = topsDecodeDict(TOPS_DICT_RAW); return TOPS_DICT_CACHE; }\n")
io.open(os.path.join(OUTD, "TopsDict.gs"), "w", encoding="utf-8", newline="\n").write(dict_gs)
print("→ tools/tops/gas/TopsPower.gs、TopsDict.gs")

# 同樂廣場後端（tools/plaza/gas，clasp 從這裡推）放一份一模一樣的副本；tools/plaza/test-core.mjs 會檢查兩邊一致。
# 改完要到 tools/plaza 跑 node test-core.mjs → clasp push → clasp deploy -i（見 tools/plaza/README.md），線上才會換成新公式。
PLAZA = os.path.join(ROOT, "tools", "plaza", "gas")
if os.path.isdir(PLAZA):
    io.open(os.path.join(PLAZA, "TopsPower.gs"), "w", encoding="utf-8", newline="\n").write(head + body)
    io.open(os.path.join(PLAZA, "TopsDict.gs"), "w", encoding="utf-8", newline="\n").write(dict_gs)
    print("→ tools/plaza/gas/TopsPower.gs、TopsDict.gs（同樂廣場後端副本）")
