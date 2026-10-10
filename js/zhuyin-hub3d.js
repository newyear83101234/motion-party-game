// ===================== 注音小島 3D 選單（等角小島）=====================
// zhuyin.js 在選單需要時用動態 import() 載入；載入失敗／沒有 WebGL2／逾時 → zhuyin.js 退回原本卡片選單。
// 每棟建築＝一個遊戲：點建築（或上方浮標）＝點那張 .mode-card，解鎖判斷、翻牌選張數都沿用 zhuyin.js 原本的程式。
// 風格：Tack Lin 3D 等角小鎮（色票 docs/zhuyin-3d-plan.md）。素材 Kenney.nl CC0（IMAGE/zy3d/kenney/），樹／積木／氣球／卡牌等程式生成。
// Three.js 0.186.1 自架在 IMAGE/zy3d/vendor/（zhuyin.html 的 importmap）。
// 載入分兩段：①島、路、樹、浮標（不用下載模型）好了就先開選單 ②建築模型背景下載，到了就「長出來」；最後才載朋友。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// ---------- 常數 ----------
const P = { deep: "#3f97c9", grid: "#5fa9d6", shallow: "#7fcfd0", sand: "#ecd7a3", dirt: "#a8673f", dirtDk: "#7d4a2e", grass: "#86c449", grassDk: "#5f9c3a",
  plaza: "#ddd8cf", road: "#bdb8b1", purple: "#8b70cc", purpleDk: "#5e4aa8", cream: "#f0e7d3", eave: "#2f6b50", pink: "#f2808f", autumn: "#f08a3c", wood: "#c98a55" };
const D = 4.4, RING = D / 2, ROAD_W = 0.9;           // 3×3 格（中間是廣場），格距 D；環狀道路在 ±RING
const ISL = { hx: 6.8, hz: 6.8, r: 2.0 };              // 草地：圓角矩形半寬／半深／圓角
const SAND = { pad: 0.6, slope: 0.7 };
const SEA_Y = -0.95;
const WL = { hx: ISL.hx + SAND.pad + SAND.slope * 0.75, hz: ISL.hz + SAND.pad + SAND.slope * 0.75, r: ISL.r + SAND.pad + SAND.slope * 0.75 };   // 水岸線
const KIT = "IMAGE/zy3d/kenney/", MODELS = "IMAGE/zy3d/models/";
const TEX_KITS = new Set(["city-kit-commercial", "fantasy-town-kit", "pirate-kit", "watercraft-pack", "car-kit", "holiday-kit", "food-kit", "cube-pets"]);   // 有 colormap 調色盤的套件
const CAM_EL = 31 * Math.PI / 180;                    // 俯角 31°（計畫 30–35°；低一點畫面不會太高，標題和膠囊之間放得下）
const FPS = 30;                                       // 省電：最多 30 格／秒
const TAP_MOVE = 24, TAP_MS = 800;                    // 5 歲小孩常按久、拖著點：移動 < 24px、按住 < 0.8 秒都算點（寧次 10-10）
const DEBUG = /[?&]debug\b/.test(location.search);
// 八棟建築：格位 (i, j)；鏡頭從 +x+z 方向看，正面朝 +x 或 +z。
// ex＝不種樹的範圍、foot＝施工圍籬半寬；box／anchor／body 是模型載完後的實際大小（區域座標，先寫死：模型還在下載時鏡頭就能擺好、浮標就能點，
// 改了建築要更新這三個數字——網址加 ?debug 後在主控台跑 __hub3d.measure() 會印出新的值）
const DEFS = [
  { mode: "hunt", i: -1, j: -1, ex: [-1.8, 1.8, -1.8, 1.8], foot: [1.5, 1.5] },
  { mode: "match", i: 0, j: -1, ex: [-1.5, 1.5, -1.8, 1.8], foot: [1.2, 1.4] },
  { mode: "tone", i: 1, j: -1, ex: [-1.5, 1.8, -1.6, 1.6], foot: [1.2, 1.2] },
  { mode: "build", i: -1, j: 0, ex: [-1.5, 1.5, -1.6, 1.6], foot: [1.2, 1.45] },
  { mode: "order", i: 1, j: 0, ex: [-1.7, 2.3, -1.5, 1.5], foot: [1.45, 1.2] },
  { mode: "whack", i: -1, j: 1, ex: [-1.7, 1.8, -1.6, 1.6], foot: [1.4, 1.3] },
  { mode: "fish", i: 0, j: 1, ex: [-1.6, 1.6, 1.2, 2.8], foot: [1.2, 1.0] },
  { mode: "frog", i: 1, j: 1, ex: [-1.8, 1.9, -1.6, 1.7], foot: [1.5, 1.3] },
].map(d => ({ ...d, x: d.i * D, z: d.j * D }));
const LAYOUT = {   // [box x0,x1,y0,y1,z0,z1]、[anchor x,y,z]、[body x,y,z]（區域座標）
  hunt: [[-1.55, 1.24, 0.5, 2.32, -1.57, 1.28], [0.27, 1.77, 0.27], [0.27, 0.94, 0.27]],
  match: [[-0.8, 0.8, 0, 3.42, -0.87, 1.44], [0, 3.65, -0.15], [0, 1.0, -0.15]],
  tone: [[-0.97, 1.41, 0, 3.04, -0.87, 1.34], [-0.1, 2.41, 0], [-0.1, 0.87, 0]],
  build: [[-0.7, 1.22, 0, 2.27, -1.18, 1.31], [-0.3, 2.52, 0], [-0.3, 0.91, 0]],
  order: [[-1.58, 2.25, 0, 3.04, -1.21, 1.26], [-0.3, 2.35, 0], [-0.3, 0.84, 0]],
  whack: [[-1.5, 1.88, -0.36, 0.92, -1.38, 1.3], [0, 0.32, 0], [0, 0.1, 0]],
  fish: [[-1.84, 1.99, -1.09, 1.27, 1.57, 6.64], [1.45, 0.57, 4.3], [1.45, -0.49, 4.3]],
  frog: [[-1.87, 1.93, -0.16, 0.5, -1.74, 1.52], [0.07, 0.29, 0.02], [0.07, 0.03, 0.02]],
};
// 朋友 → 模型：models.json 有列 <名字>.glb（自製：加了微笑腮紅）就用它，沒有才用 Kenney Cube Pets 原檔；小熊／青蛙沒有 Kenney 版
const PET_NAME = { cust_cat: "cat", cust_fox: "fox", cust_lion: "lion", cust_panda: "panda", cust_penguin: "penguin", cust_rabbit: "bunny", cust_bear: "bear", cust_frog: "frog" };
const PET_KENNEY = { cat: "animal-cat", fox: "animal-fox", lion: "animal-lion", panda: "animal-panda", penguin: "animal-penguin", bunny: "animal-bunny" };
const PET_H = 1.38;                                   // 朋友身高（世界單位；寧次 10-10：放大約 1.8 倍才看得到臉）

// ---------- 狀態 ----------
let renderer, scene, camera, sun, stage, tagLayer, finger, opts;
let running = false, raf = 0, shown = false, frames = 0, needFit = true, lastMs = 0, lastDraw = 0, dead = false, lost = false, lostTimer = 0, fitSig = "", built = false;
const tickers = [];                                   // 每幀持續動畫 (t, dt)
const anims = new Set();                              // 一次性動畫 { update(now) → false 結束 }
const view = { k: 40, cx: 0, cy: 0 };                 // 擺好的鏡頭：每單位幾 px、視角中心
const user = { zoom: 1, px: 0, py: 0 };               // 小孩拖曳／縮放
const hitBoxes = [], petHits = [];
const pets = new Map();                               // 朋友 id → 走路的動物
const timers = new Set();
let tapLockUntil = 0, hopCycle = -1, fingerDone = false;
const _v = new THREE.Vector3(), _c = new THREE.Color();
const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };

// ---------- 小工具 ----------
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function paint(geo, hex) {
  _c.set(hex); const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return geo;
}
function rrShape(hx, hz, r) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz); s.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hx, hz - r); s.absarc(hx - r, hz - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hx + r, hz); s.absarc(-hx + r, hz - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hx, -hz + r); s.absarc(-hx + r, -hz + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
function sdRoundBox(x, z, hx, hz, r) { const qx = Math.abs(x) - hx + r, qz = Math.abs(z) - hz + r; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r; }
const matCache = new Map();
function mat(hex, extra) {                             // 平塗 Lambert（同色共用）
  const k = hex + (extra ? JSON.stringify(extra) : "");
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color: hex, ...extra }));
  return matCache.get(k);
}
const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
// shadow：會不會投影（貼地的小東西不投影，省陰影 draw call）；dyn：會動的東西（不能被合併）
function mesh(geo, m, { x = 0, y = 0, z = 0, ry = 0, shadow = true, dyn = false, parent } = {}) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = shadow; o.receiveShadow = true; if (dyn) o.userData.dyn = true; if (parent) parent.add(o); return o;
}
// 往下長的圓角板：頂面在 top，厚 depth
function slab({ hx, hz, r, top, depth, color, bevelT = 0, bevelS = 0, inset = true, seg = 3, x = 0, z = 0 }) {
  const geo = new THREE.ExtrudeGeometry(rrShape(hx, hz, r), { depth, curveSegments: 18, bevelEnabled: bevelT > 0, bevelThickness: bevelT, bevelSize: bevelS, bevelOffset: inset ? -bevelS : 0, bevelSegments: seg });
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
function prepMaterials(obj, kit, tints) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    const src = o.material;
    o.material = src && src.map && kitImg[kit] ? kitMaterial(kit, tints) : mat("#" + (src && src.color ? src.color.getHexString() : "ffffff"));
    o.castShadow = o.receiveShadow = true;
  });
}
async function kenney(kit, name, { tints = [], scale = 1, x = 0, y = 0, z = 0, ry = 0, parent = scene, shadow = true } = {}) {
  const [g] = await Promise.all([loadGLB(`${KIT}${kit}/${name}.glb`), TEX_KITS.has(kit) ? kitImage(kit) : null]);
  const obj = g.scene.clone(true);
  prepMaterials(obj, kit, tints);
  if (!shadow) obj.traverse(o => { o.castShadow = false; });
  obj.scale.setScalar(scale); obj.position.set(x, y, z); obj.rotation.y = ry;
  obj.userData.clips = g.animations;
  if (parent) parent.add(obj);
  return obj;
}

