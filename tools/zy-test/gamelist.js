// 🗺️ 全部遊戲清單測試（10-12 阿葉：「打開後原本的關卡名字都不見了，這樣會不知道還有哪些關卡」）：node tools/zy-test/gamelist.js
// 驗：小島選單有 🗺️ 圓鈕（左上地點鈕那欄：橫式 🌈 下面、直式第三排；不跟其他按鈕打架）；點開＝全畫面清單，依「主島／歸仁區／彩虹島」分組、每張卡＝圖示＋名字（旁注音）＋星星或鎖；
//     點主島的卡＝清單關掉、鏡頭移到那棟、開它的介紹卡；點彩虹島的卡＝飛到彩虹島＋開介紹卡；還沒開的島（歸仁區 20 張時）：標題寫還差幾張、
//     點了晃一下＋貓頭鷹說上鎖台詞、不飛過去；右上角 ✕／點暗處關掉；橫式（iPad 4:3、1180×820、1873×1014）清單不用捲就看得完、直式可以捲；
//     卡片名字一行（短名字）；?no3d 沒有 🗺️；沒有錯誤、旁注音沒漏字
// 需要：專案根目錄開著 python -m http.server 8765（ZY_URL 可改）。截圖存到 ZY_SHOTS（預設 %TEMP%\zy-gamelist）。
const path = require("path"), fs = require("fs");
const { launch, openGame } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&night=0&weather=sunny";
const SHOTS = process.env.ZY_SHOTS || path.join(process.env.TEMP || ".", "zy-gamelist");
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + ".png") }).catch(() => {});
const ready = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 30000 }).then(() => sleep(800));
const listOn = p => p.evaluate(() => !document.getElementById("games").classList.contains("hidden"));
const pickOn = (p, m) => p.waitForFunction(m => { const b = document.getElementById("pick"); return !b.classList.contains("hidden") && b.dataset.mode === m && window.__hub3d.sel() === m; }, m, { timeout: 6000 }).then(() => true, () => false);
const center = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const openList = async p => { const c = await center(p, "#mapBtn"); await p.mouse.click(c.x, c.y); await sleep(500); };
const clickCard = async (p, m) => { const c = await center(p, `#gamesList .gl-card[data-mode=${m}]`); await p.mouse.click(c.x, c.y); };
// 清單的樣子：每組（島）的名字、鎖、卡片（模式、名字去掉注音、鎖、星星數）
const listInfo = p => p.evaluate(() => [...document.querySelectorAll("#gamesList .gl-group")].map(g => ({
  isle: g.dataset.isle, name: g.querySelector(".gl-hn").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), locked: g.classList.contains("locked"), lock: (g.querySelector(".gl-hl") || {}).textContent || "",
  cards: [...g.querySelectorAll(".gl-card")].map(c => ({ m: c.dataset.mode, name: c.querySelector(".gl-name").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), locked: c.classList.contains("locked"), stars: c.querySelectorAll(".pk-stars i").length, ico: c.querySelector(".gl-ico").textContent })) })));
// 清單在畫面內、不用捲（dialog 在畫面裡；清單內容不超過可視高度）
const fits = p => p.evaluate(() => { const d = document.querySelector("#games .dialog").getBoundingClientRect(), l = document.getElementById("gamesList");
  return { inV: d.left >= 0 && d.top >= 0 && d.right <= innerWidth && d.bottom <= innerHeight, scroll: l.scrollHeight - l.clientHeight, d: [d.left, d.top, d.right, d.bottom].map(Math.round) }; });

