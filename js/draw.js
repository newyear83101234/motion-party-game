// 畫畫遊戲主程式：首頁、畫畫頁（工具列、彈出選單、手勢）、完成、作品牆
import { Board } from "./draw-canvas.js?v=4";
import { Painter, previewMat, previewBrush } from "./draw-paint.js?v=4";
import { Fx } from "./draw-fx.js?v=4";
import * as G from "./draw-gallery.js?v=4";
import { STICKERS, stickerImage } from "./draw-stickers.js?v=4";
import * as A from "./draw-audio.js?v=4";
import { Particles } from "./draw-particles.js?v=4";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const DEV = Q.has("dev");   // 網址帶 ?dev 才看得到測試用線稿
const ART_DIR = "IMAGE/draw/lineart/";
const COLORS = ["#e53935", "#f06292", "#ad1457", "#ff7043", "#fb8c00", "#ffb300", "#fdd835", "#fff176",
  "#c0ca33", "#7cb342", "#43a047", "#00897b", "#4dd0e1", "#29b6f6", "#1e88e5", "#3949ab",
  "#7e57c2", "#8e24aa", "#8d6e63", "#5d4037", "#bdbdbd", "#757575", "#212121", "#ffffff",
  "#ffe0bd", "#f1c27d", "#c68642", "#ffcdd2", "#c8e6c9", "#bbdefb"];   // 最後一排：三種膚色＋三種粉嫩色（畫人物用）
const MATS = [{ kind: "solid" }, { kind: "gradient" }, { kind: "rainbowgrad" }, { kind: "glitter" },
  ...["star", "heart", "dot", "stripe", "snow"].map(p => ({ kind: "pattern", pattern: p }))];   // 漸層：亮→暗立體感、彩虹
const BRUSHES = ["marker", "crayon", "rainbow", "watercolor", "spray", "neon", "sparkle", "pencil"];
const AUTO = { ms: 10000 };            // 畫了東西多久沒再動就自動存檔（測試會改它）
const SIZES = [10, 22, 40];            // 筆刷半徑（畫布像素）
const STICKER_SIZE = [120, 200, 300];  // 貼紙邊長，跟著筆刷粗細

const S = { tool: "brush", brush: "marker",   // 沒有油漆桶：一開始就是畫筆（阿葉：要小孩多用手畫）
   size: 1, color: COLORS[0], mat: MATS[0], sticker: "star", clip: true,
  art: null, workId: null, done: false, busy: false, autoOff: false };
const board = new Board($("#stage"));
const painter = new Painter(board);
const fx = new Fx(board);
const parts = new Particles($("#stage"));
let INDEX = { themes: [], arts: [] };

