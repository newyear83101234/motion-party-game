# -*- coding: utf-8 -*-
"""注音戰鬥陀螺：建常用字表 → js/zhuyin-tops-dict.json（＋ Apps Script 用的 tools/tops/gas/*.gs）

用法（專案根目錄）：PYTHONIOENCODING=utf-8 python tools/tops/build_dict.py
  可重跑；下載的原始資料與字形量測結果放快取資料夾（預設 %TEMP%\\zy-tops-cache，環境變數 ZY_TOPS_CACHE 可改）。

資料來源（都可再散布，授權與出處詳見 docs/zhuyin-tops-data.md；**不用萌典**）：
  - 讀音（台灣注音）＋字頻＋每個讀音的頻率：McBopomofo 小麥注音輸入法詞庫（MIT License，
    © 2011-2026 Mengjuei Hsieh et al.；詞庫源自 libtabe，BSD 授權），固定在 commit MCB_COMMIT。
  - 常用字範圍：Unicode Unihan 15.0.0 的 kBigFive（Big5 常用字區 A440–C67E；Unicode License V3）。
  - 能力值：Noto Sans TC（SIL Open Font License 1.1）字形用 headless Chromium 畫 64×64 量出來（tools/tops/measure_glyphs.js）。
  - 另外強制收進遊戲詞庫 js/zhuyin-words.js 的字與讀音（人工校對過的台灣讀音，例：亞 ㄧㄚˋ）。

輸出格式（js/zhuyin-tops-dict.json；解碼在 js/zhuyin-tops-power.js 的 decodeDict）：
  chars  常用字（字頻高→低）
  stats  每字 8 位數字＝重量、穩定、攻擊、防禦各 2 位（01–99），跟 chars 同順序
  prim   每字 2 個字元＝主要讀音在 syl 的編號（64 進位，字母表 B64）
  syl    所有音節（含聲調；一聲不標、輕聲 ˙ 在尾），cand 跟它同順序
  cand   該音節的候選字（該讀音的頻率高→低；破音字依「該讀音」列）
"""
import collections, hashlib, io, json, os, re, subprocess, sys, tempfile, urllib.request, zipfile

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.environ.get("ZY_TOPS_CACHE") or os.path.join(tempfile.gettempdir(), "zy-tops-cache")
OUT = os.path.join(ROOT, "js", "zhuyin-tops-dict.json")
MCB_COMMIT = "be6564acad6c4d3265c34a2e1a872d80f9db6068"   # 2026-09-29
MCB_FILES = ["LICENSE.txt", "Source/Data/BPMFBase.txt", "Source/Data/BPMFMappings.txt", "Source/Data/phrase.occ"]
UNIHAN_URL = "https://www.unicode.org/Public/15.0.0/ucd/Unihan.zip"
FONT_LOCAL = r"C:\Windows\Fonts\NotoSansTC-VF.ttf"
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf"
B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-"

# 範圍：Big5 常用字區裡「字頻 ≥ MIN_L1」的字，加上常用字區外但很常見（≥ MIN_OTHER）的字（香菇的「菇」、獼猴的「獼」…）
MIN_L1, MIN_OTHER = 12, 150
# 讀音要留下：該讀音頻率 ≥ max(READ_ABS, READ_REL × 該字總頻率)，或是該字最常見的讀音（去掉「期 ㄐㄧ」這種幾乎沒人用的讀音）
READ_ABS, READ_REL = 2, 0.003

INITIALS = "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ"
MEDIALS = "ㄧㄨㄩ"
FINALS = "ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ"
TONES = "ˊˇˋ˙"
SYL_RE = re.compile("^[%s]?[%s]?[%s]?[%s]?$" % (INITIALS, MEDIALS, FINALS, TONES))


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print("下載", url)
    with urllib.request.urlopen(url, timeout=120) as r, open(dest + ".part", "wb") as f:
        f.write(r.read())
    os.replace(dest + ".part", dest)
    return dest


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


# ---------- 1. 原始資料 ----------
mcb = os.path.join(CACHE, "mcbopomofo-" + MCB_COMMIT[:10])
for f in MCB_FILES:
    fetch(f"https://raw.githubusercontent.com/openvanilla/McBopomofo/{MCB_COMMIT}/{f}", os.path.join(mcb, os.path.basename(f)))
uzip = fetch(UNIHAN_URL, os.path.join(CACHE, "Unihan-15.0.0.zip"))
font = os.environ.get("ZY_TOPS_FONT") or (FONT_LOCAL if os.path.exists(FONT_LOCAL) else fetch(FONT_URL, os.path.join(CACHE, "NotoSansTC-wght.ttf")))
font_sha = sha256(font)

base = collections.defaultdict(list)          # 字 → 讀音（McBopomofo 順序）
big5 = set()
for line in io.open(os.path.join(mcb, "BPMFBase.txt"), encoding="utf-8"):
    p = line.split()
    if len(p) < 5 or len(p[0]) != 1 or not ("\u3400" <= p[0] <= "\u9fff"):
        continue
    if SYL_RE.match(p[1]) and p[1] not in base[p[0]]:
        base[p[0]].append(p[1])
    if p[-1] == "big5":
        big5.add(p[0])
