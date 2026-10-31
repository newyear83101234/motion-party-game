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
