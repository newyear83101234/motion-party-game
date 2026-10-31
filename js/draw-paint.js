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

// 材質顏料：整張畫布大小（Task 4 換成含亮粉與圖樣的完整版）
export function makePaint(mat, color, W, H) {
  const c = mk(W, H), x = c.getContext("2d");
  x.fillStyle = color; x.fillRect(0, 0, W, H);
  return c;
}
