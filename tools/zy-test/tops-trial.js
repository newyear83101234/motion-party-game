// 陀螺第一次免費（10-13 阿葉：「第一次不用星星就可以遊玩，後面才需要，要先讓人玩一次看看才知道」；「歸仁區要 30 張貼紙才開、開了才看到陀螺都沒關係」）
// node tools/zy-test/tops-trial.js
// ① 5 張貼紙：歸仁區沒開 → 🗺️ 清單陀螺卡鎖著（照舊）
// ② 30 張貼紙、第一次：清單點陀螺 → 介紹卡寫「第一次免費玩・之後 5 顆⭐玩一次」→ 開始玩＝進陀螺（不用星星）
// ③ 免費用過了、星星 0（10-31 沒有券，直接用星星）：介紹卡上鎖、寫「再拿 5 顆星星就能玩」、沒有「開始玩」
// ④ 免費用過了、星星 7：介紹卡寫「⭐ 7 顆・5 顆玩一次・🔰 新手」、沒鎖
const { launch, openGame } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.stringify(x);
const strip = s => (s || "").replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "");
const Q = "debug&novoice&night=0&weather=sunny&plaza=off";
async function ready(p) { await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 60000 }).catch(() => {}); await sleep(600); }
async function listCard(p) { await p.evaluate(() => document.getElementById("mapBtn").click()); await sleep(700); return p.evaluate(() => { const c = document.querySelector("#gamesList .gl-card[data-mode=tops]"); return c ? c.classList.contains("locked") : null; }); }
const pickInfo = p => p.evaluate(() => ({ on: !document.getElementById("pick").classList.contains("hidden"), name: document.getElementById("pkName").textContent, meta: document.getElementById("pkMeta").textContent, lock: document.getElementById("pkLock").textContent }));

(async () => {
  const browser = await launch();
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 5, query: Q });
    await ready(p);
    ok("① 5 張貼紙：歸仁區沒開，清單陀螺卡鎖著（照舊）", (await listCard(p)) === true);
    ok("① 沒有錯誤", errs.length === 0, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 30, query: Q });
    await ready(p);
    ok("② 30 張貼紙：清單陀螺卡沒鎖", (await listCard(p)) === false);
    await p.evaluate(() => document.querySelector("#gamesList .gl-card[data-mode=tops]").click());
    await p.waitForFunction(() => !document.getElementById("pick").classList.contains("hidden") && document.getElementById("pick").dataset.mode === "tops", null, { timeout: 15000 }).catch(() => {});
    const pk = await pickInfo(p);
    ok("② 介紹卡：寫「第一次免費玩・之後 5 顆⭐玩一次」、沒有上鎖", pk.on && strip(pk.meta).includes("第一次免費玩") && strip(pk.meta).includes("5顆⭐玩一次") && !strip(pk.lock), J({ ...pk, meta: strip(pk.meta), lock: strip(pk.lock) }));
    await p.evaluate(() => document.getElementById("pkGo").click());
    const inTops = await p.waitForFunction(() => window.__zy.mode === "tops" && !document.getElementById("tops").classList.contains("hidden"), null, { timeout: 20000 }).then(() => true, () => false);
    ok("② 開始玩：沒有星星也進得去（第一次免費）", inTops, J(await p.evaluate(() => ({ mode: window.__zy.mode, tops: window.__zy.topsSave }))));
    ok("② 沒有錯誤", errs.length === 0, errs.slice(0, 3).join(" | "));
    // ③ 免費用過了、星星 0：介紹卡上鎖
    const reopen = async save => {
      await p.evaluate(sv => localStorage.setItem("zy1_tops", JSON.stringify(sv)), save);
      await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 30000 });
      await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
      await ready(p); await listCard(p);
      await p.evaluate(() => document.querySelector("#gamesList .gl-card[data-mode=tops]").click());
      await p.waitForFunction(() => !document.getElementById("pick").classList.contains("hidden") && document.getElementById("pick").dataset.mode === "tops", null, { timeout: 15000 }).catch(() => {});
      return { ...(await pickInfo(p)), locked: await p.evaluate(() => document.getElementById("pick").classList.contains("locked")), go: await p.evaluate(() => { const b = document.getElementById("pkGo"); return !!b && getComputedStyle(b).display !== "none" && getComputedStyle(b).visibility !== "hidden" && !b.closest(".locked") ; }) };
    };
    const pk2 = await reopen({ freeUsed: 1, stars: 0 });
    ok("③ 免費用過、星星 0：介紹卡上鎖（class locked）、寫「再拿 5 顆星星就能玩」、不寫免費", pk2.on && pk2.locked && strip(pk2.lock).includes("0／5") && strip(pk2.lock).includes("再拿5顆星星就能玩") && !strip(pk2.meta).includes("免費"), J({ meta: strip(pk2.meta), lock: strip(pk2.lock), locked: pk2.locked }));
    // ④ 星星 7：不鎖
    const pk3 = await reopen({ freeUsed: 1, stars: 7 });
    ok("④ 免費用過、星星 7：介紹卡不鎖、寫「⭐ 7 顆・5 顆玩一次・🔰 新手」", pk3.on && !pk3.locked && strip(pk3.meta) === "⭐7顆・5顆玩一次・🔰新手" && !strip(pk3.lock), J({ meta: strip(pk3.meta), lock: strip(pk3.lock), locked: pk3.locked }));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS (${out.length})`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
