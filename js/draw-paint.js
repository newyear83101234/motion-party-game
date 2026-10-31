// 畫畫遊戲塗色：先在暫存畫布做好、用區塊遮罩裁切後才合進顏色層；復原只存被改到的長方形範圍
import { regionMask, regionAt, rectClamp, rectUnion, History } from "./draw-core.js?v=4";
import { makeCanvas as mk } from "./draw-canvas.js?v=4";

// 每種筆的筆跡最遠會離中心線幾倍半徑（即時層的重畫範圍要涵蓋到）；沒列的是 1 倍
const REACH = { crayon: 1.3, watercolor: 1.25, spray: 1.75, neon: 1.7, sparkle: 1.75, pencil: 0.5 };

export class Painter {
  constructor(board) {
    this.b = board;
    this.history = new History(30, 120e6);   // 約 120MB 的復原記憶體上限
    this.maskCache = new Map();
    this.paintKey = ""; this.paint = null;
    this.onChange = null;                    // 顏色層每次改動（畫一筆、填色、貼紙、復原、清空）後呼叫
  }
  reset() {
    this.history.clear(); this.maskCache.clear(); this.paintKey = ""; if (this.paint) this.paint.width = 0; this.paint = null;
    this.st = null;
    if (this.scratch) { this.scratch.width = this.scratch.height = 0; this.scratch = null; this.sctx = null; }
  }

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
    this.onChange?.();
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
    this.onChange?.();
  }

  // 填色：回傳裁好的那一塊顏料（給水波動畫用），呼叫 done() 才真的合進顏色層
  fill(id, mat, color) {
    const m = this.maskOf(id), c = mk(m.w, m.h), x = c.getContext("2d");
    if (GRAD.has(mat.kind)) { const g = makePaint(mat, color, m.w, m.h); x.drawImage(g, 0, 0); g.width = g.height = 0; }   // 漸層照這一塊的大小拉；暫存畫布馬上釋放（iPad 回收慢）
    else x.drawImage(this.paintFor(mat, color), m.x, m.y, m.w, m.h, 0, 0, m.w, m.h);
    x.globalCompositeOperation = "destination-in";
    x.drawImage(m.canvas, 0, 0);
    let used = false;   // done 只能生效一次
    return { x: m.x, y: m.y, canvas: c, glitter: mat.kind === "glitter",
      done: () => { if (used) return; used = true; this.commit(c, m.x, m.y, mat.kind === "glitter"); } };
  }

  // ── 筆畫：開始 → 移動 → 結束才合進顏色層；過程畫在即時層。不出線時裁在起筆那一塊裡 ──
  // o = { brush: "marker" | "crayon" | "rainbow" | "watercolor" | "spray" | "neon" | "sparkle" | "pencil" | "eraser",
  //       size: 半徑(畫布像素), mat, color, clip: true/false }
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
    const o = st.o, a = st.last;
    // 1) 這一段先畫進暫存畫布（整筆都留在這裡）
    drawSeg(this.sctx, st, a, { x, y });
    st.last = { x, y };
    // 2) 只重畫這一段的範圍到即時層
    const m = o.size * (REACH[o.brush] || 1) + 2;
    const seg = rectClamp({ x: Math.min(a.x, x) - m, y: Math.min(a.y, y) - m,
      w: Math.abs(x - a.x) + 2 * m, h: Math.abs(y - a.y) + 2 * m }, this.b.W, this.b.H);
    if (!seg) return;
    st.rect = rectUnion(st.rect, seg);
    const L = this.b.lctx;
    L.save();
    L.beginPath(); L.rect(seg.x, seg.y, seg.w, seg.h); L.clip();
    L.clearRect(seg.x, seg.y, seg.w, seg.h);
    compose(L, o, this.scratch, seg, () => this.paintFor(o.mat, o.color));
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
    this.onChange?.();
  }

  // 貼紙：以 (x, y) 為中心蓋上去，不受不出線限制
  sticker(img, x, y, size) {
    const c = mk(size, size);
    c.getContext("2d").drawImage(img, 0, 0, size, size);
    this.commit(c, Math.round(x - size / 2), Math.round(y - size / 2), false);
  }
}

