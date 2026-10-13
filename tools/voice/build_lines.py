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
MATCH_MAX_PAIRS = max(int(n) for n in re.search(r"match: \{ pairs: \[([\d, ]+)\]", SRC).group(1).split(","))   # v6：翻牌張數改由等級決定（LVP.match.pairs，最多 12 對＝24 張）
ROUNDS_MAX = max(int(r) for r in re.findall(r"rounds: (\d+)", SRC))
NEED_MAX = max(int(n) for _, n, _ in MODES)

assert len(WORDS) >= 130 and PHRASES and FRIENDS and SLOTS and len(MODES) >= 8, "詞庫解析失敗，zhuyin-words.js 格式變了？"

lines = []


# 整句送 TTS 的替換寫法（畫面/manifest 的 key 仍是原字；10-12 實測原字 TTS 一再唸糊，換寫法 2/2 清楚）
TTS_SUB = {"撞出場了！": "壯出場了！",          # 撞 3 次聽成 zheng/qiao/zhan；同音「壯」2/2 zhuang4
           "這關好好玩！": "這關，好好玩！",   # 批次 3 次都糊；加逗號 2/2 清楚
           "積木！": "雞木！",                 # 10-13 介紹卡遊戲名：批次 3 次都聽成 ji2 mo4；同音「雞」
           # 10-13 v6 第一輪 3 次都唸偏的（盲聽：牛→niao2、虎→hu2、狗→gao3；長→xiang4、金星→jing1 xin1；沙→xia1；層→ci4；爬→pa1；字→ci4）：
           # 單字代號加驚嘆號、長句在唸錯的字前面斷句（畫面上的字不變）
           "虎": "老虎",                       # 代號「虎」單字唸 3 次都偏（hu2／hu4）：點一下唸「老虎」（牛、狗等跟詞庫同字的代號直接用詞庫錄音，見挑戰燈塔段）
           "長得像的積木出現了！還有金星沙漏！": "長得像的積木，出現了！還有，金星沙漏！",
           "沙子蓋滿以前答對，就是金星喔！": "沙子，蓋滿以前答對，就是金星喔！",
           "這層是練習，答錯也沒關係！": "這一層樓，是練習，答錯也沒關係！",
           "好棒！這就是你的爬塔名字！": "好棒！這就是你的，爬塔名字！",
           "好久沒來，爬塔名字放掉了。徽章還在喔！": "好久沒來，爬塔的名字，放掉了。徽章還在喔！"}


# 句子裡個別字詞的 TTS 讀音替換（10-12 實測）：券 TTS 常唸成 ㄐㄩㄢˋ（台灣標準 ㄑㄩㄢˋ）→ 同音「勸」；
# 蝸牛 TTS 唸 ㄨㄛ（台灣標準 ㄍㄨㄚ，畫面注音也是）→「瓜牛」（同 GEMINI_SUB）。詞庫單詞（cat word）另有自己的機制，不套用。
TTS_CHAR_SUB = [("蝸牛", "瓜牛"), ("券", "勸")]


def add(id_, text, cat, src, tts=None, **kw):
    if tts is None and text in TTS_SUB:
        tts = TTS_SUB[text]
    if cat != "word":
        base = tts or text
        for a, b in TTS_CHAR_SUB:
            base = base.replace(a, b)
        if base != text:
            tts = base
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
    if m in ("detective", "tops", "tower"):   # 10-12：這兩個的開場語＝模組自己的教學句（下面 dt_intro／tp_intro 已登記同一句），不重複錄；10-13 挑戰燈塔同（tw_intro）
        continue
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

# ---- 4b. 10-11 新增：再試一次、一聲提示、泡泡救援灣、天氣、歸仁區 ----
BSRC = (ROOT / "js" / "zhuyin-bubble.js").read_text(encoding="utf-8")
for i, t, c in [("retry_banner", "剛剛卡住的，再試一次！", "system"), ("tone1_tip", "第一聲不用加符號，按這個空白格就好", "system"),
                ("bubble_win", "小企鵝都救出來了，好厲害！", "result"), ("bubble_full", "泡泡太多了，我們再試一次！", "system"),
                ("bubble_win_2", "小螃蟹都救出來了，好厲害！", "result"), ("bubble_win_3", "小鯨魚都救出來了，好厲害！", "result"),   # 泡泡第 2、3 區（10-11）
                ("bubble_zone_locked", "先把前面的關卡都過完，才能來這裡喔！", "guide"),
                ("wx_sunny", "今天是晴天，太陽好溫暖！", "guide"), ("wx_cloudy", "今天是陰天，雲好多喔！", "guide"), ("wx_rain", "下雨了！滴答滴答！", "guide"),
                ("wx_storm", "打雷了！轟隆隆！", "guide"), ("wx_typhoon", "颱風來了！大家要待在家裡喔！", "guide"), ("wx_rainbow", "雨停了！看，天上有彩虹！", "guide"),
                ("town_police", "警察局！警車出動巡邏囉！", "guide"), ("town_fire", "消防局！消防車出動囉！", "guide"), ("town_hospital", "醫院！救護車出發囉！", "guide"),
                ("town_school", "學校！叮噹叮噹，上課囉！", "guide"), ("town_here", "這裡是歸仁區！", "guide"), ("town_locked", "收集更多貼紙，就能蓋好囉！", "guide"),
                ("fire_start", "失火了！快叫消防車！", "guide"), ("fire_tap", "消防車馬上來！", "guide"), ("fire_out", "火熄滅了，謝謝消防員！", "guide"),
                ("ph_dusk1", "太陽要下山囉！", "guide"), ("ph_dusk2", "天空變成橘色了！", "guide"), ("ph_night1", "天黑了，路燈亮起來了！", "guide"),   # 10-11 日夜時鐘（PHASE_LINES）
                ("ph_night2", "月亮出來了，好漂亮！", "guide"), ("ph_dawn1", "天快亮了，早安！", "guide"), ("ph_dawn2", "太陽公公要起床囉！", "guide")]:
    must(t); add(i, t, c, "zhuyin.js（10-11）")
