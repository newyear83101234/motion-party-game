// 音符唱片行（11-01 v8 音樂島；js/zhuyin-records.js＋主程式接線）測試：node tools/zy-test/records.js
// 驗：開唱片牆（主程式的 openRecords 入口；介紹卡「💿 進唱片行」；前院留聲機 homeItemTap）；紀念唱片補發（假存檔：貼紙 25、陀螺 rank 1、泡泡有星）；
//     店裡賣的要點兩下、隔 0.4 秒才算；錢不夠買不了；試聽；「🏝️ 當小島音樂」＝選單音樂變那首；「🔀 隨機」同一段選單固定一首；「🏝️ 原本的」；
//     家長鎖（家長頁開關：唱片牆那列換成一行小字、選單放原本的音樂）；留聲機買了送唱片（只送一次、一台）；備份碼匯出匯入保留 rc；
//     換畫面（nav）會收掉唱片牆；唱片牆開著不開介紹卡；沒有錯誤、旁注音沒漏字。截圖：唱片牆橫式／直式、家長頁開關。
//     11-01 櫻木：4 首我的歌一開始就有（13 張）；沒拿到的紀念唱片直接講條件、錢不夠講「還差 N 顆星星」；直式唱片牆第一眼至少 3 排；
//     「▶ 聽整首」＝收起唱片牆、小島放這首、寵物跳（3D hub.dance）、膠囊「♪ 正在放《歌名》 ⏹」可以按停、放完（整首歌 ended／一般曲一輪）／進遊戲／換島／再開唱片牆＝回原本的；
//     整首歌接著上次放（離結尾不到 5 秒從頭）；⏳ 下載中（.bin 故意延遲 1.5 秒）、出聲就拿掉；直式四座島上方按鈕互不重疊。截圖：小島放歌＋膠囊（橫、直）、音樂島直式上方。
// 需要：專案根目錄開著 python -m http.server 8765（ZY_URL 可改）。截圖存到 ZY_SHOTS（預設 %TEMP%\zy-records）。
// （3D 那邊的入口——唱片行建築、無尾熊 DJ、點前院的留聲機模型——要等 js/zhuyin-hub3d.js 接好，在 hub3d／music-isle 測試驗）
const path = require("path"), fs = require("fs");
const { launch, openGame } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&no3d&night=0&recshop";   // recshop＝用「紀念要做到、店裡要買」的舊規則測補發／買的程式（11-01 阿葉改成全部唱片一開始就有，見第 0 段）
const SHOTS = process.env.ZY_SHOTS || path.join(process.env.TEMP || ".", "zy-records");
fs.mkdirSync(SHOTS, { recursive: true });
const strip = s => (s || "").replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "");
const MINE = ["my_soyeon", "my_ateez", "my_jay", "my_hero"];   // 11-01 我的歌（kind mine：一開始就有、排唱片牆最前面）
const wallOn = p => p.evaluate(() => window.__zy.recUI.isOpen() && !document.querySelector(".rc-shop").classList.contains("hidden"));
const rec = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__zy.recSave)));
const pickRec = (p, id) => p.evaluate(id => document.querySelector(`.rc-rec[data-id=${id}]`).click(), id);
const btn = (p, cls) => p.evaluate(c => { const b = document.querySelector(".rc-shop " + c); return b ? { shown: !b.classList.contains("hidden") && getComputedStyle(b).display !== "none", text: b.textContent } : null; }, cls);
const click = (p, cls) => p.evaluate(c => document.querySelector(".rc-shop " + c).click(), cls);
const spoken = p => p.evaluate(() => window.__spoken.map(x => x.text));
const clearSpoken = p => p.evaluate(() => { window.__spoken = []; });
// 唱片卡的內容沒有超出卡片（排高被壓扁＝字疊到下一排）、錢包膠囊不被右上的 ✕ 蓋到；回傳 true 或問題清單
const fitCheck = () => { const bad = [...document.querySelectorAll(".rc-rec")].filter(c => c.scrollHeight > c.clientHeight + 2).map(c => c.dataset.id);
  const w = document.querySelector(".rc-wallet").getBoundingClientRect(), x = document.querySelector(".rc-x").getBoundingClientRect();
  if (w.right > x.left && w.left < x.right && w.bottom > x.top && w.top < x.bottom) bad.push("錢包×✕"); return bad.length ? bad : true; };
const center = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
// 唱片牆第一眼（沒捲）整排都看得到的有幾排；唱盤那區的按鈕都在畫面內
const rowsSeen = () => { const w = document.querySelector(".rc-wall").getBoundingClientRect(), tops = new Set();
  for (const c of document.querySelectorAll(".rc-rec")) { const q = c.getBoundingClientRect(); if (q.top >= w.top - 1 && q.bottom <= w.bottom + 1) tops.add(Math.round(q.top)); }
  const btns = [...document.querySelectorAll(".rc-deck button")].filter(b => getComputedStyle(b).display !== "none").map(b => b.getBoundingClientRect());
  return { n: tops.size, wallH: Math.round(w.height), deckH: Math.round(document.querySelector(".rc-deck").getBoundingClientRect().height), btnsIn: btns.every(q => q.top >= 0 && q.bottom <= innerHeight && q.left >= 0 && q.right <= innerWidth) }; };
