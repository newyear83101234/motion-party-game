// 畫畫遊戲效能：開圖切塊、填色各要多久（電腦 headless，iPad 約慢 2～3 倍）
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1；用法：node tools/draw-test/perf.js [線稿id]
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = path.join(base, fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop(), "chrome-headless-shell-win64", "chrome-headless-shell.exe");
(async () => {
  const id = process.argv[2] || "animal-2";
  const browser = await chromium.launch({ headless: true, executablePath: shell });
  const p = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  await p.goto("http://127.0.0.1:8765/draw.html?dev");
  await p.waitForFunction(() => window.__draw && document.querySelector("#arts .card"));
  const r = await p.evaluate(async id => {
    const a = (await (await fetch("IMAGE/draw/lineart/index.json?v=3")).json()).arts.find(x => x.id === id);
    let t = performance.now(); await __draw.startArt(a); const load = performance.now() - t;
    const P = __draw.painter, ids = __draw.board.boxes.map((b, i) => [b.area, i]).sort((x, y) => y[0] - x[0]).slice(0, 5).map(x => x[1]);
    t = performance.now(); for (const i of ids) P.fill(i, { kind: "glitter" }, "#1e88e5").done(); const fill = (performance.now() - t) / ids.length;
    return { load: Math.round(load), fill: Math.round(fill), regions: __draw.board.boxes.length };
  }, id);
  console.log(`${id}：${r.regions} 塊，開圖切塊 ${r.load} 毫秒（目標 < 500），最大 5 塊平均填色 ${r.fill} 毫秒（目標 < 100）`);
  await browser.close();
})();
