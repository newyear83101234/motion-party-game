// 小島同樂廣場截圖：node tools/zy-test/plaza-shots.js <輸出資料夾>
// 假後端（page.route）；拍：廣場卡片橫／直／4:3（含貼紙按一下的樣子）、連不上、選單上的 🎪（橫／直，有繼續玩）、
//     小島慶祝（銅氣球、銀煙火、金獎盃特寫）、結算小字、家長頁說明；順便檢查卡片內國字都有注音（__zy.zMissing 空的）
const path = require("path"), fs = require("fs");
const { pathToFileURL } = require("url");
const { launch, URL } = require("./lib");
const OUT = process.argv[2] || "."; fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CORS = { "access-control-allow-origin": "*" };
const GOALS = { rescue: [50, 150, 300], read: [150, 450, 900], star: [100, 300, 600] };
(async () => {
  const PZ = await import(pathToFileURL(path.resolve(__dirname, "../../js/zhuyin-plaza.js")).href);
  const W = PZ.weekKeyOf(Date.now()), theme = k => ({ key: k, title: "x", unit: "x", desc: "x", goals: GOALS[k] });
  const browser = await launch(); const errs = [], notes = [];
  async function open(w, h, d, { query = "debug&plaza=on", gmode = "ok", ls = {}, stickers = 64 } = {}) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(() => { window.__spoken = []; Object.defineProperty(window, "speechSynthesis", { value: { speaking: false, cancel() {}, getVoices() { return []; }, speak(u) { setTimeout(() => u.onend && u.onend(), 150); } }, configurable: true }); });
    await ctx.route(/script\.google(usercontent)?\.com/, r => r.request().method() === "GET" ? (gmode === "ok" ? r.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ ...d, reached: PZ.levelOf(d.total, d.theme.goals), now: Date.now() }) }) : r.fulfill({ status: 500, headers: CORS, body: "x" }))
      : r.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: '{"ok":true}' }));
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(`${w}x${h} PAGEERR ${e.message}`)); p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errs.push(`${w}x${h} ${m.text().slice(0, 150)}`); });
    await p.goto(URL + "?" + query); await p.waitForTimeout(300);
    await p.evaluate(({ stickers, ls }) => { localStorage.clear(); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, JSON.stringify(v)); return import("./js/zhuyin-words.js").then(({ WORDS }) => { const s = {}; WORDS.slice(0, stickers).forEach(x => s[x.h] = 1); localStorage.setItem("zy1_stickers", JSON.stringify(s)); localStorage.setItem("zy1_stars", "47"); localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1, bubble: 1, deliver: 1 })); }); }, { stickers, ls });
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 20000 });
    await p.evaluate(() => document.getElementById("startBtn").click()); await sleep(3500);
    return { ctx, p };
  }
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".jpg"), type: "jpeg", quality: 80 });
  const D = (k, total, extra = {}) => ({ ok: true, w: W, theme: theme(k), total, plays: 345, cheers: [45, 10, 3, 8], prev: { w: PZ.addWeeks(W, -1), theme: theme("star"), total: 320, reached: 2 }, paused: false, ...extra });
  const mineLS = { zy_plaza_mine: { w: W, s: { 1: { rescue: 12, read: 30 } } } };
  // 卡片：橫／直／4:3／手機
  for (const [w, h, t] of [[1180, 820, "L"], [820, 1180, "P"], [1024, 768, "43"], [390, 844, "M"]]) {
    const { ctx, p } = await open(w, h, D("rescue", 112), { ls: mineLS });
    await p.evaluate(() => document.getElementById("plazaBtn").click()); await sleep(2200);
    await shot(p, `card-${t}`);
    if (t === "L" || t === "P") { await p.evaluate(() => document.querySelectorAll(".pz-stk")[2].click()); await sleep(500); await shot(p, `card-${t}-armed`); }
    const m = await p.evaluate(() => ({ missing: [...(window.__zy.zMissing || [])].join(""), sh: document.querySelector(".plaza-card").scrollHeight, ch: document.querySelector(".plaza-card").clientHeight }));
    notes.push(`card-${t}: 缺注音「${m.missing}」 捲動 ${m.sh}/${m.ch}`);
    await ctx.close();
  }
  // 連不上
  { const { ctx, p } = await open(1180, 820, D("read", 0), { gmode: "500" }); await p.evaluate(() => document.getElementById("plazaBtn").click()); await sleep(1500); await shot(p, "card-offline"); await ctx.close(); }
  // 選單上的 🎪（有繼續玩）
  for (const [w, h, t] of [[1180, 820, "L"], [820, 1180, "P"], [1024, 768, "43"]]) {
    const { ctx, p } = await open(w, h, D("read", 100));
    await p.evaluate(() => import("./js/zhuyin-words.js").then(({ WORDS }) => { localStorage.setItem("zy1_resume", JSON.stringify({ mode: "fish", idx: 2, results: [3, 3], combo: 2, earned: [], words: WORDS.slice(0, 10).map(x => [x.h, 1]), t: Date.now() })); }));
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(5000);
    await shot(p, `hud-${t}`); await ctx.close();
  }
  // 小島慶祝：銅（氣球）、銀（煙火）、金（獎盃特寫）
  for (const [k, total, n] of [["read", 160, "cele-bronze"], ["read", 460, "cele-silver"], ["read", 950, "cele-gold"]]) {
    const { ctx, p } = await open(1180, 820, D(k, total));
    await sleep(4500);   // 等開場煙火放完、貓頭鷹說完
    await p.evaluate(() => { document.getElementById("guide").classList.add("fold"); });
    if (n === "cele-silver") { await p.evaluate(() => window.__hub3d.fireworks(3)); await sleep(1150); }
    await shot(p, n);
    if (n !== "cele-silver") {   // 特寫：鏡頭拉近圓環噴水池
      await p.evaluate(() => { const h = window.__hub3d, f = h.fit, s = h.celeScreen(), k = f.k; h.cam(2.4, (s.x - innerWidth / 2) / k, -(s.y - innerHeight / 2) / k); h.tags(false); });
      await sleep(1500); await shot(p, n + "-close");
    }
    const c = await p.evaluate(() => ({ cele: window.__hub3d.cele(), stats: window.__hub3d.stats() }));
    notes.push(`${n}: ${JSON.stringify(c)}`);
    await ctx.close();
  }
  // 結算小字（橫／直）＋家長頁
  for (const [w, h, t] of [[1180, 820, "L"], [820, 1180, "P"]]) {
    const { ctx, p } = await open(w, h, D("read", 100));
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=fish]").click());
    await p.waitForFunction(() => window.__zy.mode === "fish" && document.querySelectorAll("#pond .fishBtn").length > 0, null, { timeout: 15000 });
    for (let k = 0; k < 14; k++) {
      if (await p.evaluate(() => !document.getElementById("result").classList.contains("hidden"))) break;
      const i0 = await p.evaluate(() => window.__zy.idx); await sleep(300);
      await p.evaluate(() => { const i = (window.__zy.curOpts || []).findIndex(o => !!o.ok); const b = document.querySelectorAll("#pond .fishBtn")[i]; if (b) b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); });
      await p.waitForFunction(i0 => window.__zy.idx > i0 || !document.getElementById("result").classList.contains("hidden"), i0, { timeout: 12000, polling: 100 }).catch(() => {});
    }
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 15000 }).catch(() => {});
    await sleep(9500); await shot(p, `result-note-${t}`);   // 結算演完（貼紙一張張、星星飛進罐子）小字才出來
    if (t === "P") { await ctx.close(); continue; }
    await p.evaluate(() => { document.getElementById("menuBtn").click(); }); await sleep(800);
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); }); await sleep(400);
    await p.evaluate(() => document.getElementById("plazaSec").scrollIntoView({ block: "center" })); await sleep(300);
    await shot(p, "settings-plaza");
    await ctx.close();
  }
  await browser.close();
  console.log(notes.join("\n")); console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no errors");
})().catch(e => { console.error("FATAL", e); process.exit(1); });
