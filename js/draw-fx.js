// 畫畫遊戲特效：填色水波、亮粉閃爍、完成動畫（跳一下＋零件動作＋彩帶）。全部沒有聲音
import { regionAt, regionMask } from "./draw-core.js?v=13";
import { makeCanvas as mk } from "./draw-canvas.js?v=13";

export class Fx {
  constructor(board) { this.b = board; this.pending = null; this.sparkOn = false; this.parts = []; this.cells = []; }

  // 填色水波：f = painter.fill() 的回傳值；顏料從 (px, py) 圓形擴散，ms 毫秒後合進顏色層
  ripple(f, px, py, ms = 400) {
    this.flush();
    const F = this.b.fctx, c = f.canvas;
    const R = Math.max(...[[f.x, f.y], [f.x + c.width, f.y], [f.x, f.y + c.height], [f.x + c.width, f.y + c.height]]
      .map(([x, y]) => Math.hypot(x - px, y - py)));
    const job = { f, done: false }, t0 = performance.now();
    this.pending = job;
    const step = now => {
      if (job.done) return;
      const t = Math.min(1, (now - t0) / ms), e = 1 - (1 - t) ** 3;
      F.clearRect(f.x, f.y, c.width, c.height);
      F.save(); F.beginPath(); F.arc(px, py, Math.max(1, R * e), 0, Math.PI * 2); F.clip();
      F.drawImage(c, f.x, f.y); F.restore();
      if (t < 1) requestAnimationFrame(step); else this.flush();
    };
    requestAnimationFrame(step);
  }
  // 動畫還沒跑完就有新動作：立刻把這一筆合進顏色層
  flush() {
    const job = this.pending;
    if (!job || job.done) return;
    job.done = true; this.pending = null;
    this.b.fctx.clearRect(job.f.x, job.f.y, job.f.canvas.width, job.f.canvas.height);
    job.f.done();
  }