function show(id) {
  if (id !== "paint") { setFull(false); $(".tap-hint")?.remove(); }
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

// 按鈕在手指放開時就觸發，不等瀏覽器自己合成 click：反應比較快，也避免畫完一筆後第一下按鈕被瀏覽器吃掉
// （無頭 Chrome 實測會發生）。之後 700 毫秒內瀏覽器補送的真 click 一律吞掉：免得觸發兩次，也免得換畫面後
// 點到新畫面同一位置的東西（幽靈點擊）。按住型按鈕（.hold）照舊
let downBtn = null, downXY = [0, 0], fired = 0;
document.addEventListener("pointerdown", e => {
  A.unlock(); A.startBgm();   // iOS 只能在使用者點擊時打開聲音
  const b = e.target.closest?.("button");
  downBtn = b && !b.classList.contains("hold") && !b.disabled ? b : null;
  downXY = [e.clientX, e.clientY];
}, true);
document.addEventListener("pointerup", e => {
  A.unlock(); A.startBgm();   // iOS 觸控的 pointerdown 不算「使用者啟動」，放開那一下才能打開聲音
  const b = e.target.closest?.("button");
  if (!b || b !== downBtn || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 20) return;
  downBtn = null; fired = performance.now();
  const snd = b.dataset.sfx || "tap";   // 每顆按鈕的聲音：data-sfx 指定，"none" = 按鈕自己的動作會出聲
  if (snd !== "none") A.sfx(snd);
  b.click();
}, true);
document.addEventListener("pointercancel", () => { downBtn = null; }, true);
document.addEventListener("click", e => {
  if (e.isTrusted && performance.now() - fired < 700) { e.stopPropagation(); e.preventDefault(); }   // b.click() 自己送的不是 isTrusted
}, true);

// ── 首頁 ──
function renderHome(theme) {
  theme = theme || INDEX.themes[0]?.id;
  // 主題：圖示＋名字的膠囊鈕，選中的整顆換成那個主題的顏色（圖示沒生出來就用 emoji）
  $("#themes").replaceChildren(...INDEX.themes.map(t => {
    const b = button("theme" + (t.id === theme ? " on" : ""), "", () => { if (t.id !== theme) renderHome(t.id); }, t.name);
    b.style.setProperty("--c", t.color || "#ffc93c");
    b.append(t.img ? Object.assign(new Image(), { src: ART_DIR.replace("lineart/", "ui/") + t.img + "?v=4", alt: "", className: "ico" }) : el("span", "emo", t.icon),
      el("span", "name", t.name));
    b.dataset.sfx = "pick";
    return b;
  }));
  const arts = INDEX.arts.filter(a => a.theme === theme && (DEV || !a.test));
  $("#arts").replaceChildren(...arts.map((a, i) => {
    const lit = Math.min(3, a.level || 1);   // 難度一律三格：簡單一顆亮、中等兩顆、困難三顆
    const c = card(ART_DIR + (a.thumb || a.file) + "?v=4", () => startArt(a), [0, 1, 2].map(i => `<b class="${i < lit ? "lit" : ""}">★</b>`).join(""));
    c.dataset.id = a.id; c.dataset.sfx = "open";
    c.style.setProperty("--i", i);   // 一張接一張彈進來
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
    try { ok = await board.load(a.url || ART_DIR + a.file + "?v=4"); }
    catch (e) {
      if (my !== loadSeq) return false;   // 已經被更新的請求取代，不要動畫面
      console.warn("線稿載入失敗：" + (e && e.message));   // 不用 console.error：測試把它當頁面錯誤
      toast("⚠️ 這張圖打不開");
      show("home"); renderHome(a.theme);
      return false;
    }
    if (!ok) return false;
    painter.reset();
    S.art = a; S.workId = null; S.done = false; S.autoOff = false;
    rec = []; recN = 0;
    dirty = false; clearTimeout(autoTimer); refreshUndo();
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
        rec = work.log ? work.log.slice() : null;   // 舊版存的作品沒有紀錄 → 這件不能回放
        recN = rec ? rec.reduce((n, x) => n + (x.p ? x.p.length : 2), 0) : 0;
      } catch (e) {
        console.warn("作品還原失敗：" + (e && e.message));
        toast("⚠️ 舊畫打不開，從空白開始");
        board.ctx.fillStyle = "#fff"; board.ctx.fillRect(0, 0, board.W, board.H);
        board.gctx.clearRect(0, 0, board.W, board.H);
      }
    }
    requestAnimationFrame(showHint);
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
// 回傳 "ok" / "full"（作品牆滿了）/ "error"（其他錯誤）；不往外丟錯
// quiet = 自動存檔：不跳任何提示，作品牆滿了就這張先不自動存（等按 🏠／✔️ 再走整理流程）
// 一次只存一件、照順序排隊，免得同一張新畫被存成兩件
let saveQ = Promise.resolve();
function saveWork(quiet = false) {
  const run = saveQ.then(() => doSave(quiet));
  saveQ = run;   // doSave 不會往外丟錯，排隊不會斷
  return run;
}
async function doSave(quiet) {
  if (!S.art || !board.labels) return "error";
  if (replaying) return "ok";   // 回放中畫布是重畫到一半的樣子，不能存（回放結束會放回原本的畫）
  let c = null, mine = 0;
  const seq = loadSeq;
  if (!quiet) { toast("💾", 60000); mine = toastTimer; }
  try {
    dirty = false;   // 存檔途中又畫了東西 → onChange 會再設回 true，下一次自動存檔補上
    const w = { id: S.workId || G.newId(), art: S.art.id, done: S.done, w: board.W, h: board.H, log: rec ? rec.slice() : null };
    c = board.composite();
    // 四張圖同一刻送去編碼，存下來的才是同一個瞬間的畫面
    [w.thumb, w.image, w.color, w.glit] = await Promise.all([G.thumbOf(c), G.toBlob(c), G.toBlob(board.color), G.toBlob(board.glit)]);
    await G.save(w);
    if (seq === loadSeq) S.workId = w.id;   // 存檔途中已經換了別張圖，就不要把這個編號套到新的那張
    return "ok";
  } catch (e) {
    if (seq === loadSeq) dirty = true;   // 已經換了別張圖就不要把新的那張標成沒存
    if (e && e.code === "FULL") { if (quiet) S.autoOff = true; return "full"; }
    console.warn("存檔失敗：" + (e && e.message));
    if (!quiet) toast("⚠️ 沒存到");
    return "error";
  } finally {
    if (c) c.width = c.height = 0;
    // 存檔期間的 💾 收掉；若期間跳了別的提示（滿了／沒存到），以那個為準
    if (!quiet && toastTimer === mine && $("#toast").textContent === "💾") { clearTimeout(toastTimer); $("#toast").classList.remove("on"); }
  }
}

// ── 自動存檔：畫了東西 10 秒沒再動、或切到別的 App／關掉分頁時，悄悄存一份（作品牆標 ✏️），當掉或被關掉也不會整張不見 ──
let dirty = false, autoTimer = 0;
function autoSave() {
  clearTimeout(autoTimer);
  if (S.busy || S.autoOff || !S.art || !board.labels || !$("#paint").classList.contains("on")) return;
  fx.flush();   // 填色水波還在跑 → 先讓它進顏色層，才存得到（會觸發 onChange 設 dirty）
  if (dirty) saveWork(true);
}
painter.onChange = () => {
  refreshUndo();
  dirty = true;
  clearTimeout(autoTimer); autoTimer = setTimeout(autoSave, AUTO.ms);
};
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") autoSave(); });
window.addEventListener("pagehide", autoSave);
function refreshUndo() { for (const b of $$("#bUndo, #mUndo")) b.classList.toggle("dim", !painter.history.size); }

// ── 畫畫過程紀錄：每一筆、每次填色、貼紙、復原、清空都記下來，跟作品一起存，完成後可以回放 ──
// rec = null 表示這件作品沒有完整紀錄（舊版存的、或記太多了），就不給回放
const REC_MAX = 150000;   // 最多記這麼多個座標數字（約 7 萬 5 千個點），超過就停止記錄
let rec = [], recN = 0;
function log(a) {
  if (!rec) return;
  recN += a.p ? a.p.length : 2;
  if (recN > REC_MAX) { rec = null; return; }
  rec.push(a);
}
const canReplay = () => !!(rec && rec.length);

// ── 回放：畫布先清白，照紀錄一筆一筆重畫（太長就加速，最多約 15 秒），播完放回原本的畫 ──
// 用另一組 Painter／Fx，不動到原本的復原紀錄；回放期間 S.busy 擋住所有操作
let replaying = null;
const frame = () => new Promise(r => requestAnimationFrame(r));
const sleep = (ms, my) => new Promise(r => { const t = setTimeout(r, ms); my.wake = () => { clearTimeout(t); r(); }; });
async function replay() {
  if (S.busy || !canReplay() || !board.labels) return false;
  S.busy = true;
  const b = board, my = replaying = { stop: false, wake: null }, list = rec.slice();
  let keep = null, RP = null, RF = null;
  // 準備工作也放在 try 裡：iPad 記憶體不夠 getImageData 丟錯時，finally 照樣解除 busy，不會整個卡死
  try {
    closePop(); fx.flush(); fx.sparkleStop(); board.fit();
    await saveQ;   // 等正在跑的存檔讀完畫布，才把畫布清白（不然可能把空白存成作品）
    keep = { c: b.ctx.getImageData(0, 0, b.W, b.H), g: b.gctx.getImageData(0, 0, b.W, b.H) };
    RP = new Painter(b); RF = new Fx(b);
    $("#paint").classList.add("replaying");
    b.ctx.fillStyle = "#fff"; b.ctx.fillRect(0, 0, b.W, b.H); b.gctx.clearRect(0, 0, b.W, b.H);
    const dur = list.map(a => (a.t === "s" ? Math.max(150, pathLen(a.p) / 2.2) : a.t === "f" ? 450 : a.t === "k" ? 320 : 250));
    const k = Math.min(1, 15000 / dur.reduce((x, y) => x + y, 0));
    await sleep(500, my);
    for (let i = 0; i < list.length && !my.stop; i++) {
      const a = list[i], d = Math.max(16, dur[i] * k);   // 動作很多時每個最少一格畫面，總長才壓得在 15 秒左右
      if (a.t === "s") await replayStroke(RP, a, d, my);
      else if (a.t === "f") {
        const id = RP.regionAt(a.x, a.y);
        if (id >= 0) { RF.ripple(RP.fill(id, a.m, a.c), a.x, a.y, d * 0.8); A.sfx("fill", { gain: 0.5 }); }
        await sleep(d, my); RF.flush();
      } else if (a.t === "k") {
        const img = await stickerImage(a.s).catch(() => null);
        if (img) { RP.sticker(img, a.x, a.y, a.z); A.sfx("sticker", { gain: 0.5 }); }
        await sleep(d, my);
      } else if (a.t === "u") { RP.undo(); await sleep(d, my); }
      else if (a.t === "c") { RP.clearAll(); await sleep(d, my); }
    }
    if (!my.stop) { A.sfx("magic"); await sleep(1400, my); }
  } catch (e) { console.warn("回放出錯：" + (e && e.message)); }
  finally {
    RF?.flush(); A.strokeOff();
    b.lctx.clearRect(0, 0, b.W, b.H);
    if (keep) { b.ctx.putImageData(keep.c, 0, 0); b.gctx.putImageData(keep.g, 0, 0); }
    RP?.reset();
    $("#paint").classList.remove("replaying");
    replaying = null; S.busy = false; fx.sparkleStart();
  }
  return true;
}
async function replayStroke(RP, a, d, my) {
  const p = a.p, n = p.length / 2;
  RP.strokeStart(p[0], p[1], { brush: a.b, size: a.z, color: a.c, mat: a.m, clip: a.k });
  A.strokeOn(a.b);
  const t0 = performance.now();
  let i = 1;
  while (i < n && !my.stop) {
    await frame();
    const want = Math.min(n, Math.ceil(n * (performance.now() - t0) / d));
    for (; i < want; i++) RP.strokeMove(p[i * 2], p[i * 2 + 1]);
    A.strokeSpeed(1);
  }
  if (my.stop) RP.strokeCancel(); else RP.strokeEnd();
  A.strokeOff();
}
function pathLen(p) { let s = 0; for (let i = 2; i < p.length; i += 2) s += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return s; }
function stopReplay() { if (replaying) { replaying.stop = true; replaying.wake?.(); } }
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
    setTimeout(() => A.sfx("finish"), 550);   // 跟彩帶噴出來同時
    await fx.finish(S.art.parts || []);
    r = await saving;
  } finally { S.busy = false; fx.sparkleStart(); }
  if (r === "full") galleryFull(); else showAfter();
};
$("#aHome").onclick = goHome;
$("#aAgain").onclick = () => $("#after").classList.remove("on");
async function danceAgain() {
  if (S.busy) return;
  S.busy = true; fx.sparkleStop();
  setTimeout(() => A.sfx("finish", { gain: 0.8 }), 550);
  try { await fx.finish(S.art.parts || []); } finally { S.busy = false; fx.sparkleStart(); }
}
// 完成後的按鈕：有紀錄才出現 ▶️ 回放
function showAfter() {
  $("#aPlay").style.display = canReplay() ? "" : "none";
  $("#after").classList.add("on");
  [0, 180, 360].forEach((t, i) => setTimeout(() => A.note(10 + i * 2, { gain: 0.2, dur: 0.7 }), 120 + t));   // 三顆星星蹦出來各一個音
}
$("#aPlay").onclick = async () => { $("#after").classList.remove("on"); await replay(); showAfter(); };   // 回放不了（例如正在跳舞）也要把按鈕放回來
$("#rStop").onclick = stopReplay;
$("#bHome").onclick = async () => {
  if (S.busy) return;
  S.busy = true; fx.flush(); closePop();
  let r = "ok";
  try {   // 先等正在跑的自動存檔，之後還有沒存到的改動才再存一次；沒畫完的作品牆會標 ✏️
    await saveQ;
    if (dirty) r = await saveWork();
  }
  finally { S.busy = false; }
  if (r === "full") galleryFull();
  else if (r === "ok") goHome();
};

const firstPop = { sticker: true };   // 開頁後第一次選到貼紙時，自動打開它的選單（畫筆一開始就選好了，點第二下才開）
const HAS_POP = new Set(["brush", "sticker", "eraser"]);   // 這三個工具再點一次有選單（筆／粗細／不出線、貼紙、橡皮擦粗細／不出線）
$$(".tool").forEach(b => b.onclick = () => {
  const t = b.dataset.tool;
  if (S.tool === t && HAS_POP.has(t)) return togglePop(t, b);   // 已選的工具再點一次 → 開選單
  S.tool = t; closePop();
  $$(".tool").forEach(x => x.classList.toggle("on", x === b));
  refreshDims(); showHint();
  if (firstPop[t]) { firstPop[t] = false; renderPop(t, b); }
});
for (const id of ["#bColor", "#mColor"]) $(id).onclick = () => togglePop("color", $(id));   // 顏色＋材質在同一個選單
$("#bUndo").onclick = $("#mUndo").onclick = () => { if (S.busy) return; fx.flush(); if (painter.undo()) log({ t: "u" }); };
hold($("#bClear"), () => { if (S.busy) return; fx.flush(); painter.clearAll(); log({ t: "c" }); A.sfx("clear"); });

// ── 全螢幕：工具列收起來、畫布放到最大，右上角只留 ⤡／顏色／復原；瀏覽器支援的話（iPad Safari）順便藏起網址列 ──
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function setFull(on) {
  if ($("#paint").classList.contains("full") === on) return;
  closePop();
  $("#paint").classList.toggle("full", on);
  const m = $("#mFull");   // 剛進全螢幕：「離開」鈕跳兩下，讓小孩知道從這裡回去
  m.classList.remove("hint");
  if (on) { void m.offsetWidth; m.classList.add("hint"); }
  const d = document.documentElement;
  try {
    const p = on ? (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d)
      : fsEl() && (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    p?.catch?.(() => {});   // 不給全螢幕（iPhone、從主畫面開）就只換版面
  } catch { /* 同上 */ }
  requestAnimationFrame(() => { if (board.labels) { board.fit(); showHint(); } });
}
$("#bFull").onclick = () => { if (!S.busy) setFull(true); };   // 畫布左上角的小圓鈕
$("#mFull").onclick = () => setFull(false);
// 用瀏覽器自己的方式離開全螢幕（iPad 左上角 ✕、往下滑）→ 版面也跟著回來
// 反過來：按了 ⤢ 又馬上按離開，瀏覽器晚一步才進全螢幕 → 這時再把它退出來，兩邊保持一致
for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(ev, () => {
  const full = $("#paint").classList.contains("full");
  if (!fsEl()) setFull(false);
  else if (!full) try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {}); } catch { /* 不支援就算了 */ }
});

