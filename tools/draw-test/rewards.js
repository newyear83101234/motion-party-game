// 變色龍扭蛋＋貼紙本（js/draw-rewards.js）無頭測試：獨立 headless Chromium，模擬 iPad 橫向觸控
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1（在 GAME DIY 根目錄）
// 用法：node tools/draw-test/rewards.js     截圖存在 tools/draw-test/_review/rewards/
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL = process.env.REWARDS_URL || "http://127.0.0.1:8765/tools/draw-test/rewards-harness.html";
const OUT = path.join(__dirname, "_review", "rewards");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = "") => { const s = (ok ? "✅ " : "❌ ") + name + (info ? "  " + info : ""); results.push(s); console.log(s); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findShell() });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  const shot = name => p.screenshot({ path: path.join(OUT, name + ".png") });
  const load = async (q = "", clear = false) => {
    if (clear) await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.goto(URL + q);
    await p.waitForFunction(() => window.__ready && window.__R, null, { timeout: 8000 });
  };
  const calls = () => p.evaluate(() => __calls.slice());
  const clearCalls = () => p.evaluate(() => { __calls.length = 0; });
  const ev = (fn, a) => p.evaluate(fn, a);
  const startGrant = o => ev(o => { window.__res = undefined; __R.grant(o).then(r => { window.__res = r; }); }, o);
  const waitRes = (ms = 15000) => p.waitForFunction(() => window.__res !== undefined, null, { timeout: ms }).then(() => ev(() => window.__res));
  const tapEl = async sel => { const b = await p.locator(sel).first().boundingBox(); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
  const tapEgg = async () => { await p.waitForSelector("#gacha .g-egg.wait", { timeout: 6000 }); await tapEl("#gacha .g-egg.wait"); };
  const gachaGone = () => ev(() => !document.getElementById("gacha") && !document.querySelector(".gacha, .g-egg, .g-stk"));
  const SETS = async () => ev(() => __rewards.sets);

  await p.goto(URL); await load("", true);   // 先清掉 localStorage 再重開 = 全新存檔
  const sets = await SETS();

  // ── 1. 掛上 ──
  check("模組掛上：#book、#bookHome、#bookCount、6 個主題分頁鈕都有固定 id",
    await ev(() => !!(document.querySelector("section#book.screen") && document.getElementById("bookHome") && document.getElementById("bookCount")
      && ["animal", "vehicle", "dino", "fairy", "ocean", "sweets"].every(t => document.getElementById("bookTab-" + t)))));
  check("CSS 自己插入且有生效（draw-rewards.css?v=7）",
    await ev(() => !!document.querySelector('link[href="css/draw-rewards.css?v=7"]') && getComputedStyle(document.getElementById("bookBody")).perspective === "2400px"));
  check("全新存檔：0 張、今天可以領每日扭蛋", await ev(() => __R.count() === 0 && __R.owned().length === 0 && __R.dailyReady() === true && __R.doneCount() === 0));

  // ── 2. 開一顆扭蛋（指定主題）──
  await clearCalls();
  await startGrant({ theme: "animal" });
  await sleep(950);
  await shot("g0-peek"); await shot("g0-peek");   // 無頭瀏覽器第一張截圖常抓到舊畫格，拍兩次留第二張
  await p.waitForSelector("#gacha .g-egg.wait", { timeout: 6000 });
  await sleep(250);
  await shot("g1-egg");
  check("扭蛋：全螢幕遮罩、變色龍、彩色蛋掉下來等著點（畫面上只有一個遮罩）",
    await ev(() => document.querySelectorAll("#gacha").length === 1 && !!document.querySelector("#gacha .g-mascot") && !!document.querySelector("#gacha .g-egg.wait:not(.gold)")));
  await tapEgg();
  await sleep(850);
  await shot("g2-open");
  const c1 = await calls();
  check("點蛋 → 播 magic、星星粒子、貼紙出現（真圖）",
    c1.some(c => c[0] === "sfx" && c[1] === "magic") && c1.some(c => c[0] === "stars") && await ev(() => !!document.querySelector("#gacha .g-stk img.stk.ok")));
  const r1 = await waitRes();
  check("resolve 回傳拿到的貼紙 id，而且是指定主題的", r1.length === 1 && sets.animal.includes(r1[0]), JSON.stringify(r1));
  check("resolve 後遮罩真的從 DOM 移除", await gachaGone());
  await tapEl("#hBook");
  check("遮罩移除後底下的按鈕點得到（pointer-events 沒殘留）", await ev(() => document.getElementById("hTaps").textContent === "1"));
  const fly = await ev(() => { const r = document.getElementById("hBook").getBoundingClientRect(); return { f: __rewards.lastFly, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  check("貼紙飛向 bookAnchor（貼紙本按鈕中心）", fly.f && Math.abs(fly.f.x - fly.x) < 2 && Math.abs(fly.f.y - fly.y) < 2, JSON.stringify(fly));
  const ls1 = await ev(() => { try { return JSON.parse(localStorage.getItem("draw-rewards")); } catch { return null; } });
  check("存檔格式 { v:1, got, gold, done, daily }", ls1 && ls1.v === 1 && Array.isArray(ls1.got) && ls1.got[0] === r1[0] && Array.isArray(ls1.gold) && typeof ls1.done === "object" && ls1.daily === "", JSON.stringify(ls1));

  // ── 3. 該主題集滿 → 給別的主題；蛋還在掉的時候就點，落地馬上開 ──
  await ev(ids => __rewards.grantNow(ids), sets.ocean);
  const before = await ev(() => __R.count());
  let t0 = Date.now();
  await startGrant({ theme: "ocean" });
  await sleep(350);
  await p.touchscreen.tap(590, 400);   // 蛋還在空中
  const r2 = await waitRes();
  const el2 = Date.now() - t0;
  check("蛋還在掉時點一下，落地就開（不用再點）", el2 < 5200, el2 + "ms");
  check("海洋集滿了 → 給別的主題、張數 +1", r2.length === 1 && !sets.ocean.includes(r2[0]) && await ev(() => __R.count()) === before + 1, JSON.stringify(r2));

  // ── 4. 5 秒不點自己開 ──
  t0 = Date.now();
  await startGrant();
  const r3 = await waitRes(16000);
  const el3 = Date.now() - t0;
  check("5 秒沒點自己開，最後一樣 resolve＋遮罩移除", r3.length === 1 && el3 > 6000 && el3 < 11000 && await gachaGone(), el3 + "ms");

  // ── 5. 一次開 3 顆 ──
  await clearCalls();
  await startGrant({ count: 3 });
  let maxOv = 0;
  const poll = setInterval(() => ev(() => document.querySelectorAll("#gacha, .gacha").length).then(n => { maxOv = Math.max(maxOv, n); }).catch(() => {}), 120);
  for (let i = 0; i < 3; i++) { await tapEgg(); await sleep(300); }
  const r4 = await waitRes();
  clearInterval(poll);
  const magic4 = (await calls()).filter(c => c[0] === "sfx" && c[1] === "magic").length;
  check("count:3 連開三顆：3 張不同、magic 響 3 次、同時只有一個遮罩、最後移除",
    r4.length === 3 && new Set(r4).size === 3 && magic4 === 3 && maxOv === 1 && await gachaGone(), `ids=${r4} magic=${magic4} maxOv=${maxOv}`);

  // ── 6. 連點＋同時叫兩次 grant：排隊、不重疊、都 resolve ──
  const c6 = await ev(() => __R.count());
  await ev(() => { window.__a = window.__b = undefined; __R.grant().then(r => { window.__a = r; }); __R.grant().then(r => { window.__b = r; }); });
  maxOv = 0;
  const poll2 = setInterval(() => ev(() => document.querySelectorAll("#gacha, .gacha").length).then(n => { maxOv = Math.max(maxOv, n); }).catch(() => {}), 100);
  await sleep(200);
  for (let i = 0; i < 12; i++) { await p.touchscreen.tap(590, 380); await sleep(90); }   // 小孩亂點一通
  for (let i = 0; i < 40 && !(await ev(() => window.__a && window.__b)); i++) { await p.touchscreen.tap(590, 380); await sleep(250); }
  clearInterval(poll2);
  const ab = await ev(() => [window.__a, window.__b]);
  check("連點＋同時兩個 grant：排隊一顆一顆開、都 resolve、張數 +2、遮罩不重疊",
    ab[0] && ab[1] && ab[0].length === 1 && ab[1].length === 1 && await ev(() => __R.count()) === c6 + 2 && maxOv === 1 && await gachaGone(), `maxOv=${maxOv} ${JSON.stringify(ab)}`);

  // ── 7. 36 張全滿 → 金蛋、金色版 ──
  await ev(ids => __rewards.grantNow(ids), await ev(() => __rewards.ids));
  check("grantNow 收集全部 36 張", await ev(() => __R.count()) === 36);
  await startGrant({ theme: "dino" });
  await p.waitForSelector("#gacha .g-egg.gold.wait", { timeout: 6000 });
  await sleep(300);
  await shot("g3-gold-egg");
  await tapEgg();
  await sleep(900);
  await shot("g4-gold-open");
  const r7 = await waitRes();
  const st7 = await ev(() => ({ n: __R.count(), gold: __rewards.state.gold.slice() }));
  check("全滿後給金色版：金蛋、記在 state.gold、張數維持 36、優先同主題", st7.n === 36 && st7.gold.length === 1 && st7.gold[0] === r7[0] && sets.dino.includes(r7[0]), JSON.stringify(st7));

  // ── 8. 貼紙本 ──
  await ev(() => __rewards.reset());
  await ev(() => __rewards.grantNow(["puppy", "kitten", "lion", "panda", "racecar", "rocket", "trex", "volcano", "dinoegg", "unicorn", "castle", "rainbow", "crown",
    "whale", "clownfish", "octopus", "turtle", "starfish", "shell", "donut"]));
  await ev(() => { __rewards.state.gold.push("puppy"); });
  await clearCalls();
  await ev(() => __R.openBook("dino"));
  await sleep(700);
  await shot("b1-dino-fairy");
  const b1 = await ev(() => ({
    on: document.getElementById("book").classList.contains("on"),
    tabs: [...document.querySelectorAll(".bk-tab.on")].map(b => b.id),
    left: !!document.querySelector(".bk-pg.l #slot-trex"), right: !!document.querySelector(".bk-pg.r #slot-wand"),
    own: document.querySelectorAll(".bk-pg .slot.own").length, empty: document.querySelectorAll(".bk-pg .slot.empty").length,
    q: document.querySelectorAll(".bk-pg .slot.empty .q").length,
    sil: getComputedStyle(document.querySelector(".slot.empty .stk")).filter,
  }));
  check("openBook('dino')：呼叫 show('book')、翻到恐龍＋公主那頁、分頁鈕亮", (await calls()).some(c => c[0] === "show" && c[1] === "book") && b1.on && b1.left && b1.right
    && b1.tabs.join() === "bookTab-dino,bookTab-fairy", JSON.stringify(b1.tabs));
  check("已收集顯示貼紙、沒收集是剪影＋問號（每頁 6 格）", b1.own === 7 && b1.empty === 5 && b1.q === 5 && b1.sil.includes("brightness(0)"), `own=${b1.own} empty=${b1.empty} filter=${b1.sil}`);
  check("進度「🌟 n / 36」跟 count() 一致", await ev(() => document.getElementById("bookN").textContent === String(__R.count()) && document.getElementById("bookCount").textContent.includes("/ 36")));
  await clearCalls();
  await tapEl("#slot-trex");
  await sleep(200);
  check("點已收集的貼紙：彈一下＋音符", (await calls()).some(c => c[0] === "note") && await ev(() => document.getElementById("slot-trex").classList.contains("boing")));
  await tapEl("#slot-wand");
  check("點沒收集的格子：搖一下（不給東西、不扣分）", await ev(() => document.getElementById("slot-wand").classList.contains("nope") && __R.count() === 20));

  // 主題集滿 → 皇冠
  await ev(() => __R.openBook("ocean"));
  await sleep(900);
  await shot("b2-ocean-crown");
  check("海洋 6 張集滿：那一頁上方出現金色皇冠（甜點沒有）、分頁鈕也有皇冠",
    await ev(() => !!document.getElementById("crown-ocean") && !document.getElementById("crown-sweets") && document.getElementById("bookTab-ocean").classList.contains("full")
      && __R.themeFull("ocean") && !__R.themeFull("sweets")));

  // 翻頁動畫
  await tapEl("#bookTab-animal");
  await sleep(40);
  const leafNow = await ev(() => document.querySelectorAll(".bk-leaf").length);
  await sleep(220);
  await shot("b3-flip");
  await sleep(700);
  check("換頁有翻頁動畫（紙張翻過去後移除）、翻到動物＋交通工具",
    leafNow === 1 && await ev(() => document.querySelectorAll(".bk-leaf").length === 0 && !!document.querySelector(".bk-pg.l #slot-puppy") && !!document.querySelector(".bk-pg.r #slot-racecar")));
  await shot("b4-animal");
  check("金色版貼紙：金框＋閃光", await ev(() => document.getElementById("slot-puppy").classList.contains("gold") && getComputedStyle(document.querySelector("#slot-puppy .stk")).filter.includes("255, 210, 63")));

  // 連點分頁鈕：不會疊好幾張紙，最後停在最後點的那頁
  for (const t of ["sweets", "vehicle", "fairy", "ocean", "dino"]) { await tapEl("#bookTab-" + t); await sleep(60); }
  await sleep(800);
  check("連點分頁鈕：不會疊好幾張紙、停在最後點的那頁", await ev(() => document.querySelectorAll(".bk-leaf").length === 0 && !!document.querySelector(".bk-pg.l #slot-trex") && document.getElementById("bookTab-dino").classList.contains("on")));

  // 左右滑動、翻頁鈕
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
  await touch("touchStart", [[800, 470]]);
  for (const x of [740, 660, 580, 520]) { await touch("touchMove", [[x, 475]]); await sleep(16); }
  await touch("touchEnd", [[520, 475]]);
  await sleep(800);
  check("往左滑 → 下一頁（海洋＋甜點）", await ev(() => !!document.querySelector(".bk-pg.l #slot-whale")));
  check("最後一頁沒有「下一頁」鈕、有「上一頁」鈕", await ev(() => document.getElementById("bookNext").classList.contains("off") && !document.getElementById("bookPrev").classList.contains("off")));
  await tapEl("#bookPrev");
  await sleep(800);
  check("按上一頁 → 回到恐龍＋公主", await ev(() => !!document.querySelector(".bk-pg.l #slot-trex")));

  // 剛拿到的貼紙：在貼紙本第一次看到時「啪」一聲貼上
  await tapEl("#bookHome");
  await sleep(300);
  check("🏠 呼叫 onHome 回首頁", (await calls()).some(c => c[0] === "onHome") && await ev(() => document.getElementById("home").classList.contains("on")));
  await startGrant({ theme: "sweets" });
  await tapEgg();
  const r8 = await waitRes();
  await ev(() => __R.openBook());
  await sleep(150);
  check("沒指定主題的 openBook 翻到剛拿到的貼紙那頁，新貼紙有「貼上」動畫",
    await ev(id => { const s = document.getElementById("slot-" + id); return !!s && s.classList.contains("new") && s.classList.contains("own"); }, r8[0]), JSON.stringify(r8));
  await sleep(900);
  await shot("b5-new");
  await ev(() => __R.openBook("sweets"));
  check("同一張貼紙只「貼上」一次（再開不重播）", await ev(id => !document.getElementById("slot-" + id).classList.contains("new"), r8[0]));

  // ── 9. 每日扭蛋一天一次 ──
  await ev(() => __rewards.reset());
  check("每日扭蛋：今天還沒領 → dailyReady true", await ev(() => __R.dailyReady()));
  await ev(() => { window.__res = undefined; __R.claimDaily().then(r => { window.__res = r; }); });
  await tapEgg();
  const d1 = await waitRes();
  const d2 = await ev(async () => { const t = Date.now(); const r = await __R.claimDaily(); return { r, ms: Date.now() - t, ov: !!document.getElementById("gacha"), ready: __R.dailyReady(), n: __R.count() }; });
  check("領過之後：dailyReady false、再領立刻回 [] 不開扭蛋、張數不變", d1.length === 1 && d2.r.length === 0 && d2.ms < 50 && !d2.ov && !d2.ready && d2.n === 1, JSON.stringify(d2));
  await load();
  check("重開頁面後今天仍然領過（有存檔）", await ev(() => !__R.dailyReady() && /^\d{4}-\d{2}-\d{2}$/.test(__rewards.state.daily)));
  await ev(() => { __rewards.state.daily = "2000-01-01"; });
  check("換一天（存檔日期不是今天）→ 又可以領", await ev(() => __R.dailyReady()));

  // ── 10. 畫完紀錄 ──
  await ev(() => { __R.markDone("animal-1"); __R.markDone("animal-1"); __R.markDone("dino-2"); __R.markDone(""); });
  await load();
  check("markDone／isDone／doneCount（次數記錄、重開還在、空 id 不記）",
    await ev(() => __R.isDone("animal-1") && __R.isDone("dino-2") && !__R.isDone("ocean-1") && __R.doneCount() === 2 && __rewards.state.done["animal-1"] === 2));
  check("stickerSrc 給出圖片網址、owned 是複本", await ev(() => __R.stickerSrc("puppy") === "IMAGE/draw/stickers/puppy.png?v=7" && (() => { const o = __R.owned(); o.push("x"); return !__R.owned().includes("x"); })()));

  // ── 11. 壞掉的存檔 ──
  await ev(() => localStorage.setItem("draw-rewards", "{壞掉的存檔"));
  await load();
  check("localStorage 壞掉（不是 JSON）→ 重設成空的、沒當掉", await ev(() => __R.count() === 0 && __R.doneCount() === 0 && __R.dailyReady()));
  await startGrant();
  await tapEgg();
  await waitRes();
  check("壞存檔復原後照樣能開扭蛋、存回正確格式", await ev(() => { const s = JSON.parse(localStorage.getItem("draw-rewards")); return s.v === 1 && s.got.length === 1; }));
  await ev(() => localStorage.setItem("draw-rewards", JSON.stringify({ v: 1, got: ["puppy", "nope", 5, "puppy", null], gold: ["kitten", "puppy"], done: ["x"], daily: 12 })));
  await load();
  check("欄位壞掉 → 只清那一欄（不認得的 id 丟掉、重複合併、金色版必須已擁有）",
    await ev(() => JSON.stringify(__R.owned()) === '["puppy"]' && JSON.stringify(__rewards.state.gold) === '["puppy"]' && __R.doneCount() === 0 && __R.dailyReady()));
  for (const bad of ["null", "[1,2]", '"字串"', JSON.stringify({ v: 2, got: ["puppy"] })]) {
    await ev(b => localStorage.setItem("draw-rewards", b), bad);
    await load();
    if (!(await ev(() => __R.count() === 0))) { check("各種壞存檔都復原：" + bad, false); }
  }
  check("null／陣列／字串／不認得的版本 → 都復原成空的", await ev(() => __R.count() === 0));
  await ev(() => { const g = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error("QuotaExceeded"); }; __R.markDone("q"); Storage.prototype.setItem = g; });
  check("localStorage 寫不進去（滿了）也不當掉", await ev(() => __R.isDone("q")));

  // ── 12. 圖檔不存在 → emoji ──
  // kitten 一律 404；網址帶 v=nofiles 時全部 404（模擬圖還沒放進來）
  await p.route("**/IMAGE/draw/stickers/*", r => { const u = r.request().url(); return u.includes("kitten") || u.includes("v=nofiles") ? r.fulfill({ status: 404, body: "" }) : r.continue(); });
  await load("?v=fb");
  await ev(() => __rewards.grantNow(["puppy", "kitten"]));
  await ev(() => __R.openBook("animal"));
  await sleep(800);
  check("圖檔不存在（kitten 404）→ 退回 emoji 🐱；有圖的照樣用圖",
    await ev(() => { const k = document.querySelector("#slot-kitten .emo"), pu = document.querySelector("#slot-puppy img.stk.ok"); return !!k && k.textContent === "🐱" && !!pu && !document.querySelector("#slot-kitten img"); }));
  await shot("b6-emoji-fallback");
  await load("?v=nofiles", true);
  await startGrant({ theme: "fairy" });
  await tapEgg();
  await sleep(850);
  const emoG = await ev(() => !!document.querySelector("#gacha .g-stk .emo") && !document.querySelector("#gacha .g-stk img"));
  await shot("g6-emoji-fallback");
  await waitRes();
  check("36 張圖都不在時扭蛋用 emoji、動畫完整跑完", emoG && await gachaGone());
  await p.unroute("**/IMAGE/draw/stickers/*");

  // ── 13. 視窗大小改變 ──
  await load("", true);
  await ev(() => __rewards.grantNow(["trex", "volcano", "unicorn", "castle", "rainbow"]));
  for (const [w, h] of [[1024, 768], [1366, 1024], [1180, 820]]) {
    await p.setViewportSize({ width: w, height: h });
    await ev(() => __R.openBook("dino"));
    await sleep(500);
    const fit = await ev(() => {
      const b = document.getElementById("bookBody").getBoundingClientRect(), t = document.querySelector(".bk-top").getBoundingClientRect();
      const slots = [...document.querySelectorAll(".bk-pg .slot")].map(s => s.getBoundingClientRect());
      const pg = [...document.querySelectorAll(".bk-pg")].map(s => s.getBoundingClientRect());
      const inside = slots.every(s => pg.some(q => s.left >= q.left - 1 && s.right <= q.right + 1 && s.top >= q.top - 1 && s.bottom <= q.bottom + 1));
      return { ok: b.left >= 0 && b.right <= innerWidth && b.top >= t.bottom - 4 && b.bottom <= innerHeight && inside && document.documentElement.scrollWidth <= innerWidth, b: [b.left, b.top, b.right, b.bottom].map(Math.round), inside };
    });
    check(`${w}×${h}：整本貼紙本在畫面內、格子都在書頁裡`, fit.ok, JSON.stringify(fit));
    if (w !== 1180) await shot(`b7-${w}x${h}`);
  }
  await p.setViewportSize({ width: 1024, height: 768 });
  await ev(() => document.getElementById("bookHome").click());
  await startGrant();
  await tapEgg();
  await sleep(850);
  const g13 = await ev(() => { const r = document.querySelector("#gacha .g-stk").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
  await shot("g5-1024x768");
  await waitRes();
  check("1024×768：扭蛋貼紙整張在畫面內、結束後遮罩移除", g13 && await gachaGone());
  await p.setViewportSize({ width: 1180, height: 820 });

  check("全程沒有 pageerror", errs.length === 0, errs.slice(0, 3).join(" | "));
  await browser.close();
  const fail = results.filter(r => r.startsWith("❌")).length;
  console.log(`\n${results.length - fail}/${results.length} 項通過` + (fail ? "" : "\n全部通過"));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
