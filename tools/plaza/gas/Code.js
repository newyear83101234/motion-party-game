/**
 * 注音小島「小島同樂廣場」後端（Google Apps Script 網頁應用程式，綁定試算表「注音小島同樂廣場」）
 *
 * 隱私設計（規格 docs/zhuyin-plaza-spec.md §2）：
 *   - 只收 {w 週次, k 種類, n 數量}（＋選填 i）；多一個別的欄位就拒收。
 *   - i＝這「一筆送出」的隨機代號（6–16 碼小寫英數，2026-10-12 里維建議加）：前端每筆新產生一個、同一筆重送才沿用，
 *     伺服器只放在 CacheService 6 小時（不寫試算表）用來擋「已經加過、只是回應沒收到」的重送重複計數。不是裝置代號：每筆都不一樣。
 *   - 只存「每週全島加總」；不存裝置 ID、token、暱稱、個人成績、IP（Apps Script 的 e 物件本來就沒有 IP）。
 *   - 不寫任何 log（沒有 console / Logger），試算表的時間只有每週一列的「最後更新（到分鐘）」。
 *
 *
 * 注音戰鬥陀螺「全島陀螺榜」（2026-10-12 加，規格 docs/zhuyin-tops-spec.md §4 原設計＋阿葉決定的審核制）：
 *   - 送出只收 {k:"top", p:"五個國字"} 兩個欄位；戰力由伺服器用同一份公式（TopsPower.gs＋TopsDict.gs，
 *     tools/tops/build_gas.py 從 js/zhuyin-tops-power.js 產生，請勿手改）重算，不收前端的數字。
 *   - 「陀螺榜」分頁只存：詞句、戰力、狀態、公開勾選、首次送出日期（只到日）。沒擠進前 5 名的不存。
 *   - 新進前 5 名先「待審核」，阿葉勾「公開」才上榜（「自動公開」開關預設不勾）；待審核 7 天沒處理自動刪；最多留 50 列。
 *
 * 結構：
 *   1. 設定 PLAZA
 *   2. 純邏輯（不碰 Apps Script 全域物件，tools/plaza/test-core.mjs 用 node 直接測）
 *   3. Apps Script 層（doGet / doPost / setup / onEdit 與試算表讀寫）
 *
 * 函式名結尾有底線 _ 的是內部函式（Apps Script 不會讓外部呼叫，也不會出現在「執行」選單）。
 */

// ───────────────────────────── 1. 設定 ─────────────────────────────

var PLAZA = {
  TZ_OFFSET_MS: 8 * 3600 * 1000,   // 台北時間 UTC+8（台灣沒有日光節約時間）
  DAY_MS: 86400000,
  ROTATION_START: '2026-10-12',    // 主題輪替從這週（週一）開始；上週結果也只回這週以後的
  GRACE_MS: 10 * 60 * 1000,        // 換週後 10 分鐘內，仍接受「上一週」的送出（跨週邊界不掉資料）
  RATE_LIMIT_PER_MIN: 120,         // 全站每分鐘最多接受幾次送出（全域保險絲，不分來源；10-12 里維建議 1500 → 120）
  ID_TTL_SEC: 21600,               // 送出代號 i 記多久（CacheService 上限 6 小時）：這段時間內同一個 i 再送來只回 ok、不再加
  ID_RE: /^[a-z0-9]{6,16}$/,       // 送出代號 i 的格式
  GET_CACHE_SEC: 30,               // doGet 回應快取秒數
  CONFIG_CACHE_SEC: 60,            // 主題表快取秒數（doPost 用）
  MAX_BODY: 200,                   // 送出內容最長字元數
  LOCK_WAIT_MS: 8000,              // 等鎖最久幾毫秒，等不到回 busy（前端下次再送）
  SHEET_ID: '1NEctJcl4y_zvyFQ5l0GbMYc_GZTrDRmoK2B8LR7SZkw', // 綁定試算表 ID（不是秘密；只在拿不到「目前試算表」時備用）
  SHEET_ROWS: '本週',
  SHEET_THEMES: '主題表',
  SHEET_INFO: '說明',
  PAUSE_NAME: 'PAUSE',             // 暫停儲存格的「命名範圍」名稱
  N_MAX: { goal: 10, play: 10, cheer1: 3, cheer2: 3, cheer3: 3, cheer4: 3 },   // goal 10-12 里維建議 30 → 10（前端 js/zhuyin-plaza.js N_MAX 要一樣：合併送出時照這個分批）
  CHEERS: ['我來玩了！', '一起加油！', '我救到動物了！', '這關好好玩！'],
  ROTATION: ['rescue', 'deliver', 'fish', 'read', 'star'],
  THEMES: {
    rescue:  { title: '救援週', unit: '隻', desc: '大家一起在泡泡救援灣救出動物', goals: [50, 150, 300] },
    deliver: { title: '送貨週', unit: '件', desc: '大家一起在彩虹配送站送出貨物', goals: [40, 120, 240] },
    fish:    { title: '釣魚週', unit: '條', desc: '大家一起釣起魚',               goals: [60, 180, 360] },
    read:    { title: '讀字週', unit: '題', desc: '大家一起答對題目（任何遊戲）', goals: [150, 450, 900] },
    star:    { title: '收集週', unit: '顆', desc: '大家一起拿到星星',             goals: [100, 300, 600] }
  },
  ROW_HEADERS: ['週次（週一）', '主題代號', '主題', '大家合計', '銅', '銀', '金', '開始局數',
    '貼紙：我來玩了！', '貼紙：一起加油！', '貼紙：我救到動物了！', '貼紙：這關好好玩！', '最後更新（台北，到分鐘）'],
  THEME_HEADERS: ['週次（週一日期）', '主題代號', '標題（可空）', '單位（可空）', '銅', '銀', '金', '說明（可空）'],

  // 全島陀螺榜
  SHEET_TOPS: '陀螺榜',
  TOPS_AUTO_NAME: 'TOPS_AUTO',     // 「自動公開」勾選格的命名範圍（預設不勾＝要審核）
  TOPS_SHOW: 5,                    // 榜上顯示前幾名
  TOPS_KEEP: 50,                   // 分頁最多留幾列（依戰力；其餘刪掉，避免越積越多）
  TOPS_PENDING_DAYS: 7,            // 「待審核」超過幾天沒處理就刪（每次有人送出時順便清）
  TOPS_FIRST_ROW: 5,               // 找不到表頭時，資料從第幾列開始
  TOPS_COLS: ['詞句', '戰力', '狀態', '公開', '首次送出日期'],
  TOPS_ST: { pub: '公開', pending: '待審核', hidden: '不公開' },
  TOPS_WHY: { len: 'bad_len', notcommon: 'bad_char', formula: 'bad_formula', blocked: 'blocked' },
  TOPS_NOTE: '勾「公開」才會上榜；請不要公開看起來像人名、小名、學校、地址的詞句',
  TOPS_AUTO_LABEL: '← 自動公開：打勾＝擠進前 5 名的新詞句直接公開、不用審核（建議不要勾）',
  TOPS_CHECK: '審核：像人名、小名、暱稱、學校、地址、髒話、品牌、藝人、政治、宗教的都不要勾。不公開的把「狀態」改成「不公開」（別刪整列，刪了同一句下次又會跑來）。待審核放 7 天會自動刪。'
};

