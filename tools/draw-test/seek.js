// 變色龍躲貓貓（js/draw-seek.js）瀏覽器測試：獨立 headless Chromium，模擬 iPad 橫向觸控
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1（在 GAME DIY 根目錄）
// 用法：node tools/draw-test/seek.js [截圖資料夾]
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL = process.env.SEEK_URL || "http://127.0.0.1:8765/tools/draw-test/seek-harness.html";
const OUT = process.argv[2] || path.join(__dirname, "_review", "seek");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = "") => { results.push((ok ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); };
const crashed = e => { console.log(results.join("\n")); console.log("💥 測試中途當掉：" + String((e && e.message) || e).split("\n")[0]); process.exit(1); };
process.on("unhandledRejection", crashed);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const near = (a, b, t = 0.6) => Math.abs(a - b) <= t;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findShell() });
  const errs = [];
  // init：在模組載入前寫好 localStorage（只在第一次載入時寫，reload 時保留模組自己寫的值）；broken = localStorage 一碰就丟例外
  async function newPage(init = { "draw-seek-seen": "1" }, { viewport = { width: 1180, height: 820 }, broken = false } = {}) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.addInitScript(([kv, broken]) => {
      if (broken) {
        Storage.prototype.getItem = () => { throw new Error("blocked"); };
        Storage.prototype.setItem = () => { throw new Error("blocked"); };
        return;
      }
      if (sessionStorage.getItem("__init")) return;
      sessionStorage.setItem("__init", "1");
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
      window.__before = Object.fromEntries(Object.keys(kv).map(k => [k, localStorage.getItem(k)]));
    }, [init, broken]);
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push("PAGEERR " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/no-such-file/.test(m.text() + (m.location() || {}).url)) errs.push("CONSOLE " + m.text().slice(0, 160)); });
    await p.goto(URL);
    await p.waitForFunction(() => window.__ready && window.__seek, null, { timeout: 8000 });
    return { ctx, p };
  }
  const calls = (p, name) => p.evaluate(n => __calls.filter(c => c[0] === n), name);
  const sfx = async (p, name) => (await calls(p, "sfx")).filter(c => c[1] === name).length;
  const clearCalls = p => p.evaluate(() => { __calls.length = 0; });
  const st = p => p.evaluate(() => ({ ...__seek.state, list: undefined, camo: [...__seek.state.camo] }));
  const phase = (p, ph, ms = 6000) => p.waitForFunction(x => __seek.state.phase === x, ph, { timeout: ms });
  const where = p => p.evaluate(() => __seek.where());
  const fr = p => p.evaluate(() => __seek.frame());
  const lit = p => p.evaluate(() => document.querySelectorAll("#skStars b.lit").length);
  const cls = p => p.evaluate(() => document.querySelector("#seek .sk-cham").className);
  const openWith = async (p, kinds) => { await p.evaluate(k => { __setScenes(k); __mod.open(); }, kinds); await phase(p, "seek"); };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n) });
  const tap = (p, x, y) => p.touchscreen.tap(x, y);
  const vis = (p, sel) => p.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect();
    return getComputedStyle(e).display !== "none" && r.width > 40 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }, sel);
  // 變色龍畫布：身體（不含眼睛）的平均色、原圖同樣位置的平均色、眼睛跟原圖差多少
  const body = p => p.evaluate(async () => {
    const c = document.querySelector("#seek .sk-body canvas"), n = c.width, d = c.getContext("2d").getImageData(0, 0, n, n).data;
    const o = document.createElement("canvas"); o.width = o.height = n;
    const ox = o.getContext("2d"), img = new Image(); img.src = "IMAGE/draw/ui/mascot.png"; await img.decode();
    ox.imageSmoothingQuality = "high"; ox.drawImage(img, 0, 0, n, n);
    const od = ox.getImageData(0, 0, n, n).data, s = n / 600, EY = [[254, 150, 46, 42], [402, 175, 33, 44]];
    const e2 = (i, j) => Math.min(...EY.map(([cx, cy, rx, ry]) => ((i / s - cx) / rx) ** 2 + ((j / s - cy) / ry) ** 2));
    const t = [0, 0, 0], g = [0, 0, 0];
    let cnt = 0, eye = 0, eyeN = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 4;
      if (od[k + 3] < 250) continue;
      const e = e2(i, j);
      if (e < 0.6) { eye = Math.max(eye, Math.abs(d[k] - od[k]), Math.abs(d[k + 1] - od[k + 1]), Math.abs(d[k + 2] - od[k + 2])); eyeN++; continue; }
      if (e < 1.3) continue;
      for (let q = 0; q < 3; q++) { t[q] += d[k + q]; g[q] += od[k + q]; }
      cnt++;
    }
    return { tinted: t.map(v => Math.round(v / cnt)), orig: g.map(v => Math.round(v / cnt)), eye, eyeN, n };
  });
  // 從畫面上的圖（不是模組自己的小圖）算變色龍身體底下的平均色
  const underPic = p => p.evaluate(async () => {
    const pc = document.querySelector("#seek .sk-pic"), f = __seek.frame(), w = __seek.where(), k = pc.width / f.w;
    const n = Math.round(w.w * k), x0 = Math.round((w.x - f.x) * k), y0 = Math.round((w.y - f.y) * k);
    const d = pc.getContext("2d").getImageData(x0, y0, n, n).data;
    const m = document.createElement("canvas"); m.width = m.height = n;
    const mx = m.getContext("2d"), img = new Image(); img.src = "IMAGE/draw/ui/mascot.png"; await img.decode();
    mx.drawImage(img, 0, 0, n, n);
    const md = mx.getImageData(0, 0, n, n).data, s = [0, 0, 0];
    let wt = 0;
    for (let i = 0; i < n * n; i++) { const a = md[i * 4 + 3]; if (!a) continue; for (let q = 0; q < 3; q++) s[q] += d[i * 4 + q] * a; wt += a; }
    return s.map(v => Math.round(v / wt));
  });
  async function drag(p, [x0, y0], [x1, y1], { release = true, steps = 14, mid } = {}) {
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let k = 1; k <= steps; k++) { await p.mouse.move(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps); if (mid && k === steps >> 1) await mid(); }
    if (release) await p.mouse.up();
  }

  // ═══ 1. 一般流程（已看過示範） ═══
  let { ctx, p } = await newPage();
  await p.locator("#goSeek").tap();
  await phase(p, "seek");
  await p.waitForTimeout(600);
  await shot(p, "01-round1.png");
  const shown = await p.evaluate(() => ({
    on: document.getElementById("seek").classList.contains("on") && !document.getElementById("home").classList.contains("on"),
    ids: ["skHome", "skHide", "skStars", "skOk", "skPass", "skAgain", "skHome2"].filter(i => document.getElementById(i)).length,
    css: getComputedStyle(document.getElementById("skHide")).borderTopLeftRadius,
    ok: getComputedStyle(document.getElementById("skOk")).display, fOn: getComputedStyle(document.querySelector("#skHide .sk-f")).opacity,
    hOn: getComputedStyle(document.querySelector("#skHide .sk-h")).opacity,
  }));
  let s = await st(p);
  check("打開：切到 #seek、固定 id 的按鈕都在、CSS 有載入、🔍 亮著 🙈 淡、✔️ 藏起來、第 1 回合 18% 大、偽裝 0.55、星星都沒亮",
    shown.on && shown.ids === 7 && shown.css === "48px" && shown.ok === "none" && shown.fOn === "1" && +shown.hOn < 0.6 &&
    s.round === 0 && s.size === 0.18 && s.k === 0.55 && (await lit(p)) === 0 && (await calls(p, "getScenes")).length === 1, JSON.stringify({ ...shown, round: s.round, k: s.k }));

  // 位置：開 12 次，都在圖裡、避開邊緣 8%、大小 = 圖高 18%、位置每次不一樣
  const spots = [];
  let posOk = true;
  for (let i = 0; i < 12; i++) {
    await openWith(p, ["drawing", "animal", "ocean"]);
    const w = await where(p), f = await fr(p);
    const okBox = w.x >= f.x + 0.08 * f.w - 0.6 && w.x + w.w <= f.x + 0.92 * f.w + 0.6 && w.y >= f.y + 0.08 * f.h - 0.6 && w.y + w.h <= f.y + 0.92 * f.h + 0.6 && near(w.h, 0.18 * f.h, 0.5);
    posOk = posOk && okBox;
    spots.push(Math.round(w.cx / 20) + "," + Math.round(w.cy / 20));
  }
  check("位置：開 12 次都在圖裡、避開邊緣 8%、大小剛好是圖高 18%，而且每次位置不一樣", posOk && new Set(spots).size >= 9, `不同位置 ${new Set(spots).size}/12`);

  // 偽裝顏色：整片粉紅的圖 → 偽裝色就是那個粉紅；身體顏色往粉紅靠、眼睛保留原色
  await openWith(p, ["flat"]);
  s = await st(p);
  const b1 = await body(p), pink = [224, 85, 154];
  const ratio1 = dist(b1.tinted, pink) / dist(b1.orig, pink);
  check("偽裝（整片粉紅的圖）：偽裝色＝底下的粉紅、身體顏色明顯往粉紅靠（距離剩不到 6 成）、眼睛那塊跟原圖一樣",
    dist(s.camo, pink) <= 4 && ratio1 < 0.6 && b1.eye <= 8 && b1.eyeN > 50, `camo=${s.camo} ratio=${ratio1.toFixed(2)} eye差=${b1.eye} eyeN=${b1.eyeN}`);
  await p.waitForTimeout(500);
  await shot(p, "02-flat-pink.png");

  // 真的畫：3 回合每回合都量（從畫面上的圖獨立算底下的顏色）；大小、強度依回合變
  await openWith(p, ["drawing", "animal", "ocean"]);
  const per = [];
  for (let r = 0; r < 3; r++) {
    await phase(p, "seek");
    const s2 = await st(p), exp = await underPic(p), b = await body(p);
    per.push({ r: s2.round, size: s2.size, k: s2.k, d: Math.round(dist(s2.camo, exp)), ratio: +(dist(b.tinted, exp) / Math.max(1, dist(b.orig, exp))).toFixed(2) });
    if (r === 2) { await p.waitForTimeout(400); await shot(p, "03-round3-small.png"); }
    if (r < 2) { await p.evaluate(() => __seek.find()); await p.waitForFunction(r => __seek.state.round === r + 1 && __seek.state.phase === "seek", r, { timeout: 5000 }); }
  }
  const SZ = [0.18, 0.13, 0.09], TK = [0.55, 0.7, 0.82];
  check("每回合：大小 18%／13%／9%、偽裝強度 0.55／0.7／0.82；偽裝色跟畫面上牠底下的顏色差不到 20、身體往底下的顏色靠（越後面越像）",
    per.every((x, i) => x.r === i && x.size === SZ[i] && x.k === TK[i] && x.d <= 20 && x.ratio < 0.65) && per[2].ratio < per[0].ratio, JSON.stringify(per));

  // ── 點錯、點擊範圍、點中 ──
  await openWith(p, ["drawing", "animal", "ocean"]);
  await clearCalls(p);
  let w = await where(p), f = await fr(p);
  // 找一個離牠很遠的點
  const far = [w.cx > f.x + f.w / 2 ? f.x + f.w * 0.12 : f.x + f.w * 0.88, w.cy > f.y + f.h / 2 ? f.y + f.h * 0.15 : f.y + f.h * 0.85];
  await tap(p, ...far);
  await p.waitForTimeout(150);
  const missInfo = await p.evaluate(() => ({ rip: document.querySelectorAll("#seek .sk-ripple").length, ph: __seek.state.phase, r: __seek.state.round, m: __seek.state.misses }));
  const notes = await calls(p, "note");
  await shot(p, "04-miss.png");
  await tap(p, f.x - 20, f.y + f.h / 2);   // 圖外面（牆上）：不算
  await p.waitForTimeout(100);
  const missOut = await p.evaluate(() => __seek.state.misses);
  check("點錯：那裡冒一圈水波、低音「咕」（note 0～3）、不扣分（星星、回合不變、還在找）；點在圖外面不算",
    missInfo.rip === 1 && missInfo.ph === "seek" && missInfo.r === 0 && missInfo.m === 1 && notes.length === 1 && notes[0][1] <= 3 && (await lit(p)) === 0 && missOut === 1 && (await sfx(p, "finish")) === 0,
    JSON.stringify({ ...missInfo, notes: notes.map(n => n[1]), missOut }));

  // 第二根手指（手掌）點中不算
  await p.evaluate(() => { const w = __seek.where(), t = document.querySelector("#seek .sk-wall");
    t.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 9, isPrimary: false, pointerType: "touch", bubbles: true, clientX: w.cx, clientY: w.cy })); });
  const palm = await st(p);
  // 點擊範圍：牠方框外 20%（超過放大 20% 的範圍）不算、外 7% 算
  await tap(p, w.cx + w.w * 0.7, w.cy);
  await p.waitForTimeout(100);
  const outer = await st(p);
  await clearCalls(p);
  await tap(p, w.cx + w.w * 0.57, w.cy);
  await p.evaluate(() => { window.__tHit = performance.now(); });
  await p.waitForTimeout(250);
  const hitInfo = await p.evaluate(() => ({ ph: __seek.state.phase, k: __seek.state.k, cls: document.querySelector("#seek .sk-cham").className, found: __seek.state.found }));
  const bHit = await body(p);
  await shot(p, "05-found.png");
  check("第二根手指（手掌）點中不算", palm.phase === "seek" && palm.found === 0);
  check("點擊範圍比牠大 20%：方框外 20% 不算（算點錯）、外 7% 算點中", outer.phase === "seek" && outer.misses === 2 && hitInfo.ph === "found", `outer=${outer.phase}/${outer.misses} hit=${hitInfo.ph}`);
  check("點中：瞬間變回原色（畫布身體＝原圖、k=0）、跳起來轉一圈、finish 音效＋星星粒子、右上亮一顆星",
    hitInfo.k === 0 && dist(bHit.tinted, bHit.orig) <= 3 && /\byay\b/.test(hitInfo.cls) && (await sfx(p, "finish")) === 1 && (await calls(p, "stars")).length >= 1 && (await lit(p)) === 1,
    JSON.stringify({ ...hitInfo, body: bHit.tinted, orig: bHit.orig }));
  const sc1 = (await st(p)).scene;
  // 回合換掉的那一刻（每一幀檢查）離點中多久
  const gap = await p.evaluate(() => new Promise(ok => { const f = () => __seek.state.round === 1 ? ok(Math.round(performance.now() - __tHit)) : requestAnimationFrame(f); f(); }));
  await phase(p, "seek", 3000);
  s = await st(p);
  check("約 1.5 秒後下一回合：換一張圖、牠又躲起來", gap >= 1450 && gap <= 1800 && s.round === 1 && s.scene !== sc1 && s.k === 0.7 && !/yay/.test(await cls(p)), `${gap}ms ${sc1}→${s.scene}`);

  // 連點 5 下：只算一次
  await clearCalls(p);
  w = await where(p);
  await p.evaluate(() => { const w = __seek.where(), t = document.querySelector("#seek .sk-wall");
    for (let i = 0; i < 5; i++) { t.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 20 + i, isPrimary: true, pointerType: "touch", bubbles: true, clientX: w.cx, clientY: w.cy }));
      t.dispatchEvent(new PointerEvent("pointerup", { pointerId: 20 + i, isPrimary: true, pointerType: "touch", bubbles: true, clientX: w.cx, clientY: w.cy })); } });
  await p.waitForTimeout(100);
  check("連點變色龍 5 下：只算找到一次（一個 finish、多亮一顆星）", (await sfx(p, "finish")) === 1 && (await lit(p)) === 2 && (await st(p)).found === 2);

  // ── 提示（時間快轉） ──
  await phase(p, "seek", 3000);
  await clearCalls(p);
  await p.evaluate(() => __seek.advance(7.5));
  const h0 = await cls(p);
  await p.evaluate(() => __seek.advance(1));
  const h1 = await cls(p), lidAnim = await p.evaluate(() => getComputedStyle(document.querySelector("#seek .sk-lid")).animationName);
  await p.waitForTimeout(800);
  await shot(p, "06-hint-peek.png");
  await p.waitForTimeout(900);
  const h1b = await cls(p);
  check("提示 1：7.5 秒還沒有提示；8 秒眼睛眨兩下＋身體抖一下（一下子就收）", !/peek|glint/.test(h0) && /\bpeek\b/.test(h1) && lidAnim === "skBlink2" && !/peek/.test(h1b) && (await sfx(p, "tap")) === 1,
    `${h0} → ${h1} (${lidAnim}) → ${h1b}`);
  await p.evaluate(() => __seek.advance(7));
  await p.waitForTimeout(300);
  const h2 = await cls(p), sp1 = (await calls(p, "stars")).length;
  await p.evaluate(() => __seek.advance(2));
  await p.waitForTimeout(100);
  const sp2 = (await calls(p, "stars")).length;
  await shot(p, "07-hint-glint.png");
  check("提示 2：15 秒牠旁邊冒閃光（✨＋星星粒子，之後每 1.8 秒再冒）", /\bglint\b/.test(h2) && sp1 >= 1 && sp2 > sp1 && (await st(p)).phase === "seek", `${h2} stars ${sp1}→${sp2}`);
  await p.evaluate(() => __seek.advance(8.5));
  await p.waitForTimeout(450);
  const rv = await p.evaluate(() => { const b = document.querySelector("#seek .sk-say"), r = b.getBoundingClientRect();
    return { ph: __seek.state.phase, k: __seek.state.k, say: b.textContent, vis: getComputedStyle(b).display !== "none" && r.width > 40, cls: document.querySelector("#seek .sk-cham").className }; });
  await shot(p, "08-reveal.png");
  check("提示 3：25 秒牠自己跳出來說「在這裡」（變回原色、星星還是亮）", rv.ph === "found" && rv.k === 0 && rv.say === "在這裡！" && rv.vis && /\bsay\b/.test(rv.cls) && (await lit(p)) === 3 && (await sfx(p, "magic")) === 1, JSON.stringify(rv));

  // 時間真的會走（不靠快轉）：速度 ×20，半秒後就該到第一個提示
  await openWith(p, ["drawing", "animal", "ocean"]);
  await p.evaluate(() => { __seek.state.speed = 20; });
  await p.waitForTimeout(700);
  const real = await p.evaluate(() => ({ t: __seek.state.t, hint: __seek.state.hint }));
  await p.evaluate(() => { __seek.state.speed = 1; });
  check("計時器真的在跑：時間 ×20 時 0.7 秒內就到 8 秒提示", real.t >= 8 && real.hint >= 1, JSON.stringify(real));

  // ── 3 回合結束 ──
  await openWith(p, ["drawing", "animal", "ocean"]);
  await clearCalls(p);
  for (let r = 0; r < 3; r++) {
    await phase(p, "seek", 4000);
    w = await where(p);
    await tap(p, w.cx, w.cy);
    if (r < 2) await p.waitForFunction(r => __seek.state.round === r + 1, r, { timeout: 4000 });
  }
  await phase(p, "end", 4000);
  await p.waitForTimeout(200);
  const endMid = await p.evaluate(() => ({ ended: document.getElementById("seek").classList.contains("ended"), conf: document.querySelectorAll("#seek .sk-confetti i").length }));
  await p.waitForTimeout(1500);
  await shot(p, "09-end.png");
  const endBtns = (await vis(p, "#skAgain")) && (await vis(p, "#skHome2"));
  check("3 回合找完：大慶祝（吉祥物大圖、彩帶、finish）、三顆星全亮、再玩一局／回首頁兩顆大鈕出現在畫面裡",
    endMid.ended && endMid.conf > 20 && endBtns && (await lit(p)) === 3 && (await sfx(p, "finish")) >= 4 && (await st(p)).found === 3, JSON.stringify({ ...endMid, endBtns }));
  await p.locator("#skAgain").tap();
  await phase(p, "seek");
  const again = await p.evaluate(() => ({ ended: document.getElementById("seek").classList.contains("ended"), r: __seek.state.round, f: __seek.state.found, lit: document.querySelectorAll("#skStars b.lit").length }));
  check("再玩一局：新的一局（第 1 回合、星星歸零、慶祝收起來）", !again.ended && again.r === 0 && again.f === 0 && again.lit === 0, JSON.stringify(again));

  // ── 視窗大小改變 ──
  const before = await st(p), f1 = await fr(p);
  await p.setViewportSize({ width: 1024, height: 700 });
  await p.waitForTimeout(500);
  const f2 = await fr(p), w2 = await where(p), s2 = await st(p);
  await shot(p, "10-resized.png");
  const inside = f2.x >= 0 && f2.y >= 0 && f2.x + f2.w <= 1024 && f2.y + f2.h <= 700;
  const prop = near((w2.cx - f2.x) / f2.w, before.u, 0.002) && near((w2.cy - f2.y) / f2.h, before.v, 0.002) && near(w2.h, 0.18 * f2.h, 0.5);
  await tap(p, w2.cx, w2.cy);
  await p.waitForTimeout(200);
  const rzFound = (await st(p)).phase === "found";
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.waitForTimeout(300);
  check("視窗變小：畫框跟著縮、整張在畫面裡，變色龍還在圖上同一個位置（比例不變），照樣點得到",
    f2.w < f1.w - 50 && inside && prop && s2.u === before.u && rzFound, `frame ${f1.w.toFixed(0)}→${f2.w.toFixed(0)} prop=${prop} found=${rzFound}`);

  // ── 藏模式 ──
  await p.locator("#skHide").tap();
  await phase(p, "place");
  await p.waitForTimeout(500);
  const hd = await p.evaluate(() => ({ hiding: document.getElementById("seek").classList.contains("hiding"), h: getComputedStyle(document.querySelector("#skHide .sk-h")).opacity,
    stars: getComputedStyle(document.getElementById("skStars")).display, ok: getComputedStyle(document.getElementById("skOk")).display,
    u: __seek.state.u, v: __seek.state.v, size: __seek.state.size, k: __seek.state.k, cls: document.querySelector("#seek .sk-cham").className }));
  await shot(p, "11-hide-start.png");
  check("藏模式：🙈 亮、星星收起來、✔️ 出現；原色的變色龍在圖中間（15% 大）＋「拖我」提示",
    hd.hiding && hd.h === "1" && hd.stars === "none" && hd.ok !== "none" && hd.u === 0.5 && hd.v === 0.5 && hd.size === 0.15 && hd.k === 0 && /\bgrab\b/.test(hd.cls), JSON.stringify(hd));
  w = await where(p); f = await fr(p);
  const dest = [f.x + f.w * 0.22, f.y + f.h * 0.72];
  let midDrag = null;
  await drag(p, [w.cx, w.cy], dest, { steps: 16, mid: async () => {
    await p.waitForTimeout(350);
    midDrag = await p.evaluate(() => ({ k: __seek.state.k, held: /held/.test(document.querySelector("#seek .sk-cham").className) }));
    await shot(p, "12-hide-drag.png");
  } });
  await p.waitForTimeout(900);
  const placed = await st(p), w3 = await where(p), exp3 = await underPic(p);
  check("拖曳：拖的時候放大、即時變色（拖到一半就開始染）；放開後停在手指放開的地方、顏色跟底下接近",
    midDrag && midDrag.held && midDrag.k > 0.15 && near(w3.cx, dest[0], 2) && near(w3.cy, dest[1], 2) && placed.k > 0.7 && dist(placed.camo, exp3) <= 20,
    `mid=${JSON.stringify(midDrag)} at=${w3.cx.toFixed(0)},${w3.cy.toFixed(0)} k=${placed.k.toFixed(2)} d=${dist(placed.camo, exp3).toFixed(1)}`);
  // 點在別的地方：牠直接跳過去
  const jump = [f.x + f.w * 0.7, f.y + f.h * 0.35];
  await tap(p, ...jump);
  await p.waitForTimeout(300);
  const wj = await where(p);
  check("藏模式點在別的地方：牠直接跳過去（不用瞄準拖）", near(wj.cx, jump[0], 2) && near(wj.cy, jump[1], 2), `${wj.cx.toFixed(0)},${wj.cy.toFixed(0)}`);
  await p.locator("#skOk").tap();
  await phase(p, "pass");
  await p.waitForTimeout(500);
  const passVis = await vis(p, "#skPass"), passCover = await p.evaluate(() => { const r = document.getElementById("skPass").getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1; });
  await shot(p, "13-pass.png");
  await clearCalls(p);
  // 換人找的過場還沒點：時間不會走、點畫面上牠的位置也不算
  await tap(p, wj.cx, wj.cy + 200 > 800 ? wj.cy - 200 : wj.cy + 200);
  await p.waitForTimeout(300);
  const stillPass = (await st(p)).phase;
  check("按 ✔️：出現「換人找」過場（整頁蓋住、藏的位置看不到）", passVis && passCover && (stillPass === "seek" || stillPass === "pass"), `vis=${passVis} cover=${passCover}`);
  // 上面那一下點在過場上 → 開始找
  if (stillPass === "pass") await p.locator("#skPass").tap();
  await phase(p, "seek");
  const ws = await where(p), sk = await st(p);
  check("點一下過場：開始找（過場收起來、牠在剛剛藏的地方、已經偽裝好）", near(ws.cx, wj.cx, 1) && near(ws.cy, wj.cy, 1) && sk.k === 0.75 &&
    !(await p.evaluate(() => document.getElementById("seek").classList.contains("passing"))), `k=${sk.k}`);
  await shot(p, "14-hide-seek.png");
  await tap(p, ws.cx, ws.cy);
  await phase(p, "end", 4000);
  await p.waitForTimeout(1500);
  await shot(p, "15-hide-end.png");
  check("藏的那隻被找到：結束、出現再玩一次", (await vis(p, "#skAgain")) && (await st(p)).found === 1);
  await p.locator("#skAgain").tap();
  await phase(p, "place");
  const again2 = (await st(p)).game;
  await p.locator("#skHide").tap();
  await phase(p, "seek");
  const back = await p.evaluate(() => ({ hiding: document.getElementById("seek").classList.contains("hiding"), stars: getComputedStyle(document.getElementById("skStars")).display, game: __seek.state.game, ok: getComputedStyle(document.getElementById("skOk")).display }));
  check("藏模式的再玩一次＝再藏一次；再按 🔍🙈 切回找模式（三顆星、✔️ 收起來）", again2 === "hide" && !back.hiding && back.stars !== "none" && back.game === "find" && back.ok === "none", JSON.stringify(back));

  // 連點切換鈕 5 下：最後停在藏模式、畫面上只有一隻
  await p.evaluate(() => { for (let i = 0; i < 5; i++) document.getElementById("skHide").click(); });
  await phase(p, "place");
  await p.waitForTimeout(400);
  const rapid = await p.evaluate(() => ({ mode: __seek.state.mode, ph: __seek.state.phase, n: document.querySelectorAll("#seek .sk-cham").length, hiding: document.getElementById("seek").classList.contains("hiding") }));
  check("連點 找／藏 切換 5 下：停在藏模式、狀態一致", rapid.mode === "hide" && rapid.ph === "place" && rapid.n === 1 && rapid.hiding, JSON.stringify(rapid));

  // ── 回首頁：計時器停掉 ──
  await p.locator("#skHide").tap(); await phase(p, "seek");
  await p.evaluate(() => __seek.find());
  await clearCalls(p);
  await p.locator("#skHome").tap();
  await p.waitForTimeout(2000);
  const home = await p.evaluate(() => ({ home: document.getElementById("home").classList.contains("on"), seek: document.getElementById("seek").classList.contains("on"), ph: __seek.state.phase, r: __seek.state.round }));
  check("🏠 回首頁：呼叫 onHome、切回首頁、找到後的換回合計時器停掉", home.home && !home.seek && home.ph === "idle" && home.r === 0 && (await calls(p, "onHome")).length === 1, JSON.stringify(home));

  // ── 壞掉的圖 ──
  await clearCalls(p);
  await p.evaluate(() => { __setScenes(["broken", "drawing", "flat"]); __mod.open(); });
  await phase(p, "seek");
  const brokenOk = { scene: (await st(p)).scene, toast: (await calls(p, "toast")).length };
  await p.evaluate(() => { __setScenes(["broken"]); __mod.open(); });
  await p.waitForTimeout(1500);
  const allBad = await p.evaluate(() => ({ home: document.getElementById("home").classList.contains("on"), toast: __calls.filter(c => c[0] === "toast").map(c => c[1]) }));
  check("有一張圖壞掉：跳過、用別張；全部都壞：😢 提示並回首頁（不會卡住）", !/broken/.test(brokenOk.scene) && brokenOk.toast === 0 && allBad.home && allBad.toast.join() === "😢", JSON.stringify({ brokenOk, allBad }));
  await ctx.close();

  // ═══ 2. 第一次打開：牠先在中間原色出現、揮手、咻一下跑去躲；之後不再示範 ═══
  ({ ctx, p } = await newPage({}));
  await p.locator("#goSeek").tap();
  await phase(p, "intro");
  await p.waitForTimeout(700);
  const i1 = await p.evaluate(() => ({ k: __seek.state.k, size: __seek.state.size, u: __seek.state.u, cls: document.querySelector("#seek .sk-cham").className, say: document.querySelector("#seek .sk-say").textContent }));
  await shot(p, "16-intro-wave.png");
  await p.locator("#seek .sk-wall").tap({ position: { x: 300, y: 300 } });   // 示範中亂點：不理
  await p.waitForFunction(() => __seek.state.k > 0.1, null, { timeout: 4000 });
  const i2 = await p.evaluate(() => ({ k: __seek.state.k, size: __seek.state.size, ph: __seek.state.phase }));
  await shot(p, "17-intro-dash.png");
  await phase(p, "seek", 3000);
  const i3 = await p.evaluate(() => ({ k: __seek.state.k, size: __seek.state.size, seen: localStorage.getItem("draw-seek-seen"), trails: __calls.filter(c => c[0] === "trail").length, m: __seek.state.misses }));
  check("第一次打開：牠先在中間原色大大出現＋揮手 👋；然後咻一下跑去躲（移動中慢慢變色變小，有拖尾）；記住看過了",
    i1.k === 0 && i1.size > 0.3 && i1.u === 0.5 && /\bwave\b/.test(i1.cls) && i1.say === "👋" && i2.ph === "intro" && i2.k > 0 && i2.k < 0.55 && i2.size < i1.size &&
    i3.k === 0.55 && i3.size === 0.18 && i3.seen === "1" && i3.trails > 5 && i3.m === 0, JSON.stringify({ i1, i2, i3 }));
  await p.reload();
  await p.waitForFunction(() => window.__ready && window.__seek);
  await p.locator("#goSeek").tap();
  let everIntro = false;
  for (let i = 0; i < 8; i++) { everIntro = everIntro || (await st(p)).phase === "intro"; await p.waitForTimeout(150); }
  check("示範只出現一次：第二次打開直接開始找", !everIntro && (await st(p)).phase === "seek");
  await ctx.close();

  // ═══ 3. 壞掉的 localStorage ═══
  ({ ctx, p } = await newPage({ "draw-seek-seen": "{壞掉了" }));
  await p.locator("#goSeek").tap();
  await phase(p, "intro");
  const badLS = await p.evaluate(() => ({ before: window.__before["draw-seek-seen"], now: localStorage.getItem("draw-seek-seen") }));
  check("壞掉的存檔（不是 \"1\"）：當成沒看過、示範一次、寫回好資料", badLS.before === "{壞掉了" && badLS.now === "1", JSON.stringify(badLS));
  await ctx.close();
  ({ ctx, p } = await newPage({}, { broken: true }));
  await p.locator("#goSeek").tap();
  await phase(p, "intro");
  await phase(p, "seek", 5000);
  await p.evaluate(() => __mod.open());
  await p.waitForTimeout(300);
  const blk = (await st(p)).phase;
  check("localStorage 整個不能用（一碰就丟例外）：照樣能玩、示範一次、同一次開著不會再示範", blk === "seek" || blk === "load", blk);
  await ctx.close();

  check("沒有 pageerror / console error", errs.length === 0, errs.slice(0, 3).join(" | "));
  await browser.close();
  console.log(results.join("\n"));
  const fail = results.filter(r => r.startsWith("❌")).length;
  console.log(fail ? `\n${fail} 項失敗（共 ${results.length} 項）` : `\n全部通過（${results.length} 項）`);
  process.exit(fail ? 1 : 0);
})().catch(crashed);
