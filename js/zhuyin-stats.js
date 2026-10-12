// 注音小島：「玩了什麼」本機遊玩紀錄（家長頁用）。純邏輯、沒有 DOM，tools/zy-test/stats-unit.mjs 單元測試。
// 資料只存在這台平板的 localStorage（zy{n}_stats），絕不上傳、也不進備份碼。
// 結構：{ days: { "YYYY-MM-DD": { sec, plays: { 模式: 次數 } } }, modes: { 模式: { plays, stars, best, last } } }
// 日期一律用台北時間（UTC+8）切。只留最近 60 天的 days（modes 是累計，不清）。
export const KEEP_DAYS = 60;
// 模式白名單（跟 zhuyin.js 的 MODES 同一份；[圖示, 名稱]）
export const MODE_INFO = {
  fish: ["🎣", "釣魚"], order: ["🍔", "點餐"], build: ["🧩", "積木"], hunt: ["🔍", "尋寶"], match: ["🃏", "翻牌"], tone: ["🎈", "氣球"],
  whack: ["🔨", "地鼠"], frog: ["🐸", "青蛙"], bubble: ["🐧", "泡泡"], deliver: ["🚚", "彩虹配送站"], detective: ["🕵️", "偵探"], tops: ["🌀", "陀螺"],
  tower: ["🗼", "燈塔"],   // 10-13 挑戰燈塔
};
export const MODE_IDS = Object.keys(MODE_INFO);

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = x => !!x && typeof x === "object" && !Array.isArray(x);
const num = (x, lo, hi) => { x = Number(x); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : lo; };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function taipeiDay(ms) { return new Date(ms + 8 * 3600e3).toISOString().slice(0, 10); }   // UTC+8 的 YYYY-MM-DD
export function validDay(s) { if (typeof s !== "string" || !DAY_RE.test(s)) return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
export function shiftDay(day, n) { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const empty = () => ({ days: {}, modes: {} });

// 清掉舊於 60 天的 days（含今天共 60 天）
export function prune(st, day) {
  const cut = shiftDay(day, -(KEEP_DAYS - 1));
  for (const k of Object.keys(st.days)) if (k < cut) delete st.days[k];
  return st;
}
// 讀出來的壞資料清洗：數字上下限、模式白名單、原型鏈 key 防護（__proto__ 之類只會被白名單／日期格式擋掉）
export function clean(raw, day) {
  const out = empty();
  if (!isObj(raw)) return out;
  if (isObj(raw.days)) for (const k of Object.keys(raw.days)) {
    if (!validDay(k) || !has(raw.days, k) || !isObj(raw.days[k])) continue;
    const r = raw.days[k], plays = {};
    if (isObj(r.plays)) for (const m of MODE_IDS) if (has(r.plays, m)) { const n = num(r.plays[m], 0, 9999); if (n > 0) plays[m] = n; }
    out.days[k] = { sec: num(r.sec, 0, 86400), plays };
  }
  if (isObj(raw.modes)) for (const m of MODE_IDS) if (has(raw.modes, m) && isObj(raw.modes[m])) {
    const r = raw.modes[m], last = validDay(r.last) ? r.last : "";
    out.modes[m] = { plays: num(r.plays, 0, 1e6), stars: num(r.stars, 0, 1e7), best: num(r.best, 0, 3), last };
  }
  return day ? prune(out, day) : out;
}
const dayRec = (st, day) => (has(st.days, day) ? st.days[day] : (st.days[day] = { sec: 0, plays: {} }));
const modeRec = (st, m) => (has(st.modes, m) ? st.modes[m] : (st.modes[m] = { plays: 0, stars: 0, best: 0, last: "" }));

// 開始一局：今天 plays+1、累計 plays+1、最後玩的日子＝今天。不認得的模式忽略（回 false）
export function startPlay(st, m, day) {
  if (!has(MODE_INFO, m) || !validDay(day)) return false;
  const d = dayRec(st, day), r = modeRec(st, m);
  d.plays[m] = Math.min(9999, (d.plays[m] || 0) + 1); r.plays = Math.min(1e6, r.plays + 1); r.last = day;
  prune(st, day); return true;
}
// 結算：累加星星、更新最佳
export function addStars(st, m, n, day) {
  if (!has(MODE_INFO, m)) return false;
  n = num(n, 0, 3); const r = modeRec(st, m);
  r.stars = Math.min(1e7, r.stars + n); r.best = Math.max(r.best, n); if (validDay(day)) r.last = day;
  return true;
}
// 遊玩秒數（遊戲畫面看得到、分頁在前景才會呼叫）
export function addSec(st, sec, day) {
  if (!validDay(day)) return false;
  const d = dayRec(st, day); d.sec = Math.min(86400, d.sec + num(sec, 0, 3600)); return true;
}
// 最近 n 天（舊→新，最後一個是今天），沒玩的天也有一列（sec 0）
export function lastDays(st, n, day) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const k = shiftDay(day, -i), r = has(st.days, k) ? st.days[k] : null; out.push({ day: k, sec: r ? r.sec : 0 }); }
  return out;
}
// 每個遊戲的摘要：玩過的依次數多→少（同次數按最近玩），沒玩過的放最後（played:false）
export function modeRows(st) {
  const rows = MODE_IDS.map(m => { const r = has(st.modes, m) ? st.modes[m] : null; return { id: m, icon: MODE_INFO[m][0], name: MODE_INFO[m][1], played: !!(r && r.plays > 0), plays: r ? r.plays : 0, avg: r && r.plays > 0 ? Math.round(r.stars / r.plays * 10) / 10 : 0, last: r ? r.last : "" }; });
  const played = rows.filter(r => r.played).sort((a, b) => b.plays - a.plays || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  return played.concat(rows.filter(r => !r.played));
}
// 「3 天前／今天／昨天」
export function dayLabel(last, today) {
  if (!validDay(last)) return "";
  const diff = Math.round((new Date(today + "T00:00:00Z") - new Date(last + "T00:00:00Z")) / 864e5);
  return diff <= 0 ? "今天" : diff === 1 ? "昨天" : diff + " 天前";
}
