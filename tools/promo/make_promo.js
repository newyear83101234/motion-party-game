// 注音小島宣傳片（阿葉 10-11：仿《開工吧！社畜人生！》宣傳片——等角小鎮推鏡、斜放黃色大標語、章節標籤、說明小膠囊、片尾卡）
// 用法：node tools/promo/make_promo.js [輸出.mp4] [--keep] [--portrait＝直式 720×1280（IG Reels／Shorts）]
//       偶發「截圖卡死」會直接失敗 → 重跑：for i in 1 2 3; do node tools/promo/make_promo.js && break; done
// 做法：headless Chromium 1280×720（PROMO_SCALE=1.5 才是 1080p，但較容易卡）＋ CDP 虛擬時間逐格截圖 30fps（3D 算得慢也一樣順）
//       → 疊字用頁面裡的 DOM（#promo，class noann＝不自動加注音）→ ffmpeg 合成＋背景音樂淡入淡出
// 需要：本機伺服器 python -m http.server 8765（專案根目錄）、ffmpeg
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const { launch } = require("../zy-test/lib");
const ROOT = path.resolve(__dirname, "../..");
const PORTRAIT = process.argv.includes("--portrait"), VW = PORTRAIT ? 720 : 1280, VH = PORTRAIT ? 1280 : 720;
const OUTARG = process.argv.slice(2).find(a => !a.startsWith("--"));   // 參數順序不拘（--portrait 放前面也行）
const OUTMP4 = OUTARG ? path.resolve(OUTARG) : path.join(ROOT, "promo", PORTRAIT ? "zhuyin-island-promo-vertical.mp4" : "zhuyin-island-promo.mp4");
const FR = path.join(os.tmpdir(), PORTRAIT ? "zy_promo_frames_p" : "zy_promo_frames");
const URL = (process.env.ZY_URL || "http://127.0.0.1:8765/zhuyin.html") + "?debug&weather=sunny&novoice&night=0";   // 宣傳片固定白天（真實時鐘晚上會自動變夜景）
const FPS = 30, DT = 1000 / FPS;

