// 獎勵系統（扭蛋機）接進主程式的測試：node tools/zy-test/rewards-game.js
// 驗：舊存檔搬家（孵過 2 顆蛋＝6 位朋友）、星星罐 35 顆＝1 枚扭蛋幣、罐子顯示 🪙、扭蛋機轉一轉→膠囊→打開→獎品（寵物要孵蛋）、
//     抽完存檔、動物朋友圖鑑 28 格、玩一局結算有點心／集章、家長頁有機率、備份碼帶獎勵資料、3D 小島點扭蛋機會開
const { launch, openGame, enterMode } = require("./lib");
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rw = p => p.evaluate(() => JSON.parse(localStorage.getItem("zy1_rewards") || "null"));
(async () => {
  const browser = await launch(); const allErrs = [];
  const { ctx, p, errs } = await openGame(browser, { stickers: 40, stars: 35, eggs: 2, query: "debug" });
  await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 30000 }).catch(() => {});
  await sleep(800);
  let r = await rw(p);
  ok("舊存檔搬家：起始 4 隻＋孵過的熊貓、企鵝", r && ["bear", "bunny", "cat", "fox", "panda", "penguin"].every(id => r.pets[id]) && Object.keys(r.pets).length === 6, JSON.stringify(r && Object.keys(r.pets)));
  ok("星星 35、孵過 2 次 → 1 枚扭蛋幣、罐子剩 5 顆", r && r.coins === 1 && r.jarCoins === 3, JSON.stringify(r && { coins: r.coins, jar: r.jarCoins }));
  const jar = await p.evaluate(() => { const b = document.querySelector("#menu .jarBtn"); return { ready: b.classList.contains("ready"), egg: b.querySelector(".egg").textContent, text: b.querySelector(".jarText").textContent }; });
  ok("選單星星罐：亮起來、顯示 🪙1、5/10", jar.ready && jar.egg.includes("🪙1") && jar.text === "5/10", JSON.stringify(jar));
  await p.waitForFunction(() => window.__hub3d && window.__hub3d.pets().length >= 6, null, { timeout: 20000 }).catch(() => {});
  ok("小島上走的寵物＝6 位", (await p.evaluate(() => window.__hub3d && window.__hub3d.pets().length)) === 6, String(await p.evaluate(() => window.__hub3d && window.__hub3d.pets().join())));
  // 點星星罐 → 扭蛋機
  await p.evaluate(() => document.querySelector("#menu .jarBtn").click());
  await p.waitForFunction(() => !document.getElementById("gacha").classList.contains("hidden"), null, { timeout: 10000 }).catch(() => {});
  ok("點星星罐：打開扭蛋機、有 1 枚幣、可以轉", await p.evaluate(() => !document.getElementById("gacha").classList.contains("hidden") && document.getElementById("gachaCoins").textContent.includes("1") && !document.getElementById("gachaGo").disabled));
  await p.evaluate(() => document.getElementById("gachaGo").click());
  await p.waitForFunction(() => document.getElementById("gachaCap").classList.contains("drop"), null, { timeout: 8000 }).catch(() => {});
  const capTier = await p.evaluate(() => ["common", "rare", "ssr"].find(t => document.getElementById("gachaCap").classList.contains(t)));
  ok("膠囊掉下來（顏色＝稀有度）", !!capTier, capTier);
  ok("轉的時候按鈕不能再按", await p.evaluate(() => document.getElementById("gachaGo").disabled));
  await p.evaluate(() => document.getElementById("gachaCap").click()); await sleep(900);
  // 寵物＝孵蛋（點蛋 3 下）
  if (await p.evaluate(() => !document.getElementById("hatch").classList.contains("hidden"))) {
    for (let i = 0; i < 3; i++) { await p.evaluate(() => document.getElementById("hatchEgg").click()); await sleep(1100); }
    await sleep(1200);
    ok("寵物：點蛋 3 下破殼、出現名字", await p.evaluate(() => !document.getElementById("hatchClose").classList.contains("hidden") && document.getElementById("hatchName").textContent.length > 0), await p.evaluate(() => document.getElementById("hatchName").textContent));
    await p.evaluate(() => document.getElementById("hatchClose").click()); await sleep(600);
  }
  await p.waitForFunction(() => !document.getElementById("gachaPrize").classList.contains("hidden"), null, { timeout: 8000 }).catch(() => {});
  const prize = await p.evaluate(() => document.getElementById("gachaPrize").textContent);
  ok("獎品顯示在扭蛋機上", prize.length > 0, prize.replace(/[ㄅ-ㄩˊˇˋ˙]/g, ""));
  r = await rw(p);
  ok("抽完存檔：幣 0、抽過 1 次", r.coins === 0 && r.pulls === 1, JSON.stringify({ coins: r.coins, pulls: r.pulls, pets: Object.keys(r.pets).length, decor: r.decor, treats: r.treats }));
  ok("沒幣了：轉一轉不能按、顯示還差幾顆星", await p.evaluate(() => document.getElementById("gachaGo").disabled && /再 5 顆/.test(document.getElementById("gachaNext").textContent)));
  await p.evaluate(() => document.getElementById("gachaClose").click()); await sleep(400);
  // 動物朋友圖鑑
  await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(900);
  await p.evaluate(() => document.querySelector("#albumTabs .tab.pets").click()); await sleep(700);
  const pg = await p.evaluate(() => ({ n: document.querySelectorAll("#albumGrid .pet-card").length, have: document.querySelectorAll("#albumGrid .pet-card:not(.none)").length, partner: document.querySelectorAll("#albumGrid .pet-card.partner").length }));
  ok("動物朋友圖鑑：28 格、收集到的有名字、有一隻是夥伴", pg.n === 28 && pg.have >= 6 && pg.partner === 1, JSON.stringify(pg));
  await p.evaluate(() => [...document.querySelectorAll("#albumGrid .pet-card:not(.none)")][1].click()); await sleep(500);
  ok("點另一隻＝換夥伴", (await rw(p)).partner === "bunny", (await rw(p)).partner);
  await p.evaluate(() => document.getElementById("albumBack").click()); await sleep(600);
  // 玩一局：結算有點心、集章
  await enterMode(p, "tone"); await sleep(600);
  for (let k = 0; k < 8; k++) {
    await p.evaluate(() => { const i = window.__zy.curOpts.findIndex(o => o.ok); document.querySelectorAll("#sky .balloon")[i].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); });
    await p.waitForFunction(k => window.__zy.idx > k || !document.getElementById("result").classList.contains("hidden"), k, { timeout: 9000 }).catch(() => {}); await sleep(500);
  }
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 9000 }).catch(() => {});
  await sleep(500); await p.evaluate(() => document.getElementById("result").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(800);
  const strip = await p.evaluate(() => document.querySelector(".rw-strip")?.textContent || "");
  ok("結算：點心 +8、集章 1/7", /點心\+8/.test(strip.replace(/\s/g, "")) && /集章1\/7/.test(strip.replace(/\s/g, "")), strip);
  r = await rw(p);
  ok("點心餵給夥伴（小兔）", r.pets.bunny.t >= 8, JSON.stringify(r.pets.bunny));
  // 家長頁、備份碼
  await p.evaluate(() => { document.getElementById("menuBtn").click(); }); await sleep(800);
  await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(400);
  ok("家長頁：扭蛋機率與統計", await p.evaluate(() => /70%/.test(document.getElementById("settings").textContent) && /抽過 1 次/.test(document.getElementById("rwStats").textContent)), await p.evaluate(() => document.getElementById("rwStats").textContent));
  const rt = await p.evaluate(() => { const c = window.__zyB.exportCode(); const d = window.__zyB.readCode(c); return { hasRw: !!(d && d.slots[0] && d.slots[0].rewards && d.slots[0].rewards.pulls === 1) }; });
  ok("備份碼帶獎勵資料（讀回來抽過 1 次）", rt.hasRw, JSON.stringify(rt));
  await p.evaluate(() => document.getElementById("settingsClose").click());
  allErrs.push(...errs); await ctx.close();
  await browser.close();
  for (const l of results) console.log(l);
  if (allErrs.length) console.log("ERRORS\n" + allErrs.join("\n"));
  const bad = results.filter(l => l.startsWith("FAIL")).length;
  console.log(bad || allErrs.length ? `\n${bad} FAILED / ${results.length}` : `\nALL PASS (${results.length})`);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