for i, t in [("bubble_swap", "點一下泡泡，可以換一顆喔！"), ("bubble_intro1", "三個一樣的連在一起，就會破掉喔！把小企鵝救出來！"),
             ("bubble_zone2", "這次要救小螃蟹喔！"), ("bubble_zone3", "這次要救小鯨魚喔！")]:
    if t.split("！")[0] not in BSRC: sys.exit(f"zhuyin-bubble.js 找不到：{t}")
    add(i, t, "guide", "zhuyin-bubble.js（10-11）")
# 泡泡上的注音符號：唸符號的名稱（台灣念法：ㄅ＝玻、ㄆ＝坡、ㄇ＝摸）
# 第 2 區 ㄉㄊㄋㄌ（得特訥勒）、第 3 區 ㄍㄎㄏ（哥科喝）：台灣念法，tts 用讀音字（順序＝zhuyin-bubble.js 的 SYMS）
BSYMS = re.search(r'export const SYMS = \[(.*?)\];', BSRC).group(1)
BSYMS = re.findall(r'"(.)"', BSYMS)
SYM_READ = {"ㄅ": "玻", "ㄆ": "坡", "ㄇ": "摸", "ㄉ": "得", "ㄊ": "特", "ㄋ": "訥", "ㄌ": "勒", "ㄍ": "哥", "ㄎ": "科", "ㄏ": "喝"}
assert BSYMS[:len(SYM_READ)] == list(SYM_READ), f"SYMS 跟讀音表不一致：{BSYMS}"   # v6 新加的符號在下面 4d 段
for i, (sym, rd) in enumerate((k, SYM_READ[k]) for k in BSYMS[:len(SYM_READ)]):
    add(f"sym_{i + 1}", sym, "word", "zhuyin-bubble.js SYMS", tts=rd)

# ---- 4d. v6（10-13）泡泡救援灣第 4、5 區：新符號、區開場、天花板下壓／石頭教學、過關稱讚（分身 B）----
# 第 4 區 ㄐㄑㄒ（機欺希）、第 5 區 ㄓㄔㄕㄖ（知吃詩日）：台灣念法，tts 用讀音字；編號接在 sym_10 後面（順序＝SYMS）
SYM_READ_V6 = {"ㄐ": "機", "ㄑ": "欺", "ㄒ": "希", "ㄓ": "知", "ㄔ": "吃", "ㄕ": "詩", "ㄖ": "日"}
assert BSYMS[len(SYM_READ):] == list(SYM_READ_V6), f"v6 SYMS 跟讀音表不一致：{BSYMS[len(SYM_READ):]}"
for i, sym in enumerate(BSYMS[len(SYM_READ):]):
    add(f"sym_{len(SYM_READ) + i + 1}", sym, "word", "zhuyin-bubble.js SYMS（v6）", tts=SYM_READ_V6[sym])
for i, t in [("bubble_zone4", "這次要救小象喔！天花板會慢慢降下來喔！"),
             ("bubble_zone5", "這次要救小獅子喔！灰色的石頭打不破，要讓它掉下來！"),
             ("bubble_drop_tip", "天花板降下來了！小燈都熄掉，就會往下降喔！")]:
    if t not in BSRC: sys.exit(f"zhuyin-bubble.js 找不到：{t}")
    add(i, t, "guide", "zhuyin-bubble.js（v6 10-13）")
for i, t in [("bubble_win_4", "小象都救出來了，好厲害！"), ("bubble_win_5", "小獅子都救出來了，好厲害！")]:
    must(t); add(i, t, "result", "zhuyin.js BUBBLE_WIN_TALK（v6 10-13）")
must("🚪 離開挑戰")   # 爬塔 Boss 的暫停選單按鈕（只顯示不唸，不用錄）
# ---- 4c. 10-11 扭蛋機與 28 隻寵物 ----
RWSRC = (ROOT / "js" / "zhuyin-rewards.js").read_text(encoding="utf-8")
PETS_BLOCK = RWSRC.split("export const PETS = [")[1].split("];\nexport const PET")[0]
PETS28 = re.findall(r'\["(\w+)", "([^"]+)"\]|\{ id: "(\w+)", name: "([^"]+)"', PETS_BLOCK)
PET_NAMES = [b or d for a, b, c, d in PETS28]
assert len(PET_NAMES) == 28, f"寵物名單解析失敗：{len(PET_NAMES)}"
for i, t in [("gacha_open", "投一枚扭蛋幣，轉一轉！"), ("gacha_nocoin", "收集星星，就能拿到扭蛋幣喔！"), ("gacha_dup", "換成點心囉！"),
             ("gacha_decor", "小島多了一個新裝飾！"), ("gacha_treats", "拿到點心了！"), ("town_open", "橋蓋好了！歸仁區開放囉！")]:
    must(t); add(i, t, "guide", "zhuyin.js 扭蛋機（10-11）")
for k, nm in enumerate(["警察局", "消防局", "醫院", "學校"]):
    add(f"town_built_{k + 1}", f"歸仁區的{nm}蓋好了！", "guide", "zhuyin.js civicEvent built")
