// 方塊爆破（Block Blast 自用復刻）— 純遊戲邏輯，不碰畫面
// 畫面／操作在 js/blocks.js；這支 node 也能直接 import 做測試（tools/bb-test/）
// 棋盤用「每列一個 8 位元整數」表示（bit c = 第 c 欄有格子），判斷放不放得下、會不會消行都很快，出塊時才算得動「三塊都放得完嗎」
//
// 規則來源：
//   確定（多來源一致）：8×8、一次給 3 塊、三塊放完才補、不能旋轉、三塊都放不下就結束、放一格 1 分
//   計分：2026-10-15 從原版 9.6.8 實機影片（YouTube sLuUEw42-cE）抄 29 筆得分反推，抽查截圖吻合（見 SCORE 註解）
//   出塊參數：原版沒公開 → 設計值（tools/bb-test/sim.mjs 電腦對打調）

export const N = 8;
export const FULL = (1 << N) - 1;   // 一整列滿 = 255
export const COLORS = 7;            // 方塊顏色數（色票在 blocks.js）
export const GEMS = ["r", "b", "g", "y"];   // 冒險模式寶石：紅寶石／藍鑽／綠翡翠／金星

// ── 計分（照原版反推）──
// 一步得分 = 放下的格數 + 單位 × 線數係數[L] × (C+1) × 連擊加成(C)
//   C = 畫面上顯示的連擊數（第 1 次消＝0 不顯示、第 2 次連續消＝「Combo」、第 3 次＝「Combo 2」…）
//   線數係數：1 條 1、2 條 2、3 條 6、4 條 12（= L×(L-1)）；連擊加成：C 0~4 ×1、5~9 ×1.5、10~14 ×2（每 5 連 +0.5）
//   影片實例：C=0 兩條 +116、C=3 一條 +231、C=4 兩條 +577、C=6 兩條 +1212、C=7 三條 +4152、C=12 四條 +17992
export const SCORE = {
  perCell: 1,
  unit: 57.7,
  lineFactor: [0, 1, 2, 6, 12, 20, 30],
  allClear: 360,     // 盤面清空：原版影片沒拍到，沿用兩個社群來源的 360（未證實）
  pattern: 100,      // 開局圖案全部消光「Pattern Finished!」：影片一次 +1484 ≈ 四條×Combo(1386)+100 推的（未證實）
  comboGrace: 3,     // 連續 3 塊都沒消才斷（影片中隔 2 塊沒消連擊還在）
};
export const comboShown = streak => Math.max(0, streak - 1);
export function scoreMove(cells, lines, streak, allClear, pattern = false) {
  const place = cells * SCORE.perCell, C = comboShown(streak);
  const lf = SCORE.lineFactor[Math.min(lines, SCORE.lineFactor.length - 1)];
  const clear = lines ? Math.round(SCORE.unit * lf * (C + 1) * (1 + 0.5 * Math.floor(C / 5))) : 0;
  const bonus = (allClear ? SCORE.allClear : 0) + (pattern ? SCORE.pattern : 0);
  return { place, clear, bonus, total: place + clear + bonus };
}
// 鼓勵字：看一次消幾條
export function praiseFor(lines) {
  return lines >= 6 ? "Unbelievable!" : lines === 5 ? "Amazing!" : lines === 4 ? "Excellent!" : lines === 3 ? "Great!" : lines === 2 ? "Good!" : "";
}

