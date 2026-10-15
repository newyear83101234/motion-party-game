// 方塊爆破 — 畫面、拖曳操作、特效、音效、存檔（遊戲規則全在 blocks-core.js）
import * as C from "./blocks-core.js?v=1";

const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d");
let W = 0, H = 0, DPR = 1, now = 0;
const L = {};                 // 版面（layout() 算）
let game = null;              // createGame() 回傳的一局
let locked = false;           // 結束／過關演出中不能操作

// ── 存檔（localStorage 可能被擋，一律 try）──
const store = {
  get(k, d) { try { const v = localStorage.getItem("bb_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("bb_" + k, JSON.stringify(v)); } catch { /* 存不了就算了 */ } },
  del(k) { try { localStorage.removeItem("bb_" + k); } catch { /* 同上 */ } },
};
const opts = Object.assign({ sound: true, vib: true }, store.get("opts", {}));
let best = store.get("best", 0);
if (!Number.isFinite(best)) best = 0;
const adv = Object.assign({ done: [] }, store.get("adv", {}));   // done：過了的關卡號碼
if (!Array.isArray(adv.done)) adv.done = [];
adv.done = adv.done.filter(n => Number.isInteger(n));
let runId = 0;               // 每開一局 +1：結束／過關演出的計時器回來時比對，不是這局的就不演
let bestAtStart = 0, recordShown = false;

// ── 色票：原版那種亮色寶石方塊；最後一個是結束時的灰 ──
const PAL = ["#f2453d", "#f7942b", "#f8cf2f", "#4fc43a", "#2ec2ea", "#3a6fe8", "#a453e4", "#7d86a8"];
const GRAY = 7;
function mix(hex, f) {   // f > 0 混白變亮、f < 0 混黑變暗
  const n = parseInt(hex.slice(1), 16), t = f < 0 ? 0 : 255, p = Math.abs(f);
  const ch = v => Math.round(v + (t - v) * p);
  return `rgb(${ch(n >> 16)},${ch(n >> 8 & 255)},${ch(n & 255)})`;
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// 方塊圖（每種顏色×大小畫一次存起來）
const sprites = new Map();
const qpx = s => Math.max(4, Math.round(s * DPR / 4) * 4);   // 量化成 4 的倍數（動畫中每幀尺寸不同，不量化會一直新建 canvas）
function blockSprite(k, s) {
  const px = qpx(s), key = "b" + k + "|" + px;
  let cvs = sprites.get(key); if (cvs) return cvs;
  cvs = document.createElement("canvas"); cvs.width = cvs.height = px;
  const g = cvs.getContext("2d"), base = PAL[k], e = px * 0.035, b = px * 0.15;
  g.fillStyle = mix(base, -0.5); rrect(g, 0, 0, px, px, px * 0.1); g.fill();
  const x0 = e, x1 = px - e;
  const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
  poly([[x0, x0], [x1, x0], [x1 - b, x0 + b], [x0 + b, x0 + b]], mix(base, 0.5));    // 上斜面（最亮）
  poly([[x0, x0], [x0 + b, x0 + b], [x0 + b, x1 - b], [x0, x1]], mix(base, 0.22));   // 左
  poly([[x1, x0], [x1, x1], [x1 - b, x1 - b], [x1 - b, x0 + b]], mix(base, -0.18));  // 右
  poly([[x0, x1], [x0 + b, x1 - b], [x1 - b, x1 - b], [x1, x1]], mix(base, -0.34));  // 下（最暗）
  const gr = g.createLinearGradient(0, x0 + b, 0, x1 - b);
  gr.addColorStop(0, mix(base, 0.14)); gr.addColorStop(1, mix(base, -0.04));
  g.fillStyle = gr; g.fillRect(x0 + b, x0 + b, x1 - x0 - 2 * b, x1 - x0 - 2 * b);
  g.fillStyle = "rgba(255,255,255,.38)"; g.beginPath(); g.ellipse(px * 0.34, px * 0.3, px * 0.12, px * 0.06, -0.6, 0, Math.PI * 2); g.fill();
  sprites.set(key, cvs); return cvs;
}
// 寶石圖示
const GEM_COL = { r: "#ff3b5c", b: "#3aa7ff", g: "#2fd27a", y: "#ffcc1f" };
function gemSprite(t, s) {
  const px = qpx(s), key = "g" + t + "|" + px;
  let cvs = sprites.get(key); if (cvs) return cvs;
  cvs = document.createElement("canvas"); cvs.width = cvs.height = px;
  const g = cvs.getContext("2d"), c = GEM_COL[t], m = px / 2;
  g.lineJoin = "round"; g.lineWidth = Math.max(1.5, px * 0.07); g.strokeStyle = "rgba(255,255,255,.95)";
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = px * 0.08; g.shadowOffsetY = px * 0.04;
  g.beginPath();
  if (t === "b") {          // 藍鑽：上梯形＋下三角
    g.moveTo(px * 0.3, px * 0.2); g.lineTo(px * 0.7, px * 0.2); g.lineTo(px * 0.9, px * 0.4); g.lineTo(m, px * 0.88); g.lineTo(px * 0.1, px * 0.4);
  } else if (t === "r") {   // 紅寶石：直立菱形
    g.moveTo(m, px * 0.08); g.lineTo(px * 0.86, m); g.lineTo(m, px * 0.92); g.lineTo(px * 0.14, m);
  } else if (t === "g") {   // 綠翡翠：八角形
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(m + Math.cos(a) * px * 0.4, m + Math.sin(a) * px * 0.4); }
  } else {                  // 金星
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? px * 0.2 : px * 0.44; g.lineTo(m + Math.cos(a) * rr, m + px * 0.04 + Math.sin(a) * rr); }
  }
  g.closePath();
  const gr = g.createLinearGradient(0, 0, 0, px); gr.addColorStop(0, mix(c, 0.45)); gr.addColorStop(1, mix(c, -0.25));
  g.fillStyle = gr; g.fill(); g.shadowColor = "transparent"; g.stroke();
  g.fillStyle = "rgba(255,255,255,.6)"; g.beginPath(); g.ellipse(px * 0.4, px * 0.36, px * 0.1, px * 0.05, -0.6, 0, Math.PI * 2); g.fill();
  sprites.set(key, cvs); return cvs;
}

// ── 版面 ──
const probe = document.createElement("div");
probe.style.cssText = "position:fixed;top:0;left:0;height:0;padding-top:env(safe-area-inset-top);visibility:hidden";
document.body.appendChild(probe);
function layout() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const sa = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  const hud = Math.min(170, Math.max(104, H * 0.17)) + sa;
  const B = Math.floor(Math.min(W - 20, (H - hud - 16) / 1.42, 620));
  const pad = Math.round(B * 0.025);
  const cell = (B - pad * 2) / C.N;
  const T = cell * 3.3;
  const free = Math.max(0, H - hud - B - T);
  Object.assign(L, { sa, hud, B, pad, cell, T });
  L.bx = Math.round((W - B) / 2); L.by = Math.round(hud + free * 0.3);
  L.gx = L.bx + pad; L.gy = L.by + pad;
  L.ty = L.by + B + free * 0.35 + T / 2;
  L.slotW = B / 3;
  L.sx = [0, 1, 2].map(i => L.bx + L.slotW * (i + 0.5));
  L.tc = Math.min(cell * 0.56, L.slotW * 0.9 / 5);
  L.gear = { x: W - 34, y: sa + 36, r: 22 };
  sprites.clear(); boardImg = null;
}
window.addEventListener("resize", layout);

// ── 音效（Web Audio 合成，不用音檔）──
const AU = { ctx: null, out: null };
function au() {
  if (!AU.ctx) {
    try {
      AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AU.ctx.createDynamicsCompressor(); comp.connect(AU.ctx.destination);
      AU.out = AU.ctx.createGain(); AU.out.gain.value = 0.7; AU.out.connect(comp);
    } catch { return null; }
  }
  if (AU.ctx.state !== "running") AU.ctx.resume().catch(() => { /* 要等使用者下一次點擊 */ });
  return AU.ctx;
}
function tone(freq, dur, { type = "sine", vol = 0.3, at = 0, to = 0, attack = 0.005 } = {}) {
  if (!opts.sound) return; const a = au(); if (!a) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(AU.out); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq) {
  if (!opts.sound) return; const a = au(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(AU.out); s.start();
}
const semi = (f, n) => f * 2 ** (n / 12);
const sfx = {
  pick() { tone(880, 0.05, { type: "triangle", vol: 0.12 }); },
  place() { tone(196, 0.1, { vol: 0.45, to: 150 }); noise(0.05, 0.5, 2200); },
  back() { tone(330, 0.12, { type: "triangle", vol: 0.12, to: 220 }); },
  clear(lines, combo) {
    const root = semi(523.25, Math.min(combo - 1, 12));   // 連擊越高音越高
    [0, 4, 7, 12, 16].slice(0, 2 + Math.min(lines, 3)).forEach((n, i) => tone(semi(root, n), 0.32, { type: "triangle", vol: 0.22, at: i * 0.055 }));
    noise(0.25, 0.25, 5000);
  },
  praise() { [0, 5, 9, 12, 17, 21].forEach((n, i) => tone(semi(1046.5, n), 0.18, { vol: 0.08, at: 0.12 + i * 0.04 })); },
  over() { [0, -3, -7, -12].forEach((n, i) => tone(semi(392, n), 0.35, { type: "triangle", vol: 0.2, at: i * 0.18 })); },
  win() { [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => tone(semi(523.25, n), 0.28, { type: "triangle", vol: 0.22, at: i * 0.11 })); },
  gem() { tone(1568, 0.12, { vol: 0.12 }); tone(2093, 0.15, { vol: 0.1, at: 0.05 }); },
};
const vib = ms => { if (opts.vib && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* 不支援 */ } };

// ── 特效狀態 ──
const pops = new Map();      // 剛放下的格子 → 開始時間（彈一下）
let bursts = [];             // 消掉的格子（閃一下再碎掉）
let parts = [];              // 碎片
let texts = [];              // 飄字
let flyGems = [];            // 飛去目標欄的寶石
let trayIn = [0, 0, 0];      // 新方塊滑進來的開始時間
let shakeT = -1e9, overT = -1, dispScore = 0, gotDisp = {}, chipBump = {};
let drag = null;             // { i, px, py, t0, snap, pv }
let backAnim = null;         // 放不下 → 飛回托盤
const ease = t => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;
function addText(str, x, y, size, color, { dur = 900, delay = 0, stroke = "#1b2466" } = {}) { texts.push({ str, x, y, size, color, stroke, t0: now + delay, dur }); }

// ── 開局 ──
function resetFx() {
  runId++;
  pops.clear(); bursts = []; parts = []; texts = []; flyGems = []; drag = null; backAnim = null;
  trayIn = [now, now + 70, now + 140]; overT = -1; locked = false;
}
function startClassic(fresh) {
  const saved = !fresh && store.get("save_classic", null);
  game = null;
  if (saved && !saved.over) try { game = C.createGame({ saved }); } catch { store.del("save_classic"); }   // 存檔壞了就開新局
  if (!game) game = C.createGame({ mode: "classic" });
  bestAtStart = best; recordShown = false;
  dispScore = game.S.score; resetFx(); show(null); saveGame();
}
function startLevel(n, fresh) {
  const saved = !fresh && store.get("save_adv", null);
  game = null;
  if (saved && saved.mode === "adventure" && saved.level === n && !saved.over && !saved.won) try { game = C.createGame({ saved }); } catch { store.del("save_adv"); }
  if (!game) game = C.createGame({ mode: "adventure", level: n });
  gotDisp = {}; chipBump = {};
  game.S.goals.forEach(g => { if (g.t === "gem") gotDisp[g.gem] = g.got; });
  dispScore = game.S.score; resetFx(); show(null); saveGame();
}
function saveGame() {
  if (!game) return;
  const k = game.S.mode === "classic" ? "save_classic" : "save_adv";
  if (game.S.over || game.S.won) store.del(k); else store.set(k, game.serialize());
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { saveGame(); drag = null; backAnim = null; }
  else if (AU.ctx) au();
});

// ── 拖曳 ──
function lift(s) { return s.h * L.cell / 2 + L.cell * 0.9; }   // 方塊浮在手指上方，手指不會擋住
function hitGear(x, y) { return Math.hypot(x - L.gear.x, y - L.gear.y) < L.gear.r + 12; }
cv.addEventListener("contextmenu", e => e.preventDefault());
cv.addEventListener("pointerdown", e => {
  au();
  if (!game || locked || current || drag || e.button) return;
  const x = e.clientX, y = e.clientY;
  if (hitGear(x, y)) { show("sPause"); return; }
  if (y < L.by + L.B + 4) return;
  const i = Math.max(0, Math.min(2, Math.floor((x - L.bx) / L.slotW)));
  if (!game.S.tray[i]) return;
  drag = { i, px: x, py: y, t0: now, snap: null, pv: null, pid: e.pointerId };
  backAnim = null;
  try { cv.setPointerCapture(e.pointerId); } catch { /* 舊瀏覽器 */ }
  sfx.pick(); updateSnap();
});
cv.addEventListener("pointermove", e => { if (!drag || e.pointerId !== drag.pid) return; drag.px = e.clientX; drag.py = e.clientY; updateSnap(); });
const endDrag = (e, cancel) => {
  if (!drag || (e && e.pointerId !== drag.pid)) return;
  const d = drag; drag = null;
  au();
  if (current || locked) return;                // 拖曳中跳出暫停等畫面 → 不放
  if (d.snap && !cancel) doPlace(d.i, d.snap.r, d.snap.c);
  else { backAnim = { i: d.i, x: d.px, y: d.py - lift(game.slotShape(d.i)), t0: now }; if (d.py < L.by + L.B) sfx.back(); }
};
cv.addEventListener("pointerup", e => endDrag(e, false));
cv.addEventListener("pointercancel", e => endDrag(e, true));   // 系統取消觸控（來電、邊緣手勢）→ 飛回托盤，不放
// 找最近的合法位置（容許差 0.8 格，跟原版一樣不用對很準）
function updateSnap() {
  const s = game.slotShape(drag.i);
  const fx = (drag.px - s.wd * L.cell / 2 - L.gx) / L.cell;
  const fy = (drag.py - lift(s) - s.h * L.cell / 2 - L.gy) / L.cell;
  let bestP = null, bd = 0.8 * 0.8;
  for (let r = Math.floor(fy) - 1; r <= Math.ceil(fy) + 1; r++) for (let c = Math.floor(fx) - 1; c <= Math.ceil(fx) + 1; c++) {
    const d2 = (r - fy) ** 2 + (c - fx) ** 2;
    if (d2 <= bd && game.canPlace(drag.i, r, c)) { bd = d2; bestP = { r, c }; }
  }
  const changed = !bestP !== !drag.snap || (bestP && (bestP.r !== drag.snap.r || bestP.c !== drag.snap.c));
  drag.snap = bestP;
  if (changed) drag.pv = bestP ? game.preview(drag.i, bestP.r, bestP.c) : null;
}

// ── 放下 ──
function cellXY(r, c) { return [L.gx + (c + 0.5) * L.cell, L.gy + (r + 0.5) * L.cell]; }
function doPlace(i, r, c) {
  const p = game.S.tray[i], s = C.SHAPE_BY_ID[p.id];
  const ev = game.place(i, r, c);
  if (!ev) return;
  ev.placed.forEach(q => pops.set(q.r * C.N + q.c, now));
  sfx.place(); vib(8);
  const [cx, cy] = cellXY(r + (s.h - 1) / 2, c + (s.wd - 1) / 2);
  if (ev.lines) {
    const cr = r + s.h / 2, cc = c + s.wd / 2;
    for (const q of ev.cleared) {
      const delay = Math.hypot(q.r + 0.5 - cr, q.c + 0.5 - cc) * 26;
      bursts.push({ r: q.r, c: q.c, k: p.k, gem: q.gem, t0: now + delay, spawned: false });
      if (q.gem && game.S.mode === "adventure") flyGems.push({ gem: q.gem, r: q.r, c: q.c, t0: now + delay + 140 });
    }
    sfx.clear(ev.lines, ev.combo); vib(ev.lines >= 2 ? 30 : 18);
    const midY = L.gy + L.cell * 3.6;
    if (ev.praise) { addText(ev.praise, W / 2, midY, L.cell * 0.95, "#ffe04a", { dur: 1100 }); sfx.praise(); }
    if (ev.combo >= 2) addText("Combo " + ev.combo, W / 2, midY + L.cell * (ev.praise ? 0.95 : 0), L.cell * 0.62, "#7ff0ff", { dur: 1000, delay: ev.praise ? 90 : 0 });
    addText("+" + (ev.pts.clear + ev.pts.place), cx, cy - L.cell * 0.4, L.cell * 0.5, "#fff", { dur: 850 });
    if (ev.allClear) addText("全清！ +" + C.SCORE.allClear, W / 2, midY - L.cell * 1.1, L.cell * 0.8, "#ff9cf0", { dur: 1500, delay: 200 });
    if (ev.lines >= 3) shakeT = now;
  }
  if (ev.refilled) trayIn = [now + 60, now + 130, now + 200];
  if (game.S.mode === "classic" && game.S.score > best) {
    best = game.S.score; store.set("best", best);
    if (!recordShown && bestAtStart > 0) { recordShown = true; addText("新紀錄！", W / 2, L.by - L.cell * 0.2, L.cell * 0.6, "#ffd54a", { dur: 1600, delay: 300 }); }
  }
  if (ev.won && !adv.done.includes(game.S.level)) { adv.done.push(game.S.level); store.set("adv", adv); }   // 先記進度再演（演出中關掉 App 也不會白打）
  saveGame();
  const id = runId;
  if (ev.won) { locked = true; setTimeout(() => { if (id === runId) winSeq(); }, 900); }
  else if (ev.over) { locked = true; setTimeout(() => { if (id === runId) overSeq(); }, 450); }
}
function overSeq() {
  overT = now; sfx.over(); vib(60);
  const id = runId;
  setTimeout(() => {
    if (id !== runId) return;
    if (game.S.mode === "classic") {
      $("overScore").textContent = game.S.score.toLocaleString();
      $("overBest").textContent = "👑 " + best.toLocaleString();
      $("overNew").style.display = game.S.score >= best && game.S.score > bestAtStart ? "" : "none";
      show("sOver");
    } else {
      $("resTitle").textContent = "沒有空間了";
      $("resStars").textContent = "💔";
      $("resInfo").textContent = "第 " + game.S.level + " 關，再試一次！";
      $("bNext").style.display = "none";
      show("sResult");
    }
  }, 1500);
}
function winSeq() {
  sfx.win(); vib(40);
  for (let k = 0; k < 90; k++) {
    const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 7;
    parts.push({ x: W / 2, y: L.by + L.B * 0.45, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, s: 5 + Math.random() * 7, col: PAL[k % 7], t0: now, life: 1500 + Math.random() * 600, rot: Math.random() * 6 });
  }
  const n = game.S.level, id = runId;
  setTimeout(() => {
    if (id !== runId) return;
    $("resTitle").textContent = "過關！";
    $("resStars").textContent = "🎉";
    $("resInfo").textContent = "第 " + n + " 關・放了 " + game.S.moves + " 塊・" + game.S.score.toLocaleString() + " 分";
    $("bNext").style.display = n < C.LEVEL_COUNT ? "" : "none";
    show("sResult");
  }, 1300);
}

// ── 畫面 ──
function drawBG() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#4b70d8"); g.addColorStop(1, "#2a3c8c");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
let boardImg = null;          // 棋盤底板（含陰影）：layout 後畫一次，每幀直接貼
function drawBoard() {
  const m = 30;              // 留給陰影的邊
  if (!boardImg) {
    boardImg = document.createElement("canvas");
    boardImg.width = Math.round((L.B + m * 2) * DPR); boardImg.height = Math.round((L.B + m * 2) * DPR);
    const g = boardImg.getContext("2d"); g.scale(DPR, DPR);
    g.save(); g.shadowColor = "rgba(10,16,50,.45)"; g.shadowBlur = 18; g.shadowOffsetY = 6;
    g.fillStyle = "#1c2559"; rrect(g, m, m, L.B, L.B, L.pad * 1.6); g.fill(); g.restore();
    g.fillStyle = "#252f6c";
    const gap = Math.max(1, L.cell * 0.05);
    for (let r = 0; r < C.N; r++) for (let c = 0; c < C.N; c++)
      g.fillRect(m + L.pad + c * L.cell + gap / 2, m + L.pad + r * L.cell + gap / 2, L.cell - gap, L.cell - gap);
  }
  ctx.drawImage(boardImg, L.bx - m, L.by - m, L.B + m * 2, L.B + m * 2);
}
function drawBlock(k, x, y, s, gem) {
  ctx.drawImage(blockSprite(k, s), x, y, s, s);
  if (gem) { const gs = s * 0.74; ctx.drawImage(gemSprite(gem, gs), x + (s - gs) / 2, y + (s - gs) / 2, gs, gs); }
}
function drawCells() {
  const S = game.S, pv = drag && drag.pv, pk = drag && game.S.tray[drag.i] ? game.S.tray[drag.i].k : 0;
  for (let r = 0; r < C.N; r++) for (let c = 0; c < C.N; c++) {
    const x = S.grid[r][c]; if (!x) continue;
    let k = x.k, s = L.cell, ox = 0, oy = 0;
    if (overT >= 0 && now - overT > (C.N - 1 - r) * 90) k = GRAY;       // 結束：由下往上變灰
    else if (pv && (pv.rows.includes(r) || pv.cols.includes(c))) k = pk; // 會被消掉的線先換成手上方塊的顏色（原版那樣）
    const pt = pops.get(r * C.N + c);
    if (pt !== undefined) {
      const t = (now - pt) / 160;
      if (t >= 1) pops.delete(r * C.N + c);
      else { const sc = 1 + 0.14 * Math.sin(Math.PI * t); ox = oy = (L.cell - L.cell * sc) / 2; s = L.cell * sc; }
    }
    drawBlock(k, L.gx + c * L.cell + ox, L.gy + r * L.cell + oy, s, x.gem);
  }
  // 會消掉的線：加一層亮光
  if (pv && (pv.rows.length || pv.cols.length)) {
    ctx.save(); ctx.globalAlpha = 0.18 + 0.1 * Math.sin(now / 90); ctx.fillStyle = "#fff";
    for (const r of pv.rows) ctx.fillRect(L.gx, L.gy + r * L.cell, L.cell * C.N, L.cell);
    for (const c of pv.cols) ctx.fillRect(L.gx + c * L.cell, L.gy, L.cell, L.cell * C.N);
    ctx.restore();
  }
}
function drawGhost() {
  if (!drag || !drag.snap) return;
  const p = game.S.tray[drag.i], s = C.SHAPE_BY_ID[p.id];
  ctx.save(); ctx.globalAlpha = 0.42;
  s.cells.forEach(([dr, dc]) => drawBlock(p.k, L.gx + (drag.snap.c + dc) * L.cell, L.gy + (drag.snap.r + dr) * L.cell, L.cell, null));
  ctx.restore();
}
function drawBursts() {
  bursts = bursts.filter(b => {
    const t = (now - b.t0) / 300;
    if (t < 0) { drawBlock(b.k, L.gx + b.c * L.cell, L.gy + b.r * L.cell, L.cell, b.gem); return true; }  // 還沒輪到：照常顯示
    if (t >= 1) return false;
    if (!b.spawned) {
      b.spawned = true;
      const [x, y] = cellXY(b.r, b.c);
      for (let k = 0; k < 3; k++) { const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.5; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, s: L.cell * (0.12 + Math.random() * 0.14), col: PAL[b.k], t0: now, life: 600 + Math.random() * 300, rot: 0 }); }
    }
    const sc = 1 - ease(t) * 0.7, s = L.cell * sc, o = (L.cell - s) / 2;
    ctx.save(); ctx.globalAlpha = 1 - t * 0.6;
    drawBlock(b.k, L.gx + b.c * L.cell + o, L.gy + b.r * L.cell + o, s, null);
    ctx.globalAlpha = Math.max(0, 0.85 - t * 2); ctx.fillStyle = "#fff";
    ctx.fillRect(L.gx + b.c * L.cell + o, L.gy + b.r * L.cell + o, s, s);
    ctx.restore();
    return true;
  });
}
function drawParts() {
  parts = parts.filter(p => {
    const t = (now - p.t0) / p.life; if (t >= 1) return false;
    p.vy += 0.25 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += 0.15 * dt;
    ctx.save(); ctx.globalAlpha = 1 - t; ctx.fillStyle = p.col; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
    return true;
  });
}
// 托盤上的一塊（中心 cx, cy、每格 cs）；dim = 放不下（變暗）
function drawPiece(p, cx, cy, cs, alpha = 1) {
  const s = C.SHAPE_BY_ID[p.id];
  const x0 = cx - s.wd * cs / 2, y0 = cy - s.h * cs / 2;
  ctx.save(); ctx.globalAlpha = alpha;
  s.cells.forEach(([r, c], j) => drawBlock(p.k, x0 + c * cs, y0 + r * cs, cs, p.gems ? p.gems[j] : null));
  ctx.restore();
}
function drawTray() {
  const rows = C.gridRows(game.S.grid);
  game.S.tray.forEach((p, i) => {
    if (!p || (drag && drag.i === i)) return;
    let cx = L.sx[i], cy = L.ty, a = 1;
    const t = (now - trayIn[i]) / 260;
    if (t < 1) { if (t < 0) return; cx += (1 - ease(t)) * W * 0.35; a = ease(t); }
    if (backAnim && backAnim.i === i) {
      const k = Math.min(1, (now - backAnim.t0) / 180), e = ease(k);
      if (k >= 1) backAnim = null;
      else { const cs = lerp(L.cell, L.tc, e); drawPiece(p, lerp(backAnim.x, cx, e), lerp(backAnim.y, cy, e), cs); return; }
    }
    const fits = C.fitsAnywhere(rows, C.SHAPE_BY_ID[p.id]);
    drawPiece(p, cx, cy, L.tc, fits || overT >= 0 ? a : a * 0.35);
  });
}
function drawDrag() {
  if (!drag) return;
  const p = game.S.tray[drag.i]; if (!p) { drag = null; return; }
  const s = C.SHAPE_BY_ID[p.id], k = ease(Math.min(1, (now - drag.t0) / 110));
  const cs = lerp(L.tc, L.cell, k);
  const cx = lerp(L.sx[drag.i], drag.px, k), cy = lerp(L.ty, drag.py - lift(s), k);
  const x0 = cx - s.wd * cs / 2, y0 = cy - s.h * cs / 2, o = cs * 0.12;
  ctx.fillStyle = "rgba(8,12,40,.32)";
  s.cells.forEach(([r, c]) => { rrect(ctx, x0 + c * cs + o, y0 + r * cs + o * 1.6, cs, cs, cs * 0.12); ctx.fill(); });
  drawPiece(p, cx, cy, cs);
}
function drawTexts() {
  texts = texts.filter(o => {
    const t = (now - o.t0) / o.dur; if (t >= 1) return false; if (t < 0) return true;
    const sc = t < 0.18 ? lerp(0.4, 1.15, ease(t / 0.18)) : t < 0.3 ? lerp(1.15, 1, (t - 0.18) / 0.12) : 1;
    const a = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(o.x, o.y - t * L.cell * 0.6); ctx.scale(sc, sc);
    ctx.font = `900 ${o.size}px "Arial Rounded MT Bold", "Nunito", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.lineWidth = o.size * 0.18; ctx.strokeStyle = o.stroke; ctx.strokeText(o.str, 0, 0);
    ctx.fillStyle = o.color; ctx.fillText(o.str, 0, 0);
    ctx.restore(); return true;
  });
}
function font(sz, w = 900) { return `${w} ${sz}px "Arial Rounded MT Bold", "Nunito", "PingFang TC", "Microsoft JhengHei", sans-serif`; }
function drawGear() {
  const { x, y, r } = L.gear;
  ctx.save(); ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; const bw = r * 0.22, bh = r * 0.8;
  ctx.fillRect(x - bw * 1.6, y - bh / 2, bw, bh); ctx.fillRect(x + bw * 0.6, y - bh / 2, bw, bh);   // 暫停符號
  ctx.restore();
}
function drawHUD() {
  const S = game.S, top = L.sa;
  drawGear();
  // 分數慢慢跳上去
  dispScore = dispScore < S.score ? Math.min(S.score, dispScore + Math.max(1, (S.score - dispScore) * 0.15)) : S.score;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (S.mode === "classic") {
    ctx.textAlign = "left"; ctx.font = font(20); ctx.fillStyle = "#ffd54a";
    ctx.fillText("👑 " + Math.max(best, S.score).toLocaleString(), 16, top + 36);
    ctx.textAlign = "center";
    const sz = Math.min(64, (L.hud - top) * 0.42);
    ctx.font = font(sz); ctx.lineJoin = "round"; ctx.lineWidth = sz * 0.12; ctx.strokeStyle = "#1d2a66";
    const y = top + (L.hud - top) * 0.62;
    ctx.strokeText(Math.round(dispScore).toLocaleString(), W / 2, y); ctx.fillStyle = "#fff"; ctx.fillText(Math.round(dispScore).toLocaleString(), W / 2, y);
  } else {
    ctx.font = font(20); ctx.fillStyle = "#dfe6ff"; ctx.fillText("第 " + S.level + " 關", W / 2, top + 36);
    L.goalPos = {};
    const gs = S.goals, chipW = Math.min(110, (W - 40) / Math.max(1, gs.length)), y = top + (L.hud - top) * 0.66;
    gs.forEach((g, j) => {
      const x = W / 2 + (j - (gs.length - 1) / 2) * chipW;
      if (g.t === "score") {
        const bw = Math.min(W * 0.6, 280), bh = 18, f = Math.min(1, dispScore / g.need);
        ctx.fillStyle = "rgba(0,0,0,.25)"; rrect(ctx, W / 2 - bw / 2, y - bh / 2, bw, bh, bh / 2); ctx.fill();
        ctx.fillStyle = f >= 1 ? "#6fdc4f" : "#ffd54a"; if (f > 0) { rrect(ctx, W / 2 - bw / 2, y - bh / 2, Math.max(bh, bw * f), bh, bh / 2); ctx.fill(); }
        ctx.font = font(16); ctx.fillStyle = "#fff"; ctx.fillText(Math.round(dispScore).toLocaleString() + " / " + g.need.toLocaleString(), W / 2, y + 26);
        return;
      }
      const bump = chipBump[g.gem] ? Math.max(0, 1 - (now - chipBump[g.gem]) / 250) : 0;
      const isz = 36 * (1 + bump * 0.25);
      L.goalPos[g.gem] = [x - 18, y];
      ctx.drawImage(gemSprite(g.gem, isz), x - 18 - isz / 2, y - isz / 2, isz, isz);
      const left = g.need - (gotDisp[g.gem] || 0);
      ctx.font = font(24); ctx.textAlign = "left";
      if (left <= 0) { ctx.fillStyle = "#6fdc4f"; ctx.fillText("✓", x + 6, y + 1); }
      else { ctx.fillStyle = "#fff"; ctx.fillText(String(left), x + 6, y + 1); }
      ctx.textAlign = "center";
    });
  }
}
function drawFlyGems() {
  flyGems = flyGems.filter(f => {
    const t = (now - f.t0) / 520; if (t < 0) return true;
    const [sx, sy] = cellXY(f.r, f.c), tgt = (L.goalPos && L.goalPos[f.gem]) || [W / 2, L.sa + 60];
    if (t >= 1) { gotDisp[f.gem] = (gotDisp[f.gem] || 0) + 1; chipBump[f.gem] = now; sfx.gem(); return false; }
    const e = ease(t), x = lerp(sx, tgt[0], e), y = lerp(sy, tgt[1], e) - Math.sin(Math.PI * t) * L.cell * 1.5, s = L.cell * lerp(0.8, 0.55, t);
    ctx.drawImage(gemSprite(f.gem, s), x - s / 2, y - s / 2, s, s);
    return true;
  });
}
let dt = 1, lastT = 0, frameErr = 0;
function frame(t) {
  requestAnimationFrame(frame);
  dt = lastT ? Math.min(3, (t - lastT) / 16.67) : 1; lastT = t;
  now = t;
  if (current === "sMenu" || current === "sLevels") return;
  try { render(); } catch (err) { if (frameErr++ < 3) console.error(err); }
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBG();
  if (game && !current) {
    const sh = now - shakeT < 260 ? (1 - (now - shakeT) / 260) * L.cell * 0.12 : 0;
    ctx.save(); if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    drawBoard(); drawCells(); drawGhost(); drawBursts();
    ctx.restore();
    drawTray(); drawParts(); drawDrag(); drawHUD(); drawFlyGems(); drawTexts();
  } else if (game && current) {
    drawBoard(); drawCells(); drawTray(); drawHUD(); drawParts();   // 暫停／結束畫面後面也看得到盤面
  }
}

// ── 畫面切換（DOM 選單）──
let current = "sMenu";
function show(id) {
  document.querySelectorAll(".screen").forEach(el => el.classList.toggle("on", el.id === id));
  current = id;
  if (id === "sMenu") refreshMenu();
  if (id === "sLevels") refreshLevels();
}
function refreshMenu() {
  $("menuBest").textContent = "👑 " + best.toLocaleString();
  const sv = store.get("save_classic", null);
  $("classicSub").textContent = sv && !sv.over && Number.isFinite(sv.score) && sv.moves > 0 ? "上一局 " + sv.score.toLocaleString() + " 分，接著玩" : "";
  $("menuAdv").textContent = "已過 " + adv.done.length + " / " + C.LEVEL_COUNT + " 關";
}
function maxUnlocked() { return Math.min(C.LEVEL_COUNT, (adv.done.length ? Math.max(...adv.done) : 0) + 1); }
function refreshLevels() {
  const box = $("levelGrid"); box.innerHTML = "";
  const top = maxUnlocked(), sv = store.get("save_adv", null);
  $("lvSummary").textContent = "已過 " + adv.done.length + " / " + C.LEVEL_COUNT + " 關";
  for (let n = 1; n <= C.LEVEL_COUNT; n++) {
    const b = document.createElement("button");
    const done = adv.done.includes(n), open = n <= top;
    b.className = "lv" + (done ? " done" : open ? "" : " lock");
    b.innerHTML = open ? n + (done ? '<span class="st">✓</span>' : sv && sv.level === n ? '<span class="st">進行中</span>' : "") : "🔒";
    if (open) b.onclick = () => startLevel(n);
    box.appendChild(b);
    if (n === top) setTimeout(() => { box.scrollTop = b.offsetTop - box.offsetTop - box.clientHeight / 2 + b.offsetHeight / 2; }, 0);
  }
}
$("bClassic").onclick = () => startClassic(false);
$("bAdventure").onclick = () => show("sLevels");
$("bLvBack").onclick = () => show("sMenu");
$("bContinue").onclick = () => show(null);
$("bRestart").onclick = () => { if (game.S.mode === "classic") startClassic(true); else startLevel(game.S.level, true); };
$("bHome").onclick = () => { saveGame(); show("sMenu"); };
$("bAgain").onclick = () => startClassic(true);
$("bOverHome").onclick = () => show("sMenu");
$("bNext").onclick = () => startLevel(Math.min(C.LEVEL_COUNT, game.S.level + 1), true);
$("bRetry").onclick = () => startLevel(game.S.level, true);
$("bResLevels").onclick = () => show("sLevels");
$("optSound").checked = opts.sound; $("optVib").checked = opts.vib;
$("optSound").onchange = e => { opts.sound = e.target.checked; store.set("opts", opts); };
$("optVib").onchange = e => { opts.vib = e.target.checked; store.set("opts", opts); };

// 測試用：headless 測試直接操作（tools/bb-test/）
window.__bb = { get game() { return game; }, C, L, doPlace, startClassic, startLevel, show, get current() { return current; } };

layout();
requestAnimationFrame(frame);
try { show("sMenu"); } catch (err) {   // 選單資料壞掉也不要讓整個遊戲開不起來
  console.error(err);
  ["save_classic", "save_adv"].forEach(k => store.del(k));
  document.getElementById("sMenu").classList.add("on"); current = "sMenu";
}
