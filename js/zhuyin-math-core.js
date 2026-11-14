// ===================== 注音小島：數學島出題核心（v10；docs/zhuyin-math-plan.md §4）=====================
// 兩款共用：🍎 水果籃算算看（kind "fruit"）、🐸 青蛙跳荷葉（kind "hop"）。1～5 級 10 以內加減；6～10 級＝一年級（20 以內進位／退位、100 以內，見 docs §7）。
// makeRound(kind, lv, n=10, rnd) → n 題 [{ op: "+"|"-", a, b, c, ask: "c"|"b", ans, choices }]
//   ask＝"c"：問結果（a ± b ＝ ？）；ask＝"b"：問跳幾下（荷葉 Lv5：a ＋ ？＝ c）。ans＝要答的那個數。
//   choices：水果答案鈕／荷葉 Lv5 數字鈕＝正確答案＋兩個 ±1～2 的干擾（不重複、在合理範圍內），已打亂；荷葉 Lv1～4 點荷葉回答（choices＝null）
// 規則：順序不同算不同題（3＋2、2＋3 是兩題）；同一局不重複；混合級加減各至少 3 題；不連續 3 題同答案；
//   Lv1～2 不出 0；Lv3 以上一局最多 1 題含 0。題庫不夠 → 丟錯（不偷偷放寬規則）。
// 水果故事裡「籃子裡有零顆」「又掉進零顆」「拿走零顆」不自然 → 水果的 0 只會出現在「全部拿走、剩 0 顆」；荷葉可以從 0 出發、跳回 0。

export const LV_MAX = 10;                              // 11-14 v11：6～10 級＝一年級（20 以內進位／退位、100 以內）
export const VOICE_LV_MAX = 5;                         // 6 級以上不念題目、不念算式（阿葉 11-14：不要那麼多配音，看畫面就懂）；沒錄音的句子不要丟給系統語音
export const N_DEFAULT = 10;
const ZH = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
export const numZh = n => (n <= 10 ? ZH[n] : n < 20 ? "十" + ZH[n - 10] : n === 100 ? "一百" : ZH[Math.floor(n / 10)] + "十" + (n % 10 ? ZH[n % 10] : ""));                         // 算式、荷葉號碼：念「二」
export const qtyZh = n => (n === 2 ? "兩" : ZH[n]);      // 量詞前（兩顆、兩下）：念「兩」
export const eqText = q => `${numZh(q.a)}${q.op === "+" ? "加" : "減"}${numZh(q.b)}等於${numZh(q.c)}`;   // 答對念的整句（一定念）
export const eqShow = q => (q.ask === "b" ? `${q.a} ＋ ？ ＝ ${q.c}` : `${q.a} ${q.op === "+" ? "＋" : "－"} ${q.b} ＝ ？`);

