// 3D 渲染工作站：依 jobs.json 載模型、擺角度、渲染到透明 canvas（render.js 負責截圖與後製）
// 網址：studio.html?job=<名稱>[&yaw=度&pitch=度]　完成 → window.__done=true、window.__info={w,h}
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const Q = new URLSearchParams(location.search);
const ROOT = '../../';
const KIT_DIR = { 'nature-kit': 'GLTF format' };   // 其他 Kenney 套件放在 GLB format
const SRGB_FIX = new Set(['nature-kit']);          // 這些套件把 sRGB 色值當線性存＋metallic=1 → 轉色、改 Lambert
const D2R = Math.PI / 180;

function fail(msg) { document.getElementById('err').textContent = msg; window.__error = msg; throw new Error(msg); }

function srcInfo(src) {
  if (src.startsWith('kit:')) { const [kit, name] = src.slice(4).split('/'); return { url: `${ROOT}IMAGE/_src/iso/kits/${kit}/Models/${KIT_DIR[kit] || 'GLB format'}/${name}.glb`, kit }; }
  if (src.startsWith('zy:')) return { url: `${ROOT}IMAGE/zy3d/models/${src.slice(3)}.glb`, kit: 'zy' };
  return { url: ROOT + src, kit: '' };
}

/* ---------- 材質：統一換成 Lambert（跟選單一致）；亮面（roughness<0.6，如氣球）留 Standard 才有高光 ---------- */
function convertMat(m, kit, tint) {
  let color = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
  if (SRGB_FIX.has(kit) && !m.map) color.convertSRGBToLinear();
  if (tint && tint[m.name] === 'hide') { const h = new THREE.MeshBasicMaterial(); h.visible = false; return h; }
  if (tint && tint[m.name]) color = new THREE.Color(tint[m.name]);
  if (m.map) { m.map.generateMipmaps = false; m.map.minFilter = m.map.magFilter = THREE.LinearFilter; m.map.anisotropy = 4; }
  const base = { map: m.map || null, color, vertexColors: !!m.vertexColors, transparent: !!m.transparent, opacity: m.opacity ?? 1, side: m.side, alphaTest: m.alphaTest || 0 };
  const gloss = m.isMeshStandardMaterial && m.roughness < 0.6 && kit === 'zy';
  return gloss ? new THREE.MeshStandardMaterial({ ...base, metalness: 0, roughness: Math.max(0.38, m.roughness) }) : new THREE.MeshLambertMaterial(base);
}

/* ---------- 程式生成小物 ---------- */
const PROC = {
  // 低多邊形蓮花：三圈花瓣＋黃色花心（原點在底部中心）
  lotus() {
    const g = new THREE.Group();
    const petalGeo = (len, wid) => { const geo = new THREE.SphereGeometry(1, 8, 4); geo.scale(wid, wid * 0.38, len); geo.translate(0, 0, len); return geo; };
    const ring = (n, len, wid, tilt, color, off, r0, y0) => {
      const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
      for (let i = 0; i < n; i++) {
        const piv = new THREE.Group(); piv.rotation.y = (i / n) * Math.PI * 2 + off; piv.position.y = y0;
        const p = new THREE.Mesh(petalGeo(len, wid), mat); p.position.z = r0; p.rotation.x = -tilt; piv.add(p); g.add(piv);
      }
    };
    ring(8, 0.42, 0.19, 0.42, '#fbc0d0', 0, 0.06, 0.02);
    ring(8, 0.36, 0.17, 0.85, '#f6a0b9', Math.PI / 8, 0.05, 0.05);
    ring(5, 0.27, 0.14, 1.22, '#f2809f', 0.3, 0.02, 0.08);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 9), new THREE.MeshLambertMaterial({ color: '#ffd04a', flatShading: true }));
    c.position.y = 0.13; g.add(c);
    return g;
  },
  // 低多邊形圓荷葉：18 邊、斜切邊、右後方一道缺口、淺色葉脈
  lily(part) {
    const g = new THREE.Group(), a = (part.notchAt ?? 45) * D2R, n = 0.3;
    const s = new THREE.Shape(); s.moveTo(0, 0); s.absarc(0, 0, 1, a + n, a - n + Math.PI * 2, false); s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.07, curveSegments: 18, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    const top = new THREE.MeshLambertMaterial({ color: part.top || '#7cc650', flatShading: true });
    const side = new THREE.MeshLambertMaterial({ color: part.side || '#4f9a36', flatShading: true });
    g.add(new THREE.Mesh(geo, [top, side]));
    const vein = new THREE.MeshLambertMaterial({ color: part.vein || '#a3da7a' });
    for (let i = 0; i < 7; i++) {
      const t = a + n + 0.35 + i * (Math.PI * 2 - 2 * n - 0.7) / 6;
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.012, 0.035), vein);
      v.position.set(Math.cos(t) * 0.46, 0.112, -Math.sin(t) * 0.46); v.rotation.y = t; g.add(v);
    }
    return g;
  },
};

