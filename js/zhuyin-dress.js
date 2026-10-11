// ===================== 注音小島：寵物換裝（#dress）=====================
// 小孩幫寵物戴帽子、蝴蝶結、披風…；穿好的樣子之後也會出現在 3D 小島上（hub3d 跟這裡用同一份 RW.wearOf()／RW.wearPose()／models.json wear_fit）。
// 規格：docs/zhuyin-v5-plan.md §3。存檔欄位與規則全在 js/zhuyin-rewards.js（closet、wear、setWear、canWear）。
//
// 介面（主程式照這個接）：
//   createDress(root, api) → { open(petId?), close(), relayout(), debug }
//   api：say talk play later rw()（存檔物件 save.rw）save()（存檔）pets()（已收集 [{id,name,stage}]）onClose
//   open() 會把 root 的 .hidden 拿掉、close() 會加回去並呼叫 api.onClose（每次開只呼叫一次）。
// 畫面：上方寵物選擇列＋「穿好了」；左邊即時 3D 預覽（慢慢轉、手指左右拖轉、點寵物會開心跳）；右邊衣櫃三組（頭上／旁邊／背上）。
//   直式：預覽在上、衣櫃在下。WebGL 開不了（或被系統收走 3 秒沒還回來）→ 預覽改成寵物圖片＋穿的配件小圖，照樣可以穿脫。
//   衣櫃格子只放圖（10-12 寧次：名字在格子裡太小）；點了會說配件名，預覽區也跳出大字名牌 2 秒。
// 關掉一定 dispose renderer＋forceContextLoss、停 rAF、釋放載入的模型與貼圖：重複開關不會累積 WebGL context。
// 計時（稱讚、閒置提示）一律走 api.later；動畫跟著 rAF 走。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as RW from "./zhuyin-rewards.js?v=2";   // ⚠ 跟 zhuyin.js 的 import 用同一個 ?v（升版號時兩邊一起改，才會是同一份模組）

const ROOT = new URL("../", import.meta.url).href;
const MODELS = ROOT + "IMAGE/zy3d/models/", IMG = ROOT + "IMAGE/zhuyin/";
const DEG = Math.PI / 180, FPS = 30, TAP_MOVE = 24, TAP_MS = 800, TILE_H = 1, GROUP_T = 6.2;   // TILE_H：衣櫃格子高÷寬（格子只放圖＝正方形）；GROUP_T：分組標題高（vmin）。css/zhuyin-dress.css 的 .dr-item／.dr-gt 一起改
const LOST_MS = 3000, NAME_MS = 2000;                                                // WebGL 被系統收走 3 秒沒還回來＝退回圖片版；點配件後大字名牌顯示 2 秒
// 台詞（tools/voice/build_lines.py「10-12 寵物換裝」區塊照這裡登記）
export const LINES = {
  intro: "幫寵物換衣服吧！",
  idle: "點一下衣服，幫牠穿上！",
  again: "換一件試試看！",
  praise: ["好可愛！", "好漂亮喔！", "好帥喔！"],
  lockDeliver: "去送貨，就可以拿到喔！",
  lockBoth: "送貨或扭蛋，都可以拿到喔！",
};
// 沒拿到的配件：格子角落的小圖示（🚚 送貨拿得到、扭蛋膠囊＝扭蛋抽得到；寧次 10-12：🎰 是賭博意象、改用遊戲自己的藍色膠囊圖，載不到退回 🪙）；點那格用說的（LINES.lockDeliver／lockBoth）
const GET_ICON = { deliver: "🚚", gacha: "capsule_blue", gachaAlt: "🪙" };
const SLOT_ICON = { head: "🎩", side: "🎀", back: "🎒" };
const SLOT_VIEW = { head: -0.55, side: -0.75, back: Math.PI + 0.5 };   // 穿上某部位時轉到看得清楚的角度（0＝正面）

// ---------- models.json（清單、掛點、配件微調）：整頁共用一份 ----------
let modelsP = null;
export function modelsInfo() {
  return modelsP || (modelsP = fetch(MODELS + "models.json", { cache: "no-cache" }).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
    .then(j => ({ set: new Set(j.models || []), anchors: j.anchors || {}, fit: j.wear_fit || {} })));
}