(async () => {
  const browser = await launch();
  // ===== 1. 橫式 1180×820、20 張貼紙（彩虹島開了、歸仁區還沒開）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, stars: 25, eggs: 2, query: Q });
    await ready(p); await p.evaluate(() => { window.__hub3d.events(false); window.__zyB.best.fish = 3; window.__zyB.best.order = 1; }); await sleep(300);
    const mb = await p.evaluate(() => { const b = document.getElementById("mapBtn"), r = b.getBoundingClientRect(), s = getComputedStyle(b), rb = document.getElementById("rainbowBtn").getBoundingClientRect(); return { parent: b.parentNode.id, shown: s.display !== "none" && s.visibility !== "hidden", r: [r.left, r.top, r.right, r.bottom].map(Math.round), rb: Math.round(rb.bottom), rbl: Math.round(rb.left) }; });
    ok("橫式：🗺️ 圓鈕在左邊那欄 🌈 下面（跟地點鈕一起）、看得到", mb.parent === "hudL" && mb.shown && Math.abs(mb.r[0] - mb.rbl) <= 1 && mb.r[1] > mb.rb, JSON.stringify(mb));
    await openList(p);
    ok("點 🗺️ → 打開全部遊戲清單", await listOn(p));
    const L = await listInfo(p);
    ok("清單分三組：主島、歸仁區、彩虹島（照這個順序）", L.map(g => g.isle).join() === "main,town,rainbow" && L.map(g => g.name).join() === "主島,歸仁區,彩虹島", JSON.stringify(L.map(g => [g.isle, g.name])));
    const main = L[0], town = L[1], rb = L[2];
    ok("主島：11 張卡（9 個遊戲＋10-13 挑戰燈塔＋扭蛋機），釣魚排第一、燈塔在扭蛋機前、扭蛋機排最後", main.cards.length === 11 && main.cards[0].m === "fish" && main.cards[9].m === "tower" && main.cards[10].m === "gacha", JSON.stringify(main.cards.map(c => c.m)));
    ok("主島：卡片寫短名字（≤ 3 個字一行放得下：打地鼠、跳跳蛙、泡泡、氣球、扭蛋機…）", ["打地鼠", "跳跳蛙", "泡泡", "氣球", "扭蛋機"].every(n => main.cards.some(c => c.name === n)) && main.cards.every(c => c.name.length <= 3), JSON.stringify(main.cards.map(c => c.name)));
    const oneLine = await p.evaluate(() => [...document.querySelectorAll("#gamesList .gl-name")].filter(e => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).fontSize) * 2).map(e => e.parentNode.dataset.mode));
    ok("清單卡片的名字都一行（沒有斷行）", oneLine.length === 0, oneLine.join(","));
    ok("主島（20 張）：青蛙、泡泡、燈塔鎖著（🔒），其他沒鎖、有星星（3 格）", main.cards.filter(c => c.locked).map(c => c.m).sort().join() === "bubble,frog,tower" && main.cards.filter(c => !c.locked && c.m !== "gacha").every(c => c.stars === 3), JSON.stringify(main.cards));
    const st = await p.evaluate(() => ({ fish: document.querySelectorAll('#gamesList .gl-card[data-mode=fish] .pk-stars i.on').length, order: document.querySelectorAll('#gamesList .gl-card[data-mode=order] .pk-stars i.on').length, gacha: document.querySelector('#gamesList .gl-card[data-mode=gacha] .gl-meta').textContent }));
    ok("星星＝最佳成績（釣魚 3 顆、點餐 1 顆）、扭蛋機顯示扭蛋幣", st.fish === 3 && st.order === 1 && st.gacha.includes("🪙"), JSON.stringify(st));
    ok("歸仁區（20 張 < 30）：整組鎖著、標題寫「🔒 30」（要 30 張貼紙）、陀螺卡有 🔒", town.locked && town.lock === "🔒 30" && town.cards.length === 1 && town.cards[0].m === "tops" && town.cards[0].locked, JSON.stringify(town));
    const hd = await p.evaluate(() => [...document.querySelectorAll("#gamesList .gl-head")].map(h => { const a = h.getBoundingClientRect(), g = h.parentNode.getBoundingClientRect(); return { isle: h.parentNode.dataset.isle, inside: a.right <= g.right + 1, h: Math.round(a.height), max: Math.round(Math.min(innerWidth, innerHeight) * 0.09) }; }));
    ok("每組標題都在自己那欄裡、一行（沒有擠到隔壁）", hd.every(x => x.inside && x.h < x.max), JSON.stringify(hd));
    ok("彩虹島（20 張）：開了、配送站／偵探／服裝店三張", !rb.locked && rb.cards.map(c => c.m).join() === "deliver,detective,dress" && rb.cards.every(c => !c.locked), JSON.stringify(rb));
    const fl = await fits(p);
    ok("1180×820：清單在畫面內、不用捲", fl.inV && fl.scroll <= 2, JSON.stringify(fl));
    await shot(p, "gamelist-1180x820");
    ok("清單開著：3D 小島的介紹卡收著", await p.evaluate(() => document.getElementById("pick").classList.contains("hidden")));
    // 點主島的打地鼠 → 清單關掉、介紹卡、鏡頭把地鼠放在卡片上面
    await p.evaluate(() => { window.__spoken = []; });
    await clickCard(p, "whack");
    const on1 = await pickOn(p, "whack"); await sleep(1500);
    const v1 = await p.evaluate(() => { const c = document.getElementById("pick").getBoundingClientRect(), s = window.__hub3d.screenOf("whack"), t = window.__hub3d.tagRect("whack");
      return { list: !document.getElementById("games").classList.contains("hidden"), place: window.__hub3d.place(), top: Math.round(c.top), b: [Math.round(s.x), Math.round(s.y)], tag: [Math.round(t.x0), Math.round(t.y0), Math.round(t.x1), Math.round(t.y1)], spoken: window.__spoken.map(x => x.text) }; });
    ok("清單點「打地鼠」→ 清單關掉、開打地鼠的介紹卡、貓頭鷹唸「打地鼠！」", on1 && !v1.list && v1.place === "main" && v1.spoken.includes("打地鼠！"), JSON.stringify(v1));
    ok("清單點「打地鼠」→ 鏡頭把地鼠移到卡片上面（建築、浮標都在畫面內）", v1.b[1] < v1.top && v1.tag[3] < v1.top && v1.tag[1] > 0 && v1.tag[0] >= 0 && v1.tag[2] <= 1180, JSON.stringify(v1));
    await p.evaluate(() => document.getElementById("pkGo").click());
    ok("介紹卡按「開始玩」→ 進打地鼠", await p.waitForFunction(() => window.__zy.mode === "whack", null, { timeout: 8000 }).then(() => true, () => false));
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(1200);
    // 點彩虹島的配送站 → 飛到彩虹島、開配送站的介紹卡
    await openList(p); await clickCard(p, "deliver");
    const on2 = await pickOn(p, "deliver"); await sleep(2800);
    const v2 = await p.evaluate(() => { const c = document.getElementById("pick").getBoundingClientRect(), s = window.__hub3d.screenOf("deliver"), t = window.__hub3d.tagRect("deliver");
      return { place: window.__hub3d.place(), name: document.getElementById("pkName").textContent, top: Math.round(c.top), b: [Math.round(s.x), Math.round(s.y)], tag: [Math.round(t.x0), Math.round(t.y0), Math.round(t.x1), Math.round(t.y1)], btn: document.querySelector("#rainbowBtn .nav-ico").textContent }; });
    ok("清單點「彩虹配送站」→ 飛到彩虹島、開配送站的介紹卡（🌈 鈕變 🏝️）", on2 && v2.place === "rainbow" && v2.name === "彩虹配送站" && v2.btn === "🏝️", JSON.stringify(v2));
    ok("飛到彩虹島後：配送站（建築＋浮標）在卡片上面、畫面內", v2.b[1] < v2.top && v2.tag[3] < v2.top && v2.tag[1] > 0 && v2.tag[0] >= 0 && v2.tag[2] <= 1180 && v2.b[0] > 0 && v2.b[0] < 1180, JSON.stringify(v2));
    await shot(p, "gamelist-to-rainbow-1180x820");
    // 在彩虹島開清單點主島的釣魚 → 飛回主島＋釣魚的卡
    await openList(p); await clickCard(p, "fish");
    const on3 = await pickOn(p, "fish"); await sleep(2800);
    ok("在彩虹島點清單的「釣魚」→ 飛回主島、開釣魚的介紹卡", on3 && (await p.evaluate(() => window.__hub3d.place())) === "main");
    // 還沒開的歸仁區：點陀螺 → 晃一下、說上鎖台詞、清單還開著、不飛過去
    await openList(p); await p.evaluate(() => { window.__spoken = []; });
    await clickCard(p, "tops"); await sleep(600);
    const v4 = await p.evaluate(() => ({ list: !document.getElementById("games").classList.contains("hidden"), shake: document.querySelector('#gamesList .gl-card[data-mode=tops]').classList.contains("shake"), place: window.__hub3d.place(), spoken: window.__spoken.map(x => x.text), sel: window.__hub3d.sel() }));
    ok("歸仁區還沒開：點陀螺卡 → 晃一下、貓頭鷹說「收集更多貼紙，就能蓋好囉！」、清單還開著、沒飛過去", v4.list && v4.shake && v4.place === "main" && v4.spoken.includes("收集更多貼紙，就能蓋好囉！") && !v4.sel, JSON.stringify(v4));
    // 鎖著的遊戲（島開了）：點了照樣飛過去開介紹卡（卡片寫還差幾張）
    await clickCard(p, "frog");
    const on5 = await pickOn(p, "frog"); await sleep(600);
    ok("點鎖著的青蛙卡 → 開青蛙的介紹卡（寫還差 5 張、沒有開始鈕）", on5 && await p.evaluate(() => document.getElementById("pkLock").textContent.includes("再收集 5 張貼紙") && getComputedStyle(document.getElementById("pkGo")).display === "none"));
    await p.evaluate(() => document.getElementById("pkClose").click()); await sleep(300);
    // 「回去」／點暗處關掉
    await openList(p); const gc = await p.evaluate(() => { const r = document.getElementById("gamesClose").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }); await p.mouse.click(gc.x, gc.y); await sleep(300);
    ok("按右上角 ✕（≥ 44px）→ 清單關掉", !(await listOn(p)) && gc.w >= 44, JSON.stringify(gc));
    await openList(p); await p.mouse.click(6, 410); await sleep(300);
    ok("點清單外面的暗處 → 清單關掉", !(await listOn(p)));
    ok("旁注音沒漏字", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    ok("橫式：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 其他畫面大小：🗺️ 位置、清單不用捲、點卡片照樣能用 =====
  for (const [w, h, st] of [[1024, 768, 40], [768, 1024, 40], [1873, 1014, 64], [390, 844, 40]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: st, stars: 25, query: Q });
    await ready(p); await p.evaluate(() => window.__hub3d.events(false));
    const mb = await p.evaluate(() => { const b = document.getElementById("mapBtn"), r = b.getBoundingClientRect(), ids = ["hudLBtn", "hudRBtn", "townBtn", "townTag", "rainbowBtn", "rainbowTag", "homeBtn", "musicBtn", "playerBtn", "playerTag", "settingsBtn", "plazaBtn", "resumeBtn"];
      const hit = ids.filter(id => { const e = document.getElementById(id); if (!e || getComputedStyle(e).display === "none") return false; const q = e.getBoundingClientRect(); return q.width && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top; });
      const pills = document.querySelector("#menu > .menu-bottom").getBoundingClientRect(); if (r.left < pills.right && r.right > pills.left && r.top < pills.bottom && r.bottom > pills.top) hit.push("膠囊");
      return { parent: b.parentNode.id, r: [r.left, r.top, r.right, r.bottom].map(Math.round), hit, inV: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, size: Math.round(r.width) }; });
    ok(`${w}×${h}：🗺️ 在畫面內、≥ 44px、不跟其他按鈕／膠囊重疊（${w < h ? "直式在左上第三排" : "橫式在 🌈 下面"}）`, mb.inV && mb.size >= 44 && mb.hit.length === 0 && mb.parent === "hudL", JSON.stringify(mb));
    await openList(p);
    const fl = await fits(p), L = await listInfo(p);
    ok(`${w}×${h}：清單在畫面內${w < h ? "（直式可以上下捲）" : "、不用捲"}、三組都在（${st} 張）`, fl.inV && (w < h || fl.scroll <= 2) && L.length === 3, JSON.stringify({ fl, groups: L.map(g => g.isle + (g.locked ? "🔒" : "")) }));
    if (w !== 390) await shot(p, `gamelist-${w}x${h}`);
    await clickCard(p, "build");
    ok(`${w}×${h}：點「積木」→ 積木的介紹卡`, await pickOn(p, "build"));
    await sleep(1500);
    const v = await p.evaluate(() => { const c = document.getElementById("pick").getBoundingClientRect(), t = window.__hub3d.tagRect("build"); return { top: Math.round(c.top), tag: [Math.round(t.x0), Math.round(t.y0), Math.round(t.x1), Math.round(t.y1)], card: [c.left, c.right, c.bottom].map(Math.round) }; });
    ok(`${w}×${h}：介紹卡在畫面內、積木的浮標在卡片上面`, v.tag[3] < v.top && v.tag[1] > 0 && v.card[0] >= 0 && v.card[1] <= w && v.card[2] <= h, JSON.stringify(v));
    if (w !== 390) await shot(p, `pick-${w}x${h}`);
    ok(`${w}×${h}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 3. ?no3d：卡片選單本來就是清單 → 沒有 🗺️ =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "debug&novoice&no3d" });
    ok("?no3d：沒有 🗺️（卡片選單本來就是清單）", await p.evaluate(() => getComputedStyle(document.getElementById("mapBtn")).display === "none"));
    ok("?no3d：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS (${out.length})`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