occ = {}
for line in io.open(os.path.join(mcb, "phrase.occ"), encoding="utf-8"):
    p = line.rstrip("\n").rsplit(" ", 1)
    if len(p) == 2 and p[1].isdigit():
        occ[p[0]] = int(p[1])
maps = collections.defaultdict(list)
for line in io.open(os.path.join(mcb, "BPMFMappings.txt"), encoding="utf-8"):
    p = line.split()
    if len(p) >= 3 and len(p) - 1 == len(p[0]):
        maps[p[0]].append(p[1:])
lvl1 = set()
with zipfile.ZipFile(uzip) as z:
    for line in z.read("Unihan_OtherMappings.txt").decode("utf-8").splitlines():
        if "\tkBigFive\t" in line:
            cp, _, v = line.split("\t")
            if any(0xA440 <= int(x.strip("'"), 16) <= 0xC67E for x in v.split()):
                lvl1.add(chr(int(cp[2:], 16)))

# ---------- 2. 字頻、每個讀音的頻率 ----------
tot = collections.Counter()                    # 字出現次數（所有詞裡的總和）
for w, c in occ.items():
    for ch in w:
        tot[ch] += c
rf = collections.defaultdict(float)             # (字, 讀音) 的頻率：詞的次數照該詞每種讀法平分
for w, rs in maps.items():
    c = occ.get(w, 0)
    if c:
        for r in rs:
            for ch, rr in zip(w, r):
                rf[(ch, rr)] += c / len(rs)
for ch, rs in base.items():                     # 單字詞：算給最常見的讀音
    c = occ.get(ch, 0)
    if c and rs:
        top = max(rs, key=lambda r: rf[(ch, r)]) if any(rf[(ch, r)] for r in rs) else rs[0]
        rf[(ch, top)] += c

# 遊戲詞庫（人工校對的台灣讀音）：這些字、這些讀音一定要收
wsrc = io.open(os.path.join(ROOT, "js", "zhuyin-words.js"), encoding="utf-8").read()
force = set()
for h, z in re.findall(r'\{ h: "([^"]+)", z: "([^"]+)"', wsrc):
    syls = z.split()
    if len(syls) == len(h):
        for ch, s in zip(h, syls):
            force.add((ch, s))
# 陀螺遊戲本身的例句與隨機靈感（js/zhuyin-tops.js 的 INSPIRE；"字:注音" 格式）
tsrc_path = os.path.join(ROOT, "js", "zhuyin-tops.js")
if os.path.exists(tsrc_path):
    tsrc = io.open(tsrc_path, encoding="utf-8").read()
    for h, z in re.findall(r'\["([\u3400-\u9fff]{5})", "([ㄅ-ㄩˊˇˋ˙ ]+)"\]', tsrc):
        syls = z.split()
        if len(syls) == 5:
            for ch, s in zip(h, syls):
                force.add((ch, s))

# ---------- 3. 選字 ----------
pick = [c for c in lvl1 if tot[c] >= MIN_L1 and base.get(c)]
pick += [c for c in big5 if c not in lvl1 and tot[c] >= MIN_OTHER and base.get(c)]
pick = set(pick) | {ch for ch, _ in force}
chars = sorted(pick, key=lambda c: (-tot[c], c))
print(f"常用字 {len(chars)} 字（Big5 常用字區 {sum(1 for c in chars if c in lvl1)}、區外 {sum(1 for c in chars if c not in lvl1)}）")

readings = {}
for c in chars:
    rs = list(base.get(c, []))
    for ch, s in force:
        if ch == c and s not in rs:
            rs.append(s)
    total = sum(rf[(c, r)] for r in rs) or 1
    top = max(rs, key=lambda r: (rf[(c, r)], -rs.index(r)))
    keep = [r for r in rs if r == top or (c, r) in force or rf[(c, r)] >= max(READ_ABS, READ_REL * total)]
    readings[c] = (keep, top)

for ch, s in sorted(force):
    assert s in readings[ch][0], f"遊戲詞庫讀音沒收到：{ch} {s}"

# ---------- 4. 候選字表 ----------
cand = collections.defaultdict(list)
for c in chars:
    for r in readings[c][0]:
        cand[r].append(c)
rank = {c: i for i, c in enumerate(chars)}
for r in cand:
    cand[r].sort(key=lambda c: (-rf[(c, r)], rank[c]))
syl = sorted(cand)
assert len(syl) < 64 * 64
sid = {s: i for i, s in enumerate(syl)}
for s in syl:
    assert SYL_RE.match(s) and s.strip(TONES), s

