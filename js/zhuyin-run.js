// ===================== 注音小島：🏃 跑跑大冒險（3D 無盡跑酷；docs/zhuyin-endless-plan.md §1、§2、§6）=====================
// 夥伴（小孩養的寵物）在三條跑道上自己往前跑；門一出現就念題目，下面同時出現 2–3 張注音卡（對齊跑道）。
// 小孩點注音卡（或左右滑、點畫面左右半邊、鍵盤←→）換跑道，跑進對的門。
//
// 兩種玩法（主對話 11-01 遊戲設計審查後拍板）：
//   第 1 圈（start 的 zone 0–7）＝旅程：沒有愛心、不會輸。跑錯＝金幣灑出去一些＋夥伴跌一下＋正確的門亮起來、念正解（出題核心照常退級）。
//     8 區跑完＝彩虹橋大結局（煙火、夥伴跳起來、「跑完全部 8 區了！」）→ onEnd({ finished: true })
//   第 2 圈起（start 的 zone ≥ 8）＝挑戰：3 顆心、跑錯扣 1、每過一區補 1；心用完 → 收尾 → onEnd({ finished: false })
//   從第 2 區起，每次過區的大字畫面多一顆「休息一下」（3 秒內可按）＝小孩中途收工的正規出口 → onEnd({ rest: true })
//
// 讀題時間跟著「題目級數」走、不跟區域（READ_T：第 1 級 4.5 秒 … 第 6 級 8.5 秒；出題核心退級中再多 1 秒）：
//   門一出現，整個世界放慢到「剛好這麼多秒才撞上」（慢動作讀題）；小孩點卡／換跑道選好 0.5 秒後恢復原速。
//   區域越後面越快，只快在門跟門之間的路段；答對只出特效（風線、鏡頭拉一下），不縮短讀題時間。只有第 2 圈的第 1–3 級會壓到 2.2 秒。
// 每區第 4 個門之後是一段約 9 秒的金幣隧道（不出題、滿滿金幣）；過區時一顆星星飛進右上角的星星罐（一局最多 10 顆）。
// 收尾不出現「遊戲結束」或灰掉的畫面：夥伴在路邊坐下＋8 區小地圖畫上腳印（「你跑到雪山了！」）2 秒 → onEnd。
//
// 介面（主程式照這個接，plan §6）：
//   createRunGame(root, api) → { start({ zone, intro }), stop(), relayout(), state() }
//   api：say talk play later paused stopVoice speed petGlb best onAnswer onZone onEnd
//   onEnd(r)：r = { zone（結束時在第幾區，0 起算、含第 2 圈）, zonesCleared, score（公尺）, coins, right, wrong, ms（遊戲時間）,
//                   words（這局答對的國字）, record, finished（第 1 圈跑完大結局）, rest（按了休息一下） }
// 3D：自己的小 Three.js 場景，全部程式畫（低多邊形、圓角、跟小島同一套色感）；不開陰影貼圖，地上用柔和的圓影子（便宜、iPad 順）。
//   遊戲裡所有時間都走「遊戲時鐘」：暫停時不走、乘 api.speed（測試加速）；每格切成 1/60 秒的小步走，加速也不會漏撿金幣。
//   stop() 收掉 rAF、事件、語音，dispose 全部 GPU 資源、forceContextLoss。
// 測試掛鉤：window.__zyRun（state answer setZone hurt lane move auto rest stats）。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createAsker, ZONES_N, TIER_NAME, loopName } from "./zhuyin-endless-core.js?v=1";   // 兩款同一個網址（只載一次）；改了核心要一起升

const ROOT = new URL("../", import.meta.url).href;            // 專案根目錄（主程式、試玩頁都對）
const CAT = ROOT + "IMAGE/zy3d/models/cat.glb";               // 沒選夥伴、或夥伴模型載不到 → 小貓

// ===================== 區域、台詞 =====================
export const ZONES = [
  { name: "沙灘", ico: "🏖️" }, { name: "森林", ico: "🌲" }, { name: "花田", ico: "🌷" }, { name: "雪山", ico: "❄️" },
  { name: "糖果城", ico: "🍭" }, { name: "火山", ico: "🌋" }, { name: "夜空", ico: "🌙" }, { name: "彩虹橋", ico: "🌈" },
];
// api.talk 會念的固定台詞（tools/voice/build_lines.py 收；改句子要一起改那邊）
export const LINES = {
  intro: "聽一聽，點下面的注音卡，帶夥伴跑進對的門！",   // 第一次玩（intro:true）開跑前
  pick: "點一張注音卡，跑進門裡喔！",                       // 第 1 區兩個門，夥伴卻從中間的花叢跳過去（沒選）
  zone: n => `來到${n}了！`,                                  // 過區
  tunnel: "金幣隧道！",                                       // 每區第 4 個門之後
  easy: "沒關係，慢慢來。",                                   // 出題核心剛退一級（連錯 2 題）
  reach: n => `你跑到${n}了！`,                               // 收尾（挑戰模式心用完）
  rest: "休息一下，下次接著跑！",                             // 收尾（按了休息一下）
  finish: "跑完全部八區了，好厲害！",                         // 第 1 圈大結局
};
// 只顯示、不念的字（數字會變，不適合預錄）
const TEXT = {
  near: (n, to) => `再 ${n} 個門就到${to}`,
  nearEnd: n => `再 ${n} 個門就跑完全部了`,
  record: "新紀錄！",
  restTip: z => `下次從${z}接著跑`,
  finish: "跑完全部 8 區了！",
};

// ===================== 數字 =====================
const LANE = 2.6, LANES = [-LANE, 0, LANE];                  // 三條跑道的 x
const ROAD_HALF = LANE * 1.5 + 0.2;                          // 路面半寬
const PET_H = 1.0;                                           // 夥伴身高
const VIEW = 66, BEHIND = 14;                                // 前面畫多遠、後面多遠收掉
const D_MAX = 30;                                            // 門最遠在多遠出現（再遠字太小）
const HIT = 0.7;                                             // 門跑到夥伴鼻子前 0.7 算「跑進去了」
const SIGN_Y = 2.5;                                          // 門上招牌中心高度（下面留 1.37 給夥伴鑽過）
const LANE_COL = ["#ff6f9f", "#ffbe2e", "#46b2ff"];         // 三條跑道的門／注音卡顏色（左粉、中黃、右藍）
const READ_T = [0, 4.5, 5, 5.5, 6.5, 6.5, 8.5];             // 第 1–6 級：門從出現到撞上幾秒（正常速度）
const TUNNEL_S = 9;                                          // 金幣隧道幾秒
const INK = "#22305a", TONE_COL = "#f0563a";                // 注音字色、聲調色（聲調放大 1.5 倍並上色）
const HAN_FONT = '"PingFang TC","Microsoft JhengHei","Noto Sans TC","Heiti TC",sans-serif';
const JAR_MAX = 10;
// 區域的速度只加在路段上：第 1 圈 6.5 → 12.1 單位／秒；第 2 圈從 12.5 起
const zoneSpeed = za => (za >= ZONES_N ? Math.min(15, 12.5 + (za % ZONES_N) * 0.35) : 6.5 + za * 0.8);
const gapTime = za => (za >= ZONES_N ? 2.4 : 2.8);          // 門跟門之間的路段（秒，原速）
function readTime(tier, za, ease) {
  let T = READ_T[Math.max(1, Math.min(6, tier | 0))];
  if (za >= ZONES_N && tier <= 3) T = Math.max(2.2, 3.4 - (za % ZONES_N) * 0.17);   // 第 2 圈的第 1–3 級才會壓到 2.2 秒
  return T + (ease > 0 ? 1 : 0);
}

