// 鏡子魔法畫（js/draw-mirror.js）瀏覽器測試：獨立 headless Chromium，模擬 iPad 橫向觸控
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1（在 GAME DIY 根目錄）
// 用法：node tools/draw-test/mirror.js [截圖資料夾]
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL = process.env.MIRROR_URL || "http://127.0.0.1:8765/tools/draw-test/mirror-harness.html";
const OUT = process.argv[2] || path.join(__dirname, "_review", "mirror");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = "") => { results.push((ok ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); };
const NEON = ["#ff3fa4", "#ff5a3c", "#ffa21f", "#ffe53b", "#72ff52", "#2cefff", "#4f82ff", "#b55cff"];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findShell(), args: ["--mute-audio"] });
  const errs = [];
  // init：在模組載入前寫好 localStorage（之後讀回確認真的寫進去了）
  async function newPage(init = { "draw-mirror-seen": "1" }, viewport = { width: 1180, height: 820 }) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.addInitScript(kv => {
      if (sessionStorage.getItem("__init")) return;   // 只在第一次載入時寫（reload 時保留模組自己寫的值）
      sessionStorage.setItem("__init", "1");
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
      window.__before = Object.fromEntries(Object.keys(kv).map(k => [k, localStorage.getItem(k)]));
    }, init);
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push("PAGEERR " + e.message));
    p.on("console", m => { if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 160)); });
    await p.goto(URL);
    await p.waitForFunction(() => window.__ready && window.__mirror, null, { timeout: 8000 });
    return { ctx, p };
  }
  const calls = (p, name) => p.evaluate(n => __calls.filter(c => c[0] === n), name);
  const clearCalls = p => p.evaluate(() => { __calls.length = 0; });
  const st = p => p.evaluate(() => ({ ...__mirror.state, hist: __mirror.hist(), ink: __mirror.ink() }));
  const open = async p => { await p.locator("#goMirror").tap(); await p.waitForTimeout(400); };
  const frameRect = p => p.evaluate(() => { const r = document.querySelector("#mirror .x-frame").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  // 用滑鼠在畫框裡畫一筆（座標是畫框的 0～1）
  async function drag(p, pts, { hold = 0 } = {}) {
    const f = await frameRect(p), at = ([u, v]) => [f.x + u * f.w, f.y + v * f.h];
    await p.mouse.move(...at(pts[0])); await p.mouse.down();
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [at(pts[i - 1]), at(pts[i])];
      for (let k = 1; k <= 6; k++) await p.mouse.move(a[0] + (b[0] - a[0]) * k / 6, a[1] + (b[1] - a[1]) * k / 6);
    }
    if (hold) await p.waitForTimeout(hold);
    await p.mouse.up();
  }
  const lit = (p, x, y) => p.evaluate(([x, y]) => __mirror.px(x, y)[3] > 40, [x, y]);
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n) });

  // ═══ 1. 一般流程（已看過示範） ═══
  let { ctx, p } = await newPage();
  await open(p);
  const ids = ["xHome", "xSym", "xBrush", "xColor", "xUndo", "xClear", "xSpin", "xSave"];
  const shown = await p.evaluate(ids => ({
    on: document.getElementById("mirror").classList.contains("on") && !document.getElementById("home").classList.contains("on"),
    btns: ids.filter(i => document.querySelector("#mirror #" + i)).length,
    css: getComputedStyle(document.querySelector("#mirror .x-frame")).borderTopLeftRadius,
  }), ids);
  check("打開：切到 #mirror、8 顆固定 id 的按鈕都在、CSS 有載入", shown.on && shown.btns === 8 && shown.css === "28px", JSON.stringify(shown));

  const lay = await p.evaluate(() => {
    const s = document.querySelector("#mirror .x-stage").getBoundingClientRect(), f = document.querySelector("#mirror .x-frame").getBoundingClientRect(), b = document.querySelector("#mirror .x-bar").getBoundingClientRect();
    return { fw: f.width, fh: f.height, sw: s.width, sh: s.height, inside: f.left >= s.left && f.right <= s.right && f.top >= s.top && f.bottom <= s.bottom, barRight: b.left >= f.right, barW: b.width };
  });
  check("畫框是正方形、在畫面內、盡量大；工具列在右邊、跟畫畫頁一樣寬", Math.abs(lay.fw - lay.fh) < 1 && lay.inside && lay.fw >= Math.min(lay.sw, lay.sh) - 40 && lay.barRight && lay.barW === 112, JSON.stringify(lay));
  check("畫布解析度 DPR 最多 2（1180×820、DPR 2 → 1600）", await p.evaluate(() => __mirror.R0) === 1600);
  check("一開始沒畫：對稱軸看得到、復原鈕變淡", await p.evaluate(() => !document.querySelector("#mirror .x-axes").classList.contains("off") && document.getElementById("xUndo").classList.contains("dim")));

  // 手指（滑鼠）畫一筆
  await clearCalls(p);
  await drag(p, [[0.55, 0.2], [0.7, 0.3], [0.62, 0.42], [0.75, 0.45]]);
  let s = await st(p);
  const so = await calls(p, "strokeOn"), off = await calls(p, "strokeOff"), sp = await calls(p, "strokeSpeed"), tr = await calls(p, "trail"), ch = await calls(p, "chime");
  check("手指畫一筆：畫進畫布、可以復原", s.ink > 100 && s.hist === 1 && s.dirty, `ink=${s.ink} hist=${s.hist}`);
  check("畫的時候：沙沙聲 strokeOn('neon')＋手速＋放開 strokeOff＋粒子＋叮鈴", so.length === 1 && so[0][1] === "neon" && sp.length > 5 && off.length >= 1 && tr.length > 3 && tr[0][4] === true && ch.length >= 1,
    `on=${JSON.stringify(so)} speed=${sp.length} off=${off.length} trail=${tr.length} chime=${ch.length}`);
  check("開始畫：對稱軸淡出", await p.evaluate(() => document.querySelector("#mirror .x-axes").classList.contains("off")));

  // 對稱是真的：8 份 = 4 個旋轉 × 左右鏡射
  await p.evaluate(() => __mirror.clearAll());
  await p.evaluate(() => __mirror.drawStroke([[0.6, 0.2], [0.603, 0.203]], { sym: 8 }));
  const eight = [[0.6, 0.2], [0.8, 0.6], [0.4, 0.8], [0.2, 0.4], [0.4, 0.2], [0.8, 0.4], [0.6, 0.8], [0.2, 0.6]];
  const lit8 = []; for (const [x, y] of eight) lit8.push(await lit(p, x, y));
  check("8 份：一筆變成 8 份（4 個旋轉＋鏡射），旁邊沒畫到的地方是空的", lit8.every(Boolean) && !(await lit(p, 0.5, 0.5)) && !(await lit(p, 0.5, 0.05)), lit8.join(","));
  await p.evaluate(() => __mirror.clearAll());
  await p.evaluate(() => __mirror.drawStroke([[0.2, 0.4], [0.25, 0.5], [0.22, 0.6]], { sym: 2 }));
  check("2 份＝左右對稱（蝴蝶）：右邊鏡射出來、上下沒有", await lit(p, 0.75, 0.5) && await lit(p, 0.25, 0.5) && !(await lit(p, 0.5, 0.15)) && !(await lit(p, 0.25, 0.1)));

  // 對稱份數鈕：2→4→6→8→12→2，花瓣數、對稱軸數跟著變；快速連點 5 下剛好轉一圈
  const symSeq = [];
  for (let i = 0; i < 5; i++) {
    await p.locator("#xSym").tap();
    symSeq.push(await p.evaluate(() => [__mirror.state.sym, document.querySelectorAll("#xSym ellipse").length, document.querySelectorAll("#mirror .x-axes line").length]));
  }
  check("對稱份數鈕輪流切換，花瓣數＝對稱軸數＝份數", symSeq.map(x => x[0]).join() === "12,2,4,6,8" && symSeq.every(x => x[0] === x[1] && x[1] === x[2]), JSON.stringify(symSeq));
  await p.evaluate(() => { for (let i = 0; i < 5; i++) document.getElementById("xSym").click(); });
  check("對稱份數鈕連點 5 下：回到原本的 8 份", await p.evaluate(() => __mirror.state.sym) === 8);

  // 筆：霓虹 → 星星 → 彩虹 → 霓虹，每種都畫得出來
  const brushSeq = [];
  for (let i = 0; i < 3; i++) {
    await p.locator("#xBrush").tap();
    const b = await p.evaluate(() => __mirror.state.brush);
    await clearCalls(p);
    await p.evaluate(() => __mirror.clearAll());
    await drag(p, [[0.5, 0.3], [0.6, 0.2], [0.7, 0.35]]);
    brushSeq.push([b, (await st(p)).ink > 50, (await calls(p, "strokeOn"))[0]?.[1], await p.evaluate(() => !!document.querySelector("#xBrush canvas"))]);
  }
  check("筆鈕輪流切換三種筆，每種都畫得出來、聲音對應", JSON.stringify(brushSeq) === JSON.stringify([["star", true, "sparkle", true], ["rainbow", true, "rainbow", true], ["neon", true, "neon", true]]), JSON.stringify(brushSeq));

  // 顏色選單：8 色＋彩虹自動，選完自己收起來、圓點換色
  await p.locator("#xColor").tap();
  await p.waitForTimeout(300);
  const popN = await p.evaluate(() => document.querySelector("#mirror .x-pop.on") ? document.querySelectorAll("#mirror .x-sw").length : 0);
  await shot(p, "03-color-pop.png");
  await clearCalls(p);
  await p.locator("#mirror .x-sw").nth(2).tap();
  await p.waitForTimeout(450);
  const col = await p.evaluate(() => ({ c: __mirror.state.color, open: !!document.querySelector("#mirror .x-pop.on"), dot: document.querySelector("#xColor .dot").style.background }));
  check("顏色選單：9 個色鈕；選了換色、圓點跟著變、音符、自動收起", popN === 9 && col.c === NEON[2] && !col.open && /255, 162, 31/.test(col.dot) && (await calls(p, "note")).length === 1, `n=${popN} ${JSON.stringify(col)}`);
  await p.locator("#xColor").tap(); await p.waitForTimeout(250);
  const inkBefore = (await st(p)).ink;
  await drag(p, [[0.3, 0.7], [0.4, 0.8]]);
  const popClosedNoInk = await p.evaluate(() => !document.querySelector("#mirror .x-pop.on"));
  check("選單開著時點畫布：只關選單、不會畫", popClosedNoInk && (await st(p)).ink === inkBefore);
  await p.locator("#xColor").tap(); await p.waitForTimeout(250);
  await p.locator("#mirror .x-sw.auto").tap(); await p.waitForTimeout(400);
  check("彩虹自動：每一筆自動換下一個顏色", await p.evaluate(() => {
    const a = __mirror.state.auto; __mirror.drawStroke([[0.5, 0.3], [0.55, 0.32]]); __mirror.drawStroke([[0.5, 0.3], [0.55, 0.32]]);
    return __mirror.state.color === "auto" && __mirror.state.auto === a + 2;
  }));

  // 復原：最多 20 步
  await p.evaluate(() => __mirror.clearAll());
  await p.evaluate(() => { for (let i = 0; i < 22; i++) __mirror.drawStroke([[0.5 + i * 0.01, 0.15], [0.52 + i * 0.01, 0.25]]); });
  const h22 = (await st(p)).hist;
  for (let i = 0; i < 25; i++) await p.evaluate(() => document.getElementById("xUndo").click());
  s = await st(p);
  check("復原最多 20 步：畫 22 筆、按 25 下復原，最早的 2 筆還在、復原鈕變淡", h22 === 20 && s.hist === 0 && s.ink > 0 && await lit(p, 0.505, 0.17) && !(await lit(p, 0.70, 0.17)) && await p.evaluate(() => document.getElementById("xUndo").classList.contains("dim")), `hist=${h22} ink=${s.ink}`);

  // 復原要精準：疊在舊筆畫上的新一筆復原後，舊的那筆一模一樣（只存改到的像素，不能存漏）
  const exact = await p.evaluate(() => {
    __mirror.clearAll();
    __mirror.drawStroke(Array.from({ length: 20 }, (_, i) => [0.3 + i * 0.02, 0.4 + 0.05 * Math.sin(i)]), { sym: 12 });
    const grab = () => [...document.querySelector("#mirror .x-store").getContext("2d").getImageData(0, 0, __mirror.R0, __mirror.R0).data];
    const a = grab();
    __mirror.drawStroke(Array.from({ length: 20 }, (_, i) => [0.35 + i * 0.015, 0.3 + i * 0.02]), { sym: 12, brush: "rainbow" });
    const t0 = performance.now(); __mirror.undo(); const ms = performance.now() - t0;
    const b = grab();
    let diff = 0, max = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) diff++; if (d > max) max = d; }
    return { diff, max, ms: Math.round(ms) };
  });
  check("復原精準：疊上去的一筆復原後，原本的畫完全一樣", exact.max <= 2, JSON.stringify(exact));
  const perf = await p.evaluate(() => {
    const t0 = performance.now();
    __mirror.drawStroke(Array.from({ length: 120 }, (_, i) => [0.5 + 0.4 * Math.cos(i / 20), 0.5 + 0.4 * Math.sin(i / 17)]), { sym: 12 });
    return Math.round(performance.now() - t0);
  });
  results.push(`ℹ️ 參考：12 份、120 點的長筆畫（含收筆存復原）在無頭 Chrome 花 ${perf} ms`);

  // 清空要按住 1 秒；可以復原
  const ink0 = (await st(p)).ink, clr = p.locator("#xClear");
  await clr.dispatchEvent("pointerdown"); await p.waitForTimeout(250); await clr.dispatchEvent("pointerup");
  const afterShort = (await st(p)).ink;
  await clr.dispatchEvent("pointerdown"); await p.waitForTimeout(1200); await clr.dispatchEvent("pointerup");
  const afterHold = await st(p), axesBack = await p.evaluate(() => !document.querySelector("#mirror .x-axes").classList.contains("off"));
  await p.locator("#xUndo").tap();
  check("清空：按一下不會清、按住 1 秒才清（對稱軸回來）、清空可以復原", afterShort === ink0 && afterHold.ink === 0 && axesBack && (await st(p)).ink === ink0 &&
    (await calls(p, "sfx")).some(c => c[1] === "clear"), `short=${afterShort} hold=${afterHold.ink} undo=${(await st(p)).ink}`);

  // 美美的一張給截圖：12 份雪花＋8 份花，三種筆
  await p.evaluate(() => {
    __mirror.clearAll();
    const P = (pts) => pts;
    __mirror.drawStroke(P(Array.from({ length: 30 }, (_, i) => [0.5 + i * 0.012 * Math.sin(i / 4), 0.5 - i * 0.013])), { sym: 12, brush: "neon", color: "#2cefff" });
    __mirror.drawStroke(P(Array.from({ length: 24 }, (_, i) => [0.5 + 0.17 * Math.cos(i / 23 * 1.0 - 1.9), 0.5 + 0.17 * Math.sin(i / 23 * 1.0 - 1.9)])), { sym: 12, brush: "neon", color: "#ff3fa4" });
    __mirror.drawStroke(P(Array.from({ length: 30 }, (_, i) => [0.5 + 0.30 * Math.cos(i / 29 * 0.5 - 1.82), 0.5 + 0.30 * Math.sin(i / 29 * 0.5 - 1.82)])), { sym: 12, brush: "star", color: "auto" });
    __mirror.drawStroke(P(Array.from({ length: 40 }, (_, i) => { const u = i / 39, r = 0.42 * Math.sin(Math.PI * u) ** 0.6, f = -Math.PI / 2 + Math.PI / 8 + 0.35 * (2 * u - 1); return [0.5 + r * Math.cos(f), 0.5 + r * Math.sin(f)]; })), { sym: 8, brush: "rainbow" });
    __mirror.drawStroke(P(Array.from({ length: 12 }, (_, i) => [0.5 + 0.07 * Math.cos(i / 11 * 6.3), 0.5 + 0.07 * Math.sin(i / 11 * 6.3)])), { sym: 8, brush: "neon", color: "#ffe53b" });
  });
  await p.waitForTimeout(300);
  await shot(p, "02-pattern.png");

  // 轉起來：慢慢轉、一閃一閃、一串音符；再點一次停回原位
  await clearCalls(p);
  await p.locator("#xSpin").tap();
  await p.waitForTimeout(700);
  const spin1 = await p.evaluate(() => ({ on: __mirror.state.spin, cls: document.getElementById("mirror").classList.contains("spinning"), tf: document.querySelector("#mirror .x-art").style.transform, a: __mirror.state.angle }));
  await p.waitForTimeout(800);
  await shot(p, "04-spin.png");
  const spin2 = await p.evaluate(() => __mirror.state.angle);
  const notes = (await calls(p, "note")).length, magic = (await calls(p, "sfx")).some(c => c[1] === "magic");
  check("轉起來：開始轉（角度一直變）、一串五聲音階音符、魔法音效", spin1.on && spin1.cls && /rotate/.test(spin1.tf) && spin2 > spin1.a && notes >= 3 && magic, `${JSON.stringify(spin1)} a2=${spin2.toFixed(1)} notes=${notes}`);
  // 轉的時候手指按著不動 → 畫出圓圈（陶藝轉盤）
  const inkSpin0 = (await st(p)).ink;
  await drag(p, [[0.85, 0.5], [0.851, 0.5]], { hold: 900 });
  const inkSpin1 = (await st(p)).ink;
  check("轉的時候按著不動也會畫（跟著轉盤畫出一段圓弧）", inkSpin1 > inkSpin0 + 30, `${inkSpin0} → ${inkSpin1}`);
  await p.locator("#xSpin").tap();
  await p.waitForTimeout(900);
  const stopped = await p.evaluate(() => ({ on: __mirror.state.spin, tf: document.querySelector("#mirror .x-art").style.transform, a: __mirror.state.angle, btn: document.getElementById("xSpin").classList.contains("on") }));
  check("再點一次：停下來、轉回原位", !stopped.on && stopped.tf === "" && stopped.a === 0 && !stopped.btn, JSON.stringify(stopped));

  // 存到作品牆
  await clearCalls(p);
  await p.locator("#xSave").tap();
  await p.locator("#xSave").tap();   // 連點：只能存一次
  await p.waitForTimeout(500);
  let sv = await calls(p, "saveWork");
  const saved = await p.evaluate(() => __saved.map(s => [s.w, s.h]));
  const savedStars = (await calls(p, "stars")).length, savedSfx = (await calls(p, "sfx")).filter(c => c[1] === "save").length;
  check("存到作品牆：連點也只存一次、3:2 圖、成功放星星＋save 音效", sv.length === 1 && saved.length === 1 && saved[0][0] === saved[0][1] * 1.5 && savedStars >= 1 && savedSfx >= 1 && !(await st(p)).dirty,
    `save=${sv.length} size=${JSON.stringify(saved)} stars=${savedStars}`);
  const url = await p.evaluate(() => __saved[0].url);
  fs.writeFileSync(path.join(OUT, "08-export.png"), Buffer.from(url.split(",")[1], "base64"));
  await p.locator("#xSave").tap(); await p.waitForTimeout(300);
  check("存過、沒再畫：再按存只慶祝、不重複存", (await calls(p, "saveWork")).length === 1 && (await calls(p, "stars")).length >= 2);

  // 回首頁 → 再進來：存過的畫換一張新的
  await clearCalls(p);
  await p.locator("#xHome").tap(); await p.waitForTimeout(300);
  const home = await p.evaluate(() => document.getElementById("home").classList.contains("on") && !document.getElementById("mirror").classList.contains("on"));
  check("回首頁：呼叫 onHome、聲音收掉", home && (await calls(p, "onHome")).length === 1 && (await calls(p, "strokeOff")).length >= 1);
  await open(p);
  check("存過的畫：再進來是新的一張", (await st(p)).ink === 0 && (await st(p)).hist === 0);
  await drag(p, [[0.3, 0.3], [0.4, 0.2]]);
  await p.locator("#xHome").tap(); await p.waitForTimeout(200);
  await open(p);
  check("沒存的畫：再進來還在", (await st(p)).ink > 0);

  // 空白就按存：不存、出現「在這裡畫」的手指
  await p.evaluate(() => __mirror.clearAll());
  await clearCalls(p);
  await p.locator("#xSave").tap(); await p.waitForTimeout(200);
  check("空白畫布按存：不存，出現手指提示", (await calls(p, "saveWork")).length === 0 && await p.evaluate(() => document.querySelector("#mirror .x-hand").classList.contains("swipe")));

  // 作品牆滿了
  await p.evaluate(() => { window.__saveResult = "full"; __mirror.drawStroke([[0.3, 0.3], [0.35, 0.4]]); });
  await clearCalls(p);
  await p.locator("#xSave").tap(); await p.waitForTimeout(500);
  const toasts = await calls(p, "toast");
  check("作品牆滿了：跳「🖼️ 滿了」、這張還算沒存", toasts.length === 1 && toasts[0][1] === "🖼️ 滿了" && (await st(p)).dirty, JSON.stringify(toasts));
  await p.evaluate(() => { window.__saveResult = "ok"; });

  // 第二根手指（手掌）不理
  await p.evaluate(() => { __mirror.clearAll(); __mirror.state.sym = 2; });
  await p.evaluate(() => {
    const stg = document.querySelector("#mirror .x-stage"), f = document.querySelector("#mirror .x-frame").getBoundingClientRect();
    const at = (u, v) => ({ clientX: f.left + u * f.width, clientY: f.top + v * f.height });
    const ev = (type, id, prim, u, v) => stg.dispatchEvent(new PointerEvent(type, { pointerId: id, isPrimary: prim, pointerType: "touch", bubbles: true, ...at(u, v) }));
    ev("pointerdown", 11, true, 0.3, 0.5);
    ev("pointerdown", 12, false, 0.5, 0.9);
    ev("pointermove", 12, false, 0.52, 0.85);
    ev("pointermove", 11, true, 0.32, 0.45);
    ev("pointerup", 12, false, 0.52, 0.85);
    ev("pointerup", 11, true, 0.32, 0.45);
  });
  check("第二根手指（手掌）不理：只有第一根畫出來", await lit(p, 0.31, 0.48) && await lit(p, 0.69, 0.48) && !(await lit(p, 0.5, 0.9)) && !(await lit(p, 0.51, 0.87)));
  await p.evaluate(() => { __mirror.state.sym = 8; });

  // 視窗大小改變：重新排版、畫保留
  await p.evaluate(() => { __mirror.clearAll(); __mirror.drawStroke([[0.5, 0.3], [0.6, 0.2], [0.7, 0.3]]); });
  const before = await p.evaluate(() => ({ ink: __mirror.ink(), px: __mirror.px(0.6, 0.2).join(), f: document.querySelector("#mirror .x-frame").getBoundingClientRect().width }));
  await p.setViewportSize({ width: 1024, height: 700 });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => {
    const s = document.querySelector("#mirror .x-stage").getBoundingClientRect(), f = document.querySelector("#mirror .x-frame").getBoundingClientRect();
    return { ink: __mirror.ink(), px: __mirror.px(0.6, 0.2).join(), f: f.width, sq: Math.abs(f.width - f.height) < 1, inside: f.top >= s.top && f.bottom <= s.bottom && f.right <= s.right, L: __mirror.layout().side };
  });
  await shot(p, "05-resized.png");
  check("視窗變小：畫框跟著縮、還是正方形、畫的內容一點不變", after.f < before.f - 50 && after.sq && after.inside && after.ink === before.ink && after.px === before.px && Math.abs(after.L - after.f) < 1, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  await drag(p, [[0.2, 0.2], [0.3, 0.25]]);
  check("視窗變小後畫的位置還是對的（手指在哪就畫在哪）", await lit(p, 0.25, 0.225));
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.waitForTimeout(300);

  // close()：停掉動畫和聲音
  await p.locator("#xSpin").tap(); await p.waitForTimeout(300);
  await p.evaluate(() => { __calls.length = 0; __mod.close(); });   // 同一步清紀錄＋關，中間不會偷響一個音
  await p.waitForTimeout(300);
  const notesAfter = (await calls(p, "note")).length;
  check("close()：轉圈停、回原位、音符不再響", await p.evaluate(() => !__mirror.state.spin && document.querySelector("#mirror .x-art").style.transform === "") && notesAfter === 0 && (await calls(p, "strokeOff")).length >= 1);
  await ctx.close();

  // ═══ 2. 第一次打開：自動示範畫一朵花；之後不再示範 ═══
  ({ ctx, p } = await newPage({}));
  await open(p);
  await p.waitForTimeout(1300);
  const mid = await p.evaluate(() => ({ demo: __mirror.state.demo, hand: document.querySelector("#mirror .x-hand").classList.contains("on") }));
  await p.waitForTimeout(1800);
  s = await st(p);
  await shot(p, "01-demo.png");
  const seenV = await p.evaluate(() => localStorage.getItem("draw-mirror-seen"));
  check("第一次打開：自動示範畫一朵花（手指跟著走），畫完記住看過了", mid.demo && mid.hand && !s.demo && s.ink > 300 && seenV === "1" && (await calls(p, "strokeOn")).length === 1, `mid=${JSON.stringify(mid)} ink=${s.ink} seen=${seenV}`);
  await p.reload();
  await p.waitForFunction(() => window.__ready && window.__mirror);
  await open(p);
  await p.waitForTimeout(2600);
  check("第二次打開：不再示範", (await st(p)).ink === 0 && !(await st(p)).demo);
  await ctx.close();

  ({ ctx, p } = await newPage({}));
  await open(p);
  await p.waitForTimeout(1300);
  await drag(p, [[0.2, 0.8], [0.3, 0.85]]);
  await p.waitForTimeout(600);
  const it = await p.evaluate(() => ({ demo: __mirror.state.demo, hand: document.querySelector("#mirror .x-hand").classList.contains("on"), hist: __mirror.hist() }));
  check("示範到一半手指一碰：示範停下、小孩的那一筆照畫", !it.demo && !it.hand && it.hist === 2 && await lit(p, 0.25, 0.825), JSON.stringify(it));
  await ctx.close();

  // ═══ 3. 壞掉的 localStorage、工具列在左邊 ═══
  ({ ctx, p } = await newPage({ "draw-mirror": "{壞掉了", "draw-mirror-seen": "1", "draw-side": "left" }));
  const bad = await p.evaluate(() => ({ before: window.__before["draw-mirror"], st: { sym: __mirror.state.sym, brush: __mirror.state.brush, color: __mirror.state.color }, now: localStorage.getItem("draw-mirror") }));
  await open(p);
  const left = await p.evaluate(() => {
    const f = document.querySelector("#mirror .x-frame").getBoundingClientRect(), b = document.querySelector("#mirror .x-bar").getBoundingClientRect();
    return document.getElementById("mirror").classList.contains("left") && b.right <= f.left;
  });
  await p.locator("#xColor").tap(); await p.waitForTimeout(300);
  const popLeft = await p.evaluate(() => { const r = document.querySelector("#mirror .x-pop").getBoundingClientRect(), b = document.querySelector("#mirror .x-bar").getBoundingClientRect(); return r.left >= b.right; });
  await p.evaluate(() => __mirror.drawStroke(Array.from({ length: 30 }, (_, i) => [0.3 + i * 0.006, 0.35 + 0.12 * Math.sin(i / 5)]), { sym: 2, brush: "rainbow" }));
  await p.waitForTimeout(200);
  await shot(p, "06-left-butterfly.png");
  check("壞掉的設定（不是 JSON）：自動換回預設並寫回好資料", bad.before === "{壞掉了" && bad.st.sym === 8 && bad.st.brush === "neon" && bad.st.color === "auto" && JSON.parse(bad.now).sym === 8, JSON.stringify(bad));
  check("工具列在左邊（跟畫畫頁設定一樣）：工具列、顏色選單都換邊", left && popLeft);
  await ctx.close();
  ({ ctx, p } = await newPage({ "draw-mirror": JSON.stringify({ sym: 5, brush: "x", color: "#123456" }), "draw-mirror-seen": "1" }));
  const bad2 = await p.evaluate(() => [__mirror.state.sym, __mirror.state.brush, __mirror.state.color].join());
  check("設定值不在清單裡：換回預設", bad2 === "8,neon,auto", bad2);
  await ctx.close();

  check("沒有 pageerror / console error", errs.length === 0, errs.slice(0, 3).join(" | "));
  await browser.close();
  console.log(results.join("\n"));
  const fail = results.filter(r => r.startsWith("❌")).length;
  console.log(fail ? `\n${fail} 項失敗（共 ${results.length} 項）` : `\n全部通過（${results.length} 項）`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
