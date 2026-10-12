// ===================== 注音小島：小島同樂廣場（全島合作目標）前端 =====================
// 規格 docs/zhuyin-plaza-spec.md；後端 tools/plaza/（Google Apps Script 網頁應用程式，網址＝tools/plaza/config.json 的 webAppUrl）。
// 玩法：每週一個主題（救援／送貨／釣魚／讀字／收集），全島大家的成果加總成一條進度條（銅／銀／金三段）；加油貼紙牆（四種固定貼紙）。
// 隱私（米卡莎審過、阿葉 10-11 拍板）：送出去的只有 {w 週次, k 種類, n 數量}——沒有名字、存檔名、裝置代號、個人成績；
//   fetch 一律 credentials:"omit"、referrerPolicy:"no-referrer"。讀取＝全島加總（公開、匿名）。家長頁可關（zy_plaza_on＝0：完全不送也不讀）。
// 本機存（localStorage，全家共用，鍵名都是 zy_plaza_*）：
//   zy_plaza_on       家長開關（預設 1）
//   zy_plaza_cache    上次讀到的資料 { d: 後端回應, at: 本機時間, off: 伺服器時間－本機時間（校正 iPad 時鐘）}
//   zy_plaza_pending  還沒送出的貢獻 { 週次: { rescue, deliver, fish, read, star, play, cheer1..4 } }（主題還不知道時五種都先記，送的時候只送本週主題那種）
//   zy_plaza_cheer    今天送了幾張加油貼紙 { d: 台北日期, n }（每台每天最多 3 張，前端限制）
//   zy_plaza_mine     這週每位小朋友自己幫了多少 { w, s: { 存檔位: { rescue… } } }（只在本機：「你這週幫忙了 N」）
//   zy_plaza_seen     看過什麼 { w, key, intro（貓頭鷹介紹過本週主題）, lv（宣布過第幾段）, total（上次顯示的數字，下次從這裡滾）, cw／clv（打開廣場看過的週／段 → 🎪 小紅標）}
//   zy_plaza_hist     以前每週的結果 [{ w, key, lv, total, mine }]（最多 12 週，只在本機）
//   zy_plaza_lock     送出中（同一台開兩個分頁時不要重複送）
//   zy_plaza_inflight 已經從待送拿出來、送出去但還沒確定送到的那幾筆 [{ i, w, k, n, src }]（10-12 里維建議 1：防重複計數）
// 送出：貢獻先累加在 pending；結算時、送加油貼紙、每 30 秒合併送一次（fetch keepalive、text/plain 不觸發 CORS 預檢）；失敗就留著下次再送；
//   每一筆送出前先記進 inflight、帶一個隨機代號 i（10 碼小寫英數，每筆新產生、不是裝置代號）；沒收到回應（逾時、斷線、500…）就留著，
//   下次用「同一個 i、同樣的 w/k/n」重送——後端 6 小時內看過這個 i 就只回 ok 不再加（回應掉了也不會算兩次）。收到 ok 才刪。
//   換週後上週的只在週一 00:00 後 9 分鐘內送（後端寬限 10 分鐘），過了就丟。週次以後端回應的 now 校正 iPad 時鐘。
// 測試／本機開發（127.0.0.1、localhost、自動化瀏覽器 navigator.webdriver）預設不連線（不灌正式後端）；網址加 ?plaza=on 才連（tools/zy-test/plaza.js 用 page.route 攔截）、?plaza=off 整個關掉。