// ── 各種筆怎麼畫：一段筆畫（a → b）畫進暫存畫布。st 記住跨段的狀態（彩虹色相、下一個點還差多遠、筆尖小圖）──
// 馬克筆、橡皮擦、水彩在暫存畫布只畫「形狀」（黑色），顏色在 compose 才填；其他筆直接畫成品顏色
function drawSeg(sx, st, a, b) {
  const o = st.o, r = o.size;
  if (o.brush === "crayon") {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (r * 0.3)));
    sx.fillStyle = o.color;
    for (let i = 1; i <= n; i++) {
      const cx = a.x + (b.x - a.x) * i / n, cy = a.y + (b.y - a.y) * i / n;
      for (let k = 0; k < 8; k++) {
        const ang = Math.random() * Math.PI * 2, d = Math.random() * r;
        sx.globalAlpha = 0.35 + Math.random() * 0.45;
        sx.beginPath(); sx.arc(cx + d * Math.cos(ang), cy + d * Math.sin(ang), r * 0.28, 0, Math.PI * 2); sx.fill();
      }
    }
    sx.globalAlpha = 1;
  } else if (o.brush === "watercolor") {   // 軟邊圓點密密地蓋：中間飽和、邊緣淡出；上色時再變半透明
    const dab = st.dab || (st.dab = softDab(r * 1.1, "#000000"));
    walk(st, a, b, r * 0.2, (cx, cy) => {
      const d = dab.width * (0.9 + Math.random() * 0.2);
      sx.drawImage(dab, cx - d / 2, cy - d / 2, d, d);
    });
  } else if (o.brush === "spray") {        // 噴漆：每走一小步就在 1.6 倍半徑的圓裡撒細點，越靠中間越密
    const R = r * 1.6, dot = Math.max(1.5, r * 0.09);
    sx.fillStyle = o.color;
    walk(st, a, b, r * 0.3, (cx, cy) => {
      for (let k = 0; k < 16; k++) {
        const ang = Math.random() * Math.PI * 2, d = R * Math.random();
        sx.beginPath(); sx.arc(cx + d * Math.cos(ang), cy + d * Math.sin(ang), dot, 0, Math.PI * 2); sx.fill();
      }
    });
  } else if (o.brush === "neon") {         // 霓虹：同色光暈墊在後面（destination-over），淺色亮芯畫在上面
    const glow = st.dab || (st.dab = softDab(r * 1.6, o.color, 0.45));
    sx.globalCompositeOperation = "destination-over";
    walk(st, a, b, r * 0.3, (cx, cy) => sx.drawImage(glow, cx - glow.width / 2, cy - glow.height / 2));
    sx.globalCompositeOperation = "source-over";
    sx.lineCap = "round"; sx.lineJoin = "round"; sx.lineWidth = r * 0.7;
    sx.strokeStyle = st.core || (st.core = shade(o.color, 0.7));
    sx.beginPath(); sx.moveTo(a.x, a.y); sx.lineTo(b.x + 0.01, b.y); sx.stroke();
  } else if (o.brush === "sparkle") {      // 星星筆：每隔一段蓋一顆大小、角度、深淺都不同的星星，旁邊配一顆小圓點
    walk(st, a, b, r * 2.2, (cx, cy) => {
      const k = st.n = (st.n || 0) + 1, s = r * (0.75 + Math.random() * 0.45);
      sx.save();
      sx.translate(cx + (Math.random() - 0.5) * r * 0.5, cy + (Math.random() - 0.5) * r * 0.5);
      sx.rotate(Math.random() * Math.PI);
      sx.fillStyle = k % 3 === 0 ? shade(o.color, 0.45) : k % 3 === 1 ? o.color : shade(o.color, -0.25);
      starPath(sx, 0, 0, s, s * 0.45); sx.fill();
      sx.restore();
      const ang = Math.random() * Math.PI * 2, d = r * (0.9 + Math.random() * 0.5);
      sx.fillStyle = shade(o.color, 0.55);
      sx.beginPath(); sx.arc(cx + d * Math.cos(ang), cy + d * Math.sin(ang), r * 0.18, 0, Math.PI * 2); sx.fill();
    });
  } else if (o.brush === "pencil") {       // 鉛筆：細細的、深淺不一帶點顆粒
    const pr = Math.max(1.5, r * 0.3);
    sx.fillStyle = o.color;
    walk(st, a, b, pr * 0.5, (cx, cy) => {
      sx.globalAlpha = 0.3 + Math.random() * 0.45;
      sx.beginPath();
      sx.arc(cx + (Math.random() - 0.5) * pr * 0.5, cy + (Math.random() - 0.5) * pr * 0.5, pr * (0.8 + Math.random() * 0.3), 0, Math.PI * 2);
      sx.fill();
    });
    sx.globalAlpha = 1;
  } else {                                 // 馬克筆、橡皮擦（黑色形狀）、彩虹筆（邊畫邊換色）
    sx.lineCap = "round"; sx.lineJoin = "round"; sx.lineWidth = r * 2;
    if (o.brush === "rainbow") {
      st.hue = (st.hue + Math.hypot(b.x - a.x, b.y - a.y) * 0.4) % 360;
      sx.strokeStyle = `hsl(${st.hue}, 90%, 55%)`;
    } else sx.strokeStyle = "#000";
    sx.beginPath(); sx.moveTo(a.x, a.y); sx.lineTo(b.x + 0.01, b.y); sx.stroke();
  }
}