// ── 形狀表（# = 有格子）。不能旋轉，所以每個方向都是獨立形狀 ──
// tier：0 小塊 1 中塊 2 大塊；w：基本出現機率
const DEFS = [
  // 單格／直線
  ["o1", 0, 0.45, ["#"]],
  ["i2h", 0, 0.8, ["##"]], ["i2v", 0, 0.8, ["#", "#"]],
  ["i3h", 0, 0.9, ["###"]], ["i3v", 0, 0.9, ["#", "#", "#"]],
  ["i4h", 1, 0.8, ["####"]], ["i4v", 1, 0.8, ["#", "#", "#", "#"]],
  ["i5h", 2, 0.55, ["#####"]], ["i5v", 2, 0.55, ["#", "#", "#", "#", "#"]],
  // 方形／長方形
  ["o2", 1, 1.0, ["##", "##"]],
  ["o3", 2, 0.45, ["###", "###", "###"]],
  ["r23", 2, 0.5, ["###", "###"]], ["r32", 2, 0.5, ["##", "##", "##"]],
  // 小 L（3 格）
  ["l3a", 0, 0.55, ["##", "#."]], ["l3b", 0, 0.55, ["##", ".#"]], ["l3c", 0, 0.55, ["#.", "##"]], ["l3d", 0, 0.55, [".#", "##"]],
  // L（4 格）8 個方向
  ["l4a", 1, 0.4, ["#.", "#.", "##"]], ["l4b", 1, 0.4, [".#", ".#", "##"]], ["l4c", 1, 0.4, ["##", "#.", "#."]], ["l4d", 1, 0.4, ["##", ".#", ".#"]],
  ["l4e", 1, 0.4, ["###", "#.."]], ["l4f", 1, 0.4, ["###", "..#"]], ["l4g", 1, 0.4, ["#..", "###"]], ["l4h", 1, 0.4, ["..#", "###"]],
  // T（4 格）
  ["t4a", 1, 0.5, ["###", ".#."]], ["t4b", 1, 0.5, [".#.", "###"]], ["t4c", 1, 0.5, ["#.", "##", "#."]], ["t4d", 1, 0.5, [".#", "##", ".#"]],
  // S／Z（4 格）
  ["s4a", 1, 0.4, [".##", "##."]], ["s4b", 1, 0.4, ["##.", ".##"]], ["s4c", 1, 0.4, ["#.", "##", ".#"]], ["s4d", 1, 0.4, [".#", "##", "#."]],
  // 大 L（5 格，3×3 角）
  ["l5a", 2, 0.4, ["###", "#..", "#.."]], ["l5b", 2, 0.4, ["###", "..#", "..#"]], ["l5c", 2, 0.4, ["#..", "#..", "###"]], ["l5d", 2, 0.4, ["..#", "..#", "###"]],
];

export const SHAPES = DEFS.map(([id, tier, w, rows]) => {
  const cells = [];
  rows.forEach((s, r) => [...s].forEach((ch, c) => { if (ch === "#") cells.push([r, c]); }));
  const h = rows.length, wd = Math.max(...rows.map(s => s.length));
  const masks = rows.map(s => [...s].reduce((m, ch, c) => ch === "#" ? m | (1 << c) : m, 0));
  return { id, tier, w, cells, wd, h, n: cells.length, masks };
});
export const SHAPE_BY_ID = Object.fromEntries(SHAPES.map(s => [s.id, s]));

