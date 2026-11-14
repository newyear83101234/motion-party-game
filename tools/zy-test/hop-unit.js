// 🐸 青蛙跳荷葉（js/zhuyin-hop.js）自動測試：node tools/zy-test/hop-unit.js
// 用獨立試玩頁 tools/zy-test/hop-harness.html（不經過主程式），透過 window.__zyHop 掛鉤驗（docs/zhuyin-math-plan.md §3、§5）：
//   五級各玩一局到 onWin（星數照 starsOf）、Lv3 往回跳青蛙轉向、點青蛙站的那片不算、每局第一題手指示範、
//   b≥2 第一次點起點隔壁只提示（第二次就算錯）、把起點算進去的錯念專用提示（加法／減法／Lv5）、其他錯念「我們一起跳跳看」＋示範、
//   示範後要點對才過（只有第一次答對才算 right）、回饋／示範期間連點不算錯、答對一下一下跳＋每跳念一個數＋腳印跳一下熄一個＋一定念算式、
//   蜻蜓 Lv1～4 答對才飛到答案片、Lv5 一開始停在終點＋數字鈕作答、Lv5 點荷葉＝數字鈕跳一下＋念提示（say、每題一次）、連對 3 題空翻、量詞念「兩下」、
//   結算打嗝停在最邊邊也在畫面內、算式 ＋／－ 一樣寬一樣粗、
//   版面（1180×820、1024×768、820×1180 一排 11 片不重疊；算式卡／進度不碰 🏠🎵（含跳 5 下、兩位數、露出答案）；直放進度不壓背景小船；
//   390×844 請橫過來；844×390 能玩）、onEnd 不來也會往下走、stop() 之後不再出聲、沒有 console error。
// v11（11-14，§7.3、§7.5）G1～G6：6～10 級各玩一局到 onWin（荷葉數字＝base + i×step、青蛙站在 a、答對停在 c、答錯示範後點對才過、right 只算第一次）、
//   把起點算進去的錯在 base≠0／step≠1 也判得對、Lv9 數字鈕、Lv10 三種跳法＋腳印標數字＋跳出「＋5」「－10」、跳出的數字不念、換題數字有動畫、整十地標、
//   手指示範每級每次開機一次、三種尺寸（1024×768、768×1024、844×390）不重疊不超出、6 級以上念的每一句都在 voice/gemini_d/manifest.json 裡。
// 網址：環境變數 ZY_URL（例：http://127.0.0.1:8772/zhuyin.html）→ 同一台伺服器的 tools/zy-test/hop-harness.html。瀏覽器一律靜音（lib.js）。
// 截圖存到 %TEMP%\zy-hop-shots\。⚠️ 一次只跑這一支。
const path = require("path"), fs = require("fs");
const { launch, URL } = require("./lib");
const BASE = URL.replace(/zhuyin\.html.*$/, "tools/zy-test/hop-harness.html");
const SHOTS = path.join(process.env.TEMP || ".", "zy-hop-shots");
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); console.log(results[results.length - 1]); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allErrs = [];
const SPEED = 6;
const ZH = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const eqT = q => `${ZH[q.a]}${q.op === "+" ? "加" : "減"}${ZH[q.b]}等於${ZH[q.c]}`;
const starsOf = r => (r >= 9 ? 3 : r >= 7 ? 2 : 1);
const LN = { notStart: "青蛙站的這片不算，跳出去才算一下", howTo: "點青蛙最後停的那一片喔", together: "我們一起跳跳看", tapGlow: "點發亮的那一片喔" };

