// 小魚長大記（js/zhuyin-grow.js）自動測試：node tools/zy-test/grow-unit.js        （預設＝功能測試；加 --full＝再加長時間模擬；只跑長時間模擬：加 --long）
// 用獨立試玩頁 tools/zy-test/grow-harness.html（不經過主程式），透過 window.__zyGrow 掛鉤驗：
//   開局、拖曳移動（有慣性、停在手指後面）、點一下游過去、吃對長大（真的碰撞＋一口就對）、吃錯吐出來（暈、不扣、只回報第一次）、
//   12 秒沒吃對才發亮、被咬（旅程：掉金幣＋進度點少 1＋無敵 3 秒；只有嘴巴算）、河豚／海龜／鯨魚小能力、
//   長滿進化＋onZone＋星星罐＋休息一下、休息一下 → onEnd(rest)、第 1 圈長完 → 大結局 onEnd(finished)、第 2 圈心用完 → onEnd、
//   onEnd 欄位、暫停時不動、stop() 後沒有殘留 rAF／回呼、沒有 console 錯誤；
//   截圖 1180×820 與 820×1180（第 1、4、7 區、進化中、收尾）存到 %TEMP%\zy-grow-shots\；
//   長時間模擬：小孩模型（聽題再吃、八成吃對）跑完第 1 圈要多久（換算正常速度），對照「亂吃」（每次吃最近那隻）。
// ⚠️ 一次只跑這一支（這台電腦同時開太多 headless 瀏覽器會互搶）。
const path = require("path"), fs = require("fs");
const { launch, URL } = require("./lib");
const BASE = URL.replace(/zhuyin\.html.*$/, "tools/zy-test/grow-harness.html");
const SHOTS = path.join(process.env.TEMP || ".", "zy-grow-shots");
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); console.log(results[results.length - 1]); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LONG = process.argv.includes("--long"), QUICK = !process.argv.includes("--full");   // 11-01：預設不跑長時間模擬（全套 run-all.js 不帶參數，跑完約 5 分鐘）；--full＝功能＋長模擬、--long＝只跑長模擬
const allErrs = [];

async function open(browser, q = "", { w = 1180, h = 820 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => {                         // 數 rAF（stop 之後不能再要新的格）
    window.__rafN = 0; const o = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => { window.__rafN++; return o(cb); };
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if ((m.type() === "error" || m.type() === "warning") && !/favicon/.test(m.text())) errs.push(m.type().toUpperCase() + " " + m.text().slice(0, 200)); });
  await p.goto(`${BASE}?clean=1${q ? "&" + q : ""}`);
  await p.waitForFunction(() => window.__lab && window.__lab.ready && window.__zyGrow && window.__zyGrow.state(), null, { timeout: 15000 });
  return { ctx, p, errs };
}
const S = p => p.evaluate(() => window.__zyGrow.state());
const calls = p => p.evaluate(() => { const c = window.__lab.calls; return { say: c.say.length, talk: c.talk.slice(), answer: c.answer.slice(), zone: c.zone.slice(), end: c.end.slice(), play: c.play.length }; });
async function close(o, name) { allErrs.push(...o.errs.map(e => `[${name}] ${e}`)); await o.ctx.close(); }
// 等到可以吃（任務在、不在換題、不在演出）
const ready = p => p.waitForFunction(() => { const s = window.__zyGrow.state(); return s && s.task && !s.between && !s.evolving && !s.over && s.prey.some(f => f.ok && !f.re && !f.spit); }, null, { timeout: 8000 }).then(() => true, () => false);

