// 泡泡救援灣 第 2、3 區截圖：node tools/zy-test/bubble-shots.js
// 遊戲畫面（試玩頁）＋選關畫面（主程式、帶存檔），橫 1024×768、直 768×1024。存到 BB_SHOTS（預設 %TEMP%\zy-bubble-shots）
const { launch, openGame } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const BASE = process.env.ZY_BASE || "http://127.0.0.1:8765";
const OUT = process.env.BB_SHOTS || path.join(os.tmpdir(), "zy-bubble-shots");
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIZES = [[1024, 768, "land"], [768, 1024, "port"]];
(async () => {
  const browser = await launch();
  // 遊戲畫面
  for (const [w, h, tag] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
    p.on("pageerror", e => console.log("PAGEERR", e.message));
    await p.goto(BASE + "/tools/zy-test/bubble-lab.html?mute=1&clean=1&seed=7");
    await p.waitForFunction(() => window.__bb && window.__bb.ready, null, { timeout: 15000 });
    for (const [lv, name] of [[10, "z2_L11"], [14, "z2_L15"], [19, "z2_L20"], [20, "z3_L21"], [24, "z3_L25"], [29, "z3_L30"]]) {
      await p.evaluate(lv => window.__bb.game.start(lv), lv); await sleep(lv === 10 || lv === 20 ? 1400 : 400);
      await p.screenshot({ path: path.join(OUT, `game_${tag}_${name}.png`) });
    }
    await ctx.close();
  }
  // 選關畫面
  for (const [w, h, tag] of SIZES) {
    for (const [save, name, click] of [[{ lv: 13, stars: { 0: 3, 1: 3, 2: 2, 3: 3, 4: 2, 5: 3, 6: 2, 7: 3, 8: 2, 9: 3, 10: 3, 11: 2, 12: 3 } }, "z2", null],
                                      [{ lv: 24, stars: { 0: 3, 5: 2, 9: 3, 10: 3, 14: 2, 19: 3, 20: 3, 21: 3, 22: 2, 23: 3 } }, "z3", null],
                                      [{ lv: 5, stars: { 0: 3, 1: 3, 2: 2, 3: 3, 4: 3 } }, "locked", 2]]) {
      const { ctx, p } = await openGame(browser, { stickers: 40, query: "debug", w, h });
      await p.evaluate(sv => localStorage.setItem("zy1_bubble", JSON.stringify(sv)), save);
      await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
      await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(500);
      await p.evaluate(() => document.querySelector(".mode-card[data-mode=bubble]").click());
      await p.waitForFunction(() => !document.getElementById("bubblePick").classList.contains("hidden"), null, { timeout: 8000 }); await sleep(500);
      if (click != null) { await p.evaluate(i => document.querySelectorAll("#bubbleZones .bb-ztab")[i].click(), click); await sleep(150); }
      await p.screenshot({ path: path.join(OUT, `pick_${tag}_${name}.png`) });
      await ctx.close();
    }
  }
  await browser.close();
  console.log("done", OUT, fs.readdirSync(OUT).length);
})().catch(e => { console.error(e); process.exit(2); });
