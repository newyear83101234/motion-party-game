// 彩虹配送站接進主程式的測試（10-12）：node tools/zy-test/deliver-game.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 DELIVER_GAME_SHOTS（預設 %TEMP%\zy-deliver-game）。
// 驗：①小島 → 彩虹島 → 點配送站 → 進遊戲（主程式「再聽」藏起來、沒有進度點、配送站音樂、第一次唸開場語、場景準備好）
//     ②自動通關任務 1（模組 debug 求解器，走跟手指一樣的入口）→ 結算：全部送到了、星數＝onWin、「下一關」、結算語音、3D 場景收掉
//     ③存檔 zy1_deliver＝{lv:1, stars:{0:3}}、禮物（小花）進衣櫃、沒送錯的商品詞（帽子）有貼紙
//     ④下一關＝任務 2 ⑤暫停選單：暫停時遊戲時鐘不走、繼續會走；回小島＝場景收乾淨、不留「繼續玩」
//     ⑥再點配送站＝選關對話框（12 格：第 1 關 3 星、第 2 關黃框、其他鎖著）⑦重玩第 1 關不再送禮
//     ⑧換裝畫面：小花可以穿 ⑨存檔重開仍在 ⑩備份碼帶配送站進度 ⑪最後一關過了＝「選關」鈕、all＝1、彩虹披風進衣櫃
//     ⑫全程 0 個 console error、新字都有注音 ⑬WebGL 要不到＝回小島 ⑭送完最後一件馬上按 🏠：存檔已更新（onSave）
const { launch, openGame } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const SHOTS = process.env.DELIVER_GAME_SHOTS || path.join(os.tmpdir(), "zy-deliver-game");
fs.mkdirSync(SHOTS, { recursive: true });
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.stringify(x);
const Q = "debug&novoice&night=0&weather=sunny";
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
const hubReady = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 30000 }).then(() => sleep(600));
const spoken = p => p.evaluate(() => window.__spoken.map(s => s.text));
const want = p => p.evaluate(() => window.__zyAudio ? window.__zyAudio.debug().want : "?");
const LS = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const DS = p => p.evaluate(() => window.__zy.deliver && window.__zy.deliver.state());
const inDeliver = p => p.waitForFunction(() => window.__zy.mode === "deliver" && !document.getElementById("deliver").classList.contains("hidden") && window.__zy.deliver && window.__zy.deliver.state() && window.__zy.deliver.state().ready, null, { timeout: 30000 }).then(() => true, () => false);
const resultOn = p => p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 30000 }).then(() => true, () => false);
// 自動通關（模組的求解器一步一步點；最多 3 分鐘）
const autoWin = p => p.evaluate(() => Promise.race([window.__zy.deliver.debug.autoPlay(120), new Promise(r => setTimeout(() => r(null), 180000))]));
const finishResult = async p => { await sleep(900); await p.evaluate(() => document.getElementById("result").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(700); };
const spot = (p, m) => p.evaluate(m => {
  const h = window.__hub3d, c = h.screenOf(m);
  for (let r = 0; r <= 90; r += 6) for (let a = 0; a < 360; a += r ? 30 : 360) {
    const x = c.x + Math.cos(a * Math.PI / 180) * r, y = c.y + Math.sin(a * Math.PI / 180) * r, e = document.elementFromPoint(x, y);
    if (e && e.tagName === "CANVAS" && h.hitAt(x, y) === m) return { x, y };
  }
  return null;
}, m);
// 10-12 介紹卡：點一下建築＝開介紹卡（貓頭鷹唸名字），介紹卡開著再點同一棟＝開始 → 這裡的「點 3D 建築進遊戲」都是點兩下；
// 第二下之前把唸過的話清掉（後面驗「進遊戲後唸了什麼」，不算介紹卡唸的名字）
const pickOn = (p, m) => p.waitForFunction(m => { const b = document.getElementById("pick"); return !b.classList.contains("hidden") && b.dataset.mode === m && window.__hub3d.sel() === m; }, m, { timeout: 5000 }).then(() => true, () => false);
const tap3d = async (p, m) => { for (let k = 0; k < 3; k++) { const s = await spot(p, m); if (!s) { await sleep(500); continue; }
  await p.mouse.click(s.x, s.y); if (!(await pickOn(p, m))) continue; await sleep(900); const s2 = await spot(p, m); if (!s2) continue;
  await p.evaluate(() => { if (window.__spoken) window.__spoken = []; }); await p.mouse.click(s2.x, s2.y); return s2; } return null; };
async function reopen(p) {
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
  await sleep(300); await p.evaluate(() => { window.__spoken = []; });
}

(async () => {
  const browser = await launch(); const allErrs = [];
  const { ctx, p, errs } = await openGame(browser, { stickers: 40, query: Q });
  // 開場語要唸：openGame 把 8 個舊模式設成聽過，配送站沒有（第一次玩）
  await hubReady(p);
  const had帽子 = await p.evaluate(() => !!JSON.parse(localStorage.getItem("zy1_stickers"))["帽子"]);

  // ① 小島 → 彩虹島 → 配送站
  await p.evaluate(() => document.getElementById("rainbowBtn").click()); await sleep(3600);
  await p.evaluate(() => { window.__spoken = []; });
  const sd = await tap3d(p, "deliver");
  const in1 = await inDeliver(p);
  const ui = await p.evaluate(() => ({ speak: document.getElementById("speakBtn").classList.contains("hidden"), prog: document.getElementById("progress").classList.contains("hidden"), home: getComputedStyle(document.getElementById("homeBtn")).visibility, kids: document.getElementById("deliverRoot").children.length, hub: window.__hub3d.running }));
  ok("① 點彩虹島的配送站兩下（介紹卡 → 開始）→ 進遊戲、場景準備好", !!sd && in1, J({ sd, in1 }));
  ok("① 主程式「再聽」藏起來（配送站右上自己有 💡／🔊）、沒有進度點、🏠 在、3D 小島停止渲染", ui.speak && ui.prog && ui.home !== "hidden" && ui.kids > 0 && !ui.hub, J(ui));
  ok("① 配送站音樂（road）", (await want(p)) === "road", await want(p));
  await sleep(2500);
  const sp1 = await spoken(p);
  ok("① 第一次玩：唸開場語「把貨物送到大家的家！」，居民的話排在後面（我要帽子！）", sp1[0] === "把貨物送到大家的家！" && sp1.includes("我要帽子！"), J(sp1));
  await shot(p, "deliver-play-task1");

  // ② 自動通關任務 1 → 結算
  const w1 = await autoWin(p);
  const r1 = await resultOn(p);
  await finishResult(p);
  const res = await p.evaluate(() => ({ text: document.getElementById("resultText").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), stars: document.querySelectorAll("#resultStars .star.on").length, again: document.getElementById("againBtn").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""),
    kids: document.getElementById("deliverRoot").children.length, mode: window.__zy.mode, stickers: [...document.querySelectorAll("#resultStickers .sticker .hz")].map(e => e.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")) }));
  ok("② 自動通關任務 1：onWin 有星星、禮物＝小花、訂單沒送錯", !!w1 && w1.task === 0 && w1.stars === 3 && w1.gift === "flower" && Array.isArray(w1.orders) && w1.orders.every(o => o.wrong === 0), J(w1));
  ok("② 結算：全部送到了、星數＝onWin（3 顆）、「下一關」鈕", r1 && res.text.includes("全部送到了") && res.stars === w1.stars && res.again.includes("下一關"), J(res));
  ok("② 結算時 3D 場景已收掉（#deliverRoot 清空）", res.kids === 0 && res.mode === "deliver", J(res));
  const sp2 = await spoken(p);
  ok("② 結算語音：新貼紙就唸「拿到 1 張新貼紙！」，沒有就唸「東西都送到了，好厲害！」", had帽子 ? sp2.includes("東西都送到了，好厲害！") : sp2.includes("拿到 1 張新貼紙！"), J(sp2.slice(-4)));
  await shot(p, "deliver-result-task1");
  // ③ 存檔
  const dv = await LS(p, "zy1_deliver"), rw = await LS(p, "zy1_rewards"), stk = await LS(p, "zy1_stickers");
  ok("③ 存檔 zy1_deliver＝{lv:1, stars:{0:3}}", dv && dv.lv === 1 && dv.stars && dv.stars["0"] === 3 && !dv.all, J(dv));
  ok("③ 禮物小花進衣櫃", rw.closet.includes("flower"), J(rw.closet));
  ok("③ 沒送錯的商品詞「帽子」有貼紙" + (had帽子 ? "（本來就有）" : "（新貼上、結算有顯示）"), !!stk["帽子"] && (had帽子 || res.stickers.includes("帽子")), J(res.stickers));

  // ④ 下一關
  await p.evaluate(() => document.getElementById("againBtn").click());
  const in4 = await inDeliver(p); let s = await DS(p);
  ok("④ 下一關 → 任務 2", in4 && s.task === 1, J(s && { task: s.task }));

  // ⑤ 暫停選單
  await sleep(600);
  await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300);
  const c0 = (await DS(p)).clock; await sleep(1200); const c1 = (await DS(p)).clock;
  const conf = await p.evaluate(() => !document.getElementById("confirm").classList.contains("hidden"));
  await shot(p, "deliver-pause");
  await p.evaluate(() => document.getElementById("confirmNo").click()); await sleep(1000);
  const c2 = (await DS(p)).clock;
  ok("⑤ 🏠＝暫停選單：暫停時遊戲時鐘不走、按繼續又會走", conf && Math.abs(c1 - c0) < 0.05 && c2 > c1 + 0.3, J({ c0, c1, c2 }));
  await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(1000);
  const back = await p.evaluate(() => ({ mode: window.__zy.mode, menu: !document.getElementById("menu").classList.contains("hidden"), kids: document.getElementById("deliverRoot").children.length, resume: !document.getElementById("resumeBtn").classList.contains("hidden"), hub: window.__hub3d.running }));
  ok("⑤ 回小島：場景收乾淨、不留「繼續玩」、小島繼續渲染", back.mode === null && back.menu && back.kids === 0 && !back.resume && back.hub, J(back));
  ok("⑤ 回小島：選單音樂", ["island", "night", "rainbow", "town"].includes(await want(p)), await want(p));

  // ⑥ 選關對話框
  await p.evaluate(() => document.querySelector(".mode-card[data-mode=deliver]").click()); await sleep(500);
  const pk = await p.evaluate(() => { const bs = [...document.querySelectorAll("#deliverLevels .bb-lv")]; return { vis: !document.getElementById("deliverPick").classList.contains("hidden"), n: bs.length, s0: bs[0] && bs[0].querySelector(".s").textContent, next: bs.findIndex(b => b.classList.contains("next")), locked: bs.filter(b => b.disabled).length, mode: window.__zy.mode }; });
  ok("⑥ 過過第 1 關後點配送站＝選關對話框：12 格（10-13 加到 12 關）、第 1 關 3 星、第 2 關黃框、10 格鎖著、還沒進遊戲", pk.vis && pk.n === 12 && pk.s0 === "⭐⭐⭐" && pk.next === 1 && pk.locked === 10 && pk.mode === null, J(pk));
  await shot(p, "deliver-pick");
  // ⑦ 重玩第 1 關：不再送禮
  const closet0 = (await LS(p, "zy1_rewards")).closet.length;
  await p.evaluate(() => document.querySelectorAll("#deliverLevels .bb-lv")[0].click());
  const in7 = await inDeliver(p); s = await DS(p);
  const w7 = await autoWin(p); await resultOn(p); await finishResult(p);
  ok("⑦ 選第 1 關重玩：onWin 沒有禮物、衣櫃件數不變、星星維持", in7 && s.task === 0 && w7 && w7.gift === null && (await LS(p, "zy1_rewards")).closet.length === closet0 && (await LS(p, "zy1_deliver")).stars["0"] === 3, J({ gift: w7 && w7.gift, closet0 }));

  // ⑧ 換裝：小花能穿
  await p.evaluate(() => document.getElementById("menuBtn").click()); await sleep(800);
  await p.evaluate(() => document.getElementById("albumBtn").click()); await sleep(800);
  await p.evaluate(() => document.querySelector("#albumTabs .tab.pets").click()); await sleep(600);
  await p.click("#dressBtn");
  await p.waitForFunction(() => window.__zy.dress && window.__zy.dress.debug.state().open, null, { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => window.__zy.dress.debug.ready());
  const fl = await p.evaluate(() => !document.querySelector('.dr-item[data-id="flower"]').classList.contains("lock"));
  await p.click('.dr-item[data-id="flower"]'); await p.evaluate(() => window.__zy.dress.debug.ready()); await sleep(1800);
  ok("⑧ 換裝畫面：送貨拿到的小花可以穿（穿上了）", fl && (await p.evaluate(() => window.__zy.dress.debug.state().worn.includes("flower"))), String(fl));
  await shot(p, "deliver-gift-in-closet");
  await p.click(".dr-done"); await sleep(800);

  // ⑨ 存檔重開仍在
  await reopen(p);
  const dv9 = await p.evaluate(() => window.__zy.deliverSave), rw9 = await LS(p, "zy1_rewards");
  ok("⑨ 重開頁面：配送站進度（lv 1、第 1 關 3 星）與小花都還在", dv9.lv === 1 && dv9.stars[0] === 3 && rw9.closet.includes("flower"), J({ dv9, closet: rw9.closet }));

  // ⑩ 備份碼
  const code = await p.evaluate(() => window.__zyB.exportCode());
  await p.evaluate(() => localStorage.removeItem("zy1_deliver")); await reopen(p);
  const gone = (await p.evaluate(() => window.__zy.deliverSave)).lv === 0;
  const ir = await p.evaluate(c => window.__zyB.importCode(c), code); await reopen(p);
  const dv10 = await p.evaluate(() => window.__zy.deliverSave);
  ok("⑩ 備份碼帶配送站進度：刪掉後還原回來", gone && ir === "ok" && dv10.lv === 1 && dv10.stars[0] === 3, J({ gone, ir, dv10 }));
  const bad = await p.evaluate(() => { const d = window.__zyB.readCode(window.__zyB.exportCode()); return d && d.slots[0] && d.slots[0].deliver; });
  ok("⑩ 備份碼讀回來的配送站資料是乾淨的格式", bad && bad.lv === 1 && J(bad.stars) === J({ 0: 3 }), J(bad));

  // ⑪ 10-13 舊存檔照顧：舊版 8 關都過了（lv:7、all:1、stars 0–7）→ 載入後第 9 關要開起來（lv 8）、all 清掉（12 關都過才算）；第 9–11 關鎖著
  await p.evaluate(() => { localStorage.setItem("zy1_deliver", JSON.stringify({ lv: 7, all: 1, stars: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 } })); }); await reopen(p); await hubReady(p);
  const mig = await p.evaluate(() => window.__zy.deliverSave);
  await p.evaluate(() => document.querySelector(".mode-card[data-mode=deliver]").click()); await sleep(500);
  const pkm = await p.evaluate(() => { const bs = [...document.querySelectorAll("#deliverLevels .bb-lv")]; return { n: bs.length, open: bs.filter(b => !b.disabled).length, next: bs.findIndex(b => b.classList.contains("next")) }; });
  ok("⑪ 舊存檔（8 關都過、all:1）：載入後 lv＝8、all 清掉、選關 12 格裡開 9 格（第 9 關是黃框的下一關）", mig.lv === 8 && !mig.all && pkm.n === 12 && pkm.open === 9 && pkm.next === 8, J({ mig, pkm }));
  await shot(p, "deliver-pick-12");
  await p.evaluate(() => document.getElementById("deliverPickClose").click()); await sleep(300);

  // ⑪b 進階關：任務 9 第一次過關 → 送 1 枚扭蛋幣（沒有換裝）、結算鈕「下一關」；再玩一次不再送
  await p.evaluate(() => document.querySelector(".mode-card[data-mode=deliver]").click()); await sleep(400);
  const own = rw => rw.coins - rw.jarCoins;   // 扭蛋幣裡「不是星星罐給的」那部分（罐子每 10 顆星也會給 1 枚，會跟配送站的幣混在一起）
  const coinsA0 = own(await LS(p, "zy1_rewards")), closetA9 = (await LS(p, "zy1_rewards")).closet.length;
  await p.evaluate(() => document.querySelectorAll("#deliverLevels .bb-lv")[8].click());
  const inn9 = await inDeliver(p);
  const wn9 = await autoWin(p); const rn9 = await resultOn(p);
  const coinCard = await p.evaluate(() => { const g = document.querySelector(".dlv-gift"); return g ? g.textContent : ""; });
  await finishResult(p);
  const resn9 = await p.evaluate(() => ({ again: document.getElementById("againBtn").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") }));
  const dvn9 = await LS(p, "zy1_deliver"), rwn9 = await LS(p, "zy1_rewards");
  ok("⑪b 任務 9 第一次過關：onWin 帶 coin:1、沒有換裝（衣櫃件數不變）、扭蛋幣 +1、存檔 lv 9、結算鈕「下一關」", inn9 && rn9 && wn9 && wn9.task === 8 && wn9.coin === 1 && !wn9.gift && own(rwn9) === coinsA0 + 1 && rwn9.closet.length === closetA9 && dvn9.lv === 9 && dvn9.stars["8"] === wn9.stars && resn9.again.includes("下一關"), J({ wn9: wn9 && { task: wn9.task, stars: wn9.stars, coin: wn9.coin, gift: wn9.gift }, coinsA0, coins1: rwn9.coins, closetA9, closet: rwn9.closet.length, dvn9, resn9, coinCard }));
  // 重玩任務 9：不再送幣
  await p.evaluate(() => document.getElementById("againBtn").click()); await sleep(400);
  await p.evaluate(() => { const ds = document.getElementById("deliverPick"); if (ds.classList.contains("hidden")) document.querySelector(".mode-card[data-mode=deliver]").click(); });
  await sleep(300); await p.evaluate(() => document.querySelectorAll("#deliverLevels .bb-lv")[8].click());
  const inn9b = await inDeliver(p); const wn9b = await autoWin(p); const rn9b = await resultOn(p); await finishResult(p);
  const rwn9b = await LS(p, "zy1_rewards");
  ok("⑪b 重玩任務 9：coin＝0、扭蛋幣沒有再增加", inn9b && rn9b && wn9b && wn9b.task === 8 && !wn9b.coin && own(rwn9b) === coinsA0 + 1, J({ wn9b: wn9b && { task: wn9b.task, coin: wn9b.coin }, coins: own(rwn9b), want: coinsA0 + 1 }));

  // ⑪c 最後一關（任務 12：5 張單、容量 2、吊橋＋單行道）過了 →「選關」、all＝1、再 +1 枚扭蛋幣
  await p.evaluate(() => { const o = JSON.parse(localStorage.getItem("zy1_deliver")); localStorage.setItem("zy1_deliver", JSON.stringify({ lv: 11, stars: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3 } })); }); await reopen(p); await hubReady(p);
  const coinsB = own(await LS(p, "zy1_rewards"));
  await p.evaluate(() => document.querySelector(".mode-card[data-mode=deliver]").click()); await sleep(400);
  await p.evaluate(() => document.querySelectorAll("#deliverLevels .bb-lv")[11].click());
  const in11 = await inDeliver(p);
  await shot(p, "deliver-play-task12");
  const w11 = await autoWin(p); const r11 = await resultOn(p); await finishResult(p);
  const res11 = await p.evaluate(() => ({ again: document.getElementById("againBtn").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), stars: document.querySelectorAll("#resultStars .star.on").length }));
  const dv11 = await LS(p, "zy1_deliver"), rw11 = await LS(p, "zy1_rewards");
  ok("⑪c 任務 12 通關：結算鈕改成「選關」、all＝1、扭蛋幣 +1", in11 && r11 && w11 && w11.task === 11 && w11.coin === 1 && res11.again.includes("選關") && res11.stars === w11.stars && dv11.all === 1 && dv11.stars["11"] === w11.stars && own(rw11) === coinsB + 1, J({ w11: w11 && { task: w11.task, stars: w11.stars, trips: w11.trips, best: w11.bestTrips, coin: w11.coin }, res11, dv11, coinsB, coins: own(rw11) }));
  await p.evaluate(() => document.getElementById("againBtn").click()); await sleep(500);
  ok("⑪c 按「選關」→ 打開選關（12 關都開、沒有黃框）", await p.evaluate(() => !document.getElementById("deliverPick").classList.contains("hidden") && [...document.querySelectorAll("#deliverLevels .bb-lv")].length === 12 && [...document.querySelectorAll("#deliverLevels .bb-lv")].every(b => !b.disabled) && !document.querySelector("#deliverLevels .bb-lv.next")));
  await shot(p, "deliver-pick-all");
  await p.evaluate(() => document.getElementById("deliverPickClose").click()); await sleep(300);

  const miss = await p.evaluate(() => [...window.__zy.zMissing].join(""));
  ok("⑫ 新字都有注音（zMissing 空）", miss === "", miss);
  allErrs.push(...errs); await ctx.close();

  // ⑬ 3D 場景開不了（WebGL 要不到）：模組 onFail → 貓頭鷹說一句、回小島，不會卡在空白畫面
  {
    const { ctx: c2, p: q, errs: e2 } = await openGame(browser, { stickers: 40, query: Q + "&no3d" });
    await q.evaluate(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
    await q.evaluate(() => document.querySelector(".mode-card[data-mode=deliver]").click());
    const backF = await q.waitForFunction(() => window.__zy.mode === null && !document.getElementById("menu").classList.contains("hidden") && document.getElementById("guideText").textContent.includes("配送站現在打不開"), null, { timeout: 20000 }).then(() => true, () => false);
    const st13 = await q.evaluate(() => ({ mode: window.__zy.mode, kids: document.getElementById("deliverRoot").children.length, resume: !document.getElementById("resumeBtn").classList.contains("hidden") }));
    ok("⑬ WebGL 要不到：說「配送站現在打不開…」、回小島、場景收乾淨、不留「繼續玩」", backF && st13.kids === 0 && !st13.resume, J(st13));
    const real = e2.filter(x => !/WebGL|THREE/i.test(x));   // three.js 自己印的「建立 WebGL 失敗」是預期的
    ok("⑬ 沒有其他錯誤（three.js 的 WebGL 失敗訊息除外）", real.length === 0, real.join(" | ").slice(0, 300));
    await c2.close();
  }

  // ⑭ 送完最後一件 0.5 秒內按 🏠 → 回小島：進度、星星、禮物、貼紙已經存好（里維 10-12：以前要等 3.6–6 秒的過關演出跑完才存，中間回家全丟）
  {
    const { ctx: c3, p: q, errs: e3 } = await openGame(browser, { stickers: 40, query: Q });
    await hubReady(q);
    const had = await q.evaluate(() => !!JSON.parse(localStorage.getItem("zy1_stickers"))["帽子"]);
    await q.evaluate(() => document.querySelector(".mode-card[data-mode=deliver]").click());
    const in14 = await inDeliver(q);
    const r14 = await q.evaluate(async () => {
      const w = await Promise.race([window.__zy.deliver.debug.autoPlay(120), new Promise(r => setTimeout(() => r(null), 180000))]);
      const s = window.__zy.deliver.state(), t0 = performance.now();
      document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click();   // 演出才剛開始：馬上回小島
      return { w: w && { task: w.task, stars: w.stars, gift: w.gift }, won: !!(s && s.won), banner: !!document.querySelector(".dlv-banner"), dt: Math.round(performance.now() - t0), mode: window.__zy.mode };
    });
    const dv = await LS(q, "zy1_deliver"), rwq = await LS(q, "zy1_rewards"), stq = await LS(q, "zy1_stickers");
    ok("⑭ 送完最後一件、演出還沒跑完（橫幅還沒出來）就按 🏠：已經回小島", in14 && r14.won && !r14.banner && r14.mode === null, J(r14));
    ok("⑭ 回小島時存檔已更新：zy1_deliver＝{lv:1, stars:{0:3}}、小花進衣櫃、「帽子」貼紙", dv && dv.lv === 1 && dv.stars && dv.stars["0"] === 3 && rwq && rwq.closet.includes("flower") && !!stq["帽子"], J({ dv, closet: rwq && rwq.closet, had }));
    await sleep(7000);   // 原本的 onWin 時間點（6 秒）過了：不會跳結算、不會重複存
    const late = await q.evaluate(() => ({ mode: window.__zy.mode, result: !document.getElementById("result").classList.contains("hidden"), menu: !document.getElementById("menu").classList.contains("hidden"), kids: document.getElementById("deliverRoot").children.length }));
    const dv2 = await LS(q, "zy1_deliver");
    ok("⑭ 7 秒後：還在小島、沒跳結算、場景收乾淨、存檔沒被重複改", late.mode === null && !late.result && late.menu && late.kids === 0 && J(dv2) === J(dv), J({ late, dv2 }));
    // 回來再玩：選關對話框（第 1 關 3 星、第 2 關開了）
    await q.evaluate(() => document.querySelector(".mode-card[data-mode=deliver]").click()); await sleep(500);
    const pk14 = await q.evaluate(() => { const bs = [...document.querySelectorAll("#deliverLevels .bb-lv")]; return { vis: !document.getElementById("deliverPick").classList.contains("hidden"), s0: bs[0] && bs[0].querySelector(".s").textContent, next: bs.findIndex(b => b.classList.contains("next")) }; });
    ok("⑭ 再點配送站：選關對話框（第 1 關 3 星、第 2 關黃框）", pk14.vis && pk14.s0 === "⭐⭐⭐" && pk14.next === 1, J(pk14));
    allErrs.push(...e3); await c3.close();
  }
  await browser.close();
  ok("⑫ 全程 0 個 console error", allErrs.length === 0, allErrs.join(" | ").slice(0, 400));
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL / ${out.length}` : `\nALL PASS (${out.length})`);
  console.log("截圖：" + SHOTS);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
