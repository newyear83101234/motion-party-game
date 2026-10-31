// ===================== 注音小島：小魚長大記（大魚吃小魚） =====================
// 小朋友用手指帶著自己的魚游：吃掉身上有「唸出來的那個注音」的小魚就會長大；
// 大魚會從邊邊游進來（進來前那一邊先出現「！」、咚咚兩聲、閃紅光），只有大魚的「嘴巴」碰到才算咬到。
// 一區＝3 個任務（每個吃 3 隻）＝長大 3 段；長到第 3 段，畫面上會有一隻戴皇冠的金色大魚（會逃、吃到噴金幣＝反擊的爽感）。
// 長滿就進化成下一種海洋動物、游到更深的海，每次進化多一個看得到的小能力：
//   河豚＝被大魚碰到會鼓起來嚇跑牠（每區 1 次）｜海龜＝硬殼擋 1 次（每區 1 次）｜海豚起＝游得比較快｜鯨魚起＝一大口吃 2 隻
//
// 兩種玩法（主對話 11-01 拍板）：
//   第 1 圈（start 的 zone 0–7）＝旅程：沒有愛心、不會輸。被咬＝掉幾枚金幣（3 秒內撿得回來）、任務進度點少 1、往後彈、無敵 3 秒。
//     第 8 區（寶藏宮殿）長完＝大結局「長成魚王了！」→ onEnd(r)，r.finished＝true。
//   第 2 圈（start 的 zone ≥ 8）＝挑戰：3 顆心、被咬扣 1、每區補 1，心用完收尾（r.finished＝false）。
//   每次進化演出完有一顆 3 秒的「休息一下」鈕：按了就收尾 → onEnd(r)，r.rest＝true（小孩中途收工、拿星星的正規出口）。
// 亂吃有代價：吃錯＝「噗」吐出來＋頭上冒星星暈 1.2 秒（游很慢、不能吃）、連吃歸零；每個任務只回報「第一次吃錯」。
//   第一口就吃對（這個任務第一隻、之前沒吃錯）＝金色大口＋3 倍金幣＋「一口就對！」。
//   答案魚約 3 成、畫面上隨時至少 2 隻；這個任務 12 秒都沒吃對，答案魚才發亮。
// 收尾不出現「遊戲結束」：小魚游回家吐泡泡＋8 區小地圖（「你長成○○了！」）約 2 秒，再 onEnd。
//
// 介面（主程式照這個接，docs/zhuyin-endless-plan.md §6）：
//   createGrowGame(root, api) → { start({ zone, intro }), stop(), relayout() }
//   api：say talk play later paused stopVoice speed best onAnswer onZone onEnd
//   ⚠️ api.later 的毫秒數模組自己已經除以 api.speed（測試加速）；主程式的 later 不要再除一次。
//   onEnd(r)：{ zone, zonesCleared, score, coins, right, wrong, ms, words, record, finished, rest, stars }
//     score＝吃對的隻數×10＋賺到的金幣（被咬掉的不扣 → 分數只會一直加）；coins＝結束時手上的金幣；
//     wrong＝吃錯的總次數（回報給 onAnswer 的只有每個任務第一次）；ms＝遊戲時間（不含暫停、已乘加速倍率）；stars＝星星罐裡幾顆（最多 10）
//
// 座標：畫布的 CSS 像素；U＝短邊的 1%（跟 vmin 一樣），魚的大小、速度都用 U 算，轉向時照比例搬。
// 時間：模擬用「遊戲秒」（真實秒 × api.speed）；一格最多算 0.05 真實秒（切到背景回來不會暴衝），太長的一格切成小步（不會穿過魚）。
// 畫布上不寫國字（國字要有主程式的自動注音，一律放在 DOM：任務牌、大字、小地圖）；魚身上的注音泡泡是畫布畫的（直排、聲調畫在右上）。
// 測試掛鉤：window.__zyGrow（只給 tools/zy-test/grow-unit.js 用）
import { createAsker, ZONES_N, TIER_NAME, loopName } from "./zhuyin-endless-core.js?v=1";   // 兩款同一個網址（只載一次）；改了核心要一起升

// 模組會用 api.talk 念的固定台詞（tools/voice/build_lines.py 會收；別的地方不要寫死台詞）
export const LINES = {
  intro: "用手指帶著小魚游！吃掉身上有對的注音的小魚，就會長大喔！",
  oneBite: "一口就對！",
  crown: "你變大了！戴皇冠的金色大魚，可以吃掉喔！",
  bite: "小心！看到驚嘆號，就是大魚要來了！",
  zone1: "變成熱帶魚了！游到珊瑚礁囉！",
  zone2: "變成河豚了！大魚碰到你，你會鼓起來嚇跑牠！",
  zone3: "變成海龜了！硬硬的殼可以擋一次大魚！",
  zone4: "變成海豚了！你游得好快喔！",
  zone5: "變成鯊魚了！這裡是冰冰的海！",
  zone6: "變成鯨魚了！一大口可以吃兩隻喔！",
  zone7: "變成魚王了！歡迎來到寶藏宮殿！",
  loop: "好厲害！再游一圈，大魚會更快喔！",
  finale: "你長成魚王了！好厲害！",
  home: "游回家休息囉！",
  record: "破紀錄了！",
};

// 8 區：海的名字＋表情（介紹卡、結算、打卡點用）＋這區的你（fish：「你長成○○了！」）
export const ZONES = [
  { name: "淺灘", ico: "🐟", fish: "小魚" },
  { name: "珊瑚礁", ico: "🐠", fish: "熱帶魚" },
  { name: "海草森林", ico: "🐡", fish: "河豚" },
  { name: "沉船", ico: "🐢", fish: "海龜" },
  { name: "發光深海", ico: "🐬", fish: "海豚" },
  { name: "冰海", ico: "🦈", fish: "鯊魚" },
  { name: "火山海溝", ico: "🐋", fish: "鯨魚" },
  { name: "寶藏宮殿", ico: "👑", fish: "魚王" },
];