const stickerSrc = s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.svg);
function refreshBar() {   // 顏色鈕的圓點＝目前顏色＋材質（亮粉、圖樣、漸層也看得出來）
  const bg = S.mat.kind === "solid" ? S.color : `center / cover url(${previewMat(S.mat, S.color, 64).toDataURL()})`;
  for (const d of $$("#bColor .dot, #mColor .dot")) d.style.background = bg;
  refreshTools();   // 筆刷鈕的筆跡預覽跟著顏色變
}
// 筆刷鈕顯示目前那支筆用目前顏色畫的一小段（跟筆刷選單長得一樣）；貼紙鈕顯示目前的貼紙
function refreshTools() {
  const bb = $('[data-tool="brush"]');
  bb.replaceChildren(previewBrush(S.brush, S.color, 168, 100));
  bb.dataset.brush = S.brush;
  const s = STICKERS.find(x => x.id === S.sticker), img = new Image();
  img.alt = ""; if (s) img.src = stickerSrc(s);
  $('[data-tool="sticker"]').replaceChildren(img);
  refreshDims();
}
// 目前的工具用不到的設定鈕變淡（仍可以按，先選好等一下用）：彩虹筆、貼紙、橡皮擦不看顏色；只有填色桶和馬克筆吃材質
function refreshDims() {
  const brush = S.tool === "brush";
  for (const b of $$("#bColor, #mColor")) b.classList.toggle("dim", S.tool === "sticker" || S.tool === "eraser" || (brush && S.brush === "rainbow"));
}
const usesMat = () => S.tool === "brush" && S.brush === "marker";   // 材質只有馬克筆用得到

