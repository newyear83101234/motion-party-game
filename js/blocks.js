// 方塊爆破 — 畫面、拖曳操作、特效、音效、存檔（遊戲規則全在 blocks-core.js）
import * as C from "./blocks-core.js?v=3";

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
const opts = Object.assign({ music: true, sound: true, vib: true }, store.get("opts", {}));
let best = store.get("best", 0);
if (!Number.isFinite(best)) best = 0;
const adv = Object.assign({ done: [] }, store.get("adv", {}));   // done：過了的關卡號碼
if (!Array.isArray(adv.done)) adv.done = [];
adv.done = adv.done.filter(n => Number.isInteger(n));
if (!Number.isFinite(adv.wins)) adv.wins = 0;
let runId = 0;               // 每開一局 +1：結束／過關演出的計時器回來時比對，不是這局的就不演
let bestAtStart = 0, recordShown = false;

// ── 排行榜：這台裝置經典模式的前五名，不用註冊（名字記在本機）──
const RANK_N = 5;
let rank = (() => { const r = store.get("rank", []); return Array.isArray(r) ? r.filter(e => e && Number.isFinite(e.s) && typeof e.n === "string").slice(0, RANK_N) : []; })();
const cut8 = v => [...String(v || "")].slice(0, 8).join("");
let myName = cut8(store.get("name", ""));
let lastEntry = null;        // 剛擠進榜的那一筆（結束畫面改名字用）
function addRank(score, moves) {
  lastEntry = null;
  if (!(score > 0)) return -1;
  const d = new Date(), e = { n: myName || "我", s: score, m: moves, d: (d.getMonth() + 1) + "/" + d.getDate(), t: Date.now() };
  rank.push(e); rank.sort((a, b) => b.s - a.s || a.t - b.t); rank = rank.slice(0, RANK_N);
  store.set("rank", rank);
  const i = rank.indexOf(e);
  if (i >= 0) lastEntry = e;
  return i;
}
function renderRank(ol, hi) {
  ol.innerHTML = "";
  if (!rank.length) { const li = document.createElement("li"); li.className = "empty"; li.textContent = "還沒有紀錄，玩一局經典模式吧！"; ol.appendChild(li); return; }
  rank.forEach((e, i) => {
    const li = document.createElement("li"); if (i === hi) li.className = "me";
    const cell = (cls, txt) => { const s = document.createElement("span"); s.className = cls; s.textContent = txt; li.appendChild(s); };
    cell("md", ["🥇", "🥈", "🥉"][i] || String(i + 1)); cell("nm", e.n); cell("sc", e.s.toLocaleString()); cell("dt", e.d || "");
    ol.appendChild(li);
  });
}
// ── 每日挑戰進度：done = 過了的日期（20261015 這種數字）；連續天數從今天（或昨天）往回數 ──
const daily = Object.assign({ done: [] }, store.get("daily", {}));
if (!Array.isArray(daily.done)) daily.done = [];
daily.done = daily.done.filter(n => Number.isInteger(n));
function dayKeyOffset(off) { const d = new Date(); d.setDate(d.getDate() - off); return C.dateKey(d); }
function dailyStreak() {
  let off = daily.done.includes(dayKeyOffset(0)) ? 0 : 1, n = 0;   // 今天還沒玩不算斷
  while (daily.done.includes(dayKeyOffset(off))) { n++; off++; }
  return n;
}
// ── 統計（排行榜頁下面顯示）──
const stats = Object.assign({ games: 0, lines: 0, blocks: 0, bestCombo: 0, maxLines: 0, allClears: 0 }, store.get("stats", {}));
for (const k of Object.keys(stats)) if (!Number.isFinite(stats[k])) stats[k] = 0;
function setName(v, alsoEntry) {
  myName = cut8(String(v || "").trim()); store.set("name", myName);
  if (alsoEntry && lastEntry) { lastEntry.n = myName || "我"; store.set("rank", rank); }
}

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
// 👍 圖（emoji 畫一次存起來）
function thumbSprite(s) {
  const px = qpx(s), key = "t|" + px;
  let cvs = sprites.get(key); if (cvs) return cvs;
  cvs = document.createElement("canvas"); cvs.width = cvs.height = px;
  const g = cvs.getContext("2d"); g.font = `${Math.round(px * 0.82)}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("👍", px / 2, px * 0.54);
  sprites.set(key, cvs); return cvs;
}
// 寶石圖示
const GEM_COL = { r: "#ff3b5c", b: "#3aa7ff", g: "#2fd27a", y: "#ffcc1f" };
function gemSprite(t, s) {
  const px = qpx(s), key = "g" + t + "|" + px;
  let cvs = sprites.get(key); if (cvs) return cvs;
  cvs = document.createElement("canvas"); cvs.width = cvs.height = px;
  const g = cvs.getContext("2d"), c = GEM_COL[t], m = px / 2;
  g.fillStyle = "rgba(10,16,50,.5)"; g.beginPath(); g.arc(m, m, px * 0.47, 0, Math.PI * 2); g.fill();
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
  const B = Math.max(120, Math.floor(Math.min(W - 20, (H - hud - 16) / 1.42, 620)));
  const pad = Math.round(B * 0.025);
  const cell = (B - pad * 2) / C.N;
  const T = cell * 3.3;
  const free = Math.max(0, H - hud - B - T);
  Object.assign(L, { sa, hud, B, pad, cell, T });
  L.bx = Math.round((W - B) / 2); L.by = Math.round(hud + free * 0.15);
  L.gx = L.bx + pad; L.gy = L.by + pad;
  L.ty = L.by + B + free * 0.22 + T / 2;
  L.slotW = B / 3;
  L.sx = [0, 1, 2].map(i => L.bx + L.slotW * (i + 0.5));
  L.tc = cell * 0.6;          // 托盤方塊每格大小（太寬的形狀見 trayCS 自己縮）
  L.gear = { x: W - 34, y: sa + 36, r: 22 };
  sprites.clear(); boardImg = null;
}
window.addEventListener("resize", () => { if (document.activeElement && document.activeElement.tagName === "INPUT") return; layout(); });
document.addEventListener("focusout", e => { if (e.target.tagName === "INPUT") setTimeout(layout, 300); });   // 鍵盤收起後補排一次

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

// ── 背景音樂（Suno 生，tools/audio/bb_music.py 剪成無縫循環；ls/le = 循環起點／終點秒數）──
const BGM = {
  // 2026-10-15 Suno v6 各生 2 首、Gemini 聽過挑高分（tools/audio/candidates/bb/result.json）
  menu: { src: "audio/bb/menu.mp3?v=1", ls: 0.5, le: 58.1163 },        // menu_b：明亮 synth-pop
  classic: { src: "audio/bb/classic.mp3?v=1", ls: 0.5, le: 60.4887 },  // classic_b：放鬆 lo-fi
  adventure: { src: "audio/bb/adventure.mp3?v=1", ls: 0.5, le: 61.3247 }, // adventure_b：熱帶叢林 marimba
};
const MUS = { buf: {}, loading: {}, failed: {}, cur: null, src: null, gain: null, want: null, level: 1 };
const MUSIC_VOL = 0.42;
function loadTrack(name) {
  if (MUS.buf[name]) return Promise.resolve(MUS.buf[name]);
  if (MUS.loading[name]) return MUS.loading[name];
  if (MUS.failed[name] && Date.now() - MUS.failed[name] < 30000) return Promise.reject(new Error("failed recently"));   // 剛失敗過 30 秒內不重抓
  const a = au(); if (!a) return Promise.reject(new Error("no audio"));
  MUS.loading[name] = fetch(BGM[name].src)
    .then(r => { if (!r.ok) throw new Error("BGM " + r.status + " " + BGM[name].src); return r.arrayBuffer(); })
    .then(ab => new Promise((ok, bad) => a.decodeAudioData(ab, ok, bad)))
    .then(b => (MUS.buf[name] = b))
    .catch(err => { console.warn(err); delete MUS.loading[name]; MUS.failed[name] = Date.now(); throw err; });
  return MUS.loading[name];
}
// 換曲：舊的淡出、新的淡入；同一首就只調音量
function music(name, level = 1) {
  MUS.want = name; MUS.level = level;
  const a = AU.ctx;
  if (!a) return;                                  // 還沒有使用者點擊過 → 等第一次點擊（見下面 pointerdown）
  const t = a.currentTime;
  if (MUS.cur === name && MUS.gain) { MUS.gain.gain.cancelScheduledValues(t); MUS.gain.gain.setTargetAtTime(opts.music ? MUSIC_VOL * level : 0, t, 0.25); return; }
  if (MUS.src) { const g = MUS.gain, s = MUS.src; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.25); setTimeout(() => { try { s.stop(); } catch { /* 已停 */ } }, 1500); }
  MUS.cur = name; MUS.src = null; MUS.gain = null;
  if (!name || !opts.music) { MUS.cur = null; return; }
  loadTrack(name).then(buf => {
    if (MUS.want !== name || MUS.cur !== name || MUS.src) return;   // 載好時已經換別首了
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; s.loop = true;
    const tr = BGM[name];
    if (tr.le > tr.ls) { s.loopStart = tr.ls; s.loopEnd = tr.le; }
    g.gain.value = 0; g.connect(AU.ctx.destination); s.connect(g);
    s.start(0, 0);
    g.gain.setTargetAtTime(MUSIC_VOL * MUS.level, a.currentTime, 0.4);
    MUS.src = s; MUS.gain = g;
    for (const k of Object.keys(MUS.buf)) if (k !== name) delete MUS.buf[k];
  }).catch(() => { if (MUS.cur === name) MUS.cur = null; });
}
// 第一次點畫面任何地方：建立音效引擎、把該放的音樂放出來（iOS 一定要在點擊裡）
["pointerdown", "pointerup", "touchend", "click"].forEach(evn => document.addEventListener(evn, () => {
  const had = !!AU.ctx, a = au();
  if (!had || !MUS.cur || (a && a.state !== "running")) music(MUS.want, MUS.level);
}, true));

// ── 特效狀態 ──
const pops = new Map();      // 剛放下的格子 → 開始時間（彈一下）
let bursts = [];             // 消掉的格子（閃一下再碎掉）
let parts = [];              // 碎片
let texts = [];              // 飄字
let flyGems = [];            // 飛去目標欄的寶石
let trayIn = [0, 0, 0];      // 新方塊滑進來的開始時間
let overT = -1, dispScore = 0, gotDisp = {}, chipBump = {};
let scoreTw = null;          // 分數滾動：{ from, to, t0, dur }（原版是先慢後快滾上去，大加分滾 1~2 秒）
let stickers = [];           // 消 2 條以上：剛放的格子冒 👍 泡泡再炸成星芒（原版 9.6.8）
let patT = -1e9, patCells = [];   // Pattern Finished!：盤面格子變發光白框
let titleT = -1e9, titleTxt = "";  // 冒險／每日開局的目標標題卡
let gemShow = 0;             // 分數後面那顆連擊鑽石的顯示大小（0 = 沒有）
let beams = [];              // 消行光束
let trauma = 0;              // 震動量（大事件加，每幀衰減；位移 = trauma² × 上限）
let heat = 0;                // 連擊熱度 0~1（背景變暖、棋盤框發光）
let introT = -1e9, scorePulse = -1e9, flashT = -1e9;
// 背景飄浮的光點（很淡，讓畫面靜止時也有一點動態）
const bokeh = Array.from({ length: 14 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.03 + Math.random() * 0.07, v: 0.00004 + Math.random() * 0.00008, a: 0.025 + Math.random() * 0.035, ph: i }));
// 主選單背景慢慢飄落的方塊
let menuPieces = [];
let drag = null;             // { i, px, py, t0, snap, pv }
let backAnim = null;         // 放不下 → 飛回托盤
const ease = t => 1 - (1 - t) ** 3;
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
function shownScore() {
  if (!scoreTw) return dispScore;
  const t = Math.min(1, Math.max(0, (now - scoreTw.t0) / scoreTw.dur));
  return scoreTw.from + (scoreTw.to - scoreTw.from) * easeIO(t);
}
function scoreTo(target, gain, delay) {
  const from = shownScore();
  scoreTw = { from, to: target, t0: now + delay, dur: Math.min(2200, Math.max(300, 380 + 430 * Math.log10(gain + 1))) };
}
const lerp = (a, b, t) => a + (b - a) * t;
function addText(str, x, y, size, color, { dur = 900, delay = 0, stroke = "#1b2466" } = {}) { texts.push({ str, x, y, size, color, stroke, t0: now + delay, dur }); }

// ── 開局 ──
function resetFx() {
  runId++;
  pops.clear(); bursts = []; parts = []; texts = []; flyGems = []; beams = []; drag = null; backAnim = null;
  trauma = 0; introT = now; scoreTw = null; stickers = []; patT = -1e9; gemShow = 0; titleT = -1e9;
  trayIn = [now, now + 70, now + 140]; overT = -1; locked = false;
}
function startClassic(fresh) {
  const saved = !fresh && store.get("save_classic", null);
  game = null;
  if (saved && !saved.over) try { game = C.createGame({ saved }); } catch { store.del("save_classic"); }   // 存檔壞了就開新局
  if (!game) { game = C.createGame({ mode: "classic" }); stats.games++; store.set("stats", stats); }
  bestAtStart = best; recordShown = false;
  dispScore = game.S.score; resetFx(); show(null); saveGame();
}
function startLevel(n, fresh, mode = "adventure") {
  const key = mode === "daily" ? "save_daily" : "save_adv";
  const saved = !fresh && store.get(key, null);
  game = null;
  if (saved && saved.mode === mode && saved.level === n && !saved.over && !saved.won) try { game = C.createGame({ saved }); } catch { store.del(key); }
  if (!game) game = C.createGame({ mode, level: n });
  gotDisp = {}; chipBump = {};
  game.S.goals.forEach(g => { if (g.t === "gem") gotDisp[g.gem] = g.got; });
  dispScore = game.S.score; resetFx(); show(null); saveGame();
  titleT = now; titleTxt = mode === "daily" ? "Daily Challenge" : game.S.goals[0].t === "score" ? "Target Score" : "Target Collection";
}
function saveGame() {
  if (!game) return;
  const k = "save_" + (game.S.mode === "adventure" ? "adv" : game.S.mode);
  if (game.S.over || game.S.won) store.del(k); else store.set(k, game.serialize());
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { saveGame(); drag = null; backAnim = null; if (AU.ctx) AU.ctx.suspend().catch(() => {}); }
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
  stats.blocks++; stats.lines += ev.lines; stats.bestCombo = Math.max(stats.bestCombo, ev.combo); stats.maxLines = Math.max(stats.maxLines, ev.lines);
  if (ev.allClear) stats.allClears++;
  store.set("stats", stats);
  const [cx, cy] = cellXY(r + (s.h - 1) / 2, c + (s.wd - 1) / 2);
  if (ev.lines) {
    const cr = r + s.h / 2, cc = c + s.wd / 2;
    for (const q of ev.cleared) {
      const delay = Math.hypot(q.r + 0.5 - cr, q.c + 0.5 - cc) * 26;
      bursts.push({ r: q.r, c: q.c, k: p.k, gem: q.gem, t0: now + delay, spawned: false });
      if (q.gem && game.S.mode !== "classic") flyGems.push({ gem: q.gem, r: q.r, c: q.c, t0: now + delay + 140 });
    }
    ev.clearRows.forEach(rr => beams.push({ row: true, i: rr, k: p.k, t0: now }));
    ev.clearCols.forEach(cc2 => beams.push({ row: false, i: cc2, k: p.k, t0: now }));
    sfx.clear(ev.lines, ev.combo); vib(ev.lines >= 3 ? [30, 40, 30] : ev.lines >= 2 ? 30 : 18);
    // 原版排法（實機影片）：「+N」在最上面 → 稱讚字 → Combo；橫向跟著消掉的位置、縱向在消掉區域的上緣，都限制在棋盤裡
    const Cs = ev.comboShown, gain = ev.pts.total;
    const mx = ev.cleared.reduce((a, q) => a + q.c, 0) / ev.cleared.length, top = Math.min(...ev.cleared.map(q => q.r));
    const ax = Math.min(L.gx + L.cell * 5.5, Math.max(L.gx + L.cell * 2.5, L.gx + (mx + 0.5) * L.cell));
    const ay = L.gy + Math.min(4.6, Math.max(0.45, top - 0.2)) * L.cell;
    texts.push({ kind: "gain", str: "+" + gain.toLocaleString(), x: ax, y: ay, size: L.cell * Math.min(0.85, 0.48 + 0.07 * Math.log10(gain + 1)), t0: now + 60, dur: 1100 });
    let yy = ay + L.cell * (ev.lines >= 4 ? 1.05 : 0.72);
    if (ev.praise) { texts.push({ kind: "praise", str: ev.praise, x: ax, y: yy, size: L.cell * 0.82, t0: now + 90, dur: 1300 }); sfx.praise(); yy += L.cell * 0.95; }
    if (Cs >= 1) texts.push({ kind: "combo", str: Cs >= 2 ? String(Cs) : "", x: ax, y: Math.min(yy, L.gy + L.cell * 7.2), size: L.cell * 0.8, t0: now + 120, dur: 1150 });
    // 👍：消 2 條以上，剛放的那幾格冒 👍 泡泡、再炸成星芒
    if (ev.lines >= 2) for (const q of ev.placed) if (ev.cleared.some(x => x.r === q.r && x.c === q.c)) stickers.push({ r: q.r, c: q.c, t0: now + 40 });
    // 大消除或高連擊：棋盤四周飛亮片
    if (ev.lines >= 3 || Cs >= 5) edgeSparks(18 + Math.min(30, Cs * 2));
    if (ev.allClear) { texts.push({ kind: "praise", str: "Board Clear!", x: W / 2, y: L.gy + L.cell * 5.9, size: L.cell * 0.9, t0: now + 250, dur: 1700 }); confetti(70, L.by + L.B / 2); }
    if (ev.patternDone) {
      patT = now + 120; patCells = ev.cleared.map(q => [q.r, q.c]);
      texts.push({ kind: "pattern", str: "Pattern Finished!", x: W / 2, y: L.gy + L.cell * 4.2, size: L.cell * 0.9, t0: now + 150, dur: 1800 });
      const rid = runId; setTimeout(() => { if (rid === runId) sfx.win(); }, 150);
    }
    trauma = Math.min(1, trauma + (ev.lines >= 3 ? 0.32 + 0.12 * (ev.lines - 3) : 0) + (ev.allClear ? 0.45 : 0));
    if (ev.lines >= 4 || ev.allClear) flashT = now;
    if (ev.pts.total >= 150) scorePulse = now + 380;
  }
  scoreTo(game.S.score, ev.pts.total, ev.lines ? 380 : 0);
  if (ev.refilled) trayIn = [now + 60, now + 130, now + 200];
  if (game.S.mode === "classic" && game.S.score > best) {
    best = game.S.score; store.set("best", best);
    if (!recordShown && bestAtStart > 0) {
      recordShown = true;
      texts.push({ kind: "praise", str: "New Best!", x: W / 2, y: L.by + L.cell * 1.2, size: L.cell * 0.85, t0: now + 300, dur: 1800 });
      const rid = runId; setTimeout(() => { if (rid === runId) { confetti(60, L.sa + 40); sfx.win(); } }, 300);
    }
  }
  // 先記進度再演（演出中關掉 App 也不會白打）
  if (ev.won && game.S.mode === "adventure" && !adv.done.includes(game.S.level)) { adv.done.push(game.S.level); store.set("adv", adv); }
  if (ev.won && game.S.mode === "daily" && !daily.done.includes(game.S.level)) { daily.done.push(game.S.level); daily.done = daily.done.slice(-400); store.set("daily", daily); }
  saveGame();
  const id = runId;
  if (ev.won) { locked = true; setTimeout(() => { if (id === runId) winSeq(); }, 900); }
  else if (ev.over) {
    locked = true;
    if (game.S.mode === "classic") overRankIdx = addRank(game.S.score, game.S.moves);
    setTimeout(() => { if (id === runId) overSeq(); }, 450);
  }
}
let overRankIdx = -1;
function overSeq() {
  overT = now; sfx.over(); vib(60);
  if (game.S.mode === "adventure") { adv.wins = 0; store.set("adv", adv); }
  const id = runId;
  setTimeout(() => {
    if (id !== runId) return;
    if (game.S.mode === "classic") {
      $("overScore").textContent = game.S.score.toLocaleString();
      $("overBest").textContent = "👑 " + best.toLocaleString();
      $("overNew").style.display = game.S.score >= best && game.S.score > bestAtStart ? "" : "none";
      const idx = overRankIdx;
      $("overRankBox").style.display = idx >= 0 ? "" : "none";
      $("overRankMsg").textContent = idx === 0 ? "🥇 排行榜第一名！" : "進入前五名！第 " + (idx + 1) + " 名";
      $("overName").value = myName;
      renderRank($("overRank"), idx);
      show("sOver");
    } else {
      $("resTitle").textContent = "You Can Do It!";
      $("resStars").textContent = "💪";
      $("resInfo").textContent = (game.S.mode === "daily" ? "今天的挑戰" : "第 " + game.S.level + " 關") + "，再試一次！";
      $("bNext").style.display = "none";
      show("sResult");
    }
  }, 1500);
}
function confetti(n, y) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 7;
    parts.push({ x: W / 2, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, s: 5 + Math.random() * 7, col: PAL[k % 7], t0: now, life: 1500 + Math.random() * 600, rot: Math.random() * 6 });
  }
}
function winSeq() {
  sfx.win(); vib(40);
  confetti(90, L.by + L.B * 0.45);
  const n = game.S.level, id = runId;
  setTimeout(() => {
    if (id !== runId) return;
    const isDaily = game.S.mode === "daily";
    if (!isDaily) { adv.wins = (adv.wins || 0) + 1; store.set("adv", adv); }
    $("resTitle").textContent = isDaily ? "今日挑戰完成！" : "Well Done!";
    $("resStars").textContent = isDaily ? "🔥 " + dailyStreak() : "👑 連勝 ×" + adv.wins;
    $("resInfo").textContent = (isDaily ? "連續 " + dailyStreak() + " 天・明天再來" : "第 " + n + " 關") + "・放了 " + game.S.moves + " 塊・" + game.S.score.toLocaleString() + " 分";
    $("bNext").style.display = !isDaily && n < C.LEVEL_COUNT ? "" : "none";
    show("sResult");
  }, 1300);
}

// ── 畫面 ──
function mixHex(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16), ch = sh => Math.round(lerp(A >> sh & 255, B >> sh & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function drawBG() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mixHex("#4b70d8", "#8b4fd6", heat)); g.addColorStop(1, mixHex("#2a3c8c", "#4a2a86", heat));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const R = Math.max(W, H);
  for (const b of bokeh) {
    b.y -= b.v * 16.67 * dt; if (b.y < -0.1) { b.y = 1.1; b.x = Math.random(); }
    ctx.globalAlpha = b.a * (0.7 + 0.3 * Math.sin(now / 1500 + b.ph));
    ctx.fillStyle = heat > 0.3 ? "#ffd2a8" : "#bcd0ff";
    ctx.beginPath(); ctx.arc(b.x * W, b.y * H, b.r * R, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
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
    if (overT >= 0 && now - overT > (C.N - 1 - r) * 35) k = GRAY;       // 結束：由下往上很快變灰
    else if (pv && (pv.rows.includes(r) || pv.cols.includes(c))) k = pk; // 會被消掉的線先換成手上方塊的顏色（原版那樣）
    const it = (now - introT - (C.N - 1 - r) * 45 - c * 12) / 320;
    if (it < 1) {
      if (it <= 0) continue;
      const e = ease(it);
      ctx.save(); ctx.globalAlpha = e;
      drawBlock(k, L.gx + c * L.cell, L.gy + r * L.cell - (1 - e) * L.cell * 2.5, L.cell, x.gem);
      ctx.restore(); continue;
    }
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
  ctx.save();
  s.cells.forEach(([dr, dc]) => {
    const x = L.gx + (drag.snap.c + dc) * L.cell, y = L.gy + (drag.snap.r + dr) * L.cell;
    ctx.globalAlpha = 0.32; drawBlock(p.k, x, y, L.cell, null);
    ctx.globalAlpha = 0.5; ctx.fillStyle = "#0b1030"; ctx.fillRect(x + 1, y + 1, L.cell - 2, L.cell - 2);
  });
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
function drawBeams() {
  if (!beams.length) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const len = L.cell * C.N;
  beams = beams.filter(b => {
    const t = (now - b.t0) / 420; if (t >= 1) return false;
    const th = L.cell * (1 + t * 0.9), core = L.cell * 0.22 * (1 - t);
    const mid = (b.row ? L.gy : L.gx) + (b.i + 0.5) * L.cell;
    const g = b.row ? ctx.createLinearGradient(0, mid - th / 2, 0, mid + th / 2) : ctx.createLinearGradient(mid - th / 2, 0, mid + th / 2, 0);
    const col = mix(PAL[b.k], 0.45).replace("rgb(", "rgba(").replace(")", ",");
    g.addColorStop(0, col + "0)"); g.addColorStop(0.5, col + "0.75)"); g.addColorStop(1, col + "0)");
    ctx.globalAlpha = 1 - t; ctx.fillStyle = g;
    if (b.row) ctx.fillRect(L.gx - L.cell * 0.3, mid - th / 2, len + L.cell * 0.6, th); else ctx.fillRect(mid - th / 2, L.gy - L.cell * 0.3, th, len + L.cell * 0.6);
    ctx.globalAlpha = 1 - t; ctx.fillStyle = "#fff";
    if (b.row) ctx.fillRect(L.gx - L.cell * 0.3, mid - core / 2, len + L.cell * 0.6, core); else ctx.fillRect(mid - core / 2, L.gy - L.cell * 0.3, core, len + L.cell * 0.6);
    return true;
  });
  ctx.restore();
}
// 每 7 秒一道斜斜的光掃過棋盤
function drawSheen() {
  const t = (now % 7000) / 1300; if (t > 1) return;
  ctx.save(); rrect(ctx, L.bx, L.by, L.B, L.B, L.pad * 1.6); ctx.clip();
  const x = L.bx - L.B * 0.6 + t * L.B * 2.2;
  const g = ctx.createLinearGradient(x - L.B * 0.25, 0, x + L.B * 0.25, 0);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,.07)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.transform(1, 0, -0.35, 1, L.B * 0.2, 0); ctx.fillRect(L.bx - L.B, L.by, L.B * 3, L.B);
  ctx.restore();
}
// 連擊中：棋盤外框發光（越高連越暖）
function drawComboGlow() {
  const cb = game.S.combo; if (cb < 2 || overT >= 0) return;
  const col = cb >= 8 ? "#ff6a3d" : cb >= 5 ? "#ffc23d" : "#5ee7ff";
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3 + Math.min(5, cb * 0.5);
  ctx.globalAlpha = 0.55 + 0.3 * Math.sin(now / 160);
  ctx.shadowColor = col; ctx.shadowBlur = 18;
  rrect(ctx, L.bx - 2, L.by - 2, L.B + 4, L.B + 4, L.pad * 1.6 + 2); ctx.stroke();
  ctx.restore();
}
function edgeSparks(n) {
  for (let k = 0; k < n; k++) {
    const side = k % 4, u = Math.random();
    const x = side === 0 ? L.bx + u * L.B : side === 1 ? L.bx + L.B : side === 2 ? L.bx + u * L.B : L.bx;
    const y = side === 0 ? L.by : side === 1 ? L.by + u * L.B : side === 2 ? L.by + L.B : L.by + u * L.B;
    const a = Math.atan2(y - (L.by + L.B / 2), x - (L.bx + L.B / 2)), v = 0.6 + Math.random() * 1.4;
    parts.push({ spark: true, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 4 + Math.random() * 6, col: "#fff", t0: now + Math.random() * 200, life: 700 + Math.random() * 500, rot: 0 });
  }
}
// 四角星（亮片）
function star4(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.28 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
// 👍 泡泡 → 星芒
function drawStickers() {
  stickers = stickers.filter(st => {
    const t = now - st.t0; if (t < 0) return true; if (t > 700) return false;
    const [x, y] = cellXY(st.r, st.c), R = L.cell * 0.46;
    ctx.save();
    if (t < 380) {
      const sc = t < 120 ? ease(t / 120) * 1.1 : 1.1 - 0.1 * Math.min(1, (t - 120) / 80);
      ctx.globalAlpha = 0.85; ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R * sc, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1; const ts = L.cell * 0.68 * sc;
      ctx.drawImage(thumbSprite(L.cell * 0.68), x - ts / 2, y - ts / 2, ts, ts);
    } else {
      const u = (t - 380) / 320;
      ctx.globalAlpha = 1 - u; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
      for (let k = 0; k < 10; k++) {
        const a = k * Math.PI / 5 + st.r, r0 = R * (0.3 + u * 0.7), r1 = R * (0.75 + u * 0.9) * (k % 2 ? 0.75 : 1);
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke();
      }
      ctx.fillStyle = "#fff"; star4(x, y, R * 0.5 * (1 - u));
    }
    ctx.restore(); return true;
  });
}
// Pattern Finished!：消掉的格子變成發光白框
function drawPattern() {
  const t = (now - patT) / 900; if (t < 0 || t >= 1) return;
  ctx.save(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.shadowColor = "#bfe8ff"; ctx.shadowBlur = 10;
  ctx.globalAlpha = 1 - t;
  ctx.beginPath();
  for (const [r, c] of patCells) { const x = L.gx + c * L.cell + 4, y = L.gy + r * L.cell + 4, w = L.cell - 8; ctx.moveTo(x + 5, y); ctx.arcTo(x + w, y, x + w, y + w, 5); ctx.arcTo(x + w, y + w, x, y + w, 5); ctx.arcTo(x, y + w, x, y, 5); ctx.arcTo(x, y, x + w, y, 5); ctx.closePath(); }
  ctx.stroke();
  ctx.restore();
}
// 連擊中：分數後面一顆藍綠色鑽石，連越多越大（原版 9.6.8）
function drawComboGem(cx, cy) {
  const Cs = C.comboShown(game.S.combo), want = Cs >= 1 && overT < 0 ? 1 + Math.min(14, Cs) * 0.05 : 0;
  gemShow = lerp(gemShow, want, Math.min(1, 0.18 * dt));
  if (gemShow < 0.03) return;
  const R = L.cell * 0.62 * gemShow * (1 + 0.04 * Math.sin(now / 220));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = "#5ef2ff"; ctx.shadowBlur = 18 * gemShow;
  const g = ctx.createLinearGradient(0, -R, 0, R); g.addColorStop(0, "#9ffcff"); g.addColorStop(0.5, "#33d6e8"); g.addColorStop(1, "#0d8fb8");
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -R * 1.15); ctx.lineTo(R * 0.85, 0); ctx.lineTo(0, R * 1.15); ctx.lineTo(-R * 0.85, 0); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.beginPath(); ctx.moveTo(0, -R * 1.15); ctx.lineTo(R * 0.85, 0); ctx.lineTo(0, -R * 0.1); ctx.lineTo(-R * 0.85, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}
// 開局目標標題卡（冒險／每日）：從上面滑下來、停一下、再滑走，不擋操作
function drawTitleCard() {
  const t = (now - titleT) / 1500; if (t < 0 || t >= 1) return;
  const k = t < 0.2 ? ease(t / 0.2) : t > 0.8 ? 1 - ease((t - 0.8) / 0.2) : 1;
  const y = L.by + L.B * 0.42 - (1 - k) * L.cell * 2, w = Math.min(W - 40, L.B * 0.9), h = L.cell * 1.15;
  ctx.save(); ctx.globalAlpha = k;
  ctx.fillStyle = "rgba(14,20,60,.82)"; rrect(ctx, W / 2 - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.font = font(L.cell * 0.55, 900); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#ffe36a";
  ctx.fillText(titleTxt, W / 2, y + 1);
  ctx.restore();
}
function drawParts() {
  if (parts.length > 300) parts.splice(0, parts.length - 300);
  parts = parts.filter(p => {
    const t = (now - p.t0) / p.life; if (t >= 1) return false;
    p.vy += 0.25 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += 0.15 * dt;
    if (p.spark) { if (now < p.t0) return true; ctx.save(); ctx.globalAlpha = (1 - t) * 0.95; ctx.fillStyle = "#fff"; star4(p.x, p.y, p.s * (1 - t * 0.5)); ctx.restore(); p.vy -= 0.25 * dt; return true; }
    ctx.save(); ctx.globalAlpha = 1 - t; ctx.fillStyle = p.col; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
    return true;
  });
}
function trayCS(s) { return Math.min(L.tc, L.slotW * 0.92 / s.wd); }
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
      else { const cs = lerp(L.cell, trayCS(C.SHAPE_BY_ID[p.id]), e); drawPiece(p, lerp(backAnim.x, cx, e), lerp(backAnim.y, cy, e), cs); return; }
    }
    const fits = C.fitsAnywhere(rows, C.SHAPE_BY_ID[p.id]);
    const br = fits && overT < 0 ? 1 + 0.03 * Math.sin(now / 420 + i * 1.9) : 1;
    drawPiece(p, cx, cy, trayCS(C.SHAPE_BY_ID[p.id]) * br, fits || overT >= 0 ? a : a * 0.35);
  });
}
function drawDrag() {
  if (!drag) return;
  const p = game.S.tray[drag.i]; if (!p) { drag = null; return; }
  const s = C.SHAPE_BY_ID[p.id], k = ease(Math.min(1, (now - drag.t0) / 110));
  const cs = lerp(trayCS(s), L.cell, k);
  const cx = lerp(L.sx[drag.i], drag.px, k), cy = lerp(L.ty, drag.py - lift(s), k);
  const x0 = cx - s.wd * cs / 2, y0 = cy - s.h * cs / 2, o = cs * 0.12;
  ctx.fillStyle = "rgba(8,12,40,.32)";
  s.cells.forEach(([r, c]) => { rrect(ctx, x0 + c * cs + o, y0 + r * cs + o * 1.6, cs, cs, cs * 0.12); ctx.fill(); });
  drawPiece(p, cx, cy, cs);
}
const PRAISE_STYLE = {
  "Good!": ["#7dff5a", "#2fb52a", "#14581a"], "Great!": ["#f08bff", "#c43be8", "#4c1170"],
  "Excellent!": ["#fff27a", "#ffbe1f", "#7a3b00"], "Amazing!": ["#ffb35c", "#ff5e3a", "#6e1600"],
  "Unbelievable!": ["rainbow", "rainbow", "#3a1166"], "New Best!": ["rainbow", "rainbow", "#3a1166"], "Board Clear!": ["rainbow", "rainbow", "#3a1166"],
};
function fancyText(o, t) {
  const sc = t < 0.16 ? lerp(0.3, 1.18, ease(t / 0.16)) : t < 0.28 ? lerp(1.18, 1, (t - 0.16) / 0.12) : 1 + (t - 0.28) * 0.06;
  const a = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(o.x, o.y - (o.kind === "gain" ? t * L.cell * 0.5 : 0)); ctx.scale(sc, sc);
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  const grad = (w, c1, c2) => {
    if (c1 === "rainbow") { const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0), h0 = (now / 5) % 360; for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, `hsl(${(h0 + k * 55) % 360},100%,64%)`); return g; }
    const g = ctx.createLinearGradient(0, -o.size * 0.5, 0, o.size * 0.5); g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
  };
  if (o.kind === "gain") {
    ctx.font = font(o.size); ctx.shadowColor = "rgba(255,200,60,.9)"; ctx.shadowBlur = o.size * 0.5;
    ctx.lineWidth = o.size * 0.2; ctx.strokeStyle = "#3a2066"; ctx.strokeText(o.str, 0, 0);
    ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.fillText(o.str, 0, 0);
  } else if (o.kind === "combo") {
    // 「Combo」斜體白藍＋大一號的金色數字
    if (o.w1 === undefined) { ctx.font = "italic " + font(o.size); o.w1 = ctx.measureText("Combo").width; ctx.font = "italic " + font(o.size * 1.3); o.w2 = o.str ? ctx.measureText(o.str).width + o.size * 0.12 : 0; }
    const w1 = o.w1, w2 = o.w2;
    const x0 = -(w1 + w2) / 2;
    ctx.textAlign = "left"; ctx.lineWidth = o.size * 0.22; ctx.strokeStyle = "#13286e";
    ctx.font = "italic " + font(o.size); ctx.strokeText("Combo", x0, 0);
    const g = ctx.createLinearGradient(0, -o.size * 0.5, 0, o.size * 0.5); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#8fd8ff");
    ctx.fillStyle = g; ctx.fillText("Combo", x0, 0);
    if (o.str) {
      ctx.font = "italic " + font(o.size * 1.3); ctx.lineWidth = o.size * 0.26; ctx.strokeText(o.str, x0 + w1 + o.size * 0.12, -o.size * 0.06);
      ctx.fillStyle = grad(0, "#fff27a", "#ff9d1f"); ctx.fillText(o.str, x0 + w1 + o.size * 0.12, -o.size * 0.06);
    }
  } else {
    const [c1, c2, st] = o.kind === "pattern" ? ["#e8ff6a", "#7fe03a", "#1f5a12"] : (PRAISE_STYLE[o.str] || ["#fff", "#ddd", "#1b2466"]);
    ctx.font = font(o.size); if (o.w === undefined) o.w = ctx.measureText(o.str).width; const w = o.w;
    // Excellent 以上：後面一道彩虹拱門（原版）
    if (o.str === "Excellent!" || o.str === "Amazing!" || o.str === "Unbelievable!") {
      const cols = ["#ff4d4d", "#ff9d2e", "#ffe04a", "#5fe04a", "#3ab6ff", "#9b5cff"];
      ctx.lineWidth = o.size * 0.1;
      cols.forEach((cc, k) => { ctx.strokeStyle = cc; ctx.beginPath(); ctx.ellipse(0, o.size * 0.25, w * 0.46 - k * o.size * 0.09, o.size * 0.95 - k * o.size * 0.09, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); });
    }
    ctx.lineWidth = o.size * 0.24; ctx.strokeStyle = st; ctx.strokeText(o.str, 0, 0);
    ctx.lineWidth = o.size * 0.08; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.strokeText(o.str, 0, 0);
    ctx.fillStyle = grad(w, c1, c2); ctx.fillText(o.str, 0, 0);
    // 兩側 👍（Great 以上）
    if (o.kind === "praise" && !/^(Good!|New Best!)$/.test(o.str)) {
      const ts = o.size * 0.78, tim = thumbSprite(ts);
      ctx.drawImage(tim, -w / 2 - o.size * 0.5 - ts / 2, -ts / 2, ts, ts); ctx.drawImage(tim, w / 2 + o.size * 0.5 - ts / 2, -ts / 2, ts, ts);
    }
  }
  ctx.restore();
}
function drawTexts() {
  texts = texts.filter(o => {
    const t = (now - o.t0) / o.dur; if (t >= 1) return false; if (t < 0) return true;
    if (o.kind) { fancyText(o, t); return true; }
    const sc = t < 0.18 ? lerp(0.4, 1.15, ease(t / 0.18)) : t < 0.3 ? lerp(1.15, 1, (t - 0.18) / 0.12) : 1;
    const a = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(o.x, o.y - t * L.cell * 0.6); ctx.scale(sc, sc);
    ctx.font = `900 ${o.size}px "Nunito", "Arial Rounded MT Bold", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.lineWidth = o.size * 0.18; ctx.strokeStyle = o.stroke; ctx.strokeText(o.str, 0, 0);
    if (o.color === "rainbow") {
      const w = ctx.measureText(o.str).width, g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0), h0 = (now / 6) % 360;
      for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, `hsl(${(h0 + k * 55) % 360},100%,65%)`);
      ctx.fillStyle = g;
    } else ctx.fillStyle = o.color;
    ctx.fillText(o.str, 0, 0);
    ctx.restore(); return true;
  });
}
function font(sz, w = 900) { return `${w} ${sz}px "Nunito", "Arial Rounded MT Bold", "PingFang TC", "Microsoft JhengHei", sans-serif`; }
function drawGear() {
  const { x, y, r } = L.gear;
  ctx.save(); ctx.fillStyle = "rgba(255,255,255,.26)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.beginPath();
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 + Math.PI / 16, rr = i % 2 ? r * 0.5 : r * 0.68; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(60,90,190,1)"; ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, Math.PI * 2); ctx.fill();   // 齒輪中間的洞
  ctx.restore();
}
function drawHUD() {
  const S = game.S, top = L.sa;
  drawGear();
  // 分數滾上去（先慢後快，scoreTo 設定）
  dispScore = shownScore();
  if (scoreTw && now > scoreTw.t0 + scoreTw.dur) { dispScore = scoreTw.to; scoreTw = null; }
  if (!scoreTw && dispScore !== S.score) dispScore = S.score;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (S.mode === "classic") {
    ctx.textAlign = "left"; ctx.font = font(20); ctx.fillStyle = "#ffd54a";
    ctx.fillText("👑 " + Math.max(best, S.score).toLocaleString(), 16, top + 36);
    ctx.textAlign = "center";
    const sz = Math.min(64, (L.hud - top) * 0.42) * (1 + 0.2 * Math.max(0, 1 - (now - scorePulse) / 320));
    ctx.font = font(sz); ctx.lineJoin = "round"; ctx.lineWidth = sz * 0.12; ctx.strokeStyle = "#1d2a66";
    const y = top + (L.hud - top) * 0.62;
    drawComboGem(W / 2, y);
    ctx.font = font(sz); ctx.lineJoin = "round"; ctx.lineWidth = sz * 0.12; ctx.strokeStyle = "#1d2a66";
    ctx.strokeText(Math.round(dispScore).toLocaleString(), W / 2, y); ctx.fillStyle = "#fff"; ctx.fillText(Math.round(dispScore).toLocaleString(), W / 2, y);
  } else {
    ctx.font = font(20); ctx.fillStyle = "#dfe6ff"; ctx.fillText(S.mode === "daily" ? "📅 每日挑戰 " + Math.floor(S.level / 100 % 100) + "/" + S.level % 100 : "第 " + S.level + " 關", W / 2, top + 36);
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
      ctx.fillStyle = "rgba(0,0,0,.22)"; rrect(ctx, x - 44, y - 25, Math.min(chipW - 8, 92), 50, 25); ctx.fill();
      ctx.drawImage(gemSprite(g.gem, isz), x - 18 - isz / 2, y - isz / 2, isz, isz);
      const left = g.need - (gotDisp[g.gem] || 0);
      ctx.font = font(24); ctx.textAlign = "left"; ctx.lineJoin = "round"; ctx.lineWidth = 5; ctx.strokeStyle = "#1d2a66";
      const lt = left <= 0 ? "✓" : String(left);
      ctx.strokeText(lt, x + 6, y + 1); ctx.fillStyle = left <= 0 ? "#6fdc4f" : "#fff"; ctx.fillText(lt, x + 6, y + 1);
      ctx.textAlign = "center";
    });
  }
}
// 連擊徽章：🔥 ×N，後面三個點＝還剩幾塊沒消就會斷
function drawComboBadge() {
  const S = game.S; if (S.combo < 2 || overT >= 0) return;
  const y = L.by - Math.min(26, (L.by - L.hud) * 0.5 + 6), left = C.SCORE.comboGrace - S.sinceClear;
  ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const sz = 20 + Math.min(8, S.combo);
  ctx.font = font(sz); ctx.lineJoin = "round"; ctx.lineWidth = 5; ctx.strokeStyle = "#1d2a66";
  const txt = "🔥 ×" + S.combo;
  ctx.strokeText(txt, W / 2 - 14, y); ctx.fillStyle = S.combo >= 8 ? "#ff8a5c" : S.combo >= 5 ? "#ffd54a" : "#7ff0ff"; ctx.fillText(txt, W / 2 - 14, y);
  const tw = ctx.measureText(txt).width;
  for (let k = 0; k < C.SCORE.comboGrace; k++) {
    ctx.beginPath(); ctx.arc(W / 2 - 14 + tw / 2 + 12 + k * 13, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = k < left ? "#fff" : "rgba(255,255,255,.22)"; ctx.fill();
  }
  ctx.restore();
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
  try {
    if (current === "sMenu" || current === "sLevels" || current === "sRank") renderMenu(); else render();
  } catch (err) { if (frameErr++ < 3) console.error(err); }
}
function renderMenu() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  heat = 0; drawBG();
  const cs = Math.min(W, H) * 0.06;
  while (menuPieces.length < 9) {
    const sh = C.SHAPES[Math.floor(Math.random() * C.SHAPES.length)];
    menuPieces.push({ p: { id: sh.id, k: Math.floor(Math.random() * 7), gems: null }, x: Math.random() * W, y: menuPieces.length ? -cs * 5 - Math.random() * H * 0.5 : Math.random() * H,
      v: 0.25 + Math.random() * 0.45, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.01, sc: 0.7 + Math.random() * 0.6 });
  }
  menuPieces = menuPieces.filter(m => {
    m.y += m.v * dt; m.rot += m.vr * dt;
    if (m.y > H + cs * 6) return false;
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.rot); drawPiece(m.p, 0, 0, cs * m.sc, 0.28); ctx.restore();
    return true;
  });
}
// 原版結束：棋盤下緣一條深色橫幅「No Space Left」
function drawNoSpace() {
  if (overT < 0) return;
  const t = Math.min(1, (now - overT) / 260), y = L.by + L.B + Math.min(L.T * 0.35, L.cell * 1.2), h = L.cell * 1.05;
  ctx.save(); ctx.globalAlpha = t;
  ctx.fillStyle = "rgba(10,14,40,.78)"; ctx.fillRect(0, y - h / 2, W, h);
  ctx.font = font(L.cell * 0.5); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
  ctx.fillText("No Space Left", W / 2 + (1 - ease(t)) * -W * 0.3, y + 1);
  ctx.restore();
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBG();
  if (game && !current) {
    heat = 0;
    const sh = trauma * trauma * L.cell * 0.35; trauma = Math.max(0, trauma - 0.03 * dt);
    ctx.save(); if (sh > 0.3) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    drawBoard(); drawCells(); drawSheen(); drawGhost(); drawBursts(); drawBeams(); drawPattern(); drawStickers();
    ctx.restore();
    drawTray(); drawParts(); drawDrag(); drawHUD(); drawFlyGems(); drawTexts(); drawTitleCard(); drawNoSpace();
    const ft = (now - flashT) / 220;
    if (ft < 1) { ctx.fillStyle = `rgba(255,255,255,${0.22 * (1 - ft)})`; ctx.fillRect(0, 0, W, H); }
  } else if (game && current) {
    drawBoard(); drawCells(); drawTray(); drawHUD(); drawParts(); drawNoSpace();   // 暫停／結束畫面後面也看得到盤面
  }
}