// ===================== 模組共用：快取、計數 =====================
export const RUN_CTX = { made: 0, live: 0, frames: 0 };    // WebGL context 計數＋畫了幾格（測試查洩漏、查 stop 後有沒有殘留 rAF）
let dprMem = 0;                                              // 自動畫質降到的像素比（下一局直接用）
const gltfCache = new Map();
const loadGLB = url => { if (!gltfCache.has(url)) gltfCache.set(url, new GLTFLoader().loadAsync(url).catch(e => { gltfCache.delete(url); throw e; })); return gltfCache.get(url); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function splitSyl(s) { const k = "ˊˇˋ˙".indexOf(s[s.length - 1]); return k >= 0 ? { sym: s.slice(0, -1), tone: k + 2 } : { sym: s, tone: 1 }; }   // tone：1 一聲（不寫）2 ˊ 3 ˇ 4 ˋ 5 ˙

// ===================== 程式畫的 3D 小物（頂點色、合併成一個網格） =====================
const _c = new THREE.Color(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
function paint(geo, hex) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const n of Object.keys(g.attributes)) if (n !== "position" && n !== "normal") g.deleteAttribute(n);
  g.morphAttributes = {}; g.clearGroups();
  _c.set(hex); const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
// 一塊零件：上色 →（pre 先平移）→ 旋轉（YXZ：先低頭再轉向）→ 縮放 → 擺位置
function part(geo, hex, o = {}) {
  const g = paint(geo, hex);
  if (o.pre) g.translate(...o.pre);
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, "YXZ"); _q.setFromEuler(_e);
  const s = o.s ?? 1;
  _m4.compose(_p3.set(o.x || 0, o.y || 0, o.z || 0), _q, _s3.set(o.sx ?? s, o.sy ?? s, o.sz ?? s));
  return g.applyMatrix4(_m4);
}
function merge(parts) { const m = mergeGeometries(parts); parts.forEach(p => p.dispose()); return m; }
const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const cone = (r, h, n = 10) => new THREE.ConeGeometry(r, h, n);
const ball = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const rbox = (w, h, d, r = 0.06, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const torus = (R, t, arc = Math.PI * 2, ts = 24) => new THREE.TorusGeometry(R, t, 6, ts, arc);
const dome = r => new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
function starGeo(r, depth) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) s.lineTo(x, y); else s.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.35, bevelSize: r * 0.08, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2); return g;
}
function heartGeo(r, depth) {
  const s = new THREE.Shape(), k = r / 1.0;
  s.moveTo(0, -0.95 * k); s.bezierCurveTo(-0.15 * k, -0.7 * k, -1.0 * k, -0.25 * k, -1.0 * k, 0.28 * k); s.bezierCurveTo(-1.0 * k, 0.78 * k, -0.42 * k, 0.98 * k, 0, 0.55 * k);
  s.bezierCurveTo(0.42 * k, 0.98 * k, 1.0 * k, 0.78 * k, 1.0 * k, 0.28 * k); s.bezierCurveTo(1.0 * k, -0.25 * k, 0.15 * k, -0.7 * k, 0, -0.95 * k);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: r * 0.12, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2); return g;
}
// 路邊的東西（每區 3 種）：geo＝頂點色網格；r＝地上圓影子半徑（0＝不要）；glow＝不受光（夜空、岩漿、彩虹）；tint＝每棵各自上色；far＝放遠一點（大東西）
const KIND = {
  palm: () => { const p = [];
    for (let i = 0; i < 5; i++) p.push(part(cyl(0.13 - i * 0.012, 0.16 - i * 0.012, 0.78, 7), i % 2 ? "#a86c3c" : "#c48852", { x: i * i * 0.035, y: 0.39 + i * 0.74, rz: -0.06 * i }));
    for (let k = 0; k < 7; k++) p.push(part(rbox(0.42, 0.08, 1.8, 0.035), k % 2 ? "#47b04f" : "#3a9a45", { pre: [0, 0, 0.85], x: 0.6, y: 3.75, ry: k / 7 * Math.PI * 2, rx: 0.55 }));
    p.push(part(ball(0.17, 0), "#7a4a2a", { x: 0.75, y: 3.55, z: 0.12 }), part(ball(0.17, 0), "#7a4a2a", { x: 0.48, y: 3.53, z: -0.1 }));
    return { geo: merge(p), r: 1.0 }; },
  umbrella: () => ({ geo: merge([part(cyl(0.05, 0.05, 2.3, 6), "#ffffff", { y: 1.15, rz: 0.12 }), part(cone(1.3, 0.55, 8), "#ff5d6c", { x: 0.14, y: 2.35, rz: 0.12 }),
    part(cone(0.62, 0.3, 8), "#ffffff", { x: 0.17, y: 2.58, rz: 0.12 }), part(rbox(1.0, 0.05, 1.7, 0.02), "#4fb8ff", { x: 0.9, y: 0.03, ry: 0.3 })]), r: 1.2 }),
  beachball: () => ({ geo: merge([0, 1, 2].map(k => part(new THREE.SphereGeometry(0.45, 12, 8, k * 2.0944, 2.0944), ["#ff5d6c", "#ffd23f", "#4fb8ff"][k], { y: 0.45, rx: 0.4 }))), r: 0.45 }),
  pine: () => ({ geo: merge([part(cyl(0.14, 0.18, 0.7, 7), "#8a5a35", { y: 0.35 }), part(cone(1.15, 1.4, 8), "#3f9e55", { y: 1.2 }), part(cone(0.9, 1.15, 8), "#48ab5c", { y: 1.9 }), part(cone(0.62, 0.95, 8), "#52b865", { y: 2.55 })]), r: 1.1 }),
  roundtree: () => ({ geo: merge([part(cyl(0.14, 0.2, 1.2, 7), "#8a5a35", { y: 0.6 }), part(ball(0.95, 1), "#5cbf4f", { y: 1.8 }), part(ball(0.6, 1), "#6fcd5c", { x: 0.45, y: 2.35, z: 0.15 })]), r: 1.0 }),
  mushroom: () => { const p = [part(cyl(0.22, 0.3, 0.8, 9), "#fff4df", { y: 0.4 }), part(dome(0.75), "#ff5a5a", { y: 0.72, sy: 0.75 })];
    for (let k = 0; k < 5; k++) { const a = k * 1.3; p.push(part(ball(0.1, 0), "#ffffff", { x: Math.cos(a) * 0.42, y: 1.02 + (k % 2) * 0.1, z: Math.sin(a) * 0.42 })); }
    return { geo: merge(p), r: 0.8 }; },
  tulips: () => { const p = [];
    [[0, 0, "#ff5d6c"], [0.42, 0.18, "#ffd23f"], [-0.38, 0.22, "#ff8fc0"], [0.1, -0.35, "#b78cff"]].forEach(([x, z, c], i) => {
      const h = 0.9 + i * 0.12; p.push(part(cyl(0.035, 0.035, h, 5), "#4caf50", { x, y: h / 2, z }), part(cyl(0.2, 0.12, 0.34, 6), c, { x, y: h + 0.1, z }), part(ball(0.12, 0), "#5cbf4f", { x: x + 0.1, y: 0.3, z, sx: 0.6, sy: 1.8 })); });
    return { geo: merge(p), r: 0.7, s: 1.3 }; },
  sunflower: () => { const p = [part(cyl(0.06, 0.07, 2.0, 6), "#4caf50", { y: 1.0 }), part(ball(0.2, 0), "#5cbf4f", { x: 0.2, y: 0.9, sx: 1.6, sy: 0.5 }), part(ball(0.2, 0), "#5cbf4f", { x: -0.2, y: 1.3, sx: 1.6, sy: 0.5 }),
      part(cyl(0.55, 0.55, 0.1, 16), "#ffd23f", { y: 2.15, rx: Math.PI / 2 }), part(cyl(0.27, 0.27, 0.16, 12), "#8a5a35", { y: 2.15, z: 0.04, rx: Math.PI / 2 })];
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; p.push(part(ball(0.16, 0), "#ffc21f", { x: Math.cos(a) * 0.62, y: 2.15 + Math.sin(a) * 0.62, sz: 0.4 })); }
    return { geo: merge(p), r: 0.6 }; },
  flowerbush: () => { const p = [part(ball(0.6, 1), "#5cbf4f", { y: 0.5 }), part(ball(0.48, 1), "#6fcd5c", { x: 0.55, y: 0.4, z: 0.1 }), part(ball(0.45, 1), "#54b548", { x: -0.5, y: 0.38 })];
    const cs = ["#ff8fc0", "#ffffff", "#ffd23f", "#ff5d6c", "#b78cff", "#ffffff"];
    cs.forEach((c, k) => { const a = k * 1.05; p.push(part(ball(0.11, 0), c, { x: Math.cos(a) * 0.5, y: 0.75 + (k % 3) * 0.1, z: Math.sin(a) * 0.35 + 0.25 })); });
    return { geo: merge(p), r: 0.9 }; },
  snowpine: () => { const p = [part(cyl(0.14, 0.18, 0.7, 7), "#7a5236", { y: 0.35 })];
    [[1.1, 1.15, 1.3], [1.8, 0.9, 1.1], [2.45, 0.62, 0.95]].forEach(([y, r, h]) => p.push(part(cone(r, h, 8), "#3d8f6a", { y }), part(cone(r * 0.62, h * 0.45, 8), "#ffffff", { y: y + h * 0.3 })));
    return { geo: merge(p), r: 1.1 }; },
  snowman: () => ({ geo: merge([part(ball(0.6, 1), "#fbfdff", { y: 0.55 }), part(ball(0.45, 1), "#fbfdff", { y: 1.35 }), part(ball(0.33, 1), "#fbfdff", { y: 1.95 }),
    part(cone(0.07, 0.36, 6), "#ff8a2a", { y: 1.95, z: 0.42, rx: Math.PI / 2 }), part(ball(0.05, 0), "#22252e", { x: -0.12, y: 2.05, z: 0.29 }), part(ball(0.05, 0), "#22252e", { x: 0.12, y: 2.05, z: 0.29 }),
    part(cyl(0.38, 0.38, 0.05, 12), "#2f3340", { y: 2.2 }), part(cyl(0.25, 0.27, 0.38, 12), "#2f3340", { y: 2.42 }), part(torus(0.36, 0.08, Math.PI * 2, 16), "#ff5d6c", { y: 1.66, rx: Math.PI / 2 }),
    part(ball(0.05, 0), "#22252e", { y: 1.4, z: 0.44 }), part(ball(0.05, 0), "#22252e", { y: 1.22, z: 0.44 })]), r: 0.7 }),
  crystal: () => ({ geo: merge([part(new THREE.OctahedronGeometry(0.5), "#9fdcff", { y: 0.85, sy: 1.7 }), part(new THREE.OctahedronGeometry(0.32), "#cdeeff", { x: 0.5, y: 0.5, z: 0.2, sy: 1.6, rz: 0.3 })]), r: 0.6 }),
  lollipop: () => ({ geo: merge([part(cyl(0.06, 0.06, 2.0, 6), "#ffffff", { y: 1.0 }), part(cyl(0.72, 0.72, 0.2, 20), "#ff5fa8", { y: 2.3, rx: Math.PI / 2 }),
    part(cyl(0.5, 0.5, 0.22, 20), "#ffffff", { y: 2.3, rx: Math.PI / 2 }), part(cyl(0.26, 0.26, 0.24, 16), "#ff5fa8", { y: 2.3, rx: Math.PI / 2 })]), r: 0.5 }),
  cane: () => { const p = [];
    for (let i = 0; i < 6; i++) p.push(part(cyl(0.12, 0.12, 0.32, 8), i % 2 ? "#ffffff" : "#ff4f6a", { y: 0.16 + i * 0.32 }));
    for (let k = 0; k < 4; k++) p.push(part(torus(0.36, 0.12, Math.PI / 4, 4), k % 2 ? "#ff4f6a" : "#ffffff", { x: 0.36, y: 1.92, rz: k * Math.PI / 4 }));
    return { geo: merge(p), r: 0.4 }; },
  gumdrop: () => ({ geo: merge([part(cyl(0.4, 0.58, 0.55, 10), "#ffffff", { y: 0.28 }), part(ball(0.4, 1), "#ffffff", { y: 0.55, sy: 0.7 })]), r: 0.6, tint: ["#ff5d6c", "#ffd23f", "#5cd27a", "#4fb8ff", "#b78cff", "#ff9a3c"] }),
  rock: () => ({ geo: merge([part(new THREE.DodecahedronGeometry(0.75), "#6b5b55", { y: 0.4, sy: 0.7, sz: 0.9 }), part(new THREE.DodecahedronGeometry(0.4), "#7b6a62", { x: 0.75, y: 0.22, z: 0.3 })]), r: 0.9 }),
  volcano: () => ({ geo: merge([part(cone(1.7, 2.0, 7), "#5e4034", { y: 1.0 }), part(cyl(0.48, 0.58, 0.26, 7), "#ff7a2f", { y: 1.9 }), part(rbox(0.22, 0.9, 0.12, 0.05), "#ff8a3a", { x: 0.3, y: 1.45, z: 0.55, rx: -0.6, rz: -0.3 })]), r: 1.6, far: true }),
  lavapool: () => ({ geo: merge([part(cyl(0.95, 1.0, 0.06, 14), "#ff7a1f", { y: 0.03 }), part(cyl(0.55, 0.55, 0.08, 12), "#ffd04a", { y: 0.04, x: 0.1 })]), r: 0, glow: true }),
  starlamp: () => ({ geo: merge([part(cyl(0.2, 0.26, 0.14, 8), "#9aa3d8", { y: 0.07 }), part(cyl(0.05, 0.05, 2.2, 6), "#9aa3d8", { y: 1.1 }), part(starGeo(0.42, 0.16), "#ffe14d", { y: 2.45 })]), r: 0, glow: true }),
  nightcrystal: () => ({ geo: merge([part(new THREE.OctahedronGeometry(0.5), "#ffffff", { y: 0.85, sy: 1.7 }), part(new THREE.OctahedronGeometry(0.3), "#ffffff", { x: 0.5, y: 0.5, z: 0.2, sy: 1.6, rz: 0.3 })]), r: 0, glow: true, tint: ["#b78cff", "#7fe0ff", "#ff8fd8"] }),
  glowshroom: () => ({ geo: merge([part(cyl(0.2, 0.26, 0.75, 9), "#dfe8ff", { y: 0.37 }), part(dome(0.7), "#66e0ff", { y: 0.7, sy: 0.75 }), part(ball(0.09, 0), "#ffffff", { x: 0.3, y: 1.0, z: 0.3 }), part(ball(0.09, 0), "#ffffff", { x: -0.25, y: 1.05, z: 0.2 })]), r: 0, glow: true }),
  cloud: () => ({ geo: merge([part(ball(0.6, 1), "#ffffff", { y: 0.5 }), part(ball(0.5, 1), "#ffffff", { x: 0.62, y: 0.4 }), part(ball(0.45, 1), "#ffffff", { x: -0.6, y: 0.4, z: 0.1 }), part(ball(0.45, 1), "#ffffff", { x: 0.15, y: 0.88 })]), r: 0 }),
  rainbow: () => ({ geo: merge(["#ff6b6b", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#b197fc"].map((c, i) => part(torus(2.5 - i * 0.2, 0.1, Math.PI, 28), c)) ), r: 0, glow: true, far: true }),
  bigstar: () => ({ geo: merge([part(starGeo(0.7, 0.26), "#ffd84d", { y: 1.5 }), part(cyl(0.04, 0.04, 1.1, 5), "#ffffff", { y: 0.55 })]), r: 0.4 }),
};
// 每一區的樣子：天空、地面（底色＋點點）、路面花紋、路邊積木顏色、遠山、光線、路邊東西
const THEMES = [
  { sky: "#8fd6ff", ground: "#f3dea4", dots: ["#e6c983", "#fff3cf", "#f7d48f"], road: ["plank", "#eab57c", "#d29a60"], curb: ["#ffffff", "#4fb8ff"], dash: "#fff7e6", hill: "#79c3e6", lt: "day", decor: ["palm", "umbrella", "beachball"] },
  { sky: "#9edcf0", ground: "#7cc55a", dots: ["#6db34d", "#8fd16a", "#5fa543"], road: ["dirt", "#d8a76d", "#c48f57"], curb: ["#9a6a43", "#c08a5a"], dash: "#fff1d6", hill: "#5aa65a", lt: "day", decor: ["pine", "roundtree", "mushroom"] },
  { sky: "#ffd9ec", ground: "#93d466", dots: ["#ff8fb8", "#fff07a", "#ffffff", "#7cc552"], road: ["path", "#f6e2c5", "#efcfa6"], curb: ["#ffffff", "#ff8fb8"], dash: "#ffffff", hill: "#a9dc78", lt: "day", decor: ["tulips", "sunflower", "flowerbush"] },
  { sky: "#d3eaff", ground: "#f5faff", dots: ["#dce9f7", "#ffffff", "#e8f1fb"], road: ["ice", "#bfe1f7", "#a6d2f0"], curb: ["#ffffff", "#8fc8ee"], dash: "#ffffff", hill: "#e6f0fb", lt: "snow", decor: ["snowpine", "snowman", "crystal"] },
  { sky: "#ffd2ec", ground: "#ffb8da", dots: ["#ffffff", "#7fd8ff", "#fff07a", "#b78cff"], road: ["candy", "#fff1f7", "#ffcde2"], curb: ["#ffffff", "#ff4f7a"], dash: "#ffffff", hill: "#ff9fca", lt: "day", decor: ["lollipop", "cane", "gumdrop"] },
  { sky: "#ffbb90", ground: "#6f4b3d", dots: ["#5b3b2f", "#ff7a2f", "#84594a"], road: ["lava", "#9c6c52", "#7d533f"], curb: ["#3d2b24", "#ff7a2f"], dash: "#ffd6a8", hill: "#5a3a34", lt: "warm", decor: ["rock", "volcano", "lavapool"] },
  { sky: "#28356f", ground: "#33507f", dots: ["#90b2ea", "#2a4470", "#ffe680"], road: ["night", "#5d6cab", "#4e5c98"], curb: ["#ffe680", "#7a5cc4"], dash: "#ffe680", hill: "#1e2955", lt: "night", decor: ["starlamp", "nightcrystal", "glowshroom"] },
  { sky: "#c3e8ff", ground: "#ffffff", dots: ["#e2f2ff", "#fff8d6", "#ffe3f1"], road: ["rainbow"], curb: ["#ffffff", "#ffd84d"], dash: "#ffffff", hill: "#ffffff", lt: "day", decor: ["cloud", "rainbow", "bigstar"] },
];
const LIGHTS = {
  day: { hs: "#f4f9ff", hg: "#e9dcc6", hi: 1.55, sc: "#fff4e4", si: 1.9, star: 0, disc: "#fff1a8" },
  snow: { hs: "#f4f9ff", hg: "#d8e6f5", hi: 1.45, sc: "#fffaf0", si: 1.7, star: 0, disc: "#fff6c8" },
  warm: { hs: "#ffe2c8", hg: "#7a4a3a", hi: 1.4, sc: "#ffb878", si: 1.8, star: 0, disc: "#ffd27a" },
  night: { hs: "#a6b8ff", hg: "#2c3263", hi: 1.05, sc: "#cfdaff", si: 1.05, star: 1, disc: "#f6f2d6" },
};
// 路面、地面花紋（畫布，128×128，同一區每次都長一樣）
function roadPaint(g, spec) {
  const [kind, a, b] = spec, R = rng(kind.length * 97 + 7), N = 128;
  if (kind === "rainbow") { ["#ff7b7b", "#ffad5c", "#ffe36e", "#7fdc8c", "#5fb5f7", "#b9a2fc"].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * N / 6, 0, N / 6 + 1, N); }); return; }
  g.fillStyle = a; g.fillRect(0, 0, N, N); g.fillStyle = b; g.strokeStyle = b;
  if (kind === "plank") { for (let y = 0; y < N; y += 16) { g.fillRect(0, y, N, 2.5); g.fillRect(((y / 16) % 2) * 64 + 20, y, 2, 16); } }
  else if (kind === "dirt") for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(R() * N, R() * N, 1 + R() * 2.6, 0, 7); g.fill(); }
  else if (kind === "path") { for (let i = 0; i < 40; i++) { g.fillStyle = i % 3 ? b : i % 2 ? "#ffb3cf" : "#ffffff"; g.beginPath(); g.ellipse(R() * N, R() * N, 2.6, 1.4, R() * 3, 0, 7); g.fill(); } }
  else if (kind === "ice") { g.lineWidth = 2; g.strokeStyle = "#e8f7ff"; for (let i = 0; i < 14; i++) { const x = R() * N, y = R() * N; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + R() * 14, y + 4 + R() * 8); g.stroke(); } }
  else if (kind === "candy") { for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + N, N); g.lineTo(i * 32 + N, N); g.fill(); } }
  else if (kind === "lava") { g.lineWidth = 2.2; for (let i = 0; i < 9; i++) { let x = R() * N, y = R() * N; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (R() - 0.5) * 26; y += 6 + R() * 12; g.lineTo(x, y); } g.stroke(); } g.fillStyle = "#ff9a4a"; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(R() * N, R() * N, 1.6, 0, 7); g.fill(); } }
  else if (kind === "night") { for (let i = 0; i < 40; i++) { g.fillStyle = i % 4 ? b : "#ffe680"; g.beginPath(); g.arc(R() * N, R() * N, i % 4 ? 2 : 1.3, 0, 7); g.fill(); } }
}
function groundPaint(g, base, dots, seed) {
  const R = rng(seed), N = 128; g.fillStyle = base; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 70; i++) { g.fillStyle = dots[i % dots.length]; g.beginPath(); g.arc(R() * N, R() * N, 1.2 + R() * 3, 0, 7); g.fill(); }
}

