// 畫畫遊戲畫布：開圖切塊、四層 canvas（顏色／即時筆畫／線稿／特效）＋看不見的亮粉遮罩、縮放平移、座標換算、合成輸出
import { lineMask, labelRegions } from "./draw-core.js?v=2";

export function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

export class Board {
  constructor(stage) {
    this.stage = stage;                          // 固定大小的外框（overflow: hidden）
    this.wrap = document.createElement("div");   // 被縮放平移的那一層
    this.wrap.className = "board";
    stage.appendChild(this.wrap);
    this.view = { s: 1, tx: 0, ty: 0 };
    this.base = 1;
    this._tok = 0;
  }

  // 回傳 true = 載入完成；false = 有更新的請求，這次作廢
  async load(url) {
    const tok = ++this._tok;
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error("線稿載入失敗：" + url));
      i.src = url;
    });
    if (tok !== this._tok) return false;
    for (const k of ["color", "glit", "live", "fx", "line"]) if (this[k]) this[k].width = this[k].height = 0;   // 舊畫布馬上釋放
    const W = img.naturalWidth || 2048, H = img.naturalHeight || 1536;
    this.W = W; this.H = H;
    const src = makeCanvas(W, H), sx = src.getContext("2d", { willReadFrequently: true });
    sx.fillStyle = "#fff"; sx.fillRect(0, 0, W, H); sx.drawImage(img, 0, 0, W, H);
    const rgba = sx.getImageData(0, 0, W, H).data;
    src.width = src.height = 0;   // 暫存畫布用完就釋放
    this.mask = lineMask(rgba, W, H);
    const R = labelRegions(this.mask, W, H);
    this.labels = R.labels; this.boxes = R.boxes;

    // 線稿層：一律黑色，用亮度當透明度（保留抗鋸齒，白色變透明）
    const line = makeCanvas(W, H), lx = line.getContext("2d"), out = lx.createImageData(W, H), o = out.data;
    for (let p = 0; p < o.length; p += 4) o[p + 3] = 255 - (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114);
    lx.putImageData(out, 0, 0);

    this.color = makeCanvas(W, H); this.ctx = this.color.getContext("2d");
    this.ctx.fillStyle = "#fff"; this.ctx.fillRect(0, 0, W, H);
    this.glit = makeCanvas(W, H); this.gctx = this.glit.getContext("2d", { willReadFrequently: true }); // 不放進畫面
    this.live = makeCanvas(W, H); this.lctx = this.live.getContext("2d");
    this.fx = makeCanvas(W, H); this.fctx = this.fx.getContext("2d");
    this.line = line;
    for (const c of [this.color, this.live, line, this.fx]) c.className = "layer";
    this.wrap.replaceChildren(this.color, this.live, line, this.fx);
    this.wrap.style.width = W + "px"; this.wrap.style.height = H + "px";
    this.fit();
    return true;
  }

  fit() {
    const r = this.stage.getBoundingClientRect();
    this.base = Math.min(r.width / this.W, r.height / this.H);
    this.setView({ s: 1, tx: 0, ty: 0 });
  }
  origin(r) {
    const k = this.base * this.view.s;
    return { x: (r.width - this.W * k) / 2 + this.view.tx, y: (r.height - this.H * k) / 2 + this.view.ty, k };
  }
  // s = 放大倍率（1～4），tx/ty = 平移；放大後不能拖到露出畫布外面
  setView(v) {
    const r = this.stage.getBoundingClientRect(), s = Math.min(4, Math.max(1, v.s)), k = this.base * s;
    const cx = (r.width - this.W * k) / 2, cy = (r.height - this.H * k) / 2;
    const clampT = (t, c) => (c >= 0 ? 0 : Math.min(-c, Math.max(c, t)));
    this.view = { s, tx: clampT(v.tx, cx), ty: clampT(v.ty, cy) };
    const o = this.origin(r);
    this.wrap.style.transform = `translate(${o.x}px, ${o.y}px) scale(${k})`;
  }
  toImage(clientX, clientY) {
    const r = this.stage.getBoundingClientRect(), o = this.origin(r);
    return { x: (clientX - r.left - o.x) / o.k, y: (clientY - r.top - o.y) / o.k };
  }
  toClient(x, y) {
    const r = this.stage.getBoundingClientRect(), o = this.origin(r);
    return { x: r.left + o.x + x * o.k, y: r.top + o.y + y * o.k };
  }
  // 以畫布上的 (ix, iy) 為定點縮放：縮放後那一點剛好落在螢幕 (clientX, clientY) 底下（兩指縮放用）
  zoomAt(ix, iy, clientX, clientY, s) {
    const r = this.stage.getBoundingClientRect();
    s = Math.min(4, Math.max(1, s));
    const k = this.base * s;
    this.setView({ s, tx: clientX - r.left - ix * k - (r.width - this.W * k) / 2, ty: clientY - r.top - iy * k - (r.height - this.H * k) / 2 });
  }
  // 顏色層＋線稿層合成一張（存作品、完成動畫用）
  composite() {
    const c = makeCanvas(this.W, this.H), x = c.getContext("2d");
    x.drawImage(this.color, 0, 0); x.drawImage(this.line, 0, 0);
    return c;
  }
}
