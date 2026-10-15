// 從 YouTube 影片抓指定秒數的畫面（研究原版 Block Blast 用）
// 用常駐自動化 Chrome（CDP 9222，已登入 YouTube Premium、沒廣告）；開自己的分頁，用完關掉，不碰其他分頁
// 用法：node tools/bb-test/yt_frames.js <影片ID> <輸出資料夾> <秒數1> <秒數2> ...
//   秒數可以寫 a-b/n 代表 a 到 b 秒之間平均抓 n 張，例如 59.5-61/6
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const [id, out, ...spec] = process.argv.slice(2);
const times = [];
for (const s of spec) {
  const m = s.match(/^([\d.]+)-([\d.]+)\/(\d+)$/);
  if (m) { const a = +m[1], b = +m[2], n = +m[3]; for (let k = 0; k < n; k++) times.push(+(a + (b - a) * k / Math.max(1, n - 1)).toFixed(2)); }
  else times.push(+s);
}
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const p = await b.contexts()[0].newPage();
  try {
    await p.setViewportSize({ width: 1500, height: 1100 });
    await p.goto("https://www.youtube.com/watch?v=" + id, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForSelector("video", { timeout: 30000 });
    await p.waitForTimeout(4000);
    // 等廣告（Premium 應該沒有）、靜音、拉高畫質
    for (let i = 0; i < 60 && await p.evaluate(() => !!document.querySelector(".ad-showing")); i++) await p.waitForTimeout(1000);
    await p.evaluate(() => {
      const v = document.querySelector("video"); v.muted = true; v.pause();
      const mp = document.getElementById("movie_player");
      try { mp.setPlaybackQualityRange("hd1080", "hd1080"); } catch (e) { /* 舊版播放器 */ }
    });
    const info = await p.evaluate(() => { const v = document.querySelector("video"); return { w: v.videoWidth, h: v.videoHeight, d: v.duration }; });
    console.log("VIDEO", JSON.stringify(info));
    for (const t of times) {
      await p.evaluate(t => new Promise(ok => { const v = document.querySelector("video"); v.addEventListener("seeked", () => setTimeout(ok, 350), { once: true }); v.currentTime = t; }), t);
      const f = path.join(out, `t${String(t.toFixed(2)).padStart(7, "0")}.png`);
      await p.locator("video").screenshot({ path: f });
      console.log("SHOT", f);
    }
  } finally {
    await p.close().catch(() => {});
    await b.close().catch(() => {});
  }
})().catch(e => { console.log("ERR", e.message); process.exit(1); });
