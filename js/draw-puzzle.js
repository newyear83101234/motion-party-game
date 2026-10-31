// 拼圖：把小孩自己畫的圖切成拼圖塊，拖回底板拼起來。對自己畫的東西最有感情，拼完會想再拼一次＝同一張畫多玩一輪。
// 3～5 歲 4 塊大片、吸附範圍大；6～10 歲 9～12 塊。
// 獨立模組：不 import 任何既有檔（版號會變），聲音、粒子、切畫面都從 deps 傳進來。
// 座標：一律用「桌面」（.pz-table，蓋滿整個畫面）左上角為原點的 CSS px；每塊記「本體」（不含凸起）左上角的位置。
// 切法：每條內部的邊隨機決定凸起往哪邊、形狀小抖動；邊用「底板寬 = 1」的單位存，視窗大小改變時乘上新的寬度就好，形狀不變。

const COUNTS = [4, 6, 9, 12];
const SEEN = "draw-puzzle-seen", PREF = "draw-puzzle-n";
const MAX_SRC = 2048;                       // 圖的內部副本最長邊（iPad 底板約 700 CSS px × DPR 2 就夠）
const PAL = ["#ff6b5b", "#ffc93c", "#4fcf9b", "#4fb3ff", "#a77bff", "#ff7eb6"];
const GAP = 6, KEEP = 16;                   // 散落時塊與塊之間、塊與底板（含虛線框）之間至少留的空
const nextN = n => COUNTS[(COUNTS.indexOf(n) + 1) % COUNTS.length];

// 橫的圖：6 塊＝3 寬 2 高、12 塊＝4 寬 3 高（每塊比較接近正方形）；直的圖反過來
function grid(n, aspect) {
  const [a, b] = { 4: [2, 2], 6: [3, 2], 9: [3, 3], 12: [4, 3] }[n];
  return aspect >= 1 ? { cols: a, rows: b } : { cols: b, rows: a };
}
// 固定種子的亂數：同一個畫面大小、同一個塊數，算出來的底板大小每次都一樣（不會轉個方向就忽大忽小）
const seeded = a => () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hit = (a, b, g = 0) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
function steps(a, b, st) {
  if (b < a) return [];
  const out = [];
  for (let v = a; v < b; v += st) out.push(v);
  out.push(b);   // 最邊邊那一格也要能放
  return out;
}
// 一條邊：起點 + 6 段三次貝茲曲線（肩、脖子、圓頭左半、右半、脖子、肩）＝ 19 個點。
// (u, w)：u 沿著邊、w 往凸起那邊；sg 決定凸起朝哪一邊。脖子比圓頭窄，看起來才像真的拼圖
function edge(ax, ay, dx, dy, nx, ny, L, s) {
  const j = k => (Math.random() * 2 - 1) * k, sg = Math.random() < 0.5 ? 1 : -1;
  const k = j(0.06), m = L / 2 + j(0.06) * s, R = 0.14 * s * (1 + k), n = 0.075 * s * (1 + k), h = 0.165 * s * (1 + k), K = 0.5523;
  const uw = [[0, 0],
    [0.3 * L, j(0.02) * s], [m - n - 0.06 * s, -0.01 * s], [m - n, 0],
    [m - n + 0.01 * s, 0.05 * s], [m - R, h - 0.1 * s], [m - R, h],
    [m - R, h + K * R], [m - K * R, h + R], [m, h + R],
    [m + K * R, h + R], [m + R, h + K * R], [m + R, h],
    [m + R, h - 0.1 * s], [m + n - 0.01 * s, 0.05 * s], [m + n, 0],
    [m + n + 0.06 * s, -0.01 * s], [0.7 * L, j(0.02) * s], [L, 0]];
  const pts = uw.map(([u, w]) => [ax + u * dx + w * nx * sg, ay + u * dy + w * ny * sg]);
  pts.sg = sg; pts.ext = h + R;   // 凸起朝哪邊、凸出去多高（散落時要讓整個凸起都留在畫面裡）
  return pts;
}
function makeCut(cols, rows, aspect) {
  const pw = 1 / cols, ph = 1 / aspect / rows, s = Math.min(pw, ph), h = [], v = [];
  for (let r = 0; r < rows - 1; r++) { h[r] = []; for (let c = 0; c < cols; c++) h[r][c] = edge(c * pw, (r + 1) * ph, 1, 0, 0, 1, pw, s); }
  for (let r = 0; r < rows; r++) { v[r] = []; for (let c = 0; c < cols - 1; c++) v[r][c] = edge((c + 1) * pw, r * ph, 0, 1, 1, 0, ph, s); }
  return { h, v, pw, ph };
}
// 這一塊四邊哪幾邊有往外凸、凸多高（單位：底板寬 = 1）；凹進去的邊是 0
function knobs(cut, c, r) {
  const { h, v } = cut, up = h[r - 1]?.[c], dn = h[r]?.[c], lf = v[r][c - 1], rt = v[r][c];
  return { t: up?.sg < 0 ? up.ext : 0, b: dn?.sg > 0 ? dn.ext : 0, l: lf?.sg < 0 ? lf.ext : 0, r: rt?.sg > 0 ? rt.ext : 0 };
}
function gridSvg(n, aspect) {
  const { cols, rows } = grid(n, aspect);
  let cells = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    cells += `<rect x="${c * 10 + 1}" y="${r * 10 + 1}" width="8.4" height="8.4" rx="2.4" fill="${PAL[(r * 2 + c) % PAL.length]}"/>`;
  return `<svg viewBox="0 0 ${cols * 10 + 0.4} ${rows * 10 + 0.4}" aria-hidden="true">${cells}</svg>`;
}

