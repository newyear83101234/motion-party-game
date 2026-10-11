// ===================== 注音小島 3D 選單：海洋外掛（浪花短線、岸邊浪、小魚、海鷗）=====================
// 家長 10-11：「海浪都會有波動、雲朵、小魚之類的在海中」— 參考 Tack Lin《開工吧！社畜人生！》的海：深水區白色斜短線慢慢漂、岸邊一圈白浪、天上有海鷗。
// 用法（zhuyin.js）：
//   import { oceanPlugin } from "./zhuyin-ocean.js";
//   const ocean = hub.use(c => oceanPlugin(c, { env: () => ({ night: 0–1, dusk: 0–1, kind: "sunny"|"cloudy"|"rain"|"storm"|"typhoon" }) }));
//   ocean.setEnv(函式或物件)：換環境來源｜ocean.jump()：馬上跳一條魚（宣傳片）｜ocean.info()：數量（測試用）
//   env 沒給＝白天晴天。可以直接把日夜時鐘的 sample 丟進來（會讀 night／dusk／dawn，dawn 當成淡一點的黃昏暖色）。環境變了會在 ~2 秒內慢慢轉過去。
// 只透過 ctx 碰場景、不改 hub3d.js；自己建的東西 dispose() 全部收掉（海面距離場貼圖 uSdf 是 hub 的，只借用不收）。
// 畫面組成（每樣 1 個 draw call；沒東西時整個不畫）：
//   浪花短線＝InstancedBufferGeometry 1400 條小長條（晴天亮 62%、颱風全亮）：位置、淡入淡出、避開淺水全在 vertex shader 依時鐘算，每格只改 uniform
//   岸邊浪＝只蓋「岸邊一圈」的格子網（開場從距離場挑格子），shader 畫往岸推的浪線＋一波波漲退的白浪（沿岸相位不同＝浪一段段打上來）
//   小魚＝InstancedMesh（6 群×5 條，淺水區沿岸游；偶爾一條跳出水面）｜水花＝圈圈＋水滴兩個 InstancedMesh（只有跳魚時畫）
//   海鷗＝InstancedMesh（翅膀在 vertex shader 依每隻的拍翅角度彎，最多 3 隻）：只在「沒有島的那條帶子」飛——
//         直式＝島上方（按鈕列下面）或島下方的空海；橫式沒空間＝貼著畫面上緣。不擋建築（浮標是 DOM，本來就在畫面最上層）
// 繪製順序（透明物件）：海面 0 → 小魚 0.5 → 岸邊浪 0.6 → 浪花短線 0.7 → 水花 0.8（天氣外掛的雨水花 2、雨 3）

const KIND = {   // [暴風程度 0–1, 海鷗最多幾隻]
  sunny: [0, 3], cloudy: [0.2, 2], rain: [0.5, 1], storm: [0.85, 0], typhoon: [1, 0],
};
const N_STREAK = 1400, TILE = 100, CLOCK_WRAP = 120;     // 浪花短線：條數、鋪的範圍（世界單位，跟著畫面中心）、時鐘繞回週期（每條壽命都整除 120）
const FISH_PER = 5, MAX_GULL = 3, MAX_SPLASH = 6, DROPS = 6;
const SCHOOLS = [   // 魚群：哪座島、從島中心往哪個角度（度，xz 平面）出去找淺水、顏色
  { isl: "main", ang: 90, color: "#ff9a3d" }, { isl: "main", ang: 2, color: "#f7d44c" }, { isl: "main", ang: 182, color: "#f2808f" },
  { isl: "main", ang: 135, color: "#ffb36b" }, { isl: "town", ang: 40, color: "#b99cf2" }, { isl: "town", ang: 215, color: "#ff8a5c" },
];
const NIGHT_HIDE = new Set([1, 3, 5]);                   // 晚上只留 3 群
const SLOTS = [[0.3, 0], [0, 0.26], [0, -0.26], [-0.32, 0.12], [-0.3, -0.17]];   // 魚在群裡的位置（往前, 往右）

const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const modp = (v, m) => ((v % m) + m) % m;

// ---------- shader ----------
const SDF_GLSL = `
  uniform sampler2D uSdf; uniform float uR;
  float sdf(vec2 p){ vec2 uv = p / (2.0 * uR) + 0.5; if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 13.0; return texture2D(uSdf, uv).r * 16.0 - 3.0; }`;
const STREAK_VS = `
  attribute vec4 aSeed;
  uniform float uClock, uTile, uDensity, uLen, uWidth, uY;
  uniform vec2 uDrift, uCenter, uDir;
  varying vec2 vUv; varying float vA;
  ${SDF_GLSL}
  float hash1(float n){ n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
  void main(){
    float n = floor(15.0 + aSeed.z * 9.99);              // 每條壽命 120/n 秒（15–24 → 5–8 秒）：時鐘每 120 秒繞回也不會跳
    float L = ${CLOCK_WRAP}.0 / n;
    float c = uClock / L + aSeed.x * 37.0;
    float cyc = mod(floor(c), n), f = fract(c);
    vec2 base = vec2(hash1(aSeed.y * 91.7 + cyc * 13.13), hash1(aSeed.x * 47.3 + cyc * 7.77 + 3.1)) * uTile;   // 每一輪換個地方出現
    vec2 pos = base + uDrift;
    pos = uCenter + mod(pos - uCenter + 0.5 * uTile, uTile) - 0.5 * uTile;   // 鋪在畫面中心附近一塊 TILE×TILE
    float life = sin(3.14159 * f);
    float dens = clamp((uDensity - aSeed.w) * 12.0, 0.0, 1.0);             // 暴風雨時多一點
    float deep = smoothstep(3.0, 4.4, sdf(pos));                             // 只在深水區（避開陸地、淺水）
    vA = min(1.0, life * 1.7) * dens * deep;              // 淡入、停一陣子、淡出
    float ang = (aSeed.y - 0.5) * 0.3;
    vec2 dir = vec2(uDir.x * cos(ang) - uDir.y * sin(ang), uDir.x * sin(ang) + uDir.y * cos(ang)), perp = vec2(-dir.y, dir.x);
    float len = uLen * (0.55 + 0.45 * life) * (0.7 + 0.6 * fract(aSeed.z * 7.3));
    vec2 xz = pos + dir * position.x * len + perp * position.y * uWidth;
    vUv = position.xy * 2.0;
    gl_Position = vA < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(xz.x, uY, xz.y, 1.0);   // 看不到的整條丟到畫面外
  }`;
