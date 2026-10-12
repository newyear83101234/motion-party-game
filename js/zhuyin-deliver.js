// ===================== 注音小島：彩虹配送站（接單→裝貨→選路線→送貨） =====================
// 給 5 歲小孩：點商品→點卡車＝裝貨；點地圖上的圖釘＝卡車自己沿「合法最短路」開過去；到了點車上的貨＝交給居民。
// 大人也想玩：車廂容量、單行道、吊橋（開關只在倉庫）、送貨順序——星星跟求解器的「最少出車趟數／最短路程」比。
// 遊戲不自動唸答案：前 3 關居民開場說一次「我要X！」，第 4 關起訂單藏圖、完全不唸商品（只能看國字注音）；🔊／💡 按了才幫忙。
//
// 介面（主程式照這個接，仿 zhuyin-bubble.js）：
//   createDeliverGame(root, api) → { start(task), stop(), sayCurrent(), relayout(), state(), debug }
//   api：say talk play later paused onSave onWin petImg isCleared hintWait（＋測試用 seed speed）
//   onSave(info)：送完最後一件、算完成績就立刻呼叫（同一份 info）＝主程式馬上存檔（里維 10-12：過關演出 3.6–6 秒中按 🏠 進度不會丟）；onWin 只管轉場
//   onWin({ task, stars, trips, bestTrips, dist, bestDist, wrong, gift, coin, routeBest, orders })：gift＝第一次過關送的換裝 id（api.isCleared(task) 為真＝重玩＝null）；coin＝1：任務 9–12 第一次過關送 1 枚扭蛋幣（主程式存檔時加）；
//     orders＝[{ house, good, word（國字）, wrong（這張訂單送錯幾次） }]（10-12 主程式接線：沒送錯過的商品詞給貼紙）
// 3D：自己的小 Three.js 場景（跟小島同一份 IMAGE/zy3d/vendor/three、同一套 Kenney＋自製模型、同樣的燈光與色票）；
//   stop() 一定 dispose renderer、停 rAF；所有遊戲計時走 api.later（暫停凍得住），3D 動畫用自己的遊戲時鐘（暫停時不走）。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const ROOT = new URL("../", import.meta.url).href;          // 專案根目錄（主程式、試玩頁都對）
const IMG = ROOT + "IMAGE/zhuyin/", KIT = ROOT + "IMAGE/zy3d/kenney/", MODELS = ROOT + "IMAGE/zy3d/models/";

// ===================== 商品、居民、禮物、台詞 =====================
// 易混組：麵包／帽子（都是ㄇ開頭）、西瓜／香蕉（都是ㄒ開頭）→ 要讀到第二個音
export const GOODS = {
  hat: { h: "帽子", img: "goods_hat", emoji: "🧢", src: "zy:hat", size: 0.62 },
  apple: { h: "蘋果", img: "goods_apple", emoji: "🍎", src: "food-kit/apple", size: 0.48 },
  banana: { h: "香蕉", img: "goods_banana", emoji: "🍌", src: "food-kit/banana", size: 0.66 },
  watermelon: { h: "西瓜", img: "goods_watermelon", emoji: "🍉", src: "food-kit/watermelon", size: 0.56 },
  bread: { h: "麵包", img: "goods_bread", emoji: "🍞", src: "food-kit/loaf", size: 0.6 },
  milk: { h: "牛奶", img: "goods_milk", emoji: "🥛", src: "food-kit/carton", size: 0.56 },
};
export const HOUSES = {
  B: { pet: "bunny", name: "小兔", sign: "小兔家", color: "#ff8fb0", dark: "#d9628a", kit: "building-type-s", roof: "#ff9cc0", wall: "#fff4f7", at: [-0.6, -5.8], ry: 0 },
  R: { pet: "bear", name: "小熊", sign: "小熊家", color: "#f2a33a", dark: "#c47a1c", kit: "building-type-c", roof: "#f0a43c", wall: "#fff6e3", at: [-0.6, 1.0], ry: 0 },
  P: { pet: "pig", name: "小豬", sign: "小豬家", color: "#a98be8", dark: "#7a5cc4", kit: "building-type-o", roof: "#a98be8", wall: "#f6f1ff", at: [9.75, -2.3], ry: 0 },
};
const HOUSE_IDS = ["B", "R", "P"];
// 任務 1–8 第一次過關各送一件換裝（主對話 10-11 定；圖之後由換裝組產生 IMAGE/zhuyin/wear_<id>.webp，載不到退回 emoji）
export const GIFTS = {
  flower: { h: "小花", emoji: "🌸" }, flower_crown: { h: "花圈", emoji: "💐" }, backpack: { h: "背包", emoji: "🎒" }, party_hat: { h: "派對帽", emoji: "🥳" },
  cape: { h: "披風", emoji: "🦸" }, wings: { h: "翅膀", emoji: "🪽" }, crown: { h: "皇冠", emoji: "👑" }, cape_rainbow: { h: "彩虹披風", emoji: "🌈" },
};
// 台詞（tools/voice/build_lines.py 逐句斷言這裡真的有這些字；改句子要一起改那邊）
export const LINES = {
  want: h => `我要${h}！`,                        // 前 3 關開場（say）
  wrong: h => `這是${h}，不是我要的喔！`,          // 送錯：說孩子給的那個，不唸答案
  gift: h => `送你${h}！`,
  thanks: "謝謝你！",
  none: "車上沒有我要的東西耶，回倉庫拿吧！",
  got: "我已經收到囉，謝謝！",
  noOrder: "我沒有訂東西喔！",
  full: "車子裝滿了！",
  unloadTip: "點車上的東西可以拿下來喔！",           // 容量 ≥2 裝滿了還要裝：教他怎麼拿下來（容量 1 直接換貨）
  loadFirst: "先把貨裝上車吧！",
  bridge: "橋還沒放下來喔！",
  cone: "前面在施工，車子沒辦法過去喔！",
  oneway: "這是單行道，要繞路喔！",
  hello: "嗨！麻煩你囉！",                          // 第 4 關起：居民只打招呼、不唸商品
  t1go: "點小兔家，卡車就會出發！",
  t1give: "點車廂裡的帽子，交給小兔！",              // 任務 1 到站（點卡車／小兔／房子也都會交貨）
};
export const COIN_GIFT = { h: "扭蛋幣", emoji: "🪙" };    // 10-13 任務 9–12 第一次過關的禮物（台詞＝LINES.gift("扭蛋幣")＝「送你扭蛋幣！」）
export const BADGE_ROUTE = "🚚 一趟就送完！";           // 任務 1–6：路線最佳的加分小徽章（不影響星星）
export const STAMP_SELF = "自己讀到的！";               // 藏圖訂單沒按提示揭圖就送對

// ===================== 地圖（世界座標：x 往右＝東、z 往前＝南、靠鏡頭） =====================
// 倉庫 W 在西邊；環狀路 A–NW–B–NE–E–SE–R–SW 圍著小熊家；東邊過河（吊橋 BW–BE）是小豬家 P。B／R／P＝門口停車點。
export const NODES = { W: [-7.6, 0], A: [-4.6, 0], NW: [-4.6, -3.4], B: [-0.6, -3.4], NE: [3.0, -3.4], E: [3.0, 0], SE: [3.0, 3.4], R: [-0.6, 3.4], SW: [-4.6, 3.4], BW: [4.4, 0], BE: [7.6, 0], P: [9.4, 0] };
// 環狀路段一律照順時針寫（單行道時只能 a→b）；第三欄 1＝環狀路、2＝吊橋
export const EDGES = [["W", "A"], ["A", "NW", 1], ["NW", "B", 1], ["B", "NE", 1], ["NE", "E", 1], ["E", "SE", 1], ["SE", "R", 1], ["R", "SW", 1], ["SW", "A", 1], ["E", "BW"], ["BW", "BE", 2], ["BE", "P"]]
  .map(([a, b, f]) => ({ id: a + "-" + b, a, b, len: Math.hypot(NODES[b][0] - NODES[a][0], NODES[b][1] - NODES[a][1]), loop: f === 1, bridge: f === 2 }));
const RIVER = [4.6, 7.4];                                  // 河的兩岸（x）

// ===================== 12 個任務（1–8 原本的；9–12 是 10-13 加的進階關）=====================
// cones：[路段, 位置 0–1]＝施工三角錐擋住整段路；lever＝有吊橋（開場是升起來的；點地圖上的吊橋或旁邊的開關圖釘就放下，放下後鎖住）；
// oneway＝環狀路變順時針單行；hidden＝訂單藏圖（只剩國字注音、貨架只放圖）；speak＝居民開場唸訂單；
// plan＝大人規劃關（星星看趟數＋路程；其他關星星只看送錯）。最佳趟數／路程由求解器算（tools/zy-test/deliver.js 驗證並印表）。
// 10-13 進階關 9–12（阿葉：「小孩說每個遊戲都太簡單」）：全部藏圖＋規劃關（看趟數與路程）＋吊橋，訂單 4–5 張，逐關加難：
//   9＝4 張單，容量 2（兩趟，沒有單行道）；10＝加單行道；11＝5 張單，容量 3（一趟載三樣、兩趟）；12＝5 張單，容量 2、單行道（要三趟）。每關求解器都有解，「貪心先送最近的」都比最佳路程差 ≥10%。
//   第一次過關沒有新配件（換裝禮物只有 8 件）→ 改送 1 枚扭蛋幣（coin: true；主程式 deliverSave 加幣）。
// 櫻木花道 10-12：任務 4＝第一個藏圖關用不易混的詞（牛奶、蘋果）、貨架 4 種；易混組（西瓜／香蕉、麵包／帽子）從任務 5 起
export const TASKS = [
  { cap: 1, shelf: ["hat", "apple"], orders: [["B", "hat"]], cones: [["B-NE", 0.3], ["SW-A", 0.78]], speak: true, gift: "flower", intro: "點商品，再點卡車，就能裝貨喔！" },
  { cap: 1, shelf: ["bread", "hat", "apple"], orders: [["R", "bread"]], cones: [["B-NE", 0.3], ["SE-R", 0.72]], speak: true, gift: "flower_crown" },
  { cap: 2, shelf: ["milk", "apple", "bread", "hat"], orders: [["B", "milk"], ["R", "apple"]], cones: [["B-NE", 0.3], ["SE-R", 0.72]], speak: true, gift: "backpack", intro: "兩個都裝上車，一次送完喔！" },
  { cap: 2, shelf: ["milk", "apple", "hat", "banana"], orders: [["B", "milk"], ["R", "apple"]], cones: [], hidden: true, gift: "party_hat", intro: "這次要自己看字喔！" },
  { cap: 3, shelf: "all", orders: [["B", "bread"], ["R", "hat"], ["P", "milk"]], cones: [], hidden: true, lever: true, gift: "cape", intro: "過河要先把橋放下來，點吊橋就可以喔！" },
  { cap: 2, shelf: "all", orders: [["R", "banana"], ["P", "watermelon"]], cones: [], hidden: true, lever: true, oneway: true, gift: "wings", intro: "有箭頭的路是單行道喔！" },
  { cap: 2, shelf: "all", orders: [["B", "hat"], ["R", "apple"], ["P", "bread"]], cones: [], hidden: true, lever: true, plan: true, gift: "crown", intro: "貨太多了，要回倉庫再拿喔！" },
  { cap: 2, shelf: "all", orders: [["P", "bread"], ["B", "watermelon"], ["R", "banana"], ["P", "hat"]], cones: [], hidden: true, lever: true, oneway: true, plan: true, gift: "cape_rainbow", intro: "大挑戰！想想看怎麼送最快！" },
  { cap: 2, shelf: "all", orders: [["B", "bread"], ["R", "hat"], ["P", "milk"], ["B", "apple"]], cones: [], hidden: true, lever: true, plan: true, coin: true, intro: "四張訂單，想想先送哪一家！" },
  { cap: 2, shelf: "all", orders: [["P", "hat"], ["B", "bread"], ["R", "milk"], ["P", "watermelon"]], cones: [], hidden: true, lever: true, oneway: true, plan: true, coin: true, intro: "單行道加吊橋，路線要想好喔！" },
  { cap: 3, shelf: "all", orders: [["R", "bread"], ["P", "apple"], ["B", "banana"], ["P", "watermelon"], ["R", "milk"]], cones: [], hidden: true, lever: true, oneway: true, plan: true, coin: true, intro: "貨好多，車子一次可以載三樣！" },
  { cap: 2, shelf: "all", orders: [["P", "watermelon"], ["B", "bread"], ["R", "banana"], ["P", "hat"], ["B", "milk"]], cones: [], hidden: true, lever: true, oneway: true, plan: true, coin: true, intro: "最後的大挑戰，加油！" },
].map(t => ({ hidden: false, lever: false, oneway: false, speak: false, plan: false, intro: "", ...t, shelf: t.shelf === "all" ? Object.keys(GOODS) : t.shelf }));

// ===================== 路網與求解器（純邏輯；示範手指、星星、測試都用這一套） =====================
const r1 = x => Math.round(x * 10) / 10;
const coned = (T, id) => T.cones.some(c => c[0] === id);
const routeMemo = new Map();
// 合法最短路：三角錐擋住的路段不能走；吊橋要放下（bd＝1）才能過；單行道只能順時針。ign＝診斷用（忽略某種阻擋）
export function route(ti, from, to, bd = 0, ign = {}) {
  const k = [ti, from, to, bd ? 1 : 0, ign.cone ? 1 : 0, ign.bridge ? 1 : 0, ign.oneway ? 1 : 0].join("|");
  if (routeMemo.has(k)) return routeMemo.get(k);
  const T = TASKS[ti], dist = { [from]: 0 }, prev = {}, done = new Set();
  let out = null;
  if (from === to) out = { len: 0, nodes: [from], edges: [] };
  else for (;;) {
    let u = null, du = Infinity;
    for (const n in dist) if (!done.has(n) && dist[n] < du) { du = dist[n]; u = n; }
    if (u === null) break;
    if (u === to) {
      const nodes = [to], edges = [];
      for (let n = to; n !== from; n = prev[n][0]) { edges.unshift(prev[n][1]); nodes.unshift(prev[n][0]); }
      out = { len: du, nodes, edges }; break;
    }
    done.add(u);
    for (const e of EDGES) {
      if (!ign.cone && coned(T, e.id)) continue;
      if (e.bridge && !ign.bridge && !(T.lever && bd)) continue;
      const v = e.a === u ? e.b : e.b === u && !(T.oneway && e.loop && !ign.oneway) ? e.a : null;
      if (!v || done.has(v)) continue;
      if (du + e.len < (dist[v] ?? Infinity) - 1e-9) { dist[v] = du + e.len; prev[v] = [u, e]; }
    }
  }
  routeMemo.set(k, out);
  return out;
}
// 到了某家：車上有他要的就交出去（交貨永遠不會變差，求解器直接當作到了就交）
function deliverAt(T, pos, cargo, done) {
  cargo = cargo.slice();
  T.orders.forEach(([h, g], i) => { if (h === pos && !(done >> i & 1)) { const k = cargo.indexOf(g); if (k >= 0) { cargo.splice(k, 1); done |= 1 << i; } } });
  return { cargo, done };
}
function pendingCount(T, done) { const m = {}; T.orders.forEach(([, g], i) => { if (!(done >> i & 1)) m[g] = (m[g] || 0) + 1; }); return m; }
function loadChoices(pend, cap) {                           // 在倉庫可以裝的組合：1～容量件、只裝還有人要的、每種不超過訂單數
  const ids = Object.keys(pend).sort(), out = [], cur = [];
  const rec = i => { if (cur.length) out.push(cur.slice()); if (cur.length === cap) return;
    for (let k = i; k < ids.length; k++) { const g = ids[k]; if (cur.filter(x => x === g).length < pend[g]) { cur.push(g); rec(k); cur.pop(); } } };
  rec(0); return out;
}
const wantsAny = (T, h, goods, done) => T.orders.some(([hh, g], i) => hh === h && !(done >> i & 1) && goods.includes(g));
// 求解器：狀態＝卡車在哪、車上的貨、哪些送到了；代價＝（出車趟數, 總路程）字典序最小。
// 吊橋隨時、在哪都能放下、放下就鎖住、不花路程 → 求解器一律當作「需要時已放下」（bd＝1）；提示再看下一段路要不要先放橋。
// 從倉庫出發一步＝「卸掉多的、裝好這趟要的、開去某家」；在別家＝「開去下一家／回倉庫」。
export function solve(ti, from = {}) {
  const T = TASKS[ti], ALL = (1 << T.orders.length) - 1, BD = T.lever ? 1 : 0;
  let s0 = { pos: from.pos || "W", cargo: (from.cargo || []).slice().sort(), done: from.done || 0, bd: BD };
  if (s0.pos !== "W") { const d = deliverAt(T, s0.pos, s0.cargo, s0.done); s0 = { ...s0, cargo: d.cargo.sort(), done: d.done }; }
  const key = s => `${s.pos}|${s.cargo.join(",")}|${s.done}`;
  const seen = new Map(), open = [{ t: 0, d: 0, s: s0, moves: [] }];
  const less = (a, b) => a.t !== b.t ? a.t < b.t : a.d < b.d - 1e-9;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (less(open[i], open[bi])) bi = i;
    const cur = open.splice(bi, 1)[0], k = key(cur.s);
    if (seen.has(k)) continue; seen.set(k, cur);
    const s = cur.s;
    if (s.done === ALL) return { trips: cur.t, dist: r1(cur.d), moves: cur.moves };
    const push = (t, d, ns, mv) => { if (!seen.has(key(ns))) open.push({ t, d, s: ns, moves: cur.moves.concat([mv]) }); };
    if (s.pos === "W") {
      for (const C of loadChoices(pendingCount(T, s.done), T.cap)) for (const H of HOUSE_IDS) {
        if (!wantsAny(T, H, C, s.done)) continue;
        const r = route(ti, "W", H, BD); if (!r) continue;
        const d = deliverAt(T, H, C, s.done);
        push(cur.t + 1, cur.d + r.len, { pos: H, cargo: d.cargo.sort(), done: d.done, bd: BD }, { from: "W", load: C.slice(), to: H, len: r.len, bridge: r.edges.some(e => e.bridge) });
      }
    } else {
      const dests = ["W", ...(s.cargo.length ? HOUSE_IDS.filter(H => H !== s.pos && wantsAny(T, H, s.cargo, s.done)) : [])];
      for (const X of dests) {
        const r = route(ti, s.pos, X, BD); if (!r) continue;
        const d = X === "W" ? { cargo: s.cargo, done: s.done } : deliverAt(T, X, s.cargo, s.done);
        push(cur.t, cur.d + r.len, { pos: X, cargo: d.cargo.slice().sort(), done: d.done, bd: BD }, { from: s.pos, to: X, len: r.len, bridge: r.edges.some(e => e.bridge) });
      }
    }
  }
  return null;
}
// 對照組（測試／設計用）：「貪心先送最近的」——在倉庫照離倉庫遠近裝滿，再一直開去最近的、要車上貨的那家
export function greedy(ti) {
  const T = TASKS[ti], ALL = (1 << T.orders.length) - 1, bd = T.lever ? 1 : 0, D = (a, b) => route(ti, a, b, bd).len;
  let pos = "W", cargo = [], done = 0, trips = 0, dist = 0, guard = 0;
  while (done !== ALL && guard++ < 40) {
    const pend = T.orders.map(([h, g], i) => ({ h, g, i })).filter(o => !(done >> o.i & 1)).sort((a, b) => D("W", a.h) - D("W", b.h) || a.i - b.i);
    cargo = pend.slice(0, T.cap).map(o => o.g); trips++;
    while (cargo.length) {
      const h = HOUSE_IDS.filter(H => wantsAny(T, H, cargo, done)).sort((a, b) => D(pos, a) - D(pos, b))[0];
      dist += D(pos, h); pos = h; ({ cargo, done } = deliverAt(T, h, cargo, done));
    }
    if (done !== ALL) { dist += D(pos, "W"); pos = "W"; }
  }
  return { trips, dist: r1(dist) };
}
// 路線最佳：趟數＝最少、路程 ≤ 最佳×1.05
export const routeBest = (r, best) => r.trips === best.trips && r.dist <= best.dist * 1.05 + 1e-6;
// 星星（櫻木花道 10-12）：一般關只看送錯（0 錯 3★、1 錯 2★、≥2 錯 1★），路線最佳另給「🚚」小徽章、不影響星星；
// 大人規劃關（plan）：3★＝沒送錯且路線最佳；2★＝最多多一次錯「或」多一趟（趟數最少但繞遠也算一次）；其餘 1★
export function starsFor(r, best, plan = true) {
  if (!plan) return r.wrong === 0 ? 3 : r.wrong === 1 ? 2 : 1;
  const extra = Math.max(0, r.trips - best.trips), longer = extra === 0 && r.dist > best.dist * 1.05 + 1e-6 ? 1 : 0;
  const pts = r.wrong + extra + longer;
  return pts === 0 ? 3 : pts <= 1 ? 2 : 1;
}
export const deliverSim = { route, solve, greedy, starsFor, routeBest, NODES, EDGES };

