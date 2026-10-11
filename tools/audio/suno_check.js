// Read-only: look at Suno account plan via the automation Chrome (CDP 9222). Opens one new tab, closes it afterwards.
const path = require("path");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  try {
    for (const u of ["https://suno.com/create", "https://suno.com/account"]) {
      await p.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
      await p.waitForTimeout(6000);
      const txt = await p.evaluate(() => document.body.innerText);
      const i1 = txt.indexOf("Credits Remaining"); const lines = [txt.slice(Math.max(0,i1-200), i1+200)];
      console.log("==", u, "->", p.url());
      console.log(lines.join("\n"));
    }
  } finally {
    await p.close().catch(() => {});
    await b.close().catch(() => {});
  }
})().catch(e => { console.log("ERR", e.message); process.exit(1); });
