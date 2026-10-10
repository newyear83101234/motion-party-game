// ===================== 注音小島 3D 選單：天氣外掛 =====================
// 晴天／陰天／下雨／雷雨／颱風＋雨後彩虹。只透過 hub.use() 給的 ctx 碰場景，自己建的東西 dispose() 全部收掉、改過的燈光／海面／樹材質全部還原。
// 用法（zhuyin.js）：
//   import { WEATHERS, pickWeather, weatherPlugin, createWeatherSound } from "./zhuyin-weather.js";
//   const snd = createWeatherSound(); snd.start(audioCtx);              // 可選：程式合成雨聲／風聲／遠雷（晴、陰天無聲）
//   const w = hub.use(ctx => weatherPlugin(ctx, { kind: pickWeather(), sound: snd }));
//   w.set("rain")  w.set("sunny", { instant: true })  w.get()  w.rainbow()  w.flash()
//   有傳 sound：外掛換天氣時會幫忙 sound.setKind()、閃電時打遠雷；選單藏起來（進遊戲）時請自己 snd.setVolume(0)，回選單再調回來。
// 畫面組成（每樣最多 1 個 draw call，用不到就整個不畫）：
//   雲＝一個 InstancedMesh（每朵 6 顆低多邊形泡泡）｜雲影＝一張高空半透明貼圖慢慢飄｜雨絲＝一個 BufferGeometry，位置全在 shader 依時間算（每格只改 uniform）
//   水花＝地面／海面小圈圈（shader）｜落葉＝InstancedMesh｜閃電＝畫面白閃（CSS）＋半球光亮一下＋卡通閃電｜彩虹＝島後面的半透明弧
//   樹搖＝把樹的 InstancedMesh 換成 clone 出來的材質（onBeforeCompile 依頂點高度加風擺），dispose 換回原材質
// 鏡頭座標（雲、雨用）：R＝螢幕右方（水平）、F＝水平朝鏡頭、Y＝上；螢幕 x＝R·P，螢幕 y＝cos(俯角)·y − sin(俯角)·(F·P)

const WEATHER_KEYS = ["sunny", "cloudy", "rain", "storm", "typhoon"];
// hemiK／sunK／shadowK：原本強度的倍數；tint：燈光往該天氣色調混多少；sea：海往灰藍混多少
// clouds：幾朵雲；cloudGray：雲多灰；cloudSpeed：雲飄速度（單位／秒）；shade：地上雲影深淺（≤ 0.1 就整片不畫，省一個全螢幕透明面）
// rain：雨量（0–1，最多 760 條）；rainSpeed：雨滴速度；slant：每落下 1 單位往右飄多少；splash：水花多寡
// wind：樹擺幅；lean：樹被吹斜；leaves：飛葉片數；vignette：畫面四周暗角；lightning：閃電間隔秒數 [最短, 最長]
export const WEATHERS = {
  sunny: { name: "晴天", emoji: "☀️", hemiK: 1, sunK: 1, shadowK: 1, tint: 0, sky: "#f4f9ff", ground: "#e9dcc6", sunTint: "#fff4e4", sea: 0,
    clouds: 5, cloudGray: 0, cloudSpeed: 0.28, shade: 0, rain: 0, rainSpeed: 9, slant: 0.12, splash: 0, wind: 0.012, lean: 0, leaves: 0, vignette: 0, lightning: null },
  cloudy: { name: "陰天", emoji: "☁️", hemiK: 0.9, sunK: 0.42, shadowK: 0.38, tint: 0.62, sky: "#dfe6ef", ground: "#b9b7b3", sunTint: "#e9eef5", sea: 0.42,
    clouds: 9, cloudGray: 0.22, cloudSpeed: 0.42, shade: 0.18, rain: 0, rainSpeed: 9, slant: 0.12, splash: 0, wind: 0.03, lean: 0.004, leaves: 0, vignette: 0.1, lightning: null },
  rain: { name: "下雨", emoji: "🌧️", hemiK: 0.78, sunK: 0.28, shadowK: 0.24, tint: 0.66, sky: "#c3cfde", ground: "#90949b", sunTint: "#d9e2ee", sea: 0.62,
    clouds: 10, cloudGray: 0.42, cloudSpeed: 0.62, shade: 0, rain: 0.58, rainSpeed: 9, slant: 0.16, splash: 0.55, wind: 0.05, lean: 0.012, leaves: 0, vignette: 0.24, lightning: null },
  storm: { name: "雷雨", emoji: "⛈️", hemiK: 0.68, sunK: 0.2, shadowK: 0.15, tint: 0.72, sky: "#aab7cc", ground: "#7f838d", sunTint: "#ccd5e5", sea: 0.74,
    clouds: 11, cloudGray: 0.5, cloudSpeed: 0.95, shade: 0, rain: 0.85, rainSpeed: 11, slant: 0.3, splash: 0.8, wind: 0.08, lean: 0.03, leaves: 6, vignette: 0.36, lightning: [8, 16] },
  typhoon: { name: "颱風", emoji: "🌀", hemiK: 0.6, sunK: 0.16, shadowK: 0.1, tint: 0.78, sky: "#a2b0c8", ground: "#787c8a", sunTint: "#c5cfe2", sea: 0.8,
    clouds: 12, cloudGray: 0.52, cloudSpeed: 3.2, shade: 0, rain: 1, rainSpeed: 12, slant: 1.0, splash: 0.9, wind: 0.13, lean: 0.11, leaves: 28, vignette: 0.5, lightning: [12, 21] },
};
const WEIGHTS = { sunny: 40, cloudy: 25, rain: 18, storm: 10, typhoon: 7 };
const WET = new Set(["rain", "storm", "typhoon"]);      // 從這些轉回晴天 → 出彩虹
const SEA_GRAY = { deep: "#4f7590", shallow: "#8cb0b4", grid: "#7495ad" };
const FADE = 2.5;                                       // 換天氣淡入淡出秒數
const MAX_DROPS = 760, MAX_SPLASH = 260, MAXC = 14, PUFF = 6, MAXL = 30;
const RAINBOW_LIFE = 25;

// 加權隨機：晴 40%、陰 25%、雨 18%、雷雨 10%、颱風 7%
export function pickWeather(rand = Math.random) {
  let r = rand() * 100;
  for (const k of WEATHER_KEYS) { r -= WEIGHTS[k]; if (r < 0) return k; }
  return "sunny";
}

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = x => x * x * (3 - 2 * x);

