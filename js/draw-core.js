// 畫畫遊戲純邏輯：線稿切塊、區塊遮罩、矩形工具、復原堆疊（不碰畫面，node 可直接測）
export const LINE = -1;
const UNSEEN = -2;

// 線稿 RGBA → 線遮罩（1 = 線）。透明像素當白色；thr 越高，越淡的灰也算線
export function lineMask(rgba, w, h, thr = 160) {
  const m = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < m.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const lum = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114) * a + 255 * (1 - a);
    m[i] = lum < thr ? 1 : 0;
  }
  return m;
}

// 4 連通區塊編號：線 = LINE，其餘 0..count-1；boxes[id] = { x0, y0, x1, y1, area }
export function labelRegions(mask, w, h) {
  const labels = new Int32Array(w * h).fill(UNSEEN);
  const boxes = [];
  const stack = new Int32Array(w * h);
  for (let s = 0; s < labels.length; s++) {
    if (labels[s] !== UNSEEN) continue;
    if (mask[s]) { labels[s] = LINE; continue; }
    const id = boxes.length;
    const b = { x0: w, y0: h, x1: -1, y1: -1, area: 0 };
    let sp = 0;
    stack[sp++] = s; labels[s] = id;
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i - x) / w;
      b.area++;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      if (x > 0 && labels[i - 1] === UNSEEN && !mask[i - 1]) { labels[i - 1] = id; stack[sp++] = i - 1; }
      if (x < w - 1 && labels[i + 1] === UNSEEN && !mask[i + 1]) { labels[i + 1] = id; stack[sp++] = i + 1; }
      if (y > 0 && labels[i - w] === UNSEEN && !mask[i - w]) { labels[i - w] = id; stack[sp++] = i - w; }
      if (y < h - 1 && labels[i + w] === UNSEEN && !mask[i + w]) { labels[i + w] = id; stack[sp++] = i + w; }
    }
    boxes.push(b);
  }
  return { labels, count: boxes.length, boxes };
}

// 找 (x, y) 屬於哪一塊；點在黑線上時，找半徑 r 內最近的一塊；都沒有回 -1
export function regionAt(labels, w, h, x, y, r = 6) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return -1;
  const v = labels[y * w + x];
  if (v >= 0) return v;
  let best = -1, bd = Infinity;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy, d = dx * dx + dy * dy;
    if (d >= bd || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const id = labels[ny * w + nx];
    if (id >= 0) { best = id; bd = d; }
  }
  return best;
}

// 某一塊的遮罩（255 = 可以塗），往外擴 pad 像素，但只擴進黑線、不擴進別塊 → 填色塞到線底下不留白縫
export function regionMask(labels, w, h, id, box, pad = 2) {
  const x = Math.max(0, box.x0 - pad), y = Math.max(0, box.y0 - pad);
  const rw = Math.min(w - 1, box.x1 + pad) - x + 1, rh = Math.min(h - 1, box.y1 + pad) - y + 1;
  let data = new Uint8Array(rw * rh);
  for (let j = 0; j < rh; j++) {
    const row = (y + j) * w + x;
    for (let i = 0; i < rw; i++) if (labels[row + i] === id) data[j * rw + i] = 255;
  }
  for (let k = 0; k < pad; k++) {
    const next = data.slice();
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
      const q = j * rw + i;
      if (data[q] || labels[(y + j) * w + x + i] !== LINE) continue;
      if ((i > 0 && data[q - 1]) || (i < rw - 1 && data[q + 1]) || (j > 0 && data[q - rw]) || (j < rh - 1 && data[q + rw])) next[q] = 255;
    }
    data = next;
  }
  return { x, y, w: rw, h: rh, data };
}

// 矩形 { x, y, w, h }：聯集（可傳 null）、裁進畫布並取整數（全在外回 null）
export function rectUnion(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
export function rectClamp(r, w, h) {
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.w)), y1 = Math.min(h, Math.ceil(r.y + r.h));
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}

// 復原堆疊：超過上限就丟掉最舊的
export class History {
  constructor(limit = 30) { this.limit = limit; this.items = []; }
  push(e) { this.items.push(e); if (this.items.length > this.limit) this.items.shift(); }
  pop() { return this.items.pop() ?? null; }
  clear() { this.items.length = 0; }
  get size() { return this.items.length; }
}