must('p.name + "來了！"'); must('`${p.name}${g.fed.grew === 3 ? "變成超級" : "長大"}了！`')
word_set0 = {w["h"] for w in WORDS}
for k, nm in enumerate(PET_NAMES):
    add(f"pet_come_{k + 1}", nm + "來了！", "hatch", "zhuyin.js spinGacha")
    add(f"pet_grow_{k + 1}", nm + "長大了！", "guide", "zhuyin.js rewardStrip")
    add(f"pet_super_{k + 1}", nm + "變成超級了！", "guide", "zhuyin.js rewardStrip")
    if nm not in word_set0 and nm not in FRIENDS:
        add(f"pet_name_{k + 1}", nm, "friend", "zhuyin.js 動物朋友圖鑑／小島點寵物")

# 寵物不舒服／好了（歸仁區救護車）：每位朋友各一句
must('who + "不舒服，救護車來了！"'); must('who + "好了，謝謝醫生！"')
for i, nm in enumerate(FRIENDS):
    add(f"sick_{i + 1}", nm + "不舒服，救護車來了！", "guide", "zhuyin.js civicEvent")
    add(f"healed_{i + 1}", nm + "好了，謝謝醫生！", "guide", "zhuyin.js civicEvent")

# ---- 10-12 寵物換裝 ----
# 換裝畫面的台詞在 js/zhuyin-dress.js 的 LINES；配件名與「拿到 X 了！」在 js/zhuyin-rewards.js 的 WEAR／wearGotLine
DSRC = (ROOT / "js" / "zhuyin-dress.js").read_text(encoding="utf-8")
WEAR_BLOCK = RWSRC.split("export const WEAR = [")[1].split("];")[0]
WEAR_ITEMS = re.findall(r'\{ id: "(\w+)", slot: "\w+", name: "([^"]+)"', WEAR_BLOCK)
assert len(WEAR_ITEMS) == 10, f"配件目錄解析失敗：{len(WEAR_ITEMS)}"
for i, t in [("dress_intro", "幫寵物換衣服吧！"), ("dress_idle", "點一下衣服，幫牠穿上！"), ("dress_again", "換一件試試看！"),
             ("dress_praise_1", "好可愛！"), ("dress_praise_2", "好漂亮喔！"), ("dress_praise_3", "好帥喔！"),
             ("dress_lock_deliver", "去送貨，就可以拿到喔！"), ("dress_lock_both", "送貨或扭蛋，都可以拿到喔！")]:
    if f'"{t}"' not in DSRC: sys.exit(f"zhuyin-dress.js 找不到：{t}（LINES 改過了，請更新 build_lines.py）")
    add(i, t, "guide", "zhuyin-dress.js LINES（10-12）")
if 'export const wearGotLine = id => "拿到" + WEAR_BY_ID[id].name + "了！"' not in RWSRC: sys.exit("zhuyin-rewards.js 的 wearGotLine 改過了，請更新 build_lines.py")
have_text = {l["text"] for l in lines} | {w["h"] for w in WORDS}   # 詞庫的詞（第 6 段才加進來）也算
for wid, nm in WEAR_ITEMS:
    if nm not in have_text:                                  # 配件名（穿上時唸；「帽子」詞庫已有就不重錄）
        add(f"wear_name_{wid}", nm, "word", "zhuyin-dress.js 穿上配件（say）",
            tts={"皇冠": "皇官"}.get(nm))                   # 10-12 實測：單獨唸「皇冠」TTS 兩次都讀 guan4，送「皇官」才是 ㄍㄨㄢ
    add(f"wear_got_{wid}", f"拿到{nm}了！", "guide", "zhuyin-rewards.js wearGotLine（扭蛋／配送站拿到配件）")
# 10-12 換裝接進主程式：沒拿到的格子改成角落小圖示（🚚／🎰），點了說 LINES.lockDeliver／lockBoth（上面已登記）；扭蛋抽到配件說 wearGotLine（上面已登記）
must('RW.wearGotLine(prize.id)')
for i, t in [("dress_load_fail", "服裝店現在打不開，等一下再試試看！")]:   # 換裝模組載入失敗（從小島服裝店點進來時貓頭鷹說）
    must(t); add(i, t, "guide", "zhuyin.js openDress（10-12）")

# ---- 10-12 彩虹島 ----
# 彩虹島解鎖宣告、到了彩虹島、還沒開（「再收集 N 張貼紙，彩虹島就開放囉！」只顯示字不唸，唸的是下面這句不帶數字的）、
# 配送站／服裝店還沒做好的暫代句（之後換成真的遊戲／換裝畫面就拿掉）；配送站開場語由 MODES.deliver.intro 自動收
for i, t in [("rb_open", "彩虹橋接好了！彩虹島開放囉！"), ("rb_here", "這裡是彩虹島！"), ("rb_locked", "收集更多貼紙，就能去彩虹島囉！"),
             ]:   # 10-12 服裝店、配送站都接上真的畫面了，「…快要開張囉！」兩句暫代句拿掉
    must(t); add(i, t, "guide", "zhuyin.js 彩虹島（10-12）")

# ---- 10-12 彩虹配送站 ----
# 台詞都在 js/zhuyin-deliver.js 的 LINES 與 TASKS[].intro；商品名在 GOODS、禮物名在 GIFTS（跟 zhuyin-rewards.js 的 WEAR 同名）。
# 「我要X！」「這是X，不是我要的喔！」用 say()（題目／答案類，不受說明語音開關影響）；其餘用 talk()。
DLSRC = (ROOT / "js" / "zhuyin-deliver.js").read_text(encoding="utf-8")


def dl_must(snippet):
    if snippet not in DLSRC:
        sys.exit(f"zhuyin-deliver.js 找不到：{snippet}（台詞改過了，請更新 build_lines.py）")


