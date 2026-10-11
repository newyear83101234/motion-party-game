// Read-only probe of suno.com/create UI (no clicks that create). Prints controls + saves screenshot.
const path = require("path");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const p = await b.contexts()[0].newPage();
  try {
    await p.setViewportSize({ width: 1400, height: 1000 });
    await p.goto("https://suno.com/create", { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(7000);
    const info = await p.evaluate(() => {
      const q = s => [...document.querySelectorAll(s)];
      return {
        textareas: q("textarea").map(e => ({ ph: e.placeholder, v: e.value.slice(0, 40) })),
        buttons: q("button").map(e => (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 40)).filter(Boolean).slice(0, 80),
      };
    });
    console.log(JSON.stringify(info, null, 1));
    await p.screenshot({ path: path.join(__dirname, "candidates", "suno_create.png") });
  } finally {
    await p.close().catch(() => {});
    await b.close().catch(() => {});
  }
})().catch(e => { console.log("ERR", e.message); process.exit(1); });