// 雲的形狀：[沿螢幕右, 上, 沿鏡頭方向, 大小]（scale 0 = 這朵沒有這顆泡泡）
const CLOUD_TPL = [
  [[0, 0, 0, 1], [0.92, -0.14, 0.15, 0.74], [-0.94, -0.16, -0.1, 0.7], [0.3, 0.44, -0.05, 0.66], [-0.4, 0.3, 0.22, 0.58], [1.6, -0.3, 0.05, 0.46]],
  [[0, 0, 0, 0.92], [0.82, 0.04, -0.1, 0.8], [-0.78, -0.12, 0.1, 0.66], [1.55, -0.24, 0, 0.5], [0.45, 0.5, 0.05, 0.6], [-1.4, -0.3, -0.05, 0.44]],
  [[0, 0, 0, 0.86], [0.72, -0.12, 0.05, 0.62], [-0.68, -0.14, 0, 0.58], [0.08, 0.4, 0, 0.56], [0, 0, 0, 0], [0, 0, 0, 0]],
];
const LEAF_COLORS = ["#7cc25a", "#93d06c", "#5f9c3a", "#f7a257", "#f08a3c", "#e8c75a"];
// 閃電亮度曲線（秒, 0–1）：只亮一下就慢慢收（5 歲小孩、光敏：不連閃）；0.3 秒後一定是 0（燈光才會完全還原）
const FLASH_END = 0.3, FLASH_PEAK = 0.05;
const FLASH_KEYS = [[0, 0], [FLASH_PEAK, 1], [FLASH_END, 0]];
function flashEnv(s) {
  if (s <= 0 || s >= FLASH_END) return 0;
  for (let i = 1; i < FLASH_KEYS.length; i++) { const [t1, v1] = FLASH_KEYS[i], [t0, v0] = FLASH_KEYS[i - 1]; if (s <= t1) return v0 + (v1 - v0) * (s - t0) / (t1 - t0); }
  return 0;
}