// ───────────────────────────── 2. 純邏輯 ─────────────────────────────

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** UTC 毫秒（取 UTC 日期欄位）→ 'YYYY-MM-DD' */
function ymdFromUtcMs_(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

/** 'YYYY-MM-DD' → 該日 UTC 00:00 的毫秒（只當日曆計算用） */
function ymdToUtcMs_(ymd) {
  var p = String(ymd).split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}

/** 任一時間點（毫秒）→ 台北時間該週週一的 'YYYY-MM-DD'（週一 00:00 換週） */
function weekKeyOf_(ms) {
  var d = new Date(ms + PLAZA.TZ_OFFSET_MS);              // 平移後用 UTC 欄位讀＝台北的日期
  var back = (d.getUTCDay() + 6) % 7;                     // 週一=0 … 週日=6
  return ymdFromUtcMs_(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
}

/** 週 key → 該週週一台北 00:00 的真實毫秒 */
function weekStartMs_(wk) { return ymdToUtcMs_(wk) - PLAZA.TZ_OFFSET_MS; }

/** 週 key 加減 k 週 */
function addWeeks_(wk, k) { return ymdFromUtcMs_(ymdToUtcMs_(wk) + k * 7 * PLAZA.DAY_MS); }

/** 是否為合法的週 key（格式對、日期存在、而且是週一） */
function isWeekKey_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return weekKeyOf_(weekStartMs_(s)) === s && ymdFromUtcMs_(ymdToUtcMs_(s)) === s;
}

/** 距離輪替起點第幾週（起點=0，之前為負） */
function weekIndex_(wk) {
  return Math.round((ymdToUtcMs_(wk) - ymdToUtcMs_(PLAZA.ROTATION_START)) / (7 * PLAZA.DAY_MS));
}

/** 非負整數，其他一律 0 */
function toInt_(v) {
  var n = typeof v === 'number' ? v : parseInt(v, 10);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function isDateObj_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

/**
 * 試算表儲存格 → 週 key。可接受 'YYYY-MM-DD'、'YYYY/M/D' 文字或日期物件（試算表自動轉成日期時）。
 * 不是週一的日期會歸到「那一週的週一」。看不懂回 null。
 * dateFmt(d) 由呼叫端提供：把日期物件依試算表時區轉成 'YYYY-MM-DD'。
 */
function normalizeWeekCell_(v, dateFmt) {
  var ymd = normalizeYmd_(v, dateFmt);
  return ymd ? weekKeyOf_(weekStartMs_(ymd)) : null;
}

/** 試算表儲存格 → 'YYYY-MM-DD'（文字 'YYYY-MM-DD'／'YYYY/M/D' 或日期物件）；看不懂回 null */
function normalizeYmd_(v, dateFmt) {
  var s = null;
  if (isDateObj_(v)) s = dateFmt ? dateFmt(v) : null;
  else if (typeof v === 'string' || typeof v === 'number') s = String(v).trim();
  if (!s) return null;
  var m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s);
  if (!m) return null;
  var ymd = m[1] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[3]);
  if (ymdFromUtcMs_(ymdToUtcMs_(ymd)) !== ymd) return null; // 2026-02-30 之類
  return ymd;
}

/** 銅銀金目標：三個正整數且由小到大，否則 null */
function parseGoals_(a, b, c) {
  var g = [a, b, c].map(function (x) {
    var n = typeof x === 'number' ? x : (String(x).trim() === '' ? NaN : Number(x));
    return n;
  });
  for (var i = 0; i < 3; i++) if (!isFinite(g[i]) || g[i] < 1 || Math.floor(g[i]) !== g[i]) return null;
  if (!(g[0] < g[1] && g[1] < g[2])) return null;
  return g;
}

/**
 * 「主題表」的列（不含表頭）→ { 週key: {key,title,unit,goals,desc} }，每欄沒填或填錯就是 null（用預設）。
 * 同一週寫兩列時，下面那列為準。
 */
function parseOverrides_(rows, dateFmt) {
  var out = {};
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i] || [];
    var wk = normalizeWeekCell_(r[0], dateFmt);
    if (!wk) continue;
    var key = String(r[1] == null ? '' : r[1]).trim();
    var txt = function (v) { var s = String(v == null ? '' : v).trim(); return s || null; };
    out[wk] = {
      key: Object.prototype.hasOwnProperty.call(PLAZA.THEMES, key) ? key : null,
      title: txt(r[2]),
      unit: txt(r[3]),
      goals: parseGoals_(r[4], r[5], r[6]),
      desc: txt(r[7])
    };
  }
  return out;
}

