# -*- coding: utf-8 -*-
"""產生「畫面上每個國字的注音」字典 → js/zhuyin-ui.js

來源：zhuyin.html、js/zhuyin*.js 裡的字串（不含註解）＋詞庫 WORDS/PHRASES/FRIENDS/CATS。
讀音決定順序（台灣標準優先）：
  1. 詞庫 WORDS/PHRASES 自己標的注音（人工校對過，跟題目一致）
  2. 手動覆寫 OVERRIDE（審過的特例）
  3. 萌典（教育部《重編國語辭典》資料）有收的詞 → 用它的讀音
  4. 其餘逐字：pypinyin 依上下文挑的讀音，但必須是萌典該字的合法讀音之一；不是就改用萌典的第一個讀音
     （修正大陸讀音，例如 企 ㄑㄧˇ→ㄑㄧˋ；pypinyin 標輕聲但台灣該字沒有輕聲讀法時改回本調）
「一」「不」一律標本調（字典標法）；遊戲文案盡量不用這兩個字。
用法：python tools/build_zhuyin_ui.py          （會列出需要人工看一眼的字）
"""
import io, json, os, re, sys, time, urllib.parse, urllib.request
from pypinyin import lazy_pinyin, Style

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "_moedict_cache.json")
OUT = os.path.join(ROOT, "js", "zhuyin-ui.js")
SOURCES = ["zhuyin.html", "js/zhuyin.js", "js/zhuyin-words.js",
           "js/zhuyin-rewards.js", "js/zhuyin-dress.js",   # 10-12 寵物換裝：配件名、寵物名、家長頁機率文字、換裝畫面
           "js/zhuyin-deliver.js",   # 10-12 彩虹配送站：商品、訂單、居民台詞、結算小字
           "js/zhuyin-detective.js", "js/zhuyin-detective-bank.js",   # 10-12 詞句小偵探：介面字、台詞、題庫句子（含 enabled:false 的草稿）
           "js/zhuyin-tops.js",      # 10-12 注音戰鬥陀螺：介面字、台詞、加成名稱（小孩打的字／候選字的注音直接用 js/zhuyin-tops-dict.json，不靠這裡）
           "js/zhuyin-plaza.js",     # 10-12 小島同樂廣場：主題名稱與說明、進度句、加油貼紙、台詞
           "js/zhuyin-tower.js", "js/zhuyin-tower-core.js"]   # 10-13 挑戰燈塔：介面字、台詞、規則、24 個代號名（生肖、星座）
HAN = re.compile(r"[\u3400-\u9fff]+")
TONES = "ˊˇˋ˙"