// 暫存畫布 seg 範圍 → 目標畫布：形狀筆在這裡才上色（橡皮擦＝白色、馬克筆＝材質顏料、水彩＝半透明顏色）
function compose(L, o, src, seg, paint) {
  if (o.brush === "eraser" || o.brush === "watercolor") {
    if (o.brush === "watercolor") L.globalAlpha = 0.6;
    L.fillStyle = o.brush === "eraser" ? "#fff" : o.color; L.fillRect(seg.x, seg.y, seg.w, seg.h);
    L.globalAlpha = 1;
    L.globalCompositeOperation = "destination-in";
  } else if (o.brush === "marker") {
    L.drawImage(paint(), seg.x, seg.y, seg.w, seg.h, seg.x, seg.y, seg.w, seg.h);
    L.globalCompositeOperation = "destination-in";
  }
  L.drawImage(src, seg.x, seg.y, seg.w, seg.h, seg.x, seg.y, seg.w, seg.h);
}

// 沿著 a → b 每隔 gap 呼叫一次 f(x, y)；st.walk 記住離下一個點還差多遠，跨段也保持等距（第一個點落在起筆處）
function walk(st, a, b, gap, f) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  let d = st.walk || 0;
  for (; d <= len; d += gap) { const t = len ? d / len : 0; f(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
  st.walk = d - len;
}

// 軟邊圓點小圖：半徑 R，中心 alpha、往外淡出到全透明
function softDab(R, color, alpha = 1) {
  const S = Math.ceil(R * 2), c = mk(S, S), x = c.getContext("2d");
  const [cr, cg, cb] = hexRgb(color), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, R);
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
  g.addColorStop(0.55, `rgba(${cr},${cg},${cb},${alpha * 0.6})`);
  g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return c;
}

// 筆刷選單的預覽圖：用跟真的畫畫同一套畫法，在白底上畫一段波浪（選淺色時底改成深色，才看得到）
export function previewBrush(brush, color, w = 224, h = 132) {
  const src = mk(w, h), st = { o: { brush, size: h * 0.15, color, mat: { kind: "solid" } }, hue: 200 };
  const r = st.o.size, x0 = r * 2, x1 = w - r * 2;
  let a = { x: x0, y: h / 2 };
  for (let i = 1; i <= 24; i++) {
    const b = { x: x0 + (x1 - x0) * i / 24, y: h / 2 - Math.sin(i / 24 * Math.PI * 2) * h * 0.18 };
    drawSeg(src.getContext("2d"), st, a, b); a = b;
  }
  const lay = mk(w, h);
  compose(lay.getContext("2d"), st.o, src, { x: 0, y: 0, w, h }, () => makePaint({ kind: "solid" }, color, w, h));
  const out = mk(w, h), O = out.getContext("2d");
  O.fillStyle = lum(color) > 0.75 ? "#7a6e60" : "#fff"; O.fillRect(0, 0, w, h);
  O.drawImage(lay, 0, 0);
  src.width = lay.width = 0;
  return out;
}

// 材質顏料：整張畫布大小。純色直接填；亮粉與圖樣先做一塊小磁磚，再鋪滿整張
// 漸層材質：gradient = 目前顏色由上往下「亮 → 原色 → 暗」（像有光照的立體感）；rainbowgrad = 彩虹由左到右（不看顏色）
const GRAD = new Set(["gradient", "rainbowgrad"]);
export function makePaint(mat, color, W, H) {
  const c = mk(W, H), x = c.getContext("2d");
  if (mat.kind === "solid") { x.fillStyle = color; x.fillRect(0, 0, W, H); return c; }
  if (mat.kind === "gradient") {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.35));
    x.fillStyle = g; x.fillRect(0, 0, W, H); return c;
  }
  if (mat.kind === "rainbowgrad") {
    const g = x.createLinearGradient(0, 0, W, 0);
    ["#ff5252", "#ffab40", "#ffee58", "#69f0ae", "#40c4ff", "#7c4dff", "#ff4081"].forEach((k, i) => g.addColorStop(i / 6, k));
    x.fillStyle = g; x.fillRect(0, 0, W, H); return c;
  }
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
  if (mat.kind === "solid" || GRAD.has(mat.kind)) x.drawImage(makePaint(mat, color, size, size), 0, 0);
  else x.drawImage(mat.kind === "glitter" ? glitterTile(color) : patternTile(mat.pattern, color), 0, 0, size, size);
  return c;
}
