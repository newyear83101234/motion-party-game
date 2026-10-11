// Freesound CC0 search via the automation Chrome (CDP). Opens ONE new tab, closes it at the end.
// usage: node fs_search.js <queries.json> <out.json>     queries.json = { "seagull": ["seagull call", ...], ... }
// Only reads search result pages (license filter = Creative Commons 0). Per-sound license is re-verified by fs_fetch.js.
const path = require("path");
const fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
(async () => {
  const queries = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const out = {};
  const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const p = await b.contexts()[0].newPage();
  try {
    for (const [target, qs] of Object.entries(queries)) {
      out[target] = [];
      for (const q of qs) {
        const url = "https://freesound.org/search/?q=" + encodeURIComponent(q) + "&f=license%3A%22Creative+Commons+0%22&s=Downloads+(most+first)";
        try {
          await p.goto(url, { waitUntil: "domcontentloaded" });
          await p.waitForSelector(".bw-search__result", { timeout: 8000 }).catch(() => {});
          const rs = await p.evaluate(() => [...document.querySelectorAll(".bw-search__result .bw-player")].map(e => ({
            id: e.dataset.soundId, user: e.dataset.username, title: e.dataset.title, dur: +(+e.dataset.duration).toFixed(2),
            dl: +e.dataset.numDownloads, mp3: e.dataset.mp3
          })));
          for (const r of rs) if (!out[target].some(x => x.id === r.id)) out[target].push(Object.assign(r, { q }));
        } catch (e) { console.error("fail", q, e.message); }
        await p.waitForTimeout(700);
      }
    }
  } finally { await p.close(); await b.close(); }
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
  for (const [t, a] of Object.entries(out)) console.log(t, a.length);
})();
