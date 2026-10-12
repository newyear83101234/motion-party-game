// 家長頁「玩了什麼」遊玩紀錄接進主程式的測試：node tools/zy-test/stats.js（本機伺服器要先開；ZY_URL 指到它）
// 驗：玩一局釣魚→次數 1、秒數累加、暫停不計時、切背景不計時、結算畫面不計時、結算星星、家長頁顯示、換存檔位資料分開、清除重來清掉、不進備份碼
const { launch, openGame, enterMode } = require("./lib");
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const st = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__zy.stats)));
const sec = async p => { const s = await st(p); return (s.days[today()] || { sec: 0 }).sec; };
const ans = p => p.evaluate(() => { const i = window.__zy.curOpts.findIndex(o => o.ok); document.querySelectorAll("#pond .fishBtn")[i].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true })); });
(async () => {
  const browser = await launch(); const allErrs = [];
  const { ctx, p, errs } = await openGame(browser, { stickers: 40, stars: 12, query: "debug&no3d" });
  ok("開頁：沒有紀錄", (await sec(p)) === 0 && Object.keys((await st(p)).modes).length === 0);
  await enterMode(p, "fish");
  let s = await st(p);
  ok("開始一局釣魚：次數 1（今天、累計）", s.modes.fish && s.modes.fish.plays === 1 && s.days[today()].plays.fish === 1 && s.modes.fish.last === today(), JSON.stringify(s.modes.fish));
  const a0 = await sec(p); await sleep(3300); const a1 = await sec(p);
  ok("遊戲畫面前景：每秒累加（3.3 秒 +3 左右）", a1 - a0 >= 2 && a1 - a0 <= 4, `${a0}→${a1}`);
  // 暫停選單開著
  await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(400);
  const b0 = await sec(p); await sleep(3300); const b1 = await sec(p);
  ok("暫停選單開著：不計時", b1 === b0, `${b0}→${b1}`);
  await p.evaluate(() => document.getElementById("confirmNo").click()); await sleep(3200); const b2 = await sec(p);
  ok("按「繼續」後又開始計時", b2 - b1 >= 2, `${b1}→${b2}`);
  // 分頁切到背景
  await p.evaluate(() => { Object.defineProperty(document, "hidden", { get: () => true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); }); await sleep(3300);
  const c0 = await sec(p); await sleep(100);
  await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_stats") || "null"));
  ok("切到背景：不計時、且立刻把紀錄寫進 localStorage", c0 - b2 <= 1 && raw && raw.days[today()].sec >= b2 - 1, `${b2}→${c0}，存檔 sec=${raw && raw.days[today()].sec}`);
  await sleep(2200); const c1 = await sec(p);
  ok("回到前景：又計時", c1 - c0 >= 1, `${c0}→${c1}`);
  // 答完 8 題 → 結算
  for (let k = 0; k < 8; k++) { await ans(p); await p.waitForFunction(k => window.__zy.idx > k || !document.getElementById("result").classList.contains("hidden"), k, { timeout: 9000 }).catch(() => {}); await sleep(450); }
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 9000 }).catch(() => {});
  await sleep(300); s = await st(p);
  ok("結算：星星累加進釣魚（1–3）、最佳星數", s.modes.fish.stars >= 1 && s.modes.fish.stars <= 3 && s.modes.fish.best === s.modes.fish.stars, JSON.stringify(s.modes.fish));
  const d0 = await sec(p); await sleep(3300); const d1 = await sec(p);
  ok("結算畫面：不計時", d1 === d0, `${d0}→${d1}`);
  // 家長頁
  await p.evaluate(() => { localStorage.setItem("zy1_mix", JSON.stringify({ "ㄅ|ㄆ": 4, "t:1|2": 3, "ㄓ|ㄗ": 2, "ㄌ|ㄋ": 1, "ㄏ|ㄈ": 6, "ㄧ|ㄩ": 1 })); });
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });   // 重新整理＝pagehide 補寫；mix 讀進來
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(600);
  ok("重新整理後（pagehide 補寫）：釣魚次數與星星還在", await p.evaluate(() => { const m = window.__zy.stats.modes.fish; return m && m.plays === 1 && m.stars === 3; }));
  await p.evaluate(() => { document.getElementById("settingsBtn").click(); }); await sleep(400);
  const ui = await p.evaluate(() => ({
    cols: document.querySelectorAll("#statsDays .st-day").length, today: document.querySelector("#statsDays .st-day.today .st-min")?.textContent, zero: document.querySelectorAll("#statsDays .st-day.zero").length,
    dates: [...document.querySelectorAll("#statsDays .st-date")].map(x => x.textContent).join("|"), wds: [...document.querySelectorAll("#statsDays .st-wd")].map(x => x.textContent).join("|"),
    fish: document.querySelector("#statsModes .st-row:nth-child(2)")?.textContent.replace(/\s/g, ""), none: document.querySelectorAll("#statsModes .st-row.none").length,
    mix: [...document.querySelectorAll("#mixList .mix-row")].map(x => x.textContent.replace(/\s/g, "")), name: document.getElementById("statsName").textContent,
    note: document.getElementById("statsSec").textContent.includes("只存在這台平板，不會上傳"), noann: !!document.querySelector(".dialog.settings.noann #statsSec"), anyAnn: document.querySelectorAll("#statsSec .ac").length }));
  ok("家長頁：7 天長條、最後一格是今天、有 6 天 0 分", ui.cols === 7 && /分/.test(ui.today || "") && ui.zero === 6 && /今天/.test(ui.wds) && /\d+\/\d+/.test(ui.dates), JSON.stringify(ui));
  ok("家長頁：釣魚排第一、1 次、平均星星、今天", /釣魚1次⭐[123]\.0今天/.test(ui.fish || ""), ui.fish);
  ok("家長頁：其餘 12 個遊戲「還沒玩過」（10-13 多了挑戰燈塔）", ui.none === 12, String(ui.none));
  ok("家長頁：搞混（沿用原本「容易搞混」區塊，次數多→少）", ui.mix.length >= 5 && /^ㄏ↔ㄈ6次/.test(ui.mix[0]) && /^ㄅ↔ㄆ4次/.test(ui.mix[1]), JSON.stringify(ui.mix));
  ok("家長頁：寫明只存本機不上傳、不加注音", ui.note && ui.noann && ui.anyAnn === 0 && /小熊/.test(ui.name));
  // 備份碼不帶（本機紀錄）
  const bk = await p.evaluate(() => { const c = window.__zyB.exportCode(); return { stats: /stats/.test(c), days: /"days"/.test(JSON.stringify(window.__zyB.readCode(c))) }; });
  ok("備份碼不帶遊玩紀錄", !bk.stats && !bk.days, JSON.stringify(bk));
  await p.evaluate(() => document.getElementById("settingsClose").click());
  // 換存檔位：資料分開
  await p.evaluate(() => document.getElementById("playerBtn").click()); await sleep(300);
  await p.evaluate(() => document.querySelectorAll("#playerList .player")[1].click()); await sleep(600);
  const s2 = await st(p);
  ok("換到小兔：紀錄是空的；小熊的紀錄已寫進存檔", Object.keys(s2.modes).length === 0 && (await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_stats")).modes.fish.plays)) === 1);
  await p.evaluate(() => { document.getElementById("settingsBtn").click(); }); await sleep(300);
  ok("小兔的家長頁：全部「還沒玩過」", await p.evaluate(() => document.querySelectorAll("#statsModes .st-row.none").length === 13 && !document.getElementById("statsMix") && document.getElementById("mixList").textContent.includes("還沒有資料")));
  await p.evaluate(() => document.getElementById("settingsClose").click());
  await p.evaluate(() => document.getElementById("playerBtn").click()); await sleep(300);
  await p.evaluate(() => document.querySelectorAll("#playerList .player")[0].click()); await sleep(600);
  ok("換回小熊：紀錄還在", (await st(p)).modes.fish.plays === 1);
  // 重新整理仍在、壞資料不炸
  await p.evaluate(() => localStorage.setItem("zy2_stats", '{"days":{"__proto__":{"sec":9},"2026-10-12":{"sec":"x","plays":{"fish":1e99}}},"modes":{"constructor":{"plays":3}}}'));
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 }); await sleep(300);
  ok("重新整理：小熊紀錄還在", (await st(p)).modes.fish.plays === 1);
  // 清除重來
  await p.evaluate(() => { document.getElementById("settingsBtn").click(); }); await sleep(300);
  await p.evaluate(() => { document.getElementById("resetBtn").click(); document.getElementById("resetBtn").click(); }); await sleep(500);
  ok("清除重來：遊玩紀錄一起清掉", (await p.evaluate(() => localStorage.getItem("zy1_stats"))) === null && Object.keys((await st(p)).modes).length === 0);
  allErrs.push(...errs); await ctx.close();
  await browser.close();
  for (const l of results) console.log(l);
  if (allErrs.length) console.log("ERRORS\n" + allErrs.join("\n"));
  const bad = results.filter(l => l.startsWith("FAIL")).length;
  console.log(bad || allErrs.length ? `\n${bad} FAILED / ${results.length}` : `\nALL PASS (${results.length})`);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