/* ---------- 載入與擺放 ---------- */
const loader = new GLTFLoader();
const cache = new Map();
const loadGLB = url => { if (!cache.has(url)) cache.set(url, loader.loadAsync(url)); return cache.get(url); };

async function buildPart(part) {
  let obj;
  if (part.proc) obj = PROC[part.proc](part);
  else {
    const { url, kit } = srcInfo(part.src);
    const g = await loadGLB(url).catch(e => fail('載入失敗 ' + url + ' ' + e.message));
    obj = g.scene.clone(true);
    obj.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(m => convertMat(m, kit, part.tint)) : convertMat(o.material, kit, part.tint); });
    if (part.hide) obj.traverse(o => { if (part.hide.includes(o.name)) o.visible = false; });
  }
  if (part.r) obj.rotation.set(part.r[0] * D2R, part.r[1] * D2R, part.r[2] * D2R);
  const wrap = new THREE.Group(); wrap.add(obj);
  // 尺寸正規化：h＝高度、w＝水平最大寬（世界單位）；s＝直接倍率
  if (part.h || part.w) {
    const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(part.h ? part.h / sz.y : part.w / Math.max(sz.x, sz.z));
  } else if (part.s) obj.scale.multiplyScalar(part.s);
  if (part.sc) obj.scale.multiply(new THREE.Vector3(...part.sc));   // 非等比（例：石頭加厚）
  if (part.ground !== false) {                      // 預設：水平置中、底部貼 y=0
    const b = new THREE.Box3().setFromObject(obj), c = b.getCenter(new THREE.Vector3());
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b.min.y;
  }
  if (part.p) wrap.position.set(...part.p);
  return wrap;
}
async function buildJob(job) {
  const root = new THREE.Group();
  for (const part of job.parts) {
    const w = await buildPart(part);
    if (part.onTop) w.position.y += new THREE.Box3().setFromObject(root).max.y - (part.sink || 0);   // 疊在前面零件的頂面上
    root.add(w);
  }
  if (job.rotY) root.rotation.y = job.rotY * D2R;
  return root;
}

// 相機座標下的精確外框（逐頂點；clipY 以下不算）
function viewExtents(root, cam, clipY) {
  root.updateMatrixWorld(true); cam.updateMatrixWorld(true);
  const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }, v = new THREE.Vector3();
  root.traverseVisible(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (clipY != null && v.y < clipY) continue;
      v.applyMatrix4(cam.matrixWorldInverse);
      e.x0 = Math.min(e.x0, v.x); e.x1 = Math.max(e.x1, v.x); e.y0 = Math.min(e.y0, v.y); e.y1 = Math.max(e.y1, v.y);
    }
  });
  return e;
}

