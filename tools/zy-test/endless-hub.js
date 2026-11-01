// 11-01 跑跑運動場、海洋館（歸仁區西邊、北邊小半島）：小島上看得到、點得到、介紹卡內容對、鎖住時寫還差幾張
// 跑法：node tools/zy-test/endless-hub.js（要先開本機伺服器 python -m http.server 8765）；截圖存 %TEMP%\zy-endless-hub\
const path = require("path"), fs = require("fs");
const { launch, openGame } = require("./lib");
const OUT = path.join(process.env.TEMP || ".", "zy-endless-hub"); fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (name, cond, info = "") => { if (cond) pass++; else fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  " + info)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await launch();
  try {
    // ① 40 張貼紙（歸仁區開了）：兩棟都在、沒鎖、點 🗺️ 清單的卡片會飛過去開介紹卡
    const { p, errs } = await openGame(b, { w: 1180, h: 820, stickers: 40, query: "debug" });
    await p.waitForFunction(() => document.body.classList.contains("hub3d"), null, { timeout: 30000 });
    await p.waitForFunction(() => window.__hub3d && document.querySelector('.hub-tag[data-mode="run"]') && document.querySelector('.hub-tag[data-mode="grow"]'), null, { timeout: 30000 });
    ok("浮標：跑跑運動場、海洋館都有", true);
    const cards = await p.evaluate(() => ["run", "grow"].map(m => { const c = document.querySelector(`.mode-card[data-mode=${m}]`); return c && !c.classList.contains("locked"); }));
    ok("40 張貼紙：兩張卡片都沒鎖", cards.every(Boolean), JSON.stringify(cards));
    await p.click("#townBtn"); await sleep(2500);
    await p.screenshot({ path: path.join(OUT, "town.png") });
    for (const m of ["run", "grow"]) {
      const sc = await p.evaluate(mm => window.__hub3d.screenOf(mm), m);
      ok(`${m}：建築在畫面上（飛到歸仁區後）`, sc.x > 0 && sc.x < 1180 && sc.y > 0 && sc.y < 820, JSON.stringify(sc));
      await p.evaluate(mm => { const t = document.querySelector(`.hub-tag[data-mode="${mm}"]`); t && t.click(); }, m); await sleep(1600);
      const pk = await p.evaluate(() => ({ open: !document.getElementById("pick").classList.contains("hidden"), name: document.getElementById("pkName").textContent, meta: document.getElementById("pkMeta").textContent, locked: document.getElementById("pick").classList.contains("locked") }));
      ok(`${m}：點浮標開介紹卡`, pk.open && !pk.locked && /跑跑大冒險|小魚長大記/.test(pk.name) && (m === "run" ? /30 題/ : /8 區/).test(pk.meta), JSON.stringify(pk));
      await p.screenshot({ path: path.join(OUT, `pick-${m}.png`) });
      await p.click("#pkClose").catch(() => {}); await sleep(600);
    }
    console.log("measure", await p.evaluate(() => { const j = JSON.parse(window.__hub3d.measure()); return JSON.stringify({ run: j.run, grow: j.grow }); }));
    // 打卡點（小魚；跑跑 v2 一局 30 題沒有打卡點）：存檔有 at＝3 → 介紹卡多「🚩 從🐢海龜繼續 ✓」，點一下關掉
    await p.evaluate(() => { localStorage.setItem("zy1_endless", JSON.stringify({ grow: { best: 820, zone: 3, reach: 3, plays: 2, at: 3, go: 1 } })); });
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
    await p.waitForFunction(() => document.querySelector('.hub-tag[data-mode="grow"]'), null, { timeout: 30000 }); await sleep(800);
    await p.click("#townBtn"); await sleep(2000);
    await p.evaluate(() => document.querySelector('.hub-tag[data-mode="grow"]').click()); await sleep(1500);
    const ch = await p.evaluate(() => { const b2 = document.querySelector("#pkMeta .pk-from"); return b2 ? b2.textContent : null; });
    ok("打卡點：小魚介紹卡有「從🐢海龜繼續 ✓」", ch && /海龜繼續/.test(ch) && /✓/.test(ch), String(ch));
    await p.evaluate(() => document.querySelector("#pkMeta .pk-from").click()); await sleep(200);
    const go = await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_endless")).grow.go);
    ok("打卡點：點一下＝關掉（存 go=0）", go === 0, String(go));
    await p.screenshot({ path: path.join(OUT, "pick-grow-checkpoint.png") });
    ok("沒有主控台錯誤", errs.length === 0, errs.slice(0, 3).join(" | "));
    await p.context().close();
    // ② 20 張貼紙（歸仁區還沒開）：卡片鎖著
    const g2 = await openGame(b, { w: 1180, h: 820, stickers: 20, query: "debug" });
    await g2.p.waitForFunction(() => document.querySelector('.mode-card[data-mode="run"]'), null, { timeout: 30000 }); await sleep(1500);
    const lk = await g2.p.evaluate(() => ["run", "grow"].map(m => document.querySelector(`.mode-card[data-mode=${m}]`).classList.contains("locked")));
    ok("20 張貼紙：兩張卡片鎖著", lk.every(Boolean), JSON.stringify(lk));
    await g2.ctx.close();
  } finally { await b.close(); }
  console.log(`\n${pass} PASS / ${fail} FAIL　截圖：${OUT}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
