// 線稿檢查：數塊數、找碎塊，輸出「每塊隨機上色」預覽圖給人眼找漏縫（兩塊同色連成一片 = 中間的線沒封好）
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1（在 GAME DIY 根目錄）
// 用法：node tools/draw-test/lineart-check.js                          → 檢查 index.json 裡全部正式線稿
//       node tools/draw-test/lineart-check.js <線稿路徑> <1|2> [--fix]   → 只檢查一張（1 簡單、2 困難）；--fix 會改寫原檔
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
function findShell() {
  const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const d = fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop();
  return path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
}
const ROOT_URL = "http://127.0.0.1:8765/";
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(process.env.TEMP, "draw-lineart-check");
const RANGE = { 1: [8, 15], 2: [30, 60] };   // 規格：簡單約 8～15 塊、困難約 30～60 塊
const TINY = 400;                              // 小於 400 像素（約 20×20）的塊，小孩手指點不到
const SPECK = 50;                              // --fix 會把小於 50 像素的碎塊塗黑

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const args = process.argv.slice(2), fix = args.includes("--fix"), pos = args.filter(a => a !== "--fix");
  const list = pos[0]
    ? [{ id: path.basename(pos[0], path.extname(pos[0])), url: pos[0].replace(/\\/g, "/"), level: +(pos[1] || 1) }]
    : JSON.parse(fs.readFileSync(path.join(ROOT, "IMAGE/draw/lineart/index.json"), "utf8")).arts
        .filter(a => !a.test).map(a => ({ id: a.id, url: "IMAGE/draw/lineart/" + a.file, level: a.level }));
  const browser = await chromium.launch({ headless: true, executablePath: findShell() });
  const p = await browser.newPage();
  await p.goto(ROOT_URL + "IMAGE/draw/lineart/index.json");
  let bad = 0;
  for (const a of list) {
    const r = await p.evaluate(async ([url, fix, TINY, SPECK]) => {
      const C = await import("/js/draw-core.js?v=1");
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("讀不到 " + url)); i.src = "/" + url + "?t=" + Date.now(); });
      let W = img.naturalWidth, H = img.naturalHeight;
      if (fix) { const k = 2048 / Math.max(W, H); W = Math.round(W * k); H = Math.round(H * k); }
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.imageSmoothingQuality = "high";
      x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.drawImage(img, 0, 0, W, H);
      const src = x.getImageData(0, 0, W, H);
      let R = C.labelRegions(C.lineMask(src.data, W, H), W, H);
      let fixedPng = null;
      if (fix) {
        const small = new Set(R.boxes.map((b, i) => b.area < SPECK ? i : -1).filter(i => i >= 0));
        for (let i = 0; i < R.labels.length; i++) if (small.has(R.labels[i])) { const q = i * 4; src.data[q] = src.data[q + 1] = src.data[q + 2] = 0; src.data[q + 3] = 255; }
        x.putImageData(src, 0, 0);
        fixedPng = c.toDataURL("image/png");
        R = C.labelRegions(C.lineMask(src.data, W, H), W, H);
      }
      const cols = R.boxes.map(() => [80 + Math.random() * 175 | 0, 80 + Math.random() * 175 | 0, 80 + Math.random() * 175 | 0]);
      const out = x.createImageData(W, H);
      for (let i = 0; i < R.labels.length; i++) {
        const id = R.labels[i], q = i * 4;
        out.data[q + 3] = 255;
        if (id >= 0) { const k = cols[id]; out.data[q] = k[0]; out.data[q + 1] = k[1]; out.data[q + 2] = k[2]; }
      }
      x.putImageData(out, 0, 0);
      const areas = R.boxes.map(b => b.area);
      return { W, H, count: R.count, tiny: areas.filter(v => v < TINY).length, specks: areas.filter(v => v < SPECK).length,
        biggest: Math.max(...areas) / (W * H), preview: c.toDataURL("image/png"), fixedPng };
    }, [a.url, fix, TINY, SPECK]);
    if (r.fixedPng) fs.writeFileSync(path.join(ROOT, a.url), Buffer.from(r.fixedPng.split(",")[1], "base64"));
    const prev = path.join(OUT, a.id + "-check.png");
    fs.writeFileSync(prev, Buffer.from(r.preview.split(",")[1], "base64"));
    const [lo, hi] = RANGE[a.level] || [1, 999], issues = [];
    if (Math.max(r.W, r.H) !== 2048) issues.push(`長邊應為 2048，現在 ${r.W}×${r.H}（加 --fix）`);
    if (r.count < lo || r.count > hi) issues.push(`塊數 ${r.count} 不在 ${lo}～${hi}`);
    if (r.specks) issues.push(`${r.specks} 個小於 ${SPECK} 像素的碎塊（加 --fix）`);
    else if (r.tiny) issues.push(`${r.tiny} 個小於 ${TINY} 像素的小塊（小孩點不到，看預覽圖決定要不要補線合併）`);
    if (r.biggest > 0.85) issues.push(`最大一塊佔 ${(r.biggest * 100).toFixed(0)}%（可能漏縫連成一片）`);
    if (issues.length) bad++;
    console.log(`${issues.length ? "❌" : "✅"} ${a.id}  ${r.W}×${r.H}  ${r.count} 塊${fix ? "  已修正並寫回" : ""}\n   預覽：${prev}${issues.map(s => "\n   - " + s).join("")}`);
  }
  await browser.close();
  console.log(bad ? `\n${bad} 張有問題` : "\n全部通過（仍要用眼睛看預覽圖找漏縫）");
  process.exit(bad ? 1 : 0);
})();