// ===================== 注音（直排：每個音節一欄、聲調在最後一個符號右上方、輕聲在頂上；聲調放大 1.5 倍並上色） =====================
function measureZ(text) {
  const syls = String(text).split(" ").filter(Boolean).map(splitSyl);
  let w = 0; syls.forEach((s, i) => { w += 1 + (s.tone >= 2 && s.tone <= 4 ? 0.8 : 0.08) + (i ? 0.2 : 0); });
  const n = Math.max(1, ...syls.map(s => [...s.sym].length)), light = syls.some(s => s.tone === 5);
  return { syls, w, h: n * 0.92 + (light ? 0.45 : 0) + 0.1, n, light };
}
function toneMark(g, t, cx, cy, b) {                         // b＝聲調方框邊長；形狀跟主程式 css 的向量聲調一樣（10×10 格）
  const P = (px, py) => [cx - b / 2 + px / 10 * b, cy - b / 2 + py / 10 * b];
  g.strokeStyle = g.fillStyle = TONE_COL; g.lineWidth = b * 0.24; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath();
  if (t === 2) { g.moveTo(...P(2.4, 8.6)); g.lineTo(...P(7.6, 1.4)); g.stroke(); }
  else if (t === 3) { g.moveTo(...P(1.6, 2.2)); g.lineTo(...P(5, 8)); g.lineTo(...P(8.4, 2.2)); g.stroke(); }
  else if (t === 4) { g.moveTo(...P(2.4, 1.4)); g.lineTo(...P(7.6, 8.6)); g.stroke(); }
  else { g.arc(cx, cy, b * 0.36, 0, Math.PI * 2); g.fill(); }
}
function drawZ(g, text, cx, cy, maxW, maxH, maxS) {
  const M = measureZ(text), s = Math.min(maxS, maxW / M.w, maxH / M.h), cell = 0.92 * s;
  let x = cx - M.w * s / 2;
  const top0 = cy - M.h * s / 2 + (M.light ? 0.45 * s : 0) + 0.05 * s;
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = `900 ${Math.round(s)}px ${HAN_FONT}`;
  M.syls.forEach((sy, i) => {
    if (i) x += 0.2 * s;
    const ch = [...sy.sym], n = ch.length, top = top0 + (M.n - n) * cell / 2;
    g.fillStyle = INK; ch.forEach((c, k) => g.fillText(c, x + 0.5 * s, top + (k + 0.5) * cell + 0.03 * s));
    if (sy.tone >= 2 && sy.tone <= 4) toneMark(g, sy.tone, x + 1.36 * s, top + (n - 1) * cell + 0.06 * s, 0.75 * s);
    else if (sy.tone === 5) toneMark(g, 5, x + 0.5 * s, top - 0.24 * s, 0.4 * s);
    x += (1 + (sy.tone >= 2 && sy.tone <= 4 ? 0.8 : 0.08)) * s;
  });
}
// 門上的招牌：跑道顏色的粗框＋白底＋注音
function drawSign(cv, text, col) {
  const g = cv.getContext("2d"), N = cv.width, rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  g.clearRect(0, 0, N, N);
  rr(4, 4, N - 8, N - 8, 64); g.fillStyle = col; g.fill();
  rr(30, 30, N - 60, N - 60, 44); g.fillStyle = "#fffdf6"; g.fill();
  drawZ(g, text, N / 2, N / 2, N - 96, N - 96, 300);
}
// DOM 版（注音卡、題目列）：class 一律 run- 開頭，聲調用 css 遮罩畫（跟門上同一個形狀）
function zyEl(text, fs) {
  const wrap = document.createElement("div"); wrap.className = "run-zy noann"; wrap.style.fontSize = Math.round(fs) + "px";
  for (const s of String(text).split(" ").filter(Boolean).map(splitSyl)) {
    const col = document.createElement("div"); col.className = "run-syl" + (s.tone > 1 ? " run-has" + (s.tone === 5 ? "5" : "") : "");
    col.style.setProperty("--n", [...s.sym].length);
    for (const ch of s.sym) { const b = document.createElement("b"); b.textContent = ch; col.appendChild(b); }
    if (s.tone > 1) { const t = document.createElement("i"); t.className = "run-tone run-k" + s.tone; col.appendChild(t); }
    wrap.appendChild(col);
  }
  return wrap;
}

