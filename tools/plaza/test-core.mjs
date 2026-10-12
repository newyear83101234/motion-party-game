// 小島同樂廣場後端本機測試：node tools/plaza/test-core.mjs
// 用 vm 載入 gas/Code.js，自備 SpreadsheetApp / LockService / CacheService / ContentService / Utilities 假物件。
// 陀螺榜（k:"top"）的測試在 T 段：同一份戰力公式要跟前端 js/zhuyin-tops-power.js 算出一樣的數字。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const SRC = fs.readFileSync(path.join(here, 'gas', 'Code.js'), 'utf8');
const SRC_POWER = fs.readFileSync(path.join(here, 'gas', 'TopsPower.gs'), 'utf8');
const SRC_DICT = fs.readFileSync(path.join(here, 'gas', 'TopsDict.gs'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(here, 'gas', 'appsscript.json'), 'utf8'));
// 前端那一份（瀏覽器真的載入的檔）
const TPF = await import(pathToFileURL(path.join(ROOT, 'js', 'zhuyin-tops-power.js')).href);
const DF = TPF.decodeDict(JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'zhuyin-tops-dict.json'), 'utf8')));
const powerF = (p) => TPF.powerOf(p, DF).total;

// ───────── 迷你測試框架 ─────────
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b }); }
// 每段測試獨立：中途丟例外算一個 FAIL，後面的段落照跑
function section(fn) {
  try { fn(); } catch (e) { ok(false, '段落中途丟出例外：' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e)); }
}

// 台北時間 → 毫秒
const tpe = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h - 8, mi, s);

// ───────── 假的 Apps Script 環境 ─────────
function makeEnv(opts = {}) {
  const clock = { now: tpe(2026, 10, 14, 12, 0, 0) };
  const hooks = { afterGetValues: null, beforeSetValues: null };

  function makeSheet(name) {
    return {
      name, cells: [], valid: {},
      getName() { return this.name; },
      setName(n) { this.name = n; return this; },
      getLastRow() {
        for (let r = this.cells.length - 1; r >= 0; r--) {
          const row = this.cells[r] || [];
          if (row.some(v => v !== '' && v !== null && v !== undefined)) return r + 1;
        }
        return 0;
      },
      getRange(r, c, nr = 1, nc = 1) { return makeRange(this, r, c, nr, nc); },
      setFrozenRows() { return this; },
      setColumnWidth() { return this; }
    };
  }
  function makeRange(sheet, r, c, nr, nc) {
    if (!(r >= 1 && c >= 1 && nr >= 1 && nc >= 1)) throw new Error(`bad range ${r},${c},${nr},${nc}`);
    const rng = {
      sheet, r, c, nr, nc,
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = sheet.cells[r - 1 + i] || [];
          const o = [];
          for (let j = 0; j < nc; j++) { const v = row[c - 1 + j]; o.push(v === undefined ? '' : v); }
          out.push(o);
        }
        if (hooks.afterGetValues) hooks.afterGetValues(sheet, r, c, nr, nc);
        return out;
      },
      setValues(vals) {
        if (hooks.beforeSetValues) hooks.beforeSetValues(sheet, r, c, nr, nc);
        if (vals.length !== nr || vals.some(x => x.length !== nc)) throw new Error('setValues 尺寸不符');
        for (let i = 0; i < nr; i++) {
          sheet.cells[r - 1 + i] = sheet.cells[r - 1 + i] || [];
          for (let j = 0; j < nc; j++) sheet.cells[r - 1 + i][c - 1 + j] = vals[i][j];
        }
        return rng;
      },
      getValue() { return rng.getValues()[0][0]; },
      setValue(v) { return rng.setValues([[v]]); },
      setNumberFormat() { return rng; },
      setFontWeight() { return rng; },
      setFontSize() { return rng; },
      getRow() { return r; }, getColumn() { return c; }, getNumRows() { return nr; }, getNumColumns() { return nc; },
      getSheet() { return sheet; },
      // 跟 Google 文件一樣：insertCheckboxes 會把範圍內的值全部設成 false
      insertCheckboxes() {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
          sheet.cells[r - 1 + i] = sheet.cells[r - 1 + i] || [];
          sheet.cells[r - 1 + i][c - 1 + j] = false;
          sheet.valid[`${r + i},${c + j}`] = 'checkbox';
        }
        return rng;
      },
      setDataValidation(rule) {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sheet.valid[`${r + i},${c + j}`] = rule.type;
        return rng;
      },
      clearDataValidations() {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) delete sheet.valid[`${r + i},${c + j}`];
        return rng;
      },
      clearContent() {
        if (hooks.beforeSetValues) hooks.beforeSetValues(sheet, r, c, nr, nc);
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
          if (sheet.cells[r - 1 + i]) sheet.cells[r - 1 + i][c - 1 + j] = '';
        }
        return rng;
      }
    };
    return rng;
  }

  const ss = {
    sheets: [makeSheet('工作表1')], named: {}, tz: opts.tz || 'America/New_York',
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; },
    getSheets() { return this.sheets.slice(); },
    insertSheet(n) { const s = makeSheet(n); this.sheets.push(s); return s; },
    getRangeByName(n) { const x = this.named[n]; return x ? makeRange(x.sheet, x.r, x.c, 1, 1) : null; },
    setNamedRange(n, range) { this.named[n] = { sheet: range.sheet, r: range.r, c: range.c }; },
    setSpreadsheetTimeZone(tz) { this.tz = tz; },
    getSpreadsheetTimeZone() { return this.tz; }
  };

  const lockState = { mode: opts.lockMode || 'real', held: false, acquired: 0, released: 0 };
  const store = new Map();
  const ctxObj = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (opts.noActive ? null : ss),
      openById: () => { throw new Error('You do not have permission to call SpreadsheetApp.openById'); },
      flush: () => {},
      newDataValidation: () => { const b = { t: null, requireCheckbox() { b.t = 'checkbox'; return b; }, build() { if (!b.t) throw new Error('沒設規則'); return { type: b.t }; } }; return b; }
    },
    LockService: {
      getScriptLock: () => ({
        tryLock() {
          if (lockState.mode === 'noop') { lockState.acquired++; return true; }
          if (lockState.held) return false;
          lockState.held = true; lockState.acquired++; return true;
        },
        releaseLock() { lockState.held = false; lockState.released++; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get(k) { const e = store.get(k); if (!e || e.exp <= clock.now) return null; return e.v; },
        put(k, v, ttl) { if (typeof v !== 'string') throw new Error('cache 只收字串'); store.set(k, { v, exp: clock.now + ttl * 1000 }); },
        remove(k) { store.delete(k); }
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ s, mime: null, setMimeType(m) { this.mime = m; return this; }, getContent() { return this.s; } })
    },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        if (fmt !== 'yyyy-MM-dd') throw new Error('stub 只支援 yyyy-MM-dd');
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      }
    }
  };
  const ctx = vm.createContext(ctxObj);
  // 跟 Apps Script 一樣：同一個專案的所有檔案共用一個全域
  vm.runInContext(SRC_POWER, ctx, { filename: 'TopsPower.gs' });
  vm.runInContext(SRC_DICT, ctx, { filename: 'TopsDict.gs' });
  vm.runInContext(SRC, ctx, { filename: 'Code.js' });
  ctx.nowMs_ = () => clock.now;

  const post = (body) => {
    const contents = typeof body === 'string' ? body : JSON.stringify(body);
    const out = ctx.doPost(body === undefined ? {} : { postData: { contents, type: 'text/plain' } });
    return JSON.parse(out.getContent());
  };
  const get = () => {
    const out = ctx.doGet({ parameter: {} });
    ok(out.mime === 'application/json', 'doGet 回應型別是 JSON');
    return JSON.parse(out.getContent());
  };
  const rowsSheet = () => ss.getSheetByName('本週');
  const findRow = (wk) => (rowsSheet() ? rowsSheet().cells.find(r => r && r[0] === wk) : null);
  // 陀螺榜：第 5 列起的資料（只取 A–E、詞句不空的列）
  const topsSheet = () => ss.getSheetByName('陀螺榜');
  const topsData = () => (topsSheet() ? topsSheet().cells.slice(4).filter(r => r && r[0] !== '' && r[0] != null).map(r => r.slice(0, 5)) : []);
  const putTops = (rows) => { const s = topsSheet(); rows.forEach((row, i) => { s.cells[4 + i] = row.slice(); }); };
  const top = (p) => post({ k: 'top', p });
  return { ctx, ss, clock, hooks, lockState, store, post, get, rowsSheet, findRow, topsSheet, topsData, putTops, top };
}