const CSS = `
#promo { position: fixed; inset: 0; z-index: 100000; pointer-events: none; font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; }
#promo .banner { position: absolute; left: 50%; top: 40%; translate: -50% -50%; rotate: -4deg; background: #f6c445; border-radius: 2.4vmin; padding: 2.6vmin 7vmin 2.8vmin;
  box-shadow: 0 1.4vmin 0 #c99a1d, 0 3vmin 6vmin rgba(20,50,80,0.35); text-align: center; animation: pbIn 0.55s cubic-bezier(.2,1.5,.4,1) both; white-space: nowrap; }
#promo .banner b { display: block; font-size: 12vmin; font-weight: 900; color: #fff; line-height: 1.1; letter-spacing: 0.6vmin;
  -webkit-text-stroke: 1.4vmin #24515c; paint-order: stroke fill; }
#promo .banner i { display: block; font-style: normal; margin-top: 1.2vmin; font-size: 4.6vmin; font-weight: 900; color: #24515c; }
#promo .banner.small b { font-size: 8.4vmin; -webkit-text-stroke-width: 1.1vmin; }
#promo .banner.out { animation: pbOut 0.35s ease-in both; }
#promo .banner.low { top: 72%; }
@keyframes pbIn { 0% { opacity: 0; scale: 0.5; } 100% { opacity: 1; scale: 1; } }
@keyframes pbOut { 0% { opacity: 1; scale: 1; } 100% { opacity: 0; scale: 0.85; } }
#promo .chap { position: absolute; left: 50%; top: 2.6vmin; translate: -50% 0; display: flex; align-items: center; gap: 2vmin; background: rgba(255,255,255,0.96); border-radius: 6vmin;
  padding: 1.4vmin 3vmin 1.4vmin 1.6vmin; box-shadow: 0 0.8vmin 2.4vmin rgba(20,50,80,0.25); animation: pcIn 0.45s ease-out both; }
#promo .chap .n { background: #24515c; color: #fff; font-weight: 900; font-size: 4vmin; border-radius: 4vmin; padding: 0.6vmin 2vmin; }
#promo .chap .t { color: #24515c; font-weight: 900; font-size: 4.6vmin; white-space: nowrap; }
#promo .chap .bar { display: flex; gap: 0.8vmin; margin-left: 1vmin; }
#promo .chap .bar span { width: 4.2vmin; height: 1.1vmin; border-radius: 1vmin; background: #d6e2ea; }
#promo .chap .bar span.on { background: #f6c445; }
@keyframes pcIn { 0% { opacity: 0; translate: -50% -4vmin; } 100% { opacity: 1; translate: -50% 0; } }
#promo .pill { position: absolute; left: 3vmin; bottom: 4vmin; display: flex; align-items: center; gap: 1.6vmin; background: #fff; border-radius: 6vmin; padding: 1.6vmin 3.4vmin 1.6vmin 2vmin;
  box-shadow: 0 0.8vmin 0 #b9c6d6, 0 1.6vmin 3vmin rgba(20,50,80,0.3); animation: ppIn 0.4s cubic-bezier(.2,1.5,.4,1) both; white-space: nowrap; }
#promo .pill .e { font-size: 6vmin; line-height: 1; }
#promo .pill .t { font-size: 4.4vmin; font-weight: 900; color: #24515c; }
#promo .pill .t small { font-size: 3.4vmin; color: #556; font-weight: 700; margin-left: 1.2vmin; }
#promo .pill.right { left: auto; right: 3vmin; }
@keyframes ppIn { 0% { opacity: 0; translate: -6vmin 0; } 100% { opacity: 1; translate: 0 0; } }
#promo .end { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255,255,255,0.55); backdrop-filter: blur(6px); animation: peIn 0.6s ease-out both; }
#promo .card { width: max-content; max-width: 92vw; background: #fff; border-radius: 5vmin; padding: 5vmin 9vmin; text-align: center; box-shadow: 0 2vmin 6vmin rgba(20,50,80,0.3); animation: pbIn 0.6s 0.15s cubic-bezier(.2,1.5,.4,1) both; }
#promo .card .logo { white-space: nowrap; font-size: 11vmin; font-weight: 900; color: #f6c445; -webkit-text-stroke: 1.2vmin #24515c; paint-order: stroke fill; letter-spacing: 0.6vmin; line-height: 1.15; }
#promo .card .tag { white-space: nowrap; margin-top: 1.6vmin; font-size: 4.8vmin; font-weight: 900; color: #24515c; }
#promo .card .row { margin-top: 2.6vmin; display: flex; gap: 2vmin; justify-content: center; }
#promo .card .row span { background: #fff4d6; color: #8a5a00; font-weight: 800; font-size: 3.4vmin; border-radius: 4vmin; padding: 1vmin 2.4vmin; }
#promo .card .sm { margin-top: 2.4vmin; font-size: 3vmin; color: #667; font-weight: 700; }
@keyframes peIn { 0% { opacity: 0; } 100% { opacity: 1; } }
@media (orientation: portrait) {
  #promo .banner { top: 34%; padding: 2.4vmin 4.4vmin 2.6vmin; } #promo .banner b { font-size: 11vmin; } #promo .banner.small b { font-size: 6vmin; -webkit-text-stroke-width: 0.9vmin; } #promo .banner i { font-size: 4.2vmin; }
  #promo .chap { top: 30vmin; } #promo .pill { bottom: 26vmin; } #promo .card { padding: 5vmin 5vmin; max-width: 90vw; } #promo .card .row { flex-wrap: wrap; }
}
`;
// 頁面裡的疊字小工具
const OVERLAY = () => {
  const root = document.createElement("div"); root.id = "promo"; root.className = "noann"; document.body.appendChild(root);
  const mk = (cls, html) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
  window.__promo = {
    banner(t, sub, small) { this.clear(".banner"); mk("banner" + (small === true ? " small" : small ? " " + small : ""), `<b>${t}</b>${sub ? `<i>${sub}</i>` : ""}`); },   // small：true 或 "small low"（放下面）
    bannerOut() { root.querySelectorAll(".banner").forEach(b => b.classList.add("out")); },
    chap(n, t) { this.clear(".chap"); mk("chap", `<span class="n">0${n}</span><span class="t">${t}</span><span class="bar">${[1, 2, 3, 4, 5].map(k => `<span class="${k <= n ? "on" : ""}"></span>`).join("")}</span>`); },
    pill(e, t, sub, right) { this.clear(".pill"); mk("pill" + (right ? " right" : ""), `<span class="e">${e}</span><span class="t">${t}${sub ? `<small>${sub}</small>` : ""}</span>`); },
    end() { this.clear(); mk("end", `<div class="card"><div class="logo">注音小島</div><div class="tag">聽一聽、點一點，玩著玩著就會注音</div>
      <div class="row"><span>🎮 九個小遊戲</span><span>🎁 扭蛋、28 隻動物朋友</span><span>🏙️ 小鎮越蓋越大</span></div><div class="sm">平板、手機瀏覽器打開就能玩・不用下載</div></div>`); },
    clear(sel) { root.querySelectorAll(sel || ":scope > *").forEach(x => x.remove()); },
  };
};