/** 某週的主題：主題表有寫就用（逐欄覆寫），沒寫就照固定輪替 */
function resolveTheme_(wk, overrides) {
  var n = PLAZA.ROTATION.length;
  var idx = weekIndex_(wk);
  var key = PLAZA.ROTATION[((idx % n) + n) % n];
  var o = overrides ? overrides[wk] : null;
  if (o && o.key) key = o.key;
  var base = PLAZA.THEMES[key];
  return {
    key: key,
    title: (o && o.title) || base.title,
    unit: (o && o.unit) || base.unit,
    desc: (o && o.desc) || base.desc,
    goals: ((o && o.goals) || base.goals).slice()
  };
}

/**
 * 驗證 doPost 的內容。raw＝原始字串。
 * 回 {ok:true, w, k, n}（有帶 i 時多一個 i）或 {ok:false, why}
 * 週次規則：w 必須是伺服器算出的「本週」；換週後 GRACE_MS（10 分鐘）內也接受「上一週」。
 * i（選填）：這一筆送出的隨機代號，格式 PLAZA.ID_RE；格式不對＝bad_body。
 */
function validatePost_(raw, nowMs) {
  var bad = function (why) { return { ok: false, why: why }; };
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > PLAZA.MAX_BODY) return bad('bad_body');
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return bad('bad_json'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return bad('bad_body');
  var keys = Object.keys(obj);
  var hasI = keys.indexOf('i') >= 0;
  if (keys.length !== (hasI ? 4 : 3) || keys.indexOf('w') < 0 || keys.indexOf('k') < 0 || keys.indexOf('n') < 0) return bad('bad_body');
  if (hasI && (typeof obj.i !== 'string' || !PLAZA.ID_RE.test(obj.i))) return bad('bad_body');
  var k = obj.k, n = obj.n, w = obj.w;
  if (typeof k !== 'string' || !Object.prototype.hasOwnProperty.call(PLAZA.N_MAX, k)) return bad('bad_kind');
  if (typeof n !== 'number' || !isFinite(n) || Math.floor(n) !== n || n < 1 || n > PLAZA.N_MAX[k]) return bad('bad_n');
  if (!isWeekKey_(w)) return bad('bad_week');
  var cur = weekKeyOf_(nowMs);
  if (w !== cur) {
    var inGrace = w === addWeeks_(cur, -1) && (nowMs - weekStartMs_(cur)) < PLAZA.GRACE_MS;
    if (!inGrace) return bad('bad_week');
  }
  var out = { ok: true, w: w, k: k, n: n };
  if (hasI) out.i = obj.i;
  return out;
}

/** 「本週」分頁一列的資料結構 */
function newRow_(wk, theme) {
  return { w: wk, themeKey: theme.key, themeTitle: theme.title, total: 0, goals: theme.goals.slice(),
    plays: 0, cheers: [0, 0, 0, 0], updated: '' };
}

function rowFromValues_(v, dateFmt) {
  v = v || [];
  return {
    w: normalizeWeekCell_(v[0], dateFmt),
    themeKey: String(v[1] == null ? '' : v[1]),
    themeTitle: String(v[2] == null ? '' : v[2]),
    total: toInt_(v[3]),
    goals: [toInt_(v[4]), toInt_(v[5]), toInt_(v[6])],
    plays: toInt_(v[7]),
    cheers: [toInt_(v[8]), toInt_(v[9]), toInt_(v[10]), toInt_(v[11])],
    updated: String(v[12] == null ? '' : v[12])
  };
}

function rowToValues_(r) {
  return [r.w, r.themeKey, r.themeTitle, r.total, r.goals[0], r.goals[1], r.goals[2], r.plays,
    r.cheers[0], r.cheers[1], r.cheers[2], r.cheers[3], r.updated];
}

/** 遞增（回傳新物件，不改原本的）；同時把主題與目標更新成目前設定 */
function applyIncrement_(row, k, n, theme, updated) {
  var r = {
    w: row.w, themeKey: row.themeKey, themeTitle: row.themeTitle, total: row.total, goals: row.goals.slice(),
    plays: row.plays, cheers: row.cheers.slice(), updated: row.updated
  };
  if (k === 'goal') r.total += n;
  else if (k === 'play') r.plays += n;
  else {
    var m = /^cheer([1-4])$/.exec(k);
    if (!m) throw new Error('bad_kind');
    r.cheers[+m[1] - 1] += n;
  }
  if (theme) { r.themeKey = theme.key; r.themeTitle = theme.title; r.goals = theme.goals.slice(); }
  if (updated != null) r.updated = updated;
  return r;
}

/** 達到第幾段：0＝還沒、1＝銅、2＝銀、3＝金 */
function reachedLevel_(total, goals) {
  var lv = 0;
  for (var i = 0; i < 3; i++) if (goals[i] > 0 && total >= goals[i]) lv = i + 1;
  return lv;
}

/** 毫秒 → 台北時間 'YYYY-MM-DD HH:mm'（只到分鐘） */
function fmtTaipeiMinute_(ms) {
  var d = new Date(ms + PLAZA.TZ_OFFSET_MS);
  return ymdFromUtcMs_(ms + PLAZA.TZ_OFFSET_MS) + ' ' + pad2_(d.getUTCHours()) + ':' + pad2_(d.getUTCMinutes());
}

function themeOut_(t) {
  return { key: t.key, title: t.title, unit: t.unit, desc: t.desc, goals: t.goals.slice() };
}

/**
 * 組 doGet 的回應（now 由呼叫端在回應前補上，因為這份會被快取）
 * prev：上一週結果；上一週早於 ROTATION_START（還沒開始的週）就回 null。
 */