DL_GOODS = re.findall(r'^\s+(\w+): \{ h: "([^"]+)", img: "goods_', DLSRC, re.M)
assert len(DL_GOODS) == 6, f"配送站商品解析失敗：{len(DL_GOODS)}"
DL_GIFTS = re.findall(r'(\w+): \{ h: "([^"]+)", emoji:', DLSRC.split("export const GIFTS = {")[1].split("};")[0])
assert len(DL_GIFTS) == 8, f"配送站禮物解析失敗：{len(DL_GIFTS)}"
dl_must("want: h => `我要${h}！`"); dl_must("wrong: h => `這是${h}，不是我要的喔！`"); dl_must("gift: h => `送你${h}！`")
for gid, h in DL_GOODS:
    add(f"dlv_want_{gid}", f"我要{h}！", "order", "zhuyin-deliver.js LINES.want（前 3 關開場、🔊 再聽，say）")
for gid, h in DL_GOODS:
    add(f"dlv_wrong_{gid}", f"這是{h}，不是我要的喔！", "order", "zhuyin-deliver.js LINES.wrong（送錯：說孩子給的那個，say）")
for wid, h in DL_GIFTS:
    add(f"dlv_gift_{wid}", f"送你{h}！", "guide", "zhuyin-deliver.js LINES.gift（任務第一次過關，居民送換裝）")
for i, key, t in [("dlv_thanks", "thanks", "謝謝你！"), ("dlv_none", "none", "車上沒有我要的東西耶，回倉庫拿吧！"), ("dlv_got", "got", "我已經收到囉，謝謝！"),
                  ("dlv_noorder", "noOrder", "我沒有訂東西喔！"), ("dlv_full", "full", "車子裝滿了！"), ("dlv_unloadtip", "unloadTip", "點車上的東西可以拿下來喔！"), ("dlv_loadfirst", "loadFirst", "先把貨裝上車吧！"),
                  ("dlv_bridge", "bridge", "橋還沒放下來喔！"), ("dlv_cone", "cone", "前面在施工，車子沒辦法過去喔！"), ("dlv_oneway", "oneway", "這是單行道，要繞路喔！"),
                  ("dlv_hello", "hello", "嗨！麻煩你囉！"), ("dlv_t1go", "t1go", "點小兔家，卡車就會出發！"), ("dlv_t1give", "t1give", "點車廂裡的帽子，交給小兔！")]:
    dl_must(f'{key}: "{t}"'); add(i, t, "guide", f"zhuyin-deliver.js LINES.{key}")
DL_INTROS = re.findall(r'intro: "([^"]+)"', DLSRC.split("export const TASKS = [")[1].split("].map(")[0])
assert len(DL_INTROS) == 11, f"配送站任務開場語解析失敗：{len(DL_INTROS)}"   # 10-13 任務 9–12 各加一句（任務 1–8 有 7 句、9–12 有 4 句）
for k, t in enumerate(DL_INTROS):
    add(f"dlv_intro_{k + 1}", t, "guide", "zhuyin-deliver.js TASKS[].intro（該任務第一次玩）")
# 10-13 任務 9–12 第一次過關送 1 枚扭蛋幣：台詞走同一個 LINES.gift（「送你扭蛋幣！」；COIN_GIFT 在 zhuyin-deliver.js）
dl_must('export const COIN_GIFT = { h: "扭蛋幣", emoji: "🪙" }')
add("dlv_gift_coin", "送你扭蛋幣！", "guide", "zhuyin-deliver.js LINES.gift(COIN_GIFT.h)（10-13 任務 9–12 第一次過關，居民送扭蛋幣）")
# 主程式接線（10-12）：結算語音（沒拿到新貼紙時；有新貼紙唸「拿到 N 張新貼紙！」）、引擎／3D 場景打不開時回小島貓頭鷹說
for i, t in [("dlv_win", "東西都送到了，好厲害！"), ("dlv_fail", "配送站現在打不開，等一下再試試看！")]:
    must(t); add(i, t, "guide", "zhuyin.js 彩虹配送站接線（DELIVER_WIN_TALK／DELIVER_FAIL）")

# ---- 10-12 詞句小偵探 ----
# 台詞在 js/zhuyin-detective.js 的 LINES／WIN_TALK；題目句在 js/zhuyin-detective-bank.js（只登記 enabled: true 的題目，草稿題不錄）。
# 題目句：用 say()，語氣要「溫柔清楚、稍慢、自然說話、不唱、不加重音」——id 一律 dt_q_ 開頭、類別用 phrase
#   （gen_full.py 的 style_of() 對 phrase 套 STYLE["word"]＝clear and natural, relaxed pace；而且 phrase 算學習句，盲聽寫有任何差異就重錄）。
#   之後若 gen_full.py 加專用 STYLE（例如 "dictation"），用 id 前綴 dt_q_ 判斷即可。
# 答錯「按喇叭，再聽一次喔！」：id dt_retry（10-12 由「再聽一次喔！」改來；要輕聲；gen_full.py 可比照 sys_pause 套 STYLE["calm"]）；稱讚 dt_praise_N 用 praise 類別。
DTSRC = (ROOT / "js" / "zhuyin-detective.js").read_text(encoding="utf-8")
DTBANK = (ROOT / "js" / "zhuyin-detective-bank.js").read_text(encoding="utf-8")


def dt_must(snippet):
    if snippet not in DTSRC:
        sys.exit(f"zhuyin-detective.js 找不到：{snippet}（台詞改過了，請更新 build_lines.py）")


