// ===================== 注音小島：注音戰鬥陀螺（拼 5 個字→變 5 顆陀螺→一對一對戰） =====================
// 規格：docs/zhuyin-tops-spec.md。給 5 歲小孩：用大顆注音鍵盤拼字（學注音的核心）、選字、湊滿 5 個字下場；
// 字形決定陀螺能力（字典離線預算，js/zhuyin-tops-dict.json），整句戰力公式在 js/zhuyin-tops-power.js（後端 GAS 用同一份），
// 對戰物理在 js/zhuyin-tops-sim.js（確定性：同樣兩句每次結果一樣）。遊戲不唸小孩打的字，只唸固定台詞（LINES）。
//
// 介面（主程式照這個接，仿 zhuyin-deliver.js）：
//   createTopsGame(root, api) → { start(opts), stop(), relayout(), state(), debug }
//     start({ opponent })：opponent＝{ p, z? } 指定對手（不給＝從排行榜＋島上傳說挑戰力最接近的）
//   api（都可省略的標 ?）：
//     say talk play later paused     跟其他遊戲一樣（later＝gLater，暫停凍得住；play 名稱不存在要安靜略過）
//     onWin(info)                    分出勝負當下呼叫一次（主程式馬上存檔）：
//                                    { win, power, phrase, z, score:[我,對手], opponent:{p,power}, rounds:[{ i, me, them, win, how }], bonuses:[{id,name,value}],
//                                      record（＝打破我家排行第一名）, home（更新後的我家排行前 5）}
//     onSubmit(phrase, power)        可能進全島榜前 5 才呼叫（只送詞句本身＋前端算的戰力；伺服器要自己重算）；
//                                    可回傳 Promise<{ pending?, rank? }> → pending＝顯示「審核後就會上榜喔！」
//     leaderboard()                  Promise<{ island:[{p,power}], home:[{p,power,z?}] }>（舊格式：直接回陣列＝island）
//     tickets()  useTicket()         剩幾張陀螺券；按「下場！」那一刻才 useTicket()（打字階段離開不扣券）
//     firstFree?()                   true＝第一次免費（沒券也能玩；主程式的 useTicket 自己記 freeUsed）
//     needStars?()                   沒券時顯示「再拿 N 顆星星就能玩」的 N
//     onExit?({ why })               要回小島（沒券、結算按 🏝️）；why＝"noticket"／"done"
//     onFail?({ why })               "dict"（字典載不到／15 秒逾時）／"nowebgl"／"contextlost"／"morph"（變身流程出錯）
//     dictUrl?                       字典網址（主程式要加 ?v= 時用）
//     eggs?()  setEggs?(list)        陀螺蛋（沒券時打好的句子，最多 3 顆）[{p, z:[5 個注音]}]；沒給＝只存在記憶體
//     starsBank?()                   集點卡：存著換券的星星 0..15（沒給＝用 15 − needStars() 推）
//     leaderboard() 回傳可多帶 recent:[{p, o}]（最近對戰紀錄：詞句 p 打過對手 o；同一句再下場時避開）
//     speed?                         測試用：遊戲時鐘倍速
// 計時：純畫面的動畫、對戰播放走自己的遊戲時鐘（暫停時不走、⏩ 會加速）；其他計時（語音保底、沒券自動回小島）走 api.later。
// stop()：dispose renderer、停 rAF、作廢所有舊回呼（run 號碼）、清語音佇列。
import * as THREE from "three";
import * as TP from "./zhuyin-tops-power.js?v=1";          // ?v=1：跟 js/zhuyin-tops-sim.js 的 import 網址完全一樣（同一份模組）；改了一起升
import { SIM, topParams, simulateMatch, bonusHits, boostStats, BOOST } from "./zhuyin-tops-sim.js?v=1";
import { WORDS, PHRASES, FRIENDS } from "./zhuyin-words.js";   // 兒童常用字（候選字排前面）；網址跟 js/zhuyin.js 一樣（同一份，不會再抓一次）

const ROOT = new URL("../", import.meta.url).href;
export const DICT_URL = ROOT + "js/zhuyin-tops-dict.json?v=1";
export const CTX = { made: 0, live: 0 };                   // WebGL context 計數（測試查洩漏）

// ===================== 台詞（tools/voice/build_lines.py 逐句斷言；不唸小孩打的字） =====================
export const LINES = {
  intro: "用注音拼出五個字，變成戰鬥陀螺！",
  noName: "不要打自己或別人的名字喔！",
  first: "先選一個符號。",
  tone: "最後按聲調，字就會跑出來！",
  pick: "選好了就按確定。",
  bad: "這個拼不出字喔，再試試看！",
  full: "五個字都好了，可以下場囉！",
  inspire: "這句怎麼樣？",
  morph: "變身！",
  power: "戰力出來囉！",
  vs: "對手來了！",
  fight: "陀螺，發射！",
  roundWin: "這回合你贏了！",
  roundLose: "這回合對手贏了！",
  out: "撞出場了！",
  stop: "停下來了！",
  time: "時間到，看誰轉得久！",
  last: "最後一擊！",
  win: "你贏了！你的陀螺最強！",
  lose: "差一點點！再拼一句更強的吧！",
  record: "新紀錄！",
  pending: "審核後就會上榜喔！",
  ranked: "上榜了！",
  noTicket: "再收集一些星星，就能玩陀螺囉！",
  guide: "跟著發亮的按鍵，拼出最後一個字！",
  eggMode: "沒有陀螺券也可以打字，打好的句子會變成陀螺蛋！",
  eggSaved: "陀螺蛋存好了！拿到陀螺券就能孵出來對戰！",
  eggAsk: "你有陀螺蛋！要孵出來對戰嗎？",
  starCard: "集滿十五顆星星，就能換一張陀螺券！",
  rematch: "換個對手，再打一次！",
  loseRematch: "差一點點！可以換個對手再打一次喔！",
  cheer: "加油！加油！",
  cheerHint: "點畫面，幫你的陀螺加油！",
  vsPre: "對手是：",
};
// 內建詞句（骰子詞庫、島上傳說）有預錄配音：唸成「宇宙強爸爸！」；對手是內建詞句時唸「對手是：」＋「宇宙強爸爸！」（兩段，見 js/zhuyin-voice.js 的 split）
export const sayPhrase = p => p + "！";
export const ROUND_LINES = ["第一回合！", "第二回合！", "第三回合！", "第四回合！", "第五回合！"];
// 加成名稱（跟 zhuyin-tops-power.js 的 TOPS_BONUS 一樣；這裡再列一次是為了讓 build_zhuyin_ui.py 掃到注音——測試會比對兩邊一致）
export const BONUS_TEXT = { double: "疊字加成！", rhyme: "押韻加成！", tone: "同聲調加成！", animal: "動物加成！", color: "顏色加成！", strong: "強字加成！" };
// 音效（audio/sfx 現有的名字；音訊組做了專屬的 tops_* 再換掉這張表）
export const SFX = { key: "tap", toneKey: "select", bad: "ng", pick: "pop", ok: "ok", morph: "hatch", ding: "ding", coin: "coin", launch: "whoosh", clash: "tap", out: "splash", topple: "flip", roundWin: "star", roundLose: "ng", win: "win", lose: "flip", record: "unlock", go: "unlock", cheer: "star", egg: "pop", boost: "coin" };
// 等級徽章（10-12 櫻木：數字看不懂誰強 → 長條＋徽章）。門檻照實際分佈（tools/zy-test/tops.js 印的：常用字詞句中位約 4700、p90 約 5900）：
//   銅 <4200（約 2 成）、銀 4200–5199（約 4 成）、金 5200–6199（約 3 成）、彩虹 ≥6200（約 1 成）
export const TIERS = [{ min: 0, k: 1, name: "銅陀螺", ico: "🥉" }, { min: 4200, k: 2, name: "銀陀螺", ico: "🥈" }, { min: 5200, k: 3, name: "金陀螺", ico: "🥇" }, { min: 6200, k: 4, name: "彩虹陀螺", ico: "🌈" }];
export const tierOf = p => TIERS.reduce((a, t) => (p >= t.min ? t : a), TIERS[0]);

// 🎲 隨機靈感（[國字, 注音]；注音照台灣讀音、跟小孩用鍵盤拼的一致——build_dict.py 會強制收這些讀音、測試逐字驗證拼得出來）
export const INSPIRE = [
  ["宇宙強爸爸", "ㄩˇ ㄓㄡˋ ㄑㄧㄤˊ ㄅㄚˋ ㄅㄚ˙"], ["超級賽亞人", "ㄔㄠ ㄐㄧˊ ㄙㄞˋ ㄧㄚˋ ㄖㄣˊ"], ["努力小紅帽", "ㄋㄨˇ ㄌㄧˋ ㄒㄧㄠˇ ㄏㄨㄥˊ ㄇㄠˋ"],
  ["紅色翹翹板", "ㄏㄨㄥˊ ㄙㄜˋ ㄑㄧㄠˋ ㄑㄧㄠˋ ㄅㄢˇ"], ["勇敢小兔子", "ㄩㄥˇ ㄍㄢˇ ㄒㄧㄠˇ ㄊㄨˋ ㄗ˙"], ["無敵大番薯", "ㄨˊ ㄉㄧˊ ㄉㄚˋ ㄈㄢ ㄕㄨˇ"],
  ["閃電小烏龜", "ㄕㄢˇ ㄉㄧㄢˋ ㄒㄧㄠˇ ㄨ ㄍㄨㄟ"], ["跳舞的恐龍", "ㄊㄧㄠˋ ㄨˇ ㄉㄜ˙ ㄎㄨㄥˇ ㄌㄨㄥˊ"], ["會飛的饅頭", "ㄏㄨㄟˋ ㄈㄟ ㄉㄜ˙ ㄇㄢˊ ㄊㄡ˙"],
  ["媽媽的拖鞋", "ㄇㄚ ㄇㄚ˙ ㄉㄜ˙ ㄊㄨㄛ ㄒㄧㄝˊ"], ["彩虹棒棒糖", "ㄘㄞˇ ㄏㄨㄥˊ ㄅㄤˋ ㄅㄤˋ ㄊㄤˊ"], ["愛睡覺的貓", "ㄞˋ ㄕㄨㄟˋ ㄐㄧㄠˋ ㄉㄜ˙ ㄇㄠ"],
  ["火箭吃布丁", "ㄏㄨㄛˇ ㄐㄧㄢˋ ㄔ ㄅㄨˋ ㄉㄧㄥ"], ["超人在刷牙", "ㄔㄠ ㄖㄣˊ ㄗㄞˋ ㄕㄨㄚ ㄧㄚˊ"], ["香蕉大怪獸", "ㄒㄧㄤ ㄐㄧㄠ ㄉㄚˋ ㄍㄨㄞˋ ㄕㄡˋ"],
  ["冰箱裡的龍", "ㄅㄧㄥ ㄒㄧㄤ ㄌㄧˇ ㄉㄜ˙ ㄌㄨㄥˊ"], ["阿公的假牙", "ㄚ ㄍㄨㄥ ㄉㄜ˙ ㄐㄧㄚˇ ㄧㄚˊ"], ["鯊魚吃冰棒", "ㄕㄚ ㄩˊ ㄔ ㄅㄧㄥ ㄅㄤˋ"],
  ["神奇的襪子", "ㄕㄣˊ ㄑㄧˊ ㄉㄜ˙ ㄨㄚˋ ㄗ˙"], ["大象坐滑梯", "ㄉㄚˋ ㄒㄧㄤˋ ㄗㄨㄛˋ ㄏㄨㄚˊ ㄊㄧ"], ["熊貓愛跳舞", "ㄒㄩㄥˊ ㄇㄠ ㄞˋ ㄊㄧㄠˋ ㄨˇ"],
  ["宇宙大泡泡", "ㄩˇ ㄓㄡˋ ㄉㄚˋ ㄆㄠˋ ㄆㄠˋ"], ["金色大雞腿", "ㄐㄧㄣ ㄙㄜˋ ㄉㄚˋ ㄐㄧ ㄊㄨㄟˇ"], ["爺爺的鬍子", "ㄧㄝˊ ㄧㄝ˙ ㄉㄜ˙ ㄏㄨˊ ㄗ˙"],
  ["飛天小豬豬", "ㄈㄟ ㄊㄧㄢ ㄒㄧㄠˇ ㄓㄨ ㄓㄨ"], ["旋轉小飯糰", "ㄒㄩㄢˊ ㄓㄨㄢˇ ㄒㄧㄠˇ ㄈㄢˋ ㄊㄨㄢˊ"], ["雷電小蝸牛", "ㄌㄟˊ ㄉㄧㄢˋ ㄒㄧㄠˇ ㄍㄨㄚ ㄋㄧㄡˊ"],
];
// 島上傳說（全島榜一開始的內容＝阿葉舉的例子；也是預設對手）
export const LEGENDS = ["紅色翹翹板", "超級賽亞人", "宇宙強爸爸", "勇敢小兔子", "努力小紅帽"];

// 注音鍵盤：4 排 × 11 鍵（聲母 2 排、介音＋韻母、韻母＋聲調＋確定）；"1"＝一聲、back＝⌫、ok＝確定
export const KB = [
  ["ㄅ", "ㄆ", "ㄇ", "ㄈ", "ㄉ", "ㄊ", "ㄋ", "ㄌ", "ㄍ", "ㄎ", "ㄏ"],
  ["ㄐ", "ㄑ", "ㄒ", "ㄓ", "ㄔ", "ㄕ", "ㄖ", "ㄗ", "ㄘ", "ㄙ", "back"],
  ["ㄧ", "ㄨ", "ㄩ", "ㄚ", "ㄛ", "ㄜ", "ㄝ", "ㄞ", "ㄟ", "ㄠ", "ㄡ"],
  ["ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄦ", "1", "ˊ", "ˇ", "ˋ", "˙", "ok"],
];
const TONE_MARK = { 1: "", "ˊ": "ˊ", "ˇ": "ˇ", "ˋ": "ˋ", "˙": "˙" };
const STAT_ICON = ["⚖️", "🌀", "⚔️", "🛡️"], STAT_NAME = ["重量", "穩定", "攻擊", "防禦"];
const STAT_COLOR = ["#9b6bff", "#1fb985", "#ff5a4f", "#3d8bff"];
const HAN_FONT = '"PingFang TC","Microsoft JhengHei","Noto Sans TC","Heiti TC",sans-serif';

// ===================== 字典（只有這個遊戲才載） =====================
// 15 秒逾時（10-12 里維）：網路卡住時不會一直轉圈，失敗走 onFail("dict") 回小島
let dictP = null;
export function loadDict(url = DICT_URL, ms = 15000) {
  if (!dictP) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null, tm = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
    dictP = fetch(url, ctl ? { signal: ctl.signal } : undefined).then(r => { if (!r.ok) throw new Error("dict " + r.status); return r.json(); }).then(TP.decodeDict)
      .then(D => { clearTimeout(tm); return D; }, e => { clearTimeout(tm); dictP = null; throw e; });
  }
  return dictP;
}

