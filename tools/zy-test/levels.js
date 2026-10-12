// v6 難度等級／金星沙漏／爬塔介面測試：node tools/zy-test/levels.js（docs/zhuyin-v6-plan.md §1、§2）
// 驗：等級解鎖（3 星開下一級、解鎖卡、配音）、星星規則、升級／暖身／加碼／防刷星、舊存檔 best 3 星開到 Lv2、備份碼帶 lv（清洗）、
//     各級參數生效（魚數、魚會游、翻牌張數與預覽、氣球 5 顆與會飄、地鼠敲幾下、荷葉片數與順序陷阱、點餐兩樣、尋寶 12 個、積木易混符號）、
//     聽音題干擾不用 ㄣㄥ/ㄢㄤ/ㄓㄗ/ㄕㄙ/ㄔㄘ 差別＋最多 1 個只差聲調、金星沙漏（跑完只變銀不算錯、0.3 秒寬限、暫停凍結、🔊 暫停）、
//     介紹卡等級徽章、繼續玩記得等級、playFloor（Result 正確、不給貼紙／星星／best／lv、heart 逾時事件、abort、暫停選單「離開挑戰」、flash、指定題目）
const { launch, openGame, enterMode } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SEL = { fish: "#pond .fishBtn", order: "#shelf .item", hunt: "#scene .obj", tone: "#sky .balloon" };
const tapEl = "e => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }))";
// 點目前題目的正確／錯的選項（DOM 順序＝curOpts 順序）；點餐兩樣：right 時點第一個還沒拿的
const answer = (p, m, right) => p.evaluate(({ m, right, sel, tap }) => { const T = eval(tap); const o = window.__zy.curOpts; const i = o.findIndex(x => (!!x.ok === right) && !x.taken); const e = document.querySelectorAll(sel)[i]; if (!e) return false; T(e); return true; }, { m, right, sel: SEL[m], tap: tapEl });
const waitIdx = (p, n, t = 6000) => p.waitForFunction(n => window.__zy.idx === n, n, { timeout: t });
const resultShown = p => p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 15000 });
const bareHan = p => p.evaluate(() => { const r = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (!/[㐀-鿿]/.test(n.data) || !e || e.closest("script,style,.noann,.zy,.ac,.hidden,textarea")) continue; r.push(n.data.trim().slice(0, 10)); } return r; });
// 一題一題答完釣魚（每題都一次就對），回傳結算出現
async function clearFish(p, n = 8) {
  for (let k = 0; k < n; k++) { await p.waitForFunction(() => window.__zy.curOpts, null, { timeout: 6000 }); await answer(p, "fish", true); if (k < n - 1) await waitIdx(p, k + 1); }
}

