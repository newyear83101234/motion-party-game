// 數學島出題核心（js/zhuyin-math-core.js）單元測試：node tools/zy-test/math-core-unit.mjs
// docs/zhuyin-math-plan.md §4：範圍、不重複、加減比例、0 的次數、不連續 3 題同答案、答案鈕、各級題型、念法
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const M = await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/zhuyin-math-core.js")).href);
const out = []; const ok = (n, c, i = "") => out.push(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  — " + i : ""}`);
const RUNS = 500;
const key = q => `${q.a}${q.op}${q.b}`;
const hasZero = q => q.a === 0 || q.b === 0 || q.c === 0;

// 每一級各跑 500 局，收集違規
for (const kind of ["fruit", "hop"]) for (let lv = 1; lv <= 5; lv++) {
  const bad = { range: [], dup: [], mix: [], zero: [], seq: [], choice: [], type: [], len: [] };
  const seenFacts = new Set(), ansCount = {};
  for (let r = 0; r < RUNS; r++) {
    const qs = M.makeRound(kind, lv);
    if (qs.length !== 10) bad.len.push(qs.length);
    const keys = new Set(qs.map(key)); if (keys.size !== qs.length) bad.dup.push(qs.map(key).join(","));
    for (const q of qs) {
      seenFacts.add(key(q)); ansCount[q.ans] = (ansCount[q.ans] || 0) + 1;
      const right = q.op === "+" ? q.a + q.b === q.c : q.a - q.b === q.c;
      if (!right || [q.a, q.b, q.c].some(v => v < 0 || v > 10 || !Number.isInteger(v))) bad.range.push(key(q));
      if (kind === "fruit" && (q.a < 1 || q.b < 1)) bad.range.push("水果 a/b 不能是 0：" + key(q));
      // 題型
      const want = { fruit: { 1: ["+"], 2: ["+"], 3: ["-"] }, hop: { 1: ["+"], 2: ["+"], 3: ["-"], 5: ["+"] } }[kind][lv];
      if (want && !want.includes(q.op)) bad.type.push(key(q));
      if (kind === "fruit" && lv === 1 && q.c > 5) bad.type.push("Lv1 和 > 5：" + key(q));
      if (kind === "hop") {
        const maxB = lv === 1 || lv === 3 ? 3 : 5;
        if (q.b < 1 || q.b > maxB) bad.type.push(`跳 ${q.b} 下（上限 ${maxB}）：` + key(q));
        if ((q.ask === "b") !== (lv === 5)) bad.type.push("ask 不對：" + q.ask);
      }
      if (q.ans !== (q.ask === "b" ? q.b : q.c)) bad.type.push("ans 不對：" + key(q));
      // 答案鈕
      const needChoices = kind === "fruit" || lv === 5;
      if (needChoices) {
        const c = q.choices || [];
        const lo = kind === "fruit" ? 0 : 1, hi = kind === "fruit" ? 10 : 9;
        if (c.length !== 3 || new Set(c).size !== 3 || !c.includes(q.ans) || c.some(v => v < lo || v > hi) || !c.some(v => Math.abs(v - q.ans) === 1))
          bad.choice.push(`${key(q)} → ${JSON.stringify(c)}`);
      } else if (q.choices != null) bad.choice.push("荷葉 Lv1～4 不該有 choices");
    }
    const z = qs.filter(hasZero).length; if (lv <= 2 ? z > 0 : z > 1) bad.zero.push(z);
    if (lv >= 4 && (kind === "fruit" || lv === 4)) { const p = qs.filter(q => q.op === "+").length, m = qs.length - p; if (p < 3 || m < 3) bad.mix.push(`${p}+/${m}-`); }
    if (qs.some((q, i) => i >= 2 && qs[i - 1].ans === q.ans && qs[i - 2].ans === q.ans)) bad.seq.push(qs.map(q => q.ans).join(""));
  }
  const tag = `${kind} Lv${lv}`;
  ok(`${tag}：每局 10 題、${RUNS} 局`, bad.len.length === 0, bad.len.slice(0, 3).join(","));
  ok(`${tag}：算式都對、數字都在 0～10（水果 a、b 不是 0）`, bad.range.length === 0, bad.range.slice(0, 3).join(" "));
  ok(`${tag}：同一局不重複（3＋2、2＋3 算不同題）`, bad.dup.length === 0, bad.dup[0] || "");
  ok(`${tag}：題型＝這一級該出的（加／減、跳幾下的範圍、問結果／問跳幾下）`, bad.type.length === 0, bad.type.slice(0, 3).join(" "));
  ok(`${tag}：含 0 的題 Lv1～2 沒有、Lv3 以上一局最多 1 題`, bad.zero.length === 0, bad.zero.slice(0, 5).join(","));
  if (lv === 4 || (kind === "fruit" && lv === 5)) ok(`${tag}：混合級加減各至少 3 題`, bad.mix.length === 0, bad.mix.slice(0, 3).join(" "));
  ok(`${tag}：不會連續 3 題同答案`, bad.seq.length === 0, bad.seq[0] || "");
  ok(`${tag}：答案鈕 3 顆不重複、含正確答案、至少一個差 1 的干擾、在範圍內（荷葉 1～4 級沒有答案鈕）`, bad.choice.length === 0, bad.choice.slice(0, 3).join(" "));
  ok(`${tag}：題庫有變化（500 局出現的題型數 ≥ 10）`, seenFacts.size >= 10, String(seenFacts.size));
}

// ---- 11-14 一年級 6～10 級 ----
ok("LV_MAX＝10、VOICE_LV_MAX＝5", M.LV_MAX === 10 && M.VOICE_LV_MAX === 5);
for (const kind of ["fruit", "hop"]) for (let lv = 6; lv <= 10; lv++) {
  const bad = { calc: [], dup: [], type: [], mix: [], seq: [], choice: [], win: [], zero: [] }, seen = new Set();
  let crossOk = 0;
  for (let r = 0; r < RUNS; r++) {
    const qs = M.makeRound(kind, lv);
    if (qs.length !== 10 || new Set(qs.map(key)).size !== 10) bad.dup.push(qs.map(key).join(","));
    if (qs.some((q, i) => i >= 2 && qs[i - 1].ans === q.ans && qs[i - 2].ans === q.ans)) bad.seq.push(qs.map(q => q.ans).join(","));
    if (qs.filter(hasZero).length > 1) bad.zero.push(1);
    const p = qs.filter(q => q.op === "+").length, m = 10 - p;
    for (const q of qs) {
      seen.add(key(q));
      const right = q.op === "+" ? q.a + q.b === q.c : q.a - q.b === q.c, hi = kind === "fruit" && lv === 10 ? 99 : kind === "hop" && lv === 10 ? 100 : 20;
      if (!right || [q.a, q.b, q.c].some(v => !Number.isInteger(v) || v < 0 || v > hi)) bad.calc.push(key(q));
      if (q.ans !== (q.ask === "b" ? q.b : q.c)) bad.type.push("ans：" + key(q));
      if (kind === "fruit") {
        const carry = q.op === "+" && q.a <= 9 && q.b <= 9 && q.c >= 11;
        if (lv === 6 && !(q.op === "+" && q.a >= 10 && q.b <= 9 && q.c <= 20)) bad.type.push(key(q));
        if (lv === 7 && !carry) bad.type.push(key(q));
        if (lv === 8 && !(q.op === "-" && q.a >= 11 && q.a <= 20 && q.b >= 1 && q.b <= 9)) bad.type.push(key(q));
        if (lv === 10) {
          const tens = q.a % 10 === 0 && q.b % 10 === 0;
          if (!tens && !(q.b <= 9 && Math.floor(q.a / 10) === Math.floor(q.c / 10) && q.c % 10 !== 0)) bad.type.push("進退位了：" + key(q));
          if (q.a < 10 || q.c < 10 || q.c > 99) bad.type.push("範圍：" + key(q));
        }
        const c = q.choices || [], cHi = lv === 10 ? 99 : 20;
        if (c.length !== 3 || new Set(c).size !== 3 || !c.includes(q.ans) || c.some(v => v < 0 || v > cHi) || !c.some(v => Math.abs(v - q.ans) === 1)) bad.choice.push(`${key(q)}→${c}`);
        if (lv === 10 && !c.some(v => Math.abs(v - q.ans) === 10)) bad.choice.push(`沒有差 10 的：${key(q)}→${c}`);
      } else {
        const idx = v => (v - q.base) / q.step;
        if (![q.a, q.c].every(v => Number.isInteger(idx(v)) && idx(v) >= 0 && idx(v) <= 10) || q.base < 0 || q.base + 10 * q.step > (lv === 10 ? 100 : 20)) bad.win.push(`${key(q)} base${q.base} step${q.step}`);
        if (q.jumps !== q.b / q.step || q.jumps < 1) bad.type.push("jumps：" + key(q));
        if (lv <= 9 && q.step !== 1) bad.type.push("step：" + key(q));
        if (lv === 6 && !(q.op === "+" && q.b <= 5)) bad.type.push(key(q));
        if (lv === 7 && !(q.op === "-" && q.b <= 5)) bad.type.push(key(q));
        if (lv === 8 && q.b > 9) bad.type.push(key(q));
        if ((q.ask === "b") !== (lv === 9)) bad.type.push("ask：" + key(q));
        if (lv === 10 && (![2, 5, 10].includes(q.step) || q.jumps > 5)) bad.type.push(key(q));
        if (lv === 9) { const c = q.choices || []; if (c.length !== 3 || new Set(c).size !== 3 || !c.includes(q.ans) || c.some(v => v < 1 || v > 9)) bad.choice.push(`${key(q)}→${c}`); }
        else if (q.choices != null) bad.choice.push("不該有 choices");
      }
    }
    if ((lv === 9 && kind === "fruit") || (kind === "hop" && (lv === 8 || lv === 10)) || (kind === "fruit" && lv === 10)) { if (p < 3 || m < 3) bad.mix.push(`${p}+/${m}-`); }
    if (kind === "fruit" && lv === 8) crossOk += qs.filter(q => q.c <= 9 && q.a <= 18 && q.b >= 2).length >= 6;
    if (kind === "fruit" && lv === 9) crossOk += qs.filter(q => (q.op === "+" && q.a <= 9 && q.c >= 11) || (q.op === "-" && q.c <= 9 && q.a <= 18 && q.b >= 2)).length >= 5;
    if (kind === "fruit" && lv === 10) crossOk += qs.filter(q => q.a % 10 === 0 && q.b % 10 === 0).length >= 3 && qs.filter(q => q.b <= 9).length >= 3;
    if (kind === "hop" && lv === 6) crossOk += qs.filter(q => q.a < 10 && q.c > 10).length >= 5;
    if (kind === "hop" && lv === 7) crossOk += qs.filter(q => q.a > 10 && q.c < 10).length >= 5;
    if (kind === "hop" && lv === 8) crossOk += qs.filter(q => q.b >= 6).length >= 4;
    if (kind === "hop" && lv === 10) crossOk += [2, 5, 10].every(k => qs.filter(q => q.step === k).length >= 2);
  }
  const tag = `${kind} Lv${lv}`;
  ok(`${tag}：每局 10 題不重複、${RUNS} 局`, bad.dup.length === 0, bad.dup[0] || "");
  ok(`${tag}：算式都對、數字在範圍內`, bad.calc.length === 0, bad.calc.slice(0, 3).join(" "));
  ok(`${tag}：題型＝這一級該出的`, bad.type.length === 0, bad.type.slice(0, 3).join(" "));
  ok(`${tag}：不會連續 3 題同答案、含 0 最多 1 題`, bad.seq.length === 0 && bad.zero.length === 0, bad.seq[0] || "");
  ok(`${tag}：答案鈕`, bad.choice.length === 0, bad.choice.slice(0, 3).join(" "));
  if (bad.mix.length || (kind === "fruit" ? lv >= 9 : lv === 8 || lv === 10)) ok(`${tag}：混合級加減各至少 3 題`, bad.mix.length === 0, bad.mix.slice(0, 3).join(" "));
  if (kind === "hop" && lv === 10) { let bad10 = 0, keep = 0; for (let r = 0; r < 200; r++) { const st = M.makeRound("hop", 10).map(q => q.step); if (st.some((v, i) => i && v < st[i - 1])) bad10++; } ok(`${tag}：同一局照 2 → 5 → 10 一段一段出`, bad10 === 0, String(bad10)); }
  if (kind === "hop" && lv <= 9) { let moved = 0, need = 0; for (let r = 0; r < 200; r++) { const qs = M.makeRound("hop", lv); qs.forEach((q, i) => { if (!i) return; const pb = qs[i - 1].base, fits = [q.a, q.c].every(v => v >= pb && v <= pb + 10); if (fits && q.base !== pb) moved++; if (!fits) need++; }); } ok(`${tag}：上一題的畫面裝得下就不換視窗`, moved === 0, `多換了 ${moved} 次（必要的換 ${need} 次）`); }
  if (kind === "hop") ok(`${tag}：起點、終點都在畫面上的 11 片裡（base、step）`, bad.win.length === 0, bad.win.slice(0, 3).join(" "));
  if (!(kind === "fruit" && (lv === 6 || lv === 7)) && !(kind === "hop" && lv === 9)) ok(`${tag}：這一級的重點題每局都夠（進退位／跨十／大跳／三種跳法）`, crossOk === RUNS, String(crossOk));
  ok(`${tag}：題庫有變化（≥ 20 種）`, seen.size >= 20, String(seen.size));
}
ok("念法：numZh 11＝十一、20＝二十、34＝三十四、100＝一百", M.numZh(11) === "十一" && M.numZh(20) === "二十" && M.numZh(34) === "三十四" && M.numZh(100) === "一百");

// 水果 Lv1 題庫剛好 10 題（櫻木：順序不同算不同題才湊得滿）、每局全出一次
{
  const P = M.pool("fruit", 1).map(key).sort();
  ok("水果 Lv1 題庫剛好 10 題（1+1…4+1）", P.length === 10, P.join(","));
  const qs = M.makeRound("fruit", 1).map(key).sort();
  ok("水果 Lv1 一局＝10 題全出一次", JSON.stringify(qs) === JSON.stringify(P));
}
// 新範圍真的有出（高一級比較難）
{
  let f2 = 0, h2 = 0, h4 = 0;
  for (let r = 0; r < 200; r++) {
    f2 += M.makeRound("fruit", 2).filter(q => q.c >= 6).length >= 5;
    h2 += M.makeRound("hop", 2).filter(q => q.b >= 4).length >= 4;
    h4 += M.makeRound("hop", 4).filter(q => q.b >= 4).length >= 3;
  }
  ok("水果 Lv2：每局至少 5 題和 ≥ 6", f2 === 200, String(f2));
  ok("荷葉 Lv2：每局至少 4 題跳 4～5 下", h2 === 200, String(h2));
  ok("荷葉 Lv4：每局至少 3 題跳 4～5 下", h4 === 200, String(h4));
}
// 題庫不夠要丟錯、不偷偷放寬
{
  let threw = false; try { M.makeRound("fruit", 1, 11); } catch (e) { threw = /不夠/.test(e.message); }
  ok("水果 Lv1 要 11 題 → 丟錯「題庫不夠」（不放寬規則）", threw);
}
// 念法
{
  const q = { op: "+", a: 2, b: 2, c: 4, ask: "c" };
  ok("算式念「二」：二加二等於四", M.eqText(q) === "二加二等於四", M.eqText(q));
  ok("量詞念「兩」：qtyZh(2)＝兩、qtyZh(3)＝三、numZh(2)＝二", M.qtyZh(2) === "兩" && M.qtyZh(3) === "三" && M.numZh(2) === "二");
  ok("減法整句：五減二等於三", M.eqText({ op: "-", a: 5, b: 2, c: 3 }) === "五減二等於三");
  ok("畫面算式：問結果「3 ＋ 2 ＝ ？」、問跳幾下「4 ＋ ？ ＝ 7」", M.eqShow({ op: "+", a: 3, b: 2, c: 5, ask: "c" }) === "3 ＋ 2 ＝ ？" && M.eqShow({ op: "+", a: 4, b: 3, c: 7, ask: "b" }) === "4 ＋ ？ ＝ 7");
  ok("十：numZh(10)＝十、零：numZh(0)＝零", M.numZh(10) === "十" && M.numZh(0) === "零");
}
// 星星
ok("星星：答對 10／9 → 3 顆、8／7 → 2 顆、6 以下 → 1 顆", [10, 9, 8, 7, 6, 0].map(r => M.starsOf(r)).join("") === "332211");
// 答案鈕靠邊
{
  let bad = 0;
  for (let i = 0; i < 300; i++) for (const a of [0, 1, 9, 10]) { const c = M.makeChoices(a); if (c.length !== 3 || new Set(c).size !== 3 || c.some(v => v < 0 || v > 10) || !c.includes(a)) bad++; }
  ok("答案在 0、1、9、10 時干擾也在 0～10、不重複", bad === 0, String(bad));
  let pos = [0, 0, 0]; for (let i = 0; i < 3000; i++) { const c = M.makeChoices(5); pos[c.indexOf(5)]++; }
  ok("正確答案的位置三格都會出現（各 ≥ 25%）", pos.every(n => n > 750), pos.join("/"));
}

console.log(out.join("\n"));
const fails = out.filter(l => l.startsWith("FAIL")).length;
console.log(`\n${fails ? "❌" : "✅"} ${out.length - fails}/${out.length}`);
process.exitCode = fails ? 1 : 0;