// ── 畫面切換（DOM 選單）──
let current = "sMenu";
function show(id) {
  document.querySelectorAll(".screen").forEach(el => el.classList.toggle("on", el.id === id));
  current = id;
  if (id === "sMenu") refreshMenu();
  if (id === "sLevels") refreshLevels();
  if (id === "sRank") {
    renderRank($("rankList"), -1); $("rankName").value = myName;
    $("statBox").innerHTML = "";
    [["👑 最高分", best], ["🎮 經典局數", stats.games], ["🧱 放了幾塊", stats.blocks], ["💥 消了幾條", stats.lines],
     ["🔥 最高連擊", stats.bestCombo], ["⚡ 一次最多消", stats.maxLines + " 條"], ["✨ 全清次數", stats.allClears], ["📅 每日挑戰", daily.done.length + " 天"]]
      .forEach(([k, v]) => { const d = document.createElement("div"); const a = document.createElement("span"); a.textContent = k; const b = document.createElement("b"); b.textContent = typeof v === "number" ? v.toLocaleString() : v; d.append(a, b); $("statBox").appendChild(d); });
  }
  // 音樂：選單類放選單曲；遊戲中照模式；暫停／結束畫面把遊戲曲壓小聲
  if (id === "sMenu" || id === "sLevels" || id === "sRank") music("menu");
  else if (game) music(game.S.mode === "classic" ? "classic" : "adventure", id === null ? 1 : 0.35);
}
function refreshMenu() {
  $("menuBest").textContent = best > 0 ? "👑 最高分 " + best.toLocaleString() : "";
  $("bAdventure").textContent = adv.done.length >= C.LEVEL_COUNT ? "冒險關卡・全破！" : "冒險關卡・第 " + maxUnlocked() + " 關";
  const sv = store.get("save_classic", null);
  $("classicSub").textContent = sv && !sv.over && Number.isFinite(sv.score) && sv.moves > 0 ? "上一局 " + sv.score.toLocaleString() + " 分，接著玩" : "";
  $("menuAdv").textContent = "已過 " + adv.done.length + " / " + C.LEVEL_COUNT + " 關";
  const today = C.dateKey(), st = dailyStreak(), doneToday = daily.done.includes(today);
  $("bDaily").textContent = "📅 每日挑戰" + (doneToday ? " ✓" : "");
  $("dailySub").textContent = (st ? "🔥 連續 " + st + " 天" : "每天一題，連續玩會累積🔥") + (doneToday ? "・今天完成了" : "");
}
function maxUnlocked() { return Math.min(C.LEVEL_COUNT, (adv.done.length ? Math.max(...adv.done) : 0) + 1); }
function refreshLevels() {
  const box = $("levelGrid"); box.innerHTML = "";
  const top = maxUnlocked(), sv = store.get("save_adv", null);
  $("lvSummary").textContent = "已過 " + adv.done.length + " / " + C.LEVEL_COUNT + " 關";
  for (let n = 1; n <= C.LEVEL_COUNT; n++) {
    const b = document.createElement("button");
    const done = adv.done.includes(n), open = n <= top;
    b.className = "lv" + (done ? " done" : open ? "" : " lock") + (n === top && !done ? " cur" : "");
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
$("bRestart").onclick = () => { if (game.S.mode === "classic") startClassic(true); else startLevel(game.S.level, true, game.S.mode); };
$("bHome").onclick = () => { saveGame(); show("sMenu"); };
$("bAgain").onclick = () => startClassic(true);
$("bOverHome").onclick = () => show("sMenu");
$("bNext").onclick = () => startLevel(Math.min(C.LEVEL_COUNT, game.S.level + 1), true);
$("bRetry").onclick = () => startLevel(game.S.level, true, game.S.mode);
$("bDaily").onclick = () => startLevel(C.dateKey(), false, "daily");
$("bResLevels").onclick = () => show(game && game.S.mode === "daily" ? "sMenu" : "sLevels");
$("bRank").onclick = () => show("sRank");
$("bRankBack").onclick = () => show("sMenu");
$("rankName").oninput = e => setName(e.target.value, false);
$("overName").oninput = e => { setName(e.target.value, true); renderRank($("overRank"), lastEntry ? rank.indexOf(lastEntry) : -1); };
["rankName", "overName"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); }));
// 暫停畫面的三顆開關（音樂／音效／震動）
document.querySelectorAll(".tg").forEach(b => {
  const k = b.dataset.opt, paint = () => b.classList.toggle("off", !opts[k]);
  paint();
  b.onclick = () => {
    opts[k] = !opts[k]; store.set("opts", opts); paint();
    if (k === "music") { const w = MUS.want, lv = MUS.level; music(opts.music ? w : null, lv); MUS.want = w; }
    if (k === "sound") sfx.pick();
    if (k === "vib") vib(20);
  };
});

// 測試用：headless 測試直接操作（tools/bb-test/）
window.__bb = { get game() { return game; }, C, L, doPlace, startClassic, startLevel, show, get current() { return current; },
  get mus() { return { cur: MUS.cur, want: MUS.want, playing: !!MUS.src, ctx: AU.ctx ? AU.ctx.state : null }; } };

layout();
requestAnimationFrame(frame);
try { show("sMenu"); } catch (err) {   // 選單資料壞掉也不要讓整個遊戲開不起來
  console.error(err);
  ["save_classic", "save_adv", "save_daily"].forEach(k => store.del(k));
  document.getElementById("sMenu").classList.add("on"); current = "sMenu";
}