// ---------- 程式生成小物 ----------
function blob(r, x, y, z, hex, detail = 1) { const g = new THREE.IcosahedronGeometry(r, detail); g.translate(x, y, z); return paint(g, hex); }
function trunk(h) { const g = new THREE.CylinderGeometry(0.06, 0.095, h, 7).toNonIndexed(); g.translate(0, h / 2, 0); return paint(g, "#9a6a48"); }
let TREE_GEOS, BUSH_GEO;
function makeGeos() {
  TREE_GEOS = [
    mergeGeometries([trunk(0.55), blob(0.46, 0, 0.95, 0, "#7cc25a"), blob(0.32, 0.22, 1.24, 0.1, "#93d06c"), blob(0.3, -0.2, 1.15, -0.12, "#6ab24f")]),
    mergeGeometries([trunk(0.5), blob(0.42, 0, 0.86, 0, "#5f9c3a"), blob(0.33, 0.02, 1.26, 0.02, "#74b347"), blob(0.21, 0, 1.56, 0, "#86c449")]),
    mergeGeometries([trunk(0.5), blob(0.44, 0, 0.9, 0, P.autumn), blob(0.3, 0.2, 1.17, 0.07, "#f7a257"), blob(0.28, -0.18, 1.1, -0.1, "#e57a2c")]),
    mergeGeometries([trunk(0.35), paint(new THREE.ConeGeometry(0.42, 0.75, 7).translate(0, 0.72, 0).toNonIndexed(), "#4f8f3a"), paint(new THREE.ConeGeometry(0.32, 0.6, 7).translate(0, 1.1, 0).toNonIndexed(), "#5fa346")]),
  ];
  BUSH_GEO = mergeGeometries([blob(0.22, 0, 0.17, 0, "#6cb455"), blob(0.17, 0.19, 0.13, 0.05, "#80c463"), blob(0.15, -0.17, 0.12, -0.05, "#5aa64a")]);
}
function addTree(x, z, v, s = 1, parent = scene, y = 0) { const t = mesh(TREE_GEOS[v], vcMat, { x, y, z, ry: (x * 7 + z * 3) % 6.28, parent }); t.scale.setScalar(s); return t; }
const FLOWER_COLORS = ["#ff8fb1", "#ffffff", "#ffd75e", "#ff6f7d", "#c9a2ff"];
// 條紋布（遮雨棚、施工圍籬）
function stripeTex(a, b, n = 6, diag = false) {
  const t = canvasTex(128, 64, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b;
    for (let i = 0; i < n * 2; i++) if (i % 2) { if (diag) { g.beginPath(); const s = w / n / 2; g.moveTo(i * s - h, h); g.lineTo(i * s, 0); g.lineTo(i * s + s, 0); g.lineTo(i * s + s - h, h); g.fill(); } else g.fillRect(i * w / n / 2, 0, w / n / 2, h); } });
  t.wrapS = THREE.RepeatWrapping; return t;
}

// =========================================================
// 小島本體：草地 → 土壁（兩層）→ 沙灘 → 淺水 → 深水＋格線；道路；樹（第一段，不用下載）
// =========================================================
let seaU;
function buildIsland() {
  const g = new THREE.Group(); scene.add(g);
  g.add(slab({ hx: ISL.hx, hz: ISL.hz, r: ISL.r, top: 0, depth: 0.12, color: P.grass, bevelT: 0.05, bevelS: 0.05 }));
  const dirt = slab({ hx: ISL.hx - 0.04, hz: ISL.hz - 0.04, r: ISL.r - 0.04, top: -0.1, depth: 0.34, color: P.dirt }); dirt.castShadow = true; g.add(dirt);
  g.add(slab({ hx: ISL.hx - 0.06, hz: ISL.hz - 0.06, r: ISL.r - 0.06, top: -0.44, depth: 0.6, color: P.dirtDk }));
  g.add(slab({ hx: ISL.hx + SAND.pad, hz: ISL.hz + SAND.pad, r: ISL.r + SAND.pad, top: -0.66, depth: 0.7, color: P.sand, bevelT: 0.3, bevelS: SAND.slope, inset: false, seg: 4 }));
  seaU = { uTime: { value: 0 }, uDeep: { value: new THREE.Color(P.deep) }, uShallow: { value: new THREE.Color(P.shallow) }, uGrid: { value: new THREE.Color("#7cbde3") }, uHalf: { value: new THREE.Vector2(WL.hx, WL.hz) }, uR: { value: WL.r } };
  const seaMat = new THREE.ShaderMaterial({
    uniforms: seaU, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uGrid; uniform vec2 uHalf; uniform float uR;
      varying vec3 vW;
      float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 p = vW.xz;
        float d = sdRB(p, uHalf, uR);
        float shallow = 1.0 - smoothstep(0.0, 2.6, d);
        vec3 col = mix(uDeep, uShallow, shallow);
        // 深水格線（每 2 格一條）
        vec2 gp = p * 0.5; vec2 f = abs(fract(gp + 0.5) - 0.5); vec2 fw = fwidth(gp) * 1.2;
        float line = 1.0 - min(smoothstep(0.0, fw.x, f.x), smoothstep(0.0, fw.y, f.y));
        col = mix(col, uGrid, line * 0.9 * (1.0 - shallow));
        // 水面亮點（斜斜的短白線，緩慢閃）
        vec2 cp = p / 4.0 + vec2(uTime * 0.02, 0.0); vec2 id = floor(cp); vec2 fc = fract(cp) - 0.5;
        float h = hash(id); vec2 o = vec2(h - 0.5, fract(h * 7.31) - 0.5) * 0.5;
        vec2 e = fc - o; e = vec2(e.x + e.y, e.y - e.x) * vec2(1.0, 4.0);
        float spark = smoothstep(0.1, 0.06, length(e)) * step(0.5, h) * (0.55 + 0.45 * sin(uTime * 0.9 + h * 30.0));
        col = mix(col, vec3(1.0), spark * 0.35 * (1.0 - shallow));
        // 浪花：沿岸白邊＋外圈一道淡白線
        float w1 = 0.14 + 0.06 * sin(uTime * 1.3 + p.x * 0.8 + p.y * 0.6);
        float foam = smoothstep(w1 + 0.1, w1, d) * smoothstep(-0.25, -0.05, d);
        float d2 = d - (0.7 + 0.16 * sin(uTime * 0.9 + p.x * 0.5 - p.y * 0.4));
        float foam2 = (1.0 - smoothstep(0.0, 0.07, abs(d2))) * 0.5;
        col = mix(col, vec3(1.0), clamp(foam * 0.9 + foam2, 0.0, 1.0));
        float a = mix(1.0, 0.7, shallow); a = max(a, foam * 0.9);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.y = SEA_Y; scene.add(sea);
  // 尋寶公園那格：墊高一層台地（分層感）
  const px = -D, pz = -D, PH = 0.55, PS = 1.72;
  g.add(slab({ hx: PS, hz: PS, r: 0.45, top: PH, depth: 0.1, color: P.grass, bevelT: 0.04, bevelS: 0.04, x: px, z: pz }));
  const wall = slab({ hx: PS - 0.03, hz: PS - 0.03, r: 0.42, top: PH - 0.08, depth: PH - 0.06, color: P.dirt, x: px, z: pz }); wall.castShadow = true; g.add(wall);
  // 道路：井字（環繞中央廣場、延伸到海邊）＋中央廣場石板
  const roadTop = mat("#d9d3ca"), roadEdge = mat(P.road);
  const rect = (x0, z0, x1, z1, top) => {
    const w = x1 - x0, d = z1 - z0;
    mesh(new THREE.BoxGeometry(w + 0.1, top - 0.012, d + 0.1), roadEdge, { x: (x0 + x1) / 2, y: (top - 0.012) / 2, z: (z0 + z1) / 2, shadow: false, parent: g });
    mesh(new THREE.BoxGeometry(w, 0.012, d), roadTop, { x: (x0 + x1) / 2, y: top - 0.006, z: (z0 + z1) / 2, shadow: false, parent: g });
  };
  for (const c of [-RING, RING]) { rect(c - ROAD_W / 2, -ISL.hz + 0.3, c + ROAD_W / 2, ISL.hz - 0.3, 0.045); rect(-ISL.hx + 0.3, c - ROAD_W / 2, ISL.hx - 0.3, c + ROAD_W / 2, 0.044); }
  mesh(new THREE.BoxGeometry(2 * RING - ROAD_W - 0.1, 0.03, 2 * RING - ROAD_W - 0.1), mat(P.plaza), { y: 0.015, shadow: false, parent: g });
  mergeStatic(g);
  // 道路中線：黃色虛線（路口不畫）
  const dashes = [];
  for (const c of [-RING, RING]) for (let u = -ISL.hz + 0.6; u < ISL.hz - 0.5; u += 0.62) {
    if (Math.abs(Math.abs(u + 0.16) - RING) < 0.6) continue;
    dashes.push([c, u + 0.16, 0], [u + 0.16, c, 1]);
  }
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.01, 0.3), mat("#f3c94f"), dashes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), one = new THREE.Vector3(1, 1, 1);
  dashes.forEach(([x, z, r], k) => { m4.compose(new THREE.Vector3(x, 0.05, z), r ? rotY : q, one); dash.setMatrixAt(k, m4); });
  dash.receiveShadow = true; scene.add(dash);
}
const LAMPS = [[-1.45, -1.45], [1.45, -1.45], [-1.45, 1.45], [1.45, 1.45], [RING + 0.68, ISL.hz - 1.2], [-RING - 0.68, ISL.hz - 1.2], [ISL.hx - 1.2, RING + 0.68], [ISL.hx - 1.2, -RING - 0.68]];
function buildTrees() {
  // 樹：沿海邊與空地隨機散布（固定種子＝每次長一樣）；全部用 InstancedMesh（少很多 draw call）
  const rand = rng(7), placed = [], inst = [[], [], [], [], []], spots = [];
  const patch = (x, z, n, s, y = 0) => { for (let k = 0; k < n; k++) spots.push([x + (rand() - 0.5) * s * 2, y, z + (rand() - 0.5) * s * 2]); };
  const blocked = (x, z) => {
    if (Math.abs(x) < RING + 0.75 && Math.abs(z) < RING + 0.75) return true;           // 廣場＋環路
    if (Math.abs(Math.abs(x) - RING) < 0.75 || Math.abs(Math.abs(z) - RING) < 0.75) return true;   // 井字路
    for (const d of DEFS) if (x > d.x + d.ex[0] && x < d.x + d.ex[1] && z > d.z + d.ex[2] && z < d.z + d.ex[3]) return true;
    for (const [lx, lz] of LAMPS) if (Math.hypot(x - lx, z - lz) < 0.6) return true;
    return false;
  };
  for (let x = -ISL.hx; x <= ISL.hx; x += 0.5) for (let z = -ISL.hz; z <= ISL.hz; z += 0.5) {
    const jx = x + (rand() - 0.5) * 0.35, jz = z + (rand() - 0.5) * 0.35, sd = sdRoundBox(jx, jz, ISL.hx, ISL.hz, ISL.r);
    if (sd > -0.4 || blocked(jx, jz) || placed.some(([a, b]) => Math.hypot(a - jx, b - jz) < 0.78)) continue;
    const coast = sd > -1.7, r = rand();
    if (r < (coast ? 0.8 : 0.3)) { placed.push([jx, jz]); const v = rand(); inst[v < 0.5 ? 0 : v < 0.7 ? 1 : v < 0.88 ? 2 : 3].push([jx, jz, 0.85 + rand() * 0.3, rand() * 6.28]); }
    else if (r < (coast ? 0.85 : 0.4)) { placed.push([jx, jz]); inst[4].push([jx, jz, 0.8 + rand() * 0.4, rand() * 6.28]); }
    else if (r < 0.5) patch(jx, jz, 4, 0.2);
  }
  const q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0), mt = new THREE.Matrix4(), sc = new THREE.Vector3();
  inst.forEach((list, v) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(v < 4 ? TREE_GEOS[v] : BUSH_GEO, vcMat, list.length);
    list.forEach(([x, z, s, r], k) => { mt.compose(_v.set(x, 0, z), q.setFromAxisAngle(yAxis, r), sc.set(s, s, s)); im.setMatrixAt(k, mt); });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  });
  // 花（廣場四角、尋寶台地上）
  patch(-1.4, -0.6, 5, 0.18); patch(1.4, 0.6, 5, 0.18); patch(0.6, -1.4, 5, 0.18); patch(-0.6, 1.4, 5, 0.18);
  patch(-D - 1.2, -D + 1.2, 6, 0.25, 0.55); patch(-D + 1.2, -D - 0.3, 5, 0.2, 0.55);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshLambertMaterial(), spots.length);
  spots.forEach(([x, y, z], k) => { mt.makeTranslation(x, y + 0.07 + rand() * 0.04, z); flowers.setMatrixAt(k, mt); flowers.setColorAt(k, _c.set(FLOWER_COLORS[k % FLOWER_COLORS.length])); });
  flowers.castShadow = false; scene.add(flowers);
}

