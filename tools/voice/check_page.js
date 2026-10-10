// 驗收 voice-choice.html：每個試聽按鈕的 mp3 都載得到、duration > 0；順便截圖（桌機＋手機寬）
// 用法：node tools/voice/check_page.js [截圖資料夾]
// 需要本機 http://127.0.0.1:8765 有開（專案根目錄 python -m http.server 8765）
const path = require("path");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const fs = require("fs");
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL = process.env.VC_URL || "http://127.0.0.1:8765/voice-choice.html";
const shotDir = process.argv[2];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findShell(), args: ["--autoplay-policy=no-user-gesture-required"] });
  const errs = [];
  for (const [w, h, name] of [[1180, 900, "desktop"], [390, 844, "phone"]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    p.on("pageerror", e => errs.push("PAGEERR " + e.message));
    p.on("console", m => { if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 200)); });
    p.on("response", r => { if (r.status() >= 400) errs.push("HTTP " + r.status() + " " + r.url()); });
    const resp = await p.goto(URL);
    if (name === "desktop") {
      console.log("page status", resp.status(), "title", await p.title());
      const res = await p.evaluate(async () => {
        const btns = [...document.querySelectorAll(".say")];
        const out = await Promise.all(btns.map(b => new Promise(res => {
          const a = new Audio(); a.preload = "auto";
          const t = setTimeout(() => res({ src: b.dataset.src, dur: -1, err: "timeout" }), 15000);
          a.onloadedmetadata = () => { clearTimeout(t); res({ src: b.dataset.src, dur: a.duration }); };
          a.onerror = () => { clearTimeout(t); res({ src: b.dataset.src, dur: -1, err: a.error && a.error.code }); };
          a.src = b.dataset.src;
        })));
        return out;
      });
      const bad = res.filter(r => !(r.dur > 0));
      console.log("audio buttons", res.length, "ok", res.length - bad.length, "bad", bad.length);
      bad.forEach(b => console.log("  BAD", JSON.stringify(b)));
      const durs = res.map(r => r.dur); console.log("duration min/max", Math.min(...durs).toFixed(2), Math.max(...durs).toFixed(2));
      // 實際點一顆按鈕：要能進入播放狀態
      await p.click(".say >> nth=0"); await p.waitForTimeout(600);
      console.log("click→playing class:", await p.evaluate(() => document.querySelector(".say").classList.contains("playing") || document.querySelector(".say")._a.currentTime > 0));
    }
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(name, "scrollWidth", sw, "viewport", w, sw > w ? "← 有橫向捲動" : "ok");
    if (shotDir) await p.screenshot({ path: path.join(shotDir, `voice-choice-${name}.png`), fullPage: name === "desktop" });
    await p.close();
  }
  console.log("errors", errs.length); errs.forEach(e => console.log("  " + e));
  await browser.close();
})();
