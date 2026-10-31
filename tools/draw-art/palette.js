// 魔法筆的配色表：拿 ChatGPT 上好色的參考圖（跟線稿同構圖），算出每一塊區塊的代表色，存成 IMAGE/draw/lineart/palette/<id>.json
// 區塊編號直接用遊戲自己的切塊結果（開圖後的 board.labels），保證跟執行時一致；只取離線 5 像素以上的內部像素、取中位數
// 參考圖跟線稿對不齊（線稿的線有三成以上落在參考圖的淺色處）就不產生，遊戲退回隨機配色
// 用法：本機伺服器開著（8765），node tools/draw-art/palette.js <參考圖資料夾（<id>.png）>
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = path.join(base, fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop(), "chrome-headless-shell-win64", "chrome-headless-shell.exe");
const REF = process.argv[2], OUT = path.join(__dirname, "../../IMAGE/draw/lineart/palette");
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: shell });
  const p = await (await b.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  await p.addInitScript(() => { try { localStorage.setItem("draw-hinted", "1"); } catch {} });
  await p.goto("http://127.0.0.1:8765/draw.html");
  await p.waitForFunction(() => window.__draw && document.querySelector("#arts .card"), null, { timeout: 15000 });
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "../../IMAGE/draw/lineart/index.json"), "utf8"));
  for (const a of idx.arts.filter(x => !x.test)) {
    const f = path.join(REF, a.id + ".png");
    if (!fs.existsSync(f)) { console.log(a.id, "沒有參考圖，略過"); continue; }
    const dataUrl = "data:image/png;base64," + fs.readFileSync(f).toString("base64");
    const r = await p.evaluate(async ([a, dataUrl]) => {
      if (!(await __draw.startArt(a))) return { err: "開圖失敗" };
      const B = __draw.board, W = B.W, H = B.H, L = B.labels, n = B.boxes.length;
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = dataUrl; });
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data;
      // 對齊檢查：線稿的線落在參考圖深色（附近 ±4 像素內有深色）的比例
      let lines = 0, hit = 0;
      for (let y = 4; y < H - 4; y += 3) for (let xx = 4; xx < W - 4; xx += 3) {
        if (L[y * W + xx] !== -1) continue;
        lines++;
        let dark = false;
        for (let k = -4; k <= 4 && !dark; k += 2) for (let m = -4; m <= 4 && !dark; m += 2) { const q = ((y + k) * W + xx + m) * 4; dark = d[q] + d[q + 1] + d[q + 2] < 300; }
        if (dark) hit++;
      }
      const align = hit / Math.max(1, lines);
      // 每一塊的內部像素（上下左右 5 像素都還是同一塊）取每個顏色通道的中位數（用 32 格直方圖）
      const hist = new Map();
      const R = 5;
      for (let y = R; y < H - R; y += 2) for (let xx = R; xx < W - R; xx += 2) {
        const i = y * W + xx, id = L[i];
        if (id < 0 || L[i - R] !== id || L[i + R] !== id || L[i - R * W] !== id || L[i + R * W] !== id) continue;
        let h = hist.get(id);
        if (!h) { h = { n: 0, r: new Uint32Array(64), g: new Uint32Array(64), b: new Uint32Array(64) }; hist.set(id, h); }
        h.n++; h.r[d[i * 4] >> 2]++; h.g[d[i * 4 + 1] >> 2]++; h.b[d[i * 4 + 2] >> 2]++;
      }
      const med = (arr, n) => { let s = 0; for (let k = 0; k < 64; k++) { s += arr[k]; if (s >= n / 2) return k * 4 + 2; } return 255; };
      const hex = v => v.toString(16).padStart(2, "0");
      const pal = Array.from({ length: n }, (_, id) => {
        const h = hist.get(id);
        if (!h || h.n < 12) return null;   // 太小的碎塊：遊戲用鄰近的隨機配色
        return "#" + hex(med(h.r, h.n)) + hex(med(h.g, h.n)) + hex(med(h.b, h.n));
      });
      c.width = c.height = 0;
      return { align, n, filled: pal.filter(Boolean).length, pal };
    }, [a, dataUrl]);
    if (r.err) { console.log(a.id, r.err); continue; }
    const ok = r.align >= 0.7;
    console.log(`${a.id} 對齊 ${(r.align * 100).toFixed(1)}%  區塊 ${r.n}  有顏色 ${r.filled}  ${ok ? "✅" : "❌ 對不齊，不產生"}`);
    const out = path.join(OUT, a.id + ".json");
    if (ok) fs.writeFileSync(out, JSON.stringify({ v: 1, n: r.n, c: r.pal })); else if (fs.existsSync(out)) fs.unlinkSync(out);
  }
  await b.close();
})();
