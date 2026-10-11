// Create 2 instrumental island candidates on Suno v6 (one Create click => 2 clips). Prints new song ids. Closes its tab.
const path = require("path");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const STYLE = "instrumental, children's video game music, bright cheerful tropical island, ukulele strums, marimba melody, glockenspiel sparkles, light shaker, soft bass, 105 BPM, gentle steady groove, loopable, no vocals, no choir";
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const p = await b.contexts()[0].newPage();
  try {
    await p.setViewportSize({ width: 1400, height: 1000 });
    await p.goto("https://suno.com/create", { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(7000);
    const ids = async () => p.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="/song/"]')].map(a => a.getAttribute("href")))]);
    const before = await ids();
    const ta = p.locator('textarea').nth(1);
    await ta.click();
    await ta.fill(STYLE);
    await p.waitForTimeout(500);
    console.log("model btn:", await p.locator("button", { hasText: /^v6/ }).first().innerText());
    const cb = p.locator('button').filter({ hasText: /^s*Creates*$/ }).last(); console.log('create enabled:', await cb.isEnabled()); await cb.click();
    for (let i = 0; i < 40; i++) {
      await p.waitForTimeout(5000);
      const now = await ids();
      const fresh = now.filter(x => !before.includes(x));
      if (fresh.length >= 2) { console.log("NEW", JSON.stringify(fresh)); break; }
      if (i === 39) console.log("timeout; fresh=", JSON.stringify(fresh));
    }
    await p.screenshot({ path: path.join(__dirname, "candidates", "suno_after_create.png") });
  } finally {
    await p.close().catch(() => {});
    await b.close().catch(() => {});
  }
})().catch(e => { console.log("ERR", e.message); process.exit(1); });