// 小島上的「正在放」膠囊：在畫面內、不碰上方按鈕、貼紙那排的膠囊、貓頭鷹（收起來的家長按鈕也算位置）
const pillCheck = () => { const q = document.getElementById("recNow").getBoundingClientRect(), hit = [];
  for (const s of ["#hudLBtn", "#hudRBtn", "#townBtn", "#townTag", "#rainbowBtn", "#rainbowTag", "#muIsleBtn", "#muIsleTag", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#mapBtn", "#plazaBtn", "#resumeBtn", "#albumBtn", "#menu .jarBtn", "#walletBtn", "#evoBtn", "#guide > img", "#guideText", "#owlPeek"]) {
    const e = document.querySelector(s); if (!e || getComputedStyle(e).display === "none") continue; const b = e.getBoundingClientRect(); if (b.width < 1) continue;
    if (q.left < b.right - 1 && q.right > b.left + 1 && q.top < b.bottom - 1 && q.bottom > b.top + 1) hit.push(s); }
  return { inV: q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight && q.width > 40, h: Math.round(q.height), rect: [q.left, q.top, q.right, q.bottom].map(Math.round), hit }; };
// 直式上方：地點鈕、🗺️、🎪、家長按鈕、繼續玩、貼紙那排 互不重疊、都在畫面內（圓鈕和黏著的小字、橫式 🎪 在貼紙那排裡 不算）
const topCheck = () => { const ids = ["#hudLBtn", "#hudRBtn", "#townBtn", "#townTag", "#rainbowBtn", "#rainbowTag", "#muIsleBtn", "#muIsleTag", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#resumeBtn", "#menu > .menu-bottom", "#mapBtn", "#plazaBtn"];
  const box = ids.map(s => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { s, q, on: getComputedStyle(e).display !== "none" && q.width > 0 }; }).filter(x => x && x.on);
  const skip = new Set(["#townBtn|#townTag", "#rainbowBtn|#rainbowTag", "#muIsleBtn|#muIsleTag", "#menu > .menu-bottom|#plazaBtn"]), bad = [], out = [];
  for (let i = 0; i < box.length; i++) { const a = box[i].q; if (a.left < -1 || a.top < -1 || a.right > innerWidth + 1 || a.bottom > innerHeight + 1) out.push(box[i].s);
    for (let j = i + 1; j < box.length; j++) { const b = box[j].q; if (skip.has(box[i].s + "|" + box[j].s) || skip.has(box[j].s + "|" + box[i].s)) continue;
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) bad.push(box[i].s + "×" + box[j].s); } }
  return { bad, out, words: [...document.querySelectorAll(".hud-l .nav-word")].map(e => e.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")) }; };

(async () => {
  const browser = await launch();
  // ===== 0. 阿葉 11-01「唱片可以不用星星 想換音樂就可以換」：全部唱片一開始就有（網址沒有 recshop）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 5, stars: 0, query: "debug&novoice&no3d&night=0" });
    const R0 = await rec(p);
    ok("免費：新存檔一開始 13 張唱片全部都有（我的歌＋紀念＋店裡的）", R0.own.length === 13 && MINE.every(id => R0.own.includes(id)) && ["r_town", "r_calm", "r_night"].every(id => R0.own.includes(id)), JSON.stringify(R0));
    ok("免費：openRecords → 唱片牆打開", (await p.evaluate(() => window.__zy.openRecords())) && await wallOn(p));
    await sleep(300); await pickRec(p, "r_calm"); await sleep(300);
    ok("免費：點店裡那張（安靜時光）＝有「▶ 聽整首」「🏝️ 當小島音樂」，沒有「買下來」", (await btn(p, ".rc-play")).shown && (await btn(p, ".rc-set")).shown && !(await btn(p, ".rc-buy")).shown && !(await btn(p, ".rc-buy-go")).shown);
    await click(p, ".rc-set"); await sleep(200);
    ok("免費：錢包 0 顆也能設成小島音樂", (await rec(p)).pick === "r_calm" && (await p.evaluate(() => window.__zy.wallet)) === 0);
    ok("免費：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 1. 舊存檔：紀念唱片第一次進唱片行一起補發（recshop：舊規則）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 25, stars: 30, query: Q });
    await p.evaluate(() => { localStorage.setItem("zy1_tops", JSON.stringify({ stars: 20, freeUsed: 1, rank: 1 })); localStorage.setItem("zy1_bubble", JSON.stringify({ lv: 1, stars: { 0: 2 } })); });
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(400);
    await clearSpoken(p);
    ok("開頁：只有 4 首我的歌（一開始就有）；紀念唱片要進唱片行才補發", JSON.stringify((await rec(p)).own) === JSON.stringify(MINE), JSON.stringify(await rec(p)));
    ok("openRecords → 唱片牆打開", (await p.evaluate(() => window.__zy.openRecords())) && await wallOn(p));
    await sleep(300);
    let R = await rec(p);
    ok("補發：彩虹島（25 張 ≥ 20）、對戰（陀螺 rank 1）、泡泡（過過一關）；歸仁區（< 30）、配送、寵物不送", ["r_rainbow", "r_battle", "r_bubble", ...MINE].every(id => R.own.includes(id)) && !["r_town", "r_road", "r_evolve"].some(id => R.own.includes(id)) && R.own.length === MINE.length + 3, JSON.stringify(R));
    ok("補發有存進 zy1_rec", await p.evaluate(n => (JSON.parse(localStorage.getItem("zy1_rec")) || {}).own.length === n, MINE.length + 3));
    ok("DJ 說「拿到新唱片了！」", (await spoken(p)).includes("拿到新唱片了！"), JSON.stringify(await spoken(p)));
    const wall = await p.evaluate(() => [...document.querySelectorAll(".rc-rec")].map(c => ({ id: c.dataset.id, have: c.classList.contains("have"), how: c.querySelector(".rc-how").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") })));
    ok("唱片牆 13 張：4 首我的歌排最前面＋6 紀念＋3 店裡賣的（沒有音樂島主題曲 r_music；寵物那張叫「寵物」）", wall.length === 13 && JSON.stringify(wall.slice(0, 4).map(w => w.id)) === JSON.stringify(MINE) && wall.slice(0, 4).every(w => w.have) && !wall.some(w => w.id === "r_music") && await p.evaluate(() => window.__zy.REC.REC_BY_ID.r_evolve.name === "寵物" && window.__zy.REC.REC_BY_ID.r_evolve.bgm === "dress"), JSON.stringify(wall.map(w => w.id)));
    ok("沒拿到的寫怎麼拿（「開放歸仁區就送你」）、店裡賣的寫 ⭐8", wall.find(w => w.id === "r_town").how === "開放歸仁區就送你" && wall.find(w => w.id === "r_calm").how === "⭐8" && wall.find(w => w.id === "r_rainbow").have, JSON.stringify(wall));
    ok("🎤 鈕藏著（兒歌接唱第三批才做）", !(await btn(p, ".rc-sing")).shown);
    // 試聽：點一張 → 放那首；10 秒後放回選單音樂
    await clearSpoken(p); await pickRec(p, "r_town"); await sleep(300);
    ok("點沒拿到的紀念唱片也能試聽（放歸仁區那首、唱盤轉）、沒有買／當小島音樂的鈕", (await p.evaluate(() => window.__zy.bgmNow())) === "town" && await p.evaluate(() => document.querySelector(".rc-vinyl").classList.contains("spin")) && !(await btn(p, ".rc-set")).shown && !(await btn(p, ".rc-buy")).shown, String(await p.evaluate(() => window.__zy.bgmNow())));
    ok("點沒拿到的紀念唱片：語音直接講條件「開放歸仁區就送你」（不識字的小孩也懂）", (await spoken(p)).includes("開放歸仁區就送你") && !(await spoken(p)).some(t => t.includes("上面寫的")), JSON.stringify(await spoken(p)));
    await sleep(10400);
    ok("試聽 10 秒後：放回選單音樂（island）", (await p.evaluate(() => window.__zy.bgmNow())) === "island", String(await p.evaluate(() => window.__zy.bgmNow())));
    // 買店裡的：錢包 20 顆
    await p.evaluate(() => window.__zy.setWallet(20)); await pickRec(p, "r_calm"); await sleep(200);
    ok("店裡的唱片：「⭐8 買下來」", strip((await btn(p, ".rc-buy")).text) === "⭐8買下來" && (await btn(p, ".rc-buy")).shown);
    await click(p, ".rc-buy"); await click(p, ".rc-buy-go");   // 同一瞬間連點兩下
    ok("連點兩下（不到 0.4 秒）：不會買", !(await rec(p)).own.includes("r_calm") && (await p.evaluate(() => window.__zy.wallet)) === 20 && (await btn(p, ".rc-buy-go")).shown);
    await sleep(450); await click(p, ".rc-buy-go"); await sleep(200);
    R = await rec(p);
    ok("隔 0.4 秒再按「✔ 買」：買到了、錢包 20 → 12、存檔", R.own.includes("r_calm") && (await p.evaluate(() => window.__zy.wallet)) === 12 && await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_rec")).own.includes("r_calm")), JSON.stringify(R));
    ok("買到之後：有「▶ 聽整首」「🏝️ 當小島音樂」、沒有買的鈕", (await btn(p, ".rc-play")).shown && (await btn(p, ".rc-set")).shown && !(await btn(p, ".rc-buy")).shown && !(await btn(p, ".rc-buy-go")).shown);
    // 錢不夠
    await p.evaluate(() => window.__zy.setWallet(5)); await clearSpoken(p); await pickRec(p, "r_night"); await sleep(200);
    await click(p, ".rc-buy"); await sleep(500); await click(p, ".rc-buy-go");
    ok("錢不夠（5 顆、要 8 顆）：按「買下來」說「還差 3 顆星星！」（數字）、不會出「✔ 買」、錢包不變", !(await rec(p)).own.includes("r_night") && (await p.evaluate(() => window.__zy.wallet)) === 5 && !(await btn(p, ".rc-buy-go")).shown && (await spoken(p)).includes("還差 3 顆星星！"), JSON.stringify(await spoken(p)));
    // 當小島音樂 → 關掉唱片牆 → 選單放那首
    await pickRec(p, "r_rainbow"); await sleep(200); await click(p, ".rc-set"); await sleep(200);
    ok("「🏝️ 當小島音樂」：pick＝r_rainbow、那張寫「🏝️ 小島在放」", (await rec(p)).pick === "r_rainbow" && strip(await p.evaluate(() => document.querySelector(".rc-rec[data-id=r_rainbow] .rc-how").textContent)) === "🏝️小島在放");
    await click(p, ".rc-x"); await sleep(300);
    ok("關掉唱片牆：選單音樂＝彩虹島那首（主島也是）", !(await wallOn(p)) && (await p.evaluate(() => window.__zy.bgmNow())) === "rainbow" && (await p.evaluate(() => window.__zy.menuBgmKey("main"))) === "rainbow");
    // 隨機：同一段選單期間固定一首
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await click(p, ".rc-rand"); await sleep(200);
    const keys = await p.evaluate(() => [1, 2, 3, 4, 5, 6].map(() => window.__zy.menuBgmKey()));
    const ownBgm = await p.evaluate(() => window.__zy.recSave.own.map(id => window.__zy.REC.REC_BY_ID[id].bgm));
    ok("「🔀 隨機」：pick＝rand、menuBgmKey 叫 6 次都是同一首、是有的唱片", (await rec(p)).pick === "rand" && keys.every(k => k === keys[0]) && ownBgm.includes(keys[0]), JSON.stringify({ keys, ownBgm }));
    // 原本的
    await click(p, ".rc-orig"); await sleep(200); await click(p, ".rc-x"); await sleep(300);
    ok("「🏝️ 原本的」：pick 清空、選單放主島原本的 island", (await rec(p)).pick === "" && (await p.evaluate(() => window.__zy.bgmNow())) === "island");
    // 家長鎖
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_battle"); await sleep(200); await click(p, ".rc-set"); await click(p, ".rc-x"); await sleep(300);
    ok("（再選一張：對戰）選單放 battle", (await p.evaluate(() => window.__zy.bgmNow())) === "battle");
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(300);
    const so = await p.evaluate(() => ({ has: !!document.querySelector("#bgmLockOpts"), on: document.querySelector("#bgmLockOpts .opt.on")?.dataset.v }));
    ok("家長頁 🎵 段有「小島只放原本的音樂」開關、預設關", so.has && so.on === "0", JSON.stringify(so));
    await p.evaluate(() => document.querySelector("#bgmLockOpts .opt[data-v='1']").click()); await sleep(300);
    await p.evaluate(() => document.getElementById("bgmLockOpts").scrollIntoView({ block: "center" })); await sleep(200);
    await p.screenshot({ path: path.join(SHOTS, "records-settings-lock-1180x820.png") });
    ok("開鎖：存成 zy_bgm_lock＝1、按鈕亮「開」", await p.evaluate(() => localStorage.getItem("zy_bgm_lock") === "1" && document.querySelector("#bgmLockOpts .opt.on").dataset.v === "1" && window.__zy.bgmLock === 1));
    await p.evaluate(() => document.getElementById("settingsClose").click()); await sleep(300);
    ok("鎖著：選單馬上放回原本的 island（pick 還留著 r_battle）", (await p.evaluate(() => window.__zy.bgmNow())) === "island" && (await rec(p)).pick === "r_battle");
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_rainbow"); await sleep(200);
    const lk = await p.evaluate(() => ({ isle: document.querySelector(".rc-isle").classList.contains("hidden"), lock: document.querySelector(".rc-lock").classList.contains("hidden") ? "" : document.querySelector(".rc-lock").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") }));
    ok("鎖著的唱片牆：「小島音樂」那列換成一行小字、按鈕藏起來（「當小島音樂」也藏）", lk.isle && lk.lock === "家長設定：小島放原本的音樂" && !(await btn(p, ".rc-set")).shown && (await btn(p, ".rc-play")).shown, JSON.stringify(lk));
    await click(p, ".rc-x"); await sleep(200);
    ok("備份碼不帶 zy_bgm_lock（全家共用的家長設定，跟背景音樂開關一樣）", await p.evaluate(() => !/bgm_lock|bgmLock/.test(atob(window.__zyB.exportCode().slice(4)))));
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.querySelector("#bgmLockOpts .opt[data-v='0']").click(); document.getElementById("settingsClose").click(); }); await sleep(300);
    ok("關鎖：選單又放 battle", (await p.evaluate(() => window.__zy.bgmNow())) === "battle");
    // 備份碼：rc 跟著走
    const code = await p.evaluate(() => window.__zyB.exportCode());
    const dec = await p.evaluate(c => window.__zyB.readCode(c), code);
    ok("備份碼 ZY2 帶 rc（唱片、小島音樂）", dec && dec.slots[0].rec && dec.slots[0].rec.own.includes("r_calm") && dec.slots[0].rec.pick === "r_battle", JSON.stringify(dec && dec.slots[0].rec));
    const evil = "ZY2:" + Buffer.from(JSON.stringify({ v: 2, p: [{ s: ["貓"], st: 1, rc: { own: ["r_town", "r_hack", 5], pick: "r_night", seen: "x" } }] })).toString("base64");
    const ev = await p.evaluate(c => window.__zyB.readCode(c), evil);
    ok("備份碼 rc 清洗：不認得的唱片丟掉、沒有的唱片不能當小島音樂、4 首我的歌一定在", ev && JSON.stringify(ev.slots[0].rec) === JSON.stringify({ own: ["r_town", ...MINE], pick: "", seen: [] }), JSON.stringify(ev && ev.slots[0].rec));
    await p.evaluate(() => { localStorage.removeItem("zy1_rec"); });
    const res = await p.evaluate(c => window.__zyB.importCode(c), code);
    R = await rec(p);
    ok("還原備份碼：唱片、小島音樂都回來", res === "ok" && R.own.includes("r_calm") && R.own.includes("r_rainbow") && R.pick === "r_battle", JSON.stringify({ res, R }));
    // 換畫面（nav）收掉唱片牆；唱片牆開著不開介紹卡
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200);
    await p.evaluate(() => window.__zy.showPick("fish")); await sleep(200);
    ok("唱片牆開著：介紹卡不會跳出來", await p.evaluate(() => document.getElementById("pick").classList.contains("hidden")));
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=fish]").click());
    await p.waitForFunction(() => window.__zy.mode === "fish", null, { timeout: 10000 }).catch(() => {});
    ok("唱片牆開著時開始一局（nav）：唱片牆收掉、放遊戲的音樂", !(await wallOn(p)) && (await p.evaluate(() => window.__zy.mode)) === "fish");
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(600);
    // 清除重來：這位的唱片清掉；家長鎖（全家共用）留著
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.querySelector("#bgmLockOpts .opt[data-v='1']").click(); document.getElementById("resetBtn").click(); document.getElementById("resetBtn").click(); document.getElementById("settingsClose").click(); }); await sleep(400);
    ok("清除重來：zy1_rec 清掉、唱片牆只剩 4 首我的歌；家長鎖 zy_bgm_lock 還在", await p.evaluate(m => localStorage.getItem("zy1_rec") === null && JSON.stringify(window.__zy.recSave.own) === JSON.stringify(m) && localStorage.getItem("zy_bgm_lock") === "1" && window.__zy.bgmLock === 1, MINE), JSON.stringify(await p.evaluate(() => ({ ls: localStorage.getItem("zy1_rec"), own: window.__zy.recSave.own }))));
    ok("旁注音沒漏字", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    ok("沒有錯誤（補發／買／小島音樂／家長鎖）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 留聲機：花園小舖買了送一張唱片（只送一次、一台）；點留聲機＝開唱片牆；介紹卡「💿 進唱片行」=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, stars: 60, query: Q });
    await p.evaluate(() => { const h = window.__zy.homeSave; h.lv = 2; h.base = 0; h.gift = 1; window.__zy.setWallet(30); }); await sleep(200);   // 房子已經是小木屋（花園小舖開了）
    await p.evaluate(() => window.__zy.homeUI.openGarden()); await sleep(400);
    ok("花園小舖有留聲機（⭐12）", strip(await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone] .hg-price")?.textContent)) === "⭐12");
    await clearSpoken(p);
    await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone]").click()); await sleep(450);
    await p.evaluate(() => document.querySelector(".hg-buy-go").click()); await sleep(300);
    let R = await rec(p);
    ok("買到留聲機：送一張唱片（小島 r_island）、錢包 30 → 18、說「送你一張唱片！」", R.own.includes("r_island") && (await p.evaluate(() => window.__zy.wallet)) === 18 && (await spoken(p)).some(t => t.startsWith("送你一張唱片")) && await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_rec")).own.includes("r_island")), JSON.stringify({ R, sp: await spoken(p) }));
    await p.evaluate(() => document.querySelector(".hg-done").click()); await sleep(300);
    await p.evaluate(() => window.__zy.homeUI.openGarden()); await sleep(300);
    ok("留聲機只能有一台（貨架寫「買滿了」、再點不會出「✔ 買」）", strip(await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone] .hg-price").textContent)) === "買滿了" || strip(await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone] .hg-price").textContent)).startsWith("可以放"), strip(await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone] .hg-price").textContent)));
    await p.evaluate(() => window.__zy.homeItemTap("gramophone")); await sleep(200);
    ok("布置花園中點留聲機：不開唱片牆", !(await wallOn(p)));
    await p.evaluate(() => document.querySelector(".hg-done").click()); await sleep(300);
    await p.evaluate(() => window.__zy.homeItemTap("gramophone")); await sleep(300);
    ok("點前院的留聲機（不在布置）：打開唱片牆", await wallOn(p));
    await sleep(400);
    ok("1180×820：每張唱片卡的字都在卡片裡（沒有被下一排蓋住）、錢包沒被 ✕ 蓋到", (await p.evaluate(fitCheck)) === true, JSON.stringify(await p.evaluate(fitCheck)));
    await p.screenshot({ path: path.join(SHOTS, "records-wall-1180x820.png") });
    await click(p, ".rc-x"); await sleep(300);
    const own0 = (await rec(p)).own.length;
    await p.evaluate(() => { const h = window.__zy.homeSave; h.own.gramophone = 0; delete h.own.gramophone; h.yard = h.yard.map(x => x === "gramophone" ? null : x); window.__zy.setWallet(30); });
    await p.evaluate(() => window.__zy.homeUI.openGarden()); await sleep(300);
    await p.evaluate(() => document.querySelector(".hg-item[data-id=gramophone]").click()); await sleep(450); await p.evaluate(() => document.querySelector(".hg-buy-go").click()); await sleep(300);
    ok("（退掉再買一次）已經有那張唱片＝不再送（唱片數不變）", (await rec(p)).own.length === own0);
    await p.evaluate(() => document.querySelector(".hg-done").click()); await sleep(300);
    // 介紹卡（卡片選單沒有 3D：直接呼叫 showPick）
    await clearSpoken(p);
    await p.evaluate(() => window.__zy.showPick("records", {})); await sleep(300);
    const pk = await p.evaluate(() => ({ name: document.getElementById("pkName").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), go: document.getElementById("pkGo").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), meta: document.getElementById("pkMeta").textContent, lock: document.getElementById("pkLock").textContent, lv: !document.getElementById("pkLv") || document.getElementById("pkLv").classList.contains("hidden") }));
    ok("唱片行介紹卡：名字「音符唱片行」、大按鈕「💿 進唱片行」、寫有幾張唱片（共 13 張）、沒有等級徽章、沒鎖（45 張）", pk.name === "音符唱片行" && pk.go === "💿進唱片行" && /💿 \d+／13/.test(pk.meta) && !pk.lock && pk.lv, JSON.stringify(pk));
    ok("貓頭鷹唸「音符唱片行！」", (await spoken(p)).includes("音符唱片行！"), JSON.stringify(await spoken(p)));
    await p.evaluate(() => document.getElementById("pkGo").click()); await sleep(300);
    ok("按「💿 進唱片行」：介紹卡收起來、唱片牆打開", await wallOn(p) && await p.evaluate(() => document.getElementById("pick").classList.contains("hidden")));
    await click(p, ".rc-x"); await sleep(300);
    await p.evaluate(() => window.__zy.showPick("fish", {})); await sleep(200);
    ok("換別的介紹卡：大按鈕變回「▶️ 開始玩」", strip(await p.evaluate(() => document.getElementById("pkGo").textContent)) === "▶️開始玩");
    await p.evaluate(() => document.getElementById("pkClose").click());
    ok("留聲機／介紹卡：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 3. 25 張：唱片行介紹卡鎖著（音樂島 40 張才開）；直式唱片牆截圖 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 25, query: Q });
    await p.evaluate(() => window.__zy.showPick("records", {})); await sleep(300);
    ok("25 張：唱片行介紹卡鎖著、寫「再收集 15 張貼紙」、沒有大按鈕", await p.evaluate(() => document.getElementById("pick").classList.contains("locked") && document.getElementById("pkLock").textContent.includes("再收集 15 張貼紙") && getComputedStyle(document.getElementById("pkGo")).display === "none"));
    await p.evaluate(() => document.getElementById("pkClose").click());
    await ctx.close();
    const P = await openGame(browser, { w: 820, h: 1180, stickers: 45, query: Q });
    await P.p.evaluate(() => { const R = window.__zy.recSave; R.own.push("r_island", "r_calm"); R.pick = "r_calm"; window.__zy.openRecords(); }); await sleep(400);
    await P.p.evaluate(() => document.querySelector(".rc-rec[data-id=r_island]").click()); await sleep(600);
    const fit = await P.p.evaluate(() => { const q = document.querySelector(".rc-panel").getBoundingClientRect(), x = document.querySelector(".rc-x").getBoundingClientRect(); return { inV: q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight, x: x.width >= 44 }; });
    ok("直式 820×1180：唱片牆在畫面內、✕ ≥ 44px", fit.inV && fit.x, JSON.stringify(fit));
    ok("直式：每張唱片卡的字都在卡片裡、錢包沒被 ✕ 蓋到", (await P.p.evaluate(fitCheck)) === true, JSON.stringify(await P.p.evaluate(fitCheck)));
    const rows = await P.p.evaluate(rowsSeen);
    ok("直式 820×1180（選了一張、「▶ 聽整首」「🏝️ 當小島音樂」都在）：唱盤縮小放左邊，第一眼看得到至少 3 排唱片（整排都在）", rows.n >= 3 && rows.btnsIn, JSON.stringify(rows));
    await P.p.screenshot({ path: path.join(SHOTS, "records-wall-820x1180.png") });
    ok("直式：沒有錯誤", P.errs.length === 0 && errs.length === 0, [...errs, ...P.errs].join(" | "));
    await P.ctx.close();
    for (const [w, h] of [[768, 1024], [390, 844]]) {
      const Q2 = await openGame(browser, { w, h, stickers: 45, query: Q });
      await Q2.p.evaluate(() => { const R = window.__zy.recSave; R.own.push("r_island"); window.__zy.openRecords(); }); await sleep(400);
      await Q2.p.evaluate(() => document.querySelector(".rc-rec[data-id=r_island]").click()); await sleep(600);
      const rw = await Q2.p.evaluate(rowsSeen), fc = await Q2.p.evaluate(fitCheck);
      ok(`直式 ${w}×${h}：第一眼至少 3 排唱片、按鈕都在畫面內、卡片的字在卡片裡`, rw.n >= 3 && rw.btnsIn && fc === true, JSON.stringify({ rw, fc }));
      if (w === 768) await Q2.p.screenshot({ path: path.join(SHOTS, `records-wall-${w}x${h}.png`) });
      ok(`直式 ${w}×${h}：沒有錯誤`, Q2.errs.length === 0, Q2.errs.join(" | "));
      await Q2.ctx.close();
    }
  }
  // ===== 4. 「▶ 聽整首」（櫻木 11-01）：收起唱片牆、小島放這首、寵物跳、膠囊可以按停；放完／進遊戲／再開唱片牆＝回原本的；整首歌接著放；⏳ 下載中 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, query: Q });
    const bins = []; p.on("request", r => { const m = r.url().match(/audio\/songs\/(\w+)\.bin/); if (m) bins.push(m[1]); });
    await ctx.route("**/audio/songs/*.bin*", async r => { await sleep(1500); await r.continue(); });   // 下載慢一點：看得到 ⏳
    const S = () => p.evaluate(() => { const z = window.__zy, d = window.__zyAudio.debug(), pl = document.getElementById("recNow");
      return { wall: z.recUI.isOpen(), bgm: z.bgmNow(), np: z.recUI.debug.np, dance: z.recUI.debug.dances.slice(-1)[0], once: d.once, loading: d.loading, pos: d.pos,
        play: d.stream.find(s => s.key && s.key === d.cur) || null, pill: !pl.classList.contains("hidden") && getComputedStyle(pl).display !== "none", text: pl.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), menuKey: z.menuBgmKey() }; });
    const playing = () => p.waitForFunction(() => { const d = window.__zyAudio.debug(); return !d.loading && d.stream.some(s => s.key === d.cur && !s.paused); }, null, { timeout: 15000 }).then(() => true, () => false);
    ok("我的歌的膠囊 #recNow 在貼紙那排裡、平常藏著", await p.evaluate(() => { const e = document.getElementById("recNow"); return !!e && e.parentNode.matches("#menu > .menu-bottom") && e.classList.contains("hidden"); }));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(300);
    const t0 = await center(p, ".rc-title"); await p.mouse.click(t0.x, t0.y); await sleep(200);   // 真的點一下：解鎖聲音（iOS 規則一樣）
    // ⏳：第一次點我的歌要先下載＋解密
    await pickRec(p, "my_jay"); await sleep(500);
    const w1 = await p.evaluate(() => ({ lab: document.querySelector(".rc-label").textContent, wait: document.querySelector(".rc-vinyl").classList.contains("wait"), loading: window.__zyAudio.debug().loading, bins: 0 }));
    ok("第一次點我的歌（還在下載＋解密）：唱盤中間 ⏳、唱片先不轉；點了就開始下載那首", w1.lab === "⏳" && w1.wait && w1.loading && bins.includes("my_jay"), JSON.stringify({ w1, bins }));
    const ok1 = await playing(); await sleep(400);
    const w2 = await p.evaluate(() => ({ lab: document.querySelector(".rc-label").textContent, wait: document.querySelector(".rc-vinyl").classList.contains("wait"), spin: document.querySelector(".rc-vinyl").classList.contains("spin") }));
    ok("開始出聲：⏳ 拿掉（換回 👑）、唱片在轉", ok1 && w2.lab === "👑" && !w2.wait && w2.spin, JSON.stringify({ ok1, w2, s: await S() }));
    await clearSpoken(p); await click(p, ".rc-play"); await sleep(500);
    let s = await S();
    ok("「▶ 聽整首」（我的歌）：唱片牆收起來、小島接著放這首、寵物跳 60 秒、放完就停（不循環）、選單音樂也是這首", !s.wall && s.bgm === "my:my_jay" && s.np && s.np.whole && s.dance === 60 && s.once === "my:my_jay" && s.play && !s.play.loop && s.menuKey === "my:my_jay", JSON.stringify(s));
    ok("小島上出現膠囊「♪ 正在放《女兒殿下》 ⏹」", s.pill && s.text === "♪正在放《女兒殿下》⏹", s.text);
    await sleep(2500);
    await p.evaluate(() => document.getElementById("recNow").click()); await sleep(1300);
    s = await S();
    ok("按膠囊（⏹）：回原本的小島音樂（island）、膠囊收起來、寵物停（dance 0）、記住女兒殿下放到第幾秒", s.bgm === "island" && !s.np && !s.pill && s.dance === 0 && s.once === null && s.pos["my:my_jay"] > 2.5, JSON.stringify(s));
    const was = s.pos["my:my_jay"];
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "my_jay"); await playing(); await sleep(300);
    s = await S();
    ok("第二次放同一首：從上次停的地方接著放（currentTime 不是 0）", s.bgm === "my:my_jay" && s.play && s.play.t >= was - 0.5, JSON.stringify({ was, play: s.play }));
    await click(p, ".rc-play"); await sleep(500); await playing();
    // 放完：拉到快結尾 → ended → 回原本的
    await p.evaluate(() => { const e = window.__zyAudio.streamEl(); e.currentTime = e.duration - 1.2; });
    await p.waitForFunction(() => !window.__zy.recUI.debug.np, null, { timeout: 8000 }).catch(() => {}); await sleep(300);
    s = await S();
    ok("整首歌放完（audio ended）：回原本的小島音樂、膠囊收起來、寵物停", s.bgm === "island" && !s.np && !s.pill && s.dance === 0, JSON.stringify(s));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "my_jay"); await playing(); await sleep(200);
    s = await S();
    ok("上次放到最後不到 5 秒：這次從頭放", s.play && s.play.t < 3, JSON.stringify(s.play));
    // 一般曲（60 秒循環）：跳 30 秒、放一輪就回原本的
    await pickRec(p, "r_rainbow"); await sleep(300); await click(p, ".rc-play"); await sleep(400);
    s = await S();
    ok("「▶ 聽整首」一般曲（彩虹島）：唱片牆收起來、放 rainbow、寵物跳 30 秒、膠囊《彩虹島》、照常循環", !s.wall && s.bgm === "rainbow" && s.dance === 30 && s.pill && s.text === "♪正在放《彩虹島》⏹" && s.once === null, JSON.stringify(s));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(400);
    s = await S();
    ok("放到一半又開唱片牆：先回到原本的小島音樂、膠囊收起來", s.wall && s.bgm === "island" && !s.np && !s.pill, JSON.stringify(s));
    await p.evaluate(() => { window.__zy.REC.TIMES.round = 1500; }); await pickRec(p, "r_rainbow"); await sleep(200); await click(p, ".rc-play"); await sleep(300);
    const sA = await S(); await sleep(2000); s = await S();
    ok("一般曲放一輪（測試改 1.5 秒）：自己回原本的小島音樂、膠囊收起來", sA.bgm === "rainbow" && sA.pill && s.bgm === "island" && !s.np && !s.pill && s.dance === 0, JSON.stringify({ sA, s }));
    await p.evaluate(() => { window.__zy.REC.TIMES.round = 60000; window.__zy.openRecords(); }); await sleep(200); await pickRec(p, "r_rainbow"); await sleep(200); await click(p, ".rc-play"); await sleep(300);
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=fish]").click());
    await p.waitForFunction(() => window.__zy.mode === "fish", null, { timeout: 10000 }).catch(() => {}); await sleep(500);
    s = await S();
    ok("放到一半進遊戲：「聽整首」結束、放遊戲自己的音樂", !s.np && s.bgm !== "rainbow" && !s.pill, JSON.stringify(s));
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(800);
    s = await S();
    ok("從遊戲回小島：放原本的小島音樂（island）", s.bgm === "island" && !s.np && !s.pill, JSON.stringify(s));
    // 音樂關著：點我的歌照樣先下載；「▶ 聽整首」留在唱片牆、說音樂關著
    await p.evaluate(() => document.getElementById("musicBtn").click()); await sleep(300);
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await clearSpoken(p);
    await pickRec(p, "my_hero"); await sleep(300); await click(p, ".rc-play"); await sleep(300);
    s = await S();
    ok("音樂關著：點我的歌也先下載（英雄爸爸）、「▶ 聽整首」不收唱片牆、說「音樂關著喔」", bins.includes("my_hero") && s.wall && !s.np && (await spoken(p)).some(t => t.startsWith("音樂關著喔")), JSON.stringify({ bins, s, sp: await spoken(p) }));
    await click(p, ".rc-x"); await p.evaluate(() => document.getElementById("musicBtn").click()); await sleep(300);
    ok("旁注音沒漏字（膠囊、還差幾顆）", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    ok("「▶ 聽整首」：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 5. 3D 小島：聽整首時寵物真的在跳（hub.dance）、膠囊不擋按鈕（橫／直）、換島＝結束；截圖 =====
  for (const [w, h, t] of [[1180, 820, "L"], [820, 1180, "P"], [390, 844, "M"]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 45, query: "debug&novoice&night=0&weather=sunny" });
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 40000 }).catch(() => {}); await sleep(600);
    await p.evaluate(() => window.__hub3d.events(false));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(300);
    const t0 = await center(p, ".rc-title"); await p.mouse.click(t0.x, t0.y); await sleep(200);
    await pickRec(p, "my_jay"); await p.waitForFunction(() => !window.__zyAudio.debug().loading, null, { timeout: 15000 }).catch(() => {});
    await click(p, ".rc-play"); await sleep(1200);
    const d = await p.evaluate(() => ({ dancing: window.__hub3d.dancing(), bgm: window.__zy.bgmNow(), wall: window.__zy.recUI.isOpen() }));
    ok(`${t} ${w}×${h}：聽整首＝唱片牆收起來、3D 小島上的寵物在跳（hub.dance 約 60 秒）`, !d.wall && d.bgm === "my:my_jay" && d.dancing > 50, JSON.stringify(d));
    const pc = await p.evaluate(pillCheck);
    ok(`${t} ${w}×${h}：膠囊在畫面內、≥44px 高、不跟上方按鈕／貼紙那排／貓頭鷹重疊`, pc.inV && pc.h >= 44 && pc.hit.length === 0, JSON.stringify(pc));
    if (t !== "M") await p.screenshot({ path: path.join(SHOTS, `island-playing-${w}x${h}.png`) });
    await p.evaluate(() => document.getElementById("recNow").click()); await sleep(600);
    ok(`${t}：按膠囊停＝寵物停下來、回原本的音樂`, (await p.evaluate(() => window.__hub3d.dancing())) === 0 && (await p.evaluate(() => window.__zy.bgmNow())) === "island");
    if (t === "L") {
      await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_rainbow"); await sleep(200); await click(p, ".rc-play"); await sleep(500);
      await p.evaluate(() => window.__hub3d.goPlace("music")); await sleep(1500);
      const g = await p.evaluate(() => ({ np: window.__zy.recUI.debug.np, bgm: window.__zy.bgmNow(), pill: document.getElementById("recNow").classList.contains("hidden") }));
      ok("聽整首放到一半換島（音樂島）：結束、放那座島的音樂（dress）、膠囊收起來", !g.np && g.bgm === "dress" && g.pill, JSON.stringify(g));
    }
    ok(`${t} 沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 6. 直式上方按鈕（櫻木 11-01：音樂島時 🗺️ 疊在貼紙上、「回小島」被切掉）：主島／音樂島／彩虹島／歸仁區 × 有鎖頭／繼續玩，互不重疊、都在畫面內 =====
  for (const [w, h, st, rs] of [[820, 1180, 45, 0], [820, 1180, 25, 1], [768, 1024, 25, 0], [390, 844, 25, 0], [390, 844, 25, 1]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: st, stars: 30, query: "debug&novoice&night=0&weather=sunny" });
    if (rs) { await p.evaluate(() => import("./js/zhuyin-words.js").then(({ WORDS }) => { localStorage.setItem("zy1_resume", JSON.stringify({ mode: "fish", idx: 2, results: [3, 3], combo: 2, earned: [], words: WORDS.slice(0, 10).map(x => [x.h, 1]), t: Date.now() })); }));
      await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(400); }
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 40000 }).catch(() => {}); await sleep(500);
    await p.evaluate(() => window.__hub3d.events(false));
    const bad = [];
    for (const pl of ["main", "music", "rainbow", "town"]) {
      await p.evaluate(pl => window.__hub3d.goPlace(pl), pl); await sleep(2600);
      const r = await p.evaluate(topCheck);
      if (r.bad.length || r.out.length) bad.push(pl + ":" + JSON.stringify(r));
      if (pl === "music" && w === 820 && st === 45) await p.screenshot({ path: path.join(SHOTS, "music-isle-top-820x1180.png") });
    }
    ok(`直式 ${w}×${h}（貼紙 ${st}${st < 30 ? "：歸仁區、音樂島鎖著" : ""}${rs ? "、有繼續玩" : ""}）：四座島的上方按鈕互不重疊、都在畫面內`, bad.length === 0, bad.join(" ‖ "));
    ok(`直式 ${w}×${h} 貼紙 ${st}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  console.log(`\n${out.filter(l => l.startsWith("PASS")).length}/${out.length} PASS　截圖：${SHOTS}`);
  process.exitCode = out.some(l => l.startsWith("FAIL")) ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
