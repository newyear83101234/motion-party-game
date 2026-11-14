// 🍎 水果籃算算看（js/zhuyin-fruit.js）自動測試：node tools/zy-test/fruit-unit.js
// 用獨立試玩頁 tools/zy-test/fruit-harness.html（不經過主程式），透過 window.__zyFruit 掛鉤驗 docs/zhuyin-math-plan.md §2：
//   五級各玩一局到 onWin（星數照 starsOf）、Lv1 只有加法和 ≤5、Lv3 只有減法、減法拿走的到猴子手上且籃子留空格、
//   最後一顆放好前答案鈕按不了、答錯一次示範數數、錯兩次只剩正確答案發亮要點了才過（只有第一次答對才算 right）、
//   回饋／示範期間連點不算錯、數數幫手、Lv5 蓋布＋偷看（不限次、每次 1.5 秒）、前 2 題念完整句之後縮短、答對一定念 eqText、
//   連對 3 題猴子翻跟斗、量詞念「兩顆」、三尺寸（＋手機橫放）主要元件都在畫面內且不重疊、onEnd 不來也會往下走、stop 後沒有殘留、沒有 console error、
//   結算畫面（四尺寸：收掉算式卡／答案鈕／空籃子、果汁下面一排 5 顆、果汁杯不壓任何東西）、算式 ＋／－ 一樣寬一樣粗。
// 截圖存到 %TEMP%\zy-fruit-shots\。圖片（IMAGE/zhuyin/math/*.webp）還沒生出來時的 404 不算錯（模組會換 emoji）。
// 網址：預設 http://127.0.0.1:8765/…；分身 worktree 用 ZY_URL=http://127.0.0.1:8771/zhuyin.html 指到自己的伺服器。
// ⚠️ 一次只跑這一支（這台電腦同時開太多 headless 瀏覽器會互搶）。
const path = require("path"), fs = require("fs");
const { launch, URL } = require("./lib");
const BASE = URL.replace(/zhuyin\.html.*$/, "tools/zy-test/fruit-harness.html");
const SHOTS = path.join(process.env.TEMP || ".", "zy-fruit-shots");
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); console.log(results[results.length - 1]); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allErrs = [];
const IMG404 = /IMAGE\/zhuyin\/math\//;
const starsOf = r => (r >= 9 ? 3 : r >= 7 ? 2 : 1);

async function open(browser, q = "", { w = 1180, h = 820, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() !== "error" || /favicon/.test(m.text())) return; const u = (m.location() || {}).url || ""; if (IMG404.test(u) || (IMG404.test(m.text()))) return; errs.push("CONSOLE " + m.text().slice(0, 200) + (u ? " @" + u : "")); });
  await p.goto(`${BASE}?clean=1${/idle=/.test(q) ? "" : "&idle=0"}${q ? "&" + q : ""}`);   // 6 級以上的「發呆自動示範」預設關掉（要測的那段自己帶 idle=毫秒）
  await p.waitForFunction(() => window.__lab && window.__lab.ready && window.__zyFruit && window.__zyFruit.state(), null, { timeout: 15000 });
  return { ctx, p, errs };
}
async function close(o, name) { allErrs.push(...o.errs.map(e => `[${name}] ${e}`)); await o.ctx.close(); }
const S = p => p.evaluate(() => window.__zyFruit.state());
const F = (p, fn, ...a) => p.evaluate(([fn, a]) => window.__zyFruit[fn](...a), [fn, a]);
const waitPhase = (p, ph, timeout = 15000) => p.waitForFunction(ph => { const s = window.__zyFruit.state(); return s && ph.includes(s.phase); }, ph, { timeout }).then(() => true, () => false);
const waitI = (p, i, timeout = 15000) => p.waitForFunction(i => { const s = window.__zyFruit.state(); return !s || s.i > i || s.done || s.phase === "end"; }, i, { timeout }).then(() => true, () => false);
const spoken = p => p.evaluate(() => window.__spoken.slice());
const clearSpoken = p => p.evaluate(() => { window.__spoken.length = 0; });
// 一題：R＝第一次就答對、W＝錯一次（看完示範）再答對、F＝錯兩次、點發亮的那顆
async function doQ(p, kind) {
  if (!(await waitPhase(p, ["input"]))) return "timeout-input";
  const s = await S(p), i = s.i;
  if (kind === "W" || kind === "F") {
    await F(p, "answerWrong");
    if (!(await waitPhase(p, ["input"]))) return "timeout-demo";
    if (kind === "F") { await F(p, "answerWrong"); if (!(await waitPhase(p, ["forced"]))) return "timeout-forced"; }
  }
  const r = await F(p, "answer", s.q.ans);
  if (r !== "right") return "answer=" + r;
  if (!(await waitI(p, i))) return "timeout-next";
  return "ok";
}
async function playRound(p, pattern, waitWin = true) {
  const out = [];
  for (const k of pattern) out.push(await doQ(p, k));
  if (waitWin) await p.waitForFunction(() => window.__lab.calls.win.length > 0, null, { timeout: 15000 }).catch(() => {});
  return out;
}
// 結算畫面：算式卡、答案鈕、空籃子收掉；果汁下面的水果一排 5 顆；果汁杯不壓到猴子、果汁機、🏠🎵、不出畫面
async function endBad(p, right) {
  const r = await p.evaluate(() => {
    const R = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }, q = s => document.querySelector(s);
    const shown = [".fr-eq", ".fr-ans", ".fr-bkcol"].filter(s => getComputedStyle(q(s)).visibility !== "hidden");
    const rows = []; for (const f of document.querySelectorAll(".fr-juice-row .fr-fruit")) { const t = Math.round(f.getBoundingClientRect().top), row = rows.find(x => Math.abs(x.t - t) < 3); if (row) row.n++; else rows.push({ t, n: 1 }); }
    const j = q(".fr-juice"), jr = j && R(j);
    const lap = !j ? [] : Object.entries({ 猴子: ".fr-mk", 果汁機: ".fr-jc", "🏠": "#homeBtn", "🎵": "#musicBtn" }).filter(([, s]) => { const o = R(q(s)); return jr.l < o.r - 1 && o.l < jr.r - 1 && jr.t < o.b - 1 && o.t < jr.b - 1; }).map(([k]) => k);
    return { shown, rows: rows.map(x => x.n), juice: !!j, inV: !!j && jr.l >= -0.5 && jr.t >= -0.5 && jr.r <= innerWidth + 0.5 && jr.b <= innerHeight + 0.5, lap };
  });
  const want = right <= 5 ? [right].filter(Boolean) : [5, right - 5], bad = [];
  if (r.shown.length) bad.push("沒收掉 " + r.shown.join(","));
  if (!r.juice || !r.inV) bad.push("果汁杯" + (r.juice ? "出畫面" : "沒出現"));
  if (r.lap.length) bad.push("果汁杯壓到 " + r.lap.join(","));
  if (JSON.stringify(r.rows) !== JSON.stringify(want)) bad.push(`水果排法 ${JSON.stringify(r.rows)}（要 ${JSON.stringify(want)}）`);
  return bad;
}
// 換成指定的題目重開一局（並清掉開頁那一局留下的語音／音效紀錄）
async function playList(p, lv, list) { await F(p, "play", lv, list); await p.evaluate(() => { window.__spoken.length = 0; window.__lab.calls.play.length = 0; window.__lab.calls.stopVoice = 0; }); }
// 頁內：依模組自己的台詞函式算出每題該念什麼（跟事件表對照）
const lineCheck = (p, plan = "") => p.evaluate(async plan => {
  const M = window.__lab.mod, C = await import("../../js/zhuyin-math-core.js?v=2");
  const G = window.__zyFruit, round = G.round(), ev = G.events(), bad = [];
  let eqOk = 0, fullOk = 0, shortOk = 0;
  round.forEach((q, i) => {
    const said = ev.filter(e => e.i === i && (e.k === "say" || e.k === "talk")).map(e => e.text);
    const fr = M.FRUITS.find(f => said.includes(M.openLine(q.a, f)));
    const wantEq = i < 2 || (plan[i] && plan[i] !== "R");   // 11-15 阿葉「幾加幾等於幾的語音太多」：只有每局前 2 題、或這題答錯過才念算式
    if (said.includes(C.eqText(q)) === wantEq) eqOk++; else bad.push(`第${i + 1}題${wantEq ? "沒念" : "不該念"} ${C.eqText(q)}`);
    if (i < 2) { if (fr && said.includes(M.actLine(q, true)) && !said.includes(M.actLine(q, false))) fullOk++; else bad.push(`第${i + 1}題不是完整句：${said.join("／")}`); }
    else { if (!fr && said.includes(M.actLine(q, false)) && !said.includes(M.actLine(q, true)) && !said.includes(M.askLine(q))) shortOk++; else bad.push(`第${i + 1}題不是縮短句：${said.join("／")}`); }
  });
  const all = ev.filter(e => e.k === "say" || e.k === "talk").map(e => e.text);
  return { eqOk, fullOk, shortOk, bad, er: all.filter(t => /二顆/.test(t)), round };
}, plan);

