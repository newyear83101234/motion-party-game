// ===================== 注音戰鬥陀螺：戰力公式（純函式、無 DOM） =====================
// 前端（js/zhuyin-tops.js）與 Apps Script 後端（tools/tops/gas/TopsPower.gs，build_gas.py 從這個檔自動產生）共用同一份邏輯：
//   伺服器只收詞句本身，用這裡的公式重算戰力（不信任前端送來的數字）。
// 寫法限制（為了能原封不動貼進 GAS）：只用一般 function／var／陣列物件；不用 import、class、Map、Set、正規表示式 u 旗標；
//   最下面那行 export 由 build_gas.py 拿掉。改了這個檔要重跑 python tools/tops/build_gas.py。
// 規格：docs/zhuyin-tops-spec.md §2（★＝數字可調，改了要重跑 tools/zy-test/tops.js 看分佈）。
//
// 字典（js/zhuyin-tops-dict.json，tools/tops/build_dict.py 產生）解碼後：
//   D.chars 常用字（字頻高→低）、D.idx[字]＝編號、D.cand[音節]＝候選字串、D.syl＝所有音節
//   topsStatsOf(字, D) → [重量, 穩定, 攻擊, 防禦]（1–99；表外的字用字碼雜湊後備）

var TOPS_B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
var TOPS_INITIALS = "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ";
var TOPS_MEDIALS = "ㄧㄨㄩ";
var TOPS_FINALS = "ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ";
var TOPS_TONES = "ˊˇˋ˙";

// ★ 單字戰力：重量×1.2＋穩定×1.0＋攻擊×1.3＋防禦×1.1，換算到 100–1999
var TOPS_W = [1.2, 1.0, 1.3, 1.1];
var TOPS_CHAR_MIN = 100, TOPS_CHAR_MAX = 1999, TOPS_CAP = 9999;
// ★ 同一個字出現第 3 次起只算 6 成（不然「最強的字打 5 次」就穩坐第一，排行榜沒變化）
var TOPS_REPEAT_KEEP = 0.6;
// ★ 組合加成（每種每句最多一次）；name＝結算畫面顯示、也是配音台詞（tools/voice/build_lines.py 會斷言）
var TOPS_BONUS = {
  double: { name: "疊字加成！", value: 200 },     // 相鄰兩字一樣（爸爸、翹翹）
  rhyme: { name: "押韻加成！", value: 300, more: [450, 600] },   // 5 字中有 3 字以上同韻母（不看聲調、不看介音）；4 字 450、5 字 600
  tone: { name: "同聲調加成！", value: 250, more: [350, 450] },   // 連續 3 字以上同聲調；連 4 字 350、連 5 字 450
  animal: { name: "動物加成！", value: 150 },
  color: { name: "顏色加成！", value: 150 },
  strong: { name: "強字加成！", value: 100 }
};
var TOPS_ANIMALS = "貓狗牛馬羊豬雞鴨鵝兔虎獅象猴熊蛇蛙龍鳳鳥魚蝦蟹龜鼠鹿狼狐豹鯨鯊蜂蝶蟲雀鷹鴿燕鶴豚駝蟻蚊蠅鯉鰻蝸鴕貂獺猩狸羚蜥鱷蛛蝠鴉鸚鵡企蚌螺";
var TOPS_COLORS = "紅橙黃綠藍紫黑白灰粉金銀彩青棕褐";
var TOPS_STRONG = "超強王神霸帝皇勇猛威無敵巨鋼鐵雷電火";
// 全島榜不收的詞（後端照這份擋；含常見諧音繞法）。前端：含這些字詞的句子照樣能玩、進「我家排行」，只是不送出。
var TOPS_BLOCK = ["幹", "淦", "姦", "屌", "屄", "婊", "賤", "屎", "尿", "屁", "洨", "肛", "尻", "撚",
  "操你", "操他", "幹你", "乾你", "甘霖", "靠北", "靠背", "靠杯", "靠悲", "哭爸", "哭夭", "哭腰", "三小", "啥小", "殺小", "林北", "林娘", "恁娘",
  "你娘", "你媽", "他媽", "媽的", "機掰", "雞掰", "雞巴", "機巴", "雞歪", "機歪", "雞雞", "懶覺", "懶叫", "北七", "白癡", "白痴", "智障", "腦殘", "廢物",
  "笨蛋", "混蛋", "王八", "賤人", "去死", "死掉", "殺死", "打死", "砍死", "自殺", "色情", "做愛", "性交", "陰莖", "陰道", "乳頭", "奶頭", "脫光", "裸體"];