// 每一級的題庫條件（f＝{ op, a, b, c }）。range＝新範圍的題至少要佔幾題（讓高一級真的比較難）
const SPEC = {
  fruit: {
    1: { ops: ["+"], ok: f => f.a >= 1 && f.b >= 1 && f.c <= 5 },
    2: { ops: ["+"], ok: f => f.a >= 1 && f.b >= 1 && f.c <= 10, range: { min: 5, f: f => f.c >= 6 } },
    3: { ops: ["-"], ok: f => f.a >= 1 && f.b >= 1 && f.a <= 10 },
    4: { ops: ["+", "-"], ok: f => f.a >= 1 && f.b >= 1 },
    5: { ops: ["+", "-"], ok: f => f.a >= 1 && f.b >= 1 },
    // ---- 一年級（11-14）：兩盒十格（0～20）；Lv10 一箱十顆（100 以內、不進位不退位）----
    6: { ops: ["+"], facts: () => F20.filter(f => f.op === "+" && f.a >= 10 && f.a <= 18 && f.b >= 1 && f.b <= 9 && f.c <= 20) },            // 十幾加幾（12＋5）
    7: { ops: ["+"], facts: () => F20.filter(f => carry(f)) },                                                                              // 進位加法（8＋5：先把第一盒放滿）
    8: { ops: ["-"], facts: () => F20.filter(f => f.op === "-" && f.a >= 11 && f.b >= 1 && f.b <= 9), mins: [{ min: 6, f: f => borrow(f) }] },   // 十幾減幾，退位至少 6 題（13－5）
    9: { ops: ["+", "-"], facts: () => [...SPEC.fruit[6].facts(), ...SPEC.fruit[7].facts(), ...SPEC.fruit[8].facts()], mins: [{ min: 5, f: f => carry(f) || borrow(f) }] },
    10: { ops: ["+", "-"], facts: () => [...TENS, ...ONES], mins: [{ min: 3, f: f => isTens(f) }, { min: 3, f: f => !isTens(f) }], big: true },
  },
  hop: {
    1: { ops: ["+"], ok: f => f.b >= 1 && f.b <= 3 && f.a >= 1 },
    2: { ops: ["+"], ok: f => f.b >= 1 && f.b <= 5 && f.a >= 1, range: { min: 4, f: f => f.b >= 4 } },
    3: { ops: ["-"], ok: f => f.b >= 1 && f.b <= 3 },
    4: { ops: ["+", "-"], ok: f => f.b >= 1 && f.b <= 5, range: { min: 3, f: f => f.b >= 4 } },
    5: { ops: ["+"], ok: f => f.b >= 1 && f.b <= 5, ask: "b" },
    // ---- 一年級（11-14）：數線 0～20，畫面一次看 11 片（q.base＝最左邊那片的數字）；Lv10 跳著數（q.step＝一片差多少：2／5／10）----
    6: { ops: ["+"], facts: () => F20.filter(f => f.op === "+" && f.b >= 1 && f.b <= 5 && f.a >= 5), mins: [{ min: 5, f: f => f.a < 10 && f.c > 10 }] },    // 往前跳、跨過 10
    7: { ops: ["-"], facts: () => F20.filter(f => f.op === "-" && f.b >= 1 && f.b <= 5 && f.a >= 8), mins: [{ min: 5, f: f => f.a > 10 && f.c < 10 }] },    // 往回跳、跨過 10
    8: { ops: ["+", "-"], facts: () => F20.filter(f => f.b >= 1 && f.b <= 9 && Math.max(f.a, f.c) >= 11), mins: [{ min: 4, f: f => f.b >= 6 }] },             // 混合、最多跳 9 下
    9: { ops: ["+"], facts: () => F20.filter(f => f.op === "+" && f.b >= 2 && f.b <= 9 && f.c >= 11), ask: "b" },                                         // 要跳幾下（a ＋ ？＝ c）
    10: { ops: ["+", "-"], facts: () => SKIPS, mins: [2, 5, 10].map(k => ({ min: 2, f: f => f.step === k })) },                                          // 2 個、5 個、10 個一數
  },
};

