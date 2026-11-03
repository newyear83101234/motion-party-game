// 音符唱片行（11-01 v8 音樂島；js/zhuyin-records.js＋主程式接線）測試：node tools/zy-test/records.js
// 11-01 v3 唱片牆改成全螢幕轉盤（阿葉批准的示意圖）：三個標籤（🎧 我的歌＝🔀 隨機＋5 首／🏅 紀念 6／🎼 配樂 3）、中間那張最大、手指撥／點旁邊那張／‹ › 轉、
//   停 0.6 秒自動試聽 10 秒（⏳ 下載中）、名字＋小字＋音波條、「▶ 聽整首」「🏝️ 當小島音樂」（已經是＝「✓ 小島正在放」不能按）＋小顆「🏝️ 原本的音樂」、無尾熊 DJ＋對話泡泡、封面圖（失敗退回 emoji）；
//   小島上的迷你播放器 #recNow（取代「♪ 正在放」膠囊）：唱片小圖＋歌名＋⏮ ⏸ ⏭（聽整首時中間 ⏹；11-01 寧次：≤440×60、鈕 46px，不印「正在放：」）。
// 驗：開唱片牆（主程式的 openRecords 入口；介紹卡「💿 進唱片行」；前院留聲機 homeItemTap）；紀念唱片補發（假存檔：貼紙 25、陀螺 rank 1、泡泡有星）；
//     店裡賣的要點兩下、隔 0.4 秒才算；錢不夠買不了；試聽；「🏝️ 當小島音樂」＝選單音樂變那首；「🔀 隨機」同一段選單固定一首；「🏝️ 原本的音樂」；
//     家長鎖（家長頁開關：「當小島音樂」「原本的」藏起來、只寫一行；選單放原本的音樂）；留聲機買了送唱片（只送一次、一台）；備份碼匯出匯入保留 rc；
//     換畫面（nav）會收掉唱片牆；唱片牆開著不開介紹卡；「▶ 聽整首」＝收起唱片牆、小島放這首、寵物跳（3D hub.dance）、放完／進遊戲／換島／再開唱片牆＝回原本的；
//     整首歌接著上次放；⏳ 下載中（.bin 故意延遲 1.5 秒）；各尺寸（橫 1180×820／1024×768、直 820×1180／768×1024／390×844）唱片牆與迷你播放器互不重疊、在畫面內；沒有錯誤、旁注音沒漏字。
// 封面圖 IMAGE/zhuyin/rec/<id>.webp 另外在做：測試一律攔下來（假圖＝回 200 壞資料，會觸發 onerror 但不會在 console 留 404；要測「有圖」的那幾張回一張真的小圖）。
// 需要：專案根目錄開著 python -m http.server 8765（ZY_URL 可改）。截圖存到 ZY_SHOTS（預設 %TEMP%\zy-records）。
const path = require("path"), fs = require("fs");
const { launch, openGame } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&no3d&night=0&recshop";   // recshop＝用「紀念要做到、店裡要買」的舊規則測補發／買的程式（11-01 阿葉改成全部唱片一開始就有，見第 0 段）
const QF = "debug&novoice&no3d&night=0";           // 免費（現在的規則）
const SHOTS = process.env.ZY_SHOTS || path.join(process.env.TEMP || ".", "zy-records");
fs.mkdirSync(SHOTS, { recursive: true });
const strip = s => (s || "").replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "");
const MINE = ["my_soyeon", "my_ateez", "my_jay", "my_hero", "my_eyes"];   // 11-01 我的歌（kind mine：一開始就有、排最前面；第 5 首 my_eyes 阿葉 11-01 加的）
const ALL = 14;                                     // 5 我的歌＋6 紀念＋3 店裡的
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
// 封面圖：have＝這幾張回真的小圖，其他回壞資料（＝圖還沒做好／載入失敗）
const covers = (ctx, have = []) => ctx.route("**/IMAGE/zhuyin/rec/**", r => { const id = (r.request().url().match(/rec\/(\w+)\.webp/) || [])[1];
  return have.includes(id) ? r.fulfill({ status: 200, contentType: "image/png", body: PNG }) : r.fulfill({ status: 200, contentType: "image/webp", body: "x" }); });