// ═════════ A. 週次計算 ═════════
section(() => {
  const { ctx } = makeEnv();
  eq(ctx.weekKeyOf_(Date.UTC(2026, 9, 11, 15, 59, 59)), '2026-10-05', 'A1 UTC 週日 15:59:59（台北週日 23:59:59）仍屬上週');
  eq(ctx.weekKeyOf_(Date.UTC(2026, 9, 11, 16, 0, 0)), '2026-10-12', 'A2 UTC 週日 16:00（台北週一 00:00）換週');
  eq(ctx.weekKeyOf_(tpe(2026, 10, 12, 0, 0, 1)), '2026-10-12', 'A3 台北週一 00:00:01');
  eq(ctx.weekKeyOf_(tpe(2026, 10, 18, 23, 59, 59)), '2026-10-12', 'A4 台北週日 23:59:59 還是同一週');
  eq(ctx.weekKeyOf_(Date.UTC(2026, 9, 18, 10, 0, 0)), '2026-10-12', 'A5 UTC 週日 10:00（台北週日 18:00）');
  eq(ctx.weekKeyOf_(Date.UTC(2026, 9, 12, 0, 0, 0)), '2026-10-12', 'A6 UTC 週一 00:00（台北週一 08:00）');
  eq(ctx.weekKeyOf_(Date.UTC(2027, 0, 3, 15, 59, 59)), '2026-12-28', 'A7 跨年：台北 2027-01-03 週日 23:59:59');
  eq(ctx.weekKeyOf_(Date.UTC(2027, 0, 3, 16, 0, 0)), '2027-01-04', 'A8 跨年：台北 2027-01-04 週一 00:00');
  eq(ctx.weekStartMs_('2026-10-12'), Date.UTC(2026, 9, 11, 16, 0, 0), 'A9 週起點＝UTC 週日 16:00');
  eq(ctx.addWeeks_('2026-12-28', 1), '2027-01-04', 'A10 addWeeks 跨年');
  eq(ctx.addWeeks_('2026-03-02', -1), '2026-02-23', 'A11 addWeeks 往回');
  eq(ctx.isWeekKey_('2026-10-12'), true, 'A12 合法週 key');
  for (const bad of ['2026-10-13', '2026-02-30', '2026-1-12', 'x', 20261012, '2026-10-12 ', '', null]) {
    eq(ctx.isWeekKey_(bad), false, 'A13 不合法週 key：' + JSON.stringify(bad));
  }
  // 窮舉：2026-01-01 ～ 2028-12-31 每小時，週 key 一定是週一、且時間落在 [週起點, 週起點+7天)
  let okAll = true, firstBad = null;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 3600 * 1000 + 7 * 60 * 1000) {
    const k = ctx.weekKeyOf_(t);
    const s = ctx.weekStartMs_(k);
    if (!ctx.isWeekKey_(k) || !(s <= t && t < s + 7 * 86400000)) { okAll = false; firstBad = { t, k }; break; }
  }
  ok(okAll, 'A14 窮舉三年（每 67 分鐘取樣）週次都正確', firstBad);
});

