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
// 中途當掉（例如等不到元素逾時）也要把已經跑完的結果印出來，才知道壞在哪一步
const crashed = e => { console.log(results.join(String.fromCharCode(10))); console.log("💥 測試中途當掉：" + String((e && e.message) || e).split(String.fromCharCode(10))[0]); process.exit(1); };
process.on("uncaughtException", crashed);
process.on("unhandledRejection", crashed);

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
  await p.evaluate(() => { __draw.AUTO.ms = 1e9; });   // 自動存檔先關掉，免得測試途中偷偷多存作品；後面專門測
  const n = await p.evaluate(() => __draw.board.boxes.length);
  check("測試線稿切出 6 塊", n === 6, `count=${n}`);
  check("沒有油漆桶：工具列沒有填色桶、一開始就是畫筆", await p.locator('[data-tool="fill"]').count() === 0 && await p.evaluate(() => __draw.S.tool) === "brush");
  await p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#e53935").done(); });   // 填色只留給回放舊紀錄
  check("填色（回放用）：長方形填成紅色", await px(1450, 500) === "229,57,53", await px(1450, 500));
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
    const M = await import("./js/draw-stickers.js?v=8");
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
    const M = await import("./js/draw-fx.js?v=8");
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
    const G = await import("./js/draw-gallery.js?v=8");
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
  check("畫筆已經選好：點一下畫筆鈕就打開選單", await on("#pop"));
  await p.tap('[data-tool="brush"]');   // 再點一次收起選單，免得下面的觸控第一下只是在關選單
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
  check("放大時畫布角落出現「縮回」鈕", await p.evaluate(() => getComputedStyle(document.querySelector("#bZoom")).display !== "none"));
  check("縮放前那一筆被取消", await px(800, 700) === "255,255,255");
  for (let i = 0; i < 2; i++) { await touch("touchStart", [[C1.x, C1.y, 1], [C2.x, C2.y, 2]]); await touch("touchEnd", []); await p.waitForTimeout(120); }
  check("兩指點兩下 → 回到原本大小", await view() === 1);
  check("回到原本大小：縮回鈕收起來", await p.evaluate(() => getComputedStyle(document.querySelector("#bZoom")).display === "none"));
  // 只放大一點點（不到 1.15 倍）→ 放開就彈回原大小；放大很多 → 按縮回鈕回原大小
  await touch("touchStart", [[C1.x, C1.y, 1], [C2.x, C2.y, 2]]);
  await touch("touchMove", [[C1.x - 4, C1.y, 1], [C2.x + 4, C2.y, 2]]);   // 兩指本來只隔約 100 像素，各張開 4 像素≈1.08 倍
  await touch("touchEnd", []);
  check("只放大一點點：放開就彈回原大小", await view() === 1, `s=${await view()}`);
  await touch("touchStart", [[C1.x, C1.y, 1], [C2.x, C2.y, 2]]);
  await touch("touchMove", [[C1.x - 150, C1.y, 1], [C2.x + 150, C2.y, 2]]);
  await touch("touchEnd", []);
  await p.tap("#bZoom");
  check("按縮回鈕：回到原本大小", await view() === 1, `s=${await view()}`);

  await p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#e53935").done(); });
  const cb = await p.locator("#bClear").boundingBox(), cc = [cb.x + cb.width / 2, cb.y + cb.height / 2, 9];
  await touch("touchStart", [cc]); await p.waitForTimeout(300); await touch("touchEnd", []);
  check("清空按一下不會清", await px(1450, 500) === "229,57,53");
  await touch("touchStart", [cc]); await p.waitForTimeout(1200); await touch("touchEnd", []);
  check("清空要按住 1 秒才會清", await px(1450, 500) === "255,255,255");

  await p.tap("#bColor");
  check("顏色選單 30 色（含膚色）", await on("#pop") && await p.locator("#pop .sw").count() === 30);
  await p.tap("#pop .sw:nth-child(17)");
  await p.waitForTimeout(400);
  check("選了顏色、選單自動收起", await p.evaluate(() => __draw.S.color) === "#7e57c2" && !(await on("#pop")));
  await p.evaluate(() => Object.assign(__draw.S, { tool: "brush", brush: "magic" }));
  await p.tap("#bColor"); await p.tap("#pop .sw:nth-child(1)"); await p.waitForTimeout(400);
  check("拿魔法筆時選顏色 → 自動換成馬克筆（選了紅色就畫得出紅色）", await p.evaluate(() => __draw.S.brush === "marker" && __draw.S.color === "#e53935"));
  await p.tap("#bColor"); await p.tap("#pop .sw:nth-child(17)"); await p.waitForTimeout(400);
  await p.evaluate(() => Object.assign(__draw.S, { tool: "brush", brush: "crayon" }));
  await p.tap("#bColor");
  check("顏色選單下面有 9 種材質（含兩種漸層）", await p.locator("#pop .opt.mat").count() === 9);
  await p.tap('#pop .opt[aria-label="glitter"]');
  await p.waitForTimeout(400);
  check("選了亮粉、選單收起", await p.evaluate(() => __draw.S.mat.kind) === "glitter" && !(await on("#pop")));
  check("拿蠟筆時選材質 → 自動換成馬克筆（材質只有馬克筆畫得出來）", await p.evaluate(() => __draw.S.brush === "marker" && __draw.S.tool === "brush"));
  await p.evaluate(() => Object.assign(__draw.S, { tool: "brush", brush: "marker", clip: true }));
  const M1 = await toClient(1450, 1100), M2 = await toClient(1650, 1100);
  await touch("touchStart", [[M1.x, M1.y, 1]]); for (let i = 1; i <= 4; i++) await touch("touchMove", [[M1.x + (M2.x - M1.x) * i / 4, M1.y, 1]]); await touch("touchEnd", []);
  check("用顏色選單選的顏色和材質（亮粉馬克筆）畫一筆", await colorsIn(1440, 1080, 220, 40) > 30);

  await p.evaluate(() => __draw.G.wipe());
  await p.tap("#bDone");
  await p.waitForFunction(() => document.querySelector("#after").classList.contains("on"), null, { timeout: 8000 }).catch(() => {});
  check("按完成 → 播完動畫出現兩顆大按鈕", await on("#after"));
  check("完成的作品存進作品牆", await p.evaluate(() => __draw.G.count()) === 1);
  await p.tap("#aHome");
  check("回到首頁", await on("#home"));
  await p.tap('#arts .card[data-id="test-shapes"]');
  await p.waitForFunction(() => document.querySelector("#paint").classList.contains("on") && !__draw.S.busy && __draw.painter.history.size === 0, null, { timeout: 8000 });   // 線稿載入完（載入時會重設復原紀錄）
  await p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#8e24aa").done(); });
  await p.tap("#bHome");
  await p.waitForFunction(() => document.querySelector("#home").classList.contains("on"), null, { timeout: 8000 }).catch(() => {});
  check("沒畫完回首頁 → 自動存成未完成", await p.evaluate(() => __draw.G.count()) === 2);
  await p.waitForFunction(() => document.querySelector('#arts .card[data-id="test-shapes"].mine'), null, { timeout: 5000 }).catch(() => {});
  const mine = await p.evaluate(() => { const c = document.querySelector('#arts .card[data-id="test-shapes"]'); return c && { mine: c.classList.contains("mine"), wip: !!c.querySelector(".wip"), blob: c.querySelector("img").src.startsWith("blob:") }; });
  check("首頁卡片換成自己畫的那張、沒畫完掛 ✏️", mine && mine.mine && mine.wip && mine.blob, JSON.stringify(mine));
  await p.tap("#toGallery");
  await p.waitForFunction(() => document.querySelectorAll("#works .card:not(.blank)").length === 2, null, { timeout: 8000 }).catch(() => {});
  check("作品牆兩件，未完成的有 ✏️", await p.locator("#works .card:not(.blank)").count() === 2 && await p.locator("#works .wip").count() === 1);
  check("作品少時補空畫框，總共 6 格", await p.locator("#works .card").count() === 6 && await p.locator("#works .card.blank").count() === 4);
  await p.screenshot({ path: path.join(OUT, "05-gallery.png") });
  await p.tap("#works .card:has(.wip)");
  check("點作品 → 放大看", await on("#view"));
  await p.tap("#vEdit");
  await p.waitForFunction(() => !__draw.S.busy && __draw.S.workId && document.querySelector("#paint").classList.contains("on"), null, { timeout: 8000 }).catch(() => {});
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

  // 審查修正 2
  const TEST_ART = { id: "test-shapes", url: "IMAGE/draw/lineart/test-shapes.svg", parts: [] };
  const fresh = () => p.evaluate(a => __draw.startArt(a), TEST_ART);
  const fillRed = () => p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#00897b").done(); });
  const waitOn = (sel, ms = 8000) => p.waitForFunction(s => document.querySelector(s).classList.contains("on"), sel, { timeout: ms }).then(() => true, () => false);

  // 連按兩下 🏠 → 只存一件
  await p.evaluate(() => __draw.G.wipe());
  await fresh(); await fillRed();
  await p.evaluate(() => { const b = document.querySelector("#bHome"); b.click(); b.click(); });
  await waitOn("#home");
  await p.waitForTimeout(600);
  check("連按兩下回首頁 → 作品牆只多 1 件", await p.evaluate(() => __draw.G.count()) === 1, `count=${await p.evaluate(() => __draw.G.count())}`);

  // 存檔失敗不卡死：put 丟 QuotaExceededError，按完成 → 照常出現兩顆按鈕、busy 解除
  await p.evaluate(() => __draw.G.wipe());
  await fresh(); await fillRed();
  await p.evaluate(() => {
    window.__putOrig = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException("quota", "QuotaExceededError"); };
  });
  await p.tap("#bDone");
  const afterOk = await waitOn("#after");
  await p.evaluate(() => { IDBObjectStore.prototype.put = window.__putOrig; });
  check("存檔失敗：8 秒內仍出現完成按鈕", afterOk);
  check("存檔失敗：busy 解除、跳出沒存到提示", await p.evaluate(() => __draw.S.busy === false && document.querySelector("#toast").textContent.includes("沒存到")));
  check("存檔失敗：沒有存進作品牆", await p.evaluate(() => __draw.G.count()) === 0);
  await p.tap("#aAgain");

  // 滿 50 件：完成 → 進作品牆整理模式（不能接著畫）；🏠 回到原本那張畫
  await p.evaluate(async () => {
    await __draw.G.wipe();
    const c = document.createElement("canvas"); c.width = c.height = 8;
    const blob = await new Promise(r => c.toBlob(r));
    for (let i = 0; i < 50; i++) await __draw.G.save({ id: "f" + i, art: "test-shapes", done: true, thumb: blob });
  });
  await fresh(); await fillRed();
  await p.tap("#bDone");
  check("滿 50 件按完成 → 進作品牆", await waitOn("#gallery") && !(await on("#after")));
  await p.waitForFunction(() => document.querySelectorAll("#works .card").length === 50, null, { timeout: 8000 }).catch(() => {});
  await p.tap("#works .card");
  check("整理模式：看大圖時沒有「接著畫」", await p.evaluate(() => getComputedStyle(document.querySelector("#vEdit")).display === "none"));
  await p.tap("#vClose");
  await p.tap("#gBack");
  check("整理完按 🏠 → 回到原本那張畫、顏色還在", await on("#paint") && await px(1450, 500) === "0,137,123", await px(1450, 500));
  await p.evaluate(() => __draw.G.wipe());

  // 手掌一直放著，第一指放開後再畫第二筆也要畫得出來
  await p.tap('[data-tool="brush"]');
  await fresh();
  await p.evaluate(() => { __draw.S.clip = false; __draw.S.color = "#1e88e5"; __draw.S.mat = { kind: "solid" }; });
  const P1 = await toClient(400, 200), P2 = await toClient(900, 200), Q1 = await toClient(400, 400), Q2 = await toClient(900, 400), Zp = await toClient(1500, 1300);
  await touch("touchStart", [[P1.x, P1.y, 1]]);
  await touch("touchMove", [[(P1.x + P2.x) / 2, P1.y, 1]]);
  await p.waitForTimeout(300);
  await touch("touchStart", [[(P1.x + P2.x) / 2, P1.y, 1], [Zp.x, Zp.y, 2]]);   // 手掌放上去，一直不放開
  await touch("touchMove", [[P2.x, P2.y, 1], [Zp.x, Zp.y, 2]]);
  await touch("touchEnd", [[P2.x, P2.y, 1]]);                                    // 第一指放開（CDP 的 touchEnd 列出的是「要放開的點」）
  await touch("touchStart", [[Zp.x, Zp.y, 2], [Q1.x, Q1.y, 3]]);                 // 第二筆
  await touch("touchMove", [[Zp.x, Zp.y, 2], [(Q1.x + Q2.x) / 2, Q1.y, 3]]);
  await touch("touchMove", [[Zp.x, Zp.y, 2], [Q2.x, Q2.y, 3]]);
  await touch("touchEnd", []);
  await p.waitForTimeout(100);
  check("手掌一直放著：第一筆畫出來", await px(650, 200) === "30,136,229", await px(650, 200));
  check("手掌一直放著：第二筆也畫得出來", await px(650, 400) === "30,136,229", await px(650, 400));

  // 放開事件遺失：舊的手指永遠不放開，新的觸控照樣畫得出來
  await p.evaluate(() => __draw.painter.clearAll());
  const L0 = await toClient(200, 1300);
  await p.evaluate(([x, y]) => document.querySelector("#stage").dispatchEvent(new PointerEvent("pointerdown",
    { pointerId: 99, pointerType: "touch", isPrimary: true, bubbles: true, clientX: x, clientY: y })), [L0.x, L0.y]);
  await touch("touchStart", [[P1.x, P1.y, 1]]);
  await touch("touchMove", [[(P1.x + P2.x) / 2, P1.y, 1]]);
  await touch("touchMove", [[P2.x, P2.y, 1]]);
  await touch("touchEnd", []);
  await p.waitForTimeout(100);
  check("放開事件遺失：新的一筆照樣畫得出來", await px(650, 200) === "30,136,229", await px(650, 200));
  await p.evaluate(() => __draw.board.fit());

  // 選單開著時點畫布：只關選單，不同時填色
  await p.evaluate(() => __draw.painter.clearAll());
  await p.evaluate(() => { __draw.S.tool = "brush"; });
  await p.tap("#bColor");
  const popOn = await on("#pop");
  await tapImg(300, 500);   // 畫布左邊（選單貼在右邊的顏色鈕旁，不會蓋到這裡）
  check("選單開著點畫布 → 選單關了、沒有畫到", popOn && !(await on("#pop")) && await px(300, 500) === "255,255,255", `pop=${popOn} px=${await px(300, 500)}`);

  // 放大後按完成 → 動畫播完回到原本大小
  await p.evaluate(() => __draw.board.setView({ s: 2.5, tx: 0, ty: 0 }));
  const zoomed = await view();
  await p.tap("#bDone");
  await waitOn("#after");
  check("放大後按完成 → 播完回到原本大小", zoomed > 2 && await view() === 1, `before=${zoomed} after=${await view()}`);
  await p.evaluate(() => __draw.G.wipe());
  await p.tap("#aAgain");   // 完成後右側是慶祝欄（蓋住工具列），按「繼續畫」回到工具列

  // 上線前審查修正
  // 選了蠟筆 → 筆刷鈕換成 🖍️；選了貼紙 heart → 貼紙鈕換成那張貼紙圖
  await p.tap('[data-tool="eraser"]');
  await p.tap('[data-tool="brush"]');   // 從別的工具切回畫筆不會自動開選單，要點第二下
  if (!(await on("#pop"))) await p.tap('[data-tool="brush"]');
  await p.tap('#pop .opt[aria-label="crayon"]');
  check("選了蠟筆 → 筆刷鈕換成蠟筆的預覽圖", await p.evaluate(() => { const b = document.querySelector('[data-tool="brush"]'); return b.dataset.brush === "crayon" && !!b.querySelector("canvas"); }));
  await p.tap('[data-tool="sticker"]');
  check("第一次選貼紙 → 自動打開選單", await on("#pop"));
  await p.tap('#pop .opt[aria-label="heart"]');
  const stk = await p.evaluate(async () => {
    const M = await import("./js/draw-stickers.js?v=8");
    const want = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(M.STICKERS.find(s => s.id === "heart").svg);
    const im = document.querySelector('[data-tool="sticker"] img');
    return { has: !!im, same: !!im && im.getAttribute("src") === want };
  });
  check("選了貼紙 heart → 貼紙鈕是那張貼紙圖", stk.has && stk.same, JSON.stringify(stk));
  check("工具鈕保留 aria-label", await p.evaluate(() => ["brush", "sticker"].every(t => document.querySelector(`[data-tool="${t}"]`).getAttribute("aria-label"))));
  // 畫畫頁與首頁截圖給主對話看
  await p.evaluate(() => document.querySelector("#after").classList.remove("on"));
  await p.tap('[data-tool="brush"]');
  await p.screenshot({ path: path.join(OUT, "final-paint-brush.png") });
  await p.tap('[data-tool="sticker"]');
  await p.screenshot({ path: path.join(OUT, "final-paint.png") });
  await p.evaluate(() => { __draw.show("home"); __draw.renderHome(); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, "final-home.png") });
  // 首頁卡片用縮圖（測試線稿沒有縮圖、除外）
  const srcs = await p.evaluate(() => [...document.querySelectorAll("#arts .card")].filter(c => c.dataset.id !== "test-shapes").map(c => c.querySelector("img").getAttribute("src")));
  check("首頁卡片圖片網址含 thumbs/", srcs.length > 0 && srcs.every(s => s.includes("thumbs/")), srcs.join(","));
  // 清空鈕在兩種 iPad 橫放尺寸下都要在畫面內（不用捲動）
  await p.evaluate(() => __draw.show("paint"));
  for (const [w, h] of [[1180, 820], [1133, 744]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(150);
    const bb = await p.locator("#bClear").boundingBox();
    check(`${w}x${h}：清空鈕在畫面內`, bb.y + bb.height <= h, `bottom=${Math.round(bb.y + bb.height)}`);
  }
  await p.setViewportSize({ width: 1180, height: 820 });
  // index.json 讀不到 → 跳提示、頁面沒錯誤
  {
    const p2 = await ctx.newPage(), e2 = [];
    p2.on("pageerror", e => e2.push("PAGEERR " + e.message));
    await p2.route("**/index.json*", r => r.fulfill({ status: 404, body: "no" }));
    await p2.goto(BASE);
    await p2.waitForFunction(() => document.querySelector("#toast").classList.contains("on"), null, { timeout: 5000 }).catch(() => {});
    const t = await p2.evaluate(() => ({ on: document.querySelector("#toast").classList.contains("on"), text: document.querySelector("#toast").textContent }));
    check("index.json 讀不到 → 跳出載入失敗提示、頁面沒錯誤", t.on && t.text.includes("載入失敗") && e2.length === 0, t.text + " " + e2.join("|"));
    await p2.close();
  }
  // 完成動畫的 frame 丟錯 → 5 秒內仍解除 busy 並出現完成按鈕
  await p.evaluate(() => __draw.startArt({ id: "test-shapes", url: "IMAGE/draw/lineart/test-shapes.svg", parts: [] }));
  await p.waitForFunction(() => !__draw.S.busy && document.querySelector("#paint").classList.contains("on"), null, { timeout: 8000 });
  await p.evaluate(() => {
    const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#00897b").done();
    window.__drawImgOrig = CanvasRenderingContext2D.prototype.drawImage;
    let n = 0;
    CanvasRenderingContext2D.prototype.drawImage = function (...a) {
      if (this.canvas.className === "finish-ov") throw new Error("測試：frame 出錯");   // 只在完成動畫的疊加層丟錯
      return window.__drawImgOrig.apply(this, a);
    };
  });
  await p.tap("#bDone");
  const t0 = Date.now();
  const okFx = await p.waitForFunction(() => !__draw.S.busy && !document.querySelector(".finish-ov"), null, { timeout: 5500 }).then(() => true, () => false);
  await p.evaluate(() => { CanvasRenderingContext2D.prototype.drawImage = window.__drawImgOrig; });
  check("完成動畫 frame 出錯 → 5 秒內解除 busy、疊加層移除", okFx, `${Date.now() - t0}ms`);
  await waitOn("#after");
  await p.evaluate(() => { document.querySelector("#after").classList.remove("on"); __draw.G.wipe(); });
  // 沒按滿 1 秒放開 → 紅圈閃一下
  await p.evaluate(() => { const b = document.querySelector("#bClear"); b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); });
  check("清空沒按滿就放開 → 紅圈閃一下", await p.evaluate(() => document.querySelector("#bClear").classList.contains("flash")));

  // ── 第二版：新畫筆、全螢幕、自動存檔 ──
  const inkIn = (x, y, w, h) => p.evaluate(([x, y, w, h]) => {   // 這個範圍裡有幾個像素不是白色
    const d = __draw.board.ctx.getImageData(x, y, w, h).data; let k = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 750) k++;
    return k;
  }, [x, y, w, h]);
  const liveClean = () => p.evaluate(() => { const d = __draw.board.lctx.getImageData(1000, 0, 1000, 800).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; });
  const hist = () => p.evaluate(() => __draw.painter.history.size);
  for (const b of ["watercolor", "spray", "neon", "sparkle", "pencil", "chalk", "magic"]) {
    await p.evaluate(() => __draw.painter.clearAll());
    const h1 = await hist();
    await stroke([[1130, 500], [1300, 520], [1500, 480]], { ...pen, brush: b, clip: true });   // 起筆貼著長方形左邊框
    const inside = await inkIn(1110, 400, 450, 200), outside = await inkIn(1040, 380, 48, 240);
    check(`${b}：畫得出來、不出線、即時層清乾淨、記一步復原`, inside > 200 && outside === 0 && await liveClean() && await hist() === h1 + 1, `inside=${inside} outside=${outside}`);
  }
  // 重畫範圍（REACH）夠不夠：暫存畫布有筆跡、即時層卻沒有 = 被切掉了
  const cut = await p.evaluate(() => {
    const { board: b, painter: P } = __draw, out = [];
    for (const br of ["crayon", "watercolor", "spray", "neon", "sparkle", "pencil", "chalk", "magic"]) for (const size of [10, 22, 40]) for (let t = 0; t < 3; t++) {
      P.strokeStart(400, 400, { brush: br, size, mat: { kind: "solid" }, color: "#e53935", clip: false });
      for (let i = 1; i <= 6; i++) P.strokeMove(400 + i * 40 * (i % 2 ? 1 : -0.5), 400 + i * 13);
      const L = b.lctx.getImageData(200, 200, 600, 400).data, sc = P.scratch.getContext("2d").getImageData(200, 200, 600, 400).data;
      let k = 0; for (let i = 3; i < sc.length; i += 4) if (sc[i] > 8 && L[i] <= 2) k++;
      if (k) out.push(`${br}${size}:${k}`);
      P.strokeCancel();
    }
    return out;
  });
  check("每種筆、每種粗細：即時層的筆跡沒有被切掉", cut.length === 0, cut.join(" "));
  // 魔法筆：塗到的地方＝自動配好的「答案圖」顏色，同一張圖每次一樣
  await p.evaluate(() => __draw.painter.clearAll());
  await stroke([[1200, 500], [1700, 500]], { ...pen, brush: "magic", clip: true });
  const mg = await p.evaluate(() => {
    const m = __draw.painter.magicPaint().getContext("2d").getImageData(1450, 500, 1, 1).data, c = __draw.board.ctx.getImageData(1450, 500, 1, 1).data;
    const again = __draw.painter.magicPaint() === __draw.painter.magicPaint();
    return { m: [...m].slice(0, 3).join(","), c: [...c].slice(0, 3).join(","), again };
  });
  check("魔法筆：塗到的地方變成自動配好的顏色", mg.m === mg.c && mg.c !== "255,255,255" && mg.again, JSON.stringify(mg));
  await p.evaluate(() => __draw.painter.clearAll());
  const sum = s => s.split(",").reduce((a, v) => a + +v, 0);
  await p.evaluate(() => { const P = __draw.painter; P.clearAll(); P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#1e88e5").done(); });
  await stroke([[1300, 500], [1600, 500]], { ...pen, color: "#fdd835", brush: "watercolor", clip: true });
  const wc = await px(1450, 500);
  check("水彩是半透明：黃色疊在藍色上變成混色", wc !== "30,136,229" && wc !== "253,216,53" && wc.split(",")[1] > 150, wc);
  await p.evaluate(() => __draw.painter.clearAll());
  await stroke([[1000, 100], [1500, 100]], { ...pen, brush: "neon", clip: false });
  const nc = await px(1250, 100), ne = await px(1250, 124);
  check("霓虹：中間是淺色亮芯、外圈有同色光暈", ne !== "255,255,255" && sum(nc) > sum(ne), `${nc} / ${ne}`);
  await p.evaluate(() => __draw.painter.clearAll());
  await stroke([[1000, 100], [1500, 100]], { ...pen, brush: "pencil", clip: false });
  check("鉛筆是細線：中心有畫到、離中心 12 像素就沒有", await px(1250, 100) !== "255,255,255" && await inkIn(1000, 112, 500, 20) === 0, await px(1250, 100));
  await p.evaluate(() => __draw.painter.clearAll());
  await stroke([[1000, 100], [1500, 100]], { ...pen, brush: "spray", clip: false });
  const sp = await inkIn(1200, 70, 100, 61);
  check("噴漆是點點：一條帶子裡有畫到也有空隙", sp > 300 && sp < 6100 * 0.95, `${sp}/6100`);
  await p.evaluate(() => __draw.painter.clearAll());
  await stroke([[1000, 100], [1500, 100]], { ...pen, brush: "sparkle", clip: false });
  check("星星筆：沿路有好幾種深淺", await colorsIn(1000, 60, 500, 80) >= 3, `${await colorsIn(1000, 60, 500, 80)} 色`);
  await p.evaluate(() => __draw.painter.clearAll());

  // 筆刷選單：8 種筆，每種都有用目前顏色畫的預覽
  await p.tap('[data-tool="brush"]');
  if (!(await on("#pop"))) await p.tap('[data-tool="brush"]');
  const pv = await p.evaluate(() => [...document.querySelectorAll("#pop .opt.wide")].map(b => {
    const c = b.querySelector("canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 720) k++;
    return b.getAttribute("aria-label") + ":" + k;
  }));
  check("筆刷選單 10 種筆（含魔法筆、粉筆）、每張預覽都畫得出東西", pv.length === 10 && pv.every(s => +s.split(":")[1] > 150), pv.join(" "));
  const pb = await p.locator("#pop").boundingBox();
  check("筆刷選單整個在畫面內", pb.x >= 0 && pb.y + pb.height <= 820, JSON.stringify(pb));
  await p.screenshot({ path: path.join(OUT, "07-brush-pop.png") });
  await p.tap('#pop .opt[aria-label="sparkle"]');
  await p.waitForTimeout(500);
  check("選了星星筆 → 筆刷鈕換成星星筆、選單自己收起來", await p.evaluate(() => document.querySelector('[data-tool="brush"]').dataset.brush) === "sparkle" && !(await on("#pop")));

  // 全螢幕
  const fsState = () => p.evaluate(() => ({ full: document.querySelector("#paint").classList.contains("full"), bar: getComputedStyle(document.querySelector("#bar")).display,
    mini: getComputedStyle(document.querySelector("#mini")).display, w: Math.round(document.querySelector("#stage").getBoundingClientRect().width), base: __draw.board.base }));
  const fs0 = await fsState();
  await p.tap("#bFull"); await p.waitForTimeout(400);
  const fs1 = await fsState();
  check("全螢幕：工具列收起、右邊窄條出現小按鈕、畫布變大", fs1.full && fs1.bar === "none" && fs1.mini === "flex" && fs1.w >= 1090 && fs1.base > fs0.base, JSON.stringify([fs0, fs1]));
  await p.evaluate(() => { __draw.painter.clearAll(); Object.assign(__draw.S, { brush: "marker", clip: false, color: "#1e88e5", mat: { kind: "solid" } }); });
  const F1 = await toClient(1000, 100), F2 = await toClient(1500, 100);
  await touch("touchStart", [[F1.x, F1.y, 1]]); await touch("touchMove", [[(F1.x + F2.x) / 2, F1.y, 1]]); await touch("touchMove", [[F2.x, F2.y, 1]]); await touch("touchEnd", []);
  check("全螢幕：手指畫得出來（座標對得上）", await px(1250, 100) === "30,136,229", await px(1250, 100));
  await p.tap("#mColor");
  const popB = await p.locator("#pop").boundingBox(), miniB = await p.locator("#mini").boundingBox();
  check("全螢幕：顏色選單打得開、沒蓋住右上角按鈕", await on("#pop") && await p.locator("#pop .sw").count() === 30 && popB.x + popB.width <= miniB.x, JSON.stringify([popB, miniB]));
  await p.tap("#pop .sw:nth-child(25)");   // 第一個膚色
  const dots = await p.evaluate(() => [...document.querySelectorAll("#bColor .dot, #mColor .dot")].map(d => d.style.background));
  check("選了膚色 → 兩顆顏色鈕都跟著變", await p.evaluate(() => __draw.S.color) === "#ffe0bd" && dots.length === 2 && dots.every(d => d === dots[0] && d.includes("255, 224, 189")), dots.join(" / "));
  await p.screenshot({ path: path.join(OUT, "08-fullscreen.png") });
  await p.tap("#mUndo");
  check("全螢幕：復原鈕可以用", await px(1250, 100) === "255,255,255");
  await p.tap("#mFull"); await p.waitForTimeout(400);
  const fs2 = await fsState();
  check("離開全螢幕：工具列回來、小按鈕藏起來、畫布回原本大小", !fs2.full && fs2.bar === "flex" && fs2.mini === "none" && Math.abs(fs2.base - fs0.base) < 1e-9 && await p.evaluate(() => !document.fullscreenElement), JSON.stringify(fs2));
  await p.tap("#bFull"); await p.waitForTimeout(400);
  if (await p.evaluate(() => !!document.fullscreenElement)) {
    await p.evaluate(() => document.exitFullscreen()); await p.waitForTimeout(400);
    check("用瀏覽器自己的方式離開全螢幕 → 版面也跟著回來", !(await fsState()).full);
  } else {
    check("瀏覽器不給全螢幕時照樣換成滿版版面", (await fsState()).full);
    await p.tap("#mFull");
  }
  await p.evaluate(() => __draw.setFull(true)); await p.evaluate(() => __draw.show("home"));
  check("全螢幕時離開畫畫頁 → 自動退出全螢幕", !(await fsState()).full);
  await p.evaluate(() => __draw.show("paint"));

  // 自動存檔
  await p.evaluate(() => __draw.G.wipe());
  const openTest = async () => {
    await p.evaluate(() => __draw.startArt({ id: "test-shapes", url: "IMAGE/draw/lineart/test-shapes.svg", parts: [] }));
    await p.waitForFunction(() => !__draw.S.busy && __draw.board.labels && __draw.painter.history.size === 0, null, { timeout: 8000 });
  };
  const dim = () => p.evaluate(() => document.querySelector("#bUndo").classList.contains("dim"));
  await openTest();
  check("剛開圖：復原鈕變淡（沒有可以退的）", await dim());
  await p.evaluate(() => { __draw.AUTO.ms = 400; const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#e53935").done(); });
  check("畫了一筆 → 復原鈕亮起來", !(await dim()));
  await p.waitForTimeout(1500);
  const a1 = await p.evaluate(async () => { const l = await __draw.G.list(); return { n: l.length, done: l[0]?.done, same: l[0]?.id === __draw.S.workId, toast: document.querySelector("#toast").classList.contains("on") }; });
  check("自動存檔：停手一下就悄悄存成未完成、沒跳提示", a1.n === 1 && a1.done === false && a1.same && !a1.toast, JSON.stringify(a1));
  await p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(300, 500), { kind: "solid" }, "#43a047").done(); });
  await p.waitForTimeout(1500);
  const a2 = await p.evaluate(async () => {
    const l = await __draw.G.list(), bmp = await createImageBitmap(l[0].color), c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext("2d");
    x.drawImage(bmp, 0, 0);
    return { n: l.length, px: [...x.getImageData(300, 500, 1, 1).data].slice(0, 3).join(",") };
  });
  check("再畫再自動存：還是同一件、內容是最新的", a2.n === 1 && a2.px === "67,160,71", JSON.stringify(a2));
  await p.tap("#bHome");
  check("自動存好了再按 🏠 → 回首頁、不會多存一件", await waitOn("#home") && await p.evaluate(() => __draw.G.count()) === 1);
  await p.evaluate(() => { __draw.AUTO.ms = 1e9; });
  await openTest();
  await p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#fb8c00").done(); });
  await p.evaluate(() => {   // 假裝切到別的 App
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { delete document.visibilityState; });
  check("切到別的 App → 馬上自動存", await p.evaluate(() => __draw.G.count()) === 2 && !(await p.evaluate(() => __draw.isDirty())));
  await p.evaluate(() => __draw.G.wipe());

  // ── 第三版：聲音、回放、漸層、粒子 ──
  const au = () => p.evaluate(() => __draw.A.state());
  await p.waitForFunction(() => __draw.A.state().loaded.includes("sfx:fill"), null, { timeout: 8000 }).catch(() => {});
  const s1 = await au();
  check("聲音：點過畫面後音訊已開、清單與音效載入、背景音樂在播", s1.ctx !== "none" && s1.man && s1.loaded.includes("sfx:fill") && s1.bgm, JSON.stringify(s1));
  await openTest();
  await p.evaluate(() => Object.assign(__draw.S, { tool: "brush", brush: "marker", size: 2, clip: true, mat: { kind: "gradient" }, color: "#1e88e5" }));
  const V1 = await toClient(1450, 280), V2 = await toClient(1450, 720);
  await touch("touchStart", [[V1.x, V1.y, 1]]); for (let i = 1; i <= 6; i++) await touch("touchMove", [[V1.x, V1.y + (V2.y - V1.y) * i / 6, 1]]); await touch("touchEnd", []);
  check("畫畫時筆尖冒出粒子", await p.evaluate(() => __draw.parts.list.length) > 0);
  const gTop = await px(1450, 300), gBot = await px(1450, 700);
  check("漸層材質：馬克筆上面比較亮、下面比較暗", sum(gTop) > sum(gBot) + 60, `${gTop} / ${gBot}`);
  await p.evaluate(() => { __draw.S.mat = { kind: "solid" }; __draw.S.tool = "brush"; __draw.S.brush = "rainbow"; __draw.S.size = 1; __draw.S.clip = false; });
  const R1 = await toClient(1000, 100), R2 = await toClient(1500, 100);
  await touch("touchStart", [[R1.x, R1.y, 1]]); for (let i = 1; i <= 5; i++) await touch("touchMove", [[R1.x + (R2.x - R1.x) * i / 5, R1.y, 1]]); await touch("touchEnd", []);
  await p.evaluate(() => { __draw.S.tool = "sticker"; });
  await tapImg(300, 500);
  await p.tap("#bUndo");
  const rk = await p.evaluate(() => __draw.rec().map(a => a.t).join(""));
  check("畫畫過程有記下來：一筆、一筆、貼紙、復原", rk === "ssku", rk);
  const before = [await px(1450, 500), await px(1250, 100), await p.evaluate(() => __draw.painter.history.size)];
  const rp = p.evaluate(() => __draw.replay());
  await p.waitForTimeout(250);
  const mid = await p.evaluate(() => ({ busy: __draw.S.busy, cls: document.querySelector("#paint").classList.contains("replaying"), stop: getComputedStyle(document.querySelector("#rStop")).display }));
  check("回放中：擋住操作、出現停止鈕", mid.busy && mid.cls && mid.stop === "block", JSON.stringify(mid));
  await p.waitForTimeout(400);
  check("回放中：畫布從空白開始重畫", await px(1250, 100) === "255,255,255");
  const ok = await rp;
  const after = [await px(1450, 500), await px(1250, 100), await p.evaluate(() => __draw.painter.history.size)];
  check("回放播完：畫回原本的樣子、復原紀錄沒被動到、可以再操作", ok === true && JSON.stringify(before) === JSON.stringify(after) && !(await p.evaluate(() => __draw.S.busy)), JSON.stringify([before, after]));
  const rp2 = p.evaluate(() => __draw.replay());
  await p.waitForTimeout(300);
  await p.tap("#rStop");
  const t1 = Date.now(); await rp2;
  check("按停止 → 馬上停、畫面放回原本", Date.now() - t1 < 1500 && await px(1450, 500) === before[0] && !(await p.evaluate(() => document.querySelector("#paint").classList.contains("replaying"))), `${Date.now() - t1}ms`);
  await p.evaluate(() => __draw.G.wipe());
  await p.tap("#bDone");
  await waitOn("#after", 25000);   // 有畫過的真圖會先開扭蛋（5 秒沒點自己開）
  check("完成後有 ▶️ 回放鈕", await p.evaluate(() => getComputedStyle(document.querySelector("#aPlay")).display !== "none"));
  const lg = await p.evaluate(async () => (await __draw.G.list())[0]?.log?.length);
  check("存進作品牆的作品帶著畫畫紀錄", lg === 4, String(lg));
  await p.evaluate(() => document.querySelector("#after").classList.remove("on"));
  await p.evaluate(() => { __draw.show("home"); __draw.renderHome(); });
  await p.tap("#tSet");   // 設定收在齒輪裡
  await p.tap("#tMusic");
  const m1 = await p.evaluate(() => [document.querySelector("#tMusic").classList.contains("off"), __draw.A.musicEnabled(), JSON.parse(localStorage.getItem("draw-audio")).music]);
  await p.tap("#tMusic");
  const m2 = await p.evaluate(() => [document.querySelector("#tMusic").classList.contains("off"), __draw.A.musicEnabled()]);
  check("音樂開關：按一下關（記住）、再按一下開", JSON.stringify(m1) === "[true,false,false]" && JSON.stringify(m2) === "[false,true]", JSON.stringify([m1, m2]));
  await p.evaluate(() => { __draw.G.wipe(); __draw.show("paint"); });
  // 第一次玩的提示：沒塗過 → 開圖時出現一隻手；塗一次就消失、之後不再出現
  await p.evaluate(() => { localStorage.removeItem("draw-hinted"); Object.assign(__draw.S, { tool: "brush", brush: "marker", mat: { kind: "solid" } }); });
  await openTest(); await p.waitForTimeout(200);
  check("第一次玩：開圖時出現點擊提示", await p.locator(".tap-hint").count() === 1);
  const H1 = await toClient(1300, 500), H2 = await toClient(1600, 500);
  await touch("touchStart", [[H1.x, H1.y, 1]]); for (let i = 1; i <= 6; i++) await touch("touchMove", [[H1.x + (H2.x - H1.x) * i / 6, H1.y, 1]]); await touch("touchEnd", []);
  check("畫過一筆：提示消失並記住", await p.locator(".tap-hint").count() === 0 && await p.evaluate(() => localStorage.getItem("draw-hinted")) === "1");
  await openTest(); await p.waitForTimeout(200);
  check("之後開圖不再出現提示", await p.locator(".tap-hint").count() === 0);

  // 寧次第三版意見：工具列 9 顆、選單貼在按鈕旁、不出線移進筆刷／橡皮擦選單、完成時右側慶祝欄不擋畫
  check("工具列只剩 8 顆按鈕（沒有油漆桶）", await p.locator("#bar button").count() === 8);
  await p.tap('[data-tool="eraser"]'); await p.tap('[data-tool="eraser"]');
  const eb = await p.locator('[data-tool="eraser"]').boundingBox(), ep = await p.locator("#pop").boundingBox();
  check("橡皮擦再點一次有選單（粗細＋不出線），選單貼在按鈕旁邊", await on("#pop") && await p.locator("#pop .opt.size").count() === 3 && await p.locator("#pop .opt.clip").count() === 1
    && ep.y <= eb.y + eb.height && ep.y + ep.height >= eb.y && ep.x + ep.width <= eb.x, JSON.stringify([eb, ep]));
  const c0 = await p.evaluate(() => __draw.S.clip);
  await p.tap("#pop .opt.clip");
  check("不出線開關在選單裡切換、選單不收", await p.evaluate(() => __draw.S.clip) === !c0 && await on("#pop") && await p.evaluate(() => document.querySelector("#pop .opt.clip").classList.contains("yes")) === !c0);
  await p.tap("#pop .opt.clip");
  await p.tap('[data-tool="eraser"]');   // 收起
  await p.tap('[data-tool="brush"]');
  await p.evaluate(() => { const P = __draw.painter; P.fill(P.regionAt(1450, 500), { kind: "solid" }, "#43a047").done(); });
  await p.tap("#bDone"); await waitOn("#after");
  const ab = await p.locator("#after").boundingBox(), bb2 = await p.locator("#bar").boundingBox(), sb = await p.locator("#stage").boundingBox();
  check("完成：慶祝欄剛好蓋在工具列上、不擋到畫", Math.abs(ab.x - bb2.x) < 2 && Math.abs(ab.width - bb2.width) < 2 && ab.x >= sb.x + sb.width, JSON.stringify([ab, bb2, sb]));
  await p.screenshot({ path: path.join(OUT, "09-after-panel.png") });
  await p.tap("#aAgain"); await p.evaluate(() => __draw.G.wipe());

  // 工具列換到左邊（左手拿筆）：首頁按切換鈕 → 畫畫頁工具列在左、選單開在工具列右邊、記住設定
  await p.evaluate(() => { __draw.show("home"); __draw.renderHome(); });
  await p.tap("#tSet"); await p.tap("#tSide");
  await openTest();
  const sb3 = await p.locator("#bar").boundingBox(), st3 = await p.locator("#stage").boundingBox();
  await p.tap('[data-tool="brush"]'); if (!(await on("#pop"))) await p.tap('[data-tool="brush"]');
  const pp3 = await p.locator("#pop").boundingBox();
  check("工具列換到左邊：工具列在畫布左邊、選單開在工具列右邊、設定有記住", sb3.x < st3.x && pp3.x > sb3.x + sb3.width && await p.evaluate(() => localStorage.getItem("draw-side")) === "left", JSON.stringify([sb3, st3, pp3]));
  await p.tap('[data-tool="brush"]');
  const L1 = await toClient(1300, 500), L2 = await toClient(1600, 500);
  await p.evaluate(() => __draw.painter.clearAll());
  await touch("touchStart", [[L1.x, L1.y, 1]]); for (let i = 1; i <= 4; i++) await touch("touchMove", [[L1.x + (L2.x - L1.x) * i / 4, L1.y, 1]]); await touch("touchEnd", []);
  check("工具列在左邊時，手指畫的位置照樣對得上", await px(1450, 500) !== "255,255,255");
  await p.evaluate(() => { __draw.show("home"); __draw.renderHome(); });
  await p.tap("#tSet"); await p.tap("#tSide");
  check("再按一次換回右邊", !(await p.evaluate(() => document.querySelector("#paint").classList.contains("left"))) && await p.evaluate(() => localStorage.getItem("draw-side")) === "right");
  await p.evaluate(() => __draw.show("paint"));

  // 刮刮樂驚喜：首頁按 🎁 → 隨機一張圖上好魔法顏色、蓋刮刮膜；刮掉大部分 → 自己掉光、出現按鈕；「自己畫這張」→ 畫布清白、可以畫
  await p.evaluate(() => { __draw.show("home"); __draw.renderHome(); __draw.S.tool = "brush"; localStorage.removeItem("draw-hinted"); });   // 當成第一次玩：看提示會不會蓋在刮刮膜上
  await p.tap("#toScratch");
  await p.waitForFunction(() => __draw.SC.on, null, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(400);   // 開圖後下一格畫面才會補放提示
  const sc1 = await p.evaluate(() => ({ on: __draw.SC.on, busy: __draw.S.busy, cls: document.querySelector("#paint").classList.contains("scratching"), foil: getComputedStyle(document.querySelector("#foil")).display, hint: !!document.querySelector(".tap-hint") }));
  check("刮刮樂：開一張圖、蓋上刮刮膜、一般畫畫暫停", sc1.on && sc1.busy && sc1.cls && sc1.foil === "block", JSON.stringify(sc1));
  check("刮刮樂：第一次玩的點擊提示不會蓋在刮刮膜上", !sc1.hint);
  check("刮刮樂：膜上有來回擦的手指提示、進度星全暗", await p.locator(".foil-hint").count() === 1 && await p.locator("#scratchBar .sstar.lit").count() === 0);
  const fb = await p.locator("#foil").boundingBox();
  await p.evaluate(() => { const x = __draw.SC.ctx; x.globalCompositeOperation = "destination-out"; x.fillRect(0, 0, x.canvas.width, x.canvas.height * 0.8); });
  await touch("touchStart", [[fb.x + 30, fb.y + fb.height - 20, 1]]); await touch("touchMove", [[fb.x + fb.width - 30, fb.y + fb.height - 20, 1]]); await touch("touchEnd", []);
  await waitOn("#scratchBar", 4000);
  check("刮掉大部分：刮刮膜自己掉光、出現按鈕", await on("#scratchBar") && await p.evaluate(() => document.querySelector("#foil").classList.contains("gone")));
  check("一刮手指提示就消失、三顆進度星全亮", await p.locator(".foil-hint").count() === 0 && await p.locator("#scratchBar .sstar.lit").count() === 3);
  await p.tap("#sPaint");
  const sc2 = await p.evaluate(() => ({ on: __draw.SC.on, busy: __draw.S.busy, cls: document.querySelector("#paint").classList.contains("scratching"), white: [...__draw.board.ctx.getImageData(1000, 600, 1, 1).data].slice(0, 3).join(",") }));
  check("自己畫這張：畫布清回白色、可以照常畫", !sc2.on && !sc2.busy && !sc2.cls && sc2.white === "255,255,255", JSON.stringify(sc2));
  await p.evaluate(() => { __draw.G.wipe(); document.querySelector(".tap-hint")?.remove(); localStorage.setItem("draw-hinted", "1"); });

  // 一顆星的圖畫完：中央大章 → 慶祝欄；作品存了剪下來的角色（我的世界用）；按 🎵 把畫彈成音樂，彈完恢復
  await p.evaluate(async () => { const a = (await (await fetch("IMAGE/draw/lineart/index.json")).json()).arts.find(x => x.id === "animal-1"); await __draw.startArt(a); });
  await p.waitForFunction(() => __draw.board.labels && !__draw.S.busy, null, { timeout: 10000 });
  await p.evaluate(() => { __draw.AUTO.ms = 1e9; window.__rewards.reset(); try { localStorage.removeItem("draw-rewarded"); } catch {} const P = __draw.painter, B = __draw.board; for (let i = 0; i < B.boxes.length; i++) P.fill(i, { kind: "solid" }, __draw.COLORS[(i * 7) % 30]).done(); });
  { const A1 = await toClient(700, 300), A2 = await toClient(900, 380);   // 真的用手指畫一筆（有畫過才開扭蛋）
    await touch("touchStart", [[A1.x, A1.y, 1]]); for (let i = 1; i <= 5; i++) await touch("touchMove", [[A1.x + (A2.x - A1.x) * i / 5, A1.y + (A2.y - A1.y) * i / 5, 1]]); await touch("touchEnd", []); }
  await p.tap("#bDone");
  await p.waitForSelector(".big-cheer", { timeout: 15000 }).catch(() => {});
  check("完成：中央出現大章（吉祥物＋三顆大星星）", await p.locator(".big-cheer img").count() === 1);
  await p.waitForSelector("#gacha", { timeout: 8000 }).catch(() => {});
  check("大章之後開扭蛋（有畫過的圖）", await p.locator("#gacha").count() === 1);
  await p.waitForTimeout(1200);
  const gb = await p.locator("#gacha").boundingBox().catch(() => null);
  if (gb) await p.mouse.click(gb.x + gb.width / 2, gb.y + gb.height / 2);   // 點扭蛋打開
  await waitOn("#after", 20000);
  check("扭蛋開完：貼紙收進貼紙本、遮罩移除、出現慶祝欄", await on("#after") && await p.locator("#gacha").count() === 0 && await p.evaluate(() => __draw.rewards().count()) === 1);
  check("大章結束後收進右邊慶祝欄、大章移除", await on("#after") && await p.locator(".big-cheer").count() === 0);
  check("剪得出主角的圖：慶祝欄有「放進我的世界」鈕", await p.evaluate(() => getComputedStyle(document.querySelector("#aWorld")).display !== "none"));
  const cutW = await p.evaluate(async () => { const w = (await __draw.G.list())[0]; return w && w.cut ? { size: w.cut.size, cw: w.cw, ch: w.ch } : null; });
  check("一顆星的圖畫完：存下剪好的角色（透明 PNG、最長邊 ≤600）", cutW && cutW.size > 2000 && Math.max(cutW.cw, cutW.ch) <= 600, JSON.stringify(cutW));
  await p.tap("#aMusic");
  const mus = await p.evaluate(() => { const m = __draw.music(); return m && { cols: m.steps.length, notes: m.steps.reduce((s, c) => s + c.length, 0), busy: __draw.S.busy }; });
  check("按 🎵：畫分成 16 排彈出來、彈的時候不能畫", mus && mus.cols === 16 && mus.notes > 0 && mus.busy, JSON.stringify(mus));
  await p.waitForFunction(() => !__draw.music(), null, { timeout: 9000 }).catch(() => {});
  check("音樂彈完：光帶移除、可以繼續操作", await p.evaluate(() => !__draw.music() && !__draw.S.busy && !document.querySelector(".music-bar")));
  const wid = await p.evaluate(() => __draw.S.workId);
  await p.tap("#aWorld");
  await waitOn("#world", 8000);
  await p.waitForFunction(id => window.__world && window.__world.entries().some(e => e.id === id), wid, { timeout: 8000 }).catch(() => {});
  check("放進我的世界：打開動物世界、剛畫好的角色在裡面", await on("#world") && await p.evaluate(id => window.__world.entries().some(e => e.id === id), wid));
  await p.tap("#wHome");
  await waitOn("#home", 5000);
  check("我的世界按 🏠：回首頁", await on("#home") && !(await on("#world")));
  await p.tap("#toBook");
  await waitOn("#book", 5000);
  check("首頁按貼紙本：打開貼紙本、看得到剛拿到的貼紙", await on("#book") && await p.evaluate(() => __draw.rewards().owned().length === 1));
  await p.tap("#bookHome");
  await waitOn("#home", 5000);
  await p.evaluate(() => { __draw.G.wipe(); });

  // 鏡子魔法畫（真的接起來，不用假 deps）：首頁按 🪞 → 畫一筆 → ✔️ 存進作品牆 → 🏠 回首頁
  await p.evaluate(() => { __draw.show("home"); __draw.renderHome(); });
  await p.tap("#toMirror");
  await waitOn("#mirror", 5000);
  check("首頁按鏡子畫鈕：打開鏡子魔法畫", await on("#mirror") && !(await on("#home")));
  await p.evaluate(() => window.__mirror.drawStroke([[0.55, 0.3], [0.62, 0.4], [0.7, 0.45], [0.75, 0.38]]));
  const n0 = await p.evaluate(() => __draw.G.count());
  await p.tap("#xSave");
  await p.evaluate(async n => { for (let t = 0; t < 80 && (await __draw.G.count()) !== n + 1; t++) await new Promise(r => setTimeout(r, 100)); }, n0);   // 等存檔寫進去（最多 8 秒）
  const mw = await p.evaluate(async () => (await __draw.G.list())[0]);
  check("鏡子畫按 ✔️：存進作品牆（標成 mirror、有縮圖）", mw && mw.art === "mirror" && !!mw.thumb && mw.done, JSON.stringify({ n0, art: mw && mw.art }));
  await p.tap("#xHome");
  await waitOn("#home", 5000);
  check("鏡子畫按 🏠：回到首頁", await on("#home") && !(await on("#mirror")));
  await p.tap("#toGallery");
  await p.waitForSelector("#works .card:not(.blank)", { timeout: 5000 }).catch(() => {});
  if (await p.locator("#works .card:not(.blank)").count()) await p.tap("#works .card:not(.blank)");
  check("作品牆打開鏡子畫作品：沒有「接著畫」（沒有線稿）", await p.evaluate(() => getComputedStyle(document.querySelector("#vEdit")).display === "none"));
  // 拼圖（真的接起來）：作品牆放大看按 🧩 → 拼完 → 出現再拼一次／回首頁
  await p.tap("#vPuzzle");
  await waitOn("#puzzle", 8000);
  check("作品牆按 🧩：用這件作品開拼圖", await on("#puzzle") && !(await on("#gallery")));
  await p.waitForFunction(() => window.__puzzle && window.__puzzle.pieces().length >= 4, null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(1600);   // 開場先拼好再散開
  await p.evaluate(() => window.__puzzle.solve(window.__puzzle.pieces().length));
  await p.waitForFunction(() => { const b = document.querySelector("#pzAgain"); return b && getComputedStyle(b).display !== "none" && b.getBoundingClientRect().width > 0; }, null, { timeout: 8000 }).catch(() => {});
  check("拼完：出現「再拼一次」", await p.evaluate(() => { const b = document.querySelector("#pzAgain"); return !!b && b.getBoundingClientRect().width > 0; }));
  await p.tap("#pzHome2");
  await waitOn("#home", 5000);
  check("拼圖按 🏠：回首頁", await on("#home") && !(await on("#puzzle")));
  await p.evaluate(() => { __draw.G.wipe(); });

  // 首頁三欄：每個主題 6 張，左欄一顆星、中欄兩顆星、右欄三顆星
  await p.evaluate(() => { __draw.show("home"); __draw.renderHome("animal"); });
  await p.waitForTimeout(700);
  const cols = await p.evaluate(() => [...document.querySelectorAll("#arts .card")].filter(c => c.dataset.id !== "test-shapes").map(c => ({ col: c.style.gridColumn, x: Math.round(c.getBoundingClientRect().x / 10) * 10 })));
  const heads = await p.evaluate(() => [...document.querySelectorAll("#arts .colhead")].map(h => ({ col: h.style.gridColumn, lit: h.querySelectorAll("b.lit").length })));
  const okCols = cols.length === 6 && new Set(cols.map(c => c.x)).size === 3 && heads.length === 3 && heads.every(h => String(h.lit) === h.col);
  check("首頁三欄：6 張圖、剛好三個欄位、欄頭亮星數＝第幾欄", okCols, JSON.stringify({ cols, heads }));
  const fontOk = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('22px "Huninn"', "動物"); });
  check("粉圓字型載入成功", fontOk);
  await p.evaluate(() => __draw.show("paint"));

  // 集滿一個主題的 6 張貼紙：皇冠時刻；之後那 6 張變成我的世界的居民
  await p.evaluate(() => { window.__rewards.reset(); window.__rewards.grantNow(["puppy", "kitten", "bunny", "elephant", "lion", "panda"]); });
  const crownP = p.evaluate(() => __draw.crownMoment("animal"));
  await p.waitForTimeout(500);
  check("集滿主題：皇冠時刻出現（皇冠＋6 張貼紙繞一圈）", await p.locator(".crown-moment .cm-stk").count() === 6 && await p.locator(".crown-moment .cm-crown").count() === 1);
  await crownP;
  check("皇冠時刻結束後整個移除", await p.locator(".crown-moment").count() === 0);
  const stkN = await p.evaluate(async () => (await __draw.worldEntries("animal")).filter(e => e.id.startsWith("stk-")).length);
  check("集滿的主題：6 張貼紙變成我的世界的居民", stkN === 6, "n=" + stkN);
  await p.evaluate(() => window.__rewards.reset());

  // 變色龍躲貓貓（真的接起來）：首頁按 🔍 → 找到 3 次 → 結束鈕 → 🏠
  await p.evaluate(() => { __draw.show("home"); __draw.renderHome(); });
  await p.tap("#toSeek");
  await waitOn("#seek", 8000);
  check("首頁按 🔍：打開變色龍躲貓貓", await on("#seek") && !(await on("#home")));
  await p.waitForFunction(() => window.__seek && window.__seek.where(), null, { timeout: 15000 }).catch(() => {});
  for (let r = 0; r < 3; r++) {
    await p.waitForFunction(() => window.__seek.where() && window.__seek.state.phase === "seek", null, { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => window.__seek.find());
    await p.waitForTimeout(1900);
  }
  await p.waitForFunction(() => { const b = document.querySelector("#skAgain"); return b && b.getBoundingClientRect().width > 0; }, null, { timeout: 8000 }).catch(() => {});
  check("找到 3 次：出現再玩一次", await p.evaluate(() => { const b = document.querySelector("#skAgain"); return !!b && b.getBoundingClientRect().width > 0; }));
  await p.tap("#skHome2");
  await waitOn("#home", 5000);
  check("躲貓貓按 🏠：回首頁", await on("#home") && !(await on("#seek")));

  // 收集到的貼紙（皇冠、彩虹跟內建的同名）：選單裡不重複、選了畫得出收集版
  await p.evaluate(() => { window.__rewards.reset(); window.__rewards.grantNow(["crown", "rainbow", "puppy"]); });
  await p.evaluate(async () => { const a = (await (await fetch("IMAGE/draw/lineart/index.json")).json()).arts.find(x => x.id === "animal-1"); await __draw.startArt(a); });
  await p.waitForFunction(() => __draw.board.labels && !__draw.S.busy, null, { timeout: 10000 });
  await p.evaluate(() => { __draw.S.tool = "sticker"; });
  await p.tap('#bar [data-tool="sticker"]'); await p.waitForTimeout(400);
  const stkMenu = await p.evaluate(() => { const ids = [...document.querySelectorAll("#pop .opt")].map(b => b.getAttribute("aria-label")); return { n: ids.length, uniq: new Set(ids).size, c: ids.filter(i => i.startsWith("c:")) }; });
  check("貼紙選單：收集到的貼紙排在後面、名稱不重複（c: 開頭）", stkMenu.n === 15 && stkMenu.uniq === 15 && stkMenu.c.join() === "c:crown,c:rainbow,c:puppy", JSON.stringify(stkMenu));
  await p.tap('#pop .opt[aria-label="c:crown"]'); await p.waitForTimeout(400);
  const okImg = await p.evaluate(async () => { const s = __draw.S.sticker; const src = document.querySelector('#bar [data-tool="sticker"] img')?.src || ""; return { s, src: src.includes("stickers/crown.png") }; });
  check("選了收集的皇冠：工具鈕顯示收集版圖片", okImg.s === "c:crown" && okImg.src, JSON.stringify(okImg));
  check("所有回首頁鈕都換成同一套立體圖示", await p.evaluate(() => ["#bHome", "#wHome", "#skHome", "#pzHome", "#bookHome", "#xHome"].every(s => document.querySelector(s + " img.ico"))));
  await p.evaluate(() => { window.__rewards.reset(); __draw.S.tool = "brush"; });

  // ── 後續 task 的測試插在這一行上面 ──
  check("沒有頁面錯誤", errs.length === 0, errs.join(" | "));
  await browser.close();
  console.log(results.join("\n"));
  const fail = results.filter(r => r.startsWith("❌")).length;
  console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
  process.exit(fail ? 1 : 0);
})();
