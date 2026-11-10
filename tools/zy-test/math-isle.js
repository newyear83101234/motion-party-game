// 數學島測試（11-10 v10，docs/zhuyin-math-plan.md §1、§5）：node tools/zy-test/math-isle.js
// 驗：新存檔（0 張貼紙）數學島一開始就開——🧭 地點面板「數學島」沒有鎖、🗺️ games() 有水果攤／荷花池兩棟、open.math＝true、need.math＝0；
//     路網：整張連通、數學島沒有斷頭路、兩棟門口接到路、從主島中央圓環走得到兩棟門口（maRoute）、車子不會開上數學島的步道；
//     點 🧭 的「數學島」＝飛過去（鏡頭停住、太陽跟過去、兩棟在畫面中間一帶、只顯示數學島的兩個浮標、貓頭鷹說「這裡是數學島！我們來算算看！」）；
//     點水果攤／荷花池（3D 建築）＝開那棟的介紹卡，按「開始玩」或再點一下＝點到對的隱藏卡片 .mode-card[data-mode=fruit／hop]
//     （這裡用 window capture 的 click 監聽記下來並擋住，不真的進遊戲：遊戲本身在 math-game.js 測）；
//     主島橋頭路牌（🔢）點了也飛過去、數學島橋頭「回小島」路牌點了飛回主島；
//     三種尺寸（1180×820、820×1180、390×844）：兩個浮標在畫面內、沒被介面擋到、不互相重疊、不蓋到另一棟建築；截圖存 ZY_SHOTS（預設 %TEMP%\zy-math-isle）；
//     沒有錯誤（遊戲模組 js/css 還沒放上來時的 404 不算：只要 404 的全是 zhuyin-fruit／zhuyin-hop 那幾個檔）
// 需要：專案根目錄開著 python -m http.server 8765（ZY_URL 可改）。測試瀏覽器已靜音（lib.js --mute-audio）
const path = require("path"), fs = require("fs");
const { launch, openGame, goIsle } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&night=0&weather=sunny";
const SHOTS = process.env.ZY_SHOTS || path.join(process.env.TEMP || ".", "zy-math-isle");
fs.mkdirSync(SHOTS, { recursive: true });
const ready = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 40000 }).then(() => sleep(800));
const info = p => p.evaluate(() => window.__hub3d.math());
const strip = s => (s || "").replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "");
const guide = p => p.evaluate(() => document.getElementById("guideText").textContent).then(strip);
const LINE = "這裡是數學島！我們來算算看！";
// 找一個「點下去會點到這棟、上面沒有浮標或按鈕擋著」的螢幕座標（同 rainbow.js）
const spot = (p, m) => p.evaluate(m => {
  const h = window.__hub3d, c = h.screenOf(m);
  for (let r = 0; r <= 90; r += 6) for (let a = 0; a < 360; a += r ? 30 : 360) {
    const x = c.x + Math.cos(a * Math.PI / 180) * r, y = c.y + Math.sin(a * Math.PI / 180) * r, e = document.elementFromPoint(x, y);
    if (x > 2 && y > 2 && x < innerWidth - 2 && y < innerHeight - 2 && e && e.tagName === "CANVAS" && h.hitAt(x, y) === m) return { x, y };
  }
  return null;
}, m);
const pickOn = (p, m) => p.waitForFunction(m => { const b = document.getElementById("pick"); return !b.classList.contains("hidden") && b.dataset.mode === m && window.__hub3d.sel() === m; }, m, { timeout: 5000 }).then(() => true, () => false);
const tap3d = async (p, m) => { for (let k = 0; k < 3; k++) { const s = await spot(p, m); if (s) { await p.mouse.click(s.x, s.y); return s; } await sleep(500); } return null; };
const toMath = async p => { await goIsle(p, "math"); await sleep(3800); };
// 隱藏卡片被點了幾下（capture：在卡片自己的 click 之前就攔下來、記下來、不讓遊戲真的開始）
const armCards = p => p.evaluate(() => { window.__mathCard = []; if (window.__mathArmed) return; window.__mathArmed = true;
  window.addEventListener("click", e => { const c = e.target && e.target.closest && e.target.closest(".mode-card[data-mode=fruit], .mode-card[data-mode=hop]"); if (!c) return; window.__mathCard.push(c.dataset.mode); e.stopPropagation(); e.preventDefault(); }, true); });