// ---------- 頁內的小孩機器人（長時間模擬用） ----------
function botMain(cfg) {
  const G = window.__zyGrow, L = window.__lab;
  let seed = cfg.seed || 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const s0 = G.state();
  const B = window.__bot = { done: false, zones: [{ zone: s0.zone, ms: 0 }], end: null, phase: "think", until: 1.5, goal: null, giveUp: 0, aware: {}, lastCount: 0, lastWrong: 0, lastTask: "", lastZone: s0.zone, dodges: 0 };
  // 想多久：基本 think 秒數 × 題目級數的倍數（認一個符號快、看兩個字的詞慢）
  const think = tier => (cfg.think[0] + rnd() * (cfg.think[1] - cfg.think[0])) * (cfg.tierK ? cfg.tierK[tier] || 1 : 1);
  const iv = setInterval(() => {
    const s = G.state();
    if (!s) { clearInterval(iv); return; }
    if (L.calls.end.length) { B.done = true; B.end = L.calls.end[0]; B.ms = s.ms; clearInterval(iv); return; }
    if (cfg.capMs && s.ms > cfg.capMs) { B.done = true; B.capped = true; B.ms = s.ms; clearInterval(iv); return; }
    if (cfg.stopZone != null && s.zone >= cfg.stopZone) { B.done = true; B.ms = s.ms; clearInterval(iv); return; }
    const now = s.ms / 1000, p = s.player, U = s.U;
    if (s.zone !== B.lastZone) { B.zones.push({ zone: s.zone, ms: s.ms }); B.lastZone = s.zone; }
    if (s.over || s.evolving) { G.release(); B.phase = "think"; B.until = now + cfg.listen; return; }
    if (s.task && !s.between && !s.prey.some(f => f.re)) {     // 檢查：答案魚隨時至少 2 隻、而且都在畫面附近（不會游到畫面外迷路）；換題換字的那一下不算
      const near = s.prey.filter(f => f.ok && !f.leave && f.x > -s.W * 0.3 && f.x < s.W * 1.3).length, all = s.prey.filter(f => f.ok && !f.leave).length;
      B.minNear = Math.min(B.minNear == null ? 9 : B.minNear, near); if (all > near) B.lost = (B.lost || 0) + 1;
      B.seen = B.seen || {}; for (const f of s.prey) if (f.entering && !B.seen[f.id]) { B.seen[f.id] = 1; B.entAll = (B.entAll || 0) + 1; if (f.ok) B.entOk = (B.entOk || 0) + 1; }   // 游進來的魚有幾成是答案
    }
    // 躲大魚（小孩不一定每次都注意到：aware 機率）
    for (const pr of s.preds) {
      if (pr.edible || pr.fed || pr.out) continue;
      if (B.aware[pr.id] == null) B.aware[pr.id] = rnd() < cfg.aware;
      if (!B.aware[pr.id]) continue;
      if (Math.hypot(pr.mouth.x - p.x, pr.mouth.y - p.y) < pr.r * 1.1 + 14 * U) {
        const hx = Math.cos(pr.ang), hy = Math.sin(pr.ang), side = ((p.x - pr.x) * -hy + (p.y - pr.y) * hx) >= 0 ? 1 : -1;
        let tx = p.x - hy * side * 30 * U, ty = p.y + hx * side * 30 * U;
        if (ty < s.playTop || ty > s.H - 4 * U) { ty = p.y - (ty - p.y); tx = p.x - (tx - p.x); }
        G.steer(Math.max(5 * U, Math.min(s.W - 5 * U, tx)), Math.max(s.playTop, Math.min(s.H - 4 * U, ty))); B.dodges++; B.dodgeUntil = now + 0.5; return;   // 躲完繼續找原本想吃的那隻（不會因為躲了就改主意）
      }
    }
    if (!s.task || s.between) { G.release(); B.phase = "think"; B.until = now + cfg.listen; return; }
    const tk = s.task.say + "|" + s.tasksDone + "|" + s.zone;
    if (tk !== B.lastTask) { B.lastTask = tk; B.lastCount = s.count; B.lastWrong = s.wrong; B.phase = "think"; B.until = now + cfg.listen; G.release(); return; }   // 新任務：先聽題
    if (now < (B.dodgeUntil || 0)) return;
    if (s.count < B.lastCount && s.wrong === B.lastWrong) { B.lastCount = s.count; B.dodgeUntil = now + 0.6; return; }   // 被咬掉一個點：愣一下，目標不變
    if (s.count !== B.lastCount || s.wrong !== B.lastWrong) { const w = s.wrong !== B.lastWrong; B.lastCount = s.count; B.lastWrong = s.wrong; B.phase = "think"; B.until = now + (w ? cfg.thinkWrong : think(s.task.tier)); G.release(); return; }
    if (B.phase === "think") {
      if (now < B.until) return;
      const live = s.prey.filter(f => !f.re && !f.spit && !f.leave && f.y > s.playTop);
      if (!live.length) return;
      const want = cfg.random ? live : (rnd() < cfg.acc ? live.filter(f => f.ok) : live.filter(f => !f.ok));
      const pool = want.length ? want : live, m = p.mouth;
      pool.sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y));
      B.goal = pool[0].id; B.phase = "go"; B.giveUp = now + 8;
    }
    if (B.phase === "go") {
      const f = s.prey.find(x => x.id === B.goal);
      if (!f || f.spit || now > B.giveUp) { B.phase = "think"; B.until = now + 0.4; G.release(); return; }
      G.steer(f.x, f.y);
    }
  }, 16);
}
async function simulate(browser, label, q, cfg, realCapMs) {
  const o = await open(browser, q);
  await o.p.evaluate(cfg0 => { window.__botCfg = cfg0; }, cfg);
  await o.p.evaluate(`(${botMain.toString()})(Object.assign({}, window.__botCfg))`);
  const t0 = Date.now();
  while (Date.now() - t0 < realCapMs) { await sleep(2000); if (await o.p.evaluate(() => window.__bot && window.__bot.done)) break; }
  const r = await o.p.evaluate(() => { const b = window.__bot, s = window.__zyGrow.state(); return { done: b.done, capped: !!b.capped, end: b.end, zones: b.zones, ms: b.ms || (s && s.ms), dodges: b.dodges, minNear: b.minNear, lost: b.lost || 0, entAll: b.entAll || 0, entOk: b.entOk || 0, s: s && { zone: s.zone, right: s.right, wrong: s.wrong, bites: s.bites, coins: s.coins, bigEaten: s.bigEaten, ease: s.ease } }; });
  r.real = Date.now() - t0;
  await close(o, label);
  return r;
}

