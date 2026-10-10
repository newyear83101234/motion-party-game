// 注音小島 3D 等角示範（獨立頁，不接正式遊戲）
// 素材：Kenney.nl CC0（IMAGE/iso/kenney/），樹/花/氣球/積木/牌卡為程式生成
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* =========================================================
 * 1. 國字＋直排注音
 * ========================================================= */
const TONE_MARKS = 'ˊˇˋ';
function zyHTML(hz, zy) {
  const chars = [...hz];
  const syls = zy.trim().split(/\s+/);
  return chars.map((ch, i) => {
    let s = syls[i] || '';
    let light = false, tone = '';
    if (s.startsWith('˙')) { light = true; s = s.slice(1); }
    const last = s.slice(-1);
    if (TONE_MARKS.includes(last)) { tone = last; s = s.slice(0, -1); }
    const syms = [...s];
    const n = syms.length;
    // 聲調位置：2 個以上符號 → 最後兩個符號交界；1 個符號 → 該符號中央（單位 = 符號高度 1.02em）。
    // ˊˇˋ 字形的墨跡偏在字框上半部，所以再往下補 0.45em，視覺上才會落在交界旁
    const c = (n >= 2 ? n - 1 : 0.5) * 1.02 + 0.45;
    return `<span class="zc"><span class="hz">${ch}</span><span class="zy">` +
      (light ? '<i class="zy-light">˙</i>' : '') +
      `<span class="zy-col">${syms.map(x => `<b>${x}</b>`).join('')}` +
      (tone ? `<i class="zy-tone" style="top:${c.toFixed(2)}em">${tone}</i>` : '') +
      `</span></span></span>`;
  }).join('');
}
document.querySelectorAll('.zy-word[data-hz]').forEach(el => { el.innerHTML = zyHTML(el.dataset.hz, el.dataset.zy); });

/* =========================================================
 * 2. 常數
 * ========================================================= */
const ISL = { hx: 6.9, hz: 5.9, r: 2.3 };   // 草地：圓角矩形半寬/半深/圓角
const SAND = { pad: 0.55, slope: 0.7 };    // 沙灘外擴
const SEA_Y = -0.95;
const WATERLINE = { hx: ISL.hx + SAND.pad + SAND.slope, hz: ISL.hz + SAND.pad + SAND.slope, r: ISL.r + SAND.pad + SAND.slope };
const KIT = 'IMAGE/iso/kenney/';

const BUILDINGS = [
  { id: 'fish',     hz: '釣魚', zy: 'ㄉㄧㄠˋ ㄩˊ',   ico: '🎣', x: 4,  z: -3 },
  { id: 'shop',     hz: '點餐', zy: 'ㄉㄧㄢˇ ㄘㄢ',  ico: '🍔', x: 0,  z: -3 },
  { id: 'blocks',   hz: '積木', zy: 'ㄐㄧ ㄇㄨˋ',    ico: '🧱', x: -4, z: -3 },
  { id: 'treasure', hz: '尋寶', zy: 'ㄒㄩㄣˊ ㄅㄠˇ', ico: '💎', x: -4, z: 3 },
  { id: 'cards',    hz: '翻牌', zy: 'ㄈㄢ ㄆㄞˊ',    ico: '🃏', x: 0,  z: 3 },
  { id: 'balloon',  hz: '氣球', zy: 'ㄑㄧˋ ㄑㄧㄡˊ', ico: '🎈', x: 4,  z: 3 },
];

/* =========================================================
 * 3. Renderer / 場景 / 相機 / 光
 * ========================================================= */
