// 變色龍躲貓貓：吉祥物變色龍躲在一張畫裡（小孩自己的作品或世界場景），身體染成底下的顏色，小孩要把牠找出來。
// 找：一局 3 回合，越後面越小、偽裝越像；找太久會自己給提示（眨眼抖一下 → 冒閃光 → 自己跳出來），3 歲也不會卡住。
// 藏：給兄弟姊妹玩，一個人把牠拖去藏好、換人找。
// 獨立模組：不 import 任何既有檔（版號會變），聲音、粒子、切畫面都從 deps 傳進來。
// 座標：變色龍的中心用「圖的比例」（u、v：0～1）存、大小用「佔圖高的比例」存，視窗大小改變時乘上新的畫框大小就好。

const SIZES = [0.18, 0.13, 0.09];   // 每回合變色龍的高度（佔圖高）：越後面越小
const TINTS = [0.55, 0.7, 0.82];    // 每回合偽裝的強度：越後面越像底下的顏色
const HIDE_SIZE = 0.15, HIDE_TINT = 0.75;   // 藏模式：大小、強度取中間（找的人可能是 3 歲弟妹）
const INTRO_SIZE = 0.34;            // 第一次示範：先在中間大大的出現
const EDGE = 0.08;                  // 避開圖的邊緣 8%
const HIT = 1.2;                    // 點擊範圍比牠大 20%（小手指常常點在旁邊）
const HINTS = [8, 15, 25];          // 幾秒沒找到給提示：眨眼抖一下、冒閃光、自己跳出來
const SEEN = "draw-seek-seen";
const MAX_SRC = 1600, SAMPLE = 320; // 圖的內部副本最長邊；取平均色用的小圖最長邊（算得快）
// 吉祥物圖（600×600）上兩隻眼睛的位置（橢圓 cx, cy, rx, ry）：偽裝時這裡保留原色，小孩才有線索
const EYES = [[254, 150, 46, 42], [402, 175, 33, 44]];
const SKIN = [122, 192, 48];        // 眼睛旁邊皮膚的綠：眨眼的眼皮用這個色（偽裝時跟著染）
const PAL = ["#ff6b5b", "#ffc93c", "#4fcf9b", "#4fb3ff", "#a77bff", "#ff7eb6"];