DT_Q = re.findall(r'^\s+\{ id: "(\w+)", say: "([^"]+)", options: \[([^\]]*)\], enabled: (true|false)', DTBANK, re.M)   # 行首要是空白（檔頭註解裡的格式範例不算）
assert len(DT_Q) >= 2 and sum(1 for q in DT_Q if q[3] == "true") >= 2, f"詞句小偵探題庫解析失敗：{len(DT_Q)}"
for qid, say, opts, en in DT_Q:
    first = re.findall(r'"([^"]+)"', opts)[0]
    assert first == say, f"詞句小偵探 {qid}：say 要跟 options[0] 一樣"
    if en == "true":
        add(f"dt_q_{qid}", say, "phrase", "zhuyin-detective-bank.js（題目句：念題、🔊 重聽、答對後重念，say）")
dt_must('intro: "仔細聽，選出你聽到的那一句！"'); dt_must('retry: "按喇叭，再聽一次喔！"')
add("dt_intro", "仔細聽，選出你聽到的那一句！", "guide", "zhuyin-detective.js LINES.intro（每回合開場教學，talk）")
add("dt_retry", "按喇叭，再聽一次喔！", "guide", "zhuyin-detective.js LINES.retry（答錯，輕聲，talk；10-12 櫻木：舊句「再聽一次喔！」改這句、要重錄）")
DT_PRAISE = re.findall(r'"([^"]+)"', re.search(r"praise: \[([^\]]+)\]", DTSRC).group(1))
assert len(DT_PRAISE) == 3, f"詞句小偵探稱讚句解析失敗：{DT_PRAISE}"
for k, t in enumerate(DT_PRAISE):
    add(f"dt_praise_{k + 1}", t, "praise", "zhuyin-detective.js LINES.praise（答對，talk）")
dt_must('lvup: "新的一級打開了！"')
add("dt_lvup", "新的一級打開了！", "guide", "zhuyin-detective.js LINES.lvup（10-13 等級：升級橫幅出來時小狗說，talk）")
dt_must('export const WIN_TALK = "全部找到了，你是厲害的小偵探！"')
add("dt_win", "全部找到了，你是厲害的小偵探！", "result", "zhuyin-detective.js WIN_TALK（主程式結算畫面唸）")

# ---- 10-12 同樂廣場 ----
# 台詞都在 js/zhuyin-plaza.js 的 LINES（主題介紹 5 種＋對話框短版、達成 3 段＋短版、加油貼紙提示、連不上／休息中、歡迎）與 CHEERS（四張加油貼紙的字）。
# 主題介紹＝換週時貓頭鷹說、打開廣場卡片時說（talk）；達成＝第一次看到新的一段（queueTalk）；貼紙的字＝點一下貼紙（say）；
# 對話框短版（introText／reachedText）平常只顯示不唸，點貓頭鷹探頭「再講一次」時會唸，所以也登記。
PLSRC = (ROOT / "js" / "zhuyin-plaza.js").read_text(encoding="utf-8")


def pl_must(snippet):
    if snippet not in PLSRC:
        sys.exit(f"zhuyin-plaza.js 找不到：{snippet}（台詞改過了，請更新 build_lines.py）")


PL_KEYS = ["rescue", "deliver", "fish", "read", "star"]
PL_INTRO = {k: re.search(k + r': "(這個禮拜是[^"]+)"', PLSRC.split("intro: {")[1].split("},")[0]).group(1) for k in PL_KEYS}
PL_INTRO_TEXT = {k: re.search(k + r': "([^"]+)"', PLSRC.split("introText: {")[1].split("},")[0]).group(1) for k in PL_KEYS}
PL_REACHED = [t for t in re.findall(r'"([^"]*)"', PLSRC.split("  reached: [")[1].split("],")[0]) if t]      # 第 0 個是空字串（0 段＝沒有）
PL_REACHED_TEXT = [t for t in re.findall(r'"([^"]*)"', PLSRC.split("reachedText: [")[1].split("],")[0]) if t]
PL_CHEERS = re.findall(r'\{ e: "[^"]+", t: "([^"]+)" \}', PLSRC.split("export const CHEERS = [")[1].split("];")[0])
assert len(PL_REACHED) == 3 and len(PL_REACHED_TEXT) == 3 and len(PL_CHEERS) == 4, f"同樂廣場台詞解析失敗：{PL_REACHED} {PL_REACHED_TEXT} {PL_CHEERS}"
assert all(t.startswith("大家一起做到了！") for t in PL_REACHED + PL_REACHED_TEXT), "同樂廣場達成台詞要以「大家一起做到了！」開頭（規格 §1）"
pl_have = {l["text"] for l in lines}
for k in PL_KEYS:
    add(f"pz_intro_{k}", PL_INTRO[k], "guide", "zhuyin-plaza.js LINES.intro（換週貓頭鷹介紹、打開廣場，talk）")
for k in PL_KEYS:
    if PL_INTRO_TEXT[k] not in pl_have:
        add(f"pz_introtext_{k}", PL_INTRO_TEXT[k], "guide", "zhuyin-plaza.js LINES.introText（對話框短版：點貓頭鷹探頭重講時唸）")
for n, t in enumerate(PL_REACHED, 1):
    add(f"pz_reached_{n}", t, "guide", "zhuyin-plaza.js LINES.reached（第一次看到新的一段，queueTalk）")
for n, t in enumerate(PL_REACHED_TEXT, 1):
    add(f"pz_reachedtext_{n}", t, "guide", "zhuyin-plaza.js LINES.reachedText（對話框短版：探頭重講時唸）")
for n, t in enumerate(PL_CHEERS, 1):
    if t not in pl_have:
        add(f"pz_cheer_{n}", t, "guide", "zhuyin-plaza.js CHEERS（加油貼紙：點一下唸，say）")
