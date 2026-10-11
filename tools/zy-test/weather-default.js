// 天氣（阿葉 10-11）：node tools/zy-test/weather-default.js — 開頁晴天、遊戲中換天氣回小島才說、雨→晴→雨 不說、看過下雨才說彩虹、選單上換馬上說
const { launch, openGame, enterMode } = require("./lib");
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await launch(); const out = []; let fail = 0;
  const ok = (n, c, d = "") => { out.push(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); if (!c) fail++; };
  const { p, errs } = await openGame(b, { stickers: 40, stars: 35, query: "debug&novoice&night=0" });
  await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready && window.__zy.weather, null, { timeout: 60000 });
  ok("開頁＝晴天", await p.evaluate(() => window.__zy.weather) === "sunny");
  const guide = () => p.evaluate(() => document.getElementById("guideText").textContent);
  const home = async () => { await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes")?.click(); }); await p.waitForFunction(() => !document.getElementById("menu").classList.contains("hidden"), null, { timeout: 10000 }); await sleep(300); };
  // 1) 遊戲中 晴→雨：不說；回小島說「下雨了」
  await enterMode(p, "fish"); await sleep(500);
  const g0 = await guide();
  await p.evaluate(() => window.__zy.setWeather("rain"));
  ok("遊戲中換天氣不改貓頭鷹文字", await guide() === g0);
  await home();
  ok("回小島說新天氣", /下雨了/.test(await guide()), await guide());
  // 2) 遊戲中 雨→晴→雨：玩家只看過雨 → 回來不說（變回原樣）
  await enterMode(p, "fish"); await sleep(500);
  await p.evaluate(() => { window.__zy.setWeather("sunny"); window.__zy.setWeather("rain"); window.__rnd = Math.random; Math.random = () => 0; });   // 一般招呼語固定成第一句
  await home(); await p.evaluate(() => { Math.random = window.__rnd; });
  ok("雨→晴→雨 回來不說天氣", !/下雨了|彩虹|晴天/.test(await guide()), await guide());
  // 3) 遊戲中 雨→陰→晴：玩家看過雨 → 說彩虹
  await enterMode(p, "fish"); await sleep(500);
  await p.evaluate(() => { window.__zy.setWeather("cloudy"); window.__zy.setWeather("sunny"); });
  await home();
  ok("看過下雨、回來晴天 → 說彩虹", /彩虹/.test(await guide()), await guide());
  // 4) 選單上直接換：馬上說
  await p.evaluate(() => window.__zy.setWeather("typhoon"));
  ok("選單上換天氣馬上說", /颱風/.test(await guide()), await guide());
  console.log(out.join("\n")); console.log(errs.join("\n") || "no errors");
  console.log(fail ? `${fail} FAILED` : "ALL PASS"); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
