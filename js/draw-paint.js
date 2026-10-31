// 畫畫遊戲塗色：先在暫存畫布做好、用區塊遮罩裁切後才合進顏色層；復原只存被改到的長方形範圍
import { regionMask, regionAt, rectClamp, History } from "./draw-core.js?v=1";
import { makeCanvas as mk } from "./draw-canvas.js?v=1";

export class Painter {
  constructor(board) {
    this.b = board;
    this.history = new History(30);
    this.maskCache = new Map();
    this.paintKey = ""; this.paint = null;
  }
  reset() { this.history.clear(); this.maskCache.clear(); this.paintKey = ""; this.paint = null; }

  regionAt(x, y) { const b = this.b; return regionAt(b.labels, b.W, b.H, x, y); }

  // 某一塊的遮罩畫布（不透明 = 可以塗），有快取
  maskOf(id) {
    let m = this.maskCache.get(id);
    if (m) return m;
    const b = this.b, r = regionMask(b.labels, b.W, b.H, id, b.boxes[id], 2);
    const c = mk(r.w, r.h), x = c.getContext("2d"), img = x.createImageData(r.w, r.h);
    for (let i = 0; i < r.data.length; i++) img.data[i * 4 + 3] = r.data[i];
    x.putImageData(img, 0, 0);
    m = { x: r.x, y: r.y, w: r.w, h: r.h, canvas: c };
    this.maskCache.set(id, m);
    return m;
  }

  // 目前「材質＋顏色」的整張顏料，有快取（換材質或顏色才重做）
  paintFor(mat, color) {
    const key = `${mat.kind}:${mat.pattern || ""}:${color}`;
    if (key !== this.paintKey) { this.paint = makePaint(mat, color, this.b.W, this.b.H); this.paintKey = key; }
    return this.paint;
  }

  snapshot(rect) {
    const b = this.b;
    this.history.push({ rect, color: b.ctx.getImageData(rect.x, rect.y, rect.w, rect.h), glit: b.gctx.getImageData(rect.x, rect.y, rect.w, rect.h) });
  }
  undo() {
    const e = this.history.pop();
    if (!e) return false;
    this.b.ctx.putImageData(e.color, e.rect.x, e.rect.y);
    this.b.gctx.putImageData(e.glit, e.rect.x, e.rect.y);
    return true;
  }

  // 把一張已裁好的圖合進顏色層；亮粉遮罩跟著更新（亮粉 → 加進遮罩，其他 → 從遮罩挖掉）
  commit(canvas, x, y, glitter) {
    const b = this.b, rect = rectClamp({ x, y, w: canvas.width, h: canvas.height }, b.W, b.H);
    if (!rect) return;
    this.snapshot(rect);
    b.ctx.drawImage(canvas, x, y);
    b.gctx.save();
    b.gctx.globalCompositeOperation = glitter ? "source-over" : "destination-out";
    b.gctx.drawImage(canvas, x, y);
    b.gctx.restore();
  }

  // 填色：回傳裁好的那一塊顏料（給水波動畫用），呼叫 done() 才真的合進顏色層
  fill(id, mat, color) {
    const m = this.maskOf(id), p = this.paintFor(mat, color);
    const c = mk(m.w, m.h), x = c.getContext("2d");
    x.drawImage(p, m.x, m.y, m.w, m.h, 0, 0, m.w, m.h);
    x.globalCompositeOperation = "destination-in";
    x.drawImage(m.canvas, 0, 0);
    return { x: m.x, y: m.y, canvas: c, glitter: mat.kind === "glitter", done: () => this.commit(c, m.x, m.y, mat.kind === "glitter") };
  }
}

