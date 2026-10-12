// ===================== 注音戰鬥陀螺：對戰物理（確定性、純函式、無 DOM／Three.js） =====================
// 俯視 2D：碗形場地（往中心拉的力與離中心距離成正比＝拋物面碗）、陀螺繞場、碰撞、轉速衰減、撞出場。
// 確定性：亂數種子＝兩句詞句的雜湊（照字典順序排好再算，A 打 B 跟 B 打 A 結果一樣）；固定步長 1/60 秒；
//   只用 + − × ÷ 和 Math.sqrt（IEEE 754 保證每台機器算出一樣的位元），不用 sin／cos／exp（各家瀏覽器實作可能差最後一位，
//   混沌系統會放大成不同勝負）。畫面（js/zhuyin-tops.js）只「播放」這裡算好的軌跡。
// 能力影響（規格 §3）：重量＝質量（也略大顆）、穩定＝轉速衰減慢＋比較不亂晃、攻擊＝碰撞時給對方的推力與轉速傷害、防禦＝被撞時的抵抗。
import { hashStr, rhymeOf, splitSyl, ANIMALS, COLORS, STRONG } from "./zhuyin-tops-power.js?v=1";   // ?v=1：跟 js/zhuyin-tops.js 的 import 網址完全一樣（同一份模組）

export const SIM = {
  DT: 1 / 60, MAX: 720,          // 每回合最長 12 秒（超時比剩餘轉速）
  R_OUT: 5.2,                    // 碗口半徑：中心離開這麼遠＝撞出場
  K: 1.6,                        // 往中心拉的力（碗的斜度）
  ORBIT_V: 0.9, ORBIT_G: 1.3,    // 轉速帶來的繞場：目標繞行速度（×剩餘轉速）與追上它的快慢（陀螺在碗裡會一直繞）
  FRICTION: 0.25,                // 速度阻尼（每秒）
  JITTER: 1.8,                   // 亂晃（穩定越高越小）
  E: 0.75,                       // 碰撞恢復係數
  BURST: 5.5,                    // 攻擊推力
  RUB: 0.9,                      // 兩顆都在轉，擦撞時的側向甩力
  DMG: 0.06,                    // 碰撞轉速傷害
  DECAY: 0.055, DECAY_UNSTABLE: 0.04,   // 每秒轉速衰減：穩定 99 → 0.055、穩定 1 → 0.095
  S_MIN: 0.03,                   // 轉速低於這個＝停下來（倒了）
  LAUNCH: 0.7,                   // 發射轉速 0.65～1.35（運氣，讓弱的也有機會贏）
  SEEK: 3,                     // 追對手的力（×攻擊×轉速）
  COOLDOWN: 6,                   // 同一對陀螺兩次碰撞至少隔幾步
  LUCK0: 0.35, LUCK: 1.3,        // 每次碰撞的運氣倍率（0.35～1.65）：弱的也有機會贏
};

// 一般 mulberry32
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 能力 → 物理參數（能力 1–99）
export function topParams(st) {
  const w = st[0] / 99, s = st[1] / 99, a = st[2] / 99, d = st[3] / 99;
  return { m: 0.7 + 1.1 * w, r: 0.5 + 0.2 * w, stab: s, atk: a, def: d, decay: SIM.DECAY + SIM.DECAY_UNSTABLE * (1 - s), jit: SIM.JITTER * (1.15 - 0.85 * s) };
}

