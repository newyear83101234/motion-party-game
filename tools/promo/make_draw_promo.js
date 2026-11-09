// 畫畫樂園宣傳片（11-01，阿葉：「錄一段 30-40 秒的介紹影片，參考注音島的錄製方式」）
// 錄法照注音小島 v3（tools/promo/make_promo_v3.js）：headless Chromium＋CDP 虛擬時間＋逐格下令畫面（beginFrame）30fps；
//   疊字用頁面 DOM（#promo，字型從 Google Fonts 載粉圓）；遊戲自己的聲音記在 window.__sfx（js/draw-audio.js 的錄影掛勾），
//   最後 ffmpeg 合成：背景音樂＋遊戲音效（檔案）＋音符（照音高合成）＋轉場音效
// 分鏡（約 38 秒）：開場標題 → 首頁點小貓 → 魔法筆塗色 → 完成跳舞＋大章＋開扭蛋 → 畫變成音樂 → 放進我的世界
//                  → 鏡子魔法畫 → 拼圖 → 變色龍躲貓貓 → 片尾
// 用法：node tools/promo/make_draw_promo.js [輸出.mp4] [--noenc＝只錄影格不合成] [--keep＝留下影格]
//       偶發「畫面卡死」會直接失敗 → 重跑
// 需要：本機伺服器 http://127.0.0.1:8765（專案根目錄）、ffmpeg、網路（開場字型）
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const { launch } = require("../zy-test/lib");
const ROOT = path.resolve(__dirname, "../..");
const ARGV = process.argv.slice(2), flag = n => ARGV.includes(n);
const OUTMP4 = path.resolve(ARGV.find(a => !a.startsWith("--")) || path.join(ROOT, "promo", "draw-promo.mp4"));
const FR = path.join(os.tmpdir(), "draw_promo_frames");
const URL0 = process.env.DRAW_URL || "http://127.0.0.1:8765/draw.html";
const VW = 1280, VH = 720, FPS = 30, DT = 1000 / FPS;

// 疊字用到的字（拿去跟 Google Fonts 要粉圓子集）
const TEXTS = ["畫畫樂園", "給小朋友的著色遊戲", "36 張線稿・三種難度", "魔法筆：塗到哪，顏色就出現", "畫完開扭蛋，收集貼紙",
  "把畫彈成音樂", "畫好的角色住進我的世界", "鏡子魔法畫", "自己的畫變拼圖", "變色龍躲貓貓", "iPad 打開就能玩", "免費",
  "扭蛋貼紙本", "我的世界", "鏡子畫", "拼圖", "躲貓貓", "刮刮樂", "10 種畫筆"];

