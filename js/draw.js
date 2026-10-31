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
  // flash = true：沒按滿就放開 → 紅圈閃一下，提示要按住
  const stop = flash => {
    const was = timer !== null;
    clearTimeout(timer); timer = null; btn.classList.remove("holding");
    if (flash && was) { btn.classList.remove("flash"); void btn.offsetWidth; btn.classList.add("flash"); setTimeout(() => btn.classList.remove("flash"), 400); }
  };
  btn.addEventListener("pointerdown", e => { e.stopPropagation(); stop(false); btn.classList.add("holding"); timer = setTimeout(() => { stop(false); fn(); }, 1000); });
  for (const t of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(t, () => stop(true));
}

// ── 首頁 ──
function renderHome(theme) {
  theme = theme || INDEX.themes[0]?.id;
  $("#themes").replaceChildren(...INDEX.themes.map(t => {
    const b = button("big" + (t.id === theme ? " on" : ""), "", () => renderHome(t.id), t.name);
    b.textContent = t.icon;
    return b;
  }));
  const arts = INDEX.arts.filter(a => a.theme === theme && (DEV || !a.test));
  $("#arts").replaceChildren(...arts.map(a => {
    const c = card(ART_DIR + (a.thumb || a.file) + "?v=1", () => startArt(a), a.level === 1 ? "⭐" : "⭐⭐⭐");
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
  $("#loading").classList.add("on");
  try {
    let ok;
    try { ok = await board.load(a.url || ART_DIR + a.file + "?v=1"); }
    catch (e) {
      if (my !== loadSeq) return false;   // 已經被更新的請求取代，不要動畫面
      console.warn("線稿載入失敗：" + (e && e.message));   // 不用 console.error：測試把它當頁面錯誤
      toast("⚠️ 這張圖打不開");
      show("home"); renderHome(a.theme);
      return false;
    }
    if (!ok) return false;
    painter.reset();
    S.art = a; S.workId = null; S.done = false;
    if (work) {
      if (work.w && (work.w !== board.W || work.h !== board.H)) { console.warn("作品尺寸跟線稿不同，從空白開始"); toast("⚠️ 舊畫打不開，從空白開始"); }
      else try {
        for (const [blob, ctx] of [[work.color, board.ctx], [work.glit, board.gctx]]) {
          if (!blob) continue;
          const bmp = await createImageBitmap(blob);
          ctx.clearRect(0, 0, board.W, board.H); ctx.drawImage(bmp, 0, 0);
          bmp.close?.();
        }
        S.workId = work.id; S.done = !!work.done;   // 還原成功才沿用舊作品，失敗時不要拿空白蓋掉它
      } catch (e) {
        console.warn("作品還原失敗：" + (e && e.message));
        toast("⚠️ 舊畫打不開，從空白開始");
        board.ctx.fillStyle = "#fff"; board.ctx.fillRect(0, 0, board.W, board.H);
        board.gctx.clearRect(0, 0, board.W, board.H);
      }
    }
    return true;
  } finally {
    if (my === loadSeq) { board.wrap.style.visibility = ""; S.busy = false; $("#loading").classList.remove("on"); }
  }
}

let toastTimer = 0;
function toast(text, ms = 2500) {
  const t = $("#toast");
  t.textContent = text; t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), ms);
}
// 回傳 "ok" / "full"（作品牆滿了）/ "error"（其他錯誤，已跳提示）；不往外丟錯
async function saveWork() {
  let c = null;
  toast("💾", 60000);
  const mine = toastTimer;
  try {
    c = board.composite();
    const w = { id: S.workId || G.newId(), art: S.art.id, done: S.done, w: board.W, h: board.H, thumb: await G.thumbOf(c), image: await G.toBlob(c),
      color: await G.toBlob(board.color), glit: await G.toBlob(board.glit) };
    await G.save(w); S.workId = w.id;
    return "ok";
  } catch (e) {
    if (e && e.code === "FULL") return "full";
    console.warn("存檔失敗：" + (e && e.message));
    toast("⚠️ 沒存到");
    return "error";
  } finally {
    if (c) c.width = c.height = 0;
    // 存檔期間的 💾 收掉；若期間跳了別的提示（滿了／沒存到），以那個為準
    if (toastTimer === mine && $("#toast").textContent === "💾") { clearTimeout(toastTimer); $("#toast").classList.remove("on"); }
  }
}
function goHome() { $("#after").classList.remove("on"); show("home"); renderHome(S.art?.theme); }
// 作品牆滿了：提示一下就進整理模式，讓大人刪幾件；整理完按 🏠 回到原本那張畫
function galleryFull() {
  toast("🖼️ 滿了", 1200);
  setTimeout(() => { tidy = true; renderGallery(); }, 1200);
}

$("#bDone").onclick = async () => {
  if (S.busy || !board.labels) return;
  S.busy = true; closePop(); fx.sparkleStop(); fx.flush(); board.fit(); S.done = true;
  let r = "ok";
  try {
    const saving = saveWork();                 // 邊播動畫邊存
    await fx.finish(S.art.parts || []);
    r = await saving;
  } finally { S.busy = false; fx.sparkleStart(); }
  if (r === "full") galleryFull(); else $("#after").classList.add("on");
};
$("#aHome").onclick = goHome;
$("#aAgain").onclick = () => $("#after").classList.remove("on");
$("#bHome").onclick = async () => {
  if (S.busy) return;
  S.busy = true; fx.flush(); closePop();
  let r = "ok";
  try { if (painter.history.size) r = await saveWork(); }   // 有畫東西才存；沒畫完的作品牆會標 ✏️
  finally { S.busy = false; }
  if (r === "full") galleryFull();
  else if (r === "ok") goHome();
};

const firstPop = { brush: true, sticker: true };   // 開頁後第一次選到這兩個工具時，自動打開它的選單
$$(".tool").forEach(b => b.onclick = () => {
  const t = b.dataset.tool;
  if (S.tool === t && (t === "brush" || t === "sticker")) return togglePop(t);   // 已選的工具再點一次 → 開選單
  S.tool = t; closePop();
  $$(".tool").forEach(x => x.classList.toggle("on", x === b));
  if (firstPop[t]) { firstPop[t] = false; renderPop(t); }
});
$("#bColor").onclick = () => togglePop("color");
$("#bMat").onclick = () => togglePop("mat");
$("#bClip").onclick = () => { S.clip = !S.clip; $("#bClip").classList.toggle("on", S.clip); };
$("#bUndo").onclick = () => { if (S.busy) return; fx.flush(); painter.undo(); };
hold($("#bClear"), () => { if (S.busy) return; fx.flush(); painter.clearAll(); });

const stickerSrc = s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.svg);
function refreshBar() {
  $("#bColor .dot").style.background = S.color;
  const cv = $("#bMat canvas");
  cv.getContext("2d").drawImage(previewMat(S.mat, "#9e9e9e", cv.width), 0, 0);   // 工具列的材質預覽固定用灰色
}
// 筆刷鈕、貼紙鈕跟著目前選的筆與貼紙變
function refreshTools() {
  $('[data-tool="brush"]').textContent = BRUSHES.find(b => b[0] === S.brush)?.[1] || "🖊️";
  const s = STICKERS.find(x => x.id === S.sticker), img = new Image();
  img.alt = ""; if (s) img.src = stickerSrc(s);
  $('[data-tool="sticker"]').replaceChildren(img);
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
    for (const [id, icon] of BRUSHES) r1.append(button("opt" + (id === S.brush ? " on" : ""), icon, () => { S.brush = id; refreshTools(); renderPop("brush"); }, id));
    SIZES.forEach((_, i) => r2.append(button("opt size" + (i === S.size ? " on" : ""),
      `<i style="width:${12 + i * 14}px;height:${12 + i * 14}px"></i>`, () => { S.size = i; renderPop("brush"); }, "size" + i)));
    P.append(r1, r2);
  }
  if (kind === "sticker") for (const s of STICKERS) {
    const b = button("opt" + (s.id === S.sticker ? " on" : ""), "", () => { S.sticker = s.id; refreshTools(); closePop(); }, s.id), img = new Image();
    img.src = stickerSrc(s);
    b.append(img); P.append(b);
  }
}

