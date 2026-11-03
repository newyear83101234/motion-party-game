// 拼圖（js/draw-puzzle.js）瀏覽器測試：獨立 headless Chromium，模擬 iPad 橫向觸控
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1（在 GAME DIY 根目錄）
// 用法：node tools/draw-test/puzzle.js [截圖資料夾]
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const URL = process.env.PUZZLE_URL || "http://127.0.0.1:8765/tools/draw-test/puzzle-harness.html";
const OUT = process.argv[2] || path.join(__dirname, "_review", "puzzle");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = "") => { results.push((ok ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); };
const GRID = { 4: [2, 2], 6: [3, 2], 9: [3, 3], 12: [4, 3] };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findShell(), args: ["--mute-audio"] });
  const errs = [];
  // init：在模組載入前寫好 localStorage（之後讀回確認真的寫進去了）
  async function newPage(init = { "draw-puzzle-seen": "1" }, viewport = { width: 1180, height: 820 }) {
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
    await p.waitForFunction(() => window.__ready && window.__puzzle, null, { timeout: 8000 });
    return { ctx, p };
  }
  const calls = (p, name) => p.evaluate(n => __calls.filter(c => c[0] === n), name);
  const sfx = async (p, name) => (await calls(p, "sfx")).filter(c => c[1] === name).length;
  const clearCalls = p => p.evaluate(() => { __calls.length = 0; });
  const idle = p => p.waitForFunction(() => __puzzle.state.ready && !__puzzle.state.busy, null, { timeout: 6000 });
  const pcs = p => p.evaluate(() => __puzzle.pieces());
  const st = p => p.evaluate(() => ({ ...__puzzle.state }));
  const ctr = q => [q.x + q.w / 2, q.y + q.h / 2];
  const openWith = async (p, expr, pieces) => { await p.evaluate(([e, n]) => { __mod.open(eval(e), n ? { pieces: n } : {}); }, [expr, pieces]); await idle(p); };
  async function drag(p, [x0, y0], [x1, y1], { release = true } = {}) {
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let k = 1; k <= 12; k++) await p.mouse.move(x0 + (x1 - x0) * k / 12, y0 + (y1 - y0) * k / 12);
    if (release) await p.mouse.up();
  }
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n) });
  const near = (a, b, t = 0.6) => Math.abs(a - b) <= t;
  // 每塊實際畫出來的範圍（看畫布不透明的像素），檢查：都在畫面裡、彼此不重疊、不壓到底板、不在上方按鈕底下
  const layoutCheck = p => p.evaluate(() => {
    const W = innerWidth, H = innerHeight, bd = __puzzle.board(), b = { x: bd.x, y: bd.y, r: bd.x + bd.w, b: bd.y + bd.h };
    const btns = ["#pzHome", "#pzCount"].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; });
    const boxes = __puzzle.pieces().filter(q => !q.ok).map(q => {
      const c = document.querySelector(`.pz-pc[data-i="${q.i}"]`), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, k = parseFloat(c.style.width) / c.width;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) if (d[(j * c.width + i) * 4 + 3] > 30) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
      const ox = q.x - q.pad, oy = q.y - q.pad;
      return { i: q.i, x: ox + x0 * k, y: oy + y0 * k, r: ox + (x1 + 1) * k, b: oy + (y1 + 1) * k };
    });
    const ov = (a, c) => a.x < c.r - 1 && c.x < a.r - 1 && a.y < c.b - 1 && c.y < a.b - 1;
    const pairs = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (ov(boxes[i], boxes[j])) pairs.push([boxes[i].i, boxes[j].i]);
    return { n: boxes.length, out: boxes.filter(q => q.x < -0.5 || q.y < -0.5 || q.r > W + 0.5 || q.b > H + 0.5).map(q => q.i), overlap: pairs,
      onBoard: boxes.filter(q => ov(q, b)).map(q => q.i), underBtn: boxes.filter(q => btns.some(t => ov(q, t))).map(q => q.i) };
  });
  // ═══ 1. 一般流程（已看過示範） ═══
  let { ctx, p } = await newPage();
  await p.locator("#goPuzzle").tap();
  await p.waitForTimeout(700);
  await shot(p, "01-intro.png");   // 開場：先拼好、正要散開
  await idle(p);
  const shown = await p.evaluate(() => ({
    on: document.getElementById("puzzle").classList.contains("on") && !document.getElementById("home").classList.contains("on"),
    btns: ["pzHome", "pzCount", "pzN4", "pzN6", "pzN9", "pzN12", "pzAgain", "pzHome2"].filter(i => document.getElementById(i)).length,
    css: getComputedStyle(document.getElementById("pzN4")).borderTopLeftRadius, n: __puzzle.state.n,
    active: [...document.querySelectorAll(".pz-n.on")].map(b => b.id).join(),
    cells: ["pzN4", "pzN6", "pzN9", "pzN12"].map(i => document.querySelectorAll(`#${i} rect`).length).join(),
  }));
  check("打開：切到 #puzzle、固定 id 的按鈕都在、CSS 有載入、預設 4 塊；塊數鈕用 2×2／3×2／3×3／4×3 小格子", shown.on && shown.btns === 8 && shown.css === "50%" && shown.n === 4 && shown.active === "pzN4" && shown.cells === "4,6,9,12", JSON.stringify(shown));
  await shot(p, "02-four.png");

  // 各塊數切法：塊數、格子、每個點剛好被一塊蓋到（凸起凹槽咬合、沒縫沒重疊）、每塊切到圖的正確位置、散落位置
  const cutRes = [], layRes = [];
  for (const n of [4, 6, 9, 12]) {
    await openWith(p, "__grad", n);
    const s = await st(p), list = await pcs(p), cov = await p.evaluate(() => __puzzle.cover(4000));
    const [cols, rows] = GRID[n], cells = new Set(list.map(q => q.col + "," + q.row));
    const sizeOk = list.every(q => near(q.w, s.B / cols, 0.01) && near(q.h, s.B / (1200 / 800) / rows, 0.01));
    const pix = await p.evaluate(([cols, rows]) => __puzzle.pieces().map(q => {
      const c = document.querySelector(`.pz-pc[data-i="${q.i}"]`), k = c.width / parseFloat(c.style.width), x = c.getContext("2d");
      const [r, g] = x.getImageData(Math.round((q.pad + q.w / 2) * k), Math.round((q.pad + q.h / 2) * k), 1, 1).data;
      const er = (q.col + 0.5) / cols * 255, eg = (q.row + 0.5) / rows * 255;
      return Math.max(Math.abs(r - er), Math.abs(g - eg)) <= 6 && x.getImageData(1, 1, 1, 1).data[3] === 0;
    }).every(Boolean), [cols, rows]);
    cutRes.push({ n, ok: s.n === n && s.cols === cols && s.rows === rows && list.length === n && cells.size === n && sizeOk && cov.zero + cov.multi <= 8 && pix, cov, pix });
    layRes.push({ n0: n, ...(await layoutCheck(p)) });
    if (n === 12) await shot(p, "04-twelve.png");
    if (n === 6) await shot(p, "08-six.png");
  }
  check("各塊數切法正確：4／6／9／12 塊＝2×2／3×2／3×3／4×3、大小一樣、凸起凹槽剛好咬合（4000 點抽樣每點只被 1 塊蓋到）、每塊切到圖的正確位置", cutRes.every(r => r.ok), JSON.stringify(cutRes));
  check("散落：每塊整個（含凸起）都在畫面裡、彼此不重疊、不壓到底板、不在上方按鈕底下",
    layRes.every(r => r.n === r.n0 && !r.out.length && !r.overlap.length && !r.onBoard.length && !r.underBtn.length), JSON.stringify(layRes));

  // 從 blob 網址開（作品牆給的通常是 blob:）
  await p.evaluate(async () => { __mod.open(await __blobUrl(__grad), { pieces: 9 }); });
  await idle(p);
  const blobPix = await p.evaluate(() => __puzzle.pieces().map(q => {
    const c = document.querySelector(`.pz-pc[data-i="${q.i}"]`), k = c.width / parseFloat(c.style.width);
    const [r, g] = c.getContext("2d").getImageData(Math.round((q.pad + q.w / 2) * k), Math.round((q.pad + q.h / 2) * k), 1, 1).data;
    return Math.max(Math.abs(r - (q.col + 0.5) / 3 * 255), Math.abs(g - (q.row + 0.5) / 3 * 255)) <= 6;
  }).every(Boolean));
  check("用 blob: 網址開也可以，圖切得對", blobPix && (await st(p)).n === 9);

  // ── 拖拉（4 塊，吸附範圍 60px） ──
  await p.evaluate(() => __mod.open(__scene, { pieces: 4 })); await idle(p);
  await clearCalls(p);
  let L = await pcs(p), a = L[0];
  await drag(p, ctr(a), [a.tx + a.w / 2 + 20, a.ty + a.h / 2 - 15], { release: false });
  await shot(p, "03-drag.png");
  const lifted = (await pcs(p))[0];
  await p.mouse.up();
  await p.waitForTimeout(300);
  let b = (await pcs(p))[0];
  const maxLoose = Math.max(...(await pcs(p)).filter(q => !q.ok).map(q => q.z));
  check("拿起來：放大、跑到最上層、播 tap", lifted.up && lifted.z > Math.max(...L.filter(q => q.i !== 0).map(q => q.z)) && (await sfx(p, "tap")) === 1, `up=${lifted.up} z=${lifted.z}`);
  check("拖到正確位置附近（差 25px）放開：吸附到正確位置、sticker 音效＋星星、拼好的在沒拼好的下面",
    b.ok && near(b.x, b.tx) && near(b.y, b.ty) && (await sfx(p, "sticker")) === 1 && (await calls(p, "stars")).length === 1 && b.z < maxLoose && !b.up, JSON.stringify(b));

  // 拼好的不能再拖
  L = await pcs(p); a = L[0];
  await clearCalls(p);
  await drag(p, ctr(a), [ctr(a)[0] + 130, ctr(a)[1] + 90]);
  await p.waitForTimeout(200);
  b = (await pcs(p))[0];
  check("吸附後不能再拖：按住拖 160px，位置一動也不動", b.ok && near(b.x, a.x) && near(b.y, a.y) && (await sfx(p, "tap")) === 0, `${a.x},${a.y} → ${b.x},${b.y}`);

  // 拖到錯的地方（底板正中間）：留在原地、不彈回去
  await clearCalls(p);
  L = await pcs(p); a = L[1];
  const bd = await p.evaluate(() => __puzzle.board());
  const dropAt = [bd.x + bd.w / 2 + 5, bd.y + bd.h / 2 + 5];
  await drag(p, ctr(a), dropAt);
  await p.waitForTimeout(300);
  b = (await pcs(p))[1];
  check("拖到錯的地方放開：留在放開的位置（不彈回去）、沒有吸附音效", !b.ok && near(b.x + b.w / 2, dropAt[0], 1) && near(b.y + b.h / 2, dropAt[1], 1) && (await sfx(p, "sticker")) === 0,
    `${b.x + b.w / 2},${b.y + b.h / 2} vs ${dropAt}`);

  // 4 塊時差 50px 還算對（60 以內）
  L = await pcs(p); a = L[2];
  await drag(p, ctr(a), [a.tx + a.w / 2 + 50, a.ty + a.h / 2]);
  await p.waitForTimeout(200);
  const at50four = (await pcs(p))[2].ok;

  // 第二根手指（手掌）不理
  L = await pcs(p);
  const loose = L.filter(q => !q.ok);
  const [pa, pb] = [loose[0], loose[1]];
  await p.evaluate(([A, B]) => {
    const t = document.querySelector("#puzzle .pz-table");
    const ev = (type, id, prim, x, y) => t.dispatchEvent(new PointerEvent(type, { pointerId: id, isPrimary: prim, pointerType: "touch", bubbles: true, clientX: x, clientY: y }));
    const ca = [A.x + A.w / 2, A.y + A.h / 2], cb = [B.x + B.w / 2, B.y + B.h / 2];
    ev("pointerdown", 11, true, ...ca);
    ev("pointerdown", 12, false, ...cb);
    ev("pointermove", 12, false, cb[0] + 80, cb[1] + 40);
    ev("pointermove", 11, true, ca[0] - 30, ca[1] + 20);
    ev("pointerup", 12, false, cb[0] + 80, cb[1] + 40);
    ev("pointerup", 11, true, ca[0] - 30, ca[1] + 20);
  }, [pa, pb]);
  const L2 = await pcs(p), pa2 = L2[pa.i], pb2 = L2[pb.i];
  check("第二根手指（手掌）不理：只有第一根手指拖的那塊會動", near(pa2.x, pa.x - 30) && near(pa2.y, pa.y + 20) && near(pb2.x, pb.x) && near(pb2.y, pb.y), `a ${pa.x}→${pa2.x} b ${pb.x}→${pb2.x}`);

  // 9 塊時吸附範圍只有 36px：差 50 不吸、差 25 吸
  await p.locator("#pzN9").tap(); await idle(p);
  L = await pcs(p); a = L[4];
  await drag(p, ctr(a), [a.tx + a.w / 2 + 50, a.ty + a.h / 2]);
  await p.waitForTimeout(200);
  const at50nine = (await pcs(p))[4];
  await drag(p, [at50nine.x + a.w / 2, at50nine.y + a.h / 2], [a.tx + a.w / 2 + 25, a.ty + a.h / 2]);
  await p.waitForTimeout(200);
  const at25nine = (await pcs(p))[4];
  check("吸附範圍：4 塊時差 50px 會吸；9 塊時差 50px 不吸（停在放開處）、差 25px 才吸", at50four && !at50nine.ok && near(at50nine.x, a.tx + 50, 1) && at25nine.ok && near(at25nine.x, at25nine.tx),
    `four50=${at50four} nine50=${at50nine.ok}@${(at50nine.x - a.tx).toFixed(1)} nine25=${at25nine.ok}`);

  // 塊數鈕：點目前這個不洗牌；連點只留最後一次
  const before9 = (await pcs(p)).map(q => q.x).join();
  await p.locator("#pzN9").tap(); await p.waitForTimeout(300);
  const same = (await pcs(p)).map(q => q.x).join() === before9 && (await st(p)).placed === 1;
  await p.evaluate(() => ["pzN4", "pzN6", "pzN12", "pzN9", "pzN6"].forEach(i => document.getElementById(i).click()));
  await idle(p);
  const rapid = await p.evaluate(() => ({ n: __puzzle.state.n, el: document.querySelectorAll(".pz-pc").length, on: [...document.querySelectorAll(".pz-n.on")].map(b => b.id).join(), pref: localStorage.getItem("draw-puzzle-n"), placed: __puzzle.state.placed }));
  check("塊數鈕：點目前的塊數不會洗牌（拼一半不會散掉）；連點 5 下只留最後一次（6 塊、畫面上剛好 6 塊、記住 6）", same && rapid.n === 6 && rapid.el === 6 && rapid.on === "pzN6" && rapid.pref === "6" && rapid.placed === 0, JSON.stringify(rapid));

  const ms = await p.evaluate(() => { const t0 = performance.now(); document.getElementById("pzN12").click(); return Math.round(performance.now() - t0); });
  results.push(`ℹ️ 參考：洗牌成 12 塊（切法＋找底板＋散落＋畫 12 塊）在無頭 Chrome 花 ${ms} ms`);
  await idle(p);
  // 9 塊拼一半，截圖
  await p.locator("#pzN9").tap(); await idle(p);
  await p.evaluate(() => __puzzle.solve(4));
  await p.waitForTimeout(400);
  await shot(p, "05-half.png");

  // 視窗大小改變：吸附的塊還在正確位置、沒拼好的還在畫面裡，之後照樣拖得進去
  const bd1 = await p.evaluate(() => __puzzle.board());
  await p.setViewportSize({ width: 1024, height: 700 });
  await p.waitForTimeout(500);
  const bd2 = await p.evaluate(() => __puzzle.board());
  L = await pcs(p);
  const okStay = L.filter(q => q.ok).every(q => near(q.x, q.tx) && near(q.y, q.ty)) && L.filter(q => q.ok).length === 4;
  const tl = await p.evaluate(() => { const q = __puzzle.pieces().find(q => q.col === 0 && q.row === 0); return q.ok ? [q.x, q.y] : [q.tx, q.ty]; });
  const lay2 = await layoutCheck(p);
  await shot(p, "07-resized.png");
  a = L.find(q => !q.ok);
  await drag(p, ctr(a), [a.tx + a.w / 2 + 10, a.ty + a.h / 2 + 10]);
  await p.waitForTimeout(250);
  check("視窗變小：底板跟著縮、吸附的 4 塊還在正確位置、沒拼好的整塊都在畫面裡不重疊、照樣拖得進去",
    bd2.w < bd1.w - 30 && okStay && near(tl[0], bd2.x) && near(tl[1], bd2.y) && !lay2.out.length && !lay2.overlap.length && (await pcs(p))[a.i].ok,
    `board ${bd1.w.toFixed(0)}→${bd2.w.toFixed(0)} lay=${JSON.stringify(lay2)}`);
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.waitForTimeout(400);
  L = await pcs(p);
  check("視窗變回來：吸附的塊仍在正確位置", L.filter(q => q.ok).length === 5 && L.filter(q => q.ok).every(q => near(q.x, q.tx) && near(q.y, q.ty)) && !(await layoutCheck(p)).out.length);

  // 拼完：提示淡出、閃光、吉祥物、finish 音效＋彩帶；2 秒後兩顆大按鈕
  await clearCalls(p);
  await p.evaluate(() => __puzzle.solve());
  await p.waitForTimeout(1300);
  const mid = await p.evaluate(() => ({
    won: document.getElementById("puzzle").classList.contains("won"), done: __puzzle.state.done,
    hint: getComputedStyle(document.querySelector(".pz-hint")).opacity, conf: document.querySelectorAll(".pz-confetti i").length,
    mascot: (() => { const r = document.querySelector(".pz-mascot").getBoundingClientRect(); return r.top < innerHeight - 60 && r.bottom > innerHeight - 40 && getComputedStyle(document.querySelector(".pz-mascot")).opacity === "1"; })(),
    btn: getComputedStyle(document.querySelector(".pz-done")).display,
  }));
  const fin = await sfx(p, "finish"), spl = (await calls(p, "splash")).length;
  await p.waitForTimeout(1700);   // 按鈕彈出來的動畫跑完再截
  await shot(p, "06-won.png");
  const end = await p.evaluate(() => {
    const bd = __puzzle.board(), on = id => { const r = document.getElementById(id).getBoundingClientRect(); return { r, vis: r.width > 80 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; };
    const A = on("pzAgain"), H = on("pzHome2"), ov = r => r.left < bd.x + bd.w && r.right > bd.x && r.top < bd.y + bd.h && r.bottom > bd.y;
    return { vis: A.vis && H.vis, offBoard: !ov(A.r) && !ov(H.r) };
  });
  check("拼完：提示淡出、吉祥物跳出來、finish 音效、彩帶＋粒子；按鈕還沒出來", mid.won && mid.done && mid.hint === "0" && mid.mascot && fin === 1 && spl >= 3 && mid.conf > 20 && mid.btn === "none", JSON.stringify({ ...mid, fin, spl }));
  check("拼完 2 秒後：再拼一次、回首頁兩顆大按鈕出現（在畫面裡、不擋到畫）", end.vis && end.offBoard, JSON.stringify(end));

  // 再拼一次：換下一個塊數
  await p.locator("#pzAgain").tap(); await idle(p);
  const ag = await p.evaluate(() => ({ n: __puzzle.state.n, el: document.querySelectorAll(".pz-pc").length, won: document.getElementById("puzzle").classList.contains("won"),
    done: getComputedStyle(document.querySelector(".pz-done")).display, loose: __puzzle.pieces().every(q => !q.ok) }));
  await p.locator("#pzN12").tap(); await idle(p);
  await p.evaluate(() => __puzzle.solve()); await p.waitForTimeout(2500);
  await p.locator("#pzAgain").tap(); await idle(p);
  const wrap = (await st(p)).n;
  check("再拼一次：9 → 12 塊（重新洗牌、按鈕收起、都沒拼好）；12 之後回到 4", ag.n === 12 && ag.el === 12 && !ag.won && ag.done === "none" && ag.loose && wrap === 4, `${JSON.stringify(ag)} wrap=${wrap}`);

  // 回首頁：拼完的計時器要停（剛拼完就走，不會在背後冒按鈕）
  await p.evaluate(() => __puzzle.solve());
  await p.waitForTimeout(400);
  await clearCalls(p);
  await p.locator("#pzHome").tap();
  await p.waitForTimeout(2200);
  const home = await p.evaluate(() => ({ home: document.getElementById("home").classList.contains("on"), pz: document.getElementById("puzzle").classList.contains("on"), done: document.querySelector(".pz-done").classList.contains("on") }));
  check("🏠 回首頁：呼叫 onHome、切回首頁、拼完的計時器停掉", home.home && !home.pz && !home.done && (await calls(p, "onHome")).length === 1, JSON.stringify(home));
  await p.locator("#goPuzzle").tap(); await idle(p);
  await p.evaluate(() => __puzzle.solve()); await p.waitForTimeout(2400);
  await clearCalls(p);
  await p.locator("#pzHome2").tap(); await p.waitForTimeout(200);
  check("拼完的 🏠 也能回首頁；再進來是新的一局", (await calls(p, "onHome")).length === 1 && await p.evaluate(() => document.getElementById("home").classList.contains("on")));
  await ctx.close();

  // ═══ 2. 第一次打開：示範一塊自己滑到正確位置；之後不再示範 ═══
  ({ ctx, p } = await newPage({}));
  await p.locator("#goPuzzle").tap();
  await p.waitForTimeout(2100);
  const start = await pcs(p);
  await p.waitForTimeout(1300);
  const dm = await p.evaluate(() => ({ demo: __puzzle.state.demo, hand: document.querySelector(".pz-hand").classList.contains("on"), n: __puzzle.state.n, up: __puzzle.pieces().filter(q => q.up).map(q => q.i) }));
  await shot(p, "09-demo.png");
  const moving = dm.up.length === 1 && (await pcs(p))[dm.up[0]].x !== start[dm.up[0]].x;
  await p.waitForTimeout(1800);
  const dEnd = await p.evaluate(() => ({ demo: __puzzle.state.demo, hand: document.querySelector(".pz-hand").classList.contains("on"), ok: __puzzle.pieces().filter(q => q.ok).map(q => q.i), seen: localStorage.getItem("draw-puzzle-seen") }));
  check("第一次打開：預設 4 塊、手指示範一塊自己慢慢滑到正確位置並吸附、記住看過了", dm.demo && dm.hand && dm.n === 4 && moving && !dEnd.demo && !dEnd.hand && dEnd.ok.length === 1 && dEnd.ok[0] === dm.up[0] && dEnd.seen === "1",
    `mid=${JSON.stringify(dm)} moving=${moving} end=${JSON.stringify(dEnd)}`);
  await p.reload();
  await p.waitForFunction(() => window.__ready && window.__puzzle);
  await p.locator("#goPuzzle").tap();
  let everDemo = false;
  for (let i = 0; i < 10; i++) { await p.waitForTimeout(450); everDemo = everDemo || await p.evaluate(() => __puzzle.state.demo); }
  check("示範只出現一次：第二次打開不示範", !everDemo && (await pcs(p)).every(q => !q.ok));
  await ctx.close();

  // 示範到一半手指一碰：示範停下，小孩自己拖
  ({ ctx, p } = await newPage({}));
  await p.locator("#goPuzzle").tap();
  await p.waitForTimeout(3000);
  const dUp = (await pcs(p)).find(q => q.up), other = (await pcs(p)).find(q => !q.up && !q.ok);
  await drag(p, ctr(other), [ctr(other)[0] + 30, ctr(other)[1] - 20]);
  await p.waitForTimeout(1500);
  const it = await p.evaluate(() => ({ demo: __puzzle.state.demo, hand: document.querySelector(".pz-hand").classList.contains("on"), ok: __puzzle.pieces().filter(q => q.ok).length, up: __puzzle.pieces().filter(q => q.up).length }));
  const moved = (await pcs(p))[other.i];
  check("示範到一半手指一碰：示範停下、那塊停在原地不吸附、小孩拖的那塊照動", !!dUp && !it.demo && !it.hand && it.ok === 0 && it.up === 0 && near(moved.x, other.x + 30) && near(moved.y, other.y - 20), JSON.stringify(it));
  await ctx.close();

  // ═══ 3. 壞掉的 localStorage ═══
  ({ ctx, p } = await newPage({ "draw-puzzle-n": "{壞掉了", "draw-puzzle-seen": "1" }));
  await p.locator("#goPuzzle").tap(); await idle(p);
  const bad = await p.evaluate(() => ({ before: window.__before["draw-puzzle-n"], n: __puzzle.state.n, now: localStorage.getItem("draw-puzzle-n") }));
  check("壞掉的設定（不是數字）：換回 4 塊並寫回好資料", bad.before === "{壞掉了" && bad.n === 4 && bad.now === "4", JSON.stringify(bad));
  await ctx.close();
  ({ ctx, p } = await newPage({ "draw-puzzle-n": "7", "draw-puzzle-seen": "1" }));
  await p.locator("#goPuzzle").tap(); await idle(p);
  const bad7 = (await st(p)).n;
  await ctx.close();
  ({ ctx, p } = await newPage({ "draw-puzzle-n": "12", "draw-puzzle-seen": "1" }));
  await p.locator("#goPuzzle").tap(); await idle(p);
  check("塊數不在清單裡（7）換回 4；存的是 12 就記得用 12", bad7 === 4 && (await st(p)).n === 12, `7→${bad7}`);
  await ctx.close();

  check("沒有 pageerror / console error", errs.length === 0, errs.slice(0, 3).join(" | "));
  await browser.close();
  console.log(results.join("\n"));
  const fail = results.filter(r => r.startsWith("❌")).length;
  console.log(fail ? `\n${fail} 項失敗（共 ${results.length} 項）` : `\n全部通過（${results.length} 項）`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
