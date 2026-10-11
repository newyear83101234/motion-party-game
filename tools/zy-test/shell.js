// 注音小島「外殼」測試（拋光清單 B 組）：node tools/zy-test/shell.js [--shots 輸出資料夾]
// 驗：結算按鈕延後出現、點畫面快轉、沒點也會自己演完；家長鎖（點一下不開、按住 2 秒才開）；
//     ZY2 備份三位再還原資料一致、空的那位不動；舊 ZY1 碼還原到目前這一位；超過 14 天沒備份的提醒；
//     新存檔翻牌預設 8 張；個人紀錄章（第一次玩不蓋、破紀錄才蓋）；開始畫面藏浮標／嚮導、新存檔貓頭鷹自我介紹；
//     孵蛋演出三段；夜間模式；畫面上沒有漏注音的國字。加 --shots 會順便拍截圖。
const path = require("path");
const { launch, openGame, enterMode, hudOpen, URL } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const si = process.argv.indexOf("--shots"), SHOTS = si > 0 ? process.argv[si + 1] : null;
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + ".jpg"), type: "jpeg", quality: 75 }); };
const bareHan = p => p.evaluate(() => { const r = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (!/[㐀-鿿]/.test(n.data) || !e || e.closest("script,style,.noann,.zy,.ac,.hidden,textarea")) continue; r.push(n.data.trim().slice(0, 10)); } return r; });
const visible = (p, id) => p.evaluate(id => !document.getElementById(id).classList.contains("hidden"), id);
// 翻牌 8 張一口氣配完 → 等結算出現（回傳結算出現的時間點）
async function winMatch(p) {
  await enterMode(p, "match", 8); await sleep(900);
  await p.evaluate(() => { const by = new Map(); for (const c of document.querySelectorAll("#board .card")) { const k = c._c.w.h; by.set(k, [...(by.get(k) || []), c]); } window.__pairs = [...by.values()]; });
  for (let i = 0; i < 4; i++) { await p.evaluate(i => { const [a, b] = window.__pairs[i]; a.click(); b.click(); }, i); await sleep(450); }
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 6000, polling: 30 });
}
const btnState = p => p.evaluate(() => { const b = document.getElementById("resultBtns"), a = document.getElementById("againBtn");
  return { wait: b.classList.contains("wait"), op: +getComputedStyle(b).opacity, inDom: !!a.offsetParent, done: !!(window.__zyB.rs && window.__zyB.rs.done) }; });