// =========================================================
// 建築
// =========================================================
// 第一段：每棟先放空的群組＋點擊判定盒＋施工圍籬（模型還沒到也點得到）
let fenceMat, postMat;
function startDef(d) {
  const root = new THREE.Group(); root.position.set(d.x, 0, d.z); root.userData.def = d; scene.add(root);
  const pivot = new THREE.Group(); root.add(pivot);
  d.root = root; d.pivot = pivot; d.lockDeco = new THREE.Group(); d.lockDeco.visible = false; root.add(d.lockDeco);
  const [b, a, body] = LAYOUT[d.mode];
  d.box = new THREE.Box3(new THREE.Vector3(b[0], b[2], b[4]), new THREE.Vector3(b[1], b[3], b[5])).translate(root.position);
  d.anchor = new THREE.Vector3(...a).add(root.position);
  d.body = new THREE.Vector3(...body);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(b[1] - b[0] + 0.2, b[3] - b[2] + 0.2, b[5] - b[4] + 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2); hit.userData.def = d; root.add(hit); hitBoxes.push(hit); d.hit = hit;
  // 施工圍籬：橘白斜條紋板（共用材質，條紋密度改 UV）＋柱子，圍在鏡頭看得到的兩面（+x、+z）
  const [fx, fz] = d.foot, g = d.lockDeco;
  const board = w => { const geo = new THREE.BoxGeometry(w, 0.2, 0.05), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * w / 1.1); return geo; };
  const barrier = (x, z, ry, w) => {
    const bg = new THREE.Group(); bg.position.set(x, 0, z); bg.rotation.y = ry; g.add(bg);
    const geo = board(w);
    mesh(geo, fenceMat, { y: 0.42, parent: bg }); mesh(geo, fenceMat, { y: 0.16, parent: bg });
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.07, 0.6, 0.07), postMat, { x: s * (w / 2 - 0.06), y: 0.3, parent: bg });
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
  scene.updateMatrixWorld(true); d.anchorBox = new THREE.Box3().setFromObject(a);   // 給 __hub3d.measure() 用（合併前量）
  const [fx, fz] = d.foot;
  await Promise.all([[fx + 0.25, fz + 0.25], [fx + 0.25, -fz * 0.95], [-fx * 0.95, fz + 0.25]].map(([x, z]) => kenney("car-kit", "cone", { scale: 0.75, x, z, parent: d.lockDeco })));
  d.lockDeco.traverse(o => { if (o.isMesh) o.userData.keepColor = true; });
  mergeStatic(d.lockDeco); mergeStatic(p);
  if (d.locked) setGray(p, true);
  d.ready = true;
  if (shown && running) {                              // 選單開著才播「長出來」，不然直接出現
    p.scale.setScalar(0.001); const t0 = performance.now() + delay;
    anims.add({ update(now) { const u = Math.max(0, Math.min(1, (now - t0) / 480)); p.scale.setScalar(Math.max(0.001, easeOutBack(u))); return u < 1; } });
  }
}

// ----- 釣魚：碼頭＋漁船＋小划船 -----
async function buildFish(d, p) {
  const coast = ISL.hz - d.z;                          // 草地邊（區域座標）
  const DS = 0.68, DECK = -0.2;
  const [, , boat, row] = await Promise.all([
    kenney("pirate-kit", "structure-platform-dock", { parent: p, scale: DS, x: 0, z: coast + 0.42, y: DECK - 1.31 * DS }),
    kenney("pirate-kit", "structure-platform-dock", { parent: p, scale: DS, x: 0, z: coast + 0.42 + 1.7, y: DECK - 1.31 * DS }),
    kenney("watercraft-pack", "boat-fishing-small", { parent: p, scale: 0.52, x: 1.45, z: coast + 1.9, y: SEA_Y - 0.08, ry: 0.08 }),
    kenney("pirate-kit", "boat-row-small", { parent: p, scale: 0.36, x: -1.35, z: coast + 1.55, y: SEA_Y - 0.1, ry: 0.5 }),
    kenney("pirate-kit", "barrel", { parent: p, scale: 0.2, x: -0.5, z: coast + 0.15, y: DECK }),
    kenney("pirate-kit", "barrel", { parent: p, scale: 0.17, x: -0.48, z: coast + 0.48, y: DECK }),
    kenney("pirate-kit", "crate", { parent: p, scale: 0.3, x: 0.45, z: coast + 0.25, y: DECK, ry: 0.3 }),
  ]);
  boat.userData.dyn = row.userData.dyn = true;
  tickers.push(t => { boat.position.y = SEA_Y - 0.08 + Math.sin(t * 1.4) * 0.03; boat.rotation.z = Math.sin(t * 1.1) * 0.035; row.position.y = SEA_Y - 0.1 + Math.sin(t * 1.7 + 1) * 0.03; row.rotation.x = Math.sin(t * 1.3) * 0.04; });
  // 釣竿＋浮標
  const endZ = coast + 0.42 + 2.5;
  const rod = mesh(new THREE.CylinderGeometry(0.016, 0.026, 1.4, 6), mat("#8a5a3c"), { x: 0.35, y: DECK + 0.5, z: endZ, parent: p });
  rod.rotation.x = 0.95;
  const bob = mesh(new THREE.SphereGeometry(0.07, 12, 8), mat("#ff5d6c"), { x: 0.35, y: SEA_Y + 0.03, z: endZ + 1.25, shadow: false, dyn: true, parent: p });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.35, DECK + 1.08, endZ + 0.55), bob.position.clone()]);
  p.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: "#ffffff" })));
  tickers.push(t => { bob.position.y = SEA_Y + 0.03 + Math.sin(t * 2.6) * 0.035; lineGeo.attributes.position.setY(1, bob.position.y); lineGeo.attributes.position.needsUpdate = true; });
  // 碼頭入口的魚招牌
  const sign = new THREE.Group(); sign.position.set(-0.9, 0, coast - 0.55); sign.rotation.y = Math.PI / 4; p.add(sign);
  mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.95, 6), mat(P.wood), { y: 0.47, parent: sign });
  const fish = mesh(new THREE.SphereGeometry(0.3, 16, 10), mat("#ff9b54"), { y: 1.05, parent: sign }); fish.scale.set(1.25, 0.75, 0.4);
  const tail = mesh(new THREE.ConeGeometry(0.2, 0.3, 3), mat("#ff9b54"), { x: -0.45, y: 1.05, parent: sign }); tail.rotation.z = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.05, 8, 6), mat("#ffffff"), { x: 0.2, y: 1.11, z: 0.11, shadow: false, parent: sign });
  mesh(new THREE.SphereGeometry(0.028, 8, 6), mat("#24324a"), { x: 0.22, y: 1.11, z: 0.15, shadow: false, parent: sign });
  return boat;
}