export function weatherPlugin(ctx, { kind = "sunny", sound = null, onLightning = null } = {}) {
  const { THREE, scene, camera, renderer, sun, hemi, sea, stage, inside, groundY, islPoly } = ctx;
  if (!WEATHERS[kind]) kind = "sunny";
  const rnd = Math.random;
  // 收尾要用到的先宣告：建構途中丟例外也能 dispose 乾淨（下面整段包在 try 裡）
  let disposed = false, now = 0, orig = null, vigEl = null, flashEl = null;
  const owned = [], mats = [], texs = [], treeMeshes = [];
  function dispose() {
    if (disposed) return; disposed = true;
    for (const tm of treeMeshes) tm.mesh.material = tm.mat;
    for (const o of owned) { scene.remove(o); if (o.isInstancedMesh) o.dispose(); o.geometry.dispose(); }
    for (const m of mats) m.dispose();
    for (const tx of texs) tx.dispose();
    if (vigEl) vigEl.remove(); if (flashEl) flashEl.remove();
    if (orig) {
      hemi.intensity = orig.hemiI; sun.intensity = orig.sunI; sun.shadow.intensity = orig.shadowI;
      hemi.color.copy(orig.sky); hemi.groundColor.copy(orig.ground); sun.color.copy(orig.sunC);
      sea.uDeep.value.copy(orig.deep); sea.uShallow.value.copy(orig.shallow); sea.uGrid.value.copy(orig.grid);
    }
    if (sound) { sound._linked = false; if (sound.setKind) sound.setKind("sunny"); }
    try { ctx.markShadow(); } catch (e) {}
  }
  try {

  // ---------- 原值（晴天＝完全還原到這裡）----------
  orig = { hemiI: hemi.intensity, sunI: sun.intensity, shadowI: sun.shadow.intensity, sky: hemi.color.clone(), ground: hemi.groundColor.clone(), sunC: sun.color.clone(),
    deep: sea.uDeep.value.clone(), shallow: sea.uShallow.value.clone(), grid: sea.uGrid.value.clone() };

  // ---------- 鏡頭座標（建立時量一次；鏡頭只會微微晃，不影響）----------
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  const fwd = new THREE.Vector3(-e[8], -e[9], -e[10]).normalize();       // 鏡頭看的方向
  const R = new THREE.Vector3(e[0], 0, e[2]).normalize();                // 螢幕右（水平）
  const F = new THREE.Vector3(-fwd.x, 0, -fwd.z).normalize();             // 水平、朝鏡頭
  const sinEl = -fwd.y, cosEl = Math.sqrt(1 - sinEl * sinEl);
  const Up = new THREE.Vector3(e[4], e[5], e[6]).normalize();             // 螢幕上（世界座標）
  const toB = (h, sy) => (cosEl * h - sy) / sinEl;                         // 高度 h、螢幕 y → 沿 F 的座標
  const view = { l: -15, r: 15, t: 10, b: -10 };
  // 螢幕座標的範圍：main＝主島；isl＝所有陸地（主島＋新市區…，groundY 高於海面就算；水花撒點用）
  const isLand = (x, z) => groundY(x, z) > -0.5;
  const box = () => ({ l: 1e9, r: -1e9, t: -1e9, b: 1e9 });
  const main = box(), isl = box();
  const addPt = (o, x, z) => { const sx = R.x * x + R.z * z, sy = -sinEl * (F.x * x + F.z * z); o.l = Math.min(o.l, sx); o.r = Math.max(o.r, sx); o.t = Math.max(o.t, sy); o.b = Math.min(o.b, sy); };
  for (const v of islPoly) { addPt(main, v.x, v.y); addPt(isl, v.x, v.y); }
  for (let x = -34; x <= 34; x += 1) for (let z = -34; z <= 34; z += 1) if (!inside(islPoly, x, z, -0.5) && isLand(x, z)) addPt(isl, x, z);
  const readView = () => { view.l = camera.left; view.r = camera.right; view.t = camera.top; view.b = camera.bottom; };
  readView();

  // ---------- 狀態：數字＋顏色（攤平成一條陣列，淡入淡出就是逐格內插）----------
  const NUM = ["hemiI", "sunI", "shadowI", "cloudGray", "cloudSpeed", "shade", "rain", "rainSpeed", "slant", "splash", "wind", "lean", "vignette"];
  const COL = ["sky", "ground", "sunC", "deep", "shallow", "grid"];
  const IX = {}; NUM.forEach((k, i) => IX[k] = i); COL.forEach((k, i) => IX[k] = NUM.length + i * 3);
  const N = NUM.length + COL.length * 3;
  const tmpC = new THREE.Color(), linC = new Map();
  const lin = hex => { if (!linC.has(hex)) linC.set(hex, new THREE.Color(hex)); return linC.get(hex); };
  function resolve(k) {
    const w = WEATHERS[k], s = new Float64Array(N);
    s[IX.hemiI] = orig.hemiI * w.hemiK; s[IX.sunI] = orig.sunI * w.sunK; s[IX.shadowI] = orig.shadowI * w.shadowK;
    for (const key of NUM.slice(3)) s[IX[key]] = w[key];
    const put = (key, base, hex, amt) => { const i = IX[key]; const c = amt > 0 ? tmpC.copy(base).lerp(lin(hex), amt) : base; s[i] = c.r; s[i + 1] = c.g; s[i + 2] = c.b; };
    put("sky", orig.sky, w.sky, w.tint); put("ground", orig.ground, w.ground, w.tint); put("sunC", orig.sunC, w.sunTint, w.tint);
    put("deep", orig.deep, SEA_GRAY.deep, w.sea); put("shallow", orig.shallow, SEA_GRAY.shallow, w.sea); put("grid", orig.grid, SEA_GRAY.grid, w.sea);
    return s;
  }
  let cur = resolve(kind), from = cur.slice(), to = cur.slice(), tStart = 0, pending = false, settled = true;

  // ---------- DOM 疊層（放在 stage 裡、canvas 之上；浮標在 stage 外面，不受影響）----------
  vigEl = document.createElement("div");
  vigEl.style.cssText = "position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse 75% 70% at 50% 46%, rgba(22,32,58,0) 52%, rgba(22,32,58,.62) 100%);";
  flashEl = document.createElement("div");
  flashEl.style.cssText = "position:absolute;inset:0;pointer-events:none;opacity:0;background:#f2f6ff;";
  vigEl.dataset.zyWeather = flashEl.dataset.zyWeather = "1";
  stage.appendChild(vigEl); stage.appendChild(flashEl);
  let vigShown = -1, flashShown = -1;

  const own = (o, m) => { o.userData.zyWeather = true; owned.push(o); if (m) mats.push(m); scene.add(o); return o; };
  const _m4 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();

  // ---------- 雲 ----------
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);          // detail 1：法線是圓的（軟軟的雲，不會像石頭）
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a4250 });
  const cloudIM = own(new THREE.InstancedMesh(puffGeo, cloudMat, MAXC * PUFF), cloudMat);
  cloudIM.frustumCulled = false; cloudIM.castShadow = false; cloudIM.receiveShadow = false;
  const puffRot = []; for (let i = 0; i < MAXC * PUFF; i++) puffRot.push(new THREE.Quaternion().setFromEuler(_e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28)));
  const clouds = [];
  for (let i = 0; i < MAXC; i++) clouds.push({ i, alive: false, want: false, grow: 0, delay: 0, a: 0, b: 0, sy: 0, top: true, u: 0, h: 7, s: 1, tpl: CLOUD_TPL[i % 3], spd: 1, ph: rnd() * 6.28, tone: rnd() });
  const whiteC = new THREE.Color(0xffffff), grayC = new THREE.Color("#a9b5c8");
  let cloudGrayShown = -1;
  function paintClouds(g) {
    for (const c of clouds) { _c.copy(whiteC).lerp(grayC, clamp01(g * (0.82 + c.tone * 0.36))); for (let k = 0; k < PUFF; k++) cloudIM.setColorAt(c.i * PUFF + k, _c); }
    cloudIM.instanceColor.needsUpdate = true; cloudGrayShown = g;
  }
  paintClouds(cur[IX.cloudGray]);
  // 雲走的高度帶（螢幕 y）：上帶＝主島遠側上空、下帶＝主島近側外海；再夾進「目前畫面」的上緣／下緣一條帶子裡
  // → 平常在海上、島邊；拉近某棟或飛去新市區時，雲會慢慢滑到畫面邊上讓開，不擋建築
  function laneSy(top, u) {
    const H = view.t - view.b, IH = main.t - main.b;
    if (top) return Math.max(view.t - H * 0.3, Math.min(main.t + IH * (0.02 + 0.13 * u), view.t - H * (0.02 + 0.1 * u)));
    return Math.min(view.b + H * 0.25, Math.max(main.b + IH * (0.06 - 0.12 * u), view.b + H * (0.03 + 0.08 * u)));
  }
  // 放一朵雲（anywhere＝畫面內隨便一處，否則從左邊外面飄進來）；試 7 個位置挑離其他雲最遠的
  function spawnCloud(c, anywhere) {
    c.s = 0.66 + rnd() * 0.38; c.h = 6 + rnd() * 2; c.spd = 0.8 + rnd() * 0.4; c.tpl = CLOUD_TPL[Math.floor(rnd() * 3)];
    let best = null, bestD = -1;
    for (let k = 0; k < 7; k++) {
      const top = rnd() < 0.66, u = rnd(), sy = laneSy(top, u);
      const sx = anywhere ? view.l + rnd() * (view.r - view.l) : view.l - 2.4 * c.s - rnd() * 3;
      let d = 99; for (const o of clouds) if (o !== c && o.alive) d = Math.min(d, Math.hypot((o.a - sx) * 0.5, o.sy - sy));
      if (d > bestD) { bestD = d; best = [sx, sy, top, u]; }
    }
    [c.a, c.sy, c.top, c.u] = best; c.b = toB(c.h, c.sy);
  }
  let cloudsInit = false;
  function syncClouds(instant) {
    const n = WEATHERS[kind].clouds;
    for (const c of clouds) {
      const want = c.i < n;
      if (want && !c.want) c.delay = instant ? 0 : rnd() * 1.4;
      c.want = want;
      if (instant && cloudsInit) { if (want && !c.alive) { spawnCloud(c, true); c.alive = true; } c.grow = want ? 1 : 0; if (!want) c.alive = false; }
    }
  }
  function updateClouds(dt, t) {
    if (!cloudsInit) { cloudsInit = true; for (const c of clouds) if (c.want) { spawnCloud(c, true); c.alive = true; c.grow = 1; c.delay = 0; } }
    const sp = cur[IX.cloudSpeed], follow = 1 - Math.exp(-dt * 1.2);
    for (const c of clouds) {
      if (c.want && !c.alive) { if (c.delay > 0) c.delay -= dt; else { spawnCloud(c, true); c.alive = true; c.grow = 0; } }
      if (c.alive) {
        c.grow += c.want ? dt / 1.3 : -dt / 1.0;
        if (c.grow <= 0) { c.grow = 0; if (!c.want) c.alive = false; }
        if (c.grow > 1) c.grow = 1;
        c.a += sp * c.spd * dt;
        c.sy += (laneSy(c.top, c.u) - c.sy) * follow;
        const ext = 2.4 * c.s;
        if (c.a - ext > view.r + 9 || c.a + ext < view.l - 9) { if (c.want) { spawnCloud(c, true); c.grow = 0; } else { c.alive = false; c.grow = 0; } }   // 畫面跳很遠（飛去新市區）：在新畫面裡重新長出來
        else if (c.a - ext > view.r + 1) { if (c.want) spawnCloud(c, false); else { c.alive = false; c.grow = 0; } }   // 飄出右邊 → 從左邊再進來
        c.b = toB(c.h, c.sy);
      }
      const g = c.alive ? smooth(c.grow) : 0, bob = Math.sin(t * 0.5 + c.ph) * 0.08;
      for (let k = 0; k < PUFF; k++) {
        const p = c.tpl[k], sc = c.s * p[3] * g;
        if (sc <= 0.001) { _m4.makeScale(0, 0, 0); cloudIM.setMatrixAt(c.i * PUFF + k, _m4); continue; }
        _p.copy(R).multiplyScalar(c.a + p[0] * c.s).addScaledVector(F, c.b + p[2] * c.s); _p.y = c.h + p[1] * c.s + bob;
        _m4.compose(_p, puffRot[c.i * PUFF + k], _s.set(sc, sc * 0.78, sc));
        cloudIM.setMatrixAt(c.i * PUFF + k, _m4);
      }
    }
    cloudIM.instanceMatrix.needsUpdate = true;
    const gr = cur[IX.cloudGray]; if (Math.abs(gr - cloudGrayShown) > 0.002 || (settled && gr !== cloudGrayShown)) paintClouds(gr);
  }

  // ---------- 雲影：高空一張半透明貼圖（雲跟建築頂會擋住它；看起來像雲影飄過）----------
  const shadeTex = (() => {
    const S = 256, cv = document.createElement("canvas"); cv.width = cv.height = S; const g = cv.getContext("2d"), r2 = rng(5);
    g.fillStyle = "#000"; g.fillRect(0, 0, S, S);       // alphaMap 讀綠色通道：黑底＝透明、白雲影＝不透明
    for (let k = 0; k < 7; k++) {
      const x = r2() * S, y = r2() * S, rad = 34 + r2() * 40;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.55, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.beginPath(); g.ellipse(x + ox, y + oy, rad * 1.5, rad, 0.4, 0, 6.29); g.fill();
      }
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); return t;
  })();
  texs.push(shadeTex);
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0x14203a, alphaMap: shadeTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const shadeGeo = new THREE.PlaneGeometry(120, 120); shadeGeo.rotateX(-Math.PI / 2);
  const shade = own(new THREE.Mesh(shadeGeo, shadeMat), shadeMat);
  shade.position.y = 3.2; shade.renderOrder = 2; shade.frustumCulled = false; shade.castShadow = shade.receiveShadow = false; shade.visible = false;
  let shadeOff = 0;

  // ---------- 雨絲：每條雨一個細長四邊形，位置全在 shader 算 ----------
  const rainGeo = new THREE.BufferGeometry();
  {
    const r2 = rng(17), drop = new Float32Array(MAX_DROPS * 4 * 4), corner = new Float32Array(MAX_DROPS * 4 * 2), idx = new Uint16Array(MAX_DROPS * 6);
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = [r2(), r2(), r2(), r2()];
      for (let v = 0; v < 4; v++) { drop.set(d, (i * 4 + v) * 4); corner.set([v & 1 ? 0.5 : -0.5, v >> 1], (i * 4 + v) * 2); }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 4 * 3), 3));
    rainGeo.setAttribute("aDrop", new THREE.BufferAttribute(drop, 4)); rainGeo.setAttribute("aCorner", new THREE.BufferAttribute(corner, 2)); rainGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const rainU = { uPh: { value: 0 }, uR: { value: R.clone() }, uF: { value: F.clone() }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uY: { value: new THREE.Vector2(-1.0, 9.0) },
    uSlant: { value: 0.1 }, uLen: { value: 0.6 }, uDensity: { value: 0 }, uWidth: { value: 2 }, uRes: { value: new THREE.Vector2(1, 1) }, uOpacity: { value: 0.72 } };
  const rainMat = new THREE.ShaderMaterial({
    uniforms: rainU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec4 aDrop; attribute vec2 aCorner;
      uniform float uPh, uSlant, uLen, uDensity, uWidth; uniform vec3 uR, uF; uniform vec2 uA, uB, uY, uRes;
      varying float vT; varying float vS;
      void main(){
        vT = aCorner.y; vS = aCorner.x;
        if (aDrop.w > uDensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float H = uY.y - uY.x;
        float y = uY.y - fract(aDrop.z + uPh) * H;          // uPh：CPU 依目前雨速累積的相位（雨量換檔時才不會整片亂跳）
        float a = uA.x + mod(aDrop.x * uA.y + uSlant * (uY.y - y) - uA.x, uA.y);
        float b = uB.x + mod(aDrop.y * uB.y - uB.x, uB.y);
        vec3 head = uR * a + uF * b + vec3(0.0, y, 0.0);
        vec3 dir = normalize(uR * uSlant - vec3(0.0, 1.0, 0.0));
        vec4 ch = projectionMatrix * viewMatrix * vec4(head, 1.0);
        vec4 ct = projectionMatrix * viewMatrix * vec4(head - dir * uLen, 1.0);
        vec2 sd = (ch.xy - ct.xy) * uRes; float L = length(sd);
        vec2 n = L > 0.0001 ? vec2(-sd.y, sd.x) / L : vec2(1.0, 0.0);
        vec4 p = mix(ct, ch, aCorner.y);
        p.xy += n * aCorner.x * uWidth / uRes * 2.0;
        gl_Position = p;
      }`,
    fragmentShader: `
      uniform float uOpacity; varying float vT; varying float vS;
      void main(){ float a = uOpacity * smoothstep(0.0, 0.85, vT) * (1.0 - smoothstep(0.2, 0.5, abs(vS))); gl_FragColor = vec4(0.9, 0.95, 1.0, a); }`,
  });
  const rain = own(new THREE.Mesh(rainGeo, rainMat), rainMat);
  rain.frustumCulled = false; rain.renderOrder = 3; rain.visible = false;
  const _buf = new THREE.Vector2();

  // ---------- 水花：地上、海上的小圈圈（位置先撒好，shader 依時間輪流冒）----------
  const splashGeo = new THREE.BufferGeometry();
  {
    const r2 = rng(29), sp = new Float32Array(MAX_SPLASH * 4 * 4), corner = new Float32Array(MAX_SPLASH * 4 * 2), idx = new Uint16Array(MAX_SPLASH * 6);
    let n = 0, guard = 0;
    const ring = (x, z, r) => [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]].map(([dx, dz]) => [x + dx, z + dz]);
    while (n < MAX_SPLASH && guard++ < 30000) {
      const x = (r2() - 0.5) * 56, z = (r2() - 0.5) * 56;
      if (isl.l > R.x * x + R.z * z + 4 || isl.r < R.x * x + R.z * z - 4) continue;   // 陸地左右範圍外的海不撒
      const land = isLand(x, z);
      let y = -0.935;                                   // 海面（hub3d SEA_Y = -0.95）
      if (land) { y = groundY(x, z); if (ring(x, z, 0.32).some(([a, b]) => Math.abs(groundY(a, b) - y) > 0.01)) continue; y += 0.018; }   // 平地才撒（不跨台階邊）
      else if (r2() > 0.4 || inside(islPoly, x, z, -1.7) || ring(x, z, 1.7).some(([a, b]) => isLand(a, b))) continue;   // 海：離岸 1.7 以上，數量少一點
      const ph = r2();
      for (let v = 0; v < 4; v++) { sp.set([x, y, z, ph], (n * 4 + v) * 4); corner.set([v & 1 ? 1 : -1, v >> 1 ? 1 : -1], (n * 4 + v) * 2); }
      idx.set([n * 4, n * 4 + 2, n * 4 + 1, n * 4 + 1, n * 4 + 2, n * 4 + 3], n * 6); n++;
    }
    splashGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_SPLASH * 4 * 3), 3));
    splashGeo.setAttribute("aSp", new THREE.BufferAttribute(sp, 4)); splashGeo.setAttribute("aCorner", new THREE.BufferAttribute(corner, 2)); splashGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    splashGeo.setDrawRange(0, n * 6);
  }
  const splashU = { uT: { value: 0 }, uDensity: { value: 0 }, uOpacity: { value: 0.85 } };
  const splashMat = new THREE.ShaderMaterial({
    uniforms: splashU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec4 aSp; attribute vec2 aCorner; uniform float uT, uDensity;
      varying vec2 vC; varying float vF;
      float h1(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float id = aSp.w * 113.0, cyc = uT * 1.7 + aSp.w * 7.0, k = mod(floor(cyc), 1000.0), f = fract(cyc);
        vC = aCorner; vF = f;
        if (h1(k * 12.9898 + id) > uDensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 p = aSp.xyz + vec3(h1(k * 3.1 + id) - 0.5, 0.0, h1(k * 7.7 + id) - 0.5) * 0.4;
        p.xz += aCorner * (0.06 + 0.24 * f);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uOpacity; varying vec2 vC; varying float vF;
      void main(){ float d = length(vC); float ring = smoothstep(0.5, 0.72, d) * (1.0 - smoothstep(0.84, 1.0, d)); gl_FragColor = vec4(0.9, 0.95, 1.0, ring * (1.0 - vF) * uOpacity); }`,
  });
  const splash = own(new THREE.Mesh(splashGeo, splashMat), splashMat);
  splash.frustumCulled = false; splash.renderOrder = 2; splash.visible = false;

  // ---------- 落葉（颱風）----------
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-0.07, 0.015, 0, 0, 0, -0.13, 0, 0, 0.13, 0, 0, -0.13, 0.07, 0.015, 0, 0, 0, 0.13]), 3));
  leafGeo.computeVertexNormals();
  const leafMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: 0x1d2a14 });
  const leafIM = own(new THREE.InstancedMesh(leafGeo, leafMat, MAXL), leafMat);
  leafIM.frustumCulled = false; leafIM.castShadow = leafIM.receiveShadow = false; leafIM.visible = false;
  const leaves = [];
  for (let i = 0; i < MAXL; i++) { leaves.push({ i, alive: false, want: false, grow: 0, delay: 0, a: 0, b: 0, h: 1, v: 5, ph: rnd() * 6.28, spin: new THREE.Vector3(rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3), s: 2.0 + rnd() * 0.8 });
    leafIM.setColorAt(i, _c.set(LEAF_COLORS[i % LEAF_COLORS.length])); }
  leafIM.instanceColor.needsUpdate = true;
  function spawnLeaf(L, anywhere) {
    const W = view.r - view.l, H = view.t - view.b;
    L.h = 0.4 + rnd() * 2.6; L.v = 3.5 + rnd() * 3.5; L.a = anywhere ? view.l + rnd() * W : view.l - 0.5 - rnd() * 4;
    L.b = toB(L.h, view.b + H * (0.08 + rnd() * 0.84));
  }
  function syncLeaves(instant) {
    const n = WEATHERS[kind].leaves;
    for (const L of leaves) { const want = L.i < n; if (want && !L.want) L.delay = instant ? 0 : rnd() * 2.5; L.want = want; if (instant && !want) { L.alive = false; L.grow = 0; } }
  }
  function updateLeaves(dt, t) {
    let any = false; const gust = 1 + 0.35 * Math.sin(t * 1.3);
    for (const L of leaves) {
      if (L.want && !L.alive) { if (L.delay > 0) L.delay -= dt; else { spawnLeaf(L, true); L.alive = true; L.grow = 0; } }
      if (L.alive) {
        L.grow = Math.max(0, Math.min(1, L.grow + (L.want ? dt / 0.5 : -dt / 0.6)));
        if (L.grow <= 0 && !L.want) L.alive = false;
        L.a += L.v * gust * dt; L.h += Math.sin(t * 3 + L.ph) * 0.9 * dt;
        if (L.a > view.r + 1) { if (L.want) spawnLeaf(L, false); else { L.alive = false; L.grow = 0; } }
      }
      const sc = L.alive ? L.s * L.grow : 0;
      if (sc > 0) any = true;
      _p.copy(R).multiplyScalar(L.a).addScaledVector(F, L.b); _p.y = L.h;
      _q.setFromEuler(_e.set(t * L.spin.x + L.ph, t * L.spin.y, t * L.spin.z));
      _m4.compose(_p, _q, _s.set(sc, sc, sc)); leafIM.setMatrixAt(L.i, _m4);
    }
    leafIM.visible = any; if (any) leafIM.instanceMatrix.needsUpdate = true;
  }

  // ---------- 閃電：卡通閃電條（從雲底往下）----------
  const BOLT_N = 7;
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BOLT_N * 6 * 3), 3));
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const bolt = own(new THREE.Mesh(boltGeo, boltMat), boltMat);
  bolt.frustumCulled = false; bolt.renderOrder = 4; bolt.visible = false;
  function shapeBolt(c) {
    const pos = boltGeo.attributes.position.array, pts = [];
    const top = _p.copy(R).multiplyScalar(c.a).addScaledVector(F, c.b); top.y = c.h - 0.35 * c.s;
    const len = 2.1 + rnd() * 0.8;
    for (let k = 0; k <= BOLT_N; k++) { const z = k === 0 || k === BOLT_N ? 0 : (k % 2 ? 1 : -1) * (0.16 + rnd() * 0.14); pts.push(top.clone().addScaledVector(R, z).setY(top.y - len * k / BOLT_N)); }
    let o = 0;
    for (let k = 0; k < BOLT_N; k++) {
      const w0 = 0.16 * (1 - k / BOLT_N * 0.7), w1 = 0.16 * (1 - (k + 1) / BOLT_N * 0.7), A = pts[k], B = pts[k + 1];
      const v = [A.x - R.x * w0, A.y, A.z - R.z * w0, A.x + R.x * w0, A.y, A.z + R.z * w0, B.x - R.x * w1, B.y, B.z - R.z * w1, B.x - R.x * w1, B.y, B.z - R.z * w1, A.x + R.x * w0, A.y, A.z + R.z * w0, B.x + R.x * w1, B.y, B.z + R.z * w1];
      pos.set(v, o); o += 18;
    }
    boltGeo.attributes.position.needsUpdate = true;
  }
  let flashT = -1, nextFlash = null, flashBoost = 0, flashK = 1, flashHold = 0;
  function flash(strength = 1, hold = 0) {          // hold：測試截圖用，亮著停 hold 秒
    if (disposed) return;
    flashT = now; flashK = strength; flashHold = Math.max(0, +hold || 0);
    const cand = clouds.filter(c => c.alive && c.grow > 0.8 && c.a > view.l + 1 && c.a < view.r - 1 && c.sy > view.b + (view.t - view.b) * 0.55 && c.sy < view.t);
    if (cand.length) { shapeBolt(cand[Math.floor(rnd() * cand.length)]); bolt.visible = true; } else bolt.visible = false;
    if (sound && sound.thunder) sound.thunder(0.5 + rnd() * 0.9, 0.6 + rnd() * 0.4);
    if (onLightning) try { onLightning(kind); } catch (e) {}
  }
  function updateFlash(t) {
    const L = WEATHERS[kind].lightning;
    if (L && settled) { if (nextFlash === null || nextFlash - t > L[1] + 1) nextFlash = t + 2 + rnd() * (L[1] - 2); if (t >= nextFlash) { flash(kind === "typhoon" ? 0.8 : 1); nextFlash = t + L[0] + rnd() * (L[1] - L[0]); } }
    else if (!L) nextFlash = null;
    const fs = flashT >= 0 ? (t - flashT < flashHold ? FLASH_PEAK : t - flashT - flashHold + (flashHold > 0 ? FLASH_PEAK : 0)) : -1;
    const env = fs >= 0 ? flashEnv(fs) * flashK : 0;
    if (fs >= FLASH_END) flashT = -1;
    flashBoost = env * 0.5;
    const fo = Math.round(env * 0.16 * 1000) / 1000;
    if (fo !== flashShown) { flashEl.style.opacity = String(fo); flashShown = fo; }
    const bo = env > 0.15 ? env : 0; boltMat.opacity = bo; if (bolt.visible && bo === 0 && flashT < 0) bolt.visible = false;
  }

  // ---------- 彩虹：島後面（遠側）的半透明弧，島會擋住它的下半部 ----------
  const rbGeo = new THREE.RingGeometry(0.74, 1, 72, 1, 0, Math.PI);
  const rbU = { uOp: { value: 0 } };
  const rbMat = new THREE.ShaderMaterial({
    uniforms: rbU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uOp; varying vec2 vP;
      vec3 band(float t){
        float x = clamp(t, 0.0, 1.0) * 5.0;
        vec3 c = mix(vec3(0.74, 0.6, 1.0), vec3(0.5, 0.75, 1.0), clamp(x, 0.0, 1.0));
        c = mix(c, vec3(0.52, 0.9, 0.62), clamp(x - 1.0, 0.0, 1.0)); c = mix(c, vec3(1.0, 0.93, 0.45), clamp(x - 2.0, 0.0, 1.0));
        c = mix(c, vec3(1.0, 0.68, 0.38), clamp(x - 3.0, 0.0, 1.0)); return mix(c, vec3(1.0, 0.48, 0.5), clamp(x - 4.0, 0.0, 1.0));
      }
      void main(){ float t = (length(vP) - 0.74) / 0.26; float edge = smoothstep(0.0, 0.14, t) * smoothstep(1.0, 0.86, t); float foot = smoothstep(0.02, 0.4, vP.y);
        gl_FragColor = vec4(band(t), uOp * edge * foot); }`,
  });
  const rb = own(new THREE.Mesh(rbGeo, rbMat), rbMat);
  rb.frustumCulled = false; rb.renderOrder = 1; rb.visible = false;
  let rbT0 = null, rbWant = null;   // rbWant：要出彩虹的時間（換回晴天淡到一半時）
  function startRainbow() {
    readView();
    const W = view.r - view.l, H = view.t - view.b, rad = Math.min(W, H) * 0.4;
    const sx = view.l + W * 0.27, sy = view.b + H * 0.5;
    rb.position.copy(R).multiplyScalar(sx).addScaledVector(Up, sy).addScaledVector(fwd, 25);   // 往遠處推 25：島在它前面
    rb.quaternion.copy(camera.quaternion); rb.scale.setScalar(rad);
    rbT0 = now; rb.visible = true;
  }
  function updateRainbow(t) {
    if (rbWant !== null && t >= rbWant) { rbWant = null; startRainbow(); rbT0 = t; }
    if (rbT0 === null) return;
    const age = t - rbT0, op = 0.62 * Math.min(clamp01(age / 2.5), clamp01((RAINBOW_LIFE - age) / 4));
    rbU.uOp.value = smooth(op / 0.62) * 0.62;
    if (age >= RAINBOW_LIFE) { rbT0 = null; rb.visible = false; rbU.uOp.value = 0; }
  }

  // ---------- 樹搖：樹／樹叢的 InstancedMesh 換成 clone 材質（只動這些，其他共用 vcMat 的不碰）----------
  const swayU = { uSwayT: { value: 0 }, uSway: { value: 0 }, uLean: { value: 0 }, uWindDir: { value: new THREE.Vector2(R.x, R.z) } };
  const swayMats = new Map();
  scene.traverse(o => { if (o.isInstancedMesh && o !== cloudIM && o !== leafIM && o.material && o.material.isMeshLambertMaterial && o.material.vertexColors && !o.material.map) treeMeshes.push({ mesh: o, mat: o.material }); });
  for (const tm of treeMeshes) {
    if (!swayMats.has(tm.mat)) {
      const nm = tm.mat.clone();
      nm.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, swayU);
        sh.vertexShader = "uniform float uSwayT; uniform float uSway; uniform float uLean; uniform vec2 uWindDir;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          #ifdef USE_INSTANCING
          {
            float hh = max(position.y - 0.25, 0.0);
            vec3 org = instanceMatrix[3].xyz; float ph = org.x * 0.83 + org.z * 0.61;
            float sw = sin(uSwayT * 2.3 + ph) * 0.65 + sin(uSwayT * 3.9 + ph * 1.7) * 0.35;
            vec3 wl = transpose(mat3(instanceMatrix)) * vec3(uWindDir.x, 0.0, uWindDir.y); wl.y = 0.0;
            float ll = length(wl);
            if (ll > 1e-5) transformed.xz += wl.xz / ll * hh * hh * (uLean + uSway * sw);
          }
          #endif`);
      };
      nm.customProgramCacheKey = () => "zyWeatherSway1";
      swayMats.set(tm.mat, nm); mats.push(nm);
    }
    tm.mesh.material = swayMats.get(tm.mat);
  }

  // ---------- 套用目前狀態 ----------
  const setC = (c, key) => { const i = IX[key]; c.setRGB(cur[i], cur[i + 1], cur[i + 2]); };
  function apply() {
    hemi.intensity = cur[IX.hemiI] + flashBoost;
    sun.intensity = cur[IX.sunI]; sun.shadow.intensity = cur[IX.shadowI];
    setC(hemi.color, "sky"); setC(hemi.groundColor, "ground"); setC(sun.color, "sunC");
    setC(sea.uDeep.value, "deep"); setC(sea.uShallow.value, "shallow"); setC(sea.uGrid.value, "grid");
    const vg = Math.round(cur[IX.vignette] * 1000) / 1000; if (vg !== vigShown) { vigEl.style.opacity = String(vg); vigShown = vg; }
    const sh = cur[IX.shade]; shade.visible = sh > 0.1; shadeMat.opacity = sh * clamp01((sh - 0.1) / 0.03);   // ≤ 0.1 不畫（晴天省一個全螢幕透明面）；過門檻時從 0 淡入不跳
    rainU.uDensity.value = cur[IX.rain]; rainU.uSlant.value = cur[IX.slant]; rainU.uLen.value = 0.6 + cur[IX.slant] * 0.25;
    rain.visible = cur[IX.rain] > 0.003;
    splashU.uDensity.value = cur[IX.splash]; splash.visible = cur[IX.splash] > 0.003;
    swayU.uSway.value = cur[IX.wind]; swayU.uLean.value = cur[IX.lean];
  }

  function set(k, { instant = false } = {}) {
    if (disposed || !WEATHERS[k]) return;
    const prev = kind; kind = k; to = resolve(k);
    if (instant) { cur.set(to); from = to.slice(); settled = true; pending = false; }
    else { from = cur.slice(); pending = true; settled = false; }
    syncClouds(instant); syncLeaves(instant);
    if (k === "sunny" && WET.has(prev)) { if (instant) startRainbow(); else rbWant = -1; }   // -1：開始淡出後 1.5 秒（update 裡換算）
    else if (WET.has(k)) {                                   // 又下雨了：還沒出的彩虹取消、已經出的從現在的亮度淡掉
      rbWant = null;
      if (rbT0 !== null) rbT0 = Math.min(rbT0, now - (RAINBOW_LIFE - 4 * clamp01(rbU.uOp.value / 0.62)));
    }
    if (!WEATHERS[k].lightning) nextFlash = null;
    if (sound && sound.setKind) sound.setKind(k);
    apply();
  }
  function rainbow() { if (!disposed) startRainbow(); }

  function update(t, dt) {
    if (disposed) return;
    now = t;
    readView();
    // 淡入淡出
    if (pending) { tStart = t; pending = false; if (rbWant === -1) rbWant = t + FADE * 0.6; }
    if (!settled) {
      const p = clamp01((t - tStart) / FADE);
      if (p >= 1) { cur.set(to); settled = true; }
      else { const s = smooth(p); for (let i = 0; i < N; i++) cur[i] = from[i] + (to[i] - from[i]) * s; }
    }
    updateFlash(t);
    apply();
    updateClouds(dt, t);
    updateLeaves(dt, t);
    updateRainbow(t);
    // 雲影飄
    if (shade.visible) { shadeOff += cur[IX.cloudSpeed] * dt / 24; shadeTex.offset.set(shadeOff * R.x, -shadeOff * R.z); }
    // 雨：相位用目前雨速累積（不用 t×速度：淡入時速度一直變會整片跳）；範圍涵蓋目前鏡頭看得到的地方
    { const Y = rainU.uY.value; rainU.uPh.value = (rainU.uPh.value + cur[IX.rainSpeed] * dt / (Y.y - Y.x)) % 1; }
    if (rain.visible) {
      const m = 1.5, Y = rainU.uY.value;
      rainU.uA.value.set(view.l - m, view.r - view.l + 2 * m);
      const b0 = (cosEl * Y.x - (view.t + m)) / sinEl, b1 = (cosEl * Y.y - (view.b - m)) / sinEl;
      rainU.uB.value.set(b0, b1 - b0);
      renderer.getDrawingBufferSize(_buf); rainU.uRes.value.copy(_buf); rainU.uWidth.value = 2 * renderer.getPixelRatio();
    }
    splashU.uT.value = (splashU.uT.value + dt) % 2000;      // 2000×1.7＝整數圈：繞回時 fract 連續
    swayU.uSwayT.value = t;
  }

  if (sound) { sound._linked = true; if (sound.setKind) sound.setKind(kind); }
  syncClouds(true); syncLeaves(true); apply();
  // 先把所有天氣的 shader 編譯好（不然第一次換到雨／颱風那一格會卡一下）：暫時全部打開 → compile → 還原
  { const vis = owned.map(o => o.visible); owned.forEach(o => { o.visible = true; }); try { renderer.compile(scene, camera); } finally { owned.forEach((o, i) => { o.visible = vis[i]; }); } }

  return {
    update, dispose, set, rainbow, flash,
    get: () => kind,
    // 測試用：目前狀態
    info: () => ({ kind, settled, draws: owned.filter(o => o.visible).length, clouds: clouds.filter(c => c.alive).length, leaves: leaves.filter(L => L.alive).length, rain: +cur[IX.rain].toFixed(3), rainbow: rbT0 !== null, trees: treeMeshes.length }),
  };
  } catch (e) { dispose(); throw e; }
}