for i, key, t in [("pz_welcome", "welcome", "歡迎來到同樂廣場！"), ("pz_armed", "armed", "再按一次，就送出貼紙喔！"), ("pz_sent", "sent", "貼紙送出去了！大家都看得到喔！"),
                  ("pz_used", "used", "今天的貼紙送完了，明天再來送！"), ("pz_offline", "offline", "連不上，等一下再看！"), ("pz_paused", "paused", "廣場在休息，等一下再來！")]:
    pl_must(f'{key}: "{t}"'); add(i, t, "guide", f"zhuyin-plaza.js LINES.{key}")
must('const plaza = createPlaza(')   # 主程式有接上（同樂廣場在 zhuyin.js 的區塊）

# ---- 10-12 注音戰鬥陀螺 ----
# 台詞都在 js/zhuyin-tops.js 的 LINES、ROUND_LINES、BONUS_TEXT（加成名稱跟 js/zhuyin-tops-power.js 的 TOPS_BONUS 一樣）。
# 全部用 talk()；**不唸小孩打的字**（自由組合的詞句、候選字一律不出聲）。「再拿 N 顆星星」只顯示字、唸的是不帶數字的 noTicket。
TPSRC = (ROOT / "js" / "zhuyin-tops.js").read_text(encoding="utf-8")
TPPOW = (ROOT / "js" / "zhuyin-tops-power.js").read_text(encoding="utf-8")
TP_LINES = re.findall(r'^\s+(\w+): "([^"]+)",', TPSRC.split("export const LINES = {")[1].split("\n};")[0], re.M)
assert len(TP_LINES) == 36, f"陀螺台詞解析失敗：{len(TP_LINES)}"   # 10-12 櫻木改善 +10 句；10-13 v7 合體三戰兩勝：拿掉 變身／這回合你贏了／這回合對手贏了，加 合體！／發射！／決勝回合！／藍隊勝！／紅隊勝！（勝利、再接再厲改寫）
for key, t in TP_LINES:
    add(f"tp_{key}", t, "guide", f"zhuyin-tops.js LINES.{key}", **({"tts_text": "對手是"} if key == "vsPre" else {}))
# 內建詞句（骰子詞庫 INSPIRE；島上傳說 LEGENDS 都在裡面）：抽到時唸「宇宙強爸爸！」；對手是內建詞句時唸「對手是：」＋「宇宙強爸爸！」
#   兩段播放＝gen_full.py manifest 的 split「對手是：」（js/zhuyin-voice.js filesFor 拆前綴）。小孩自己打的句子一律不唸。
TP_INSP = re.findall(r'\["([㐀-鿿]{5})", "([ㄅ-ㄩˊˇˋ˙ ]+)"\]', TPSRC.split("export const INSPIRE = [")[1].split("\n];")[0])
TP_LEGENDS = re.findall(r'"([㐀-鿿]{5})"', re.search(r"export const LEGENDS = \[([^\]]+)\]", TPSRC).group(1))
assert len(TP_INSP) >= 20, f"陀螺骰子詞庫解析失敗：{len(TP_INSP)}"
assert set(TP_LEGENDS) <= {h for h, _ in TP_INSP}, "島上傳說要都在骰子詞庫裡（才有預錄配音）"
for t in ['export const sayPhrase = p => p + "！";', 'talk(LINES.vsPre + sayPhrase(st.opp.p))', "talk(sayPhrase(p), true)"]:
    if t not in TPSRC:
        sys.exit(f"zhuyin-tops.js 找不到：{t}（內建詞句唸法改過了，請更新 build_lines.py）")
for k, (h, z) in enumerate(TP_INSP):
    add(f"tp_insp_{k + 1}", h + "！", "phrase", "zhuyin-tops.js INSPIRE（骰子抽到／對手是內建詞句時唸；內建固定字串）", zhuyin=z)
TP_ROUNDS = json.loads(re.search(r"export const ROUND_LINES = (\[.*?\]);", TPSRC).group(1))
assert len(TP_ROUNDS) == 2, "陀螺回合台詞解析失敗"   # 10-13 v7 三戰兩勝：第 1、2 回合；第 3 回合唸 LINES.final「決勝回合！」
for i, t in enumerate(TP_ROUNDS):
    add(f"tp_round_{i + 1}", t, "guide", "zhuyin-tops.js ROUND_LINES（每回合開始）")
# 10-13 v7 段位：贏一場升一段（新手→銅牌→銀牌→金牌→彩虹），升段時唸 RANK_UP[to−1]
TP_RANKUP = json.loads(re.search(r"export const RANK_UP = (\[.*?\]);", TPSRC).group(1))
assert len(TP_RANKUP) == 4, f"陀螺升段台詞解析失敗：{len(TP_RANKUP)}"
if "talk(RANK_UP[st.rankUp.to - 1])" not in TPSRC:
    sys.exit("zhuyin-tops.js 找不到升段唸法 talk(RANK_UP[st.rankUp.to - 1])，請更新 build_lines.py")
for i, t in enumerate(TP_RANKUP):
    add(f"tp_rankup_{i + 1}", t, "guide", "zhuyin-tops.js RANK_UP（v7 段位升段）")
TP_BONUS = re.findall(r'(\w+): "([^"]+)"', TPSRC.split("export const BONUS_TEXT = {")[1].split("};")[0])
assert len(TP_BONUS) == 6, f"陀螺加成名稱解析失敗：{len(TP_BONUS)}"
for key, t in TP_BONUS:
    if f'{key}: {{ name: "{t}"' not in TPPOW:
        sys.exit(f"zhuyin-tops-power.js 的 TOPS_BONUS.{key} 跟 zhuyin-tops.js 的 BONUS_TEXT 不一樣（{t}），兩邊要一起改")
    add(f"tp_bonus_{key}", t, "guide", "zhuyin-tops.js BONUS_TEXT＝zhuyin-tops-power.js TOPS_BONUS（變身時唸加成名稱）")

