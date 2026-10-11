// ===================== 注音小島：遊戲內日夜時鐘 =====================
// 家長 10-11 拍板「B 遊戲內加速、30 分鐘」：真實 30 分鐘＝遊戲一天 —— 白天 17 分 → 黃昏 3 分 → 晚上 7 分 → 清晨 3 分 → 白天…
// 純邏輯（不碰 DOM、不碰 3D），Node 可以直接單元測試：node tools/zy-test/clock-unit.mjs
// 時鐘存在 localStorage「zy_clock」（全家共用、同一台 iPad 大家一起）；只在頁面開著、而且看得到時才前進 → 關掉遊戲／切到背景＝時間停。
// 新安裝（沒有存檔）從「白天剛開始」開始。
//
// 用法（zhuyin.js，整合說明見主對話的 clock-integration.md）：
//   import { createClock } from "./zhuyin-clock.js";
//   const clock = createClock();                       // 會讀網址 ?clock=day|dusk|night|dawn|0.62 ／舊的 ?night=1|0（固定不走、不存檔）
//   setInterval(() => { const s = clock.tick(); weather.setLight(s, { fade: 1.5 }); }, 1000);   // tick 間隔請 ≤ maxStep（預設 5 秒）
//   clock.onPhase((phase, prev, s) => { … })            // 換段時叫一次："day"｜"dusk"｜"night"｜"dawn"
//   clock.get()  clock.set("dusk")  clock.set(0.62)
// 每個 sample 長這樣：{ frac 0–1 一輪中的比例, phase, u 0–1 這段走到哪, night 0–1, dusk 0–1, dawn 0–1, hour 0–24 }
//   night：晚上＝1，黃昏後半慢慢升上去、清晨前半慢慢降下來
//   dusk：黃昏暖橘粉的強度（只在黃昏段 > 0）；dawn：清晨粉紫的強度（只在清晨段 > 0）
//   全部是 smoothstep 組出來的：段與段交界值和斜率都連續，不會跳。

export const CYCLE = 1800;                                        // 一輪幾秒（30 分鐘）
export const PHASES = [["day", 1020], ["dusk", 180], ["night", 420], ["dawn", 180]];   // [段, 秒]：17／3／7／3 分
export const STORAGE_KEY = "zy_clock";
const START = {}; { let s = 0; for (const [k, d] of PHASES) { START[k] = s; s += d; } }
const LEN = Object.fromEntries(PHASES);
// 顯示用的時鐘：白天 06–17 點、黃昏 17–19 點、晚上 19–隔天 05 點、清晨 05–06 點（跟原本「19:00–06:00 是晚上」對得上）
const HOURS = { day: [6, 17], dusk: [17, 19], night: [19, 29], dawn: [29, 30] };
const at = (phase, u) => (START[phase] + LEN[phase] * u) / CYCLE;
// 網址／set() 的名字 → 一輪中的比例：正中午、黃昏最橘、半夜、清晨最粉
export const PRESETS = { day: at("day", 6 / 11), dusk: at("dusk", 0.45), night: at("night", 0.5), dawn: at("dawn", 0.5) };

const ss = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
export function wrap01(x) { x = +x; if (!Number.isFinite(x)) return 0; const r = x - Math.floor(x); return r >= 1 ? 0 : r; }

// 一輪中的比例 → 光線值（純函式）
export function sample(frac) {
  frac = wrap01(frac);
  const t = frac * CYCLE;
  let phase = "dawn", u = 1;
  for (const [k, d] of PHASES) if (t < START[k] + d) { phase = k; u = (t - START[k]) / d; break; }
  let night = 0, dusk = 0, dawn = 0;
  if (phase === "dusk") { dusk = ss(0, 0.35, u) * (1 - ss(0.55, 1, u)); night = ss(0.4, 1, u); }        // 先變橘，後半天黑（路燈在後半段亮）
  else if (phase === "night") night = 1;
  else if (phase === "dawn") { night = 1 - ss(0, 0.6, u); dawn = ss(0, 0.4, u) * (1 - ss(0.6, 1, u)); }   // 天慢慢亮、帶一點粉紫，最後回白天
  const [h0, h1] = HOURS[phase];
  return { frac, phase, u, night, dusk, dawn, hour: (h0 + (h1 - h0) * u) % 24 };
}

