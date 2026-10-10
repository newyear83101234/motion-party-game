// 開頁速度：模擬 4Mbps 網路、清快取，量「讀取畫面消失」的時間、3D 小島有沒有上、總下載量
// 用法：node tools/zy-test/loadtime.js [橫寬 直高]
const { launch, URL } = require("./lib");
(async () => {
  const browser = await launch(); const out = [];
  for (const [w, h] of [[1180, 820], [820, 1180]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 4e6 / 8, uploadThroughput: 1e6 / 8 });
    let bytes = 0; const big = [];
    cdp.on("Network.loadingFinished", e => { bytes += e.encodedDataLength; });
    cdp.on("Network.responseReceived", e => { const u = e.response.url; if (e.response.encodedDataLength > 0) big.push(u); });
    const t0 = Date.now();
    await p.goto(URL, { waitUntil: "commit" });
    await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 30000 });
    const t = Date.now() - t0, hub = await p.evaluate(() => document.body.classList.contains("hub3d"));
    const atReady = bytes;
    await p.waitForTimeout(6000);                       // 背景再抓的（朋友模型等）
    out.push(`${w}x${h}：讀取畫面 ${(t / 1000).toFixed(1)} 秒消失、3D 小島 ${hub ? "有" : "沒有（退回卡片）"}、開好時已下載 ${(atReady / 1e6).toFixed(2)}MB、6 秒後共 ${(bytes / 1e6).toFixed(2)}MB`);
    await ctx.close();
  }
  await browser.close(); console.log(out.join("\n"));
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