const TAU = Math.PI * 2;
const NEED = 3, TASKS = 3;          // 一個任務吃幾隻、一區幾個任務（＝長大 3 段）
const MAXV = 28;                    // 你的魚最快幾 U／秒（海豚起 ×1.3；大魚最快 15 上下，躲得掉）
const DIZZY = 1.2, INV = 3, HINT_AFTER = 12, WARN = 1.5, QUIET = 3, STAR_MAX = 10;
const FONT = '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", "Heiti TC", sans-serif';
const INK = "#1b2659";              // 注音字的顏色（泡泡是白的：再暗的海也一樣清楚）
const TONE_OF = { "ˊ": 2, "ˇ": 3, "ˋ": 4, "˙": 5 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = k => 1 - (1 - k) ** 3;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const hx = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixHex = (a, b, k) => { const x = hx(a), y = hx(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join(""); };
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 每區的難度：大魚同時最多幾隻、多久來一隻（秒）、速度（U/秒）、會不會慢慢轉向追你（弧度/秒；第 1–3 區不追、走直線）、小魚幾隻、小魚速度
const DIFF = [
  { pMax: 1, gap: 14, pv: 5.5, home: 0, preyN: 7, fv: 5 },
  { pMax: 1, gap: 12, pv: 6.5, home: 0, preyN: 7, fv: 5.5 },
  { pMax: 1, gap: 11, pv: 7.5, home: 0, preyN: 8, fv: 6 },
  { pMax: 2, gap: 11, pv: 8.5, home: 0.12, preyN: 8, fv: 6.5 },
  { pMax: 2, gap: 10.5, pv: 9.5, home: 0.15, preyN: 7, fv: 7 },
  { pMax: 2, gap: 10, pv: 10.5, home: 0.18, preyN: 7, fv: 7.5 },
  { pMax: 2, gap: 9.5, pv: 11, home: 0.2, preyN: 6, fv: 8 },
  { pMax: 2, gap: 9, pv: 12, home: 0.22, preyN: 6, fv: 8.5 },
];
// 第 1 圈是旅程（不會輸）：大魚最多 2 隻、轉向很慢；第 2 圈挑戰才多一隻、更快、更會追
// 玩家的 8 種造型（mx＝嘴巴在前面多遠，單位＝魚的半徑）
const SPECIES = [
  { kind: "fish", shape: "oval", ax: 1.12, ay: 0.95, mx: 1.0, body: "#ff9a3c", belly: "#ffe2b5", fin: "#ffc27a", line: "#b4561a", tail: "fan", dorsal: "round" },
  { kind: "fish", shape: "oval", ax: 1.0, ay: 1.0, mx: 0.9, body: "#ffd23f", belly: "#fff3b8", fin: "#4a95e6", line: "#a17800", tail: "fan", dorsal: "tall", anal: true, stripes: "#2f6fd6", stripeN: 2 },
  { kind: "fish", shape: "oval", ax: 1.0, ay: 0.98, mx: 0.95, body: "#f6d77f", belly: "#fff8dc", fin: "#f0b14a", line: "#9a7430", tail: "small", dorsal: "none", spots: "#b9873e", spikes: true },
  { kind: "turtle", ax: 1.3, ay: 0.85, mx: 1.35, body: "#86d07a", shell: "#3d9a57", plate: "#62bd6c", rim: "#d8c27a", line: "#276a3a" },
  { kind: "fish", shape: "torpedo", ax: 1.5, ay: 0.72, mx: 1.6, body: "#5b9fd8", belly: "#e9f5ff", fin: "#4a8cc6", line: "#2c5b8f", tail: "fork", dorsal: "curve", beak: true },
  { kind: "fish", shape: "torpedo", ax: 1.55, ay: 0.74, mx: 1.45, body: "#8ea4c0", belly: "#f4f7fb", fin: "#7a91ae", line: "#465b76", tail: "shark", dorsal: "tri", gills: true },
  { kind: "fish", shape: "whale", ax: 1.55, ay: 0.9, mx: 1.45, body: "#4a78d6", belly: "#cfe0ff", fin: "#3e67bd", line: "#24448c", tail: "fluke", dorsal: "small", grooves: true },
  { kind: "fish", shape: "oval", ax: 1.18, ay: 0.95, mx: 1.05, body: "#ffc53d", belly: "#fff1b8", fin: "#ff6b6b", line: "#a87512", tail: "royal", dorsal: "tall", crown: true },
];
// 每區新的一種大魚（大胖魚、梭子魚、海鰻、大石斑、鮟鱇魚、虎鯨、獅子魚、海龍）
const PREDS = [
  { shape: "oval", ax: 1.3, ay: 0.95, mx: 1.15, body: "#8f8a4c", belly: "#d9d29a", fin: "#77723a", line: "#4a4620", tail: "fan", dorsal: "spiky", spots: "#5e5a2c" },
  { shape: "torpedo", ax: 2.0, ay: 0.52, mx: 2.0, body: "#9fb3c8", belly: "#eef3f8", fin: "#7d93aa", line: "#45586d", tail: "fork", dorsal: "small", bars: "#5c6f86" },
  { eel: true, ax: 2.3, ay: 0.5, mx: 2.3, body: "#6f9a3a", belly: "#d6e59a", fin: "#557a2a", line: "#2f4a17", spots: "#3f5f1e" },
  { shape: "oval", ax: 1.35, ay: 1.0, mx: 1.2, body: "#8a4f9e", belly: "#e2c6ea", fin: "#6f3b82", line: "#40204b", tail: "fan", dorsal: "spiky", spots: "#5a2a68" },
  { shape: "oval", ax: 1.15, ay: 1.0, mx: 1.05, body: "#5a4c7a", belly: "#8a7caa", fin: "#463b62", line: "#1e1730", tail: "fan", dorsal: "none", lure: true },
  { shape: "torpedo", ax: 1.7, ay: 0.8, mx: 1.7, body: "#262d3e", belly: "#f5f7fb", fin: "#1d2333", line: "#0b0e16", tail: "fluke", dorsal: "tall", orca: true },
  { shape: "oval", ax: 1.2, ay: 0.9, mx: 1.08, body: "#e8584a", belly: "#fbe3dc", fin: "#f4a39a", line: "#86271e", tail: "fan", dorsal: "lion", stripes: "#fff3ee", stripeN: 4 },
  { eel: true, ax: 2.4, ay: 0.55, mx: 2.4, body: "#2e7f86", belly: "#9fe0d6", fin: "#ffd166", line: "#123f44", crest: true },
];
const PREY_COL = ["#ff7eb6", "#6fd34f", "#ffcf2e", "#55bdf5", "#b78cff", "#ff9a3c", "#3fdcbc", "#ff6b6b"];
const SPOTS = [[-0.4, -0.35, 0.09], [-0.1, -0.55, 0.07], [0.15, -0.3, 0.08], [-0.55, 0.05, 0.07], [-0.2, 0.0, 0.06], [0.35, -0.6, 0.06]];
// 8 區背景：上中下三色、海底顏色、光線強弱、海草、會飄的東西（bub 氣泡｜plank 發光浮游｜snow 雪｜ember 火星｜spark 金光）
const BG = [
  { top: "#86e6f7", mid: "#3fc5e8", bot: "#1f9fcc", floor: "#f5dc9e", floor2: "#e7c47c", ray: 0.3, weed: "#3fb37a", weedN: 6, weedH: [12, 24], amb: "bub" },
  { top: "#5ccbf2", mid: "#2b9fda", bot: "#1673b6", floor: "#ecd29b", floor2: "#d9b878", ray: 0.24, weed: "#2fa36b", weedN: 4, weedH: [14, 26], amb: "bub" },
  { top: "#48c0b4", mid: "#22918c", bot: "#11615f", floor: "#a9b27a", floor2: "#8c955f", ray: 0.2, weed: "#2e8f3e", weedN: 15, weedH: [42, 78], amb: "bub", kelp: true },
  { top: "#3486bd", mid: "#1e5f96", bot: "#0f3c66", floor: "#b8a27a", floor2: "#97835c", ray: 0.12, weed: "#3d7a52", weedN: 6, weedH: [14, 28], amb: "bub" },
  { top: "#1f3d78", mid: "#122852", bot: "#06102b", floor: "#2b2f5c", floor2: "#1e2247", ray: 0.04, weed: "#44e0c6", weedN: 8, weedH: [12, 28], amb: "plank", glow: true },
  { top: "#d4f1ff", mid: "#7fc6ec", bot: "#2f80b6", floor: "#eef8ff", floor2: "#c6e4f5", ray: 0.2, weed: null, weedN: 0, weedH: [0, 0], amb: "snow" },
  { top: "#4d2b5c", mid: "#3a1b3b", bot: "#1d0b18", floor: "#3d2329", floor2: "#2a161b", ray: 0.03, weed: "#7a3c3c", weedN: 3, weedH: [10, 20], amb: "ember" },
  { top: "#3d307e", mid: "#2b2060", bot: "#170f39", floor: "#e3bb4c", floor2: "#c99a2e", ray: 0.1, weed: "#8a6ce0", weedN: 4, weedH: [12, 24], amb: "spark" },
];

// ---------- 畫魚（全部在「單位空間」：原點＝魚的中心、往右＝前面、1＝魚的半徑） ----------
function bodyPath(c, s) {
  const ax = s.ax, ay = s.ay; c.beginPath();
  if (s.shape === "torpedo") { c.moveTo(ax, ay * 0.06); c.bezierCurveTo(ax * 0.82, -ay * 0.98, -ax * 0.42, -ay * 1.05, -ax, -ay * 0.2); c.lineTo(-ax, ay * 0.2); c.bezierCurveTo(-ax * 0.42, ay * 1.0, ax * 0.78, ay * 0.92, ax, ay * 0.06); c.closePath(); }
  else if (s.shape === "whale") { c.moveTo(ax, ay * 0.05); c.bezierCurveTo(ax * 1.02, -ay * 1.12, -ax * 0.45, -ay * 0.95, -ax, -ay * 0.18); c.lineTo(-ax, ay * 0.18); c.bezierCurveTo(-ax * 0.45, ay * 0.95, ax * 1.0, ay * 1.1, ax, ay * 0.05); c.closePath(); }
  else c.ellipse(0, 0, ax, ay, 0, 0, TAU);
}
function tailPath(c, type, ay) {
  c.beginPath();
  if (type === "fork") { c.moveTo(0.12, -0.12); c.quadraticCurveTo(-0.25, -0.3, -0.62, -ay * 0.95); c.quadraticCurveTo(-0.42, -0.05, -0.36, 0); c.quadraticCurveTo(-0.42, 0.05, -0.62, ay * 0.95); c.quadraticCurveTo(-0.25, 0.3, 0.12, 0.12); }
  else if (type === "shark") { c.moveTo(0.12, -0.14); c.quadraticCurveTo(-0.2, -0.35, -0.62, -ay * 1.3); c.quadraticCurveTo(-0.46, -0.2, -0.32, 0.02); c.quadraticCurveTo(-0.42, 0.2, -0.52, ay * 0.72); c.quadraticCurveTo(-0.2, 0.3, 0.12, 0.12); }
  else if (type === "fluke") { c.moveTo(0.12, -0.1); c.quadraticCurveTo(-0.2, -0.25, -0.5, -ay * 0.9); c.quadraticCurveTo(-0.78, -ay * 0.8, -0.72, -ay * 0.55); c.quadraticCurveTo(-0.46, -0.1, -0.42, 0); c.quadraticCurveTo(-0.46, 0.1, -0.72, ay * 0.55); c.quadraticCurveTo(-0.78, ay * 0.8, -0.5, ay * 0.9); c.quadraticCurveTo(-0.2, 0.25, 0.12, 0.1); }
  else if (type === "royal") { c.moveTo(0.12, -0.15); c.bezierCurveTo(-0.4, -0.95, -1.3, -1.1, -1.38, -0.55); c.quadraticCurveTo(-0.95, -0.05, -1.32, 0.45); c.bezierCurveTo(-1.28, 1.05, -0.4, 0.95, 0.12, 0.15); }
  else if (type === "small") { c.moveTo(0.1, -0.1); c.quadraticCurveTo(-0.2, -0.45, -0.42, -0.38); c.quadraticCurveTo(-0.3, 0, -0.42, 0.38); c.quadraticCurveTo(-0.2, 0.45, 0.1, 0.1); }
  else { c.moveTo(0.12, -0.12); c.quadraticCurveTo(-0.3, -ay * 0.95, -0.74, -ay * 0.84); c.quadraticCurveTo(-0.52, 0, -0.74, ay * 0.84); c.quadraticCurveTo(-0.3, ay * 0.95, 0.12, 0.12); }
  c.closePath();
}
// 背鰭（畫在身體後面，身體會蓋住下半截）；回傳 false＝這種沒有背鰭
function finPath(c, s) {
  const ax = s.ax, ay = s.ay; c.beginPath();
  switch (s.dorsal) {
    case "round": c.moveTo(-ax * 0.45, -ay * 0.7); c.quadraticCurveTo(-ax * 0.15, -ay * 1.5, ax * 0.25, -ay * 0.8); break;
    case "tall": c.moveTo(-ax * 0.5, -ay * 0.62); c.quadraticCurveTo(-ax * 0.35, -ay * 1.8, ax * 0.2, -ay * 0.84); break;
    case "tri": c.moveTo(-ax * 0.32, -ay * 0.78); c.quadraticCurveTo(-ax * 0.12, -ay * 1.25, -ax * 0.06, -ay * 1.75); c.quadraticCurveTo(ax * 0.05, -ay * 1.1, ax * 0.28, -ay * 0.82); break;
    case "curve": c.moveTo(-ax * 0.35, -ay * 0.82); c.quadraticCurveTo(-ax * 0.12, -ay * 1.25, -ax * 0.2, -ay * 1.62); c.quadraticCurveTo(ax * 0.1, -ay * 1.2, ax * 0.2, -ay * 0.86); break;
    case "small": c.moveTo(-ax * 0.3, -ay * 0.82); c.quadraticCurveTo(-ax * 0.15, -ay * 1.32, ax * 0.1, -ay * 0.88); break;
    case "spiky": case "lion": {
      const n = s.dorsal === "lion" ? 6 : 5, h = s.dorsal === "lion" ? 0.95 : 0.42;
      c.moveTo(-ax * 0.62, -ay * 0.6);
      for (let i = 0; i < n; i++) {
        const x1 = -ax * 0.62 + ax * 1.0 * ((i + 0.5) / n), x2 = -ax * 0.62 + ax * 1.0 * ((i + 1) / n);
        const y1 = -ay * Math.sqrt(Math.max(0, 1 - (x1 / ax) ** 2)), y2 = -ay * Math.sqrt(Math.max(0, 1 - (x2 / ax) ** 2));
        c.lineTo(x1 - 0.06, y1 - ay * h * (s.dorsal === "lion" && i % 2 ? 0.75 : 1)); c.lineTo(x2, y2 * 0.9);
      }
      break;
    }
    default: return false;
  }
  c.closePath(); return true;
}
function drawEye(c, x, y, er, o, line, t) {
  const mood = o.mood || "happy";
  c.lineCap = "round";
  if (mood === "dizzy") {                                   // 暈：轉圈圈眼
    c.strokeStyle = "#2a2440"; c.lineWidth = 0.055; c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, er, 0, TAU); c.fill();
    c.beginPath(); for (let a = 0; a < 13; a += 0.5) { const rr = er * 0.9 * a / 13; c.lineTo(x + Math.cos(a + t * 9) * rr, y + Math.sin(a + t * 9) * rr); } c.stroke(); return;
  }
  if (o.blink || mood === "yuck") {
    c.strokeStyle = "#2a2440"; c.lineWidth = 0.075; c.beginPath();
    if (mood === "yuck") { c.moveTo(x - er * 0.6, y - er * 0.55); c.lineTo(x + er * 0.45, y); c.lineTo(x - er * 0.6, y + er * 0.55); }
    else c.arc(x, y - er * 0.15, er * 0.72, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  } else {
    c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, er, 0, TAU); c.fill(); c.strokeStyle = "rgba(20,20,40,0.55)"; c.lineWidth = 0.045; c.stroke();
    c.fillStyle = "#1c1a2e"; c.beginPath(); c.arc(x + er * 0.2, y + er * 0.06, er * 0.62, 0, TAU); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(x + er * 0.02, y - er * 0.22, er * 0.25, 0, TAU); c.fill();
    c.beginPath(); c.arc(x + er * 0.44, y + er * 0.3, er * 0.11, 0, TAU); c.fill();
  }
  c.strokeStyle = line; c.lineWidth = 0.08;
  if (mood === "mean") { c.beginPath(); c.moveTo(x - er * 1.1, y - er * 1.55); c.lineTo(x + er * 0.9, y - er * 1.0); c.stroke(); }
  else if (mood === "scared") {
    c.beginPath(); c.moveTo(x - er * 0.9, y - er * 1.05); c.lineTo(x + er * 0.8, y - er * 1.55); c.stroke();
    c.fillStyle = "#8fd8ff"; c.beginPath(); const sx = x - er * 1.7, sy = y - er * 1.1; c.moveTo(sx, sy - er * 0.55); c.quadraticCurveTo(sx + er * 0.4, sy, sx, sy + er * 0.25); c.quadraticCurveTo(sx - er * 0.4, sy, sx, sy - er * 0.55); c.fill();
  }
}
function drawMouth(c, s, x, y, o) {
  const m = o.mouth || 0, mood = o.mood || "happy";
  c.lineCap = "round"; c.strokeStyle = s.line;
  if (o.gold) { c.fillStyle = "rgba(255,214,60,0.75)"; c.beginPath(); c.arc(x, y, 0.32 + m * 0.12, 0, TAU); c.fill(); }
  if (m > 0.06) {
    c.fillStyle = "#6b1830"; c.beginPath(); c.ellipse(x - 0.02, y, 0.09 + m * 0.11, 0.04 + m * 0.2, 0, 0, TAU); c.fill(); c.lineWidth = 0.05; c.stroke();
    if (o.teeth) {
      c.fillStyle = "#fff"; const w = 0.06, top = y - (0.04 + m * 0.2) * 0.85;
      for (const dx of [-0.07, 0.04]) { c.beginPath(); c.moveTo(x + dx - w / 2, top); c.lineTo(x + dx + w / 2, top); c.lineTo(x + dx, top + 0.1 + m * 0.05); c.closePath(); c.fill(); }
    } else { c.fillStyle = "#ff8fa8"; c.beginPath(); c.ellipse(x - 0.02, y + m * 0.1, 0.06 + m * 0.05, 0.03 + m * 0.05, 0, 0, TAU); c.fill(); }
  } else if (mood === "mean") {
    c.lineWidth = 0.06; c.beginPath(); c.moveTo(x - 0.18, y + 0.04); c.lineTo(x + 0.04, y - 0.03); c.stroke();
    c.fillStyle = "#fff"; c.beginPath(); c.moveTo(x - 0.1, y + 0.02); c.lineTo(x - 0.04, y + 0.0); c.lineTo(x - 0.07, y + 0.1); c.closePath(); c.fill();
  } else if (mood === "scared" || mood === "dizzy") {
    c.fillStyle = "#6b1830"; c.beginPath(); c.ellipse(x - 0.03, y + 0.02, 0.055, 0.075, 0, 0, TAU); c.fill();
  } else if (mood === "yuck") {
    c.lineWidth = 0.055; c.beginPath(); c.moveTo(x - 0.16, y); c.lineTo(x + 0.02, y); c.stroke();
    c.fillStyle = "#ff7a98"; c.beginPath(); c.ellipse(x - 0.05, y + 0.07, 0.06, 0.08, 0.2, 0, TAU); c.fill();
  } else {
    c.lineWidth = 0.06; c.beginPath(); c.arc(x - 0.08, y - 0.07, 0.12, 0.15 * Math.PI, 0.8 * Math.PI); c.stroke();
  }
}
function drawCrown(c, x, y, k, t) {
  c.save(); c.translate(x, y); c.scale(k, k); c.rotate(-0.12 + Math.sin(t * 2) * 0.05);
  c.beginPath(); c.moveTo(-0.5, 0.2); c.lineTo(-0.55, -0.35); c.lineTo(-0.25, -0.05); c.lineTo(0, -0.5); c.lineTo(0.25, -0.05); c.lineTo(0.55, -0.35); c.lineTo(0.5, 0.2); c.closePath();
  c.fillStyle = "#ffd23f"; c.fill(); c.strokeStyle = "#a8700a"; c.lineWidth = 0.09; c.lineJoin = "round"; c.stroke();
  c.fillStyle = "#ff4f6d"; c.beginPath(); c.arc(0, 0.04, 0.09, 0, TAU); c.fill();
  c.fillStyle = "#4fc3ff"; c.beginPath(); c.arc(-0.3, 0.08, 0.06, 0, TAU); c.arc(0.3, 0.08, 0.06, 0, TAU); c.fill();
  c.restore();
}
function drawFish(c, s, t, o) {
  const ax = s.ax, ay = s.ay, wf = o.wf || 6;
  c.lineJoin = "round"; c.lineCap = "round"; c.lineWidth = 0.075; c.strokeStyle = s.line;
  c.save(); c.translate(-ax * 0.88, 0); c.rotate(Math.sin(t * wf) * 0.3); tailPath(c, s.tail, ay); c.fillStyle = s.fin; c.fill(); c.stroke(); c.restore();
  if (finPath(c, s)) { c.fillStyle = s.fin; c.fill(); c.stroke(); }
  if (s.dorsal === "lion") { c.lineWidth = 0.04; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-ax * 0.2 + i * 0.12, ay * 0.55); c.lineTo(-ax * 0.45 + i * 0.1, ay * 1.45); c.stroke(); } c.lineWidth = 0.075; }
  if (s.anal) { c.beginPath(); c.moveTo(-ax * 0.5, ay * 0.6); c.quadraticCurveTo(-ax * 0.35, ay * 1.65, ax * 0.15, ay * 0.82); c.closePath(); c.fillStyle = s.fin; c.fill(); c.stroke(); }
  if (s.spikes) {
    c.fillStyle = s.fin; const L = o.puff ? 1.55 : 1.16;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + 0.1; c.beginPath(); c.moveTo(Math.cos(a - 0.13) * ax * 0.93, Math.sin(a - 0.13) * ay * 0.93); c.lineTo(Math.cos(a) * ax * L, Math.sin(a) * ay * L); c.lineTo(Math.cos(a + 0.13) * ax * 0.93, Math.sin(a + 0.13) * ay * 0.93); c.closePath(); c.fill(); c.stroke(); }
  }
  if (s.beak) { c.beginPath(); c.ellipse(ax * 0.98, ay * 0.22, ax * 0.24, ay * 0.17, 0.05, 0, TAU); c.fillStyle = s.body; c.fill(); c.stroke(); }
  bodyPath(c, s); c.fillStyle = s.body; c.fill();
  c.save(); bodyPath(c, s); c.clip();
  c.fillStyle = s.belly; c.beginPath(); c.ellipse(ax * 0.05, ay * 0.78, ax * 1.1, ay * 0.6, 0, 0, TAU); c.fill();
  if (s.stripes) { c.fillStyle = s.stripes; const n = s.stripeN || 2; for (let i = 0; i < n; i++) { const x = -ax * 0.55 + (i + 0.5) * ((ax * 1.15) / n); c.beginPath(); c.ellipse(x, 0, ax * 0.085, ay * 1.2, 0.12, 0, TAU); c.fill(); } }
  if (s.spots) { c.fillStyle = s.spots; for (const [px, py, pr] of SPOTS) { c.beginPath(); c.arc(px * ax, py * ay, pr, 0, TAU); c.fill(); } }
  if (s.bars) { c.fillStyle = s.bars; for (let i = 0; i < 4; i++) { const x = -ax * 0.6 + i * ax * 0.35; c.beginPath(); c.moveTo(x, -ay); c.lineTo(x + 0.14, -ay); c.lineTo(x + 0.02, 0); c.lineTo(x - 0.1, 0); c.closePath(); c.fill(); } }
  if (s.orca) { c.fillStyle = "#f5f7fb"; c.beginPath(); c.ellipse(ax * 0.3, -ay * 0.3, ax * 0.17, ay * 0.13, -0.2, 0, TAU); c.fill(); c.beginPath(); c.ellipse(-ax * 0.45, ay * 0.32, ax * 0.3, ay * 0.22, 0.4, 0, TAU); c.fill(); }
  if (s.grooves) { c.strokeStyle = "rgba(60,90,170,0.45)"; c.lineWidth = 0.04; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(ax * 0.85, ay * (0.32 + i * 0.13)); c.lineTo(-ax * 0.15, ay * (0.42 + i * 0.13)); c.stroke(); } }
  c.fillStyle = "rgba(255,255,255,0.28)"; c.beginPath(); c.ellipse(ax * 0.15, -ay * 0.58, ax * 0.55, ay * 0.2, -0.1, 0, TAU); c.fill();
  c.restore();
  c.strokeStyle = s.line; c.lineWidth = 0.075; bodyPath(c, s); c.stroke();
  if (s.gills) { c.lineWidth = 0.045; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(ax * (0.62 - i * 0.1), 0.05, ay * 0.32, 2.6, 3.7); c.stroke(); } }
  c.save(); c.translate(-ax * 0.02, ay * 0.34); c.rotate(0.55 + Math.sin(t * wf * 0.8) * 0.35); c.beginPath(); c.ellipse(-0.22, 0, 0.3, 0.12, 0, 0, TAU); c.fillStyle = s.fin; c.fill(); c.lineWidth = 0.06; c.stroke(); c.restore();
  const torp = s.shape === "torpedo" || s.shape === "whale";
  const ex = ax * (torp ? 0.56 : 0.47), ey = -ay * (torp ? 0.14 : 0.2), er = o.er || 0.28;
  if (!o.noCheek) { c.fillStyle = "rgba(255,110,140,0.42)"; c.beginPath(); c.ellipse(ex - er * 0.15, ey + er * 1.55, er * 0.55, er * 0.3, 0, 0, TAU); c.fill(); }
  drawEye(c, ex, ey, er, o, s.line, t);
  drawMouth(c, s, ax * (torp ? 0.84 : 0.86), ay * 0.3, o);
  if (s.lure) {
    c.strokeStyle = s.line; c.lineWidth = 0.06; c.beginPath(); c.moveTo(ax * 0.3, -ay * 0.92); c.quadraticCurveTo(ax * 0.75, -ay * 1.7, ax * 1.15, -ay * 1.15 + Math.sin(t * 3) * 0.08); c.stroke();
    const lx = ax * 1.15, ly = -ay * 1.15 + Math.sin(t * 3) * 0.08, gl = c.createRadialGradient(lx, ly, 0, lx, ly, 0.5);
    gl.addColorStop(0, "rgba(255,250,170,0.95)"); gl.addColorStop(1, "rgba(255,250,170,0)"); c.fillStyle = gl; c.beginPath(); c.arc(lx, ly, 0.5, 0, TAU); c.fill();
    c.fillStyle = "#fff8b0"; c.beginPath(); c.arc(lx, ly, 0.12, 0, TAU); c.fill();
  }
  if (o.crown || s.crown) drawCrown(c, ax * 0.12, -ay * 1.02, o.crown ? 0.55 : 0.68, t);
}
function drawTurtle(c, s, t, o) {
  const fl = Math.sin(t * (o.wf || 5)) * 0.4;
  c.lineJoin = "round"; c.lineCap = "round"; c.lineWidth = 0.075; c.strokeStyle = s.line;
  const limb = (x, y, rot, rx, ry) => { c.save(); c.translate(x, y); c.rotate(rot); c.beginPath(); c.ellipse(rx * 0.7, 0, rx, ry, 0, 0, TAU); c.fillStyle = s.body; c.fill(); c.stroke(); c.restore(); };
  limb(-0.55, 0.32, 2.4 - fl * 0.5, 0.3, 0.14);
  c.beginPath(); c.moveTo(-0.85, 0.12); c.lineTo(-1.12, 0.26); c.lineTo(-0.85, 0.3); c.fillStyle = s.body; c.fill(); c.stroke();
  c.beginPath(); c.ellipse(1.0, -0.06, 0.4, 0.34, 0, 0, TAU); c.fillStyle = s.body; c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-1.0, 0.22); c.bezierCurveTo(-0.98, -1.0, 0.88, -1.0, 0.9, 0.22); c.closePath();
  c.fillStyle = s.shell; c.fill();
  c.save(); c.clip(); c.fillStyle = s.plate;
  for (const [px, py, pr] of [[-0.48, -0.25, 0.2], [0.0, -0.45, 0.22], [0.45, -0.25, 0.2], [-0.02, -0.02, 0.2], [-0.66, 0.1, 0.15], [0.6, 0.1, 0.15]]) { c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill(); }
  c.fillStyle = "rgba(255,255,255,0.22)"; c.beginPath(); c.ellipse(-0.1, -0.55, 0.5, 0.16, -0.1, 0, TAU); c.fill();
  c.restore();
  c.stroke();
  if (o.shine) { c.strokeStyle = `rgba(255,220,90,${0.55 + 0.4 * Math.sin(t * 5)})`; c.lineWidth = 0.12; c.beginPath(); c.moveTo(-1.0, 0.22); c.bezierCurveTo(-0.98, -1.0, 0.88, -1.0, 0.9, 0.22); c.stroke(); c.strokeStyle = s.line; c.lineWidth = 0.075; }
  c.beginPath(); c.moveTo(-1.02, 0.25); c.lineTo(0.92, 0.25); c.lineWidth = 0.15; c.strokeStyle = s.rim; c.stroke(); c.lineWidth = 0.075; c.strokeStyle = s.line;
  limb(0.32, 0.32, 0.95 + fl, 0.44, 0.16);
  c.fillStyle = "rgba(255,110,140,0.42)"; c.beginPath(); c.ellipse(1.06, 0.1, 0.1, 0.06, 0, 0, TAU); c.fill();
  drawEye(c, 1.08, -0.15, 0.15, o, s.line, t);
  drawMouth(c, s, 1.3, 0.06, Object.assign({}, o, { mouth: (o.mouth || 0) * 0.7 }));
}
function drawEel(c, s, t, o) {
  const N = 12, ax = s.ax, ay = s.ay, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N, x = ax * 0.78 - k * ax * 1.78, y = Math.sin(t * 3.5 - k * 5) * 0.32 * k;
    const w = ay * (k < 0.2 ? 0.92 : Math.max(0.12, 1 - (k - 0.2) * 1.05));
    top.push([x, y - w]); bot.push([x, y + w]);
  }
  c.lineJoin = "round"; c.lineCap = "round"; c.lineWidth = 0.075; c.strokeStyle = s.line;
  c.beginPath(); top.forEach(([x, y], i) => (i ? c.lineTo(x, y - 0.2) : c.moveTo(x, y - 0.1))); for (let i = N; i >= 0; i--) c.lineTo(top[i][0], top[i][1] + 0.05); c.closePath(); c.fillStyle = s.fin; c.fill(); c.stroke();
  const outline = () => { c.beginPath(); top.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); for (let i = N; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]); c.closePath(); };
  outline(); c.fillStyle = s.body; c.fill();
  c.save(); outline(); c.clip(); c.fillStyle = s.belly; c.beginPath(); bot.forEach(([x, y], i) => (i ? c.lineTo(x, y - ay * 0.35) : c.moveTo(x, y - ay * 0.35))); for (let i = N; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1] + 0.2); c.closePath(); c.fill();
  if (s.spots) { c.fillStyle = s.spots; for (let i = 2; i < N; i += 2) { c.beginPath(); c.arc(top[i][0], (top[i][1] + bot[i][1]) / 2 - 0.08, 0.08, 0, TAU); c.fill(); } }
  c.restore(); outline(); c.stroke();
  if (s.crest) { c.fillStyle = s.fin; for (let i = 1; i < N - 1; i += 2) { const [x, y] = top[i]; c.beginPath(); c.moveTo(x - 0.1, y + 0.02); c.lineTo(x + 0.02, y - 0.38); c.lineTo(x + 0.12, y + 0.02); c.closePath(); c.fill(); c.stroke(); } }
  const hx0 = ax * 0.8, hr = ay * 1.05;
  c.beginPath(); c.ellipse(hx0, 0, hr * 1.15, hr * 0.92, 0, 0, TAU); c.fillStyle = s.body; c.fill(); c.stroke();
  c.fillStyle = s.belly; c.beginPath(); c.ellipse(hx0 + 0.05, hr * 0.45, hr * 0.85, hr * 0.38, 0, 0, TAU); c.fill();
  const er = o.er || 0.24;
  drawEye(c, hx0 + hr * 0.25, -hr * 0.32, er, o, s.line, t);
  drawMouth(c, s, hx0 + hr * 0.85, hr * 0.3, o);
  if (o.crown) drawCrown(c, hx0 - 0.05, -hr * 1.0, 0.5, t);
}
function drawCreature(c, s, t, o) {
  if (s.kind === "turtle") drawTurtle(c, s, t, o);
  else if (s.eel) drawEel(c, s, t, o);
  else drawFish(c, s, t, o);
}
function starPath(c, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath();
}