(async () => {
  fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true }); fs.mkdirSync(path.dirname(OUTMP4), { recursive: true });
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript(() => {
    const fake = { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, speak(u) { setTimeout(() => u.onend && u.onend(), 300); } };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    // 遊戲音效換成靜音假物件（影片配樂由 ffmpeg 加，用不到）：<audio> 載入時 Chrome 會暫停虛擬時間，少一個變因（但不是偶發卡死的主因）
    window.Audio = class { constructor(src) { Object.assign(this, { src: src || "", paused: true, currentTime: 0, volume: 1, muted: false, loop: false, playbackRate: 1, preload: "auto" }); } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } load() {} addEventListener() {} removeEventListener() {} };
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(() => cb(performance.now()));   // 虛擬時間：rAF 的時間戳跟 performance.now 一致
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 160)); });
  await p.goto(URL); await p.waitForTimeout(400);
  await p.evaluate(() => {
    localStorage.clear();
    return import("./js/zhuyin-words.js").then(({ WORDS }) => {
      const s = {}; WORDS.slice(0, 64).forEach(w => s[w.h] = 1);
      localStorage.setItem("zy1_stickers", JSON.stringify(s)); localStorage.setItem("zy1_stars", "47"); localStorage.setItem("zy1_eggs", "4");
      localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1, bubble: 1 }));
      localStorage.setItem("zy1_bubble", JSON.stringify({ lv: 9, stars: { 0: 3, 1: 3, 2: 3, 3: 2, 4: 3, 5: 2 } }));
      const pets = {}; for (const id of ["bear", "bunny", "cat", "fox", "panda", "penguin", "frog", "lion", "dog", "koala"]) pets[id] = { stage: 2, t: 30 };
      localStorage.setItem("zy1_rewards", JSON.stringify({ pets, partner: "bear", coins: 3, gold: 0, jarCoins: 4, treats: 60, decor: ["flower_arch", "statue_owl"], stamps: 3, stampDay: "", pity: { rare: 4, ssr: 0 }, catBonus: [], pulls: 4 }));
      localStorage.setItem("zy1_hello", "1"); localStorage.setItem("zy_hint_wait", "0"); localStorage.setItem("zy1_tone1tip", "1");
    });
  });
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 30000 });
  await p.evaluate(() => document.getElementById("startBtn").click());
  await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready && window.__zy.weather, null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.addStyleTag({ content: CSS }); await p.evaluate(OVERLAY);
  await p.evaluate(() => { window.__hub3d.events(false); document.getElementById("guide").style.visibility = "hidden"; });

  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  const within = (pr, ms) => Promise.race([pr, new Promise(r => setTimeout(() => r("TIMEOUT"), ms))]);
  const step = ms => within(new Promise(res => { cdp.once("Emulation.virtualTimeBudgetExpired", () => res("ok")); cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: ms }); }), 15000);
  // CDP 截圖不吃 deviceScaleFactor：PROMO_SCALE=1.5 才是 1080p，但帶 clip 在虛擬時間下常卡到逾時 → 預設 720p 不帶 clip
  let F = 0, last = null, diag = false; const SC = +process.env.PROMO_SCALE || 1;
  const SHOT = SC > 1 ? { format: "jpeg", quality: 92, clip: { x: 0, y: 0, width: VW, height: VH, scale: SC } } : { format: "jpeg", quality: 92 };
  // 心跳點：左上角 2px、幾乎透明，每格換一點點顏色 → 畫面一定有東西要重畫（畫面靜止時，虛擬時間下截圖會等不到新畫面而卡死）
  const beat = () => p.evaluate(f => { let d = document.getElementById("promoBeat"); if (!d) { d = document.createElement("div"); d.id = "promoBeat"; d.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;z-index:100001;pointer-events:none"; document.body.appendChild(d); } d.style.background = `rgba(${f % 2 ? 1 : 0},0,0,0.01)`; }, F);
  const shot = async () => {
    await beat();
    const pr = cdp.send("Page.captureScreenshot", SHOT);
    let s = await within(pr, 8000);
    // 截圖卡住（虛擬時間暫停時偶爾等不到新畫面，而且卡住的那張會堵住後面每一張）：一小步一小步放行時間，等同一張截圖出來
    if (s === "TIMEOUT" && !diag) {   // 第一次卡住：記錄頁面活著沒、在等什麼
      diag = true;
      const probe = () => within(p.evaluate(() => ({ now: Math.round(performance.now()), anims: document.getAnimations().length, mode: window.__zy.mode, idx: window.__zy.idx })), 4000);
      const a = await probe(), st = await step(16), b = await probe();
      console.log("診斷", F, JSON.stringify({ a, step: st, b }));
    }
    for (let k = 0; s === "TIMEOUT" && k < 5; k++) { await p.evaluate(k => { document.getElementById("promoBeat").style.background = `rgba(0,${k % 2},0,0.01)`; }, k); await step(16); s = await within(pr, 1000); if (s !== "TIMEOUT") console.log(`截圖卡住，放行 ${k + 1} 小步後出來`, F); }
    // 偶發卡死（10-11 實測：同一支腳本有時整片順、有時卡在積木／泡泡結尾，一卡就救不回）→ 直接失敗，外面重跑一次通常就過
    if (s === "TIMEOUT") throw new Error(`截圖卡死在第 ${F} 格，請重跑`);
    const buf = s && s.data ? Buffer.from(s.data, "base64") : last; if (!buf) throw new Error("截圖失敗");
    last = buf; fs.writeFileSync(path.join(FR, `f${String(F++).padStart(5, "0")}.jpg`), buf);
  };
  const rec = async (n, each) => { for (let i = 0; i < n; i++) { if (each) await each(i); await step(DT); await shot(); } };
  const E = (fn, arg) => p.evaluate(fn, arg);
  // 不錄的準備時間：虛擬時間往前走、真實時間也等一下（讓圖片／模型下載完）
  const prep = async (cond, arg, max = 60) => { for (let i = 0; i < max; i++) { await step(250); await p.waitForTimeout(60); if (!cond || await p.evaluate(cond, arg)) return true; } return false; };
  const toMenu = async () => { await E(() => { const c = document.getElementById("confirm"); if (!document.getElementById("menu").classList.contains("hidden")) return; document.getElementById("homeBtn").click(); document.getElementById("confirmYes")?.click(); }); await prep(() => !document.getElementById("menu").classList.contains("hidden")); await E(() => { window.__hub3d.events(false); document.getElementById("guide").style.visibility = "hidden"; }); await prep(null, null, 4); };
  const tapOk = (sel) => E(sel => { const o = window.__zy.curOpts || []; const i = o.findIndex(x => x.ok); const b = document.querySelectorAll(sel)[i]; b && b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); }, sel);
  const t0 = Date.now(), lap = n => console.log(`${n}：到第 ${F} 格（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);

  // ===== 1 開場：小島推鏡＋大標 =====
  await rec(126, async i => { await E(z => window.__hub3d.cam(z, 0, 0), 0.94 + i * 0.0011); if (i === 6) await E(() => __promo.banner("注音小島", "5 歲也能自己玩的注音冒險")); if (i === 112) await E(() => __promo.bannerOut()); });
  await E(() => __promo.clear()); lap("開場");

  // ===== 2 九個小遊戲：每個 1 秒多，答對的一瞬間 =====
  await E(() => __promo.chap(1, "九個小遊戲"));
  const GAMES = [
    ["fish", "🎣", "釣魚", "聽聲音，點對的魚", "#pond .fishBtn"], ["order", "🍔", "點餐", "看注音，拿對的食物", "#shelf .item"], ["tone", "🎈", "氣球", "聽聲調，戳對的氣球", "#sky .balloon"],
    ["hunt", "🔍", "尋寶", "看注音，找出寶物", "#scene .obj"], ["build", "🧩", "積木", "把注音拼起來"], ["whack", "🔨", "地鼠", "聽聲音，敲對的地鼠"], ["frog", "🐸", "青蛙", "一個音節跳一片荷葉"], ["match", "🃏", "翻牌", "注音配圖卡"]];
  for (const [m, e, name, sub, sel] of GAMES) {
    await E(m => { const c = document.querySelector(`.mode-card[data-mode=${m}]`); c.click(); if (m === "match") setTimeout(() => document.querySelector("#matchSizes .msize")?.click(), 50); }, m);
    await prep(m => !document.getElementById(m).classList.contains("hidden") && document.getElementById("loading").classList.contains("hidden") && (m === "match" ? document.querySelectorAll("#board .card").length > 0 : true), m);
    await prep(null, null, 3);
    await E(([e, n, s]) => __promo.pill(e, n, s), [e, name, sub]);
    await rec(m === "build" || m === "match" ? 46 : 38, async i => {
      if (sel && i === 10) await tapOk(sel);
      if (m === "whack" && i >= 4 && i % 3 === 0) await E(() => { const s = window.__zy.wq; const c = s && s.cells.find(c => c.ok && c.state === "up"); if (c) c.mole.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); });
      if (m === "frog" && (i === 8 || i === 26)) await E(() => { const c = window.__zy.fq && window.__zy.fq.cols.find(c => c.o.ok); if (c) c.pad.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); });
      if (m === "build" && i >= 4 && i % 4 === 0) await E(() => { const q = window.__zy.round[window.__zy.idx], ss = window.__zy.parseZ(q.word.z); for (const s of ss) { for (const ch of s.sym) { const used = [...document.querySelectorAll("#slots .slot.good")].map(d => d.textContent).join(""); const t = [...document.querySelectorAll("#tray .tile:not(.used)")].find(t => t.dataset.v === ch); if (t) { t.click(); return; } } const tt = document.querySelector(`#toneRow .toneTile[data-v="${s.tone}"]`); const open = document.querySelector("#slots .toneSlot.open"); if (open && tt) { tt.click(); return; } } });
      if (m === "match" && (i === 6 || i === 22)) await E(k => { const cs = [...document.querySelectorAll("#board .card:not(.done)")]; if (!cs.length) return; const w = cs[0]._c.w.h, pair = cs.filter(c => c._c.w.h === w); pair.forEach((c, j) => setTimeout(() => c.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })), j * 120)); }, i);
    });
    await toMenu();
  }
  lap("小遊戲");

  // ===== 3 泡泡救援灣：第 7 關，瞄準支撐點一發救兩隻 =====
  await E(() => __promo.chap(2, "泡泡救援灣"));
  await E(() => { document.querySelector(".mode-card[data-mode=bubble]").click(); });
  await prep(() => !document.getElementById("bubblePick").classList.contains("hidden"));
  await E(() => document.querySelectorAll("#bubbleLevels .bb-lv")[6].click());
  await prep(() => window.__zy.bubble && window.__zy.bubble.state() && window.__zy.bubble.state().level === 6 && !document.getElementById("bubble").classList.contains("hidden"));
  await prep(null, null, 6);
  // 發射的泡泡是隨機的，不一定有「一發掉一大片」的打法 → 每種符號都試算，挑救最多的那顆放上去
  const best = await E(() => {
    const d = window.__zy.bubble.debug; let top = null;
    for (const s of ["ㄅ", "ㄆ", "ㄇ"]) { d.setQueue(s, s); const b = d.bestShot(); const sc = b ? b.rescued * 100 + b.dropped * 10 + b.popped : -1; if (!top || sc > top.sc) top = { s, b, sc }; }
    d.setQueue(top.s, top.s === "ㄅ" ? "ㄆ" : "ㄅ"); return top.b;
  });
  console.log("泡泡最佳一發", JSON.stringify(best));
  await E(() => __promo.pill("🐧", "泡泡救援灣", "三顆一樣就破、救出小企鵝"));
  await rec(196, async i => {   // 「全部救出」後 2.6 秒會進結算畫面：在那之前結束（直式在第 206 格進結算時截圖會卡死）
    if (i <= 40) await E(a => window.__zy.bubble.debug.aim(a), Math.PI / 2 + (best.angle - Math.PI / 2) * Math.min(1, i / 36));
    if (i === 46) await E(() => window.__zy.bubble.debug.fire());
    if (i === 4) await E(() => __promo.banner("瞄準支撐點", "一發救出一大片！", "small low"));   // 瞄準時先出標語、發射前收掉：掉落和「全部救出來了」都不被擋
    if (i === 40) await E(() => __promo.bannerOut());
  });
  await E(() => __promo.clear()); await toMenu(); lap("泡泡");

  // ===== 4 天氣：下雨 → 颱風 → 雨停出彩虹（貓頭鷹會說） =====
  await E(() => { window.__zy.setWeather("rain"); document.getElementById("guide").style.visibility = ""; });
  await prep(null, null, 14);
  await E(() => __promo.chap(3, "天氣會變"));
  await rec(225, async i => {
    await E(z => window.__hub3d.cam(z, 0, 0), 1.0 + i * 0.0006);
    if (i === 2) await E(() => __promo.pill("🌧️", "下雨", "滴答滴答", true));
    if (i === 70) await E(() => { window.__zy.setWeather("typhoon"); __promo.pill("🌀", "颱風", "大家待在家裡", true); });
    if (i === 145) await E(() => { window.__zy.setWeather("sunny"); __promo.pill("🌈", "雨停了", "出彩虹！", true); });
  });
  await E(() => { __promo.clear(); document.getElementById("guide").style.visibility = "hidden"; }); lap("天氣");

  // ===== 5 新市區：鏡頭飛過橋，消防車、警車出動 =====
  await E(() => __promo.chap(4, "新市區"));
  await rec(225, async i => {
    if (i === 4) await E(() => window.__hub3d.goPlace("town"));
    if (i === 72) await E(() => { window.__hub3d.tapCivic("police"); });
    if (i === 84) await E(() => { window.__hub3d.tapCivic("fire"); });
    if (i === 96) await E(() => __promo.banner("警察局・消防局・醫院・學校", "收集貼紙，小鎮越蓋越大", true));
    if (i === 205) await E(() => __promo.bannerOut());
  });
  await E(() => { __promo.clear(); window.__hub3d.goPlace("main"); }); lap("新市區");

  // ===== 6 扭蛋機：星星換扭蛋幣 → 轉一轉 → 紫色膠囊 → 點蛋孵出新朋友 =====
  await prep(null, null, 6);
  await E(() => __promo.chap(5, "扭蛋機・動物朋友"));
  await E(() => document.querySelector("#menu .jarBtn").click());
  await prep(() => !document.getElementById("gacha").classList.contains("hidden"));
  await rec(250, async i => {
    if (i === 8) await E(() => document.getElementById("gachaGo").click());
    if (i === 62) await E(() => document.getElementById("gachaCap").click());
    if (i === 92 || i === 118 || i === 144) await E(() => { const e = document.getElementById("hatchEgg"); e && e.click(); });
    if (i === 120) await E(() => __promo.pill("🐣", "28 隻動物朋友", "點心餵牠，從寶寶長大", true));
    if (i === 236) await E(() => { document.getElementById("hatchClose")?.click(); });
  });
  await E(() => { __promo.clear(); document.getElementById("gacha").classList.add("hidden"); });
  lap("扭蛋");

  // ===== 7 片尾卡 =====
  await prep(null, null, 10);
  await rec(130, async i => { if (i === 0) await E(() => __promo.end()); });
  lap("片尾");
  await browser.close();
  if (errs.length) console.log("頁面錯誤：\n" + errs.join("\n"));

  // ===== 合成：30fps 影格＋背景音樂（淡入 1 秒、淡出 2 秒） =====
  const dur = F / FPS, bgm = path.join(ROOT, "music", "zy_bgm_island.mp3");
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FR, "f%05d.jpg"), "-stream_loop", "-1", "-i", bgm,
    "-filter_complex", `[1:a]afade=t=in:st=0:d=1,afade=t=out:st=${(dur - 2).toFixed(2)}:d=2,volume=0.9[a]`, "-map", "0:v", "-map", "[a]", "-t", dur.toFixed(2),
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", OUTMP4], { encoding: "utf8" });
  if (r.status !== 0) { console.error("ffmpeg 失敗", r.stderr); process.exit(1); }
  console.log(`完成：${OUTMP4}（${F} 格、${dur.toFixed(1)} 秒）`);
  if (!process.argv.includes("--keep")) fs.rmSync(FR, { recursive: true, force: true });
})().catch(e => { console.error("FATAL", e.stack || e.message); process.exit(1); });
