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
export function regionAt(labels, w, h, x, y, r = 12) {
  x = Math.floor(x); y = Math.floor(y);   // 像素 9 涵蓋 9.0～9.99，用無條件捨去才不會把最右／最下半格判成圖外
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

// 復原堆疊：超過筆數上限，或總位元組（每筆的 e.bytes）超過 maxBytes 就丟掉最舊的（至少留 1 筆）
export class History {
  constructor(limit = 30, maxBytes = Infinity) { this.limit = limit; this.maxBytes = maxBytes; this.items = []; this._bytes = 0; }
  push(e) {
    this.items.push(e); this._bytes += e?.bytes || 0;
    while (this.items.length > this.limit || (this._bytes > this.maxBytes && this.items.length > 1)) this._bytes -= this.items.shift()?.bytes || 0;
  }
  pop() { const e = this.items.pop() ?? null; if (e) this._bytes -= e.bytes || 0; return e; }
  clear() { this.items.length = 0; this._bytes = 0; }
  get size() { return this.items.length; }
  get bytes() { return this._bytes; }
}

// 「剪下角色」的遮罩（給「我的世界」）：碰到圖邊的區塊當背景（透明），其他區塊留下；
// 線只留離角色 pad 像素以內的（角色的外框），背景裡的雜線（地面、草）不要。回傳 { mask, x0, y0, x1, y1 }，沒東西可留回傳 null
export function cutoutMask(labels, w, h, pad = 12) {
  const bg = new Set();
  for (let x = 0; x < w; x++) { bg.add(labels[x]); bg.add(labels[(h - 1) * w + x]); }
  for (let y = 0; y < h; y++) { bg.add(labels[y * w]); bg.add(labels[y * w + w - 1]); }
  bg.delete(LINE);
  const isBg = new Uint8Array(labels.reduce((m, v) => Math.max(m, v), 0) + 1);
  for (const id of bg) isBg[id] = 1;
  // 先在粗格子（每 4 像素一格）標出有角色的格子，往外擴 pad 像素；線落在擴大範圍內才留
  const S = 4, gw = Math.ceil(w / S), gh = Math.ceil(h / S), g = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const id = labels[y * w + x]; if (id >= 0 && !isBg[id]) g[((y / S) | 0) * gw + ((x / S) | 0)] = 1; }
  const near = dilate(g, gw, gh, Math.ceil(pad / S));
  // 留下來的東西在粗格子上分成幾團，只留「主角那一團」和跟它差不多大的（飄在旁邊的雲、星星、泡泡不要）
  const keepG = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, id = labels[i], gi = ((y / S) | 0) * gw + ((x / S) | 0);
    if (id >= 0 ? !isBg[id] : near[gi]) keepG[gi] = 1;
  }
  const big = bigBlobs(keepG, gw, gh, 0.3);
  const mask = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, id = labels[i], gi = ((y / S) | 0) * gw + ((x / S) | 0);
    if ((id >= 0 ? isBg[id] : !near[gi]) || !big[gi]) continue;
    mask[i] = 1;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { mask, x0, y0, x1, y1 };
}
// 0/1 格子裡的 8 連通團塊：只留面積 ≥ 最大那團 ratio 倍的
function bigBlobs(g, w, h, ratio) {
  const lab = new Int32Array(w * h).fill(-1), sizes = [], st = new Int32Array(w * h);
  for (let s = 0; s < g.length; s++) {
    if (!g[s] || lab[s] >= 0) continue;
    const id = sizes.length; let sp = 0, n = 0;
    st[sp++] = s; lab[s] = id;
    while (sp) {
      const i = st[--sp], x = i % w, y = (i - x) / w; n++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && g[j] && lab[j] < 0) { lab[j] = id; st[sp++] = j; }
      }
    }
    sizes.push(n);
  }
  const max = Math.max(0, ...sizes), out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) if (lab[i] >= 0 && sizes[lab[i]] >= max * ratio) out[i] = 1;
  return out;
}
// 0/1 格子往外擴 r 格（先橫再直，兩次一維最大值）
function dilate(g, w, h, r) {
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = g[y * w + k];
    t[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = t[k * w + x];
    o[y * w + x] = v;
  }
  return o;
}