// ═════════ B. 主題輪替與覆寫 ═════════
section(() => {
  const { ctx } = makeEnv();
  const want = [['2026-10-12', 'rescue', [50, 150, 300]], ['2026-10-19', 'deliver', [40, 120, 240]],
    ['2026-10-26', 'fish', [60, 180, 360]], ['2026-11-02', 'read', [150, 450, 900]],
    ['2026-11-09', 'star', [100, 300, 600]], ['2026-11-16', 'rescue', [50, 150, 300]], ['2026-10-05', 'star', [100, 300, 600]]];
  for (const [wk, key, goals] of want) {
    const t = ctx.resolveTheme_(wk, null);
    eq([t.key, t.goals], [key, goals], `B1 輪替 ${wk} → ${key}`);
  }
  eq(ctx.resolveTheme_('2026-10-12', null).title, '救援週', 'B2 中文標題');
  eq(ctx.resolveTheme_('2026-10-19', null).unit, '件', 'B3 單位');

  const fmtTpe = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const ov = ctx.parseOverrides_([
    ['2026-10-19', 'fish', '', '', 10, 20, 30, ''],
    [new Date(Date.UTC(2026, 9, 25, 16)), 'read', '特別讀字週', '', '', '', '', ''],   // 日期物件（台北 10-26 00:00）
    ['2026/11/04', 'star', '', '顆星', 30, 20, 10, ''],                              // 週三 → 歸到 11-02；目標由大到小＝無效
    ['2026-11-09', 'pizza', '亂填', '', 5, 6, 7, ''],                                  // 主題代號亂填 → 用輪替
    ['abc', 'fish', '', '', 1, 2, 3, ''],                                              // 週次看不懂 → 略過
    ['', '', '', '', '', '', '', ''],
    ['2026-11-16', 'deliver', '', '', 1.5, 2, 3, '']                                   // 小數目標 → 無效
  ], fmtTpe);
  const t1 = ctx.resolveTheme_('2026-10-19', ov);
  eq([t1.key, t1.title, t1.unit, t1.goals], ['fish', '釣魚週', '條', [10, 20, 30]], 'B4 覆寫主題＋目標，標題單位用該主題預設');
  const t2 = ctx.resolveTheme_('2026-10-26', ov);
  eq([t2.key, t2.title, t2.goals], ['read', '特別讀字週', [150, 450, 900]], 'B5 日期物件週次＋自訂標題，目標空白用預設');
  const t3 = ctx.resolveTheme_('2026-11-02', ov);
  eq([t3.key, t3.unit, t3.goals], ['star', '顆星', [100, 300, 600]], 'B6 非週一日期歸到週一；目標無效用預設');
  const t4 = ctx.resolveTheme_('2026-11-09', ov);
  eq([t4.key, t4.title, t4.goals], ['star', '亂填', [5, 6, 7]], 'B7 主題代號無效 → 用輪替主題，其他欄照覆寫');
  eq(Object.keys(ov).sort(), ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'], 'B8 看不懂的週次與空白列略過');
  eq(ctx.resolveTheme_('2026-11-16', ov).goals, [40, 120, 240], 'B9 小數目標 → 用預設');
  const ov2 = ctx.parseOverrides_([['2026-10-12', 'fish', '', '', '', '', '', ''], ['2026-10-12', 'read', '', '', '', '', '', '']], fmtTpe);
  eq(ctx.resolveTheme_('2026-10-12', ov2).key, 'read', 'B10 同週兩列 → 下面那列為準');
});

// ═════════ C. 送出驗證 ═════════
section(() => {
  const { ctx } = makeEnv();
  const now = tpe(2026, 10, 14, 12, 0, 0); // 週三，本週 2026-10-12
  const v = (o) => ctx.validatePost_(typeof o === 'string' ? o : JSON.stringify(o), now);
  const W = '2026-10-12';
  for (const [k, n] of [['goal', 1], ['goal', 10], ['play', 1], ['play', 10], ['cheer1', 3], ['cheer4', 1]]) {
    eq(v({ w: W, k, n }), { ok: true, w: W, k, n }, `C1 接受 ${k}=${n}`);
  }
  const rej = [
    [{ w: W, k: 'goal', n: 0 }, 'bad_n'], [{ w: W, k: 'goal', n: 11 }, 'bad_n'], [{ w: W, k: 'goal', n: 30 }, 'bad_n'], [{ w: W, k: 'goal', n: 999 }, 'bad_n'],
    [{ w: W, k: 'goal', n: 1.5 }, 'bad_n'], [{ w: W, k: 'goal', n: '3' }, 'bad_n'], [{ w: W, k: 'goal', n: -1 }, 'bad_n'],
    [{ w: W, k: 'goal', n: null }, 'bad_n'], [{ w: W, k: 'play', n: 11 }, 'bad_n'], [{ w: W, k: 'cheer2', n: 4 }, 'bad_n'],
    [{ w: W, k: 'cheer5', n: 1 }, 'bad_kind'], [{ w: W, k: 'Goal', n: 1 }, 'bad_kind'], [{ w: W, k: 'toString', n: 1 }, 'bad_kind'],
    [{ w: W, k: '__proto__', n: 1 }, 'bad_kind'], [{ w: W, k: 1, n: 1 }, 'bad_kind'],
    [{ w: W, k: 'goal' }, 'bad_body'], [{ w: W, k: 'goal', n: 1, id: 'abc' }, 'bad_body'], [[W, 'goal', 1], 'bad_body'],
    ['null', 'bad_body'], ['"goal"', 'bad_body'], ['w=1&k=goal', 'bad_json'], ['', 'bad_body'],
    [JSON.stringify({ w: W, k: 'goal', n: 1 }) + ' '.repeat(200), 'bad_body'],
    [{ w: '2026-10-19', k: 'goal', n: 1 }, 'bad_week'], [{ w: '2026-10-05', k: 'goal', n: 1 }, 'bad_week'],
    [{ w: '2026-10-13', k: 'goal', n: 1 }, 'bad_week'], [{ w: '2026/10/12', k: 'goal', n: 1 }, 'bad_week'],
    [{ w: '', k: 'goal', n: 1 }, 'bad_week'], [{ w: 20261012, k: 'goal', n: 1 }, 'bad_week']
  ];
  for (const [body, why] of rej) eq(v(body).why, why, `C2 拒收 ${typeof body === 'string' ? body.slice(0, 40) : JSON.stringify(body)} → ${why}`);
  eq(ctx.validatePost_(undefined, now).why, 'bad_body', 'C3 沒有內容');
  // 選填 i（這一筆送出的隨機代號，6–16 碼小寫英數）
  eq(v({ w: W, k: 'goal', n: 2, i: 'a1b2c3' }), { ok: true, w: W, k: 'goal', n: 2, i: 'a1b2c3' }, 'C3a 帶 i（6 碼）→ 收、回傳 i');
  eq(v({ i: 'abcdefghij0123456'.slice(0, 16), w: W, k: 'play', n: 1 }).ok, true, 'C3b i 16 碼、欄位順序不同也收');
  for (const [i, tag] of [['a1b2c', '5 碼'], ['abcdefghij0123456', '17 碼'], ['ABC123', '大寫'], ['abc-12', '有符號'], [123456, '數字'], ['', '空字串'], [null, 'null']]) {
    eq(v({ w: W, k: 'goal', n: 1, i }).why, 'bad_body', `C3c i ${tag} → bad_body`);
  }
  eq(v({ w: W, k: 'goal', n: 1, i: 'abc123', x: 1 }).why, 'bad_body', 'C3d 帶 i 又多一欄 → bad_body');
  eq(v({ w: W, k: 'goal', i: 'abc123', x: 1 }).why, 'bad_body', 'C3e 四欄但少了 n → bad_body');
  // 換週寬限
  const mon = (mi, s = 0) => tpe(2026, 10, 19, 0, mi, s);
  eq(ctx.validatePost_(JSON.stringify({ w: '2026-10-12', k: 'goal', n: 2 }), mon(9, 59)).ok, true, 'C4 換週 9:59 內仍收上一週');
  eq(ctx.validatePost_(JSON.stringify({ w: '2026-10-19', k: 'goal', n: 2 }), mon(9, 59)).ok, true, 'C5 換週後本週照收');
  eq(ctx.validatePost_(JSON.stringify({ w: '2026-10-12', k: 'goal', n: 2 }), mon(10, 0)).why, 'bad_week', 'C6 換週滿 10 分鐘不收上一週');
  eq(ctx.validatePost_(JSON.stringify({ w: '2026-10-05', k: 'goal', n: 2 }), mon(1, 0)).why, 'bad_week', 'C7 寬限期內也不收兩週前');
  eq(ctx.validatePost_(JSON.stringify({ w: '2026-10-19', k: 'goal', n: 2 }), tpe(2026, 10, 18, 23, 59, 0)).why, 'bad_week', 'C8 還沒換週不收下一週');
});

// ═════════ D. setup 與 doGet / doPost 整合 ═════════
section(() => {
  const E = makeEnv();
  const msg = E.ctx.setup();
  eq(E.ss.getSheets().map(s => s.name), ['說明', '主題表', '本週', '陀螺榜'], 'D1 setup 建好四個分頁（預設工作表改名為說明）');
  ok(String(msg).includes('就緒'), 'D2 setup 回傳訊息');
  eq(E.ss.tz, 'Asia/Taipei', 'D3 試算表時區設成台北');
  ok(!!E.ss.getRangeByName('PAUSE'), 'D4 有暫停儲存格（命名範圍 PAUSE）');
  eq(E.ss.getRangeByName('PAUSE').getValue(), false, 'D5 暫停預設沒打勾');
  ok(E.ss.getSheetByName('說明').cells.flat().some(v => String(v).includes('這張表只存全島加總數字，不含任何個人資料')), 'D6 說明文字');
  eq(E.ss.getSheetByName('主題表').getLastRow(), 6, 'D7 主題表＝表頭＋5 週');
  eq(E.ss.getSheetByName('主題表').cells[1].slice(0, 7), ['2026-10-12', 'rescue', '救援週', '隻', 50, 150, 300], 'D8 主題表第一週內容');
  eq(E.rowsSheet().getLastRow(), 1, 'D9 本週分頁只有表頭');
  E.ctx.setup();
  eq([E.ss.getSheets().length, E.ss.getSheetByName('主題表').getLastRow()], [4, 6], 'D10 setup 重跑不重複建立');

  // doGet 初始格式
  const g0 = E.get();
  eq(Object.keys(g0), ['ok', 'w', 'theme', 'total', 'reached', 'plays', 'cheers', 'prev', 'paused', 'tops', 'now'], 'D11 doGet 欄位（多了 tops）');
  eq(Object.keys(g0.theme), ['key', 'title', 'unit', 'desc', 'goals'], 'D12 theme 欄位');
  eq([g0.ok, g0.w, g0.theme.key, g0.theme.goals, g0.total, g0.plays, g0.cheers, g0.prev, g0.paused, g0.tops, g0.now],
    [true, '2026-10-12', 'rescue', [50, 150, 300], 0, 0, [0, 0, 0, 0], null, false, [], E.clock.now], 'D13 doGet 初始值（上週早於輪替起點 → prev=null；陀螺榜空）');

  // 送出 → 快取 30 秒 → 更新
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 3 }), { ok: true }, 'D14 doPost goal 3');
  eq(E.post({ w: '2026-10-12', k: 'play', n: 1 }), { ok: true }, 'D15 doPost play 1');
  eq(E.post({ w: '2026-10-12', k: 'cheer2', n: 2 }), { ok: true }, 'D16 doPost cheer2 2');
  E.clock.now += 10 * 1000;
  const g1 = E.get();
  eq([g1.total, g1.now], [0, E.clock.now], 'D17 30 秒內讀到快取（舊數字），now 仍是現在');
  E.clock.now += 21 * 1000;
  const g2 = E.get();
  eq([g2.total, g2.plays, g2.cheers], [3, 1, [0, 2, 0, 0]], 'D18 快取過期後 total +3、plays、cheers 正確');
  eq(E.findRow('2026-10-12'), ['2026-10-12', 'rescue', '救援週', 3, 50, 150, 300, 1, 0, 2, 0, 0, '2026-10-14 12:00'], 'D19 試算表那一列內容（時間只到分鐘）');

  // 越界被拒、不動資料
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 999 }), { ok: false, why: 'bad_n' }, 'D20 n=999 被拒');
  eq(E.post({ w: '2026-10-19', k: 'goal', n: 1 }), { ok: false, why: 'bad_week' }, 'D21 錯週被拒');
  eq(E.post(undefined), { ok: false, why: 'bad_body' }, 'D22 沒有內容被拒');
  eq(E.findRow('2026-10-12')[3], 3, 'D23 被拒的不影響合計');

  // 暫停
  E.ss.getRangeByName('PAUSE').setValue(true);
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 5 }), { ok: false, why: 'paused' }, 'D24 暫停時拒收');
  eq(E.findRow('2026-10-12')[3], 3, 'D25 暫停時資料不變');
  E.clock.now += 31 * 1000;
  eq(E.get().paused, true, 'D26 doGet 告訴前端暫停中（仍可讀）');
  E.ss.getRangeByName('PAUSE').setValue('TRUE');
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 5 }).why, 'paused', 'D27 暫停格是文字 TRUE 也算');
  E.ss.getRangeByName('PAUSE').setValue(false);
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 5 }), { ok: true }, 'D28 取消暫停恢復收');
  eq(E.findRow('2026-10-12')[3], 8, 'D29 合計 8');
  eq([E.lockState.held, E.lockState.acquired, E.lockState.released], [false, 4, 4], 'D30 鎖每次都有釋放');
});