const stage = document.getElementById('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('loading').classList.add('done');
  document.getElementById('fail').hidden = false;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
const CAM_DIR = new THREE.Vector3(1, 0.98, 1).normalize();   // 仰角約 35°，標準等角視角
camera.position.copy(CAM_DIR).multiplyScalar(120);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

scene.add(new THREE.HemisphereLight(0xf4f9ff, 0xf3e6d0, 1.45));
const sun = new THREE.DirectionalLight(0xfff4e4, 2.25);
sun.position.set(-7, 15, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3.5;
sun.shadow.intensity = 0.78;   // 柔和、不死黑的影子
scene.add(sun, sun.target);

/* =========================================================
 * 4. 小工具
 * ========================================================= */
const _c = new THREE.Color();
function paint(geo, hex) {
  _c.set(hex);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function rrShape(hx, hz, r) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz); s.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hx, hz - r);  s.absarc(hx - r, hz - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hx + r, hz); s.absarc(-hx + r, hz - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hx, -hz + r); s.absarc(-hx + r, -hz + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
function sdRoundBox(x, z, hx, hz, r) {
  const qx = Math.abs(x) - hx + r, qz = Math.abs(z) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
// 往下長的圓角板：頂面在 top，厚 depth
function slab({ hx, hz, r, top, depth, color, bevelT = 0, bevelS = 0, inset = true, seg = 3 }) {
  const geo = new THREE.ExtrudeGeometry(rrShape(hx, hz, r), {
    depth, curveSegments: 24, bevelEnabled: bevelT > 0, bevelThickness: bevelT, bevelSize: bevelS,
    bevelOffset: inset ? -bevelS : 0, bevelSegments: seg,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, top - bevelT, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  m.receiveShadow = true;
  return m;
}
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutElastic = t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;

const anims = new Set();       // { update(now) → false 結束 }
const tickers = [];            // 每幀持續動畫 (t) => void

/* =========================================================
 * 5. 小島本體：草地 + 土崖 + 沙灘 + 海
 * ========================================================= */
const island = new THREE.Group();
scene.add(island);
const grass = slab({ hx: ISL.hx, hz: ISL.hz, r: ISL.r, top: 0, depth: 0.14, color: '#9ad86a', bevelT: 0.06, bevelS: 0.06 });
const dirt = slab({ hx: ISL.hx - 0.05, hz: ISL.hz - 0.05, r: ISL.r - 0.05, top: -0.12, depth: 0.8, color: '#c48a5f' });
const sand = slab({ hx: ISL.hx + SAND.pad, hz: ISL.hz + SAND.pad, r: ISL.r + SAND.pad, top: -0.66, depth: 0.7, color: '#f6e2b8', bevelT: 0.3, bevelS: SAND.slope, inset: false, seg: 4 });
dirt.castShadow = true;
island.add(grass, dirt, sand);

// 海：淡格線 + 淺水帶 + 浪花 + 上緣淡出露出天空漸層
const seaUniforms = {
  uTime: { value: 0 },
  uDeep: { value: new THREE.Color('#5394dc') },
  uShallow: { value: new THREE.Color('#a8e6ee') },
  uHalf: { value: new THREE.Vector2(WATERLINE.hx, WATERLINE.hz) },
  uR: { value: WATERLINE.r },
  uRes: { value: new THREE.Vector2(1, 1) },
};
const SDF_GLSL = `
float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`;
const seaMat = new THREE.ShaderMaterial({
  uniforms: seaUniforms, transparent: true, depthWrite: false, toneMapped: false,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec2 uHalf; uniform float uR; uniform vec2 uRes;
    varying vec3 vW;
    ${SDF_GLSL}
    void main(){
      vec2 p = vW.xz;
      float d = sdRB(p, uHalf, uR);
      float shallow = 1.0 - smoothstep(-0.2, 3.4, d);
      vec3 col = mix(uDeep, uShallow, shallow);
      // 淡格線（與小島格子對齊，線在半格上）
      vec2 f = abs(fract(p) - 0.5);
      vec2 fw = fwidth(p) * 1.3;
      float line = 1.0 - min(smoothstep(0.0, fw.x, f.x), smoothstep(0.0, fw.y, f.y));
      col = mix(col, vec3(1.0), line * 0.3);
      // 水面亮點（橢圓、緩慢閃爍）
      vec2 cp = p / 5.0 + vec2(uTime * 0.02, 0.0);
      vec2 id = floor(cp); vec2 fc = fract(cp) - 0.5;
      float h = hash(id);
      vec2 o = vec2(h - 0.5, fract(h * 7.31) - 0.5) * 0.5;
      vec2 e = fc - o; e = vec2(e.x + e.y, e.y - e.x) * vec2(1.0, 3.2);
      float spark = smoothstep(0.11, 0.07, length(e)) * step(0.45, h) * (0.55 + 0.45 * sin(uTime * 0.9 + h * 30.0));
      col = mix(col, vec3(1.0), spark * 0.3 * (1.0 - shallow));
      // 浪花：沿岸白邊（輕微起伏）
      float w1 = 0.16 + 0.07 * sin(uTime * 1.3 + p.x * 0.8 + p.y * 0.6);
      float foam = smoothstep(w1 + 0.1, w1, d) * smoothstep(-0.25, -0.05, d);
      float d2 = d - (0.75 + 0.18 * sin(uTime * 0.9 + p.x * 0.5 - p.y * 0.4));
      float foam2 = (1.0 - smoothstep(0.0, 0.06, abs(d2))) * 0.45;
      col = mix(col, vec3(1.0), clamp(foam * 0.9 + foam2, 0.0, 1.0));
      float a = mix(0.97, 0.62, shallow);
      a = max(a, foam * 0.9);
      // 畫面上緣淡出 → 露出 CSS 天空漸層
      float sy = gl_FragCoord.y / uRes.y;
      a *= 1.0 - smoothstep(0.84, 0.985, sy);
      gl_FragColor = vec4(col, a);
      #include <colorspace_fragment>
    }`,
});
const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), seaMat);
sea.rotation.x = -Math.PI / 2;
sea.position.y = SEA_Y;
scene.add(sea);

// 種樹模式：草地上的白色格線
const gridUniforms = { uHalf: { value: new THREE.Vector2(ISL.hx - 0.06, ISL.hz - 0.06) }, uR: { value: ISL.r - 0.06 }, uOpacity: { value: 0 }, uTime: { value: 0 } };
const gridMat = new THREE.ShaderMaterial({
  uniforms: gridUniforms, transparent: true, depthWrite: false, toneMapped: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform vec2 uHalf; uniform float uR; uniform float uOpacity; uniform float uTime;
    varying vec3 vW;
    ${SDF_GLSL}
    void main(){
      vec2 p = vW.xz;
      float d = sdRB(p, uHalf, uR);
      if (d > 0.0 || uOpacity <= 0.001) discard;
      vec2 f = abs(fract(p) - 0.5);
      vec2 fw = fwidth(p) * 1.6;
      float line = 1.0 - min(smoothstep(0.0, fw.x, f.x), smoothstep(0.0, fw.y, f.y));
      float pulse = 0.75 + 0.25 * sin(uTime * 3.0);
      gl_FragColor = vec4(vec3(1.0), (line * 0.75 * pulse + 0.06) * uOpacity);
    }`,
});
const gridOverlay = new THREE.Mesh(new THREE.PlaneGeometry(ISL.hx * 2, ISL.hz * 2), gridMat);
gridOverlay.rotation.x = -Math.PI / 2;
gridOverlay.position.y = 0.006;
gridOverlay.renderOrder = 2;
scene.add(gridOverlay);

/* =========================================================
 * 6. 佔用格子（種樹用）
 * ========================================================= */
const occ = new Set();
const key = (i, j) => i + ',' + j;
const occupy = (i0, i1, j0, j1) => { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) occ.add(key(i, j)); };
const cellInside = (i, j) => sdRoundBox(i, j, ISL.hx, ISL.hz, ISL.r) <= -0.5;
const cellFree = (i, j) => cellInside(i, j) && !occ.has(key(i, j));

/* =========================================================
 * 7. Kenney 素材：調色盤貼圖粉彩化＋局部換色
 * ========================================================= */
const kitImg = {};
const matCache = new Map();
function makeKitTexture(img, tints) {
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, cv.width, cv.height), d = id.data, W = cv.width;
  const CW = cv.width / 8, CH = cv.height / 4;    // 調色盤一格 64×128
  const lum = (k) => 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
  for (const [col, row, hex] of tints) {
    _c.set(hex); const tr = Math.round(Math.pow(_c.r, 1 / 2.2) * 255), tg = Math.round(Math.pow(_c.g, 1 / 2.2) * 255), tb = Math.round(Math.pow(_c.b, 1 / 2.2) * 255);
    const x0 = col * CW, y0 = row * CH;
    const ref = Math.max(lum(((y0 + CH / 2) * W + x0 + CW / 4) * 4), 1);
    for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CW; x++) {
      const k = (y * W + x) * 4, f = Math.min(Math.max(lum(k) / ref, 0.35), 1.25);
      d[k] = Math.min(255, tr * f); d[k + 1] = Math.min(255, tg * f); d[k + 2] = Math.min(255, tb * f);
    }
  }
  // 粉彩化：略降飽和、往白色提亮
  const SAT = 0.9, LIFT = 0.1;
  for (let k = 0; k < d.length; k += 4) {
    const l = lum(k);
    for (let c = 0; c < 3; c++) { let v = l + (d[k + c] - l) * SAT; v = v + (255 - v) * LIFT; d[k + c] = v; }
  }
  g.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
function kitMaterial(kit, tints = []) {
  const k = kit + JSON.stringify(tints);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ map: makeKitTexture(kitImg[kit], tints) }));
  return matCache.get(k);
}
const gltfLoader = new GLTFLoader();
const modelCache = new Map();
function loadModel(kit, name) {
  const k = kit + '/' + name;
  if (!modelCache.has(k)) modelCache.set(k, gltfLoader.loadAsync(KIT + k + '.glb').then(g => g.scene));
  return modelCache.get(k);
}
const waterMat = new THREE.MeshLambertMaterial({ color: '#8fd8f5', emissive: '#2a6f8f', emissiveIntensity: 0.25 });
async function kenney(kit, name, { tints = [], scale = 1, x = 0, y = 0, z = 0, rot = 0, parent = scene } = {}) {
  const src = await loadModel(kit, name);
  const obj = src.clone(true);
  const mat = kitMaterial(kit, tints);
  obj.traverse(o => {
    if (!o.isMesh) return;
    o.material = (o.material && o.material.map) ? mat : (o.material && /water/i.test(o.material.name) ? waterMat : new THREE.MeshLambertMaterial({ color: o.material?.color || 0xffffff }));
    o.castShadow = true; o.receiveShadow = true;
  });
  obj.scale.setScalar(scale);
  obj.position.set(x, y, z);
  obj.rotation.y = rot;
  parent.add(obj);
  return obj;
}

