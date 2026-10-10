// 3D 背景工作站：跟選單小島（js/zhuyin-hub3d.js）同一套色票、光線、島嶼／水面做法，預先渲染各遊戲背景
// 網址：bg.html?bg=<名稱>&o=L|P　完成 → window.__done=true
// 座標：鏡頭固定從 +z 方向往 -z 看（x＝畫面往右、z＝往前／往下）；物件自己轉 45° 做出等角感。
// 這樣岸線、桌面、空地的位置可以直接用畫面座標規劃（遊戲元件要壓在空的地方）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const Q = new URLSearchParams(location.search);
const BG = Q.get('bg') || 'pond', L = Q.get('o') !== 'P';
const W = innerWidth, H = innerHeight;
const D2R = Math.PI / 180, ISO = Math.PI / 4;

// ---------- 色票（同 hub3d／docs/zhuyin-3d-plan.md）----------
const P = { deep: '#3f97c9', grid: '#5fa9d6', shallow: '#7fcfd0', sand: '#ecd7a3', dirt: '#a8673f', dirtDk: '#7d4a2e', grass: '#86c449', grassDk: '#5f9c3a',
  plaza: '#ddd8cf', road: '#bdb8b1', purple: '#8b70cc', purpleDk: '#5e4aa8', cream: '#f0e7d3', eave: '#2f6b50', pink: '#f2808f', autumn: '#f08a3c', wood: '#c98a55' };
const SEA_Y = -0.95, SAND = { pad: 0.6, slope: 0.7 };

function fail(msg) { document.getElementById('err').textContent = msg; window.__error = msg; throw new Error(msg); }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rand = rng(11);

const scene = new THREE.Scene();
let PARENT = scene;                                   // 新物件預設加到這裡（可以整組位移）
const _c = new THREE.Color(), _v = new THREE.Vector3();

// ---------- 基本小工具（複製自 hub3d）----------
function paint(geo, hex) {
  _c.set(hex); const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return geo;
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
const matCache = new Map();
function mat(hex, extra) {
  const k = hex + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color: hex, ...extra }));
  return matCache.get(k);
}
const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function mesh(geo, m, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, shadow = true, parent = PARENT } = {}) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
}
// 往下長的圓角板：頂面在 top，厚 depth
function slab({ hx, hz, r, top, depth, color, bevelT = 0, bevelS = 0, inset = true, seg = 3, x = 0, z = 0 }) {
  r = Math.max(0.05, Math.min(r, hx - 0.01, hz - 0.01));
  const geo = new THREE.ExtrudeGeometry(rrShape(hx, hz, r), { depth, curveSegments: 18, bevelEnabled: bevelT > 0, bevelThickness: bevelT, bevelSize: bevelS, bevelOffset: inset ? -bevelS : 0, bevelSegments: seg });
  geo.rotateX(Math.PI / 2); geo.translate(x, top - bevelT, z);
  const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color); m.receiveShadow = true; PARENT.add(m); return m;
}
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function stripeTex(a, b, n = 6) {
  const t = canvasTex(256, 64, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; for (let i = 1; i < n * 2; i += 2) g.fillRect(i * w / n / 2, 0, w / n / 2, h); });
  t.wrapS = THREE.RepeatWrapping; return t;
}

// ---------- 小島板塊：草地 → 土壁兩層 → 沙灘（同 hub 的 buildIsland）；水面 shader 會讀 lands 算淺水與浪花 ----------
const lands = [];
function land(x, z, hx, hz, r, { grass = P.grass, beach = true } = {}) {
  slab({ hx, hz, r, top: 0, depth: 0.12, color: grass, bevelT: 0.05, bevelS: 0.05, x, z });
  slab({ hx: hx - 0.04, hz: hz - 0.04, r: r - 0.04, top: -0.1, depth: 0.34, color: P.dirt, x, z }).castShadow = true;
  slab({ hx: hx - 0.06, hz: hz - 0.06, r: r - 0.06, top: -0.44, depth: 0.6, color: P.dirtDk, x, z });
  if (beach) slab({ hx: hx + SAND.pad, hz: hz + SAND.pad, r: r + SAND.pad, top: -0.66, depth: 0.7, color: P.sand, bevelT: 0.3, bevelS: SAND.slope, inset: false, seg: 4, x, z });
  const e = beach ? SAND.pad + SAND.slope * 0.75 : 0;
  lands.push({ x: x + PARENT.position.x, z: z + PARENT.position.z, hx: hx + e, hz: hz + e, r: r + e });
}
// 水面：深水＋淺水＋等角格線＋浪花（hub 的 sea shader，時間固定）
function water({ deep = P.deep, shallow = P.shallow, grid = '#7cbde3', gridA = 0.55, spark = 0.3, t = 3.0, y = SEA_Y } = {}) {
  const N = Math.min(8, lands.length), LV = [], LR = [];
  for (let i = 0; i < 8; i++) { const l = lands[i] || { x: 0, z: 0, hx: 0, hz: 0, r: 0 }; LV.push(new THREE.Vector4(l.x, l.z, l.hx, l.hz)); LR.push(l.r); }
  const u = { uT: { value: t }, uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) }, uGrid: { value: new THREE.Color(grid) }, uGridA: { value: gridA }, uSpark: { value: spark }, uL: { value: LV }, uR: { value: LR }, uN: { value: N } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, toneMapped: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float uT; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uGrid; uniform float uGridA; uniform float uSpark;
      uniform vec4 uL[8]; uniform float uR[8]; uniform int uN;
      varying vec3 vW;
      float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 p = vW.xz;
        float d = 1e3;
        for (int i = 0; i < 8; i++) { if (i >= uN) break; d = min(d, sdRB(p - uL[i].xy, uL[i].zw, uR[i])); }
        float shallow = 1.0 - smoothstep(0.0, 2.6, d);
        vec3 col = mix(uDeep, uShallow, shallow);
        vec2 q = vec2(p.x - p.y, p.x + p.y) * 0.7071;            // 格線轉 45°＝跟選單一樣的等角斜線
        vec2 gp = q * 0.5; vec2 f = abs(fract(gp + 0.5) - 0.5); vec2 fw = fwidth(gp) * 1.2;
        float line = 1.0 - min(smoothstep(0.0, fw.x, f.x), smoothstep(0.0, fw.y, f.y));
        col = mix(col, uGrid, line * uGridA * (1.0 - shallow));
        vec2 cp = q / 4.0 + vec2(uT * 0.02, 0.0); vec2 id = floor(cp); vec2 fc = fract(cp) - 0.5;
        float h = hash(id); vec2 o = vec2(h - 0.5, fract(h * 7.31) - 0.5) * 0.5;
        vec2 e = fc - o; e = vec2(e.x + e.y, e.y - e.x) * vec2(1.0, 4.0);
        float spark = smoothstep(0.1, 0.06, length(e)) * step(0.5, h) * (0.55 + 0.45 * sin(uT * 0.9 + h * 30.0));
        col = mix(col, vec3(1.0), spark * uSpark * (1.0 - shallow));
        float w1 = 0.14 + 0.06 * sin(uT * 1.3 + p.x * 0.8 + p.y * 0.6);
        float foam = smoothstep(w1 + 0.1, w1, d) * smoothstep(-0.25, -0.05, d);
        float d2 = d - (0.7 + 0.16 * sin(uT * 0.9 + p.x * 0.5 - p.y * 0.4));
        float foam2 = (1.0 - smoothstep(0.0, 0.07, abs(d2))) * 0.5;
        col = mix(col, vec3(1.0), clamp(foam * 0.9 + foam2, 0.0, 1.0) * step(-0.25, d));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), m);
  sea.rotation.x = -Math.PI / 2; sea.position.y = y; scene.add(sea); return sea;
}