// ── 亂數（可設種子：關卡每次開局一樣、測試可重現）──
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ── 棋盤位元運算 ──
// grid[r][c] = null 或 { k: 顏色 0-6, gem: null|"r"|"b"|"g"|"y" }
export function newGrid() { return Array.from({ length: N }, () => Array(N).fill(null)); }
export function gridRows(grid) {
  const rows = new Array(N).fill(0);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) rows[r] |= 1 << c;
  return rows;
}
export function canPlaceRows(rows, s, r, c) {
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r + s.h > N || c + s.wd > N) return false;
  for (let i = 0; i < s.h; i++) if (rows[r + i] & (s.masks[i] << c)) return false;
  return true;
}
// 放下後的新 rows（含消行），回傳 { rows, lines, fullRows, fullCols }（後兩個是位元遮罩）
export function placeRows(rows, s, r, c) {
  const nr = rows.slice();
  for (let i = 0; i < s.h; i++) nr[r + i] |= s.masks[i] << c;
  let fullRows = 0, fullCols = FULL;
  for (let i = 0; i < N; i++) { if (nr[i] === FULL) fullRows |= 1 << i; fullCols &= nr[i]; }
  const lines = popcount(fullRows) + popcount(fullCols);
  if (lines) for (let i = 0; i < N; i++) nr[i] = (fullRows >> i & 1) ? 0 : (nr[i] & ~fullCols);
  return { rows: nr, lines, fullRows, fullCols };
}
export function popcount(x) { let n = 0; while (x) { x &= x - 1; n++; } return n; }
export function filledCount(rows) { return rows.reduce((a, x) => a + popcount(x), 0); }
export function fitsAnywhere(rows, s) {
  for (let r = 0; r + s.h <= N; r++) for (let c = 0; c + s.wd <= N; c++) if (canPlaceRows(rows, s, r, c)) return true;
  return false;
}
// 這幾塊（任意順序）是不是全部放得完；budget 防極端情況算太久（用完就當作放得完）
export function allPlaceable(rows, shapes, budget = { n: 40000 }) {
  if (!shapes.length) return true;
  const seen = new Set();
  for (let k = 0; k < shapes.length; k++) {
    const s = shapes[k];
    if (seen.has(s.id)) continue; seen.add(s.id);
    const rest = shapes.filter((_, j) => j !== k);
    for (let r = 0; r + s.h <= N; r++) for (let c = 0; c + s.wd <= N; c++) {
      if (!canPlaceRows(rows, s, r, c)) continue;
      if (--budget.n <= 0) return true;
      if (allPlaceable(placeRows(rows, s, r, c).rows, rest, budget)) return true;
    }
  }
  return false;
}
// 這個形狀放在盤面某處最多能消幾條（出「幫忙塊」用）
function bestLines(rows, s) {
  let best = 0;
  for (let r = 0; r + s.h <= N; r++) for (let c = 0; c + s.wd <= N; c++)
    if (canPlaceRows(rows, s, r, c)) { const L = placeRows(rows, s, r, c).lines; if (L > best) best = L; }
  return best;
}

