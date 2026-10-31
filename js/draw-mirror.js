// 鏡子魔法畫（萬花筒對稱畫）：手指畫一筆，以畫布中心為圓心同時畫出 N 份（N/2 個旋轉 × 左右鏡射 = 真正的萬花筒）。
// 2 份 = 左右對稱（畫蝴蝶）、12 份 = 雪花；3～5 歲亂畫也漂亮、不會失敗。
// 獨立模組：不 import 任何既有檔（版號會變），聲音、粒子、切畫面、存作品都從 deps 傳進來。
// 畫布：三張「固定解析度」的畫布疊在一起（store＝畫好的；glow、core＝正在畫的這一筆的光暈和亮芯），用 CSS 縮放顯示。
// 解析度在建立時依螢幕定好（DPR 最多 2），之後視窗大小改變只改 CSS 大小，畫好的內容原封不動、不會越縮越糊。

const NEON = ["#ff3fa4", "#ff5a3c", "#ffa21f", "#ffe53b", "#72ff52", "#2cefff", "#4f82ff", "#b55cff"];
const SYMS = [2, 4, 6, 8, 12];
const BRUSHES = ["neon", "star", "rainbow"];
const SND = { neon: "neon", star: "sparkle", rainbow: "rainbow" };   // 沙沙聲／粒子借用畫畫頁同類的筆
const WK = { neon: 1, star: 1, rainbow: 1.45 };                      // 各種筆的粗細倍數
const MEL = [10, 12, 14, 15, 17, 15, 14, 12, 11, 13, 15, 16, 18, 16, 15, 13];   // 轉起來時的五聲音階旋律
const PREF = "draw-mirror", SEEN = "draw-mirror-seen";
const UNDO_MAX = 20, UNDO_BYTES = 80e6;   // 復原最多 20 步；整張快照很大，總量超過約 80MB 就先丟最舊的
const SPIN_SPEED = 0.036;                 // 度／毫秒：10 秒轉一圈

