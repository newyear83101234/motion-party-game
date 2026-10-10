// 開頁請求時間軸：node tools/zy-test/loadprofile.js [throttle]
// 印出每個請求的開始／結束時間（相對導覽），找出卡住開頁的那一條
const { launch, URL } = require("./lib");
(async () => {
  const throttle = process.argv[2] === "throttle";
  const browser = await launch(); const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } }); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (throttle) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 4e6 / 8, uploadThroughput: 1e6 / 8 });
  const req = new Map(); let t0 = 0;
  cdp.on("Network.requestWillBeSent", e => { if (!t0) t0 = e.timestamp; req.set(e.requestId, { url: e.request.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 70), s: e.timestamp }); });
  cdp.on("Network.loadingFinished", e => { const r = req.get(e.requestId); if (r) { r.e = e.timestamp; r.b = e.encodedDataLength; } });
  cdp.on("Network.loadingFailed", e => { const r = req.get(e.requestId); if (r) { r.e = e.timestamp; r.fail = e.errorText; } });
  const T = Date.now(); await p.goto(URL, { waitUntil: "commit" });
  await p.waitForFunction(() => document.getElementById("loading")?.classList.contains("hidden"), null, { timeout: 40000 });
  const ready = (Date.now() - T) / 1000;
  const rows = [...req.values()].filter(r => r.s).map(r => `${(r.s - t0).toFixed(2).padStart(6)} → ${r.e ? (r.e - t0).toFixed(2).padStart(6) : "  ... "}  ${String(Math.round((r.b || 0) / 1024)).padStart(5)}KB  ${r.fail || ""}${r.url}`);
  console.log(`讀取畫面消失：${ready.toFixed(1)} 秒（${throttle ? "4Mbps" : "不限速"}）`); console.log(rows.sort().join("\n"));
  await browser.close();
})().catch(e => { console.error("FATAL", e.message.split("\n")[0]); process.exit(1); });
