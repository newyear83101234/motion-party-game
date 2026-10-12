// 爬塔用的泡泡 Boss（zhuyin.js playBubbleBoss，v6 §3、§5.3）：node tools/zy-test/bubble-boss.js
// 驗：①介面掛在 window.__zyTowerApi／window.__zy ②自己開泡泡畫面、Boss 狀態（下壓照 ceilingEvery、不顯示關卡號碼）
//     ③天花板下壓發生 ④碰底線：onEvent({type:"press"})、整片往上退 2 排、不重來、不跳結算 ⑤救完＝cleared、回到呼叫前畫面、不存泡泡進度、不給星星
//     ⑥abort() ⑦🏠 暫停選單「離開挑戰」＝aborted、選單文字事後還原 ⑧Boss 結束後一般泡泡關照常 ⑨沒有錯誤
const { launch, openGame } = require("./lib");
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vis = (p, id) => p.evaluate(id => !document.getElementById(id).classList.contains("hidden"), id);
const S = p => p.evaluate(() => window.__zy.bubble && window.__zy.bubble.state());
// 開一場 Boss：結果寫到 window.__bossRes、事件到 window.__bossEv
const startBoss = (p, o) => p.evaluate(o => { window.__bossRes = null; window.__bossEv = []; const h = window.__zyTowerApi.playBubbleBoss(Object.assign({ onEvent: e => window.__bossEv.push(e) }, o)); window.__bossH = h; h.done.then(r => { window.__bossRes = r; }); return true; }, o);
const bossReady = p => p.waitForFunction(() => { const s = window.__zy.bubble && window.__zy.bubble.state(); return s && s.boss && !document.getElementById("bubble").classList.contains("hidden"); }, null, { timeout: 15000 }).then(() => true, () => false);
const fireJunk = (p, k) => p.evaluate(k => { const g = window.__zy.bubble, sy = ["ㄅ", "ㄆ", "ㄇ"][k % 3]; g.debug.setQueue(sy, sy); g.debug.aim(Math.PI / 2 + (k % 2 ? 0.25 : -0.25)); return g.debug.fire(); }, k);
const waitIdle = p => p.waitForFunction(() => { const s = window.__zy.bubble.state(); return s && (!s.busy || s.won || s.full); }, null, { timeout: 15000, polling: 50 });

