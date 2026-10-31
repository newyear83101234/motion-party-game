// 畫畫遊戲主程式：首頁、畫畫頁（工具列、彈出選單、手勢）、完成、作品牆
import { Board } from "./draw-canvas.js?v=1";
import { Painter, previewMat } from "./draw-paint.js?v=1";
import { Fx } from "./draw-fx.js?v=1";
import * as G from "./draw-gallery.js?v=1";
import { STICKERS, stickerImage } from "./draw-stickers.js?v=1";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const DEV = Q.has("dev");   // 網址帶 ?dev 才看得到測試用線稿
const ART_DIR = "IMAGE/draw/lineart/";
const COLORS = ["#e53935", "#f06292", "#ad1457", "#ff7043", "#fb8c00", "#ffb300", "#fdd835", "#fff176",
  "#c0ca33", "#7cb342", "#43a047", "#00897b", "#4dd0e1", "#29b6f6", "#1e88e5", "#3949ab",
  "#7e57c2", "#8e24aa", "#8d6e63", "#5d4037", "#bdbdbd", "#757575", "#212121", "#ffffff"];
const MATS = [{ kind: "solid" }, { kind: "glitter" }, ...["star", "heart", "dot", "stripe", "snow"].map(p => ({ kind: "pattern", pattern: p }))];
const BRUSHES = [["marker", "🖊️"], ["crayon", "🖍️"], ["rainbow", "🌈"]];
const SIZES = [10, 22, 40];            // 筆刷半徑（畫布像素）
const STICKER_SIZE = [120, 200, 300];  // 貼紙邊長，跟著筆刷粗細

const S = { tool: "fill", brush: "marker", size: 1, color: COLORS[0], mat: MATS[0], sticker: "star", clip: true,
  art: null, workId: null, done: false, busy: false };
const board = new Board($("#stage"));
const painter = new Painter(board);
const fx = new Fx(board);
let INDEX = { themes: [], arts: [] };

function show(id) {
  $$(".screen").forEach(s => s.classList.toggle("on", s.id === id));
  if (id === "paint") fx.sparkleStart(); else fx.sparkleStop();
}
function el(tag, cls, html = "") { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; }
function button(cls, html, onTap, label = "") { const b = el("button", cls, html); b.setAttribute("aria-label", label); b.onclick = onTap; return b; }
function card(src, onTap, badge = "", wip = "") {
  const d = button("card", "", onTap), img = new Image();
  img.src = src; img.alt = "";
  d.append(img);
  if (badge) d.append(el("span", "lv", badge));
  if (wip) d.append(el("span", "wip", wip));
  return d;
}
// 按住 1 秒才觸發（清空、刪除作品），按鈕外圈有進度條
function hold(btn, fn) {
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; btn.classList.remove("holding"); };
  btn.addEventListener("pointerdown", e => { e.stopPropagation(); stop(); btn.classList.add("holding"); timer = setTimeout(() => { stop(); fn(); }, 1000); });
  for (const t of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(t, stop);
}

// ── 首頁 ──
function renderHome(theme) {
  theme = theme || INDEX.themes[0]?.id;
  $("#themes").replaceChildren(...INDEX.themes.map(t =>
    button("big" + (t.id === theme ? " on" : ""), t.icon, () => renderHome(t.id), t.name)));
  const arts = INDEX.arts.filter(a => a.theme === theme && (DEV || !a.test));
  $("#arts").replaceChildren(...arts.map(a => {
    const c = card(ART_DIR + a.file, () => startArt(a), a.level === 1 ? "⭐" : "⭐⭐⭐");
    c.dataset.id = a.id;
    return c;
  }));
}

// ── 畫畫頁 ──
// 回傳 true = 開好了；false = 載入失敗（退回首頁）或被更新的請求取代（什麼都不動）
let loadSeq = 0;
async function startArt(a, work = null) {
  show("paint");
  $("#after").classList.remove("on");
  closePop();
  // 載入中：先藏起上一張、暫停操作，免得露出舊畫或畫了又被清掉；只有最後一次呼叫負責解除
  const my = ++loadSeq;
  S.busy = true;
  board.wrap.style.visibility = "hidden";
  try {
    let ok;
    try { ok = await board.load(a.url || ART_DIR + a.file); }
    catch (e) {
      console.warn("線稿載入失敗：" + (e && e.message));   // 不用 console.error：測試把它當頁面錯誤
      show("home"); renderHome(a.theme);
      return false;
    }
    if (!ok) return false;
    painter.reset();
    S.art = a; S.workId = work ? work.id : null; S.done = work ? !!work.done : false;
    if (work) {
      for (const [blob, ctx] of [[work.color, board.ctx], [work.glit, board.gctx]]) {
        if (!blob) continue;
        const bmp = await createImageBitmap(blob);
        ctx.clearRect(0, 0, board.W, board.H); ctx.drawImage(bmp, 0, 0);
      }
    }
    return true;
  } finally {
    if (my === loadSeq) { board.wrap.style.visibility = ""; S.busy = false; }
  }
}

