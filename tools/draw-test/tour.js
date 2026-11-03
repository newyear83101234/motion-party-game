// 全遊戲導覽截圖（給審查官、早上給阿葉看）：先用魔法配色畫完幾張一顆星／兩顆星的圖（存進作品牆、剪下角色），再逐一截各畫面
// 用法：本機伺服器開著（8765），node tools/draw-test/tour.js [輸出資料夾=tools/draw-test/_review/tour] [寬=1180] [高=820]
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = path.join(base, fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop(), "chrome-headless-shell-win64", "chrome-headless-shell.exe");
const OUT = process.argv[2] || path.join(__dirname, "_review/tour");
const W = +(process.argv[3] || 1180), H = +(process.argv[4] || 820);
const URL0 = process.env.DRAW_URL || "http://127.0.0.1:8765/draw.html";
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: shell, args: ["--use-angle=swiftshader", "--mute-audio"] });
  const p = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: true })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem("draw-hinted", "1"); } catch {} });
  await p.goto(URL0);
  await p.waitForFunction(() => window.__draw && document.querySelector("#arts .card") && __draw.rewards(), null, { timeout: 20000 });
  const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, n + ".png") }); console.log("📸", n); };
  // 先畫完幾張（魔法配色），存進作品牆、剪下角色
  for (const id of ["animal-1", "animal-3", "animal-5", "animal-6", "dino-1", "ocean-1"]) {
    await p.evaluate(async id => {
      const a = (await (await fetch("IMAGE/draw/lineart/index.json")).json()).arts.find(x => x.id === id);
      await __draw.startArt(a); __draw.AUTO.ms = 1e9;
      __draw.board.ctx.drawImage(__draw.painter.magicPaint(), 0, 0);
    }, id);
    await p.tap("#bDone");
    await p.waitForFunction(() => document.querySelector("#after").classList.contains("on"), null, { timeout: 30000 });
  }
  await p.evaluate(() => window.__rewards.grantNow(["puppy", "kitten", "bunny", "lion", "trex", "whale", "crown", "rainbow", "cupcake", "donut"]));
  await shot("05-after");
  await p.tap("#aMusic"); await p.waitForTimeout(2000); await shot("06-music");
  await p.waitForFunction(() => !__draw.music(), null, { timeout: 10000 });
  await p.tap("#aHome"); await p.waitForTimeout(900); await shot("01-home");
  await p.tap("#toWorld"); await p.waitForTimeout(3500); await shot("07-world-animal");
  await p.tap("#wHome"); await p.waitForTimeout(600);
  await p.tap("#toBook"); await p.waitForTimeout(1500); await shot("08-book");
  await p.tap("#bookHome"); await p.waitForTimeout(600);
  await p.tap("#toMirror"); await p.waitForTimeout(3000); await shot("09-mirror");
  await p.tap("#xHome"); await p.waitForTimeout(600);
  await p.tap("#toGallery"); await p.waitForTimeout(1000); await shot("10-gallery");
  await p.tap("#works .card:not(.blank)"); await p.waitForTimeout(600);
  await p.tap("#vPuzzle"); await p.waitForTimeout(2500); await shot("11-puzzle");
  await p.tap("#pzHome"); await p.waitForTimeout(600);
  // 開一張新圖畫一半：畫畫頁、筆刷選單、顏色選單、貼紙選單（含收集到的貼紙）
  await p.tap('#arts .card[data-id="animal-2"]');
  await p.waitForFunction(() => __draw.board.labels && !__draw.S.busy, null, { timeout: 15000 });
  await p.evaluate(() => { const P = __draw.painter, B = __draw.board, M = P.magicPaint(); __draw.AUTO.ms = 1e9; for (let i = 0; i < B.boxes.length; i += 3) P.fill(i, { kind: "solid" }, __draw.COLORS[(i * 7) % 30]).done(); });
  await shot("02-paint");
  await p.tap('#bar [data-tool="brush"]'); await p.waitForTimeout(500); await shot("03-brushes");
  await p.tap('#bar [data-tool="brush"]');
  await p.tap('#bar [data-tool="sticker"]'); await p.waitForTimeout(600); await shot("04-stickers");
  await p.tap('#bar [data-tool="sticker"]');
  await p.tap("#bHome"); await p.waitForTimeout(1200);
  await p.tap("#toScratch"); await p.waitForTimeout(1500); await shot("12-scratch");
  await p.tap("#sHome").catch(() => {}); await p.waitForTimeout(800);
  await p.tap("#toSeek"); await p.waitForTimeout(6000); await shot("14-seek");
  await p.tap("#skHome").catch(() => {}); await p.waitForTimeout(800);
  // 扭蛋：每日扭蛋機
  await p.tap("#sHome").catch(() => {}); await p.waitForTimeout(800);
  await p.evaluate(() => { __draw.show("home"); __draw.renderHome(); __draw.refreshDaily(); });
  if (await p.locator("#toDaily:not(.off)").count()) { await p.tap("#toDaily"); await p.waitForTimeout(1600); await shot("13-gacha"); }
  console.log(errs.length ? "ERR " + errs.join(" | ") : "no page errors");
  await b.close();
})();