// 所有 0～10 之內的加減式
function allFacts() {
  const out = [];
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) {
    if (a + b <= 10) out.push({ op: "+", a, b, c: a + b });
    if (b <= a) out.push({ op: "-", a, b, c: a - b });
  }
  return out;
}
const FACTS = allFacts();
// 0～20 之內的加減式（一年級 6～9 級用）
const F20 = (() => { const o = []; for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20; b++) { if (a + b <= 20) o.push({ op: "+", a, b, c: a + b }); if (b <= a) o.push({ op: "-", a, b, c: a - b }); } return o; })();
const carry = f => f.op === "+" && f.a >= 2 && f.a <= 9 && f.b >= 2 && f.b <= 9 && f.c >= 11;         // 進位：個位加起來超過 10
const borrow = f => f.op === "-" && f.a >= 11 && f.a <= 18 && f.b >= 2 && f.b <= 9 && f.c <= 9;       // 退位：十幾減幾、剩不到 10
// 水果 Lv10：整十 ± 整十（30＋20、50－20）、二位數 ± 一位數（不進位 34＋5、不退位 38－5）；全部在 10～99
const isTens = f => f.a % 10 === 0 && f.b % 10 === 0;
const TENS = (() => { const o = []; for (let a = 10; a <= 90; a += 10) for (let b = 10; b <= 90; b += 10) { if (a + b <= 90) o.push({ op: "+", a, b, c: a + b }); if (b < a) o.push({ op: "-", a, b, c: a - b }); } return o; })();
const ONES = (() => { const o = []; for (let a = 21; a <= 98; a++) { if (a % 10 === 0) continue; for (let b = 1; b <= 8; b++) { if (a % 10 + b <= 9) o.push({ op: "+", a, b, c: a + b }); if (a % 10 - b >= 1) o.push({ op: "-", a, b, c: a - b }); } } return o; })();
// 荷葉 Lv10：跳著數。荷葉 0、k、2k…10k（11 片）；一下跳一片（＝k），跳 1～5 下。b＝跳的總數（算式 20 ＋ 30），jumps＝幾下
const SKIPS = (() => { const o = []; for (const k of [2, 5, 10]) for (let i = 0; i <= 10; i++) for (let j = 1; j <= 5; j++) { if (i + j <= 10) o.push({ op: "+", a: i * k, b: j * k, c: (i + j) * k, step: k, jumps: j }); if (i - j >= 0) o.push({ op: "-", a: i * k, b: j * k, c: (i - j) * k, step: k, jumps: j }); } return o; })();
const hasZero = f => f.a === 0 || f.b === 0 || f.c === 0;

export function pool(kind, lv) {
  const S = SPEC[kind] && SPEC[kind][lv]; if (!S) throw new Error(`math-core: 沒有 ${kind} Lv${lv}`);
  if (S.facts) return S.facts().filter(f => S.ops.includes(f.op) && (kind !== "fruit" || f.a >= 1 && f.b >= 1));
  return FACTS.filter(f => S.ops.includes(f.op) && S.ok(f) && (lv >= 3 || !hasZero(f)) && (kind !== "fruit" || f.a >= 1 && f.b >= 1));
}

function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// 干擾答案：正確答案 ±1～2，在 [lo, hi] 之內、不重複；靠邊時往另一邊找
export function makeChoices(ans, rnd = Math.random, lo = 0, hi = 10) {
  const inR = v => v >= lo && v <= hi && v !== ans;
  const near = shuffle([ans - 1, ans + 1], rnd).filter(inR), far = shuffle([ans - 2, ans + 2], rnd).filter(inR);
  const pick = near.length ? [near.shift()] : [];         // 一定留一個 ±1（最像的錯）
  const rest = shuffle([...near, ...far], rnd);
  while (pick.length < 2 && rest.length) pick.push(rest.shift());
  for (let d = 3; pick.length < 2 && d <= hi - lo; d++) for (const v of [ans + d, ans - d]) if (pick.length < 2 && inR(v) && !pick.includes(v)) pick.push(v);
  return shuffle([ans, ...pick], rnd);
}

// 水果 Lv10 的干擾：一個差 1（個位算錯）、一個差 10（十位算錯），都在 1～99
export function makeChoicesBig(ans, rnd = Math.random) {
  const inR = v => v >= 1 && v <= 99 && v !== ans;
  const one = shuffle([ans - 1, ans + 1], rnd).filter(inR)[0], ten = shuffle([ans - 10, ans + 10], rnd).filter(inR)[0];
  const pick = [one, ten].filter(v => v !== undefined);
  for (const v of [ans + 2, ans - 2, ans + 20]) if (pick.length < 2 && inR(v) && !pick.includes(v)) pick.push(v);
  return shuffle([ans, ...pick], rnd);
}

function okSeq(list, q) {                                // 不連續 3 題同答案
  const n = list.length; return !(n >= 2 && list[n - 1].ans === q.ans && list[n - 2].ans === q.ans);
}