const STREAK_FS = `
  uniform vec3 uColor; uniform float uAlpha;
  varying vec2 vUv; varying float vA;
  void main(){
    float u = vUv.x, taper = 1.0 - u * u;                // 兩頭尖
    float a = vA * uAlpha * taper * taper * (1.0 - 0.5 * abs(vUv.y));
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }`;
const SHORE_VS = "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";
const SHORE_FS = `
  uniform float uTime, uWave, uSwash, uLineA, uAlpha; uniform vec3 uColor;
  varying vec3 vW;
  ${SDF_GLSL}
  float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }   // 不用 sin（iPad、軟體算圖都便宜）
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main(){
    vec2 p = vW.xz;
    float d = sdf(p);
    if (d > 3.0 || d < -0.06) discard;
    float f = fract(uWave + vnoise(p * 0.11) * 2.2);       // 沿岸相位不同：浪一段一段打上來
    float a = 0.0;
    if (f < 0.62) {   // ① 往岸推的浪線：d 2.6 → 1.0（到現有那圈晃動白線前就淡掉，不跟它打架）
      float lt = f / 0.62, dl = mix(2.6, 1.0, lt), lw = 0.04 + 0.05 * lt, x = abs(d - dl);
      if (x < lw) {
        float line = (1.0 - smoothstep(lw * 0.35, lw, x)) * smoothstep(0.0, 0.2, lt) * (1.0 - smoothstep(0.75, 1.0, lt));
        line *= 0.25 + 0.75 * smoothstep(0.32, 0.62, vnoise(p * 1.15 + vec2(uTime * 0.07, 0.0)));   // 斷斷續續
        a = line * uLineA;
      }
    }
    if (f > 0.55 && d < uSwash + 0.12) {   // ② 打上岸的白浪：先快速漲出去、再慢慢退回（呼吸感）
      float g = (f - 0.55) / 0.45, rise = smoothstep(0.0, 0.3, g), fall = 1.0 - smoothstep(0.3, 1.0, g), w = uSwash * rise * fall;
      float de = d + (vnoise(p * 3.1 + vec2(0.0, uTime * 0.2)) - 0.5) * 0.14;
      float band = (1.0 - smoothstep(w - 0.05, w + 0.02, de)) * step(0.02, w);
      float sheet = (1.0 - smoothstep(uSwash * 0.9 - 0.06, uSwash * 0.9, de)) * smoothstep(0.3, 0.45, g) * (1.0 - g) * 0.4;   // 退下去留一層淡淡的水
      float near = (1.0 - smoothstep(0.0, 0.12, abs(de - w))) * rise * fall, lace = 0.0;
      if (near > 0.0) lace = smoothstep(0.6, 0.7, vnoise(p * 5.0 + vec2(0.0, uTime * 0.3))) * near;   // 浪頭小泡泡
      a = max(a, max(band * 0.85, max(sheet, lace * 0.8)));
    }
    a *= uAlpha * smoothstep(-0.06, 0.0, d);
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }`;
const FX_VS = `
  attribute float aAlpha; varying float vA;
  void main(){ vA = aAlpha; vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * p; }`;
const FX_FS = `
  uniform vec3 uColor; varying float vA;
  void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA);
    #include <colorspace_fragment>
  }`;