function buildGetPayload_(cur, curTheme, curRow, prevW, prevTheme, prevRow, paused, tops) {
  var total = curRow ? curRow.total : 0;
  var prev = null;
  if (prevW >= PLAZA.ROTATION_START) {
    var pt = prevRow ? prevRow.total : 0;
    prev = { w: prevW, theme: themeOut_(prevTheme), total: pt, reached: reachedLevel_(pt, prevTheme.goals) };
  }
  return {
    ok: true,
    w: cur,
    theme: themeOut_(curTheme),
    total: total,
    reached: reachedLevel_(total, curTheme.goals),
    plays: curRow ? curRow.plays : 0,
    cheers: curRow ? curRow.cheers.slice() : [0, 0, 0, 0],
    prev: prev,
    paused: !!paused,
    tops: (tops || []).slice(0, PLAZA.TOPS_SHOW),
    now: 0
  };
}

function nowMs_() { return Date.now(); }

// ───────────── 2b. 全島陀螺榜（純邏輯） ─────────────
// 一列＝{ p 詞句, power 戰力, st 'pub'（公開）|'pending'（待審核）|'hidden'（不公開）, d 首次送出日期 'YYYY-MM-DD' }

/** 毫秒 → 台北日期 'YYYY-MM-DD' */
function taipeiYmd_(ms) { return ymdFromUtcMs_(ms + PLAZA.TZ_OFFSET_MS); }

/** 寫進試算表的文字：開頭是 = + - @ 的前面加 '（一律當純文字，不會變成公式） */
function safeText_(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** 是不是陀螺榜的送出（k 是 "top"）：是就回解析好的物件，不是回 null（交給原本的週次/種類/數量驗證） */
function topsBodyOf_(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > PLAZA.MAX_BODY) return null;
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return null; }
  return obj && typeof obj === 'object' && !Array.isArray(obj) && obj.k === 'top' ? obj : null;
}

/**
 * 驗證陀螺榜送出：只能有 k、p 兩個欄位（多一個就拒收，前端送來的戰力也不收）；p 要是 5 個常用字、不在黑名單、不是公式開頭。
 * D＝topsDict()。回 {ok:true, p} 或 {ok:false, why}（why：bad_body / bad_len / bad_char / bad_formula / blocked）
 */
function validateTop_(obj, D) {
  var keys = Object.keys(obj);
  if (keys.length !== 2 || keys.indexOf('k') < 0 || keys.indexOf('p') < 0) return { ok: false, why: 'bad_body' };
  if (typeof obj.p !== 'string') return { ok: false, why: 'bad_len' };
  var issue = topsPhraseIssue(obj.p, D);
  if (issue) return { ok: false, why: PLAZA.TOPS_WHY[issue] || 'bad_phrase' };
  return { ok: true, p: obj.p };
}

/** 「陀螺榜」一列原始值 → 列物件；詞句空白回 null。勾「公開」＝公開；沒勾時狀態寫「待審核」＝待審核，其他一律不公開 */
function topsRowFromValues_(v, dateFmt, today) {
  v = v || [];
  var p = String(v[0] == null ? '' : v[0]).trim();
  if (!p) return null;
  var box = v[3] === true || String(v[3]).trim().toUpperCase() === 'TRUE';
  var txt = String(v[2] == null ? '' : v[2]).trim();
  return {
    p: p,
    power: toInt_(v[1]),
    st: box ? 'pub' : (txt === PLAZA.TOPS_ST.pending ? 'pending' : 'hidden'),
    d: normalizeYmd_(v[4], dateFmt) || today
  };
}

function topsRowToValues_(r) {
  return [safeText_(r.p), r.power, PLAZA.TOPS_ST[r.st], r.st === 'pub', r.d];
}

/** 排序：戰力高的在前；一樣強時先送出的在前；再一樣就照字（每次結果都一樣） */
function topsCmp_(a, b) {
  if (b.power !== a.power) return b.power - a.power;
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  return a.p < b.p ? -1 : (a.p > b.p ? 1 : 0);
}

function topsDaysAgo_(d, today) { return Math.round((ymdToUtcMs_(today) - ymdToUtcMs_(d)) / PLAZA.DAY_MS); }

/**
 * 整理陀螺榜（寫入前、讀取時共用）：用目前公式重算戰力；不合格的詞句（表外字、黑名單、手打錯）一律當不公開；
 * expire＝true 時刪掉「待審核」超過 7 天的；同一詞句只留一列（公開＞不公開＞待審核，日期取最早）。回新陣列（已排序）。
 * calc＝{ power(p)→戰力, issue(p)→null 或原因 }
 */
function topsPrep_(rows, today, calc, expire) {
  var rank = { pub: 3, hidden: 2, pending: 1 };
  var by = {}, out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r) continue;
    var st = calc.issue(r.p) ? 'hidden' : r.st;
    if (expire && st === 'pending' && topsDaysAgo_(r.d, today) > PLAZA.TOPS_PENDING_DAYS) continue;
    var x = { p: r.p, power: calc.power(r.p), st: st, d: r.d };
    var key = '#' + x.p, o = Object.prototype.hasOwnProperty.call(by, key) ? by[key] : null;
    if (!o) { by[key] = x; out.push(x); continue; }
    if (rank[x.st] > rank[o.st]) o.st = x.st;
    if (x.d < o.d) o.d = x.d;
  }
  return out.sort(topsCmp_);
}

/** 公開的前 n 名 → [{p, power}]（rows 要先過 topsPrep_） */
function topsPublicTop_(rows, n) {
  var out = [];
  for (var i = 0; i < rows.length && out.length < n; i++) if (rows[i].st === 'pub') out.push({ p: rows[i].p, power: rows[i].power });
  return out;
}