export const PLAZA_URL = "https://script.google.com/macros/s/AKfycbxhCOnt4XBkdl7zkXbF6gH8jrl7Yx1U7I_xPNy9ByGkIc8u6BQG0jE2ZBNCqEVB3R5qtg/exec";
const TZ = 8 * 3600e3, DAY = 864e5, WEEK = 7 * DAY, GRACE = 9 * 60e3;   // 後端換週寬限 10 分鐘：前端留 1 分鐘餘裕
export const N_MAX = { goal: 10, play: 10, cheer1: 3, cheer2: 3, cheer3: 3, cheer4: 3 };   // 後端一次最多收多少（tools/plaza/gas/Code.js PLAZA.N_MAX；goal 10-12 里維建議 30 → 10）
export const KINDS = ["rescue", "deliver", "fish", "read", "star"];
const DROP = new Set(["bad_body", "bad_json", "bad_kind", "bad_n", "bad_week"]);   // 這幾種錯＝資料本身不對：丟掉不重送；其他（rate／busy／paused／server／連不上）留著下次送
// 主題的字一律用這裡的（才有注音；試算表「主題表」改的標題只影響試算表）。目標數字用後端的。
export const THEMES = {
  rescue:  { ico: "🐧", title: "救援週", unit: "隻", desc: "去泡泡救援灣救動物", lead: "大家一起救出" },
  deliver: { ico: "🚚", title: "送貨週", unit: "件", desc: "去彩虹配送站送貨", lead: "大家一起送出" },
  fish:    { ico: "🐟", title: "釣魚週", unit: "條", desc: "去釣魚池釣魚", lead: "大家一起釣到" },
  read:    { ico: "📖", title: "讀字週", unit: "題", desc: "每個遊戲答對都算", lead: "大家一起答對" },
  star:    { ico: "⭐", title: "收集週", unit: "顆", desc: "玩遊戲拿星星", lead: "大家一起拿到" },
};
// 三段目標：圖示＝達成時小島上會出現的慶祝（氣球／煙火／獎盃），不用 🥉🥈🥇（上面印著 3／2／1，像名次；這裡沒有排行）
export const MEDALS = [null, { ico: "🎈", name: "銅牌" }, { ico: "🎆", name: "銀牌" }, { ico: "🏆", name: "金牌" }];
export const CHEERS = [{ e: "👋", t: "我來玩了！" }, { e: "💪", t: "一起加油！" }, { e: "🐧", t: "我救到動物了！" }, { e: "🎉", t: "這關好好玩！" }];   // 順序＝後端 cheer1..4
export const CHEER_DAY = 3;
// 台詞（tools/voice/build_lines.py「10-12 同樂廣場」區塊會逐句核對這裡的字）
export const LINES = {
  intro: {
    rescue: "這個禮拜是救援週！大家一起去泡泡救援灣救動物！",
    deliver: "這個禮拜是送貨週！大家一起去彩虹配送站送貨！",
    fish: "這個禮拜是釣魚週！大家一起來釣魚！",
    read: "這個禮拜是讀字週！每個遊戲答對都算喔！",
    star: "這個禮拜是收集週！大家一起拿星星！",
  },
  reached: ["", "大家一起做到了！拿到銅牌，小島飄起彩色氣球囉！", "大家一起做到了！拿到銀牌，小島放煙火囉！", "大家一起做到了！拿到金牌，小島中間有金色獎盃喔！"],
  // 貓頭鷹對話框顯示的短版（對話框一句話約兩行；唸的是上面的完整句）
  introText: { rescue: "這個禮拜是救援週！", deliver: "這個禮拜是送貨週！", fish: "這個禮拜是釣魚週！", read: "這個禮拜是讀字週！", star: "這個禮拜是收集週！" },
  reachedText: ["", "大家一起做到了！拿到銅牌！", "大家一起做到了！拿到銀牌！", "大家一起做到了！拿到金牌！"],
  welcome: "歡迎來到同樂廣場！",
  armed: "再按一次，就送出貼紙喔！",
  sent: "貼紙送出去了！大家都看得到喔！",
  used: "今天的貼紙送完了，明天再來送！",
  offline: "連不上，等一下再看！",
  paused: "廣場在休息，等一下再來！",
};

// ---------- 純邏輯（跟後端 tools/plaza/gas/Code.js 同一套算法；tools/zy-test/plaza.js 直接測）----------
const pad = n => (n < 10 ? "0" : "") + n;
const ymd = ms => { const d = new Date(ms); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); };
const ymdMs = s => { const p = String(s).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
/** 任一時間點（毫秒）→ 台北時間那週週一的 'YYYY-MM-DD'（週一 00:00 換週） */
export function weekKeyOf(ms) { const d = new Date(ms + TZ); const back = (d.getUTCDay() + 6) % 7; return ymd(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)); }
/** 週次 → 那週週一台北 00:00 的真實毫秒 */
export const weekStartMs = wk => ymdMs(wk) - TZ;
export const addWeeks = (wk, k) => ymd(ymdMs(wk) + k * WEEK);
/** 台北日期 'YYYY-MM-DD'（每日貼紙上限用） */
export const dayKeyOf = ms => ymd(ms + TZ);
export function levelOf(total, goals) { let lv = 0; for (let i = 0; i < 3; i++) if (goals[i] > 0 && total >= goals[i]) lv = i + 1; return lv; }
/** 這週的待送貢獻 → 一筆一筆的送出 {w, k, n, src}（n 不超過後端上限；key＝這週主題，不知道就先不送主題貢獻） */
export function splitPosts(w, c, key) {
  const out = [], push = (k, src, n) => { n = Math.floor(n) || 0; while (n > 0) { const m = Math.min(N_MAX[k], n); out.push({ w, k, n: m, src }); n -= m; } };
  if (key && c[key] > 0) push("goal", key, c[key]);
  if (c.play > 0) push("play", "play", c.play);
  for (let i = 1; i <= 4; i++) if (c["cheer" + i] > 0) push("cheer" + i, "cheer" + i, c["cheer" + i]);
  return out;
}
/** 後端 GET 回應長得對不對（不對就當沒讀到） */
export function validData(d) {
  if (!d || d.ok !== true || typeof d.w !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.w)) return false;
  const okTheme = t => !!t && Object.prototype.hasOwnProperty.call(THEMES, t.key) && Array.isArray(t.goals) && t.goals.length === 3 && t.goals.every(g => Number.isFinite(g) && g > 0);
  const okLv = v => Number.isInteger(v) && v >= 0 && v <= 3;   // 第幾段：0 還沒／1 銅／2 銀／3 金（MEDALS[v] 直接拿來用，超出範圍＝壞資料）
  if (!okTheme(d.theme) || !Number.isFinite(d.total) || d.total < 0 || !Array.isArray(d.cheers) || d.cheers.length !== 4 || !okLv(d.reached)) return false;
  if (d.prev != null && (typeof d.prev !== "object" || typeof d.prev.w !== "string" || !okTheme(d.prev.theme) || !Number.isFinite(d.prev.total) || !okLv(d.prev.reached))) return false;
  return true;
}