// ===================== 遊戲本體 =====================
export function createRunGame(root, api) {
  let run = 0;                 // 每次 start/stop 換號：舊的回呼看到號碼不同就作廢
  let st = null, D = null, W = null, raf = 0, last = 0, ptr = null, dprWin = [], dprCool = 0, sizeTick = 0;
  const offs = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
  const SPD = () => Math.max(0.25, +api.speed || 1);
  const safe = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { console.warn("[run]", e); return undefined; } };
  const live = () => !!st && !st.dead;
  const play = n => { if (live()) safe(api.play, n); };
  const later = (fn, ms) => { const my = run; safe(api.later, () => { if (my === run && live()) fn(); }, ms / SPD()); };   // 主程式的 later 不會自己加速 → 這裡除
  const paused = () => !!safe(api.paused);
  const mk = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
  const wait = (sec, fn) => { if (st) st.tq.push({ at: st.clock + sec, fn, my: run }); };   // 遊戲時鐘計時（暫停凍得住、乘 speed）
  const isDare = () => st && st.dare;
  const zi = () => st.za % ZONES_N, loopOf = () => Math.floor(st.za / ZONES_N);
  const theme = () => THEMES[zi()];

  // ---------- 語音 ----------
  function voice(how, text, alt, cb) {
    if (!live()) return; const my = run; let done = false;
    const fin = () => { if (done || my !== run || !live()) return; done = true; if (cb) cb(); };
    if (how === "say") { safe(api.stopVoice); safe(api.say, text, alt, fin); }
    else safe(api.talk, text, fin);
    st.spoken.push({ how, text });
    if (cb) later(fin, how === "say" ? 2000 : Math.max(1800, String(text).length * 300));   // onEnd 可能不會來：保險
  }
  const sayQ = (q, cb) => q && voice("say", q.say, q.alt, cb);
  const talk = (t, cb) => voice("talk", t, null, cb);

  // ===================== 3D 世界 =====================
  function buildWorld() {
    const res = { geos: new Set(), mats: new Set(), texs: new Set(), ims: new Set(), kinds: new Map(), roadTex: new Map(), groundTex: new Map() };
    const G = g => (res.geos.add(g), g), M = m => (res.mats.add(m), m), T = t => (res.texs.add(t), t);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    RUN_CTX.made++; RUN_CTX.live++;
    const w = { renderer, res, dpr: Math.min(window.devicePixelRatio || 1, 1.5, dprMem || 9), lost: false };
    renderer.setPixelRatio(w.dpr);
    renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
    const cv = renderer.domElement; cv.className = "run-canvas";
    w.onLost = e => { e.preventDefault(); w.lost = true; }; w.onBack = () => { w.lost = false; };
    cv.addEventListener("webglcontextlost", w.onLost); cv.addEventListener("webglcontextrestored", w.onBack);
    const scene = new THREE.Scene(); w.scene = scene;
    scene.background = new THREE.Color(THEMES[0].sky); scene.fog = new THREE.Fog(THEMES[0].sky, 36, 74);
    const cam = new THREE.PerspectiveCamera(54, 1.4, 0.1, 260); w.cam = cam;
    const hemi = new THREE.HemisphereLight(0xf4f9ff, 0xe9dcc6, 1.55), sun = new THREE.DirectionalLight(0xfff4e4, 1.9);
    sun.position.set(-6, 12, 9); scene.add(hemi, sun); w.hemi = hemi; w.sun = sun;
    const petLight = new THREE.PointLight(0xfff2dd, 0, 9, 2); petLight.position.set(0, 2.4, 2.2); scene.add(petLight); w.petLight = petLight;   // 夜空：夥伴身上補一點光（不然灰色的夥伴會黑成一團）
    const canvasTex = (n, draw, rep) => { const c = document.createElement("canvas"); c.width = c.height = n; draw(c.getContext("2d")); const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
    w.canvasTex = canvasTex;
    const vcMat = M(new THREE.MeshLambertMaterial({ vertexColors: true })), glowMat = M(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    w.vcMat = vcMat; w.glowMat = glowMat;
    // 地面、路面（貼圖往鏡頭捲＝在跑）
    const LEN = VIEW + BEHIND + 90;
    w.groundLen = LEN; w.groundTile = 8; w.roadTile = 6;
    const ground = new THREE.Mesh(G(new THREE.PlaneGeometry(260, LEN)), M(new THREE.MeshLambertMaterial({ color: 0xffffff })));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, BEHIND + 30 - LEN / 2); scene.add(ground); w.ground = ground;
    const road = new THREE.Mesh(G(new THREE.PlaneGeometry(ROAD_HALF * 2, LEN)), M(new THREE.MeshLambertMaterial({ color: 0xffffff })));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, ground.position.z); scene.add(road); w.road = road;
    // 會一直動的東西都用 InstancedMesh（一種東西一個 draw call）
    const IM = (geo, mat, n, color) => { const m = new THREE.InstancedMesh(G(geo), mat, n); m.frustumCulled = false; m.count = 0; if (color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); res.ims.add(m); scene.add(m); return m; };
    w.IM = IM;
    w.curbs = IM(paint(rbox(0.42, 0.26, 0.9, 0.08, 1), "#ffffff"), vcMat, 200, true);   // 路邊積木 160 塊：圓角只切一段（面數 1/3）
    w.dashes = IM(paint(new THREE.BoxGeometry(0.16, 0.04, 1.4), "#ffffff"), vcMat, 70, true);
    w.coinIM = IM(merge([part(cyl(0.34, 0.34, 0.1, 14), "#ffc21f", { rx: Math.PI / 2 }), part(cyl(0.22, 0.22, 0.13, 10), "#ffe066", { rx: Math.PI / 2 })]), M(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x4a3200 })), 220);   // 金幣很多（隧道一次上百個）：面數壓低
    w.heartIM = IM(paint(heartGeo(0.46, 0.22), "#ff4f7a"), M(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a0a1e })), 6);
    w.boxIM = IM(merge([part(rbox(1.0, 1.0, 1.0, 0.08), "#d79a5c"), part(rbox(1.04, 0.16, 1.04, 0.04), "#b3743d", { y: 0.3 }), part(rbox(1.04, 0.16, 1.04, 0.04), "#b3743d", { y: -0.3 }),
      part(rbox(0.16, 1.04, 1.04, 0.04), "#b3743d", { x: 0.3 }), part(rbox(0.16, 1.04, 1.04, 0.04), "#b3743d", { x: -0.3 })]), vcMat, 8);
    w.ringIM = IM(paint(torus(ROAD_HALF + 0.5, 0.22, Math.PI, 20), "#ffffff"), M(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x222222 })), 24, true);
    w.confIM = IM(paint(new THREE.PlaneGeometry(0.16, 0.26), "#ffffff"), M(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false })), 260, true);
    // 地上的圓影子（柔和、便宜）
    const blob = canvasTex(64, g => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.55, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const shGeo = new THREE.PlaneGeometry(2, 2); shGeo.rotateX(-Math.PI / 2);
    w.shadowIM = IM(shGeo, M(new THREE.MeshBasicMaterial({ map: blob, color: 0x1a2440, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), 320);
    w.shadowIM.renderOrder = 2;
    // 遠山、太陽／月亮、星星、天上的雲（不受霧）
    const hills = [];
    for (let i = 0; i < 13; i++) { const x = -120 + i * 20 + Math.sin(i * 2.1) * 6; hills.push(part(ball(1, 2), "#ffffff", { x, y: -3, z: -125 - (i % 3) * 8, sx: 14 + (i % 4) * 4, sy: 7 + (i % 3) * 4, sz: 6 })); }
    w.hillMat = M(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, color: THEMES[0].hill }));
    scene.add(new THREE.Mesh(G(merge(hills)), w.hillMat));
    w.discMat = M(new THREE.MeshBasicMaterial({ color: "#fff1a8", fog: false, toneMapped: false }));
    const disc = new THREE.Mesh(G(new THREE.CircleGeometry(7, 28)), w.discMat); disc.position.set(-38, 30, -150); scene.add(disc); w.disc = disc;
    const sp = new Float32Array(150 * 3), R = rng(5);
    for (let i = 0; i < 150; i++) { sp[i * 3] = -160 + R() * 320; sp[i * 3 + 1] = 12 + R() * 70; sp[i * 3 + 2] = -150; }
    const sg = G(new THREE.BufferGeometry()); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    w.starMat = M(new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
    scene.add(new THREE.Points(sg, w.starMat));
    const clouds = [];
    for (let i = 0; i < 6; i++) { const x = -90 + i * 34, y = 20 + (i % 3) * 7; [[0, 0, 4], [4, -0.8, 3], [-4, -1, 3], [1.5, 2, 3]].forEach(([dx, dy, r]) => clouds.push(part(ball(r, 1), "#ffffff", { x: x + dx, y: y + dy, z: -140, sz: 0.4 }))); }
    w.cloudMat = M(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.9 }));
    w.clouds = new THREE.Mesh(G(merge(clouds)), w.cloudMat); scene.add(w.clouds);
    // 門（一排最多 3 個；兩排份）、中間的花叢（第 1 區兩個門時擋中間）
    const archGeo = G(merge([part(rbox(0.28, 3.9, 0.32, 0.1), "#ffffff", { x: -1.17, y: 1.95 }), part(rbox(0.28, 3.9, 0.32, 0.1), "#ffffff", { x: 1.17, y: 1.95 }),
      part(rbox(2.66, 0.3, 0.38, 0.12), "#ffffff", { y: 3.95 }), part(rbox(2.5, 2.26, 0.18, 0.08), "#ffffff", { y: SIGN_Y }), part(rbox(0.12, 0.3, 0.12, 0.04), "#ffffff", { y: 3.72 }),
      part(ball(0.26, 1), "#ffffff", { y: 4.32 }), part(rbox(0.52, 0.16, 0.52, 0.06), "#ffffff", { x: -1.17, y: 0.08 }), part(rbox(0.52, 0.16, 0.52, 0.06), "#ffffff", { x: 1.17, y: 0.08 })]));
    const signGeo = G(new THREE.PlaneGeometry(2.36, 2.12));
    w.arches = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(), mat = M(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000 }));
      g.add(new THREE.Mesh(archGeo, mat));
      const c = document.createElement("canvas"); c.width = c.height = 512;
      const tex = T(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const smat = M(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
      const sign = new THREE.Mesh(signGeo, smat); sign.position.set(0, SIGN_Y, 0.1); g.add(sign);
      g.visible = false; scene.add(g);
      w.arches.push({ g, mat, smat, cv: c, tex, on: false, d: 0, lane: 0, opt: "", anim: "idle", t0: 0, shown: 0 });
    }
    const hedgeGeo = G(merge([part(ball(0.5, 1), "#5cbf4f", { x: -0.6, y: 0.38 }), part(ball(0.55, 1), "#6fcd5c", { y: 0.45 }), part(ball(0.5, 1), "#54b548", { x: 0.6, y: 0.38 }),
      ...["#ff8fc0", "#ffffff", "#ffd23f", "#ff5d6c", "#ffffff"].map((c, k) => part(ball(0.12, 0), c, { x: -0.8 + k * 0.4, y: 0.72 + (k % 2) * 0.12, z: 0.32 }))]));
    w.hedges = [0, 1].map(() => { const m = new THREE.Mesh(hedgeGeo, vcMat); m.visible = false; scene.add(m); return { m, on: false, d: 0, anim: "idle", t0: 0 }; });
    // 夥伴：holder（左右位置）→ tilt（側傾、前後點頭）→ body（上下彈）→ 模型；先放程式畫的小圓球，模型載好再換
    const holder = new THREE.Group(), tilt = new THREE.Group(), body = new THREE.Group(), ride = new THREE.Group();
    holder.add(tilt); tilt.add(ride); tilt.add(body); scene.add(holder);
    const temp = new THREE.Mesh(G(merge([part(ball(0.42, 2), "#ffb86b", { y: 0.45 }), part(cone(0.13, 0.26, 6), "#ffb86b", { x: -0.22, y: 0.85, rz: 0.3 }), part(cone(0.13, 0.26, 6), "#ffb86b", { x: 0.22, y: 0.85, rz: -0.3 }),
      part(ball(0.06, 0), "#22252e", { x: -0.14, y: 0.55, z: 0.36 }), part(ball(0.06, 0), "#22252e", { x: 0.14, y: 0.55, z: 0.36 })])), vcMat);
    temp.rotation.y = Math.PI; body.add(temp);
    w.pet = { holder, tilt, body, ride, model: temp, temp: true };
    // 換跑法：雪山踩滑雪板、糖果城坐礦車（只換外觀與動作）
    w.board = new THREE.Mesh(G(merge([part(rbox(0.62, 0.08, 1.5, 0.035), "#4fb8ff", { y: 0.04 }), part(rbox(0.5, 0.09, 0.3, 0.03), "#ffffff", { y: 0.05, z: 0.55 }), part(rbox(0.5, 0.09, 0.3, 0.03), "#ffffff", { y: 0.05, z: -0.55 })])), vcMat);
    w.cart = new THREE.Mesh(G(merge([part(rbox(1.15, 0.12, 1.45, 0.05), "#ff5f8f", { y: 0.3 }), part(rbox(0.12, 0.55, 1.45, 0.05), "#ff5f8f", { x: -0.56, y: 0.6 }), part(rbox(0.12, 0.55, 1.45, 0.05), "#ff5f8f", { x: 0.56, y: 0.6 }),
      part(rbox(1.15, 0.55, 0.12, 0.05), "#ffd23f", { y: 0.6, z: 0.68 }), part(rbox(1.15, 0.55, 0.12, 0.05), "#ffd23f", { y: 0.6, z: -0.68 }),
      ...[[-0.5, 0.45], [0.5, 0.45], [-0.5, -0.45], [0.5, -0.45]].map(([x, z]) => part(cyl(0.2, 0.2, 0.12, 10), "#5a4a7a", { x: x * 1.12, y: 0.2, z, rz: Math.PI / 2 }))])), vcMat);
    ride.add(w.board, w.cart); w.board.visible = w.cart.visible = false;
    w.dispose = () => {
      if (w.dead) return; w.dead = true;
      const geos = new Set(res.geos), mats = new Set(res.mats);
      scene.traverse(x => { if (x.geometry) geos.add(x.geometry); for (const m of [].concat(x.material || [])) mats.add(m); });
      geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose && m.dispose()); res.texs.forEach(t => t.dispose());
      res.ims.forEach(m => m.dispose && m.dispose());
      try { renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* 已經被系統收走也沒關係 */ }
      cv.removeEventListener("webglcontextlost", w.onLost); cv.removeEventListener("webglcontextrestored", w.onBack);
      cv.remove(); cv.width = cv.height = 1;                  // Safari：畫布縮到 1×1 才會放掉背景緩衝
      RUN_CTX.live--;
    };
    return w;
  }
  // 路邊東西的 InstancedMesh（用到才建）
  function kindMesh(k) {
    if (W.res.kinds.has(k)) return W.res.kinds.get(k);
    const spec = KIND[k](), im = W.IM(spec.geo, spec.glow ? W.glowMat : W.vcMat, 24, !!spec.tint);
    const o = { im, spec, n: 0 }; W.res.kinds.set(k, o); return o;
  }
  function roadTex(i) {
    if (!W.res.roadTex.has(i)) W.res.roadTex.set(i, W.canvasTex(128, g => roadPaint(g, THEMES[i].road), [1, W.groundLen / W.roadTile]));
    return W.res.roadTex.get(i);
  }
  function groundTex(i) {
    if (!W.res.groundTex.has(i)) W.res.groundTex.set(i, W.canvasTex(128, g => groundPaint(g, THEMES[i].ground, THEMES[i].dots, 11 + i * 31), [260 / W.groundTile, W.groundLen / W.groundTile]));
    return W.res.groundTex.get(i);
  }
  // 換區：地面、路面、路邊積木馬上換（白光蓋住的那一下），天空、光線慢慢變
  function setTheme(i, instant) {
    const t = THEMES[i], L = LIGHTS[t.lt];
    W.ground.material.map = groundTex(i); W.ground.material.needsUpdate = true;
    W.road.material.map = roadTex(i); W.road.material.needsUpdate = true;
    W.curbCols = t.curb.map(c => new THREE.Color(c)); W.dashCol = new THREE.Color(t.dash);
    W.sky = { from: instant ? null : { sky: W.scene.background.clone(), hill: W.hillMat.color.clone(), hs: W.hemi.color.clone(), hg: W.hemi.groundColor.clone(), hi: W.hemi.intensity, sc: W.sun.color.clone(), si: W.sun.intensity, star: W.starMat.opacity, disc: W.discMat.color.clone() },
      to: { sky: new THREE.Color(t.sky), hill: new THREE.Color(t.hill), hs: new THREE.Color(L.hs), hg: new THREE.Color(L.hg), hi: L.hi, sc: new THREE.Color(L.sc), si: L.si, star: L.star, disc: new THREE.Color(L.disc) }, t0: st ? st.clock : 0 };
    if (instant) skyLerp(1);
    if (st) for (const it of st.decor) it.kind = pickKind(i, it.side);   // 現有的路邊東西一起換成新區的（白光蓋住）
    W.board.visible = i === 3; W.cart.visible = i === 4;
    st && (st.theme = i);
  }
  function skyLerp(u) {
    const { from: f, to: t } = W.sky, L = (a, b) => (f ? a.clone().lerp(b, u) : b);
    const sky = L(f && f.sky, t.sky); W.scene.background.copy(sky); W.scene.fog.color.copy(sky);
    W.hillMat.color.copy(L(f && f.hill, t.hill)); W.hemi.color.copy(L(f && f.hs, t.hs)); W.hemi.groundColor.copy(L(f && f.hg, t.hg)); W.sun.color.copy(L(f && f.sc, t.sc)); W.discMat.color.copy(L(f && f.disc, t.disc));
    W.hemi.intensity = f ? f.hi + (t.hi - f.hi) * u : t.hi; W.sun.intensity = f ? f.si + (t.si - f.si) * u : t.si;
    W.starMat.opacity = f ? f.star + (t.star - f.star) * u : t.star; W.cloudMat.opacity = 0.9 * (1 - W.starMat.opacity);
    W.petLight.intensity = 14 * W.starMat.opacity;
    W.disc.scale.setScalar(1 - 0.35 * W.starMat.opacity);
  }
  function pickKind(i, side) { const ks = THEMES[i].decor; return ks[Math.floor(st.rnd() * ks.length)]; }

  // ---------- 夥伴模型（api.petGlb()；載不到退回小貓；再載不到就留程式畫的小圓球，不會卡住） ----------
  function petUrl() {
    const v = safe(api.petGlb); const u = v && typeof v === "object" ? v.glb : v;
    if (!u || typeof u !== "string") return CAT;
    try { return new URL(u, ROOT).href; } catch (e) { return CAT; }
  }
  async function loadPet(w) {
    const urls = [petUrl()]; if (urls[0] !== CAT) urls.push(CAT);
    for (const u of urls) {
      try {
        const g = await loadGLB(u); if (w.dead) return;
        const obj = g.scene.clone(true);
        obj.traverse(o => { if (!o.isMesh) return; const s = o.material; const m = new THREE.MeshLambertMaterial({ color: s.color || 0xffffff, map: s.map || null, vertexColors: !!o.geometry.attributes.color, transparent: !!s.transparent, opacity: s.opacity ?? 1 }); w.res.mats.add(m); o.material = m; });
        const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
        obj.scale.multiplyScalar(PET_H / (sz.y || 1));
        const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
        obj.position.set(-c.x, -b2.min.y, -c.z);
        const wrap = new THREE.Group(); wrap.add(obj); wrap.rotation.y = Math.PI;      // 模型臉朝 +z → 轉過來背對鏡頭往前跑
        const P = w.pet; P.body.remove(P.model); P.body.add(wrap); P.model = wrap; P.temp = false; P.url = u;
        return true;
      } catch (e) { console.warn("[run] 夥伴模型載不到，換下一個", u, e && e.message); }
    }
    return false;
  }

  // ===================== DOM =====================
  function build() {
    root.classList.add("run-root");
    const wrap = mk("div", "run-wrap", root);
    const stage = mk("div", "run-stage", wrap);
    const slow = mk("div", "run-slow", wrap), wind = mk("div", "run-wind", wrap);
    const load = mk("div", "run-loading", wrap, "🏃");
    const q = mk("div", "run-q run-off", wrap);
    const say = mk("button", "run-say", q, "🔊"); say.type = "button"; say.setAttribute("aria-label", "再聽一次");
    const pic = mk("div", "run-pic", q);
    const hud = mk("div", "run-hud noann", wrap);
    const hearts = mk("div", "run-hearts run-off", hud); for (let i = 0; i < 3; i++) mk("span", "run-heart", hearts, "❤️");
    const row1 = mk("div", "run-row", hud);
    const coins = mk("div", "run-chip run-coins", row1); mk("span", "", coins, "🪙"); const coinN = mk("b", "", coins, "0");
    const jar = mk("div", "run-jar", row1); mk("div", "run-jar-lid", jar); const jarIn = mk("div", "run-jar-in", jar); mk("span", "", jarIn, "⭐"); const jarN = mk("b", "", jarIn, "0");
    const meter = mk("div", "run-chip run-meter", hud); mk("span", "", meter, "🏃"); const meterN = mk("b", "", meter, "0"); mk("span", "run-unit", meter, "公尺");
    const zone = mk("div", "run-chip run-zone", hud); const zoneIco = mk("span", "run-zone-ico", zone, "🏖️"); const dots = mk("span", "run-dots", zone);
    for (let i = 0; i < 8; i++) mk("i", "run-dot", dots);
    const cards = mk("div", "run-cards noann", wrap);
    const card = [0, 1, 2].map(i => { const b = mk("button", "run-card run-off", cards); b.type = "button"; b.style.setProperty("--c", LANE_COL[i]); b.dataset.lane = i; mk("div", "run-card-in", b); return b; });
    const banner = mk("div", "run-banner run-off", wrap); const bannerT = mk("div", "run-banner-t", banner); const bannerS = mk("div", "run-banner-s", banner);
    const rest = mk("button", "run-rest run-off", banner, "🛋️ 休息一下"); rest.type = "button";
    const count = mk("div", "run-count run-off", wrap);
    const finger = mk("div", "run-finger run-off", wrap, "👆");
    const flash = mk("div", "run-flash", wrap), fx = mk("div", "run-fx", wrap);
    const end = mk("div", "run-end run-off", wrap);
    D = { wrap, stage, slow, wind, load, q, say, pic, hud, hearts, coins, coinN, jar, jarN, meter, meterN, zone, zoneIco, dots: [...dots.children], cards, card, banner, bannerT, bannerS, rest, count, finger, flash, fx, end, last: {} };
    on(say, "click", () => { if (st && st.row && !st.row.res) { play("tap"); sayQ(st.row.q); } });
    card.forEach((b, i) => on(b, "pointerdown", e => { e.preventDefault(); e.stopPropagation(); laneTo(i, "card"); }));
    on(rest, "click", e => { e.stopPropagation(); if (st && st.restUntil > st.clock && st.phase === "run") { play("tap"); endRun("rest"); } });
    // 換跑道：左右滑（≥30px 就算，滑著不放可以連換）、點畫面左半／右半、鍵盤 ←→
    on(wrap, "pointerdown", e => { if (e.target.closest("button")) return; ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, swiped: false }; });
    on(wrap, "pointermove", e => {
      if (!ptr || e.pointerId !== ptr.id || !st) return;
      const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
      if (Math.abs(dx) >= 30 && Math.abs(dx) > Math.abs(dy) * 0.8) { laneTo(st.lane + Math.sign(dx), "swipe"); ptr.x = e.clientX; ptr.y = e.clientY; ptr.swiped = true; }
    });
    on(window, "pointerup", e => {
      if (!ptr || e.pointerId !== ptr.id) return; const p = ptr; ptr = null;
      if (p.swiped || !st || !D || Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 24) return;
      const r = D.wrap.getBoundingClientRect(); laneTo(st.lane + (e.clientX - r.left < r.width / 2 ? -1 : 1), "tap");
    });
    on(window, "pointercancel", () => { ptr = null; });
    on(window, "keydown", e => { if (!st) return; if (e.key === "ArrowLeft") { laneTo(st.lane - 1, "key"); e.preventDefault(); } else if (e.key === "ArrowRight") { laneTo(st.lane + 1, "key"); e.preventDefault(); } });
  }
  function teardown() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    while (offs.length) offs.pop()();
    if (W) { W.dispose(); W = null; }
    if (D) { D.wrap.remove(); D = null; }
    root.classList.remove("run-root");
    ptr = null;
  }
  // 卡片對齊跑道：算三條跑道在夥伴那一排的螢幕位置（鏡頭置中時），卡片寬固定、不重疊、不出畫面
  function layoutCards() {
    if (!W || !D) return;
    const r = D.wrap.getBoundingClientRect(); if (!r.width) return;
    const cw = D.card[0].offsetWidth || 180, ch = D.card[0].offsetHeight || 150;
    const xs = LANES.map(x => { const v = new THREE.Vector3(x, 0, 0).project(W.camC); return (v.x + 1) / 2 * r.width; });
    const gap = cw + 10; xs[0] = Math.min(xs[0], xs[1] - gap); xs[2] = Math.max(xs[2], xs[1] + gap);
    const lo = 8 + cw / 2, hi = r.width - 8 - cw / 2; if (xs[0] < lo) { const k = lo - xs[0]; xs[0] += k; } if (xs[2] > hi) { const k = xs[2] - hi; xs[2] -= k; }
    D.card.forEach((b, i) => { b.style.left = (xs[i] - cw / 2).toFixed(1) + "px"; });
    D.cardBox = { cw, ch };
  }
  function fillCard(i, text) {
    const b = D.card[i], inn = b.firstChild; inn.textContent = "";
    const cw = b.clientWidth || 180, ch = b.clientHeight || 150, M = measureZ(text);
    const fs = Math.max(40, Math.min(ch * 0.84 / M.h, cw * 0.88 / M.w, ch * 0.62));
    inn.appendChild(zyEl(text, fs));
  }

  // ===================== 開局 =====================
  function start(opts = {}) {
    stop();
    run++;
    const z0 = Math.max(0, Math.floor(+opts.zone) || 0), intro = !!opts.intro;
    const seed = typeof api.seed === "number" ? api.seed : (Math.random() * 4294967296) >>> 0;
    const rnd = rng(seed);
    const asker = createAsker({ rnd, opts: (tier, z) => (z === 0 ? 2 : 3) });   // 第 1 區（第 1 圈）只有 2 個門，之後 3 個
    asker.setZone(z0);
    const best = safe(api.best) || { zone: 0, score: 0 };
    st = { my: run, seed, rnd, asker, intro, z0, za: z0, dare: z0 >= ZONES_N, best: { zone: +best.zone || 0, score: +best.score || 0 },
      phase: "load", clock: 0, dist: 0, v: 0, lane: 1, x: 0, ph: 0, laneMoves: 0,
      gates: 0, zonesCleared: 0, stars: 0, hearts: z0 >= ZONES_N ? 3 : 0, coins: 0, right: 0, wrong: 0, skips: 0, words: [], picks: 0,
      row: null, next: null, firstRow: true, haltUntil: 0, slowUntil: 0, restUntil: 0, tunnel: null,
      coinsArr: [], fly: [], heartsArr: [], boxes: [], rings: [], decor: [], cursor: [0, 0], conf: [],
      hop: null, stum: null, kick: 0, tq: [], spoken: [], ending: null, ended: null, auto: null, heartPlan: new Set(), theme: z0 % ZONES_N, dead: false };
    build();
    try { W = buildWorld(); } catch (e) {
      console.warn("[run] WebGL 開不起來", e); W = null;
      D.load.textContent = "😿"; D.load.classList.add("run-sad"); mk("div", "run-sad-t", D.load, "跑道打不開，按 🏠 回去");
      st.phase = "fail"; return Promise.resolve(false);
    }
    D.stage.appendChild(W.renderer.domElement);
    setTheme(st.theme, true);
    planHearts();
    relayout(); hud(true);
    for (let s = 0; s < 2; s++) fillDecor(s);
    last = 0; dprWin = []; dprCool = 0; raf = requestAnimationFrame(frame);
    const my = run, w0 = W;
    const petP = Promise.race([loadPet(w0), new Promise(r => setTimeout(r, 6000))]);   // 6 秒還沒好：先用小圓球跑，好了再換
    const warm = () => { try { w0.renderer.compile(w0.scene, w0.cam); } catch (e) { /* 編不好就照常畫 */ } };
    st.readyP = petP.then(() => { if (my !== run || !st) return; warm(); D.load.classList.add("run-off"); st.phase = intro ? "intro" : "count"; if (intro) beginIntro(); else beginCount(); });
    return st.readyP;
  }
  function beginIntro() {
    st.introAt = st.clock; D.finger.className = "run-finger run-swipe";
    talk(LINES.intro, () => { if (st) st.introTalked = true; });
  }
  function beginCount() {
    st.phase = "count"; D.finger.className = "run-finger run-off";
    D.count.textContent = "預備"; D.count.className = "run-count run-pop"; play("tp_count");
    wait(0.9, () => { D.count.textContent = "出發！"; D.count.className = "run-count run-pop run-go"; play("tp_launch"); go(); });
    wait(1.7, () => { D.count.className = "run-count run-off"; });
  }
  function go() {
    st.phase = "run";
    planRow(st.dist, 0.6);
    if (st.intro) D.finger.className = "run-finger run-off";
  }
  // 挑戰模式：每區撒 1 顆愛心（心少的時候 2 顆），放在第幾個門後面的路段
  function planHearts() {
    st.heartPlan = new Set(); if (!st.dare) return;
    st.heartPlan.add(1 + Math.floor(st.rnd() * 6)); if (st.hearts <= 1) st.heartPlan.add(1 + Math.floor(st.rnd() * 6));
  }

  // ===================== 出題、排門、排金幣 =====================
  // 下一排門：出題（出題核心的 next 在 report 之後才叫，退級才算得到）→ 讀題秒數 → 門放在「路段跑完＋慢動作那段」的位置
  function planRow(fromD, extraSec) {
    const q = st.asker.next(), ease = st.asker.ease();
    let T = readTime(q.tier, st.za, ease); if (st.firstRow && st.intro) T += 1;   // 第一次玩：第一個門再慢一點
    const vz = zoneSpeed(st.za), va = Math.min(vz, D_MAX / T), Dap = va * T;
    const lead = vz * (gapTime(st.za) + extraSec);
    st.next = { q, T, va, D: Dap, d: fromD + lead + Dap, vz };
    layoutItems(fromD + 2.5, st.next.d - Dap - 1.5);
  }
  // 路段上的金幣、愛心、木箱（門前那段慢動作讀題的路不放東西，讓小孩專心讀）
  function layoutItems(a, b) {
    const R = st.rnd; if (b - a < 3) return;
    let cur = a + 0.5, lastLane = st.lane;
    while (cur < b - 1) {
      const len = 4 + Math.floor(R() * 4); let lane = Math.floor(R() * 3); if (lane === lastLane && R() < 0.6) lane = (lane + 1 + Math.floor(R() * 2)) % 3;
      const zig = R() < 0.35;
      for (let k = 0; k < len && cur < b - 0.5; k++) { const l = zig && k >= len / 2 ? (lane + 1) % 3 : lane; st.coinsArr.push({ d: cur, x: LANES[l], got: 0 }); cur += 1.5; }
      lastLane = lane; cur += 2 + R() * 3;
    }
    if (st.dare && st.heartPlan.has(st.gates)) {                 // 愛心：路段中間
      st.heartPlan.delete(st.gates);
      const d = a + (b - a) * (0.35 + R() * 0.3), l = Math.floor(R() * 3);
      clearCoins(d, LANES[l], 1.6); st.heartsArr.push({ d, x: LANES[l], got: 0 });
    }
    if ((zi() >= 2 || st.za >= ZONES_N) && b - a > 16 && R() < 0.55) {   // 第 3 區起偶爾有木箱：撞到只會跌一下
      const d = a + 9 + R() * (b - a - 13), l = Math.floor(R() * 3);
      clearCoins(d, LANES[l], 2.6); st.boxes.push({ d, x: LANES[l], hit: 0 });
    }
  }
  function clearCoins(d, x, r) { st.coinsArr = st.coinsArr.filter(c => !(Math.abs(c.d - d) < r && c.x === x)); }
  // 金幣隧道：三條跑道滿滿的金幣＋一圈圈彩色拱環
  function layoutTunnel(a, b) {
    for (let d = a; d < b; d += 1.4) for (let l = 0; l < 3; l++) if (!((Math.floor(d / 9) + l) % 3 === 0 && (d % 9) > 6)) st.coinsArr.push({ d, x: LANES[l], got: 0 });
    const cols = ["#ff6b6b", "#ffad5c", "#ffe36e", "#7fdc8c", "#5fb5f7", "#b9a2fc"];
    for (let d = a, k = 0; d < b; d += 5, k++) st.rings.push({ d, col: new THREE.Color(cols[k % cols.length]) });
    st.tunnel = { a, b, said: false };
  }
  // 門出現：擺門、念題、出注音卡、世界慢下來
  function spawnRow() {
    const N = st.next; st.next = null;
    const q = N.q, lanes = q.options.length === 2 ? [0, 2] : [0, 1, 2];
    const row = { ...N, shownAt: st.clock, gates: [], hedge: null, res: null, go: 0, first: st.firstRow };
    st.firstRow = false;
    q.options.forEach((opt, k) => {
      const lane = lanes[k], a = W.arches.find(x => !x.on); if (!a) return;
      Object.assign(a, { on: true, d: N.d, lane, opt, anim: "rise", t0: st.clock });
      a.mat.color.set(LANE_COL[lane]); a.mat.emissive.set(0x000000); a.smat.color.set(0xffffff); a.g.scale.setScalar(1); a.g.rotation.set(0, 0, 0);
      drawSign(a.cv, opt, LANE_COL[lane]); a.tex.needsUpdate = true; a.g.visible = true;
      row.gates.push({ lane, opt, arch: a });
    });
    if (lanes.length === 2) { const h = W.hedges.find(x => !x.on); if (h) { Object.assign(h, { on: true, d: N.d, anim: "rise", t0: st.clock }); h.m.visible = true; row.hedge = h; } }
    st.row = row;
    // 注音卡（對齊跑道）＋題目列（🔊、4–6 級的圖）
    D.card.forEach((b, i) => { const g = row.gates.find(x => x.lane === i); b.className = "run-card" + (g ? " run-in" : " run-off"); if (g) fillCard(i, g.opt); });
    markCards();
    D.pic.textContent = q.tier >= 4 && q.pic ? q.pic : ""; D.pic.classList.toggle("run-off", !(q.tier >= 4 && q.pic));
    D.q.className = "run-q";
    sayQ(q);
    if (st.auto) autoPick(row);
    if (row.first && st.intro) D.finger.className = "run-finger run-tapcards";
    if (st.skipHint) { st.skipHint = false; D.finger.className = "run-finger run-tapcards"; }
  }
  function markCards() { if (!D) return; D.card.forEach((b, i) => b.classList.toggle("run-here", !!(st.row && !st.row.res && i === st.lane))); }

  // ---------- 換跑道（滑、點左右半邊、點卡、鍵盤都走這裡） ----------
  function laneTo(i, how) {
    if (!st || !W || paused() || st.phase === "load" || st.phase === "end" || st.phase === "fail") return;
    i = clamp(i, 0, 2);
    if (i === st.lane && how !== "card") return;
    if (i !== st.lane) { st.lane = i; st.laneMoves++; }
    const R = st.row;
    if (R && !R.res && st.clock - R.shownAt >= 0.4) { R.chose = st.clock; R.go = st.clock + 0.5; if (!/run-off/.test(D.finger.className) && st.phase === "run") D.finger.className = "run-finger run-off"; }   // 選好 0.5 秒後恢復原速
    markCards();
  }

  // ---------- 撞上門：判斷 ----------
  function resolve() {
    const R = st.row, g = R.gates.find(x => x.lane === st.lane);
    if (!g) return skipRow(R);
    const ok = g.opt === R.q.answer, right = R.gates.find(x => x.opt === R.q.answer);
    R.res = { ok, got: g.opt, lane: st.lane, at: st.clock };
    const rep = st.asker.report(ok);
    safe(api.onAnswer, { ok, q: R.q, got: g.opt });
    if (!st) return;                                       // 主程式在回呼裡 stop() 了
    st.gates++;
    D.card.forEach((b, i) => { b.classList.remove("run-here"); if (right && i === right.lane) b.classList.add("run-good"); else if (i === g.lane) b.classList.add("run-dim"); });
    if (ok) {
      st.right++; play("ok"); later(() => play("pop"), 90);
      if (R.q.word && !st.words.includes(R.q.word.h)) st.words.push(R.q.word.h);
      archOut(R, g.lane); burst(LANES[g.lane], SIGN_Y, R.d, [LANE_COL[g.lane], "#ffffff", "#ffe066", "#7fdc8c", "#b9a2fc"], 46, 5.5);
      st.kick = 1; D.wind.className = "run-wind"; void D.wind.offsetWidth; D.wind.className = "run-wind run-on";   // 答對：風線＋鏡頭拉一下（只是特效）
      wait(1.0, hideCards);
      afterGate(0.15);
    } else {
      st.wrong++; play("ng");
      g.arch.anim = "gray"; g.arch.t0 = st.clock; g.arch.mat.color.set("#d7d4dc"); g.arch.smat.color.set("#e2e0e6");
      if (right) { right.arch.anim = "glow"; right.arch.t0 = st.clock; }
      st.haltUntil = st.clock + 1.7; st.stum = { t0: st.clock, dur: 1.0, big: true };
      if (st.dare) { st.hearts = Math.max(0, st.hearts - 1); hud(); D.hearts.classList.remove("run-shake"); void D.hearts.offsetWidth; D.hearts.classList.add("run-shake"); }
      else spillCoins(Math.min(st.coins, 5));
      sayQ(R.q, rep.changed && rep.ease > 0 ? () => talk(LINES.easy) : null);
      const dead = st.dare && st.hearts <= 0;
      wait(1.7, () => { if (!st) return; archOut(R, -1); hideCards(); if (dead) endRun("out"); });
      if (!dead) afterGate(1.75);
    }
    st.row = null;
  }
  // 第 1 區兩個門，夥伴在中間：從花叢上跳過去（不算答題），亮正確的門、念正解
  function skipRow(R) {
    R.res = { ok: null, skip: true, at: st.clock }; st.skips++;
    if (!st.hop) st.hop = { t0: st.clock, dur: 0.55, h: 1.15, spin: 0 };
    const right = R.gates.find(x => x.opt === R.q.answer); if (right) { right.arch.anim = "glow"; right.arch.t0 = st.clock; }
    D.card.forEach((b, i) => { b.classList.remove("run-here"); if (right && i === right.lane) b.classList.add("run-good"); });
    sayQ(R.q, st.picks < 2 ? () => talk(LINES.pick) : null); st.picks++;
    st.skipHint = true;
    wait(0.9, () => { if (st) { archOut(R, -1); hideCards(); } });
    st.row = null;
    st.next = null; planRow(st.dist, 0.3);                       // 同一區再出一題（這題不算）
  }
  // 一個門過了：第 4 個門後接金幣隧道；第 8 個門＝過區（delay＝等跑錯的停頓演完；停頓時世界不動，路段長度不用加）
  function afterGate(delay) {
    if (st.gates >= 8) {
      if (!st.dare && zi() === ZONES_N - 1) { wait(delay + 0.3, () => endRun("finish")); return; }   // 第 1 圈第 8 區跑完＝大結局
      wait(delay, zoneUp);
      return;
    }
    if (st.gates === 4) {
      const vz = zoneSpeed(st.za), a = st.dist + vz * 0.9, b = a + vz * TUNNEL_S;
      layoutTunnel(a, b);
      planRow(b, 0);
    } else planRow(st.dist, 0);
  }
  // 過區：大字＋夥伴跳＋（挑戰）補 1 心＋星星飛進罐子＋換風景；從第 2 區起有「休息一下」
  function zoneUp() {
    if (!st || st.phase !== "run") return;
    st.zonesCleared++; st.za++; st.gates = 0;
    st.asker.setZone(st.za);
    if (st.dare) st.hearts = Math.min(3, st.hearts + 1);
    planHearts();
    safe(api.onZone, { zone: st.za });
    if (!st) return;
    const Z = ZONES[zi()];
    st.hop = { t0: st.clock, dur: 0.8, h: 1.6, spin: Math.PI * 2 };
    burst(st.x, 1.2, st.dist + 1.5, ["#ff6b6b", "#ffad5c", "#ffe36e", "#7fdc8c", "#5fb5f7", "#b9a2fc"], 60, 6);
    play("star"); later(() => play("whoosh"), 250);
    D.flash.className = "run-flash"; void D.flash.offsetWidth; D.flash.className = "run-flash run-on";
    wait(0.22, () => { if (st) setTheme(zi(), false); });
    D.bannerT.textContent = ""; mk("span", "run-banner-ico", D.bannerT, Z.ico); mk("span", "run-banner-name", D.bannerT, Z.name); D.bannerS.textContent = loopName(loopOf());   // 表情符號另外放（文字描邊會把彩色表情吃掉）
    D.banner.className = "run-banner run-pop";
    st.restUntil = st.clock + 5.5; D.rest.className = "run-rest";   // 5 歲小孩要看到、想、再伸手：停 5 秒多（11-01 原本 3.2 秒，實際只看得到約 2 秒）
    wait(3.2, () => { if (!D) return; D.banner.className = "run-banner run-off"; D.rest.className = "run-rest run-off"; });
    talk(LINES.zone(Z.name));
    flyStar();
    hud(true);
    planRow(st.dist, 1.6);
  }
  // 星星飛進右上角的罐子（一局最多 10 顆）
  function flyStar() {
    if (st.stars >= JAR_MAX) return;
    st.stars++;
    const s = mk("div", "run-flystar", D.wrap, "⭐"), r = D.wrap.getBoundingClientRect(), j = D.jar.getBoundingClientRect();
    const pv = new THREE.Vector3(st.x, 1.4, 0).project(W.cam);                     // 從夥伴身上飛出去（不要蓋住區域名稱）
    const x0 = (pv.x + 1) / 2 * r.width, y0 = (1 - pv.y) / 2 * r.height, x1 = j.left - r.left + j.width / 2, y1 = j.top - r.top + j.height / 2;
    s.style.left = x0 + "px"; s.style.top = y0 + "px";
    const dur = 1100 / SPD();
    if (s.animate) s.animate([{ transform: "translate(-50%,-50%) scale(1.6)" }, { transform: `translate(calc(-50% + ${(x1 - x0) * 0.4}px), calc(-50% + ${(y1 - y0) * 0.1 - 60}px)) scale(1.9)`, offset: 0.4 }, { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(0.5)` }], { duration: dur, easing: "ease-in", fill: "forwards" });
    wait(1.1, () => { s.remove(); if (!D) return; D.jarN.textContent = st.stars; D.jar.classList.remove("run-bump"); void D.jar.offsetWidth; D.jar.classList.add("run-bump"); play("ding"); });
  }
  function hideCards() { if (!D) return; D.card.forEach(b => { b.className = "run-card run-off"; }); D.q.className = "run-q run-off"; markCards(); }
  // 門退場：夥伴那條的門往上飛走縮掉（夥伴會從底下過）、其他的沉下去
  function archOut(R, petLane) {
    for (const g of R.gates) if (g.arch.on && g.arch.anim !== "fly" && g.arch.anim !== "sink") { g.arch.anim = g.lane === petLane || g.lane === st.lane ? "fly" : "sink"; g.arch.t0 = st.clock; }
    if (R.hedge && R.hedge.on) { R.hedge.anim = "sink"; R.hedge.t0 = st.clock; }
  }
  // 跑錯（旅程模式）：金幣灑出去一些
  function spillCoins(n) {
    if (n <= 0) return; st.coins -= n; hud(true);
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5; st.fly.push({ x: st.x, y: 0.9, d: st.dist + 0.2, vx: Math.cos(a) * 2.4, vy: 5 + st.rnd() * 1.5, vd: 1.2 + st.rnd(), t0: st.clock }); }
    D.coins.classList.remove("run-shake"); void D.coins.offsetWidth; D.coins.classList.add("run-shake");
  }
  // 彩帶（3D；跟著世界一起往後跑）
  function burst(x, y, d, cols, n, sp) {
    for (let i = 0; i < n; i++) {
      if (st.conf.length > 250) st.conf.shift();
      const a = st.rnd() * Math.PI * 2, u = st.rnd();
      st.conf.push({ x, y, d, vx: Math.cos(a) * sp * (0.4 + u), vy: 3 + st.rnd() * sp, vd: Math.sin(a) * sp * 0.6, rx: st.rnd() * 6, ry: st.rnd() * 6, w: 4 + st.rnd() * 8, t0: st.clock, life: 1.4 + st.rnd() * 0.6, col: new THREE.Color(cols[i % cols.length]) });
    }
  }

  // ===================== 收尾 =====================
  // kind：finish（第 1 圈跑完大結局）／rest（按了休息一下）／out（挑戰模式心用完）
  function endRun(kind) {
    if (!st || st.ending) return;
    st.phase = "end"; st.ending = { kind, t0: st.clock };
    hideCards(); D.finger.className = "run-finger run-off"; D.banner.className = "run-banner run-off"; D.rest.className = "run-rest run-off";
    if (st.row) { archOut(st.row, -1); st.row = null; } st.next = null;
    const score = Math.floor(st.dist), record = st.best.score > 0 && score > st.best.score;
    st.ending.record = record; st.ending.score = score;
    if (kind === "finish") {
      st.zonesCleared++; flyStar();
      st.hop = { t0: st.clock, dur: 0.75, h: 1.7, spin: Math.PI * 2 };
      wait(0.8, () => { if (st) st.hop = { t0: st.clock, dur: 0.7, h: 1.4, spin: -Math.PI * 2 }; });
      wait(1.5, () => { if (st) st.hop = { t0: st.clock, dur: 0.7, h: 1.6, spin: Math.PI * 2 }; });
      play("tp_victory");
      const fire = k => wait(k * 0.45, () => { if (!st) return; burst((st.rnd() - 0.5) * 9, 5 + st.rnd() * 3, st.dist + 12 + st.rnd() * 6, [["#ff6b6b", "#ffe36e"], ["#5fb5f7", "#ffffff"], ["#7fdc8c", "#b9a2fc"], ["#ffad5c", "#ff8fd8"]][k % 4], 50, 7); play("ev_burst"); });
      for (let k = 0; k < 6; k++) fire(k);
      domConfetti(60);
      showMap("finish"); talk(LINES.finish);
      wait(2.8, () => finish(kind));
    } else {
      st.sit = { t0: st.clock, side: st.lane === 0 ? -1 : 1 };     // 夥伴走到路邊坐下
      wait(1.0, () => {
        if (!st) return; showMap(kind);
        if (kind === "rest") talk(LINES.rest); else talk(LINES.reach(ZONES[zi()].name));
        if (record) { play("tp_victory"); domConfetti(40); } else play("ding");
      });
      wait(3.0, () => finish(kind));
    }
  }
  function finish(kind) {
    if (!st || st.ended) return;
    const r = { zone: st.za, zonesCleared: st.zonesCleared, score: st.ending ? st.ending.score : Math.floor(st.dist), coins: st.coins, right: st.right, wrong: st.wrong,
      ms: Math.round(st.clock * 1000), words: st.words.slice(), record: !!(st.ending && st.ending.record), finished: kind === "finish", rest: kind === "rest" };
    st.ended = r;
    safe(api.onEnd, r);
  }
  // 8 區小地圖＋腳印（「你跑到雪山了！」）；沒破紀錄就講「再 N 個門就到○○」，不說輸了
  function showMap(kind) {
    const E = D.end; E.textContent = ""; E.className = "run-end";
    const card = mk("div", "run-map-card", E), here = zi(), Z = ZONES[here];
    const title = kind === "finish" ? TEXT.finish : kind === "rest" ? `${Z.ico} 休息一下！` : `你跑到${Z.name}了！`;
    mk("div", "run-map-title", card, title);
    if (st.dare) mk("div", "run-map-loop", card, loopName(loopOf()));
    const map = mk("div", "run-map", card);
    ZONES.forEach((z, i) => {
      const reached = kind === "finish" || i <= here, spot = mk("div", "run-spot" + (reached ? " run-reached" : "") + (i === here && kind !== "finish" ? " run-now" : ""), map);
      spot.style.animationDelay = (i * 0.12) + "s";
      mk("div", "run-spot-ico", spot, z.ico); mk("div", "run-spot-name", spot, z.name);
      if (i < ZONES.length - 1) mk("div", "run-steps" + (kind === "finish" || i < here ? " run-reached" : ""), map, "🐾");
    });
    const sub = mk("div", "run-map-sub", card);
    if (st.ending && st.ending.record) sub.textContent = "🎉 " + TEXT.record;
    else if (kind === "rest") sub.textContent = TEXT.restTip(Z.name);
    else if (kind === "out") { const left = 8 - st.gates; sub.textContent = TEXT.near(left, ZONES[(here + 1) % ZONES_N].name); }
    const chips = mk("div", "run-map-chips noann", card);
    mk("span", "run-chip", chips, `🏃 ${st.ending ? st.ending.score : Math.floor(st.dist)} 公尺`); mk("span", "run-chip", chips, `🪙 ${st.coins}`); mk("span", "run-chip", chips, `⭐ ${st.stars}`);
  }
  function domConfetti(n) {
    const cs = ["#ff6b6b", "#ffad5c", "#ffe36e", "#7fdc8c", "#5fb5f7", "#b9a2fc", "#ff8fd8"];
    for (let i = 0; i < n; i++) { const c = mk("i", "run-conf", D.fx); c.style.left = (Math.random() * 100) + "%"; c.style.background = cs[i % cs.length]; c.style.animationDelay = (Math.random() * 0.6) + "s"; c.style.animationDuration = (1.6 + Math.random() * 1.2) + "s"; }
    wait(3.2, () => { if (D) D.fx.textContent = ""; });
  }

  // ===================== 每一格 =====================
  function frame(now) {
    if (st && st.ended) { raf = 0; return; }              // 結果已交給主程式（結算畫面）：不再畫、不再收鍵盤，省電（里維 11-01：主程式結算不會呼叫 stop）
    raf = requestAnimationFrame(frame);
    RUN_CTX.frames++;
    if (!st || !W) return;
    // 自動畫質（跟小島一樣）：開始畫 1.5 秒後，45 格平均慢到 40 格／秒以下就降解析度（1.5 → 1.25 → 1）；隔超過 0.5 秒＝切到背景回來，不算
    if (last && !W.lost) { if (!dprCool) dprCool = now + 1500; else if (now > dprCool) { if (now - last > 500) dprWin = []; else dprWin.push(now - last); if (dprWin.length >= 45) { const avg = dprWin.reduce((a, b) => a + b, 0) / dprWin.length; dprWin = []; if (avg > 25 && W.dpr > 1) { W.dpr = dprMem = Math.max(1, W.dpr - 0.25); W.renderer.setPixelRatio(W.dpr); relayout(); dprCool = now + 5000; } } } }
    const real = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;   // 切到背景回來也不會一口氣跳很多格
    const gdt = paused() || W.lost ? 0 : real * SPD();      // 畫面被系統收走（context lost）：遊戲也停，不在看不見的時候偷跑
    if (gdt > 0) { const n = Math.min(24, Math.max(1, Math.ceil(gdt / (1 / 60)))), h = gdt / n; for (let i = 0; i < n && st && !st.dead; i++) step(h); }
    if (!st || !W) return;
    if (++sizeTick % 30 === 0) { const r = D.wrap.getBoundingClientRect(); if (W.size && (Math.abs(r.width - W.size[0]) > 1 || Math.abs(r.height - W.size[1]) > 1)) relayout(); }
    draw(gdt);
    if (!W.lost) W.renderer.render(W.scene, W.cam);
  }
  // 模擬一小步（遊戲時間 h 秒）
  function step(h) {
    st.clock += h;
    if (st.tq.length) { const due = st.tq.filter(t => t.at <= st.clock); if (due.length) { st.tq = st.tq.filter(t => t.at > st.clock); for (const t of due) if (t.my === run && st) t.fn(); if (!st) return; } }
    // 速度：門出現後照「剩下的路／剩下的讀題時間」走（＝慢動作，剛好 T 秒撞上）；選好 0.5 秒後回原速；跑錯停一下
    let target;
    const vz = zoneSpeed(st.za);
    if (st.phase === "intro") target = 2.2;
    else if (st.phase !== "run") target = st.phase === "end" ? 0 : 0;
    else if (st.clock < st.haltUntil) target = 0;
    else if (st.row && !st.row.res) {
      const R = st.row, rem = R.d - HIT - st.dist, left = R.shownAt + R.T - st.clock;
      target = R.go && st.clock >= R.go ? vz : left > 0.05 ? Math.min(vz, Math.max(0, rem) / left) : vz;
      if (R.go && st.clock >= R.go && !R.zoom) { R.zoom = true; if (st.v < vz * 0.8) play("whoosh"); }   // 慢動作放開：咻一聲衝出去
    } else target = st.clock < st.slowUntil ? vz * 0.5 : vz;
    const acc = target < st.v ? (st.phase === "end" ? 6 : 40) : (st.row && !st.row.res ? 40 : 9);
    st.v += clamp(target - st.v, -acc * h, acc * h);
    st.dist += st.v * h;
    // 夥伴左右（0.2 秒內滑到）
    const tx = st.sit ? (ROAD_HALF - 0.6) * st.sit.side : LANES[st.lane];   // 收尾：走到路邊坐下
    st.x += (tx - st.x) * Math.min(1, h * (st.sit ? 3 : 16));
    if (st.phase !== "run") return;
    // 門：出現、撞上
    if (!st.row && st.next && st.next.d - st.dist <= st.next.D + 0.01) spawnRow();
    if (st.row && !st.row.res) {
      const rem = st.row.d - st.dist;
      if (st.row.hedge && st.lane === 1 && rem <= HIT + 1.3 && !st.row.hopped) { st.row.hopped = true; st.hop = { t0: st.clock, dur: 0.6, h: 1.2, spin: 0 }; play("whoosh"); }   // 中間是花叢：提早起跳
      if (rem <= HIT) resolve();
    }
    if (st.auto) autoStep();
    // 撿金幣、愛心、撞木箱
    const py = petY();
    for (const c of st.coinsArr) if (!c.got && Math.abs(c.d - st.dist) < 0.6 && Math.abs(c.x - st.x) < 0.95 && py < 1.4) { c.got = st.clock; st.coins++; coinSfx(); }
    for (const c of st.heartsArr) if (!c.got && Math.abs(c.d - st.dist) < 0.7 && Math.abs(c.x - st.x) < 1.0) { c.got = st.clock; if (st.hearts < 3) st.hearts++; else st.coins += 5; play("ev_sparkle"); hud(true); }
    for (const b of st.boxes) if (!b.hit && Math.abs(b.d - st.dist) < 0.65 && Math.abs(b.x - st.x) < 1.05 && py < 0.6) {
      b.hit = st.clock; st.stum = { t0: st.clock, dur: 0.6, big: false }; st.slowUntil = st.clock + 0.6; play("pop");
      burst(b.x, 0.6, b.d, ["#d79a5c", "#b3743d", "#f0c48a"], 18, 3.5);
    }
    if (st.tunnel && !st.tunnel.said && st.dist >= st.tunnel.a - 2) { st.tunnel.said = true; talk(LINES.tunnel); play("ev_sparkle"); }
    if (st.tunnel && st.dist > st.tunnel.b + 4) st.tunnel = null;
    // 收掉後面的
    if (st.coinsArr.length && st.coinsArr[0].d < st.dist - BEHIND) st.coinsArr = st.coinsArr.filter(c => c.d >= st.dist - BEHIND && !(c.got && st.clock - c.got > 0.4));
    if (st.rings.length && st.rings[0].d < st.dist - BEHIND) st.rings = st.rings.filter(r => r.d >= st.dist - BEHIND);
    if (st.heartsArr.length) st.heartsArr = st.heartsArr.filter(c => c.d >= st.dist - BEHIND);
    if (st.boxes.length) st.boxes = st.boxes.filter(c => c.d >= st.dist - BEHIND);
  }
  let coinAt = 0;
  function coinSfx() { const t = performance.now(); if (t - coinAt > 70) { coinAt = t; play("coin"); } }
  function petY() { if (!st.hop) return 0; const u = (st.clock - st.hop.t0) / st.hop.dur; if (u >= 1) { st.hop = null; return 0; } return st.hop.h * 4 * u * (1 - u); }
  // 路邊東西：兩側各自一路往前補（離鏡頭太遠的先不畫、跑到後面的收掉）
  function fillDecor(side) {
    while (st.cursor[side] < st.dist + VIEW) {
      const k = pickKind(st.theme, side), far = KIND_FAR.has(k);
      const x = (side ? 1 : -1) * (far ? 8.5 + st.rnd() * 5 : ROAD_HALF + 1.4 + st.rnd() * 4.5);
      st.decor.push({ d: st.cursor[side], side, x, kind: k, ry: (st.rnd() - 0.5) * 0.8, s: 0.85 + st.rnd() * 0.35, tint: Math.floor(st.rnd() * 6) });
      st.cursor[side] += 3.2 + st.rnd() * 4;
    }
  }
  const KIND_FAR = new Set(["volcano", "rainbow"]);

  // ===================== 畫面（每格一次） =====================
  const dummy = new THREE.Object3D(), _col = new THREE.Color();
  function setI(im, i, x, y, z, ry = 0, s = 1, rx = 0, rz = 0, sy) { dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(s, sy ?? s, s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }
  function draw(gdt) {
    const z = d => -(d - st.dist), t = st.clock, W_ = W;
    // 地面、路面捲動
    const gm = W_.ground.material.map, rm = W_.road.material.map;
    if (gm) gm.offset.y = (st.dist / W_.groundTile) % 1; if (rm) rm.offset.y = (st.dist / W_.roadTile) % 1;
    if (W_.sky && W_.sky.from) { const u = Math.min(1, (t - W_.sky.t0) / 1.4); skyLerp(u); if (u >= 1) W_.sky.from = null; }
    W_.clouds.position.x = Math.sin(t * 0.02) * 10;
    // 路邊積木、車道虛線
    let n = 0; const base = Math.floor(st.dist);
    for (let i = -BEHIND; i < VIEW; i++) { const d = base + i; for (const s of [-1, 1]) { if (n >= 200) break; setI(W_.curbs, n, s * (ROAD_HALF + 0.2), 0.13, z(d + 0.5)); W_.curbs.setColorAt(n, W_.curbCols[(d & 1)]); n++; } }
    W_.curbs.count = n; W_.curbs.instanceMatrix.needsUpdate = true; W_.curbs.instanceColor.needsUpdate = true;
    n = 0; const b3 = Math.floor(st.dist / 3.2) * 3.2;
    for (let d = b3 - BEHIND; d < st.dist + VIEW && n < 68; d += 3.2) for (const s of [-1, 1]) { setI(W_.dashes, n, s * LANE / 2, 0.02, z(d)); W_.dashes.setColorAt(n, W_.dashCol); n++; }
    W_.dashes.count = n; W_.dashes.instanceMatrix.needsUpdate = true; W_.dashes.instanceColor.needsUpdate = true;
    // 影子（先清，一路加）
    const sh = W_.shadowIM; let ns = 0;
    const shadow = (x, d, r, k = 1) => { if (ns >= 320 || r <= 0) return; dummy.position.set(x, 0.03, z(d)); dummy.rotation.set(0, 0, 0); dummy.scale.set(r * k, 1, r); dummy.updateMatrix(); sh.setMatrixAt(ns++, dummy.matrix); };
    // 路邊東西
    if (st.phase !== "load") { fillDecor(0); fillDecor(1); }
    if (st.decor.length && st.decor[0].d < st.dist - BEHIND) st.decor = st.decor.filter(it => it.d >= st.dist - BEHIND);
    for (const o of W_.res.kinds.values()) o.n = 0;
    for (const it of st.decor) {
      if (it.d > st.dist + VIEW) continue;
      const o = kindMesh(it.kind); if (o.n >= 24) continue;
      const s = it.s * (o.spec.s || 1);
      setI(o.im, o.n, it.x, 0, z(it.d), it.ry, s);
      if (o.spec.tint) o.im.setColorAt(o.n, _col.set(o.spec.tint[it.tint % o.spec.tint.length]));
      o.n++; shadow(it.x, it.d, o.spec.r * s);
    }
    for (const o of W_.res.kinds.values()) { o.im.count = o.n; o.im.visible = o.n > 0; o.im.instanceMatrix.needsUpdate = true; if (o.im.instanceColor) o.im.instanceColor.needsUpdate = true; }
    // 金幣（含灑出去的）
    n = 0; const ci = W_.coinIM;
    for (const c of st.coinsArr) {
      if (c.d > st.dist + 48 || n >= 220) continue;            // 再遠就在霧裡、只剩幾個像素：不畫
      if (c.got) { const u = (t - c.got) / 0.3; if (u >= 1) continue; setI(ci, n++, c.x, 0.65 + u * 1.4, z(c.d), t * 9, 1 + u * 0.3 - u * u * 1.2); continue; }
      setI(ci, n++, c.x, 0.62 + Math.sin(t * 3 + c.d) * 0.07, z(c.d), t * 3.2 + c.d * 0.4); shadow(c.x, c.d, 0.3);
    }
    st.fly = st.fly.filter(f => t - f.t0 < 1.3);
    for (const f of st.fly) { const u = t - f.t0; if (n >= 220) break; setI(ci, n++, f.x + f.vx * u, Math.max(0.35, f.y + f.vy * u - 6 * u * u), z(f.d + f.vd * u), u * 12, 1 - u * 0.5); }
    ci.count = n; ci.instanceMatrix.needsUpdate = true;
    // 愛心、木箱、隧道拱環
    n = 0; for (const c of st.heartsArr) { if (c.d > st.dist + VIEW - 6 || n >= 6) continue; const u = c.got ? (t - c.got) / 0.35 : 0; if (u >= 1) continue; setI(W_.heartIM, n++, c.x, 0.85 + Math.sin(t * 3) * 0.1 + u * 1.5, z(c.d), t * 2.2, 1 + u * 0.6 - u * u); if (!c.got) shadow(c.x, c.d, 0.45); }
    W_.heartIM.count = n; W_.heartIM.instanceMatrix.needsUpdate = true;
    n = 0; for (const b of st.boxes) { if (b.d > st.dist + VIEW - 4 || n >= 8) continue; const u = b.hit ? (t - b.hit) / 0.25 : 0; if (u >= 1) continue; setI(W_.boxIM, n++, b.x, 0.5, z(b.d), 0.15, 1 - u * 0.8); shadow(b.x, b.d, 0.75); }
    W_.boxIM.count = n; W_.boxIM.instanceMatrix.needsUpdate = true;
    n = 0; for (const r of st.rings) { if (r.d > st.dist + VIEW || n >= 24) continue; setI(W_.ringIM, n, 0, 0, z(r.d)); W_.ringIM.setColorAt(n, r.col); n++; }
    W_.ringIM.count = n; W_.ringIM.instanceMatrix.needsUpdate = true; if (n) W_.ringIM.instanceColor.needsUpdate = true;
    // 門與花叢
    for (const a of W_.arches) {
      if (!a.on) continue;
      const u = t - a.t0; let y = 0, s = 1, gone = false;
      if (a.anim === "rise") { const k = Math.min(1, u / 0.45); y = -4.4 * (1 - easeOutBack(k)); a.mat.emissive.setScalar(0); }
      else if (a.anim === "glow") { const k = 0.55 + 0.35 * Math.sin(u * 9); a.mat.emissive.set(LANE_COL[a.lane]).multiplyScalar(k); s = 1 + 0.07 * Math.sin(u * 9); }
      else if (a.anim === "gray") { a.g.rotation.z = Math.sin(Math.min(1, u * 3) * Math.PI) * 0.06; y = -0.25 * Math.min(1, u * 4); }
      // 退場要快（門就在夥伴前面，世界一跑起來 0.6 秒就掃過鏡頭）：一開始就衝
      else if (a.anim === "fly") { const k = Math.min(1, u / 0.3), e = 1 - (1 - k) * (1 - k); y = 3.4 * e; s = (1 + 0.3 * Math.sin(k * Math.PI)) * (1 - e); gone = k >= 1; }
      else if (a.anim === "sink") { const k = Math.min(1, u / 0.3), e = 1 - (1 - k) * (1 - k); y = -5 * e; s = 1 - 0.35 * e; gone = k >= 1; }
      if (gone || a.d < st.dist - BEHIND) { a.on = false; a.g.visible = false; continue; }
      a.g.position.set(LANES[a.lane], y, z(a.d)); a.g.scale.setScalar(Math.max(0.001, s));
      if (y > -1.5) shadow(LANES[a.lane], a.d, 1.25 * Math.max(0.2, s), 1.0);
    }
    for (const h of W_.hedges) {
      if (!h.on) continue; const u = t - h.t0; let y = 0, gone = false;
      if (h.anim === "rise") y = -1.2 * (1 - Math.min(1, u / 0.4)); else if (h.anim === "sink") { const k = Math.min(1, u / 0.45); y = -1.4 * k; gone = k >= 1; }
      if (gone || h.d < st.dist - BEHIND) { h.on = false; h.m.visible = false; continue; }
      h.m.position.set(0, y, z(h.d)); shadow(0, h.d, 1.0, 1.3);
    }
    // 彩帶
    st.conf = st.conf.filter(c => t - c.t0 < c.life);
    n = 0; for (const c of st.conf) { const u = t - c.t0; setI(W_.confIM, n, c.x + c.vx * u, c.y + c.vy * u - 4.2 * u * u, z(c.d + c.vd * u), c.ry + u * c.w, Math.max(0.01, 1 - u / c.life * 0.6), c.rx + u * c.w * 0.7); W_.confIM.setColorAt(n, c.col); n++; if (n >= 260) break; }
    W_.confIM.count = n; W_.confIM.instanceMatrix.needsUpdate = true; if (n) W_.confIM.instanceColor.needsUpdate = true;
    // 夥伴：跑步彈跳、換跑道側傾、跳、跌一下、坐下
    drawPet(gdt, shadow);
    sh.count = ns; sh.instanceMatrix.needsUpdate = true;
    // 鏡頭：跟一點點左右；答對時鏡頭拉一下（風線）
    st.kick = Math.max(0, st.kick - gdt * 1.6);
    // 跑錯停下來的那一下：鏡頭往後上方退，整排門（灰掉的、亮起來的）都看得到
    st.look = (st.look || 0) + ((st.clock < st.haltUntil ? 1 : 0) - (st.look || 0)) * Math.min(1, gdt * 5);
    const C = W_.camBase, lk = st.look * st.look * (3 - 2 * st.look);
    if (C) { const cx = st.x * 0.32 * (1 - lk); W_.cam.position.set(cx, C.y + 1.6 * lk, C.z + 4.2 * lk); W_.cam.lookAt(st.x * 0.18 * (1 - lk), C.ly + 1.1 * lk, C.lz); const f = C.fov + st.kick * 5; if (Math.abs(W_.cam.fov - f) > 0.01) { W_.cam.fov = f; W_.cam.updateProjectionMatrix(); } }
    hud();
  }
  function drawPet(gdt, shadow) {
    const P = W.pet, t = st.clock;
    const running = st.v > 0.4 && !st.sit;
    st.ph += gdt * (st.phase === "intro" ? 9 : 2.2 + st.v * 1.15);
    const ride = st.theme === 3 ? "board" : st.theme === 4 ? "cart" : "";
    let y = 0, pitch = 0, roll = 0, yaw = 0, sq = 1;
    if (ride === "cart") { y = 0.42 + (running ? Math.abs(Math.sin(st.ph * 1.4)) * 0.03 : 0); pitch = running ? Math.sin(st.ph) * 0.02 : 0; }
    else if (ride === "board") { y = 0.1; roll = running ? Math.sin(st.ph * 0.35) * 0.12 : 0; }
    else if (running || st.phase === "intro") { y = Math.abs(Math.sin(st.ph)) * 0.16; pitch = Math.sin(st.ph * 2) * 0.06; sq = 1 - 0.05 * Math.cos(st.ph * 2); }
    y += petY();
    if (st.hop) yaw = st.hop.spin * clamp((t - st.hop.t0) / st.hop.dur, 0, 1);
    if (st.stum) { const u = (t - st.stum.t0) / st.stum.dur; if (u >= 1) st.stum = null; else { const k = Math.sin(u * Math.PI); pitch -= k * (st.stum.big ? 0.75 : 0.4); y += k * (st.stum.big ? 0.3 : 0.15); roll += Math.sin(u * Math.PI * 3) * 0.15 * (1 - u); } }
    roll += clamp((LANES[st.lane] - st.x) * -0.16, -0.38, 0.38);
    if (st.sit) { const u = clamp((t - st.sit.t0) / 0.9, 0, 1); yaw = Math.PI * u; sq = 1 - 0.14 * u; pitch = 0.18 * u; y = u < 1 ? Math.abs(Math.sin(u * 9)) * 0.12 : 0; roll = 0; }
    if (st.ending && st.ending.kind === "finish" && !st.hop) { yaw = Math.PI * Math.min(1, (t - st.ending.t0) / 0.6); }
    P.holder.position.set(st.x, 0, 0); W.petLight.position.x = st.x;
    P.tilt.rotation.set(pitch, 0, roll);
    P.body.position.y = y; P.body.rotation.y = yaw; P.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    P.ride.position.y = ride === "board" ? y - 0.1 : ride === "cart" ? y - 0.42 : 0;
    shadow(st.x, st.dist, 0.55 * (1 - Math.min(0.5, y * 0.25)), 1);
  }
  // HUD（數字變了才寫 DOM）
  function hud(force) {
    if (!D || !st) return; const L = D.last;
    const m = Math.floor(st.dist); if (force || L.m !== m) { L.m = m; D.meterN.textContent = m; }
    if (force || L.c !== st.coins) { L.c = st.coins; D.coinN.textContent = st.coins; }
    if (force || L.h !== st.hearts) { L.h = st.hearts; D.hearts.classList.toggle("run-off", !st.dare); [...D.hearts.children].forEach((e, i) => e.classList.toggle("run-lost", i >= st.hearts)); }
    if (force || L.g !== st.gates || L.z !== st.za) { L.g = st.gates; L.z = st.za; D.zoneIco.textContent = ZONES[zi()].ico; D.dots.forEach((e, i) => e.classList.toggle("run-on", i < st.gates)); }
    if (force) D.jarN.textContent = st.stars;
    // 慢動作讀題：四周暗一點點（看得出「時間變慢了」）
    const slowK = st.row && !st.row.res && st.v < zoneSpeed(st.za) * 0.8 ? 1 : 0;
    if (L.s !== slowK) { L.s = slowK; D.slow.classList.toggle("run-on", !!slowK); }
    if (st.phase === "intro" && st.introTalked && st.clock - st.introAt > 3 && (st.laneMoves >= 2 || st.clock - st.introAt > 9)) { st.phase = "ready"; beginCount(); }
  }

  // ===================== 測試用自動駕駛（window.__zyRun.auto(0.8)） =====================
  function autoPick(row) {
    const A = st.auto, ok = A.rnd() < A.p, right = row.gates.find(g => g.opt === row.q.answer), wrongs = row.gates.filter(g => g !== right);
    const g = ok || !wrongs.length ? right : wrongs[Math.floor(A.rnd() * wrongs.length)];
    A.want = g.lane; A.at = st.clock + A.think[0] + A.rnd() * (A.think[1] - A.think[0]);
  }
  function autoStep() {
    const A = st.auto;
    if (st.row && !st.row.res) { if (A.want != null && st.clock >= A.at) { laneTo(A.want, "card"); A.want = null; } return; }
    const ahead = (arr, k) => arr.find(o => !o[k] && o.d > st.dist + 1 && o.d < st.dist + 22);
    const h = st.dare && st.hearts < 3 && ahead(st.heartsArr, "got"); if (h) { laneTo(LANES.indexOf(h.x), "key"); return; }
    const b = st.boxes.find(o => !o.hit && o.d > st.dist + 1 && o.d < st.dist + 10 && Math.abs(o.x - LANES[st.lane]) < 0.1);
    if (b) laneTo(st.lane === 1 ? (A.rnd() < 0.5 ? 0 : 2) : 1, "key");
  }

  // ===================== 版面 =====================
  function relayout() {
    if (!W || !D) return;
    const r = D.wrap.getBoundingClientRect(), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    W.size = [r.width, r.height]; W.renderer.setSize(w, h, false);
    const asp = w / h, portrait = asp < 1;
    // 夥伴要在下面注音卡的上方（卡大約佔畫面下方 20%）；直向畫面比較窄 → 鏡頭往後、往上，三條跑道才放得下
    const C = portrait ? { fov: 64, y: 4.7, z: 9.6, ly: -0.6, lz: -9 } : { fov: 54, y: 3.6, z: 6.6, ly: -0.55, lz: -9 };
    W.camBase = C; W.cam.aspect = asp; W.cam.fov = C.fov; W.cam.position.set(0, C.y, C.z); W.cam.lookAt(0, C.ly, C.lz); W.cam.updateProjectionMatrix();
    W.camC = W.cam.clone(); W.camC.updateMatrixWorld(); W.camC.updateProjectionMatrix();
    layoutCards();
    if (st && st.row && !st.row.res) for (const g of st.row.gates) fillCard(g.lane, g.opt);
  }

  // ===================== 停止 =====================
  function stop() {
    const had = !!st && !st.dead;
    run++;
    if (st) st.dead = true;
    if (had) { try { api.stopVoice && api.stopVoice(); } catch (e) { /* 主程式的語音停不掉也沒關係 */ } }
    teardown();
    st = null;
  }

  // ===================== 測試掛鉤 =====================
  function state() {
    if (!st) return null;
    const R = st.row || null;
    return { phase: st.phase, mode: st.dare ? "dare" : "trip", zone: st.za, zi: st.za % ZONES_N, loop: Math.floor(st.za / ZONES_N), gates: st.gates, hearts: st.hearts, coins: st.coins, stars: st.stars,
      dist: +st.dist.toFixed(2), score: Math.floor(st.dist), right: st.right, wrong: st.wrong, skips: st.skips, zonesCleared: st.zonesCleared, lane: st.lane, petX: +st.x.toFixed(3), v: +st.v.toFixed(3), vz: zoneSpeed(st.za),
      clock: +st.clock.toFixed(3), ms: Math.round(st.clock * 1000), ease: st.asker.ease(), tier: st.asker.tier(), tierName: TIER_NAME[st.asker.tier()],
      row: R ? { answer: R.q.answer, options: R.q.options.slice(), tier: R.q.tier, kind: R.q.kind, say: R.q.say, pic: R.q.pic, T: R.T, shownAt: R.shownAt, rel: +(R.d - st.dist).toFixed(2), lanes: R.gates.map(g => g.lane), chose: R.chose || null, go: R.go || null } : null,
      next: st.next ? { rel: +(st.next.d - st.dist).toFixed(2), D: st.next.D, T: st.next.T, tier: st.next.q.tier } : null,
      tunnel: !!st.tunnel, restOpen: st.restUntil > st.clock && st.phase === "run", theme: st.theme, pet: W && W.pet ? { temp: W.pet.temp, url: W.pet.url || null } : null,
      spoken: st.spoken.slice(-12), ended: st.ended, ending: st.ending ? st.ending.kind : null, dpr: W ? W.dpr : 0 };
  }
  const hooks = {
    state,
    // 直接答這一排門（沒有門就先叫出下一排）：ok＝跑進對的門；回傳跑道
    answer(ok) {
      if (!st || st.phase !== "run") return null;
      st.haltUntil = 0;
      if (!st.row) { if (!st.next) return null; st.dist = st.next.d - st.next.D; spawnRow(); }
      const R = st.row, right = R.gates.find(g => g.opt === R.q.answer), wrong = R.gates.find(g => g !== right);
      const g = ok || !wrong ? right : wrong;
      st.lane = g.lane; st.x = LANES[g.lane]; st.dist = R.d - HIT - 0.001;
      return g.lane;
    },
    setZone(z) {                                              // 直接跳到第 z 區（0 起算、含第 2 圈；模式不變）
      if (!st || !W) return; z = Math.max(0, z | 0);
      st.za = z; st.gates = 0; st.asker.setZone(z); setTheme(z % ZONES_N, true);
      if (st.row) { archOut(st.row, -1); st.row = null; } hideCards();
      if (st.phase === "run") { st.next = null; planRow(st.dist, 0.4); }
      hud(true);
    },
    hurt() { if (!st || st.phase !== "run") return; st.stum = { t0: st.clock, dur: 1.0, big: true }; if (st.dare) { st.hearts = Math.max(0, st.hearts - 1); hud(); if (st.hearts <= 0) endRun("out"); } else spillCoins(Math.min(st.coins, 5)); },
    lane: i => laneTo(i, "card"), move: d => st && laneTo(st.lane + d, "key"),
    auto(p, think = [1.2, 2.6]) { if (!st) return; st.auto = p == null ? null : { p, think, rnd: rng((st.seed ^ 0x9e3779b9) >>> 0), want: null, at: 0 }; if (st.auto && st.row && !st.row.res) autoPick(st.row); },
    rest() { if (!st || !(st.restUntil > st.clock) || st.phase !== "run") return false; D.rest.click(); return true; },
    stats: () => ({ ...RUN_CTX }),
    world: () => W && { calls: W.renderer.info.render.calls, tris: W.renderer.info.render.triangles, geos: W.renderer.info.memory.geometries, texs: W.renderer.info.memory.textures },
    cards: () => D ? D.card.map(b => ({ on: !b.classList.contains("run-off"), text: b.textContent, rect: b.getBoundingClientRect().toJSON(), fs: parseFloat((b.querySelector(".run-zy") || {}).style?.fontSize) || 0 })) : null,
  };
  if (typeof window !== "undefined") window.__zyRun = hooks;
  return { start, stop, relayout, state };
}