// ═════════ E. 每分鐘上限 ═════════
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  E.clock.now = tpe(2026, 10, 14, 13, 0, 0);
  eq(E.ctx.PLAZA.RATE_LIMIT_PER_MIN, 120, 'E0 全站每分鐘上限 120（10-12 里維建議，原 1500）');
  let accepted = 0;
  for (let i = 0; i < 120; i++) if (E.post({ w: '2026-10-12', k: 'goal', n: 1 }).ok) accepted++;
  eq(accepted, 120, 'E1 同一分鐘前 120 次都收');
  const acq = E.lockState.acquired;
  E.clock.now += 59 * 1000;
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 1 }), { ok: false, why: 'rate' }, 'E2 第 121 次回 rate');
  eq(E.lockState.acquired, acq, 'E3 超量時不去搶鎖、不碰試算表');
  eq(E.findRow('2026-10-12')[3], 120, 'E4 合計剛好 120');
  E.clock.now += 1000; // 下一分鐘
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 1 }), { ok: true }, 'E5 下一分鐘恢復');
  // 鎖內再檢查一次（預檢後、拿鎖前剛好被別人用完的情況）
  E.ctx.PLAZA.RATE_LIMIT_PER_MIN = 3;
  E.clock.now = tpe(2026, 10, 14, 14, 0, 0);
  for (let i = 0; i < 2; i++) E.post({ w: '2026-10-12', k: 'goal', n: 1 });
  E.hooks.afterGetValues = (sheet, r, c, nr, nc) => {
    if (sheet.name === '說明' && E.hooks.armed) { // 讀暫停格時（預檢之後、拿鎖之前）插入另一個請求
      E.hooks.armed = false;
      E.hooks.inner = E.post({ w: '2026-10-12', k: 'goal', n: 1 });
    }
  };
  E.hooks.armed = true;
  const outer = E.post({ w: '2026-10-12', k: 'goal', n: 1 });
  eq([E.hooks.inner, outer], [{ ok: true }, { ok: false, why: 'rate' }], 'E6 鎖內二次檢查擋下第 4 次');
  E.hooks.afterGetValues = null;
});

// ═════════ F. 併發遞增不遺失（模擬鎖） ═════════
function concurrencyRun(lockMode) {
  const E = makeEnv({ lockMode });
  E.ctx.setup();
  E.post({ w: '2026-10-12', k: 'goal', n: 10 });            // 先有一列
  let inner = null;
  E.hooks.armed = true;
  E.hooks.afterGetValues = (sheet, r, c, nr, nc) => {
    // A 讀完「本週」那一列（13 欄）之後、寫回之前，B 插進來
    if (sheet.name === '本週' && nc === 13 && nr === 1 && E.hooks.armed) {
      E.hooks.armed = false;
      inner = E.post({ w: '2026-10-12', k: 'goal', n: 5 });
    }
  };
  const a = E.post({ w: '2026-10-12', k: 'goal', n: 7 });
  E.hooks.afterGetValues = null;
  let retried = null;
  if (inner && inner.why === 'busy') retried = E.post({ w: '2026-10-12', k: 'goal', n: 5 }); // 前端下次再送
  return { E, a, inner, retried, total: E.findRow('2026-10-12')[3] };
}
section(() => {
  const real = concurrencyRun('real');
  eq([real.a, real.inner, real.retried], [{ ok: true }, { ok: false, why: 'busy' }, { ok: true }], 'F1 有鎖：B 等不到鎖回 busy，重送成功');
  eq(real.total, 10 + 7 + 5, 'F2 有鎖：合計 22，沒有遺失');
  eq(real.E.lockState.held, false, 'F3 有鎖：結束時鎖已釋放');
  const noop = concurrencyRun('noop');
  eq(noop.total, 10 + 7, 'F4 對照組（假裝沒鎖）：會遺失 B 的 5 → 證明測試抓得到遺失');

  // 寫入途中出錯也要釋放鎖
  const E = makeEnv();
  E.ctx.setup();
  let boom = true;
  E.hooks.beforeSetValues = (sheet) => { if (sheet.name === '本週' && boom) { boom = false; throw new Error('Service Spreadsheets timed out'); } };
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 4 }), { ok: false, why: 'server' }, 'F5 寫入出錯回 server（不回錯誤內容）');
  eq(E.lockState.held, false, 'F6 出錯後鎖已釋放');
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 4 }), { ok: true }, 'F7 下一次正常');
  // 200 次連續送出合計正確
  let sum = 4;
  for (let i = 0; i < 200; i++) { const n = (i % 10) + 1; sum += n; E.clock.now += 1000; E.post({ w: '2026-10-12', k: 'goal', n }); }   // 每秒一筆（每分鐘上限 120 以內）
  eq(E.findRow('2026-10-12')[3], sum, 'F8 200 次連續送出合計正確');
});

// ═════════ G. 上週結果、換週、主題表覆寫生效 ═════════
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  for (let i = 0; i < 18; i++) E.post({ w: '2026-10-12', k: 'goal', n: 10 }); // 180 → 銀
  E.clock.now = tpe(2026, 10, 19, 0, 5, 0); // 換週後 5 分鐘
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 2 }), { ok: true }, 'G1 換週寬限內送上一週 → 收');
  eq(E.post({ w: '2026-10-19', k: 'goal', n: 10 }), { ok: true }, 'G2 新的一週');
  for (let i = 0; i < 3; i++) E.post({ w: '2026-10-19', k: 'goal', n: 10 });
  eq(E.findRow('2026-10-12')[3], 182, 'G3 上一週那列 182');
  eq(E.findRow('2026-10-19').slice(0, 7), ['2026-10-19', 'deliver', '送貨週', 40, 40, 120, 240], 'G4 新週自動輪到送貨週');
  const g = E.get();
  eq([g.w, g.theme.key, g.total, g.reached], ['2026-10-19', 'deliver', 40, 1], 'G5 本週達到銅');
  eq(g.prev, { w: '2026-10-12', theme: { key: 'rescue', title: '救援週', unit: '隻', desc: '大家一起在泡泡救援灣救出動物', goals: [50, 150, 300] }, total: 182, reached: 2 }, 'G6 上週結果：銀');
  eq([0, 49, 50, 149, 150, 299, 300, 9999].map(t => E.ctx.reachedLevel_(t, [50, 150, 300])), [0, 0, 1, 1, 2, 2, 3, 3], 'G7 銅銀金門檻');

  // 主題表覆寫下週
  const th = E.ss.getSheetByName('主題表');
  th.cells.push(['2026-10-26', 'star', '星星大放送', '', 20, 40, 80, '']);
  E.clock.now = tpe(2026, 10, 27, 9, 0, 0);
  const g2 = E.get();
  eq([g2.theme.key, g2.theme.title, g2.theme.goals, g2.prev.total, g2.prev.reached], ['star', '星星大放送', [20, 40, 80], 40, 1], 'G8 主題表覆寫生效、上週 40 → 銅');
  // 沒有任何人玩的上週
  E.clock.now = tpe(2026, 11, 10, 9, 0, 0);
  const g3 = E.get();
  eq([g3.w, g3.theme.key, g3.prev.w, g3.prev.total, g3.prev.reached], ['2026-11-09', 'star', '2026-11-02', 0, 0], 'G9 上週沒資料 → total 0、reached 0');
});

// ═════════ H. 試算表把週次自動轉成日期、拿不到試算表 ═════════
section(() => {
  const E = makeEnv();
  E.ctx.setup();                               // 時區 → Asia/Taipei
  E.post({ w: '2026-10-12', k: 'goal', n: 3 });
  const row = E.rowsSheet().cells[1];
  row[0] = new Date(Date.UTC(2026, 9, 11, 16)); // 假裝試算表把 A 欄轉成日期（台北 10-12 00:00）
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 4 }), { ok: true }, 'H1 A 欄變日期仍可送');
  eq([E.rowsSheet().getLastRow(), E.rowsSheet().cells[1][3], E.rowsSheet().cells[1][0]], [2, 7, '2026-10-12'], 'H2 找到同一列（沒有多一列），並寫回文字週次');

  const N = makeEnv({ noActive: true });
  eq(N.get(), { ok: false, why: 'no_sheet' }, 'H3 拿不到試算表 → doGet no_sheet');
  eq(N.post({ w: '2026-10-12', k: 'goal', n: 1 }), { ok: false, why: 'no_sheet' }, 'H4 拿不到試算表 → doPost no_sheet');
  // setup 沒跑過也能寫（自動補建分頁）
  const F = makeEnv();
  eq(F.post({ w: '2026-10-12', k: 'goal', n: 2 }), { ok: true }, 'H5 沒跑 setup 也能送（自動建分頁）');
  eq(F.findRow('2026-10-12')[3], 2, 'H6 自動建分頁後合計 2');
});

