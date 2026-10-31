// 畫畫遊戲主程式：首頁、畫畫頁（工具列、彈出選單、手勢）、完成、作品牆
import { Board } from "./draw-canvas.js?v=6";
import { cutoutMask } from "./draw-core.js?v=6";
import { Painter, previewMat, previewBrush } from "./draw-paint.js?v=6";
import { Fx } from "./draw-fx.js?v=6";
import * as G from "./draw-gallery.js?v=6";
import { STICKERS, stickerImage } from "./draw-stickers.js?v=6";
import * as A from "./draw-audio.js?v=6";
import { Particles } from "./draw-particles.js?v=6";
import { play as playMusic } from "./draw-music.js?v=6";

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
const BRUSHES = ["magic", "marker", "crayon", "rainbow", "watercolor", "spray", "neon", "sparkle", "pencil", "chalk"];   // magic＝魔法筆：塗到哪、配好的顏色就出現在哪
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
let homeUrls = [], homeSeq = 0;
function renderHome(theme) {
  theme = theme || INDEX.themes[0]?.id;
  // 主題：圖示＋名字的膠囊鈕，選中的整顆換成那個主題的顏色（圖示沒生出來就用 emoji）
  $("#themes").replaceChildren(...INDEX.themes.map(t => {
    const b = button("theme" + (t.id === theme ? " on" : ""), "", () => { if (t.id !== theme) renderHome(t.id); }, t.name);
    b.style.setProperty("--c", t.color || "#ffc93c");
    b.append(t.img ? Object.assign(new Image(), { src: ART_DIR.replace("lineart/", "ui/") + t.img + "?v=6", alt: "", className: "ico" }) : el("span", "emo", t.icon),
      el("span", "name", t.name));
    b.dataset.sfx = "pick";
    return b;
  }));
  // 三欄：左一顆星、中兩顆星、右三顆星（欄頭標一次就好，卡片上不再各掛一個）；每張卡固定在自己難度那一欄
  const arts = INDEX.arts.filter(a => a.theme === theme && (DEV || !a.test)), nth = {};
  const heads = [1, 2, 3].map(lv => {
    const h = el("div", "colhead", [0, 1, 2].map(i => `<b class="${i < lv ? "lit" : ""}">★</b>`).join(""));
    h.style.gridColumn = String(lv); h.style.gridRow = "1";
    return h;
  });
  $("#arts").replaceChildren(...heads, ...arts.map((a, i) => {
    const c = card(ART_DIR + (a.thumb || a.file) + "?v=6", () => startArt(a));
    c.dataset.id = a.id; c.dataset.sfx = "open";
    const lv = Math.min(3, a.level || 1);
    nth[lv] = (nth[lv] || 0) + 1;
    c.style.gridColumn = String(lv); c.style.gridRow = String(nth[lv] + 1);
    c.style.setProperty("--i", i);   // 一張接一張彈進來
    return c;
  }));
  markHomeCards(theme);
}
// 畫過的卡片換成小孩自己塗的那張（最新的一件）＋右下角完成章；只畫了一半的掛 ✏️。作品牆讀不到就維持線稿
async function markHomeCards(theme) {
  const seq = ++homeSeq;
  let works = [];
  try { works = await G.list(); } catch { return; }
  if (seq !== homeSeq) return;   // 讀的時候又換了主題
  homeUrls.forEach(u => URL.revokeObjectURL(u)); homeUrls = [];
  const latest = new Map();
  for (const w of works) if (w.thumb && !latest.has(w.art)) latest.set(w.art, w);   // list() 新的在前
  for (const c of $$("#arts .card")) {
    const w = latest.get(c.dataset.id);
    if (!w) continue;
    const u = URL.createObjectURL(w.thumb);
    homeUrls.push(u);
    c.querySelector("img").src = u;
    c.classList.add("mine");
    c.append(el("span", w.done ? "stamp" : "wip", w.done ? "✔" : "✏️"));
  }
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
    try { ok = await board.load(a.url || ART_DIR + a.file + "?v=6"); }
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
    if (S.done && canLive(S.art)) {   // 畫完的單角色圖：剪下來，住進「我的世界」
      const cut = cutout(c);
      if (cut) { w.cut = await G.toBlob(cut); w.cw = cut.width; w.ch = cut.height; cut.width = cut.height = 0; }
    }
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

// 能住進「我的世界」的圖：一、兩顆星的圖（主角剪得出來；index.json 可用 world: true/false 個別指定）；三顆星是整片場景，剪下來不像角色
const canLive = a => !!a && !a.test && (a.world ?? (a.level || 1) <= 2);
// 剪下角色：碰到圖邊的區塊變透明、外框留著，裁到角色的範圍、最長邊縮到 600 像素
function cutout(c) {
  const r = cutoutMask(board.labels, board.W, board.H);
  if (!r) return null;
  const { mask, x0, y0, x1, y1 } = r, w = x1 - x0 + 1, h = y1 - y0 + 1, W = board.W;
  const img = c.getContext("2d").getImageData(x0, y0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!mask[(y + y0) * W + x + x0]) d[(y * w + x) * 4 + 3] = 0;
  const t = document.createElement("canvas");
  t.width = w; t.height = h; t.getContext("2d").putImageData(img, 0, 0);
  const k = Math.min(1, 600 / Math.max(w, h));
  if (k === 1) return t;
  const o = document.createElement("canvas");
  o.width = Math.round(w * k); o.height = Math.round(h * k);
  o.getContext("2d").drawImage(t, 0, 0, o.width, o.height);
  t.width = t.height = 0;
  return o;
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
function goHome() { music?.stop(); $("#after").classList.remove("on"); show("home"); renderHome(S.art?.theme); }
// 作品牆滿了：提示一下就進整理模式，讓大人刪幾件；整理完按 🏠 回到原本那張畫
function galleryFull() {
  toast("🖼️ 滿了", 1200);
  setTimeout(() => { tidy = true; renderGallery(); }, 1200);
}

$("#bDone").onclick = async () => {
  if (S.busy || !board.labels) return;
  S.busy = true; closePop(); fx.sparkleStop(); fx.flush(); board.fit(); S.done = true;
  $(".tap-hint")?.remove();   // 按完成就不再提示「在這裡畫」（不然會蓋在慶祝畫面的圖上）
  let r = "ok";
  try {
    const saving = saveWork();                 // 邊播動畫邊存
    setTimeout(() => A.sfx("finish"), 550);   // 跟彩帶噴出來同時
    await fx.finish(S.art.parts || []);
    r = await saving;
    if (r !== "full") await bigCheer();
  } finally { S.busy = false; fx.sparkleStart(); }
  if (r === "full") galleryFull(); else showAfter(true);
};
// 完成的大章：畫面中央吉祥物＋三顆大星星依序蹦出來，停 1.5 秒再收到右邊的慶祝欄（最開心的那一刻要夠大）
function bigCheer() {
  const d = el("div", "big-cheer", '<img src="IMAGE/draw/ui/mascot.png?v=6" alt="" onerror="this.remove()"><p><span>★</span><span>★</span><span>★</span></p>');
  $("#paint").append(d);
  [0, 180, 360].forEach((t, i) => setTimeout(() => A.note(10 + i * 2, { gain: 0.22, dur: 0.7 }), 350 + t));   // 一顆星一個音
  return new Promise(ok => setTimeout(() => { d.classList.add("out"); setTimeout(() => { d.remove(); ok(); }, 320); }, 1500));
}
$("#aHome").onclick = goHome;
$("#aAgain").onclick = () => $("#after").classList.remove("on");
async function danceAgain() {
  if (S.busy) return;
  S.busy = true; fx.sparkleStop();
  setTimeout(() => A.sfx("finish", { gain: 0.8 }), 550);
  try { await fx.finish(S.art.parts || []); } finally { S.busy = false; fx.sparkleStart(); }
}
// 完成後的按鈕：有紀錄才出現 ▶️ 回放
function showAfter(quiet = false) {
  $("#aPlay").style.display = canReplay() ? "" : "none";
  $("#after").classList.add("on");
  if (!quiet) [0, 180, 360].forEach((t, i) => setTimeout(() => A.note(10 + i * 2, { gain: 0.2, dur: 0.7 }), 120 + t));   // 三顆星星蹦出來各一個音（剛放完大章就不重複）
}
$("#aPlay").onclick = async () => { $("#after").classList.remove("on"); await replay(); showAfter(); };   // 回放不了（例如正在跳舞）也要把按鈕放回來
$("#rStop").onclick = stopReplay;
// 把畫彈成音樂：光從左掃到右，掃到的顏色變成樂器（js/draw-music.js）；彈的時候吉祥物跟著跳舞
let music = null;
$("#aMusic").onclick = async () => {
  if (S.busy || music || !board.labels) return;
  S.busy = true; $("#after").classList.add("playing");
  const c = board.composite(), host = $("#stage"), o = board.origin(host.getBoundingClientRect());
  music = playMusic({ canvas: c, host, rect: { x: o.x, y: o.y, w: board.W * o.k, h: board.H * o.k }, A, parts });
  try { await music.done; } finally { c.width = c.height = 0; music = null; S.busy = false; $("#after").classList.remove("playing"); }
};
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
  for (const b of $$("#bColor, #mColor")) b.classList.toggle("dim", S.tool === "sticker" || S.tool === "eraser" || (brush && (S.brush === "rainbow" || S.brush === "magic")));
}
const usesMat = () => S.tool === "brush" && S.brush === "marker";   // 材質只有馬克筆用得到
function toMarker(needMat) {
  if (S.tool === "brush" && !(needMat ? S.brush !== "marker" : S.brush === "magic" || S.brush === "rainbow")) return;
  S.tool = "brush"; S.brush = "marker";
  const bb = $('[data-tool="brush"]');
  $$(".tool").forEach(x => x.classList.toggle("on", x === bb));
  refreshTools();
  bb.classList.remove("nudge"); void bb.offsetWidth; bb.classList.add("nudge");
}

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
    b.append(Object.assign(new Image(), { src: "IMAGE/draw/ui/btn-clip.png?v=6", alt: "", className: "ico" }));
    return b;
  };
  if (kind === "color") {   // 上面 30 色（每個顏色一個音，從左到右往上爬），下面一排材質
    const sw = el("div", "swatches"), mats = el("div", "mats");   // 材質不再變淡：點了會自動換成馬克筆
    COLORS.forEach((c, i) => {
      const b = button("sw" + (c === S.color ? " on" : ""), "", () => { S.color = c; A.note(i % 10 + (i / 10 | 0) * 2); toMarker(false); refreshBar(); closeSoon(); }, c);
      b.dataset.sfx = "none"; b.style.background = c; sw.append(b);
    });
    for (const m of MATS) {
      const b = button("opt mat" + (m === S.mat ? " on" : ""), "", () => { S.mat = m; toMarker(true); refreshBar(); again(); closeSoon(); }, m.pattern || m.kind);
      b.append(previewMat(m, S.color, 96)); mats.append(b);
    }
    P.append(sw, mats);
  }
  if (kind === "brush") {   // 左邊 8 種筆（用目前的顏色畫一段給小孩看），右邊粗細＋不出線；選了就收起來
    const r1 = el("div", "brushes"), side = el("div", "side row");
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
    if ((c.o.brush === "sparkle" || c.o.brush === "magic") && (c.ding += d) > c.o.size * (c.o.brush === "magic" ? 7 : 4)) { c.ding = 0; A.chime(); }
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
      if (board.view.s < 1.15) board.fit();
      refreshZoom();
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

// ── 刮刮樂驚喜（學 Bimi Boo）：隨機一張圖用魔法筆的配色畫好，蓋一層銀色刮刮膜，手指刮開；刮掉七成剩下的自己掉光 ──
// 刮的時候 S.busy 擋住一般畫畫；刮完可以「自己畫這張」（畫布清回白色、照常畫）或「再刮一張」
const SC = { on: false, ctx: null, last: null, timer: 0 };
async function startScratch() {
  if (S.busy && !SC.on) return;
  const pool = INDEX.arts.filter(a => !a.test && a.id !== S.art?.id);
  const a = pool[(Math.random() * pool.length) | 0];
  endScratch(false);
  if (!a || !(await startArt(a))) return;
  const b = board;
  b.ctx.drawImage(painter.magicPaint(), 0, 0);   // 直接畫上去、不記復原、不觸發存檔（不是小孩畫的）
  $(".tap-hint")?.remove();
  const f = $("#foil"), r = b.stage.getBoundingClientRect(), host = $("#paint").getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const o = b.origin(r), w = b.W * o.k, h = b.H * o.k;   // 刮刮膜只蓋在圖上
  Object.assign(f.style, { left: r.left - host.left + o.x + "px", top: r.top - host.top + o.y + "px", width: w + "px", height: h + "px" });
  f.width = Math.round(w * dpr); f.height = Math.round(h * dpr);
  const x = f.getContext("2d", { willReadFrequently: true });
  const g = x.createLinearGradient(0, 0, f.width, f.height);
  ["#f2c94c", "#fff3b0", "#e0b13a", "#ffe58a", "#d9a52e"].forEach((c, i) => g.addColorStop(i / 4, c));   // 金色刮刮膜
  x.globalCompositeOperation = "source-over"; x.fillStyle = g; x.fillRect(0, 0, f.width, f.height);
  for (let i = 0; i < 30; i++) {   // 膜上撒淡淡的星星和愛心，看起來像刮刮卡
    x.globalAlpha = 0.25 + Math.random() * 0.25; x.fillStyle = i % 2 ? "#fff8d6" : "#c8962a";
    const cx = Math.random() * f.width, cy = Math.random() * f.height, r = (18 + Math.random() * 22) * dpr;
    x.beginPath();
    if (i % 3) for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; x.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
    else { x.moveTo(cx, cy + r * 0.8); x.bezierCurveTo(cx - r * 1.3, cy - r * 0.2, cx - r * 0.5, cy - r * 1.1, cx, cy - r * 0.35); x.bezierCurveTo(cx + r * 0.5, cy - r * 1.1, cx + r * 1.3, cy - r * 0.2, cx, cy + r * 0.8); }
    x.fill();
  }
  x.globalAlpha = 1;
  // 手指來回擦的提示，第一次刮就消失
  const hint = el("div", "foil-hint");   // 不能掛 tap-hint：showHint() 會把所有 .tap-hint 清掉
  Object.assign(hint.style, { left: parseFloat(f.style.left) + w / 2 + "px", top: parseFloat(f.style.top) + h / 2 + "px" });
  $("#paint").append(hint);
  $$("#scratchBar .sstar").forEach(s => s.classList.remove("lit"));
  Object.assign(SC, { on: true, ctx: x, last: null, dpr, art: a });
  S.busy = true;
  $("#paint").classList.add("scratching");
  f.classList.add("on");
}
function scratchAt(cx, cy) {
  const f = $("#foil"), r = f.getBoundingClientRect(), k = SC.dpr, x = SC.ctx;
  const p = { x: (cx - r.left) * k, y: (cy - r.top) * k }, R = 46 * k;
  x.globalCompositeOperation = "destination-out"; x.lineCap = "round"; x.lineWidth = R * 2;
  x.beginPath(); x.moveTo((SC.last || p).x, (SC.last || p).y); x.lineTo(p.x + 0.01, p.y); x.stroke();
  SC.last = p;
  if (Math.random() < 0.35) parts.trail(cx, cy, { brush: "sparkle", color: "#fff176" });
  clearTimeout(SC.timer); SC.timer = setTimeout(checkScratch, 250);
}
function checkScratch() {   // 每 4 格取一點，刮掉超過 70% → 剩下的淡出、慶祝
  if (!SC.on) return;
  const f = $("#foil"), d = SC.ctx.getImageData(0, 0, f.width, f.height).data;
  let left = 0, all = 0;
  for (let i = 3; i < d.length; i += 64) { all++; if (d[i] > 30) left++; }
  const open = 1 - left / all;
  $$("#scratchBar .sstar").forEach((s, i) => {
    if (open >= [0.3, 0.5, 0.7][i] && !s.classList.contains("lit")) { s.classList.add("lit"); A.note(8 + i * 2, { gain: 0.18 }); }
  });
  if (open < 0.7) return;
  f.classList.add("gone");
  A.strokeOff(); A.sfx("finish"); A.chime();
  const r = f.getBoundingClientRect();
  parts.splash(r.left + r.width / 2, r.top + r.height / 2, null);
  parts.stars(r.left + r.width / 2, r.top + r.height / 2, Math.min(r.width, r.height) * 0.6);
  setTimeout(() => $("#scratchBar").classList.add("on"), 600);
}
function endScratch(paintIt) {
  if (!SC.on) return;
  SC.on = false; clearTimeout(SC.timer); A.strokeOff(); $(".foil-hint")?.remove();
  const f = $("#foil");
  f.classList.remove("on", "gone"); f.width = f.height = 0;
  $("#scratchBar").classList.remove("on");
  $("#paint").classList.remove("scratching");
  S.busy = false;
  if (paintIt && board.labels) {   // 自己畫：清回白色（剛剛的彩色是魔法配色，不算小孩的畫）
    board.ctx.fillStyle = "#fff"; board.ctx.fillRect(0, 0, board.W, board.H); board.gctx.clearRect(0, 0, board.W, board.H);
    painter.reset(); refreshUndo(); showHint();
  }
}
{
  const f = $("#foil");
  f.addEventListener("pointerdown", e => { if (!SC.on) return; $(".foil-hint")?.remove(); SC.last = null; A.strokeOn("chalk"); scratchAt(e.clientX, e.clientY); });
  f.addEventListener("pointermove", e => {
    if (!SC.on || !(e.buttons || e.pointerType === "touch")) return;
    for (const ev of e.getCoalescedEvents?.() || [e]) scratchAt(ev.clientX, ev.clientY);
    A.strokeSpeed(1.2);
  });
  for (const t of ["pointerup", "pointercancel"]) f.addEventListener(t, () => { SC.last = null; A.strokeOff(); });
}
$("#toScratch").onclick = startScratch;
$("#sAgain").onclick = startScratch;
$("#sPaint").onclick = () => endScratch(true);
$("#sHome").onclick = () => { endScratch(true); goHome(); };

function refreshZoom() { $("#paint").classList.toggle("zoomed", !!board.labels && board.view.s > 1.01); }
$("#bZoom").onclick = () => { board.fit(); refreshZoom(); };
{ const fit0 = board.fit.bind(board); board.fit = (...a) => { const r = fit0(...a); refreshZoom(); return r; }; }   // 任何地方縮回原大小，縮回鈕都跟著收

// ── 第一次玩的提示：在一塊不貼邊的最大區塊上放一隻來回塗的手（用手指在這裡畫）；畫過一筆就不再出現 ──
function hintSeen() { try { return !!localStorage.getItem("draw-hinted"); } catch { return true; } }
function showHint() {
  $(".tap-hint")?.remove();
  if (hintSeen() || S.tool !== "brush" || !board.boxes || SC.on || S.done || $("#after").classList.contains("on")) return;   // 刮刮樂時不出提示（開圖後下一格才補放，會蓋在刮刮膜上）
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
  const blanks = Array.from({ length: Math.max(0, 6 - cards.length) }, (_, i) => {   // 作品少的時候補虛線空畫框：等你來畫，點了回首頁
    const b = button("card blank", '<img class="ico" src="IMAGE/draw/ui/btn-edit.png?v=6" alt="" onerror="this.remove()">', () => { show("home"); renderHome(); }, "去畫畫");
    b.style.setProperty("--i", cards.length + i);
    return b;
  });
  $("#works").replaceChildren(...cards, ...blanks);
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
// 工具列放左邊或右邊（左手拿筆的小孩，手不會一直壓到工具列）；記在這台平板上
function setSide(left) {
  $("#paint").classList.toggle("left", left);
  $("#tSide").classList.toggle("left", left);
  try { localStorage.setItem("draw-side", left ? "left" : "right"); } catch { /* 私密瀏覽 */ }
  closePop();
  if (board.labels) requestAnimationFrame(() => board.fit());
}
$("#tSide").onclick = () => setSide(!$("#paint").classList.contains("left"));
setSide((() => { try { return localStorage.getItem("draw-side") === "left"; } catch { return false; } })());

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
  ["#aAgain, #vEdit", "btn-edit"], ["#aMusic", "mode-music"], ["#vClose", "btn-close"], ["#vSave", "btn-save"], ["#tMusic", "btn-music"], ["#tSound", "btn-sound"]];
function applyIcons() {
  for (const [sel, name] of ICONS) for (const b of $$(sel)) {
    const img = new Image();
    img.className = "ico"; img.alt = "";
    img.onload = () => {   // 換掉按鈕裡的 emoji（文字或包著 emoji 的 span），其他零件（按住的紅圈、徽章）不動
      const t = [...b.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()) || b.querySelector("span:not(.dot)");
      if (t) t.replaceWith(img);
    };
    img.src = "IMAGE/draw/ui/" + name + ".png?v=6";
  }
}

// ── 開始 ──
window.addEventListener("resize", () => { if (board.labels && $("#paint").classList.contains("on")) { board.fit(); showHint(); } });
window.__draw = { S, board, painter, fx, G, A, show, renderHome, startArt, renderGallery, COLORS, AUTO, setFull, autoSave, isDirty: () => dirty, SC, startScratch,
  replay, stopReplay, rec: () => rec, parts, cutout, canLive, music: () => music };
(async () => {
  G.persist();
  refreshBar(); refreshTools(); refreshUndo(); refreshToggles(); applyIcons();
  try {
    const res = await fetch(ART_DIR + "index.json?v=6");
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