const CSS = font => `
@font-face { font-family: "PromoHuninn"; src: url("${font}") format("woff2"); font-display: block; }
#promo { position: fixed; inset: 0; z-index: 100000; pointer-events: none; overflow: hidden; font-family: "PromoHuninn", "Huninn", "PingFang TC", sans-serif; }
#promo * { box-sizing: border-box; }
#toast { display: none !important; }   /* 錄影時不顯示「💾 存檔中」（虛擬時間下存檔比較久，會一直掛在畫面中間） */
/* 開場：淡奶油底＋四個大字一個一個彈進來（每字不同顏色、白色粗框），變色龍跳上來，下面一條副標 */
#promo .ttl { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 2vmin;
  background: radial-gradient(circle at 50% 45%, #fffaf0 0 30%, #ffefd2 75%); animation: fadeIn .25s both; }
#promo .ttl.out { animation: fadeOut .35s both; }
#promo .ttl .row { display: flex; align-items: center; gap: 2vmin; }
#promo .ttl img { height: 28vmin; animation: jumpIn .7s cubic-bezier(.2,1.6,.4,1) .55s both; filter: drop-shadow(0 1.5vmin 1.2vmin rgba(90,60,20,.25)); }
#promo .ttl .lg { display: flex; }
#promo .ttl .lg b { font-size: 20vmin; line-height: 1; -webkit-text-stroke: 2.4vmin #fff; paint-order: stroke fill; text-shadow: 0 1.4vmin 0 rgba(90,60,20,.18);
  animation: popChar .5s cubic-bezier(.2,1.7,.4,1) both; animation-delay: calc(.12s * var(--i) + .1s); }
#promo .ttl .sub { font-size: 5.4vmin; color: #fff; background: #ff7eb6; padding: 1.2vmin 4vmin; border-radius: 6vmin; box-shadow: 0 .8vmin 0 #d9558f;
  animation: popChar .5s cubic-bezier(.2,1.6,.4,1) .85s both; }
@keyframes popChar { 0% { opacity: 0; transform: scale(2.6) rotate(-12deg); } 60% { opacity: 1; } 100% { opacity: 1; transform: none; } }
@keyframes jumpIn { 0% { opacity: 0; transform: translateY(30vmin) scale(.6); } 100% { opacity: 1; transform: none; } }
@keyframes fadeIn { from { opacity: 0; } } @keyframes fadeOut { to { opacity: 0; } }
/* 說明泡泡：下方置中，左邊圓形 emoji＋一句話 */
#promo .cap { position: absolute; left: 50%; bottom: 4.5vmin; display: flex; align-items: center; gap: 2vmin; padding: 1.2vmin 4vmin 1.2vmin 1.2vmin;
  background: #fff; border-radius: 8vmin; box-shadow: 0 1vmin 0 rgba(226,196,143,.9), 0 2vmin 4vmin rgba(90,60,20,.25);
  transform: translateX(-50%); animation: capIn .45s cubic-bezier(.2,1.5,.4,1) both; white-space: nowrap; }
#promo .cap.out { animation: capOut .3s ease-in both; }
#promo .cap i { width: 10vmin; height: 10vmin; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 6vmin; background: var(--c, #ffc93c); }
#promo .cap span { font-size: 5.6vmin; color: #3b2a1a; }
@keyframes capIn { 0% { opacity: 0; transform: translate(-50%, 6vmin) scale(.8); } 100% { opacity: 1; transform: translate(-50%, 0); } }
@keyframes capOut { to { opacity: 0; transform: translate(-50%, 4vmin) scale(.9); } }
/* 示範的手指（指尖對準點下去的位置）＋點下去的水波 */
#promo .pf { position: absolute; left: 0; top: 0; font-size: 9vmin; line-height: 1; transform: translate(-30%, -8%); filter: drop-shadow(0 .8vmin .8vmin rgba(0,0,0,.35)); transition: opacity .2s; }
#promo .pf.hide { opacity: 0; }
#promo .pr { position: absolute; width: 9vmin; height: 9vmin; margin: -4.5vmin 0 0 -4.5vmin; border-radius: 50%; border: .9vmin solid #fff; box-shadow: 0 0 0 .5vmin #ffc93c;
  animation: rip .5s ease-out both; }
@keyframes rip { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
/* 轉場：三塊斜色塊（黃、綠、藍）從右掃到全蓋住，再往左掃開 */
#promo .wipe { position: absolute; inset: 0; }
#promo .wipe i { position: absolute; top: -20%; bottom: -20%; transform: skewX(-14deg); }
#promo .wipe i:nth-child(1) { left: -35%; width: 95%; background: #ffc93c; }
#promo .wipe i:nth-child(2) { left: 45%; width: 95%; background: #4fcf9b; }
#promo .wipe i:nth-child(3) { left: 118%; width: 32%; background: #4fb3ff; }
#promo .wipe.cover i { animation: wpIn .3s cubic-bezier(.3,0,.2,1) both; } #promo .wipe.cover i:nth-child(2) { animation-delay: .04s; } #promo .wipe.cover i:nth-child(3) { animation-delay: .08s; }
#promo .wipe.reveal i { animation: wpOut .36s cubic-bezier(.5,0,.3,1) both; } #promo .wipe.reveal i:nth-child(2) { animation-delay: .05s; } #promo .wipe.reveal i:nth-child(3) { animation-delay: .1s; }
@keyframes wpIn { 0% { translate: 160vw 0; } 100% { translate: 0 0; } }
@keyframes wpOut { 0% { translate: 0 0; } 100% { translate: -170vw 0; } }
/* 片尾：標題＋變色龍＋功能小卡一排＋「iPad 打開就能玩・免費」 */
#promo .end { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 3vmin;
  background: radial-gradient(circle at 50% 40%, #fffaf0 0 35%, #ffe9c6 85%); }
#promo .end .row { display: flex; align-items: center; gap: 2vmin; }
#promo .end img.m { height: 22vmin; animation: jumpIn .6s cubic-bezier(.2,1.6,.4,1) .1s both; }
#promo .end .lg b { font-size: 15vmin; line-height: 1; -webkit-text-stroke: 2vmin #fff; paint-order: stroke fill; text-shadow: 0 1.2vmin 0 rgba(90,60,20,.18);
  display: inline-block; animation: popChar .5s cubic-bezier(.2,1.7,.4,1) both; animation-delay: calc(.08s * var(--i)); }
#promo .end .chips { display: flex; gap: 1.6vmin; }
#promo .end .chip { display: flex; flex-direction: column; align-items: center; gap: .6vmin; width: 14vmin; padding: 1.4vmin 0 1.2vmin; background: #fff; border-radius: 3vmin;
  box-shadow: 0 .8vmin 0 rgba(226,196,143,.9); animation: popChar .45s cubic-bezier(.2,1.6,.4,1) both; animation-delay: calc(.5s + .07s * var(--i)); }
#promo .end .chip img { width: 8vmin; height: 8vmin; object-fit: contain; }
#promo .end .chip span { font-size: 2.6vmin; color: #6b5233; white-space: nowrap; }
#promo .end .tag { font-size: 5.4vmin; color: #fff; background: #4fcf9b; padding: 1.2vmin 5vmin; border-radius: 6vmin; box-shadow: 0 .8vmin 0 #2e9e6e;
  animation: popChar .5s cubic-bezier(.2,1.6,.4,1) 1.1s both; }
`;