// ── 出塊 ──
// 原版沒公開演算法（玩家傳聞「會幫你」「分數高會變難」都沒證據）。這裡照多數復刻版做法：
//   1) 依形狀機率抽三塊；盤面越滿越偏小塊、難度越高越常出大塊
//   2) 有機率塞一塊「放下去剛好能消行」的幫忙塊（原版那種「欸剛好！」的爽感）
//   3) 檢查三塊有沒有某種順序全部放得完，沒有就重抽；難度越高重抽次數越少 → 越後面越容易被卡死
// d = 難度 0~1
export function dealTray(rows, d, rng, opts = {}) {
  const fill = filledCount(rows) / (N * N);
  const weights = SHAPES.map(s => {
    let w = s.w;
    if (s.tier === 2) w *= 0.55 + 1.3 * d;
    if (s.tier === 0) w *= Math.max(0.35, 1.15 - 0.6 * d);
    if (fill > 0.4) { if (s.tier === 2) w *= Math.max(0.2, 1 - (fill - 0.4) * 2.2); if (s.tier === 0) w *= 1 + (fill - 0.4) * 2; }
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const pick = () => { let x = rng() * total; for (let i = 0; i < SHAPES.length; i++) { x -= weights[i]; if (x <= 0) return SHAPES[i]; } return SHAPES[0]; };
  const pHelp = opts.pHelp ?? Math.max(0.08, 0.5 - 0.4 * d);
  // 「公平檢查」：有 pFair 的機率保證三塊放得完（重抽 24 次），其餘時候純隨機 → 難度是慢慢變難，不會撞牆
  const pFair = opts.pFair ?? (1 - 0.8 * Math.min(1, d));
  const tries = opts.tries ?? (rng() < pFair ? 24 : 1);
  // 幫忙塊候選：放了能消行的形狀（多條優先）
  let helpers = null;
  const helper = () => {
    if (!helpers) {
      helpers = [];
      for (const s of SHAPES) { const L = bestLines(rows, s); if (L) helpers.push([s, L * L * s.w]); }
    }
    if (!helpers.length) return null;
    let x = rng() * helpers.reduce((a, h) => a + h[1], 0);
    for (const [s, w] of helpers) { x -= w; if (x <= 0) return s; }
    return helpers[0][0];
  };
  let last = null;
  for (let t = 0; t < Math.max(1, tries); t++) {
    const tri = [pick(), pick(), pick()];
    if (rng() < pHelp) { const h = helper(); if (h) tri[Math.floor(rng() * 3)] = h; }
    last = tri;
    if (allPlaceable(rows, tri)) return tri;
  }
  return last;
}

// ── 冒險關卡 ──
// 原版：雨林主題、收集物品、每關自己的盤面設計；細節（步數限制、關卡數、難度曲線）查不到可靠資料
// 這裡的設計：開局預擺方塊（部分帶寶石）、目標＝收集寶石或達到分數、沒有步數限制（跟經典一樣放不下就輸）
// 盤面字元：. 空格  # 普通方塊  r/b/g/y 帶寶石的方塊
const TEMPLATES = [
  // 1 教學：底下兩排缺一格
  ["........", "........", "........", "........", "........", "........", "##r##.##", "#r###.r#"],
  // 2 兩側柱子
  ["........", "#......#", "r......r", "#......#", "#......#", "r......r", "#......#", "........"],
  // 3 金字塔
  ["........", "........", "........", "...rr...", "..####..", ".##rr##.", "#######.", "........"],
  // 4 愛心
  ["........", ".##..##.", "#rr##rr#", "#r####r#", ".######.", "..####..", "...##...", "........"],
  // 5 樓梯（分數關）
  ["#.......", "##......", "#r#.....", "##r#....", "#r##r...", "##r##r..", "#r##r##.", "........"],
  // 6 外框
  ["##r##r#.", "#......#", "r......#", "#......r", "#......#", "r......#", "#......#", ".#r##r##"],
  // 7 十字
  ["...##...", "...rr...", "...##...", "##r..r##", "##r..r##", "...##...", "...rr...", "...##..."],
  // 8 笑臉
  ["..####..", ".#....#.", "#.r..r.#", "#......#", "#.#..#.#", "#..rr..#", ".#....#.", "..####.."],
  // 9 對角線
  ["r.......", "#r......", ".#r.....", "..#r....", "....r#..", ".....r#.", "......r#", ".......r"],
  // 10 下半棋盤格（分數關）
  ["........", "........", "........", "........", "#.#.#.#.", ".r.#.r.#", "#.#.#.#.", ".#.#.#.#"],
];

export const LEVEL_COUNT = 60;
// 關卡難度旋鈕（tools/bb-test/sim.mjs adventure 用電腦對打調出來的）
export const LV = { d0: 0.05, d1: 0.46, score0: 800, score1: 330, score2: 2, extra0: 2, extra1: 8, dens0: 0.16, dens1: 0.14 };   // 分數關目標 = score0 + score1×n − score2×n²（後段放緩）
// 關卡 n（1 起算）的設定：同一關每次都一樣（用 n 當種子）
export function levelDef(n, daily = 0) {
  n = Math.min(LEVEL_COUNT, Math.max(1, Math.round(+n) || 1));   // 防呆：夾在 1..60 的整數
  const rng = makeRng(daily ? daily * 2654435761 % 4294967291 : n * 7919 + 13);
  const t = (n - 1) / (LEVEL_COUNT - 1);                 // 0 → 1
  const d = LV.d0 + LV.d1 * t;                           // 出塊難度
  // 寶石種類：前 4 關 1 種，前 20 關 2 種，之後 3 種
  const nTypes = n <= 4 ? 1 : n <= 20 ? 2 : 3;
  const types = shuffle(GEMS.slice(), rng).slice(0, nTypes);
  const scoreLevel = !daily && n % 5 === 0;               // 每 5 關一關「分數關」（每日挑戰固定收寶石）
  // 盤面：前 10 關用模板（依序）、之後模板與隨機鏡像圖案輪流；每日挑戰隨機挑
  let rowsTpl;
  if (!daily && n <= TEMPLATES.length) rowsTpl = TEMPLATES[n - 1];
  else if (daily ? rng() < 0.5 : n % 2 === 0) rowsTpl = TEMPLATES[1 + Math.floor(rng() * (TEMPLATES.length - 1))];
  else rowsTpl = randomPattern(rng, LV.dens0 + LV.dens1 * t, 0.12 + 0.08 * t);
  const grid = newGrid();
  let gemOnBoard = 0;
  // 圖案用一個主色＋一個配色拼（全部亂色時愛心、笑臉認不出來）
  const kMain = Math.floor(rng() * COLORS), kAlt = (kMain + 2 + Math.floor(rng() * 4)) % COLORS;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const ch = rowsTpl[r][c];
    if (ch === ".") continue;
    let gem = null;
    if (ch !== "#" && !scoreLevel) { gem = types[(r * 3 + c) % types.length]; gemOnBoard++; }
    grid[r][c] = { k: rng() < 0.72 ? kMain : kAlt, gem };
  }
  breakFullLines(grid, rng);
  const goals = [];
  if (scoreLevel) {
    goals.push({ t: "score", need: Math.round((LV.score0 + LV.score1 * n - LV.score2 * n * n) / 50) * 50 });
  } else {
    // 每種寶石要收集的數量：盤面上的 + 從新方塊身上要收的
    const per = {}; types.forEach(g => per[g] = 0);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const x = grid[r][c]; if (x && x.gem) per[x.gem]++; }
    const extra = Math.round(LV.extra0 + LV.extra1 * t);
    types.forEach(g => goals.push({ t: "gem", gem: g, need: per[g] + extra + Math.floor(rng() * 3) }));
  }
  return { n: daily || n, d, grid, goals, gemRate: scoreLevel ? 0 : 0.34 - 0.1 * t, types };
}
// ── 每日挑戰：日期當種子（同一天每次開都一樣），難度在冒險第 14~30 關之間 ──
export function dateKey(d = new Date()) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
export function dailyDef(key) {
  key = Math.round(+key) || dateKey();
  return levelDef(14 + (key * 37 % 17), key);
}
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// 左右對稱的隨機圖案（看起來像設計過的）；density = 方塊比例、gemP = 方塊帶寶石的比例
function randomPattern(rng, density, gemP) {
  const out = [];
  for (let r = 0; r < N; r++) {
    let half = "";
    for (let c = 0; c < N / 2; c++) half += rng() < density * (0.6 + r / N) ? (rng() < gemP / density ? "r" : "#") : ".";
    out.push(half + [...half].reverse().join(""));
  }
  return out;
}
// 開局不能有整條滿的（會一開始就消）：每條滿的挖掉一格（優先挖沒寶石的）
function breakFullLines(grid, rng) {
  for (let guard = 0; guard < 32; guard++) {
    const rows = gridRows(grid);
    let fixed = false;
    for (let r = 0; r < N && !fixed; r++) if (rows[r] === FULL) { digOne(grid, [...Array(N).keys()].map(c => [r, c]), rng); fixed = true; }
    let colAnd = FULL; rows.forEach(x => colAnd &= x);
    for (let c = 0; c < N && !fixed; c++) if (colAnd >> c & 1) { digOne(grid, [...Array(N).keys()].map(r => [r, c]), rng); fixed = true; }
    if (!fixed) return;
  }
}
function digOne(grid, cells, rng) {
  const plain = cells.filter(([r, c]) => grid[r][c] && !grid[r][c].gem);
  const pool = plain.length ? plain : cells;
  const [r, c] = pool[Math.floor(rng() * pool.length)];
  grid[r][c] = null;
}