/** 最多留 TOPS_KEEP 列：公開前 5 名與剛加入的那一列一定留，其餘依戰力由高到低補滿 */
function topsCap_(rows, extra) {
  rows = rows.slice().sort(topsCmp_);
  if (rows.length <= PLAZA.TOPS_KEEP) return rows;
  var must = [], i;
  for (i = 0; i < rows.length && must.length < PLAZA.TOPS_SHOW; i++) if (rows[i].st === 'pub') must.push(rows[i]);
  if (extra && must.indexOf(extra) < 0) must.push(extra);
  var room = PLAZA.TOPS_KEEP - must.length, keep = [];
  for (i = 0; i < rows.length; i++) {
    if (must.indexOf(rows[i]) >= 0) keep.push(rows[i]);
    else if (room > 0) { keep.push(rows[i]); room--; }
  }
  return keep;
}

/**
 * 一筆送出套到整理好的陀螺榜上（rows 要先過 topsPrep_；power 是伺服器算的）。
 * 「擠得進前 5」只跟「公開」的比：比它強或一樣強的公開詞句不到 5 句（一樣強時先來的排前面）。
 *   新詞句：擠得進 → 存一列（自動公開開＝公開，否則待審核）；擠不進 → 不存，回 below。
 *   已經在表上（同一句只算一筆）：公開且在前 5＝public、待審核且仍擠得進＝pending，其他（含不公開）＝below。
 * 回 { rows: 新的全部列（已排序、最多 TOPS_KEEP 列）, status: 'public'|'pending'|'below', added: 是否新增一列 }
 */
function topsSubmit_(rows, p, power, auto, today) {
  var pub = [], mine = null, i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i].st === 'pub') pub.push(rows[i]);
    if (rows[i].p === p) mine = rows[i];
  }
  var stronger = 0;
  for (i = 0; i < pub.length; i++) if (pub[i] !== mine && pub[i].power >= power) stronger++;
  var fits = stronger < PLAZA.TOPS_SHOW;
  var out = rows.slice(), added = null, status;
  if (mine) {
    if (mine.st === 'pub') status = pub.indexOf(mine) < PLAZA.TOPS_SHOW ? 'public' : 'below';
    else status = mine.st === 'pending' && fits ? 'pending' : 'below';
  } else if (fits) {
    added = { p: p, power: power, st: auto ? 'pub' : 'pending', d: today };
    out.push(added);
    status = auto ? 'public' : 'pending';
  } else {
    status = 'below';
  }
  return { rows: topsCap_(out, added), status: status, added: !!added };
}

// ───────────────────────────── 3. Apps Script 層 ─────────────────────────────

/**
 * 讀取：GET 網頁應用程式網址
 * 回 {ok, w, theme:{key,title,unit,desc,goals:[銅,銀,金]}, total, reached, plays, cheers:[4], prev:{w,theme,total,reached}|null, paused,
 *    tops:[{p, power}]（全島陀螺榜：只有「公開」的前 5 名，戰力高→低）, now}
 */
function doGet(e) {
  try {
    var now = nowMs_();
    var cur = weekKeyOf_(now);
    var cache = CacheService.getScriptCache();
    var ck = 'get2:' + cur;
    var hit = cache.get(ck);
    var payload;
    if (hit) {
      payload = JSON.parse(hit);
    } else {
      var ss = getSS_();
      var fmt = makeDateFmt_(ss);
      var ov = readOverrides_(ss, fmt);
      var prevW = addWeeks_(cur, -1);
      var rows = readRows_(ss, fmt);
      var tops = [];
      try { tops = readPublicTops_(ss, fmt, now); } catch (e2) { tops = []; } // 陀螺榜出問題不影響同樂廣場
      payload = buildGetPayload_(cur, resolveTheme_(cur, ov), rows[cur] || null,
        prevW, resolveTheme_(prevW, ov), rows[prevW] || null, readPaused_(ss), tops);
      cache.put(ck, JSON.stringify(payload), PLAZA.GET_CACHE_SEC);
    }
    payload.now = now;
    return json_(payload);
  } catch (err) {
    return json_({ ok: false, why: errWhy_(err) });
  }
}

/**
 * 送出：POST（Content-Type: text/plain，內容是 JSON {w, k, n}，可多帶選填的 i＝這一筆的隨機代號）
 * 回 {ok:true} 或 {ok:false, why}；帶 i 的同一筆重送（6 小時內）一律回 {ok:true}、只加一次
 * why：bad_body / bad_json / bad_kind / bad_n / bad_week / paused / rate / busy / no_sheet / server
 *
 * 陀螺榜：內容是 {k:"top", p:"五個國字"} → 回 {ok:true, power, status:"public"|"pending"|"below"} 或 {ok:false, why}
 * why 另有：bad_len / bad_char / bad_formula / blocked（詞句不收）
 */
function doPost(e) {
  try {
    var now = nowMs_();
    var raw = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
    var top = topsBodyOf_(raw);
    if (top) return json_(postTop_(top, now));
    var v = validatePost_(raw, now);
    if (!v.ok) return json_(v);

    var cache = CacheService.getScriptCache();
    var rk = 'rl1:' + Math.floor(now / 60000);
    if (toInt_(cache.get(rk)) >= PLAZA.RATE_LIMIT_PER_MIN) return json_({ ok: false, why: 'rate' });

    var ss = getSS_();
    if (readPaused_(ss)) return json_({ ok: false, why: 'paused' });
    var fmt = makeDateFmt_(ss);
    var theme = resolveTheme_(v.w, readOverridesCached_(ss, fmt));

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(PLAZA.LOCK_WAIT_MS)) return json_({ ok: false, why: 'busy' });
    try {
      // 同一筆重送（帶同一個 i）：上次其實已經加過、只是前端沒收到回應 → 回 ok、不再加（在鎖裡查，兩個重送同時到也只加一次）
      var idKey = v.i ? 'id:' + v.i : '';
      if (idKey && cache.get(idKey)) return json_({ ok: true });
      var cnt = toInt_(cache.get(rk));
      if (cnt >= PLAZA.RATE_LIMIT_PER_MIN) return json_({ ok: false, why: 'rate' });
      cache.put(rk, String(cnt + 1), 120);
      incrementRow_(ss, fmt, v.w, theme, v.k, v.n, now);
      SpreadsheetApp.flush();
      if (idKey) cache.put(idKey, '1', PLAZA.ID_TTL_SEC);   // 真的加進去之後才記（寫入出錯＝沒記，前端用同一個 i 重送會再加一次）
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, why: errWhy_(err) });
  }
}