  // 亮粉閃爍：每秒看一次亮粉遮罩（縮小 16 倍），在有亮粉的格子隨機冒出小星光
  sparkleStart() {
    if (this.sparkOn) return;
    this.sparkOn = true; this.lastScan = 0;
    const loop = now => {
      if (!this.sparkOn) return;
      requestAnimationFrame(loop);              // 先排好下一格：這一格就算出錯，閃爍也不會永遠停掉
      const F = this.b.fctx;
      if (!F || !this.b.glit) return;           // 線稿還沒載入好（一進畫畫頁就會開始跑）
      if (now - this.lastScan > 1000) { this.scan(); this.lastScan = now; }
      for (const s of this.parts) F.clearRect(s.x - s.r - 2, s.y - s.r - 2, s.r * 2 + 4, s.r * 2 + 4);
      this.parts = this.parts.filter(s => now - s.t0 < 700);
      if (this.cells.length && this.parts.length < 24 && Math.random() < 0.5) {
        const [cx, cy] = this.cells[(Math.random() * this.cells.length) | 0];
        this.parts.push({ x: cx + Math.random() * 16, y: cy + Math.random() * 16, r: 8 + Math.random() * 10, t0: now });
      }
      for (const s of this.parts) { const a = Math.sin((now - s.t0) / 700 * Math.PI); spark(F, s.x, s.y, s.r * (0.6 + a * 0.4), a); }
    };
    requestAnimationFrame(loop);
  }
  sparkleStop() {
    this.sparkOn = false;
    for (const s of this.parts) this.b.fctx.clearRect(s.x - s.r - 2, s.y - s.r - 2, s.r * 2 + 4, s.r * 2 + 4);
    this.parts = [];
  }
  scan() {
    const b = this.b, G = 16, w = Math.ceil(b.W / G), h = Math.ceil(b.H / G);
    if (!this.small || this.small.width !== w) { this.small = mk(w, h); this.smx = this.small.getContext("2d", { willReadFrequently: true }); }
    this.smx.clearRect(0, 0, w, h); this.smx.drawImage(b.glit, 0, 0, w, h);
    const d = this.smx.getImageData(0, 0, w, h).data;
    this.cells = [];
    for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 128) this.cells.push([(i % w) * G, ((i / w) | 0) * G]);
  }

  // 完成動畫：約 2.2 秒，播完回傳（Promise）。parts = 這張線稿的零件設定
  finish(parts = []) {
    this.flush();
    const b = this.b, comp = b.composite();
    const P = parts.map(pt => this.cutPart(comp, pt)).filter(Boolean);
    const r = b.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const ov = mk(Math.round(r.width * dpr), Math.round(r.height * dpr));
    ov.className = "finish-ov";
    b.stage.appendChild(ov);
    const o = b.origin(r), O = ov.getContext("2d"), k = o.k * dpr;   // 跟畫布上那張紙同一個位置、大小（四周留邊）
    const ox = o.x * dpr, oy = o.y * dpr;
    const conf = [];
    let burst = false;
    return new Promise(resolve => {
      let over = false;
      // 收尾只生效一次：移除疊加層、釋放畫布、結束 Promise（正常播完、出錯、保險計時都走這裡）
      const done = () => {
        if (over) return;
        over = true; this.finishing = false; this.skipFinish = () => {};
        ov.remove(); comp.width = comp.height = 0; ov.width = ov.height = 0;
        resolve();
      };
      this.finishing = true;
      this.skipFinish = () => { if (performance.now() - t0 > 1000) done(); };   // 點畫面快轉：至少跳 1 秒
      const t0 = performance.now();
      setTimeout(() => { if (ov.isConnected) done(); }, 5000);   // 保險：5 秒後疊加層還在 → 強制收掉
      const frame = now => {
        if (over) return;
        try {
        const s = (now - t0) / 1000, h = hop(s);
        O.clearRect(0, 0, ov.width, ov.height);
        O.save();
        O.translate(ox + b.W * k / 2, oy + b.H * k * (1 + h.dy));
        O.scale(h.sx * k, h.sy * k);
        O.translate(-b.W / 2, -b.H);
        O.beginPath(); O.rect(0, 0, b.W, b.H); O.clip();   // 擺動的零件（貼邊的煙、旗子）不要畫到圖片外面
        O.drawImage(comp, 0, 0);
        for (const q of P) drawPart(O, q, s);
        O.restore();
        if (s > 0.65 && !burst) { burst = true; for (let i = 0; i < 90; i++) conf.push(confetti(ov.width, dpr)); }
        for (const c of conf) {
          c.vy += 0.35 * dpr; c.x += c.vx; c.y += c.vy; c.a += c.va;
          O.save(); O.translate(c.x, c.y); O.rotate(c.a); O.fillStyle = c.col; O.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); O.restore();
        }
        if (s < 2.2) requestAnimationFrame(frame); else done();
        } catch (e) { console.warn("完成動畫出錯：" + (e && e.message)); done(); }
      };
      requestAnimationFrame(frame);
    });
  }

  // 找出零件那幾塊：`at` 是落在零件裡的座標點；`box: [x0, y0, x1, y1]` 是「整塊都在這個框裡的全部選進來」（有輻條的輪子用）
  // 眨眼只要位置和周圍顏色；會轉、會擺的要切出圖（含外框線）和補洞用的底色
  cutPart(comp, pt) {
    const b = this.b;
    const fromAt = (pt.at || []).map(([x, y]) => regionAt(b.labels, b.W, b.H, x, y));
    const fromBox = pt.box ? b.boxes.map((r, id) => (r.x0 >= pt.box[0] && r.y0 >= pt.box[1] && r.x1 <= pt.box[2] && r.y1 <= pt.box[3] ? id : -1)) : [];
    // 背景（佔整張三成以上的大塊）永遠不能當零件：座標點不小心點到背景，會把整張背景拿去轉
    const big = b.W * b.H * 0.3;
    const ids = [...new Set([...fromAt, ...fromBox].filter(id => id >= 0 && b.boxes[id].area < big))];
    if (!ids.length) return null;
    const ms = ids.map(id => regionMask(b.labels, b.W, b.H, id, b.boxes[id], pt.type === "blink" ? 0 : 24));
    const x0 = Math.min(...ms.map(m => m.x)), y0 = Math.min(...ms.map(m => m.y));
    const w = Math.max(...ms.map(m => m.x + m.w)) - x0, h = Math.max(...ms.map(m => m.y + m.h)) - y0;
    const fill = surround(comp, x0, y0, w, h);
    if (pt.type === "blink") return { type: "blink", cx: x0 + w / 2, cy: y0 + h / 2, rx: w / 2 + 8, ry: h / 2 + 8, fill };
    const shape = mk(w, h), sx = shape.getContext("2d"), img = sx.createImageData(w, h);
    for (const m of ms) for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++)
      if (m.data[j * m.w + i]) img.data[((m.y - y0 + j) * w + (m.x - x0 + i)) * 4 + 3] = 255;
    sx.putImageData(img, 0, 0);
    const part = mk(w, h), px = part.getContext("2d");
    px.drawImage(shape, 0, 0); px.globalCompositeOperation = "source-in"; px.drawImage(comp, x0, y0, w, h, 0, 0, w, h);
    // 補洞再往外擴 HP 像素，蓋掉黑線外緣的抗鋸齒淡灰（它們不算線，所以不在零件遮罩裡）
    // 洞裡每個點補「離它最近的、洞外的彩色點」的顏色：旁邊是機頭就補機頭色、是天空就補天空色，比整塊同一色自然
    const HP = 3, hole = mk(w + HP * 2, h + HP * 2), hx = hole.getContext("2d", { willReadFrequently: true });
    for (let dy = -HP; dy <= HP; dy += HP) for (let dx = -HP; dx <= HP; dx += HP) hx.drawImage(shape, HP + dx, HP + dy);
    inpaint(b.color, hx, x0 - HP, y0 - HP, fill);   // 從「顏色層」取色：它沒有黑線，補出來不會沾到線邊的灰色
    const [cx, cy] = pt.pivot || [x0 + w / 2, y0 + h / 2];
    return { type: pt.type, deg: pt.deg || 12, speed: pt.speed || 1, x: x0, y: y0, img: part, hole, px: cx, py: cy };
  }
}