/* =========================================================
 * 8. 程式生成小物：樹、灌木、花、積木、牌卡、氣球
 * ========================================================= */
const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function blob(r, x, y, z, hex, detail = 1) { const g = new THREE.IcosahedronGeometry(r, detail); g.translate(x, y, z); return paint(g, hex); }
function trunk(h) { const g = new THREE.CylinderGeometry(0.06, 0.095, h, 7).toNonIndexed(); g.translate(0, h / 2, 0); return paint(g, '#a7724f'); }
const TREE_GEOS = [
  mergeGeometries([trunk(0.55), blob(0.46, 0, 0.95, 0, '#7fd36a'), blob(0.32, 0.22, 1.24, 0.1, '#96e07e'), blob(0.3, -0.2, 1.15, -0.12, '#6cc35b')]),
  mergeGeometries([trunk(0.5), blob(0.42, 0, 0.86, 0, '#69c45e'), blob(0.33, 0.02, 1.26, 0.02, '#84d872'), blob(0.21, 0, 1.56, 0, '#9de588')]),
  mergeGeometries([trunk(0.5), blob(0.44, 0, 0.9, 0, '#ffb25e'), blob(0.3, 0.2, 1.17, 0.07, '#ffc47a'), blob(0.28, -0.18, 1.1, -0.1, '#ff9d4e')]),
  mergeGeometries([trunk(0.45), blob(0.4, 0, 0.82, 0, '#ffb3cb'), blob(0.29, 0.18, 1.07, 0.05, '#ffc9da'), blob(0.27, -0.16, 1.02, -0.1, '#ff9fbf')]),
];
const BUSH_GEO = mergeGeometries([blob(0.22, 0, 0.17, 0, '#6cc65f'), blob(0.17, 0.19, 0.13, 0.05, '#82d46e'), blob(0.15, -0.17, 0.12, -0.05, '#5fb957')]);
function makeTree(v = 0) { const m = new THREE.Mesh(TREE_GEOS[v], vcMat); m.castShadow = true; m.receiveShadow = true; return m; }
function addTree(i, j, v, s = 1) {
  const t = makeTree(v);
  t.position.set(i + (Math.random() - 0.5) * 0.12, 0, j + (Math.random() - 0.5) * 0.12);
  t.rotation.y = Math.random() * Math.PI * 2;
  t.scale.setScalar(s);
  scene.add(t);
  occ.add(key(i, j));
  return t;
}
function addBush(x, z, s = 1, parent = scene) { const b = new THREE.Mesh(BUSH_GEO, vcMat); b.position.set(x, 0, z); b.scale.setScalar(s); b.rotation.y = Math.random() * 6; b.castShadow = true; parent.add(b); return b; }