/**
 * 初始化（第一次由阿葉在 Apps Script 編輯器按「執行」，順便完成授權）。重複執行不會清掉資料。
 */
function setup() {
  var ss = getSS_();
  ss.setSpreadsheetTimeZone('Asia/Taipei');
  ensureSheets_(ss);
  return '同樂廣場試算表已就緒：' + ss.getSheets().map(function (s) { return s.getName(); }).join('、');
}

/** 建立缺少的分頁（說明＋暫停開關、主題表、本週）；已存在的不動 */
function ensureSheets_(ss) {
  var mine = [PLAZA.SHEET_INFO, PLAZA.SHEET_THEMES, PLAZA.SHEET_ROWS];

  // 說明分頁：新試算表預設的空白「工作表1」直接改名使用
  var info = ss.getSheetByName(PLAZA.SHEET_INFO);
  if (!info) {
    var sheets = ss.getSheets();
    if (sheets.length === 1 && mine.indexOf(sheets[0].getName()) < 0 && sheets[0].getLastRow() === 0) {
      info = sheets[0];
      info.setName(PLAZA.SHEET_INFO);
    } else {
      info = ss.insertSheet(PLAZA.SHEET_INFO);
    }
    info.getRange(1, 1, 11, 2).setValues([
      ['注音小島・小島同樂廣場', ''],
      ['', ''],
      ['這張表只存全島加總數字，不含任何個人資料。', ''],
      ['小朋友的遊戲只會送出「週次、種類、數量」三樣東西：沒有名字、沒有裝置代號、沒有 IP、沒有個人成績。', ''],
      ['', ''],
      ['緊急暫停（打勾＝暫時不收任何送出的數字；遊戲照常可以玩）→', false],
      ['', ''],
      ['「主題表」：可以改某一週的主題和銅／銀／金目標；沒寫到的週會自動輪流（救援→送貨→釣魚→讀字→收集）。', ''],
      ['主題代號只能填：rescue（救援）、deliver（送貨）、fish（釣魚）、read（讀字）、star（收集星星）。', ''],
      ['「本週」：每週一列，是大家的加總，程式自動寫，請不要手動改數字。', ''],
      ['改完主題表最多 1 分鐘生效；遊戲畫面的數字最多 30 秒更新一次。', '']
    ]);
    info.getRange(1, 1).setFontWeight('bold').setFontSize(14);
    info.getRange(3, 1).setFontWeight('bold');
    info.getRange(6, 2).insertCheckboxes();
    info.setColumnWidth(1, 640);
  }
  if (!ss.getRangeByName(PLAZA.PAUSE_NAME)) ss.setNamedRange(PLAZA.PAUSE_NAME, info.getRange(6, 2));

  // 主題表：表頭＋先填好輪替起點後 5 週（＝預設值，阿葉可直接改）
  var th = ss.getSheetByName(PLAZA.SHEET_THEMES);
  if (!th) {
    th = ss.insertSheet(PLAZA.SHEET_THEMES);
    th.getRange(2, 1, 300, 1).setNumberFormat('@');
    var rows = [PLAZA.THEME_HEADERS];
    for (var i = 0; i < PLAZA.ROTATION.length; i++) {
      var wk = addWeeks_(PLAZA.ROTATION_START, i);
      var t = resolveTheme_(wk, null);
      rows.push([wk, t.key, t.title, t.unit, t.goals[0], t.goals[1], t.goals[2], t.desc]);
    }
    th.getRange(1, 1, rows.length, PLAZA.THEME_HEADERS.length).setValues(rows);
    th.getRange(1, 1, 1, PLAZA.THEME_HEADERS.length).setFontWeight('bold');
    th.setFrozenRows(1);
  }

  // 本週：每週一列的加總
  var rs = ss.getSheetByName(PLAZA.SHEET_ROWS);
  if (!rs) {
    rs = ss.insertSheet(PLAZA.SHEET_ROWS);
    rs.getRange(1, 1, 1, PLAZA.ROW_HEADERS.length).setValues([PLAZA.ROW_HEADERS]).setFontWeight('bold');
    rs.getRange(2, 1, 1000, 1).setNumberFormat('@');
    rs.getRange(2, 13, 1000, 1).setNumberFormat('@');
    rs.setFrozenRows(1);
  }
  return { info: info, themes: th, rows: rs, tops: ensureTopsSheet_(ss) };
}

/**
 * 「陀螺榜」分頁：沒有才建立（已存在就完全不動，不會清掉資料）。
 *   第 1 列 說明；第 2 列 A2＝「自動公開」勾選格（命名範圍 TOPS_AUTO，預設不勾）；第 3 列 審核清單；
 *   第 4 列 表頭（詞句、戰力、狀態、公開、首次送出日期）；第 5 列起是資料（程式整理時會依戰力重新排序）。
 * 呼叫端要拿著鎖（或在 setup 裡），避免兩個請求同時建立。
 */
