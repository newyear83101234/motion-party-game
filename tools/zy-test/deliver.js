// 彩虹配送站（js/zhuyin-deliver.js）測試：node tools/zy-test/deliver.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 DL_SHOTS（預設 %TEMP%\zy-deliver）。
// 驗：①求解器 12 任務都有解（10-13 加了進階關 9–12）、印最佳趟數／路程、任務 7–8 要回倉庫且「貪心先送最近的」比較差
//     ②12 任務用真的點擊照求解器最佳解打完：onWin 參數、3★、禮物（重玩＝null）、單行道沒有逆向
//     ③送錯流程（說孩子給的那個、不唸答案、貨飛回車上）、藏圖任務訂單完全不出聲、其他居民台詞、裝滿、空車
//     ④💡 提示（指商品→指卡車、藏圖第一次揭圖再示範、吊橋開關）⑤吊橋／三角錐／單行道的阻擋提示
//     ⑥暫停：卡車停、計時凍結、不收操作 ⑦五種尺寸版面＋截圖（含訂單卡字級、車廂國字對比） ⑧start/stop 5 次沒有 WebGL 洩漏（⑧-2 建場景丟錯也不漏）
//     ⑨國字都有注音 ⑩0 個 console error；②onSave 在送完最後一件當下呼叫、早於 onWin
const { launch } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const BASE = process.env.ZY_BASE || "http://127.0.0.1:8765";
const LAB = BASE + "/tools/zy-test/deliver-lab.html";
const SHOTS = process.env.DL_SHOTS || path.join(os.tmpdir(), "zy-deliver");
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allErrs = [];

async function open(browser, w, h, q = "") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => { errs.push("PAGEERR " + e.message); allErrs.push(`[${w}x${h}] PAGEERR ${e.message}`); });
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) { errs.push("CONSOLE " + m.text().slice(0, 200)); allErrs.push(`[${w}x${h}] CONSOLE ${m.text().slice(0, 200)}`); } });
  await p.goto(LAB + "?mute=1&clean=1" + (q ? "&" + q : ""));
  await p.waitForFunction(() => window.__dl && window.__dl.ready, null, { timeout: 15000 });
  await waitReady(p);
  return { ctx, p, errs };
}
const S = p => p.evaluate(() => window.__dl.game.state());
const waitReady = p => p.waitForFunction(() => { const s = window.__dl.game.state(); return s && s.ready; }, null, { timeout: 20000, polling: 50 });
const waitIdle = (p, t = 20000) => p.waitForFunction(() => { const s = window.__dl.game.state(); return s && s.ready && (s.won || (!s.driving && !s.lock)); }, null, { timeout: t, polling: 30 });
async function startTask(p, i) { await p.evaluate(i => { const d = window.__dl; d.calls.say.length = d.calls.talk.length = d.calls.win.length = d.calls.save.length = d.calls.at.length = 0; d.game.start(i); }, i); await waitReady(p); await sleep(150); }
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
// 用真的滑鼠點（Playwright 會檢查元素看得到、沒被擋住）
async function act(p, a) {
  if (a.type === "load") { const sel = (await S(p)).sel; if (sel !== a.g) await p.click(`.dlv-good[data-g="${a.g}"]`, { timeout: 4000 }); await p.click(".dlv-truckhit", { timeout: 4000 }); }
  else if (a.type === "unload" || a.type === "deliver") await p.click(`.dlv-slot[data-k="${a.slot}"]`, { timeout: 4000 });
  else if (a.type === "bridge") await p.click('.dlv-pin[data-node="BR"]', { timeout: 4000 });
  else if (a.type === "drive") await p.click(`.dlv-pin[data-node="${a.to}"]`, { timeout: 4000 });
}
async function playBest(p, max = 40) {
  const log = [];
  for (let n = 0; n < max; n++) {
    await waitIdle(p); const s = await S(p); if (s.won) break;
    const a = await p.evaluate(() => window.__dl.game.debug.nextAction()); if (!a) break;
    log.push(a.type + ":" + (a.g || a.to || "")); await act(p, a); await sleep(40);
  }
  return log;
}
const CW = new Set(["A>NW", "NW>B", "B>NE", "NE>E", "E>SE", "SE>R", "R>SW", "SW>A"]), CCW = new Set([...CW].map(k => k.split(">").reverse().join(">")));
const wrongWay = legs => legs.flatMap(l => l.nodes.slice(1).map((n, i) => l.nodes[i] + ">" + n)).filter(k => CCW.has(k));