// ── 彈出選單 ──
let popKind = null, popTimer = 0;
function closePop() { clearTimeout(popTimer); popKind = null; $("#pop").classList.remove("on"); }
function closeSoon() { clearTimeout(popTimer); popTimer = setTimeout(closePop, 250); }   // 先讓小孩看到選中的框，再收起來
let popFrom = null;   // 打開選單的那顆按鈕：選單貼在它旁邊，小三角指著它
function togglePop(kind, from) { if (popKind === kind) closePop(); else renderPop(kind, from); }
function renderPop(kind, from = popFrom) {
  clearTimeout(popTimer);
  popKind = kind; popFrom = from;
  const P = $("#pop"), again = () => renderPop(kind, from);
  P.replaceChildren();
  P.className = "pop on " + kind;
  // 粗細一直排；不出線開關（盾牌，右下角 ✓ 開／✕ 關）放在筆刷和橡皮擦的選單裡
  const sizes = () => {
    const c = el("div", "sizes");
    SIZES.forEach((_, i) => c.append(button("opt size" + (i === S.size ? " on" : ""),
      `<i style="width:${12 + i * 14}px;height:${12 + i * 14}px"></i>`, () => { S.size = i; again(); closeSoon(); }, "size" + i)));
    return c;
  };
  const clip = () => {
    const b = button("opt clip" + (S.clip ? " yes" : ""), "", () => { S.clip = !S.clip; again(); }, "不出線");
    b.append(Object.assign(new Image(), { src: "IMAGE/draw/ui/btn-clip.png?v=4", alt: "", className: "ico" }));
    return b;
  };
  if (kind === "color") {   // 上面 30 色（每個顏色一個音，從左到右往上爬），下面一排材質
    const sw = el("div", "swatches"), mats = el("div", "mats" + (usesMat() ? "" : " dim"));
    COLORS.forEach((c, i) => {
      const b = button("sw" + (c === S.color ? " on" : ""), "", () => { S.color = c; A.note(i % 6 + (i / 6 | 0)); refreshBar(); closeSoon(); }, c);
      b.dataset.sfx = "none"; b.style.background = c; sw.append(b);
    });
    for (const m of MATS) {
      const b = button("opt mat" + (m === S.mat ? " on" : ""), "", () => { S.mat = m; refreshBar(); again(); closeSoon(); }, m.pattern || m.kind);
      b.append(previewMat(m, S.color, 96)); mats.append(b);
    }
    P.append(sw, mats);
  }
  if (kind === "brush") {   // 左邊 8 種筆（用目前的顏色畫一段給小孩看），右邊粗細＋不出線；選了就收起來
    const r1 = el("div", "brushes"), side = el("div", "side");
    for (const id of BRUSHES) {
      const b = button("opt wide" + (id === S.brush ? " on" : ""), "", () => { S.brush = id; refreshTools(); again(); closeSoon(); }, id);
      b.append(previewBrush(id, S.color)); r1.append(b);
    }
    side.append(sizes(), clip());
    P.append(r1, side);
  }
  if (kind === "eraser") P.append(sizes(), clip());
  if (kind === "sticker") for (const s of STICKERS) {
    const b = button("opt" + (s.id === S.sticker ? " on" : ""), "", () => { S.sticker = s.id; refreshTools(); again(); closeSoon(); }, s.id), img = new Image();
    img.src = stickerSrc(s);
    b.append(img); P.append(b);
  }
  for (const b of P.querySelectorAll(".opt")) b.dataset.sfx = "pick";
  placePop(P, from);
}
// 選單上緣對齊按鈕附近（夾在畫面內），右邊的小三角指著按鈕中間
function placePop(P, from) {
  if (!from || !from.isConnected) { P.style.top = ""; P.style.removeProperty("--ay"); return; }
  const host = $("#paint").getBoundingClientRect(), r = from.getBoundingClientRect(), h = P.offsetHeight;
  const mid = r.top - host.top + r.height / 2, top = Math.max(12, Math.min(host.height - h - 12, mid - 44));
  P.style.top = top + "px";
  P.style.setProperty("--ay", (mid - top) + "px");
}

