// 注音戰鬥陀螺：用固定字型（Noto Sans TC，OFL）把每個字畫到 64×64 離屏畫布，量出字形的原始數值
// 由 tools/tops/build_dict.py 呼叫（不用自己跑）：node tools/tops/measure_glyphs.js <字表.txt> <字型.ttf> <輸出.json>
// 量什麼（都在瀏覽器裡算，同一個 headless Chromium＋同一個字型檔＝每次結果一樣）：
//   ink    墨水比例（灰階加總 / 4096）            → 重量
//   symLR  左右對稱度、symUD 上下對稱度、cOff 重心離中心幾格 → 穩定
//   perim  輪廓像素數（墨水格旁邊有空白格）、corner 尖角數（3×3 內墨水 ≤4 格的墨水格） → 攻擊
//   hull   凸包填滿率（墨水格數 / 凸包面積）       → 防禦
const fs = require("fs"), path = require("path");
const { launch } = require("../zy-test/lib");

const [, , listPath, fontPath, outPath] = process.argv;
if (!listPath || !fontPath || !outPath) { console.error("用法：node measure_glyphs.js <字表.txt> <字型.ttf> <輸出.json>"); process.exit(2); }
const chars = [...fs.readFileSync(listPath, "utf8").trim()];
const font = fs.readFileSync(fontPath);

const PAGE = `<!doctype html><meta charset="utf-8"><body><script>
window.measure = async (chars) => {
  const ff = new FontFace("TopsFont", "url(/font.ttf)", { weight: "100 900" });
  await ff.load(); document.fonts.add(ff);
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const N = 64, a = new Float32Array(N * N), b = new Uint8Array(N * N), out = [];
  for (const ch of chars) {
    g.clearRect(0, 0, N, N);
    g.fillStyle = "#000"; g.font = "500 58px TopsFont"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(ch, 32, 32);
    const d = g.getImageData(0, 0, N, N).data;
    let sum = 0, sx = 0, sy = 0, area = 0;
    for (let i = 0; i < N * N; i++) { const v = d[i * 4 + 3] / 255; a[i] = v; sum += v; sx += v * (i % N); sy += v * ((i / N) | 0); b[i] = v >= 0.5 ? 1 : 0; area += b[i]; }
    if (sum < 1) { out.push(null); continue; }
    let dLR = 0, dUD = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = a[y * N + x]; dLR += Math.abs(v - a[y * N + (N - 1 - x)]); dUD += Math.abs(v - a[(N - 1 - y) * N + x]); }
    const cx = sx / sum, cy = sy / sum;
    let perim = 0, corner = 0; const pts = [];
    const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? 0 : b[y * N + x];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!b[y * N + x]) continue;
      if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) { perim++; pts.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]); }
      let k = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) k += at(x + i, y + j);
      if (k <= 4) corner++;
    }
    // 凸包（單調鏈）面積：用輪廓格的四個角點
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const lo = [], hi = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
    let ha = 0; for (let i = 0; i < hull.length; i++) { const p = hull[i], q = hull[(i + 1) % hull.length]; ha += p[0] * q[1] - q[0] * p[1]; }
    ha = Math.abs(ha) / 2;
    out.push([+(sum / (N * N)).toFixed(5), +(1 - dLR / (2 * sum)).toFixed(5), +(1 - dUD / (2 * sum)).toFixed(5), +Math.hypot(cx - 31.5, cy - 31.5).toFixed(4), perim, corner, +(area / Math.max(ha, 1)).toFixed(5)]);
  }
  return out;
};
</script></body>`;

(async () => {
  const browser = await launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.route("http://tops.local/**", r => {
      const u = new URL(r.request().url());
      if (u.pathname === "/font.ttf") return r.fulfill({ status: 200, contentType: "font/ttf", body: font });
      return r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE });
    });
    await page.goto("http://tops.local/index.html");
    const metrics = [];
    for (let i = 0; i < chars.length; i += 800) metrics.push(...await page.evaluate(c => window.measure(c), chars.slice(i, i + 800)));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ fields: ["ink", "symLR", "symUD", "cOff", "perim", "corner", "hull"], chars: chars.join(""), metrics }));
    console.log(`量完 ${metrics.length} 字 → ${outPath}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