// ---------- 程式生成：樹、灌木、花（同 hub）----------
function blob(r, x, y, z, hex, detail = 1) { const g = new THREE.IcosahedronGeometry(r, detail); g.translate(x, y, z); return paint(g, hex); }
function trunk(h) { const g = new THREE.CylinderGeometry(0.06, 0.095, h, 7).toNonIndexed(); g.translate(0, h / 2, 0); return paint(g, '#9a6a48'); }
const TREE_GEOS = [
  mergeGeometries([trunk(0.55), blob(0.46, 0, 0.95, 0, '#7cc25a'), blob(0.32, 0.22, 1.24, 0.1, '#93d06c'), blob(0.3, -0.2, 1.15, -0.12, '#6ab24f')]),
  mergeGeometries([trunk(0.5), blob(0.42, 0, 0.86, 0, '#5f9c3a'), blob(0.33, 0.02, 1.26, 0.02, '#74b347'), blob(0.21, 0, 1.56, 0, '#86c449')]),
  mergeGeometries([trunk(0.5), blob(0.44, 0, 0.9, 0, P.autumn), blob(0.3, 0.2, 1.17, 0.07, '#f7a257'), blob(0.28, -0.18, 1.1, -0.1, '#e57a2c')]),
  mergeGeometries([trunk(0.35), paint(new THREE.ConeGeometry(0.42, 0.75, 7).translate(0, 0.72, 0).toNonIndexed(), '#4f8f3a'), paint(new THREE.ConeGeometry(0.32, 0.6, 7).translate(0, 1.1, 0).toNonIndexed(), '#5fa346')]),
];
const BUSH_GEO = mergeGeometries([blob(0.22, 0, 0.17, 0, '#6cb455'), blob(0.17, 0.19, 0.13, 0.05, '#80c463'), blob(0.15, -0.17, 0.12, -0.05, '#5aa64a')]);
function tree(x, z, v = 0, s = 1, y = 0) { const t = mesh(TREE_GEOS[v], vcMat, { x, y, z, ry: rand() * 6.28 }); t.scale.setScalar(s); return t; }
function bush(x, z, s = 1, y = 0) { const b = mesh(BUSH_GEO, vcMat, { x, y, z, ry: rand() * 6.28 }); b.scale.setScalar(s); return b; }
const flowerSpots = [];
const FLOWER_COLORS = ['#ff8fb1', '#ffffff', '#ffd75e', '#ff6f7d', '#c9a2ff'];
function flowers(x, z, n = 7, spread = 0.3, y = 0) { for (let k = 0; k < n; k++) flowerSpots.push([x + (rand() - 0.5) * spread * 2, y, z + (rand() - 0.5) * spread * 2]); }
function finishFlowers(size = 0.07) {
  if (!flowerSpots.length) return;
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(size, 0), new THREE.MeshLambertMaterial(), flowerSpots.length), m4 = new THREE.Matrix4();
  flowerSpots.forEach(([x, y, z], k) => { m4.makeTranslation(x, y + size + rand() * size * 0.6, z); im.setMatrixAt(k, m4); im.setColorAt(k, _c.set(FLOWER_COLORS[k % FLOWER_COLORS.length])); });
  im.castShadow = true; scene.add(im);
}
// 一排樹／灌木（沿 x 散布，z 有點亂）
function treeRow(x0, x1, z, { gap = 1.1, jit = 0.5, s = [0.95, 1.3], y = 0, bushes = 0.35, kinds = [0, 0, 1, 1, 2, 3] } = {}) {
  for (let x = x0; x <= x1; x += gap * (0.8 + rand() * 0.4)) {
    const zz = z + (rand() - 0.5) * jit * 2;
    tree(x, zz, kinds[Math.floor(rand() * kinds.length)], s[0] + rand() * (s[1] - s[0]), y);
    if (rand() < bushes) bush(x + 0.5, zz + 0.6, 0.9 + rand() * 0.5, y);
  }
}
// 低多邊形荷葉（同渲染工作站的 lilypad）
function lily(x, z, s = 1, y = SEA_Y + 0.02, ry = 0, top = '#7cc650', side = '#4f9a36') {
  const a = 45 * D2R, n = 0.3, sh = new THREE.Shape(); sh.moveTo(0, 0); sh.absarc(0, 0, 1, a + n, a - n + Math.PI * 2, false); sh.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, curveSegments: 14, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  const o = mesh(geo, [mat(top, { flatShading: true }), mat(side, { flatShading: true })], { x, y, z, ry, shadow: false }); o.scale.set(s, 1, s); return o;
}

// ---------- Kenney 模型（讀 IMAGE/_src/iso/kits 原檔；nature/furniture 套件的色值要轉 sRGB）----------
const KITROOT = '../../IMAGE/_src/iso/kits/';
const KIT_DIR = { 'nature-kit': 'GLTF format', 'furniture-kit': 'GLTF format' };
const SRGB_FIX = new Set(['nature-kit', 'furniture-kit']);
const loader = new GLTFLoader(), glbs = new Map();
function loadGLB(url) { if (!glbs.has(url)) glbs.set(url, loader.loadAsync(url).catch(e => fail('載入失敗 ' + url))); return glbs.get(url); }
function convMat(m, k, tint) {
  let color = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
  if (SRGB_FIX.has(k) && !m.map) color.convertSRGBToLinear();
  if (tint && tint[m.name]) color = new THREE.Color(tint[m.name]);
  if (m.map) { m.map.generateMipmaps = false; m.map.minFilter = m.map.magFilter = THREE.LinearFilter; }
  return new THREE.MeshLambertMaterial({ map: m.map || null, color, vertexColors: !!m.vertexColors, side: m.side, transparent: !!m.transparent, opacity: m.opacity ?? 1 });
}
async function kit(path, { tint, s, h, w, x = 0, y = 0, z = 0, ry = 0, parent = PARENT } = {}) {
  const [k, n] = path.split('/');
  const g = await loadGLB(`${KITROOT}${k}/Models/${KIT_DIR[k] || 'GLB format'}/${n}.glb`);
  const o = g.scene.clone(true);
  o.traverse(c => { if (c.isMesh) { c.material = Array.isArray(c.material) ? c.material.map(m => convMat(m, k, tint)) : convMat(c.material, k, tint); c.castShadow = c.receiveShadow = true; } });
  if (h || w) { const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()); o.scale.setScalar(h ? h / sz.y : w / Math.max(sz.x, sz.z)); }
  else if (s) o.scale.setScalar(s);
  const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
  o.position.x -= c.x; o.position.z -= c.z; o.position.y -= b.min.y;
  const hold = new THREE.Group(); hold.add(o); hold.position.set(x, y, z); hold.rotation.y = ry; parent.add(hold); return hold;
}

// ---------- 鏡頭與光（光同 hub：半球光＋左上方太陽、柔和陰影）----------
let camera, sun;
function setup({ el = 38, width, cx = 0, cy = 0, cz = 0, sunDir = [-9.2, 15, -0.7], clear = P.deep, shadow = 0.75 }) {
  const e = el * D2R, hw = width / 2, hh = width * H / W / 2, tgt = new THREE.Vector3(cx, cy, cz);
  camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 300);
  camera.position.copy(tgt).add(new THREE.Vector3(0, Math.sin(e), Math.cos(e)).multiplyScalar(100));
  camera.lookAt(tgt); camera.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight(0xf4f9ff, 0xe9dcc6, 1.5));
  sun = new THREE.DirectionalLight(0xfff4e4, 2.2);
  const dir = new THREE.Vector3(...sunDir).normalize();
  sun.position.copy(tgt).addScaledVector(dir, 60); sun.target.position.copy(tgt);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  const R = Math.max(hw, hh / Math.sin(e)) + 6;
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 140 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3; sun.shadow.intensity = shadow;
  scene.add(sun, sun.target);
  return { clear };
}
// 畫面座標 → 地面座標（sx,sy 是 0~1 的畫面比例；回傳 y=gy 平面上的 x,z）
function at(sx, sy, gy = 0) {
  _v.set(sx * 2 - 1, 1 - sy * 2, 0).unproject(camera);
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const t = (gy - _v.y) / dir.y; return [_v.x + dir.x * t, _v.z + dir.z * t];
}