// ----- 點餐：紫色小餐館＋粉紅條紋棚＋屋頂大漢堡 -----
async function buildOrder(d, p) {
  const [shop, burger] = await Promise.all([
    kenney("city-kit-commercial", "building-c", { parent: p, scale: 2.35, x: -0.3, ry: Math.PI / 2, tints: [[3, 2, P.purple], [0, 2, P.cream], [1, 2, P.purpleDk], [1, 3, P.eave]] }),
    kenney("food-kit", "burger", { parent: p, scale: 3.3, x: -0.3, y: 2.12 }),
    kenney("city-kit-commercial", "detail-parasol-a", { parent: p, scale: 2.3, x: 1.85, z: -0.75, tints: [[0, 1, "#ffd36b"]] }),
    kenney("city-kit-commercial", "detail-parasol-b", { parent: p, scale: 2.3, x: 1.85, z: 0.8, tints: [[0, 1, P.pink]] }),
  ]);
  // 條紋遮雨棚（正面 +x）
  const aw = stripeTex("#ffffff", P.pink, 6); aw.repeat.set(2, 1);
  const awn = mesh(new THREE.BoxGeometry(0.55, 0.04, 2.3), new THREE.MeshLambertMaterial({ map: aw }), { x: 1.13, y: 0.95, parent: p });
  awn.rotation.z = -0.38;
  mesh(new THREE.BoxGeometry(0.03, 0.14, 2.3), mat(P.pink), { x: 1.38, y: 0.83, parent: p });
  // 屋頂大漢堡（慢慢轉）
  burger.userData.dyn = true;
  tickers.push(t => { burger.rotation.y = t * 0.6; burger.position.y = 2.12 + Math.sin(t * 2) * 0.04; });
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
    const b = mesh(cube, mat(col), { y: row * (S + G) + S / 2, z: zi * (S + G), parent: house });
    const tm = new THREE.MeshLambertMaterial({ map: letterTex(ch, col), transparent: true });
    const f1 = mesh(decal, tm, { x: S / 2 + 0.006, shadow: false, parent: b }); f1.rotation.y = Math.PI / 2;
    if (zi === 1 || (row === 1 && zi === 0.5)) mesh(decal, tm, { z: S / 2 + 0.006, shadow: false, parent: b });
  }
  // 三角屋頂
  const tri = new THREE.Shape(); tri.moveTo(-0.72, 0); tri.lineTo(0.72, 0); tri.lineTo(0, 0.62); tri.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: S * 0.95, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  roofGeo.translate(0, 0, -S * 0.475); roofGeo.rotateY(Math.PI / 2);
  mesh(roofGeo, mat(P.autumn), { y: 2 * (S + G), parent: house });
  // 散落的積木
  const loose = [[new RoundedBoxGeometry(0.42, 0.42, 0.42, 2, 0.06), "#ff7a7a", 0.85, 0.21, 1.05, 0.4], [new THREE.CylinderGeometry(0.17, 0.17, 0.5, 14), "#ffc233", 1.05, 0.25, 0.45, 0],
    [new RoundedBoxGeometry(0.36, 0.36, 0.36, 2, 0.05), "#4fb0ff", 0.65, 0.18, -0.95, -0.3], [new THREE.ConeGeometry(0.22, 0.36, 4), "#7ccf6b", 0.65, 0.54, -0.95, 0.5]];
  for (const [g, c, x, y, z, r] of loose) mesh(g, mat(c), { x, y, z, ry: r, parent: p });
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
  addTree(-1.15, 0.55, 2, 0.9, p, Y); addTree(0.75, -1.1, 0, 0.85, p, Y);
  const clip = (chest.userData.clips || []).find(c => c.name === "open");
  if (clip) { const mx = new THREE.AnimationMixer(chest); const a = mx.clipAction(clip); a.clampWhenFinished = true; a.setLoop(THREE.LoopOnce, 1); a.play(); mx.setTime(clip.duration); }
  // 寶箱裡的金光＋閃閃
  mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), mat("#ffd84a", { emissive: "#ffb800", emissiveIntensity: 0.6 }), { x: 0.35, y: Y + 0.27, z: 0.35, ry: Math.PI / 4, shadow: false, parent: p });
  const sparkMat = new THREE.MeshBasicMaterial({ color: "#fff3a0", toneMapped: false });
  for (let k = 0; k < 4; k++) {
    const s = mesh(new THREE.OctahedronGeometry(0.06, 0), sparkMat, { parent: p, shadow: false, dyn: true }); const ph = k * 1.6;
    tickers.push(t => { const a = t * 1.5 + ph; s.position.set(0.35 + Math.cos(a) * 0.38, Y + 0.6 + Math.sin(t * 2 + ph) * 0.12, 0.35 + Math.sin(a) * 0.38); s.rotation.y = t * 3; s.scale.setScalar(0.7 + 0.35 * Math.sin(t * 4 + ph)); });
  }
  // 地上的紅色 X
  for (const r of [Math.PI / 4, -Math.PI / 4]) mesh(new THREE.BoxGeometry(0.55, 0.02, 0.1), mat("#ff5b5b"), { x: -0.3, y: Y + 0.012, z: 1.05, ry: r, shadow: false, parent: p });
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
  mesh(new RoundedBoxGeometry(0.8, 1.12, 0.05, 2, 0.02), mat("#ffffff"), { parent: c });
  const plane = new THREE.PlaneGeometry(0.78, 1.1);
  mesh(plane, cardMats[0], { z: 0.027, shadow: false, parent: c });
  const back = mesh(plane, cardMats[1], { z: -0.027, shadow: false, parent: c }); back.rotation.y = Math.PI;
  c.scale.setScalar(scale); return c;
}
async function buildMatch(d, p) {
  const house = await kenney("city-kit-commercial", "building-d", { parent: p, scale: 1.6, z: -0.15, tints: [[0, 2, P.cream], [3, 2, "#e4d5b7"], [1, 2, P.eave], [1, 3, P.eave]] });
  const hb = new THREE.Box3().setFromObject(house), roofY = hb.max.y, front = hb.max.z - d.z;   // Box3 是世界座標 → 換成這棟的區域座標
  // 屋頂大撲克牌：站在屋頂、慢慢轉（正反面輪流出現＝翻牌）
  const big = makeCard(1.15); big.userData.dyn = true; p.add(big);
  const cy = roofY + 0.05 + 0.56 * 1.15; big.position.set(0, cy, -0.15);
  tickers.push(t => { big.rotation.y = Math.PI / 4 + t * 0.6; big.position.set(0, cy + Math.sin(t * 2) * 0.04, -0.15); });
  // 深綠條紋遮雨棚＋窗台花箱（參考圖的奶油色店面）
  const aw = mesh(new THREE.BoxGeometry(hb.max.x - hb.min.x - 0.1, 0.04, 0.48), new THREE.MeshLambertMaterial({ map: stripeTex("#ffffff", P.eave, 7) }), { y: 0.78, z: front + 0.2, parent: p });
  aw.rotation.x = 0.4;
  mesh(new THREE.BoxGeometry(hb.max.x - hb.min.x - 0.1, 0.12, 0.03), mat(P.eave), { y: 0.64, z: front + 0.42, parent: p });
  for (const x of [-0.4, 0.4]) { mesh(new THREE.BoxGeometry(0.38, 0.1, 0.14), mat(P.wood), { x, y: 1.18, z: front + 0.06, parent: p }); for (const dx of [-0.11, 0, 0.11]) mesh(new THREE.IcosahedronGeometry(0.07, 0), mat(dx ? "#ff8fb1" : "#ffd75e"), { x: x + dx, y: 1.27, z: front + 0.07, shadow: false, parent: p }); }
  // 門口立著一對一樣的牌（配對的意思）
  for (const [x, r] of [[-0.55, 0.12], [0.55, -0.12]]) { const c = makeCard(0.62); c.position.set(x, 0.36, 1.35); c.rotation.set(-0.12, r, 0); p.add(c); }
  return big;
}