// ── 手勢：只認第一根手指畫畫；150 毫秒內放上第二根 → 取消那一筆改成縮放；之後才放上來的當手掌，整段接觸期間都不理 ──
const stage = $("#stage"), touches = new Map(), palms = new Set();
let g1 = null, pinch = null, lastTwoTap = 0;
const strokeOpts = () => ({ brush: S.tool === "eraser" ? "eraser" : S.brush, size: SIZES[S.size], mat: S.mat, color: S.color, clip: S.clip });

function startPinch(idA, idB) {
  const a = touches.get(idA), b = touches.get(idB), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  $(".tap-hint")?.remove();   // 縮放後提示的位置就不對了
  pinch = { ids: [idA, idB], d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: board.view.s, img: board.toImage(mid.x, mid.y), mid0: mid, t: performance.now(), moved: 0 };
  if (g1) g1.mode = "pinch";
}
// 上一輪的放開事件遺失（系統手勢、切 App）時，新的第一根手指一放下就把舊狀態清乾淨
function resetGestures() {
  if (g1 && g1.mode === "draw") pen.end();
  touches.clear(); palms.clear(); g1 = null; pinch = null;
}

// ── 一筆畫都經過這裡：畫進畫布、記錄（回放用）、沙沙聲、筆尖粒子、星星筆叮鈴 ──
const pen = {
  cur: null,
  start(cx, cy, t) {
    const o = strokeOpts(), pt = board.toImage(cx, cy);
    painter.strokeStart(pt.x, pt.y, o);
    this.cur = { o, p: [Math.round(pt.x), Math.round(pt.y)], last: pt, t, cx, cy, ding: 0 };
    A.strokeOn(o.brush);
    parts.trail(cx, cy, o, true);
  },
  move(cx, cy, t) {
    const c = this.cur;
    if (!c) return;
    const pt = board.toImage(cx, cy), d = Math.hypot(pt.x - c.last.x, pt.y - c.last.y);
    painter.strokeMove(pt.x, pt.y);
    if (d >= 3) { c.p.push(Math.round(pt.x), Math.round(pt.y)); c.last = pt; }   // 回放只記每 3 像素一個點
    A.strokeSpeed(d / Math.max(4, t - c.t)); c.t = t;
    if (c.o.brush === "sparkle" && (c.ding += d) > c.o.size * 4) { c.ding = 0; A.chime(); }
    if (Math.hypot(cx - c.cx, cy - c.cy) > 14) { parts.trail(cx, cy, c.o); c.cx = cx; c.cy = cy; }
  },
  end() {
    const c = this.cur;
    this.cur = null;
    painter.strokeEnd(); A.strokeOff();
    if (c) log({ t: "s", b: c.o.brush, z: c.o.size, c: c.o.color, m: c.o.mat, k: c.o.clip, p: c.p });
    if (c && c.p.length > 8) hintDone();   // 真的畫了一筆（不是點一下）→ 提示功成身退
  },
  cancel() { this.cur = null; painter.strokeCancel(); A.strokeOff(); },
};
stage.addEventListener("pointerdown", e => {
  if (S.busy || !board.labels) return;
  if (popKind) { closePop(); return; }          // 選單開著時，第一下只關選單
  if ($("#after").classList.contains("on")) { danceAgain(); return; }   // 完成後點畫 → 再跳一次舞
  if (e.isPrimary) resetGestures();
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const now = performance.now();
  if (!g1 && !pinch) {
    g1 = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now, moved: 0, mode: "tap" };
    if (S.tool === "brush" || S.tool === "eraser") {
      fx.flush();
      pen.start(e.clientX, e.clientY, e.timeStamp);
      g1.mode = "draw";
    }
  } else if (g1 && !pinch && (g1.mode === "tap" || (g1.mode === "draw" && now - g1.t < 150))) {
    if (g1.mode === "draw") pen.cancel();
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
    for (const ev of evs.length ? evs : [e]) pen.move(ev.clientX, ev.clientY, ev.timeStamp);
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
  if (g.mode === "draw") { if (e.type === "pointercancel") pen.cancel(); else pen.end(); return; }
  if (g.mode === "tap" && g.moved < 20 && e.type === "pointerup") tapAt(e.clientX, e.clientY);
}
stage.addEventListener("pointerup", up);
stage.addEventListener("pointercancel", up);

async function tapAt(cx, cy) {
  const pt = board.toImage(cx, cy);
  if (S.tool === "sticker") {   // 點一下的工具只剩貼紙（油漆桶拿掉了；舊作品紀錄裡的填色回放時照樣播）
    fx.flush();
    const img = await stickerImage(S.sticker).catch(() => null);
    if (!img) return;   // 貼紙圖壞了就略過這一下
    painter.sticker(img, pt.x, pt.y, STICKER_SIZE[S.size]);
    A.sfx("sticker"); parts.stars(cx, cy, STICKER_SIZE[S.size] * board.base * board.view.s);
    log({ t: "k", s: S.sticker, x: Math.round(pt.x), y: Math.round(pt.y), z: STICKER_SIZE[S.size] });
  }
}

// ── 第一次玩的提示：在一塊不貼邊的最大區塊上放一隻來回塗的手（用手指在這裡畫）；畫過一筆就不再出現 ──
function hintSeen() { try { return !!localStorage.getItem("draw-hinted"); } catch { return true; } }
function showHint() {
  $(".tap-hint")?.remove();
  if (hintSeen() || S.tool !== "brush" || !board.boxes) return;
  const b = board, B = b.boxes.map((r, id) => [r, id]).filter(([r]) => r.x0 > 4 && r.y0 > 4 && r.x1 < b.W - 5 && r.y1 < b.H - 5)
    .sort((p, q) => q[0].area - p[0].area)[0];
  if (!B) return;
  const [r, id] = B, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  let best = null, bd = Infinity;   // 找這一塊裡最靠近中心的點（形狀可能是彎的，中心不一定在塊裡）
  for (let y = r.y0; y <= r.y1; y += 8) for (let x = r.x0; x <= r.x1; x += 8) {
    if (b.labels[y * b.W + x] !== id) continue;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  if (!best) return;
  const p = b.toClient(best[0], best[1]), s = b.stage.getBoundingClientRect(), h = el("div", "tap-hint");
  h.style.left = p.x - s.left + "px"; h.style.top = p.y - s.top + "px";
  b.stage.append(h);
}
function hintDone() { $(".tap-hint")?.remove(); try { localStorage.setItem("draw-hinted", "1"); } catch { /* 私密瀏覽 */ } }

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
  $("#works").replaceChildren(...(cards.length ? cards : [el("div", "empty", '<img src="IMAGE/draw/ui/mascot.png?v=4" alt="" onerror="this.remove()"><img class="ico" src="IMAGE/draw/ui/btn-edit.png?v=4" alt="">')]));   // 還沒有作品：吉祥物拿著畫筆
}
function openWork(w) {
  viewing = w;
  if (viewUrl) URL.revokeObjectURL(viewUrl);
  viewUrl = URL.createObjectURL(w.image || w.thumb);
  $("#vImg").src = viewUrl;
  $("#vEdit").style.display = tidy ? "none" : "";   // 整理模式只能刪、不能接著畫
  $("#vPlay").style.display = !tidy && w.log && w.log.length ? "" : "none";
  $("#view").classList.add("on");
}
$("#toGallery").onclick = renderGallery;
// 音樂、音效開關（記在這台平板上）；關掉時右下角紅色 ✕
function refreshToggles() { $("#tMusic").classList.toggle("off", !A.musicEnabled()); $("#tSound").classList.toggle("off", !A.soundEnabled()); }
$("#tMusic").onclick = () => { A.setMusic(!A.musicEnabled()); refreshToggles(); A.sfx("tap"); };
$("#tSound").onclick = () => { A.setSound(!A.soundEnabled()); refreshToggles(); A.sfx("tap"); };
$("#gBack").onclick = () => {
  revokeUrls();
  $("#view").classList.remove("on");
  if (tidy) { tidy = false; S.autoOff = false; show("paint"); }   // 整理完回到原本那張畫（畫布沒重載），有空位了自動存檔重新打開
  else { show("home"); renderHome(); }
};
$("#gTip").onclick = () => $("#tip").classList.toggle("on");
$("#vClose").onclick = () => $("#view").classList.remove("on");
$("#vPlay").onclick = async () => {   // 回放：先打開這件作品，再從空白重畫一遍
  const a = INDEX.arts.find(x => x.id === viewing.art);
  $("#view").classList.remove("on");
  if (a && await startArt(a, viewing)) replay();
};
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

// ── 圖示：GPT 生的立體圖示（IMAGE/draw/ui/*.png）載入成功才換掉 emoji，沒有檔案就維持 emoji ──
const ICONS = [["#bDone, #aDone", "btn-done"], ["#bHome, #gBack, #aHome", "btn-home"], ['[data-tool="eraser"]', "tool-eraser"],
  ["#bUndo, #mUndo", "btn-undo"], ["#bClear, #vDel", "btn-clear"], ["#toGallery", "btn-gallery"], ["#aPlay, #vPlay", "btn-play"],
  ["#aAgain, #vEdit", "btn-edit"], ["#vClose", "btn-close"], ["#vSave", "btn-save"], ["#tMusic", "btn-music"], ["#tSound", "btn-sound"]];
function applyIcons() {
  for (const [sel, name] of ICONS) for (const b of $$(sel)) {
    const img = new Image();
    img.className = "ico"; img.alt = "";
    img.onload = () => {   // 換掉按鈕裡的 emoji（文字或包著 emoji 的 span），其他零件（按住的紅圈、徽章）不動
      const t = [...b.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()) || b.querySelector("span:not(.dot)");
      if (t) t.replaceWith(img);
    };
    img.src = "IMAGE/draw/ui/" + name + ".png?v=4";
  }
}

// ── 開始 ──
window.addEventListener("resize", () => { if (board.labels && $("#paint").classList.contains("on")) { board.fit(); showHint(); } });
window.__draw = { S, board, painter, fx, G, A, show, renderHome, startArt, renderGallery, COLORS, AUTO, setFull, autoSave, isDirty: () => dirty,
  replay, stopReplay, rec: () => rec, parts };
(async () => {
  G.persist();
  refreshBar(); refreshTools(); refreshUndo(); refreshToggles(); applyIcons();
  try {
    const res = await fetch(ART_DIR + "index.json?v=4");
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
