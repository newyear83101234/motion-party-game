// Download one Suno song as MP3 via song page UI (Download -> MP3 -> Unlock & Download), intercepting the signed amazonaws mp3 URL.
// usage: node suno_download.js <songId> <outfile> [--probe]   (--probe: only list controls, no download => no quota used)
const path = require("path");
const fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const [id, out, flag] = process.argv.slice(2);
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const p = await b.contexts()[0].newPage();
  const mp3s = [];
  p.on("response", r => { const u = r.url(); if (/amazonaws\.com.*\.mp3/i.test(u)) mp3s.push(u); });
  try {
    await p.setViewportSize({ width: 1400, height: 1000 });
    await p.goto("https://suno.com/song/" + id, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(8000);
    const btns = async () => p.evaluate(() => [...document.querySelectorAll("button,[role=menuitem]")].map(e => (e.innerText || e.getAttribute("aria-label") || "").trim().replace(/\n/g, " ").slice(0, 40)).filter(Boolean));
    console.log("BUTTONS", JSON.stringify(await btns()));
    await p.screenshot({ path: path.join(__dirname, "candidates", "suno_song.png") });
    if (flag === "--probe") return;
    // open menu containing Download
    const more = { click: async () => p.mouse.click(791, 317) };
    await more.click({ timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(1000);
    console.log("MENU", JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('[role=menuitem],[role=menu] *')].filter(e => e.children.length === 0).map(e => e.innerText).filter(Boolean)))); await p.screenshot({ path: path.join(__dirname, 'candidates', 'suno_menu.png') });
    await p.getByText("Download", { exact: true }).first().click();
    await p.waitForTimeout(2500);
    console.log("DLG", JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("[role=dialog] *, [role=menu] *")].filter(e => e.children.length === 0).map(e => e.innerText).filter(Boolean))));
    await p.screenshot({ path: path.join(__dirname, "candidates", "suno_dl.png") });
    if (flag !== "--go") return;
    await p.getByText("Unlock & Download").first().click();
    let url = null;
    for (let i = 0; i < 40 && !url; i++) { await p.waitForTimeout(1000); url = mp3s[0]; }
    if (!url) { console.log("NO URL CAPTURED"); await p.screenshot({ path: path.join(__dirname, "candidates", "suno_dl2.png") }); return; }
    const r = await p.request.get(url);
    const buf = await r.body();
    fs.writeFileSync(out, buf);
    console.log("SAVED", out, buf.length);
  } finally {
    await p.close().catch(() => {});
    await b.close().catch(() => {});
  }
})().catch(e => { console.log("ERR", e.message); process.exit(1); });