const FLOWER_COLORS = ['#ff8fb1', '#ffffff', '#ffd75e', '#ff6f7d', '#c9a2ff'];
const flowerSpots = [];
function flowerPatch(x, z, n = 7, spread = 0.32) { for (let k = 0; k < n; k++) flowerSpots.push([x + (Math.random() - 0.5) * spread * 2, z + (Math.random() - 0.5) * spread * 2]); }

/* =========================================================
 * 9. 路
 * ========================================================= */
const pathTopMat = new THREE.MeshLambertMaterial({ color: '#f1edf5' });
const pathEdgeMat = new THREE.MeshLambertMaterial({ color: '#d8d0e2' });
function pathRect(x0, z0, x1, z1, top) {
  const w = x1 - x0, d = z1 - z0;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, top - 0.012, d + 0.12), pathEdgeMat);
  edge.position.set((x0 + x1) / 2, (top - 0.012) / 2, (z0 + z1) / 2);
  const surf = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), pathTopMat);
  surf.position.set((x0 + x1) / 2, top - 0.006, (z0 + z1) / 2);
  edge.receiveShadow = surf.receiveShadow = true;
  scene.add(edge, surf);
}

/* =========================================================
 * 10. 建築群
 * ========================================================= */
const hitBoxes = [];
const bubbles = [];
function startBuilding(def) {
  const root = new THREE.Group(); root.position.set(def.x, 0, def.z);
  const pivot = new THREE.Group(); root.add(pivot);
  scene.add(root);
  def.root = root; def.pivot = pivot;
  return pivot;
}
function finishBuilding(def, anchorObj) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(def.pivot);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const hit = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.3, size.y + 0.3, size.z + 0.3), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(def.root.worldToLocal(ctr.clone()));
  hit.userData.def = def;
  def.root.add(hit);
  hitBoxes.push(hit);
  const ab = anchorObj ? new THREE.Box3().setFromObject(anchorObj) : box;
  def.topY = ab.max.y;
  def.anchor = new THREE.Vector3((ab.min.x + ab.max.x) / 2, ab.max.y, (ab.min.z + ab.max.z) / 2);
  def.box = box;
  // 頭頂表情圖泡泡（不用文字 → 小孩看圖就懂）
  const sp = emojiSprite(def.ico);
  sp.position.set(def.anchor.x, def.topY + 0.62, def.anchor.z);
  sp.userData.baseY = sp.position.y;
  sp.userData.phase = Math.random() * 6;
  scene.add(sp);
  bubbles.push(sp);
  def.bubble = sp;
}
function emojiSprite(ch) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(40,70,120,0.18)'; g.beginPath(); g.arc(64, 70, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 62, 54, 0, Math.PI * 2); g.fill();
  g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 64, 66);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, toneMapped: false, depthTest: false }));
  sp.scale.set(0.95, 0.95, 1);
  sp.renderOrder = 10;
  return sp;
}

async function buildFish(def) {
  const p = startBuilding(def);
  // 漁夫小屋：藍屋頂
  const hut = await kenney('suburban', 'building-type-h', { parent: p, scale: 1.55, tints: [[0, 1, '#6fb2ee']] });
  // 碼頭：接在主路東端，往海裡延伸
  const DOCK_S = 0.72, DOCK_TOP = -0.06;
  const dockA = await kenney('pirate', 'structure-platform-dock', { parent: p, scale: DOCK_S, x: 7.75 - def.x, z: 0 - def.z, y: DOCK_TOP - 1.31 * DOCK_S });
  const dockB = await kenney('pirate', 'structure-platform-dock', { parent: p, scale: DOCK_S, x: 9.55 - def.x, z: 0 - def.z, y: DOCK_TOP - 1.31 * DOCK_S });
  await kenney('pirate', 'barrel', { parent: p, scale: 0.24, x: 8.2 - def.x, z: -0.55 - def.z, y: DOCK_TOP });
  await kenney('pirate', 'barrel', { parent: p, scale: 0.2, x: 8.55 - def.x, z: -0.62 - def.z, y: DOCK_TOP });
  // 小船
  const boat = await kenney('pirate', 'boat-row-small', { parent: p, scale: 0.46, x: 9.3 - def.x, z: 1.6 - def.z, y: SEA_Y - 0.12, rot: 0.25 });
  tickers.push(t => { boat.position.y = SEA_Y - 0.12 + Math.sin(t * 1.4) * 0.035; boat.rotation.z = Math.sin(t * 1.1) * 0.04; });
  // 釣竿＋浮標
  const rodMat = new THREE.MeshLambertMaterial({ color: '#8a5a3c' });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 1.5, 6), rodMat);
  rod.position.set(10.25 - def.x, DOCK_TOP + 0.55, 0.15 - def.z);
  rod.rotation.z = -0.95; rod.castShadow = true;
  p.add(rod);
  const bob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshLambertMaterial({ color: '#ff5d6c' }));
  bob.position.set(11.2 - def.x, SEA_Y + 0.03, 0.15 - def.z);
  p.add(bob);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(10.85 - def.x, DOCK_TOP + 1.0, 0.15 - def.z), bob.position.clone()]);
  const fishLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ffffff' }));
  p.add(fishLine);
  tickers.push(t => { bob.position.y = SEA_Y + 0.03 + Math.sin(t * 2.6) * 0.035; lineGeo.attributes.position.setY(1, bob.position.y); lineGeo.attributes.position.needsUpdate = true; });
  addBush(-1.05, 0.95, 0.9, p); addBush(1.1, 0.9, 0.8, p);
  finishBuilding(def, hut);
  void dockA; void dockB;
}