// ── 經典模式開局盤面：原版 9.6.8 一開局就預擺一片同色方塊（影片實例 35 格，塊狀團塊、沒有整條滿的、好幾條差 1~2 格）──
// 這些格子標 pat:true，全部消光時「Pattern Finished!」
export const START = { min: 30, max: 38, seeds: 7 };
export function startPattern(rng) {
  const grid = newGrid(), k = Math.floor(rng() * COLORS);
  const target = START.min + Math.floor(rng() * (START.max - START.min + 1));
  const filled = [];
  const add = (r, c) => { if (r < 0 || c < 0 || r >= N || c >= N || grid[r][c]) return false; grid[r][c] = { k, gem: null, pat: true }; filled.push([r, c]); return true; };
  for (let i = 0; i < START.seeds; i++) add(Math.floor(rng() * N), Math.floor(rng() * N));
  for (let guard = 0; filled.length < target && guard < 2000; guard++) {
    // 從已有的格子往旁邊長（長成一團一團）；偶爾另起一團
    if (rng() < 0.08) { add(Math.floor(rng() * N), Math.floor(rng() * N)); continue; }
    const [r, c] = filled[Math.floor(rng() * filled.length)];
    const d = [[0, 1], [1, 0], [0, -1], [-1, 0]][Math.floor(rng() * 4)];
    add(r + d[0], c + d[1]);
  }
  breakFullLines(grid, rng);
  return grid;
}

