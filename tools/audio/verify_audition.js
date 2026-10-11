// Headless Chromium check: audition.html loads w/o console errors; every audio file decodes; BGM seam checked through real Web Audio loop (OfflineAudioContext).
// usage: node verify_audition.js [port]   (expects python -m http.server <port> served from project root)
const path = require("path");
const fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const port = process.argv[2] || "8765";
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
(async () => {
  const b = await chromium.launch({ executablePath: findShell(), args: ["--autoplay-policy=no-user-gesture-required"] });
  const p = await b.newPage();
  const errs = [];
  p.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text()); });
  p.on("pageerror", e => errs.push("pageerror: " + e.message));
  p.on("requestfailed", r => errs.push("requestfailed: " + r.url()));
  p.on("response", r => { if (r.status() >= 400) errs.push("http " + r.status() + " " + r.url()); });
  await p.goto(`http://127.0.0.1:${port}/tools/audio/audition.html`);
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "audio", "manifest.json"), "utf8"));
  const res = await p.evaluate(async (man) => {
    const out = { decoded: 0, failed: [], seams: {} };
    const AC = new (window.AudioContext || window.webkitAudioContext)();
    const all = [...Object.values(man.bgm), ...Object.values(man.sfx)];
    for (const e of all) {
      try {
        const buf = await AC.decodeAudioData(await (await fetch("../../" + e.file)).arrayBuffer());
        out.decoded++;
        if (e.loop && e.loopStart !== undefined) {
          const sr = buf.sampleRate, L = e.loopEnd - e.loopStart;
          const oac = new OfflineAudioContext(2, Math.round(sr * L * 2), sr);
          const s = oac.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = e.loopStart; s.loopEnd = e.loopEnd;
          s.connect(oac.destination); s.start(0, e.loopStart);
          const r = await oac.startRendering();
          const x = r.getChannelData(0), j = Math.round(sr * L), w = Math.round(sr * 0.02);
          let e1 = 0, e2 = 0; for (let i = 0; i < w; i++) { e1 += x[j - w + i] ** 2; e2 += x[j + i] ** 2; }
          const diffs = []; for (let i = j - sr / 2; i < j + sr / 2; i++) diffs.push(Math.abs(x[i + 1] - x[i]));
          const jump = Math.abs(x[j] - x[j - 1]); diffs.sort((a, b) => a - b);
          out.seams[e.file] = { energy_diff_db: +Math.abs(10 * Math.log10((e1 + 1e-12) / (e2 + 1e-12))).toFixed(2), jump_ratio: +(jump / (diffs[Math.floor(diffs.length * 0.995)] + 1e-9)).toFixed(2) };
        }
      } catch (err) { out.failed.push(e.file + " :: " + err.message); }
    }
    const ad = await (await fetch("audition-data.json")).json();
    out.cmpDecoded = 0;
    for (const c of ad.compare || []) for (const f of [c.old, c.new].filter(Boolean)) {
      try { await AC.decodeAudioData(await (await fetch(f)).arrayBuffer()); out.cmpDecoded++; } catch (err) { out.failed.push(f + " :: " + err.message); }
    }
    for (const c of ad.party || []) { try { await AC.decodeAudioData(await (await fetch(c.file)).arrayBuffer()); out.cmpDecoded++; } catch (err) { out.failed.push(c.file + " :: " + err.message); } }
    return out;
  }, man);
  console.log("compare/party files decoded", res.cmpDecoded);
  console.log("decoded", res.decoded, "of", Object.keys(man.bgm).length + Object.keys(man.sfx).length, "failed", JSON.stringify(res.failed));
  console.log("webaudio seams", JSON.stringify(res.seams));
  console.log("console errors/warnings:", errs.length, JSON.stringify(errs.slice(0, 5)));
  await b.close();
})().catch(e => { console.log("ERR", e.message); process.exit(1); });