// ---------- 注音（直排：每個音節一欄、聲調畫在最後一個符號的右上；跟 js/zhuyin.js 的 renderZ 同一套擺法） ----------
function parseLabel(s) {
  return s.split(" ").filter(Boolean).map(x => { const t = TONE_OF[x[x.length - 1]]; return t ? { sym: [...x.slice(0, -1)], tone: t } : { sym: [...x], tone: 0 }; });
}
function drawTone(g, tone, cx, cy, F) {
  const s = F * 0.21; g.lineWidth = F * 0.11; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath();
  if (tone === 2) { g.moveTo(cx - s * 0.65, cy + s * 0.8); g.lineTo(cx + s * 0.65, cy - s * 0.8); }
  else if (tone === 3) { g.moveTo(cx - s * 0.75, cy - s * 0.6); g.lineTo(cx, cy + s * 0.7); g.lineTo(cx + s * 0.75, cy - s * 0.6); }
  else if (tone === 4) { g.moveTo(cx - s * 0.65, cy - s * 0.8); g.lineTo(cx + s * 0.65, cy + s * 0.8); }
  else { g.arc(cx, cy, F * 0.1, 0, TAU); g.fill(); return; }
  g.stroke();
}
// 一個泡泡的字畫成一張小圖（換字才重畫；每格只是貼上去）
function makeLabel(text, F, dpr) {
  const syls = parseLabel(text), pitch = F * 0.9, toneW = F * 0.46, gap = F * 0.2, top5 = F * 0.3;
  const cols = syls.map(s => ({ s, w: F * 1.02 + (s.tone && s.tone !== 5 ? toneW : 0), h: s.sym.length * pitch + (s.tone === 5 ? top5 : 0) }));
  const w = cols.reduce((a, c) => a + c.w, 0) + gap * Math.max(0, cols.length - 1), h = Math.max(pitch, ...cols.map(c => c.h));
  const pad = F * 0.1, cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil((w + pad * 2) * dpr)); cv.height = Math.max(1, Math.ceil((h + pad * 2) * dpr));
  const g = cv.getContext("2d"); g.scale(dpr, dpr); g.translate(pad, pad);
  g.fillStyle = INK; g.strokeStyle = INK; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `900 ${F}px ${FONT}`;
  let x = 0;
  for (const col of cols) {
    const { s } = col, top = s.tone === 5 ? top5 : 0, cx = x + F * 0.51;
    g.lineWidth = F * 0.055; g.lineJoin = "round";
    s.sym.forEach((ch, i) => { const y = top + pitch * i + pitch * 0.53; g.strokeText(ch, cx, y); g.fillText(ch, cx, y); });   // 描一圈同色的邊：字更粗
    if (s.tone === 5) drawTone(g, 5, cx, F * 0.13, F);
    else if (s.tone) drawTone(g, s.tone, x + F * 1.02 + toneW * 0.42, top + pitch * (s.sym.length - 1) + pitch * 0.2, F);
    x += col.w + gap;
  }
  return { cv, w: w + pad * 2, h: h + pad * 2 };
}

// ---------- 背景（不會動的部分先畫成一張圖；會動的：光線、海草、氣泡每格畫） ----------
function paintBg(z, W, H, U, dpr) {
  const b = BG[z], cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
  const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const R = mulberry32(z * 7919 + 13);
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, b.top); gr.addColorStop(0.55, b.mid); gr.addColorStop(1, b.bot); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const fy = H - 7 * U;
  // 遠處的石頭（冰海是冰山）
  g.fillStyle = z === 5 ? "rgba(255,255,255,0.35)" : "rgba(0,20,40,0.13)";
  for (let i = 0; i < 5; i++) { const x = R() * W, w = (16 + R() * 22) * U, h = (10 + R() * 18) * U; g.beginPath(); g.moveTo(x - w, fy + 2 * U); g.quadraticCurveTo(x - w * 0.4, fy - h * 1.2, x, fy - h); g.quadraticCurveTo(x + w * 0.5, fy - h * 0.8, x + w, fy + 2 * U); g.fill(); }
  if (z === 7) {                                   // 寶藏宮殿：柱子和拱門
    for (let i = 0; i < 5; i++) {
      const x = W * (0.08 + i * 0.21), cw = 7 * U, ch = H * 0.62;
      g.fillStyle = "rgba(255,214,120,0.16)"; g.fillRect(x - cw / 2, fy - ch, cw, ch);
      g.fillStyle = "rgba(255,214,120,0.24)"; g.fillRect(x - cw * 0.7, fy - ch - 2 * U, cw * 1.4, 3 * U); g.fillRect(x - cw * 0.7, fy - 3 * U, cw * 1.4, 3 * U);
      if (i < 4) { g.strokeStyle = "rgba(255,214,120,0.18)"; g.lineWidth = 2.5 * U; g.beginPath(); g.arc(x + W * 0.105, fy - ch + 2 * U, W * 0.105 - cw * 0.3, Math.PI, 0); g.stroke(); }
    }
  }
  if (z === 5) {                                   // 冰海：上面掛著冰棚
    g.fillStyle = "rgba(255,255,255,0.75)"; g.beginPath(); g.moveTo(0, 0);
    for (let x = 0; x <= W + 6 * U; x += 6 * U) { g.lineTo(x, (2 + R() * 3) * U); g.lineTo(x + 3 * U, (4 + R() * 6) * U); }
    g.lineTo(W, 0); g.closePath(); g.fill();
  }
  // 海底
  const floorPath = (y0, amp) => { g.beginPath(); g.moveTo(0, H); g.lineTo(0, y0); for (let x = 0; x < W; x += 6 * U) g.quadraticCurveTo(x + 3 * U, y0 + (R() - 0.5) * amp * U, x + 6 * U, y0 + (R() - 0.5) * amp * 0.6 * U); g.lineTo(W, H); g.closePath(); };
  floorPath(fy, 3); g.fillStyle = b.floor; g.fill();
  floorPath(fy + 3.5 * U, 2); g.fillStyle = b.floor2; g.fill();
  g.fillStyle = "rgba(0,0,0,0.12)"; for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(R() * W, fy + (1 + R() * 6) * U, (0.3 + R() * 0.7) * U, (0.2 + R() * 0.4) * U, 0, 0, TAU); g.fill(); }
  if (z === 0) {                                   // 淺灘：海星、貝殼
    for (let i = 0; i < 4; i++) { const x = W * (0.1 + R() * 0.8), y = fy + (2 + R() * 3) * U; starPath(g, x, y, 2.4 * U, 1.1 * U, 5, R()); g.fillStyle = ["#ff8a5c", "#ff6f9c", "#ffb347"][i % 3]; g.fill(); g.strokeStyle = "rgba(120,40,20,0.4)"; g.lineWidth = 0.3 * U; g.stroke(); }
    for (let i = 0; i < 4; i++) { const x = W * (0.05 + R() * 0.9), y = fy + (2.5 + R() * 3) * U; g.fillStyle = "#fff0e0"; g.beginPath(); g.moveTo(x, y + 1.2 * U); g.arc(x, y + 1.2 * U, 2 * U, Math.PI * 1.15, Math.PI * 1.85); g.closePath(); g.fill(); g.strokeStyle = "rgba(160,110,80,0.5)"; g.lineWidth = 0.25 * U; g.stroke(); }
  }
  if (z === 1) {                                   // 珊瑚礁：分叉珊瑚＋腦珊瑚
    const branch = (x, y, len, a, w, d, col) => { const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); if (d > 0) { branch(x2, y2, len * 0.72, a - 0.5, w * 0.72, d - 1, col); branch(x2, y2, len * 0.72, a + 0.45, w * 0.72, d - 1, col); } };
    const cols = ["#ff7aa8", "#ff9f5a", "#b58cff", "#ffd06b", "#ff6b6b"];
    for (let i = 0; i < 7; i++) branch(W * (0.04 + i * 0.15 + R() * 0.05), fy + 1.5 * U, (5 + R() * 4) * U, -Math.PI / 2 + (R() - 0.5) * 0.4, 2 * U, 3, cols[i % cols.length]);
    for (let i = 0; i < 4; i++) { const x = W * (0.1 + R() * 0.8), y = fy + 1 * U; g.fillStyle = ["#f7a6c2", "#c9a6ff", "#ffc48a"][i % 3]; g.beginPath(); g.ellipse(x, y, 5 * U, 3.4 * U, 0, Math.PI, 0); g.fill(); g.strokeStyle = "rgba(120,40,80,0.35)"; g.lineWidth = 0.4 * U; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x, y, (4 - k * 1.2) * U, (2.6 - k * 0.8) * U, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); } }
  }
  if (z === 3) {                                   // 沉船
    const x = W * 0.68, y = fy + 1 * U, L = Math.min(W * 0.45, 70 * U);
    g.save(); g.translate(x, y); g.rotate(-0.12);
    g.fillStyle = "#6b4a32"; g.beginPath(); g.moveTo(-L / 2, -12 * U); g.lineTo(L / 2, -14 * U); g.quadraticCurveTo(L / 2 - 4 * U, 0, L / 2 - 10 * U, 2 * U); g.lineTo(-L / 2 + 8 * U, 2 * U); g.quadraticCurveTo(-L / 2 - 2 * U, -4 * U, -L / 2, -12 * U); g.fill();
    g.strokeStyle = "rgba(40,25,15,0.55)"; g.lineWidth = 0.5 * U; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(-L / 2 + 3 * U, -12 * U + k * 3.4 * U); g.lineTo(L / 2 - 4 * U, -14 * U + k * 3.6 * U); g.stroke(); }
    g.fillStyle = "#2b1d14"; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(-L / 3 + k * L / 5, -8 * U, 1.6 * U, 0, TAU); g.fill(); }
    g.strokeStyle = "#5a3d28"; g.lineWidth = 1.6 * U; g.beginPath(); g.moveTo(-2 * U, -13 * U); g.lineTo(-8 * U, -42 * U); g.stroke(); g.beginPath(); g.moveTo(-14 * U, -32 * U); g.lineTo(3 * U, -35 * U); g.stroke();
    g.restore();
    for (let k = 0; k < 2; k++) { const bx = W * (0.15 + k * 0.14), by = fy + 1 * U; g.fillStyle = "#7a5530"; g.beginPath(); g.ellipse(bx, by - 3 * U, 3 * U, 4 * U, 0.2, 0, TAU); g.fill(); g.strokeStyle = "#3d2a17"; g.lineWidth = 0.5 * U; g.stroke(); }
  }
  if (z === 4) {                                   // 發光深海：會發光的海葵
    for (let i = 0; i < 7; i++) { const x = W * (0.06 + R() * 0.88), y = fy + 1 * U, col = ["rgba(90,255,220,", "rgba(255,120,240,", "rgba(140,170,255,"][i % 3]; const gl = g.createRadialGradient(x, y - 3 * U, 0, x, y - 3 * U, 9 * U); gl.addColorStop(0, col + "0.45)"); gl.addColorStop(1, col + "0)"); g.fillStyle = gl; g.fillRect(x - 9 * U, y - 12 * U, 18 * U, 18 * U); g.fillStyle = col + "0.9)"; g.beginPath(); g.ellipse(x, y - 2 * U, 2.2 * U, 2.8 * U, 0, 0, TAU); g.fill(); }
  }
  if (z === 6) {                                   // 火山海溝：噴口＋熔岩裂縫
    for (let i = 0; i < 3; i++) { const x = W * (0.18 + i * 0.32 + (R() - 0.5) * 0.08), y = fy + 2 * U; g.fillStyle = "#24110f"; g.beginPath(); g.moveTo(x - 10 * U, y); g.lineTo(x - 2.5 * U, y - 13 * U); g.lineTo(x + 2.5 * U, y - 13 * U); g.lineTo(x + 10 * U, y); g.closePath(); g.fill(); const gl = g.createRadialGradient(x, y - 13 * U, 0, x, y - 13 * U, 10 * U); gl.addColorStop(0, "rgba(255,140,40,0.85)"); gl.addColorStop(1, "rgba(255,80,20,0)"); g.fillStyle = gl; g.fillRect(x - 10 * U, y - 23 * U, 20 * U, 20 * U); }
    g.strokeStyle = "rgba(255,110,40,0.7)"; g.lineWidth = 0.6 * U; for (let i = 0; i < 6; i++) { let x = R() * W, y = fy + (2 + R() * 4) * U; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() * 5 + 1) * U; y += (R() - 0.5) * 2 * U; g.lineTo(x, y); } g.stroke(); }
  }
  if (z === 7) {                                   // 寶藏：金幣堆＋寶石
    for (let i = 0; i < 5; i++) { const x = W * (0.08 + R() * 0.84), y = fy + 2 * U; g.fillStyle = "#f2c230"; g.beginPath(); g.ellipse(x, y, 9 * U, 4.5 * U, 0, Math.PI, 0); g.fill(); for (let k = 0; k < 7; k++) { g.fillStyle = k % 2 ? "#ffe07a" : "#e5ac1f"; g.beginPath(); g.ellipse(x + (R() - 0.5) * 14 * U, y - R() * 3.5 * U, 1.4 * U, 0.8 * U, 0, 0, TAU); g.fill(); } }
    for (let i = 0; i < 6; i++) { const x = R() * W, y = fy + (2 + R() * 4) * U, col = ["#ff4f8b", "#4fc3ff", "#7cff8a"][i % 3]; g.fillStyle = col; g.beginPath(); g.moveTo(x, y - 1.6 * U); g.lineTo(x + 1.2 * U, y); g.lineTo(x, y + 1.2 * U); g.lineTo(x - 1.2 * U, y); g.closePath(); g.fill(); }
  }
  return cv;
}
// 光線：上面斜斜照下來的幾道光（白色，畫的時候再調透明度）
function paintRays(W, H, U) {
  const k = 0.5, cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(W * k)); cv.height = Math.max(1, Math.round(H * k));
  const g = cv.getContext("2d"); g.scale(k, k);
  for (let i = 0; i < 5; i++) {
    const x = W * (0.06 + i * 0.22), gr = g.createLinearGradient(0, 0, 0, H * 0.8); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (3 + i % 2 * 2) * U, 0); g.lineTo(x + (24 + i * 3) * U, H * 0.8); g.lineTo(x + (8 + i * 2) * U, H * 0.8); g.closePath(); g.fill();
  }
  return cv;
}

