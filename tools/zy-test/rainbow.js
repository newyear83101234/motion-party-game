// 彩虹島測試（10-12）：node tools/zy-test/rainbow.js
// 驗：貼紙 <20 拱橋中間沉著＋路障、點 🌈 飛過去貓頭鷹說還差幾張、點配送站／服裝店／橋都說上鎖、不會進遊戲；
//     換成 20 張的存檔位＝橋升起來＋貓頭鷹宣告＋🌈 鈕 NEW；
//     貼紙夠：彩虹島路網連通（每棟都接到路、沒有斷頭路）、鏡頭飛到位（島在畫面中間、只顯示彩虹島的浮標）、
//     點配送站（3D／浮標）＝點 .mode-card[data-mode=deliver] → 進配送站（🏠 回小島不留「繼續玩」；完整流程在 deliver-game.js）、
//     點服裝店＝onDress（打開換裝畫面，穿好了回彩虹島）、點居民唸名字、三個地點鈕切換（人在哪座島那顆變 🏝️ 回小島）、
//     直式浮標不被介面擋到、?no3d 卡片選單看得到配送站卡而且不超出畫面、沒有錯誤、旁注音沒漏字；
//     浮標精簡（10-12）：平常收成圓形圖示（10-12 晚起沒有「新」）；直式／4:3 收合、一棟一棟展開都不被擋；
//     介紹卡（10-12）：點一下建築／浮標＝介紹卡，再點一下（或按開始玩）才進去——下面「點兩下」都是這個意思
const { launch, openGame } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = "debug&novoice&night=0&weather=sunny";
const ready = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 30000 }).then(() => sleep(800));
const rbInfo = p => p.evaluate(() => window.__hub3d.rainbow());
const guide = p => p.evaluate(() => document.getElementById("guideText").textContent);
const btns = p => p.evaluate(() => ({ town: document.querySelector("#townBtn .nav-ico").textContent + document.querySelector("#townTag .nav-word").textContent, rb: document.querySelector("#rainbowBtn .nav-ico").textContent + document.querySelector("#rainbowTag .nav-word").textContent, place: window.__hub3d.rainbow().place }));
const click = (p, id) => p.evaluate(id => document.getElementById(id).click(), id);
// 找一個「點下去會點到這棟、上面沒有浮標或按鈕擋著」的螢幕座標
const spot = (p, m) => p.evaluate(m => {
  const h = window.__hub3d, c = h.screenOf(m);
  for (let r = 0; r <= 90; r += 6) for (let a = 0; a < 360; a += r ? 30 : 360) {
    const x = c.x + Math.cos(a * Math.PI / 180) * r, y = c.y + Math.sin(a * Math.PI / 180) * r, e = document.elementFromPoint(x, y);
    if (e && e.tagName === "CANVAS" && h.hitAt(x, y) === m) return { x, y };
  }
  return null;
}, m);
// 浮標展開完（0.2 秒拉開；headless 軟體繪圖一格可能 0.2 秒以上）再多等兩三格讓位置跟上
const opened = (p, m) => p.waitForFunction(m => { const t = document.querySelector(`.hub-tag[data-mode=${m}]`); return t.classList.contains("open") && t.querySelector(".ht-more").getBoundingClientRect().width >= t.querySelector(".ht-txt").getBoundingClientRect().width - 1; }, m, { timeout: 5000 }).catch(() => {}).then(() => sleep(400));
const tap3d = async (p, m) => { for (let k = 0; k < 3; k++) { const s = await spot(p, m); if (s) { await p.mouse.click(s.x, s.y); return s; } await sleep(500); } return null; };
// 介紹卡（10-12）：點一下＝開卡（pickOn），點兩下＝第二下才算「開始」
const pickOn = (p, m) => p.waitForFunction(m => { const b = document.getElementById("pick"); return !b.classList.contains("hidden") && b.dataset.mode === m && window.__hub3d.sel() === m; }, m, { timeout: 5000 }).then(() => true, () => false);
const tap3d2 = async (p, m) => { for (let k = 0; k < 3; k++) { const s = await spot(p, m); if (!s) { await sleep(500); continue; }
  await p.mouse.click(s.x, s.y); if (!(await pickOn(p, m))) continue; await sleep(900); const s2 = await spot(p, m); if (!s2) continue; await p.mouse.click(s2.x, s2.y); return s2; } return null; };