// ---------- 場景用小物 ----------
function ground(color, { y = 0, size = 300, map = null, ry = 0 } = {}) {
  const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2);
  return mesh(g, map ? new THREE.MeshLambertMaterial({ map, color }) : mat(color), { y, ry, shadow: false });
}
function plankTex(base, seam, n = 8, vary = 0.06) {
  const t = canvasTex(512, 512, (g, w, h) => {
    const ph = h / n;
    for (let i = 0; i < n; i++) {
      _c.set(base).offsetHSL(0, 0, (rand() - 0.5) * vary); g.fillStyle = '#' + _c.getHexString(); g.fillRect(0, i * ph, w, ph);
      g.fillStyle = seam; g.fillRect(0, i * ph, w, Math.max(2, ph * 0.05));
      for (const off of [rand() * w * 0.5, w * 0.5 + rand() * w * 0.5]) g.fillRect(off, i * ph, 3, ph);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function stripes2Tex(a, b, n = 8) {
  const t = canvasTex(256, 256, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; for (let i = 0; i < n; i += 2) g.fillRect(i * w / n, 0, w / n, h); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function ginghamTex(a, b, n = 8) {
  const t = canvasTex(256, 256, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; const s = w / n; for (let i = 0; i < n; i += 2) { g.fillRect(i * s, 0, s, h); g.fillRect(0, i * s, w, s); } });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// 彎曲小徑（平的帶子：外緣深一點、內面淺一點）
function pathRibbon(pts, width, top, edge, y = 0.02) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const strip = (wd, yy, color) => {
    const N = 160, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const p = curve.getPoint(i / N), t = curve.getTangent(i / N), l = Math.hypot(t.x, t.z), nx = -t.z / l, nz = t.x / l;
      pos.push(p.x + nx * wd / 2, yy, p.z + nz * wd / 2, p.x - nx * wd / 2, yy, p.z - nz * wd / 2);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    mesh(g, mat(color, { side: THREE.DoubleSide }), { shadow: false });
  };
  strip(width + 0.24, y, edge); strip(width, y + 0.012, top);
}
const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#eef6ff', emissiveIntensity: 0.32 });
function cloud(x, y, z, s = 1, n = 5) {
  const parts = [];
  for (let i = 0; i < n; i++) { const c = i - (n - 1) / 2, r = (0.55 + rand() * 0.3) * (1.25 - Math.abs(c) * 0.18); parts.push(blob(r, c * 0.72 + (rand() - 0.5) * 0.2, (1.25 - Math.abs(c) * 0.3) * 0.35 + rand() * 0.15, (rand() - 0.5) * 0.4, '#ffffff', 1)); }
  const g = mergeGeometries(parts); g.scale(1, 0.78, 0.7);
  const o = mesh(g, cloudMat, { x, y, z, shadow: false }); o.scale.setScalar(s); return o;
}
function sunflower(x, z, h = 1.7, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = (rand() - 0.5) * 0.6; PARENT.add(g);
  mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 6), mat('#5f9c3a'), { y: h / 2, parent: g });
  for (const [yy, sg] of [[h * 0.38, 1], [h * 0.6, -1]]) { const lf = mesh(new THREE.SphereGeometry(0.17, 6, 4), mat('#6cb455', { flatShading: true }), { x: sg * 0.15, y: yy, parent: g }); lf.scale.set(1.3, 0.3, 0.7); lf.rotation.z = -sg * 0.45; }
  const head = new THREE.Group(); head.position.y = h; head.rotation.x = 0.85; g.add(head);   // 花盤朝前上方（對著鏡頭）
  mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.09, 12), mat('#7a4a2e', { flatShading: true }), { y: 0.04, parent: head });
  for (let i = 0; i < 12; i++) { const piv = new THREE.Group(); piv.rotation.y = i / 12 * Math.PI * 2; head.add(piv); const pt = mesh(new THREE.ConeGeometry(0.09, 0.26, 4), mat(i % 2 ? '#ffd23f' : '#f6c445', { flatShading: true }), { x: 0.3, parent: piv }); pt.rotation.z = -Math.PI / 2; pt.scale.set(1, 1, 0.4); }
  return g;
}
function reeds(x, z, n = 5, y = 0, s = 1) {
  for (let i = 0; i < n; i++) {
    const h = (0.55 + rand() * 0.5) * s, xx = x + (rand() - 0.5) * 0.6 * s, zz = z + (rand() - 0.5) * 0.4 * s, tilt = (rand() - 0.5) * 0.25;
    mesh(new THREE.CylinderGeometry(0.018 * s, 0.025 * s, h, 5), mat('#5f9c3a'), { x: xx, y: y + h / 2, z: zz, rz: tilt });
    if (rand() < 0.6) mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.2 * s, 6), mat('#8a5a3c'), { x: xx - Math.sin(tilt) * h * 0.4, y: y + h * 0.88, z: zz, rz: tilt });
    const lf = mesh(new THREE.ConeGeometry(0.05 * s, h * 0.7, 4), mat('#74b347', { flatShading: true }), { x: xx + 0.08 * s, y: y + h * 0.35, z: zz + 0.05, rz: -0.35 }); lf.scale.set(1, 1, 0.3);
  }
}
function rock(x, z, s = 1, y = 0) { return kit(rand() < 0.5 ? 'nature-kit/stone_smallA' : 'nature-kit/stone_smallC', { w: 0.7 * s, x, y, z, ry: rand() * 6.28, tint: { stone: '#c9c3ba', stoneDark: '#a8a097' } }); }
// 玩具積木
const TOY = ['#f2808f', '#f6c445', '#5fa9d6', '#86c449', '#8b70cc', '#f08a3c'];
function toy(kind, x, z, c, s = 0.7, ry = 0, y = 0) {
  let geo;
  if (kind === 'cube') geo = new RoundedBoxGeometry(s, s, s, 2, s * 0.1);
  else if (kind === 'brick') geo = new RoundedBoxGeometry(s * 1.7, s * 0.55, s * 0.8, 2, s * 0.08);
  else if (kind === 'cyl') geo = new THREE.CylinderGeometry(s * 0.4, s * 0.4, s * 1.1, 14);
  else if (kind === 'tri' || kind === 'arch') {
    const sh = new THREE.Shape();
    if (kind === 'tri') { sh.moveTo(-s * 0.6, 0); sh.lineTo(s * 0.6, 0); sh.lineTo(0, s * 0.75); sh.lineTo(-s * 0.6, 0); }
    else { sh.moveTo(-s * 0.8, 0); sh.lineTo(-s * 0.4, 0); sh.absarc(0, 0, s * 0.4, Math.PI, 0, true); sh.lineTo(s * 0.8, 0); sh.lineTo(s * 0.8, s * 0.75); sh.lineTo(-s * 0.8, s * 0.75); sh.lineTo(-s * 0.8, 0); }
    geo = new THREE.ExtrudeGeometry(sh, { depth: s * 0.6, bevelEnabled: true, bevelThickness: s * 0.04, bevelSize: s * 0.04, bevelSegments: 2, curveSegments: 10 }); geo.translate(0, 0, -s * 0.3);
  }
  geo.computeBoundingBox(); geo.translate(0, -geo.boundingBox.min.y, 0);
  return mesh(geo, mat(c), { x, y, z, ry });
}
// 等角房間：牆角在 (cx, cz)，左牆往左前、右牆往右前延伸
const dA = new THREE.Vector3(-1, 0, 1).normalize(), dB = new THREE.Vector3(1, 0, 1).normalize();
function room(cx, cz, { left, right, hgt = 4.6, len = 30, base = '#e2b98a' }) {
  const C = new THREE.Vector3(cx, 0, cz), T = 0.25;
  for (const [d, n, col, ry] of [[dA, dB, left, ISO], [dB, dA, right, -ISO]]) {
    const c = C.clone().addScaledVector(d, len / 2).addScaledVector(n, -T / 2);
    mesh(new THREE.BoxGeometry(len, hgt, T), mat(col, { emissive: col, emissiveIntensity: 0.42 }), { x: c.x, y: hgt / 2, z: c.z, ry });   // 牆是直立面、受光少，補一點自發光才不會灰
    const b = C.clone().addScaledVector(d, len / 2).addScaledVector(n, 0.03);
    mesh(new THREE.BoxGeometry(len, 0.28, 0.08), mat(base), { x: b.x, y: 0.14, z: b.z, ry, shadow: false });
  }
  return C;
}
// 牆上某點：沿牆 d 方向距牆角 s、離牆 off
const onWall = (C, d, n, s, off = 0) => C.clone().addScaledVector(d, s).addScaledVector(n, off);
function windowOn(C, d, n, s, y, ry, w = 1.7, h = 1.4) {
  const p = onWall(C, d, n, s, 0.05);
  mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.08), mat('#ffffff'), { x: p.x, y, z: p.z, ry });
  const g = onWall(C, d, n, s, 0.1);
  mesh(new THREE.BoxGeometry(w, h, 0.04), mat('#bfe3f3'), { x: g.x, y, z: g.z, ry, shadow: false });
  mesh(new THREE.BoxGeometry(0.08, h, 0.06), mat('#ffffff'), { x: g.x, y, z: g.z, ry, shadow: false });
  mesh(new THREE.BoxGeometry(w, 0.08, 0.06), mat('#ffffff'), { x: g.x, y, z: g.z, ry, shadow: false });
}

// =========================================================
// 各背景
// =========================================================
const SCENES = {};
const E = SAND.pad + SAND.slope * 0.75;      // 草地邊到水岸線的距離