// 比對黑名單前先拿掉的正常詞（不然「媽媽的拖鞋」會被「媽的」誤擋、「你媽媽」被「你媽」誤擋）
var TOPS_ALLOW = ["媽媽"];

function topsDecodeDict(raw) {
  var D = { raw: raw, chars: raw.chars, n: raw.n, syl: raw.syl, idx: {}, cand: {}, prim: [] };
  var i;
  for (i = 0; i < raw.chars.length; i++) D.idx[raw.chars.charAt(i)] = i;
  for (i = 0; i < raw.syl.length; i++) D.cand[raw.syl[i]] = raw.cand[i];
  for (i = 0; i < raw.chars.length; i++) {
    var k = TOPS_B64.indexOf(raw.prim.charAt(i * 2)) * 64 + TOPS_B64.indexOf(raw.prim.charAt(i * 2 + 1));
    D.prim.push(raw.syl[k]);
  }
  return D;
}

// 字碼雜湊（FNV-1a）：表外的字也有固定能力（20–80，比常用字平凡）
function topsHash(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function topsStatsOf(ch, D) {
  var i = D && D.idx.hasOwnProperty(ch) ? D.idx[ch] : -1;
  if (i >= 0) {
    var s = D.raw.stats.substr(i * 8, 8);
    return [+s.substr(0, 2), +s.substr(2, 2), +s.substr(4, 2), +s.substr(6, 2)];
  }
  var h = topsHash(ch), out = [];
  for (var k = 0; k < 4; k++) { out.push(20 + (h % 61)); h = Math.floor(h / 61) + k * 7919; }
  return out;
}
function topsReadingOf(ch, D) { var i = D && D.idx.hasOwnProperty(ch) ? D.idx[ch] : -1; return i >= 0 ? D.prim[i] : ""; }
function topsInDict(ch, D) { return !!(D && D.idx.hasOwnProperty(ch)); }

function topsCharPower(st) {
  var raw = st[0] * TOPS_W[0] + st[1] * TOPS_W[1] + st[2] * TOPS_W[2] + st[3] * TOPS_W[3];
  var lo = TOPS_W[0] + TOPS_W[1] + TOPS_W[2] + TOPS_W[3], hi = 99 * lo;
  return Math.round(TOPS_CHAR_MIN + (raw - lo) / (hi - lo) * (TOPS_CHAR_MAX - TOPS_CHAR_MIN));
}

// 音節拆成 聲母／介音／韻母／聲調（1–5，5＝輕聲）；不合法回 null
function topsSplitSyl(s) {
  if (!s) return null;
  var t = 1, last = s.charAt(s.length - 1), k = TOPS_TONES.indexOf(last);
  if (k >= 0) { t = k + 2; s = s.substr(0, s.length - 1); }
  var p = 0, ini = "", med = "", fin = "";
  if (p < s.length && TOPS_INITIALS.indexOf(s.charAt(p)) >= 0) ini = s.charAt(p++);
  if (p < s.length && TOPS_MEDIALS.indexOf(s.charAt(p)) >= 0) med = s.charAt(p++);
  if (p < s.length && TOPS_FINALS.indexOf(s.charAt(p)) >= 0) fin = s.charAt(p++);
  if (p !== s.length || !(ini || med || fin)) return null;
  return { ini: ini, med: med, fin: fin, tone: t };
}
// 韻腳：韻母（不看介音）；只有介音＝介音本身；ㄓㄔㄕㄖㄗㄘㄙ 單獨成音＝空韻「ㄭ」
function topsRhyme(s) {
  var p = topsSplitSyl(s);
  if (!p) return "";
  return p.fin || p.med || "ㄭ";
}

// 拼好的音節 → 候選字（常用的在前）。輕聲沒有字的時候，退回同音節一～四聲的字（爸爸的第二個爸＝ㄅㄚ˙）
function topsCandidates(D, syl) {
  var own = D.cand[syl] || "";
  if (syl.charAt(syl.length - 1) !== "˙") return own.split("");
  var base = syl.substr(0, syl.length - 1), out = own.split(""), more = [];
  var tones = ["", "ˊ", "ˇ", "ˋ"];
  for (var i = 0; i < tones.length; i++) { var c = D.cand[base + tones[i]] || ""; for (var j = 0; j < c.length; j++) if (out.indexOf(c.charAt(j)) < 0 && more.indexOf(c.charAt(j)) < 0) more.push(c.charAt(j)); }
  more.sort(function (a, b) { return D.idx[a] - D.idx[b]; });
  return out.concat(more);
}
// 這個音節有沒有字（鍵盤用：沒有就搖一下）
function topsSylHasChars(D, syl) { return topsCandidates(D, syl).length > 0; }

// 整句戰力：{ total, sum, perChar:[{ch, z, stats, power, keep}], bonuses:[{id, name, value}] }
function topsPowerOf(phrase, D) {
  var chars = [], i, j;
  for (i = 0; i < phrase.length; i++) chars.push(phrase.charAt(i));
  var perChar = [], seen = {}, sum = 0;
  for (i = 0; i < chars.length; i++) {
    var ch = chars[i], st = topsStatsOf(ch, D), pw = topsCharPower(st);
    seen[ch] = (seen[ch] || 0) + 1;
    var keep = seen[ch] >= 3 ? TOPS_REPEAT_KEEP : 1;
    perChar.push({ ch: ch, z: topsReadingOf(ch, D), stats: st, power: pw, keep: keep });
    sum += Math.round(pw * keep);
  }
  var bonuses = [], add = function (id, n) {   // n＝3／4／5（押韻幾字、同聲調連幾字）
    var B = TOPS_BONUS[id], v = n > 3 && B.more ? B.more[Math.min(n, 5) - 4] : B.value;
    bonuses.push({ id: id, name: B.name, value: v });
  };
  // 疊字
  for (i = 1; i < chars.length; i++) if (chars[i] === chars[i - 1]) { add("double"); break; }
  // 押韻：同韻母 ≥3 字（用每個字的主要讀音）
  var rc = {}, best = 0;
  for (i = 0; i < perChar.length; i++) { var r = topsRhyme(perChar[i].z); if (r) { rc[r] = (rc[r] || 0) + 1; if (rc[r] > best) best = rc[r]; } }
  if (best >= 3) add("rhyme", best);
  // 同聲調連發：連續 ≥3 字同聲調
  var run = 0, prevT = 0, longest = 0;
  for (i = 0; i < perChar.length; i++) {
    var sp = topsSplitSyl(perChar[i].z), t = sp ? sp.tone : 0;
    run = t && t === prevT ? run + 1 : (t ? 1 : 0); prevT = t;
    if (run > longest) longest = run;
  }
  if (longest >= 3) add("tone", longest);
  var has = function (set) { for (j = 0; j < chars.length; j++) if (set.indexOf(chars[j]) >= 0) return true; return false; };
  if (has(TOPS_ANIMALS)) add("animal");
  if (has(TOPS_COLORS)) add("color");
  if (has(TOPS_STRONG)) add("strong");
  var bsum = 0;
  for (i = 0; i < bonuses.length; i++) bsum += bonuses[i].value;
  return { total: Math.min(TOPS_CAP, sum + bsum), sum: sum, perChar: perChar, bonuses: bonuses };
}

// 全島榜收不收：null＝可以；"len" 不是 5 個字、"notcommon" 有字不在常用字表、"formula" 試算表公式開頭、"blocked" 黑名單
function topsPhraseIssue(phrase, D) {
  if (typeof phrase !== "string") return "len";
  var c0 = phrase.charAt(0);
  if (c0 === "=" || c0 === "+" || c0 === "-" || c0 === "@") return "formula";
  if (phrase.length !== 5) return "len";
  for (var i = 0; i < 5; i++) if (!topsInDict(phrase.charAt(i), D)) return "notcommon";
  var q = phrase, a, k;
  for (a = 0; a < TOPS_ALLOW.length; a++) q = q.split(TOPS_ALLOW[a]).join("＿＿");
  for (k = 0; k < TOPS_BLOCK.length; k++) if (q.indexOf(TOPS_BLOCK[k]) >= 0) return "blocked";
  return null;
}

// @@ESM-EXPORT（build_gas.py 從這行以下全部拿掉）
export {
  topsDecodeDict as decodeDict, topsStatsOf as statsOf, topsReadingOf as readingOf, topsInDict as inDict, topsCharPower as charPower,
  topsSplitSyl as splitSyl, topsRhyme as rhymeOf, topsCandidates as candidates, topsSylHasChars as sylHasChars, topsPowerOf as powerOf,
  topsPhraseIssue as phraseIssue, topsHash as hashStr,
  TOPS_BONUS as BONUS, TOPS_ANIMALS as ANIMALS, TOPS_COLORS as COLORS, TOPS_STRONG as STRONG, TOPS_BLOCK as BLOCK, TOPS_ALLOW as ALLOW, TOPS_CAP as CAP,
  TOPS_INITIALS as INITIALS, TOPS_MEDIALS as MEDIALS, TOPS_FINALS as FINALS
};