async function main() {
  const cfg = await fetch(Q.get('cfg') || 'jobs.json', { cache: 'no-cache' }).then(r => r.json());
  const name = Q.get('job'); const job = cfg.jobs[name];
  if (!job) fail('找不到 job：' + name);
  const D = cfg.defaults;
  const yaw = +(Q.get('yaw') ?? job.yaw ?? D.yaw) * D2R, pitch = +(Q.get('pitch') ?? job.pitch ?? D.pitch) * D2R;
  const res = job.res || D.res, clipY = job.clipY ?? null;

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const toward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  cam.position.set(toward.x * Math.cos(pitch), Math.sin(pitch), toward.z * Math.cos(pitch)).multiplyScalar(60);
  cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
  if (job.roll) { cam.rotateZ(job.roll * D2R); }

  // 同 group 的 job 一起量外框 → 共用畫框與比例（例：青蛙坐／跳兩張大小一致）
  const members = job.group ? Object.entries(cfg.jobs).filter(([, j]) => j.group === job.group) : [[name, job]];
  let me = null; const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const [n, j] of members) {
    const r = await buildJob(j); scene.add(r);
    const x = viewExtents(r, cam, j.clipY ?? null);
    e.x0 = Math.min(e.x0, x.x0); e.x1 = Math.max(e.x1, x.x1); e.y0 = Math.min(e.y0, x.y0); e.y1 = Math.max(e.y1, x.y1);
    if (n === name) me = r; else r.visible = false;
  }
  const mw = (e.x1 - e.x0) * 0.03, mh = (e.y1 - e.y0) * 0.03;
  Object.assign(cam, { left: e.x0 - mw, right: e.x1 + mw, bottom: e.y0 - mh, top: e.y1 + mh });
  cam.updateProjectionMatrix();
  const ww = cam.right - cam.left, wh = cam.top - cam.bottom, ppu = res / Math.max(ww, wh);
  const W = Math.round(ww * ppu), H = Math.round(wh * ppu);

  // 光：柔和半球光＋左上前方主光＋右側補光（方向跟著相機水平角走，各張圖光感一致）
  const L = { hemi: 1.5, key: 2.2, fill: 0.55, shadow: 0.42, ...(D.light || {}), ...(job.light || {}) };
  scene.add(new THREE.HemisphereLight(0xf4f9ff, 0xe9dcc6, L.hemi));
  const box = new THREE.Box3().setFromObject(me), ctr = box.getCenter(new THREE.Vector3()), rad = box.getSize(new THREE.Vector3()).length() / 2 || 1;
  const keyDir = right.clone().multiplyScalar(-0.55).add(new THREE.Vector3(0, 1, 0)).add(toward.clone().multiplyScalar(0.5)).normalize();
  const key = new THREE.DirectionalLight(0xfff4e4, L.key);
  key.position.copy(ctr).addScaledVector(keyDir, rad * 4); key.target.position.copy(ctr);
  const fill = new THREE.DirectionalLight(0xe6f0ff, L.fill);
  fill.position.copy(ctr).addScaledVector(right.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, 0.25, 0)).add(toward.clone().multiplyScalar(0.4)).normalize(), rad * 4);
  fill.target.position.copy(ctr);
  scene.add(key, key.target, fill, fill.target);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  if (!renderer.getContext()) fail('沒有 WebGL');
  renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = job.exposure || D.exposure || 1.0;
  // 只做模型自身的柔和陰影（例：帽簷落在臉上），沒有地面
  if (L.shadow > 0) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -rad, right: rad, top: rad, bottom: -rad, near: rad * 0.5, far: rad * 8 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0004; key.shadow.normalBias = rad * 0.012; key.shadow.radius = 3; key.shadow.intensity = L.shadow;
    me.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  }
  if (clipY != null) renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -clipY)];
  document.body.prepend(renderer.domElement);
  if (Q.has('preview')) document.body.classList.add('preview');
  renderer.render(scene, cam);
  window.__info = { w: W, h: H, ppu };
  window.__done = true;
}
main().catch(e => { if (!window.__error) fail(String(e && e.stack || e)); });