// 釣魚：中下大片水面；上方是岸（左右兩段往前凸、樹叢在兩側，中間只留草地和花）；碼頭、小船、荷葉在邊緣
SCENES.pond = async () => {
  const cfg = setup({ el: 38, width: L ? 19 : 11.5, cy: SEA_Y });
  const [, zs] = at(0.5, L ? 0.22 : 0.17, SEA_Y), zf = zs - E;
  const [xl] = at(L ? 0.2 : 0.2, 0.5), [xr] = at(L ? 0.8 : 0.8, 0.5);
  land(0, zf - 20, 40, 20, 3);
  land(xl - 7, zf - 4 + 1.3, 7, 4, 1.8);
  land(xr + 7, zf - 4 + 0.9, 7, 4, 1.8);
  const [, ztop] = at(0.5, 0, 0);
  for (let k = 0; k < 12; k++) tree(xl - 0.8 - rand() * 6, zf + 1.0 - rand() * 3.0, [0, 0, 1, 2, 3, 0][k % 6], 1.35 + rand() * 0.5);
  for (let k = 0; k < 12; k++) tree(xr + 0.8 + rand() * 6, zf + 0.6 - rand() * 3.0, [0, 1, 0, 3, 2, 0][k % 6], 1.35 + rand() * 0.5);
  for (let x = xl + 0.8; x < xr - 0.6; x += 1.5) { if (rand() < 0.55) bush(x + rand() * 0.6, zf - 0.45 - rand() * 0.3, 1.0 + rand() * 0.4); if (rand() < 0.7) flowers(x + rand(), zf - 1.0 - rand() * (zf - ztop - 1.5), 6, 0.3); }
  for (const x of [xl + 2.2, xr - 3]) tree(x, ztop + 0.6, 1, 1.2);
  // 碼頭（左）＋小船（右）
  const [dx, dz] = at(L ? 0.215 : 0.22, L ? 0.31 : 0.235, SEA_Y);
  await kit('pirate-kit/structure-platform-dock', { w: L ? 2.6 : 2.0, x: dx, y: SEA_Y - 0.3, z: dz - 0.9, ry: ISO });
  const [bx, bz] = at(L ? 0.81 : 0.83, L ? 0.31 : 0.235, SEA_Y);
  await kit('pirate-kit/boat-row-small', { w: L ? 2.0 : 1.6, x: bx, y: SEA_Y - 0.12, z: bz, ry: -ISO * 0.6 });
  // 岸邊蘆葦、石頭
  for (const [sx, sy] of (L ? [[0.27, 0.235], [0.71, 0.225], [0.5, 0.215]] : [[0.36, 0.175], [0.66, 0.175]])) { const [x, z] = at(sx, sy, SEA_Y); reeds(x, z, 6, SEA_Y + 0.05, 1.2); }
  for (const [sx, sy] of (L ? [[0.62, 0.22], [0.36, 0.22]] : [[0.5, 0.17]])) { const [x, z] = at(sx, sy, SEA_Y); await rock(x, z, 1.4, SEA_Y + 0.02); }
  // 荷葉：左右下角
  for (const [sx, sy, s] of (L ? [[0.07, 0.88, 0.8], [0.15, 0.97, 0.6], [0.03, 0.72, 0.55], [0.93, 0.9, 0.75], [0.97, 0.76, 0.5], [0.86, 0.99, 0.5]]
                                : [[0.07, 0.94, 0.65], [0.2, 0.99, 0.45], [0.04, 0.84, 0.45], [0.93, 0.96, 0.6], [0.8, 1.0, 0.4]])) {
    const [x, z] = at(sx, sy, SEA_Y); lily(x, z, s, SEA_Y + 0.02, rand() * 6.28);
  }
  water({ gridA: 0.4 });
  finishFlowers(0.08);
  return cfg;
};

// 點餐：等角小店（牆角房間＋地磚，牆上斜放層架、菜單板、時鐘）；櫃台橫跨畫面、斜對牆角擺，正面一路到畫面底
//   檯面後緣＝客人腳底（實測：橫 0.52~0.61、直 0.42~0.45）；4 個商品疊在櫃台正面上
//   直式的牆整片落在上緣按鈕帶 → 牆面留白，裝飾放地板兩側
SCENES.shop = async () => {
  const el = 32, e = el * D2R, Wd = L ? 15 : 9, Hu = Wd * H / W, DEP = 1.3, FY = -1.15;
  const S = (y, z) => y * Math.cos(e) - z * Math.sin(e);
  const tS = S(0, -DEP) - (0.5 - (L ? 0.55 : 0.425)) * Hu;
  const cfg = setup({ el, width: Wd, cy: tS / Math.cos(e), sunDir: [-2, 12, 9], clear: '#f3e6cf', shadow: 0.6 });
  // 地磚（等角棋盤），只鋪在櫃台後面
  const tile = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f6ead6'; g.fillRect(0, 0, w, h); g.fillStyle = '#f3d9cf'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(150, 75); tile.center.set(0.5, 0.5); tile.rotation = ISO;
  const fg = new THREE.PlaneGeometry(300, 150); fg.rotateX(-Math.PI / 2);
  mesh(fg, new THREE.MeshLambertMaterial({ map: tile }), { y: FY, z: -DEP - 75, shadow: false });
  const room0 = new THREE.Group(); room0.position.y = FY; scene.add(room0); PARENT = room0;
  const [cx, cz] = at(0.5, L ? 0.02 : 0.03, FY);
  const C = room(cx, cz, { left: '#f4e7cf', right: '#f7ddd0', hgt: 7 });
  // 畫面 x → 牆上距牆角多遠（左牆往左、右牆往右）
  const sAt = sx => { const [x] = at(sx, 0.5, FY); return Math.abs(x - cx) * Math.SQRT2; };
  if (L) {
    // 左牆：兩層木架＋食物（客人左邊）
    const s0 = sAt(0.17);
    for (const [k, y] of [0.6].entries()) {   // 只放一層：再高會碰到左上圓鈕
      const p = onWall(C, dA, dB, s0, 0.3); mesh(new THREE.BoxGeometry(2.2, 0.1, 0.5), mat('#c98a55'), { x: p.x, y, z: p.z, ry: ISO });
      for (const [i, f] of [['bread', 'apple', 'cupcake'], ['carton', 'honey', 'pear']][k].entries()) { const q = onWall(C, dA, dB, s0 - 0.65 + i * 0.65, 0.3); await kit('food-kit/' + f, { w: 0.45, x: q.x, y: y + 0.05, z: q.z, ry: ISO + (rand() - 0.5) * 0.5 }); }
    }
    // 右牆：菜單板（只有彩色線，沒有字）、時鐘（放牆中段）
    const sm = sAt(0.78), mb = onWall(C, dB, dA, sm, 0.06), mb2 = onWall(C, dB, dA, sm, 0.11);
    mesh(new THREE.BoxGeometry(1.6, 1.0, 0.08), mat('#b97a4a'), { x: mb.x, y: 1.05, z: mb.z, ry: -ISO });
    mesh(new THREE.BoxGeometry(1.42, 0.82, 0.04), mat('#2f6b50'), { x: mb2.x, y: 1.05, z: mb2.z, ry: -ISO, shadow: false });
    for (const [k, c] of ['#f6c445', '#f2808f', '#ffffff', '#7fcfd0'].entries()) { const q = onWall(C, dB, dA, sm - 0.15 + (k % 2) * 0.1, 0.14); mesh(new THREE.BoxGeometry(0.8 - (k % 2) * 0.25, 0.06, 0.02), mat(c), { x: q.x, y: 1.33 - k * 0.18, z: q.z, ry: -ISO, shadow: false }); }
    const ck = onWall(C, dB, dA, sAt(0.86), 0.08), clock = new THREE.Group(); clock.position.set(ck.x, 0.75, ck.z); clock.rotation.y = -ISO; room0.add(clock);
    mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 20), mat('#ffffff'), { rx: Math.PI / 2, parent: clock });
    mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 20), mat('#8b70cc'), { z: 0.02, parent: clock });
    mesh(new THREE.BoxGeometry(0.05, 0.22, 0.03), mat('#24515c'), { y: 0.09, z: 0.06, shadow: false, parent: clock });
    mesh(new THREE.BoxGeometry(0.17, 0.05, 0.03), mat('#24515c'), { x: 0.07, z: 0.06, shadow: false, parent: clock });
  }
  PARENT = scene;
  // 地板兩側：盆栽
  const sideL = L ? [0.06, 0.47] : [0.1, 0.33], sideR = L ? [0.95, 0.5] : [0.9, 0.34];
  { const [x, z] = at(sideL[0], sideL[1], FY); await kit('furniture-kit/pottedPlant', { h: L ? 1.5 : 1.3, x, y: FY, z }); }
  { const [x, z] = at(sideR[0], sideR[1], FY); await kit('furniture-kit/pottedPlant', { h: L ? 1.5 : 1.3, x, y: FY, z, ry: 1.2 }); }
  // 櫃台：檯面（淺木）＋正面（木板）＋前緣收邊＋粉紅飾條
  const WW = Wd * 2.2;
  const top = plankTex('#e9c393', '#d4a874', 5); top.repeat.set(WW / 3, 1);
  const front = plankTex('#d6a06c', '#c08552', 6, 0.04); front.repeat.set(WW / 7, 12 / 0.5 / 6);
  mesh(new THREE.BoxGeometry(WW, 12, DEP), [mat('#c98a55'), mat('#c98a55'), new THREE.MeshLambertMaterial({ map: top }), mat('#8d5a35'), new THREE.MeshLambertMaterial({ map: front }), mat('#c98a55')], { y: -6, z: -DEP / 2 });
  mesh(new THREE.BoxGeometry(WW, 0.16, 0.22), mat('#e8c08f'), { y: -0.08, z: 0.06 });
  mesh(new THREE.BoxGeometry(WW, 0.22, 0.04), mat('#f2a0ab'), { y: -0.42, z: 0.02, shadow: false });
  // 櫃台兩端：水果籃、收銀機（等角擺）
  if (L) {
    await kit('mini-market/display-fruit', { h: 0.62, x: at(0.11, 0.5)[0], y: 0, z: -0.65, ry: ISO });
    await kit('mini-market/cash-register', { h: 0.58, x: at(0.89, 0.5)[0], y: 0, z: -0.65, ry: -ISO });
  } else await kit('food-kit/cupcake', { w: 0.42, x: at(0.92, 0.5)[0], y: 0, z: -0.6, ry: -ISO });
  return cfg;
};