// ----- 氣球：粉紅條紋攤＋一大串氣球 -----
async function buildTone(d, p) {
  const stall = await kenney("fantasy-town-kit", "stall-red", { parent: p, scale: 1.75, x: -0.1, ry: Math.PI / 2, tints: [[0, 3, P.pink], [3, 1, P.pink]] });
  const BCOL = ["#ff6f86", "#ffd166", "#5fb4ff", "#7fd77a", "#c79bff", "#ff9fd0", "#ff8a3d"];
  const bGeo = new THREE.SphereGeometry(0.24, 16, 12); bGeo.scale(1, 1.18, 1);
  const knot = new THREE.ConeGeometry(0.05, 0.08, 6);
  const cluster = new THREE.Group(); cluster.position.set(0.95, 1.05, 0.75); cluster.userData.dyn = true; p.add(cluster);
  const pts = [];
  BCOL.forEach((c, k) => {
    const a = k / BCOL.length * Math.PI * 2, ring = k === 0 ? 0 : 0.36;
    const pos = new THREE.Vector3(Math.cos(a) * ring, 1.25 + (k % 3) * 0.2 + (k === 0 ? 0.35 : 0), Math.sin(a) * ring);
    const m = mat(c, { emissive: c, emissiveIntensity: 0.12 });
    const b = mesh(bGeo, m, { parent: cluster }); b.position.copy(pos);
    const kn = mesh(knot, m, { parent: cluster, shadow: false }); kn.position.copy(pos).add(new THREE.Vector3(0, -0.3, 0)); kn.rotation.x = Math.PI;
    pts.push(new THREE.Vector3(0, 0, 0), pos.clone().add(new THREE.Vector3(0, -0.32, 0)));
  });
  cluster.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#ffffff" })));
  tickers.push(t => { cluster.rotation.z = Math.sin(t * 1.3) * 0.06; cluster.rotation.x = Math.sin(t * 0.9 + 1) * 0.05; });
  // 飄走的一顆
  const lone = mesh(bGeo, mat("#ff6f86", { emissive: "#ff6f86", emissiveIntensity: 0.12 }), { parent: p, dyn: true }); lone.scale.setScalar(0.8);
  tickers.push(t => { const ph = (t * 0.12) % 1; lone.position.set(-0.6 + Math.sin(t) * 0.15, 2.2 + ph * 2.2, 0.9 - ph * 0.6); lone.visible = ph < 0.92; });
  return stall;
}

// ----- 地鼠：菜園＋地洞＋偶爾探頭的地鼠 -----
async function buildWhack(d, p) {
  const soil = slab({ hx: 1.45, hz: 1.3, r: 0.35, top: 0.07, depth: 0.12, color: "#8a5a3c" }); p.add(soil);
  const crops = [["crop_carrot", -0.55, -0.85], ["crop_carrot", -0.55, -0.3], ["crop_turnip", 0.15, -0.85], ["crop_turnip", 0.15, -0.3], ["crop_carrot", 0.85, -0.85], ["crop_pumpkin", 0.85, -0.3]];
  await Promise.all([
    ...[-0.55, 0.15, 0.85].map(x => kenney("nature-kit", "crops_dirtRow", { parent: p, scale: 1.25, x, y: 0.07, z: -0.55, ry: Math.PI / 2, shadow: false })),
    ...crops.map(([n, x, z]) => kenney("nature-kit", n, { parent: p, scale: 1.0, x, y: 0.08, z })),
    ...[0, 1, 2].map(k => kenney("nature-kit", "fence_simple", { parent: p, scale: 1, x: -1.0 + k, z: -0.88 })),
  ]);
  // 地洞：土堆圈＋黑洞
  const HOLES = [[-0.75, 0.6], [0.05, 0.75], [0.85, 0.5]];
  const ringGeo = new THREE.TorusGeometry(0.27, 0.09, 8, 20); ringGeo.rotateX(-Math.PI / 2); ringGeo.scale(1, 0.7, 1);
  const pitGeo = new THREE.CircleGeometry(0.27, 20); pitGeo.rotateX(-Math.PI / 2);
  for (const [x, z] of HOLES) { mesh(ringGeo, mat("#a06d47"), { x, y: 0.09, z, shadow: false, parent: p }); mesh(pitGeo, mat("#3a2418"), { x, y: 0.085, z, shadow: false, parent: p }); }
  // 探頭地鼠（程式生成，之後換 D2 自製模型）
  const mole = new THREE.Group(); mole.userData.dyn = true; p.add(mole);
  const fur = mat("#9b6a45");
  mesh(new THREE.SphereGeometry(0.2, 14, 10), fur, { y: 0.12, parent: mole }).scale.set(1, 1.15, 1);
  mesh(new THREE.SphereGeometry(0.06, 10, 8), mat("#ff8fa3"), { y: 0.18, z: 0.19, shadow: false, parent: mole });
  for (const s of [-1, 1]) { mesh(new THREE.SphereGeometry(0.035, 8, 6), mat("#24324a"), { x: s * 0.08, y: 0.27, z: 0.16, shadow: false, parent: mole }); mesh(new THREE.SphereGeometry(0.06, 8, 6), fur, { x: s * 0.14, y: 0.33, z: 0.0, shadow: false, parent: mole }); }
  tickers.push(t => { const c = t % 3.2, hole = Math.floor(t / 3.2) % HOLES.length;
    const up = c < 0.3 ? c / 0.3 : c < 1.6 ? 1 : c < 1.9 ? 1 - (c - 1.6) / 0.3 : 0;
    mole.position.set(HOLES[hole][0], -0.25 + up * 0.32, HOLES[hole][1]); mole.rotation.y = Math.PI / 4 + Math.sin(t * 3) * 0.2 * up; mole.visible = up > 0.01; });
  // 木槌靠在菜園邊
  const mallet = new THREE.Group(); mallet.position.set(1.45, 0, 1.05); mallet.rotation.set(0, Math.PI / 4, -0.35); p.add(mallet);
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6), mat(P.wood), { y: 0.37, parent: mallet });
  const head = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 12), mat("#ff5b5b"), { y: 0.78, parent: mallet }); head.rotation.z = Math.PI / 2;
  return soil;
}

// ----- 青蛙：小池塘＋荷葉＋會跳的小青蛙 -----
async function buildFrog(d, p) {
  const sh = new THREE.Shape(); const N = 28;
  const R = a => 1.25 + 0.16 * Math.sin(a * 2 + 0.6) + 0.1 * Math.sin(a * 3 + 2);
  for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2, r = R(a); const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 0.95; if (k) sh.lineTo(x, z); else sh.moveTo(x, z); }
  const rim = new THREE.ShapeGeometry(sh, 2); rim.rotateX(-Math.PI / 2); rim.scale(1.12, 1, 1.12);
  mesh(rim, mat("#cdbf9f"), { y: 0.02, shadow: false, parent: p });
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
  // 程式生成的小青蛙：在荷葉間跳
  const frog = new THREE.Group(); frog.userData.dyn = true; p.add(frog);
  const green = mat("#6cc44f");
  mesh(new RoundedBoxGeometry(0.34, 0.2, 0.3, 2, 0.08), green, { y: 0.1, parent: frog });
  for (const s of [-1, 1]) { mesh(new THREE.SphereGeometry(0.07, 10, 8), green, { x: s * 0.09, y: 0.22, z: 0.06, shadow: false, parent: frog }); mesh(new THREE.SphereGeometry(0.04, 8, 6), mat("#ffffff"), { x: s * 0.09, y: 0.24, z: 0.1, shadow: false, parent: frog }); mesh(new THREE.SphereGeometry(0.022, 6, 5), mat("#24324a"), { x: s * 0.09, y: 0.245, z: 0.135, shadow: false, parent: frog }); }
  frog.scale.setScalar(1.3);
  const hops = [0, 1, 3, 1, 0, 2];
  tickers.push(t => { const c = t / 2.4, i = Math.floor(c) % hops.length, f = c % 1; const a = PADS[hops[i]], b = PADS[hops[(i + 1) % hops.length]];
    const u = f < 0.75 ? 0 : (f - 0.75) / 0.25, s = u * u * (3 - 2 * u);
    frog.position.set(a[0] + (b[0] - a[0]) * s, 0.08 + Math.sin(Math.PI * s) * 0.45, a[1] + (b[1] - a[1]) * s);
    frog.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); });
  return wm;
}
const BUILDERS = { fish: buildFish, order: buildOrder, build: buildBuild, hunt: buildHunt, match: buildMatch, tone: buildTone, whack: buildWhack, frog: buildFrog };

// 中央廣場的噴水池、長椅、路燈（Kenney，第二段）
async function buildPlaza() {
  const g = new THREE.Group(); scene.add(g);
  const LAMP = [[1, 2, "#3e7d68"], [7, 3, "#356b59"], [2, 2, "#fff0b3"]];
  await Promise.all([
    kenney("fantasy-town-kit", "fountain-round", { scale: 0.75, y: 0.03, parent: g }),
    ...[[0, -1.25, 0], [0, 1.25, Math.PI], [-1.25, 0, Math.PI / 2], [1.25, 0, -Math.PI / 2]].map(([x, z, r]) => kenney("holiday-kit", "bench", { scale: 0.6, x, z, ry: r, y: 0.03, parent: g })),
    ...LAMPS.map(([x, z]) => kenney("fantasy-town-kit", "lantern", { scale: 0.62, x, z, tints: LAMP, parent: g })),
  ]);
  mergeStatic(g);
}

