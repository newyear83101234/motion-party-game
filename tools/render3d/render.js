// 3D 渲染工作站驅動：開 headless Chromium 拍 studio.html 的每個 job → post.py 裁邊/縮圖/轉 webp
// 用法：node tools/render3d/render.js [job1,job2,...] [--out <資料夾>]
//   不帶 job ＝ 全部；同 group 的 job、卡背用到的圖示會自動一起拍
//   --out 預設 IMAGE/zhuyin（覆蓋遊戲用圖）；試角度時可指到別的資料夾
const path = require("path"), fs = require("fs"), os = require("os"), http = require("http");
const { spawn, spawnSync } = require("child_process");
const { launch } = require("../zy-test/lib");

const ROOT = path.resolve(__dirname, "../..");
const BASE = process.env.R3D_URL || "http://127.0.0.1:8765";
const RAW = path.join(os.tmpdir(), "render3d_raw");
const ci = process.argv.indexOf("--cfg");   // 試角度用的別份 job 檔（相對 tools/render3d/）
const CFG = ci >= 0 ? process.argv[ci + 1] : "jobs.json";
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, CFG), "utf8"));

const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const OUT = oi >= 0 ? path.resolve(args[oi + 1]) : path.join(ROOT, "IMAGE", "zhuyin");
const skip = new Set([oi + 1, args.indexOf("--cfg") + 1].filter(i => i > 0));
const pick = args.filter((a, i) => !a.startsWith("--") && !skip.has(i)).join(",").split(",").filter(Boolean);

// 要拍的清單：補上同 group 的 job 與卡背圖示
const all = Object.keys(cfg.jobs);
for (const n of pick) if (!cfg.jobs[n]) { console.error("沒有這個 job：" + n); process.exit(1); }
const want = new Set(pick.length ? pick : all);
for (const n of [...want]) {
  const j = cfg.jobs[n];
  if (j.group) for (const m of all) if (cfg.jobs[m].group === j.group) want.add(m);
  if (j.kind === "card") want.add(j.icon);
}
const shots = [...want].filter(n => cfg.jobs[n].kind !== "card");

function ping() { return new Promise(r => http.get(BASE + "/tools/render3d/jobs.json", res => { res.resume(); r(res.statusCode === 200); }).on("error", () => r(false))); }
async function ensureServer() {
  if (await ping()) return;
  console.log("本機伺服器沒開 → 背景啟動 python -m http.server 8765");
  spawn("python", ["-m", "http.server", "8765"], { cwd: ROOT, detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 300)); if (await ping()) return; }
  throw new Error("伺服器起不來：" + BASE);
}

(async () => {
  await ensureServer();
  fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  for (const n of shots) {
    const t0 = Date.now();
    await page.goto(`${BASE}/tools/render3d/studio.html?job=${encodeURIComponent(n)}&cfg=${encodeURIComponent(CFG)}`);
    await page.waitForFunction(() => window.__done || window.__error, null, { timeout: 90000 });
    const bad = await page.evaluate(() => window.__error);
    if (bad) throw new Error(`${n}：${bad}`);
    const info = await page.evaluate(() => window.__info);
    if (info.w > 1600 || info.h > 1600) await page.setViewportSize({ width: Math.max(1600, info.w), height: Math.max(1600, info.h) });
    await page.screenshot({ path: path.join(RAW, n + ".png"), omitBackground: true, clip: { x: 0, y: 0, width: info.w, height: info.h } });
    console.log(`拍好 ${n}  ${info.w}×${info.h}  ${Date.now() - t0}ms`);
  }
  await browser.close();
  if (errs.length) console.log("頁面錯誤：\n" + errs.join("\n"));

  // 後製（合併預設值後交給 Python）
  const D = cfg.defaults;
  const jobs = [...want].map(n => ({ name: n, size: D.size, pad: D.pad, ...cfg.jobs[n], parts: undefined }));
  const man = path.join(RAW, "manifest.json");
  fs.writeFileSync(man, JSON.stringify({ raw: RAW, out: OUT, jobs }, null, 1), "utf8");
  const r = spawnSync("python", [path.join(__dirname, "post.py"), man], { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  process.exit(r.status || 0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