# ---- 10-12 詞句小偵探／注音戰鬥陀螺接進主程式（zhuyin.js）----
# 偵探：開場語＝MODES.detective.intro＝模組 LINES.intro（dt_intro）；結算唸模組的 WIN_TALK（dt_win）；引擎打不開時貓頭鷹說 DETECTIVE_FAIL。
# 陀螺：開場語＝模組每次自己唸（tp_intro）；結算拿到陀螺券唸「拿到一張陀螺券了！」；打不開時 TOPS_FAIL；
#       沒券時貓頭鷹唸「再拿 N 顆星星就能玩陀螺喔！」（N＝1..TOPS_STARS，在下面「5. 動態句」展開）。
for i, t in [("dt_fail", "偵探社現在打不開，等一下再試試看！"), ("tp_fail", "陀螺競技場現在打不開，等一下再試試看！"), ("tp_ticket_got", "拿到一張陀螺券了！")]:
    must(t); add(i, t, "guide", "zhuyin.js 詞句小偵探／陀螺接線（10-12）")
for t in ["仔細聽，選出你聽到的那一句！", "用注音拼出五個字，變成戰鬥陀螺！"]:
    must(f'intro: "{t}"')   # MODES 的開場語要跟模組的教學句一樣（上面才不用另外錄）

# ---- 10-12 小島介紹卡：點一下遊戲建築，貓頭鷹唸遊戲名字（talk(g.name + "！")；名字在 zhuyin.js 的 GAME_INFO）----
# 「再收集 N 張貼紙」只顯示在卡片上不唸；點地圖上還沒開的島／路牌＝上面已登記的 town_locked、rb_locked
must('talk(g.name + "！")')
GI_BLOCK = SRC.split("const GAME_INFO = {")[1].split("\n};")[0]
GAME_INFO = re.findall(r'^\s+(\w+): \{ name: "([^"]+)"', GI_BLOCK, re.M)
assert len(GAME_INFO) == 15, f"GAME_INFO 解析失敗：{len(GAME_INFO)}"   # 12 個遊戲＋扭蛋機＋寵物服裝店＋10-13 挑戰燈塔
for m, nm in GAME_INFO:
    add(f"pick_{m}", nm + "！", "guide", "zhuyin.js showPick（10-12 小島介紹卡，唸遊戲名字）")

# ---- v6（10-13 分身 A）難度等級 Lv1–Lv5：解鎖畫面、沙漏說明、暖身建議（docs/zhuyin-v6-plan.md §2.1）----
# 結算時開了新的一級：queueTalk(LV_SAY[N])「第N級打開了！」→ queueTalk(LV_NEW[模式][N])（新東西說明）；第一次開到第 3 級（有沙漏的遊戲）再加 HG_TIP。
# 在最高級連 2 次 1 星：queueTalk(LV_WARM[N])「要先回第N級暖身嗎？」。全部是說明語音（talk 類，家長關說明語音就不唸）。
must("const LV_SAY = [")
LV_SAY = [t for t in re.findall(r'"([^"]*)"', SRC.split("const LV_SAY = [")[1].split("];")[0]) if t]
assert len(LV_SAY) == 4, f"LV_SAY 解析失敗：{LV_SAY}"
for i, t in enumerate(LV_SAY):
    add(f"lv_up_{i + 2}", t, "guide", "zhuyin.js LV_SAY（v6 結算：開了新的一級）")
LV_NEW_BLOCK = SRC.split("const LV_NEW = {")[1].split("\n};")[0]
LV_NEW = re.findall(r'^\s+(\w+):\s+\{ 2: "([^"]+)", 3: "([^"]+)", 4: "([^"]+)", 5: "([^"]+)" \}', LV_NEW_BLOCK, re.M)
assert len(LV_NEW) == 8, f"LV_NEW 解析失敗：{len(LV_NEW)}"   # 主程式 7 個遊戲＋翻牌
seen_new = {}
for m, *ts in LV_NEW:
    for n, t in zip(range(2, 6), ts):
        if t in seen_new:      # 同一句只錄一次（不同遊戲說一樣的話）
            continue
        seen_new[t] = 1
        add(f"lv_new_{m}_{n}", t, "guide", "zhuyin.js LV_NEW（v6 解鎖畫面的新東西說明）")
must('const HG_TIP = "')
add("lv_hg_tip", re.search(r'const HG_TIP = "([^"]+)"', SRC).group(1), "guide", "zhuyin.js HG_TIP（v6 第一次開到有金星沙漏的第 3 級）")
LV_WARM = [t for t in re.findall(r'"([^"]*)"', SRC.split("const LV_WARM = [")[1].split("];")[0]) if t]
assert len(LV_WARM) == 4, f"LV_WARM 解析失敗：{LV_WARM}"
for i, t in enumerate(LV_WARM):
    add(f"lv_warm_{i + 1}", t, "guide", "zhuyin.js LV_WARM（v6 在最高級連 2 次 1 星：建議回上一級暖身）")