const cards = p => p.evaluate(() => window.__mathCard.slice());
// 浮標檢查：數學島兩個浮標在畫面內、沒被介面擋到、彼此不重疊、不蓋到另一棟（浮標範圍裡 3D 點到的不能是另一棟）、建築本體那一點沒被浮標蓋住
const tagCheck = p => p.evaluate(() => {
  const h = window.__hub3d, ob = ["#menu > .menu-bottom", "#guide img", "#guideText", "#navBtn", "#mapBtn", "#statusBar", "#hudRBtn"].map(s => document.querySelector(s)).filter(e => e && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden").map(e => e.getBoundingClientRect());
  const tg = {}, bad = [];
  for (const m of ["fruit", "hop"]) { const t = document.querySelector(`.hub-tag[data-mode=${m}]`), r = t.getBoundingClientRect(); tg[m] = { t, r, open: t.classList.contains("open") }; }
  for (const [m, { r }] of Object.entries(tg)) {
    if (!r.width || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) bad.push(m + "(畫面外)");
    if (ob.some(o => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top)) bad.push(m + "(被介面擋到)");
    const other = m === "fruit" ? "hop" : "fruit";
    for (let i = 1; i < 6; i++) for (let j = 1; j < 4; j++) { const x = r.left + r.width * i / 6, y = r.top + r.height * j / 4; if (h.hitAt(x, y) === other) { bad.push(m + "(蓋到" + other + ")"); i = j = 9; } }
    const b = h.screenOf(m), e = document.elementFromPoint(b.x, b.y); if (!e || e.tagName !== "CANVAS") bad.push(m + "(本體被" + (e ? e.className || e.id || e.tagName : "?") + "蓋住)");
  }
  const a = tg.fruit.r, c = tg.hop.r; if (a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top) bad.push("兩個浮標重疊");
  return { bad, rect: Object.fromEntries(Object.entries(tg).map(([m, { r, open }]) => [m, [r.left, r.top, r.right, r.bottom].map(Math.round).concat(open ? ["開"] : [])])) };
});
// 錯誤：遊戲模組還沒放上來（js/zhuyin-fruit.js、css/zhuyin-fruit.css、hop 同）的 404 不算；其他一律算
const realErrs = async (p, errs) => {
  const urls = await p.evaluate(() => performance.getEntriesByType("resource").filter(e => e.responseStatus >= 400).map(e => e.name));
  const onlyMods = urls.every(u => /zhuyin-(fruit|hop)\.(js|css)/.test(u));
  return errs.filter(e => !((onlyMods && /Failed to load resource: the server responded with a status of 404/.test(e)) || /zhuyin-(fruit|hop)\.(js|css)/.test(e)));
};

(async () => {
  const browser = await launch();
  // ===== 1. 新存檔（0 張貼紙）1180×820：一開始就開、路網、飛過去、點兩棟、路牌 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 0, query: Q });
    await ready(p); await p.evaluate(() => window.__hub3d.events(false));
    const G = await p.evaluate(() => window.__zy.hub.games());
    const ml = G.list.filter(x => x.isle === "math");
    ok("games()：數學島有水果攤、荷花池兩棟，都沒鎖；open.math＝true、need.math＝0", ml.map(x => x.mode).sort().join() === "fruit,hop" && ml.every(x => !x.locked) && G.open.math === true && G.need.math === 0, JSON.stringify({ ml, open: G.open, need: G.need }));
    const row = await p.evaluate(() => { const r = document.querySelector("#navPanel .nav-row[data-isle=math]"); return r ? { name: r.querySelector(".nav-rn").textContent, st: r.querySelector(".nav-rs").textContent, locked: r.classList.contains("locked") } : null; });
    ok("🧭 地點面板有「數學島」、0 張貼紙也沒有鎖", !!row && strip(row.name) === "數學島" && !row.locked && !row.st.includes("🔒"), JSON.stringify(row));
    const g = await p.evaluate(() => window.__hub3d.graph()), mi = await info(p), rt = await p.evaluate(() => window.__hub3d.maRoute());
    ok("路網全部連通（含數字積木橋、數學島）", g.components === 1, JSON.stringify(g));
    ok("數學島：兩棟蓋好、門口都接到路、沒有斷頭路、不鎖", mi.defs.every(Boolean) && mi.doors.every(Boolean) && mi.deadEnds.length === 0 && mi.locked.length === 0 && mi.nodes > 10, JSON.stringify(mi));
    ok("從主島中央圓環走得到水果攤、荷花池的門口", rt.every(n => n > 0), JSON.stringify(rt));
    ok("在主島：數學島的浮標藏著、動畫不跑", await p.evaluate(() => [...document.querySelectorAll(".hub-tag.ma")].length === 2 && [...document.querySelectorAll(".hub-tag.ma")].every(t => getComputedStyle(t).display === "none")) && !mi.active);
    const sg = await p.evaluate(() => window.__hub3d.signs().filter(s => s.go === "math" || s.at === "math"));
    ok("主島東邊橋頭有往數學島的路牌（沒鎖、看得到）、數學島橋頭有「回小島」", sg.some(s => s.at === "main" && s.go === "math" && s.shown && !s.locked) && sg.some(s => s.at === "math" && s.go === "main"), JSON.stringify(sg));
    // 🧭 點「數學島」→ 飛過去
    await p.evaluate(() => { window.__spoken = []; });
    await toMath(p);
    const a0 = await info(p); await sleep(400); const a1 = await info(p);
    const cam = await p.evaluate(() => ({ f: window.__hub3d.screenOf("fruit"), h: window.__hub3d.screenOf("hop"), W: innerWidth, H: innerHeight }));
    const inMid = q => q.x > cam.W * 0.1 && q.x < cam.W * 0.9 && q.y > cam.H * 0.12 && q.y < cam.H * 0.88;
    ok("🧭 點數學島 → 飛到數學島：鏡頭停住、兩棟都在畫面中間一帶、動畫在跑", a1.place === "math" && Math.hypot(a1.off[0] - a0.off[0], a1.off[1] - a0.off[1]) < 0.05 && inMid(cam.f) && inMid(cam.h) && a1.active, JSON.stringify({ a1, cam }));
    ok("太陽（陰影範圍）跟過去", Math.hypot(a1.sun[0] - 19.4, a1.sun[1] + 1.1) < 1.5, JSON.stringify(a1.sun));
    ok(`貓頭鷹說「${LINE}」`, (await guide(p)).includes(LINE), await guide(p));
    const here = await p.evaluate(() => { const r = document.querySelector("#navPanel .nav-row[data-isle=math]"); return { here: r.classList.contains("here"), st: r.querySelector(".nav-rs").textContent }; });
    ok("面板裡數學島那一行變「你在這裡」", here.here && strip(here.st) === "你在這裡", JSON.stringify(here));
    const vis = await p.evaluate(() => ({ ma: [...document.querySelectorAll(".hub-tag.ma")].map(t => getComputedStyle(t).display !== "none" && getComputedStyle(t).visibility !== "hidden"),
      main: [...document.querySelectorAll(".hub-tag:not(.civic):not(.rb):not(.mu):not(.ma)")].every(t => getComputedStyle(t).visibility === "hidden" || getComputedStyle(t).display === "none"),
      other: [...document.querySelectorAll(".hub-tag.rb, .hub-tag.mu, .hub-tag.civic")].every(t => getComputedStyle(t).display === "none"),
      icons: [...document.querySelectorAll(".hub-tag.ma")].map(t => t.dataset.mode + ":" + t.querySelector(".ht-ico").textContent),
      words: [...document.querySelectorAll(".hub-tag.ma")].map(t => t.dataset.mode + ":" + t.querySelector(".ht-word").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")) }));
    ok("在數學島：只顯示數學島的兩個浮標（🍎 水果攤、🐸 荷花池）", vis.ma.length === 2 && vis.ma.every(Boolean) && vis.main && vis.other && vis.icons.join() === "fruit:🍎,hop:🐸" && vis.words.join() === "fruit:水果攤,hop:荷花池", JSON.stringify(vis));
    let tc = await tagCheck(p);
    ok("1180×820：兩個浮標在畫面內、沒被介面擋到、不重疊、不蓋到另一棟", tc.bad.length === 0, JSON.stringify(tc));
    await p.screenshot({ path: path.join(SHOTS, "math-1180x820.png") });
    // 點水果攤（3D）一下＝介紹卡；按「開始玩」＝點 fruit 隱藏卡
    await armCards(p);
    const s1 = await tap3d(p, "fruit");
    const on1 = await pickOn(p, "fruit"), nm1 = strip(await p.evaluate(() => document.getElementById("pkName").textContent));
    ok("點水果攤一下 → 水果攤的介紹卡（水果籃算算看），還沒點卡片", !!s1 && on1 && nm1 === "水果籃算算看" && (await cards(p)).length === 0, JSON.stringify({ s1, nm1, c: await cards(p) }));
    await sleep(600); await p.evaluate(() => document.getElementById("pkGo").click()); await sleep(900);
    ok("介紹卡按「開始玩」→ 點到 .mode-card[data-mode=fruit]（只點一次）", JSON.stringify(await cards(p)) === '["fruit"]', JSON.stringify(await cards(p)));
    // 點荷花池（3D）兩下＝第二下開始（點到 hop 隱藏卡）
    if ((await info(p)).place !== "math") await toMath(p);
    await armCards(p);
    const s2 = await tap3d(p, "hop");
    const on2 = await pickOn(p, "hop"), nm2 = strip(await p.evaluate(() => document.getElementById("pkName").textContent));
    ok("點荷花池一下 → 荷花池的介紹卡（青蛙跳荷葉）", !!s2 && on2 && nm2 === "青蛙跳荷葉" && (await cards(p)).length === 0, JSON.stringify({ s2, nm2 }));
    await sleep(900); const s3 = await tap3d(p, "hop"); await sleep(900);
    ok("再點荷花池一下 → 點到 .mode-card[data-mode=hop]", !!s3 && JSON.stringify(await cards(p)) === '["hop"]', JSON.stringify({ s3, c: await cards(p) }));
    // 浮標也點得到：點水果攤浮標＝介紹卡
    await armCards(p); if ((await info(p)).place !== "math") await toMath(p);
    const r = await p.evaluate(() => window.__hub3d.tagRect("fruit")); await p.mouse.click((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    ok("點水果攤浮標 → 水果攤的介紹卡", await pickOn(p, "fruit"));
    await p.evaluate(() => document.getElementById("pkClose").click()); await sleep(1800);   // 收卡後鏡頭慢慢回到原位（路牌浮標跟著移）、點擊冷卻過了再點
    // 數學島橋頭「回小島」路牌 → 回主島；主島橋頭往數學島的路牌 → 飛回數學島
    const signAt = (at, go) => p.evaluate(([at, go]) => { const s = window.__hub3d.signs().find(q => q.at === at && q.go === go); if (!s || !s.shown) return null;
      const x = (s.rect.x0 + s.rect.x1) / 2, y = (s.rect.y0 + s.rect.y1) / 2, e = document.elementFromPoint(x, y); return { x, y, top: e ? (e.closest(".hub-sign") ? "sign" : e.id || e.className || e.tagName) : null }; }, [at, go]);
    const back = await signAt("math", "main");
    if (back) { await p.mouse.click(back.x, back.y); await sleep(3800); }
    const b1 = await info(p);
    ok("數學島橋頭「回小島」路牌（看得到、沒被擋）→ 回主島、鏡頭回原位", !!back && back.top === "sign" && b1.place === "main" && Math.hypot(...b1.off) < 0.05, JSON.stringify({ back, b1 }));
    await sleep(3300);
    ok("回主島 3 秒後數學島動畫停", !(await info(p)).active);
    if ((await info(p)).place !== "main") { await goIsle(p, "main"); await sleep(4200); }
    await p.evaluate(() => { document.getElementById("guideText").textContent = ""; });
    const go = await signAt("main", "math");
    if (go) { await p.mouse.click(go.x, go.y); await sleep(3800); }
    ok("主島東邊橋頭的 🔢 路牌（沒被擋）→ 飛到數學島", !!go && go.top === "sign" && (await info(p)).place === "math", JSON.stringify(go));
    const isl = await p.evaluate(() => { const h = window.__hub3d, c = h.maScreen("bridge"); return { bridge: h.hitAt(c.x, c.y) }; });
    ok("在數學島點數字積木橋＝往主島（isle:main）", isl.bridge === "isle:main", JSON.stringify(isl));
    ok("車子沒有開上數學島的步道", (await info(p)).carsOnMath === 0);
    const zm = await p.evaluate(() => [...(window.__zy.zMissing || [])]);
    if (zm.length) out.push("NOTE  旁注音漏字（新字串要跑 tools/build_zhuyin_ui.py，主對話做）：" + JSON.stringify(zm));
    const e1 = await realErrs(p, errs);
    ok("沒有錯誤（1180×820）", e1.length === 0, e1.join(" | "));
    await ctx.close();
  }
  // ===== 2. 直式 820×1180、手機 390×844：飛過去、浮標不被擋、點得到 =====
  for (const [w, h] of [[820, 1180], [390, 844]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 0, query: Q });
    await ready(p); await p.evaluate(() => window.__hub3d.events(false));
    await toMath(p);
    const mi = await info(p);
    ok(`${w}×${h}：🧭 點數學島 → 飛到數學島`, mi.place === "math", JSON.stringify(mi));
    const tc = await tagCheck(p);
    ok(`${w}×${h}：兩個浮標在畫面內、沒被介面擋到、不重疊、不蓋到另一棟`, tc.bad.length === 0, JSON.stringify(tc));
    await p.screenshot({ path: path.join(SHOTS, `math-${w}x${h}.png`) });
    await armCards(p);
    const s = await tap3d(p, "fruit");
    ok(`${w}×${h}：點得到水果攤（開介紹卡）`, !!s && await pickOn(p, "fruit"), JSON.stringify(s));
    await p.evaluate(() => document.getElementById("pkClose").click()); await sleep(500);
    const s2 = await tap3d(p, "hop");
    ok(`${w}×${h}：點得到荷花池（開介紹卡）`, !!s2 && await pickOn(p, "hop"), JSON.stringify(s2));
    const e2 = await realErrs(p, errs);
    ok(`${w}×${h}：沒有錯誤`, e2.length === 0, e2.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  console.log(`截圖：${SHOTS}`);
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS (${out.filter(l => l.startsWith("PASS")).length})`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