// ---------- 模型裝配（換裝畫面與 dress-lab 合身檢查共用）----------
// createDressRig() → { pet(id), item(id, petInfo, fit), dressed(id, wear, stage), dispose() }
// 寵物縮放跟 hub3d loadAny 一樣：高度＝1、腳踩 y=0；掛點＝models.json anchors（原始座標）× 同一個縮放矩陣；配件縮放＝同一倍率。
export function createDressRig() {
  const loader = new GLTFLoader(), cache = new Map(), owned = new Set();
  const lambert = new Map();
  const glb = url => { if (!cache.has(url)) cache.set(url, loader.loadAsync(url).then(g => { prep(g.scene); return g; })); return cache.get(url); };
  function prep(root) {                                    // 換成 Lambert（跟小島一樣的光感），貼圖／幾何記下來關掉時釋放
    root.traverse(o => {
      if (!o.isMesh) return;
      owned.add(o.geometry);
      const src = o.material;
      if (!lambert.has(src)) {
        const m = new THREE.MeshLambertMaterial({ map: src.map || null, color: src.color || 0xffffff, vertexColors: !!o.geometry.attributes.color, transparent: !!src.transparent, opacity: src.opacity ?? 1, side: src.side });
        lambert.set(src, m); owned.add(m); if (src.map) owned.add(src.map); owned.add(src);
      }
      o.material = lambert.get(src); o.castShadow = o.receiveShadow = true;
    });
  }
  async function pet(id) {
    const info = await modelsInfo();
    if (!info.set.has(id)) throw new Error("models.json 沒有這隻寵物：" + id);
    const g = await glb(MODELS + id + ".glb");
    const obj = g.scene.clone(true);
    const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
    const k = 1 / (sz.y || 1); obj.scale.multiplyScalar(k);
    const b2 = new THREE.Box3().setFromObject(obj); obj.position.y -= b2.min.y;
    obj.updateMatrix();
    return { id, obj, fitM: obj.matrix.clone(), fitScale: k, anchors: info.anchors[id] || null, fit: info.fit };
  }
  // 配件：原點＝掛點；位置＝(掛點＋微調 p)×縮放矩陣、大小＝縮放×微調 s、旋轉＝微調 r（度）
  async function item(id, P) {
    const pose = RW.wearPose(P.fit, P.id, id);
    if (pose.hide) return null;
    const info = await modelsInfo();
    if (!info.set.has(id)) return null;
    const g = await glb(MODELS + id + ".glb");
    const m = g.scene.clone(true);
    const slot = RW.WEAR_BY_ID[id] ? RW.WEAR_BY_ID[id].slot : "head", key = RW.WEAR_ANCHOR[slot];
    const dflt = { head: [0, 1.43, 0], back: [0, 1.05, -0.625], head_side: [0.3, 1.4, 0.3] }[key];
    const a = (P.anchors && P.anchors[key]) || dflt;
    m.position.set(a[0] + pose.p[0], a[1] + pose.p[1], a[2] + pose.p[2]).applyMatrix4(P.fitM);
    m.scale.setScalar(P.fitScale * pose.s);
    m.rotation.set(pose.r[0] * DEG, pose.r[1] * DEG, pose.r[2] * DEG);
    m.userData.wear = id;
    return m;
  }
  // 一隻穿好的寵物（合身檢查用）：wear＝{head, side, back}；寶寶頭上空著就戴小芽
  async function dressed(id, wear = {}, stage = 2) {
    const P = await pet(id), g = new THREE.Group(); g.add(P.obj);
    const ids = RW.WEAR_SLOTS.map(s => wear[s]).filter(Boolean);
    if (stage === 1 && !wear.head) ids.push("baby_tuft");
    for (const m of await Promise.all(ids.map(i => item(i, P).catch(() => null)))) if (m) g.add(m);
    return g;
  }
  function dispose() {
    for (const x of owned) { try { x.dispose && x.dispose(); } catch (e) {} }
    owned.clear(); cache.clear(); lambert.clear();
  }
  return { pet, item, dressed, dispose, glb };
}

