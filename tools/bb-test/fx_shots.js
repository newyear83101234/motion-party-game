// 方塊爆破特效截圖（對照原版用）：擺好局面 → 放下 → 在幾個時間點截圖
// 先開本機伺服器（python -m http.server 8765 --bind 127.0.0.1），用法：node tools/bb-test/fx_shots.js [輸出資料夾]
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL = process.env.BB_URL || "http://127.0.0.1:8765/blocks.html";
const OUT = process.argv[2] || path.join(process.env.TEMP, "bb-fx");
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findShell() });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // 雲端排行榜：測試一律用測試專用 device（00000000-0000-4000-8000- 開頭，伺服器端不列入排行），不會在朋友榜留假資料
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("bb_dev")) localStorage.setItem("bb_dev", JSON.stringify("00000000-0000-4000-8000-0000000000aa")); } catch (e) {} });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(500);
  await p.click("#bClassic"); await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(OUT, "a-start.png") });
  // 擺一個局面：下兩排差一格、combo 設好，然後放一塊
  async function scene(name, setup, place, times) {
    await p.evaluate(setup);
    await p.evaluate(place);
    let last = 0;
    for (const t of times) { await p.waitForTimeout(t - last); last = t; await p.screenshot({ path: path.join(OUT, `${name}-${t}.png`) }); }
  }
  const clearBoard = `const S = __bb.game.S; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) S.grid[r][c] = null;`;
  await scene("b-good", new Function(clearBoard + `
    for (let r = 6; r < 8; r++) for (let c = 0; c < 8; c++) if (c !== 3) S.grid[r][c] = { k: 0, gem: null };
    S.grid[2][1] = { k: 5, gem: null }; S.tray = [{ id: "i2v", k: 3, gems: null }, { id: "o2", k: 1, gems: null }, { id: "i3h", k: 6, gems: null }]; S.combo = 0; S.sinceClear = 0;`),
    () => __bb.doPlace(0, 6, 3), [120, 420, 800, 1600]);
  await scene("c-combo4", new Function(clearBoard + `
    for (let c = 0; c < 8; c++) if (c !== 5) S.grid[4][c] = { k: 2, gem: null };
    S.tray = [{ id: "o1", k: 4, gems: null }, { id: "o2", k: 1, gems: null }, { id: "i3h", k: 6, gems: null }]; S.combo = 4; S.sinceClear = 0;`),
    () => __bb.doPlace(0, 4, 5), [300, 900]);
  await scene("d-excellent", new Function(clearBoard + `
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if (c !== 4) S.grid[r][c] = { k: 1, gem: null };
    for (let r = 3; r < 8; r++) S.grid[r][4] = { k: 5, gem: null }; S.grid[7][0] = { k: 3, gem: null };
    S.tray = [{ id: "i3v", k: 2, gems: null }, { id: "o2", k: 1, gems: null }, { id: "i3h", k: 6, gems: null }]; S.combo = 12; S.sinceClear = 0;`),
    () => __bb.doPlace(0, 0, 4), [350, 1000, 2200]);
  // 結束
  await p.evaluate(new Function(clearBoard + `
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) S.grid[r][c] = ((r + c) % 2 === 0 || r === 0) ? { k: (r + c) % 7, gem: null } : null;
    S.grid[0][7] = null; S.grid[1][7] = null; S.combo = 0;
    S.tray = [{ id: "i2v", k: 3, gems: null }, { id: "o3", k: 1, gems: null }, null]; __bb.doPlace(0, 0, 7);`));
  await p.waitForTimeout(1100); await p.screenshot({ path: path.join(OUT, "e-over.png") });
  // 冒險標題卡
  await p.evaluate(() => __bb.startLevel(5, true)); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, "f-title.png") });
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  console.log("shots:", OUT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