(async () => {
  const browser = await launch();
  // ===== 1. 等級解鎖、星星規則、升級規則、舊存檔、備份碼 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, stars: 0, query: "debug" });
    ok("新存檔：釣魚 Lv1（max 1）", await p.evaluate(() => { const r = window.__zy.lvRec("fish"); return r.max === 1 && r.cur === 1; }));
    await enterMode(p, "fish", { lv: 1 });
    ok("Lv1＝原本：4 條魚、沒有沙漏", await p.evaluate(() => document.querySelectorAll("#pond .fishBtn").length === 4 && !window.__zy.hg.shown && !window.__zy.hg.on));
    await clearFish(p);
    await resultShown(p); await sleep(900);
    await p.evaluate(() => document.getElementById("result").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(800);   // 快轉到最後
    const up = await p.evaluate(() => ({ lv: window.__zy.lv.fish, ov: !document.getElementById("lvUp")?.classList.contains("hidden"), t: document.getElementById("lvUp")?.textContent || "", stars: document.querySelectorAll("#resultStars .star.on").length, jar: document.querySelector("#hatchHint .jarText").textContent }));
    ok("Lv1 全對 3 星 → 開 Lv2（max 2、cur 2、Lv1 最佳 3）", up.stars === 3 && up.lv.max === 2 && up.lv.cur === 2 && up.lv.st[1] === 3, JSON.stringify(up.lv));
    ok("解鎖卡：「🎉 第 2 級打開了！」＋新東西說明", up.ov && up.t.includes("第") && up.t.includes("級打開了") && up.t.includes("長得像的注音變多了"), up.t);
    ok("Lv1 3 星沒有加碼（星星罐 3/10）", up.jar === "3/10", up.jar);
    ok("解鎖卡：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await sleep(2500);
    const said = await p.evaluate(() => window.__spoken.map(s => s.text));
    ok("解鎖配音：唸「第二級打開了！」＋新東西", said.includes("第二級打開了！") && said.includes("長得像的注音變多了！"), said.join("/"));
    await p.evaluate(() => document.getElementById("againBtn").click()); await p.waitForFunction(() => window.__zy.mode === "fish" && window.__zy.curOpts, null, { timeout: 8000 });
    ok("再玩＝直接玩新開的 Lv2", await p.evaluate(() => window.__zy.lvNow === 2));
    ok("Lv2：題目 level 至少 2（干擾變像）", await p.evaluate(() => window.__zy.round.every(q => q.level >= 2)));
    // 星星規則（§2.2）
    const st = await p.evaluate(() => { const f = window.__zy.lvStars; return [f(7, 8, 1), f(6, 8, 1), f(4, 8, 1), f(3, 8, 1), f(7, 8, 4), f(8, 8, 5), f(7, 8, 5), f(6, 8, 5), f(5, 8, 5), f(5, 6, 3), f(4, 6, 5)].join(","); });
    ok("星星：Lv1–4 金≥n−1 3 星、≥⌈n/2⌉ 2 星；Lv5 全金 3 星、≥n−2 2 星", st === "3,2,2,1,3,3,2,2,1,3,2", st);
    // 升級規則（直接呼叫結算用的 lvAfter）
    const rule = await p.evaluate(() => { const z = window.__zy; z.setLv("tone", 2); const a = [z.lvAfter("tone", 2, 2), z.lvAfter("tone", 2, 2)].map(r => r.up); const b = z.lvAfter("tone", 2, 2);
      z.setLv("whack", 3); const c = z.lvAfter("whack", 3, 1), d = z.lvAfter("whack", 3, 1);
      z.setLv("frog", 4); const e = z.lvAfter("frog", 2, 3); z.setLv("frog", 3); const f = z.lvAfter("frog", 3, 3); z.setLv("frog", 5); const g = z.lvAfter("frog", 5, 3), h = z.lvAfter("frog", 4, 2);
      return { twoTwo: a, third: b.up, tone: z.lv.tone.max, warm: [c.warm, d.warm], low: [e.low, e.jar], l3: f.jar, l5: g.jar, l4two: h.jar, frogMax: z.lv.frog.max }; });
    ok("max 級連續 3 次 2 星也升級", rule.twoTwo.join() === "0,0" && rule.third === 3 && rule.tone === 3, JSON.stringify(rule));
    ok("max 級連 2 次 1 星 → 建議回上一級暖身（不強迫）", rule.warm.join() === "0,2", JSON.stringify(rule.warm));
    ok("防刷星：比 max 低 2 級以上＝暖身，星星罐最多 1 顆", rule.low[0] === true && rule.low[1] === 1, JSON.stringify(rule.low));
    ok("高等級加碼：3 星 Lv3 放 4 顆、Lv5 放 5 顆、2 星不加碼", rule.l3 === 4 && rule.l5 === 5 && rule.l4two === 2 && rule.frogMax === 5, JSON.stringify(rule));
    // 舊存檔：best 已經 3 星 → 直接開到 Lv2
    await p.evaluate(() => { localStorage.setItem("zy1_best", JSON.stringify({ hunt: 3, order: 2 })); localStorage.removeItem("zy1_lv"); }); await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"));
    const old = await p.evaluate(() => ({ hunt: window.__zy.lvRec("hunt"), order: window.__zy.lvRec("order") }));
    ok("舊存檔 best 3 星 → 開到 Lv2（2 星的還是 Lv1）", old.hunt.max === 2 && old.hunt.cur === 2 && old.hunt.st[1] === 3 && old.order.max === 1, JSON.stringify(old));
    // 備份碼帶 lv（清洗）
    await p.evaluate(() => { const z = window.__zy; z.setLv("fish", 4); z.setLv("match", 3); });
    const code = await p.evaluate(() => window.__zyB.exportCode());
    const dec = await p.evaluate(c => window.__zyB.readCode(c), code);
    ok("備份碼 ZY2 帶 lv", dec && dec.slots[0].lv && dec.slots[0].lv.fish.max === 4 && dec.slots[0].lv.match.max === 3, JSON.stringify(dec && dec.slots[0].lv));
    const evil = "ZY2:" + Buffer.from(JSON.stringify({ v: 2, p: [{ s: ["貓"], st: 1, lv: { fish: { max: 99, cur: 7, st: { 1: 9, 7: 3, x: 2 }, two: 5 }, hack: { max: 3 }, tone: "壞掉" } }] })).toString("base64");
    const ev = await p.evaluate(c => window.__zyB.readCode(c), evil);
    ok("備份碼 lv 清洗：級數夾 1..5、星數夾 1..3、不認得的模式丟掉", ev && JSON.stringify(ev.slots[0].lv) === JSON.stringify({ fish: { max: 5, cur: 5, st: { 1: 3 }, two: 2, one: 0 } }), JSON.stringify(ev && ev.slots[0].lv));
    await p.evaluate(() => localStorage.setItem("zy1_lv", "{}"));
    const r = await p.evaluate(c => window.__zyB.importCode(c), code);
    ok("還原備份碼＝等級回來", r === "ok" && await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_lv")).fish.max === 4), r);
    ok("沒有錯誤（等級段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 各級參數生效、聽音題干擾規則 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 60, query: "debug&no3d" });
    await enterMode(p, "fish", { lv: 5 });
    const f5 = await p.evaluate(() => ({ n: document.querySelectorAll("#pond .fishBtn").length, prompt: document.getElementById("fishPrompt").textContent }));
    ok("釣魚 Lv5：6 條魚、題目圖藏起來（👂）", f5.n === 6 && f5.prompt === "👂", JSON.stringify(f5));
    await enterMode(p, "fish", { lv: 3 }); await sleep(1800);
    const sw0 = await p.evaluate(() => [...document.querySelectorAll("#pond .fishBtn")].map(b => b.style.translate).join("|")); await sleep(500);
    const sw1 = await p.evaluate(() => [...document.querySelectorAll("#pond .fishBtn")].map(b => b.style.translate).join("|"));
    ok("釣魚 Lv3：5 條魚、魚會游", await p.evaluate(() => document.querySelectorAll("#pond .fishBtn").length === 5) && sw0 && sw0 !== sw1, sw0.slice(0, 60));
    // 聽音題：干擾不用 ㄣㄥ/ㄢㄤ/ㄓㄗ/ㄕㄙ/ㄔㄘ 的差別、只差聲調最多 1 個（抽 5 個等級 × 每級 3 局的第 1 題）
    let bad = [];
    for (const lv of [1, 3, 4, 5]) for (let k = 0; k < 3; k++) {
      await enterMode(p, "fish", { lv }); await sleep(300);
      bad = bad.concat(await p.evaluate(() => { const z = window.__zy, o = z.curOpts, t = o.find(x => x.ok), tk = z.earKey(t.syls); const ear = o.filter(x => !x.ok && z.earKey(x.syls) === tk);
        const out = []; if (ear.length > 1) out.push("只差聲調 " + ear.length + " 個"); for (const x of ear) if (!x.toneFake) out.push("耳朵分不出：" + z.zToStr(x.syls) + " vs " + z.zToStr(t.syls)); return out; }));
    }
    ok("聽音題干擾：沒有耳朵分不出的、只差聲調最多 1 個（釣魚 12 題）", bad.length === 0, bad.join("；"));
    const pd = await p.evaluate(() => { const z = window.__zy, bad = []; for (let k = 0; k < 200; k++) { for (const t of ["ㄕㄢ", "ㄓㄨㄥ", "ㄘㄠˇ"]) { const d = z.pickDistractors(t, 1 + (k % 3), 5); const tk = z.earKey(z.parseZ(t)); const ear = d.filter(x => z.earKey(z.parseZ(x)) === tk); if (ear.length > 1 || ear.some(x => z.parseZ(x).map(s => s.sym).join() !== z.parseZ(t).map(s => s.sym).join())) bad.push(t + ":" + d.join("/")); } } return bad.slice(0, 3); });
    ok("地鼠／青蛙干擾（pickDistractors）：ㄕㄢ 不出 ㄙㄢ/ㄕㄤ、ㄓㄨㄥ 不出 ㄗㄨㄥ/ㄓㄨㄣ", pd.length === 0, pd.join(" "));
    await enterMode(p, "match", { lv: 2 });
    const m2 = await p.evaluate(() => ({ n: document.querySelectorAll("#board .card").length, up: document.querySelectorAll("#board .card.up").length, peek: window.__zy.mq.peek }));
    ok("翻牌 Lv2：12 張、開局全部亮著預覽", m2.n === 12 && m2.up === 12 && m2.peek, JSON.stringify(m2));
    await sleep(2800);
    ok("翻牌 Lv2：預覽 2 秒後蓋回", await p.evaluate(() => document.querySelectorAll("#board .card.up").length === 0 && !window.__zy.mq.peek));
    await enterMode(p, "match", { lv: 4 });
    const m4 = await p.evaluate(() => { const w = window.__zy.mq.words, ini = w.map(x => x.z[0]); const dup = ini.filter((c, i) => "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ".includes(c) && ini.indexOf(c) !== i).length; return { n: document.querySelectorAll("#board .card").length, up: document.querySelectorAll("#board .card.up").length, dup }; });
    ok("翻牌 Lv4：20 張、沒有預覽、混入同聲母的詞", m4.n === 20 && m4.up === 0 && m4.dup >= 2, JSON.stringify(m4));
    await enterMode(p, "tone", { lv: 2 });
    const t2 = await p.evaluate(() => ({ syl: window.__zy.round[0].word.z.split(" ").length, n: document.querySelectorAll("#sky .balloon").length, light: window.__zy.curOpts.some(o => o.syls[0].tone === 4) }));
    ok("聲調氣球 Lv2：單音節 5 顆（含輕聲）", t2.syl === 1 && t2.n === 5 && t2.light, JSON.stringify(t2));
    await enterMode(p, "tone", { lv: 3 }); await sleep(1600);
    const b0 = await p.evaluate(() => [...document.querySelectorAll("#sky .balloon")].map(b => b.style.translate).join("|")); await sleep(600);
    const b1 = await p.evaluate(() => [...document.querySelectorAll("#sky .balloon")].map(b => b.style.translate).join("|"));
    ok("聲調氣球 Lv3：氣球往上飄（天空裁切）", await p.evaluate(() => document.getElementById("sky").classList.contains("drift")) && b0 !== b1, b0.slice(0, 50));
    ok("聲調氣球 Lv3：雙音節為主", await p.evaluate(() => window.__zy.round.filter(q => q.word.z.split(" ").length === 2).length >= 6));
    await enterMode(p, "whack", { lv: 5 });
    ok("打地鼠 Lv5：每個目標要敲 5 下", await p.evaluate(() => document.querySelectorAll("#whackDots span").length === 5));
    await enterMode(p, "frog", { lv: 4 });
    ok("跳跳蛙 Lv4：第 1 題就 4 片荷葉、有 3 音節詞", await p.evaluate(() => window.__zy.fq.cols.length === 4 && window.__zy.round.some(q => q.word.z.split(" ").length === 3)));
    let traps = [];
    for (let k = 0; k < 4; k++) { await enterMode(p, "frog", { lv: 3 }); traps.push(await p.evaluate(() => { const z = window.__zy, s = z.fq, nx = z.zToStr([s.ts[1]]), same = z.earKey([s.ts[1]]) === z.earKey([s.ts[0]]); return same || s.cols.some(c => c.o.z === nx && !c.o.ok) ? "ok" : s.q.word.h + ":" + s.cols.map(c => c.o.z).join("/"); })); }   // 爸爸（ㄅㄚˋ ㄅㄚ˙）這種下一個字耳朵聽起來一樣的不當陷阱（§1.5）
    ok("跳跳蛙 Lv3：第 1 題就有順序陷阱（抽 4 局；下一個字聽起來一樣的除外）", traps.every(t => t === "ok"), traps.join(" "));
    await enterMode(p, "order", { lv: 4 });
    const o4 = await p.evaluate(() => ({ two: !!window.__zy.round[0].word2, n: document.querySelectorAll("#shelf .item").length, parts: document.querySelectorAll("#orderBubble .ow").length }));
    ok("點餐 Lv4：客人一次點 2 樣（兩個注音泡泡）、貨架 6 樣", o4.two && o4.n === 6 && o4.parts === 2, JSON.stringify(o4));
    await answer(p, "order", true); await sleep(300);
    ok("點餐 Lv4：拿到第 1 樣還沒完成（題目繼續）", await p.evaluate(() => window.__zy.idx === 0 && !window.__zy.results[0] && window.__zy.oq.got.size === 1));
    await answer(p, "order", true); await sleep(300);
    ok("點餐 Lv4：兩樣都一次就對＝金星", await p.evaluate(() => window.__zy.results[0] === "gold"));
    await enterMode(p, "hunt", { lv: 4 });
    ok("尋寶 Lv4：12 個東西", await p.evaluate(() => document.querySelectorAll("#scene .obj").length === 12));
    let twin = false;
    for (let k = 0; k < 6 && !twin; k++) { await enterMode(p, "build", { lv: 3 }); twin = await p.evaluate(() => { const need = window.__zy.round[0].word.z.replace(/[ ˊˇˋ˙]/g, ""); const G = ["ㄅㄆ", "ㄉㄊ", "ㄢㄤ", "ㄣㄥ", "ㄓㄗ", "ㄕㄙ", "ㄧㄩ", "ㄛㄜ"]; const want = [...need].map(c => { const g = G.find(x => x.includes(c)); return g ? g.replace(c, "") : null; }).filter(c => c && !need.includes(c)); const tiles = [...document.querySelectorAll("#tray .tile")].map(t => t.dataset.v); return want.length > 0 && want.every(c => tiles.includes(c)); }); }
    ok("積木 Lv3：多餘積木先放易混符號（ㄅㄆ ㄉㄊ ㄢㄤ…）", twin);
    ok("積木 Lv3：多餘積木 4 顆", await p.evaluate(() => document.querySelectorAll("#tray .tile").length === window.__zy.round[0].word.z.replace(/[ ˊˇˋ˙]/g, "").length + 4));
    ok("沒有錯誤（參數段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 3. 金星沙漏 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug&no3d" });
    await p.evaluate(() => window.__zy.hgScale(0.12));     // Lv3 釣魚單音節 12 秒 → 1.44 秒
    await enterMode(p, "fish", { lv: 3 });
    await p.waitForFunction(() => window.__zy.hg.run, null, { timeout: 8000 });
    ok("沙漏：Lv3 出現（進度條旁）、語音唸完才開始算", await p.evaluate(() => window.__zy.hg.shown && window.__zy.hg.on));
    await p.waitForFunction(() => window.__zy.hg.late, null, { timeout: 6000, polling: 50 });
    const ag = await p.evaluate(() => ({ ag: getComputedStyle(document.getElementById("hg")).getPropertyValue("--ag"), out: document.getElementById("hg").classList.contains("out"), shown: window.__zy.hg.shown }));
    ok("沙漏跑完：星星變銀色、沙漏還在（不消失、不閃）", ag.ag.trim() === "1.000" && ag.out && ag.shown, JSON.stringify(ag));
    await answer(p, "fish", true); await sleep(200);
    const sv = await p.evaluate(() => ({ r: window.__zy.results[0], wrong: window.__zy.wrong }));
    ok("沙漏跑完還可以答：銀星、不算錯", sv.r === "silver" && sv.wrong === 0, JSON.stringify(sv));
    await waitIdx(p, 1);
    await p.waitForFunction(() => window.__zy.hg.run, null, { timeout: 6000 });
    await answer(p, "fish", true); await sleep(200);
    ok("沙漏內第一次就答對：金星", await p.evaluate(() => window.__zy.results[1] === "gold"));
    await waitIdx(p, 2);
    await p.waitForFunction(() => window.__zy.hg.out, null, { timeout: 8000, polling: 10 });
    await answer(p, "fish", true); await sleep(200);
    ok("跑完後 0.3 秒內點對：仍算金星（寬限）", await p.evaluate(() => window.__zy.results[2] === "gold"), await p.evaluate(() => window.__zy.results.join()));
    // 暫停凍結、🔊 重聽暫停
    await p.evaluate(() => window.__zy.hgScale(1)); await enterMode(p, "fish", { lv: 3 });
    await p.waitForFunction(() => window.__zy.hg.run, null, { timeout: 8000 }); await sleep(400);
    const e0 = await p.evaluate(() => window.__zy.hg.elapsed);
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(1500);
    const e1 = await p.evaluate(() => window.__zy.hg.elapsed);
    await p.evaluate(() => document.getElementById("confirmNo").click());
    ok("沙漏：暫停選單開著＝凍結", Math.abs(e1 - e0) < 200, `${Math.round(e0)}→${Math.round(e1)}`);
    const sp = await p.evaluate(() => { document.getElementById("speakBtn").click(); const h = window.__zy.hg; return { run: h.run, wait: h.wait }; });
    ok("沙漏：按 🔊 重聽＝暫停（唸完再走）", !sp.run && sp.wait, JSON.stringify(sp));
    await p.waitForFunction(() => window.__zy.hg.run, null, { timeout: 8000 });
    ok("沙漏：重聽唸完繼續走", true);
    await enterMode(p, "fish", { lv: 2 }); await sleep(800);
    ok("Lv2 沒有沙漏", await p.evaluate(() => !window.__zy.hg.shown && !window.__zy.hg.on));
    await enterMode(p, "whack", { lv: 5 }); await sleep(800);
    ok("打地鼠沒有沙漏（沿用自適應探頭）", await p.evaluate(() => !window.__zy.hg.shown));
    // 作答秒數：第一次就答對的會記下來
    await enterMode(p, "tone", { lv: 1 }); await sleep(900);
    await answer(p, "tone", true); await sleep(300);
    ok("作答秒數：第一次就答對記進 zy1_rt", await p.evaluate(() => (JSON.parse(localStorage.getItem("zy1_rt") || "{}").tone || []).length >= 1), await p.evaluate(() => localStorage.getItem("zy1_rt")));
    ok("沒有錯誤（沙漏段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 4. 介紹卡等級徽章、繼續玩記得等級 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: "debug&no3d" });
    await p.evaluate(() => { window.__zy.setLv("hunt", 3); window.__zy.showPick("hunt"); }); await sleep(300);
    const pk = await p.evaluate(() => { const b = [...document.querySelectorAll("#pkLv .lv-pick")]; return { n: b.length, on: b.findIndex(x => x.classList.contains("on")) + 1, locked: b.filter(x => x.classList.contains("locked")).length, lock: b.filter(x => x.querySelector(".lv-lock")).length, colors: b.map(x => getComputedStyle(x.querySelector(".lv-badge")).backgroundColor) }; });
    ok("介紹卡：五顆等級徽章、預設選最高級（3）、4–5 灰＋🔒", pk.n === 5 && pk.on === 3 && pk.locked === 2 && pk.lock === 2, JSON.stringify(pk));
    ok("徽章：開了的三色都不一樣（綠藍紫）、沒開的灰", new Set(pk.colors.slice(0, 3)).size === 3 && pk.colors[3] === pk.colors[4], pk.colors.join(" "));
    await p.evaluate(() => document.querySelector('#pkLv .lv-pick[data-lv="1"]').click()); await sleep(100);
    await p.evaluate(() => document.querySelector('#pkLv .lv-pick[data-lv="5"]').click()); await sleep(100);
    ok("點徽章 1＝這次玩 Lv1；點沒開的 5 不會切", await p.evaluate(() => window.__zy.lvRec("hunt").cur === 1 && document.querySelector('#pkLv .lv-pick.on').dataset.lv === "1"));
    ok("介紹卡（徽章）：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await p.evaluate(() => { document.getElementById("pkClose").click(); });
    // 繼續玩：Lv3 答 2 題 → 回小島 → 繼續＝還是 Lv3
    await enterMode(p, "fish", { lv: 3 });
    for (let k = 0; k < 2; k++) { await answer(p, "fish", true); await waitIdx(p, k + 1); await sleep(200); }
    await p.evaluate(() => { window.__zy.setLv("fish", 1, true); document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(400);   // 中途把 cur 改成 1：繼續玩要照那一局的 Lv3
    await p.evaluate(() => document.getElementById("resumeBtn").click()); await p.waitForFunction(() => window.__zy.mode === "fish", null, { timeout: 6000 }); await sleep(300);
    ok("繼續玩：照上次那一局的等級（Lv3）從第 3 題接著", await p.evaluate(() => window.__zy.lvNow === 3 && window.__zy.idx === 2));
    ok("沒有錯誤（介紹卡段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 5. playFloor（給爬塔用，§2.4）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 3, stars: 2, query: "debug&no3d" });
    const snap = () => p.evaluate(() => ["stickers", "stars", "best", "lv", "stats", "resume", "rt"].map(k => localStorage.getItem("zy1_" + k) || "").join("|"));
    const before = await snap();
    await p.evaluate(() => { window.__ev = []; window.__res = null; const f = window.__zyTowerApi.playFloor({ mode: "fish", n: 3, lv: 1, timer: "off", onEvent: e => window.__ev.push(e.type + e.q) }); f.done.then(r => { window.__res = r; }); });
    await p.waitForFunction(() => window.__zy.mode === "fish" && window.__zy.curOpts, null, { timeout: 8000 });
    ok("playFloor：自己開遊戲畫面、一層 3 題（進度點 3 個）", await p.evaluate(() => !document.getElementById("fish").classList.contains("hidden") && window.__zy.round.length === 3 && document.querySelectorAll("#progress span").length === 3));
    await answer(p, "fish", true); await waitIdx(p, 1);
    await answer(p, "fish", false); await sleep(450); await answer(p, "fish", true); await waitIdx(p, 2);
    await answer(p, "fish", true);
    await p.waitForFunction(() => window.__res, null, { timeout: 8000 });
    const fr = await p.evaluate(() => ({ res: window.__res, ev: window.__ev, menu: !document.getElementById("menu").classList.contains("hidden"), result: !document.getElementById("result").classList.contains("hidden"), mode: window.__zy.mode, tower: !!window.__zy.tower }));
    ok("playFloor 結果：{ golds 2, silvers 1, wrongs 1, timeouts 0, aborted false }", JSON.stringify(fr.res) === JSON.stringify({ golds: 2, silvers: 1, wrongs: 1, timeouts: 0, aborted: false }), JSON.stringify(fr.res));
    ok("playFloor 事件：gold0, wrong1, silver1, gold2", fr.ev.join() === "gold0,wrong1,silver1,gold2", fr.ev.join());
    ok("playFloor 結束：不出一般結算、回到呼叫前的畫面（小島）、mode 還原", fr.menu && !fr.result && fr.mode === null && !fr.tower, JSON.stringify(fr));
    ok("playFloor：沒有再試一次（錯過的題不重出）", fr.ev.length === 4);
    ok("playFloor：不給貼紙、不進星星罐、不記 best／lv／stats／繼續玩／作答秒數", (await snap()) === before, (await snap()).slice(0, 120));
    // heart：沙漏跑完發 timeout、沙漏消失、題目繼續
    await p.evaluate(() => { window.__zy.hgScale(0.1); window.__ev = []; window.__res = null; const f = window.__zyTowerApi.playFloor({ mode: "tone", n: 1, lv: 3, timer: "heart", onEvent: e => window.__ev.push(e.type) }); f.done.then(r => { window.__res = r; }); });
    await p.waitForFunction(() => window.__ev.includes("timeout"), null, { timeout: 10000 });
    ok("heart：沙漏跑完發 {type:'timeout'}、沙漏消失、題目繼續（聲調氣球要 15 張貼紙，爬塔不看門檻）", await p.evaluate(() => !window.__zy.hg.shown && window.__zy.mode === "tone" && !window.__res));
    await answer(p, "tone", true);
    await p.waitForFunction(() => window.__res, null, { timeout: 8000 });
    ok("heart：逾時後答對＝銀、timeouts 1", await p.evaluate(() => window.__res.timeouts === 1 && window.__res.silvers === 1 && window.__res.golds === 0), JSON.stringify(await p.evaluate(() => window.__res)));
    // abort()
    await p.evaluate(() => { window.__zy.hgScale(1); window.__res = null; window.__f = window.__zyTowerApi.playFloor({ mode: "order", n: 3, lv: 2 }); window.__f.done.then(r => { window.__res = r; }); });
    await p.waitForFunction(() => window.__zy.mode === "order", null, { timeout: 8000 }); await sleep(500);
    await p.evaluate(() => window.__f.abort());
    await p.waitForFunction(() => window.__res, null, { timeout: 5000 });
    ok("abort()：Result.aborted＝true、回小島", await p.evaluate(() => window.__res.aborted === true && !document.getElementById("menu").classList.contains("hidden") && window.__zy.mode === null));
    // 🏠 暫停選單：「繼續／離開挑戰」
    await p.evaluate(() => { window.__res = null; window.__zyTowerApi.playFloor({ mode: "whack", n: 3, lv: 1 }).done.then(r => { window.__res = r; }); });
    await p.waitForFunction(() => window.__zy.mode === "whack", null, { timeout: 8000 }); await sleep(400);
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(200);
    const cf = await p.evaluate(() => ({ no: document.getElementById("confirmNo").textContent, yes: document.getElementById("confirmYes").textContent, restart: document.getElementById("confirmRestart").classList.contains("hidden") }));
    ok("爬塔暫停選單：「繼續／離開挑戰」、沒有重新開始", cf.no.includes("繼續") && cf.yes.includes("離開挑戰") && cf.restart, JSON.stringify(cf));
    ok("爬塔暫停選單：沒有漏注音的國字", (await bareHan(p)).length === 0, (await bareHan(p)).join("、"));
    await p.evaluate(() => document.getElementById("confirmYes").click());
    await p.waitForFunction(() => window.__res, null, { timeout: 5000 });
    ok("離開挑戰＝abort、暫停選單字還原", await p.evaluate(() => window.__res.aborted && document.getElementById("confirmYes").textContent.includes("回小島") && !document.getElementById("confirmRestart").classList.contains("hidden")));
    // extra：flash（點餐注音亮 2 秒蓋起來）、noPic、words（指定題目）
    await p.evaluate(() => { window.__res = null; window.__f = window.__zyTowerApi.playFloor({ mode: "order", n: 1, lv: 1, extra: { flash: true } }); window.__f.done.then(r => { window.__res = r; }); });
    await p.waitForFunction(() => window.__zy.mode === "order" && window.__zy.curOpts, null, { timeout: 8000 });
    const f0 = await p.evaluate(() => document.getElementById("orderBubble").classList.contains("flashed")); await sleep(2400);
    ok("extra.flash：注音先亮著、2 秒後蓋起來", !f0 && await p.evaluate(() => document.getElementById("orderBubble").classList.contains("flashed")));
    await p.evaluate(() => window.__f.abort()); await p.waitForFunction(() => window.__res, null, { timeout: 5000 });
    await p.evaluate(() => { window.__res = null; window.__f = window.__zyTowerApi.playFloor({ mode: "build", n: 1, lv: 1, extra: { words: [{ h: "登頂", z: "ㄉㄥ ㄉㄧㄥˇ", e: "🏔️" }] } }); window.__f.done.then(r => { window.__res = r; }); });
    await p.waitForFunction(() => window.__zy.mode === "build" && window.__zy.round.length, null, { timeout: 8000 }); await sleep(300);
    ok("extra.words：指定題目（積木拼「登頂」）", await p.evaluate(() => window.__zy.round[0].word.h === "登頂" && document.querySelectorAll("#slots .sylSlot").length === 2));
    await p.evaluate(() => window.__f.abort()); await p.waitForFunction(() => window.__res, null, { timeout: 5000 });
    await p.evaluate(() => { window.__res = null; window.__f = window.__zyTowerApi.playFloor({ mode: "frog", n: 1, lv: 1, extra: { noPic: true } }); window.__f.done.then(r => { window.__res = r; }); });
    await p.waitForFunction(() => window.__zy.mode === "frog" && window.__zy.fq, null, { timeout: 8000 }); await sleep(300);
    ok("extra.noPic：聽音題的圖藏起來（青蛙石頭）", await p.evaluate(() => document.querySelector("#river .fpic").textContent === "👂"));
    await p.evaluate(() => window.__f.abort()); await p.waitForFunction(() => window.__res, null, { timeout: 5000 });
    ok("playFloor 不支援的 mode（翻牌）＝直接 aborted", await p.evaluate(() => window.__zyTowerApi.playFloor({ mode: "match" }).done.then(r => r.aborted)));
    ok("playFloor 全程：存檔都沒動", (await snap()) === before);
    ok("沒有錯誤（playFloor 段）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n")); const f = out.filter(r => r.startsWith("FAIL")).length; console.log(f ? `${f} FAILED / ${out.length}` : `ALL PASS (${out.length})`);
})().catch(e => { console.log(out.join("\n")); console.error("FATAL", e.message); process.exit(1); });