// ═════════ J. 送出代號 i：同一筆重送只加一次（10-12 里維建議 1：回應沒收到時前端會用同一個 i 重送）═════════
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  const W = '2026-10-12';
  eq(E.post({ w: W, k: 'goal', n: 3, i: 'same0001' }), { ok: true }, 'J1 第一次送（i=same0001）');
  eq(E.post({ w: W, k: 'goal', n: 3, i: 'same0001' }), { ok: true }, 'J2 同一個 i 再送 → 一樣回 ok（前端才會把它從送出中刪掉）');
  eq(E.findRow(W)[3], 3, 'J3 同一個 i 送兩次只加一次（合計 3）');
  eq(E.post({ w: W, k: 'goal', n: 3, i: 'other002' }), { ok: true }, 'J4 不同的 i');
  eq(E.findRow(W)[3], 6, 'J5 不同的 i 照加（合計 6）');
  E.post({ w: W, k: 'goal', n: 1 }); E.post({ w: W, k: 'goal', n: 1 });
  eq(E.findRow(W)[3], 8, 'J6 沒帶 i（舊版前端）照舊每次都加');
  E.post({ w: W, k: 'play', n: 2, i: 'play0001' }); E.post({ w: W, k: 'play', n: 2, i: 'play0001' });
  eq(E.findRow(W)[7], 2, 'J7 play 一樣只加一次');
  ok(!JSON.stringify(E.ss.sheets.map(s => s.cells)).includes('same0001'), 'J8 i 不寫進試算表（只在快取）');
  eq(E.store.get('id:same0001') && E.store.get('id:same0001').exp - E.clock.now, 21600 * 1000, 'J9 i 記 6 小時');
  E.clock.now += 21600 * 1000 + 1000;
  E.post({ w: W, k: 'goal', n: 3, i: 'same0001' });
  eq(E.findRow(W)[3], 11, 'J10 超過 6 小時（快取過期）同一個 i 會再加（前端不會隔這麼久還重送同一筆）');
  // 寫入出錯：i 沒記 → 用同一個 i 重送會真的加（不會因為「看過」就吞掉）
  const F = makeEnv();
  F.ctx.setup();
  let boom = true;
  F.hooks.beforeSetValues = (sheet) => { if (sheet.name === '本週' && boom) { boom = false; throw new Error('Service Spreadsheets timed out'); } };
  eq(F.post({ w: W, k: 'goal', n: 4, i: 'boom0001' }), { ok: false, why: 'server' }, 'J11 寫入出錯回 server');
  eq(F.post({ w: W, k: 'goal', n: 4, i: 'boom0001' }), { ok: true }, 'J12 同一個 i 重送 → 收');
  eq(F.findRow(W)[3], 4, 'J13 出錯那次沒算、重送算一次（合計 4）');
  eq(F.lockState.held, false, 'J14 鎖已釋放');
  // 加過的那筆重送時剛好碰到每分鐘上限：在鎖裡先認出「已經加過」→ 回 ok（不會讓前端一直重送）
  const R = makeEnv();
  R.ctx.setup();
  R.post({ w: W, k: 'goal', n: 2, i: 'rate0001' });
  R.ctx.PLAZA.RATE_LIMIT_PER_MIN = 1;
  eq(R.post({ w: W, k: 'goal', n: 2 }), { ok: false, why: 'rate' }, 'J15 上限 1：沒帶 i 的新送出回 rate');
  // 預檢在鎖外（還沒拿鎖就擋），所以重送也先被 rate 擋；下一分鐘再送 → 認出已加過
  eq(R.post({ w: W, k: 'goal', n: 2, i: 'rate0001' }), { ok: false, why: 'rate' }, 'J16 同一分鐘：重送也被預檢擋（前端留著下次送）');
  R.clock.now += 60 * 1000; R.ctx.PLAZA.RATE_LIMIT_PER_MIN = 120;
  eq(R.post({ w: W, k: 'goal', n: 2, i: 'rate0001' }), { ok: true }, 'J17 下一分鐘重送 → ok');
  eq(R.findRow(W)[3], 2, 'J18 合計還是 2（只加一次）');
  // 兩個同 i 的重送同時到（A 讀完那一列、寫回前 B 插進來）：B 等不到鎖回 busy，之後重送認出已加過
  const C = makeEnv();
  C.ctx.setup();
  C.post({ w: W, k: 'goal', n: 1 });
  let inner = null;
  C.hooks.armed = true;
  C.hooks.afterGetValues = (sheet, r, c, nr, nc) => { if (sheet.name === '本週' && nc === 13 && nr === 1 && C.hooks.armed) { C.hooks.armed = false; inner = C.post({ w: W, k: 'goal', n: 5, i: 'race0001' }); } };
  const a = C.post({ w: W, k: 'goal', n: 5, i: 'race0001' });
  C.hooks.afterGetValues = null;
  const again = C.post({ w: W, k: 'goal', n: 5, i: 'race0001' });
  eq([a, inner, again], [{ ok: true }, { ok: false, why: 'busy' }, { ok: true }], 'J19 同時到：一個加、一個 busy、再重送 ok');
  eq(C.findRow(W)[3], 6, 'J20 合計 1＋5（只加一次）');
});

// ═════════ I. 靜態檢查（隱私／設定） ═════════
section(() => {
  ok(!/console\.|Logger\.|\.log\(/.test(SRC), 'I1 Code.js 沒有任何 log');
  ok(!/e\.parameter|queryString|getRemote|headers/.test(SRC), 'I2 不讀網址參數、標頭');
  eq(MANIFEST.timeZone, 'Asia/Taipei', 'I3 manifest 時區');
  eq(MANIFEST.runtimeVersion, 'V8', 'I4 manifest V8');
  eq(MANIFEST.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }, 'I5 manifest 網頁應用程式設定');
  eq(MANIFEST.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets.currentonly'], 'I6 manifest 只要求目前試算表權限');
  eq(MANIFEST.exceptionLogging, 'NONE', 'I7 manifest 不送例外記錄');
});

// ═════════════════════ T. 全島陀螺榜（k:"top"） ═════════════════════
// 詞句池：從常用字表隨機湊 5 字（固定種子），只留後端會收的、戰力不重複的，依戰力由高到低排
function makePool(n, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const chars = DF.chars.slice(0, 1500), out = [], seenP = new Set(), seenPow = new Set();
  for (let guard = 0; out.length < n && guard < 100000; guard++) {
    let p = '';
    for (let i = 0; i < 5; i++) p += chars.charAt(Math.floor(rnd() * chars.length));
    if (seenP.has(p) || TPF.phraseIssue(p, DF)) continue;
    seenP.add(p);
    const power = powerF(p);
    if (seenPow.has(power)) continue;
    seenPow.add(power); out.push({ p, power });
  }
  return out.sort((a, b) => b.power - a.power);
}
const POOL = makePool(400, 20261012);
const LEGENDS = ['紅色翹翹板', '超級賽亞人', '宇宙強爸爸', '勇敢小兔子', '努力小紅帽'];
const rowIdx = (E, p) => E.topsSheet().cells.findIndex(r => r && r[0] === p);       // 0 起算
const setRow = (E, p, st, box) => { const r = E.topsSheet().cells[rowIdx(E, p)]; r[2] = st; r[3] = box; };
const tick = (E, p) => setRow(E, p, '公開', true);

// TA. 戰力：後端（GAS 副本）＝前端（瀏覽器載入的那份）
section(() => {
  const { ctx } = makeEnv();
  const DG = ctx.topsDict();
  eq(POOL.length, 400, 'TA0 詞句池湊得到 400 句');
  const list = [...LEGENDS, '爸爸媽媽好', '王王王王王', '紅橙黃綠藍', '貓狗牛馬羊', '媽媽的拖鞋', ...POOL.filter((x, i) => i % 10 === 0).map(x => x.p)];
  eq(list.length, 50, 'TA1 抽 50 句比對');
  let same = 0, firstDiff = null;
  for (const p of list) {
    const a = JSON.stringify(TPF.powerOf(p, DF)), b = JSON.stringify(ctx.topsPowerOf(p, DG));
    if (a === b) same++; else if (!firstDiff) firstDiff = { p, front: a.slice(0, 160), gas: b.slice(0, 160) };
  }
  eq(same, 50, 'TA2 50 句的戰力（每字能力＋加成＋總分）前後端完全一樣', firstDiff);
  const issues = [...list, '大笨蛋好壞', '你媽的拖鞋', '宇宙強爸', '宇宙強爸龘', '=SUM(A', '+宇宙強爸', 'ABCDE', '宇宙 強爸', '幹宇宙強爸'];
  eq(issues.map(p => ctx.topsPhraseIssue(p, DG)), issues.map(p => TPF.phraseIssue(p, DF)), 'TA3 收不收的判斷前後端一樣');
  eq(JSON.stringify(ctx.TOPS_DICT_RAW), JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'zhuyin-tops-dict.json'), 'utf8'))), 'TA4 後端字典＝前端字典');
});