// ===================== 候選字（10-12 櫻木） =====================
// 兒童常用字排最前面：遊戲詞庫（js/zhuyin-words.js 的 WORDS／PHRASES／FRIENDS，執行時讀）、骰子詞庫（INSPIRE）、下面這串
//   （配送站商品與禮物 js/zhuyin-deliver.js 的 GOODS／GIFTS、寵物名 js/zhuyin-rewards.js 的 PETS——那兩個檔要載 three／太大，這裡抄一份；tools/zy-test/tops.js 會比對有沒有漏）
export const KID_EXTRA = "帽子蘋果香蕉西瓜麵包牛奶小花花圈背包派對帽披風翅膀皇冠彩虹披風小熊小兔小貓小狐狸熊貓企鵝青蛙小獅子小狗小雞小豬乳牛猴子無尾熊長頸鹿老虎小鹿鸚鵡蜜蜂螃蟹河狸山豬北極熊毛毛蟲小象小恐龍小鯨魚彩虹小龍";
let KID = null, EMO = null;
function kidSets() {
  if (KID) return;
  KID = new Set(); EMO = Object.create(null);
  const add = s => { for (const c of String(s || "")) if (c >= "㐀" && c <= "鿿") KID.add(c); };
  for (const w of WORDS) {
    add(w.h); const cs = [...w.h];                            // 具體名詞附小 emoji：單字詞（貓🐱）、「X子／X兒」（兔子 → 兔🐰）
    if (w.e && (cs.length === 1 || (cs.length === 2 && (cs[1] === "子" || cs[1] === "兒"))) && !EMO[cs[0]]) EMO[cs[0]] = w.e;
  }
  PHRASES.forEach(p => add(p.h)); FRIENDS.forEach(f => add(f.name)); INSPIRE.forEach(x => add(x[0])); add(KID_EXTRA);
}
export const isKidChar = c => (kidSets(), KID.has(c));
export const emojiOf = c => (kidSets(), EMO[c] || "");
// 拼好的音節 → [{ch, z}]：這個聲調的字（兒童常用字在前、其餘照字頻）→ 同音節其他聲調的字（三聲變調：「勇敢」聽成 ㄩㄥˊ 也找得到「勇」；
//   別的聲調的字帶它自己的注音）。這個聲調本身沒有字也照樣列別的聲調（ㄩㄥˊ 沒有字，「勇」ㄩㄥˇ 排第一）。輕聲沿用字典的退回規則（爸爸的第二個爸＝ㄅㄚ˙）。
export function candList(D, syl) {
  kidSets();
  const own = TP.candidates(D, syl);
  const last = syl.slice(-1), tone = "ˊˇˋ˙".includes(last) ? last : "", base = tone ? syl.slice(0, -1) : syl;
  const seen = new Set(), out = [], kidFirst = l => l.filter(c => KID.has(c)).concat(l.filter(c => !KID.has(c)));
  for (const c of kidFirst(own)) if (!seen.has(c)) { seen.add(c); out.push({ ch: c, z: syl }); }
  if (tone !== "˙") {
    const more = [];
    for (const t of ["", "ˊ", "ˇ", "ˋ"]) { if (t === tone) continue; const s = base + t; for (const c of (D.cand[s] || "")) if (!seen.has(c)) { seen.add(c); more.push({ ch: c, z: s }); } }
    more.sort((a, b) => (KID.has(b.ch) - KID.has(a.ch)) || (D.idx[a.ch] - D.idx[b.ch]));
    out.push(...more);
  }
  return out;
}
// 有字的音節（不看聲調）拆成 聲母／介音／韻母：鍵盤灰鍵用（按下去之後還拼得出字嗎）
let BASES = null;
function basesOf(D) {
  if (BASES && BASES.D === D) return BASES.list;
  const seen = new Set(), list = [];
  for (const s of D.syl) {
    if (!(D.cand[s] || "").length) continue;
    const b = "ˊˇˋ˙".includes(s.slice(-1)) ? s.slice(0, -1) : s; if (seen.has(b)) continue; seen.add(b);
    const p = TP.splitSyl(b); if (p) list.push(p);
  }
  BASES = { D, list }; return list;
}
// 這個組合（不管先按哪個）之後還接得下去嗎
export const compOk = (D, c) => basesOf(D).some(p => (!c.ini || p.ini === c.ini) && (!c.med || p.med === c.med) && (!c.fin || p.fin === c.fin));

// 我家排行：同一句只留最高、照戰力排、前 5
export function homeInsert(list, e) {
  const out = (list || []).filter(x => x && x.p !== e.p).concat([e]).sort((a, b) => b.power - a.power || (a.p < b.p ? -1 : 1));
  return out.slice(0, 5);
}
// 詞句 → 每個字的注音：隨機靈感／打字時記下的 → 字典主要讀音
export function zOf(p, D, known) {
  const hit = INSPIRE.find(x => x[0] === p);
  if (hit) return hit[1].split(" ");
  if (known && known.length === p.length) return known;
  return [...p].map(c => (D ? TP.readingOf(c, D) : "") || "");
}

// ===================== 小工具 =====================
const TONE_NUM = { "ˊ": 2, "ˇ": 3, "ˋ": 4, "˙": 5 };
function acSpan(ch, z, cls = "") {                          // 國字＋注音（跟 zhuyin-ann.js 一樣的標記，自動注音會跳過 .ac）
  const s = document.createElement("span"); s.className = "ac" + (cls ? " " + cls : ""); s.textContent = ch;
  if (z) { const t = TONE_NUM[z.slice(-1)] || 0, sym = t ? z.slice(0, -1) : z; s.dataset.z = sym; s.classList.add("n" + Math.min(4, sym.length)); if (t) s.classList.add("t" + t); }
  return s;
}
// 自動旁注音會標錯的詞放這裡自己標（10-12：原本把「下場/出場」的場改成 ㄔㄤˇ，查證教育部辭典台灣讀 ㄔㄤˊ＝自動注音本來就對 → 清空）
const ZFIX = {};
function zText(parent, text) {
  const keys = Object.keys(ZFIX);
  if (!keys.length) { parent.appendChild(document.createTextNode(text)); return parent; }   // 空的 RegExp 會無限迴圈
  const re = new RegExp(keys.join("|"), "g"); let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const zs = ZFIX[m[0]].split(" "); [...m[0]].forEach((c, i) => parent.appendChild(acSpan(c, zs[i])));
    last = m.index + m[0].length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  return parent;
}
function phraseEl(p, zs, cls = "tp-ph") { const e = document.createElement("span"); e.className = cls; [...p].forEach((c, i) => e.appendChild(acSpan(c, zs && zs[i]))); return e; }
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const BOWL_A = 0.055;                                       // 碗面高度 y＝BOWL_A × r²（拋物面＝物理裡往中心拉的力跟距離成正比）
const bowlY = r2 => BOWL_A * r2;

// 主色：四項能力最突出的那項（紫＝重、綠＝穩、紅＝攻、藍＝防），用字的雜湊微調明暗
function topColor(st, ch) {
  let k = 0; for (let i = 1; i < 4; i++) if (st[i] > st[k]) k = i;
  const c = new THREE.Color(STAT_COLOR[k]), hsl = {}; c.getHSL(hsl);
  const h = TP.hashStr(ch);
  c.setHSL((hsl.h + ((h % 21) - 10) / 360 + 1) % 1, clamp(hsl.s + ((h >> 5) % 11 - 5) / 100, 0, 1), clamp(hsl.l + ((h >> 9) % 13 - 6) / 100, 0.3, 0.7));
  return c;
}