// 跳一下：sx/sy = 水平／垂直縮放，dy = 往上位移（畫面高度的比例，負數往上）
function hop(s) {
  const ease = t => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;
  if (s < 0.25) { const e = ease(s / 0.25); return { sx: 1 + 0.06 * e, sy: 1 - 0.1 * e, dy: 0 }; }
  if (s < 0.65) { const u = (s - 0.25) / 0.4, e = ease(u * 3); return { sx: 1.06 - 0.09 * e, sy: 0.9 + 0.15 * e, dy: -0.12 * Math.sin(Math.PI * u) }; }
  if (s < 0.85) { const e = ease((s - 0.65) / 0.2); return { sx: 1.06 - 0.06 * e, sy: 0.9 + 0.1 * e, dy: 0 }; }
  if (s < 1.2) return { sx: 1, sy: 1, dy: -0.025 * Math.sin(Math.PI * (s - 0.85) / 0.35) };
  return { sx: 1, sy: 1, dy: 0 };
}

function drawPart(O, q, s) {
  if (q.type === "blink") {
    if (!((s > 0.3 && s < 0.46) || (s > 1.3 && s < 1.46))) return;
    O.save();
    O.fillStyle = q.fill; O.beginPath(); O.ellipse(q.cx, q.cy, q.rx, q.ry, 0, 0, Math.PI * 2); O.fill();
    O.strokeStyle = "#000"; O.lineCap = "round"; O.lineWidth = Math.max(6, q.ry * 0.22);
    O.beginPath(); O.moveTo(q.cx - q.rx * 0.8, q.cy); O.quadraticCurveTo(q.cx, q.cy + q.ry * 0.5, q.cx + q.rx * 0.8, q.cy); O.stroke();
    O.restore();
    return;
  }
  // spin = 輪子（整圈轉、不補洞）；rotor = 螺旋槳、太陽光芒（整圈轉、要補洞，speed = 每秒幾圈）；wag 快擺、sway 慢擺
  const a = q.type === "spin" ? s * Math.PI * 2 : q.type === "rotor" ? s * Math.PI * 2 * q.speed
    : Math.sin(s * Math.PI * (q.type === "wag" ? 6 : 4)) * q.deg * Math.PI / 180;
  O.save();
  // 會轉的零件（輪子）轉來轉去都蓋在原位，不用補洞；補了反而會在邊緣多出一圈底色
  if (q.type !== "spin") O.drawImage(q.hole, q.x - (q.hole.width - q.img.width) / 2, q.y - (q.hole.height - q.img.height) / 2);
  O.translate(q.px, q.py); O.rotate(a); O.translate(-q.px, -q.py);
  O.drawImage(q.img, q.x, q.y);
  O.restore();
}

