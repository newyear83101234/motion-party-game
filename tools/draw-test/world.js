// 我的世界（js/draw-world.js）瀏覽器測試：獨立 headless Chromium，模擬 iPad 橫向觸控
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1（在 GAME DIY 根目錄）
// 用法：node tools/draw-test/world.js     截圖存到 tools/draw-test/_review/world/
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL_ = process.env.WORLD_URL || "http://127.0.0.1:8765/tools/draw-test/world-harness.html";
const OUT = path.join(__dirname, "_review", "world");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = "") => { results.push((ok ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); console.log(results[results.length - 1]); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findShell() });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !(m.location().url || "").includes("__none")) errs.push("CONSOLE " + m.text().slice(0, 160)); });
  const shot = n => p.screenshot({ path: path.join(OUT, n) });
  const ents = () => p.evaluate(() => __world.entries());
  const st = (expr, arg) => p.evaluate(expr, arg);
  const band = () => st(() => { const L = __world.state.L; return { b0: L.b0, b1: L.b1, W: L.W, H: L.H, dh: L.dh }; });
  const roam = (ms = 8000) => p.waitForFunction(() => __world.state.phase === "roam" && __world.state.frames > 5, null, { timeout: ms });
  const open = (t, o) => p.evaluate(([t, o]) => H.world.open(t, o || {}), [t, o]);
  const sample = async (n, gap) => { const s = []; for (let i = 0; i < n; i++) { s.push(await ents()); await p.waitForTimeout(gap); } return s; };
  // 找一塊沒有角色的空地（點下去會冒點心）
  const freeSpot = () => st(() => {
    const L = __world.state.L, E = __world.entries();
    for (let k = 0; k < 400; k++) {
      const x = L.W * (.08 + Math.random() * .84), y = L.b0 + (L.b1 - L.b0) * (.1 + Math.random() * .8);
      if (!__world.hitAt(x, y) && E.every(e => Math.hypot(e.x - x, e.y - e.h / 2 - y) > 110)) return { x, y };
    }
    return null;
  });

  await p.goto(URL_);
  await p.waitForFunction(() => window.H && H.ready, null, { timeout: 15000 });
  await st(() => localStorage.clear());

  // ── 1. 動物：24 隻上場、背景真圖、徽章、貼紙 ──
  await st(() => { H.stickers.animal = H.stickerUrls("animal"); });   // 8 張，只能擺 6 張
  await open("animal");
  await roam();
  await p.waitForTimeout(2200);   // 出場彈出動畫跑完
  let E = await ents();
  check("動物：30 隻裡隨機挑 24 隻上場", E.length === 24, `n=${E.length}`);
  check("角色是 blob: 網址的 <img>", await st(() => [...document.querySelectorAll("#world .w-mob img")].every(i => i.src.startsWith("blob:"))));
  await p.waitForFunction(() => __world.state.bg === "img", null, { timeout: 5000 }).catch(() => { });
  check("場景背景用真圖（IMAGE/draw/world/animal.jpg）", await st(() => __world.state.bg === "img" && getComputedStyle(document.querySelector("#world .w-img")).backgroundImage.includes("world/animal.jpg")));
  check("貼紙最多擺 6 張當裝飾", await st(() => document.querySelectorAll("#world .w-stk").length) === 6);
  await p.waitForTimeout(800);
  const badges = await st(() => Object.fromEntries([...document.querySelectorAll("#wTabs .w-tab")].map(b => [b.dataset.theme, getComputedStyle(b.querySelector(".w-n")).display === "none" ? "-" : b.querySelector(".w-n").textContent])));
  check("分頁徽章：每個主題住了幾隻", badges.animal === "30" && badges.vehicle === "8" && badges.ocean === "9" && badges.sweets === "10" && Object.keys(badges).length === 6, JSON.stringify(badges));
  await shot("01-animal.png");

  // ── 2. 走路：在地面帶、會動、會彈跳晃動、會翻面、近大遠小、前面疊上層 ──
  let B = await band();
  const S = await sample(14, 180);
  const all = S.flat();
  check("動物都在地面帶（畫面下方約 45%）", all.every(e => e.y >= B.b0 - 1 && e.y <= B.b1 + 1) && B.b0 >= B.H * .45, `b0=${(B.b0 / B.H).toFixed(2)}H b1=${(B.b1 / B.H).toFixed(2)}H`);
  const moved = S[0].filter(e => { const z = S[S.length - 1].find(o => o.id === e.id); return z && Math.abs(z.x - e.x) > 5; }).length;
  check("動物會走動（2.5 秒內多數有移動）", moved >= 8, `moved=${moved}`);
  check("走路時上下彈跳＋左右微晃", all.some(e => e.mode === "walk" && e.hop > 1) && all.some(e => e.mode === "walk" && Math.abs(e.rot) > .5));
  const turned = S[0].filter(e => S.some(s => s.find(o => o.id === e.id && o.dir !== e.dir))).length;
  const flipOk = all.every(e => Math.abs(e.sx) < .99 || Math.sign(e.sx) === e.dir * e.face);
  check("換方向時圖片左右翻轉", turned >= 1 && flipOk, `turned=${turned}`);
  const depthOk = S.every(s => { const a = s.filter(e => e.act !== "jump").sort((p, q) => p.y - q.y); return a.every((e, i) => !i || (e.s >= a[i - 1].s - 1e-6 && e.z >= a[i - 1].z)); });
  check("越下面越大、越前面疊在上層", depthOk);

  // ── 3. 點角色：跳起來轉一圈＋星星＋音符（真的用手指點） ──
  E = await ents();
  const tgt = E.filter(e => e.mode !== "drop").sort((a, b) => b.z - a.z)[0];
  const n0 = await st(() => ({ j: __world.state.stats.jumps, note: H.calls.note.length, stars: H.calls.stars }));
  await p.touchscreen.tap(tgt.x, tgt.y - tgt.h / 2);
  await p.waitForTimeout(260);
  const n1 = await st(() => ({ j: __world.state.stats.jumps, note: H.calls.note.length, stars: H.calls.stars, act: __world.entries().filter(e => e.act === "jump").map(e => ({ id: e.id, rot: e.rot, hop: e.hop })) }));
  check("點角色：牠跳起來轉一圈、放星星和音符", n1.j === n0.j + 1 && n1.act.length === 1 && Math.abs(n1.act[0].rot) > 20 && n1.act[0].hop > 10 && n1.note > n0.note && n1.stars > n0.stars,
    JSON.stringify(n1.act[0] || {}));
  await shot("02-jump.png");
  await p.waitForTimeout(800);
  // 連點同一隻 8 下：只跳一次
  const multi = await st(() => {
    const e = __world.entries().filter(e => !e.act).sort((a, b) => b.z - a.z)[0], j0 = __world.state.stats.jumps;
    for (let i = 0; i < 8; i++) __world.tapAt(e.x, e.y - e.h * .4);
    return __world.state.stats.jumps - j0;
  });
  check("連點同一隻 8 下：只跳一次、不疊加", multi === 1, `jumps+${multi}`);

  // ── 4. 點空地：冒點心、最近的兩隻跑過去吃掉（點心縮掉＋愛心） ──
  await p.waitForTimeout(900);
  const spot = await freeSpot();
  const h0 = await st(() => ({ eaten: __world.state.stats.eaten, hearts: __world.state.stats.hearts }));
  await p.touchscreen.tap(spot.x, spot.y);   // 真的用手指點：走 pointerdown 路徑
  await p.waitForTimeout(60);
  const sn = await st(() => ({ n: document.querySelectorAll("#world .w-snack").length, txt: document.querySelector("#world .w-snack")?.textContent,
    eaters: __world.state.snacks[0]?.eaters.length, seek: __world.entries().filter(e => e.mode === "seek").length }));
  check("點空地：冒出 🍎、最近的兩隻跑過去", sn.n === 1 && sn.txt === "🍎" && sn.eaters === 2 && sn.seek === 2, JSON.stringify(sn));
  await p.waitForTimeout(250);
  await shot("03-snack.png");
  await st(() => { __world.state.speed = 3; });
  await p.waitForFunction(e0 => __world.state.stats.eaten > e0 && !__world.state.snacks.length, h0.eaten, { timeout: 20000 }).catch(() => { });
  await p.waitForTimeout(600);
  const h1 = await st(() => ({ eaten: __world.state.stats.eaten, hearts: __world.state.stats.hearts, left: document.querySelectorAll("#world .w-snack").length, happy: __world.entries().filter(e => e.act === "happy").length }));
  check("點心被吃掉：縮小消失＋愛心", h1.eaten === h0.eaten + 1 && h1.hearts >= h0.hearts + 10 && h1.left === 0, JSON.stringify(h1));
  // 連點空地 10 下：點心最多 4 顆，點天空的點心會掉到地上
  const many = await st(() => {
    const L = __world.state.L, s0 = __world.state.stats.snacks;
    let max = 0;
    for (let i = 0; i < 10; i++) { __world.tapAt(L.W * (.1 + i * .08), L.H * .2); max = Math.max(max, __world.state.snacks.length); }
    return { max, made: __world.state.stats.snacks - s0 };
  });
  await p.waitForTimeout(500);
  const fell = await st(() => __world.state.snacks.every(s => s.y >= __world.state.L.b0 - 1));
  check("連點空地 10 下：點心最多 4 顆、點天空會掉到地上", many.max <= 4 && many.made === 10 && fell, JSON.stringify(many));
  await st(() => { __world.state.speed = 1; });

  // ── 5. 交通工具：沿馬路開、開出去掉頭開回來、車身微震、排氣（用分頁鈕切換） ──
  await p.touchscreen.tap(...await st(() => { const r = document.querySelector("#wTab-vehicle").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  await roam();
  await p.waitForTimeout(2000);
  B = await band();
  const urlInfo = await st(() => ({ live: H.live.size, mobs: __world.state.mobs.length, theme: __world.state.theme }));
  check("點分頁切到交通工具，上一個主題的 object URL 都釋放了", urlInfo.theme === "vehicle" && urlInfo.mobs === 8 && urlInfo.live === 8, JSON.stringify(urlInfo));
  const V1 = await ents(); await p.waitForTimeout(300); const V2 = await ents();
  // 兩次取樣中間剛好從畫面一邊開出去、另一邊開回來的車（x 跳很遠）不算，不然測試會偶發失敗
  const drv = V1.filter(e => e.mode === "drive" && V2.find(o => o.id === e.id && o.mode === "drive" && o.dir === e.dir && Math.abs(o.x - e.x) < B.W * 0.3));
  const fwd = drv.every(e => (V2.find(o => o.id === e.id).x - e.x) * e.dir > 0);
  const laneOk = V2.filter(e => e.mode === "drive").every(e => e.dir > 0 ? e.y >= B.H * .78 - 2 && e.y <= B.H * .93 + 2 : e.y >= B.H * .56 - 2 && e.y <= B.H * .585 + 2);
  check("車子沿馬路橫向開（往右走近車道、往左走遠車道）", drv.length >= 3 && fwd && laneOk, `drive=${drv.length}`);
  check("車身微震", V2.some(e => e.hop > 0 && Math.abs(e.rot) > 0));
  await shot("04-vehicle.png");
  await st(() => { __world.state.speed = 5; });
  await p.waitForFunction(() => __world.state.stats.uturns >= 2 && __world.state.stats.puffs > 0, null, { timeout: 20000 }).catch(() => { });
  check("開出畫面後掉頭從同一邊開回來、會冒排氣", await st(() => __world.state.stats.uturns >= 2 && __world.state.stats.puffs > 0), JSON.stringify(await st(() => __world.state.stats)));
  await p.waitForTimeout(1500);
  const gap = await st(() => {
    const E = __world.entries().filter(e => e.mode === "drive" && e.x > 0 && e.x < innerWidth);
    let worst = 9;
    for (const a of E) for (const b of E) if (a !== b && a.dir === b.dir && Math.abs(a.v - b.v) <= .12) worst = Math.min(worst, Math.abs(a.x - b.x) / ((a.w + b.w) / 2));
    return worst;
  });
  check("同車道跟車：車子不會疊成一團", gap >= .9, `最近兩台中心距／半寬和=${gap.toFixed(2)}`);
  await st(() => { __world.state.speed = 1; });
  const pump = await freeSpot();
  await st(([x, y]) => __world.tapAt(x, y), [pump.x, pump.y]);
  check("馬路上點空地冒 ⛽", await st(() => document.querySelector("#world .w-snack")?.textContent === "⛽"));

  // ── 6. 海底：整片水裡游、上下波浪、冒泡泡、沒有影子 ──
  await open("ocean");
  await roam();
  await p.waitForTimeout(1800);
  B = await band();
  await st(() => { __world.state.speed = 2; });
  const O = await sample(10, 200);
  const of = O.flat();
  check("魚游在整片水裡（有的游得比地面帶高）", of.every(e => e.y >= B.b0 - B.H * .03 - 1 && e.y <= B.b1 + B.H * .03 + 1) && of.some(e => e.y < B.H * .5) && B.b0 < B.H * .4,
    `b0=${(B.b0 / B.H).toFixed(2)}H`);
  check("魚上下波浪游", of.some(e => e.wy > 2) && of.some(e => e.wy < -2));
  await p.waitForFunction(() => __world.state.stats.bubbles > 0 && document.querySelector("#world .w-bub"), null, { timeout: 15000 }).catch(() => { });
  check("魚偶爾冒泡泡", await st(() => __world.state.stats.bubbles > 0), `bubbles=${await st(() => __world.state.stats.bubbles)}`);
  check("海底沒有地上的影子", await st(() => getComputedStyle(document.querySelector("#world .w-shadow")).display === "none"));
  await st(() => { __world.state.speed = 1; });
  await shot("05-ocean.png");

  // ── 7. 公主：飄浮＋亮晶晶；甜點：用跳的；恐龍：重步伐＋ImageBitmap ──
  await open("fairy");
  await roam(); await p.waitForTimeout(2000);
  const F = (await sample(4, 250)).flat();
  check("公主主題：腳不著地、輕輕上下漂浮", F.every(e => e.wy < -1) && new Set(F.map(e => Math.round(e.wy))).size > 3);
  await p.waitForFunction(() => __world.state.stats.sparkles > 0, null, { timeout: 6000 }).catch(() => { });
  check("公主主題：偶爾冒亮晶晶", await st(() => __world.state.stats.sparkles > 0));
  await shot("06-fairy.png");
  const ratio = list => Math.max(0, ...list.filter(e => e.mode === "walk" || e.mode === "seek").map(e => e.hop / (e.h / e.s)));
  const animalBob = ratio(all);
  await open("sweets");
  await roam(); await p.waitForTimeout(2000);
  const SW = (await sample(16, 120)).flat();
  check("糖果國用跳的前進（彈跳比動物走路大很多）", ratio(SW) > .18 && ratio(SW) > animalBob * 3, `sweets=${ratio(SW).toFixed(2)} animal=${animalBob.toFixed(2)}`);
  await shot("07-sweets.png");
  await open("dino");
  await roam(); await p.waitForTimeout(1600);
  B = await band();
  const D = await ents();
  check("恐龍在地面帶走動；ImageBitmap 角色也能上場", D.length === 6 && D.every(e => e.y >= B.b0 - 1 && e.y <= B.b1 + 1) && D.filter(e => e.tag === "CANVAS").length === 1 && await st(() => H.live.size) === 5);
  await shot("08-dino.png");

  // ── 8. 剛畫完的角色從天上飛下來 ──
  await open("animal", { arrive: "animal-7" });
  const a0 = await st(() => ({ phase: __world.state.phase, hero: __world.entries().find(e => e.id === "animal-7"), tap: __world.tapAt(500, 600), trail: H.calls.trail }));
  check("arrive：剛畫完的那隻一定上場、從畫面上方外面出發", a0.phase === "arrive" && a0.hero && a0.hero.mode === "drop" && a0.hero.y < 0 && a0.tap === null, JSON.stringify({ y: a0.hero?.y }));
  await p.waitForTimeout(700);
  await shot("09-arrive.png");
  const a1 = await st(() => {
    const E = __world.entries(), h = E.find(e => e.id === "animal-7");
    const w = E.filter(e => e.id !== h.id && e.mode === "watch");
    return { watch: w.length, facing: w.filter(e => Math.abs(h.x - e.x) < 25 || Math.sign(h.x - e.x) === e.dir).length, trail: H.calls.trail };
  });
  check("飛下來時帶星星尾巴，其他角色停下來轉頭看牠", a1.watch === 23 && a1.facing === 23 && a1.trail > a0.trail + 10, JSON.stringify(a1));
  await p.waitForFunction(() => __world.state.phase === "arrive" && __world.entries().find(e => e.id === "animal-7").act === "land", null, { timeout: 6000 }).catch(() => { });
  await p.waitForTimeout(250);
  check("落地彈跳，大家開心小跳", await st(() => __world.entries().find(e => e.id === "animal-7").act === "land" && __world.state.stats.happy >= 23 && H.calls.chime > 0 && H.calls.sfx.includes("magic")));
  await shot("10-land.png");
  await roam(8000).catch(() => { });
  await p.waitForTimeout(400);
  B = await band();
  const a2 = await st(() => ({ phase: __world.state.phase, hero: __world.entries().find(e => e.id === "animal-7"), moving: __world.entries().filter(e => e.mode === "walk").length }));
  check("動畫結束後牠在地面帶，大家開始一起逛", a2.phase === "roam" && a2.hero.y >= B.b0 - 1 && a2.hero.y <= B.b1 + 1 && a2.hero.mode !== "drop" && a2.moving > 0, JSON.stringify({ y: a2.hero.y, mode: a2.hero.mode }));

  // ── 9. 視窗大小改變：位置照比例重算 ──
  await p.setViewportSize({ width: 1366, height: 1024 });
  await p.waitForTimeout(500);
  B = await band();
  E = await ents();
  check("視窗變大（1366×1024）：仍在新的地面帶、角色跟著變大", B.H === 1024 && E.every(e => e.y >= B.b0 - 1 && e.y <= B.b1 + 1 && e.x >= 0 && e.x <= B.W), `H=${B.H}`);
  await shot("11-ipad-1366.png");
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.waitForTimeout(400);

  // ── 10. 背景沒圖：退回漸層 ──
  await st(() => { H.noBg = true; });
  await open("dino");
  await roam(); await p.waitForTimeout(900);
  check("背景圖讀不到：退回漸層背景", await st(() => __world.state.bg === "grad" && !document.querySelector("#world .w-img").classList.contains("on") && getComputedStyle(document.querySelector("#world .w-bg")).backgroundImage.includes("gradient")));
  await shot("12-fallback.png");
  await st(() => { H.noBg = false; });

  // ── 11. 空世界：吉祥物揮手＋中間會跳的大畫筆鈕；不跑動畫迴圈 ──
  await st(() => { H.counts.fairy = 0; });
  await open("fairy");
  await p.waitForTimeout(700);
  const em = await st(() => {
    const d = document.querySelector("#wDraw").getBoundingClientRect(), m = document.querySelector("#world .w-mascot").getBoundingClientRect();
    return { empty: document.querySelector("#world").classList.contains("w-isempty"), phase: __world.state.phase, raf: __world.state.raf, dx: (d.x + d.width / 2) / innerWidth, dy: (d.y + d.height / 2) / innerHeight, mw: m.width, ml: m.right / innerWidth, w: d.width };
  });
  check("空世界：吉祥物在中間、旁邊一顆會跳的大畫筆鈕、沒有在跑動畫", em.empty && em.phase === "empty" && !em.raf && em.mw > 100 && em.dx > .5 && em.dx < .75 && em.dy > .35 && em.dy < .65 && em.w >= 140, JSON.stringify(em));
  await shot("13-empty.png");
  await p.tap("#wDraw", { force: true });   // 這顆一直在跳，不會「穩定」
  await p.waitForTimeout(300);
  check("按大畫筆鈕：回首頁（帶著目前主題）", await st(() => H.calls.home.at(-1) === "fairy" && document.querySelector("#home").classList.contains("on") && !__world.state.open));
  await st(() => { H.counts.fairy = 7; });

  // ── 12. 關閉：rAF 停止、object URL 全部釋放；被主程式切走畫面也會自己停 ──
  const ids1 = await st(async () => { await H.world.open("animal"); return __world.entries().map(e => e.id).sort().join(); });
  const ids2 = await st(async () => { await H.world.open("animal"); return __world.entries().map(e => e.id).sort().join(); });
  check("角色超過 24 隻：每次打開換一批", ids1 !== ids2 && ids2.split(",").length === 24);
  await roam();
  await p.waitForTimeout(500);
  const live0 = await st(() => H.live.size);
  await st(() => H.world.close());
  const f0 = await st(() => __world.state.frames);
  await p.waitForTimeout(400);
  const c1 = await st(() => ({ frames: __world.state.frames, raf: __world.state.raf, live: H.live.size, mobs: document.querySelectorAll("#world .w-mob").length }));
  check("close：rAF 停止、object URL 全部釋放、角色清空", live0 === 24 && c1.frames === f0 && !c1.raf && c1.live === 0 && c1.mobs === 0, JSON.stringify({ live0, ...c1 }));
  await open("vehicle");
  await roam();
  await st(() => H.deps.show("home"));
  await p.waitForTimeout(300);
  check("主程式直接切走畫面：動畫自己停、URL 釋放", await st(() => !__world.state.open && !__world.state.raf && H.live.size === 0));
  await open("dino");
  await roam();
  await p.tap("#wHome");
  await p.waitForTimeout(300);
  check("按 🏠：回首頁、世界關掉", await st(() => H.calls.home.at(-1) === "dino" && document.querySelector("#home").classList.contains("on") && !__world.state.open && H.live.size === 0));

  // ── 13. 連續快速切分頁：只留最後一個主題，不漏 URL ──
  await st(() => { H.delay = 120; H.world.open("animal"); H.world.open("vehicle"); H.world.open("ocean"); });
  await roam();
  await p.waitForTimeout(400);
  const rs = await st(() => ({ theme: __world.state.theme, ids: __world.entries().map(e => e.id), live: H.live.size, tabOn: document.querySelector("#wTabs .on")?.dataset.theme }));
  check("連續快速切三個主題：只留最後一個、URL 不漏", rs.theme === "ocean" && rs.ids.length === 9 && rs.ids.every(i => i.startsWith("ocean-")) && rs.live === 9 && rs.tabOn === "ocean", JSON.stringify({ ...rs, ids: rs.ids.length }));
  await st(() => { H.delay = 0; });

  // ── 14. 壞掉的 localStorage：自己復原；localStorage 整個不能用也照跑 ──
  await st(() => { H.world.close(); localStorage.setItem("draw-world", "{broken"); });
  await open("animal");
  await roam(); await p.waitForTimeout(1200);
  const ls = await st(() => ({ hint: !!document.querySelector("#world .w-hint"), saved: localStorage.getItem("draw-world") }));
  check("localStorage 壞資料：自己復原、照樣顯示點擊提示", ls.hint && ls.saved === '{"hint":1}', JSON.stringify(ls));
  await shot("14-hint.png");
  await st(() => { Storage.prototype.getItem = () => { throw new Error("blocked"); }; Storage.prototype.setItem = () => { throw new Error("blocked"); }; });
  await open("sweets");
  await roam(); await p.waitForTimeout(500);
  check("localStorage 不能用（丟例外）：世界照常開", await st(() => __world.state.phase === "roam" && __world.state.mobs.length === 10));

  check("沒有 pageerror／console error", errs.length === 0, errs.slice(0, 3).join(" | "));
  await browser.close();
  const bad = results.filter(r => r.startsWith("❌"));
  console.log(bad.length ? `\n${bad.length} 項失敗（共 ${results.length} 項）` : `\n全部通過（${results.length} 項）`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