// 積木：玩具房地板（中間軟墊素淨），彩色積木散在四周；上方兩面牆（窗戶、層架）
SCENES.blocks = async () => {
  const cfg = setup({ el: 42, width: L ? 15 : 9, sunDir: [-2, 12, 9], clear: '#f4e6d4' }), TS = L ? 1 : 1.3;
  const fl = plankTex('#ecd0a8', '#d9b585', 6, 0.05); fl.repeat.set(60, 60);
  ground('#ffffff', { map: fl, ry: ISO });
  const [cx, cz] = at(0.5, L ? -0.16 : 0.0, 0);
  const C = room(cx, cz, { left: '#cfe7dc', right: '#f6dccb' });
  windowOn(C, dA, dB, L ? 5.2 : 2.6, 2.4, ISO);
  // 右牆層架＋積木
  const sp = onWall(C, dB, dA, L ? 5.4 : 2.8, 0.32);
  mesh(new THREE.BoxGeometry(2.6, 0.12, 0.6), mat('#c98a55'), { x: sp.x, y: 1.8, z: sp.z, ry: -ISO });
  for (let i = 0; i < 4; i++) { const q = onWall(C, dB, dA, (L ? 4.4 : 1.8) + i * 0.65, 0.32); toy(['cube', 'cyl', 'tri', 'cube'][i], q.x, q.z, TOY[i + 1], 0.42, -ISO, 1.86); }
  // 中間軟墊（等角放）
  PARENT = new THREE.Group(); PARENT.rotation.y = ISO; scene.add(PARENT);
  const [mx, mz] = at(0.5, L ? 0.46 : 0.42, 0), mp = new THREE.Vector3(mx, 0, mz).applyAxisAngle(new THREE.Vector3(0, 1, 0), -ISO);
  slab({ hx: L ? 4.2 : 2.9, hz: L ? 4.2 : 2.9, r: 0.7, top: 0.04, depth: 0.04, color: '#e4f0f4', x: mp.x, z: mp.z });
  PARENT = scene;
  // 積木堆：四個角落＋左右兩側
  const piles = L ? [[0.17, 0.84, 1], [0.84, 0.82, 1], [0.1, 0.55, 0.8], [0.9, 0.58, 0.8], [0.32, 0.97, 0.7], [0.68, 0.98, 0.7]]
                  : [[0.16, 0.88, 0.75], [0.84, 0.9, 0.75], [0.07, 0.68, 0.6], [0.93, 0.7, 0.6], [0.5, 0.99, 0.55]];
  for (const [i, [sx, sy, s0]] of piles.entries()) {
    const [x, z] = at(sx, sy, 0), s = s0 * TS;
    toy('cube', x, z, TOY[i % 6], 0.8 * s, ISO + 0.2); toy('cube', x + 0.1, z - 0.05, TOY[(i + 2) % 6], 0.62 * s, ISO - 0.3, 0.8 * s);
    toy('tri', x + 0.05, z - 0.05, TOY[(i + 3) % 6], 0.6 * s, ISO, 1.42 * s);
    toy('brick', x + 1.0 * s, z + 0.5 * s, TOY[(i + 4) % 6], 0.6 * s, ISO + 0.6); toy('cyl', x - 0.9 * s, z + 0.4 * s, TOY[(i + 1) % 6], 0.55 * s, 0);
    if (i < 2) toy('arch', x + 0.3 * s, z + 1.3 * s, TOY[(i + 5) % 6], 0.6 * s, -ISO);
  }
  return cfg;
};

// 尋寶：開闊草地＋彎曲小徑；樹、長椅、燈、花放邊緣，上緣一排矮樹籬
SCENES.park = async () => {
  const cfg = setup({ el: 40, width: L ? 19 : 11.5, clear: P.grass });
  const mow = stripes2Tex('#89c74c', '#83c147', 10); mow.repeat.set(30, 30);
  ground('#ffffff', { map: mow, ry: ISO });
  const pts = (L ? [[-0.1, 1.0], [0.2, 0.82], [0.48, 0.68], [0.72, 0.45], [0.86, 0.22], [0.95, -0.1]] : [[0.25, 1.08], [0.36, 0.82], [0.66, 0.62], [0.46, 0.38], [0.58, 0.16], [0.7, -0.08]]).map(([a, b]) => at(a, b, 0));
  pathRibbon(pts, L ? 1.5 : 1.2, '#ebe2d0', '#d3c5a8');
  const [, ztop] = at(0.5, 0, 0);
  for (let k = 0, [x0] = at(-0.05, 0), [x1] = at(1.05, 0); x0 + k * 1.05 < x1; k++) bush(x0 + k * 1.05 + rand() * 0.3, ztop + 0.9 + rand() * 0.3, 1.3 + rand() * 0.4);
  const groves = L ? [[0.05, 0.3, 5], [0.04, 0.75, 4], [0.95, 0.6, 5], [0.96, 0.95, 3], [0.2, 0.06, 2], [0.66, 0.05, 2]] : [[0.06, 0.25, 3], [0.94, 0.3, 3], [0.05, 0.95, 2], [0.95, 0.75, 2]];
  for (const [sx, sy, n] of groves) { const [x, z] = at(sx, sy, 0); for (let k = 0; k < n; k++) tree(x + (rand() - 0.5) * 2.2, z + (rand() - 0.5) * 1.6, [0, 0, 1, 2, 3][Math.floor(rand() * 5)], 1.3 + rand() * 0.5); }
  const benches = L ? [[0.62, 0.36, -0.6], [0.32, 0.9, 0.5]] : [[0.3, 0.3, 0.6]];
  for (const [sx, sy, r] of benches) { const [x, z] = at(sx, sy, 0); await kit('holiday-kit/bench', { w: 1.3, x, z, ry: r }); }
  for (const [sx, sy] of (L ? [[0.79, 0.28], [0.41, 0.72]] : [[0.72, 0.5]])) { const [x, z] = at(sx, sy, 0); await kit('fantasy-town-kit/lantern', { h: 1.6, x, z }); }
  for (const [sx, sy] of (L ? [[0.12, 0.5], [0.88, 0.4], [0.1, 0.96], [0.88, 0.8], [0.3, 0.15], [0.55, 0.12]] : [[0.12, 0.6], [0.88, 0.55], [0.15, 0.4], [0.85, 0.95]])) { const [x, z] = at(sx, sy, 0); flowers(x, z, 10, 0.45); }
  finishFlowers(0.08);
  return cfg;
};

