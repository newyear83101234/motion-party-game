// 注音戰鬥陀螺接進主程式的測試（10-12）：node tools/zy-test/tops-game.js
// 需要：專案根目錄開著 python -m http.server 8765。截圖存到 TOPS_GAME_SHOTS（預設 %TEMP%\zy-tops-game）。
// 後端一律用 page.route 攔截 Apps Script 網址回假資料（不碰正式後端；沒帶 ?plaza=on 的頁面本來就不連線）。驗：
//   ①歸仁區東邊小半島有陀螺競技場（🌀、剛開放＝展開「新 陀螺競技場」、蓋好、門口接到路網）→ 點 3D 建築進遊戲（「再聽」藏起來、road 音樂、教學只唸一次）
//   ②第一次免費：下場不扣券、freeUsed＝1；打完一場 → 存檔 best／home／history；結算是模組自己的畫面，🏝️ 回小島
//   ③券不足：點競技場／卡片＝貓頭鷹說「再拿 N 顆星星就能玩陀螺喔！」、不進遊戲
//   ④星星換券：結算拿到星星存進 starsBank，滿 15 換 1 張（獎勵膠囊「陀螺券 +1」＋語音）；券滿 3 張不再換、starsBank 最多存 15
//   ⑤有券：打字中離開不扣券；下場了還沒打完就離開＝券退回；離開後沒有殘留 rAF／WebGL／計時／語音
//   ⑤b 下場扣了券就重新整理頁面（iPad 分頁被回收）＝重開時券退回（一般券、免費那次都是；10-12 里維必修 2）
//   ⑥送榜（攔截假後端）：全島榜＝後端公開前 5（不足用島上傳說補）；POST 只送 {k:"top", p}（text/plain）；pending／public（名次）／失敗安靜；家長關掉同樂廣場＝不送也不讀
//   ⑦存檔重開仍在、備份碼還原仍在 ⑧新字都有注音、0 個 console error
const { launch, URL } = require("./lib");
const path = require("path"), fs = require("fs"), os = require("os");
const SHOTS = process.env.TOPS_GAME_SHOTS || path.join(os.tmpdir(), "zy-tops-game");
fs.mkdirSync(SHOTS, { recursive: true });
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.stringify(x);
const strip = s => String(s || "").replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "");
const Q = "debug&novoice&night=0&weather=sunny";
const INTRO = "用注音拼出五個字，變成戰鬥陀螺！";
const CORS = { "access-control-allow-origin": "*" };
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + ".png") });
const hubReady = p => p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 30000 }).then(() => sleep(600));
const spoken = p => p.evaluate(() => window.__spoken.map(s => s.text));
const want = p => p.evaluate(() => window.__zyAudio ? window.__zyAudio.debug().want : "?");
const TS = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__zy.topsSave)));
const TP = p => p.evaluate(() => window.__zy.tops && window.__zy.tops.state());
const inTops = p => p.waitForFunction(() => window.__zy.mode === "tops" && !document.getElementById("tops").classList.contains("hidden") && window.__zy.tops && window.__zy.tops.state() && window.__zy.tops.state().phase === "type", null, { timeout: 30000 }).then(() => true, () => false);
const phase = (p, ph, t = 30000) => p.waitForFunction(ph => { const s = window.__zy.tops && window.__zy.tops.state(); return s && s.phase === ph; }, ph, { timeout: t, polling: 50 }).then(() => true, () => false);
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
// 拼好一句（模組 debug.setPhrase）→ 下場 → 等「開戰」→ 快轉打完 → 結算
async function playMatch(p, phrase, shots) {
  if (!(await p.evaluate(ph => window.__zy.tops.debug.setPhrase(ph), phrase))) return { err: "setPhrase" };
  await sleep(300); await p.evaluate(() => window.__zy.tops.debug.go());
  if (!(await phase(p, "morph"))) return { err: "沒進變身" };
  if (shots) await sleep(2600), await shot(p, shots + "-morph");
  if (!(await p.waitForFunction(() => { const b = document.querySelector(".tp-fight"); return b && !b.disabled; }, null, { timeout: 30000 }).then(() => true, () => false))) return { err: "開戰鈕沒亮" };
  await p.evaluate(() => window.__zy.tops.debug.fight());
  if (!(await phase(p, "battle"))) return { err: "沒進對戰" };
  await p.evaluate(() => window.__zy.tops.debug.fast(true));
  if (shots) await sleep(1800), await shot(p, shots + "-battle");
  if (!(await phase(p, "result", 120000))) return { err: "沒打完" };
  // 模組在遊戲時鐘 1.9 秒後才畫結算面板（headless 軟體繪圖一格最多算 0.05 秒，實際要更久）→ 等面板的按鈕出來
  if (!(await p.waitForFunction(() => !!document.querySelector(".tp-rbtns .tp-home"), null, { timeout: 40000, polling: 100 }).then(() => true, () => false))) return { err: "結算面板沒出來" };
  await sleep(600);
  return { ok: true };
}
const goHomeMid = async p => { await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300); await p.evaluate(() => document.getElementById("confirmYes").click()); await sleep(700); };
// 開一頁：route＝攔截 Apps Script（先掛再載入）；清存檔、塞貼紙、ls＝額外塞的 localStorage
async function openT(browser, { w = 1180, h = 820, query = Q, stickers = 40, stars = 0, ls = {}, route = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => {
    window.__spoken = [];
    const fake = { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null,
      speak(u) { if (u.text.trim()) window.__spoken.push({ t: Math.round(performance.now()), text: u.text }); setTimeout(() => { u.onend && u.onend(); }, 250); } };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  });
  const net = [];
  if (route) await ctx.route(/script\.google(usercontent)?\.com/, route);
  const p = await ctx.newPage(), errs = [];
  p.on("request", r => { if (/script\.google/.test(r.url())) net.push(r.method()); });
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource|net::ERR_/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 160)); });
  await p.goto(URL + "?" + query); await p.waitForTimeout(300);
  await p.evaluate(({ stickers, stars, ls }) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, JSON.stringify(v));
    return import("./js/zhuyin-words.js").then(({ WORDS }) => {
      const s = {}; WORDS.slice(0, stickers).forEach(w => s[w.h] = 1);
      localStorage.setItem("zy1_stickers", JSON.stringify(s)); localStorage.setItem("zy1_stars", String(stars));
      localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1, bubble: 1, deliver: 1, detective: 1 }));
    });
  }, { stickers, stars, ls });
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
  await sleep(300); await p.evaluate(() => { window.__spoken = []; });
  return { ctx, p, errs, net };
}
async function reopen(p) {
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  await p.evaluate(() => { const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
  await sleep(300); await p.evaluate(() => { window.__spoken = []; });
}
// 假後端（Apps Script）：GET 回同樂廣場格式＋tops；POST {k:"top"} 照 M.pmode 回 pending／public／500
function mock(PZ) {
  const W = PZ.weekKeyOf(Date.now());
  const M = { pmode: "pending", posts: [], gets: 0, tops: [{ p: "彩虹棒棒糖", power: 40 }, { p: "熊貓愛跳舞", power: 30 }, { p: "壞掉的資料" }, { p: "太長太長太長了", power: 99 }] };
  const json = (route, o) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: J(o) });
  M.route = async route => {
    const r = route.request(), m = r.method();
    if (m === "GET") { M.gets++; return json(route, { ok: true, w: W, theme: { key: "read", title: "x", unit: "x", desc: "x", goals: [150, 450, 900] }, total: 3, reached: 0, plays: 0, cheers: [0, 0, 0, 0], prev: null, paused: false, tops: M.tops, now: Date.now() }); }
    if (m === "POST") {
      const body = r.postData(), ct = r.headers()["content-type"] || ""; let j = null; try { j = JSON.parse(body); } catch (e) {}
      if (j && j.k === "top") {
        M.posts.push({ body, ct, j });
        if (M.pmode === "500") return route.fulfill({ status: 500, headers: CORS, body: "oops" });
        return json(route, { ok: true, power: 4321, status: M.pmode });
      }
      return json(route, { ok: true });   // 同樂廣場的計數（play、read…）
    }
    return route.fulfill({ status: 204, headers: CORS, body: "" });
  };
  return M;
}

