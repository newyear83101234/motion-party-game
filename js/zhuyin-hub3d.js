// ===================== 注音小島 3D 選單（等角小島）=====================
// zhuyin.js 在選單需要時用動態 import() 載入；載入失敗／沒有 WebGL2／逾時 → zhuyin.js 退回原本卡片選單。
// 每棟建築＝一個遊戲：點一下建築（或上方浮標）＝開介紹卡（opts.onPick，10-12），再點一次／按「開始玩」＝點那張 .mode-card，解鎖判斷、翻牌選張數都沿用 zhuyin.js 原本的程式；扭蛋機呼叫 opts.onGacha()。
// 點遠方的島（地面、建築、橋）或橋頭路牌＝飛過去（10-12）。
// 版面（阿葉 10-10：島大一點、不用每格都是關卡、路全部串起來）：4×4 個街區、井字路＋中央圓環；
//   9 個街區放遊戲建築＋扭蛋機（棋盤狀錯開，浮標才不會擠在一起），其餘 7 個是景點（花園、燈塔、遊樂場、雕像廣場、公園、旋轉木馬、海灘）。
// 寵物（hub.setPets）照路網隨機逛，雙向靠右走、前面有人就等、等太久就掉頭；裝飾（hub.setDecor）依序擺在預留的放置點。
// 風格：Tack Lin 3D 等角小鎮（色票 docs/zhuyin-3d-plan.md）。素材 Kenney.nl CC0（IMAGE/zy3d/kenney/），其餘程式生成。
// Three.js 0.186.1 自架在 IMAGE/zy3d/vendor/（zhuyin.html 的 importmap）。
// 載入分段：①地形、路、樹、景點、浮標（不用下載）好了就開選單 ②建築／路燈等模型背景下載，到了就「長出來」③寵物、裝飾。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as RWD from "./zhuyin-rewards.js?v=2";   // 寵物換裝：wearOf()／wearPose()（跟換裝畫面同一套）。⚠ 跟 zhuyin.js 的 import 用同一個 ?v（升版號時一起改，才會是同一份模組）

// ---------- 常數 ----------
const P = { deep: "#3f97c9", grid: "#5fa9d6", shallow: "#7fcfd0", sand: "#ecd7a3", dirt: "#a8673f", dirtDk: "#7d4a2e", grass: "#86c449", grassDk: "#5f9c3a",
  plaza: "#ddd8cf", road: "#bdb8b1", purple: "#8b70cc", purpleDk: "#5e4aa8", cream: "#f0e7d3", eave: "#2f6b50", pink: "#f2808f", autumn: "#f08a3c", wood: "#c98a55" };
const PITCH = 4.8, RW = 1.25, SW = 0.45, LANE = 0.3, RR = 1.85;   // 街區間距、車道寬、人行道寬、車道（靠右）偏移、中央圓環半徑
const MAX_WALK = 11;                                  // 同時在路上走的寵物最多幾隻（其他在寵物公園，輪流出來；寧次 10-10）
const ROADS = [-PITCH, 0, PITCH];                      // 井字路：x 與 z 各三條，延伸到海邊
const BC = b => (b - 1.5) * PITCH;                     // 街區中心：-7.2 -2.4 2.4 7.2
const LEDGE_Y = -0.28, SEA_Y = -0.95, SAND_Y = -0.66;   // 海邊一圈較低的草地台階、海面、沙灘
const KIT = "IMAGE/zy3d/kenney/", MODELS = "IMAGE/zy3d/models/";
const TEX_KITS = new Set(["city-kit-commercial", "city-kit-suburban", "fantasy-town-kit", "pirate-kit", "watercraft-pack", "car-kit", "holiday-kit", "food-kit", "cube-pets"]);   // 有 colormap 調色盤的套件
const CAM_EL = 31 * Math.PI / 180;                    // 俯角 31°（計畫 30–35°）
const FPS = 30;                                       // 省電：最多 30 格／秒
const TAP_MOVE = 24, TAP_MS = 800;                    // 5 歲小孩常按久、拖著點：移動 < 24px、按住 < 0.8 秒都算點（寧次 10-10）
const DEBUG = /[?&]debug\b/.test(location.search);
// 彩虹島（10-12：第三座島，主島西邊；彩虹拱橋接主島 z=0 那條東西向路的西端）：
//   島形＝圓角方塊（中心 RB.x／RB.z、半寬 hx／hz）；島上一圈環狀路 RB_LOOP（圓角長方形中線、轉角半徑 rc），東邊一小段路接橋；
//   北排（正面朝 +z＝朝鏡頭）：小熊家、寵物服裝店、小兔家；南排：小豬家、彩虹配送站（後面碼頭＋貨船）；環內是風車和彩虹花田
const RB = { x: -20.3, z: 0.2, hx: 6.6, hz: 6.3, r: 2.2 };
const RB_LOOP = { x0: -24.6, x1: -16.0, z0: -2.2, z1: 2.4, rc: 1.4 };
const RAINBOW_NEED = 20;                               // 貼紙幾張開放（★可調；彩虹配送站 MODES.deliver.need 也是 20）
const RB_COLORS = ["#ff6b6b", "#ffa24c", "#ffd84d", "#7ad66b", "#4fb6f0", "#6f7ff2", "#b583f2"];   // 彩虹七色（粉一點）
// 歸仁區東邊的小半島（10-12）：陀螺競技場（DEFS 的 tops）。新市區（下面「新市區」段的 DIST，中心 4.8, −18.9、半寬 5.2）那條東西向橫路往東延伸過來，
// 路底就是競技場入口。半島＝圓角方塊，西緣跟新市區東岸疊一點，連成一塊（sdDist 兩塊取聯集）
const TEX = { x: 13.4, z: -18.9, hx: 3.8, hz: 3.0, r: 1.2 };
const ARENA = { x: 14.0, z: -18.9 };                    // 競技場中心（圓形擂台＋看台，半徑約 1.8）
// 遊戲建築（＋扭蛋機）：街區 (bx, bz)，door＝往哪一側的路接過去；鏡頭從 +x+z 看，正面朝 +x 或 +z。
// ex＝不種樹的範圍；LAYOUT 是模型載完後的實際大小（區域座標，先寫死：模型還在下載時鏡頭就能擺好、浮標就能點，
// 改了建築要更新——網址加 ?debug 後在主控台跑 __hub3d.measure() 會印出新的值）
// isle:"rainbow"＝彩虹島上的建築（直接給世界座標 x／z；門口小路由 buildRainbow 接，lockDist＝門口路障離建築中心多遠）
const DEFS = [
  { mode: "hunt", bx: 0, bz: 0, door: [0, 1], ex: [-1.8, 1.8, -1.8, 1.8] },
  { mode: "match", bx: 2, bz: 0, door: [0, 1], ex: [-1.4, 1.4, -1.5, 1.7] },
  { mode: "build", bx: 1, bz: 1, door: [1, 0], ex: [-1.5, 1.6, -1.6, 1.6] },
  { mode: "tone", bx: 3, bz: 1, door: [0, 1], ex: [-1.5, 1.8, -1.6, 1.6] },
  { mode: "whack", bx: 0, bz: 2, door: [1, 0], ex: [-1.7, 1.8, -1.6, 1.6] },
  { mode: "order", bx: 2, bz: 2, door: [1, 0], ex: [-1.8, 1.8, -1.5, 1.5] },
  { mode: "fish", bx: 1, bz: 3, door: [1, 0], ex: [-1.6, 1.6, 1.2, 2.8] },
  { mode: "frog", bx: 3, bz: 3, door: [0, -1], ex: [-1.8, 1.9, -1.6, 1.7] },
  { mode: "bubble", bx: 2, bz: 3, door: [0, -1], ex: [-1.45, 1.45, -1.35, 2.6] },   // 阿葉 10-11：泡泡救援灣（原本的海灘景點）
  { mode: "gacha", bx: 0, bz: 3, door: [1, 0], ex: [-1.5, 1.5, -1.5, 1.5], free: true },
  { mode: "deliver", isle: "rainbow", x: -18.4, z: 4.75, door: [0, -1], ex: [-1.6, 1.7, -1.0, 1.8], lockDist: 1.55 },   // 10-12 彩虹配送站（倉庫＋碼頭＋貨船）
  { mode: "dress", isle: "rainbow", x: -20.3, z: -4.5, door: [0, 1], ex: [-1.1, 1.1, -1.2, 1.0], free: true },        // 10-12 寵物服裝店（像扭蛋機：不用貼紙，點了 opts.onDress()）
  { mode: "detective", isle: "rainbow", x: -18.0, z: 0, door: [1, 0], ex: [-0.8, 0.8, -1.05, 1.05], lockDist: 1.0 },   // 10-12 詞句偵探社（環狀路裡面東邊、正對彩虹橋入口；門朝東接環狀路東段；彩虹花田讓出東邊一段）
  { mode: "tops", isle: "town", x: ARENA.x, z: ARENA.z, door: [-1, 0], ex: [-2.75, 1.95, -1.95, 1.95], lockDist: 2.15 },   // 10-12 陀螺競技場（歸仁區東邊小半島；橫路的路底＝入口，門朝西）
].map(d => ({ ...d, x: d.x ?? BC(d.bx), z: d.z ?? BC(d.bz) }));
const isleOf = d => d.isle || "main";
const MAIN_DEFS = DEFS.filter(d => !d.isle);
const LAYOUT = {   // [box x0,x1,y0,y1,z0,z1]、[anchor x,y,z]、[body x,y,z]（區域座標）
  hunt: [[-1.48, 1.24, 0.5, 2.32, -1.12, 1.43], [0.27, 1.64, 0.27], [0.27, 0.94, 0.27]],
  match: [[-0.8, 0.8, 0, 3.37, -0.87, 1.44], [0, 3.53, -0.15], [0, 1.0, -0.15]],
  build: [[-1.8, 1.22, 0, 2.27, -1.18, 1.61], [-0.3, 2.39, 0], [-0.3, 0.91, 0]],
  tone: [[-0.6, 1.89, 0, 3.2, -1.29, 1.84], [0.35, 1.82, -0.25], [0.35, 0.68, -0.25]],
  whack: [[-1.87, 1.3, -0.36, 1.55, -1.15, 1.35], [-1.12, 1.67, -0.1], [-1.12, 0.62, -0.1]],
  order: [[-1.4, 1.76, 0, 2.82, -1.19, 1.71], [-0.2, 2.99, 0], [-0.2, 0.79, 0]],
  fish: [[-1.84, 2.01, -1.09, 1.27, 0.79, 6.64], [1.45, 0.44, 4.3], [1.45, -0.49, 4.3]],
  frog: [[-1.57, 2.23, -0.16, 1.11, -1.44, 1.82], [0.37, 0.16, 0.32], [0.37, 0.03, 0.32]],
  bubble: [[-1.13, 1.45, 0, 3.24, -0.93, 2.4], [-0.55, 2.57, -0.35], [-0.55, 0.98, -0.35]],
  gacha: [[-1.32, 1.15, 0, 2.34, -1.23, 1.23], [-0.55, 1.99, 0], [-0.55, 0.75, 0]],
  deliver: [[-1.5, 2.34, -1.27, 1.67, -1.3, 3.6], [0, 1.79, -0.14], [0, 0.67, -0.14]],   // 10-12 measure()；z 只算到碼頭中段（貨船也點得到，影子圓不要大到海上）
  dress: [[-0.85, 0.9, 0, 2.57, -0.87, 1.18], [0, 2.7, -0.15], [0, 0.83, -0.15]],
  detective: [[-0.97, 1.24, 0, 1.88, -0.91, 1.16], [0, 2, 0], [0, 0.75, 0]],   // 10-12 measure()
  tops: [[-2.06, 1.81, 0, 1.5, -1.81, 1.94], [-0.13, 1.62, 0.06], [-0.13, 0.6, 0.06]],   // 10-12 measure()
};
// 景點（沒有浮標、點了沒反應）
const SPOTS = [
  { id: "garden", bx: 1, bz: 0, door: [0, 1] }, { id: "lighthouse", bx: 3, bz: 0, door: [-1, 0] }, { id: "playground", bx: 0, bz: 1, door: [1, 0] },
  { id: "statue", bx: 2, bz: 1, door: [-1, 0] }, { id: "park", bx: 1, bz: 2, door: [0, 1] }, { id: "carousel", bx: 3, bz: 2, door: [-1, 0] },
].map(s => ({ ...s, x: BC(s.bx), z: BC(s.bz) }));
// 寵物：models.json 有列的自製模型優先；沒有就用 Kenney Cube Pets 原檔（依檔名猜）
const PET_KENNEY = { cat: "animal-cat", fox: "animal-fox", lion: "animal-lion", panda: "animal-panda", penguin: "animal-penguin", bunny: "animal-bunny" };
const PET_H = 1.0, STAGE_SCALE = { 1: 0.75, 2: 1, 3: 1.15 };   // 寵物身高（長大＝原尺寸）；寶寶 0.75、超級 1.15

// ---------- 狀態 ----------
let renderer, scene, camera, sun, hemi, stage, tagLayer, finger, opts;
const plugins = [];                                   // 外掛（天氣等）：use(plugin)
let running = false, raf = 0, shown = false, frames = 0, needFit = true, lastMs = 0, lastDraw = 0, dead = false, lost = false, lostTimer = 0, fitSig = "", built = false;
let fitObs = [], shadowDirty = true, lastShadow = 0, dpr = 1, dprWin = [], dprCool = Infinity, restStarted = false, parkDoor = null, restSlots = [], lastRotate = 0, noPause = false;
const tickers = [];                                   // 每幀持續動畫 (t, dt)
const anims = new Set();                              // 一次性動畫 { update(now) → false 結束 }
const view = { k: 40, cx: 0, cy: 0 };                 // 擺好的鏡頭：每單位幾 px、視角中心
const user = { zoom: 1, px: 0, py: 0 };               // 小孩拖曳／縮放
const hitBoxes = [], agents = [], pets = new Map(), timers = new Set(), failedPets = new Set(), warnedPets = new Set();
const exRects = [], terraces = [], blobs = [], decorSlots = [], statics = [], treeXZ = [];   // statics：景點、路、地形等不會動也不能點的群組（最後整個合併）；treeXZ：種好的樹／樹叢（施工三角錐要讓開）
let tapLockUntil = 0, hopCycle = -1, fingerDone = false, petWant = null, decorWant = null, decorGroup = null, decorBlob = null, agentBlob = null;
const _v = new THREE.Vector3(), _c = new THREE.Color(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };

// ---------- 小工具 ----------
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function paint(geo, hex) {
  _c.set(hex); const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return geo;
}
function sdRoundBox(x, z, hx, hz, r) { const qx = Math.abs(x) - hx + r, qz = Math.abs(z) - hz + r; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r; }
function rrShape(hx, hz, r) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz); s.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hx, hz - r); s.absarc(hx - r, hz - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hx + r, hz); s.absarc(-hx + r, hz - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hx, -hz + r); s.absarc(-hx + r, -hz + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
const matCache = new Map();
function mat(hex, extra) {                             // 平塗 Lambert（同色共用）
  const k = hex + (extra ? JSON.stringify(extra) : "");
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color: hex, ...extra }));
  return matCache.get(k);
}
const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });   // 燈泡、燈塔燈：自己發亮
// shadow：會不會投影（小東西用底下的柔和陰影貼片就好）；dyn：會動的東西（不能被合併）
function mesh(geo, m, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, shadow = true, dyn = false, parent } = {}) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = shadow; o.receiveShadow = true; if (dyn) o.userData.dyn = true; if (parent) parent.add(o); return o;
}
// 程式生成的小物一律用頂點色＋同一個材質 → 同一區塊合併後只剩一個 draw call
function vm(geo, hex, o = {}) { return mesh(paint(geo.index ? geo.toNonIndexed() : geo, hex), o.glow ? glowMat : vcMat, o); }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
// 往下長的圓角板：頂面在 top，厚 depth
function slab({ hx, hz, r, top, depth, color, bevelT = 0, bevelS = 0, inset = true, seg = 3, x = 0, z = 0 }) {
  const geo = new THREE.ExtrudeGeometry(rrShape(hx, hz, Math.max(0.05, Math.min(r, hx - 0.01, hz - 0.01))), { depth, curveSegments: 14, bevelEnabled: bevelT > 0, bevelThickness: bevelT, bevelSize: bevelS, bevelOffset: inset ? -bevelS : 0, bevelSegments: seg });
  geo.rotateX(Math.PI / 2); geo.translate(x, top - bevelT, z);
  const m = new THREE.Mesh(geo, mat(color)); m.receiveShadow = true; return m;
}
function canvasTex(w, h, draw) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const HAN_FONT = '"PingFang TC","Microsoft JhengHei","Noto Sans TC","Heiti TC",sans-serif';
// 條紋布（遮雨棚、施工圍籬）
function stripeTex(a, b, n = 6, diag = false) {
  const t = canvasTex(128, 64, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b;
    for (let i = 0; i < n * 2; i++) if (i % 2) { if (diag) { g.beginPath(); const s = w / n / 2; g.moveTo(i * s - h, h); g.lineTo(i * s, 0); g.lineTo(i * s + s, 0); g.lineTo(i * s + s - h, h); g.fill(); } else g.fillRect(i * w / n / 2, 0, w / n / 2, h); } });
  t.wrapS = THREE.RepeatWrapping; return t;
}
const texMats = {};                                    // 共用貼圖材質（木甲板、太陽能板、招牌）
function texMat(key, make) { return texMats[key] || (texMats[key] = new THREE.MeshLambertMaterial({ map: make() })); }
const deckMat = () => texMat("deck", () => { const t = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#c98a55"; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#bf7f4b" : "#d39663"; g.fillRect(0, i * 8, w, 7); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
const solarMat = () => texMat("solar", () => canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#2f4f8f"; g.fillRect(0, 0, w, h); g.strokeStyle = "#8fb0e0"; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); } }));
function signMat(icon, bg) { return texMat("sign" + icon + bg, () => canvasTex(128, 128, (g, w) => { g.fillStyle = "#ffffff"; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.fill(); g.font = `66px ${EMOJI_FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(icon, 64, 70); })); }

// 鎖住（未解鎖）＝灰階：shader 最後一步把顏色往灰拉
const grayCache = new WeakMap(), grays = [];
function grayOf(m) {
  let g = grayCache.get(m);
  if (!g) {
    g = m.clone();
    g.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n float zyG = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)); gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(zyG * 0.92 + 0.05), 0.85);"); };
    g.customProgramCacheKey = () => "zy-gray";
    grayCache.set(m, g); grays.push(g);
  }
  return g;
}
function setGray(root, on) {
  root.traverse(o => {
    if (!o.isMesh || o.userData.keepColor || !o.material || o.material.visible === false) return;
    if (!o.userData.mat0) o.userData.mat0 = o.material;
    o.material = on ? (Array.isArray(o.userData.mat0) ? o.userData.mat0.map(grayOf) : grayOf(o.userData.mat0)) : o.userData.mat0;
  });
}
// 不會動的 mesh 依材質合併成一個（draw call 從幾十個降到幾個）；pivot 保留 → 彈跳、點擊判定、灰階都照常
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map();
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || !o.material || o.material.visible === false) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dyn) return;
    const m = o.userData.mat0 || o.material, key = m.uuid + "|" + o.castShadow + "|" + !!o.geometry.attributes.color + "|" + !!o.userData.keepColor;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o);
  });
  const mt = new THREE.Matrix4();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const color = !!list[0].geometry.attributes.color;
    const geos = list.map(o => {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv", ...(color ? ["color"] : [])].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.morphAttributes = {}; g.clearGroups();
      return g.applyMatrix4(mt.multiplyMatrices(inv, o.matrixWorld));
    });
    const merged = mergeGeometries(geos); geos.forEach(g => g.dispose()); if (!merged) continue;
    const m = new THREE.Mesh(merged, list[0].userData.mat0 || list[0].material);
    m.castShadow = list[0].castShadow; m.receiveShadow = true; m.userData.keepColor = list[0].userData.keepColor;
    root.add(m);
    for (const o of list) o.removeFromParent();
  }
}
// 柔和接觸陰影（物件底下一片淡淡的圓影，便宜的 AO 感）
let blobTex;
function blobTexture() { return blobTex || (blobTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.45, "rgba(0,0,0,0.75)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); })); }
function blobMesh(n, opacity = 0.4) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x1a2230, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), Math.max(1, n));
  m.renderOrder = 1; m.frustumCulled = false; m.castShadow = m.receiveShadow = false; return m;
}
const blob = (x, z, r, y = groundY(x, z)) => blobs.push([x, y + 0.012, z, r]);

// ---------- Kenney 素材：調色盤貼圖換色 ----------
const kitImg = {}, kitImgP = {};
const kitMatCache = new Map();
// 效能體檢 10-12：①這幾套用 128² 調色盤（tools/render3d/colormap_small.py 產生，驗過每個 UV 取到的顏色差 ≤1/255；換色畫布跟著變 128²，GPU 每張 1MB→64KB）——js/zhuyin-deliver.js 有同一份清單
// ②用 fetchPriority=high 抓：建築要等它才能上色，不要被同時下載的背景音樂、音效擠到最後（原本 ImageLoader 是 Low）
const KIT_SMALL = new Set(["city-kit-commercial", "fantasy-town-kit", "pirate-kit", "car-kit", "cube-pets"]);
function kitImage(kit) {
  return kitImgP[kit] || (kitImgP[kit] = new Promise((ok, no) => {
    const im = new Image(); im.fetchPriority = "high";
    im.onload = () => ok(kitImg[kit] = im); im.onerror = () => no(new Error("colormap " + kit));
    im.src = `${KIT}${kit}/Textures/${KIT_SMALL.has(kit) ? "colormap-128" : "colormap"}.png`;
  }));
}
function makeKitTexture(img, tints) {
  const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
  const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, cv.width, cv.height), d = id.data, W = cv.width;
  const CW = cv.width / 8, CH = cv.height / 4;        // 調色盤 8 欄 × 4 列
  const lum = k => 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
  for (const [col, row, hex] of tints) {
    _c.set(hex); const tr = Math.round(Math.pow(_c.r, 1 / 2.2) * 255), tg = Math.round(Math.pow(_c.g, 1 / 2.2) * 255), tb = Math.round(Math.pow(_c.b, 1 / 2.2) * 255);
    const x0 = col * CW, y0 = row * CH, ref = Math.max(lum(((y0 + CH / 2) * W + x0 + CW / 4) * 4), 1);
    for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CW; x++) {
      const k = (y * W + x) * 4, f = Math.min(Math.max(lum(k) / ref, 0.35), 1.25);
      d[k] = Math.min(255, tr * f); d[k + 1] = Math.min(255, tg * f); d[k + 2] = Math.min(255, tb * f);
    }
  }
  g.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  return tex;
}
function kitMaterial(kit, tints = []) {
  const k = kit + JSON.stringify(tints);
  if (!kitMatCache.has(k)) kitMatCache.set(k, new THREE.MeshLambertMaterial({ map: makeKitTexture(kitImg[kit], tints) }));
  return kitMatCache.get(k);
}
// GLB 裡指向 colormap.png 的貼圖不用下載（材質會換成上面自己調色的那張）→ 給一張 1×1 空圖，省掉重複下載
const BLANK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const manager = new THREE.LoadingManager(); manager.setURLModifier(u => /\/colormap\.png$/.test(u) ? BLANK : u);
const loader = new GLTFLoader(manager);
const glbCache = new Map();
function loadGLB(url) { if (!glbCache.has(url)) glbCache.set(url, loader.loadAsync(url)); return glbCache.get(url); }
// 有貼圖的換成調色盤材質；沒貼圖的（Nature Kit 等）塗成頂點色 → 跟程式生成的小物一起合併
function prepMaterials(obj, kit, tints, gold) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    const src = o.material;
    if (gold) o.material = gold;
    else if (src && src.map && kitImg[kit]) o.material = kitMaterial(kit, tints);
    else { o.geometry = paint(o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(), src && src.color ? "#" + src.color.getHexString() : "#ffffff"); o.material = vcMat; }
    o.castShadow = o.receiveShadow = true;
  });
}
async function kenney(kit, name, { tints = [], scale = 1, x = 0, y = 0, z = 0, ry = 0, parent = scene, shadow = true, gold = null } = {}) {
  const [g] = await Promise.all([loadGLB(`${KIT}${kit}/${name}.glb`), TEX_KITS.has(kit) ? kitImage(kit) : null]);
  const obj = g.scene.clone(true);
  prepMaterials(obj, kit, tints, gold);
  if (!shadow) obj.traverse(o => { o.castShadow = false; });
  obj.scale.setScalar(scale); obj.position.set(x, y, z); obj.rotation.y = ry;
  obj.userData.clips = g.animations;
  if (parent) parent.add(obj);
  return obj;
}
// 自製模型（IMAGE/zy3d/models/）：models.json 有列才載（沒列＝檔案可能還沒做好，抓了會 404）
let modelList = null;
function models() { return modelList || (modelList = fetch(MODELS + "models.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => ({ set: new Set(j.models || []), anchors: j.anchors || {}, fit: j.wear_fit || {} }))); }   // fit＝配件擺放微調（寵物換裝）
async function usableGlb(url) {
  if (!url) return null;
  if (url.startsWith(MODELS)) return (await models()).set.has(url.slice(MODELS.length).replace(/\.glb$/, "")) ? url : null;
  return url;
}
// 自製模型每個都內嵌一張 512×512 色票：內容一樣的就共用同一個 Texture（省 GPU 記憶體）
const texShare = new Map(), hashCv = document.createElement("canvas"); hashCv.width = hashCv.height = 8;
function shareTex(t) {
  if (!t || !t.image || !t.image.width) return t;
  let key;
  try { const g = hashCv.getContext("2d", { willReadFrequently: true }); g.clearRect(0, 0, 8, 8); g.drawImage(t.image, 0, 0, 8, 8); key = t.image.width + "x" + t.image.height + ":" + g.getImageData(0, 0, 8, 8).data.join(","); } catch (e) { return t; }
  const hit = texShare.get(key); if (hit) { if (hit !== t) t.dispose(); return hit; }
  texShare.set(key, t); return t;
}
const anyMatCache = new Map();
function lambertOf(src, hasColor) {                    // 換成 Lambert；半透明（扭蛋機的玻璃圓頂）要留著透明度
  const map = shareTex(src.map || null), k = [map && map.uuid, src.color && src.color.getHexString(), src.transparent, src.opacity, hasColor].join("|");
  if (!anyMatCache.has(k)) anyMatCache.set(k, new THREE.MeshLambertMaterial({ map, color: src.color || 0xffffff, vertexColors: hasColor, transparent: !!src.transparent, opacity: src.opacity ?? 1, depthWrite: !src.transparent, side: src.side }));
  return anyMatCache.get(k);
}
// 任意 GLB → 換成 Lambert 材質；h／w 有給就縮放成「最高 h、最寬 w」並讓腳踩地（userData.fit 記下原始座標→縮放後的矩陣，掛配件用）
async function loadAny(url, { h = 0, w = 99 } = {}) {
  const kit = (url.match(/kenney\/([^/]+)\//) || [])[1];
  const [g] = await Promise.all([loadGLB(url), kit && TEX_KITS.has(kit) ? kitImage(kit) : null]);
  const obj = g.scene.clone(true);
  if (kit) prepMaterials(obj, kit, []);
  else obj.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material && !o.material.isMeshLambertMaterial) o.material = lambertOf(o.material, !!o.geometry.attributes.color); } });
  if (h) {
    const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(Math.min(h / (sz.y || 1), w / (Math.max(sz.x, sz.z) || 1)));
    const b2 = new THREE.Box3().setFromObject(obj); obj.position.y -= b2.min.y;   // 腳踩地
  }
  obj.updateMatrix(); obj.userData.fit = obj.matrix.clone();
  return obj;
}

// =========================================================
// 地形：不規則海岸（幾個圓角方塊聯集、挖海灣）＋海邊一圈較低的台階＋沙灘＋淺水礁石
// =========================================================
const ROCKS = [[11.2, 3.2, 0.5], [11.6, 4.0, 0.32], [-6.0, 11.4, 0.45], [-5.2, 11.9, 0.3], [6.8, 11.5, 0.42], [11.4, -4.6, 0.38], [-11.4, -6.2, 0.45], [-3.2, -11.5, 0.4], [12.4, -9.8, 0.55], [12.0, -11.0, 0.35], [4.8, 11.9, 0.3]];
function sdIsland(x, z) {
  let d = sdRoundBox(x, z, 9.6, 9.6, 2.6);
  d = Math.min(d, sdRoundBox(x - 9.4, z + 9.2, 2.0, 1.7, 1.0));      // 右後角：燈塔岬
  d = Math.min(d, sdRoundBox(x + 10.0, z + 2.4, 0.9, 2.2, 0.6));     // 左側小岬（遊樂場）
  d = Math.min(d, sdRoundBox(x - 6.6, z - 10.0, 1.5, 0.7, 0.5));     // 前方小岬（青蛙池）
  d = Math.min(d, sdRoundBox(x + 2.4, z + 10.0, 1.8, 0.6, 0.5));     // 後方小岬（花園）
  d = Math.min(d, sdRoundBox(x - 10.0, z - 6.0, 0.7, 1.4, 0.5));     // 右前小岬
  d = Math.max(d, -(Math.hypot(x - 3.0, z - 11.9) - 2.5));           // 海灘小海灣（前方）
  d = Math.max(d, -sdRoundBox(x - 10.6, z - 2.6, 1.0, 1.2, 0.7));    // 右側凹口
  d = Math.max(d, -sdRoundBox(x + 10.4, z + 7.6, 1.0, 1.3, 0.7));    // 左後凹口
  return d;
}
const NA = 240;
// 沿著從中心出去的射線找「最外面一個 f ≤ lvl 的點」→ 輪廓（中間有海水小洞也當陸地，不會破洞）
function contour(f, lvl, inset = () => 0) {
  const pts = [];
  for (let i = 0; i < NA; i++) {
    const a = i / NA * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
    let r = 0; for (let s = 0; s < 17; s += 0.04) if (f(cx * s, cz * s) <= lvl) r = s;
    r = Math.max(0.5, r - inset(a));
    pts.push(new THREE.Vector2(cx * r, cz * r));
  }
  return pts;
}
// 海邊台階寬度（依方向；0＝主台地直接到岸邊：釣魚碼頭、海灘那幾段）
function ledgeW(a) {
  const deg = ((a * 180 / Math.PI) % 360 + 360) % 360;
  const T = [[0, 0.7], [20, 1.15], [34, 0.25], [58, 0], [128, 0.3], [150, 1.0], [178, 0.45], [200, 1.1], [216, 0.15], [238, 0.9], [262, 0.95], [292, 0.5], [312, 0.2], [334, 1.2], [350, 0.7]];
  let i = T.length - 1; for (let k = 0; k < T.length; k++) if (deg >= T[k][0]) i = k;
  const [d0, v] = T[i], prev = T[(i - 1 + T.length) % T.length][1], u = deg - d0;
  return u < 4 ? prev + (v - prev) * (u / 4) : v;
}
let mainPoly = null, islPoly = null;
function polyR(poly, x, z) { const a = Math.atan2(z, x), i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * NA) % NA; return poly[i].length(); }
function inside(poly, x, z, m = 0) { return Math.hypot(x, z) < polyR(poly, x, z) - m; }
function groundY(x, z) {
  for (const t of terraces) if (x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1) return t.fy ? t.fy(x, z) : t.y;   // fy：拱橋（高度跟著 x 變）
  if (sdDist(x, z) <= 0) return 0;                     // 新市區
  if (sdRainbow(x, z) <= 0) return 0;                  // 彩虹島
  return inside(mainPoly, x, z) ? 0 : inside(islPoly, x, z) ? LEDGE_Y : SAND_Y;
}
let seaU;
function buildTerrain() {
  const g = new THREE.Group(); scene.add(g); statics.push(g);
  islPoly = contour(sdIsland, 0);
  mainPoly = contour(sdIsland, 0, ledgeW);
  const sandPoly = contour(sdIsland, 0.7);
  const ext = (pts, top, depth, color, bevel = 0, out = false) => {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, curveSegments: 4, bevelEnabled: bevel > 0, bevelThickness: bevel * 0.45, bevelSize: bevel, bevelOffset: out ? 0 : -bevel, bevelSegments: 3 });
    geo.rotateX(Math.PI / 2); geo.translate(0, top - (bevel ? bevel * 0.45 : 0), 0);
    const m = new THREE.Mesh(geo, mat(color)); m.receiveShadow = true; g.add(m); return m;
  };
  ext(mainPoly, 0, 0.1, P.grass, 0.04);                       // 主台地草地
  ext(mainPoly.map(p => p.clone().multiplyScalar(0.997)), -0.08, -LEDGE_Y + 0.02, P.dirt).castShadow = true;   // 主台地土壁
  ext(islPoly, LEDGE_Y, 0.1, "#7fbd45", 0.04);                // 海邊台階草地（稍暗）
  ext(islPoly.map(p => p.clone().multiplyScalar(0.997)), LEDGE_Y - 0.08, 0.22, P.dirt);
  ext(islPoly.map(p => p.clone().multiplyScalar(0.994)), LEDGE_Y - 0.3, 0.45, P.dirtDk);
  ext(sandPoly, SAND_Y, 0.4, P.sand, 0.55, true);             // 沙灘（往外斜進水裡）
  // 礁石：淺水裡一叢叢灰藍色石頭（海面白邊會自動繞著它們）
  const rocks = new THREE.Group(); scene.add(rocks); statics.push(rocks); const rr2 = rng(3);
  for (const [x, z, r] of ROCKS) for (let k = 0; k < 3; k++) {
    const s = r * (k ? 0.55 : 1), geo = new THREE.IcosahedronGeometry(s, 0); geo.scale(1, 0.7, 1);
    vm(geo, k % 2 ? "#8c97a6" : "#a3adb8", { x: x + (k ? (rr2() - 0.5) * r * 1.6 : 0), y: SEA_Y + s * 0.25, z: z + (k ? (rr2() - 0.5) * r * 1.6 : 0), ry: rr2() * 6, parent: rocks });
  }
  mergeStatic(rocks);
  // 海：烘一張距離場貼圖（島＋礁石）→ 淺水、浪花白邊照著真正的岸線走
  // 範圍 ±R 含北邊的新市區、西邊的彩虹島（10-12：27 → 36，解析度 N 等比例放大＝每格大小不變；超出範圍 shader 當深水）
  const R = 36, N = Math.round(288 * R / 27), data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N * 2 * R - R, z = (j + 0.5) / N * 2 * R - R;
    let d = Math.min(sdIsland(x, z), sdDist(x, z), sdRainbow(x, z)) - 1.25;
    for (const [rx, rz, rs] of ROCKS) d = Math.min(d, Math.hypot(x - rx, z - rz) - rs * 1.3);
    data[j * N + i] = Math.max(0, Math.min(255, Math.round((d + 3) / 16 * 255)));
  }
  const sdf = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  sdf.magFilter = sdf.minFilter = THREE.LinearFilter; sdf.needsUpdate = true;
  seaU = { uTime: { value: 0 }, uDeep: { value: new THREE.Color(P.deep) }, uShallow: { value: new THREE.Color(P.shallow) }, uGrid: { value: new THREE.Color("#7cbde3") }, uSdf: { value: sdf }, uR: { value: R } };
  const seaMat = new THREE.ShaderMaterial({
    uniforms: seaU, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uGrid; uniform sampler2D uSdf; uniform float uR;
      varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float sdf(vec2 p){ vec2 uv = p / (2.0 * uR) + 0.5; if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 13.0; return texture2D(uSdf, uv).r * 16.0 - 3.0; }
      void main(){
        vec2 p = vW.xz;
        float d = sdf(p);
        float shallow = 1.0 - smoothstep(0.0, 2.8, d);
        vec3 col = mix(uDeep, uShallow, shallow);
        vec2 gp = p * 0.5; vec2 f = abs(fract(gp + 0.5) - 0.5); vec2 fw = fwidth(gp) * 1.2;
        float line = 1.0 - min(smoothstep(0.0, fw.x, f.x), smoothstep(0.0, fw.y, f.y));
        col = mix(col, uGrid, line * 0.85 * (1.0 - shallow));
        vec2 cp = p / 4.0 + vec2(uTime * 0.02, 0.0); vec2 id = floor(cp); vec2 fc = fract(cp) - 0.5;
        float h = hash(id); vec2 o = vec2(h - 0.5, fract(h * 7.31) - 0.5) * 0.5;
        vec2 e = fc - o; e = vec2(e.x + e.y, e.y - e.x) * vec2(1.0, 4.0);
        float spark = smoothstep(0.1, 0.06, length(e)) * step(0.5, h) * (0.55 + 0.45 * sin(uTime * 0.9 + h * 30.0));
        col = mix(col, vec3(1.0), spark * 0.35 * (1.0 - shallow));
        float w1 = 0.12 + 0.06 * sin(uTime * 1.3 + p.x * 0.8 + p.y * 0.6);
        float foam = smoothstep(w1 + 0.12, w1, d) * smoothstep(-0.3, -0.05, d);
        float d2 = d - (0.75 + 0.16 * sin(uTime * 0.9 + p.x * 0.5 - p.y * 0.4));
        float foam2 = (1.0 - smoothstep(0.0, 0.08, abs(d2))) * 0.55;
        col = mix(col, vec3(1.0), clamp(foam * 0.92 + foam2, 0.0, 1.0));
        float a = mix(1.0, 0.68, shallow); a = max(a, foam * 0.92);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.y = SEA_Y; scene.add(sea);
}
// 墊高的台地（尋寶公園、花園、公園、燈塔岬）：草地＋土壁
function terrace(x, z, hx, hz, y, color = P.grass, wall = P.dirt) {
  const g = new THREE.Group(); scene.add(g); statics.push(g);
  g.add(slab({ hx, hz, r: 0.45, top: y, depth: 0.1, color, bevelT: 0.04, bevelS: 0.04, x, z }));
  const w = slab({ hx: hx - 0.03, hz: hz - 0.03, r: 0.42, top: y - 0.08, depth: y - 0.06, color: wall, x, z }); w.castShadow = true; g.add(w);
  terraces.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y });
  mergeStatic(g); return g;
}

// =========================================================
// 道路：井字路（延伸到海邊）＋中央圓環；路網圖（寵物、車子照著走）
// =========================================================
const graph = { nodes: new Map(), edges: [] };
const nkey = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
function node(x, z) { const k = nkey(x, z); if (!graph.nodes.has(k)) graph.nodes.set(k, { k, x, z, edges: [] }); return graph.nodes.get(k); }
function edge(a, b, pts, spur = false) {
  pts = pts || [new THREE.Vector2(a.x, a.z), new THREE.Vector2(b.x, b.z)];
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const e = { a, b, pts, cum, len: cum[cum.length - 1], spur }; a.edges.push(e); b.edges.push(e); graph.edges.push(e); return e;
}
function roadEnds(x0, z0, dx, dz) {                    // 從 (x0,z0) 沿方向走到主台地邊緣前 0.7
  let t = 0; while (t < 16 && inside(mainPoly, x0 + dx * t, z0 + dz * t, 0.7)) t += 0.1; return t;
}
function buildRoads() {
  const g = new THREE.Group(); scene.add(g); statics.push(g);
  const laneM = mat("#8f93a3"), walkM = mat("#e6e2ee"), lines = [], gapR = RW / 2 + SW;   // 參考圖：深一階的車道、淺色人行道
  for (const r of ROADS) for (const vert of [true, false]) {
    const [dx, dz] = vert ? [0, 1] : [1, 0], bx = vert ? r : 0, bz = vert ? 0 : r;
    const t1 = roadEnds(bx, bz, dx, dz), t0 = -roadEnds(bx, bz, -dx, -dz);
    lines.push({ r, vert, t0, t1 });
    const seg = (u0, u1, off, w, h, m) => { const len = u1 - u0, c = (u0 + u1) / 2; mesh(box(vert ? w : len, h, vert ? len : w), m, { x: vert ? r + off : c, y: h / 2, z: vert ? c : r + off, shadow: false, parent: g }); };
    seg(t0, t1, 0, RW, 0.045, laneM);
    const cuts = ROADS.map(c => [c - gapR, c + gapR]); if (r === 0) cuts.push([-(RR + gapR), RR + gapR]);
    let u = t0; const pieces = [];
    for (const [a, b] of cuts.sort((p, q) => p[0] - q[0])) { if (a > u) pieces.push([u, Math.min(a, t1)]); u = Math.max(u, b); }
    if (u < t1) pieces.push([u, t1]);
    for (const [a, b] of pieces) if (b - a > 0.1) for (const sd of [-1, 1]) seg(a, b, sd * (RW / 2 + SW / 2), SW, 0.075, walkM);
  }
  for (const a of ROADS) for (const b of ROADS) {      // 路口四角補人行道
    if (a === 0 && b === 0) continue;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(SW, 0.075, SW), walkM, { x: a + sx * (RW / 2 + SW / 2), y: 0.0375, z: b + sz * (RW / 2 + SW / 2), shadow: false, parent: g });
  }
  // 中央圓環：車道＋外圈人行道（四個路口留缺口）＋中間草地島（噴水池在第二段放）
  const ring = new THREE.RingGeometry(RR - RW / 2, RR + RW / 2, 48); ring.rotateX(-Math.PI / 2); mesh(ring, laneM, { y: 0.046, shadow: false, parent: g });
  const gapA = Math.asin((RW / 2) / (RR + RW / 2)) + 0.02;
  for (let k = 0; k < 4; k++) { const a0 = k * Math.PI / 2 + gapA, rg = new THREE.RingGeometry(RR + RW / 2, RR + RW / 2 + SW, 16, 1, a0, Math.PI / 2 - gapA * 2); rg.rotateX(-Math.PI / 2); mesh(rg, walkM, { y: 0.076, shadow: false, parent: g }); }
  const curb = new THREE.CylinderGeometry(RR - RW / 2, RR - RW / 2 + 0.05, 0.1, 40); mesh(curb, mat("#c9c4d4"), { y: 0.05, shadow: false, parent: g });
  const isl = new THREE.CircleGeometry(RR - RW / 2 - 0.02, 40); isl.rotateX(-Math.PI / 2); mesh(isl, mat(P.grass), { y: 0.102, shadow: false, parent: g });
  mergeStatic(g);
  // 路面標線：黃色中線虛線（路口、圓環不畫）＋斑馬線（每個路口只畫靠島中間的兩邊）
  const marks = [], zebra = [];
  for (const L of lines) for (let u = L.t0 + 0.4; u < L.t1 - 0.3; u += 0.62) {
    if (ROADS.some(c => Math.abs(u + 0.15 - c) < RW * 0.85) || (L.r === 0 && Math.abs(u) < RR + RW)) continue;
    marks.push(L.vert ? [L.r, u + 0.15, 0] : [u + 0.15, L.r, 1]);
  }
  for (const a of ROADS) for (const b of ROADS) {
    if (a === 0 && b === 0) continue;
    const dirs = []; if (a) dirs.push([-Math.sign(a), 0]); if (b) dirs.push([0, -Math.sign(b)]);
    for (const [dx, dz] of dirs) for (let k = -2; k <= 2; k++) {
      const off = RW * 0.5 + 0.28, px = a + dx * off + (dz ? k * 0.22 : 0), pz = b + dz * off + (dx ? k * 0.22 : 0);
      zebra.push([px, pz, dx ? 1 : 0]);
    }
  }
  const inst = (list, w, d, color, y) => { const im = new THREE.InstancedMesh(box(w, 0.01, d), mat(color), list.length); list.forEach(([x, z, r], k) => { _m4.compose(_v.set(x, y, z), _q.setFromAxisAngle(_s.set(0, 1, 0), r ? Math.PI / 2 : 0), _s.set(1, 1, 1)); im.setMatrixAt(k, _m4); }); im.receiveShadow = true; scene.add(im); };
  inst(marks, 0.07, 0.3, "#f3c94f", 0.05); inst(zebra, 0.11, 0.5, "#f4f2f8", 0.05);
  // 路網：每條路上，路口、街區中點、路端都是節點；中央改成圓環
  for (const L of lines) {
    const us = [L.t0, L.t1, ...ROADS, ...[0, 1, 2, 3].map(BC)].filter(u => u >= L.t0 && u <= L.t1).sort((a, b) => a - b);
    const uniq = us.filter((u, i) => i === 0 || u - us[i - 1] > 0.3);
    let pts = uniq.map(u => L.vert ? [L.r, u] : [u, L.r]);
    if (L.r === 0) pts = pts.filter(([x, z]) => Math.hypot(x, z) > RR + 0.01);
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      if (L.r === 0 && (L.vert ? z0 * z1 : x0 * x1) < 0) {   // 穿過圓環：兩邊各接到圓環上的點
        const ra = L.vert ? [0, Math.sign(z0) * RR] : [Math.sign(x0) * RR, 0], rb = L.vert ? [0, Math.sign(z1) * RR] : [Math.sign(x1) * RR, 0];
        edge(node(x0, z0), node(...ra)); edge(node(...rb), node(x1, z1));
        continue;
      }
      edge(node(x0, z0), node(x1, z1));
    }
  }
  const RN = [[RR, 0], [0, RR], [-RR, 0], [0, -RR]].map(([x, z]) => node(x, z));
  for (let i = 0; i < 4; i++) {                        // 圓環四段弧
    const a0 = i * Math.PI / 2, pts = [];
    for (let k = 0; k <= 6; k++) { const a = a0 + k / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * RR, Math.sin(a) * RR)); }
    edge(RN[i], RN[(i + 1) % 4], pts);
  }
  // 每棟建築、每個景點都有一條小路接到門口（門口在人行道內側一點）
  for (const d of [...MAIN_DEFS, ...SPOTS]) {          // 彩虹島的建築：buildRainbow 自己接
    const n = graph.nodes.get(nkey(d.x + d.door[0] * PITCH / 2, d.z + d.door[1] * PITCH / 2));
    if (!n) continue;
    const door = node(n.x - d.door[0] * (RW / 2 + SW + 0.2), n.z - d.door[1] * (RW / 2 + SW + 0.2)); door.door = d;
    edge(n, door, null, true);
    vm(box(d.door[0] ? 0.4 : 0.7, 0.03, d.door[0] ? 0.7 : 0.4), "#d9d3ca", { x: door.x, y: groundY(door.x, door.z) + 0.03, z: door.z, shadow: false, parent: g });
    if (d.id === "park") parkDoor = door;
  }
  graph.lines = lines;
  // 人行道上的路燈位置（等距、兩邊輪流；路口、門口讓開）：路燈第二段才放，行道樹第一段就要避開
  graph.lamps = [];
  for (const L of graph.lines) { let side = 1;
    for (let u = L.t0 + 0.7; u < L.t1 - 0.4; u += 2.4) {
      side = -side;
      if (ROADS.some(c => Math.abs(u - c) < gapR + 0.25) || (L.r === 0 && Math.abs(u) < RR + gapR + 0.25)) continue;
      const off = side * (RW / 2 + SW / 2), x = L.vert ? L.r + off : u, z = L.vert ? u : L.r + off;
      if ([...graph.nodes.values()].some(n => n.door && Math.hypot(x - n.x, z - n.z) < 0.9)) continue;
      graph.lamps.push([x, z]);
    }
  }
}

// =========================================================
// 街景：路燈、長椅、垃圾桶、消防栓、旗子、花台、停著的小車
// =========================================================
// 下面這幾個小物都用世界座標給位置（自動換成 parent 的區域座標、自動貼地）
function toLocal(p, x, z) { p.updateWorldMatrix(true, false); _v.setFromMatrixPosition(p.matrixWorld); return [x - _v.x, z - _v.z]; }
function trashCan(p, wx, wz) { const y = groundY(wx, wz) + 0.075, [x, z] = toLocal(p, wx, wz); vm(cyl(0.13, 0.11, 0.32, 10), "#3f7fd0", { x, y: y + 0.16, z, parent: p, shadow: false }); vm(cyl(0.145, 0.145, 0.05, 10), "#2f5f9f", { x, y: y + 0.34, z, parent: p, shadow: false }); blob(wx, wz, 0.45, y); }   // 放在人行道上（高 0.075）
function hydrant(p, wx, wz) { const y = groundY(wx, wz) + 0.075, [x, z] = toLocal(p, wx, wz); vm(cyl(0.07, 0.08, 0.26, 8), "#e2453c", { x, y: y + 0.13, z, parent: p, shadow: false }); vm(new THREE.SphereGeometry(0.075, 8, 6), "#e2453c", { x, y: y + 0.27, z, parent: p, shadow: false }); vm(cyl(0.03, 0.03, 0.2, 6), "#c93a32", { x, y: y + 0.18, z, rz: Math.PI / 2, parent: p, shadow: false }); blob(wx, wz, 0.3, y); }
function flag(p, wx, wz, color) { const y = groundY(wx, wz), [x, z] = toLocal(p, wx, wz); vm(cyl(0.025, 0.03, 1.5, 6), "#e8e6e1", { x, y: y + 0.75, z, parent: p }); const f = vm(box(0.02, 0.32, 0.48), color, { x, y: y + 1.32, z: z + 0.25, parent: p, shadow: false }); vm(box(0.021, 0.08, 0.48), "#ffffff", { x, y: y + 1.32, z: z + 0.25, parent: p, shadow: false }); void f; blob(wx, wz, 0.3); }
function planter(p, wx, wz, len = 0.9, ry = 0) {
  const y = groundY(wx, wz), [x, z] = toLocal(p, wx, wz), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  vm(box(len, 0.24, 0.32), P.wood, { y: 0.12, parent: g });
  for (let k = 0; k < Math.max(2, Math.round(len / 0.3)); k++) vm(new THREE.IcosahedronGeometry(0.15, 0), k % 3 ? "#6cb455" : "#5fa346", { x: -len / 2 + 0.15 + k * (len - 0.3) / Math.max(1, Math.round(len / 0.3) - 1), y: 0.3, parent: g });
  for (let k = 0; k < 3; k++) vm(new THREE.IcosahedronGeometry(0.05, 0), ["#ff8fb1", "#ffd75e", "#ffffff"][k], { x: -len / 3 + k * len / 3, y: 0.42, z: 0.06, parent: g, shadow: false });
  blob(wx, wz, len * 0.8);
}
function parkedCar(p, wx, wz, ry, c) { const [x, z] = toLocal(p, wx, wz); mesh(carGeo(CAR_COLORS[c % CAR_COLORS.length]), vcMat, { x, y: groundY(wx, wz), z, ry, parent: p, shadow: false }); blob(wx, wz, 1.4); }
// 程式生成的小車（方塊玩具車，頂點色＝合併後一個 draw call）
const CAR_COLORS = ["#ff6f7d", "#5fb4ff", "#ffd166", "#7fd77a", "#c79bff", "#ff9b54"];
function carGeo(color) {
  const parts = [paint(rbox(0.7, 0.32, 1.25, 0.08).translate(0, 0.3, 0), color), paint(rbox(0.6, 0.28, 0.7, 0.07).translate(0, 0.56, -0.05), "#ffffff"),
    paint(box(0.62, 0.2, 0.55).toNonIndexed().translate(0, 0.57, -0.05), "#6f8fb5")];
  for (const [x, z] of [[0.33, 0.38], [-0.33, 0.38], [0.33, -0.4], [-0.33, -0.4]]) { const w = cyl(0.13, 0.13, 0.1, 10).toNonIndexed(); w.rotateZ(Math.PI / 2); w.translate(x, 0.14, z); parts.push(paint(w, "#3a3f4a")); }
  parts.push(paint(box(0.12, 0.06, 0.03).toNonIndexed().translate(0.22, 0.34, 0.63), "#fff3b0"), paint(box(0.12, 0.06, 0.03).toNonIndexed().translate(-0.22, 0.34, 0.63), "#fff3b0"));
  return mergeGeometries(parts);
}
function buildStreet() {
  const g = new THREE.Group(); scene.add(g); statics.push(g);
  const off = RW / 2 + SW / 2; let k = 0;
  for (const a of ROADS) for (const b of ROADS) {      // 路口人行道角：垃圾桶／消防栓輪流
    if (a === 0 && b === 0) continue;
    const [sx, sz] = [[1, 1], [-1, 1], [1, -1], [-1, -1]][k % 4];
    if (k % 2) trashCan(g, a + sx * off, b + sz * off); else hydrant(g, a + sx * off, b + sz * off);
    k++;
  }
  mergeStatic(g);
}
// 第二段（要下載的）：路燈、長椅
async function buildStreetKenney() {
  const g = new THREE.Group(); scene.add(g); statics.push(g); const jobs = [];
  const LAMP = [[1, 2, "#3e7d68"], [7, 3, "#356b59"], [2, 2, "#fff0b3"]];
  for (const [x, z] of graph.lamps) { jobs.push(kenney("fantasy-town-kit", "lantern", { scale: 0.62, x, z, y: 0.075, tints: LAMP, parent: g })); blob(x, z, 0.4, 0.075); }
  await Promise.all(jobs);
  mergeStatic(g);
}

// =========================================================
// 遊戲建築
// =========================================================
let fenceMat, postMat;
// 第一段：每棟先放空的群組＋點擊判定盒＋施工圍籬（模型還沒到也點得到）
function startDef(d) {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z); root.userData.def = d; scene.add(root);
  const pivot = new THREE.Group(); root.add(pivot);
  d.root = root; d.pivot = pivot; d.lockDeco = new THREE.Group(); d.lockDeco.visible = false; root.add(d.lockDeco);
  const [b, a, body] = LAYOUT[d.mode];
  d.box = new THREE.Box3(new THREE.Vector3(b[0], b[2], b[4]), new THREE.Vector3(b[1], b[3], b[5])).translate(root.position);
  d.anchor = new THREE.Vector3(...a).add(root.position);
  d.body = new THREE.Vector3(...body);
  const hit = new THREE.Mesh(box(b[1] - b[0] + 0.2, b[3] - b[2] + 0.2, b[5] - b[4] + 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2); hit.userData.def = d; root.add(hit); hitBoxes.push(hit); d.hit = hit;
  exRects.push([d.x + d.ex[0], d.x + d.ex[1], d.z + d.ex[2], d.z + d.ex[3]]);
  blob(d.x + (b[0] + b[1]) / 2, d.z + (b[4] + b[5]) / 2, Math.min(3.2, Math.max(b[1] - b[0], b[5] - b[4]) * 1.05), groundY(d.x, d.z));
  if (d.free) return;
  // 施工中：門口小路經過人行道的那一段擋一道路障（橘白斜條紋板＋柱腳），兩邊的三角錐 buildDef 第二段放。
  // 只擋門口：路燈、行道樹都讓開門口 0.9，不會穿模（10-11 阿葉：舊版圍籬沿人行道圍一圈，跟路燈、樹、樓梯打架＝破圖）
  const g = d.lockDeco, [dx, dz] = d.door, dist = d.lockDist ?? PITCH / 2 - RW / 2 - SW / 2 + 0.05;   // 人行道中線再靠馬路一點（區域座標；讓開建築門口的招牌、花台）
  const bx = dx * dist, bz = dz * dist, y = groundY(d.x + bx, d.z + bz) + 0.075, w = 0.8;
  d.lockSpot = { x: bx, y, z: bz, ax: dx ? 0 : 1, az: dx ? 1 : 0 };   // ax/az＝沿人行道的方向（路障橫擋、三角錐排兩邊）
  const geo = box(w, 0.2, 0.05), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * w / 1.1);
  const bg = new THREE.Group(); bg.position.set(bx, y, bz); bg.rotation.y = dx ? Math.PI / 2 : 0; g.add(bg);
  mesh(geo, fenceMat, { y: 0.42, parent: bg }); mesh(geo, fenceMat, { y: 0.16, parent: bg });
  for (const s of [-1, 1]) { mesh(box(0.07, 0.6, 0.07), postMat, { x: s * (w / 2 - 0.06), y: 0.3, parent: bg }); mesh(box(0.09, 0.04, 0.3), postMat, { x: s * (w / 2 - 0.06), y: 0.02, parent: bg }); }
  g.traverse(o => { if (o.isMesh) o.userData.keepColor = true; });
  mergeStatic(g);
}
// 第二段：模型到了 → 蓋好 → 合併不動的 mesh → 套灰階 → 「長出來」
async function buildDef(d, builder, delay) {
  const p = d.pivot;
  const a = await builder(d, p);
  scene.updateMatrixWorld(true); d.anchorBox = new THREE.Box3().setFromObject(a); d.sigBox = d.sig ? new THREE.Box3().setFromObject(d.sig) : null;   // 給 __hub3d.measure() 用（合併前量）
  if (!d.free) {
    const L = d.lockSpot, clear = (x, z) => ![...treeXZ, ...graph.lamps].some(([tx, tz]) => Math.hypot(d.x + x - tx, d.z + z - tz) < 0.45);   // 太靠近行道樹／路燈的那一邊就不放
    await Promise.all([-1, 1].map(s => [L.x + s * L.ax * 0.56, L.z + s * L.az * 0.56]).filter(([x, z]) => clear(x, z))
      .map(([x, z]) => kenney("car-kit", "cone", { scale: 0.75, x, y: L.y, z, parent: d.lockDeco, shadow: false })));
    d.lockDeco.traverse(o => { if (o.isMesh) o.userData.keepColor = true; });
    mergeStatic(d.lockDeco);
  }
  noDynShadow(p); mergeStatic(p);
  if (d.locked) setGray(p, true);
  d.ready = true; shadowDirty = true;
  popIn(p, delay);
}
function noDynShadow(root) { root.traverse(o => { if (o.userData.dyn) o.traverse(m => { if (m.isMesh) m.castShadow = false; }); }); }
function popIn(obj, delay = 0) {
  if (!(shown && running)) return;                   // 選單開著才播「長出來」，不然直接出現
  obj.scale.setScalar(0.001); const t0 = performance.now() + delay;
  anims.add({ update(now) { const u = Math.max(0, Math.min(1, (now - t0) / 480)); obj.scale.setScalar(Math.max(0.001, easeOutBack(u))); if (u >= 1) shadowDirty = true; return u < 1; } });
}
// 屋頂／牆面小細節（參考 Tack Lin：冷氣、太陽能板、招牌、燈串、木平台）
function acUnit(p, x, y, z, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g); vm(rbox(0.34, 0.24, 0.28, 0.03), "#d7dbe0", { y: 0.12, parent: g }); vm(cyl(0.09, 0.09, 0.02, 12), "#6f7782", { y: 0.25, parent: g, shadow: false }); }
function solar(p, x, y, z, ry = 0) { const s = mesh(box(0.7, 0.04, 0.46), solarMat(), { x, y: y + 0.16, z, ry, rx: -0.35, parent: p }); vm(box(0.04, 0.16, 0.04), "#9aa2ad", { x, y: y + 0.08, z: z + 0.12, parent: p, shadow: false }); return s; }
function sign(p, icon, bg, x, y, z, ry) { const m = mesh(new THREE.CircleGeometry(0.26, 24), signMat(icon, bg), { x, y, z, ry, parent: p, shadow: false }); return m; }
function stringLights(p, pts, y) {                    // 一串小燈泡（自己發亮）
  const bulbs = ["#fff3a0", "#ffd0e0", "#c8f0ff", "#fff3a0"];
  for (let i = 1; i < pts.length; i++) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    for (let k = 0; k < 5; k++) { const u = (k + 0.5) / 5, sag = Math.sin(u * Math.PI) * 0.08; vm(new THREE.SphereGeometry(0.035, 6, 4), bulbs[k % 4], { x: x0 + (x1 - x0) * u, y: y - sag, z: z0 + (z1 - z0) * u, parent: p, shadow: false, glow: true }); } }
}
function deck(p, x0, x1, z0, z1, y) {
  const t = mesh(box(x1 - x0, 0.03, z1 - z0), deckMat(), { x: (x0 + x1) / 2, y: y + 0.015, z: (z0 + z1) / 2, parent: p, shadow: false });
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) vm(box(0.05, 0.36, 0.05), "#3d4652", { x, y: y + 0.18, z, parent: p, shadow: false });
  stringLights(p, [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]], y + 0.34);
  return t;
}

// ----- 釣魚：碼頭＋漁船＋小划船＋魚餌小攤 -----
async function buildFish(d, p) {
  const coast = 9.6 - d.z;                             // 草地邊（區域座標）
  const DS = 0.68, DECK = -0.2;
  const [, , boat, row] = await Promise.all([
    kenney("pirate-kit", "structure-platform-dock", { parent: p, scale: DS, x: 0, z: coast + 0.42, y: DECK - 1.31 * DS }),
    kenney("pirate-kit", "structure-platform-dock", { parent: p, scale: DS, x: 0, z: coast + 0.42 + 1.7, y: DECK - 1.31 * DS }),
    kenney("watercraft-pack", "boat-fishing-small", { parent: p, scale: 0.52, x: 1.45, z: coast + 1.9, y: SEA_Y - 0.08, ry: 0.08, shadow: false }),
    kenney("pirate-kit", "boat-row-small", { parent: p, scale: 0.36, x: -1.35, z: coast + 1.55, y: SEA_Y - 0.1, ry: 0.5, shadow: false }),
    kenney("pirate-kit", "barrel", { parent: p, scale: 0.2, x: -0.5, z: coast + 0.15, y: DECK }),
    kenney("pirate-kit", "barrel", { parent: p, scale: 0.17, x: -0.48, z: coast + 0.48, y: DECK }),
    kenney("pirate-kit", "crate", { parent: p, scale: 0.3, x: 0.45, z: coast + 0.25, y: DECK, ry: 0.3 }),
  ]);
  boat.userData.dyn = row.userData.dyn = true;
  tickers.push(t => { boat.position.y = SEA_Y - 0.08 + Math.sin(t * 1.4) * 0.03; boat.rotation.z = Math.sin(t * 1.1) * 0.035; row.position.y = SEA_Y - 0.1 + Math.sin(t * 1.7 + 1) * 0.03; row.rotation.x = Math.sin(t * 1.3) * 0.04; });
  const endZ = coast + 0.42 + 2.5;
  const rod = mesh(cyl(0.016, 0.026, 1.4, 6), mat("#8a5a3c"), { x: 0.35, y: DECK + 0.5, z: endZ, parent: p }); rod.rotation.x = 0.95;
  const bob = mesh(new THREE.SphereGeometry(0.07, 12, 8), mat("#ff5d6c"), { x: 0.35, y: SEA_Y + 0.03, z: endZ + 1.25, shadow: false, dyn: true, parent: p });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.35, DECK + 1.08, endZ + 0.55), bob.position.clone()]);
  p.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: "#ffffff" })));
  tickers.push(t => { bob.position.y = SEA_Y + 0.03 + Math.sin(t * 2.6) * 0.035; lineGeo.attributes.position.setY(1, bob.position.y); lineGeo.attributes.position.needsUpdate = true; });
  // 魚招牌＋魚餌小攤
  const s = new THREE.Group(); s.position.set(-0.9, 0, coast - 0.55); s.rotation.y = Math.PI / 4; p.add(s);
  vm(cyl(0.05, 0.06, 0.95, 6), P.wood, { y: 0.47, parent: s });
  const fish = vm(new THREE.SphereGeometry(0.3, 14, 10), "#ff9b54", { y: 1.05, parent: s }); fish.scale.set(1.25, 0.75, 0.4);
  vm(new THREE.ConeGeometry(0.2, 0.3, 3), "#ff9b54", { x: -0.45, y: 1.05, rz: Math.PI / 2, parent: s });
  vm(new THREE.SphereGeometry(0.05, 8, 6), "#ffffff", { x: 0.2, y: 1.11, z: 0.11, shadow: false, parent: s });
  vm(new THREE.SphereGeometry(0.028, 8, 6), "#24324a", { x: 0.22, y: 1.11, z: 0.15, shadow: false, parent: s });
  const k = new THREE.Group(); k.position.set(0.95, 0, coast - 1.25); p.add(k);
  vm(rbox(0.9, 0.7, 0.7, 0.05), "#6fb2ee", { y: 0.35, parent: k });
  vm(box(0.92, 0.06, 0.72), "#ffffff", { y: 0.72, parent: k });
  const aw = mesh(box(0.95, 0.04, 0.4), new THREE.MeshLambertMaterial({ map: stripeTex("#ffffff", "#3f7fd0", 6) }), { y: 0.62, z: 0.48, rx: 0.4, parent: k });
  void aw; vm(box(0.7, 0.04, 0.14), P.wood, { y: 0.42, z: 0.4, parent: k });
  sign(k, "🐟", "#ffd166", 0.46, 0.5, 0, Math.PI / 2);
  return boat;
}
// ----- 點餐：紫色小餐館＋粉紅條紋棚＋屋頂大漢堡＋木平台燈串 -----
async function buildOrder(d, p) {
  const X = -0.2;
  const [shop, burger] = await Promise.all([
    kenney("city-kit-commercial", "building-c", { parent: p, scale: 2.2, x: X, ry: Math.PI / 2, tints: [[3, 2, P.purple], [0, 2, P.cream], [1, 2, P.purpleDk], [1, 3, P.eave]] }),
    kenney("food-kit", "burger", { parent: p, scale: 3.0, x: X, y: 2.0, shadow: false }),
    kenney("city-kit-commercial", "detail-parasol-a", { parent: p, scale: 2.2, x: 1.38, z: -0.75, tints: [[0, 1, "#ffd36b"]] }),
    kenney("city-kit-commercial", "detail-parasol-b", { parent: p, scale: 2.2, x: 1.38, z: 0.8, tints: [[0, 1, P.pink]] }),
  ]);
  const hb = new THREE.Box3().setFromObject(shop), roof = hb.max.y, fx = hb.max.x - d.x;
  const aw = stripeTex("#ffffff", P.pink, 6); aw.repeat.set(2, 1);
  mesh(box(0.5, 0.04, 2.1), new THREE.MeshLambertMaterial({ map: aw }), { x: fx + 0.18, y: 0.9, rz: -0.38, parent: p });
  vm(box(0.03, 0.14, 2.1), P.pink, { x: fx + 0.41, y: 0.79, parent: p });
  sign(p, "🍔", "#ff8fa3", fx + 0.02, 1.55, 0.55, Math.PI / 2);
  sign(p, "⭐", "#5e4aa8", X + 0.2, 1.55, hb.max.z - d.z + 0.02, 0);
  deck(p, X - 0.85, X + 0.85, -0.7, 0.7, roof - 0.08);
  acUnit(p, X - 0.55, roof - 0.06, -0.85); acUnit(p, X + 0.6, roof - 0.06, -0.85);
  burger.userData.dyn = true;
  tickers.push(t => { burger.rotation.y = t * 0.6; burger.position.y = roof + 0.02 + Math.sin(t * 2) * 0.04; });
  planter(p, d.x + 1.0, d.z + 1.55, 0.8);
  d.sig = burger;                                       // 屋頂大漢堡是招牌：浮標放在漢堡上面，不要蓋住它
  return shop;
}
// ----- 積木：注音字母積木疊成的小屋 -----
function letterTex(ch, bg) {
  return canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = "#ffffff"; rr(g, 14, 14, 100, 100, 18); g.fill();
    g.fillStyle = bg; g.font = `bold 84px ${HAN_FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ch, 64, 70); });
}
async function buildBuild(d, p) {
  const S = 0.76, G = 0.04, cube = new RoundedBoxGeometry(S, S, S, 3, 0.09);
  const house = new THREE.Group(); p.add(house); house.position.set(-0.3, 0, 0);
  const blocks = [["ㄅ", "#ff7a7a", 0, -1], ["ㄆ", "#ffc233", 0, 0], ["ㄇ", "#4fb0ff", 0, 1], ["ㄈ", "#7ccf6b", 1, -0.5], ["ㄉ", "#b48cf0", 1, 0.5]];
  const decal = new THREE.PlaneGeometry(S * 0.82, S * 0.82);
  for (const [ch, col, row, zi] of blocks) {
    const b = vm(cube.clone(), col, { y: row * (S + G) + S / 2, z: zi * (S + G), parent: house });
    const tm = new THREE.MeshLambertMaterial({ map: letterTex(ch, col), transparent: true });
    const f1 = mesh(decal, tm, { x: S / 2 + 0.006, shadow: false, parent: b }); f1.rotation.y = Math.PI / 2;
    if (zi === 1 || (row === 1 && zi === 0.5)) mesh(decal, tm, { z: S / 2 + 0.006, shadow: false, parent: b });
  }
  const tri = new THREE.Shape(); tri.moveTo(-0.72, 0); tri.lineTo(0.72, 0); tri.lineTo(0, 0.62); tri.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: S * 0.95, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  roofGeo.translate(0, 0, -S * 0.475); roofGeo.rotateY(Math.PI / 2);
  vm(roofGeo, P.autumn, { y: 2 * (S + G), parent: house });
  vm(box(0.12, 0.3, 0.12), "#d95f5f", { x: 0.1, y: 2 * (S + G) + 0.45, z: -0.45, parent: house });   // 煙囪
  const loose = [[rbox(0.42, 0.42, 0.42, 0.06), "#ff7a7a", 0.85, 0.21, 1.05, 0.4], [cyl(0.17, 0.17, 0.5, 14), "#ffc233", 1.05, 0.25, 0.45, 0],
    [rbox(0.36, 0.36, 0.36, 0.05), "#4fb0ff", 0.65, 0.18, -0.95, -0.3], [new THREE.ConeGeometry(0.22, 0.36, 4), "#7ccf6b", 0.65, 0.54, -0.95, 0.5]];
  for (const [g, c, x, y, z, r] of loose) vm(g, c, { x, y, z, ry: r, parent: p });
  planter(p, d.x - 1.35, d.z + 1.45, 0.9);
  return house;
}
// ----- 尋寶：台地上的公園＋打開的寶箱 -----
async function buildHunt(d, p) {
  const Y = 0.55;
  const [, chest, sh] = await Promise.all([
    kenney("pirate-kit", "palm-straight", { parent: p, scale: 0.42, x: -0.75, y: Y, z: -0.6 }),
    kenney("pirate-kit", "chest", { parent: p, scale: 0.55, x: 0.35, y: Y, z: 0.35, ry: Math.PI / 4, tints: [[5, 1, "#ffcf4a"]] }),
    kenney("pirate-kit", "tool-shovel", { parent: p, scale: 0.36, x: 1.15, y: Y - 0.05, z: 0.1, ry: -0.6 }),
  ]);
  sh.rotation.z = 0.25;
  const clip = (chest.userData.clips || []).find(c => c.name === "open");
  if (clip) { const mx = new THREE.AnimationMixer(chest); const a = mx.clipAction(clip); a.clampWhenFinished = true; a.setLoop(THREE.LoopOnce, 1); a.play(); mx.setTime(clip.duration); }
  mesh(box(0.5, 0.06, 0.5), mat("#ffd84a", { emissive: "#ffb800", emissiveIntensity: 0.6 }), { x: 0.35, y: Y + 0.27, z: 0.35, ry: Math.PI / 4, shadow: false, parent: p });
  const sparkMat = new THREE.MeshBasicMaterial({ color: "#fff3a0", toneMapped: false });
  for (let k = 0; k < 4; k++) {
    const s = mesh(new THREE.OctahedronGeometry(0.06, 0), sparkMat, { parent: p, shadow: false, dyn: true }); const ph = k * 1.6;
    tickers.push(t => { const a = t * 1.5 + ph; s.position.set(0.35 + Math.cos(a) * 0.38, Y + 0.6 + Math.sin(t * 2 + ph) * 0.12, 0.35 + Math.sin(a) * 0.38); s.rotation.y = t * 3; s.scale.setScalar(0.7 + 0.35 * Math.sin(t * 4 + ph)); });
  }
  for (const r of [Math.PI / 4, -Math.PI / 4]) vm(box(0.55, 0.02, 0.1), "#ff5b5b", { x: -0.3, y: Y + 0.012, z: 1.05, ry: r, shadow: false, parent: p });
  const sg = new THREE.Group(); sg.position.set(-1.25, Y, 1.2); sg.rotation.y = Math.PI / 4; p.add(sg);   // 木頭告示牌
  vm(box(0.06, 0.6, 0.06), P.wood, { y: 0.3, x: -0.2, parent: sg }); vm(box(0.06, 0.6, 0.06), P.wood, { y: 0.3, x: 0.2, parent: sg });
  vm(box(0.6, 0.32, 0.05), "#d8a46c", { y: 0.55, parent: sg }); sign(sg, "🔍", "#ffe08a", 0, 0.55, 0.03, 0);
  return chest;
}
// ----- 翻牌：奶油色卡牌屋＋屋頂一張大撲克牌（比照漢堡店的大漢堡，慢慢轉）-----
function cardTex(face) {
  return canvasTex(160, 224, (g, w, h) => {
    g.fillStyle = face ? "#ffffff" : "#ff7aa2"; rr(g, 4, 4, w - 8, h - 8, 22); g.fill();
    g.lineWidth = 8; g.strokeStyle = face ? "#f6c445" : "#ffffff"; rr(g, 14, 14, w - 28, h - 28, 16); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    if (face) { g.font = `96px ${EMOJI_FONT}`; g.fillText("🐶", w / 2, h / 2 + 6); }
    else { g.fillStyle = "#ffe066"; g.font = `bold 90px ${EMOJI_FONT}`; g.fillText("★", w / 2, h / 2 + 4); }
  });
}
let cardMats;
function makeCard(scale = 1) {
  cardMats = cardMats || [new THREE.MeshLambertMaterial({ map: cardTex(true) }), new THREE.MeshLambertMaterial({ map: cardTex(false) })];
  const c = new THREE.Group();
  vm(rbox(0.8, 1.12, 0.05, 0.02), "#ffffff", { parent: c, shadow: false });
  const plane = new THREE.PlaneGeometry(0.78, 1.1);
  mesh(plane, cardMats[0], { z: 0.027, shadow: false, parent: c });
  mesh(plane, cardMats[1], { z: -0.027, ry: Math.PI, shadow: false, parent: c });
  c.scale.setScalar(scale); return c;
}
async function buildMatch(d, p) {
  const house = await kenney("city-kit-commercial", "building-d", { parent: p, scale: 1.6, z: -0.15, tints: [[0, 2, P.cream], [3, 2, "#e4d5b7"], [1, 2, P.eave], [1, 3, P.eave]] });
  const hb = new THREE.Box3().setFromObject(house), roofY = hb.max.y, front = hb.max.z - d.z, side = hb.max.x - d.x;
  const big = makeCard(1.15); big.userData.dyn = true; p.add(big);
  const cy = roofY + 0.05 + 0.56 * 1.15; big.position.set(0, cy, -0.15);
  tickers.push(t => { big.rotation.y = Math.PI / 4 + t * 0.6; big.position.set(0, cy + Math.sin(t * 2) * 0.04, -0.15); });
  const aw = mesh(box(hb.max.x - hb.min.x - 0.1, 0.04, 0.48), new THREE.MeshLambertMaterial({ map: stripeTex("#ffffff", P.eave, 7) }), { y: 0.78, z: front + 0.2, rx: 0.4, parent: p }); void aw;
  vm(box(hb.max.x - hb.min.x - 0.1, 0.12, 0.03), P.eave, { y: 0.64, z: front + 0.42, parent: p });
  for (const x of [-0.4, 0.4]) { vm(box(0.38, 0.1, 0.14), P.wood, { x, y: 1.18, z: front + 0.06, parent: p }); for (const dx of [-0.11, 0, 0.11]) vm(new THREE.IcosahedronGeometry(0.07, 0), dx ? "#ff8fb1" : "#ffd75e", { x: x + dx, y: 1.27, z: front + 0.07, shadow: false, parent: p }); }
  sign(p, "🃏", "#2f6b50", side + 0.02, 1.5, -0.15, Math.PI / 2);
  solar(p, -0.42, roofY - 0.02, -0.6); acUnit(p, 0.45, roofY - 0.02, 0.35);
  for (const [x, r] of [[-0.55, 0.12], [0.55, -0.12]]) { const c = makeCard(0.62); c.position.set(x, 0.36, 1.35); c.rotation.set(-0.12, r, 0); p.add(c); }
  return big;
}
// ----- 氣球店：粉紅小店＋條紋遮雨棚＋招牌＋屋頂一大串氣球＋門口花台 -----
function balloonCluster(parent, x, y, z, scale = 1) {
  const BCOL = ["#ff6f86", "#ffd166", "#5fb4ff", "#7fd77a", "#c79bff", "#ff9fd0", "#ff8a3d"];
  const bGeo = new THREE.SphereGeometry(0.24, 14, 10); bGeo.scale(1, 1.18, 1);
  const knot = new THREE.ConeGeometry(0.05, 0.08, 6);
  const cluster = new THREE.Group(); cluster.position.set(x, y, z); cluster.scale.setScalar(scale); cluster.userData.dyn = true; parent.add(cluster);
  const pts = [], balls = new THREE.Group(); cluster.add(balls);
  BCOL.forEach((c, k) => {
    const a = k / BCOL.length * Math.PI * 2, ring = k === 0 ? 0 : 0.36;
    const pos = new THREE.Vector3(Math.cos(a) * ring, 1.0 + (k % 3) * 0.2 + (k === 0 ? 0.35 : 0), Math.sin(a) * ring);
    vm(bGeo.clone(), c, { x: pos.x, y: pos.y, z: pos.z, parent: balls, shadow: false });
    vm(knot.clone(), c, { x: pos.x, y: pos.y - 0.3, z: pos.z, rx: Math.PI, parent: balls, shadow: false });
    pts.push(new THREE.Vector3(0, 0, 0), pos.clone().add(new THREE.Vector3(0, -0.32, 0)));
  });
  mergeStatic(balls);
  cluster.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#ffffff" })));
  const ph = x * 3; tickers.push(t => { cluster.rotation.z = Math.sin(t * 1.3 + ph) * 0.06; cluster.rotation.x = Math.sin(t * 0.9 + 1 + ph) * 0.05; });
  return cluster;
}
async function buildTone(d, p) {
  const X = 0.35, Z = -0.25;
  const shop = await kenney("city-kit-commercial", "building-c", { parent: p, scale: 1.9, x: X, z: Z, tints: [[3, 2, "#f7a8c0"], [0, 2, "#fff4f7"], [1, 2, "#d9628a"], [1, 3, "#c94f7a"]] });
  const hb = new THREE.Box3().setFromObject(shop), roof = hb.max.y, front = hb.max.z - d.z, side = hb.max.x - d.x, w = hb.max.x - hb.min.x;
  const aw = stripeTex("#ffffff", P.pink, 7);
  mesh(box(w - 0.1, 0.04, 0.46), new THREE.MeshLambertMaterial({ map: aw }), { x: X, y: 0.8, z: front + 0.2, rx: 0.4, parent: p });
  vm(box(w - 0.1, 0.12, 0.03), P.pink, { x: X, y: 0.66, z: front + 0.41, parent: p });
  sign(p, "🎈", "#ff8fa3", side + 0.02, 1.45, Z, Math.PI / 2);
  sign(p, "⭐", "#c94f7a", X - 0.35, 1.45, front + 0.02, 0);
  balloonCluster(p, X + 0.45, roof - 0.05, Z - 0.45, 0.6);   // 屋頂一小串
  balloonCluster(p, X + 0.95, 0.05, front + 0.45, 1.05);     // 門口一大串（招牌，浮標不會蓋到）
  acUnit(p, X - 0.4, roof - 0.06, Z + 0.45);
  stringLights(p, [[X - w / 2 + 0.05, front + 0.02], [X + w / 2 - 0.05, front + 0.02]], 1.35);
  planter(p, d.x + X - 0.65, d.z + front + 0.35, 0.6);
  const lone = vm(new THREE.SphereGeometry(0.2, 12, 8), "#ff6f86", { parent: p, dyn: true, shadow: false }); lone.scale.set(1, 1.18, 1);
  tickers.push(t => { const ph = (t * 0.12) % 1; lone.position.set(X - 0.6 + Math.sin(t) * 0.15, roof + 0.4 + ph * 2.2, front - 0.2 - ph * 0.6); lone.visible = ph < 0.92; });
  return shop;
}
// ----- 地鼠：紅色穀倉小屋（招牌、門、雨遮）＋前面的菜園、地洞、偶爾探頭的地鼠 -----
async function buildWhack(d, p) {
  const barn = new THREE.Group(); barn.position.set(-1.25, 0, -0.1); p.add(barn);
  vm(rbox(1.05, 1.0, 1.4, 0.04), "#d9534f", { y: 0.5, parent: barn });
  for (const z of [-0.71, 0.71]) vm(box(1.07, 0.06, 0.04), "#ffffff", { y: 1.0, z, parent: barn, shadow: false });
  const tri = new THREE.Shape(); tri.moveTo(-0.62, 0); tri.lineTo(0.62, 0); tri.lineTo(0, 0.55); tri.closePath();
  const rg = new THREE.ExtrudeGeometry(tri, { depth: 1.5, bevelEnabled: false }); rg.translate(0, 0, -0.75);
  vm(rg, "#7a4a3a", { y: 1.0, parent: barn });
  const front = 0.53;                                   // 穀倉正面（+x）
  vm(box(0.03, 0.62, 0.62), "#ffffff", { x: front, y: 0.33, parent: barn, shadow: false });
  vm(box(0.035, 0.56, 0.56), "#a8423f", { x: front + 0.005, y: 0.33, parent: barn, shadow: false });
  for (const r of [0.78, -0.78]) vm(box(0.04, 0.05, 0.76), "#ffffff", { x: front + 0.02, y: 0.33, rx: r, parent: barn, shadow: false });
  vm(box(0.03, 0.22, 0.26), "#ffe9a8", { x: front + 0.01, y: 0.84, parent: barn, shadow: false });   // 閣樓窗
  const aw = stripeTex("#ffffff", "#d9534f", 6);
  mesh(box(0.4, 0.04, 1.0), new THREE.MeshLambertMaterial({ map: aw }), { x: front + 0.16, y: 0.72, rz: -0.4, parent: barn });
  sign(barn, "🔨", "#ffd166", front + 0.03, 1.15, 0, Math.PI / 2);
  vm(box(0.5, 0.42, 0.04), "#c98a55", { x: 0, y: 0.25, z: 0.72, parent: barn, shadow: false });   // 側面工具板
  // 菜園
  const soil = slab({ hx: 0.85, hz: 1.15, r: 0.3, top: 0.07, depth: 0.12, color: "#8a5a3c", x: 0.45, z: 0 }); p.add(soil);
  await Promise.all([
    ...[-0.55, 0.55].map(z => kenney("nature-kit", "crops_dirtRow", { parent: p, scale: 1.1, x: 0.1, y: 0.082, z, shadow: false })),   // 墊高一點：底面跟菜園土面同高會閃（z-fighting）
    ...[["crop_carrot", -0.8], ["crop_turnip", -0.3], ["crop_carrot", 0.3], ["crop_pumpkin", 0.8]].map(([n, z]) => kenney("nature-kit", n, { parent: p, scale: 0.9, x: 0.1, y: 0.08, z })),
  ]);
  const HOLES = [[0.85, -0.75], [0.85, 0.0], [0.85, 0.75]];
  const ringGeo = new THREE.TorusGeometry(0.24, 0.08, 8, 20); ringGeo.rotateX(-Math.PI / 2); ringGeo.scale(1, 0.7, 1);
  const pitGeo = new THREE.CircleGeometry(0.24, 20); pitGeo.rotateX(-Math.PI / 2);
  for (const [x, z] of HOLES) { vm(ringGeo.clone(), "#a06d47", { x, y: 0.09, z, shadow: false, parent: p }); vm(pitGeo.clone(), "#3a2418", { x, y: 0.085, z, shadow: false, parent: p }); }
  const mole = new THREE.Group(); mole.userData.dyn = true; p.add(mole);
  vm(new THREE.SphereGeometry(0.2, 14, 10), "#9b6a45", { y: 0.12, parent: mole, shadow: false }).scale.set(1, 1.15, 1);
  vm(new THREE.SphereGeometry(0.06, 10, 8), "#ff8fa3", { y: 0.18, z: 0.19, shadow: false, parent: mole });
  for (const s of [-1, 1]) { vm(new THREE.SphereGeometry(0.035, 8, 6), "#24324a", { x: s * 0.08, y: 0.27, z: 0.16, shadow: false, parent: mole }); vm(new THREE.SphereGeometry(0.06, 8, 6), "#9b6a45", { x: s * 0.14, y: 0.33, shadow: false, parent: mole }); }
  mergeStatic(mole);
  tickers.push(t => { const c = t % 3.2, hole = Math.floor(t / 3.2) % HOLES.length;
    const up = c < 0.3 ? c / 0.3 : c < 1.6 ? 1 : c < 1.9 ? 1 - (c - 1.6) / 0.3 : 0;
    mole.position.set(HOLES[hole][0], -0.25 + up * 0.32, HOLES[hole][1]); mole.rotation.y = Math.PI / 4 + Math.sin(t * 3) * 0.2 * up; mole.visible = up > 0.01; });
  const mallet = new THREE.Group(); mallet.position.set(-0.55, 0, 1.05); mallet.rotation.set(0, Math.PI / 4, -0.35); p.add(mallet);
  vm(cyl(0.035, 0.035, 0.75, 6), P.wood, { y: 0.37, parent: mallet });
  vm(cyl(0.13, 0.13, 0.36, 12), "#ff5b5b", { y: 0.78, rz: Math.PI / 2, parent: mallet });
  planter(p, d.x - 1.25, d.z + 1.05, 0.6, Math.PI / 2);
  return barn;
}
// ----- 青蛙：小池塘＋荷葉＋會跳的小青蛙 -----
async function buildFrog(d, p0) {
  const p = new THREE.Group(); p.position.set(0.3, 0, 0.3); p0.add(p);
  const sh = new THREE.Shape(); const N = 28;
  const R = a => 1.25 + 0.16 * Math.sin(a * 2 + 0.6) + 0.1 * Math.sin(a * 3 + 2);
  for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2, r = R(a); const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 0.95; if (k) sh.lineTo(x, z); else sh.moveTo(x, z); }
  const rim = new THREE.ShapeGeometry(sh, 2); rim.rotateX(-Math.PI / 2); rim.scale(1.12, 1, 1.12);
  vm(rim, "#cdbf9f", { y: 0.02, shadow: false, parent: p });
  const water = new THREE.ShapeGeometry(sh, 2); water.rotateX(-Math.PI / 2);
  const wm = mesh(water, mat("#59bfd0", { emissive: "#1f6f88", emissiveIntensity: 0.25 }), { y: 0.035, shadow: false, parent: p });
  const PADS = [[-0.55, -0.25, 1], [0.35, 0.35, 1], [0.6, -0.45, 0], [-0.3, 0.6, 0]];
  const [pads] = await Promise.all([
    Promise.all(PADS.map(([x, z, big]) => kenney("nature-kit", big ? "lily_large" : "lily_small", { parent: p, scale: big ? 3.6 : 4, x, y: 0.045, z, ry: x * 4, shadow: false }))),
    ...Array.from({ length: 11 }, (_, k) => { const a = k / 11 * Math.PI * 2 + 0.3, r = R(a) * 1.12; return kenney("nature-kit", k % 3 ? "stone_smallA" : "stone_smallC", { parent: p, scale: 1.4 + (k % 2) * 0.5, x: Math.cos(a) * r * 1.1, y: 0.01, z: Math.sin(a) * r * 0.95, ry: k, shadow: false }); }),
    ...[[-1.3, -0.6], [-1.15, -0.95], [1.25, -0.9]].map(([x, z]) => kenney("nature-kit", "grass", { parent: p, scale: 2.3, x, y: 0.01, z })),
  ]);
  pads.forEach(o => { o.userData.dyn = true; });
  tickers.push(t => pads.forEach((o, k) => { o.rotation.y = PADS[k][0] * 4 + Math.sin(t * 0.6 + k) * 0.12; }));
  const frog = new THREE.Group(); frog.userData.dyn = true; p.add(frog);
  vm(rbox(0.34, 0.2, 0.3, 0.08), "#6cc44f", { y: 0.1, parent: frog, shadow: false });
  for (const s of [-1, 1]) { vm(new THREE.SphereGeometry(0.07, 10, 8), "#6cc44f", { x: s * 0.09, y: 0.22, z: 0.06, shadow: false, parent: frog }); vm(new THREE.SphereGeometry(0.04, 8, 6), "#ffffff", { x: s * 0.09, y: 0.24, z: 0.1, shadow: false, parent: frog }); vm(new THREE.SphereGeometry(0.022, 6, 5), "#24324a", { x: s * 0.09, y: 0.245, z: 0.135, shadow: false, parent: frog }); }
  mergeStatic(frog); frog.scale.setScalar(1.3);
  const hops = [0, 1, 3, 1, 0, 2];
  tickers.push(t => { const c = t / 2.4, i = Math.floor(c) % hops.length, f = c % 1; const a = PADS[hops[i]], b = PADS[hops[(i + 1) % hops.length]];
    const u = f < 0.75 ? 0 : (f - 0.75) / 0.25, s = u * u * (3 - 2 * u);
    frog.position.set(a[0] + (b[0] - a[0]) * s, 0.08 + Math.sin(Math.PI * s) * 0.45, a[1] + (b[1] - a[1]) * s);
    frog.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); });
  const sg = new THREE.Group(); sg.position.set(1.55, 0, 1.35); p.add(sg);
  vm(cyl(0.04, 0.05, 0.8, 6), P.wood, { y: 0.4, parent: sg }); sign(sg, "🐸", "#7fd77a", 0, 0.85, 0.04, 0);
  return wm;
}
// ----- 扭蛋屋：黃色小店＋遮雨棚＋招牌＋屋頂冷氣、燈串；門口擺扭蛋機當招牌（models.json 沒有 gacha_machine 就放程式生成的）-----
function gachaPlaceholder(parent) {
  const g = new THREE.Group(); parent.add(g);
  vm(rbox(0.95, 0.9, 0.85, 0.12), "#ff6f86", { y: 0.45, parent: g });
  vm(rbox(1.0, 0.1, 0.9, 0.04), "#ffd166", { y: 0.93, parent: g });
  vm(box(0.34, 0.26, 0.04), "#3a4252", { y: 0.5, z: 0.43, parent: g, shadow: false });
  vm(cyl(0.12, 0.12, 0.08, 16), "#ffd166", { x: 0.28, y: 0.72, z: 0.45, rx: Math.PI / 2, parent: g, shadow: false });
  const capsules = new THREE.Group(); g.add(capsules); const r = rng(5);
  for (let k = 0; k < 14; k++) { const a = r() * 6.28, rad = r() * 0.32, h = 1.05 + r() * 0.45; vm(new THREE.SphereGeometry(0.11, 10, 8), ["#ff6f86", "#5fb4ff", "#ffd166", "#7fd77a", "#c79bff"][k % 5], { x: Math.cos(a) * rad, y: h, z: Math.sin(a) * rad, parent: capsules, shadow: false }); }
  mergeStatic(capsules);
  mesh(new THREE.SphereGeometry(0.5, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshLambertMaterial({ color: "#dff4ff", transparent: true, opacity: 0.38 }), { y: 1.0, parent: g, shadow: false });
  vm(cyl(0.16, 0.2, 0.12, 16), "#ff6f86", { y: 1.53, parent: g });
  return g;
}
async function buildGacha(d, p) {
  const X = -0.55;
  const [shop, url] = await Promise.all([
    kenney("city-kit-commercial", "building-d", { parent: p, scale: 1.45, x: X, ry: Math.PI / 2, tints: [[0, 2, "#ffe08a"], [3, 2, "#fff6d8"], [1, 2, "#f0a43c"], [1, 3, "#e0703c"]] }),
    usableGlb(MODELS + "gacha_machine.glb"),
  ]);
  const hb = new THREE.Box3().setFromObject(shop), roof = hb.max.y, front = hb.max.x - d.x, dep = hb.max.z - hb.min.z;
  const aw = stripeTex("#ffffff", "#f0a43c", 7);
  mesh(box(0.46, 0.04, dep - 0.1), new THREE.MeshLambertMaterial({ map: aw }), { x: front + 0.2, y: 0.8, rz: -0.4, parent: p });
  vm(box(0.03, 0.12, dep - 0.1), "#f0a43c", { x: front + 0.41, y: 0.66, parent: p });
  sign(p, "🎁", "#ff8fa3", front + 0.02, 1.5, 0, Math.PI / 2);
  sign(p, "⭐", "#f0a43c", X, 1.5, hb.max.z - d.z + 0.02, 0);
  acUnit(p, X - 0.3, roof - 0.04, -0.3); solar(p, X + 0.2, roof - 0.04, 0.3, Math.PI / 2);
  stringLights(p, [[front + 0.02, hb.min.z - d.z + 0.05], [front + 0.02, hb.max.z - d.z - 0.05]], 1.32);
  planter(p, d.x + front + 0.3, d.z + 0.85, 0.55, Math.PI / 2); planter(p, d.x + front + 0.3, d.z - 0.85, 0.55, Math.PI / 2);
  const m = url ? await loadAny(url, { h: 1.25, w: 0.9 }) : gachaPlaceholder(new THREE.Group());   // 門口的扭蛋機（招牌）
  if (!url) m.scale.setScalar(0.62);
  m.position.set(front + 0.55, 0, 0); m.rotation.y = Math.PI / 2; p.add(m);
  return shop;
}
// ----- 泡泡救援灣：海灘＋藍白救生站高腳屋＋黃色泡泡機，泡泡一直往上飄，最大那顆困著小企鵝 -----
async function buildBubble(d, p) {
  const gy = (x, z) => groundY(d.x + x, d.z + z);
  for (const [x, z, c] of [[0.35, 1.95, "#5fb4ff"], [-0.6, 1.75, "#ff8fb0"]]) vm(box(0.45, 0.02, 0.8), c, { x, y: gy(x, z) + 0.02, z, ry: 0.3, parent: p, shadow: false });
  const hut = new THREE.Group(); hut.position.set(-0.55, gy(-0.55, -0.35), -0.35); p.add(hut);
  for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) vm(box(0.08, 0.62, 0.08), "#f4f1ea", { x, y: 0.31, z, parent: hut });
  vm(box(1.1, 0.06, 1.1), "#c98a55", { y: 0.64, parent: hut });
  vm(rbox(0.92, 0.66, 0.92, 0.04), "#5fb4ff", { y: 1.0, parent: hut });
  for (const y of [0.82, 1.06]) vm(box(0.94, 0.07, 0.94), "#ffffff", { y, parent: hut, shadow: false });
  vm(new THREE.ConeGeometry(0.82, 0.5, 4), "#ff6f86", { y: 1.58, ry: Math.PI / 4, parent: hut });
  vm(box(0.03, 0.3, 0.36), "#bfe3f3", { x: 0.47, y: 1.06, parent: hut, shadow: false }); vm(box(0.36, 0.3, 0.03), "#bfe3f3", { y: 1.06, z: 0.47, parent: hut, shadow: false });
  for (let k = 0; k < 4; k++) vm(box(0.34, 0.04, 0.12), "#c98a55", { x: 0.75 - k * 0.08, y: 0.1 + k * 0.16, z: 0.2, parent: hut, shadow: false });
  vm(cyl(0.02, 0.02, 0.9, 6), "#e8e6e1", { x: -0.42, y: 2.0, z: -0.42, parent: hut, shadow: false }); vm(box(0.02, 0.2, 0.3), "#ffd166", { x: -0.42, y: 2.35, z: -0.27, parent: hut, shadow: false });
  sign(hut, "🐧", "#5fb4ff", 0.47, 1.0, -0.22, Math.PI / 2);
  // 泡泡機：黃色底座＋吹口朝天空
  const mc = new THREE.Group(); mc.position.set(0.75, gy(0.75, -0.25), -0.25); p.add(mc);
  vm(rbox(0.5, 0.36, 0.42, 0.06), "#ffd166", { y: 0.18, parent: mc }); vm(cyl(0.11, 0.17, 0.36, 12), "#ff9b54", { y: 0.52, rx: -0.35, parent: mc });
  vm(new THREE.TorusGeometry(0.16, 0.035, 8, 16), "#ff6f86", { y: 0.7, z: -0.07, rx: Math.PI / 2 - 0.35, parent: mc, shadow: false });
  await Promise.all([[-0.35, 0.95, "#ff8fb0"], [1.05, 1.45, "#7fd7f0"]].map(([x, z, col]) => kenney("city-kit-commercial", "detail-parasol-a", { scale: 2.3, x, z, y: gy(x, z), tints: [[0, 1, col]], parent: p })));
  // 會飄的泡泡（半透明＋亮點）：從泡泡機冒出來往上飄、飄到頂端啵一下再從頭；大泡泡裡的小企鵝輕輕上下晃
  const bm = new THREE.MeshLambertMaterial({ color: "#c9f0ff", transparent: true, opacity: 0.42, depthWrite: false }), hm = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  const ball = (r) => { const g = new THREE.Group(); g.userData.dyn = true; mesh(new THREE.SphereGeometry(r, 16, 12), bm, { parent: g, shadow: false }); mesh(new THREE.SphereGeometry(r * 0.22, 8, 6), hm, { x: -r * 0.42, y: r * 0.45, z: r * 0.42, parent: g, shadow: false }); p.add(g); return g; };
  const flo = [0.16, 0.22, 0.13, 0.19].map((r, k) => ({ g: ball(r), k }));
  const big = ball(0.42); big.position.set(0.35, 2.05, 0.65);
  const pg = await kenney("cube-pets", "animal-penguin", { scale: 0.34, y: -0.24, ry: Math.PI / 4, parent: big, shadow: false });
  void pg;
  tickers.push(t => {
    for (const f of flo) { const u = (t * 0.18 + f.k / flo.length) % 1; f.g.position.set(0.72 + Math.sin(t * 1.2 + f.k) * 0.25 * u, 0.85 + u * 2.4, -0.32 - u * 0.5 + Math.cos(t + f.k) * 0.1); f.g.scale.setScalar(u > 0.92 ? Math.max(0.01, (1 - u) / 0.08) : Math.min(1, u * 6)); }
    big.position.y = 2.05 + Math.sin(t * 1.4) * 0.12; big.rotation.y = Math.sin(t * 0.7) * 0.3;
  });
  return hut;
}
// 縮到「水平最寬＝size」、轉 ry、中心擺到父層座標 (x, z)、最低點放在 y（父層只有平移時才準：建築的 pivot、場景本身都是）
function placeFit(o, x, z, size, ry = 0, y = 0) {
  o.rotation.y = ry; o.updateWorldMatrix(true, true);
  let b = new THREE.Box3().setFromObject(o); o.scale.multiplyScalar(size / Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 1e-3)); o.updateWorldMatrix(true, true);
  b = new THREE.Box3().setFromObject(o); const pw = o.parent ? o.parent.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  o.position.x += x + pw.x - (b.min.x + b.max.x) / 2; o.position.z += z + pw.z - (b.min.z + b.max.z) / 2; o.position.y += y + pw.y - b.min.y;
  return o;
}
// ----- 彩虹配送站（10-12，彩虹島南排）：奶油色倉庫＋彩虹拱頂＋鐵捲門上的七彩遮雨棚；門前貨櫃、貨箱、配送小貨車；後面（南邊、朝鏡頭）碼頭＋貨船 -----
async function buildDepot(d, p) {
  const W = 2.5, D = 1.45, H = 1.15, Z = -0.15, front = Z + D / 2, coast = RB.z + RB.hz - d.z;   // 區域座標；coast＝南岸草地邊
  const shed = new THREE.Group(); p.add(shed);
  vm(rbox(W, H, D, 0.05), "#fbf3e6", { y: H / 2, z: Z, parent: shed });
  vm(box(W + 0.03, 0.2, D + 0.03), "#b9a7e8", { y: 0.1, z: Z, parent: shed });          // 牆腳
  vm(box(W + 0.04, 0.06, D + 0.04), "#ffffff", { y: H - 0.02, z: Z, parent: shed, shadow: false });
  mesh(rainbowVault(W + 0.16, D / 2 + 0.08, 0.62), vcMat, { y: H + 0.02, z: Z, parent: shed });   // 彩虹拱頂（兩頭的半圓就是一道彩虹）
  vm(rbox(0.9, 0.72, 0.42, 0.04), "#fbf3e6", { x: -0.7, y: 0.36, z: Z - D / 2 - 0.19, parent: shed });   // 北邊（路那側）小辦公室＋門
  vm(box(0.26, 0.42, 0.03), "#8a5a3c", { x: -0.55, y: 0.21, z: Z - D / 2 - 0.41, parent: shed, shadow: false });
  // 南面（朝鏡頭）：大鐵捲門＋七彩遮雨棚＋窗＋招牌
  vm(box(1.34, 0.96, 0.04), "#ffffff", { y: 0.48, z: front + 0.01, parent: shed, shadow: false });
  for (let k = 0; k < 6; k++) vm(box(1.18, 0.12, 0.045), k % 2 ? "#c7ccd6" : "#dde2ea", { y: 0.09 + k * 0.145, z: front + 0.02, parent: shed, shadow: false });
  const aw = rainbowTex(); mesh(box(1.62, 0.04, 0.5), new THREE.MeshLambertMaterial({ map: aw }), { y: 1.06, z: front + 0.21, rx: 0.42, parent: shed });
  vm(box(1.62, 0.1, 0.03), "#ffffff", { y: 0.94, z: front + 0.43, parent: shed, shadow: false });
  vm(box(0.34, 0.3, 0.03), "#bfe3f3", { x: 0.98, y: 0.62, z: front + 0.01, parent: shed, shadow: false });
  sign(shed, "🌈", "#ffffff", -0.95, 0.7, front + 0.02, 0);
  sign(shed, "🚚", "#4fb6f0", W / 2 + 0.02, 0.72, Z, Math.PI / 2);
  vm(box(0.03, 0.3, 0.34), "#bfe3f3", { x: W / 2 + 0.01, y: 0.7, z: Z - 0.45, parent: shed, shadow: false });
  // 門前水泥地、貨櫃、貨箱、木桶、配送小貨車、彩虹旗
  vm(box(W + 0.5, 0.03, coast - front + 0.05), "#d9d5cc", { y: 0.015, z: (front + coast) / 2, parent: p, shadow: false });
  const [ca, cb, crate, barrel, truck, dockA, dockB, ship] = await Promise.all([
    kenney("watercraft-pack", "cargo-container-a", { parent: p }), kenney("watercraft-pack", "cargo-container-c", { parent: p }),
    kenney("pirate-kit", "crate", { parent: p, scale: 0.28, x: -0.1, y: 0.03, z: front + 0.32, ry: 0.4 }),
    kenney("pirate-kit", "barrel", { parent: p, scale: 0.19, x: 0.12, y: 0.03, z: front + 0.62 }),
    kenney("car-kit", "delivery", { parent: p }),
    kenney("pirate-kit", "structure-platform-dock", { parent: p, scale: 0.68, x: 0.35, z: coast + 0.42, y: -0.2 - 1.31 * 0.68 }),
    kenney("pirate-kit", "structure-platform-dock", { parent: p, scale: 0.68, x: 0.35, z: coast + 0.42 + 1.7, y: -0.2 - 1.31 * 0.68 }),
    kenney("watercraft-pack", "ship-cargo-a", { parent: p, shadow: false }),
  ]);
  void dockA; void dockB;
  placeFit(ca, -0.85, front + 0.45, 1.0, 0, 0.03);
  const cbb = new THREE.Box3().setFromObject(ca); placeFit(cb, -0.8, front + 0.45, 0.95, 0.06, cbb.max.y - 0.005);   // 疊在上面
  placeFit(truck, 0.78, front + 0.62, 1.25, Math.PI / 2, 0.03);
  const sb = new THREE.Box3().setFromObject(ship), along = (sb.max.x - sb.min.x) > (sb.max.z - sb.min.z);   // 船身跟碼頭平行（沿 z）
  placeFit(ship, 1.75, coast + 2.1, 3.1, along ? Math.PI / 2 : 0, SEA_Y - 0.3);
  ship.userData.dyn = true; const sy0 = ship.position.y;
  rbTickers.push(t => { ship.position.y = sy0 + Math.sin(t * 1.2) * 0.035; ship.rotation.z = Math.sin(t * 0.9) * 0.025; });
  const fg = new THREE.Group(); fg.position.set(-1.2, 0, coast - 0.3); p.add(fg);
  vm(cyl(0.025, 0.03, 1.55, 6), "#e8e6e1", { y: 0.78, parent: fg });
  const flagM = mesh(box(0.02, 0.34, 0.52), new THREE.MeshLambertMaterial({ map: rainbowTex(7, false) }), { y: 1.36, z: 0.27, parent: fg, shadow: false });
  const fp = new THREE.Group(); fp.userData.dyn = true; fp.position.set(0, 0, 0); fg.add(fp); fp.attach(flagM);
  rbTickers.push(t => { fp.rotation.y = Math.sin(t * 2.3) * 0.25; });
  void crate; void barrel;
  return shed;
}
// ----- 寵物服裝店（10-12，彩虹島北排中間）：粉紫色小店＋條紋遮雨棚；屋頂一個大蝴蝶結慢慢轉（招牌）；門口櫥窗台上的貓戴帽子、小衣架掛三件小衣服 -----
async function buildDress(d, p) {
  const [shop, bowU, catU, hatU] = await Promise.all([
    kenney("city-kit-commercial", "building-d", { parent: p, scale: 1.6, z: -0.15, tints: [[0, 2, "#ffd6ea"], [3, 2, "#fff4fa"], [1, 2, "#c86fb0"], [1, 3, "#a85a9a"]] }),
    usableGlb(MODELS + "bow.glb"), usableGlb(MODELS + "cat.glb"), usableGlb(MODELS + "hat.glb"),
  ]);
  const hb = new THREE.Box3().setFromObject(shop), roof = hb.max.y, front = hb.max.z - d.z, side = hb.max.x - d.x, w = hb.max.x - hb.min.x;
  mesh(box(w - 0.1, 0.04, 0.48), new THREE.MeshLambertMaterial({ map: stripeTex("#ffffff", "#e86aa6", 7) }), { y: 0.8, z: front + 0.2, rx: 0.4, parent: p });
  vm(box(w - 0.1, 0.12, 0.03), "#e86aa6", { y: 0.66, z: front + 0.42, parent: p });
  sign(p, "🎀", "#ffd6ea", side + 0.02, 1.45, -0.15, Math.PI / 2);
  sign(p, "👒", "#c86fb0", -0.42, 1.42, front + 0.02, 0);
  stringLights(p, [[hb.min.x - d.x + 0.05, front + 0.02], [hb.max.x - d.x - 0.05, front + 0.02]], 1.3);
  // 櫥窗台：小圓台上一隻貓戴帽子
  const ped = new THREE.Group(); ped.position.set(-0.6, 0, front + 0.36); p.add(ped);
  vm(cyl(0.22, 0.25, 0.16, 16), "#ffffff", { y: 0.08, parent: ped }); vm(cyl(0.235, 0.235, 0.03, 16), "#e86aa6", { y: 0.17, parent: ped, shadow: false });
  const extra = await Promise.all([catU ? loadAny(catU, { h: 0.46 }) : null, hatU ? loadAny(hatU) : null, bowU ? loadAny(bowU) : null]);
  const [cat, hat, bow] = extra;
  if (cat) { cat.position.y += 0.185; cat.rotation.y = CAM_YAW; ped.add(cat); }
  if (cat && hat) {
    cat.updateWorldMatrix(true, true); const cb = new THREE.Box3().setFromObject(cat), pw = ped.getWorldPosition(new THREE.Vector3()), c = cb.getCenter(new THREE.Vector3());
    ped.add(hat); placeFit(hat, c.x - pw.x, c.z - pw.z, 0.3, 0, cb.max.y - pw.y - 0.07); hat.traverse(o => { o.castShadow = false; });
  }
  // 小衣架：兩根柱子＋橫桿＋三件小衣服
  const rk = new THREE.Group(); rk.position.set(0.62, 0, front + 0.36); p.add(rk);
  for (const x of [-0.26, 0.26]) vm(cyl(0.02, 0.02, 0.62, 6), "#c98a55", { x, y: 0.31, parent: rk, shadow: false });
  vm(cyl(0.015, 0.015, 0.56, 6), "#c98a55", { y: 0.6, rz: Math.PI / 2, parent: rk, shadow: false });
  ["#ff6b6b", "#ffd84d", "#4fb6f0"].forEach((c, k) => { vm(rbox(0.14, 0.2, 0.05, 0.02), c, { x: -0.16 + k * 0.16, y: 0.47, parent: rk, shadow: false }); vm(box(0.2, 0.05, 0.05), c, { x: -0.16 + k * 0.16, y: 0.55, parent: rk, shadow: false }); });
  // 屋頂大蝴蝶結（招牌，慢慢轉；浮標放它上面）
  let sig = null;
  if (bow) { const bg = new THREE.Group(); bg.userData.dyn = true; p.add(bg); bg.add(bow); placeFit(bow, 0, 0, 0.95, 0, 0); bg.position.set(0, roof + 0.05, -0.15);
    bow.traverse(o => { o.castShadow = false; }); sig = bg; rbTickers.push(t => { bg.rotation.y = t * 0.5; bg.position.y = roof + 0.05 + Math.sin(t * 2) * 0.04; }); }
  d.sig = sig;
  return shop;
}
// ----- 詞句偵探社（10-12，彩虹島環狀路裡面東邊；門朝東＝正對彩虹橋入口）：奶油色小樓＋深綠牆腳，屋頂是一頂格紋「偵探帽」
//       （圓頂＋前後帽簷＋頂上釦子）；門口右邊（朝鏡頭那側）立一支大放大鏡招牌、慢慢晃；偵探小狗戴帽子站在門口；草地上一串小腳印走到門口 -----
const plaidMat = () => texMat("plaid", () => { const t = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = "#c99b5e"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(105,66,32,0.5)"; for (let i = 0; i < 4; i++) { g.fillRect(i * 16 + 4, 0, 7, h); g.fillRect(0, i * 16 + 4, w, 7); }
  g.fillStyle = "#b0392b"; for (let i = 0; i < 4; i++) { g.fillRect(i * 16 + 13, 0, 2, h); g.fillRect(0, i * 16 + 13, w, 2); } });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t; });
async function buildSleuth(d, p) {
  const W = 1.2, D = 1.7, H = 1.2, fx = W / 2;            // 區域座標：x＝前後（門在 +x 面）、z＝左右
  const house = new THREE.Group(); p.add(house);
  vm(rbox(W, H, D, 0.05), "#f6ecd4", { y: H / 2, parent: house });
  vm(box(W + 0.03, 0.22, D + 0.03), "#2f6b50", { y: 0.11, parent: house });                       // 深綠牆腳
  vm(box(W + 0.05, 0.08, D + 0.05), "#2f6b50", { y: H - 0.03, parent: house, shadow: false });    // 屋簷線
  // 門（朝東）＋門把＋門楣、門兩旁兩扇小窗（暖色）；+z 面（朝鏡頭）一扇窗＋🕵️ 招牌
  vm(box(0.04, 0.52, 0.36), "#7a4a2c", { x: fx + 0.01, y: 0.26, parent: house, shadow: false });
  vm(new THREE.SphereGeometry(0.028, 8, 6), "#ffd166", { x: fx + 0.04, y: 0.26, z: 0.11, parent: house, shadow: false });
  vm(box(0.03, 0.07, 0.5), "#2f6b50", { x: fx + 0.02, y: 0.56, parent: house, shadow: false });
  for (const z of [-0.55, 0.55]) vm(box(0.03, 0.26, 0.24), "#ffe7a3", { x: fx + 0.01, y: 0.84, z, parent: house, shadow: false });
  sign(house, "🔍", "#2f6b50", fx + 0.02, 0.86, 0, Math.PI / 2);
  vm(box(0.3, 0.3, 0.03), "#ffe7a3", { x: -0.27, y: 0.66, z: D / 2 + 0.01, parent: house, shadow: false });
  vm(box(0.34, 0.04, 0.05), "#2f6b50", { x: -0.27, y: 0.49, z: D / 2 + 0.02, parent: house, shadow: false });
  sign(house, "🕵️", "#8a5a2b", 0.27, 0.68, D / 2 + 0.02, 0);
  // 偵探帽屋頂：格紋橢圓圓頂＋前後兩片帽簷（往下斜一點）＋頂上一顆釦子
  const hat = new THREE.Group(); hat.position.y = H + 0.01; house.add(hat);
  mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), plaidMat(), { parent: hat }).scale.set(W / 2 + 0.07, 0.6, D / 2 + 0.06);
  for (const s of [1, -1]) {                              // 半圓帽簷：CylinderGeometry 的 theta 0～π＝+x 那一半
    const bill = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.045, 20, 1, false, 0, Math.PI), plaidMat(), { x: s * (W / 2 - 0.02), y: 0.02, ry: s > 0 ? 0 : Math.PI, rz: -0.28, parent: hat });   // 先往下斜（rz）再轉向（ry）：前後兩片都往外往下
    bill.scale.set(1, 1, 1.45);
  }
  vm(new THREE.SphereGeometry(0.07, 10, 8), "#7a4a2c", { y: 0.6, parent: hat, shadow: false });
  for (const s of [-1, 1]) vm(rbox(0.05, 0.2, 0.08, 0.02), "#7a4a2c", { y: 0.55, z: s * 0.07, rx: s * 0.6, parent: hat, shadow: false });   // 綁在頂上的耳罩帶子
  // 大放大鏡招牌（門口右邊、朝鏡頭）：木頭握把、金色鏡框、淡藍鏡片＋白色反光；招牌慢慢晃（只在鏡頭在彩虹島時動）
  const mg = new THREE.Group(); mg.userData.dyn = true; mg.position.set(fx + 0.36, 0, D / 2 - 0.12); mg.rotation.y = CAM_YAW; p.add(mg);
  const mgIn = new THREE.Group(); mg.add(mgIn);
  vm(cyl(0.045, 0.06, 0.95, 8), "#8a5a3c", { y: 0.47, parent: mgIn });
  vm(new THREE.TorusGeometry(0.29, 0.055, 10, 28), "#f2c14e", { y: 1.2, parent: mgIn });
  mesh(new THREE.CircleGeometry(0.28, 28), new THREE.MeshLambertMaterial({ color: "#bfe8ff", transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), { y: 1.2, parent: mgIn, shadow: false });
  vm(new THREE.CircleGeometry(0.06, 12), "#ffffff", { x: -0.1, y: 1.3, z: 0.012, parent: mgIn, shadow: false, glow: true });
  rbTickers.push(t => { mgIn.rotation.z = 0.1 + Math.sin(t * 1.3) * 0.07; mgIn.rotation.x = Math.sin(t * 0.9) * 0.04; });
  // 小腳印（線索）：從路邊沿著 +z 那側草地走到門口
  for (const [x, z, r] of [[0.15, 1.12, 0.6], [0.4, 1.0, 0.9], [-0.1, 1.06, 0.4]]) {
    const pw = new THREE.Group(); pw.position.set(x, 0.012, z); pw.rotation.y = r; p.add(pw);
    vm(new THREE.CircleGeometry(0.045, 10).rotateX(-Math.PI / 2), "#8a5a3c", { parent: pw, shadow: false });
    for (const [tx, tz] of [[-0.045, -0.05], [-0.015, -0.068], [0.015, -0.068], [0.045, -0.05]]) vm(new THREE.CircleGeometry(0.016, 8).rotateX(-Math.PI / 2), "#8a5a3c", { x: tx, z: tz, parent: pw, shadow: false });
  }
  // 偵探小狗（寵物模型 dog＋帽子）站在門口左邊，面向鏡頭
  const [dogU, hatU] = await Promise.all([usableGlb(MODELS + "dog.glb"), usableGlb(MODELS + "hat.glb")]);
  const [dog, cap] = await Promise.all([dogU ? loadAny(dogU, { h: 0.5 }) : null, hatU ? loadAny(hatU) : null]);
  if (dog) {
    const dg = new THREE.Group(); dg.position.set(fx + 0.34, 0, -0.45); p.add(dg); dog.rotation.y = CAM_YAW; dg.add(dog);
    if (cap) { dog.updateWorldMatrix(true, true); const cb = new THREE.Box3().setFromObject(dog), pw = dg.getWorldPosition(new THREE.Vector3()), c = cb.getCenter(new THREE.Vector3());
      dg.add(cap); placeFit(cap, c.x - pw.x, c.z - pw.z, 0.24, 0, cb.max.y - pw.y - 0.06); cap.traverse(o => { o.castShadow = false; }); }
  }
  return house;
}
// ----- 陀螺競技場（10-12，歸仁區東邊小半島；入口朝西＝橫路的路底）：圓形擂台（藍色淺碗＋白圈＋地上的 🌀）＋三層彩色看台＋入口拱門＋四支三角旗；
//       擂台裡兩顆陀螺一直轉、繞著中心互相追著碰；遠側看台坐三隻小動物觀眾（面向擂台＝面向鏡頭），會輪流跳一下歡呼 -----
let vcDoubleMat = null;
const vcDouble = () => vcDoubleMat || (vcDoubleMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));   // 看台立面（從擂台裡面看的是背面）
async function buildArena(d, p) {
  const ar = new THREE.Group(); p.add(ar);
  const TIERS = [[1.12, 1.34, 0.21, "#ff6b6b"], [1.34, 1.56, 0.37, "#ffd166"], [1.56, 1.78, 0.53, "#4fb6f0"]];   // [內半徑, 外半徑, 座位高, 顏色]
  const open = (r, h, y) => { const g = new THREE.CylinderGeometry(r, r, h, 44, 1, true); g.translate(0, y + h / 2, 0); return g; };
  // 擂台：白色外緣＋藍色淺碗＋白圈線＋地上一個 🌀（轉 45° 正對鏡頭）
  vm(cyl(1.12, 1.15, 0.12, 44), "#ece7df", { y: 0.06, parent: ar });
  vm(cyl(1.0, 0.94, 0.03, 44), "#4e74d6", { y: 0.125, parent: ar, shadow: false });
  const line = new THREE.RingGeometry(0.66, 0.7, 44); line.rotateX(-Math.PI / 2); vm(line, "#ffffff", { y: 0.142, parent: ar, shadow: false });
  const em = mesh(new THREE.CircleGeometry(0.3, 28), signMat("🌀", "#ffd84d"), { y: 0.145, parent: ar, shadow: false }); em.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
  // 看台：一層一圈彩色座位（朝上的環）＋白色立面（從擂台裡面看）；最外圈一道橘色外牆
  let y0 = 0.12;
  for (const [r0, r1, y, col] of TIERS) {
    const seat = new THREE.RingGeometry(r0, r1, 44); seat.rotateX(-Math.PI / 2); vm(seat, col, { y, parent: ar });
    mesh(paint(open(r0, y - y0, y0).toNonIndexed(), "#f4f1ea"), vcDouble(), { parent: ar }); y0 = y;
  }
  vm(open(1.79, 0.53, 0), "#e0703a", { parent: ar });
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; vm(box(0.05, 0.36, 0.02), "#ffd166", { x: Math.cos(a) * 1.8, y: 0.3, z: Math.sin(a) * 1.8, ry: -a + Math.PI / 2, parent: ar, shadow: false }); }   // 外牆的黃色直條
  // 入口拱門（西邊＝路底）：兩根紫色柱子＋黃色橫幅（兩面都有 🌀）
  for (const s of [-1, 1]) vm(rbox(0.16, 0.98, 0.16, 0.03), "#6f4fd8", { x: -1.98, y: 0.49, z: s * 0.52, parent: ar });
  vm(rbox(0.14, 0.32, 1.26, 0.04), "#ffd166", { x: -1.98, y: 1.08, parent: ar });
  sign(ar, "🌀", "#6f4fd8", -1.98 + 0.08, 1.08, 0, Math.PI / 2); sign(ar, "🌀", "#6f4fd8", -1.98 - 0.08, 1.08, 0, -Math.PI / 2);
  // 四支三角旗（看台外面四個斜角）
  [["#ff6b6b", 0.8], ["#4fb6f0", 2.35], ["#7ad66b", -0.8], ["#ffd166", -2.35]].forEach(([c, a]) => flag(ar, d.x + Math.cos(a) * 2.02, d.z + Math.sin(a) * 2.02, c));
  // 兩顆陀螺：倒圓錐＋圓盤＋小把手，自己高速轉、繞著中心追著跑，半徑一縮一放＝互相碰撞、彈開
  const mkTop = (c1, c2) => {
    const g = new THREE.Group(); g.userData.dyn = true; ar.add(g);
    const spin = new THREE.Group(); g.add(spin);
    const cone = new THREE.ConeGeometry(0.15, 0.19, 16); cone.rotateX(Math.PI); cone.translate(0, 0.095, 0); vm(cone, c1, { parent: spin, shadow: false });
    vm(cyl(0.17, 0.15, 0.06, 16), c2, { y: 0.215, parent: spin, shadow: false });
    vm(cyl(0.175, 0.175, 0.02, 16), "#ffffff", { y: 0.25, parent: spin, shadow: false });
    vm(cyl(0.035, 0.035, 0.09, 8), "#24324a", { y: 0.3, parent: spin, shadow: false });
    for (let k = 0; k < 3; k++) vm(box(0.03, 0.025, 0.12), c1, { x: Math.cos(k * 2.1) * 0.1, y: 0.262, z: Math.sin(k * 2.1) * 0.1, ry: -k * 2.1, parent: spin, shadow: false });
    return { g, spin };
  };
  const T = [mkTop("#ff5a4f", "#ffb03a"), mkTop("#3d8bff", "#7ad6ff")];
  tickers.push(t => {
    const rr = 0.46 + Math.sin(t * 1.6) * 0.2;            // 兩顆一起靠近（碰一下）再分開
    T.forEach((o, i) => { const a = t * 1.1 + i * Math.PI; o.g.position.set(Math.cos(a) * rr, 0.14, Math.sin(a) * rr); o.spin.rotation.y = t * 14 * (i ? -1 : 1); o.g.rotation.z = Math.sin(t * 3 + i) * 0.08; o.g.rotation.x = Math.cos(t * 2.6 + i) * 0.06; });
  });
  // 觀眾：遠側（西北）看台上三隻 Kenney 小動物，面向擂台中心（＝面向鏡頭），輪流跳一下
  const FANS = [["animal-bunny", Math.PI * 1.1], ["animal-panda", Math.PI * 1.25], ["animal-cat", Math.PI * 1.4]];
  const fans = await Promise.all(FANS.map(([n, a]) => kenney("cube-pets", n, { parent: null, shadow: false }).then(m => ({ m, a })).catch(() => null)));
  fans.filter(Boolean).forEach(({ m, a }, i) => {
    const fg = new THREE.Group(); fg.userData.dyn = true; fg.position.set(Math.cos(a) * 1.45, 0.37, Math.sin(a) * 1.45); fg.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); ar.add(fg);
    let b = new THREE.Box3().setFromObject(m); m.scale.multiplyScalar(0.32 / Math.max(b.max.y - b.min.y, 1e-3)); b = new THREE.Box3().setFromObject(m); m.position.y -= b.min.y; fg.add(m);
    tickers.push(t => { const u = ((t * 0.5 + i / 3) % 1); fg.position.y = 0.37 + (u < 0.12 ? Math.sin(u / 0.12 * Math.PI) * 0.12 : 0); });
  });
  return ar;
}
const BUILDERS = { fish: buildFish, order: buildOrder, build: buildBuild, hunt: buildHunt, match: buildMatch, tone: buildTone, whack: buildWhack, frog: buildFrog, bubble: buildBubble, gacha: buildGacha, deliver: buildDepot, dress: buildDress, detective: buildSleuth, tops: buildArena };

// =========================================================
// 景點（程式生成的部分第一段就蓋好；Kenney 模型第二段）
// =========================================================
function slot(x, z, ry = Math.PI / 4) { decorSlots.push({ x, z, ry }); }
function spotGroup(s) { const g = new THREE.Group(); g.position.set(s.x, 0, s.z); scene.add(g); statics.push(g); s.g = g; return g; }
function ex(s, x0, x1, z0, z1) { exRects.push([s.x + x0, s.x + x1, s.z + z0, s.z + z1]); }
const SPOT_BUILD = {
  // 花園台地：花圃、矮樹籬、拱門
  garden(s, g) {
    terrace(s.x, s.z, 1.25, 1.25, 0.32);
    const Y = 0.32;
    for (const z of [-0.4, 0.35]) {
      vm(box(1.8, 0.12, 0.42), "#8a5a3c", { y: Y + 0.06, z, parent: g, shadow: false });
      for (let k = 0; k < 7; k++) vm(new THREE.IcosahedronGeometry(0.09, 0), ["#ff8fb1", "#ffd75e", "#c9a2ff", "#ff6f7d", "#ffffff"][(k + (z > 0 ? 2 : 0)) % 5], { x: -0.75 + k * 0.25, y: Y + 0.2, z: z + ((k % 2) - 0.5) * 0.12, parent: g, shadow: false });
    }
    for (const z of [-0.98, 0.98]) vm(rbox(1.7, 0.3, 0.24, 0.08), "#4f9a3e", { y: Y + 0.15, z, parent: g });
    const arch = new THREE.TorusGeometry(0.4, 0.05, 6, 16, Math.PI); vm(arch, "#ffffff", { x: 1.0, y: Y + 0.7, ry: Math.PI / 2, parent: g });
    for (const z of [-0.4, 0.4]) vm(cyl(0.05, 0.05, 0.7, 6), "#ffffff", { x: 1.0, y: Y + 0.35, z, parent: g });
    for (let k = 0; k < 6; k++) vm(new THREE.IcosahedronGeometry(0.07, 0), "#ff6f86", { x: 1.0, y: Y + 0.7 + Math.sin(k / 5 * Math.PI) * 0.4, z: Math.cos(k / 5 * Math.PI) * 0.4, parent: g, shadow: false });
    ex(s, -1.35, 1.35, -1.35, 1.35); slot(s.x - 1.0, s.z + 1.08); slot(s.x + 1.0, s.z + 1.08); slot(s.x - 1.0, s.z - 1.08);
  },
  // 燈塔岬：石頭台地＋紅白燈塔＋守塔人小屋
  lighthouse(s, g) {
    const lx = 2.0, lz = -2.0;
    terrace(s.x + 0.6, s.z - 0.6, 1.9, 1.9, 0.3, "#9fbf6a", "#9a8f84");
    const t = new THREE.Group(); t.position.set(lx, 0.3, lz); g.add(t);
    for (let k = 0; k < 5; k++) vm(cyl(0.42 - k * 0.04, 0.46 - k * 0.04, 0.5, 18), k % 2 ? "#e2453c" : "#ffffff", { y: 0.25 + k * 0.5, parent: t });
    vm(cyl(0.5, 0.5, 0.06, 18), "#3d4652", { y: 2.53, parent: t });
    vm(cyl(0.26, 0.26, 0.4, 12), "#fff3a0", { y: 2.76, parent: t, glow: true, shadow: false });
    vm(new THREE.ConeGeometry(0.36, 0.42, 12), "#e2453c", { y: 3.17, parent: t });
    const pivot = new THREE.Group(); pivot.position.set(0, 2.76, 0); pivot.userData.dyn = true; t.add(pivot);   // 會轉的燈光（錐形、半透明）
    const bg = new THREE.ConeGeometry(0.45, 3.2, 16, 1, true); bg.translate(0, -1.6, 0); bg.rotateZ(Math.PI / 2);
    mesh(bg, new THREE.MeshBasicMaterial({ color: "#fff6c0", transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), { parent: pivot, shadow: false });
    tickers.push(tt => { pivot.rotation.y = tt * 0.7; });
    const hut = new THREE.Group(); hut.position.set(-0.4, 0.3, 0.4); g.add(hut);
    vm(rbox(0.9, 0.6, 0.7, 0.03), "#f0e7d3", { y: 0.3, parent: hut });
    vm(new THREE.ConeGeometry(0.72, 0.42, 4), "#3e7d68", { y: 0.81, ry: Math.PI / 4, parent: hut });
    vm(box(0.2, 0.34, 0.02), "#8a5a3c", { y: 0.17, z: 0.36, parent: hut, shadow: false });
    for (let k = 0; k < 6; k++) vm(box(0.05, 0.3, 0.05), "#ffffff", { x: 0.9 + k * 0.32, y: 0.45, z: 1.0, parent: g });
    vm(box(1.65, 0.04, 0.03), "#ffffff", { x: 1.7, y: 0.55, z: 1.0, parent: g });
    parkedCar(g, s.x - 1.0, s.z - 0.6, 0, 2);
    ex(s, -1.9, 3.2, -3.2, 1.4); slot(s.x - 0.9, s.z + 1.0); slot(s.x + 1.3, s.z + 1.05); slot(s.x + 0.7, s.z - 1.2);
  },
  // 遊樂場：沙坑、溜滑梯、盪鞦韆、翹翹板
  playground(s, g) {
    vm(new THREE.CylinderGeometry(1.25, 1.25, 0.06, 32), "#f2e2b8", { x: -0.2, y: 0.03, parent: g, shadow: false });
    const sl = new THREE.Group(); sl.position.set(-0.65, 0, -0.45); g.add(sl);
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) vm(cyl(0.04, 0.04, 0.9, 6), "#5fb4ff", { x, y: 0.45, z, parent: sl });
    vm(box(0.6, 0.06, 0.6), "#ffd166", { y: 0.9, parent: sl }); vm(new THREE.ConeGeometry(0.45, 0.4, 4), "#ff6f86", { y: 1.35, ry: Math.PI / 4, parent: sl });
    vm(box(0.4, 0.04, 1.1), "#ff9b54", { y: 0.5, z: 0.78, rx: 0.68, parent: sl });
    const sw = new THREE.Group(); sw.position.set(0.45, 0, 0.35); g.add(sw);
    for (const x of [-0.5, 0.5]) { vm(cyl(0.04, 0.04, 1.2, 6), "#7fd77a", { x, y: 0.55, z: -0.2, rx: 0.25, parent: sw }); vm(cyl(0.04, 0.04, 1.2, 6), "#7fd77a", { x, y: 0.55, z: 0.2, rx: -0.25, parent: sw }); }
    vm(cyl(0.035, 0.035, 1.1, 6), "#e2453c", { y: 1.12, rz: Math.PI / 2, parent: sw });
    const seats = new THREE.Group(); seats.position.y = 1.12; seats.userData.dyn = true; sw.add(seats);
    for (const x of [-0.22, 0.22]) { vm(box(0.01, 0.75, 0.01), "#555555", { x, y: -0.37, parent: seats, shadow: false }); vm(box(0.22, 0.04, 0.16), "#ffd166", { x, y: -0.75, parent: seats, shadow: false }); }
    mergeStatic(seats);
    tickers.push(t => { seats.rotation.x = Math.sin(t * 1.8) * 0.35; });
    const ss = new THREE.Group(); ss.position.set(-0.45, 0, 0.8); ss.rotation.y = 0.6; g.add(ss);
    vm(new THREE.ConeGeometry(0.12, 0.2, 4), "#8a5a3c", { y: 0.1, parent: ss }); vm(box(1.2, 0.05, 0.16), "#c79bff", { y: 0.22, rz: 0.15, parent: ss });
    ex(s, -1.7, 1.35, -1.35, 1.35); slot(s.x - 1.65, s.z + 1.0); slot(s.x + 1.05, s.z - 1.05); slot(s.x - 1.65, s.z - 1.0);
  },
  // 雕像廣場：ㄅㄆㄇ 雕像＋旗子＋花台
  statue(s, g) {
    vm(rbox(2.5, 0.05, 2.5, 0.02), "#e6e0d6", { y: 0.025, parent: g, shadow: false });
    for (const [x, z] of [[-1.0, -1.0], [1.0, -1.0]]) flag(g, s.x + x, s.z + z, x < 0 ? "#5fb4ff" : "#ff6f86");
    for (const [x, z, r] of [[-1.0, 0.55, Math.PI / 2], [0.55, 1.0, 0]]) planter(g, s.x + x, s.z + z, 0.7, r);
    ex(s, -1.35, 1.35, -1.35, 1.35); slot(s.x + 1.0, s.z + 1.0); slot(s.x - 1.0, s.z + 1.05); slot(s.x + 1.05, s.z - 0.3);
  },
  // 寵物公園（台地）：寵物小屋、食盆；超過 MAX_WALK 隻的寵物在這裡休息、輪流出去走
  park(s, g) {
    terrace(s.x, s.z, 1.28, 1.28, 0.4, "#93cf5a");
    const Y = 0.4, hut = new THREE.Group(); hut.position.set(0.55, Y, -0.55); g.add(hut);
    vm(rbox(0.95, 0.65, 0.8, 0.04), "#e8c18a", { y: 0.33, parent: hut });
    const tri = new THREE.Shape(); tri.moveTo(-0.58, 0); tri.lineTo(0.58, 0); tri.lineTo(0, 0.45); tri.closePath();
    const rg = new THREE.ExtrudeGeometry(tri, { depth: 1.0, bevelEnabled: false }); rg.translate(0, 0, -0.5); rg.rotateY(Math.PI / 2);
    vm(rg, "#e2453c", { y: 0.65, parent: hut });
    vm(new THREE.CircleGeometry(0.2, 16), "#4a3424", { x: 0.481, y: 0.28, ry: Math.PI / 2, parent: hut, shadow: false });
    vm(new THREE.CircleGeometry(0.2, 16), "#4a3424", { z: 0.401, y: 0.28, parent: hut, shadow: false });
    sign(hut, "🐾", "#ffd166", 0.49, 0.62, 0, Math.PI / 2);
    for (const [x, z, c] of [[-0.2, 0.35, "#5fb4ff"], [0.15, 0.55, "#ff8fb0"]]) { vm(cyl(0.12, 0.1, 0.07, 14), c, { x, y: Y + 0.035, z, parent: g, shadow: false }); }
    for (let k = 0; k < 6; k++) vm(box(0.05, 0.28, 0.05), "#ffffff", { x: -1.18 + k * 0.47, y: Y + 0.14, z: 1.18, parent: g, shadow: false });
    vm(box(2.4, 0.04, 0.03), "#ffffff", { x: 0, y: Y + 0.24, z: 1.18, parent: g, shadow: false });
    restSlots = [[-0.8, -0.8], [-0.8, 0.0], [-0.8, 0.75], [-0.05, 0.85], [0.75, 0.75], [0.85, 0.1]].map(([x, z]) => ({ x: s.x + x, z: s.z + z }));
    ex(s, -1.35, 1.35, -1.35, 1.35); slot(s.x - 0.1, s.z - 0.95);
  },
  // 旋轉木馬：條紋棚＋會轉的小馬
  carousel(s, g) {
    vm(new THREE.CylinderGeometry(1.2, 1.25, 0.12, 28), "#f0e7d3", { y: 0.06, parent: g });
    vm(cyl(0.08, 0.08, 1.6, 8), "#ffd166", { y: 0.8, parent: g });
    const top = new THREE.Group(); top.position.y = 1.6; top.userData.dyn = true; g.add(top);
    const cone = new THREE.ConeGeometry(1.32, 0.56, 16, 1); const pos = cone.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)), st = Math.floor((a + Math.PI) / (Math.PI / 8)) % 2; _c.set(st ? "#ff8fb0" : "#ffffff"); col.set([_c.r, _c.g, _c.b], i * 3); }
    cone.setAttribute("color", new THREE.BufferAttribute(col, 3)); mesh(cone.toNonIndexed(), vcMat, { y: 0.3, parent: top });
    vm(new THREE.SphereGeometry(0.12, 10, 8), "#ffd166", { y: 0.66, parent: top });
    const ride = new THREE.Group(); ride.userData.dyn = true; g.add(ride);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, h = new THREE.Group(); h.position.set(Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85); h.rotation.y = -a; ride.add(h);
      vm(cyl(0.02, 0.02, 1.5, 5), "#e8e6e1", { y: 0.85, parent: h, shadow: false });
      vm(rbox(0.16, 0.2, 0.42, 0.05), ["#ffffff", "#ffd166", "#5fb4ff", "#ff8fb0", "#c79bff", "#7fd77a"][k], { y: 0.62, parent: h, shadow: false });
      vm(rbox(0.12, 0.2, 0.14, 0.04), ["#ffffff", "#ffd166", "#5fb4ff", "#ff8fb0", "#c79bff", "#7fd77a"][k], { y: 0.78, z: 0.22, parent: h, shadow: false }); }
    mergeStatic(ride); mergeStatic(top);
    tickers.push(t => { ride.rotation.y = t * 0.5; top.rotation.y = t * 0.5; ride.children.forEach(m => { m.position.y = Math.sin(t * 2) * 0.05; }); });
    parkedCar(g, s.x + 1.65, s.z - 0.6, 0, 4);
    ex(s, -1.5, 2.1, -1.4, 1.4); slot(s.x + 1.65, s.z + 0.75); slot(s.x - 1.0, s.z + 1.05); slot(s.x - 1.05, s.z - 1.05);
  },
};
async function buildSpotsKenney() {
  const jobs = [];
  const S = id => SPOTS.find(s => s.id === id);
  // 中央圓環噴水池
  const c = new THREE.Group(); scene.add(c); statics.push(c);
  jobs.push(kenney("fantasy-town-kit", "fountain-round", { scale: 0.5, y: 0.1, parent: c }));
  // 雕像：ㄅㄆㄇ 注音雕像（models.json 有才用；沒有就金色小貓）；公園裡放貓頭鷹雕像
  const st = S("statue"), gold = mat("#f2c14e", { emissive: "#6b4a00", emissiveIntensity: 0.25 });
  jobs.push(usableGlb(MODELS + "statue_bpmf.glb").then(u => u ? loadAny(u, { h: 1.7 }).then(m => { m.position.y = 0.05; m.rotation.y = Math.PI / 4; st.g.add(m); })
    : (vm(rbox(0.95, 0.5, 0.95, 0.04), "#c9c1b6", { y: 0.25, parent: st.g }), kenney("cube-pets", "animal-cat", { scale: 0.62, y: 0.5, ry: Math.PI / 4, parent: st.g, gold }))));
  for (const [x, z, r] of [[-1.0, -0.3, Math.PI / 2], [-0.1, 1.0, 0]]) { jobs.push(kenney("holiday-kit", "bench", { scale: 0.55, x, z, ry: r, parent: st.g })); blob(st.x + x, st.z + z, 0.8); }
  // 公園長椅、遊樂場長椅
  const pg = S("playground"); jobs.push(kenney("holiday-kit", "bench", { scale: 0.55, x: 1.0, z: 1.0, ry: Math.PI, parent: pg.g })); blob(pg.x + 1.0, pg.z + 1.0, 0.8);
  await Promise.all(jobs);
  for (const g of [c, st.g, pg.g]) mergeStatic(g);
  shadowDirty = true;
}

// =========================================================
// 新市區（阿葉 10-11：鎮上加警察局、消防局、醫院；模擬城市的特色；陸續解鎖新區塊）
// 主島北邊（−z）過一座橋的第二座小島：一條直路接橋、一條橫路，四塊地各一棟城市設施。
// 貼紙夠了才開：新市區（橋接上＋警察局）→ 消防局 → 醫院 → 學校；還沒開的地＝工地（鷹架＋吊車）。
// 城市生活：警車在兩座島巡邏（車頂燈閃）；偶爾某棟遊戲建築屋頂冒小火 → 消防車開過去噴水；寵物偶爾跌倒 → 救護車開過去；
// 點設施＝它的車出動（聲音、台詞由 zhuyin.js 的 opts.onCivic 負責）。右邊的「🌉 新市區」按鈕＝鏡頭飛過去
// =========================================================
const DIST = { x: 4.8, z: -18.9, h: 5.2, r: 1.6 };
// 路的西邊（lx<0）建築正面朝 +x＝面向鏡頭；東邊的正面朝路（−x）看不到 → 招牌改放 +z 那面
const CIVIC = [
  { id: "police", need: 30, lx: -2.6, lz: 2.6, ico: "🚓", word: "警察", name: "警察局" },
  { id: "fire", need: 38, lx: -2.6, lz: -2.6, ico: "🚒", word: "消防", name: "消防局" },
  { id: "hospital", need: 46, lx: 2.6, lz: 2.6, ico: "🏥", word: "醫院", name: "醫院" },
  { id: "school", need: 55, lx: 2.6, lz: -2.6, ico: "🏫", word: "學校", name: "學校" },
].map(c => ({ ...c, x: DIST.x + c.lx, z: DIST.z + c.lz }));
const DIST_NEED = CIVIC[0].need;
const sdDist = (x, z) => Math.min(sdRoundBox(x - DIST.x, z - DIST.z, DIST.h, DIST.h, DIST.r), sdRoundBox(x - TEX.x, z - TEX.z, TEX.hx, TEX.hz, TEX.r));   // 新市區＋東邊小半島（10-12 陀螺競技場）
const town = { agent: {}, sickTags: [], open: undefined, bridge: null, gap: null, barrier: null, nav: null, place: "main", off: { x: 0, y: 0 }, tgt: { x: 0, y: 0 }, zoomTgt: 0, fires: [], cars: {}, parked: {}, nextEvent: 0, siren: 0 };
const CAR_YAW = 0;                                     // Kenney 車模型的車頭方向修正（車頭朝 +z＝0）
const civHits = [];
const shut = e => !!(e.town && !town.open) || !!(e.rb && !rb.open);   // 新市區／彩虹島還沒開：橋跟那邊的路都不走
// 第一段（同步）：地、路、橋、路網、四塊地的群組＋點擊盒＋工地
function buildTown() {
  const g = new THREE.Group(); scene.add(g); statics.push(g);
  const { x: cx, z: cz, h, r } = DIST;
  g.add(slab({ hx: h, hz: h, r, top: 0, depth: 0.1, color: P.grass, bevelT: 0.04, bevelS: 0.04, x: cx, z: cz }));
  const wall = slab({ hx: h - 0.03, hz: h - 0.03, r: r - 0.03, top: -0.08, depth: 0.5, color: P.dirt, x: cx, z: cz }); wall.castShadow = true; g.add(wall);
  g.add(slab({ hx: h - 0.06, hz: h - 0.06, r: r - 0.06, top: -0.56, depth: 0.2, color: P.dirtDk, x: cx, z: cz }));
  g.add(slab({ hx: h + 0.7, hz: h + 0.7, r: r + 0.7, top: SAND_Y, depth: 0.4, color: P.sand, bevelT: 0.25, bevelS: 0.55, inset: false, x: cx, z: cz }));
  // 路：直路（接橋）＋橫路，跟主島一樣的車道、人行道、黃色虛線
  const laneM = mat("#8f93a3"), walkM = mat("#e6e2ee"), dashM = mat("#f3c94f"), gapR = RW / 2 + SW, sw = RW / 2 + SW / 2;
  const zN = cz - h + 0.55, zS = cz + h, xW = cx - h + 0.55, xE = cx + h - 0.55;
  const segV = (z0, z1, off, w, hh, m) => mesh(box(w, hh, z1 - z0), m, { x: cx + off, y: hh / 2, z: (z0 + z1) / 2, shadow: false, parent: g });
  const segH = (x0, x1, off, w, hh, m) => mesh(box(x1 - x0, hh, w), m, { x: (x0 + x1) / 2, y: hh / 2, z: cz + off, shadow: false, parent: g });
  segV(zN, zS, 0, RW, 0.045, laneM); segH(xW, xE, 0, RW, 0.045, laneM);
  for (const sd of [-1, 1]) {
    segV(zN, cz - gapR, sd * sw, SW, 0.075, walkM); segV(cz + gapR, zS, sd * sw, SW, 0.075, walkM);
    segH(xW, cx - gapR, sd * sw, SW, 0.075, walkM); segH(cx + gapR, xE, sd * sw, SW, 0.075, walkM);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(SW, 0.075, SW), walkM, { x: cx + sx * sw, y: 0.0375, z: cz + sz * sw, shadow: false, parent: g });
  for (let u = zN + 0.4; u < zS - 0.3; u += 0.62) if (Math.abs(u + 0.15 - cz) > RW * 0.85) mesh(box(0.07, 0.01, 0.3), dashM, { x: cx, y: 0.05, z: u + 0.15, shadow: false, parent: g });
  for (let u = xW + 0.4; u < xE - 0.3; u += 0.62) if (Math.abs(u + 0.15 - cx) > RW * 0.85) mesh(box(0.3, 0.01, 0.07), dashM, { x: u + 0.15, y: 0.05, z: cz, shadow: false, parent: g });
  // 路網：主島 x=4.8 那條路的北端 →（橋）→ 新市區
  const mainEnd = [...graph.nodes.values()].filter(n => Math.abs(n.x - cx) < 0.01 && !n.door).sort((a, b) => a.z - b.z)[0];
  const T = e => { e.town = true; return e; };
  const nS = node(cx, zS), nF = node(cx, cz + 2.6), nX = node(cx, cz), nB = node(cx, cz - 2.6), nN = node(cx, zN), nW = node(xW, cz), nE = node(xE, cz);
  town.ends = { e: nE, w: nW, n: nN };
  T(edge(mainEnd, nS)); T(edge(nS, nF)); T(edge(nF, nX)); T(edge(nX, nB)); T(edge(nB, nN)); T(edge(nW, nX)); T(edge(nX, nE));
  for (const c of CIVIC) {
    const rn = c.lz > 0 ? nF : nB, door = node(cx + Math.sign(c.lx) * (RW / 2 + SW + 0.2), rn.z); door.door = c; T(edge(rn, door, null, true)); c.door = door;
    vm(box(0.4, 0.03, 0.7), "#d9d3ca", { x: door.x, y: 0.03, z: door.z, shadow: false, parent: g });
  }
  // 橋：木頭橋面三段（中段＝還沒開時缺的那段）＋白欄杆＋橋墩；車子在橋上的高度用 terraces 墊
  const z0 = mainEnd.z + 0.2, z1 = zS - 0.05, L = z0 - z1, third = L / 3, bw = RW + 0.5;
  terraces.push({ x0: cx - bw / 2, x1: cx + bw / 2, z0: z1, z1: z0, y: 0.04 });
  const part = (parent, za, zb, withRail = true) => {
    const zc = (za + zb) / 2, len = za - zb;
    mesh(box(bw, 0.1, len + 0.02), mat("#c98a55"), { x: cx, y: 0.03, z: zc, parent });
    mesh(box(RW - 0.1, 0.012, len + 0.02), mat("#9a9fae"), { x: cx, y: 0.086, z: zc, shadow: false, parent });
    if (!withRail) return;
    for (const s of [-1, 1]) {
      mesh(box(0.06, 0.06, len), mat("#f4f1ea"), { x: cx + s * (bw / 2 - 0.04), y: 0.36, z: zc, parent });
      for (let k = 0; k <= Math.round(len / 0.5); k++) mesh(box(0.06, 0.3, 0.06), mat("#f4f1ea"), { x: cx + s * (bw / 2 - 0.04), y: 0.21, z: za - k * len / Math.round(len / 0.5), parent, shadow: false });
    }
  };
  const br = new THREE.Group(); scene.add(br); statics.push(br);
  part(br, z0, z0 - third); part(br, z1 + third, z1);
  for (const zz of [z0 - third, z1 + third]) for (const s of [-1, 1]) mesh(cyl(0.12, 0.14, 1.1, 8), mat("#b58a64"), { x: cx + s * (bw / 2 - 0.2), y: -0.5, z: zz, parent: br });
  town.gap = new THREE.Group(); scene.add(town.gap); part(town.gap, z0 - third, z1 + third);
  // 還沒開：中段缺著，兩頭各擋一道施工路障＋一個三角錐
  town.barrier = new THREE.Group(); scene.add(town.barrier);
  for (const [zz, ry] of [[z0 - third + 0.15, 0], [z1 + third - 0.15, 0]]) {
    const bg = new THREE.Group(); bg.position.set(cx, 0.08, zz); bg.rotation.y = ry; town.barrier.add(bg);
    const geo = box(bw - 0.3, 0.18, 0.05), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (bw - 0.3) / 1.1);
    mesh(geo, fenceMat, { y: 0.4, parent: bg }); mesh(geo, fenceMat, { y: 0.16, parent: bg });
    for (const s of [-1, 1]) mesh(box(0.07, 0.56, 0.07), postMat, { x: s * (bw / 2 - 0.2), y: 0.28, parent: bg });
  }
  town.bridge = { cx, z0, z1, third };
  // 四塊地：建築群組（第二段蓋）＋點擊盒＋工地（鷹架、吊車、沙堆）
  for (const c of CIVIC) {
    const root = new THREE.Group(); root.position.set(c.x, 0, c.z); scene.add(root);
    c.root = root; c.pivot = new THREE.Group(); root.add(c.pivot); c.pivot.visible = false;
    c.site = new THREE.Group(); root.add(c.site);
    const hit = new THREE.Mesh(box(3.0, 2.4, 3.0), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1.2; hit.userData.civic = c; root.add(hit); civHits.push(hit);
    c.anchor = new THREE.Vector3(c.x, 2.35, c.z);
    exRects.push([c.x - 1.7, c.x + 1.7, c.z - 1.7, c.z + 1.7]);
    buildSite(c.site); mergeStatic(c.site);
    blob(c.x, c.z, 3.0, 0);
  }
  for (const [x, z] of [[cx - 4.3, cz + 0.9], [cx + 4.3, cz - 0.9], [cx + 0.9, cz + 4.3]]) slot(x, z);   // 裝飾放置點（原本海灘那三個搬來這裡）
  const tg = new THREE.Group(); scene.add(tg); statics.push(tg);       // 路邊的樹（第一段就種：不用等下載）
  const rnd = rng(31);
  for (let k = 0; k < 40; k++) {
    const x = cx + (rnd() - 0.5) * 2 * (h - 0.5), z = cz + (rnd() - 0.5) * 2 * (h - 0.5);
    if (Math.abs(x - cx) < RW / 2 + SW + 0.3 || Math.abs(z - cz) < RW / 2 + SW + 0.3 || sdDist(x, z) > -0.45) continue;
    if (CIVIC.some(c => Math.abs(x - c.x) < 1.75 && Math.abs(z - c.z) < 1.75) || decorSlots.some(q => Math.hypot(q.x - x, q.z - z) < 0.8)) continue;
    mesh(TREE_GEOS[k % 3 === 0 ? 2 : k % 2], vcMat, { x, y: 0, z, ry: rnd() * 6, parent: tg }).scale.setScalar(0.8 + rnd() * 0.3); blob(x, z, 0.9, 0);
  }
  // ----- 10-12 東邊小半島（陀螺競技場）：地形跟新市區同一套四層板、橫路往東延伸到路底、路底一塊圓形廣場接競技場入口、邊上幾棵樹 -----
  {
    const { x: ex, z: ez, hx, hz, r: er } = TEX, ar = DEFS.find(d => d.mode === "tops"), xR = ar.x - 2.75;   // xR：路底（競技場入口拱門前面）
    g.add(slab({ hx, hz, r: er, top: 0, depth: 0.1, color: P.grass, bevelT: 0.04, bevelS: 0.04, x: ex, z: ez }));
    const w2 = slab({ hx: hx - 0.03, hz: hz - 0.03, r: er - 0.03, top: -0.08, depth: 0.5, color: P.dirt, x: ex, z: ez }); w2.castShadow = true; g.add(w2);
    g.add(slab({ hx: hx - 0.06, hz: hz - 0.06, r: er - 0.06, top: -0.56, depth: 0.2, color: P.dirtDk, x: ex, z: ez }));
    g.add(slab({ hx: hx + 0.7, hz: hz + 0.7, r: er + 0.7, top: SAND_Y, depth: 0.4, color: P.sand, bevelT: 0.25, bevelS: 0.55, inset: false, x: ex, z: ez }));
    segH(xE, xR, 0, RW, 0.045, laneM);
    for (const sd of [-1, 1]) segH(xE, xR, sd * sw, SW, 0.075, walkM);
    for (let u = xE + 0.3; u < xR - 0.3; u += 0.62) mesh(box(0.3, 0.01, 0.07), dashM, { x: u + 0.15, y: 0.05, z: cz, shadow: false, parent: g });
    const plz = cyl(0.95, 0.95, 0.06, 28); mesh(plz, walkM, { x: xR + 0.45, y: 0.03, z: cz, shadow: false, parent: g });   // 入口前的圓形廣場
    const nR = node(xR, cz), door = node(xR + 0.62, cz); door.door = ar; ar.doorNode = door;
    T(edge(nE, nR)); T(edge(nR, door, null, true));
    const rt = rng(53);
    for (let k = 0; k < 60; k++) {                       // 樹：半島邊上（避開路、競技場一圈、新市區那邊已經種過的）
      const x = ex + (rt() - 0.5) * 2 * (hx - 0.4), z = ez + (rt() - 0.5) * 2 * (hz - 0.4);
      const dx = x - ar.x, dz = z - ar.z;                 // 鏡頭那一側（+x+z）多讓一圈：樹不要擋住看台
      if (x < DIST.x + h + 0.3 || sdDist(x, z) > -0.45 || Math.hypot(dx, dz) < (dx + dz > -0.5 ? 3.3 : 2.35) || (Math.abs(z - cz) < RW / 2 + SW + 0.35 && x < xR + 1.5)) continue;
      if (treeXZ.some(([a, b]) => Math.hypot(a - x, b - z) < 0.8)) continue;
      treeXZ.push([x, z]); mesh(TREE_GEOS[k % 3 === 0 ? 2 : k % 2], vcMat, { x, y: 0, z, ry: rt() * 6, parent: tg }).scale.setScalar(0.75 + rt() * 0.3); blob(x, z, 0.9, 0);
    }
  }
}
// 工地：灰色地基＋鷹架＋黃色吊車＋沙堆＋三角錐（未解鎖時看到這個）
function buildSite(g) {
  vm(rbox(2.3, 0.12, 2.0, 0.04), "#c9c4bb", { y: 0.06, parent: g });
  for (const [x, z] of [[-1, -0.85], [1, -0.85], [-1, 0.85], [1, 0.85]]) vm(box(0.06, 1.3, 0.06), "#f2a33a", { x, y: 0.75, z, parent: g, shadow: false });
  for (const y of [0.55, 1.05]) { vm(box(2.06, 0.05, 0.05), "#f2a33a", { y, z: 0.85, parent: g, shadow: false }); vm(box(0.05, 0.05, 1.76), "#f2a33a", { x: 1, y, parent: g, shadow: false }); vm(box(2.1, 0.04, 0.3), "#a8673f", { y: y - 0.02, z: 0.85, parent: g, shadow: false }); }
  vm(box(0.12, 2.3, 0.12), "#ffcc33", { x: -0.75, y: 1.15, z: -0.55, parent: g });
  vm(box(1.9, 0.1, 0.12), "#ffcc33", { x: -0.15, y: 2.3, z: -0.55, parent: g });
  vm(box(0.03, 0.7, 0.03), "#555b66", { x: 0.65, y: 1.93, z: -0.55, parent: g, shadow: false });
  vm(rbox(0.26, 0.2, 0.26, 0.03), "#c9c4bb", { x: 0.65, y: 1.5, z: -0.55, parent: g, shadow: false });
  const pile = new THREE.ConeGeometry(0.42, 0.36, 9); vm(pile, "#e8c48a", { x: 0.55, y: 0.18, z: 0.35, parent: g, shadow: false });
  sign(g, "🚧", "#ffcc33", 1.16, 0.55, 0.0, Math.PI / 2);
}
// 第二段（要下載的）：四棟設施＋停在門口的車
async function buildTownKenney() {
  await Promise.all(CIVIC.map(c => CIVIC_BUILD[c.id](c, c.pivot).then(() => { noDynShadow(c.pivot); mergeStatic(c.pivot); c.ready = true; }).catch(e => { c.failed = true; console.warn("[hub3d] 設施", c.id, e); })));
  // Kenney 車：縮成指定長度、腳踩地、車頂放紅藍警示燈（平常關著）
  const make = async (name, len) => {
    const holder = new THREE.Group(), m = await kenney("car-kit", name, { parent: holder, shadow: false });
    let b = new THREE.Box3().setFromObject(m); m.scale.multiplyScalar(len / Math.max(b.max.x - b.min.x, b.max.z - b.min.z)); m.rotation.y = CAR_YAW;
    b = new THREE.Box3().setFromObject(m); m.position.y = -b.min.y;
    const L = sirenLights(holder, b.max.y - b.min.y + 0.03); L.r.visible = L.b.visible = false; holder.userData.lights = L; return holder;
  };
  const [pol, fir, amb, polP] = await Promise.all([make("police", 1.25), make("firetruck", 1.6), make("ambulance", 1.45), make("police", 1.25)]);
  if (dead) return;
  // 停車：消防車停在車庫前、救護車停在醫院門口、一台警車停在警察局前；出任務的就是停著的那台（回來再停回原位）
  town.cars = { fire: fir, hospital: amb };
  for (const [id, car, dx, dz, ry] of [["fire", fir, 1.15, 0.45, Math.PI / 2], ["hospital", amb, -0.15, 1.45, Math.PI / 2], ["police", polP, 1.05, 0.95, Math.PI / 2]]) {
    const c = CIVIC.find(q => q.id === id); car.position.set(c.x + dx, 0, c.z + dz); car.rotation.y = ry; scene.add(car); town.parked[id] = car; car.userData.home = { x: car.position.x, z: car.position.z, ry };
  }
  scene.add(pol);                                      // 巡邏警車：路上跑的那台
  const a = { kind: "car", id: "police", holder: pol, speed: 0.8, lane: LANE + 0.02, r: 0.62, pause: 0, wait: 0, yaw: 0, patrol: true };
  placeAgent(a, "car"); agents.push(a); town.patrol = a;
  syncTown(false);
}
// 車頂警示燈：紅藍兩顆，update 時輪流亮
function sirenLights(holder, y) {
  const r = mesh(box(0.14, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: "#ff3b3b", toneMapped: false }), { x: -0.09, y, parent: holder, shadow: false });
  const b = mesh(box(0.14, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: "#3b7bff", toneMapped: false }), { x: 0.09, y, parent: holder, shadow: false });
  return { r, b };
}
// ----- 四棟設施（程式生成，跟主島建築同一套小工具） -----
function windows(p, x0, x1, y, z, n, face = "z", col = "#bfe3f3") {
  for (let k = 0; k < n; k++) { const u = x0 + (x1 - x0) * (k + 0.5) / n; if (face === "z") vm(box(0.22, 0.24, 0.03), col, { x: u, y, z, parent: p, shadow: false }); else vm(box(0.03, 0.24, 0.22), col, { x: z, y, z: u, parent: p, shadow: false }); }
}
const CIVIC_BUILD = {
  // 警察局：藍白兩層樓、門口台階、屋頂紅藍燈、旗桿
  async police(c, p) {
    vm(rbox(1.9, 1.5, 1.7, 0.05), "#eef2f8", { y: 0.75, parent: p });
    vm(box(1.92, 0.22, 1.72), "#2f5fbf", { y: 1.42, parent: p });
    vm(box(1.92, 0.1, 1.72), "#2f5fbf", { y: 0.62, parent: p, shadow: false });
    vm(rbox(2.05, 0.12, 1.85, 0.04), "#24324a", { y: 1.58, parent: p });
    windows(p, -0.7, 0.7, 1.05, 0.96, 4, "x"); windows(p, -0.75, 0.75, 1.05, 0.87, 4, "z"); windows(p, -0.75, 0.75, 0.3, 0.87, 2, "z");
    vm(box(0.04, 0.6, 0.5), "#2f5fbf", { x: 0.97, y: 0.3, z: 0, parent: p, shadow: false });
    vm(box(0.05, 0.5, 0.38), "#9fc4ff", { x: 0.98, y: 0.28, z: 0, parent: p, shadow: false });
    vm(box(0.3, 0.06, 0.8), "#c9c4bb", { x: 1.1, y: 0.03, z: 0, parent: p, shadow: false });
    sign(p, "👮", "#2f5fbf", 0.97, 1.25, -0.55, Math.PI / 2); sign(p, "🚓", "#2f5fbf", 0.5, 1.25, 0.87, 0);
    const lt = new THREE.Group(); lt.position.set(0, 1.66, 0); lt.userData.dyn = true; p.add(lt); c.lights = sirenLights(lt, 0.04);
    vm(cyl(0.025, 0.03, 1.5, 6), "#e8e6e1", { x: -0.95, y: 0.75, z: 0.95, parent: p });
    vm(box(0.02, 0.26, 0.4), "#2f5fbf", { x: -0.95, y: 1.36, z: 1.16, parent: p, shadow: false });
  },
  // 消防局：紅色、兩個大車庫門（朝路＝朝鏡頭）、旁邊高高的曬水管塔、警鈴
  async fire(c, p) {
    vm(rbox(1.7, 1.25, 1.9, 0.05), "#d9463b", { y: 0.62, parent: p });
    vm(rbox(1.85, 0.12, 2.05, 0.04), "#7a2a24", { y: 1.3, parent: p });
    for (const z of [-0.45, 0.45]) { vm(box(0.04, 0.8, 0.72), "#ffffff", { x: 0.86, y: 0.4, z, parent: p, shadow: false }); for (let k = 0; k < 5; k++) vm(box(0.045, 0.1, 0.62), k % 2 ? "#c7ccd6" : "#dde2ea", { x: 0.87, y: 0.1 + k * 0.14, z, parent: p, shadow: false }); }
    vm(box(0.45, 0.04, 1.8), "#c9c4bb", { x: 1.1, y: 0.02, z: 0, parent: p, shadow: false });
    windows(p, -0.6, 0.6, 1.0, 0.96, 3, "z");
    vm(rbox(0.5, 2.3, 0.5, 0.04), "#c23a30", { x: -0.6, y: 1.15, z: -0.75, parent: p });
    vm(rbox(0.62, 0.12, 0.62, 0.03), "#7a2a24", { x: -0.6, y: 2.34, z: -0.75, parent: p });
    for (let k = 0; k < 6; k++) vm(box(0.03, 0.03, 0.3), "#f4f1ea", { x: -0.34, y: 0.4 + k * 0.3, z: -0.75, parent: p, shadow: false });
    sign(p, "🚒", "#d9463b", 0.87, 1.05, 0, Math.PI / 2);
    const bell = vm(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#f2c14e", { x: 0.3, y: 1.62, z: 0.6, parent: p }); bell.rotation.x = Math.PI;
    vm(box(0.04, 0.3, 0.04), "#24324a", { x: 0.3, y: 1.5, z: 0.6, parent: p, shadow: false });
  },
  // 醫院：白色三層、屋頂紅十字＋停機坪、藍窗、救護車停車格（招牌在 +z、+x 兩面）
  async hospital(c, p) {
    vm(rbox(1.8, 2.0, 1.9, 0.05), "#f7f8fb", { y: 1.0, parent: p });
    vm(box(1.82, 0.1, 1.92), "#5fb4ff", { y: 0.68, parent: p, shadow: false }); vm(box(1.82, 0.1, 1.92), "#5fb4ff", { y: 1.36, parent: p, shadow: false });
    vm(rbox(1.92, 0.1, 2.02, 0.03), "#c9ced8", { y: 2.04, parent: p });
    for (const y of [0.35, 1.02, 1.7]) { windows(p, -0.65, 0.65, y, 0.96, 4, "z", "#9fd3ff"); windows(p, -0.7, 0.7, y, 0.91, 4, "x", "#9fd3ff"); }
    vm(cyl(0.55, 0.55, 0.02, 24), "#5b6475", { y: 2.1, parent: p, shadow: false });
    vm(box(0.08, 0.02, 0.4), "#ffffff", { x: -0.12, y: 2.115, parent: p, shadow: false }); vm(box(0.08, 0.02, 0.4), "#ffffff", { x: 0.12, y: 2.115, parent: p, shadow: false }); vm(box(0.24, 0.02, 0.07), "#ffffff", { y: 2.116, parent: p, shadow: false });
    const cross = new THREE.Group(); cross.position.set(0.55, 1.78, 0.98); p.add(cross);
    vm(box(0.36, 0.12, 0.04), "#e53935", { parent: cross, shadow: false }); vm(box(0.12, 0.36, 0.04), "#e53935", { parent: cross, shadow: false });
    sign(p, "🏥", "#e53935", 0.92, 1.72, 0.45, Math.PI / 2);
    vm(box(0.6, 0.5, 0.04), "#9fd3ff", { x: -0.2, y: 0.25, z: 0.96, parent: p, shadow: false });
    vm(box(0.9, 0.06, 0.5), "#f4f1ea", { x: -0.2, y: 0.55, z: 1.15, parent: p });
  },
  // 學校：奶油色長型兩層＋橘紅屋頂＋鐘塔＋操場跑道＋三角旗串
  async school(c, p) {
    vm(rbox(2.0, 1.3, 1.3, 0.05), "#f3e6c8", { y: 0.65, z: -0.2, parent: p });
    const tri = new THREE.Shape(); tri.moveTo(-0.72, 0); tri.lineTo(0.72, 0); tri.lineTo(0, 0.5); tri.closePath();
    const rg = new THREE.ExtrudeGeometry(tri, { depth: 2.1, bevelEnabled: false }); rg.rotateY(Math.PI / 2); rg.translate(-1.05, 0, 0);
    vm(rg, "#e0703a", { y: 1.3, z: -0.2, parent: p });
    for (const y of [0.35, 0.95]) windows(p, -0.8, 0.8, y, 0.46, 5, "z", "#bfe3f3");
    vm(rbox(0.6, 0.5, 0.6, 0.04), "#f3e6c8", { y: 1.85, z: -0.2, parent: p });
    vm(new THREE.ConeGeometry(0.48, 0.5, 4), "#e0703a", { y: 2.35, z: -0.2, ry: Math.PI / 4, parent: p });
    vm(cyl(0.2, 0.2, 0.03, 20), "#ffffff", { y: 1.9, z: 0.11, rx: Math.PI / 2, parent: p, shadow: false });
    vm(box(0.02, 0.14, 0.01), "#24324a", { y: 1.94, z: 0.13, parent: p, shadow: false }); vm(box(0.1, 0.02, 0.01), "#24324a", { x: 0.04, y: 1.9, z: 0.13, parent: p, shadow: false });
    const track = new THREE.RingGeometry(0.45, 0.62, 24); track.rotateX(-Math.PI / 2); vm(track, "#d9724a", { x: 0.1, y: 0.02, z: 0.95, parent: p, shadow: false });
    sign(p, "🏫", "#e0703a", 0.6, 1.0, 0.46, 0);
    stringLights(p, [[-0.95, 0.5], [-0.95, 1.2], [1.05, 1.2]], 0.7);
  },
};
// 鎖定狀態：貼紙數 → 新市區開不開、每棟設施開不開（animate＝剛剛解鎖：播一段）
function syncTown(animate) {
  const n = opts.stickers ? opts.stickers() : 0, open = n >= DIST_NEED;
  if (town.open !== open) {
    const was = town.open; town.open = open;
    if (!open) for (const a of agents) if (!a.vip && a.e && a.e.town) placeAgent(a, a.kind);   // 換成貼紙少的存檔位：在新市區的寵物、車搬回主島（不然困在那邊來回）
    if (open && animate && was === false) { bridgeRise(); try { opts.onCivic("townOpen", {}); } catch (e) {} } else { town.gap.visible = open; town.gap.position.y = 0; town.barrier.visible = !open; }
  }
  for (const c of CIVIC) {
    const locked = n < c.need;
    if (c.locked === locked && c.shown) continue;
    const first = c.locked === undefined; c.locked = locked;
    if (!c.ready) continue;                            // 模型還沒好：buildTownKenney 最後會再呼叫一次
    c.shown = true;
    if (locked) { c.pivot.visible = false; c.site.visible = true; }
    else if (animate && !first) { c.site.visible = false; c.pivot.visible = true; popIn(c.pivot, 200); try { opts.onCivic("built", { name: c.name, id: c.id }); } catch (e) {} }   // 剛蓋好：主程式宣告＋🏙️ 鈕亮
    else { c.pivot.visible = true; c.site.visible = false; }
    if (town.parked[c.id]) town.parked[c.id].visible = !locked;
  }
  if (town.patrol) { town.patrol.holder.visible = !CIVIC[0].locked; if (CIVIC[0].locked) town.patrol.e = null; else if (!town.patrol.e) placeAgent(town.patrol, "car"); }
  shadowDirty = true; syncTownTags();
}
function bridgeRise() {
  town.gap.visible = true; const t0 = performance.now();
  anims.add({ update(now) { const u = Math.min(1, (now - t0) / 900); town.gap.position.y = -1.3 * (1 - easeOutBack(u)); town.barrier.scale.y = Math.max(0.001, 1 - u); if (u >= 1) { town.barrier.visible = false; town.barrier.scale.y = 1; shadowDirty = true; } return u < 1; } });
}
// ----- 浮標（設施名字）＋右邊的「新市區／回小島」按鈕 -----
function makeTownTags() {
  for (const c of CIVIC) {
    const t = document.createElement("button"); t.className = "hub-tag civic"; t.type = "button";
    t.innerHTML = TAG_HTML;                              // 跟遊戲浮標一樣：平常圓形圖示，拉近／按住才展開名字（10-12）
    t.querySelector(".ht-ico").textContent = c.ico; t.querySelector(".ht-word").textContent = c.word;
    t.addEventListener("pointerdown", () => pressTag(t)); t.addEventListener("pointerup", () => releaseTag(true)); t.addEventListener("pointercancel", () => releaseTag(false));
    t.addEventListener("click", () => tapCivic(c)); tagLayer.appendChild(t); c.tag = t; if (tagRO) tagRO.observe(t);   // 大小變了（展開／鎖頭）才重量
  }
  town.nav = true;                                    // 「新市區／回小島」按鈕在 zhuyin.html（#townBtn），狀態用 opts.onPlace 通知
  syncTownTags();
}
function syncTownTags() {
  if (!town.nav) return;
  for (const c of CIVIC) { if (!c.tag) continue; const lk = c.tag.querySelector(".ht-lock"), txt = c.locked ? `🔒 ${c.need}` : ""; if (lk.textContent !== txt) lk.textContent = txt; c.tag.classList.toggle("locked", !!c.locked); }
  tagLayer.classList.toggle("in-town", town.place !== "main");   // 不在主島：主島浮標收起來
  tagLayer.classList.toggle("at-town", town.place === "town"); tagLayer.classList.toggle("at-rainbow", town.place === "rainbow");
  try { opts.onPlace(town.place, !!town.open, { town: !!town.open, rainbow: !!rb.open }); } catch (e) {}
  syncSigns();                                         // 路牌：還沒開的島 🔒
}
function placeTownTags() {
  if (town.place !== "town") return;                   // 不在新市區：設施浮標是 display:none，不用每格量
  const W = innerWidth, H = innerHeight;
  for (const c of CIVIC) {
    if (!c.tag) continue;
    setOpen(c.tag, wantOpen(c.tag));                    // 浮標精簡（10-12）：拉近／按住才展開名字（LOD 狀態是上一格 placeTags 算的）
    if (tagLive() || c.tw0 === undefined) { c.tw0 = c.tag.offsetWidth; c.th0 = c.tag.offsetHeight; }   // 大小變了才重量（展開的 0.2 秒跟著變寬、一直置中）
    const w = c.tw0, h = c.th0;
    _v.copy(c.anchor).project(camera); const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
    const off = x < -w || x > W + w || y < -h || y > H + h; c.tag.style.visibility = off ? "hidden" : "";
    if (!off) c.tag.style.translate = `${(x - w / 2).toFixed(1)}px ${(y - h - TAIL).toFixed(1)}px`;   // 位置放 translate（transform 留給輕跳、拉遠縮小）
    c.rect = off ? null : { x0: x - w / 2, x1: x + w / 2, y0: y - h - TAIL, y1: y - TAIL };   // 路牌浮標要讓開（10-12）
  }
}
// 鏡頭飛去新市區／彩虹島／回小島：在擺好的鏡頭上加一個偏移（相機座標），慢慢滑過去；太陽（陰影範圍）跟著移
// p＝"main"｜"town"｜"rainbow"（10-12 起三個地點）；地點中心（鏡頭對準、太陽跟過去的點）：
// zoomL／land＝橫式用的放大倍數、鏡頭再往鏡頭方向（+x+z）偏多少：彩虹島南邊有碼頭和貨船、北排浮標又高，橫式畫面矮 → 小一點、往上挪一點
// 10-12 歸仁區多了東邊小半島（陀螺競技場）：鏡頭中心往東挪、拉遠一點，新市區＋半島整片都放得進畫面
const PLACE = { main: { x: 0, z: 0, zoom: 1 }, town: { x: DIST.x + 2.3, z: DIST.z + 0.2, zoom: 1.08, zoomL: 1.16 }, rainbow: { x: RB.x + 0.2, z: RB.z + 0.9, zoom: 1.2, zoomL: 1.05, land: 0.4 } };
const placeZoom = P => innerWidth > innerHeight && P.zoomL ? P.zoomL : P.zoom;
function goPlace(p) {
  if (!PLACE[p]) p = "main";
  deselect();                                            // 換島＝介紹卡收起來（清單選別座島的遊戲：pickMode 飛過去之後再選）
  if (town.place === "rainbow" && p !== "rainbow") rb.awake = performance.now() + 3000;   // 離開彩虹島：動畫再跑 3 秒（鏡頭還在滑）
  town.place = p; town.off.x += user.px; town.off.y += user.py; user.px = user.py = 0; town.zoomTgt = placeZoom(PLACE[p]); syncTownTags();   // 拖過的量併進偏移、一起滑過去（不會跳一下）
  town.sunFrom = [sun.target.position.x, sun.target.position.z]; town.offFrom = [town.off.x, town.off.y];   // 太陽從現在的位置慢慢移到新地點
  if (p === "main") town.tgt.x = town.tgt.y = 0;
  try { opts.onCivic(p === "town" ? (town.open ? "town" : "townLocked") : p === "rainbow" ? (rb.open ? "rainbow" : "rainbowLocked") : "main", { need: p === "rainbow" ? RAINBOW_NEED : DIST_NEED }); } catch (e) {}
}
function stepPlace(dt) {
  const P0 = PLACE[town.place] || PLACE.main;
  if (town.place !== "main") {                         // 每格算：轉向後鏡頭重新擺過也對得上；島的中心放在上下介面之間的中線（直式上面有貼紙那排，不能放正中間）
    const b = innerWidth > innerHeight ? P0.land || 0 : 0; _v.set(P0.x + b, 0.8, P0.z + b).applyMatrix4(baseCam.matrixWorldInverse);
    town.tgt.x = _v.x - view.cx; town.tgt.y = _v.y - view.cy + ((view.placeY ?? innerHeight / 2) - innerHeight / 2) / (view.k * placeZoom(P0));
  }
  const k = 1 - Math.exp(-dt * 3.2), ox = town.off.x, oy = town.off.y;
  if (town.zoomTgt) { user.zoom += (town.zoomTgt - user.zoom) * k; if (Math.abs(town.zoomTgt - user.zoom) < 0.003) { user.zoom = town.zoomTgt; town.zoomTgt = 0; } }
  town.off.x += (town.tgt.x - town.off.x) * k; town.off.y += (town.tgt.y - town.off.y) * k;
  if (Math.abs(town.tgt.x - town.off.x) + Math.abs(town.tgt.y - town.off.y) < 0.02) { town.off.x = town.tgt.x; town.off.y = town.tgt.y; }   // 差一點點就直接到位（太陽也剛好停在目的地）
  if (Math.abs(town.off.x - ox) + Math.abs(town.off.y - oy) > 0.002) {
    const [sx0, sz0] = town.sunFrom || [0, 0], [fx0, fy0] = town.offFrom || [0, 0];
    const tot = Math.hypot(town.tgt.x - fx0, town.tgt.y - fy0), rem = Math.hypot(town.tgt.x - town.off.x, town.tgt.y - town.off.y);
    const f = tot > 1e-3 ? Math.min(1, Math.max(0, 1 - rem / tot)) : 1, cx = town.place === "main" ? 0 : P0.x, cz = town.place === "main" ? 0 : P0.z;
    const tx = sx0 + (cx - sx0) * f, tz = sz0 + (cz - sz0) * f;
    sun.position.set(-7 + tx, 15, 6 + tz); sun.target.position.set(tx, 0, tz); sun.target.updateMatrixWorld(); shadowDirty = true;
  }
}
// ----- 點設施：它的車出動 -----
function tapCivic(c) {
  if (!c || c.failed) return;
  const now = performance.now(); if (now < tapLockUntil) return; tapLockUntil = now + 700;
  if (c.locked) { try { opts.onCivic("locked", { need: c.need, name: c.name }); } catch (e) {} bounceCivic(c, true); return; }
  bounceCivic(c, false);
  try { opts.onCivic(c.id, { name: c.name }); } catch (e) {}
  if (c.id === "police" && town.patrol) town.siren = performance.now() + 9000;
  else if (c.id === "fire") { const f = town.fires.find(q => !q.truck); if (f) dispatchFire(f); else drill("fire"); }
  else if (c.id === "hospital") { if (!sickPet()) drill("hospital"); }
}
function bounceCivic(c, shake) { bounce({ pivot: c.locked ? c.site : c.pivot, tag: c.tag }, shake); }
// ----- 出任務的車（消防車、救護車）：路網 BFS 找整條路，照著開；別的車會讓（vip） -----
function routePath(from, to) {
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) { const c = q.shift(); if (c === to) break; for (const e of c.edges) { if (shut(e)) continue; const o = e.a === c ? e.b : e.a; if (!prev.has(o) && (!o.door || o === to)) { prev.set(o, [c, e]); q.push(o); } } }
  if (!prev.has(to)) return null;
  const out = []; let c = to; while (prev.get(c)) { const [pc, e] = prev.get(c); out.unshift({ e, fwd: e.a === pc }); c = pc; }
  return out;
}
function launch(id, target, onArrive) {
  const c = CIVIC.find(q => q.id === id), car = town.cars[id];
  if (!c || c.locked || !car || town[id + "Busy"] || !town.open) return false;
  const path = routePath(c.door, target); if (!path || !path.length) return false;
  town[id + "Busy"] = true; car.visible = true;
  const a = { kind: "car", id: id + "-go", holder: car, speed: 2.0, parking: false, lane: LANE + 0.02, r: 0.7, pause: 0, wait: 0, yaw: 0, vip: true, siren: true, path: path.slice(1), onArrive };
  Object.assign(a, { e: path[0].e, fwd: path[0].fwd, s: 0, x: c.door.x, z: c.door.z, hx: 0, hz: 1 });
  agents.push(a); town.agent[id] = a; return a;
}
// 演習中的車臨時改去真的現場（從下一個路口開始重找路）
function reroute(a, target, onArrive) {
  if (a.parking) return false;
  const here = a.fwd ? a.e.b : a.e.a, path = routePath(here, target); if (!path) return false;
  a.drill = false; a.siren = true; a.onArrive = onArrive;
  if (a.arrived) { Object.assign(a, { arrived: false, pause: 0, e: path[0].e, fwd: path[0].fwd, s: 0, path: path.slice(1) }); } else a.path = path;
  return true;
}
function sendHome(a, id) {
  const c = CIVIC.find(q => q.id === id), here = a.fwd ? a.e.b : a.e.a, path = routePath(here, c.door);
  const park = () => later(() => {                     // 停回原位（下一格再拿掉：這時還在 stepAgents 的迴圈裡）
    const i = agents.indexOf(a); if (i >= 0) agents.splice(i, 1); if (town.agent[id] === a) town.agent[id] = null;
    const h = a.holder.userData.home; a.holder.position.set(h.x, 0, h.z); a.holder.rotation.y = h.ry; a.holder.userData.lights.r.visible = a.holder.userData.lights.b.visible = false; town[id + "Busy"] = false; shadowDirty = true;
  }, 0);
  if (!path || !path.length) { park(); return; }
  Object.assign(a, { e: path[0].e, fwd: path[0].fwd, s: 0, path: path.slice(1), arrived: false, pause: 0, siren: false, onArrive: a2 => { a2.parking = true; park(); } });
}
// 消防演習／救護車出勤（沒有事件時點設施）：在新市區開到路底再回來（短短一趟；真的有事時改道過去）
function drill(id) {
  const a = launch(id, id === "fire" ? town.ends.e : town.ends.w, a => later(() => { if (a.drill) sendHome(a, id); }, 1000));
  if (a) a.drill = true;
}
// ----- 小火災：遊戲建築屋頂冒火＋煙，浮標旁出現「🔥」可以點 → 消防車出動；6 秒沒人點也會自己出動 -----
const fireM = [new THREE.MeshBasicMaterial({ color: "#ff7a2f", toneMapped: false }), new THREE.MeshBasicMaterial({ color: "#ffd23f", toneMapped: false })];
function startFire(d) {
  if (!d.anchorBox || town.fires.some(f => f.d === d)) return null;
  const top = d.anchorBox.max.y, cx = (d.anchorBox.min.x + d.anchorBox.max.x) / 2, cz = (d.anchorBox.min.z + d.anchorBox.max.z) / 2;
  const g = new THREE.Group(); g.position.set(cx, top - 0.05, cz); scene.add(g);
  const flames = [[0, 0, 0.5], [0.26, 0.12, 0.34], [-0.24, -0.1, 0.38]].map(([x, z, s], i) => { const m = mesh(new THREE.ConeGeometry(s * 0.6, s * 1.6, 7), fireM[i % 2], { x, y: s * 0.8, z, parent: g, shadow: false }); m.userData.s = s; return m; });
  const smokeM = new THREE.MeshLambertMaterial({ color: "#8f97a3", transparent: true, opacity: 0.7, depthWrite: false });
  const puffs = [0, 1, 2, 3].map(k => mesh(new THREE.IcosahedronGeometry(0.16, 0), smokeM, { parent: g, shadow: false }));
  const f = { d, g, flames, puffs, smokeM, power: 1, t0: performance.now(), truck: null };
  f.tick = (t) => {
    flames.forEach((m, i) => { const s = (0.8 + Math.sin(t * 9 + i * 2) * 0.2) * f.power; m.scale.set(s, s * (1 + Math.sin(t * 13 + i) * 0.15), s); m.visible = f.power > 0.02; });
    puffs.forEach((m, k) => { const u = (t * 0.35 + k / 4) % 1; m.position.set(Math.sin(k * 2.1 + t * 0.6) * 0.15, 0.4 + u * 1.3, Math.cos(k * 1.7) * 0.12); m.scale.setScalar((0.6 + u * 1.4) * Math.max(0.15, f.power)); });
    smokeM.color.set(f.power < 0.5 ? "#e8edf2" : "#8f97a3"); smokeM.opacity = 0.7 * (1 - (f.outAt ? Math.min(1, (performance.now() - f.outAt) / 1500) : 0));
  };
  tickers.push(f.tick);
  const tag = document.createElement("button"); tag.className = "hub-fire"; tag.type = "button"; tag.textContent = "🔥";
  tag.setAttribute("aria-label", "失火了，叫消防車"); tag.addEventListener("click", () => { try { opts.onCivic("fireTap", {}); } catch (e) {} dispatchFire(f); });
  tagLayer.appendChild(tag); f.tag = tag;
  town.fires.push(f); later(() => dispatchFire(f), 3000);
  try { opts.onCivic("fireStart", { mode: d.mode }); } catch (e) {}
  return f;
}
function dispatchFire(f) {
  if (f.truck || f.out || !town.fires.includes(f)) return;
  const door = [...graph.nodes.values()].find(n => n.door === f.d); if (!door) return;
  const busy = town.agent.fire;
  if (busy && busy.drill && reroute(busy, door, a => spray(f, a))) { f.truck = busy; if (f.tag) f.tag.classList.add("called"); return; }
  const a = launch("fire", door, a => spray(f, a));
  if (!a) { if ((f.tries = (f.tries || 0) + 1) > 12) { f.power = 0; putOut(f); return; } later(() => dispatchFire(f), 2500); return; }   // 派不出車（換了存檔位、橋關了）：30 秒後火自己熄，不會一直卡著
  f.truck = a; if (f.tag) f.tag.classList.add("called");
}
// 噴水：一串水珠從消防車畫弧線到火上，2.8 秒內火變小、煙變白 → 熄滅、亮晶晶 → 消防車回家
function spray(f, a) {
  const wM = new THREE.MeshBasicMaterial({ color: "#7cc8ff", transparent: true, opacity: 0.85, toneMapped: false }), drops = [];
  for (let k = 0; k < 14; k++) drops.push(mesh(new THREE.SphereGeometry(0.06, 6, 4), wM, { parent: scene, shadow: false }));
  const t0 = performance.now(), from = new THREE.Vector3(a.x, 0.75, a.z), to = f.g.position.clone().add(new THREE.Vector3(0, 0.25, 0));
  try { opts.onCivic("spray", {}); } catch (e) {}
  anims.add({ update(now) {
    const u = (now - t0) / 2800;
    drops.forEach((m, k) => { const s = ((now / 700) + k / drops.length) % 1; m.position.lerpVectors(from, to, s); m.position.y += Math.sin(Math.PI * s) * 1.1; m.visible = u < 1; });
    f.power = Math.max(0, 1 - u);
    if (u >= 1) { drops.forEach(m => { scene.remove(m); m.geometry.dispose(); }); wM.dispose(); putOut(f); later(() => sendHome(a, "fire"), 700); return false; }
    return true;
  } });
}
function putOut(f) {
  f.out = true; f.outAt = performance.now(); if (f.tag) { f.tag.remove(); f.tag = null; }
  try { opts.onCivic("fireOut", { mode: f.d.mode }); } catch (e) {}
  later(() => { const i = tickers.indexOf(f.tick); if (i >= 0) tickers.splice(i, 1); scene.remove(f.g); f.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); f.smokeM.dispose(); town.fires.splice(town.fires.indexOf(f), 1); }, 1600);
}
function placeFireTags() {
  const W = innerWidth, H = innerHeight;
  for (const f of town.fires) { if (!f.tag) continue; _v.copy(f.g.position).add({ x: 0, y: 0.5, z: 0 }).project(camera); f.tag.style.transform = `translate3d(${((_v.x + 1) / 2 * W + 34).toFixed(1)}px, ${((1 - _v.y) / 2 * H - 20).toFixed(1)}px, 0)`; }   // 火的右邊：不擋浮標、也看得到火
}
// ----- 寵物不舒服：停下來頭上冒 🤕 → 救護車開到最近的路口 → 愛心、繼續走 -----
function sickPet() {
  const c = CIVIC.find(q => q.id === "hospital"); if (!c || c.locked || town.hospitalBusy) return false;
  const cand = agents.filter(a => a.kind === "pet" && a.e && !a.e.spur && !a.home && !a.sick && !shut(a.e)); if (!cand.length) return false;
  const p = cand[Math.floor(Math.random() * cand.length)], n = Math.hypot(p.x - p.e.a.x, p.z - p.e.a.z) < Math.hypot(p.x - p.e.b.x, p.z - p.e.b.z) ? p.e.a : p.e.b;
  const a = launch("hospital", n, amb => { heal(p); later(() => sendHome(amb, "hospital"), 900); });
  if (!a) return false;
  later(() => { if (p.sick && !a.arrived) heal(p); }, 40000);   // 保險：救護車 40 秒還沒到（路被擋）就自己好起來
  p.sick = true; p.pause = 999;
  const tag = document.createElement("div"); tag.className = "hub-sick"; tag.textContent = "🤕"; tag._a = p; tagLayer.appendChild(tag); p.sickTag = tag; town.sickTags.push(tag);
  try { opts.onCivic("sick", { name: p.f && p.f.name }); } catch (e) {}
  return true;
}
function heal(p) {
  p.sick = false; p.pause = 0.8; p.jump = performance.now();
  if (p.sickTag) { p.sickTag.textContent = "💖"; p.sickTag.classList.add("ok"); const t = p.sickTag; p.sickTag = null; later(() => { t.remove(); const i = town.sickTags.indexOf(t); if (i >= 0) town.sickTags.splice(i, 1); }, 1400); }
  try { opts.onCivic("healed", { name: p.f && p.f.name }); } catch (e) {}
}
function placeSickTags() {
  const W = innerWidth, H = innerHeight;
  for (const el of town.sickTags) {
    const a = el._a; if (!a || !el.isConnected) continue;
    _v.set(a.x, walkY(a.x, a.z) + 1.25, a.z).project(camera); el.style.transform = `translate3d(${((_v.x + 1) / 2 * W - 22).toFixed(1)}px, ${((1 - _v.y) / 2 * H - 44).toFixed(1)}px, 0)`;
  }
}
// ----- 每格：車頂燈、事件排程 -----
function stepTown(t, dt) {
  const fast = performance.now() < town.siren;
  for (const a of agents) {                            // 車頂燈：出任務／按了警察局＝快閃，巡邏＝慢閃
    const L = a.holder && a.holder.userData.lights; if (!L) continue;
    const rate = a.siren || (a.patrol && fast) ? 6 : a.patrol ? 1.5 : 0;
    if (!rate) { L.r.visible = L.b.visible = false; continue; }
    const on = Math.floor(t * rate) % 2; L.r.visible = !on; L.b.visible = !!on;
  }
  if (town.patrol) town.patrol.speed = fast ? 1.25 : 0.8;
  for (const c of CIVIC) if (c.lights && !c.locked) { const on = Math.floor(t * (c.id === "police" && fast ? 6 : 1.2)) % 2; c.lights.r.visible = !on; c.lights.b.visible = !!on; }
  // 事件：選單開著、新市區開了，每 50～90 秒一次（火災或寵物不舒服）
  const now = performance.now();
  if (!town.nextEvent) town.nextEvent = now + 25000;
  if (town.open && built && now > town.nextEvent) {
    town.nextEvent = now + 50000 + Math.random() * 40000;
    const canFire = !CIVIC.find(c => c.id === "fire").locked && !town.fires.length, canSick = !CIVIC.find(c => c.id === "hospital").locked;
    if (canFire && (!canSick || Math.random() < 0.55)) { const ds = MAIN_DEFS.filter(d => !d.locked && d.ready && !d.free); if (ds.length) startFire(ds[Math.floor(Math.random() * ds.length)]); }
    else if (canSick) sickPet();
  }
  placeTownTags(); placeFireTags(); placeSickTags();
}

// =========================================================
// 彩虹島（10-12，docs/zhuyin-v5-plan.md §1）：主島西邊、過一座彩虹拱橋。
// 島上一圈環狀路（圓角長方形）＋東邊一小段路接橋；北排：小熊家、寵物服裝店、小兔家（正面朝路＝朝鏡頭）；
// 南排：小豬家、彩虹配送站（倉庫背面是碼頭＋貨船，靠近入口）；環內：風車＋彩虹花田；入口一道彩虹拱門。
// 貼紙 RAINBOW_NEED 張才開：沒開＝拱橋中間那段沉在水裡＋兩頭路障（點了貓頭鷹說還差幾張）；開了＝橋升上來＋opts.onCivic("rainbowOpen")。
// 彩虹配送站＝DEFS 的 deliver（點了＝點 .mode-card[data-mode=deliver]）；寵物服裝店＝DEFS 的 dress（free，點了 opts.onDress()）。
// 效能：不會動的全部進 rbStatics（最後另外合併成幾個 draw call；鏡頭在主島時整塊被剔除）、樹／花／標線用 InstancedMesh；
//       風車、居民、貨船、旗子的動畫在 rbTickers，只有鏡頭在彩虹島（或剛離開 3 秒內）才跑。
// =========================================================
const rb = { open: undefined, gap: null, barrier: null, gapHit: null, awake: 0, bridge: null, folk: [] };
const rbTickers = [], rbHits = [], rbStatics = [];   // rbStatics：彩虹島不會動的東西（最後另外合併 → 鏡頭在主島時整塊被視錐剔除，不用畫）
const RB_HOUSES = [   // 三戶居民（他們是彩虹配送站的客人）：門口小路接環狀路；side −1＝路北邊（正面朝 +z），+1＝路南邊
  { id: "bearHouse", name: "小熊", glb: "bear", ico: "🐻", x: -22.7, z: -4.55, side: -1, kit: "building-type-o", roof: "#e0883a", wall: "#fff3e0", paw: "#a8714a" },
  { id: "bunnyHouse", name: "小兔", glb: "bunny", ico: "🐰", x: -17.9, z: -4.55, side: -1, kit: "building-type-c", roof: "#a98bf0", wall: "#fbf4ff", paw: "#f4efe9" },
  { id: "pigHouse", name: "小豬", glb: "pig", ico: "🐷", x: -22.3, z: 4.75, side: 1, kit: "building-type-s", roof: "#ff8fa8", wall: "#fff2f4", paw: "#ffb3c1" },
];
const RB_SLOTS = [[-15.1, -3.3], [-15.2, 3.9], [-26.5, -3.0]];   // 裝飾放置點（加在全部放置點的最後面：主島、新市區原本的順序不變）
const RB_LAMPS = [[-21.5, -3.05], [-19.1, -3.05], [-20.35, 3.25], [-25.45, 0.1], [-14.0, -0.85], [-18.6, -1.35]];   // 路燈（人行道上）
function sdRainbow(x, z) {
  const u = x - RB.x, v = z - RB.z;
  let d = sdRoundBox(u, v, RB.hx, RB.hz, RB.r);
  d = Math.min(d, sdRoundBox(u + 5.6, v + 3.4, 1.6, 1.3, 0.8));     // 西北小岬（放裝飾、種樹）
  d = Math.max(d, -(Math.hypot(u - 5.4, v - 6.7) - 1.5));            // 東南小海灣（貨船停在旁邊）
  return d;
}
// 環狀路中線（圓角長方形）的距離；connector＝東邊接橋那一小段（z=0）
const rbLoopD = (x, z) => { const L = RB_LOOP; return Math.abs(sdRoundBox(x - (L.x0 + L.x1) / 2, z - (L.z0 + L.z1) / 2, (L.x1 - L.x0) / 2, (L.z1 - L.z0) / 2, L.rc)); };
function rbRoadD(x, z) { let d = rbLoopD(x, z); if (x > RB_LOOP.x1 && x < RB.x + RB.hx + 0.2) d = Math.min(d, Math.abs(z)); return d; }
const rbActive = () => town.place === "rainbow" || performance.now() < rb.awake;
// 以 (cx, cz) 為中心的輪廓（跟 contour 一樣：沿射線找最外面一個 f ≤ lvl 的點）
function contourC(f, lvl, cx, cz, maxR = 12, n = 160) {   // 點數比主島少（島小、省三角形）
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let r = 0; for (let s = 0; s < maxR; s += 0.04) if (f(cx + ca * s, cz + sa * s) <= lvl) r = s;
    pts.push(new THREE.Vector2(cx + ca * Math.max(0.5, r), cz + sa * Math.max(0.5, r)));
  }
  return pts;
}
function extrudePoly(parent, pts, top, depth, color, bevel = 0, out = false) {   // 同 buildTerrain 的 ext：平面輪廓 → 往下長的板
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, curveSegments: 4, bevelEnabled: bevel > 0, bevelThickness: bevel * 0.45, bevelSize: bevel, bevelOffset: out ? 0 : -bevel, bevelSegments: 3 });
  geo.rotateX(Math.PI / 2); geo.translate(0, top - (bevel ? bevel * 0.45 : 0), 0);
  const m = new THREE.Mesh(geo, mat(color)); m.receiveShadow = true; parent.add(m); return m;
}
// 七彩條紋布（遮雨棚、旗子）
function rainbowTex(n = 7, vertical = true) {
  return canvasTex(128, 64, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = RB_COLORS[i % 7]; if (vertical) g.fillRect(i * w / n, 0, w / n + 1, h); else g.fillRect(0, i * h / n, w, h / n + 1); } });
}
// 拱型屋頂（沿 x 的半圓筒，壓扁 sq）：每一片照角度塗彩虹七色（兩頭的半圓蓋就是一道彩虹）
function rainbowVault(len, r, sq) {
  const geo = new THREE.CylinderGeometry(r, r, len, 21, 1, false, -Math.PI / 2, Math.PI).toNonIndexed();
  geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI / 2); geo.scale(1, sq, 1);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    let cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cy += p.getY(i + k) / 3; cz += p.getZ(i + k) / 3; }
    const a = Math.atan2(cy / sq, -cz), band = Math.max(0, Math.min(6, Math.floor(a / Math.PI * 7)));
    _c.set(RB_COLORS[band]); for (let k = 0; k < 3; k++) col.set([_c.r, _c.g, _c.b], (i + k) * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
// 第一段（同步）：地形、路、拱橋、拱門、路網、風車、花田、樹（都不用下載）
function buildRainbow() {
  const g = new THREE.Group(); scene.add(g); rbStatics.push(g);
  const C = new THREE.Vector2(RB.x, RB.z), shrink = (pts, k) => pts.map(p => p.clone().sub(C).multiplyScalar(k).add(C));
  rb.poly = contourC(sdRainbow, 0, RB.x, RB.z);
  extrudePoly(g, rb.poly, 0, 0.1, P.grass, 0.04);                                     // 草地
  extrudePoly(g, shrink(rb.poly, 0.997), -0.08, 0.52, P.dirt).castShadow = true;       // 土壁
  extrudePoly(g, shrink(rb.poly, 0.994), -0.58, 0.2, P.dirtDk);
  extrudePoly(g, contourC(sdRainbow, 0.7, RB.x, RB.z), SAND_Y, 0.4, P.sand, 0.55, true);   // 沙灘（往外斜進水裡）
  // ----- 路：環狀路（直段＝方塊、轉角＝圓環片）＋東邊接橋的一小段 -----
  const L = RB_LOOP, rc = L.rc, laneM = mat("#8f93a3"), walkM = mat("#e6e2ee"), sw = RW / 2 + SW / 2;
  const rect = (x0, x1, z0, z1, h, m) => mesh(box(x1 - x0, h, z1 - z0), m, { x: (x0 + x1) / 2, y: h / 2, z: (z0 + z1) / 2, shadow: false, parent: g });
  const ring = (r0, r1, cx, cz, a0, a1, y, m) => { const geo = new THREE.RingGeometry(r0, r1, 12, 1, -a1, a1 - a0); geo.rotateX(-Math.PI / 2); mesh(geo, m, { x: cx, y, z: cz, shadow: false, parent: g }); };
  for (const z of [L.z0, L.z1]) {                                                      // 北、南直段
    rect(L.x0 + rc, L.x1 - rc, z - RW / 2, z + RW / 2, 0.045, laneM);
    for (const s of [-1, 1]) rect(L.x0 + rc, L.x1 - rc, z + s * RW / 2 - (s < 0 ? SW : 0), z + s * RW / 2 + (s > 0 ? SW : 0), 0.075, walkM);
  }
  for (const x of [L.x0, L.x1]) {                                                      // 西、東直段（東邊外側人行道讓出接橋的路口）
    const out = x === L.x0 ? -1 : 1, za = L.z0 + rc, zb = L.z1 - rc;                       // out＝環外側的方向
    rect(x - RW / 2, x + RW / 2, za, zb, 0.045, laneM);
    const i0 = x - out * (RW / 2 + SW), i1 = x - out * RW / 2, o0 = x + out * RW / 2, o1 = x + out * (RW / 2 + SW);
    rect(Math.min(i0, i1), Math.max(i0, i1), za, zb, 0.075, walkM);                        // 內側
    if (out < 0) rect(Math.min(o0, o1), Math.max(o0, o1), za, zb, 0.075, walkM);
    else { rect(o0, o1, za, -RW / 2, 0.075, walkM); rect(o0, o1, RW / 2, zb, 0.075, walkM); }
  }
  const CORNER = [[L.x1 - rc, L.z0 + rc, -Math.PI / 2, 0], [L.x1 - rc, L.z1 - rc, 0, Math.PI / 2], [L.x0 + rc, L.z1 - rc, Math.PI / 2, Math.PI], [L.x0 + rc, L.z0 + rc, Math.PI, Math.PI * 1.5]];
  for (const [cx, cz, a0, a1] of CORNER) { ring(rc - RW / 2, rc + RW / 2, cx, cz, a0, a1, 0.046, laneM); ring(rc + RW / 2, rc + RW / 2 + SW, cx, cz, a0, a1, 0.076, walkM); ring(rc - RW / 2 - SW, rc - RW / 2, cx, cz, a0, a1, 0.076, walkM); }
  let xe = RB.x; while (sdRainbow(xe + 0.02, 0) <= 0) xe += 0.02;                       // 島的東岸（z=0 那一點）
  rect(L.x1 + RW / 2, xe + 0.05, -RW / 2, RW / 2, 0.045, laneM);                         // 接橋的路
  for (const s of [-1, 1]) rect(L.x1 + RW / 2 + SW, xe - 0.05, s < 0 ? -RW / 2 - SW : RW / 2, s < 0 ? -RW / 2 : RW / 2 + SW, 0.075, walkM);
  // 路面中線：彩虹色虛線（環狀路一圈＋接橋那段；路口不畫）
  const dashes = [], path = [];
  const segLine = (x0, z0, x1, z1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.05)); for (let i = 0; i <= n; i++) path.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]); };
  const segArc = (cx, cz, a0, a1) => { for (let i = 0; i <= 24; i++) { const a = a0 + (a1 - a0) * i / 24; path.push([cx + Math.cos(a) * rc, cz + Math.sin(a) * rc]); } };
  segLine(L.x0 + rc, L.z0, L.x1 - rc, L.z0); segArc(...CORNER[0]); segLine(L.x1, L.z0 + rc, L.x1, L.z1 - rc); segArc(...CORNER[1]);
  segLine(L.x1 - rc, L.z1, L.x0 + rc, L.z1); segArc(...CORNER[2]); segLine(L.x0, L.z1 - rc, L.x0, L.z0 + rc); segArc(...CORNER[3]);
  for (let i = 1, acc = 0.3; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i]; acc += Math.hypot(bx - ax, bz - az);
    if (acc < 0.62) continue; acc = 0;
    if (Math.hypot(bx - L.x1, bz) < RW) continue;                                         // 接橋的路口
    dashes.push([bx, bz, Math.atan2(bx - ax, bz - az)]);
  }
  for (let x = L.x1 + RW / 2 + 0.4; x < xe - 0.2; x += 0.62) dashes.push([x, 0, Math.PI / 2]);
  const dm = new THREE.InstancedMesh(box(0.07, 0.01, 0.3), new THREE.MeshLambertMaterial(), dashes.length);
  dashes.forEach(([x, z, r], k) => { _m4.compose(_v.set(x, 0.05, z), _q.setFromAxisAngle(_s.set(0, 1, 0), r), _s.set(1, 1, 1)); dm.setMatrixAt(k, _m4); dm.setColorAt(k, _c.set(RB_COLORS[k % 7])); });
  dm.receiveShadow = true; scene.add(dm);
  // ----- 路網：環狀路（每個門口一個節點）＋接橋的路＋橋（全部標 e.rb：沒開就不走）-----
  const T = e => { e.rb = true; return e; };
  const mainEnd = [...graph.nodes.values()].filter(n => Math.abs(n.z) < 0.01 && !n.door && n.x < 0).sort((a, b) => a.x - b.x)[0];
  const stopN = [-22.7, -20.3, -17.9], stopS = [-18.4, -22.3];                            // 北排三戶、南排兩棟的門口（x；路是從東往西接）
  const chain = pts => { for (let i = 1; i < pts.length; i++) T(edge(node(...pts[i - 1]), node(...pts[i]))); };
  const arc = (cx, cz, a0, a1) => { const pts = []; for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * k / 6; pts.push(new THREE.Vector2(cx + Math.cos(a) * rc, cz + Math.sin(a) * rc)); } T(edge(node(pts[0].x, pts[0].y), node(pts[6].x, pts[6].y), pts)); };
  chain([[L.x0 + rc, L.z0], ...stopN.map(x => [x, L.z0]), [L.x1 - rc, L.z0]]); arc(...CORNER[0]);
  chain([[L.x1, L.z0 + rc], [L.x1, 0], [L.x1, L.z1 - rc]]); arc(...CORNER[1]);
  chain([[L.x1 - rc, L.z1], ...stopS.map(x => [x, L.z1]), [L.x0 + rc, L.z1]]); arc(...CORNER[2]);
  chain([[L.x0, L.z1 - rc], [L.x0, L.z0 + rc]]); arc(...CORNER[3]);
  const nE = node(xe, 0), gate = T(edge(mainEnd, nE)); gate.rbGate = true; T(edge(nE, node(L.x1, 0)));
  const doorAt = (x, zRoad, dz, owner) => {                                               // dz＝建築在路的哪一邊（−1 北、+1 南）
    const n = graph.nodes.get(nkey(x, zRoad)), dn = node(x, zRoad + dz * (RW / 2 + SW + 0.2)); dn.door = owner; T(edge(n, dn, null, true));
    vm(box(0.7, 0.03, 0.4), "#d9d3ca", { x: dn.x, y: 0.03, z: dn.z, shadow: false, parent: g }); return dn;
  };
  for (const d of DEFS.filter(q => q.isle === "rainbow" && q.door[1])) d.doorNode = doorAt(d.x, d.door[1] < 0 ? L.z1 : L.z0, d.door[1] < 0 ? 1 : -1, d);
  {                                                     // 10-12 詞句偵探社：門朝東，接環狀路東段在 z=0 的路口（正對接橋的那段路）
    const d = DEFS.find(q => q.mode === "detective"), n = graph.nodes.get(nkey(L.x1, d.z)), dn = node(L.x1 - (RW / 2 + SW + 0.2), d.z); dn.door = d; T(edge(n, dn, null, true)); d.doorNode = dn;
    vm(box(0.4, 0.03, 0.7), "#d9d3ca", { x: dn.x, y: 0.03, z: dn.z, shadow: false, parent: g });
  }
  for (const h of RB_HOUSES) {
    h.door = doorAt(h.x, h.side < 0 ? L.z0 : L.z1, h.side, h);
    // 門牌（動物圖案）＋居民站的位置：北排＝門口小路兩旁（房子正面朝鏡頭）；南排的房子背對鏡頭 → 改站在房子東邊（不然被房子擋住）
    const dz = h.door.z + h.side * 0.12;
    Object.assign(h, h.side < 0 ? { sx: h.x - 0.55, sz: dz, px: h.x + 0.62, pz: dz } : { sx: h.x + 1.12, sz: h.z - 0.95, px: h.x + 1.2, pz: h.z - 0.3 });
  }
  for (const [x, z] of RB_LAMPS) graph.lamps.push([x, z]);
  for (const h of RB_HOUSES) exRects.push([h.x - 1.15, h.x + 1.15, h.z - 1.1, h.z + 1.1]);
  // ----- 彩虹拱橋：橋面跟著拱形高低（terraces 的 fy），欄杆七彩；中間那段＝沒開時沉在水裡 -----
  const xa = mainEnd.x + 0.2, xb = xe - 0.05, BL = xa - xb, BH = 0.55, bw = RW + 0.5;
  const yA = x => 0.04 + BH * Math.sin(Math.PI * Math.min(1, Math.max(0, (xa - x) / BL)));
  terraces.push({ x0: xb, x1: xa, z0: -bw / 2, z1: bw / 2, y: 0.04, fy: x => yA(x) });
  exRects.push([xb - 0.3, xa + 0.6, -1.4, 1.4]);                                          // 兩頭不要種樹
  const deckPart = (parent, xs, xe2, withRail = true) => {                                // 一段橋面（xs > xe2：從東往西）
    const n = Math.max(2, Math.round((xs - xe2) / 0.2)), top = [], bot = [];
    for (let i = 0; i <= n; i++) { const x = xs - (xs - xe2) * i / n; top.push([x, yA(x) + 0.05]); bot.push([x, yA(x) - 0.09]); }
    const sh = new THREE.Shape(); sh.moveTo(...top[0]); for (const p of top.slice(1)) sh.lineTo(...p); for (const p of bot.reverse()) sh.lineTo(...p); sh.closePath();
    const deckG = new THREE.ExtrudeGeometry(sh, { depth: bw, bevelEnabled: false }); deckG.translate(0, 0, -bw / 2);
    mesh(deckG, mat("#e9dcc6"), { parent });
    const rs = new THREE.Shape(); rs.moveTo(top[0][0], top[0][1] + 0.012); for (const [x] of top.slice(1)) rs.lineTo(x, yA(x) + 0.062); for (let i = n; i >= 0; i--) { const x = xs - (xs - xe2) * i / n; rs.lineTo(x, yA(x) + 0.049); } rs.closePath();
    const roadG = new THREE.ExtrudeGeometry(rs, { depth: RW - 0.1, bevelEnabled: false }); roadG.translate(0, 0, -(RW - 0.1) / 2);
    mesh(roadG, mat("#9a9fae"), { parent, shadow: false });
    if (!withRail) return;
    for (const s of [-1, 1]) for (let x = xs; x > xe2 - 0.01; x -= 0.42) {                // 欄杆：柱子＋扶手，顏色照在橋上的位置分七段
      const k = Math.min(6, Math.floor((xa - x) / BL * 7)), y = yA(x);
      vm(box(0.07, 0.32, 0.07), "#ffffff", { x, y: y + 0.21, z: s * (bw / 2 - 0.05), parent, shadow: false });
      const x2 = Math.max(xe2, x - 0.42); if (x - x2 < 0.05) continue;
      const y2 = yA(x2), len = Math.hypot(x - x2, y - y2);
      vm(box(len + 0.02, 0.07, 0.08), RB_COLORS[k], { x: (x + x2) / 2, y: (y + y2) / 2 + 0.37, z: s * (bw / 2 - 0.05), rz: Math.atan2(y - y2, x - x2), parent, shadow: false });
    }
  };
  const third = BL / 3, br = new THREE.Group(); scene.add(br); rbStatics.push(br);
  deckPart(br, xa, xa - third); deckPart(br, xb + third, xb);
  for (const x of [xa - third * 0.55, xb + third * 0.55]) for (const s of [-1, 1]) vm(cyl(0.13, 0.16, 1.2, 8), "#c9b9a6", { x, y: yA(x) - 0.62, z: s * (bw / 2 - 0.25), parent: br });   // 橋墩
  rb.gap = new THREE.Group(); scene.add(rb.gap); deckPart(rb.gap, xa - third, xb + third); mergeStatic(rb.gap);
  rb.barrier = new THREE.Group(); scene.add(rb.barrier);
  for (const x of [xa - third - 0.15, xb + third + 0.15]) {                              // 沒開：缺口兩頭各一道施工路障
    const bg = new THREE.Group(); bg.position.set(x, yA(x) + 0.08, 0); bg.rotation.y = Math.PI / 2; rb.barrier.add(bg);
    const geo = box(bw - 0.3, 0.18, 0.05), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (bw - 0.3) / 1.1);
    mesh(geo, fenceMat, { y: 0.4, parent: bg }); mesh(geo, fenceMat, { y: 0.16, parent: bg });
    for (const s of [-1, 1]) mesh(box(0.07, 0.56, 0.07), postMat, { x: s * (bw / 2 - 0.2), y: 0.28, parent: bg });
  }
  rb.gapHit = new THREE.Mesh(box(BL + 0.4, 1.6, bw + 0.6), new THREE.MeshBasicMaterial({ visible: false })); rb.gapHit.position.set((xa + xb) / 2, 0.5, 0); rb.gapHit.userData.rbLock = true; scene.add(rb.gapHit); rbHits.push(rb.gapHit);
  rb.bridge = { xa, xb, third, yA };
  // ----- 入口彩虹拱門（七道半圓、兩腳踩在白雲上）-----
  const ag = new THREE.Group(); ag.position.set(xe - 0.75, 0, 0); g.add(ag);
  RB_COLORS.forEach((c, i) => { const tg = new THREE.TorusGeometry(1.62 - i * 0.075, 0.042, 6, 28, Math.PI); tg.rotateY(Math.PI / 2); vm(tg, c, { y: 0.02, parent: ag, shadow: i === 3 }); });
  for (const s of [-1, 1]) for (const [dx, dy, dz, r] of [[0, 0.12, 0, 0.3], [0.2, 0.08, 0.12, 0.22], [-0.18, 0.07, -0.1, 0.2], [0.05, 0.3, 0.05, 0.2]]) vm(new THREE.IcosahedronGeometry(r, 1), "#ffffff", { x: dx, y: dy, z: s * 1.4 + dz, parent: ag, shadow: false });
  // ----- 風車（環內西邊；四片彩色風帆，朝鏡頭轉）-----
  const wm = new THREE.Group(); wm.position.set(-22.75, 0, 0.1); wm.rotation.y = Math.PI / 4; scene.add(wm); rbStatics.push(wm);
  vm(cyl(0.44, 0.62, 1.75, 8), "#f6eedb", { y: 0.875, ry: Math.PI / 8, parent: wm });   // 轉 22.5°：正面是平的（門、窗貼得上去）
  for (const y of [0.55, 1.15]) { const r = 0.62 - 0.18 * y / 1.75 + 0.03; vm(cyl(r, r, 0.06, 8), "#c98a55", { y, ry: Math.PI / 8, parent: wm, shadow: false }); }
  vm(new THREE.ConeGeometry(0.6, 0.62, 8), "#e25d4f", { y: 2.06, parent: wm });
  vm(box(0.3, 0.46, 0.06), "#8a5a3c", { y: 0.23, z: 0.57, parent: wm, shadow: false });
  for (const [y, x] of [[1.0, 0], [1.45, 0]]) vm(box(0.2, 0.22, 0.05), "#bfe3f3", { x, y, z: 0.5 - (y - 1) * 0.12, parent: wm, shadow: false });
  vm(cyl(0.09, 0.09, 0.3, 10), "#8a5a3c", { y: 1.68, z: 0.5, rx: Math.PI / 2, parent: wm, shadow: false });
  const blades = new THREE.Group(); blades.position.set(0, 1.68, 0.68); blades.userData.dyn = true; wm.add(blades);
  ["#ff6b6b", "#ffd84d", "#4fb6f0", "#7ad66b"].forEach((c, k) => { const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; blades.add(arm);
    vm(box(0.06, 1.08, 0.04), "#8a5a3c", { y: 0.54, parent: arm, shadow: false }); vm(box(0.26, 0.74, 0.02), c, { x: 0.15, y: 0.66, z: 0.02, parent: arm, shadow: false }); });
  vm(new THREE.SphereGeometry(0.1, 10, 8), "#ffd84d", { parent: blades, shadow: false });
  mergeStatic(blades);
  rbTickers.push(t => { blades.rotation.z = -t * 0.9; });
  // ----- 彩虹花田（七排，一排一色；環內東邊）-----
  const fl = [], rnd = rng(77);
  for (let i = 0; i < 7; i++) {
    const z = -0.82 + i * 0.31; vm(box(2.25, 0.08, 0.2), "#8a5a3c", { x: -20.15, y: 0.04, z, parent: g, shadow: false });   // 10-12：東邊讓給詞句偵探社（以前 3.7 寬到 −17.65）
    for (let x = -21.25; x < -19.05; x += 0.2) fl.push([x + (rnd() - 0.5) * 0.06, 0.13 + rnd() * 0.04, z + (rnd() - 0.5) * 0.08, i]);
  }
  const fm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshLambertMaterial(), fl.length);
  fl.forEach(([x, y, z, i], k) => { _m4.makeTranslation(x, y, z); fm.setMatrixAt(k, _m4); fm.setColorAt(k, _c.set(RB_COLORS[i])); });
  fm.castShadow = false; scene.add(fm);
  exRects.push([-23.6, -17.0, -1.2, 1.4]);                                                // 環裡面：風車、花田，不種樹
  // ----- 樹、灌木（島的邊上；InstancedMesh）-----
  const inst = [[], [], [], [], []], rt = rng(41), doorsXZ = [...DEFS.filter(q => q.isle).map(q => q.doorNode), ...RB_HOUSES.map(h => h.door)];
  for (let x = RB.x - 8; x <= RB.x + 8; x += 0.55) for (let z = RB.z - 7.5; z <= RB.z + 7.5; z += 0.55) {
    const jx = x + (rt() - 0.5) * 0.35, jz = z + (rt() - 0.5) * 0.35, sd = sdRainbow(jx, jz);
    if (sd > -0.45 || rbRoadD(jx, jz) < RW / 2 + SW + 0.35 || exRects.some(([a, b, c, d]) => jx > a && jx < b && jz > c && jz < d)) continue;
    if (RB_SLOTS.some(([sx, sz]) => Math.hypot(jx - sx, jz - sz) < 0.8) || doorsXZ.some(n => Math.hypot(jx - n.x, jz - n.z) < 0.9) || RB_LAMPS.some(([lx, lz]) => Math.hypot(jx - lx, jz - lz) < 0.7)) continue;
    if (RB_HOUSES.some(h => Math.hypot(jx - h.px, jz - h.pz) < 1.1 || Math.hypot(jx - h.sx, jz - h.sz) < 0.6)) continue;   // 居民、門牌旁邊不種（不然擋住）
    if (treeXZ.some(([a, b]) => Math.hypot(a - jx, b - jz) < 0.8)) continue;
    const coast = sd > -1.6, r = rt();
    if (r < (coast ? 0.42 : 0.14)) { treeXZ.push([jx, jz]); const v = rt(); inst[v < 0.4 ? 0 : v < 0.6 ? 1 : v < 0.8 ? 2 : 3].push([jx, 0, jz, 0.8 + rt() * 0.3, rt() * 6.28]); blob(jx, jz, 1.0, 0); }
    else if (r < (coast ? 0.56 : 0.22)) { treeXZ.push([jx, jz]); inst[4].push([jx, 0, jz, 0.8 + rt() * 0.4, rt() * 6.28]); blob(jx, jz, 0.6, 0); }
  }
  inst.forEach((list, v) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(v < 4 ? TREE_GEOS[v] : BUSH_GEO, vcMat, list.length);
    list.forEach(([x, y, z, s, r], k) => { _m4.compose(_v.set(x, y, z), _q.setFromAxisAngle(_s.set(0, 1, 0), r), _s.set(s, s, s)); im.setMatrixAt(k, _m4); });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  });
  blob(-22.75, 0.1, 1.6, 0);
}
// 第二段（要下載的）：三戶人家＋門口的居民＋門牌、小兔的紅蘿蔔田、小熊的蜂蜜罐、小豬的泥巴坑
async function buildRainbowKenney() {
  const g = new THREE.Group(); scene.add(g); rbStatics.push(g);
  await Promise.all(RB_HOUSES.map(async h => {
    const m = await kenney("city-kit-suburban", h.kit, { parent: g, tints: [[0, 1, h.roof], [3, 2, h.wall]] });
    placeFit(m, h.x, h.z, 1.9, h.side < 0 ? 0 : Math.PI);
    const { sx, sz, px, pz } = h;                        // 門牌（動物圖案，不放國字）、居民的位置（buildRainbow 算好）
    const sg = new THREE.Group(); sg.position.set(sx, 0, sz); sg.rotation.y = Math.PI / 4; g.add(sg);
    vm(cyl(0.035, 0.04, 0.62, 6), P.wood, { y: 0.31, parent: sg }); sign(sg, h.ico, h.roof, 0, 0.72, 0.03, 0);
    blob(sx, sz, 0.3, 0);
    // 居民：偶爾跳一下、搖一搖揮手；點了唸名字
    const url = await usableGlb(MODELS + h.glb + ".glb"); if (!url || dead) return;
    const raw = await loadAny(url, { h: 0.78 }); if (dead) return;
    const holder = new THREE.Group(); holder.position.set(px, 0, pz); holder.rotation.y = CAM_YAW; scene.add(holder);
    const body = new THREE.Group(); body.add(raw); holder.add(body); mergeStatic(raw); raw.traverse(o => { if (o.isMesh) o.castShadow = false; });
    const paw = vm(new THREE.SphereGeometry(0.075, 10, 8), h.paw, { x: 0.3, y: 0.45, parent: body, shadow: false }); paw.visible = false;
    const hit = new THREE.Mesh(box(0.9, 1.2, 0.9), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.6; holder.add(hit);
    const f = { h, holder, body, paw, hit, act: 0, kind: "", next: 2 + Math.random() * 4, ph: Math.random() * 6 };
    hit.userData.folk = f; rbHits.push(hit); rb.folk.push(f); holder.visible = !!rb.shownFolk;
    const hh = new THREE.Mesh(box(1.9, 1.6, 1.9), new THREE.MeshBasicMaterial({ visible: false })); hh.position.set(h.x, 0.8, h.z); hh.userData.folk = f; scene.add(hh); rbHits.push(hh);   // 點房子＝點居民
    blob(holder.position.x, holder.position.z, 0.45, 0);
  }));
  // 小兔家：門口旁邊一塊紅蘿蔔田；小熊家：蜂蜜罐；小豬家：屋後泥巴坑＋南瓜
  const bun = RB_HOUSES[1], bear = RB_HOUSES[0], pig = RB_HOUSES[2];
  const soil = slab({ hx: 0.42, hz: 0.55, r: 0.15, top: 0.06, depth: 0.1, color: "#8a5a3c", x: bun.x + 1.35, z: bun.z + 0.15 }); g.add(soil);
  await Promise.all([
    ...[-0.25, 0.25].map(dz => kenney("nature-kit", "crop_carrot", { parent: g, scale: 0.8, x: bun.x + 1.35, y: 0.06, z: bun.z + 0.15 + dz })),
    ...[[0.8, 0.5], [1.15, 0.2]].map(([dx, dz]) => kenney("nature-kit", "crop_pumpkin", { parent: g, scale: 0.75, x: pig.x + dx, y: 0, z: pig.z + dz + 0.5 })),
  ]).catch(e => console.warn("[hub3d] 彩虹島菜園", e));
  const pot = new THREE.Group(); pot.position.set(bear.x - 1.25, 0, bear.z + 0.55); g.add(pot);
  vm(cyl(0.2, 0.17, 0.32, 12), "#ffc93c", { y: 0.16, parent: pot }); vm(cyl(0.22, 0.22, 0.06, 12), "#e0a020", { y: 0.33, parent: pot, shadow: false }); vm(cyl(0.1, 0.12, 0.08, 10), "#8a5a3c", { y: 0.39, parent: pot, shadow: false });
  vm(new THREE.SphereGeometry(0.14, 10, 8), "#ffc93c", { x: 0.32, y: 0.1, z: 0.12, parent: pot }).scale.set(1, 0.7, 1);
  blob(pot.position.x, pot.position.z, 0.5, 0);
  const mud = new THREE.CircleGeometry(0.42, 18); mud.rotateX(-Math.PI / 2); mud.scale(1.3, 1, 0.8); vm(mud, "#7a5236", { x: pig.x - 0.55, y: 0.012, z: pig.z + 1.12, parent: g, shadow: false });
  for (const [dx, dz] of [[-0.3, 0.05], [0.25, -0.08]]) vm(new THREE.CircleGeometry(0.07, 8).rotateX(-Math.PI / 2), "#9a6a48", { x: pig.x - 0.55 + dx, y: 0.016, z: pig.z + 1.12 + dz, parent: g, shadow: false });
  // 居民動畫（只在鏡頭在彩虹島時跑）：平常輕輕呼吸，每 4～9 秒跳一下或搖一搖揮手
  rbTickers.push((t) => {
    for (const f of rb.folk) {
      if (!f.act && t > f.next) { f.act = t; f.kind = Math.random() < 0.5 ? "hop" : "wave"; f.next = t + 4 + Math.random() * 5; }
      let y = 0, rz = 0, sq = 1 + Math.sin(t * 2.2 + f.ph) * 0.02, pw = false;
      if (f.act) {
        const u = (t - f.act) / (f.kind === "hop" ? 0.6 : 1.3);
        if (u >= 1) f.act = 0;
        else if (f.kind === "hop") { y = Math.sin(Math.PI * u) * 0.38; sq = 1 + Math.sin(Math.PI * u) * 0.08; }
        else { rz = Math.sin(u * Math.PI * 4) * 0.2 * (1 - u); pw = true; f.paw.position.set(0.32, 0.62 + Math.abs(Math.sin(u * Math.PI * 4)) * 0.16, 0.05); }
      }
      f.body.position.y = y; f.body.rotation.z = rz; f.body.scale.set(1, sq, 1); f.paw.visible = pw;
    }
  });
  shadowDirty = true;
}
// 解鎖狀態：貼紙夠 → 拱橋接上、寵物服裝店亮起來（animate＝剛剛解鎖：橋升起＋主程式宣告）
function syncRainbow(animate) {
  const n = opts.stickers ? opts.stickers() : 0, open = n >= RAINBOW_NEED;
  if (rb.open !== open) {
    const was = rb.open; rb.open = open;
    if (!open) for (const a of agents) if (!a.vip && a.e && a.e.rb) placeAgent(a, a.kind);   // 換成貼紙少的存檔位：在彩虹島上的寵物、車搬回來
    if (open && animate && was === false) { rbBridgeRise(); try { opts.onCivic("rainbowOpen", {}); } catch (e) {} }
    else { rb.gap.visible = open; rb.gap.position.y = 0; rb.barrier.visible = !open; }
    rb.gapHit.visible = !open;
  }
  const dr = DEFS.find(d => d.mode === "dress");
  if (dr.locked !== !open) setLocked(dr, !open, animate && dr.locked !== undefined);
  syncTag(dr); syncTownTags();                          // 地點鈕的「彩虹島 🔒」跟著更新
}
function rbBridgeRise() {
  rb.gap.visible = true; const t0 = performance.now();
  anims.add({ update(now) { const u = Math.min(1, (now - t0) / 1100); rb.gap.position.y = -1.6 * (1 - easeOutBack(u)); rb.barrier.scale.y = Math.max(0.001, 1 - u); if (u >= 1) { rb.barrier.visible = false; rb.barrier.scale.y = 1; shadowDirty = true; } return u < 1; } });
}
function tapFolk(f) {
  if (town.place !== "rainbow" || (f.act && f.kind === "hop")) return;
  f.act = performance.now() / 1000; f.kind = "hop"; f.next = f.act + 3;
  later(() => { f.act = performance.now() / 1000; f.kind = "wave"; }, 620);
  try { opts.onFriend({ name: f.h.name }); } catch (e) {}
}
function tapRbLock() {
  const now = performance.now(); if (now < tapLockUntil || rb.open) return; tapLockUntil = now + 700;
  try { opts.onCivic("rainbowLocked", { need: RAINBOW_NEED }); } catch (e) {}
}

// =========================================================
// 橋頭路牌（10-12 阿葉：「進入彩虹島除了點左邊按鈕，地圖上也要有地方可以點」）：
// 主島往彩虹島、往歸仁區的橋頭各一支小木牌（3D：柱子＋箭頭形木板＋圓形圖示），到了那邊橋頭各一支「回小島」。
// 浮標（.hub-sign，DOM）＝木牌底色的小牌子「圖示＋地名＋箭頭」，名字常駐（導航不是遊戲）；只顯示人在的那座島的；
// 木牌不在畫面裡（主島取景只顧遊戲建築）→ 浮標貼在畫面邊（沒有尾巴），一樣點得到。點了＝tapIsle（還沒開＝貓頭鷹說上鎖台詞）
// =========================================================
const SIGNS = [], signHits = [];
const signBoardGeo = () => { const s = new THREE.Shape(); s.moveTo(-0.28, -0.12); s.lineTo(0.17, -0.12); s.lineTo(0.31, 0); s.lineTo(0.17, 0.12); s.lineTo(-0.28, 0.12); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }); g.translate(0, 0, -0.03); return g; };
function buildSigns() {
  const T = town.bridge, B = rb.bridge; if (!T || !B) return;
  const icons = { rainbow: "🌈", town: "🏙️", main: "🏝️" }, bg = { rainbow: "#b583f2", town: "#4fb6f0", main: "#7ad66b" };
  const isleXZ = { main: [0, 0], town: [DIST.x, DIST.z], rainbow: [RB.x, RB.z] };
  // 位置：橋頭的人行道上（朝鏡頭那側；跟垃圾桶、消防栓一樣是街道設施，寵物走車道不會撞到）——主島西橋頭南邊緊鄰打地鼠，不能再往外
  const SW_C = RW / 2 + SW / 2;                          // 人行道中線離路中線多遠
  for (const [at, go, x, z] of [["main", "rainbow", B.xa + 0.35, SW_C], ["rainbow", "main", B.xb - 0.3, SW_C], ["main", "town", T.cx + SW_C, T.z0 + 0.35], ["town", "main", T.cx + SW_C, T.z1 - 0.4]]) {
    const y = groundY(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.PI / 4; scene.add(g);   // 正面朝鏡頭（+x+z）
    const [gx, gz] = isleXZ[go], dir = Math.sign((gx - x) - (gz - z)) || 1;   // 那座島在畫面左邊還是右邊（區域 +x＝畫面右）
    mesh(cyl(0.045, 0.055, 1.0, 8), mat("#8a5a32"), { y: 0.5, parent: g });
    const bd = mesh(signBoardGeo(), mat("#c98a55"), { y: 0.86, parent: g }); bd.scale.x = dir;
    mesh(new THREE.CircleGeometry(0.105, 20), signMat(icons[go], bg[go]), { x: -0.05 * dir, y: 0.86, z: 0.035, parent: g, shadow: false });
    blob(x, z, 0.5, y);
    const hit = new THREE.Mesh(box(0.9, 1.3, 0.9), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(x, y + 0.65, z); scene.add(hit);
    const s = { at, go, x, y: y + 1.12, z, dir, g, ico: icons[go] }; hit.userData.sign = s; signHits.push(hit); SIGNS.push(s);
    exRects.push([x - 0.6, x + 0.6, z - 0.6, z + 0.6]);   // 不種樹
  }
}
function makeSignTags() {
  const L = (opts.labels || {}).signs || {};
  for (const s of SIGNS) {
    const t = document.createElement("button"); t.className = "hub-sign" + (s.dir < 0 ? " left" : ""); t.type = "button"; t.dataset.at = s.at; t.dataset.go = s.go; t._sign = s;
    t.innerHTML = '<span class="sg-arr" aria-hidden="true">➜</span><span class="sg-ico"></span><span class="sg-word"></span><span class="sg-lock"></span>';
    t.querySelector(".sg-ico").textContent = s.ico; t.querySelector(".sg-word").textContent = L[s.go] || "";
    t.setAttribute("aria-label", L[s.go] || s.go);
    t.addEventListener("click", () => tapIsle(s.go));
    tagLayer.appendChild(t); s.tag = t; if (tagRO) tagRO.observe(t);
  }
  syncSigns();
}
function syncSigns() {                                 // 還沒開的島：箭頭換成 🔒
  for (const s of SIGNS) { if (!s.tag) continue; const lk = (s.go === "town" && !town.open) || (s.go === "rainbow" && !rb.open); s.tag.classList.toggle("locked", lk); const e = s.tag.querySelector(".sg-lock"), t = lk ? "🔒" : ""; if (e.textContent !== t) e.textContent = t; }
}
// 浮標位置：投影＋夾在畫面裡（上面介面底以下、畫面底以上）；擠在一起的交給 nudge（跟遊戲浮標一起排）
function signRects(list, sc) {
  const W = innerWidth, H = innerHeight, M = 8;
  for (const s of SIGNS) {
    if (s.at !== town.place || !s.tag) continue;
    if (tagLive() || !s.tw0) { s.tw0 = s.tag.offsetWidth; s.th0 = s.tag.offsetHeight; }
    const w = s.tw0 * sc, h = s.th0 * sc; if (!w) continue;
    _v.set(s.x, s.y, s.z).project(camera);
    const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
    const cx = Math.max(M + w / 2, Math.min(W - M - w / 2, x)), cy = Math.max((view.sgTop || 0) + h + TAIL + M, Math.min((view.sgBot || H) - M, y));
    list.push({ d: s, ax: cx, x0: cx - w / 2, x1: cx + w / 2, y0: cy - h - TAIL, y1: cy - TAIL, w0: s.tw0, h0: s.th0, edge: Math.abs(cx - x) > 1 || Math.abs(cy - y) > 1 });
  }
}
// 路牌浮標讓開遊戲浮標（遊戲浮標排好了才排路牌，路牌不推遊戲浮標——不然按住展開的名字會被推去撞「繼續玩」膠囊）：
// 碰到遊戲浮標、固定介面或另一支路牌 → 在木牌附近往下／上／左／右挪一格、兩格，找第一個空的地方（先找都不碰的；找不到再找
// 「只要不碰固定介面和別支路牌」的——跟遊戲浮標疊一點沒關係，遊戲浮標畫在路牌上面）；挪過了就沒有尾巴（不再指著木牌）。
// 不挪太遠（挪到別座島的橋頭旁邊會指錯方向）：附近都放不下又會碰到固定介面／別支路牌＝這一格先藏起來（地點鈕還在）
function dodgeSigns(list, tags) {
  const W = innerWidth, M = 8, top = (view.sgTop || 0) + M, bot = (view.sgBot || innerHeight) - M, done = [];
  const over = (r, o, gx, gy) => o && r.x0 < o.x1 + gx && r.x1 > o.x0 - gx && r.y0 < o.y1 + TAIL + gy && r.y1 + TAIL + gy > o.y0;
  const hard = r => fitObs.some(o => over(r, o, 0, 0)) || done.some(o => over(r, o, 12, 8));
  const soft = r => tags.some(o => over(r, o, 12, 8));
  for (const r of list) {
    let moved = false, hide = false;
    if (hard(r) || soft(r)) {
      const w = r.x1 - r.x0, h = r.y1 - r.y0 + TAIL, b = { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 };
      let q = null;
      out: for (const strict of [true, false]) for (const k of [1, 2]) for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const ox = dx * k * (w * 0.6 + 12), oy = dy * k * (h + 10), c = { x0: b.x0 + ox, x1: b.x1 + ox, y0: b.y0 + oy, y1: b.y1 + oy };
        if (c.x0 < M || c.x1 > W - M || c.y0 < top || c.y1 > bot || hard(c) || (strict && soft(c))) continue;
        q = c; break out;
      }
      if (q) { Object.assign(r, q); r.ax = (q.x0 + q.x1) / 2; moved = true; } else hide = hard(r);
    }
    if (!hide) done.push(r);                            // 下一支路牌要讓開這一支
    const s = r.d, e = !!(r.edge || moved); if (e !== !!s.edge) { s.edge = e; s.tag.classList.toggle("edge", e); }
    if (hide !== !!s.hid) { s.hid = hide; s.tag.style.visibility = hide ? "hidden" : ""; }
  }
}

// =========================================================
// 樹、花（第一段；全部 InstancedMesh）
// =========================================================
let TREE_GEOS, BUSH_GEO;
function blobGeo(r, x, y, z, hex, detail = 1) { const g = new THREE.IcosahedronGeometry(r, detail); g.translate(x, y, z); return paint(g, hex); }
function trunk(h) { const g = cyl(0.06, 0.095, h, 7).toNonIndexed(); g.translate(0, h / 2, 0); return paint(g, "#9a6a48"); }
function makeGeos() {
  TREE_GEOS = [
    mergeGeometries([trunk(0.55), blobGeo(0.46, 0, 0.95, 0, "#7cc25a"), blobGeo(0.32, 0.22, 1.24, 0.1, "#93d06c"), blobGeo(0.3, -0.2, 1.15, -0.12, "#6ab24f")]),
    mergeGeometries([trunk(0.5), blobGeo(0.42, 0, 0.86, 0, "#5f9c3a"), blobGeo(0.33, 0.02, 1.26, 0.02, "#74b347"), blobGeo(0.21, 0, 1.56, 0, "#86c449")]),
    mergeGeometries([trunk(0.5), blobGeo(0.44, 0, 0.9, 0, P.autumn), blobGeo(0.3, 0.2, 1.17, 0.07, "#f7a257"), blobGeo(0.28, -0.18, 1.1, -0.1, "#e57a2c")]),
    mergeGeometries([trunk(0.35), paint(new THREE.ConeGeometry(0.42, 0.75, 7).translate(0, 0.72, 0).toNonIndexed(), "#4f8f3a"), paint(new THREE.ConeGeometry(0.32, 0.6, 7).translate(0, 1.1, 0).toNonIndexed(), "#5fa346")]),
  ];
  BUSH_GEO = mergeGeometries([blobGeo(0.22, 0, 0.17, 0, "#6cb455"), blobGeo(0.17, 0.19, 0.13, 0.05, "#80c463"), blobGeo(0.15, -0.17, 0.12, -0.05, "#5aa64a")]);
}
const FLOWER_COLORS = ["#ff8fb1", "#ffffff", "#ffd75e", "#ff6f7d", "#c9a2ff"];
function buildTrees() {
  const rand = rng(7), placed = treeXZ, inst = [[], [], [], [], []], spots = [];
  const patch = (x, z, n, s) => { for (let k = 0; k < n; k++) { const px = x + (rand() - 0.5) * s * 2, pz = z + (rand() - 0.5) * s * 2; spots.push([px, groundY(px, pz), pz]); } };
  const onRoad = (x, z) => ROADS.some(c => Math.abs(x - c) < RW / 2 + SW + 0.25 || Math.abs(z - c) < RW / 2 + SW + 0.25) || Math.hypot(x, z) < RR + RW / 2 + SW + 0.25;
  const blocked = (x, z) => onRoad(x, z) || exRects.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1) || decorSlots.some(s => Math.hypot(x - s.x, z - s.z) < 0.7)
    || [...graph.nodes.values()].some(n => n.door && Math.hypot(x - n.x, z - n.z) < 0.8);
  for (const L of graph.lines) for (const side of [-1, 1]) for (let u = L.t0 + 1.0; u < L.t1 - 0.5; u += 1.2) {   // 行道樹：沿人行道等距一排
    const off = RW / 2 + SW / 2, x = L.vert ? L.r + side * off : u, z = L.vert ? u : L.r + side * off;
    if (ROADS.some(c => Math.abs(u - c) < RW / 2 + SW + 0.3) || (L.r === 0 && Math.abs(u) < RR + RW / 2 + SW + 0.3) || !inside(mainPoly, x, z, 0.3)) continue;
    if (graph.lamps.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 0.75) || [...graph.nodes.values()].some(n => n.door && Math.hypot(x - n.x, z - n.z) < 0.9)) continue;
    if (placed.some(([a, b]) => Math.hypot(a - x, b - z) < 0.75)) continue;
    placed.push([x, z]); inst[rand() < 0.7 ? 0 : 1].push([x, 0.075, z, 0.5 + rand() * 0.08, rand() * 6.28]); blob(x, z, 0.65, 0.075);
  }
  for (let x = -12; x <= 12; x += 0.5) for (let z = -12; z <= 12; z += 0.5) {
    const jx = x + (rand() - 0.5) * 0.35, jz = z + (rand() - 0.5) * 0.35;
    if (!inside(islPoly, jx, jz, 0.35) || blocked(jx, jz) || placed.some(([a, b]) => Math.hypot(a - jx, b - jz) < 0.8)) continue;
    const coast = !inside(mainPoly, jx, jz, 1.2), r = rand(), y = groundY(jx, jz);
    if (r < (coast ? 0.6 : 0.2)) { placed.push([jx, jz]); const v = rand(); inst[v < 0.45 ? 0 : v < 0.65 ? 1 : v < 0.85 ? 2 : 3].push([jx, y, jz, 0.85 + rand() * 0.3, rand() * 6.28]); blob(jx, jz, 1.1, y); }
    else if (r < (coast ? 0.72 : 0.3)) { placed.push([jx, jz]); inst[4].push([jx, y, jz, 0.8 + rand() * 0.4, rand() * 6.28]); blob(jx, jz, 0.6, y); }
    else if (r < 0.4) patch(jx, jz, 4, 0.2);
  }
  inst.forEach((list, v) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(v < 4 ? TREE_GEOS[v] : BUSH_GEO, vcMat, list.length);
    list.forEach(([x, y, z, s, r], k) => { _m4.compose(_v.set(x, y, z), _q.setFromAxisAngle(_s.set(0, 1, 0), r), _s.set(s, s, s)); im.setMatrixAt(k, _m4); });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  });
  // 圓環中間的花
  for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28; spots.push([Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95]); }
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshLambertMaterial(), spots.length);
  spots.forEach(([x, y, z], k) => { _m4.makeTranslation(x, y + 0.07 + rand() * 0.04, z); flowers.setMatrixAt(k, _m4); flowers.setColorAt(k, _c.set(FLOWER_COLORS[k % FLOWER_COLORS.length])); });
  flowers.castShadow = false; scene.add(flowers);
}
function buildBlobs() {
  const m = blobMesh(blobs.length);
  blobs.forEach(([x, y, z, r], k) => { _m4.compose(_v.set(x, y, z), _q.identity(), _s.set(r, 1, r)); m.setMatrixAt(k, _m4); });
  scene.add(m);
}

// =========================================================
// 會走路的：寵物（hub.setPets）與兩台慢慢開的小車；照路網走、靠右、前面有人就等、等太久就掉頭
// =========================================================
function edgePoint(e, s, out) {
  s = Math.max(0, Math.min(e.len, s));
  let i = 1; while (i < e.cum.length - 1 && e.cum[i] < s) i++;
  const a = e.pts[i - 1], b = e.pts[i], u = (s - e.cum[i - 1]) / ((e.cum[i] - e.cum[i - 1]) || 1);
  out.x = a.x + (b.x - a.x) * u; out.z = a.y + (b.y - a.y) * u; out.hx = b.x - a.x; out.hz = b.y - a.y;
  const l = Math.hypot(out.hx, out.hz) || 1; out.hx /= l; out.hz /= l; return out;
}
const CAM_YAW = Math.PI / 4;                            // 面向鏡頭的方向
function turnTo(cur, want, k) { const d = ((want - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return cur + d * k; }
let agentRand = rng(99);
function placeAgent(a, kind) {
  const pool = graph.edges.filter(e => !e.spur && !shut(e) && (kind !== "car" || (e.a.edges.length > 1 && e.b.edges.length > 1)));
  // 找一段沒人的路段放
  for (let tries = 0; tries < 40; tries++) {
    const e = pool[Math.floor(agentRand() * pool.length)], s = agentRand() * e.len, fwd = agentRand() < 0.5;
    const q = edgePoint(e, fwd ? s : e.len - s, {});
    if (agents.every(o => o === a || Math.hypot(o.x - q.x, o.z - q.z) > 1.4)) { Object.assign(a, { e, s, fwd, x: q.x, z: q.z, hx: fwd ? q.hx : -q.hx, hz: fwd ? q.hz : -q.hz }); return; }
  }
  const e = pool[0]; Object.assign(a, { e, s: 0, fwd: true, x: e.a.x, z: e.a.z, hx: 1, hz: 0 });
}
// 路網找路（BFS）：從節點 n 到 target 的第一段路
function routeStep(n, target) {
  const prev = new Map([[n, null]]), q = [n];
  while (q.length) { const c = q.shift(); if (c === target) break; for (const e of c.edges) { if (shut(e)) continue; const o = e.a === c ? e.b : e.a; if (!prev.has(o) && (!o.door || o === target)) { prev.set(o, [c, e]); q.push(o); } } }
  if (!prev.has(target)) return null;
  let c = target, first = null; while (prev.get(c)) { const [pc, e] = prev.get(c); first = e; c = pc; }
  return first;
}
function nextEdge(a) {
  if (a.path) {                                         // 出任務的車：照算好的整條路開；開到了停住、交給 onArrive
    const st = a.path.shift();
    if (st) { a.e = st.e; a.fwd = st.fwd; a.s = 0; return; }
    a.path = null; a.arrived = true; a.pause = 1e9; const cb = a.onArrive; a.onArrive = null; if (cb) cb(a); return;
  }
  const n = a.fwd ? a.e.b : a.e.a;
  if (a.home) {                                         // 要回寵物公園休息
    if (n === parkDoor) { restPet(a); wakeOne(); return; }
    const e = routeStep(n, parkDoor); if (e) { a.e = e; a.fwd = e.a === n; a.s = 0; return; }
    a.home = false;
  }
  if (n.door && a.kind === "pet") { a.pause = 2 + agentRand() * 2.5; a.atDoor = true; a.fwd = !a.fwd; a.s = 0; return; }   // 到建築門口：停一下、轉身看鏡頭，再走回去
  let opts = n.edges.filter(e => e !== a.e && (a.kind === "pet" || !e.spur) && !(e.spur && (e.a === parkDoor || e.b === parkDoor || (e.a.door || e.b.door || {}).locked)) && !shut(e));   // 還在施工（門口有路障）的不走進去；新市區沒開不過橋
  if (a.kind === "pet" && opts.length === 1 && opts[0].rbGate && opts[0].a === n && agentRand() < 0.5) { a.fwd = !a.fwd; a.s = 0; return; }   // 走到主島西邊路底（彩虹橋頭）：一半機會掉頭，主島不會一下子空掉
  if (a.kind === "pet") { const sp = opts.filter(e => e.spur), rd = opts.filter(e => !e.spur); opts = sp.length && agentRand() < 0.3 ? sp : rd.length ? rd : opts; }
  if (!opts.length) { a.fwd = !a.fwd; a.s = 0; return; }   // 路的盡頭（海邊）：掉頭
  const e = opts[Math.floor(agentRand() * opts.length)];
  a.e = e; a.fwd = e.a === n; a.s = 0;
}
// 寵物公園：休息（坐到空位；位子滿了就進小屋裡＝看不到）、出門（從公園門口走出去）
function restPet(a) {
  a.e = null; a.home = false; a.moving = false; a.pause = 0; a.atDoor = false; a.restSince = performance.now();
  const used = new Set(agents.filter(o => o !== a && o.kind === "pet" && !o.e && o.slot >= 0).map(o => o.slot));
  a.slot = restSlots.findIndex((sl, i) => !used.has(i));
  if (a.slot >= 0) { a.x = restSlots[a.slot].x; a.z = restSlots[a.slot].z; a.holder.visible = true; } else a.holder.visible = false;
}
function wakeOne() {
  const resting = agents.filter(o => o.kind === "pet" && !o.e).sort((p, q) => p.restSince - q.restSince);
  if (!resting.length || !parkDoor) return;
  const a = resting[0], sp = parkDoor.edges[0], freed = a.slot;
  Object.assign(a, { e: sp, fwd: sp.b !== parkDoor, s: 0, x: parkDoor.x, z: parkDoor.z, slot: -1, pause: 0, wait: 0, home: false });
  a.holder.visible = true;
  if (freed >= 0) { const hidden = agents.find(o => o.kind === "pet" && !o.e && o.slot < 0 && o !== a); if (hidden) { hidden.slot = freed; hidden.x = restSlots[freed].x; hidden.z = restSlots[freed].z; hidden.holder.visible = true; } }
}
// 每 9 秒輪一次：路上挑一隻回公園，公園休息最久的出來（路上最多 MAX_WALK 隻）
function rotatePets(now) {
  if (noPause) return;                                 // 交會測試中：不輪替
  const walking = agents.filter(o => o.kind === "pet" && o.e), resting = agents.filter(o => o.kind === "pet" && !o.e);
  if (walking.length < MAX_WALK && resting.length) { wakeOne(); return; }
  if (!resting.length || now - lastRotate < 9000 || walking.some(o => o.home)) return;
  lastRotate = now;
  const cand = walking.filter(o => !o.jump && !o.e.spur); if (cand.length) cand[Math.floor(agentRand() * cand.length)].home = true;
}
const _q1 = {};
function stepAgents(t, dt) {
  rotatePets(performance.now());
  for (const a of agents) {
    if (!a.e) continue;
    if (a.pause > 0) { a.pause -= dt; a.moving = false; continue; }
    // 前面同一條車道（橫向很近）有人 → 等；對向車道（靠右錯開）照走；等太久（互相卡住）→ 掉頭
    let blocked = false;
    if (!a.vip) for (const o of agents) {
      if (o === a || !o.e) continue;
      const dx = o.x - a.x, dz = o.z - a.z, ahead = dx * a.hx + dz * a.hz, sum = a.r + o.r;
      if (ahead > 0.05 && ahead <= sum + 0.35 && Math.abs(dx * a.hz - dz * a.hx) < sum * 0.45) { blocked = true; break; }
    }
    a.atDoor = false;
    if (blocked) { a.wait += dt; a.moving = false; if (a.wait > 2.2) { a.wait = 0; a.turns = (a.turns || 0) + 1; a.fwd = !a.fwd; a.s = a.e.len - a.s; } }
    else {
      a.wait = 0; a.moving = true;
      a.s += a.speed * dt;
      let guard = 0; while (a.e && a.s >= a.e.len && guard++ < 4) { const over = a.s - a.e.len; nextEdge(a); if (a.arrived) { a.s = a.e.len; break; } a.s = over; if (a.pause > 0) break; }
      if (!a.e) continue;                                // 回到寵物公園休息了
      if (a.kind === "pet" && !noPause && !a.home && agentRand() < dt * 0.04) a.pause = 1.5 + agentRand() * 1.5;   // 偶爾停下來看看
    }
    const q = edgePoint(a.e, a.fwd ? a.s : a.e.len - a.s, _q1);
    const hx = a.fwd ? q.hx : -q.hx, hz = a.fwd ? q.hz : -q.hz;
    const lane = a.e.spur ? 0 : a.lane;
    const tx = q.x - hz * lane, tz = q.z + hx * lane;      // 靠右走（行進方向的右手邊）
    const k = Math.min(1, dt * 10);
    a.x += (tx - a.x) * k; a.z += (tz - a.z) * k;          // 轉彎時位置平滑過去，不會瞬移
    a.hx = hx; a.hz = hz;
  }
}
// 走在人行道上（走小路進門口時會經過）要墊高 0.075，不然腳會陷進去
function walkY(x, z) {
  let d;
  if (x < RB.x + RB.hx + 0.1) d = rbRoadD(x, z);        // 彩虹島：環狀路＋接橋那段
  else { d = Math.abs(Math.hypot(x, z) - RR); for (const c of ROADS) d = Math.min(d, Math.abs(x - c), Math.abs(z - c)); }
  return groundY(x, z) + (d > RW / 2 && d < RW / 2 + SW ? 0.075 : 0);
}
function updateAgentVisuals(t, dt) {
  let n = 0;
  for (const a of agents) {
    if (!a.holder || !a.holder.visible) continue;
    const gy = walkY(a.x, a.z); a.holder.position.set(a.x, gy + 0.045, a.z);
    a.yaw = turnTo(a.yaw || 0, a.moving || a.kind === "car" ? Math.atan2(a.hx, a.hz) : CAM_YAW, Math.min(1, dt * 6));   // 停下來就轉頭看鏡頭
    a.holder.rotation.y = a.yaw;
    if (a.kind === "pet") {
      a.phase = (a.phase || 0) + (a.moving ? dt * 9 : 0);
      const lift = Math.sin(a.phase) * 0.06;
      if (a.legA) { a.legA.position.y = Math.max(0, lift); a.legB.position.y = Math.max(0, -lift); }
      a.body.position.y = a.moving ? Math.abs(Math.sin(a.phase)) * 0.03 : 0;
      if (a.jump) { const u = (performance.now() - a.jump) / 600; if (u >= 1) { a.jump = 0; a.obj.position.y = 0; a.obj.rotation.y = 0; } else { a.obj.position.y = Math.sin(Math.PI * u) * 0.6; a.obj.rotation.y = easeOutBack(u) * Math.PI * 2; } }
      if (a.spark) a.spark.rotation.y = t * 2;
    }
    _m4.compose(_v.set(a.x, gy + 0.06, a.z), _q.identity(), _s.set(a.r * 2.6, 1, a.r * 2.6)); agentBlob.setMatrixAt(n++, _m4);
  }
  agentBlob.count = n; agentBlob.instanceMatrix.needsUpdate = true;
}
// 寵物模型：身體（＋尾巴等）合成一個 mesh、四隻腳分兩組（對角線同一組）→ 每隻 3 個 draw call，走路時兩組輪流抬腳
function splitPet(obj, crowd) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4(), groups = { body: [], A: [], B: [] };   // obj 是最上層：world＝它自己的縮放／位移，一起烤進去
  obj.traverse(o => { if (!o.isMesh) return; let n = o, name = ""; while (n && n !== obj) { name += n.name + " "; n = n.parent; }
    const leg = /leg/i.test(name), front = /front/i.test(name), left = /left/i.test(name);
    groups[leg && !crowd ? (front === left ? "A" : "B") : "body"].push(o); });
  const out = new THREE.Group(); const parts = {}, made = [];   // made＝合併出來的幾何（寵物移除時要釋放）
  for (const [k, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const byMat = new Map(); for (const o of list) { const m = o.material; if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(o); }
    const g = new THREE.Group(); out.add(g); parts[k] = g;
    for (const [m, ms] of byMat) {
      const geos = ms.map(o => { const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()); for (const nm of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "color"].includes(nm)) geo.deleteAttribute(nm); if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2)); geo.morphAttributes = {}; geo.clearGroups(); return geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); });
      const hasColor = geos.every(gg => gg.attributes.color); if (!hasColor) geos.forEach(gg => gg.deleteAttribute("color"));
      const merged = mergeGeometries(geos); if (!merged) continue;
      const mm = new THREE.Mesh(merged, m); mm.castShadow = false; mm.receiveShadow = true; g.add(mm); made.push(merged);
    }
  }
  return { group: out, parts, geos: made };
}
async function spawnPet(p) {
  let url = await usableGlb(p.glb);
  const base = (p.glb || "").split("/").pop().replace(/\.glb$/, "");
  if (!url && PET_KENNEY[base]) url = `${KIT}cube-pets/${PET_KENNEY[base]}.glb`;   // 自製版還沒好：先用 Kenney 原版
  if (!url) {                                           // models.json 沒有這隻（例如小熊、青蛙還沒做好）：跳過，主控台講一次
    if (!warnedPets.has(base)) { warnedPets.add(base); console.warn("[hub3d] models.json 沒有這隻寵物的模型，先不放到島上：", p.glb); }
    failedPets.add(p.id + "|" + p.glb); return null;
  }
  const raw = await loadAny(url, { h: PET_H });
  if (dead || !petWant || !petWant.some(q => q.id === p.id) || pets.has(p.id)) return null;
  const { group, parts, geos } = splitPet(raw, petWant.length > 14);   // 寵物很多：每隻只用 1 個 draw call（腳不分開動，身體上下彈）
  const obj = new THREE.Group(); obj.add(group);
  const holder = new THREE.Group(); holder.add(obj); scene.add(holder);
  // 掛點（models.json 的 anchors，模型原始座標）→ 乘上同一個縮放；沒有就用身高估
  const an = url.startsWith(MODELS) ? (await models()).anchors[base] : null, fitM = raw.userData.fit;
  const anchor = (k, dflt) => an && an[k] ? new THREE.Vector3(...an[k]).applyMatrix4(fitM) : dflt;
  const a = { kind: "pet", id: p.id, f: p, holder, obj, geos, body: parts.body || group, legA: parts.A, legB: parts.B, speed: 0.5 + agentRand() * 0.15, lane: LANE, r: 0.4, pause: 0, wait: 0, turns: 0, slot: -1, yaw: CAM_YAW,
    fitScale: new THREE.Vector3().setFromMatrixScale(fitM).x, anchors: { head: anchor("head", new THREE.Vector3(0, PET_H, 0)), back: anchor("back", new THREE.Vector3(0, PET_H * 0.72, -0.45)), head_side: anchor("head_side", new THREE.Vector3(0.25, PET_H * 0.97, 0.25)) } };
  const hit = new THREE.Mesh(box(1.0, 1.2, 1.0), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.6; hit.userData.pet = a; holder.add(hit); a.hit = hit;
  holder.userData.agent = a;
  const walking = agents.filter(o => o.kind === "pet" && o.e).length;
  agents.push(a); pets.set(p.id, a);
  if (walking < MAX_WALK || !parkDoor) placeAgent(a, "pet"); else restPet(a);   // 路上已經夠多：先在寵物公園休息
  applyStage(a, p.stage);
  return a;
}
// 配件（models.json 有列才載；10-12 寵物換裝）：原點＝掛點（頭上 head＝頭頂、旁邊 head_side＝頭側、背上 back＝背後上方）。
// 擺法跟換裝畫面（js/zhuyin-dress.js createDressRig）同一套：位置＝掛點＋wear_fit 微調 p×縮放、大小＝縮放×s、旋轉＝r（度）；蝴蝶結那一點歪頭也在 wear_fit.items 裡
const WEAR = { hat: "head", crown: "head", flower_crown: "head", party_hat: "head", baby_tuft: "head", bow: "head_side", flower: "head_side", cape: "back", wings: "back", backpack: "back", cape_rainbow: "back" };
const DEG = Math.PI / 180;
async function wear(a, name) {
  const pose = RWD.wearPose((await models()).fit, a.id, name); if (pose.hide) return null;   // hide＝這隻穿這件不好看（例：太大的頭），不顯示
  const url = await usableGlb(`${MODELS}${name}.glb`); if (!url) return null;
  const m = await loadAny(url);
  m.scale.setScalar(a.fitScale * pose.s);
  m.position.set(pose.p[0], pose.p[1], pose.p[2]).multiplyScalar(a.fitScale).add(a.anchors[WEAR[name]]);
  m.rotation.set(pose.r[0] * DEG, pose.r[1] * DEG, pose.r[2] * DEG);
  m.userData.wear = name;
  m.traverse(o => { o.castShadow = false; });
  return m;
}
const wearSig = w => w && typeof w === "object" ? [w.head, w.side, w.back].map(x => x || "").join(",") : "";
async function applyStage(a, stage) {
  stage = STAGE_SCALE[stage] ? stage : 2; a.stage = stage;
  const s = STAGE_SCALE[stage], token = {}; a.wearToken = token;
  a.obj.scale.setScalar(s); a.hit.scale.setScalar(s); a.r = 0.4 * s;
  for (const m of a.worn || []) a.body.remove(m);
  a.worn = [];
  if (a.spark) { a.obj.remove(a.spark); a.spark = null; }
  // 穿什麼＝p.wear { head, side, back }（zhuyin.js hubPets 用 RW.wearOf 算好：玩家自己選的優先，沒選的超級寵物＝皇冠＋披風）；沒給就照同一個規則算預設
  // 寶寶頭上空著＝頭頂小芽；超級＝身邊閃光
  const w = a.f.wear && typeof a.f.wear === "object" ? a.f.wear : RWD.wearOf({ pets: { [a.id]: { stage } } }, a.id);
  const names = [w.head, w.side, w.back].filter(n => n && WEAR[n]);
  if (stage === 1 && !w.head) names.push("baby_tuft");
  if (stage === 3) {
    const sp = new THREE.Group(); a.spark = sp; sp.userData.dyn = true; a.obj.add(sp);
    for (let k = 0; k < 3; k++) mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: "#fff3a0", toneMapped: false }), { x: Math.cos(k * 2.1) * 0.55, y: 0.5 + k * 0.25, z: Math.sin(k * 2.1) * 0.55, parent: sp, shadow: false });
  }
  const ms = await Promise.all(names.map(n => wear(a, n).catch(() => null)));
  if (a.wearToken !== token) return;
  for (const m of ms) if (m) { a.body.add(m); a.worn.push(m); }
}
function removeAgent(a) { if (a.sickTag) { a.sickTag.remove(); a.sickTag = null; } scene.remove(a.holder); for (const g of a.geos || []) g.dispose(); const i = agents.indexOf(a); if (i >= 0) agents.splice(i, 1); }   // 配件是共用快取，不釋放
const spawning = new Set();
function syncPets() {
  if (!built || !petWant) return;                     // 建築都到了才載寵物（先把頻寬讓給建築）
  const want = new Map(petWant.map(p => [p.id, p]));
  for (const [id, a] of pets) {
    const w = want.get(id);
    if (!w || (w.glb || "") !== (a.f.glb || "")) { removeAgent(a); pets.delete(id); continue; }
    const changed = wearSig(w.wear) !== wearSig(a.f.wear);   // 換裝畫面改了穿著 → 重穿
    a.f = w; if (w.stage !== a.stage || changed) applyStage(a, w.stage);
  }
  for (const p of petWant) if (!pets.has(p.id) && !spawning.has(p.id) && !failedPets.has(p.id + "|" + p.glb)) {
    spawning.add(p.id);
    spawnPet(p).catch(e => { failedPets.add(p.id + "|" + p.glb); console.warn("[hub3d] 寵物模型載入失敗", p.id, e); }).finally(() => { spawning.delete(p.id); syncPets(); });   // 載入中名單變了 → 再對一次
  }
}
function spawnCars() {
  for (let k = 0; k < 2; k++) {
    const holder = new THREE.Group(); scene.add(holder);
    mesh(carGeo(CAR_COLORS[k + 1]), vcMat, { parent: holder, shadow: false });
    const a = { kind: "car", id: "car" + k, holder, speed: 0.75, lane: LANE + 0.02, r: 0.62, pause: 0, wait: 0, yaw: 0 };
    placeAgent(a, "car"); agents.push(a);
  }
}

// =========================================================
// 裝飾（hub.setDecor）：依序擺到預留的放置點
// =========================================================
async function applyDecor() {
  if (!built || !decorWant) return;
  const list = decorWant.slice(0, decorSlots.length), token = {}; applyDecor.token = token;
  const objs = await Promise.all(list.map(async d => { const u = await usableGlb(d.glb); return u ? loadAny(u, { h: 1.3, w: 0.9 }).catch(() => null) : null; }));
  if (applyDecor.token !== token || dead) return;
  if (decorGroup) { scene.remove(decorGroup); decorGroup = null; }
  if (decorBlob) { scene.remove(decorBlob); decorBlob = null; }
  const g = new THREE.Group(), bl = []; let n = 0;
  objs.forEach((o, i) => { if (!o) return; const s = decorSlots[i], y = groundY(s.x, s.z); o.position.set(s.x, y, s.z); o.rotation.y = s.ry; g.add(o); bl.push([s.x, y + 0.012, s.z, 0.9]); n++; });
  mergeStatic(g); scene.add(g); decorGroup = g; decorGroup.userData.count = n;
  decorBlob = blobMesh(bl.length); bl.forEach(([x, y, z, r], k) => { _m4.compose(_v.set(x, y, z), _q.identity(), _s.set(r, 1, r)); decorBlob.setMatrixAt(k, _m4); }); scene.add(decorBlob);
  shadowDirty = true;
}

// =========================================================
// 浮標（DOM，疊在 canvas 上；國字旁的注音由 zhuyin-ann 自動加）
// =========================================================
const cardOf = m => document.querySelector(`.mode-card[data-mode=${m}]`);
let tagRO = null;
// 浮標內容：平常只看得到圓形圖示（.ht-ico）；名字那段（.ht-more：國字／🔒 N）收合時寬度 0，展開時 0.2 秒拉開
// .ht-txt 永遠是自然寬度（收合時被 .ht-in 裁掉）→ 不管現在收著還是開著，都量得到「收合／展開」各多大（tagSizes）
// （10-12 晚 阿葉：「不用把新的遊戲特別標出來，小孩玩久就知道了」→ 拿掉「新」，每棟一律平常只有圓形圖示）
const TAG_HTML = '<span class="ht-row"><span class="ht-ico"></span><span class="ht-more"><span class="ht-in"><span class="ht-txt"><span class="ht-word"></span><span class="ht-lock"></span></span></span></span></span><span class="ht-badge">🔒</span>';
function makeTags() {
  for (const d of DEFS) {
    const t = document.createElement("button"); t.className = "hub-tag" + (d.isle === "rainbow" ? " rb" : d.isle === "town" ? " civic tw" : ""); t.type = "button"; t.dataset.mode = d.mode; t._def = d;   // 彩虹島的浮標多一個 .rb（只在彩虹島顯示）；歸仁區的遊戲（陀螺競技場）＝.civic（跟設施一樣只在歸仁區顯示、同一種底色）＋.tw
    t.innerHTML = TAG_HTML;
    t.addEventListener("pointerdown", () => { preloadCard(d); pressTag(t); });
    t.addEventListener("pointerup", () => releaseTag(true)); t.addEventListener("pointercancel", () => releaseTag(false));
    t.addEventListener("click", () => tapBuilding(d));
    tagLayer.appendChild(t); d.tag = t;
  }
  // 浮標大小變了 → 下一格重量位置；名字那段（.ht-txt）的自然寬度變了（換字、注音補上、「新」）才重擺鏡頭——
  // 按住／拉近展開名字只是浮標變寬，鏡頭不重擺（不然貓頭鷹收起來之後一按建築，整座島會跳一下）
  if ("ResizeObserver" in window) { tagRO = new ResizeObserver(es => { tagDirty = true; if (es.some(e => e.target.classList.contains("ht-txt"))) needFit = true; }); DEFS.forEach(d => { tagRO.observe(d.tag); tagRO.observe(d.tag.querySelector(".ht-txt")); }); }
}
// ----- 浮標精簡（10-12 阿葉：「關卡變多了，名字一直顯示太雜亂」）-----
// 平常只有圓形圖示；名字只在這些時候展開：拉近（≥ 1.25 倍）全部、手指按住某棟（那一棟）、介紹卡開著的那一棟（sel）。拉遠（≤ 0.7 倍）圖示縮小一點
// 倍數以「人在的那座島」的預設倍數為準（歸仁區預設就 1.3 倍）；只顯示人在的那座島的浮標（本來就是）
const ZOOM_MIN = 0.5, ZOOM_MAX = 1.6, NEAR_Z = 1.25, FAR_Z = 0.7, FAR_SCALE = 0.78;
const LOD = { near: false, far: false, press: null, pressUntil: 0 };
let fitObsMax = [];                                    // 固定介面（貓頭鷹對話框以最大會多大算）：展開名字的浮標要避開的
let tagDirty = true, tagAnimUntil = 0;                // 浮標大小變了（ResizeObserver 通知）或正在展開／收合（0.2 秒＋一點）才每格重量，平常不碰排版
const tagLive = () => tagDirty || performance.now() < tagAnimUntil;
function lodStep() {
  const base = placeZoom(PLACE[town.place] || PLACE.main), z = town.zoomTgt || user.zoom;   // 飛去別座島的途中：照目的地的倍數（不會一路開開關關）
  const nearAt = Math.min(NEAR_Z * base, ZOOM_MAX - 0.1), farAt = FAR_Z * base;
  LOD.near = !!LOD.forceNear || (LOD.near ? z >= nearAt - 0.04 : z >= nearAt);   // 門檻上下留一點：捏在門檻附近不會一直閃（forceNear：測試用 openAll）
  const far = LOD.far ? z <= farAt + 0.04 : z <= farAt;
  if (far !== LOD.far) { LOD.far = far; tagLayer.classList.toggle("far", far); }
  if (LOD.press && performance.now() > LOD.pressUntil) LOD.press = null;
  // 按住的那一下：浮標層暫時疊到貓頭鷹對話框、下面膠囊上面（還是在上方圓鈕下面）——離貓頭鷹太近、左右挪不開的名字也看得完整；收回去（0.2 秒）後才降回來
  const now = performance.now(); if (LOD.press) LOD.zUntil = now + 300;
  const up = now < (LOD.zUntil || 0); if (up !== !!LOD.zUp) { LOD.zUp = up; tagLayer.classList.toggle("pressing", up); }
}
function setOpen(tag, on) { if (tag._open !== on) { tag._open = on; tag.classList.toggle("open", on); tagAnimUntil = performance.now() + 350; } }   // 拉開那 0.2 秒每格量現在的寬度（位置、尾巴才跟得上）
const wantOpen = tag => LOD.near || LOD.press === tag || (!!sel && sel.tag === tag);
function pressTag(tag) { LOD.press = tag || null; LOD.pressUntil = Infinity; }   // 按下去那一刻：那一棟的名字彈出來
function releaseTag(keep) { if (!LOD.press) return; if (keep) LOD.pressUntil = performance.now() + 700; else LOD.press = null; }   // 放開：再留 0.7 秒（點一下也看得到名字）；拖曳／雙指＝馬上收
// 收合／展開各多大（px，不含拉遠縮小；現在收著還是開著都量得到）：.ht-txt 是名字那段的自然寬度
function tagSizes(t) {   // 收合＝圓形圖示＋左右留白（不用「現在寬度－名字那段」相減：展開到一半時兩個都四捨五入，差 1px 鏡頭就會重擺）
  const h = t.offsetHeight; if (!h) return null;
  const ic = t.querySelector(".ht-ico"), cw = ic.offsetLeft * 2 + ic.offsetWidth;
  return { cw, ch: h, ow: cw + t.querySelector(".ht-txt").offsetWidth, oh: h };
}
function syncTag(d, card) {
  const set = (sel, txt) => { const e = d.tag.querySelector(sel); if (e.textContent !== txt) e.textContent = txt; };
  if (d.free) { const L = (opts.labels || {})[d.mode] || {}; set(".ht-ico", L.ico || ""); set(".ht-word", L.word || ""); set(".ht-lock", d.locked ? `🔒 ${RAINBOW_NEED}` : ""); d.tag.classList.toggle("locked", !!d.locked); return; }   // 寵物服裝店：彩虹島沒開＝鎖著
  const L = (opts.labels || {})[d.mode] || {};          // 10-12：浮標可以寫建築名（偵探社、陀螺競技場），卡片上寫短的
  set(".ht-ico", L.ico || card.querySelector(".big")?.textContent || "");
  set(".ht-word", L.word || card.querySelector(".label")?.textContent || "");
  set(".ht-lock", (card.querySelector(".lock")?.textContent || "").replace("📒", "").trim());   // 鎖住：只留「🔒 數字」
  d.tag.classList.toggle("locked", !!d.locked);
  d.tag.classList.toggle("first", d.mode === "fish" && opts.newbie());   // 新玩家唯一能玩的：常駐黃框
}
function setLocked(d, on, animate) {
  d.locked = on; shadowDirty = true;
  setGray(d.pivot, on);
  if (!animate || on) { d.lockDeco.visible = on; return; }
  const t0 = performance.now();                       // 剛解鎖：圍籬收掉、建築跳一下
  anims.add({ update(now) { const u = Math.min(1, (now - t0) / 700);
    d.lockDeco.scale.set(1, Math.max(0.001, 1 - u), 1);
    if (u >= 1) { d.lockDeco.visible = false; d.lockDeco.scale.set(1, 1, 1); shadowDirty = true; return false; } return true; } });
  later(() => bounce(d), 450);
}
// 新玩家第一次進來：手指點一下釣魚浮標（告訴他「點房子就能玩」）
let gateObs = null;
function playFinger() {
  if (fingerDone || dead || !shown || !opts.newbie()) return;
  if (document.body.classList.contains("gate-on")) {     // 開始畫面還蓋著（浮標也藏著）：等小孩按了「開始玩」再提示
    if (!gateObs) { gateObs = new MutationObserver(() => { if (!document.body.classList.contains("gate-on")) { gateObs.disconnect(); gateObs = null; later(playFinger, 700); } }); gateObs.observe(document.body, { attributes: true, attributeFilter: ["class"] }); }
    return;
  }
  fingerDone = true;
  finger = document.createElement("div"); finger.className = "hub-finger"; finger.innerHTML = "<span>👆</span>";
  tagLayer.appendChild(finger);
  later(() => { finger && finger.remove(); finger = null; }, 3400);
}

// =========================================================
// 點擊：建築彈一下 → 點那張卡片（扭蛋機 → onGacha）；動物跳一下＋唸名字
// =========================================================
function bounce(d, shake) {
  const t0 = performance.now(), piv = d.pivot;
  anims.add({ update(now) {
    const t = Math.min(1, (now - t0) / 560);
    if (shake) { piv.position.x = Math.sin(t * Math.PI * 6) * 0.08 * (1 - t); piv.position.y = 0; }
    else { const sq = Math.sin(t * Math.PI * 2.5) * 0.12 * (1 - t); piv.position.y = Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.4)) * 0.3 * (t < 0.72 ? 1 : 0)); piv.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5); }
    if (t >= 1) { piv.position.set(0, 0, 0); piv.scale.set(1, 1, 1); return false; }
    return true;
  } });
  const tg = d.tag; tg.classList.remove("pop", "hop"); void tg.offsetWidth; tg.classList.add("pop");
}
function preloadCard(d) { if (d.free) return; try { cardOf(d.mode)?.dispatchEvent(new PointerEvent("pointerdown")); } catch (e) {} }
// ----- 介紹卡（10-12 阿葉：「點下去想看是哪些關卡時就直接進入了，沒辦法決定是不是要玩這關」）-----
// 點一下遊戲建築／浮標＝選起來（sel）：浮標展開名字＋黃框、鏡頭平滑移過去（不縮放，建築放在介紹卡上面那塊空間的中間）、
// 主程式（opts.onPick）在下面彈出介紹卡、貓頭鷹唸名字；同一棟再點一次＝開始（跟以前點一下一樣：playDef）；點別棟＝換那棟。
// 點空白處、拖曳、縮放、換島、離開選單＝收起來（opts.onPick(null)）。沒給 opts.onPick（舊用法）＝點一下就開始
let sel = null;
const focus = { on: false };                            // 介紹卡開著：每格把鏡頭往「這棟在空間中間」的位置帶（介紹卡大小、飛去別座島的途中都跟得上）
function selectDef(d) {
  if (sel && sel !== d) sel.tag.classList.remove("sel");
  sel = d; d.tag.classList.add("sel"); focus.on = true;
  preloadCard(d); bounce(d);
  try { opts.onPick(d.mode, { locked: !!d.locked, isle: isleOf(d), need: d.free ? RAINBOW_NEED : 0 }); } catch (e) { console.warn("[hub3d] onPick", e); }
}
function deselect() {
  focus.on = false;
  if (!sel) return;
  sel.tag.classList.remove("sel"); sel = null;
  try { opts.onPick(null); } catch (e) {}
}
function playDef(d) {                                    // 開始玩（介紹卡的「開始玩」、同一棟點第二次）
  if (d.locked) {                                        // 鎖著：晃一下＋貓頭鷹說還差幾張（介紹卡留著）
    bounce(d, true);
    later(() => { if (!shown) return; if (d.mode === "dress") { try { opts.onCivic("rainbowLocked", { need: RAINBOW_NEED }); } catch (e) {} } else cardOf(d.mode)?.click(); }, 120);
    return;
  }
  deselect(); preloadCard(d); bounce(d);
  later(() => {
    if (!shown) return;
    if (d.mode === "gacha") { try { opts.onGacha(); } catch (e) {} }
    else if (d.mode === "dress") { try { opts.onDress(); } catch (e) {} }   // 寵物服裝店（10-12）
    else cardOf(d.mode)?.click();
  }, 260);
}
function tapBuilding(d) {
  if (isleOf(d) !== town.place) { tapIsle(isleOf(d)); return; }   // 別座島上的建築＝那座島（10-12：點遠方的島＝飛過去）
  const now = performance.now(); if (now < tapLockUntil) return; tapLockUntil = now + 450;   // 0.45 秒內連點兩下只算一下（不會一點就開始）
  if (sel === d || !opts.onPick) playDef(d); else selectDef(d);
}
// ----- 點遠方的島／橋頭路牌＝飛過去（10-12 阿葉：「地圖上也要有地方可以點擊進入，不然都只看到那邊空的很奇怪」）-----
// 還沒開的島：貓頭鷹說上鎖台詞（跟按地點鈕一樣的 onCivic），不飛過去
function tapIsle(p) {
  if (!PLACE[p] || p === town.place) return;
  const now = performance.now(); if (now < tapLockUntil) return; tapLockUntil = now + 700;
  deselect();
  if (p === "town" && !town.open) { try { opts.onCivic("townLocked", { need: DIST_NEED }); } catch (e) {} return; }
  if (p === "rainbow" && !rb.open) { try { opts.onCivic("rainbowLocked", { need: RAINBOW_NEED }); } catch (e) {} return; }
  if (opts.onIsle) { try { opts.onIsle(p); return; } catch (e) {} }
  goPlace(p);
}
// 地面上的一點屬於哪座島（橋＝通往「另一頭」那座島）；海＝null
function isleAt(x, z) {
  if (sdRainbow(x, z) < 0.9) return "rainbow";
  if (sdDist(x, z) < 0.9) return "town";
  const B = rb.bridge; if (B && x < B.xa + 0.3 && x > B.xb - 0.3 && Math.abs(z) < 1.4) return town.place === "rainbow" ? "main" : "rainbow";
  const T = town.bridge; if (T && Math.abs(x - T.cx) < 1.4 && z < T.z0 + 0.3 && z > T.z1 - 0.3) return town.place === "town" ? "main" : "town";
  if (sdIsland(x, z) < 0.9) return "main";
  return null;
}
// 鏡頭目標（user.px／py）：這棟（建築主體到浮標頂的中間）放在「上面介面底」到「介紹卡頂」之間的正中間；以飛到目的地後的位置／倍數算
function focusTarget(d) {
  const W = innerWidth, H = innerHeight, z = town.zoomTgt || user.zoom, k = view.k * z, inv = baseCam.matrixWorldInverse;
  if (!k) return null;
  _v.copy(d.body).add(d.root.position).applyMatrix4(inv); const bx = _v.x, by = _v.y;
  _v.copy(d.anchor).applyMatrix4(inv); const ax = _v.x, ay = _v.y;
  const th = ((d.th0 || 60) + TAIL) / k;                 // 浮標高（相機單位）
  const cx = (bx + ax) / 2, cy = (by + ay + th) / 2;
  const a = opts.pickArea ? opts.pickArea() : null;      // 介紹卡現在的頂（px）
  const y0 = Math.max(0, view.freeTop || 0), y1 = a && a.top > y0 + 40 ? a.top - 8 : H;
  const tx = W / 2, ty = (y0 + y1) / 2;
  // 不夾可拖範圍：那棟就在畫面中間＝一定看得到島（直式介紹卡佔掉下面快一半，島前排的釣魚、青蛙要往上移很多，夾了會被卡片蓋住）
  return { px: cx - view.cx - town.tgt.x - (tx - W / 2) / k, py: cy - view.cy - town.tgt.y + (ty - H / 2) / k };
}
function stepFocus(dt) {
  if (!focus.on || !sel) {                               // 收卡後：被帶出可拖範圍的鏡頭慢慢回到範圍裡（拖曳中不動）
    if (!focus.over || ptrs.size) return;
    const r = clampXY(user.px, user.py), k = 1 - Math.exp(-dt * 4);
    user.px += (r.px - user.px) * k; user.py += (r.py - user.py) * k;
    if (Math.abs(r.px - user.px) + Math.abs(r.py - user.py) < 0.01) { user.px = r.px; user.py = r.py; focus.over = false; }
    return;
  }
  const t = focusTarget(sel); if (!t) return;
  const k = 1 - Math.exp(-dt * 6);
  user.px += (t.px - user.px) * k; user.py += (t.py - user.py) * k;
  focus.over = true;
}
// 從清單（🗺️ 全部遊戲）選：人不在那座島就先飛過去，再開那棟的介紹卡。那座島還沒開＝false（主程式自己說）
function pickMode(m) {
  const d = DEFS.find(x => x.mode === m); if (!d || dead) return false;
  const p = isleOf(d);
  if ((p === "town" && !town.open) || (p === "rainbow" && !rb.open)) return false;
  if (p !== town.place) goPlace(p);
  selectDef(d);
  return true;
}
function tapPet(a) {
  if (a.jump) return;
  a.jump = performance.now();
  try { opts.onFriend(a.f); } catch (e) {}
}
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
raycaster.params.Line.threshold = 0.02;                // 預設 1 單位太寬：細線（釣魚線、氣球繩）會擋住一大片
function pick(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const vis = agents.filter(a => a.hit && a.holder.visible);
  const pm = raycaster.intersectObjects(vis.map(a => a.obj), true).find(h => h.object.isMesh);
  const bm = raycaster.intersectObjects(DEFS.map(d => d.pivot), true).find(h => h.object.isMesh);
  const agentOf = o => { while (o && !o.userData.agent) o = o.parent; return o && o.userData.agent; };
  const defHit = d => isleOf(d) === town.place ? { def: d } : { isle: isleOf(d) };   // 別座島上的建築＝點那座島（10-12）
  if (pm && (!bm || pm.distance < bm.distance)) return { pet: agentOf(pm.object) };   // 真的點到寵物身上、而且寵物在建築前面
  if (bm) { let o = bm.object; while (o && !o.userData.def) o = o.parent; if (o) return defHit(o.userData.def); }
  const ph = raycaster.intersectObjects(vis.filter(a => !a.atDoor).map(a => a.hit), false);   // 寵物身邊一圈（小孩點不準）：停在門口的不算
  if (ph.length) return { pet: ph[0].object.userData.pet };
  const bh = raycaster.intersectObjects(hitBoxes, false);
  if (bh.length) return defHit(bh[0].object.userData.def);
  const ch = raycaster.intersectObjects(civHits, false);
  if (ch.length) return town.place === "town" ? { civic: ch[0].object.userData.civic } : { isle: "town" };   // 不在歸仁區：點設施＝飛過去
  const rh = raycaster.intersectObjects(rbHits.filter(o => o.userData.folk || !rb.open), false);   // 彩虹島居民（點房子也算）、還沒接好的彩虹橋
  if (rh.length) return rh[0].object.userData.folk ? (town.place === "rainbow" ? { folk: rh[0].object.userData.folk } : { isle: "rainbow" }) : { rbLock: true };
  const sh = raycaster.intersectObjects(signHits, false);   // 橋頭路牌（10-12）：在這座島上的＝它指的那座島；別座島上的＝那座島
  if (sh.length) { const s = sh[0].object.userData.sign; return { isle: s.at === town.place ? s.go : s.at }; }
  if (raycaster.ray.intersectPlane(GROUND, _v)) { const p = isleAt(_v.x, _v.z); if (p && p !== town.place) return { isle: p }; }   // 遠方的島（地面、橋）
  return null;
}
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ---------- 手勢：輕點、拖曳平移、雙指縮放 ----------
const ptrs = new Map(); let pinch = null;
function bindInput(cv) {
  cv.addEventListener("pointerdown", e => {
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    const p0 = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0, multi: ptrs.size > 0 };
    ptrs.set(e.pointerId, p0);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; a.multi = b.multi = true; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: user.zoom }; releaseTag(false); deselect(); }   // 雙指縮放＝收起介紹卡
    else { const hit = p0.hit = pick(e.clientX, e.clientY); if (hit && hit.def) preloadCard(hit.def);   // 10-12：按下那一刻就記住點到誰（按住期間取景可能在動，放開再算會偏到隔壁棟）
      pressTag(hit && hit.def && isleOf(hit.def) === town.place ? hit.def.tag : hit && hit.civic && town.place === "town" ? hit.civic.tag : null); }   // 按住建築：那一棟的名字彈出來
  });
  cv.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
    if (ptrs.size >= 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0)));
      panBy(dx / 2, dy / 2);
    } else if (p.moved >= TAP_MOVE) { panBy(dx, dy); releaseTag(false); deselect(); }   // 超過點擊容許範圍才算拖曳（按住彈出的名字收回、介紹卡收起來）
  });
  const up = e => {
    const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    releaseTag(e.type === "pointerup" && !p.multi && p.moved < TAP_MOVE);
    if (e.type === "pointerup" && !p.multi && p.moved < TAP_MOVE && performance.now() - p.t0 < TAP_MS) {
      const hit = p.hit || pick(p.x0, p.y0) || pick(e.clientX, e.clientY);   // 以按下去那一刻點到的為準（小孩常按著不放、或按著滑一下）
      if (!hit || !hit.def) deselect();                  // 點空白處／寵物／設施／居民／別座島＝收起介紹卡
      if (hit && hit.pet) tapPet(hit.pet); else if (hit && hit.def) tapBuilding(hit.def); else if (hit && hit.civic) tapCivic(hit.civic);
      else if (hit && hit.folk) tapFolk(hit.folk); else if (hit && hit.rbLock) tapRbLock(); else if (hit && hit.isle) tapIsle(hit.isle);
    }
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => { e.preventDefault(); deselect(); zoomAt(e.clientX, e.clientY, Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, user.zoom * Math.exp(-e.deltaY * 0.0015)))); }, { passive: false });
}
function panBy(dx, dy) { const k = view.k * user.zoom, from = { px: user.px, py: user.py }; user.px -= dx / k; user.py += dy / k; clampPan(from); }
function zoomAt(sx, sy, nz) {
  const W = innerWidth, H = innerHeight, k1 = view.k * user.zoom, k2 = view.k * nz, from = { px: user.px, py: user.py };
  user.px += (sx - W / 2) / k1 - (sx - W / 2) / k2; user.py -= (sy - H / 2) / k1 - (sy - H / 2) / k2;   // 縮放時手指下的那一點不動
  user.zoom = nz; clampPan(from);
}
// 島比畫面大：可以拖過去看海邊的景點（±7、±4.5）；拉遠（< 1 倍，10-12 最遠 0.5）時可拖的範圍慢慢收向「三座島的中間」、範圍變小——
// 拉到最遠一定看得到三座島（不管人在哪座島）、不會拖到整片海
function clampXY(px, py) {
  const t = Math.max(0, Math.min(1, (1 - user.zoom) / (1 - ZOOM_MIN))), c = view.isles;
  const dy = ((view.placeY ?? innerHeight / 2) - innerHeight / 2) / (view.k * user.zoom);   // 三座島放在上下介面之間的中線（直式上面兩排按鈕比較高）
  const ox = c ? (c.x - view.cx - town.tgt.x) * t : 0, oy = c ? (c.y + dy - view.cy - town.tgt.y) * t : 0, hx = 7 - 4 * t, hy = 4.5 - 2 * t;
  return { px: Math.max(ox - hx, Math.min(ox + hx, px)), py: Math.max(oy - hy, Math.min(oy + hy, py)) };
}
// 拖曳／縮放後夾回可拖範圍。介紹卡（10-12）會把鏡頭帶到範圍外（島邊的建築要移到卡片上面）：收卡後每格慢慢收回範圍（stepFocus），
// 這時候拖曳只能往範圍裡拖、不能更往外（from＝拖之前的位置；不會一拖就「跳」回範圍裡）
function clampPan(from) {
  const r = clampXY(user.px, user.py);
  if (!from || !focus.over) { user.px = r.px; user.py = r.py; return; }   // 平常（沒被介紹卡帶出範圍）＝跟以前一樣直接夾
  const f = clampXY(from.px, from.py), soft = (v, c, v0, c0) => v0 === c0 ? c : v0 > c0 ? Math.max(c, Math.min(v0, v)) : Math.min(c, Math.max(v0, v));
  user.px = soft(user.px, r.px, from.px, f.px); user.py = soft(user.py, r.py, from.py, f.py);
}

// =========================================================
// 鏡頭擺位：所有遊戲建築＋浮標都不能被標題、圓鈕、膠囊、貓頭鷹擋住（景點、海邊可以超出畫面）
// =========================================================
const baseCam = new THREE.OrthographicCamera();
function setCamDir(cam, az) { cam.position.set(Math.sin(az) * Math.cos(CAM_EL), Math.sin(CAM_EL), Math.cos(az) * Math.cos(CAM_EL)).multiplyScalar(60); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); }
function obstacles() {
  const out = [];
  for (const sel of ["#menu > h1", "#resumeBtn", "#townBtn", "#townTag", "#rainbowBtn", "#rainbowTag", "#menu > .menu-bottom", "#guide img", "#guideText", "#owlPeek", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#speakBtn", "#settingsBtn", "#hudLBtn", "#hudRBtn", "#mapBtn", "#plazaBtn"]) {   // （10-12 加 🗺️ 全部遊戲、🎪 同樂廣場——直式 🎪 在上面第二排，以前沒算）收起來的按鈕／貓頭鷹只是 visibility:hidden，照樣量得到＝照樣避開
    const e = document.querySelector(sel); if (!e || !e.offsetParent) continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (sel === "#resumeBtn") {                          // 繼續玩會輕跳（softHop：只往上跳 1.2vmin）：量「靜止位置」再往上多留跳的高度——
      const tf = getComputedStyle(e).transform, ty = tf && tf !== "none" ? new DOMMatrix(tf).m42 : 0, hop = Math.min(innerWidth, innerHeight) * 0.012;   // 以前上下都多留 24px（量到跳到一半的位置、鏡頭會漂），下面那 10px 白白壓縮了 4:3 的小島
      out.push({ x0: r.left - 14, x1: r.right + 14, y0: r.top - ty - hop - 14, y1: r.bottom - ty + 14, sel }); continue;
    }
    const pad = 14;                                      // （10-11 試過貼紙那排多留 2vmin：取景變擠、iPad 橫式反而碰到，撤回）
    const o = { x0: r.left - pad, x1: r.right + pad, y0: r.top - pad, y1: r.bottom + pad, owl: sel === "#guide img" || sel === "#guideText" || sel === "#owlPeek", sel };   // display:none（例如 3D 選單的標題）量不到 → 上面就略過了
    if (sel === "#guideText") {                          // 貓頭鷹的話會換（宣告、天氣）→ 對話框最大會多大（最寬、至少兩行，靠貓頭鷹那邊不動）：按住展開的名字要避開這個（10-12 浮標精簡）
      const cs = getComputedStyle(e), mw = parseFloat(cs.maxWidth) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
      const im = document.querySelector("#guide img"), ir = im && im.getBoundingClientRect(), right = !!ir && ir.left >= r.right - 4;   // 貓頭鷹在對話框右邊（橫式）＝右邊固定、往左長
      o.max = { x0: mw > 0 && right ? Math.min(o.x0, r.right - mw - pad) : o.x0, x1: mw > 0 && !right ? Math.max(o.x1, r.left + mw + pad) : o.x1, y0: Math.min(o.y0, r.bottom - 2 * lh - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - pad), y1: o.y1 };
    }
    out.push(o);
  }
  return out;
}
const TAIL = 12;
function fit() {
  const W = innerWidth, H = innerHeight;
  if (!W || !H) return false;
  const sizes = MAIN_DEFS.map(d => tagSizes(d.tag));   // 只用主島的建築擺鏡頭（彩虹島是另一個地點）
  if (sizes.some(s => !s)) return false;                // 浮標還沒顯示（量不到大小）→ 下一幀再擺
  const obs = obstacles(); fitObs = obs; fitObsMax = obs.map(o => o.max || o);
  const obsMax = fitObsMax.map(o => ({ x0: o.x0 - 10, x1: o.x1 + 10, y0: o.y0 - 8, y1: o.y1 + 8 }));   // 擺鏡頭時展開的名字多留一點：鏡頭會輕輕晃（±10px），剛好擦到底下膠囊就會被推去撞貓頭鷹
  // 飛去別座島時，島的中心對準「上面介面底」到「下面橫跨中間的介面頂」之間的中線（直式：上面有貼紙那排、下面是貓頭鷹的話）
  const freeTop = Math.max(0, ...obs.filter(o => o.y1 < H * 0.5 && o.x0 < W * 0.7 && o.x1 > W * 0.3).map(o => o.y1));
  // 橫式的貓頭鷹＋對話框在右下角，不算「橫跨中間」（v5 起 4:3 對話框加寬到 52vmin、左緣會稍微過中線；以前寬度 100vw−98vmin 剛好停在中線右邊）——不然彩虹島整座被往上推、服裝店浮標撞到右上「換人」
  const freeBot = Math.min(H, ...obs.filter(o => o.y0 > H * 0.5 && o.x0 < W / 2 && o.x1 > W / 2 && !(o.owl && W > H)).map(o => o.y0));
  view.placeY = (freeTop + freeBot) / 2;
  // 浮標大小用「收合／展開」兩種（10-12 浮標精簡）：按住、拉近展開名字時鏡頭不會跟著重擺
  view.freeTop = freeTop; view.freeBot = freeBot;          // 介紹卡把選到的那棟移到中間用（10-12）
  view.sgTop = Math.max(0, ...obs.filter(o => o.y1 < H * 0.4).map(o => o.y1));   // 路牌浮標貼邊時的上下界：上面一整排介面（不管在左在右）的底、下面一整排的頂（10-12）
  view.sgBot = Math.min(H, ...obs.filter(o => o.y0 > H * 0.6).map(o => o.y0));
  const sig = [W, H, ...sizes.map(s => `${s.cw},${s.ch},${s.ow},${s.oh}`), ...obs.map(o => `${o.x0 | 0},${o.y0 | 0},${o.x1 | 0},${o.y1 | 0}`)].join("|");
  if (sig === fitSig) return true;                     // 畫面大小、障礙物、浮標大小都沒變 → 不用重算
  fitSig = sig;
  setCamDir(baseCam, Math.PI / 4);
  const inv = baseCam.matrixWorldInverse;
  {                                                    // 三座島（主島、歸仁區、彩虹島）在相機座標的範圍中心：拉到最遠時鏡頭收向這裡（clampPan）
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const add = (x, z) => { _v.set(x, 0, z).applyMatrix4(inv); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); };
    for (const v of islPoly) add(v.x, v.y);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { add(DIST.x + a * DIST.h, DIST.z + b * DIST.h); add(RB.x + a * RB.hx, RB.z + b * RB.hz); add(TEX.x + a * TEX.hx, TEX.z + b * TEX.hz); }   // TEX：歸仁區東邊小半島（10-12）
    view.isles = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }
  const items = MAIN_DEFS.map((d, i) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const { min, max } = d.box;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) { _v.set(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    _v.copy(d.body).add(d.root.position).applyMatrix4(inv); const bx = _v.x, by = _v.y;
    _v.copy(d.anchor).applyMatrix4(inv);
    const s = sizes[i];                                // 平常的樣子：圓形圖示（10-12 晚起沒有一直展開的「新」）
    return { x0, x1, y0, y1, bx, by, ax: _v.x, ay: _v.y, rw: s.cw, rh: s.ch, ow: s.ow, oh: s.oh };
  });
  // 以遊戲建築的範圍當「島」來置中（海邊景點可以超出）
  let ix0 = Infinity, ix1 = -Infinity, iy0 = Infinity, iy1 = -Infinity;
  for (const it of items) { ix0 = Math.min(ix0, it.x0); ix1 = Math.max(ix1, it.x1); iy0 = Math.min(iy0, it.y0); iy1 = Math.max(iy1, it.y1, it.ay + 1.5); }
  const M = 6;
  const topY = Math.max(0, ...obs.filter(o => o.y1 < H * 0.35 && o.x0 < W * 0.7 && o.x1 > W * 0.3).map(o => o.y1));
  const botY = Math.min(H, ...obs.filter(o => o.y0 > H * 0.65 && o.x0 < W * 0.7 && o.x1 > W * 0.3).map(o => o.y0));
  const pref = { x: W / 2, y: (topY + botY) / 2 };
  const icx = (ix0 + ix1) / 2, icy = (iy0 + iy1) / 2;
  const kMax = Math.min(W / (ix1 - ix0), H / (iy1 - iy0)) * 1.35;
  const cand = [];
  for (let gy = -14; gy <= 14; gy++) for (let gx = -14; gx <= 14; gx++) cand.push([gx * W * 0.016, gy * H * 0.016]);
  cand.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  const rects = [], lab = [];
  const ov = (r, o) => Math.max(0, Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0)) * Math.max(0, Math.min(r.y1, o.y1) - Math.max(r.y0, o.y0));
  const scr = { x0: M, x1: W - M, y0: M, y1: H - M };
  const cost = (k, sx, sy, full) => {
    rects.length = 0;
    for (const it of items) {
      const bx = sx + (it.bx - icx) * k, by = sy - (it.by - icy) * k, hw = (it.x1 - it.x0) * k * 0.22;   // 建築主體中間那一塊要在畫面裡（邊角、碼頭、船可以出去）
      rects.push({ x0: bx - hw, x1: bx + hw, y0: by - hw * 0.6, y1: by + hw * 0.6 });
    }
    let c = 0;
    for (const r of rects) { c += ((r.x1 - r.x0) * (r.y1 - r.y0) - ov(r, scr)) * 0.5; if (c > 0 && !full) return c; }   // 建築：主體在畫面裡就好（可以被介面壓到）
    // 浮標：平常的樣子（圓形圖示；「新」的展開）互相讓開後，要在畫面裡、而且不能被固定介面擋到；
    // 再一棟一棟看「只有它展開」（手指按住那一棟）：左右挪一下也要放得下（不管旁邊的浮標——按住的那個一下子就收回去）
    lab.length = 0;
    for (const it of items) { const ax = sx + (it.ax - icx) * k, ay = sy - (it.ay - icy) * k; lab.push({ ax, x0: ax - it.rw / 2, x1: ax + it.rw / 2, y0: ay - it.rh - TAIL, y1: ay - TAIL }); }
    nudge(lab, obs);
    for (let i = 0; i < lab.length; i++) {
      const it = items[i], r = lab[i], ay = sy - (it.ay - icy) * k;
      const one = !oneObs || it.ow === it.rw ? null : nudge([{ ax: r.ax, x0: r.ax - it.ow / 2, x1: r.ax + it.ow / 2, y0: ay - it.oh - TAIL, y1: ay - TAIL }], oneObs)[0];
      for (const [q, os] of one ? [[r, obs], [one, oneObs]] : [[r, obs]]) {   // 展開的那個：貓頭鷹對話框以「最大會多大」算（之後換一句長的話也不會蓋到）
        c += (q.x1 - q.x0) * (q.y1 - q.y0) - ov(q, scr);
        for (const o of os) c += ov(q, o);
      }
      if (c > 0 && !full) return c;
    }
    return c;
  };
  let best = null, fb = null, oneObs = null;
  const search = (kLo, wantFb) => {                    // 從最大往小找第一個放得下的（wantFb：都放不下時記一個「擋最少」的備案）
    for (let k = kMax; k >= kLo; k *= 0.965) {
      for (const [ox, oy] of cand) if (!cost(k, pref.x + ox, pref.y + oy, false)) return { k, sx: pref.x + ox, sy: pref.y + oy };
      if (wantFb) for (let i = 0; i < 160; i++) { const sx = pref.x + cand[i][0], sy = pref.y + cand[i][1], c = cost(k, sx, sy, true); if (!fb || c < fb.c * 0.97) fb = { c, k, sx, sy }; }
    }
    return null;
  };
  const refine = b => { if (b && b.k < kMax) for (const f of [1.018, 1.009]) { const k = b.k * f; for (const [ox, oy] of cand) if (!cost(k, pref.x + ox, pref.y + oy, false)) { b = { k, sx: pref.x + ox, sy: pref.y + oy }; break; } } return b; };   // 再細找一點：島能大就大
  best = refine(search(kMax * 0.45, true)); view.kRest = best ? best.k : 0;   // 先照平常的樣子擺（圓形圖示）
  // 再看一棟一棟按住展開也放得下（貓頭鷹對話框以最大算＋多留一點 → 以最大算 → 照現在的大小）：最多讓島縮小 12%，再小就不管（按住的那一下名字可能被對話框蓋到一點）
  view.fitTier = 0;
  if (best) for (const [i, os] of [obsMax, fitObsMax, obs].entries()) { oneObs = os; const b = refine(search(best.k * 0.88, false)); if (b) { best = b; view.fitTier = i + 1; break; } }
  view.fitOk = !!best;
  if (!best) best = fb;
  view.k = best.k; view.kMax = kMax;
  view.cx = icx - (best.sx - W / 2) / best.k;
  view.cy = icy + (best.sy - H / 2) / best.k;
  return true;
}
// 浮標互相重疊（含間距）：橫向只重疊一點點（< 40%）→ 左右推開；重疊很多 → 上下各讓一半
// 浮標碰到固定介面或畫面邊緣：左右挪開（尾巴還是指著建築，最多挪到尾巴碰到圓角）
function nudge(lab, obs = []) {
  const W = innerWidth, M = 6, edge = Math.min(innerWidth, innerHeight) * 0.04;
  const away = r => {
    const lim = Math.max(0, (r.x1 - r.x0) / 2 - edge), cur = (r.x0 + r.x1) / 2 - r.ax;
    for (let k = 0; k < 3; k++) {
      let need = 0;
      if (r.x0 < M) need = M - r.x0; else if (r.x1 > W - M) need = W - M - r.x1;
      else for (const o of r.obs || obs) {              // r.obs：展開名字的浮標用「貓頭鷹對話框最大會多大」（10-12）
        if (!(r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0)) continue;
        const L = o.x0 - 8 - r.x1, R = o.x1 + 8 - r.x0;   // 往左要挪多少（負）、往右要挪多少（正）
        need = Math.abs(cur + L) <= lim && (Math.abs(L) <= R || Math.abs(cur + R) > lim) ? L : R; break;
      }
      if (!need) return false;
      const nc = Math.max(-lim, Math.min(lim, (r.x0 + r.x1) / 2 - r.ax + need)) + r.ax, dx = nc - (r.x0 + r.x1) / 2;
      if (Math.abs(dx) < 0.5) return false;
      r.x0 += dx; r.x1 += dx; return true;
    }
    return false;
  };
  for (let it = 0; it < 6; it++) {
    let moved = false;
    for (let i = 0; i < lab.length; i++) for (let j = i + 1; j < lab.length; j++) {
      const a = lab[i], b = lab[j];
      if (!(a.x0 < b.x1 + 16 && a.x1 > b.x0 - 16 && a.y0 < b.y1 + 12 && a.y1 > b.y0 - 12)) continue;   // 點擊區不重疊：左右至少 16px、上下 12px
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), minW = Math.min(a.x1 - a.x0, b.x1 - b.x0);
      if (ox < minW * 0.4) { const [l, r] = (a.x0 + a.x1) <= (b.x0 + b.x1) ? [a, b] : [b, a], dx = (l.x1 + 16 - r.x0) / 2; l.x0 -= dx; l.x1 -= dx; r.x0 += dx; r.x1 += dx; }
      else { const [u, l] = a.y1 <= b.y1 ? [a, b] : [b, a], dy = (u.y1 + 12 - l.y0) / 2; u.y0 -= dy; u.y1 -= dy; l.y0 += dy; l.y1 += dy; }
      moved = true;
    }
    for (const r of lab) if (r.ax !== undefined && away(r)) moved = true;
    if (!moved) break;
  }
  return lab;
}

// =========================================================
// 主迴圈（只有選單看得到時才跑；最多 30 格／秒；陰影只在東西變了才重畫）
// =========================================================
const tagPos = [], rbPos = [];
function frame(ms) {
  raf = 0; if (!running) return;
  raf = requestAnimationFrame(frame);
  if (lastDraw && ms - lastDraw < 1000 / FPS - 3) return;
  // 自動畫質：45 格平均掉到約 25 格／秒以下（間隔 > 40ms）就降解析度（DPR 1.5 → 1.25 → 1）；效能體檢 10-12：原本 52ms（約 19 格）才降
  if (lastDraw && built && ms > dprCool) { dprWin.push(ms - lastDraw); if (dprWin.length >= 45) { const avg = dprWin.reduce((a, b) => a + b, 0) / dprWin.length; dprWin = []; if (avg > 40 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false); dprCool = ms + 5000; } } }
  lastDraw = ms; frames++;
  const t = ms / 1000, dt = Math.min(0.1, lastMs ? (ms - lastMs) / 1000 : 0.033); lastMs = ms;
  if (needFit && fit()) needFit = false;
  const W = innerWidth, H = innerHeight, k = view.k * user.zoom;
  setCamDir(camera, Math.PI / 4 + Math.sin(t * 0.09) * 0.022);
  stepPlace(dt); stepFocus(dt);
  const cx = view.cx + user.px + town.off.x + Math.sin(t * 0.13) * 0.12, cy = view.cy + user.py + town.off.y + Math.sin(t * 0.1 + 1) * 0.08;
  camera.left = cx - W / 2 / k; camera.right = cx + W / 2 / k; camera.top = cy + H / 2 / k; camera.bottom = cy - H / 2 / k;
  camera.updateProjectionMatrix();
  seaU.uTime.value = t;
  for (const f of tickers) f(t, dt);
  const rbOn = rbActive();
  if (rbOn) for (const f of rbTickers) f(t, dt);       // 彩虹島的風車、居民、貨船：鏡頭在那邊才動
  if (rbOn !== rb.shownFolk) { rb.shownFolk = rbOn; for (const f of rb.folk) f.holder.visible = rbOn; shadowDirty = true; }   // 不在彩虹島：居民不畫（主島畫面角落只看得到一點點，省 draw call）
  for (const pl of plugins) if (pl.update) { try { pl.update(t, dt); } catch (e) { console.warn("[hub3d] 外掛", e); pl.update = null; } }
  for (const a of anims) if (a.update(performance.now()) === false) anims.delete(a);
  stepAgents(t, dt); updateAgentVisuals(t, dt); stepTown(t, dt);
  if (shadowDirty || !sun.shadow.map || ms - lastShadow > 30000) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; lastShadow = ms; }   // 保險重畫 30 秒一次（效能體檢 10-12：原本 4 秒；會動的東西不投影、靜態的改變都會設 shadowDirty）
  renderer.render(scene, camera);
  placeTags(t);
}
function placeTags(t) {
  const W = innerWidth, H = innerHeight, atRb = town.place === "rainbow";
  lodStep(); const sc = LOD.far ? FAR_SCALE : 1;       // 浮標精簡（10-12）：這一格誰展開、拉遠縮小多少
  tagPos.length = 0; rbPos.length = 0;
  for (const d of DEFS) {
    if (d.isle && d.isle !== town.place) continue;     // 不在那座島（彩虹島、歸仁區的遊戲建築）：那邊的浮標是 display:none，不用每格量
    setOpen(d.tag, wantOpen(d.tag));
    if (tagLive() || d.tw0 === undefined) { d.tw0 = d.tag.offsetWidth; d.th0 = d.tag.offsetHeight; }   // 大小變了才重量：展開那 0.2 秒寬度一直變，旁邊的浮標跟著慢慢讓開
    const w0 = d.tw0, h0 = d.th0; if (!w0) continue;
    _v.copy(d.anchor); _v.y += d.pivot.position.y; _v.project(camera);
    const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H, w = w0 * sc, h = h0 * sc;
    (d.isle ? rbPos : tagPos).push({ d, ax: x, x0: x - w / 2, x1: x + w / 2, y0: y - h - TAIL, y1: y - TAIL, w0, h0, obs: d.tag._open ? fitObsMax : undefined });
  }
  const sgPos = []; signRects(sgPos, sc);              // 橋頭路牌（10-12）
  if (tagRO) tagDirty = false;                         // 沒有 ResizeObserver 的舊瀏覽器：每格量
  nudge(tagPos, fitObs); if (rbPos.length) nudge(rbPos, fitObs);
  if (sgPos.length) dodgeSigns(sgPos, town.place === "main" ? tagPos : town.place === "rainbow" ? rbPos : [...rbPos, ...CIVIC.map(c => c.rect)]);   // 遊戲浮標排好了，路牌再讓開它們
  for (const list of [tagPos, rbPos, sgPos]) for (const r of list) {
    const cx = (r.x0 + r.x1) / 2;                      // 位置放 translate（transform 留給輕跳、拉遠縮小，以浮標底部中間為準縮放）
    const tr = `${(cx - r.w0 / 2).toFixed(1)}px ${(r.y1 - r.h0).toFixed(1)}px`, zi = r.d.tag === LOD.press || r.d === sel ? 99990 : Math.round(r.y1) - (r.d.go ? 5000 : 0);   // 值沒變就不寫（效能體檢 10-12：少一次樣式失效）；按住／介紹卡開著的那棟疊在最上面、路牌（r.d.go）一律在遊戲浮標下面
    if (tr !== r.d.trW) { r.d.trW = tr; r.d.tag.style.translate = tr; } if (zi !== r.d.ziW) { r.d.ziW = zi; r.d.tag.style.zIndex = String(zi); } r.d.tagRect = r;
    const tx = Math.round((r.ax - cx) / sc); if (tx !== r.d.tx) { r.d.tx = tx; r.d.tag.style.setProperty("--tx", tx + "px"); }   // 浮標被挪開：尾巴還是指著建築
  }
  const cyc = Math.floor(t / 4);                       // 浮標每 4 秒輪流輕跳一下（只跳能玩的、人在的那座島的）
  if (cyc !== hopCycle) { hopCycle = cyc; DEFS.filter(d => !d.locked && isleOf(d) === town.place).forEach((d, i) => later(() => { if (!d.tag.classList.contains("pop")) { d.tag.classList.remove("hop"); void d.tag.offsetWidth; d.tag.classList.add("hop"); } }, i * 150)); }
  if (finger) { const r = DEFS.find(d => d.mode === "fish").tagRect; if (r) { finger.style.transform = `translate3d(${((r.x0 + r.x1) / 2 - 8).toFixed(1)}px, ${(r.y1 - 6).toFixed(1)}px, 0)`; finger.style.zIndex = "99999"; } }
}
function startLoop() { if (running || dead || lost || !shown || document.hidden) return; running = true; lastMs = lastDraw = 0; dprWin = []; raf = requestAnimationFrame(frame); }
function stopLoop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
function onResize() {
  if (dead) return;
  needFit = true;
  if (slept) return;                                   // 選單看不到時畫布維持 2×2（轉向也一樣），回選單 wake() 再量
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
  if (shown && !running) startLoop();
}
let resizeT = 0;
function onResizeEvt() { onResize(); clearTimeout(resizeT); resizeT = setTimeout(onResize, 300); }   // iOS 轉向後尺寸晚一點才正確：0.3 秒後再算一次
function onVis() { if (document.hidden) stopLoop(); else startLoop(); }
function onLost(e) {                                   // WebGL 被系統收走：先停、等 5 秒看會不會回來
  e.preventDefault(); lost = true; stopLoop();
  clearTimeout(lostTimer); lostTimer = 0; if (shown) armLost();   // 選單沒顯示（在遊戲／配送／換裝裡）：只記下 lost，不計時——等回選單 show() 再開始等（不然玩到一半就被判死、選單永久退回卡片版）
}
function armLost() { if (lostTimer) return; lostTimer = setTimeout(() => { lostTimer = 0; if (lost && !dead) { dispose(); opts.onFail("contextlost"); } }, 5000); }   // 已經在等就不重新計時
function onRestored() { lost = false; clearTimeout(lostTimer); lostTimer = 0; fitSig = ""; needFit = true; shadowDirty = true; startLoop(); }

// =========================================================
// 10-12 小島同樂廣場：全島合作目標的慶祝裝飾（docs/zhuyin-plaza-spec.md §1）
// zhuyin.js 讀到「本週大家做到第幾段」就呼叫 api.celebrate(lv)：0＝沒有、1 銅＝彩色氣球、2 銀＝再加定時煙火、3 金＝再加雕像廣場（緊鄰島中央）的金色獎盃雕像（一段一段往上疊）。
// 換週（lv 變小）就收掉。全部程式生成的簡單幾何：氣球 30 顆＝1 個 InstancedMesh＋1 組線、煙火 1 個 InstancedMesh、獎盃 3 個 mesh；都不投影。
// 跟主迴圈一起跑（只有選單看得到時才動）；fanfare＝第一次看到新等級：連放三發煙火（銅也放）。
// =========================================================
const CELE_COL = ["#ff6f86", "#ffd166", "#5fb4ff", "#7fd77a", "#c79bff", "#ff9fd0", "#ff8a3d"];
const CELE_TIED = 20, CELE_RISE = 10, CELE_FW = 200, CELE_RISE_H = 6.5;
const cele = { lv: 0, g: null, bal: null, line: null, tied: [], fw: null, parts: [], alive: 0, nextFw: 0, fan: 0, fanAt: 0, trophy: null, cup: null, spark: null };
const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3(), _cp = new THREE.Vector3(), _cc = new THREE.Color();
function celebrate(lv, { fanfare = false } = {}) {
  if (dead || !scene) return;
  lv = Math.max(0, Math.min(3, Math.floor(+lv) || 0));
  if (!cele.g) { cele.g = new THREE.Group(); cele.g.name = "plaza-celebrate"; scene.add(cele.g); tickers.push(celeTick); }
  if (lv >= 1 && !cele.bal) celeBalloons(); else if (lv < 1 && cele.bal) celeDrop("bal");
  if (lv >= 3 && !cele.trophy) celeTrophy(); else if (lv < 3 && cele.trophy) celeDrop("trophy");
  if (lv < 2 && cele.fw && !cele.alive && !fanfare) celeDrop("fw");
  if (lv !== cele.lv) cele.nextFw = 0;
  cele.lv = lv;
  if (fanfare && lv >= 1) { cele.fan = 3; cele.fanAt = 0; }
  shadowDirty = true;
}
function celeDrop(k) {
  const objs = k === "bal" ? [cele.bal, cele.line] : k === "trophy" ? [cele.trophy] : [cele.fw];
  for (const o of objs) {
    if (!o) continue; o.removeFromParent();
    o.traverse(x => { if (x.geometry) x.geometry.dispose(); for (const m of [].concat(x.material || [])) if (m !== vcMat && m !== glowMat) m.dispose(); });
  }
  if (k === "bal") { cele.bal = cele.line = null; cele.tied = []; }
  else if (k === "trophy") cele.trophy = cele.cup = cele.spark = null;
  else { cele.fw = null; cele.parts = []; cele.alive = 0; }
}
// 慢慢飄上天的氣球：第 k 顆的第 cyc 輪從島上哪裡出發（照編號算，不用存狀態）
function celeRiseSpot(k, cyc) {
  const r = rng(k * 7919 + cyc * 104729 + 17);
  for (let i = 0; i < 12; i++) { const x = (r() - 0.5) * 15, z = (r() - 0.5) * 15; if (inside(mainPoly, x, z, 1)) return [x, z]; }
  return [(r() - 0.5) * 4, (r() - 0.5) * 4];
}
// 綁氣球的地方＝四個景點廣場朝鏡頭那一側的裝飾放置點（預設鏡頭從右前方看，島正中央的圓環噴水池被點餐店擋住）；
// 扭蛋裝飾目前只有 3 種＝只會用到最前面花園的 3 個放置點，這幾個點都空著（⚠ 之後裝飾超過 9 種要改）
const CELE_TIE = [["statue", -1.0, 1.05], ["playground", -1.65, 1.0], ["carousel", 1.65, 0.75], ["lighthouse", 1.3, 1.05]];
const CELE_CUP = ["statue", 0.92, 0.32];             // 金色獎盃：雕像廣場（緊鄰島中央）ㄅㄆㄇ 雕像右前方的空地
// 銅：四個廣場各綁一串（每串 5 顆）＋10 顆從島上飄上天
function celeBalloons() {
  const geo = new THREE.SphereGeometry(0.2, 12, 8); geo.scale(1, 1.18, 1);
  const n = CELE_TIED + CELE_RISE, m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: "#ffffff" }), n);
  m.castShadow = m.receiveShadow = false; m.frustumCulled = false; m.name = "plaza-balloons";
  cele.tied = [];
  for (let c = 0; c < 4; c++) {
    const [id, dx, dz] = CELE_TIE[c], s = SPOTS.find(q => q.id === id), ax = s.x + dx, az = s.z + dz, ay = groundY(ax, az) + 0.04;
    for (let k = 0; k < 5; k++) { const b = k / 4 * Math.PI * 2 + c, ring = k === 0 ? 0 : 0.21;
      cele.tied.push({ ax, ay, az, ox: Math.cos(b) * ring, oy: 1.0 + (k % 3) * 0.14 + (k === 0 ? 0.24 : 0), oz: Math.sin(b) * ring, ph: c * 1.7 + k * 0.4 }); }
  }
  for (let i = 0; i < n; i++) m.setColorAt(i, _cc.set(CELE_COL[(i * 3 + Math.floor(i / 5)) % CELE_COL.length]));
  const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CELE_TIED * 6), 3));
  const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: "#ffffff" })); line.frustumCulled = false;
  cele.g.add(m, line); cele.bal = m; cele.line = line;
  celeBalloonPose(performance.now() / 1000);
}
const riseAt = [];                                     // 飄上天的氣球：每顆這一輪的出發點（效能體檢 10-12：換輪才重算，不每格算多邊形＋新陣列）
function celeBalloonPose(t) {
  const m = cele.bal, lp = cele.line.geometry.attributes.position; _cq.identity();
  for (let i = 0; i < cele.tied.length; i++) {
    const b = cele.tied[i], sx = Math.sin(t * 1.3 + b.ph) * 0.06, sz = Math.sin(t * 0.9 + 1 + b.ph) * 0.05;   // 跟氣球店那串一樣輕輕晃
    _cp.set(b.ax + b.ox + sx * b.oy, b.ay + b.oy, b.az + b.oz + sz * b.oy);
    m.setMatrixAt(i, _cm.compose(_cp, _cq, _cs.set(1, 1, 1)));
    lp.setXYZ(i * 2, b.ax, b.ay, b.az); lp.setXYZ(i * 2 + 1, _cp.x, _cp.y - 0.24, _cp.z);
  }
  for (let k = 0; k < CELE_RISE; k++) {
    const spd = 0.32 + (k % 4) * 0.05, u = t * spd / CELE_RISE_H + k / CELE_RISE, cyc = Math.floor(u), f = u - cyc;
    let sp = riseAt[k]; if (!sp || sp.cyc !== cyc) { const [x0, z0] = celeRiseSpot(k, cyc); sp = riseAt[k] = { cyc, x: x0, z: z0, gy: groundY(x0, z0) }; }
    const x = sp.x, z = sp.z;
    const s = f > 0.86 ? Math.max(0.001, 1 - (f - 0.86) / 0.14) : Math.min(1, f / 0.05 + 0.001);   // 出發時長出來、飛到高處縮小消失
    _cp.set(x + Math.sin(t * 0.8 + k) * 0.25 * f, sp.gy + 0.5 + f * CELE_RISE_H, z + Math.cos(t * 0.7 + k) * 0.2 * f);
    m.setMatrixAt(CELE_TIED + k, _cm.compose(_cp, _cq, _cs.set(s * 0.85, s * 0.85, s * 0.85)));
  }
  m.instanceMatrix.needsUpdate = true; lp.needsUpdate = true;
}
// 金：雕像廣場上的金色獎盃雕像（兩層白色底座＋短柱＋會慢慢轉的金杯＋頂上星星＋繞著閃的亮點）
function celeTrophy() {
  const [id, dx, dz] = CELE_CUP, s = SPOTS.find(q => q.id === id), tx = s.x + dx, tz = s.z + dz;
  const g = new THREE.Group(); g.name = "plaza-trophy"; g.position.set(tx, 0, tz); g.scale.setScalar(1.15); cele.g.add(g);
  const G = groundY(tx, tz) + 0.05, y0 = G + 0.38;     // G＝廣場地磚頂；底座兩層到 G+0.38，上面短柱 0.42、金杯從 G+0.8 開始
  vm(rbox(0.66, 0.22, 0.66, 0.05), "#f4f1ea", { y: G + 0.11, parent: g, shadow: false });
  vm(rbox(0.5, 0.16, 0.5, 0.04), "#e6e0d6", { y: G + 0.3, parent: g, shadow: false });
  vm(cyl(0.13, 0.16, 0.42, 12), "#f4f1ea", { y: G + 0.59, parent: g, shadow: false });
  vm(box(0.4, 0.06, 0.02), "#d99a1e", { y: G + 0.3, z: 0.255, parent: g, shadow: false });   // 底座前面的金色名牌
  mergeStatic(g);
  const prof = [[0, 0], [0.27, 0], [0.27, 0.05], [0.14, 0.1], [0.07, 0.17], [0.055, 0.36], [0.09, 0.43], [0.2, 0.5], [0.31, 0.62], [0.37, 0.8], [0.39, 0.98], [0.35, 0.98], [0.33, 0.82], [0.27, 0.66], [0, 0.6]].map(([x, y]) => new THREE.Vector2(x, y));
  const parts = [new THREE.LatheGeometry(prof, 22)];
  for (const sgn of [1, -1]) { const h = new THREE.TorusGeometry(0.19, 0.042, 6, 14, Math.PI); h.rotateZ(-sgn * Math.PI / 2); h.translate(sgn * 0.36, 0.74, 0); parts.push(h); }
  const st = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.075 : 0.18; if (i) st.lineTo(Math.cos(a) * r, Math.sin(a) * r); else st.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const sg = new THREE.ExtrudeGeometry(st, { depth: 0.05, bevelEnabled: false }); sg.translate(0, 1.2, -0.025); parts.push(sg);
  const flat = parts.map(p => { const q = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(q.attributes)) if (k !== "position" && k !== "normal") q.deleteAttribute(k); if (!q.attributes.normal) q.computeVertexNormals(); return q; });
  const cupGeo = mergeGeometries(flat); new Set([...parts, ...flat]).forEach(p => p.dispose());
  const cup = new THREE.Mesh(cupGeo, new THREE.MeshPhongMaterial({ color: "#f2c14e", specular: "#fff1b8", shininess: 60, emissive: "#5a3a00", emissiveIntensity: 0.55 }));
  cup.position.y = y0 + 0.42; cup.castShadow = false; cup.receiveShadow = false; g.add(cup);
  const spark = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: "#fff6c9", toneMapped: false }), 8);
  spark.frustumCulled = false; spark.castShadow = spark.receiveShadow = false; g.add(spark);
  cele.trophy = g; cele.cup = cup; cele.spark = spark;
}
// 煙火：200 顆小亮點共用一個 InstancedMesh；一發＝火箭往上衝 0.75 秒 → 炸開 48 顆（兩種顏色）→ 受重力落下、慢慢縮小
function celeLaunch() {
  if (!cele.fw) {
    const m = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), CELE_FW);
    m.frustumCulled = false; m.castShadow = m.receiveShadow = false; m.name = "plaza-fireworks";
    _cm.makeScale(0, 0, 0); for (let i = 0; i < CELE_FW; i++) { m.setMatrixAt(i, _cm); m.setColorAt(i, _cc.set("#ffffff")); }
    cele.g.add(m); cele.fw = m; cele.parts = Array.from({ length: CELE_FW }, (_, i) => ({ i, life: 0, on: false }));
  }
  const p = cele.parts.find(q => q.life <= 0); if (!p) return false;
  const x = (Math.random() - 0.5) * 9, z = (Math.random() - 0.5) * 9, c1 = Math.floor(Math.random() * CELE_COL.length);
  Object.assign(p, { kind: 1, x, y: groundY(x, z) + 0.6, z, vx: 0, vy: 7, vz: 0, life: 0.75, max: 0.75, on: true, c1, c2: (c1 + 2 + Math.floor(Math.random() * 4)) % CELE_COL.length });
  cele.fw.setColorAt(p.i, _cc.set("#fff3c4")); cele.fw.instanceColor.needsUpdate = true; cele.alive++;
  return true;
}
function celeBoom(r) {
  let n = 0;
  for (const p of cele.parts) {
    if (p.life > 0 || p === r) continue; if (++n > 48) break;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), v = 2.2 + Math.random() * 0.6;
    Object.assign(p, { kind: 2, x: r.x, y: r.y, z: r.z, vx: Math.sin(ph) * Math.cos(th) * v, vy: Math.cos(ph) * v + 0.6, vz: Math.sin(ph) * Math.sin(th) * v, life: 1.3 + Math.random() * 0.6, on: true });
    p.max = p.life; cele.fw.setColorAt(p.i, _cc.set(CELE_COL[n % 3 ? r.c1 : r.c2])); cele.alive++;
  }
  cele.fw.instanceColor.needsUpdate = true;
}
function celeTick(t, dt) {
  if (cele.bal) celeBalloonPose(t);
  if (cele.cup) {
    cele.cup.rotation.y = t * 0.6;
    const y0 = cele.cup.position.y; _cq.identity();
    for (let i = 0; i < 8; i++) { const a = t * 0.9 + i * Math.PI / 4, s = Math.max(0.001, Math.sin(t * 3 + i * 1.9)); _cp.set(Math.cos(a) * 0.52, y0 + 0.55 + Math.sin(t * 1.3 + i) * 0.35, Math.sin(a) * 0.52); cele.spark.setMatrixAt(i, _cm.compose(_cp, _cq, _cs.set(s, s, s))); }
    cele.spark.instanceMatrix.needsUpdate = true;
  }
  if (cele.lv >= 2) { if (!cele.nextFw) cele.nextFw = t + 2.5; else if (t >= cele.nextFw) { celeLaunch(); cele.nextFw = t + 7 + Math.random() * 4; } }   // 銀以上：每 7～11 秒一發
  if (cele.fan > 0 && t >= cele.fanAt) { if (celeLaunch()) cele.fan--; cele.fanAt = t + 0.6; }
  if (!cele.fw || !cele.alive) return;
  const m = cele.fw; _cq.identity();
  for (const p of cele.parts) {
    if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; p.life = 0; cele.alive--; m.setMatrixAt(p.i, _cm.makeScale(0, 0, 0)); if (p.kind === 1) celeBoom(p); continue; }
    if (p.kind === 2) { p.vy -= 2.4 * dt; const d = Math.pow(0.35, dt); p.vx *= d; p.vy *= d; p.vz *= d; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const s = p.kind === 1 ? 0.8 : Math.min(1, p.life / (p.max * 0.5));
    m.setMatrixAt(p.i, _cm.compose(_cp.set(p.x, p.y, p.z), _cq, _cs.set(s, s, s)));
  }
  m.instanceMatrix.needsUpdate = true;
  if (!cele.alive && cele.lv < 2 && !cele.fan) celeDrop("fw");   // 銅的開場煙火放完：收掉
}

// =========================================================
// 對外介面
// =========================================================
export async function createHub(o) {
  opts = { friends: () => [], onFriend: () => {}, onFail: () => {}, onGacha: () => {}, onDress: () => {}, onCivic: () => {}, onPlace: () => {}, stickers: () => 0, newbie: () => false, labels: {}, onPick: null, pickArea: null, onIsle: null, ...o };
  // onPick(mode, info)｜onPick(null)：點一下遊戲建築＝開介紹卡／收起來（10-12；沒給＝點一下就開始）；pickArea()：介紹卡現在的 { top }（鏡頭把選到的那棟放在它上面）；
  // onIsle(p)：點遠方的島／路牌要飛過去（主程式出音效再呼叫 goPlace；沒給＝直接 goPlace）
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  try {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // 效能體檢 10-12：iPad（DPR 2）起始用 1.5（像素少 44%，有反鋸齒、看不出糊）；太慢再自動往下降（frame()）
    renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor(P.deep, 1);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.domElement.addEventListener("webglcontextrestored", onRestored);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    hemi = new THREE.HemisphereLight(0xf4f9ff, 0xe9dcc6, 1.5); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff4e4, 2.2);
    sun.position.set(-7, 15, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3; sun.shadow.intensity = 0.7;
    scene.add(sun, sun.target);
    stage = document.createElement("div"); stage.className = "hub-stage"; stage.appendChild(renderer.domElement);
    tagLayer = document.createElement("div"); tagLayer.className = "hub-tags";
    opts.host.prepend(stage); stage.after(tagLayer);
    makeTags(); bindInput(renderer.domElement);
    makeGeos(); models();
    fenceMat = new THREE.MeshLambertMaterial({ map: stripeTex("#ffffff", "#ff8a3d", 5, true) }); postMat = mat("#f4f1ea");
    buildTerrain();
    terrace(BC(0) - 0.25, BC(0) - 0.25, 1.5, 1.5, 0.55);   // 尋寶公園的台地（讓出人行道）
    buildRoads();
    buildTown();
    for (const s of SPOTS) SPOT_BUILD[s.id](s, spotGroup(s));
    for (const s of SPOTS) mergeStatic(s.g);
    // 路邊的放置點（裝飾用）
    for (const [x, z] of [[-4.8 + 1.15, 9.0], [4.8 - 1.15, -9.0], [9.0, 4.8 - 1.15], [-9.0, -4.8 + 1.15], [1.15, -8.8], [-8.8, 1.15]]) if (inside(mainPoly, x, z, 0.4)) slot(x, z);
    buildStreet();
    DEFS.forEach(startDef);
    buildRainbow();                                      // 10-12 彩虹島（建築的點擊盒、樹要讓開的範圍 startDef 已經放好）
    for (const [x, z] of RB_SLOTS) slot(x, z);            // 彩虹島的裝飾放置點排在最後面
    buildSigns();                                        // 10-12 橋頭路牌（樹要讓開：在 buildTrees 前面）
    buildTrees(); buildBlobs(); makeTownTags(); makeSignTags();
    agentBlob = blobMesh(40, 0.3); agentBlob.count = 0; scene.add(agentBlob);
    refresh();
    renderer.compile(scene, camera);
  } catch (e) { dispose(); throw e; }                 // 任何一步失敗：canvas／浮標都收掉，zhuyin.js 會退回卡片選單
  addEventListener("resize", onResizeEvt); addEventListener("orientationchange", onResizeEvt);
  document.addEventListener("visibilitychange", onVis);
  return api;
}
// 建築全部長好（或失敗、被收掉）時 resolve：主程式等它才開始抓音效、語音、背景音樂（效能體檢 10-12：不跟模型、調色盤搶頻寬）
let builtOk = null; const builtP = new Promise(r => { builtOk = r; });
async function loadRest() {
  if (dead) { builtOk(); return; }
  try {
    const order = ["fish", "order", "build", "gacha", "hunt", "match", "tone", "whack", "frog", "bubble", "deliver", "dress", "detective", "tops"];
    await Promise.all([
      ...order.map((m, i) => buildDef(DEFS.find(d => d.mode === m), BUILDERS[m], i * 90).catch(e => console.warn("[hub3d] 建築載入失敗", m, e))),
      buildSpotsKenney().catch(e => console.warn("[hub3d] 景點載入失敗", e)),
      buildStreetKenney().catch(e => console.warn("[hub3d] 街景載入失敗", e)),
      buildTownKenney().catch(e => console.warn("[hub3d] 新市區載入失敗", e)),
      buildRainbowKenney().catch(e => console.warn("[hub3d] 彩虹島載入失敗", e)),
    ]);
    if (dead) return;
    const w = new THREE.Group(); scene.add(w); for (const g of statics) w.attach(g); noDynShadow(w); mergeStatic(w);   // 整座島的靜態物件依材質合併（draw call 再少幾十個）
    const wr = new THREE.Group(); scene.add(wr); for (const g of rbStatics) wr.attach(g); noDynShadow(wr); mergeStatic(wr);   // 彩虹島另外合併（看不到的時候整塊不畫）
    built = true; shadowDirty = true; dprCool = performance.now() + 1500;
    spawnCars(); syncPets(); applyDecor();
  } catch (e) { console.warn("[hub3d]", e); }
  finally { builtOk(); }
}
// 回選單時呼叫：讀卡片的解鎖狀態、扭蛋機文字、重新擺鏡頭
let refreshed = false;
function refresh() {
  if (dead) return;
  for (const d of DEFS) {
    if (d.free) { syncTag(d); continue; }
    const card = cardOf(d.mode); if (!card) continue;
    const locked = card.classList.contains("locked");
    if (d.locked !== locked) setLocked(d, locked, refreshed && d.locked !== undefined);
    syncTag(d, card);
  }
  syncTown(refreshed); syncRainbow(refreshed);
  refreshed = true;
  needFit = true;
}
// 寵物：[{ id, glb, stage(1 寶寶／2 長大／3 超級), name }]；同 id 只換階段不重載
function setPets(list) { petWant = (list || []).slice(0, 30).map(p => ({ ...p, stage: STAGE_SCALE[p.stage] ? p.stage : 2 })); syncPets(); }
// 裝飾：[{ id, glb }]，依序擺到放置點（放不下的先略過）
function setDecor(list) { decorWant = (list || []).slice(); applyDecor(); }
function show() {
  if (dead) return;
  wake();
  shown = true; user.zoom = 1; user.px = user.py = 0; needFit = true; focus.over = false;
  if (town.place !== "main") { town.place = "main"; town.zoomTgt = 0; town.tgt.x = town.tgt.y = town.off.x = town.off.y = 0; town.sunFrom = town.offFrom = null; sun.position.set(-7, 15, 6); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(); syncTownTags(); }   // 從遊戲回來：回到主島
  startLoop();
  if (!restStarted) { restStarted = true; later(() => { if (window.requestIdleCallback) requestIdleCallback(() => loadRest(), { timeout: 400 }); else loadRest(); }, 60); }   // 選單先畫出來，再抓建築模型
  later(playFinger, 900);
}
// 選單看不到（遊戲、配送站、換裝）：停迴圈，畫布縮成 2×2（全螢幕的繪圖緩衝區放掉——不然配送／換裝自己的全螢幕 WebGL 加上這張，iPad 同時有兩張大畫布）
let slept = false;
function hide() {
  shown = false; stopLoop(); for (const p of ptrs.keys()) ptrs.delete(p); pinch = null; LOD.press = null; deselect();
  if (renderer && !dead && !slept) { slept = true; try { renderer.setPixelRatio(1); renderer.setSize(2, 2, false); } catch (e) {} }
  // 陰影貼圖（1024²＋深度貼圖）也放掉（效能體檢 10-12）：回選單 wake() 設 shadowDirty，three 下一格自己重建
  const sm = sun && sun.shadow.map; if (sm && !dead) { try { if (sm.depthTexture) { sm.depthTexture.dispose(); sm.depthTexture = null; } sm.dispose(); } catch (e) {} sun.shadow.map = null; }
}
// 回選單：畫布恢復原本解析度（onResize：dpr＝自動畫質目前的值、量一次畫面大小、重擺鏡頭、陰影重畫）；隱藏時 WebGL 被收走的話，現在才開始等 5 秒
function wake() {
  if (slept) { slept = false; onResize(); shadowDirty = true; }
  if (lost) armLost();
}
function resume() { if (dead) return; wake(); shown = true; needFit = true; startLoop(); }   // 10-12 換裝畫面關掉：回到剛剛那座島（不像 show() 從遊戲回來要回主島、重設縮放）
function disposeMat(m) { if (!m) return; for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); }
function dispose() {
  if (gateObs) { gateObs.disconnect(); gateObs = null; }
  if (dead) return; dead = true; stopLoop(); builtOk();
  removeEventListener("resize", onResizeEvt); removeEventListener("orientationchange", onResizeEvt);
  document.removeEventListener("visibilitychange", onVis);
  for (const pl of plugins.splice(0)) { try { pl.dispose && pl.dispose(); } catch (e) {} }
  clearTimeout(lostTimer); clearTimeout(resizeT); for (const id of timers) clearTimeout(id); timers.clear();
  if (tagRO) tagRO.disconnect();
  const geos = new Set(), mats = new Set();
  if (scene) scene.traverse(o => { if (o.geometry) geos.add(o.geometry); for (const m of [].concat(o.material || [])) mats.add(m); if (o.userData.mat0) for (const m of [].concat(o.userData.mat0)) mats.add(m); });
  for (const m of [...matCache.values(), ...kitMatCache.values(), ...Object.values(texMats), ...grays, vcMat, glowMat, fenceMat, ...fireM, ...(cardMats || [])]) mats.add(m);
  geos.forEach(g => g.dispose()); mats.forEach(disposeMat);
  for (const g of [...(TREE_GEOS || []), BUSH_GEO]) if (g) g.dispose();
  try { if (renderer) { renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); } } catch (e) {}
  try { stage && stage.remove(); tagLayer && tagLayer.remove(); } catch (e) {}
  if (DEBUG) delete window.__hub3d;
}
// 外掛（js/zhuyin-weather.js 等）：use(plugin) → plugin(ctx) 回傳 { update(t, dt), dispose() }。外掛只透過 ctx 碰場景，自己建的東西自己收
function use(plugin) {
  if (dead || !scene) return null;
  const ctx = { THREE, scene, camera, renderer, sun, hemi, sea: seaU, P, groundY, islPoly, mainPoly, inside, DEFS, SPOTS, ROADS, PITCH, DEBUG,
    stage, tagLayer, markShadow: () => { shadowDirty = true; }, running: () => running, later,
    lamps: graph.lamps.map(([x, z]) => ({ x, z, y: groundY(x, z) + 0.075 })), town: { x: DIST.x, z: DIST.z, h: DIST.h },   // 路燈（夜晚發光用，含彩虹島）、新市區範圍（舊外掛用）
    isles: [{ id: "town", x: DIST.x, z: DIST.z, h: DIST.h, hx: DIST.h, hz: DIST.h }, { id: "rainbow", x: RB.x, z: RB.z, h: Math.max(RB.hx, RB.hz), hx: RB.hx + 0.6, hz: RB.hz + 0.6 },
      { id: "townE", x: TEX.x, z: TEX.z, h: Math.max(TEX.hx, TEX.hz), hx: TEX.hx, hz: TEX.hz }] };   // 10-12：主島以外的每座島（海洋外掛的魚群／量陸地、天氣外掛用）；townE＝歸仁區東邊小半島（陀螺競技場）
  let p = null; try { p = plugin(ctx) || {}; } catch (e) { console.warn("[hub3d] 外掛載入失敗", e); return null; }
  plugins.push(p); return p;
}
// 10-12 介紹卡／全部遊戲清單：start(m)＝介紹卡的「開始玩」；deselect()＝✕；pick(m)＝清單點一張（飛過去＋開介紹卡）；selected()＝現在開著哪棟；
// games()＝每個遊戲在哪座島、鎖著沒＋三座島開了沒（清單分組用）
function games() { return { list: DEFS.map(d => ({ mode: d.mode, isle: isleOf(d), locked: !!d.locked })), open: { main: true, town: !!town.open, rainbow: !!rb.open }, need: { town: DIST_NEED, rainbow: RAINBOW_NEED } }; }
const api = { show, hide, resume, refresh, dispose, setPets, setDecor, use, goPlace, place: () => town.place, celebrate, whenBuilt: () => builtP,   // celebrate：10-12 同樂廣場慶祝裝飾；whenBuilt：建築全部長好（效能體檢 10-12）
  start: m => { const d = DEFS.find(x => x.mode === m); if (d && !dead && shown) playDef(d); }, deselect, pick: pickMode, selected: () => sel ? sel.mode : null, games };

// 測試／除錯用（網址有 ?debug 才掛；tools/zy-test/hub3d.js、tools/render3d/render_bg.js）
if (DEBUG) window.__hub3d = {
  get frames() { return frames; }, get running() { return running; }, get fitOk() { return view.fitOk; }, get ready() { return built; },
  get fit() { return { k: view.k, kMax: view.kMax, kRest: view.kRest, tier: view.fitTier, obs: fitObs.map(o => o.sel), zoom: user.zoom, dpr }; },   // kRest：只看平常樣子（圓形圖示）時島能多大；tier：1＝展開也避開（多留）、2＝展開也避開、0＝只顧平常樣子
  screenOf(m) { const d = DEFS.find(x => x.mode === m); _v.copy(d.body).applyMatrix4(d.root.matrixWorld).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  hitAt(x, y) { const h = pick(x, y); return h ? (h.pet ? "pet:" + h.pet.id : h.def ? h.def.mode : h.civic ? "civic:" + h.civic.id : h.folk ? "folk:" + h.folk.h.id : h.rbLock ? "rbLock" : h.isle ? "isle:" + h.isle : null) : null; },
  tagRect(m) { const r = DEFS.find(x => x.mode === m).tag.getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; },
  petScreen(id) { const p = pets.get(id); if (!p) return null; _v.set(0, PET_H * 0.45 * (STAGE_SCALE[p.stage] || 1), 0).applyMatrix4(p.holder.matrixWorld).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  pets: () => [...pets.keys()],
  worn: id => { const a = pets.get(id); return a ? { stage: a.stage, items: (a.worn || []).filter(m => m.parent === a.body).map(m => m.userData.wear).sort(), want: a.f.wear || null } : null; },   // 寵物換裝：這隻身上現在掛了哪些配件（3D 場景裡真的掛在身上的）
  // 寵物特寫（截圖用）：所有寵物停下來、鏡頭拉近對準這隻（z＝縮放倍率）
  petFocus(id, z = 3.2) { const a = pets.get(id); if (!a) return false; noPause = true; for (const b of agents) if (b.kind === "pet") { b.pause = 1e9; b.moving = false; } user.zoom = z; _v.set(a.x, 0.5, a.z).applyMatrix4(camera.matrixWorldInverse); user.px = _v.x - view.cx; user.py = _v.y - view.cy; return true; },
  locked: () => MAIN_DEFS.filter(d => d.locked).map(d => d.mode),   // 主島的；彩虹島看 rainbow().locked
  // 彩虹島（10-12）：開了沒、人在哪、建築／居民好了沒、上鎖的建築、路網（只算彩虹島＋橋：節點、斷頭路、門口）
  rainbow() {
    const ns = [...graph.nodes.values()].filter(n => n.edges.some(e => e.rb));
    return { open: !!rb.open, place: town.place, gapVisible: !!(rb.gap && rb.gap.visible && rb.gap.position.y > -0.05), barrier: !!(rb.barrier && rb.barrier.visible),
      ready: DEFS.filter(d => d.isle === "rainbow" && d.ready).map(d => d.mode), locked: DEFS.filter(d => d.isle === "rainbow" && d.locked).map(d => d.mode), folk: rb.folk.map(f => f.h.id),
      nodes: ns.length, deadEnds: ns.filter(n => n.edges.length === 1 && !n.door).map(n => [n.x, n.z]), doors: ns.filter(n => n.door).map(n => n.door.mode || n.door.id),
      off: [+town.off.x.toFixed(2), +town.off.y.toFixed(2)], zoom: +user.zoom.toFixed(3), sun: [+sun.target.position.x.toFixed(2), +sun.target.position.z.toFixed(2)], active: rbActive() };
  },
  rbScreen(id) { const h = RB_HOUSES.find(q => q.id === id), f = rb.folk.find(q => q.h.id === id), p = f ? f.holder.position : h ? new THREE.Vector3(h.x, 0, h.z) : null; if (!p) return null; _v.set(p.x, 0.45, p.z).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  bridgeScreen() { if (!rb.bridge) return null; const { xa, xb, yA } = rb.bridge, x = (xa + xb) / 2; _v.set(x, yA(x), 0).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  tapRainbowLock: () => tapRbLock(), tapFolk(id) { const f = rb.folk.find(q => q.h.id === id); if (f) tapFolk(f); return !!f; },
  lockScreen(m) { const d = DEFS.find(x => x.mode === m), L = d.lockSpot; if (!L) return null; _v.set(d.x + L.x, L.y + 0.3, d.z + L.z).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },   // 施工路障在螢幕上的位置（截圖檢查穿模用）
  finger: () => !!finger,
  tags(on) { tagLayer.style.visibility = on ? "" : "hidden"; },
  // 浮標精簡（10-12）：拉近／拉遠狀態、按住的是哪棟、哪些展開著、哪些是「新」；openAll(true)＝全部展開（false 還原）
  lod: () => ({ near: LOD.near, far: LOD.far, press: LOD.press ? (LOD.press._def ? LOD.press._def.mode : "civic") : null, open: DEFS.filter(d => d.tag._open).map(d => d.mode), sel: sel ? sel.mode : null, stale: DEFS.filter(d => d.tw0 !== undefined && d.tag.offsetWidth && Math.abs(d.tw0 - d.tag.offsetWidth) > 1).map(d => `${d.mode}:${d.tw0}/${d.tag.offsetWidth}`), zoom: +user.zoom.toFixed(3), px: +user.px.toFixed(2), py: +user.py.toFixed(2) }),
  openAll(on) { LOD.near = !!on; LOD.forceNear = !!on; },
  openOne(m) { const d = DEFS.find(x => x.mode === m), c = CIVIC.find(x => x.id === m); pressTag(d ? d.tag : c ? c.tag : null); },   // 跟手指按住那一棟一樣（null＝放掉）
  focus(m, z = 1.5) { const d = DEFS.find(x => x.mode === m) || SPOTS.find(x => x.id === m); if (!d) { user.zoom = 1; user.px = user.py = 0; return; } user.zoom = z; _v.set(d.x, 1, d.z).applyMatrix4(camera.matrixWorldInverse); user.px = _v.x - view.cx; user.py = _v.y - view.cy; },
  setPets, setDecor, use, goPlace,
  // 10-12 路牌／點遠方的島：每支路牌（在哪座島、指去哪、3D 位置在螢幕上哪裡、浮標框、貼邊沒、鎖著沒）；isleScreen(p)＝那座島中心在螢幕上的位置；proj(x,y,z)＝世界座標→螢幕
  signs: () => SIGNS.map(s => { _v.set(s.x, s.y - 0.3, s.z).project(camera); const r = s.tag ? s.tag.getBoundingClientRect() : null;
    return { at: s.at, go: s.go, x: +s.x.toFixed(2), z: +s.z.toFixed(2), sx: Math.round((_v.x + 1) / 2 * innerWidth), sy: Math.round((1 - _v.y) / 2 * innerHeight), shown: !!(r && r.width), rect: r && { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }, edge: !!s.edge, locked: !!(s.tag && s.tag.classList.contains("locked")) }; }),
  isleScreen(p) { const c = { main: [-2.4, 2.4], town: [DIST.x - 1.5, DIST.z + 1.5], rainbow: [RB.x + 1.6, RB.z + 2.8] }[p]; _v.set(c[0], 0, c[1]).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },   // 地面上空曠的一點（不是建築）
  proj(x, y, z) { _v.set(x, y, z).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  isleAt: (x, z) => isleAt(x, z), sel: () => sel ? sel.mode : null, focusing: () => focus.on, place: () => town.place,
  cam(z, px = 0, py = 0) { user.zoom = z; user.px = px; user.py = py; },   // 宣傳片運鏡（tools/promo）
  events(on) { town.nextEvent = on ? performance.now() + 25000 : 1e15; },   // 錄影時關掉隨機火災／生病
  town: () => ({ open: town.open, place: town.place, off: [+town.off.x.toFixed(2), +town.off.y.toFixed(2)], locked: CIVIC.filter(c => c.locked).map(c => c.id), ready: CIVIC.filter(c => c.ready).map(c => c.id), fires: town.fires.length, busy: ["fire", "hospital"].filter(k => town[k + "Busy"]), patrol: !!(town.patrol && town.patrol.e),
    games: DEFS.filter(d => d.isle === "town").map(d => ({ mode: d.mode, ready: !!d.ready, locked: !!d.locked, door: !!(d.doorNode && d.doorNode.edges.length) })) }),   // games：歸仁區的遊戲建築（10-12 陀螺競技場）
  fire: m => { const d = DEFS.find(x => x.mode === m) || DEFS.find(x => !x.locked && x.ready && !x.free); return !!(d && startFire(d)); },
  sick: () => sickPet(), tapCivic: id => tapCivic(CIVIC.find(c => c.id === id)),
  civicScreen(id) { const c = CIVIC.find(q => q.id === id); _v.set(c.x, 0.9, c.z).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  decorCount: () => decorGroup ? decorGroup.userData.count : 0, decorSlots: () => decorSlots.length,
  // 路網：節點數、邊數、連通塊數、每棟建築／景點門口都接到路網了沒
  graph() {
    const ns = [...graph.nodes.values()], seen = new Set(); let comps = 0;
    for (const n of ns) { if (seen.has(n)) continue; comps++; const st = [n]; seen.add(n); while (st.length) { const c = st.pop(); for (const e of c.edges) { const o = e.a === c ? e.b : e.a; if (!seen.has(o)) { seen.add(o); st.push(o); } } } }
    const doors = ns.filter(n => n.door).map(n => n.door.mode || n.door.id);
    return { nodes: ns.length, edges: graph.edges.length, components: comps, doors, deadEnds: ns.filter(n => n.edges.length === 1 && !n.door).length };
  },
  // 走路狀況：每隻的位置、速度、卡住秒數（測試算「有沒有塞住」）
  agents: () => agents.map(a => ({ kind: a.kind, id: a.id, x: a.x, z: a.z, wait: a.wait, pause: a.pause, moving: a.moving, onRoad: !!a.e, turns: a.turns || 0, home: !!a.home, visible: !!(a.holder && a.holder.visible) })),
  // 交會測試：只留兩隻寵物，面對面放在一條直路的兩頭，看會不會錯身而過（不該停下來掉頭）
  duel() {
    const ps = agents.filter(a => a.kind === "pet" && a.e).slice(0, 2); if (ps.length < 2) return false;
    for (const a of agents) if (!ps.includes(a)) { a.e = null; a.holder.visible = false; }
    noPause = true;
    const n = [...graph.nodes.values()].find(n => !n.door && n.edges.length === 2 && n.edges.every(e => !e.spur && e.pts.length === 2 && e.len >= 1.6) && Math.abs((n.edges[0].pts[1].x - n.edges[0].pts[0].x) * (n.edges[1].pts[1].y - n.edges[1].pts[0].y) - (n.edges[0].pts[1].y - n.edges[0].pts[0].y) * (n.edges[1].pts[1].x - n.edges[1].pts[0].x)) < 1e-6);
    if (!n) return false;
    ps.forEach((a, i) => { const e = n.edges[i], fwd = e.b === n; Object.assign(a, { e, fwd, s: e.len - 1.4, pause: 0, wait: 0, turns: 0, home: false }); const q = edgePoint(e, fwd ? a.s : e.len - a.s, {}); a.x = q.x; a.z = q.z; a.hx = fwd ? q.hx : -q.hx; a.hz = fwd ? q.hz : -q.hz; });
    return { node: [n.x, n.z], ids: ps.map(a => a.id) };
  },
  // 島（草地＋台階）在螢幕上的大小：外框、畫面內面積、浮標總面積佔島的比例
  islandPx() {
    const W = innerWidth, H = innerHeight;
    let pts = islPoly.map(v => { _v.set(v.x, 0, v.y).project(camera); return [(_v.x + 1) / 2 * W, (1 - _v.y) / 2 * H]; });
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const clip = (poly, inside, cut) => { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); } return out; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let c = pts;
    c = clip(c, q => q[0] >= 0, (a, b) => lerp(a, b, (0 - a[0]) / (b[0] - a[0]))); c = clip(c, q => q[0] <= W, (a, b) => lerp(a, b, (W - a[0]) / (b[0] - a[0])));
    c = clip(c, q => q[1] >= 0, (a, b) => lerp(a, b, (0 - a[1]) / (b[1] - a[1]))); c = clip(c, q => q[1] <= H, (a, b) => lerp(a, b, (H - a[1]) / (b[1] - a[1])));
    let area = 0; for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length]; area += a[0] * b[1] - b[0] * a[1]; } area = Math.abs(area) / 2;
    let tags = 0; for (const d of DEFS) { const r = d.tag.getBoundingClientRect(); tags += r.width * r.height; }
    const r0 = v => Math.round(v);
    return { x0: r0(Math.min(...xs)), y0: r0(Math.min(...ys)), x1: r0(Math.max(...xs)), y1: r0(Math.max(...ys)), w: r0(Math.max(...xs) - Math.min(...xs)), h: r0(Math.max(...ys) - Math.min(...ys)), onScreen: r0(area), tags: r0(tags), ratio: +(tags / area).toFixed(3) };
  },
  shadowNow() { shadowDirty = true; },
  measure() {
    const out = {}; scene.updateMatrixWorld(true);
    for (const d of DEFS) {
      const o = d.root.position.clone().negate(), b = new THREE.Box3().setFromObject(d.pivot).translate(o), a = d.anchorBox.clone().translate(o), r = v => Math.round(v * 100) / 100;
      const cx = (a.min.x + a.max.x) / 2, cz = (a.min.z + a.max.z) / 2, top = Math.max(a.max.y, d.sigBox ? d.sigBox.max.y - d.root.position.y : -9);
      out[d.mode] = [[b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z].map(r), [cx, top + 0.12, cz].map(r), [cx, a.min.y + (a.max.y - a.min.y) * 0.4, cz].map(r)];   // 浮標尖角碰屋頂（招牌）
    }
    return JSON.stringify(out);
  },
  // 三角形數（效能檢查）：彩虹島（x < −12.5）／其他，依種類分
  triStats() {
    const out = {}; scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!o.isMesh || !o.visible || (o.material && o.material.visible === false)) return;
      const g = o.geometry; let t = (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (o.isInstancedMesh) { t *= o.count; o.computeBoundingSphere(); _v.copy(o.boundingSphere.center).applyMatrix4(o.matrixWorld); }
      else { if (!g.boundingSphere) g.computeBoundingSphere(); _v.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld); }
      const k = (_v.x < -12.5 ? "rb:" : "main:") + (o.isInstancedMesh ? "inst" : o.material && o.material.map ? "tex" : "other");
      out[k] = (out[k] || 0) + Math.round(t); out[k + "#"] = (out[k + "#"] || 0) + 1;
    });
    return out;
  },
  stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, pixelRatio: renderer.getPixelRatio() }),
  dispose,
  // 10-12 同樂廣場慶祝裝飾：現在是第幾段、場景裡有哪些東西；fireworks(n)＝馬上放 n 發（截圖用）；celeScreen()＝獎盃在螢幕上的位置
  cele: () => ({ lv: cele.lv, balloons: cele.bal ? cele.bal.count : 0, trophy: !!cele.trophy, fw: !!cele.fw, alive: cele.alive, inScene: !!(cele.g && cele.g.parent) }),
  fireworks(n = 3) { if (!cele.g) celebrate(cele.lv); let k = 0; for (let i = 0; i < n; i++) if (celeLaunch()) k++; return k; },
  celeScreen() { const s = SPOTS.find(q => q.id === CELE_CUP[0]); _v.set(s.x + CELE_CUP[1], 1.4, s.z + CELE_CUP[2]).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
};