# 審過的特例（詞或單字 → 注音，音節空白分隔、聲調在尾、輕聲 ˙ 在尾）
OVERRIDE = {
    "喔": "ㄛ",            # 句尾語氣「喔」台灣口語標 ㄛ
    "誰": "ㄕㄟˊ",          # 萌典主讀音 ㄕㄟˊ（ㄕㄨㄟˊ 為讀音）；寧次 10-10 發現標成 ㄕㄨㄟˊ
    "囉": "ㄌㄨㄛ˙",
    "哇": "ㄨㄚ",          # 驚嘆「哇！」一聲（pypinyin 給輕聲）
    # 10-10 阿葉回報＋全面複查：萌典沒收這個詞、或第一個讀音不是這裡的意思 → 照詞義指定
    "重來": "ㄔㄨㄥˊ ㄌㄞˊ",       # 清除重來：重新來過（萌典無此詞，單字會落到 ㄓㄨㄥˋ）
    "困難": "ㄎㄨㄣˋ ㄋㄢˊ",       # 課本標 ㄋㄢˊ（萌典列輕聲）
    "這台": "ㄓㄜˋ ㄊㄞˊ",         # 量詞「台」＝臺 ㄊㄞˊ（萌典「台」單字列的是天台山的 ㄊㄞ）
    "不是": "ㄅㄨˋ ㄕˋ",           # 「這不是…」；萌典第一個是名詞「不是（過錯）」ㄅㄨˋ ˙ㄕ
    "東西": "ㄉㄨㄥ ㄒㄧ˙",        # 物品（不是東邊西邊）
    "買東西": "ㄇㄞˇ ㄉㄨㄥ ㄒㄧ˙",
    "哪個": "ㄋㄚˇ ㄍㄜ˙",         # 跟「這個 ㄓㄜˋ ㄍㄜ˙」一致
    "兩個": "ㄌㄧㄤˇ ㄍㄜ˙",       # 10-12 配送站「兩個都裝上車」；量詞「個」跟這個/哪個一致標輕聲
    "挑戰": "ㄊㄧㄠˇ ㄓㄢˋ",       # 10-12 配送站「大挑戰」；台灣讀 ㄊㄧㄠˇ（單字會落到挑選的 ㄊㄧㄠ），配音也唸三聲
    "大挑戰": "ㄉㄚˋ ㄊㄧㄠˇ ㄓㄢˋ",  # 由左往右找詞會先吃到萌典的「大挑」（清代選官，ㄊㄧㄠ），所以整詞指定
    "愛著": "ㄞˋ ㄓㄜ˙",           # 10-12 偵探題「我愛你愛著你」：動詞＋著＝輕聲（單字會落到 ㄓㄨˋ）
    "送完了": "ㄙㄨㄥˋ ㄨㄢˊ ㄌㄜ˙",  # 10-12 同樂廣場「今天的貼紙送完了」：萌典「完了」是 ㄌㄧㄠˇ（完蛋了），這裡是語尾輕聲
    # 10-12 詞句小偵探（題目句的讀音就是答案，錯一個音都不行）
    "看著": "ㄎㄢˋ ㄓㄜ˙",          # 「你看著我的眼睛說」：單字會落到顯著的 ㄓㄨˋ
    "看起來": "ㄎㄢˋ ㄑㄧˇ ㄌㄞˊ",   # 「你看起來真好笑」：單字落到看守的 ㄎㄢ（跟「笑起來」的 ㄑㄧˇ ㄌㄞˊ 一致）
    "聽得": "ㄊㄧㄥ ㄉㄜ˙",          # 「你聽得好仔細」：結構助詞「得」輕聲（pypinyin 給 ㄉㄜˊ）
    "跑得": "ㄆㄠˇ ㄉㄜ˙",          # 草稿「兩隻老虎跑得快」：「虎跑」會被當地名讀 ㄆㄠˊ
    "飛得": "ㄈㄟ ㄉㄜ˙",
    "燈台": "ㄉㄥ ㄊㄞˊ",          # 草稿「小老鼠上燈台」：燈台＝燈臺（萌典「台」單字是天台山的 ㄊㄞ）
    "上燈台": "ㄕㄤˋ ㄉㄥ ㄊㄞˊ",     # 由左往右找詞會先吃到萌典的「上燈」，「台」落單 → 整詞指定
    "下燈台": "ㄒㄧㄚˋ ㄉㄥ ㄊㄞˊ",
    # 10-13 v6 難度等級（解鎖畫面的新東西說明）：動詞＋得＝結構助詞輕聲（pypinyin 給 ㄉㄜˊ）；量詞「個」跟這個／兩個一致標輕聲
    "長得像": "ㄓㄤˇ ㄉㄜ˙ ㄒㄧㄤˋ",
    "游得": "ㄧㄡˊ ㄉㄜ˙",
    "找得": "ㄓㄠˇ ㄉㄜ˙",
    "跳得": "ㄊㄧㄠˋ ㄉㄜ˙",
    "三個字": "ㄙㄢ ㄍㄜ˙ ㄗˋ",
    "十二個": "ㄕˊ ㄦˋ ㄍㄜ˙",
}

# 讀音回歸檢查：每次重建字典都要過，錯了就停（阿葉 10-10「加入詞組檢查，避免重新產生注音後又出錯」）
# 句子 → 句子裡某個詞應該的注音
MUST = [
    ("清除重來", "重來", "ㄔㄨㄥˊ ㄌㄞˊ"), ("重新開始", "重新", "ㄔㄨㄥˊ ㄒㄧㄣ"), ("困難", "困難", "ㄎㄨㄣˋ ㄋㄢˊ"),
    ("誰要玩", "誰", "ㄕㄟˊ"), ("這不是正確的備份碼", "不是", "ㄅㄨˋ ㄕˋ"), ("今天要玩哪個呢", "哪個", "ㄋㄚˇ ㄍㄜ˙"),
    ("把東西拿給客人", "東西", "ㄉㄨㄥ ㄒㄧ˙"), ("會來店裡買東西喔", "東西", "ㄉㄨㄥ ㄒㄧ˙"),
    # 10-12 詞句小偵探：題目句與選項
    ("你看著我的眼睛", "看著", "ㄎㄢˋ ㄓㄜ˙"), ("你看起來真好笑", "看起來", "ㄎㄢˋ ㄑㄧˇ ㄌㄞˊ"), ("你笑起來真好看", "好看", "ㄏㄠˇ ㄎㄢˋ"),
    ("真好笑", "好笑", "ㄏㄠˇ ㄒㄧㄠˋ"), ("你聽得好仔細", "聽得", "ㄊㄧㄥ ㄉㄜ˙"), ("跑得快", "跑得", "ㄆㄠˇ ㄉㄜ˙"), ("燈台", "燈台", "ㄉㄥ ㄊㄞˊ"),
]