(async () => {
  const browser = await launch();
  // ===== 1. 五級各玩一局到 onWin =====
  const plans = {
    1: "RRRRRRRRRR",                                       // 10 對 → 3 星，連對 3 題翻跟斗 3 次
    2: "RRRRRRRRWF",                                       // 8 對 → 2 星，錯 3 次
    3: "RRRWRRWRWW",                                       // 6 對 → 1 星
    4: "RRRRRFRRRR",                                       // 9 對 → 3 星
    5: "RRWRRWRRWR",                                       // 7 對 → 2 星
  };
  for (const lv of [1, 2, 3, 4, 5]) {
    const o = await open(browser, `lv=${lv}&speed=8&seed=${lv * 3}`), p = o.p;
    const plan = plans[lv], want = [...plan].filter(c => c === "R").length, wantWrong = [...plan].reduce((s, c) => s + (c === "W" ? 1 : c === "F" ? 2 : 0), 0);
    const steps = await playRound(p, [...plan]);
    const win = await p.evaluate(() => window.__lab.calls.win.slice());
    const s = await S(p), r = win[0] || {};
    ok(`Lv${lv}：一局 10 題都走完（${plan}）`, steps.every(x => x === "ok"), steps.filter(x => x !== "ok").join(","));
    ok(`Lv${lv}：onWin 一次、欄位對（lv／right／wrong／total）`, win.length === 1 && r.lv === lv && r.right === want && r.wrong === wantWrong && r.total === 10, JSON.stringify(r));
    ok(`Lv${lv}：星數＝starsOf(right)（${want} 對 → ${starsOf(want)} 星）`, r.stars === starsOf(want), `stars=${r.stars}`);
    ok(`Lv${lv}：果汁機裡的水果＝第一次就答對的題數`, s && s.juice === want && (await p.evaluate(() => document.querySelectorAll(".fr-dot.fr-on").length)) === want, `juice=${s && s.juice}`);
    const L = await lineCheck(p, plan);
    ok(`Lv${lv}：算式整句只在前 2 題與答錯過的題念，其他題不念（${L.eqOk}/10）`, L.eqOk === 10, L.bad.filter(b => /沒念|不該念/.test(b)).slice(0, 2).join(" "));
    ok(`Lv${lv}：前 2 題念完整句、之後縮短`, L.fullOk === 2 && L.shortOk === 8, L.bad.filter(b => !/沒念/.test(b)).slice(0, 2).join(" "));
    ok(`Lv${lv}：沒有念成「二顆」`, L.er.length === 0, L.er.slice(0, 2).join(" "));
    if (lv === 1) {
      const ev = await F(p, "events"), flips = ev.filter(e => e.k === "flip");
      ok("Lv1：連對 3 題猴子翻跟斗（第 3、6、9 題）", flips.length === 3 && flips[0].i === 2 && flips[1].i === 5 && flips[2].i === 8, JSON.stringify(flips.map(f => f.i)));
      ok("Lv1：這局只有加法、和 ≤ 5", L.round.every(q => q.op === "+" && q.c <= 5 && q.a >= 1 && q.b >= 1), L.round.map(q => `${q.a}${q.op}${q.b}`).join(" "));
    }
    if (lv === 2) {
      const ev = await F(p, "events"), flips = ev.filter(e => e.k === "flip");
      ok("Lv2：答錯會打斷連對（8 對但最後兩題錯 → 翻 2 次）", flips.length === 2, JSON.stringify(flips.map(f => f.i)));
    }
    if (lv === 3) ok("Lv3：這局只有減法", L.round.every(q => q.op === "-"), L.round.map(q => `${q.a}${q.op}${q.b}`).join(" "));
    if (lv === 5) {
      const ev = await F(p, "events");
      ok("Lv5：每題都蓋布", new Set(ev.filter(e => e.k === "cover").map(e => e.i)).size === 10);
    }
    await sleep(700);                                      // 果汁杯彈出來的動畫、猴子跳回去
    const eb = await endBad(p, want);
    ok(`Lv${lv} 結算（1180×820）：收掉算式卡／答案鈕／空籃子、果汁下面的水果一排 5 顆、果汁杯不壓任何東西`, eb.length === 0, eb.join("；"));
    await p.screenshot({ path: path.join(SHOTS, `end_lv${lv}.png`) });
    await close(o, `Lv${lv}`);
  }

  // ===== 2. 出題範圍：Lv1 只有加法和 ≤ 5、Lv3 只有減法（各開 20 局） =====
  {
    const o = await open(browser, "lv=1&speed=8"), p = o.p;
    const r = await p.evaluate(() => { const out = { l1: [], l3: [] }; for (let k = 0; k < 20; k++) { window.__zyFruit.play(1); out.l1.push(...window.__zyFruit.round()); window.__zyFruit.play(3); out.l3.push(...window.__zyFruit.round()); } window.__zyFruit.game.stop(); return out; });
    ok("Lv1（20 局）：只有加法、和 ≤ 5、不出 0", r.l1.length === 200 && r.l1.every(q => q.op === "+" && q.c <= 5 && q.a >= 1 && q.b >= 1));
    ok("Lv3（20 局）：只有減法", r.l3.length === 200 && r.l3.every(q => q.op === "-" && q.a <= 10));
    ok("答案鈕 3 顆不重複、含正確答案", [...r.l1, ...r.l3].every(q => q.choices.length === 3 && new Set(q.choices).size === 3 && q.choices.includes(q.ans)));
    await close(o, "pool");
  }

  // ===== 3. 減法：拿走的到猴子手上、籃子那幾格變空；答案鈕在最後一顆放好前按不了（正常速度） =====
  {
    const o = await open(browser, "lv=3&speed=1"), p = o.p;
    await playList(p, 3, [{ op: "-", a: 7, b: 3 }, { op: "-", a: 5, b: 2 }, { op: "-", a: 9, b: 4 }]);
    await waitPhase(p, ["build"]);
    let samples = 0, bad = [], clicks = 0;
    const box = await p.evaluate(() => [...document.querySelectorAll(".fr-btn")].map(b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
    for (let t = 0; t < 60; t++) {
      const s = await S(p); if (s.phase !== "build") break;
      samples++;
      const dis = await p.evaluate(() => [...document.querySelectorAll(".fr-btn")].every(b => b.disabled));
      if (!dis) bad.push(`第${t}次：有鈕沒鎖`);
      if (t % 4 === 1) { const b = box[t % 3]; await p.mouse.click(b.x, b.y); clicks++; }
      if (t % 4 === 3) { const r = await F(p, "answer", s.q.ans); if (r !== "locked") bad.push("answer=" + r); }
      await sleep(70);
    }
    const s1 = await S(p);
    ok("放水果中：答案鈕都鎖住、點了不算（真的用滑鼠點＋掛鉤點）", samples >= 8 && bad.length === 0 && s1.right === 0 && s1.wrong === 0, `samples=${samples} clicks=${clicks} ${bad.slice(0, 2).join(" ")}`);
    await waitPhase(p, ["input"]);
    const s = await S(p);
    const dom = await p.evaluate(() => ({ cells: [...document.querySelectorAll(".fr-cell")].map(c => c.querySelectorAll(".fr-fruit").length), hand: document.querySelectorAll(".fr-mk .fr-hand .fr-fruit").length,
      handOp: +getComputedStyle(document.querySelector(".fr-hand")).opacity, ghosts: [...document.querySelectorAll(".fr-cell")].slice(4).reduce((n, c) => n + c.children.length, 0) }));
    ok("減法 7－3：籃子剩 4 顆（左上排起）、猴子手上 3 顆", s.basket === 4 && s.hand === 3 && JSON.stringify(s.cells) === JSON.stringify([1, 1, 1, 1, 0, 0, 0, 0, 0, 0].map(Boolean)), JSON.stringify({ b: s.basket, h: s.hand }));
    ok("減法：拿走的那幾格是空的（沒有殘影）、手上的看得到", dom.ghosts === 0 && dom.hand === 3 && dom.handOp > 0.9 && dom.cells.join("") === "1111000000", JSON.stringify(dom));
    ok("最後一顆拿完才能按：3 顆鈕都可以按了", s.enabled.length === 3);
    const ev = await F(p, "events"), takes = ev.filter(e => e.k === "take"), ready = ev.find(e => e.k === "ready");
    ok("輸入時機：ready 在最後一顆拿走之後", takes.length === 3 && ready && ready.t >= takes[2].t, JSON.stringify(takes.map(e => e.n)));
    const pl = await p.evaluate(() => window.__lab.calls.play.filter(x => x[0] === "pop").map(x => x[1]));
    const up = pl.slice(0, 7), down = pl.slice(7, 10);
    ok("音高：放進去一顆比一顆高、拿走一顆比一顆低", up.every((r, k) => k === 0 || r > up[k - 1]) && down.length === 3 && down.every((r, k) => (k === 0 ? r < up[6] : r < down[k - 1])), JSON.stringify(pl));
    // 數數幫手：只數籃子裡的（猴子手上的不算）
    await clearSpoken(p);
    const h0 = await F(p, "tapHand", 0);
    ok("數數幫手：點猴子手上的不算（不跳數字、不念）", h0 === 0 && (await spoken(p)).length === 0);
    await close(o, "sub");
  }

  // ===== 4. 數數幫手（點水果跳出 1、2、3 並念）＋答錯一次示範數數＋示範期間連點不算＋錯兩次要點發亮的 =====
  {
    const o = await open(browser, "lv=2&speed=4"), p = o.p;
    await playList(p, 2, [{ op: "+", a: 3, b: 2 }, { op: "+", a: 2, b: 4 }, { op: "+", a: 4, b: 4 }]);
    const t0 = await F(p, "tapFruit", 0);
    await waitPhase(p, ["input"]);
    await sleep(400); await clearSpoken(p);
    const n1 = await F(p, "tapFruit", 0), n2 = await F(p, "tapFruit", 1), n3 = await F(p, "tapFruit", 2);
    const pos = await p.evaluate(() => { const f = document.querySelectorAll(".fr-cell .fr-fruit")[3].getBoundingClientRect(); return { x: f.left + f.width / 2, y: f.top + f.height / 2 }; });
    await p.mouse.click(pos.x, pos.y); await sleep(150);
    const sp1 = (await spoken(p)).map(x => x.text), s0 = await S(p);
    ok("數數幫手：點水果跳出 1、2、3、4（真的點也行）並念「一二三四」", t0 === 0 && n1 === 1 && n2 === 2 && n3 === 3 && JSON.stringify(s0.badges) === "[1,2,3,4,0]" && sp1.join("") === "一二三四", JSON.stringify({ t0, sp1, b: s0.badges }));
    // 答錯第 1 次
    await clearSpoken(p);
    const w1 = await F(p, "answerWrong"); const sA = await S(p);
    ok("答錯第 1 次：那顆鈕變灰、進入示範", w1 === "wrong" && sA.phase === "demo" && sA.grey.length === 1 && sA.wrong === 1, JSON.stringify({ w1, ph: sA.phase, grey: sA.grey }));
    let locked = 0, extra = [];
    for (let k = 0; k < 6; k++) { const r1 = await F(p, "answerWrong"), r2 = await F(p, "answer", sA.q.ans); if (r1 === "locked" && r2 === "locked") locked++; else extra.push(r1 + "/" + r2); const tf = await F(p, "tapFruit", 1); if (tf) extra.push("tap=" + tf); await sleep(60); }
    const btn = await p.evaluate(v => { const b = [...document.querySelectorAll(".fr-btn")].find(x => +x.dataset.v === v).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sA.q.ans);
    await p.mouse.click(btn.x, btn.y);
    const sB = await S(p);
    ok("示範期間連點不算錯、示範也點不掉（掛鉤＋滑鼠）", locked === 6 && extra.length === 0 && sB.wrong === 1 && sB.phase === "demo" && sB.i === 0, JSON.stringify({ locked, extra, wrong: sB.wrong, ph: sB.phase }));
    await waitPhase(p, ["input"]);
    const sC = await S(p), sp2 = (await spoken(p)).map(x => x.k + ":" + x.text);
    const nums = sp2.filter(t => t.startsWith("say:")).map(t => t.slice(4));
    ok("示範：念「我們一起數數看」，籃子 5 顆一顆顆亮、念一到五", sp2[0] === "talk:我們一起數數看" && nums.join("") === "一二三四五" && JSON.stringify(sC.badges) === "[1,2,3,4,5]", JSON.stringify(sp2));
    ok("示範完：剩 2 顆鈕可以按", sC.enabled.length === 2 && sC.enabled.includes(sC.q.ans));
    // 答錯第 2 次
    await clearSpoken(p);
    const w2 = await F(p, "answerWrong");
    const rx = await F(p, "answer", sA.grey[0]);         // 剛變灰的那顆再點：回饋中＝locked、之後＝dead，都不算
    await waitPhase(p, ["forced"]);
    const sD = await S(p), sp3 = (await spoken(p)).map(x => x.text);
    ok("答錯第 2 次：另一顆也變灰，只剩正確那顆發亮", w2 === "wrong" && (rx === "locked" || rx === "dead") && sD.grey.length === 2 && sD.glow === sD.q.ans && JSON.stringify(sD.enabled) === JSON.stringify([sD.q.ans]) && sD.wrong === 2, JSON.stringify({ w2, rx, grey: sD.grey, glow: sD.glow, en: sD.enabled }));
    ok("答錯第 2 次：說「點點看發亮的那一顆！」", sp3.includes("點點看發亮的那一顆！"), JSON.stringify(sp3));
    const others = sD.q.choices.filter(v => v !== sD.q.ans);
    const d1 = await F(p, "answer", others[0]), d2 = await F(p, "answer", others[1]);
    await sleep(500);
    const sE = await S(p);
    ok("錯兩次後點錯的沒反應（不算錯、不會過）", d1 === "dead" && d2 === "dead" && sE.i === 0 && sE.wrong === 2 && sE.phase === "forced", JSON.stringify({ d1, d2, i: sE.i, w: sE.wrong }));
    await clearSpoken(p);
    const g = await F(p, "answer", sD.q.ans);
    const sF = await S(p);
    ok("點發亮的那顆才過；不算第一次答對（right 不加）", g === "right" && sF.right === 0 && sF.results.length === 1 && sF.results[0].first === false, JSON.stringify({ g, right: sF.right }));
    const rf = await F(p, "answer", others[0]);
    ok("答對後的回饋期間連點不算錯", rf === "locked" && (await S(p)).wrong === 2, rf);
    await waitI(p, 0);
    ok("過了還是念整句「三加二等於五」", (await spoken(p)).some(x => x.text === "三加二等於五"));
    await close(o, "wrong");
  }

  // ===== 5. 量詞「兩顆」、算式「二」；💬 再念一次 =====
  {
    const o = await open(browser, "lv=1&speed=6"), p = o.p;
    await playList(p, 1, [{ op: "+", a: 2, b: 2 }, { op: "+", a: 1, b: 2 }, { op: "+", a: 2, b: 1 }]);
    await waitPhase(p, ["input"]);
    await sleep(300);
    const sp = (await spoken(p)).map(x => x.text), s = await S(p);
    const name = { apple: "蘋果", orange: "橘子", strawberry: "草莓", peach: "桃子", lemon: "檸檬" }[s.fruit];
    ok("量詞念「兩顆」：籃子裡有兩顆…、又掉進兩顆", sp.includes(`籃子裡有兩顆${name}`) && sp.includes("又掉進兩顆，現在有幾顆？") && !sp.some(t => /二顆/.test(t)), JSON.stringify(sp));
    await clearSpoken(p);
    await p.evaluate(() => window.__lab.game.sayCurrent());
    await sleep(800);
    const sp2 = (await spoken(p)).map(x => x.text);
    ok("💬 再念一次：念完整題目（開頭句＋完整動作句）", sp2[0] === `籃子裡有兩顆${name}` && sp2.includes("又掉進兩顆，現在有幾顆？"), JSON.stringify(sp2));
    await clearSpoken(p);
    await F(p, "answer", 4); await sleep(300);
    const sp3 = (await spoken(p)).map(x => x.text);
    ok("算式念「二加二等於四」（算式裡念二）", sp3.includes("二加二等於四"), JSON.stringify(sp3));
    const sv = await p.evaluate(() => window.__lab.calls.stopVoice);
    ok("按答案鈕先打斷語音（stopVoice）", sv >= 1, `stopVoice×${sv}`);
    // 第一次玩：start(lv, { intro: true }) 先念開場語，念完才出第一題
    await clearSpoken(p);
    await p.evaluate(() => window.__lab.game.start(1, { intro: true }));
    const ph0 = (await S(p)).phase;
    await waitPhase(p, ["build"]);
    const spi = (await spoken(p)).map(x => x.k + ":" + x.text);
    ok("start(lv, { intro: true })：先念開場語、念完才出第一題", ph0 === "intro" && spi[0] === "talk:" + (await p.evaluate(() => window.__lab.mod.LINES.intro)) && spi.length >= 2 && /^say:籃子裡有/.test(spi[1]), JSON.stringify({ ph0, spi }));
    const vl = await p.evaluate(() => { const v = window.__lab.mod.voiceLines(); return { say: v.say.length, talk: v.talk.length, two: v.say.filter(t => /二顆/.test(t)).length }; });
    ok("voiceLines()：列得出全部台詞、沒有「二顆」", vl.say > 100 && vl.talk === 5 && vl.two === 0, JSON.stringify(vl));
    await close(o, "qty");
  }

  // ===== 6. Lv5 蓋布＋偷看 =====
  {
    const SP = 3;
    const o = await open(browser, `lv=5&speed=${SP}`), p = o.p;
    await playList(p, 5, [{ op: "+", a: 4, b: 3 }, { op: "-", a: 8, b: 3 }, { op: "+", a: 5, b: 2 }]);
    const f0 = await F(p, "peek");
    await p.waitForFunction(() => window.__zyFruit.state().covered, null, { timeout: 10000 });
    const ev = await F(p, "events"), puts = ev.filter(e => e.k === "put" && e.i === 0), cov = ev.find(e => e.k === "cover");
    const viewMs = (cov.t - puts[3].t) * SP;
    ok("Lv5：a 顆放好看 3 秒才蓋布（換算正常速度）", puts.length >= 4 && viewMs >= 2700 && viewMs <= 3800 && f0 === false, `${Math.round(viewMs)}ms peekBefore=${f0}`);
    await waitPhase(p, ["input"]);
    const s = await S(p);
    const dom = await p.evaluate(() => ({ top: document.querySelectorAll(".fr-fruit.fr-top").length, under: document.querySelectorAll(".fr-cell .fr-fruit:not(.fr-top)").length, peekVis: getComputedStyle(document.querySelector(".fr-peek")).visibility }));
    ok("Lv5 加法：布蓋著 4 顆、掉進來的 3 顆在布上面看得到、偷看鈕出現", s.covered && dom.top === 3 && dom.under === 4 && dom.peekVis === "visible", JSON.stringify(dom));
    const tp = await F(p, "tapFruit", 0), tt = await F(p, "tapFruit", 4);
    ok("Lv5：蓋著的點不到、布上面的可以數", tp === 0 && tt === 1, JSON.stringify({ tp, tt }));
    const t0 = Date.now(); const pk = await F(p, "peek"); const s1 = await S(p);
    const cl = await p.evaluate(() => document.querySelector(".fr-cloth").classList.contains("fr-peeking"));
    await p.waitForFunction(() => !window.__zyFruit.state().peeking, null, { timeout: 5000 });
    const dur = (Date.now() - t0) * SP;
    ok("偷看：掀開約 1.5 秒又蓋回去", pk === true && s1.peeking && cl && dur >= 1200 && dur <= 2100 && (await S(p)).covered, `${Math.round(dur)}ms`);
    for (let k = 0; k < 4; k++) { await F(p, "peek"); await sleep(120); }
    const s2 = await S(p);
    ok("偷看不限次、不扣分", s2.peeks === 5 && s2.wrong === 0 && s2.phase === "input", JSON.stringify({ peeks: s2.peeks, w: s2.wrong }));
    await F(p, "answer", 7);
    const s3 = await S(p);
    ok("偷看過照樣算第一次答對；答對後布拿掉", s3.right === 1 && !s3.covered, JSON.stringify({ r: s3.right, cov: s3.covered }));
    await waitI(p, 0);
    await waitPhase(p, ["input"]);
    const s4 = await S(p), dom2 = await p.evaluate(() => ({ hand: document.querySelectorAll(".fr-hand .fr-fruit").length }));
    ok("Lv5 減法：猴子從布下拿走 3 顆（手上看得到）、籃子剩 5 顆", s4.covered && s4.hand === 3 && dom2.hand === 3 && s4.basket === 5, JSON.stringify({ cov: s4.covered, h: s4.hand, b: s4.basket }));
    await F(p, "answerWrong");
    const s5 = await S(p);
    ok("Lv5 答錯：拿掉布一起數", !s5.covered && s5.phase === "demo");
    await p.screenshot({ path: path.join(SHOTS, "lv5_demo.png") });
    await close(o, "lv5");
  }

  // ===== 7. onEnd 不來也會往下走（保險計時）；說明語音關掉；stop 後沒有殘留 =====
  {
    const o = await open(browser, "lv=4&speed=8&noend=1&talk=0"), p = o.p;
    const st = await playRound(p, ["R", "W", "R"], false);
    const s = await S(p);
    ok("say／talk 都不回 onEnd：照樣一題一題往下走（含示範數數）", st.every(x => x === "ok") && s.i === 3, JSON.stringify(st));
    await waitPhase(p, ["build"]);
    await p.evaluate(() => window.__lab.game.stop());
    const before = await p.evaluate(() => ({ sp: window.__spoken.length, pl: window.__lab.calls.play.length }));
    await sleep(1500);
    const after = await p.evaluate(() => ({ sp: window.__spoken.length, pl: window.__lab.calls.play.length, st: window.__zyFruit.state(), fruits: document.querySelectorAll(".fr-fruit").length }));
    ok("stop()：之後不再念、不再出聲、畫面清乾淨", after.sp === before.sp && after.pl === before.pl && after.st === null && after.fruits === 0, JSON.stringify({ before, after: { sp: after.sp, pl: after.pl, f: after.fruits } }));
    await close(o, "noend");
  }

  // ===== 8. 減少動態（prefers-reduced-motion）也能玩完一題 =====
  {
    const o = await open(browser, "lv=4&speed=8", { reduced: true }), p = o.p;
    const st = await playRound(p, ["R", "F"], false);
    ok("減少動態：照樣可以玩", st.every(x => x === "ok"), JSON.stringify(st));
    await close(o, "reduced");
  }

  // ===== 9. 版面：iPad 橫／直、手機直／橫，主要元件都在畫面內、不重疊、答案鈕 ≥ 64px（含自動注音） =====
  for (const [w, h] of [[1180, 820], [820, 1180], [390, 844], [844, 390]]) for (const lv of [1, 5]) {
    const o = await open(browser, `lv=${lv}&speed=8&seed=5&ann=1`, { w, h }), p = o.p;
    await playList(p, lv, [{ op: "+", a: 6, b: 4 }, { op: "-", a: 10, b: 4 }]);
    await waitPhase(p, ["input"]); await sleep(500);
    const R = await p.evaluate(() => {
      const pick = { "🏠": "#homeBtn", "🎵": "#musicBtn", 算式: ".fr-eq", 猴子: ".fr-mk", 籃子: ".fr-bk", 果汁機: ".fr-jc", 偷看: ".fr-peek", 鈕1: ".fr-btn:nth-child(1)", 鈕2: ".fr-btn:nth-child(2)", 鈕3: ".fr-btn:nth-child(3)" };
      const out = {};
      for (const [k, sel] of Object.entries(pick)) { const e = document.querySelector(sel); if (!e) continue; const r = e.getBoundingClientRect(); if (!r.width || getComputedStyle(e).visibility === "hidden") continue; out[k] = { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }
      return { out, W: innerWidth, H: innerHeight, ann: document.querySelectorAll(".fr-peek .ac").length };
    });
    const inV = Object.entries(R.out).filter(([, r]) => r.l < -0.5 || r.t < -0.5 || r.r > R.W + 0.5 || r.b > R.H + 0.5).map(([k]) => k);
    const keys = Object.keys(R.out), lap = [];
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const a = R.out[keys[i]], b = R.out[keys[j]]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) lap.push(`${keys[i]}×${keys[j]}`); }
    const small = ["鈕1", "鈕2", "鈕3"].filter(k => !R.out[k] || R.out[k].w < 63.5 || R.out[k].h < 63.5);
    const need = ["算式", "猴子", "籃子", "果汁機", "鈕1", "鈕2", "鈕3", ...(lv === 5 ? ["偷看"] : [])].filter(k => !R.out[k]);
    ok(`版面 ${w}×${h} Lv${lv}：主要元件都在畫面內、互不重疊（含 🏠🎵）、答案鈕 ≥ 64px`, !inV.length && !lap.length && !small.length && !need.length,
      [inV.length && "出界 " + inV.join(","), lap.length && "重疊 " + lap.join(","), small.length && "太小 " + small.join(","), need.length && "缺 " + need.join(",")].filter(Boolean).join("；") || `籃子 ${Math.round(R.out.籃子.w)}×${Math.round(R.out.籃子.h)}`);
    if (lv === 5) ok(`版面 ${w}×${h}：「偷看」有自動注音`, R.ann === 2, `ac=${R.ann}`);
    await p.screenshot({ path: path.join(SHOTS, `layout_lv${lv}_${w}x${h}.png`) });
    // 減法那題：猴子手上有水果時也不重疊
    await F(p, "answer", 10); await waitI(p, 0); await waitPhase(p, ["input"]); await sleep(500);
    const R2 = await p.evaluate(() => { const g = s => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }; return { hand: g(".fr-hand"), bk: g(".fr-bk"), jc: g(".fr-jc"), W: innerWidth, H: innerHeight }; });
    const hb = R2.hand, bb = R2.bk;
    ok(`版面 ${w}×${h} Lv${lv}：猴子手上的盤子在畫面內、不蓋到籃子`, hb.l >= -0.5 && hb.r <= R2.W + 0.5 && hb.b <= R2.H + 0.5 && !(hb.l < bb.r - 1 && bb.l < hb.r - 1 && hb.t < bb.b - 1 && bb.t < hb.b - 1), JSON.stringify({ hb, bb }));
    if (lv === 1) await p.screenshot({ path: path.join(SHOTS, `layout_sub_${w}x${h}.png`) });
    await close(o, `layout ${w}x${h} Lv${lv}`);
  }

  // ===== 9b. 結算畫面：iPad 直放、手機直／橫（1180×820 在第 1 段五級都驗過）全對 10 顆 =====
  for (const [w, h] of [[820, 1180], [390, 844], [844, 390]]) {
    const o = await open(browser, `lv=1&speed=8&seed=21`, { w, h }), p = o.p;
    const steps = await playRound(p, [..."RRRRRRRRRR"]);
    await sleep(700);
    const eb = await endBad(p, 10);
    ok(`結算 ${w}×${h}：收掉算式卡／答案鈕／空籃子、果汁下面 10 顆排成 5×2、果汁杯不壓任何東西`, steps.every(x => x === "ok") && eb.length === 0, [steps.filter(x => x !== "ok").join(","), ...eb].filter(Boolean).join("；"));
    await p.screenshot({ path: path.join(SHOTS, `end_${w}x${h}.png`) });
    await close(o, `end ${w}x${h}`);
  }

  // ===== 9c. 算式的 ＋ 和 －：一樣寬、一樣粗、夠大（剛學減法要一眼分得出加減） =====
  {
    const o = await open(browser, "lv=4&speed=8"), p = o.p;
    await playList(p, 4, [{ op: "+", a: 3, b: 4 }, { op: "-", a: 10, b: 4 }]);
    const m = () => p.evaluate(() => { const e = document.querySelector(".fr-eq-t .fr-op:not(.fr-eqs)"), r = e.getBoundingClientRect(), bar = getComputedStyle(e, "::before"); return { cls: e.className, w: r.width, barW: parseFloat(bar.width), barH: parseFloat(bar.height), fs: parseFloat(getComputedStyle(e).fontSize), eq: document.querySelector(".fr-eq-t").textContent }; });
    await waitPhase(p, ["input"]); const a = await m();
    await F(p, "answer", 7); await waitI(p, 0); await waitPhase(p, ["input"]); const b = await m();
    ok("算式的 ＋ 和 － 一樣寬、一樣粗、夠大（≥ 0.55 字寬），文字照舊", /fr-plus/.test(a.cls) && /fr-minus/.test(b.cls) && Math.abs(a.barW - b.barW) < 0.5 && Math.abs(a.barH - b.barH) < 0.5 && Math.abs(a.w - b.w) < 0.5 && a.barW >= a.fs * 0.55 && a.barH >= a.fs * 0.1 && a.eq === "3＋4＝？" && b.eq === "10－4＝？",
      JSON.stringify({ a, b }));
    await p.screenshot({ path: path.join(SHOTS, "eq_minus.png") });
    await close(o, "ops");
  }

  // ===== 11. 一年級 6～10 級（docs/zhuyin-math-plan.md §7.2）：兩盒十格、Lv10 一箱十顆；不念題目、不念算式 =====
  const MAN = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, "../../voice/gemini_d/manifest.json"), "utf8")).files));
  const g1Said = [];                                       // 6 級以上測試台印出的每一句「念／說」
  const grab = async p => { g1Said.push(...(await p.evaluate(() => window.__spokenAll.filter(x => x.lv >= 6).map(x => x.k + ":" + x.text)))); };
  const closeG1 = async (o, name) => { await grab(o.p); await close(o, name); };
  const isTensQ = q => q.a % 10 === 0 && q.b % 10 === 0;
  // 題目動畫做完（可以按了）的畫面：數量、新掉進來的幾顆／猴子手上幾顆、「10」牌、箱數與零散顆數
  function boardBad(lv, s) {
    const q = s.q, bad = [], moved = lv === 10 && isTensQ(q) ? q.b / 10 : q.b;
    if (s.value !== q.c) bad.push(`數量 ${s.value}≠${q.c}`);
    if (q.op === "+" ? s.news !== moved || s.hand !== 0 : s.hand !== moved || s.news !== 0) bad.push(`新來 ${s.news}／手上 ${s.hand}（要 ${moved}）`);
    if (lv === 10) { if (s.boxes !== Math.floor(q.c / 10) || s.loose !== q.c % 10) bad.push(`箱 ${s.boxes}＋零散 ${s.loose}`); if (s.tens[0] || s.tens[1]) bad.push("Lv10 不該有 10 牌"); }
    else if (s.tens[0] !== (q.c >= 10) || s.tens[1] !== (q.c === 20) || s.boxes !== 0) bad.push(`10 牌 ${JSON.stringify(s.tens)}`);
    if (s.covered) bad.push("蓋布");
    if (s.q.choices.length !== 3 || new Set(s.q.choices).size !== 3 || !s.q.choices.includes(q.ans) || s.q.choices.some(v => v < 0 || v > (lv === 10 ? 99 : 20))) bad.push("答案鈕 " + s.q.choices.join(","));
    return bad;
  }
  const plans6 = {
    6: "RRRRRRRRRR",                                       // 10 對 → 3 星
    7: "RRWRRFRRRR",                                       // 8 對 → 2 星，錯 3 次
    8: "RRRWRRWRWW",                                       // 6 對 → 1 星
    9: "RRRRRFRRRR",                                       // 9 對 → 3 星
    10: "RWRRFRRRRW",                                      // 7 對 → 2 星，錯 4 次
  };
  const ruleOf = {
    6: q => q.op === "+" && q.a >= 10 && q.a <= 18 && q.b >= 1 && q.b <= 9 && q.c <= 20,
    7: q => q.op === "+" && q.a <= 9 && q.b <= 9 && q.c >= 11,
    8: q => q.op === "-" && q.a >= 11 && q.a <= 20 && q.b >= 1 && q.b <= 9,
    9: q => q.a >= 1 && q.b >= 1 && q.a <= 20 && q.c <= 20 && q.c >= 0,
    10: q => q.a >= 10 && q.a <= 99 && q.c >= 10 && q.c <= 99 && (isTensQ(q) || (q.b <= 9 && (q.op === "+" ? q.a % 10 + q.b <= 9 : q.a % 10 - q.b >= 0))),
  };
  for (const lv of [6, 7, 8, 9, 10]) {
    const o = await open(browser, `lv=${lv}&speed=8&seed=${lv * 3}`), p = o.p;
    const plan = plans6[lv], want = [...plan].filter(c => c === "R").length, wantWrong = [...plan].reduce((s, c) => s + (c === "W" ? 1 : c === "F" ? 2 : 0), 0);
    const steps = [], bad = [];
    for (const k of plan) {
      if (await waitPhase(p, ["input"], 20000)) { const s = await S(p); const b = boardBad(lv, s); if (b.length) bad.push(`第${s.i + 1}題 ${s.q.a}${s.q.op}${s.q.b}：${b.join("、")}`); }
      steps.push(await doQ(p, k));
    }
    await p.waitForFunction(() => window.__lab.calls.win.length > 0, null, { timeout: 15000 }).catch(() => {});
    const win = await p.evaluate(() => window.__lab.calls.win.slice()), s = await S(p), r = win[0] || {};
    const round = await F(p, "round"), ev = await F(p, "events");
    ok(`Lv${lv}：一局 10 題都走完（${plan}）`, steps.every(x => x === "ok"), steps.filter(x => x !== "ok").join(","));
    ok(`Lv${lv}：每題畫面數量＝算式（新來的／猴子手上的顆數、10 牌、箱數都對）`, bad.length === 0, bad.slice(0, 3).join("；"));
    ok(`Lv${lv}：onWin 一次、right 只算第一次答對（${want}）、wrong＝${wantWrong}、星數 ${starsOf(want)}`, win.length === 1 && r.lv === lv && r.right === want && r.wrong === wantWrong && r.total === 10 && r.stars === starsOf(want), JSON.stringify(r));
    ok(`Lv${lv}：果汁機裡的水果＝第一次就答對的題數`, s && s.juice === want, `juice=${s && s.juice}`);
    ok(`Lv${lv}：這局題目符合這一級的範圍`, round.length === 10 && round.every(ruleOf[lv]), round.filter(q => !ruleOf[lv](q)).map(q => `${q.a}${q.op}${q.b}`).join(" "));
    const fg = ev.filter(e => e.k === "finger");
    ok(`Lv${lv}：這次開機第一次玩 → 第一題有手指示範（只一次）`, fg.length === 1 && fg[0].i === 0, JSON.stringify(fg));
    const said = ev.filter(e => e.k === "say" || e.k === "talk").map(e => e.text);
    ok(`Lv${lv}：不念題目、不念算式（整局只說示範與結算那幾句）`, !said.some(t => /加|減|等於|籃子裡有|掉進|拿走|幾顆/.test(t)) && said.includes("果汁打好囉！") && (wantWrong === 0 || said.includes("我們一起數數看")), JSON.stringify([...new Set(said)]));
    await sleep(700);
    const eb = await endBad(p, want);
    ok(`Lv${lv} 結算：收掉算式卡／答案鈕／空籃子、果汁杯不壓任何東西`, eb.length === 0, eb.join("；"));
    await p.screenshot({ path: path.join(SHOTS, `end_lv${lv}.png`) });
    await closeG1(o, `Lv${lv}`);
  }

  // ===== 11b. Lv7 進位（8＋5）：第一盒放滿那一刻掛「10」牌、新來的 5 顆底色不同；答錯示範（整盒 10 → 11、12、13）；錯兩次點對才過；數數幫手只念到十 =====
  {
    const SP = 2, o = await open(browser, `lv=7&speed=${SP}`), p = o.p;
    await playList(p, 7, [{ op: "+", a: 8, b: 5 }, { op: "+", a: 9, b: 4 }]);
    await p.waitForFunction(() => window.__zyFruit.state().basket >= 10, null, { timeout: 15000 });
    const s0 = await S(p);
    const d0 = await p.evaluate(() => { const t = document.querySelector(".fr-frame:not(.fr-frame2) .fr-ten"), r = t.getBoundingClientRect(), t2 = document.querySelector(".fr-frame2 .fr-ten"); return { txt: t.textContent, w: t.offsetWidth, h: t.offsetHeight, disp: getComputedStyle(t).display, disp2: getComputedStyle(t2).display }; });
    ok("Lv7 進位 8＋5：第一盒放滿（第 10 顆）時就掛「10」牌，那時還在放（只多 2 顆新的）", s0.basket === 10 && s0.phase === "build" && s0.tens[0] === true && s0.tens[1] === false && s0.news === 2 && d0.txt === "10" && d0.disp === "block" && d0.w > 20 && d0.disp2 === "none", JSON.stringify({ b: s0.basket, ph: s0.phase, tens: s0.tens, news: s0.news, d0 }));
    await waitPhase(p, ["input"]);
    const s1 = await S(p), ev = await F(p, "events");
    const puts = ev.filter(e => e.k === "put"), ten = ev.find(e => e.k === "ten"), gap = puts[10] && puts[9] ? (puts[10].t - puts[9].t) * SP : 0;
    ok("Lv7 進位：湊滿 10 之後停一下才放第 11 顆（看得出「先補滿、再多 3 顆」）", puts.length === 13 && ten && ten.n === 0 && ten.t >= puts[9].t && ten.t <= puts[10].t && gap >= 900, `gap=${Math.round(gap)}ms`);
    const d1 = await p.evaluate(() => [...document.querySelectorAll(".fr-cell")].map(c => { const f = c.querySelector(".fr-fruit"); return !f ? "_" : f.classList.contains("fr-new") && getComputedStyle(f, "::before").backgroundColor === "rgb(207, 232, 255)" ? "N" : getComputedStyle(f, "::before").content === "none" ? "o" : "?"; }).join(""));
    ok("Lv7 進位：13 顆從左上排起，後 5 顆（新掉進來的）是淡藍底", s1.value === 13 && s1.news === 5 && d1 === "ooooooooNNNNN_______", d1);
    await sleep(400);
    const tb = await p.evaluate(() => { const t = document.querySelector(".fr-frame:not(.fr-frame2) .fr-ten"); return { k: t.getBoundingClientRect().height / t.offsetHeight, big: window.__zyFruit.state().tenBig }; });
    ok("Lv7 可以作答時：滿盒的「10」牌放大約 1.5 倍（沒滿的那盒沒有）", tb.big[0] === true && tb.big[1] === false && tb.k > 1.3 && tb.k < 1.8, JSON.stringify(tb));
    ok("6 級以上：🔊 收起來、沒有蓋布／偷看鈕", await p.evaluate(() => getComputedStyle(document.querySelector(".fr-say")).display === "none" && getComputedStyle(document.querySelector(".fr-peek")).display === "none" && document.querySelector(".fr-cloth").classList.contains("fr-off")));
    // 💬 再念一次：6 級以上不念
    await clearSpoken(p);
    const sc = await p.evaluate(() => window.__lab.game.sayCurrent()); await sleep(200);
    ok("6 級以上 💬 再念一次：不出聲（只讓新來的水果跳一下）", sc === true && (await spoken(p)).length === 0, JSON.stringify(await spoken(p)));
    // 答錯第 1 次：示範（不念數字）
    const w1 = await F(p, "answerWrong"), sA = await S(p);
    let locked = 0; for (let k = 0; k < 4; k++) { const r1 = await F(p, "answerWrong"), r2 = await F(p, "answer", 13); if (r1 === "locked" && r2 === "locked") locked++; await sleep(50); }
    await waitPhase(p, ["input"]);
    const sB = await S(p), nums = await p.evaluate(() => [...document.querySelectorAll(".fr-cell .fr-num")].map(n => n.textContent).join(",")), sp1 = (await spoken(p)).map(x => x.k + ":" + x.text);
    ok("Lv7 答錯第 1 次：有示範（那顆鈕變灰、示範中點不掉），整盒亮「10」再接著 11、12、13", w1 === "wrong" && sA.phase === "demo" && sA.grey.length === 1 && locked === 4 && sB.wrong === 1 && nums === "10,11,12,13" && sB.enabled.length === 2, JSON.stringify({ w1, ph: sA.phase, locked, nums, en: sB.enabled }));
    ok("Lv7 示範：只說「我們一起數數看」，數字不念（跳出數字＋音）", JSON.stringify(sp1) === JSON.stringify(["talk:我們一起數數看"]), JSON.stringify(sp1));
    // 答錯第 2 次：只剩正確鈕，點了才過
    const w2 = await F(p, "answerWrong"); await waitPhase(p, ["forced"]);
    const sD = await S(p), others = sD.q.choices.filter(v => v !== 13);
    const dd = [await F(p, "answer", others[0]), await F(p, "answer", others[1])]; await sleep(300);
    const sE = await S(p), g = await F(p, "answer", 13), sF = await S(p);
    ok("Lv7 答錯第 2 次：只剩正確鈕發亮，點錯的沒反應、點了正確的才過，right 不加", w2 === "wrong" && sD.glow === 13 && JSON.stringify(sD.enabled) === "[13]" && dd.join() === "dead,dead" && sE.i === 0 && sE.wrong === 2 && g === "right" && sF.right === 0 && sF.results[0].first === false, JSON.stringify({ w2, glow: sD.glow, en: sD.enabled, dd, g, right: sF.right }));
    const eqA = await p.evaluate(() => document.querySelector(".fr-eq-t").textContent);
    ok("Lv7 答對：算式卡把 ？ 換成答案（8＋5＝13），不念算式", eqA === "8＋5＝13" && !(await spoken(p)).some(x => /等於/.test(x.text)), eqA);
    // 數數幫手：照樣跳數字，只有 ≤ 10 的會念
    await waitI(p, 0); await waitPhase(p, ["input"]); await sleep(200); await clearSpoken(p);
    const taps = []; for (let k = 0; k < 13; k++) taps.push(await F(p, "tapFruit", k));
    const sp2 = (await spoken(p)).map(x => x.text);
    ok("6 級以上數數幫手：點了跳出 1～13，只念一到十（十一以上不念）", taps.join() === "1,2,3,4,5,6,7,8,9,10,11,12,13" && sp2.join("") === "一二三四五六七八九十", JSON.stringify({ taps, sp2 }));
    await p.screenshot({ path: path.join(SHOTS, "lv7_helper.png") });
    await closeG1(o, "lv7");
  }

  // ===== 11c. Lv8 退位（13－5）：猴子從最後面拿（先拿第二盒、再拿第一盒），「10」牌拿掉，剩 8 顆 =====
  {
    const o = await open(browser, "lv=8&speed=4"), p = o.p;
    await playList(p, 8, [{ op: "-", a: 13, b: 5 }, { op: "-", a: 18, b: 9 }, { op: "-", a: 17, b: 3 }]);
    await waitPhase(p, ["input"]);
    const s = await S(p), ev = await F(p, "events");
    const dom = await p.evaluate(() => ({ cells: [...document.querySelectorAll(".fr-cell")].map(c => c.querySelectorAll(".fr-fruit").length).join(""), hand: document.querySelectorAll(".fr-hand .fr-fruit").length, handOp: +getComputedStyle(document.querySelector(".fr-hand")).opacity, tag: getComputedStyle(document.querySelector(".fr-frame .fr-ten")).display }));
    ok("Lv8 退位 13－5：籃子剩 8 顆（左上排起、沒有殘影）、猴子手上 5 顆看得到", s.value === 8 && s.basket === 8 && s.hand === 5 && dom.cells === "11111111000000000000" && dom.hand === 5 && dom.handOp > 0.9, JSON.stringify({ v: s.value, h: s.hand, dom }));
    ok("Lv8 退位：一開始第一盒有「10」牌，猴子拿到第一盒後牌子拿掉；從第 13 格往前拿", ev.some(e => e.k === "ten" && e.n === 0) && s.tens[0] === false && dom.tag === "none" && ev.filter(e => e.k === "take").map(e => e.n).join() === "12,11,10,9,8", JSON.stringify({ tens: s.tens, takes: ev.filter(e => e.k === "take").map(e => e.n) }));
    await F(p, "answer", 8); await waitI(p, 0); await waitPhase(p, ["input"]);
    const s2 = await S(p);
    ok("Lv8 18－9：剩 9 顆、猴子手上 9 顆", s2.value === 9 && s2.hand === 9 && (await p.evaluate(() => document.querySelectorAll(".fr-hand .fr-fruit").length)) === 9, JSON.stringify({ v: s2.value, h: s2.hand }));
    await F(p, "answer", 9); await waitI(p, 1); await waitPhase(p, ["input"]);
    const s3 = await S(p);
    ok("Lv8 不退位 17－3：剩 14 顆、第一盒還是滿的（10 牌還在）", s3.value === 14 && s3.hand === 3 && s3.tens[0] === true && s3.tens[1] === false, JSON.stringify({ v: s3.value, tens: s3.tens }));
    await closeG1(o, "lv8");
  }

  // ===== 11d. Lv10 一箱十顆：箱數＝十位數、零散顆數＝個位數；整十題動箱子、二位數±一位數動零散的；答對後畫面數量＝答案 =====
  {
    const o = await open(browser, "lv=10&speed=5"), p = o.p;
    await playList(p, 10, [{ op: "+", a: 30, b: 20 }, { op: "-", a: 90, b: 80 }, { op: "+", a: 34, b: 5 }, { op: "-", a: 38, b: 5 }]);
    const dom = () => p.evaluate(() => { const q = (s) => document.querySelectorAll(s).length; return { c1: q(".fr-frame:not(.fr-frame2) .fr-crate"), f1: q(".fr-frame:not(.fr-frame2) .fr-fruit:not(.fr-crate)"), c2: q(".fr-frame2 .fr-crate"), f2: q(".fr-frame2 .fr-fruit:not(.fr-crate)"), newC: q(".fr-cell .fr-crate.fr-new"), newF: q(".fr-cell .fr-fruit.fr-new:not(.fr-crate)"), hc: q(".fr-hand .fr-crate"), hf: q(".fr-hand .fr-fruit:not(.fr-crate)"), lab: [...document.querySelectorAll(".fr-cell .fr-crate-n")].every(n => n.textContent === "10"), eq: document.querySelector(".fr-eq-t").textContent }; });
    const after = async ans => { const r = await F(p, "answer", ans); await sleep(150); const s = await S(p), d = await dom(); return { r, v: s.value, eq: d.eq, right: s.right }; };
    await waitPhase(p, ["input"]);
    let s = await S(p), d = await dom(), a = await after(50);
    ok("Lv10 整十加 30＋20：5 箱（其中 2 箱是新滑進來的）、沒有零散的；箱子都在第一盒、印 10", s.boxes === 5 && s.loose === 0 && s.value === 50 && d.c1 === 5 && d.c2 === 0 && d.f1 + d.f2 === 0 && d.newC === 2 && d.lab, JSON.stringify({ b: s.boxes, l: s.loose, d }));
    ok("Lv10 30＋20 答對後：畫面數量＝答案 50、算式卡顯示 30＋20＝50", a.r === "right" && a.v === 50 && a.eq === "30＋20＝50" && a.right === 1, JSON.stringify(a));
    await waitI(p, 0); await waitPhase(p, ["input"]);
    s = await S(p); d = await dom(); a = await after(10);
    ok("Lv10 整十減 90－80：猴子搬走 8 箱（手上看得到 8 箱）、剩 1 箱", s.boxes === 1 && s.loose === 0 && s.value === 10 && s.hand === 8 && d.hc === 8 && d.hf === 0 && d.c1 === 1, JSON.stringify({ b: s.boxes, h: s.hand, d }));
    ok("Lv10 90－80 答對後：畫面數量＝答案 10", a.r === "right" && a.v === 10 && a.eq === "90－80＝10", JSON.stringify(a));
    await waitI(p, 1); await waitPhase(p, ["input"]);
    s = await S(p); d = await dom();
    ok("Lv10 34＋5：3 箱（十位數）＋9 顆零散（個位數；其中 5 顆新的），零散的都在第二盒", s.boxes === 3 && s.loose === 9 && s.value === 39 && d.c1 === 3 && d.f2 === 9 && d.f1 === 0 && d.c2 === 0 && d.newF === 5 && d.newC === 0, JSON.stringify({ b: s.boxes, l: s.loose, d }));
    ok("Lv10 答案鈕是二位數、含正確答案（34＋5 → 39）", s.q.choices.includes(39) && s.q.choices.every(v => v >= 1 && v <= 99) && new Set(s.q.choices).size === 3, s.q.choices.join(","));
    // 數數幫手：一箱算 10
    await clearSpoken(p);
    const t1 = await F(p, "tapFruit", 0), t2 = await F(p, "tapFruit", 1), t3 = await F(p, "tapFruit", 3), spT = (await spoken(p)).map(x => x.text);
    ok("Lv10 數數幫手：點箱子一次加 10（10、20），再點水果 21；只念「十」", t1 === 10 && t2 === 20 && t3 === 21 && spT.join() === "十", JSON.stringify({ t1, t2, t3, spT }));
    // 答錯示範：10、20、30、31…39
    await clearSpoken(p);
    await F(p, "answerWrong"); await waitPhase(p, ["input"]);
    const nums = await p.evaluate(() => [...document.querySelectorAll(".fr-cell .fr-num")].map(n => n.textContent).join(",")), spD = (await spoken(p)).map(x => x.k + ":" + x.text);
    ok("Lv10 答錯示範：箱子 10、20、30 一箱一箱數，再接著 31～39；不念數字", nums === "10,20,30,31,32,33,34,35,36,37,38,39" && JSON.stringify(spD) === JSON.stringify(["talk:我們一起數數看"]), JSON.stringify({ nums, spD }));
    await p.screenshot({ path: path.join(SHOTS, "lv10_demo.png") });
    await F(p, "answerWrong"); await waitPhase(p, ["forced"]);
    const sF = await S(p); a = await after(39);
    ok("Lv10 錯兩次：只剩正確鈕 39，點了才過、right 不加", sF.glow === 39 && JSON.stringify(sF.enabled) === "[39]" && a.r === "right" && a.v === 39 && a.right === 2, JSON.stringify({ glow: sF.glow, en: sF.enabled, a }));
    await waitI(p, 2); await waitPhase(p, ["input"]);
    s = await S(p); d = await dom(); a = await after(33);
    ok("Lv10 38－5：猴子拿走 5 顆零散的（手上 5 顆），剩 3 箱＋3 顆；答對後畫面＝33", s.boxes === 3 && s.loose === 3 && s.hand === 5 && d.hf === 5 && d.hc === 0 && a.r === "right" && a.v === 33, JSON.stringify({ b: s.boxes, l: s.loose, h: s.hand, d, a }));
    // 出題：20 局都在 10～99、不進位不退位；答案鈕一個差 1、一個差 10
    const R10 = await p.evaluate(() => { const out = []; for (let k = 0; k < 20; k++) { window.__zyFruit.play(10); out.push(...window.__zyFruit.round()); } window.__zyFruit.game.stop(); return out; });
    ok("Lv10（20 局）：都在 10～99、不進位不退位；答案鈕 3 顆不重複含正確答案", R10.length === 200 && R10.every(ruleOf[10]) && R10.every(q => q.choices.length === 3 && new Set(q.choices).size === 3 && q.choices.includes(q.ans)), R10.filter(q => !ruleOf[10](q)).slice(0, 3).map(q => `${q.a}${q.op}${q.b}`).join(" "));
    const lim = await p.evaluate(() => { window.__lab.game.start(99); const a = window.__zyFruit.state().lv; window.__lab.game.start(0); const b = window.__zyFruit.state().lv; window.__lab.game.stop(); return [a, b]; });
    ok("start(lv)：等級夾在 1～10", lim.join() === "10,1", lim.join());
    await closeG1(o, "lv10");
  }

  // ===== 11e. 6 級以上版面：iPad 橫／直、手機橫／直。兩盒 20 格放滿、Lv10 九箱＋九顆＋猴子手上的，都在畫面內、不重疊 =====
  for (const [w, h] of [[1024, 768], [768, 1024], [844, 390], [390, 844]]) for (const [lv, list, last] of [[6, [{ op: "+", a: 11, b: 9 }, { op: "-", a: 18, b: 9 }], 20], [10, [{ op: "+", a: 91, b: 8 }, { op: "-", a: 90, b: 80 }], 99]]) {
    const o = await open(browser, `lv=${lv}&speed=8&seed=5&ann=1`, { w, h }), p = o.p;
    await playList(p, lv, list);
    const measure = () => p.evaluate(() => {
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none"; };
      const B = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const pick = { "🏠": "#homeBtn", "🎵": "#musicBtn", 算式: ".fr-eq", 猴子: ".fr-mk", 籃子: ".fr-bk", 果汁機: ".fr-jc", 鈕1: ".fr-btn:nth-child(1)", 鈕2: ".fr-btn:nth-child(2)", 鈕3: ".fr-btn:nth-child(3)" };
      const out = {}; for (const [k, sel] of Object.entries(pick)) { const e = document.querySelector(sel); if (e && vis(e)) out[k] = B(e); }
      const fr = [...document.querySelectorAll(".fr-frame")].filter(vis).map(B), items = [...document.querySelectorAll(".fr-cell .fr-fruit")].map(B), tags = [...document.querySelectorAll(".fr-ten")].filter(vis).map(B);
      const hand = B(document.querySelector(".fr-hand")), handN = document.querySelectorAll(".fr-hand .fr-fruit").length, mini = [...document.querySelectorAll(".fr-hand .fr-fruit")].map(B);
      return { out, fr, items, tags, hand, handN, mini, cell: B(document.querySelector(".fr-cell")), W: innerWidth, H: innerHeight, say: vis(document.querySelector(".fr-say")), ann: [...document.querySelectorAll(".fr-stage .ac")].filter(vis).length };
    });
    const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    const judge = (R, withHand) => {
      const outV = r => r.l < -0.5 || r.t < -0.5 || r.r > R.W + 0.5 || r.b > R.H + 0.5, bad = [];
      const inV = Object.entries(R.out).filter(([, r]) => outV(r)).map(([k]) => k); if (inV.length) bad.push("出界 " + inV.join(","));
      const keys = Object.keys(R.out); for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (hit(R.out[keys[i]], R.out[keys[j]])) bad.push(`重疊 ${keys[i]}×${keys[j]}`);
      const need = ["算式", "猴子", "籃子", "果汁機", "鈕1", "鈕2", "鈕3"].filter(k => !R.out[k]); if (need.length) bad.push("缺 " + need.join(","));
      if (["鈕1", "鈕2", "鈕3"].some(k => R.out[k] && (R.out[k].w < 63.5 || R.out[k].h < 63.5))) bad.push("答案鈕 < 64px");
      if (R.fr.length !== 2) bad.push(`十格盒 ${R.fr.length} 個`); else { if (hit(R.fr[0], R.fr[1])) bad.push("兩盒重疊"); const bk = R.out.籃子; if (bk && R.fr.some(f => f.l < bk.l - 1 || f.r > bk.r + 1 || f.t < bk.t - 1 || f.b > bk.b + 1)) bad.push("十格盒跑出籃子"); }
      if (R.items.some(outV)) bad.push("有水果／箱子出界");
      for (const t of R.tags) { if (outV(t)) bad.push("10 牌出界"); for (const k of ["🏠", "🎵", "算式", "鈕1", "鈕2", "鈕3", "猴子", "果汁機"]) if (R.out[k] && hit(t, R.out[k])) bad.push("10 牌壓到 " + k); }
      if (R.cell.w < 40) bad.push(`格子只有 ${Math.round(R.cell.w)}px`);
      if (R.say) bad.push("🔊 還在");
      if (withHand) { if (outV(R.hand) || R.mini.some(outV)) bad.push("猴子的盤子出界"); if (R.out.籃子 && hit(R.hand, R.out.籃子)) bad.push("盤子壓到籃子"); for (const k of ["算式", "鈕1", "鈕2", "鈕3", "果汁機", "🏠", "🎵"]) if (R.out[k] && hit(R.hand, R.out[k])) bad.push("盤子壓到 " + k); }
      return bad;
    };
    await waitPhase(p, ["input"]); await sleep(500);
    const R1 = await measure(), b1 = judge(R1, false), s1 = await S(p);
    ok(`版面 ${w}×${h} Lv${lv} 加法（${lv === 10 ? "9 箱＋9 顆" : "20 格放滿、兩個 10 牌"}）：都在畫面內、互不重疊（含 🏠🎵）、答案鈕 ≥ 64px`, b1.length === 0 && R1.items.length === (lv === 10 ? 18 : 20) && R1.tags.length === (lv === 10 ? 0 : 2), b1.join("；") || `格子 ${Math.round(R1.cell.w)}px ${s1.row ? "左右並排" : "上下排"}`);
    if (lv === 6) ok(`版面 ${w}×${h}：6 級以上畫面沒有新的中文字（自動注音 0 個）`, R1.ann === 0, `ac=${R1.ann}`);
    await p.screenshot({ path: path.join(SHOTS, `g1_lv${lv}_add_${w}x${h}.png`) });
    await F(p, "answer", last); await waitI(p, 0); await waitPhase(p, ["input"]); await sleep(500);
    const R2 = await measure(), b2 = judge(R2, true);
    ok(`版面 ${w}×${h} Lv${lv} 減法（猴子手上 ${lv === 10 ? "8 箱" : "9 顆"}）：盤子在畫面內、不壓到籃子／算式／答案鈕`, b2.length === 0 && R2.handN === (lv === 10 ? 8 : 9), b2.join("；") || `盤子 ${Math.round(R2.hand.w)}×${Math.round(R2.hand.h)}`);
    await p.screenshot({ path: path.join(SHOTS, `g1_lv${lv}_sub_${w}x${h}.png`) });
    await closeG1(o, `g1 layout ${w}x${h} Lv${lv}`);
  }

  // ===== 11f. 6 級以上：減少動態、onEnd 不來也能玩；整段測試念過的每一句都在 voice/gemini_d/manifest.json =====
  {
    const o = await open(browser, "lv=9&speed=8&noend=1", { reduced: true }), p = o.p;
    const st = await playRound(p, ["R", "W", "F"], false);
    ok("Lv9 減少動態＋say／talk 不回 onEnd：照樣可以玩（含示範、錯兩次）", st.every(x => x === "ok") && (await S(p)).i === 3, JSON.stringify(st));
    await closeG1(o, "g1 reduced");
    const uniq = [...new Set(g1Said)], miss = uniq.filter(t => !MAN.has(t.replace(/^(say|talk):/, "")));
    ok(`6 級以上念過的每一句都有錄音（manifest.json；共 ${uniq.length} 種）`, uniq.length >= 3 && miss.length === 0, miss.length ? "沒錄音：" + miss.join("／") : uniq.join("／"));
    ok("6 級以上沒有念算式、題目句、10 以上的數", !uniq.some(t => /加|減|等於|籃子裡有|掉進|拿走|十[一二三四五六七八九]|[二三四五六七八九]十/.test(t)), uniq.join("／"));
  }

  // ===== 11g. 審查後補（11-15）：tap 事件、Lv10 首題示範只在箱子上跳整十、發呆自動再示範（每題一次）、示範不按答案鈕 =====
  // 頁內取樣器：示範期間每 30ms 看一次手指有沒有碰到答案鈕、哪些東西上面跳了數字
  const sampler = p => p.evaluate(() => {
    const G = window.__fg = { n: 0, hit: 0, loose: 0, nums: [], btnTouched: 0 };
    setInterval(() => {
      const f = document.querySelector(".fr-finger");
      if (f && +getComputedStyle(f).opacity > 0.05) { const r = f.getBoundingClientRect(); G.n++; for (const b of document.querySelectorAll(".fr-btn")) { const q = b.getBoundingClientRect(); if (r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom) G.hit++; } }
      for (const n of document.querySelectorAll(".fr-cell .fr-num")) { if (n.closest(".fr-crate")) { if (!G.nums.includes(n.textContent)) G.nums.push(n.textContent); } else G.loose++; }
      if (document.querySelector(".fr-btn.fr-ok, .fr-btn.fr-x, .fr-btn.fr-glow")) G.btnTouched++;
    }, 30);
  });
  for (const lv of [1, 6]) {
    const o = await open(browser, `lv=${lv}&speed=8&seed=2`), p = o.p;
    await waitPhase(p, ["input"], 20000);
    const n = await F(p, "tapFruit", 0), ev = (await F(p, "events")).filter(e => e.k === "tap");
    ok(`Lv${lv}：點水果後 events() 有 k:"tap"（n＝1）`, n === 1 && ev.length === 1 && ev[0].n === 1 && ev[0].i === 0, JSON.stringify({ n, ev }));
    if (lv >= 6) await closeG1(o, `tap Lv${lv}`); else await close(o, `tap Lv${lv}`);
  }
  {
    // Lv10 這次開機第一題：箱子上依序跳 10、20、30…，零散的不跳；手指只在答案鈕上方晃、不碰鈕
    const o = await open(browser, "lv=10&speed=2&seed=4"), p = o.p;
    await sampler(p);
    await p.waitForFunction(() => window.__zyFruit.events().some(e => e.k === "finger"), null, { timeout: 30000 });
    const sA = await S(p), lockedR = await F(p, "answer", sA.q.ans), tapR = await F(p, "tapFruit", 0);
    await waitPhase(p, ["input"], 30000);
    const s = await S(p), ev = await F(p, "events"), G = await p.evaluate(() => window.__fg);
    const hints = ev.filter(e => e.k === "hint").map(e => e.n), wantH = Array.from({ length: s.boxes }, (_, k) => (k + 1) * 10);
    ok(`Lv10 首題示範（${s.q.a}${s.q.op}${s.q.b}，${s.boxes} 箱＋${s.loose} 顆）：箱子上依序跳 ${wantH.join("、")}，零散的沒有跳`, s.boxes >= 1 && hints.join() === wantH.join() && G.nums.join() === wantH.map(String).join() && G.loose === 0, JSON.stringify({ hints, nums: G.nums, loose: G.loose }));
    ok("Lv10 首題示範：示範中答案鈕、水果都點不動；做完數字收掉（數數幫手從頭算）", sA.phase === "build" && lockedR === "locked" && tapR === 0 && s.badges.every(b => b === 0) && s.right === 0 && s.wrong === 0, JSON.stringify({ ph: sA.phase, lockedR, tapR, badges: s.badges }));
    ok("Lv10 首題示範：手指只在答案鈕上方晃、沒有碰到（按下）任何一顆鈕", G.n >= 5 && G.hit === 0 && G.btnTouched === 0, JSON.stringify({ n: G.n, hit: G.hit, btn: G.btnTouched }));
    const dotN = await p.evaluate(() => { const c = document.querySelector(".fr-cell .fr-crate"); return { dots: c.querySelectorAll(".fr-crate-dots > i").length, n: c.querySelector(".fr-crate-n").textContent, pic: c.querySelectorAll(".fr-pic").length, w: c.querySelector(".fr-crate-dots > i").getBoundingClientRect().width }; });
    ok("Lv10 箱子面：2×5 共 10 個小點＋印 10（不再是一顆水果）", dotN.dots === 10 && dotN.n === "10" && dotN.pic === 0 && dotN.w >= 4, JSON.stringify(dotN));
    await closeG1(o, "lv10 first");
  }
  {
    // 發呆：可以作答後約 9 秒（這裡調成 4 秒、4 倍速）沒點東西 → 自動示範一次；每題最多一次；作答過就不再播
    const SP = 4, IDLE = 4000, o = await open(browser, `lv=7&speed=${SP}&idle=${IDLE}`), p = o.p;
    const T0 = await F(p, "tune");
    await waitPhase(p, ["input"], 30000);
    await playList(p, 7, [{ op: "+", a: 8, b: 5 }, { op: "+", a: 9, b: 4 }, { op: "+", a: 7, b: 6 }]);
    await sampler(p);
    await waitPhase(p, ["input"]);
    const e0 = await F(p, "events");
    const got = await waitPhase(p, ["demo"], 8000), sD = await S(p), lockedR = await F(p, "answer", 13), e1 = await F(p, "events");
    const ready = e1.find(e => e.k === "ready"), idle = e1.filter(e => e.k === "idle"), dt = idle[0] && ready ? (idle[0].t - ready.t) * SP : 0;
    ok("發呆自動示範：預設 9 秒（可用 tune 調）；playList 的這一局不是開機第一局 → 開頭沒有示範", /idle: 9000,/.test(fs.readFileSync(path.join(__dirname, "../../js/zhuyin-fruit.js"), "utf8")) && e0.filter(e => e.k === "finger" || e.k === "idle").length === 0 && T0.idle === IDLE, JSON.stringify({ idle: T0.idle }));
    ok(`發呆自動示範：可以作答後約 ${IDLE / 1000} 秒沒點 → 自動示範一次，示範中鎖輸入`, got && idle.length === 1 && dt >= IDLE * 0.85 && dt <= IDLE * 1.6 && sD.phase === "demo" && lockedR === "locked" && e1.filter(e => e.k === "finger").length === 1, JSON.stringify({ got, dt: Math.round(dt), lockedR }));
    await waitPhase(p, ["input"]);
    await sleep(IDLE / SP * 2.4);
    const e2 = await F(p, "events"), s2 = await S(p), G = await p.evaluate(() => window.__fg);
    ok("發呆自動示範：每題最多一次（再等兩倍時間也不重播）、示範完回到可以作答", e2.filter(e => e.k === "idle").length === 1 && s2.phase === "input" && s2.i === 0 && s2.wrong === 0, JSON.stringify({ idle: e2.filter(e => e.k === "idle").length, ph: s2.phase }));
    ok("Lv7 手指示範：先比水果、再到答案鈕上方晃，沒有碰到（按下）任何一顆鈕", G.n >= 5 && G.hit === 0 && G.btnTouched === 0, JSON.stringify({ n: G.n, hit: G.hit }));
    await F(p, "answer", 13); await waitI(p, 0); await waitPhase(p, ["input"]);
    await F(p, "answerWrong"); await waitPhase(p, ["input"]);          // 第 2 題：答錯一次（看完數數示範）
    await sleep(IDLE / SP * 2.2);
    const e3 = await F(p, "events"), s3 = await S(p);
    ok("發呆自動示範：作答過（答錯看完示範）之後不再觸發", e3.filter(e => e.k === "idle" && e.i === 1).length === 0 && s3.phase === "input" && s3.i === 1 && s3.idled === true, JSON.stringify({ idle: e3.filter(e => e.k === "idle").map(e => e.i), ph: s3.phase }));
    await F(p, "answer", 13); await waitI(p, 1); await waitPhase(p, ["input"]);
    // 第 3 題：一直有在點水果（每次點都重新算）→ 不示範；暫停時計時凍結
    for (let k = 0; k < 4; k++) { await sleep(IDLE / SP * 0.6); await F(p, "tapFruit", k); }
    const e4 = await F(p, "events");
    await p.evaluate(() => window.__lab.setPaused(true)); await sleep(IDLE / SP * 1.8);
    const e5 = await F(p, "events");
    await p.evaluate(() => window.__lab.setPaused(false));
    const got2 = await waitPhase(p, ["demo"], 8000);
    ok("發呆計時：有點水果就重新算；暫停時凍結，繼續後才示範", e4.filter(e => e.k === "idle" && e.i === 2).length === 0 && e5.filter(e => e.k === "idle" && e.i === 2).length === 0 && got2, JSON.stringify({ tapping: e4.filter(e => e.k === "idle" && e.i === 2).length, paused: e5.filter(e => e.k === "idle" && e.i === 2).length, got2 }));
    await closeG1(o, "idle");
  }

  // ===== 10. 沒有 console 錯誤 =====
  ok("沒有 console error／頁面錯誤（缺圖 404 除外）", allErrs.length === 0, allErrs.slice(0, 4).join(" | "));
  await browser.close();
  const pass = results.filter(r => r.startsWith("PASS")).length, fail = results.length - pass;
  console.log(`\n水果籃算算看：${pass} PASS／${fail} FAIL（共 ${results.length} 項）　截圖：${SHOTS}`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