// 固定種子的亂數：同一回合的斑點紋路每次重畫都一樣（拖曳、轉向時不會閃）
const seeded = a => () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const shade = (c, k) => c.map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));   // k>0 變淺、k<0 變深
const ease = p => p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function mountSeek(deps) {
  const A = deps.A || {}, V = deps.v || "0";
  const S = { open: false, mode: "find", game: "find", phase: "idle", round: 0, found: 0, t: 0, hint: 0, spark: 0, speed: 1,
    u: 0.5, v: 0.5, size: SIZES[0], k: 0, camo: [255, 255, 255], seed: 1, scene: null, misses: 0, moved: false };

  // ── 畫面 ──
  const root = document.createElement("section");
  root.id = "seek"; root.className = "screen";
  const mascotSrc = deps.mascot || `IMAGE/draw/ui/mascot.png?v=${V}`;
  root.innerHTML = `
    <div class="sk-wall">
      <div class="sk-frame">
        <canvas class="sk-pic"></canvas>
        <div class="sk-cham off"><div class="sk-move"><div class="sk-body"><canvas></canvas><i class="sk-lid l"></i><i class="sk-lid r"></i></div></div>
          <i class="sk-spark"></i><i class="sk-spark"></i><i class="sk-spark"></i><span class="sk-say"></span></div>
      </div>
    </div>
    <div class="loading"><i></i><i></i><i></i></div>
    <button id="skHome" class="big" aria-label="回首頁">🏠</button>
    <div class="sk-right">
      <button id="skHide" data-sfx="pick" aria-label="找／藏"><span class="sk-f">🔍</span><span class="sk-h">🙈</span></button>
      <div id="skStars" class="sk-stars"><b>★</b><b>★</b><b>★</b></div>
      <button id="skOk" class="big" aria-label="藏好了">✔️</button>
    </div>
    <button id="skPass" class="sk-pass" data-sfx="none" aria-label="換人找">
      <span class="sk-swap"><b class="sk-hand a">🤲</b><b class="sk-hand b">🤲</b><img class="sk-pm" src="${mascotSrc}" alt="" draggable="false"></span>
      <span class="sk-go">👆</span>
    </button>
    <div class="sk-end">
      <div class="sk-cheer"><img src="${mascotSrc}" alt="" draggable="false"><p><span>★</span><span>★</span><span>★</span></p></div>
      <div class="sk-btns">
        <button id="skAgain" class="big" aria-label="再玩一局"><img class="ico" src="IMAGE/draw/ui/mode-seek.png?v=${V}" alt="" draggable="false"></button>
        <button id="skHome2" class="big" aria-label="回首頁">🏠</button>
      </div>
    </div>`;
  document.body.append(root);
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "css/draw-seek.css?v=" + V;
  css.onload = () => layout();   // CSS 晚到時，上方按鈕高度第一次量的不準 → 到了再排一次
  document.head.append(css);

  const q = s => root.querySelector(s);
  const wall = q(".sk-wall"), frame = q(".sk-frame"), picC = q(".sk-pic"), cham = q(".sk-cham"), say = q(".sk-say"),
    camC = q(".sk-body canvas"), loadEl = q(".loading"), bHome = q("#skHome"), right = q(".sk-right"), starEls = [...q("#skStars").children];
  const camX = camC.getContext("2d");
  const parts = deps.Particles ? new deps.Particles(root) : { trail() {}, splash() {}, stars() {}, fit() {} };
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  // 吉祥物圖：載好才能畫偽裝；壞掉也不擋（變色龍就是看不到，不會當掉）
  const mImg = new Image();
  const mReady = new Promise(ok => { mImg.onload = ok; mImg.onerror = ok; });
  mImg.src = mascotSrc;

  let pic = null, L = null, drag = null, tw = 0, loop = 0, last = 0, tokR = 0, tokO = 0, seenMem = false, rz = 0, picKey = "";
  const cache = new Map(), masks = new Map(), timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

  // localStorage 可能被關掉或存了壞資料：只有 "1" 算看過，其他都當沒看過（之後寫回好的值）
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 存不了就算了 */ } };
  const seen = () => seenMem || lsGet(SEEN) === "1";
  const markSeen = () => { seenMem = true; lsSet(SEEN, "1"); };

  // ── 圖：複製一份（呼叫的人之後回收 blob 網址也不影響），再縮一張小的拿來算平均色 ──
  async function prep(src) {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error("空的圖");
    const k = Math.min(1, MAX_SRC / Math.max(w, h)), c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);   // 透明的地方墊白（小孩的畫通常是白底）
    x.drawImage(img, 0, 0, c.width, c.height);
    const ks = SAMPLE / Math.max(c.width, c.height), sc = document.createElement("canvas");
    sc.width = Math.max(1, Math.round(c.width * ks)); sc.height = Math.max(1, Math.round(c.height * ks));
    const sx = sc.getContext("2d", { willReadFrequently: true });
    sx.drawImage(c, 0, 0, sc.width, sc.height);
    return { src, c, w: c.width, h: c.height, sample: sx.getImageData(0, 0, sc.width, sc.height) };
  }
  const load = sc => { if (!cache.has(sc.src)) cache.set(sc.src, prep(sc.src).catch(() => null)); return cache.get(sc.src); };

  // 吉祥物的形狀（n×n 的透明度）：平均色只算牠身體真的蓋到的像素，不算方框四角的空白
  function mask(n) {
    if (masks.has(n)) return masks.get(n);
    const c = document.createElement("canvas"); c.width = c.height = n;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(mImg, 0, 0, n, n);
    const d = x.getImageData(0, 0, n, n).data, m = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) m[i] = d[i * 4 + 3];
    if (masks.size > 40) masks.clear();
    masks.set(n, m);
    return m;
  }
  // 變色龍底下的平均顏色（u, v 中心、size 佔圖高）
  function under(u, v, size) {
    const sp = pic && pic.sample;
    if (!sp || !mImg.naturalWidth) return [255, 255, 255];
    const { width: sw, height: sh, data } = sp, n = Math.max(4, Math.round(size * sh)), m = mask(n);
    const x0 = Math.round(u * sw - n / 2), y0 = Math.round(v * sh - n / 2);
    let r = 0, g = 0, b = 0, w = 0;
    for (let j = 0; j < n; j++) {
      const y = y0 + j;
      if (y < 0 || y >= sh) continue;
      for (let i = 0; i < n; i++) {
        const x = x0 + i, a = m[j * n + i];
        if (x < 0 || x >= sw || !a) continue;
        const k = (y * sw + x) * 4;
        r += data[k] * a; g += data[k + 1] * a; b += data[k + 2] * a; w += a;
      }
    }
    return w ? [r / w, g / w, b / w].map(Math.round) : [255, 255, 255];
  }

  // ── 畫變色龍：先畫吉祥物，再疊一層底下的顏色（source-atop 只蓋在牠身上）＋同色系斑點，最後眼睛補回原色 ──
  const box = () => (L ? S.size * L.h : 0);
  function paint(k = S.k, col = S.camo) {
    S.k = k; S.camo = col;
    const px = Math.max(8, Math.round(box() * dpr()));
    if (camC.width !== px) { camC.width = camC.height = px; }
    const x = camX;
    x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
    x.clearRect(0, 0, px, px);
    if (!mImg.naturalWidth) return;
    x.imageSmoothingQuality = "high";
    x.drawImage(mImg, 0, 0, px, px);
    const c = col.map(Math.round);
    if (k > 0.001) {
      x.globalCompositeOperation = "source-atop";
      x.globalAlpha = k; x.fillStyle = `rgb(${c})`; x.fillRect(0, 0, px, px);
      // 一點一點深淺不同的斑點：像底下的紋路，不是一整片死板的色塊
      const rnd = seeded(S.seed);
      x.globalAlpha = k * 0.45;
      for (let i = 0; i < 150; i++) {
        const a = (0.08 + rnd() * 0.16) * (rnd() < 0.5 ? 1 : -1);
        x.fillStyle = `rgb(${shade(c, a)})`;
        x.beginPath(); x.arc(rnd() * px, rnd() * px, (0.008 + rnd() * 0.03) * px, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      // 眼睛保留原色：偽裝再像，眼睛還是會露餡 → 小孩有線索可以找
      const s = px / 600;
      x.save(); x.beginPath();
      for (const [ex, ey, rx, ry] of EYES) { x.moveTo((ex + rx) * s, ey * s); x.ellipse(ex * s, ey * s, rx * s, ry * s, 0, 0, Math.PI * 2); }
      x.clip();
      x.drawImage(mImg, 0, 0, px, px);
      x.restore();
    }
    cham.style.setProperty("--lid", `rgb(${mix(SKIN, c, k)})`);
  }
  function placeCham() {
    if (!L) return;
    const bs = box();
    Object.assign(cham.style, { left: S.u * L.w - bs / 2 + "px", top: S.v * L.h - bs / 2 + "px", width: bs + "px", height: bs + "px" });
  }

  // ── 排版：圖放在上方按鈕下面那一大塊的正中間（contain） ──
  function layout() {
    if (!S.open) return;
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    parts.fit();
    if (!pic) return;
    const rr = root.getBoundingClientRect(), hb = bHome.getBoundingClientRect(), rb = right.getBoundingClientRect();
    const top = hb.height ? Math.max(hb.bottom, rb.bottom) - rr.top + 26 : 120, side = 34, bottom = 30;
    const aw = Math.max(100, W - 2 * side), ah = Math.max(100, H - top - bottom), ar = pic.w / pic.h;
    let w = aw, h = w / ar;
    if (h > ah) { h = ah; w = h * ar; }
    L = { x: (W - w) / 2, y: top + (ah - h) / 2, w, h };
    Object.assign(frame.style, { left: L.x + "px", top: L.y + "px", width: w + "px", height: h + "px" });
    const pw = Math.round(w * dpr()), ph = Math.round(h * dpr()), key = pic.src + pw + "x" + ph;
    if (key !== picKey) {   // 大小沒變就不用重畫整張圖
      picKey = key; picC.width = pw; picC.height = ph;
      const x = picC.getContext("2d");
      x.imageSmoothingQuality = "high";
      x.drawImage(pic.c, 0, 0, pw, ph);
    }
    placeCham(); paint();
  }
  function setPic(p) {
    pic = p; picKey = "";
    layout();
    frame.classList.remove("in"); void frame.offsetWidth; frame.classList.add("in");   // 每回合換圖：畫框彈一下
  }
  const center = () => { const rr = root.getBoundingClientRect(); return [rr.left + L.x + S.u * L.w, rr.top + L.y + S.v * L.h]; };

  // ── 流程 ──
  function setStars(n) { starEls.forEach((b, i) => { const on = i < n; if (on && !b.classList.contains("lit")) b.classList.add("lit"); if (!on) b.classList.remove("lit"); }); }
  function setCham(...cls) { cham.className = "sk-cham " + cls.join(" "); }
  function endDrag() { if (!drag) return; drag = null; cham.classList.remove("held"); }
  function reset() {
    tokR++; clearTimers(); cancelAnimationFrame(tw); tw = 0; endDrag();
    root.classList.remove("ended", "passing", "placing");
    q("#skOk").classList.remove("ready");
    setCham("off"); say.textContent = "";
    root.querySelectorAll(".sk-confetti, .sk-ripple").forEach(el => el.remove());
  }
  function tween(ms, step, done) {
    cancelAnimationFrame(tw);
    const t0 = performance.now();
    const f = now => {
      const p = Math.min(1, (now - t0) / ms);
      step(p);
      if (p < 1) tw = requestAnimationFrame(f); else { tw = 0; done && done(); }
    };
    tw = requestAnimationFrame(f);
  }
  // 這一局要用哪幾張圖（打亂；圖不夠 3 張就重複用）
  const pickOrder = n => { const ids = shuffle(S.list.map((_, i) => i)); return Array.from({ length: n }, (_, i) => ids[i % ids.length]); };
  // 載入第 i 張；壞掉的圖換一張沒用到的，全部都壞才放棄
  async function sceneFor(i) {
    const tried = new Set();
    let idx = S.order[i];
    while (idx != null && !tried.has(idx)) {
      tried.add(idx);
      const p = await load(S.list[idx]);
      if (p) { S.order[i] = idx; return p; }
      idx = S.list.findIndex((_, j) => !tried.has(j) && !S.order.includes(j));
      if (idx < 0) idx = S.list.findIndex((_, j) => !tried.has(j));
      if (idx < 0) idx = null;
    }
    return null;
  }
  function fail() { deps.toast?.("😢", 1500); goHome(); }
  function randomSpot(size) {
    const hu = size * (pic.h / pic.w) / 2, hv = size / 2;
    return [EDGE + hu + Math.random() * Math.max(0, 1 - 2 * (EDGE + hu)), EDGE + hv + Math.random() * Math.max(0, 1 - 2 * (EDGE + hv))];
  }

  function startFind() {
    reset();
    S.mode = S.game = "find"; root.classList.remove("hiding");
    S.round = 0; S.found = 0; setStars(0);
    S.order = pickOrder(3);
    startRound();
  }
  async function startRound() {
    const tok = ++tokR;
    S.phase = "load"; setCham("off"); loadEl.classList.add("on");
    const p = await sceneFor(S.round);
    if (tok !== tokR || !S.open) return;
    loadEl.classList.remove("on");
    if (!p) return fail();
    S.scene = S.list[S.order[S.round]].id;
    setPic(p);
    later(600, () => { const nx = S.order[S.round + 1]; if (nx != null) load(S.list[nx]); });   // 下一張先偷偷載
    const size = SIZES[S.round], [u, v] = randomSpot(size), camo = under(u, v, size);
    Object.assign(S, { u, v, size, seed: 1 + Math.floor(Math.random() * 1e6) });
    if (S.round === 0 && !seen()) return intro(u, v, size, camo);
    placeCham(); paint(TINTS[S.round], camo); setCham();
    A.sfx?.("pop", { gain: 0.5 });
    seek();
  }
  function seek() { S.phase = "seek"; S.t = 0; S.hint = 0; S.spark = 0; }

  // 第一次玩：牠先在中間原色出現、揮手，然後「咻」一下跑去躲（移動中慢慢變色）
  function intro(u, v, size, camo) {
    markSeen();   // 開始示範就算看過（中途離開也不會再來一次）
    S.phase = "intro";
    Object.assign(S, { u: 0.5, v: 0.52, size: Math.min(INTRO_SIZE, 0.8 * pic.w / pic.h) });
    placeCham(); paint(0, camo);
    say.textContent = "👋"; setCham("wave");
    A.sfx?.("pop");
    later(2000, () => {
      setCham("dash");
      A.sfx?.("magic");
      const from = { u: S.u, v: S.v, size: S.size };
      tween(950, p => {
        const e = ease(p);
        S.u = from.u + (u - from.u) * e; S.v = from.v + (v - from.v) * e; S.size = from.size + (size - from.size) * e;
        placeCham(); paint(TINTS[0] * e, camo);
        if (p < 0.85) { const [cx, cy] = center(); parts.trail(cx, cy, { brush: "magic", color: "#ffc93c" }, p === 0); }
      }, () => { setCham(); seek(); });
    });
  }

  // ── 提示：越找不到給越多 ──
  function hints() {
    const t = S.t;
    if (t >= HINTS[2]) return found(true);
    if (t >= HINTS[0] && S.hint < 1) {   // 眨兩下眼、身體抖一下
      S.hint = 1;
      cham.classList.remove("peek"); void cham.offsetWidth; cham.classList.add("peek");
      A.sfx?.("tap", { gain: 0.35 });
      later(1500, () => cham.classList.remove("peek"));
    }
    if (t >= HINTS[1] && S.hint < 2) { S.hint = 2; S.spark = t; cham.classList.add("glint"); A.chime?.(0.25); }
    if (S.hint >= 2 && t >= S.spark) {   // 旁邊一直冒閃光
      S.spark = t + 1.8;
      const [cx, cy] = center();
      parts.stars(cx, cy, box() * 0.9);
    }
  }

  // ── 找到了（auto = 25 秒沒找到，牠自己跳出來） ──
  function found(auto = false) {
    if (S.phase !== "seek") return;
    S.phase = "found";
    paint(0);   // 瞬間變回原本的綠色＋彩色圓點
    if (auto) { say.textContent = "在這裡！"; setCham("say"); A.sfx?.("magic"); } else { setCham("yay"); A.sfx?.("finish"); }
    const [cx, cy] = center(), bs = box();
    parts.stars(cx, cy, Math.max(80, bs * 1.4));
    if (!auto) parts.splash(cx, cy - bs * 0.2, null);
    S.found++;
    if (S.game === "find") setStars(S.found);
    later(auto ? 2300 : 1500, next);
  }
  function next() {
    if (S.game === "find" && S.round < 2) { S.round++; startRound(); return; }
    end();
  }
  function miss(lx, ly) {
    S.misses++;
    const old = frame.querySelectorAll(".sk-ripple");
    if (old.length >= 6) old[0].remove();   // 連點很多下：最多同時 6 圈
    const r = document.createElement("i");
    r.className = "sk-ripple";
    r.style.left = lx + "px"; r.style.top = ly + "px";
    r.addEventListener("animationend", () => r.remove());
    frame.append(r);
    later(900, () => r.remove());
    A.note?.(1 + Math.floor(Math.random() * 2), { gain: 0.3, dur: 0.22 });   // 低低的「咕」，不是錯誤音
  }
  function end() {
    S.phase = "end";
    if (S.game === "find") setStars(3);
    root.classList.add("ended");
    A.sfx?.("finish");
    later(500, () => A.chime?.(0.5));
    confetti();
  }
  function confetti() {
    const box = document.createElement("div");
    box.className = "sk-confetti";
    let h = "";
    for (let i = 0; i < 46; i++) {
      const w = 8 + Math.random() * 8;
      h += `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--c:${PAL[i % PAL.length]};--d:${(Math.random() * 0.7).toFixed(2)}s;--t:${(1.9 + Math.random() * 1.3).toFixed(2)}s;` +
        `--r:${Math.round(Math.random() * 900 - 450)}deg;--sx:${Math.round(Math.random() * 120 - 60)}px;--w:${w.toFixed(1)}px"></i>`;
    }
    box.innerHTML = h;
    root.append(box);
    later(4200, () => box.remove());
  }

  // ── 藏模式：拖去想藏的地方（拖的時候即時變色），按 ✔️ → 換人找 ──
  async function startHide() {
    reset();
    S.mode = S.game = "hide"; root.classList.add("hiding");
    S.round = 0; S.found = 0;
    S.order = pickOrder(1);
    const tok = ++tokR;
    S.phase = "load"; loadEl.classList.add("on");
    const p = await sceneFor(0);
    if (tok !== tokR || !S.open) return;
    loadEl.classList.remove("on");
    if (!p) return fail();
    S.scene = S.list[S.order[0]].id;
    setPic(p);
    Object.assign(S, { u: 0.5, v: 0.5, size: HIDE_SIZE, seed: 1 + Math.floor(Math.random() * 1e6), moved: false });
    S.camo = under(S.u, S.v, S.size);
    placeCham(); paint(0); setCham("grab");
    S.phase = "place"; root.classList.add("placing");
  }
  function moveTo(lx, ly) {
    const hu = S.size * L.h / L.w / 2, hv = S.size / 2;
    S.u = clamp(lx / L.w, EDGE + hu, 1 - EDGE - hu); S.v = clamp(ly / L.h, EDGE + hv, 1 - EDGE - hv);
    placeCham();
  }
  q("#skOk").onclick = () => {
    if (S.phase !== "place") return;
    endDrag();
    paint(HIDE_TINT, under(S.u, S.v, S.size));   // 沒拖過也照樣偽裝好
    setCham();
    S.phase = "pass";
    root.classList.remove("placing"); root.classList.add("passing");
  };
  q("#skPass").onclick = () => {
    if (S.phase !== "pass") return;
    root.classList.remove("passing");
    A.sfx?.("pop");
    seek();
  };

  // ── 手指 ──
  const local = e => { const rr = root.getBoundingClientRect(); return [e.clientX - rr.left - L.x, e.clientY - rr.top - L.y]; };
  const onCham = (lx, ly) => { const h = box() * HIT / 2; return Math.abs(lx - S.u * L.w) <= h && Math.abs(ly - S.v * L.h) <= h; };
  wall.addEventListener("pointerdown", e => {
    if (!e.isPrimary || !S.open || !L || drag) return;   // 只認第一根手指；第二根（手掌）不理
    const [lx, ly] = local(e), inPic = lx >= 0 && ly >= 0 && lx <= L.w && ly <= L.h;
    if (S.phase === "seek") {
      if (onCham(lx, ly)) found();
      else if (inPic) miss(lx, ly);
      return;
    }
    if (S.phase !== "place" || !inPic) return;
    e.preventDefault();
    try { wall.setPointerCapture(e.pointerId); } catch { /* 合成事件沒有真的指標，抓不住也沒關係 */ }
    if (!onCham(lx, ly)) moveTo(lx, ly);   // 點在別的地方：牠直接跳過去，從那裡接著拖（3 歲不用瞄準）
    drag = { id: e.pointerId, ox: lx - S.u * L.w, oy: ly - S.v * L.h };
    setCham("held");
    A.sfx?.("tap", { gain: 0.5 });
    S.moved = true;
  });
  wall.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const [lx, ly] = local(e);
    moveTo(lx - drag.ox, ly - drag.oy);
  });
  const up = e => {
    if (!drag || e.pointerId !== drag.id) return;
    endDrag();
    if (S.phase === "place") { A.sfx?.("pop", { gain: 0.6 }); q("#skOk").classList.add("ready"); }
  };
  wall.addEventListener("pointerup", up);
  wall.addEventListener("pointercancel", up);

  // ── 每一幀：找的計時（提示用）、藏的時候慢慢變成底下的顏色 ──
  function tick(now) {
    loop = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);   // 切到背景再回來不會一下子跳很多秒
    last = now;
    if (!root.classList.contains("on")) return;   // 主程式切走了（沒經過 close）：不計時、不冒提示
    if (S.phase === "seek") { S.t += dt * S.speed; hints(); }
    else if (S.phase === "place" && S.moved) {
      const tgt = under(S.u, S.v, S.size), c = S.camo.map((v, i) => v + (tgt[i] - v) * 0.35), k = S.k + (HIDE_TINT - S.k) * 0.2;
      if (Math.abs(k - S.k) > 0.002 || c.some((v, i) => Math.abs(v - S.camo[i]) > 0.5)) paint(k, c);
    }
  }
  window.addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { endDrag(); layout(); }); });

  // ── 按鈕 ──
  const goHome = () => { close(); deps.onHome?.(); };
  bHome.onclick = goHome;
  q("#skHome2").onclick = goHome;
  q("#skAgain").onclick = () => { if (S.list) (S.game === "hide" ? startHide : startFind)(); };
  q("#skHide").onclick = () => { if (S.list) (S.mode === "find" ? startHide : startFind)(); };

  // ── 對外 ──
  async function open() {
    close();
    S.open = true; S.phase = "load";
    deps.show("seek");
    last = 0; loop = requestAnimationFrame(tick);
    loadEl.classList.add("on");
    const tok = ++tokO;
    let list = [];
    try { list = await deps.getScenes(); } catch { list = []; }
    await mReady;
    if (tok !== tokO || !S.open) return;
    list = (Array.isArray(list) ? list : []).filter(s => s && s.src);
    if (!list.length) { loadEl.classList.remove("on"); return fail(); }
    const keep = new Set(list.map(s => s.src));
    for (const k of cache.keys()) if (!keep.has(k)) cache.delete(k);   // 作品換了（blob 網址每次不同）：舊的放掉
    S.list = list.map((s, i) => ({ id: s.id ?? i, src: s.src }));
    startFind();
  }
  function close() {
    reset();
    cancelAnimationFrame(loop); loop = 0;
    loadEl.classList.remove("on");
    S.open = false; S.phase = "idle"; tokO++;
  }

  window.__seek = {
    state: S,
    where() {   // 變色龍目前的螢幕座標框（不含放大的點擊範圍）
      if (!L) return null;
      const [cx, cy] = center(), bs = box();
      return { x: cx - bs / 2, y: cy - bs / 2, w: bs, h: bs, cx, cy };
    },
    find() { found(); },
    advance(sec) { if (S.phase === "seek") { S.t += sec; hints(); } },   // 測試用：時間快轉
    frame() { if (!L) return null; const rr = root.getBoundingClientRect(); return { x: rr.left + L.x, y: rr.top + L.y, w: L.w, h: L.h }; },
    under() { return under(S.u, S.v, S.size); },
  };
  return { open, close, el: root };
}
