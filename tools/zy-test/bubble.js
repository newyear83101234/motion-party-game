// 泡泡救援灣（js/zhuyin-bubble.js）測試：node tools/zy-test/bubble.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 BB_SHOTS（預設 %TEMP%\zy-bubble）。
// 驗：①求解器 10 關都救得完（每關 BB_SEEDS 種亂數，印出發射數與 par）②瞄準預測＝實際落點、消除、掉落、救出、onWin 參數
//     ③前 3 關示範（開場、4 秒沒動作、換一顆提示）④暫停不收操作 ⑤onFull ⑥stop() 清乾淨、重開不報錯、飛行中 stop 不殘留
//     ⑦10 關用介面實際打完 ⑧四種 iPad 尺寸版面（放得下、不重疊、按鈕夠大、不捲動）⑨國字都有注音 ⑩全程 0 個 console error
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const BASE = process.env.ZY_BASE || "http://127.0.0.1:8765";
const LAB = BASE + "/tools/zy-test/bubble-lab.html";
const SHOTS = process.env.BB_SHOTS || path.join(os.tmpdir(), "zy-bubble");
const SEEDS = +(process.env.BB_SEEDS || 40);
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allErrs = [];

async function open(browser, w, h, q = "") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => { errs.push("PAGEERR " + e.message); allErrs.push(`[${w}x${h}] PAGEERR ${e.message}`); });
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) { errs.push("CONSOLE " + m.text().slice(0, 160)); allErrs.push(`[${w}x${h}] CONSOLE ${m.text().slice(0, 160)}`); } });
  await p.goto(LAB + "?mute=1" + (q ? "&" + q : ""));
  await p.waitForFunction(() => window.__bb && window.__bb.ready, null, { timeout: 15000 });
  return { ctx, p, errs };
}
const S = p => p.evaluate(() => window.__bb.game.state());
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
const waitIdle = (p, t = 15000) => p.waitForFunction(() => { const s = window.__bb.game.state(); return s && (!s.busy || s.won || s.full); }, null, { timeout: t, polling: 30 });
// 用「最好的一發」打一發：要換就先換，回傳 { pred, fired }
const playBest = p => p.evaluate(() => { const g = window.__bb.game, b = g.debug.bestShot(); if (b.swap) g.debug.swap(); g.debug.aim(b.angle); const pred = g.debug.predict().cell; const fired = g.debug.fire(); return { b, pred, fired }; });
// 真的手指操作（Playwright 滑鼠＝pointer 事件）：單位座標 → 螢幕座標
async function pointAt(p, ux, uy) { return p.evaluate(([x, y]) => { const f = document.querySelector(".bb-field").getBoundingClientRect(), u = f.width / 16; return [f.left + x * u, f.top + y * u]; }, [ux, uy]); }