// 疊字的小工具（在頁面裡跑）：window.P
const OVERLAY = () => {
  const root = document.createElement("div"); root.id = "promo"; document.body.appendChild(root);
  const el = (cls, html) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
  const COL = ["#ff6b5b", "#ffc93c", "#4fcf9b", "#4fb3ff"];
  const logo = (cls = "lg") => `<div class="${cls}">${[..."畫畫樂園"].map((c, i) => `<b style="--i:${i};color:${COL[i]}">${c}</b>`).join("")}</div>`;
  let cap = null, finger = null;
  window.P = {
    title() { this.t = el("ttl", `<div class="row"><img src="IMAGE/draw/ui/mascot.png?v=13" alt="">${logo()}</div><div class="sub">給小朋友的著色遊戲</div>`); },
    titleOut() { this.t?.classList.add("out"); setTimeout(() => this.t?.remove(), 400); },
    cap(emo, text, c = "#ffc93c") { this.capOut(); cap = el("cap", `<i style="--c:${c}">${emo}</i><span>${text}</span>`); },
    capOut() { if (!cap) return; const c = cap; cap = null; c.classList.add("out"); setTimeout(() => c.remove(), 320); },
    finger(x, y) { if (!finger) finger = el("pf", "👆"); finger.classList.remove("hide"); finger.style.left = x + "px"; finger.style.top = y + "px"; },
    fingerHide() { finger?.classList.add("hide"); },
    // 模擬手指：在頁面裡送 PointerEvent（虛擬時間暫停時，CDP 的觸控事件會等頁面回應而卡死；注音小島宣傳片也是在頁面裡點）
    ptr(type, x, y) {
      if (type === "pointerdown") this.tgt = document.elementFromPoint(x, y);   // #promo 不擋手指，點到的是底下的東西
      const t = this.tgt || document.elementFromPoint(x, y);
      t?.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true,
        buttons: type === "pointerup" ? 0 : 1, pressure: type === "pointerup" ? 0 : 0.5, width: 20, height: 20 }));
      if (type === "pointerup") this.tgt = null;
    },
    ripple(x, y) { const r = el("pr", ""); r.style.left = x + "px"; r.style.top = y + "px"; setTimeout(() => r.remove(), 600); },
    wipe(kind) { document.querySelectorAll("#promo .wipe").forEach(w => w.remove()); el("wipe " + kind, "<i></i><i></i><i></i>"); },
    end() {
      const chips = [["mode-mirror", "鏡子畫"], ["mode-world", "我的世界"], ["btn-book", "扭蛋貼紙本"], ["mode-puzzle", "拼圖"], ["mode-seek", "躲貓貓"], ["btn-gift", "刮刮樂"]];
      el("end", `<div class="row"><img class="m" src="IMAGE/draw/ui/mascot.png?v=13" alt="">${logo()}</div>
        <div class="chips">${chips.map(([n, t], i) => `<div class="chip" style="--i:${i}"><img src="IMAGE/draw/ui/${n}.png?v=13" alt=""><span>${t}</span></div>`).join("")}</div>
        <div class="tag">iPad 打開就能玩・免費</div>`);
    },
  };
};