# ---- 10-13 挑戰燈塔（爬塔）----
# 台詞都在 js/zhuyin-tower.js 的 LINES（貓頭鷹：開場、愛心規則、每段新東西、補心、金色愛心、守塔怪、存檔點、降落傘、結算、選名字）；全部用 talk()。
# 樓層數字只顯示不唸（不錄「第 N 層」）；遊戲名字沿用上面的 pick_ 台詞；題目詞沿用詞庫音檔。
# 24 個代號名（12 生肖＋12 星座，js/zhuyin-tower-core.js 的 CODES）：選名字時點一下唸（talk）。
# 第 100 層最後用積木拼「登頂」（SUMMIT_WORD）：積木題會唸這個詞 → 跟詞庫一樣用 word 類別錄。
TWSRC = (ROOT / "js" / "zhuyin-tower.js").read_text(encoding="utf-8")
TWCORE = (ROOT / "js" / "zhuyin-tower-core.js").read_text(encoding="utf-8")
TW_LINES = re.findall(r'^\s+(\w+): "([^"]+)",', TWSRC.split("export const LINES = {")[1].split("\n};")[0], re.M)
assert len(TW_LINES) == 32, f"挑戰燈塔台詞解析失敗：{len(TW_LINES)}"
for key, t in TW_LINES:
    add(f"tw_{key}", t, "guide", f"zhuyin-tower.js LINES.{key}（10-13 挑戰燈塔）")
TW_CODES = re.findall(r'\{ id: "(\w+)", e: "[^"]+", name: "([^"]+)" \}', TWCORE.split("export const CODES = [")[1].split("];")[0])
assert len(TW_CODES) == 24, f"挑戰燈塔代號解析失敗：{len(TW_CODES)}"
HAVE_TEXT = {l["text"] for l in lines} | {w["h"] for w in WORDS}   # 詞庫的詞在檔案後面（第 6 段）才登記，這裡直接看 WORDS
for cid, nm in TW_CODES:
    if nm in HAVE_TEXT:   # 牛、蛇、馬、羊、雞、狗、豬＝詞庫已經有這個字：直接用詞庫的錄音（manifest 用文字當鑰匙，再錄一次會蓋掉釣魚等遊戲的學習詞錄音，10-13 踩到）
        continue
    add(f"tw_code_{cid}", nm, "guide", "zhuyin-tower-core.js CODES（選爬塔名字時點一下唸）")
must('intro: "這是挑戰燈塔！爬到最頂樓，就是燈塔王！"')   # MODES.tower 的開場語＝模組 LINES.intro（tw_intro），不另外錄
assert 'h: "登頂", z: "ㄉㄥ ㄉㄧㄥˇ"' in TWCORE, "挑戰燈塔 SUMMIT_WORD 改了，請更新 build_lines.py"
add("word_登頂", "登頂", "word", "zhuyin-tower-core.js SUMMIT_WORD（第 100 層用積木拼出登頂）", zhuyin="ㄉㄥ ㄉㄧㄥˇ", word_cat="thing")
for i, t in [("tw_fail", "燈塔現在打不開，等一下再試試看！")]:
    must(t); add(i, t, "guide", "zhuyin.js 挑戰燈塔接線（10-13）")

# ---- v7（10-13 分身 P）寵物進化：28 隻各三句（docs/zhuyin-v7-plan.md §2）----
# 「XX進化——」＝演出中字幕＋配音（白光爆開前，第 4.8 秒）；「閃耀XX！」＝亮相橫幅（10-13 主對話改名：第 3 階段已叫超級）（第 8.75 秒，進化曲高潮之後）；
# 「XX好像要進化了！」＝能量集滿：回小島貓頭鷹提醒、結算／扭蛋剛好集滿時唸。全部用 talk()（說明語音開關管得到）。
# ⚠ manifest 用文字當鑰匙：這三種句型都沒有跟既有台詞同字（「XX變成超級了！」是另一句）。名字＝PET_NAMES（js/zhuyin-rewards.js 的 PETS）。
must("callText: `${p.name}進化——`"); must("revealText: `${sup}！`"); must("sup = RW.evoName(id)")
must("${RW.PET[id].name}好像要進化了！"); must("queueTalk(`${nm}好像要進化了！`)"); must("${RW.PET[prize.evo.id].name}好像要進化了！")
if 'export const evoName = id => "閃耀" + ' not in RWSRC:
    sys.exit("js/zhuyin-rewards.js 的 evoName 改了（進化後的名字），請更新 build_lines.py")
for k, nm in enumerate(PET_NAMES):
    add(f"evo_call_{k + 1}", nm + "進化——", "guide", "zhuyin-evolve.js 演出字幕（zhuyin.js startEvolve callText）")
    add(f"evo_super_{k + 1}", "閃耀" + nm + "！", "guide", "zhuyin-evolve.js 亮相橫幅（zhuyin.js startEvolve revealText）")
    add(f"evo_ready_{k + 1}", nm + "好像要進化了！", "guide", "zhuyin.js evoMenu／rewardStrip／gachaShow（能量集滿）")

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

must("再拿 ${topsNeed()} 顆星星就能玩陀螺喔！")   # 10-12 陀螺沒券（點陀螺競技場／卡片時貓頭鷹說）
TOPS_STARS = int(re.search(r"const TOPS_STARS = (\d+)", SRC).group(1))
DYNAMIC.append(dict(template="再拿 ${n} 顆星星就能玩陀螺喔！", src="zhuyin.js topsNoTicketSay（10-12 陀螺沒券）",
                    range=f"n = 1..{TOPS_STARS}（每 {TOPS_STARS} 顆星星換 1 張陀螺券）", suggestion=f"展開成 {TOPS_STARS} 句預錄。"))
for n in range(1, TOPS_STARS + 1):
    add(f"tops_need_{n}", f"再拿 {n} 顆星星就能玩陀螺喔！", "dynamic", "zhuyin.js topsNoTicketSay（10-12）", tts=f"再拿{CN_NUM[n]}顆星星就能玩陀螺喔！", n=n)

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