// ---------- 小工具 ----------
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function angleTo(from, to) { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

// =====================================================================
export function createDress(root, api) {
  let isOpen = false, token = 0, cur = null, list = [];
  let dom = null, three = null, ro = null;
  let wearCount = 0, tapCount = 0, idleT = null;

  const rw = () => api.rw();
  const later = (fn, ms) => { const tk = token; return api.later(() => { if (isOpen && tk === token) fn(); }, ms); };
  const petInfo = id => list.find(p => p.id === id);
  const stageOf = id => { const p = rw().pets && rw().pets[id]; return (p && p.stage) || 2; };   // 階段一律看存檔（開著的時候長大也對）

  // ---------- 畫面 ----------
  function build() {
    root.innerHTML = "";
    const d = el("div", "dress");
    const top = el("div", "dr-top");
    const strip = el("div", "dr-pets");
    for (const p of list) {
      const b = el("button", "dr-pet"); b.dataset.id = p.id; b.setAttribute("aria-label", p.name);
      const im = el("img"); im.src = `${IMG}pets/${p.id}.webp`; im.alt = ""; im.draggable = false; b.appendChild(im);
      if (p.stage >= 3) b.appendChild(el("span", "dr-star", "⭐"));
      b.onclick = () => selectPet(p.id, true);
      strip.appendChild(b);
    }
    const done = el("button", "dr-done"); done.appendChild(el("span", "dr-ic", "✔️")); done.appendChild(el("span", "dr-dt", "穿好了"));
    done.onclick = () => { api.play("select"); api.talk(LINES.praise[1]); close(); };
    top.appendChild(strip); top.appendChild(done);

    const main = el("div", "dr-main");
    const stage = el("div", "dr-stage");
    const name = el("div", "dr-name");
    const wn = el("div", "dr-wn"); wn.setAttribute("aria-live", "polite");   // 點配件：配件名大字跳出來 2 秒（格子裡不放字，寧次 10-12）
    stage.appendChild(name); stage.appendChild(wn);
    const closet = el("div", "dr-closet");
    const tiles = {};
    for (const s of RW.WEAR_SLOTS) {
      const g = el("div", "dr-group"); g.dataset.slot = s;
      const gt = el("div", "dr-gt"); gt.appendChild(el("span", "dr-gi", SLOT_ICON[s])); gt.appendChild(el("span", "", RW.WEAR_SLOT_NAME[s])); g.appendChild(gt);
      const row = el("div", "dr-items");
      for (const w of RW.WEAR.filter(x => x.slot === s)) {
        const b = el("button", "dr-item"); b.dataset.id = w.id; b.setAttribute("aria-label", w.name);
        const pic = el("div", "dr-pic");
        const im = el("img"); im.src = `${IMG}wear_${w.id}.webp`; im.alt = ""; im.draggable = false;
        im.onerror = () => { im.remove(); pic.appendChild(el("span", "dr-emo", w.e)); };
        pic.appendChild(im); b.appendChild(pic);   // 格子只放圖（名字字太小看不清：點了用說的＋預覽區大字名牌）
        const get = el("span", "dr-get"); get.setAttribute("aria-hidden", "true");   // 去哪裡拿（只有沒拿到時顯示）
        if (RW.DELIVER_GIFTS.includes(w.id)) get.appendChild(el("i", "dr-gi-d", GET_ICON.deliver));
        if (RW.GACHA_WEAR.includes(w.id)) {
          const g = el("i", "dr-gi-g"), ci = el("img"); ci.src = `${IMG}${GET_ICON.gacha}.webp`; ci.alt = ""; ci.draggable = false;
          ci.onerror = () => { ci.remove(); g.textContent = GET_ICON.gachaAlt; };
          g.appendChild(ci); get.appendChild(g);
        }
        b.appendChild(get);
        b.appendChild(el("span", "dr-ok", "✓"));
        b.onclick = () => tapItem(w.id);
        row.appendChild(b); tiles[w.id] = b;
      }
      g.appendChild(row); closet.appendChild(g);
    }
    main.appendChild(stage); main.appendChild(closet);
    d.appendChild(top); d.appendChild(main);
    root.appendChild(d);
    dom = { d, strip, stage, name, wn, closet, tiles, done };
  }
  // 點配件：預覽區大字名牌（跟寵物名牌同級、≥4.6vmin、有注音）顯示 2 秒；沒拿到的用灰紫字
  let wnTok = 0;
  function showWearName(w, locked) {
    if (!dom) return;
    const e = dom.wn, my = ++wnTok;
    e.textContent = w.name; e.classList.toggle("lock", !!locked);
    e.classList.remove("show"); void e.offsetWidth; e.classList.add("show");
    later(() => { if (my === wnTok && dom) dom.wn.classList.remove("show"); }, NAME_MS);
  }

  function refreshTiles() {
    if (!dom || !cur) return;
    const r = rw(), w = RW.wearOf(r, cur);
    for (const [id, b] of Object.entries(dom.tiles)) {
      const can = RW.canWear(r, cur, id), on = w[RW.WEAR_BY_ID[id].slot] === id;
      b.classList.toggle("lock", !can); b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    for (const b of dom.strip.children) b.classList.toggle("on", b.dataset.id === cur);
  }

  // ---------- 3D 預覽 ----------
  function initThree() {
    let renderer, canvas, context;
    try {
      canvas = document.createElement("canvas");                     // 先自己要 context：要不到就安靜退回圖片版（three 失敗會印 console error）
      context = canvas.getContext("webgl2", { antialias: true, alpha: true, powerPreference: "low-power" });
      if (!context) return null;
      renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true });
    } catch (e) {                                                    // context 要到了、three 卻建不起來：自己把 context 還掉（不然一直佔著一個 WebGL 名額）
      try { const x = context && context.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); } catch (e2) {}
      if (canvas) canvas.width = canvas.height = 1;
      return null;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const cv = renderer.domElement; cv.className = "dr-cv";
    dom.stage.insertBefore(cv, dom.name);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0xf4f9ff, 0xe9dcc6, 1.55));
    const sun = new THREE.DirectionalLight(0xfff4e4, 2.1); sun.position.set(-1.6, 3.2, 2.4);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -1.4, right: 1.4, top: 1.6, bottom: -0.4, near: 0.5, far: 8 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xe6f0ff, 0.55); fill.position.set(2, 1.2, 1.5); scene.add(fill);
    const made = [];                                              // 這裡自己做的幾何／材質（關掉時釋放）
    const mk = x => (made.push(x), x);
    // 轉盤：奶油色圓台＋粉紅邊
    const ped = new THREE.Group(); scene.add(ped);
    const top = new THREE.Mesh(mk(new THREE.CylinderGeometry(0.78, 0.8, 0.1, 48)), mk(new THREE.MeshLambertMaterial({ color: "#fff6e6" })));
    top.position.y = -0.05; top.receiveShadow = true; ped.add(top);
    const rim = new THREE.Mesh(mk(new THREE.CylinderGeometry(0.84, 0.88, 0.12, 48)), mk(new THREE.MeshLambertMaterial({ color: "#ffb3c7" })));
    rim.position.y = -0.13; ped.add(rim);
    const dots = new THREE.Group(); ped.add(dots);                 // 圓台邊緣一圈小圓點（轉的時候看得出在轉）
    const dotGeo = mk(new THREE.SphereGeometry(0.035, 10, 6)), dotMats = ["#ffd54a", "#7ed66b", "#5fb0f5", "#b07cf0"].map(c => mk(new THREE.MeshLambertMaterial({ color: c })));
    for (let k = 0; k < 16; k++) { const s = new THREE.Mesh(dotGeo, dotMats[k % 4]); const a = k / 16 * Math.PI * 2; s.position.set(Math.cos(a) * 0.86, -0.1, Math.sin(a) * 0.86); dots.add(s); }
    const spin = new THREE.Group(); scene.add(spin);               // 轉盤（寵物、配件都在這裡，跟著轉）
    const hop = new THREE.Group(); spin.add(hop);                   // 跳（上下、壓扁）
    const hit = new THREE.Mesh(mk(new THREE.BoxGeometry(1.4, 1.6, 1.4)), mk(new THREE.MeshBasicMaterial({ visible: false }))); hit.position.y = 0.75; spin.add(hit);
    const sparkMat = mk(new THREE.MeshBasicMaterial({ color: "#fff3a0", toneMapped: false })), sparkGeo = mk(new THREE.OctahedronGeometry(0.06, 0));
    const fxGeo = mk(new THREE.OctahedronGeometry(0.045, 0)), fxMats = ["#ff8fb6", "#ffd54a", "#7ed66b", "#5fb0f5", "#b07cf0", "#ffffff"].map(c => mk(new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
    const rig = createDressRig();
    const T = { renderer, scene, cam, sun, spin, hop, hit, ped, dots, rig, made, sparkMat, sparkGeo, fxGeo, fxMats,
      P: null, petObj: null, worn: new Map(), spark: null, fx: [], loadTok: 0,
      ang: -0.55, target: null, holdUntil: 0, drag: null, jumpT: -1, raf: 0, last: 0, frames: 0, lostT: 0, lost: 0 };
    // 被系統收走（iPad 切到背景太久、記憶體不夠）：先等瀏覽器還回來（three 會自己重建）；3 秒沒回來＝退回圖片版，照樣可以穿脫
    T.onLost = e => { e.preventDefault(); T.lost++; clearTimeout(T.lostT); T.lostT = setTimeout(() => { T.lostT = 0; if (three === T && isOpen) to2D(); }, LOST_MS); };
    T.onRestored = () => { clearTimeout(T.lostT); T.lostT = 0; };
    cv.addEventListener("webglcontextlost", T.onLost); cv.addEventListener("webglcontextrestored", T.onRestored);
    return T;
  }
  function to2D() {                                                // 3D 預覽救不回來 → 圖片版（跟一開始就沒有 WebGL 一樣）
    disposeThree();
    if (!dom) return;
    dom.stage.classList.add("no3d"); fallbackShow();
  }

  function camFit() {
    if (!three || !dom) return;
    const r = dom.stage.getBoundingClientRect(), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    three.renderer.setSize(w, h, false);
    const cam = three.cam, asp = w / h; cam.aspect = asp;
    const halfV = Math.tan(cam.fov / 2 * DEG), needH = 2.35, needW = 1.95;   // 寵物＋翅膀＋高帽子＋轉盤都要放得下
    const dist = Math.max(needH / 2 / halfV, needW / 2 / (halfV * asp));
    const el2 = 13 * DEG, ty = 0.6;
    cam.position.set(0, ty + Math.sin(el2) * dist, Math.cos(el2) * dist); cam.lookAt(0, ty - 0.04, 0);
    cam.updateProjectionMatrix();
  }

  async function showPet(id) {
    if (!three) { fallbackShow(); return; }
    const T = three, tk = ++T.loadTok;
    let P;
    try { P = await T.rig.pet(id); } catch (e) { console.warn("[dress]", e); return; }
    if (!isOpen || tk !== T.loadTok || !three) return;
    if (T.petObj) T.hop.remove(T.petObj);
    for (const m of T.worn.values()) T.hop.remove(m);
    T.worn.clear();
    if (T.spark) { T.hop.remove(T.spark); T.spark = null; }
    T.P = P; T.petObj = P.obj; T.hop.add(P.obj);
    const st = stageOf(id);
    if (st >= 3) {                                                // 超級：身邊三顆閃光（跟小島一樣）
      const sp = new THREE.Group(); T.spark = sp; T.hop.add(sp);
      for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(T.sparkGeo, T.sparkMat); m.position.set(Math.cos(k * 2.1) * 0.62, 0.45 + k * 0.25, Math.sin(k * 2.1) * 0.62); sp.add(m); }
    }
    await syncWorn();
  }
  // 依存檔把 3D 上的配件對齊（多的拿掉、少的載入）；寶寶頭上空著＝小芽
  async function syncWorn() {
    if (!three || !three.P || !cur) return;
    const T = three, P = T.P, tk = T.loadTok;
    const w = RW.wearOf(rw(), cur), st = stageOf(cur);
    const want = RW.WEAR_SLOTS.map(s => w[s]).filter(Boolean);
    if (st === 1 && !w.head) want.push("baby_tuft");
    for (const [id, m] of [...T.worn]) if (!want.includes(id)) { T.hop.remove(m); T.worn.delete(id); }
    const need = want.filter(id => !T.worn.has(id));
    const ms = await Promise.all(need.map(id => T.rig.item(id, P).catch(() => null)));
    if (!isOpen || !three || tk !== T.loadTok || T.P !== P) return;
    const now = RW.wearOf(rw(), cur), still = RW.WEAR_SLOTS.map(s => now[s]).filter(Boolean);
    if (st === 1 && !now.head) still.push("baby_tuft");
    need.forEach((id, k) => { const m = ms[k]; if (m && still.includes(id) && !T.worn.has(id)) { T.hop.add(m); T.worn.set(id, m); } });
  }

  function jump(big = false) {
    if (three) { three.jumpT = 0; three.jumpBig = big; return; }
    const im = dom && dom.stage.querySelector(".dr-fb-pet"); if (!im) return;
    im.classList.remove("hop"); void im.offsetWidth; im.classList.add("hop");
  }
  function burst(slot) {                                          // 穿上時冒出一小把彩色碎片
    if (!three || !three.P) return;
    const T = three, key = RW.WEAR_ANCHOR[slot], a = (T.P.anchors && T.P.anchors[key]) || [0, 1.4, 0];
    const at = new THREE.Vector3(...a).applyMatrix4(T.P.fitM);
    for (let k = 0; k < 12; k++) {
      const m = new THREE.Mesh(T.fxGeo, T.fxMats[k % T.fxMats.length]);
      m.position.copy(at); T.hop.add(m);
      const th = Math.random() * Math.PI * 2;
      T.fx.push({ m, v: new THREE.Vector3(Math.cos(th) * (0.6 + Math.random() * 0.6), 1.2 + Math.random() * 0.9, Math.sin(th) * (0.6 + Math.random() * 0.6)), t: 0 });
    }
  }
  function turnTo(slot) { if (!three) return; three.target = SLOT_VIEW[slot]; three.holdUntil = performance.now() + 2600; }

  function frame(now) {
    const T = three; if (!T) return;
    T.raf = requestAnimationFrame(frame);
    if (now - T.last < 1000 / FPS - 2) return;
    const dt = Math.min(0.1, (now - (T.last || now)) / 1000); T.last = now;
    // 轉盤：拖的時候跟手；剛穿上→轉到看得到的角度停一下；平常慢慢轉
    if (!T.drag) {
      if (T.target != null) { const d = angleTo(T.ang, T.target); const step = Math.sign(d) * Math.min(Math.abs(d), dt * 4.5); T.ang += step; if (Math.abs(d) < 0.01) T.target = null; }
      else if (now > T.holdUntil) T.ang += dt * 0.35;
    }
    T.spin.rotation.y = T.ang; T.dots.rotation.y = T.ang;
    // 跳
    if (T.jumpT >= 0) {
      T.jumpT += dt; const D = T.jumpBig ? 0.62 : 0.5, u = T.jumpT / D;
      if (u >= 1) { T.jumpT = -1; T.hop.position.y = 0; T.hop.scale.set(1, 1, 1); }
      else { const H = T.jumpBig ? 0.42 : 0.3; T.hop.position.y = H * Math.sin(Math.PI * u); const sq = u < 0.15 ? 1 - u * 0.8 : u > 0.85 ? 1 - (1 - u) * 0.8 : 1 + 0.06 * Math.sin(Math.PI * u); T.hop.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); }
    }
    if (T.spark) T.spark.rotation.y += dt * 1.2;
    for (let i = T.fx.length - 1; i >= 0; i--) {
      const f = T.fx[i]; f.t += dt; f.v.y -= dt * 3.2; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += dt * 6; f.m.rotation.z += dt * 5;
      f.m.scale.setScalar(Math.max(0.01, 1 - f.t / 0.9));
      if (f.t > 0.9) { T.hop.remove(f.m); T.fx.splice(i, 1); }
    }
    T.renderer.render(T.scene, T.cam); T.frames++;
  }

  // 手指：左右拖＝轉寵物；點一下（移動 < 24px、按住 < 0.8 秒）點到寵物＝跳一下
  function bindPointer() {
    const cv = three.renderer.domElement;
    cv.addEventListener("pointerdown", e => {
      const T = three; if (!T) return;
      T.drag = { id: e.pointerId, x0: e.clientX, x: e.clientX, t0: performance.now(), moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    });
    cv.addEventListener("pointermove", e => {
      const T = three; if (!T || !T.drag || T.drag.id !== e.pointerId) return;
      const dx = e.clientX - T.drag.x; T.drag.x = e.clientX;
      if (Math.abs(e.clientX - T.drag.x0) > TAP_MOVE * 0.5) T.drag.moved = true;
      T.ang += dx * 0.012; T.target = null;
    });
    const up = e => {
      const T = three; if (!T || !T.drag || T.drag.id !== e.pointerId) return;
      const dr = T.drag; T.drag = null; T.holdUntil = performance.now() + 2500;
      if (e.type === "pointerup" && Math.abs(e.clientX - dr.x0) < TAP_MOVE && performance.now() - dr.t0 < TAP_MS) tapAt(e.clientX, e.clientY);
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tapAt(x, y) {
    const T = three; if (!T) return;
    const r = T.renderer.domElement.getBoundingClientRect();
    ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, T.cam);
    if (ray.intersectObject(T.hit, false).length) tapPet();
  }
  function tapPet() {
    jump(true); api.play("tap");
    tapCount++; if (tapCount % 3 === 0) api.talk(LINES.praise[(tapCount / 3) % LINES.praise.length]);
  }

  // WebGL 開不了：寵物圖片＋穿著的配件小圖
  function fallbackShow() {
    if (!dom) return;
    let box = dom.stage.querySelector(".dr-fb");
    if (!box) { box = el("div", "dr-fb"); dom.stage.insertBefore(box, dom.name); box.onclick = () => tapPet(); }
    box.innerHTML = "";
    const im = el("img", "dr-fb-pet"); im.src = `${IMG}pets/${cur}.webp`; im.alt = ""; box.appendChild(im);
    const row = el("div", "dr-fb-wear"), w = RW.wearOf(rw(), cur);
    for (const s of RW.WEAR_SLOTS) if (w[s]) { const i = el("img"); i.src = `${IMG}wear_${w[s]}.webp`; i.alt = ""; row.appendChild(i); }
    box.appendChild(row);
  }

  // ---------- 操作 ----------
  function selectPet(id, speak) {
    if (!petInfo(id) || !isOpen) return;
    if (id === cur) { if (speak) { jump(); api.play("tap"); } return; }
    cur = id; api.play("tap");
    const p = petInfo(id); dom.name.textContent = p.name;
    if (speak) api.say(p.name);
    refreshTiles();
    const b = dom.strip.querySelector(`[data-id="${id}"]`); if (b && b.scrollIntoView) try { b.scrollIntoView({ block: "nearest", inline: "center", behavior: speak ? "smooth" : "auto" }); } catch (e) {}
    if (three) { three.ang = -0.55; three.target = null; three.holdUntil = performance.now() + 1500; }
    showPet(id);
    jump();
  }
  function tapItem(id) {
    if (!isOpen || !cur) return;
    const w = RW.WEAR_BY_ID[id], r = rw(), b = dom.tiles[id];
    armIdle();
    showWearName(w, !RW.canWear(r, cur, id));                      // 不管穿、脫、還沒拿到：大字名牌都跳出來（看字＋聽音對起來）
    if (!RW.canWear(r, cur, id)) {                                 // 還沒拿到：只提示，不穿
      api.play("tap"); api.talk(RW.GACHA_WEAR.includes(id) ? LINES.lockBoth : LINES.lockDeliver);
      b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake");
      return;
    }
    const on = RW.wearOf(r, cur)[w.slot] === id;
    if (!RW.setWear(r, cur, w.slot, on ? null : id)) return;
    api.save();
    refreshTiles();
    if (on) { api.play("pop"); jump(); }                         // 再點一次＝脫下
    else {
      api.play("wear"); api.say(w.name); jump(true); burst(w.slot); turnTo(w.slot);
      wearCount++;
      if (wearCount % 2 === 0) later(() => api.talk(LINES.praise[(wearCount / 2 - 1) % LINES.praise.length]), 1400);
    }
    if (three) syncWorn(); else fallbackShow();
  }
  // 閒置提示：開了 12 秒都沒穿過＝「點一下衣服…」；穿過之後 15 秒沒動作＝「換一件試試看！」（各一次）
  let saidIdle = false, saidAgain = false;
  function armIdle() {
    const tk = token, my = {}; idleT = my;
    later(() => {
      if (idleT !== my || tk !== token) return;
      if (wearCount === 0 && !saidIdle) { saidIdle = true; api.talk(LINES.idle); }
      else if (wearCount > 0 && !saidAgain) { saidAgain = true; api.talk(LINES.again); }
    }, wearCount === 0 ? 12000 : 15000);
  }

  function relayout() {
    if (!dom) return;
    const rr = root.getBoundingClientRect(), portrait = rr.height > rr.width * 1.05;
    dom.d.classList.toggle("portrait", portrait);                  // 直式：預覽在上、衣櫃在下
    const r = dom.d.querySelector(".dr-main").getBoundingClientRect();
    // 衣櫃格子：每組一排最多 4 格，三組疊起來要放得下（不捲動）；橫式衣櫃最多佔 58% 寬、直式最多佔 60% 高（預覽要留夠大）；最小 56px
    const vmin = Math.min(innerWidth, innerHeight) / 100;
    const gap = 1.4 * vmin, title = GROUP_T * vmin, grpPadX = 2.6 * vmin, grpPadY = 2.8 * vmin;
    // 直式：頭上＋旁邊排第一列（6 格）、背上第二列；橫式：三組上下疊（每列 4 格）
    const cw = portrait ? r.width : r.width * 0.58, ch = portrait ? r.height * 0.56 : r.height;
    const byW = portrait ? (cw - 2 * grpPadX - gap * 5) / 6 : (cw - grpPadX - gap * 3) / 4;
    const byH = portrait ? (ch - 2 * (title + grpPadY) - gap) / 2 : (ch - 3 * (title + grpPadY) - gap * 2) / 3;
    const tile = Math.max(56, Math.min(byW, byH / TILE_H, 30 * vmin));
    dom.d.style.setProperty("--tile", tile.toFixed(1) + "px");
    camFit();
  }

  // ---------- 開／關 ----------
  function open(petId) {
    if (isOpen) close(true);
    token++; isOpen = true; wearCount = 0; tapCount = 0; saidIdle = saidAgain = false;
    list = (api.pets() || []).filter(p => p && RW.PET[p.id]);
    if (!list.length) list = [{ id: "bear", name: RW.PET.bear.name, stage: 2 }];
    build();
    root.classList.remove("hidden");
    three = initThree();
    if (three) { bindPointer(); three.raf = requestAnimationFrame(frame); }
    else dom.stage.classList.add("no3d");
    if (typeof ResizeObserver === "function") { ro = new ResizeObserver(() => relayout()); ro.observe(dom.stage); ro.observe(dom.d); }
    cur = null;
    selectPet(petInfo(petId) ? petId : list[0].id, false);
    relayout();
    api.talk(LINES.intro);
    armIdle();
  }
  function disposeThree() {
    const T = three; if (!T) return; three = null;
    cancelAnimationFrame(T.raf); T.raf = 0;
    const cv = T.renderer.domElement;
    clearTimeout(T.lostT); T.lostT = 0;                               // 關掉／退回圖片版：「3 秒後退回」的計時一起清掉
    cv.removeEventListener("webglcontextlost", T.onLost); cv.removeEventListener("webglcontextrestored", T.onRestored);
    try { T.rig.dispose(); } catch (e) {}
    for (const x of T.made) { try { x.dispose(); } catch (e) {} }
    try { T.sun.shadow.map && T.sun.shadow.map.dispose(); } catch (e) {}
    try { T.renderer.renderLists.dispose(); T.renderer.dispose(); T.renderer.forceContextLoss(); } catch (e) {}
    cv.remove();
    T.scene.clear();
    cv.width = cv.height = 1;                                         // Safari：畫布縮到 1×1 才會放掉背景緩衝（里維 10-12）
  }
  function close(silent) {
    if (!isOpen) return;
    isOpen = false; token++; idleT = null;
    if (ro) { ro.disconnect(); ro = null; }
    disposeThree();
    root.innerHTML = ""; dom = null; cur = null;
    root.classList.add("hidden");
    if (!silent && api.onClose) api.onClose();
  }

  // 測試用
  const debug = {
    state: () => ({ open: isOpen, pet: cur, pets: list.map(p => p.id), wear: cur ? RW.wearOf(rw(), cur) : null, worn: three ? [...three.worn.keys()].sort() : [],
      gl: !!three, raf: !!(three && three.raf), frames: three ? three.frames : 0, angle: three ? three.ang : 0, jumping: !!(three && three.jumpT >= 0), fx: three ? three.fx.length : 0,
      wname: dom && dom.wn.classList.contains("show") ? dom.wn.textContent : "", wlock: !!(dom && dom.wn.classList.contains("lock")), fb: !!(dom && dom.stage.querySelector(".dr-fb")), lostWait: !!(three && three.lostT) }),
    ready: async () => { for (let i = 0; i < 100; i++) { const T = three; if (!isOpen) return false; if (!T) return true; const w = RW.wearOf(rw(), cur); const st = stageOf(cur); const want = RW.WEAR_SLOTS.map(s => w[s]).filter(Boolean); if (st === 1 && !w.head) want.push("baby_tuft"); if (T.P && T.P.id === cur && want.every(id => T.worn.has(id)) && T.worn.size === want.length) return true; await new Promise(r => setTimeout(r, 50)); } return false; },
    tapPet, selectPet: id => selectPet(id, true), tapItem,
    tapCenter: () => { if (!three) return false; const r = three.renderer.domElement.getBoundingClientRect(); tapAt(r.left + r.width / 2, r.top + r.height * 0.55); return true; },
  };
  return { open, close: silent => close(!!silent), relayout, debug, isOpen: () => isOpen };   // close(true)＝不呼叫 onClose（主程式換畫面時強制收掉用）
}