(async () => {
  const browser = await launch();
  // ===== 1. 結算：按鈕最後才淡入、點畫面快轉、不點也會自己演完；第一次玩不蓋紀錄章 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, stars: 3, query: "debug" });
    await winMatch(p); await sleep(250);
    const s0 = await btnState(p);
    ok("結算：一開始按鈕看不到（透明），但還在 DOM 裡可以被 click", s0.wait && s0.op < 0.05 && s0.inDom && !s0.done, JSON.stringify(s0));
    await sleep(750); await shot(p, "L-result-1-stars");
    const mid = await p.evaluate(() => ({ on: document.querySelectorAll("#resultStars .star.on").length, gray: document.querySelectorAll("#resultStars .star").length, text: document.querySelector("#resultStars").textContent }));
    ok("結算：三格星星（拿到的 .on），沒拿到不用文字 ☆", mid.gray === 3 && mid.on === 3 && !mid.text.includes("☆"), JSON.stringify(mid));
    await sleep(1300); await shot(p, "L-result-2-stickers");
    ok("結算：演出中按鈕還沒出來", (await btnState(p)).wait);
    await p.mouse.click(60, 420); await sleep(450);           // 點畫面左側（不是按鈕）＝快轉
    const s1 = await btnState(p);
    ok("結算：演出中點畫面＝快轉到最後、按鈕淡入", s1.done && !s1.wait && s1.op > 0.9, JSON.stringify(s1));
    const fin = await p.evaluate(() => ({ starsDone: document.getElementById("resultStars").classList.contains("done"), stamp: !!document.querySelector(".rec-stamp"), jar: document.querySelector("#hatchHint .jarText").textContent, best: window.__zyB.best.match }));
    ok("結算：快轉後星星罐是最後的數字（3＋3＝6/10）", fin.jar === "6/10", fin.jar);
    ok("個人紀錄：第一次玩翻牌不蓋「新紀錄」、但記下最佳 3 星", !fin.stamp && fin.best === 3, JSON.stringify(fin));
    ok("結算：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await shot(p, "L-result-3-final");
    for (const [w, h, t] of [[1024, 768, "43"], [820, 1180, "P"]]) {      // 結算按鈕跟右下星星罐不能疊在一起
      await p.setViewportSize({ width: w, height: h }); await sleep(400); await shot(p, t + "-result-final");
      const hit = await p.evaluate(() => { const j = document.getElementById("hatchHint").getBoundingClientRect(); return [...document.querySelectorAll("#resultBtns button")].some(b => { const r = b.getBoundingClientRect(); return r.left < j.right && r.right > j.left && r.top < j.bottom && r.bottom > j.top; }); });
      ok(`${t} 結算：按鈕跟星星罐沒有疊在一起`, !hit);
    }
    await p.setViewportSize({ width: 1180, height: 820 });
    ok("沒有錯誤（結算段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  {
    // 不點畫面：自己演完；貼紙全部收集過 → 沒有新貼紙，列出練過的詞
    const { ctx, p, errs } = await openGame(browser, { stickers: 999, stars: 0, query: "debug" });
    await winMatch(p); await sleep(300);
    ok("結算（第 2 次）：同樣先藏按鈕", (await btnState(p)).wait);
    await p.waitForFunction(() => !document.getElementById("resultBtns").classList.contains("wait"), null, { timeout: 9000, polling: 100 }).catch(() => {});
    const s2 = await btnState(p);
    ok("結算：不點也會自己演完、按鈕出現", s2.done && !s2.wait, JSON.stringify(s2));
    ok("結算：沒有新貼紙時列出練過的詞＋一句話", await p.evaluate(() => document.querySelectorAll("#resultStickers .sticker.mini").length >= 1 && !!document.querySelector("#resultStickers .all-done")), await p.evaluate(() => document.querySelector("#resultStickers .all-done")?.textContent || ""));
    ok("結算：全部收集過＝「都收集過了，好厲害！」", (await p.evaluate(() => document.querySelector("#resultStickers .all-done")?.textContent || "")).includes("都收集過了"));
    ok("結算（沒新貼紙）：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await shot(p, "L-result-4-practiced");
    await p.setViewportSize({ width: 820, height: 1180 }); await sleep(500); await shot(p, "P-result-practiced");
    ok("沒有錯誤（結算段 2）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 個人紀錄章：之前最佳 1 星 → 這次 3 星＝蓋「新紀錄！」＋存進存檔 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug" });
    await p.evaluate(() => localStorage.setItem("zy1_best", JSON.stringify({ match: 1 }))); await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"));
    await p.evaluate(() => document.getElementById("startBtn").click()); await sleep(200);
    await winMatch(p); await sleep(2100);
    const r = await p.evaluate(() => ({ stamp: document.querySelector("#resultStars .rec-stamp")?.textContent || "", best: JSON.parse(localStorage.getItem("zy1_best") || "{}") }));
    ok("個人紀錄：破紀錄蓋「新紀錄！」章、存檔最佳變 3", r.stamp.includes("新紀錄") && r.best.match === 3, JSON.stringify(r));
    ok("個人紀錄章：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await shot(p, "L-result-5-record");
    ok("沒有錯誤（紀錄段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 3. 家長鎖（不帶 ?debug：真的要按住）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "" });
    await hudOpen(p, "R");   // ⚙️ 平常收在右上「⋯」裡：先展開才按得到
    const c = await p.evaluate(() => { const r = document.getElementById("settingsBtn").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(200);
    ok("家長鎖：程式 click 一下（非 debug）不會開", !(await visible(p, "settings")));
    await p.mouse.move(c.x, c.y); await p.mouse.down(); await sleep(150); await p.mouse.up(); await sleep(150);
    const tap = await p.evaluate(() => ({ open: !document.getElementById("settings").classList.contains("hidden"), nudge: document.getElementById("settingsBtn").classList.contains("nudge"), tip: !document.getElementById("lockTip").classList.contains("hidden") }));
    ok("家長鎖：點一下不開，只晃一下＋小字提示", !tap.open && tap.nudge && tap.tip, JSON.stringify(tap));
    await shot(p, "L-lock-1-tap");
    await p.mouse.down(); await sleep(1000);
    const half = await p.evaluate(() => ({ open: !document.getElementById("settings").classList.contains("hidden"), holding: document.getElementById("settingsBtn").classList.contains("holding"), p: +getComputedStyle(document.getElementById("settingsBtn")).getPropertyValue("--p") }));
    ok("家長鎖：按住 1 秒＝進度環跑一半、還沒開", !half.open && half.holding && half.p > 0.35 && half.p < 0.75, JSON.stringify(half));
    await shot(p, "L-lock-2-hold");
    await sleep(1250);
    ok("家長鎖：按住 2 秒＝打開家長設定", await visible(p, "settings"));
    await p.mouse.up(); await sleep(300);
    ok("家長鎖：放開後設定還開著（不會被放開那下關掉）", await visible(p, "settings"));
    ok("沒有錯誤（家長鎖段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 4. ZY2 備份三位 → 弄亂 → 還原＝一致；空的那位不動；ZY1 舊碼還原到目前這一位 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 30, stars: 7, eggs: 1, query: "debug" });
    await p.evaluate(() => {
      localStorage.setItem("zy1_best", JSON.stringify({ fish: 3, match: 2 })); localStorage.setItem("zy1_match_size", "16");
      localStorage.setItem("zy2_stickers", JSON.stringify({ "貓": 1, "狗": 1, "魚": 1 })); localStorage.setItem("zy2_stars", "15"); localStorage.setItem("zy2_eggs", "0"); localStorage.setItem("zy2_best", JSON.stringify({ tone: 1 })); localStorage.setItem("zy2_match_size", "24");
    });
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden")); await p.evaluate(() => document.getElementById("startBtn").click());
    const before = await p.evaluate(() => [1, 2, 3].map(n => ["stickers", "stars", "eggs", "best", "match_size"].map(k => localStorage.getItem(`zy${n}_${k}`) || "").join("|")));
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.getElementById("backupBtn").click(); }); await sleep(200);
    const code = await p.evaluate(() => document.getElementById("saveCode").value);
    const dec = await p.evaluate(c => window.__zyB.readCode(c), code);
    ok("ZY2：一個碼包含三位", code.startsWith("ZY2:") && dec && dec.v === 2 && dec.slots.length === 3 && Object.keys(dec.slots[0].stickers).length === 30 && dec.slots[1].stars === 15, code.slice(0, 14) + "…");
    ok("ZY2：按備份會記下日期、顯示「今天」", await p.evaluate(() => Date.now() - +localStorage.getItem("zy_last_backup") < 5000 && document.getElementById("lastBackup").textContent.includes("今天")));
    // 弄亂：第 1、2 位改掉；第 3 位這台平板上有新進度（備份裡是空的 → 還原時不能動它）
    await p.evaluate(() => { localStorage.setItem("zy1_stickers", "{}"); localStorage.setItem("zy1_stars", "0"); localStorage.setItem("zy2_stars", "999"); localStorage.setItem("zy3_stickers", JSON.stringify({ "牛": 1 })); localStorage.setItem("zy3_stars", "4"); });
    await p.evaluate(c => { const ta = document.getElementById("saveCode"); ta.value = c; document.getElementById("restoreBtn").click(); }, code); await sleep(150);
    const pre = await p.evaluate(() => ({ msg: document.getElementById("saveMsg").textContent, armed: document.getElementById("restoreBtn").classList.contains("armed"), s1: localStorage.getItem("zy1_stars") }));
    ok("ZY2 還原第 1 下：先說明會還原哪幾位（小熊、小兔；小貓空的不動），還沒寫入", pre.armed && pre.msg.includes("小熊") && pre.msg.includes("小兔") && pre.msg.includes("小貓的備份是空的") && pre.s1 === "0", pre.msg);
    await shot(p, "L-settings-restore-confirm");
    await p.evaluate(() => document.getElementById("restoreBtn").click()); await sleep(200);
    const after = await p.evaluate(() => [1, 2, 3].map(n => ["stickers", "stars", "eggs", "best", "match_size"].map(k => localStorage.getItem(`zy${n}_${k}`) || "").join("|")));
    ok("ZY2 還原第 2 下：第 1、2 位跟備份時一模一樣", after[0] === before[0] && after[1] === before[1], JSON.stringify({ before: before.slice(0, 2).map(s => s.slice(0, 60)), after: after.slice(0, 2).map(s => s.slice(0, 60)) }));
    ok("ZY2 還原：備份裡空的第 3 位不動（這台平板上的新進度還在）", after[2].startsWith('{"牛":1}|4'), after[2]);
    ok("ZY2 還原：選單顯示目前這位 30 張", (await p.evaluate(() => document.getElementById("menuStickers").textContent)) === "30");
    // 夾換行、塞假詞、超大數字的 ZY2 → 照樣擋
    const evil = "ZY2:" + Buffer.from(JSON.stringify({ v: 2, p: [{ s: ["貓", "假詞", "<img>"], st: 9e15, eg: 999, b: { fish: 99, hack: 3 }, i: ["fish", "x"], m: 999 }, null, 5] })).toString("base64");
    const ev = await p.evaluate(c => window.__zyB.readCode(c.slice(0, 9) + "\n  " + c.slice(9)), evil);
    ok("ZY2：只收詞庫的詞、數字有上限、不認得的模式丟掉、去空白", ev && Object.keys(ev.slots[0].stickers).join() === "貓" && ev.slots[0].stars === 99999 && ev.slots[0].eggs <= 8 && JSON.stringify(ev.slots[0].best) === '{"fish":3}' && ev.slots[0].matchSize === 8 && ev.slots[1] === null && ev.slots[2] === null, JSON.stringify(ev && ev.slots[0]));
    // 舊 ZY1 碼：換到第 2 位 → 還原只動第 2 位
    const zy1 = "ZY1:" + Buffer.from(JSON.stringify({ v: 1, s: ["貓", "狗", "魚", "鳥"], st: 12, eg: 1 })).toString("base64");
    await p.evaluate(() => { document.getElementById("settings").classList.add("hidden"); document.getElementById("playerBtn").click(); }); await sleep(150);
    await p.evaluate(() => document.querySelectorAll("#playerList .player")[1].click()); await sleep(300);
    const s1Before = await p.evaluate(() => localStorage.getItem("zy1_stickers"));
    await p.evaluate(c => { document.getElementById("settingsBtn").click(); const ta = document.getElementById("saveCode"); ta.classList.remove("hidden"); ta.value = c; document.getElementById("restoreBtn").click(); }, zy1); await sleep(200);
    const o = await p.evaluate(() => ({ st: Object.keys(JSON.parse(localStorage.getItem("zy2_stickers"))).length, stars: localStorage.getItem("zy2_stars"), eggs: localStorage.getItem("zy2_eggs"), msg: document.getElementById("saveMsg").textContent, s1: localStorage.getItem("zy1_stickers") }));
    ok("舊 ZY1 碼：一按就還原到目前這位（小兔）、其他位不動", o.st === 4 && o.stars === "12" && o.eggs === "1" && o.msg.includes("小兔") && o.s1 === s1Before, JSON.stringify({ ...o, s1: o.s1 && o.s1.length }));
    ok("沒有錯誤（備份段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 5. 超過 14 天沒備份的提醒 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 12, query: "debug" });
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); });
    ok("從沒備份過＋有進度 → 提醒「還沒有備份過」", await p.evaluate(() => !document.getElementById("backupNag").classList.contains("hidden") && document.getElementById("backupNag").textContent.includes("還沒有備份")));
    await p.evaluate(() => { document.getElementById("settings").classList.add("hidden"); localStorage.setItem("zy_last_backup", String(Date.now() - 15 * 864e5)); document.getElementById("settingsBtn").click(); }); await sleep(250);
    const n = await p.evaluate(() => ({ nag: !document.getElementById("backupNag").classList.contains("hidden"), t: document.getElementById("backupNag").textContent, last: document.getElementById("lastBackup").textContent }));
    ok("15 天前備份 → 家長畫面提醒、寫「上次備份：15 天前」", n.nag && n.t.includes("15 天") && n.last.includes("15 天前"), JSON.stringify(n));
    await shot(p, "L-settings");
    await p.setViewportSize({ width: 820, height: 1180 }); await sleep(400); await shot(p, "P-settings");
    const seg = await p.evaluate(() => { const r = [...document.querySelectorAll("#hintOpts .opt")].map(b => Math.round(b.getBoundingClientRect().top)); return new Set(r).size; });
    ok("直式：秒數四格分段膠囊不斷行", seg === 1, "列數 " + seg);
    await p.setViewportSize({ width: 1180, height: 820 });
    await p.evaluate(() => document.getElementById("backupBtn").click()); await sleep(200);
    ok("按「備份全部」後提醒消失", await p.evaluate(() => document.getElementById("backupNag").classList.contains("hidden")));
    await p.evaluate(() => { document.getElementById("settings").classList.add("hidden"); localStorage.setItem("zy_last_backup", String(Date.now() - 10 * 864e5)); document.getElementById("settingsBtn").click(); }); await sleep(200);
    ok("10 天前備份 → 不提醒", await p.evaluate(() => document.getElementById("backupNag").classList.contains("hidden")));
    ok("沒有錯誤（提醒段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 6. 新存檔翻牌預設 8 張；選張數畫面；換人小字；圖鑑 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, stars: 0, query: "debug" });
    await p.evaluate(() => { localStorage.setItem("zy2_stickers", JSON.stringify(Object.fromEntries(["貓","狗","魚","鳥","牛","馬","羊","豬","雞","鴨","熊","蛇"].map(h => [h, 1])))); localStorage.removeItem("zy2_match_size"); });
    await p.evaluate(() => document.getElementById("playerBtn").click()); await sleep(150);
    await p.evaluate(() => document.querySelectorAll("#playerList .player")[1].click()); await sleep(300);
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=match]").click()); await sleep(350);
    const pick = await p.evaluate(() => ({ open: !document.getElementById("matchPick").classList.contains("hidden"), on: document.querySelector("#matchSizes .msize.on")?.textContent || "", stacks: [...document.querySelectorAll("#matchSizes .mstack")].map(s => s.children.length) }));
    ok("新存檔翻牌預設 8 張（簡單）、圖示是 1／2／3 張疊起來的牌", pick.open && pick.on.includes("8") && JSON.stringify(pick.stacks) === "[1,2,3]", JSON.stringify(pick));
    await shot(p, "L-matchpick");
    ok("選張數：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await p.evaluate(() => document.getElementById("matchPick").classList.add("hidden"));
    await hudOpen(p, "R");   // 🐻／「換人」平常收在右上「⋯」裡：先展開
    const tag = await p.evaluate(() => { const t = document.getElementById("playerTag"), b = document.getElementById("playerBtn"), r = t.getBoundingClientRect(), q = b.getBoundingClientRect(); return { shown: getComputedStyle(t).display !== "none" && getComputedStyle(t).visibility !== "hidden", below: r.top >= q.top + q.height * 0.6, cx: Math.abs((r.left + r.right) / 2 - (q.left + q.right) / 2) < 4 }; });
    ok("換人：頭像下方有「換人」小字", tag.shown && tag.below && tag.cx, JSON.stringify(tag));
    await p.evaluate(() => document.getElementById("playerTag").click()); await sleep(200);
    ok("換人：點「換人」小字也會開換人", await visible(p, "players"));
    await p.evaluate(() => document.getElementById("players").classList.add("hidden"));
    // 圖鑑：沒有 ⬅（🏠 回小島）、貼紙大圖
    await p.evaluate(() => document.querySelectorAll("#playerList .player")[0].click()); await sleep(300);   // 換回小熊（40 張）
    await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(700);
    const al = await p.evaluate(() => ({ back: getComputedStyle(document.getElementById("albumBack")).display, em: parseFloat(getComputedStyle(document.querySelector("#albumGrid .sticker:not(.empty) .em")).fontSize) / (Math.min(innerWidth, innerHeight) / 100), tilt: document.querySelector("#albumGrid .sticker:not(.empty)").style.rotate }));
    ok("圖鑑：沒有 ⬅（只留 🏠）、貼紙圖 8.5vmin、有歪一點", al.back === "none" && Math.abs(al.em - 8.5) < 0.2 && /deg/.test(al.tilt), JSON.stringify(al));
    await shot(p, "L-album");
    await p.setViewportSize({ width: 820, height: 1180 }); await sleep(500);
    const tabs = await p.evaluate(() => new Set([...document.querySelectorAll("#albumTabs .tab")].map(t => Math.round(t.getBoundingClientRect().top))).size);
    ok("圖鑑直式：五個分頁同一行", tabs === 1, "列數 " + tabs);
    await shot(p, "P-album");
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(600);
    await shot(p, "P-menu");
    await p.setViewportSize({ width: 1180, height: 820 }); await sleep(600);
    // 音樂關掉看得出來
    await hudOpen(p, "L");   // 🎵 平常收在左上「⋯」裡：先展開
    await p.evaluate(() => document.getElementById("musicBtn").click()); await sleep(350);
    const mu = await p.evaluate(() => { const b = document.getElementById("musicBtn"); return { off: b.classList.contains("off"), op: getComputedStyle(b).opacity, slash: getComputedStyle(b, "::after").backgroundColor, bg: getComputedStyle(b).backgroundColor }; });
    ok("音樂關掉：白底不透明＋紅斜線", mu.off && mu.op === "1" && mu.slash === "rgb(224, 80, 80)" && mu.bg === "rgb(255, 255, 255)", JSON.stringify(mu));
    await shot(p, "L-menu-musicoff");
    await p.evaluate(() => document.getElementById("musicBtn").click());
    // 「換人」小字在橫式／直式／4:3 都不能蓋到膠囊、圓鈕、嚮導、浮標（小島 agent 回報直式蓋到星星罐）
    for (const [w, h, t] of [[1180, 820, "L"], [820, 1180, "P"], [1024, 768, "43"]]) {
      await p.setViewportSize({ width: w, height: h }); await sleep(900);
      const hit = await p.evaluate(() => { const r = document.getElementById("playerTag").getBoundingClientRect(), bad = [];
        for (const s of ["#menu > .menu-bottom", "#resumeBtn", "#homeBtn", "#musicBtn", "#playerBtn", "#settingsBtn", "#guideText", "#guide img", ".hub-tag:not(.civic)"]) for (const e of document.querySelectorAll(s)) {
          if (!e.offsetParent && getComputedStyle(e).position !== "fixed") continue; const q = e.getBoundingClientRect(); if (!q.width) continue;
          if (r.left < q.right - 1 && r.right > q.left + 1 && r.top < q.bottom - 1 && r.bottom > q.top + 1) bad.push(s + (e.dataset.mode ? ":" + e.dataset.mode : "")); }
        return { bad, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; });
      ok(`${t} 選單：「換人」小字沒有蓋到其他東西、在畫面內`, hit.bad.length === 0 && hit.inside, JSON.stringify(hit));
      await shot(p, t + "-menu-playertag");
    }
    await p.setViewportSize({ width: 1180, height: 820 }); await sleep(400);
    ok("沒有錯誤（選單段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 7. 開始畫面：藏浮標／嚮導、只有一個標題；新存檔貓頭鷹自我介紹；空星星罐 =====
  for (const [W, H, tag] of [[1180, 820, "L"], [820, 1180, "P"]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript(() => { window.__spoken = []; const fake = { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, speak(u) { if (u.text.trim()) window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 250); } }; Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true }); });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto(URL + "?debug"); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 20000 }); await sleep(900);
    const g = await p.evaluate(() => { const vis = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none"; };
      const titles = [...document.querySelectorAll(".sg-title, #menu > h1")].filter(e => getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden").length;
      return { gate: document.body.classList.contains("gate-on") && !document.getElementById("startGate").classList.contains("hidden"), tags: vis(".hub-tags"), guide: vis("#guide"), round: vis("#settingsBtn"), titles, blur: getComputedStyle(document.getElementById("startGate")).backdropFilter }; });
    ok(`${tag} 開始畫面：浮標、嚮導、圓鈕都藏起來，只有一個標題，毛玻璃`, g.gate && !g.tags && !g.guide && !g.round && g.titles === 1 && /blur/.test(g.blur || ""), JSON.stringify(g));
    await shot(p, tag + "-start");
    await p.evaluate(() => document.getElementById("startBtn").click()); await sleep(700);
    const a = await p.evaluate(() => ({ gate: document.body.classList.contains("gate-on"), guide: getComputedStyle(document.getElementById("guide")).visibility, said: window.__spoken.join("/"), jarEmpty: document.querySelector("#menu .jar").classList.contains("empty") }));
    ok(`${tag} 按開始玩：浮標／嚮導回來、新存檔貓頭鷹自我介紹、空罐子有虛線星`, !a.gate && a.guide === "visible" && a.said.includes("我是貓頭鷹老師") && a.jarEmpty, JSON.stringify(a));
    if (tag === "L") {
      await shot(p, "L-menu-newplayer-emptyjar");
      await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 20000 });
      await p.evaluate(() => { window.__spoken = []; document.getElementById("startBtn").click(); }); await sleep(600);
      const said2 = await p.evaluate(() => window.__spoken.join("/"));
      ok("自我介紹只講一次（第二次開不再講）", !said2.includes("我是貓頭鷹老師"), said2);
    }
    ok(`${tag} 開始畫面段沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 8. 孵蛋演出三段（playHatchShow 可重複用）＋讀取畫面＋夜間 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "debug&night=1" });
    await p.evaluate(() => { window.__hatched = false; window.__zyB.playHatchShow("IMAGE/zhuyin/cust_fox.webp", "小狐狸").then(() => { window.__hatched = true; }); });
    // 3D 小島在背景渲染時 headless 計時器會慢：用「等到某一段出現」而不是固定秒數
    const stageOf = cls => p.waitForFunction(c => document.getElementById("hatchEgg").classList.contains(c) && document.getElementById("hatchEgg").className, cls, { timeout: 4000, polling: 20 }).then(h => h.jsonValue(), () => p.evaluate(() => "逾時：" + document.getElementById("hatchEgg").className));
    const h1 = await stageOf("s1"); await sleep(150); await shot(p, "L-hatch-1-shake");
    const h2 = await stageOf("s2"); await sleep(500); await shot(p, "L-hatch-2-crack");
    await p.waitForFunction(() => document.querySelector(".hatchBox").classList.contains("out"), null, { timeout: 5000 }).catch(() => {});
    const h3 = await p.evaluate(() => ({ egg: document.getElementById("hatchEgg").className, out: document.querySelector(".hatchBox").classList.contains("out"), friend: !document.getElementById("hatchFriend").classList.contains("hidden"), name: document.getElementById("hatchName").textContent, close: !document.getElementById("hatchClose").classList.contains("hidden"), bg: getComputedStyle(document.querySelector(".hatchBox")).backgroundColor }));
    await sleep(500); await shot(p, "L-hatch-3-out");
    ok("孵蛋：第 1 段晃（s1）", /\bs1\b/.test(h1) && !/ck1/.test(h1), h1);
    ok("孵蛋：第 2 段起有裂痕（s2＋ck1）", /\bs2\b/.test(h2) && /ck1/.test(h2), h2);
    ok("孵蛋：破殼＝朋友＋放射光＋名字、沒有白方框", h3.out && h3.friend && h3.name.includes("小狐狸") && h3.close && /gone/.test(h3.egg) && h3.bg === "rgba(0, 0, 0, 0)", JSON.stringify(h3));
    ok("孵蛋：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await p.evaluate(() => document.getElementById("hatchClose").click()); await sleep(200);
    ok("孵蛋：按「太棒了」關掉＝Promise 結束", await p.evaluate(() => window.__hatched && document.getElementById("hatch").classList.contains("hidden")));
    // 夜間
    await enterMode(p, "fish"); await sleep(300);
    const nt = await p.evaluate(() => ({ night: document.body.classList.contains("night"), sky: !!document.querySelector("#fish > .night-sky"), stars: document.querySelectorAll("#fish > .night-sky i").length, iso: getComputedStyle(document.getElementById("fish")).isolation }));
    ok("夜間（?night=1）：遊戲背景有藍紫濾鏡層＋會閃的星星", nt.night && nt.sky && nt.stars >= 5 && nt.iso === "isolate", JSON.stringify(nt));
    await shot(p, "L-night-fish");
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(400);
    // 讀取畫面（假裝載到一半）
    await p.evaluate(() => { const l = document.getElementById("loading"); l.classList.remove("hidden"); document.getElementById("ldFill").style.width = "45%"; }); await sleep(400);
    const ld = await p.evaluate(() => ({ owl: getComputedStyle(document.getElementById("ldOwl")).display, w: document.getElementById("ldFill").style.width }));
    ok("讀取畫面：有貓頭鷹、進度條是真的寬度", ld.owl === "block" && ld.w === "45%", JSON.stringify(ld));
    await shot(p, "L-loading");
    await p.evaluate(() => document.getElementById("loading").classList.add("hidden"));
    ok("開頁進度：記下這次載入的檔案數（下次當總數）", +(await p.evaluate(() => localStorage.getItem("zy_ld_total"))) >= 10, await p.evaluate(() => localStorage.getItem("zy_ld_total")));
    ok("沒有錯誤（孵蛋／夜間段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "debug&night=0" });
    await enterMode(p, "fish");
    ok("白天（?night=0）：沒有夜間層", await p.evaluate(() => !document.body.classList.contains("night") && !document.querySelector("#fish > .night-sky")));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n")); const f = out.filter(r => r.startsWith("FAIL")).length; console.log(f ? `${f} FAILED / ${out.length}` : `ALL PASS (${out.length})`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.log(out.join("\n")); console.error("FATAL", e.message); process.exit(1); });