(async () => {
  const browser = await launch();

  // ===== ① 求解器：每關多種亂數都要救得完，par 要 ≥ 求解器的 75 百分位 =====
  {
    const { ctx, p } = await open(browser, 1180, 820, "clean=1");
    const rows = await p.evaluate(N => {
      const m = window.__bb.mod, out = [];
      m.LEVELS.forEach((def, i) => {
        const runs = []; let fails = 0, swaps = 0;
        for (let s = 1; s <= N; s++) { const r = m.solveLevel(i, { seed: s * 7919 + i }); if (!r.win) fails++; runs.push(r.shots); swaps += r.swaps; }
        runs.sort((a, b) => a - b);
        const g = m.bubbleSim.parseLevel(def);
        out.push({ i, syms: m.bubbleSim.present(g).length, pen: m.bubbleSim.penguinsLeft(g), min: runs[0], med: runs[Math.floor(N / 2)], p75: runs[Math.floor(N * 0.75)], max: runs[N - 1], fails, par: def.par, swaps });
      });
      return out;
    }, SEEDS);
    console.log(`\n求解器（每關 ${SEEDS} 種亂數；發射數＝最少/中位/75%/最多）`);
    console.log("關卡 | 符號 | 企鵝 | 發射數            | par | 失敗");
    for (const r of rows) console.log(`${String(r.i + 1).padStart(4)} | ${r.syms}    | ${r.pen}    | ${r.min}/${r.med}/${r.p75}/${r.max}`.padEnd(38) + `| ${String(r.par).padEnd(3)} | ${r.fails}`);
    ok("求解器：10 關全部救得完（0 次失敗）", rows.length === 10 && rows.every(r => r.fails === 0), rows.filter(r => r.fails).map(r => "L" + (r.i + 1)).join(","));
    ok("求解器：par ≥ 75 百分位（略寬鬆）", rows.every(r => r.par >= r.p75), rows.map(r => `L${r.i + 1}:${r.p75}≤${r.par}`).join(" "));
    ok("關卡：前 3 關兩種符號、1 隻企鵝；第 4 關起三種符號；企鵝 1→3", rows.slice(0, 3).every(r => r.syms === 2 && r.pen === 1) && rows.slice(3).every(r => r.syms === 3) && rows[9].pen === 3 && rows.every((r, k) => k === 0 || r.pen >= rows[k - 1].pen - 0));
    await ctx.close();
  }

  // ===== ② 第 1 關：示範、手指瞄準、預測＝實際、消除、救出、onWin =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "clean=1&seed=5&lv=1");
    await sleep(1300);
    let s = await S(p);
    ok("示範：第 1 關開場就出金色示範線＋手指", s.demo === "line" && await p.evaluate(() => document.querySelector(".bb-finger.on") && document.querySelector(".bb-gold") && document.querySelector(".bb-ring.on") ? true : false));
    await shot(p, "land_L1_demo");
    // 手指瞄準：點一下、拖一下，放開不會發射
    const [x0, y0] = await pointAt(p, 3, 8), [x1, y1] = await pointAt(p, 12, 6);
    const aim0 = s.aim;
    await p.mouse.move(x0, y0); await p.mouse.down(); await sleep(50);
    s = await S(p); const aimA = s.aim;
    ok("瞄準：小孩一開始瞄準示範就收起來", s.demo === "" && !(await p.evaluate(() => !!document.querySelector(".bb-finger.on"))));
    await p.mouse.move(x1, y1, { steps: 5 }); await sleep(50);
    const aimB = (await S(p)).aim;
    await p.mouse.up(); await sleep(100);
    s = await S(p);
    ok("瞄準：點左邊轉向左、拖到右邊轉向右、放開不發射", aimA > Math.PI / 2 && aimB < Math.PI / 2 && aimA !== aim0 && s.shots === 0 && !s.busy, `aim ${(aimA * 57.3).toFixed(0)}° → ${(aimB * 57.3).toFixed(0)}°`);
    // 點到水平線以下 → 角度夾在 10° 以上
    const [x2, y2] = await pointAt(p, 15.5, 24.9);
    await p.mouse.click(x2, y2); await sleep(50);
    const aimLow = (await S(p)).aim;
    ok("瞄準：限制在水平線上方 10° 以上", Math.abs(aimLow - 10 * Math.PI / 180) < 1e-6, (aimLow * 57.3).toFixed(1) + "°");
    // 4 秒沒動作 → 示範又出來
    await sleep(4400);
    ok("示範：4 秒沒動作又出現", (await S(p)).demo === "line");
    // 最好的一發：預測落點＝實際落點
    const r = await playBest(p);
    ok("發射：fire() 回傳的落點＝瞄準線預測", r.fired && r.pred && r.fired[0] === r.pred[0] && r.fired[1] === r.pred[1], JSON.stringify(r.pred));
    await p.waitForFunction(() => window.__bb.game.state().last, null, { timeout: 5000, polling: 20 });
    await sleep(260);
    await shot(p, "land_L1_pop");
    s = await S(p);
    ok("發射：實際黏住的格子＝預測、同符號 ≥3 消除、旁邊企鵝救出", s.last.cell[0] === r.pred[0] && s.last.cell[1] === r.pred[1] && s.last.popped >= 3 && s.last.rescued === 1 && s.last.near === 1, JSON.stringify(s.last));
    await p.waitForFunction(() => document.querySelector(".bb-banner"), null, { timeout: 8000, polling: 30 });
    await sleep(450);
    await shot(p, "land_L1_win");
    await p.waitForFunction(() => window.__bb.calls.win.length > 0, null, { timeout: 8000 });
    await sleep(1200);
    const wins = await p.evaluate(() => window.__bb.calls.win);
    ok("過關：onWin 只呼叫一次、參數正確", wins.length === 1 && wins[0].level === 0 && wins[0].shots === 1 && wins[0].par === 2 && wins[0].stars === 3 && wins[0].rescued === 1, JSON.stringify(wins));
    ok("音效：有破泡泡、救出、過關聲", await p.evaluate(() => ["pop", "sticker", "win"].every(n => window.__bb.calls.play.includes(n))));
    ok("語音：開場唸目前這顆符號", await p.evaluate(() => window.__bb.calls.say[0] === "ㄅ"), JSON.stringify(await p.evaluate(() => window.__bb.calls.say.slice(0, 3))));

    // ===== 第 2 關：打掉上面那對 → 下面整串掉下來（企鵝掉下來＝救出）=====
    await p.evaluate(() => window.__bb.game.start(1)); await sleep(200);
    const r2 = await playBest(p);
    await waitIdle(p);
    s = await S(p);
    ok("掉落：打掉支撐點，下面的泡泡和企鵝一起掉（掉下來＝救出）", s.last && s.last.dropped >= 1 && s.last.fall === 1 && s.last.cell[0] === r2.pred[0] && s.last.cell[1] === r2.pred[1], JSON.stringify(s.last));

    // ===== 第 3 關：開場拿到沒用的ㄇ → 示範是「點泡泡換一顆」=====
    await p.evaluate(() => { window.__bb.calls.say.length = 0; window.__bb.game.start(2); }); await sleep(1300);
    s = await S(p);
    ok("示範：第 3 關開場提示換一顆（手指在目前這顆）", s.demo === "swap" && s.cur === "ㄇ" && await p.evaluate(() => document.querySelector(".bb-cur.bb-hint") ? true : false));
    await shot(p, "land_L3_swapdemo");
    const [cx, cy] = await pointAt(p, 8, (await p.evaluate(() => window.__bb.game.debug.geom.SHOOT_Y)));
    await p.mouse.click(cx, cy); await sleep(150);
    s = await S(p);
    ok("換一顆：點目前這顆＝跟下一顆交換、唸出新符號、不算發射、示範改成瞄準線", s.cur === "ㄅ" && s.next === "ㄇ" && s.shots === 0 && s.demo === "line" && await p.evaluate(() => window.__bb.calls.say.slice(-1)[0] === "ㄅ"));

    // ===== ④ 暫停：不接受瞄準、發射、交換 =====
    await p.evaluate(() => window.__bb.setPaused(true));
    const before = await S(p);
    const [x3, y3] = await pointAt(p, 2, 5);
    await p.mouse.click(x3, y3); await sleep(50);
    const pr = await p.evaluate(() => ({ fire: window.__bb.game.debug.fire(), swap: window.__bb.game.debug.swap() }));
    const after = await S(p);
    ok("暫停：點場地不轉向、按發射／交換都沒反應", pr.fire === false && pr.swap === false && after.aim === before.aim && after.shots === before.shots && after.cur === before.cur);
    // 暫停中按發射鈕（真的點）
    const fb = await p.evaluate(() => { const r = document.querySelector(".bb-fire").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.mouse.click(fb[0], fb[1]); await sleep(100);
    ok("暫停：點大發射鈕也不發射", (await S(p)).shots === before.shots);
    await p.evaluate(() => window.__bb.setPaused(false));
    await p.mouse.click(fb[0], fb[1]); await sleep(60);
    ok("繼續：點大發射鈕會發射", (await S(p)).shots === before.shots + 1);
    await waitIdle(p);

    // ===== ⑤ onFull：盤面塞滿到底線，再射一發 =====
    await p.evaluate(() => {
      const rows = []; for (let r = 0; r < 12; r++) { let t = ""; const n = r & 1 ? 7 : 8; for (let c = 0; c < n; c++) { const f = (((c - Math.floor(r / 2) - r) % 3) + 3) % 3; t += r === 0 && c === 0 ? "A" : "123"[f]; } rows.push(t); }
      window.__bb.calls.full.length = 0; window.__bb.game.debug.load({ par: 3, rows });
    });
    await sleep(100);
    const fullShot = await p.evaluate(() => { const g = window.__bb.game; g.debug.setQueue("ㄆ", "ㄆ"); g.debug.aim(Math.PI / 2); return { pred: g.debug.predict().cell, fired: g.debug.fire() }; });
    await waitIdle(p); await sleep(150);
    s = await S(p);
    const fullCalls = await p.evaluate(() => window.__bb.calls.full);
    ok("onFull：泡泡落到底線就呼叫、場地變暗、不再接受發射", fullShot.pred[0] === 12 && fullCalls.length === 1 && fullCalls[0].level === 0 && s.full && await p.evaluate(() => document.querySelector(".bb-wrap.bb-isfull") && window.__bb.game.debug.fire() === false), JSON.stringify({ pred: fullShot.pred, fullCalls }));
    await shot(p, "land_full");

    // ===== ⑥ stop() 清乾淨；飛行中 stop 不殘留；重開不報錯 =====
    await p.evaluate(() => window.__bb.game.stop());
    ok("stop()：root 清空、拿掉 class", await p.evaluate(() => document.getElementById("bbRoot").children.length === 0 && !document.getElementById("bbRoot").classList.contains("bb-root") && window.__bb.game.state() === null));
    await p.evaluate(() => { window.__bb.calls.win.length = 0; const g = window.__bb.game; g.start(0); const b = g.debug.bestShot(); g.debug.aim(b.angle); g.debug.fire(); });
    await sleep(150);
    await p.evaluate(() => window.__bb.game.stop());
    await sleep(2500);
    ok("stop()：飛行中離開，之後的計時器全部作廢（沒有 onWin、沒有殘留 DOM）", await p.evaluate(() => window.__bb.calls.win.length === 0 && document.getElementById("bbRoot").children.length === 0));
    await p.evaluate(() => window.__bb.game.start(4)); await sleep(200);
    s = await S(p);
    ok("stop() 後重新 start 正常", s && s.level === 4 && s.shots === 0 && await p.evaluate(() => document.querySelectorAll("#bbRoot .bb-wrap").length === 1));
    ok("第 1 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑦ 10 關用介面實際打完（計時器快 6 倍）：每發預測＝實際、onWin 參數 =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "clean=1&fast=6&seed=11");
    const table = [];
    for (let i = 0; i < 10; i++) {
      await p.evaluate(i => { window.__bb.calls.win.length = 0; window.__bb.game.start(i); }, i);
      await sleep(80);
      let mism = 0, n = 0;
      while (n < 40) {
        const s0 = await S(p); if (s0.won || s0.full) break;
        const r = await playBest(p); n++;
        await waitIdle(p);
        const s1 = await S(p);
        if (!s1.last || s1.last.cell[0] !== r.pred[0] || s1.last.cell[1] !== r.pred[1]) mism++;
      }
      await p.waitForFunction(() => window.__bb.calls.win.length > 0 || window.__bb.game.state().full, null, { timeout: 8000 }).catch(() => {});
      const w = await p.evaluate(() => window.__bb.calls.win[0] || null), s = await S(p);
      const starsOk = w && w.stars === (w.shots <= w.par ? 3 : w.shots <= w.par + 3 ? 2 : 1);
      table.push({ lv: i + 1, shots: w && w.shots, par: w && w.par, stars: w && w.stars, rescued: w && w.rescued, need: s.need, mism, ok: !!(w && w.level === i && w.rescued === s.need && starsOk && mism === 0) });
    }
    console.log("\n介面實打（貪婪一步、不前瞻）：" + table.map(t => `L${t.lv}:${t.shots}發${"★".repeat(t.stars || 0)}`).join(" "));
    ok("介面實打：10 關都過關、onWin 參數正確、星星照 par 算、每一發落點都＝預測", table.every(t => t.ok), JSON.stringify(table.filter(t => !t.ok)));
    ok("第 2 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑧ 版面：四種 iPad 尺寸 × 第 1/5/10 關 =====
  for (const [w, h] of [[1180, 820], [1024, 768], [820, 1180], [768, 1024]]) {
    const { ctx, p, errs } = await open(browser, w, h, "clean=1&seed=2");
    for (const lv of [0, 4, 9]) {
      await p.evaluate(lv => window.__bb.game.start(lv), lv); await sleep(120);
      const m = await p.evaluate(() => {
        const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const q = s => document.querySelector(s);
        const f = R(q(".bb-field")), goal = R(q(".bb-goal")), fire = R(q(".bb-fire")), bub = R(q(".bb-layer .bb-b"));
        const btns = ["homeBtn", "musicBtn", "settingsBtn"].map(id => R(document.getElementById(id)));
        const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
        const inView = a => a.l >= -1 && a.t >= -1 && a.r <= innerWidth + 1 && a.b <= innerHeight + 1;
        // 場地外框（box-shadow 0.32u）也要在畫面內
        const u = f.w / 16, fo = { l: f.l - 0.32 * u, t: f.t - 0.32 * u, r: f.r + 0.32 * u, b: f.b + 0.32 * u };
        return { inView: [fo, goal, fire].every(inView), overlap: hit(f, goal) || hit(f, fire) || hit(goal, fire), btnHit: btns.some(b => hit(b, fo) || hit(b, goal) || hit(b, fire)),
          fireW: fire.w / Math.min(innerWidth, innerHeight) * 100, bubble: bub.w, scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
          aria: q(".bb-fire").getAttribute("aria-label") };
      });
      ok(`版面 ${w}×${h} 第 ${lv + 1} 關：場地／目標／發射鈕都在畫面內、互不重疊、不擋主程式圓鈕、不捲動`, m.inView && !m.overlap && !m.btnHit && !m.scroll, JSON.stringify(m));
      ok(`版面 ${w}×${h} 第 ${lv + 1} 關：發射鈕 ≥18vmin、有 aria-label、泡泡夠大`, m.fireW >= 18 && m.aria === "發射" && m.bubble >= 50, `發射鈕 ${m.fireW.toFixed(1)}vmin、泡泡直徑 ${m.bubble.toFixed(0)}px`);
    }
    // relayout：轉向後重算
    if (w === 1180) {
      const f0 = await p.evaluate(() => document.querySelector(".bb-field").getBoundingClientRect().width);
      await p.setViewportSize({ width: 820, height: 1180 }); await p.evaluate(() => window.__bb.game.relayout()); await sleep(100);
      const m2 = await p.evaluate(() => ({ fw: document.querySelector(".bb-field").getBoundingClientRect().width, port: !!document.querySelector(".bb-wrap.bb-port") }));
      ok("relayout()：橫轉直重算尺寸、換直式排法", m2.port && Math.abs(m2.fw - f0) > 5, JSON.stringify({ f0, ...m2 }));
    }
    ok(`版面 ${w}×${h}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑨ 國字都有注音（開主程式的自動注音，字典沒收的字＝0、遊戲裡沒有裸國字）=====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "clean=1&ann=1&seed=4");
    await p.waitForFunction(() => window.__bb.ann, null, { timeout: 8000 });
    const res = [];
    for (const lv of [0, 9]) {
      await p.evaluate(lv => window.__bb.game.start(lv), lv); await sleep(150);
      const b = await playBest(p); await waitIdle(p);
      if (lv === 0) await p.waitForFunction(() => document.querySelector(".bb-banner"), null, { timeout: 8000 });
      await sleep(300);
      res.push(await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.getElementById("bbRoot"), NodeFilter.SHOW_TEXT);
        while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (/[㐀-鿿]/.test(n.data) && !(e && e.closest(".ac[data-z]"))) out.push(n.data.trim()); } return out; }));
    }
    const missing = await p.evaluate(() => [...window.__bb.ann.missing]);
    ok("注音：遊戲畫面的國字全部自帶注音（不靠字典）", res.every(x => x.length === 0) && missing.length === 0, JSON.stringify({ bare: res, missing }));
    ok("第 4 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑩ 截圖：橫式＋直式 × 第 1/5/10 關、瞄準線（含反彈）、示範、消除中、過關一刻 =====
  for (const [w, h, tag] of [[1180, 820, "land"], [820, 1180, "port"]]) {
    const { ctx, p, errs } = await open(browser, w, h, "clean=1&seed=7");
    await p.evaluate(() => window.__bb.game.start(0)); await sleep(1300);
    await shot(p, `${tag}_1_L1_demo`);
    await p.evaluate(() => window.__bb.game.start(4)); await sleep(300);
    await shot(p, `${tag}_2_L5`);
    // 找一個在場地中段撞牆反彈、反彈後還飛一段（> 4 單位）的角度
    const bounce = await p.evaluate(() => { const g = window.__bb.game; let best = null;
      for (let d = 100; d <= 160; d++) { g.debug.aim(d * Math.PI / 180); const pr = g.debug.predict(), q = pr.pts;
        if (q.length >= 3 && q[1][1] > 8 && q[1][1] < 18 && Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]) > 4) { best = d; break; } }
      g.debug.aim((best || 120) * Math.PI / 180); return Object.assign(g.debug.predict(), { deg: best }); });
    await sleep(150);
    ok(`截圖 ${tag}：瞄準線含牆壁反彈`, bounce.pts.length >= 3, `${bounce.deg}°，轉折點 ${bounce.pts.length - 2} 個，落點 ${bounce.cell}`);
    await shot(p, `${tag}_3_L5_aim_bounce`);
    await p.evaluate(() => window.__bb.game.start(9)); await sleep(300);
    await shot(p, `${tag}_4_L10`);
    // 消除中：第 7 關拿ㄆ打支撐點（一發掉一大串＋企鵝飛出來）
    await p.evaluate(() => { const g = window.__bb.game; g.start(6); g.debug.setQueue("ㄆ", "ㄅ"); });
    await sleep(200);
    const k = await playBest(p);
    await p.waitForFunction(() => window.__bb.game.state().last, null, { timeout: 5000, polling: 20 });
    await sleep(380);
    await shot(p, `${tag}_5_L7_pop`);
    await sleep(520);
    await shot(p, `${tag}_5b_L7_drop_rescue`);
    const s7 = await S(p);
    ok(`截圖 ${tag}：第 7 關打支撐點一發救出 2 隻、掉一大串`, s7.last.rescued === 2 && s7.last.dropped >= 10, JSON.stringify(s7.last));
    await p.waitForFunction(() => document.querySelector(".bb-banner"), null, { timeout: 8000, polling: 30 });
    await sleep(500);
    await shot(p, `${tag}_6_L7_win`);
    ok(`截圖 ${tag}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  await browser.close();
  ok("全程 0 個 console error／頁面錯誤", allErrs.length === 0, allErrs.slice(0, 5).join(" | "));
  console.log("\n" + results.join("\n"));
  const fails = results.filter(r => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fails}/${results.length} PASS　截圖：${SHOTS}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