async function saveWork() {
  const c = board.composite();
  const w = { id: S.workId || G.newId(), art: S.art.id, done: S.done, thumb: await G.thumbOf(c), image: await G.toBlob(c),
    color: await G.toBlob(board.color), glit: await G.toBlob(board.glit) };
  try { await G.save(w); S.workId = w.id; return true; }
  catch (e) {
    if (e.code !== "FULL") throw e;
    $("#full").classList.add("on");
    setTimeout(() => $("#full").classList.remove("on"), 2500);
    return false;
  }
}
function goHome() { $("#after").classList.remove("on"); show("home"); renderHome(S.art?.theme); }

$("#bDone").onclick = async () => {
  if (S.busy || !board.labels) return;
  S.busy = true; closePop(); fx.sparkleStop();
  await fx.finish(S.art.parts || []);
  S.done = true;
  await saveWork();
  $("#after").classList.add("on");
  fx.sparkleStart(); S.busy = false;
};
$("#aHome").onclick = goHome;
$("#aAgain").onclick = () => $("#after").classList.remove("on");
$("#bHome").onclick = async () => {
  if (S.busy) return;
  fx.flush(); closePop();
  if (painter.history.size) await saveWork();   // 有畫東西才存；沒畫完的作品牆會標 ✏️
  goHome();
};

$$(".tool").forEach(b => b.onclick = () => {
  const t = b.dataset.tool;
  if (S.tool === t && (t === "brush" || t === "sticker")) return togglePop(t);   // 已選的工具再點一次 → 開選單
  S.tool = t; closePop();
  $$(".tool").forEach(x => x.classList.toggle("on", x === b));
});
$("#bColor").onclick = () => togglePop("color");
$("#bMat").onclick = () => togglePop("mat");
$("#bClip").onclick = () => { S.clip = !S.clip; $("#bClip").classList.toggle("on", S.clip); };
$("#bUndo").onclick = () => { fx.flush(); painter.undo(); };
hold($("#bClear"), () => { fx.flush(); painter.clearAll(); });

function refreshBar() {
  $("#bColor .dot").style.background = S.color;
  const cv = $("#bMat canvas");
  cv.getContext("2d").drawImage(previewMat(S.mat, S.color, cv.width), 0, 0);
}

// ── 彈出選單 ──
let popKind = null;
function closePop() { popKind = null; $("#pop").classList.remove("on"); }
function togglePop(kind) { if (popKind === kind) closePop(); else renderPop(kind); }
function renderPop(kind) {
  popKind = kind;
  const P = $("#pop");
  P.replaceChildren();
  P.classList.add("on");
  if (kind === "color") for (const c of COLORS) {
    const b = button("sw" + (c === S.color ? " on" : ""), "", () => { S.color = c; refreshBar(); closePop(); }, c);
    b.style.background = c; P.append(b);
  }
  if (kind === "mat") for (const m of MATS) {
    const b = button("opt" + (m === S.mat ? " on" : ""), "", () => { S.mat = m; refreshBar(); closePop(); }, m.pattern || m.kind);
    b.append(previewMat(m, S.color, 120)); P.append(b);
  }
  if (kind === "brush") {
    const r1 = el("div", "row"), r2 = el("div", "row");
    for (const [id, icon] of BRUSHES) r1.append(button("opt" + (id === S.brush ? " on" : ""), icon, () => { S.brush = id; renderPop("brush"); }, id));
    SIZES.forEach((_, i) => r2.append(button("opt size" + (i === S.size ? " on" : ""),
      `<i style="width:${12 + i * 14}px;height:${12 + i * 14}px"></i>`, () => { S.size = i; renderPop("brush"); }, "size" + i)));
    P.append(r1, r2);
  }
  if (kind === "sticker") for (const s of STICKERS) {
    const b = button("opt" + (s.id === S.sticker ? " on" : ""), "", () => { S.sticker = s.id; closePop(); }, s.id), img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.svg);
    b.append(img); P.append(b);
  }
}

// ── 手勢：只認第一根手指畫畫；150 毫秒內放上第二根 → 取消那一筆改成縮放；之後才放上來的當手掌，不理 ──
const stage = $("#stage"), touches = new Map();
let g1 = null, pinch = null, lastTwoTap = 0;
const strokeOpts = () => ({ brush: S.tool === "eraser" ? "eraser" : S.brush, size: SIZES[S.size], mat: S.mat, color: S.color, clip: S.clip });

