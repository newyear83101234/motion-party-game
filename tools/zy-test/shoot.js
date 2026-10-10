// 截圖：node tools/zy-test/shoot.js <輸出資料夾> [模式清單,逗號分隔]
// 橫 1180×820 與直 820×1180 各拍：選單、各模式、翻牌 8/16/24、圖鑑、設定、換人、休息選單、讀取畫面
const path = require("path");
const { launch, openGame, enterMode } = require("./lib");
const OUT = process.argv[2] || "."; const only = (process.argv[3] || "").split(",").filter(Boolean);
const MODES = ["fish", "order", "build", "hunt", "tone", "whack", "frog"];
(async () => {
  const browser = await launch(); const allErrs = [];
  for (const [W, H, tag] of [[1180, 820, "L"], [820, 1180, "P"]]) {
    const { ctx, p, errs } = await openGame(browser, { w: W, h: H, stickers: 40, stars: 5 });
    const shot = n => p.screenshot({ path: path.join(OUT, `${tag}-${n}.jpg`), type: "jpeg", quality: 72 });
    const want = n => !only.length || only.includes(n);
    if (want("menu")) await shot("menu");
    for (const m of MODES) {
      if (!want(m)) continue;
      const exists = await p.evaluate(mm => !!document.querySelector(`.mode-card[data-mode=${mm}]`), m); if (!exists) continue;
      await enterMode(p, m); await p.waitForTimeout(m === "whack" ? 2500 : 300); await shot(m);
    }
    if (want("match")) for (const n of [8, 16, 24]) {
      await enterMode(p, "match", n); await p.evaluate(() => document.querySelectorAll(".card").forEach(c => c.classList.add("up"))); await p.waitForTimeout(600); await shot("match" + n);
    }
    if (want("confirm")) { await enterMode(p, "fish"); await p.evaluate(() => document.getElementById("homeBtn").click()); await p.waitForTimeout(300); await shot("confirm"); await p.evaluate(() => document.getElementById("confirmYes").click()); await p.waitForTimeout(400); }
    if (want("album")) { await p.evaluate(() => document.getElementById("albumBtn").click()); await p.waitForTimeout(700); await shot("album"); await p.evaluate(() => document.getElementById("albumBack").click()); await p.waitForTimeout(400); }
    if (want("settings")) { await p.evaluate(() => document.getElementById("settingsBtn").click()); await p.waitForTimeout(300); await shot("settings"); await p.evaluate(() => document.getElementById("settingsClose").click()); }
    if (want("players")) { await p.evaluate(() => document.getElementById("playerBtn").click()); await p.waitForTimeout(300); await shot("players"); await p.evaluate(() => document.getElementById("players").classList.add("hidden")); }
    if (want("matchpick")) { await p.evaluate(() => document.querySelector(".mode-card[data-mode=match]").click()); await p.waitForTimeout(300); await shot("matchpick"); await p.evaluate(() => document.getElementById("matchPick").classList.add("hidden")); }
    if (want("loading")) { await p.evaluate(() => document.getElementById("loading").classList.remove("hidden")); await p.waitForTimeout(500); await shot("loading"); await p.evaluate(() => document.getElementById("loading").classList.add("hidden")); }
    allErrs.push(...errs.map(e => tag + " " + e)); await ctx.close();
  }
  await browser.close(); console.log(allErrs.length ? allErrs.join("\n") : "no errors");
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