// =========================================================
// 聲音：WebAudio 程式合成（雨＝白噪音濾波、大雨底噪＝棕噪音低通、風＝棕噪音帶通＋慢慢起伏、遠雷＝低頻噪音衰減）
// start(既有 AudioContext 或 null)；晴、陰天無聲；音量很小（在背景音樂之下）
// =========================================================
export function createWeatherSound() {
  const LV = { sunny: [0, 0, 0], cloudy: [0, 0, 0], rain: [0.5, 0.18, 0.06], storm: [0.68, 0.36, 0.2], typhoon: [0.74, 0.42, 0.62] };   // [雨絲, 大雨底噪, 風]
  const BASE = 0.2;
  let ac = null, ownCtx = false, g = null, srcs = [], kind = "sunny", vol = 0, autoT = 0, offT = 0, wired = false, busyUntil = 0, duck = null;
  const self = { _linked: false };
  // 沒聲音（音量 0 或晴／陰天）1.2 秒後把 master 從喇叭拔掉：斷線的節點不運算；要出聲時再接回去
  const audible = () => vol > 0 && (LV[kind] || LV.sunny).some(x => x > 0);
  function syncWire() {
    if (!g || !ac) return;
    if (audible()) { clearTimeout(offT); offT = 0; if (!wired) { try { g.master.connect(ac.destination); wired = true; } catch (e) {} } return; }
    if (!wired || offT) return;
    offT = setTimeout(function tryOff() {
      offT = 0; if (!g || !ac || audible() || !wired) return;
      const left = busyUntil - ac.currentTime; if (left > 0) { offT = setTimeout(tryOff, left * 1000 + 100); return; }   // 遠雷還在響：等它響完
      try { g.master.disconnect(); } catch (e) {} wired = false;
    }, 1200);
  }
  function noiseBuf(sec, brown) {
    const n = Math.floor(ac.sampleRate * sec), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w * 0.5; }
    if (brown) { const a = d[0], b = d[n - 1]; for (let i = 0; i < n; i++) d[i] -= a + (b - a) * i / (n - 1); }   // 頭尾接得起來，循環不會「咔」
    return buf;
  }
  function loop(buf, rate = 1) { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; srcs.push(s); return s; }
  const ramp = (param, v, tc = 0.8) => { if (!ac) return; param.cancelScheduledValues(ac.currentTime); param.setTargetAtTime(v, ac.currentTime, tc); };
  function applyKind(tc) {
    if (!g) return; const [r, h, w] = LV[kind] || LV.sunny;
    ramp(g.rain.gain, r, tc); ramp(g.heavy.gain, h, tc); ramp(g.wind.gain, w, tc); ramp(g.gust.gain, w * 0.55, tc);
  }
  function scheduleAuto() {
    clearTimeout(autoT); autoT = 0;
    if (!g || self._linked || (kind !== "storm" && kind !== "typhoon")) return;
    autoT = setTimeout(() => { self.thunder(0, 0.8); scheduleAuto(); }, 6000 + Math.random() * 8000);
  }
  self.start = audioCtx => {
    if (g) return self;
    try {
      ac = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); ownCtx = !audioCtx;
      const white = noiseBuf(2.3, false), brown = noiseBuf(3.7, true);
      const master = ac.createGain(); master.gain.value = BASE * vol; wired = false;
      // 雨絲：白噪音 → 高通 → 低通
      const rain = ac.createGain(); rain.gain.value = 0;
      const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 6500;
      loop(white).connect(hp); hp.connect(lp); lp.connect(rain); rain.connect(master);
      // 大雨底噪：棕噪音 → 低通
      const heavy = ac.createGain(); heavy.gain.value = 0;
      const lp2 = ac.createBiquadFilter(); lp2.type = "lowpass"; lp2.frequency.value = 520;
      loop(brown).connect(lp2); lp2.connect(heavy); heavy.connect(master);
      // 風：棕噪音 → 帶通（中心頻率慢慢飄）→ 音量慢慢起伏（一陣一陣）
      const wind = ac.createGain(); wind.gain.value = 0;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 1.1;
      loop(brown, 1.37).connect(bp); bp.connect(wind); wind.connect(master);
      const lfoF = ac.createOscillator(); lfoF.frequency.value = 0.09; const lfoFg = ac.createGain(); lfoFg.gain.value = 170; lfoF.connect(lfoFg); lfoFg.connect(bp.frequency); srcs.push(lfoF);
      const lfoA = ac.createOscillator(); lfoA.frequency.value = 0.13; const gust = ac.createGain(); gust.gain.value = 0; lfoA.connect(gust); gust.connect(wind.gain); srcs.push(lfoA);
      g = { master, rain, heavy, wind, gust };
      for (const s of srcs) s.start();
      if (ac.state === "suspended" && ac.resume) ac.resume().catch(() => {});
      applyKind(0.05); scheduleAuto(); syncWire();
    } catch (e) { console.warn("[weather] 聲音啟動失敗", e); self.stop(); }
    return self;
  };
  self.setKind = k => { kind = LV[k] ? k : "sunny"; applyKind(0.8); scheduleAuto(); syncWire(); };
  // 一開始音量是 0（不出聲）：整合時 setVolume(0–1)；選單藏起來請 setVolume(0)
  self.setVolume = v => { vol = Math.max(0, Math.min(1, +v || 0)); if (g) ramp(g.master.gain, BASE * vol, 0.15); syncWire(); };
  // fn() 回 true（正在講話）時雷聲強度減半
  self.setDuck = fn => { duck = typeof fn === "function" ? fn : null; };
  // 遠雷：delay 秒後，strength 0–1（悶悶的、不嚇人）
  self.thunder = (delay = 0, strength = 1) => {
    if (!g || !ac || vol <= 0) return;
    try {
      if (duck) { try { if (duck()) strength *= 0.5; } catch (e) {} }
      const t0 = ac.currentTime + Math.max(0, delay), dur = 3.6;
      busyUntil = Math.max(busyUntil, t0 + dur); clearTimeout(offT); offT = 0;
      if (!wired) { g.master.connect(ac.destination); wired = true; }
      const s = ac.createBufferSource(); s.buffer = noiseBuf(dur, true);
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(620, t0); lp.frequency.exponentialRampToValueAtTime(110, t0 + 1.6);
      const env = ac.createGain(); env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(0.85 * strength, t0 + 0.14);
      env.gain.setTargetAtTime(0.35 * strength, t0 + 0.3, 0.25); env.gain.setTargetAtTime(0, t0 + 0.9, 0.7);
      s.connect(lp); lp.connect(env); env.connect(g.master);
      s.start(t0); s.stop(t0 + dur);
      s.onended = () => { try { s.disconnect(); lp.disconnect(); env.disconnect(); } catch (e) {} syncWire(); };
    } catch (e) {}
  };
  self.stop = () => {
    clearTimeout(autoT); autoT = 0; clearTimeout(offT); offT = 0; wired = false; busyUntil = 0;
    for (const s of srcs) { try { s.stop(); } catch (e) {} try { s.disconnect(); } catch (e) {} }
    srcs = [];
    if (g) { try { g.master.disconnect(); } catch (e) {} }
    g = null;
    if (ac && ownCtx) { try { ac.close(); } catch (e) {} }
    ac = null; ownCtx = false;
  };
  return self;
}
