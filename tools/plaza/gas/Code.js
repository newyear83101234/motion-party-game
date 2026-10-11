/**
 * 注音小島「小島同樂廣場」後端（Google Apps Script 網頁應用程式，綁定試算表「注音小島同樂廣場」）
 *
 * 隱私設計（規格 docs/zhuyin-plaza-spec.md §2）：
 *   - 只收 {w 週次, k 種類, n 數量} 三個欄位，多一個欄位就拒收。
 *   - 只存「每週全島加總」；不存裝置 ID、token、暱稱、個人成績、IP（Apps Script 的 e 物件本來就沒有 IP）。
 *   - 不寫任何 log（沒有 console / Logger），試算表的時間只有每週一列的「最後更新（到分鐘）」。
 *
 * 結構：
 *   1. 設定 PLAZA
 *   2. 純邏輯（不碰 Apps Script 全域物件，tools/plaza/test-core.mjs 用 node 直接測）
 *   3. Apps Script 層（doGet / doPost / setup 與試算表讀寫）
 *
 * 函式名結尾有底線 _ 的是內部函式（Apps Script 不會讓外部呼叫，也不會出現在「執行」選單）。
 */

// ───────────────────────────── 1. 設定 ─────────────────────────────

var PLAZA = {
  TZ_OFFSET_MS: 8 * 3600 * 1000,   // 台北時間 UTC+8（台灣沒有日光節約時間）
  DAY_MS: 86400000,
  ROTATION_START: '2026-10-12',    // 主題輪替從這週（週一）開始；上週結果也只回這週以後的
  GRACE_MS: 10 * 60 * 1000,        // 換週後 10 分鐘內，仍接受「上一週」的送出（跨週邊界不掉資料）
  RATE_LIMIT_PER_MIN: 1500,        // 全站每分鐘最多接受幾次送出（全域保險絲，不分來源）
  GET_CACHE_SEC: 30,               // doGet 回應快取秒數
  CONFIG_CACHE_SEC: 60,            // 主題表快取秒數（doPost 用）
  MAX_BODY: 200,                   // 送出內容最長字元數
  LOCK_WAIT_MS: 8000,              // 等鎖最久幾毫秒，等不到回 busy（前端下次再送）
  SHEET_ID: '1NEctJcl4y_zvyFQ5l0GbMYc_GZTrDRmoK2B8LR7SZkw', // 綁定試算表 ID（不是秘密；只在拿不到「目前試算表」時備用）
  SHEET_ROWS: '本週',
  SHEET_THEMES: '主題表',
  SHEET_INFO: '說明',
  PAUSE_NAME: 'PAUSE',             // 暫停儲存格的「命名範圍」名稱
  N_MAX: { goal: 30, play: 10, cheer1: 3, cheer2: 3, cheer3: 3, cheer4: 3 },
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
  THEME_HEADERS: ['週次（週一日期）', '主題代號', '標題（可空）', '單位（可空）', '銅', '銀', '金', '說明（可空）']
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
  var s = null;
  if (isDateObj_(v)) s = dateFmt ? dateFmt(v) : null;
  else if (typeof v === 'string' || typeof v === 'number') s = String(v).trim();
  if (!s) return null;
  var m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s);
  if (!m) return null;
  var ymd = m[1] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[3]);
  if (ymdFromUtcMs_(ymdToUtcMs_(ymd)) !== ymd) return null; // 2026-02-30 之類
  return weekKeyOf_(weekStartMs_(ymd));
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
 * 回 {ok:true, w, k, n} 或 {ok:false, why}
 * 週次規則：w 必須是伺服器算出的「本週」；換週後 GRACE_MS（10 分鐘）內也接受「上一週」。
 */
function validatePost_(raw, nowMs) {
  var bad = function (why) { return { ok: false, why: why }; };
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > PLAZA.MAX_BODY) return bad('bad_body');
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return bad('bad_json'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return bad('bad_body');
  var keys = Object.keys(obj);
  if (keys.length !== 3 || keys.indexOf('w') < 0 || keys.indexOf('k') < 0 || keys.indexOf('n') < 0) return bad('bad_body');
  var k = obj.k, n = obj.n, w = obj.w;
  if (typeof k !== 'string' || !Object.prototype.hasOwnProperty.call(PLAZA.N_MAX, k)) return bad('bad_kind');
  if (typeof n !== 'number' || !isFinite(n) || Math.floor(n) !== n || n < 1 || n > PLAZA.N_MAX[k]) return bad('bad_n');
  if (!isWeekKey_(w)) return bad('bad_week');
  var cur = weekKeyOf_(nowMs);
  if (w !== cur) {
    var inGrace = w === addWeeks_(cur, -1) && (nowMs - weekStartMs_(cur)) < PLAZA.GRACE_MS;
    if (!inGrace) return bad('bad_week');
  }
  return { ok: true, w: w, k: k, n: n };
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
function buildGetPayload_(cur, curTheme, curRow, prevW, prevTheme, prevRow, paused) {
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
    now: 0
  };
}

function nowMs_() { return Date.now(); }

// ───────────────────────────── 3. Apps Script 層 ─────────────────────────────

/**
 * 讀取：GET 網頁應用程式網址
 * 回 {ok, w, theme:{key,title,unit,desc,goals:[銅,銀,金]}, total, reached, plays, cheers:[4], prev:{w,theme,total,reached}|null, paused, now}
 */
function doGet(e) {
  try {
    var now = nowMs_();
    var cur = weekKeyOf_(now);
    var cache = CacheService.getScriptCache();
    var ck = 'get1:' + cur;
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
      payload = buildGetPayload_(cur, resolveTheme_(cur, ov), rows[cur] || null,
        prevW, resolveTheme_(prevW, ov), rows[prevW] || null, readPaused_(ss));
      cache.put(ck, JSON.stringify(payload), PLAZA.GET_CACHE_SEC);
    }
    payload.now = now;
    return json_(payload);
  } catch (err) {
    return json_({ ok: false, why: errWhy_(err) });
  }
}

/**
 * 送出：POST（Content-Type: text/plain，內容是 JSON {w, k, n}）
 * 回 {ok:true} 或 {ok:false, why}
 * why：bad_body / bad_json / bad_kind / bad_n / bad_week / paused / rate / busy / no_sheet / server
 */
function doPost(e) {
  try {
    var now = nowMs_();
    var raw = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
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
      var cnt = toInt_(cache.get(rk));
      if (cnt >= PLAZA.RATE_LIMIT_PER_MIN) return json_({ ok: false, why: 'rate' });
      cache.put(rk, String(cnt + 1), 120);
      incrementRow_(ss, fmt, v.w, theme, v.k, v.n, now);
      SpreadsheetApp.flush();
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
  return { info: info, themes: th, rows: rs };
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