const tagTap = async (p, m) => { const r = await p.evaluate(m => window.__hub3d.tagRect(m), m); await p.mouse.click((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2); };
const toRainbow = async p => { await click(p, "rainbowBtn"); await sleep(3600); };
// 寵物服裝店（10-12 起打開換裝畫面 #dress；詳細測試在 dress-game.js）
const dressOn = p => p.waitForFunction(() => !document.getElementById("dress").classList.contains("hidden") && window.__zy.dress && window.__zy.dress.debug.state().open, null, { timeout: 8000 }).then(() => true, () => false);
const dressDone = async p => { await p.evaluate(() => { const b = document.querySelector("#dress .dr-done"); if (b) b.click(); }); await sleep(1200); };

(async () => {
  const browser = await launch();
  // ===== 1. 還沒開（12 張貼紙）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 12, query: Q });
    await ready(p);
    let r = await rbInfo(p);
    ok("12 張：彩虹島沒開（橋中間沉著、兩頭有路障）", !r.open && !r.gapVisible && r.barrier, JSON.stringify(r));
    ok("12 張：配送站、偵探社、服裝店都鎖著", JSON.stringify(r.locked.sort()) === '["deliver","detective","dress"]', JSON.stringify(r.locked));   // 10-12 多了詞句偵探社
    ok("12 張：🌈 鈕寫「彩虹島 🔒」", (await btns(p)).rb.includes("彩虹島") && (await btns(p)).rb.includes("🔒"), JSON.stringify(await btns(p)));
    await toRainbow(p);
    ok("點 🌈：飛到彩虹島、貓頭鷹說再收集 8 張彩虹島就開放", (await rbInfo(p)).place === "rainbow" && (await guide(p)).includes("8") && (await guide(p)).includes("彩虹島就開放"), await guide(p));
    ok("在彩虹島：🌈 鈕變 🏝️ 回小島", (await btns(p)).rb === "🏝️回小島", JSON.stringify(await btns(p)));
    const tg = await p.evaluate(() => { const t = document.querySelector('.hub-tag[data-mode=deliver]'); return { lock: t.querySelector(".ht-lock").textContent, locked: t.classList.contains("locked"), disp: getComputedStyle(t).display }; });
    ok("配送站浮標：鎖頭 🔒 20", tg.locked && tg.lock === "🔒 20" && tg.disp !== "none", JSON.stringify(tg));
    const sd = await tap3d2(p, "deliver"); await sleep(1200);
    ok("點上鎖的配送站（兩下）：不會進遊戲、貓頭鷹說還差幾張", !!sd && (await p.evaluate(() => window.__zy.mode)) === null && (await guide(p)).includes("8 張貼紙就可以玩"), JSON.stringify(sd) + " " + await guide(p));
    ok("上鎖的配送站：介紹卡寫還差 8 張、沒有開始鈕", await p.evaluate(() => document.getElementById("pkLock").textContent.includes("再收集 8 張貼紙") && getComputedStyle(document.getElementById("pkGo")).display === "none"), await p.evaluate(() => document.getElementById("pkLock").textContent));
    await p.evaluate(() => { document.getElementById("guideText").textContent = ""; });
    const sr = await tap3d2(p, "dress"); await sleep(1200);
    ok("點上鎖的服裝店（兩下）：說彩虹島還沒開", !!sr && (await guide(p)).includes("彩虹島就開放"), JSON.stringify(sr) + " " + await guide(p));
    await p.evaluate(() => document.getElementById("pkClose").click()); await sleep(300);
    await p.evaluate(() => { document.getElementById("guideText").textContent = ""; });
    const bs = await p.evaluate(() => window.__hub3d.bridgeScreen()), hb = await p.evaluate(b => window.__hub3d.hitAt(b.x, b.y), bs);
    await p.mouse.click(bs.x, bs.y); await sleep(1200);
    ok("點沒接好的彩虹橋：說彩虹島還沒開", hb === "rbLock" && (await guide(p)).includes("彩虹島就開放"), `hit=${hb} ${await guide(p)}`);
    // 換成 20 張的存檔位 → 橋升起來＋宣告＋NEW
    await p.evaluate(() => import("./js/zhuyin-words.js").then(({ WORDS }) => { const s = {}; WORDS.slice(0, 20).forEach(w => s[w.h] = 1); localStorage.setItem("zy2_stickers", JSON.stringify(s)); }));
    await p.evaluate(() => { window.__spoken = []; document.getElementById("playerBtn").click(); }); await sleep(400);
    await p.evaluate(() => document.querySelectorAll("#playerList .player")[1].click()); await sleep(1600);
    r = await rbInfo(p);
    ok("換成 20 張的存檔位：橋接好、路障收掉", r.open && r.gapVisible && !r.barrier, JSON.stringify(r));
    ok("解鎖：貓頭鷹宣告彩虹島開放、🌈 鈕有 NEW", (await p.evaluate(() => window.__spoken.map(s => s.text))).includes("彩虹橋接好了！彩虹島開放囉！") && await p.evaluate(() => document.getElementById("rainbowBtn").classList.contains("news")), JSON.stringify(await p.evaluate(() => window.__spoken.map(s => s.text))));
    ok("解鎖：配送站、偵探社（need 20）、服裝店都開了", (await rbInfo(p)).locked.length === 0, JSON.stringify((await rbInfo(p)).locked));
    ok("沒有錯誤（還沒開／解鎖）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 開放（40 張）：路網、鏡頭、點建築、居民、地點鈕 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, eggs: 3, query: Q });
    await ready(p);
    const g = await p.evaluate(() => window.__hub3d.graph()), r = await rbInfo(p);
    ok("路網全部連通（含彩虹島、拱橋）", g.components === 1, JSON.stringify(g));
    ok("彩虹島沒有斷頭路、6 棟（配送站、偵探社、服裝店、三戶人家）門口都接到路", r.deadEnds.length === 0 && ["deliver", "detective", "dress", "bearHouse", "bunnyHouse", "pigHouse"].every(d => r.doors.includes(d)), JSON.stringify(r));
    ok("斷頭路 12 條（主島西邊路底接上彩虹橋、10-12 歸仁區橫路東端接上陀螺競技場半島）", g.deadEnds === 12, String(g.deadEnds));
    ok("在主島：彩虹島的浮標藏著、動畫不跑", await p.evaluate(() => [...document.querySelectorAll(".hub-tag.rb")].every(t => getComputedStyle(t).display === "none")) && !r.active, JSON.stringify(r));
    let b = await btns(p);
    ok("在主島：🏙️歸仁區、🌈彩虹島", b.town === "🏙️歸仁區" && b.rb === "🌈彩虹島" && b.place === "main", JSON.stringify(b));
    await toRainbow(p);
    const off0 = (await rbInfo(p)).off; await sleep(400); const r2 = await rbInfo(p);
    const cam = await p.evaluate(() => { const c = window.__hub3d.screenOf("deliver"), d = window.__hub3d.screenOf("dress"); return { c, d, W: innerWidth, H: innerHeight }; });
    const inMid = q => q.x > cam.W * 0.1 && q.x < cam.W * 0.9 && q.y > cam.H * 0.15 && q.y < cam.H * 0.9;
    ok("鏡頭飛到彩虹島：停住了、配送站和服裝店都在畫面中間一帶、彩虹島動畫在跑", r2.place === "rainbow" && Math.hypot(r2.off[0] - off0[0], r2.off[1] - off0[1]) < 0.05 && inMid(cam.c) && inMid(cam.d) && r2.active, JSON.stringify({ r2, cam }));
    ok("太陽（陰影範圍）跟過去", Math.hypot(r2.sun[0] + 20.1, r2.sun[1] - 1.1) < 1.5, JSON.stringify(r2.sun));
    ok("貓頭鷹說這裡是彩虹島、NEW 拿掉", (await guide(p)).includes("這裡是彩虹島") && !(await p.evaluate(() => document.getElementById("rainbowBtn").classList.contains("news"))), await guide(p));
    const vis = await p.evaluate(() => ({ rb: [...document.querySelectorAll(".hub-tag.rb")].map(t => getComputedStyle(t).display !== "none" && getComputedStyle(t).visibility !== "hidden"), main: [...document.querySelectorAll(".hub-tag:not(.rb):not(.civic)")].every(t => getComputedStyle(t).visibility === "hidden"), civic: [...document.querySelectorAll(".hub-tag.civic")].every(t => getComputedStyle(t).display === "none"),
      words: [...document.querySelectorAll(".hub-tag.rb")].map(t => t.textContent) }));
    ok("在彩虹島：只顯示彩虹島的三個浮標（配送站、服裝店、偵探社）", vis.rb.length === 3 && vis.rb.every(Boolean) && vis.main && vis.civic, JSON.stringify(vis));
    const lod0 = await p.evaluate(() => window.__hub3d.lod());
    ok("浮標精簡（10-12 晚：沒有「新」）：配送站、服裝店、偵探社剛開放也是圓形圖示", ["deliver", "dress", "detective"].every(m => !lod0.open.includes(m)) && await p.evaluate(() => !document.querySelector(".hub-tag .ht-new, .hub-tag.fresh")), JSON.stringify(lod0));
    const tagsIn = await p.evaluate(() => { const ob = ["#menu > .menu-bottom", "#guide img", "#guideText", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#townBtn", "#townTag", "#rainbowBtn", "#rainbowTag", "#hudLBtn", "#hudRBtn"].map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
      const bad = []; for (const t of document.querySelectorAll(".hub-tag.rb")) { const q = t.getBoundingClientRect(); if (q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight || ob.some(o => q.left < o.right && q.right > o.left && q.top < o.bottom && q.bottom > o.top)) bad.push(t.dataset.mode); } return bad; });
    ok("1180×820：彩虹島浮標在畫面內、沒被按鈕／膠囊擋到", tagsIn.length === 0, tagsIn.join(","));
    // 點配送站（3D）＝點那張卡片 → 進彩虹配送站（10-12 接上真的遊戲；完整流程測試在 deliver-game.js）；🏠→回小島、不留「繼續玩」
    await p.evaluate(() => { window.__dcard = 0; document.querySelector(".mode-card[data-mode=deliver]").addEventListener("click", () => window.__dcard++); });
    const sd = await tap3d2(p, "deliver"); await sleep(1500);
    const inDlv = () => p.waitForFunction(() => window.__zy.mode === "deliver" && !document.getElementById("deliver").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
    const leave = async () => { await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(900); };
    const in1 = await inDlv();
    ok("點配送站建築兩下 → 點了 deliver 卡片、進配送站", !!sd && (await p.evaluate(() => window.__dcard)) === 1 && in1, JSON.stringify({ sd, mode: await p.evaluate(() => window.__zy.mode) }));
    await leave();
    const st = await p.evaluate(() => ({ mode: window.__zy.mode, menu: !document.getElementById("menu").classList.contains("hidden"), resume: !document.getElementById("resumeBtn").classList.contains("hidden"), kids: document.getElementById("deliverRoot").children.length }));
    ok("配送站 🏠 回小島：回到選單、沒有留「繼續玩」、配送站畫面收乾淨", st.mode === null && st.menu && !st.resume && st.kids === 0, JSON.stringify(st));
    if ((await rbInfo(p)).place !== "rainbow") await toRainbow(p);   // 回小島＝回到主島（show 會重設地點）
    await tagTap(p, "deliver");
    ok("點配送站浮標一下 → 配送站的介紹卡（還沒點 deliver 卡片）", await pickOn(p, "deliver") && (await p.evaluate(() => window.__dcard)) === 1);
    await sleep(900); await tagTap(p, "deliver"); await sleep(1500);
    ok("再點配送站浮標 → 點 deliver 卡片、進配送站", (await p.evaluate(() => window.__dcard)) === 2 && await inDlv(), String(await p.evaluate(() => window.__dcard)));
    await leave();
    if ((await rbInfo(p)).place !== "rainbow") await toRainbow(p);
    await p.evaluate(() => { document.getElementById("guideText").textContent = ""; });
    const sr1 = await tap3d(p, "dress");
    ok("點服裝店一下 → 服裝店的介紹卡（寵物服裝店、幫寵物換衣服），還沒打開換裝畫面", !!sr1 && await pickOn(p, "dress") && (await p.evaluate(() => document.getElementById("pkName").textContent)) === "寵物服裝店" && !(await p.evaluate(() => !document.getElementById("dress").classList.contains("hidden"))), JSON.stringify(sr1));
    await sleep(900); const sr = await spot(p, "dress"); if (sr) await p.mouse.click(sr.x, sr.y); await sleep(1200);
    await sleep(500);
    ok("再點服裝店 → onDress 打開換裝畫面（10-12）、沒進任何遊戲", !!sr && await dressOn(p) && (await p.evaluate(() => window.__zy.mode)) === null, JSON.stringify(sr));
    await dressDone(p);
    const lod2 = await p.evaluate(() => window.__hub3d.lod());
    ok("從服裝店回來：服裝店是圓形圖示、介紹卡收著", !lod2.open.includes("dress") && !lod2.sel && await p.evaluate(() => document.getElementById("pick").classList.contains("hidden")), JSON.stringify(lod2));
    ok("換裝畫面「穿好了」→ 回到小島、還在彩虹島", !(await dressOn(p)) && (await rbInfo(p)).place === "rainbow" && await p.evaluate(() => !document.getElementById("menu").classList.contains("hidden")), JSON.stringify(await rbInfo(p)));
    await tagTap(p, "dress"); await pickOn(p, "dress"); await sleep(600); await p.evaluate(() => document.getElementById("pkGo").click()); await sleep(1700);
    ok("點服裝店浮標 → 介紹卡 → 開始玩 → 也打開換裝畫面", await dressOn(p));
    await dressDone(p);
    // 居民：點了跳一下＋唸名字
    await p.evaluate(() => { window.__spoken = []; });
    let said = false;
    for (let k = 0; k < 3 && !said; k++) {
      const s = await p.evaluate(() => window.__hub3d.rbScreen("bunnyHouse")), hit = await p.evaluate(s => window.__hub3d.hitAt(s.x, s.y), s);
      if (hit && hit.startsWith("folk:")) { await p.mouse.click(s.x, s.y); await sleep(600); said = (await p.evaluate(() => window.__spoken.map(x => x.text))).some(t => /小兔|小熊|小豬/.test(t)); } else await sleep(600);
    }
    ok("點小兔（居民）→ 唸名字", said, JSON.stringify(await p.evaluate(() => window.__spoken.map(x => x.text))));
    // 地點鈕：人在哪座島那顆變 🏝️ 回小島
    b = await btns(p); ok("在彩虹島：🏙️歸仁區、🏝️回小島", b.town === "🏙️歸仁區" && b.rb === "🏝️回小島" && b.place === "rainbow", JSON.stringify(b));
    await click(p, "townBtn"); await sleep(600);
    b = await btns(p); ok("彩虹島 → 點 🏙️：去歸仁區（🏝️回小島、🌈彩虹島）", b.town === "🏝️回小島" && b.rb === "🌈彩虹島" && b.place === "town", JSON.stringify(b));
    await click(p, "townBtn"); await sleep(600);
    b = await btns(p); ok("歸仁區 → 點 🏝️：回主島", b.town === "🏙️歸仁區" && b.rb === "🌈彩虹島" && b.place === "main", JSON.stringify(b));
    await click(p, "rainbowTag"); await sleep(600); b = await btns(p);
    ok("點「彩虹島」小字也能去", b.place === "rainbow", JSON.stringify(b));
    await click(p, "rainbowBtn"); await sleep(4200); b = await btns(p);
    const r3 = await rbInfo(p);
    ok("彩虹島 → 點 🏝️：回主島、鏡頭回原位、太陽回原位", b.place === "main" && Math.hypot(...r3.off) < 0.05 && Math.hypot(...r3.sun) < 0.05, JSON.stringify({ b, off: r3.off, sun: r3.sun }));
    ok("回主島 3 秒後彩虹島動畫停", !(await rbInfo(p)).active);
    ok("旁注音沒漏字", (await p.evaluate(() => [...(window.__zy.zMissing || [])])).length === 0, JSON.stringify(await p.evaluate(() => [...(window.__zy.zMissing || [])])));
    ok("沒有錯誤（開放）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 3. 直式／4:3：彩虹島浮標不被介面擋到、點得到 =====
  for (const [w, h] of [[768, 1024], [1024, 768]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 40, query: Q });
    await ready(p); await toRainbow(p);
    const rbBad = () => p.evaluate(() => { const ob = ["#menu > .menu-bottom", "#guide img", "#guideText", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#townBtn", "#townTag", "#rainbowBtn", "#rainbowTag", "#hudLBtn", "#hudRBtn"].map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
      const bad = []; for (const t of document.querySelectorAll(".hub-tag.rb")) { const q = t.getBoundingClientRect(); if (!q.width || q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight || ob.some(o => q.left < o.right && q.right > o.left && q.top < o.bottom && q.bottom > o.top)) bad.push(t.dataset.mode + (t.classList.contains("open") ? "(開)" : "(收)")); } return bad; });
    const bad = await rbBad();
    ok(`${w}×${h}：彩虹島浮標在畫面內、沒被按鈕／貼紙／貓頭鷹擋到`, bad.length === 0, bad.join(","));
    // 浮標精簡（10-12）：平常收成圓形圖示；再一棟一棟按住展開，兩種樣子都不能被擋
    const shut = await p.evaluate(() => [...document.querySelectorAll(".hub-tag.rb")].map(t => t.classList.contains("open")));
    const bad2 = await rbBad();
    ok(`${w}×${h}：彩虹島浮標收成圓形圖示，也在畫面內、沒被擋`, shut.every(o => !o) && bad2.length === 0, JSON.stringify({ shut, bad2 }));
    const bad3 = [];
    // 按住展開的：在畫面內、不碰上方圓鈕（收起來的也算）、名字那一橫排沒被蓋住（按住時浮標層疊到貓頭鷹對話框、膠囊上面）
    for (const m of ["deliver", "dress", "detective"]) { await p.evaluate(m => window.__hub3d.openOne(m), m); await opened(p, m);
      bad3.push(...(await p.evaluate(m => { const ob = ["#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#townBtn", "#townTag", "#rainbowBtn", "#rainbowTag", "#hudLBtn", "#hudRBtn"].map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
        const t = document.querySelector(`.hub-tag[data-mode=${m}]`), q = t.getBoundingClientRect(), bad = [];
        if (!t.classList.contains("open") || q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight || ob.some(o => q.left < o.right && q.right > o.left && q.top < o.bottom && q.bottom > o.top)) bad.push(m + "(位置)");
        for (const f of [0.08, 0.3, 0.5, 0.7, 0.92]) { const e = document.elementFromPoint(q.left + q.width * f, q.top + q.height / 2); if (!e || e.closest(".hub-tag") !== t) { bad.push(m + "(被" + (e ? e.id || e.className || e.tagName : "?") + "蓋住)"); break; } }
        return bad; }, m))); }
    await p.evaluate(() => window.__hub3d.openOne(null)); await sleep(300);
    ok(`${w}×${h}：彩虹島浮標一棟一棟按住展開名字，也沒被擋`, bad3.length === 0, bad3.join(","));
    await p.evaluate(() => { document.getElementById("guideText").textContent = ""; });
    const sr = await tap3d2(p, "dress"); await sleep(1200);
    await sleep(500);
    ok(`${w}×${h}：點得到服裝店（點兩下＝打開換裝畫面）`, !!sr && await dressOn(p), JSON.stringify(sr));
    await dressDone(p);
    ok(`${w}×${h}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 4. ?no3d 卡片選單：配送站卡看得到、10 張卡都在畫面內、點了照樣有反應 =====
  for (const [w, h] of [[1180, 820], [820, 1180], [1024, 768]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 40, query: "debug&novoice&no3d" });
    const c = await p.evaluate(() => { const cs = [...document.querySelectorAll(".mode-card")].map(e => e.getBoundingClientRect()); const d = document.querySelector(".mode-card[data-mode=deliver]").getBoundingClientRect();
      return { n: cs.length, out: cs.filter(r => r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight).length, dv: d.width > 50 && d.height > 50, lab: document.querySelector(".mode-card[data-mode=deliver] .label").scrollWidth <= d.width + 1 }; });
    ok(`?no3d ${w}×${h}：12 張卡都在畫面內、配送站卡字沒有超出卡片`, c.n === 12 && c.out === 0 && c.dv && c.lab, JSON.stringify(c));   // 10-12 多了偵探、陀螺
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=deliver]").click());
    const inD = await p.waitForFunction(() => window.__zy.mode === "deliver" && !document.getElementById("deliver").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
    ok(`?no3d ${w}×${h}：點配送站卡 → 進配送站（卡片選單也能玩）`, inD, String(await p.evaluate(() => window.__zy.mode)));
    await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await sleep(800);
    ok(`?no3d ${w}×${h}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS (${out.length})`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