// 翻牌：一張大木桌（格子桌巾）佔滿中間；桌外是草地、花、灌木
SCENES.table = async () => {
  const el = 62, cfg = setup({ el, width: L ? 20 : 11.5, clear: P.grass, sunDir: [-7, 14, 3] });
  const GY = -1.6;
  ground(P.grass, { y: GY });
  const [, zb] = at(0.5, L ? 0.07 : 0.06, 0), TW = L ? 17.6 : 10.4, TD = L ? 14 : 22, zc = zb + TD / 2;
  const wood = plankTex('#cf9a66', '#b8834f', 7); wood.repeat.set(1, TD / 1.6); wood.rotation = Math.PI / 2;
  mesh(new THREE.BoxGeometry(TW, 0.32, TD), [mat('#b97a4a'), mat('#b97a4a'), new THREE.MeshLambertMaterial({ map: wood }), mat('#8d5a35'), mat('#b97a4a'), mat('#b97a4a')], { y: -0.16, z: zc });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.4, -GY, 0.4), mat('#a06d47'), { x: sx * (TW / 2 - 0.5), y: GY / 2, z: zc + sz * (TD / 2 - 0.5) });
  const cloth = ginghamTex('#fffaf0', 'rgba(246,196,69,0.28)', 10); cloth.repeat.set(TW / 2.4, TD / 2.4);
  mesh(new THREE.BoxGeometry(TW - 1.0, 0.04, TD - 1.0), new THREE.MeshLambertMaterial({ map: cloth }), { y: 0.02, z: zc, shadow: false });
  // 桌外：花、灌木、樹（寬螢幕才看得到的邊）
  const [xl] = at(0, 0.5), [xr] = at(1, 0.5);
  for (let z = zb - 3; z < zb + TD + 2; z += 1.3) for (const x of [-TW / 2 - 0.9, TW / 2 + 0.9, xl - 0.5, xr + 0.5]) { if (rand() < 0.5) flowers(x + (rand() - 0.5), z, 6, 0.35, GY); else if (rand() < 0.4) bush(x, z, 1.2, GY); }
  for (let x = -TW / 2; x < TW / 2; x += 1.6) { if (rand() < 0.6) bush(x + rand(), zb - 1.0 - rand(), 1.3, GY); else flowers(x, zb - 1.0, 6, 0.4, GY); }
  for (const x of [-TW / 2 - 1.5, TW / 2 + 1.5]) tree(x, zb - 1.5, 0, 1.5, GY);
  finishFlowers(0.09);
  return cfg;
};

// 氣球：天空漸層＋低多邊形雲；底部遠處一小塊島
SCENES.sky = async () => {
  const el = 6, e = el * D2R, Wd = L ? 16 : 9, Hu = Wd * H / W;
  const cfg = setup({ el, width: Wd, sunDir: [-5, 8, 6], clear: '#cfeefe', shadow: 0.5 });
  scene.background = canvasTex(4, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#78c2ee'); gr.addColorStop(0.55, '#b4e1f8'); gr.addColorStop(1, '#e6f6ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const ZF = 40, Y0 = (-(0.5 - (L ? 0.11 : 0.08)) * Hu - ZF * Math.sin(e)) / Math.cos(e);   // 海面遠端落在畫面底部上方一點
  const isl = new THREE.Group(); isl.position.set(L ? -4.8 : -2.2, Y0 + 0.95, -ZF + 4); scene.add(isl); PARENT = isl;
  land(0, 0, L ? 1.6 : 1.1, 1.1, 0.7);
  for (const [x, z, v, s] of [[-0.6, -0.4, 0, 0.9], [0.3, -0.5, 2, 0.8], [0.8, 0.2, 1, 0.75], [-0.9, 0.3, 3, 0.7]]) tree(x * (L ? 1 : 0.7), z, v, s);
  await kit('fantasy-town-kit/lantern', { h: 0.7, x: 0.1, z: 0.3 });
  PARENT = scene;
  if (L) { const i2 = new THREE.Group(); i2.position.set(5.6, Y0 + 0.95, -ZF + 2); scene.add(i2); PARENT = i2; land(0, 0, 0.8, 0.6, 0.5); tree(0, -0.1, 0, 0.75); PARENT = scene; }
  const sea = water({ y: Y0, gridA: 0.35 }); sea.geometry = new THREE.PlaneGeometry(400, ZF + 30); sea.position.z = -ZF + (ZF + 30) / 2;
  const cl = L ? [[0.1, 0.24, 1.5], [0.3, 0.36, 0.8], [0.7, 0.2, 1.2], [0.9, 0.38, 1.5], [0.52, 0.1, 0.55], [0.04, 0.62, 1.1], [0.97, 0.66, 1.0], [0.2, 0.08, 0.5]]
                : [[0.18, 0.22, 0.85], [0.84, 0.3, 0.95], [0.5, 0.13, 0.5], [0.06, 0.52, 0.8], [0.95, 0.58, 0.75], [0.6, 0.42, 0.45]];
  for (const [sx, sy, s] of cl) cloud((sx - 0.5) * Wd, ((0.5 - sy) * Hu) / Math.cos(e), -8 - rand() * 6, s, 4 + Math.floor(rand() * 3));
  finishFlowers();
  return cfg;
};

// 稻草人（程式生成）
function scarecrow(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = 0.35; PARENT.add(g);
  mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.55, 6), mat('#9a6a48'), { y: 0.78, parent: g });
  mesh(new THREE.BoxGeometry(1.05, 0.07, 0.07), mat('#9a6a48'), { y: 1.12, parent: g });
  mesh(new RoundedBoxGeometry(0.5, 0.52, 0.3, 2, 0.06), mat('#5fa9d6'), { y: 1.0, parent: g });
  mesh(new THREE.BoxGeometry(0.16, 0.14, 0.02), mat('#f2808f'), { x: 0.1, y: 0.92, z: 0.16, parent: g, shadow: false });
  for (const sx of [-1, 1]) { mesh(new RoundedBoxGeometry(0.3, 0.2, 0.22, 2, 0.05), mat('#5fa9d6'), { x: sx * 0.38, y: 1.12, parent: g }); const t = mesh(new THREE.ConeGeometry(0.08, 0.18, 5), mat('#f6c445'), { x: sx * 0.58, y: 1.12, parent: g }); t.rotation.z = sx * Math.PI / 2; }
  mesh(new THREE.SphereGeometry(0.2, 10, 8), mat('#e8c08f'), { y: 1.47, parent: g });
  for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.03, 6, 5), mat('#3b3d48'), { x: sx * 0.07, y: 1.5, z: 0.18, parent: g, shadow: false });
  mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10, Math.PI), mat('#6a2b34'), { y: 1.42, z: 0.19, rz: Math.PI, parent: g, shadow: false });
  mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 14), mat('#d9a35a'), { y: 1.6, parent: g });
  mesh(new THREE.ConeGeometry(0.2, 0.28, 10), mat('#d9a35a'), { y: 1.74, parent: g });
  mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 12), mat('#f2808f'), { y: 1.66, parent: g, shadow: false });
  return g;
}
// 打地鼠：開闊平整草地（割草條紋）＋貼地的小花、草叢、石頭（避開洞口）。
//   地洞格子從畫面 14%（直式 38%）一路占到底；立起來的東西只放在空位：
//   橫式＝上緣、左側目標卡上下、右緣；直式＝上緣、目標卡兩側、底角
SCENES.garden = async () => {
  const cfg = setup({ el: 40, width: L ? 18 : 9.5, clear: P.grass, sunDir: [-8, 14, 2] });
  const mow = stripes2Tex('#8bc94d', '#82c146', 10); mow.repeat.set(30, 30);
  ground('#ffffff', { map: mow, ry: ISO });
  const fy = L ? 0.155 : 0.225, [, zfence] = at(0.5, fy, 0), [xl] = at(-0.05, 0.5), [xr] = at(1.05, 0.5);
  const fence = (x, z, ry = 0) => kit('nature-kit/fence_simple', { w: 1.0, x, z, ry, tint: { wood: '#c98a55', woodDark: '#a06d47' } });
  for (let x = xl; x < xr; x += 1.0) await fence(x + 0.5, zfence);
  // 菜圃（籬笆後面，矮的）
  const beds = L ? [[0.3, 0.075], [0.5, 0.07], [0.7, 0.075]] : [[0.3, 0.155], [0.7, 0.155]];
  const crops = ['crop_carrot', 'crop_turnip', 'crop_carrot', 'crop_pumpkin', 'crops_leafsStageB', 'crop_turnip'];
  const bed = async (sx, sy, hx, nc, i) => {
    const [x, z] = at(sx, sy, 0);
    slab({ hx, hz: 0.7, r: 0.25, top: 0.1, depth: 0.12, color: '#8a5a3c', x, z });
    for (let r = 0; r < 2; r++) for (let c = 0; c < nc; c++) await kit('nature-kit/' + crops[(i * 2 + r + c) % crops.length], { h: 0.4, x: x - hx + 0.45 + c * ((hx * 2 - 0.9) / Math.max(1, nc - 1)), y: 0.1, z: z - 0.3 + r * 0.6 });
  };
  for (const [i, [sx, sy]] of beds.entries()) await bed(sx, sy, L ? 1.7 : 1.15, L ? 4 : 3, i);
  const sfl = (list, s = 1) => { for (const [sx, sy] of list) { const [x, z] = at(sx, sy, 0); sunflower(x, z, 1.5 + rand() * 0.4, s); } };
  const pumpkins = async list => { for (const [sx, sy, h] of list) { const [x, z] = at(sx, sy, 0); await kit('nature-kit/crop_pumpkin', { h, x, z, ry: rand() * 6 }); } };
  if (L) {
    sfl([[0.04, 0.08], [0.1, 0.12], [0.15, 0.06], [0.86, 0.07], [0.91, 0.12], [0.96, 0.06]]);
    // 左側目標卡上方：稻草人；下方：小菜圃＋南瓜＋向日葵
    { const [x, z] = at(0.2, 0.355, 0); scarecrow(x, z, 1.0); }
    await bed(0.2, 0.86, 1.25, 2, 3);
    await pumpkins([[0.13, 0.97, 0.55], [0.27, 0.98, 0.45]]);
    sfl([[0.06, 0.9], [0.05, 0.6], [0.06, 0.3]], 0.9);
    // 右緣：直立籬笆段＋向日葵
    const [xf] = at(0.94, 0.5);
    for (const sy of [0.3, 0.42, 0.66, 0.78]) { const [, z] = at(0.94, sy, 0); await fence(xf, z, Math.PI / 2); }
    sfl([[0.97, 0.36], [0.96, 0.72], [0.95, 0.95]], 0.95);
    await pumpkins([[0.93, 0.56, 0.5]]);
  } else {
    sfl([[0.88, 0.13], [0.95, 0.18], [0.86, 0.36], [0.94, 0.37]], 0.85);
    { const [x, z] = at(0.11, 0.37, 0); scarecrow(x, z, 0.85); }
    await pumpkins([[0.06, 0.95, 0.5], [0.17, 0.97, 0.4], [0.9, 0.96, 0.5], [0.97, 0.93, 0.4]]);
  }
  // 貼地小細節：小花、草叢、石頭（不壓洞口）
  const holes = L ? [[0.29, 0.39, 0.89, 0.57], [0.29, 0.81, 0.89, 0.99]] : [[0.02, 0.53, 0.98, 0.64], [0.02, 0.76, 0.98, 0.9]];
  const free = (sx, sy) => !holes.some(([a, b, c, d]) => sx > a && sx < c && sy > b && sy < d) && (L ? !(sx < 0.31 && sy > 0.37 && sy < 0.75) : !(sy < 0.37 && sx > 0.22 && sx < 0.78));
  for (let n = 0, tries = 0; n < (L ? 26 : 18) && tries < 400; tries++) {
    const sx = 0.05 + rand() * 0.9, sy = (L ? 0.2 : 0.4) + rand() * (L ? 0.78 : 0.55);
    if (!free(sx, sy)) continue;
    const [x, z] = at(sx, sy, 0), r = rand();
    if (r < 0.55) flowers(x, z, 5, 0.22); else if (r < 0.9) await kit('nature-kit/grass', { h: 0.22, x, z, ry: rand() * 6, tint: { grass: '#6cb455' } }); else await rock(x, z, 0.6);
    n++;
  }
  const [, ztop] = at(0.5, -0.02, 0);
  for (let x = xl; x < xr; x += 1.3) bush(x + rand() * 0.4, ztop + rand() * 0.3, 1.2 + rand() * 0.3);
  finishFlowers(0.075);
  return cfg;
};

