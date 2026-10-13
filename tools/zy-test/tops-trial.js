// 陀螺第一次免費（10-13 阿葉：「第一次不用星星就可以遊玩，後面才需要，要先讓人玩一次看看才知道」；「歸仁區要 30 張貼紙才開、開了才看到陀螺都沒關係」）
// node tools/zy-test/tops-trial.js
// ① 5 張貼紙：歸仁區沒開 → 🗺️ 清單陀螺卡鎖著（照舊）
// ② 30 張貼紙、沒有券、第一次：清單點陀螺 → 介紹卡寫「第一次免費玩・之後 15 顆星換 1 張券」→ 開始玩＝進陀螺（不用券）
// ③ 免費用過了：介紹卡改寫券數＋對手段位
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
    ok("② 介紹卡：寫「第一次免費玩・之後 15 顆星換 1 張券」、沒有上鎖", pk.on && strip(pk.meta).includes("第一次免費玩") && strip(pk.meta).includes("15顆星換1張券") && !strip(pk.lock), J({ ...pk, meta: strip(pk.meta), lock: strip(pk.lock) }));
    await p.evaluate(() => document.getElementById("pkGo").click());
    const inTops = await p.waitForFunction(() => window.__zy.mode === "tops" && !document.getElementById("tops").classList.contains("hidden"), null, { timeout: 20000 }).then(() => true, () => false);
    ok("② 開始玩：沒有券也進得去（第一次免費）", inTops, J(await p.evaluate(() => ({ mode: window.__zy.mode, tops: window.__zy.topsSave }))));
    ok("② 沒有錯誤", errs.length === 0, errs.slice(0, 3).join(" | "));
    // ③ 免費用過了
    await p.evaluate(() => localStorage.setItem("zy1_tops", JSON.stringify({ freeUsed: 1, tickets: 0 })));
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 30000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
    await ready(p);
    await listCard(p);
    await p.evaluate(() => document.querySelector("#gamesList .gl-card[data-mode=tops]").click());
    await p.waitForFunction(() => !document.getElementById("pick").classList.contains("hidden") && document.getElementById("pick").dataset.mode === "tops", null, { timeout: 15000 }).catch(() => {});
    const pk2 = await pickInfo(p);
    ok("③ 免費用過了：介紹卡改寫券數＋對手段位", strip(pk2.meta).includes("🎟️0") && strip(pk2.meta).includes("對手段位") && !strip(pk2.meta).includes("免費"), strip(pk2.meta));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS (${out.length})`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