function ensureTopsSheet_(ss) {
  var sh = ss.getSheetByName(PLAZA.SHEET_TOPS);
  if (sh) return sh;
  sh = ss.insertSheet(PLAZA.SHEET_TOPS);
  sh.getRange(1, 1, 3, 2).setValues([
    [PLAZA.TOPS_NOTE, ''],
    [false, PLAZA.TOPS_AUTO_LABEL],
    [PLAZA.TOPS_CHECK, '']
  ]);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  sh.getRange(2, 1).insertCheckboxes();
  ss.setNamedRange(PLAZA.TOPS_AUTO_NAME, sh.getRange(2, 1));
  var n = PLAZA.TOPS_COLS.length;
  sh.getRange(4, 1, 1, n).setValues([PLAZA.TOPS_COLS]).setFontWeight('bold');
  sh.getRange(PLAZA.TOPS_FIRST_ROW, 1, 300, 1).setNumberFormat('@');
  sh.getRange(PLAZA.TOPS_FIRST_ROW, 3, 300, 1).setNumberFormat('@');
  sh.getRange(PLAZA.TOPS_FIRST_ROW, 5, 300, 1).setNumberFormat('@');
  sh.setFrozenRows(4);
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(5, 120);
  return sh;
}

/** 「自動公開」有沒有打勾（找不到格子＝沒勾＝要審核） */
function readTopsAuto_(ss) {
  var r = ss.getRangeByName(PLAZA.TOPS_AUTO_NAME);
  if (!r) return false;
  var v = r.getValue();
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

/** 陀螺榜資料區：找表頭（A 欄寫「詞句」那一列，前 30 列內），回 { first: 資料第一列, vals: 資料區每列 A–E 原始值 } */
function readTopsBlock_(sh) {
  var last = sh.getLastRow();
  if (last < 1) return { first: PLAZA.TOPS_FIRST_ROW, vals: [] };
  var n = PLAZA.TOPS_COLS.length;
  var all = sh.getRange(1, 1, last, n).getValues();
  var h = -1;
  for (var i = 0; i < all.length && i < 30; i++) if (String(all[i][0]).trim() === PLAZA.TOPS_COLS[0]) { h = i; break; }
  var first = h >= 0 ? h + 2 : PLAZA.TOPS_FIRST_ROW;
  return { first: first, vals: all.slice(first - 1) };
}

function topsCalc_(D) {
  return {
    power: function (p) { return topsPowerOf(p, D).total; },
    issue: function (p) { return topsPhraseIssue(p, D); }
  };
}

/** 資料區有變才寫回（依戰力排好、壓成連續的列；多出來的舊列清掉）。回 true＝有寫 */
function writeTopsIfChanged_(sh, blk, rows) {
  var vals = rows.map(topsRowToValues_);
  var old = blk.vals.map(function (v) { return [v[0], v[1], v[2], v[3] === true, v[4]]; });
  if (JSON.stringify(vals) === JSON.stringify(old)) return false;
  var first = blk.first, n = vals.length, m = blk.vals.length;
  if (n) {
    sh.getRange(first, 1, n, 1).setNumberFormat('@');
    sh.getRange(first, 3, n, 1).setNumberFormat('@');
    sh.getRange(first, 5, n, 1).setNumberFormat('@');
    sh.getRange(first, 1, n, PLAZA.TOPS_COLS.length).setValues(vals);
    // 勾選框用資料驗證加（insertCheckboxes 會把值全部重設成沒勾，不能用在已有資料的格子）
    sh.getRange(first, 4, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  }
  if (m > n) {
    sh.getRange(first + n, 4, m - n, 1).clearDataValidations();
    sh.getRange(first + n, 1, m - n, PLAZA.TOPS_COLS.length).clearContent();
  }
  return true;
}

/** 陀螺榜送出（doPost 的 k:"top"）。回要給前端的物件 */
function postTop_(obj, now) {
  var D = topsDict();
  var v = validateTop_(obj, D);
  if (!v.ok) return v;
  var power = topsPowerOf(v.p, D).total;

  var cache = CacheService.getScriptCache();
  var rk = 'rl1:' + Math.floor(now / 60000);
  if (toInt_(cache.get(rk)) >= PLAZA.RATE_LIMIT_PER_MIN) return { ok: false, why: 'rate' };
  var ss = getSS_();
  if (readPaused_(ss)) return { ok: false, why: 'paused' };
  var fmt = makeDateFmt_(ss);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(PLAZA.LOCK_WAIT_MS)) return { ok: false, why: 'busy' };
  var res;
  try {
    var cnt = toInt_(cache.get(rk));
    if (cnt >= PLAZA.RATE_LIMIT_PER_MIN) return { ok: false, why: 'rate' };
    cache.put(rk, String(cnt + 1), 120);
    var sh = ensureTopsSheet_(ss);
    var today = taipeiYmd_(now);
    var blk = readTopsBlock_(sh);
    var rows = [];
    for (var i = 0; i < blk.vals.length; i++) rows.push(topsRowFromValues_(blk.vals[i], fmt, today));
    res = topsSubmit_(topsPrep_(rows, today, topsCalc_(D), true), v.p, power, readTopsAuto_(ss), today);
    writeTopsIfChanged_(sh, blk, res.rows);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  if (res.added && res.status === 'public') cache.remove('get2:' + weekKeyOf_(now)); // 自動公開：馬上看得到
  return { ok: true, power: power, status: res.status };
}

/** doGet 用：公開的前 5 名 [{p, power}]（戰力用目前公式重算）。分頁不存在就建立（拿得到鎖才建） */
function readPublicTops_(ss, fmt, now) {
  var sh = ss.getSheetByName(PLAZA.SHEET_TOPS);
  if (!sh) {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(3000)) {
      try { ensureTopsSheet_(ss); } finally { lock.releaseLock(); }
    }
    return [];
  }
  var today = taipeiYmd_(now);
  var blk = readTopsBlock_(sh);
  var pub = [];
  for (var i = 0; i < blk.vals.length; i++) {
    var r = topsRowFromValues_(blk.vals[i], fmt, today);
    if (r && r.st === 'pub') pub.push(r);
  }
  if (!pub.length) return [];
  return topsPublicTop_(topsPrep_(pub, today, topsCalc_(topsDict()), false), PLAZA.TOPS_SHOW);
}

/**
 * 阿葉在「陀螺榜」勾／取消「公開」或改「狀態」時，讓兩欄一致（簡單觸發器：不需要另外授權，只碰這張試算表）。
 *   勾公開 → 狀態變「公開」；取消勾 → 狀態變「不公開」。
 *   狀態改成「公開」→ 自動打勾；改成「不公開」或「待審核」→ 取消勾。
 * 上不上榜只看「公開」有沒有勾；這裡只是讓表格看起來一致。出錯就算了（下次有人送出時程式也會整理）。
 */
function onEdit(e) {
  try {
    var rg = e && e.range;
    if (!rg) return;
    var sh = rg.getSheet();
    if (sh.getName() !== PLAZA.SHEET_TOPS) return;
    var c0 = rg.getColumn(), c1 = c0 + rg.getNumColumns() - 1;
    var hitC = c0 <= 3 && c1 >= 3, hitD = c0 <= 4 && c1 >= 4;
    if (hitC === hitD) return; // 兩欄都沒碰，或兩欄一起改（貼上整列）→ 不動
    var first = readTopsBlock_(sh).first;
    var r0 = Math.max(rg.getRow(), first), r1 = rg.getRow() + rg.getNumRows() - 1;
    if (r1 < r0) return;
    var vals = sh.getRange(r0, 1, r1 - r0 + 1, 4).getValues();
    var out = [], changed = false, ST = PLAZA.TOPS_ST;
    for (var i = 0; i < vals.length; i++) {
      var p = String(vals[i][0] == null ? '' : vals[i][0]).trim();
      var txt = String(vals[i][2] == null ? '' : vals[i][2]).trim(), box = vals[i][3];
      var nt = vals[i][2], nb = box;
      if (p && hitD && typeof box === 'boolean') nt = box ? ST.pub : ST.hidden;
      if (p && hitC) {
        if (txt === ST.pub) nb = true;
        else if (txt === ST.hidden || txt === ST.pending) nb = false;
      }
      if (nt !== vals[i][2] || nb !== box) changed = true;
      out.push([nt, nb]);
    }
    if (changed) sh.getRange(r0, 3, out.length, 2).setValues(out);
  } catch (err) {
    return;
  }
}

/** 綁定的試算表。網頁應用程式情境下若拿不到「目前試算表」，改用 ID 開（需要較大的授權範圍才會成功） */
function getSS_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss && PLAZA.SHEET_ID) {
    try { ss = SpreadsheetApp.openById(PLAZA.SHEET_ID); } catch (e2) { ss = null; }
  }
  if (!ss) throw new Error('no_sheet');
  return ss;
}