# ---------- 5. 字形量測 → 能力值 ----------
listhash = hashlib.sha256(("".join(chars) + font_sha).encode("utf-8")).hexdigest()[:16]
mpath = os.path.join(CACHE, f"glyph-{listhash}.json")
if not os.path.exists(mpath):
    lp = os.path.join(CACHE, f"chars-{listhash}.txt")
    io.open(lp, "w", encoding="utf-8").write("".join(chars))
    subprocess.run(["node", os.path.join(ROOT, "tools", "tops", "measure_glyphs.js"), lp, font, mpath], check=True)
M = json.load(io.open(mpath, encoding="utf-8"))
assert M["chars"] == "".join(chars)
met = M["metrics"]
assert all(m is not None for m in met), "有字畫不出來（字型缺字？）"


def pct(vals):
    """名次百分位 → 0..1（同分取平均名次）"""
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    out = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        r = (i + j) / 2 / (len(vals) - 1)
        for k in range(i, j + 1):
            out[order[k]] = r
        i = j + 1
    return out


col = lambda k: [m[k] for m in met]
ink, symLR, symUD, cOff, perim, corner, hull = (col(k) for k in range(7))
pLR, pUD, pC = pct(symLR), pct(symUD), pct([-x for x in cOff])
pPer, pCor = pct(perim), pct(corner)
def decor(y, w, keep):
    """跟重量的相關打折：y 對 w 做直線迴歸取殘差，再跟原值依 keep 比例混合（全部照筆畫多寡排，筆畫多的字樣樣第一，對戰就沒變化了）"""
    n = len(y); my, mw = sum(y) / n, sum(w) / n
    b = sum((a - my) * (c - mw) for a, c in zip(y, w)) / sum((c - mw) ** 2 for c in w)
    res = [a - my - b * (c - mw) for a, c in zip(y, w)]
    sd = lambda v: (sum(x * x for x in v) / n) ** 0.5
    sy, sr = sd([a - my for a in y]), sd(res)
    return pct([keep * (a - my) / sy + (1 - keep) * r / sr for a, r in zip(y, res)])


weight = pct(ink)
stable = decor(pct([0.4 * a + 0.25 * b + 0.35 * c for a, b, c in zip(pLR, pUD, pC)]), weight, 0.5)
attack = decor(pct([0.6 * a + 0.4 * b for a, b in zip(pPer, pCor)]), weight, 0.45)
defense = decor(pct(hull), weight, 0.35)
to99 = lambda x: 1 + int(round(98 * x))
stats = [[to99(w), to99(s), to99(a), to99(d)] for w, s, a, d in zip(weight, stable, attack, defense)]


def corr(x, y):
    n = len(x); mx, my = sum(x) / n, sum(y) / n
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y)); sxx = sum((a - mx) ** 2 for a in x); syy = sum((b - my) ** 2 for b in y)
    return sxy / (sxx * syy) ** 0.5


names = ["重量", "穩定", "攻擊", "防禦"]
cols = [[s[k] for s in stats] for k in range(4)]
print("能力相關係數：" + "、".join(f"{names[i]}×{names[j]} {corr(cols[i], cols[j]):+.2f}" for i in range(4) for j in range(i + 1, 4)))
for c in "一口田中爸強龍鬱的超":
    if c in chars:
        print(" ", c, dict(zip(names, stats[chars.index(c)])))

# ---------- 6. 輸出 ----------
enc2 = lambda i: B64[i // 64] + B64[i % 64]
data = collections.OrderedDict(
    about="注音戰鬥陀螺常用字表（tools/tops/build_dict.py 產生，請勿手改）。讀音與字頻：McBopomofo 詞庫（MIT License，© 2011-2026 Mengjuei Hsieh et al.；源自 libtabe，BSD）；"
          "常用字範圍：Unicode Unihan 15.0.0 kBigFive（Unicode License V3）；能力值：Noto Sans TC（SIL OFL 1.1）字形量測。詳見 docs/zhuyin-tops-data.md",
    v=1, font=font_sha[:12], n=len(chars),
    chars="".join(chars),
    stats="".join("%02d%02d%02d%02d" % tuple(s) for s in stats),
    prim="".join(enc2(sid[readings[c][1]]) for c in chars),
    syl=syl,
    cand=["".join(cand[s]) for s in syl],
)
txt = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
io.open(OUT, "w", encoding="utf-8", newline="\n").write(txt)
import gzip
print(f"→ {os.path.relpath(OUT, ROOT)}：{len(chars)} 字、{len(syl)} 個音節、候選 {sum(len(cand[s]) for s in syl)} 筆；"
      f"{len(txt.encode('utf-8')) / 1024:.1f} KB（gzip {len(gzip.compress(txt.encode('utf-8'), 9)) / 1024:.1f} KB）；字型 sha256 {font_sha[:12]}")

# ---------- 7. Apps Script 版（後端重算戰力用同一份邏輯與資料） ----------
gas = os.path.join(ROOT, "tools", "tops", "build_gas.py")
if os.path.exists(gas):
    subprocess.run([sys.executable, gas], check=True)