(async () => {
  const { pathToFileURL } = require("url");
  const PZ = await import(pathToFileURL(path.resolve(__dirname, "../../js/zhuyin-plaza.js")).href);
  const browser = await launch(); const allErrs = [];

  // ===== A. 沒有後端（本機預設不連）：第一次免費、券、換券、退券、存檔 =====
  {
    const { ctx, p, errs, net } = await openT(browser, { stickers: 40 });
    await hubReady(p);
    await p.evaluate(() => document.getElementById("townBtn").click()); await sleep(3800);
    const tag = await p.evaluate(() => { const t = document.querySelector(".hub-tag[data-mode=tops]"); return t && { civic: t.classList.contains("civic"), tw: t.classList.contains("tw"), fresh: t.classList.contains("fresh"), open: t.classList.contains("open"), ico: t.querySelector(".ht-ico").textContent, word: t.querySelector(".ht-word").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""), disp: getComputedStyle(t).display, vis: getComputedStyle(t).visibility, locked: t.classList.contains("locked") }; });
    ok("① 歸仁區有陀螺競技場浮標：🌀「陀螺競技場」、沒鎖、平常收成圓形圖示（10-12 晚起沒有「新」）", tag && tag.civic && tag.tw && !tag.fresh && !tag.open && tag.ico === "🌀" && tag.word === "陀螺競技場" && tag.disp !== "none" && tag.vis !== "hidden" && !tag.locked, J(tag));
    const tw = await p.evaluate(() => window.__hub3d.town()), g = await p.evaluate(() => window.__hub3d.graph());
    ok("① 競技場蓋好了、門口接到路網（整個路網連通、門口有 27 個）", J(tw.games) === J([{ mode: "tops", ready: true, locked: false, door: true }]) && g.components === 1 && g.doors.includes("tops") && g.doors.length === 27, J({ games: tw.games, comp: g.components, doors: g.doors.length }));
    const vis = await p.evaluate(() => { const t = document.querySelector(".hub-tag[data-mode=tops]").getBoundingClientRect(); const ob = ["townBtn", "rainbowBtn", "plazaBtn", "hudLBtn", "hudRBtn"].map(id => document.getElementById(id).getBoundingClientRect()).concat([document.querySelector("#menu > .menu-bottom").getBoundingClientRect()]);
      return { inV: t.left >= 0 && t.top >= 0 && t.right <= innerWidth && t.bottom <= innerHeight, hit: ob.some(o => t.left < o.right && t.right > o.left && t.top < o.bottom && t.bottom > o.top) }; });
    ok("① 競技場浮標在畫面裡、沒被按鈕擋到", vis.inV && !vis.hit, J(vis));
    await shot(p, "tops-town-fresh");
    await p.evaluate(() => { window.__spoken = []; });
    // C15（10-12 里維）：手指一碰（pointerdown，3D 浮標也會轉成卡片的 pointerdown）就先抓陀螺引擎＋字典
    const dictReq = []; p.on("request", r => { if (/zhuyin-tops-dict\.json/.test(r.url())) dictReq.push(r.url()); });
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=tops]").dispatchEvent(new PointerEvent("pointerdown")));
    for (let k = 0; k < 30 && !dictReq.length; k++) await sleep(100);
    ok("C15 碰一下陀螺入口（pointerdown）＝先預載字典（還沒點進去）", dictReq.length >= 1 && /\?v=1$/.test(dictReq[0]) && (await p.evaluate(() => window.__zy.mode)) === null, J(dictReq));
    const sd = await tap3d(p, "tops");
    const in1 = await inTops(p);
    const ui = await p.evaluate(() => ({ speak: document.getElementById("speakBtn").classList.contains("hidden"), prog: document.getElementById("progress").classList.contains("hidden"), home: getComputedStyle(document.getElementById("homeBtn")).visibility, hub: window.__hub3d.running }));
    ok("① 點 3D 競技場兩下（介紹卡 → 開始；第一次免費）→ 進遊戲打字畫面", !!sd && in1, J({ sd, in1 }));
    ok("① 主程式「再聽」藏起來、沒有進度點、🏠 在、3D 小島停止渲染、road 音樂", ui.speak && ui.prog && ui.home !== "hidden" && !ui.hub && (await want(p)) === "road", J({ ui, bgm: await want(p) }));
    await sleep(1500);
    const sp1 = await spoken(p);
    ok("① 教學只唸一次（模組唸，主程式不重複）", sp1.filter(t => t === INTRO).length === 1, J(sp1));
    await shot(p, "tops-type");
    // ② 第一次免費
    const s0 = await TS(p);
    const m1 = await playMatch(p, "宇宙強爸爸", "tops");
    const s1 = await TS(p), st1 = await TP(p), pend = await p.evaluate(() => window.__zy.topsPending);
    ok("② 第一次免費：下場不扣券（tickets 0）、freeUsed＝1", s0.tickets === 0 && !s0.freeUsed && s1.tickets === 0 && s1.freeUsed === 1, J({ s0, s1: { t: s1.tickets, f: s1.freeUsed } }));
    ok("② 打完一場：存檔 best／home／history、沒有待退的券", m1.ok && s1.best && s1.best.p === "宇宙強爸爸" && s1.best.power === st1.power && s1.home.some(e => e.p === "宇宙強爸爸") && s1.history.length === 1 && s1.history[0].p === "宇宙強爸爸" && pend === null, J({ m1, best: s1.best, home: s1.home, hist: s1.history, pend }));
    ok("B6a 第一次免費那場：挑會贏的對手（贏了）；history 記下對手（同一句再下場時避開）", st1.win && st1.win.win === true && st1.oppWhy === "free" && s1.history[0].o === st1.opp.p, J({ win: st1.win && st1.win.score, opp: st1.opp, o: s1.history[0].o }));
    const isl = await p.evaluate(() => [...document.querySelectorAll(".tp-isl .tp-row")].map(r => r.querySelector(".tp-row-ph") ? r.querySelector(".tp-row-ph").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") : ""));
    ok("② 沒連線：全島榜＝5 個島上傳說、沒有送出（也沒有任何連線）", isl.length === 5 && st1.submit && !st1.submit.res && net.length === 0, J({ isl, submit: st1.submit, net }));
    await shot(p, "tops-result");
    await p.evaluate(() => { const b = document.querySelector(".tp-rbtns .tp-home"); if (b) b.click(); }); await sleep(1200);
    ok("② 結算按 🏝️ → 回小島", await p.evaluate(() => window.__zy.mode === null && !document.getElementById("menu").classList.contains("hidden")));
    // 剛玩過：歸仁區的浮標收成圖示；按住展開
    await p.evaluate(() => document.getElementById("townBtn").click()); await sleep(3800);
    const lod = await p.evaluate(() => window.__hub3d.lod());
    ok("② 玩過之後：競技場浮標還是圓形圖示", !lod.open.includes("tops") && !lod.sel, J(lod));
    await shot(p, "tops-town-icons");
    await p.evaluate(() => window.__hub3d.openOne("tops")); await sleep(900);
    ok("② 按住競技場：浮標展開名字", (await p.evaluate(() => window.__hub3d.lod())).open.includes("tops"));
    await shot(p, "tops-town-press");
    await p.evaluate(() => window.__hub3d.openOne(null)); await sleep(300);
    // ③ 券不足（10-12 櫻木：沒券也能打字）：點卡片／3D 競技場照樣進打字畫面，「下場！」變「存成蛋！」→ 存檔 save.tops.eggs；按 🏝️ 回小島＝貓頭鷹說還差幾顆星星
    await p.evaluate(() => { window.__spoken = []; document.querySelector(".mode-card[data-mode=tops]").click(); });
    const in3 = await inTops(p), st3 = await TP(p);
    ok("③ 沒券：點卡片照樣進打字畫面（陀螺蛋模式）", in3 && st3.eggMode, J({ in3, egg: st3 && st3.eggMode }));
    await p.evaluate(() => window.__zy.tops.debug.setPhrase("超人在刷牙")); await sleep(200);
    await p.evaluate(() => window.__zy.tops.debug.go()); await phase(p, "egg", 8000);
    const eg3 = await TS(p), lit3 = await p.evaluate(() => document.querySelectorAll(".tp-msg-card .tp-star.tp-lit").length);
    ok("③ 沒券按「存成蛋！」：存成陀螺蛋（存檔 eggs 有這句、帶注音）、不扣券、集點卡亮 starsBank 格", eg3.eggs.length === 1 && eg3.eggs[0].p === "超人在刷牙" && eg3.eggs[0].z && eg3.eggs[0].z.length === 5 && eg3.tickets === 0 && !eg3.pending && lit3 === eg3.starsBank, J({ eggs: eg3.eggs, lit3, bank: eg3.starsBank }));
    await shot(p, "tops-egg-saved");
    await p.evaluate(() => { window.__spoken = []; document.querySelector(".tp-msg-card .tp-home").click(); }); await sleep(1200);
    const g3 = await p.evaluate(() => ({ mode: window.__zy.mode, guide: document.getElementById("guideText").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "") }));
    ok("③ 蛋存好按 🏝️ 回小島：貓頭鷹說「再拿 15 顆星星就能玩陀螺喔！」", g3.mode === null && g3.guide === "再拿15顆星星就能玩陀螺喔！", J(g3));
    await p.evaluate(() => document.getElementById("townBtn").click()); await sleep(3800);   // 從遊戲回來＝回到主島，再去歸仁區（跟 ② 一樣）
    const s3 = await tap3d(p, "tops"); const in3b = await inTops(p);
    ok("③ 沒券：點 3D 競技場也照樣進打字畫面", !!s3 && in3b, J({ s3, in3b }));
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300); await p.evaluate(() => document.getElementById("confirmYes").click()); await sleep(700);
    await p.evaluate(() => { window.__zy.topsSave.eggs = []; });   // 後面的測試不要被「要孵蛋嗎」擋住
    // ④ 星星換券：starsBank 14 → 玩一回偵探 → 換到 1 張（10-12：不再假設偵探題數；照結算實際拿到幾顆星算）
    await p.evaluate(() => { window.__zy.topsSave.starsBank = 14; });
    await p.evaluate(() => document.getElementById("homeBtn").click()); await sleep(300);
    await p.evaluate(() => { window.__spoken = []; document.querySelector(".mode-card[data-mode=detective]").click(); });
    await p.waitForFunction(() => window.__zy.mode === "detective" && window.__zy.detective && window.__zy.detective.state(), null, { timeout: 20000 });
    await p.evaluate(() => { const b = document.querySelector("#detective .dt-go"); if (b) b.click(); });   // 10-13 偵探先出「選等級」畫面：按「開始」
    await p.waitForFunction(() => window.__zy.detective.state().phase !== "pick", null, { timeout: 5000 });
    const total = (await p.evaluate(() => window.__zy.detective.state().total));
    for (let k = 0; k < total; k++) {
      await p.waitForFunction(() => { const s = window.__zy.detective.state(); return s && s.phase === "ask"; }, null, { timeout: 15000, polling: 30 });
      await p.evaluate(() => { const g = window.__zy.detective; g.debug.tap(g.state().answer); });
      await p.waitForFunction(() => window.__zy.detective.state().nextShown, null, { timeout: 8000, polling: 30 });
      await sleep(200); await p.evaluate(() => document.querySelector(".dt-next").click());
    }
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 20000 });
    await sleep(900); await p.evaluate(() => document.getElementById("result").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(2200);
    const s4 = await TS(p), pills = await p.evaluate(() => [...document.querySelectorAll("#result .rw-pill")].map(e => e.textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, ""))), sp4 = await spoken(p);
    const got4 = await p.evaluate(() => document.querySelectorAll("#result .star.on").length);   // 這一局實際拿到幾顆星（偵探題數、星星規則改了也不影響）
    ok(`④ 結算 ${got4} 星：starsBank 14＋${got4} → 換 1 張陀螺券、剩 ${14 + got4 - 15} 顆`, got4 >= 1 && got4 <= 3 && s4.tickets === 1 && s4.starsBank === 14 + got4 - 15, J({ got4, t: s4.tickets, b: s4.starsBank }));
    ok("④ 獎勵膠囊「🎟️ 陀螺券 +1」、語音「拿到一張陀螺券了！」", pills.includes("🎟️陀螺券+1") && sp4.includes("拿到一張陀螺券了！"), J({ pills, sp4: sp4.slice(-3) }));
    await shot(p, "tops-ticket-result");
    // 券滿 3 張：不再換、starsBank 最多 15
    const cap = await p.evaluate(() => { const t = window.__zy.topsSave, o = { tickets: t.tickets, starsBank: t.starsBank }; t.tickets = 3; t.starsBank = 14; return o; });
    await p.evaluate(() => document.getElementById("againBtn").click());
    await p.waitForFunction(() => window.__zy.mode === "detective" && window.__zy.detective.state() && window.__zy.detective.state().phase === "pick", null, { timeout: 20000 });
    await p.evaluate(() => document.querySelector("#detective .dt-go").click());   // 10-13：再玩一次也先出選等級畫面
    await p.waitForFunction(() => window.__zy.mode === "detective" && window.__zy.detective.state() && window.__zy.detective.state().phase === "ask", null, { timeout: 20000 });
    for (let k = 0; k < total; k++) {
      await p.waitForFunction(() => { const s = window.__zy.detective.state(); return s && s.phase === "ask"; }, null, { timeout: 15000, polling: 30 });
      await p.evaluate(() => { const g = window.__zy.detective; g.debug.tap(g.state().answer); });
      await p.waitForFunction(() => window.__zy.detective.state().nextShown, null, { timeout: 8000, polling: 30 });
      await sleep(200); await p.evaluate(() => document.querySelector(".dt-next").click());
    }
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 20000 }); await sleep(600);
    const s4b = await TS(p);
    ok("④ 券滿 3 張：不再換券、starsBank 停在 15", s4b.tickets === 3 && s4b.starsBank === 15, J({ before: cap, after: { t: s4b.tickets, b: s4b.starsBank } }));
    await p.evaluate(() => { const t = window.__zy.topsSave; t.tickets = 1; t.starsBank = 1; });
    // ⑤ 有券：打字中離開不扣券
    await p.evaluate(() => document.getElementById("menuBtn").click()); await sleep(800);
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=tops]").click());
    const in5 = await inTops(p);
    await sleep(600); await goHomeMid(p);
    const s5 = await TS(p);
    ok("⑤ 有券：打字中按 🏠 回小島＝不扣券", in5 && s5.tickets === 1, J({ in5, t: s5.tickets }));
    // 下場了還沒打完就離開＝券退回
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=tops]").click()); await inTops(p);
    await p.evaluate(() => window.__zy.tops.debug.setPhrase("超人在刷牙")); await sleep(200);
    await p.evaluate(() => window.__zy.tops.debug.go()); await phase(p, "morph");
    const mid = await TS(p), pend5 = await p.evaluate(() => window.__zy.topsPending);
    await p.waitForFunction(() => { const b = document.querySelector(".tp-fight"); return b && !b.disabled; }, null, { timeout: 30000 }).catch(() => {});
    await p.evaluate(() => window.__zy.tops.debug.fight()); await phase(p, "battle"); await sleep(800);
    const dbg = await p.evaluate(() => ({ ctx: window.__zy.tops.debug.ctx(), raf: window.__zy.tops.debug.raf() }));
    await goHomeMid(p);
    const s5b = await TS(p);
    ok("⑤ 下場扣 1 張（待退）→ 對戰中按 🏠 回小島＝券退回", mid.tickets === 0 && pend5 && pend5.free === false && s5b.tickets === 1 && (await p.evaluate(() => window.__zy.topsPending)) === null, J({ mid: mid.tickets, pend5, after: s5b.tickets }));
    const sp5a = (await spoken(p)).length; await sleep(3000);
    const res5 = await p.evaluate(() => ({ st: window.__zy.tops.state(), raf: window.__zy.tops.debug.raf(), ctx: window.__zy.tops.debug.ctx(), timers: window.__zy.tops.debug.timers(), kids: document.getElementById("topsRoot").children.length, mode: window.__zy.mode, resume: !document.getElementById("resumeBtn").classList.contains("hidden") }));
    const sp5b = (await spoken(p)).slice(sp5a);
    ok("⑤ 離開後沒有殘留：state null、rAF 0、WebGL context 全收（live 0）、計時 0、畫面清空、不留「繼續玩」、3 秒內沒有陀螺的語音", res5.st === null && res5.raf === 0 && res5.ctx.live === 0 && res5.timers === 0 && res5.kids === 0 && res5.mode === null && !res5.resume && sp5b.length === 0, J({ res5, during: dbg, sp5b }));
    // ⑦ 重開、備份碼
    await reopen(p);
    const s7 = await TS(p);
    ok("⑦ 重開頁面：陀螺存檔還在（券、免費用過、最佳、我家排行、最近）", s7.tickets === 1 && s7.freeUsed === 1 && s7.best && s7.best.p === "宇宙強爸爸" && s7.home.length >= 1 && s7.history.length === 1, J(s7));
    const code = await p.evaluate(() => window.__zyB.exportCode());
    await p.evaluate(() => localStorage.removeItem("zy1_tops")); await reopen(p);
    const gone = await TS(p);
    const ir = await p.evaluate(c => window.__zyB.importCode(c), code); await reopen(p);
    const s7b = await TS(p);
    ok("⑦ 備份碼帶陀螺存檔：刪掉後還原回來", gone.tickets === 0 && !gone.freeUsed && !gone.best && ir === "ok" && J(s7b) === J(s7), J({ gone, ir, s7b }));
    const bad = await p.evaluate(() => { const code = "ZY2:" + btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, hw: 20, p: [{ s: ["貓"], st: 3, eg: 0, b: {}, i: [], m: 8, tp: { tickets: 99, starsBank: -5, freeUsed: "yes", best: { p: "太長太長太長了", power: 5 }, home: [{ p: "宇宙強爸爸", power: 1e9 }, { p: "<b>壞</b>", power: 3 }], history: "x" } }, null, null] })))); const d = window.__zyB.readCode(code); return d && d.slots[0] && d.slots[0].tops; });
    ok("⑦ 備份碼裡亂寫的陀螺資料會被清乾淨（券 ≤3、starsBank ≥0、詞句要剛好 5 個國字、戰力 ≤9999）", bad && bad.tickets === 3 && bad.starsBank === 0 && bad.freeUsed === 1 && bad.best === null && J(bad.home) === J([{ p: "宇宙強爸爸", power: 9999 }]) && J(bad.history) === "[]", J(bad));
    // ⑤b 下場扣了券就重新整理頁面（iPad 分頁被回收）：重開時券退回（10-12 里維必修 2：以前退券只靠記憶體變數，重新整理就沒了）
    const lsTops = () => p.evaluate(() => JSON.parse(localStorage.getItem("zy1_tops") || "null"));
    const goMid = async () => {
      await p.evaluate(() => document.querySelector(".mode-card[data-mode=tops]").click());
      const ok1 = await inTops(p);
      await p.evaluate(() => window.__zy.tops.debug.setPhrase("超人在刷牙")); await sleep(200);
      await p.evaluate(() => window.__zy.tops.debug.go());
      return ok1 && (await phase(p, "morph"));
    };
    const in5b = await goMid();
    const mid5b = await TS(p), ls5b = await lsTops();
    await reopen(p);
    const aft5b = await TS(p), lsA = await lsTops();
    ok("⑤b 一般券：下場扣 1 張（存檔記 pending 1）→ 重新整理 → 券退回 1 張、pending 歸零（存檔也是）", in5b && mid5b.tickets === 0 && ls5b && ls5b.pending === 1 && ls5b.tickets === 0 && aft5b.tickets === 1 && aft5b.pending === 0 && lsA.pending === 0 && lsA.tickets === 1, J({ mid5b, ls5b, aft5b, lsA }));
    await p.evaluate(() => { const t = window.__zy.topsSave; t.freeUsed = 0; t.tickets = 0; });   // 免費那次也一樣
    const in5c = await goMid();
    const mid5c = await TS(p), ls5c = await lsTops();
    await reopen(p);
    const aft5c = await TS(p), lsC = await lsTops();
    ok("⑤b 免費那次：下場（freeUsed 1、pending 2）→ 重新整理 → 免費那次還回來（freeUsed 0）、券不會多出來", in5c && ls5c && ls5c.freeUsed === 1 && ls5c.pending === 2 && mid5c.tickets === 0 && aft5c.freeUsed === 0 && aft5c.tickets === 0 && aft5c.pending === 0 && lsC.freeUsed === 0 && lsC.pending === 0, J({ ls5c, aft5c, lsC }));
    await p.evaluate(() => { const t = window.__zy.topsSave; t.freeUsed = 1; t.tickets = 3; });
    const in5d = await goMid(); await reopen(p);
    const aft5d = await TS(p);
    ok("⑤b 券已經 3 張（滿）時下場又重新整理：退回後最多還是 3 張", in5d && aft5d.tickets === 3 && aft5d.pending === 0, J(aft5d));
    // 打完一場（topsWin）＝pending 歸零、不退；重開也不會多一張
    await p.evaluate(() => { const t = window.__zy.topsSave; t.freeUsed = 1; t.tickets = 1; });
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=tops]").click()); await inTops(p);
    const m5e = await playMatch(p, "超人在刷牙");
    const ls5e = await lsTops(); await reopen(p);
    const aft5e = await TS(p);
    ok("⑤b 打完一場：存檔 pending 0、重新整理後券不會退回（0 張）", m5e.ok && ls5e.pending === 0 && ls5e.tickets === 0 && aft5e.tickets === 0 && aft5e.pending === 0, J({ m5e, ls5e, aft5e }));
    const miss = await p.evaluate(() => [...window.__zy.zMissing].join(""));
    ok("⑧ 新字都有注音（zMissing 空）", miss === "", miss);
    ok("⑥ 沒帶 ?plaza=on 的頁面：完全沒有連後端", net.length === 0, J(net));
    allErrs.push(...errs); await ctx.close();
  }

  // ===== B. 攔截假後端（?plaza=on）：全島榜、送榜轉換、失敗安靜、家長關掉 =====
  {
    const M = mock(PZ);
    const { ctx, p, errs } = await openT(browser, { query: Q + "&plaza=on&no3d", ls: { zy1_tops: { tickets: 3, starsBank: 0, freeUsed: 1, home: [], history: [] } }, route: M.route });
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=tops]").click());
    const in6 = await inTops(p);
    const m6 = await playMatch(p, "宇宙大泡泡");   // 不是島上傳說的句子
    const st6 = await TP(p);
    const isl = await p.evaluate(() => [...document.querySelectorAll(".tp-isl .tp-row")].map(r => r.querySelector(".tp-row-ph").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")));
    ok("⑥ 全島榜＝後端公開的（壞資料丟掉）＋島上傳說補滿 5 筆", in6 && m6.ok && isl.length === 5 && isl.includes("彩虹棒棒糖") && isl.includes("熊貓愛跳舞") && !isl.includes("壞掉的資料") && M.gets >= 1, J({ isl, gets: M.gets }));
    const post = M.posts[0];
    ok("⑥ 可能進前 5 → POST 只送 {k:\"top\", p:\"宇宙大泡泡\"}（text/plain，沒有戰力或其他欄位）", M.posts.length === 1 && post && J(Object.keys(post.j).sort()) === J(["k", "p"]) && post.j.k === "top" && post.j.p === "宇宙大泡泡" && /text\/plain/.test(post.ct), J(M.posts));
    const txt6 = await p.evaluate(() => (document.querySelector(".tp-rstatus") || {}).textContent || "");
    ok("⑥ status pending → {pending:true, public:false}、結算顯示「審核後就會上榜喔！」", st6.submit && st6.submit.res && st6.submit.res.pending === true && st6.submit.res.public === false && strip(txt6).includes("審核後就會上榜喔") && (await spoken(p)).includes("審核後就會上榜喔！"), J({ res: st6.submit && st6.submit.res, txt6 }));
    await shot(p, "tops-result-pending");
    // public（後端開了自動公開）→ 名次
    M.pmode = "public";
    await p.evaluate(() => { const b = document.querySelector(".tp-rbtns .tp-again"); if (b) b.click(); }); await phase(p, "type");
    const m7 = await playMatch(p, "雷電小蝸牛");   // 不是島上傳說的句子（傳說同一句、戰力一樣＝不用送）
    const st7 = await TP(p), txt7 = await p.evaluate(() => (document.querySelector(".tp-rstatus") || {}).textContent || "");
    ok("⑥ status public → {pending:false, public:true, rank}、結算顯示「上榜了！第 N 名」", m7.ok && st7.submit && st7.submit.res && st7.submit.res.public === true && st7.submit.res.pending === false && st7.submit.res.rank >= 1 && st7.submit.res.rank <= 5 && strip(txt7).includes("上榜了"), J({ res: st7.submit && st7.submit.res, txt7, posts: M.posts.length }));
    // 失敗（500）→ 安靜
    M.pmode = "500";
    await p.evaluate(() => { const b = document.querySelector(".tp-rbtns .tp-again"); if (b) b.click(); }); await phase(p, "type");
    const m8 = await playMatch(p, "飛天小豬豬");
    await sleep(800);
    const st8 = await TP(p), txt8 = await p.evaluate(() => (document.querySelector(".tp-rstatus") || {}).textContent || "");
    ok("⑥ 送出失敗（500）：安靜（res null、不顯示上榜字、沒有錯誤）", m8.ok && M.posts.length === 3 && st8.submit && st8.submit.sent && st8.submit.res === null && txt8 === "" && errs.length === 0, J({ res: st8.submit, txt8, errs }));
    allErrs.push(...errs); await ctx.close();
  }
  {
    // 家長關掉同樂廣場：不送也不讀（全島榜只有傳說）
    const M = mock(PZ);
    const { ctx, p, errs, net } = await openT(browser, { query: Q + "&plaza=on&no3d", ls: { zy_plaza_on: 0, zy1_tops: { tickets: 3, starsBank: 0, freeUsed: 1, home: [], history: [] } }, route: M.route });
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=tops]").click());
    await inTops(p);
    const m9 = await playMatch(p, "宇宙強爸爸");
    const isl = await p.evaluate(() => [...document.querySelectorAll(".tp-isl .tp-row")].map(r => r.querySelector(".tp-row-ph").textContent.replace(/[ㄅ-ㄩˊˇˋ˙\s]/g, "")));
    ok("⑥ 家長關掉同樂廣場：不送也不讀（沒有任何連線、全島榜＝5 個傳說）", m9.ok && net.length === 0 && M.posts.length === 0 && M.gets === 0 && isl.length === 5 && !isl.includes("彩虹棒棒糖"), J({ net, isl }));
    allErrs.push(...errs); await ctx.close();
  }
  await browser.close();
  ok("⑧ 全程 0 個 console error", allErrs.length === 0, allErrs.join(" | ").slice(0, 400));
  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log(fails ? `\n${fails} FAIL / ${out.length}` : `\nALL PASS (${out.length})`);
  console.log("截圖：" + SHOTS);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
