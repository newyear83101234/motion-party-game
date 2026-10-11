// 小島同樂廣場後端本機測試：node tools/plaza/test-core.mjs
// 用 vm 載入 gas/Code.js，自備 SpreadsheetApp / LockService / CacheService / ContentService / Utilities 假物件。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, 'gas', 'Code.js'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(here, 'gas', 'appsscript.json'), 'utf8'));

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
      name, cells: [],
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
      insertCheckboxes() {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
          sheet.cells[r - 1 + i] = sheet.cells[r - 1 + i] || [];
          if (sheet.cells[r - 1 + i][c - 1 + j] !== true) sheet.cells[r - 1 + i][c - 1 + j] = false;
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
      flush: () => {}
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
  return { ctx, ss, clock, hooks, lockState, store, post, get, rowsSheet, findRow };
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
  for (const [k, n] of [['goal', 1], ['goal', 30], ['play', 1], ['play', 10], ['cheer1', 3], ['cheer4', 1]]) {
    eq(v({ w: W, k, n }), { ok: true, w: W, k, n }, `C1 接受 ${k}=${n}`);
  }
  const rej = [
    [{ w: W, k: 'goal', n: 0 }, 'bad_n'], [{ w: W, k: 'goal', n: 31 }, 'bad_n'], [{ w: W, k: 'goal', n: 999 }, 'bad_n'],
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
  eq(E.ss.getSheets().map(s => s.name), ['說明', '主題表', '本週'], 'D1 setup 建好三個分頁（預設工作表改名為說明）');
  ok(String(msg).includes('就緒'), 'D2 setup 回傳訊息');
  eq(E.ss.tz, 'Asia/Taipei', 'D3 試算表時區設成台北');
  ok(!!E.ss.getRangeByName('PAUSE'), 'D4 有暫停儲存格（命名範圍 PAUSE）');
  eq(E.ss.getRangeByName('PAUSE').getValue(), false, 'D5 暫停預設沒打勾');
  ok(E.ss.getSheetByName('說明').cells.flat().some(v => String(v).includes('這張表只存全島加總數字，不含任何個人資料')), 'D6 說明文字');
  eq(E.ss.getSheetByName('主題表').getLastRow(), 6, 'D7 主題表＝表頭＋5 週');
  eq(E.ss.getSheetByName('主題表').cells[1].slice(0, 7), ['2026-10-12', 'rescue', '救援週', '隻', 50, 150, 300], 'D8 主題表第一週內容');
  eq(E.rowsSheet().getLastRow(), 1, 'D9 本週分頁只有表頭');
  E.ctx.setup();
  eq([E.ss.getSheets().length, E.ss.getSheetByName('主題表').getLastRow()], [3, 6], 'D10 setup 重跑不重複建立');

  // doGet 初始格式
  const g0 = E.get();
  eq(Object.keys(g0), ['ok', 'w', 'theme', 'total', 'reached', 'plays', 'cheers', 'prev', 'paused', 'now'], 'D11 doGet 欄位');
  eq(Object.keys(g0.theme), ['key', 'title', 'unit', 'desc', 'goals'], 'D12 theme 欄位');
  eq([g0.ok, g0.w, g0.theme.key, g0.theme.goals, g0.total, g0.plays, g0.cheers, g0.prev, g0.paused, g0.now],
    [true, '2026-10-12', 'rescue', [50, 150, 300], 0, 0, [0, 0, 0, 0], null, false, E.clock.now], 'D13 doGet 初始值（上週早於輪替起點 → prev=null）');

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
  let accepted = 0;
  for (let i = 0; i < 1500; i++) if (E.post({ w: '2026-10-12', k: 'goal', n: 1 }).ok) accepted++;
  eq(accepted, 1500, 'E1 同一分鐘前 1500 次都收');
  const acq = E.lockState.acquired;
  E.clock.now += 59 * 1000;
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 1 }), { ok: false, why: 'rate' }, 'E2 第 1501 次回 rate');
  eq(E.lockState.acquired, acq, 'E3 超量時不去搶鎖、不碰試算表');
  eq(E.findRow('2026-10-12')[3], 1500, 'E4 合計剛好 1500');
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
  for (let i = 0; i < 200; i++) { const n = (i % 30) + 1; sum += n; E.post({ w: '2026-10-12', k: 'goal', n }); }
  eq(E.findRow('2026-10-12')[3], sum, 'F8 200 次連續送出合計正確');
});

// ═════════ G. 上週結果、換週、主題表覆寫生效 ═════════
section(() => {
  const E = makeEnv();
  E.ctx.setup();
  for (let i = 0; i < 6; i++) E.post({ w: '2026-10-12', k: 'goal', n: 30 }); // 180 → 銀
  E.clock.now = tpe(2026, 10, 19, 0, 5, 0); // 換週後 5 分鐘
  eq(E.post({ w: '2026-10-12', k: 'goal', n: 2 }), { ok: true }, 'G1 換週寬限內送上一週 → 收');
  eq(E.post({ w: '2026-10-19', k: 'goal', n: 30 }), { ok: true }, 'G2 新的一週');
  E.post({ w: '2026-10-19', k: 'goal', n: 10 });
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

console.log(`PASS ${pass} / FAIL ${fail}`);
if (fail) { for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