(async () => {
  const browser = await launch();

  // ===== ① 求解器 =====
  {
    const { ctx, p } = await open(browser, 1180, 820);
    const rows = await p.evaluate(() => { const m = window.__dl.mod; return m.TASKS.map((t, i) => { const s = m.solve(i), g = m.greedy(i); return { i, cap: t.cap, n: t.orders.length, trips: s && s.trips, dist: s && s.dist, gTrips: g.trips, gDist: g.dist, plan: s ? s.moves.map(mv => (mv.load ? `[${mv.load.join("+")}]` : "") + mv.from + (mv.bridge ? "→橋→" : "→") + mv.to).join(" ") : "" }; }); });
    console.log("\n求解器（路程＝送完最後一件為止；貪心＝在倉庫照遠近裝滿、每次開最近的那家）");
    console.log("任務 | 容量 | 件數 | 最佳 趟/路程 | 貪心 趟/路程 | 最佳路線");
    for (const r of rows) console.log(`${String(r.i + 1).padStart(4)} | ${r.cap}    | ${r.n}    | ${r.trips} / ${String(r.dist).padEnd(6)} | ${r.gTrips} / ${String(r.gDist).padEnd(6)} | ${r.plan}`);
    ok("求解器：12 任務都有解（含 10-13 進階關 9–12）", rows.length === 12 && rows.every(r => r.trips >= 1 && r.dist > 0));
    ok("求解器：任務 7、8 至少要 2 趟（容量不夠要回倉庫）", rows[6].trips >= 2 && rows[7].trips >= 2, `T7 ${rows[6].trips} 趟、T8 ${rows[7].trips} 趟`);
    ok("求解器：任務 7、8「貪心先送最近的」路程比最佳差 ≥10%（大人要規劃）", rows[6].gDist > rows[6].dist * 1.1 && rows[7].gDist > rows[7].dist * 1.1,
      `T7 最佳 ${rows[6].dist} vs 貪心 ${rows[6].gDist}（+${Math.round((rows[6].gDist / rows[6].dist - 1) * 100)}%）、T8 最佳 ${rows[7].dist} vs 貪心 ${rows[7].gDist}（+${Math.round((rows[7].gDist / rows[7].dist - 1) * 100)}%）`);
    ok("任務設計：前 3 關會唸、第 4 關起藏圖；容量 1→2→3；任務 7–8 是大人規劃關", await p.evaluate(() => { const T = window.__dl.mod.TASKS; return T.slice(0, 3).every(t => t.speak && !t.hidden) && T.slice(3).every(t => t.hidden && !t.speak) && T[0].cap === 1 && T[4].cap === 3 && T.map(t => t.plan).join() === "false,false,false,false,false,false,true,true,true,true,true,true"; }));
    // 10-13 進階關 9–12：全部藏圖、規劃關、有吊橋；訂單 4/4/5/5 張；容量 2/2/3/2；10–12 單行道；至少 2 趟；貪心比最佳差 ≥10%；第一次過關送扭蛋幣（沒有換裝）；逐關變難（件數或趟數不減）
    const adv = await p.evaluate(() => window.__dl.mod.TASKS.slice(8).map(t => ({ n: t.orders.length, cap: t.cap, hidden: t.hidden, lever: t.lever, plan: t.plan, oneway: t.oneway, coin: !!t.coin, gift: t.gift || null, speak: t.speak, shelf: t.shelf.length })));
    ok("進階關 9–12 設計：全部藏圖＋規劃關＋吊橋；訂單 4/4/5/5 張；容量 2/2/3/2；單行道 否/是/是/是；貨架 6 種；不唸訂單；第一次過關送扭蛋幣、沒有換裝禮物",
      adv.every(t => t.hidden && t.plan && t.lever && !t.speak && t.shelf === 6 && t.coin && t.gift === null) && adv.map(t => t.n).join() === "4,4,5,5" && adv.map(t => t.cap).join() === "2,2,3,2" && adv.map(t => t.oneway).join() === "false,true,true,true", JSON.stringify(adv));
    ok("進階關 9–12：每關至少 2 趟、「貪心先送最近的」路程比最佳差 ≥10%；11 關 5 張單最少趟不比 9 關少、12 關 3 趟＝全部最難",
      rows.slice(8).every(r => r.trips >= 2 && r.gDist > r.dist * 1.1) && rows[11].trips === 3 && rows[10].n === 5 && rows[8].trips <= rows[10].trips && rows[11].trips >= rows[10].trips, JSON.stringify(rows.slice(8).map(r => [r.n, r.cap, r.trips, r.dist, r.gDist])));
    // 任務 4＝第一個藏圖關：不易混的詞、貨架 4 種；易混組（ㄒ西瓜／香蕉、ㄇ麵包／帽子）從任務 5 起
    ok("任務 4 降坡：訂單沒有易混組、貨架 4 種；任務 5 起才有易混組", await p.evaluate(() => { const T = window.__dl.mod.TASKS, mix = ["watermelon", "banana", "bread", "hat"];
      return T[3].shelf.length === 4 && !T[3].orders.some(o => mix.includes(o[1])) && T.slice(4).some(t => t.orders.some(o => mix.includes(o[1]))); }));
    // 星星規則（櫻木花道 10-12）：一般關只看送錯；大人規劃關看錯＋趟數＋路程
    const sr = await p.evaluate(() => { const f = window.__dl.mod.starsFor, b = { trips: 1, dist: 24.4 }, b2 = { trips: 2, dist: 44.6 };
      return [f({ trips: 2, dist: 60, wrong: 0 }, b, false), f({ trips: 1, dist: 24.4, wrong: 1 }, b, false), f({ trips: 1, dist: 24.4, wrong: 2 }, b, false),
        f({ trips: 2, dist: 44.6, wrong: 0 }, b2, true), f({ trips: 3, dist: 70, wrong: 0 }, b2, true), f({ trips: 2, dist: 58.6, wrong: 0 }, b2, true), f({ trips: 3, dist: 70, wrong: 1 }, b2, true)].join(""); });
    ok("星星：一般關 0 錯 3★／1 錯 2★／2 錯 1★（繞遠不扣）；規劃關 最佳 3★、多一趟或繞遠 2★、多一趟又錯 1★", sr === "3213221", sr);
    await ctx.close();
  }

  // ===== ② 12 任務照最佳解用真的點擊打完 =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "fast=6&seed=11");
    const table = [], saves = [];
    for (let i = 0; i < 12; i++) {
      await startTask(p, i);
      const best = (await S(p)).best, steps = await playBest(p);
      const banner = await p.waitForFunction(() => { const b = document.querySelector(".dlv-banner .dlv-banner-s span.dlv-pop") && document.querySelector(".dlv-banner"); return b ? b.textContent : ""; }, null, { timeout: 8000, polling: 10 }).then(h => h.jsonValue()).catch(() => "");
      await p.waitForFunction(() => window.__dl.calls.win.length > 0, null, { timeout: 15000 }).catch(() => {});
      const w = await p.evaluate(() => window.__dl.calls.win[0] || null), s = await S(p), gift = await p.evaluate(i => window.__dl.mod.TASKS[i].gift, i), coin = await p.evaluate(i => (window.__dl.mod.TASKS[i].coin ? 1 : 0), i);
      const sv = await p.evaluate(() => ({ n: window.__dl.calls.save.length, same: JSON.stringify(window.__dl.calls.save[0]) === JSON.stringify(window.__dl.calls.win[0]), order: window.__dl.calls.at.map(a => a[0]).join() }));
      saves.push(sv.n === 1 && sv.same && sv.order === "save,win" ? "ok" : JSON.stringify(sv));
      const ww = (await p.evaluate(i => window.__dl.mod.TASKS[i].oneway, i)) ? wrongWay(s.legs) : [];   // 只有單行道任務要查方向
      const bannerOk = i >= 6 ? /路程 \d+ 格／最短 \d+ 格/.test(banner) : !/最少|路程/.test(banner) && banner.includes("全部送到了");
      table.push({ task: i + 1, steps: steps.length, w, wrongWay: ww.length, banner: bannerOk ? undefined : banner,
        ok: !!(w && w.task === i && w.stars === 3 && w.routeBest === true && w.trips === best.trips && w.bestTrips === best.trips && Math.abs(w.dist - best.dist) < 0.05 && w.bestDist === best.dist && w.wrong === 0 && w.gift === gift && w.coin === coin && ww.length === 0 && bannerOk) });
      if (i === 7) await shot(p, "land_T8_win");
      if (i >= 8) await shot(p, `land_T${i + 1}_win`);        // 進階關過關畫面（扭蛋幣卡）
    }
    console.log("\n介面實打（最佳解、真的點擊）：" + table.map(t => `T${t.task}:${t.w ? t.w.trips + "趟/" + t.w.dist + "★" + t.w.stars + " " + (t.w.gift || (t.w.coin ? "🪙" : "")) : "沒過"}`).join("  "));
    ok("自動通關：12 任務都過關、onWin 參數正確（含 routeBest、coin）、3★、送第一次禮物（9–12＝扭蛋幣）、單行道沒逆向；結算小字：一般關不顯示趟數、規劃關顯示「路程 X 格／最短 Y 格」", table.every(t => t.ok), JSON.stringify(table.filter(t => !t.ok)));
    ok("onSave（里維 10-12）：12 任務都在 onWin 之前呼叫一次、內容跟 onWin 一樣", saves.length === 12 && saves.every(x => x === "ok"), JSON.stringify(saves));
    await startTask(p, 0);
    // 送完最後一件的那一刻（state.won 變 true）onSave 已經呼叫、onWin 還沒（演出中）
    const atWin = p.waitForFunction(() => { const s = window.__dl.game.state(); return s && s.won ? { save: window.__dl.calls.save.length, win: window.__dl.calls.win.length } : null; }, null, { timeout: 30000, polling: "raf" }).then(h => h.jsonValue()).catch(() => null);
    await playBest(p); const aw = await atWin;
    await p.waitForFunction(() => window.__dl.calls.win.length > 0, null, { timeout: 15000 }).catch(() => {});
    const w2 = await p.evaluate(() => window.__dl.calls.win[0]);
    ok("onSave：送完最後一件的那一刻就存（onSave 1 次、onWin 還沒來）", aw && aw.save === 1 && aw.win === 0, JSON.stringify(aw));
    ok("重玩已過的任務：gift＝null（只有第一次送禮）", w2 && w2.gift === null && w2.stars === 3, JSON.stringify(w2));
    ok("第 2 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ③ 送錯流程、換貨、到站交貨、居民台詞 =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "fast=4&seed=5");
    const said = () => p.evaluate(() => window.__dl.calls.say.slice()), spoken = async () => (await S(p)).spoken.map(x => x.text);
    // 任務 1：開場唸一次「我要帽子！」
    await startTask(p, 0); await sleep(700);
    const sayStart = await said();
    ok("任務 1 開場：居民說一次「我要帽子！」", sayStart.filter(t => t === "我要帽子！").length === 1, JSON.stringify(sayStart));
    // 空車出發
    await p.click('.dlv-pin[data-node="B"]'); await sleep(150);
    let s = await S(p);
    ok("空車要出發：卡車不動、說「先把貨裝上車吧！」、💡 亮", s.pos === "W" && !s.driving && s.spoken.some(x => x.text === "先把貨裝上車吧！") && await p.evaluate(() => document.querySelector(".dlv-hint.dlv-pulse") !== null));
    // 容量 1：裝了蘋果再點帽子＝直接換貨（蘋果飛回貨架）
    await act(p, { type: "load", g: "apple" }); await sleep(120);
    await p.click('.dlv-good[data-g="hat"]'); await sleep(300);
    s = await S(p);
    ok("容量 1 換貨：點別的商品＝車上換成它、舊的放回貨架、不說「裝滿了」", s.cargo.join() === "hat" && s.swaps === 1 && !s.spoken.some(x => x.text === "車子裝滿了！"), JSON.stringify(s.cargo));
    await p.click('.dlv-good[data-g="apple"]'); await sleep(300);
    ok("容量 1 換貨：再換回蘋果", (await S(p)).cargo.join() === "apple");
    await act(p, { type: "drive", to: "B" }); await waitIdle(p); await sleep(250);
    ok("載錯貨到站：居民說「車上沒有我要的東西耶，回倉庫拿吧！」（不說交貨提示）", (await spoken()).includes("車上沒有我要的東西耶，回倉庫拿吧！") && !(await spoken()).includes("點車廂裡的帽子，交給小兔！"));
    await p.evaluate(() => { window.__dl.calls.say.length = 0; });
    await p.click('.dlv-slot[data-k="0"]'); await sleep(120); await shot(p, "land_T1_wrong_fly");
    await waitIdle(p); await sleep(150);
    s = await S(p); const sw = await said();
    ok("送錯：說「這是蘋果，不是我要的喔！」（送錯的那個）、不唸答案", sw.includes("這是蘋果，不是我要的喔！") && !sw.some(t => t.includes("帽子")), JSON.stringify(sw));
    ok("送錯：貨飛回車上、記一次錯、訂單沒完成；居民頭上只有 1 個對話泡泡", s.cargo.join() === "apple" && s.wrong === 1 && !s.done[0] && await p.evaluate(() => document.querySelectorAll(".dlv-say").length <= 1));
    await shot(p, "land_T1_wrong_after");
    // 🔊 再聽一次（會唸的任務）
    await p.evaluate(() => { window.__dl.calls.say.length = 0; }); await p.click(".dlv-replay"); await sleep(200);
    ok("🔊 再聽一次：唸還沒送到的訂單", (await said()).includes("我要帽子！"));
    // 到站點卡車＝交貨（車上只有一件就直接交）
    await startTask(p, 0); await act(p, { type: "load", g: "hat" }); await act(p, { type: "drive", to: "B" }); await waitIdle(p); await sleep(250);
    ok("任務 1 到站：說對得上操作的提示「點車廂裡的帽子，交給小兔！」", (await spoken()).includes("點車廂裡的帽子，交給小兔！"));
    await p.click(".dlv-truckhit"); await sleep(250); s = await S(p);
    ok("到站點卡車：車上只有一件＝直接交貨", s.done[0] === true && s.cargo.length === 0, JSON.stringify({ done: s.done, cargo: s.cargo }));
    // 任務 3：兩件到站 → 點居民／圖釘＝格子跳一下＋手指指車廂（不指答案）；容量 ≥2 裝滿再裝＝教他拿下來
    await startTask(p, 2); await sleep(900);
    ok("任務 3 開場加一句「兩個都裝上車，一次送完喔！」", (await spoken()).includes("兩個都裝上車，一次送完喔！"));
    await act(p, { type: "load", g: "milk" }); await act(p, { type: "load", g: "apple" });
    await p.click('.dlv-good[data-g="bread"]'); await p.click(".dlv-truckhit"); await sleep(200);
    s = await S(p);
    ok("容量 2 裝滿再裝：不進車、說「車子裝滿了！」＋「點車上的東西可以拿下來喔！」", s.cargo.length === 2 && !s.cargo.includes("bread") && s.spoken.some(x => x.text === "車子裝滿了！") && s.spoken.some(x => x.text === "點車上的東西可以拿下來喔！"));
    ok("任務 1–3 貨架與車廂有國字", await p.evaluate(() => document.querySelectorAll(".dlv-shelf .dlv-good-name").length === 4 && document.querySelectorAll(".dlv-slot .dlv-good-name").length === 2));
    await act(p, { type: "drive", to: "B" }); await waitIdle(p); await sleep(200);
    await p.click('.dlv-reshit[data-res="B"]'); await sleep(200); s = await S(p);
    ok("到站點居民（車上兩件）：不亂交、格子跳一下、手指指車廂", s.nudges === 1 && s.cargo.length === 2 && s.finger && s.finger.type === "cargo", JSON.stringify({ n: s.nudges, f: s.finger }));
    await shot(p, "land_T3_intent_cargo");
    await p.click('.dlv-pin[data-node="B"]'); await sleep(150); s = await S(p);
    ok("到站點這家的圖釘：一樣算要交貨（圖釘不收起來）", s.nudges === 2 && !s.driving && s.pos === "B");
    await p.click(`.dlv-slot[data-k="${s.cargo.indexOf("milk")}"]`); await waitIdle(p);
    ok("點格子交貨", (await S(p)).done[0] === true);
    // 任務 4（藏圖）：開場完全不唸商品；貨架只放圖；送錯也只說孩子給的那個
    await startTask(p, 3); await sleep(900);
    const say4 = await said(), talk4 = await p.evaluate(() => window.__dl.calls.talk.slice());
    const goodsNames = ["帽子", "蘋果", "香蕉", "西瓜", "麵包", "牛奶"];
    ok("藏圖任務：開場 say 0 句、居民只打招呼、沒有唸任何商品、沒有 🔊 鈕", say4.length === 0 && talk4.includes("嗨！麻煩你囉！") && !talk4.some(t => goodsNames.some(g => t.includes(g))) && await p.evaluate(() => document.querySelector(".dlv-replay").classList.contains("dlv-hide")), JSON.stringify({ say4, talk4 }));
    ok("藏圖任務：sayCurrent() 不出聲", await p.evaluate(() => { window.__dl.game.sayCurrent(); return window.__dl.calls.say.length === 0; }));
    ok("藏圖任務：訂單卡是「？」紙箱＋國字、貨架與車廂只放圖不放字", await p.evaluate(() => document.querySelectorAll(".dlv-card .dlv-mystery").length === 2 && document.querySelectorAll(".dlv-card-pic img").length === 0 && document.querySelectorAll(".dlv-card-name").length === 2 && document.querySelectorAll(".dlv-shelf .dlv-good-name, .dlv-slot .dlv-good-name").length === 0));
    await act(p, { type: "load", g: "banana" }); await act(p, { type: "load", g: "milk" }); await sleep(100);
    await act(p, { type: "drive", to: "B" }); await waitIdle(p); await sleep(150);
    await p.click(`.dlv-slot[data-k="${(await S(p)).cargo.indexOf("banana")}"]`); await waitIdle(p); await sleep(150);
    const say4b = await said();
    ok("藏圖任務送錯：說「這是香蕉，不是我要的喔！」、整局沒有唸出答案「牛奶」", say4b.includes("這是香蕉，不是我要的喔！") && !say4b.some(t => t.includes("牛奶")), JSON.stringify(say4b));
    await p.click(`.dlv-slot[data-k="${(await S(p)).cargo.indexOf("milk")}"]`); await waitIdle(p); await sleep(200);
    ok("藏圖訂單沒按提示就送對：蓋「自己讀到的！」章", (await S(p)).selfRead[0] === true && await p.evaluate(() => !!document.querySelector(".dlv-card .dlv-card-self")));
    await act(p, { type: "drive", to: "W" }); await waitIdle(p); await act(p, { type: "drive", to: "B" }); await waitIdle(p); await sleep(700);
    s = await S(p);
    ok("已經收到的人家：說「我已經收到囉，謝謝！」", s.spoken.some(x => x.text === "我已經收到囉，謝謝！"));
    // 任務 3：車上沒有他要的 → 回倉庫拿、倉庫圖釘亮；任務 2：沒訂東西的人家；開車中點卡車＝叭、點居民＝揮手
    await startTask(p, 2); await act(p, { type: "load", g: "apple" }); await act(p, { type: "drive", to: "B" }); await waitIdle(p); await sleep(700);
    s = await S(p);
    ok("車上沒有他要的：說「車上沒有我要的東西耶，回倉庫拿吧！」、倉庫圖釘亮", s.spoken.some(x => x.text === "車上沒有我要的東西耶，回倉庫拿吧！") && await p.evaluate(() => document.querySelector('.dlv-pin[data-node="W"].dlv-glow') !== null));
    await startTask(p, 1); await act(p, { type: "load", g: "bread" });
    await p.evaluate(() => { window.__dl.calls.play.length = 0; });
    await p.click('.dlv-pin[data-node="B"]'); await sleep(80);
    const dr = await p.evaluate(() => { const g = window.__dl.game, c = window.__dl.calls.play, n = () => c.filter(x => x === "horn").length;
      const before = n(), driving = g.state().driving, t = g.debug.tapTruck(), r = g.debug.tapResident("R"); return { before, after: n(), driving, t, r, waves: g.state().waves }; });
    ok("開車中點卡車＝叭一聲、點居民＝揮手（不是沒反應）", dr.driving && dr.t === true && dr.after === dr.before + 1 && dr.r === true && dr.waves === 1, JSON.stringify(dr));
    await waitIdle(p); await sleep(700); s = await S(p);
    ok("沒訂東西的人家：說「我沒有訂東西喔！」", s.spoken.some(x => x.text === "我沒有訂東西喔！"));
    ok("第 3 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ④ 💡 提示＋閒置 =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "fast=2&seed=5");
    await startTask(p, 0); await sleep(300);
    let h = await p.evaluate(() => window.__dl.game.debug.tapHint());
    await sleep(300); let s = await S(p);
    ok("提示（還沒裝貨）：示範下一步＝裝帽子、手指先指商品", h && h.type === "load" && h.g === "hat" && s.finger && s.finger.type === "good:hat", JSON.stringify({ h, f: s.finger }));
    await shot(p, "land_T1_hint_good");
    await sleep(1700 / 2 + 200); s = await S(p);
    ok("提示：接著手指移到卡車", s.finger && s.finger.type === "truck", JSON.stringify(s.finger));
    await p.click('.dlv-good[data-g="hat"]'); await sleep(100);
    h = await p.evaluate(() => window.__dl.game.debug.tapHint()); await sleep(150); s = await S(p);
    ok("提示（已選商品）：直接指卡車", h && h.type === "load" && s.finger && s.finger.type === "truck", JSON.stringify(s.finger));
    await p.click(".dlv-truckhit"); await sleep(100);
    h = await p.evaluate(() => window.__dl.game.debug.tapHint()); await sleep(150); s = await S(p);
    ok("提示（裝好了）：指小兔家的圖釘", h && h.type === "drive" && h.to === "B" && s.finger && s.finger.type === "pin:B", JSON.stringify(s.finger));
    await shot(p, "land_T1_hint_pin");
    await act(p, { type: "drive", to: "B" }); await waitIdle(p);
    h = await p.evaluate(() => window.__dl.game.debug.tapHint()); await sleep(150); s = await S(p);
    ok("提示（到了）：指車上要交的貨", h && h.type === "deliver" && s.finger && s.finger.type === "slot:0", JSON.stringify(s.finger));
    // 藏圖：第一次＝揭圖、第二次＝示範
    await startTask(p, 3); await sleep(300);
    const r1 = await p.evaluate(() => window.__dl.game.debug.tapHint()); await sleep(150);
    const pic = await p.evaluate(i => !!document.querySelectorAll(".dlv-card")[i].querySelector(".dlv-card-pic img"), r1 && r1.reveal);
    const r2 = await p.evaluate(() => window.__dl.game.debug.tapHint()); await sleep(150); s = await S(p);
    const want = await p.evaluate(i => window.__dl.mod.TASKS[3].orders[i][1], r1 && r1.reveal);
    ok("藏圖提示：第一次按＝揭開那張訂單的圖", r1 && typeof r1.reveal === "number" && pic && s.revealed[r1.reveal], JSON.stringify(r1));
    ok("藏圖提示：再按＝示範（指那個商品）", r2 && r2.type === "load" && r2.g === want && s.finger && s.finger.type === "good:" + want, JSON.stringify({ r2, f: s.finger }));
    await shot(p, "land_T4_hint_reveal");
    // 任務 5：吊橋第一次出現 → 自動示範一次開關在哪；之後要過河時 💡 指吊橋開關
    await startTask(p, 4); await sleep(3200 / 2 + 500); s = await S(p);
    ok("任務 5 開場：手指示範一次吊橋開關（教學）", s.bridgeDemo === true && s.finger && s.finger.type === "pin:BR", JSON.stringify(s.finger));
    await shot(p, "land_T5_bridge_demo");
    await startTask(p, 4); await sleep(3200 / 2 + 500); s = await S(p);
    ok("任務 5 再玩：不再自動示範（只示範一次）", s.bridgeDemo === false && !s.finger);
    let lv = null;
    for (let k = 0; k < 14 && !(lv && lv.type === "bridge"); k++) {
      const a = await p.evaluate(() => window.__dl.game.debug.nextAction());
      if (a && a.type === "bridge") { lv = await p.evaluate(() => window.__dl.game.debug.tapHint()); if (lv && lv.reveal !== undefined) lv = await p.evaluate(() => window.__dl.game.debug.tapHint()); break; }
      await act(p, a); await waitIdle(p);
    }
    s = await S(p);
    ok("提示（下一段要過河、橋還沒放）：指吊橋開關圖釘", lv && lv.type === "bridge" && s.finger && s.finger.type === "pin:BR", JSON.stringify({ lv, f: s.finger, pos: s.pos }));
    // 錯 2 次 → 💡 閃（不自動示範）
    await startTask(p, 0); await act(p, { type: "load", g: "apple" }); await act(p, { type: "drive", to: "B" }); await waitIdle(p);
    for (let k = 0; k < 2; k++) { await p.click('.dlv-slot[data-k="0"]'); await waitIdle(p); }
    s = await S(p);
    ok("送錯 2 次：💡 閃、但不會自己示範", s.wrong === 2 && !s.finger && await p.evaluate(() => document.querySelector(".dlv-hint.dlv-pulse") !== null));
    ok("第 4 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
    // 閒置：任務 1–3 最多 8 秒就讓 💡 閃（家長設 20 秒）；任務 4 起照家長設定；家長設「關閉」＝0 不閃
    const idle = async (q, ti, wait) => { const o = await open(browser, 1024, 768, q); await startTask(o.p, ti); await sleep(wait); const r = await o.p.evaluate(() => !!document.querySelector(".dlv-hint.dlv-pulse")); await o.ctx.close(); return r; };
    const i1 = await idle("fast=4&hint=20&seed=1", 0, 2600), i4 = await idle("fast=4&hint=20&seed=1", 3, 2600), i0 = await idle("fast=4&hint=0&seed=1", 0, 3200);
    ok("閒置提示：任務 1–3 用 min(家長設定, 8 秒)、任務 4 起照家長設定、設「關閉」就不閃", i1 && !i4 && !i0, JSON.stringify({ i1, i4, i0 }));
  }

  // ===== ⑤ 吊橋／三角錐／單行道 =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "fast=3&seed=5");
    await startTask(p, 4);
    ok("吊橋開關不在貨架上（地圖上的開關圖釘）", await p.evaluate(() => !document.querySelector(".dlv-shelf .dlv-lever") && !!document.querySelector('.dlv-pin[data-node="BR"]')));
    for (const g of ["bread", "hat", "milk"]) await act(p, { type: "load", g });
    await p.click('.dlv-pin[data-node="P"]'); await sleep(250);
    let s = await S(p);
    ok("吊橋升起：點小豬家＝卡車不動、說「橋還沒放下來喔！」、開關圖釘亮", s.pos === "W" && !s.driving && s.lastBlock && s.lastBlock.cause === "bridge" && s.spoken.some(x => x.text === "橋還沒放下來喔！") && await p.evaluate(() => window.__dl.game.debug.bridgeAngle() > 0.95 && !!document.querySelector('.dlv-pin[data-node="BR"].dlv-glow')));
    await shot(p, "land_T5_bridge_blocked");
    await p.click('.dlv-pin[data-node="BR"]'); await sleep(1700 / 3 + 300);
    ok("點開關圖釘：吊橋放下來（動畫）、開關圖釘收起來", await p.evaluate(() => window.__dl.game.debug.bridgeAngle() < 0.05 && document.querySelector('.dlv-pin[data-node="BR"]').classList.contains("dlv-off")) && (await S(p)).bridge === 1);
    ok("吊橋放下後鎖住：再點不會升起", await p.evaluate(() => window.__dl.game.debug.tapBridge()) === false && (await S(p)).bridge === 1);
    await p.click('.dlv-pin[data-node="P"]'); await sleep(200);
    s = await S(p);
    ok("吊橋放下：開去小豬家、路線經過吊橋", s.driving && s.legs[0].nodes.join(",").includes("BW,BE"), JSON.stringify(s.legs[0]));
    await sleep(500); await shot(p, "land_T5_bridge_cross");
    await waitIdle(p);
    // 在別的地方（小兔家）直接點地圖上的吊橋也能放下
    await startTask(p, 6); await act(p, { type: "load", g: "hat" }); await act(p, { type: "drive", to: "B" }); await waitIdle(p);
    await p.click(".dlv-bridgehit"); await sleep(200);
    ok("在小兔家直接點地圖上的吊橋＝放下（不用回倉庫）", (await S(p)).bridge === 1 && (await S(p)).pos === "B");
    // 三角錐：任務 1 硬開去小熊家（沒有圖釘，用 debug 入口）
    await startTask(p, 0); await act(p, { type: "load", g: "hat" });
    const rc = await p.evaluate(() => window.__dl.game.debug.tapPin("R")); await sleep(150); s = await S(p);
    const lit = await p.evaluate(() => window.__dl.game.debug.conesLit());
    ok("三角錐擋路：卡車不動、說「前面在施工，車子沒辦法過去喔！」、擋路的那組三角錐閃", rc === false && s.pos === "W" && !s.driving && s.lastBlock.cause === "cone" && s.spoken.some(x => x.text === "前面在施工，車子沒辦法過去喔！") && lit.includes("SW-A"), JSON.stringify({ lb: s.lastBlock, lit }));
    ok("任務 1 只有倉庫和小兔家的圖釘（擋住的人家不畫）", await p.evaluate(() => [...document.querySelectorAll(".dlv-pin")].map(b => b.dataset.node).sort().join(",") === "B,W"));
    await shot(p, "land_T1_cones");
    // 單行道：任務 6 先去小熊家＝要繞一圈、箭頭閃、講一次
    await startTask(p, 5); await act(p, { type: "load", g: "banana" });
    await p.click('.dlv-pin[data-node="R"]'); await sleep(150); s = await S(p);
    ok("單行道：路線照箭頭方向繞（沒有逆向）、箭頭閃、說「這是單行道，要繞路喔！」", s.driving && wrongWay(s.legs).length === 0 && s.legs[0].nodes.join(",") === "W,A,NW,B,NE,E,SE,R" && await p.evaluate(() => window.__dl.game.debug.arrowsLit()) && s.spoken.some(x => x.text === "這是單行道，要繞路喔！"), JSON.stringify(s.legs));
    await sleep(400); await shot(p, "land_T6_oneway");
    ok("第 5 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑥ 暫停 =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "seed=5");
    await startTask(p, 1); await act(p, { type: "load", g: "bread" });
    await p.click('.dlv-pin[data-node="R"]'); await sleep(700);
    await p.evaluate(() => window.__dl.setPaused(true));
    const a = await S(p); await sleep(900); const b = await S(p);
    const blocked = await p.evaluate(() => ({ hint: window.__dl.game.debug.tapHint(), pin: window.__dl.game.debug.tapPin("W") }));
    ok("暫停：卡車停在原地、遊戲時鐘不走、按什麼都沒反應", a.driving && b.driving && a.truck.x === b.truck.x && a.truck.z === b.truck.z && a.clock === b.clock && blocked.hint === null && blocked.pin === false, JSON.stringify({ a: a.truck, b: b.truck, c: [a.clock, b.clock] }));
    await p.evaluate(() => window.__dl.setPaused(false)); await sleep(400);
    const c = await S(p);
    ok("繼續：卡車接著開", c.truck.x !== b.truck.x || c.truck.z !== b.truck.z || c.pos === "R");
    await waitIdle(p);
    ok("繼續：開到小熊家", (await S(p)).pos === "R");
    // 計時凍結：暫停中閒置提示不會亮（假的 gLater 會凍結）
    await p.goto(LAB + "?mute=1&clean=1&seed=5&hint=1&task=2"); await p.waitForFunction(() => window.__dl && window.__dl.ready);
    await p.evaluate(() => window.__dl.setPaused(true)); await waitReady(p); await sleep(1800);   // 還沒開始就先暫停（頭幾格軟體算圖可能超過 1 秒）
    const pulseWhilePaused = await p.evaluate(() => !!document.querySelector(".dlv-hint.dlv-pulse"));
    await p.evaluate(() => window.__dl.setPaused(false)); await sleep(1500);
    const pulseAfter = await p.evaluate(() => !!document.querySelector(".dlv-hint.dlv-pulse"));
    ok("暫停：閒置提示的計時凍結（暫停中不亮、繼續後才亮）", !pulseWhilePaused && pulseAfter, JSON.stringify({ pulseWhilePaused, pulseAfter }));
    ok("第 6 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑦ 版面：五種尺寸 × 任務 3／8（＋開車中、交貨的一刻） =====
  const fontLog = [];
  for (const [w, h, tag] of [[1180, 820, "ipad11_land"], [1024, 768, "ipad_land"], [1366, 1024, "ipadpro_land"], [844, 390, "phone_land"], [768, 1024, "ipad_port"]]) {
    const { ctx, p, errs } = await open(browser, w, h, "seed=2&fast=3&ann=1");   // ann＝跟主程式一樣加注音（量字級、寬度才準）
    await p.waitForFunction(() => window.__dl.ann, null, { timeout: 8000 });
    for (const ti of [2, 7]) {
      await startTask(p, ti); await sleep(1400);
      const m = await p.evaluate(() => {
        const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
        const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
        const inView = a => a.l >= -1 && a.t >= -1 && a.r <= innerWidth + 1 && a.b <= innerHeight + 1;
        const cardsR = qa(".dlv-card").map(R), orders = cardsR.reduce((u, c) => ({ l: Math.min(u.l, c.l - c.w * 0.1), t: Math.min(u.t, c.t - c.h * 0.1), r: Math.max(u.r, c.r + c.w * 0.08), b: Math.max(u.b, c.b) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
        const tools = qa(".dlv-tools .dlv-btn:not(.dlv-hide)").map(R), shelf = R(q(".dlv-shelf")), cargo = R(q(".dlv-cargo")), hud = ["homeBtn", "musicBtn"].map(id => R(document.getElementById(id)));
        const ui = { orders, shelf, cargo, ...Object.fromEntries(tools.map((t, i) => ["tool" + i, t])), ...Object.fromEntries(hud.map((t, i) => ["hud" + i, t])) };
        const names = Object.keys(ui), over = [];
        for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (hit(ui[names[i]], ui[names[j]])) over.push(names[i] + "×" + names[j]);
        const L = window.__dl.game.debug.layout(), map = { l: L.map.x, t: L.map.y, r: L.map.x + L.map.w, b: L.map.y + L.map.h };
        const pins = qa(".dlv-pin:not(.dlv-here):not(.dlv-off)").map(b => ({ id: b.dataset.node, ...R(b) }));
        const pinOut = pins.filter(pn => !(pn.l >= map.l - 2 && pn.r <= map.r + 2 && pn.t >= map.t - 2 && pn.b <= map.b + 2)).map(pn => pn.id);
        const pinHit = pins.filter(pn => Object.values(ui).some(u => hit(pn, u))).map(pn => pn.id);
        const pinPin = []; for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) if (hit(pins[i], pins[j])) pinPin.push(pins[i].id + "×" + pins[j].id);
        const truck = R(q(".dlv-truckhit")), truckIn = truck.l + truck.w / 2 >= map.l && truck.l + truck.w / 2 <= map.r && truck.t + truck.h / 2 >= map.t && truck.t + truck.h / 2 <= map.b;
        const small = [...qa(".dlv-btn:not(.dlv-hide)"), ...qa(".dlv-pin"), ...qa(".dlv-good"), ...qa(".dlv-slot"), ...qa(".dlv-reshit"), q(".dlv-truckhit")].map(R).filter(r => r.w < 55.5 || r.h < 55.5).length;
        const allIn = [orders, shelf, cargo, ...tools].every(inView);
        return { over, pinOut, pinHit, pinPin, truckIn, small, allIn, scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, k: window.__dl.game.debug.layout() && Math.round(window.__dl.game.debug.layout().map.h), truckPx: Math.round(truck.w) };
      });
      ok(`版面 ${w}×${h} 任務 ${ti + 1}：UI 都在畫面內、互不重疊、不擋主程式 🏠🎵、不捲動`, m.allIn && !m.over.length && !m.scroll, JSON.stringify(m));
      ok(`版面 ${w}×${h} 任務 ${ti + 1}：圖釘在地圖區、不壓到 UI、不互疊；卡車在地圖區；點擊區都 ≥56px`, !m.pinOut.length && !m.pinHit.length && !m.pinPin.length && m.truckIn && m.small === 0, JSON.stringify(m));
      // 寧次 10-12：訂單卡名稱字級（藏圖關只能讀這行）＋車廂面板右邊留邊
      const fz = await p.evaluate(() => {
        const vm = Math.min(innerWidth, innerHeight) / 100;
        const L = [...document.querySelectorAll(".dlv-card-name")].map(n => { const ac = n.querySelector(".ac[data-z]"), c = n.closest(".dlv-card").getBoundingClientRect(), r = n.getBoundingClientRect();
          return { fs: parseFloat(getComputedStyle(n).fontSize), zy: ac ? parseFloat(getComputedStyle(ac, "::after").fontSize) : 0, fit: r.left >= c.left - 0.5 && r.right <= c.right + 0.5 }; });
        const cg = document.querySelector(".dlv-cargo").getBoundingClientRect();
        return { vm: +vm.toFixed(2), fs: +Math.min(...L.map(x => x.fs)).toFixed(1), zy: +Math.min(...L.map(x => x.zy)).toFixed(1), fit: L.every(x => x.fit), n: L.length, card: Math.round(parseFloat(document.querySelector(".dlv-wrap").style.getPropertyValue("--card"))), edge: +(innerWidth - cg.right).toFixed(1) };
      });
      fontLog.push(`${w}×${h} 任務${ti + 1}：卡 ${fz.card}px、國字 ${fz.fs}px（${(fz.fs / fz.vm).toFixed(2)}vmin）、注音 ${fz.zy}px`);
      const ipad = Math.min(w, h) >= 700;   // iPad：國字 ≥35.3px（1024×768 的 4.6vmin）、注音 ≥13.4px；手機（844×390）放不下，至少 4.6vmin
      ok(`字級 ${w}×${h} 任務 ${ti + 1}：訂單名稱${ipad ? "國字 ≥35.3px、注音 ≥13.4px" : "≥4.6vmin"}、整行在卡片內；車廂面板離右邊 ≥ 1.6vmin`, fz.n > 0 && (ipad ? fz.fs >= 35.3 && fz.zy >= 13.4 : fz.fs >= 4.6 * fz.vm - 0.1) && fz.fit && fz.edge >= 1.6 * fz.vm, JSON.stringify(fz));
      await shot(p, `${tag}_T${ti + 1}_start`);
      if (ti === 2) {   // 任務 3（有字的關）裝一件：車廂國字＝白底膠囊深咖啡字（寧次 10-12：白字配橘底只有 2.1–2.8:1）
        await act(p, { type: "load", g: "milk" }); await sleep(500);
        const sl = await p.evaluate(() => { const n = document.querySelector(".dlv-slot:not(.dlv-empty) .dlv-good-name"), e = document.querySelector(".dlv-slot.dlv-empty .dlv-good-name"), cs = getComputedStyle(n);
          const lum = s => { const [r, g, b] = s.match(/\d+/g).map(Number).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          return { color: cs.color, bg: cs.backgroundColor, cr: +((lum("rgb(255,255,255)") + 0.05) / (lum(cs.color) + 0.05)).toFixed(2), shadow: cs.textShadow, emptyBg: e ? getComputedStyle(e).backgroundColor : "-" }; });
        ok(`車廂國字 ${w}×${h}：白底膠囊、深咖啡字對比 ≥4.5、沒有字陰影；空格不畫白底`, sl.bg === "rgb(255, 255, 255)" && sl.cr >= 4.5 && sl.shadow === "none" && /rgba\(0, 0, 0, 0\)|transparent/.test(sl.emptyBg), JSON.stringify(sl));
        await shot(p, `${tag}_T3_loaded`);
      }
    }
    // 開車中、交貨的一刻（任務 8）
    await act(p, { type: "load", g: "watermelon" }); await act(p, { type: "load", g: "banana" }); await sleep(300);
    await shot(p, `${tag}_T8_loaded`);
    await p.click('.dlv-pin[data-node="B"]'); await sleep(900); await shot(p, `${tag}_T8_driving`);
    await waitIdle(p); const k = (await S(p)).cargo.indexOf("watermelon"); await p.click(`.dlv-slot[data-k="${k}"]`); await sleep(250); await shot(p, `${tag}_T8_deliver`);
    if (w === 1180) {   // relayout：橫轉直
      const f0 = await p.evaluate(() => window.__dl.game.debug.layout().map.w);
      await p.setViewportSize({ width: 820, height: 1180 }); await p.evaluate(() => window.__dl.game.relayout()); await sleep(200);
      const m2 = await p.evaluate(() => ({ land: window.__dl.game.debug.layout().land, w: window.__dl.game.debug.layout().map.w, port: !!document.querySelector(".dlv-wrap.dlv-port") }));
      ok("relayout()：橫轉直重算版面", !m2.land && m2.port && Math.abs(m2.w - f0) > 5, JSON.stringify({ f0, ...m2 }));
    }
    ok(`版面 ${w}×${h}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  console.log("\n訂單卡字級（DOM 實測）：\n  " + fontLog.join("\n  "));

  // ===== ⑧ start/stop 5 次：WebGL context 不洩漏、rAF 停 =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "seed=1");
    const before = await p.evaluate(() => window.__dl.game.debug.ctx());
    const cyc = [];
    for (let k = 0; k < 5; k++) {
      await p.evaluate(k => window.__dl.game.start(k % 8), k); await waitReady(p); await sleep(200);
      cyc.push(await p.evaluate(() => ({ live: window.__dl.game.debug.ctx().live, canvases: document.querySelectorAll("#dlvRoot canvas").length, geos: window.__dl.game.debug.worldStats().geos })));
      cyc[cyc.length - 1].oldCv = await p.evaluate(() => { const cv = document.querySelector("#dlvRoot canvas"); window.__dl.game.stop(); return cv.width + "x" + cv.height; }); await sleep(120);   // stop 後舊畫布縮成 1×1（Safari 放掉背景緩衝）
    }
    ok("stop()：舊畫布縮成 1×1（里維 10-12）", cyc.every(c => c.oldCv === "1x1"), cyc.map(c => c.oldCv).join());
    const after = await p.evaluate(() => ({ ctx: window.__dl.game.debug.ctx(), canvases: document.querySelectorAll("canvas").length, kids: document.getElementById("dlvRoot").children.length, cls: document.getElementById("dlvRoot").className, st: window.__dl.game.state() }));
    ok("start/stop 5 次：每次只有 1 個 context、stop 後全部釋放（live＝0）、canvas 移除、root 清空", cyc.every(c => c.live === 1 && c.canvases === 1) && after.ctx.live === 0 && after.ctx.made === before.made + 5 && after.canvases === 0 && after.kids === 0 && !after.cls && after.st === null, JSON.stringify({ before, cyc, after }));
    // 開車中 stop：之後的計時器全部作廢
    await p.evaluate(() => { window.__dl.calls.win.length = 0; window.__dl.game.start(0); }); await waitReady(p);
    await act(p, { type: "load", g: "hat" }); await p.click('.dlv-pin[data-node="B"]'); await sleep(300);
    await p.evaluate(() => window.__dl.game.stop()); await sleep(2500);
    ok("開車中 stop()：沒有殘留 DOM、沒有 onWin、context 已釋放", await p.evaluate(() => document.getElementById("dlvRoot").children.length === 0 && window.__dl.calls.win.length === 0 && window.__dl.game.debug.ctx().live === 0));
    await p.evaluate(() => window.__dl.game.start(3)); await waitReady(p);
    ok("stop() 後重新 start 正常", (await S(p)).task === 3 && await p.evaluate(() => document.querySelectorAll("#dlvRoot .dlv-wrap").length === 1));
    ok("第 8 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== ⑧-2 createWorld 建到一半丟錯（里維 10-12）：renderer／WebGL context 要收掉再丟出去，start() 走 onFail =====
  {
    const { ctx, p, errs } = await open(browser, 1024, 768, "seed=1&failbuild=1");
    const r = await p.evaluate(async () => {
      window.__gl = { made: 0, lost: 0 };
      const g = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) { const had = this.__glc, c = g.call(this, t, ...a); if (c && /webgl/.test(t) && !had) { this.__glc = c; window.__gl.made++; this.addEventListener("webglcontextlost", () => { window.__gl.lost++; }, { once: true }); } return c; };
      const d = window.__dl, before = d.game.debug.ctx(); d.calls.fail = [];
      for (let k = 0; k < 3; k++) { d.game.start(k); await new Promise(r => setTimeout(r, 150)); }
      for (let k = 0; k < 30 && window.__gl.lost < window.__gl.made; k++) await new Promise(r => setTimeout(r, 100));
      return { before, after: d.game.debug.ctx(), gl: window.__gl, canvases: document.querySelectorAll("#dlvRoot canvas").length, fail: d.calls.fail.map(f => f.why), ready: !!(d.game.state() && d.game.state().ready) };
    });
    ok("⑧-2 建場景丟錯 3 次：每次建的 context 都釋放（live 回 0、建立數＝釋放數）、沒有殘留 canvas、走 onFail(nowebgl)", r.after.made === r.before.made + 3 && r.after.live === 0 && r.gl.made === 3 && r.gl.lost === 3 && r.canvases === 0 && r.fail.join() === "nowebgl,nowebgl,nowebgl", JSON.stringify(r));
    await p.evaluate(() => window.__dl.game.stop());
    ok("⑧-2 沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // ===== ⑨ 國字都有注音（開主程式的自動注音：字典沒收的字＝0、遊戲裡沒有裸國字） =====
  {
    const { ctx, p, errs } = await open(browser, 1180, 820, "ann=1&seed=4&fast=3");
    await p.waitForFunction(() => window.__dl.ann, null, { timeout: 8000 });
    const bare = async () => p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.getElementById("dlvRoot"), NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (/[㐀-鿿]/.test(n.data) && !(e && e.closest(".ac[data-z]"))) out.push(n.data.trim()); } return out; });
    const res = [];
    for (const ti of [2, 7]) { await startTask(p, ti); await sleep(600); res.push(await bare()); }
    // 對話泡泡、送錯、過關橫幅、禮物
    await startTask(p, 0); await act(p, { type: "load", g: "apple" }); await act(p, { type: "drive", to: "B" }); await waitIdle(p);
    await p.click('.dlv-slot[data-k="0"]'); await sleep(450); res.push(await bare());
    await waitIdle(p); await act(p, { type: "drive", to: "W" }); await waitIdle(p); await act(p, { type: "unload", slot: 0 }); await act(p, { type: "load", g: "hat" });
    await act(p, { type: "drive", to: "B" }); await waitIdle(p); await p.click('.dlv-slot[data-k="0"]');
    await p.waitForFunction(() => document.querySelector(".dlv-banner"), null, { timeout: 8000 }); await sleep(200); res.push(await bare());
    await p.waitForFunction(() => document.querySelector(".dlv-gift .dlv-gift-t .ac"), null, { timeout: 8000, polling: 20 });
    const giftFit = await p.evaluate(() => { const c = document.querySelector(".dlv-gift").getBoundingClientRect(), t = document.querySelector(".dlv-gift-t").getBoundingClientRect(); return { ok: t.left >= c.left - 1 && t.right <= c.right + 1, c: [c.left, c.right].map(Math.round), t: [t.left, t.right].map(Math.round) }; });
    ok("禮物卡：加了注音的「送你X！」整句在卡片內", giftFit.ok, JSON.stringify(giftFit));
    await sleep(150); res.push(await bare());
    await shot(p, "land_ann_gift");
    // 任務 4 不按提示照最佳解打完：兩張「自己讀到的！」章＋「🚚 一趟就送完！」徽章，也都要有注音；星星一顆一顆蹦、每顆一聲 star
    await startTask(p, 3); await p.evaluate(() => { window.__dl.calls.play.length = 0; }); await playBest(p);
    await p.waitForFunction(() => document.querySelector(".dlv-badge .ac"), null, { timeout: 10000, polling: 20 }).catch(() => {});
    await p.waitForFunction(() => { const s = window.__dl.game.state(); return s.banner && s.banner.pops === 3; }, null, { timeout: 8000, polling: 20 }).catch(() => {});
    const t4 = await p.evaluate(() => { const b = window.__dl.game.state().banner || {}; return { stamps: document.querySelectorAll(".dlv-card-self").length, badge: !!b.badge, info: b.info, pops: b.pops, starSnd: window.__dl.calls.play.filter(n => n === "star").length }; });
    res.push(await bare()); await shot(p, "land_T4_win_badge");
    ok("結算（一般關）：路線最佳出「🚚 一趟就送完！」徽章、不顯示趟數小字；藏圖自己讀對的蓋章；星星一顆一顆蹦＋每顆一聲", t4.stamps === 2 && t4.badge && !t4.info && t4.pops === 3 && t4.starSnd === 3, JSON.stringify(t4));
    const missing = await p.evaluate(() => [...window.__dl.ann.missing]);
    ok("注音：遊戲畫面的國字全部有注音（字典沒漏字、沒有裸國字）", res.every(x => x.length === 0) && missing.length === 0, JSON.stringify({ bare: res.filter(x => x.length), missing }));
    // 原始碼裡所有國字都在字典裡（不只畫面上出現過的）
    const dict = fs.readFileSync(path.join(__dirname, "../../js/zhuyin-ui.js"), "utf8"), src = fs.readFileSync(path.join(__dirname, "../../js/zhuyin-deliver.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/console\.warn\([^\n]*?\)/g, "");
    const zchar = JSON.parse(dict.match(/export const ZCHAR = (\{.*?\});/)[1]);
    const used = new Set((src.match(/[㐀-鿿]/g) || [])), lack = [...used].filter(c => !zchar[c]);
    ok("注音字典：zhuyin-deliver.js 用到的國字全部收進 ZCHAR", lack.length === 0, lack.join(""));
    ok("第 9 段：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  await browser.close();
  ok("全程 0 個 console error／頁面錯誤", allErrs.length === 0, allErrs.slice(0, 5).join(" | "));
  console.log("\n" + results.join("\n"));
  const fails = results.filter(r => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - fails}/${results.length} PASS　截圖：${SHOTS}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