export function makeRound(kind, lv, n = N_DEFAULT, rnd = Math.random) {
  const S = SPEC[kind][lv], P = pool(kind, lv), ask = S.ask || "c";
  if (P.length < n) throw new Error(`math-core: ${kind} Lv${lv} 題庫只有 ${P.length} 題，不夠 ${n} 題`);
  const mixed = S.ops.length === 2, zeroMax = lv >= 3 ? 1 : 0, mins = S.mins || (S.range ? [S.range] : []);
  for (let tries = 0; tries < 400; tries++) {
    const order = shuffle(P, rnd), list = [];
    let zeros = 0;
    // 混合級先保證加減各 3 題、range 先保證新範圍的題數：把這些題排到前面挑
    const need = [];
    if (mixed) need.push(...order.filter(f => f.op === "+").slice(0, 3), ...order.filter(f => f.op === "-").slice(0, 3));
    for (const R of mins) need.push(...order.filter(f => R.f(f) && !need.includes(f)).slice(0, R.min));
    const seq = [...need, ...order.filter(f => !need.includes(f))];
    for (const f of seq) {
      if (list.length >= n) break;
      if (hasZero(f) && zeros >= zeroMax) continue;
      if (list.some(x => x.op === f.op && x.a === f.a && x.b === f.b)) continue;   // 跳著數：10＋10 在 2、5、10 三種荷葉都有，同一局只出一次
      const q = { ...f, ask, ans: ask === "b" ? f.b : f.c };
      if (kind === "hop" && lv >= 6) {                    // 荷葉一年級：畫面上 11 片從 base 開始、一片差 step
        q.step = f.step || 1; q.jumps = f.jumps || f.b;
        q.base = 0;                                       // 6～9 級的 base 等整局排好順序後再定（見下面：上一題的畫面裝得下就不換）
      }
      if (!okSeq(list, q)) continue;
      list.push(q); if (hasZero(f)) zeros++;
    }
    if (list.length < n) continue;
    if (mixed && (list.filter(q => q.op === "+").length < 3 || list.filter(q => q.op === "-").length < 3)) continue;
    if (mins.some(R => list.filter(R.f).length < R.min)) continue;
    const out = shuffle(list, rnd);
    if (kind === "hop" && lv === 10) out.sort((x, y) => x.step - y.step);   // 跳著數：先 2、再 5、再 10，一段一段來（櫻木 11-15：三種打亂每題都要重新看荷葉）
    if (kind === "hop" && lv >= 6 && lv <= 9) {            // 數線視窗：上一題的 11 片裝得下這題的起點和終點就不換（櫻木 11-15：每題都滑動＝每題重新找路）
      let prev = -1;
      for (const q of out) { const lo = Math.min(q.a, q.c), hi = Math.max(q.a, q.c), b0 = Math.max(0, hi - 10), b1 = Math.min(lo, 10); q.base = prev >= b0 && prev <= b1 ? prev : b0 + Math.floor(rnd() * (b1 - b0 + 1)); prev = q.base; }
    }                       // 打亂後再檢查一次「不連續 3 題同答案」
    if (out.some((q, i) => i >= 2 && out[i - 1].ans === q.ans && out[i - 2].ans === q.ans)) continue;
    for (const q of out) q.choices = kind === "fruit" ? (S.big ? makeChoicesBig(q.ans, rnd) : makeChoices(q.ans, rnd, 0, lv >= 6 ? 20 : 10)) : ask === "b" ? makeChoices(q.ans, rnd, 1, 9) : null;   // 跳幾下：干擾在 1～9（跳 0 下不是答案）
    return out;
  }
  throw new Error(`math-core: ${kind} Lv${lv} 湊不出符合規則的 ${n} 題`);
}

// 星星：第一次就答對的題數（right）→ ≥9 三顆、≥7 兩顆、其他一顆
export const starsOf = (right, total = N_DEFAULT) => (right >= total - 1 ? 3 : right >= total - 3 ? 2 : 1);
