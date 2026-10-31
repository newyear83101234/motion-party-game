// 畫面上的小粒子：筆尖亮點、填色水花、貼紙星星。一張跟畫框一樣大的透明畫布疊在畫布上（不會被縮放影響、也不會畫進作品），
// 有粒子時才跑動畫，全部消失就停。座標一律用螢幕座標（clientX/Y）
const MAX = 160;

export class Particles {
  constructor(stage) {
    this.stage = stage;
    this.c = document.createElement("canvas");
    this.c.className = "parts";
    stage.appendChild(this.c);
    this.x = this.c.getContext("2d");
    this.list = [];
    this.on = false;
    this.ring = [];
  }
  fit() {
    const r = this.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    this.r = r; this.dpr = dpr;
  }
  add(p) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(p);
    if (!this.on) { this.on = true; this.fit(); this.t = performance.now(); requestAnimationFrame(n => this.frame(n)); }
  }
  local(cx, cy) { const r = this.r || this.stage.getBoundingClientRect(); return [cx - r.left, cy - r.top]; }

  // 筆尖：沿路冒出幾顆小點（彩虹筆隨機彩色、星星筆冒小星星、霓虹發亮）；first = 下筆那一下多冒幾顆
  trail(cx, cy, o, first = false) {
    if (o.brush === "eraser") return;
    if (!this.on) this.fit();   // 沒在跑動畫時重新量（全螢幕、轉向後畫框位置會變）
    const [x, y] = this.local(cx, cy), n = first ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.03 + Math.random() * 0.08;
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.02, g: 0.00008, life: 420 + Math.random() * 300, age: 0,
        r: 2 + Math.random() * 3, col: tint(o), kind: o.brush === "sparkle" ? "star" : "dot", glow: o.brush === "neon" });
    }
  }
  // 填色：顏料水花往外濺、往下掉，再加一圈白色波紋
  splash(cx, cy, color) {
    this.fit();
    const [x, y] = this.local(cx, cy);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.15 + Math.random() * 0.3;
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.15, g: 0.0009, life: 550 + Math.random() * 250, age: 0,
        r: 3 + Math.random() * 5, col: color || `hsl(${Math.random() * 360},90%,58%)`, kind: "dot", edge: true });
    }
    this.add({ x, y, life: 450, age: 0, kind: "ring", r: 6, R: 70, col: "#fff" });
  }
  // 貼紙：一圈金色、白色小星星往外彈
  stars(cx, cy, size = 100) {
    this.fit();
    const [x, y] = this.local(cx, cy);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + Math.random() * 0.3, v = 0.12 + Math.random() * 0.15;
      this.add({ x: x + Math.cos(a) * size * 0.3, y: y + Math.sin(a) * size * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.0002,
        life: 500 + Math.random() * 300, age: 0, r: 5 + Math.random() * 5, col: i % 3 ? "#ffd54f" : "#fff", kind: "star", rot: Math.random() * 6, edge: true });
    }
  }

  frame(now) {
    // 動畫格的時間戳可能比加入粒子時的 performance.now() 還早 → 時間差會是負的，要夾在 0～50
    const dt = Math.max(0, Math.min(50, now - this.t)), X = this.x, k = this.dpr;
    this.t = now;
    X.clearRect(0, 0, this.c.width, this.c.height);
    this.list = this.list.filter(p => (p.age += dt) < p.life);
    for (const p of this.list) {
      const u = Math.min(1, Math.max(0, p.age / p.life)), fade = 1 - u * u;
      if (p.kind === "ring") {
        X.globalAlpha = (1 - u) * 0.8; X.strokeStyle = p.col; X.lineWidth = 4 * k * (1 - u);
        X.beginPath(); X.arc(p.x * k, p.y * k, (p.r + (p.R - p.r) * (1 - (1 - u) ** 3)) * k, 0, Math.PI * 2); X.stroke();
        continue;
      }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const r = p.r * k * (p.kind === "star" ? 1 : 0.6 + 0.4 * fade);
      X.globalAlpha = fade;
      X.fillStyle = p.col;
      if (p.glow) { X.shadowColor = p.col; X.shadowBlur = 10 * k; }
      if (p.kind === "star") star(X, p.x * k, p.y * k, r, (p.rot || 0) + u * 3);
      else { X.beginPath(); X.arc(p.x * k, p.y * k, r, 0, Math.PI * 2); X.fill(); }
      if (p.edge) { X.globalAlpha = fade * 0.5; X.lineWidth = 1.5 * k; X.strokeStyle = "rgba(0,0,0,.35)"; X.stroke(); }
      X.shadowBlur = 0;
    }
    X.globalAlpha = 1;
    if (this.list.length) requestAnimationFrame(n => this.frame(n));
    else { this.on = false; X.clearRect(0, 0, this.c.width, this.c.height); }
  }
}

function tint(o) {
  if (o.brush === "rainbow") return `hsl(${Math.random() * 360},90%,60%)`;
  if (o.brush === "sparkle") return Math.random() < 0.5 ? "#fff8c4" : o.color;
  return o.color;
}
function star(X, x, y, r, rot) {
  X.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i * Math.PI / 5, d = i % 2 ? r * 0.45 : r;
    X.lineTo(x + d * Math.cos(a), y + d * Math.sin(a));
  }
  X.closePath(); X.fill();
}