export function mountPuzzle(deps) {
  const A = deps.A;
  const S = { open: false, ready: false, n: 4, cols: 2, rows: 2, aspect: 1.5, placed: 0, done: false, demo: false, busy: false, B: 0 };

  // ── 畫面 ──
  const root = document.createElement("section");
  root.id = "puzzle"; root.className = "screen";
  root.innerHTML = `
    <div class="pz-table">
      <div class="pz-board"><canvas class="pz-hint"></canvas></div>
      <div class="pz-pieces"></div>
      <div class="pz-over"><canvas class="pz-full"></canvas><i class="pz-flash"></i><i class="pz-shine"></i></div>
      <div class="pz-hand"></div>
      <img class="pz-mascot" src="IMAGE/draw/ui/mascot.png?v=${deps.v}" alt="" draggable="false">
    </div>
    <button id="pzHome" class="big" aria-label="回首頁">🏠</button>
    <div id="pzCount" class="pz-count">${COUNTS.map(n => `<button id="pzN${n}" class="pz-n" data-n="${n}" data-sfx="pick" aria-label="${n} 塊"></button>`).join("")}</div>
    <div class="pz-done">
      <button id="pzAgain" class="big" aria-label="再拼一次"><img class="ico" src="IMAGE/draw/ui/mode-puzzle.png?v=${deps.v}" alt="" draggable="false"><span class="pz-next"></span></button>
      <button id="pzHome2" class="big" aria-label="回首頁">🏠</button>
    </div>`;
  document.body.append(root);
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "css/draw-puzzle.css?v=" + deps.v;
  css.onload = () => relayout();   // CSS 晚到時，按鈕位置、桌面大小第一次量的不準 → 到了再排一次
  document.head.append(css);

  const q = s => root.querySelector(s);
  const table = q(".pz-table"), board = q(".pz-board"), hintC = q(".pz-hint"), layer = q(".pz-pieces"), over = q(".pz-over"),
    fullC = q(".pz-full"), hand = q(".pz-hand"), mascot = q(".pz-mascot"), done = q(".pz-done"), countBar = q("#pzCount"), bHome = q("#pzHome");
  const parts = new deps.Particles(table);
  const hitX = document.createElement("canvas").getContext("2d");   // 只用來判斷手指在不在某一塊的形狀裡
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  let src = null, cut = null, P = [], G = null, drag = null, demoPc = null;
  let zTop = 100, zLow = 1, raf = 0, rz = 0, loadTok = 0, seenMem = false, wantDemo = false, introOn = false, introT = [];
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

  // localStorage 可能被關掉或存了壞資料：讀不到、不在清單裡都當沒有
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 存不了就算了 */ } };
  const prefN = () => { const n = Number(lsGet(PREF)); return COUNTS.includes(n) ? n : 4; };
  const seen = () => seenMem || lsGet(SEEN) != null;

  // ── 排版：先找「所有塊都放得下」的最大底板，再把塊散在四周 ──
  const size = () => { const r = table.getBoundingClientRect(); return { W: r.width, H: r.height, L: r.left, T: r.top }; };
  // 上方左右兩組按鈕的範圍：塊不能散在按鈕底下
  function zones() {
    const t = table.getBoundingClientRect();
    return [bHome, countBar].map(el => { const r = el.getBoundingClientRect(); return { x: r.left - t.left - 8, y: r.top - t.top - 8, w: r.width + 16, h: r.height + 16 }; });
  }
  function geom(B, W, H, zs) {
    const top = Math.max(0, ...zs.map(z => z.y + z.h)), Bh = B / S.aspect, pw = B / S.cols, ph = Bh / S.rows, s = Math.min(pw, ph);
    const by = Math.max(top + 8, Math.min(H - Bh - 10, (H - Bh) / 2));
    return { W, H, top, zones: zs, B, Bh, bx: (W - B) / 2, by, pw, ph, s, pad: Math.ceil(0.34 * s + 4) };
  }
  // 一塊在畫面上佔的方框＝本體＋真的有凸出去的那幾邊（再加白邊、肩膀抖動的一點點）
  const ext = (g, k) => { const m = 0.025 * g.s + 3; return { l: k.l * g.B + m, t: k.t * g.B + m, r: k.r * g.B + m, b: k.b * g.B + m }; };
  const rectAt = (g, k, x, y) => { const e = ext(g, k); return { x: x - e.l, y: y - e.t, w: g.pw + e.l + e.r, h: g.ph + e.t + e.b }; };
  // 散落：每塊的方框（含凸起）之間不重疊（全部看得到）、不碰底板（strict）、不出畫面、不在按鈕底下。
  // 候選位置是一張格子；越靠近底板越優先（塊圍在底板四周，手指不用拖太遠），再加一點亂數才像隨手撒的。
  // items：每塊的凸起（knobs）；回傳每塊本體左上角，順序跟 items 一樣（放的先後是亂的）
  function scatter(g, items, rnd, fixed = [], strict = true) {
    const M = 6, st = Math.max(8, Math.min(g.pw, g.ph) / 5), noise = 0.8 * Math.min(g.pw, g.ph);
    const keep = strict ? { x: g.bx - KEEP, y: g.by - KEEP, w: g.B + 2 * KEEP, h: g.Bh + 2 * KEEP }
      : { x: g.bx + g.B * 0.22, y: g.by + g.Bh * 0.22, w: g.B * 0.56, h: g.Bh * 0.56 };   // 放不下時：可以壓到底板邊，但不准蓋正中間
    const order = items.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const placed = fixed.slice(), out = [];
    for (const i of order) {
      const e = ext(g, items[i]), w = g.pw + e.l + e.r, h = g.ph + e.t + e.b;
      let best = null, bs = Infinity;
      for (const x of steps(M, g.W - M - w, st)) for (const y of steps(M, g.H - M - h, st)) {
        const r = { x, y, w, h };
        if (hit(r, keep) || g.zones.some(z => hit(r, z)) || placed.some(p => hit(r, p, GAP))) continue;
        const dx = Math.max(g.bx - (x + w), x - (g.bx + g.B), 0), dy = Math.max(g.by - (y + h), y - (g.by + g.Bh), 0);
        const sc = Math.hypot(dx, dy) + rnd() * noise;
        if (sc < bs) { bs = sc; best = r; }
      }
      if (!best) return null;
      placed.push(best); out[i] = { x: best.x + e.l, y: best.y + e.t };
    }
    return out;
  }
  // 底板從大往小試（每次縮 5%），第一個「全部塊都散得下」的就是答案；用固定種子，同樣大小的畫面結果一樣
  function fit(W, H) {
    const zs = zones(), top = Math.max(0, ...zs.map(z => z.y + z.h)), items = P.map(p => p.knobs);
    const minB = Math.max(120, W * 0.26);
    for (let B = Math.min(W * 0.7, (H - top - 18) * S.aspect); B >= minB; B *= 0.95) {
      const g = geom(B, W, H, zs), rnd = seeded(S.n * 1013 + Math.round(B));
      // 先算面積：塊的方框加起來比空地還大，一定放不下，不用試
      const need = items.reduce((t, k) => { const r = rectAt(g, k, 0, 0); return t + (r.w + GAP) * (r.h + GAP); }, 0);
      const free = W * H - (g.B + 2 * KEEP) * (g.Bh + 2 * KEEP) - zs.reduce((t, z) => t + z.w * z.h, 0);
      if (need > free * 0.8) continue;
      for (let a = 0; a < 6; a++) { const pos = scatter(g, items, rnd); if (pos) return { g, pos }; }
    }
    // 畫面太小（不太會發生）：底板用最小，塊可以壓到底板邊；還是放不下就隨便放在畫面裡
    const g = geom(minB, W, H, zs);
    const pos = scatter(g, items, Math.random, [], false) ||
      items.map(() => ({ x: 6 + Math.random() * Math.max(0, W - g.pw - 12), y: g.top + Math.random() * Math.max(0, H - g.top - g.ph - 6) }));
    return { g, pos };
  }

  // ── 拼圖塊 ──
  const target = pc => [G.bx + pc.c * G.pw, G.by + pc.r * G.ph];
  const rectOf = pc => rectAt(G, pc.knobs, pc.x, pc.y);
  // 位置分兩件事：資料（x, y、底板相對位置 rx, ry）和畫面（transform）。開場動畫時畫面先停在拼好的位置、資料已經是散開的位置
  function paintAt(pc, x, y) { pc.el.style.transform = `translate3d(${x - G.pad}px, ${y - G.pad}px, 0)`; }
  function place(pc, x, y) {
    pc.x = x; pc.y = y;
    if (!pc.ok) { pc.rx = (x - G.bx) / G.B; pc.ry = (y - G.by) / G.B; }   // 視窗大小改變時，沒拼好的塊照這個比例放回去
    paintAt(pc, x, y);
  }
  // 形狀：底板座標（px），本體在 (c×塊寬, r×塊高)；共用的邊兩塊用同一組點（一塊正著走、一塊倒著走），所以剛好咬合
  function piecePath(c, r) {
    const B = G.B, p = new Path2D(), x0 = c * cut.pw, y0 = r * cut.ph, x1 = x0 + cut.pw, y1 = y0 + cut.ph;
    const add = pts => { for (let i = 1; i < pts.length; i += 3) p.bezierCurveTo(pts[i][0] * B, pts[i][1] * B, pts[i + 1][0] * B, pts[i + 1][1] * B, pts[i + 2][0] * B, pts[i + 2][1] * B); };
    p.moveTo(x0 * B, y0 * B);
    if (r === 0) p.lineTo(x1 * B, y0 * B); else add(cut.h[r - 1][c]);
    if (c === S.cols - 1) p.lineTo(x1 * B, y1 * B); else add(cut.v[r][c]);
    if (r === S.rows - 1) p.lineTo(x0 * B, y1 * B); else add(cut.h[r][c].slice().reverse());
    if (c > 0) add(cut.v[r][c - 1].slice().reverse());
    p.closePath();
    return p;
  }
  function drawPiece(pc) {
    const { pw, ph, pad, s } = G, el = pc.el, k = dpr();
    const cw = Math.ceil(pw + 2 * pad), ch = Math.ceil(ph + 2 * pad);
    el.width = Math.round(cw * k); el.height = Math.round(ch * k);
    el.style.width = cw + "px"; el.style.height = ch + "px";
    el.style.transformOrigin = `${pad + pw / 2}px ${pad + ph / 2}px`;   // 拿起來放大時以本體中心為準
    const x = el.getContext("2d"), path = pc.path, lw = Math.max(3, s * 0.035);
    x.setTransform(el.width / cw, 0, 0, el.height / ch, 0, 0);
    x.translate(pad - pc.c * pw, pad - pc.r * ph);
    x.save();
    x.clip(path);
    x.fillStyle = "#fff"; x.fill(path);
    x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, G.B, G.Bh);
    // 立體感：形狀往右下挪一點畫亮線 → 只剩左上內緣亮；往左上挪畫暗線 → 右下內緣暗
    x.lineWidth = lw * 2; x.lineJoin = "round";
    x.translate(lw * 0.7, lw * 0.7); x.strokeStyle = "rgba(255, 255, 255, .5)"; x.stroke(path);
    x.translate(-lw * 1.4, -lw * 1.4); x.strokeStyle = "rgba(70, 35, 5, .22)"; x.stroke(path);
    x.restore();
    x.lineWidth = Math.max(2, s * 0.02); x.strokeStyle = "#fff"; x.lineJoin = "round"; x.stroke(path);
  }
  function paintFull(c) {
    const k = dpr();
    c.width = Math.round(G.B * k); c.height = Math.round(G.Bh * k);
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, c.width, c.height);
  }
  function applyGeom() {
    const g = G;
    for (const el of [board, over]) Object.assign(el.style, { left: g.bx + "px", top: g.by + "px", width: g.B + "px", height: g.Bh + "px" });
    S.B = g.B;
    paintFull(hintC);
    if (S.done) paintFull(fullC);
    for (const pc of P) { pc.path = piecePath(pc.c, pc.r); drawPiece(pc); }
    for (const pc of P) if (pc.ok) { pc.el.classList.remove("glide"); const [x, y] = target(pc); place(pc, x, y); }
    // 吉祥物站在底板左下（左邊空間夠就置中在左邊空白處）
    const mh = Math.round(Math.max(140, Math.min(240, g.H * 0.28)));
    mascot.style.height = mh + "px";
    mascot.style.left = Math.max(-mh * 0.12, g.bx / 2 - mh / 2) + "px";
    // 拼完的兩顆大按鈕：底板下面放得下就放下面，不然放右邊，都不行就壓在畫面最下面
    const below = g.H - (g.by + g.Bh), right = g.W - (g.bx + g.B);
    const [lx, ly, col] = below >= 150 ? [g.bx + g.B / 2, g.by + g.Bh + below / 2, false]
      : right >= 150 ? [g.bx + g.B + right / 2, g.by + g.Bh / 2, true] : [g.W / 2, g.H - 80, false];
    Object.assign(done.style, { left: lx + "px", top: ly + "px" });
    done.classList.toggle("col", col);
    parts.fit();
  }
  function renderIcons() {
    for (const b of countBar.children) { b.innerHTML = gridSvg(+b.dataset.n, S.aspect); b.classList.toggle("on", +b.dataset.n === S.n); }
    q(".pz-next").innerHTML = gridSvg(nextN(S.n), S.aspect);
  }

  // 重新洗牌：新的切法、新的散法。開場：先停在拼好的樣子（看得出是自己的畫）→ 一下子散開飛到四周
  function build(n) {
    clearTimers(); stopDemo(); endDrag(); cancelIntro();
    S.n = n; Object.assign(S, grid(n, S.aspect), { placed: 0, done: false });
    lsSet(PREF, String(n));
    root.classList.remove("won"); done.classList.remove("on");
    table.querySelectorAll(".pz-confetti").forEach(el => el.remove());
    renderIcons();
    cut = makeCut(S.cols, S.rows, S.aspect);
    layer.textContent = ""; P = []; zTop = 100; zLow = 1;
    for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.cols; c++) {
      const el = document.createElement("canvas");
      el.className = "pz-pc"; el.dataset.i = P.length;
      layer.append(el);
      P.push({ i: P.length, c, r, el, ok: false, x: 0, y: 0, rx: 0, ry: 0, path: null, knobs: knobs(cut, c, r) });
    }
    const { W, H } = size(), f = fit(W, H);
    G = f.g; applyGeom();
    let pos = null;
    for (let a = 0; a < 12 && !pos; a++) pos = scatter(G, P.map(p => p.knobs), Math.random);   // 同樣大小的底板，換真的亂數再撒一次（每次都不一樣）
    pos = pos || f.pos;
    P.forEach((pc, k) => { pc.el.style.zIndex = ++zTop; place(pc, pos[k].x, pos[k].y); const [tx, ty] = target(pc); paintAt(pc, tx, ty); });
    S.busy = introOn = true;
    introT = [setTimeout(() => {
      A.sfx("pop");
      P.forEach((pc, k) => { pc.el.classList.add("fly"); pc.el.style.transitionDelay = k * 30 + "ms"; paintAt(pc, pc.x, pc.y); });
      introT.push(setTimeout(() => introDone(), 680 + 30 * n));
    }, 450)];
  }
  function cancelIntro() { introT.forEach(clearTimeout); introT = []; introOn = false; S.busy = false; }
  function introDone(fast) {
    if (!introOn) return;
    cancelIntro();
    for (const pc of P) { pc.el.classList.remove("fly"); pc.el.style.transitionDelay = ""; paintAt(pc, pc.x, pc.y); }
    if (wantDemo) { wantDemo = false; later(fast ? 200 : 450, startDemo); }
  }

  // ── 手指拖 ──
  function local(e) { const t = table.getBoundingClientRect(); return [e.clientX - t.left, e.clientY - t.top]; }
  // 找手指下面最上層、還沒拼好的那一塊：先照真正的形狀找（凸起、凹槽都算數），找不到再放寬 14px（小手指常常按在邊邊）
  function pick(lx, ly) {
    const loose = P.filter(p => !p.ok).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex);
    const at = pc => [lx - pc.x + pc.c * G.pw, ly - pc.y + pc.r * G.ph];
    for (const pc of loose) if (hitX.isPointInPath(pc.path, ...at(pc))) return pc;
    hitX.lineWidth = 28;
    for (const pc of loose) if (hitX.isPointInStroke(pc.path, ...at(pc))) return pc;
    return null;
  }
  function lift(pc) { pc.el.classList.remove("glide"); pc.el.classList.add("up"); pc.el.style.zIndex = ++zTop; }
  function endDrag() { if (!drag) return; drag.pc.el.classList.remove("up"); drag = null; }
  table.addEventListener("pointerdown", e => {
    if (!e.isPrimary || drag || !S.open || !S.ready) return;   // 只認第一根手指；第二根（手掌）不理
    if (S.demo) stopDemo();                                     // 示範到一半手指一碰：示範停、換小孩自己來
    if (S.busy || S.done) return;
    const [lx, ly] = local(e), pc = pick(lx, ly);
    if (!pc) return;
    e.preventDefault();
    try { table.setPointerCapture(e.pointerId); } catch { /* 合成事件沒有真的指標，抓不住也沒關係 */ }
    drag = { id: e.pointerId, pc, ox: lx - pc.x, oy: ly - pc.y };
    lift(pc);
    A.sfx("tap", { gain: 0.5 });
  });
  table.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const [lx, ly] = local(e), pc = drag.pc;
    // 本體至少八成留在畫面裡，拖不丟
    place(pc, Math.max(-G.pw * 0.2, Math.min(G.W - G.pw * 0.8, lx - drag.ox)), Math.max(-G.ph * 0.2, Math.min(G.H - G.ph * 0.8, ly - drag.oy)));
  });
  const up = e => { if (!drag || e.pointerId !== drag.id) return; const pc = drag.pc; drag = null; drop(pc); };
  table.addEventListener("pointerup", up);
  table.addEventListener("pointercancel", up);
  function drop(pc) {
    pc.el.classList.remove("up");
    const [tx, ty] = target(pc);
    if (Math.hypot(pc.x - tx, pc.y - ty) <= (S.n <= 6 ? 60 : 36)) return snap(pc);
    // 不在範圍內就留在原地（不彈回去、不懲罰）；只有放到上方按鈕底下會被蓋住時，往下挪到按鈕下面
    const z = G.zones.find(z => hit(rectOf(pc), z));
    if (z) { pc.el.classList.add("glide"); place(pc, pc.x, z.y + z.h + ext(G, pc.knobs).t + 2); }
  }
  function snap(pc) {
    if (pc.ok) return;
    const [tx, ty] = target(pc), t = table.getBoundingClientRect();
    pc.ok = true; S.placed++;
    pc.el.classList.remove("up");
    pc.el.classList.add("ok", "glide");
    pc.el.style.zIndex = ++zLow;   // 拼好的永遠在沒拼好的下面：拖著別塊經過時不會被擋住
    place(pc, tx, ty);
    A.sfx("sticker");
    parts.stars(t.left + tx + G.pw / 2, t.top + ty + G.ph / 2, Math.min(G.pw, G.ph));
    if (S.placed === S.n) later(280, finish);
  }

  // ── 拼完：提示淡出、整張圖閃一下、吉祥物跳出來、彩帶；2 秒後兩顆大按鈕 ──
  function finish() {
    if (S.done) return;
    S.done = true;
    paintFull(fullC);   // 蓋一張完整的圖在上面：接縫不見，又變回「我的畫」
    root.classList.add("won");
    A.sfx("finish");
    const t = table.getBoundingClientRect(), bx = t.left + G.bx, by = t.top + G.by;
    parts.stars(bx + G.B / 2, by + G.Bh / 2, Math.min(G.B, G.Bh) * 0.9);
    [0.15, 0.5, 0.85].forEach((u, k) => later(150 + k * 170, () => parts.splash(bx + G.B * u, by + G.Bh * 0.25, null)));
    confetti();
    later(2000, () => done.classList.add("on"));
  }
  function confetti() {
    const box = document.createElement("div");
    box.className = "pz-confetti";
    let h = "";
    for (let i = 0; i < 46; i++) {
      const w = 8 + Math.random() * 8;
      h += `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--c:${PAL[i % PAL.length]};--d:${(Math.random() * 0.7).toFixed(2)}s;--t:${(1.9 + Math.random() * 1.3).toFixed(2)}s;` +
        `--r:${Math.round(Math.random() * 900 - 450)}deg;--sx:${Math.round(Math.random() * 120 - 60)}px;--w:${w.toFixed(1)}px"></i>`;
    }
    box.innerHTML = h;
    table.append(box);
    later(4000, () => box.remove());
  }

  // ── 第一次玩：一隻看不見的手把一塊慢慢拖到正確位置 ──
  function startDemo() {
    if (!S.open || S.done || S.busy || drag || S.demo) return;
    const loose = P.filter(p => !p.ok);
    if (!loose.length) return;
    seenMem = true; lsSet(SEEN, "1");   // 開始示範就算看過（中途被打斷也不會再來一次）
    const dist = pc => { const [tx, ty] = target(pc); return Math.hypot(pc.x - tx, pc.y - ty); };
    const pc = loose.reduce((a, b) => dist(a) <= dist(b) ? a : b);   // 離自己位置最近的一塊：路最短、最好懂
    const ctr = () => [pc.x + G.pw / 2, pc.y + G.ph / 2];
    S.demo = true; demoPc = pc;
    moveHand(...ctr());
    hand.classList.add("on", "press");
    later(800, () => {
      if (!S.demo) return;
      hand.classList.remove("press");
      lift(pc);
      const [x0, y0] = [pc.x, pc.y], [tx, ty] = target(pc), t0 = performance.now(), D = 1600;
      const step = now => {
        if (!S.demo) return;
        const u = Math.max(0, Math.min(1, (now - t0) / D)), k = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
        place(pc, x0 + (tx - x0) * k, y0 + (ty - y0) * k);
        moveHand(...ctr());
        if (u < 1) { raf = requestAnimationFrame(step); return; }
        S.demo = false; demoPc = null;
        snap(pc);
        later(450, () => hand.classList.remove("on"));
      };
      raf = requestAnimationFrame(step);
    });
  }
  function stopDemo() {
    if (!S.demo) return;
    S.demo = false; cancelAnimationFrame(raf);
    if (demoPc) { demoPc.el.classList.remove("up"); demoPc = null; }
    hand.classList.remove("on", "press");
  }
  function moveHand(x, y) { hand.style.transform = `translate(${x}px, ${y}px)`; }

  // ── 視窗大小改變：底板重算；拼好的貼回正確位置，沒拼好的照底板比例放回去，放不下的再找空位 ──
  function relayout() {
    if (!S.open || !S.ready || !G) return;
    endDrag(); stopDemo();
    if (introOn) introDone(true);
    const { W, H } = size();
    if (!W || !H) return;
    G = fit(W, H).g; applyGeom();
    const kept = [], bad = [];
    for (const pc of P) {
      if (pc.ok) continue;
      pc.el.classList.remove("glide");
      const x = G.bx + pc.rx * G.B, y = G.by + pc.ry * G.B, r = rectAt(G, pc.knobs, x, y);
      if (r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H && !G.zones.some(z => hit(r, z))) { place(pc, x, y); kept.push(r); } else bad.push(pc);
    }
    if (bad.length) {
      const ks = bad.map(p => p.knobs), pos = scatter(G, ks, Math.random, kept) || scatter(G, ks, Math.random, kept, false);
      bad.forEach((pc, i) => {
        const p = pos ? pos[i] : { x: Math.max(6, Math.min(W - G.pw - 6, G.bx + pc.rx * G.B)), y: Math.max(G.top, Math.min(H - G.ph - 6, G.by + pc.ry * G.B)) };
        place(pc, p.x, p.y);
      });
    }
  }
  window.addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(relayout); });

  // ── 按鈕 ──
  const goHome = () => { close(); deps.onHome(); };
  bHome.onclick = goHome;
  q("#pzHome2").onclick = goHome;
  q("#pzAgain").onclick = () => { if (S.ready) build(nextN(S.n)); };
  for (const b of countBar.children) b.onclick = () => {
    const n = +b.dataset.n;
    if (!S.ready) { S.n = n; lsSet(PREF, String(n)); renderIcons(); return; }
    if (n === S.n && !S.done) {   // 點目前這個：不洗牌（拼到一半不會不小心全散掉），只跳一下
      b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge");
      return;
    }
    build(n);
  };

  // ── 對外 ──
  async function toCanvas(s) {
    let img = s;
    if (typeof s === "string") {
      img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = s; });
    }
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("空的圖");
    // 自己複製一份：呼叫的人之後改、清、回收（blob 網址）都不影響拼圖
    const k = Math.min(1, MAX_SRC / Math.max(w, h)), c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);   // 透明的地方墊白，拼圖塊才不會破洞
    x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  async function open(source, { pieces } = {}) {
    close();
    S.open = true; S.ready = false;
    deps.show("puzzle");
    const first = !seen();
    S.n = COUNTS.includes(pieces) ? pieces : first ? 4 : prefN();
    wantDemo = first;
    const tok = ++loadTok;
    let c = null;
    try { c = await toCanvas(source); } catch { c = null; }
    if (tok !== loadTok || !S.open) return;   // 圖還沒載完就又開了別張、或已經離開
    if (!c) { deps.toast("😢", 1500); goHome(); return; }
    src = c; S.aspect = c.width / c.height; S.ready = true;
    build(S.n);
  }
  function close() {
    clearTimers(); stopDemo(); endDrag(); cancelIntro();
    cancelAnimationFrame(raf);
    hand.classList.remove("on", "press");
    S.open = false; loadTok++;
  }

  window.__puzzle = {
    state: S,
    solve(n = S.n) {   // 直接把前 n 塊（還沒拼好的）放好
      if (!S.ready) return;
      if (introOn) introDone(true);
      stopDemo(); endDrag();
      P.filter(p => !p.ok).slice(0, n).forEach(snap);
    },
    pieces() {   // 每塊的本體左上角（螢幕座標）、正確位置、大小
      const t = table.getBoundingClientRect();
      return P.map(pc => { const [tx, ty] = target(pc); return { i: pc.i, col: pc.c, row: pc.r, x: t.left + pc.x, y: t.top + pc.y, tx: t.left + tx, ty: t.top + ty,
        w: G.pw, h: G.ph, pad: G.pad, ok: pc.ok, up: pc.el.classList.contains("up"), z: +pc.el.style.zIndex }; });
    },
    board() { const t = table.getBoundingClientRect(); return G && { x: t.left + G.bx, y: t.top + G.by, w: G.B, h: G.Bh }; },
    // 抽樣底板上 k 個點，數每個點被幾塊的形狀蓋到：切法正確時每個點剛好 1 塊（沒有縫、沒有重疊）
    cover(k = 3000) {
      const o = { zero: 0, one: 0, multi: 0 };
      for (let i = 0; i < k; i++) {
        const x = Math.random() * G.B, y = Math.random() * G.Bh;
        let c = 0;
        for (const pc of P) if (hitX.isPointInPath(pc.path, x, y)) c++;
        o[c === 0 ? "zero" : c === 1 ? "one" : "multi"]++;
      }
      return o;
    },
  };
  return { open, close, el: root };
}
