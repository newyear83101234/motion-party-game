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

  // Task 8：作品牆
  const gal = await p.evaluate(async () => {
    const G = await import("./js/draw-gallery.js?v=1");
    await G.wipe();
    const c = __draw.board.composite();
    const w = { id: G.newId(), art: "test-shapes", done: true, thumb: await G.thumbOf(c), image: await G.toBlob(c),
      color: await G.toBlob(__draw.board.color), glit: await G.toBlob(__draw.board.glit) };
    await G.save(w);
    const back = await G.get(w.id);
    await G.save({ ...back, done: false });
    const n1 = await G.count();
    for (let i = 0; i < 49; i++) await G.save({ id: "x" + i, art: "test-shapes", done: true, thumb: back.thumb });
    let full = "";
    try { await G.save({ id: "overflow", art: "test-shapes", done: true, thumb: back.thumb }); } catch (e) { full = e.code; }
    let updateOk = true;
    try { await G.save({ ...back, done: true }); } catch { updateOk = false; }
    const newest = (await G.list())[0].id;
    await G.remove("x0");
    const n2 = await G.count();
    await G.wipe();
    return { thumb: back.thumb.size, image: back.image.size, n1, full, updateOk, isW: newest === w.id, n2 };
  });
  check("作品存得進去也讀得回來", gal.thumb > 0 && gal.image > 0, JSON.stringify(gal));
  check("同一件作品再存是覆蓋、不會多一件", gal.n1 === 1);
  check("滿 50 件時新作品存不進去", gal.full === "FULL");
  check("滿了之後還是可以更新舊作品", gal.updateOk);
  check("作品牆照時間排、最新的在前面", gal.isW);
  check("可以刪除作品", gal.n2 === 49);

  // Task 9：完整畫面與手勢（CDP 送真正的多指觸控）
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const view = () => p.evaluate(() => __draw.board.view.s);
  const on = sel => p.evaluate(s => document.querySelector(s).classList.contains("on"), sel);

  await p.tap('[data-tool="brush"]');
  await p.evaluate(() => { __draw.painter.clearAll(); __draw.S.clip = false; __draw.S.color = "#1e88e5"; __draw.S.mat = { kind: "solid" }; });
  const A = await toClient(400, 100), B = await toClient(900, 100), Z = await toClient(1500, 1300);
  await touch("touchStart", [[A.x, A.y, 1]]);
  await touch("touchMove", [[(A.x + B.x) / 2, A.y, 1]]);
  await p.waitForTimeout(300);
  await touch("touchStart", [[(A.x + B.x) / 2, A.y, 1], [Z.x, Z.y, 2]]);   // 300 毫秒後才放上來的手掌
  await touch("touchMove", [[B.x, B.y, 1], [Z.x, Z.y, 2]]);
  await touch("touchMove", [[Z.x, Z.y, 2]]);                                // 第一根手指放開
  await touch("touchEnd", []);
  check("手掌誤觸：筆畫沒被打斷", await px(650, 100) === "30,136,229" && await px(880, 100) === "30,136,229", `${await px(650, 100)} / ${await px(880, 100)}`);
  check("手掌誤觸：畫面沒有被縮放", await view() === 1);

  const C1 = await toClient(800, 700), C2 = await toClient(1000, 700);
  await touch("touchStart", [[C1.x, C1.y, 1]]);
  await touch("touchStart", [[C1.x, C1.y, 1], [C2.x, C2.y, 2]]);            // 馬上放第二根 → 縮放
  await touch("touchMove", [[C1.x - 150, C1.y, 1], [C2.x + 150, C2.y, 2]]);
  await touch("touchEnd", []);
  check("兩指張開 → 放大", await view() > 1.5, `s=${await view()}`);
  check("縮放前那一筆被取消", await px(800, 700) === "255,255,255");
  for (let i = 0; i < 2; i++) { await touch("touchStart", [[C1.x, C1.y, 1], [C2.x, C2.y, 2]]); await touch("touchEnd", []); await p.waitForTimeout(120); }
  check("兩指點兩下 → 回到原本大小", await view() === 1);

  await p.tap('[data-tool="fill"]');
  await p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#e53935").done(); });
  const cb = await p.locator("#bClear").boundingBox(), cc = [cb.x + cb.width / 2, cb.y + cb.height / 2, 9];
  await touch("touchStart", [cc]); await p.waitForTimeout(300); await touch("touchEnd", []);
  check("清空按一下不會清", await px(1450, 500) === "229,57,53");
  await touch("touchStart", [cc]); await p.waitForTimeout(1200); await touch("touchEnd", []);
  check("清空要按住 1 秒才會清", await px(1450, 500) === "255,255,255");

  await p.tap("#bColor");
  check("顏色選單 24 色", await on("#pop") && await p.locator("#pop .sw").count() === 24);
  await p.tap("#pop .sw:nth-child(17)");
  check("選了顏色、選單自動收起", await p.evaluate(() => __draw.S.color) === "#7e57c2" && !(await on("#pop")));
  await p.tap("#bMat");
  check("材質選單 7 種", await p.locator("#pop .opt").count() === 7);
  await p.tap("#pop .opt:nth-child(2)");
  check("選了亮粉", await p.evaluate(() => __draw.S.mat.kind) === "glitter");
  await tapImg(1550, 1100);
  check("用工具列選的顏色和材質填色", await colorsIn(1440, 990, 220, 220) > 30);

  await p.evaluate(() => __draw.G.wipe());
  await p.tap("#bDone");
  await p.waitForFunction(() => document.querySelector("#after").classList.contains("on"), null, { timeout: 8000 }).catch(() => {});
  check("按完成 → 播完動畫出現兩顆大按鈕", await on("#after"));
  check("完成的作品存進作品牆", await p.evaluate(() => __draw.G.count()) === 1);
  await p.tap("#aHome");
  check("回到首頁", await on("#home"));
  await p.tap('#arts .card[data-id="test-shapes"]');
  await p.waitForFunction(() => document.querySelector("#paint").classList.contains("on") && __draw.painter.history.size === 0, null, { timeout: 8000 });
  await p.waitForTimeout(600);   // 等線稿載入完（載入時會重設復原紀錄）
  await p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#8e24aa").done(); });
  await p.tap("#bHome");
  await p.waitForTimeout(500);
  check("沒畫完回首頁 → 自動存成未完成", await p.evaluate(() => __draw.G.count()) === 2);
  await p.tap("#toGallery");
  await p.waitForTimeout(300);
  check("作品牆兩件，未完成的有 ✏️", await p.locator("#works .card").count() === 2 && await p.locator("#works .wip").count() === 1);
  await p.screenshot({ path: path.join(OUT, "05-gallery.png") });
  await p.tap("#works .card:has(.wip)");
  check("點作品 → 放大看", await on("#view"));
  await p.tap("#vEdit");
  await p.waitForTimeout(800);
  check("接著畫：畫畫頁還原原本的顏色", await on("#paint") && await px(1450, 500) === "142,36,170");

  await p.setViewportSize({ width: 820, height: 1180 });
  check("平板直著拿 → 蓋上轉向提示", await p.evaluate(() => getComputedStyle(document.querySelector("#rotate")).display) === "grid");
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.screenshot({ path: path.join(OUT, "06-paint.png") });

  // 線稿載入失敗 → 退回首頁、回傳 false，不當成頁面錯誤
  const errs0 = errs.length;
  const bad = await p.evaluate(() => __draw.startArt({ id: "bad", url: "IMAGE/draw/lineart/不存在.png", parts: [] }));
  check("線稿載入失敗 → 回傳 false 並退回首頁", bad === false && await on("#home"), `bad=${bad}`);
  // 瀏覽器自己會為那張 404 圖片記一則 "Failed to load resource" 主控台錯誤，這是預期的，只放行這一則
  const i404 = errs.findIndex((e, i) => i >= errs0 && /Failed to load resource.*404/.test(e));
  if (i404 >= 0) errs.splice(i404, 1);
  await p.evaluate(() => __draw.startArt({ id: "test-shapes", url: "IMAGE/draw/lineart/test-shapes.svg", parts: [] }));

  // ── 後續 task 的測試插在這一行上面 ──
  check("沒有頁面錯誤", errs.length === 0, errs.join(" | "));
  await browser.close();
  console.log(results.join("\n"));
  const fail = results.filter(r => r.startsWith("❌")).length;
  console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
  process.exit(fail ? 1 : 0);
})();