async function open(browser, q = "", { w = 1180, h = 820, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => {
    if (m.type() !== "error") return;
    const u = (m.location() && m.location().url) || "";
    if (/favicon/.test(m.text()) || /math\/dragonfly\.webp/.test(u)) return;   // 蜻蜓圖主對話還在生：404 是預期的（模組用 🪰 備案）
    errs.push("CONSOLE " + m.text().slice(0, 200) + (u ? " @" + u : ""));
  });
  await p.goto(`${BASE}?clean=1&speed=${SPEED}${q ? "&" + q : ""}`);
  await p.waitForFunction(() => window.__lab && window.__lab.ready && window.__zyHop && window.__zyHop.state(), null, { timeout: 15000 });
  return { ctx, p, errs };
}
async function close(o, name) { allErrs.push(...o.errs.map(e => `[${name}] ${e}`)); await o.ctx.close(); }
const S = p => p.evaluate(() => window.__zyHop.state());
const until = (p, fn, arg, timeout = 8000) => p.waitForFunction(fn, arg, { timeout, polling: 20 }).then(() => true, () => false);
const readyAt = (p, i, phase = "ask", timeout) => until(p, ([i, ph]) => { const s = window.__zyHop.state(); return s && s.i === i && s.phase === ph && window.__zyHop.ready(); }, [i, phase], timeout);
const answer = (p, v) => p.evaluate(v => window.__zyHop.answer(v), v);
const tapPad = (p, n) => p.evaluate(n => window.__zyHop.tapPad(n), n);
const startWith = (p, lv, facts) => p.evaluate(([lv, f]) => { window.__spoken.length = 0; window.__lab.calls.win.length = 0; window.__zyHop.startWith(lv, f); }, [lv, facts]);
const spokenFrom = (p, k = 0) => p.evaluate(k => window.__spoken.slice(k), k);
const nSpoken = p => p.evaluate(() => window.__spoken.length);
const wins = p => p.evaluate(() => window.__lab.calls.win.slice());
// 一個「一般的錯」：不是答案、不是起點、不是起點隔壁（避開只提示不算錯的那條）、不是把起點算進去的那片
function pickWrong(q) {
  if (q.ask === "b") return q.choices.find(v => v !== q.ans && v !== q.b + 1) ?? q.choices.find(v => v !== q.ans);
  const dir = q.op === "+" ? 1 : -1;
  for (const v of [q.ans + 2 * dir, q.ans - 2 * dir, q.ans + 3, q.ans - 3, q.ans + 4, q.ans - 4, q.ans + 1, q.ans - 1]) if (v >= 0 && v <= 10 && v !== q.ans && v !== q.a && v !== q.a + dir && v !== q.ans - dir) return v;
  return null;
}
const inter = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
// 主程式左上的 🏠🎵（試玩頁放了一樣位置的假鈕：2／16vmin、12vmin 大）
const hud = p => p.evaluate(() => ["#homeBtn", "#musicBtn"].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
// 上方算式卡＋進度：不碰 🏠🎵、不出畫面、卡和進度不重疊（回傳出問題的地方）
async function barBad(p, tag) {
  const r = await p.evaluate(() => window.__zyHop.rects()), H = await hud(p), [vw, vh] = await p.evaluate(() => [innerWidth, innerHeight]), bad = [];
  const inV = b => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= vw + 0.5 && b.y + b.h <= vh + 0.5;
  for (const [k, b] of [["算式卡", r.card], ["進度", r.prog]]) {
    if (!inV(b)) bad.push(`${tag}${k}出畫面 ${JSON.stringify(b)}`);
    H.forEach((h, i) => { if (inter(b, h)) bad.push(`${tag}${k}壓到${i ? "🎵" : "🏠"}`); });
  }
  if (inter(r.card, r.prog)) bad.push(`${tag}算式卡×進度`);
  return bad;
}

(async () => {
  const browser = await launch();

  // ===== 1. 五級各玩一局到 onWin（星數照 starsOf；Lv2 用 prefers-reduced-motion 玩） =====
  const PLAN = { 1: [], 2: [1, 6], 3: [0, 3, 5, 8], 4: [9], 5: [2, 4, 7] };   // 第幾題答錯（0 起）
  for (let lv = 1; lv <= 5; lv++) {
    const o = await open(browser, `lv=${lv}&seed=${lv * 7}`, { reduced: lv === 2 }), p = o.p, wrongSet = new Set(PLAN[lv]);
    const seen = []; let stuck = "";
    for (let qi = 0; qi < 10; qi++) {
      if (!(await readyAt(p, qi, "ask", 10000))) { stuck = `第 ${qi + 1} 題等不到可以作答 ${JSON.stringify(await S(p))}`; break; }
      const s = await S(p); seen.push(s.q);
      if (wrongSet.has(qi)) {
        await answer(p, pickWrong(s.q));
        if (!(await readyAt(p, qi, "must", 10000))) { stuck = `第 ${qi + 1} 題答錯後等不到「點對才過」`; break; }
        await answer(p, s.q.ans);
      } else await answer(p, s.q.ans);
    }
    const won = await until(p, () => window.__lab.calls.win.length === 1, null, 15000);
    const w = (await wins(p))[0], nW = PLAN[lv].length, sp = (await spokenFrom(p)).filter(x => x.kind === "say").map(x => x.text);
    ok(`Lv${lv}：玩完一局 onWin`, won && !stuck && w && w.lv === lv && w.total === 10, stuck || JSON.stringify(w));
    if (w) ok(`Lv${lv}：right＝10−答錯題數、wrong＝答錯題數、星數照 starsOf`, w.right === 10 - nW && w.wrong === nW && w.stars === starsOf(w.right), `right ${w.right} wrong ${w.wrong} stars ${w.stars}`);
    const missEq = seen.filter(q => !sp.includes(eqT(q)));
    ok(`Lv${lv}：每題都念了算式整句（含示範後點對的題）`, seen.length === 10 && missEq.length === 0, missEq.map(eqT).join("、"));
    const kinds = { 1: q => q.op === "+" && q.b >= 1 && q.b <= 3 && q.ask === "c", 2: q => q.op === "+" && q.b <= 5 && q.ask === "c", 3: q => q.op === "-" && q.b <= 3 && q.ask === "c",
      4: q => q.b >= 1 && q.b <= 5 && q.ask === "c", 5: q => q.op === "+" && q.ask === "b" && q.c > q.a && q.c - q.a <= 5 && q.choices.length === 3 && q.choices.includes(q.ans) };
    ok(`Lv${lv}：題型對（${lv === 5 ? "求跳幾下、三顆數字鈕" : lv === 3 ? "減法往回跳 1～3 下" : lv === 4 ? "加減混合 1～5 下" : "加法"}）`, seen.length === 10 && seen.every(kinds[lv]) && (lv !== 4 || (seen.some(q => q.op === "+") && seen.some(q => q.op === "-"))), JSON.stringify(seen.map(q => `${q.a}${q.op}${q.b}`)));
    if (lv === 1) {
      const st = await S(p);
      ok("結算：青蛙吃飽（肚子圓滾滾）、打嗝念台詞、10 隻蜻蜓都亮", st.over && st.eaten === 10 && (await p.evaluate(() => document.querySelector(".hop-frog-fx").classList.contains("hop-full") && document.querySelectorAll(".hop-dot.on").length === 10))
        && (await spokenFrom(p)).some(x => x.kind === "talk" && x.text === "青蛙吃得飽飽的！"), JSON.stringify({ over: st.over, eaten: st.eaten }));
      await p.screenshot({ path: path.join(SHOTS, "end_lv1.png") });
    }
    await close(o, `lv${lv}`);
  }

  // ===== 2. Lv3 往回跳：青蛙轉向左、跳完在左邊 =====
  {
    const o = await open(browser, "lv=3&seed=5"), p = o.p;
    await readyAt(p, 0);
    const s = await S(p), face = await p.evaluate(() => getComputedStyle(document.querySelector(".hop-frog-img")).transform);
    ok("Lv3：青蛙面向左（facing −1、圖左右翻）", s.facing === -1 && /^matrix\(-1,/.test(face), `${s.facing} ${face}`);
    await answer(p, s.q.ans); await readyAt(p, 1);
    const s2 = await S(p);
    ok("Lv3：答對往回跳到答案（比起點小）", s.q.c < s.q.a && (await p.evaluate(() => window.__lab.calls.play.some(x => x.n === "pop" && x.r < 1))), `${s.q.a}→${s.q.c}`);
    ok("Lv3：下一題還是面向左", s2.facing === -1);
    await close(o, "lv3face");
  }

  // ===== 3. 點青蛙站的那片不算；回饋期間連點不算錯；只有第一次答對才算；示範後點對才過 =====
  {
    const o = await open(browser, "lv=1&seed=2"), p = o.p;
    await startWith(p, 1, [{ op: "+", a: 1, b: 3 }, { op: "+", a: 6, b: 2 }, { op: "+", a: 2, b: 1 }]);
    await readyAt(p, 0);
    await tapPad(p, 1); await sleep(150);
    let s = await S(p);
    ok("點青蛙站的那片：不算作答（不算對也不算錯、還在這題）", s.i === 0 && s.right === 0 && s.wrong === 0 && s.phase === "ask" && s.ignored >= 1, JSON.stringify({ i: s.i, r: s.right, w: s.wrong, ph: s.phase, ign: s.ignored }));
    const k0 = await nSpoken(p);
    await tapPad(p, 8);                                   // 一般的錯（答案 4）
    for (const n of [4, 7, 9, 4, 0]) await tapPad(p, n);  // 回饋中連點
    s = await S(p);
    ok("其他錯：wrong＋1、那片沉一下", s.wrong === 1 && s.right === 0 && (await p.evaluate(() => document.querySelector('.hop-pad[data-n="8"]').classList.contains("sink"))), JSON.stringify({ w: s.wrong }));
    ok("回饋／示範期間連點：不算錯、不算對、不換題", s.wrong === 1 && s.right === 0 && s.i === 0 && s.ignored >= 6, `ignored ${s.ignored}`);
    const must = await readyAt(p, 0, "must", 8000); s = await S(p);
    const sp = (await spokenFrom(p, k0));
    ok("其他錯：念「我們一起跳跳看」→ 青蛙慢慢示範跳過去（念 二、三、四）→ 正確那片發亮", must && sp.some(x => x.kind === "talk" && x.text === LN.together) && s.frogAt === 4 && s.glow === 4
      && JSON.stringify(s.counted) === "[2,3,4]" && (await p.evaluate(() => document.querySelector('.hop-pad[data-n="4"]').classList.contains("glow"))), JSON.stringify({ frogAt: s.frogAt, glow: s.glow, counted: s.counted }));
    await tapPad(p, 7); await tapPad(p, 9); await sleep(100); s = await S(p);
    ok("示範後點別片：不算第二次錯、還要點對才過（發亮那片晃一下＋提示一次）", s.phase === "must" && s.wrong === 1 && s.i === 0
      && (await spokenFrom(p, k0)).filter(x => x.text === LN.tapGlow).length === 1, JSON.stringify({ ph: s.phase, w: s.wrong }));
    const k1 = await nSpoken(p);
    await tapPad(p, 4);
    const nx = await readyAt(p, 1, "ask", 8000); s = await S(p);
    ok("示範後點對才過：蜻蜓被吃、念「一加三等於四」、不算 right", nx && s.right === 0 && s.wrong === 1 && s.eaten === 1 && (await spokenFrom(p, k1)).some(x => x.kind === "say" && x.text === "一加三等於四"), JSON.stringify({ r: s.right, eaten: s.eaten }));
    // 答對動畫期間連點
    await answer(p, 8); for (const n of [3, 5, 8, 0]) await tapPad(p, n);
    s = await S(p);
    ok("答對動畫期間連點：不算錯、不重複算對", s.right === 1 && s.wrong === 1 && s.phase === "busy", JSON.stringify({ r: s.right, w: s.wrong, ph: s.phase }));
    await close(o, "wrongflow");
  }

  // ===== 4. 每局第一題手指示範（第二題沒有） =====
  {
    const o = await open(browser, "lv=1&seed=4"), p = o.p;
    await startWith(p, 1, [{ op: "+", a: 2, b: 3 }, { op: "+", a: 5, b: 2 }, { op: "+", a: 1, b: 1 }]);
    const shown = await until(p, () => { const s = window.__zyHop.state(); return s.fingerOn && !document.querySelector(".hop-finger").classList.contains("hop-hide"); }, null, 8000);
    const tapped = await until(p, () => {                 // 手指開始「點」的那一刻記下位置（之後很快就收起來）
      const e = document.querySelector(".hop-finger"); if (!e.classList.contains("tap")) return false;
      const f = e.getBoundingClientRect(), pd = document.querySelector('.hop-pad[data-n="5"]').getBoundingClientRect(); window.__fr = { fx: f.left + f.width / 2, px: pd.left + pd.width / 2 }; return true;
    }, null, 8000);
    let s = await S(p);
    await p.screenshot({ path: path.join(SHOTS, "finger_q1.png") });
    ok("第一題：念完題目後手指示範（一片一片跳到青蛙最後停的那片、點一下）＋念「點青蛙最後停的那一片喔」", shown && tapped && s.fingerN === 1 && (await spokenFrom(p)).some(x => x.kind === "talk" && x.text === LN.howTo), JSON.stringify({ fingerN: s.fingerN }));
    const fr = await p.evaluate(() => window.__fr || {});
    ok("手指最後停在答案那片上方", Math.abs(fr.fx - fr.px) < 40, JSON.stringify(fr));
    await answer(p, 5); await readyAt(p, 1); await sleep(1500);
    s = await S(p);
    ok("第二題：沒有手指示範", s.fingerN === 1 && !s.fingerOn && s.i === 1);
    // 小孩一開始就點（題目還沒念完）→ 那一局的手指示範就不出來
    await startWith(p, 1, [{ op: "+", a: 2, b: 3 }, { op: "+", a: 5, b: 2 }]);
    await readyAt(p, 0); await answer(p, 5); await sleep(1200); s = await S(p);
    ok("第一題一開始就點對：不再跑手指示範", s.fingerN === 0, `fingerN ${s.fingerN}`);
    await close(o, "finger");
  }

  // ===== 5. b≥2 第一次點起點隔壁只提示不算錯（第二次就算錯）；把起點算進去的錯念專用提示 =====
  {
    const o = await open(browser, "lv=1&seed=6"), p = o.p;
    await startWith(p, 1, [{ op: "+", a: 2, b: 3 }, { op: "+", a: 4, b: 3 }, { op: "+", a: 3, b: 3 }, { op: "+", a: 1, b: 1 }]);
    await readyAt(p, 0);
    await tapPad(p, 3); await sleep(80);
    let s = await S(p), sp = await spokenFrom(p);
    ok("b≥2 第一次點起點隔壁：只提示（念「點青蛙最後停的那一片喔」）、不算錯", s.wrong === 0 && s.neighborUsed && s.i === 0 && sp.some(x => x.kind === "talk" && x.text === LN.howTo) && !sp.some(x => x.text === LN.together), JSON.stringify({ w: s.wrong, nb: s.neighborUsed }));
    await readyAt(p, 0);
    await tapPad(p, 3); await sleep(80); s = await S(p);
    ok("第二次點起點隔壁：就算錯（念「我們一起跳跳看」）", s.wrong === 1 && (await spokenFrom(p)).some(x => x.text === LN.together), `wrong ${s.wrong}`);
    await readyAt(p, 0, "must"); await answer(p, 5); await readyAt(p, 1);
    const k = await nSpoken(p);
    await tapPad(p, 6); await sleep(80); s = await S(p);       // 4＋3：點 6＝把起點算進去（6 不是起點隔壁 5）
    ok("把起點算進去（加法點 ans−1）：念「青蛙站的這片不算，跳出去才算一下」（say：家長關說明語音也照念，11-10 里維）＋起點牌閃、算錯", s.wrong === 2 && (await spokenFrom(p, k)).some(x => x.kind === "say" && x.text === LN.notStart)
      && (await p.evaluate(() => document.querySelector(".hop-starttag").classList.contains("pulse"))), `wrong ${s.wrong}`);
    const dm = await readyAt(p, 1, "must", 8000); s = await S(p);
    ok("把起點算進去之後也示範、正確那片發亮", dm && s.frogAt === 7 && s.glow === 7);
    await close(o, "neighbor");
    // 減法：點 ans＋1；Lv5：按 b＋1
    const o2 = await open(browser, "lv=3&seed=6"), p2 = o2.p;
    await startWith(p2, 3, [{ op: "-", a: 8, b: 3 }, { op: "-", a: 5, b: 1 }]);
    await readyAt(p2, 0); await tapPad(p2, 6); await sleep(80);
    s = await S(p2);
    ok("把起點算進去（減法點 ans＋1）：念專用提示", s.wrong === 1 && (await spokenFrom(p2)).some(x => x.text === LN.notStart), `wrong ${s.wrong}`);
    await startWith(p2, 5, [{ op: "+", a: 2, b: 3, choices: [3, 4, 1] }, { op: "+", a: 4, b: 2, choices: [2, 1, 3] }]);
    await readyAt(p2, 0); await answer(p2, 4); await sleep(80);
    s = await S(p2);
    ok("把起點算進去（Lv5 按 b＋1）：念專用提示、那顆鈕變灰", s.wrong === 1 && (await spokenFrom(p2)).some(x => x.text === LN.notStart) && (await p2.evaluate(() => document.querySelector('.hop-ch[data-v="4"]').classList.contains("dim"))));
    const m5 = await readyAt(p2, 0, "must", 8000);
    ok("Lv5 示範後：正確那顆鈕發亮、其他變灰，按對才過", m5 && (await p2.evaluate(() => document.querySelector('.hop-ch[data-v="3"]').classList.contains("glow") && document.querySelector('.hop-ch[data-v="1"]').classList.contains("dim"))));
    await answer(p2, 1); await sleep(60); s = await S(p2);
    ok("Lv5 示範後按錯：不算第二次錯", s.wrong === 1 && s.phase === "must");
    await answer(p2, 3); const n5 = await readyAt(p2, 1); s = await S(p2);
    ok("Lv5 示範後按對：換題、不算 right", n5 && s.right === 0 && s.wrong === 1);
    await close(o2, "starterr");
  }

  // ===== 6. 答對：一下一下跳、每跳念一個數、腳印跳一下熄一個、蜻蜓答對才飛到答案片、一定念算式 =====
  {
    const o = await open(browser, "lv=1&seed=8"), p = o.p;
    await startWith(p, 1, [{ op: "+", a: 4, b: 3 }, { op: "+", a: 2, b: 2 }, { op: "+", a: 5, b: 2 }]);
    await readyAt(p, 0); await sleep(400);
    let s = await S(p);
    const g = await p.evaluate(() => window.__zyHop.geo());
    const flyBox = await p.evaluate(() => document.querySelector(".hop-fly").getBoundingClientRect().toJSON());
    ok("Lv1～4：蜻蜓一開始在水面上空飛（不在答案片、在青蛙頭上面）", s.fly.mode === "wander" && s.fly.at === null && flyBox.y + flyBox.height / 2 <= g.skyBot + 2, JSON.stringify({ fly: s.fly, cy: Math.round(flyBox.y + flyBox.height / 2), skyBot: Math.round(g.skyBot) }));
    ok("腳印計數器：b 個、全部亮著", s.feetN === 3 && s.feetOn === 3 && (await p.evaluate(() => document.querySelectorAll(".hop-foot.on").length)) === 3);
    const k = await nSpoken(p);
    await p.evaluate(() => { const S = window.__samp = []; const take = () => { const s = window.__zyHop.state(); S.push({ at: s.frogAt, feet: s.feetOn, fly: s.fly.mode, flyAt: s.fly.at, i: s.i }); return s; }; take(); const t = setInterval(() => { const s = take(); if (s.i > 0 || S.length > 600) clearInterval(t); }, 10); });
    await answer(p, 7);
    await readyAt(p, 1);
    const samp = await p.evaluate(() => window.__samp), sp = (await spokenFrom(p, k)).filter(x => x.kind === "say").map(x => x.text);
    const ats = samp.filter(x => x.i === 0).map(x => x.at).filter((v, i, a) => i === 0 || v !== a[i - 1]);
    const feetSeq = samp.filter(x => x.i === 0).map(x => x.feet).filter((v, i, a) => i === 0 || v !== a[i - 1]);
    ok("答對：青蛙一下一下跳（4→5→6→7）", JSON.stringify(ats) === "[4,5,6,7]", JSON.stringify(ats));
    ok("答對：每跳念一個數（五、六、七），最後念「四加三等於七」", sp.join(",").includes("五,六,七") && sp.indexOf("四加三等於七") > sp.indexOf("七"), sp.join(","));
    ok("腳印：跳一下熄一個（3→2→1→0）", JSON.stringify(feetSeq) === "[3,2,1,0]", JSON.stringify(feetSeq));
    const flyTo = samp.filter(x => x.i === 0 && (x.fly === "to" || x.fly === "gone"));
    ok("蜻蜓：答對後才飛到答案那片被吃掉", flyTo.length > 0 && flyTo.every(x => x.flyAt === 7) && samp.filter(x => x.i === 0 && x.at === 4).every(x => x.fly === "wander"), JSON.stringify(flyTo.slice(0, 2)));
    const pitch = await p.evaluate(() => window.__lab.calls.play.filter(x => x.n === "pop").map(x => x.r));
    ok("每跳一下配一個往上升的音", pitch.length >= 3 && pitch[0] < pitch[1] && pitch[1] < pitch[2], JSON.stringify(pitch));
    s = await S(p);
    ok("答對算 right、進度亮一隻蜻蜓", s.right === 1 && s.eaten === 1 && (await p.evaluate(() => document.querySelectorAll(".hop-dot.on").length)) === 1);
    await close(o, "jumps");
  }

  // ===== 7. Lv5：蜻蜓一開始停在終點、用數字鈕作答、點荷葉不算 =====
  {
    const o = await open(browser, "lv=5&seed=9"), p = o.p;
    await readyAt(p, 0);
    let s = await S(p);
    const btns = await p.evaluate(() => [...document.querySelectorAll(".hop-ch")].map(b => +b.dataset.v));
    ok("Lv5：蜻蜓一開始停在終點 c", s.fly.mode === "perch" && s.fly.at === s.q.c, JSON.stringify(s.fly));
    ok("Lv5：三顆數字鈕＝choices（含答案）、算式「a ＋ ？ ＝ c」", btns.length === 3 && JSON.stringify(btns) === JSON.stringify(s.q.choices) && btns.includes(s.q.ans) && s.eq === `${s.q.a}＋？＝${s.q.c}`, `${JSON.stringify(btns)} ${s.eq}`);
    ok("Lv5：腳印一開始是「？」", s.feetN === 0 && (await p.evaluate(() => !!document.querySelector(".hop-foot.hop-qm"))));
    const k0 = await nSpoken(p);
    const jumped = await p.evaluate(n => { window.__zyHop.tapPad(n); return [...document.querySelectorAll(".hop-ch")].map(b => b.getAnimations().length); }, s.q.c);
    await tapPad(p, s.q.a + 1); await sleep(80);
    const s1 = await S(p);
    ok("Lv5：點荷葉不算作答", s1.wrong === 0 && s1.right === 0 && s1.phase === "ask");
    const said = await until(p, k => window.__spoken.slice(k).some(x => x.kind === "say" && x.text === "數數看要跳幾下，再點下面的數字"), k0, 6000);
    await sleep(500);
    const hint = (await spokenFrom(p, k0)).filter(x => x.text === "數數看要跳幾下，再點下面的數字");
    ok("Lv5 點荷葉：三顆數字鈕一起跳一下＋念「數數看要跳幾下，再點下面的數字」（say：一定念；同一題點兩次只念一次）", jumped.length === 3 && jumped.every(n => n > 0) && said && hint.length === 1 && hint[0].kind === "say" && s1.numHints === 2,
      JSON.stringify({ jumped, hint, numHints: s1.numHints }));
    const k = await nSpoken(p);
    await answer(p, s.q.ans); await readyAt(p, 1);
    const s2 = await S(p), sp = (await spokenFrom(p, k)).filter(x => x.kind === "say").map(x => x.text);
    const cnt = Array.from({ length: s.q.b }, (_, i) => ZH[i + 1]).join(",");
    ok("Lv5：按對 → 青蛙照著跳過去、念跳了幾下（一、二…）、念算式", s2.right === 1 && sp.join(",").includes(cnt) && sp.includes(eqT(s.q)), sp.join(","));
    await close(o, "lv5");
  }

  // ===== 8. 連對 3 題青蛙空翻；量詞念「兩下」 =====
  {
    const o = await open(browser, "lv=1&seed=10"), p = o.p;
    await startWith(p, 1, [{ op: "+", a: 3, b: 2 }, { op: "+", a: 1, b: 1 }, { op: "+", a: 5, b: 2 }, { op: "+", a: 6, b: 1 }, { op: "+", a: 2, b: 2 }]);
    const sp0 = [];
    for (let i = 0; i < 3; i++) { await readyAt(p, i); sp0.push((await S(p)).sayText); await answer(p, (await S(p)).q.ans); }
    const flipped = await until(p, () => window.__zyHop.state().flips === 1, null, 6000);
    ok("連對 3 題：青蛙空翻一下", flipped);
    await readyAt(p, 3); let s = await S(p);
    ok("空翻後連對數繼續算（第 4 題還沒翻第二次）", s.flips === 1 && s.streak === 3);
    await answer(p, pickWrong(s.q)); await sleep(80); s = await S(p);
    ok("答錯：連對歸零", s.streak === 0);
    ok("量詞念「兩」：題目「青蛙在三，往前跳兩下，會停在哪一片？」", sp0[0] === "青蛙在三，往前跳兩下，會停在哪一片？", sp0[0]);
    ok("第 3 題起縮短成「往前跳兩下！」", sp0[2] === "往前跳兩下！", sp0[2]);
    ok("算式念「二」：「三加二等於五」", (await spokenFrom(p)).some(x => x.text === "三加二等於五"));
    await startWith(p, 3, [{ op: "-", a: 7, b: 2 }, { op: "-", a: 5, b: 1 }, { op: "-", a: 4, b: 2 }]);
    await readyAt(p, 0); s = await S(p);
    ok("減法量詞：「青蛙在七，往回跳兩下，會停在哪一片？」", s.sayText === "青蛙在七，往回跳兩下，會停在哪一片？", s.sayText);
    await close(o, "flip");
  }

  // ===== 9. onEnd 不來也會往下走（保險計時）；stop() 之後不再出聲 =====
  {
    const o = await open(browser, "lv=1&seed=11&noend=1"), p = o.p;
    await startWith(p, 1, [{ op: "+", a: 1, b: 2 }, { op: "+", a: 3, b: 1 }, { op: "+", a: 6, b: 1 }]);
    await readyAt(p, 0); await answer(p, 3);
    const n1 = await readyAt(p, 1, "ask", 8000);
    await answer(p, 9); const m = await readyAt(p, 1, "must", 10000);
    ok("say／talk 的 onEnd 永遠不來：答對、答錯示範都照樣往下走", n1 && m);
    await answer(p, 4); await sleep(30);
    const k = await nSpoken(p), np = await p.evaluate(() => window.__lab.calls.play.length);
    await p.evaluate(() => window.__lab.game.stop()); await sleep(2500);
    const k2 = await nSpoken(p), np2 = await p.evaluate(() => window.__lab.calls.play.length), st = await S(p);
    ok("stop()：之後不再念、不再出音效、state() 回 null", k2 === k && np2 === np && st === null, `say ${k}→${k2} play ${np}→${np2}`);
    await close(o, "noend");
  }

  // ===== 9b. 結算打嗝停在最右邊（第 10 片）／最左邊（第 0 片、面向左）也不跑出畫面；算式的 ＋ 跟 － 一樣寬一樣粗 =====
  for (const [w, h] of [[1180, 820], [820, 1180]]) {
    const o = await open(browser, "lv=1&seed=14", { w, h }), p = o.p, bad = [];
    for (const [lv, f] of [[1, { op: "+", a: 7, b: 3 }], [1, { op: "+", a: 8, b: 1 }], [3, { op: "-", a: 2, b: 2 }]]) {
      await startWith(p, lv, [f]); await readyAt(p, 0);
      await p.evaluate(() => { window.__burp = []; window.__burpT = setInterval(() => { const e = document.querySelector(".hop-burp"); if (getComputedStyle(e).display === "none") return; const r = e.getBoundingClientRect(); window.__burp.push([r.left, r.right, r.top]); }, 40); });
      await answer(p, f.op === "+" ? f.a + f.b : f.a - f.b);
      await until(p, () => window.__burp.length > 0, null, 8000); await sleep(1400);
      const sm = await p.evaluate(() => { clearInterval(window.__burpT); return window.__burp; });
      const L = Math.min(...sm.map(x => x[0])), R = Math.max(...sm.map(x => x[1])), at = (await S(p)).frogAt;
      if (!sm.length || L < 0 || R > w || sm.some(x => x[2] < 0)) bad.push(`第 ${at} 片 ${sm.length} 筆 左 ${Math.round(L)} 右 ${Math.round(R)}`);
      if (lv === 1 && f.a === 7) await p.screenshot({ path: path.join(SHOTS, `burp_${w}x${h}_pad10.png`) });
    }
    ok(`${w}×${h}：結算打嗝停在第 10、9 片（往右）、第 0 片（往左）都整團在畫面內（靠邊放另一側）`, bad.length === 0, bad.join("｜"));
    // ＋ 和 －：一樣寬、一樣粗、夠大
    await startWith(p, 4, [{ op: "+", a: 3, b: 4 }, { op: "-", a: 9, b: 4 }]);
    const m = () => p.evaluate(() => { const e = document.querySelector(".hop-eq .hop-op:not(.hop-eqs)"), r = e.getBoundingClientRect(), bar = getComputedStyle(e, "::before"); return { cls: e.className, w: r.width, barW: parseFloat(bar.width), barH: parseFloat(bar.height), fs: parseFloat(getComputedStyle(e).fontSize), eq: document.querySelector(".hop-eq").textContent }; });
    await readyAt(p, 0); const a = await m();
    await p.evaluate(() => window.__zyHop.skip()); await readyAt(p, 1); const b = await m();
    ok(`${w}×${h}：算式的 ＋ 和 － 一樣寬、一樣粗、夠大（≥ 0.55 字寬），文字照舊`, /hop-plus/.test(a.cls) && /hop-minus/.test(b.cls) && Math.abs(a.barW - b.barW) < 0.5 && Math.abs(a.barH - b.barH) < 0.5 && Math.abs(a.w - b.w) < 0.5 && a.barW >= a.fs * 0.55 && a.barH >= a.fs * 0.1 && a.eq === "3＋4＝？" && b.eq === "9－4＝？",
      JSON.stringify({ a, b }));
    await close(o, `burp${w}`);
  }

  // ===== 10. 版面：iPad 橫放（1180×820、1024×768）、直放（820×1180） =====
  for (const [w, h] of [[1180, 820], [1024, 768], [820, 1180]]) for (const lv of [1, 5]) {
    const o = await open(browser, `lv=${lv}&seed=12&ann=1`, { w, h }), p = o.p;
    await readyAt(p, 0); await sleep(500); await p.evaluate(() => window.__zyHop.state() && window.__lab.game.relayout()); await sleep(200);
    const r = await p.evaluate(() => window.__zyHop.rects()), H = await hud(p);
    const vw = w, vh = h, pads = r.pads;
    const inView = b => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= vw + 0.5 && b.y + b.h <= vh + 0.5;
    const allIn = pads.every(b => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= vw + 0.5 && b.y + b.h <= vh + 0.5) && r.leaves.every(b => b.x >= 0 && b.x + b.w <= vw && b.y >= 0 && b.y + b.h <= vh);
    const noOverlap = pads.every((b, i) => i === 0 || pads[i - 1].x + pads[i - 1].w <= b.x + 0.5) && pads.every((b, i) => i === 0 || Math.abs(b.y - pads[0].y) < 1);
    ok(`${w}×${h} Lv${lv}：一排 11 片荷葉都在畫面內、同一排、不重疊`, pads.length === 11 && allIn && noOverlap && !r.rot, `第一片 ${JSON.stringify(pads[0])} 最後一片 ${JSON.stringify(pads[10])}`);
    ok(`${w}×${h} Lv${lv}：荷葉可點範圍至少 64px`, pads.every(b => b.w >= 64 && b.h >= 64), `${Math.round(pads[0].w)}×${Math.round(pads[0].h)}`);
    const top = [r.card, r.prog], low = [...pads, r.frog, r.tag, ...r.choices];
    ok(`${w}×${h} Lv${lv}：🏠🎵 那塊沒有遊戲的東西、算式卡／進度不碰荷葉和青蛙`, [...top, ...low].every(b => H.every(hb => !inter(b, hb))) && top.every(t => low.every(b => !inter(t, b))),
      JSON.stringify({ card: r.card, prog: r.prog, music: H[1] }));
    if (lv === 5) ok(`${w}×${h} Lv5：三顆數字鈕在畫面內、至少 64px、不碰荷葉`, r.choices.length === 3 && r.choices.every(b => inView(b) && b.w >= 64 && b.h >= 64 && pads.every(pd => !inter(b, pd))), JSON.stringify(r.choices[0]));
    ok(`${w}×${h} Lv${lv}：🔊 至少 44px`, r.say.w >= 44 && r.say.h >= 44);
    if (h > w) ok(`${w}×${h} Lv${lv}：直放進度一排 10 格、靠在 🎵 右邊、在畫面寬 76% 以內（不壓到背景右上的小船）`, r.prog.x >= H[1].x + H[1].w && r.prog.x + r.prog.w <= w * 0.76 && r.prog.h < r.prog.w / 5, JSON.stringify(r.prog));
    if (lv === 1 && w === 1180) { const miss = await p.evaluate(() => window.__lab.ann ? [...window.__lab.ann.missing].join("") : "?"); console.log(`INFO  自動注音：字典沒收到的字＝「${miss}」（要加進 tools/build_zhuyin_ui.py 的 SOURCES）`); }
    await p.screenshot({ path: path.join(SHOTS, `layout_${w}x${h}_lv${lv}.png`) });
    // 最寬的算式卡：跳 5 下（5 個腳印）、兩位數（10 － 5 ＝ ？、5 ＋ 5 ＝ 10 露出答案）、Lv5 的「？」腳印
    const bad = await barBad(p, "開局 ");
    const facts = lv === 5 ? [{ op: "+", a: 5, b: 5, choices: [5, 4, 6] }, { op: "+", a: 0, b: 5, choices: [5, 4, 6] }] : [{ op: "-", a: 10, b: 5 }, { op: "+", a: 5, b: 5 }];
    await startWith(p, lv === 5 ? 5 : 4, facts);
    for (let i = 0; i < 2; i++) {
      await readyAt(p, i); await sleep(150);
      const s = await S(p);
      bad.push(...await barBad(p, `第${i + 1}題 ${s.eq} `));
      if (s.q.ask !== "b" && (await p.evaluate(() => document.querySelectorAll(".hop-foot").length)) !== 5) bad.push(`第${i + 1}題腳印不是 5 個`);
      if (i === 0) await p.screenshot({ path: path.join(SHOTS, `bar_${w}x${h}_lv${lv}_5hops.png`) });
      await answer(p, s.q.ans);
      if (!(await until(p, () => !!document.querySelector(".hop-ans") && document.querySelectorAll(".hop-foot").length >= 5, null, 8000))) bad.push(`第${i + 1}題等不到露出答案`);
      else bad.push(...await barBad(p, `第${i + 1}題露出答案 ${(await S(p)).eq} `));
    }
    ok(`${w}×${h} Lv${lv}：算式卡（含 🔊、5 個腳印、Lv5「？」、兩位數、露出答案）和進度蜻蜓都在 🏠🎵 右邊不重疊、不超出右邊、彼此不重疊`, bad.length === 0, bad.slice(0, 4).join("｜"));
    await close(o, `layout${w}x${h}`);
  }
  {
    const o = await open(browser, "lv=1&seed=12", { w: 390, h: 844 }), p = o.p;
    await sleep(500);
    const r = await p.evaluate(() => window.__zyHop.rects()), vis = await p.evaluate(() => { const e = document.querySelector(".hop-rotate"); const b = e.getBoundingClientRect(); return getComputedStyle(e).display !== "none" && b.width > 300 && e.textContent.includes("把手機橫過來"); });
    ok("390×844（手機直放，每片 < 44px）：顯示「把手機橫過來」", r.rot && vis, `u ${(await S(p)).u}`);
    await p.screenshot({ path: path.join(SHOTS, "layout_390x844.png") });
    await close(o, "phoneP");
  }
  for (const lv of [1, 5]) {
    const o = await open(browser, `lv=${lv}&seed=13`, { w: 844, h: 390 }), p = o.p;
    await readyAt(p, 0); await sleep(400);
    const r = await p.evaluate(() => window.__zyHop.rects()), H = await hud(p);
    const inV = b => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= 844.5 && b.y + b.h <= 390.5;
    const noOverlap = r.pads.every((b, i) => i === 0 || r.pads[i - 1].x + r.pads[i - 1].w <= b.x + 0.5);
    ok(`844×390（手機橫放）Lv${lv}：能玩（不擋、荷葉在畫面內、至少 44px、不重疊、算式卡／進度不碰 🏠🎵）`, !r.rot && r.pads.every(b => inV(b) && b.w >= 44 && b.h >= 44) && noOverlap && r.leaves.every(inV) && inV(r.tag) && !inter(r.card, r.prog) && [r.card, r.prog].every(t => inV(t) && r.pads.every(b => !inter(t, b)) && !inter(t, r.frog) && H.every(hb => !inter(t, hb))),
      `${Math.round(r.pads[0].w)}px`);
    if (lv === 5) ok("844×390 Lv5：三顆數字鈕在畫面內、至少 44px、不碰荷葉", r.choices.length === 3 && r.choices.every(b => inV(b) && b.w >= 44 && r.pads.every(pd => !inter(b, pd))), JSON.stringify(r.choices[0]));
    // 真的玩一題（點擊用滑鼠點座標，不走掛鉤）
    const s = await S(p);
    if (lv === 1) { const b = r.pads[s.q.ans]; await p.mouse.click(b.x + b.w / 2, b.y + b.h * 0.6); }
    else { const i = s.q.choices.indexOf(s.q.ans), b = r.choices[i]; await p.mouse.click(b.x + b.w / 2, b.y + b.h / 2); }
    const nx = await readyAt(p, 1);
    ok(`844×390 Lv${lv}：用手指點答案可以答對換題`, nx && (await S(p)).right === 1);
    await p.screenshot({ path: path.join(SHOTS, `layout_844x390_lv${lv}.png`) });
    await close(o, `phoneL${lv}`);
  }

  // ===== G1. v11 一年級 6～10 級（docs/zhuyin-math-plan.md §7.3、§7.5） =====
  const MAN = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, "../../voice/gemini_d/manifest.json"), "utf8")).files));   // 已經錄好的句子
  const LINE_SET = new Set(["青蛙站的這片不算，跳出去才算一下", "點青蛙最後停的那一片喔", "數數看要跳幾下，再點下面的數字", "我們一起跳跳看", "點發亮的那一片喔", "點發亮的那個數字喔", "青蛙吃得飽飽的！"]);   // 6 級以上只能念這幾句固定台詞
  const g1Spoken = [];                                    // 6 級以上所有測試頁印出的「念／說」
  const keepSpoken = async (p, tag) => { for (const x of await spokenFrom(p)) g1Spoken.push({ tag, kind: x.kind, text: x.text }); };
  const startG1 = async (p, lv, facts) => { await keepSpoken(p, `lv${lv}`); await startWith(p, lv, facts); };   // 換局前先把上一局念過的收起來（startWith 會清空）
  const numsOk = s => s.nums.length === 11 && s.nums.every((v, i) => v === s.q.base + i * s.q.step) && s.nums.includes(s.q.a) && s.nums.includes(s.q.c);
  // 6 級以上「一般的錯」：荷葉上有的數字，不是答案、起點、起點隔壁、把起點算進去的那片
  function pickWrongG(s) {
    const q = s.q;
    if (q.ask === "b") return q.choices.find(v => v !== q.ans && v !== q.jumps + 1) ?? q.choices.find(v => v !== q.ans);
    const dir = q.op === "+" ? 1 : -1;
    return s.nums.find(v => v !== q.ans && v !== q.a && v !== q.a + dir * q.step && v !== q.ans - dir * q.step);
  }
  const PLAN_G1 = { 6: [1], 7: [0, 4], 8: [2, 6, 9], 9: [3], 10: [5, 7] };   // 第幾題答錯（0 起）
  for (let lv = 6; lv <= 10; lv++) {
    const o = await open(browser, `lv=${lv}&seed=${lv * 11}`, { w: 1024, h: 768 }), p = o.p, wrongSet = new Set(PLAN_G1[lv]);
    const seen = [], bad = []; let stuck = "", fingerFirst = false, twoRows = 0, secondWrong = 0;
    for (let qi = 0; qi < 10; qi++) {
      if (!(await readyAt(p, qi, "ask", 12000))) { stuck = `第 ${qi + 1} 題等不到可以作答 ${JSON.stringify(await S(p))}`; break; }
      if (qi === 0) fingerFirst = await until(p, () => window.__zyHop.state().fingerN === 1, null, 4000);
      const s = await S(p); seen.push(s.q);
      if (!numsOk(s)) bad.push(`第${qi + 1}題荷葉數字 ${s.nums.join(",")} base ${s.q.base} step ${s.q.step}`);
      if (s.frogAt !== s.q.a) bad.push(`第${qi + 1}題青蛙在 ${s.frogAt} 不是 ${s.q.a}`);
      if (s.sayText !== "") bad.push(`第${qi + 1}題有題目句「${s.sayText}」`);
      const ft = await p.evaluate(() => ({ n: document.querySelectorAll(".hop-foot:not(.hop-qm)").length, on: document.querySelectorAll(".hop-foot.on").length, two: document.querySelector(".hop-feet").classList.contains("two"), lab: [...document.querySelectorAll(".hop-foot:not(.hop-qm) > b")].map(b => b.textContent), say: getComputedStyle(document.querySelector(".hop-say")).display }));
      if (s.q.ask === "c" && (ft.n !== s.q.jumps || ft.on !== s.q.jumps)) bad.push(`第${qi + 1}題腳印 ${ft.n}／亮 ${ft.on}，應該 ${s.q.jumps}`);
      if (s.q.ask === "c" && ft.two !== (s.q.jumps > 5)) bad.push(`第${qi + 1}題腳印 ${s.q.jumps} 個，兩排＝${ft.two}`);
      if (ft.two) twoRows++;
      if (lv === 10 && !(ft.lab.length === s.q.jumps && ft.lab.every(t => t === String(s.q.step)))) bad.push(`第${qi + 1}題腳印標的不是 ${s.q.step}：${ft.lab.join(",")}`);
      if (lv !== 10 && ft.lab.length) bad.push(`第${qi + 1}題腳印不該有標數字`);
      if (ft.say !== "none") bad.push("🔊 沒有收起來");
      if (wrongSet.has(qi)) {
        await answer(p, pickWrongG(s));
        if (!(await readyAt(p, qi, "must", 15000))) { stuck = `第 ${qi + 1} 題答錯後等不到「點對才過」`; break; }
        const m = await S(p);
        if (m.frogAt !== m.q.c || m.glow !== m.q.ans) bad.push(`第${qi + 1}題示範後青蛙在 ${m.frogAt}、發亮 ${m.glow}`);
        await answer(p, pickWrongG(s)); await sleep(40);
        const m2 = await S(p); if (m2.wrong !== m.wrong || m2.phase !== "must") secondWrong++;
        await answer(p, s.q.ans);
      } else {
        await answer(p, s.q.ans);
        if (!(await until(p, ([i, c]) => { const t = window.__zyHop.state(); return t.i === i && t.frogAt === c; }, [qi, s.q.c], 12000))) bad.push(`第${qi + 1}題答對後青蛙沒停在 ${s.q.c}`);
      }
    }
    const won = await until(p, () => window.__lab.calls.win.length === 1, null, 15000);
    const w = (await wins(p))[0], nW = PLAN_G1[lv].length;
    await keepSpoken(p, `lv${lv}`);
    ok(`Lv${lv}：玩完一局 onWin`, won && !stuck && w && w.lv === lv && w.total === 10, stuck || JSON.stringify(w));
    if (w) ok(`Lv${lv}：right 只算第一次答對（10−答錯題數）、wrong＝答錯題數、星數照 starsOf；示範後再點錯不算第二次`, w.right === 10 - nW && w.wrong === nW && w.stars === starsOf(w.right) && secondWrong === 0, `right ${w.right} wrong ${w.wrong} stars ${w.stars}`);
    ok(`Lv${lv}：每題荷葉數字＝base + i×step、青蛙站在 a、答對停在 c、答錯示範後停在 c 且正確那片發亮；腳印＝jumps 個（超過 5 個兩排）；不出題目句、🔊 收起來`, seen.length === 10 && bad.length === 0, bad.slice(0, 4).join("｜"));
    ok(`Lv${lv}：這次開機第一次玩 → 第一題有手指示範`, fingerFirst);
    const kinds = { 6: q => q.op === "+" && q.ask === "c" && q.step === 1 && q.jumps === q.b && q.b <= 5, 7: q => q.op === "-" && q.ask === "c" && q.step === 1 && q.b <= 5, 8: q => q.ask === "c" && q.step === 1 && q.b <= 9,
      9: q => q.op === "+" && q.ask === "b" && q.step === 1 && q.choices.length === 3 && q.choices.includes(q.ans) && q.ans === q.b && q.b >= 2, 10: q => q.ask === "c" && [2, 5, 10].includes(q.step) && q.jumps === q.b / q.step && q.jumps >= 1 && q.jumps <= 5 && q.base === 0 };
    ok(`Lv${lv}：題型對（${{ 6: "往前跳、20 以內", 7: "往回跳、20 以內", 8: "混合、最多跳 9 下", 9: "要跳幾下、三顆數字鈕", 10: "跳著數 2／5／10" }[lv]}）`, seen.length === 10 && seen.every(kinds[lv]) && seen.every(q => Math.max(q.a, q.c) <= (lv === 10 ? 100 : 20)), JSON.stringify(seen.map(q => `${q.a}${q.op}${q.b}`)));
    if (lv === 8) ok("Lv8：有跳超過 5 下的題（腳印排兩排）、加減都有", twoRows >= 1 && seen.some(q => q.op === "+") && seen.some(q => q.op === "-"), `兩排 ${twoRows} 題`);
    if (lv === 10) ok("Lv10：一下跳 2、5、10 三種都出現", [2, 5, 10].every(k => seen.some(q => q.step === k)), seen.map(q => q.step).join(","));
    await close(o, `g1lv${lv}`);
  }

  // ----- G2. 把起點算進去的錯：base≠0、step≠1 也判得對；鄰片只提示；一般錯；right 只算第一次 -----
  {
    const o = await open(browser, "lv=6&seed=21", { w: 1024, h: 768 }), p = o.p;
    await startG1(p, 6, [{ op: "+", a: 8, b: 4, base: 5 }, { op: "+", a: 9, b: 3, base: 2 }]);
    await readyAt(p, 0);
    let s = await S(p);
    ok("Lv6（base 5）：荷葉是 5～15、青蛙在 8", s.nums.join() === "5,6,7,8,9,10,11,12,13,14,15" && s.frogAt === 8, s.nums.join());
    await tapPad(p, 8); await sleep(60); s = await S(p);
    ok("Lv6：點青蛙站的那片（8）不算作答", s.wrong === 0 && s.right === 0 && s.phase === "ask" && s.ignored >= 1);
    let k = await nSpoken(p);
    await tapPad(p, 11); await sleep(80); s = await S(p);
    ok("Lv6（base 5）加法點終點左邊一片（11）：念「青蛙站的這片不算…」（say）、起點牌閃、算錯", s.wrong === 1 && (await spokenFrom(p, k)).some(x => x.kind === "say" && x.text === LN.notStart) && (await p.evaluate(() => document.querySelector(".hop-starttag").classList.contains("pulse"))), `wrong ${s.wrong}`);
    const m = await readyAt(p, 0, "must", 10000); s = await S(p);
    ok("Lv6：示範跳過去（9、10、11、12）→ 12 那片發亮（data-n＝荷葉上的數字）", m && s.frogAt === 12 && s.glow === 12 && JSON.stringify(s.counted) === "[9,10,11,12]" && (await p.evaluate(() => { const b = document.querySelector('.hop-pad[data-n="12"]'); return b.classList.contains("glow") && b.dataset.i === "7"; })), JSON.stringify({ at: s.frogAt, glow: s.glow, counted: s.counted }));
    await tapPad(p, 12); await readyAt(p, 1); s = await S(p);
    ok("Lv6：示範後點對才過、不算 right", s.i === 1 && s.right === 0 && s.wrong === 1 && s.eaten === 1);
    k = await nSpoken(p);
    await tapPad(p, 10); await sleep(80); s = await S(p);      // 9＋3：10＝起點隔壁
    ok("Lv6：跳 2 下以上第一次點起點隔壁：只提示、不算錯", s.wrong === 1 && s.neighborUsed && (await spokenFrom(p, k)).some(x => x.text === LN.howTo));
    await readyAt(p, 1); k = await nSpoken(p);
    await tapPad(p, 6); await sleep(80); s = await S(p);
    ok("Lv6 一般的錯：念「我們一起跳跳看」、那片沉一下", s.wrong === 2 && (await spokenFrom(p, k)).some(x => x.kind === "talk" && x.text === LN.together) && (await p.evaluate(() => document.querySelector('.hop-pad[data-n="6"]').classList.contains("sink"))));
    // 減法 base≠0
    await startG1(p, 7, [{ op: "-", a: 13, b: 5, base: 6 }]);
    await readyAt(p, 0); k = await nSpoken(p);
    s = await S(p);
    const face = await p.evaluate(() => getComputedStyle(document.querySelector(".hop-frog-img")).transform);
    ok("Lv7（base 6）：荷葉 6～16、青蛙在 13、面向左", s.nums[0] === 6 && s.nums[10] === 16 && s.frogAt === 13 && s.facing === -1 && /^matrix\(-1,/.test(face), `${s.nums.join()} ${face}`);
    await tapPad(p, 9); await sleep(80); s = await S(p);
    ok("Lv7（base 6）減法點終點右邊一片（9）：念專用提示、算錯", s.wrong === 1 && (await spokenFrom(p, k)).some(x => x.kind === "say" && x.text === LN.notStart));
    const m7 = await readyAt(p, 0, "must", 10000); s = await S(p);
    ok("Lv7：示範往回跳到 8、8 發亮", m7 && s.frogAt === 8 && s.glow === 8 && JSON.stringify(s.counted) === "[12,11,10,9,8]", JSON.stringify(s.counted));
    // 跳著數 step 5
    await startG1(p, 10, [{ op: "+", a: 15, b: 25, step: 5 }, { op: "-", a: 40, b: 10, step: 5 }, { op: "+", a: 6, b: 8, step: 2 }]);
    await readyAt(p, 0); s = await S(p);
    ok("Lv10（一下跳 5）：荷葉 0、5、10…50、腳印 5 個都標 5", s.nums.join() === "0,5,10,15,20,25,30,35,40,45,50" && s.feetN === 5 && (await p.evaluate(() => [...document.querySelectorAll(".hop-foot > b")].map(b => b.textContent).join(""))) === "55555", s.nums.join());
    k = await nSpoken(p);
    await tapPad(p, 20); await sleep(80); s = await S(p);
    ok("Lv10：第一次點起點隔壁那片（20）：只提示、不算錯", s.wrong === 0 && s.neighborUsed && (await spokenFrom(p, k)).some(x => x.text === LN.howTo));
    await readyAt(p, 0); k = await nSpoken(p);
    await tapPad(p, 35); await sleep(80); s = await S(p);
    ok("Lv10（step 5）加法點終點左邊一片（35）：念專用提示、算錯", s.wrong === 1 && (await spokenFrom(p, k)).some(x => x.kind === "say" && x.text === LN.notStart), `wrong ${s.wrong}`);
    const m10 = await readyAt(p, 0, "must", 10000); s = await S(p);
    ok("Lv10：示範一下跳 5（20、25、30、35、40）→ 40 發亮", m10 && s.frogAt === 40 && s.glow === 40 && JSON.stringify(s.counted) === "[20,25,30,35,40]", JSON.stringify(s.counted));
    await tapPad(p, 40); await readyAt(p, 1); k = await nSpoken(p);
    await tapPad(p, 35); await sleep(80); s = await S(p);       // 40－10：終點 30，右邊一片＝35（也是起點隔壁，但這局的「只提示」用過了）
    ok("Lv10（step 5）減法點終點右邊一片（35）：念專用提示", s.wrong === 2 && (await spokenFrom(p, k)).some(x => x.text === LN.notStart), `wrong ${s.wrong}`);
    await readyAt(p, 1, "must", 10000); await tapPad(p, 30); await readyAt(p, 2); k = await nSpoken(p);
    s = await S(p);
    ok("Lv10 換成一下跳 2：荷葉換成 0、2、4…20", s.nums.join() === "0,2,4,6,8,10,12,14,16,18,20" && s.frogAt === 6, s.nums.join());
    await tapPad(p, 20); await sleep(80); s = await S(p);
    ok("Lv10 一般的錯：念「我們一起跳跳看」", s.wrong === 3 && (await spokenFrom(p, k)).some(x => x.kind === "talk" && x.text === LN.together));
    await keepSpoken(p, "starterr"); await close(o, "g1starterr");
  }

  // ----- G3. 跳的時候跳出數字（不念）；Lv10 跳出「＋5」「－10」；Lv9 數字鈕 -----
  {
    const o = await open(browser, "lv=6&seed=22", { w: 1024, h: 768 }), p = o.p;
    const watchPops = () => p.evaluate(() => { window.__pops = []; const seen = new WeakSet(); clearInterval(window.__popT); window.__popT = setInterval(() => { for (const e of document.querySelectorAll(".hop-pop")) if (!seen.has(e)) { seen.add(e); const r = e.getBoundingClientRect(); window.__pops.push({ t: e.textContent, in: r.left >= 0 && r.right <= innerWidth && r.top >= 0, bg: getComputedStyle(e).backgroundColor }); } }, 8); });
    const pops = () => p.evaluate(() => window.__pops.slice());
    await startG1(p, 6, [{ op: "+", a: 8, b: 4 }, { op: "+", a: 7, b: 5 }]);
    await readyAt(p, 0); await watchPops();
    const k = await nSpoken(p);
    await p.evaluate(() => { const S = window.__samp = [], take = () => { const s = window.__zyHop.state(); if (!s || s.i > 0 || S.length > 800) return false; S.push({ at: s.frogAt, feet: s.feetOn }); return true; }; take(); const t = setInterval(() => { if (!take()) clearInterval(t); }, 8); });
    await answer(p, 12); await readyAt(p, 1);
    let pp = await pops();
    const samp = await p.evaluate(() => window.__samp), uniq = a => a.filter((v, i) => i === 0 || v !== a[i - 1]);
    ok("Lv6 答對：青蛙一下一下跳（8→9→10→11→12）、腳印 4→0", JSON.stringify(uniq(samp.map(x => x.at))) === "[8,9,10,11,12]" && JSON.stringify(uniq(samp.map(x => x.feet))) === "[4,3,2,1,0]", JSON.stringify(uniq(samp.map(x => x.at))));
    ok("Lv6 答對：每跳一下跳出目前的數字（9、10、11、12），都在畫面內", pp.map(x => x.t).join() === "9,10,11,12" && pp.every(x => x.in), JSON.stringify(pp));
    ok("Lv6 答對：整題什麼都不念（不念數字、不念算式）、算式露出答案", (await spokenFrom(p, k)).length === 0 && (await S(p)).right === 1, JSON.stringify(await spokenFrom(p, k)));
    const pitch = await p.evaluate(() => window.__lab.calls.play.filter(x => x.n === "pop").map(x => x.r));
    ok("Lv6：每跳一下配一個往上升的音", pitch.length >= 4 && pitch[0] < pitch[1] && pitch[1] < pitch[2] && pitch[2] < pitch[3], JSON.stringify(pitch.slice(0, 5)));
    // 換題：荷葉數字換掉有動畫（滑進來）；整十的荷葉是地標
    const s1 = await S(p);
    ok("Lv6 換題：荷葉數字換成新的一段（7＋5 → 2～12）", s1.nums.join() === "2,3,4,5,6,7,8,9,10,11,12", s1.nums.join());
    await p.evaluate(() => { window.__numAnims = 0; const orig = Element.prototype.animate; Element.prototype.animate = function (kf, o) { if (this.classList.contains("hop-num") && /translateX|scaleY/.test(JSON.stringify(kf))) window.__numAnims++; return orig.call(this, kf, o); }; });
    await startG1(p, 8, [{ op: "+", a: 6, b: 9 }, { op: "-", a: 18, b: 9 }, { op: "-", a: 17, b: 9, base: 8 }]);
    await readyAt(p, 0);
    ok("新的一局第一題：荷葉數字直接換好（不播換題動畫）", (await p.evaluate(() => window.__numAnims)) === 0);
    const ten = () => p.evaluate(() => { const bg = e => getComputedStyle(e.querySelector(".hop-num")).backgroundColor, all = [...document.querySelectorAll(".hop-pad")]; return { tens: all.filter(b => b.classList.contains("ten")).map(b => +b.dataset.n), tenBg: all.filter(b => b.classList.contains("ten") && !b.classList.contains("start")).map(bg), plainBg: all.filter(b => !b.classList.contains("ten") && !b.classList.contains("start")).map(bg) }; });
    let tn = await ten();
    ok("Lv8：10 那片是地標（號碼牌顏色跟別片不一樣）", tn.tens.join() === "10" && tn.tenBg.length === 1 && tn.plainBg.every(c => c !== tn.tenBg[0]), JSON.stringify(tn.tens));
    await answer(p, 15); await readyAt(p, 1);
    const na = await p.evaluate(() => window.__numAnims); tn = await ten(); let s = await S(p);
    ok("Lv8 換題（5～15 → 8～18）：每片的數字都播了換掉的動畫、地標跟著 10 移到新位置", na === 11 && s.nums[0] === 8 && tn.tens.join() === "10" && (await p.evaluate(() => document.querySelector(".hop-pad.ten").dataset.i)) === "2", `動畫 ${na} 次`);
    await answer(p, 9); await readyAt(p, 2);
    ok("Lv8 換題後荷葉數字一樣（都是 8～18）：不播動畫", (await p.evaluate(() => window.__numAnims)) === 11 && (await S(p)).nums[0] === 8, String(await p.evaluate(() => window.__numAnims)));
    await startG1(p, 9, [{ op: "+", a: 11, b: 9, choices: [9, 8, 7] }, { op: "+", a: 7, b: 6, choices: [5, 6, 7] }]);
    await readyAt(p, 0); tn = await ten();
    ok("Lv9（10～20）：10 和 20 兩片都是地標；青蛙不在整十上", tn.tens.join() === "10,20");
    // Lv9：數字鈕
    s = await S(p);
    const btns = await p.evaluate(() => [...document.querySelectorAll(".hop-ch")].map(b => +b.dataset.v));
    ok("Lv9：蜻蜓停在終點 20、算式「11＋？＝20」、三顆數字鈕、腳印是「？」", s.fly.mode === "perch" && s.fly.at === 20 && s.eq === "11＋？＝20" && btns.join() === "9,8,7" && s.feetN === 0 && (await p.evaluate(() => !!document.querySelector(".hop-foot.hop-qm"))), `${JSON.stringify(s.fly)} ${s.eq}`);
    const fb = await p.evaluate(() => { const f = document.querySelector(".hop-fly").getBoundingClientRect(), pd = document.querySelector('.hop-pad[data-n="20"]').getBoundingClientRect(); return { fx: f.left + f.width / 2, l: pd.left, r: pd.right + 4 }; });
    ok("Lv9：蜻蜓畫在 20 那片上", fb.fx >= fb.l && fb.fx <= fb.r, JSON.stringify(fb));
    let k9 = await nSpoken(p);
    await tapPad(p, 20); await sleep(120); s = await S(p);
    ok("Lv9 點荷葉：不算作答、念「數數看要跳幾下，再點下面的數字」", s.wrong === 0 && s.right === 0 && s.numHints === 1 && (await spokenFrom(p, k9)).some(x => x.kind === "say" && x.text === "數數看要跳幾下，再點下面的數字"));
    await watchPops(); k9 = await nSpoken(p);
    await answer(p, 9); await readyAt(p, 1); s = await S(p); pp = await pops();
    ok("Lv9 按對：青蛙照著跳 9 下、跳出第幾下（1～9）、腳印亮到 9 個排兩排、算 right、不念數字", s.right === 1 && pp.map(x => x.t).join() === "1,2,3,4,5,6,7,8,9" && pp.every(x => x.in) && (await spokenFrom(p, k9)).length === 0, JSON.stringify(pp.map(x => x.t)));
    k9 = await nSpoken(p);
    await answer(p, 7); await sleep(80); s = await S(p);        // 7＋？＝13：按 7＝多數一下
    ok("Lv9 把起點也數進去（按 jumps＋1）：念專用提示、那顆鈕變灰", s.wrong === 1 && (await spokenFrom(p, k9)).some(x => x.text === LN.notStart) && (await p.evaluate(() => document.querySelector('.hop-ch[data-v="7"]').classList.contains("dim"))));
    const m9 = await readyAt(p, 1, "must", 10000);
    ok("Lv9 示範後：正確那顆鈕（6）發亮，按對才過、不算 right", m9 && (await p.evaluate(() => document.querySelector('.hop-ch[data-v="6"]').classList.contains("glow"))));
    await answer(p, 5); await sleep(60); s = await S(p);
    const stay = s.phase === "must" && s.wrong === 1;
    await answer(p, 6); await until(p, () => window.__lab.calls.win.length === 1, null, 10000);
    const w9 = (await wins(p))[0];
    ok("Lv9：示範後按錯不算第二次錯；結算 right 1、wrong 1", stay && w9 && w9.right === 1 && w9.wrong === 1, JSON.stringify(w9));
    // Lv10：「＋5」「－10」
    await startG1(p, 10, [{ op: "+", a: 15, b: 25, step: 5 }, { op: "-", a: 100, b: 30, step: 10 }, { op: "+", a: 6, b: 8, step: 2 }]);
    await readyAt(p, 0); await watchPops(); const k10 = await nSpoken(p);
    await answer(p, 40); await readyAt(p, 1); pp = await pops();
    ok("Lv10（一下跳 5）答對：每跳一下跳出「＋5」共 5 次、在畫面內、顏色跟一般跳出的數字不同", pp.map(x => x.t).join() === "＋5,＋5,＋5,＋5,＋5" && pp.every(x => x.in) && pp[0].bg !== "rgb(242, 105, 30)", JSON.stringify(pp.map(x => x.t)));
    s = await S(p);
    ok("Lv10 換成一下跳 10：荷葉 0～100（100 用小字、放得進號碼牌）、青蛙在 100 面向左", s.nums[10] === 100 && s.frogAt === 100 && s.facing === -1 && (await p.evaluate(() => { const n = document.querySelector('.hop-pad[data-n="100"] .hop-num'); return n.classList.contains("n3") && n.scrollWidth <= n.clientWidth; })));
    await watchPops(); await answer(p, 70); await readyAt(p, 2); pp = await pops();
    ok("Lv10（一下跳 10）往回跳：跳出「－10」共 3 次、停在 70", pp.map(x => x.t).join() === "－10,－10,－10" && pp.every(x => x.in), JSON.stringify(pp.map(x => x.t)));
    await watchPops(); await answer(p, 14); await until(p, () => window.__lab.calls.win.length === 1, null, 10000); pp = await pops();
    ok("Lv10（一下跳 2）：跳出「＋2」共 4 次；整局沒念任何數字或算式", pp.map(x => x.t).join() === "＋2,＋2,＋2,＋2" && (await spokenFrom(p, k10)).every(x => x.text === "青蛙吃得飽飽的！" || x.text === "點青蛙最後停的那一片喔"), JSON.stringify(await spokenFrom(p, k10)));
    ok("Lv10（一下跳 2）：10、20 兩片是地標", (await p.evaluate(() => [...document.querySelectorAll(".hop-pad.ten")].map(b => b.dataset.n).join())) === "10,20");
    await keepSpoken(p, "pops"); await close(o, "g1pops");
  }

  // ----- G4. 手指示範：每一級這次開機只做一次；再看一次（sayCurrent）不念題目 -----
  {
    const o = await open(browser, "lv=8&seed=23", { w: 1024, h: 768 }), p = o.p;
    const f1 = await until(p, () => window.__zyHop.state().fingerN === 1, null, 5000);
    const said = await until(p, () => window.__spoken.some(x => x.kind === "talk" && x.text === "點青蛙最後停的那一片喔"), null, 12000);
    ok("Lv8 這次開機第一次玩：第一題手指示範＋念「點青蛙最後停的那一片喔」（已經錄好的句子）", f1 && said);
    await startG1(p, 8, [{ op: "+", a: 6, b: 9 }]);
    await readyAt(p, 0); await sleep(600);
    let s = await S(p);
    ok("Lv8 同一次開機第二局：不再自動示範", s.fingerN === 0 && !s.fingerOn);
    const k = await nSpoken(p);
    await p.evaluate(() => window.__lab.game.sayCurrent());
    const f2 = await until(p, () => window.__zyHop.state().fingerOn, null, 3000);
    await sleep(300);
    ok("6 級以上的「再念一次」＝再看一次手指示範，不念題目", f2 && (await spokenFrom(p, k)).every(x => x.text === "點青蛙最後停的那一片喔"), JSON.stringify(await spokenFrom(p, k)));
    await answer(p, 15); await sleep(60);
    ok("示範中小孩點了答案：手指收起來、照樣算對", !(await S(p)).fingerOn && (await S(p)).right === 1);
    await startG1(p, 4, [{ op: "+", a: 3, b: 4 }, { op: "-", a: 9, b: 4 }]);
    await readyAt(p, 0); s = await S(p);
    ok("從 8 級換回 4 級：荷葉回到 0～10、沒有地標、🔊 回來、照樣念題目", s.nums.join() === "0,1,2,3,4,5,6,7,8,9,10" && s.quiet === false && s.sayText === "青蛙在三，往前跳四下，會停在哪一片？" && (await p.evaluate(() => document.querySelectorAll(".hop-pad.ten").length === 0 && getComputedStyle(document.querySelector(".hop-say")).display !== "none")), s.sayText);
    await close(o, "g1finger");
  }

  // ----- G5. 版面：iPad 橫 1024×768、iPad 直 768×1024、手機橫 844×390（9 個腳印兩排、三位數、數字鈕、跳出的數字） -----
  for (const [w, h] of [[1024, 768], [768, 1024], [844, 390]]) {
    const o = await open(browser, "lv=8&seed=24", { w, h }), p = o.p, minPad = w === 844 ? 44 : 64, bad = [];
    const inV = b => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= w + 0.5 && b.y + b.h <= h + 0.5;
    const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
    const check = async tag => {
      const r = await p.evaluate(() => window.__zyHop.rects()), H = await hud(p), s = await S(p);
      const fit = await p.evaluate(() => [...document.querySelectorAll(".hop-num")].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent));
      if (r.rot) bad.push(`${tag} 叫他把手機橫過來`);
      if (!(r.pads.length === 11 && r.pads.every(inV) && r.leaves.every(inV))) bad.push(`${tag} 荷葉出畫面`);
      if (!r.pads.every((b, i) => i === 0 || (r.pads[i - 1].x + r.pads[i - 1].w <= b.x + 0.5 && Math.abs(b.y - r.pads[0].y) < 1))) bad.push(`${tag} 荷葉重疊或不同排`);
      if (!r.pads.every(b => b.w >= minPad && b.h >= minPad)) bad.push(`${tag} 荷葉小於 ${minPad}px（${Math.round(r.pads[0].w)}）`);
      if (fit.length) bad.push(`${tag} 號碼牌的字放不下：${fit.join(",")}`);
      r.nums.forEach((n, i) => { if (!(n.x >= r.pads[i].x - 0.5 && n.x + n.w <= r.pads[i].x + r.pads[i].w + 0.5 && inV(n))) bad.push(`${tag} 第 ${i} 片號碼牌超出那片（${s.nums[i]}）`); if (i && inter(n, r.nums[i - 1])) bad.push(`${tag} 號碼牌 ${s.nums[i - 1]}×${s.nums[i]} 重疊`); });
      bad.push(...await barBad(p, tag + " "));
      const top = [r.card, r.prog], low = [...r.pads, r.frog, r.tag, ...r.choices];
      if (!top.every(t => low.every(b => !inter(t, b)))) bad.push(`${tag} 算式卡／進度碰到荷葉、青蛙或數字鈕`);
      if (![...low, r.feet, r.eq].every(b => inV(b) && H.every(hb => !inter(b, hb)))) bad.push(`${tag} 有東西出畫面或碰到 🏠🎵`);
      if (r.card.x < 110 && r.card.y < 110) bad.push(`${tag} 算式卡進到左上 110px`);
      if (!inside(r.feet, r.card) || !inside(r.eq, r.card) || inter(r.feet, r.eq)) bad.push(`${tag} 腳印超出算式卡或擠到算式 ${JSON.stringify({ feet: r.feet, eq: r.eq })}`);
      if (!r.foot.every(f => inside(f, r.card)) || r.foot.some((f, i) => r.foot.some((g, j) => j > i && inter(f, g)))) bad.push(`${tag} 腳印彼此重疊或超出卡片`);
      if (r.foot.length > 5) { const rows = [...new Set(r.foot.map(f => Math.round(f.y)))]; if (rows.length !== 2 || r.foot.filter(f => Math.round(f.y) === rows[0]).length !== 5) bad.push(`${tag} ${r.foot.length} 個腳印沒有排成兩排（第一排 5 個）`); }
      if (r.choices.length && !(r.choices.length === 3 && r.choices.every(b => inV(b) && b.w >= minPad && b.h >= minPad && r.pads.every(pd => !inter(b, pd)) && !inter(b, r.tag)))) bad.push(`${tag} 數字鈕出畫面、太小或碰到荷葉`);
      return r;
    };
    const popWatch = () => p.evaluate(() => { window.__popBad = []; clearInterval(window.__popT); window.__popT = setInterval(() => { for (const e of document.querySelectorAll(".hop-pop")) { const r = e.getBoundingClientRect(); if (r.left < 0 || r.right > innerWidth || r.top < 0) window.__popBad.push(e.textContent); } }, 10); });
    // Lv8：跳 9 下（兩排腳印）、二位數
    await startG1(p, 8, [{ op: "+", a: 11, b: 9 }, { op: "-", a: 18, b: 9 }]);
    await readyAt(p, 0); await sleep(200);
    let r = await check("Lv8 11＋9");
    if (r.foot.length !== 9) bad.push(`Lv8 腳印 ${r.foot.length} 個`);
    await p.screenshot({ path: path.join(SHOTS, `g1_${w}x${h}_lv8_9feet.png`) });
    await popWatch(); await answer(p, 20);
    if (!(await until(p, () => !!document.querySelector(".hop-ans"), null, 10000))) bad.push("Lv8 等不到露出答案"); else await check("Lv8 露出答案");
    await readyAt(p, 1); await sleep(150); await check("Lv8 18－9（青蛙在最右邊）");
    // 真的用手指點一題（座標點擊，不走掛鉤）
    r = await p.evaluate(() => window.__zyHop.rects()); const b9 = r.pads[1];
    await p.mouse.click(b9.x + b9.w / 2, b9.y + b9.h * 0.6);
    const clicked = await until(p, () => window.__zyHop.state().right === 2, null, 10000);
    // Lv9：數字鈕＋兩排腳印（跳完亮 9 個）
    await startG1(p, 9, [{ op: "+", a: 11, b: 9, choices: [9, 8, 7] }]);
    await readyAt(p, 0); await sleep(200); await check("Lv9 11＋？＝20");
    await p.screenshot({ path: path.join(SHOTS, `g1_${w}x${h}_lv9.png`) });
    await answer(p, 9);
    if (!(await until(p, () => !!document.querySelector(".hop-ans") && document.querySelectorAll(".hop-foot.on").length === 9, null, 10000))) bad.push("Lv9 等不到 9 個腳印亮＋露出答案"); else await check("Lv9 跳完露出答案");
    // Lv10：0～100、算式 50＋50＝100、腳印標 10
    await startG1(p, 10, [{ op: "+", a: 50, b: 50, step: 10 }, { op: "-", a: 100, b: 50, step: 10 }, { op: "+", a: 0, b: 25, step: 5 }]);
    await readyAt(p, 0); await sleep(200); await check("Lv10 50＋50");
    await answer(p, 100);
    if (!(await until(p, () => !!document.querySelector(".hop-ans"), null, 10000))) bad.push("Lv10 等不到露出答案"); else await check("Lv10 露出 100");
    await p.screenshot({ path: path.join(SHOTS, `g1_${w}x${h}_lv10_100.png`) });
    await readyAt(p, 1); await sleep(150); await check("Lv10 100－50");
    await answer(p, 50); await readyAt(p, 2); await sleep(150); await check("Lv10 0＋25（青蛙在最左邊）");
    await answer(p, 25); await until(p, () => window.__lab.calls.win.length === 1, null, 10000);
    const popBad = await p.evaluate(() => { clearInterval(window.__popT); return window.__popBad; });
    ok(`${w}×${h} 6 級以上：一排 11 片不重疊不超出、二位數／100 放得進號碼牌、算式卡和腳印（9 個排兩排、10 級有標數字）不擠到算式／進度／🏠🎵、數字鈕在畫面內`, bad.length === 0, bad.slice(0, 5).join("｜"));
    ok(`${w}×${h} 6 級以上：跳出的數字（含最左、最右那片）都在畫面內`, popBad.length === 0, popBad.join(","));
    ok(`${w}×${h} Lv8：用手指點荷葉可以答對`, clicked);
    await keepSpoken(p, `layout${w}`); await close(o, `g1layout${w}x${h}`);
  }

  // ----- G7. 11-14 櫻木審查後：Lv9 數字鈕有腳印＋進題依序跳、算式卡「腳印＋？」；發呆自動再示範；Lv10 換段示範；step 2／5 地標；base 沒變不播換數字動畫 -----
  {
    const o = await open(browser, "lv=9&seed=31", { w: 1024, h: 768 }), p = o.p;
    await readyAt(p, 0);
    const ch = await p.evaluate(() => [...document.querySelectorAll(".hop-ch")].map(b => { const f = b.querySelector(".hop-ch-foot"), r = b.getBoundingClientRect(), fr = f && f.getBoundingClientRect(); return { ft: b.classList.contains("ft"), foot: !!f && f.textContent === "🐾", inBtn: !!fr && fr.left >= r.left && fr.right <= r.right && fr.top >= r.top && fr.bottom <= r.bottom, v: b.dataset.v }; }));
    const hopped = await until(p, () => window.__zyHop.state().chHops === 3, null, 4000);
    ok("Lv9：三顆數字鈕各有一個小腳印（在鈕裡面）、進題時三顆依序跳一下", ch.length === 3 && ch.every(c => c.ft && c.foot && c.inBtn) && hopped, JSON.stringify(ch));
    const qf = await p.evaluate(() => { const all = [...document.querySelectorAll(".hop-feet .hop-foot")], f = all[0], r = f.getBoundingClientRect(); return { n: all.length, qf: f.classList.contains("hop-qf") && f.classList.contains("on"), txt: f.textContent, h: r.height, fs: parseFloat(getComputedStyle(f).fontSize) }; });
    await p.evaluate(() => window.__zyHop.tune.idleMs = 600000);
    await startG1(p, 8, [{ op: "+", a: 11, b: 4 }]); await readyAt(p, 0);
    const fs8 = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".hop-feet .hop-foot")).fontSize));
    ok("Lv9：算式卡下面是「腳印＋？」，腳印跟其他級一樣大", qf.n === 1 && qf.qf && qf.txt === "🐾？" && Math.abs(qf.fs - fs8) < 0.5 && qf.h > qf.fs, JSON.stringify({ qf, fs8 }));
    await startWith(p, 5, [{ op: "+", a: 2, b: 3, choices: [3, 4, 1] }]); await readyAt(p, 0); await sleep(300);
    ok("Lv5 不變：數字鈕沒有腳印、不會自己跳、腳印是原本的「？」", (await p.evaluate(() => document.querySelectorAll(".hop-ch-foot, .hop-ch.ft, .hop-qf").length === 0 && document.querySelector(".hop-foot.hop-qm").textContent === "？")) && (await S(p)).chHops === 0);
    // 發呆自動再示範（測試把 9 秒調成 3 秒；SPEED 6 倍 → 0.5 秒）
    ok("發呆多久再示範的常數可以從測試調（預設 9 秒）", (await p.evaluate(() => window.__lab.mod.TUNE.idleMs === 600000 && window.__zyHop.tune === window.__lab.mod.TUNE)));
    await p.evaluate(() => { window.__zyHop.tune.idleMs = 3000; window.__spoken.length = 0; });   // 剛剛那局是 5 級（會念題目）：不收進 6 級以上的紀錄
    await startG1(p, 7, [{ op: "-", a: 13, b: 5 }, { op: "-", a: 12, b: 4 }, { op: "-", a: 14, b: 5 }, { op: "-", a: 11, b: 3 }]);
    await readyAt(p, 0);
    const idle1 = await until(p, () => { const s = window.__zyHop.state(); return s.idleN === 1 && s.fingerOn; }, null, 8000);
    await sleep(1600); let s = await S(p);
    ok("6 級以上發呆（都沒點）：自動再播一次手指示範，同一題只一次", idle1 && s.idleN === 1 && s.i === 0 && s.wrong === 0, JSON.stringify({ idleN: s.idleN, fingerN: s.fingerN }));
    await answer(p, 8); await readyAt(p, 1);
    await tapPad(p, 5); await sleep(1300); s = await S(p);       // 答錯 → 示範 → 等小孩點對
    ok("作答之後不再觸發發呆示範（答錯示範、等點對的期間）", s.idleN === 1 && s.wrong === 1 && !s.fingerOn, JSON.stringify({ idleN: s.idleN, ph: s.phase }));
    await readyAt(p, 1, "must", 8000); await answer(p, 8); await readyAt(p, 2);
    await tapPad(p, 14); await sleep(250); await tapPad(p, 14); await sleep(280); s = await S(p);   // 點青蛙站的那片（不算作答）：重新算時間
    const early = s.idleN;
    const idle2 = await until(p, () => window.__zyHop.state().idleN === 2, null, 4000);
    ok("換題後重新計時；中間有點（不算作答的點）就重新算", early === 1 && idle2, `點完 0.6 秒時 ${early}`);
    await answer(p, 9); await readyAt(p, 3);
    await p.evaluate(() => window.__lab.setPaused(true)); await sleep(1300); s = await S(p);
    const frozen = s.idleN === 2;
    await p.evaluate(() => window.__lab.setPaused(false));
    ok("暫停時發呆計時凍結（用 api.later），繼續後才示範", frozen && (await until(p, () => window.__zyHop.state().idleN === 3, null, 4000)), `暫停中 ${s.idleN}`);
    await keepSpoken(p, "idle");
    await startWith(p, 1, [{ op: "+", a: 1, b: 2 }, { op: "+", a: 3, b: 1 }]); await readyAt(p, 0); await answer(p, 3); await readyAt(p, 1); await sleep(1500); s = await S(p);
    ok("1～5 級沒有發呆自動示範（照舊）", s.idleN === 0 && s.fingerN === 0, JSON.stringify({ idleN: s.idleN, fingerN: s.fingerN }));
    await close(o, "g7idle");
  }
  {
    const o = await open(browser, "lv=10&seed=32", { w: 1024, h: 768 }), p = o.p;
    await until(p, () => window.__zyHop.state().fingerN === 1, null, 5000);
    await p.evaluate(() => window.__zyHop.tune.idleMs = 600000);
    const real = await p.evaluate(() => window.__lab.game.state() && window.__zyHop.state().q.step);
    await startG1(p, 10, [{ op: "+", a: 6, b: 8, step: 2 }, { op: "-", a: 12, b: 4, step: 2 }, { op: "+", a: 15, b: 25, step: 5 }, { op: "-", a: 40, b: 10, step: 5 }, { op: "+", a: 50, b: 20, step: 10 }]);
    const fN = [], tens = [];
    for (let i = 0; i < 5; i++) {
      await readyAt(p, i); await sleep(500);
      const st = await S(p); fN.push(st.fingerN);
      tens.push(await p.evaluate(() => [...document.querySelectorAll(".hop-pad.ten")].map(b => b.dataset.n).join()));
      if (i === 2) await p.screenshot({ path: path.join(SHOTS, "g1_lv10_step5_segdemo.png") });
      await answer(p, st.q.ans);
    }
    ok("Lv10：一下跳多少換了（2→5→10）的第一題各做一次手指示範；同一段第二題、這次開機已經示範過的那段不重播", real === 2 && fN.join() === "0,0,1,1,2", `一開始 step ${real}；各題示範累計 ${fN.join()}`);
    ok("Lv10 地標：一下跳 2＝10、20；一下跳 5＝10～50 的整十；一下跳 10 不標", tens[0] === "10,20" && tens[1] === "10,20" && tens[2] === "10,20,30,40,50" && tens[3] === "10,20,30,40,50" && tens[4] === "", JSON.stringify(tens));
    await keepSpoken(p, "seg"); await close(o, "g7seg");
  }
  {
    // 真的出題（makeRound）：base 跟上一題一樣就不播換數字動畫，不一樣才播 11 片
    const o = await open(browser, "lv=6&seed=33", { w: 1024, h: 768 }), p = o.p, bad = []; let sameN = 0, diffN = 0;
    await readyAt(p, 0);
    await p.evaluate(() => { window.__numAnims = 0; const orig = Element.prototype.animate; Element.prototype.animate = function (kf, o) { if (this.classList.contains("hop-num") && /translateX|scaleY/.test(JSON.stringify(kf))) window.__numAnims++; return orig.call(this, kf, o); }; });
    let prev = (await S(p)).q.base;
    for (let i = 1; i < 10; i++) {
      await p.evaluate(() => { window.__numAnims = 0; window.__zyHop.skip(); }); await readyAt(p, i);
      const st = await S(p), n = await p.evaluate(() => window.__numAnims);
      if (st.q.base === prev) { sameN++; if (n !== 0) bad.push(`第${i + 1}題 base 沒變卻播了 ${n} 次`); } else { diffN++; if (n !== 11) bad.push(`第${i + 1}題 base ${prev}→${st.q.base} 只播 ${n} 次`); }
      prev = st.q.base;
    }
    ok(`Lv6 真的出題：base 沒變的 ${sameN} 題不播換數字動畫、有變的 ${diffN} 題才播`, bad.length === 0 && sameN >= 1, bad.join("｜"));
    await keepSpoken(p, "sticky"); await close(o, "g7sticky");
  }

  // ----- G6. 6 級以上念出的每一句都已經錄好（manifest.json）而且只會是那幾句固定台詞 -----
  {
    const notRec = [...new Set(g1Spoken.filter(x => !MAN.has(x.text)).map(x => `${x.tag}「${x.text}」`))], notLine = [...new Set(g1Spoken.filter(x => !LINE_SET.has(x.text)).map(x => `${x.tag}「${x.text}」`))];
    ok(`6 級以上印出的每一句「念／說」都在 voice/gemini_d/manifest.json 裡（共 ${g1Spoken.length} 句、${new Set(g1Spoken.map(x => x.text)).size} 種）`, MAN.size > 100 && g1Spoken.length > 10 && notRec.length === 0, notRec.slice(0, 5).join("、"));
    ok("6 級以上只念固定台詞（沒有題目句、算式、數字）", notLine.length === 0, notLine.slice(0, 5).join("、"));
  }

  // ===== 11. console error =====
  ok("沒有 console error／頁面錯誤", allErrs.length === 0, allErrs.slice(0, 5).join(" | "));

  await browser.close();
  const pass = results.filter(r => r.startsWith("PASS")).length, fail = results.length - pass;
  console.log(`\n青蛙跳荷葉：${pass} PASS / ${fail} FAIL（共 ${results.length} 項）  截圖：${SHOTS}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FAIL  測試本身出錯：" + (e && e.stack || e)); process.exit(1); });