// ===================== 3D 世界（變身＋對戰共用；dispose() 全部收乾淨） =====================
function createWorld(host, o) {
  const W = { dead: false, tops: [], tw: [], sparks: null, flashes: [], shake: 0, size: [1, 1], camMode: "morph", zoom: null, gt: 0 };
  const own = new Set(), keep = x => { own.add(x); return x; };
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  CTX.made++; CTX.live++;
  const PR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(PR);
  W.lowPower = on => { const pr = on ? 1 : PR; if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr); };   // 結算期間降到 1（10-12 里維：省電；setPixelRatio 會照目前大小重設畫布）
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; W.shDirty = true; W.shN = 0;   // 效能體檢 10-12：陰影由 W.frame 決定什麼時候重畫（對戰中每格、變身時 10 次／秒）
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  const lost = e => { e.preventDefault(); W.isLost = true; clearTimeout(W.lostT); W.lostT = setTimeout(() => { if (W.isLost && !W.dead && o.onFail) o.onFail("contextlost"); }, 5000); };
  const restored = () => { W.isLost = false; clearTimeout(W.lostT); };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  renderer.domElement.addEventListener("webglcontextrestored", restored);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(36, 1, 0.5, 120);
  W.scene = scene; W.cam = cam;

  function canvasTex(w, h, draw) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = keep(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  // 背景：晚上的體育館（深藍紫漸層＋中間一圈暖光）
  scene.background = canvasTex(16, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#160f3d"); gr.addColorStop(0.45, "#2d1f6b"); gr.addColorStop(0.75, "#5a3394"); gr.addColorStop(1, "#8a4aa8"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  scene.fog = new THREE.Fog(0x2d1f6b, 34, 70);
  scene.add(new THREE.HemisphereLight(0xdfe4ff, 0x40306f, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
  sun.position.set(-5, 14, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 2, far: 40 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3; sun.shadow.intensity = 0.65;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xb48cff, 0.9); rim.position.set(6, 5, -8); scene.add(rim);

  // ---------- 地板＋觀眾燈 ----------
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#2a2160"; g.fillRect(0, 0, w, h);
    for (let r = 40; r < 256; r += 26) { g.strokeStyle = r % 52 ? "rgba(255,255,255,0.05)" : "rgba(160,130,255,0.12)"; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke(); }
  });
  const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(26, 64)), keep(new THREE.MeshLambertMaterial({ map: floorTex })));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true; scene.add(floor);
  // 碗：Lathe 剖面（碗面＝拋物面，到碗口 5.45 → 碗唇 → 外牆斜下去）；顏色用頂點色（環狀靶心＋外圈危險區）
  const prof = [], cols = [];
  const ringCol = r => r < 0.55 ? "#ffd54a" : r < 1.1 ? "#ffffff" : r < 1.25 ? "#ffb03b" : r > 4.55 ? (Math.floor(r * 6) % 2 ? "#ff6b6b" : "#ffe1e1") : (Math.floor((r - 1.25) / 0.82) % 2 ? "#e9e3ff" : "#f8f6ff");
  const edges = [0.55, 1.1, 1.25]; for (let r = 1.25 + 0.82; r < 4.55; r += 0.82) edges.push(r); for (let r = 4.55; r < 5.45; r += 1 / 6) edges.push(r);
  const RS = [0]; for (let i = 1; i <= 60; i++) RS.push(5.45 * i / 60);
  const allR = [...new Set([...RS, ...edges.map(e => +e.toFixed(4))])].sort((a, b) => a - b);
  for (const r of allR) {                                   // 邊界處放兩個點（同位置、不同顏色）＝顏色切得乾淨
    const isEdge = edges.some(e => Math.abs(e - r) < 1e-4);
    if (isEdge && r > 0) { prof.push(new THREE.Vector2(r, bowlY(r * r))); cols.push(ringCol(r - 1e-3)); }
    prof.push(new THREE.Vector2(r, bowlY(r * r))); cols.push(ringCol(r + 1e-3));
  }
  const yr = bowlY(5.45 * 5.45);
  [[5.62, yr + 0.06, "#ffffff"], [5.78, yr + 0.02, "#ffffff"], [5.86, yr - 0.12, "#7b5bd6"], [6.5, 0.0, "#5a3fb4"]].forEach(([r, y, c]) => { prof.push(new THREE.Vector2(r, y)); cols.push(c); });
  const bowlGeo = keep(new THREE.LatheGeometry(prof, 72));
  { const n = bowlGeo.attributes.position.count, arr = new Float32Array(n * 3), cc = new THREE.Color(); for (let v = 0; v < n; v++) { cc.set(cols[v % prof.length]); arr[v * 3] = cc.r; arr[v * 3 + 1] = cc.g; arr[v * 3 + 2] = cc.b; } bowlGeo.setAttribute("color", new THREE.BufferAttribute(arr, 3)); }
  const bowl = new THREE.Mesh(bowlGeo, keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  bowl.receiveShadow = true; scene.add(bowl);
  // 碗口彩虹燈圈（撞擊時亮一下）
  const rimN = 48, rimGeo = keep(new THREE.SphereGeometry(0.09, 8, 6)), rimMat = keep(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const rimLights = new THREE.InstancedMesh(rimGeo, rimMat, rimN); const _m = new THREE.Matrix4(), _c = new THREE.Color();
  for (let i = 0; i < rimN; i++) { const a = i / rimN * Math.PI * 2; _m.makeTranslation(Math.cos(a) * 5.7, yr + 0.13, Math.sin(a) * 5.7); rimLights.setMatrixAt(i, _m); rimLights.setColorAt(i, _c.setHSL(i / rimN, 0.9, 0.62)); }
  scene.add(rimLights); W.rimFlash = 0;
  // 觀眾燈：外圈一排會閃的小燈
  const crowdN = 36, crowd = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.16, 8, 6)), keep(new THREE.MeshBasicMaterial({ toneMapped: false })), crowdN);
  for (let i = 0; i < crowdN; i++) { const a = i / crowdN * Math.PI * 2; _m.makeTranslation(Math.cos(a) * 8.6, 0.25, Math.sin(a) * 8.6); crowd.setMatrixAt(i, _m); crowd.setColorAt(i, _c.set(["#ffd54a", "#ff7eb6", "#7ee0ff", "#a6ff7e"][i % 4])); }
  scene.add(crowd);

  // ---------- 火花＋撞擊光圈 ----------
  const dot = canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,240,180,0.9)"); gr.addColorStop(1, "rgba(255,200,80,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const SPN = 260, spPos = new Float32Array(SPN * 3), spCol = new Float32Array(SPN * 3), spVel = new Float32Array(SPN * 3), spLife = new Float32Array(SPN);
  const spGeo = keep(new THREE.BufferGeometry()); spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3));
  const sparks = new THREE.Points(spGeo, keep(new THREE.PointsMaterial({ size: 0.26, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
  sparks.frustumCulled = false; scene.add(sparks); let spNext = 0;
  for (let i = 0; i < SPN; i++) spPos[i * 3 + 1] = -99;
  W.spark = (x, y, z, n, power = 1, hue = null) => {        // hue：0..1 指定色相（加油＝藍、加成＝金）；不給＝橘黃
    for (let k = 0; k < n; k++) {
      const i = spNext; spNext = (spNext + 1) % SPN;
      const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 5) * power, up = 1 + Math.random() * 3.5 * power;
      spPos[i * 3] = x; spPos[i * 3 + 1] = y; spPos[i * 3 + 2] = z; spVel[i * 3] = Math.cos(a) * sp; spVel[i * 3 + 1] = up; spVel[i * 3 + 2] = Math.sin(a) * sp;
      spLife[i] = 0.35 + Math.random() * 0.45; _c.setHSL(hue == null ? 0.08 + Math.random() * 0.08 : hue + (Math.random() - 0.5) * 0.06, 1, 0.55 + Math.random() * 0.35); spCol[i * 3] = _c.r; spCol[i * 3 + 1] = _c.g; spCol[i * 3 + 2] = _c.b;
    }
    spGeo.attributes.color.needsUpdate = true;               // 10-12 里維：沒有這行顏色永遠是一開始的 0（火花全黑，只剩貼圖的白）
  };
  const ringGeo = keep(new THREE.RingGeometry(0.7, 0.95, 40));
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }))); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); W.flashes.push({ m, t: 1 }); }
  W.flash = (x, y, z, s) => { const f = W.flashes.reduce((a, b) => a.t > b.t ? a : b); f.t = 0; f.s = s; f.m.position.set(x, y + 0.05, z); f.m.visible = true; };

  // ---------- 陀螺 ----------
  const faceTex = (ch, z, color) => canvasTex(256, 256, (g) => {
    const c = "#" + color.getHexString(), dk = "#" + color.clone().multiplyScalar(0.62).getHexString();
    g.fillStyle = dk; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.fillStyle = c; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 12; i++) { g.save(); g.translate(128, 128); g.rotate(i / 12 * Math.PI * 2); g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(-4, -118, 8, 14); g.restore(); }
    g.fillStyle = "#fffdf6"; g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2b2440"; g.textAlign = "center"; g.textBaseline = "middle";
    const zs = z || "", t = TONE_NUM[zs.slice(-1)] || 0, sym = t ? zs.slice(0, -1) : zs, hasZ = sym.length > 0;
    g.font = `900 ${hasZ ? 116 : 128}px ${HAN_FONT}`; g.fillText(ch, hasZ ? 110 : 128, 134);
    if (hasZ) {                                               // 直排注音（右邊），聲調在最後一個符號右上；輕聲在最上面
      const s = 30, x = 190, top = 128 - (sym.length - 1) * s * 0.5;
      g.font = `800 ${s}px ${HAN_FONT}`;
      [...sym].forEach((q, i) => g.fillText(q, x, top + i * s));
      if (t >= 2 && t <= 4) { g.font = `900 ${s * 0.95}px ${HAN_FONT}`; g.fillText("ˊˇˋ"[t - 2], x + s * 0.72, top + (sym.length - 1) * s - s * 0.42); }
      if (t === 5) { g.beginPath(); g.arc(x, top - s * 0.78, 4.5, 0, Math.PI * 2); g.fill(); }
    }
  });
  const coneGeo = keep(new THREE.LatheGeometry([[0.001, 0], [0.05, 0.015], [0.1, 0.07], [0.2, 0.18], [0.36, 0.27], [0.5, 0.33]].map(p => new THREE.Vector2(p[0], p[1])), 28));
  const ringGeoT = keep(new THREE.LatheGeometry([[0.5, 0.33], [0.64, 0.38], [0.69, 0.44], [0.65, 0.5], [0.52, 0.54]].map(p => new THREE.Vector2(p[0], p[1])), 32));
  { const n = ringGeoT.attributes.position.count, np = 5, arr = new Float32Array(n * 3);   // 環上亮暗條紋（乘上主色）：轉起來看得出在轉
    for (let v = 0; v < n; v++) { const seg = Math.floor(v / np), k = seg % 4 < 2 ? 1 : 0.62; arr[v * 3] = arr[v * 3 + 1] = arr[v * 3 + 2] = k; } ringGeoT.setAttribute("color", new THREE.BufferAttribute(arr, 3)); }
  const capGeo = keep(new THREE.CylinderGeometry(0.5, 0.53, 0.07, 40)), bladeGeo = keep(new THREE.BoxGeometry(0.26, 0.08, 0.13));
  const auraGeo = keep(new THREE.RingGeometry(0.98, 1.22, 48)), metal = keep(new THREE.MeshLambertMaterial({ color: 0xc3cde0 }));
  const goldGeo = keep(new THREE.RingGeometry(1.26, 1.5, 48));
  W.setGold = (T, on) => { if (T && T.gold) T.gold.visible = !!on; };
  W.makeTop = (ch, z, st, side) => {
    const P = topParams(st), color = topColor(st, ch), dark = color.clone().multiplyScalar(0.7);
    const holder = new THREE.Group(), tilt = new THREE.Group(), spin = new THREE.Group(); holder.add(tilt); tilt.add(spin);
    const matMain = keep(new THREE.MeshLambertMaterial({ color, vertexColors: true })), matDark = keep(new THREE.MeshLambertMaterial({ color: dark }));
    const face = keep(new THREE.MeshLambertMaterial({ map: faceTex(ch, z, color) }));
    const parts = [new THREE.Mesh(coneGeo, metal), new THREE.Mesh(ringGeoT, matMain), new THREE.Mesh(capGeo, [matDark, face, matDark])];
    parts[2].position.y = 0.57;
    const cap = parts.splice(2, 1)[0]; cap.castShadow = true; cap.rotation.y = Math.PI / 2; tilt.add(cap);   // 頂蓋（印字）不跟著轉：字一直看得清楚，轉動靠環上條紋和刀刃看出來
    const nb = 3 + Math.round(P.atk * 3);                    // 攻擊越高刀刃越多（3～6）
    for (let i = 0; i < nb; i++) { const b = new THREE.Mesh(bladeGeo, matDark), a = i / nb * Math.PI * 2; b.position.set(Math.cos(a) * 0.66, 0.44, Math.sin(a) * 0.66); b.rotation.y = -a + 0.5; parts.push(b); }
    for (const p of parts) { p.castShadow = true; spin.add(p); }
    // 腳下的隊伍色圈（我＝藍、對手＝紅）：貼著碗面（placeTop 時轉到碗面法線方向）
    const aura = new THREE.Mesh(auraGeo, keep(new THREE.MeshBasicMaterial({ color: side === "me" ? 0x22b8ff : 0xff3d5a, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })));
    aura.position.y = 0.14; holder.add(aura);   // 稍微浮起來：碗面是彎的，貼太低外緣會沉到碗面下面看不見
    // 金色光圈（有加成的字：10-12 櫻木「加成看得見」）：掛在隊伍色圈外面、跟著它貼碗面；W.setGold 打開
    const gold = new THREE.Mesh(goldGeo, keep(new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })));
    gold.visible = false; aura.add(gold);
    const sc = P.r / 0.69; tilt.scale.setScalar(sc); aura.scale.setScalar(P.r * 1.45);
    scene.add(holder); holder.visible = false;
    const T = { ch, z, st, P, holder, tilt, spin, aura, gold, color, side, S: 1, x: 0, y: 0, ang: 0, wob: Math.random() * 6, fall: null, pop: 1 };
    W.tops.push(T); W.shDirty = true; return T;
  };
  const _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
  W.placeTop = (T, x, y, S) => {
    if (T.x !== x || T.y !== y) W.shDirty = true;
    T.x = x; T.y = y; T.S = S; T.holder.position.set(x, bowlY(x * x + y * y), y);
    _n.set(-2 * BOWL_A * x, 1, -2 * BOWL_A * y).normalize(); T.aura.quaternion.setFromUnitVectors(_z, _n);
  };
  W.removeTops = list => { for (const T of list) { T.holder.removeFromParent(); const i = W.tops.indexOf(T); if (i >= 0) W.tops.splice(i, 1); } W.shDirty = true; };

  // ---------- 鏡頭：把目標放進畫面的某個矩形（上下有介面） ----------
  const tgt = new THREE.Vector3(), camPos = new THREE.Vector3();
  W.fit = (Wpx, Hpx, rect, mode) => {
    W.size = [Wpx, Hpx]; W.rect = rect; W.camMode = mode || W.camMode;
    renderer.setSize(Wpx, Hpx, false); cam.aspect = Wpx / Hpx;
    const el = W.camMode === "battle" ? 0.95 : 0.74, R = W.camMode === "battle" ? 5.95 : 5.0;
    const hv = W.camMode === "battle" ? R * Math.sin(el) + 1.0 * Math.cos(el) : 1.2 * Math.sin(el) + 0.9 * Math.cos(el), hh = R;
    const tf = Math.tan(cam.fov * Math.PI / 360);
    const dV = hv / tf * (Hpx / rect.h), dH = hh / (tf * cam.aspect) * (Wpx / rect.w);
    W.base = { el, dist: Math.max(dV, dH) * 1.04, ty: W.camMode === "battle" ? 0.55 : 0.75, R };
    cam.setViewOffset(Wpx, Hpx, Wpx / 2 - (rect.x + rect.w / 2), Hpx / 2 - (rect.y + rect.h / 2), Wpx, Hpx);
    W.applyCam(0);
  };
  W.applyCam = dt => {
    if (!W.base) return;
    let { el, dist, ty } = W.base, tx = 0, tz = 0;
    if (W.camMode === "battle") {                            // 跟著兩顆陀螺：靠近時拉近（陀螺變大、比較有張力），分開時拉遠
      const f = W.follow || { x: 0, z: 0, r: W.base.R }, c = W.camCur || (W.camCur = { ...f }), k = Math.min(1, dt * 2.4);
      c.x += (f.x - c.x) * k; c.z += (f.z - c.z) * k; c.r += (f.r - c.r) * k;
      dist *= c.r / W.base.R; tx = c.x; tz = c.z;
    }
    if (W.zoom) { W.zoom.k = Math.min(1, W.zoom.k + dt * 2.2); const k = ease(W.zoom.k); dist *= 1 - 0.16 * k; ty += 0.15 * k; }   // 慢動作：再推近一點（中心照樣跟著兩顆陀螺）
    else if (W.zoomOut != null) { W.zoomOut = Math.max(0, W.zoomOut - dt * 1.6); }
    tgt.set(tx, ty, tz); camPos.set(tx, ty + Math.sin(el) * dist, tz + Math.cos(el) * dist);
    if (W.shake > 0) { camPos.x += (Math.random() - 0.5) * W.shake * 0.5; camPos.y += (Math.random() - 0.5) * W.shake * 0.35; W.shake = Math.max(0, W.shake - dt * 3); }
    cam.position.copy(camPos); cam.lookAt(tgt); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  };
  const _v = new THREE.Vector3();
  W.project = (x, y, z) => { _v.set(x, y, z).project(cam); return { x: (_v.x + 1) / 2 * W.size[0], y: (1 - _v.y) / 2 * W.size[1], behind: _v.z > 1 }; };
  W.topScreen = T => { const p = T.holder.position; return W.project(p.x, p.y + 0.95 * T.P.r / 0.69, p.z); };
  W.tween = (dur, fn, done) => { W.tw.push({ t: 0, dur, fn, done }); };

  // ---------- 每格 ----------
  W.frame = (dt, real) => {
    if (W.dead) return;
    W.gt += dt;
    for (let i = W.tw.length - 1; i >= 0; i--) { const t = W.tw[i]; t.t += dt; const u = Math.min(1, t.t / t.dur); t.fn(u); if (u >= 1) { W.tw.splice(i, 1); t.done && t.done(); } }
    for (const T of W.tops) {
      if (!T.holder.visible) continue;
      const S = T.S;
      T.ang += (5 + 34 * S) * dt; T.spin.rotation.y = T.ang;
      if (T.fall) {                                            // 倒下／飛出場
        const F = T.fall; F.t += dt;
        if (F.kind === "out") {
          F.x += F.vx * dt; F.z += F.vz * dt; F.vy -= 14 * dt; F.y += F.vy * dt; const r2 = F.x * F.x + F.z * F.z;
          const surf = r2 < 5.45 * 5.45 ? bowlY(r2) : -9; if (F.y < surf && r2 < 5.45 * 5.45) { F.y = surf; F.vy = Math.abs(F.vy) * 0.3; }
          T.holder.position.set(F.x, F.y, F.z); T.tilt.rotation.z += dt * 7; T.tilt.rotation.x += dt * 4;
          if (F.t > 1.6) T.holder.visible = false;
        } else {
          const u = Math.min(1, F.t / 0.75); T.tilt.rotation.set(Math.cos(F.dir) * 1.15 * easeOutBack(u) * 0.95, 0, Math.sin(F.dir) * 1.15 * easeOutBack(u) * 0.95);
          T.holder.position.y = bowlY(T.x * T.x + T.y * T.y) + Math.sin(u * Math.PI) * 0.12;
        }
      } else {
        const wob = S < 0.55 ? (0.55 - S) * 0.55 : 0.02;        // 轉慢了開始晃（歲差）
        T.wob += (3 + 7 * (1 - S)) * dt;
        T.tilt.rotation.set(Math.cos(T.wob) * wob, 0, Math.sin(T.wob) * wob);
      }
      T.aura.material.opacity = T.fall ? 0 : 0.45 + 0.45 * Math.min(1, S);
      if (T.gold.visible) T.gold.material.opacity = T.fall ? 0 : 0.6 + 0.35 * Math.sin(W.gt * 6);
    }
    // 火花
    for (let i = 0; i < SPN; i++) {
      if (spLife[i] <= 0) continue;
      spLife[i] -= dt; spVel[i * 3 + 1] -= 9 * dt;
      spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
      if (spLife[i] <= 0) spPos[i * 3 + 1] = -99;
    }
    spGeo.attributes.position.needsUpdate = true;
    for (const f of W.flashes) { if (f.t >= 1) { f.m.visible = false; continue; } f.t = Math.min(1, f.t + dt * 2.6); f.m.scale.setScalar(0.6 + f.t * 2.4 * (f.s || 1)); f.m.material.opacity = (1 - f.t) * 0.9; }
    // 燈：碗口彩虹慢慢轉；撞擊時全亮
    W.rimFlash = Math.max(0, W.rimFlash - dt * 2);
    for (let i = 0; i < rimN; i++) rimLights.setColorAt(i, _c.setHSL((i / rimN + W.gt * 0.12) % 1, 0.9, 0.55 + 0.4 * W.rimFlash));
    rimLights.instanceColor.needsUpdate = true;
    if (Math.floor(W.gt * 3) !== W.crowdT) { W.crowdT = Math.floor(W.gt * 3); for (let i = 0; i < crowdN; i++) crowd.setColorAt(i, _c.set(["#ffd54a", "#ff7eb6", "#7ee0ff", "#a6ff7e"][(i + W.crowdT) % 4]).multiplyScalar((i + W.crowdT) % 3 ? 0.55 : 1)); crowd.instanceColor.needsUpdate = true; }
    W.applyCam(dt);
    // 陰影（只有陀螺會投影）：對戰中／結算繞圈（W.liveShadow）、陀螺彈出等補間進行中每格重畫；變身時陀螺只在原地轉，每 3 格（約 10 次／秒）；暫停不畫（效能體檢 10-12：原本每格）
    if (W.shDirty || (dt > 0 && (W.liveShadow || W.tw.length || ++W.shN % 3 === 0))) { renderer.shadowMap.needsUpdate = true; W.shDirty = false; }
    if (!W.isLost) renderer.render(scene, cam);
  };
  W.stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures, pr: renderer.getPixelRatio(),
    sparkColor: (() => { let m = 0; for (let i = 0; i < SPN; i++) if (spLife[i] > 0) m = Math.max(m, spCol[i * 3], spCol[i * 3 + 1], spCol[i * 3 + 2]); return m; })(), sparks: spLife.reduce((a, l) => a + (l > 0), 0),
    gold: W.tops.filter(T => T.gold.visible && T.holder.visible).map(T => T.side + ":" + T.ch) });
  W.dispose = () => {
    if (W.dead) return; W.dead = true;
    const geos = new Set(), mats = new Set();
    scene.traverse(x => { if (x.geometry) geos.add(x.geometry); for (const m of [].concat(x.material || [])) mats.add(m); });
    geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose && m.dispose());
    for (const x of own) if (x && x.dispose) x.dispose();
    if (scene.background && scene.background.dispose) scene.background.dispose();
    try { renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* 已經沒了 */ }
    renderer.domElement.removeEventListener("webglcontextlost", lost); renderer.domElement.removeEventListener("webglcontextrestored", restored); clearTimeout(W.lostT);
    renderer.domElement.remove(); renderer.domElement.width = renderer.domElement.height = 1;   // Safari：縮到 1×1 才會放掉背景緩衝
    CTX.live--;
  };
  W.canvas = renderer.domElement;
  return W;
}

