// 3D 選單小島測試：node tools/zy-test/hub3d.js
// 驗：3D 選單有出現（canvas、卡片視覺隱藏）、點建築投影位置會進那個遊戲、浮標也能點、翻牌先開選張數、
//     點未解鎖建築不會進遊戲、拖曳不算點擊、長按 0.6 秒／拖 15px 也算點、點朋友會唸名字、進遊戲 rAF 停／回選單 rAF 恢復、
//     新玩家（0 張貼紙）五棟上鎖＋手指提示、?no3d 退回卡片選單照常可玩、沒有錯誤、
//     路網全部連通（每棟建築／景點都接到路）、扭蛋機點了會呼叫 onGacha、setPets 30 隻走路不卡（路上最多 12 隻、其他在寵物公園）、
//     setDecor 20 個都擺上去、對向兩隻寵物能交會而過不迴轉、新玩家釣魚浮標有黃框；
//     浮標精簡（10-12）：平常圓形圖示、剛解鎖還沒玩過的展開＋「新」（玩過收起來）、按住展開／拖曳收回／放開照樣進遊戲、
//     拉近全部展開、滾輪拉遠到 0.5 倍三座島都看得到、拖不到整片海、最遠時點建築照樣進遊戲、直式／4:3 一棟一棟展開也不被擋；
//     介紹卡（10-12）：點一下＝介紹卡不進遊戲（名字、說明、星星、貓頭鷹唸名字、鏡頭把那棟移到卡片上面）、再點同一棟＝進遊戲、點別棟＝換卡、
//     拖曳／點空白／✕＝收卡、上鎖的卡沒有開始鈕、扭蛋機也走介紹卡、「新」拿掉了（每棟平常都是圓形圖示）；
//     點遠方的島／橋頭路牌（10-12）：飛過去、上鎖＝說上鎖台詞不移動、在彩虹島點遠方主島＝回去、島上的建築照樣是介紹卡
const { launch, openGame, enterMode } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 找一個「點下去會點到這棟、而且上面沒有浮標或按鈕擋著」的螢幕座標
const spot = (p, m) => p.evaluate(m => {
  const h = window.__hub3d, c = h.screenOf(m);
  for (let r = 0; r <= 90; r += 6) for (let a = 0; a < 360; a += r ? 30 : 360) {
    const x = c.x + Math.cos(a * Math.PI / 180) * r, y = c.y + Math.sin(a * Math.PI / 180) * r;
    const e = document.elementFromPoint(x, y);
    if (e && e.tagName === "CANVAS" && h.hitAt(x, y) === m) return { x, y };
  }
  return null;
}, m);
const visible = (p, id) => p.evaluate(id => !document.getElementById(id).classList.contains("hidden"), id);
const frames = p => p.evaluate(() => window.__hub3d.frames);
const ready = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 20000 }).then(() => p.waitForTimeout(700));   // 建築模型都長出來了
const inMode = (p, m) => p.waitForFunction(m => !document.getElementById(m).classList.contains("hidden") && document.getElementById("loading").classList.contains("hidden"), m, { timeout: 8000 }).then(() => true, () => false);
// 浮標展開完（0.2 秒拉開；headless 軟體繪圖一格可能 0.2 秒以上）再多等兩三格讓位置跟上
const opened = (p, m) => p.waitForFunction(m => { const t = document.querySelector(`.hub-tag[data-mode=${m}]`); return t.classList.contains("open") && t.querySelector(".ht-more").getBoundingClientRect().width >= t.querySelector(".ht-txt").getBoundingClientRect().width - 1; }, m, { timeout: 5000 }).catch(() => {}).then(() => sleep(400));
// 按住展開的那個：在畫面內、名字那一橫排從左到右都點得到它（沒被任何東西蓋住；按住時浮標層會疊到貓頭鷹對話框、膠囊上面，上方圓鈕還是在它上面）
const blockedOpen = (p, m) => p.evaluate(m => {
  const t = document.querySelector(`.hub-tag[data-mode=${m}]`), q = t.getBoundingClientRect(), bad = [];
  if (!t.classList.contains("open")) bad.push("沒展開");
  if (q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight) bad.push("出畫面");
  for (const f of [0.08, 0.3, 0.5, 0.7, 0.92]) { const e = document.elementFromPoint(q.left + q.width * f, q.top + q.height / 2); if (!e || e.closest(".hub-tag") !== t) { bad.push("被" + (e ? e.id || e.className || e.tagName : "?") + "擋"); break; } }
  return bad;
}, m);
// 介紹卡（10-12）：點一下建築＝開介紹卡；pickOn＝卡片開著、是哪一棟
const pickOn = (p, m) => p.waitForFunction(m => { const b = document.getElementById("pick"); return !b.classList.contains("hidden") && b.dataset.mode === m && window.__hub3d.sel() === m; }, m, { timeout: 5000 }).then(() => true, () => false);
const pickOff = p => p.waitForFunction(() => document.getElementById("pick").classList.contains("hidden") && !window.__hub3d.sel(), null, { timeout: 5000 }).then(() => true, () => false);
// 點兩下進遊戲：第一下開介紹卡（等卡片出來、鏡頭移好），第二下點同一棟（重新找點擊位置）＝開始。朋友走過去擋到 → 最多試 3 次
const tap2 = async (p, m, enterId = m) => {
  for (let k = 0; k < 3; k++) {
    let s = await spot(p, m); if (!s) { await sleep(500); continue; }
    await p.mouse.click(s.x, s.y); if (!(await pickOn(p, m))) continue; await sleep(900);
    s = await spot(p, m); if (!s) continue;
    await p.mouse.click(s.x, s.y); if (await inMode(p, enterId)) return true;
  }
  return false;
};
const SHOTS = process.env.ZY_SHOTS || require("path").join(process.env.TEMP || ".", "zy-hub3d-shots");
const shot = async (p, name) => { try { require("fs").mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: require("path").join(SHOTS, name + ".png") }); } catch (e) {} };
const backToMenu = async p => { await p.evaluate(() => { document.getElementById("homeBtn").click(); document.getElementById("confirmYes").click(); }); await p.waitForFunction(() => !document.getElementById("menu").classList.contains("hidden")); await sleep(600); };