// TB. 拒收
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  eq(['大笨蛋好壞', '你媽的拖鞋'].map(p => TPF.phraseIssue(p, DF)), ['blocked', 'blocked'], 'TB0 測試用的黑名單句前端也擋');
  const P = '宇宙強爸爸';
  const rej = [
    [{ k: 'top', p: '宇宙強爸' }, 'bad_len'], [{ k: 'top', p: '宇宙強爸爸爸' }, 'bad_len'], [{ k: 'top', p: '' }, 'bad_len'],
    [{ k: 'top', p: 12345 }, 'bad_len'], [{ k: 'top', p: null }, 'bad_len'], [{ k: 'top', p: [P] }, 'bad_len'],
    [{ k: 'top', p: '宇宙強爸😀' }, 'bad_len'],
    [{ k: 'top', p: '宇宙強爸龘' }, 'bad_char'], [{ k: 'top', p: 'ABCDE' }, 'bad_char'], [{ k: 'top', p: '宇宙 強爸' }, 'bad_char'],
    [{ k: 'top', p: '大笨蛋好壞' }, 'blocked'], [{ k: 'top', p: '你媽的拖鞋' }, 'blocked'],
    [{ k: 'top', p: '=SUM(' }, 'bad_formula'], [{ k: 'top', p: '+宇宙強爸' }, 'bad_formula'],
    [{ k: 'top', p: '-宇宙強爸' }, 'bad_formula'], [{ k: 'top', p: '@宇宙強爸' }, 'bad_formula'],
    [{ k: 'top', p: P, power: 9999 }, 'bad_body'], [{ k: 'top', p: P, w: '2026-10-12' }, 'bad_body'],
    [{ k: 'top', p: P, n: 1 }, 'bad_body'], [{ k: 'top' }, 'bad_body'], [{ p: P }, 'bad_body'],
    [{ k: 'Top', p: P }, 'bad_body'], [{ k: 'tops', p: P }, 'bad_body'],
    [JSON.stringify({ k: 'top', p: P }) + ' '.repeat(200), 'bad_body']
  ];
  for (const [body, why] of rej) eq(E.post(body), { ok: false, why }, `TB1 拒收 ${typeof body === 'string' ? '超長內容' : JSON.stringify(body)} → ${why}`);
  eq(E.topsData(), [], 'TB2 被拒的都沒寫進試算表');
  eq(E.lockState.acquired, 0, 'TB3 被拒的都沒去搶鎖');
  eq(E.top('媽媽的拖鞋').ok, true, 'TB4 「媽媽的拖鞋」不會被「媽的」誤擋');
});

// TC. 伺服器重算戰力、回應格式、預設要審核
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  const r = E.top('宇宙強爸爸');
  eq(Object.keys(r), ['ok', 'power', 'status'], 'TC1 回應只有 ok、power、status');
  eq(r, { ok: true, power: powerF('宇宙強爸爸'), status: 'pending' }, 'TC2 宇宙強爸爸：戰力＝前端公式、預設待審核');
  eq(E.topsData(), [['宇宙強爸爸', powerF('宇宙強爸爸'), '待審核', false, '2026-10-14']], 'TC3 那一列＝詞句、戰力、待審核、沒勾、日期（只到日）');
  let allSame = true, bad = null;
  for (const { p } of POOL.slice(100, 110)) { const x = E.top(p); if (x.power !== powerF(p)) { allSame = false; bad = { p, x }; } }
  ok(allSame, 'TC4 再送 10 句，伺服器算的戰力都＝前端', bad);
  eq(E.get().tops, [], 'TC5 全部待審核 → doGet 的 tops 還是空的');
  eq(E.topsData().every(r => /^\d{4}-\d{2}-\d{2}$/.test(r[4])), true, 'TC6 日期欄只有日期');
  eq(E.topsData().map(r => r[1]), E.topsData().map(r => r[1]).slice().sort((a, b) => b - a), 'TC7 表格依戰力由高到低排');
});

// TD. 前 5 名判斷、同一句只算一筆、不公開的不會再跑回來
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  const pubs = [POOL[10], POOL[12], POOL[14], POOL[16], POOL[18]];
  E.putTops(pubs.map(x => [x.p, 1, '公開', true, '2026-10-01']));        // 戰力故意亂寫：伺服器要重算
  const weak = POOL[19];
  eq(E.top(weak.p), { ok: true, power: weak.power, status: 'below' }, 'TD1 比公開第 5 名弱 → below');
  ok(!E.topsData().some(r => r[0] === weak.p), 'TD2 below 不存');
  eq(E.topsData().map(r => r[1]), pubs.map(x => x.power), 'TD3 順便把亂寫的戰力改成正確的');
  eq(E.top(POOL[17].p).status, 'pending', 'TD4 介於第 4、5 名之間 → 待審核（擠得進前 5）');
  eq(E.top(POOL[5].p).status, 'pending', 'TD5 比第 1 名強 → 待審核');
  const n0 = E.topsData().length;
  eq(E.top(POOL[5].p).status, 'pending', 'TD6 同一句再送 → 還是待審核');
  eq(E.topsData().length, n0, 'TD7 同一句只算一筆');
  eq(E.top(POOL[10].p).status, 'public', 'TD8 已公開且在前 5 → public');
  tick(E, POOL[5].p);                                                     // 阿葉勾了 → 第 5 名（POOL[18]）被擠出去
  eq(E.top(POOL[18].p).status, 'below', 'TD9 公開但被擠出前 5 → below');
  eq(E.top(POOL[17].p).status, 'below', 'TD10 待審核但現在擠不進前 5 → below（列先留著）');
  ok(E.topsData().some(r => r[0] === POOL[17].p), 'TD11 擠不進的待審核列沒被刪（等 7 天或阿葉處理）');
  setRow(E, POOL[17].p, '不公開', false);
  eq(E.top(POOL[17].p).status, 'below', 'TD12 不公開的再送 → below');
  eq(E.topsData().find(r => r[0] === POOL[17].p).slice(2, 4), ['不公開', false], 'TD13 不公開的還是不公開（不會變回待審核）');

  // 一樣強：先來的排前面 → 新的擠不進
  let tie = null;
  for (const x of POOL.slice(4)) {
    const ch = [...x.p];
    for (let k = 1; k < 5 && !tie; k++) {
      const y = ch.slice(k).concat(ch.slice(0, k)).join('');
      if (y !== x.p && !TPF.phraseIssue(y, DF) && powerF(y) === x.power) tie = [x, { p: y, power: x.power }];
    }
    if (tie) break;
  }
  ok(!!tie, 'TD14 找得到一樣強的兩句（字一樣、順序不同）');
  if (tie) {
    const T = makeEnv();
    T.ctx.setup();
    const stronger = POOL.filter(x => x.power > tie[0].power).slice(0, 4);
    T.putTops([...stronger, tie[0]].map(x => [x.p, x.power, '公開', true, '2026-10-01']));
    eq(T.top(tie[1].p), { ok: true, power: tie[0].power, status: 'below' }, 'TD15 跟第 5 名一樣強 → below（先來的贏）');
  }
});

// TE. 自動公開
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  E.top(POOL[4].p);                                          // 開關沒開時送的 → 待審核
  E.ss.getRangeByName('TOPS_AUTO').setValue(true);
  eq(E.get().tops, [], 'TE1 打開自動公開前先讀一次（放進快取）');
  eq(E.top(POOL[3].p), { ok: true, power: POOL[3].power, status: 'public' }, 'TE2 自動公開：新進前 5 直接 public');
  eq(E.topsData()[0].slice(0, 4), [POOL[3].p, POOL[3].power, '公開', true], 'TE3 那一列打勾、狀態公開');
  eq(E.get().tops, [{ p: POOL[3].p, power: POOL[3].power }], 'TE4 自動公開後不用等快取就看得到');
  eq(E.top(POOL[4].p).status, 'pending', 'TE5 開關打開前就在待審核的，不會自動變公開');
  E.ss.getRangeByName('TOPS_AUTO').setValue('TRUE');
  eq(E.top(POOL[2].p).status, 'public', 'TE6 開關格是文字 TRUE 也算');
  E.ss.getRangeByName('TOPS_AUTO').setValue(false);
  eq(E.top(POOL[1].p).status, 'pending', 'TE7 關掉 → 又要審核');
});