// =========================================================
// 朋友：方塊動物沿著環狀道路散步（同方向排隊走，偶爾停下來轉頭看鏡頭）
// =========================================================
const LOOP_R = RING, LOOP_C = 0.7;                       // 環路半寬、轉角圓角
const LOOP_LEN = 8 * (LOOP_R - LOOP_C) + 2 * Math.PI * LOOP_C;
const PET_GAP = 1.3;                                     // 前面朋友太近就排隊等
function loopAt(s) {                                   // 弧長 → 位置＋行進方向
  s = ((s % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
  const L = 2 * (LOOP_R - LOOP_C), A = Math.PI * LOOP_C / 2, seg = L + A;
  const side = Math.floor(s / seg), u = s - side * seg;
  let x, z, tx, tz;
  if (u < L) { x = -LOOP_R + LOOP_C + u; z = -LOOP_R; tx = 1; tz = 0; }
  else { const a = (u - L) / LOOP_C - Math.PI / 2; x = LOOP_R - LOOP_C + Math.cos(a) * LOOP_C; z = -LOOP_R + LOOP_C + Math.sin(a) * LOOP_C; tx = -Math.sin(a); tz = Math.cos(a); }
  for (let k = 0; k < side; k++) { [x, z] = [-z, x]; [tx, tz] = [-tz, tx]; }   // 第 side 邊：繞 y 軸轉 side×90°
  return { x, z, tx, tz };
}
let customList = null;
function customModels() {
  return customList || (customList = fetch(MODELS + "models.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : { models: [] }).then(j => new Set(j.models || [])).catch(() => new Set()));
}
async function spawnPet(f, idx) {
  const name = PET_NAME[f.id]; if (!name) return null;
  let obj;
  if ((await customModels()).has(name)) {
    const g = await loadGLB(`${MODELS}${name}.glb`);
    obj = g.scene.clone(true); obj.userData.clips = g.animations;
    obj.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material && !o.material.isMeshLambertMaterial) o.material = new THREE.MeshLambertMaterial({ map: o.material.map || null, color: o.material.color || 0xffffff, vertexColors: !!o.geometry.attributes.color }); } });
  } else if (PET_KENNEY[name]) obj = await kenney("cube-pets", PET_KENNEY[name], { parent: null });
  else return null;                                    // 小熊／青蛙還沒做好就跳過
  const b = new THREE.Box3().setFromObject(obj), h = b.max.y - b.min.y || 1; obj.scale.multiplyScalar(PET_H / h);
  if (pets.has(f.id) || dead) return null;
  const holder = new THREE.Group(); scene.add(holder); holder.add(obj);
  const pet = { f, holder, obj, s: (LOOP_LEN - idx * LOOP_LEN / 8) % LOOP_LEN, speed: 0.45, jump: 0, legs: [], walk: true, timer: 4 + (idx * 1.7) % 5, yaw: 0, moving: true };
  const clips = obj.userData.clips || [];
  const walk = clips.find(c => c.name === "walk"), idle = clips.find(c => c.name === "idle");
  if (walk) { pet.mixer = new THREE.AnimationMixer(obj); pet.aWalk = pet.mixer.clipAction(walk).play(); if (idle) { pet.aIdle = pet.mixer.clipAction(idle); pet.aIdle.play(); pet.aIdle.weight = 0; } pet.mixer.setTime(idx * 0.37); }
  else obj.traverse(o => { if (/leg/i.test(o.name)) pet.legs.push(o); });
  // 點擊判定：比身體大一圈（跟著放大）
  const hb = new THREE.Box3().setFromObject(obj), hs = hb.getSize(new THREE.Vector3());
  const hit = new THREE.Mesh(new THREE.BoxGeometry(hs.x * 1.4 + 0.2, hs.y * 1.25 + 0.2, hs.z * 1.4 + 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = hs.y / 2; hit.userData.pet = pet; holder.add(hit); petHits.push(hit); pet.hit = hit;
  pets.set(f.id, pet);
  return pet;
}
const spawning = new Set();
function syncPets() {
  if (!built) return;                                  // 建築都到了才載朋友（先把頻寬讓給建築）
  const list = (opts.friends() || []).slice(0, 8), want = new Set(list.map(f => f.id));
  for (const [id, pet] of pets) if (!want.has(id)) { scene.remove(pet.holder); petHits.splice(petHits.indexOf(pet.hit), 1); pets.delete(id); }
  list.forEach((f, i) => { if (!pets.has(f.id) && !spawning.has(f.id)) { spawning.add(f.id); spawnPet(f, i).catch(e => console.warn("[hub3d] 朋友模型載入失敗", f.id, e)).finally(() => spawning.delete(f.id)); } });
}
const CAM_YAW = Math.PI / 4;                            // 面向鏡頭的方向
function turnTo(cur, want, k) { let d = ((want - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return cur + d * k; }
function updatePets(t, dt) {
  const list = [...pets.values()];
  for (const pet of list) {
    pet.timer -= dt;
    if (pet.timer < 0) { pet.walk = !pet.walk; pet.timer = pet.walk ? 5 + Math.random() * 6 : 2.2 + Math.random() * 1.5; }
    // 前面（同方向）最近的朋友太近 → 排隊等
    let gap = Infinity;
    for (const o of list) if (o !== pet) { const g = ((o.s - pet.s) % LOOP_LEN + LOOP_LEN) % LOOP_LEN; if (g > 0 && g < gap) gap = g; }
    const moving = pet.walk && gap > PET_GAP && !pet.jump;
    if (moving) pet.s += pet.speed * dt;
    const q = loopAt(pet.s);
    pet.holder.position.set(q.x, 0.045, q.z);
    pet.yaw = turnTo(pet.yaw, moving ? Math.atan2(q.tx, q.tz) : CAM_YAW, Math.min(1, dt * 6));   // 停下來就轉頭看鏡頭
    pet.holder.rotation.y = pet.yaw;
    if (pet.mixer) {
      if (pet.aIdle) { const w = moving ? 1 : 0; pet.aWalk.weight += (w - pet.aWalk.weight) * Math.min(1, dt * 5); pet.aIdle.weight = 1 - pet.aWalk.weight; }
      pet.mixer.update(moving || pet.aIdle ? dt : 0);
    } else pet.legs.forEach((l, k) => { l.rotation.x = moving ? Math.sin(t * 9 + (k % 2) * Math.PI) * 0.5 : l.rotation.x * 0.8; });
    if (pet.jump) {
      const u = (performance.now() - pet.jump) / 600;
      if (u >= 1) { pet.jump = 0; pet.obj.position.y = 0; pet.obj.rotation.y = 0; }
      else { pet.obj.position.y = Math.sin(Math.PI * u) * 0.6; pet.obj.rotation.y = easeOutBack(u) * Math.PI * 2; }
    }
  }
}

// =========================================================
// 浮標（DOM，疊在 canvas 上；國字旁的注音由 zhuyin-ann 自動加）
// =========================================================
const cardOf = m => document.querySelector(`.mode-card[data-mode=${m}]`);
let tagRO = null;
function makeTags() {
  for (const d of DEFS) {
    const t = document.createElement("button"); t.className = "hub-tag"; t.type = "button"; t.dataset.mode = d.mode;
    t.innerHTML = '<span class="ht-row"><span class="ht-ico"></span><span class="ht-word"></span></span><span class="ht-lock"></span>';
    t.addEventListener("pointerdown", () => preloadCard(d));
    t.addEventListener("click", () => tapBuilding(d));
    tagLayer.appendChild(t); d.tag = t;
  }
  if ("ResizeObserver" in window) { tagRO = new ResizeObserver(() => { needFit = true; }); DEFS.forEach(d => tagRO.observe(d.tag)); }
}
function syncTag(d, card) {
  const set = (sel, txt) => { const e = d.tag.querySelector(sel); if (e.textContent !== txt) e.textContent = txt; };
  set(".ht-ico", card.querySelector(".big")?.textContent || "");
  set(".ht-word", card.querySelector(".label")?.textContent || "");
  set(".ht-lock", card.querySelector(".lock")?.textContent || "");
  d.tag.classList.toggle("locked", !!d.locked);
}
function setLocked(d, on, animate) {
  d.locked = on;
  setGray(d.pivot, on);
  if (!animate || on) { d.lockDeco.visible = on; return; }
  // 剛解鎖：圍籬收掉、建築跳一下
  const t0 = performance.now();
  anims.add({ update(now) { const u = Math.min(1, (now - t0) / 700);
    d.lockDeco.scale.set(1, Math.max(0.001, 1 - u), 1);
    if (u >= 1) { d.lockDeco.visible = false; d.lockDeco.scale.set(1, 1, 1); return false; } return true; } });
  later(() => bounce(d), 450);
}
// 新玩家第一次進來：手指點一下釣魚浮標（告訴他「點房子就能玩」）
function playFinger() {
  if (fingerDone || !opts.newbie()) return;
  fingerDone = true;
  finger = document.createElement("div"); finger.className = "hub-finger"; finger.innerHTML = "<span>👆</span>";
  tagLayer.appendChild(finger);
  later(() => { finger && finger.remove(); finger = null; }, 3400);
}

// =========================================================
// 點擊：建築彈一下 → 點那張卡片；動物跳一下＋唸名字
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
function preloadCard(d) { try { cardOf(d.mode)?.dispatchEvent(new PointerEvent("pointerdown")); } catch (e) {} }
function tapBuilding(d) {
  const now = performance.now(); if (now < tapLockUntil) return; tapLockUntil = now + 700;
  preloadCard(d); bounce(d, d.locked);
  later(() => { if (shown) cardOf(d.mode)?.click(); }, d.locked ? 120 : 260);
}
function tapPet(pet) {
  if (pet.jump) return;
  pet.jump = performance.now();
  try { opts.onFriend(pet.f); } catch (e) {}
}
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
raycaster.params.Line.threshold = 0.02;                // 預設 1 單位太寬：細線（釣魚線、氣球繩）會擋住一大片
function pick(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ph = raycaster.intersectObjects(petHits, false);
  if (ph.length) return { pet: ph[0].object.userData.pet };
  // 先看實際點到哪棟的模型（前後重疊時以看得到的為準），沒點到模型再用判定盒
  const mh = raycaster.intersectObjects(DEFS.map(d => d.pivot), true).filter(h => h.object.isMesh);
  for (const h of mh) { let o = h.object; while (o && !o.userData.def) o = o.parent; if (o) return { def: o.userData.def }; }
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
function clampPan() { const lx = ISL.hx * 0.45, ly = ISL.hz * 0.32; user.px = Math.max(-lx, Math.min(lx, user.px)); user.py = Math.max(-ly, Math.min(ly, user.py)); }

// =========================================================
// 鏡頭擺位：所有建築＋浮標都不能被標題、圓鈕、膠囊、貓頭鷹擋住
// =========================================================
const baseCam = new THREE.OrthographicCamera();
function setCamDir(cam, az) { cam.position.set(Math.sin(az) * Math.cos(CAM_EL), Math.sin(CAM_EL), Math.cos(az) * Math.cos(CAM_EL)).multiplyScalar(60); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); }
function obstacles() {
  const out = [];
  for (const sel of ["#menu > h1", "#resumeBtn", "#menu > .menu-bottom", "#guide img", "#guideText", "#homeBtn", "#musicBtn", "#playerBtn", "#settingsBtn"]) {
    const e = document.querySelector(sel); if (!e || !e.offsetParent) continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const pad = sel === "#resumeBtn" ? 24 : 14;          // 繼續玩按鈕會閃動、鏡頭會漂：多留一點
    const grow = sel === "#guideText" ? r.height * 0.5 : 0;   // 貓頭鷹講長一點的話泡泡會往上長：先預留
    out.push({ x0: r.left - pad, x1: r.right + pad, y0: r.top - pad - grow, y1: r.bottom + pad });
  }
  return out;
}
const TAIL = 12;
function fit() {
  const W = innerWidth, H = innerHeight;
  if (!W || !H) return false;
  const sizes = DEFS.map(d => [d.tw = d.tag.offsetWidth, d.th = d.tag.offsetHeight]);
  if (sizes.some(s => !s[0])) return false;             // 浮標還沒顯示（量不到大小）→ 下一幀再擺
  const obs = obstacles();
  // 畫面大小、障礙物、浮標大小都沒變 → 不用重算
  const sig = [W, H, ...sizes.flat(), ...obs.map(o => `${o.x0 | 0},${o.y0 | 0},${o.x1 | 0},${o.y1 | 0}`)].join("|");
  if (sig === fitSig) return true;
  fitSig = sig;
  setCamDir(baseCam, Math.PI / 4);
  const inv = baseCam.matrixWorldInverse;
  const items = DEFS.map((d, i) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const { min, max } = d.box;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) { _v.set(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    _v.copy(d.anchor).applyMatrix4(inv);
    return { x0, x1, y0, y1, ax: _v.x, ay: _v.y, w: sizes[i][0], h: sizes[i][1] };
  });
  let ix0 = Infinity, ix1 = -Infinity, iy0 = Infinity, iy1 = -Infinity;
  for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
    _v.set(Math.sign(cx) * (WL.hx - WL.r) + cx * WL.r, SEA_Y, Math.sign(cz) * (WL.hz - WL.r) + cz * WL.r).applyMatrix4(inv);
    ix0 = Math.min(ix0, _v.x); ix1 = Math.max(ix1, _v.x); iy0 = Math.min(iy0, _v.y); iy1 = Math.max(iy1, _v.y); }
  const M = 6;
  const topY = Math.max(0, ...obs.filter(o => o.y1 < H * 0.35 && o.x0 < W * 0.7 && o.x1 > W * 0.3).map(o => o.y1));
  const botY = Math.min(H, ...obs.filter(o => o.y0 > H * 0.65 && o.x0 < W * 0.7 && o.x1 > W * 0.3).map(o => o.y0));
  const pref = { x: W / 2, y: (topY + botY) / 2 };
  const icx = (ix0 + ix1) / 2, icy = (iy0 + iy1) / 2;   // 島中心（view 座標）
  const kMax = Math.min(W / (ix1 - ix0), H / (iy1 - iy0)) * 1.3;   // 沙灘／海可以稍微超出畫面，建築與浮標不行
  const cand = [];                                     // 候選：島中心放在螢幕上的哪裡（由近到遠）
  for (let gy = -14; gy <= 14; gy++) for (let gx = -14; gx <= 14; gx++) cand.push([gx * W * 0.016, gy * H * 0.016]);
  cand.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  const rects = [], lab = [];
  // 擺位代價：超出畫面＋壓到介面的面積（0＝完全沒擋到）；full=false 時一碰到就回傳（找可行解用）
  const ov = (r, o) => Math.max(0, Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0)) * Math.max(0, Math.min(r.y1, o.y1) - Math.max(r.y0, o.y0));
  const scr = { x0: M, x1: W - M, y0: M, y1: H - M };
  const cost = (k, sx, sy, full) => {
    rects.length = 0; lab.length = 0;
    for (const it of items) {
      rects.push({ x0: sx + (it.x0 - icx) * k, x1: sx + (it.x1 - icx) * k, y0: sy - (it.y1 - icy) * k, y1: sy - (it.y0 - icy) * k });
      const ax = sx + (it.ax - icx) * k, ay = sy - (it.ay - icy) * k;
      lab.push({ x0: ax - it.w / 2, x1: ax + it.w / 2, y0: ay - it.h - TAIL, y1: ay - TAIL });
    }
    nudge(lab);
    let c = 0;
    for (const r of rects.concat(lab)) {
      c += (r.x1 - r.x0) * (r.y1 - r.y0) - ov(r, scr);
      for (const o of obs) c += ov(r, o);
      if (c > 0 && !full) return c;
    }
    return c;
  };
  let best = null, fb = null;
  for (let k = kMax; k >= kMax * 0.5 && !best; k *= 0.965) {
    for (const [ox, oy] of cand) if (!cost(k, pref.x + ox, pref.y + oy, false)) { best = { k, sx: pref.x + ox, sy: pref.y + oy }; break; }
    // 怎麼擺都會擋到：記下「擋最少」的擺法（差不多時取大的）
    for (let i = 0; i < 160 && !best; i++) { const sx = pref.x + cand[i][0], sy = pref.y + cand[i][1], c = cost(k, sx, sy, true); if (!fb || c < fb.c * 0.97) fb = { c, k, sx, sy }; }
  }
  view.fitOk = !!best;
  if (!best) best = fb;
  view.k = best.k; view.kMax = kMax;
  view.cx = icx - (best.sx - W / 2) / best.k;
  view.cy = icy + (best.sy - H / 2) / best.k;
  return true;
}
// 浮標互相重疊：橫向只重疊一點點（< 40%）→ 左右推開；重疊很多 → 上下各讓一半（只推上面的會疊成樓梯）
function nudge(lab) {
  for (let it = 0; it < 5; it++) {
    let moved = false;
    for (let i = 0; i < lab.length; i++) for (let j = i + 1; j < lab.length; j++) {
      const a = lab[i], b = lab[j];
      if (!(a.x0 < b.x1 + 4 && a.x1 > b.x0 - 4 && a.y0 < b.y1 + 3 && a.y1 > b.y0 - 3)) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), minW = Math.min(a.x1 - a.x0, b.x1 - b.x0);
      if (ox < minW * 0.4) {
        const [l, r] = (a.x0 + a.x1) <= (b.x0 + b.x1) ? [a, b] : [b, a], dx = (l.x1 + 4 - r.x0) / 2;
        l.x0 -= dx; l.x1 -= dx; r.x0 += dx; r.x1 += dx;
      } else {
        const [u, l] = a.y1 <= b.y1 ? [a, b] : [b, a], dy = (u.y1 + 3 - l.y0) / 2;
        u.y0 -= dy; u.y1 -= dy; l.y0 += dy; l.y1 += dy;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return lab;
}

// =========================================================
// 主迴圈（只有選單看得到時才跑；最多 30 格／秒；陰影 15Hz 更新）
// =========================================================
const tagPos = [];
function frame(ms) {
  raf = 0; if (!running) return;
  raf = requestAnimationFrame(frame);
  if (lastDraw && ms - lastDraw < 1000 / FPS - 3) return;
  lastDraw = ms; frames++;
  const t = ms / 1000, dt = Math.min(0.1, lastMs ? (ms - lastMs) / 1000 : 0.033); lastMs = ms;
  if (needFit && fit()) needFit = false;
  // 鏡頭：擺位 + 小孩拖曳／縮放 + 緩慢漂移（左右輕輕擺頭）
  const W = innerWidth, H = innerHeight, k = view.k * user.zoom;
  setCamDir(camera, Math.PI / 4 + Math.sin(t * 0.09) * 0.022);
  const cx = view.cx + user.px + Math.sin(t * 0.13) * 0.12, cy = view.cy + user.py + Math.sin(t * 0.1 + 1) * 0.08;
  camera.left = cx - W / 2 / k; camera.right = cx + W / 2 / k; camera.top = cy + H / 2 / k; camera.bottom = cy - H / 2 / k;
  camera.updateProjectionMatrix();
  seaU.uTime.value = t;
  for (const f of tickers) f(t, dt);
  for (const a of anims) if (a.update(performance.now()) === false) anims.delete(a);
  updatePets(t, dt);
  if (frames % 2 === 1) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  placeTags(t);
}
function placeTags(t) {
  const W = innerWidth, H = innerHeight;
  tagPos.length = 0;
  for (const d of DEFS) {
    _v.copy(d.anchor); _v.y += d.pivot.position.y; _v.project(camera);
    const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H, w = d.tw || 0, h = d.th || 0;
    tagPos.push({ d, x0: x - w / 2, x1: x + w / 2, y0: y - h - TAIL, y1: y - TAIL });
  }
  nudge(tagPos);
  for (const r of tagPos) { r.d.tag.style.transform = `translate3d(${r.x0.toFixed(1)}px, ${r.y0.toFixed(1)}px, 0)`; r.d.tag.style.zIndex = String(Math.round(r.y1)); r.d.tagRect = r; }
  // 浮標每 4 秒輪流輕跳一下（只跳解鎖的：告訴小孩「點這裡」）
  const cyc = Math.floor(t / 4);
  if (cyc !== hopCycle) { hopCycle = cyc; DEFS.filter(d => !d.locked).forEach((d, i) => later(() => { if (!d.tag.classList.contains("pop")) { d.tag.classList.remove("hop"); void d.tag.offsetWidth; d.tag.classList.add("hop"); } }, i * 150)); }
  if (finger) { const r = DEFS.find(d => d.mode === "fish").tagRect; if (r) { finger.style.transform = `translate3d(${((r.x0 + r.x1) / 2 - 8).toFixed(1)}px, ${(r.y1 - 6).toFixed(1)}px, 0)`; finger.style.zIndex = "99999"; } }
}
function startLoop() { if (running || dead || lost || !shown || document.hidden) return; running = true; lastMs = lastDraw = 0; raf = requestAnimationFrame(frame); }
function stopLoop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
function onResize() {
  if (dead) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
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
function onRestored() { lost = false; clearTimeout(lostTimer); fitSig = ""; needFit = true; renderer.shadowMap.needsUpdate = true; startLoop(); }

// =========================================================
// 對外介面
// =========================================================
// 第一段（要等）：島、路、樹、浮標、點擊判定盒 → 就可以開選單；第二段（背景）：建築模型 → 廣場 → 朋友
export async function createHub(o) {
  opts = { friends: () => [], onFriend: () => {}, onFail: () => {}, newbie: () => false, ...o };
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(innerWidth, innerHeight, false);
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
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 45 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3; sun.shadow.intensity = 0.75;
    scene.add(sun, sun.target);
    // DOM：canvas 墊在選單最底、浮標一層、其餘選單元素在上面
    stage = document.createElement("div"); stage.className = "hub-stage"; stage.appendChild(renderer.domElement);
    tagLayer = document.createElement("div"); tagLayer.className = "hub-tags";
    opts.host.prepend(stage); stage.after(tagLayer);
    makeTags(); bindInput(renderer.domElement);
    makeGeos();
    fenceMat = new THREE.MeshLambertMaterial({ map: stripeTex("#ffffff", "#ff8a3d", 5, true) }); postMat = mat("#f4f1ea");
    buildIsland(); buildTrees();
    DEFS.forEach(startDef);
    refresh();
    renderer.compile(scene, camera);
  } catch (e) { dispose(); throw e; }                 // 任何一步失敗：canvas／浮標都收掉，zhuyin.js 會退回卡片選單
  addEventListener("resize", onResizeEvt); addEventListener("orientationchange", onResizeEvt);
  document.addEventListener("visibilitychange", onVis);
  loadRest();
  return api;
}
async function loadRest() {
  try {
    // 先把建築用的模型一口氣丟出去抓（各棟裡面是一起 await，不會一個等一個）
    const order = ["fish", "order", "build", "hunt", "match", "tone", "whack", "frog"];
    await Promise.all(order.map((m, i) => buildDef(DEFS.find(d => d.mode === m), BUILDERS[m], i * 90).catch(e => console.warn("[hub3d] 建築載入失敗", m, e))));
    if (dead) return;
    await buildPlaza().catch(e => console.warn("[hub3d] 廣場載入失敗", e));
    built = true;
    if (!dead) syncPets();
  } catch (e) { console.warn("[hub3d]", e); }
}
// 回選單時呼叫：讀卡片的解鎖狀態、朋友名單、重新擺鏡頭
let refreshed = false;
function refresh() {
  if (dead) return;
  for (const d of DEFS) {
    const card = cardOf(d.mode); if (!card) continue;
    const locked = card.classList.contains("locked");
    if (d.locked !== locked) setLocked(d, locked, refreshed && d.locked !== undefined);
    syncTag(d, card);
  }
  refreshed = true;
  syncPets();
  needFit = true;
}
function show() {
  shown = true; user.zoom = 1; user.px = user.py = 0; needFit = true; startLoop();
  later(playFinger, 900);
}
function hide() { shown = false; stopLoop(); for (const p of ptrs.keys()) ptrs.delete(p); pinch = null; }
function disposeMat(m) { if (!m) return; for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); }
function dispose() {
  if (dead) return; dead = true; stopLoop();
  removeEventListener("resize", onResizeEvt); removeEventListener("orientationchange", onResizeEvt);
  document.removeEventListener("visibilitychange", onVis);
  clearTimeout(lostTimer); clearTimeout(resizeT); for (const id of timers) clearTimeout(id); timers.clear();
  if (tagRO) tagRO.disconnect();
  for (const p of pets.values()) if (p.mixer) p.mixer.stopAllAction();
  // 釋放 GPU 資源：場景裡的幾何、材質、貼圖＋快取的材質
  const geos = new Set(), mats = new Set();
  if (scene) scene.traverse(o => { if (o.geometry) geos.add(o.geometry); for (const m of [].concat(o.material || [])) mats.add(m); if (o.userData.mat0) for (const m of [].concat(o.userData.mat0)) mats.add(m); });
  for (const m of [...matCache.values(), ...kitMatCache.values(), ...grays, vcMat, fenceMat, ...(cardMats || [])]) mats.add(m);
  geos.forEach(g => g.dispose()); mats.forEach(disposeMat);
  for (const g of [...(TREE_GEOS || []), BUSH_GEO]) if (g) g.dispose();
  try { if (renderer) { renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); } } catch (e) {}
  try { stage && stage.remove(); tagLayer && tagLayer.remove(); } catch (e) {}
  if (DEBUG) delete window.__hub3d;
}
const api = { show, hide, refresh, dispose };

// 測試／除錯用（網址有 ?debug 才掛；tools/zy-test/hub3d.js）
if (DEBUG) window.__hub3d = {
  get frames() { return frames; }, get running() { return running; }, get fitOk() { return view.fitOk; }, get ready() { return built; },
  get fit() { return { k: view.k, kMax: view.kMax, zoom: user.zoom }; },
  // 建築本體在螢幕上的位置（點這裡＝點到那棟）
  screenOf(m) { const d = DEFS.find(x => x.mode === m); _v.copy(d.body).applyMatrix4(d.root.matrixWorld).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  hitAt(x, y) { const h = pick(x, y); return h ? (h.pet ? "pet:" + h.pet.f.id : h.def.mode) : null; },
  tagRect(m) { const r = DEFS.find(x => x.mode === m).tag.getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; },
  petScreen(id) { const p = pets.get(id); if (!p) return null; _v.set(0, PET_H * 0.45, 0).applyMatrix4(p.holder.matrixWorld).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight }; },
  pets: () => [...pets.keys()],
  locked: () => DEFS.filter(d => d.locked).map(d => d.mode),
  finger: () => !!finger,
  tags(on) { tagLayer.style.visibility = on ? "" : "hidden"; },
  focus(m, z = 1.5) { const d = DEFS.find(x => x.mode === m); if (!d) { user.zoom = 1; user.px = user.py = 0; return; } user.zoom = z; _v.copy(d.anchor).applyMatrix4(camera.matrixWorldInverse); user.px = _v.x - view.cx; user.py = _v.y - 1 - view.cy; },
  // 模型載完後的實際大小（改了建築就用這個更新上面的 LAYOUT）
  measure() {
    const out = {}; scene.updateMatrixWorld(true);
    for (const d of DEFS) {
      const o = d.root.position.clone().negate(), b = new THREE.Box3().setFromObject(d.pivot).translate(o), a = d.anchorBox.clone().translate(o), r = v => Math.round(v * 100) / 100;
      const cx = (a.min.x + a.max.x) / 2, cz = (a.min.z + a.max.z) / 2;
      out[d.mode] = [[b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z].map(r), [cx, a.max.y + 0.25, cz].map(r), [cx, a.min.y + (a.max.y - a.min.y) * 0.4, cz].map(r)];
    }
    return JSON.stringify(out);
  },
  stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, pixelRatio: renderer.getPixelRatio() }),
  dispose,
};