cache = {}
if os.path.exists(CACHE):
    cache = json.load(io.open(CACHE, encoding="utf-8"))

def moedict(q):
    """萌典查詢（快取）：回傳該詞/字所有讀音的清單，例如 ['ㄑㄧˋ']；查無回傳 []"""
    if q in cache: return cache[q]
    url = "https://www.moedict.tw/uni/" + urllib.parse.quote(q)
    res = []
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=15) as r:
                d = json.loads(r.read().decode("utf-8"))
            res = [h["bopomofo"] for h in d.get("heteronyms", []) if h.get("bopomofo")]
            break
        except urllib.error.HTTPError as e:
            if e.code == 404: res = []; break
            time.sleep(1.5)
        except Exception:
            time.sleep(1.5)
    cache[q] = res; time.sleep(0.15)
    return res

def norm(syl):
    """pypinyin/萌典格式 → 遊戲格式：輕聲 ˙ 移到最後；去掉萌典的（讀音一）等註記與空白"""
    syl = re.sub(r"[（(].*?[)）]", "", syl).strip()
    syl = syl.replace("　", "").replace(" ", "")
    if syl.startswith("˙"): syl = syl[1:] + "˙"
    return syl

def split_reading(bpmf):
    """萌典的詞讀音 'ㄆㄥˊ ㄧㄡˇ' → ['ㄆㄥˊ','ㄧㄡˇ']（只取第一種讀法）"""
    first = re.split(r"[（(]|又音|語音|讀音", bpmf)[0]
    return [norm(x) for x in first.replace("　", " ").split() if x.strip()]

# ---------- 收集字串 ----------
def strip_js_comments(src):
    out, i, n, q = [], 0, len(src), None
    while i < n:
        c = src[i]
        if q:
            out.append(c)
            if c == "\\" and i + 1 < n: out.append(src[i + 1]); i += 2; continue
            if c == q: q = None
            i += 1; continue
        if c in "\"'`": q = c; out.append(c); i += 1; continue
        if src.startswith("//", i):
            j = src.find("\n", i); i = n if j < 0 else j; continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2); i = n if j < 0 else j + 2; continue
        out.append(c); i += 1
    return "".join(out)

runs = set()
for rel in SOURCES:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p): continue
    src = io.open(p, encoding="utf-8").read()
    if rel.endswith(".html"):
        src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
        src = re.sub(r"<script.*?</script>|<style.*?</style>", "", src, flags=re.S)
        text = re.sub(r"<[^>]+>", " ", src)
    else:
        text = strip_js_comments(src)
    for m in HAN.finditer(text): runs.add(m.group())

# 詞庫自己的讀音（最高優先）
words_src = io.open(os.path.join(ROOT, "js/zhuyin-words.js"), encoding="utf-8").read()
WORDZ = {h: z for h, z in re.findall(r'h:\s*"([^"]+)",\s*z:\s*"([^"]+)"', words_src)}

# ---------- 決定讀音 ----------
review, dictionary, chars = [], {}, {}

def char_reading(ch, ctx_reading):
    """單字：pypinyin 的上下文讀音必須是萌典合法讀音，否則改用萌典第一個"""
    legal = [norm(x) for b in moedict(ch) for x in [b] if len(split_reading(b)) == 1 for x in [split_reading(b)[0]]]
    if not legal: return ctx_reading, "萌典查無此字"
    if ctx_reading in legal: return ctx_reading, None
    if ctx_reading.endswith("˙") and not any(l.endswith("˙") for l in legal):
        return legal[0], f"台灣不讀輕聲 {ctx_reading}→{legal[0]}"
    return legal[0], f"非台灣讀音 {ctx_reading}→{legal[0]}"

def reading_of_run(run):
    if run in WORDZ: return WORDZ[run].split(" "), "詞庫"
    if run in OVERRIDE: return OVERRIDE[run].split(" "), "覆寫"
    ctx = [norm(x) for x in lazy_pinyin(run, style=Style.BOPOMOFO)]
    out, i, notes = [], 0, []
    while i < len(run):
        took = False
        for L in range(min(4, len(run) - i), 1, -1):         # 先找萌典有收的 2-4 字詞
            w = run[i:i + L]
            if w in WORDZ: out += WORDZ[w].split(" "); i += L; took = True; break
            if w in OVERRIDE: out += OVERRIDE[w].split(" "); i += L; took = True; break
            got = moedict(w)
            if got:
                syl = split_reading(got[0])
                if len(syl) == L: out += syl; i += L; took = True; notes.append(f"萌典詞「{w}」"); break
        if took: continue
        ch = run[i]
        if ch in OVERRIDE: out.append(OVERRIDE[ch]); i += 1; continue
        r, note = char_reading(ch, ctx[i])
        if note: notes.append(f"{ch}:{note}")
        out.append(r); i += 1
    return out, "；".join(notes)