// 材質顏料：整張畫布大小。純色直接填；亮粉與圖樣先做一塊小磁磚，再鋪滿整張
export function makePaint(mat, color, W, H) {
  const c = mk(W, H), x = c.getContext("2d");
  if (mat.kind === "solid") { x.fillStyle = color; x.fillRect(0, 0, W, H); return c; }
  const tile = mat.kind === "glitter" ? glitterTile(color) : patternTile(mat.pattern, color);
  x.fillStyle = x.createPattern(tile, "repeat");
  x.fillRect(0, 0, W, H);
  return c;
}

function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function shade(hex, k) {   // k < 0 變暗、k > 0 變亮
  const [r, g, b] = hexRgb(hex), f = v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function lum(hex) { const [r, g, b] = hexRgb(hex); return (r * 0.299 + g * 0.587 + b * 0.114) / 255; }

// 亮粉磁磚 256×256：每個像素亮度隨機 ±35，再撒一些白色亮點
function glitterTile(color) {
  const S = 256, c = mk(S, S), x = c.getContext("2d"), img = x.createImageData(S, S), d = img.data;
  const [r, g, b] = hexRgb(color);
  for (let i = 0; i < d.length; i += 4) {
    const k = (Math.random() - 0.5) * 70, spark = Math.random() < 0.006;
    d[i] = spark ? 255 : Math.max(0, Math.min(255, r + k));
    d[i + 1] = spark ? 255 : Math.max(0, Math.min(255, g + k));
    d[i + 2] = spark ? 255 : Math.max(0, Math.min(255, b + k));
    d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// 圖樣磁磚 160×160：底色 + 圖案（淺色底用深一點的同色系，深色底用半透明白）
function patternTile(kind, color) {
  const S = 160, c = mk(S, S), x = c.getContext("2d");
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  const ink = lum(color) > 0.7 ? shade(color, -0.4) : "rgba(255,255,255,.85)";
  x.fillStyle = ink; x.strokeStyle = ink; x.lineCap = "round"; x.lineJoin = "round";
  const at = [[40, 40], [120, 120]];   // 兩個錯開的位置，鋪起來像斜格子
  if (kind === "star") for (const [cx, cy] of at) { starPath(x, cx, cy, 26, 11); x.fill(); }
  if (kind === "heart") for (const [cx, cy] of at) { heartPath(x, cx, cy, 24); x.fill(); }
  if (kind === "dot") for (const [cx, cy] of [...at, [120, 40], [40, 120]]) { x.beginPath(); x.arc(cx, cy, 14, 0, Math.PI * 2); x.fill(); }
  if (kind === "stripe") {
    x.lineWidth = 22;
    for (let k = -S; k <= S; k += 80) { x.beginPath(); x.moveTo(k, S); x.lineTo(k + S, 0); x.stroke(); }
  }
  if (kind === "snow") { x.lineWidth = 5; for (const [cx, cy] of at) snowPath(x, cx, cy, 24); }
  return c;
}
function starPath(x, cx, cy, R, r) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R;
    i ? x.lineTo(cx + d * Math.cos(a), cy + d * Math.sin(a)) : x.moveTo(cx + d * Math.cos(a), cy + d * Math.sin(a));
  }
  x.closePath();
}
function heartPath(x, cx, cy, s) {
  x.beginPath();
  x.moveTo(cx, cy + s * 0.9);
  x.bezierCurveTo(cx - s * 1.3, cy, cx - s * 0.7, cy - s, cx, cy - s * 0.35);
  x.bezierCurveTo(cx + s * 0.7, cy - s, cx + s * 1.3, cy, cx, cy + s * 0.9);
  x.closePath();
}
function snowPath(x, cx, cy, R) {
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, ex = cx + R * Math.cos(a), ey = cy + R * Math.sin(a);
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(ex, ey); x.stroke();
    const mx = cx + R * 0.6 * Math.cos(a), my = cy + R * 0.6 * Math.sin(a);
    for (const t of [-0.6, 0.6]) {
      x.beginPath(); x.moveTo(mx, my);
      x.lineTo(mx + R * 0.35 * Math.cos(a + t), my + R * 0.35 * Math.sin(a + t)); x.stroke();
    }
  }
}