async function buildShop(def) {
  const p = startBuilding(def);
  const shop = await kenney('commercial', 'building-c', { parent: p, scale: 2.05, tints: [[3, 2, '#fff1dc'], [0, 2, '#62b892']] });
  await kenney('commercial', 'detail-awning-wide', { parent: p, scale: 2.05, y: 0.62, z: 0.93, tints: [[0, 1, '#ff8fa8'], [0, 2, '#ffffff']] });
  await kenney('commercial', 'detail-parasol-a', { parent: p, scale: 2.1, x: -1.15, z: 1.95, tints: [[0, 1, '#ffd36b']] });
  await kenney('commercial', 'detail-parasol-b', { parent: p, scale: 2.1, x: 1.15, z: 1.95, tints: [[0, 1, '#ff9fbb']] });
  flowerPatch(def.x - 1.2, def.z - 0.9, 6, 0.25);
  finishBuilding(def, shop);
}

async function buildBlocks(def) {
  const p = startBuilding(def);
  const house = await kenney('suburban', 'building-type-o', { parent: p, scale: 1.6, tints: [[0, 1, '#b08cf2'], [3, 2, '#fff4cf']] });
  // 積木堆
  const COLS = ['#ff8a8a', '#ffd166', '#7cc6ff', '#8be08b', '#c9a2ff'];
  const g = new THREE.Group(); g.position.set(1.1, 0, 1.15); g.scale.setScalar(1.45); p.add(g);
  const cube = (s, x, y, z, c, r = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshLambertMaterial({ color: c })); m.position.set(x, y + s / 2, z); m.rotation.y = r; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  cube(0.32, 0, 0, 0, COLS[0], 0.2); cube(0.32, 0.36, 0, 0.05, COLS[2], -0.1); cube(0.3, 0.17, 0.32, 0.02, COLS[1], 0.5);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.26, 4), new THREE.MeshLambertMaterial({ color: COLS[3] }));
  roof.position.set(0.17, 0.62 + 0.13, 0.02); roof.rotation.y = 0.5 + Math.PI / 4; roof.castShadow = true; g.add(roof);
  cube(0.26, -0.25, 0, 0.42, COLS[4], 0.7);
  flowerPatch(def.x - 1.2, def.z + 1.25, 7, 0.28);
  finishBuilding(def, house);
}

async function buildTreasure(def) {
  const p = startBuilding(def);
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.38, 0.05, 48), pathTopMat);
  plaza.position.y = 0.025; plaza.receiveShadow = true; p.add(plaza);
  const fountain = await kenney('fantasy', 'fountain-round', { parent: p, scale: 0.82, y: 0.05 });
  const chest = await kenney('pirate', 'chest', { parent: p, scale: 0.46, x: 0.95, z: 1.15, y: 0.11, rot: Math.PI / 4, tints: [[3, 3, '#ffcf5a']] });
  // 寶箱閃光
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffe066', toneMapped: false });
  for (let k = 0; k < 3; k++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), sparkMat);
    const ph = k * 2.1;
    p.add(s);
    tickers.push(t => { const a = t * 1.6 + ph; s.position.set(0.95 + Math.cos(a) * 0.32, 0.55 + Math.sin(t * 2 + ph) * 0.1, 1.15 + Math.sin(a) * 0.32); s.rotation.y = t * 3; s.scale.setScalar(0.7 + 0.3 * Math.sin(t * 4 + ph)); });
  }
  // 地上的紅色 X
  const xMat = new THREE.MeshLambertMaterial({ color: '#ff6b6b' });
  for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.11), xMat); b.position.set(-1.0, 0.012, 1.15); b.rotation.y = r; p.add(b); }
  addBush(-1.15, -1.0, 1.0, p); addBush(1.1, -1.05, 0.9, p);
  flowerPatch(def.x - 1.35, def.z - 0.2, 6, 0.2);
  finishBuilding(def, fountain);
  void chest;
}

async function buildCards(def) {
  const p = startBuilding(def);
  const pav = await kenney('pirate', 'structure-roof', { parent: p, scale: 0.6, tints: [[7, 3, '#6fcdb9']] });
  // 野餐墊＋牌卡
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 1.1), new THREE.MeshLambertMaterial({ color: '#bfe3ff' }));
  mat.position.y = 0.012; mat.receiveShadow = true; p.add(mat);
  const backMat = new THREE.MeshLambertMaterial({ color: '#ff9fbf' });
  const faceMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const DOTS = ['#ffd166', '#7cc6ff', '#8be08b'];
  const cardGeo = new THREE.BoxGeometry(0.3, 0.025, 0.42);
  let flipCard = null;
  [[-0.5, -0.25], [-0.1, -0.25], [0.3, -0.25], [-0.5, 0.25], [-0.1, 0.25], [0.3, 0.25]].forEach(([x, z], k) => {
    const c = new THREE.Group(); c.position.set(x + 0.1, 0.04, z); p.add(c);
    const faceUp = k === 1 || k === 5;
    const m = new THREE.Mesh(cardGeo, faceUp ? faceMat : backMat); m.castShadow = true; c.add(m);
    if (faceUp) { const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 16), new THREE.MeshLambertMaterial({ color: DOTS[k % 3] })); dot.position.y = 0.018; c.add(dot); }
    if (k === 3) flipCard = c;
  });
  if (flipCard) {
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 16), new THREE.MeshLambertMaterial({ color: '#ff8a8a' }));
    dot.position.y = -0.018; flipCard.add(dot);
    // 每 4 秒：翻開 → 停一下 → 蓋回去
    const sm = x => x * x * (3 - 2 * x);
    tickers.push(t => {
      const ph = (t % 4) / 4;
      const a = ph < 0.4 ? 0 : ph < 0.55 ? sm((ph - 0.4) / 0.15) : ph < 0.85 ? 1 : sm(1 - (ph - 0.85) / 0.15);
      flipCard.rotation.z = Math.PI * a;
      flipCard.position.y = 0.04 + Math.sin(Math.PI * a) * 0.2;
    });
  }
  addBush(-1.15, 1.0, 0.85, p); addBush(1.15, -1.0, 0.85, p);
  finishBuilding(def, pav);
}

