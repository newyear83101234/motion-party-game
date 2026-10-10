// ===================== 注音小島 3D 選單（等角小島）=====================
// zhuyin.js 在選單需要時用動態 import() 載入；載入失敗／沒有 WebGL2／逾時 → zhuyin.js 退回原本卡片選單。
// 每棟建築＝一個遊戲：點建築（或上方浮標）＝點那張 .mode-card，解鎖判斷、翻牌選張數都沿用 zhuyin.js 原本的程式；扭蛋機呼叫 opts.onGacha()。
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

// ---------- 常數 ----------
const P = { deep: "#3f97c9", grid: "#5fa9d6", shallow: "#7fcfd0", sand: "#ecd7a3", dirt: "#a8673f", dirtDk: "#7d4a2e", grass: "#86c449", grassDk: "#5f9c3a",
  plaza: "#ddd8cf", road: "#bdb8b1", purple: "#8b70cc", purpleDk: "#5e4aa8", cream: "#f0e7d3", eave: "#2f6b50", pink: "#f2808f", autumn: "#f08a3c", wood: "#c98a55" };
const PITCH = 4.8, RW = 1.25, SW = 0.45, LANE = 0.3, RR = 1.85;   // 街區間距、車道寬、人行道寬、車道（靠右）偏移、中央圓環半徑
const MAX_WALK = 11;                                  // 同時在路上走的寵物最多幾隻（其他在寵物公園，輪流出來；寧次 10-10）
const ROADS = [-PITCH, 0, PITCH];                      // 井字路：x 與 z 各三條，延伸到海邊
const BC = b => (b - 1.5) * PITCH;                     // 街區中心：-7.2 -2.4 2.4 7.2
const LEDGE_Y = -0.28, SEA_Y = -0.95, SAND_Y = -0.66;   // 海邊一圈較低的草地台階、海面、沙灘
const KIT = "IMAGE/zy3d/kenney/", MODELS = "IMAGE/zy3d/models/";
const TEX_KITS = new Set(["city-kit-commercial", "fantasy-town-kit", "pirate-kit", "watercraft-pack", "car-kit", "holiday-kit", "food-kit", "cube-pets"]);   // 有 colormap 調色盤的套件
const CAM_EL = 31 * Math.PI / 180;                    // 俯角 31°（計畫 30–35°）
const FPS = 30;                                       // 省電：最多 30 格／秒
const TAP_MOVE = 24, TAP_MS = 800;                    // 5 歲小孩常按久、拖著點：移動 < 24px、按住 < 0.8 秒都算點（寧次 10-10）
const DEBUG = /[?&]debug\b/.test(location.search);
// 遊戲建築（＋扭蛋機）：街區 (bx, bz)，door＝往哪一側的路接過去；鏡頭從 +x+z 看，正面朝 +x 或 +z。
// ex＝不種樹的範圍、foot＝施工圍籬半寬；LAYOUT 是模型載完後的實際大小（區域座標，先寫死：模型還在下載時鏡頭就能擺好、浮標就能點，
// 改了建築要更新——網址加 ?debug 後在主控台跑 __hub3d.measure() 會印出新的值）
const DEFS = [
  { mode: "hunt", bx: 0, bz: 0, door: [0, 1], ex: [-1.8, 1.8, -1.8, 1.8], foot: [1.5, 1.5] },
  { mode: "match", bx: 2, bz: 0, door: [0, 1], ex: [-1.4, 1.4, -1.5, 1.7], foot: [1.1, 1.3] },
  { mode: "build", bx: 1, bz: 1, door: [1, 0], ex: [-1.5, 1.6, -1.6, 1.6], foot: [1.2, 1.45] },
  { mode: "tone", bx: 3, bz: 1, door: [0, 1], ex: [-1.5, 1.8, -1.6, 1.6], foot: [1.2, 1.2] },
  { mode: "whack", bx: 0, bz: 2, door: [1, 0], ex: [-1.7, 1.8, -1.6, 1.6], foot: [1.4, 1.3] },
  { mode: "order", bx: 2, bz: 2, door: [1, 0], ex: [-1.8, 1.8, -1.5, 1.5], foot: [1.35, 1.2] },
  { mode: "fish", bx: 1, bz: 3, door: [1, 0], ex: [-1.6, 1.6, 1.2, 2.8], foot: [1.2, 1.0] },
  { mode: "frog", bx: 3, bz: 3, door: [0, -1], ex: [-1.8, 1.9, -1.6, 1.7], foot: [1.5, 1.3] },
  { mode: "gacha", bx: 0, bz: 3, door: [1, 0], ex: [-1.5, 1.5, -1.5, 1.5], foot: [1.1, 1.1], free: true },
].map(d => ({ ...d, x: BC(d.bx), z: BC(d.bz) }));
const LAYOUT = {   // [box x0,x1,y0,y1,z0,z1]、[anchor x,y,z]、[body x,y,z]（區域座標）
  hunt: [[-1.48, 1.24, 0.5, 2.32, -1.12, 1.43], [0.27, 1.64, 0.27], [0.27, 0.94, 0.27]],
  match: [[-0.8, 0.8, 0, 3.37, -0.87, 1.44], [0, 3.53, -0.15], [0, 1.0, -0.15]],
  build: [[-1.8, 1.22, 0, 2.27, -1.18, 1.61], [-0.3, 2.39, 0], [-0.3, 0.91, 0]],
  tone: [[-0.6, 1.89, 0, 3.2, -1.29, 1.84], [0.35, 1.82, -0.25], [0.35, 0.68, -0.25]],
  whack: [[-1.87, 1.3, -0.36, 1.55, -1.15, 1.35], [-1.12, 1.67, -0.1], [-1.12, 0.62, -0.1]],
  order: [[-1.4, 1.76, 0, 2.82, -1.19, 1.71], [-0.2, 2.99, 0], [-0.2, 0.79, 0]],
  fish: [[-1.84, 2.01, -1.09, 1.27, 0.79, 6.64], [1.45, 0.44, 4.3], [1.45, -0.49, 4.3]],
  frog: [[-1.57, 2.23, -0.16, 1.11, -1.44, 1.82], [0.37, 0.16, 0.32], [0.37, 0.03, 0.32]],
  gacha: [[-1.32, 1.15, 0, 2.34, -1.23, 1.23], [-0.55, 1.99, 0], [-0.55, 0.75, 0]],
};
// 景點（沒有浮標、點了沒反應）
const SPOTS = [
  { id: "garden", bx: 1, bz: 0, door: [0, 1] }, { id: "lighthouse", bx: 3, bz: 0, door: [-1, 0] }, { id: "playground", bx: 0, bz: 1, door: [1, 0] },
  { id: "statue", bx: 2, bz: 1, door: [-1, 0] }, { id: "park", bx: 1, bz: 2, door: [0, 1] }, { id: "carousel", bx: 3, bz: 2, door: [-1, 0] }, { id: "beach", bx: 2, bz: 3, door: [0, -1] },
].map(s => ({ ...s, x: BC(s.bx), z: BC(s.bz) }));
// 寵物：models.json 有列的自製模型優先；沒有就用 Kenney Cube Pets 原檔（依檔名猜）
const PET_KENNEY = { cat: "animal-cat", fox: "animal-fox", lion: "animal-lion", panda: "animal-panda", penguin: "animal-penguin", bunny: "animal-bunny" };
const PET_H = 1.0, STAGE_SCALE = { 1: 0.75, 2: 1, 3: 1.15 };   // 寵物身高（長大＝原尺寸）；寶寶 0.75、超級 1.15