// ---------- 主體 ----------
// api：root（#plaza 覆蓋層）、say／talk／queue（語音：say＝一定唸、talk＝說明語音開關管、queue＝排在目前這句後面）、play（音效）、
//      slot()（目前存檔位）、onMenu()（現在在小島選單上嗎）、onUpdate(info)（讀到新資料／開關改變：zhuyin.js 更新 🎪 小紅標、小島慶祝、貓頭鷹）
export function createPlaza(api) {
  const A = { root: null, say() {}, talk() {}, queue() {}, play() {}, slot: () => 1, onMenu: () => false, onUpdate() {}, onClose() {}, ...api };
  const q = location.search;
  const devHost = /^(127\.0\.0\.1|localhost|\[::1\]|)$/.test(location.hostname) || location.protocol === "file:" || navigator.webdriver === true;
  const netOK = /[?&]plaza=on\b/.test(q) || !devHost;   // 測試／本機開發不連正式後端
  const forceOff = /[?&]plaza=off\b/.test(q);
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const del = k => { try { localStorage.removeItem(k); } catch (e) {} };
  const S = { tab: Math.random().toString(36).slice(2), busy: false, getting: null, lastGet: 0, getFail: 0, getBack: 0, failN: 0, back: 0, err: false,
    round: {}, floor: {}, ui: null, open: false, armed: -1, armT: 0, hinted: false, shown: 0, rollRaf: 0, flushT: 0, posts: 0, gets: 0 };

  const isOn = () => !forceOff && get("zy_plaza_on", 1) !== 0;
  const cache = () => { const c = get("zy_plaza_cache", null); return c && validData(c.d) ? c : null; };
  const now = () => { const c = get("zy_plaza_cache", null); return Date.now() + (c && Number.isFinite(c.off) && Math.abs(c.off) < 400 * DAY ? c.off : 0); };
  const curWeek = () => weekKeyOf(now());
  const curData = () => { const c = cache(); return c && c.d.w === curWeek() ? c.d : null; };
  const themeOf = w => { const c = cache(); if (!c) return null; if (c.d.w === w) return c.d.theme.key; if (c.d.prev && c.d.prev.w === w) return c.d.prev.theme.key; return null; };
  const pend = () => { const p = get("zy_plaza_pending", {}); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; };
  // 送出中（還沒確定送到）的那幾筆：壞掉的（格式不對、數量超過上限）直接丟；最多留 20 筆
  const ID_RE = /^[a-z0-9]{6,16}$/;
  const okJob = j => !!j && typeof j === "object" && typeof j.i === "string" && ID_RE.test(j.i) && typeof j.w === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.w)
    && Object.prototype.hasOwnProperty.call(N_MAX, j.k) && Number.isInteger(j.n) && j.n >= 1 && j.n <= N_MAX[j.k] && typeof j.src === "string";
  const infl = () => { const a = get("zy_plaza_inflight", []); return Array.isArray(a) ? a.filter(okJob).slice(0, 20) : []; };
  const inflAdd = j => set("zy_plaza_inflight", [...infl().filter(x => x.i !== j.i), j]);
  const inflDel = i => { const a = infl().filter(x => x.i !== i); if (a.length) set("zy_plaza_inflight", a); else del("zy_plaza_inflight"); };
  // 每一筆送出的隨機代號：10 碼小寫英數（後端 PLAZA.ID_RE）；每筆新產生，不是裝置代號
  function newId() {
    const AB = "abcdefghijklmnopqrstuvwxyz0123456789", r = new Uint8Array(10);
    try { crypto.getRandomValues(r); } catch (e) { for (let k = 0; k < 10; k++) r[k] = Math.floor(Math.random() * 256); }
    let s = ""; for (const b of r) s += AB[b % 36]; return s;
  }
  const hist = () => { const h = get("zy_plaza_hist", []); return Array.isArray(h) ? h.filter(x => x && typeof x === "object") : []; };   // 壞掉（不是陣列）就當沒有（里維建議 6）
  // 這一週的待送還要不要：本週要；上週只在換週後 9 分鐘內要（後端寬限）；其他（更早、或 iPad 時鐘跑太快記到「下週」）丟掉
  const keepWeek = w => { const cw = curWeek(); return w === cw || (w === addWeeks(cw, -1) && now() - weekStartMs(cw) < GRACE); };
  function tidy(p) {
    for (const w of Object.keys(p)) {
      const c = p[w]; if (!keepWeek(w) || !c || typeof c !== "object") { delete p[w]; continue; }
      for (const k of Object.keys(c)) if (!(c[k] > 0)) delete c[k];
      if (!Object.keys(c).length) delete p[w];
    }
    return p;
  }

  // ----- 記貢獻（zhuyin.js 的事件掛勾呼叫）-----
  function mineStore(w) {
    let m = get("zy_plaza_mine", null);
    if (!m || typeof m !== "object" || m.w !== w || !m.s || typeof m.s !== "object") { if (m && m.w && m.s && m.w < w) noteHist(m.w, { mine: m.s }); m = { w, s: {} }; }
    return m;
  }
  function add(kind, n = 1) {
    if (!isOn()) return;
    n = Math.floor(+n) || 0;
    if (n <= 0 || !(KINDS.includes(kind) || kind === "play" || /^cheer[1-4]$/.test(kind))) return;
    const w = curWeek(), key = themeOf(w);
    if (!(KINDS.includes(kind) && key && kind !== key)) {   // 已經知道這週主題：別的種類不用記進待送（只記在自己的貢獻）
      const p = tidy(pend()), c = p[w] || (p[w] = {});
      c[kind] = Math.min(99999, (c[kind] || 0) + n); set("zy_plaza_pending", p);
    }
    if (KINDS.includes(kind)) {
      S.round[kind] = (S.round[kind] || 0) + n;
      const m = mineStore(w), s = String(A.slot()), me = m.s[s] || (m.s[s] = {});
      me[kind] = (me[kind] || 0) + n; set("zy_plaza_mine", m);
    }
    if (S.open) render(false);
  }
  const roundStart = () => { S.round = {}; };
  // 這一局幫了多少（結算小字「＋3 已經算進大家的進度囉！」）：本週主題那種；主題還不知道（從來沒連上過）＝不顯示
  function roundGain() { if (!isOn()) return null; const key = themeOf(curWeek()); if (!key) return null; const n = S.round[key] || 0; return n > 0 ? { n, key, unit: THEMES[key].unit } : null; }
  const mineNow = (key, w = curWeek()) => { const m = get("zy_plaza_mine", null); const me = m && m.w === w && m.s ? m.s[String(A.slot())] : null; return me && key ? me[key] || 0 : 0; };

  // ----- 送出 -----
  function lock() { const l = get("zy_plaza_lock", null); if (l && l.id !== S.tab && Date.now() - l.t < 25000) return false; set("zy_plaza_lock", { id: S.tab, t: Date.now() }); return true; }
  function unlock() { const l = get("zy_plaza_lock", null); if (l && l.id === S.tab) del("zy_plaza_lock"); }
  async function req(o) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null, tm = ctl ? setTimeout(() => ctl.abort(), 12000) : 0;
    try {
      const res = await fetch(PLAZA_URL, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", ...(ctl ? { signal: ctl.signal } : {}), ...o });
      if (!res.ok) return null;
      const js = await res.json(); return js && typeof js === "object" ? js : null;
    } catch (e) { return null; } finally { clearTimeout(tm); }
  }
  function sub(j) {   // 送成功（或確定不用送）：從待送扣掉這一筆（送的時候新加的貢獻留著）
    const p = pend(), c = p[j.w]; if (!c) return;
    c[j.src] = Math.max(0, (c[j.src] || 0) - j.n); set("zy_plaza_pending", tidy(p));
  }
  function failSend() { S.failN++; S.back = Date.now() + Math.min(600e3, 15e3 * 2 ** (S.failN - 1)); }   // 15 秒、30 秒、1 分…最多 10 分鐘
  const send = j => req({ method: "POST", body: JSON.stringify({ w: j.w, k: j.k, n: j.n, i: j.i }), headers: { "Content-Type": "text/plain;charset=utf-8" }, keepalive: true });
  async function flush() {
    if (S.busy) { S.again = true; return false; }   // 正在送：送完再跑一次（送的時候新加的）
    if (!isOn() || !netOK || Date.now() < S.back) return false;
    if (!Object.keys(tidy(pend())).length && !infl().length) { set("zy_plaza_pending", {}); return true; }
    if (!lock()) return false;
    S.busy = true;
    try {
      const d0 = curData(); if (d0 && d0.paused) { failSend(); return false; }   // 緊急暫停中：先留著
      // 1. 先把上次沒確定送到的重送（同一個 i：後端看過就只回 ok 不再加）
      for (const j of infl()) {
        if (!isOn()) return false;
        if (!keepWeek(j.w)) { inflDel(j.i); continue; }  // 過了寬限的上週：丟掉
        S.posts++;
        const r = await send(j);
        if (r && (r.ok === true || DROP.has(r.why))) { inflDel(j.i); continue; }
        failSend(); return false;
      }
      // 2. 待送的貢獻：合併、分批，每筆先記進送出中（帶新的 i）再從待送扣掉，然後送
      let p = tidy(pend());
      if (Object.keys(p).some(w => !themeOf(w) && KINDS.some(k => p[w][k] > 0))) { await refresh(true); p = tidy(pend()); }   // 還不知道主題：先讀一次
      const d = curData(); if (d && d.paused) { failSend(); return false; }   // 緊急暫停中：先留著
      const jobs = [];
      for (const w of Object.keys(p)) {
        const key = themeOf(w), c = p[w];
        if (key) for (const k of KINDS) if (k !== key) delete c[k];   // 知道主題了：別的種類用不到
        jobs.push(...splitPosts(w, c, key));
      }
      set("zy_plaza_pending", tidy(p));
      for (const j of jobs) {
        if (!isOn()) return false;
        if (!keepWeek(j.w)) { sub(j); continue; }        // 送到一半過了寬限：上週的丟掉
        const f = { i: newId(), w: j.w, k: j.k, n: j.n, src: j.src };
        inflAdd(f); sub(j);                              // 送出前就搬進「送出中」：回應沒收到、或送到一半關掉分頁，下次都用同一個 i 重送
        S.posts++;
        const r = await send(f);
        if (r && (r.ok === true || DROP.has(r.why))) { inflDel(f.i); continue; }
        failSend(); return false;                        // 留在送出中（rate／busy／paused／server／連不上都一樣：下次同一個 i 再送）
      }
      S.failN = 0; return true;
    } finally { S.busy = false; unlock(); if (S.again) { S.again = false; setTimeout(() => { flush(); }, 300); } }
  }
  function flushSoon(ms = 1500) { clearTimeout(S.flushT); S.flushT = setTimeout(() => { flush(); }, ms); }

  // ----- 讀取 -----
  function refresh(force) {
    if (!isOn() || !netOK) return Promise.resolve(null);
    if (S.getting) return S.getting;
    const t = Date.now(), d0 = curData();
    if (d0 && t - S.lastGet < 30000 && !force) return Promise.resolve(d0);   // 後端快取 30 秒：太常讀也沒有新數字
    if (t < S.getBack && !(force && t - S.lastTry > 8000)) return Promise.resolve(d0);   // 連不上時退避（家長／小孩主動打開廣場可以早點再試）
    S.lastTry = t; S.gets++;
    S.getting = (async () => {
      const d = await req({ method: "GET" });
      S.getting = null;
      if (!isOn()) return null;
      if (!validData(d)) { S.err = true; S.getFail++; S.getBack = Date.now() + Math.min(300e3, 20e3 * 2 ** (S.getFail - 1)); update(); return null; }
      S.err = false; S.getFail = 0; S.getBack = 0; S.lastGet = Date.now();
      set("zy_plaza_cache", { d, at: Date.now(), off: Number.isFinite(d.now) && d.now > 0 ? d.now - Date.now() : 0 });
      seenFor(d);
      update(); return d;
    })();
    return S.getting;
  }
  function update() { try { A.onUpdate(info()); } catch (e) { console.warn("[plaza]", e); } if (S.open) render(false); }

  // ----- 看過什麼／以前的週 -----
  function noteHist(w, o) {
    const list = hist();
    let e = list.find(x => x && x.w === w); if (!e) { e = { w }; list.push(e); }
    Object.assign(e, o); list.sort((a, b) => (a.w < b.w ? 1 : -1)); set("zy_plaza_hist", list.slice(0, 12));
  }
  function seenFor(d) {   // 這週的「看過」紀錄；換週時把上週結果記進 hist
    const s = get("zy_plaza_seen", null) || {};
    if (s.w === d.w) return s;
    if (s.w) { const pv = d.prev && d.prev.w === s.w ? d.prev : null; noteHist(s.w, pv ? { key: pv.theme.key, lv: pv.reached || 0, total: pv.total } : { key: s.key, lv: s.lv || 0, total: s.total || 0 }); }
    const n = { w: d.w, key: d.theme.key, intro: 0, lv: 0, total: 0, cw: s.cw || "", clv: 0 };
    set("zy_plaza_seen", n); return n;
  }
  // 貓頭鷹要說的新消息（換週介紹主題、第一次看到新的一段）；拿了就算說過
  function takeNews() {
    const d = curData(); if (!isOn() || !d) return [];
    const s = seenFor(d), out = [];
    if (!s.intro) { out.push({ kind: "intro", key: d.theme.key, line: LINES.intro[d.theme.key], text: LINES.introText[d.theme.key] }); s.intro = 1; }
    const lv = Math.max(0, Math.min(3, d.reached | 0));
    if (lv > (s.lv || 0)) { out.push({ kind: "level", lv, line: LINES.reached[lv], text: LINES.reachedText[lv] }); s.lv = lv; }
    if (out.length) set("zy_plaza_seen", s);
    return out;
  }
  // 給 zhuyin.js：小島要掛第幾段的裝飾、🎪 要不要小紅標
  function info() {
    const d = curData(), s = get("zy_plaza_seen", null) || {};
    return { on: isOn(), net: netOK, w: d ? d.w : curWeek(), key: d ? d.theme.key : null, lv: d ? Math.max(0, Math.min(3, d.reached | 0)) : 0,
      badge: !!(d && isOn() && (s.cw !== d.w || (s.clv || 0) < (d.reached | 0))), err: S.err, paused: !!(d && d.paused) };
  }

  // ----- 畫面（全畫面卡片）-----
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function build() {
    const R = A.root; R.innerHTML = "";
    const card = el("div", "dialog plaza-card"); card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "小島同樂廣場");
    const head = el("div", "pz-head"); head.appendChild(el("div", "pz-title", "🎪 小島同樂廣場"));
    const close = el("button", "big-btn alt small pz-close", "↩️ 回去"); close.onclick = () => { A.play("select"); hide(); }; head.appendChild(close);
    const body = el("div", "pz-body");
    // 左：本週主題＋進度條＋數字
    const goal = el("div", "pz-goal");
    const th = el("div", "pz-theme"); const ico = el("div", "pz-ico"); const tt = el("div", "pz-tt"); const name = el("div", "pz-name"); const desc = el("div", "pz-desc");
    tt.append(name, desc); th.append(ico, tt);
    const bar = el("div", "pz-bar"), track = el("div", "pz-track"), fill = el("div", "pz-fill"); track.appendChild(fill); bar.appendChild(track);
    const marks = [1, 2, 3].map(i => { const m = el("div", "pz-mark m" + i); m.appendChild(el("div", "pz-medal", MEDALS[i].ico)); m.appendChild(el("div", "pz-gnum", "")); bar.appendChild(m); return m; });
    const count = el("div", "pz-count"), lead = el("span", "pz-lead"), nu = el("span", "pz-nu"), num = el("b", "pz-num", "0"), unit = el("span", "pz-unit"); nu.append(num, unit); count.append(lead, nu);   // 數字跟單位黏在一起（換行也不會把「隻」單獨掉到下一行）
    const next = el("div", "pz-next"), msg = el("div", "pz-msg hidden");
    const mine = el("div", "pz-chip pz-mine"), plays = el("div", "pz-chip pz-plays"), prev = el("div", "pz-chip pz-prev hidden");   // 你這週幫忙了多少／這週大家玩了幾次／上週結果
    goal.append(th, bar, count, next, mine, prev, msg);
    // 右：加油貼紙牆（上面軟木板＝大家貼上去的貼紙；下面四張＝點一下聽、再按一次送出，右邊是這週大家送了幾張）
    const cheer = el("div", "pz-cheer");
    const board = el("div", "pz-board"), pins = el("div", "pz-pins"); board.appendChild(el("div", "pz-ct", "加油貼紙牆")); board.appendChild(pins); cheer.appendChild(board);
    const send = el("div", "pz-send"), cnt = [], stk = CHEERS.map((c, i) => {
      const b = el("button", "pz-stk"); b.appendChild(el("span", "pz-se", c.e)); b.appendChild(el("span", "pz-st", c.t));
      const n = el("b", "pz-pn", "×0"); cnt.push(n); b.appendChild(n); b.appendChild(el("span", "pz-go", "再按一次送出"));
      b.setAttribute("aria-label", c.t); b.onclick = () => tapCheer(i); send.appendChild(b); return b;
    });
    cheer.appendChild(send);
    const left = el("div", "pz-left"); cheer.append(left, plays);
    body.append(goal, cheer); card.append(head, body); R.appendChild(card);
    R.onclick = e => { if (e.target === R) { A.play("select"); hide(); } };   // 點卡片外面＝關
    S.ui = { card, ico, name, desc, fill, marks, lead, num, unit, next, mine, plays, msg, prev, cnt, stk, left, pins, pinN: -1 };
  }
  // 軟木板上的小貼紙：照這週大家送的數量撒（最多 16 張，位置照編號算＝每次打開都一樣），剛送的那張飛上來
  function pinSpot(k) { const r = (k * 9301 + 49297) % 233280 / 233280, s = (k * 7 + 3) % 16; return { x: 38 + (s % 8) * 7.6 + r * 3, y: 12 + Math.floor(s / 8) * 42 + ((k * 13) % 5) * 5, rot: ((k * 37) % 41) - 20 }; }
  function drawPins(cheers) {
    const U = S.ui, tot = cheers.reduce((a, b) => a + b, 0), n = Math.min(16, tot);
    if (n === U.pinN) return; U.pinN = n; U.pins.innerHTML = "";
    const per = cheers.map(c => (tot ? Math.round(c / tot * n) : 0)); let k = 0;
    per.forEach((m, i) => { for (let j = 0; j < m && k < 16; j++, k++) { const s = pinSpot(k), e = el("i", "pz-pin", CHEERS[i].e); e.style.left = s.x + "%"; e.style.top = s.y + "%"; e.style.rotate = s.rot + "deg"; U.pins.appendChild(e); } });
  }
  // 顯示用的數字：後端加總＋這台還沒送出的（數字只會變大：剛送出、後端快取還沒更新的那 30 秒不會倒退）
  function view() {
    const d = curData(), cw = curWeek(), p = { ...(pend()[cw] || {}) }, key = d ? d.theme.key : null;
    for (const j of infl()) if (j.w === cw) p[j.src] = (p[j.src] || 0) + j.n;   // 送出中（還沒確定送到）的也算進顯示的數字
    const fl = S.floor[cw] || (S.floor[cw] = { total: 0, plays: 0, cheers: [0, 0, 0, 0] });
    if (!d) return { d: null, key: null, cw };
    fl.total = Math.max(fl.total, d.total + (p[key] || 0));
    fl.plays = Math.max(fl.plays, (Number.isFinite(d.plays) ? d.plays : 0) + (p.play || 0));
    fl.cheers = fl.cheers.map((v, i) => Math.max(v, (d.cheers[i] | 0) + (p["cheer" + (i + 1)] || 0)));
    return { d, key, cw, total: fl.total, plays: fl.plays, cheers: fl.cheers, goals: d.theme.goals };
  }
  const cheerUsed = () => { const c = get("zy_plaza_cheer", null); return c && c.d === dayKeyOf(now()) ? Math.max(0, c.n | 0) : 0; };
  const cheerLeft = () => Math.max(0, CHEER_DAY - cheerUsed());
  function rollTo(to) {
    const U = S.ui, from = S.shown; cancelAnimationFrame(S.rollRaf);
    if (from === to) { U.num.textContent = String(to); return; }
    const t0 = performance.now(), dur = Math.min(1400, 500 + Math.abs(to - from) * 8);
    const step = t => { const u = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - u, 3), v = Math.round(from + (to - from) * e); U.num.textContent = String(v); S.shown = v; if (u < 1) S.rollRaf = requestAnimationFrame(step); };
    S.rollRaf = requestAnimationFrame(step);
  }
  function render(first) {
    if (!S.ui) return;
    const U = S.ui, v = view(), d = v.d;
    U.card.classList.toggle("nodata", !d);
    if (!d) {   // 還沒讀到這週的資料：連不上／讀取中
      const loading = !!S.getting && !S.err;
      U.ico.textContent = loading ? "⏳" : "☁️"; U.name.textContent = loading ? "讀取中…" : "連不上"; U.desc.textContent = loading ? "" : "等一下再看大家的進度";
      U.msg.classList.add("hidden");
      U.lead.textContent = ""; U.num.textContent = ""; U.unit.textContent = ""; U.next.textContent = ""; U.mine.textContent = ""; U.plays.textContent = ""; U.prev.classList.add("hidden");
      U.fill.style.width = "0%"; U.marks.forEach(m => m.classList.remove("on"));
      U.cnt.forEach(n => { n.textContent = "×0"; }); drawPins([0, 0, 0, 0]);
      renderLeft(); return;
    }
    const T = THEMES[v.key], g = v.goals, top = g[2];
    U.ico.textContent = T.ico; U.name.textContent = T.title; U.desc.textContent = T.desc;
    U.marks.forEach((m, i) => { m.style.left = (g[i] / top * 100).toFixed(2) + "%"; m.querySelector(".pz-gnum").textContent = String(g[i]); m.classList.toggle("on", v.total >= g[i]); });
    const seen = get("zy_plaza_seen", null) || {};
    if (first) {   // 打開：數字從上次看到的地方滾到現在（進度條一起長）
      S.shown = seen.w === v.cw ? Math.min(v.total, seen.total | 0) : 0;
      U.fill.style.transition = "none"; U.fill.style.width = (Math.min(1, S.shown / top) * 100).toFixed(2) + "%"; void U.fill.offsetWidth; U.fill.style.transition = "";
      U.num.textContent = String(S.shown);
    }
    U.lead.textContent = T.lead; U.unit.textContent = T.unit;
    rollTo(v.total);
    U.fill.style.width = (Math.min(1, v.total / top) * 100).toFixed(2) + "%";
    const lv = levelOf(v.total, g);
    U.card.classList.toggle("gold", lv >= 3);
    if (lv >= 3) U.next.replaceChildren(el("span", "", "拿到金牌了！大家好厲害！"));
    else U.next.replaceChildren(el("span", "", "再"), el("b", "pz-n", String(g[lv] - v.total)), el("span", "", T.unit + "就拿到" + MEDALS[lv + 1].name + "！"));
    const my = mineNow(v.key);
    if (my > 0) U.mine.replaceChildren(el("span", "", "你這週幫忙了"), el("b", "pz-n", String(my)), el("span", "", T.unit));
    else U.mine.replaceChildren(el("span", "", "你也來幫忙吧！"));
    U.plays.replaceChildren(el("span", "", "這週大家玩了"), el("b", "pz-n", String(v.plays)), el("span", "", "次"));
    const note = d.paused ? "廣場在休息，等一下再來" : S.err ? "連不上，等一下再看" : "";
    U.msg.classList.toggle("hidden", !note); U.msg.textContent = note;
    // 上週結果（後端 prev）＋你上週幫了多少（本機）
    const pv = d.prev;
    if (pv && THEMES[pv.theme.key]) {
      const PT = THEMES[pv.theme.key], h = hist().find(x => x.w === pv.w), hm = h && h.mine && typeof h.mine === "object" ? h.mine[String(A.slot())] : null, pm = hm && typeof hm === "object" ? Math.max(0, Math.floor(+hm[pv.theme.key]) || 0) : 0;
        const kids = [el("span", "", "上週" + PT.title + "：")];
      if (pv.reached > 0) kids.push(el("span", "", "大家拿到" + MEDALS[pv.reached].name + "！" + MEDALS[pv.reached].ico));
      else kids.push(el("span", "", "大家一共"), el("b", "pz-n", String(pv.total)), el("span", "", PT.unit + "，差一點點！"));
      if (pm > 0) kids.push(el("span", "", "你幫了"), el("b", "pz-n", String(pm)), el("span", "", PT.unit));
      U.prev.replaceChildren(...kids); U.prev.classList.remove("hidden");
    } else U.prev.classList.add("hidden");
    U.cnt.forEach((n, i) => { const t = "×" + v.cheers[i]; if (n.textContent !== t) { n.textContent = t; if (!first) bump(n); } });
    drawPins(v.cheers);
    renderLeft();
  }
  function renderLeft() {
    const U = S.ui, left = cheerLeft(), dots = el("span", "pz-dots");
    for (let i = 0; i < CHEER_DAY; i++) dots.appendChild(el("i", i < left ? "on" : ""));
    U.left.replaceChildren(...(left > 0 ? [el("span", "", "今天還可以送"), dots] : [el("span", "", "今天送完了，明天再來送！")]));
    U.card.classList.toggle("used", left <= 0);
    U.stk.forEach((b, i) => b.classList.toggle("armed", i === S.armed && Date.now() - S.armT < 6000));
  }
  function bump(e) { e.classList.remove("pop"); void e.offsetWidth; e.classList.add("pop"); }
  // 加油貼紙：點一下＝聽內容；6 秒內再按一次＝送出（飛上牆、計數＋1）；每台每天 3 張
  function tapCheer(i) {
    const U = S.ui, b = U.stk[i];
    if (cheerLeft() <= 0) { A.play("ng"); A.talk(LINES.used); bump(U.left); return; }
    if (S.armed !== i || Date.now() - S.armT > 6000) {
      S.armed = i; S.armT = Date.now(); A.play("tap"); A.say(CHEERS[i].t);
      if (!S.hinted) { S.hinted = true; A.queue(LINES.armed); }
      renderLeft(); setTimeout(() => { if (S.armed === i && Date.now() - S.armT >= 6000) { S.armed = -1; if (S.ui) renderLeft(); } }, 6100);
      return;
    }
    S.armed = -1;
    const c = get("zy_plaza_cheer", null), day = dayKeyOf(now());
    set("zy_plaza_cheer", { d: day, n: (c && c.d === day ? c.n | 0 : 0) + 1 });
    const n0 = U.pinN; add("cheer" + (i + 1), 1); if (!S.open) render(false);
    const pin = U.pinN > n0 ? [...U.pins.children].reverse().find(x => x.textContent === CHEERS[i].e) || null : null;   // 軟木板上多出來的那張：先藏著，飛到了才出現
    A.play("sticker"); fly(b, U.pins, pin);
    if (cheerLeft() > 0) A.talk(LINES.sent); else A.queue(LINES.used);
    renderLeft(); flushSoon(1200);
  }
  function fly(from, board, pin) {
    const done = () => { if (pin) { pin.style.visibility = ""; bump(pin); } else bump(board); };
    try {
      const se = from.querySelector(".pz-se"), a = se.getBoundingClientRect(), R = A.root.getBoundingClientRect();
      let tx, ty, sc = 0.45;
      if (pin) { pin.style.visibility = "hidden"; const z = pin.getBoundingClientRect(); tx = z.left + z.width / 2; ty = z.top + z.height / 2; sc = Math.max(0.2, z.height / a.height); }
      else { const z = board.getBoundingClientRect(), s = pinSpot(Math.floor(Math.random() * 16)); tx = z.left + z.width * s.x / 100; ty = z.top + z.height * s.y / 100; }
      const f = el("div", "pz-fly", se.textContent); A.root.appendChild(f);
      f.style.left = (a.left - R.left) + "px"; f.style.top = (a.top - R.top) + "px"; f.style.width = a.width + "px"; f.style.height = a.height + "px";
      const dx = tx - (a.left + a.width / 2), dy = ty - (a.top + a.height / 2);
      const an = f.animate([{ transform: "translate(0,0) scale(1) rotate(0deg)" }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.5) rotate(-12deg)`, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotate(8deg)` }], { duration: 650, easing: "ease-in-out", fill: "forwards" });
      const end = () => { if (!f.isConnected) return; f.remove(); done(); };
      an.onfinish = end; setTimeout(end, 1100);
    } catch (e) { done(); }
  }
  function show() {
    if (!isOn() || !A.root) return false;
    if (!S.ui) build();
    A.root.classList.remove("hidden"); S.open = true; S.armed = -1;
    render(true);
    const d = curData();
    A.talk(d ? (d.paused ? LINES.paused : LINES.intro[d.theme.key]) : netOK && !S.err ? LINES.welcome : LINES.offline);
    if (d) markCardSeen(d);
    refresh(true).then(nd => { if (!S.open) return; if (nd && !d) render(true); if (nd) markCardSeen(nd); });
    return true;
  }
  function markCardSeen(d) {
    const s = seenFor(d); s.cw = d.w; s.clv = Math.max(s.clv || 0, d.reached | 0); s.total = Math.max(s.total | 0, view().total || 0); set("zy_plaza_seen", s);
    try { A.onUpdate(info()); } catch (e) {}
  }
  function hide() {
    if (!A.root) return; cancelAnimationFrame(S.rollRaf);
    if (S.open) { const d = curData(); if (d) { const s = seenFor(d); s.total = Math.max(s.total | 0, S.shown | 0); set("zy_plaza_seen", s); } }
    A.root.classList.add("hidden"); S.open = false; S.armed = -1;
    A.root.querySelectorAll(".pz-fly").forEach(f => f.remove()); A.root.querySelectorAll(".pz-pin").forEach(p => { p.style.visibility = ""; });   // 飛到一半就關：藏著的那張直接貼上
    try { A.onClose(); } catch (e) {}
  }
  function setOn(v) {
    set("zy_plaza_on", v ? 1 : 0);
    if (!v) { del("zy_plaza_pending"); del("zy_plaza_inflight"); del("zy_plaza_cache"); del("zy_plaza_lock"); S.round = {}; S.floor = {}; S.err = false; if (S.open) hide(); }   // 關掉：還沒送的（含送出中）丟掉、讀過的數字也清掉（不送也不讀）
    update();
    if (v) refresh(true);
  }
  function clearSlot(n) { const m = get("zy_plaza_mine", null); if (m && m.s && m.s[String(n)]) { delete m.s[String(n)]; set("zy_plaza_mine", m); } }   // 家長「清除重來」：這位這週的貢獻紀錄一起清

  // 每 30 秒：有待送就合併送一次；在小島選單上每 3 分鐘讀一次（後端掛掉／沒網路時遊戲完全照常）
  setInterval(() => { if (isOn() && netOK && (Object.keys(tidy(pend())).length || infl().length)) flush(); }, 30000);
  setInterval(() => { if (isOn() && netOK && !document.hidden && (A.onMenu() || S.open)) refresh(); }, 180000);
  addEventListener("online", () => { S.back = 0; S.getBack = 0; if (isOn()) { refresh(true); flushSoon(2000); } });

  return {
    add, roundStart, roundGain, flush, flushSoon, refresh, takeNews, info, open: show, close: hide, isOpen: () => S.open, isOn, setOn, clearSlot, cheerLeft,
    debug: { get S() { return S; }, view, curWeek, now, pend, infl, newId, netOK },
  };
}