export function createGrowGame(root, api) {
  let run = 0;                  // 每次 start/stop 換號：舊的 later／語音回呼看到號碼不同就作廢
  let st = null;                // 這一局
  let D = null;                 // DOM
  let cv = null, g = null, W = 0, H = 0, U = 1, dpr = 1, playTop = 0;
  let raf = 0, lastT = 0, sizeT = 0, uid = 0, rnd = Math.random;
  let bgNow = null, bgPrev = null, rays = null;
  let weeds = [], amb = [];
  const labels = new Map();     // 泡泡字的小圖（換尺寸就清掉）
  const talked = {};            // 這個模組只說一次的提醒（被咬、皇冠魚）
  const offs = [];              // 自己掛的事件（stop 時全部拆）
  const pool = [];              // 粒子回收

  // ---------- 小工具 ----------
  const SPEED = () => { const v = +api.speed; return v > 0 ? v : 1; };
  const mk = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
  const later = (fn, ms) => { const my = run; try { api.later(() => { if (my === run && st) fn(); }, ms / SPEED()); } catch (e) { console.warn("[grow] later", e); } };
  const play = n => { try { api.play(n); } catch (e) { /* 音效失敗不影響遊戲 */ } };
  const isPaused = () => { try { return !!api.paused(); } catch (e) { return false; } };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const spIdx = () => Math.min(st.z, ZONES_N - 1);       // 你現在是哪一種（第 2 圈起一直是魚王）
  const bgIdx = () => st.z % ZONES_N;
  const bump = (e, cls) => { if (!e) return; e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); };

  // ---------- 語音 ----------
  function sayTask(isNew) {
    if (!st || !st.q || st.over || st.ended) return;       // 回家演出／結算時，舊計時器晚到也不要再念題目（里維 11-01）
    st.lastSay = st.t;
    if (isNew) st.noPredUntil = Math.max(st.noPredUntil, st.t + 1.6 + QUIET);   // 新任務念完 3 秒內不放大魚
    try { api.stopVoice && api.stopVoice(); } catch (e) { /* 沒有也沒關係 */ }
    try { api.say(st.q.say, st.q.alt); } catch (e) { console.warn("[grow] say", e); }
    bump(D && D.task, "grow-speak");
  }
  function talk(line, then) {
    const my = run; let done = false;
    const fin = () => { if (done || my !== run || !st) return; done = true; if (then) then(); };
    try { api.talk(line, fin); } catch (e) { console.warn("[grow] talk", e); fin(); }
    if (then) later(fin, 1200 + line.length * 230);      // onEnd 可能不會來：保險
  }

  // ---------- 畫面（DOM） ----------
  function build() {
    root.classList.add("grow-root");
    const wrap = mk("div", "grow-wrap", root);
    cv = mk("canvas", "grow-cv", wrap); cv.setAttribute("aria-hidden", "true"); g = cv.getContext("2d");
    const task = mk("button", "grow-task", wrap); task.type = "button"; task.setAttribute("aria-label", "再聽一次");
    mk("span", "grow-task-ic", task, "🔊");
    const tx = mk("span", "grow-task-tx", task); mk("span", "", tx, "吃"); mk("b", "grow-task-n", tx, String(NEED)); mk("span", "", tx, "隻");
    const pic = mk("span", "grow-task-pic", task);
    const dots = mk("span", "grow-dots", task); for (let i = 0; i < NEED; i++) mk("i", "grow-dot", dots);
    const side = mk("div", "grow-side", wrap);
    const hearts = mk("div", "grow-hearts", side); for (let i = 0; i < 3; i++) mk("span", "grow-heart", hearts, "❤️");
    const coins = mk("div", "grow-coins", side); mk("span", "grow-coin-ic", coins, "🪙"); const coinN = mk("span", "grow-coin-n", coins, "0");
    const jar = mk("div", "grow-jar", side); const jarGlass = mk("div", "grow-jar-glass", jar); mk("div", "grow-jar-lid", jar); const jarN = mk("span", "grow-jar-n", jar, "0");
    const streak = mk("div", "grow-streak grow-off", side); mk("span", "", streak, "🔥"); const streakN = mk("span", "grow-streak-n", streak, "0");
    const pop = mk("div", "grow-cheer grow-off", wrap);
    const banner = mk("div", "grow-banner grow-off", wrap); banner.setAttribute("role", "status");
    const bnIc = mk("div", "grow-banner-ic", banner), bnTx = mk("div", "grow-banner-tx", banner), bnSub = mk("div", "grow-banner-sub", banner);
    const rest = mk("button", "grow-rest grow-off", wrap); rest.type = "button"; mk("span", "grow-rest-ic", rest, "😴"); mk("span", "grow-rest-tx", rest, "休息一下"); mk("i", "grow-rest-ring", rest);
    const map = mk("div", "grow-map grow-off", wrap);
    const finger = mk("div", "grow-finger grow-off", wrap, "👆");
    D = { wrap, task, pic, dots, hearts, coins, coinN, jar, jarGlass, jarN, streak, streakN, pop, banner, bnIc, bnTx, bnSub, rest, map, finger };

    on(task, "pointerdown", e => { e.stopPropagation(); if (st && st.q && !st.over && !isPaused()) { play("tap"); sayTask(); } });
    on(task, "click", e => { if (e.detail === 0 && st && st.q && !st.over && !isPaused()) sayTask(); });   // 鍵盤 Enter
    on(rest, "pointerdown", e => { e.stopPropagation(); if (st && st.restOn && !isPaused()) { play("select"); wrapUp("rest"); } });
    on(rest, "click", e => { if (e.detail === 0 && st && st.restOn && !isPaused()) wrapUp("rest"); });
    const pt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    on(cv, "pointerdown", e => {
      if (!st || st.over || st.evolving || isPaused()) return;
      if (st.down && e.pointerId !== st.ptr) return;       // 第二根手指（手掌碰到）不搶方向：第一根抬起前都聽它的
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) { /* 舊瀏覽器 */ }
      endDemo(); st.down = true; st.ptr = e.pointerId; aimAt(pt(e));
    });
    on(cv, "pointermove", e => { if (!st || !st.down || e.pointerId !== st.ptr || isPaused()) return; aimAt(pt(e)); });
    const up = e => { if (st && e.pointerId === st.ptr) st.down = false; };
    on(cv, "pointerup", up); on(cv, "pointercancel", up); on(cv, "lostpointercapture", up);   // iOS 偶爾漏掉 pointerup
    const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    on(window, "keydown", e => { if (!st || st.ended || !KEYS[e.key]) return; st.keys[e.key] = KEYS[e.key]; st.inputT = st.t; e.preventDefault(); endDemo(); });
    on(window, "keyup", e => { if (st) delete st.keys[e.key]; });
  }

  function relayout() {
    if (!D || !cv) return;
    const r = root.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;              // 藏起來的時候不量
    const nw = r.width, nh = r.height, nd = Math.min(2, window.devicePixelRatio || 1);
    if (st && W > 0) {                                      // 轉向：位置照比例搬
      const kx = nw / W, ky = nh / H;
      const mv = o => { o.x *= kx; o.y *= ky; if (o.by != null) o.by *= ky; };
      [st.player, ...st.prey, ...st.preds, ...st.items, ...st.parts].forEach(mv);
      st.warns.forEach(w => { w.y *= ky; });
      if (st.target) { st.target.x *= kx; st.target.y *= ky; }
    }
    W = nw; H = nh; dpr = nd; U = Math.min(W, H) / 100;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    labels.clear();
    playTop = hudBottom(r) || 20 * U;
    if (st) initScene(false);
  }

  // 上面那排（任務牌、右上的金幣＋星星罐）最低到哪：小魚的泡泡都在這下面游（不會被擋住）
  function hudBottom(r) {
    let b = 0; for (const e of [D.task, D.jar]) { const q = e.getBoundingClientRect(); if (q.height > 0) b = Math.max(b, q.bottom - r.top); }
    return b ? b + 1.5 * U : 0;
  }

  // ---------- 場景（每區換） ----------
  function initScene(fade) {
    const z = bgIdx(), b = BG[z], R = mulberry32(z * 131 + 7);
    if (fade && bgNow) { bgPrev = bgNow; st.bgFade = 0; } else { bgPrev = null; st.bgFade = 1; }
    bgNow = paintBg(z, W, H, U, dpr); rays = paintRays(W, H, U);
    weeds = [];
    for (let i = 0; i < b.weedN; i++) weeds.push({ x: W * ((i + 0.2 + R() * 0.6) / b.weedN), h: b.weedH[0] + R() * (b.weedH[1] - b.weedH[0]), w: b.kelp ? 2.2 : 1.4, col: mixHex(b.weed, i % 2 ? "#ffffff" : "#000000", 0.12 + R() * 0.12), ph: R() * 9 });
    amb = [];
    const n = b.amb === "plank" ? 46 : b.amb === "snow" ? 40 : b.amb === "ember" ? 26 : b.amb === "spark" ? 26 : 0;
    for (let i = 0; i < n; i++) amb.push({ k: b.amb, x: R() * W, y: R() * H, s: 0.3 + R() * 0.7, ph: R() * 9, v: 0.5 + R() });
    for (let i = 0; i < 16; i++) amb.push({ k: "bub", x: R() * W, y: R() * H, s: 0.35 + R() * 0.9, ph: R() * 9, v: 0.6 + R() * 0.8 });
  }

  // ---------- 這一局 ----------
  function newState(z0, intro) {
    const z = Math.max(0, z0 | 0), challenge = z >= ZONES_N;
    const asker = createAsker({ rnd, opts: (tier, zz) => (zz >= 3 ? 4 : 3) });
    asker.setZone(z);
    return {
      z, z0: z, challenge, asker, intro: !!intro,
      t: 0, ms: 0, zoneT: 0, taskT: 0, bgFade: 1,
      hearts: challenge ? 3 : 0, coins: 0, earned: 0, right: 0, wrong: 0, words: [], zonesCleared: 0, bigEaten: 0, bites: 0, stars: 0, streak: 0,
      tasksDone: 0, q: null, count: 0, wrongInTask: false, sinceOk: 0, hint: false, between: false, lastSay: -99, F: 7.2,
      player: { x: 0, y: 0, vx: 0, vy: 0, rU: 4.6, rTU: 4.6, face: 1, faceS: 1, tilt: 0, inv: 0, dizzy: 0, chomp: 0, yuck: 0, gold: 0, puff: 0, shine: 0, spin: 0, ph: rnd() * 9, trail: 0 },
      target: null, down: false, ptr: null, keys: {}, inputT: -99,
      prey: [], preds: [], warns: [], items: [], parts: [],
      preyCd: 0, pT: 0, pGap: 4, cT: 0, noPredUntil: 0, introHold: !!intro, chestDone: false, abilUsed: false,
      evolving: null, over: null, ended: false, shake: 0, flash: 0, redL: 0, redR: 0, demo: null, restOn: false,
    };
  }
  const baseU = () => 4.6 * (1 + 0.035 * spIdx());
  const growTU = () => baseU() * (1 + 0.055 * (st.tasksDone * NEED + st.count));
  function diff() {
    const b = DIFF[bgIdx()], loop = st.z >= ZONES_N ? 1 : 0, ease = st.asker.ease();
    return { pMax: Math.max(1, b.pMax + loop - (ease > 0 ? 1 : 0)), gap: b.gap * (1 + 0.4 * ease) * (loop ? 0.85 : 1), pv: b.pv * (1 - 0.15 * ease) * (loop ? 1.15 : 1),
      home: (b.home + (loop ? 0.12 : 0)) * (ease > 0 ? 0.5 : 1), preyN: b.preyN, fv: b.fv * (loop ? 1.1 : 1) };
  }

  // ---------- 小魚 ----------
  function preyN() { const q = st.q, n = diff().preyN; return !q ? n : q.kind === "word" ? Math.min(n, 6) : q.kind === "sym" ? Math.max(n, 7) : Math.min(n, 7); }
  const answerN = n => Math.max(2, Math.round(n * 0.3));     // 答案魚約 3 成、至少 2 隻
  function fontU(q) { return !q || q.kind === "sym" ? 8 : q.kind === "word" ? 4.6 : 5.4; }
  function dealLabels(n) {
    const q = st.q, wrong = q.options.filter(o => o !== q.answer), a = answerN(n), out = [];
    for (let i = 0; i < n; i++) out.push(i < a ? q.answer : wrong[(i - a) % wrong.length]);
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function pickLabel() {
    const q = st.q, live = st.prey.filter(f => !f.leave), n = preyN();
    const cnt = {}; for (const f of live) { const L = f.next || f.label; cnt[L] = (cnt[L] || 0) + 1; }
    if ((cnt[q.answer] || 0) < answerN(n)) return q.answer;
    const wrong = q.options.filter(o => o !== q.answer); wrong.sort((a, b) => (cnt[a] || 0) - (cnt[b] || 0));
    return wrong[0] || q.answer;
  }
  function labelOf(text, F) {
    const k = text + "|" + F.toFixed(1) + "|" + dpr;
    let s = labels.get(k); if (!s) { if (labels.size > 160) labels.clear(); s = makeLabel(text, F, dpr); labels.set(k, s); }
    return s;
  }
  // 泡泡的位置與大小（泡泡在魚的正上方、字永遠正立）
  function bub(f) {
    const spr = labelOf(f.label, f.F * U);
    let rx = spr.w * 0.6 + 0.9 * U, ry = spr.h * 0.6 + 0.9 * U;
    if (Math.abs(rx - ry) < 0.2 * Math.max(rx, ry)) rx = ry = Math.max(rx, ry);
    const r = f.rU * U;
    return { spr, rx, ry, bx: f.x, by: f.y - r * 0.85 - ry + Math.sin(st.t * 2.2 + f.ph) * 0.4 * U };
  }
  function preyBounds(f, b) {
    const r = f.rU * U;
    return { x0: b.rx + 1 * U, x1: W - b.rx - 1 * U, y0: playTop + b.ry * 2 + r * 0.9 + 0.5 * U, y1: Math.max(playTop + b.ry * 2 + r + 1 * U, H - r - 2.5 * U) };
  }
  function addPrey(label, entering, x, y, dir) {
    const f = { id: ++uid, label, ok: label === st.q.answer, F: st.F, rU: 2.2 + rnd() * 0.4, dir: dir || (rnd() < 0.5 ? -1 : 1), faceS: 1, vU: 0.8 + rnd() * 0.4,
      x: 0, y: 0, by: 0, vyU: (rnd() - 0.5) * 2, ph: rnd() * 9, spit: 0, flash: 0, sx: 0, sy: 0, re: 0, next: null, col: pick(PREY_COL), entering: !!entering, leave: false, turnCd: 0 };
    const b = bub(f), bd = preyBounds(f, b);
    if (x != null) { f.x = x; f.by = y; }
    else {
      let best = null, bestD = -1;                          // 挑一個離別的魚最遠的高度（不要疊在一起）
      for (let k = 0; k < 6; k++) {
        const yy = bd.y0 + rnd() * Math.max(1, bd.y1 - bd.y0), xx = entering ? (f.dir > 0 ? -b.rx - 2 * U : W + b.rx + 2 * U) : bd.x0 + rnd() * Math.max(1, bd.x1 - bd.x0);
        let dmin = 1e9; for (const o of st.prey) dmin = Math.min(dmin, Math.hypot(o.x - xx, (o.by - yy) * 1.4)); dmin = Math.min(dmin, Math.hypot(st.player.x - xx, st.player.y - yy) * (entering ? 1 : 0.6));
        if (dmin > bestD) { bestD = dmin; best = [xx, yy]; }
      }
      f.x = best[0]; f.by = best[1];
    }
    f.y = f.by; f.faceS = f.dir;
    st.prey.push(f); return f;
  }
  function killPrey(f) { const i = st.prey.indexOf(f); if (i >= 0) st.prey.splice(i, 1); st.preyCd = Math.max(st.preyCd, 0.5); }
  function relabelAll() {
    const n = preyN(), L = dealLabels(n), live = st.prey.filter(f => !f.leave), p = st.player;
    // 新任務：答案放在離你比較遠的魚身上（要游過去找，不會一換題就在嘴巴前面）
    const near = live.slice(0, n).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const ans = L.filter(l => l === st.q.answer), rest = L.filter(l => l !== st.q.answer);
    let order = L;
    if (near.length >= ans.length + 2) {                    // 答案隨機放在「比較遠的那 6 成」裡（不會永遠是最遠那兩隻：小孩不能靠「找最遠的」猜答案）
      const far = []; for (let i = Math.floor(near.length * 0.4); i < near.length; i++) far.push(i);
      for (let i = far.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [far[i], far[j]] = [far[j], far[i]]; }
      const slots = new Set(far.slice(0, ans.length)); order = []; let w = 0;
      for (let i = 0; i < near.length; i++) order.push(slots.has(i) ? st.q.answer : rest[w++]);
      while (w < rest.length) order.push(rest[w++]);
    }
    near.forEach((f, i) => { f.next = order[i]; f.re = 0.5 + i * 0.07; });
    live.slice(n).forEach(f => { f.leave = true; });
    for (let i = near.length; i < n; i++) { const f = addPrey(order[i] || L[i], true); f.F = st.F; }
  }
  function updPrey(dt) {
    const df = diff(), slow = st.q && st.q.tier >= 4 && !st.over ? 0.5 : 1, p = st.player, pr = p.rU * U;
    st.preyCd -= dt;
    if (st.q && !st.between && !st.over && st.preyCd <= 0 && st.prey.filter(f => !f.leave).length < preyN()) {
      st.preyCd = 0.45; const L = pickLabel(); addPrey(L, true, null, null, L === st.q.answer ? (p.x < W / 2 ? -1 : 1) : 0);   // 補上來的答案魚從離你遠的那一邊游進來（要游過去找）
    }
    // 魚來來去去：每 6–10 秒有一隻錯的魚游走、再游進來一隻新的（游進來的不一定是答案：小孩不能靠「找剛游進來的」猜）
    st.trafT = (st.trafT || 0) + dt;
    if (st.q && !st.between && !st.over && st.trafT > (st.trafGap || 8)) {
      st.trafT = 0; st.trafGap = 6 + rnd() * 4;
      const cand = st.prey.filter(f => !f.ok && !f.leave && !f.entering && f.re <= 0 && f.id !== st.aimId && Math.hypot(f.x - p.x, f.y - p.y) > 25 * U);
      if (cand.length) { const f = pick(cand); f.leave = true; f.dir = f.x < W / 2 ? -1 : 1; f.vU = 2.5; }
    }
    const pSlow = Math.hypot(p.vx, p.vy) < 3 * U;
    for (let i = st.prey.length - 1; i >= 0; i--) {
      const f = st.prey[i];
      f.spit = Math.max(0, f.spit - dt); f.flash = Math.max(0, f.flash - dt); f.turnCd -= dt;
      if (f.re > 0) {                                        // 換字：先縮小、到一半換字、再長回來
        f.re -= dt;
        if (f.re <= 0.25 && f.next && st.q) { f.label = f.next; f.next = null; f.ok = f.label === st.q.answer; f.F = st.F; }
        if (f.re <= 0) f.re = 0;
      }
      const b = bub(f), bd = preyBounds(f, b);
      f.x += (f.dir * df.fv * slow * f.vU * U + f.sx) * dt;
      f.by += (f.vyU * U + f.sy) * dt;
      f.sx *= Math.max(0, 1 - 3 * dt); f.sy *= Math.max(0, 1 - 3 * dt);
      if (rnd() < dt * 0.3) f.vyU = (rnd() - 0.5) * 3;
      if (f.leave) { if (f.x < -b.rx * 2 - 4 * U || f.x > W + b.rx * 2 + 4 * U) st.prey.splice(i, 1); continue; }
      if (f.entering) {                                      // 從邊邊游進來的：一定往畫面裡面游（不會被閃開／轉頭的規則轉回去，游到畫面外迷路）
        f.dir = f.x < W / 2 ? 1 : -1;
        if (f.x > bd.x0 && f.x < bd.x1) f.entering = false;
        else if (f.x < -b.rx * 3 - 10 * U || f.x > W + b.rx * 3 + 10 * U) { f.x = f.x < 0 ? -b.rx - 2 * U : W + b.rx + 2 * U; f.sx = 0; }   // 保險：被推太遠就拉回邊邊
      } else {
        if (f.x < bd.x0 && f.dir < 0) f.dir = 1; else if (f.x > bd.x1 && f.dir > 0) f.dir = -1;
        else if (f.turnCd <= 0 && rnd() < dt * 0.05) { f.dir = -f.dir; f.turnCd = 3; }
        f.x = clamp(f.x, bd.x0 - 3 * U, bd.x1 + 3 * U);
      }
      if (f.by < bd.y0) { f.by = bd.y0; f.vyU = Math.abs(f.vyU); } else if (f.by > bd.y1) { f.by = bd.y1; f.vyU = -Math.abs(f.vyU); }
      f.y = f.by + Math.sin(st.t * 1.4 + f.ph) * 1.0 * U;
      // 泡泡疊在一起時上下推開一點（字才不會被蓋住）
      for (let j = 0; j < i; j++) {
        const o = st.prey[j]; if (o.leave) continue;
        const ob = bub(o), ox = Math.abs(ob.bx - b.bx) - (ob.rx + b.rx), oy = Math.abs(ob.by - b.by) - (ob.ry + b.ry);
        if (ox < 0 && oy < 0) { const k = (b.by >= ob.by ? 1 : -1) * 14 * U * dt; f.by += k; o.by -= k; }
      }
      // 你停著不動時，小魚碰到你會自己轉頭游開（不算吃）
      const dp = Math.hypot(f.x - p.x, f.y - p.y);
      if (pSlow && !f.entering && f.turnCd <= 0 && dp < pr + f.rU * U * 1.5) { f.dir = f.x > p.x ? 1 : -1; f.turnCd = 1.5; }
      // 你衝過來時，小魚會「咻」地閃開一小段（追一下才吃得到；每隻 3 秒最多一次，第 4–6 級的慢魚閃得也慢）
      f.dartCd = (f.dartCd || 0) - dt;
      if (!pSlow && !f.entering && f.dartCd <= 0 && f.re <= 0 && dp < pr + 12 * U && (p.vx * (f.x - p.x) + p.vy * (f.y - p.y)) > 0) {
        const k = 16 * U * slow / (dp || 1); f.sx += (f.x - p.x) * k; f.sy += (f.y - p.y) * k * 0.6; f.dir = f.x > p.x ? 1 : -1; f.dartCd = 3;
      }
      f.faceS += (f.dir - f.faceS) * Math.min(1, 8 * dt);
    }
  }

  // ---------- 大魚 ----------
  const edibleSpec = new Map();
  function specOf(pr) {
    if (!pr.edible) return pr.sp;
    let s = edibleSpec.get(pr.kind);
    if (!s) { const o = pr.sp; s = Object.assign({}, o, { body: mixHex(o.body, "#ffd84a", 0.62), belly: mixHex(o.belly, "#fff6c8", 0.5), fin: mixHex(o.fin, "#ffb02e", 0.55), line: mixHex(o.line, "#8a5a00", 0.5), spots: o.spots && mixHex(o.spots, "#e09a18", 0.5), stripes: o.stripes && "#fff7d6", bars: o.bars && mixHex(o.bars, "#d08a10", 0.6) }); edibleSpec.set(pr.kind, s); }
    return s;
  }
  function addPred(o) {
    const kind = bgIdx(), sp = PREDS[kind], df = diff(), big = !!o.big, side = o.side || (rnd() < 0.5 ? -1 : 1);
    const rU = baseU() * (big ? 1.75 + rnd() * 0.35 : 1.22), r = rU * U, len = sp.ax * r;
    const pr = { id: ++uid, kind, sp, big, rU, edible: !!o.edible, x: side < 0 ? -len - 2 * U : W + len + 2 * U, y: o.y != null ? o.y : clamp(playTop + r + rnd() * (H - playTop - 2 * r), playTop + r, H - r),
      ang: side < 0 ? 0 : Math.PI, base: side < 0 ? 0 : Math.PI, vU: o.edible ? 8 : df.pv * (0.9 + rnd() * 0.2), t: 0, ph: rnd() * 9, fed: false, flee: false, scared: false, entered: false, out: false, life: 16, mouth: 0 };
    if (o.x != null) { pr.x = o.x; pr.entered = true; }
    st.preds.push(pr); return pr;
  }
  function predMouth(pr) { const r = pr.rU * U, m = pr.sp.mx * r * 0.95; return { x: pr.x + Math.cos(pr.ang) * m, y: pr.y + Math.sin(pr.ang) * m, r: pr.sp.ay * r * 0.48 }; }
  function updPreds(dt) {
    const df = diff(), p = st.player;
    for (let i = st.preds.length - 1; i >= 0; i--) {
      const pr = st.preds[i], r = pr.rU * U, len = pr.sp.ax * r;
      pr.t += dt;
      const dx = p.x - pr.x, dy = p.y - pr.y, d = Math.hypot(dx, dy);
      let want = pr.ang, rate = 0, v = pr.vU * U;
      if (pr.fed || pr.flee || pr.scared || (pr.edible && pr.life <= 0)) { want = pr.x < W / 2 ? Math.PI : 0; rate = 2.5; v *= pr.scared ? 2.6 : 1.8; pr.out = true; }
      else if (pr.edible) {                                  // 金色皇冠魚：會逃、撞到邊邊就轉頭（留在畫面裡給你追）
        pr.life -= dt;
        if (d < 32 * U) { want = Math.atan2(-dy, -dx); rate = 2.6; v = MAXV * 0.55 * U; } else { want = pr.base + Math.sin(pr.t * 0.7 + pr.ph) * 0.5; rate = 0.6; v = 8 * U; }
        if (pr.entered) {
          if (pr.x < len && Math.cos(pr.ang) < 0) { pr.ang = Math.PI - pr.ang; pr.base = 0; want = pr.ang; }
          else if (pr.x > W - len && Math.cos(pr.ang) > 0) { pr.ang = Math.PI - pr.ang; pr.base = Math.PI; want = pr.ang; }
          if (pr.y < playTop + r && Math.sin(pr.ang) < 0) { pr.ang = -pr.ang; want = pr.ang; } else if (pr.y > H - r && Math.sin(pr.ang) > 0) { pr.ang = -pr.ang; want = pr.ang; }
        }
      } else if (pr.entered && df.home > 0 && !st.over) {    // 第 4 區起：慢慢轉向你，但不會整個掉頭
        want = Math.atan2(dy, dx); const dev = angDiff(want, pr.base); if (Math.abs(dev) > 0.8) want = pr.base + Math.sign(dev) * 0.8; rate = df.home;
      }
      pr.ang += clamp(angDiff(want, pr.ang), -rate * dt, rate * dt);
      pr.x += Math.cos(pr.ang) * v * dt; pr.y += Math.sin(pr.ang) * v * dt;
      if (!pr.entered && pr.x > len * 0.3 && pr.x < W - len * 0.3) pr.entered = true;
      const near = !pr.edible && !pr.fed && !pr.out && d < r * 2.6;
      pr.mouth += ((near ? 1 : 0) - pr.mouth) * Math.min(1, 6 * dt);
      const off = pr.x < -len - 8 * U || pr.x > W + len + 8 * U || pr.y < -r * 3 || pr.y > H + r * 3;
      if (off && (pr.entered || pr.out || pr.t > 25)) st.preds.splice(i, 1);
    }
  }
  // 長到第 3 段：畫面上比你小的中型大魚變成金色皇冠魚
  function crownFlip() {
    for (const pr of st.preds) if (!pr.big && !pr.edible && !pr.fed && !pr.out) { pr.edible = true; pr.life = 16; sparkle(pr.x, pr.y, 10); }
    st.cT = 3.5;
  }

  // ---------- 粒子 ----------
  function part(k, x, y, vx, vy, life, s, col, txt) {
    const p = pool.pop() || {};
    p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.s = s; p.col = col; p.txt = txt; p.rot = rnd() * TAU; p.vr = (rnd() - 0.5) * 8;
    st.parts.push(p); return p;
  }
  function sparkle(x, y, n, col) { for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = (10 + rnd() * 25) * U; part("star", x, y, Math.cos(a) * v, Math.sin(a) * v, 0.6 + rnd() * 0.4, (1 + rnd() * 1.2) * U, col || (i % 2 ? "#ffe066" : "#ffffff")); } }
  function coinBurst(x, y, n) { for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2, v = (18 + rnd() * 26) * U; part("coin", x, y, Math.cos(a) * v, Math.sin(a) * v, 1.1 + rnd() * 0.4, 1.4 * U); } }
  function fireworks(x, y) { const col = pick(["#ff5d8f", "#ffd23f", "#5ce1ff", "#9bff6a", "#c08bff", "#ff9f43"]); for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, v = (20 + rnd() * 10) * U; part("fw", x, y, Math.cos(a) * v, Math.sin(a) * v, 1.1 + rnd() * 0.3, 0.9 * U, col); } }
  function textPop(x, y, txt, col) { part("txt", x, y, 0, -12 * U, 1.0, 4.2 * U, col || "#fff", txt); }
  function updParts(dt) {
    const p = st.player, pr = p.rU * U;
    for (let i = st.parts.length - 1; i >= 0; i--) {
      const q = st.parts[i];
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.k === "coin" || q.k === "conf" || q.k === "fw") q.vy += (q.k === "fw" ? 12 : 60) * U * dt;
      if (q.k === "star" || q.k === "fw") { q.vx *= Math.max(0, 1 - 2.5 * dt); q.vy *= Math.max(0, 1 - 2.5 * dt); }
      if (q.k === "bub") { q.vx = Math.sin(q.life * 6 + q.rot) * 3 * U; }
      if (q.k === "lost") {                                  // 被咬掉的金幣：慢慢漂走，3 秒內碰到就撿回來
        q.vx *= Math.max(0, 1 - 1.5 * dt); q.vy = q.vy * Math.max(0, 1 - 1.5 * dt) - 2 * U * dt;
        if (q.max - q.life > 0.5 && Math.hypot(q.x - p.x, q.y - p.y) < pr + 2 * U && !st.over) { st.coins++; renderCoins(true); if (!st.coinSnd || st.t - st.coinSnd > 0.12) { st.coinSnd = st.t; play("coin"); } q.life = 0; }
      }
      if (q.life <= 0) { st.parts.splice(i, 1); pool.push(q); }
    }
  }

  // ---------- 你的魚 ----------
  function mouthPos() {
    const p = st.player, s = SPECIES[spIdx()], m = s.mx * p.rU * U * (p.puff > 0 ? 1.3 : 1);
    return { x: p.x + p.face * Math.cos(p.tilt) * m, y: p.y + Math.sin(p.tilt) * m };
  }
  function demoFinger() {
    const d = st.demo, T = 2.6, k = (d.t % T) / T, p = st.player;
    if (d.loops == null) { d.sx = p.x; d.sy = p.y; d.loops = 0; }
    const ex = clamp(d.sx + (d.sx < W / 2 ? 28 : -28) * U, 10 * U, W - 10 * U), ey = clamp(d.sy + 6 * U, playTop + 8 * U, H - 10 * U);
    if (k < 0.18) return { x: d.sx, y: d.sy, press: false, show: k > 0.04 };
    if (k < 0.75) { const e = easeOut((k - 0.18) / 0.57); return { x: lerp(d.sx, ex, e), y: lerp(d.sy, ey, e), press: true, show: true }; }
    return { x: ex, y: ey, press: false, show: k < 0.92 };
  }
  function endDemo() { if (st && st.demo) { st.demo = null; st.target = null; if (D) D.finger.classList.add("grow-off"); } }
  function updPlayer(dt) {
    const p = st.player, s = SPECIES[spIdx()], r = p.rU * U;
    p.inv = Math.max(0, p.inv - dt); p.dizzy = Math.max(0, p.dizzy - dt); p.chomp = Math.max(0, p.chomp - dt); p.yuck = Math.max(0, p.yuck - dt);
    p.gold = Math.max(0, p.gold - dt); p.puff = Math.max(0, p.puff - dt); p.shine = Math.max(0, p.shine - dt);
    p.rU += (p.rTU - p.rU) * Math.min(1, 5 * dt);
    if (st.evolving) return;                                 // 進化演出自己搬魚
    const fast = spIdx() >= 4 ? 1.3 : 1;                     // 海豚起游得比較快
    const vmax = MAXV * U * fast * (p.dizzy > 0 ? 0.35 : 1) * (st.over ? 0.45 : 1);
    let tx = null, ty = null, stopOff = 0;
    const keyDir = Object.values(st.keys);
    if (st.over) { if (st.over.kind === "finale") { tx = W / 2; ty = H * 0.36; } else { tx = W / 2; ty = H - 13 * U; } }
    else if (st.demo) { st.demo.t += dt; const f = st.demo.f = demoFinger(); if (f.press) { tx = f.x; ty = f.y; stopOff = s.mx * r + 1.5 * U; } if (st.demo && st.demo.t > 2.6 * 2.2) endDemo(); }
    else if (keyDir.length) { let kx = 0, ky = 0; for (const [a, b] of keyDir) { kx += a; ky += b; } tx = p.x + kx * 30 * U; ty = p.y + ky * 30 * U; st.inputT = st.t; }
    else if (st.target) { tx = st.target.x; ty = st.target.y; stopOff = s.mx * r + 1.5 * U; }   // 魚停在手指後面一點（嘴巴在手指前一點點），手指不會蓋住魚
    let dvx = 0, dvy = 0;
    if (tx != null) {
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1e-6, rem = d - stopOff;
      // 越接近越慢；游過頭（手指底下）就往後退一點，讓手指不會蓋住魚
      if (Math.abs(rem) > 0.4 * U) { const v = vmax * clamp(rem / (12 * U), -0.4, 1); dvx = (dx / d) * v; dvy = (dy / d) * v; }
      else if (!st.down && !st.demo && !keyDir.length && !st.over && Math.hypot(p.vx, p.vy) < 4 * U) st.target = null;    // 點一下的：游到了就停
      if (Math.abs(dx) > 1.2 * U) p.face = Math.sign(dx);
    }
    const k = Math.min(1, 6.5 * dt);                        // 慣性：速度慢慢跟上（不會瞬移、停下來也不會衝過頭太多）
    p.vx += (dvx - p.vx) * k; p.vy += (dvy - p.vy) * k;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const mx = r * 0.7, top = Math.min(playTop * 0.5, 12 * U) + r * 0.6;
    if (p.x < mx) { p.x = mx; p.vx = Math.max(0, p.vx); } else if (p.x > W - mx) { p.x = W - mx; p.vx = Math.min(0, p.vx); }
    if (p.y < top) { p.y = top; p.vy = Math.max(0, p.vy); } else if (p.y > H - r * 0.55) { p.y = H - r * 0.55; p.vy = Math.min(0, p.vy); }
    if (Math.abs(p.vx) > 3 * U && tx == null) p.face = Math.sign(p.vx);
    p.faceS += (p.face - p.faceS) * Math.min(1, 9 * dt);
    const tilt = clamp(Math.atan2(p.vy, Math.abs(p.vx) + 8 * U) * 0.7, -0.5, 0.5); p.tilt += (tilt - p.tilt) * Math.min(1, 6 * dt);
    // 快游時冒小氣泡（海豚起特別多）
    p.trail -= dt; const sp = Math.hypot(p.vx, p.vy);
    if (sp > 18 * U && p.trail <= 0) { p.trail = fast > 1 ? 0.05 : 0.14; part("bub", p.x - p.face * r * 1.0, p.y + (rnd() - 0.5) * r * 0.6, -p.face * 4 * U, -6 * U, 0.8, (0.4 + rnd() * 0.5) * U); }
    if (spIdx() === 6 && rnd() < dt * 0.25 && !st.over) for (let i = 0; i < 8; i++) part("drop", p.x + p.face * r * 0.4, p.y - r * 0.9, (rnd() - 0.5) * 10 * U, -(14 + rnd() * 10) * U, 0.7, 0.6 * U);   // 鯨魚噴水
    if (spIdx() === 7 && rnd() < dt * 3) part("star", p.x + (rnd() - 0.5) * r * 2, p.y + (rnd() - 0.5) * r * 1.6, 0, -4 * U, 0.7, 0.8 * U, "#fff3a0");
    if (st.over && st.over.kind !== "finale" && rnd() < dt * 4) { const m = mouthPos(); part("bub", m.x, m.y - r * 0.2, 0, -(8 + rnd() * 6) * U, 1.4, (0.6 + rnd() * 0.9) * U); }   // 回家路上吐泡泡
  }

  // ---------- 吃、被咬 ----------
  function report(ok, got) {
    try { st.asker.report(ok); } catch (e) { console.warn("[grow] report", e); }
    try { api.onAnswer && api.onAnswer({ ok, q: st.q, got }); } catch (e) { console.warn("[grow] onAnswer", e); }
  }
  function addCoins(n, x, y) { st.coins += n; st.earned += n; renderCoins(true); if (x != null) textPop(x, y, "+" + n, "#ffe26a"); }
  // 手指指著哪裡（吃東西只算手指指著的那隻：游過去路上碰到的不算，小孩才不會「沒想吃卻被說錯」）
  function aimAt(q) { st.target = q; st.aim = { x: q.x, y: q.y, t: st.t }; st.inputT = st.t; }
  // 手指離這隻魚（魚身或泡泡）多近：< 1＝指著它
  function aimScore(f, b) {
    const a = st.aim, m = 3 * U, ex = (a.x - b.bx) / (b.rx + m), ey = (a.y - b.by) / (b.ry + m);
    return Math.min(Math.sqrt(ex * ex + ey * ey), Math.hypot(a.x - f.x, a.y - f.y) / (f.rU * U * 1.3 + m));
  }
  // 每格算一次：手指指著的「那一隻」（泡泡疊在一起時挑最近的那隻，旁邊那隻不會被誤吃）
  function updAim() {
    st.aimId = 0;
    const a = st.aim; if (!a || (!st.down && st.t - a.t > 1.5)) return;
    let best = 1;
    for (const f of st.prey) { if (f.leave) continue; const sc = aimScore(f, bub(f)); if (sc < best) { best = sc; st.aimId = f.id; } }
  }
  const aimed = f => Object.keys(st.keys).length > 0 || f.id === st.aimId;   // 方向鍵（測試用）：碰到就吃
  function canEatNow() {
    const p = st.player;
    if (!st.q || st.between || st.evolving || st.over || p.dizzy > 0) return false;
    return st.down || st.t - st.inputT < 1.5 || Math.hypot(p.vx, p.vy) > 3 * U;    // 有在游（或手指按著）才算：小魚自己撞上停著的你不算吃
  }
  function checkEat() {
    if (!canEatNow()) return;
    const p = st.player, m = mouthPos(), reach = p.rU * U * (spIdx() >= 6 ? 0.55 : 0.35);
    for (const f of st.prey) {
      if (f.re > 0 || f.spit > 0 || f.leave) continue;
      const fr = f.rU * U, b = bub(f);
      if (!aimed(f)) continue;
      const ex = (m.x - b.bx) / (b.rx + reach), ey = (m.y - b.by) / (b.ry + reach);
      if (Math.hypot(m.x - f.x, m.y - f.y) < fr * 1.25 + reach || ex * ex + ey * ey < 1) { eatPrey(f); return; }
    }
    for (const pr of st.preds) {
      if (!pr.edible) continue;
      const r = pr.rU * U, ca = Math.cos(pr.ang), sa = Math.sin(pr.ang);
      for (const k of [-0.5, 0, 0.5]) { const cx = pr.x + ca * k * pr.sp.ax * r, cy = pr.y + sa * k * pr.sp.ax * r; if (Math.hypot(m.x - cx, m.y - cy) < pr.sp.ay * r * 0.95 + reach) { eatBig(pr); return; } }
    }
  }
  function eatPrey(f, chain) {
    const p = st.player, q = st.q;
    p.chomp = 0.32;
    if (f.ok) {
      killPrey(f);
      const first = st.count === 0 && !st.wrongInTask && !chain;
      st.count++; st.right++; st.streak++; st.sinceOk = 0; st.hint = false;
      if (st.count < NEED) addPrey(pickLabel(), true, null, null, p.x < W / 2 ? -1 : 1);   // 馬上補一隻（答案魚隨時至少 2 隻；從離你遠的那邊游進來）
      p.rTU = growTU();
      let gain = 2 + Math.min(4, st.streak - 1); if (first) gain *= 3;
      addCoins(gain, f.x, f.y - 4 * U);
      sparkle(f.x, f.y, first ? 16 : 8, first ? "#ffd23f" : null);
      play(first ? "ev_sparkle" : "ok");
      renderDots(); renderStreak();
      report(true, f.label);
      if (!st) return;
      if (first) { p.gold = 1.0; showPop("一口就對！"); talk(LINES.oneBite); }
      if (!chain && spIdx() >= 6 && st.count < NEED) {      // 鯨魚起：一大口吃 2 隻
        const m = mouthPos(), f2 = st.prey.find(o => o.ok && o.re <= 0 && o.spit <= 0 && !o.leave && Math.hypot(o.x - m.x, o.y - m.y) < 18 * U);
        if (f2) { eatPrey(f2, true); if (!st) return; }
      }
      if (st.count >= NEED && !st.between) taskDone();
    } else {
      st.wrong++; st.streak = 0; renderStreak();
      const firstWrong = !st.wrongInTask; st.wrongInTask = true;
      f.spit = 1.3; f.flash = 0.7;
      const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy) || 1; f.sx = (dx / d) * 45 * U; f.sy = (dy / d) * 30 * U; f.dir = dx >= 0 ? 1 : -1;
      p.dizzy = DIZZY; p.yuck = 0.55; p.vx *= 0.2; p.vy *= 0.2;
      const m = mouthPos(); for (let i = 0; i < 6; i++) part("puff", m.x, m.y, (rnd() - 0.5) * 20 * U + p.face * 10 * U, (rnd() - 0.5) * 16 * U, 0.5, (1 + rnd()) * U);
      play("ng");
      if (firstWrong) { report(false, f.label); if (!st) return; }       // 每個任務只回報第一次吃錯
      later(() => { if (st.q === q && st.t - st.lastSay > 2.5) sayTask(); }, 900);
    }
  }
  function eatBig(pr) {
    const i = st.preds.indexOf(pr); if (i >= 0) st.preds.splice(i, 1);
    st.player.chomp = 0.4; st.bigEaten++; st.cT = 0; st.shake = 0.25;
    addCoins(25, pr.x, pr.y - 6 * U); coinBurst(pr.x, pr.y, 14); sparkle(pr.x, pr.y, 14, "#ffd23f");
    for (let k = 0; k < 8; k++) part("poof", pr.x + (rnd() - 0.5) * 6 * U, pr.y + (rnd() - 0.5) * 6 * U, 0, 0, 0.5, (2 + rnd() * 2) * U);
    play("tp_ko");
  }
  function bite(pr, force) {
    if (!st || st.over || st.evolving) return false;
    const p = st.player;
    if (!force && p.inv > 0) return false;
    let ax = -p.face, ay = 0; if (pr) { const dx = p.x - pr.x, dy = p.y - pr.y, d = Math.hypot(dx, dy) || 1; ax = dx / d; ay = dy / d; }
    p.vx = ax * 55 * U; p.vy = ay * 55 * U; st.shake = 0.35; p.dizzy = 0;
    if (pr) { pr.fed = true; pr.mouth = 1; }
    // 小能力：河豚鼓起來嚇跑大魚、海龜殼擋一次（每區各 1 次）
    if (!force && spIdx() === 2 && !st.abilUsed) { st.abilUsed = true; p.puff = 1.6; p.inv = 1.5; if (pr) pr.scared = true; play("tp_clash2"); sparkle(p.x, p.y, 12, "#fff3a0"); return true; }
    if (!force && spIdx() === 3 && !st.abilUsed) { st.abilUsed = true; p.shine = 0.9; p.inv = 1.5; play("tp_clash2"); sparkle(p.x, p.y - p.rU * U * 0.5, 12, "#ffe066"); return true; }
    p.inv = INV; st.streak = 0; st.bites++; renderStreak(); play("tp_clash1");
    if (st.challenge) {
      st.hearts = Math.max(0, st.hearts - 1); renderHearts("lose");
      if (st.hearts <= 0) { wrapUp("out"); return true; }
    } else {                                                 // 旅程：掉幾枚金幣（撿得回來）＋任務進度點少 1
      const n = Math.min(st.coins, 5); st.coins -= n; renderCoins(false);
      for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = (12 + rnd() * 14) * U; part("lost", p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, 3, 1.3 * U); }
      if (st.count > 0 && !st.between) { st.count--; renderDots("lose"); p.rTU = growTU(); }
    }
    if (!talked.bite) { talked.bite = true; talk(LINES.bite); }
    return true;
  }
  function checkBite() {
    const p = st.player; if (p.inv > 0 || st.evolving || st.over) return;
    const pr0 = p.rU * U * (p.puff > 0 ? 1.1 : 0.78);
    for (const pr of st.preds) {
      if (pr.edible || pr.fed || pr.out || pr.scared || !pr.entered) continue;
      const m = predMouth(pr);                               // 只有大魚的嘴巴碰到才算
      if (Math.hypot(m.x - p.x, m.y - p.y) < m.r + pr0) { bite(pr); return; }
    }
  }

  // ---------- 流程：任務 → 進化 → 收尾 ----------
  function newTask(o) {
    o = o || {};
    const q = st.asker.next();
    st.q = q; st.count = 0; st.wrongInTask = false; st.sinceOk = 0; st.hint = false; st.taskT = 0; st.between = false; st.idleSaid = false;
    st.F = fontU(q);
    renderTask(); relabelAll();
    if (!o.silent) sayTask(true);
  }
  function taskDone() {
    st.between = true; st.tasksDone++;
    addCoins(5); play("star");
    if (st.q && st.q.word && !st.words.includes(st.q.word.h)) st.words.push(st.q.word.h);
    bump(D.dots, "grow-done");
    if (st.introHold) { st.introHold = false; st.noPredUntil = Math.max(st.noPredUntil, st.t + 4); }   // 第一次玩：第一個任務完才放大魚
    const flip = st.tasksDone === TASKS - 1;
    if (flip) crownFlip();
    later(() => {
      if (st.over) return;
      if (st.tasksDone >= TASKS) { zoneComplete(); return; }
      if (flip && !talked.crown) { talked.crown = true; newTask({ silent: true }); talk(LINES.crown, () => sayTask(true)); }
      else newTask();
    }, 1400);
  }
  function zoneComplete() {
    if (!st.challenge && st.z >= ZONES_N - 1) { wrapUp("finale"); return; }     // 第 1 圈：寶藏宮殿長完＝大結局
    startEvolve();
  }
  function startEvolve() {
    const p = st.player;
    st.evolving = { t: 0, sw: false, x0: p.x, y0: p.y };
    st.q = null; st.target = null; st.down = false; st.warns.length = 0; st.redL = st.redR = 0;
    for (const pr of st.preds) pr.flee = true;
    D.task.classList.add("grow-dim"); hideRest();
    play("ev_burst");
  }
  function updEvolve(dt) {
    const e = st.evolving, p = st.player; e.t += dt;
    const k = easeOut(Math.min(1, e.t / 0.85));
    p.x = lerp(e.x0, W / 2, k); p.y = lerp(e.y0, H * 0.72, k); p.vx = p.vy = 0; p.tilt *= 0.9; p.face = 1;   // 魚停在大字下面（新造型要看得到）
    p.spin = e.t < 0.9 ? e.t * 14 : 0;
    st.flash = e.t < 0.9 ? (e.t / 0.9) ** 2 * 0.95 : Math.max(0, 0.95 - (e.t - 0.9) / 0.8);
    if (!e.sw && e.t >= 0.9) {
      e.sw = true;
      st.z++; st.asker.setZone(st.z); st.tasksDone = 0; st.count = 0; st.abilUsed = false; st.chestDone = false; st.zoneT = 0;
      initScene(true);
      p.rTU = growTU(); p.rU = p.rTU * 0.55;
      const loop = st.z >= ZONES_N, sp = spIdx(), z = bgIdx();
      if (loop) showBanner("👑", ZONES[z].name, loopName(Math.floor(st.z / ZONES_N)));
      else showBanner(ZONES[sp].ico, ZONES[sp].fish + "！", ZONES[z].name);
      play("win"); sparkle(p.x, p.y, 24); for (let i = 0; i < 40; i++) part("conf", rnd() * W, -rnd() * 20 * U, (rnd() - 0.5) * 10 * U, (10 + rnd() * 20) * U, 2.4, (0.8 + rnd() * 0.8) * U, pick(["#ff5d8f", "#ffd23f", "#5ce1ff", "#9bff6a", "#c08bff"]));
      flyStar();
    }
    if (e.t >= 2.7) finishEvolve();
  }
  function finishEvolve() {
    st.evolving = null; st.flash = 0; st.player.spin = 0; hideBanner(); D.task.classList.remove("grow-dim");
    if (st.challenge) { st.hearts = Math.min(3, st.hearts + 1); renderHearts("gain"); }
    st.zonesCleared++; addCoins(30);
    try { api.onZone && api.onZone({ zone: st.z }); } catch (e) { console.warn("[grow] onZone", e); }
    if (!st) return;
    newTask({ silent: true });
    st.noPredUntil = Math.max(st.noPredUntil, st.t + 4 + QUIET);
    const line = st.z >= ZONES_N ? (st.z % ZONES_N === 0 ? LINES.loop : null) : LINES["zone" + st.z];
    if (line) talk(line, () => sayTask(true)); else sayTask(true);
    showRest();
  }
  function showRest() {
    st.restOn = true; D.rest.classList.remove("grow-off"); bump(D.rest, "grow-in");
    const tok = ++st.restTok;
    later(() => { if (st.restTok === tok) hideRest(); }, 5500);   // 停 5 秒多（5 歲小孩要看到、想、再伸手）
  }
  function hideRest() { if (!st) return; st.restOn = false; st.restTok = (st.restTok || 0) + 1; if (D) D.rest.classList.add("grow-off"); }
  function result() {
    const score = st.right * 10 + st.earned, o = st.over || {};
    let best = { zone: 0, score: 0 }; try { best = (api.best && api.best()) || best; } catch (e) { /* 沒有紀錄 */ }
    return { zone: st.z, zonesCleared: st.zonesCleared, score, coins: st.coins, right: st.right, wrong: st.wrong, ms: Math.round(st.ms), words: st.words.slice(),
      record: score > ((best && best.score) || 0), finished: o.kind === "finale", rest: o.kind === "rest", stars: st.stars };
  }
  // 收尾：kind＝finale（第 1 圈長成魚王）｜rest（休息一下）｜out（第 2 圈心用完）
  function wrapUp(kind) {
    if (!st || st.over) return;
    hideRest(); hideBanner(); endDemo();
    st.over = { kind, t: 0, card: false, sent: false, fw: 0, r: null };
    st.warns.length = 0; st.redL = st.redR = 0; st.target = null; st.down = false;
    for (const pr of st.preds) pr.flee = true;
    for (const f of st.prey) { f.leave = true; f.dir = f.x < W / 2 ? -1 : 1; f.vU = 4; }   // 小魚也游走：畫面安靜下來
    D.hearts.classList.add("grow-off");                      // 收尾不留灰掉的心
    if (kind === "finale") st.player.rTU *= 1.35;
    D.task.classList.add("grow-dim");
    if (kind === "finale") { flyStar(); play("tp_victory"); showBanner("👑", "長成魚王了！", ZONES[ZONES_N - 1].name); talk(LINES.finale); }
    else { play("whoosh"); if (kind === "rest") talk(LINES.home); }
  }
  function updOver(dt) {
    const o = st.over; o.t += dt;
    if (o.kind === "finale") { o.fw -= dt; if (o.fw <= 0) { o.fw = 0.32; fireworks(W * (0.15 + rnd() * 0.7), H * (0.18 + rnd() * 0.3)); if (o.t < 2) play("pop"); } }
    if (!o.card && o.t >= (o.kind === "finale" ? 0.7 : 1.0)) {
      o.card = true; o.r = result(); hideBanner(); showMap(o); D.map.classList.toggle("grow-low", o.kind === "finale");   // 大結局：小地圖放下面，魚王在上面
      if (o.r.record) { sparkle(W / 2, H / 2, 30, "#ffd23f"); if (o.kind !== "finale") { play("tp_victory"); if (o.kind === "out") talk(LINES.record); } }
    }
    if (!o.sent && o.t >= 3.0) {
      o.sent = true; st.ended = true;
      try { api.onEnd && api.onEnd(o.r || result()); } catch (e) { console.warn("[grow] onEnd", e); }
    }
  }

  // ---------- 生大魚、驚喜 ----------
  function spawnLogic(dt) {
    const df = diff(), p = st.player;
    if (st.q && !st.between) {
      st.pT += dt;
      let danger = st.warns.length; for (const pr of st.preds) if (!pr.edible && !pr.out) danger++;
      if (!st.introHold && st.t >= st.noPredUntil && st.pT >= st.pGap && danger < df.pMax) {
        st.pT = 0; st.pGap = df.gap * (0.8 + rnd() * 0.45);
        const side = rnd() < 0.5 ? -1 : 1, y = clamp(p.y + (rnd() - 0.5) * 34 * U, playTop + 8 * U, H - 8 * U);
        const medium = bgIdx() > 0 && st.tasksDone < TASKS - 1 && rnd() < 0.3;
        st.warns.push({ side, y, t: WARN * (st.asker.ease() > 0 ? 1.3 : 1), big: !medium, beat: 0 });
        play("tp_count");
      }
    }
    for (let i = st.warns.length - 1; i >= 0; i--) {
      const w = st.warns[i]; w.t -= dt;
      if (w.beat === 0 && w.t < WARN * 0.55) { w.beat = 1; play("tp_count"); }       // 咚、咚
      if (w.t <= 0) { st.warns.splice(i, 1); addPred({ side: w.side, y: w.y, big: w.big }); }
    }
    // 第 3 段：畫面上保持一隻金色皇冠魚（會逃、吃到噴金幣）
    if (st.tasksDone >= TASKS - 1 && st.q && !st.between) {
      st.cT += dt; let ed = 0; for (const pr of st.preds) if (pr.edible && !pr.out) ed++;
      if (st.cT > 4 && ed < 1) { st.cT = 0; addPred({ edible: true }); }
    }
    // 驚喜：寶箱（每區第 2 個任務出現一次）
    if (!st.chestDone && st.tasksDone === 1 && st.q && st.taskT > 3 && rnd() < dt * 0.3) {
      st.chestDone = true; st.items.push({ k: "chest", x: W * (0.15 + rnd() * 0.7), y: H - 6 * U, t: 0, life: 22, open: 0 });
    }
  }
  function updItems(dt) {
    const p = st.player, pr = p.rU * U;
    for (let i = st.items.length - 1; i >= 0; i--) {
      const it = st.items[i]; it.t += dt;
      if (it.k === "chest") {
        if (it.open > 0) { it.open += dt; if (it.open > 1.6) st.items.splice(i, 1); continue; }
        if (it.t > it.life) { st.items.splice(i, 1); continue; }
        if (!st.over && !st.evolving && Math.hypot(p.x - it.x, p.y - (it.y - 3 * U)) < pr + 5 * U) { it.open = 0.01; addCoins(15, it.x, it.y - 10 * U); coinBurst(it.x, it.y - 3 * U, 12); play("unlock"); later(() => play("coin"), 250); }
      }
    }
  }

  // ---------- 每一格 ----------
  function step(dt) {
    st.t += dt; st.zoneT += dt; st.taskT += dt;
    st.shake = Math.max(0, st.shake - dt);
    if (st.bgFade < 1) st.bgFade = Math.min(1, st.bgFade + dt / 1.1);
    if (st.evolving) updEvolve(dt);
    if (st.over) updOver(dt);
    if (!st || st.ended) return;
    updPlayer(dt); updPrey(dt); updPreds(dt); updItems(dt); updParts(dt);
    for (const a of amb) {
      if (a.k === "snow") { a.y += a.v * 3 * U * dt; a.x += Math.sin(st.t + a.ph) * U * dt; if (a.y > H) { a.y = -2; a.x = rnd() * W; } }
      else if (a.k !== "plank") { a.y -= a.v * (a.k === "ember" ? 6 : 5) * U * dt; if (a.y < -4 * U) { a.y = H + 2 * U; a.x = rnd() * W; } }
    }
    if (!st.evolving && !st.over) {
      spawnLogic(dt); updAim(); checkEat(); if (!st) return; checkBite();
      // 提示：這個任務 12 秒都沒吃對 → 答案魚發亮；9 秒時先再念一次
      if (st.q && !st.between) {
        st.sinceOk += dt;
        if (st.sinceOk > 9 && !st.idleSaid && st.t - st.lastSay > 4) { st.idleSaid = true; sayTask(); }
        if (st.sinceOk > HINT_AFTER) st.hint = true;
      }
    }
    // 紅光：大魚要從哪一邊來
    let l = 0, r = 0; for (const w of st.warns) { if (w.side < 0) l = 1; else r = 1; }
    st.redL += (l - st.redL) * Math.min(1, 8 * dt); st.redR += (r - st.redR) * Math.min(1, 8 * dt);
  }
  function frame(now) {
    raf = 0;
    if (!st || !D) return;
    let dtR = (now - lastT) / 1000; lastT = now;
    if (!(dtR > 0)) dtR = 0; if (dtR > 0.05) dtR = 0.05;            // 切到背景回來：最多算 0.05 秒
    if (!isPaused() && !st.ended) {
      const dg = dtR * SPEED(), n = Math.max(1, Math.ceil(dg / (1 / 30))), h = dg / n;
      st.ms += dg * 1000;
      for (let i = 0; i < n && st && !st.ended; i++) step(h);
    }
    if (!st) return;                                         // onEnd 裡主程式可能就 stop() 了
    if (now - sizeT > 500) {                                 // 每半秒量一次：畫面大小變了（主程式沒叫 relayout 也跟得上）、任務牌變高了（自動注音加上去之後）
      sizeT = now; const r = root.getBoundingClientRect();
      if (Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) relayout();
      else if (D) { const hb = hudBottom(r); if (hb) playTop = Math.max(playTop, hb); }   // 只會變大（任務牌彈出動畫縮小的那一下不算）
    }
    render();
    if (st && !st.ended) raf = requestAnimationFrame(frame);
  }

  // ---------- 畫 ----------
  function glow(col) {
    let s = glowCache.get(col); if (s) return s;
    s = document.createElement("canvas"); s.width = s.height = 64; const q = s.getContext("2d"), gr = q.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); q.fillStyle = gr; q.fillRect(0, 0, 64, 64); glowCache.set(col, s); return s;
  }
  const glowCache = new Map();
  function render() {
    const c = g, t = st.t;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    if (bgNow) c.drawImage(bgNow, 0, 0, W, H);
    if (bgPrev && st.bgFade < 1) { c.globalAlpha = 1 - st.bgFade; c.drawImage(bgPrev, 0, 0, W, H); c.globalAlpha = 1; } else if (bgPrev && st.bgFade >= 1) bgPrev = null;
    const b = BG[bgIdx()];
    if (rays && b.ray > 0) { c.globalAlpha = b.ray * (0.8 + 0.2 * Math.sin(t * 0.6)); c.drawImage(rays, Math.sin(t * 0.25) * 3 * U, 0, W, H); c.globalAlpha = 1; }
    if (st.shake > 0) c.translate((rnd() - 0.5) * 2.4 * U, (rnd() - 0.5) * 2.4 * U);
    drawWeeds(c, t, b); drawAmb(c, t);
    if (st.over && st.over.kind !== "finale") drawHome(c, t);
    for (const it of st.items) drawChest(c, it, t);
    for (const f of st.prey) drawPreyFish(c, f, t);
    for (const pr of st.preds) drawPred(c, pr, t);
    for (const f of st.prey) drawBubble(c, f, t);
    drawPlayer(c, t);
    drawParts(c, t);
    drawWarns(c, t);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (st.flash > 0) { c.fillStyle = `rgba(255,255,255,${st.flash})`; c.fillRect(0, 0, W, H); }
    if (D) {                                                 // 示範手指
      const f = st.demo && st.demo.f;
      if (f && f.show) { D.finger.classList.remove("grow-off"); D.finger.classList.toggle("grow-press", f.press); D.finger.style.transform = `translate(${f.x}px, ${f.y}px)`; }
      else if (!D.finger.classList.contains("grow-off")) D.finger.classList.add("grow-off");
    }
  }
  function drawWeeds(c, t, b) {
    if (!weeds.length) return;
    const base = H - 4.5 * U;
    c.lineCap = "round"; c.lineJoin = "round";
    for (const s of weeds) {
      const h = s.h * U, seg = 6; c.beginPath(); c.moveTo(s.x, base);
      let px = s.x, py = base;
      for (let i = 1; i <= seg; i++) { const k = i / seg, x = s.x + Math.sin(t * 1.1 + s.ph + k * 2.2) * h * 0.13 * k, y = base - h * k; c.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); px = x; py = y; }
      c.lineTo(px, py); c.strokeStyle = s.col; c.lineWidth = s.w * U; c.stroke();
      c.fillStyle = s.col;
      for (let i = 2; i < seg; i += 2) { const k = i / seg, x = s.x + Math.sin(t * 1.1 + s.ph + k * 2.2) * h * 0.13 * k, y = base - h * k; c.beginPath(); c.ellipse(x + (i % 4 ? 1.6 : -1.6) * U, y, 2 * U, 0.8 * U, i % 4 ? -0.5 : 0.5, 0, TAU); c.fill(); }
      if (b.glow) { c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2 + s.ph); c.drawImage(glow("rgba(120,255,230,0.9)"), px - 3 * U, py - 3 * U, 6 * U, 6 * U); c.globalAlpha = 1; c.globalCompositeOperation = "source-over"; }
    }
  }
  function drawAmb(c, t) {
    for (const a of amb) {
      if (a.k === "bub") { c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 0.18 * U; c.beginPath(); c.arc(a.x + Math.sin(t * 2 + a.ph) * U, a.y, a.s * U, 0, TAU); c.stroke(); }
      else if (a.k === "plank") { c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 * a.v + a.ph); c.drawImage(glow(a.ph % 2 > 1 ? "rgba(120,255,220,0.9)" : "rgba(200,140,255,0.9)"), a.x - 1.5 * U, a.y - 1.5 * U, 3 * U, 3 * U); c.globalAlpha = 1; c.globalCompositeOperation = "source-over"; }
      else if (a.k === "snow") { c.fillStyle = "rgba(255,255,255,0.85)"; c.beginPath(); c.arc(a.x, a.y, a.s * 0.5 * U, 0, TAU); c.fill(); }
      else if (a.k === "ember") { c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.5 + 0.4 * Math.sin(t * 4 + a.ph); c.drawImage(glow("rgba(255,130,40,0.95)"), a.x - 1.2 * U, a.y - 1.2 * U, 2.4 * U, 2.4 * U); c.globalAlpha = 1; c.globalCompositeOperation = "source-over"; }
      else if (a.k === "spark") { const k = 0.5 + 0.5 * Math.sin(t * 3 + a.ph); if (k > 0.3) { starPath(c, a.x, a.y, a.s * 1.2 * U * k, a.s * 0.3 * U * k, 4, t); c.fillStyle = "rgba(255,236,150,0.9)"; c.fill(); } }
    }
  }
  function drawHome(c, t) {                                  // 收尾：小魚的家（大貝殼）
    const x = W / 2, y = H - 5 * U, R = 16 * U;
    c.fillStyle = "#ffb3c9"; c.beginPath(); c.moveTo(x - R, y); c.quadraticCurveTo(x, y - R * 1.5, x + R, y); c.closePath(); c.fill();
    c.strokeStyle = "#c86b8a"; c.lineWidth = 0.6 * U; c.stroke();
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + i * R * 0.42, y - R * 0.62 + Math.abs(i) * R * 0.14); c.stroke(); }
    c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y - 2.4 * U, 2.6 * U, 0, TAU); c.fill(); c.fillStyle = "rgba(255,255,255,0.6)"; c.beginPath(); c.arc(x - 0.8 * U, y - 3.2 * U, 0.8 * U, 0, TAU); c.fill();
  }
  function drawChest(c, it, t) {
    const x = it.x, y = it.y, w = 9 * U, h = 6 * U, op = Math.min(1, it.open * 3);
    c.globalAlpha = it.open > 1.2 ? Math.max(0, 1 - (it.open - 1.2) / 0.4) : 1;
    c.drawImage(glow("rgba(255,230,120,0.8)"), x - 10 * U, y - 13 * U, 20 * U, 20 * U);
    c.fillStyle = "#9a5a22"; c.strokeStyle = "#5a3210"; c.lineWidth = 0.5 * U;
    c.beginPath(); c.rect(x - w / 2, y - h, w, h); c.fill(); c.stroke();
    c.fillStyle = "#ffd23f"; c.fillRect(x - w / 2, y - h * 0.55, w, h * 0.16); c.fillRect(x - 0.8 * U, y - h * 0.7, 1.6 * U, h * 0.4);
    c.save(); c.translate(x - w / 2, y - h); c.rotate(-op * 1.1); c.fillStyle = "#b36a2a"; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.quadraticCurveTo(w, -h * 0.7, w / 2, -h * 0.75); c.quadraticCurveTo(0, -h * 0.7, 0, 0); c.fill(); c.stroke(); c.restore();
    if (!it.open && Math.sin(t * 6) > 0.6) { starPath(c, x + w * 0.4, y - h * 1.3, 1.4 * U, 0.4 * U, 4, t); c.fillStyle = "#fff6c0"; c.fill(); }
    c.globalAlpha = 1;
  }
  function drawPreyFish(c, f, t) {
    const r = f.rU * U, s = preySpec(f.col);
    c.save(); c.translate(f.x, f.y); c.scale(f.faceS * r, r);
    drawFish(c, s, t + f.ph, { mood: f.spit > 0 ? "scared" : "happy", blink: (t + f.ph * 3.7) % 3.4 < 0.12, wf: 9, er: 0.32 });
    c.restore();
  }
  const preyCache = new Map();
  function preySpec(col) {
    let s = preyCache.get(col);
    if (!s) { s = { shape: "oval", ax: 1.18, ay: 0.85, body: col, belly: mixHex(col, "#ffffff", 0.55), fin: mixHex(col, "#ffffff", 0.3), line: mixHex(col, "#000000", 0.5), tail: "fan", dorsal: "small" }; preyCache.set(col, s); }
    return s;
  }
  function drawBubble(c, f, t) {
    const b = bub(f);
    let k = 1; if (f.re > 0 && f.re < 0.5) { const p = 1 - f.re / 0.5; k = Math.max(0.06, p < 0.5 ? 1 - 2 * p : 2 * p - 1); }
    const shake = f.flash > 0 ? Math.sin(t * 60) * 0.7 * U * (f.flash / 0.7) : 0;
    c.save(); c.translate(b.bx + shake, b.by); c.scale(k, k);
    const hint = st.hint && f.ok && f.re <= 0;
    if (hint) {                                              // 提示：答案魚發亮（金色光圈一縮一放）
      const pl = 1 + 0.12 * Math.sin(t * 6);
      c.drawImage(glow("rgba(255,215,64,0.95)"), -b.rx * 1.7 * pl, -b.ry * 1.7 * pl, b.rx * 3.4 * pl, b.ry * 3.4 * pl);
    }
    c.beginPath(); c.ellipse(0, 0, b.rx, b.ry, 0, 0, TAU);
    c.fillStyle = f.flash > 0 ? "rgba(255,214,222,0.97)" : "rgba(255,255,255,0.95)"; c.fill();
    c.lineWidth = (hint ? 0.9 : 0.45) * U; c.strokeStyle = f.flash > 0 ? "#ff5a7a" : hint ? "#ffb300" : "rgba(70,150,220,0.9)"; c.stroke();
    c.fillStyle = "rgba(255,255,255,0.9)"; c.beginPath(); c.ellipse(-b.rx * 0.48, -b.ry * 0.55, b.rx * 0.16, b.ry * 0.09, -0.6, 0, TAU); c.fill();
    c.drawImage(b.spr.cv, -b.spr.w / 2, -b.spr.h / 2, b.spr.w, b.spr.h);
    c.restore();
  }
  function drawPred(c, pr, t) {
    const r = pr.rU * U, s = specOf(pr);
    if (pr.edible) { c.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5); c.drawImage(glow("rgba(255,220,80,0.9)"), pr.x - r * 2.4, pr.y - r * 2.2, r * 4.8, r * 4.4); c.globalAlpha = 1; }
    c.save(); c.translate(pr.x, pr.y); c.rotate(pr.ang); if (Math.cos(pr.ang) < 0) c.scale(1, -1); c.scale(r, r);
    const mood = pr.edible || pr.scared ? "scared" : "mean";
    drawCreature(c, s, t + pr.ph, { mood, mouth: pr.edible ? 0 : pr.mouth, teeth: !pr.edible, crown: pr.edible, wf: 5, er: pr.edible ? 0.26 : 0.21, noCheek: !pr.edible, blink: (t + pr.ph) % 4 < 0.1 });
    c.restore();
  }
  function drawPlayer(c, t) {
    const p = st.player, s = SPECIES[spIdx()], r = p.rU * U;
    const bob = st.evolving ? 0 : Math.sin(t * 2 + p.ph) * 0.4 * U;
    if (bgIdx() >= 4 || st.evolving) { c.globalAlpha = st.evolving ? 0.9 : 0.35; c.drawImage(glow(st.evolving ? "rgba(255,255,220,0.95)" : "rgba(180,230,255,0.8)"), p.x - r * 2.4, p.y - r * 2.4 + bob, r * 4.8, r * 4.8); c.globalAlpha = 1; }
    if (p.gold > 0) { c.globalAlpha = Math.min(1, p.gold * 1.5); c.drawImage(glow("rgba(255,210,60,0.95)"), p.x - r * 2.6, p.y - r * 2.6, r * 5.2, r * 5.2); c.globalAlpha = 1; }
    if (p.inv > 0 && !st.evolving && !st.over && p.puff <= 0 && p.shine <= 0 && Math.floor(t * 10) % 2 === 0) c.globalAlpha = 0.4;   // 無敵中一閃一閃
    c.save(); c.translate(p.x, p.y + bob);
    if (p.spin) c.rotate(Math.sin(p.spin) * 0.25);
    const sx = Math.sign(p.faceS || 1) * Math.max(0.18, Math.abs(p.faceS));
    c.rotate(p.tilt * Math.sign(p.faceS || 1));
    const pf = p.puff > 0 ? 1 + 0.35 * Math.min(1, p.puff * 3) : 1;
    c.scale(sx * r * pf, r * pf);
    const mood = p.yuck > 0 ? "yuck" : p.dizzy > 0 ? "dizzy" : st.over && st.over.kind === "finale" ? "happy" : "happy";
    let mouth = p.chomp > 0 ? Math.sin((p.chomp / 0.32) * Math.PI) : 0;
    if (!mouth && canEatNow()) { const m = mouthPos(); for (const f of st.prey) { if (f.re > 0 || f.spit > 0) continue; if (Math.hypot(f.x - m.x, f.y - m.y) < 9 * U && aimed(f)) { mouth = 0.55; break; } } }   // 快吃到指著的那隻：嘴巴張開
    drawCreature(c, s, t + p.ph, { mood, mouth, blink: (t + p.ph) % 3.1 < 0.12, wf: 5 + Math.min(8, Math.hypot(p.vx, p.vy) / U / 5), er: 0.3, puff: p.puff > 0, shine: (s.kind === "turtle" && !st.abilUsed) || p.shine > 0, gold: p.gold > 0 });
    c.restore(); c.globalAlpha = 1;
    if (p.dizzy > 0) {                                        // 吃錯：頭上冒星星（轉圈）
      for (let i = 0; i < 3; i++) { const a = t * 6 + (i * TAU) / 3, x = p.x + Math.cos(a) * r * 0.75, y = p.y - r * 1.25 + Math.sin(a) * r * 0.22; starPath(c, x, y, 1.5 * U, 0.6 * U); c.fillStyle = "#ffe066"; c.fill(); c.strokeStyle = "#c98a00"; c.lineWidth = 0.25 * U; c.stroke(); }
    }
  }
  function drawParts(c, t) {
    for (const q of st.parts) {
      const a = Math.max(0, Math.min(1, q.life / q.max * 1.6));
      c.globalAlpha = a;
      if (q.k === "star") { starPath(c, q.x, q.y, q.s, q.s * 0.45, 5, q.rot); c.fillStyle = q.col; c.fill(); }
      else if (q.k === "coin" || q.k === "lost") {
        if (q.k === "lost" && q.life < 1 && Math.floor(q.life * 10) % 2) continue;
        c.save(); c.translate(q.x, q.y); c.scale(Math.max(0.2, Math.abs(Math.cos(q.rot * 2))), 1); c.fillStyle = "#ffd23f"; c.beginPath(); c.arc(0, 0, q.s, 0, TAU); c.fill(); c.strokeStyle = "#c58a00"; c.lineWidth = q.s * 0.25; c.stroke(); c.restore();
      }
      else if (q.k === "txt") { c.font = `900 ${q.s}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.lineWidth = q.s * 0.22; c.strokeStyle = "rgba(60,30,0,0.85)"; c.strokeText(q.txt, q.x, q.y); c.fillStyle = q.col; c.fillText(q.txt, q.x, q.y); }
      else if (q.k === "poof" || q.k === "puff") { c.fillStyle = q.k === "puff" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.7)"; c.beginPath(); c.arc(q.x, q.y, q.s * (1.6 - q.life / q.max), 0, TAU); c.fill(); }
      else if (q.k === "conf") { c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillStyle = q.col; c.fillRect(-q.s, -q.s * 0.4, q.s * 2, q.s * 0.8); c.restore(); }
      else if (q.k === "fw") { c.fillStyle = q.col; c.beginPath(); c.arc(q.x, q.y, q.s, 0, TAU); c.fill(); }
      else if (q.k === "bub" || q.k === "drop") { c.strokeStyle = q.k === "drop" ? "rgba(200,240,255,0.95)" : "rgba(255,255,255,0.85)"; c.lineWidth = 0.22 * U; c.beginPath(); c.arc(q.x, q.y, q.s, 0, TAU); c.stroke(); if (q.k === "drop") { c.fillStyle = "rgba(220,245,255,0.7)"; c.fill(); } }
    }
    c.globalAlpha = 1;
  }
  function drawWarns(c, t) {
    for (const [side, k] of [[-1, st.redL], [1, st.redR]]) {   // 大魚要來的那一邊閃紅光
      if (k < 0.02) continue;
      const w = 16 * U, x0 = side < 0 ? 0 : W - w, gr = c.createLinearGradient(side < 0 ? 0 : W, 0, side < 0 ? w : W - w, 0);
      const a = k * (0.32 + 0.22 * Math.sin(t * 14));
      gr.addColorStop(0, `rgba(255,40,60,${a})`); gr.addColorStop(1, "rgba(255,40,60,0)"); c.fillStyle = gr; c.fillRect(x0, 0, w, H);
    }
    for (const w of st.warns) {
      const x = w.side < 0 ? 6 * U : W - 6 * U, y = w.y, pl = 1 + 0.15 * Math.sin(t * 16);
      c.save(); c.translate(x, y); c.scale(pl, pl);
      c.fillStyle = "#ff3b4f"; c.beginPath(); c.arc(0, 0, 4.4 * U, 0, TAU); c.fill(); c.lineWidth = 0.6 * U; c.strokeStyle = "#fff"; c.stroke();
      c.fillStyle = "#fff"; c.fillRect(-0.7 * U, -2.8 * U, 1.4 * U, 3.4 * U); c.beginPath(); c.arc(0, 2.2 * U, 0.85 * U, 0, TAU); c.fill();
      c.fillStyle = "#ff3b4f"; c.beginPath(); const ax = -w.side * 5.6 * U; c.moveTo(ax, -1.6 * U); c.lineTo(ax - w.side * 2.2 * U, 0); c.lineTo(ax, 1.6 * U); c.closePath(); c.fill();
      c.restore();
    }
  }

  // ---------- HUD ----------
  function renderTask() {
    const q = st.q; if (!q) return;
    const showPic = q.pic && q.tier >= 4;                    // 4–6 級顯示圖；聽音題只有 🔊
    D.pic.textContent = showPic ? q.pic : ""; D.pic.classList.toggle("grow-off", !showPic);
    D.task.classList.toggle("grow-listen", !showPic);
    renderDots(); bump(D.task, "grow-new");
  }
  function renderDots(anim) {
    [...D.dots.children].forEach((d, i) => d.classList.toggle("grow-on", i < st.count));
    const d = D.dots.children[anim === "lose" ? st.count : st.count - 1];
    if (d) bump(d, anim === "lose" ? "grow-lose" : "grow-dot-pop");
  }
  function renderHearts(anim) {
    D.hearts.classList.toggle("grow-off", !st.challenge);
    [...D.hearts.children].forEach((h, i) => h.classList.toggle("grow-empty", i >= st.hearts));
    if (anim === "lose") bump(D.hearts.children[st.hearts], "grow-lose");
    if (anim === "gain") bump(D.hearts.children[st.hearts - 1], "grow-gain");
  }
  function renderCoins(up) { D.coinN.textContent = String(st.coins); bump(D.coins, up ? "grow-bump" : "grow-drop"); }
  function renderStreak() { D.streak.classList.toggle("grow-off", st.streak < 2); D.streakN.textContent = String(st.streak); if (st.streak >= 2) bump(D.streak, "grow-bump"); }
  function renderJar() { D.jarN.textContent = String(st.stars); D.jarGlass.style.setProperty("--fill", String(Math.min(1, st.stars / STAR_MAX))); }
  function showBanner(ic, tx, sub) { D.bnIc.textContent = ic || ""; D.bnTx.textContent = tx || ""; D.bnSub.textContent = sub || ""; D.banner.classList.remove("grow-off"); bump(D.banner, "grow-in"); }
  function hideBanner() { if (D) D.banner.classList.add("grow-off"); }
  function showPop(text) {
    D.pop.textContent = text; D.pop.classList.remove("grow-off"); bump(D.pop, "grow-in");
    const tok = ++st.popTok; later(() => { if (st.popTok === tok) D.pop.classList.add("grow-off"); }, 1300);
  }
  // 進化當下：一顆星星飛進角落的星星罐（一局最多 10 顆）
  function flyStar() {
    if (st.stars >= STAR_MAX) return;
    st.stars++;
    const my = run, p = st.player, wr = D.wrap.getBoundingClientRect(), jr = D.jar.getBoundingClientRect();
    const s = mk("div", "grow-flystar", D.wrap, "⭐");
    const x1 = jr.left - wr.left + jr.width / 2, y1 = jr.top - wr.top + jr.height / 2;
    const done = () => { s.remove(); if (my === run && st) { renderJar(); bump(D.jar, "grow-bump"); play("star"); } };
    try {
      const a = s.animate([{ transform: `translate(${p.x}px, ${p.y}px) scale(2.2)` }, { transform: `translate(${(p.x + x1) / 2}px, ${Math.min(p.y, y1) - 12 * U}px) scale(1.8)`, offset: 0.45 }, { transform: `translate(${x1}px, ${y1}px) scale(0.7)` }],
        { duration: 1100 / SPEED(), easing: "ease-in-out", fill: "forwards" });
      a.onfinish = done;
    } catch (e) { done(); }
  }
  // 收尾的 8 區小地圖：走過的亮、現在這區有你、還沒到的淡淡的
  function showMap(o) {
    const m = D.map; m.textContent = "";
    const sp = spIdx(), card = mk("div", "grow-map-card", m);
    mk("div", "grow-map-tx", card, o.kind === "finale" ? "長成魚王了！" : `你長成${ZONES[sp].fish}了！`);
    const row = mk("div", "grow-map-row", card), loop = st.z >= ZONES_N, here = loop ? bgIdx() : sp;
    ZONES.forEach((z, i) => {
      const cls = loop || i < here || o.kind === "finale" ? "grow-done" : i === here ? "grow-now" : "grow-todo";
      const stop = mk("div", "grow-map-stop " + cls, row); mk("span", "grow-map-ic", stop, z.ico);
      if (i < ZONES.length - 1) mk("i", "grow-map-path " + (i < here || loop || o.kind === "finale" ? "grow-done" : ""), row);
    });
    if (loop) mk("div", "grow-map-loop", card, loopName(Math.floor(st.z / ZONES_N)));
    if (o.r && o.r.record) mk("div", "grow-map-rec", card, "破紀錄了！🎉");
    m.classList.remove("grow-off"); bump(m, "grow-in");
  }

  // ---------- 公開介面 ----------
  function start(opts) {
    stop();
    run++;
    const o = opts || {};
    rnd = typeof api.seed === "number" ? mulberry32(api.seed) : Math.random;
    st = newState(o.zone || 0, !!o.intro);
    st.restTok = 0; st.popTok = 0;
    build(); relayout();
    if (!bgNow) initScene(false);                            // relayout 量不到大小（還藏著）時先用舊尺寸畫
    const p = st.player; p.x = W * 0.5; p.y = Math.max(playTop + 20 * U, H * 0.58); p.rTU = p.rU = growTU();
    st.F = fontU(null);
    newTask({ silent: true });
    // 開場先把小魚散在畫面上（不是全部從邊邊游進來）
    st.prey.length = 0;
    const L = dealLabels(preyN()); L.forEach(l => addPrey(l, false));
    renderHearts(); renderCoins(); renderJar(); renderStreak();
    if (st.intro) { st.demo = { t: 0 }; talk(LINES.intro, () => sayTask(true)); }
    else { st.noPredUntil = 4 + QUIET; later(() => sayTask(true), 350); }
    lastT = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() {
    const was = !!st;
    run++;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (was) { try { api.stopVoice && api.stopVoice(); } catch (e) { /* 沒有也沒關係 */ } }
    offs.splice(0).forEach(f => { try { f(); } catch (e) { /* 已經拆了 */ } });
    if (D) { root.textContent = ""; root.classList.remove("grow-root"); }
    D = null; cv = null; g = null; st = null; bgNow = bgPrev = rays = null; weeds = []; amb = []; labels.clear(); pool.length = 0;
  }

  // ---------- 測試掛鉤（tools/zy-test/grow-unit.js） ----------
  function state() {
    if (!st) return null;
    const p = st.player, s = SPECIES[spIdx()];
    return {
      zone: st.z, bg: bgIdx(), loop: Math.floor(st.z / ZONES_N), species: spIdx(), fish: ZONES[spIdx()].fish, challenge: st.challenge,
      tasksDone: st.tasksDone, count: st.count, need: NEED, between: st.between, sinceOk: st.sinceOk,
      task: st.q ? { answer: st.q.answer, say: st.q.say, alt: st.q.alt, kind: st.q.kind, tier: st.q.tier, tierName: TIER_NAME[st.q.tier], options: st.q.options.slice(), pic: st.q.pic } : null,
      hearts: st.hearts, coins: st.coins, earned: st.earned, score: st.right * 10 + st.earned, right: st.right, wrong: st.wrong, words: st.words.slice(), ms: Math.round(st.ms), t: st.t,
      streak: st.streak, wrongInTask: st.wrongInTask, stars: st.stars, bigEaten: st.bigEaten, bites: st.bites,
      hint: st.hint, evolving: !!st.evolving, evolveT: st.evolving ? st.evolving.t : 0, over: st.over ? st.over.kind : null, overT: st.over ? st.over.t : 0, ended: st.ended, restOn: !!st.restOn,
      paused: isPaused(), U, W, H, playTop, dpr, cw: cv ? cv.width : 0, ch: cv ? cv.height : 0, raf: !!raf, demo: !!st.demo, noPredIn: Math.max(0, st.noPredUntil - st.t),
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: p.rU * U, rT: p.rTU * U, face: p.face, inv: p.inv, dizzy: p.dizzy, puff: p.puff, mouth: mouthPos(), mx: s.mx },
      prey: st.prey.map(f => { const b = bub(f); return { id: f.id, x: f.x, y: f.y, r: f.rU * U, label: f.label, ok: f.ok, spit: f.spit > 0, re: f.re > 0, leave: f.leave, entering: f.entering, bx: b.bx, by: b.by, rx: b.rx, ry: b.ry }; }),
      preds: st.preds.map(pr => ({ id: pr.id, x: pr.x, y: pr.y, r: pr.rU * U, ang: pr.ang, edible: pr.edible, big: pr.big, fed: pr.fed, out: pr.out, entered: pr.entered, mouth: predMouth(pr) })),
      warns: st.warns.map(w => ({ side: w.side, y: w.y, t: w.t })), items: st.items.map(it => ({ k: it.k, x: it.x, y: it.y, open: it.open > 0 })),
      ease: st.asker.ease(), stats: st.asker.stats(),
    };
  }
  const hooks = {
    state,
    // 直接讓你的魚吃一隻對的／錯的（不經過碰撞）；沒有可以吃的回傳 false
    answer(ok) {
      if (!st || !st.q || st.between || st.evolving || st.over) return false;
      const f = st.prey.find(x => x.ok === !!ok && x.re <= 0 && x.spit <= 0 && !x.leave);
      if (!f) return false; st.player.dizzy = 0; eatPrey(f); return true;
    },
    setZone(z) {                                             // 直接跳到第 z 區（沒有演出）
      if (!st) return false;
      st.z = Math.max(0, z | 0); st.challenge = st.challenge || st.z >= ZONES_N; if (st.challenge && !st.hearts) st.hearts = 3;
      st.asker.setZone(st.z); st.tasksDone = 0; st.zoneT = 0; st.abilUsed = false; st.chestDone = false; st.preds.length = 0; st.warns.length = 0;
      initScene(false); st.player.rTU = st.player.rU = growTU(); newTask({ silent: true }); renderHearts(); return true;
    },
    hurt(o) { return bite(null, !!(o && o.force)); },
    setHearts(n) { if (!st) return; st.hearts = n; renderHearts(); },
    finishTask() { if (!st || !st.q || st.between) return false; st.count = NEED - 1; st.wrongInTask = true; renderDots(); return hooks.answer(true); },
    evolve() { if (!st || st.evolving || st.over) return false; st.tasksDone = TASKS - 1; return hooks.finishTask(); },
    steer(x, y) { if (!st) return; endDemo(); st.down = true; aimAt({ x, y }); },
    release() { if (st) st.down = false; },
    spawnPred(o) { if (!st) return null; const pr = addPred(o || {}); return pr.id; },
    rest() { if (!st || !st.restOn) return false; wrapUp("rest"); return true; },
    noPreds(v) { if (st) st.noPredUntil = v ? Infinity : st.t; },
    movePrey(id, x, y) { const f = st && st.prey.find(o => o.id === id); if (f) { f.x = x; f.y = f.by = y; f.entering = false; } return !!f; },
  };
  if (typeof window !== "undefined") window.__zyGrow = hooks;
  return { start, stop, relayout };
}