// TF. 最多 50 列
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  const many = POOL.slice(100, 155);                          // 55 句待審核
  E.putTops(many.map(x => [x.p, x.power, '待審核', false, '2026-10-13']));
  const nw = POOL[300];                                       // 比它們都弱的新句（沒有公開的 → 照樣擠得進前 5）
  eq(E.top(nw.p).status, 'pending', 'TF1 新句待審核');
  const d = E.topsData();
  eq(d.length, 50, 'TF2 只留 50 列');
  ok(d.some(r => r[0] === nw.p), 'TF3 剛送的那句一定留');
  eq(d.filter(r => r[0] !== nw.p).map(r => r[0]), many.slice(0, 49).map(x => x.p), 'TF4 其餘留戰力最高的 49 句');
  eq(d.map(r => r[1]), d.map(r => r[1]).slice().sort((a, b) => b - a), 'TF5 依戰力排好');

  // 公開前 5 名一定留（就算有 55 句更強的不公開）
  const F = makeEnv();
  F.ctx.setup();
  const hid = POOL.slice(0, 55), pubs = [POOL[60], POOL[62], POOL[64], POOL[66], POOL[68]], nw2 = POOL[67];
  F.putTops([...hid.map(x => [x.p, x.power, '不公開', false, '2026-10-01']), ...pubs.map(x => [x.p, x.power, '公開', true, '2026-10-01'])]);
  eq(F.top(nw2.p).status, 'pending', 'TF6 介於第 4、5 名 → 待審核');
  const d2 = F.topsData();
  eq(d2.length, 50, 'TF7 只留 50 列');
  ok(pubs.every(x => d2.some(r => r[0] === x.p)) && d2.some(r => r[0] === nw2.p), 'TF8 公開前 5 名與新句都留');
  eq(d2.filter(r => r[2] === '不公開').map(r => r[0]), hid.slice(0, 44).map(x => x.p), 'TF9 不公開的留最強的 44 句');
  eq(F.get().tops.map(x => x.p), pubs.map(x => x.p), 'TF10 doGet 公開前 5 名不受影響');
});

// TG. 待審核 7 天自動刪、沒變動就不寫
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  E.putTops([
    [POOL[1].p, 0, '待審核', false, '2026-10-06'],                         // 8 天 → 刪
    [POOL[2].p, 0, '待審核', false, '2026-10-07'],                         // 7 天 → 留
    [POOL[3].p, 0, '公開', true, '2026-09-01'],                            // 公開：多久都留
    [POOL[4].p, 0, '不公開', false, '2026-09-01'],                         // 不公開：留著（擋同一句再來）
    [POOL[5].p, 0, '待審核', false, new Date(Date.UTC(2026, 9, 5, 16))]   // 日期物件（台北 10-06）→ 8 天 → 刪
  ]);
  eq(E.top(POOL[3].p).status, 'public', 'TG1 隨便一筆送出（已公開的再送）');
  eq(E.topsData().map(r => [r[0], r[4]]).sort(), [[POOL[2].p, '2026-10-07'], [POOL[3].p, '2026-09-01'], [POOL[4].p, '2026-09-01']].sort(), 'TG2 待審核超過 7 天的刪掉，其他留著');
  let writes = 0;
  E.hooks.beforeSetValues = (sheet) => { if (sheet.name === '陀螺榜') writes++; };
  eq(E.top(POOL[3].p).status, 'public', 'TG3 再送一次');
  eq(writes, 0, 'TG4 沒有變動就不寫試算表');
  E.hooks.beforeSetValues = null;
  E.clock.now = tpe(2026, 10, 15, 9, 0, 0);
  E.top(POOL[3].p);
  ok(!E.topsData().some(r => r[0] === POOL[2].p), 'TG5 隔天（滿 8 天）那句也刪了');
  eq(E.topsData().length, 2, 'TG6 剩 2 列');
  const s = E.topsSheet();
  eq([s.valid['5,4'], s.valid['6,4'], s.valid['7,4'] || null, s.cells[6] ? s.cells[6].slice(0, 5) : null], ['checkbox', 'checkbox', null, ['', '', '', '', '']], 'TG7 資料列有勾選框；縮短後多出來的舊列清空、勾選框拿掉');
});

// TH. doGet 的 tops：只回公開前 5、重算戰力、排除不合格、快取 30 秒
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  E.putTops([
    [POOL[30].p, 99999, '公開', true, '2026-10-01'],
    [POOL[31].p, 1, '公開', true, '2026-10-01'],
    [POOL[0].p, 0, '待審核', false, '2026-10-13'],      // 最強但待審核 → 不出現
    [POOL[1].p, 0, '不公開', false, '2026-10-01'],      // 不公開 → 不出現
    ['大笨蛋好壞', 9999, '公開', true, '2026-10-01'],    // 阿葉手打又勾了，但在黑名單 → 不出現
    ['abc', 9999, '公開', 'TRUE', '2026-10-01'],         // 不是 5 個常用字 → 不出現
    [POOL[32].p, 0, '公開', true, '2026-10-01'],
    [POOL[33].p, 0, '公開', true, '2026-10-01'],
    [POOL[30].p, 0, '不公開', false, '2026-10-02'],     // 重複列
    [POOL[35].p, 0, '公開', true, '2026-10-01'],
    [POOL[34].p, 0, '公開', 'TRUE', '2026-10-01']       // 勾選格變成文字 TRUE 也算
  ]);
  const want = [30, 31, 32, 33, 34].map(i => ({ p: POOL[i].p, power: POOL[i].power }));
  eq(E.get().tops, want, 'TH1 只回公開前 5、依戰力排、戰力用公式重算');
  tick(E, POOL[0].p);                                  // 阿葉勾了最強的那句
  E.clock.now += 10 * 1000;
  eq(E.get().tops, want, 'TH2 30 秒內還是快取');
  E.clock.now += 21 * 1000;
  eq(E.get().tops, [{ p: POOL[0].p, power: POOL[0].power }, ...want.slice(0, 4)], 'TH3 快取過期 → 勾公開的上榜了');
  // 陀螺榜壞掉也不影響同樂廣場
  E.clock.now += 31 * 1000;
  E.hooks.afterGetValues = (sheet) => { if (sheet.name === '陀螺榜') throw new Error('boom'); };
  const g = E.get();
  eq([g.ok, g.w, g.tops], [true, '2026-10-12', []], 'TH4 陀螺榜讀取出錯 → 其他照常、tops 空');
  E.hooks.afterGetValues = null;
});

// TI. 併發（模擬鎖）：同時送兩句不會互相蓋掉
function topsRace(lockMode) {
  const E = makeEnv({ lockMode });
  E.ctx.setup();
  let inner = null;
  E.hooks.armed = true;
  E.hooks.afterGetValues = (sheet, r, c, nr, nc) => {
    if (sheet.name === '陀螺榜' && r === 1 && nc === 5 && E.hooks.armed) { E.hooks.armed = false; inner = E.top(POOL[8].p); }
  };
  const a = E.top(POOL[9].p);
  E.hooks.afterGetValues = null;
  const retried = inner && inner.why === 'busy' ? E.top(POOL[8].p) : null;
  return { E, a, inner, retried, phrases: E.topsData().map(r => r[0]).sort() };
}
section(() => {
  const real = topsRace('real');
  eq([real.a.status, real.inner, real.retried && real.retried.status], ['pending', { ok: false, why: 'busy' }, 'pending'], 'TI1 有鎖：第二句等不到鎖回 busy，重送成功');
  eq(real.phrases, [POOL[8].p, POOL[9].p].sort(), 'TI2 有鎖：兩句都在');
  eq(real.E.lockState.held, false, 'TI3 有鎖：鎖已釋放');
  const noop = topsRace('noop');
  eq(noop.phrases, [POOL[9].p], 'TI4 對照組（假裝沒鎖）：第二句被蓋掉 → 證明測試抓得到');
  // 寫入途中出錯也要釋放鎖
  const E = makeEnv();
  E.ctx.setup();
  let boom = true;
  E.hooks.beforeSetValues = (sheet) => { if (sheet.name === '陀螺榜' && boom) { boom = false; throw new Error('Service Spreadsheets timed out'); } };
  eq(E.top(POOL[7].p), { ok: false, why: 'server' }, 'TI5 寫入出錯回 server');
  eq(E.lockState.held, false, 'TI6 出錯後鎖已釋放');
  eq(E.top(POOL[7].p).status, 'pending', 'TI7 下一次正常');
});

