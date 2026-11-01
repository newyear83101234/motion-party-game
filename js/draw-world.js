// 我的世界：小孩畫完的角色被剪下來，住進主題場景裡走來走去，點角色會跳、點空地會冒點心給牠們吃。
// 參考 teamLab 塗鴉水族館：自己塗的角色活起來、世界越來越熱鬧 → 想再畫下一隻。
// 獨立模組：不 import 既有模組（版號會變），聲音、粒子、換畫面都從 deps 傳進來。
// 效能（iPad）：角色是絕對定位的 <img>，每幀只改 transform（不重排版）；requestAnimationFrame 只在畫面開著時跑。

const MAX_MOBS = 24, MAX_STICKERS = 6, MAX_SNACKS = 4, MAX_FX = 60;
const LS_KEY = "draw-world";
const BG = [1672, 941];   // 場景背景原圖尺寸（載入後以實際尺寸為準）：cover 鋪滿時拿來換算地面在畫面上的位置
const NOTES = [7, 9, 10, 12, 14];   // 點角色時隨機挑的音（五聲音階，怎麼挑都好聽）
const HOP = .5, AIR = .78;   // 糖果國跳著走：一跳 0.5 秒，前 78% 在空中

// 各主題的個性。feet = 角色腳踩的範圍（背景圖高度的比例，0 是頂端）；horizon = 地平線（貼紙站這裡）
// size = 角色高度佔畫面高度；speed = 每秒走多遠（畫面高度的比例）；bob/tilt/step = 走路的彈跳、搖晃、步伐
const SCENES = {
  animal: { move: "walk", snack: "🍎", feet: [.5, .96], horizon: .41, size: .23, speed: .08, bob: .05, tilt: 4, step: 2.2 },
  dino: { move: "walk", snack: "🍎", feet: [.52, .96], horizon: .43, size: .25, speed: .055, bob: .035, tilt: 7, step: 1.4 },   // 恐龍：步子慢、晃得大，重重的
  fairy: { move: "walk", snack: "🍎", feet: [.49, .96], horizon: .4, size: .22, speed: .06, bob: .025, tilt: 3, step: 1.8, float: true },
  sweets: { move: "hop", snack: "🍬", feet: [.52, .96], horizon: .43, size: .21, speed: .09 },
  // 馬路 46%～100%、中央虛線約 59%：遠車道（往左）輪子踩 56～58%，近車道（往右）踩 78～93%
  vehicle: { move: "drive", snack: "⛽", feet: [.56, .93], horizon: .47, size: .17, speed: .2, lanes: [[0, .06], [.6, 1]] },
  ocean: { move: "swim", snack: "🫧", feet: [.34, .8], horizon: .53, size: .18, speed: .06 },
  kpop: { move: "hop", snack: "🍜", feet: [.5, .96], horizon: .42, size: .22, speed: .08 },   // 演唱會舞台：一跳一跳像在跳舞；HUNTR/X 愛吃泡麵
};
const SLOTS = [[.1, 0], [.9, 0], [.05, 1], [.95, 1], [.3, 0], [.7, 0]];   // 貼紙位置：[橫向比例, 0=地平線 1=下方角落]

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = n => Math.round(n * 10) / 10, r3 = n => Math.round(n * 1000) / 1000;   // transform 字串少點小數：字串沒變就不寫回 DOM
const easeInOut = p => p < .5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2;
const backOut = p => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2;
function el(tag, cls, html = "") { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function readLS() {
  try { const o = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); if (o && Number.isFinite(o.hint)) return o; } catch { }
  return { hint: 0 };   // 壞資料、讀不到 → 回到預設
}
function writeLS(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { } }

export function mountWorld(deps) {
  const A = deps.A || {}, V = deps.v || "0";
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "css/draw-world.css?v=" + V;
  document.head.appendChild(link);

  const sec = document.createElement("section");
  sec.id = "world"; sec.className = "screen";
  sec.innerHTML = `<div class="w-bg"></div><div class="w-img"></div><div class="w-deco"></div><div class="w-field"></div>
    <div class="w-empty"><img class="w-mascot" alt="" draggable="false"><span class="w-wave">👋</span></div>
    <div class="w-top"><button id="wHome" class="big" aria-label="回首頁">🏠</button><div id="wTabs"></div></div>
    <button id="wDraw" class="big" aria-label="再去畫一隻">🖌️</button>`;
  document.body.appendChild(sec);
  const $ = s => sec.querySelector(s);
  const bgImg = $(".w-img"), deco = $(".w-deco"), field = $(".w-field"), tabs = $("#wTabs");
  $(".w-mascot").src = deps.mascot || "IMAGE/draw/ui/mascot.png?v=" + V;
  const fx = deps.Particles ? new deps.Particles(sec) : { trail() { }, splash() { }, stars() { }, fit() { } };
  const note = i => A.note?.(i, { gain: .5, dur: .5 });

  // 🏠 與「再去畫一隻」都回首頁；把目前主題傳回去，主程式可以直接停在這個主題
  const leave = () => { const t = state.theme; close(); deps.onHome?.(t); };
  $("#wHome").onclick = leave;
  $("#wDraw").onclick = leave;
  for (const t of deps.themes || []) {
    const b = el("button", "w-tab", `<img class="ico" alt="" draggable="false"><b class="w-n"></b>`);
    b.id = "wTab-" + t.id; b.dataset.theme = t.id; b.setAttribute("aria-label", t.id);
    b.querySelector("img").src = t.img;
    if (t.color) b.style.setProperty("--c", t.color);   // 選中時填主題色（跟首頁、貼紙本一樣）
    b.onclick = () => { if (t.id !== state.theme) open(t.id); };
    tabs.append(b);
  }

  let L = { x: 0, y: 0, W: 1, H: 1, dh: 1, b0: 0, b1: 1 }, openSeq = 0, last = 0, bgSize = BG.slice();
  const state = {
    open: false, theme: null, K: SCENES.animal, phase: "closed", mobs: [], snacks: [], urls: new Set(), counts: {}, bg: "",
    frames: 0, raf: 0, speed: 1, t: 0, arr: null, hint: null, fxn: 0, spT: 1,
    stats: { jumps: 0, snacks: 0, eaten: 0, hearts: 0, bubbles: 0, puffs: 0, trails: 0, happy: 0, uturns: 0, sparkles: 0 },
    get L() { return L; },
  };

  // ── 版面：背景 cover 鋪滿 → 背景圖上的比例換算成畫面 y ──
  const fy = f => L.H / 2 + (f - .5) * L.dh;
  function measure() {
    const r = sec.getBoundingClientRect(), W = r.width || innerWidth, H = r.height || innerHeight;
    L = { x: r.left, y: r.top, W, H, dh: bgSize[1] * Math.max(W / bgSize[0], H / bgSize[1]), b0: 0, b1: 1 };
    const K = state.K;
    L.b0 = fy(K.feet[0]); L.b1 = Math.min(fy(K.feet[1]), H * .97);
    if (K.move === "swim") L.b0 = Math.max(L.b0, H * (.14 + K.size));   // 魚不要游進上面的按鈕底下
    if (L.b1 < L.b0 + 20) L.b1 = L.b0 + 20;
    for (const m of state.mobs) size(m);
    placeStickers();
    fx.fit();
  }
  // 角色大小跟著畫面高度；角色多時縮小一點，不然擠成一團
  function size(m) {
    const K = state.K;
    let bh = L.H * K.size * (state.mobs.length > 14 ? .85 : state.mobs.length <= 3 && K.move !== "drive" ? 1.4 : 1), bw = bh * m.ar;   // 只有一兩隻：放大，第一張作品不要看起來很渺小
    const maxW = bh * (K.move === "drive" ? 2.2 : 1.5);
    if (bw > maxW) { bw = maxW; bh = bw / m.ar; }
    m.bw = bw; m.bh = bh;
    m.el.style.width = bw + "px"; m.el.style.height = bh + "px";
    m.sh.style.width = bw * .78 + "px"; m.sh.style.height = bw * .2 + "px";
    m.last = m.lastSh = "";
  }
  // 越靠近鏡頭（越下面）越大；魚沒有前後，各自隨機大小
  function depth(m) {
    const mv = state.K.move;
    return mv === "swim" ? m.dep : mv === "drive" ? .86 + .16 * m.v : .72 + .4 * m.v;
  }

  // ── 角色 ──
  function addMob(e) {
    let node;
    const b = e.blob;
    if (typeof Blob !== "undefined" && b instanceof Blob) {
      const url = URL.createObjectURL(b);
      state.urls.add(url);
      node = new Image(); node.src = url;
    } else if (typeof b === "string") { node = new Image(); node.src = b; }
    else if (typeof ImageBitmap !== "undefined" && b instanceof ImageBitmap) {
      node = document.createElement("canvas");   // ImageBitmap 不能直接給 <img>：畫進一張同尺寸的 canvas
      node.width = b.width; node.height = b.height;
      node.getContext("2d").drawImage(b, 0, 0);
    } else return null;
    const w = e.w || node.width || 1, h = e.h || node.height || 1;
    const wrap = el("div", "w-mob"), sh = el("div", "w-shadow");
    wrap.append(node);
    field.append(sh, wrap);
    const m = {
      id: e.id, art: e.art, el: wrap, sh, img: node, ar: w / h, face: e.face === -1 ? -1 : 1,
      u: .5, v: .5, tu: .5, tv: .5, dir: 1, sx: 1, mode: "idle", timer: 1, look: 0, spd: rnd(.8, 1.2), ph: rnd(0, 6), hc: 0,
      seed: rnd(0, 100), walk: 0, act: null, dep: rnd(.8, 1.1), lane: Math.random(), fxT: rnd(.8, 4), last: "", lastSh: "", z: -1,
      x: 0, y: 0, s: 1, hopNow: 0, rotNow: 0, wy: 0, px: 0, py: 0, ds: 1, dp: 1,
    };
    if (node.tagName === "IMG") {
      node.alt = ""; node.draggable = false; node.decoding = "async";
      node.onerror = () => removeMob(m);   // 圖壞掉就讓牠不上場，不留一個破圖
    }
    state.mobs.push(m);
    return m;
  }
  function removeMob(m) {
    m.el.remove(); m.sh.remove();
    state.mobs = state.mobs.filter(o => o !== m);
    if (m.snack) m.snack.eaters = m.snack.eaters.filter(o => o !== m);
  }
  function place(m) {
    const K = state.K;
    m.dir = Math.random() < .5 ? -1 : 1;
    if (K.move === "drive") { m.u = rnd(-.05, 1.05); m.v = laneV(m); m.mode = "drive"; }
    else if (K.move === "swim") { m.u = rnd(.08, .92); m.v = Math.random(); m.mode = "swim"; pickSwim(m); }
    else { m.u = rnd(.06, .94); m.v = Math.random(); m.tv = m.v; if (Math.random() < .5) walk(m); else idle(m); }
    m.sx = m.dir * m.face;
  }
  const laneV = m => { const [a, b] = state.K.lanes[m.dir > 0 ? 1 : 0]; return a + (b - a) * m.lane; };
  function pickSwim(m) { m.tu = rnd(.06, .94); m.tv = Math.random(); }
  function walk(m) { m.mode = "walk"; m.timer = rnd(2, 5.5); m.tv = Math.random(); if (Math.random() < .55) m.dir = -m.dir; }
  function idle(m) { m.mode = "idle"; m.timer = rnd(.8, 2.6); m.look = Math.random() < .35 ? m.timer * .5 : 0; }
  function resume(m) {
    m.snack = null;
    const mv = state.K.move;
    if (mv === "drive") m.mode = "drive";
    else if (mv === "swim") { m.mode = "swim"; pickSwim(m); }
    else if (Math.random() < .5) walk(m); else idle(m);
  }

  // 往目標點移動（u 是畫面寬的比例、v 是活動帶的比例），回傳還差幾 px
  function toward(m, tu, tv, sp, dt) {
    const span = (L.b1 - L.b0) || 1, dx = (tu - m.u) * L.W, dy = (tv - m.v) * span, d = Math.hypot(dx, dy);
    if (d < .5) return 0;
    const k = Math.min(1, sp * dt / d);
    m.u += dx * k / L.W; m.v += dy * k / span;
    if (Math.abs(dx) > 6) m.dir = dx > 0 ? 1 : -1;
    return d * (1 - k);
  }
  const gaitMul = m => state.K.move !== "hop" ? 1 : (m.hc % 1) < AIR ? 1 / AIR : 0;   // 跳著走：落地那一下不前進

  // 移動：回傳這一幀有沒有在走（決定要不要有走路的彈跳）
  function locomote(m, dt) {
    const K = state.K, v = K.speed * L.H * m.spd;   // px/秒
    switch (m.mode) {
      case "walk": {
        const g = gaitMul(m);
        m.u += m.dir * v * g * dt / L.W;
        m.v += (m.tv - m.v) * Math.min(1, dt * .5 * g);
        if (m.u < .05) { m.u = .05; m.dir = 1; } else if (m.u > .95) { m.u = .95; m.dir = -1; }
        if ((m.timer -= dt) <= 0) idle(m);
        return true;
      }
      case "idle":
        if (m.look > 0 && (m.look -= dt) <= 0) m.dir = -m.dir;   // 站著時偶爾轉頭張望
        if ((m.timer -= dt) <= 0) walk(m);
        return false;
      case "drive": {
        // 跟車：前面同方向、差不多車道有車就放慢，不要疊成一團
        let sp = v;
        const half = m.bw * depth(m) / 2;
        for (const c of state.mobs) {
          if (c === m || c.dir !== m.dir || c.mode === "off" || c.mode === "drop" || Math.abs(c.v - m.v) > .12) continue;
          const d = (c.u - m.u) * L.W * m.dir, need = half + c.bw * depth(c) / 2 + 18;
          if (d > 0 && d < need * 1.6) sp = Math.min(sp, v * clamp((d - need) / (need * .6), 0, 1));
        }
        m.u += m.dir * sp * dt / L.W;
        m.v += (laneV(m) - m.v) * Math.min(1, dt * 1.2);   // 掉頭、吃完油後慢慢切回自己方向的車道
        const out = m.bw * depth(m) / 2 / L.W + .03;
        if (m.u > 1 + out || m.u < -out) { m.mode = "off"; m.timer = rnd(.4, 2.2); }
        return true;
      }
      case "off":   // 開出畫面：等一下，掉頭從同一邊開回來（換到對向車道）
        if (state.arr) return false;
        if ((m.timer -= dt) <= 0) { m.dir = -m.dir; m.sx = m.dir * m.face; m.v = laneV(m); m.mode = "drive"; state.stats.uturns++; }
        return false;
      case "swim":
        if (toward(m, m.tu, m.tv, v, dt) < 10) { if (Math.random() < .35) { m.mode = "float"; m.timer = rnd(1, 2.5); } else pickSwim(m); }
        bubbles(m, dt);
        return true;
      case "float":
        bubbles(m, dt);
        if ((m.timer -= dt) <= 0) { m.mode = "swim"; pickSwim(m); }
        return false;
      case "seek": {   // 跑去吃點心：站到點心旁邊、面向點心
        const sn = m.snack;
        if (!sn || sn.done) { resume(m); return false; }
        const off = (m.bw * depth(m) * .45 + 14) / L.W;
        if (toward(m, sn.u + m.side * off, sn.v, v * 2.2 * gaitMul(m), dt) < 8) { m.dir = m.side > 0 ? -1 : 1; bite(sn, m); return false; }
        if (K.move === "swim") bubbles(m, dt);
        return true;
      }
      case "watch": {   // 新朋友從天上飛下來：大家停下來轉頭看牠
        const a = state.arr;
        if (a && a.m !== m) { const dx = a.m.x - m.x; if (Math.abs(dx) > 20) m.dir = dx > 0 ? 1 : -1; }
        return false;
      }
      default: return false;   // drop：飛下來的路線由 arriveStep 控制
    }
  }

  // 走路的樣子：每個主題不一樣
  function gait(m, dt, o, moving) {
    const K = state.K, bh = m.bh, t = state.t;
    m.walk += ((moving ? 1 : 0) - m.walk) * Math.min(1, dt * 8);
    switch (K.move) {
      case "walk":
        if (moving) m.ph += dt * Math.PI * K.step * m.spd * (m.mode === "seek" ? 1.8 : 1);
        o.hop += Math.abs(Math.sin(m.ph)) * K.bob * bh * m.walk;
        o.rot += Math.sin(m.ph) * K.tilt * m.walk;
        if (K.float) o.wy = -bh * (.06 + .05 * (Math.sin(t * 1.7 + m.seed) * .5 + .5));   // 小仙子：腳不著地，輕輕上下飄
        break;
      case "hop": {
        // 前進中、或這一跳還沒落地 → 繼續跳；停下來後在地上呼吸
        if (moving || m.hc % 1 > .001) {
          const n = m.hc + dt / HOP * (m.mode === "seek" ? 1.4 : 1);
          m.hc = !moving && Math.floor(n) > Math.floor(m.hc) ? 0 : n;
        }
        const c = m.hc % 1;
        if (m.hc > 0 && c < AIR) o.hop += Math.sin(Math.PI * c / AIR) * bh * .26;
        else if (m.hc > 0) { const s = Math.sin(Math.PI * (c - AIR) / (1 - AIR)); o.qx *= 1 + .16 * s; o.qy *= 1 - .18 * s; }   // 落地壓扁再彈起
        else o.qy *= 1 + Math.sin(t * 3 + m.seed) * .025;
        break;
      }
      case "drive":
        o.hop += Math.abs(Math.sin(t * 36 + m.seed)) * bh * .012;   // 車身微震
        o.rot += Math.sin(t * 23 + m.seed) * .7;
        if (moving && m.mode === "drive" && (m.fxT -= dt) <= 0) { m.fxT = rnd(.9, 1.8); puff(m); }
        break;
      case "swim": {
        const w = t * 1.5 + m.seed;
        o.wy = Math.sin(w) * L.H * .028;   // 上下波浪
        o.rot += Math.cos(w) * 7 * m.dir;   // 頭跟著波浪一點一點
        o.qx *= 1 + Math.sin(t * 6 + m.seed) * .03;   // 尾巴擺動
        break;
      }
    }
  }

  // 疊在移動上的動作：被點的跳躍、開心小跳、落地彈跳、出場彈出；回傳 true = 這段期間不移動
  function actStep(m, dt, o) {
    const a = m.act;
    a.t += dt;
    if (a.t < 0) { if (a.k === "pop") o.scale = 0; return a.k === "pop"; }   // 還在排隊（大家錯開一點出場）
    const p = Math.min(1, a.t / a.d), bh = m.bh;
    if (a.k === "jump") {
      o.hop += Math.sin(Math.PI * p) * bh * .62;
      o.rot += 360 * easeInOut(p) * m.dir;
      if (p > .88) { o.qx *= 1.1; o.qy *= .88; }
    } else if (a.k === "happy") o.hop += Math.abs(Math.sin(2 * Math.PI * p)) * bh * .16;
    else if (a.k === "land") {   // 從天上落地：彈兩下，一高一低
      const q = p < .58 ? p / .58 : (p - .58) / .42;
      o.hop += Math.sin(Math.PI * q) * bh * (p < .58 ? .34 : .13);
      if (q < .12) { o.qx *= 1.14; o.qy *= .84; }
      if (p >= .58 && !a.b2) { a.b2 = true; note(14); }
    } else if (a.k === "pop") o.scale = backOut(p);
    if (p >= 1) m.act = null;
    return a.k !== "happy";
  }

  function step(m, dt) {
    const o = { hop: 0, rot: 0, qx: 1, qy: 1, wy: 0, scale: 1 };
    const busy = m.act ? actStep(m, dt, o) : false;
    gait(m, dt, o, busy ? false : locomote(m, dt));
    // 換方向：圖片左右翻轉，用 0.2 秒翻過去（像轉身）
    m.sx += clamp(m.dir * m.face - m.sx, -dt * 10, dt * 10);
    if (m.newT > 0 && (m.newT -= dt) <= 0) m.el.classList.remove("w-new");
    return o;
  }

  function draw(m, o) {
    const span = L.b1 - L.b0, gx = m.u * L.W, gy = L.b0 + m.v * span;
    let s = depth(m) * o.scale, x = gx, y = gy;
    if (m.mode === "drop") { x = m.px; y = m.py; s *= m.ds; }
    const yg = y;
    y += o.wy;
    m.x = x; m.y = y; m.s = s; m.hopNow = o.hop; m.rotNow = o.rot; m.wy = o.wy;
    const bw = m.bw, bh = m.bh, sx = Math.abs(m.sx) < .06 ? (m.sx < 0 ? -.06 : .06) : m.sx;
    // 腳底當原點：位移 → 依遠近縮放 → 往上跳 → 繞身體中心轉 → 左右翻轉／壓扁
    let tr = `translate3d(${r1(x - bw / 2)}px,${r1(y - bh)}px,0) scale(${r3(s)})`;
    if (o.hop) tr += ` translateY(${r1(-o.hop)}px)`;
    if (o.rot) tr += ` translateY(${r1(-bh / 2)}px) rotate(${r1(o.rot)}deg) translateY(${r1(bh / 2)}px)`;
    tr += ` scale(${r3(sx * o.qx)},${r3(o.qy)})`;
    if (tr !== m.last) { m.el.style.transform = tr; m.last = tr; }
    const z = m.mode === "drop" ? 9000 : Math.round(yg) + 10 + (m.act?.k === "jump" ? 3000 : 0);   // 越前面的疊在上層；被點的那隻跳的時候浮到最上面
    if (z !== m.z) { m.z = z; m.el.style.zIndex = z; }
    if (state.K.move === "swim") return;
    // 影子貼在地上：跳越高越小；飛下來時影子先出現在落點、越飛越近越大
    const dropping = m.mode === "drop", k = (dropping ? depth(m) * m.dp : s) * Math.max(.3, 1 - (o.hop - o.wy) / (bh * 1.3));
    const sw = bw * .78, shh = bw * .2;
    const ts = `translate3d(${r1((dropping ? gx : x) - sw / 2)}px,${r1((dropping ? gy : yg) - shh / 2)}px,0) scale(${r3(k)})`;
    if (ts !== m.lastSh) { m.sh.style.transform = ts; m.lastSh = ts; }
  }

  // ── 剛畫完的角色：從天上帶著星星尾巴飛下來、落地彈兩下，大家轉頭看、開心跳，然後才一起逛 ──
  function startArrive(m) {
    const K = state.K, side = Math.random() < .5 ? -1 : 1;
    m.u = .5 + rnd(-.1, .1);
    m.dir = side;
    m.v = K.move === "drive" ? laneV(m) : K.move === "swim" ? .45 : .5;
    m.sx = side * m.face; m.mode = "drop"; m.act = null; m.ds = .6; m.dp = 0;
    m.px = m.u * L.W - side * L.W * .45; m.py = -L.H * .2;
    state.arr = { m, t: 0, d: 1.6, side, landed: false, n: 0 };
    for (const o of state.mobs) if (o !== m && o.mode !== "off") { o.mode = "watch"; o.act = null; }
    state.phase = "arrive";
    A.sfx?.("magic");
  }
  function arriveStep(dt) {
    const a = state.arr, m = a.m;
    a.t += dt;
    if (!a.landed) {
      const p = Math.min(1, a.t / a.d), e = easeInOut(p), q = 1 - e;
      const tx = m.u * L.W, ty = L.b0 + m.v * (L.b1 - L.b0);
      // 二次貝茲：從畫面外上方劃一道弧線，稍微衝過頭再繞回落點，像流星
      const x0 = tx - a.side * L.W * .45, y0 = -L.H * .2, x1 = tx + a.side * L.W * .16, y1 = ty - L.H * .4;
      m.px = q * q * x0 + 2 * q * e * x1 + e * e * tx;
      m.py = q * q * y0 + 2 * q * e * y1 + e * e * ty;
      m.ds = .6 + .4 * e; m.dp = e;
      const vx = q * (x1 - x0) + e * (tx - x1);
      if (Math.abs(vx) > 1) m.dir = vx > 0 ? 1 : -1;
      // 星星尾巴：每幀灑彩虹亮點，每 0.12 秒再爆一小圈金星星，飛過的路上留一串
      const cx = L.x + m.px, cy = L.y + m.py - m.bh * depth(m) * m.ds * .5;
      fx.trail(cx, cy, { brush: "magic", color: "#ffd54f" }, a.n++ === 0);
      if ((a.st = (a.st || 0) - dt) <= 0) { a.st = .12; fx.stars(cx, cy, 34); }
      state.stats.trails++;
      if (p >= 1) {
        a.landed = true; a.t = 0;
        m.mode = "watch"; m.act = { k: "land", t: 0, d: .9 };
        m.el.classList.add("w-new"); m.newT = 6;   // 新來的發光幾秒，小孩一眼找到自己剛畫的那隻
        fx.stars(L.x + tx, L.y + ty - m.bh * depth(m) * .5, m.bw * depth(m));
        A.chime?.(.5);
        note(10);
        for (const o of state.mobs) if (o !== m && o.mode === "watch") { o.act = { k: "happy", t: -rnd(.05, .3), d: .7 }; state.stats.happy++; }
      }
    } else if (a.t > 1.3) {
      state.arr = null; state.phase = "roam";
      for (const o of state.mobs) if (o.mode === "watch") resume(o);
      maybeHint();
    }
  }

  // ── 點心：點空地冒出來，最近的兩隻跑過去吃 ──
  function spawnSnack(x, y) {
    const K = state.K, span = (L.b1 - L.b0) || 1;
    while (state.snacks.length >= MAX_SNACKS) finish(state.snacks[0], false);   // 連點：最舊的先消失
    const sn = { u: clamp(x / L.W, .06, .94), v: clamp((y - L.b0) / span, .04, .96), y0: y, t: 0, bites: 0, need: 1, done: false, last: "", x, y, eaters: [] };
    sn.el = el("div", "w-snack", K.snack);
    field.append(sn.el);
    const ty = L.b0 + sn.v * span;
    const near = state.mobs.filter(m => m.mode !== "drop" && m.mode !== "off" && m.act?.k !== "pop")
      .sort((a, b) => Math.hypot(a.x - x, a.y - ty) - Math.hypot(b.x - x, b.y - ty)).slice(0, 2);
    let first = 0;
    for (const m of near) {
      if (m.snack && m.snack !== sn) m.snack.eaters = m.snack.eaters.filter(e => e !== m);
      let side = m.x < x ? -1 : 1;   // 從自己那一側靠過去；兩隻同一側時第二隻繞到另一邊
      if (first && side === first) side = -side;
      first = first || side;
      m.snack = sn; m.side = side; m.mode = "seek";
    }
    sn.eaters = near; sn.need = Math.max(1, near.length);
    state.snacks.push(sn); state.stats.snacks++;
    A.sfx?.("pop");
    return sn;
  }
  function snackStep(sn, dt) {
    sn.t += dt;
    const x = sn.u * L.W, ty = L.b0 + sn.v * (L.b1 - L.b0);
    const p = Math.min(1, sn.t / .35), y = sn.y0 < ty ? sn.y0 + (ty - sn.y0) * p * p : ty;   // 點在天上：點心掉到地上
    sn.x = x; sn.y = y;
    const tr = `translate3d(${r1(x)}px,${r1(y)}px,0)`;
    if (tr !== sn.last) { sn.el.style.transform = tr; sn.last = tr; sn.el.style.zIndex = Math.round(ty) + 9; }
    if (sn.t > 14) finish(sn, false);   // 都沒人來吃：自己消失
  }
  function bite(sn, m) {
    const mv = state.K.move;
    m.snack = null;
    m.act = { k: "happy", t: 0, d: .7 };
    if (mv === "drive") m.mode = "drive";
    else if (mv === "swim") { m.mode = "float"; m.timer = rnd(.8, 1.6); }
    else { m.mode = "idle"; m.timer = rnd(.8, 1.6); m.look = 0; }
    sn.bites++;
    hearts(sn.x, sn.y);
    note(9 + sn.bites * 3);
    if (sn.bites >= sn.need || !sn.eaters.some(e => e.snack === sn)) finish(sn, true);
    else sn.el.classList.add("w-bit");   // 被咬一口：變小
  }
  function finish(sn, eaten) {
    if (sn.done) return;
    sn.done = true;
    state.snacks = state.snacks.filter(s => s !== sn);
    for (const e of sn.eaters) if (e.snack === sn) resume(e);
    if (eaten) state.stats.eaten++;
    sn.el.classList.add("w-gone");
    setTimeout(() => sn.el.remove(), 450);
  }

  // ── 小特效（DOM，動畫結束自己移除）──
  function fxEl(n, ms) {
    if (state.fxn >= MAX_FX) return false;
    state.fxn++;
    field.append(n);
    const done = () => { if (n.isConnected) { n.remove(); state.fxn--; } };
    n.addEventListener("animationend", done);
    setTimeout(done, ms);
    return true;
  }
  function hearts(x, y) {
    for (let i = 0; i < 5; i++) {
      const h = el("i", "w-heart", i % 2 ? "💖" : "💗");
      h.style.cssText = `left:${r1(x + rnd(-24, 24))}px;top:${r1(y - 40)}px;--dx:${r1(rnd(-60, 60))}px;animation-delay:${i * 70}ms`;
      if (fxEl(h, 1600)) state.stats.hearts++;
    }
    fx.stars(L.x + x, L.y + y - 30, 70);
  }
  function bubbles(m, dt) {
    if ((m.fxT -= dt) > 0) return;
    m.fxT = rnd(2.2, 5.5);
    const n = 1 + (Math.random() * 3 | 0), x = m.x + m.dir * m.bw * m.s * .42, y = m.y - m.bh * m.s * .6;
    for (let i = 0; i < n; i++) {
      const b = el("i", "w-bub"), r = r1(rnd(8, 18));
      b.style.cssText = `left:${r1(x + rnd(-8, 8))}px;top:${r1(y)}px;width:${r}px;height:${r}px;animation-delay:${i * .28}s`;
      if (fxEl(b, 3600)) state.stats.bubbles++;
    }
  }
  function puff(m) {
    if (m.u < -.02 || m.u > 1.02) return;
    const p = el("i", "w-puff"), r = r1(m.bh * m.s * .22);
    p.style.cssText = `left:${r1(m.x - m.dir * m.bw * m.s * .5 - r / 2)}px;top:${r1(m.y - m.bh * m.s * .2 - r / 2)}px;width:${r}px;height:${r}px;--dx:${-m.dir * 30}px`;
    if (fxEl(p, 1400)) state.stats.puffs++;
  }
  // 小仙子主題：偶爾有一隻身上冒出亮晶晶
  function ambient(dt) {
    if (!state.K.float || !state.mobs.length || (state.spT -= dt) > 0) return;
    state.spT = rnd(.6, 1.4);
    const m = state.mobs[Math.random() * state.mobs.length | 0];
    if (m.mode === "drop") return;
    fx.trail(L.x + m.x + rnd(-.4, .4) * m.bw * m.s, L.y + m.y - m.bh * m.s * rnd(.2, .9), { brush: "sparkle", color: "#ff9ed8" }, true);
    state.stats.sparkles++;
  }

  // ── 前兩次進來：一隻手指在中間那隻角色上點，教小孩「點牠」──
  function maybeHint() {
    const st = readLS();
    if (st.hint >= 2 || !state.mobs.length || state.hint) return;
    st.hint++;
    writeLS(st);
    const m = state.mobs.reduce((a, b) => Math.abs(b.u - .5) < Math.abs(a.u - .5) ? b : a);
    const h = el("div", "w-hint", "<i></i><b>👆</b>");
    field.append(h);
    state.hint = { el: h, m, t: 0 };
  }
  function hintStep(dt) {
    const h = state.hint;
    if (!h) return;
    if ((h.t += dt) > 7 || !h.m.el.isConnected) return hideHint();
    h.el.style.transform = `translate3d(${r1(h.m.x)}px,${r1(h.m.y - h.m.bh * h.m.s * .5)}px,0)`;
  }
  function hideHint() { if (state.hint) { state.hint.el.remove(); state.hint = null; } }

  // ── 點畫面：點到角色 → 跳；點到空地 → 冒點心 ──
  function hit(x, y) {
    let best = null;
    for (const m of state.mobs) {
      if (m.mode === "drop" || m.mode === "off") continue;
      const w = m.bw * m.s, h = m.bh * m.s, pad = 14, top = m.y - h - m.hopNow * m.s;
      if (x > m.x - w / 2 - pad && x < m.x + w / 2 + pad && y > top - pad && y < m.y + pad && (!best || m.z > best.z)) best = m;
    }
    return best;
  }
  function jump(m) {
    if (m.act?.k === "jump") return;   // 還在空中：連點不疊加
    m.act = { k: "jump", t: 0, d: .8 };
    state.stats.jumps++;
    note(NOTES[Math.random() * NOTES.length | 0]);
    fx.stars(L.x + m.x, L.y + m.y - m.bh * m.s * .5, m.bw * m.s);
  }
  function tapAt(x, y) {
    if (!state.open || state.phase !== "roam" || !state.mobs.length) return null;   // 飛下來的動畫中先不理
    hideHint();
    const lx = x - L.x, ly = y - L.y, m = hit(lx, ly);
    if (m) { jump(m); return { mob: m.id }; }
    spawnSnack(lx, ly);
    return { snack: true };
  }
  sec.addEventListener("pointerdown", e => {
    if (!e.isPrimary || e.target.closest?.("button")) return;   // 只認第一根手指（手掌不理）；按鈕交給全域機制
    tapAt(e.clientX, e.clientY);
  });
  addEventListener("resize", () => { if (state.open) measure(); });

  // ── 動畫迴圈：只在畫面開著時跑 ──
  function frame(now) {
    state.raf = 0;
    if (!sec.classList.contains("on")) { close(); return; }   // 主程式直接切走畫面 → 停掉、釋放
    const dt = Math.max(0, Math.min(50, now - last)) / 1000 * state.speed;   // 切回來時 dt 很大或是負的：夾在 0～50ms
    last = now;
    state.frames++; state.t += dt;
    if (state.arr) arriveStep(dt);
    for (const m of state.mobs) draw(m, step(m, dt));
    for (const sn of state.snacks.slice()) snackStep(sn, dt);
    ambient(dt);
    hintStep(dt);
    state.raf = requestAnimationFrame(frame);
  }
  function startLoop() { if (!state.raf) { last = performance.now(); state.raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (state.raf) cancelAnimationFrame(state.raf); state.raf = 0; }

  // ── 背景、貼紙、分頁徽章 ──
  function setBg(theme, seq) {
    bgImg.style.backgroundImage = ""; bgImg.classList.remove("on"); state.bg = "grad";
    const src = deps.bgUrl?.(theme) || `IMAGE/draw/world/${theme}.jpg?v=${V}`;
    const im = new Image();
    im.onload = () => {
      if (seq !== openSeq) return;
      bgSize = [im.naturalWidth || BG[0], im.naturalHeight || BG[1]];
      bgImg.style.backgroundImage = `url("${src}")`; bgImg.classList.add("on"); state.bg = "img";
      measure();   // 原圖比例可能不同 → 地面位置重算
    };
    im.onerror = () => { if (seq === openSeq) state.bg = "grad"; };   // 沒圖：留著 CSS 漸層背景
    im.src = src;
  }
  async function setStickers(theme, seq) {
    deco.textContent = "";
    let list = [];
    try { list = (await deps.getStickers?.(theme)) || []; } catch { }
    if (seq !== openSeq) return;
    list.slice(0, MAX_STICKERS).forEach(src => {
      const im = new Image();
      im.className = "w-stk"; im.alt = ""; im.draggable = false; im.src = src;
      deco.append(im);
    });
    placeStickers();
  }
  function placeStickers() {
    const hz = fy(state.K.horizon + .03);
    deco.querySelectorAll(".w-stk").forEach((im, i) => {
      const [x, c] = SLOTS[i], h = L.H * (c ? .12 : .085);
      im.style.cssText = `left:${r1(x * L.W - h / 2)}px;top:${r1((c ? L.H * .985 : hz) - h)}px;width:${r1(h)}px;height:${r1(h)}px;animation-delay:${-i * .7}s`;
    });
  }
  function badge(id, n) {
    state.counts[id] = n;
    const b = tabs.querySelector(`[data-theme="${id}"]`);
    if (!b) return;
    b.querySelector(".w-n").textContent = n > 99 ? "99+" : n;
    b.classList.toggle("w-zero", !n);
  }
  // 其他主題住了幾隻：主程式有 countEntries 就用（便宜），沒有就拿 getEntries 的長度；一個一個來，不跟開場動畫搶
  async function refreshCounts(seq) {
    for (const t of deps.themes || []) {
      if (t.id === state.theme) continue;
      let n = 0;
      try { n = deps.countEntries ? await deps.countEntries(t.id) : ((await deps.getEntries(t.id)) || []).length; } catch { }
      if (seq !== openSeq) return;
      badge(t.id, n | 0);
    }
  }

  // ── 開、關 ──
  function teardown() {
    stopLoop();
    hideHint();
    field.textContent = "";   // 角色、影子、點心、泡泡、愛心一起清
    state.mobs = []; state.snacks = []; state.arr = null; state.fxn = 0;
    for (const u of state.urls) URL.revokeObjectURL(u);
    state.urls.clear();
    sec.classList.remove("w-isempty");
  }
  function close() {
    openSeq++;   // 還在等 getEntries 的 open 回來後會放棄
    teardown();
    state.open = false; state.phase = "closed";
  }
  async function open(theme, { arrive } = {}) {
    const seq = ++openSeq;
    teardown();
    state.theme = theme; state.K = SCENES[theme] || SCENES.animal; state.open = true; state.phase = "loading";
    sec.dataset.theme = theme; sec.dataset.move = state.K.move;
    deps.show?.("world");
    for (const b of tabs.children) b.classList.toggle("on", b.dataset.theme === theme);
    setBg(theme, seq);
    setStickers(theme, seq);
    measure();
    let list = [];
    try { list = (await deps.getEntries?.(theme)) || []; } catch (e) { console.warn("world: getEntries 失敗", e); }
    if (seq !== openSeq) return;   // 等的時候換了主題或關掉了
    badge(theme, list.length);
    setTimeout(() => refreshCounts(seq), 500);
    // 角色太多時隨機挑 24 隻上場（剛畫完的那隻一定在），每次打開換一批
    let pick = shuffle(list.filter(e => e && e.blob));
    const hero = arrive != null ? pick.find(e => e.id === arrive) : null;
    if (hero) pick = [hero, ...pick.filter(e => e !== hero)];
    for (const e of pick.slice(0, MAX_MOBS)) addMob(e);
    if (!state.mobs.length) { sec.classList.add("w-isempty"); state.phase = "empty"; return; }   // 空世界：吉祥物揮手，不跑動畫迴圈
    measure();   // 角色多寡會影響大小
    for (const m of state.mobs) place(m);
    // 車子：同方向的平均排開，一開場不會疊在一起
    if (state.K.move === "drive") for (const d of [-1, 1]) {
      const g = state.mobs.filter(m => m.dir === d);
      g.forEach((m, k) => { m.u = -.05 + 1.1 * (k + rnd(.25, .75)) / g.length; });
    }
    const h = hero && state.mobs.find(m => m.id === hero.id);
    if (h) startArrive(h);
    else { state.phase = "roam"; state.mobs.forEach((m, i) => { m.act = { k: "pop", t: -.08 - i * .045, d: .5 }; }); }
    for (const m of state.mobs) draw(m, step(m, 0));   // 先擺好位置（還沒輪到的都是縮成 0），等圖解碼時不會在左上角閃一下
    await Promise.race([Promise.all(state.mobs.map(m => m.img.decode ? m.img.decode().catch(() => { }) : 0)), new Promise(r => setTimeout(r, 900))]);
    if (seq !== openSeq) return;
    if (!h) maybeHint();
    startLoop();
  }

  window.__world = {
    state, tapAt,
    hitAt: (x, y) => hit(x - L.x, y - L.y)?.id ?? null,
    entries: () => state.mobs.map(m => ({
      id: m.id, x: m.x, y: m.y, w: m.bw * m.s, h: m.bh * m.s, s: m.s, u: m.u, v: m.v, dir: m.dir, sx: m.sx, face: m.face,
      mode: m.mode, act: m.act?.k || null, hop: m.hopNow, rot: m.rotNow, wy: m.wy, z: m.z, tag: m.img.tagName,
    })),
  };
  return { open, close, el: sec };
}
