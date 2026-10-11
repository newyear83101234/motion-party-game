// 3D 選單小島測試：node tools/zy-test/hub3d.js
// 驗：3D 選單有出現（canvas、卡片視覺隱藏）、點建築投影位置會進那個遊戲、浮標也能點、翻牌先開選張數、
//     點未解鎖建築不會進遊戲、拖曳不算點擊、長按 0.6 秒／拖 15px 也算點、點朋友會唸名字、進遊戲 rAF 停／回選單 rAF 恢復、
//     新玩家（0 張貼紙）五棟上鎖＋手指提示、?no3d 退回卡片選單照常可玩、沒有錯誤、
//     路網全部連通（每棟建築／景點都接到路）、扭蛋機點了會呼叫 onGacha、setPets 30 隻走路不卡（路上最多 12 隻、其他在寵物公園）、
//     setDecor 20 個都擺上去、對向兩隻寵物能交會而過不迴轉、新玩家釣魚浮標有黃框
const { launch, openGame } = require("./lib");
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
    ok("卡片 DOM 還在但看不到", st.cardsW <= 1 && st.cardsOpacity === "0" && (await p.evaluate(() => document.querySelectorAll(".mode-card").length)) === 10);   // 10-12 多了彩虹配送站
    ok("主島 10 個浮標（9 個遊戲＋扭蛋機）", st.tags === 10, String(st.tags));
    const g = await p.evaluate(() => window.__hub3d.graph());
    ok("路網全部連通、9 棟建築＋7 個景點＋新市區 4 棟設施＋彩虹島 5 棟都接到路", g.components === 1 && g.doors.length === 25, JSON.stringify(g));   // 10-12 彩虹島：配送站、服裝店、三戶人家
    await p.waitForFunction(() => window.__hub3d.pets().length >= 6, null, { timeout: 15000 }).catch(() => {});   // 寵物模型在建築之後才抓
    ok("島上的寵物照 setPets 來（eggs 2 → 6 位朋友）", (await p.evaluate(() => window.__hub3d.pets().length)) === 6, JSON.stringify(await p.evaluate(() => window.__hub3d.pets())));
    ok("未解鎖（20 張）：青蛙、泡泡鎖著", JSON.stringify(await p.evaluate(() => window.__hub3d.locked())) === '["frog","bubble"]', JSON.stringify(await p.evaluate(() => window.__hub3d.locked())));
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
    // 點建築 → 進那個遊戲
    const s2 = await spot(p, "fish");
    if (s2) await p.mouse.click(s2.x, s2.y);
    const entered = await p.waitForFunction(() => !document.getElementById("fish").classList.contains("hidden") && document.getElementById("loading").classList.contains("hidden"), null, { timeout: 8000 }).then(() => true, () => false);
    ok("點釣魚建築（滑鼠點投影位置）→ 進釣魚", entered);
    // 進遊戲 → rAF 停
    await sleep(300); const g0 = await frames(p); await sleep(800); const g1 = await frames(p);
    ok("進遊戲後 rAF 停止", g1 === g0 && !(await p.evaluate(() => window.__hub3d.running)), `${g0}→${g1}`);
    await backToMenu(p);
    const m0 = await frames(p); await sleep(700); const m1 = await frames(p);
    ok("回選單後 rAF 恢復", m1 > m0 && (await p.evaluate(() => window.__hub3d.running)), `${m0}→${m1}`);
    // 點另一棟（點餐）
    const so = await spot(p, "order"); if (so) await p.mouse.click(so.x, so.y);
    ok("點點餐建築 → 進點餐", await p.waitForFunction(() => !document.getElementById("order").classList.contains("hidden"), null, { timeout: 8000 }).then(() => true, () => false));
    await backToMenu(p);
    // 點浮標 → 進氣球
    const tr = await p.evaluate(() => window.__hub3d.tagRect("tone"));
    await p.mouse.click((tr.x0 + tr.x1) / 2, (tr.y0 + tr.y1) / 2);
    ok("點浮標（氣球）→ 進氣球", await p.waitForFunction(() => !document.getElementById("tone").classList.contains("hidden"), null, { timeout: 8000 }).then(() => true, () => false));
    await backToMenu(p);
    // 扭蛋機：點建築、點浮標都會呼叫 onGacha（10-11 起＝打開扭蛋機畫面）
    const gachaOpen = () => p.evaluate(() => !document.getElementById("gacha").classList.contains("hidden"));
    const gachaClose = () => p.evaluate(() => document.getElementById("gachaClose").click());
    const sg = await spot(p, "gacha"); if (sg) await p.mouse.click(sg.x, sg.y); await sleep(1200);
    ok("點扭蛋機 → onGacha（打開扭蛋機、沒有進遊戲）", !!sg && await gachaOpen() && (await p.evaluate(() => window.__zy.mode)) === null, JSON.stringify(sg));
    await gachaClose(); await sleep(900);
    const tg = await p.evaluate(() => window.__hub3d.tagRect("gacha")); await p.mouse.click((tg.x0 + tg.x1) / 2, (tg.y0 + tg.y1) / 2); await sleep(1200);
    ok("點扭蛋浮標 → onGacha", await gachaOpen());
    await gachaClose(); await sleep(500);
    // 翻牌：先開選張數
    const sm = await spot(p, "match"); if (sm) await p.mouse.click(sm.x, sm.y); await sleep(700);
    ok("點翻牌建築 → 先跳出選張數", !!sm && await visible(p, "matchPick"), JSON.stringify(sm));
    await p.evaluate(() => document.getElementById("matchPickClose").click()); await sleep(300);
    // 5 歲小孩的點法：按住 0.6 秒、拖著 15px 也要算點（朋友會走過去擋到 → 最多試 3 次）
    const kidTap = async (m, how) => { for (let k = 0; k < 3; k++) { const s = await spot(p, m); if (!s) { await sleep(500); continue; }
      await p.mouse.move(s.x, s.y); await p.mouse.down();
      if (how === "hold") await sleep(600); else await p.mouse.move(s.x + 15, s.y + 3);   // headless 軟體繪圖每次 move 要等一兩幀（0.1～0.3 秒）：一步滑 15px
      await p.mouse.up(); if (await inMode(p, m)) return true; } return false; };
    ok("長按 0.6 秒點積木建築 → 進積木", await kidTap("build", "hold"));
    await backToMenu(p);
    ok("拖著 15px 點點餐建築 → 進點餐", await kidTap("order", "drag"));
    await backToMenu(p);
    // 未解鎖的青蛙：點了不進遊戲，嚮導說還差幾張
    const sl = await spot(p, "frog");
    ok("找得到青蛙建築的點擊位置", !!sl, JSON.stringify(sl));
    if (sl) { await p.mouse.click(sl.x, sl.y); await sleep(1200); }
    ok("點未解鎖建築不會進遊戲", await visible(p, "menu") && !(await visible(p, "frog")) && (await p.evaluate(() => window.__zy.mode)) === null);
    ok("點未解鎖建築：嚮導說還差幾張貼紙", (await p.evaluate(() => document.getElementById("guideText").textContent)).includes("5"), await p.evaluate(() => document.getElementById("guideText").textContent));
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
    ok("新玩家：尋寶／翻牌／氣球／地鼠／青蛙／泡泡都鎖著", JSON.stringify(lk.sort()) === JSON.stringify(["bubble", "frog", "hunt", "match", "tone", "whack"]), JSON.stringify(lk));
    ok("新玩家：鎖著的浮標都有 🔒", await p.evaluate(() => [...document.querySelectorAll(".hub-tag.locked:not(.civic):not(.rb)")].length === 6 && [...document.querySelectorAll(".hub-tag.locked:not(.civic):not(.rb) .ht-lock")].every(e => e.textContent.includes("🔒"))));
    ok("新玩家：只有釣魚浮標有常駐黃框", await p.evaluate(() => { const f = [...document.querySelectorAll(".hub-tag.first")]; return f.length === 1 && f[0].dataset.mode === "fish" && getComputedStyle(f[0]).boxShadow.includes("255, 213, 74"); }));
    const sl = await spot(p, "hunt"); if (sl) { await p.mouse.click(sl.x, sl.y); await sleep(1200); }   // 尋寶在島的上方（新玩家貓頭鷹自我介紹比較長，會蓋到右邊的氣球攤）
    ok("新玩家：點鎖著的尋寶公園不會進遊戲", !!sl && (await p.evaluate(() => window.__zy.mode)) === null, JSON.stringify(sl));
    const sf = await spot(p, "fish"); if (sf) await p.mouse.click(sf.x, sf.y);
    ok("新玩家：點釣魚 → 進釣魚", !!sf && await inMode(p, "fish"));
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
  // ===== 2. 直式／4:3 也框得好 =====
  for (const [w, h] of [[820, 1180], [1024, 768]]) {
    const { ctx, p, errs } = await openGame(browser, { w, h, stickers: 20, stars: 25, eggs: 2, query: "debug" });
    await ready(p);
    const r = await p.evaluate(() => { const ob = ["#menu > h1", "#menu > .menu-bottom", "#guide img", "#guideText", "#homeBtn", "#musicBtn", "#playerBtn", "#playerTag", "#settingsBtn"].map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
      const bad = []; for (const t of document.querySelectorAll(".hub-tag:not(.civic):not(.rb)")) { const q = t.getBoundingClientRect(); if (q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight || ob.some(o => q.left < o.right && q.right > o.left && q.top < o.bottom && q.bottom > o.top)) bad.push(t.dataset.mode); }
      return { hub: document.body.classList.contains("hub3d"), bad, fit: window.__hub3d.fitOk }; });
    ok(`${w}×${h}：3D 選單出現、浮標沒被擋`, r.hub && r.fit && r.bad.length === 0, JSON.stringify(r));
    let inB = false;   // 朋友會剛好走過去擋到 → 最多試 3 次
    for (let k = 0; k < 3 && !inB; k++) { const s = await spot(p, "build"); if (s) { await p.mouse.click(s.x, s.y); inB = await inMode(p, "build"); } else await sleep(500); }
    ok(`${w}×${h}：點積木建築 → 進積木`, inB);
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
