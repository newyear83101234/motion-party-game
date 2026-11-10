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
  await p.goto(`${BASE}?clean=1${q ? "&" + q : ""}`);
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
const lineCheck = p => p.evaluate(async () => {
  const M = window.__lab.mod, C = await import("../../js/zhuyin-math-core.js?v=1");
  const G = window.__zyFruit, round = G.round(), ev = G.events(), bad = [];
  let eqOk = 0, fullOk = 0, shortOk = 0;
  round.forEach((q, i) => {
    const said = ev.filter(e => e.i === i && (e.k === "say" || e.k === "talk")).map(e => e.text);
    const fr = M.FRUITS.find(f => said.includes(M.openLine(q.a, f)));
    if (said.includes(C.eqText(q))) eqOk++; else bad.push(`第${i + 1}題沒念 ${C.eqText(q)}`);
    if (i < 2) { if (fr && said.includes(M.actLine(q, true)) && !said.includes(M.actLine(q, false))) fullOk++; else bad.push(`第${i + 1}題不是完整句：${said.join("／")}`); }
    else { if (!fr && said.includes(M.actLine(q, false)) && !said.includes(M.actLine(q, true))) shortOk++; else bad.push(`第${i + 1}題不是縮短句：${said.join("／")}`); }
  });
  const all = ev.filter(e => e.k === "say" || e.k === "talk").map(e => e.text);
  return { eqOk, fullOk, shortOk, bad, er: all.filter(t => /二顆/.test(t)), round };
});

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
    const L = await lineCheck(p);
    ok(`Lv${lv}：每題答對都念 eqText（${L.eqOk}/10）`, L.eqOk === 10, L.bad.filter(b => /沒念/.test(b)).slice(0, 2).join(" "));
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

  // ===== 10. 沒有 console 錯誤 =====
  ok("沒有 console error／頁面錯誤（缺圖 404 除外）", allErrs.length === 0, allErrs.slice(0, 4).join(" | "));
  await browser.close();
  const pass = results.filter(r => r.startsWith("PASS")).length, fail = results.length - pass;
  console.log(`\n水果籃算算看：${pass} PASS／${fail} FAIL（共 ${results.length} 項）　截圖：${SHOTS}`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