for run in sorted(runs, key=lambda s: (-len(s), s)):
    syls, note = reading_of_run(run)
    if len(syls) != len(run):
        review.append(f"!! 音節數不符 {run} {syls}"); continue
    dictionary[run] = " ".join(syls)
    for ch, s in zip(run, syls): chars.setdefault(ch, s)
    multi = [ch for ch in run if len(set(norm(x) for b in moedict(ch) for x in split_reading(b)[:1])) > 1]
    if note or multi or any(c in run for c in "一不"):
        review.append(f"{run} = {' '.join(syls)}   [{note}{'；多音字:' + ''.join(multi) if multi else ''}]")

for h, z in WORDZ.items(): dictionary[h] = z                  # 詞庫一定蓋過

# 單字備用讀音（ZCHAR：只有整段不在字典時才逐字用）取「最先處理到的那段」的讀音，可能剛好是詞裡的輕聲/變讀
# → 這些字固定成單獨念時的讀音（10-12：草稿題「王老先生有塊地」讓「生」變成 ㄕㄥ˙）
CHAR_BASE = {"生": "ㄕㄥ", "樂": "ㄌㄜˋ"}               # 只固定確定的；子/頭/們這類當詞尾常念輕聲的不碰
for ch, z in CHAR_BASE.items():
    if ch in chars: chars[ch] = z

# 詞庫本身也跟萌典對一次（詞庫是人工標的，可能混到大陸讀音）
word_issues = []
for h, z in WORDZ.items():
    got = moedict(h)
    if not got:
        if len(h) == 1: continue
        word_issues.append(f"   ? 萌典查無「{h}」（詞庫標 {z}）"); continue
    cands = [" ".join(split_reading(b)) for b in got]
    if z not in cands:
        word_issues.append(f"   ✗ {h}：詞庫 {z} ／ 萌典 {' 或 '.join(cands)}")
json.dump(cache, io.open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("// 自動產生，請勿手改：python tools/build_zhuyin_ui.py\n")
    f.write("// 畫面上每段國字的注音（台灣標準：詞庫 > 覆寫 > 萌典 > pypinyin 校正）\n")
    f.write("export const ZDICT = " + json.dumps(dictionary, ensure_ascii=False, sort_keys=True) + ";\n")
    f.write("export const ZCHAR = " + json.dumps(chars, ensure_ascii=False, sort_keys=True) + ";\n")
print(f"字串段 {len(runs)}，字典 {len(dictionary)} 筆，單字 {len(chars)} 個 → {OUT}")
# 讀音回歸檢查（MUST）：在字典裡找含這句的字串段，取出該詞位置的注音比對；含「台」的字串段另外檢查不能是 ㄊㄞ
bad = []
for sent, word, want in MUST:
    hits = [r for r in dictionary if sent in r]
    if not hits: continue                                  # 畫面上已經沒有這句就跳過
    for r in hits:
        syl = dictionary[r].split(" "); i = r.index(sent) + sent.index(word)
        got = " ".join(syl[i:i + len(word)])
        if got != want: bad.append(f"「{r}」裡的「{word}」是 {got}，應為 {want}")
for r, z in dictionary.items():
    for i, ch in enumerate(r):
        if ch == "台" and z.split(" ")[i] != "ㄊㄞˊ": bad.append(f"「{r}」裡的「台」是 {z.split(' ')[i]}，應為 ㄊㄞˊ")
if bad:
    print("!!!! 讀音回歸檢查失敗 !!!!"); [print("   " + b) for b in bad]; sys.exit(1)
print(f"讀音回歸檢查：{len(MUST)} 組＋台 全過")
print("---- 詞庫 vs 萌典（✗＝讀音不同要人工判斷）----")
for r in word_issues: print(r)
if "--all" in sys.argv:
    print("---- 請看一眼（多音字／台灣修正／一不）----")
    for r in review: print(r)
else:
    flagged = [r for r in review if ("非台灣" in r or "不讀輕聲" in r or "查無" in r or "!!" in r or "一" in r.split(" = ")[0] or "不" in r.split(" = ")[0])]
    print(f"---- 需要注意的 {len(flagged)} 筆（全部清單加 --all）----")
    for r in flagged: print(r)