(async () => {
  const browser = await launch();
  if (!LONG) {
    // ===== 1. 開局 =====
    {
      const o = await open(browser, "seed=11"), p = o.p;
      await sleep(900);
      const s = await S(p), c = await calls(p);
      const dom = await p.evaluate(() => ({ hearts: !!document.querySelector(".grow-hearts.grow-off"), rest: !!document.querySelector(".grow-rest.grow-off"), task: document.querySelector(".grow-task").getBoundingClientRect().toJSON() }));
      ok("開局：第 1 區、旅程模式（沒有心）、任務 0/3", s.zone === 0 && !s.challenge && s.count === 0 && s.tasksDone === 0 && dom.hearts, JSON.stringify({ zone: s.zone, ch: s.challenge, hearts: dom.hearts }));
      const live = s.prey.filter(f => !f.leave), okN = live.filter(f => f.ok).length;
      ok("開局：5–9 隻小魚、答案魚至少 2 隻、約 3 成", live.length >= 5 && live.length <= 9 && okN >= 2 && okN / live.length <= 0.45, `${okN}/${live.length}`);
      ok("開局：念了題目（say＝q.say）", c.say >= 1 && (await p.evaluate(() => window.__lab.calls.say.includes(window.__zyGrow.state().task.say))), `say×${c.say}`);
      ok("開局：畫布＝畫面大小×dpr（上限 2）", s.cw === Math.round(s.W * s.dpr) && s.dpr <= 2, `${s.cw}×${s.ch} dpr ${s.dpr}`);
      ok("開局：任務牌不擋左上角 110×110", dom.task.left > 110 || dom.task.top > 110, JSON.stringify({ l: Math.round(dom.task.left), t: Math.round(dom.task.top) }));
      ok("開局：新任務念完 3 秒內不放大魚、休息鈕沒出現", s.noPredIn > 2.5 && s.preds.length === 0 && dom.rest, `noPredIn ${s.noPredIn.toFixed(1)}`);
      // ===== 2. 拖曳移動：有慣性、魚停在手指後面一點 =====
      const p0 = (await S(p)).player, fx = Math.min(p0.x + 360, 1100), fy = p0.y + 40;
      await p.evaluate(() => window.__zyGrow.noPreds(true));
      await p.mouse.move(p0.x, p0.y); await p.mouse.down(); await p.mouse.move(fx, fy, { steps: 4 });
      await sleep(60); const p1 = (await S(p)).player;
      await sleep(1800); const p2 = (await S(p)).player;
      await p.mouse.up();
      const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y), dFinger = Math.hypot(fx - p2.x, fy - p2.y), mouthToFinger = Math.hypot(fx - p2.mouth.x, fy - p2.mouth.y);
      ok("拖曳：魚往手指游、不會瞬移（一開始只動一點）", d1 > 0.5 && d1 < 120, `前 60ms 動了 ${d1.toFixed(1)}px`);
      ok("拖曳：游到手指後面停下（魚身不在手指底下、嘴巴在手指附近）", dFinger > p2.r * 1.0 && mouthToFinger < p2.r * 1.0 && p2.face === 1, `中心離手指 ${dFinger.toFixed(0)}px、嘴巴離手指 ${mouthToFinger.toFixed(0)}px、r ${p2.r.toFixed(0)}`);
      // 點一下＝游過去
      const tx = 250, ty = 600; await p.mouse.click(tx, ty); await sleep(3800);
      const p3 = (await S(p)).player;
      ok("點一下：魚游到那裡（嘴巴到點的附近）", Math.hypot(p3.mouth.x - tx, p3.mouth.y - ty) < p3.r * 1.2 && p3.face === -1, `嘴巴離點 ${Math.hypot(p3.mouth.x - tx, p3.mouth.y - ty).toFixed(0)}px`);
      await close(o, "拖曳");
    }
    {
      // ===== 3. 吃對長大（真的碰撞）＋一口就對：把一隻答案魚擺在嘴巴前面，手指按著它 =====
      const o = await open(browser, "seed=11"), p = o.p;
      await sleep(600); await p.evaluate(() => window.__zyGrow.noPreds(true)); await ready(p); await sleep(900);
      const target = await p.evaluate(() => { const g = window.__zyGrow, s = g.state(), f = s.prey.find(x => x.ok && !x.re && !x.spit), m = s.player.mouth; g.movePrey(f.id, Math.min(s.W - 80, m.x + 14 * s.U), m.y); return f; });
      const b0 = await S(p);
      let eaten = false;
      for (let i = 0; i < 160 && !eaten; i++) {
        const s1 = await S(p); const f = s1.prey.find(x => x.id === target.id);
        if (s1.count > b0.count) { eaten = true; break; }
        if (!f) break;
        await p.evaluate(([x, y]) => window.__zyGrow.steer(x, y), [f.x, f.y]); await sleep(50);
      }
      const b1 = await S(p), c1 = await calls(p);
      ok("吃對（碰撞）：任務點亮 1、變大、onAnswer ok:true", eaten && b0.count === 0 && b1.count === 1 && b1.player.rT > b0.player.rT && c1.answer.length === 1 && c1.answer[0].ok === true, `count ${b0.count}→${b1.count} r ${b0.player.rT.toFixed(1)}→${b1.player.rT.toFixed(1)}`);
      const pop = await p.evaluate(() => { const e = document.querySelector(".grow-cheer"); return e && !e.classList.contains("grow-off") ? e.textContent : null; });
      ok("一口就對：3 倍金幣（6）＋大字＋念「一口就對！」", b1.coins - b0.coins === 6 && pop === "一口就對！" && c1.talk.includes("一口就對！"), `金幣 +${b1.coins - b0.coins}、大字 ${pop}`);
      // ===== 4. 吃錯：吐出來、暈、不扣、只回報第一次 =====
      await p.evaluate(() => window.__zyGrow.release());
      const w0 = await S(p);
      await p.evaluate(() => window.__zyGrow.answer(false)); await sleep(80);
      const w1 = await S(p), c2 = await calls(p);
      ok("吃錯：吐出來（那隻彈開）、任務點不變、頭暈 1.2 秒、連吃歸零", w1.wrong === w0.wrong + 1 && w1.count === w0.count && w1.player.dizzy > 0.9 && w1.streak === 0 && w1.prey.some(f => f.spit), `dizzy ${w1.player.dizzy.toFixed(2)}`);
      ok("吃錯：回報 onAnswer ok:false（第一次）", c2.answer.length === 2 && c2.answer[1].ok === false, JSON.stringify(c2.answer[1]));
      const canEat = await p.evaluate(() => { const g = window.__zyGrow, s = g.state(); return s.player.dizzy > 0; });
      await p.evaluate(() => window.__zyGrow.answer(false)); await sleep(80);
      const w2 = await S(p), c3 = await calls(p);
      ok("吃錯第二次：算在 wrong、但不再回報（每個任務只回報第一次）", w2.wrong === w0.wrong + 2 && c3.answer.length === 2 && canEat, `回報 ${c3.answer.length} 次`);
      ok("吃錯：沒有扣心、沒有結束", w2.hearts === 0 && !w2.over);
      // ===== 5. 被咬（旅程）：掉金幣、進度點少 1、無敵 3 秒 =====
      await sleep(1300);
      const h0 = await S(p);
      const hit = await p.evaluate(() => window.__zyGrow.hurt()); await sleep(60);
      const h1 = await S(p);
      ok("被咬（旅程）：掉金幣（最多 5）、任務點少 1、無敵 3 秒、不會結束", hit && h1.coins === h0.coins - Math.min(5, h0.coins) && h1.count === Math.max(0, h0.count - 1) && h1.player.inv > 2.8 && !h1.over, `金幣 ${h0.coins}→${h1.coins} 點 ${h0.count}→${h1.count} inv ${h1.player.inv.toFixed(2)}`);
      const again = await p.evaluate(() => window.__zyGrow.hurt());
      ok("無敵中再被碰：沒事", again === false && (await S(p)).coins === h1.coins);
      await close(o, "開局");
    }
    // ===== 6. 只有大魚的嘴巴碰到才算；嘴巴碰到才咬 =====
    {
      const o = await open(browser, "seed=4"), p = o.p;
      await sleep(600); await p.evaluate(() => window.__zyGrow.noPreds(true));
      const s = await S(p), pl = s.player;
      // 尾巴碰到：大魚在你右邊、往右游（嘴巴朝外）
      await p.evaluate(([x, y]) => window.__zyGrow.spawnPred({ big: true, side: -1, x, y }), [pl.x + pl.r * 3.2, pl.y]);
      await sleep(400); const a = await S(p);
      ok("大魚身體／尾巴碰到你：不算咬", a.bites === 0, `bites ${a.bites}`);
      await p.evaluate(() => { const g = window.__zyGrow; g.state(); });
      // 嘴巴碰到：大魚在你左邊、往右游（嘴巴對著你）
      const pl2 = (await S(p)).player;
      await p.evaluate(([x, y]) => window.__zyGrow.spawnPred({ big: false, side: -1, x, y }), [pl2.x - pl2.r * 3.0, pl2.y]);
      await p.waitForFunction(() => window.__zyGrow.state().bites > 0, null, { timeout: 4000 }).catch(() => {});
      const b = await S(p);
      ok("大魚嘴巴碰到你：咬到", b.bites === 1, `bites ${b.bites}`);
      await close(o, "嘴巴");
    }
    // ===== 7. 小能力：河豚鼓起來、海龜殼、鯨魚一口兩隻、海豚快 =====
    {
      const o = await open(browser, "seed=5&zone=3"), p = o.p;
      await sleep(500); await ready(p);
      await p.evaluate(() => window.__zyGrow.answer(true)); await sleep(50);
      const a0 = await S(p);
      await p.evaluate(() => window.__zyGrow.hurt()); await sleep(50);
      const a1 = await S(p);
      ok("河豚（第 3 區）：被咬會鼓起來嚇跑、不掉金幣不少點（每區 1 次）", a0.species === 2 && a1.player.puff > 0 && a1.coins === a0.coins && a1.count === a0.count, `puff ${a1.player.puff.toFixed(2)} 點 ${a0.count}→${a1.count}`);
      await sleep(1700); await p.evaluate(() => window.__zyGrow.hurt()); await sleep(50);
      const a2 = await S(p);
      ok("河豚第二次被咬：照常掉", a2.count === Math.max(0, a1.count - 1) && a2.bites === 1, `點 ${a1.count}→${a2.count}`);
      await p.evaluate(() => window.__zyGrow.setZone(3)); await sleep(300); await ready(p);
      await p.evaluate(() => window.__zyGrow.answer(true)); await sleep(50);
      const t0 = await S(p); await sleep(3100);
      await p.evaluate(() => window.__zyGrow.hurt()); await sleep(50); const t1 = await S(p);
      ok("海龜（第 4 區）：殼擋一次、不少點", t0.species === 3 && t1.count === t0.count && t1.bites === t0.bites, `點 ${t0.count}→${t1.count}`);
      await p.evaluate(() => window.__zyGrow.setZone(6)); await sleep(300); await ready(p); await sleep(1200);
      const w = await p.evaluate(() => { const g = window.__zyGrow, s = g.state(), m = s.player.mouth, two = s.prey.filter(f => f.ok && !f.re && !f.spit).slice(0, 2); if (two.length < 2) return null; g.movePrey(two[0].id, m.x, m.y); g.movePrey(two[1].id, m.x + 6 * s.U, m.y + 2 * s.U); g.answer(true); return g.state().count; });
      ok("鯨魚（第 7 區）：一大口吃 2 隻", w === 2, `count ${w}`);
      await p.evaluate(() => window.__zyGrow.setZone(4)); await sleep(300);
      const sp = await p.evaluate(async () => {
        const g = window.__zyGrow; g.steer(30, g.state().H * 0.6); await new Promise(r => setTimeout(r, 1500));   // 先到左邊，再一路游到右邊量最快速度
        let s = g.state(); g.steer(s.W - 30, s.H * 0.6); let mx = 0;
        for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 50)); s = g.state(); mx = Math.max(mx, Math.hypot(s.player.vx, s.player.vy) / s.U); }
        return { mx, sp: s.species };
      });
      ok("海豚（第 5 區）：游得比較快（最快 > 32 U/秒；小魚最快 28）", sp.sp === 4 && sp.mx > 32, `${sp.mx.toFixed(1)} U/秒`);
      await close(o, "能力");
    }
    // ===== 8. 12 秒沒吃對才發亮；吃對就不亮 =====
    {
      const o = await open(browser, "seed=6&speed=4"), p = o.p;
      await p.evaluate(() => window.__zyGrow.noPreds(true));
      await sleep(1500); const h0 = await S(p);
      await p.evaluate(() => window.__zyGrow.answer(false)); await sleep(50); await p.evaluate(() => window.__zyGrow.answer(false)); await sleep(50);
      const h1 = await S(p);
      ok("連吃錯 2 隻也不馬上發亮（只看時間）", !h1.hint, `sinceOk ${h1.sinceOk.toFixed(1)}`);
      await p.waitForFunction(() => window.__zyGrow.state().hint, null, { timeout: 6000 }).catch(() => {});
      const h2 = await S(p);
      ok("這個任務 12 秒都沒吃對 → 答案魚發亮", h2.hint && h2.sinceOk >= 12, `sinceOk ${h2.sinceOk.toFixed(1)}（加速 4 倍）`);
      await sleep(400); await p.evaluate(() => window.__zyGrow.answer(true)); await sleep(50);
      ok("吃對一隻 → 不亮了", !(await S(p)).hint && !h0.hint);
      await close(o, "發亮");
    }
    // ===== 9. 長滿進化＋onZone＋星星罐＋休息一下鈕；按休息一下 → onEnd(rest) =====
    for (const [w, h] of [[1180, 820], [820, 1180]]) {
      const o = await open(browser, "seed=8", { w, h }), p = o.p;
      await sleep(600); await p.evaluate(() => window.__zyGrow.noPreds(true));
      await ready(p);
      await p.evaluate(() => window.__zyGrow.evolve());
      await p.waitForFunction(() => window.__zyGrow.state().evolveT > 1.15, null, { timeout: 5000 }).catch(() => {});
      await p.screenshot({ path: path.join(SHOTS, `grow-${w}x${h}-evolve.png`) });
      const e1 = await S(p), bn = await p.evaluate(() => document.querySelector(".grow-banner").textContent);
      ok(`[${w}×${h}] 進化演出：大字「熱帶魚！」、換到第 2 區`, e1.evolving && /熱帶魚！/.test(bn) && e1.zone === 1, bn);
      await p.waitForFunction(() => !window.__zyGrow.state().evolving, null, { timeout: 5000 }).catch(() => {});
      await sleep(300);
      const e2 = await S(p), c = await calls(p);
      ok(`[${w}×${h}] 進化完：onZone({zone:1})、星星罐 1 顆、念第 2 區台詞、新任務`, c.zone.length === 1 && c.zone[0].zone === 1 && e2.stars === 1 && c.talk.some(t => /熱帶魚/.test(t)) && e2.task && e2.count === 0, JSON.stringify({ zone: c.zone, stars: e2.stars }));
      ok(`[${w}×${h}] 進化完：休息一下鈕出現`, e2.restOn && (await p.evaluate(() => !document.querySelector(".grow-rest").classList.contains("grow-off"))));
      if (w === 1180) {
        await p.waitForFunction(() => !window.__zyGrow.state().restOn, null, { timeout: 9000 }).catch(() => {});
        const e3 = await S(p);
        ok("休息一下：約 5 秒沒按就收起來、繼續玩（11-01 由 3 秒改 5.5 秒：小孩來不及按）", !e3.restOn && !e3.over && (e3.ms - e2.ms) < 7000, `${((e3.ms - e2.ms) / 1000).toFixed(1)} 秒`);
      } else {
        const r = await p.evaluate(() => document.querySelector(".grow-rest").getBoundingClientRect().toJSON());
        await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
        await sleep(1300);
        await p.screenshot({ path: path.join(SHOTS, `grow-${w}x${h}-end-rest.png`) });
        const mapTx = await p.evaluate(() => document.querySelector(".grow-map-tx") && document.querySelector(".grow-map-tx").textContent);
        await p.waitForFunction(() => window.__lab.calls.end.length > 0, null, { timeout: 5000 }).catch(() => {});
        const c2 = await calls(p), r0 = c2.end[0] || {};
        const keys = ["zone", "zonesCleared", "score", "coins", "right", "wrong", "ms", "words", "record", "finished", "rest", "stars"];
        ok("按休息一下 → 小地圖「你長成熱帶魚了！」→ onEnd(rest:true)", mapTx === "你長成熱帶魚了！" && c2.end.length === 1 && r0.rest === true && r0.finished === false, mapTx);
        ok("onEnd 欄位齊全、型別對", keys.every(k => k in r0) && Array.isArray(r0.words) && typeof r0.record === "boolean" && r0.zone === 1 && r0.zonesCleared === 1 && r0.stars === 1 && r0.score >= r0.right * 10 + r0.coins && r0.ms > 0, JSON.stringify(r0));
        ok("沒有「遊戲結束」字樣", !(await p.evaluate(() => /遊戲結束/.test(document.body.textContent))));
      }
      await close(o, "進化" + w);
    }
    // ===== 10. 第 1 圈：寶藏宮殿長完＝大結局 onEnd(finished) =====
    {
      const o = await open(browser, "seed=9&zone=8"), p = o.p;
      await sleep(600); await p.evaluate(() => window.__zyGrow.noPreds(true)); await ready(p);
      await p.evaluate(() => window.__zyGrow.evolve());
      await p.waitForFunction(() => window.__zyGrow.state().overT > 1.4, null, { timeout: 6000 }).catch(() => {});
      await p.screenshot({ path: path.join(SHOTS, "grow-1180x820-finale.png") });
      const mapTx = await p.evaluate(() => document.querySelector(".grow-map-tx") && document.querySelector(".grow-map-tx").textContent);
      await p.waitForFunction(() => window.__lab.calls.end.length > 0, null, { timeout: 6000 }).catch(() => {});
      const c = await calls(p), r = c.end[0] || {};
      ok("第 8 區長完：大結局「長成魚王了！」→ onEnd(finished:true)、zone 7、星星 +1", mapTx === "長成魚王了！" && r.finished === true && r.rest === false && r.zone === 7 && r.stars === 1, JSON.stringify(r));
      await close(o, "大結局");
    }
    // ===== 11. 第 2 圈＝挑戰：有 3 顆心、被咬扣心、心用完收尾 =====
    {
      const o = await open(browser, "seed=10&zone=9"), p = o.p;
      await sleep(600); await p.evaluate(() => window.__zyGrow.noPreds(true));
      const s0 = await S(p);
      const heartsShown = await p.evaluate(() => !document.querySelector(".grow-hearts").classList.contains("grow-off") && document.querySelectorAll(".grow-heart:not(.grow-empty)").length);
      ok("第 2 圈（zone 8）：挑戰模式、3 顆心、看得到心", s0.challenge && s0.hearts === 3 && heartsShown === 3 && s0.zone === 8 && s0.species === 7 && s0.bg === 0, JSON.stringify({ z: s0.zone, h: s0.hearts, shown: heartsShown }));
      await p.evaluate(() => window.__zyGrow.hurt()); await sleep(50);
      const s1 = await S(p);
      ok("第 2 圈被咬：扣 1 顆心、無敵", s1.hearts === 2 && s1.player.inv > 2.5);
      await p.evaluate(() => { window.__zyGrow.hurt({ force: true }); window.__zyGrow.hurt({ force: true }); });
      await sleep(1200);
      await p.screenshot({ path: path.join(SHOTS, "grow-1180x820-end-out.png") });
      await p.waitForFunction(() => window.__lab.calls.end.length > 0, null, { timeout: 6000 }).catch(() => {});
      const c = await calls(p), r = c.end[0] || {};
      ok("第 2 圈心用完：收尾 → onEnd(finished:false, rest:false)、zone 8", c.end.length === 1 && r.finished === false && r.rest === false && r.zone === 8, JSON.stringify(r));
      await close(o, "挑戰");
    }
    // ===== 12. 暫停時不動；stop() 後全部收乾淨 =====
    {
      const o = await open(browser, "seed=12"), p = o.p;
      await sleep(800);
      await p.evaluate(() => { window.__zyGrow.steer(200, 500); window.__lab.setPaused(true); });
      await sleep(100); const a = await S(p); await sleep(900); const b = await S(p);
      const same = a.player.x === b.player.x && a.player.y === b.player.y && a.ms === b.ms && a.prey.every((f, i) => b.prey[i] && f.x === b.prey[i].x && f.y === b.prey[i].y);
      ok("暫停：魚、小魚、遊戲時間都停住", same, `ms ${a.ms}→${b.ms}`);
      const tapped = await p.evaluate(() => { const g = window.__zyGrow; return g.state().player.x; });
      await p.mouse.click(1000, 300); await sleep(300);
      ok("暫停：點畫面沒反應", (await S(p)).player.x === tapped);
      await p.evaluate(() => window.__lab.setPaused(false)); await sleep(400);
      ok("取消暫停：繼續動", (await S(p)).ms > b.ms);
      await p.evaluate(() => window.__lab.game.stop());
      const z0 = await p.evaluate(() => ({ raf: window.__rafN, kids: document.getElementById("growRoot").children.length, st: window.__zyGrow.state(), cls: document.getElementById("growRoot").className, ...(() => { const c = window.__lab.calls; return { n: c.say.length + c.talk.length + c.play.length + c.answer.length + c.zone.length + c.end.length }; })() }));
      await sleep(2500);
      const z1 = await p.evaluate(() => ({ raf: window.__rafN, n: (() => { const c = window.__lab.calls; return c.say.length + c.talk.length + c.play.length + c.answer.length + c.zone.length + c.end.length; })() }));
      ok("stop()：畫面清空、state 變 null、沒有新的 rAF", z0.kids === 0 && z0.st === null && z0.cls === "" && z1.raf === z0.raf, `rAF ${z0.raf}→${z1.raf}`);
      ok("stop()：之後沒有任何 api 回呼（說話、音效、onEnd…）", z1.n === z0.n, `${z0.n}→${z1.n}`);
      await p.evaluate(() => window.__lab.game.start({ zone: 2 }));
      await sleep(600);
      ok("stop() 後可以再 start", (await S(p)).zone === 2);
      await close(o, "暫停");
    }
    // ===== 13. 截圖：1180×820 與 820×1180，第 1、4、7 區 =====
    for (const [w, h] of [[1180, 820], [820, 1180]]) {
      for (const z of [1, 4, 7]) {
        const o = await open(browser, `seed=${20 + z}&zone=${z}`, { w, h }), p = o.p;
        await sleep(900);
        await p.evaluate(() => window.__zyGrow.noPreds(true));
        // 擺一隻大魚、讓魚往一隻小魚游、吃一隻（看得到任務點、金幣）
        await p.evaluate(([zz]) => { const g = window.__zyGrow, s = g.state(); g.answer(true); if (zz > 1) g.spawnPred({ big: true, side: 1, x: s.W * 0.78, y: s.H * 0.7 }); }, [z]);
        await sleep(700);
        await p.screenshot({ path: path.join(SHOTS, `grow-${w}x${h}-z${z}.png`) });
        const s = await S(p);
        if (z === 7) ok(`[${w}×${h}] 第 7 區＝兩個字的詞（泡泡放得下）`, s.task.kind === "word" && s.prey.every(f => f.rx > 0), `${s.task.answer}`);
        if (z === 1) ok(`[${w}×${h}] 第 1 區聽音題：任務牌不顯示答案（沒有圖）`, await p.evaluate(() => document.querySelector(".grow-task-pic").classList.contains("grow-off") && !/[ㄅ-ㄩ]/.test(document.querySelector(".grow-task").textContent)));
        if (z === 4 || z === 7) ok(`[${w}×${h}] 第 ${z} 區：泡泡都在任務牌下面（不被擋到）`, s.prey.filter(f => !f.entering && !f.leave).every(f => f.by - f.ry >= s.playTop - 4), `playTop ${s.playTop.toFixed(0)}`);
        await close(o, `截圖${w}z${z}`);
      }
    }
    // 額外截圖：第 3 段的金色皇冠魚、發亮提示、頭暈
    {
      const o = await open(browser, "seed=31&zone=2&speed=3"), p = o.p;
      await sleep(600); await p.evaluate(() => window.__zyGrow.noPreds(true)); await ready(p);
      await p.evaluate(() => window.__zyGrow.spawnPred({ big: false, side: 1, x: 900, y: 600 }));
      for (let k = 0; k < 2; k++) { await ready(p); await p.evaluate(() => window.__zyGrow.finishTask()); await sleep(900); }
      await ready(p); await sleep(4500);
      await p.evaluate(() => window.__zyGrow.answer(false)); await sleep(150);
      await p.screenshot({ path: path.join(SHOTS, "grow-1180x820-crown-hint.png") });
      const s = await S(p);
      ok("第 3 段：有金色皇冠魚可以吃", s.tasksDone === 2 && s.preds.some(x => x.edible), `${s.preds.map(x => (x.edible ? "皇冠" : "大魚")).join(",")}`);
      await close(o, "皇冠");
    }
  }
  // ===== 14. 長時間模擬：第 1 圈長完要多久（正常速度換算） =====
  if (!QUICK) {
    // 小孩模型（5 歲）：每吃一隻想 1.5–3.5 秒（看泡泡、想是哪個），級數越高想越久（第 1 級 ×1、第 6 級兩個字的詞 ×1.6）；
    //   新任務聽題 2.5 秒、吃錯後愣 1 秒、大魚來時 7 成會注意到並躲開；手指直接指著要吃的那隻（每 16ms 跟著魚動）
    const kid = { acc: 0.8, think: [1.5, 3.5], tierK: [1, 1, 1.1, 1.2, 1.35, 1.45, 1.6], listen: 2.5, thinkWrong: 1.0, aware: 0.7, seed: 17 };
    const SEED = +process.env.GROW_SEED || 41; kid.seed = SEED + 1;          // 換種子再跑：GROW_SEED=99 node tools/zy-test/grow-unit.js --long
    const sm = await simulate(browser, "聽題再吃", `seed=${SEED}&speed=6`, kid, 240000);
    const zt = sm.zones.map((z, i) => (i ? ((z.ms - sm.zones[i - 1].ms) / 60000).toFixed(1) : null)).filter(Boolean).join("/");
    ok("模擬（聽題再吃、八成吃對、加速 6 倍）：第 1 圈長完（大結局）", sm.done && sm.end && sm.end.finished === true, `第 ${(sm.s && sm.s.zone) + 1} 區、實際 ${(sm.real / 1000).toFixed(0)} 秒`);
    const min = (sm.end ? sm.end.ms : sm.ms) / 60000;
    ok("模擬：正常速度換算 8–11 分鐘", min >= 8 && min <= 11, `${min.toFixed(1)} 分鐘（各區 ${zt} 分）、吃對 ${sm.end && sm.end.right} 吃錯 ${sm.end && sm.end.wrong}、被咬 ${sm.s && sm.s.bites}、躲 ${sm.dodges}、皇冠魚 ${sm.s && sm.s.bigEaten}`);
    ok("模擬：整局答案魚隨時至少 2 隻、都在畫面附近（沒有游到畫面外迷路的）", sm.lost === 0 && sm.minNear >= 2, `迷路 ${sm.lost} 次、最少 ${sm.minNear} 隻（含正從邊邊游進來的）`);
    ok("模擬：游進來的魚不一定是答案（不能靠「找剛游進來的」猜）", sm.entAll > 20 && sm.entOk / sm.entAll < 0.75, `游進來 ${sm.entAll} 隻、其中答案 ${sm.entOk} 隻`);
    const rnd = await simulate(browser, "亂吃", `seed=${SEED}&speed=6`, { random: true, think: [0.3, 0.7], listen: 0.3, thinkWrong: 0.3, aware: 0.7, seed: 17, stopZone: 3, capMs: 15 * 60000 }, 160000);
    const sm3 = sm.zones.find(z => z.zone === 3), m3 = sm3 ? sm3.ms / 60000 : NaN, r3 = rnd.ms / 60000;
    ok("亂吃（每次都吃最近那隻）比聽題再吃明顯慢（前 3 區）", r3 > m3 * 1.3, `亂吃 ${r3.toFixed(1)} 分${rnd.capped ? "（還沒長完）" : ""} vs 聽題 ${m3.toFixed(1)} 分、亂吃吃錯 ${rnd.s && rnd.s.wrong} 吃對 ${rnd.s && rnd.s.right}`);
  }
  await browser.close();
  ok("沒有 console 錯誤／警告", allErrs.length === 0, allErrs.slice(0, 5).join(" | "));
  const fail = results.filter(r => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fail}/${results.length} PASS　截圖：${SHOTS}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