// TJ. setup／自動建立分頁（冪等）
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  const s = E.topsSheet();
  ok(String(s.cells[0][0]).includes('勾「公開」才會上榜；請不要公開看起來像人名、小名、學校、地址的詞句'), 'TJ1 說明列');
  eq([E.ss.getRangeByName('TOPS_AUTO').getValue(), s.valid['2,1']], [false, 'checkbox'], 'TJ2 自動公開是勾選框、預設不勾');
  ok(String(s.cells[1][1]).includes('自動公開') && String(s.cells[2][0]).includes('人名'), 'TJ3 自動公開說明與審核清單');
  eq(s.cells[3].slice(0, 5), ['詞句', '戰力', '狀態', '公開', '首次送出日期'], 'TJ4 表頭');
  E.top(POOL[0].p);
  tick(E, POOL[0].p);
  E.ss.getRangeByName('TOPS_AUTO').setValue(true);
  const before = JSON.stringify(s.cells);
  E.ctx.setup();
  eq([JSON.stringify(s.cells) === before, E.ss.getSheets().length, E.ss.getRangeByName('TOPS_AUTO').getValue()], [true, 4, true], 'TJ5 setup 重跑：資料、開關都不動');

  // 正式環境現況：舊的三個分頁在、沒有陀螺榜 → doGet／doPost 自己建
  const G = makeEnv();
  G.ctx.setup();
  G.ss.sheets = G.ss.sheets.filter(x => x.name !== '陀螺榜');
  delete G.ss.named.TOPS_AUTO;
  eq(G.get().tops, [], 'TJ6 沒有陀螺榜分頁 → doGet 照常、tops 空');
  ok(!!G.topsSheet() && !!G.ss.getRangeByName('TOPS_AUTO'), 'TJ7 doGet 自動建好分頁與開關');
  eq(G.lockState.held, false, 'TJ8 建完釋放鎖');
  G.clock.now += 31 * 1000;
  G.get();
  eq(G.ss.getSheets().filter(x => x.name === '陀螺榜').length, 1, 'TJ9 再讀不會重複建');
  G.ss.sheets = G.ss.sheets.filter(x => x.name !== '陀螺榜');
  eq(G.top(POOL[0].p).status, 'pending', 'TJ10 沒有分頁時 doPost 也會自己建再寫');
  eq(G.topsData().map(r => r[0]), [POOL[0].p], 'TJ11 寫進去了');
});

// TK. 暫停、每分鐘上限（跟同樂廣場共用）
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  E.ss.getRangeByName('PAUSE').setValue(true);
  eq(E.top(POOL[0].p), { ok: false, why: 'paused' }, 'TK1 暫停中不收');
  eq(E.topsData(), [], 'TK2 暫停中沒寫');
  E.ss.getRangeByName('PAUSE').setValue(false);
  E.ctx.PLAZA.RATE_LIMIT_PER_MIN = 2;
  E.clock.now = tpe(2026, 10, 14, 15, 0, 0);
  E.post({ w: '2026-10-12', k: 'goal', n: 1 });
  E.top(POOL[0].p);
  eq(E.top(POOL[1].p), { ok: false, why: 'rate' }, 'TK3 跟同樂廣場共用每分鐘上限');
});

// TL. 阿葉在試算表勾選時，狀態欄跟著變（onEdit）
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  E.top(POOL[0].p); E.top(POOL[1].p);
  const s = E.topsSheet();
  const at = (p) => rowIdx(E, p) + 1;
  const edit = (r, c, nr = 1, nc = 1) => E.ctx.onEdit({ range: s.getRange(r, c, nr, nc) });
  const r0 = at(POOL[0].p), r1 = at(POOL[1].p);
  s.cells[r0 - 1][3] = true; edit(r0, 4);
  eq(s.cells[r0 - 1].slice(2, 4), ['公開', true], 'TL1 勾公開 → 狀態「公開」');
  s.cells[r0 - 1][3] = false; edit(r0, 4);
  eq(s.cells[r0 - 1].slice(2, 4), ['不公開', false], 'TL2 取消勾 → 狀態「不公開」');
  s.cells[r0 - 1][2] = '公開'; edit(r0, 3);
  eq(s.cells[r0 - 1].slice(2, 4), ['公開', true], 'TL3 狀態打「公開」→ 自動打勾');
  s.cells[r0 - 1][2] = '待審核'; edit(r0, 3);
  eq(s.cells[r0 - 1].slice(2, 4), ['待審核', false], 'TL4 狀態改回「待審核」→ 取消勾');
  s.cells[r0 - 1][3] = true; s.cells[r1 - 1][3] = true; edit(Math.min(r0, r1), 4, 2, 1);
  eq([s.cells[r0 - 1][2], s.cells[r1 - 1][2]], ['公開', '公開'], 'TL5 一次勾兩列');
  const snap = JSON.stringify(s.cells);
  s.cells[r0 - 1][2] = '不公開'; s.cells[r0 - 1][3] = true; edit(r0, 3, 1, 2);
  eq(s.cells[r0 - 1].slice(2, 4), ['不公開', true], 'TL6 狀態和勾選一起貼上 → 不動');
  s.cells[r0 - 1][2] = '公開';
  edit(4, 3); edit(2, 1);
  eq(JSON.stringify(s.cells), snap, 'TL7 改表頭、自動公開開關 → 不動');
  E.ctx.onEdit({ range: E.ss.getSheetByName('本週').getRange(1, 3) });
  E.ctx.onEdit(undefined);
  ok(true, 'TL8 其他分頁、沒有事件物件都不會出錯');
  E.clock.now += 31 * 1000;
  eq(E.get().tops.map(x => x.p).sort(), [POOL[0].p, POOL[1].p].sort(), 'TL9 勾了的兩句上榜');
});

// TM. 公式注入：寫進試算表的字串不會變成公式
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  E.putTops([['+886宇宙', 5, '公開', true, '2026-10-01'], ['=1+1', 1, '待審核', false, '2026-10-13'], ['@x', 1, '待審核', false, '=NOW()']]);
  E.top(POOL[0].p);
  const d = E.topsData();
  const texts = d.flatMap(r => [r[0], r[2], r[4]]).map(String);
  ok(texts.every(t => !/^[=+\-@]/.test(t)), 'TM1 寫回的文字都不是 = + - @ 開頭', texts);
  eq(d.filter(r => String(r[0]).startsWith("'")).map(r => [r[0], r[2], r[3]]).sort(), [["'+886宇宙", '不公開', false], ["'=1+1", '不公開', false], ["'@x", '不公開', false]].sort(), 'TM2 手打的怪詞句前面加 \'、一律不公開');
  E.clock.now += 31 * 1000;
  ok(!E.get().tops.some(x => /[=+@]/.test(x.p)), 'TM3 不會出現在榜上');
});

// TO. 靜態檢查：GAS 副本＝產生器輸出、沒有 log、權限沒變
section(() => {
  eq(SRC_POWER, fs.readFileSync(path.join(ROOT, 'tools', 'tops', 'gas', 'TopsPower.gs'), 'utf8'), 'TO1 TopsPower.gs 副本＝tools/tops/gas 那份');
  eq(SRC_DICT, fs.readFileSync(path.join(ROOT, 'tools', 'tops', 'gas', 'TopsDict.gs'), 'utf8'), 'TO2 TopsDict.gs 副本＝tools/tops/gas 那份');
  const front = fs.readFileSync(path.join(ROOT, 'js', 'zhuyin-tops-power.js'), 'utf8').split('// @@ESM-EXPORT')[0].trimEnd();
  ok(SRC_POWER.includes(front), 'TO3 TopsPower.gs＝目前的 js/zhuyin-tops-power.js（改了公式要重跑 build_gas.py）');
  ok(!/console\.|Logger\./.test(SRC_POWER + SRC_DICT), 'TO4 戰力檔沒有 log');
  ok(/^function onEdit\(e\)/m.test(SRC) && !/ScriptApp|PropertiesService|UrlFetchApp|DriveApp|GmailApp/.test(SRC), 'TO5 只用簡單觸發器、沒用到要多授權的服務');
});

console.log(`PASS ${pass} / FAIL ${fail}`);
if (fail) { for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