(async () => {
  fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  // 粉圓子集（只含疊字用到的字）
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
  const fcss = await (await fetch("https://fonts.googleapis.com/css2?family=Huninn&display=block&text=" + encodeURIComponent([...new Set(TEXTS.join(""))].join("")), { headers: { "User-Agent": UA } })).text();
  const FONT = (fcss.match(/url\((https:[^)]+)\)\s*format\(['"]woff2['"]\)/) || [])[1];
  if (!FONT) throw new Error("拿不到粉圓字型");

  const browser = await launch(["--enable-begin-frame-control", "--run-all-compositor-stages-before-draw", "--disable-threaded-animation", "--disable-threaded-scrolling", "--disable-checker-imaging", "--disable-new-content-rendering-timeout", ...(process.env.PROMO_FLAG ? [process.env.PROMO_FLAG] : [])]);
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: true });
  await ctx.addInitScript(() => {
    // 頁面不出聲（沒有 AudioContext＝音訊引擎安靜略過）；window.__sfx＝音訊引擎的錄影掛勾，記下每個聲音，影片再照時間點疊上
    window.AudioContext = undefined; window.webkitAudioContext = undefined; window.__sfx = [];
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(() => cb(performance.now()));   // 虛擬時間：rAF 的時間戳跟 performance.now 一致
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 160)); });
  const within = (pr, ms) => Promise.race([pr, new Promise(r => setTimeout(() => r("TIMEOUT"), ms))]);
  const cdp = await ctx.newCDPSession(p);
  const bf = shot => within(cdp.send("HeadlessExperimental.beginFrame", shot ? { interval: DT, screenshot: { format: "jpeg", quality: 92 } } : { interval: DT }), 15000);
  let pumping = true; const pump = (async () => { while (pumping) { await bf(false).catch(() => {}); await new Promise(r => setTimeout(r, 30)); } })();   // 準備階段：一直打幀（不然 rAF 不會跑）
  const E = (fn, arg) => p.evaluate(fn, arg);

  // ── 準備（不錄）：乾淨的存檔、先畫好小狗／小兔／貓頭鷹（我的世界裡要有朋友） ──
  await p.goto(URL0); await p.waitForTimeout(500);
  await E(() => { localStorage.clear(); localStorage.setItem("draw-hinted", "1"); localStorage.setItem("draw-world", JSON.stringify({ hint: 2 })); indexedDB.deleteDatabase("draw-gallery"); });
  await p.reload();
  await p.waitForFunction(() => window.__draw && document.querySelector("#arts .card") && __draw.rewards(), null, { timeout: 30000, polling: 200 });
  for (const id of ["animal-3", "animal-5", "animal-6"]) {
    await E(async id => { const a = (await (await fetch("IMAGE/draw/lineart/index.json")).json()).arts.find(x => x.id === id); await __draw.startArt(a); __draw.AUTO.ms = 1e9; __draw.board.ctx.drawImage(__draw.painter.magicPaint(), 0, 0); }, id);
    await E(() => document.querySelector("#bDone").click());
    await p.waitForFunction(() => document.querySelector("#after").classList.contains("on"), null, { timeout: 30000, polling: 200 });
  }
  await E(() => document.querySelector("#aHome").click());
  await p.waitForFunction(() => document.querySelector('#arts .card[data-id="animal-3"].mine'), null, { timeout: 15000, polling: 200 });
  await p.addStyleTag({ content: CSS(FONT) }); await E(OVERLAY);
  await E(() => Promise.all([document.fonts.load('10px "PromoHuninn"', "畫畫樂園"), ...["mascot", "mode-mirror", "mode-world", "btn-book", "mode-puzzle", "mode-seek", "btn-gift"].map(n => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = `IMAGE/draw/ui/${n}.png?v=13`; }))]));
  // 扭蛋的貼紙圖也先載好（不然大章蓋完要等圖片下載，扭蛋很久才出現）
  const STK = fs.readdirSync(path.join(ROOT, "IMAGE/draw/stickers")).filter(f => f.endsWith(".png"));
  await E(list => Promise.all(list.map(f => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = "IMAGE/draw/stickers/" + f + "?v=13"; }))), STK);
  await p.waitForTimeout(800);
  pumping = false; await pump;

  // ── 錄影：虛擬時間，一格一格推 ──
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  const step = ms => within(new Promise(res => { cdp.once("Emulation.virtualTimeBudgetExpired", () => res("ok")); cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: ms }); }), 15000);
  let F = 0, last = null;
  const SFX = []; const sfx = (k, dt = 0, vol = 1, rate = 1) => SFX.push({ k, t: F / FPS + dt, vol, rate });
  // 心跳點：每格換一點點顏色 → 每一格一定有東西要重畫；順便收走這一格遊戲發出的聲音
  const beat = () => E(f => {
    let d = document.getElementById("promoBeat"); if (!d) { d = document.createElement("div"); d.id = "promoBeat"; d.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;z-index:100001;pointer-events:none"; document.body.appendChild(d); }
    d.style.background = `rgba(${f % 2 ? 1 : 0},0,0,0.01)`;
    // 逐格出畫面時，有些畫面（躲貓貓、拼圖拼好、扭蛋）頁面的動畫時鐘 document.timeline 會停住（畫面還是有在出、rAF 也有跑），
    // CSS 動畫就全卡在第 0 格。補法：每格量「虛擬時間走了多少 − 動畫時鐘走了多少」，把差的直接加到每個正在跑的動畫上；時鐘之後一次追上來時差是負的，會自動扣回去
    const st = window.__tlFix || (window.__tlFix = { p: performance.now(), t: document.timeline.currentTime, seen: new WeakSet() });
    const pn = performance.now(), tn = document.timeline.currentTime, lag = (pn - st.p) - (tn - st.t);
    st.p = pn; st.t = tn;
    for (const a of document.getAnimations()) {
      if (Math.abs(lag) > 1 && a.playState === "running" && st.seen.has(a)) a.currentTime = Math.max(0, a.currentTime + lag);
      st.seen.add(a);
    }
    return Array.isArray(window.__sfx) ? window.__sfx.splice(0) : [];
  }, F);
  const takeSnd = list => { for (const e of list) SFX.push({ k: e.bus === "sfx" ? e.name : e.bus + ":" + e.name + ":" + e.i, t: F / FPS + (e.at || 0), vol: e.vol, rate: e.rate || 1, game: true }); };
  let missing = 0;
  const shot = async () => {
    takeSnd(await beat());
    let r = await bf(true);
    // 瀏覽器這一格還沒畫好（沒有截圖）：不要沿用上一格（會整段定格），等一下再要一次
    for (let k = 0; k < 30 && r !== "TIMEOUT" && !(r && r.screenshotData); k++) { missing++; await p.waitForTimeout(60); await beat(); r = await bf(true); }
    if (r === "TIMEOUT") throw new Error(`畫面卡死在第 ${F} 格，請重跑`);
    const buf = r && r.screenshotData ? Buffer.from(r.screenshotData, "base64") : last; if (!buf) throw new Error("第一格沒有畫面");
    last = buf; fs.writeFileSync(path.join(FR, `f${String(F++).padStart(5, "0")}.jpg`), buf);
  };
  const rec = async (n, each) => { for (let i = 0; i < n; i++) { if (each) await each(i); await step(DT); await shot(); } };
  const recUntil = async (cond, max, each) => { let i = 0; for (; i < max; i++) { if (await E(cond).catch(() => false)) break; if (each) await each(i); await step(DT); await shot(); } return i; };
  // 不錄的準備時間（換畫面、等圖片載入）：虛擬時間往前走、真實時間也等一下；這段發出的聲音丟掉
  const prep = async (cond, max = 80) => {
    for (let i = 0; i < max; i++) { await step(250); await bf(false); await p.waitForTimeout(40); if (!cond || await E(cond).catch(() => false)) break; }
    await E(() => { if (Array.isArray(window.__sfx)) window.__sfx.length = 0; });
  };
  const touch = (type, x, y) => E(([t, x, y]) => P.ptr(t, x, y), [{ touchStart: "pointerdown", touchMove: "pointermove", touchEnd: "pointerup" }[type], x, y]);
  let fx = VW * 0.62, fy = VH * 0.9;   // 手指目前位置
  const moveFinger = async (x, y, n) => { const x0 = fx, y0 = fy; await rec(n, async i => { const t = (i + 1) / n, e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; fx = x0 + (x - x0) * e; fy = y0 + (y - y0) * e; await E(([a, b]) => P.finger(a, b), [fx, fy]); }); };
  const tapAt = async (x, y) => { await E(([a, b]) => P.ripple(a, b), [x, y]); await touch("touchStart", x, y); await step(DT); await shot(); await touch("touchEnd", x, y); };
  const center = sel => E(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  const wipe = async (between) => {
    await E(() => P.wipe("cover")); sfx("whoosh"); await rec(11);
    await E(() => { P.capOut(); P.fingerHide(); });
    await between();
    await E(() => P.wipe("reveal")); await rec(11);
  };
  const lap = name => console.log(`${name}：到第 ${F} 格（${(F / FPS).toFixed(1)} 秒）`);


  // ===== 1. 開場標題（約 2.8 秒） =====
  await E(() => P.title()); sfx("magic", 0.05, 0.7);
  for (let i = 0; i < 4; i++) sfx("pop", 0.15 + 0.12 * i, 0.8, 1 + i * 0.08);
  sfx("finish", 0.6, 0.55);
  await rec(78);
  await E(() => P.titleOut()); await rec(10);
  lap("開場");

  // ===== 2. 首頁：手指點小貓（約 2.3 秒） =====
  await E(() => P.cap("🎨", "36 張線稿・三種難度", "#ffc93c"));
  const [cx, cy] = await center('#arts .card[data-id="animal-1"]');
  await moveFinger(cx, cy, 26); await rec(6);
  await tapAt(cx, cy);
  await wipe(async () => { await prep(() => document.querySelector("#paint").classList.contains("on") && __draw.board.labels && !__draw.S.busy); });
  lap("首頁");

  // ===== 3. 魔法筆（約 6.5 秒）：點筆刷 → 選魔法筆 → 手指塗滿小貓 =====
  await E(() => P.cap("🪄", "魔法筆：塗到哪，顏色就出現", "#b388ff"));
  const [bx, by] = await center('#bar [data-tool="brush"]');
  await moveFinger(bx, by, 16); await tapAt(bx, by); await rec(8);
  const [mx, my] = await center('#pop .opt[aria-label="magic"]');
  await moveFinger(mx, my, 12); await tapAt(mx, my); await rec(10);
  await E(() => Object.assign(__draw.S, { size: 2, clip: false }));
  // 塗的路線：只在小貓身上（不碰圖邊的區塊；黑線也算），之字形一排一排、排距比筆寬小（塗得滿）；離開小貓就抬手，分成好幾筆
  const strokes = await E(() => {
    const b = __draw.board, edge = new Set(), L = b.labels, W = b.W, H = b.H;
    for (let x = 0; x < W; x += 4) { edge.add(L[x]); edge.add(L[(H - 1) * W + x]); }
    for (let y = 0; y < H; y += 4) { edge.add(L[y * W]); edge.add(L[y * W + W - 1]); }
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    b.boxes.forEach((r, id) => { if (edge.has(id)) return; x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1); });
    const inside = (x, y) => { const v = L[(Math.round(y) * W) + Math.round(x)]; return v === -1 || (v >= 0 && !edge.has(v)); };
    const out = [], rows = 17, gap = (y1 - y0) / rows;
    let cur = [];
    for (let r = 0; r <= rows; r++) {
      const y = y0 + gap * r, n = Math.ceil((x1 - x0) / 34), xs = r % 2 ? [x1, x0] : [x0, x1];
      for (let k = 0; k <= n; k++) {
        const x = xs[0] + (xs[1] - xs[0]) * k / n, yy = y + Math.sin(k / 2) * 10;
        if (inside(x, yy)) { const c = b.toClient(x, yy); cur.push([c.x, c.y]); }
        else if (cur.length) { if (cur.length > 2) out.push(cur); cur = []; }
      }
    }
    if (cur.length > 2) out.push(cur);
    return out;
  });
  const PER = 8;   // 每一格送 8 個點（像 iPad 一次觸控帶好幾個點），手指移動速度像小孩快速塗
  for (const st of strokes) {
    await moveFinger(st[0][0], st[0][1], 3);
    await touch("touchStart", st[0][0], st[0][1]);
    await rec(Math.ceil((st.length - 1) / PER), async i => {
      for (let k = 1; k <= PER; k++) { const q = st[Math.min(st.length - 1, i * PER + k)]; fx = q[0]; fy = q[1]; await touch("touchMove", fx, fy); }
      await E(([a, b]) => P.finger(a, b), [fx, fy]);
    });
    await touch("touchEnd", fx, fy);
  }
  await rec(10);
  lap("魔法筆");

  // ===== 4. 完成：跳舞＋大章＋開扭蛋（約 7 秒） =====
  const [dx, dy] = await center("#bDone");
  await moveFinger(dx, dy, 14); await tapAt(dx, dy); await E(() => P.fingerHide());
  await recUntil(() => !!document.querySelector(".big-cheer"), 120);
  await rec(30);
  await E(() => P.cap("🎁", "畫完開扭蛋，收集貼紙", "#ff9ec9"));
  await recUntil(() => !!document.querySelector("#gacha .g-egg.wait"), 120);
  await rec(4);
  const [ex, ey] = await center("#gacha .g-egg");
  await moveFinger(ex, ey, 8); await tapAt(ex, ey);
  await rec(30); await tapAt(ex, ey); await E(() => P.fingerHide());   // 貼紙看一下就再點一下收進貼紙本（小孩真的會這樣點）
  await recUntil(() => !document.querySelector("#gacha") && document.querySelector("#after").classList.contains("on"), 180);
  await rec(12);
  lap("扭蛋");

  // ===== 5. 畫變成音樂（約 2.6 秒） =====
  await E(() => P.cap("🎵", "把畫彈成音樂", "#ffb35c"));
  const [ux, uy] = await center("#aMusic");
  await moveFinger(ux, uy, 12); await tapAt(ux, uy); await E(() => P.fingerHide());
  await rec(36);
  await wipe(async () => {
    await E(() => { __draw.music()?.stop(); document.querySelector("#after").classList.remove("on"); __draw.world().open("animal", { arrive: __draw.S.workId }); });
    await prep(() => window.__world && window.__world.entries().length >= 4, 40);
  });
  lap("音樂");

  // ===== 6. 我的世界（約 5 秒）：小貓從天空飛下來，點一隻牠會跳 =====
  await E(() => P.cap("🌳", "畫好的角色住進我的世界", "#4fcf9b"));
  await rec(64);
  const mob = await E(() => { const m = [...document.querySelectorAll("#world .w-mob")].map(d => d.getBoundingClientRect()).filter(r => r.width > 40 && r.x > 60 && r.right < innerWidth - 60).sort((a, b) => b.width - a.width)[0]; return m ? [m.x + m.width / 2, m.y + m.height * 0.45] : null; });
  if (mob) { await moveFinger(mob[0], mob[1], 14); await tapAt(mob[0], mob[1]); }
  await rec(26);
  await wipe(async () => { await E(() => { __draw.world().close(); __draw.mirror.open(); }); await prep(() => document.querySelector("#mirror").classList.contains("on"), 20); });
  lap("世界");

  // ===== 7. 鏡子魔法畫（約 3.2 秒）：第一次打開會自己示範一朵花，再用手指畫一筆 =====
  await E(() => P.cap("✨", "鏡子魔法畫", "#8f86ff"));
  await rec(28);
  const mpts = await E(() => { const r = document.querySelector("#mirror .x-art").getBoundingClientRect(), out = []; for (let k = 0; k <= 30; k++) { const a = k / 30 * Math.PI * 1.6; out.push([r.x + r.width * (0.5 + 0.3 * Math.cos(a) * (0.5 + k / 60)), r.y + r.height * (0.5 + 0.3 * Math.sin(a) * (0.5 + k / 60))]); } return out; });
  await moveFinger(mpts[0][0], mpts[0][1], 6);
  await touch("touchStart", mpts[0][0], mpts[0][1]);
  await rec(mpts.length - 1, async i => { const [x, y] = mpts[i + 1]; fx = x; fy = y; await touch("touchMove", x, y); await E(([a, b]) => P.finger(a, b), [x, y]); });
  await touch("touchEnd", fx, fy); await E(() => P.fingerHide()); await rec(12);
  await wipe(async () => {
    await E(() => { __draw.mirror.close(); const c = __draw.board.composite(); window.__pzSrc = c; return __draw.puzzle.open(c); });
    await prep(() => window.__puzzle && window.__puzzle.pieces().length >= 4, 30);
  });
  lap("鏡子畫");

  // ===== 8. 拼圖（約 2.6 秒）：散開，再拼好兩塊 =====
  await E(() => P.cap("🧩", "自己的畫變拼圖", "#8fbfff"));
  await rec(44);
  await E(() => window.__puzzle.solve(2));
  await rec(34);
  await wipe(async () => { await E(() => { __draw.puzzle.close(); __draw.seek.open(); }); await prep(() => document.querySelector("#seek").classList.contains("on") && window.__seek && window.__seek.where(), 40); });
  lap("拼圖");

  // ===== 9. 變色龍躲貓貓（約 3 秒）：第一次會先揮手再跑去躲 =====
  await E(() => P.cap("🦎", "變色龍躲貓貓", "#9be06a"));
  await rec(90);
  await wipe(async () => { await E(() => { __draw.seek.close(); P.end(); }); await prep(null, 2); });
  lap("躲貓貓");

  // ===== 10. 片尾（約 3.5 秒） =====
  sfx("magic", 0.05, 0.7); for (let i = 0; i < 6; i++) sfx("pop", 0.55 + 0.07 * i, 0.5, 1 + i * 0.06); sfx("finish", 1.1, 0.5);
  await rec(76);
  lap("片尾");

  console.log(`沒拿到截圖重試了 ${missing} 次`);
  if (errs.length) console.log("頁面錯誤：\n" + errs.slice(0, 10).join("\n"));
  await browser.close();
  if (!flag("--noenc")) encode(F, SFX);
  if (!flag("--keep") && !flag("--noenc")) fs.rmSync(FR, { recursive: true, force: true });
})().catch(e => { console.error("FATAL", e.stack || e.message); process.exit(1); });