// ===================== 3D 小工具 =====================
const AZ = 0.26, EL = 0.86;                                   // 鏡頭方位角（從南偏東看過來）、俯角
const RW = 1.2, SW = 0.34;                                   // 車道寬、人行道寬
const SEA_Y = -0.82, SAND_Y = -0.6;
const P = { grass: "#86c449", grassDk: "#74b13f", dirt: "#a8673f", dirtDk: "#7d4a2e", sand: "#ecd7a3", lane: "#8f93a3", walk: "#e6e2ee", dash: "#f3c94f", plaza: "#ddd8cf", wood: "#c98a55",
  deep: "#3f97c9", shallow: "#7fcfd0", purple: "#8b70cc", cream: "#f6eedd" };
const LAND = [{ x0: -10.7, x1: RIVER[0], z0: -7.7, z1: 5.9, r: 1.9 }, { x0: RIVER[1], x1: 12.3, z0: -4.5, z1: 3.7, r: 1.3 }];
const TRUCK_LEN = 2.05, TS = TRUCK_LEN / 3.25;               // delivery-flat 原始長 3.25（車頭朝 +z）
const BED = { y: 0.6, z0: -1.4, z1: -0.42 };                  // 車斗平台（模型原始單位）
const VMAX = 4.2, ACC = 6.5;                                 // 卡車最高速（單位／秒）、加速度
export const CTX = { made: 0, live: 0 };                    // WebGL context 計數（測試查洩漏）
let dprMem = 0;                                             // 自動畫質降到的像素比（記著：下一關、下次進來直接用，不用每關重新降）
const _c = new THREE.Color(), _v = new THREE.Vector3();
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function paint(geo, hex) {
  if (geo.index) geo = geo.toNonIndexed();
  _c.set(hex); const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return geo;
}
function sdRoundBox(x, z, hx, hz, r) { const qx = Math.abs(x) - hx + r, qz = Math.abs(z) - hz + r; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r; }
const sdLand = (x, z) => Math.min(...LAND.map(L => sdRoundBox(x - (L.x0 + L.x1) / 2, z - (L.z0 + L.z1) / 2, (L.x1 - L.x0) / 2, (L.z1 - L.z0) / 2, L.r)));
function rrShape(hx, hz, r) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz); s.lineTo(hx - r, -hz); s.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hx, hz - r); s.absarc(hx - r, hz - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hx + r, hz); s.absarc(-hx + r, hz - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hx, -hz + r); s.absarc(-hx + r, -hz + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
// 招牌上的國字也要有注音（3D 畫布字，自己附注音）
const SIGN_Z = { 小: "ㄒㄧㄠˇ", 兔: "ㄊㄨˋ", 熊: "ㄒㄩㄥˊ", 豬: "ㄓㄨ", 家: "ㄐㄧㄚ", 彩: "ㄘㄞˇ", 虹: "ㄏㄨㄥˊ", 配: "ㄆㄟˋ", 送: "ㄙㄨㄥˋ", 站: "ㄓㄢˋ" };
const HAN_FONT = '"PingFang TC","Microsoft JhengHei","Noto Sans TC","Heiti TC",sans-serif';
function drawZhuyinText(g, text, cx, cy, size, color) {
  const cw = size * 1.62, x0 = cx - cw * text.length / 2;
  g.fillStyle = color; g.textBaseline = "middle"; g.textAlign = "center";
  [...text].forEach((ch, i) => {
    const x = x0 + i * cw + size * 0.5;
    g.font = `900 ${size}px ${HAN_FONT}`; g.fillText(ch, x, cy);
    const z = SIGN_Z[ch]; if (!z) return;
    const tone = "ˊˇˋ˙".includes(z.slice(-1)) ? z.slice(-1) : "", sy = tone ? z.slice(0, -1) : z, zs = size * 0.3;
    g.font = `700 ${zs}px ${HAN_FONT}`;
    const top = cy - (sy.length * zs * 1.02) / 2 + zs / 2;
    [...sy].forEach((s, k) => g.fillText(s, x + size * 0.72, top + k * zs * 1.02));
    if (tone && tone !== "˙") g.fillText(tone, x + size * 0.98, top + (sy.length - 1) * zs * 1.02 - zs * 0.3);
    if (tone === "˙") g.fillText(tone, x + size * 0.72, top - zs * 0.9);
  });
}
// 模型與貼圖快取（跨局共用；GPU 資源每局隨 renderer 一起釋放）
const BLANK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const manager = new THREE.LoadingManager(); manager.setURLModifier(u => /\/colormap\.png$/.test(u) ? BLANK : u);
const gltfLoader = new GLTFLoader(manager), gltfCache = new Map(), kitImgP = new Map();
const loadGLB = url => { if (!gltfCache.has(url)) gltfCache.set(url, gltfLoader.loadAsync(url).catch(e => { gltfCache.delete(url); throw e; })); return gltfCache.get(url); };
const KIT_SMALL = new Set(["city-kit-commercial", "fantasy-town-kit", "pirate-kit", "car-kit", "cube-pets"]);   // 128² 調色盤（效能體檢 10-12；跟 js/zhuyin-hub3d.js 同一份清單，tools/render3d/colormap_small.py 產生）
const kitImage = kit => { if (!kitImgP.has(kit)) kitImgP.set(kit, new THREE.ImageLoader().loadAsync(`${KIT}${kit}/Textures/${KIT_SMALL.has(kit) ? "colormap-128" : "colormap"}.png`)); return kitImgP.get(kit); };
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// ===================== 3D 世界（每局一個；dispose() 全部收乾淨） =====================
function createWorld(host, ti, o) {
  const T = TASKS[ti];
  const W = { gt: 0, dead: false, tw: [], tick: [], k: 30, size: [1, 1], keys: [], anchors: {}, residents: {}, flash: [] };
  const res = { mats: new Map(), kit: new Map(), own: new Set() };
  const own = x => { res.own.add(x); return x; };
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  CTX.made++; CTX.live++;
  W.dpr = Math.min(window.devicePixelRatio || 1, 1.5, dprMem || 9);   // 效能體檢 10-12：跟小島一樣起始 1.5、太慢自動往下降（遊戲本體的 frame()）
  renderer.setPixelRatio(W.dpr);
  renderer.setClearColor(P.deep, 1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; W.shDirty = true;   // 陰影只在有東西動（卡車、吊橋、居民跳、補模型）時重畫（W.frame）
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  host.appendChild(renderer.domElement);
  // 被系統收走：先讓瀏覽器自己還回來（three.js 會重建 GPU 資源）；5 秒沒回來＝告訴主程式（api.onFail）
  const lost = e => { e.preventDefault(); W.lostCount = (W.lostCount || 0) + 1; W.isLost = true; clearTimeout(W.lostT); W.lostT = setTimeout(() => { if (W.isLost && !W.dead && o.onFail) o.onFail("contextlost"); }, 5000); };
  const restored = () => { W.isLost = false; clearTimeout(W.lostT); };
  renderer.domElement.addEventListener("webglcontextrestored", restored);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  const CEN = [0.8, -0.9];
  cam.position.set(CEN[0] + Math.sin(AZ) * Math.cos(EL) * 60, Math.sin(EL) * 60, CEN[1] + Math.cos(AZ) * Math.cos(EL) * 60); cam.lookAt(CEN[0], 0, CEN[1]); cam.updateMatrixWorld();
  const hemi = new THREE.HemisphereLight(0xf4f9ff, 0xe9dcc6, 1.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e4, 2.2);
  sun.position.set(CEN[0] - 7, 15, CEN[1] + 6); sun.target.position.set(CEN[0], 0, CEN[1]); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3; sun.shadow.intensity = 0.7;
  scene.add(sun, sun.target);

  // ---------- 材質 ----------
  const mat = (hex, extra) => { const k = hex + (extra ? JSON.stringify(extra) : ""); if (!res.mats.has(k)) res.mats.set(k, new THREE.MeshLambertMaterial({ color: hex, ...extra })); return res.mats.get(k); };
  const vcMat = own(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const glowMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  function mesh(geo, m, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shadow = true, parent = scene, dyn = false } = {}) {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = shadow; o.receiveShadow = true; if (dyn) o.userData.dyn = true; if (parent) parent.add(o); return o;
  }
  const vm = (geo, hex, opt = {}) => mesh(paint(geo, hex), opt.glow ? glowMat : vcMat, opt);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
  const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
  function canvasTex(w, h, draw) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = own(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function stripeTex(colors, diag = false, n = 0) {
    const t = canvasTex(128, 64, (g, w, h) => { const cs = n ? Array.from({ length: n * 2 }, (_, i) => colors[i % colors.length]) : colors;
      cs.forEach((c, i) => { g.fillStyle = c; if (diag) { const s = w / cs.length; g.beginPath(); g.moveTo(i * s - h, h); g.lineTo(i * s, 0); g.lineTo(i * s + s + 1, 0); g.lineTo(i * s + s + 1 - h, h); g.fill(); } else g.fillRect(i * w / cs.length, 0, w / cs.length + 1, h); }); });
    t.wrapS = THREE.RepeatWrapping; return t;
  }
  // 不會動的程式生成小物：同一群組依材質合併（draw call 從幾十個降到幾個）
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map(), mt = new THREE.Matrix4();
    root.traverse(m => {
      if (!m.isMesh || m.userData.dyn || Array.isArray(m.material) || (m.material !== vcMat && m.material !== glowMat)) return;
      for (let p = m.parent; p && p !== root; p = p.parent) if (p.userData.dyn) return;
      const k = m.material.uuid + "|" + m.castShadow; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m);
    });
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map(m => { const g = m.geometry.clone(); for (const n of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(n)) g.deleteAttribute(n); g.morphAttributes = {}; g.clearGroups(); return g.applyMatrix4(mt.multiplyMatrices(inv, m.matrixWorld)); });
      const merged = mergeGeometries(geos); geos.forEach(g => g.dispose()); if (!merged) continue;
      const m = new THREE.Mesh(merged, list[0].material); m.castShadow = list[0].castShadow; m.receiveShadow = true; root.add(m);
      for (const x of list) { x.removeFromParent(); x.geometry.dispose(); }
    }
    W.shDirty = true;
  }
  // Kenney 調色盤：把指定格子換色（跟小島 hub3d 同一套做法）
  function kitMaterial(kit, img, tints) {
    const k = kit + JSON.stringify(tints); if (res.kit.has(k)) return res.kit.get(k);
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
    if (tints.length) {
      const id = g.getImageData(0, 0, cv.width, cv.height), d = id.data, Wd = cv.width, CW = cv.width / 8, CH = cv.height / 4;
      const lum = i => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      for (const [col, row, hex] of tints) {
        _c.set(hex); const tr = Math.round(Math.pow(_c.r, 1 / 2.2) * 255), tg = Math.round(Math.pow(_c.g, 1 / 2.2) * 255), tb = Math.round(Math.pow(_c.b, 1 / 2.2) * 255);
        const x0 = col * CW, y0 = row * CH, ref = Math.max(lum(((y0 + CH / 2) * Wd + x0 + CW / 4) * 4), 1);
        for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CW; x++) { const i = (y * Wd + x) * 4, f = Math.min(Math.max(lum(i) / ref, 0.35), 1.25); d[i] = Math.min(255, tr * f); d[i + 1] = Math.min(255, tg * f); d[i + 2] = Math.min(255, tb * f); }
      }
      g.putImageData(id, 0, 0);
    }
    const tex = own(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter;
    const m = new THREE.MeshLambertMaterial({ map: tex }); res.kit.set(k, m); return m;
  }
  async function kenney(kit, name, { tints = [], scale = 1, x = 0, y = 0, z = 0, ry = 0, parent = scene, shadow = true } = {}) {
    const [g, img] = await Promise.all([loadGLB(`${KIT}${kit}/${name}.glb`), kitImage(kit)]);
    if (W.dead) return null;
    const obj = g.scene.clone(true), m = kitMaterial(kit, img, tints);
    obj.traverse(c => { if (c.isMesh) { c.material = m; c.castShadow = shadow; c.receiveShadow = true; } });
    obj.scale.setScalar(scale); obj.position.set(x, y, z); obj.rotation.y = ry; if (parent) { parent.add(obj); W.shDirty = true; }   // 模型晚到（已經開始畫了）：陰影補畫一次
    return obj;
  }
  const lambertOf = src => { const k = "zy|" + (src.map ? src.map.uuid : "") + "|" + (src.color ? src.color.getHexString() : ""); if (!res.mats.has(k)) res.mats.set(k, new THREE.MeshLambertMaterial({ map: src.map || null, color: src.color || 0xffffff })); return res.mats.get(k); };
  // 自製模型（寵物、帽子）：縮放成「最高 h」、腳踩地
  async function zyModel(name, h) {
    const g = await loadGLB(`${MODELS}${name}.glb`); if (W.dead) return null;
    const obj = g.scene.clone(true);
    obj.traverse(c => { if (c.isMesh) { c.material = Array.isArray(c.material) ? c.material.map(lambertOf) : lambertOf(c.material); c.castShadow = true; c.receiveShadow = true; } });
    const wrap = new THREE.Group(); wrap.add(obj);
    const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
    obj.scale.setScalar(h / Math.max(sz.x, sz.y, sz.z)); const b2 = new THREE.Box3().setFromObject(obj); obj.position.y -= b2.min.y; obj.position.x -= (b2.min.x + b2.max.x) / 2; obj.position.z -= (b2.min.z + b2.max.z) / 2;
    return wrap;
  }
  async function goodModel(gid) {                            // 商品小模型（車斗、送貨）：最長邊＝GOODS.size
    const G = GOODS[gid], [kind, name] = G.src.startsWith("zy:") ? ["zy", G.src.slice(3)] : G.src.split("/");
    let obj;
    if (kind === "zy") obj = await zyModel(name, G.size);
    else { const k = await kenney(kind, name, { parent: null }); if (!k) return null; obj = new THREE.Group(); obj.add(k);
      const b = new THREE.Box3().setFromObject(k), sz = b.getSize(new THREE.Vector3()); k.scale.setScalar(G.size / Math.max(sz.x, sz.y, sz.z));
      const b2 = new THREE.Box3().setFromObject(k); k.position.y -= b2.min.y; k.position.x -= (b2.min.x + b2.max.x) / 2; k.position.z -= (b2.min.z + b2.max.z) / 2; }
    return obj;
  }

  // ---------- 小工具：補間動畫（遊戲時鐘；暫停時不走） ----------
  const tween = (dur, fn, done, tag) => { const t = { t0: W.gt, dur: Math.max(0.001, dur), fn, done, tag }; W.tw.push(t); fn(0); return t; };
  function stepTweens() {
    for (let i = W.tw.length - 1; i >= 0; i--) { const t = W.tw[i], u = Math.min(1, (W.gt - t.t0) / t.dur); t.fn(u); if (u >= 1) { W.tw.splice(i, 1); if (t.done) t.done(); } }
  }

  // ---------- 地形：兩塊草地（西邊大島、東邊小豬的小島）＋土壁＋沙灘＋海／河 ----------
  function buildTerrain() {
    const g = new THREE.Group(); scene.add(g);
    for (const L of LAND) {
      const hx = (L.x1 - L.x0) / 2, hz = (L.z1 - L.z0) / 2, cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2;
      const ext = (ox, top, depth, color, bevel = 0) => {
        const geo = new THREE.ExtrudeGeometry(rrShape(hx + ox, hz + ox, L.r + ox), { depth, curveSegments: 10, bevelEnabled: bevel > 0, bevelThickness: bevel * 0.45, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3 });
        geo.rotateX(Math.PI / 2); geo.translate(cx, top - (bevel ? bevel * 0.45 : 0), cz);
        const m = mesh(geo, mat(color), { parent: g, shadow: false }); return m;
      };
      ext(0, 0, 0.12, P.grass, 0.05);
      ext(-0.02, -0.08, 0.5, P.dirt).castShadow = true;
      ext(-0.05, -0.55, 0.3, P.dirtDk);
      ext(0.6, SAND_Y, 0.35, P.sand, 0.5);
    }
    // 海＋河：烘一張距離場（陸地）→ 淺水、浪花白邊照著岸線走（同小島 hub3d 的做法，縮小版）
    const N = 176, R = 22, data = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = CEN[0] + (i + 0.5) / N * 2 * R - R, z = CEN[1] + (j + 0.5) / N * 2 * R - R;
      data[j * N + i] = Math.max(0, Math.min(255, Math.round((sdLand(x, z) - 0.62 + 3) / 16 * 255)));
    }
    const sdf = own(new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType)); sdf.magFilter = sdf.minFilter = THREE.LinearFilter; sdf.needsUpdate = true;
    W.seaU = { uTime: { value: 0 }, uDeep: { value: new THREE.Color(P.deep) }, uShallow: { value: new THREE.Color(P.shallow) }, uGrid: { value: new THREE.Color("#7cbde3") }, uSdf: { value: sdf }, uR: { value: R }, uC: { value: new THREE.Vector2(CEN[0], CEN[1]) } };
    const seaMat = own(new THREE.ShaderMaterial({
      uniforms: W.seaU, toneMapped: false,
      vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: `
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uGrid; uniform sampler2D uSdf; uniform float uR; uniform vec2 uC;
        varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float sdf(vec2 p){ vec2 uv = (p - uC) / (2.0 * uR) + 0.5; if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 13.0; return texture2D(uSdf, uv).r * 16.0 - 3.0; }
        void main(){
          vec2 p = vW.xz; float d = sdf(p);
          float shallow = 1.0 - smoothstep(0.0, 2.4, d);
          vec3 col = mix(uDeep, uShallow, shallow);
          vec2 gp = p * 0.5; vec2 f = abs(fract(gp + 0.5) - 0.5); vec2 fw = fwidth(gp) * 1.2;
          float line = 1.0 - min(smoothstep(0.0, fw.x, f.x), smoothstep(0.0, fw.y, f.y));
          col = mix(col, uGrid, line * 0.6 * (1.0 - shallow));
          vec2 cp = p / 3.0 + vec2(uTime * 0.03, 0.0); vec2 id = floor(cp); vec2 fc = fract(cp) - 0.5;
          float h = hash(id); vec2 o = vec2(h - 0.5, fract(h * 7.31) - 0.5) * 0.5; vec2 e = fc - o; e = vec2(e.x + e.y, e.y - e.x) * vec2(1.0, 4.0);
          float spark = smoothstep(0.1, 0.06, length(e)) * step(0.5, h) * (0.55 + 0.45 * sin(uTime * 0.9 + h * 30.0));
          col = mix(col, vec3(1.0), spark * 0.35 * (1.0 - shallow * 0.6));
          float w1 = 0.12 + 0.06 * sin(uTime * 1.3 + p.x * 0.8 + p.y * 0.6);
          float foam = smoothstep(w1 + 0.12, w1, d) * smoothstep(-0.3, -0.05, d);
          float d2 = d - (0.7 + 0.14 * sin(uTime * 0.9 + p.x * 0.5 - p.y * 0.4));
          float foam2 = (1.0 - smoothstep(0.0, 0.08, abs(d2))) * 0.5;
          col = mix(col, vec3(1.0), clamp(foam * 0.92 + foam2, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    const sea = new THREE.Mesh(own(new THREE.PlaneGeometry(160, 160)), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.y = SEA_Y; scene.add(sea);
  }

  // ---------- 道路：車道＋人行道（路口補角、路尾封口）＋中線虛線／單行道箭頭 ----------
  const ROADSEGS = [["W", "A"], ["A", "NW"], ["NW", "B"], ["B", "NE"], ["NE", "E"], ["E", "SE"], ["SE", "R"], ["R", "SW"], ["SW", "A"], ["E", [RIVER[0] + 0.02, 0]], [[RIVER[1] - 0.02, 0], "P"]];
  const pt = n => typeof n === "string" ? NODES[n] : n;
  function buildRoads() {
    const g = new THREE.Group(); scene.add(g);
    const laneTop = 0.05, walkTop = 0.085, off = RW / 2 + SW / 2, dirs = {};
    for (const [a, b] of ROADSEGS) {
      const [x0, z0] = pt(a), [x1, z1] = pt(b), dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0), len = Math.hypot(x1 - x0, z1 - z0);
      const ea = typeof a === "string" ? RW / 2 : 0, eb = typeof b === "string" ? RW / 2 : 0;   // 接到路口／路尾就多鋪半格，接到河岸就剛好停
      const L = len + ea + eb, c0 = -ea + L / 2;
      const cx = x0 + dx * c0, cz = z0 + dz * c0, vert = !!dz;
      vm(box(vert ? RW : L, laneTop, vert ? L : RW), P.lane, { x: cx, y: laneTop / 2, z: cz, parent: g, shadow: false });
      const sL = len - (typeof a === "string" ? RW / 2 : 0) - (typeof b === "string" ? RW / 2 : 0), s0 = (typeof a === "string" ? RW / 2 : 0) + sL / 2;
      for (const sd of [-1, 1]) vm(box(vert ? SW : sL, walkTop, vert ? sL : SW), P.walk, { x: x0 + dx * s0 + (vert ? sd * off : 0), y: walkTop / 2, z: z0 + dz * s0 + (vert ? 0 : sd * off), parent: g, shadow: false });
      if (typeof a === "string") (dirs[a] = dirs[a] || new Set()).add(`${dx},${dz}`);
      if (typeof b === "string") (dirs[b] = dirs[b] || new Set()).add(`${-dx},${-dz}`);
    }
    for (const [n, ds] of Object.entries(dirs)) {
      const [x, z] = NODES[n];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) vm(box(SW, walkTop, SW), P.walk, { x: x + sx * off, y: walkTop / 2, z: z + sz * off, parent: g, shadow: false });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!ds.has(`${dx},${dz}`)) vm(box(dz ? RW : SW, walkTop, dz ? SW : RW), P.walk, { x: x + dx * off, y: walkTop / 2, z: z + dz * off, parent: g, shadow: false });
    }
    // 倉庫前的水泥廣場（卸貨區）
    vm(box(4.2, 0.03, 2.9), P.plaza, { x: -8.3, y: 0.015, z: -0.45, parent: g, shadow: false });
    // 中線虛線（雙向路才畫；單行道換成箭頭）
    const dashGeo = [];
    for (const e of EDGES) {
      if (e.bridge || (T.oneway && e.loop)) continue;
      const [ax, az] = NODES[e.a], [bx, bz] = NODES[e.b], dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
      const len = e.id === "E-BW" ? RIVER[0] - ax : e.id === "BE-P" ? e.len : e.len;
      const start = e.id === "BE-P" ? (RIVER[1] - ax) + 0.3 : 0.95;
      for (let u = start; u < len - 0.9; u += 0.62) dashGeo.push(paint(box(dz ? 0.07 : 0.3, 0.012, dz ? 0.3 : 0.07).translate(ax + dx * (u + 0.15), laneTop + 0.006, az + dz * (u + 0.15)), P.dash));
    }
    if (dashGeo.length) { const m = mergeGeometries(dashGeo); dashGeo.forEach(x => x.dispose()); mesh(m, vcMat, { parent: g, shadow: false }); }
    mergeStatic(g);
    // 單行道箭頭（白色、可以閃）
    W.arrows = [];
    if (T.oneway) {
      const tex = canvasTex(64, 96, (c, w, h) => { c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(w / 2, 4); c.lineTo(w - 6, 42); c.lineTo(w * 0.66, 42); c.lineTo(w * 0.66, h - 4); c.lineTo(w * 0.34, h - 4); c.lineTo(w * 0.34, 42); c.lineTo(6, 42); c.closePath(); c.fill(); });
      W.arrowMat = own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffffff, toneMapped: false }));
      const ag = own(new THREE.PlaneGeometry(0.46, 0.7)); ag.rotateX(-Math.PI / 2);
      for (const e of EDGES) if (e.loop) {
        const [ax, az] = NODES[e.a], [bx, bz] = NODES[e.b], dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
        const n = Math.max(1, Math.round((e.len - 1.4) / 1.7));
        for (let k = 0; k < n; k++) { const u = 0.7 + (e.len - 1.4) * (k + 0.5) / n; const m = mesh(ag, W.arrowMat, { x: ax + dx * u, y: laneTop + 0.008, z: az + dz * u, ry: Math.atan2(-dx, -dz), shadow: false }); m.renderOrder = 2; W.arrows.push(m); }
      }
    }
  }

  // ---------- 吊橋（兩片橋面從兩岸升起；升起時兩頭柵欄放下、紅燈閃） ----------
  function buildBridge() {
    const g = new THREE.Group(); scene.add(g); W.bridge = { a: 1, target: 1, leaves: [], gates: [], lamps: [] };
    const plank = canvasTex(64, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#b87a48" : "#c98a55"; c.fillRect(i * 8, 0, 8, h); } c.fillStyle = "rgba(0,0,0,0.12)"; for (let i = 0; i < 8; i++) c.fillRect(i * 8, 0, 1, h); });
    plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(2, 1);
    const deckM = own(new THREE.MeshLambertMaterial({ map: plank }));
    const half = (RIVER[1] - RIVER[0]) / 2;
    for (const side of [-1, 1]) {                             // -1＝西岸那片、1＝東岸那片
      const bank = side < 0 ? RIVER[0] : RIVER[1];
      vm(box(0.5, 1.0, RW + 0.7), "#b9b2a6", { x: bank - side * 0.2, y: -0.45, z: 0, parent: g });            // 橋台
      const pivot = new THREE.Group(); pivot.position.set(bank, 0.0, 0); pivot.userData.dyn = true; g.add(pivot);
      const leaf = new THREE.Group(); pivot.add(leaf);
      mesh(box(half + 0.02, 0.1, RW + 0.1), deckM, { x: -side * half / 2, y: -0.02, parent: leaf });
      for (const sz of [-1, 1]) {
        vm(box(half, 0.06, 0.06), "#ff6b5e", { x: -side * half / 2, y: 0.36, z: sz * (RW / 2 + 0.02), parent: leaf, shadow: false });
        for (let k = 0; k < 4; k++) vm(box(0.05, 0.32, 0.05), "#ffffff", { x: -side * (0.12 + k * (half - 0.24) / 3), y: 0.18, z: sz * (RW / 2 + 0.02), parent: leaf, shadow: false });
      }
      W.bridge.leaves.push({ pivot, side });
      // 橋塔：兩根白柱（紅條紋）＋橫樑＋頂上紅燈
      for (const sz of [-1, 1]) {
        const x = bank - side * 0.22, z = sz * (RW / 2 + 0.32);
        vm(box(0.22, 1.7, 0.22), "#f4f1ea", { x, y: 0.85, z, parent: g });
        for (const yy of [0.5, 1.0]) vm(box(0.235, 0.16, 0.235), "#ef5a4c", { x, y: yy, z, parent: g, shadow: false });
        const lamp = vm(new THREE.SphereGeometry(0.1, 10, 8), "#ff3b30", { x, y: 1.8, z, parent: g, shadow: false, glow: true, dyn: true }); W.bridge.lamps.push(lamp);
      }
      vm(box(0.24, 0.16, RW + 0.9), "#f4f1ea", { x: bank - side * 0.22, y: 1.62, z: 0, parent: g });
      // 柵欄（陸地那一側）：橋升起時放下擋路
      const gp = new THREE.Group(); gp.position.set(bank - side * 0.75, 0.42, RW / 2 + 0.2); gp.userData.dyn = true; g.add(gp);
      vm(box(0.16, 0.5, 0.16), "#4d5566", { x: 0, y: -0.17, z: 0, parent: g, shadow: false }).position.set(bank - side * 0.75, 0.25, RW / 2 + 0.2);
      const arm = mesh(box(0.08, 0.08, RW + 0.1), own(new THREE.MeshLambertMaterial({ map: stripeTex(["#ffffff", "#ef4b3f"], false, 5) })), { z: -(RW + 0.1) / 2, parent: gp, shadow: false });
      void arm; W.bridge.gates.push(gp);
    }
    // 河中間的石墩
    vm(cyl(0.32, 0.4, 1.0, 10), "#a8a196", { x: (RIVER[0] + RIVER[1]) / 2, y: SEA_Y + 0.3, z: RW / 2 + 0.55, parent: g });
    vm(cyl(0.32, 0.4, 1.0, 10), "#a8a196", { x: (RIVER[0] + RIVER[1]) / 2, y: SEA_Y + 0.3, z: -(RW / 2 + 0.55), parent: g });
    // 吊橋開關（西岸橋頭旁；有吊橋的任務才有）：點地圖上的吊橋或開關圖釘都會放下，放下就鎖住（櫻木花道 10-12）
    if (T.lever) {
      const lv = new THREE.Group(); lv.position.set(RIVER[0] - 0.62, 0.05, -(RW / 2 + 0.5)); g.add(lv);
      vm(box(0.34, 0.3, 0.26), "#4d5566", { y: 0.15, parent: lv });
      vm(box(0.36, 0.05, 0.28), "#ffd23f", { y: 0.31, parent: lv, shadow: false });
      const arm = new THREE.Group(); arm.position.y = 0.32; arm.userData.dyn = true; lv.add(arm);
      vm(box(0.05, 0.45, 0.05), "#d9dee6", { y: 0.22, parent: arm });
      W.leverKnob = vm(new THREE.SphereGeometry(0.09, 10, 8), "#ff5b4f", { y: 0.46, parent: arm }); W.leverArm = arm; arm.rotation.z = 0.6;
      W.anchors.BR = [RIVER[0] - 0.62, 1.25, -(RW / 2 + 0.5)];
    }
    mergeStatic(g);
    W.setBridgeAngle(1);
  }
  W.setBridgeAngle = a => {
    const B = W.bridge; B.a = a;
    for (const { pivot, side } of B.leaves) pivot.rotation.z = side < 0 ? a * 1.2 : -a * 1.2;
    for (const gp of B.gates) gp.rotation.x = (1 - Math.min(1, a * 1.6)) * Math.PI / 2 * 0.95;
  };

  // ---------- 施工三角錐（擋住整段路） ----------
  W.cones = {};
  async function buildCones() {
    const jobs = [];
    for (const [id, t] of T.cones) {
      const e = EDGES.find(x => x.id === id), [ax, az] = NODES[e.a], [bx, bz] = NODES[e.b];
      const g = new THREE.Group(); g.position.set(ax + (bx - ax) * t, 0.05, az + (bz - az) * t); g.rotation.y = bx !== ax ? Math.PI / 2 : 0; g.userData.dyn = true; scene.add(g);
      W.cones[id] = g;
      const board = own(new THREE.MeshLambertMaterial({ map: stripeTex(["#ff8a3d", "#ffffff"], true, 4) }));
      mesh(box(RW * 0.95, 0.2, 0.06), board, { y: 0.42, parent: g });
      for (const s of [-1, 1]) vm(box(0.06, 0.42, 0.06), "#4d5566", { x: s * RW * 0.38, y: 0.21, parent: g });
      for (const s of [-1, 0, 1]) jobs.push(kenney("car-kit", "cone", { scale: 0.62, x: s * 0.42, z: 0.32, parent: g }));
      for (const s of [-1, 1]) jobs.push(kenney("city-kit-roads", "construction-light", { scale: 2.6, x: s * (RW / 2 + 0.05), z: -0.05, parent: g }));
      const lamp = vm(new THREE.SphereGeometry(0.06, 8, 6), "#ffb020", { y: 0.6, parent: g, glow: true, shadow: false }); g.userData.lamp = lamp;
    }
    await Promise.all(jobs.map(j => j.catch(() => null)));
  }

  // ---------- 三戶人家：Kenney 房子（換屋頂色）＋門牌＋車道＋花＋居民 ----------
  async function buildHouses(active) {
    const jobs = [], hg = [];
    for (const id of HOUSE_IDS) {
      const H = HOUSES[id], [hx, hz] = H.at, g = new THREE.Group(); g.position.set(hx, 0, hz); scene.add(g);
      jobs.push(kenney("city-kit-suburban", H.kit, { scale: 2.05, parent: g, ry: H.ry, tints: [[0, 1, H.roof], [1, 3, H.roof], [3, 2, H.wall]] }));
      const [sx, sz] = NODES[id];
      vm(box(0.9, 0.03, Math.abs(sz - hz) - 1.5), "#d9d3ca", { x: 0, y: 0.03, z: (sz - hz) / 2 + Math.sign(sz - hz) * 0.25, parent: g, shadow: false });   // 門口小路
      // 門牌（國字＋注音）
      const sign = new THREE.Group(); sign.position.set(-1.05, 0, (sz - hz) - Math.sign(sz - hz) * 1.1); g.add(sign);
      vm(box(0.07, 0.75, 0.07), "#6b4a2f", { y: 0.37, parent: sign });
      const tex = canvasTex(256, 112, (c, w, h) => { c.fillStyle = "#fffaf0"; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 22); c.fill(); c.lineWidth = 7; c.strokeStyle = H.color; c.stroke(); drawZhuyinText(c, H.sign, w / 2 - 6, h / 2 + 2, 50, "#4a3426"); });
      mesh(box(0.98, 0.43, 0.05), [mat("#e8dcc8"), mat("#e8dcc8"), mat("#e8dcc8"), mat("#e8dcc8"), own(new THREE.MeshLambertMaterial({ map: tex })), mat("#e8dcc8")], { y: 0.86, parent: sign });
      // 花圃
      for (let k = 0; k < 8; k++) { const fx = -0.75 + (k % 4) * 0.17, fz = (sz - hz) - Math.sign(sz - hz) * (1.42 + (k > 3 ? 0.17 : 0)); vm(new THREE.IcosahedronGeometry(0.085, 0), ["#ff8fb1", "#ffd75e", "#ffffff", "#c79bff"][k % 4], { x: fx, y: 0.1, z: fz, parent: g, shadow: false }); }
      vm(new THREE.IcosahedronGeometry(0.26, 0), "#6cb455", { x: -1.55, y: 0.2, z: (sz - hz) - Math.sign(sz - hz) * 1.45, parent: g, shadow: false });
      hg.push(g);
      W.anchors[id] = [hx + 0.15, 1.75, sz - Math.sign(sz - hz) * 1.25];        // 圖釘浮在門口車道上方
      W.keys.push([hx - 1.4, 0, hz - 1.1], [hx + 1.4, 0, hz + 1.1], [hx - 1.4, 2.4, hz - 1.1], [hx + 1.4, 2.4, hz + 1.1]);
      if (active.has(id)) jobs.push(zyModel(H.pet, H.pet === "bunny" ? 1.0 : 0.82).then(m => {
        if (!m) return; const side = Math.sign(sz - hz), home = [hx + 1.0, sz - side * 1.12], out = [sx + 1.45, sz - side * 0.82];
        m.position.set(home[0], 0.085, home[1]); m.rotation.y = side > 0 ? 0 : Math.PI; scene.add(m); m.userData.dyn = true; W.shDirty = true;
        W.residents[id] = { obj: m, home, out, face: m.rotation.y, at: "home", phase: Math.random() * 6, hop: 0, spin: 0 };
      }).catch(() => null));
    }
    await Promise.all(jobs.map(j => j.catch ? j.catch(() => null) : j));
    for (const g of hg) mergeStatic(g);
  }

  // ---------- 倉庫：彩虹條紋屋簷、招牌、貨箱木桶、吊橋開關、小碼頭＋貨船 ----------
  async function buildWarehouse() {
    const g = new THREE.Group(); g.position.set(-8.25, 0, -2.75); scene.add(g);
    const BW = 3.5, BH = 1.55, BD = 2.2;
    vm(rbox(BW, BH, BD, 0.08), P.cream, { y: BH / 2, parent: g });
    const roof = new THREE.CylinderGeometry(BD / 2 + 0.12, BD / 2 + 0.12, BW + 0.3, 18, 1, false, 0, Math.PI); roof.rotateZ(Math.PI / 2); roof.rotateX(Math.PI / 2);
    vm(roof, P.purple, { y: BH, parent: g });
    vm(box(BW + 0.32, 0.1, 0.1), "#6d56b4", { y: BH + 0.02, z: BD / 2 + 0.08, parent: g });
    // 大門＋鐵捲門條紋
    vm(box(1.8, 1.15, 0.06), "#59606f", { x: -0.35, y: 0.6, z: BD / 2 + 0.01, parent: g });
    for (let k = 0; k < 6; k++) vm(box(1.74, 0.03, 0.07), "#6f7787", { x: -0.35, y: 0.18 + k * 0.17, z: BD / 2 + 0.03, parent: g, shadow: false });
    vm(box(0.55, 0.45, 0.06), "#9fd6ff", { x: 1.15, y: 0.95, z: BD / 2 + 0.01, parent: g, shadow: false });   // 小窗
    // 彩虹條紋屋簷（斜斜的）
    const rainbow = own(new THREE.MeshLambertMaterial({ map: stripeTex(["#ff5b5b", "#ff9a3d", "#ffd84a", "#62cf6b", "#4fa6ff", "#5d6bea", "#a678e8"]) }));
    mesh(box(2.4, 0.06, 0.85), rainbow, { x: -0.35, y: 1.33, z: BD / 2 + 0.38, rx: 0.38, parent: g });
    for (let k = 0; k < 7; k++) vm(new THREE.SphereGeometry(0.075, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), ["#ff5b5b", "#ff9a3d", "#ffd84a", "#62cf6b", "#4fa6ff", "#5d6bea", "#a678e8"][k], { x: -1.5 + k * 0.383, y: 1.17, z: BD / 2 + 0.78, rx: Math.PI, parent: g, shadow: false });
    // 招牌（國字＋注音）
    const sign = canvasTex(512, 128, (c, w, h) => { c.fillStyle = "#ffffff"; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 30); c.fill(); c.lineWidth = 8;
      const grd = c.createLinearGradient(0, 0, w, 0); ["#ff5b5b", "#ff9a3d", "#ffd84a", "#62cf6b", "#4fa6ff", "#a678e8"].forEach((col, i) => grd.addColorStop(i / 5, col)); c.strokeStyle = grd; c.stroke();
      drawZhuyinText(c, "彩虹配送站", w / 2 - 8, h / 2 + 2, 56, "#5a3fa8"); });
    mesh(box(2.6, 0.66, 0.06), [mat("#ffffff"), mat("#ffffff"), mat("#ffffff"), mat("#ffffff"), own(new THREE.MeshLambertMaterial({ map: sign })), mat("#ffffff")], { y: BH + 0.42, z: BD / 2 + 0.2, rx: -0.12, parent: g });
    vm(box(0.06, 0.5, 0.06), "#6d56b4", { x: -0.95, y: BH + 0.05, z: BD / 2 + 0.14, parent: g }); vm(box(0.06, 0.5, 0.06), "#6d56b4", { x: 0.95, y: BH + 0.05, z: BD / 2 + 0.14, parent: g });
    // 卸貨平台
    vm(box(2.6, 0.22, 0.7), "#c9c1b2", { x: -0.35, y: 0.11, z: BD / 2 + 0.36, parent: g });
    W.anchors.W = [-7.55, 1.6, -0.15];
    W.keys.push([-10.2, 0, -3.9], [-6.4, 0, -1.4], [-10.2, 2.9, -3.9], [-6.4, 2.9, -1.4], [-10.6, 0, 1.2]);
    mergeStatic(g);
    // 貨箱、木桶、紙箱、貨櫃、小碼頭、貨船
    const P2 = (x, z) => [x + 8.25, z + 2.75];
    const jobs = [
      kenney("watercraft-pack", "cargo-container-a", { scale: 0.62, parent: g, x: P2(-10.0, -0.6)[0], z: P2(-10.0, -0.6)[1], ry: 0.04 }),
      kenney("pirate-kit", "crate", { scale: 0.42, parent: g, x: 1.95, z: 0.95, ry: 0.3 }),
      kenney("pirate-kit", "crate", { scale: 0.36, parent: g, x: 1.98, z: 0.98, y: 0.33, ry: -0.2 }),
      kenney("pirate-kit", "barrel", { scale: 0.26, parent: g, x: 2.05, z: -0.2 }),
      kenney("pirate-kit", "barrel", { scale: 0.22, parent: g, x: 2.1, z: -0.65 }),
      kenney("car-kit", "box", { scale: 0.5, parent: g, x: -2.0, z: 1.55, ry: 0.4 }),
      kenney("car-kit", "box", { scale: 0.42, parent: g, x: -2.05, z: 1.6, y: 0.36, ry: -0.2 }),
      kenney("car-kit", "box", { scale: 0.44, parent: g, x: -1.55, z: 1.75, ry: 0.1 }),
      kenney("pirate-kit", "structure-platform-dock", { scale: 0.62, parent: scene, x: -11.55, z: -1.9, y: -0.22 - 1.31 * 0.62 }),
      kenney("pirate-kit", "structure-platform-dock", { scale: 0.62, parent: scene, x: -13.1, z: -1.9, y: -0.22 - 1.31 * 0.62 }),
      kenney("watercraft-pack", "ship-cargo-a", { scale: 0.3, parent: scene, x: -13.0, z: 0.25, y: SEA_Y - 0.12, ry: Math.PI / 2 + 0.08, shadow: false }).then(s => { if (s) { s.userData.dyn = true; W.tick.push(t => { s.position.y = SEA_Y - 0.12 + Math.sin(t * 1.3) * 0.03; s.rotation.z = Math.sin(t * 1.0) * 0.02; }); } return s; }),
    ];
    await Promise.all(jobs.map(j => j.catch(() => null)));
  }

  // ---------- 裝飾：樹、灌木、花、路燈、小豬的泥巴坑 ----------
  async function buildDecor() {
    const g = new THREE.Group(); scene.add(g); const jobs = [];
    const TREES = [[-4.0, -6.2, 1], [-5.6, -5.3, 0], [-2.7, -6.6, 0], [2.2, -5.4, 1], [3.6, -6.4, 0], [1.6, -6.9, 0], [-3.2, -1.6, 1], [1.7, -1.6, 0], [-3.4, 1.9, 0], [1.9, 1.4, 1],
      [-6.3, 4.6, 0], [-2.6, 4.9, 1], [1.5, 4.9, 0], [3.9, 4.2, 1], [-9.6, 3.2, 1], [-9.9, 1.8, 0], [11.4, -3.2, 1], [8.2, -3.5, 0], [11.6, 2.4, 0], [8.0, 2.6, 1]];
    for (const [x, z, big] of TREES) jobs.push(kenney("city-kit-suburban", big ? "tree-large" : "tree-small", { scale: big ? 2.5 : 2.7, x, z, parent: g, ry: x * 1.7 }));
    const rr = rng(7);
    for (let k = 0; k < 26; k++) { const x = -10 + rr() * 22, z = -7.4 + rr() * 13.2; if (!freeSpot(x, z, 0.6)) continue; vm(new THREE.IcosahedronGeometry(0.18 + rr() * 0.12, 0), rr() < 0.5 ? "#6cb455" : "#5fa346", { x, y: 0.15, z, parent: g, shadow: false }); }
    for (let k = 0; k < 60; k++) { const x = -10 + rr() * 22, z = -7.4 + rr() * 13.2; if (!freeSpot(x, z, 0.4)) continue; vm(new THREE.IcosahedronGeometry(0.06, 0), ["#ff8fb1", "#ffd75e", "#ffffff", "#c79bff", "#ff7e5f"][k % 5], { x, y: 0.1, z, parent: g, shadow: false }); }
    // 小豬的泥巴坑
    const mud = new THREE.CircleGeometry(0.62, 18); mud.rotateX(-Math.PI / 2); vm(mud, "#8a5a3a", { x: 11.2, y: 0.07, z: -0.95, parent: g, shadow: false });
    // 路燈（環狀路的人行道上）
    for (const [x, z] of [[-4.6 - 0.77, -1.7], [3.0 + 0.77, -1.7], [-2.6, -3.4 - 0.77], [1.2, 3.4 + 0.77], [-6.1, 0.77], [8.5, 0.77]]) jobs.push(kenney("fantasy-town-kit", "lantern", { scale: 0.62, x, z, y: 0.085, parent: g, tints: [[1, 2, "#3e7d68"], [7, 3, "#356b59"], [2, 2, "#fff0b3"]] }));
    mergeStatic(g);
    await Promise.all(jobs.map(j => j.catch(() => null)));
  }
  function freeSpot(x, z, pad) {                              // 裝飾別擺在路上、房子上、海裡
    if (sdLand(x, z) > -0.5) return false;
    for (const e of EDGES) { const [ax, az] = NODES[e.a], [bx, bz] = NODES[e.b]; const qx = Math.max(Math.min(ax, bx), Math.min(Math.max(ax, bx), x)), qz = Math.max(Math.min(az, bz), Math.min(Math.max(az, bz), z)); if (Math.hypot(x - qx, z - qz) < RW / 2 + SW + pad) return false; }
    for (const id of HOUSE_IDS) { const [hx, hz] = HOUSES[id].at; if (Math.abs(x - hx) < 1.6 + pad && Math.abs(z - hz) < 1.6 + pad) return false; }
    if (x > -10.6 && x < -5.8 && z > -4.2 && z < 1.4) return false;          // 倉庫一帶
    return true;
  }

  // ---------- 卡車（Kenney 平板貨車；車斗上看得到裝了什麼）＋彩虹小旗 ----------
  async function buildTruck() {
    const holder = new THREE.Group(); holder.userData.dyn = true; scene.add(holder);
    const body = new THREE.Group(); holder.add(body);
    W.truck = { holder, body, x: NODES.W[0], z: NODES.W[1], yaw: Math.PI / 2, bed: [], hop: 0 };
    holder.position.set(W.truck.x, 0.05, W.truck.z); holder.rotation.y = W.truck.yaw;
    let ok = false;
    try { const m = await kenney("car-kit", "delivery-flat", { scale: TS, parent: body }); ok = !!m; } catch (e) { ok = false; }
    if (!ok && !W.dead) {                                      // 模型載不到：方塊玩具車頂著
      vm(rbox(0.85, 0.55, 0.75, 0.08), "#ff7e44", { y: 0.45, z: 0.6, parent: body });
      vm(box(0.85, 0.12, 1.2), "#868ba1", { y: 0.3, z: -0.4, parent: body });
      for (const [x, z] of [[0.4, 0.6], [-0.4, 0.6], [0.4, -0.6], [-0.4, -0.6]]) { const w = cyl(0.16, 0.16, 0.12, 10); w.rotateZ(Math.PI / 2); vm(w, "#3a3f4a", { x, y: 0.16, z, parent: body }); }
    }
    const pole = new THREE.Group(); pole.position.set(-0.3, TS * 1.35, TS * 0.35); body.add(pole);
    vm(cyl(0.015, 0.015, 0.42, 6), "#e8e6e1", { y: 0.21, parent: pole, shadow: false });
    mesh(box(0.01, 0.16, 0.26), own(new THREE.MeshLambertMaterial({ map: stripeTex(["#ff5b5b", "#ff9a3d", "#ffd84a", "#62cf6b", "#4fa6ff", "#a678e8"]), side: THREE.DoubleSide })), { y: 0.34, z: -0.13, parent: pole, shadow: false });
    W.keys.push([-7.6, 1.2, 0.5]);
    await Promise.all(T.shelf.map(g => goodModel(g).catch(() => null)));   // 先載好商品小模型，裝貨時馬上出現
  }
  // 車斗：照車廂內容擺商品小模型（新放上去的跳一下）
  W.bedSync = cargo => { W.bedWant = cargo.slice(); W.bedQ = (W.bedQ || Promise.resolve()).then(syncBed).catch(() => null); return W.bedQ; };
  async function syncBed() {
    const tr = W.truck; if (!tr || W.dead) return;
    const want = W.bedWant.slice(), cap = T.cap, keep = [];
    for (const it of tr.bed) { const i = want.findIndex((g, k) => g === it.g && !keep[k]); if (i >= 0 && !keep[i]) keep[i] = it; else { it.obj.removeFromParent(); } }
    tr.bed = [];
    for (let k = 0; k < want.length; k++) {
      let it = keep[k];
      if (!it) { const obj = await goodModel(want[k]); if (!obj || W.dead) continue; it = { g: want[k], obj }; tr.body.add(obj); const o2 = obj; tween(0.35, u => o2.scale.setScalar(Math.max(0.01, easeOutBack(u)))); }
      const zs = cap === 1 ? [(BED.z0 + BED.z1) / 2] : Array.from({ length: cap }, (_, i) => BED.z0 + (BED.z1 - BED.z0) * i / (cap - 1));
      it.obj.position.set(0, BED.y * TS, zs[cap - 1 - k] * TS + (cap > 2 ? 0 : 0)); it.obj.rotation.y = (k % 2 ? 0.4 : -0.3);
      tr.bed.push(it);
    }
    W.shDirty = true;                                          // 車斗拿掉／重排商品：陰影跟著重畫
  }

  // ---------- 居民動作 ----------
  W.residentGo = (id, where) => {
    const r = W.residents[id]; if (!r || r.at === where) return;
    const from = r.obj.position.clone(), to = where === "out" ? r.out : r.home; r.at = where;
    const face = Math.atan2(to[0] - from.x, to[1] - from.z);
    tween(0.55, u => { r.obj.position.x = from.x + (to[0] - from.x) * ease(u); r.obj.position.z = from.z + (to[1] - from.z) * ease(u); r.obj.position.y = 0.085 + Math.abs(Math.sin(u * Math.PI * 2)) * 0.12; r.obj.rotation.y = r.face + angDiff(r.face, face) * Math.min(1, u * 3); },
      () => { const tx = where === "out" ? W.truck.x : r.obj.position.x, tz = where === "out" ? W.truck.z : r.obj.position.z + (HOUSES[id].at[1] < NODES[id][1] ? 1 : -1);
        r.face = r.obj.rotation.y; const f2 = Math.atan2(tx - r.obj.position.x, tz - r.obj.position.z), f1 = r.face; tween(0.25, u => { r.obj.rotation.y = f1 + angDiff(f1, f2) * u; }, () => { r.face = r.obj.rotation.y; }); });
  };
  W.residentHappy = id => { const r = W.residents[id]; if (!r) return; tween(0.9, u => { r.obj.position.y = 0.085 + Math.abs(Math.sin(u * Math.PI * 2)) * 0.45; r.obj.scale.setScalar(1 + Math.sin(u * Math.PI * 2) * 0.06); }, () => r.obj.scale.setScalar(1), id); };
  W.residentShake = id => { const r = W.residents[id]; if (!r) return; const f = r.face; tween(0.7, u => { r.obj.rotation.y = f + Math.sin(u * Math.PI * 4) * 0.5 * (1 - u); }, () => { r.obj.rotation.y = f; }); };
  W.residentWave = id => { const r = W.residents[id]; if (!r || W.tw.some(t => t.tag === id)) return; const f = r.face, y0 = r.obj.position.y; tween(0.8, u => { r.obj.position.y = y0 + Math.abs(Math.sin(u * Math.PI * 2)) * 0.3; r.obj.rotation.y = f + Math.sin(u * Math.PI * 2) * 0.7; }, () => { r.obj.rotation.y = f; r.obj.position.y = y0; }, id); };
  W.residentsWave = () => { Object.keys(W.residents).forEach((id, i) => { const r = W.residents[id]; tween(1.6, u => { const v = Math.max(0, u - i * 0.12); r.obj.position.y = 0.085 + Math.abs(Math.sin(v * Math.PI * 3)) * 0.4; r.obj.rotation.y = r.face + Math.sin(v * Math.PI * 2) * 0.6; }); }); };

  // ---------- 卡車行駛：沿路線（轉角圓弧）平順開、會轉向；需要掉頭就原地轉一圈小跳 ----------
  function smooth(nodes) {
    const P0 = nodes.map(n => new THREE.Vector2(...NODES[n])), out = [P0[0].clone()];
    for (let i = 1; i < P0.length - 1; i++) {
      const a = P0[i - 1], p = P0[i], b = P0[i + 1], d1 = p.clone().sub(a), d2 = b.clone().sub(p), l1 = d1.length(), l2 = d2.length(); d1.normalize(); d2.normalize();
      if (d1.dot(d2) > 0.999) { out.push(p.clone()); continue; }
      const r = Math.min(0.95, l1 * 0.45, l2 * 0.45), s = p.clone().addScaledVector(d1, -r), e = p.clone().addScaledVector(d2, r);
      for (let k = 0; k <= 8; k++) { const t = k / 8, mt = 1 - t; out.push(new THREE.Vector2(mt * mt * s.x + 2 * mt * t * p.x + t * t * e.x, mt * mt * s.y + 2 * mt * t * p.y + t * t * e.y)); }
    }
    out.push(P0[P0.length - 1].clone());
    const cum = [0]; for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + out[i].distanceTo(out[i - 1]));
    return { pts: out, cum, total: cum[cum.length - 1] };
  }
  function sampleAt(path, s) {
    const { pts, cum } = path; let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
    const f = Math.max(0, Math.min(1, (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])));
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, z: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f, yaw: Math.atan2(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) };
  }
  W.drive = (r, onArrive) => {
    const path = smooth(r.nodes), tr = W.truck, y0 = Math.atan2(path.pts[1].x - path.pts[0].x, path.pts[1].y - path.pts[0].y);
    W.driving = { path, s: 0, v: 0, onArrive, spin: Math.abs(angDiff(tr.yaw, y0)) > 1.75 ? { t0: W.gt, from: tr.yaw, to: tr.yaw + angDiff(tr.yaw, y0) } : null, nextSound: 0 };
  };
  function stepDrive(dt) {
    const D = W.driving, tr = W.truck; if (!D || !tr) return;
    if (D.spin) {
      const u = Math.min(1, (W.gt - D.spin.t0) / 0.5);
      tr.yaw = D.spin.from + (D.spin.to - D.spin.from) * ease(u); tr.hop = Math.sin(u * Math.PI) * 0.22;
      if (u >= 1) { D.spin = null; tr.hop = 0; }
    } else {
      const left = D.path.total - D.s;
      D.v = Math.min(VMAX, D.v + ACC * dt, Math.sqrt(2 * ACC * 0.9 * Math.max(0, left)) + 0.35);
      D.s = Math.min(D.path.total, D.s + D.v * dt);
      const p = sampleAt(D.path, D.s); tr.x = p.x; tr.z = p.z;
      tr.yaw += angDiff(tr.yaw, p.yaw) * Math.min(1, dt * 14);
      if (D.s >= D.nextSound) { D.nextSound += 3.2; o.play("truck_drive"); }
      if (D.s >= D.path.total - 1e-4) { W.driving = null; const end = D.path.pts[D.path.pts.length - 1]; tr.x = end.x; tr.z = end.y; D.onArrive && D.onArrive(); }
    }
  }
  W.honk = () => { const tr = W.truck; if (!tr) return; tween(0.4, u => { tr.hop = Math.sin(u * Math.PI) * 0.12; }); };

  // ---------- 閃爍提示（擋路的東西） ----------
  W.flashBridge = () => { const B = W.bridge; if (!B) return; B.blink = W.gt + 2.2; for (const { pivot } of B.leaves) { const z0 = pivot.rotation.z; tween(0.8, u => { pivot.rotation.z = z0 + Math.sin(u * Math.PI * 6) * 0.06 * (1 - u); }, () => { pivot.rotation.z = z0; }); } };
  W.flashCones = ids => { for (const id of ids) { const g = W.cones[id]; if (!g) continue; g.userData.blink = W.gt + 2.2; tween(0.9, u => { const s = 1 + Math.sin(u * Math.PI * 6) * 0.12 * (1 - u); g.scale.setScalar(s); }, () => g.scale.setScalar(1)); } };
  W.flashArrows = () => { if (W.arrowMat) W.arrowBlink = W.gt + 2.4; };
  W.setLever = down => { if (!W.leverArm) return; const a0 = W.leverArm.rotation.z, a1 = down ? -0.6 : 0.6; tween(0.3, u => { W.leverArm.rotation.z = a0 + (a1 - a0) * easeOutBack(u); }); };
  W.bridgeTo = down => { if (W.bridge) W.bridge.target = down ? 0 : 1; };   // 遊戲只會放下（放下後鎖住）

  // ---------- 鏡頭：整張地圖放進「地圖區」（上下 UI 之間），圖釘也要放得下 ----------
  W.fit = (rect, Wpx, Hpx, pinPx) => {
    W.size = [Wpx, Hpx]; renderer.setSize(Wpx, Hpx, false);
    const inv = cam.matrixWorldInverse, vs = W.keys.map(p => _v.set(...p).applyMatrix4(inv).clone()), an = Object.values(W.anchors).map(p => _v.set(...p).applyMatrix4(inv).clone());
    let k = 30;
    for (let it = 0; it < 4; it++) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const v of vs) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      for (const v of an) { x0 = Math.min(x0, v.x - pinPx * 0.5 / k); x1 = Math.max(x1, v.x + pinPx * 0.5 / k); y1 = Math.max(y1, v.y + pinPx * 1.25 / k); }
      k = Math.min(rect.w / (x1 - x0), rect.h / (y1 - y0));
      W.box = [x0, x1, y0, y1];
    }
    const [x0, x1, y0, y1] = W.box;
    cam.left = (x0 + x1) / 2 - (rect.x + rect.w / 2) / k; cam.right = cam.left + Wpx / k;
    cam.top = (y0 + y1) / 2 + (rect.y + rect.h / 2) / k; cam.bottom = cam.top - Hpx / k;
    cam.updateProjectionMatrix(); W.k = k;
  };
  W.project = (x, y, z) => { _v.set(x, y, z).project(cam); return { x: (_v.x + 1) / 2 * W.size[0], y: (1 - _v.y) / 2 * W.size[1] }; };
  W.truckScreen = () => { const tr = W.truck; if (!tr) return null; const c = W.project(tr.x, 0.45, tr.z); return { x: c.x, y: c.y, w: TRUCK_LEN * W.k * 1.05, h: TRUCK_LEN * W.k * 0.75 }; };
  W.residentScreen = id => { const r = W.residents[id]; if (r) return W.project(r.obj.position.x, 0.6, r.obj.position.z); const [x, z] = NODES[id]; return W.project(x, 0.6, z); };
  const boxScreen = (x0, x1, y0, y1, z0, z1) => { let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) { const p = W.project(x, y, z); l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y); } return { x: (l + r) / 2, y: (t + b) / 2, w: r - l, h: b - t }; };
  W.houseScreen = id => { const [hx, hz] = HOUSES[id].at; return boxScreen(hx - 1.4, hx + 1.4, 0, 2.3, hz - 1.0, hz + 1.0); };
  W.bridgeScreen = () => boxScreen(RIVER[0] - 0.2, RIVER[1] + 0.2, 0, 1.7, -0.8, 0.8);
  W.bedScreen = () => { const tr = W.truck; if (!tr) return null; const lz = (BED.z0 + BED.z1) / 2 * TS; return W.project(tr.x + Math.sin(tr.yaw) * lz, 0.7, tr.z + Math.cos(tr.yaw) * lz); };

  // ---------- 每格 ----------
  const moving = () => W.tw.length > 0 || !!W.driving || !!(W.bridge && Math.abs(W.bridge.a - W.bridge.target) > 1e-4);   // 卡車在開／原地轉、吊橋在動、任何補間（居民跳、商品彈出、柵欄、開關）
  W.frame = dt => {
    if (W.dead) return;
    const mv0 = moving();                                      // 這一格前就在動：動完的最後一格也要重畫陰影
    W.gt += dt; stepTweens(); stepDrive(dt);
    const B = W.bridge;
    if (B && Math.abs(B.a - B.target) > 1e-4) W.setBridgeAngle(B.a + Math.sign(B.target - B.a) * Math.min(Math.abs(B.target - B.a), dt / 1.3));
    if (B) { const on = B.a > 0.02 && Math.sin(W.gt * (B.blink > W.gt ? 14 : 4)) > 0; for (const l of B.lamps) l.visible = on; }
    for (const g of Object.values(W.cones)) if (g.userData.lamp) g.userData.lamp.visible = Math.sin(W.gt * (g.userData.blink > W.gt ? 16 : 3)) > -0.2;
    if (W.arrowMat) W.arrowMat.color.set(W.arrowBlink > W.gt && Math.sin(W.gt * 14) > 0 ? "#ffd54a" : "#ffffff");
    const tr = W.truck;
    if (tr) { tr.holder.position.set(tr.x, 0.05 + tr.hop + (W.driving && !W.driving.spin ? Math.abs(Math.sin(W.gt * 18)) * 0.012 : 0), tr.z); tr.holder.rotation.y = tr.yaw; }
    for (const id in W.residents) { const r = W.residents[id]; if (!W.tw.some(t => t.tag === id)) r.obj.scale.set(1, 1 + Math.sin(W.gt * 2.2 + r.phase) * 0.025, 1); }
    const cyc = Math.floor(W.gt / 3.2);                        // 在家門口等的居民輪流輕輕跳一下（招手的感覺）
    if (cyc !== W.hopCyc) { W.hopCyc = cyc; const ids = Object.keys(W.residents).filter(id => W.residents[id].at === "home" && !W.tw.some(t => t.tag === id));
      if (ids.length && cyc > 0) { const id = ids[cyc % ids.length], r = W.residents[id]; tween(0.45, u => { r.obj.position.y = 0.085 + Math.sin(u * Math.PI) * 0.16; }, () => { r.obj.position.y = 0.085; }, id); } }
    for (const f of W.tick) f(W.gt);
    if (W.seaU) W.seaU.uTime.value = W.gt;
    if (W.live) {                                              // 模型＋著色器都備好才開始畫（第一格一次編十幾個著色器＋陰影，慢的平板會被系統收走 context）
      if (W.shDirty || (dt > 0 && (mv0 || moving()))) { renderer.shadowMap.needsUpdate = true; W.shDirty = false; }   // 效能體檢 10-12：靜止時不重畫陰影（原本每格一次）
      renderer.render(scene, cam);
    }
  };
  W.setDpr = d => { W.dpr = dprMem = d; renderer.setPixelRatio(d); };   // 自動畫質（遊戲本體的 frame()）；setPixelRatio 會照目前大小重設畫布
  // 預先（非同步）編好所有著色器，再畫第一格
  W.warm = async () => {
    if (W.dead) return;
    try {
      if (renderer.compileAsync && renderer.extensions.has("KHR_parallel_shader_compile")) await renderer.compileAsync(scene, cam);
      else { renderer.compile(scene, cam); await new Promise(r => requestAnimationFrame(() => r())); }   // 沒有平行編譯（iPad Safari）：先同步編好，下一格才畫
    } catch (e) { /* 編不好就照常畫 */ }
    if (!W.dead) W.live = true;
  };
  W.stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures });
  W.dispose = () => {
    if (W.dead) return; W.dead = true;
    const geos = new Set(), mats = new Set();
    scene.traverse(x => { if (x.geometry) geos.add(x.geometry); for (const m of [].concat(x.material || [])) mats.add(m); });
    geos.forEach(gg => gg.dispose());
    for (const m of [...mats, ...res.mats.values(), ...res.kit.values()]) if (m && m.dispose) m.dispose();
    for (const x of res.own) if (x && x.dispose) x.dispose();
    try { renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); } catch (e) {}
    renderer.domElement.removeEventListener("webglcontextlost", lost); renderer.domElement.removeEventListener("webglcontextrestored", restored); clearTimeout(W.lostT);
    renderer.domElement.remove();
    renderer.domElement.width = renderer.domElement.height = 1;   // Safari：畫布縮到 1×1 才會放掉背景緩衝（里維 10-12）
    CTX.live--;
  };
  W.canvas = renderer.domElement;

  // 建場景：程式生成的先（不用下載），模型背景載入；全部好了（或 6 秒）才淡入
  // 建到一半丟錯：先把 renderer／context 收乾淨再丟出去（start() 會接住、走 onFail），不然每失敗一次就漏一個 WebGL context（里維 10-12）
  try {
    const active = new Set(T.orders.map(o => o[0]));
    for (const id of HOUSE_IDS) if (reachableHouse(ti, id)) active.add(id);
    for (const n of Object.values(NODES)) W.keys.push([n[0] - 0.8, 0, n[1] - 0.8], [n[0] + 0.8, 0, n[1] + 0.8]);
    W.keys.push([RIVER[0], 1.9, 0], [RIVER[1], 1.9, 0]);
    if (o.failBuild) throw new Error("failBuild (test)");             // 測試用（deliver-lab ?failbuild=1）：模擬建到一半丟錯
    buildTerrain(); buildRoads(); buildBridge();
    W.ready = Promise.all([buildCones(), buildHouses(active), buildWarehouse(), buildDecor(), buildTruck()].map(p => p.catch(e => console.warn("[deliver] 3D 載入失敗", e))));
  } catch (e) { W.dispose(); throw e; }
  return W;
}
// 這一關畫圖釘的家：路走得到（吊橋算可以放下）的才畫
function reachableHouse(ti, id) { return !!route(ti, "W", id, 1); }

// ===================== 遊戲本體 =====================
export function createDeliverGame(root, api) {
  let run = 0;                 // 每次 start/stop 換號：舊的 later 回呼看到號碼不同就作廢
  let st = null, D = null, W = null, raf = 0;
  const offs = [], talkedIntro = new Set();
  let bridgeDemoShown = false; // 任務 5 第一次出現吊橋：手指示範開關在哪（新機制教學，只示範一次）
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
  const later = (fn, ms) => { const my = run; api.later(() => { if (my === run && st) fn(); }, ms); };   // 試玩頁的 later 自己會照 ?fast 加速
  const SPD = () => Math.max(0.25, +api.speed || 1);
  const play = n => { try { api.play(n); } catch (e) { /* 音效失敗不影響遊戲 */ } };
  const mk = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
  const T = () => TASKS[st.ti];
  const live = () => !!st && st.ready && !st.won && !api.paused();          // 開車中也收的操作（叭叭、揮手、放吊橋）
  const canAct = () => live() && !st.driving && !st.lock;
  const imgUrl = n => IMG + n + ".webp";
  const petUrl = id => (api.petImg ? api.petImg(id) : IMG + "pets/" + id + ".webp");
  const labels = () => !T().hidden;                            // 藏圖任務（4 起）貨架／車廂只放圖、不放字（櫻木花道 10-12：才有讀注音的意義）
  function picEl(parent, src, emoji, cls = "") {             // 圖片載不到就退回 emoji
    const im = mk("img", cls, parent); im.alt = ""; im.draggable = false; im.decoding = "async";
    im.onerror = () => { const s = document.createElement("span"); s.className = "dlv-emoji"; s.textContent = emoji; im.replaceWith(s); };
    im.src = src; return im;
  }

  // ---------- 語音：排隊一句一句講（主程式的 say 會切掉前一句） ----------
  const voice = { q: [], busy: false, tok: 0 };
  function speak(text, how = "talk", now = false) {
    if (!st) return;
    if (now) { voice.q.length = 0; voice.busy = false; voice.tok++; }
    voice.q.push({ text, how }); st.spoken.push({ text, how });
    if (!voice.busy) pump();
  }
  function pump() {
    const it = voice.q.shift(); if (!it) { voice.busy = false; return; }
    voice.busy = true; const my = ++voice.tok; let done = false;
    const fin = () => { if (done || my !== voice.tok) return; done = true; voice.busy = false; if (voice.q.length) later(pump, 120); };
    try { if (it.how === "say") api.say(it.text, undefined, fin); else api.talk(it.text, fin); } catch (e) { fin(); }
    later(fin, Math.max(1500, it.text.length * 320));
  }
  // 居民說話：頭上泡泡（同一戶先收掉舊的）＋語音（立刻講、蓋掉排隊中的）
  function houseSay(h, text, how = "talk", bad = false) { bubble(h, text, bad); speak(text, how, true); }

  // ---------- DOM ----------
  function build() {
    root.classList.add("dlv-root");
    const wrap = mk("div", "dlv-wrap", root);
    const stage = mk("div", "dlv-stage", wrap); mk("div", "dlv-loading", stage, "🚚");
    const hits = mk("div", "dlv-hits", wrap);                   // 居民、房子、吊橋的點擊區（在圖釘下面：疊到時圖釘優先）
    const houseHit = mk("button", "dlv-hit dlv-househit dlv-off", hits); houseHit.type = "button"; houseHit.setAttribute("aria-label", "交貨");
    const bridgeHit = mk("button", "dlv-hit dlv-bridgehit dlv-off", hits); bridgeHit.type = "button"; bridgeHit.setAttribute("aria-label", "吊橋");
    const pins = mk("div", "dlv-pins", wrap);
    const truckHit = mk("button", "dlv-truckhit", wrap); truckHit.type = "button"; truckHit.setAttribute("aria-label", "卡車");
    const orders = mk("div", "dlv-orders", wrap); orders.setAttribute("role", "status");
    const tools = mk("div", "dlv-tools", wrap);
    const replay = mk("button", "dlv-btn dlv-replay", tools, "🔊"); replay.type = "button"; replay.setAttribute("aria-label", "再聽一次");
    const hint = mk("button", "dlv-btn dlv-hint", tools, "💡"); hint.type = "button"; hint.setAttribute("aria-label", "提示");
    const shelf = mk("div", "dlv-shelf dlv-off", wrap);
    const cargo = mk("div", "dlv-cargo", wrap); mk("div", "dlv-cargo-ic", cargo, "🚚");
    const finger = mk("div", "dlv-finger", wrap, "👆");
    const fx = mk("div", "dlv-fx", wrap);
    D = { wrap, stage, hits, houseHit, bridgeHit, pins, truckHit, orders, tools, replay, hint, shelf, cargo, finger, fx, pinEl: {}, resHit: {}, cards: [], goods: {}, slots: [], bub: {} };
    on(truckHit, "click", () => tapTruck());
    on(houseHit, "click", () => intentGive());
    on(bridgeHit, "click", () => tapBridge());
    on(replay, "click", () => sayOrders());
    on(hint, "click", () => tapHint());
    on(cargo, "click", e => { if (!e.target.closest(".dlv-slot")) tapCargo(); });   // 點車廂面板空白處（🚚）＝跟點卡車一樣
  }
  function teardown() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    while (offs.length) offs.pop()();
    if (W) { W.dispose(); W = null; }
    if (D) { D.wrap.remove(); D = null; }
    root.classList.remove("dlv-root");
  }
  function renderOrders(anim) {
    D.orders.textContent = ""; D.cards = [];
    T().orders.forEach(([h, g], i) => {
      const H = HOUSES[h], c = mk("div", "dlv-card" + (anim ? " dlv-in" : ""), D.orders); c.style.setProperty("--c", H.color); c.style.setProperty("--cd", H.dark);
      if (anim) c.style.animationDelay = (i * 0.16) + "s";
      const av = mk("div", "dlv-card-av", c); picEl(av, petUrl(H.pet), "🐾");
      const pic = mk("div", "dlv-card-pic", c); mk("div", "dlv-card-name", c, GOODS[g].h); mk("div", "dlv-card-ok", c, "✓");
      c.setAttribute("aria-label", `${H.name}：${GOODS[g].h}`);
      D.cards.push({ el: c, pic }); paintCard(i);
    });
  }
  function paintCard(i) {
    if (!D || !D.cards[i]) return;
    const { el, pic } = D.cards[i], g = T().orders[i][1], show = !T().hidden || st.revealed[i] || st.done[i];
    pic.textContent = "";
    if (show) picEl(pic, imgUrl(GOODS[g].img), GOODS[g].emoji); else { const m = mk("div", "dlv-mystery", pic); mk("span", "", m, "？"); }
    el.classList.toggle("dlv-done", !!st.done[i]);
    if (st.selfRead[i] && !el.querySelector(".dlv-card-self")) {     // 章拆兩行（自己讀／到的！）：字放大後一行放不下，自動換行會變三行
      const s = mk("div", "dlv-card-self", el), k = Math.ceil(STAMP_SELF.length / 2);
      mk("span", "", s, STAMP_SELF.slice(0, k)); mk("span", "", s, STAMP_SELF.slice(k));
    }
  }
  function renderShelf() {
    D.shelf.textContent = ""; D.goods = {};
    for (const g of st.shelf) {
      const b = mk("button", "dlv-good", D.shelf); b.type = "button"; b.dataset.g = g; b.setAttribute("aria-label", GOODS[g].h);
      picEl(mk("div", "dlv-good-pic", b), imgUrl(GOODS[g].img), GOODS[g].emoji);
      if (labels()) mk("div", "dlv-good-name", b, GOODS[g].h);
      b.onclick = () => tapGood(g); D.goods[g] = b;
    }
    markShelf();
  }
  function markShelf() {
    if (!D) return;
    for (const [g, b] of Object.entries(D.goods)) b.classList.toggle("dlv-sel", st.sel === g);
  }
  function renderCargo(pop = -1) {
    for (const s of D.slots) s.remove(); D.slots = [];
    for (let k = 0; k < T().cap; k++) {
      const g = st.cargo[k], b = mk("button", "dlv-slot" + (g ? "" : " dlv-empty") + (k === pop ? " dlv-pop" : ""), D.cargo); b.type = "button"; b.dataset.k = k;
      const p = mk("div", "dlv-good-pic", b);
      if (g) { picEl(p, imgUrl(GOODS[g].img), GOODS[g].emoji); if (labels()) mk("div", "dlv-good-name", b, GOODS[g].h); b.setAttribute("aria-label", "車上的" + GOODS[g].h); }
      else { if (labels()) mk("div", "dlv-good-name", b, ""); b.setAttribute("aria-label", "空的位子"); }
      b.onclick = () => tapSlot(k); D.slots.push(b);
    }
  }
  function renderPins() {
    D.pins.textContent = ""; D.pinEl = {};
    for (const b of Object.values(D.resHit)) b.remove(); D.resHit = {};
    const mkPin = (id, color, inner, onTap) => {
      const b = mk("button", "dlv-pin", D.pins); b.type = "button"; b.dataset.node = id; b.style.setProperty("--c", color);
      const wrapIn = mk("div", "dlv-pin-in", b), bub = mk("div", "dlv-pin-b", wrapIn); inner(bub);
      b.onclick = onTap || (() => tapPin(id)); D.pinEl[id] = b; return b;
    };
    mkPin("W", "#8b70cc", bub => { bub.textContent = "📦"; }).setAttribute("aria-label", "倉庫");
    for (const id of HOUSE_IDS) if (st.active.has(id)) {
      mkPin(id, HOUSES[id].color, bub => picEl(bub, petUrl(HOUSES[id].pet), "🏠")).setAttribute("aria-label", HOUSES[id].sign);
      const r = mk("button", "dlv-hit dlv-reshit", D.hits); r.type = "button"; r.dataset.res = id; r.setAttribute("aria-label", HOUSES[id].name);
      r.onclick = () => tapResident(id); D.resHit[id] = r;
    }
    if (T().lever) { const b = mkPin("BR", "#ff8a3d", bub => { bub.textContent = "🌉"; }, () => tapBridge()); b.classList.add("dlv-switch"); b.setAttribute("aria-label", "吊橋開關"); }
  }

  // ---------- 版面三種：橫式（訂單在上、貨架左下、車廂右下）／矮的橫式＝手機（貨架變左邊一欄、車廂變右邊一欄，地圖拿到全部高度）
  //            ／直式（訂單在按鈕下、車廂與貨架疊在下面） ----------
  let L = null;
  function relayout() {
    if (!D || !st) return;
    const rc = root.getBoundingClientRect(), Wd = rc.width || innerWidth, Hd = rc.height || innerHeight;
    const vm = Math.min(Wd, Hd) / 100, land = Wd >= Hd * 1.05, side = land && Hd < 520, gap = Math.max(6, 1.4 * vm), m = 2 * vm;
    const btn = Math.max(56, Math.round(12 * vm)), pin = Math.max(56, Math.round(9.5 * vm));
    const nT = T().speak ? 2 : 1, toolsW = nT * btn + (nT - 1) * gap;
    const resL = 30 * vm;                                        // 左上留給主程式的 🏠🎵（12vmin 圓鈕兩顆）
    const n = T().orders.length, ns = st.shelf.length, cap = T().cap;
    const padX = 2.8 * vm, padY = 2.8 * vm;
    const cellH = labels() ? g => g * 1.36 : g => g * 1.06;     // 一格＝圖＋國字（含注音）；藏圖任務只有圖
    let card, gs, mapBox, shelfBox, cargoBox, ordersBox, cols = ns;
    const cardRow = (y0, xL, xR) => {                            // 訂單卡一排，置中在 xL～xR
      const avail = xR - xL; if (n * card * 0.92 + (n - 1) * gap > avail) card = (avail - (n - 1) * gap) / n / 0.92;
      ordersBox = { x: xL + (avail - (n * card * 0.92 + (n - 1) * gap)) / 2, y: y0 + card * 0.12 };   // 頭像徽章會往上凸 0.1 張卡
      return ordersBox.y + card;
    };
    if (side) {
      card = Math.max(56, Math.min(19 * vm, Hd * 0.21, 150));
      const top = cardRow(m * 0.5, resL + gap, Wd - m - toolsW - gap) + gap;
      gs = 56;
      const availH = Hd - top - m, rows = Math.max(1, Math.floor((availH - padY + gap) / (cellH(gs) + gap)));
      cols = Math.ceil(ns / rows);
      const sW = cols * gs + (cols - 1) * gap + padX, sH = Math.ceil(ns / cols) * (cellH(gs) + gap) - gap + padY;
      shelfBox = { x: m, y: top + (availH - sH) / 2, w: sW, h: sH };
      const cW = gs + padX, cH = gs * 0.62 + gap + cap * (cellH(gs) + gap) - gap + padY, cTop = m + btn + gap;
      cargoBox = { x: Wd - m - cW, y: Math.max(cTop, Math.min(Hd - m - cH, cTop + (Hd - m - cTop - cH) / 2)), w: cW, h: cH };
      mapBox = { x: m + sW + gap, y: top, w: Wd - 2 * m - sW - cW - 2 * gap, h: Hd - top - m };
    } else if (land) {
      card = Math.max(64, Math.min(18.5 * vm, Hd * 0.2, 150));   // 寧次 10-12：藏圖關只能讀卡上的字 → 卡片放大、名稱 ×0.25（1024×768 國字 35px／注音 13.4px）；4 張照樣放得下
      const top = cardRow(m * 0.5, resL + gap, Wd - m - toolsW - gap) + gap * 1.5;
      const fixed = 2 * m + 3 * gap + (ns - 1) * gap + padX + cap * gap + padX;
      gs = Math.max(56, Math.min(13 * vm, 112, (Wd - fixed) / (ns + cap + 0.55)));
      const gh = cellH(gs) + padY;
      shelfBox = { x: m, y: Hd - m - gh, h: gh }; cargoBox = { x: Wd - m - (cap * gs + cap * gap + padX + gs * 0.55), y: Hd - m - gh, h: gh };
      mapBox = { x: m, y: top, w: Wd - 2 * m, h: Hd - m - gh - gap - top };
    } else {
      const row1 = m + Math.max(btn, 12 * vm);
      card = Math.max(64, Math.min(20 * vm, 150));
      const top = cardRow(row1 + gap, m, Wd - m) + gap * 1.5;
      gs = Math.max(56, Math.min(13 * vm, 112, (Wd - 2 * m - (ns - 1) * gap - padX) / ns));
      const gh = cellH(gs) + padY, sW = ns * gs + (ns - 1) * gap + padX;
      shelfBox = { x: (Wd - sW) / 2, y: Hd - m - gh, h: gh }; cargoBox = { x: Wd - m - (cap * gs + cap * gap + padX + gs * 0.55), y: Hd - m - gh - gap - gh, h: gh };
      mapBox = { x: m, y: top, w: Wd - 2 * m, h: Hd - m - 2 * gh - 2 * gap - top };
    }
    const w = D.wrap.style;
    w.setProperty("--u", vm + "px"); w.setProperty("--card", card + "px"); w.setProperty("--gs", gs + "px"); w.setProperty("--btn", btn + "px"); w.setProperty("--pin", pin + "px"); w.setProperty("--gap", gap + "px");
    Object.assign(D.orders.style, { left: ordersBox.x + "px", top: ordersBox.y + "px" });
    Object.assign(D.tools.style, { right: m + "px", top: m + "px" });
    Object.assign(D.shelf.style, { left: shelfBox.x + "px", top: shelfBox.y + "px", height: shelfBox.h + "px", width: side ? shelfBox.w + "px" : "" });
    Object.assign(D.cargo.style, { left: cargoBox.x + "px", top: cargoBox.y + "px", height: cargoBox.h + "px", width: side ? cargoBox.w + "px" : "" });
    D.wrap.classList.toggle("dlv-land", land && !side); D.wrap.classList.toggle("dlv-port", !land); D.wrap.classList.toggle("dlv-side", side);
    D.wrap.classList.toggle("dlv-nolabel", !labels());
    L = { Wd, Hd, vm, land, side, map: { x: mapBox.x, y: mapBox.y, w: mapBox.w, h: Math.max(80, mapBox.h) }, pin, btn };
    if (W) { W.fit(L.map, Wd, Hd, pin); syncOverlay(); }
  }

  // ---------- 每格：3D＋圖釘／卡車、居民、房子、吊橋的點擊區跟著投影 ----------
  let lastMs = 0, dprWin = [], dprCool = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!W || !st) return;
    if (lastMs && now - lastMs < 1000 / 30 - 3) return;       // 省電：最多 30 格／秒（效能體檢 10-12：原本 40；-3ms 容許 rAF 抖動，跟小島一樣）
    // 自動畫質（同小島）：開始畫 1.5 秒後，45 格平均掉到約 25 格／秒以下（間隔 > 40ms）就降解析度（1.5 → 1.25 → 1），降完等 5 秒再看；隔超過 0.5 秒＝切到背景回來／卡一下，不算
    if (lastMs && W.live && !W.isLost) { if (!dprCool) dprCool = now + 1500; else if (now > dprCool) { if (now - lastMs > 500) dprWin = []; else dprWin.push(now - lastMs); if (dprWin.length >= 45) { const avg = dprWin.reduce((a, b) => a + b, 0) / dprWin.length; dprWin = []; if (avg > 40 && W.dpr > 1) { W.setDpr(Math.max(1, W.dpr - 0.25)); dprCool = now + 5000; } } } }
    const real = lastMs ? Math.min(0.06, (now - lastMs) / 1000) : 0; lastMs = now;
    const dt = api.paused() ? 0 : real * SPD();
    if (!api.paused()) st.clock += real * SPD();
    W.frame(dt);
    syncOverlay();
  }
  const place = (el, c, w, h) => Object.assign(el.style, { width: w + "px", height: h + "px", transform: `translate(${(c.x - w / 2).toFixed(1)}px, ${(c.y - h / 2).toFixed(1)}px)` });
  function syncOverlay() {
    if (!W || !D || !L) return;
    const atHouse = !st.driving && st.pos && st.pos !== "W" ? st.pos : null;
    for (const [id, b] of Object.entries(D.pinEl)) {
      const a = W.anchors[id]; if (!a) { b.classList.add("dlv-off"); continue; }
      const p = W.project(...a);
      b.style.transform = `translate(${(p.x - L.pin / 2).toFixed(1)}px, ${(p.y - L.pin * 1.22).toFixed(1)}px)`;
      b.classList.toggle("dlv-here", id === "W" && st.pos === "W");          // 倉庫的圖釘在倉庫時收起來；人家的圖釘留著（點它＝交貨）
      b.classList.toggle("dlv-at", id === atHouse);
      b.classList.toggle("dlv-busy", !!st.driving && id !== "BR");
      if (id === "BR") b.classList.toggle("dlv-off", !!st.bd);
    }
    const t = W.truckScreen();
    if (t) place(D.truckHit, t, Math.max(72, t.w), Math.max(60, t.h));
    const rs = Math.max(56, W.k * 1.05);
    for (const [id, b] of Object.entries(D.resHit)) { const p = W.residentScreen(id); place(b, { x: p.x, y: p.y - rs * 0.15 }, rs, rs); }
    D.houseHit.classList.toggle("dlv-off", !atHouse);
    if (atHouse) { const h = W.houseScreen(atHouse); place(D.houseHit, h, Math.max(56, h.w), Math.max(56, h.h)); }
    const bOn = T().lever && !st.bd; D.bridgeHit.classList.toggle("dlv-off", !bOn);
    if (bOn) { const b = W.bridgeScreen(); place(D.bridgeHit, b, Math.max(56, b.w), Math.max(56, b.h)); }
    if (st.finger) placeFinger();
  }

  // ---------- 操作 ----------
  function noteAct() {
    st.lastAct = st.clock; D.hint.classList.remove("dlv-pulse");
    let wait = typeof api.hintWait === "function" ? api.hintWait() : api.hintWait ?? 20;
    if (wait > 0 && st.ti < 3) wait = Math.min(wait, 8);        // 任務 1–3：最多 8 秒就讓 💡 閃（家長設「關閉」就不閃）
    const tok = ++st.idleTok;
    if (wait > 0) later(() => { if (tok === st.idleTok && !st.won && !st.driving) D.hint.classList.add("dlv-pulse"); }, wait * 1000);
  }
  function tapGood(g) {
    if (!canAct() || st.pos !== "W") return false;
    if (T().cap === 1 && st.cargo.length === 1 && st.cargo[0] !== g) return swapTo(g);   // 容量 1：點別的商品＝直接換貨
    if (st.sel === g) return loadSel();                         // 再點一次＝直接裝上車（小孩常這樣點）
    st.sel = g; play("select"); markShelf(); hideFinger(); noteAct();
    return true;
  }
  function tapTruck() {
    if (!live()) return false;
    if (st.driving) { play("horn"); W && W.honk(); return true; }   // 開車中點卡車＝叭一聲
    if (!canAct()) return false;
    if (st.pos === "W") { if (st.sel) return loadSel(); play("horn"); W && W.honk(); return false; }
    return intentGive();
  }
  function tapCargo() {
    if (!canAct()) return false;
    if (st.pos === "W" && st.sel) return loadSel();
    if (st.pos !== "W") return intentGive();
    return false;
  }
  function tapResident(id) {
    if (!live()) return false;
    if (!st.driving && st.pos === id && !st.lock) return intentGive();
    W && W.residentWave(id); st.waves++; return true;          // 開車中或不在他家：揮手打招呼
  }
  // 到站後點卡車／居民／房子／圖釘／車廂空白＝「要交貨」：車上只有一件就直接交；多件就讓格子跳一下＋手指指車廂（不指答案）
  function intentGive() {
    if (!canAct() || !st.pos || st.pos === "W") return false;
    const h = st.pos, O = T().orders, mine = O.map((o, i) => i).filter(i => O[i][0] === h), pend = mine.filter(i => !st.done[i]);
    noteAct();
    if (!mine.length) { houseSay(h, LINES.noOrder); return false; }
    if (!pend.length) { houseSay(h, LINES.got); return false; }
    if (!st.cargo.length) { houseSay(h, LINES.none); glowPin("W"); return false; }
    if (st.cargo.length === 1) return give(0);
    D.slots.forEach((s, k) => { if (st.cargo[k]) bumpCls(s, "dlv-pop"); });
    play("tap"); fingerTo([D.cargo]); st.nudges++;
    return true;
  }
  function flyIn(g, k) {                                       // 商品從貨架飛進車廂第 k 格
    const from = rectOf(D.goods[g]);
    renderCargo(); D.slots[k].classList.add("dlv-ghost");
    flyGood(g, from, rectOf(D.slots[k]), 420, () => { if (D && D.slots[k]) { D.slots[k].classList.remove("dlv-ghost"); bumpCls(D.slots[k], "dlv-pop"); } });
  }
  function swapTo(g) {                                         // 容量 1：舊的飛回貨架、新的飛進車廂
    const old = st.cargo[0], fromSlot = rectOf(D.slots[0]);
    hideFinger(); noteAct();
    st.cargo = [g]; st.sel = null; markShelf();
    flyGood(old, fromSlot, rectOf(D.goods[old]), 380, () => { if (D && D.goods[old]) bumpCls(D.goods[old], "dlv-jump"); });
    flyIn(g, 0); W && W.bedSync(st.cargo); play("unload"); later(() => play("load"), 160);
    st.swaps++;
    if (st.ti === 0 && !st.saidGo) { st.saidGo = true; later(() => speak(LINES.t1go), 500); }
    return true;
  }
  function loadSel() {
    const g = st.sel; if (!g || st.pos !== "W") return false;
    hideFinger(); noteAct();
    if (st.cargo.length >= T().cap) {
      if (T().cap === 1) { if (st.cargo[0] !== g) return swapTo(g); st.sel = null; markShelf(); bumpCls(D.slots[0], "dlv-pop"); return false; }
      play("ng"); bumpCls(D.cargo, "dlv-shake"); D.slots.forEach(s => bumpCls(s, "dlv-wiggle"));
      speak(LINES.full, "talk", true); speak(LINES.unloadTip); st.sel = null; markShelf(); return false;   // 容量 ≥2 滿了：教他點車上的東西拿下來
    }
    st.cargo.push(g); st.sel = null; markShelf();
    flyIn(g, st.cargo.length - 1);
    W && W.bedSync(st.cargo); play("load");
    if (st.ti === 0 && !st.saidGo) { st.saidGo = true; later(() => speak(LINES.t1go), 500); }
    return true;
  }
  function tapSlot(k) {
    if (!canAct()) return false;
    if (st.pos === "W") {
      if (st.sel) return loadSel();
      const g = st.cargo[k]; if (!g) return false;
      const from = rectOf(D.slots[k]);
      st.cargo.splice(k, 1); renderCargo(); W && W.bedSync(st.cargo);
      flyGood(g, from, rectOf(D.goods[g]), 380, () => { if (D && D.goods[g]) bumpCls(D.goods[g], "dlv-jump"); });
      play("unload"); hideFinger(); noteAct(); return true;
    }
    if (!st.cargo[k]) return intentGive();
    return give(k);
  }
  function give(k) {
    const g = st.cargo[k], h = st.pos, O = T().orders;
    hideFinger(); noteAct(); st.gave = st.arriveTok;
    const mine = O.map((o, i) => i).filter(i => O[i][0] === h), pend = mine.filter(i => !st.done[i]);
    if (!mine.length) { houseSay(h, LINES.noOrder); bumpCls(D.slots[k], "dlv-wiggle"); return false; }
    if (!pend.length) { houseSay(h, LINES.got); bumpCls(D.slots[k], "dlv-wiggle"); return false; }
    const hit = pend.find(i => O[i][1] === g);
    const from = rectOf(D.slots[k]), to = W ? W.residentScreen(h) : { x: L.Wd / 2, y: L.Hd / 2 };
    st.lock = true;
    if (hit !== undefined) {
      st.cargo.splice(k, 1); st.done[hit] = true; st.lastHouse = h; if (T().hidden && !st.revealed[hit]) st.selfRead[hit] = true;
      renderCargo(); W && W.bedSync(st.cargo);
      flyGood(g, from, { x: to.x, y: to.y, w: 0, h: 0 }, 480, () => {
        if (!st) return;
        W && W.residentHappy(h); play("deliver_ok"); houseSay(h, LINES.thanks);
        coinTo(to, hit, () => { paintCard(hit); play("coin"); });
        later(() => { st.lock = false; if (st.done.every(Boolean)) win(); else afterGive(); }, 700);
      }, 0.55);
    } else {
      st.wrong++; const name = GOODS[g].h;
      for (const i of pend) st.wrongAt[i] = (st.wrongAt[i] || 0) + 1;   // 這家還沒送到的訂單都記一次送錯（主程式的貼紙：沒送錯過的訂單＝一次答對）
      D.slots[k].classList.add("dlv-ghost");
      flyGood(g, from, { x: to.x, y: to.y, w: 0, h: 0 }, 420, () => {
        if (!st) return;
        W && W.residentShake(h); play("ng"); houseSay(h, LINES.wrong(name), "say", true);
        for (const i of pend) bumpCls(D.cards[i].el, "dlv-flash");
        flyGood(g, { x: to.x, y: to.y, w: 0, h: 0 }, rectOf(D.slots[k]), 420, () => { if (!st) return; if (D.slots[k]) D.slots[k].classList.remove("dlv-ghost"); st.lock = false; if (st.wrong >= 2) D.hint.classList.add("dlv-pulse"); });
      }, 0.55);
    }
    return true;
  }
  function afterGive() {                                       // 這家還要、但車上沒有了 → 提醒回倉庫
    const h = st.pos, need = T().orders.some(([hh, g], i) => hh === h && !st.done[i]);
    if (need && !T().orders.some(([hh, g], i) => hh === h && !st.done[i] && st.cargo.includes(g))) { houseSay(h, LINES.none); glowPin("W"); }
  }
  // 吊橋：點地圖上的吊橋或旁邊的開關圖釘就放下（在哪都可以、開車中也可以），放下就鎖住
  function tapBridge() {
    if (!live() || !T().lever || st.bd) return false;
    st.bd = 1; play("lever"); later(() => play("bridge"), 250);
    W && (W.setLever(1), W.bridgeTo(1));
    if (st.finger && st.finger.target === D.pinEl.BR) hideFinger();
    noteAct(); syncOverlay(); return true;
  }
  function tapPin(to) {
    if (!canAct()) return false;
    if (to === st.pos) { if (to !== "W") return intentGive(); play("horn"); W && W.honk(); return false; }
    hideFinger(); noteAct();
    if (to !== "W" && !st.cargo.length) {
      play("ng"); speak(LINES.loadFirst, "talk", true); st.lastBlock = { cause: "empty", to };
      if (st.pos === "W") D.hint.classList.add("dlv-pulse"); else glowPin("W");
      return false;
    }
    const r = route(st.ti, st.pos, to, st.bd);
    if (!r) return blocked(to);
    if (T().oneway) { const r2 = route(st.ti, st.pos, to, st.bd, { oneway: true }); if (r2 && r.len > r2.len + 0.5) { W && W.flashArrows(); st.lastBlock = { cause: "oneway", to }; if (!st.saidOneway) { st.saidOneway = true; speak(LINES.oneway); } } }
    if (st.pos === "W") st.trips++;
    st.dist += r.len; st.legs.push({ from: st.pos, to, len: r1(r.len), nodes: r.nodes });
    const from = st.pos; st.pos = null; st.driving = true; st.sel = null; markShelf();
    D.shelf.classList.add("dlv-off");
    if (from !== "W" && W) W.residentGo(from, "home");
    if (from !== "W" && D.bub[from]) { D.bub[from].remove(); delete D.bub[from]; }
    play("truck_start");
    if (W && W.truck) W.drive(r, () => arrive(to)); else later(() => arrive(to), r.len / VMAX * 1000);
    return true;
  }
  function blocked(to) {
    play("ng");
    const viaBridge = route(st.ti, st.pos, to, 1, { bridge: true });
    if (viaBridge && !route(st.ti, st.pos, to, st.bd, { cone: true })) {
      W && W.flashBridge(); speak(LINES.bridge, "talk", true); st.lastBlock = { cause: "bridge", to };
      glowPin("BR");
      return false;
    }
    const rc = route(st.ti, st.pos, to, st.bd, { cone: true }) || route(st.ti, st.pos, to, 1, { cone: true, bridge: true });
    const ids = rc ? rc.edges.filter(e => coned(T(), e.id)).map(e => e.id) : T().cones.map(c => c[0]);
    W && W.flashCones(ids); speak(LINES.cone, "talk", true); st.lastBlock = { cause: "cone", to, edges: ids };
    return false;
  }
  function arrive(to) {
    if (!st) return;
    st.driving = false; st.pos = to; play("truck_stop"); later(() => play("horn"), 160);
    if (to === "W") { D.shelf.classList.remove("dlv-off"); play("door"); noteAct(); return; }
    W && W.residentGo(to, "out"); play("door");
    const tok = ++st.arriveTok;
    later(() => {
      if (!st || st.pos !== to || st.arriveTok !== tok || st.gave === tok || st.lock) return;   // 小孩已經先交貨了＝不用再說（同時只出一句）
      const O = T().orders, mine = O.map((o, i) => i).filter(i => O[i][0] === to), pend = mine.filter(i => !st.done[i]);
      if (!mine.length) houseSay(to, LINES.noOrder);
      else if (!pend.length) houseSay(to, LINES.got);
      else if (!pend.some(i => st.cargo.includes(O[i][1]))) { houseSay(to, LINES.none); glowPin("W"); }
      else if (st.ti === 0 && !st.saidGive) { st.saidGive = true; speak(LINES.t1give); }
    }, 450);
    noteAct();
  }
  function glowPin(id) { const b = D && D.pinEl[id]; if (!b) return; b.classList.add("dlv-glow"); later(() => b && b.classList.remove("dlv-glow"), 3200); }
  function bumpCls(e, cls) { if (!e) return; e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); const my = run; setTimeout(() => { if (my === run) e.classList.remove(cls); }, 1400); }
  function rectOf(e) { const r = e.getBoundingClientRect(), w = D.wrap.getBoundingClientRect(); return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2, w: r.width, h: r.height }; }
  // DOM 飛行動畫（商品飛進車廂／飛給居民／飛回來）
  function flyGood(g, a, b, ms, done, endScale = 1) {
    const f = mk("div", "dlv-fly", D.fx); picEl(f, imgUrl(GOODS[g].img), GOODS[g].emoji);
    const gsPx = parseFloat(getComputedStyle(D.wrap).getPropertyValue("--gs")) || 90, s0 = a.w ? a.w / gsPx : 0.7;
    const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - gsPx * 0.9;
    const an = f.animate([
      { transform: `translate(${a.x - gsPx / 2}px, ${a.y - gsPx / 2}px) scale(${s0 || 1})` },
      { transform: `translate(${mx - gsPx / 2}px, ${my - gsPx / 2}px) scale(1.15)`, offset: 0.45 },
      { transform: `translate(${b.x - gsPx / 2}px, ${b.y - gsPx / 2}px) scale(${endScale})` },
    ], { duration: ms / SPD(), easing: "ease-in-out", fill: "forwards" });
    const rt = run; let fin = false; const end = () => { if (fin || rt !== run) return; fin = true; f.remove(); done && done(); };   // 換關後舊的動畫結束＝不理
    an.onfinish = () => { if (rt === run) later(end, 0); }; later(end, ms + 200);   // 結束後的遊戲邏輯走 later：暫停中不會跑
  }
  function coinTo(from, i, done) {
    const c = mk("div", "dlv-coin", D.fx, "⭐"), to = rectOf(D.cards[i].el);
    const an = c.animate([{ transform: `translate(${from.x}px, ${from.y}px) scale(0.4)` }, { transform: `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - 60}px) scale(1.3)`, offset: 0.5 }, { transform: `translate(${to.x}px, ${to.y}px) scale(0.8)` }],
      { duration: 650 / SPD(), easing: "ease-in-out", fill: "forwards" });
    const rt = run; let fin = false; const end = () => { if (fin || rt !== run) return; fin = true; c.remove(); done && done(); }; an.onfinish = () => { if (rt === run) later(end, 0); }; later(end, 850);
  }
  function bubble(h, text, bad) {                              // 居民頭上的對話泡泡（同一戶只留最新一個；國字會被自動加注音）
    if (!W || !D) return;
    if (D.bub[h]) D.bub[h].remove();
    const p = W.residentScreen(h), b = mk("div", "dlv-say" + (bad ? " dlv-bad" : ""), D.fx, text); D.bub[h] = b;
    b.style.left = p.x + "px"; b.style.top = (p.y - (L ? L.pin * 0.9 : 50)) + "px";
    b.addEventListener("animationend", () => { b.remove(); if (D && D.bub[h] === b) delete D.bub[h]; }, { once: true });
  }

  // ---------- 提示 💡：求解器算下一步，手指示範（藏圖關第一次按＝揭開那張訂單的圖） ----------
  function nextAction() {
    if (!st || st.won) return null;
    const O = T().orders;
    if (st.pos && st.pos !== "W") {
      const k = st.cargo.findIndex(g => O.some(([h, gg], i) => h === st.pos && gg === g && !st.done[i]));
      if (k >= 0) return { type: "deliver", g: st.cargo[k], slot: k };
    }
    const done = st.done.reduce((m, d, i) => m | (d ? 1 << i : 0), 0);
    const sol = solve(st.ti, { pos: st.pos, cargo: st.cargo, done }); if (!sol || !sol.moves.length) return null;
    const mv = sol.moves[0];
    if (st.pos === "W") {
      const need = mv.load.slice(), extra = [];
      for (const g of st.cargo) { const i = need.indexOf(g); if (i >= 0) need.splice(i, 1); else extra.push(g); }
      if (extra.length) return { type: "unload", g: extra[0], slot: st.cargo.indexOf(extra[0]) };
      if (need.length) return { type: "load", g: need[0] };
    }
    if (mv.bridge && !st.bd) return { type: "bridge" };       // 下一段路要過河、橋還沒放下 → 先放橋
    return { type: "drive", to: mv.to };
  }
  function relevantOrder(a) {
    const O = T().orders, pend = O.map((o, i) => i).filter(i => !st.done[i]);
    if (a.type === "load") return pend.find(i => O[i][1] === a.g && !st.revealed[i]) ?? -1;
    if (a.type === "deliver") return pend.find(i => O[i][0] === st.pos && O[i][1] === a.g && !st.revealed[i]) ?? -1;
    if (a.type === "drive" && a.to !== "W") return pend.find(i => O[i][0] === a.to && st.cargo.includes(O[i][1]) && !st.revealed[i]) ?? -1;
    return -1;
  }
  function tapHint() {
    if (!st || !st.ready || st.won || st.driving || st.lock || api.paused()) return null;
    D.hint.classList.remove("dlv-pulse"); st.hints++; noteAct();
    const a = nextAction(); if (!a) return null;
    if (T().hidden) { const i = relevantOrder(a); if (i >= 0) { st.revealed[i] = true; paintCard(i); D.cards[i].pic.classList.add("dlv-flip"); bumpCls(D.cards[i].el, "dlv-hintglow"); play("pop"); st.lastHint = { reveal: i }; return st.lastHint; } }
    demo(a); st.lastHint = a; return a;
  }
  function demo(a) {
    const steps = [];
    if (a.type === "load") { if (st.sel !== a.g) steps.push(D.goods[a.g]); steps.push(D.truckHit); }
    else if (a.type === "drive") steps.push(D.pinEl[a.to]);
    else if (a.type === "deliver" || a.type === "unload") steps.push(D.slots[a.slot]);
    else if (a.type === "bridge") steps.push(D.pinEl.BR);
    fingerTo(steps.filter(Boolean));
  }
  function fingerTo(list) {                                    // 示範手指：依序指 list 裡的元素、按壓＋光圈
    hideFinger(); if (!list.length) return;
    const tok = ++st.fingerTok; st.finger = { list, i: 0, target: list[0], tok };
    const go = i => {
      if (!st || !st.finger || st.finger.tok !== tok) return;
      const f = st.finger; f.i = i; f.target = f.list[i];
      for (const e of f.list) e.classList.remove("dlv-hintglow");
      f.target.classList.add("dlv-hintglow");
      D.finger.classList.add("dlv-on"); placeFinger();
      later(() => { if (st && st.finger && st.finger.tok === tok) { D.finger.classList.remove("dlv-press"); void D.finger.offsetWidth; D.finger.classList.add("dlv-press"); } }, 450);
      if (i + 1 < f.list.length) later(() => go(i + 1), 1700);
      else later(() => { if (st && st.finger && st.finger.tok === tok) hideFinger(); }, 4200);
    };
    go(0);
  }
  function placeFinger() {
    const f = st.finger; if (!f || !f.target || !f.target.isConnected) return;
    const r = rectOf(f.target);
    D.finger.style.left = r.x + "px"; D.finger.style.top = (r.y + Math.min(r.h * 0.15, 20)) + "px";
  }
  function hideFinger() {
    if (!D) return;
    D.finger.classList.remove("dlv-on", "dlv-press");
    if (st && st.finger) { for (const e of st.finger.list) e.classList.remove("dlv-hintglow"); st.finger = null; }
  }
  const fingerName = e => !e ? null : e.dataset.g ? "good:" + e.dataset.g : e.dataset.node ? "pin:" + e.dataset.node : e.dataset.k != null ? "slot:" + e.dataset.k : e === D.truckHit ? "truck" : e === D.cargo ? "cargo" : "?";

  // ---------- 過關 ----------
  function win() {
    st.won = true; hideFinger(); D.hint.classList.remove("dlv-pulse");
    const best = st.best, r = { trips: st.trips, dist: r1(st.dist), wrong: st.wrong }, plan = T().plan;
    const stars = starsFor(r, best, plan), rb = routeBest(r, best);
    const cleared = !!(api.isCleared && api.isCleared(st.ti)), gift = cleared ? null : T().gift, coin = !cleared && T().coin ? 1 : 0;   // coin＝10-13 進階關第一次過關送 1 枚扭蛋幣（主程式存檔時加）
    const info = { task: st.ti, stars, trips: r.trips, bestTrips: best.trips, dist: r.dist, bestDist: best.dist, wrong: r.wrong, routeBest: rb, gift, coin,
      orders: T().orders.map(([h, g], i) => ({ house: h, good: g, word: GOODS[g].h, wrong: st.wrongAt[i] || 0 })) };   // orders：每張訂單送錯幾次（主程式算貼紙用）
    st.winInfo = info;
    try { if (api.onSave) api.onSave(info); } catch (e) { console.warn("[deliver] onSave", e); }   // 先存檔（禮物已照存檔前的 isCleared 算好），演出完才 onWin 轉場
    later(() => {
      play("horn"); W && W.residentsWave(); play("win");
      const bn = mk("div", "dlv-banner", D.fx); mk("div", "dlv-banner-t", bn, "全部送到了！");
      const sr = mk("div", "dlv-banner-s", bn), sp = [0, 1, 2].map(i => mk("span", i < stars ? "dlv-on" : "", sr, "★"));
      st.banner = { pops: 0, badge: false, info: "" };
      sp.forEach((s, i) => later(() => { s.classList.add("dlv-pop"); st.banner.pops++; if (i < stars) play("star"); }, 350 + i * 330));   // 星星一顆一顆蹦出來
      if (plan) { st.banner.info = `路程 ${Math.round(r.dist)} 格／最短 ${Math.round(best.dist)} 格`; mk("div", "dlv-banner-info", bn, st.banner.info); }   // 大人規劃關才比路程
      else if (rb && best.trips === 1) later(() => { mk("div", "dlv-badge", bn, BADGE_ROUTE); st.banner.badge = true; play("ding"); }, 1450);   // 一般關：路線最佳＝加分小徽章
      const cols = ["#ff5b5b", "#ff9a3d", "#ffd84a", "#62cf6b", "#4fa6ff", "#a678e8"];
      for (let i = 0; i < 18; i++) { const q = mk("i", "dlv-conf", D.fx); q.style.left = (4 + (i * 53) % 92) + "%"; q.style.background = cols[i % 6]; q.style.setProperty("--d", (i * 80) % 700 + "ms"); q.addEventListener("animationend", () => q.remove(), { once: true }); }
    }, 650);
    if (gift || coin) later(() => showGift(gift || "coin"), 3500);   // 星星蹦完、徽章亮著 1.4 秒以上才換禮物（換裝或扭蛋幣）
    later(() => { if (!st.winSent) { st.winSent = true; api.onWin(info); } }, gift || coin ? 6000 : 3600);
  }
  function showGift(id) {
    const G = id === "coin" ? COIN_GIFT : GIFTS[id], h = st.lastHouse || "B";
    for (const b of D.fx.querySelectorAll(".dlv-banner")) b.remove();
    W && W.residentHappy(h);
    const card = mk("div", "dlv-gift", D.fx); if (id === "coin") mk("span", "dlv-emoji", mk("div", "dlv-gift-pic", card), G.emoji); else picEl(mk("div", "dlv-gift-pic", card), imgUrl("wear_" + id), G.emoji);   // 扭蛋幣沒有圖，直接用 emoji（不送出載不到的請求）
    mk("div", "dlv-gift-t", card, LINES.gift(G.h));
    speak(LINES.gift(G.h), "talk", true);
    const closet = mk("div", "dlv-closet", D.fx, id === "coin" ? "🎁" : "👗"); closet.style.left = (L.Wd - L.btn * 1.4 - 2 * L.vm) + "px"; closet.style.top = (L.Hd * 0.42) + "px";
    later(() => {
      const a = rectOf(card), b = rectOf(closet);
      card.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(0.2)`, opacity: 0.4 }], { duration: 650 / SPD(), easing: "ease-in", fill: "forwards" });
      later(() => { card.remove(); bumpCls(closet, "dlv-got"); play("wear"); }, 650);
    }, 1500);
  }

  // ---------- 唸訂單（前 3 關開場、🔊） ----------
  function sayOrders() {
    if (!st || !T().speak) return false;
    let first = true;
    T().orders.forEach(([h, g], i) => { if (!st.done[i]) { speak(LINES.want(GOODS[g].h), "say", first); first = false; } });
    return true;
  }

  // ---------- 公開介面 ----------
  function start(i) {
    stop();
    run++;
    const ti = Math.max(0, Math.min(TASKS.length - 1, i | 0)), Tk = TASKS[ti];
    const seed = typeof api.seed === "number" ? api.seed + ti : (Math.random() * 4294967296) >>> 0, rnd = rng(seed);
    const shelf = Tk.shelf.slice(); for (let k = shelf.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [shelf[k], shelf[j]] = [shelf[j], shelf[k]]; }
    const best = solve(ti);
    st = { ti, seed, shelf, best, ready: false, pos: "W", cargo: [], sel: null, bd: 0, done: Tk.orders.map(() => false), revealed: Tk.orders.map(() => false), selfRead: Tk.orders.map(() => false),
      trips: 0, dist: 0, wrong: 0, wrongAt: Tk.orders.map(() => 0), hints: 0, swaps: 0, nudges: 0, waves: 0,
      legs: [], won: false, winSent: false, driving: false, lock: false, clock: 0, idleTok: 0, spoken: [], finger: null, lastBlock: null, lastHint: null, bridgeDemo: false,
      active: new Set(HOUSE_IDS.filter(id => reachableHouse(ti, id))), saidOneway: false, fingerTok: 0, arriveTok: 0, gave: -1 };
    voice.q.length = 0; voice.busy = false; voice.tok++;
    build(); renderShelf(); renderCargo(); renderPins(); D.replay.classList.toggle("dlv-hide", !Tk.speak);
    relayout();
    try { W = createWorld(D.stage, ti, { play, failBuild: !!api.failBuild, onFail: why => { try { api.onFail && api.onFail({ task: ti, why }); } catch (e) {} } }); } catch (e) { console.warn("[deliver] WebGL 失敗", e); W = null; try { api.onFail && api.onFail({ task: ti, why: "nowebgl" }); } catch (e2) {} }
    if (W) { D.stage.insertBefore(W.canvas, D.stage.firstChild); relayout(); }
    lastMs = 0; dprWin = []; dprCool = 0; raf = requestAnimationFrame(frame);
    const my = run;
    const go = () => {
      if (my !== run || !st) return;
      st.ready = true; D.stage.classList.add("dlv-on"); D.shelf.classList.remove("dlv-off"); relayout();
      renderOrders(true); play("ding");
      later(() => {
        if (Tk.speak) sayOrders(); else speak(LINES.hello, "talk");
        if (Tk.intro && !talkedIntro.has(ti)) { talkedIntro.add(ti); speak(Tk.intro); }
      }, 700);
      if (ti === 4 && !bridgeDemoShown) {                      // 任務 5：吊橋第一次出現 → 手指示範開關在哪（教學，不是答案）
        bridgeDemoShown = true;
        later(() => { if (st && !st.bd && !st.finger && D.pinEl.BR) { st.bridgeDemo = true; fingerTo([D.pinEl.BR]); } }, 3200);
      }
      noteAct();
    };
    const timeout = new Promise(r => setTimeout(r, 6000)), w0 = W;
    const loaded = w0 ? Promise.race([w0.ready, timeout]).then(() => Promise.race([w0.warm(), new Promise(r => setTimeout(r, 2500))])).then(() => { w0.live = true; }) : Promise.resolve();
    st.readyP = loaded.then(() => { if (my === run) { if (W) W.bedSync(st.cargo); go(); } }).then(() => new Promise(r => setTimeout(r, 30)));
    return st.readyP;
  }
  function stop() {
    run++; voice.tok++; voice.q.length = 0; voice.busy = false;
    teardown();
    st = null; L = null;
  }
  function state() {
    if (!st) return null;
    const tr = W && W.truck;
    return { task: st.ti, ready: st.ready, pos: st.pos, driving: st.driving, cargo: st.cargo.slice(), sel: st.sel, bridge: st.bd, done: st.done.slice(), revealed: st.revealed.slice(), selfRead: st.selfRead.slice(),
      trips: st.trips, dist: r1(st.dist), wrong: st.wrong, hints: st.hints, swaps: st.swaps, nudges: st.nudges, waves: st.waves, won: st.won, win: st.winInfo || null, best: st.best, legs: st.legs.slice(), shelf: st.shelf.slice(),
      cap: T().cap, hidden: T().hidden, lastBlock: st.lastBlock, lastHint: st.lastHint, bridgeDemo: st.bridgeDemo, banner: st.banner ? { ...st.banner } : null, finger: st.finger ? { type: fingerName(st.finger.target) } : null,
      truck: tr ? { x: +tr.x.toFixed(3), z: +tr.z.toFixed(3), yaw: +tr.yaw.toFixed(3) } : null, spoken: st.spoken.slice(), active: [...st.active], clock: st.clock, lock: st.lock };
  }
  // 測試／試玩頁用：用跟手指一樣的入口操作（不繞過任何規則）
  const debug = {
    tapGood: g => tapGood(g), tapTruck: () => tapTruck(), tapSlot: k => tapSlot(k), tapPin: n => tapPin(n), tapBridge: () => tapBridge(), tapLever: () => tapBridge(), tapHint: () => tapHint(),
    tapResident: id => tapResident(id), tapHouse: () => intentGive(),
    nextAction: () => nextAction(), solve: (ti = st && st.ti) => solve(ti), greedy: ti => greedy(ti),
    load(g) { if (!tapGood(g)) return false; return st.sel === g ? tapTruck() : true; },
    autoStep() {                                              // 照求解器走一步（試玩頁「最佳一步」、測試自動通關）
      if (!canAct()) return null;
      const a = nextAction(); if (!a) return null;
      if (a.type === "load") { if (st.sel !== a.g) tapGood(a.g); if (st.sel === a.g) tapTruck(); }
      else if (a.type === "unload" || a.type === "deliver") tapSlot(a.slot);
      else if (a.type === "bridge") tapBridge();
      else if (a.type === "drive") tapPin(a.to);
      return a;
    },
    async autoPlay(maxSteps = 80) { for (let i = 0; i < maxSteps && st && !st.won; i++) { while (st && !canAct() && !st.won) await new Promise(r => setTimeout(r, 40)); if (!st || st.won) break; debug.autoStep(); await new Promise(r => setTimeout(r, 60)); } return st && st.winInfo; },
    pinRect: id => D && D.pinEl[id] ? D.pinEl[id].getBoundingClientRect() : null,
    truckScreen: () => W && W.truckScreen(), residentScreen: id => W && W.residentScreen(id),
    worldStats: () => W && W.stats(), ctx: () => ({ ...CTX }), layout: () => L && { ...L, map: { ...L.map } },
    bridgeAngle: () => W && W.bridge ? W.bridge.a : null,
    arrowsLit: () => !!(W && W.arrowBlink > W.gt), conesLit: () => W ? Object.entries(W.cones).filter(([, g]) => g.userData.blink > W.gt).map(([id]) => id) : [],
  };
  return { start, stop, sayCurrent: () => sayOrders(), relayout, state, debug };
}
