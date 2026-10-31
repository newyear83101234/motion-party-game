// 畫畫遊戲塗色：先在暫存畫布做好、用區塊遮罩裁切後才合進顏色層；復原只存被改到的長方形範圍
import { regionMask, regionAt, rectClamp, rectUnion, History } from "./draw-core.js?v=1";
import { makeCanvas as mk } from "./draw-canvas.js?v=1";

export class Painter {
  constructor(board) {
    this.b = board;
    this.history = new History(30, 120e6);   // 約 120MB 的復原記憶體上限
    this.maskCache = new Map();
    this.paintKey = ""; this.paint = null;
  }
  reset() { this.history.clear(); this.maskCache.clear(); this.paintKey = ""; if (this.paint) this.paint.width = 0; this.paint = null; }

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
    if (key !== this.paintKey) { if (this.paint) this.paint.width = 0; this.paint = makePaint(mat, color, this.b.W, this.b.H); this.paintKey = key; }
    return this.paint;
  }

  snapshot(rect) {
    const b = this.b;
    const color = b.ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    let glit = b.gctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    let bytes = color.data.length;
    const d = glit.data;
    let any = false;
    for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
    if (any) bytes += d.length; else glit = null;   // 亮粉遮罩這塊全空就不存，省一半記憶體
    this.history.push({ rect, color, glit, bytes });
  }
  undo() {
    const e = this.history.pop();
    if (!e) return false;
    this.b.ctx.putImageData(e.color, e.rect.x, e.rect.y);
    if (e.glit) this.b.gctx.putImageData(e.glit, e.rect.x, e.rect.y);
    else this.b.gctx.clearRect(e.rect.x, e.rect.y, e.rect.w, e.rect.h);
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
    let used = false;   // done 只能生效一次
    return { x: m.x, y: m.y, canvas: c, glitter: mat.kind === "glitter",
      done: () => { if (used) return; used = true; this.commit(c, m.x, m.y, mat.kind === "glitter"); } };
  }

  // ── 筆畫：開始 → 移動 → 結束才合進顏色層；過程畫在即時層。不出線時裁在起筆那一塊裡 ──
  // o = { brush: "marker" | "crayon" | "rainbow" | "eraser", size: 半徑(畫布像素), mat, color, clip: true/false }
  strokeStart(x, y, o) {
    const b = this.b;
    if (this.st) this.strokeEnd();   // 上一筆沒收到放開 → 先收掉
    if (!this.scratch || this.scratch.width !== b.W || this.scratch.height !== b.H) { this.scratch = mk(b.W, b.H); this.sctx = this.scratch.getContext("2d"); }   // 換線稿尺寸就重做
    this.sctx.clearRect(0, 0, b.W, b.H);
    const id = o.clip ? this.regionAt(x, y) : -1;
    if (o.clip && id < 0) { this.st = null; return; }   // 不出線但找不到任何一塊 → 這一筆不畫
    this.st = { o, mask: id >= 0 ? this.maskOf(id) : null, last: { x, y }, rect: null, hue: Math.random() * 360 };
    this.strokeMove(x, y);
  }

  strokeMove(x, y) {
    const st = this.st;
    if (!st) return;
    const o = st.o, sx = this.sctx, a = st.last, r = o.size;
    // 1) 這一段先畫進暫存畫布（整筆都留在這裡）
    if (o.brush === "crayon") {
      const n = Math.max(1, Math.ceil(Math.hypot(x - a.x, y - a.y) / (r * 0.3)));
      sx.fillStyle = o.color;
      for (let i = 1; i <= n; i++) {
        const cx = a.x + (x - a.x) * i / n, cy = a.y + (y - a.y) * i / n;
        for (let k = 0; k < 8; k++) {
          const ang = Math.random() * Math.PI * 2, d = Math.random() * r;
          sx.globalAlpha = 0.35 + Math.random() * 0.45;
          sx.beginPath(); sx.arc(cx + d * Math.cos(ang), cy + d * Math.sin(ang), r * 0.28, 0, Math.PI * 2); sx.fill();
        }
      }
      sx.globalAlpha = 1;
    } else {
      sx.lineCap = "round"; sx.lineJoin = "round"; sx.lineWidth = r * 2;
      if (o.brush === "rainbow") {
        st.hue = (st.hue + Math.hypot(x - a.x, y - a.y) * 0.4) % 360;
        sx.strokeStyle = `hsl(${st.hue}, 90%, 55%)`;
      } else sx.strokeStyle = "#000";   // 馬克筆、橡皮擦：暫存畫布只當形狀用
      sx.beginPath(); sx.moveTo(a.x, a.y); sx.lineTo(x + 0.01, y); sx.stroke();
    }
    st.last = { x, y };
    // 2) 只重畫這一段的範圍到即時層
    const m = (o.brush === "crayon" ? r * 1.3 : r) + 2;   // 蠟筆的點會散到 1.28 倍半徑外
    const seg = rectClamp({ x: Math.min(a.x, x) - m, y: Math.min(a.y, y) - m,
      w: Math.abs(x - a.x) + 2 * m, h: Math.abs(y - a.y) + 2 * m }, this.b.W, this.b.H);
    if (!seg) return;
    st.rect = rectUnion(st.rect, seg);
    const L = this.b.lctx;
    L.save();
    L.beginPath(); L.rect(seg.x, seg.y, seg.w, seg.h); L.clip();
    L.clearRect(seg.x, seg.y, seg.w, seg.h);
    if (o.brush === "eraser") {
      L.fillStyle = "#fff"; L.fillRect(seg.x, seg.y, seg.w, seg.h);
      L.globalCompositeOperation = "destination-in";
    } else if (o.brush === "marker") {
      L.drawImage(this.paintFor(o.mat, o.color), seg.x, seg.y, seg.w, seg.h, seg.x, seg.y, seg.w, seg.h);
      L.globalCompositeOperation = "destination-in";
    }
    L.drawImage(this.scratch, seg.x, seg.y, seg.w, seg.h, seg.x, seg.y, seg.w, seg.h);
    if (st.mask) { L.globalCompositeOperation = "destination-in"; L.drawImage(st.mask.canvas, st.mask.x, st.mask.y); }
    L.restore();
  }

  strokeEnd() {
    const st = this.st;
    this.st = null;
    if (!st || !st.rect) return;
    const r = st.rect, c = mk(r.w, r.h);
    c.getContext("2d").drawImage(this.b.live, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    this.b.lctx.clearRect(r.x, r.y, r.w, r.h);
    this.commit(c, r.x, r.y, st.o.brush === "marker" && st.o.mat.kind === "glitter");
  }

  // 第二根手指放上來時取消剛開始的那一筆（不記復原）
  strokeCancel() {
    const st = this.st;
    this.st = null;
    if (st && st.rect) this.b.lctx.clearRect(st.rect.x, st.rect.y, st.rect.w, st.rect.h);
  }

  // 清空整張（可以復原）
  clearAll() {
    const b = this.b;
    this.snapshot({ x: 0, y: 0, w: b.W, h: b.H });
    b.ctx.fillStyle = "#fff"; b.ctx.fillRect(0, 0, b.W, b.H);
    b.gctx.clearRect(0, 0, b.W, b.H);
  }

  // 貼紙：以 (x, y) 為中心蓋上去，不受不出線限制
  sticker(img, x, y, size) {
    const c = mk(size, size);
    c.getContext("2d").drawImage(img, 0, 0, size, size);
    this.commit(c, Math.round(x - size / 2), Math.round(y - size / 2), false);
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

// 材質預覽小方塊（工具列和材質選單用）
export function previewMat(mat, color, size = 64) {
  const c = mk(size, size), x = c.getContext("2d");
  if (mat.kind === "solid") { x.fillStyle = color; x.fillRect(0, 0, size, size); }
  else x.drawImage(mat.kind === "glitter" ? glitterTile(color) : patternTile(mat.pattern, color), 0, 0, size, size);
  return c;
}
