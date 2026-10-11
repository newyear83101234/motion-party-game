// Verify CC0 on each Freesound sound page, then download its hq preview mp3. One new tab in the automation Chrome, closed at the end.
// usage: node fs_fetch.js <picks.json> <found1.json> [found2.json ...] -- <outDir>
//   picks.json = { "seagull": ["263786", ...], ... }; found*.json = fs_search.js output (id -> user/title/dur/mp3)
// Writes <outDir>/<target>/<id>.mp3 and <outDir>/meta.json {id:{target,user,title,url,licenseUrl,licenseOk,dur}}. Only licenseOk files are kept.
const path = require("path");
const fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
(async () => {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  const picks = JSON.parse(fs.readFileSync(argv[0], "utf8"));
  const info = {};
  for (const f of argv.slice(1, sep)) for (const arr of Object.values(JSON.parse(fs.readFileSync(f, "utf8")))) for (const r of arr) info[r.id] = r;
  const outDir = argv[sep + 1];
  fs.mkdirSync(outDir, { recursive: true });
  const metaPath = path.join(outDir, "meta.json");
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
  const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const p = await b.contexts()[0].newPage();
  try {
    for (const [target, ids] of Object.entries(picks)) {
      for (const id of ids) {
        const key = target + "/" + id;
        const r = info[id];
        if (!r) { console.log("NOINFO", id); continue; }
        if (meta[key] && fs.existsSync(path.join(outDir, target, id + ".mp3"))) continue;
        const url = `https://freesound.org/people/${r.user}/sounds/${id}/`;
        try {
          await p.goto(url, { waitUntil: "domcontentloaded" });
          await p.waitForTimeout(800);
          const lic = await p.evaluate(() => {
            const a = [...document.querySelectorAll("a[href*='creativecommons.org']")].map(x => x.href);
            return a;
          });
          const ok = lic.some(h => /publicdomain\/zero/.test(h)) && !lic.some(h => /\/licenses\//.test(h));
          meta[key] = { target, id, user: r.user, title: r.title, url, dur: r.dur, licenseUrl: lic.join(" "), licenseOk: ok };
          if (!ok) { console.log("NOT CC0", key, lic.join(" ")); continue; }
          const hq = r.mp3.replace("-lq.mp3", "-hq.mp3");
          const resp = await p.request.get(hq);
          if (!resp.ok()) { console.log("DLFAIL", key, resp.status()); continue; }
          fs.mkdirSync(path.join(outDir, target), { recursive: true });
          fs.writeFileSync(path.join(outDir, target, id + ".mp3"), await resp.body());
          console.log("ok", key, r.title.slice(0, 30));
        } catch (e) { console.log("ERR", key, e.message.slice(0, 80)); }
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
        await p.waitForTimeout(600);
      }
    }
  } finally { fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1)); await p.close(); await b.close(); }
})();
