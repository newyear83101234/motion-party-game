// 泡泡救援灣接進主程式的測試：node tools/zy-test/bubble-game.js
// 驗：從選單（3D 小島）進得去、第 1 關一發過關 → 結算「救出 N 隻小企鵝」＋「下一關」、存檔 lv 前進、下一關接著玩、
//     暫停時不能發射、回選單再點＝先選關（過過的有星星、沒到的鎖著）、歸仁區按鈕／小島浮標數、沒有錯誤
const { launch, openGame, enterMode } = require("./lib");
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vis = (p, id) => p.evaluate(id => !document.getElementById(id).classList.contains("hidden"), id);
// 照引擎算的最好一發打（需要換球就先換）
async function bestFire(p) {
  return p.evaluate(() => { const g = window.__zy.bubble, b = g.debug.bestShot(); if (!b) return null; if (b.swap) g.debug.swap(); g.debug.aim(b.angle); return { fired: g.debug.fire(), b }; });
}
(async () => {
  const browser = await launch(); const allErrs = [];
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug" });
    ok("小島上有 10 個遊戲浮標（多了泡泡）", (await p.evaluate(() => document.querySelectorAll(".hub-tag:not(.civic)").length)) === 10);
    ok("🏙️ 歸仁區按鈕在選單上", await vis(p, "townBtn"));
    await enterMode(p, "bubble");
    const ready = await p.waitForFunction(() => window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === 0, null, { timeout: 15000 }).then(() => true, () => false);
    ok("從選單進得去、是第 1 關", ready && await vis(p, "bubble"));
    ok("泡泡畫面：沒有進度點、有「再聽」", await p.evaluate(() => document.getElementById("progress").classList.contains("hidden") && !document.getElementById("speakBtn").classList.contains("hidden")));
    // 暫停中不能發射
    await sleep(600);
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300);
    const pf = await p.evaluate(() => { const g = window.__zy.bubble, b = g.debug.bestShot(); g.debug.aim(b.angle); return g.debug.fire(); });
    ok("暫停中按發射沒反應", pf === false, String(pf));
    await p.evaluate(() => document.getElementById("confirmNo").click()); await sleep(300);
    // 小孩常按住發射口的泡泡往上拉：要算瞄準，不能變成換球（里維 10-11）
    const cc = await p.evaluate(() => { const r = document.querySelector("#bubble .bb-cur").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const c0 = await p.evaluate(() => window.__zy.bubble.state().cur);
    await p.mouse.move(cc[0], cc[1]); await p.mouse.down(); await p.mouse.move(cc[0] - 70, cc[1] - 140, { steps: 6 }); await p.mouse.up(); await sleep(250);
    const c1 = await p.evaluate(() => window.__zy.bubble.state().cur);
    ok("按住發射口的泡泡往上拖＝瞄準（不會換球）", c0 === c1, `${c0} → ${c1}`);
    // 第 1 關：最好的一發
    let shots = 0; while (shots < 6 && !(await vis(p, "result"))) { const r = await bestFire(p); shots++; await sleep(2500); if (!r) break; }
    const res = await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 8000 }).then(() => true, () => false);
    const rt = await p.evaluate(() => ({ text: document.getElementById("resultText").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), stars: document.querySelectorAll("#resultStars .star.on").length, again: document.getElementById("againBtn").textContent, save: JSON.parse(localStorage.getItem("zy1_bubble") || "null") }));
    ok("第 1 關過關 → 結算畫面", res, `發射 ${shots} 次`);
    ok("結算：救出小企鵝、有星星、按鈕是「下一關」", /救出1隻小企鵝/.test(rt.text) && rt.stars >= 1 && rt.again.includes("下一關"), JSON.stringify(rt));
    ok("存檔：下一關＝第 2 關、第 1 關有星星", rt.save && rt.save.lv === 1 && rt.save.stars["0"] >= 1, JSON.stringify(rt.save));
    await sleep(3500);                                  // 等結算演完（按鈕淡入）
    await p.evaluate(() => document.getElementById("againBtn").click());
    const l2 = await p.waitForFunction(() => window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === 1 && !document.getElementById("bubble").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
    ok("按「下一關」→ 第 2 關", l2);
    // 回選單再點泡泡＝先選關
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(600);
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=bubble]").click()); await sleep(400);
    const pick = await p.evaluate(() => ({ open: !document.getElementById("bubblePick").classList.contains("hidden"), n: document.querySelectorAll("#bubbleLevels .bb-lv").length,
      openLv: [...document.querySelectorAll("#bubbleLevels .bb-lv:not(.locked)")].length, next: document.querySelector("#bubbleLevels .bb-lv.next .n")?.textContent, star1: document.querySelector("#bubbleLevels .bb-lv .s")?.textContent }));
    ok("再點泡泡：先選關（10 關、開了 2 關、下一關＝2、第 1 關有星）", pick.open && pick.n === 10 && pick.openLv === 2 && pick.next === "2" && pick.star1.includes("⭐"), JSON.stringify(pick));
    await p.evaluate(() => document.querySelectorAll("#bubbleLevels .bb-lv")[0].click());
    const l1 = await p.waitForFunction(() => window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === 0 && !document.getElementById("bubble").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
    ok("選第 1 關可以重玩", l1);
    // 鎖著：貼紙不夠的新存檔
    allErrs.push(...errs); await ctx.close();
  }
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 10, query: "debug" });
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=bubble]").click()); await sleep(500);
    ok("貼紙不夠（10 張）：泡泡進不去", await p.evaluate(() => !document.getElementById("menu").classList.contains("hidden") && document.getElementById("bubble").classList.contains("hidden")));
    ok("歸仁區沒開：按鈕寫「歸仁區 🔒」", (await p.evaluate(() => document.getElementById("townTag").textContent)).includes("🔒"));
    allErrs.push(...errs); await ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r);
  if (allErrs.length) console.log("ERRORS\n" + allErrs.join("\n"));
  const bad = results.filter(r => r.startsWith("FAIL")).length;
  console.log(bad || allErrs.length ? `\n${bad} FAILED / ${results.length}` : `\nALL PASS (${results.length})`);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