export function oceanPlugin(ctx, opts = {}) {
  const { THREE, scene, camera, sea } = ctx;
  let disposed = false;
  const owned = [], geos = [], mats = [];
  function dispose() {
    if (disposed) return; disposed = true;
    for (const o of owned) { scene.remove(o); if (o.isInstancedMesh) o.dispose(); }
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    owned.length = geos.length = mats.length = 0;
  }
  const own = (o, order) => { o.userData.zyOcean = true; o.renderOrder = order; o.frustumCulled = false; o.castShadow = o.receiveShadow = false; owned.push(o); scene.add(o); return o; };
  const G = g => { geos.push(g); return g; }, M = m => { mats.push(m); return m; };

  // ---------- 環境（夜、黃昏、天氣）：每格讀一次、慢慢轉過去 ----------
  let envFn = typeof opts.env === "function" ? opts.env : null, envObj = opts.env && typeof opts.env === "object" ? opts.env : null;
  const env = { night: 0, dusk: 0, storm: 0, kind: "sunny", gullMax: 3 };
  let envInit = false;
  function readEnv(dt) {
    let e = null; try { e = envFn ? envFn() : envObj; } catch (err) { e = null; }
    const kind = e && KIND[e.kind] ? e.kind : "sunny";
    const tn = clamp01(+(e && e.night) || 0), td = clamp01(Math.max(+(e && e.dusk) || 0, (+(e && e.dawn) || 0) * 0.7));   // 清晨（日夜時鐘的 dawn）也帶一點暖色
    const k = envInit ? 1 - Math.exp(-dt * 1.4) : 1; envInit = true;
    env.night += (tn - env.night) * k; env.dusk += (td - env.dusk) * k; env.storm += (KIND[kind][0] - env.storm) * k; env.kind = kind;
    env.gullMax = tn > 0.4 ? 0 : KIND[kind][1];
  }

  // 暫存（update 裡不 new 物件）
  const _m4 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _c = new THREE.Color();
  const R = new THREE.Vector3(), U = new THREE.Vector3(), B = new THREE.Vector3(), CP = new THREE.Vector3();   // 鏡頭：右、上、往後（朝鏡頭）、位置
  const view = { l: -15, r: 15, t: 10, b: -10 };
  function readCam() {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    R.set(e[0], e[1], e[2]); U.set(e[4], e[5], e[6]); B.set(e[8], e[9], e[10]); CP.set(e[12], e[13], e[14]);
    view.l = camera.left; view.r = camera.right; view.t = camera.top; view.b = camera.bottom;
  }
  // 鏡頭座標 (sx, sy)＋世界高度 h → 世界座標（正交鏡頭：沿視線方向隨便滑，挑 y＝h 的那一點）
  function camToWorld(sx, sy, h, out) {
    out.copy(CP).addScaledVector(R, sx).addScaledVector(U, sy);
    return out.addScaledVector(B, (h - out.y) / B.y);
  }

  try {
  // 海面高度：找 hub 的海（用同一個 uSdf 的那片）
  let SEA_Y = -0.95;
  scene.traverse(o => { if (o.isMesh && o.material && o.material.uniforms && o.material.uniforms.uSdf === sea.uSdf) SEA_Y = o.position.y; });
  readCam(); readEnv(0);

  // ---------- 海面距離場（CPU 版，魚找淺水、岸邊格子用）----------
  const sdfTex = sea.uSdf.value, SD = sdfTex && sdfTex.image && sdfTex.image.data, SN = SD ? sdfTex.image.width : 0, SR = sea.uR.value;
  function sdfAt(x, z) {
    if (!SD) return 13;
    const fx = (x + SR) / (2 * SR) * SN - 0.5, fz = (z + SR) / (2 * SR) * SN - 0.5;
    if (fx < 0 || fz < 0 || fx >= SN - 1 || fz >= SN - 1) return 13;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * SN + i;
    const a = SD[k], b = SD[k + 1], c = SD[k + SN], d = SD[k + SN + 1];
    return ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) / 255 * 16 - 3;
  }
  const grad = { x: 0, z: 0 };
  function gradAt(x, z) {   // 往深水的方向（單位向量）
    const e = 0.2, gx = sdfAt(x + e, z) - sdfAt(x - e, z), gz = sdfAt(x, z + e) - sdfAt(x, z - e), l = Math.hypot(gx, gz);
    if (l < 1e-5) { grad.x = grad.z = 0; } else { grad.x = gx / l; grad.z = gz / l; }
    return grad;
  }

  // ---------- 浪花短線 ----------
  const stGeo = G(new THREE.InstancedBufferGeometry());
  stGeo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  stGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(N_STREAK * 4);
  for (let i = 0; i < N_STREAK; i++) { seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = (i + Math.random()) / N_STREAK; }
  stGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  stGeo.instanceCount = N_STREAK;
  // 方向：螢幕上往右下斜（參考圖），換成世界 xz：R 轉 35° 往鏡頭方向
  const Rh = new THREE.Vector2(R.x, R.z).normalize(), Fh = new THREE.Vector2(B.x, B.z).normalize();
  const dirW = new THREE.Vector2(Rh.x * Math.cos(0.61) + Fh.x * Math.sin(0.61), Rh.y * Math.cos(0.61) + Fh.y * Math.sin(0.61)).normalize();
  const stU = { uClock: { value: 0 }, uDrift: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2() }, uDir: { value: dirW },
    uTile: { value: TILE }, uDensity: { value: 0.5 }, uLen: { value: 0.9 }, uWidth: { value: 0.1 }, uY: { value: SEA_Y + 0.015 },
    uSdf: sea.uSdf, uR: sea.uR, uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0.6 } };
  const streaks = own(new THREE.Mesh(stGeo, M(new THREE.ShaderMaterial({ uniforms: stU, vertexShader: STREAK_VS, fragmentShader: STREAK_FS, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))), 0.7);
  let stClock = Math.random() * 60, driftX = 0, driftZ = 0;

  // ---------- 岸邊浪：從距離場挑「岸邊一圈」的格子，只畫那裡 ----------
  const shorePos = [];
  if (SD) {
    const GN = 110, cs = 2 * SR / GN, y = SEA_Y + 0.012;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x0 = -SR + i * cs, z0 = -SR + j * cs, x1 = x0 + cs, z1 = z0 + cs;
      const ds = [sdfAt(x0, z0), sdfAt(x1, z0), sdfAt(x0, z1), sdfAt(x1, z1), sdfAt(x0 + cs / 2, z0 + cs / 2)];
      if (Math.min(...ds) > 3.3 || Math.max(...ds) < -0.35) continue;   // 距離場斜率 ≤ 1：格子裡離取樣點最遠約 0.3，所以留 0.3 的餘量
      shorePos.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z0, x0, y, z1, x1, y, z1);
    }
  }
  const shGeo = G(new THREE.BufferGeometry()); shGeo.setAttribute("position", new THREE.Float32BufferAttribute(shorePos, 3));
  const shU = { uTime: { value: 0 }, uWave: { value: 0 }, uSwash: { value: 0.55 }, uLineA: { value: 0.55 }, uAlpha: { value: 1 }, uColor: { value: new THREE.Color(1, 1, 1) }, uSdf: sea.uSdf, uR: sea.uR };
  const shore = own(new THREE.Mesh(shGeo, M(new THREE.ShaderMaterial({ uniforms: shU, vertexShader: SHORE_VS, fragmentShader: SHORE_FS, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))), 0.6);
  shore.visible = shorePos.length > 0;
  let wave = 0;

  // ---------- 小魚 ----------
  function fishGeo() {   // 低多邊形：前後兩個四角錐＋尾巴（頭朝 +x），頂點色：背深一點、尾巴暗一點
    const N = [0.17, 0, 0], T = [0, 0.055, 0], Bv = [0, -0.04, 0], L = [0, 0, -0.065], Rr = [0, 0, 0.065], K = [-0.12, 0, 0], TL = [-0.22, 0.01, -0.075], TR = [-0.22, 0.01, 0.075];
    const tris = [[N, T, Rr], [N, Rr, Bv], [N, Bv, L], [N, L, T], [K, Rr, T], [K, Bv, Rr], [K, L, Bv], [K, T, L], [K, TL, TR], [K, TR, TL]];
    const pos = [], col = [];
    tris.forEach((tr, ti) => tr.forEach(v => { pos.push(...v); const s = ti >= 8 ? 0.8 : v === T ? 0.82 : v === Bv ? 1.08 : 1; col.push(s, s, s); }));
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
  }
  const NF = SCHOOLS.length * FISH_PER;
  const fishMat = M(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
  const FISH_SCALE = 2.0;   // 10-11 主對話：1.35 在整島畫面幾乎看不到（阿葉特別提到要看到小魚）
  const fishIM = own(new THREE.InstancedMesh(G(fishGeo()), fishMat, NF), 0.5);
  const schools = [], fish = [];
  const fishY = SEA_Y - 0.07;
  function placeOnRay(cx, cz, ang, dw) {   // 從島中心沿角度往外：先上岸、再出海到 d＝dw
    const ca = Math.cos(ang), sa = Math.sin(ang); let land = false;
    for (let r = 0.3; r < 26; r += 0.08) { const x = cx + ca * r, z = cz + sa * r, d = sdfAt(x, z); if (d < 0) land = true; else if (land && d >= dw) return [x, z]; }
    return null;
  }
  // 目標點：沿著海岸往前 2–4.5 單位，再沿距離場梯度推到想要的水深（0.9–2.0：淺水區）
  function project(x, z, dw) {
    for (let k = 0; k < 6; k++) { const d = sdfAt(x, z), g = gradAt(x, z); if (!g.x && !g.z) break; x -= g.x * (d - dw) * 0.9; z -= g.z * (d - dw) * 0.9; }
    return [x, z];
  }
  function pickTarget(sc, t) {
    for (let tries = 0; tries < 2; tries++) {
      const g = gradAt(sc.x, sc.z), tx = -g.z * sc.side, tz = g.x * sc.side, L = 2 + Math.random() * 2.5;
      const [x, z] = project(sc.x + tx * L + (Math.random() - 0.5), sc.z + tz * L + (Math.random() - 0.5), 0.9 + Math.random() * 1.1);
      const d = sdfAt(x, z);
      if (d > 0.55 && d < 2.4 && Math.abs(x) < SR - 1 && Math.abs(z) < SR - 1) { sc.tx = x; sc.tz = z; sc.tRe = t + 14; return; }
      sc.side = -sc.side;
    }
    const g = gradAt(sc.x, sc.z), d = sdfAt(sc.x, sc.z);   // 找不到：直接往水深 1.4 那邊游
    sc.tx = sc.x + g.x * (1.4 - d); sc.tz = sc.z + g.z * (1.4 - d); sc.tRe = t + 4;
  }
  const town = ctx.town || { x: 4.8, z: -18.9 };
  SCHOOLS.forEach((def, si) => {
    const c = def.isl === "town" ? [town.x, town.z] : [0, 0];
    const at = placeOnRay(c[0], c[1], def.ang * Math.PI / 180, 1.4);
    if (!at) return;
    const sc = { i: si, x: at[0], z: at[1], h: 0, v: 0.3 + Math.random() * 0.15, side: Math.random() < 0.5 ? 1 : -1, tx: at[0], tz: at[1], tRe: 0, vis: 1, want: true, color: new THREE.Color(def.color) };
    const g = gradAt(sc.x, sc.z); sc.h = Math.atan2(g.x * sc.side, -g.z * sc.side);   // 一開始沿著岸游
    schools.push(sc);
    for (let k = 0; k < FISH_PER; k++) fish.push({ sc, slot: SLOTS[k], ph: Math.random() * 6.28, scale: 0.85 + Math.random() * 0.3, x: sc.x, y: fishY, z: sc.z, mode: 0, t0: 0, T: 1, x0: 0, z0: 0, dx: 0, dz: 0, dist: 1, apex: 0.6, lx: 0, lz: 0, ly: 0 });
  });
  fishIM.count = fish.length;
  for (let i = 0; i < fish.length; i++) fishIM.setColorAt(i, fish[i].sc.color);
  if (!fish.length) fishIM.visible = false;
  const nightFishC = new THREE.Color("#2b3a66");
  let nextJump = 3 + Math.random() * 4, lastT = 0, jumps = 0;
  const lastPick = { on: 0, total: 0 };                 // 上次挑跳魚：畫面上看得到的群／候選群（測試用）

  // ---------- 水花（圈圈＋水滴）----------
  const fxU = { uColor: { value: new THREE.Color(1, 1, 1) } };
  const fxMat = M(new THREE.ShaderMaterial({ uniforms: fxU, vertexShader: FX_VS, fragmentShader: FX_FS, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const ringGeo = G(new THREE.RingGeometry(0.8, 1, 20, 1)); ringGeo.rotateX(-Math.PI / 2);
  const ringA = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLASH * 2), 1); ringGeo.setAttribute("aAlpha", ringA);
  const ringIM = own(new THREE.InstancedMesh(ringGeo, fxMat, MAX_SPLASH * 2), 0.8);
  const dropGeo = G(new THREE.OctahedronGeometry(0.035, 0));
  const dropA = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLASH * DROPS), 1); dropGeo.setAttribute("aAlpha", dropA);
  const dropIM = own(new THREE.InstancedMesh(dropGeo, fxMat, MAX_SPLASH * DROPS), 0.8);
  ringIM.visible = dropIM.visible = false;
  const splashes = [];
  for (let i = 0; i < MAX_SPLASH; i++) { const drops = []; for (let k = 0; k < DROPS; k++) drops.push({ vx: 0, vy: 0, vz: 0 }); splashes.push({ alive: false, t0: 0, x: 0, z: 0, big: false, drops }); }
  function splash(x, z, big, t) {
    let s = null; for (const q of splashes) if (!q.alive) { s = q; break; }
    if (!s) { s = splashes[0]; for (const q of splashes) if (q.t0 < s.t0) s = q; }
    s.alive = true; s.t0 = t; s.x = x; s.z = z; s.big = big;
    const sp = big ? 1 : 0.6;
    s.drops.forEach((d, k) => { const a = (k / DROPS + Math.random() * 0.15) * Math.PI * 2, h = (0.35 + Math.random() * 0.3) * sp; d.vx = Math.cos(a) * h; d.vz = Math.sin(a) * h; d.vy = (1.5 + Math.random() * 0.7) * sp; });
  }

  // ---------- 海鷗 ----------
  function gullGeo() {   // 頭朝 +x；aSpan＝翅膀頂點離身體中線多遠（帶正負號），身體＝0
    const N = [0.12, 0, 0], T = [0, 0.03, 0], Bv = [0, -0.03, 0], L = [0, 0, -0.035], Rr = [0, 0, 0.035], K = [-0.13, 0.005, 0], TL = [-0.19, 0.005, -0.035], TR = [-0.19, 0.005, 0.035];
    const pos = [], col = [], span = [];
    const W = [1, 1, 1], WG = [0.86, 0.89, 0.93], TIP = [0.24, 0.26, 0.31], BEAK = [0.98, 0.66, 0.2];
    const tri = (a, b, c, ca, cb = ca, cc = ca, wing = false) => { for (const [v, cl] of [[a, ca], [b, cb], [c, cc]]) { pos.push(...v); col.push(...cl); span.push(wing ? v[2] : 0); } };
    for (const [a, b, c] of [[N, T, Rr], [N, Rr, Bv], [N, Bv, L], [N, L, T], [K, Rr, T], [K, Bv, Rr], [K, L, Bv], [K, T, L], [K, TL, TR]]) tri(a, b, c, W);
    tri([0.12, 0, -0.012], [0.17, -0.006, 0], [0.12, 0, 0.012], BEAK);
    for (const s of [1, -1]) {   // 翅膀：內段（白灰）＋外段往後掃（翅尖深灰）
      const A = [0.06, 0, 0.03 * s], Bq = [-0.065, 0, 0.03 * s], C = [-0.06, 0, 0.17 * s], D = [0.05, 0, 0.17 * s], E = [-0.1, 0, 0.33 * s], F = [-0.03, 0, 0.345 * s];
      tri(A, Bq, C, WG, WG, WG, true); tri(A, C, D, WG, WG, WG, true);
      tri(D, C, E, WG, WG, TIP, true); tri(D, E, F, WG, TIP, TIP, true);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setAttribute("aSpan", new THREE.Float32BufferAttribute(span, 1));
    g.computeVertexNormals(); return g;
  }
  const gGeo = G(gullGeo()), flapA = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GULL), 1); flapA.setUsage(THREE.DynamicDrawUsage); gGeo.setAttribute("aFlap", flapA);
  const gullMat = M(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  gullMat.onBeforeCompile = sh => {
    sh.vertexShader = "attribute float aSpan; attribute float aFlap;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      { float s = abs(aSpan); if (s > 0.0) { float i1 = min(s, 0.17), o1 = max(s - 0.17, 0.0), a1 = aFlap, a2 = aFlap * 1.7 - 0.12;
        transformed.y += i1 * sin(a1) + o1 * sin(a2); transformed.z = sign(aSpan) * (i1 * cos(a1) + o1 * cos(a2)); } }`);
  };
  gullMat.customProgramCacheKey = () => "zyOceanGull";
  const gullIM = own(new THREE.InstancedMesh(gGeo, gullMat, MAX_GULL), 0);
  gullIM.visible = false;
  const GULL_H = 8.5, GULL_SCALE = 1.45, GULL_YAW = 0.7;
  const gulls = [];
  for (let i = 0; i < MAX_GULL; i++) gulls.push({ i, alive: false, sx: 0, sy: 0, u: 0, dir: 1, spd: 1.5, ph: Math.random() * 6.28, flap: 0.3, glide: 0, nextGlide: 0, leave: 0, bob: Math.random() * 6.28, low: false });
  let gullWant = 1 + Math.floor(Math.random() * 3), gullNext = 0, gullReroll = 0;
  // 海鷗飛哪條帶子（鏡頭座標 y）：畫面裡的陸地（地面輪廓）上緣／下緣量出來 →
  //   直式：島上方、按鈕列下面那片空海（有空間才用）；島下方空海（有空間才用，low）｜橫式沒空間：貼著畫面上緣（建築、浮標都在它下面）
  const land = { t: 0, b: 0, n: 0 };
  const landPt = (x, z) => {
    const dx = x - CP.x, dy = -CP.y, dz = z - CP.z, sx = R.x * dx + R.y * dy + R.z * dz;
    if (sx < view.l || sx > view.r) return;
    const sy = U.x * dx + U.y * dy + U.z * dz; if (sy > land.t) land.t = sy; if (sy < land.b) land.b = sy; land.n++;
  };
  function measureLand() {
    land.t = -1e9; land.b = 1e9; land.n = 0;
    const poly = ctx.islPoly; if (poly) for (let i = 0; i < poly.length; i += 3) landPt(poly[i].x, poly[i].y);
    if (ctx.town) { const T = ctx.town, h = T.h + 0.7; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) landPt(T.x + a * h, T.z + b * h); }
  }
  const BUILD_H = 2.4;                                   // 建築大概多高（鏡頭座標）
  const room = { lo: 0, hi: 0 };
  const setRoom = (lo, hi, H) => { if (!land.n || hi - lo <= H * 0.06) return false; room.lo = lo; room.hi = hi; return true; };
  function roomTop() { const H = view.t - view.b; return setRoom(land.t + BUILD_H, view.t - H * 0.21, H); }   // 0.21＝直式上方按鈕列＋貼紙列
  function roomLow() { const H = view.t - view.b; return setRoom(view.b + H * 0.08, land.b - 1.0, H); }
  function laneSy(g) {
    if (g.low ? roomLow() : roomTop()) return room.lo + (room.hi - room.lo) * (0.2 + 0.6 * g.u);
    const H = view.t - view.b;
    return g.low ? view.b + H * (0.04 + 0.05 * g.u) : view.t - H * (0.05 + 0.07 * g.u);   // 下面那條沒空間了（轉成橫式）：貼著下緣飛完，不穿過島
  }
  function spawnGull(g, anywhere, t) {
    let u = Math.random();   // 跟別隻錯開高度
    for (let k = 0; k < 4; k++) { let ok = true; for (const o of gulls) if (o !== g && o.alive && Math.abs(o.u - u) < 0.3) ok = false; if (ok) break; u = Math.random(); }
    g.u = u; g.low = roomLow() && Math.random() < 0.4; g.dir = Math.random() < 0.5 ? 1 : -1; g.spd = 1.3 + Math.random() * 0.6; g.leave = 0; g.glide = 0; g.nextGlide = t + 2 + Math.random() * 4;
    const W = view.r - view.l;
    g.sx = anywhere ? view.l + W * (0.2 + Math.random() * 0.6) : g.dir > 0 ? view.l - 1 : view.r + 1;
    g.sy = laneSy(g); g.alive = true;
  }

  // ---------- 每格 ----------
  const warm = new THREE.Color("#ffd2a0"), nightBlue = new THREE.Color("#9ec0ff"), nightFoam = new THREE.Color("#c3d8ff"), white = new THREE.Color(1, 1, 1);
  function updateCenter() {   // 畫面中心對到海面上的哪一點
    const cx = (view.l + view.r) / 2, cy = (view.t + view.b) / 2;
    camToWorld(cx, cy, SEA_Y, _v); stU.uCenter.value.set(_v.x, _v.z);
  }
  function stepFish(t, dt) {
    const kv = 1 - Math.exp(-dt * 1.5), nightOn = env.night > 0.5;
    for (const sc of schools) {
      sc.want = !(nightOn && NIGHT_HIDE.has(sc.i));
      sc.vis += ((sc.want ? 1 : 0) - sc.vis) * kv;
      let dx = sc.tx - sc.x, dz = sc.tz - sc.z, dist = Math.hypot(dx, dz);
      if (dist < 0.5 || t > sc.tRe) { pickTarget(sc, t); dx = sc.tx - sc.x; dz = sc.tz - sc.z; dist = Math.hypot(dx, dz) || 1; }
      const d = sdfAt(sc.x, sc.z), g = gradAt(sc.x, sc.z);
      const push = d < 0.8 ? (0.8 - d) * 2.5 : d > 2.3 ? -(d - 2.3) * 2 : 0;   // 太靠岸往外、太深往內
      const want = Math.atan2(dz / dist + g.z * push, dx / dist + g.x * push), diff = wrapA(want - sc.h), turn = 0.9 * dt;
      sc.h += diff > turn ? turn : diff < -turn ? -turn : diff;
      const v = sc.v * (1 + env.storm * 0.4);
      sc.x += Math.cos(sc.h) * v * dt; sc.z += Math.sin(sc.h) * v * dt;
    }
    const sh = sea.uShallow.value;
    let nVis = 0, nDraw = 0;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i], sc = f.sc;
      let x, z, y = fishY + Math.sin(t * 1.1 + f.ph) * 0.01, yaw, pitch = 0, sc1 = f.scale * sc.vis;
      const ch = Math.cos(sc.h), shh = Math.sin(sc.h);
      if (f.mode === 1) {   // 跳出水面：拋物線，頭跟著弧線上仰再下栽
        const u = (t - f.t0) / f.T;
        if (u >= 1) { f.mode = 2; f.lx = f.x0 + f.dx * f.dist; f.lz = f.z0 + f.dz * f.dist; f.ly = t; splash(f.lx, f.lz, true, t); }
        else {
          x = f.x0 + f.dx * f.dist * u; z = f.z0 + f.dz * f.dist * u; y = fishY + 4 * f.apex * u * (1 - u);
          yaw = -Math.atan2(f.dz, f.dx); pitch = Math.atan2(4 * f.apex * (1 - 2 * u), f.dist); sc1 = f.scale * 1.3;
        }
      }
      if (f.mode !== 1) {
        const fw = f.slot[0] + Math.sin(t * 0.8 + f.ph) * 0.08, sd = f.slot[1] + Math.sin(t * 0.6 + f.ph * 1.7) * 0.1;
        x = sc.x + ch * fw - shh * sd; z = sc.z + shh * fw + ch * sd;
        const d = sdfAt(x, z); if (d < 0.35) { const g = gradAt(x, z); x += g.x * (0.35 - d); z += g.z * (0.35 - d); }
        if (f.mode === 2) { const r = (t - f.ly) / 1.4; if (r >= 1) f.mode = 0; else { const k = smooth(r); x = f.lx + (x - f.lx) * k; z = f.lz + (z - f.lz) * k; } }
        yaw = -(sc.h + Math.sin(t * 0.9 + f.ph) * 0.25) + Math.sin(t * 9 + f.ph * 3) * 0.13;   // 游泳擺尾
      }
      f.x = x; f.z = z; f.y = y;
      _p.set(x, y, z); _q.setFromEuler(_e.set(0, yaw, pitch, "YZX")); _s.setScalar(Math.max(sc1 * FISH_SCALE, 0.0001));
      fishIM.setMatrixAt(i, _m4.compose(_p, _q, _s));
      // 在水裡＝往水色混一點（看起來在水面下）；跳起來＝原色。晚上變暗
      _c.copy(sc.color);
      if (f.mode !== 1) _c.lerp(sh, 0.16);
      if (env.night > 0.01) _c.lerp(nightFishC, env.night * 0.55);
      fishIM.setColorAt(i, _c);
      if (sc1 > 0.05) nDraw++;
      if (f.mode === 1 || sc.vis > 0.5) nVis++;   // 「看得到」的魚（淡出一半以上就不算）
    }
    fishIM.instanceMatrix.needsUpdate = true; if (fishIM.instanceColor) fishIM.instanceColor.needsUpdate = true;
    fishIM.visible = nDraw > 0;
    return nVis;
  }
  function startJump(f, t) {
    if (!f || f.mode !== 0) return false;
    const sc = f.sc;
    const away = Math.atan2(-B.z, -B.x);                 // 往畫面上方（遠離鏡頭）跳：弧線落在剛剛檢查過沒被按鈕擋住的那塊
    for (let k = 0; k < 6; k++) {
      const a = (k < 3 ? away : k < 5 ? sc.h : sc.h + Math.PI) + (Math.random() - 0.5) * (k < 3 ? 1.6 : 0.8), dist = 1.3 + Math.random() * 0.6;
      const lx = f.x + Math.cos(a) * dist, lz = f.z + Math.sin(a) * dist;
      if (sdfAt(lx, lz) < 0.35) continue;
      f.mode = 1; f.t0 = t; f.T = 1.05 + Math.random() * 0.25; f.apex = 0.85 + Math.random() * 0.3; f.x0 = f.x; f.z0 = f.z; f.dx = Math.cos(a); f.dz = Math.sin(a); f.dist = dist;
      splash(f.x, f.z, false, t); jumps++;
      return true;
    }
    return false;
  }
  function pickJumper(forced) {   // 優先挑畫面裡看得到（按鈕、浮標、貼紙列、貓頭鷹沒擋著）、離畫面中心近的那群
    const cands = [], cv = ctx.renderer && ctx.renderer.domElement;
    for (const sc of schools) {
      if (!forced && sc.vis < 0.9) continue;
      _v.set(sc.x, SEA_Y, sc.z).project(camera);
      const r = Math.max(Math.abs(_v.x), Math.abs(_v.y));
      let on = r < 0.85;
      if (on && cv && typeof document !== "undefined" && document.elementFromPoint) {
        const px = (_v.x + 1) / 2 * innerWidth, py = (1 - _v.y) / 2 * innerHeight;
        for (const [dx, dy] of [[0, 0], [0, -32], [0, -64], [-28, -16], [28, -16], [-20, -48], [20, -48]]) { const el = document.elementFromPoint(px + dx, py + dy); if (!el || (el !== cv && !(ctx.stage && ctx.stage.contains(el)))) on = false; }
      }
      if (on || forced) cands.push({ sc, on, r });
    }
    cands.sort((a, b) => a.r - b.r);
    const on = cands.filter(c => c.on), pool = on.length ? on.slice(0, 2) : cands.slice(0, 1);   // 都被擋住／不在畫面：挑離畫面中心最近的那群
    lastPick.on = on.length; lastPick.total = cands.length;
    if (!pool.length) return null;
    const sc = pool[Math.floor(Math.random() * pool.length)].sc;
    const fs = fish.filter(f => f.sc === sc && f.mode === 0);
    return fs.length ? fs[Math.floor(Math.random() * fs.length)] : null;
  }
  function stepSplashes(t) {
    let any = false;
    for (let i = 0; i < MAX_SPLASH; i++) {
      const s = splashes[i], age = t - s.t0;
      if (s.alive && age > 1.2) s.alive = false;
      for (let r = 0; r < 2; r++) {   // 兩圈：外圈先、內圈晚一點
        const u = s.alive ? (age - r * 0.18) / (s.big ? 1.0 : 0.75) : -1, k = i * 2 + r;
        if (u < 0 || u >= 1) { ringA.array[k] = 0; _m4.makeScale(0, 0, 0); ringIM.setMatrixAt(k, _m4); continue; }
        const rad = (s.big ? 0.5 : 0.3) * (1 - (1 - u) * (1 - u)) * (r ? 0.6 : 1) + 0.04;
        _p.set(s.x, SEA_Y + 0.02, s.z); _q.identity(); _s.set(rad, 1, rad);
        ringIM.setMatrixAt(k, _m4.compose(_p, _q, _s)); ringA.array[k] = (1 - u) * 0.9; any = true;
      }
      for (let k = 0; k < DROPS; k++) {
        const d = s.drops[k], idx = i * DROPS + k, y = SEA_Y + d.vy * age - 4.5 * age * age;
        if (!s.alive || y < SEA_Y || age > 0.8) { dropA.array[idx] = 0; _m4.makeScale(0, 0, 0); dropIM.setMatrixAt(idx, _m4); continue; }
        _p.set(s.x + d.vx * age, y, s.z + d.vz * age); _q.identity(); _s.setScalar(s.big ? 1 : 0.7);
        dropIM.setMatrixAt(idx, _m4.compose(_p, _q, _s)); dropA.array[idx] = 1 - age / 0.8; any = true;
      }
    }
    ringIM.visible = dropIM.visible = any;
    if (any) { ringIM.instanceMatrix.needsUpdate = dropIM.instanceMatrix.needsUpdate = true; ringA.needsUpdate = dropA.needsUpdate = true; }
  }
  function stepGulls(t, dt) {
    measureLand();
    const max = env.gullMax;
    if (t > gullReroll) { gullReroll = t + 20 + Math.random() * 20; gullWant = 1 + Math.floor(Math.random() * 3); }
    const want = Math.min(max, gullWant);
    let alive = 0; for (const g of gulls) if (g.alive && !g.leave) alive++;
    // 太多（晚上、暴風雨）→ 多出來的加速往上飛走；不夠 → 隔一陣子從畫面邊飛進來
    for (const g of gulls) if (g.alive && !g.leave && alive > want) { g.leave = t; alive--; }
    if (alive < want && t > gullNext) { for (const g of gulls) if (!g.alive) { spawnGull(g, false, t); gullNext = t + 3 + Math.random() * 6; break; } }
    let any = false;
    const W = view.r - view.l;
    for (let i = 0; i < MAX_GULL; i++) {
      const g = gulls[i];
      if (!g.alive) { _m4.makeScale(0, 0, 0); gullIM.setMatrixAt(i, _m4); continue; }
      const lv = g.leave ? t - g.leave : 0, spd = g.spd * (1 + lv * 1.5);
      g.sx += g.dir * spd * dt;
      const target = laneSy(g) + Math.sin(t * 0.55 + g.bob) * 0.35 + lv * lv * (g.low ? -2.5 : 2.5);   // 飛走：上面那條往上、下面那條往下（不穿過島）
      g.sy += (target - g.sy) * (1 - Math.exp(-dt * 1.5));
      if ((g.dir > 0 && g.sx > view.r + 1.5) || (g.dir < 0 && g.sx < view.l - 1.5) || g.sy > view.t + 2 || g.sy < view.b - 2 || g.sx < view.l - W || g.sx > view.r + W) { g.alive = false; _m4.makeScale(0, 0, 0); gullIM.setMatrixAt(i, _m4); continue; }
      // 拍翅／滑翔
      if (!g.glide && t > g.nextGlide && !g.leave) g.glide = t + 1.2 + Math.random() * 1.6;
      if (g.glide && t > g.glide) { g.glide = 0; g.nextGlide = t + 3 + Math.random() * 5; }
      const gliding = !!g.glide;
      g.ph += dt * (g.leave ? 13 : 9);
      const tgtFlap = gliding ? 0.16 : 0.12 + 0.55 * Math.sin(g.ph);
      g.flap += (tgtFlap - g.flap) * (gliding ? 1 - Math.exp(-dt * 5) : 1);
      flapA.array[i] = g.flap;
      camToWorld(g.sx, g.sy, GULL_H, _p);
      // 身體斜斜朝畫面裡（往遠處）飛：正側面看翅膀會變成上下一條線，轉 40° 才看得出張開的翅膀
      const yaw = Math.atan2(-R.z, R.x) + (g.dir > 0 ? GULL_YAW : Math.PI - GULL_YAW), roll = Math.sin(t * 0.55 + g.bob + 1.2) * 0.18 * g.dir;
      _q.setFromEuler(_e.set(roll, yaw, gliding ? -0.05 : 0.04 * Math.sin(g.ph), "YZX")); _s.setScalar(GULL_SCALE);
      gullIM.setMatrixAt(i, _m4.compose(_p, _q, _s)); any = true;
    }
    gullIM.visible = any;
    if (any) { gullIM.instanceMatrix.needsUpdate = true; flapA.needsUpdate = true; }
  }
  // 先把 shader 都編譯好（水花、海鷗平常是關著的：第一次出現那一格才編譯會卡一下）：暫時全部打開 → compile → 還原（跟天氣外掛同一招）
  { const vis = owned.map(o => o.visible); owned.forEach(o => { o.visible = true; }); try { if (ctx.renderer) ctx.renderer.compile(scene, camera); } catch (e) {} finally { owned.forEach((o, i) => { o.visible = vis[i]; }); } }
  // 一開始就有 1–2 隻海鷗在畫面裡（晴天）
  { measureLand(); const n0 = Math.min(env.gullMax, 1 + (Math.random() < 0.6 ? 1 : 0)); for (let i = 0; i < n0; i++) spawnGull(gulls[i], true, 0); }
  let nFish = 0, firstFrame = true;

  function update(t, dt) {
    if (disposed) return;
    lastT = t;
    readEnv(dt); readCam();
    if (firstFrame) { firstFrame = false; for (const g of gulls) if (g.alive) g.nextGlide = t + 2 + Math.random() * 4; gullNext = t + 4; gullReroll = t + 25; nextJump = t + 3 + Math.random() * 4; for (const sc of schools) sc.tRe = t; }
    const s = env.storm, n = env.night, du = env.dusk;
    // 浪花短線
    const spd = 0.18 + 1.5 * s;
    driftX = modp(driftX + dirW.x * spd * dt, TILE); driftZ = modp(driftZ + dirW.y * spd * dt, TILE);
    stClock = modp(stClock + dt * (1 + 1.4 * s), CLOCK_WRAP);
    stU.uClock.value = stClock; stU.uDrift.value.set(driftX, driftZ); updateCenter();
    stU.uDensity.value = 0.62 + 0.38 * s; stGeo.instanceCount = Math.min(N_STREAK, Math.ceil((stU.uDensity.value + 0.02) * N_STREAK));   // 種子 w 照順序排：密度以外的那幾條根本不送去畫
stU.uLen.value = 1.15 + 0.6 * s; stU.uWidth.value = 0.12 + 0.03 * s;
    stU.uAlpha.value = (0.78 + 0.17 * s) * (1 - 0.4 * n);
    stU.uColor.value.copy(white).lerp(warm, du * 0.4).lerp(nightBlue, n * 0.85);   // 黃昏海面偏淡紫：暖色只帶一點，太暖會跟海面糊在一起
    // 岸邊浪
    wave = modp(wave + dt / (5 - 2.2 * s), 1);
    shU.uTime.value = t; shU.uWave.value = wave; shU.uSwash.value = 0.55 + 0.6 * s; shU.uLineA.value = 0.55 + 0.35 * s; shU.uAlpha.value = 1 - 0.35 * n;
    shU.uColor.value.copy(white).lerp(warm, du * 0.35).lerp(nightFoam, n * 0.7);
    fxU.uColor.value.copy(white).lerp(nightFoam, n * 0.6);
    // 魚、跳魚、水花
    nFish = stepFish(t, dt);
    if (t > nextJump) {
      const allow = s < 0.6;   // 雷雨、颱風不跳
      if (allow) startJump(pickJumper(false), t);
      nextJump = t + (n > 0.5 ? 18 + Math.random() * 14 : s > 0.3 ? 10 + Math.random() * 8 : 5 + Math.random() * 7);
    }
    stepSplashes(t);
    stepGulls(t, dt);
  }

  return {
    update, dispose,
    setEnv(e) { if (typeof e === "function") { envFn = e; envObj = null; } else { envFn = null; envObj = e || null; } },
    jump() { if (disposed) return false; const ok = startJump(pickJumper(true), lastT); if (ok) nextJump = lastT + 6 + Math.random() * 5; return ok; },
    info() {
      const fj = fish.find(f => f.mode === 1), g0 = gulls.find(g => g.alive);
      let gp = null; if (g0) { camToWorld(g0.sx, g0.sy, GULL_H, _v); gp = [+_v.x.toFixed(3), +_v.y.toFixed(3), +_v.z.toFixed(3)]; }
      return { fish: nFish, schools: schools.filter(sc => sc.vis > 0.5).length, gulls: gulls.filter(g => g.alive).length, gullsLeaving: gulls.filter(g => g.alive && g.leave).length, gullMax: env.gullMax,
        streaks: Math.round(N_STREAK * Math.min(1, stU.uDensity.value)), shoreTris: shorePos.length / 9, jumping: fish.filter(f => f.mode === 1).length, jumps, splashes: splashes.filter(q => q.alive).length,
        env: { night: +env.night.toFixed(3), dusk: +env.dusk.toFixed(3), storm: +env.storm.toFixed(3), kind: env.kind },
        draws: owned.filter(o => o.visible).length, objects: owned.length, pick: { on: lastPick.on, total: lastPick.total },
        probe: { fish: fish.length ? [+fish[0].x.toFixed(3), +fish[0].z.toFixed(3)] : null, jumper: fj ? [+fj.x.toFixed(3), +fj.y.toFixed(3), +fj.z.toFixed(3)] : null, gull: gp, clock: +stClock.toFixed(3), wave: +wave.toFixed(3) } };
    },
  };
  } catch (e) { dispose(); throw e; }
}