// ===== 合成：30fps 影格＋背景音樂（audio/draw/bgm.mp3，淡入淡出）＋音效檔＋音符（照音高合成）＋轉場咻聲 =====
function encode(F, SFX) {
  const dur = F / FPS, SD = path.join(FR, "sfx"); fs.mkdirSync(SD, { recursive: true });
  const synth = (name, filter, d) => { const out = path.join(SD, name.replace(/[^a-z0-9_]/gi, "_") + ".wav"); if (fs.existsSync(out)) return out; const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", filter, "-t", String(d), out], { encoding: "utf8" }); if (r.status !== 0) throw new Error("合成音效失敗 " + name + r.stderr); return out; };
  const PENTA = [261.63, 293.66, 329.63, 392, 440];
  const FILES = { whoosh: synth("whoosh", "anoisesrc=d=0.35:c=pink:r=44100:a=0.6,bandpass=f=1800:w=1400,afade=t=in:d=0.08,afade=t=out:st=0.12:d=0.23", 0.35) };
  for (const f of fs.readdirSync(path.join(ROOT, "audio", "draw", "sfx"))) if (f.endsWith(".mp3") && !f.startsWith("_")) FILES[f.slice(0, -4)] = path.join(ROOT, "audio", "draw", "sfx", f);
  // 音符：note → 三角波＋高八度、木琴／鐵琴 → 正弦泛音、撥弦 → 鋸齒、笛子 → 正弦、鼓 → 低音（跟遊戲裡的合成音色接近）
  const toneFile = k => {
    const [, kind, iStr] = k.split(":"), i = +iStr || 0, f = PENTA[i % 5] * 2 ** Math.floor(i / 5);
    if (kind === "drum") return synth("drum" + i, `sine=f=${(150 + i * 6).toFixed(1)}:r=44100:d=0.3,volume=1.8,afade=t=out:st=0.03:d=0.27`, 0.3);
    if (kind === "flute") return synth("flute" + i, `sine=f=${(f * 2).toFixed(2)}:r=44100:d=0.6,afade=t=in:d=0.08,afade=t=out:st=0.35:d=0.25`, 0.6);
    if (kind === "pluck") return synth("pluck" + i, `aevalsrc='0.6*(2*mod(t*${f.toFixed(2)}\\,1)-1)*exp(-6*t)':s=44100:d=0.7,lowpass=f=${(f * 4).toFixed(0)}`, 0.7);
    const mul = kind === "glock" ? 4 : kind === "marimba" ? 2 : 1;   // note（選顏色、星星）＝基音
    return synth(kind + i, `aevalsrc='(sin(2*PI*${(f * mul).toFixed(2)}*t)+0.3*sin(2*PI*${(f * mul * 2.76).toFixed(2)}*t))*exp(-${kind === "glock" ? 4 : 7}*t)':s=44100:d=0.8`, 0.8);
  };
  const ev = [], lastAt = {};
  for (const s of SFX.slice().sort((a, b) => a.t - b.t)) {
    const file = s.k.includes(":") ? toneFile(s.k) : FILES[s.k];
    if (!file || s.t > dur - 0.1) continue;
    if (lastAt[s.k] !== undefined && s.t - lastAt[s.k] < 0.05) continue;   // 同一個聲音 50ms 內只留一個
    lastAt[s.k] = s.t;
    const vol = s.k.includes(":") ? Math.min(1, (s.vol || 0.2) * 3.2) : (s.vol || 1) * (s.game ? 0.7 : 0.8);
    ev.push({ file, t: s.t, vol, rate: +s.rate || 1 });
  }
  const files = [...new Set(ev.map(e => e.file))];
  const bgm = path.join(ROOT, "audio", "draw", "bgm.mp3");
  const args = ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FR, "f%05d.jpg"), "-i", bgm];
  files.forEach(f => args.push("-i", f));
  const fc = [`[1:a]aresample=44100,aformat=channel_layouts=stereo,atrim=start=0.5:end=${(dur + 0.5).toFixed(3)},asetpts=N/SR/TB,afade=t=in:st=0:d=0.6,afade=t=out:st=${(dur - 2).toFixed(2)}:d=2,volume=0.85[bg]`];
  const mixIn = ["[bg]"];
  files.forEach((f, ui) => {
    const es = ev.filter(e => e.file === f), labs = es.map((_, j) => `[s${ui}_${j}]`).join("");
    fc.push(`[${ui + 2}:a]aresample=44100,aformat=channel_layouts=stereo,asplit=${es.length}${labs}`);
    es.forEach((e, j) => {
      const ms = Math.max(0, Math.round(e.t * 1000)), rate = Math.max(0.5, Math.min(2, e.rate));
      fc.push(`[s${ui}_${j}]${Math.abs(rate - 1) > 0.01 ? `asetrate=${Math.round(44100 * rate)},aresample=44100,` : ""}adelay=${ms}|${ms},volume=${e.vol.toFixed(3)}[e${ui}_${j}]`); mixIn.push(`[e${ui}_${j}]`);
    });
  });
  fc.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:duration=first:normalize=0,alimiter=limit=0.89:level=false[a]`);
  const script = path.join(FR, "filter.txt"); fs.writeFileSync(script, fc.join(";\n"));
  fs.mkdirSync(path.dirname(OUTMP4), { recursive: true });
  args.push("-/filter_complex", script, "-map", "0:v", "-map", "[a]", "-t", dur.toFixed(3), "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", OUTMP4);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) { console.error("ffmpeg 失敗", (r.stderr || "").slice(0, 2000)); process.exit(1); }
  console.log(`完成：${OUTMP4}（${F} 格、${dur.toFixed(1)} 秒、聲音 ${ev.length} 個）`);
}
