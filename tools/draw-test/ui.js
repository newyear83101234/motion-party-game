// 畫畫遊戲瀏覽器測試：獨立 headless Chromium（不碰共用瀏覽器），模擬 iPad 橫向觸控
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1（在 GAME DIY 根目錄）
// 用法：node tools/draw-test/ui.js [輸出資料夾]
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const BASE = process.env.DRAW_URL || "http://127.0.0.1:8765/draw.html";
const ART = "IMAGE/draw/lineart/test-shapes.svg";
const OUT = process.argv[2] || path.join(process.env.TEMP, "draw-shots");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = "") => { results.push((ok ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); };

// draw.html 與 js/draw*.js 裡所有 ?v= 必須相同（漏升版號 → iPad 會吃到舊快取）
function versionCheck() {
  const root = path.join(__dirname, "../..");
  const files = ["draw.html", ...fs.readdirSync(path.join(root, "js")).filter(f => /^draw.*\.js$/.test(f)).map(f => "js/" + f)];
  const vs = new Set();
  for (const f of files) for (const m of fs.readFileSync(path.join(root, f), "utf8").matchAll(/\?v=(\d+)/g)) vs.add(m[1]);
  check("所有 ?v= 版號一致", vs.size === 1, [...vs].join(","));
}

(async () => {
  versionCheck();
  const browser = await chromium.launch({ headless: true, executablePath: findShell() });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 160)); });
  const px = (x, y) => p.evaluate(([x, y]) => [...__draw.board.ctx.getImageData(x, y, 1, 1).data].slice(0, 3).join(","), [x, y]);
  const toClient = (x, y) => p.evaluate(([x, y]) => __draw.board.toClient(x, y), [x, y]);
  const tapImg = async (x, y) => { const c = await toClient(x, y); await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(700); };

  await p.goto(BASE + "?dev&art=" + ART);
  await p.waitForFunction(() => window.__draw && __draw.board.labels, null, { timeout: 8000 });
  const n = await p.evaluate(() => __draw.board.boxes.length);
  check("測試線稿切出 6 塊", n === 6, `count=${n}`);
  await tapImg(1450, 500);
  check("點長方形 → 填成紅色", await px(1450, 500) === "229,57,53", await px(1450, 500));
  check("背景沒被填到", await px(50, 50) === "255,255,255");
  await p.evaluate(() => __draw.painter.undo());
  check("復原後回到白色", await px(1450, 500) === "255,255,255");
  await p.screenshot({ path: path.join(OUT, "01-fill.png") });

  // Task 4：材質
  const fillWith = (x, y, mat, color) => p.evaluate(([x, y, mat, color]) => {
    const P = __draw.painter, id = P.regionAt(x, y); P.fill(id, mat, color).done(); return id;
  }, [x, y, mat, color]);
  const colorsIn = (x, y, w, h) => p.evaluate(([x, y, w, h]) => {
    const d = __draw.board.ctx.getImageData(x, y, w, h).data, s = new Set();
    for (let i = 0; i < d.length; i += 4) s.add(d[i] + "," + d[i + 1] + "," + d[i + 2]);
    return s.size;
  }, [x, y, w, h]);
  await fillWith(300, 500, { kind: "glitter" }, "#1e88e5");
  check("亮粉：同一塊裡有很多深淺不同的點", await colorsIn(280, 480, 40, 40) > 30, `${await colorsIn(280, 480, 40, 40)} 色`);
  const ga = await p.evaluate(() => __draw.board.gctx.getImageData(300, 500, 1, 1).data[3]);
  check("亮粉：遮罩記下這一塊", ga > 0, `alpha=${ga}`);
  for (const pat of ["star", "heart", "dot", "stripe", "snow"]) {
    await fillWith(1550, 1100, { kind: "pattern", pattern: pat }, "#fdd835");
    check(`圖樣 ${pat}：有底色也有圖案`, await colorsIn(1420, 970, 260, 260) >= 2);
  }
  await fillWith(1550, 1100, { kind: "solid" }, "#43a047");
  check("改填純色 → 該塊只剩一個顏色", await colorsIn(1440, 990, 220, 220) === 1);
  await fillWith(300, 500, { kind: "solid" }, "#43a047");
  const ga2 = await p.evaluate(() => __draw.board.gctx.getImageData(300, 500, 1, 1).data[3]);
  check("亮粉被純色蓋掉 → 遮罩也清掉", ga2 === 0, `alpha=${ga2}`);
  await p.screenshot({ path: path.join(OUT, "02-materials.png") });

  // Task 5：筆畫
  const stroke = (pts, o) => p.evaluate(([pts, o]) => {
    const P = __draw.painter;
    P.strokeStart(pts[0][0], pts[0][1], o);
    for (const [x, y] of pts.slice(1)) P.strokeMove(x, y);
    P.strokeEnd();
  }, [pts, o]);
  const pen = { size: 20, mat: { kind: "solid" }, color: "#8e24aa" };
  await p.evaluate(() => __draw.painter.clearAll());
  await stroke([[1450, 500], [1200, 500], [1000, 500]], { ...pen, brush: "marker", clip: true });
  check("不出線：長方形裡有畫到", await px(1300, 500) === "142,36,170", await px(1300, 500));
  check("不出線：長方形外的背景沒畫到", await px(1050, 500) === "255,255,255");
  check("畫完即時層清乾淨", await p.evaluate(() => __draw.board.lctx.getImageData(1300, 500, 1, 1).data[3]) === 0);
  await stroke([[1450, 650], [1000, 650]], { ...pen, brush: "marker", clip: false });
  check("關掉不出線：可以畫到背景", await px(1050, 650) === "142,36,170");
  const h0 = await p.evaluate(() => __draw.painter.history.size);
  await stroke([[1300, 500], [1310, 500]], { ...pen, size: 30, brush: "eraser", clip: true });
  check("橡皮擦擦回白色", await px(1305, 500) === "255,255,255");
  check("一筆記一步復原", await p.evaluate(() => __draw.painter.history.size) === h0 + 1);
  await p.evaluate(() => __draw.painter.undo());
  check("復原橡皮擦 → 顏色回來", await px(1305, 500) === "142,36,170");
  await stroke([[400, 1350], [900, 1350]], { ...pen, brush: "crayon", clip: true });
  check("蠟筆有顆粒（深淺不一）", await colorsIn(400, 1330, 500, 40) >= 3);
  await stroke([[100, 100], [500, 100], [1000, 100]], { ...pen, brush: "rainbow", clip: false });
  const c1 = await px(150, 100), c2 = await px(950, 100);
  check("彩虹筆頭尾顏色不同", c1 !== c2 && c1 !== "255,255,255" && c2 !== "255,255,255", `${c1} / ${c2}`);
  await p.evaluate(() => __draw.painter.clearAll());
  check("清空 → 全白", await px(1050, 650) === "255,255,255" && await px(150, 100) === "255,255,255");
  await p.evaluate(() => __draw.painter.undo());
  check("清空也能復原", await px(1050, 650) === "142,36,170");
  await p.screenshot({ path: path.join(OUT, "03-strokes.png") });

  // Task 6：貼紙
  const st = await p.evaluate(async () => {
    const M = await import("./js/draw-stickers.js?v=1");
    const ids = M.STICKERS.map(s => s.id);
    const img = await M.stickerImage("star");
    __draw.painter.sticker(img, 1000, 1200, 200);
    return { n: ids.length, uniq: new Set(ids).size };
  });
  check("12 種貼紙、編號不重複", st.n === 12 && st.uniq === 12, JSON.stringify(st));
  check("蓋上星星貼紙", await px(1000, 1200) !== "255,255,255", await px(1000, 1200));
  await p.evaluate(() => __draw.painter.undo());
  check("貼紙可以復原", await px(1000, 1200) === "255,255,255");

  // Task 7：特效
  await p.evaluate(async () => {
    const M = await import("./js/draw-fx.js?v=1");
    window.__fx = __draw.fx || new M.Fx(__draw.board);   // Task 9 之後用遊戲自己的那一個，免得兩組亮粉互相干擾
    __draw.painter.clearAll();
  });
  const fxAlpha = (x, y, w, h) => p.evaluate(([x, y, w, h]) => {
    const d = __draw.board.fctx.getImageData(x, y, w, h).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  }, [x, y, w, h]);
  await p.evaluate(() => { const P = __draw.painter; __fx.ripple(P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#fb8c00"), 1450, 500); });
  await p.waitForTimeout(120);
  check("水波進行中：顏色層還沒變", await px(1780, 730) === "255,255,255");
  check("水波進行中：特效層有東西", await fxAlpha(1110, 260, 680, 480) > 0);
  await p.waitForTimeout(600);
  check("水波結束：整塊填好（連最遠的角落）", await px(1780, 730) === "251,140,0", await px(1780, 730));
  check("水波結束：特效層清乾淨", await fxAlpha(1110, 260, 680, 480) === 0);
  await p.evaluate(() => { const P = __draw.painter; __fx.ripple(P.fill(P.regionAt(1550, 1100), { kind: "solid" }, "#00897b"), 1550, 1100); __fx.flush(); });
  check("動畫中又有新動作 → 立刻完成", await px(1550, 1100) === "0,137,123");

  await p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(300, 500), { kind: "glitter" }, "#e91e63").done(); __fx.sparkleStart(); });
  await p.waitForTimeout(1600);
  check("亮粉會閃", await fxAlpha(200, 200, 300, 600) > 0);
  await p.evaluate(() => __fx.sparkleStop());
  check("停止閃爍後清乾淨", await fxAlpha(200, 200, 300, 600) === 0);

  const fin = p.evaluate(() => __fx.finish([
    { type: "spin", at: [[1550, 1100]] },
    { type: "blink", at: [[1450, 500]] },
    { type: "wag", at: [[700, 500]], pivot: [500, 800], deg: 15 },
  ]).then(() => "ok"));
  await p.waitForTimeout(900);
  check("完成動畫播放中有疊在畫面上", await p.evaluate(() => !!document.querySelector(".finish-ov")));
  await p.screenshot({ path: path.join(OUT, "04-finish.png") });
  check("完成動畫 3 秒內播完", await Promise.race([fin, new Promise(r => setTimeout(() => r("timeout"), 3000))]) === "ok");
  check("播完把疊加層拿掉", await p.evaluate(() => !document.querySelector(".finish-ov")));

  // 審查修正
  // 起筆在長方形左邊框黑線中央：只能塗到其中一邊，不能兩邊都塗
  await p.evaluate(() => __draw.painter.clearAll());
  await stroke([[1100, 500], [1300, 500], [900, 500]], { ...pen, brush: "marker", clip: true });
  const inside = await px(1250, 500) !== "255,255,255", outside = await px(950, 500) !== "255,255,255";
  check("起筆在線上：只塗到一邊", inside !== outside, `裡面=${inside} 外面=${outside}`);
  // 不出線開著，起筆處找不到任何一塊 → 這一筆不畫（線稿角落沒有可塗的塊時用極小半徑不可行，改直接驗 st 為 null）
  const noRegion = await p.evaluate(() => {
    const P = __draw.painter, W = __draw.board.W;
    const orig = P.regionAt; P.regionAt = () => -1;
    P.strokeStart(500, 500, { brush: "marker", size: 20, mat: { kind: "solid" }, color: "#000", clip: true });
    const st = P.st; P.strokeMove(600, 500); P.strokeEnd(); P.regionAt = orig;
    return { st, lAlpha: __draw.board.lctx.getImageData(550, 500, 1, 1).data[3], W };
  });
  check("不出線但找不到任何一塊 → 不畫", noRegion.st === null && noRegion.lAlpha === 0 && await px(550, 500) === "255,255,255");
  // 上一筆沒放開就又起筆：舊的那筆先收掉（記一步復原）
  const hs = await p.evaluate(() => {
    const P = __draw.painter, o = { brush: "marker", size: 10, mat: { kind: "solid" }, color: "#123456", clip: false }, h0 = P.history.size;
    P.strokeStart(100, 1400, o); P.strokeMove(200, 1400);
    P.strokeStart(100, 1450, o); P.strokeMove(200, 1450); P.strokeEnd();
    return P.history.size - h0;
  });
  check("沒放開又起筆 → 前一筆被收掉（共 2 步）", hs === 2, `多了 ${hs} 步`);
  // done() 連叫兩次只生效一次
  const dn = await p.evaluate(() => {
    const P = __draw.painter, h0 = P.history.size, f = P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#00bcd4");
    f.done(); f.done();
    return P.history.size - h0;
  });
  check("done() 連叫兩次 → 復原只多 1 步", dn === 1, `多了 ${dn} 步`);
  // 復原記憶體上限：背景連換 35 色
  const mem = await p.evaluate(() => {
    const P = __draw.painter;
    for (let i = 0; i < 35; i++) { const f = P.fill(P.regionAt(50, 50), { kind: "solid" }, "#" + (16 + i * 7).toString(16).padStart(2, "0") + "20a0"); f.done(); }
    const bytes = P.history.bytes, size = P.history.size, ok = P.undo();
    return { bytes, size, ok };
  });
  check("復原記憶體 ≤ 120MB 且還能復原", mem.bytes <= 120e6 && mem.size < 35 && mem.ok, `bytes=${mem.bytes} size=${mem.size}`);
  // 載入競態：慢的舊請求不能蓋掉新的
  const race = await p.evaluate(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768"><rect width="1024" height="768" fill="#fff"/><rect x="100" y="100" width="300" height="300" fill="none" stroke="#000" stroke-width="12"/></svg>';
    const B = __draw.board;
    const a = B.load("IMAGE/draw/lineart/test-shapes.svg"), b = B.load("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
    const [ra, rb] = await Promise.all([a, b]);
    return { ra, rb, W: B.W };
  });
  check("兩次 load 連續呼叫：以後呼叫的為準", race.W === 1024 && race.ra === false && race.rb === true, JSON.stringify(race));
  await p.evaluate(async () => { await __draw.board.load("IMAGE/draw/lineart/test-shapes.svg"); __draw.painter.reset(); });
  check("換回測試線稿", await p.evaluate(() => __draw.board.W) === 2048);

  // ── 後續 task 的測試插在這一行上面 ──
  check("沒有頁面錯誤", errs.length === 0, errs.join(" | "));
  await browser.close();
  console.log(results.join("\n"));
  const fail = results.filter(r => r.startsWith("❌")).length;
  console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
  process.exit(fail ? 1 : 0);
})();