export function mountMirror(deps) {
  const A = deps.A;
  const S = { sym: 8, brush: "neon", color: "auto", auto: 0, spin: false, angle: 0, demo: false, pop: false,
    busy: false, ink: false, dirty: false, open: false };
  loadPref(S);

  // ── 畫面 ──
  const root = document.createElement("section");
  root.id = "mirror"; root.className = "screen";
  root.innerHTML = `
    <div class="x-stage">
      <div class="x-sky"></div><div class="x-sky b"></div>
      <div class="x-frame">
        <div class="x-halo"></div>
        <svg class="x-axes" viewBox="0 0 100 100" aria-hidden="true"></svg>
        <div class="x-art"><canvas class="x-store"></canvas><canvas class="x-glow"></canvas><canvas class="x-core"></canvas></div>
        <div class="x-hand"></div>
      </div>
    </div>
    <nav class="x-bar">
      <button id="xSave" class="btn ok" data-sfx="none" aria-label="存到作品牆">✔️</button>
      <button id="xHome" class="btn" aria-label="回首頁">🏠</button>
      <hr>
      <button id="xSym" class="btn" data-sfx="pick" aria-label="對稱份數"></button>
      <button id="xBrush" class="btn" data-sfx="pick" aria-label="換筆"></button>
      <button id="xColor" class="btn" data-sfx="pop" aria-label="顏色"><span class="dot"></span></button>
      <hr>
      <button id="xSpin" class="btn" data-sfx="none" aria-label="轉起來"><span class="x-spin-ico">🌀</span></button>
      <hr>
      <button id="xUndo" class="btn" data-sfx="undo" aria-label="復原"><span>↩️</span></button>
      <button id="xClear" class="btn hold" aria-label="清空（要按住）">🗑️<i class="ring"></i></button>
    </nav>
    <div class="x-pop"></div>`;
  document.body.append(root);
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "css/draw-mirror.css?v=" + deps.v;
  css.onload = () => { if (S.open) layout(); };   // CSS 晚到時，第一次量到的大小不準 → 到了再排一次
  document.head.append(css);

  const q = s => root.querySelector(s);
  const stage = q(".x-stage"), frame = q(".x-frame"), art = q(".x-art"), axSvg = q(".x-axes"), hand = q(".x-hand"), pop = q(".x-pop");
  const bSym = q("#xSym"), bBrush = q("#xBrush"), bColor = q("#xColor"), bUndo = q("#xUndo"), bSpin = q("#xSpin");
  const parts = new deps.Particles(stage);

  // 畫布解析度：依螢幕短邊 × DPR（最多 2）定一次，640～1600 之間
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const short = Math.min(screen.width || innerWidth, screen.height || innerHeight) || 800;
  const R0 = Math.round(Math.max(640, Math.min(1600, short * dpr)));
  // 正在畫的這一筆分兩層：光暈（有 shadowBlur）和亮芯，都只用一般疊法（source-over）畫。
  // 有 shadowBlur 時改用 destination-over／lighter 疊法，瀏覽器會每一下都開一整張暫存層（實測慢 200 倍）
  const store = q(".x-store"), glow = q(".x-glow"), core = q(".x-core");
  for (const c of [store, glow, core]) c.width = c.height = R0;
  const sx = store.getContext("2d"), gx = glow.getContext("2d"), cx = core.getContext("2d");
  const clearLive = () => { gx.clearRect(0, 0, R0, R0); cx.clearRect(0, 0, R0, R0); };
  const W0 = R0 * 0.011, BLUR = R0 * 0.016, GAP = R0 * 0.038, MARG = R0 * 0.07;   // 線粗、光暈、星星間距、重畫範圍的安全邊
  const L = { left: 0, top: 0, side: 0 };   // 畫框在螢幕上的位置（不含旋轉）

  // ── 復原：每一筆畫進 store 之前，只存「這一筆真的會改到的像素」原本的值 ──
  // 萬花筒的一筆有 N 份、散在整張畫上，外框幾乎是整張；整塊存一步要好幾 MB，存不到 20 步。
  // 筆畫本身很細，實際改到的像素少很多：記「第幾個像素＋原本的值」，一步約 1MB
  const hist = {
    list: [], bytes: 0,
    push(e) {
      this.list.push(e); this.bytes += e.bytes;
      while (this.list.length > UNDO_MAX || (this.bytes > UNDO_BYTES && this.list.length > 1)) this.bytes -= this.list.shift().bytes;
    },
    pop() { const e = this.list.pop(); if (e) this.bytes -= e.bytes; return e; },
    clear() { this.list = []; this.bytes = 0; },
  };
  // 光暈層有顏色的像素，就是疊加（lighter）之後會變的像素（亮芯一定在光暈裡面）；透明的地方加 0 不會變
  function snap(r) {
    const s32 = new Uint32Array(sx.getImageData(r.x, r.y, r.w, r.h).data.buffer), ld = gx.getImageData(r.x, r.y, r.w, r.h).data;
    let n = 0;
    for (let p = 3; p < ld.length; p += 4) if (ld[p]) n++;
    const idx = new Uint32Array(n), val = new Uint32Array(n);
    for (let i = 0, k = 0, p = 3; p < ld.length; p += 4, i++) if (ld[p]) { idx[k] = i; val[k++] = s32[i]; }
    return { ...r, idx, val, ink: S.ink, bytes: n * 8 + 64 };
  }

  // ── 對稱：N 份 = N/2 個旋轉，每個再加一份左右鏡射；對稱軸有一條是直的（蝴蝶左右對稱） ──
  function mats(sym) {
    const M = sym / 2, c = R0 / 2, out = [];
    for (let k = 0; k < M; k++) {
      const t = k * 2 * Math.PI / M, co = Math.cos(t), si = Math.sin(t);
      for (const s of [1, -1]) { const a = co * s, b = si * s, cc = -si, d = co; out.push([a, b, cc, d, c - a * c - cc * c, c - b * c - d * c]); }
    }
    return out;
  }

  // ── 一筆畫：開始 → 移動 → 結束才「疊加」進 store（lighter：交叉的地方更亮，像霓虹燈） ──
  const pen = {
    st: null,
    begin(x, y, t) {
      if (this.st) this.end();
      const brush = S.brush, auto = S.color === "auto";
      const color = brush === "rainbow" ? null : auto ? NEON[S.auto % NEON.length] : S.color;
      if (auto && brush !== "rainbow") S.auto++;   // 彩虹自動：每一筆自動換下一個顏色
      const st = this.st = { brush, color, auto, core: color && mix(color, "#ffffff", 0.72), hue: Math.random() * 360,
        w: W0 * WK[brush], last: { x, y }, mid: { x, y }, t, n: 0, walk: 0, box: [x, y, x, y], ding: 0, trail: 0, m: mats(S.sym) };
      axes(false);
      A.strokeOn(SND[brush]);
      const c = toClient(x, y);
      parts.trail(c.x, c.y, { brush: SND[brush], color: color || "#ffffff" }, true);
      if (brush === "star") walk(st, st.last, st.last, GAP, (px, py) => stamp(st.m, px, py, st));
    },
    move(x, y, t) {
      const st = this.st;
      if (!st) return;
      const a = st.last, d = Math.hypot(x - a.x, y - a.y);
      if (d < R0 * 0.002) return;   // 太近的點不畫，免得一堆零長度小段
      const css = d * L.side / R0, v = css / Math.max(4, t - st.t);
      st.t = t; st.n++;
      A.strokeSpeed(v);
      const k = Math.min(1, v / 2.2);
      st.w += (W0 * WK[st.brush] * (1.25 - 0.55 * k) - st.w) * 0.35;   // 手越快線越細一點，慢慢變、不會一節一節
      grow(st.box, x, y);
      if (st.brush === "star") walk(st, a, { x, y }, GAP, (px, py) => stamp(st.m, px, py, st));
      else {
        const m = { x: (a.x + x) / 2, y: (a.y + y) / 2 };   // 中點二次曲線：線條平滑不折角
        if (st.brush === "rainbow") st.hue = (st.hue + d * 360 / (R0 * 0.45)) % 360;
        glowLine(gx, cx, st.m, [st.mid.x, st.mid.y, a.x, a.y, m.x, m.y], colOf(st), coreOf(st), st.w, BLUR);
        st.mid = m;
      }
      st.last = { x, y };
      if ((st.ding += css) > (st.brush === "star" ? 90 : 160)) { st.ding = 0; A.chime(0.1); }
      if ((st.trail += css) > 14) {
        st.trail = 0;
        const c = toClient(x, y);
        parts.trail(c.x, c.y, { brush: SND[st.brush], color: st.color || colOf(st) });
      }
    },
    end() {
      const st = this.st;
      if (!st) return;
      this.st = null;
      if (st.brush !== "star") {   // 最後一小段：從中點直線接到最後一點；只點一下 → 畫一個圓點
        const g = st.n ? [st.mid.x, st.mid.y, st.last.x, st.last.y] : [st.last.x, st.last.y, st.last.x + 0.01, st.last.y];
        glowLine(gx, cx, st.m, g, colOf(st), coreOf(st), st.w, BLUR);
      }
      A.strokeOff();
      commit(st);
    },
    cancel() { this.st = null; clearLive(); A.strokeOff(); },
  };

  function commit(st) {
    const r = dirtyRect(st);
    if (r) {
      hist.push(snap(r));
      sx.globalCompositeOperation = "lighter";   // 交叉的地方加亮，像霓虹燈；畫面上 CSS plus-lighter 也是這樣疊，放開手不會閃
      sx.drawImage(glow, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      sx.drawImage(core, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      sx.globalCompositeOperation = "source-over";
      S.ink = true; S.dirty = true;
    }
    clearLive();
    refreshUndo();
  }
  // 這一筆的 N 份複本合起來會改到的範圍（筆畫外框的四個角各轉一次）
  function dirtyRect(st) {
    const [x0, y0, x1, y1] = [st.box[0] - MARG, st.box[1] - MARG, st.box[2] + MARG, st.box[3] + MARG];
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const m of st.m) for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
      a = Math.min(a, X); b = Math.min(b, Y); c = Math.max(c, X); d = Math.max(d, Y);
    }
    a = Math.max(0, Math.floor(a)); b = Math.max(0, Math.floor(b)); c = Math.min(R0, Math.ceil(c)); d = Math.min(R0, Math.ceil(d));
    return c > a && d > b ? { x: a, y: b, w: c - a, h: d - b } : null;
  }
  const colOf = st => (st.brush === "rainbow" ? `hsl(${st.hue | 0},100%,62%)` : st.color);
  const coreOf = st => (st.brush === "rainbow" ? `hsl(${st.hue | 0},100%,88%)` : st.core);
  // 星星筆：每一顆大小、角度不同；彩虹自動時每顆隨機換色
  function stamp(m, px, py, st) {
    const s = R0 * (0.012 + Math.random() * 0.011), rot = Math.random() * Math.PI;
    const col = st.auto ? NEON[(Math.random() * NEON.length) | 0] : Math.random() < 0.35 ? mix(st.color, "#ffffff", 0.45) : st.color;
    const ang = Math.random() * Math.PI * 2, extra = Math.random() < 0.5 ? [px + Math.cos(ang) * s * 1.7, py + Math.sin(ang) * s * 1.7] : null;
    starStamp(gx, cx, m, px, py, s, rot, col, BLUR * 0.7, extra);
  }

  function undo() {
    if (S.busy || pen.st) return false;   // 正在畫的時候按到復原 → 不理，免得把畫到一半的那筆弄亂
    const e = hist.pop();
    if (!e) return false;
    if (e.img) sx.putImageData(e.img, e.x, e.y);   // 清空那一步：整張
    else {
      const img = sx.getImageData(e.x, e.y, e.w, e.h), s32 = new Uint32Array(img.data.buffer);
      for (let k = 0; k < e.idx.length; k++) s32[e.idx[k]] = e.val[k];
      sx.putImageData(img, e.x, e.y);
    }
    S.ink = e.ink; S.dirty = true;
    if (!S.ink) axes(true);
    refreshUndo();
    return true;
  }
  function clearAll() {
    if (S.busy) return;
    A.sfx("clear");
    clearTimeout(demoTimer); demoStop();
    if (pen.st) pen.cancel();
    if (!S.ink) return;   // 本來就是空的：不記一步復原
    const img = sx.getImageData(0, 0, R0, R0);
    hist.push({ x: 0, y: 0, img, ink: S.ink, bytes: img.data.length });
    sx.clearRect(0, 0, R0, R0);
    S.ink = false; S.dirty = true;
    axes(true); refreshUndo();
  }
  function wipe() {   // 開新的一張（上一張已經存進作品牆）：不記復原
    sx.clearRect(0, 0, R0, R0); clearLive();
    hist.clear(); S.ink = false; S.dirty = false;
    refreshUndo();
  }

  // ── 存到作品牆：存成 3:2（跟其他作品一樣的比例），深夜背景＋星點、萬花筒放中間 ──
  function exportCanvas() {
    const H = Math.min(R0, 1200), W = Math.round(H * 1.5), c = mk(W, H), x = c.getContext("2d");
    const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, "#1b2268"); g.addColorStop(0.55, "#0c1142"); g.addColorStop(1, "#04051a");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const rnd = mulberry32(7), k = H / 800;
    for (let i = 0; i < 110; i++) {
      x.globalAlpha = 0.2 + rnd() * 0.5; x.fillStyle = "#fff";
      x.beginPath(); x.arc(rnd() * W, rnd() * H, (0.6 + rnd() * 1.2) * k, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    x.drawImage(store, (W - H) / 2, 0, H, H);
    return c;
  }
  async function save() {
    if (S.busy) return;
    closePop(); clearTimeout(demoTimer); demoStop();
    if (pen.st) pen.end();
    if (!S.ink) { A.sfx("pop"); tapHint(); return; }   // 還沒畫：手指提示「先在這裡畫」
    const mx = L.left + L.side / 2, my = L.top + L.side / 2;   // 畫框中心（放星星）
    if (!S.dirty) { parts.stars(mx, my, L.side * 0.6); A.sfx("save"); return; }   // 這張已經存過、之後也沒再畫：只再慶祝一次，不重複存
    S.busy = true;
    let r = "fail";
    try { r = await deps.saveWork(exportCanvas()); }
    catch (e) { console.warn("鏡子魔法畫存檔失敗：" + (e && e.message)); }
    finally { S.busy = false; }
    if (r === "ok") { S.dirty = false; parts.stars(mx, my, L.side * 0.6); A.sfx("save"); }
    else if (r === "full") deps.toast("🖼️ 滿了", 1200);
    else deps.toast("⚠️ 沒存到");
  }

  // ── 座標：螢幕 ↔ 畫布（轉起來時要扣掉目前轉的角度） ──
  function measure() { const f = frame.getBoundingClientRect(); L.left = f.left; L.top = f.top; L.side = f.width; }
  function toCanvas(cx, cy) {
    const dx = cx - L.left - L.side / 2, dy = cy - L.top - L.side / 2, t = -S.angle * Math.PI / 180, co = Math.cos(t), si = Math.sin(t);
    return { x: ((dx * co - dy * si) / L.side + 0.5) * R0, y: ((dx * si + dy * co) / L.side + 0.5) * R0 };
  }
  function toClient(x, y) {
    const ux = (x / R0 - 0.5) * L.side, uy = (y / R0 - 0.5) * L.side, t = S.angle * Math.PI / 180, co = Math.cos(t), si = Math.sin(t);
    return { x: L.left + L.side / 2 + ux * co - uy * si, y: L.top + L.side / 2 + ux * si + uy * co };
  }

  // ── 排版：畫框是正方形、盡量大、置中；視窗變了只改 CSS 大小 ──
  function layout() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const side = Math.max(100, Math.floor(Math.min(r.width, r.height) - 32));
    Object.assign(frame.style, { width: side + "px", height: side + "px",
      left: Math.round((r.width - side) / 2) + "px", top: Math.round((r.height - side) / 2) + "px" });
    measure();
    parts.fit?.();
    if (S.pop) placePop();
  }
  window.addEventListener("resize", () => { if (S.open) layout(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (S.open) layout(); }).observe(stage);

  // ── 手指：只認第一根，其他手指（手掌）不理 ──
  const ptr = { id: null, cx: 0, cy: 0 };
  stage.addEventListener("pointerdown", e => {
    if (S.busy || !S.open) return;
    if (S.pop) { closePop(); return; }   // 選單開著時，第一下只關選單
    if (ptr.id !== null) {
      if (!e.isPrimary) return;          // 第二根手指、手掌
      pen.end(); ptr.id = null;          // 上一根手指的放開事件遺失了 → 收掉重來
    }
    clearTimeout(demoTimer); demoStop(); hideHand();
    measure();
    ptr.id = e.pointerId; ptr.cx = e.clientX; ptr.cy = e.clientY;
    try { stage.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
    const p = toCanvas(e.clientX, e.clientY);
    pen.begin(p.x, p.y, e.timeStamp);
  });
  stage.addEventListener("pointermove", e => {
    if (e.pointerId !== ptr.id) return;
    const evs = e.getCoalescedEvents?.() || [];   // iPad 一幀會合併好幾個點，全部畫才順
    for (const ev of evs.length ? evs : [e]) {
      ptr.cx = ev.clientX; ptr.cy = ev.clientY;
      const p = toCanvas(ev.clientX, ev.clientY);
      pen.move(p.x, p.y, ev.timeStamp);
    }
  });
  const up = e => {
    if (e.pointerId !== ptr.id) return;
    ptr.id = null;
    if (e.type === "pointercancel") pen.cancel(); else pen.end();
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);

  // ── 對稱軸：背景淡淡的 N 條線，開始畫就淡出 ──
  let axTimer = 0;
  function renderAxes() {
    let s = "";
    for (let i = 0; i < S.sym; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / S.sym;
      s += `<line x1="50" y1="50" x2="${(50 + 72 * Math.cos(a)).toFixed(2)}" y2="${(50 + 72 * Math.sin(a)).toFixed(2)}"/>`;
    }
    axSvg.innerHTML = s + `<circle cx="50" cy="50" r="1.3"/>`;
  }
  function axes(on, ms = 0) {
    clearTimeout(axTimer);
    axSvg.classList.toggle("off", !on || S.spin);
    if (on && ms) axTimer = setTimeout(() => axes(!S.ink), ms);
  }

  // ── 工具列 ──
  q("#xHome").onclick = () => { close(); deps.onHome(); };
  q("#xSave").onclick = save;
  bSym.onclick = () => {
    closePop();
    S.sym = SYMS[(SYMS.indexOf(S.sym) + 1) % SYMS.length];
    savePref(S); refreshBar(); renderAxes();
    axes(true, S.ink ? 1500 : 0);   // 換份數時讓小孩看一下新的對稱軸
  };
  bBrush.onclick = () => { closePop(); S.brush = BRUSHES[(BRUSHES.indexOf(S.brush) + 1) % BRUSHES.length]; savePref(S); refreshBar(); };
  bColor.onclick = () => (S.pop ? closePop() : openPop());
  bUndo.onclick = () => { closePop(); undo(); };
  bSpin.onclick = () => { closePop(); if (S.spin) spinOff(); else spinOn(); };
  hold(q("#xClear"), () => { closePop(); clearAll(); });

  function refreshBar() {
    bSym.innerHTML = symIcon(S.sym);
    bBrush.replaceChildren(brushIcon(S.brush, S.color === "auto" ? NEON[S.auto % NEON.length] : S.color));
    bColor.querySelector(".dot").style.background = S.color === "auto" ? RAINBOW : S.color;
    bColor.classList.toggle("dim", S.brush === "rainbow");   // 彩虹筆自己會換色，顏色用不到（照樣可以先選好）
    refreshUndo();
  }
  function refreshUndo() { bUndo.classList.toggle("dim", !hist.list.length); }

  // ── 顏色選單：8 個霓虹色＋彩虹自動，選完自己收起來 ──
  let popTimer = 0;
  function openPop() {
    clearTimeout(popTimer);
    S.pop = true;
    pop.replaceChildren(...[...NEON, "auto"].map((c, i) => {
      const b = document.createElement("button");
      b.className = "x-sw" + (c === "auto" ? " auto" : "") + (c === S.color ? " on" : "");
      b.dataset.sfx = "none";
      b.setAttribute("aria-label", c === "auto" ? "彩虹自動" : c);
      if (c !== "auto") b.style.setProperty("--c", c);
      b.onclick = () => {
        S.color = c; A.note(5 + i, { gain: 0.2 });
        savePref(S); refreshBar();
        for (const x of pop.children) x.classList.toggle("on", x === b);
        clearTimeout(popTimer); popTimer = setTimeout(closePop, 250);   // 先讓小孩看到選中的框，再收起來
      };
      return b;
    }));
    pop.classList.add("on");
    placePop();
  }
  function closePop() { clearTimeout(popTimer); S.pop = false; pop.classList.remove("on"); }
  function placePop() {
    const host = root.getBoundingClientRect(), r = bColor.getBoundingClientRect(), h = pop.offsetHeight;
    const mid = r.top - host.top + r.height / 2, top = Math.max(12, Math.min(host.height - h - 12, mid - h / 2));
    pop.style.top = top + "px";
    pop.style.setProperty("--ay", (mid - top) + "px");
  }

  // ── 轉起來：整張圖慢慢轉、每個音符一閃；手指按著不動也會跟著轉盤畫出圓圈 ──
  const spin = { raf: 0, last: 0, next: 0, i: 0, settle: null };
  function spinOn() {
    clearTimeout(demoTimer); demoStop();
    S.spin = true; spin.settle = null;
    root.classList.add("spinning"); bSpin.classList.add("on"); axes(false);
    A.sfx("magic");
    spin.last = performance.now(); spin.next = spin.last + 200; spin.i = 0;
    cancelAnimationFrame(spin.raf); spin.raf = requestAnimationFrame(spinFrame);
  }
  function spinOff(now = false) {
    S.spin = false;
    root.classList.remove("spinning"); bSpin.classList.remove("on");
    if (now || !S.angle) {   // 立刻停（離開畫面）：轉回原位
      cancelAnimationFrame(spin.raf); spin.settle = null; S.angle = 0; setAngle(0);
      if (!S.ink) axes(true);
      return;
    }
    spin.settle = { from: S.angle, to: S.angle > 180 ? 360 : 0, t0: performance.now() };   // 走最短的路轉回原位
  }
  function spinFrame(now) {
    if (!root.classList.contains("on")) { spinOff(true); return; }   // 主程式直接切走畫面也要停
    const dt = Math.max(0, Math.min(50, now - spin.last));
    spin.last = now;
    if (S.spin) {
      S.angle = (S.angle + dt * SPIN_SPEED) % 360;
      if (now >= spin.next) { A.note(MEL[spin.i++ % MEL.length], { gain: 0.13, dur: 0.9 }); flash(); spin.next = now + 330; }
    } else if (spin.settle) {
      const u = Math.min(1, (now - spin.settle.t0) / 600), e = 1 - (1 - u) ** 3;
      S.angle = spin.settle.from + (spin.settle.to - spin.settle.from) * e;
      if (u >= 1) { S.angle = 0; spin.settle = null; if (!S.ink) axes(true); }
    }
    setAngle(S.angle);
    if (pen.st && ptr.id !== null) { const p = toCanvas(ptr.cx, ptr.cy); pen.move(p.x, p.y, now); }
    if (S.spin || spin.settle) spin.raf = requestAnimationFrame(spinFrame);
  }
  function setAngle(a) { art.style.transform = a ? `rotate(${a.toFixed(2)}deg)` : ""; }
  function flash() {
    art.animate?.([{ filter: "brightness(1.8) saturate(1.3)" }, { filter: "brightness(1) saturate(1)" }], { duration: 460, easing: "ease-out" });
  }

  // ── 第一次打開：自動示範畫一片花瓣，萬花筒把它變成一整朵花；手指圖示跟著走 ──
  let demo = null, demoTimer = 0, handTimer = 0;
  function seen() { try { return localStorage.getItem(SEEN) === "1"; } catch { return true; } }   // 讀不到（私密瀏覽）就別一直示範
  function demoStart() {
    if (!S.open || demo || pen.st || S.spin) return;
    try { localStorage.setItem(SEEN, "1"); } catch { /* 私密瀏覽 */ }
    const N = S.sym, th0 = -Math.PI / 2 + Math.PI / N, del = Math.min(Math.PI / 3, 0.85 * Math.PI / N), R = 0.31;
    const pt = u => {   // 花瓣：從中心出去、在對稱軸之間繞一圈回來
      const r = R * Math.sin(Math.PI * u) ** 0.55, f = th0 + del * (2 * u - 1);
      return { x: (0.5 + r * Math.cos(f)) * R0, y: (0.5 + r * Math.sin(f)) * R0 };
    };
    S.demo = true;
    demo = { pt, t0: performance.now() + 450, dur: 1700, u: 0, started: false, raf: 0 };
    showHand(pt(0));
    demo.raf = requestAnimationFrame(demoFrame);
  }
  function demoFrame(now) {
    if (!demo) return;
    if (!root.classList.contains("on")) { demoStop(); return; }
    const u = Math.min(1, (now - demo.t0) / demo.dur);
    if (u >= 0) {
      if (!demo.started) { demo.started = true; const p = demo.pt(0); pen.begin(p.x, p.y, demo.t0); }
      const at = k => demo.t0 + k * demo.dur;   // 每個點用它「應該」被畫到的時間，手速才自然
      for (let k = demo.u + 0.01; k < u; k += 0.01) { const p = demo.pt(k); pen.move(p.x, p.y, at(k)); }   // 一格跨好幾個點時補中間點
      const p = demo.pt(u);
      pen.move(p.x, p.y, at(u));
      demo.u = u;
      showHand(p);
      if (u >= 1) { pen.end(); demo = null; S.demo = false; handTimer = setTimeout(hideHand, 350); return; }
    }
    demo.raf = requestAnimationFrame(demoFrame);
  }
  function demoStop() {
    if (!demo) return;
    cancelAnimationFrame(demo.raf);
    if (demo.started) pen.end();
    demo = null; S.demo = false; hideHand();
  }
  function showHand(p) {
    clearTimeout(handTimer);
    hand.className = "x-hand on";
    hand.style.left = (p.x / R0) * L.side + "px"; hand.style.top = (p.y / R0) * L.side + "px";
  }
  function hideHand() { clearTimeout(handTimer); hand.classList.remove("on", "swipe"); }
  function tapHint() {   // 還沒畫就按存：中間一隻手來回塗，提示「在這裡畫」
    showHand({ x: R0 / 2, y: R0 / 2 });
    hand.classList.add("swipe");
    axes(true);
    handTimer = setTimeout(hideHand, 1800);
  }

  // ── 對外 ──
  function open() {
    if (S.ink && !S.dirty) wipe();   // 上一張已經存進作品牆 → 換一張新的；沒存的畫留著
    let left = false;
    try { left = localStorage.getItem("draw-side") === "left"; } catch { /* 私密瀏覽 */ }
    root.classList.toggle("left", left);   // 工具列跟畫畫頁同一邊
    deps.show("mirror");
    S.open = true;
    layout(); refreshBar(); renderAxes();
    axes(!S.ink);
    if (!seen()) { clearTimeout(demoTimer); demoTimer = setTimeout(demoStart, 500); }
  }
  function close() {
    S.open = false;
    clearTimeout(demoTimer); demoStop(); hideHand();
    if (pen.st) pen.end();
    ptr.id = null;
    spinOff(true); closePop();
    A.strokeOff();
  }

  refreshBar(); renderAxes();
  window.__mirror = {
    state: S, R0,
    drawStroke(points, o = {}) {   // 測試用：points = [[x, y], ...]（畫布座標 0～1），照真的畫法畫一筆
      const keep = { brush: S.brush, color: S.color, sym: S.sym };
      Object.assign(S, o);
      let t = performance.now();
      pen.begin(points[0][0] * R0, points[0][1] * R0, t);
      for (const [x, y] of points.slice(1)) pen.move(x * R0, y * R0, (t += 16));
      pen.end();
      Object.assign(S, keep);
    },
    px(x, y) { return [...sx.getImageData(Math.min(R0 - 1, x * R0 | 0), Math.min(R0 - 1, y * R0 | 0), 1, 1).data]; },
    ink() {   // 有畫到的格子數（每 16 像素取一點）
      const d = sx.getImageData(0, 0, R0, R0).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 64) if (d[i] > 20) n++;
      return n;
    },
    hist: () => hist.list.length, undo, clearAll, save, layout: () => ({ ...L, R0 }), exportCanvas, toCanvas, toClient,
  };
  return { open, close, el: root };
}

// ── 畫法（純函式，按鈕預覽也用同一套） ──
// 霓虹線：光暈（彩色粗線＋shadowBlur）畫在光暈層、淺色細亮芯畫在亮芯層，兩層加亮疊起來中間發白；每份複本各畫一次
function glowLine(gx, cx, m, g, col, core, w, blur) {
  gx.lineCap = cx.lineCap = "round"; gx.lineJoin = cx.lineJoin = "round";
  gx.shadowBlur = blur; gx.shadowColor = col; gx.strokeStyle = col; gx.lineWidth = w;
  for (const t of m) { gx.setTransform(...t); seg(gx, g); gx.stroke(); }
  cx.strokeStyle = core; cx.lineWidth = w * 0.42;
  for (const t of m) { cx.setTransform(...t); seg(cx, g); cx.stroke(); }
  gx.setTransform(1, 0, 0, 1, 0, 0); cx.setTransform(1, 0, 0, 1, 0, 0);
}
function seg(x, g) {   // g = [x0, y0, 控制點x, 控制點y, x1, y1] 二次曲線，或 [x0, y0, x1, y1] 直線
  x.beginPath(); x.moveTo(g[0], g[1]);
  if (g.length === 6) x.quadraticCurveTo(g[2], g[3], g[4], g[5]); else x.lineTo(g[2], g[3]);
}
// 星星：發光的星星畫在光暈層、白色小亮芯畫在亮芯層（亮芯在星星裡面）；旁邊偶爾一顆小亮點（光暈層，才記得到復原）
function starStamp(gx, cx, m, px, py, s, rot, col, blur, extra) {
  gx.shadowBlur = blur; gx.shadowColor = col; gx.fillStyle = col;
  for (const t of m) { gx.setTransform(...t); gx.translate(px, py); gx.rotate(rot); starPath(gx, s, s * 0.45); gx.fill(); }
  gx.shadowBlur = 0; gx.fillStyle = "rgba(255,255,255,.85)"; cx.fillStyle = "rgba(255,255,255,.9)";
  for (const t of m) {
    cx.setTransform(...t); cx.beginPath(); cx.arc(px, py, s * 0.22, 0, Math.PI * 2); cx.fill();
    if (extra) { gx.setTransform(...t); gx.beginPath(); gx.arc(extra[0], extra[1], s * 0.17, 0, Math.PI * 2); gx.fill(); }
  }
  gx.setTransform(1, 0, 0, 1, 0, 0); cx.setTransform(1, 0, 0, 1, 0, 0);
}
function starPath(x, R, r) {
  x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; x.lineTo(d * Math.cos(a), d * Math.sin(a)); }
  x.closePath();
}
// 沿著 a → b 每隔 gap 呼叫一次 f；st.walk 記住離下一顆還差多遠，跨段也保持等距（第一顆落在起筆處）
function walk(st, a, b, gap, f) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  let d = st.walk;
  for (; d <= len; d += gap) { const t = len ? d / len : 0; f(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
  st.walk = d - len;
}
function grow(b, x, y) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
function mk(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function mix(a, b, k) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(",")})`;
}
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const RAINBOW = "conic-gradient(#ff3fa4, #ffa21f, #ffe53b, #72ff52, #2cefff, #4f82ff, #b55cff, #ff3fa4)";

// 設定：壞掉的資料（不是 JSON、數值不在清單裡）一律換回預設並寫回
function loadPref(S) {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PREF) || "null"); } catch { p = null; }
  const ok = p && typeof p === "object";
  if (ok && SYMS.includes(p.sym)) S.sym = p.sym;
  if (ok && BRUSHES.includes(p.brush)) S.brush = p.brush;
  if (ok && (p.color === "auto" || NEON.includes(p.color))) S.color = p.color;
  savePref(S);
}
function savePref(S) { try { localStorage.setItem(PREF, JSON.stringify({ sym: S.sym, brush: S.brush, color: S.color })); } catch { /* 私密瀏覽 */ } }

// 按住 1 秒才觸發（清空），按鈕外圈紅色進度條；沒按滿就放開 → 紅圈閃一下
function hold(btn, fn) {
  let timer = null;
  const stop = flash => {
    const was = timer !== null;
    clearTimeout(timer); timer = null; btn.classList.remove("holding");
    if (flash && was) { btn.classList.remove("flash"); void btn.offsetWidth; btn.classList.add("flash"); setTimeout(() => btn.classList.remove("flash"), 400); }
  };
  btn.addEventListener("pointerdown", e => { e.stopPropagation(); stop(false); btn.classList.add("holding"); timer = setTimeout(() => { stop(false); fn(); }, 1000); });
  for (const t of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(t, () => stop(true));
}

// 對稱份數圖示：N 瓣小花（花瓣夾在對稱軸中間，2 瓣 = 左右兩片翅膀）
function symIcon(n) {
  const rx = Math.max(2.4, Math.min(6.5, 30 / n));
  let s = `<svg viewBox="0 0 40 40" width="48" height="48" aria-hidden="true">`;
  for (let i = 0; i < n; i++) {
    s += `<ellipse cx="20" cy="10" rx="${rx.toFixed(2)}" ry="8.6" fill="${NEON[(i * 3) % NEON.length]}" stroke="#3b2a1a" stroke-width="1.3" transform="rotate(${(i * 360 / n + 180 / n).toFixed(2)} 20 20)"/>`;
  }
  return s + `<circle cx="20" cy="20" r="4.6" fill="#ffd54f" stroke="#3b2a1a" stroke-width="1.4"/></svg>`;
}
// 筆的圖示：深色小螢幕上用真的畫法畫一段波浪（霓虹在白底上看不到光）
function brushIcon(brush, color) {
  const W = 116, H = 72, tg = mk(W, H), tc = mk(W, H), g = tg.getContext("2d"), c = tc.getContext("2d"), I = [[1, 0, 0, 1, 0, 0]];
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push({ x: 16 + (W - 32) * i / 20, y: H / 2 - Math.sin(i / 20 * Math.PI * 2) * H * 0.2 });
  if (brush === "star") pts.forEach((p, i) => { if (i % 4 === 0) starStamp(g, c, I, p.x, p.y, 8 + (i % 8 ? 0 : 2), i, i % 8 ? color : mix(color, "#ffffff", 0.45), 6); });
  else {
    let mid = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const col = brush === "rainbow" ? `hsl(${i * 18},100%,62%)` : color, core = brush === "rainbow" ? `hsl(${i * 18},100%,88%)` : mix(color, "#ffffff", 0.72);
      glowLine(g, c, I, [mid.x, mid.y, a.x, a.y, m.x, m.y], col, core, brush === "rainbow" ? 10 : 7, 9);
      mid = m;
    }
  }
  const out = mk(W, H), o = out.getContext("2d");
  o.fillStyle = "#121747"; o.fillRect(0, 0, W, H);   // 深色小螢幕：霓虹在白底上看不到光
  o.globalCompositeOperation = "lighter"; o.drawImage(tg, 0, 0); o.drawImage(tc, 0, 0);
  tg.width = tg.height = tc.width = tc.height = 0;
  return out;
}