// 水上小物：鴨子、蓮花苞、魚影（跳跳蛙用；不用荷葉＝不會被當成能跳的荷葉）
function duck(x, z, s = 1, ry = 0, y = SEA_Y) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s); PARENT.add(g);
  const wht = mat('#fbfaf4', { flatShading: true });
  mesh(new THREE.SphereGeometry(0.3, 10, 7), wht, { y: 0.14, parent: g }).scale.set(1.3, 0.72, 0.95);
  const tl = mesh(new THREE.ConeGeometry(0.12, 0.25, 5), wht, { x: -0.38, y: 0.24, parent: g }); tl.rotation.z = 0.9;
  for (const sz of [-1, 1]) mesh(new THREE.SphereGeometry(0.17, 8, 6), mat('#ece6d6', { flatShading: true }), { x: -0.05, y: 0.2, z: sz * 0.2, parent: g }).scale.set(1.4, 0.55, 0.45);
  mesh(new THREE.SphereGeometry(0.17, 10, 8), wht, { x: 0.27, y: 0.43, parent: g });
  const bk = mesh(new THREE.ConeGeometry(0.07, 0.18, 6), mat('#f7a33a'), { x: 0.45, y: 0.41, parent: g }); bk.rotation.z = -Math.PI / 2; bk.scale.set(1, 1, 0.6);
  for (const sz of [-1, 1]) mesh(new THREE.SphereGeometry(0.028, 6, 5), mat('#3b3d48'), { x: 0.37, y: 0.47, z: sz * 0.1, parent: g, shadow: false });
  return g;
}
function lotusBud(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, SEA_Y, z); g.scale.setScalar(s); g.rotation.z = (rand() - 0.5) * 0.3; PARENT.add(g);
  mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 5), mat('#5f9c3a'), { y: 0.27, parent: g });
  const b = mesh(new THREE.SphereGeometry(0.13, 8, 6), mat('#f6a0b9', { flatShading: true }), { y: 0.62, parent: g }); b.scale.set(0.85, 1.35, 0.85);
  mesh(new THREE.ConeGeometry(0.07, 0.16, 6), mat('#f2809f', { flatShading: true }), { y: 0.83, parent: g });
  return g;
}
const fishShadowMat = new THREE.MeshBasicMaterial({ color: '#235f86', transparent: true, opacity: 0.32, depthWrite: false });
function fishShadow(x, z, s = 1, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, SEA_Y + 0.015, z); g.rotation.y = ry; g.scale.setScalar(s); PARENT.add(g);
  const b = new THREE.CircleGeometry(0.32, 16); b.rotateX(-Math.PI / 2); b.scale(1.5, 1, 0.75); mesh(b, fishShadowMat, { parent: g, shadow: false });
  const t = new THREE.CircleGeometry(0.18, 3); t.rotateX(-Math.PI / 2); mesh(t, fishShadowMat, { x: -0.55, parent: g, shadow: false });
  return g;
}
// 跳跳蛙：河流。橫式左右是岸、中間大片水；直式上下是岸
//   荷葉路線（zhuyin.js fpos）：橫 x 10~88%、y 29~83%（河的比例）；直 x 19~81%（±葉寬 11%）、y 14~88%
//   → 裝飾只放：橫式河的最上／最下段＋岸邊；直式左右邊緣（x<8%、>92%）＋荷葉欄之間的縫（只放貼水面的魚影）
SCENES.frog = async () => {
  const cfg = setup({ el: 40, width: L ? 19 : 11.5, cy: SEA_Y });
  if (L) {
    const [x1] = at(0.115, 0.5, SEA_Y), [x2] = at(0.885, 0.5, SEA_Y), [, zt] = at(0.5, -0.1, SEA_Y), [, zb] = at(0.5, 1.1, SEA_Y);
    land(x1 - E - 10, 0, 10, 40, 2); land(x2 + E + 10, 0, 10, 40, 2);
    land(x1 - E - 2 + 0.9, (zt + zb) / 2 + 3.5, 2, 1.6, 1.2);
    land(x2 + E + 2 - 0.9, zt + 3.2, 2, 1.8, 1.2);
    for (let z = zt; z < zb; z += 1.4) { tree(x1 - E - 0.7 - rand() * 1.8, z + rand(), [0, 1, 0, 2, 3][Math.floor(rand() * 5)], 1.3 + rand() * 0.4); tree(x2 + E + 0.7 + rand() * 1.8, z + rand(), [0, 1, 0, 2, 3][Math.floor(rand() * 5)], 1.3 + rand() * 0.4); if (rand() < 0.6) flowers(x1 - E - 0.8, z, 6, 0.3); if (rand() < 0.6) flowers(x2 + E + 0.8, z, 6, 0.3); }
    for (const [sx, sy] of [[0.13, 0.12], [0.13, 0.92], [0.87, 0.45], [0.87, 0.97], [0.12, 0.5]]) { const [x, z] = at(sx, sy, SEA_Y); reeds(x, z, 6, SEA_Y + 0.05, 1.2); }
    for (const [sx, sy] of [[0.14, 0.3], [0.86, 0.15]]) { const [x, z] = at(sx, sy, SEA_Y); await rock(x, z, 1.5, SEA_Y + 0.02); }
    // 河的上段（荷葉不會到）：鴨子一家、花苞；下段：花苞、鴨子；魚影
    for (const [sx, sy, s, r] of [[0.33, 0.2, 1.0, -0.4], [0.39, 0.22, 0.65, -0.3], [0.43, 0.235, 0.6, -0.2], [0.66, 0.965, 0.9, 2.6]]) { const [x, z] = at(sx, sy, SEA_Y); duck(x, z, s, r); }
    for (const [sx, sy, s] of [[0.2, 0.16, 1.0], [0.235, 0.2, 0.75], [0.78, 0.2, 0.9], [0.22, 0.97, 0.9], [0.8, 0.93, 0.8]]) { const [x, z] = at(sx, sy, SEA_Y); lotusBud(x, z, s); }
    for (const [sx, sy, r] of [[0.58, 0.2, 0.4], [0.5, 0.96, 2.8], [0.33, 0.97, 3.4]]) { const [x, z] = at(sx, sy, SEA_Y); fishShadow(x, z, 1.1, r); }
  } else {
    const [, z1] = at(0.5, 0.2, SEA_Y), [, z2] = at(0.5, 0.9, SEA_Y), [xl] = at(-0.1, 0.5, SEA_Y), [xr] = at(1.1, 0.5, SEA_Y);
    land(0, z1 - E - 20, 40, 20, 2); land(0, z2 + E + 20, 40, 20, 2);
    land(xl + 2.6, z1 - E - 2 + 0.8, 2.4, 2, 1.2);
    land(xr - 2.4, z2 + E + 2 - 0.7, 2.4, 2, 1.2);
    for (let x = xl; x < xr; x += 1.3) { tree(x + rand(), z1 - E - 1.5 - rand() * 3, [0, 1, 0, 2, 3][Math.floor(rand() * 5)], 1.25 + rand() * 0.4); if (rand() < 0.55) tree(x + rand(), z2 + E + 2.2 + rand() * 2, [0, 1, 0, 2][Math.floor(rand() * 4)], 1.2 + rand() * 0.3); if (rand() < 0.6) flowers(x, z1 - E - 0.7, 6, 0.3); if (rand() < 0.6) flowers(x, z2 + E + 0.8, 6, 0.3); }
    for (const [sx, sy] of [[0.12, 0.215], [0.8, 0.215], [0.15, 0.885], [0.86, 0.885]]) { const [x, z] = at(sx, sy, SEA_Y); reeds(x, z, 6, SEA_Y + 0.05, 1.1); }
    // 左右邊緣：蘆葉叢、鴨子、花苞（荷葉永遠不會到 x<8%、>92%）
    for (const [sx, sy] of [[0.03, 0.42], [0.97, 0.6], [0.03, 0.78], [0.97, 0.33]]) { const [x, z] = at(sx, sy, SEA_Y); reeds(x, z, 5, SEA_Y + 0.05, 1.0); }
    for (const [sx, sy, s, r] of [[0.055, 0.55, 1.15, -0.8], [0.945, 0.47, 1.15, 2.4], [0.95, 0.72, 0.9, 2.2]]) { const [x, z] = at(sx, sy, SEA_Y); duck(x, z, s, r); }
    for (const [sx, sy, s] of [[0.04, 0.33, 1.1], [0.96, 0.84, 1.05], [0.05, 0.68, 1.0]]) { const [x, z] = at(sx, sy, SEA_Y); lotusBud(x, z, s); }
    // 荷葉欄之間的縫（x≈34%、66%）：只放貼水面的魚影
    for (const [sx, sy, r] of [[0.345, 0.46, 0.5], [0.655, 0.36, 2.6], [0.345, 0.73, 3.6], [0.655, 0.64, 1.2]]) { const [x, z] = at(sx, sy, SEA_Y); fishShadow(x, z, 0.75, r); }
  }
  water({ gridA: 0.4 });
  finishFlowers(0.08);
  return cfg;
};