// 補洞：hx 畫布上不透明的地方＝洞（左上角在原圖 ox, oy）。洞外一圈 32px 裡的點當顏色來源（src 用顏色層，沒有黑線），
// 從洞的邊緣一圈一圈往裡補，每個點取「周圍 8 格已經有顏色的點」的平均（像剝洋蔥），顏色會自然延伸、不會拉出條紋；
// 整個洞被黑線包住、沒有來源時用 fallback 色
function inpaint(comp, hx, ox, oy, fallback) {
  const hw = hx.canvas.width, hh = hx.canvas.height, M = 32;
  const sx = Math.max(0, ox - M), sy = Math.max(0, oy - M);
  const ex = Math.min(comp.width, ox + hw + M), ey = Math.min(comp.height, oy + hh + M), cw = ex - sx, ch = ey - sy;
  const src = comp.getContext("2d").getImageData(sx, sy, cw, ch).data, mask = hx.getImageData(0, 0, hw, hh), md = mask.data;
  const N = cw * ch, hole = new Uint8Array(N), ok = new Uint8Array(N), R = new Float32Array(N), Gc = new Float32Array(N), B = new Float32Array(N);
  for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) {
    const X = ox + i - sx, Y = oy + j - sy;
    if (X >= 0 && Y >= 0 && X < cw && Y < ch && md[(j * hw + i) * 4 + 3] > 0) hole[Y * cw + X] = 1;
  }
  for (let k = 0; k < N; k++) {
    if (hole[k]) continue;
    ok[k] = 1; R[k] = src[k * 4]; Gc[k] = src[k * 4 + 1]; B[k] = src[k * 4 + 2];
  }
  const NB = [-cw - 1, -cw, -cw + 1, -1, 1, cw - 1, cw, cw + 1];
  let ring = [];
  const seen = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (hole[k] && NB.some(d => { const n = k + d; return n >= 0 && n < N && ok[n] && Math.abs((n % cw) - (k % cw)) <= 1; })) { ring.push(k); seen[k] = 1; }
  while (ring.length) {
    const vals = ring.map(k => {
      let r = 0, g = 0, b = 0, c = 0;
      for (const d of NB) { const n = k + d; if (n < 0 || n >= N || !ok[n] || Math.abs((n % cw) - (k % cw)) > 1) continue; r += R[n]; g += Gc[n]; b += B[n]; c++; }
      return [r / c, g / c, b / c];
    });
    const next = [];
    ring.forEach((k, t) => { ok[k] = 1; [R[k], Gc[k], B[k]] = vals[t]; });
    for (const k of ring) for (const d of NB) {
      const n = k + d;
      if (n < 0 || n >= N || !hole[n] || ok[n] || seen[n] || Math.abs((n % cw) - (k % cw)) > 1) continue;
      seen[n] = 1; next.push(n);
    }
    ring = next;
  }
  const fb = fallback.match(/\d+/g)?.map(Number) || [255, 255, 255];
  for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) {
    const p = (j * hw + i) * 4;
    if (!md[p + 3]) continue;
    const X = ox + i - sx, Y = oy + j - sy, k = X >= 0 && Y >= 0 && X < cw && Y < ch ? Y * cw + X : -1;
    if (k >= 0 && ok[k]) { md[p] = R[k]; md[p + 1] = Gc[k]; md[p + 2] = B[k]; }
    else { md[p] = fb[0]; md[p + 1] = fb[1]; md[p + 2] = fb[2]; }
    md[p + 3] = 255;
  }
  hx.putImageData(mask, 0, 0);
}

// 零件外框外面 12px 繞一圈取 16 個點，略過深色（黑線），回傳出現最多次的顏色；都沒有就白色
function surround(comp, x, y, w, h) {
  const c = comp.getContext("2d"), cnt = new Map();
  let best = null, bn = 0;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;   // 橢圓繞一圈，外擴 12px
    // 取樣點落到圖外時貼著邊緣取（零件貼著畫面邊緣時，不要因為全部跳過而退回白色）
    const sx = Math.min(comp.width - 1, Math.max(0, Math.round(x + w / 2 + (w / 2 + 12) * Math.cos(a))));
    const sy = Math.min(comp.height - 1, Math.max(0, Math.round(y + h / 2 + (h / 2 + 12) * Math.sin(a))));
    const d = c.getImageData(sx, sy, 1, 1).data;
    if (d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114 <= 60) continue;
    const k = `rgb(${d[0]},${d[1]},${d[2]})`, n = (cnt.get(k) || 0) + 1;
    cnt.set(k, n);
    if (n > bn) { bn = n; best = k; }
  }
  return best || "#fff";
}

function spark(F, x, y, r, a) {
  F.save(); F.globalAlpha = a; F.fillStyle = "#fff";
  F.beginPath();
  F.moveTo(x, y - r); F.quadraticCurveTo(x, y, x + r, y); F.quadraticCurveTo(x, y, x, y + r);
  F.quadraticCurveTo(x, y, x - r, y); F.quadraticCurveTo(x, y, x, y - r);
  F.fill(); F.restore();
}

function confetti(W, dpr) {
  const cols = ["#e53935", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#fb8c00", "#ec407a"];
  return { x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: -10 * dpr, vx: (Math.random() - 0.5) * 18 * dpr, vy: Math.random() * 4 * dpr,
    a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, w: (8 + Math.random() * 8) * dpr, h: (5 + Math.random() * 5) * dpr,
    col: cols[(Math.random() * cols.length) | 0] };
}