async function buildBalloon(def) {
  const p = startBuilding(def);
  const stall = await kenney('fantasy', 'stall-red', { parent: p, scale: 1.3, rot: -Math.PI / 2, tints: [[0, 3, '#ff8fa3']] });
  // 一串氣球
  const cluster = new THREE.Group(); cluster.position.set(0.62, 1.05, 0.55); p.add(cluster);
  const BCOL = ['#ff7b8f', '#ffd166', '#7cc6ff', '#8be08b', '#c9a2ff', '#ff9fd0'];
  const bGeo = new THREE.SphereGeometry(0.2, 16, 12); bGeo.scale(1, 1.18, 1);
  const strPts = [];
  BCOL.forEach((c, k) => {
    const a = k / BCOL.length * Math.PI * 2;
    const pos = new THREE.Vector3(Math.cos(a) * 0.3, 1.0 + (k % 2) * 0.25 + (k === 0 ? 0.15 : 0), Math.sin(a) * 0.3);
    const b = new THREE.Mesh(bGeo, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.12 }));
    b.position.copy(pos); b.castShadow = true; cluster.add(b);
    strPts.push(new THREE.Vector3(0, 0, 0), pos.clone().add(new THREE.Vector3(0, -0.23, 0)));
  });
  cluster.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(strPts), new THREE.LineBasicMaterial({ color: '#ffffff' })));
  tickers.push(t => { cluster.rotation.z = Math.sin(t * 1.3) * 0.07; cluster.rotation.x = Math.sin(t * 0.9 + 1) * 0.05; });
  addBush(-1.1, 1.05, 0.9, p);
  flowerPatch(def.x + 1.2, def.z + 1.2, 7, 0.25);
  finishBuilding(def, stall);
}

/* =========================================================
 * 11. 組裝整座島
 * ========================================================= */
async function buildWorld() {
  await Promise.all(['suburban', 'commercial', 'fantasy', 'pirate'].map(async k => { kitImg[k] = await new THREE.ImageLoader().loadAsync(KIT + k + '/Textures/colormap.png'); }));

  // 路：主幹道（東西向，通到碼頭）＋ 各建築支線
  pathRect(-6.35, -0.5, 7.0, 0.5, 0.05);
  for (const x of [-4, 0, 4]) { pathRect(x - 0.42, -1.75, x + 0.42, -0.5, 0.042); pathRect(x - 0.42, 0.5, x + 0.42, 1.75, 0.042); }
  occupy(-6, 6, 0, 0);
  for (const x of [-4, 0, 4]) { occupy(x, x, -1, -1); occupy(x, x, 1, 1); }
  // 建築佔地
  for (const b of BUILDINGS) occupy(b.x - 1, b.x + 1, b.z - 1, b.z + 1);
  occupy(-1, -1, -1, -1); occupy(1, 1, -1, -1);   // 點餐店前的陽傘桌

  const builders = { fish: buildFish, shop: buildShop, blocks: buildBlocks, treasure: buildTreasure, cards: buildCards, balloon: buildBalloon };
  await Promise.all(BUILDINGS.map(b => builders[b.id](b)));

  // 路燈（深綠桿、暖黃燈罩）
  const LAMP_TINT = [[1, 2, '#3e7d68'], [7, 3, '#356b59'], [2, 2, '#fff0b3']];
  const lamps = [[-6, -0.82, -1], [-2, 0.82, 1], [2, -0.82, -1], [6, 0.82, 1]];
  await Promise.all(lamps.map(([x, z, j]) => kenney('fantasy', 'lantern', { scale: 0.82, x, z, tints: LAMP_TINT }).then(() => occ.add(key(x, j)))));

  // 樹（圓圓的）
  const TREES = [[-6, -3, 0], [-6, -2, 1], [-6, 2, 0], [-6, 3, 2], [-2, -4, 0], [-2, -3, 1], [2, -4, 2], [2, -2, 0], [-3, -5, 0], [1, -5, 1], [5, -5, 0],
    [6, -3, 1], [6, 3, 0], [-2, 4, 3], [2, 3, 0], [-1, 5, 0], [3, 5, 2], [-5, 5, 1], [6, -2, 0]];
  for (const [i, j, v] of TREES) if (cellFree(i, j)) addTree(i, j, v, 0.9 + Math.random() * 0.25);

  // 花
  flowerPatch(-2, -1.1, 6, 0.3); flowerPatch(5.3, 1.15, 6, 0.3); flowerPatch(-5.5, 1.2, 6, 0.3);
  const fGeo = new THREE.IcosahedronGeometry(0.075, 0);
  const flowers = new THREE.InstancedMesh(fGeo, new THREE.MeshLambertMaterial(), flowerSpots.length);
  const m4 = new THREE.Matrix4();
  flowerSpots.forEach(([x, z], k) => {
    m4.makeTranslation(x, 0.07 + Math.random() * 0.04, z);
    flowers.setMatrixAt(k, m4);
    flowers.setColorAt(k, _c.set(FLOWER_COLORS[k % FLOWER_COLORS.length]));
  });
  flowers.castShadow = true;
  scene.add(flowers);
}