(async () => {
  const browser = await launch();
  // ===== 1. 3D 選單（20 張貼紙：釣魚～地鼠解鎖、青蛙 25 張還鎖著）=====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, stars: 25, eggs: 2, query: "debug" });
    await ready(p);
    const st = await p.evaluate(() => { const cards = document.querySelector("#menu > .mode-cards").getBoundingClientRect();
      return { hub: document.body.classList.contains("hub3d"), canvas: !!document.querySelector("#menu .hub-stage canvas"), cardsW: cards.width, cardsOpacity: getComputedStyle(document.querySelector("#menu > .mode-cards")).opacity, tags: document.querySelectorAll(".hub-tag:not(.civic):not(.rb)").length }; });
    ok("3D 選單有出現（body.hub3d＋canvas）", st.hub && st.canvas, JSON.stringify(st));
    ok("卡片 DOM 還在但看不到", st.cardsW <= 1 && st.cardsOpacity === "0" && (await p.evaluate(() => document.querySelectorAll(".mode-card").length)) === 13);   // 10-12 多了彩虹配送站、詞句小偵探、注音戰鬥陀螺；10-13 挑戰燈塔
    ok("主島 11 個浮標（9 個遊戲＋挑戰燈塔＋扭蛋機）", st.tags === 11, String(st.tags));
    const g = await p.evaluate(() => window.__hub3d.graph());
    ok("路網全部連通、9 棟建築＋7 個景點＋歸仁區 4 棟設施＋陀螺競技場＋彩虹島 6 棟都接到路", g.components === 1 && g.doors.length === 27, JSON.stringify(g));   // 10-12 彩虹島：配送站、服裝店、偵探社、三戶人家；歸仁區東邊半島：陀螺競技場
    await p.waitForFunction(() => window.__hub3d.pets().length >= 6, null, { timeout: 15000 }).catch(() => {});   // 寵物模型在建築之後才抓
    ok("島上的寵物照 setPets 來（eggs 2 → 6 位朋友）", (await p.evaluate(() => window.__hub3d.pets().length)) === 6, JSON.stringify(await p.evaluate(() => window.__hub3d.pets())));
    ok("未解鎖（20 張）：青蛙、泡泡、燈塔鎖著", JSON.stringify(await p.evaluate(() => window.__hub3d.locked())) === '["frog","bubble","tower"]', JSON.stringify(await p.evaluate(() => window.__hub3d.locked())));
    ok("鎖著的浮標只留圖示＋🔒 25（字收起來）", await p.evaluate(() => { const t = document.querySelector('.hub-tag[data-mode=frog]'), lk = t.querySelector(".ht-lock").textContent;
      return t.classList.contains("locked") && lk === "🔒 25" && getComputedStyle(t.querySelector(".ht-word")).display === "none" && getComputedStyle(t.querySelector(".ht-lock")).display !== "none"; }), await p.evaluate(() => document.querySelector('.hub-tag[data-mode=frog] .ht-lock').textContent));
    ok("不是新玩家：沒有黃框", await p.evaluate(() => document.querySelectorAll(".hub-tag.first").length === 0));
    // 浮標不能被標題／圓鈕／膠囊／貓頭鷹擋到
    const clash = await p.evaluate(() => { const ob = ["#menu > h1", "#menu > .menu-bottom", "#guide img", "#guideText", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn"].map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
      const bad = []; for (const t of document.querySelectorAll(".hub-tag:not(.civic):not(.rb)")) { const r = t.getBoundingClientRect(); if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight || ob.some(o => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top)) bad.push(t.dataset.mode); } return bad; });
    ok("浮標沒有被標題／按鈕／膠囊／貓頭鷹擋住", clash.length === 0, clash.join(","));
    // rAF：選單在跑
    const f0 = await frames(p); await sleep(700); const f1 = await frames(p);
    ok("選單畫面 rAF 在跑", f1 > f0, `${f0}→${f1}`);
    // 拖曳不算點擊
    const sf = await spot(p, "fish");
    ok("找得到釣魚建築的點擊位置", !!sf, JSON.stringify(sf));
    if (sf) {
      await p.mouse.move(sf.x, sf.y); await p.mouse.down(); for (let k = 1; k <= 8; k++) { await p.mouse.move(sf.x + k * 12, sf.y + k * 4); await sleep(30); } await p.mouse.up(); await sleep(800);
      ok("拖曳不會進遊戲", await visible(p, "menu") && !(await visible(p, "fish")));
      await p.evaluate(() => window.__hub3d.focus(null)); await sleep(300);
    }
    // 點建築一下 → 介紹卡（不進遊戲）；再點同一棟 → 進那個遊戲
    const s2 = await spot(p, "fish");
    if (s2) await p.mouse.click(s2.x, s2.y);
    ok("點釣魚建築一下 → 出介紹卡、沒有進遊戲", !!s2 && await pickOn(p, "fish") && (await p.evaluate(() => window.__zy.mode)) === null, JSON.stringify(s2));
    await sleep(900);
    const s2b = await spot(p, "fish"); if (s2b) await p.mouse.click(s2b.x, s2b.y);
    const entered = await p.waitForFunction(() => !document.getElementById("fish").classList.contains("hidden") && document.getElementById("loading").classList.contains("hidden"), null, { timeout: 8000 }).then(() => true, () => false);
    ok("介紹卡開著再點同一棟（滑鼠點投影位置）→ 進釣魚、介紹卡收起來", entered && await p.evaluate(() => document.getElementById("pick").classList.contains("hidden")));
    // 進遊戲 → rAF 停
    await sleep(300); const g0 = await frames(p); await sleep(800); const g1 = await frames(p);
    ok("進遊戲後 rAF 停止", g1 === g0 && !(await p.evaluate(() => window.__hub3d.running)), `${g0}→${g1}`);
    await backToMenu(p);
    const m0 = await frames(p); await sleep(700); const m1 = await frames(p);
    ok("回選單後 rAF 恢復", m1 > m0 && (await p.evaluate(() => window.__hub3d.running)), `${m0}→${m1}`);
    // 點另一棟（點餐）兩下
    ok("點點餐建築兩下 → 進點餐", await tap2(p, "order"));
    await backToMenu(p);
    // 點浮標 → 介紹卡；按「開始玩」→ 進氣球
    const tr = await p.evaluate(() => window.__hub3d.tagRect("tone"));
    await p.mouse.click((tr.x0 + tr.x1) / 2, (tr.y0 + tr.y1) / 2);
    ok("點浮標（氣球）→ 氣球的介紹卡", await pickOn(p, "tone"));
    const gb = await p.evaluate(() => { const r = document.getElementById("pkGo").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; });
    ok("介紹卡的「開始玩」夠大（≥ 72px 高）", gb.h >= 72, JSON.stringify(gb));
    await sleep(500); await p.mouse.click(gb.x, gb.y);
    ok("按「開始玩」→ 進氣球", await p.waitForFunction(() => !document.getElementById("tone").classList.contains("hidden"), null, { timeout: 8000 }).then(() => true, () => false));
    await backToMenu(p);
    // 扭蛋機：點一下＝介紹卡（扭蛋機、不打開）；再點一下／按開始＝onGacha（10-11 起＝打開扭蛋機畫面）
    const gachaOpen = () => p.evaluate(() => !document.getElementById("gacha").classList.contains("hidden"));
    const gachaClose = () => p.evaluate(() => document.getElementById("gachaClose").click());
    let sg = await spot(p, "gacha"); if (sg) await p.mouse.click(sg.x, sg.y);
    ok("點扭蛋機一下 → 扭蛋機的介紹卡（還沒打開扭蛋機）", !!sg && await pickOn(p, "gacha") && !(await gachaOpen()) && (await p.evaluate(() => document.getElementById("pkName").textContent.includes("扭蛋機"))), JSON.stringify(sg));
    await sleep(900); sg = await spot(p, "gacha"); if (sg) await p.mouse.click(sg.x, sg.y); await sleep(1200);
    ok("再點扭蛋機 → onGacha（打開扭蛋機、沒有進遊戲）", !!sg && await gachaOpen() && (await p.evaluate(() => window.__zy.mode)) === null, JSON.stringify(sg));
    await gachaClose(); await sleep(900);
    const tg = await p.evaluate(() => window.__hub3d.tagRect("gacha")); await p.mouse.click((tg.x0 + tg.x1) / 2, (tg.y0 + tg.y1) / 2);
    await pickOn(p, "gacha"); await sleep(500); await p.evaluate(() => document.getElementById("pkGo").click()); await sleep(1200);
    ok("點扭蛋浮標 → 介紹卡 → 開始玩 → onGacha", await gachaOpen());
    await gachaClose(); await sleep(500);
    // 翻牌：點兩下 → 先開選張數
    ok("點翻牌建築兩下 → 先跳出選張數", await tap2(p, "match", "matchPick"));   // 朋友剛好走過去擋到 → tap2 會重試
    await p.evaluate(() => document.getElementById("matchPickClose").click()); await sleep(300);
    // 5 歲小孩的點法：按住 0.6 秒、拖著 15px 也要算點（第一下開介紹卡、第二下進遊戲；朋友會走過去擋到 → 最多試 3 次）
    const kidOnce = async (m, how) => { const s = await spot(p, m); if (!s) return false;
      await p.mouse.move(s.x, s.y); await p.mouse.down();
      if (how === "hold") await sleep(600); else await p.mouse.move(s.x + 15, s.y + 3);   // headless 軟體繪圖每次 move 要等一兩幀（0.1～0.3 秒）：一步滑 15px
      await p.mouse.up(); return true; };
    const kidTap = async (m, how) => { for (let k = 0; k < 3; k++) { if (!(await kidOnce(m, how))) { await sleep(500); continue; }
      if (!(await pickOn(p, m))) continue; await sleep(900); if (!(await kidOnce(m, how))) continue; if (await inMode(p, m)) return true; } return false; };
    ok("長按 0.6 秒點積木建築（兩下）→ 介紹卡 → 進積木", await kidTap("build", "hold"));
    await backToMenu(p);
    ok("拖著 15px 點點餐建築（兩下）→ 介紹卡 → 進點餐", await kidTap("order", "drag"));
    await backToMenu(p);
    // 未解鎖的青蛙：點一下＝介紹卡寫還差幾張、沒有開始鈕；再點一下不進遊戲，嚮導說還差幾張
    let sl = await spot(p, "frog");
    ok("找得到青蛙建築的點擊位置", !!sl, JSON.stringify(sl));
    if (sl) await p.mouse.click(sl.x, sl.y);
    const lkOn = await pickOn(p, "frog");
    const lkCard = await p.evaluate(() => ({ locked: document.getElementById("pick").classList.contains("locked"), lock: document.getElementById("pkLock").textContent, go: getComputedStyle(document.getElementById("pkGo")).display }));
    ok("點未解鎖建築：介紹卡寫「🔒 再收集 5 張貼紙」、沒有開始鈕", lkOn && lkCard.locked && lkCard.lock.includes("再收集 5 張貼紙") && lkCard.go === "none", JSON.stringify(lkCard));
    await sleep(900); sl = await spot(p, "frog"); if (sl) { await p.mouse.click(sl.x, sl.y); await sleep(1200); }
    ok("再點未解鎖建築也不會進遊戲", await visible(p, "menu") && !(await visible(p, "frog")) && (await p.evaluate(() => window.__zy.mode)) === null);
    ok("再點未解鎖建築：嚮導說還差幾張貼紙", (await p.evaluate(() => document.getElementById("guideText").textContent)).includes("5"), await p.evaluate(() => document.getElementById("guideText").textContent));
    await p.evaluate(() => document.getElementById("pkClose").click()); await pickOff(p);
    // 點朋友 → 唸名字
    await p.evaluate(() => { window.__spoken = []; });
    let said = false;
    for (let tries = 0; tries < 6 && !said; tries++) {
      const pt = await p.evaluate(() => { for (const id of window.__hub3d.pets()) { const s = window.__hub3d.petScreen(id); const e = s && document.elementFromPoint(s.x, s.y); if (e && e.tagName === "CANVAS" && window.__hub3d.hitAt(s.x, s.y) === "pet:" + id) return s; } return null; });
      if (pt) { await p.mouse.click(pt.x, pt.y); await sleep(500); said = (await p.evaluate(() => window.__spoken.map(s => s.text))).some(t => /小|熊貓|企鵝/.test(t)); }
      else await sleep(700);
    }
    ok("點朋友 → 唸朋友名字", said, JSON.stringify(await p.evaluate(() => window.__spoken.map(s => s.text))));
    ok("沒有進到任何遊戲（點朋友）", (await p.evaluate(() => window.__zy.mode)) === null);
    // 分頁隱藏 → rAF 停
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await sleep(200); const h0 = await frames(p); await sleep(600); const h1 = await frames(p);
    ok("分頁隱藏時 rAF 停止", h1 === h0, `${h0}→${h1}`);
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    const st2 = await p.evaluate(() => window.__hub3d.stats());
    ok("像素比 ≤ 2", st2.pixelRatio <= 2, JSON.stringify(st2));
    ok("不是新玩家：沒有手指提示", !(await p.evaluate(() => window.__hub3d.finger())));
    ok("沒有錯誤（3D 選單）", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 1b. 新玩家（0 張貼紙）：五棟上鎖、手指提示點釣魚 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 0, query: "debug" });
    const fg = await p.waitForFunction(() => window.__hub3d && window.__hub3d.finger(), null, { timeout: 4000 }).then(() => true, () => false);
    ok("新玩家：出現手指提示", fg);
    await ready(p);
    const lk = await p.evaluate(() => window.__hub3d.locked());
    ok("新玩家：尋寶／翻牌／氣球／地鼠／青蛙／泡泡／燈塔都鎖著", JSON.stringify(lk.sort()) === JSON.stringify(["bubble", "frog", "hunt", "match", "tone", "tower", "whack"]), JSON.stringify(lk));
    ok("新玩家：鎖著的浮標都有 🔒", await p.evaluate(() => [...document.querySelectorAll(".hub-tag.locked:not(.civic):not(.rb)")].length === 7 && [...document.querySelectorAll(".hub-tag.locked:not(.civic):not(.rb) .ht-lock")].every(e => e.textContent.includes("🔒"))));
    ok("新玩家：只有釣魚浮標有常駐黃框", await p.evaluate(() => { const f = [...document.querySelectorAll(".hub-tag.first")]; return f.length === 1 && f[0].dataset.mode === "fish" && getComputedStyle(f[0]).boxShadow.includes("255, 213, 74"); }));
    const sl = await spot(p, "hunt"); if (sl) { await p.mouse.click(sl.x, sl.y); await sleep(1200); }   // 尋寶在島的上方（新玩家貓頭鷹自我介紹比較長，會蓋到右邊的氣球攤）
    ok("新玩家：點鎖著的尋寶公園不會進遊戲（介紹卡寫還差 5 張）", !!sl && (await p.evaluate(() => window.__zy.mode)) === null && (await p.evaluate(() => document.getElementById("pkLock").textContent)).includes("5"), JSON.stringify(sl));
    ok("新玩家：點釣魚兩下 → 進釣魚", await tap2(p, "fish"));
    ok("新玩家：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 1c. 最壞情況：30 隻寵物＋20 個裝飾，走路不能卡住 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 136, eggs: 4, stars: 45, query: "debug" });
    await ready(p);
    const names = ["bear", "bunny", "cat", "fox", "panda", "penguin", "frog", "lion", "dog", "chick", "pig", "cow", "monkey", "koala", "giraffe", "tiger", "deer", "parrot", "bee", "crab", "beaver", "hog", "polar", "caterpillar", "elephant", "dino", "whale", "dragon", "cat", "dog"];
    const deco = ["kenney/holiday-kit/bench", "kenney/fantasy-town-kit/lantern", "kenney/pirate-kit/barrel", "kenney/city-kit-commercial/detail-parasol-a", "kenney/pirate-kit/crate"];
    await p.evaluate(({ names, deco }) => {
      window.__hub3d.setPets(names.map((n, i) => ({ id: "p" + i, name: n, stage: i % 3 + 1, glb: `IMAGE/zy3d/models/${n}.glb` })));
      window.__hub3d.setDecor(Array.from({ length: 20 }, (_, i) => ({ id: "d" + i, glb: `IMAGE/zy3d/${deco[i % deco.length]}.glb` })));
    }, { names, deco });
    const loaded = await p.waitForFunction(() => window.__hub3d.pets().length >= 30 && window.__hub3d.decorCount() >= 20, null, { timeout: 60000 }).then(() => true, () => false);
    ok("setPets 30 隻、setDecor 20 個都擺上去", loaded, JSON.stringify(await p.evaluate(() => [window.__hub3d.pets().length, window.__hub3d.decorCount(), window.__hub3d.decorSlots()])));
    // 路上最多 12 隻（含車子以外的寵物），其他在寵物公園休息；一直在路上的都要有在走
    const trk = new Map(); let close = 0, samples = 0, maxWalk = 0, minWalk = 99, homing = 0;
    for (let k = 0; k <= 24; k++) {
      const ag = await p.evaluate(() => window.__hub3d.agents());
      for (const a of ag) { const r = trk.get(a.id); if (r) { r.d += Math.hypot(a.x - r.x, a.z - r.z); r.x = a.x; r.z = a.z; r.road = r.road && a.onRoad; } else trk.set(a.id, { x: a.x, z: a.z, d: 0, road: a.onRoad, kind: a.kind }); }
      const pets = ag.filter(a => a.kind === "pet" && a.visible), walk = ag.filter(a => a.kind === "pet" && a.onRoad).length;
      maxWalk = Math.max(maxWalk, walk); minWalk = Math.min(minWalk, walk); homing += ag.some(a => a.home) ? 1 : 0;
      for (let i = 0; i < pets.length; i++) for (let j = i + 1; j < pets.length; j++) if (Math.hypot(pets[i].x - pets[j].x, pets[i].z - pets[j].z) < 0.3) close++;
      samples++; await sleep(500);
    }
    ok("路上同時最多 12 隻寵物（其他在寵物公園）", maxWalk <= 12 && minWalk >= 8, `路上 ${minWalk}～${maxWalk} 隻`);
    ok("寵物有輪流回公園（有一隻在回家路上）", homing > 0, `${homing}／${samples} 次取樣有人在回家`);
    const roads = [...trk.values()].filter(r => r.road), moved = roads.map(r => r.d), stuck = moved.filter(d => d < 1).length;
    ok("路上的寵物＋2 台車 12 秒內都有在走（沒有卡住）", roads.length >= 10 && stuck === 0, `${roads.length} 隻一直在路上，走最少 ${Math.min(...moved).toFixed(1)}、卡住 ${stuck} 隻`);
    ok("寵物不會疊在一起（距離 < 0.3 的次數很少）", close <= samples * 0.5, `${close} 次／${samples} 次取樣`);
    ok("最壞情況沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 1d. 對向兩隻寵物在同一條路上面對面：要能錯身而過，不能停下來掉頭 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, eggs: 4, stars: 45, query: "debug" });
    await ready(p);
    await p.waitForFunction(() => window.__hub3d.pets().length >= 2, null, { timeout: 20000 }).catch(() => {});
    const dl = await p.evaluate(() => window.__hub3d.duel());
    const pos = () => p.evaluate(ids => window.__hub3d.agents().filter(a => ids.includes(a.id)), dl ? dl.ids : []);
    const a0 = await pos(); await sleep(7000); const a1 = await pos();
    const res = a1.map(a => { const b = a0.find(o => o.id === a.id); return { id: a.id, turns: a.turns, far: Math.hypot(a.x - dl.node[0], a.z - dl.node[1]), was: Math.hypot(b.x - dl.node[0], b.z - dl.node[1]), side: Math.sign((a.x - dl.node[0]) * (b.x - dl.node[0]) + (a.z - dl.node[1]) * (b.z - dl.node[1])) }; });
    ok("對向兩隻能交會而過、不迴轉", !!dl && res.length === 2 && res.every(r => r.turns === 0 && r.side < 0), JSON.stringify({ dl, res }));
    ok("交會測試沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 1e. 浮標精簡（10-12 阿葉：「關卡變多了，名字一直顯示太雜亂」）=====
  // 平常只有圓形圖示；剛解鎖還沒玩過的展開＋「新」（玩過一次收起來）；按住那一棟展開、拖曳收回、放開照樣進遊戲；點浮標也是；
  // 拉近（≥ 1.25 倍）全部展開；拉遠到 0.5 倍（滾輪）：圖示縮小、三座島都看得到、拖不到整片海、點建築照樣進遊戲
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 40, stars: 30, eggs: 2, query: "debug&novoice&night=0&weather=sunny" });
    await ready(p); await p.evaluate(() => window.__hub3d.events(false)); await sleep(400);
    const lod = () => p.evaluate(() => window.__hub3d.lod());
    const shape = () => p.evaluate(() => [...document.querySelectorAll(".hub-tag:not(.civic):not(.rb)")].map(t => { const r = t.getBoundingClientRect(), m = t.querySelector(".ht-more").getBoundingClientRect(); return { m: t.dataset.mode, w: Math.round(r.width), h: Math.round(r.height), more: Math.round(m.width), open: t.classList.contains("open") }; }));
    const vmin = await p.evaluate(() => Math.min(innerWidth, innerHeight) / 100), W = 1180, H = 820;
    let L = await lod(), S = await shape();
    // 10-12 晚 阿葉：「不用把新的遊戲特別標出來」→ 剛解鎖還沒玩過的（40 張的泡泡）也一樣只有圓形圖示、沒有「新」
    ok("沒有「新」：剛解鎖還沒玩過的泡泡也收成圓形圖示（頁面上沒有 .ht-new、沒有 .fresh）", !S.find(s => s.m === "bubble").open && await p.evaluate(() => !document.querySelector(".hub-tag .ht-new, .hub-tag.fresh")), JSON.stringify(S.find(s => s.m === "bubble")));
    ok("浮標平常只有圓形圖示（寬＝高 7～8vmin、名字那段寬 0）", S.every(s => !s.open && s.more === 0 && Math.abs(s.w - s.h) <= 2 && s.w >= 7 * vmin && s.w <= 8.2 * vmin) && L.open.length === 0, JSON.stringify(S));
    const clashAll = () => p.evaluate(() => { const ob = ["#menu > .menu-bottom", "#guide img", "#guideText", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn", "#townBtn", "#townTag", "#rainbowBtn", "#rainbowTag", "#hudLBtn", "#hudRBtn"].map(s => document.querySelector(s)).filter(e => e && getComputedStyle(e).display !== "none").map(e => e.getBoundingClientRect());
      const bad = []; for (const t of document.querySelectorAll(".hub-tag:not(.civic):not(.rb)")) { const q = t.getBoundingClientRect(); if (q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight || ob.some(o => q.left < o.right && q.right > o.left && q.top < o.bottom && q.bottom > o.top)) bad.push(t.dataset.mode); } return bad; });
    ok("平常的樣子：浮標在畫面內、沒被按鈕／膠囊／貓頭鷹擋到", (await clashAll()).length === 0, (await clashAll()).join(","));
    // 按住地鼠建築：名字彈出來；拖曳：收回、不進遊戲
    let sw = await spot(p, "whack");
    ok("找得到地鼠建築的點擊位置", !!sw, JSON.stringify(sw));
    if (sw) {
      await p.mouse.move(sw.x, sw.y); await p.mouse.down(); await opened(p, "whack");
      L = await lod(); const wo = (await shape()).find(s => s.m === "whack");
      ok("按住地鼠建築：地鼠的名字彈出來（其他還是圖示）", L.press === "whack" && wo.open && wo.w > wo.h * 1.6 && L.open.join() === "whack", JSON.stringify({ L, wo }));
      for (let k = 1; k <= 6; k++) { await p.mouse.move(sw.x + k * 12, sw.y + k * 5); await sleep(30); }
      await sleep(350); L = await lod();
      ok("按住後拖曳：名字收回", L.press === null && !L.open.includes("whack"), JSON.stringify(L));
      await p.mouse.up(); await sleep(500);
      ok("按住後拖曳：不會進遊戲", (await p.evaluate(() => window.__zy.mode)) === null);
      await p.evaluate(() => window.__hub3d.focus(null)); await sleep(400);
    }
    // 按住 0.3 秒再放開：照樣算點（按住不到 0.8 秒＝點）→ 開介紹卡；按「開始玩」→ 進地鼠
    let inW = false;
    for (let k = 0; k < 3 && !inW; k++) { sw = await spot(p, "whack"); if (!sw) { await sleep(500); continue; }
      await p.mouse.move(sw.x, sw.y); await p.mouse.down(); await sleep(300); L = await lod(); await p.mouse.up(); inW = await pickOn(p, "whack") && L.press === "whack"; }
    const Lw = await lod();
    ok("按住地鼠建築 0.3 秒（名字展開）再放開 → 地鼠的介紹卡、名字一直展開", inW && Lw.sel === "whack" && Lw.open.includes("whack"), JSON.stringify({ L, Lw }));
    await sleep(400); await p.evaluate(() => document.getElementById("pkGo").click());
    ok("介紹卡按「開始玩」→ 進地鼠", await inMode(p, "whack"));
    await backToMenu(p);
    // 按住浮標（圓形圖示）：名字也會彈出來，放開＝點浮標（介紹卡），再點一下浮標＝開始
    const tr = await p.evaluate(() => window.__hub3d.tagRect("tone"));
    await p.mouse.move((tr.x0 + tr.x1) / 2, (tr.y0 + tr.y1) / 2); await p.mouse.down(); await sleep(350);
    L = await lod(); await p.mouse.up();
    ok("按住氣球浮標：名字展開，放開 → 氣球的介紹卡", L.press === "tone" && L.open.includes("tone") && await pickOn(p, "tone"), JSON.stringify(L));
    await sleep(900); const tr2 = await p.evaluate(() => window.__hub3d.tagRect("tone")); await p.mouse.click((tr2.x0 + tr2.x1) / 2, (tr2.y0 + tr2.y1) / 2);
    ok("介紹卡開著再點氣球浮標 → 進氣球", await inMode(p, "tone"));
    await backToMenu(p);
    // 拉近（滾輪）≥ 1.25 倍：全部展開；拉回 1 倍：收回去（新的那個還開著）
    await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, -200); await sleep(700);
    L = await lod();
    ok("拉近 ≥ 1.25 倍：主島浮標全部展開名字", L.zoom >= 1.25 && L.near && ["fish", "order", "build", "hunt", "match", "tone", "whack", "frog", "bubble", "gacha"].every(m => L.open.includes(m)), JSON.stringify(L));
    await p.mouse.wheel(0, 200); await sleep(700); L = await lod();
    ok("拉回 1 倍：名字全部收回去", Math.abs(L.zoom - 1) < 0.02 && !L.near && JSON.stringify(L.open) === "[]", JSON.stringify(L));
    // 拉遠到最遠（0.5 倍）：圖示縮小、三座島都看得到
    for (let k = 0; k < 4; k++) { await p.mouse.wheel(0, 600); await sleep(150); } await sleep(700);
    L = await lod();
    const far = await p.evaluate(() => { const h = window.__hub3d, inV = q => q && q.x > 0 && q.x < innerWidth && q.y > 0 && q.y < innerHeight, r = document.querySelector(".hub-tag[data-mode=order]").getBoundingClientRect();
      return { main: ["fish", "order", "tone", "hunt"].every(m => inV(h.screenOf(m))), town: ["police", "hospital"].every(id => inV(h.civicScreen(id))), rb: ["bearHouse", "bunnyHouse", "pigHouse"].every(id => inV(h.rbScreen(id))), tagW: Math.round(r.width), tagH: Math.round(r.height) }; });
    ok("滾輪拉遠：最遠到 0.5 倍（以前 0.8）", Math.abs(L.zoom - 0.5) < 0.001 && L.far, JSON.stringify(L));
    ok("拉到最遠：主島、歸仁區、彩虹島都在畫面裡", far.main && far.town && far.rb, JSON.stringify(far));
    ok("拉到最遠：圓形圖示縮小一點（約 0.78 倍）", far.tagW < 7 * vmin && far.tagW > 5 * vmin, JSON.stringify(far));
    // 最遠時往一邊拖很遠：拖不到整片海（主島中間還在畫面裡）
    await p.mouse.move(200, 200); await p.mouse.down(); for (let k = 1; k <= 10; k++) { await p.mouse.move(200 + k * 80, 200 + k * 50); await sleep(30); } await p.mouse.up(); await sleep(500);
    const dragged = await p.evaluate(() => { const q = window.__hub3d.screenOf("order"); return { q, lod: window.__hub3d.lod() }; });
    ok("拉到最遠往右下拖很遠：島還在畫面裡（可拖範圍收小）", dragged.q.x > 0 && dragged.q.x < W && dragged.q.y > 0 && dragged.q.y < H, JSON.stringify(dragged));
    // 最遠時點建築：照樣開介紹卡（鏡頭不縮放）、再點進遊戲
    let zf = null, sf0 = null;
    for (let k = 0; k < 3 && !zf; k++) { sf0 = await spot(p, "fish"); if (sf0) { await p.mouse.click(sf0.x, sf0.y); if (await pickOn(p, "fish")) { await sleep(900); zf = await lod(); } } else await sleep(500); }
    ok("拉到最遠點釣魚建築 → 介紹卡、鏡頭沒有縮放（還是 0.5 倍）", !!zf && Math.abs(zf.zoom - 0.5) < 0.01, JSON.stringify(zf));
    sf0 = await spot(p, "fish"); if (sf0) await p.mouse.click(sf0.x, sf0.y);
    ok("拉到最遠再點釣魚建築 → 進釣魚", !!sf0 && await inMode(p, "fish"));
    await backToMenu(p);
    ok("浮標精簡：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 1f. 介紹卡（10-12 阿葉：「點下去想看是哪些關卡時就直接進入了，沒辦法決定是不是要玩這關」）=====
  // 點一下＝介紹卡（名字、說明、星星、貓頭鷹唸名字）不進遊戲、鏡頭把那棟移到卡片上面（不縮放）；點別棟＝換卡；拖曳／點空白／✕＝收卡；
  // 介紹卡開著貓頭鷹淡出；點介面上別的按鈕也收卡；換島收卡
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, stars: 25, eggs: 2, query: "debug&novoice&night=0&weather=sunny" });
    await ready(p); await p.evaluate(() => { window.__hub3d.events(false); window.__zyB.best.whack = 2; }); await sleep(300);   // 地鼠最佳 2 顆星（直接改記憶體裡的存檔）
    await p.evaluate(() => { window.__spoken = []; });
    const zoom0 = (await p.evaluate(() => window.__hub3d.lod())).zoom;
    let sw = await spot(p, "whack"); if (sw) await p.mouse.click(sw.x, sw.y);
    const on1 = await pickOn(p, "whack"); await sleep(1500);
    const c1 = await p.evaluate(() => { const c = document.getElementById("pick"), r = c.getBoundingClientRect(), s = window.__hub3d.screenOf("whack"), t = document.querySelector(".hub-tag[data-mode=whack]"), tr = t.getBoundingClientRect();
      return { name: document.getElementById("pkName").textContent, desc: document.getElementById("pkDesc").textContent, ico: document.getElementById("pkIco").textContent, stars: document.querySelectorAll("#pkMeta .pk-stars i").length, lit: document.querySelectorAll("#pkMeta .pk-stars i.on").length,
        go: getComputedStyle(document.getElementById("pkGo")).display, top: Math.round(r.top), bot: Math.round(r.bottom), bx: Math.round(s.x), by: Math.round(s.y), tag: [Math.round(tr.left), Math.round(tr.top), Math.round(tr.right), Math.round(tr.bottom)],
        sel: t.classList.contains("sel"), open: t.classList.contains("open"), owl: getComputedStyle(document.getElementById("guide")).opacity, mode: window.__zy.mode, zoom: window.__hub3d.lod().zoom, spoken: window.__spoken.map(x => x.text) }; });
    ok("介紹卡：點一下地鼠 → 卡片寫「打地鼠」＋一句說明＋🔨＋最佳星星（3 格亮 2 格）＋開始鈕，沒有進遊戲", on1 && c1.name === "打地鼠" && c1.desc.includes("地鼠") && c1.ico === "🔨" && c1.stars === 3 && c1.lit === 2 && c1.go !== "none" && c1.mode === null, JSON.stringify(c1));
    ok("介紹卡：貓頭鷹唸「打地鼠！」", c1.spoken.includes("打地鼠！"), JSON.stringify(c1.spoken));
    ok("介紹卡：地鼠的浮標展開名字＋黃框", c1.sel && c1.open);
    ok("介紹卡：鏡頭把地鼠移到卡片上面（建築、浮標都在卡片上方、畫面內）、沒有縮放", c1.by < c1.top && c1.tag[3] < c1.top && c1.tag[1] > 0 && c1.tag[0] >= 0 && c1.tag[2] <= 1180 && Math.abs(c1.zoom - zoom0) < 0.01, JSON.stringify(c1));
    ok("介紹卡開著：貓頭鷹淡出（不擋卡片）", +c1.owl < 0.1, c1.owl);
    await shot(p, "pick-1180x820");
    // 點別棟（點餐）＝換成點餐的卡
    let so = await spot(p, "order"); if (so) await p.mouse.click(so.x, so.y);
    const sw2 = await pickOn(p, "order");
    ok("介紹卡開著點別棟（點餐）→ 換成點餐的卡、地鼠的黃框拿掉、沒有進遊戲", sw2 && (await p.evaluate(() => document.getElementById("pkName").textContent)) === "點餐" && await p.evaluate(() => !document.querySelector(".hub-tag[data-mode=whack]").classList.contains("sel") && document.querySelector(".hub-tag[data-mode=order]").classList.contains("sel")) && (await p.evaluate(() => window.__zy.mode)) === null);
    // 拖曳地圖 → 收卡（從小島畫布上一個空的地方開始拖：不能按在浮標上）
    await sleep(800);
    const d0 = await p.evaluate(() => { for (const [x, y] of [[0.5, 0.3], [0.4, 0.25], [0.6, 0.25], [0.3, 0.4], [0.7, 0.4], [0.5, 0.15], [0.2, 0.25], [0.8, 0.25]]) { const X = innerWidth * x, Y = innerHeight * y, e = document.elementFromPoint(X, Y); if (e && e.tagName === "CANVAS") return { x: X, y: Y }; } return { x: innerWidth / 2, y: innerHeight * 0.3 }; });
    await p.mouse.move(d0.x, d0.y); await p.mouse.down(); for (let k = 1; k <= 6; k++) { await p.mouse.move(d0.x + k * 14, d0.y + k * 6); await sleep(40); } await p.mouse.up();
    ok("拖曳地圖 → 介紹卡收起來", await pickOff(p));
    ok("收卡後貓頭鷹回來（淡出拿掉）", await p.evaluate(() => !document.body.classList.contains("pick-on")));
    // 點空白處（海）→ 收卡
    sw = await spot(p, "whack"); if (sw) await p.mouse.click(sw.x, sw.y); await pickOn(p, "whack"); await sleep(1200);
    const sea = await p.evaluate(() => { for (const [x, y] of [[0.5, 0.12], [0.35, 0.1], [0.65, 0.12], [0.2, 0.3], [0.8, 0.3]]) { const X = innerWidth * x, Y = innerHeight * y, e = document.elementFromPoint(X, Y); if (e && e.tagName === "CANVAS" && window.__hub3d.hitAt(X, Y) === null) return { x: X, y: Y }; } return null; });
    if (sea) await p.mouse.click(sea.x, sea.y);
    ok("點空白處（海）→ 介紹卡收起來", !!sea && await pickOff(p), JSON.stringify(sea));
    // ✕ → 收卡
    sw = await spot(p, "whack"); if (sw) await p.mouse.click(sw.x, sw.y); await pickOn(p, "whack"); await sleep(700);
    const xb = await p.evaluate(() => { const r = document.getElementById("pkClose").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
    await p.mouse.click(xb.x, xb.y);
    ok("按 ✕ → 介紹卡收起來（✕ ≥ 44px）", await pickOff(p) && xb.w >= 44, JSON.stringify(xb));
    // 點介面上別的按鈕（🗺️ 以外的：把手）＝收卡
    sw = await spot(p, "whack"); if (sw) await p.mouse.click(sw.x, sw.y); await pickOn(p, "whack"); await sleep(500);
    const hb = await p.evaluate(() => { const r = document.getElementById("hudRBtn").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await p.mouse.click(hb.x, hb.y);
    ok("介紹卡開著點上方把手 → 介紹卡收起來", await pickOff(p));
    await p.evaluate(() => document.getElementById("hudRBtn").click()); await sleep(300);
    // 換島 → 收卡
    sw = await spot(p, "whack"); if (sw) await p.mouse.click(sw.x, sw.y); await pickOn(p, "whack"); await sleep(500);
    await p.evaluate(() => document.getElementById("rainbowBtn").click());
    ok("介紹卡開著按 🌈 換島 → 介紹卡收起來", await pickOff(p));
    await sleep(2200); await p.evaluate(() => document.getElementById("rainbowBtn").click()); await sleep(2200);
    // 介紹卡的「再點一次」要是同一棟：點地鼠、再點地鼠的浮標（同一棟）＝開始
    sw = await spot(p, "whack"); if (sw) await p.mouse.click(sw.x, sw.y); await pickOn(p, "whack"); await sleep(900);
    const tw = await p.evaluate(() => window.__hub3d.tagRect("whack")); await p.mouse.click((tw.x0 + tw.x1) / 2, (tw.y0 + tw.y1) / 2);
    ok("點地鼠建築開卡，再點地鼠的浮標（同一棟）→ 進地鼠", await inMode(p, "whack"));
    await backToMenu(p);
    ok("回選單：介紹卡是收著的", await p.evaluate(() => document.getElementById("pick").classList.contains("hidden") && !window.__hub3d.sel()));
    ok("介紹卡：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 1g. 點遠方的島／橋頭路牌（10-12 阿葉：「進入彩虹島除了點左邊按鈕，地圖上也要有地方可以點擊進入」）=====
  // 主島點遠方彩虹島＝飛過去；點路牌＝飛過去；在彩虹島點遠方主島＝回去；在彩虹島點建築＝介紹卡；還沒開的島＝說上鎖台詞、不動
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, stars: 25, eggs: 2, query: "debug&novoice&night=0&weather=sunny" });
    await ready(p); await p.evaluate(() => window.__hub3d.events(false)); await sleep(300);
    const place = () => p.evaluate(() => window.__hub3d.place());
    const settle = () => sleep(2600);   // 飛過去約 1.5 秒（軟體繪圖慢一點）
    // 找「點下去會點到那座島」的位置：島中心附近找一個 canvas 點、hitAt＝isle:<p>
    const isleSpot = (p, id) => p.evaluate(id => { const h = window.__hub3d, c = h.isleScreen(id);
      for (let r = 0; r <= 320; r += 10) for (let a = 0; a < 360; a += r ? 20 : 360) { const x = c.x + Math.cos(a * Math.PI / 180) * r, y = c.y + Math.sin(a * Math.PI / 180) * r;
        if (x < 8 || y < 8 || x > innerWidth - 8 || y > innerHeight - 8) continue; const e = document.elementFromPoint(x, y); if (e && e.tagName === "CANVAS" && h.hitAt(x, y) === "isle:" + id) return { x, y }; }
      return null; }, id);
    const sgn = await p.evaluate(() => window.__hub3d.signs());
    ok("路牌：主島兩支（往彩虹島、往歸仁區）、彩虹島一支、歸仁區一支；主島的看得到、別座島的藏著", sgn.length === 4 && sgn.filter(s => s.at === "main" && s.shown).length === 2 && sgn.filter(s => s.at !== "main" && !s.shown).length === 2, JSON.stringify(sgn));
    ok("路牌：20 張貼紙＝彩虹島開了（沒鎖）、歸仁區還沒開（🔒）", !sgn.find(s => s.go === "rainbow").locked && sgn.find(s => s.go === "town").locked, JSON.stringify(sgn));
    // 主島：點遠方的彩虹島（地面）→ 飛過去
    let rs = await isleSpot(p, "rainbow");
    ok("主島：找得到彩虹島上點了會飛過去的位置", !!rs, JSON.stringify(rs));
    if (rs) await p.mouse.click(rs.x, rs.y);
    await p.waitForFunction(() => window.__hub3d.place() === "rainbow", null, { timeout: 4000 }).catch(() => {});
    ok("主島點遠方的彩虹島 → 飛到彩虹島", (await place()) === "rainbow");
    await settle();
    await shot(p, "isle-rainbow-1180x820");
    // 彩虹島：點島上的建築（配送站）＝介紹卡（不是飛走）
    const sd = await spot(p, "deliver"); if (sd) await p.mouse.click(sd.x, sd.y);
    ok("彩虹島：點配送站 → 配送站的介紹卡、還在彩虹島", !!sd && await pickOn(p, "deliver") && (await place()) === "rainbow" && (await p.evaluate(() => document.getElementById("pkName").textContent)) === "彩虹配送站", JSON.stringify(sd));
    await p.evaluate(() => document.getElementById("pkClose").click()); await pickOff(p); await sleep(500);
    // 彩虹島：路牌「回小島」看得到；點遠方的主島 → 回去
    const sgR = (await p.evaluate(() => window.__hub3d.signs())).find(s => s.at === "rainbow");
    ok("彩虹島：「🏝️ 回小島」路牌看得到、在畫面內", sgR.shown && sgR.rect.x0 >= 0 && sgR.rect.x1 <= 1180 && sgR.rect.y0 >= 0 && sgR.rect.y1 <= 820, JSON.stringify(sgR));
    const ms = await isleSpot(p, "main");
    ok("彩虹島：找得到遠方主島點了會回去的位置", !!ms, JSON.stringify(ms));
    if (ms) await p.mouse.click(ms.x, ms.y);
    await p.waitForFunction(() => window.__hub3d.place() === "main", null, { timeout: 4000 }).catch(() => {});
    ok("彩虹島點遠方的主島 → 回主島", (await place()) === "main");
    await settle();
    // 主島：點「🌈 彩虹島」路牌 → 飛過去；到了點「🏝️ 回小島」路牌 → 回來
    const tagOf = go => p.evaluate(go => { const s = window.__hub3d.signs().find(q => q.go === go && q.shown); return s && s.rect; }, go);
    let r = await tagOf("rainbow"); if (r) await p.mouse.click((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    await p.waitForFunction(() => window.__hub3d.place() === "rainbow", null, { timeout: 4000 }).catch(() => {});
    ok("主島點「🌈 彩虹島」路牌 → 飛到彩虹島", !!r && (await place()) === "rainbow", JSON.stringify(r));
    await settle();
    r = await tagOf("main"); if (r) await p.mouse.click((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    await p.waitForFunction(() => window.__hub3d.place() === "main", null, { timeout: 4000 }).catch(() => {});
    ok("彩虹島點「🏝️ 回小島」路牌 → 回主島", !!r && (await place()) === "main", JSON.stringify(r));
    await settle();
    // 歸仁區還沒開（20 張 < 30）：點路牌、點遠方的歸仁區 → 貓頭鷹說上鎖台詞、不動
    await p.evaluate(() => { window.__spoken = []; });
    r = await tagOf("town"); if (r) await p.mouse.click((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2); await sleep(1200);
    const lk1 = await p.evaluate(() => ({ place: window.__hub3d.place(), off: window.__hub3d.rainbow().off, text: document.getElementById("guideText").textContent, spoken: window.__spoken.map(x => x.text) }));
    ok("歸仁區還沒開：點「🏙️ 歸仁區 🔒」路牌 → 不飛過去、貓頭鷹說「收集更多貼紙，就能蓋好囉！」", !!r && lk1.place === "main" && Math.abs(lk1.off[0]) + Math.abs(lk1.off[1]) < 0.05 && lk1.spoken.includes("收集更多貼紙，就能蓋好囉！") && lk1.text.includes("歸仁區"), JSON.stringify(lk1));
    await sleep(800); await p.evaluate(() => { window.__spoken = []; });
    const ts = await isleSpot(p, "town"); if (ts) await p.mouse.click(ts.x, ts.y); await sleep(1200);
    const lk2 = await p.evaluate(() => ({ place: window.__hub3d.place(), spoken: window.__spoken.map(x => x.text) }));
    ok("歸仁區還沒開：點遠方的歸仁區 → 不飛過去、說上鎖台詞", !!ts && lk2.place === "main" && lk2.spoken.includes("收集更多貼紙，就能蓋好囉！"), JSON.stringify({ ts, lk2 }));
    ok("點遠方的島／路牌：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // 彩虹島還沒開（10 張 < 20）：點路牌、點遠方的彩虹島 → 說「收集更多貼紙，就能去彩虹島囉！」、不動
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 10, stars: 5, query: "debug&novoice&night=0&weather=sunny" });
    await ready(p); await p.evaluate(() => window.__hub3d.events(false)); await sleep(300);
    const sgn = await p.evaluate(() => window.__hub3d.signs()), sr = sgn.find(s => s.go === "rainbow");
    ok("彩虹島還沒開：「🌈 彩虹島」路牌有 🔒", sr.locked && sr.shown, JSON.stringify(sr));
    await p.evaluate(() => { window.__spoken = []; });
    await p.mouse.click((sr.rect.x0 + sr.rect.x1) / 2, (sr.rect.y0 + sr.rect.y1) / 2); await sleep(1200);
    const a = await p.evaluate(() => ({ place: window.__hub3d.place(), off: window.__hub3d.rainbow().off, spoken: window.__spoken.map(x => x.text), text: document.getElementById("guideText").textContent }));
    ok("彩虹島還沒開：點路牌 → 不飛過去、貓頭鷹說「收集更多貼紙，就能去彩虹島囉！」", a.place === "main" && Math.abs(a.off[0]) + Math.abs(a.off[1]) < 0.05 && a.spoken.includes("收集更多貼紙，就能去彩虹島囉！") && a.text.includes("彩虹島"), JSON.stringify(a));
    await sleep(800); await p.evaluate(() => { window.__spoken = []; });
    const rs = await p.evaluate(() => { const h = window.__hub3d, c = h.isleScreen("rainbow");
      for (let r = 0; r <= 320; r += 10) for (let a = 0; a < 360; a += r ? 20 : 360) { const x = c.x + Math.cos(a * Math.PI / 180) * r, y = c.y + Math.sin(a * Math.PI / 180) * r;
        if (x < 8 || y < 8 || x > innerWidth - 8 || y > innerHeight - 8) continue; const e = document.elementFromPoint(x, y); if (e && e.tagName === "CANVAS" && h.hitAt(x, y) === "isle:rainbow") return { x, y }; } return null; });
    if (rs) await p.mouse.click(rs.x, rs.y); await sleep(1200);
    const b = await p.evaluate(() => ({ place: window.__hub3d.place(), spoken: window.__spoken.map(x => x.text) }));
    ok("彩虹島還沒開：點遠方的彩虹島 → 不飛過去、說上鎖台詞", !!rs && b.place === "main" && b.spoken.includes("收集更多貼紙，就能去彩虹島囉！"), JSON.stringify({ rs, b }));
    ok("彩虹島還沒開：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 2. 直式／4:3 也框得好（浮標平常的樣子、一棟一棟按住展開都不能被擋）=====
  for (const [w, h] of [[820, 1180], [1024, 768]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 20, stars: 25, eggs: 2, query: "debug" });
    await ready(p);
    const clash = () => p.evaluate(() => { const ob = ["#menu > h1", "#menu > .menu-bottom", "#guide img", "#guideText", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn"].map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
      const bad = []; for (const t of document.querySelectorAll(".hub-tag:not(.civic):not(.rb)")) { const q = t.getBoundingClientRect(); if (q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight || ob.some(o => q.left < o.right && q.right > o.left && q.top < o.bottom && q.bottom > o.top)) bad.push(t.dataset.mode); }
      return { hub: document.body.classList.contains("hub3d"), bad, fit: window.__hub3d.fitOk }; });
    const r = await clash();
    ok(`${w}×${h}：3D 選單出現、浮標沒被擋`, r.hub && r.fit && r.bad.length === 0, JSON.stringify(r));
    const badOpen = [];
    for (const m of ["fish", "order", "build", "hunt", "match", "tone", "whack", "frog", "bubble", "gacha"]) { await p.evaluate(m => window.__hub3d.openOne(m), m); await opened(p, m); const c = await blockedOpen(p, m); if (c.length) badOpen.push(m + ":" + c.join("/")); }
    await p.evaluate(() => window.__hub3d.openOne(null));
    await p.waitForFunction(() => [...document.querySelectorAll(".hub-tag:not(.civic):not(.rb):not(.fresh)")].every(t => !t.classList.contains("open") && t.querySelector(".ht-more").getBoundingClientRect().width < 1), null, { timeout: 5000 }).catch(() => {}); await sleep(400);   // 收回去了再點建築
    ok(`${w}×${h}：一棟一棟按住展開名字，也沒被擋、在畫面內`, badOpen.length === 0, badOpen.join(","));
    // 介紹卡（10-12）：點一下＝卡片在下面、那棟移到卡片上面看得到；再點一下＝進遊戲
    const sb = await spot(p, "build"); if (sb) await p.mouse.click(sb.x, sb.y);
    const cardOk = !!sb && await pickOn(p, "build"); await sleep(1600);
    const cv = await p.evaluate(() => { const c = document.getElementById("pick").getBoundingClientRect(), s = window.__hub3d.screenOf("build"), t = window.__hub3d.tagRect("build");
      return { card: [Math.round(c.left), Math.round(c.top), Math.round(c.right), Math.round(c.bottom)], b: [Math.round(s.x), Math.round(s.y)], tag: [Math.round(t.x0), Math.round(t.y0), Math.round(t.x1), Math.round(t.y1)], inCard: c.left >= 0 && c.right <= innerWidth && c.bottom <= innerHeight };
    });
    ok(`${w}×${h}：點積木一下 → 介紹卡在畫面下方、積木（建築＋展開的浮標）在卡片上面、都在畫面內`, cardOk && cv.inCard && cv.b[1] < cv.card[1] && cv.tag[3] < cv.card[1] && cv.tag[1] > 0 && cv.tag[0] >= 0 && cv.tag[2] <= w && cv.b[0] > 0 && cv.b[0] < w, JSON.stringify(cv));
    await p.evaluate(() => document.getElementById("pkClose").click()); await pickOff(p); await sleep(500);
    ok(`${w}×${h}：點積木建築兩下 → 進積木`, await tap2(p, "build"));
    ok(`${w}×${h}：沒有錯誤`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // ===== 3. ?no3d → 退回卡片選單 =====
  {
    const { ctx, p, errs } = await openGame(browser, { stickers: 20, query: "debug&no3d" });
    const st = await p.evaluate(() => ({ hub: document.body.classList.contains("hub3d"), canvas: !!document.querySelector(".hub-stage canvas"), cardsW: document.querySelector("#menu > .mode-cards").getBoundingClientRect().width, lib: !!window.__hub3d }));
    ok("?no3d：沒有載 3D、卡片選單看得到", !st.hub && !st.canvas && !st.lib && st.cardsW > 200, JSON.stringify(st));
    const c = await p.evaluate(() => { const r = document.querySelector('.mode-card[data-mode=fish]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.click(c.x, c.y);
    ok("?no3d：點卡片照常進遊戲", await p.waitForFunction(() => !document.getElementById("fish").classList.contains("hidden"), null, { timeout: 8000 }).then(() => true, () => false));
    ok("?no3d：沒有錯誤", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS (${out.length})`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
