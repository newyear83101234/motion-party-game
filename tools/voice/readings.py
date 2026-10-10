"""讀音工具：遊戲注音（台灣讀音，js/zhuyin-words.js 的 z）↔ 拼音，以及「聽寫拼音 vs 正確讀音」比對。

- 詞庫裡的詞／短語：正確讀音一律用遊戲的 z（台灣讀音，權威）。
- 句子裡不是詞庫詞的字：用 pypinyin，再用 OVERRIDE 修正破音字（逐字人工確認過，見 OVERRIDE 註解）。
"""
import re
import unicodedata
from pathlib import Path

from pypinyin import Style, lazy_pinyin
from pypinyin.pinyin_dict import pinyin_dict
from pypinyin.style import convert as style_convert

ROOT = Path(__file__).resolve().parents[2]
WSRC = (ROOT / "js" / "zhuyin-words.js").read_text(encoding="utf-8")
TONES = "ˊˇˋ˙"

# ---------- 注音 → 拼音（用 pypinyin 全部讀音反查建表）----------
_Z2P = {}
for v in pinyin_dict.values():
    for py in v.split(","):
        try:
            bo = style_convert(py, Style.BOPOMOFO, strict=True)
            t3 = style_convert(py, Style.TONE3, strict=True, neutral_tone_with_five=True)
        except Exception:
            continue
        base = "".join(c for c in bo if c not in TONES)
        tone = next((TONES.index(c) + 2 for c in bo if c in TONES), 1)
        tone = 5 if tone == 5 else tone
        nb = re.sub(r"\d", "", t3)
        _Z2P.setdefault(base, nb)


def zsyl_to_py(s):
    base = "".join(c for c in s if c not in TONES)
    t = next((c for c in s if c in TONES), "")
    tone = {"": 1, "ˊ": 2, "ˇ": 3, "ˋ": 4, "˙": 5}[t]
    if base not in _Z2P:
        raise KeyError(f"注音查不到拼音：{s}")
    return f"{_Z2P[base]}{tone}"


def z_to_py(z):
    return [zsyl_to_py(s) for s in z.split(" ")]


WORDS = {h: z for h, z in re.findall(r'\{ h: "([^"]+)", z: "([^"]+)"', WSRC)}   # 含 PHRASES

# 句子裡的破音字：pypinyin 預設值不對、或要確定用台灣讀音的（2026-10-10 人工逐字確認）
OVERRIDE = {
    "還": "hai2",   # 來釣魚還是去尋寶
    "都": "dou1",   # 朋友都孵出來了
    "會": "hui4",   # 你好會拼喔、會來店裡
    "要": "yao4",   # 我要…、蛋要孵出來了
    "好": "hao3",
    "了": "le5",
    "的": "de5",
    "得": "de5",
    "喔": "o1",     # 台灣 ㄛ
    "囉": "luo5",
    "吧": "ba5",
    "呢": "ne5",
    "哇": "wa1",
    "子": "zi5",
    "長": "chang2",
    "覺": "jiao4",
    "乾": "gan1",
    "兩": "liang3",
    "一": "yi1",
    "相": "xiang1",
    "數": "shu4",
    "張": "zhang1",
    "對": "dui4",
    "樂": "le4",
    "暫": "zhan4|zan4",   # 台灣標準 ㄓㄢˋ，口語常唸 ㄗㄢˋ，兩個都收
}
MARKS = "\u0304\u0301\u030c\u0300"   # 一二三四聲的組合符號
DIAER = "\u0308"   # 分音符（ü 的兩點）
SOFT = set("喔囉吧呢哇啊呀哦嗎")   # 語助詞：AI 聽寫常寫成不同字或不同韻母，只比有沒有這個音節


def expected(text):
    """回傳 [(字, 拼音)]；詞庫詞用遊戲注音（最長比對），其餘逐字 pypinyin＋OVERRIDE。"""
    t = re.sub(r"[，！？。、\s]", "", text)
    out, i = [], 0
    keys = sorted(WORDS, key=len, reverse=True)
    while i < len(t):
        hit = next((k for k in keys if t.startswith(k, i)), None)
        if hit:
            out += list(zip(hit, z_to_py(WORDS[hit])))
            i += len(hit)
            continue
        ch = t[i]
        py = OVERRIDE.get(ch) or lazy_pinyin(ch, style=Style.TONE3, neutral_tone_with_five=True)[0]
        out.append((ch, py))
        i += 1
    return out


def norm_py(p):
    """聽寫拼音標準化：去聲調符號（轉數字）、ü→v、j/q/x/y 後的 v→u。"""
    p = (p or "").lower().replace("u:", "v").replace("ü", "v")
    syl = []
    for tok in re.findall(r"[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜv]+[1-5]?", p):
        tone = None
        m = re.search(r"([1-5])$", tok)
        if m:
            tone = int(m.group(1)); tok = tok[:-1]
        d = unicodedata.normalize("NFD", tok)
        for c in d:
            if c in MARKS and tone is None:
                tone = MARKS.index(c) + 1
        d = d.replace("u" + DIAER, "v")                  # ǜ/ǘ 拆開後是 u＋分音符
        base = "".join(c for c in d if not unicodedata.combining(c)).replace("ü", "v")
        base = re.sub(r"^([jqxy])v", r"\1u", base)
        syl.append((base, tone))
    return syl


def split_py(p):
    m = re.match(r"([a-zv]+)([1-5])$", p)
    return m.group(1), int(m.group(2))


def compare(text, heard_pinyin):
    """回傳 (hard 問題清單, soft 問題清單)。
    hard：音節數不同、聲母韻母不同、聲調不同（扣掉三聲變調、一的變調）。
    soft：該唸本調卻唸成輕聲（大陸腔特徵，例如 星星 xing1 xing5）。"""
    exp = expected(text)
    got = norm_py(heard_pinyin)
    hard, soft = [], []
    if len(exp) != len(got):
        return [f"音節數不同：應 {len(exp)}（{' '.join(p for _, p in exp)}），聽到 {len(got)}（{heard_pinyin}）"], []
    for k, ((ch, ep), (gb, gt)) in enumerate(zip(exp, got)):
        alts = [split_py(x) for x in ep.split("|")]
        eb, et = next(((b, t) for b, t in alts if b == gb), alts[0])
        if ch in SOFT:
            continue
        if eb != gb:
            hard.append(f"{ch} 應 {ep} 聽到 {gb}{gt or ''}")
            continue
        if gt is None or gt == et or et == 5:
            continue
        nxt = split_py(exp[k + 1][1].split("|")[0])[1] if k + 1 < len(exp) else None
        if et == 3 and gt == 2 and nxt == 3:          # 三聲連讀變調
            continue
        if ch == "一" and gt in (1, 2, 4):
            continue
        if gt == 5:
            soft.append(f"{ch} 應 {ep} 唸成輕聲")
            continue
        hard.append(f"{ch} 應 {ep} 聽到 {gb}{gt}")
    return hard, soft