/* =========================================================
 * 12. 相機縮放：橫式/直式都看得見整座島
 * ========================================================= */
const fitPts = [];
function collectFitPoints() {
  fitPts.length = 0;
  for (let k = 0; k < 64; k++) {
    const a = k / 64 * Math.PI * 2;
    // 水岸線（圓角矩形）取樣
    const { hx, hz, r } = WATERLINE;
    const cx = Math.cos(a), cz = Math.sin(a);
    const px = Math.sign(cx) * (hx - r) + cx * r, pz = Math.sign(cz) * (hz - r) + cz * r;
    fitPts.push(new THREE.Vector3(px, SEA_Y, pz));
  }
  for (const b of BUILDINGS) {
    const { min, max } = b.box;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) fitPts.push(new THREE.Vector3(x, y, z));
    fitPts.push(new THREE.Vector3(b.anchor.x, b.topY + 1.15, b.anchor.z));
  }
}
const _v = new THREE.Vector3();
function fitCamera() {
  const W = window.innerWidth, H = window.innerHeight, aspect = W / H;
  camera.updateMatrixWorld();
  const inv = camera.matrixWorldInverse;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of fitPts) { _v.copy(p).applyMatrix4(inv); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
  const portrait = aspect < 1;
  const padTop = portrait ? 0.1 : 0.13, padBot = portrait ? 0.1 : 0.11, padX = 0.025;
  const availH = 1 - padTop - padBot, availW = 1 - 2 * padX;
  const halfH = Math.max((y1 - y0) / availH, (x1 - x0) / (aspect * availW)) / 2;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const frac = padBot + availH / 2;
  camera.left = cx - halfH * aspect; camera.right = cx + halfH * aspect;
  camera.bottom = cy - frac * 2 * halfH; camera.top = camera.bottom + 2 * halfH;
  camera.updateProjectionMatrix();
}
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const pr = renderer.getPixelRatio();
  seaUniforms.uRes.value.set(window.innerWidth * pr, window.innerHeight * pr);
  if (fitPts.length) fitCamera();
}
window.addEventListener('resize', onResize);
onResize();

/* =========================================================
 * 13. 互動：點建築彈跳＋名牌、種樹模式
 * ========================================================= */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const nameCard = document.getElementById('nameCard');
const plantBtn = document.getElementById('plantBtn');
let activeCard = null, cardTimer = 0, plantMode = false;

function toScreen(v) { _v.copy(v).project(camera); return { x: (_v.x + 1) / 2 * window.innerWidth, y: (1 - _v.y) / 2 * window.innerHeight }; }

function bounce(def) {
  const start = performance.now();
  const piv = def.pivot;
  anims.add({ update(now) {
    const t = Math.min(1, (now - start) / 650);
    const jump = Math.sin(Math.PI * Math.min(1, t * 1.25)) * 0.42 * (t < 0.8 ? 1 : 0);
    const sq = Math.sin(t * Math.PI * 3) * 0.13 * (1 - t);
    piv.position.y = Math.max(0, jump);
    piv.scale.set(1 - sq * 0.6, 1 + sq, 1 - sq * 0.6);
    if (t >= 1) { piv.position.y = 0; piv.scale.set(1, 1, 1); return false; }
    return true;
  } });
}
function showCard(def) {
  activeCard = def;
  nameCard.querySelector('.nc-ico').textContent = def.ico;
  nameCard.querySelector('.nc-word').innerHTML = zyHTML(def.hz, def.zy);
  nameCard.hidden = false;
  nameCard.classList.remove('pop'); void nameCard.offsetWidth; nameCard.classList.add('pop');
  def.bubble.visible = false;
  clearTimeout(cardTimer);
  cardTimer = setTimeout(hideCard, 4500);
  placeCard();
}
function hideCard() {
  if (activeCard) activeCard.bubble.visible = true;
  activeCard = null; nameCard.hidden = true; clearTimeout(cardTimer);
}
const _a = new THREE.Vector3();
function placeCard() {
  if (!activeCard) return;
  const d = activeCard;
  _a.copy(d.anchor); _a.y = d.topY + 0.35 + d.pivot.position.y;
  const s = toScreen(_a);
  const w = nameCard.offsetWidth, h = nameCard.offsetHeight, m = 8, tail = 14;
  const x = Math.min(Math.max(s.x - w / 2, m), window.innerWidth - w - m);
  const y = Math.max(s.y - h - tail, m);
  nameCard.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}

function setPlantMode(on) {
  plantMode = on;
  plantBtn.classList.toggle('on', on);
  plantBtn.setAttribute('aria-pressed', String(on));
  if (on) hideCard();
  const from = gridUniforms.uOpacity.value, to = on ? 1 : 0, start = performance.now();
  anims.add({ update(now) { const t = Math.min(1, (now - start) / 300); gridUniforms.uOpacity.value = from + (to - from) * t; return t < 1; } });
}
plantBtn.addEventListener('click', () => setPlantMode(!plantMode));