// ── 手勢：只認第一根手指畫畫；150 毫秒內放上第二根 → 取消那一筆改成縮放；之後才放上來的當手掌，整段接觸期間都不理 ──
const stage = $("#stage"), touches = new Map(), palms = new Set();
let g1 = null, pinch = null, lastTwoTap = 0;
const strokeOpts = () => ({ brush: S.tool === "eraser" ? "eraser" : S.brush, size: SIZES[S.size], mat: S.mat, color: S.color, clip: S.clip });

function startPinch(idA, idB) {
  const a = touches.get(idA), b = touches.get(idB), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  pinch = { ids: [idA, idB], d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: board.view.s, img: board.toImage(mid.x, mid.y), mid0: mid, t: performance.now(), moved: 0 };
  if (g1) g1.mode = "pinch";
}
// 上一輪的放開事件遺失（系統手勢、切 App）時，新的第一根手指一放下就把舊狀態清乾淨
function resetGestures() {
  if (g1 && g1.mode === "draw") painter.strokeEnd();
  touches.clear(); palms.clear(); g1 = null; pinch = null;
}
stage.addEventListener("pointerdown", e => {
  if (S.busy || !board.labels) return;
  if (popKind) { closePop(); return; }          // 選單開著時，第一下只關選單
  if (e.isPrimary) resetGestures();
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const now = performance.now();
  if (!g1 && !pinch) {
    g1 = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now, moved: 0, mode: "tap" };
    if (S.tool === "brush" || S.tool === "eraser") {
      fx.flush();
      const pt = board.toImage(e.clientX, e.clientY);
      painter.strokeStart(pt.x, pt.y, strokeOpts());
      g1.mode = "draw";
    }
  } else if (g1 && !pinch && (g1.mode === "tap" || (g1.mode === "draw" && now - g1.t < 150))) {
    if (g1.mode === "draw") painter.strokeCancel();
    startPinch(g1.id, e.pointerId);
  } else palms.add(e.pointerId);                // 手掌或第三根手指
});
stage.addEventListener("pointermove", e => {
  if (!touches.has(e.pointerId) || palms.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) {
    if (!pinch.ids.includes(e.pointerId)) return;
    const [a, b] = pinch.ids.map(id => touches.get(id));
    if (!a || !b) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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
  if (palms.delete(e.pointerId)) return;
  if (pinch) {
    if (pinch.ids.every(id => !touches.has(id))) {
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
    const img = await stickerImage(S.sticker).catch(() => null);
    if (img) painter.sticker(img, pt.x, pt.y, STICKER_SIZE[S.size]);   // 貼紙圖壞了就略過這一下
  }
}

// ── 作品牆 ──
let viewing = null, urls = [], viewUrl = null, tidy = false;
function revokeUrls() {
  urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
  if (viewUrl) { URL.revokeObjectURL(viewUrl); viewUrl = null; }
}
async function renderGallery() {
  show("gallery");
  $("#view").classList.remove("on");
  $("#tidyTip").classList.toggle("on", tidy);
  urls.forEach(u => URL.revokeObjectURL(u));
  urls = [];
  let works;
  try { works = await G.list(); }
  catch (e) { console.warn("作品牆讀取失敗：" + (e && e.message)); toast("⚠️ 作品牆打不開"); $("#works").replaceChildren(); return; }
  const cards = works.map(w => {
    if (!w.thumb) return null;   // 壞掉的一件不拖累整面牆
    const u = URL.createObjectURL(w.thumb);
    urls.push(u);
    return card(u, () => openWork(w), "", w.done ? "" : "✏️");
  }).filter(Boolean);
  $("#works").replaceChildren(...(cards.length ? cards : [el("div", "empty", "🖍️ ➜ 🖼️")]));
}
function openWork(w) {
  viewing = w;
  if (viewUrl) URL.revokeObjectURL(viewUrl);
  viewUrl = URL.createObjectURL(w.image || w.thumb);
  $("#vImg").src = viewUrl;
  $("#vEdit").style.display = tidy ? "none" : "";   // 整理模式只能刪、不能接著畫
  $("#view").classList.add("on");
}
$("#toGallery").onclick = renderGallery;
$("#gBack").onclick = () => {
  revokeUrls();
  $("#view").classList.remove("on");
  if (tidy) { tidy = false; show("paint"); }   // 整理完回到原本那張畫（畫布沒重載）
  else { show("home"); renderHome(); }
};
$("#gTip").onclick = () => $("#tip").classList.toggle("on");
$("#vClose").onclick = () => $("#view").classList.remove("on");
$("#vEdit").onclick = async () => {
  const a = INDEX.arts.find(x => x.id === viewing.art);
  $("#view").classList.remove("on");
  if (a) await startArt(a, viewing);
};
$("#vSave").onclick = async () => {
  try { await G.saveToPhotos(viewing.image || viewing.thumb); }
  catch (e) { console.warn("存到相簿失敗：" + (e && e.message)); toast("⚠️ 沒存到相簿"); }
};
hold($("#vDel"), async () => {
  try { await G.remove(viewing.id); }
  catch (e) { console.warn("刪除失敗：" + (e && e.message)); toast("⚠️ 刪不掉"); return; }
  $("#view").classList.remove("on"); renderGallery();
});

// ── 開始 ──
window.addEventListener("resize", () => { if (board.labels && $("#paint").classList.contains("on")) board.fit(); });
window.__draw = { S, board, painter, fx, G, show, renderHome, startArt, renderGallery, COLORS };
(async () => {
  G.persist();
  refreshBar(); refreshTools();
  try {
    const res = await fetch(ART_DIR + "index.json?v=1");
    if (!res.ok) throw new Error("HTTP " + res.status);
    INDEX = await res.json();
  } catch (e) {
    console.warn("線稿清單載入失敗：" + (e && e.message));
    toast("⚠️ 載入失敗，請連上網路再開一次", 8000);
    return;
  }
  const art = DEV ? Q.get("art") : null;   // ?art= 只給開發測試用
  if (art) await startArt(INDEX.arts.find(a => ART_DIR + a.file === art) || { id: "dev", url: art, parts: [] });
  else { show("home"); renderHome(); }
})();