(async () => {
  const browser = await launch(); const allErrs = [];
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug" });
    const before = await p.evaluate(() => ({ bubble: localStorage.getItem("zy1_bubble"), stars: localStorage.getItem("zy1_stars"), screen: [...document.querySelectorAll(".screen")].find(s => !s.classList.contains("hidden"))?.id }));
    await sleep(200);
    ok("介面：window.__zyTowerApi.playBubbleBoss 和 window.__zy.playBubbleBoss 都在", await p.evaluate(() => typeof window.__zyTowerApi?.playBubbleBoss === "function" && window.__zy.playBubbleBoss === window.__zyTowerApi.playBubbleBoss));

    // ===== ② 開 Boss：第 50 關的盤面（十排）、每 1 發降一排 → 很快就會碰底線 =====
    await startBoss(p, { level: 49, ceilingEvery: 1 });
    const ready = await bossReady(p);
    let s = await S(p);
    const ui = await p.evaluate(() => ({ lvl: document.querySelector("#bubble .bb-lvl").textContent, lamps: document.querySelectorAll("#bubble .bb-ceil .bb-lamp").length, img: document.querySelector("#bubble .bb-pen img").src.split("/").pop(), result: !document.getElementById("result").classList.contains("hidden") }));
    ok("開 Boss：自己打開泡泡畫面、Boss 狀態、盤面＝第 50 關、天花板每 1 發降（1 盞燈）、不顯示關卡號碼（🗼）", ready && s.boss && s.level === 49 && s.drop === 1 && ui.lamps === 1 && ui.lvl.includes("🗼") && ui.img === "lion.webp" && !ui.result, JSON.stringify({ ready, level: s && s.level, drop: s && s.drop, ui }));
    // ===== ③④ 下壓、碰底線 =====
    const tops = []; let pressSeen = false;
    for (let k = 0; k < 6 && !pressSeen; k++) {
      await fireJunk(p, k); await waitIdle(p); await sleep(300);
      s = await S(p); tops.push(`${s.shots}:${s.top}/${s.low}/${s.presses}`);
      pressSeen = s.presses > 0;
    }
    const ev = await p.evaluate(() => window.__bossEv.slice());
    ok("Boss：天花板每發都降一排（下壓發生）", tops.length >= 1 && +tops[0].split(":")[1].split("/")[0] >= 1, tops.join(" "));
    ok("Boss：碰到底線 → onEvent({type:\"press\"})、整片往上退 2 排（最下面離底線 ≥ 2 排）、不重來、不變暗、可以接著打", pressSeen && ev.length === 1 && ev[0].type === "press" && ev[0].presses === 1 && s.low <= 10 && !s.full && !s.busy && s.shots === tops.length && await p.evaluate(() => !document.querySelector("#bubble .bb-isfull") && !document.getElementById("bubble").classList.contains("hidden")),
      JSON.stringify({ tops, ev, low: s.low, full: s.full, busy: s.busy }));
    await p.screenshot({ path: require("path").join(process.env.BB_SHOTS || require("os").tmpdir(), "boss_after_press.png") }).catch(() => {});
    // ===== ⑥ abort() =====
    await p.evaluate(() => window.__bossH.abort());
    await p.waitForFunction(() => window.__bossRes, null, { timeout: 5000 }).catch(() => {});
    let res = await p.evaluate(() => window.__bossRes);
    let after = await p.evaluate(() => ({ screen: [...document.querySelectorAll(".screen")].find(s => !s.classList.contains("hidden"))?.id, bubble: localStorage.getItem("zy1_bubble"), stars: localStorage.getItem("zy1_stars"), state: window.__zy.bubble.state() }));
    ok("abort()：done＝{ aborted:true, cleared:false, presses:1 }、泡泡畫面收掉回到呼叫前的畫面", res && res.aborted === true && res.cleared === false && res.presses === 1 && res.shots === tops.length && after.screen === before.screen && after.state === null, JSON.stringify({ res, screen: after.screen, before: before.screen }));

    // ===== ⑤ 救完：第 1 關的盤面（一發就救完）=====
    await startBoss(p, { level: 0, ceilingEvery: 8 });
    await bossReady(p); await sleep(300);
    s = await S(p);
    ok("Boss（第 1 關盤面）：沒有教學示範、不唸開場教學", s.boss && !s.demo && !s.teach, JSON.stringify({ demo: s.demo, teach: s.teach }));
    await p.evaluate(() => { const g = window.__zy.bubble, b = g.debug.bestShot(); if (b.swap) g.debug.swap(); g.debug.aim(b.angle); g.debug.fire(); });
    await p.waitForFunction(() => document.querySelector("#bubble .bb-banner"), null, { timeout: 8000 }).catch(() => {});
    const banner = await p.evaluate(() => ({ stars: document.querySelectorAll("#bubble .bb-banner .bb-banner-stars").length }));
    await p.waitForFunction(() => window.__bossRes, null, { timeout: 8000 }).catch(() => {});
    res = await p.evaluate(() => window.__bossRes);
    await sleep(300);
    after = await p.evaluate(() => ({ screen: [...document.querySelectorAll(".screen")].find(s => !s.classList.contains("hidden"))?.id, bubble: localStorage.getItem("zy1_bubble"), stars: localStorage.getItem("zy1_stars"), result: !document.getElementById("result").classList.contains("hidden") }));
    ok("救完＝done { cleared:true, shots:1, presses:0, aborted:false }、橫幅沒有星星", res && res.cleared === true && res.shots === 1 && res.presses === 0 && res.aborted === false && banner.stars === 0, JSON.stringify({ res, banner }));
    ok("救完：回到呼叫前的畫面、不跳一般結算、不存泡泡進度、不加星星", after.screen === before.screen && !after.result && after.bubble === before.bubble && after.stars === before.stars, JSON.stringify({ after, before }));

    // ===== ⑦ 🏠 暫停選單：繼續玩／離開挑戰（沒有重新開始）→ 離開＝aborted；選單文字事後還原 =====
    await startBoss(p, { level: 30, ceilingEvery: 7 });
    await bossReady(p); await sleep(300);
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300);
    const menu = await p.evaluate(() => ({ open: !document.getElementById("confirm").classList.contains("hidden"), yes: document.getElementById("confirmYes").textContent, restart: !document.getElementById("confirmRestart").classList.contains("hidden"), fire: window.__zy.bubble.debug.fire() }));
    ok("🏠 暫停：選單是「繼續玩／離開挑戰」（沒有重新開始）、暫停中不能發射", menu.open && /離開挑戰/.test(menu.yes) && !menu.restart && menu.fire === false, JSON.stringify(menu));
    await p.evaluate(() => document.getElementById("confirmNo").click()); await sleep(300);
    s = await S(p);
    ok("按「繼續玩」：回到 Boss、可以發射", s && s.boss && await p.evaluate(() => window.__zy.bubble.debug.fire() !== false));
    await waitIdle(p);
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300);
    await p.evaluate(() => document.getElementById("confirmYes").click());
    await p.waitForFunction(() => window.__bossRes, null, { timeout: 5000 }).catch(() => {});
    res = await p.evaluate(() => window.__bossRes);
    after = await p.evaluate(() => ({ screen: [...document.querySelectorAll(".screen")].find(s => !s.classList.contains("hidden"))?.id, confirm: !document.getElementById("confirm").classList.contains("hidden"), yes: document.getElementById("confirmYes").textContent, restart: !document.getElementById("confirmRestart").classList.contains("hidden") }));
    ok("「離開挑戰」：done { aborted:true }、回到呼叫前畫面、暫停選單關掉", res && res.aborted === true && res.cleared === false && res.shots === 1 && after.screen === before.screen && !after.confirm, JSON.stringify({ res, after }));
    ok("Boss 結束後：暫停選單文字還原「回小島」、「重新開始」回來", /回小島/.test(after.yes) && after.restart, JSON.stringify(after));

    // ===== ⑧ 之後玩一般泡泡關：照常（有星星、有存檔、暫停選單是回小島）=====
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=bubble]").click());
    await p.waitForFunction(() => window.__zy.bubble && window.__zy.bubble.state() && !window.__zy.bubble.state().boss && !document.getElementById("bubble").classList.contains("hidden"), null, { timeout: 15000 });
    await sleep(600);
    await p.evaluate(() => { const g = window.__zy.bubble, b = g.debug.bestShot(); if (b.swap) g.debug.swap(); g.debug.aim(b.angle); g.debug.fire(); });
    const res2 = await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 10000 }).then(() => true, () => false);
    const sv = await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_bubble") || "null"));
    ok("Boss 之後一般泡泡第 1 關：照常過關結算、存檔前進", res2 && sv && sv.lv === 1 && sv.stars["0"] >= 1, JSON.stringify(sv));
    // ===== ⑨ 從選單（3D 小島）直接 goMenu 打斷 Boss → 也要 resolve（aborted）=====
    await p.evaluate(() => { document.getElementById("homeBtn").click(); }); await sleep(400);
    await startBoss(p, { level: 5, ceilingEvery: 8 });
    await bossReady(p); await sleep(200);
    await p.evaluate(() => window.__zy.bubble.stop());
    await p.waitForFunction(() => window.__bossRes, null, { timeout: 5000 }).catch(() => {});
    res = await p.evaluate(() => window.__bossRes);
    ok("別的地方把泡泡收掉（stop）：Boss 也會結束（aborted），不會讓爬塔一直等", res && res.aborted === true, JSON.stringify(res));
    ok("沒有錯誤", errs.length === 0, errs.join(" | "));
    allErrs.push(...errs); await ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r);
  if (allErrs.length) console.log("ERRORS\n" + allErrs.join("\n"));
  const bad = results.filter(r => r.startsWith("FAIL")).length;
  console.log(bad || allErrs.length ? `\n${bad} FAILED / ${results.length}` : `\nALL PASS (${results.length})`);
  process.exit(bad || allErrs.length ? 1 : 0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