// 網址參數 → 固定在哪（一輪中的比例）；沒指定回 null
//   ?clock=day|dusk|night|dawn  ?clock=0.62（0–1）  舊的 ?night=1（＝半夜）／?night=0（＝正中午）；?clock 優先
export function parseClockQuery(search = "") {
  const m = /[?&]clock=([^&#]*)/.exec(search || "");
  if (m) {
    let v = ""; try { v = decodeURIComponent(m[1]).trim().toLowerCase(); } catch (e) {}
    if (Object.prototype.hasOwnProperty.call(PRESETS, v)) return PRESETS[v];
    if (/^(?:\d+\.?\d*|\.\d+)$/.test(v)) { const x = +v; if (x >= 0 && x <= 1) return wrap01(x); }
  }
  const n = /[?&]night=([01])/.exec(search || "");
  if (n) return n[1] === "1" ? PRESETS.night : PRESETS.day;
  return null;
}

function defaultStorage() { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } }
const defaultVisible = () => typeof document === "undefined" || !document.hidden;
const defaultSearch = () => { try { return typeof location !== "undefined" ? location.search : ""; } catch (e) { return ""; } };

// 讀存檔：壞掉（不是 JSON、t 不是數字…）就當新安裝，不丟例外
export function readSaved(storage, key = STORAGE_KEY) {
  try {
    const raw = storage && storage.getItem(key);
    if (raw == null || raw === "") return { ok: false, t: 0, at: null };
    const o = JSON.parse(raw), v = o && typeof o === "object" ? Number(o.t) : NaN;
    if (!Number.isFinite(v)) return { ok: false, t: 0, at: null };
    const a = Number(o.at);
    return { ok: true, t: ((v % CYCLE) + CYCLE) % CYCLE, at: Number.isFinite(a) ? a : null };
  } catch (e) { return { ok: false, t: 0, at: null }; }
}

// opts（全部可省略；測試時注入）：
//   now()：毫秒時間（預設 Date.now，要用牆上時間：別的分頁也開著時靠它對時）
//   storage：有 getItem／setItem 的物件（預設 localStorage；null＝不存）
//   visible()：頁面看得到嗎（預設 !document.hidden）
//   search：網址 query（預設 location.search）
//   maxStep：兩次 tick 之間最多算幾秒（預設 5；iPad 睡眠回來、卡住很久也不會一下跳好幾分鐘）
//   speed：時間倍速（預設 1，或網址 ?clockspeed=60；≠1 時不存檔，測試用）
export function createClock({ now = Date.now, storage = defaultStorage(), visible = defaultVisible, search = defaultSearch(), key = STORAGE_KEY, maxStep = 5, speed } = {}) {
  const fixed = parseClockQuery(search);
  const qs = /[?&]clockspeed=(\d+(?:\.\d+)?)/.exec(search || "");
  let spd = speed != null ? +speed : qs ? +qs[1] : 1;
  if (!Number.isFinite(spd) || spd <= 0) spd = 1;
  spd = Math.min(600, Math.max(0.1, spd));
  const frozen = fixed !== null;                        // 網址指定：固定不走
  const persist = !frozen && spd === 1;                 // 網址指定／倍速測試：不碰全家的時鐘存檔
  let t = frozen ? fixed * CYCLE : readSaved(storage, key).t;   // 一輪中的秒數 0–CYCLE
  let last = null;                                      // 上次 tick 的 now()；null＝下次 tick 只記時間不前進（剛開、剛從背景回來）
  const subs = [];
  let phase = sample(t / CYCLE).phase;
  const isVis = () => { try { return !!visible(); } catch (e) { return true; } };
  function save(n) { if (!persist || !storage) return; try { storage.setItem(key, JSON.stringify({ v: 1, t: Math.round(t * 1000) / 1000, at: n })); } catch (e) {} }
  function check() {
    const s = sample(t / CYCLE);
    if (s.phase !== phase) { const prev = phase; phase = s.phase; for (const cb of subs.slice()) { try { cb(s.phase, prev, s); } catch (e) {} } }
    return s;
  }
  function tick() {
    const n = +now();
    if (!isVis() || !Number.isFinite(n)) { last = null; return check(); }      // 看不到：不前進，回來時也不補算
    if (!frozen && last !== null) {
      let dt = (n - last) / 1000;
      if (!(dt > 0)) dt = 0; else if (dt > maxStep) dt = maxStep;
      if (persist) {                                    // 同一台機器另一個分頁也開著：接著它存的走，不重複算
        const s = readSaved(storage, key);
        if (s.ok) { t = s.t; if (s.at !== null && s.at > last && s.at <= n) dt = Math.min(dt, (n - s.at) / 1000); }
      }
      t = (t + dt * spd) % CYCLE;
      save(n);
    }
    last = n;
    return check();
  }
  // 直接設定：0–1 的比例，或 "day"|"dusk"|"night"|"dawn"
  function set(x) {
    const f = typeof x === "string" ? PRESETS[x.trim().toLowerCase()] : x;
    if (f == null || !Number.isFinite(+f)) return check();
    t = wrap01(f) * CYCLE; save(last !== null ? last : +now());
    return check();
  }
  function onPhase(cb) { if (typeof cb !== "function") return () => {}; subs.push(cb); return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; }
  return {
    tick, set, onPhase,
    get: () => sample(t / CYCLE),
    seconds: () => t,                                   // 一輪中的秒數（測試用）
    get frozen() { return frozen; }, get speed() { return spd; }, get persist() { return persist; },
  };
}
