// 日夜時鐘接進遊戲（阿葉 10-11 選 B：真實 30 分鐘＝一天）：node tools/zy-test/clock-game.js
// 用 ?clockspeed=60（30 秒過一天）看：時段照 白天→黃昏→晚上→清晨 走、3D 光線跟著變、body.night 只在晚上、貓頭鷹換時段會說話、
// 遊戲中換時段回小島才說、?clock=night／?night=1 固定不走
const { launch, openGame, enterMode } = require("./lib");
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await launch(); const out = []; let fail = 0;
  const ok = (n, c, d = "") => { out.push(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); if (!c) fail++; };
  {
    const { ctx, p, errs } = await openGame(b, { stickers: 40, stars: 35, query: "debug&novoice&weather=sunny&clockspeed=60" });
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready && window.__zy.weatherFx, null, { timeout: 60000 });
    await p.evaluate(() => window.__zy.clock.set("day"));
    const seen = [], lines = new Set(); let maxNight = 0, maxDusk = 0, nightClass = false, dayNightClass = false;
    const PH = ["太陽要下山囉！", "天空變成橘色了！", "天黑了，路燈亮起來了！", "月亮出來了，好漂亮！", "天快亮了，早安！", "太陽公公要起床囉！"];
    for (let i = 0; i < 70; i++) {
      const s = await p.evaluate(() => { const c = window.__zy.clock.get(), L = window.__zy.weatherFx.getLight(); return { ph: c.phase, n: L.night, d: L.dusk + L.dawn, night: document.body.classList.contains("night"), g: document.getElementById("guideText").textContent }; });
      if (seen[seen.length - 1] !== s.ph) seen.push(s.ph);
      maxNight = Math.max(maxNight, s.n); maxDusk = Math.max(maxDusk, s.d);
      if (s.night && s.ph === "night") nightClass = true; if (s.night && s.ph === "day") dayNightClass = true;
      if (PH.includes(s.g)) lines.add(s.g);
      await sleep(500);
    }
    ok("時段照順序走", seen.join(">").includes("day>dusk>night>dawn>day"), seen.join(">"));
    ok("3D 小島光線有變到晚上", maxNight > 0.9, maxNight.toFixed(2));
    ok("黃昏／清晨有暖色", maxDusk > 0.5, maxDusk.toFixed(2));
    ok("晚上 body.night、白天沒有", nightClass && !dayNightClass);
    ok("貓頭鷹換時段有說話", lines.size >= 2, [...lines].join("／"));
    ok("無錯誤（加速）", !errs.length, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  {
    // 遊戲中換時段：不說；回小島才說（正常速度：設在黃昏前約 1 秒，進遊戲後天黑下來）
    const { ctx, p, errs } = await openGame(b, { stickers: 40, stars: 35, query: "debug&novoice&weather=sunny" });
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready && window.__zy.weatherFx, null, { timeout: 60000 });
    await enterMode(p, "fish"); await sleep(400);
    await p.evaluate(() => window.__zy.clock.set(1020 / 1800 - 1 / 1800)); await sleep(2600);
    const inGame = await p.evaluate(() => ({ t: document.getElementById("guideText").textContent, ph: window.__zy.clock.get().phase }));
    const PH = ["太陽要下山囉！", "天空變成橘色了！"];
    await p.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0; document.getElementById("homeBtn").click(); document.getElementById("confirmYes")?.click(); });
    await p.waitForFunction(() => !document.getElementById("menu").classList.contains("hidden"), null, { timeout: 10000 }); await sleep(400);
    const back = await p.evaluate(() => { Math.random = window.__rnd; return document.getElementById("guideText").textContent; });
    ok("遊戲中進黃昏不打斷、回小島才說黃昏", inGame.ph === "dusk" && !PH.includes(inGame.t) && PH.includes(back), `${inGame.ph}「${inGame.t}」→「${back}」`);
    ok("無錯誤（遊戲中換時段）", !errs.length, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await openGame(b, { stickers: 40, query: "debug&novoice&weather=sunny&clock=night" });
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready && window.__zy.weatherFx, null, { timeout: 60000 });
    const a = await p.evaluate(() => window.__zy.clock.get().frac); await sleep(3000);
    const s = await p.evaluate(() => ({ f: window.__zy.clock.get().frac, n: window.__zy.weatherFx.getLight().night, c: document.body.classList.contains("night") }));
    ok("?clock=night 固定不走、是晚上", Math.abs(s.f - a) < 1e-9 && s.n > 0.9 && s.c, JSON.stringify(s));
    ok("無錯誤（固定晚上）", !errs.length, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  console.log(out.join("\n")); console.log(fail ? `${fail} FAILED` : `ALL PASS (${out.length})`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