// ---------- 狀態 ----------
let renderer, scene, camera, sun, stage, tagLayer, finger, opts;
let running = false, raf = 0, shown = false, frames = 0, needFit = true, lastMs = 0, lastDraw = 0, dead = false, lost = false, lostTimer = 0, fitSig = "", built = false;
let fitObs = [], shadowDirty = true, lastShadow = 0, dpr = 1, dprWin = [], dprCool = Infinity, restStarted = false, parkDoor = null, restSlots = [], lastRotate = 0, noPause = false;
const tickers = [];                                   // 每幀持續動畫 (t, dt)
const anims = new Set();                              // 一次性動畫 { update(now) → false 結束 }
const view = { k: 40, cx: 0, cy: 0 };                 // 擺好的鏡頭：每單位幾 px、視角中心
const user = { zoom: 1, px: 0, py: 0 };               // 小孩拖曳／縮放
const hitBoxes = [], agents = [], pets = new Map(), timers = new Set(), failedPets = new Set(), warnedPets = new Set();
const exRects = [], terraces = [], blobs = [], decorSlots = [], statics = [];   // statics：景點、路、地形等不會動也不能點的群組（最後整個合併）
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
function kitImage(kit) { return kitImgP[kit] || (kitImgP[kit] = new THREE.ImageLoader().loadAsync(`${KIT}${kit}/Textures/colormap.png`).then(img => (kitImg[kit] = img))); }
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
function models() { return modelList || (modelList = fetch(MODELS + "models.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => ({ set: new Set(j.models || []), anchors: j.anchors || {} }))); }
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
  for (const t of terraces) if (x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1) return t.y;
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
  const N = 160, R = 15, data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N * 2 * R - R, z = (j + 0.5) / N * 2 * R - R;
    let d = sdIsland(x, z) - 1.25;
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
  for (const d of [...DEFS, ...SPOTS]) {
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
  // 施工圍籬：橘白斜條紋板（共用材質，條紋密度改 UV）＋柱子，圍在鏡頭看得到的兩面（+x、+z）
  const [fx, fz] = d.foot, g = d.lockDeco;
  const board = w => { const geo = box(w, 0.2, 0.05), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * w / 1.1); return geo; };
  const barrier = (x, z, ry, w) => {
    const bg = new THREE.Group(); bg.position.set(x, 0, z); bg.rotation.y = ry; g.add(bg);
    const geo = board(w);
    mesh(geo, fenceMat, { y: 0.42, parent: bg }); mesh(geo, fenceMat, { y: 0.16, parent: bg });
    for (const s of [-1, 1]) mesh(box(0.07, 0.6, 0.07), postMat, { x: s * (w / 2 - 0.06), y: 0.3, parent: bg });
  };
  barrier(fx + 0.25, 0, Math.PI / 2, fz * 1.5);
  barrier(0, fz + 0.25, 0, fx * 1.5);
  g.traverse(o => { if (o.isMesh) o.userData.keepColor = true; });
  mergeStatic(g);
}
// 第二段：模型到了 → 蓋好 → 合併不動的 mesh → 套灰階 → 「長出來」
async function buildDef(d, builder, delay) {
  const p = d.pivot;
  const a = await builder(d, p);
  scene.updateMatrixWorld(true); d.anchorBox = new THREE.Box3().setFromObject(a); d.sigBox = d.sig ? new THREE.Box3().setFromObject(d.sig) : null;   // 給 __hub3d.measure() 用（合併前量）
  if (!d.free) {
    const [fx, fz] = d.foot;
    await Promise.all([[fx + 0.25, fz + 0.25], [fx + 0.25, -fz * 0.95], [-fx * 0.95, fz + 0.25]].map(([x, z]) => kenney("car-kit", "cone", { scale: 0.75, x, z, parent: d.lockDeco, shadow: false })));
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
    ...[-0.55, 0.55].map(z => kenney("nature-kit", "crops_dirtRow", { parent: p, scale: 1.1, x: 0.1, y: 0.07, z, shadow: false })),
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
const BUILDERS = { fish: buildFish, order: buildOrder, build: buildBuild, hunt: buildHunt, match: buildMatch, tone: buildTone, whack: buildWhack, frog: buildFrog, gacha: buildGacha };

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
  // 海灘：小海灣、遮陽傘、浴巾、救生員椅、海灘球
  beach(s, g) {
    for (const [x, z, c] of [[-0.55, 1.6, "#5fb4ff"], [0.3, 1.9, "#ff8fb0"], [1.0, 1.35, "#ffd166"]]) vm(box(0.45, 0.02, 0.8), c, { x, y: groundY(s.x + x, s.z + z) + 0.02, z, ry: 0.3, parent: g, shadow: false });
    const lc = new THREE.Group(); lc.position.set(-1.0, groundY(s.x - 1.0, s.z + 0.75), 0.75); g.add(lc);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) vm(box(0.05, 1.0, 0.05), "#ffffff", { x, y: 0.5, z, parent: lc });
    vm(box(0.5, 0.06, 0.5), "#e2453c", { y: 1.0, parent: lc }); vm(box(0.5, 0.35, 0.05), "#e2453c", { y: 1.2, z: -0.22, parent: lc });
    const ball = new THREE.SphereGeometry(0.16, 12, 8), bp = ball.attributes.position, bc = new Float32Array(bp.count * 3);
    for (let i = 0; i < bp.count; i++) { const a = Math.atan2(bp.getZ(i), bp.getX(i)); _c.set(["#ff6f86", "#ffffff", "#5fb4ff", "#ffd166"][Math.floor((a + Math.PI) / (Math.PI / 2)) % 4]); bc.set([_c.r, _c.g, _c.b], i * 3); }
    ball.setAttribute("color", new THREE.BufferAttribute(bc, 3)); mesh(ball.toNonIndexed(), vcMat, { x: 0.8, y: groundY(s.x + 0.8, s.z + 0.5) + 0.16, z: 0.5, parent: g, shadow: false });
    ex(s, -1.35, 1.35, -1.35, 2.6); slot(s.x - 0.3, s.z - 0.9); slot(s.x + 1.0, s.z - 0.75); slot(s.x - 1.05, s.z - 0.3);
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
  // 海灘遮陽傘
  const bc = S("beach");
  for (const [x, z, col] of [[-0.45, 1.15, "#ff8fb0"], [0.75, 1.6, "#ffd36b"], [1.05, 0.75, "#7fd7f0"]]) jobs.push(kenney("city-kit-commercial", "detail-parasol-a", { scale: 2.3, x, z, y: groundY(bc.x + x, bc.z + z), tints: [[0, 1, col]], parent: bc.g }));
  await Promise.all(jobs);
  for (const g of [c, st.g, pg.g, bc.g]) mergeStatic(g);
  shadowDirty = true;
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
  const rand = rng(7), placed = [], inst = [[], [], [], [], []], spots = [];
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
  const pool = graph.edges.filter(e => !e.spur && (kind !== "car" || (e.a.edges.length > 1 && e.b.edges.length > 1)));
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
  while (q.length) { const c = q.shift(); if (c === target) break; for (const e of c.edges) { const o = e.a === c ? e.b : e.a; if (!prev.has(o) && (!o.door || o === target)) { prev.set(o, [c, e]); q.push(o); } } }
  if (!prev.has(target)) return null;
  let c = target, first = null; while (prev.get(c)) { const [pc, e] = prev.get(c); first = e; c = pc; }
  return first;
}
function nextEdge(a) {
  const n = a.fwd ? a.e.b : a.e.a;
  if (a.home) {                                         // 要回寵物公園休息
    if (n === parkDoor) { restPet(a); wakeOne(); return; }
    const e = routeStep(n, parkDoor); if (e) { a.e = e; a.fwd = e.a === n; a.s = 0; return; }
    a.home = false;
  }
  if (n.door && a.kind === "pet") { a.pause = 2 + agentRand() * 2.5; a.atDoor = true; a.fwd = !a.fwd; a.s = 0; return; }   // 到建築門口：停一下、轉身看鏡頭，再走回去
  let opts = n.edges.filter(e => e !== a.e && (a.kind === "pet" || !e.spur) && !(e.spur && (e.a === parkDoor || e.b === parkDoor)));
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
    for (const o of agents) {
      if (o === a || !o.e) continue;
      const dx = o.x - a.x, dz = o.z - a.z, ahead = dx * a.hx + dz * a.hz, sum = a.r + o.r;
      if (ahead > 0.05 && ahead <= sum + 0.35 && Math.abs(dx * a.hz - dz * a.hx) < sum * 0.45) { blocked = true; break; }
    }
    a.atDoor = false;
    if (blocked) { a.wait += dt; a.moving = false; if (a.wait > 2.2) { a.wait = 0; a.turns = (a.turns || 0) + 1; a.fwd = !a.fwd; a.s = a.e.len - a.s; } }
    else {
      a.wait = 0; a.moving = true;
      a.s += a.speed * dt;
      let guard = 0; while (a.e && a.s >= a.e.len && guard++ < 4) { const over = a.s - a.e.len; nextEdge(a); a.s = over; if (a.pause > 0) break; }
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
  let d = Math.abs(Math.hypot(x, z) - RR); for (const c of ROADS) d = Math.min(d, Math.abs(x - c), Math.abs(z - c));
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
// 配件（models.json 有列才載）：crown／hat／baby_tuft 掛頭頂（原點在底部）、cape 掛背（原點在上緣）、bow 掛頭側再轉一點
const WEAR = { crown: "head", hat: "head", baby_tuft: "head", cape: "back", bow: "head_side" };
async function wear(a, name) {
  const url = await usableGlb(`${MODELS}${name}.glb`); if (!url) return null;
  const m = await loadAny(url);
  m.scale.multiplyScalar(a.fitScale); m.position.copy(a.anchors[WEAR[name]]);
  if (name === "bow") m.rotation.set(0, -25 * Math.PI / 180, -22 * Math.PI / 180);
  m.traverse(o => { o.castShadow = false; });
  return m;
}
async function applyStage(a, stage) {
  stage = STAGE_SCALE[stage] ? stage : 2; a.stage = stage;
  const s = STAGE_SCALE[stage], token = {}; a.wearToken = token;
  a.obj.scale.setScalar(s); a.hit.scale.setScalar(s); a.r = 0.4 * s;
  for (const m of a.worn || []) a.body.remove(m);
  a.worn = [];
  if (a.spark) { a.obj.remove(a.spark); a.spark = null; }
  // 寶寶＝頭頂小呆毛；超級＝皇冠＋小披風＋身邊閃光；另外可以穿戴扭蛋抽到的裝扮（p.wear，頭上只戴一樣）
  let names = [...(stage === 1 ? ["baby_tuft"] : stage === 3 ? ["crown", "cape"] : []), ...(a.f.wear || [])].filter((n, i, l) => WEAR[n] && l.indexOf(n) === i);
  const firstHead = names.find(n => WEAR[n] === "head"); names = names.filter(n => WEAR[n] !== "head" || n === firstHead);
  if (stage === 3) {
    const sp = new THREE.Group(); a.spark = sp; sp.userData.dyn = true; a.obj.add(sp);
    for (let k = 0; k < 3; k++) mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: "#fff3a0", toneMapped: false }), { x: Math.cos(k * 2.1) * 0.55, y: 0.5 + k * 0.25, z: Math.sin(k * 2.1) * 0.55, parent: sp, shadow: false });
  }
  const ms = await Promise.all(names.map(n => wear(a, n).catch(() => null)));
  if (a.wearToken !== token) return;
  for (const m of ms) if (m) { a.body.add(m); a.worn.push(m); }
}
function removeAgent(a) { scene.remove(a.holder); for (const g of a.geos || []) g.dispose(); const i = agents.indexOf(a); if (i >= 0) agents.splice(i, 1); }   // 配件是共用快取，不釋放
const spawning = new Set();
function syncPets() {
  if (!built || !petWant) return;                     // 建築都到了才載寵物（先把頻寬讓給建築）
  const want = new Map(petWant.map(p => [p.id, p]));
  for (const [id, a] of pets) {
    const w = want.get(id);
    if (!w || (w.glb || "") !== (a.f.glb || "")) { removeAgent(a); pets.delete(id); continue; }
    const wearKey = (w.wear || []).join(","), had = (a.f.wear || []).join(",");
    a.f = w; if (w.stage !== a.stage || wearKey !== had) applyStage(a, w.stage);
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
function makeTags() {
  for (const d of DEFS) {
    const t = document.createElement("button"); t.className = "hub-tag"; t.type = "button"; t.dataset.mode = d.mode;
    t.innerHTML = '<span class="ht-row"><span class="ht-ico"></span><span class="ht-word"></span><span class="ht-lock"></span></span>';
    t.addEventListener("pointerdown", () => preloadCard(d));
    t.addEventListener("click", () => tapBuilding(d));
    tagLayer.appendChild(t); d.tag = t;
  }
  if ("ResizeObserver" in window) { tagRO = new ResizeObserver(() => { needFit = true; }); DEFS.forEach(d => tagRO.observe(d.tag)); }
}
function syncTag(d, card) {
  const set = (sel, txt) => { const e = d.tag.querySelector(sel); if (e.textContent !== txt) e.textContent = txt; };
  if (d.free) { const L = (opts.labels || {})[d.mode] || {}; set(".ht-ico", L.ico || ""); set(".ht-word", L.word || ""); set(".ht-lock", ""); return; }
  set(".ht-ico", card.querySelector(".big")?.textContent || "");
  set(".ht-word", card.querySelector(".label")?.textContent || "");
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
function tapBuilding(d) {
  const now = performance.now(); if (now < tapLockUntil) return; tapLockUntil = now + 700;
  preloadCard(d); bounce(d, d.locked);
  later(() => { if (!shown) return; if (d.mode === "gacha") { try { opts.onGacha(); } catch (e) {} } else cardOf(d.mode)?.click(); }, d.locked ? 120 : 260);
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
  if (pm && (!bm || pm.distance < bm.distance)) return { pet: agentOf(pm.object) };   // 真的點到寵物身上、而且寵物在建築前面
  if (bm) { let o = bm.object; while (o && !o.userData.def) o = o.parent; if (o) return { def: o.userData.def }; }
  const ph = raycaster.intersectObjects(vis.filter(a => !a.atDoor).map(a => a.hit), false);   // 寵物身邊一圈（小孩點不準）：停在門口的不算
  if (ph.length) return { pet: ph[0].object.userData.pet };
  const bh = raycaster.intersectObjects(hitBoxes, false);
  if (bh.length) return { def: bh[0].object.userData.def };
  return null;
}

// ---------- 手勢：輕點、拖曳平移、雙指縮放 ----------
const ptrs = new Map(); let pinch = null;
function bindInput(cv) {
  cv.addEventListener("pointerdown", e => {
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0, multi: ptrs.size > 0 });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; a.multi = b.multi = true; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: user.zoom }; }
    else { const hit = pick(e.clientX, e.clientY); if (hit && hit.def) preloadCard(hit.def); }
  });
  cv.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
    if (ptrs.size >= 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, Math.min(1.6, Math.max(0.8, pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0)));
      panBy(dx / 2, dy / 2);
    } else if (p.moved >= TAP_MOVE) panBy(dx, dy);    // 超過點擊容許範圍才算拖曳
  });
  const up = e => {
    const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (e.type === "pointerup" && !p.multi && p.moved < TAP_MOVE && performance.now() - p.t0 < TAP_MS) {
      const hit = pick(p.x0, p.y0) || pick(e.clientX, e.clientY);   // 以按下去的位置為準（小孩常按著滑一下）
      if (hit && hit.pet) tapPet(hit.pet); else if (hit && hit.def) tapBuilding(hit.def);
    }
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.min(1.6, Math.max(0.8, user.zoom * Math.exp(-e.deltaY * 0.0015)))); }, { passive: false });
}
function panBy(dx, dy) { const k = view.k * user.zoom; user.px -= dx / k; user.py += dy / k; clampPan(); }
function zoomAt(sx, sy, nz) {
  const W = innerWidth, H = innerHeight, k1 = view.k * user.zoom, k2 = view.k * nz;
  user.px += (sx - W / 2) / k1 - (sx - W / 2) / k2; user.py -= (sy - H / 2) / k1 - (sy - H / 2) / k2;   // 縮放時手指下的那一點不動
  user.zoom = nz; clampPan();
}
function clampPan() { user.px = Math.max(-7, Math.min(7, user.px)); user.py = Math.max(-4.5, Math.min(4.5, user.py)); }   // 島比畫面大：可以拖過去看海邊的景點

