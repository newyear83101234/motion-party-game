"""盤點注音小島所有會唸出來的句子 → tools/voice/lines.json

用法：python tools/voice/build_lines.py
- 詞庫（WORDS / PHRASES / FRIENDS）直接從 js/zhuyin-words.js 解析。
- 固定句子由人工從 js/zhuyin.js 抄出，並逐句斷言「原始碼裡真的有這段字」，原始碼改了這裡會報錯（防漂移）。
- 動態句子（帶 ${n} / 名字 / 詞）展開成「可預先錄好」的完整句子，展開規則見 DYNAMIC。
- 兩岸讀音風險：遊戲注音（台灣讀音）vs pypinyin（大陸普通話讀音）逐音節比對，不同的標 tw_risk。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = (ROOT / "js" / "zhuyin.js").read_text(encoding="utf-8")
WSRC = (ROOT / "js" / "zhuyin-words.js").read_text(encoding="utf-8")
OUT = Path(__file__).resolve().parent / "lines.json"

CN_NUM = ["零", "一", "兩", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五",
          "十六", "十七", "十八", "十九", "二十", "二十一", "二十二", "二十三", "二十四", "二十五", "二十六", "二十七", "二十八", "二十九", "三十"]


def block(name):
    m = re.search(r"export const " + name + r" = \[(.*?)\n\];", WSRC, re.S)
    return m.group(1)


WORDS = [dict(h=h, z=z, c=c) for h, z, c in re.findall(r'\{ h: "([^"]+)", z: "([^"]+)", e: "[^"]*", c: "(\w+)" \}', block("WORDS"))]
PHRASES = [dict(h=h, z=z) for h, z in re.findall(r'\{ h: "([^"]+)", z: "([^"]+)"', block("PHRASES"))]
FRIENDS = re.findall(r'name: "([^"]+)"', block("FRIENDS"))
SLOTS = re.findall(r'name: "([^"]+)"', re.search(r"export const SLOTS = \[(.*?)\];", SRC).group(1))
MODES = re.findall(r'^\s+(\w+):\s+\{ rounds: \d+, need: (\d+),\s+intro: "([^"]+)"', SRC, re.M)
PRAISE = json.loads(re.search(r"const PRAISE = (\[.*?\]);", SRC).group(1))
EGG_STARS = int(re.search(r"const EGG_STARS = (\d+);", SRC).group(1))
MATCH_MAX_PAIRS = max(int(n) for n in re.findall(r"\{ n: (\d+), label:", SRC)) // 2
ROUNDS_MAX = max(int(r) for r in re.findall(r"rounds: (\d+)", SRC))
NEED_MAX = max(int(n) for _, n, _ in MODES)

assert len(WORDS) >= 130 and PHRASES and FRIENDS and SLOTS and len(MODES) >= 8, "詞庫解析失敗，zhuyin-words.js 格式變了？"

lines = []


def add(id_, text, cat, src, tts=None, **kw):
    d = dict(id=id_, text=text, cat=cat, src=src)
    if tts and tts != text:
        d["tts_text"] = tts
    d.update(kw)
    lines.append(d)


def must(snippet):
    if snippet not in SRC:
        sys.exit(f"原始碼找不到：{snippet}（zhuyin.js 改過了，請更新 build_lines.py）")


# ---- 1. 開場語（第一次進模式唸）----
for m, need, intro in MODES:
    add(f"intro_{m}", intro, "intro", "MODES.intro（zhuyin.js:12-19）")

# ---- 2. 稱讚（連對 3 題）----
for i, p in enumerate(PRAISE):
    add(f"praise_{i + 1}", p, "praise", "PRAISE（zhuyin.js:21）")

# ---- 3. 嚮導（貓頭鷹）固定台詞 ----
GUIDE = [("guide_hello", "你好！快來選遊戲玩吧！"), ("guide_more", "再收集幾張貼紙，就能開新遊戲喔！"),
         ("guide_which", "今天要玩哪個呢？"), ("guide_growing", "貼紙越來越多了！"), ("guide_fishhunt", "來釣魚還是去尋寶？")]
for i, t in GUIDE:
    must(t); add(i, t, "guide", "renderMenu / showResult（zhuyin.js:782,817）")

# ---- 4. 其他固定句 ----
for i, t, c, s in [("sys_pause", "暫停", "system", "zhuyin.js:829 確認離開"),
                   ("match_allfound", "全部找到了！", "result", "zhuyin.js:541 翻牌全部配對完")]:   # 10-11：「蛋要孵出來了！」隨孵蛋改扭蛋拿掉
    if f'say("{t}")' not in SRC and f'talk("{t}")' not in SRC: must(f'say("{t}")')   # 10-11 說明類改用 talk()
    add(i, t, c, s)

# ---- 4b. 10-11 新增：再試一次、一聲提示、泡泡救援灣、天氣、新市區 ----
BSRC = (ROOT / "js" / "zhuyin-bubble.js").read_text(encoding="utf-8")
for i, t, c in [("retry_banner", "剛剛卡住的，再試一次！", "system"), ("tone1_tip", "第一聲不用加符號，按這個空白格就好", "system"),
                ("bubble_win", "小企鵝都救出來了，好厲害！", "result"), ("bubble_full", "泡泡太多了，我們再試一次！", "system"),
                ("wx_sunny", "今天是晴天，太陽好溫暖！", "guide"), ("wx_cloudy", "今天是陰天，雲好多喔！", "guide"), ("wx_rain", "下雨了！滴答滴答！", "guide"),
                ("wx_storm", "打雷了！轟隆隆！", "guide"), ("wx_typhoon", "颱風來了！大家要待在家裡喔！", "guide"), ("wx_rainbow", "雨停了！看，天上有彩虹！", "guide"),
                ("town_police", "警察局！警車出動巡邏囉！", "guide"), ("town_fire", "消防局！消防車出動囉！", "guide"), ("town_hospital", "醫院！救護車出發囉！", "guide"),
                ("town_school", "學校！叮噹叮噹，上課囉！", "guide"), ("town_here", "這裡是新市區！", "guide"), ("town_locked", "收集更多貼紙，就能蓋好囉！", "guide"),
                ("fire_start", "失火了！快叫消防車！", "guide"), ("fire_tap", "消防車馬上來！", "guide"), ("fire_out", "火熄滅了，謝謝消防員！", "guide"),
                ("ph_dusk1", "太陽要下山囉！", "guide"), ("ph_dusk2", "天空變成橘色了！", "guide"), ("ph_night1", "天黑了，路燈亮起來了！", "guide"),   # 10-11 日夜時鐘（PHASE_LINES）
                ("ph_night2", "月亮出來了，好漂亮！", "guide"), ("ph_dawn1", "天快亮了，早安！", "guide"), ("ph_dawn2", "太陽公公要起床囉！", "guide")]:
    must(t); add(i, t, c, "zhuyin.js（10-11）")
for i, t in [("bubble_swap", "點一下泡泡，可以換一顆喔！"), ("bubble_intro1", "三個一樣的連在一起，就會破掉喔！把小企鵝救出來！")]:
    if t.split("！")[0] not in BSRC: sys.exit(f"zhuyin-bubble.js 找不到：{t}")
    add(i, t, "guide", "zhuyin-bubble.js（10-11）")
# 泡泡上的注音符號：唸符號的名稱（台灣念法：ㄅ＝玻、ㄆ＝坡、ㄇ＝摸）
for i, (sym, rd) in enumerate([("ㄅ", "玻"), ("ㄆ", "坡"), ("ㄇ", "摸")]):
    add(f"sym_{i + 1}", sym, "word", "zhuyin-bubble.js SYMS", tts=rd)
# ---- 4c. 10-11 扭蛋機與 28 隻寵物 ----
RWSRC = (ROOT / "js" / "zhuyin-rewards.js").read_text(encoding="utf-8")
PETS_BLOCK = RWSRC.split("export const PETS = [")[1].split("];\nexport const PET")[0]
PETS28 = re.findall(r'\["(\w+)", "([^"]+)"\]|\{ id: "(\w+)", name: "([^"]+)"', PETS_BLOCK)
PET_NAMES = [b or d for a, b, c, d in PETS28]
assert len(PET_NAMES) == 28, f"寵物名單解析失敗：{len(PET_NAMES)}"
for i, t in [("gacha_open", "投一枚扭蛋幣，轉一轉！"), ("gacha_nocoin", "收集星星，就能拿到扭蛋幣喔！"), ("gacha_dup", "換成點心囉！"),
             ("gacha_decor", "小島多了一個新裝飾！"), ("gacha_treats", "拿到點心了！"), ("town_open", "橋蓋好了！新市區開放囉！")]:
    must(t); add(i, t, "guide", "zhuyin.js 扭蛋機（10-11）")
for k, nm in enumerate(["警察局", "消防局", "醫院", "學校"]):
    add(f"town_built_{k + 1}", f"新市區的{nm}蓋好了！", "guide", "zhuyin.js civicEvent built")
must('p.name + "來了！"'); must('`${p.name}${g.fed.grew === 3 ? "變成超級" : "長大"}了！`')
word_set0 = {w["h"] for w in WORDS}
for k, nm in enumerate(PET_NAMES):
    add(f"pet_come_{k + 1}", nm + "來了！", "hatch", "zhuyin.js spinGacha")
    add(f"pet_grow_{k + 1}", nm + "長大了！", "guide", "zhuyin.js rewardStrip")
    add(f"pet_super_{k + 1}", nm + "變成超級了！", "guide", "zhuyin.js rewardStrip")
    if nm not in word_set0 and nm not in FRIENDS:
        add(f"pet_name_{k + 1}", nm, "friend", "zhuyin.js 動物朋友圖鑑／小島點寵物")

# 寵物不舒服／好了（新市區救護車）：每位朋友各一句
must('who + "不舒服，救護車來了！"'); must('who + "好了，謝謝醫生！"')
for i, nm in enumerate(FRIENDS):
    add(f"sick_{i + 1}", nm + "不舒服，救護車來了！", "guide", "zhuyin.js civicEvent")
    add(f"healed_{i + 1}", nm + "好了，謝謝醫生！", "guide", "zhuyin.js civicEvent")

# ---- 5. 動態句：全部展開成完整句子 ----
DYNAMIC = []
must("再收集 ${MODES[m].need - stickerCount()} 張貼紙就可以玩囉！")
DYNAMIC.append(dict(template="再收集 ${n} 張貼紙就可以玩囉！", src="zhuyin.js:295 點還沒解鎖的模式",
                    range=f"n = 1..{NEED_MAX}（解鎖門檻最高 {NEED_MAX} 張）",
                    suggestion=f"展開成 {NEED_MAX} 句完整句子預錄（數字用國字，二→兩）。或改寫成「再收集一些貼紙就可以玩囉！」＋畫面顯示數字，只要 1 句。"))
for n in range(1, NEED_MAX + 1):
    add(f"unlock_need_{n}", f"再收集 {n} 張貼紙就可以玩囉！", "dynamic", "zhuyin.js:295", tts=f"再收集{CN_NUM[n]}張貼紙就可以玩囉！", n=n)

must("拿到 ${earned.length} 張新貼紙！")
nmax = max(ROUNDS_MAX, MATCH_MAX_PAIRS)
DYNAMIC.append(dict(template="拿到 ${n} 張新貼紙！", src="zhuyin.js:763 結算畫面",
                    range=f"n = 1..{nmax}（一般模式最多 {ROUNDS_MAX} 題；翻牌 24 張＝{MATCH_MAX_PAIRS} 對）",
                    suggestion=f"展開成 {nmax} 句預錄。"))
for n in range(1, nmax + 1):
    add(f"result_stickers_{n}", f"拿到 {n} 張新貼紙！", "dynamic", "zhuyin.js:763", tts=f"拿到{CN_NUM[n]}張新貼紙！", n=n)

must("再 ${EGG_STARS - RW.jarLeft(save.rw, save.stars)} 顆星星就可以扭蛋囉！")
DYNAMIC.append(dict(template="再 ${n} 顆星星就可以扭蛋囉！", src="zhuyin.js tryHatch（10-11 孵蛋改扭蛋）",
                    range=f"n = 1..{EGG_STARS}", suggestion=f"展開成 {EGG_STARS} 句預錄。"))
for n in range(1, EGG_STARS + 1):
    add(f"coin_need_{n}", f"再 {n} 顆星星就可以扭蛋囉！", "dynamic", "zhuyin.js tryHatch", tts=f"再{CN_NUM[n]}顆星星就可以扭蛋囉！", n=n)

must("${p.name}，歡迎回來！")
DYNAMIC.append(dict(template="${存檔位名字}，歡迎回來！", src="zhuyin.js:837 換人玩", range=" / ".join(SLOTS),
                    suggestion=f"展開成 {len(SLOTS)} 句預錄。"))
for i, nm in enumerate(SLOTS):
    add(f"welcome_slot{i + 1}", f"{nm}，歡迎回來！", "dynamic", "zhuyin.js:837")

if 'f.name + "來了，會來店裡買東西喔！"' not in SRC: pass   # 10-11 起孵蛋改走扭蛋機（寵物「X來了！」），舊句保留音檔
DYNAMIC.append(dict(template="${朋友}來了，會來店裡買東西喔！", src="zhuyin.js:789 孵蛋",
                    range="FRIENDS[4..] 依序孵出：" + "、".join(FRIENDS[4:]),
                    suggestion=f"展開成 {len(FRIENDS) - 4} 句預錄（前 4 隻一開始就在，不會孵）。"))
for i, nm in enumerate(FRIENDS[4:]):
    add(f"hatch_friend_{i + 5}", f"{nm}來了，會來店裡買東西喔！", "dynamic", "zhuyin.js:789")

must("say(f.name)")
DYNAMIC.append(dict(template="${朋友名字}", src="zhuyin.js:201 點 3D 小島上的朋友", range="、".join(FRIENDS),
                    suggestion="名字跟詞庫重複的（熊貓、企鵝、青蛙）直接共用詞庫音檔；其餘 5 個另錄。"))
word_set = {w["h"] for w in WORDS}
for i, nm in enumerate(FRIENDS):
    if nm not in word_set:
        add(f"friend_{i + 1}", nm, "friend", "zhuyin.js:201")

foods = [w for w in WORDS if w["c"] == "food"]
must('"我要" + q.word.h'); must('q.word.h + "，謝謝你！"')
DYNAMIC.append(dict(template="我要${食物}", src="zhuyin.js:229 點餐模式題目（＋提示鈕重唸）", range=f"{len(foods)} 個 food 類詞",
                    suggestion=f"展開成 {len(foods)} 句整句預錄（拼接「我要」＋詞會有斷音感，整句錄比較自然，量也不大）。"))
DYNAMIC.append(dict(template="${食物}，謝謝你！", src="zhuyin.js:376 點餐答對", range=f"{len(foods)} 個 food 類詞",
                    suggestion=f"展開成 {len(foods)} 句整句預錄。"))
for w in foods:
    add(f"order_want_{w['h']}", "我要" + w["h"], "order", "zhuyin.js:229")
for w in foods:
    add(f"order_thanks_{w['h']}", w["h"] + "，謝謝你！", "order", "zhuyin.js:376")

must('say("找到了，" + target.h)')
DYNAMIC.append(dict(template="找到了，${詞或短語}", src="zhuyin.js:460 尋寶答對",
                    range=f"全部 {len(WORDS)} 詞＋{len(PHRASES)} 個短語＝{len(WORDS) + len(PHRASES)} 種",
                    suggestion="不要展開（149 句太多）：改成兩段播放「找到了！」＋該詞音檔（詞本來就要錄），逗號處本來就有停頓，拼起來不突兀。只多錄 1 句。"))
add("hunt_found", "找到了！", "hunt", "zhuyin.js:460（改寫：前綴）", note="播放時接在詞音檔前面")

# ---- 6. 學習詞（題目、答對、圖鑑、翻牌都唸這些）----
from pypinyin import pinyin, Style  # noqa: E402

TONE_MARKS = "ˊˇˋ˙"
CROSS_STRAIT = ["企：", "蝸："]   # 確定是兩岸標準讀音不同的字；其餘差異是 pypinyin 破音字判斷，但 TTS 一樣可能挑錯


def norm(s):
    t = next((c for c in s if c in TONE_MARKS), "")
    return "".join(c for c in s if c not in TONE_MARKS), t


def tw_risk(h, z):
    """遊戲注音（台灣）vs pypinyin（大陸）比對；輕聲差異不算（pypinyin 輕聲不可靠）。"""
    tw = z.split(" ")
    cn = [p[0] for p in pinyin(h, style=Style.BOPOMOFO)]
    if len(tw) != len(cn):
        return None
    diffs = []
    for ch, a, b in zip(h, tw, cn):
        (ba, ta), (bb, tb) = norm(a), norm(b)
        if "˙" in (ta, tb):
            continue
        if ba != bb or ta != tb:
            diffs.append(f"{ch}：台灣 {a} ≠ 大陸 {b}")
    return "；".join(diffs) or None


# Gemini 實測（2026-10-10，tools/voice/verify_samples.py）：「蝸牛」三個 Gemini 聲音都唸成 ㄍㄨㄛ/ㄨㄛ，
# 改送同音字「瓜牛」三個都唸成 gua1 niu2（台灣讀音）→ 生成時用 tts_text_gemini。edge-tts 本來就唸對，不用改。
GEMINI_SUB = {"蝸牛": "瓜牛"}
for w in WORDS:
    r = tw_risk(w["h"], w["z"])
    d = dict(zhuyin=w["z"], word_cat=w["c"])
    if w["h"] in GEMINI_SUB:
        d["tts_text_gemini"] = GEMINI_SUB[w["h"]]
    if r:
        cross = any(ch in r for ch in CROSS_STRAIT)
        d["tw_risk"] = ("兩岸讀音不同：" + r) if cross else ("破音字（TTS 可能挑錯音）：" + r.replace("大陸", "另一讀"))
    add(f"word_{w['h']}", w["h"], "word", "zhuyin-words.js WORDS", **d)
for p in PHRASES:
    add(f"phrase_{p['h']}", p["h"], "phrase", "zhuyin-words.js PHRASES", zhuyin=p["z"])

# ---- 統計 ----
ids = [l["id"] for l in lines]
assert len(ids) == len(set(ids)), "id 重複"
spoken = lambda l: l.get("tts_text", l["text"])
chars = sum(len(re.sub(r"[，！？。、\s]", "", spoken(l))) for l in lines)
by_cat = {}
for l in lines:
    by_cat.setdefault(l["cat"], 0)
    by_cat[l["cat"]] += 1
meta = dict(generated_by="tools/voice/build_lines.py", total_lines=len(lines), total_chars=chars,
            by_cat=by_cat, words=len(WORDS), phrases=len(PHRASES),
            tw_risk_words=[l["text"] + "（" + l["tw_risk"] + "）" for l in lines if l.get("tw_risk")],
            note="total_chars 不含標點；tts_text 是實際要送給 TTS 的字（數字改國字）")
OUT.write_text(json.dumps(dict(meta=meta, dynamic=DYNAMIC, lines=lines), ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps(meta, ensure_ascii=False, indent=1))