// ===================== 遊戲本體 =====================
export function createTopsGame(root, api) {
  let run = 0, st = null, Dk = null, W = null, raf = 0, E = null, lastMs = 0;
  // 跨局（同一次開頁）記得的：最近對戰（同一句避開打過的對手）、加油教學講過了沒、沒有 api.eggs 時的陀螺蛋
  // （骰子按過幾次記在 st.inspireN：每次進競技場第一次按＝整句填好，之後只填前 4 個字）
  let memEggs = [], saidCheerHint = false;
  const fought = [];                                           // [{p, o}]：這次開頁打過的（存檔的最近紀錄由 leaderboard().recent 給）
  const offs = [];
  const on = (t, ev, fn) => { t.addEventListener(ev, fn); offs.push(() => t.removeEventListener(ev, fn)); };
  const later = (fn, ms) => { const my = run; api.later(() => { if (my === run && st) fn(); }, ms); };
  const SPD = () => Math.max(0.25, +api.speed || 1);
  const play = (n, r) => { try { api.play && api.play(SFX[n] || n, r); } catch (e) { /* 音效失敗不影響遊戲 */ } };
  const paused = () => { try { return !!(api.paused && api.paused()); } catch (e) { return false; } };
  const mk = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
  const btn = (cls, parent, txt, fn, label) => { const b = mk("button", cls, parent, txt); b.type = "button"; if (label) b.setAttribute("aria-label", label); if (fn) b.onclick = e => { if (!st || paused()) return; fn(e); }; return b; };
  const hasTicket = () => { let n = 0, free = false; try { n = +api.tickets() || 0; } catch (e) {} try { free = !!(api.firstFree && api.firstFree()); } catch (e) {} return n > 0 || free; };
  const ticketsN = () => { try { return Math.max(0, +api.tickets() || 0); } catch (e) { return 0; } };
  const isFirstFree = () => { try { return !!(api.firstFree && api.firstFree()); } catch (e) { return false; } };
  const starsBank = () => {
    let n = NaN; try { if (api.starsBank) n = +api.starsBank(); } catch (e) {}
    if (!Number.isFinite(n)) { try { n = api.needStars ? 15 - (+api.needStars() || 15) : 0; } catch (e) { n = 0; } }
    return clamp(Math.floor(n), 0, 15);
  };
  // 陀螺蛋：[{p, z}]，最多 3 顆（新的放最後）
  const getEggs = () => {
    let l = null; try { if (api.eggs) l = api.eggs(); } catch (e) {}
    if (!Array.isArray(l)) l = memEggs;
    return l.filter(e => e && typeof e.p === "string" && [...e.p].length === 5).map(e => ({ p: e.p, z: Array.isArray(e.z) && e.z.length === 5 ? e.z.slice() : zOf(e.p, Dk) }));
  };
  const setEggs = list => { const l = list.slice(-3).map(e => ({ p: e.p, z: e.z.slice() })); memEggs = l; try { api.setEggs && api.setEggs(l.map(e => ({ p: e.p, z: e.z.slice() }))); } catch (e) {} };

  // ---------- 語音：排隊一句一句講 ----------
  const voice = { q: [], busy: false, tok: 0 };
  function talk(text, now = false) {
    if (!st) return;
    if (now) { voice.q.length = 0; voice.busy = false; voice.tok++; }
    voice.q.push(text); st.spoken.push(text);
    if (!voice.busy) pump();
  }
  function pump() {
    const t = voice.q.shift(); if (!t) { voice.busy = false; return; }
    voice.busy = true; const my = ++voice.tok; let done = false;
    const fin = () => { if (done || my !== voice.tok) return; done = true; voice.busy = false; if (voice.q.length) later(pump, 100); };
    try { api.talk(t, fin); } catch (e) { fin(); }
    later(fin, Math.max(1400, t.length * 300));
  }

  // ---------- 遊戲時鐘上的排程（暫停凍住、⏩ 加速） ----------
  const at = (sec, fn) => { const my = run; st.tl.push({ at: st.clock + sec, fn: () => { if (my === run && st) fn(); } }); };
  function runTimeline() { for (let guard = 0; guard < 20; guard++) { let k = -1; for (let i = 0; i < st.tl.length; i++) if (st.tl[i].at <= st.clock && (k < 0 || st.tl[i].at < st.tl[k].at)) k = i; if (k < 0) break; const it = st.tl.splice(k, 1)[0]; it.fn(); if (!st) return; } }

  // ===================== DOM =====================
  function build() {
    root.classList.add("tp-root");
    const wrap = mk("div", "tp-wrap", root);
    const stage = mk("div", "tp-stage", wrap);
    const loading = mk("div", "tp-loading", wrap, "🌀");
    // 打字
    const type = mk("div", "tp-type tp-off", wrap);
    const head = mk("div", "tp-head", type);
    mk("div", "tp-title", head, "⚔️ 注音戰鬥陀螺");
    const tools = mk("div", "tp-tools", head);
    const inspire = btn("tp-btn tp-inspire", tools, "🎲", () => tapInspire(), "隨機靈感"); mk("span", "tp-btn-t", inspire, "隨機靈感");
    const boardBtn = btn("tp-btn tp-boardbtn", tools, "🏆", () => showBoards(), "排行榜");
    const slotrow = mk("div", "tp-slotrow", type), slots = mk("div", "tp-slots", slotrow), slotEls = [];
    for (let i = 0; i < 5; i++) { const b = btn("tp-slot", slots, null, () => tapSlot(i), `第${i + 1}個字`); b.dataset.i = i; slotEls.push(b); }
    const go = btn("tp-go", slotrow, "⚔️", () => tapGo(), "下場"), goT = zText(mk("span", "tp-go-t", go), "下場！");
    const note = mk("div", "tp-note", type, "🙅 不要打自己或別人的名字喔！");
    const candbar = mk("div", "tp-candbar", type);
    const prev = btn("tp-pg tp-prev", candbar, "◀", () => turnPage(-1), "上一頁");
    const cands = mk("div", "tp-cands", candbar);
    const next = btn("tp-pg tp-next", candbar, "▶", () => turnPage(1), "下一頁");
    const tip = mk("div", "tp-tip", candbar);
    const fillAll = btn("tp-btn tp-fillall tp-off", candbar, "✨", () => tapFillAll(), "全部幫我填"); mk("span", "tp-btn-t", fillAll, "全部幫我填");   // 骰子填空引導：真的拼不出來的小孩按這個
    const kb = mk("div", "tp-kb", type), keys = {};
    KB.forEach(row => row.forEach(k => {
      const grp = k === "back" ? "act" : k === "ok" ? "ok" : (k === "1" || TONE_MARK[k] !== undefined) ? "tone" : TP.INITIALS.includes(k) ? "ini" : TP.MEDIALS.includes(k) ? "med" : "fin";
      const b = btn("tp-key tp-" + grp, kb, null, () => tapKey(k), k === "back" ? "刪掉" : k === "ok" ? "確定" : k === "1" ? "一聲" : k); b.dataset.k = k;
      if (k === "back") b.textContent = "⌫";
      else if (k === "ok") mk("span", "tp-key-t", b, "確定");
      else if (k === "1") mk("span", "tp-key-t", b, "一聲");
      else if (grp === "tone") { b.classList.add("tp-tv" + TONE_NUM[k]); mk("span", "tp-key-s", b, k); }
      else mk("span", "tp-key-s", b, k);
      keys[k] = b;
    }));
    // 變身
    const morph = mk("div", "tp-morph tp-off", wrap);
    const mhead = mk("div", "tp-mhead", morph);
    const legend = mk("div", "tp-legend", mhead); STAT_NAME.forEach((n, i) => { const s = mk("span", "tp-leg", legend); s.style.setProperty("--c", STAT_COLOR[i]); mk("i", "", s, STAT_ICON[i]); mk("b", "", s, n); });
    const total = mk("div", "tp-total", mhead); mk("span", "tp-total-l", total, "整句戰力"); const num = mk("span", "tp-num", total, "0");
    const badges = mk("div", "tp-badges", mhead);
    const cards = mk("div", "tp-cards", morph), cardEls = [];
    for (let i = 0; i < 5; i++) cardEls.push(mk("div", "tp-card", cards));
    const vs = mk("div", "tp-vs", morph);
    const vsInfo = mk("div", "tp-vs-info", vs);
    const fight = btn("tp-fight", vs, "⚔️", () => tapFight(), "開戰"); mk("span", "tp-go-t", fight, "開戰！");
    // 對戰
    const hud = mk("div", "tp-hud tp-off", wrap);
    const teams = [mk("div", "tp-team tp-me", hud), mk("div", "tp-team tp-opp", hud)];
    const score = mk("div", "tp-score", hud);
    const tags = [mk("div", "tp-tag tp-me", hud), mk("div", "tp-tag tp-opp", hud)];
    const banner = mk("div", "tp-banner", hud);
    const ff = btn("tp-ff", hud, "⏩", () => toggleFast(), "快轉"); mk("span", "tp-ff-x", ff, "2×");   // 第 4、5 回合自動 2 倍速時亮「2×」
    const cheerHint = mk("div", "tp-cheerhint tp-off", hud, "👆 點畫面幫陀螺加油！");
    // 結算、排行榜、沒券／陀螺蛋
    const result = mk("div", "tp-result tp-off", wrap);
    const msg = mk("div", "tp-msg tp-off", wrap);
    const boards = mk("div", "tp-boardsov tp-off", wrap);
    E = { wrap, stage, loading, type, head, tools, inspire, boardBtn, slotrow, slots, slotEls, go, goT, note, candbar, prev, cands, next, tip, fillAll, kb, keys, morph, mhead, legend, total, num, badges, cards, cardEls, vs, vsInfo, fight, hud, teams, score, tags, banner, ff, cheerHint, result, msg, boards, gfill: [] };
    // 對戰中點畫面＝幫陀螺加油（純表演：火花＋歡呼，不影響結果——對戰早就算好了）
    on(wrap, "pointerdown", e => { if (!st || st.phase !== "battle" || paused() || (e.target && e.target.closest && e.target.closest("button"))) return; cheer(e); });
  }
  function teardown() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    while (offs.length) offs.pop()();
    if (W) { W.dispose(); W = null; }
    if (E) { E.wrap.remove(); E = null; }
    root.classList.remove("tp-root");
  }
  function showOnly(...names) { for (const n of ["type", "morph", "hud", "result", "msg"]) E[n].classList.toggle("tp-off", !names.includes(n)); }

  // ===================== 打字 =====================
  const compSyl = () => st.comp.ini + st.comp.med + st.comp.fin;
  // 沒券也能打字（10-12 櫻木）：打好的句子存成「陀螺蛋」，拿到券再孵出來對戰；有券又有蛋＝先問要不要孵蛋
  function enterTypeOrEggs() { if (hasTicket() && getEggs().length) showEggs(); else enterType(); }
  function enterType() {
    st.phase = "type"; st.slots = [null, null, null, null, null]; st.cur = 0; st.comp = { ini: "", med: "", fin: "" }; st.tone = null; st.cands = []; st.candZ = []; st.sel = 0; st.page = 0; st.saidFull = false; st.guide = null; st.hatch = null;
    st.myTops = st.oppTops = st.cur2 = st.circle = st.match = st.rs = st.win = st.submit = st.opp = st.power = null; st.score = null; st.fast = false; st.tl.length = 0; st.statusEl = null; st.saidSubmit = false;
    E.result.textContent = ""; E.boards.classList.add("tp-off"); E.wrap.classList.remove("tp-slowmo"); E.banner.textContent = "";
    showOnly("type"); E.loading.classList.add("tp-off");
    if (W) { W.dispose(); W = null; }
    E.stage.classList.remove("tp-on");
    st.eggMode = !hasTicket();
    relayout(); paintType();
    if (!st.saidIntro) { st.saidIntro = true; talk(LINES.intro); talk(LINES.noName); if (st.eggMode) { st.saidEggMode = true; talk(LINES.eggMode); } talk(LINES.first); }
    else if (st.eggMode && !st.saidEggMode) { st.saidEggMode = true; talk(LINES.eggMode, true); }
  }
  // 灰鍵（10-12 櫻木）：按下去之後拼不出任何字的符號、這個聲調沒有字的聲調鍵。仍然可以按，只會輕輕搖一下
  function keysOff() {
    const off = new Set(); if (!Dk || !st || st.cur > 4) return off;
    const c = st.comp, base = compSyl();
    if (!st.cands.length) {                                    // 選字中按符號＝先確定預覽的字、再開始拼下一個 → 每個符號都能當開頭，不灰
      for (const k of [...TP.INITIALS, ...TP.MEDIALS, ...TP.FINALS]) {
        const n = { ini: c.ini, med: c.med, fin: c.fin };
        if (TP.INITIALS.includes(k)) n.ini = k; else if (TP.MEDIALS.includes(k)) n.med = k; else n.fin = k;
        if (!compOk(Dk, n)) off.add(k);
      }
    }
    for (const t of ["1", "ˊ", "ˇ", "ˋ", "˙"]) if (!base || !candList(Dk, base + TONE_MARK[t]).length) off.add(t);
    return off;
  }
  function tapGrey(k) {
    shake(E.keys[k]); play("bad", 1.25); st.badCount = (st.badCount || 0) + 1; st.greyTaps = (st.greyTaps || 0) + 1;
    if (!compSyl()) { if (!st.saidGreyFirst) { st.saidGreyFirst = true; talk(LINES.first, true); } }
    else if (!st.saidBad) { st.saidBad = true; talk(LINES.bad, true); }
  }
  function tapKey(k) {
    if (st.phase !== "type") return;
    if (k === "back") return tapBack();
    if (k === "ok") return tapOk();
    if (st.cur > 4) { shake(E.slots); setTip("點一個格子，就可以換字喔！"); return; }
    if (keysOff().has(k)) return tapGrey(k);
    if (k === "1" || TONE_MARK[k] !== undefined) return tapTone(k);
    play("key");
    if (st.cands.length) {                                     // 選字中按符號＝先確定預覽的那個字，再開始拼下一格（一般輸入法的習慣；10-12 櫻木：以前會把選好的字丟掉）
      confirmCand(st.sel);
      if (st.cur > 4) { bump(E.keys[k]); return; }
    }
    const c = st.comp;
    if (TP.INITIALS.includes(k)) c.ini = k; else if (TP.MEDIALS.includes(k)) c.med = k; else c.fin = k;   // 同一類再按＝換掉（輸入法的習慣）
    bump(E.keys[k]); paintType();
    if (!st.saidTone) { st.saidTone = true; later(() => { if (st.phase === "type" && compSyl() && !st.cands.length) talk(LINES.tone); }, 2600); }
  }
  function tapTone(k) {
    if (st.cur > 4) { shake(E.slots); return; }
    const base = compSyl();
    if (!base) { play("bad"); shake(E.slots.children[st.cur]); talk(LINES.first, true); return; }
    const syl = base + TONE_MARK[k], list = candList(Dk, syl);
    st.tone = k; bump(E.keys[k]);
    if (!list.length) { st.cands = []; st.candZ = []; play("bad"); shake(E.slotEls[st.cur]); shake(E.candbar); talk(LINES.bad, true); st.badCount = (st.badCount || 0) + 1; paintType(); return; }
    play("toneKey"); st.syl = syl; st.cands = list.map(x => x.ch); st.candZ = list.map(x => x.z); st.sel = 0; st.page = 0; paintType();
    if (!st.saidPick) { st.saidPick = true; talk(LINES.pick); }
  }
  function tapBack() {
    play("key", 0.8); bump(E.keys.back);
    if (st.cands.length) { st.cands = []; st.candZ = []; st.tone = null; }
    else if (st.comp.fin) st.comp.fin = ""; else if (st.comp.med) st.comp.med = ""; else if (st.comp.ini) st.comp.ini = "";
    else {                                                     // 沒在拼：刪掉前一格的字
      let i = st.cur > 4 ? 4 : st.slots[st.cur] ? st.cur : st.cur - 1;
      if (i >= 0) { st.slots[i] = null; st.cur = i; }
    }
    paintType();
  }
  function tapOk() {
    bump(E.keys.ok);
    if (st.cands.length) return confirmCand(st.sel);
    if (compSyl()) return tapTone("1");                       // 拼了沒按聲調就按確定＝一聲
    if (st.slots.every(Boolean)) return tapGo();
    play("bad"); talk(LINES.first, true);
  }
  function tapCand(i) {
    if (st.phase !== "type") return;
    st.sel = i; play("pick"); confirmCand(i);                 // 點一下就確定（不管第幾個；10-12 櫻木：以前要點兩下，小孩點一下以為選好了）
  }
  function confirmCand(i) {
    const ch = st.cands[i]; if (!ch) return;
    st.slots[st.cur] = { ch, z: st.candZ[i] || st.syl };     // 別的聲調的字（三聲變調）存它自己的注音
    play("ok"); bump(E.slotEls[st.cur], "tp-pop");
    st.comp = { ini: "", med: "", fin: "" }; st.cands = []; st.candZ = []; st.tone = null;
    const nextEmpty = [0, 1, 2, 3, 4].find(j => j > st.cur && !st.slots[j]) ?? [0, 1, 2, 3, 4].find(j => !st.slots[j]);
    st.cur = nextEmpty === undefined ? 5 : nextEmpty;
    if (st.guide && st.slots[st.guide.slot]) st.guide = null;
    paintType();
    if (st.slots.every(Boolean) && !st.saidFull) { st.saidFull = true; talk(LINES.full); }
  }
  function tapSlot(i) {
    if (st.phase !== "type") return;
    st.cur = i; st.comp = { ini: "", med: "", fin: "" }; st.cands = []; st.candZ = []; st.tone = null; play("key", 1.2); paintType();
  }
  // 🎲（10-12 櫻木）：第一次＝整句幫你填好（先知道好玩）；之後＝填前 4 個字、最後一格自己拼——該按的鍵依序發光（聲母→介音→韻母→聲調→確定）。
  // 抽到的是內建詞句＝唸出來（預錄配音「宇宙強爸爸！」）。真的拼不出來還有「全部幫我填」。
  function tapInspire() {
    if (st.phase !== "type") return;
    if (!st.bag || !st.bag.length) { st.bag = INSPIRE.map((_, i) => i); for (let i = st.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [st.bag[i], st.bag[j]] = [st.bag[j], st.bag[i]]; } }
    let k = st.bag.pop(); if (st.lastInspire === k && st.bag.length) k = st.bag.pop();
    if (st.opts && st.opts.inspire != null && INSPIRE[st.opts.inspire]) k = st.opts.inspire;   // 測試用：指定第幾句
    st.lastInspire = k;
    const [p, z] = INSPIRE[k], zs = z.split(" "), full = !st.inspireN; st.inspireN = (st.inspireN || 0) + 1;
    st.slots = [...p].map((ch, i) => (full || i < 4 ? { ch, z: zs[i] } : null));
    st.cur = full ? 5 : 4; st.comp = { ini: "", med: "", fin: "" }; st.cands = []; st.candZ = []; st.tone = null;
    st.guide = full ? null : { slot: 4, ch: p[4], z: zs[4], p };
    play("ding"); paintType(); E.slotEls.forEach((e, i) => setTimeout(() => bump(e, "tp-pop"), i * 70));
    talk(sayPhrase(p), true);
    if (full) st.saidFull = true; else { st.saidFull = false; talk(LINES.guide); }
  }
  // 填空引導：下一個該按的（{key} 鍵盤上的鍵、{cand} 候選字的位置）；不在引導中＝null
  function guideNext() {
    const g = st && st.guide; if (!g || st.phase !== "type" || st.cur !== g.slot || st.slots[g.slot]) return null;
    const want = TP.splitSyl(g.z); if (!want) return null;
    const tk = { 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "˙" }[want.tone] || "1";
    if (st.cands.length) {
      if (st.tone !== tk) return { key: tk };
      const i = st.cands.indexOf(g.ch); return i >= 0 ? { key: "ok", cand: i } : { key: "back" };
    }
    const c = st.comp;
    for (const f of ["ini", "med", "fin"]) {
      if (want[f] && c[f] !== want[f]) return keysOff().has(want[f]) ? { key: "back" } : { key: want[f] };   // 按錯的組合接不到正確的符號（灰鍵）＝先刪掉
      if (!want[f] && c[f]) return { key: "back" };
    }
    return { key: tk };
  }
  function tapFillAll() {
    const g = st && st.guide; if (!g || st.phase !== "type" || st.slots[g.slot]) return;
    st.slots[g.slot] = { ch: g.ch, z: g.z }; st.guide = null; st.comp = { ini: "", med: "", fin: "" }; st.cands = []; st.candZ = []; st.tone = null;
    const nextEmpty = [0, 1, 2, 3, 4].find(j => !st.slots[j]); st.cur = nextEmpty === undefined ? 5 : nextEmpty;
    play("ding"); bump(E.slotEls[g.slot], "tp-pop"); paintType();
    if (st.slots.every(Boolean) && !st.saidFull) { st.saidFull = true; talk(LINES.full, true); }
  }
  function turnPage(d) { const pp = pageSize(), n = Math.ceil(st.cands.length / pp); st.page = clamp(st.page + d, 0, Math.max(0, n - 1)); play("key", 1.3); paintType(); }
  function pageSize() { return Math.max(1, st.perPage || 6); }
  function setTip(t) { if (E) E.tip.textContent = t; }
  function paintType() {
    if (!E) return;
    const c = st.comp, typing = !!compSyl();
    // 填空引導：該按的鍵／候選字發光；選字時先幫你選好目標字（按確定或點它都行）
    const gd = guideNext();
    if (gd && gd.cand != null) { st.sel = gd.cand; st.page = Math.floor(gd.cand / pageSize()); }
    E.slotEls.forEach((b, i) => {
      b.textContent = ""; b.classList.toggle("tp-cur", i === st.cur); b.classList.toggle("tp-filled", !!st.slots[i]);
      if (i === st.cur && st.cands.length) { const ch = mk("div", "tp-ch tp-preview", b); ch.appendChild(acSpan(st.cands[st.sel] || st.cands[0], st.candZ[st.sel] || st.syl)); }
      else if (i === st.cur && typing) {
        const v = mk("div", "tp-comp", b), sym = compSyl();
        [...sym].forEach(s => mk("b", "", v, s));
        if (st.tone && st.tone !== "1") { const t = mk("i", "tp-ctone tp-tv" + TONE_NUM[st.tone], v); t.textContent = st.tone; }
        v.style.setProperty("--n", sym.length);
      } else if (st.slots[i]) { const ch = mk("div", "tp-ch", b); ch.appendChild(acSpan(st.slots[i].ch, st.slots[i].z)); }
      else mk("div", "tp-empty", b, String(i + 1));
    });
    const full = st.slots.every(Boolean);
    E.go.classList.toggle("tp-ready", full); E.go.disabled = !full;
    // 沒券＝「存成蛋」（10-12 櫻木：沒券也能打字）
    const egg = !!st.eggMode; E.go.classList.toggle("tp-egg", egg);
    if (E.go.firstChild && E.go.firstChild.nodeType === 3) E.go.firstChild.nodeValue = egg ? "🥚" : "⚔️";
    E.goT.textContent = egg ? "存成蛋！" : "下場！"; E.go.setAttribute("aria-label", egg ? "存成陀螺蛋" : "下場");
    E.note.textContent = egg ? "🥚 沒有陀螺券：打好的句子先存成陀螺蛋！" : "🙅 不要打自己或別人的名字喔！";
    // 候選字
    E.cands.textContent = "";
    const pp = pageSize(), n = st.cands.length, pages = Math.ceil(n / pp);
    st.page = clamp(st.page, 0, Math.max(0, pages - 1));
    if (st.sel >= n) st.sel = 0;
    st.cands.slice(st.page * pp, st.page * pp + pp).forEach((ch, j) => {
      const i = st.page * pp + j, z = st.candZ[i] || st.syl, b = btn("tp-cand" + (i === st.sel ? " tp-sel" : "") + (z !== st.syl ? " tp-other" : "") + (gd && gd.cand === i ? " tp-guide" : ""), E.cands, null, () => tapCand(i), ch);
      b.dataset.ch = ch; b.dataset.i = i; b.appendChild(acSpan(ch, z));
      const emo = emojiOf(ch); if (emo) mk("span", "tp-emo noann", b, emo);   // 具體名詞附小 emoji（貓🐱）
    });
    E.prev.classList.toggle("tp-hide", !(n && st.page > 0)); E.next.classList.toggle("tp-hide", !(n && st.page < pages - 1));
    E.candbar.classList.toggle("tp-hascand", n > 0);
    E.tip.textContent = "";
    const fresh = !typing && st.cur <= 4 && !st.slots.some(Boolean);   // 手機橫式沒地方放提醒那行：一開始的提示改放提醒
    if (!n) zText(E.tip, gd ? "👉 跟著發亮的鍵按！" : st.cur > 4 ? (full ? (egg ? "按「存成蛋！」把句子存起來！" : "按「下場！」開始對戰！") : "點一個格子，就可以換字喔！") : typing ? "最後按聲調，字就會跑出來！" : fresh && L && L.side ? "🙅 不要打自己或別人的名字喔！" : "先選一個符號，拼出一個字。");
    E.fillAll.classList.toggle("tp-off", !gd || n > 0);
    E.kb.classList.toggle("tp-wanttone", typing && !n && !gd);
    E.keys.ok.classList.toggle("tp-ready", n > 0 || (full && !typing));
    // 灰鍵（拼不下去的符號、沒有字的聲調）＋引導發光
    const off = keysOff();
    for (const k in E.keys) { E.keys[k].classList.toggle("tp-dim", off.has(k)); E.keys[k].classList.toggle("tp-guide", !!(gd && gd.key === k)); }
  }
  function shake(el) { if (!el) return; el.classList.remove("tp-shake"); void el.offsetWidth; el.classList.add("tp-shake"); later(() => el && el.classList.remove("tp-shake"), 450); }
  function bump(el, cls = "tp-bump") { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // ===================== 下場 → 變身 =====================
  function tapGo() {
    if (st.phase !== "type" || !st.slots.every(Boolean)) return;
    if (!hasTicket()) return saveEgg();
    st.isFree = isFirstFree();                                  // 第一次免費那場：挑小孩會贏的對手（pickOpponent）
    try { api.useTicket(); } catch (e) { /* 主程式的事 */ }
    E.boards.classList.add("tp-off");
    st.ticketUsed = (st.ticketUsed || 0) + 1; st.rematchUsed = false;   // 輸了「換個對手再打」：每張券限一次
    play("go");
    st.phrase = st.slots.map(s => s.ch).join(""); st.z = st.slots.map(s => s.z);
    enterMorph().catch(e => { console.warn("[tops]", e); try { api.onFail && api.onFail({ why: "morph" }); } catch (_) {} });   // 10-12 里維：主程式 topsFail 會回小島並退券
  }
  // ---------- 陀螺蛋（沒券時打好的句子；最多 3 顆，滿了擠掉最舊的） ----------
  function saveEgg() {
    const p = st.slots.map(s => s.ch).join(""), z = st.slots.map(s => s.z);
    const eggs = getEggs().filter(e => e.p !== p); eggs.push({ p, z }); setEggs(eggs);
    play("egg"); showEggSaved(p, z);
  }
  function msgCard(cls) { E.msg.textContent = ""; showOnly("msg"); E.loading.classList.add("tp-off"); const card = mk("div", "tp-msg-card " + (cls || ""), E.msg); bump(card, "tp-pop"); return card; }
  function showEggSaved(p, z) {
    st.phase = "egg";
    const card = msgCard("tp-eggcard");
    const top = mk("div", "tp-egg-top", card); mk("div", "tp-egg-ic", top, "🥚"); top.appendChild(phraseEl(p, z, "tp-ph tp-egg-ph"));
    mk("div", "tp-msg-t", card, "陀螺蛋存好了！");
    mk("div", "tp-msg-s", card, "拿到陀螺券就能孵出來對戰！");
    starCard(card);
    const n = getEggs().length; mk("div", "tp-egg-n", card, "🥚".repeat(n) + "（陀螺蛋最多 3 顆）");
    const bt = mk("div", "tp-msg-btns", card);
    btn("tp-btn tp-again", bt, "✏️", () => enterType(), "再打新句子").appendChild(mk("span", "tp-btn-t", null, "再打新句子"));
    btn("tp-btn tp-home", bt, "🏝️", () => exit("noticket"), "回小島").appendChild(mk("span", "tp-btn-t", null, "回小島"));
    talk(LINES.eggSaved, true); talk(LINES.starCard);
  }
  // 有券又有蛋：先問要不要孵蛋（點蛋＝直接下場；也可以打新的）
  function showEggs() {
    st.phase = "eggs";
    if (W) { W.dispose(); W = null; } E.stage.classList.remove("tp-on");
    const card = msgCard("tp-eggpick");
    mk("div", "tp-msg-t", card, "你有陀螺蛋！要孵出來對戰嗎？");
    const list = mk("div", "tp-egg-list", card);
    getEggs().slice().reverse().forEach(e => {
      const b = btn("tp-egg-btn", list, null, () => hatchEgg(e), "孵出來對戰"); mk("span", "tp-egg-ic", b, "🥚"); b.appendChild(phraseEl(e.p, e.z, "tp-ph tp-egg-ph")); mk("span", "tp-egg-go", b, "🐣 孵出來");
      b.dataset.p = e.p;
    });
    const t = ticketsN(); mk("div", "tp-msg-s", card, isFirstFree() ? "🎟️ 這次免費！" : "🎟️ 陀螺券 " + t + " 張");
    const bt = mk("div", "tp-msg-btns", card);
    btn("tp-btn tp-again", bt, "✏️", () => enterType(), "打新句子").appendChild(mk("span", "tp-btn-t", null, "打新句子"));
    talk(LINES.eggAsk, true);
  }
  function hatchEgg(e) {
    if (st.phase !== "eggs") return;
    enterType();
    st.slots = [...e.p].map((ch, i) => ({ ch, z: e.z[i] })); st.cur = 5; st.hatch = e.p; st.saidFull = true;
    paintType(); tapGo();
  }
  function starCard(parent) {                                  // 15 格集點卡（亮幾格＝存了幾顆；集滿換 1 張陀螺券）
    const n = starsBank(), t = ticketsN();
    const box = mk("div", "tp-stars", parent);
    const h = mk("div", "tp-stars-h", box); mk("span", "", h, "⭐ 集點卡"); mk("b", "", h, n + " / 15");
    const row = mk("div", "tp-stars-row", box); for (let i = 0; i < 15; i++) mk("span", "tp-star" + (i < n ? " tp-lit" : ""), row, "★");
    mk("div", "tp-stars-s", box, "集滿 15 顆換 1 張陀螺券" + (t ? "（現在有 " + t + " 張）" : ""));
    return box;
  }
  function ensureWorld() {
    if (W) return W;
    try { W = createWorld(E.stage, { onFail: why => { try { api.onFail && api.onFail({ why }); } catch (e) {} } }); E.stage.insertBefore(W.canvas, E.stage.firstChild); }
    catch (e) { console.warn("[tops] WebGL 失敗", e); W = null; try { api.onFail && api.onFail({ why: "nowebgl" }); } catch (e2) {} }
    return W;
  }
  async function enterMorph() {
    st.phase = "morph"; showOnly("morph"); E.morph.classList.remove("tp-shown");
    const my = run;
    if (st.breakMorph) { st.breakMorph = false; throw new Error("測試：變身出錯"); }   // debug.breakMorph()：測 onFail("morph")
    st.power = TP.powerOf(st.phrase, Dk);
    st.stats = st.power.perChar.map(c => c.stats);
    st.hits = bonusHits(st.power); st.bstats = boostStats(st.stats, st.hits);   // 對戰用的能力：加成的字某項 +N（不改戰力）
    ensureWorld(); E.stage.classList.add("tp-on");
    if (W) { st.myTops = st.phrase.split("").map((ch, i) => W.makeTop(ch, st.z[i], st.stats[i], "me")); }
    relayout();
    E.num.textContent = "0"; E.badges.textContent = ""; E.vsInfo.textContent = ""; E.vs.classList.remove("tp-shown"); E.morph.classList.remove("tp-vson"); E.fight.disabled = true; E.total.querySelectorAll(".tp-tier").forEach(x => x.remove());
    E.cardEls.forEach((c, i) => paintCard(c, st.power.perChar[i], st.z[i]));
    startLoop();
    talk(LINES.morph, true);
    // 一顆一顆「叮」變出來
    st.myTops && st.myTops.forEach((T, i) => { const lx = (i - 2) * 2.05; W.placeTop(T, lx, 0, 0.35); T.holder.scale.setScalar(0.001); });
    for (let i = 0; i < 5; i++) at(0.35 + i * 0.42, () => {
      play("ding", 1 + i * 0.12);
      const T = st.myTops && st.myTops[i];
      if (T) { T.holder.visible = true; W.tween(0.5, u => T.holder.scale.setScalar(Math.max(0.001, easeOutBack(u))), null); W.spark(T.x, 0.6, T.y, 22, 0.7); W.flash(T.x, bowlY(T.x * T.x), T.y, 0.8); }
      E.cardEls[i].classList.add("tp-in");
    });
    const tRoll = 0.35 + 5 * 0.42 + 0.2;
    at(tRoll, () => { talk(LINES.power); rollNumber(E.num, st.power.total, 1.3, () => { const t = tierOf(st.power.total); bump(mk("span", "tp-tier tp-tier" + t.k, E.total, t.ico + " " + t.name), "tp-pop"); }); });
    const bon = st.power.bonuses;
    bon.forEach((b, k) => at(tRoll + 1.4 + k * 0.7, () => { const e = mk("span", "tp-badge", E.badges, b.name + " +" + b.value); bump(e, "tp-pop"); play("coin", 1 + k * 0.1); talk(b.name); glowBonus(b.id); }));
    const board = await st.boardP;
    if (my !== run || !st) return;
    st.board = st.board || board;                             // 同一場連玩：沿用上一局更新過的我家排行
    st.opp = pickOpponent(st.board, { free: st.isFree });
    at(tRoll + 1.6 + bon.length * 0.7, () => showVs());
  }
  // 加成徽章跳出來：觸發的那幾顆陀螺一起發光跳一下、換金色光圈；能力卡標出對戰時加了什麼（⚔️+10）
  function glowBonus(id) {
    const idx = (st.hits && st.hits[id]) || [], B = BOOST[id]; if (!B) return;
    idx.forEach((i, n) => {
      const c = E.cardEls[i];
      if (c) { bump(c, "tp-glow"); const bx = c.querySelector(".tp-boosts") || mk("div", "tp-boosts", c); bump(mk("span", "tp-boost", bx, STAT_ICON[B[0]] + "+" + B[1]), "tp-pop"); }
      const T = st.myTops && st.myTops[i];
      if (T && W) {
        W.setGold(T, true);
        const y0 = bowlY(T.x * T.x + T.y * T.y);
        W.tween(0.5, u => { T.holder.position.y = y0 + Math.sin(u * Math.PI) * 0.9; }, () => { T.holder.position.y = y0; });
        W.spark(T.x, 1.1, T.y, 18, 0.6, 0.13); W.flash(T.x, y0, T.y, 0.7);
      }
    });
    if (idx.length) { play("boost", 1.3); st.glowed = (st.glowed || 0) + idx.length; }
  }
  // 對手亮相：兩隊戰力長條並排＋等級徽章（10-12 櫻木：數字看不懂誰強）；內建詞句的對手唸出來（「對手是：」＋「爺爺的鬍子！」兩段預錄）
  function showVs() {
    E.vsInfo.textContent = "";
    const top = Math.max(8000, st.power.total, st.opp.power) * 1.02;
    const row = (cls, label, p, z, power) => {
      const who = mk("div", "tp-pw-who " + cls, E.vsInfo); mk("span", "tp-vs-l", who, label); if (p) who.appendChild(phraseEl(p, z, "tp-ph tp-vs-ph"));
      const tr = mk("div", "tp-pw-track " + cls, E.vsInfo), f = mk("span", "tp-pw-fill", tr); f.style.setProperty("--w", (power / top).toFixed(4));
      const t = tierOf(power); mk("span", "tp-tier tp-tier" + t.k + " " + cls, E.vsInfo, t.ico + " " + t.name);
      mk("b", "tp-pw-n " + cls, E.vsInfo, String(power));
    };
    row("tp-pw-me", "我的陀螺", null, null, st.power.total);
    row("tp-pw-opp", "對手", st.opp.p, st.opp.z, st.opp.power);
    E.vs.classList.add("tp-shown"); E.morph.classList.add("tp-vson"); E.fight.disabled = false; bump(E.vs, "tp-pop"); play("launch");
    if (INSPIRE.some(x => x[0] === st.opp.p)) talk(LINES.vsPre + sayPhrase(st.opp.p)); else talk(LINES.vs);   // 不唸小孩打的字：只有內建詞句才唸
    relayout();
  }
  function paintCard(c, pc, z) {
    c.textContent = ""; c.classList.remove("tp-in");
    const h = mk("div", "tp-card-h", c); h.appendChild(acSpan(pc.ch, z)); mk("b", "tp-card-p", h, String(pc.power));
    pc.stats.forEach((v, k) => {
      const r = mk("div", "tp-bar", c); r.style.setProperty("--c", STAT_COLOR[k]); r.style.setProperty("--v", v / 99);
      mk("i", "", r, STAT_ICON[k]); const tr = mk("span", "tp-track", r); mk("span", "tp-fill", tr); mk("em", "", r, String(v));
    });
  }
  function rollNumber(el, to, dur, done) { const t0 = st.clock; const tick = () => { if (!st || !E) return; const u = Math.min(1, (st.clock - t0) / dur); el.textContent = String(Math.round(ease(u) * to)); if (u < 1) st.rolls.push(tick); else { bump(el, "tp-pop"); play("coin", 1.5); if (done) done(); } }; st.rolls.push(tick); }
  function normBoard(b) {
    if (Array.isArray(b)) b = { island: b, home: [] };
    b = b || {};
    const fix = l => (Array.isArray(l) ? l : []).filter(e => e && typeof e.p === "string" && [...e.p].length === 5).map(e => ({ p: e.p, power: Number.isFinite(+e.power) ? +e.power : TP.powerOf(e.p, Dk).total, z: e.z }));
    let island = fix(b.island); if (!island.length) island = LEGENDS.map(p => ({ p, power: TP.powerOf(p, Dk).total }));
    island.sort((a, c) => c.power - a.power);
    const recent = (Array.isArray(b.recent) ? b.recent : []).filter(e => e && typeof e.p === "string" && typeof e.o === "string").map(e => ({ p: e.p, o: e.o }));
    return { island: island.slice(0, 5), home: fix(b.home).sort((a, c) => c.power - a.power).slice(0, 5), recent };
  }
  // 對戰用的能力（含加成）：同一句永遠一樣
  function battleStatsOf(p) { const pw = TP.powerOf(p, Dk); return boostStats(pw.perChar.map(c => c.stats), bonusHits(pw)); }
  // 這句打過哪些對手（存檔的最近紀錄＋這次開頁打的）
  function foughtWith(p) { const b = (st.board && st.board.recent) || []; return new Set([...b, ...fought].filter(e => e.p === p).map(e => e.o)); }
  // 對手：開局指定的＞全島榜＋島上傳說＋隨機靈感（同一句打過的先避開——10-12 櫻木）裡戰力最接近的 3 隊挑一隊（照詞句雜湊挑）
  //   mode.free（第一次免費那場）／mode.rematch（輸了換對手）：先把候選對手都模擬一遍（確定性，跟等一下真的打的一模一樣），挑戰力最接近、小孩會贏的那隊
  function pickOpponent(board, mode = {}) {
    const o = st.opts && st.opts.opponent;
    if (o && !mode.rematch && typeof o.p === "string" && [...o.p].length === 5) return { p: o.p, z: o.z ? (Array.isArray(o.z) ? o.z : o.z.split(" ")) : zOf(o.p, Dk), power: TP.powerOf(o.p, Dk).total };
    const seen = new Set([st.phrase]); let pool = [];
    for (const p of [...board.island.map(e => e.p), ...LEGENDS, ...INSPIRE.map(x => x[0])]) if (!seen.has(p)) { seen.add(p); pool.push({ p, power: TP.powerOf(p, Dk).total }); }
    pool.sort((a, b) => Math.abs(a.power - st.power.total) - Math.abs(b.power - st.power.total) || (a.p < b.p ? -1 : 1));
    const done = foughtWith(st.phrase); if (mode.rematch && st.opp) done.add(st.opp.p);
    const fresh = pool.filter(e => !done.has(e.p)); if (fresh.length) pool = fresh;
    const mkOpp = e => ({ p: e.p, power: e.power, z: zOf(e.p, Dk, (board.island.find(x => x.p === e.p) || {}).z) });
    if (mode.free || mode.rematch) {
      const me = { p: st.phrase, stats: st.bstats };
      for (const e of pool.slice(0, 16)) if (simulateMatch(me, { p: e.p, stats: battleStatsOf(e.p) }).winner === "a") { st.oppWhy = mode.free ? "free" : "rematch"; return mkOpp(e); }
    }
    st.oppWhy = "near";
    return mkOpp(pool[TP.hashStr(st.phrase) % Math.min(3, pool.length)]);
  }

  // ===================== 對戰 =====================
  function tapFight() {
    if (st.phase !== "morph" || !st.opp) return;
    st.phase = "battle"; showOnly("hud"); play("go");
    const oppPw = TP.powerOf(st.opp.p, Dk), oppStats = oppPw.perChar.map(c => c.stats);
    st.oppHits = bonusHits(oppPw); st.oppB = boostStats(oppStats, st.oppHits);   // 兩隊都套自己詞句的加成（同一場仍然確定性）
    st.match = simulateMatch({ p: st.phrase, stats: st.bstats }, { p: st.opp.p, stats: st.oppB });
    st.mySide = st.match.flip ? 1 : 0; st.score = [0, 0]; st.ri = -1; st.fast = false; st.cheers = 0; E.ff.classList.remove("tp-on", "tp-auto2");
    const boosted = h => { const s = new Set(); for (const id in h) h[id].forEach(i => s.add(i)); return s; };
    st.myBoost = boosted(st.hits); st.oppBoost = boosted(st.oppHits);
    if (W) {
      if (st.oppTops) W.removeTops(st.oppTops);
      st.myTops.forEach((T, i) => { T.holder.visible = false; T.holder.scale.setScalar(1); W.setGold(T, st.myBoost.has(i)); });
      st.oppTops = [...st.opp.p].map((ch, i) => { const T = W.makeTop(ch, st.opp.z[i], oppStats[i], "opp"); W.setGold(T, st.oppBoost.has(i)); return T; });
    }
    paintTeams(); relayout();
    nextRound(); startLoop();                                  // 迴圈一定在跑（沒有 3D 時對戰也要靠它往前走）
  }
  function paintTeams() {
    const t = [{ p: st.phrase, z: st.z, cls: "tp-me", b: st.myBoost }, { p: st.opp.p, z: st.opp.z, cls: "tp-opp", b: st.oppBoost }];
    E.gfill = [];
    t.forEach((tm, k) => {
      const el = E.teams[k]; el.textContent = "";
      const chips = mk("div", "tp-chips", el);
      [...tm.p].forEach((ch, i) => { const c = mk("span", "tp-chip" + (tm.b && tm.b.has(i) ? " tp-boosted" : ""), chips); c.dataset.i = i; c.appendChild(acSpan(ch, tm.z[i])); });
      const g = mk("div", "tp-gauge", el); E.gfill[k] = mk("span", "tp-gfill", g);   // 10-12 里維：快取，paintGauges 每格不用再 querySelector
    });
    paintScore();
  }
  function paintScore() { E.score.textContent = ""; mk("b", "", E.score, String(st.score[0])); mk("span", "", E.score, ":"); mk("b", "", E.score, String(st.score[1])); }
  function banner(text, cls = "", dur = 1.4) {
    const b = zText(mk("div", "tp-bn " + cls, E.banner), text); bump(b, "tp-bnin");
    at(dur, () => { b.classList.add("tp-bnout"); at(0.35, () => b.remove()); });
  }
  function nextRound() {
    if (st.score[0] >= 3 || st.score[1] >= 3 || st.ri >= 4) return finishMatch();
    st.ri++;
    const R = st.match.rounds[st.ri]; if (!R) return finishMatch();
    const i = st.ri, sim = R.sim;
    st.rs = { R, sim, i, t: 0, hi: 0, stage: "intro", slow: false, decisive: (R.winner === "a" ? st.score[0] : st.score[1]) === 2 };
    E.teams.forEach(el => el.querySelectorAll(".tp-chip").forEach(c => c.classList.toggle("tp-now", +c.dataset.i === i)));
    if (W) {
      [...st.myTops, ...st.oppTops].forEach(T => { T.holder.visible = false; T.fall = null; T.tilt.rotation.set(0, 0, 0); T.holder.scale.setScalar(1); });
      st.cur2 = [st.mySide === 0 ? st.myTops[i] : st.oppTops[i], st.mySide === 0 ? st.oppTops[i] : st.myTops[i]];   // sim 的 0 號、1 號
      st.cur2.forEach((T, s) => { T.holder.visible = true; W.placeTop(T, sim.f[s * 3], sim.f[s * 3 + 1], sim.f[s * 3 + 2]); });
      W.zoom = null; W.follow = { x: 0, z: 0, r: 4.6 };
    }
    E.tags.forEach(t => t.classList.add("tp-off"));
    // 縮短（10-12 櫻木）：只有第 1 回合 3-2-1 倒數，之後直接「發射！」；第 4、5 回合預設 2 倍速（⏩ 照樣 3 倍）
    st.rs.speed = i >= 3 ? 2 : 1; E.ff.classList.toggle("tp-auto2", i >= 3);
    banner(`第 ${i + 1} 回合`, "tp-bn-round", 1.1); talk(ROUND_LINES[i], true);
    const launch = () => {
      banner("發射！", "tp-bn-go", 0.7); play("launch"); if (i === 0) talk(LINES.fight);
      st.rs.stage = "fight"; E.tags.forEach(t => t.classList.remove("tp-off")); paintTags();
      if (i === 0) { E.cheerHint.classList.remove("tp-off"); if (!saidCheerHint) { saidCheerHint = true; talk(LINES.cheerHint); } }
    };
    if (i === 0) {
      st.countdown = (st.countdown || 0) + 1;
      at(1.25, () => { banner("3", "tp-bn-count", 0.4); play("key", 0.9); });
      at(1.7, () => { banner("2", "tp-bn-count", 0.4); play("key", 1.0); });
      at(2.15, () => { banner("1", "tp-bn-count", 0.4); play("key", 1.1); });
      at(2.6, launch);
    } else at(0.9, launch);
  }
  // 點畫面幫陀螺加油（純表演：我的陀螺冒藍色火花、碗口燈亮一下、歡呼音效；對戰早就算好了，不影響結果）
  function cheer(e) {
    st.cheers = (st.cheers || 0) + 1; E.cheerHint.classList.add("tp-off");
    const T = st.cur2 && st.cur2[st.mySide];
    if (W && T && T.holder.visible && !T.fall) { W.spark(T.x, T.holder.position.y + 0.7, T.y, 16, 0.55, 0.55); W.rimFlash = Math.max(W.rimFlash, 0.5); }
    const r = root.getBoundingClientRect(), f = mk("div", "tp-cheer", E.hud, ["加油！", "衝啊！", "好棒！"][st.cheers % 3]);
    f.style.left = ((e && e.clientX != null ? e.clientX : r.left + r.width / 2) - r.left) + "px"; f.style.top = ((e && e.clientY != null ? e.clientY : r.top + r.height / 2) - r.top) + "px";
    later(() => f.remove(), 900);
    play("cheer", 1.1 + Math.random() * 0.3);
    if (st.cheers === 1) talk(LINES.cheer);
  }
  function stepBattle(gdt) {
    const rs = st.rs; if (!rs || rs.stage !== "fight") return;
    const sim = rs.sim, n = sim.n;
    const slowFrom = rs.decisive ? Math.max(0, sim.end.k - 48) : Infinity;
    let k = rs.t / SIM.DT;
    if (k >= slowFrom && !rs.slow) {                          // 決勝回合的最後一擊：慢動作＋鏡頭拉近
      rs.slow = true; talk(LINES.last, true);
      if (W) W.zoom = { k: 0 };
      E.wrap.classList.add("tp-slowmo");
    }
    rs.t += gdt * (rs.slow ? 0.28 : 1);
    k = Math.min(n, rs.t / SIM.DT);
    // 碰撞特效
    while (rs.hi < sim.hits.length && sim.hits[rs.hi].k <= k) {
      const h = sim.hits[rs.hi++], y = bowlY(h.x * h.x + h.y * h.y) + 0.45;
      if (W) { W.spark(h.x, y, h.y, Math.round(14 + 40 * h.s), 0.6 + h.s); W.flash(h.x, y - 0.4, h.y, 0.6 + h.s); W.shake = Math.max(W.shake, 0.15 + h.s * 0.6); W.rimFlash = Math.min(1, 0.4 + h.s); }
      play("clash", 0.75 + h.s * 0.6);
    }
    const k0 = Math.floor(k), k1 = Math.min(n, k0 + 1), u = k - k0, f = sim.f;
    const S = [0, 0];
    for (let s = 0; s < 2; s++) {
      const a = k0 * 6 + s * 3, b = k1 * 6 + s * 3;
      const x = f[a] + (f[b] - f[a]) * u, y = f[a + 1] + (f[b + 1] - f[a + 1]) * u; S[s] = f[a + 2] + (f[b + 2] - f[a + 2]) * u;
      if (W && st.cur2) W.placeTop(st.cur2[s], x, y, S[s]);
    }
    rs.S = S;
    if (W && st.cur2) {
      const a = st.cur2[0], b = st.cur2[1], sep = Math.hypot(a.x - b.x, a.y - b.y);
      W.follow = { x: clamp((a.x + b.x) / 2 * 0.7, -2.4, 2.4), z: clamp((a.y + b.y) / 2 * 0.7, -2.4, 2.4), r: clamp(sep / 2 + 2.4, 3.8, 5.95) };
    }
    paintGauges(S); paintTags();
    if (k >= n) endRound();
  }
  function endRound() {
    const rs = st.rs; rs.stage = "end"; E.cheerHint.classList.add("tp-off");
    const R = rs.R, sim = rs.sim, lo = sim.end.loser, how = sim.end.how;
    const meWon = R.winner === "a";
    if (W && st.cur2) {
      const T = st.cur2[lo], n = sim.n, f = sim.f;
      if (how === "out") {
        const vx = (f[n * 6 + lo * 3] - f[(n - 1) * 6 + lo * 3]) / SIM.DT, vz = (f[n * 6 + lo * 3 + 1] - f[(n - 1) * 6 + lo * 3 + 1]) / SIM.DT;
        T.fall = { kind: "out", t: 0, x: T.x, z: T.y, y: T.holder.position.y, vx: vx * 1.25, vz: vz * 1.25, vy: 3.2 };
        W.shake = 1; W.spark(T.x, T.holder.position.y + 0.4, T.y, 50, 1.4); W.rimFlash = 1; play("out"); W.follow = { x: 0, z: 0, r: 5.95 };
      } else { T.fall = { kind: "topple", t: 0, dir: Math.random() * Math.PI * 2 }; T.S = 0; play("topple"); }
      W.zoomOut = 1;
    }
    st.score[meWon ? 0 : 1]++;
    paintScore(); bump(E.score, "tp-pop");
    const myChip = E.teams[0].querySelector(`.tp-chip[data-i="${rs.i}"]`), opChip = E.teams[1].querySelector(`.tp-chip[data-i="${rs.i}"]`);
    if (myChip) myChip.classList.add(meWon ? "tp-won" : "tp-lost"); if (opChip) opChip.classList.add(meWon ? "tp-lost" : "tp-won");
    const howText = how === "out" ? "撞出場！" : how === "stop" ? "停下來了！" : "時間到！比轉速！";
    talk(how === "out" ? LINES.out : how === "stop" ? LINES.stop : LINES.time, true);
    const slowEnd = rs.slow ? 1.0 : 0.5;
    at(slowEnd, () => { if (W) W.zoom = null; E.wrap.classList.remove("tp-slowmo"); });
    at(0.35, () => banner(howText, "tp-bn-how", 1.0));
    at(1.45, () => { banner(meWon ? "🎉 這回合你贏了！" : "這回合對手贏了！", meWon ? "tp-bn-win" : "tp-bn-lose", 1.2); play(meWon ? "roundWin" : "roundLose"); talk(meWon ? LINES.roundWin : LINES.roundLose); });
    at(3.0, () => nextRound());
  }
  function paintGauges(S) {
    const mine = S[st.mySide], theirs = S[1 - st.mySide];
    const g = E.gfill;
    if (g[0]) g[0].style.transform = `scaleX(${clamp(mine / 1.35, 0, 1)})`;
    if (g[1]) g[1].style.transform = `scaleX(${clamp(theirs / 1.35, 0, 1)})`;
  }
  function paintTags() {
    if (!W || !st.cur2 || !st.rs) return;
    const R = st.rs, i = R.i;
    [0, 1].forEach(k => {                                     // 0＝我、1＝對手
      const T = k === 0 ? st.myTops[i] : st.oppTops[i], el = E.tags[k];
      if (!T || !T.holder.visible) { el.classList.add("tp-off"); return; }
      if (!el.firstChild || el.dataset.ch !== T.ch) { el.textContent = ""; el.dataset.ch = T.ch; el.appendChild(acSpan(T.ch, T.z)); }
      const p = W.topScreen(T); el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -110%)`;
    });
  }
  function toggleFast() { st.fast = !st.fast; E.ff.classList.toggle("tp-on", st.fast); play("key", st.fast ? 1.4 : 0.9); }

  // ===================== 結算 =====================
  function finishMatch() {
    if (st.phase === "result") return;
    st.phase = "result"; st.rs = null;
    const win = st.score[0] >= 3, board = st.board || { island: [], home: [] };
    const power = st.power.total, entry = { p: st.phrase, power, z: st.z };
    const record = !board.home.length || power > board.home[0].power;
    const home = homeInsert(board.home, entry);
    const info = {
      win, power, phrase: st.phrase, z: st.z.slice(), score: st.score.slice(), opponent: { p: st.opp.p, power: st.opp.power },
      rounds: st.match.rounds.slice(0, st.score[0] + st.score[1]).map(r => ({ i: r.i, me: st.phrase[r.i], them: st.opp.p[r.i], win: r.winner === "a", how: r.how })),
      bonuses: st.power.bonuses.map(b => ({ ...b })), record, home,
    };
    st.win = info;
    fought.push({ p: st.phrase, o: st.opp.p }); if (fought.length > 30) fought.shift();   // 同一句再下場時避開打過的對手
    if (st.hatch === st.phrase) { setEggs(getEggs().filter(e => e.p !== st.hatch)); st.hatch = null; }   // 孵出來打完了＝那顆蛋用掉（中途離開的話蛋還在、券也退回）
    try { api.onWin && api.onWin(info); } catch (e) { console.warn("[tops] onWin", e); }
    // 全島榜：常用字、沒擋到、而且戰力可能進前 5 才送（其他詞句永遠不離開這台裝置）；同一次開頁同一句只送一次（換對手再打不重送）
    const isl = board.island, issue = TP.phraseIssue(st.phrase, Dk);
    st.sentP = st.sentP || new Set();
    const could = !issue && (isl.length < 5 || power > isl[isl.length - 1].power) && !isl.some(e => e.p === st.phrase && e.power >= power) && !st.sentP.has(st.phrase);
    st.submit = { issue, could, sent: false, res: null };
    if (could && api.onSubmit) {
      st.submit.sent = true; st.sentP.add(st.phrase);
      let ret; try { ret = api.onSubmit(st.phrase, power); } catch (e) { ret = null; }
      const my = run;
      Promise.resolve(ret).then(r => { if (my !== run || !st) return; st.submit.res = r || null; paintSubmit(); }).catch(() => {});
    }
    st.board = { ...board, island: isl, home };
    E.cheerHint.classList.add("tp-off"); E.ff.classList.remove("tp-auto2");
    st.canRematch = !win && !st.rematchUsed;                 // 輸了：一次免費「換個對手再打」（不用重打字、不扣券；每張券限一次）
    banner(win ? "🏆 你贏了！" : "差一點點！", win ? "tp-bn-final" : "tp-bn-lose", 1.6);
    play(win ? "win" : "lose"); talk(win ? LINES.win : st.canRematch ? LINES.loseRematch : LINES.lose, true);
    if (W && st.myTops) {                                     // 贏了：我的 5 顆在碗裡排一圈轉；輸了：對手的
      const team = win ? st.myTops : st.oppTops;
      [...st.myTops, ...st.oppTops].forEach(T => { T.holder.visible = false; T.fall = null; T.tilt.rotation.set(0, 0, 0); });
      team.forEach((T, i) => { const a = i / 5 * Math.PI * 2 - Math.PI / 2; T.holder.visible = true; W.placeTop(T, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 1); });
      st.circle = team; W.zoom = null; W.follow = { x: 0, z: 0, r: 4.2 }; E.tags.forEach(t => t.classList.add("tp-off"));
      if (win) for (let k = 0; k < 4; k++) at(0.2 + k * 0.35, () => W && W.spark((Math.random() - 0.5) * 6, 1.5, (Math.random() - 0.5) * 4, 40, 1.2));
    }
    if (record) at(1.2, () => { play("record"); talk(LINES.record); });
    at(1.9, () => showResult());
  }
  function showResult() {
    const r = st.win; E.result.textContent = "";
    const pan = mk("div", "tp-rpanel" + (r.win ? " tp-rwin" : ""), E.result);
    const left = mk("div", "tp-rleft", pan);
    mk("div", "tp-rtitle", left, r.win ? "🏆 你贏了！" : "差一點點！");
    mk("div", "tp-rscore", left, `${r.score[0]} : ${r.score[1]}`);
    left.appendChild(phraseEl(r.phrase, r.z, "tp-ph tp-rph"));
    const pw = mk("div", "tp-rpow", left); mk("span", "", pw, "戰力"); mk("b", "", pw, String(r.power)); const tr = tierOf(r.power); mk("span", "tp-tier tp-tier" + tr.k, pw, tr.ico + " " + tr.name);
    if (r.record) bump(mk("div", "tp-rec", left, "✨ 新紀錄！"), "tp-pop");
    const bl = mk("div", "tp-rbon", left); r.bonuses.forEach(b => mk("span", "tp-badge", bl, b.name + " +" + b.value));
    st.statusEl = mk("div", "tp-rstatus", left); paintSubmit();
    starCard(left);                                            // 15 格集點卡（10-12 櫻木：不要只說「再拿 N 顆」）
    const right = mk("div", "tp-rright", pan);
    renderBoards(right);
    const bt = mk("div", "tp-rbtns", pan);
    if (st.canRematch) btn("tp-btn tp-rematch", bt, "🔄", () => rematch(), "換個對手再打").appendChild(mk("span", "tp-btn-t", null, "換個對手再打"));
    btn("tp-btn tp-again", bt, "🔁", () => enterTypeOrEggs(), "再玩一次").appendChild(mk("span", "tp-btn-t", null, "再玩一次"));
    btn("tp-btn tp-home", bt, "🏝️", () => exit("done"), "回小島").appendChild(mk("span", "tp-btn-t", null, "回小島"));
    showOnly("result"); bump(pan, "tp-pop");
    if (W) W.lowPower(true);                                   // 結算期間 3D 降像素比到 1（10-12 里維：省電）
    relayout();
  }
  // 輸了：換個對手再打（不用重打字、不扣券、每張券限一次）——挑沒打過、會贏的對手（第一次輸也不要連輸兩場）
  function rematch() {
    if (!st || st.phase !== "result" || !st.canRematch || st.rematchUsed) return;
    st.rematchUsed = true; st.canRematch = false; st.rematches = (st.rematches || 0) + 1;
    play("go");
    st.tl.length = 0; st.match = st.rs = st.win = st.submit = st.score = st.circle = st.cur2 = st.statusEl = null; st.fast = false;
    E.result.textContent = ""; E.banner.textContent = ""; E.wrap.classList.remove("tp-slowmo"); E.tags.forEach(t => t.classList.add("tp-off"));
    st.opp = pickOpponent(st.board, { rematch: true });
    if (W) {
      W.lowPower(false); if (st.oppTops) W.removeTops(st.oppTops); st.oppTops = null;
      W.zoom = null; W.zoomOut = null; W.shake = 0;
      st.myTops.forEach((T, i) => { T.fall = null; T.tilt.rotation.set(0, 0, 0); T.holder.scale.setScalar(1); T.holder.visible = true; W.placeTop(T, (i - 2) * 2.05, 0, 0.35); });
    }
    st.phase = "morph"; showOnly("morph"); E.vsInfo.textContent = ""; E.vs.classList.remove("tp-shown"); E.morph.classList.remove("tp-vson"); E.fight.disabled = true;
    relayout();
    talk(LINES.rematch, true);
    at(0.8, () => showVs());
    startLoop();
  }
  function paintSubmit() {
    if (!st || !st.statusEl) return;
    const r = st.submit && st.submit.res;
    st.statusEl.textContent = r && r.pending ? "⏳ 審核後就會上榜喔！" : r && r.rank ? `🏝️ 上榜了！第 ${r.rank} 名` : "";
    if (r && (r.pending || r.rank) && !st.saidSubmit) { st.saidSubmit = true; talk(r.pending ? LINES.pending : LINES.ranked); }
  }
  function renderBoards(parent) {
    const b = st.board || { island: [], home: [] };
    [["🏝️ 全島陀螺榜", b.island, "tp-isl"], ["🏠 我家排行", b.home, "tp-homeb"]].forEach(([title, list, cls]) => {
      const box = mk("div", "tp-board " + cls, parent); mk("div", "tp-board-t", box, title);
      if (!list.length) mk("div", "tp-board-e", box, "還沒有紀錄");
      list.slice(0, 5).forEach((e, i) => {
        const row = mk("div", "tp-row" + (st.phrase && e.p === st.phrase ? " tp-mine" : ""), box);
        mk("span", "tp-rank", row, String(i + 1)); row.appendChild(phraseEl(e.p, e.z || zOf(e.p, Dk), "tp-ph tp-row-ph")); mk("b", "tp-row-p", row, String(e.power));
      });
    });
  }
  async function showBoards() {
    if (!st || st.phase !== "type") return;
    const my = run, b = await st.boardP; if (my !== run || !st) return;
    st.board = st.board || b;
    E.boards.textContent = ""; const pan = mk("div", "tp-rpanel tp-bpanel", E.boards);
    const right = mk("div", "tp-rright", pan); renderBoards(right);
    btn("tp-btn tp-close", pan, "✖", () => E.boards.classList.add("tp-off"), "關掉");
    E.boards.classList.remove("tp-off"); play("pop");
  }
  // （10-12 起沒券不再擋在門口：照樣進打字畫面，「下場！」變「存成蛋！」→ showEggSaved）
  function exit(why) { const s = st; if (!s || s.exited) return; s.exited = true; try { api.onExit && api.onExit({ why }); } catch (e) {} }

  // ===================== 版面 =====================
  let L = null;
  function relayout() {
    if (!E || !st) return;
    const rc = root.getBoundingClientRect(), Wd = rc.width || innerWidth, Hd = rc.height || innerHeight;
    const vm = Math.min(Wd, Hd) / 100, land = Wd >= Hd * 1.05, side = land && Hd < 520, port = !land;
    const m = Math.max(8, 1.6 * vm), g = Math.max(4, 0.9 * vm);
    const w = E.wrap.style;
    E.wrap.classList.toggle("tp-land", land && !side); E.wrap.classList.toggle("tp-side", side); E.wrap.classList.toggle("tp-port", port);
    w.setProperty("--u", vm + "px"); w.setProperty("--m", m + "px"); w.setProperty("--g", g + "px");
    // ---- 打字畫面 ----
    const kw = (Wd - 2 * m - 10 * g) / 11, kh = Math.max(56, Math.min(kw * (port ? 1.35 : 1.15), Hd * (side ? 0.15 : 0.095), 96));
    const kbH = 4 * kh + 3 * g, kbTop = Hd - m - kbH;
    w.setProperty("--kw", kw + "px"); w.setProperty("--kh", kh + "px");
    Object.assign(E.kb.style, { left: m + "px", top: kbTop + "px", width: (Wd - 2 * m) + "px", height: kbH + "px" });
    const resL = 30 * vm;                                     // 左上留給主程式的 🏠🎵
    const top = m, avail = kbTop - g - top;
    let S, C, goW;
    if (side) {
      S = clamp(Math.min((avail - g) / 2, 84), 52, 84); C = S;
      goW = S * 1.55;
      const toolsW = 2 * S + g, slotsW = 5 * S + 4 * g;
      const x0 = Math.max(resL, (Wd - slotsW - goW - toolsW - 2 * g) / 2);
      E.head.style.cssText = `left:${x0 + slotsW + goW + 2 * g}px;top:${top}px;width:${toolsW}px;height:${S}px`;
      E.slotrow.style.cssText = `left:${x0}px;top:${top}px;width:${slotsW + g + goW}px;height:${S}px`;
      E.note.style.cssText = `display:none`;
      E.candbar.style.cssText = `left:${m}px;top:${top + S + g}px;width:${Wd - 2 * m}px;height:${C}px`;
    } else {
      const B = Math.max(56, 11 * vm), N = Math.max(22, 3.4 * vm);
      goW = land ? Math.min(20 * vm, 180) : 0;
      S = Math.min(land ? 18 * vm : 17 * vm, 150, (Wd - 2 * m - 4 * g - (land ? goW + g : 0)) / 5, land ? (avail - B - N - 3 * g) / 1.85 : 999);
      C = clamp(S * (port ? 0.9 : 0.8), 56, 124);
      const goH = port ? Math.max(64, S * 0.62) : 0;
      const used = B + S + N + C + (port ? goH + g : 0) + 3 * g, y0 = top + Math.max(0, (avail - used) / 2);
      E.head.style.cssText = `left:${resL}px;top:${top}px;width:${Wd - resL - m}px;height:${B}px`;
      const slotsW = 5 * S + 4 * g, rowW = slotsW + (land ? g + goW : 0), rowY = Math.max(y0 + B + g, top + B + g);
      E.slotrow.style.cssText = `left:${(Wd - rowW) / 2}px;top:${rowY}px;width:${rowW}px;height:${S + (port ? g + goH : 0)}px`;
      E.note.style.cssText = `left:${m}px;top:${rowY + S + (port ? g + goH : 0) + g}px;width:${Wd - 2 * m}px;height:${N}px`;
      E.candbar.style.cssText = `left:${m}px;top:${rowY + S + (port ? g + goH : 0) + N + 2 * g}px;width:${Wd - 2 * m}px;height:${C}px`;
      w.setProperty("--goh", goH + "px");
    }
    w.setProperty("--S", S + "px"); w.setProperty("--C", C + "px"); w.setProperty("--gow", goW + "px");
    const pgW = Math.max(48, C * 0.62);
    st.perPage = Math.max(1, Math.floor((Wd - 2 * m - 2 * pgW - 2 * g + g) / (C + g)));
    w.setProperty("--pgw", pgW + "px");
    // ---- 3D：變身（上面戰力、下面能力卡）／對戰（上面兩隊、下面快轉） ----
    let rect;
    if (st.phase === "morph" || st.phase === "type") {
      const headH = E.mhead.getBoundingClientRect().height || 90, cardH = side ? Hd * 0.3 : Hd * 0.26, vsH = side ? 0 : port ? 2 * Math.max(64, 11 * vm) + 10 : Math.max(70, 11 * vm);
      rect = { x: m, y: headH + m, w: Wd - 2 * m, h: Math.max(80, Hd - headH - cardH - vsH - 3 * m) };
      w.setProperty("--cardh", cardH + "px"); w.setProperty("--cardy", (rect.y + rect.h) + "px");
      if (W) W.fit(Wd, Hd, rect, "morph");
      if (W && st.myTops) st.myTops.forEach((T, i) => { const p = W.project((i - 2) * 2.05, 0, 0), c = E.cardEls[i]; c.style.left = p.x + "px"; });
      if (!W) E.cardEls.forEach((c, i) => { c.style.left = (Wd / 2 + (i - 2) * Wd / 5.4) + "px"; });
    } else {
      const hudH = side ? 64 : Math.max(84, 13 * vm);
      rect = { x: m, y: hudH, w: Wd - 2 * m, h: Hd - hudH - m };
      if (st.phase === "result") rect = { x: 0, y: 0, w: Wd, h: Hd };
      if (W) W.fit(Wd, Hd, rect, "battle");
    }
    const stripW = port ? Wd / 2 - m - 8 * vm : Wd / 2 - 29 * vm - Math.max(48, 7 * vm) - g;   // 左邊讓出 🏠🎵、中間讓出比分
    w.setProperty("--stripw", stripW + "px"); w.setProperty("--chipf", clamp(stripW / 10.8, 16, 30) + "px");
    L = { Wd, Hd, vm, land, side, port, kw, kh, S, C, rect };
  }

  // ===================== 每格 =====================
  function startLoop() { if (!raf) { lastMs = 0; raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!st) return;
    // 效能體檢 10-12：沒有 3D 要畫、也沒有排程（打字、沒券、載入中）→ 停掉迴圈（下場 enterMorph()、開戰 tapFight() 會再 startLoop()）
    if (!W && st.phase !== "battle" && !st.tl.length && !st.rolls.length) { cancelAnimationFrame(raf); raf = 0; return; }
    if (lastMs && now - lastMs < 1000 / 30 - 3) return;       // 最多 30 格／秒（-3ms 容許 rAF 抖動，跟小島一樣；物理是事先模擬好的，播放用 gdt，不受格數影響）
    const real = lastMs ? Math.min(0.05, (now - lastMs) / 1000) : 0; lastMs = now;
    const gdt = paused() ? 0 : real * SPD() * (st.phase === "battle" ? (st.fast ? 3 : (st.rs && st.rs.speed) || 1) : 1);   // ⏩＝3 倍；第 4、5 回合預設 2 倍
    st.clock += gdt;
    runTimeline(); if (!st) return;
    if (st.rolls.length) { const r = st.rolls.splice(0); r.forEach(f => f()); }
    if (st.phase === "battle") { stepBattle(gdt); if (st.rs && st.rs.stage === "end") paintTags(); }   // 回合結束後名牌照樣跟著（飛出場的那顆、倒下的那顆）
    if (W) {
      if (st.circle) st.circle.forEach((T, i) => { const a = i / 5 * Math.PI * 2 - Math.PI / 2 + st.clock * 0.6; W.placeTop(T, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0.9); });
      if (st.phase === "morph" && st.myTops) st.myTops.forEach(T => { T.S = 0.35; });
      W.liveShadow = st.phase === "battle" || !!st.circle;   // 對戰中、結算繞圈：陀螺一直在移動 → 陰影每格重畫
      W.frame(gdt, real);
    }
  }

  // ===================== 公開介面 =====================
  function start(opts = {}) {
    stop();
    run++;
    const my = run;
    st = { phase: "load", opts, spoken: [], tl: [], rolls: [], clock: 0, slots: [null, null, null, null, null], cur: 0, comp: { ini: "", med: "", fin: "" }, tone: null, cands: [], candZ: [], sel: 0, page: 0, ticketUsed: 0 };
    voice.q.length = 0; voice.busy = false; voice.tok++;
    build(); relayout(); showOnly();
    st.boardP = Promise.resolve().then(() => api.leaderboard ? api.leaderboard() : null).catch(() => null);
    st.readyP = loadDict(api.dictUrl, +api.dictTimeout || 15000).then(D => {
      if (my !== run || !st) return;
      Dk = D;
      st.boardP = st.boardP.then(b => normBoard(b)).catch(() => normBoard(null));
      st.boardP.then(b => { if (my === run && st && !st.board) st.board = b; });   // 對手要避開的「最近對戰」在 board.recent
      enterTypeOrEggs();                                          // 沒券也能打字（存成陀螺蛋）；有券又有蛋＝先問要不要孵
      startLoop();
    }).catch(e => {
      console.warn("[tops] 字典載入失敗", e);
      if (my !== run || !st) return;
      try { api.onFail && api.onFail({ why: "dict" }); } catch (e2) {}
      E.loading.textContent = "😢";
    });
    return st.readyP;
  }
  function stop() {
    run++; voice.tok++; voice.q.length = 0; voice.busy = false;
    teardown();
    st = null; L = null;
  }
  function state() {
    if (!st) return null;
    return {
      phase: st.phase, slots: st.slots.map(s => s && { ...s }), cur: st.cur, comp: compSylSafe(), tone: st.tone, cands: st.cands.slice(), sel: st.sel, page: st.page,
      phrase: st.phrase || null, power: st.power ? st.power.total : null, opp: st.opp ? { p: st.opp.p, power: st.opp.power } : null,
      round: st.rs ? { i: st.rs.i, stage: st.rs.stage, slow: st.rs.slow, speed: st.rs.speed || 1 } : null, score: st.score ? st.score.slice() : null, fast: !!st.fast,
      win: st.win || null, submit: st.submit || null, spoken: st.spoken.slice(), ticketUsed: st.ticketUsed, clock: st.clock, layout: L && { ...L },
      candZ: (st.candZ || []).slice(), keysOff: st.phase === "type" ? [...keysOff()] : [], guide: st.phase === "type" ? guideNext() : null, guideCh: st.guide ? st.guide.ch : null,
      eggMode: !!st.eggMode, eggs: Dk ? getEggs() : [], hatch: st.hatch || null, oppWhy: st.oppWhy || null, isFree: !!st.isFree,
      canRematch: !!st.canRematch, rematchUsed: !!st.rematchUsed, rematches: st.rematches || 0, cheers: st.cheers || 0, countdown: st.countdown || 0, glowed: st.glowed || 0,
      hits: st.hits || null, stats: st.stats || null, bstats: st.bstats || null, oppHits: st.oppHits || null, greyTaps: st.greyTaps || 0,
    };
  }
  const compSylSafe = () => st ? st.comp.ini + st.comp.med + st.comp.fin : "";
  const debug = {
    dict: () => Dk, ctx: () => ({ ...CTX }), world: () => W && W.stats(), hasWorld: () => !!W,
    match: () => st && st.match && { flip: st.match.flip, winner: st.match.winner, score: st.match.score.slice(), rounds: st.match.rounds.map(r => ({ i: r.i, winner: r.winner, how: r.how, n: r.sim.n, hits: r.sim.hits.length })) },
    fight: () => tapFight(), go: () => tapGo(),
    setPhrase(p) { if (!st || st.phase !== "type" || [...p].length !== 5) return false; const zs = zOf(p, Dk); st.slots = [...p].map((ch, i) => ({ ch, z: zs[i] })); st.cur = 5; st.cands = []; st.candZ = []; st.guide = null; st.comp = { ini: "", med: "", fin: "" }; paintType(); return true; }, fast: v => { if (st) { st.fast = v == null ? !st.fast : !!v; E && E.ff.classList.toggle("tp-on", st.fast); } },
    topScreen: k => W && st && st.cur2 ? W.topScreen(st.cur2[k]) : null,
    timers: () => st ? st.tl.length : 0, raf: () => raf,
    breakMorph: () => { if (st) st.breakMorph = true; },       // 測試：下一次變身丟錯（驗 onFail("morph")）
    cheer: (x, y) => { if (st && st.phase === "battle") cheer({ clientX: x, clientY: y }); },
    rematch: () => rematch(), fought: () => fought.slice(), resetInspire: () => { if (st) st.inspireN = 0; },
  };
  return { start, stop, relayout, state, debug };
}