function makeDateFmt_(ss) {
  var tz = ss.getSpreadsheetTimeZone() || 'Asia/Taipei';
  return function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };
}

function readPaused_(ss) {
  var r = ss.getRangeByName(PLAZA.PAUSE_NAME);
  if (!r) return false;
  var v = r.getValue();
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

function readOverrides_(ss, fmt) {
  var th = ss.getSheetByName(PLAZA.SHEET_THEMES);
  if (!th) return {};
  var last = th.getLastRow();
  if (last < 2) return {};
  return parseOverrides_(th.getRange(2, 1, last - 1, 8).getValues(), fmt);
}

function readOverridesCached_(ss, fmt) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('cfg1');
  if (hit) return JSON.parse(hit);
  var ov = readOverrides_(ss, fmt);
  cache.put('cfg1', JSON.stringify(ov), PLAZA.CONFIG_CACHE_SEC);
  return ov;
}

/** 「本週」分頁全部列 → { 週key: row }（同一週重複時以下面那列為準） */
function readRows_(ss, fmt) {
  var out = {};
  var rs = ss.getSheetByName(PLAZA.SHEET_ROWS);
  if (!rs) return out;
  var last = rs.getLastRow();
  if (last < 2) return out;
  var vals = rs.getRange(2, 1, last - 1, PLAZA.ROW_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    var r = rowFromValues_(vals[i], fmt);
    if (r.w) out[r.w] = r;
  }
  return out;
}

/** 已拿到鎖時呼叫：找到該週那一列（沒有就新增）→ 遞增 → 寫回 */
function incrementRow_(ss, fmt, wk, theme, k, n, now) {
  var rs = ss.getSheetByName(PLAZA.SHEET_ROWS) || ensureSheets_(ss).rows;
  var cols = PLAZA.ROW_HEADERS.length;
  var last = rs.getLastRow();
  var rowIdx = -1;
  if (last >= 2) {
    var keys = rs.getRange(2, 1, last - 1, 1).getValues();
    for (var i = keys.length - 1; i >= 0; i--) {
      if (normalizeWeekCell_(keys[i][0], fmt) === wk) { rowIdx = i + 2; break; }
    }
  }
  var row;
  if (rowIdx < 0) {
    rowIdx = Math.max(last, 1) + 1;
    row = newRow_(wk, theme);
  } else {
    row = rowFromValues_(rs.getRange(rowIdx, 1, 1, cols).getValues()[0], fmt);
    row.w = wk;
  }
  row = applyIncrement_(row, k, n, theme, fmtTaipeiMinute_(now));
  rs.getRange(rowIdx, 1).setNumberFormat('@');
  rs.getRange(rowIdx, 13).setNumberFormat('@');
  rs.getRange(rowIdx, 1, 1, cols).setValues([rowToValues_(row)]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 錯誤只回代碼，不回訊息內容 */
function errWhy_(err) {
  var msg = String((err && err.message) || err || '');
  if (msg === 'no_sheet') return 'no_sheet';
  if (/permission|authori[sz]|權限|授權/i.test(msg)) return 'auth';
  return 'server';
}