const wallOn = p => p.evaluate(() => window.__zy.recUI.isOpen() && !document.querySelector(".rc-shop").classList.contains("hidden"));
const rec = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__zy.recSave)));
const dbg = p => p.evaluate(() => { const d = window.__zy.recUI.debug; return { tab: d.tab, cur: d.cur, sel: d.sel, ids: d.ids, playing: d.playing, waiting: d.waiting, done: d.done, label: d.label() }; });
const bgm = p => p.evaluate(() => window.__zy.bgmNow());
const tabTo = (p, k) => p.evaluate(k => document.querySelector(`.rc-tab[data-k=${k}]`).click(), k);
// 點某張唱片：先換到它的標籤、點它（旁邊那張＝轉到中間；中間那張＝馬上試聽），等 0.75 秒（停 0.6 秒才試聽）
const pickRec = async (p, id, wait = 750) => {
  await p.evaluate(id => { const k = window.__zy.REC.TABS.find(t => t.ids.includes(id)).k; if (window.__zy.recUI.debug.tab !== k) document.querySelector(`.rc-tab[data-k=${k}]`).click(); document.querySelector(`.rc-rec[data-id=${id}]`).click(); }, id);
  await sleep(wait);
};
const btn = (p, cls) => p.evaluate(c => { const b = document.querySelector(".rc-shop " + c); return b ? { shown: !b.classList.contains("hidden") && getComputedStyle(b).display !== "none", text: b.textContent, dis: !!b.disabled } : null; }, cls);
const click = (p, cls) => p.evaluate(c => document.querySelector(".rc-shop " + c).click(), cls);
const spoken = p => p.evaluate(() => window.__spoken.map(x => x.text));
const clearSpoken = p => p.evaluate(() => { window.__spoken = []; });
const center = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const txt = (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).textContent || "", sel).then(strip);
// 唱片牆版面：標題、✕、標籤、唱片（中間＋兩旁）、名字、小字、音波、按鈕、原本的、家長鎖、DJ、泡泡、箭頭 互不重疊（唱片之間、箭頭壓唱片是設計）；
// 中間和兩旁各一張、其他元素都在畫面內；看得到的按鈕都 ≥ 44px
const wallCheck = () => {
  const vis = e => !!e && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().width > 1;
  const items = [], add = (name, e, inV = true) => { if (vis(e)) items.push({ name, q: e.getBoundingClientRect(), inV }); }, $ = s => document.querySelector(".rc-shop " + s);
  add("標題", $(".rc-title")); add("錢包", $(".rc-wallet")); add("✕", $(".rc-x")); add("標籤", $(".rc-tabs"));
  const cur = window.__zy.recUI.debug.cur;
  document.querySelectorAll(".rc-shop .rc-rec").forEach((d, i) => { if (+getComputedStyle(d).opacity > 0.5) add("唱片" + i, d, Math.abs(i - cur) <= 1); });
  add("名字", $(".rc-now")); add("小字", $(".rc-sub")); add("音波", $(".rc-wave"));
  for (const b of document.querySelectorAll(".rc-shop .rc-acts > button")) add("鈕" + (b.className.match(/rc-[\w-]+/) || [""])[0], b);
  add("原本的", $(".rc-isle")); add("家長鎖", $(".rc-lock")); add("DJ", $(".rc-djfig"));
  if ($(".rc-bub").textContent) add("泡泡", $(".rc-bub"));
  for (const a of document.querySelectorAll(".rc-shop .rc-arr")) add("箭頭", a);
  const disc = n => n.startsWith("唱片"), bad = [], out = [];
  for (const it of items) { const q = it.q; if (it.inV && (q.left < -1 || q.top < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1)) out.push(it.name); }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]; if ((disc(a.name) || a.name === "箭頭") && (disc(b.name) || b.name === "箭頭")) continue;
    if (a.q.left < b.q.right - 1 && a.q.right > b.q.left + 1 && a.q.top < b.q.bottom - 1 && a.q.bottom > b.q.top + 1) bad.push(a.name + "×" + b.name);
  }
  const small = [...document.querySelectorAll(".rc-shop button")].filter(b => vis(b) && +getComputedStyle(b).opacity > 0.5).map(b => [b, b.getBoundingClientRect()]).filter(([, q]) => q.width < 43.5 || q.height < 43.5).map(([b]) => b.className);
  return { bad, out, small, n: items.length };
};
const wallOk = r => !r.bad.length && !r.out.length && !r.small.length;
// 小島上的迷你播放器：看得到、在畫面內、≥44px、三顆鈕各 ≥44px 不互疊、歌名沒被切；不跟上方按鈕／狀態列／貓頭鷹／進化膠囊重疊
const npCheck = () => {
  const e = document.getElementById("recNow"), q = e.getBoundingClientRect(), hit = [];
  for (const s of ["#hudLBtn", "#hudRBtn", "#navBtn", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#mapBtn", "#plazaBtn", "#statusBar", "#resumeBtn", "#albumBtn", "#menu .jarBtn", "#walletBtn", "#evoBtn", "#guide > img", "#guideText", "#owlPeek"]) {
    const o = document.querySelector(s); if (!o || getComputedStyle(o).display === "none" || getComputedStyle(o).visibility === "hidden") continue; const b = o.getBoundingClientRect(); if (b.width < 1) continue;
    if (q.left < b.right - 1 && q.right > b.left + 1 && q.top < b.bottom - 1 && q.bottom > b.top + 1) hit.push(s); }
  const bs = [...e.querySelectorAll("button")].map(b => b.getBoundingClientRect()); let bo = false;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].right > bs[j].left + 1 && bs[i].left < bs[j].right - 1) bo = true;
  const t = e.querySelector(".rc-np-t");
  return { shown: !e.classList.contains("hidden") && getComputedStyle(e).display !== "none", inV: q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight, h: Math.round(q.height), w: Math.round(q.width),
    small: bs.filter(b => b.width < 43.5 || b.height < 43.5).length, bo, cut: t.scrollHeight > t.clientHeight + 2, hit, mode: e.dataset.mode,
    name: e.querySelector(".rc-np-name").textContent, mid: e.querySelector(".rc-np-mid").textContent, sub: e.dataset.sub || "", rect: [q.left, q.top, q.right, q.bottom].map(Math.round) };
};
const npS = p => p.evaluate(npCheck);
// 直式上方：🧭 去哪裡、🗺️、家長按鈕、繼續玩、頂端狀態列（貼紙、🎪…） 互不重疊、都在畫面內（🎪 在狀態列裡 不算；11-01 起地點鈕收進 🧭）
const topCheck = () => { const ids = ["#hudLBtn", "#hudRBtn", "#navBtn", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#resumeBtn", "#statusBar", "#menu > .menu-bottom", "#mapBtn", "#plazaBtn"];
  const box = ids.map(s => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { s, q, on: getComputedStyle(e).display !== "none" && q.width > 0 }; }).filter(x => x && x.on);
  const skip = new Set(["#statusBar|#plazaBtn"]), bad = [], out = [];
  for (let i = 0; i < box.length; i++) { const a = box[i].q; if (a.left < -1 || a.top < -1 || a.right > innerWidth + 1 || a.bottom > innerHeight + 1) out.push(box[i].s);
    for (let j = i + 1; j < box.length; j++) { const b = box[j].q; if (skip.has(box[i].s + "|" + box[j].s) || skip.has(box[j].s + "|" + box[i].s)) continue;
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) bad.push(box[i].s + "×" + box[j].s); } }
  return { bad, out, words: [...document.querySelectorAll("#navPanel .nav-row")].map(e => e.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")) }; };

(async () => {
  const browser = await launch();
  // ===== 0. 阿葉 11-01「唱片可以不用星星 想換音樂就可以換」：全部唱片一開始就有（網址沒有 recshop）；三個標籤；DJ 第一次教怎麼轉 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 5, stars: 0, query: QF }); await covers(ctx);
    const R0 = await rec(p);
    ok(`免費：新存檔一開始 ${ALL} 張唱片全部都有（我的歌＋紀念＋店裡的）`, R0.own.length === ALL && MINE.every(id => R0.own.includes(id)) && ["r_town", "r_calm", "r_night"].every(id => R0.own.includes(id)), JSON.stringify(R0));
    const T = await p.evaluate(() => window.__zy.REC.TABS.map(t => [t.k, t.ids]));
    ok("三個標籤：🎧 我的歌＝🔀 隨機＋5 首、🏅 紀念唱片 6 張、🎼 小島配樂 3 張", JSON.stringify(T.map(t => t[1].length)) === "[6,6,3]" && T[0][1][0] === "rand" && JSON.stringify(T[0][1].slice(1)) === JSON.stringify(MINE), JSON.stringify(T));
    await clearSpoken(p);
    ok("免費：openRecords → 唱片牆打開", (await p.evaluate(() => window.__zy.openRecords())) && await wallOn(p));
    await sleep(300);
    let d = await dbg(p);
    ok("開牆（小島放原本的）：停在 🎧 我的歌的第一首（SOYEON；第一張是 🔀 隨機）、開店不自動試聽", d.tab === "mine" && d.sel === "my_soyeon" && d.cur === 1 && !d.playing && (await bgm(p)) === "island", JSON.stringify(d));
    ok("DJ 泡泡＝「歡迎光臨音符唱片行！」、也有唸", (await txt(p, ".rc-bub")) === "歡迎光臨音符唱片行！" && (await spoken(p)).includes("歡迎光臨音符唱片行！"), JSON.stringify(await spoken(p)));
    ok("唱片牆上的唱片數：我的歌標籤 6 張（第一張 🔀 隨機）", JSON.stringify(d.ids) === JSON.stringify(["rand", ...MINE]) && (await p.evaluate(() => document.querySelectorAll(".rc-shop .rc-rec").length)) === 6);
    await sleep(2700);
    ok("第一次開店、沒動轉盤：2.6 秒後 DJ 教「轉到中間就會先聽一小段喔！」（泡泡＋唸）", (await txt(p, ".rc-bub")) === "轉到中間就會先聽一小段喔！" && (await spoken(p)).includes("轉到中間就會先聽一小段喔！"), JSON.stringify(await spoken(p)));
    for (const [k, n, first] of [["memo", 6, "r_rainbow"], ["shop", 3, "r_island"], ["mine", 6, "rand"]]) {
      await tabTo(p, k); await sleep(250); d = await dbg(p);
      ok(`換標籤「${k}」：轉盤換成那組 ${n} 張、從第一張（${first}）開始、標籤亮起來`, d.tab === k && d.ids.length === n && d.cur === 0 && d.sel === first && (await p.evaluate(k => document.querySelector(`.rc-tab[data-k=${k}]`).classList.contains("rc-cur") && document.querySelectorAll(".rc-tab.rc-cur").length === 1, k)), JSON.stringify(d));
    }
    ok("🔀 隨機在中間：名字「隨機」、小字「每次回小島換首歌」、沒有「▶ 聽整首」、有「🏝️ 當小島音樂」", (await txt(p, ".rc-now")) === "隨機" && (await txt(p, ".rc-sub")) === "每次回小島換首歌" && !(await btn(p, ".rc-play")).shown && (await btn(p, ".rc-set")).shown);
    await pickRec(p, "r_calm");
    ok("免費：店裡那張（安靜時光）＝有「▶ 聽整首」「🏝️ 當小島音樂」、小字「小島配樂」，沒有「買下來」", (await btn(p, ".rc-play")).shown && (await btn(p, ".rc-set")).shown && !(await btn(p, ".rc-buy")).shown && !(await btn(p, ".rc-buy-go")).shown && (await txt(p, ".rc-sub")) === "小島配樂");
    await click(p, ".rc-set"); await sleep(200);
    ok("免費：錢包 0 顆也能設成小島音樂；「當小島音樂」換成「✓ 小島正在放」（不能按）", (await rec(p)).pick === "r_calm" && (await p.evaluate(() => window.__zy.wallet)) === 0 && !(await btn(p, ".rc-set")).shown && (await btn(p, ".rc-on")).shown && (await btn(p, ".rc-on")).dis && strip((await btn(p, ".rc-on")).text) === "✓小島正在放");
    ok("免費：錢包膠囊不出現（不用買）", !(await btn(p, ".rc-wallet")).shown);
    await click(p, ".rc-x"); await sleep(300); await p.evaluate(() => window.__zy.openRecords()); await clearSpoken(p); await sleep(2900);
    ok("第二次開店：不再教一次（這次開頁教過了）；開牆停在小島正在放的那張（🎼 安靜時光）", !(await spoken(p)).includes("轉到中間就會先聽一小段喔！") && (await dbg(p)).sel === "r_calm" && (await dbg(p)).tab === "shop", JSON.stringify({ sp: await spoken(p), d: await dbg(p) }));
    ok("免費：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 0b. 轉盤操作（真的用滑鼠）：撥一下換一張、停 0.6 秒才試聽、點旁邊那張轉到中間、‹ ›、點中間那張馬上試聽 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, query: QF }); await covers(ctx);
    await p.evaluate(() => window.__zy.openRecords()); await sleep(500);
    const t0 = await center(p, ".rc-title"); await p.mouse.click(t0.x, t0.y); await sleep(200);   // 真的點一下：解鎖聲音
    const u = await p.evaluate(() => { const d = document.querySelector(".rc-shop .rc-rec"); return d.offsetWidth * 0.62 * parseFloat(getComputedStyle(document.querySelector(".rc-shop")).getPropertyValue("--sp")); });
    const c0 = await center(p, ".rc-rec.rc-mid");
    await p.mouse.move(c0.x, c0.y); await p.mouse.down();
    for (let i = 1; i <= 10; i++) { await p.mouse.move(c0.x - (u * 1.05 * i) / 10, c0.y); await sleep(25); }
    await sleep(200); await p.mouse.up(); await sleep(300);
    let d = await dbg(p), b0 = await bgm(p);
    ok("手指往左撥一張（放開前停住）：中間換成下一張 BAD（吸到最近一張）、還沒試聽", d.sel === "my_ateez" && d.cur === 2 && !d.playing && b0 === "island", JSON.stringify({ d, b0, u }));
    await sleep(500); d = await dbg(p);
    ok("停在中間 0.6 秒：自動試聽 BAD（中間那張在轉）", d.playing === "my_ateez" && (await bgm(p)) === "my:my_ateez" && await p.evaluate(() => document.querySelector(".rc-rec.rc-mid").classList.contains("rc-spin")), JSON.stringify(d));
    ok("名字「BAD」、小字是歌手「ATEEZ」、音波條在跳（試聽中）", (await txt(p, ".rc-now")) === "BAD" && (await txt(p, ".rc-sub")) === "ATEEZ" && await p.evaluate(() => document.querySelector(".rc-shop").classList.contains("rc-live") && getComputedStyle(document.querySelector(".rc-wave i")).animationName === "rcWave"));
    const nb = await p.evaluate(() => { const q = document.querySelector(".rc-rec[data-id=my_jay]").getBoundingClientRect(); return { x: q.left + q.width * 0.75, y: q.top + q.height / 2 }; });
    await p.mouse.click(nb.x, nb.y); await sleep(300); d = await dbg(p); const b1 = await bgm(p);
    ok("點右邊那張（女兒殿下）：轉到中間、0.6 秒內還是放 BAD", d.sel === "my_jay" && d.cur === 3 && b1 === "my:my_ateez", JSON.stringify({ d, b1 }));
    await sleep(500);
    ok("點過去之後停 0.6 秒：換試聽女兒殿下", (await bgm(p)) === "my:my_jay" && (await dbg(p)).playing === "my_jay");
    const pv = await center(p, ".rc-prev"); await p.mouse.click(pv.x, pv.y); await sleep(250);
    ok("按 ‹：轉回 BAD", (await dbg(p)).sel === "my_ateez");
    const cm = await center(p, ".rc-rec.rc-mid"); await p.mouse.click(cm.x, cm.y); await sleep(150);
    ok("點中間那張：馬上試聽（不用等 0.6 秒）", (await bgm(p)) === "my:my_ateez" && (await dbg(p)).playing === "my_ateez");
    const nx = await center(p, ".rc-next"); for (let i = 0; i < 6; i++) { await p.mouse.click(nx.x, nx.y); await sleep(120); }
    d = await dbg(p);
    ok("一直按 ›：停在最後一張（看著我的眼睛說）、› 變灰不能按、‹ 可以按", d.sel === "my_eyes" && d.cur === 5 && await p.evaluate(() => document.querySelector(".rc-next").disabled && !document.querySelector(".rc-prev").disabled), JSON.stringify(d));
    await p.keyboard.press("ArrowLeft"); await sleep(200);
    ok("鍵盤 ←：往回一張（英雄爸爸）", (await dbg(p)).sel === "my_hero");
    await tabTo(p, "mine"); await p.evaluate(() => { document.querySelector(".rc-rec[data-id=rand]").click(); }); await sleep(800);
    ok("轉到 🔀 隨機：試聽停掉、放回原本的小島音樂", !(await dbg(p)).playing && (await bgm(p)) === "island" && !(await p.evaluate(() => document.querySelector(".rc-shop").classList.contains("rc-live"))));
    ok("轉盤操作：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 1. 舊存檔：紀念唱片第一次進唱片行一起補發（recshop：舊規則）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 25, stars: 30, query: Q }); await covers(ctx);
    await p.evaluate(() => { localStorage.setItem("zy1_tops", JSON.stringify({ stars: 20, freeUsed: 1, rank: 1 })); localStorage.setItem("zy1_bubble", JSON.stringify({ lv: 1, stars: { 0: 2 } })); });
    await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); }); await sleep(400);
    await clearSpoken(p);
    ok("開頁：只有 5 首我的歌（一開始就有）；紀念唱片要進唱片行才補發", JSON.stringify((await rec(p)).own) === JSON.stringify(MINE), JSON.stringify(await rec(p)));
    ok("openRecords → 唱片牆打開", (await p.evaluate(() => window.__zy.openRecords())) && await wallOn(p));
    await sleep(300);
    let R = await rec(p);
    ok("補發：彩虹島（25 張 ≥ 20）、對戰（陀螺 rank 1）、泡泡（過過一關）；歸仁區（< 30）、配送、寵物不送", ["r_rainbow", "r_battle", "r_bubble", ...MINE].every(id => R.own.includes(id)) && !["r_town", "r_road", "r_evolve"].some(id => R.own.includes(id)) && R.own.length === MINE.length + 3, JSON.stringify(R));
    ok("補發有存進 zy1_rec", await p.evaluate(n => (JSON.parse(localStorage.getItem("zy1_rec")) || {}).own.length === n, MINE.length + 3));
    ok("DJ 說「拿到新唱片了！」（泡泡也是）", (await spoken(p)).includes("拿到新唱片了！") && (await txt(p, ".rc-bub")) === "拿到新唱片了！", JSON.stringify(await spoken(p)));
    ok("recshop：錢包膠囊在標題旁邊", (await btn(p, ".rc-wallet")).shown && strip((await btn(p, ".rc-wallet")).text) === "⭐20");
    ok(`唱片 ${ALL} 張（沒有音樂島主題曲 r_music；寵物那張叫「寵物」、放 dress）`, await p.evaluate(n => window.__zy.REC.RECORDS.length === n && !window.__zy.REC.REC_BY_ID.r_music && window.__zy.REC.REC_BY_ID.r_evolve.name === "寵物" && window.__zy.REC.REC_BY_ID.r_evolve.bgm === "dress", ALL));
    await tabTo(p, "memo"); await sleep(250);
    const memo = await p.evaluate(() => [...document.querySelectorAll(".rc-shop .rc-rec")].map(c => ({ id: c.dataset.id, have: c.classList.contains("have") })));
    ok("🏅 紀念唱片標籤：拿到的亮、沒拿到的灰（歸仁區）", memo.length === 6 && memo.find(m => m.id === "r_rainbow").have && !memo.find(m => m.id === "r_town").have && await p.evaluate(() => getComputedStyle(document.querySelector(".rc-rec[data-id=r_town] .rc-lab")).filter.includes("grayscale")), JSON.stringify(memo));
    ok("彩虹島（拿到了）在中間：小字「紀念唱片」", (await dbg(p)).sel === "r_rainbow" && (await txt(p, ".rc-sub")) === "紀念唱片");
    ok("🎤 鈕藏著（兒歌接唱第三批才做）", !(await btn(p, ".rc-sing")).shown);
    // 試聽：轉到一張 → 放那首；10 秒後放回選單音樂
    await clearSpoken(p); await pickRec(p, "r_town");
    ok("轉到沒拿到的紀念唱片也能試聽（放歸仁區那首、唱片在轉）、沒有買／當小島音樂／聽整首的鈕", (await bgm(p)) === "town" && await p.evaluate(() => document.querySelector(".rc-rec[data-id=r_town]").classList.contains("rc-spin")) && !(await btn(p, ".rc-set")).shown && !(await btn(p, ".rc-buy")).shown && !(await btn(p, ".rc-play")).shown, String(await bgm(p)));
    ok("沒拿到的紀念唱片：小字寫條件、語音直接講「開放歸仁區就送你」（不識字的小孩也懂）", (await txt(p, ".rc-sub")) === "開放歸仁區就送你" && (await spoken(p)).includes("開放歸仁區就送你"), JSON.stringify(await spoken(p)));
    await sleep(10400);
    ok("試聽 10 秒後：放回選單音樂（island）、唱片停", (await bgm(p)) === "island" && !(await p.evaluate(() => document.querySelector(".rc-rec[data-id=r_town]").classList.contains("rc-spin"))), String(await bgm(p)));
    // 買店裡的：錢包 20 顆
    await p.evaluate(() => window.__zy.setWallet(20)); await pickRec(p, "r_calm", 300);
    ok("店裡的唱片（沒買）：「⭐8 買下來」、小字「小島配樂・⭐8」", strip((await btn(p, ".rc-buy")).text) === "⭐8買下來" && (await btn(p, ".rc-buy")).shown && (await txt(p, ".rc-sub")) === "小島配樂・⭐8");
    await click(p, ".rc-buy"); await click(p, ".rc-buy-go");   // 同一瞬間連點兩下
    ok("連點兩下（不到 0.4 秒）：不會買", !(await rec(p)).own.includes("r_calm") && (await p.evaluate(() => window.__zy.wallet)) === 20 && (await btn(p, ".rc-buy-go")).shown);
    await sleep(450); await click(p, ".rc-buy-go"); await sleep(200);
    R = await rec(p);
    ok("隔 0.4 秒再按「✔ 買」：買到了、錢包 20 → 12、存檔", R.own.includes("r_calm") && (await p.evaluate(() => window.__zy.wallet)) === 12 && await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_rec")).own.includes("r_calm")), JSON.stringify(R));
    ok("買到之後：有「▶ 聽整首」「🏝️ 當小島音樂」、沒有買的鈕、唱片亮起來", (await btn(p, ".rc-play")).shown && (await btn(p, ".rc-set")).shown && !(await btn(p, ".rc-buy")).shown && !(await btn(p, ".rc-buy-go")).shown && await p.evaluate(() => document.querySelector(".rc-rec[data-id=r_calm]").classList.contains("have")));
    // 錢不夠
    await p.evaluate(() => window.__zy.setWallet(5)); await clearSpoken(p); await pickRec(p, "r_night", 300);
    await click(p, ".rc-buy"); await sleep(500); await click(p, ".rc-buy-go");
    ok("錢不夠（5 顆、要 8 顆）：按「買下來」說「還差 3 顆星星！」（數字）、不會出「✔ 買」、錢包不變", !(await rec(p)).own.includes("r_night") && (await p.evaluate(() => window.__zy.wallet)) === 5 && !(await btn(p, ".rc-buy-go")).shown && (await spoken(p)).includes("還差 3 顆星星！"), JSON.stringify(await spoken(p)));
    ok("1180×820 recshop（錢包、買下來）：唱片牆元素互不重疊、在畫面內、按鈕 ≥44px", wallOk(await p.evaluate(wallCheck)), JSON.stringify(await p.evaluate(wallCheck)));
    // 當小島音樂 → 關掉唱片牆 → 選單放那首
    await pickRec(p, "r_rainbow", 300); await click(p, ".rc-set"); await sleep(200);
    ok("「🏝️ 當小島音樂」：pick＝r_rainbow、按鈕換成「✓ 小島正在放」、那張唱片貼上 🏝️", (await rec(p)).pick === "r_rainbow" && (await btn(p, ".rc-on")).shown && !(await btn(p, ".rc-set")).shown && await p.evaluate(() => document.querySelector(".rc-rec[data-id=r_rainbow]").classList.contains("rc-pin") && getComputedStyle(document.querySelector(".rc-rec[data-id=r_rainbow] .rc-pinb")).display !== "none"));
    await click(p, ".rc-x"); await sleep(300);
    ok("關掉唱片牆：選單音樂＝彩虹島那首（主島也是）", !(await wallOn(p)) && (await bgm(p)) === "rainbow" && (await p.evaluate(() => window.__zy.menuBgmKey("main"))) === "rainbow");
    // 隨機：同一段選單期間固定一首
    await p.evaluate(() => window.__zy.openRecords()); await sleep(250);
    let d = await dbg(p);
    ok("再開唱片牆：停在小島正在放的那張（🏅 彩虹島）", d.tab === "memo" && d.sel === "r_rainbow", JSON.stringify(d));
    await tabTo(p, "mine"); await sleep(200); await click(p, ".rc-set"); await sleep(200);
    const keys = await p.evaluate(() => [1, 2, 3, 4, 5, 6].map(() => window.__zy.menuBgmKey()));
    const ownBgm = await p.evaluate(() => window.__zy.recSave.own.map(id => window.__zy.REC.REC_BY_ID[id].bgm));
    ok("🔀 隨機（我的歌第一張）「當小島音樂」：pick＝rand、menuBgmKey 叫 6 次都是同一首、是有的唱片", (await rec(p)).pick === "rand" && keys.every(k => k === keys[0]) && ownBgm.includes(keys[0]) && (await btn(p, ".rc-on")).shown, JSON.stringify({ keys, ownBgm }));
    // 原本的
    ok("「🏝️ 原本的音樂」平常不亮（小島在放唱片）", !(await p.evaluate(() => document.querySelector(".rc-orig").classList.contains("on"))));
    await click(p, ".rc-orig"); await sleep(200);
    ok("按「🏝️ 原本的音樂」：pick 清空、那顆亮起來", (await rec(p)).pick === "" && await p.evaluate(() => document.querySelector(".rc-orig").classList.contains("on")));
    await click(p, ".rc-x"); await sleep(300);
    ok("關掉：選單放主島原本的 island", (await bgm(p)) === "island");
    // 家長鎖
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_battle", 300); await click(p, ".rc-set"); await click(p, ".rc-x"); await sleep(300);
    ok("（再選一張：對戰）選單放 battle", (await bgm(p)) === "battle");
    await p.evaluate(() => document.getElementById("settingsBtn").click()); await sleep(300);
    const so = await p.evaluate(() => ({ has: !!document.querySelector("#bgmLockOpts"), on: document.querySelector("#bgmLockOpts .opt.on")?.dataset.v }));
    ok("家長頁 🎵 段有「小島只放原本的音樂」開關、預設關", so.has && so.on === "0", JSON.stringify(so));
    await p.evaluate(() => document.querySelector("#bgmLockOpts .opt[data-v='1']").click()); await sleep(300);
    await p.evaluate(() => document.getElementById("bgmLockOpts").scrollIntoView({ block: "center" })); await sleep(200);
    await p.screenshot({ path: path.join(SHOTS, "records-settings-lock-1180x820.png") });
    ok("開鎖：存成 zy_bgm_lock＝1、按鈕亮「開」", await p.evaluate(() => localStorage.getItem("zy_bgm_lock") === "1" && document.querySelector("#bgmLockOpts .opt.on").dataset.v === "1" && window.__zy.bgmLock === 1));
    await p.evaluate(() => document.getElementById("settingsClose").click()); await sleep(300);
    ok("鎖著：選單馬上放回原本的 island（pick 還留著 r_battle）", (await bgm(p)) === "island" && (await rec(p)).pick === "r_battle");
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_rainbow", 300);
    const lk = await p.evaluate(() => ({ isle: document.querySelector(".rc-isle").classList.contains("hidden"), lock: document.querySelector(".rc-lock").classList.contains("hidden") ? "" : document.querySelector(".rc-lock").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), pin: document.querySelectorAll(".rc-rec.rc-pin").length }));
    ok("鎖著的唱片牆：「當小島音樂」「✓ 小島正在放」「原本的音樂」都藏起來、只寫一行字、沒有 🏝️ 貼紙；「▶ 聽整首」照樣有", lk.isle && lk.lock === "家長設定：小島放原本的音樂" && !lk.pin && !(await btn(p, ".rc-set")).shown && !(await btn(p, ".rc-on")).shown && (await btn(p, ".rc-play")).shown, JSON.stringify(lk));
    ok("鎖著的唱片牆：元素互不重疊、在畫面內", wallOk(await p.evaluate(wallCheck)), JSON.stringify(await p.evaluate(wallCheck)));
    await click(p, ".rc-x"); await sleep(200);
    ok("鎖著：小島上沒有迷你播放器（小島放原本的）", !(await npS(p)).shown);
    ok("備份碼不帶 zy_bgm_lock（全家共用的家長設定，跟背景音樂開關一樣）", await p.evaluate(() => !/bgm_lock|bgmLock/.test(atob(window.__zyB.exportCode().slice(4)))));
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.querySelector("#bgmLockOpts .opt[data-v='0']").click(); document.getElementById("settingsClose").click(); }); await sleep(800);
    ok("關鎖：選單又放 battle、迷你播放器出來（對戰）", (await bgm(p)) === "battle" && (await npS(p)).shown && strip((await npS(p)).name) === "對戰", JSON.stringify(await npS(p)));
    // 備份碼：rc 跟著走
    const code = await p.evaluate(() => window.__zyB.exportCode());
    const dec = await p.evaluate(c => window.__zyB.readCode(c), code);
    ok("備份碼 ZY2 帶 rc（唱片、小島音樂）", dec && dec.slots[0].rec && dec.slots[0].rec.own.includes("r_calm") && dec.slots[0].rec.pick === "r_battle", JSON.stringify(dec && dec.slots[0].rec));
    const evil = "ZY2:" + Buffer.from(JSON.stringify({ v: 2, p: [{ s: ["貓"], st: 1, rc: { own: ["r_town", "r_hack", 5], pick: "r_night", seen: "x" } }] })).toString("base64");
    const ev = await p.evaluate(c => window.__zyB.readCode(c), evil);
    ok("備份碼 rc 清洗：不認得的唱片丟掉、沒有的唱片不能當小島音樂、5 首我的歌一定在", ev && JSON.stringify(ev.slots[0].rec) === JSON.stringify({ own: ["r_town", ...MINE], pick: "", seen: [] }), JSON.stringify(ev && ev.slots[0].rec));
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
    ok("遊戲中：迷你播放器不出現", !(await npS(p)).shown);
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(600);
    // 清除重來：這位的唱片清掉；家長鎖（全家共用）留著
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.querySelector("#bgmLockOpts .opt[data-v='1']").click(); document.getElementById("resetBtn").click(); document.getElementById("resetBtn").click(); document.getElementById("settingsClose").click(); }); await sleep(400);
    ok("清除重來：zy1_rec 清掉、只剩 5 首我的歌；家長鎖 zy_bgm_lock 還在", await p.evaluate(m => localStorage.getItem("zy1_rec") === null && JSON.stringify(window.__zy.recSave.own) === JSON.stringify(m) && localStorage.getItem("zy_bgm_lock") === "1" && window.__zy.bgmLock === 1, MINE), JSON.stringify(await p.evaluate(() => ({ ls: localStorage.getItem("zy1_rec"), own: window.__zy.recSave.own }))));
    ok("旁注音沒漏字", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    ok("沒有錯誤（補發／買／小島音樂／家長鎖）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 留聲機：花園小舖買了送一張唱片（只送一次、一台）；點留聲機＝開唱片牆；介紹卡「💿 進唱片行」=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, stars: 60, query: Q }); await covers(ctx);
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
    ok("1180×820：唱片牆元素互不重疊、在畫面內", wallOk(await p.evaluate(wallCheck)), JSON.stringify(await p.evaluate(wallCheck)));
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
    ok(`唱片行介紹卡：名字「音符唱片行」、大按鈕「💿 進唱片行」、寫有幾張唱片（共 ${ALL} 張）、沒有等級徽章、沒鎖（45 張）`, pk.name === "音符唱片行" && pk.go === "💿進唱片行" && new RegExp(`💿 \\d+／${ALL}`).test(pk.meta) && !pk.lock && pk.lv, JSON.stringify(pk));
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
  // ===== 3. 25 張：唱片行介紹卡鎖著；各尺寸唱片牆（三個標籤、最長的歌名、最長的 DJ 泡泡）互不重疊、在畫面內 =====
  {
    const { ctx, p } = await openGame(browser, { stickers: 25, query: Q });
    await p.evaluate(() => window.__zy.showPick("records", {})); await sleep(300);
    ok("25 張：唱片行介紹卡鎖著、寫「再收集 15 張貼紙」、沒有大按鈕", await p.evaluate(() => document.getElementById("pick").classList.contains("locked") && document.getElementById("pkLock").textContent.includes("再收集 15 張貼紙") && getComputedStyle(document.getElementById("pkGo")).display === "none"));
    await p.evaluate(() => document.getElementById("pkClose").click());
    await ctx.close();
    for (const [w, h] of [[1180, 820], [1024, 768], [820, 1180], [768, 1024], [390, 844]]) {
      const P = await openGame(browser, { w, h, stickers: 45, query: QF }); await covers(P.ctx);
      await P.p.evaluate(() => window.__zy.openRecords()); await sleep(3000);   // 等 DJ 教轉盤（泡泡比招呼長）
      const bad = [];
      for (const k of ["memo", "shop", "mine"]) { await tabTo(P.p, k); await sleep(450); const r = await P.p.evaluate(wallCheck); if (!wallOk(r)) bad.push(k + ":" + JSON.stringify(r)); }
      await pickRec(P.p, "my_eyes", 500); let r = await P.p.evaluate(wallCheck); if (!wallOk(r)) bad.push("看著我的眼睛說:" + JSON.stringify(r));
      await P.p.evaluate(() => { document.querySelector(".rc-bub").textContent = window.__zy.REC.LINES.mute; }); await sleep(200);   // 最長的 DJ 台詞
      r = await P.p.evaluate(wallCheck); if (!wallOk(r)) bad.push("泡泡最長:" + JSON.stringify(r));
      await click(P.p, ".rc-set"); await sleep(300); r = await P.p.evaluate(wallCheck); if (!wallOk(r)) bad.push("小島正在放:" + JSON.stringify(r));
      ok(`${w}×${h}：唱片牆（三個標籤、最長歌名、最長泡泡、✓ 小島正在放）元素互不重疊、中間＋兩旁唱片和按鈕都在畫面內、按鈕 ≥44px`, bad.length === 0, bad.join(" ‖ "));
      const sz = await P.p.evaluate(() => { const m = document.querySelector(".rc-rec.rc-mid").getBoundingClientRect(); return Math.round(m.width); });
      ok(`${w}×${h}：中間那張唱片夠大（≥ 150px）`, sz >= 150, String(sz));
      if (w === 820 || w === 390) await P.p.screenshot({ path: path.join(SHOTS, `records-wall-${w}x${h}.png`) });
      ok(`${w}×${h}：沒有錯誤`, P.errs.length === 0, P.errs.join(" | "));
      await P.ctx.close();
    }
  }
  // ===== 4. 「▶ 聽整首」（櫻木 11-01）：收起唱片牆、小島放這首、寵物跳、迷你播放器 ⏹ 可以停；放完／進遊戲／再開唱片牆＝回原本的；整首歌接著放；⏳ 下載中 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, query: Q }); await covers(ctx);
    const bins = []; p.on("request", r => { const m = r.url().match(/audio\/songs\/(\w+)\.bin/); if (m) bins.push(m[1]); });
    await ctx.route("**/audio/songs/*.bin*", async r => { await sleep(1500); await r.continue(); });   // 下載慢一點：看得到 ⏳
    const S = () => p.evaluate(() => { const z = window.__zy, d = window.__zyAudio.debug(), pl = document.getElementById("recNow");
      return { wall: z.recUI.isOpen(), bgm: z.bgmNow(), np: z.recUI.debug.np, dance: z.recUI.debug.dances.slice(-1)[0], once: d.once, loading: d.loading, pos: d.pos,
        play: d.stream.find(s => s.key && s.key === d.cur) || null, pill: !pl.classList.contains("hidden") && getComputedStyle(pl).display !== "none", mode: pl.dataset.mode,
        text: pl.querySelector(".rc-np-t").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), mid: pl.querySelector(".rc-np-mid").textContent, sub: pl.dataset.sub || "", aria: pl.getAttribute("aria-label"), menuKey: z.menuBgmKey() }; });
    const playing = () => p.waitForFunction(() => { const d = window.__zyAudio.debug(); return !d.loading && d.stream.some(s => s.key === d.cur && !s.paused); }, null, { timeout: 15000 }).then(() => true, () => false);
    const stopBtn = () => p.evaluate(() => document.querySelector("#recNow .rc-np-mid").click());
    ok("迷你播放器 #recNow 在 #menu > .menu-bottom 裡、平常藏著", await p.evaluate(() => { const e = document.getElementById("recNow"); return !!e && e.parentNode.matches("#menu > .menu-bottom") && e.classList.contains("hidden"); }));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(300);
    const t0 = await center(p, ".rc-title"); await p.mouse.click(t0.x, t0.y); await sleep(200);   // 真的點一下：解鎖聲音（iOS 規則一樣）
    // ⏳：第一次轉到我的歌要先下載＋解密
    await pickRec(p, "my_jay");
    const w1 = await p.evaluate(() => ({ lab: window.__zy.recUI.debug.label(), wait: document.querySelector(".rc-rec.rc-mid").classList.contains("rc-wait"), loading: window.__zyAudio.debug().loading }));
    ok("第一次轉到我的歌（還在下載＋解密）：中間那張換成 ⏳、先不轉；開始下載那首", w1.lab === "⏳" && w1.wait && w1.loading && bins.includes("my_jay"), JSON.stringify({ w1, bins }));
    const ok1 = await playing(); await sleep(400);
    const w2 = await p.evaluate(() => { const m = document.querySelector(".rc-rec.rc-mid"); return { lab: window.__zy.recUI.debug.label(), wait: m.classList.contains("rc-wait"), spin: m.classList.contains("rc-spin") }; });
    ok("開始出聲：⏳ 拿掉（換回 👑）、唱片在轉", ok1 && w2.lab === "👑" && !w2.wait && w2.spin, JSON.stringify({ ok1, w2, s: await S() }));
    await clearSpoken(p); await click(p, ".rc-play"); await sleep(500);
    let s = await S();
    ok("「▶ 聽整首」（我的歌）：唱片牆收起來、小島接著放這首、寵物跳 60 秒、放完就停（不循環）、選單音樂也是這首", !s.wall && s.bgm === "my:my_jay" && s.np && s.np.whole && s.dance === 60 && s.once === "my:my_jay" && s.play && !s.play.loop && s.menuKey === "my:my_jay", JSON.stringify(s));
    ok("小島上出現迷你播放器「女兒殿下」（讀屏「聽整首：女兒殿下」）、中間是 ⏹", s.pill && s.mode === "np" && s.text === "女兒殿下" && s.sub === "聽整首" && s.aria === "聽整首：女兒殿下" && s.mid === "⏹", JSON.stringify(s));
    await sleep(2500);
    await stopBtn(); await sleep(1300);
    s = await S();
    ok("按 ⏹：回原本的小島音樂（island）、播放器收起來、寵物停（dance 0）、記住女兒殿下放到第幾秒", s.bgm === "island" && !s.np && !s.pill && s.dance === 0 && s.once === null && s.pos["my:my_jay"] > 2.5, JSON.stringify(s));
    const was = s.pos["my:my_jay"];
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "my_jay"); await playing(); await sleep(300);
    s = await S();
    ok("第二次放同一首：從上次停的地方接著放（currentTime 不是 0）", s.bgm === "my:my_jay" && s.play && s.play.t >= was - 0.5, JSON.stringify({ was, play: s.play }));
    await click(p, ".rc-play"); await sleep(500); await playing();
    // 放完：拉到快結尾 → ended → 回原本的
    await p.evaluate(() => { const e = window.__zyAudio.streamEl(); e.currentTime = e.duration - 1.2; });
    await p.waitForFunction(() => !window.__zy.recUI.debug.np, null, { timeout: 8000 }).catch(() => {}); await sleep(300);
    s = await S();
    ok("整首歌放完（audio ended）：回原本的小島音樂、播放器收起來、寵物停", s.bgm === "island" && !s.np && !s.pill && s.dance === 0, JSON.stringify(s));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "my_jay"); await playing(); await sleep(200);
    s = await S();
    ok("上次放到最後不到 5 秒：這次從頭放", s.play && s.play.t < 3, JSON.stringify(s.play));
    // 阿葉 11-01「放完之後就變成原本遊戲的背景音樂」：我的歌當小島音樂＝放一次，放完換回原本的（唱片設定還在，從遊戲回來再放一次）
    await click(p, ".rc-set"); await sleep(200); await p.evaluate(() => window.__zy.recUI.close()); await sleep(400); await playing(); await sleep(300);
    s = await S();
    ok("我的歌當小島音樂：回小島放這首、不循環；迷你播放器「女兒殿下」（讀屏「小島音樂」）、中間 ⏸", s.bgm === "my:my_jay" && s.play && s.play.loop === false && s.pill && s.mode === "pick" && s.text === "女兒殿下" && s.sub === "小島音樂" && s.mid === "⏸", JSON.stringify(s));
    await p.evaluate(() => { const e = window.__zyAudio.streamEl(); e.currentTime = e.duration - 1.2; });
    await p.waitForFunction(() => window.__zy.bgmNow() !== "my:my_jay", null, { timeout: 8000 }).catch(() => {}); await sleep(300);
    s = await S();
    ok("我的歌當小島音樂放完：換回原本的小島音樂、唱片設定還在、迷你播放器收起來（沒在放唱片了）", s.bgm === "island" && s.menuKey === "island" && (await rec(p)).pick === "my_jay" && !s.pill, JSON.stringify(s));
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=fish]").click());
    await p.waitForFunction(() => window.__zy.mode === "fish", null, { timeout: 10000 }).catch(() => {}); await sleep(400);
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(1500);
    s = await S();
    ok("從遊戲回小島：女兒殿下再放一次、迷你播放器又出來", s.bgm === "my:my_jay" && s.pill && s.mode === "pick", JSON.stringify(s));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await click(p, ".rc-orig"); await sleep(200);
    // 一般曲（60 秒循環）：跳 30 秒、放一輪就回原本的
    await pickRec(p, "r_rainbow", 300); await click(p, ".rc-play"); await sleep(400);
    s = await S();
    ok("「▶ 聽整首」一般曲（彩虹島）：唱片牆收起來、放 rainbow、寵物跳 30 秒、播放器「彩虹島」、照常循環", !s.wall && s.bgm === "rainbow" && s.dance === 30 && s.pill && s.text === "彩虹島" && s.once === null, JSON.stringify(s));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(400);
    s = await S(); const d0 = await dbg(p);
    ok("放到一半又開唱片牆：先回到原本的小島音樂、播放器收起來、轉盤停在剛剛那張（彩虹島）", s.wall && s.bgm === "island" && !s.np && !s.pill && d0.sel === "r_rainbow", JSON.stringify({ s, d0 }));
    await p.evaluate(() => { window.__zy.REC.TIMES.round = 1500; }); await pickRec(p, "r_rainbow", 200); await click(p, ".rc-play"); await sleep(300);
    const sA = await S(); await sleep(2000); s = await S();
    ok("一般曲放一輪（測試改 1.5 秒）：自己回原本的小島音樂、播放器收起來", sA.bgm === "rainbow" && sA.pill && s.bgm === "island" && !s.np && !s.pill && s.dance === 0, JSON.stringify({ sA, s }));
    await p.evaluate(() => { window.__zy.REC.TIMES.round = 60000; window.__zy.openRecords(); }); await sleep(200); await pickRec(p, "r_rainbow", 200); await click(p, ".rc-play"); await sleep(300);
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=fish]").click());
    await p.waitForFunction(() => window.__zy.mode === "fish", null, { timeout: 10000 }).catch(() => {}); await sleep(500);
    s = await S();
    ok("放到一半進遊戲：「聽整首」結束、放遊戲自己的音樂、播放器不見", !s.np && s.bgm !== "rainbow" && !s.pill, JSON.stringify(s));
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(800);
    s = await S();
    ok("從遊戲回小島：放原本的小島音樂（island）", s.bgm === "island" && !s.np && !s.pill, JSON.stringify(s));
    // 音樂關著：轉到我的歌照樣先下載；「▶ 聽整首」留在唱片牆、說音樂關著
    await p.evaluate(() => document.getElementById("musicBtn").click()); await sleep(300);
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await clearSpoken(p);
    await pickRec(p, "my_hero"); await click(p, ".rc-play"); await sleep(300);
    s = await S();
    ok("音樂關著：轉到我的歌也先下載（英雄爸爸）、「▶ 聽整首」不收唱片牆、DJ 說「音樂關著喔」", bins.includes("my_hero") && s.wall && !s.np && (await spoken(p)).some(t => t.startsWith("音樂關著喔")) && (await txt(p, ".rc-bub")).startsWith("音樂關著喔"), JSON.stringify({ bins, s, sp: await spoken(p) }));
    await click(p, ".rc-x"); await p.evaluate(() => document.getElementById("musicBtn").click()); await sleep(300);
    ok("旁注音沒漏字（播放器、還差幾顆）", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    ok("「▶ 聽整首」：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 4b. 迷你播放器 ⏮ ⏸ ⏭（小島音樂）、聽整首時 ⏮⏭ 換那張聽、⏹；家長鎖；封面圖（有圖＝圓形封面、壞掉＝退回 emoji）；prefers-reduced-motion =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 45, query: QF }); await covers(ctx, ["my_jay", "r_rainbow"]);
    const pickNow = () => p.evaluate(() => window.__zy.recSave.pick);
    const np = id => p.evaluate(c => document.querySelector("#recNow " + c).click(), id);
    ok("小島音樂是原本的：沒有迷你播放器", !(await npS(p)).shown);
    await p.evaluate(() => window.__zy.openRecords()); await sleep(300);
    const cv = await p.evaluate(() => { const lab = id => document.querySelector(`.rc-rec[data-id=${id}] .rc-lab`), im = id => lab(id).querySelector("img.rc-cover");
      return { jay: !!im("my_jay") && im("my_jay").naturalWidth > 0 && lab("my_jay").classList.contains("rc-has-cover") && getComputedStyle(lab("my_jay").querySelector(".rc-e")).visibility === "hidden" && getComputedStyle(im("my_jay")).objectFit === "cover" && getComputedStyle(im("my_jay")).borderRadius === "50%",
        hero: !im("my_hero") && !lab("my_hero").classList.contains("rc-has-cover") && lab("my_hero").querySelector(".rc-e").textContent === "🦸‍♂️",   // （英雄爸爸離中間 3 張、整張淡出，不看 visibility）
        rand: !im("rand") && lab("rand").querySelector(".rc-e").textContent === "🔀", src: window.__zy.REC.REC_BY_ID.my_jay.cover }; });
    ok("封面圖：女兒殿下有圖＝圓形裁切的封面、emoji 藏起來；英雄爸爸圖壞掉＝拿掉 img、退回 emoji＋顏色；🔀 隨機沒有圖", cv.jay && cv.hero && cv.rand && cv.src === "IMAGE/zhuyin/rec/my_jay.webp", JSON.stringify(cv));
    ok("每張唱片都有 cover＝IMAGE/zhuyin/rec/<id>.webp", await p.evaluate(() => window.__zy.REC.RECORDS.every(r => r.cover === `IMAGE/zhuyin/rec/${r.id}.webp`)));
    await pickRec(p, "my_hero", 300);
    ok("封面壞掉的英雄爸爸轉到中間：看得到 emoji 🦸‍♂️＋顏色", await p.evaluate(() => { const l = document.querySelector(".rc-rec.rc-mid .rc-lab"), e = l.querySelector(".rc-e"); return l.closest(".rc-rec").dataset.id === "my_hero" && getComputedStyle(e).visibility === "visible" && e.getBoundingClientRect().width > 10 && getComputedStyle(l).backgroundColor === "rgb(95, 180, 255)"; }));
    await pickRec(p, "my_jay", 300); await click(p, ".rc-set"); await click(p, ".rc-x"); await sleep(600);
    let n = await npS(p);
    ok("小島音樂＝女兒殿下：迷你播放器出現（女兒殿下／小島音樂／⏸）、唱片小圖是封面、在轉", n.shown && n.mode === "pick" && strip(n.name) === "女兒殿下" && n.mid === "⏸" && strip(n.sub) === "小島音樂" && await p.evaluate(() => { const l = document.querySelector("#recNow .rc-np-lab"); return l.classList.contains("rc-has-cover") && getComputedStyle(document.querySelector("#recNow .rc-np-disc")).animationName === "rcSpin"; }), JSON.stringify(n));
    ok("迷你播放器（卡片選單）：≥44px、≤440×60、三顆鈕各 ≥44px 不互疊、歌名沒被切（擺在哪由 .menu-bottom 管；3D 小島的位置在第 5 段驗）", n.h >= 44 && n.h <= 60 && n.w <= 440 && !n.small && !n.bo && !n.cut, JSON.stringify(n));
    await np(".rc-np-next"); await sleep(400);
    ok("⏭：下一張（英雄爸爸）當小島音樂、存檔、選單放那首、寵物跳", (await pickNow()) === "my_hero" && (await bgm(p)) === "my:my_hero" && await p.evaluate(() => JSON.parse(localStorage.getItem("zy1_rec")).pick === "my_hero" && window.__zy.recUI.debug.dances.slice(-1)[0] === 15) && strip((await npS(p)).name) === "英雄爸爸");
    await np(".rc-np-next"); await sleep(250);
    ok("⏭：看著我的眼睛說（長歌名：換行不切字）", (await pickNow()) === "my_eyes" && !(await npS(p)).cut && strip((await npS(p)).name) === "看著我的眼睛說", JSON.stringify(await npS(p)));
    await np(".rc-np-next"); await sleep(250);
    ok("⏭：接著到紀念唱片第一張（彩虹島，跳過隨機）", (await pickNow()) === "r_rainbow" && (await bgm(p)) === "rainbow");
    for (let i = 0; i < 5; i++) { await np(".rc-np-prev"); await sleep(150); }
    ok("⏮ 五下：回到 SOYEON（我的歌第一首）", (await pickNow()) === "my_soyeon");
    await np(".rc-np-prev"); await sleep(250);
    ok("⏮：從第一張繞到最後一張（晚安）", (await pickNow()) === "r_night" && (await bgm(p)) === "night");
    await p.evaluate(() => { window.__zy.recSave.pick = "rand"; }); await sleep(700);
    n = await npS(p);
    ok("小島音樂＝🔀 隨機：播放器寫「隨機」", n.shown && strip(n.name) === "隨機", JSON.stringify(n));
    await np(".rc-np-next"); await sleep(250);
    ok("隨機時 ⏭：換成第一首（SOYEON）", (await pickNow()) === "my_soyeon");
    // 家長鎖：播放器不見；關鎖又出來（0.5 秒內）
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.querySelector("#bgmLockOpts .opt[data-v='1']").click(); document.getElementById("settingsClose").click(); }); await sleep(700);
    ok("家長鎖開著：播放器不見（小島放原本的）", !(await npS(p)).shown);
    await p.evaluate(() => { document.getElementById("settingsBtn").click(); document.querySelector("#bgmLockOpts .opt[data-v='0']").click(); document.getElementById("settingsClose").click(); }); await sleep(700);
    ok("關鎖：播放器又出來", (await npS(p)).shown);
    // 聽整首：中間 ⏹、⏮⏭ 換那張聽（不改小島音樂）
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_rainbow", 300); await click(p, ".rc-play"); await sleep(400);
    n = await npS(p);
    ok("聽整首（彩虹島）：播放器中間 ⏹、讀屏「聽整首」、封面圖", n.shown && n.mode === "np" && n.mid === "⏹" && strip(n.sub) === "聽整首" && await p.evaluate(() => document.querySelector("#recNow .rc-np-lab").classList.contains("rc-has-cover")), JSON.stringify(n));
    await np(".rc-np-next"); await sleep(300);
    ok("聽整首時 ⏭：改聽下一張（歸仁區）、小島音樂設定不變（SOYEON）", (await p.evaluate(() => window.__zy.recUI.debug.np && window.__zy.recUI.debug.np.id)) === "r_town" && (await bgm(p)) === "town" && (await pickNow()) === "my_soyeon" && strip((await npS(p)).name) === "歸仁區");
    await np(".rc-np-mid"); await sleep(400);
    n = await npS(p);
    ok("⏹：停聽整首、回小島音樂（SOYEON），播放器換回 ⏸", !(await p.evaluate(() => window.__zy.recUI.debug.np)) && (await bgm(p)) === "my:my_soyeon" && n.shown && n.mode === "pick" && n.mid === "⏸", JSON.stringify(n));
    await clearSpoken(p); await np(".rc-np-mid"); await sleep(400);
    ok("⏸：停掉唱片＝pick 清空、放原本的 island、播放器收起來、說「回小島放原本的音樂喔！」", (await pickNow()) === "" && (await bgm(p)) === "island" && !(await npS(p)).shown && (await spoken(p)).includes("回小島放原本的音樂喔！"));
    // prefers-reduced-motion：DJ 不點頭、唱片不轉、音波不跳
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_calm");
    const rm = await p.evaluate(() => ({ dj: getComputedStyle(document.querySelector(".rc-djfig")).animationName, vin: getComputedStyle(document.querySelector(".rc-rec.rc-mid .rc-vin")).animationName, spin: document.querySelector(".rc-rec.rc-mid").classList.contains("rc-spin"), wave: getComputedStyle(document.querySelector(".rc-wave i")).animationName }));
    ok("prefers-reduced-motion：DJ 不點頭、試聽中的唱片不轉、音波條不跳", rm.dj === "none" && rm.vin === "none" && rm.spin && rm.wave === "none", JSON.stringify(rm));
    ok("迷你播放器／封面：沒有錯誤、旁注音沒漏字", errs.length === 0 && (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, errs.join(" | ") + JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    await ctx.close();
  }
  // ===== 5. 3D 小島：唱片牆三個標籤截圖；聽整首時寵物真的在跳（hub.dance）、迷你播放器不擋按鈕（橫／直）、換島＝結束；小島音樂的播放器；截圖 =====
  for (const [w, h, t] of [[1180, 820, "L"], [1024, 768, "L4"], [820, 1180, "P"], [390, 844, "M"]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 45, query: "debug&novoice&night=0&weather=sunny" }); await covers(ctx);
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 40000 }).catch(() => {}); await sleep(600);
    await p.evaluate(() => window.__hub3d.events(false));
    await p.evaluate(() => window.__zy.openRecords()); await sleep(300);
    const t0 = await center(p, ".rc-title"); await p.mouse.click(t0.x, t0.y); await sleep(200);
    if (t === "L") for (const k of ["mine", "memo", "shop"]) {   // 唱片牆三個標籤（橫式）截圖
      await tabTo(p, k); await sleep(250); await p.evaluate(k => document.querySelectorAll(".rc-shop .rc-rec")[k === "mine" ? 3 : 1].click(), k); await sleep(1200);
      ok(`L 3D 小島霧化背景：「${k}」標籤唱片牆元素互不重疊、在畫面內`, wallOk(await p.evaluate(wallCheck)), JSON.stringify(await p.evaluate(wallCheck)));
      await p.screenshot({ path: path.join(SHOTS, `wall-${k}-${w}x${h}.png`) });
    }
    if (t === "P") { await pickRec(p, "my_jay", 1200); await p.screenshot({ path: path.join(SHOTS, `wall-mine-${w}x${h}.png`) }); }
    ok(`${t} ${w}×${h}：唱片牆背景是霧化的小島（backdrop-filter blur）`, await p.evaluate(() => /blur/.test(getComputedStyle(document.querySelector(".rc-shop")).backdropFilter || getComputedStyle(document.querySelector(".rc-shop")).webkitBackdropFilter || "")));
    await pickRec(p, "my_jay", 300); await p.waitForFunction(() => !window.__zyAudio.debug().loading, null, { timeout: 15000 }).catch(() => {});
    await click(p, ".rc-play"); await sleep(1200);
    const d = await p.evaluate(() => ({ dancing: window.__hub3d.dancing(), bgm: window.__zy.bgmNow(), wall: window.__zy.recUI.isOpen() }));
    ok(`${t} ${w}×${h}：聽整首＝唱片牆收起來、3D 小島上的寵物在跳（hub.dance 約 60 秒）`, !d.wall && d.bgm === "my:my_jay" && d.dancing > 50, JSON.stringify(d));
    let pc = await npS(p);
    ok(`${t} ${w}×${h}：聽整首的迷你播放器在畫面內、≥44px、鈕 ≥44px、歌名沒被切、不跟上方按鈕／狀態列／貓頭鷹重疊`, pc.shown && pc.inV && pc.h >= 44 && !pc.small && !pc.bo && !pc.cut && pc.hit.length === 0, JSON.stringify(pc));
    if (t === "L" || t === "P") await p.screenshot({ path: path.join(SHOTS, `island-player-np-${w}x${h}.png`) });
    await p.evaluate(() => document.querySelector("#recNow .rc-np-mid").click()); await sleep(600);
    ok(`${t}：按 ⏹＝寵物停下來、回原本的音樂`, (await p.evaluate(() => window.__hub3d.dancing())) === 0 && (await p.evaluate(() => window.__zy.bgmNow())) === "island");
    await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "my_eyes", 300); await click(p, ".rc-set"); await click(p, ".rc-x"); await sleep(900);
    pc = await npS(p);
    ok(`${t} ${w}×${h}：小島音樂＝看著我的眼睛說（最長歌名）：播放器 ⏸ 在畫面內、鈕 ≥44px、歌名換兩行沒被切、≤440×60（寧次 11-01）、不擋別的按鈕`, pc.shown && pc.mode === "pick" && pc.inV && !pc.small && !pc.bo && !pc.cut && pc.h <= 60 && pc.w <= 440 && pc.hit.length === 0, JSON.stringify(pc));
    if (t === "L" || t === "P") await p.screenshot({ path: path.join(SHOTS, `island-player-${w}x${h}.png`) });
    await p.evaluate(() => document.querySelector("#recNow .rc-np-mid").click()); await sleep(300);
    if (t === "L") {
      await p.evaluate(() => window.__zy.openRecords()); await sleep(200); await pickRec(p, "r_rainbow", 300); await click(p, ".rc-play"); await sleep(500);
      await p.evaluate(() => window.__hub3d.goPlace("music")); await sleep(1500);
      const g = await p.evaluate(() => ({ np: window.__zy.recUI.debug.np, bgm: window.__zy.bgmNow(), pill: document.getElementById("recNow").classList.contains("hidden") }));
      ok("聽整首放到一半換島（音樂島）：結束、放那座島的音樂（dress）、播放器收起來", !g.np && g.bgm === "dress" && g.pill, JSON.stringify(g));
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
