// ===================== 注音小島：🏃 跑跑大冒險 v2（3D 跑酷；老闆 11-01 試玩後改版）=====================
// 老闆原話（11-01）：「跑步那個遊戲我覺得不要用聽聲音的，要用一個動作或物品，來去看說兩邊哪個才是正確的注音，
//   接著速度要越來越快，總共先設定30個，答對時經過會有加速特效，答錯就會跌倒之類的」
// 玩法：夥伴在三條跑道上自己往前跑；每道門出現時，上方題目列出現一張大圖（物品或動作，不念題、不寫國字），
//   左右兩條跑道各一道注音門、中間是一叢花；下面兩張注音卡對齊左右跑道。小孩點卡（或左右滑、點畫面左右半邊、鍵盤←→）換跑道，跑進對的門。
//   答對：穿過門的瞬間加速衝刺（風線、鏡頭拉寬、彩帶、約 1 秒加速、咻＋叮），念那個詞當確認。
//   答錯（含停在中間撞到花叢）：夥伴往前撲倒、頭上轉圈星星，約 1.2 秒後爬起來，速度先掉下來再慢慢追回；正確的門亮起來、念正確的詞。不扣東西。
//   一局固定 GATES（30）道門，越後面越快：讀題時間（門出現到撞上）第 1 道約 6 秒 → 第 30 道約 2.6 秒，門跟門之間也跑越快；剛連錯（出題核心 easy>0）那幾題多 1 秒。
//   門一出現世界放慢到「剛好這麼多秒才撞上」；小孩點好卡 0.5 秒後恢復原速。每 4 道門換一種風景（角落小提示，不擋畫面、不中斷）。
//   跑過第 30 道＝衝過終點線（彩帶、夥伴跳、「跑到終點了！」）→ 夥伴回頭揮手＋大字「答對 N 題！」2 秒 → onEnd。沒有愛心、不會中途結束。
// 介面：createRunGame(root, api) → { start({ intro }), stop(), relayout(), state() }（start 的 zone 參數不用了：永遠從第 1 題開始）
//   api：say talk play later paused stopVoice speed petGlb best onAnswer onEnd（不呼叫 onZone）
//   onEnd(r)：r = { finished: true, total: 30, right, wrong, score（＝答對題數）, ms（遊戲時間）, coins, words（答對的國字）,
//                   zone（最後的風景編號 0–7）, zonesCleared（跑完的風景數）, record（right > api.best().score） }
// 出題：js/zhuyin-endless-core.js 的 createPicAsker（看圖選注音，兩個選項；越後面越難）。
// 3D：自己的小 Three.js 場景，全部程式畫（低多邊形、圓角、跟小島同一套色感）；不開陰影貼圖，地上用柔和的圓影子（便宜、iPad 順）。
//   遊戲裡所有時間都走「遊戲時鐘」：暫停時不走、乘 api.speed（測試加速）；每格切成 1/60 秒的小步走，加速也不會漏撿金幣。
//   stop() 收掉 rAF、事件、語音，dispose 全部 GPU 資源、forceContextLoss。
// 測試掛鉤：window.__zyRun（state answer setGate lane move auto stats world cards）。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createPicAsker } from "./zhuyin-endless-core.js?v=2";   // 兩款同一個網址（只載一次）；改了核心要一起升

const ROOT = new URL("../", import.meta.url).href;            // 專案根目錄（主程式、試玩頁都對）
const CAT = ROOT + "IMAGE/zy3d/models/cat.glb";               // 沒選夥伴、或夥伴模型載不到 → 小貓

// ===================== 風景、台詞 =====================
export const GATES = 30;                                       // 一局幾道門（之後要改就改這裡）
export const ZONES = [                                         // 每 4 道門換一種風景（主程式介紹卡、結算可以用）
  { name: "沙灘", ico: "🏖️" }, { name: "森林", ico: "🌲" }, { name: "花田", ico: "🌷" }, { name: "雪山", ico: "❄️" },
  { name: "糖果城", ico: "🍭" }, { name: "火山", ico: "🌋" }, { name: "夜空", ico: "🌙" }, { name: "彩虹橋", ico: "🌈" },
];
const PER_THEME = 4;
// api.talk 會念的固定台詞（tools/voice/build_lines.py 收；改句子要一起改那邊）
export const LINES = {
  intro: "看圖片，跑進對的注音門！",          // 第一次玩（intro:true）開跑前，手指示範點左右注音卡
  pick: "點一張注音卡，跑進門裡喔！",          // 第一次停在中間撞到花叢（之後不再念）
  easy: "沒關係，慢慢來。",                    // 剛連錯 2 題（出題核心 easy>0）
  finish: "跑到終點了！好厲害！",              // 衝過終點線
};
// 只顯示、不念的字
const TEXT = { score: n => `答對 ${n} 題！`, record: "新紀錄！", prog: (n, t) => `第 ${n}／${t} 題` };

// ===================== 數字 =====================
const LANE = 2.6, LANES = [-LANE, 0, LANE];                  // 三條跑道的 x（門只在左右兩條，中間是花叢）
const GATE_LANES = [0, 2];
const ROAD_HALF = LANE * 1.5 + 0.2;                          // 路面半寬
const PET_H = 1.0;                                           // 夥伴身高
const VIEW = 66, BEHIND = 14;                                // 前面畫多遠、後面多遠收掉
const D_MAX = 30;                                            // 門最遠在多遠出現（再遠字太小）
const HIT = 0.7;                                             // 門跑到夥伴鼻子前 0.7 算「跑進去了」
const SIGN_Y = 2.5;                                          // 門上招牌中心高度（下面留 1.37 給夥伴鑽過）
const LANE_COL = ["#ff6f9f", "#ffbe2e", "#46b2ff"];         // 左粉、（中黃，沒用到）、右藍：門與注音卡同色
const INK = "#22305a", TONE_COL = "#f0563a";                // 注音字色、聲調色（聲調放大 1.5 倍並上色）
const HAN_FONT = '"PingFang TC","Microsoft JhengHei","Noto Sans TC","Heiti TC",sans-serif';
const BOOST_S = 1.0, BOOST_K = 1.6;                          // 答對衝刺：約 1 秒、1.6 倍速
const FALL_S = 1.2, FALL_STOP = 0.9;                         // 跌倒：1.2 秒爬起來；前 0.9 秒停住
// 越後面越快（p＝第幾道門 0→1）：讀題 6 → 2.6 秒；門跟門之間的跑速 6.5 → 12.5；路段 2.6 → 2.0 秒
const prog = i => Math.max(0, Math.min(1, i / (GATES - 1)));
const readTime = i => 6.0 - 3.4 * prog(i);
const runSpeed = i => 6.5 + 6.0 * prog(i);
const gapTime = i => 2.6 - 0.6 * prog(i);
const themeOf = i => Math.floor(Math.min(i, GATES - 1) / PER_THEME) % ZONES.length;