// 格子閃爍提示（綠＝可以種、紅＝不行）
const flashGeo = new THREE.PlaneGeometry(0.9, 0.9); flashGeo.rotateX(-Math.PI / 2);
function flashCell(i, j, ok) {
  const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: ok ? '#9dff7a' : '#ff6b6b', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
  m.position.set(i, 0.07, j); m.renderOrder = 3; scene.add(m);
  const start = performance.now();
  anims.add({ update(now) {
    const t = Math.min(1, (now - start) / 550);
    m.material.opacity = 0.7 * (1 - t);
    if (!ok) m.position.x = i + Math.sin(t * 30) * 0.06 * (1 - t);
    if (t >= 1) { scene.remove(m); m.material.dispose(); return false; }
    return true;
  } });
}
const plantedTrees = [];
const ringGeo = new THREE.RingGeometry(0.28, 0.4, 28); ringGeo.rotateX(-Math.PI / 2);
function plantTree(i, j) {
  const variants = [0, 0, 1, 2, 3];
  const v = variants[Math.floor(Math.random() * variants.length)];
  const tree = addTree(i, j, v, 1);
  const target = 0.95 + Math.random() * 0.2;
  tree.scale.setScalar(0.001);
  plantedTrees.push(tree);
  const start = performance.now();
  // 從小長大（彈性）
  anims.add({ update(now) { const t = Math.min(1, (now - start) / 750); tree.scale.setScalar(Math.max(0.001, target * easeOutElastic(t))); return t < 1; } });
  // 地上一圈白色波紋
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  ring.position.set(i, 0.06, j); scene.add(ring);
  anims.add({ update(now) { const t = Math.min(1, (now - start) / 600); ring.scale.setScalar(1 + t * 1.6); ring.material.opacity = 0.9 * (1 - t); if (t >= 1) { scene.remove(ring); ring.material.dispose(); return false; } return true; } });
  // 小葉子噴出
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.Mesh(LEAF_GEO, vcMat);
    const a = k / 7 * Math.PI * 2 + Math.random() * 0.4, sp = 1.2 + Math.random() * 0.8, vy = 2.6 + Math.random() * 1.2;
    leaf.position.set(i, 0.3, j); scene.add(leaf);
    anims.add({ update(now) {
      const t = (now - start) / 1000, k2 = Math.min(1, t / 0.7);
      leaf.position.set(i + Math.cos(a) * sp * t, 0.3 + vy * t - 6 * t * t, j + Math.sin(a) * sp * t);
      leaf.scale.setScalar(1 - k2);
      if (k2 >= 1) { scene.remove(leaf); return false; }
      return true;
    } });
  }
}
const LEAF_GEO = paint(new THREE.IcosahedronGeometry(0.07, 0), '#8fdc6c');

raycaster.params.Line.threshold = 0.02;   // 預設 1 單位太寬，細線（氣球繩、釣魚線）會擋住一大片
function cellBlocked(groundHit) {
  const groundDist = raycaster.ray.origin.distanceTo(groundHit);
  const bh = raycaster.intersectObjects(BUILDINGS.map(b => b.pivot), true).filter(h => h.object.isMesh);
  return bh.length > 0 && bh[0].distance < groundDist - 0.05;
}
function handleTap(cx, cy) {
  ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (plantMode) {
    const hit = raycaster.ray.intersectPlane(groundPlane, _v);
    if (!hit) return;
    const i = Math.round(hit.x), j = Math.round(hit.z);
    if (sdRoundBox(hit.x, hit.z, ISL.hx, ISL.hz, ISL.r) > 0) return;   // 點到海
    // 點到建築本體（擋在前面）→ 不要種到建築後面看不到的格子
    if (cellBlocked(hit)) return;
    if (cellFree(i, j)) { flashCell(i, j, true); plantTree(i, j); }
    else flashCell(i, j, false);
    return;
  }
  const hits = raycaster.intersectObjects(hitBoxes, false);
  if (hits.length) { const def = hits[0].object.userData.def; bounce(def); showCard(def); }
  else hideCard();
}
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || down.id !== e.pointerId) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved < 14) handleTap(e.clientX, e.clientY);
});
renderer.domElement.addEventListener('pointercancel', () => { down = null; });

/* =========================================================
 * 14. 主迴圈
 * ========================================================= */
function loop(ms) {
  const t = ms / 1000;
  seaUniforms.uTime.value = t;
  gridUniforms.uTime.value = t;
  for (const f of tickers) f(t);
  for (const sp of bubbles) sp.position.y = sp.userData.baseY + Math.sin(t * 1.8 + sp.userData.phase) * 0.07;
  for (const a of anims) if (a.update(ms) === false) anims.delete(a);
  if (activeCard) placeCard();
  renderer.render(scene, camera);
}

buildWorld().then(() => {
  collectFitPoints();
  fitCamera();
  renderer.setAnimationLoop(loop);
  requestAnimationFrame(() => document.getElementById('loading').classList.add('done'));
  window.__iso.ready = true;
}).catch(err => {
  console.error('[iso-demo] 載入失敗', err);
  document.getElementById('loading').classList.add('done');
  document.getElementById('fail').hidden = false;
});

// 測試用掛鉤（headless 截圖驗證）
window.__iso = {
  ready: false,
  buildingScreen(id) { const d = BUILDINGS.find(b => b.id === id); return toScreen(new THREE.Vector3(d.anchor.x, d.topY * 0.45, d.anchor.z)); },
  cellScreen(i, j) { return toScreen(new THREE.Vector3(i, 0, j)); },
  freeCells() { const out = []; for (let i = -6; i <= 6; i++) for (let j = -5; j <= 5; j++) if (cellFree(i, j)) out.push([i, j]); return out; },
  // 從鏡頭看得到（沒被建築擋住）的空格
  visibleFreeCells() {
    return this.freeCells().filter(([i, j]) => {
      _v.set(i, 0, j).project(camera); ndc.set(_v.x, _v.y);
      raycaster.setFromCamera(ndc, camera);
      return !cellBlocked(new THREE.Vector3(i, 0, j));
    });
  },
  treeCount: () => plantedTrees.length,
  stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, pixelRatio: renderer.getPixelRatio() }),
  setPlantMode,
};