// =========================================================
// 鏡頭擺位：所有遊戲建築＋浮標都不能被標題、圓鈕、膠囊、貓頭鷹擋住（景點、海邊可以超出畫面）
// =========================================================
const baseCam = new THREE.OrthographicCamera();
function setCamDir(cam, az) { cam.position.set(Math.sin(az) * Math.cos(CAM_EL), Math.sin(CAM_EL), Math.cos(az) * Math.cos(CAM_EL)).multiplyScalar(60); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); }
function obstacles() {
  const out = [];
  for (const sel of ["#menu > h1", "#resumeBtn", "#menu > .menu-bottom", "#guide img", "#guideText", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#speakBtn", "#settingsBtn"]) {
    const e = document.querySelector(sel); if (!e || !e.offsetParent) continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const pad = sel === "#resumeBtn" ? 24 : 14;          // 繼續玩按鈕會閃動、鏡頭會漂：多留一點
    out.push({ x0: r.left - pad, x1: r.right + pad, y0: r.top - pad, y1: r.bottom + pad });   // display:none（例如 3D 選單的標題）量不到 → 上面就略過了
  }
  return out;
}
const TAIL = 12;
function fit() {
  const W = innerWidth, H = innerHeight;
  if (!W || !H) return false;
  const sizes = DEFS.map(d => [d.tw = d.tag.offsetWidth, d.th = d.tag.offsetHeight]);
  if (sizes.some(s => !s[0])) return false;             // 浮標還沒顯示（量不到大小）→ 下一幀再擺
  const obs = obstacles(); fitObs = obs;
  const sig = [W, H, ...sizes.flat(), ...obs.map(o => `${o.x0 | 0},${o.y0 | 0},${o.x1 | 0},${o.y1 | 0}`)].join("|");
  if (sig === fitSig) return true;                     // 畫面大小、障礙物、浮標大小都沒變 → 不用重算
  fitSig = sig;
  setCamDir(baseCam, Math.PI / 4);
  const inv = baseCam.matrixWorldInverse;
  const items = DEFS.map((d, i) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const { min, max } = d.box;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) { _v.set(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    _v.copy(d.body).add(d.root.position).applyMatrix4(inv); const bx = _v.x, by = _v.y;
    _v.copy(d.anchor).applyMatrix4(inv);
    return { x0, x1, y0, y1, bx, by, ax: _v.x, ay: _v.y, w: sizes[i][0], h: sizes[i][1] };
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
    rects.length = 0; lab.length = 0;
    for (const it of items) {
      const bx = sx + (it.bx - icx) * k, by = sy - (it.by - icy) * k, hw = (it.x1 - it.x0) * k * 0.22;   // 建築主體中間那一塊要在畫面裡（邊角、碼頭、船可以出去）
      rects.push({ x0: bx - hw, x1: bx + hw, y0: by - hw * 0.6, y1: by + hw * 0.6 });
      const ax = sx + (it.ax - icx) * k, ay = sy - (it.ay - icy) * k;
      lab.push({ ax, x0: ax - it.w / 2, x1: ax + it.w / 2, y0: ay - it.h - TAIL, y1: ay - TAIL });
    }
    nudge(lab, obs);
    let c = 0;
    for (const r of rects) { c += ((r.x1 - r.x0) * (r.y1 - r.y0) - ov(r, scr)) * 0.5; if (c > 0 && !full) return c; }   // 建築：主體在畫面裡就好（可以被介面壓到）
    for (const r of lab) {                              // 浮標：在畫面裡、而且不能被固定介面擋到
      c += (r.x1 - r.x0) * (r.y1 - r.y0) - ov(r, scr);
      for (const o of obs) c += ov(r, o);
      if (c > 0 && !full) return c;
    }
    return c;
  };
  let best = null, fb = null;
  for (let k = kMax; k >= kMax * 0.45 && !best; k *= 0.965) {
    for (const [ox, oy] of cand) if (!cost(k, pref.x + ox, pref.y + oy, false)) { best = { k, sx: pref.x + ox, sy: pref.y + oy }; break; }
    for (let i = 0; i < 160 && !best; i++) { const sx = pref.x + cand[i][0], sy = pref.y + cand[i][1], c = cost(k, sx, sy, true); if (!fb || c < fb.c * 0.97) fb = { c, k, sx, sy }; }
  }
  if (best && best.k < kMax) for (const f of [1.018, 1.009]) {   // 再細找一點：島能大就大
    const k = best.k * f; for (const [ox, oy] of cand) if (!cost(k, pref.x + ox, pref.y + oy, false)) { best = { k, sx: pref.x + ox, sy: pref.y + oy }; break; }
  }
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
      else for (const o of obs) {
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
const tagPos = [];
function frame(ms) {
  raf = 0; if (!running) return;
  raf = requestAnimationFrame(frame);
  if (lastDraw && ms - lastDraw < 1000 / FPS - 3) return;
  // 自動畫質：一直掉到 20 格以下就降解析度（DPR 2 → 1.5 → 1.25 → 1）
  if (lastDraw && built && ms > dprCool) { dprWin.push(ms - lastDraw); if (dprWin.length >= 45) { const avg = dprWin.reduce((a, b) => a + b, 0) / dprWin.length; dprWin = []; if (avg > 52 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false); dprCool = ms + 5000; } } }
  lastDraw = ms; frames++;
  const t = ms / 1000, dt = Math.min(0.1, lastMs ? (ms - lastMs) / 1000 : 0.033); lastMs = ms;
  if (needFit && fit()) needFit = false;
  const W = innerWidth, H = innerHeight, k = view.k * user.zoom;
  setCamDir(camera, Math.PI / 4 + Math.sin(t * 0.09) * 0.022);
  const cx = view.cx + user.px + Math.sin(t * 0.13) * 0.12, cy = view.cy + user.py + Math.sin(t * 0.1 + 1) * 0.08;
  camera.left = cx - W / 2 / k; camera.right = cx + W / 2 / k; camera.top = cy + H / 2 / k; camera.bottom = cy - H / 2 / k;
  camera.updateProjectionMatrix();
  seaU.uTime.value = t;
  for (const f of tickers) f(t, dt);
  for (const a of anims) if (a.update(performance.now()) === false) anims.delete(a);
  stepAgents(t, dt); updateAgentVisuals(t, dt);
  if (shadowDirty || ms - lastShadow > 4000) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; lastShadow = ms; }
  renderer.render(scene, camera);
  placeTags(t);
}
function placeTags(t) {
  const W = innerWidth, H = innerHeight;
  tagPos.length = 0;
  for (const d of DEFS) {
    _v.copy(d.anchor); _v.y += d.pivot.position.y; _v.project(camera);
    const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H, w = d.tw || 0, h = d.th || 0;
    tagPos.push({ d, ax: x, x0: x - w / 2, x1: x + w / 2, y0: y - h - TAIL, y1: y - TAIL });
  }
  nudge(tagPos, fitObs);
  for (const r of tagPos) {
    r.d.tag.style.transform = `translate3d(${r.x0.toFixed(1)}px, ${r.y0.toFixed(1)}px, 0)`; r.d.tag.style.zIndex = String(Math.round(r.y1)); r.d.tagRect = r;
    const tx = Math.round(r.ax - (r.x0 + r.x1) / 2); if (tx !== r.d.tx) { r.d.tx = tx; r.d.tag.style.setProperty("--tx", tx + "px"); }   // 浮標被挪開：尾巴還是指著建築
  }
  const cyc = Math.floor(t / 4);                       // 浮標每 4 秒輪流輕跳一下（只跳能玩的）
  if (cyc !== hopCycle) { hopCycle = cyc; DEFS.filter(d => !d.locked).forEach((d, i) => later(() => { if (!d.tag.classList.contains("pop")) { d.tag.classList.remove("hop"); void d.tag.offsetWidth; d.tag.classList.add("hop"); } }, i * 150)); }
  if (finger) { const r = DEFS.find(d => d.mode === "fish").tagRect; if (r) { finger.style.transform = `translate3d(${((r.x0 + r.x1) / 2 - 8).toFixed(1)}px, ${(r.y1 - 6).toFixed(1)}px, 0)`; finger.style.zIndex = "99999"; } }
}
function startLoop() { if (running || dead || lost || !shown || document.hidden) return; running = true; lastMs = lastDraw = 0; dprWin = []; raf = requestAnimationFrame(frame); }
function stopLoop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
function onResize() {
  if (dead) return;
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
  needFit = true;
  if (shown && !running) startLoop();
}
let resizeT = 0;
function onResizeEvt() { onResize(); clearTimeout(resizeT); resizeT = setTimeout(onResize, 300); }   // iOS 轉向後尺寸晚一點才正確：0.3 秒後再算一次
function onVis() { if (document.hidden) stopLoop(); else startLoop(); }
function onLost(e) {                                   // WebGL 被系統收走：先停、等 5 秒看會不會回來
  e.preventDefault(); lost = true; stopLoop();
  clearTimeout(lostTimer); lostTimer = setTimeout(() => { if (lost) { dispose(); opts.onFail("contextlost"); } }, 5000);
}
function onRestored() { lost = false; clearTimeout(lostTimer); fitSig = ""; needFit = true; shadowDirty = true; startLoop(); }

// =========================================================
// 對外介面
// =========================================================
export async function createHub(o) {
  opts = { friends: () => [], onFriend: () => {}, onFail: () => {}, onGacha: () => {}, newbie: () => false, labels: {}, ...o };
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  try {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor(P.deep, 1);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.domElement.addEventListener("webglcontextrestored", onRestored);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0xf4f9ff, 0xe9dcc6, 1.5));
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
    for (const s of SPOTS) SPOT_BUILD[s.id](s, spotGroup(s));
    for (const s of SPOTS) mergeStatic(s.g);
    // 路邊的放置點（裝飾用）
    for (const [x, z] of [[-4.8 + 1.15, 9.0], [4.8 - 1.15, -9.0], [9.0, 4.8 - 1.15], [-9.0, -4.8 + 1.15], [1.15, -8.8], [-8.8, 1.15]]) if (inside(mainPoly, x, z, 0.4)) slot(x, z);
    buildStreet();
    DEFS.forEach(startDef);
    buildTrees(); buildBlobs();
    agentBlob = blobMesh(40, 0.3); agentBlob.count = 0; scene.add(agentBlob);
    refresh();
    renderer.compile(scene, camera);
  } catch (e) { dispose(); throw e; }                 // 任何一步失敗：canvas／浮標都收掉，zhuyin.js 會退回卡片選單
  addEventListener("resize", onResizeEvt); addEventListener("orientationchange", onResizeEvt);
  document.addEventListener("visibilitychange", onVis);
  return api;
}
async function loadRest() {
  if (dead) return;
  try {
    const order = ["fish", "order", "build", "gacha", "hunt", "match", "tone", "whack", "frog"];
    await Promise.all([
      ...order.map((m, i) => buildDef(DEFS.find(d => d.mode === m), BUILDERS[m], i * 90).catch(e => console.warn("[hub3d] 建築載入失敗", m, e))),
      buildSpotsKenney().catch(e => console.warn("[hub3d] 景點載入失敗", e)),
      buildStreetKenney().catch(e => console.warn("[hub3d] 街景載入失敗", e)),
    ]);
    if (dead) return;
    const w = new THREE.Group(); scene.add(w); for (const g of statics) w.attach(g); noDynShadow(w); mergeStatic(w);   // 整座島的靜態物件依材質合併（draw call 再少幾十個）
    built = true; shadowDirty = true; dprCool = performance.now() + 1500;
    spawnCars(); syncPets(); applyDecor();
  } catch (e) { console.warn("[hub3d]", e); }
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
  refreshed = true;
  needFit = true;
}
// 寵物：[{ id, glb, stage(1 寶寶／2 長大／3 超級), name }]；同 id 只換階段不重載
function setPets(list) { petWant = (list || []).slice(0, 30).map(p => ({ ...p, stage: STAGE_SCALE[p.stage] ? p.stage : 2 })); syncPets(); }
// 裝飾：[{ id, glb }]，依序擺到放置點（放不下的先略過）
function setDecor(list) { decorWant = (list || []).slice(); applyDecor(); }
function show() {
  shown = true; user.zoom = 1; user.px = user.py = 0; needFit = true; startLoop();
  if (!restStarted) { restStarted = true; later(() => { if (window.requestIdleCallback) requestIdleCallback(() => loadRest(), { timeout: 400 }); else loadRest(); }, 60); }   // 選單先畫出來，再抓建築模型
  later(playFinger, 900);
}
function hide() { shown = false; stopLoop(); for (const p of ptrs.keys()) ptrs.delete(p); pinch = null; }
function disposeMat(m) { if (!m) return; for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); }
function dispose() {
  if (gateObs) { gateObs.disconnect(); gateObs = null; }
  if (dead) return; dead = true; stopLoop();
  removeEventListener("resize", onResizeEvt); removeEventListener("orientationchange", onResizeEvt);
  document.removeEventListener("visibilitychange", onVis);
  clearTimeout(lostTimer); clearTimeout(resizeT); for (const id of timers) clearTimeout(id); timers.clear();
  if (tagRO) tagRO.disconnect();
  const geos = new Set(), mats = new Set();
  if (scene) scene.traverse(o => { if (o.geometry) geos.add(o.geometry); for (const m of [].concat(o.material || [])) mats.add(m); if (o.userData.mat0) for (const m of [].concat(o.userData.mat0)) mats.add(m); });
  for (const m of [...matCache.values(), ...kitMatCache.values(), ...Object.values(texMats), ...grays, vcMat, glowMat, fenceMat, ...(cardMats || [])]) mats.add(m);
  geos.forEach(g => g.dispose()); mats.forEach(disposeMat);
  for (const g of [...(TREE_GEOS || []), BUSH_GEO]) if (g) g.dispose();
  try { if (renderer) { renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); } } catch (e) {}
  try { stage && stage.remove(); tagLayer && tagLayer.remove(); } catch (e) {}
  if (DEBUG) delete window.__hub3d;
}
const api = { show, hide, refresh, dispose, setPets, setDecor };