// ===================== 模組共用：快取、計數 =====================
export const RUN_CTX = { made: 0, live: 0, frames: 0 };    // WebGL context 計數＋畫了幾格（測試查洩漏、查 stop 後有沒有殘留 rAF）
let dprMem = 0;                                              // 自動畫質降到的像素比（下一局直接用）
const gltfCache = new Map();
const PIC_STATE = new Map();                                   // 題目大圖：網址 →「loading」「ok」「bad」（載不到的下次直接用表情符號）
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
    w.boxIM = IM(merge([part(rbox(1.0, 1.0, 1.0, 0.08), "#d79a5c"), part(rbox(1.04, 0.16, 1.04, 0.04), "#b3743d", { y: 0.3 }), part(rbox(1.04, 0.16, 1.04, 0.04), "#b3743d", { y: -0.3 }),
      part(rbox(0.16, 1.04, 1.04, 0.04), "#b3743d", { x: 0.3 }), part(rbox(0.16, 1.04, 1.04, 0.04), "#b3743d", { x: -0.3 })]), vcMat, 8);
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
    // 跌倒時頭上轉圈的星星（掛在夥伴的 holder 上）
    const dizzy = new THREE.Group();
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2, m = new THREE.Mesh(G(paint(starGeo(0.14, 0.05), "#ffd84d")), glowMat); m.position.set(Math.cos(a) * 0.42, Math.sin(k * 2.1) * 0.06, Math.sin(a) * 0.42); dizzy.add(m); }
    dizzy.visible = false; w.dizzy = dizzy;
    // 終點線：兩根紅白柱子＋棋盤格橫幅＋地上的棋盤格（第 30 道門之後才出現）
    const chk = (rep) => canvasTex(64, g => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? "#22305a" : "#ffffff"; g.fillRect(x * 32, y * 32, 32, 32); } }, rep);
    const fin = new THREE.Group();
    const ban = new THREE.Mesh(G(new THREE.PlaneGeometry(ROAD_HALF * 2 + 0.8, 1.0)), M(new THREE.MeshBasicMaterial({ map: chk([10, 1.2]), side: THREE.DoubleSide, toneMapped: false })));
    ban.position.y = 4.4; fin.add(ban);
    const flr = new THREE.Mesh(G(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.4)), M(new THREE.MeshLambertMaterial({ map: chk([10, 1.6]) })));
    flr.rotation.x = -Math.PI / 2; flr.position.y = 0.025; fin.add(flr);
    fin.add(new THREE.Mesh(G(merge([-1, 1].flatMap(s => [part(rbox(0.36, 5.0, 0.36, 0.1), "#ffffff", { x: s * (ROAD_HALF + 0.45), y: 2.5 }),
      ...[0, 1, 2, 3].map(k => part(rbox(0.38, 0.5, 0.38, 0.06), "#ff5d6c", { x: s * (ROAD_HALF + 0.45), y: 0.6 + k * 1.15 })), part(ball(0.3, 1), "#ffd23f", { x: s * (ROAD_HALF + 0.45), y: 5.2 })]))), vcMat));
    fin.visible = false; scene.add(fin); w.finish = fin;
    // 夥伴：holder（左右位置）→ tilt（側傾、前後點頭）→ body（上下彈）→ 模型；先放程式畫的小圓球，模型載好再換
    const holder = new THREE.Group(), tilt = new THREE.Group(), body = new THREE.Group(), ride = new THREE.Group();
    holder.add(tilt); tilt.add(ride); tilt.add(body); holder.add(dizzy); scene.add(holder);
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
    if (st) for (const it of st.decor) it.kind = pickKind(i, it.side);   // 現有的路邊東西一起換成新風景的（淡淡的白光蓋住）
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
    // 上方：「第 N／30 題」進度條（終點旗在最右邊）＋這一題的大圖（不念題、不寫國字）
    const progEl = mk("div", "run-prog", wrap);
    const progT = mk("div", "run-prog-t", progEl);
    const track = mk("div", "run-track noann", progEl), fill = mk("div", "run-fill", track), runner = mk("div", "run-runner", track, "🐾"); mk("div", "run-flag", track, "🏁");
    const picCard = mk("div", "run-piccard run-off noann", wrap), pic = mk("div", "run-pic", picCard);
    const hud = mk("div", "run-hud noann", wrap);
    const coins = mk("div", "run-chip run-coins", hud); mk("span", "", coins, "🪙"); const coinN = mk("b", "", coins, "0");
    const toast = mk("div", "run-chip run-toast run-off", hud);
    const cards = mk("div", "run-cards noann", wrap), card = [];
    for (const i of GATE_LANES) { const b = mk("button", "run-card run-off", cards); b.type = "button"; b.style.setProperty("--c", LANE_COL[i]); b.dataset.lane = i; mk("div", "run-card-in", b); card[i] = b; }
    const big = mk("div", "run-big run-off", wrap), bigT = mk("div", "run-big-t", big), bigS = mk("div", "run-big-s", big);
    const count = mk("div", "run-count run-off", wrap);
    const finger = mk("div", "run-finger run-off", wrap, "👆");
    const flash = mk("div", "run-flash", wrap), fx = mk("div", "run-fx", wrap);
    D = { wrap, stage, slow, wind, load, progEl, progT, fill, runner, picCard, pic, hud, coins, coinN, toast, cards, card, big, bigT, bigS, count, finger, flash, fx, last: {} };
    for (const i of GATE_LANES) on(card[i], "pointerdown", e => { e.preventDefault(); e.stopPropagation(); laneTo(i, "card"); });
    // 換跑道：左右滑（≥30px 就算，滑著不放可以連換）、點畫面左半／右半、鍵盤 ←→（撿金幣用；答題點卡最直接）
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
  // 卡片對齊左右跑道：算跑道在夥伴那一排的螢幕位置（鏡頭置中時），卡片寬固定、不重疊、不出畫面
  function layoutCards() {
    if (!W || !D) return;
    const r = D.wrap.getBoundingClientRect(); if (!r.width) return;
    const c0 = D.card[0], cw = c0.offsetWidth || 180;
    const xs = {}; for (const i of GATE_LANES) { const v = new THREE.Vector3(LANES[i], 0, 0).project(W.camC); xs[i] = (v.x + 1) / 2 * r.width; }
    const mid = r.width / 2, half = Math.max(cw / 2 + 12, Math.min(mid - 8 - cw / 2, (xs[2] - xs[0]) / 2));
    D.card[0].style.left = (mid - half - cw / 2).toFixed(1) + "px"; D.card[2].style.left = (mid + half - cw / 2).toFixed(1) + "px";
  }
  function fillCard(i, text) {
    const b = D.card[i], inn = b.firstChild; inn.textContent = "";
    if (!text) return;
    const cw = b.clientWidth || 180, ch = b.clientHeight || 150, M = measureZ(text);
    const fs = Math.max(40, Math.min(ch * 0.84 / M.h, cw * 0.88 / M.w, ch * 0.62));
    inn.appendChild(zyEl(text, fs));
  }

  // ===================== 開局 =====================
  function start(opts = {}) {
    stop();
    run++;
    const intro = !!opts.intro;                                // opts.zone 不用了：永遠從第 1 題開始
    const seed = typeof api.seed === "number" ? api.seed : (Math.random() * 4294967296) >>> 0;
    const rnd = rng(seed);
    const best = safe(api.best) || { score: 0 };
    st = { my: run, seed, rnd, pa: createPicAsker({ rnd }), intro, best: { score: +best.score || 0, plays: +best.plays || 0 },
      phase: "load", clock: 0, dist: 0, v: 0, lane: 1, x: 0, ph: 0, laneMoves: 0,
      passed: 0, right: 0, wrong: 0, crashes: 0, coins: 0, words: [], theme: 0,
      row: null, next: null, firstRow: true, boostUntil: 0, recoverUntil: 0, slowUntil: 0, finishD: 0, hint: false,
      coinsArr: [], boxes: [], decor: [], cursor: [0, 0], conf: [],
      hop: null, stum: null, fall: null, wave: 0, kick: 0, look: 0, tq: [], spoken: [], ending: null, ended: null, auto: null, dead: false };
    build();
    try { W = buildWorld(); } catch (e) {
      console.warn("[run] WebGL 開不起來", e); W = null;
      D.load.textContent = "😿"; D.load.classList.add("run-sad"); mk("div", "run-sad-t", D.load, "跑道打不開，按 🏠 回去");
      st.phase = "fail"; return Promise.resolve(false);
    }
    D.stage.appendChild(W.renderer.domElement);
    setTheme(0, true);
    relayout(); hud(true);
    for (let s = 0; s < 2; s++) fillDecor(s);
    last = 0; dprWin = []; dprCool = 0; raf = requestAnimationFrame(frame);
    const my = run, w0 = W;
    const petP = Promise.race([loadPet(w0), new Promise(r => setTimeout(r, 6000))]);   // 6 秒還沒好：先用小圓球跑，好了再換
    const warm = () => { try { w0.renderer.compile(w0.scene, w0.cam); } catch (e) { /* 編不好就照常畫 */ } };
    st.readyP = petP.then(() => { if (my !== run || !st) return; warm(); D.load.classList.add("run-off"); if (intro) beginIntro(); else beginCount(); });
    return st.readyP;
  }
  // 第一次玩：兩張（空白）注音卡＋手指輪流點，夥伴跟著換到左邊、右邊（點卡＝夥伴跑過去）
  function beginIntro() {
    st.phase = "intro"; st.introAt = st.clock;
    for (const i of GATE_LANES) { fillCard(i, ""); D.card[i].className = "run-card run-in run-demo"; }
    D.finger.className = "run-finger run-tapcards";
    const demo = k => wait(0.5 + k * 1.2, () => { if (st && st.phase === "intro") { st.lane = k % 2 ? 2 : 0; markCards(); demo(k + 2); } });
    demo(0); demo(1);
    talk(LINES.intro, () => { if (st) st.introTalked = true; });
  }
  function beginCount() {
    st.phase = "count"; D.finger.className = "run-finger run-off"; hideQ();
    st.lane = 1; markCards();
    D.count.textContent = "預備"; D.count.className = "run-count run-pop"; play("tp_count");
    wait(0.9, () => { D.count.textContent = "出發！"; D.count.className = "run-count run-pop run-go"; play("tp_launch"); go(); });
    wait(1.7, () => { if (D) D.count.className = "run-count run-off"; });
  }
  function go() { st.phase = "run"; planRow(st.dist, 0.6); }

  // ===================== 出題、排門、排金幣 =====================
  // 下一道門：出題 → 讀題秒數（越後面越短；剛連錯多 1 秒；第一次玩的第 1 題再多 1 秒）→ 門放在「路段跑完＋慢動作那段」的位置
  function planRow(fromD, extraSec) {
    const i = st.passed, easy = st.pa.stats().easy > 0, q = st.pa.next(i, GATES);
    let T = readTime(i) + (easy ? 1 : 0); if (st.firstRow && st.intro) T += 1;
    const vz = runSpeed(i), va = Math.min(vz, D_MAX / T), Dap = va * T;
    st.next = { q, i, T, va, D: Dap, d: fromD + vz * (gapTime(i) + extraSec) + Dap, vz, easy };
    layoutItems(fromD + 2.5, st.next.d - Dap - 1.5);
    preImg(q);                                                 // 門還要 2–3 秒才出現：圖先抓
  }
  // 題目大圖：GPT 生的圖（q.img，透明背景）；還沒有、或載不到（404、壞檔）＝退回表情符號（q.pic）。載不到的記著，下次直接用表情符號（不會閃一下破圖）
  function picUrl(q) { if (!q || !q.img) return null; try { return new URL(q.img, ROOT).href; } catch (e) { return null; } }
  function preImg(q) { const u = picUrl(q); if (!u || PIC_STATE.has(u)) return; const im = new Image(); im.decoding = "async"; PIC_STATE.set(u, "loading"); im.onload = () => PIC_STATE.set(u, "ok"); im.onerror = () => PIC_STATE.set(u, "bad"); im.src = u; }
  function showPic(q) {
    const el = D.pic, u = picUrl(q); el.textContent = "";
    const emoji = () => { el.textContent = q.pic || "❓"; el.classList.remove("run-has-img"); };
    if (!u || PIC_STATE.get(u) === "bad") return emoji();
    const im = mk("img", "run-pic-img", el); im.alt = ""; im.draggable = false; el.classList.add("run-has-img");
    im.onerror = () => { PIC_STATE.set(u, "bad"); if (D && im.parentNode === el) emoji(); };
    im.onload = () => PIC_STATE.set(u, "ok");
    im.src = u;
  }
  // 路段上的金幣、木箱（門前那段慢動作讀題的路不放東西，讓小孩專心看）
  function layoutItems(a, b) {
    const R = st.rnd; if (b - a < 3) return;
    let cur = a + 0.5, lastLane = st.lane;
    while (cur < b - 1) {
      const len = 4 + Math.floor(R() * 4); let lane = Math.floor(R() * 3); if (lane === lastLane && R() < 0.6) lane = (lane + 1 + Math.floor(R() * 2)) % 3;
      const zig = R() < 0.35;
      for (let k = 0; k < len && cur < b - 0.5; k++) { const l = zig && k >= len / 2 ? (lane + 1) % 3 : lane; st.coinsArr.push({ d: cur, x: LANES[l], got: 0 }); cur += 1.5; }
      lastLane = lane; cur += 2 + R() * 3;
    }
    if (st.passed >= 10 && b - a > 14 && R() < 0.35) {           // 第 11 道門起偶爾有木箱：撞到只會絆一下（不算答錯）
      const d = a + 8 + R() * (b - a - 12), l = Math.floor(R() * 3);
      st.coinsArr = st.coinsArr.filter(c => !(Math.abs(c.d - d) < 2.6 && c.x === LANES[l])); st.boxes.push({ d, x: LANES[l], hit: 0 });
    }
  }
  // 門出現：左右各一道注音門＋中間花叢、上方大圖、下面兩張注音卡、世界慢下來（不念題）
  function spawnRow() {
    const N = st.next; st.next = null;
    const q = N.q, row = { ...N, shownAt: st.clock, gates: [], hedge: null, res: null, go: 0, first: st.firstRow };
    st.firstRow = false;
    q.options.slice(0, 2).forEach((opt, k) => {
      const lane = GATE_LANES[k], a = W.arches.find(x => !x.on); if (!a) return;
      Object.assign(a, { on: true, d: N.d, lane, opt, anim: "rise", t0: st.clock });
      a.mat.color.set(LANE_COL[lane]); a.mat.emissive.set(0x000000); a.smat.color.set(0xffffff); a.g.scale.setScalar(1); a.g.rotation.set(0, 0, 0);
      drawSign(a.cv, opt, LANE_COL[lane]); a.tex.needsUpdate = true; a.g.visible = true;
      row.gates.push({ lane, opt, arch: a });
    });
    const h = W.hedges.find(x => !x.on); if (h) { Object.assign(h, { on: true, d: N.d, anim: "rise", t0: st.clock }); h.m.visible = true; h.m.rotation.set(0, 0, 0); row.hedge = h; }
    st.row = row;
    for (const g of row.gates) { D.card[g.lane].className = "run-card run-in"; fillCard(g.lane, g.opt); }
    markCards();
    showPic(q); D.picCard.className = "run-piccard run-pop noann";
    if (st.auto) autoPick(row);
    if ((row.first && st.intro) || st.hint) { st.hint = false; D.finger.className = "run-finger run-tapcards"; }
    hud(true);
  }
  function markCards() { if (!D) return; for (const i of GATE_LANES) D.card[i].classList.toggle("run-here", !!((st.row && !st.row.res || st.phase === "intro") && i === st.lane)); }
  function hideQ() { if (!D) return; for (const i of GATE_LANES) D.card[i].className = "run-card run-off"; D.picCard.className = "run-piccard run-off noann"; markCards(); }

  // ---------- 換跑道（滑、點左右半邊、點卡、鍵盤都走這裡） ----------
  function laneTo(i, how) {
    if (!st || !W || paused() || st.phase === "load" || st.phase === "end" || st.phase === "fail") return;
    i = clamp(i, 0, 2);
    if (i === st.lane && how !== "card") return;
    if (i !== st.lane) { st.lane = i; st.laneMoves++; }
    const R = st.row;
    if (R && !R.res && st.clock - R.shownAt >= 0.4) { R.chose = st.clock; R.go = st.clock + 0.5; if (st.phase === "run") D.finger.className = "run-finger run-off"; }   // 選好 0.5 秒後恢復原速
    markCards();
  }

  // ---------- 撞上門：判斷 ----------
  function resolve() {
    const R = st.row, g = R.gates.find(x => x.lane === st.lane), right = R.gates.find(x => x.opt === R.q.answer);
    const ok = !!g && g.opt === R.q.answer, got = g ? g.opt : null;
    R.res = { ok, got, lane: st.lane, at: st.clock, crash: !g };
    const rep = st.pa.report(ok);
    safe(api.onAnswer, { ok, q: R.q, got });
    st.passed++;
    for (const i of GATE_LANES) { const b = D.card[i]; b.classList.remove("run-here"); if (right && i === right.lane) b.classList.add("run-good"); else if (g && i === g.lane) b.classList.add("run-dim"); }
    if (ok) {
      // 答對：穿過門的瞬間加速衝刺（風線、鏡頭拉寬、彩帶、約 1 秒加速、咻＋叮），念那個詞當確認
      st.right++; play("ok"); play("whoosh");
      if (R.q.word && !st.words.includes(R.q.word.h)) st.words.push(R.q.word.h);
      archOut(R); burst(LANES[g.lane], SIGN_Y, R.d, [LANE_COL[g.lane], "#ffffff", "#ffe066", "#7fdc8c", "#b9a2fc"], 46, 5.5);
      st.boostUntil = st.clock + BOOST_S; st.kick = 1;
      D.wind.className = "run-wind"; void D.wind.offsetWidth; D.wind.className = "run-wind run-on";
      sayQ(R.q);
      wait(1.0, hideQ);
    } else {
      // 答錯（停在中間＝撞到花叢也算）：往前撲倒、頭上轉圈星星，1.2 秒後爬起來；正確的門亮起來、念正確的詞
      st.wrong++; play("ng");
      if (g) { g.arch.anim = "gray"; g.arch.t0 = st.clock; g.arch.mat.color.set("#d7d4dc"); g.arch.smat.color.set("#e2e0e6"); }
      else { st.crashes++; if (R.hedge) { R.hedge.anim = "shake"; R.hedge.t0 = st.clock; } burst(0, 0.8, R.d, ["#5cbf4f", "#ff8fc0", "#ffd23f", "#ffffff"], 22, 3.5); }
      if (right) { right.arch.anim = "glow"; right.arch.t0 = st.clock; }
      st.fall = { t0: st.clock }; st.recoverUntil = st.clock + FALL_STOP + 2.4;
      const then = !g && st.crashes === 1 ? () => talk(LINES.pick) : rep.easy >= 3 ? () => talk(LINES.easy) : null;   // 第一次撞花叢先教「點卡」
      if (!g) st.hint = true;
      sayQ(R.q, then);
      wait(FALL_STOP + 0.15, () => { if (st) { archOut(R); hideQ(); } });
    }
    st.row = null;
    afterGate();
    hud(true);
  }
  // 一道門過了：第 30 道後擺終點線；每 4 道換風景（角落小提示）
  function afterGate() {
    if (st.passed >= GATES) { st.finishD = st.dist + runSpeed(GATES - 1) * 1.6; W.finish.visible = true; return; }
    if (st.passed % PER_THEME === 0) themeUp();
    laneTo(1, "auto");                                     // 過了門就跑回中間：下一題一定要自己選左或右（不選＝撞花叢），不能靠上一題的位置矇對（里維 11-01）
    planRow(st.dist, 0);
  }
  function themeUp() {
    const i = themeOf(st.passed); if (i === st.theme) return;
    D.flash.className = "run-flash run-soft"; void D.flash.offsetWidth; D.flash.className = "run-flash run-soft run-on";
    wait(0.2, () => { if (st && W) setTheme(i, false); });
    D.toast.textContent = `${ZONES[i].ico} ${ZONES[i].name}`; D.toast.className = "run-chip run-toast run-in";
    wait(2.4, () => { if (D) D.toast.className = "run-chip run-toast run-off"; });
    play("select");
  }
  // 門退場：夥伴那條的門往上飛走縮掉（夥伴會從底下過）、其他的沉下去；花叢沉下去
  function archOut(R) {
    for (const g of R.gates) if (g.arch.on && g.arch.anim !== "fly" && g.arch.anim !== "sink") { g.arch.anim = g.lane === st.lane ? "fly" : "sink"; g.arch.t0 = st.clock; }
    if (R.hedge && R.hedge.on) { R.hedge.anim = "sink"; R.hedge.t0 = st.clock; }
  }
  // 彩帶（3D；跟著世界一起往後跑）
  function burst(x, y, d, cols, n, sp) {
    for (let i = 0; i < n; i++) {
      if (st.conf.length > 250) st.conf.shift();
      const a = st.rnd() * Math.PI * 2, u = st.rnd();
      st.conf.push({ x, y, d, vx: Math.cos(a) * sp * (0.4 + u), vy: 3 + st.rnd() * sp, vd: Math.sin(a) * sp * 0.6, rx: st.rnd() * 6, ry: st.rnd() * 6, w: 4 + st.rnd() * 8, t0: st.clock, life: 1.4 + st.rnd() * 0.6, col: new THREE.Color(cols[i % cols.length]) });
    }
  }

  // ===================== 終點 =====================
  // 衝過終點線：彩帶、夥伴跳、「跑到終點了！」→ 停下來回頭揮手＋大字「答對 N 題！」2 秒 → onEnd
  function crossFinish() {
    if (!st || st.ending) return;
    st.phase = "end"; st.ending = { t0: st.clock, record: (st.best.plays | 0) > 0 && st.right > st.best.score };   // 第一次玩沒有紀錄可破（跟主程式一樣）
    hideQ(); D.finger.className = "run-finger run-off";
    play("tp_victory");
    st.hop = { t0: st.clock, dur: 0.75, h: 1.7, spin: Math.PI * 2 };
    const pal = [["#ff6b6b", "#ffe36e"], ["#5fb5f7", "#ffffff"], ["#7fdc8c", "#b9a2fc"], ["#ffad5c", "#ff8fd8"]];
    for (let k = 0; k < 5; k++) wait(k * 0.3, () => { if (!st) return; burst((st.rnd() - 0.5) * 7, 3 + st.rnd() * 3, st.dist + 6 + st.rnd() * 5, pal[k % 4], 46, 6.5); if (k % 2 === 0) play("ev_burst"); });
    domConfetti(60);
    talk(LINES.finish);
    wait(1.2, () => {
      if (!st) return; st.wave = st.clock;
      D.bigT.textContent = TEXT.score(st.right); D.bigS.textContent = st.ending.record ? "🎉 " + TEXT.record : "";
      D.big.className = "run-big run-pop"; play(st.ending.record ? "star" : "ding");
    });
    wait(3.2, finish);
  }
  function finish() {
    if (!st || st.ended) return;
    const r = { finished: true, total: GATES, right: st.right, wrong: st.wrong, score: st.right, ms: Math.round(st.clock * 1000), coins: st.coins, words: st.words.slice(),
      zone: st.theme, zonesCleared: st.theme + 1, record: !!(st.ending && st.ending.record) };
    st.ended = r;
    safe(api.onEnd, r);
  }
  function domConfetti(n) {
    const cs = ["#ff6b6b", "#ffad5c", "#ffe36e", "#7fdc8c", "#5fb5f7", "#b9a2fc", "#ff8fd8"];
    for (let i = 0; i < n; i++) { const c = mk("i", "run-conf", D.fx); c.style.left = (Math.random() * 100) + "%"; c.style.background = cs[i % cs.length]; c.style.animationDelay = (Math.random() * 0.6) + "s"; c.style.animationDuration = (1.6 + Math.random() * 1.2) + "s"; }
    wait(3.2, () => { if (D) D.fx.textContent = ""; });
  }

  // ===================== 每一格 =====================
  function frame(now) {
    if (st && st.ended) { raf = 0; return; }              // 結果已交給主程式（結算畫面）：不再畫、省電（里維 11-01；主程式結算不呼叫 stop）
    raf = requestAnimationFrame(frame);
    RUN_CTX.frames++;
    if (!st || !W) return;
    // 自動畫質（跟小島一樣）：開始畫 1.5 秒後，45 格平均慢到 40 格／秒以下就降解析度（1.5 → 1.25 → 1）；隔超過 0.5 秒＝切到背景回來，不算
    if (last && !W.lost) { if (!dprCool) dprCool = now + 1500; else if (now > dprCool) { if (now - last > 500) dprWin = []; else dprWin.push(now - last); if (dprWin.length >= 45) { const avg = dprWin.reduce((a, b) => a + b, 0) / dprWin.length; dprWin = []; if (avg > 25 && W.dpr > 1) { W.dpr = dprMem = Math.max(1, W.dpr - 0.25); W.renderer.setPixelRatio(W.dpr); relayout(); dprCool = now + 5000; } } } }
    const real = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;   // 切到背景回來也不會一口氣跳很多格
    const gdt = paused() ? 0 : real * SPD();
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
    // 速度：門出現後照「剩下的路／剩下的讀題時間」走（＝慢動作，剛好 T 秒撞上）；選好 0.5 秒後回原速；答對衝刺 1.6 倍；跌倒先停、再慢慢追回
    const vz = runSpeed(st.passed), falling = st.fall && st.clock - st.fall.t0 < FALL_STOP;
    let target, up = 9;
    if (st.phase === "intro") target = 2.2;
    else if (st.phase !== "run") target = 0;
    else if (falling) target = 0;
    else if (st.row && !st.row.res) {
      const R = st.row, rem = R.d - HIT - st.dist, left = R.shownAt + R.T - st.clock;
      target = R.go && st.clock >= R.go ? vz : left > 0.05 ? Math.min(vz, Math.max(0, rem) / left) : vz; up = 40;
      if (R.go && st.clock >= R.go && !R.zoom) { R.zoom = true; if (st.v < vz * 0.8) play("whoosh"); }   // 慢動作放開：咻一聲衝出去
    } else if (st.clock < st.boostUntil) { target = vz * BOOST_K; up = 30; }
    else target = st.clock < st.slowUntil ? vz * 0.5 : vz;
    if (st.clock < st.recoverUntil && !falling && !(st.row && !st.row.res)) up = 4;            // 跌倒爬起來：慢慢追回
    const acc = target < st.v ? (st.phase === "end" ? 5 : falling ? 45 : 30) : up;
    st.v += clamp(target - st.v, -acc * h, acc * h);
    st.dist += st.v * h;
    // 夥伴左右（0.2 秒內滑到）
    st.x += (LANES[st.lane] - st.x) * Math.min(1, h * 16);
    if (st.phase !== "run") return;
    // 門：出現、撞上；終點線
    if (!st.row && st.next && st.next.d - st.dist <= st.next.D + 0.01) spawnRow();
    if (st.row && !st.row.res && st.row.d - st.dist <= HIT) resolve();
    if (st.finishD && st.dist >= st.finishD - 0.3) { crossFinish(); return; }
    if (st.auto) autoStep();
    // 撿金幣、撞木箱
    const py = petY();
    for (const c of st.coinsArr) if (!c.got && Math.abs(c.d - st.dist) < 0.6 && Math.abs(c.x - st.x) < 0.95 && py < 1.4) { c.got = st.clock; st.coins++; coinSfx(); }
    for (const b of st.boxes) if (!b.hit && Math.abs(b.d - st.dist) < 0.65 && Math.abs(b.x - st.x) < 1.05 && py < 0.6 && !st.fall) {
      b.hit = st.clock; st.stum = { t0: st.clock, dur: 0.6 }; st.slowUntil = st.clock + 0.6; play("pop");
      burst(b.x, 0.6, b.d, ["#d79a5c", "#b3743d", "#f0c48a"], 18, 3.5);
    }
    // 收掉後面的
    if (st.coinsArr.length && st.coinsArr[0].d < st.dist - BEHIND) st.coinsArr = st.coinsArr.filter(c => c.d >= st.dist - BEHIND && !(c.got && st.clock - c.got > 0.4));
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
    // 金幣、木箱
    n = 0; const ci = W_.coinIM;
    for (const c of st.coinsArr) {
      if (c.d > st.dist + 48 || n >= 220) continue;            // 再遠就在霧裡、只剩幾個像素：不畫
      if (c.got) { const u = (t - c.got) / 0.3; if (u >= 1) continue; setI(ci, n++, c.x, 0.65 + u * 1.4, z(c.d), t * 9, 1 + u * 0.3 - u * u * 1.2); continue; }
      setI(ci, n++, c.x, 0.62 + Math.sin(t * 3 + c.d) * 0.07, z(c.d), t * 3.2 + c.d * 0.4); shadow(c.x, c.d, 0.3);
    }
    ci.count = n; ci.instanceMatrix.needsUpdate = true;
    n = 0; for (const b of st.boxes) { if (b.d > st.dist + VIEW - 4) continue; const u = b.hit ? (t - b.hit) / 0.25 : 0; if (u >= 1) continue; setI(W_.boxIM, n++, b.x, 0.5, z(b.d), 0.15, 1 - u * 0.8); shadow(b.x, b.d, 0.75); }
    W_.boxIM.count = n; W_.boxIM.instanceMatrix.needsUpdate = true;
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
      h.m.rotation.z = 0; h.m.scale.set(1, 1, 1);
      if (h.anim === "rise") y = -1.2 * (1 - Math.min(1, u / 0.4));
      else if (h.anim === "shake") { h.m.rotation.z = Math.sin(u * 30) * 0.12 * Math.max(0, 1 - u * 1.5); const k = Math.min(1, u * 6); h.m.scale.set(1 + 0.25 * k, 1 - 0.55 * k, 1 + 0.15 * k); }   // 撞扁：跌倒的夥伴才看得到
      else if (h.anim === "sink") { const k = Math.min(1, u / 0.35); y = -1.4 * k; gone = k >= 1; }
      if (gone || h.d < st.dist - BEHIND) { h.on = false; h.m.visible = false; continue; }
      h.m.position.set(0, y, z(h.d)); shadow(0, h.d, 1.0, 1.3);
    }
    // 終點線
    if (W_.finish.visible) { W_.finish.position.z = z(st.finishD); if (st.finishD < st.dist - BEHIND) W_.finish.visible = false; }
    // 彩帶
    st.conf = st.conf.filter(c => t - c.t0 < c.life);
    n = 0; for (const c of st.conf) { const u = t - c.t0; setI(W_.confIM, n, c.x + c.vx * u, c.y + c.vy * u - 4.2 * u * u, z(c.d + c.vd * u), c.ry + u * c.w, Math.max(0.01, 1 - u / c.life * 0.6), c.rx + u * c.w * 0.7); W_.confIM.setColorAt(n, c.col); n++; if (n >= 260) break; }
    W_.confIM.count = n; W_.confIM.instanceMatrix.needsUpdate = true; if (n) W_.confIM.instanceColor.needsUpdate = true;
    // 夥伴：跑步彈跳、換跑道側傾、跳、跌倒、揮手
    drawPet(gdt, shadow);
    sh.count = ns; sh.instanceMatrix.needsUpdate = true;
    // 鏡頭：跟一點點左右；答對衝刺時鏡頭拉寬；跌倒停下來那一下往後上方退（看得到亮起來的正確門）
    st.kick = Math.max(0, st.kick - gdt * 1.1);
    const lookOn = st.fall && t - st.fall.t0 < FALL_STOP + 0.15 ? 1 : 0;
    st.look += (lookOn - st.look) * Math.min(1, gdt * 5);
    const C = W_.camBase, lk = st.look * st.look * (3 - 2 * st.look);
    if (C) { const cx = st.x * 0.32 * (1 - lk); W_.cam.position.set(cx, C.y + 1.6 * lk, C.z + 4.2 * lk); W_.cam.lookAt(st.x * 0.18 * (1 - lk), C.ly + 1.1 * lk, C.lz); const f = C.fov + st.kick * 8; if (Math.abs(W_.cam.fov - f) > 0.01) { W_.cam.fov = f; W_.cam.updateProjectionMatrix(); } }
    hud();
  }
  function drawPet(gdt, shadow) {
    const P = W.pet, t = st.clock;
    const running = st.v > 0.4;
    st.ph += gdt * (st.phase === "intro" ? 9 : 2.2 + st.v * 1.15);
    const ride = st.theme === 3 ? "board" : st.theme === 4 ? "cart" : "";
    let y = 0, pitch = 0, roll = 0, yaw = 0, sq = 1, dz = false;
    if (ride === "cart") { y = 0.42 + (running ? Math.abs(Math.sin(st.ph * 1.4)) * 0.03 : 0); pitch = running ? Math.sin(st.ph) * 0.02 : 0; }
    else if (ride === "board") { y = 0.1; roll = running ? Math.sin(st.ph * 0.35) * 0.12 : 0; }
    else if (running || st.phase === "intro") { y = Math.abs(Math.sin(st.ph)) * 0.16; pitch = Math.sin(st.ph * 2) * 0.06; sq = 1 - 0.05 * Math.cos(st.ph * 2); }
    if (t < st.boostUntil) pitch -= 0.14;                      // 衝刺：身體往前傾
    y += petY();
    if (st.hop) yaw = st.hop.spin * clamp((t - st.hop.t0) / st.hop.dur, 0, 1);
    if (st.stum) { const u = (t - st.stum.t0) / st.stum.dur; if (u >= 1) st.stum = null; else { const k = Math.sin(u * Math.PI); pitch -= k * 0.4; y += k * 0.15; } }
    // 跌倒：0–0.2 往前撲倒、0.2–0.75 趴著晃（頭上轉圈星星）、0.75–1 爬起來
    if (st.fall) {
      const u = (t - st.fall.t0) / FALL_S;
      if (u >= 1) st.fall = null;
      else { const dn = u < 0.2 ? u / 0.2 : u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25, e = dn * dn * (3 - 2 * dn); pitch = -1.3 * e; y = (u > 0.75 ? Math.sin((u - 0.75) / 0.25 * Math.PI) * 0.25 : 0); roll = u > 0.2 && u < 0.75 ? Math.sin(u * 40) * 0.08 : 0; sq = 1; dz = u > 0.12 && u < 0.92; }
    }
    roll += clamp((LANES[st.lane] - st.x) * -0.16, -0.38, 0.38);
    if (st.wave) { const u = clamp((t - st.wave) / 0.5, 0, 1); yaw = Math.PI * u; roll = u >= 1 ? Math.sin((t - st.wave) * 9) * 0.22 : 0; y = u >= 1 ? Math.abs(Math.sin((t - st.wave) * 4.5)) * 0.18 : 0; pitch = 0; }   // 終點：回頭揮手（整隻左右晃＋小跳）
    P.holder.position.set(st.x, 0, 0); W.petLight.position.x = st.x;
    P.tilt.rotation.set(pitch, 0, roll);
    P.body.position.y = y; P.body.rotation.y = yaw; P.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    P.ride.position.y = ride === "board" ? y - 0.1 : ride === "cart" ? y - 0.42 : 0;
    W.dizzy.visible = dz; if (dz) { W.dizzy.rotation.y = t * 7; W.dizzy.position.set(0, 0.62, -0.75); }
    shadow(st.x, st.dist, 0.55 * (1 - Math.min(0.5, y * 0.25)), 1);
  }
  // HUD（數字變了才寫 DOM）
  function hud(force) {
    if (!D || !st) return; const L = D.last;
    if (force || L.c !== st.coins) { L.c = st.coins; D.coinN.textContent = st.coins; }
    const n = st.ended || st.ending ? GATES : Math.min(GATES, st.passed + 1);
    if (force || L.n !== n || L.p !== st.passed) { L.n = n; L.p = st.passed; D.progT.textContent = TEXT.prog(n, GATES); const f = (st.passed / GATES * 100).toFixed(1) + "%"; D.fill.style.width = f; D.runner.style.left = f; }
    // 慢動作讀題：四周暗一點點（看得出「時間變慢了」）
    const slowK = st.row && !st.row.res && st.v < runSpeed(st.passed) * 0.8 ? 1 : 0;
    if (L.s !== slowK) { L.s = slowK; D.slow.classList.toggle("run-on", !!slowK); }
    if (st.phase === "intro" && st.introTalked && st.clock - st.introAt > 4.6) { st.phase = "ready"; beginCount(); }
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
    const R = st.row || null, t = st.clock;
    return { phase: st.phase, passed: st.passed, total: GATES, right: st.right, wrong: st.wrong, crashes: st.crashes, coins: st.coins, theme: st.theme,
      dist: +st.dist.toFixed(2), lane: st.lane, petX: +st.x.toFixed(3), v: +st.v.toFixed(3), vz: runSpeed(st.passed), clock: +t.toFixed(3), ms: Math.round(t * 1000),
      boost: t < st.boostUntil, fall: !!st.fall, recovering: t < st.recoverUntil, easy: st.pa.stats().easy, level: st.pa.stats().level,
      row: R ? { i: R.i, answer: R.q.answer, options: R.q.options.slice(), pic: R.q.pic, say: R.q.say, tier: R.q.tier, T: R.T, easy: R.easy, shownAt: R.shownAt, rel: +(R.d - st.dist).toFixed(2), lanes: R.gates.map(g => g.lane), chose: R.chose || null, go: R.go || null } : null,
      next: st.next ? { i: st.next.i, rel: +(st.next.d - st.dist).toFixed(2), D: st.next.D, T: st.next.T, img: picUrl(st.next.q) } : null,
      finish: st.finishD ? +(st.finishD - st.dist).toFixed(2) : null, pet: W && W.pet ? { temp: W.pet.temp, url: W.pet.url || null } : null,
      spoken: st.spoken.slice(-12), ended: st.ended, ending: !!st.ending, dpr: W ? W.dpr : 0 };
  }
  const hooks = {
    state,
    // 直接答這一道門（沒有門就先叫出下一道）：true＝跑進對的門、false＝錯的門、"mid"＝停在中間撞花叢；回傳跑道
    answer(ok) {
      if (!st || st.phase !== "run") return null;
      if (st.fall) st.fall.t0 = st.clock - FALL_STOP;            // 跌倒還沒爬起來：直接算爬起來了
      if (!st.row) { if (!st.next) return null; st.dist = st.next.d - st.next.D; spawnRow(); }
      const R = st.row, right = R.gates.find(g => g.opt === R.q.answer), wrong = R.gates.find(g => g !== right);
      const lane = ok === "mid" ? 1 : (ok || !wrong ? right : wrong).lane;
      st.lane = lane; st.x = LANES[lane]; st.dist = R.d - HIT - 0.001;
      return lane;
    },
    setGate(i) {                                              // 直接跳到第 i 道門（0 起算；風景跟著換）
      if (!st || !W || st.phase !== "run") return; i = clamp(i | 0, 0, GATES - 1);
      if (st.row) { archOut(st.row); st.row = null; } hideQ();
      st.passed = i; setTheme(themeOf(i), true); st.next = null; planRow(st.dist, 0.4); hud(true);
    },
    lane: i => laneTo(i, "card"), move: d => st && laneTo(st.lane + d, "key"),
    auto(p, think = [1.2, 2.6]) { if (!st) return; st.auto = p == null ? null : { p, think, rnd: rng((st.seed ^ 0x9e3779b9) >>> 0), want: null, at: 0 }; if (st.auto && st.row && !st.row.res) autoPick(st.row); },
    stats: () => ({ ...RUN_CTX }),
    world: () => W && { calls: W.renderer.info.render.calls, tris: W.renderer.info.render.triangles, geos: W.renderer.info.memory.geometries, texs: W.renderer.info.memory.textures },
    cards: () => D ? GATE_LANES.map(i => { const b = D.card[i]; return { lane: i, on: !b.classList.contains("run-off"), text: b.textContent, rect: b.getBoundingClientRect().toJSON(), fs: parseFloat((b.querySelector(".run-zy") || { style: {} }).style.fontSize) || 0 }; }) : null,
    pic: () => { if (!D) return null; const im = D.pic.querySelector("img");
      return { on: !D.picCard.classList.contains("run-off"), text: D.pic.textContent, img: im ? im.getAttribute("src") : null, imgW: im ? im.naturalWidth : 0, imgRect: im ? im.getBoundingClientRect().toJSON() : null,
        rect: D.picCard.getBoundingClientRect().toJSON(), fs: parseFloat(getComputedStyle(D.pic).fontSize) }; },
  };
  if (typeof window !== "undefined") window.__zyRun = hooks;
  return { start, stop, relayout, state };
}
