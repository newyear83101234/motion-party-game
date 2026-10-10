// 3D 背景工作站驅動：拍 bg.html 的每張背景（橫 1600×900＋直 900×1600）→ post_bg.py 縮圖、降一點飽和、轉 webp（≤150KB）
// 用法：node tools/render3d/render_bg.js [pond,shop,...] [--o L|P] [--out 資料夾]
//   不帶名稱＝全部；map＝直接拍真的 3D 選單小島（藏起浮標與按鈕）
//   輸出 IMAGE/zhuyin/bg_<名稱>.webp（橫）與 bg_<名稱>_p.webp（直）
const path = require("path"), fs = require("fs"), os = require("os"), http = require("http");
const { spawn, spawnSync } = require("child_process");
const { launch, openGame } = require("../zy-test/lib");

const ROOT = path.resolve(__dirname, "../..");
const BASE = process.env.R3D_URL || "http://127.0.0.1:8765";
const RAW = path.join(os.tmpdir(), "render3d_bg_raw");
const ALL = ["pond", "shop", "blocks", "park", "table", "sky", "garden", "frog", "map", "album"];
// 各張後製：sat＝飽和度倍率、lift＝往白色混的比例（背景是襯底，比前景淡一點）
const SOFT = { default: { sat: 0.86, lift: 0.07 }, sky: { sat: 0.9, lift: 0.04 }, map: { sat: 0.9, lift: 0.05 } };

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const skip = new Set(["--o", "--out"].map(k => args.indexOf(k) + 1).filter(i => i > 0));
const names = args.filter((a, i) => !a.startsWith("--") && !skip.has(i)).join(",").split(",").filter(Boolean);
const OUT = opt("--out") ? path.resolve(opt("--out")) : path.join(ROOT, "IMAGE", "zhuyin");
const ORIS = opt("--o") ? [opt("--o")] : ["L", "P"];
for (const n of names) if (!ALL.includes(n)) { console.error("沒有這個背景：" + n); process.exit(1); }
const list = names.length ? names : ALL;

function ping() { return new Promise(r => http.get(BASE + "/tools/render3d/bg.html", res => { res.resume(); r(res.statusCode === 200); }).on("error", () => r(false))); }
async function ensureServer() {
  if (await ping()) return;
  console.log("本機伺服器沒開 → 背景啟動 python -m http.server 8765");
  spawn("python", ["-m", "http.server", "8765"], { cwd: ROOT, detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 300)); if (await ping()) return; }
  throw new Error("伺服器起不來：" + BASE);
}

// 選單小島：開真的遊戲、全部解鎖、藏起浮標與介面、重新擺鏡頭後截圖
async function shootMap(browser, W, H, file) {
  const { ctx, p } = await openGame(browser, { w: W, h: H, stickers: 136, stars: 0, eggs: 4, query: "debug" });   // window.__hub3d 只在 ?debug 時才有
  await p.waitForFunction(() => document.body.classList.contains("hub3d") && window.__hub3d && window.__hub3d.fitOk !== undefined, null, { timeout: 30000 });
  await p.addStyleTag({ content: "#menu > h1, #menu > .resume, #menu > .menu-bottom, #guide, .round-btn, #playerBtn, #settingsBtn, .toast { display: none !important; }" });
  await p.evaluate(() => { window.__hub3d.tags(false); dispatchEvent(new Event("resize")); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: file });
  await ctx.close();
}

(async () => {
  await ensureServer();
  fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch(), jobs = [];
  for (const n of list) for (const o of ORIS) {
    const [W, H] = o === "L" ? [1600, 900] : [900, 1600], raw = path.join(RAW, `${n}_${o}.png`), t0 = Date.now();
    if (n === "map") await shootMap(browser, o === "P" ? 1150 : W, H, raw);   // 直式：拍寬一點再裁中間，小島才不會太小
    else {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
      const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
      await page.goto(`${BASE}/tools/render3d/bg.html?bg=${n}&o=${o}`);
      await page.waitForFunction(() => window.__done || window.__error, null, { timeout: 120000 });
      const bad = await page.evaluate(() => window.__error);
      if (bad || errs.length) throw new Error(`${n} ${o}：${bad || errs.join(" / ")}`);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));   // 等畫面真的合成出來再截（偶爾會截到空白）
      await page.screenshot({ path: raw });
      await ctx.close();
    }
    console.log(`拍好 ${n} ${o}  ${Date.now() - t0}ms`);
    jobs.push({ raw, out: path.join(OUT, `bg_${n}${o === "P" ? "_p" : ""}.webp`), w: W, h: H, ...(SOFT[n] || SOFT.default) });
  }
  await browser.close();
  const man = path.join(RAW, "manifest.json");
  fs.writeFileSync(man, JSON.stringify(jobs), "utf8");
  const r = spawnSync("python", [path.join(__dirname, "post_bg.py"), man], { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  process.exit(r.status || 0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