// 測試／除錯用（網址有 ?debug 才掛；tools/zy-test/hub3d.js、tools/render3d/render_bg.js）
if (DEBUG) window.__hub3d = {
  get frames() { return frames; }, get running() { return running; }, get fitOk() { return view.fitOk; }, get ready() { return built; },
  get fit() { return { k: view.k, kMax: view.kMax, zoom: user.zoom, dpr }; },
  screenOf(m) { const d = DEFS.find(x => x.mode === m); _v.copy(d.body).applyMatrix4(d.root.matrixWorld).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  hitAt(x, y) { const h = pick(x, y); return h ? (h.pet ? "pet:" + h.pet.id : h.def.mode) : null; },
  tagRect(m) { const r = DEFS.find(x => x.mode === m).tag.getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; },
  petScreen(id) { const p = pets.get(id); if (!p) return null; _v.set(0, PET_H * 0.45 * (STAGE_SCALE[p.stage] || 1), 0).applyMatrix4(p.holder.matrixWorld).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  pets: () => [...pets.keys()],
  locked: () => DEFS.filter(d => d.locked).map(d => d.mode),
  finger: () => !!finger,
  tags(on) { tagLayer.style.visibility = on ? "" : "hidden"; },
  focus(m, z = 1.5) { const d = DEFS.find(x => x.mode === m) || SPOTS.find(x => x.id === m); if (!d) { user.zoom = 1; user.px = user.py = 0; return; } user.zoom = z; _v.set(d.x, 1, d.z).applyMatrix4(camera.matrixWorldInverse); user.px = _v.x - view.cx; user.py = _v.y - view.cy; },
  setPets, setDecor,
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
  stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, pixelRatio: renderer.getPixelRatio() }),
  dispose,
};