function startPinch() {
  const [a, b] = [...touches.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: board.view.s, img: board.toImage(mid.x, mid.y), mid0: mid, t: performance.now(), moved: 0 };
  if (g1) g1.mode = "pinch";
}
stage.addEventListener("pointerdown", e => {
  if (S.busy || !board.labels) return;
  closePop();
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 1) {
    g1 = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, mode: "tap" };
    if (S.tool === "brush" || S.tool === "eraser") {
      fx.flush();
      const pt = board.toImage(e.clientX, e.clientY);
      painter.strokeStart(pt.x, pt.y, strokeOpts());
      g1.mode = "draw";
    }
  } else if (touches.size === 2 && g1 && !pinch) {
    if (g1.mode === "tap") startPinch();
    else if (g1.mode === "draw" && performance.now() - g1.t < 150) { painter.strokeCancel(); startPinch(); }
  }
});
stage.addEventListener("pointermove", e => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size >= 2) {
    const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch.moved = Math.max(pinch.moved, Math.abs(d - pinch.d0), Math.hypot(mid.x - pinch.mid0.x, mid.y - pinch.mid0.y));
    board.zoomAt(pinch.img.x, pinch.img.y, mid.x, mid.y, pinch.s0 * d / pinch.d0);
    return;
  }
  if (!g1 || e.pointerId !== g1.id) return;
  g1.moved = Math.max(g1.moved, Math.hypot(e.clientX - g1.x, e.clientY - g1.y));
  if (g1.mode === "draw") {
    const evs = e.getCoalescedEvents?.() || [];   // iPad 一幀會合併好幾個點，全部畫才順
    for (const ev of evs.length ? evs : [e]) { const pt = board.toImage(ev.clientX, ev.clientY); painter.strokeMove(pt.x, pt.y); }
  }
});
function up(e) {
  if (!touches.has(e.pointerId)) return;
  touches.delete(e.pointerId);
  if (pinch) {
    if (touches.size === 0) {
      const now = performance.now();
      if (now - pinch.t < 250 && pinch.moved < 12) {   // 兩指輕點；連點兩下 → 回到原本大小
        if (now - lastTwoTap < 400) { board.fit(); lastTwoTap = 0; } else lastTwoTap = now;
      }
      pinch = null; g1 = null;
    }
    return;
  }
  if (!g1 || e.pointerId !== g1.id) return;
  const g = g1;
  g1 = null;
  if (g.mode === "draw") { if (e.type === "pointercancel") painter.strokeCancel(); else painter.strokeEnd(); return; }
  if (g.mode === "tap" && g.moved < 20 && e.type === "pointerup") tapAt(e.clientX, e.clientY);
}
stage.addEventListener("pointerup", up);
stage.addEventListener("pointercancel", up);

async function tapAt(cx, cy) {
  const pt = board.toImage(cx, cy);
  if (S.tool === "fill") {
    const id = painter.regionAt(pt.x, pt.y);
    if (id >= 0) fx.ripple(painter.fill(id, S.mat, S.color), pt.x, pt.y);
  } else if (S.tool === "sticker") {
    fx.flush();
    painter.sticker(await stickerImage(S.sticker), pt.x, pt.y, STICKER_SIZE[S.size]);
  }
}

// ── 作品牆 ──
let viewing = null, urls = [];
async function renderGallery() {
  show("gallery");
  urls.forEach(u => URL.revokeObjectURL(u));
  urls = [];
  const works = await G.list();
  $("#works").replaceChildren(...works.map(w => {
    const u = URL.createObjectURL(w.thumb);
    urls.push(u);
    return card(u, () => openWork(w), "", w.done ? "" : "✏️");
  }));
}
function openWork(w) {
  viewing = w;
  const u = URL.createObjectURL(w.image || w.thumb);
  urls.push(u);
  $("#vImg").src = u;
  $("#view").classList.add("on");
}
$("#toGallery").onclick = renderGallery;
$("#gBack").onclick = () => { show("home"); renderHome(); };
$("#gTip").onclick = () => $("#tip").classList.toggle("on");
$("#vClose").onclick = () => $("#view").classList.remove("on");
$("#vEdit").onclick = async () => {
  const a = INDEX.arts.find(x => x.id === viewing.art);
  $("#view").classList.remove("on");
  if (a) await startArt(a, viewing);
};
$("#vSave").onclick = () => G.saveToPhotos(viewing.image || viewing.thumb);
hold($("#vDel"), async () => { await G.remove(viewing.id); $("#view").classList.remove("on"); renderGallery(); });

// ── 開始 ──
window.addEventListener("resize", () => { if (board.labels && $("#paint").classList.contains("on")) board.fit(); });
window.__draw = { S, board, painter, fx, G, show, renderHome, startArt, renderGallery, COLORS };
(async () => {
  G.persist();
  refreshBar();
  INDEX = await (await fetch(ART_DIR + "index.json?v=1")).json();
  const art = Q.get("art");
  if (art) await startArt(INDEX.arts.find(a => ART_DIR + a.file === art) || { id: "dev", url: art, parts: [] });
  else { show("home"); renderHome(); }
})();