// 一回合：sa／sb＝兩顆的能力；回傳 { n（步數）, f（每步 [x0,y0,S0,x1,y1,S1]）, hits:[{k,x,y,s}], end:{k, loser:0|1, how:"out"|"stop"|"time"}, p:[參數] }
export function simRound(sa, sb, seed) {
  const rnd = rng(seed), P = [topParams(sa), topParams(sb)], dt = SIM.DT;
  const x = [-2.6 + (rnd() - 0.5) * 0.6, 2.6 + (rnd() - 0.5) * 0.6], y = [(rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2];
  const vx = [1.8 + rnd() * 1.0, -1.8 - rnd() * 1.0], vy = [-1.4 - rnd() * 1.2, 1.4 + rnd() * 1.2];   // 對衝＋各自往側邊甩（發射的弧線）
  const S = [1 - SIM.LAUNCH / 2 + SIM.LAUNCH * rnd(), 1 - SIM.LAUNCH / 2 + SIM.LAUNCH * rnd()];   // 發射力道（運氣）
  const f = new Float64Array((SIM.MAX + 1) * 6), hits = [];
  let cool = 0, end = null, k = 0;
  const rec = i => { f[i * 6] = x[0]; f[i * 6 + 1] = y[0]; f[i * 6 + 2] = S[0]; f[i * 6 + 3] = x[1]; f[i * 6 + 4] = y[1]; f[i * 6 + 5] = S[1]; };
  rec(0);
  for (k = 1; k <= SIM.MAX; k++) {
    for (let i = 0; i < 2; i++) {
      const p = P[i], d = Math.sqrt(x[i] * x[i] + y[i] * y[i]);
      let ax = -SIM.K * x[i], ay = -SIM.K * y[i];
      if (d > 1e-6) {                // 切線方向：拉向「目標繞行速度」（越靠中心越慢）
        const tx = -y[i] / d, ty = x[i] / d, vt = vx[i] * tx + vy[i] * ty, want = SIM.ORBIT_V * S[i] * (d < 2 ? d / 2 : 1);
        ax += tx * SIM.ORBIT_G * (want - vt); ay += ty * SIM.ORBIT_G * (want - vt);
      }
      ax += (rnd() - 0.5) * p.jit; ay += (rnd() - 0.5) * p.jit;
      const ox = x[1 - i] - x[i], oy = y[1 - i] - y[i], od = Math.sqrt(ox * ox + oy * oy);   // 攻擊型會去追對手
      if (od > 1e-6) { const sk = SIM.SEEK * (0.3 + p.atk) * S[i]; ax += ox / od * sk; ay += oy / od * sk; }
      vx[i] += ax * dt; vy[i] += ay * dt;
      const fr = 1 - SIM.FRICTION * dt; vx[i] *= fr; vy[i] *= fr;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt;
      S[i] -= p.decay * dt;
    }
    // 碰撞
    if (cool > 0) cool--;
    const dx = x[1] - x[0], dy = y[1] - y[0], dist = Math.sqrt(dx * dx + dy * dy), minD = P[0].r + P[1].r;
    if (dist < minD && dist > 1e-9) {
      const nx = dx / dist, ny = dy / dist, m0 = P[0].m, m1 = P[1].m, ov = minD - dist;
      x[0] -= nx * ov * m1 / (m0 + m1); y[0] -= ny * ov * m1 / (m0 + m1); x[1] += nx * ov * m0 / (m0 + m1); y[1] += ny * ov * m0 / (m0 + m1);
      const rvn = (vx[1] - vx[0]) * nx + (vy[1] - vy[0]) * ny;
      if (rvn < 0 && cool === 0) {
        const j = -(1 + SIM.E) * rvn / (1 / m0 + 1 / m1);
        vx[0] -= j * nx / m0; vy[0] -= j * ny / m0; vx[1] += j * nx / m1; vy[1] += j * ny / m1;
        const luck0 = SIM.LUCK0 + SIM.LUCK * rnd(), luck1 = SIM.LUCK0 + SIM.LUCK * rnd();   // 每一下撞得準不準（運氣）
        const b01 = SIM.BURST * (0.2 + P[0].atk) * (0.4 + 0.6 * S[0]) * (1 - 0.55 * P[1].def) * luck0;   // 0 推 1
        const b10 = SIM.BURST * (0.2 + P[1].atk) * (0.4 + 0.6 * S[1]) * (1 - 0.55 * P[0].def) * luck1;
        vx[1] += nx * b01 / m1; vy[1] += ny * b01 / m1; vx[0] -= nx * b10 / m0; vy[0] -= ny * b10 / m0;
        const rub = SIM.RUB * (S[0] + S[1]) * 0.5, tx = -ny, ty = nx;
        vx[0] += tx * rub / m0; vy[0] += ty * rub / m0; vx[1] -= tx * rub / m1; vy[1] -= ty * rub / m1;
        const sp = -rvn > 6 ? 1 : -rvn / 6;
        const mr = Math.sqrt(m0 / m1);   // 重的撞輕的傷害大
        const d1 = SIM.DMG * (0.25 + P[0].atk) * (0.5 + 0.5 * S[0]) * (1 - 0.6 * P[1].def) * (0.5 + sp) * mr * luck0;
        const d0 = SIM.DMG * (0.25 + P[1].atk) * (0.5 + 0.5 * S[1]) * (1 - 0.6 * P[0].def) * (0.5 + sp) / mr * luck1;
        S[0] -= d0; S[1] -= d1;
        hits.push({ k, x: (x[0] + x[1]) / 2, y: (y[0] + y[1]) / 2, s: sp > 0.15 ? sp : 0.15 });
        cool = SIM.COOLDOWN;
      }
    }
    if (S[0] < 0) S[0] = 0;
    if (S[1] < 0) S[1] = 0;
    rec(k);
    // 結束判定：撞出場 > 停下來（同一步兩顆都出事：離中心遠的／轉速低的輸）
    const o0 = x[0] * x[0] + y[0] * y[0], o1 = x[1] * x[1] + y[1] * y[1], R2 = SIM.R_OUT * SIM.R_OUT;
    if (o0 > R2 || o1 > R2) { end = { k, loser: o0 > R2 && o1 > R2 ? (o0 >= o1 ? 0 : 1) : (o0 > R2 ? 0 : 1), how: "out" }; break; }
    if (S[0] <= SIM.S_MIN || S[1] <= SIM.S_MIN) { end = { k, loser: S[0] <= S[1] ? 0 : 1, how: "stop" }; break; }
  }
  if (!end) { k = SIM.MAX; end = { k, loser: S[0] < S[1] ? 0 : S[1] < S[0] ? 1 : (rnd() < 0.5 ? 0 : 1), how: "time" }; }
  return { n: end.k, f: f.subarray(0, (end.k + 1) * 6), hits, end, p: P };
}

// ===== 加成在對戰裡看得見（10-12 櫻木）：觸發加成的那幾個字，對戰時某項能力 +N（上限 99） =====
// 只改對戰用的能力（傳進 simulateMatch 的 stats）；整句戰力照 zhuyin-tops-power.js 算（後端排行不受影響）。
// 加成只看詞句本身＝同一場對戰照樣確定性（A 打 B＝B 打 A：兩隊各自套自己的加成）。
// [能力（0 重量／1 穩定／2 攻擊／3 防禦）, +N]
export const BOOST = { double: [1, 8], rhyme: [3, 8], tone: [0, 8], animal: [2, 10], color: [3, 10], strong: [2, 10] };
// 哪幾個字觸發了哪個加成：pw＝powerOf() 的結果（用它的 bonuses 決定有哪些加成、perChar 的主要讀音判押韻／聲調，跟戰力公式一致）
// 回傳 { 加成 id: [字的位置…] }
export function bonusHits(pw) {
  const out = {}, pc = pw.perChar, n = pc.length;
  for (const b of pw.bonuses) {
    const idx = [];
    if (b.id === "double") { for (let i = 1; i < n; i++) if (pc[i].ch === pc[i - 1].ch) { if (!idx.includes(i - 1)) idx.push(i - 1); idx.push(i); } }
    else if (b.id === "rhyme") {
      const cnt = {}; let best = "", bn = 0;
      for (const c of pc) { const r = rhymeOf(c.z); if (r) { cnt[r] = (cnt[r] || 0) + 1; if (cnt[r] > bn) { bn = cnt[r]; best = r; } } }
      pc.forEach((c, i) => { if (best && rhymeOf(c.z) === best) idx.push(i); });
    } else if (b.id === "tone") {
      let run = 0, prev = 0, from = 0, bestFrom = 0, bestLen = 0;
      pc.forEach((c, i) => { const sp = splitSyl(c.z), t = sp ? sp.tone : 0; if (t && t === prev) run++; else { run = t ? 1 : 0; from = i; } prev = t; if (run > bestLen) { bestLen = run; bestFrom = from; } });
      for (let i = bestFrom; i < bestFrom + bestLen; i++) idx.push(i);
    } else {
      const set = b.id === "animal" ? ANIMALS : b.id === "color" ? COLORS : b.id === "strong" ? STRONG : "";
      pc.forEach((c, i) => { if (set.indexOf(c.ch) >= 0) idx.push(i); });
    }
    if (idx.length) out[b.id] = idx;
  }
  return out;
}
// 能力表＋加成 → 對戰用的能力（新陣列，不動原本的）
export function boostStats(stats, hits) {
  const out = stats.map(s => s.slice());
  for (const id in hits) { const B = BOOST[id]; if (!B) continue; for (const i of hits[id]) if (out[i]) out[i][B[0]] = Math.min(99, out[i][B[0]] + B[1]); }
  return out;
}

// 一場：5 回合一對一（第 1 字對第 1 字…），先贏 3 回合的獲勝（贏到 3 就不打了）
// a／b＝{ p: 詞句, stats: [[w,s,a,d] × 5] }；回傳 { flip（sim 的 0 號是不是 b）, rounds:[{ i, winner:"a"|"b", how, sim }], winner, score:[a 勝, b 勝] }
export function simulateMatch(a, b) {
  const flip = b.p < a.p, s0 = flip ? b : a, s1 = flip ? a : b;
  const rounds = [], score = [0, 0];
  for (let i = 0; i < 5 && score[0] < 3 && score[1] < 3; i++) {
    const sim = simRound(s0.stats[i], s1.stats[i], hashStr(s0.p + "|" + s1.p + "|" + i));
    const loserSide = sim.end.loser === 0 ? (flip ? "b" : "a") : (flip ? "a" : "b"), winner = loserSide === "a" ? "b" : "a";
    score[winner === "a" ? 0 : 1]++;
    rounds.push({ i, winner, how: sim.end.how, sim });
  }
  return { flip, rounds, winner: score[0] >= 3 ? "a" : "b", score };
}