// 經典模式難度：放了 start 塊之後開始變難，再過 span 塊到 1（之後最多到 max）
export const DIFF = { start: 30, span: 600, max: 1.3 };

// ── 一局遊戲 ──
// opts: { mode: "classic"|"adventure", level: n, seed, saved }
export function createGame(opts = {}) {
  const m0 = opts.saved ? opts.saved.mode : opts.mode;
  const mode = m0 === "adventure" || m0 === "daily" ? m0 : "classic";
  const rng = makeRng(opts.seed ?? (Math.random() * 2 ** 32));
  const lvNo = opts.saved ? opts.saved.level : opts.level;
  const lv = mode === "adventure" ? levelDef(lvNo) : mode === "daily" ? dailyDef(lvNo) : null;   // daily 的 level = 日期 20261015
  const S = {
    mode, level: lv ? lv.n : 0,
    grid: lv ? lv.grid : opts.empty ? newGrid() : startPattern(rng),
    tray: [null, null, null],
    score: 0, combo: 0, sinceClear: 0, moves: 0,
    goals: lv ? lv.goals.map(g => ({ ...g, got: 0 })) : [],
    over: false, won: false,
  };
  if (opts.saved) Object.assign(S, restore(opts.saved));

  // 難度：經典模式隨放的塊數慢慢升；冒險模式看關卡
  const diff = () => lv ? lv.d : Math.min(DIFF.max, Math.max(0, (S.moves - DIFF.start) / DIFF.span));
  function refill() {
    const tri = dealTray(gridRows(S.grid), diff(), rng);
    S.tray = tri.map(s => {
      const p = { id: s.id, k: Math.floor(rng() * COLORS), gems: null };
      // 冒險模式：新方塊身上有機率帶還沒收齊的寶石
      if (lv && lv.gemRate) {
        const need = S.goals.filter(g => g.t === "gem" && g.got < g.need).map(g => g.gem);
        if (need.length && rng() < lv.gemRate) {
          p.gems = s.cells.map(() => null);
          const nGem = s.n >= 4 && rng() < 0.35 ? 2 : 1;
          for (let i = 0; i < nGem; i++) p.gems[Math.floor(rng() * s.n)] = need[Math.floor(rng() * need.length)];
        }
      }
      return p;
    });
  }
  function slotShape(i) { const p = S.tray[i]; return p ? SHAPE_BY_ID[p.id] : null; }
  function canPlace(i, r, c) { const s = slotShape(i); return !!s && !S.over && !S.won && canPlaceRows(gridRows(S.grid), s, r, c); }
  // 預覽：放在 (r,c) 會消哪些列／欄（拖曳時高亮用）
  function preview(i, r, c) {
    if (!canPlace(i, r, c)) return null;
    const res = placeRows(gridRows(S.grid), slotShape(i), r, c);
    return { rows: bitsToList(res.fullRows), cols: bitsToList(res.fullCols) };
  }
  function anyMove() { const rows = gridRows(S.grid); return S.tray.some(p => p && fitsAnywhere(rows, SHAPE_BY_ID[p.id])); }
  function goalsDone() { return S.goals.length > 0 && S.goals.every(g => (g.t === "score" ? S.score : g.got) >= g.need); }

  // 放下：回傳這一步發生的所有事（畫面照著播動畫）
  function place(i, r, c) {
    if (!canPlace(i, r, c)) return null;
    const p = S.tray[i], s = SHAPE_BY_ID[p.id];
    const placed = s.cells.map(([dr, dc], j) => {
      const cell = { k: p.k, gem: p.gems ? p.gems[j] : null };
      S.grid[r + dr][c + dc] = cell;
      return { r: r + dr, c: c + dc };
    });
    S.tray[i] = null;
    // 方塊已寫進 grid，直接看哪些列／欄滿了
    const rowsNow = gridRows(S.grid);
    let fullRows = 0, fullCols = FULL;
    for (let k = 0; k < N; k++) { if (rowsNow[k] === FULL) fullRows |= 1 << k; fullCols &= rowsNow[k]; }
    const clearRows = bitsToList(fullRows), clearCols = bitsToList(fullCols);
    const lines = clearRows.length + clearCols.length;
    const cleared = [];
    const gems = {};
    if (lines) {
      for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
        if (!((fullRows >> rr & 1) || (fullCols >> cc & 1))) continue;
        const x = S.grid[rr][cc];
        if (!x) continue;
        cleared.push({ r: rr, c: cc, k: x.k, gem: x.gem, pat: !!x.pat });
        if (x.gem) gems[x.gem] = (gems[x.gem] || 0) + 1;
        S.grid[rr][cc] = null;
      }
    }
    // 連擊：消到就 +1；連續 comboGrace 塊沒消就歸零
    if (lines) { S.combo += 1; S.sinceClear = 0; }
    else if (++S.sinceClear >= SCORE.comboGrace) S.combo = 0;
    const allClear = lines > 0 && S.grid.every(row => row.every(x => !x));
    // 開局圖案的最後一格被消掉 → Pattern Finished!
    const patternDone = cleared.some(x => x.pat) && !S.grid.some(row => row.some(x => x && x.pat));
    const pts = scoreMove(s.n, lines, S.combo, allClear, patternDone);
    S.score += pts.total;
    S.moves++;
    for (const g of S.goals) if (g.t === "gem" && gems[g.gem]) g.got = Math.min(g.need, g.got + gems[g.gem]);
    let refilled = false;
    if (goalsDone()) S.won = true;
    else {
      if (S.tray.every(x => !x)) { refill(); refilled = true; }
      if (!anyMove()) S.over = true;
    }
    return { placed, clearRows, clearCols, lines, cleared, gems, pts, combo: S.combo, comboShown: comboShown(S.combo), praise: praiseFor(lines), allClear, patternDone, refilled, over: S.over, won: S.won };
  }

  function serialize() {
    return JSON.parse(JSON.stringify({ mode: S.mode, level: S.level, grid: S.grid, tray: S.tray, score: S.score, combo: S.combo, sinceClear: S.sinceClear, moves: S.moves, goals: S.goals, over: S.over, won: S.won }));
  }
  // 還原存檔：格式不對就丟例外（畫面那邊接住後改開新局），缺的數字欄位補 0
  function restore(raw) {
    const o = JSON.parse(JSON.stringify(raw));   // 複製一份，不改到呼叫端的物件
    const okGem = g => g === null || g === undefined || GEMS.includes(g);
    const okCell = x => x === null || (x && Number.isInteger(x.k) && x.k >= 0 && x.k < COLORS && okGem(x.gem));
    if (!Array.isArray(o.grid) || o.grid.length !== N || !o.grid.every(row => Array.isArray(row) && row.length === N && row.every(okCell))) throw new Error("bad save: grid");
    const okPiece = p => p === null || (p && SHAPE_BY_ID[p.id] && Number.isInteger(p.k) && p.k >= 0 && p.k < COLORS &&
      (p.gems == null || (Array.isArray(p.gems) && p.gems.length === SHAPE_BY_ID[p.id].n && p.gems.every(okGem))));
    if (!Array.isArray(o.tray) || o.tray.length !== 3 || !o.tray.every(okPiece)) throw new Error("bad save: tray");
    const num = v => Number.isFinite(v) ? v : 0;
    return { grid: o.grid, tray: o.tray, score: num(o.score), combo: num(o.combo), sinceClear: num(o.sinceClear), moves: num(o.moves),
      goals: Array.isArray(o.goals) && (mode === "classic" || o.goals.length) ? o.goals : S.goals, over: !!o.over, won: !!o.won };
  }

  if (!opts.saved) refill();
  else if (S.tray.every(x => !x) && !S.over && !S.won) refill();
  return { S, place, canPlace, preview, slotShape, anyMove, serialize, diff };
}
function bitsToList(m) { const a = []; for (let i = 0; i < N; i++) if (m >> i & 1) a.push(i); return a; }
