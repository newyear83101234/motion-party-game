// 🐸 青蛙跳荷葉（js/zhuyin-hop.js）自動測試：node tools/zy-test/hop-unit.js
// 用獨立試玩頁 tools/zy-test/hop-harness.html（不經過主程式），透過 window.__zyHop 掛鉤驗（docs/zhuyin-math-plan.md §3、§5）：
//   五級各玩一局到 onWin（星數照 starsOf）、Lv3 往回跳青蛙轉向、點青蛙站的那片不算、每局第一題手指示範、
//   b≥2 第一次點起點隔壁只提示（第二次就算錯）、把起點算進去的錯念專用提示（加法／減法／Lv5）、其他錯念「我們一起跳跳看」＋示範、
//   示範後要點對才過（只有第一次答對才算 right）、回饋／示範期間連點不算錯、答對一下一下跳＋每跳念一個數＋腳印跳一下熄一個＋一定念算式、
//   蜻蜓 Lv1～4 答對才飛到答案片、Lv5 一開始停在終點＋數字鈕作答、Lv5 點荷葉＝數字鈕跳一下＋念提示（say、每題一次）、連對 3 題空翻、量詞念「兩下」、
//   結算打嗝停在最邊邊也在畫面內、算式 ＋／－ 一樣寬一樣粗、
//   版面（1180×820、1024×768、820×1180 一排 11 片不重疊；算式卡／進度不碰 🏠🎵（含跳 5 下、兩位數、露出答案）；直放進度不壓背景小船；
//   390×844 請橫過來；844×390 能玩）、onEnd 不來也會往下走、stop() 之後不再出聲、沒有 console error。
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

  // ===== 11. console error =====
  ok("沒有 console error／頁面錯誤", allErrs.length === 0, allErrs.slice(0, 5).join(" | "));

  await browser.close();
  const pass = results.filter(r => r.startsWith("PASS")).length, fail = results.length - pass;
  console.log(`\n青蛙跳荷葉：${pass} PASS / ${fail} FAIL（共 ${results.length} 項）  截圖：${SHOTS}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FAIL  測試本身出錯：" + (e && e.stack || e)); process.exit(1); });