// 貼紙圖鑑：溫馨室內（地毯、書架、植物、沙發、立燈放邊緣），中間淡、乾淨
SCENES.album = async () => {
  const cfg = setup({ el: 42, width: L ? 15 : 9, sunDir: [-2, 12, 9], clear: '#f6eadf' });
  const fl = plankTex('#e6c49b', '#d2ab7c', 6, 0.05); fl.repeat.set(60, 60);
  ground('#ffffff', { map: fl, ry: ISO });
  const [cx, cz] = at(0.5, L ? -0.14 : 0.02, 0);
  const C = room(cx, cz, { left: '#f6e0d6', right: '#e2edf6' });
  windowOn(C, dB, dA, L ? 4.6 : 2.4, 2.4, -ISO);
  // 大圓地毯（淡紫＋外圈）
  const [mx, mz] = at(0.5, L ? 0.55 : 0.52, 0);
  mesh(new THREE.CylinderGeometry(L ? 5.2 : 3.6, L ? 5.2 : 3.6, 0.03, 40), mat('#e9dcf0'), { x: mx, y: 0.015, z: mz, shadow: false });
  mesh(new THREE.CylinderGeometry(L ? 4.7 : 3.2, L ? 4.7 : 3.2, 0.035, 40), mat('#f5eff8'), { x: mx, y: 0.02, z: mz, shadow: false });
  // 左牆：書架＋盆栽；右牆：邊桌＋檯燈；角落沙發、立燈
  const put = async (name, d, n, s, off, h, ry) => { const p = onWall(C, d, n, s, off); return kit('furniture-kit/' + name, { h, x: p.x, z: p.z, ry }); };
  await put('bookcaseOpen', dA, dB, L ? 3.6 : 2.0, 0.45, 2.0, ISO);
  await put('books', dA, dB, L ? 3.6 : 2.0, 0.45, 0.35, ISO).then(o => { o.position.y = 1.2; });
  await put('pottedPlant', dA, dB, L ? 5.4 : 3.3, 0.5, 1.5, ISO);
  for (const [d, n, ry, list] of [[dA, dB, ISO, L ? [[5.6, 2.7, '#f6c445'], [7.0, 2.4, '#7fcfd0']] : [[3.6, 2.8, '#f6c445']]], [dB, dA, -ISO, L ? [[2.7, 2.7, '#f2808f'], [6.6, 2.5, '#8b70cc']] : [[1.5, 2.8, '#f2808f']]]])
    for (const [sw, y, c] of list) { const p = onWall(C, d, n, sw, 0.06); mesh(new THREE.BoxGeometry(0.9, 0.7, 0.06), mat('#ffffff'), { x: p.x, y, z: p.z, ry }); const q = onWall(C, d, n, sw, 0.1); mesh(new THREE.BoxGeometry(0.72, 0.52, 0.03), mat(c), { x: q.x, y, z: q.z, ry, shadow: false }); }
  // 彩旗：沿兩面牆上緣
  for (const [d, n, ry] of [[dA, dB, ISO], [dB, dA, -ISO]]) for (let k = 0; k < 14; k++) {
    const sw = 0.5 + k * 0.55, p = onWall(C, d, n, sw, 0.08), sag = Math.sin((k % 7) / 6 * Math.PI) * 0.25;
    const f = mesh(new THREE.ConeGeometry(0.17, 0.32, 3), mat(TOY[k % 6]), { x: p.x, y: 3.85 - sag, z: p.z, ry, rx: Math.PI, shadow: false }); f.scale.set(1, 1, 0.25);
  }
  await put('sideTable', dB, dA, L ? 2.8 : 1.6, 0.5, 0.7, -ISO);
  await put('lampRoundTable', dB, dA, L ? 2.8 : 1.6, 0.5, 0.6, -ISO).then(o => { o.position.y = 0.68; });
  if (L) {
    let [x, z] = at(0.08, 0.86, 0); await kit('furniture-kit/loungeSofa', { h: 1.1, x, z, ry: ISO * 0.8, tint: { carpet: '#9cc8e8' } });
    [x, z] = at(0.93, 0.62, 0); await kit('furniture-kit/lampRoundFloor', { h: 2.3, x, z });
    [x, z] = at(0.9, 0.92, 0); await kit('furniture-kit/plantSmall2', { h: 0.9, x, z });
    [x, z] = at(0.12, 0.6, 0); await kit('furniture-kit/pillowBlue', { h: 0.3, x, z, ry: 0.4 });
  } else {
    let [x, z] = at(0.1, 0.94, 0); await kit('furniture-kit/loungeChair', { h: 1.0, x, z, ry: ISO, tint: { carpet: '#9cc8e8' } });
    [x, z] = at(0.92, 0.9, 0); await kit('furniture-kit/plantSmall2', { h: 0.9, x, z });
  }
  return cfg;
};
// =========================================================
async function main() {
  if (!SCENES[BG]) fail('沒有這個背景：' + BG);
  const cfg = await SCENES[BG]();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(devicePixelRatio || 1); renderer.setSize(W, H);
  renderer.setClearColor(cfg.clear || P.deep, 1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  document.body.prepend(renderer.domElement);
  renderer.render(scene, camera);
  window.__done = true;
}
main().catch(e => { if (!window.__error) fail(String(e && e.stack || e)); });
