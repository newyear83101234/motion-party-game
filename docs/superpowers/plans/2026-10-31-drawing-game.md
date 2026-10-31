# 畫畫遊戲（著色）第一版 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 GAME DIY 新增 `draw.html`：iPad 橫向、全圖示的兒童著色遊戲，有填色水波、亮粉、圖樣、筆刷不出線、完成動畫（無聲）、作品牆，附 8 張原創線稿。

**Architecture:** 線稿 PNG 開圖時在瀏覽器裡切成區塊（`draw-core.js` 純邏輯，node 可測）。畫面分四層 canvas：顏色層、亮粉遮罩層（不顯示，只記哪裡有亮粉）、線稿層（白色變透明）、特效層。所有繪圖先畫在暫存畫布，再用區塊遮罩裁切後合進顏色層。復原只存被改到的長方形範圍。

**Tech Stack:** 原生 HTML／CSS／ES module（不用框架、不用打包），Canvas 2D，IndexedDB，Playwright（全域 `@playwright/mcp` 附帶的那份）＋ chrome-headless-shell 做瀏覽器測試，node 24 跑純邏輯測試。

**規格：** `docs/superpowers/specs/2026-10-31-drawing-game-design.md`

**重要規則（每個 task 都適用）：**
- commit 一律 `git add -- <具體檔名>`，**禁止** `git add -A`／`git commit -a`／`git add .`（工作資料夾有 212 個檔案被搬走，整批加入會把線上的部署設定刪掉）
- commit 訊息用中文，結尾加一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 不 push；push 由主對話在最後統一做
- 瀏覽器測試前先在 GAME DIY 根目錄開本機伺服器：`python -m http.server 8765 --bind 127.0.0.1`（背景執行）
- ES module 的語法檢查：`node --input-type=module --check < js/xxx.js`（直接 `node --check xxx.js` 抓不到模組語法錯誤）
- 含反斜線的檔案內容一律用 Write／Edit 工具寫，不用 bash heredoc

---

## 檔案地圖

| 檔案 | 責任 |
|---|---|
| `draw.html` | 頁面骨架：首頁、畫畫頁、作品牆、轉向提示四個畫面 |
| `css/draw.css` | 全部樣式 |
| `js/draw-core.js` | 純邏輯：線遮罩、區塊編號、找點到的區塊、區塊遮罩（往外擴進黑線）、矩形工具、復原堆疊 |
| `js/draw-canvas.js` | 四層畫布的建立、縮放平移、座標換算、合成輸出 |
| `js/draw-paint.js` | 材質（純色／亮粉／圖樣）、筆刷（馬克筆／蠟筆／彩虹筆）、貼紙、橡皮擦、裁切合進顏色層、復原紀錄 |
| `js/draw-fx.js` | 填色水波、亮粉閃爍、完成動畫、彩帶 |
| `js/draw-gallery.js` | IndexedDB 作品存取、50 件上限、存相簿 |
| `js/draw-stickers.js` | 12 種原創貼紙（向量圖字串）與載入快取 |
| `js/draw.js` | 流程與介面：首頁、工具列、彈出選單、手勢、作品牆畫面 |
| `IMAGE/draw/lineart/index.json` | 8 張線稿的清單與設定（主題、難度、零件動作） |
| `IMAGE/draw/lineart/*.png` | 線稿圖 |
| `IMAGE/draw/lineart/test-shapes.svg` | 開發與測試用的假線稿 |
| `tools/draw-test/core.test.mjs` | `draw-core.js` 單元測試 |
| `tools/draw-test/ui.js` | 瀏覽器整合測試（iPad 1180×820 觸控） |
| `tools/draw-test/lineart-check.js` | 線稿檢查：塊數、碎塊、每塊隨機上色預覽圖；`--fix` 放大到 2048 並塗黑碎塊 |
| `tools/draw-test/perf.js` | 效能量測：開圖切塊、填色各要多久 |

檔名比規格第 9 節分得更細：規格裡的 `draw-tools.js` 拆成 `draw-canvas.js`、`draw-paint.js`、`draw-stickers.js` 三個檔，每個檔只管一件事。

---

### Task 1：線遮罩與區塊編號（draw-core.js 第一部分）

**Files:**
- Create: `js/draw-core.js`
- Test: `tools/draw-test/core.test.mjs`

- [ ] **Step 1：寫測試**

`tools/draw-test/core.test.mjs`：

```js
// draw-core 單元測試。用法：node tools/draw-test/core.test.mjs
import * as C from "../../js/draw-core.js";

const results = [];
const check = (name, ok, info = "") => results.push((ok ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));

// 20×20 測試圖：外框黑線 + x=10 一條直線 → 裡面左右兩塊
function makeFrame() {
  const w = 20, h = 20, rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const black = (x, y) => { const p = (y * w + x) * 4; rgba[p] = rgba[p + 1] = rgba[p + 2] = 0; };
  for (let i = 0; i < 20; i++) { black(i, 0); black(i, 19); black(0, i); black(19, i); black(10, i); }
  return { w, h, rgba };
}

{
  const { w, h, rgba } = makeFrame();
  const m = C.lineMask(rgba, w, h);
  const lines = m.reduce((s, v) => s + v, 0);
  check("lineMask 數出線像素", lines === 20 * 4 - 4 + 18, `lines=${lines}`);

  const t = new Uint8ClampedArray(4 * 4 * 4); // 全透明 → 當白色，不是線
  check("透明像素不算線", C.lineMask(t, 4, 4).every(v => v === 0));

  const R = C.labelRegions(m, w, h);
  check("切出 2 塊", R.count === 2, `count=${R.count}`);
  const areas = R.boxes.map(b => b.area).sort((a, b) => a - b);
  check("兩塊面積 144 與 162", areas[0] === 144 && areas[1] === 162, areas.join(","));
  check("線像素標成 LINE", R.labels[0] === C.LINE && R.labels[10] === C.LINE);
  const left = R.labels[5 * w + 5], right = R.labels[5 * w + 15];
  check("左右兩塊編號不同", left >= 0 && right >= 0 && left !== right);
  const b = R.boxes[left];
  check("左塊外框 1..9 × 1..18", b.x0 === 1 && b.x1 === 9 && b.y0 === 1 && b.y1 === 18, JSON.stringify(b));
}

console.log(results.join("\n"));
const fail = results.filter(r => r.startsWith("❌")).length;
console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2：跑測試確認失敗**

Run: `node tools/draw-test/core.test.mjs`
Expected: 失敗，錯誤訊息含 `Cannot find module` 或 `draw-core.js`

- [ ] **Step 3：寫最少的實作**

`js/draw-core.js`：

```js
// 畫畫遊戲純邏輯：線稿切塊、區塊遮罩、矩形工具、復原堆疊（不碰畫面，node 可直接測）
export const LINE = -1;
const UNSEEN = -2;

// 線稿 RGBA → 線遮罩（1 = 線）。透明像素當白色；thr 越高，越淡的灰也算線
export function lineMask(rgba, w, h, thr = 160) {
  const m = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < m.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const lum = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114) * a + 255 * (1 - a);
    m[i] = lum < thr ? 1 : 0;
  }
  return m;
}

// 4 連通區塊編號：線 = LINE，其餘 0..count-1；boxes[id] = { x0, y0, x1, y1, area }
export function labelRegions(mask, w, h) {
  const labels = new Int32Array(w * h).fill(UNSEEN);
  const boxes = [];
  const stack = new Int32Array(w * h);
  for (let s = 0; s < labels.length; s++) {
    if (labels[s] !== UNSEEN) continue;
    if (mask[s]) { labels[s] = LINE; continue; }
    const id = boxes.length;
    const b = { x0: w, y0: h, x1: -1, y1: -1, area: 0 };
    let sp = 0;
    stack[sp++] = s; labels[s] = id;
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i - x) / w;
      b.area++;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      if (x > 0 && labels[i - 1] === UNSEEN && !mask[i - 1]) { labels[i - 1] = id; stack[sp++] = i - 1; }
      if (x < w - 1 && labels[i + 1] === UNSEEN && !mask[i + 1]) { labels[i + 1] = id; stack[sp++] = i + 1; }
      if (y > 0 && labels[i - w] === UNSEEN && !mask[i - w]) { labels[i - w] = id; stack[sp++] = i - w; }
      if (y < h - 1 && labels[i + w] === UNSEEN && !mask[i + w]) { labels[i + w] = id; stack[sp++] = i + w; }
    }
    boxes.push(b);
  }
  return { labels, count: boxes.length, boxes };
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `node tools/draw-test/core.test.mjs`
Expected: 7 行全部 ✅，最後一行「全部通過」

- [ ] **Step 5：Commit**

```bash
git add -- js/draw-core.js tools/draw-test/core.test.mjs
git commit -m "畫畫遊戲：線稿切塊核心" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2：找點到的區塊、區塊遮罩、矩形工具、復原堆疊（draw-core.js 第二部分）

**Files:**
- Modify: `js/draw-core.js`（接在檔尾）
- Modify: `tools/draw-test/core.test.mjs`（在 `console.log(results.join...` 那行之前插入）

- [ ] **Step 1：寫測試**（插在 `console.log(results.join("\n"));` 之前）

```js
{
  const { w, h, rgba } = makeFrame();
  const R = C.labelRegions(C.lineMask(rgba, w, h), w, h);
  const left = R.labels[5 * w + 5], right = R.labels[5 * w + 15];

  check("regionAt 點在塊內", C.regionAt(R.labels, w, h, 5, 5) === left);
  const onLine = C.regionAt(R.labels, w, h, 10, 5);
  check("regionAt 點在線上 → 找最近的一塊", onLine === left || onLine === right, `got ${onLine}`);
  check("regionAt 半徑 0 點在線上 → -1", C.regionAt(R.labels, w, h, 0, 0, 0) === -1);
  check("regionAt 點在圖外 → -1", C.regionAt(R.labels, w, h, -3, 5) === -1);

  const m0 = C.regionMask(R.labels, w, h, left, R.boxes[left], 0);
  check("遮罩 pad=0 只含本塊 162 點", m0.data.filter(v => v).length === 162);
  const m2 = C.regionMask(R.labels, w, h, left, R.boxes[left], 2);
  check("遮罩 pad=2 外框 0,0,12,20", m2.x === 0 && m2.y === 0 && m2.w === 12 && m2.h === 20, `${m2.x},${m2.y},${m2.w},${m2.h}`);
  check("遮罩 pad=2 擴進黑線共 220 點", m2.data.filter(v => v).length === 220, `${m2.data.filter(v => v).length}`);
  let leak = 0;
  for (let j = 0; j < m2.h; j++) for (let i = 0; i < m2.w; i++)
    if (m2.data[j * m2.w + i] && R.labels[(m2.y + j) * w + m2.x + i] === right) leak++;
  check("遮罩不會漏進隔壁塊", leak === 0, `leak=${leak}`);

  const u = C.rectUnion({ x: 0, y: 0, w: 4, h: 4 }, { x: 2, y: 3, w: 4, h: 4 });
  check("rectUnion", u.x === 0 && u.y === 0 && u.w === 6 && u.h === 7, JSON.stringify(u));
  check("rectUnion 有 null", C.rectUnion(null, { x: 1, y: 1, w: 2, h: 2 }).w === 2);
  const c = C.rectClamp({ x: -2.5, y: 3.2, w: 10, h: 100 }, 20, 20);
  check("rectClamp 裁進畫布", c.x === 0 && c.y === 3 && c.w === 8 && c.h === 17, JSON.stringify(c));
  check("rectClamp 完全在外 → null", C.rectClamp({ x: 30, y: 0, w: 5, h: 5 }, 20, 20) === null);

  const H = new C.History(30);
  for (let i = 0; i < 35; i++) H.push(i);
  check("History 最多 30 步", H.size === 30);
  check("History pop 拿到最後一步", H.pop() === 34 && H.size === 29);
  H.clear();
  check("History 清空後 pop → null", H.pop() === null);
}
```

- [ ] **Step 2：跑測試確認失敗**

Run: `node tools/draw-test/core.test.mjs`
Expected: 失敗，錯誤含 `C.regionAt is not a function`

- [ ] **Step 3：實作**（接在 `js/draw-core.js` 檔尾）

```js
// 找 (x, y) 屬於哪一塊；點在黑線上時，找半徑 r 內最近的一塊；都沒有回 -1
export function regionAt(labels, w, h, x, y, r = 6) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return -1;
  const v = labels[y * w + x];
  if (v >= 0) return v;
  let best = -1, bd = Infinity;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy, d = dx * dx + dy * dy;
    if (d >= bd || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const id = labels[ny * w + nx];
    if (id >= 0) { best = id; bd = d; }
  }
  return best;
}

// 某一塊的遮罩（255 = 可以塗），往外擴 pad 像素，但只擴進黑線、不擴進別塊 → 填色塞到線底下不留白縫
export function regionMask(labels, w, h, id, box, pad = 2) {
  const x = Math.max(0, box.x0 - pad), y = Math.max(0, box.y0 - pad);
  const rw = Math.min(w - 1, box.x1 + pad) - x + 1, rh = Math.min(h - 1, box.y1 + pad) - y + 1;
  let data = new Uint8Array(rw * rh);
  for (let j = 0; j < rh; j++) {
    const row = (y + j) * w + x;
    for (let i = 0; i < rw; i++) if (labels[row + i] === id) data[j * rw + i] = 255;
  }
  for (let k = 0; k < pad; k++) {
    const next = data.slice();
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
      const q = j * rw + i;
      if (data[q] || labels[(y + j) * w + x + i] !== LINE) continue;
      if ((i > 0 && data[q - 1]) || (i < rw - 1 && data[q + 1]) || (j > 0 && data[q - rw]) || (j < rh - 1 && data[q + rw])) next[q] = 255;
    }
    data = next;
  }
  return { x, y, w: rw, h: rh, data };
}

// 矩形 { x, y, w, h }：聯集（可傳 null）、裁進畫布並取整數（全在外回 null）
export function rectUnion(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
export function rectClamp(r, w, h) {
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.w)), y1 = Math.min(h, Math.ceil(r.y + r.h));
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}

// 復原堆疊：超過上限就丟掉最舊的
export class History {
  constructor(limit = 30) { this.limit = limit; this.items = []; }
  push(e) { this.items.push(e); if (this.items.length > this.limit) this.items.shift(); }
  pop() { return this.items.pop() ?? null; }
  clear() { this.items.length = 0; }
  get size() { return this.items.length; }
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `node tools/draw-test/core.test.mjs`
Expected: 22 行全部 ✅，「全部通過」

- [ ] **Step 5：Commit**

```bash
git add -- js/draw-core.js tools/draw-test/core.test.mjs
git commit -m "畫畫遊戲：區塊遮罩、矩形工具、復原堆疊" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3：畫布四層 + 點一下填純色 + 第一支瀏覽器測試

**Files:**
- Create: `IMAGE/draw/lineart/test-shapes.svg`、`js/draw-canvas.js`、`js/draw-paint.js`、`js/draw.js`、`draw.html`、`css/draw.css`
- Test: `tools/draw-test/ui.js`

**版號規則**：所有 `import` 與 `draw.html` 的引用都帶 `?v=1`，而且必須完全一致（`ui.js` 會檢查）。之後改任何 css/js，全部一起升版。

- [ ] **Step 1：寫測試線稿** `IMAGE/draw/lineart/test-shapes.svg`（會切出 6 塊：背景、圓左半、圓右半、長方形、三角形、小方塊）

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1536" viewBox="0 0 2048 1536">
  <rect width="2048" height="1536" fill="#fff"/>
  <g fill="none" stroke="#000" stroke-width="16" stroke-linejoin="round">
    <circle cx="500" cy="500" r="300"/>
    <line x1="500" y1="200" x2="500" y2="800"/>
    <rect x="1100" y="250" width="700" height="500"/>
    <polygon points="300,1400 700,900 1100,1400"/>
    <rect x="1400" y="950" width="300" height="300"/>
  </g>
</svg>
```

- [ ] **Step 2：寫瀏覽器測試** `tools/draw-test/ui.js`

```js
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

  // ── 後續 task 的測試插在這一行上面 ──
  check("沒有頁面錯誤", errs.length === 0, errs.join(" | "));
  await browser.close();
  console.log(results.join("\n"));
  const fail = results.filter(r => r.startsWith("❌")).length;
  console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
  process.exit(fail ? 1 : 0);
})();
```

- [ ] **Step 3：開伺服器、跑測試確認失敗**

Run（背景）：`python -m http.server 8765 --bind 127.0.0.1`
Run：`node tools/draw-test/ui.js`
Expected：失敗（`draw.html` 404，`waitForFunction` 逾時）

- [ ] **Step 4：寫 `js/draw-canvas.js`**

```js
// 畫畫遊戲畫布：開圖切塊、四層 canvas（顏色／即時筆畫／線稿／特效）＋看不見的亮粉遮罩、縮放平移、座標換算、合成輸出
import { lineMask, labelRegions } from "./draw-core.js?v=1";

export function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

export class Board {
  constructor(stage) {
    this.stage = stage;                          // 固定大小的外框（overflow: hidden）
    this.wrap = document.createElement("div");   // 被縮放平移的那一層
    this.wrap.className = "board";
    stage.appendChild(this.wrap);
    this.view = { s: 1, tx: 0, ty: 0 };
    this.base = 1;
  }

  async load(url) {
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error("線稿載入失敗：" + url));
      i.src = url;
    });
    const W = img.naturalWidth || 2048, H = img.naturalHeight || 1536;
    this.W = W; this.H = H;
    const src = makeCanvas(W, H), sx = src.getContext("2d", { willReadFrequently: true });
    sx.fillStyle = "#fff"; sx.fillRect(0, 0, W, H); sx.drawImage(img, 0, 0, W, H);
    const rgba = sx.getImageData(0, 0, W, H).data;
    this.mask = lineMask(rgba, W, H);
    const R = labelRegions(this.mask, W, H);
    this.labels = R.labels; this.boxes = R.boxes;

    // 線稿層：一律黑色，用亮度當透明度（保留抗鋸齒，白色變透明）
    const line = makeCanvas(W, H), lx = line.getContext("2d"), out = lx.createImageData(W, H), o = out.data;
    for (let p = 0; p < o.length; p += 4) o[p + 3] = 255 - (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114);
    lx.putImageData(out, 0, 0);

    this.color = makeCanvas(W, H); this.ctx = this.color.getContext("2d", { willReadFrequently: true });
    this.ctx.fillStyle = "#fff"; this.ctx.fillRect(0, 0, W, H);
    this.glit = makeCanvas(W, H); this.gctx = this.glit.getContext("2d", { willReadFrequently: true }); // 不放進畫面
    this.live = makeCanvas(W, H); this.lctx = this.live.getContext("2d");
    this.fx = makeCanvas(W, H); this.fctx = this.fx.getContext("2d");
    this.line = line;
    for (const c of [this.color, this.live, line, this.fx]) c.className = "layer";
    this.wrap.replaceChildren(this.color, this.live, line, this.fx);
    this.wrap.style.width = W + "px"; this.wrap.style.height = H + "px";
    this.fit();
  }

  fit() {
    const r = this.stage.getBoundingClientRect();
    this.base = Math.min(r.width / this.W, r.height / this.H);
    this.setView({ s: 1, tx: 0, ty: 0 });
  }
  origin(r) {
    const k = this.base * this.view.s;
    return { x: (r.width - this.W * k) / 2 + this.view.tx, y: (r.height - this.H * k) / 2 + this.view.ty, k };
  }
  // s = 放大倍率（1～4），tx/ty = 平移；放大後不能拖到露出畫布外面
  setView(v) {
    const r = this.stage.getBoundingClientRect(), s = Math.min(4, Math.max(1, v.s)), k = this.base * s;
    const cx = (r.width - this.W * k) / 2, cy = (r.height - this.H * k) / 2;
    const clampT = (t, c) => (c >= 0 ? 0 : Math.min(-c, Math.max(c, t)));
    this.view = { s, tx: clampT(v.tx, cx), ty: clampT(v.ty, cy) };
    const o = this.origin(r);
    this.wrap.style.transform = `translate(${o.x}px, ${o.y}px) scale(${k})`;
  }
  toImage(clientX, clientY) {
    const r = this.stage.getBoundingClientRect(), o = this.origin(r);
    return { x: (clientX - r.left - o.x) / o.k, y: (clientY - r.top - o.y) / o.k };
  }
  toClient(x, y) {
    const r = this.stage.getBoundingClientRect(), o = this.origin(r);
    return { x: r.left + o.x + x * o.k, y: r.top + o.y + y * o.k };
  }
  // 顏色層＋線稿層合成一張（存作品、完成動畫用）
  composite() {
    const c = makeCanvas(this.W, this.H), x = c.getContext("2d");
    x.drawImage(this.color, 0, 0); x.drawImage(this.line, 0, 0);
    return c;
  }
}
```

- [ ] **Step 5：寫 `js/draw-paint.js`**（這個 task 只有純色填色與復原；Task 4 會補材質、筆刷、貼紙、橡皮擦）

```js
// 畫畫遊戲塗色：先在暫存畫布做好、用區塊遮罩裁切後才合進顏色層；復原只存被改到的長方形範圍
import { regionMask, regionAt, rectClamp, History } from "./draw-core.js?v=1";
import { makeCanvas as mk } from "./draw-canvas.js?v=1";

export class Painter {
  constructor(board) {
    this.b = board;
    this.history = new History(30);
    this.maskCache = new Map();
    this.paintKey = ""; this.paint = null;
  }
  reset() { this.history.clear(); this.maskCache.clear(); this.paintKey = ""; this.paint = null; }

  regionAt(x, y) { const b = this.b; return regionAt(b.labels, b.W, b.H, x, y); }

  // 某一塊的遮罩畫布（不透明 = 可以塗），有快取
  maskOf(id) {
    let m = this.maskCache.get(id);
    if (m) return m;
    const b = this.b, r = regionMask(b.labels, b.W, b.H, id, b.boxes[id], 2);
    const c = mk(r.w, r.h), x = c.getContext("2d"), img = x.createImageData(r.w, r.h);
    for (let i = 0; i < r.data.length; i++) img.data[i * 4 + 3] = r.data[i];
    x.putImageData(img, 0, 0);
    m = { x: r.x, y: r.y, w: r.w, h: r.h, canvas: c };
    this.maskCache.set(id, m);
    return m;
  }

  // 目前「材質＋顏色」的整張顏料，有快取（換材質或顏色才重做）
  paintFor(mat, color) {
    const key = `${mat.kind}:${mat.pattern || ""}:${color}`;
    if (key !== this.paintKey) { this.paint = makePaint(mat, color, this.b.W, this.b.H); this.paintKey = key; }
    return this.paint;
  }

  snapshot(rect) {
    const b = this.b;
    this.history.push({ rect, color: b.ctx.getImageData(rect.x, rect.y, rect.w, rect.h), glit: b.gctx.getImageData(rect.x, rect.y, rect.w, rect.h) });
  }
  undo() {
    const e = this.history.pop();
    if (!e) return false;
    this.b.ctx.putImageData(e.color, e.rect.x, e.rect.y);
    this.b.gctx.putImageData(e.glit, e.rect.x, e.rect.y);
    return true;
  }

  // 把一張已裁好的圖合進顏色層；亮粉遮罩跟著更新（亮粉 → 加進遮罩，其他 → 從遮罩挖掉）
  commit(canvas, x, y, glitter) {
    const b = this.b, rect = rectClamp({ x, y, w: canvas.width, h: canvas.height }, b.W, b.H);
    if (!rect) return;
    this.snapshot(rect);
    b.ctx.drawImage(canvas, x, y);
    b.gctx.save();
    b.gctx.globalCompositeOperation = glitter ? "source-over" : "destination-out";
    b.gctx.drawImage(canvas, x, y);
    b.gctx.restore();
  }

  // 填色：回傳裁好的那一塊顏料（給水波動畫用），呼叫 done() 才真的合進顏色層
  fill(id, mat, color) {
    const m = this.maskOf(id), p = this.paintFor(mat, color);
    const c = mk(m.w, m.h), x = c.getContext("2d");
    x.drawImage(p, m.x, m.y, m.w, m.h, 0, 0, m.w, m.h);
    x.globalCompositeOperation = "destination-in";
    x.drawImage(m.canvas, 0, 0);
    return { x: m.x, y: m.y, canvas: c, glitter: mat.kind === "glitter", done: () => this.commit(c, m.x, m.y, mat.kind === "glitter") };
  }
}

// 材質顏料：整張畫布大小（Task 4 換成含亮粉與圖樣的完整版）
export function makePaint(mat, color, W, H) {
  const c = mk(W, H), x = c.getContext("2d");
  x.fillStyle = color; x.fillRect(0, 0, W, H);
  return c;
}
```

- [ ] **Step 6：寫 `js/draw.js`**（暫時版，Task 5 會整個換掉）

```js
// 畫畫遊戲主程式（暫時版：只有點一下填紅色）
import { Board } from "./draw-canvas.js?v=1";
import { Painter } from "./draw-paint.js?v=1";

const $ = s => document.querySelector(s);
const S = { color: "#e53935", mat: { kind: "solid" }, tool: "fill" };
const board = new Board($("#stage"));
const painter = new Painter(board);

async function openArt(url) { await board.load(url); painter.reset(); }

$("#stage").addEventListener("pointerdown", e => {
  if (S.tool !== "fill" || !board.labels) return;
  const pt = board.toImage(e.clientX, e.clientY), id = painter.regionAt(pt.x, pt.y);
  if (id >= 0) painter.fill(id, S.mat, S.color).done();
});
window.addEventListener("resize", () => board.labels && board.fit());

window.__draw = { S, board, painter, openArt };
openArt(new URLSearchParams(location.search).get("art") || "IMAGE/draw/lineart/test-shapes.svg");
```

- [ ] **Step 7：寫 `draw.html`**（暫時版，Task 5 會整個換掉）

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>畫畫樂園</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="css/draw.css?v=1">
</head>
<body>
  <main id="paint" class="screen on">
    <div id="stage"></div>
    <nav id="bar"></nav>
  </main>
  <script type="module" src="js/draw.js?v=1"></script>
</body>
</html>
```

- [ ] **Step 8：寫 `css/draw.css`**（暫時版，Task 5 會整個換掉）

```css
:root { --bar-w: 112px; --bg: #fff4e0; --wood: #f3dfb8; --ink: #3b2a1a; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; height: 100%; background: var(--bg); overflow: hidden; touch-action: none;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.screen { position: fixed; inset: 0; display: none; }
.screen.on { display: flex; }
#stage { position: relative; flex: 1; overflow: hidden; background: #fff; margin: 12px; border-radius: 18px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .12); }
.board { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.layer { position: absolute; inset: 0; width: 100%; height: 100%; }
#bar { width: var(--bar-w); background: var(--wood); }
```

- [ ] **Step 9：語法檢查**

Run：`for f in js/draw-canvas.js js/draw-paint.js js/draw.js; do node --input-type=module --check < $f && echo "$f OK"; done`
Expected：三行 OK

- [ ] **Step 10：跑測試確認通過**

Run：`node tools/draw-test/ui.js`
Expected：6 行全部 ✅，「全部通過」。打開 `%TEMP%\draw-shots\01-fill.png` 看一眼：看得到測試線稿，長方形是白的（已復原）。

- [ ] **Step 11：Commit**

```bash
git add -- IMAGE/draw/lineart/test-shapes.svg js/draw-canvas.js js/draw-paint.js js/draw.js draw.html css/draw.css tools/draw-test/ui.js
git commit -m "畫畫遊戲：四層畫布與點一下填色" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4：材質——亮粉與 5 種圖樣

**Files:**
- Modify: `js/draw-paint.js`（整個 `makePaint` 函式換掉，並在檔尾加圖樣函式）
- Test: `tools/draw-test/ui.js`

- [ ] **Step 1：寫測試**（插在 `// ── 後續 task 的測試插在這一行上面 ──` 上面）

```js
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
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node tools/draw-test/ui.js`
Expected：「亮粉：同一塊裡有很多深淺不同的點」與 5 個圖樣項目 ❌（目前只會填純色）

- [ ] **Step 3：實作**——把 `js/draw-paint.js` 裡整個 `makePaint` 換成下面這段（含檔尾新增的函式）

```js
// 材質顏料：整張畫布大小。純色直接填；亮粉與圖樣先做一塊小磁磚，再鋪滿整張
export function makePaint(mat, color, W, H) {
  const c = mk(W, H), x = c.getContext("2d");
  if (mat.kind === "solid") { x.fillStyle = color; x.fillRect(0, 0, W, H); return c; }
  const tile = mat.kind === "glitter" ? glitterTile(color) : patternTile(mat.pattern, color);
  x.fillStyle = x.createPattern(tile, "repeat");
  x.fillRect(0, 0, W, H);
  return c;
}

function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function shade(hex, k) {   // k < 0 變暗、k > 0 變亮
  const [r, g, b] = hexRgb(hex), f = v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function lum(hex) { const [r, g, b] = hexRgb(hex); return (r * 0.299 + g * 0.587 + b * 0.114) / 255; }

// 亮粉磁磚 256×256：每個像素亮度隨機 ±35，再撒一些白色亮點
function glitterTile(color) {
  const S = 256, c = mk(S, S), x = c.getContext("2d"), img = x.createImageData(S, S), d = img.data;
  const [r, g, b] = hexRgb(color);
  for (let i = 0; i < d.length; i += 4) {
    const k = (Math.random() - 0.5) * 70, spark = Math.random() < 0.006;
    d[i] = spark ? 255 : Math.max(0, Math.min(255, r + k));
    d[i + 1] = spark ? 255 : Math.max(0, Math.min(255, g + k));
    d[i + 2] = spark ? 255 : Math.max(0, Math.min(255, b + k));
    d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// 圖樣磁磚 160×160：底色 + 圖案（淺色底用深一點的同色系，深色底用半透明白）
function patternTile(kind, color) {
  const S = 160, c = mk(S, S), x = c.getContext("2d");
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  const ink = lum(color) > 0.7 ? shade(color, -0.4) : "rgba(255,255,255,.85)";
  x.fillStyle = ink; x.strokeStyle = ink; x.lineCap = "round"; x.lineJoin = "round";
  const at = [[40, 40], [120, 120]];   // 兩個錯開的位置，鋪起來像斜格子
  if (kind === "star") for (const [cx, cy] of at) { starPath(x, cx, cy, 26, 11); x.fill(); }
  if (kind === "heart") for (const [cx, cy] of at) { heartPath(x, cx, cy, 24); x.fill(); }
  if (kind === "dot") for (const [cx, cy] of [...at, [120, 40], [40, 120]]) { x.beginPath(); x.arc(cx, cy, 14, 0, Math.PI * 2); x.fill(); }
  if (kind === "stripe") {
    x.lineWidth = 22;
    for (let k = -S; k <= S; k += 80) { x.beginPath(); x.moveTo(k, S); x.lineTo(k + S, 0); x.stroke(); }
  }
  if (kind === "snow") { x.lineWidth = 5; for (const [cx, cy] of at) snowPath(x, cx, cy, 24); }
  return c;
}
function starPath(x, cx, cy, R, r) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R;
    i ? x.lineTo(cx + d * Math.cos(a), cy + d * Math.sin(a)) : x.moveTo(cx + d * Math.cos(a), cy + d * Math.sin(a));
  }
  x.closePath();
}
function heartPath(x, cx, cy, s) {
  x.beginPath();
  x.moveTo(cx, cy + s * 0.9);
  x.bezierCurveTo(cx - s * 1.3, cy, cx - s * 0.7, cy - s, cx, cy - s * 0.35);
  x.bezierCurveTo(cx + s * 0.7, cy - s, cx + s * 1.3, cy, cx, cy + s * 0.9);
  x.closePath();
}
function snowPath(x, cx, cy, R) {
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, ex = cx + R * Math.cos(a), ey = cy + R * Math.sin(a);
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(ex, ey); x.stroke();
    const mx = cx + R * 0.6 * Math.cos(a), my = cy + R * 0.6 * Math.sin(a);
    for (const t of [-0.6, 0.6]) {
      x.beginPath(); x.moveTo(mx, my);
      x.lineTo(mx + R * 0.35 * Math.cos(a + t), my + R * 0.35 * Math.sin(a + t)); x.stroke();
    }
  }
}
```

- [ ] **Step 4：語法檢查與測試**

Run：`node --input-type=module --check < js/draw-paint.js && node tools/draw-test/ui.js`
Expected：全部 ✅。打開 `%TEMP%\draw-shots\02-materials.png` 目視：左半圓是綠色、小方塊是綠色（最後的純色蓋掉了），沒有白縫。

- [ ] **Step 5：Commit**

```bash
git add -- js/draw-paint.js tools/draw-test/ui.js
git commit -m "畫畫遊戲：亮粉與圖樣材質" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5：筆刷（馬克筆、蠟筆、彩虹筆）、橡皮擦、不出線、清空

**Files:**
- Modify: `js/draw-paint.js`（在 `Painter` 的 `fill()` 方法後面、class 結尾 `}` 之前加入；import 補上 `rectUnion`）
- Test: `tools/draw-test/ui.js`

- [ ] **Step 1：寫測試**（插在 `// ── 後續 task 的測試插在這一行上面 ──` 上面）

```js
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
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node tools/draw-test/ui.js`
Expected：失敗，錯誤含 `clearAll is not a function`

- [ ] **Step 3：實作**

`js/draw-paint.js` 第一行 import 改成：

```js
import { regionMask, regionAt, rectClamp, rectUnion, History } from "./draw-core.js?v=1";
```

在 `Painter` 的 `fill()` 方法後面加入：

```js
  // ── 筆畫：開始 → 移動 → 結束才合進顏色層；過程畫在即時層。不出線時裁在起筆那一塊裡 ──
  // o = { brush: "marker" | "crayon" | "rainbow" | "eraser", size: 半徑(畫布像素), mat, color, clip: true/false }
  strokeStart(x, y, o) {
    const b = this.b;
    if (!this.scratch || this.scratch.width !== b.W || this.scratch.height !== b.H) { this.scratch = mk(b.W, b.H); this.sctx = this.scratch.getContext("2d"); }   // 換線稿尺寸就重做
    this.sctx.clearRect(0, 0, b.W, b.H);
    const id = o.clip ? this.regionAt(x, y) : -1;
    this.st = { o, mask: id >= 0 ? this.maskOf(id) : null, last: { x, y }, rect: null, hue: Math.random() * 360 };
    this.strokeMove(x, y);
  }

  strokeMove(x, y) {
    const st = this.st;
    if (!st) return;
    const o = st.o, sx = this.sctx, a = st.last, r = o.size;
    // 1) 這一段先畫進暫存畫布（整筆都留在這裡）
    if (o.brush === "crayon") {
      const n = Math.max(1, Math.ceil(Math.hypot(x - a.x, y - a.y) / (r * 0.3)));
      sx.fillStyle = o.color;
      for (let i = 1; i <= n; i++) {
        const cx = a.x + (x - a.x) * i / n, cy = a.y + (y - a.y) * i / n;
        for (let k = 0; k < 8; k++) {
          const ang = Math.random() * Math.PI * 2, d = Math.random() * r;
          sx.globalAlpha = 0.35 + Math.random() * 0.45;
          sx.beginPath(); sx.arc(cx + d * Math.cos(ang), cy + d * Math.sin(ang), r * 0.28, 0, Math.PI * 2); sx.fill();
        }
      }
      sx.globalAlpha = 1;
    } else {
      sx.lineCap = "round"; sx.lineJoin = "round"; sx.lineWidth = r * 2;
      if (o.brush === "rainbow") {
        st.hue = (st.hue + Math.hypot(x - a.x, y - a.y) * 0.4) % 360;
        sx.strokeStyle = `hsl(${st.hue}, 90%, 55%)`;
      } else sx.strokeStyle = "#000";   // 馬克筆、橡皮擦：暫存畫布只當形狀用
      sx.beginPath(); sx.moveTo(a.x, a.y); sx.lineTo(x + 0.01, y); sx.stroke();
    }
    st.last = { x, y };
    // 2) 只重畫這一段的範圍到即時層
    const seg = rectClamp({ x: Math.min(a.x, x) - r - 2, y: Math.min(a.y, y) - r - 2,
      w: Math.abs(x - a.x) + 2 * r + 4, h: Math.abs(y - a.y) + 2 * r + 4 }, this.b.W, this.b.H);
    if (!seg) return;
    st.rect = rectUnion(st.rect, seg);
    const L = this.b.lctx;
    L.save();
    L.beginPath(); L.rect(seg.x, seg.y, seg.w, seg.h); L.clip();
    L.clearRect(seg.x, seg.y, seg.w, seg.h);
    if (o.brush === "eraser") {
      L.fillStyle = "#fff"; L.fillRect(seg.x, seg.y, seg.w, seg.h);
      L.globalCompositeOperation = "destination-in";
    } else if (o.brush === "marker") {
      L.drawImage(this.paintFor(o.mat, o.color), seg.x, seg.y, seg.w, seg.h, seg.x, seg.y, seg.w, seg.h);
      L.globalCompositeOperation = "destination-in";
    }
    L.drawImage(this.scratch, seg.x, seg.y, seg.w, seg.h, seg.x, seg.y, seg.w, seg.h);
    if (st.mask) { L.globalCompositeOperation = "destination-in"; L.drawImage(st.mask.canvas, st.mask.x, st.mask.y); }
    L.restore();
  }

  strokeEnd() {
    const st = this.st;
    this.st = null;
    if (!st || !st.rect) return;
    const r = st.rect, c = mk(r.w, r.h);
    c.getContext("2d").drawImage(this.b.live, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    this.b.lctx.clearRect(r.x, r.y, r.w, r.h);
    this.commit(c, r.x, r.y, st.o.brush === "marker" && st.o.mat.kind === "glitter");
  }

  // 第二根手指放上來時取消剛開始的那一筆（不記復原）
  strokeCancel() {
    const st = this.st;
    this.st = null;
    if (st && st.rect) this.b.lctx.clearRect(st.rect.x, st.rect.y, st.rect.w, st.rect.h);
  }

  // 清空整張（可以復原）
  clearAll() {
    const b = this.b;
    this.snapshot({ x: 0, y: 0, w: b.W, h: b.H });
    b.ctx.fillStyle = "#fff"; b.ctx.fillRect(0, 0, b.W, b.H);
    b.gctx.clearRect(0, 0, b.W, b.H);
  }
```

- [ ] **Step 4：語法檢查與測試**

Run：`node --input-type=module --check < js/draw-paint.js && node tools/draw-test/ui.js`
Expected：全部 ✅。目視 `%TEMP%\draw-shots\03-strokes.png`：紫色橫線停在長方形邊緣、沒有超出去。

- [ ] **Step 5：Commit**

```bash
git add -- js/draw-paint.js tools/draw-test/ui.js
git commit -m "畫畫遊戲：筆刷、橡皮擦、不出線、清空" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6：貼紙

**Files:**
- Create: `js/draw-stickers.js`
- Modify: `js/draw-paint.js`（在 `clearAll()` 後面加 `sticker()`）
- Test: `tools/draw-test/ui.js`

- [ ] **Step 1：寫測試**（插在 `// ── 後續 task 的測試插在這一行上面 ──` 上面）

```js
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
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node tools/draw-test/ui.js`
Expected：失敗，錯誤含 `draw-stickers.js`（404）

- [ ] **Step 3：寫 `js/draw-stickers.js`**

```js
// 畫畫遊戲貼紙：12 種原創向量圖（viewBox 100×100），第一次用到才轉成圖片並快取
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const O = 'stroke="#3b2a1a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';

export const STICKERS = [
  { id: "star", svg: svg(`<path ${O} fill="#ffd54f" d="M50 6l13 28 30 3-23 20 7 30-27-16-27 16 7-30L7 37l30-3z"/>`) },
  { id: "heart", svg: svg(`<path ${O} fill="#f06292" d="M50 88C18 64 6 46 14 28c8-16 28-16 36 2 8-18 28-18 36-2 8 18-4 36-36 60z"/>`) },
  { id: "flower", svg: svg(`<g ${O} fill="#ba68c8"><circle cx="50" cy="24" r="16"/><circle cx="76" cy="44" r="16"/><circle cx="66" cy="74" r="16"/><circle cx="34" cy="74" r="16"/><circle cx="24" cy="44" r="16"/></g><circle ${O} cx="50" cy="52" r="13" fill="#ffd54f"/>`) },
  { id: "sun", svg: svg(`<g ${O}><path d="M50 4v14M50 82v14M4 50h14M82 50h14M17 17l10 10M73 73l10 10M83 17L73 27M27 73L17 83"/></g><circle ${O} cx="50" cy="50" r="24" fill="#ffb300"/>`) },
  { id: "rainbow", svg: svg(`<g fill="none" stroke-width="9" stroke-linecap="round"><path stroke="#e53935" d="M12 78a38 38 0 0 1 76 0"/><path stroke="#fdd835" d="M22 78a28 28 0 0 1 56 0"/><path stroke="#43a047" d="M32 78a18 18 0 0 1 36 0"/></g>`) },
  { id: "cloud", svg: svg(`<path ${O} fill="#e3f2fd" d="M26 74h50a16 16 0 0 0 0-32 22 22 0 0 0-42-6 18 18 0 0 0-8 38z"/>`) },
  { id: "moon", svg: svg(`<path ${O} fill="#fff59d" d="M62 10a40 40 0 1 0 28 62A32 32 0 0 1 62 10z"/>`) },
  { id: "crown", svg: svg(`<path ${O} fill="#ffca28" d="M12 76l-4-46 22 18 20-30 20 30 22-18-4 46z"/><circle ${O} cx="50" cy="60" r="7" fill="#e53935"/>`) },
  { id: "balloon", svg: svg(`<path ${O} fill="none" d="M50 70c-6 10 6 16 0 26"/><ellipse ${O} cx="50" cy="40" rx="26" ry="32" fill="#4fc3f7"/><path ${O} fill="#4fc3f7" d="M44 72h12l-6-6z"/>`) },
  { id: "note", svg: svg(`<path ${O} fill="#7e57c2" d="M38 14l44-8v58a12 12 0 1 1-8-11V24l-28 5v43a12 12 0 1 1-8-11z"/>`) },
  { id: "smile", svg: svg(`<circle ${O} cx="50" cy="50" r="42" fill="#ffee58"/><circle cx="36" cy="40" r="6" fill="#3b2a1a"/><circle cx="64" cy="40" r="6" fill="#3b2a1a"/><path ${O} fill="none" d="M30 58q20 22 40 0"/>`) },
  { id: "paw", svg: svg(`<g ${O} fill="#a1887f"><ellipse cx="50" cy="66" rx="22" ry="18"/><circle cx="24" cy="40" r="10"/><circle cx="40" cy="24" r="10"/><circle cx="60" cy="24" r="10"/><circle cx="76" cy="40" r="10"/></g>`) },
];

const cache = new Map();
export function stickerImage(id) {
  if (!cache.has(id)) {
    const s = STICKERS.find(t => t.id === id);
    cache.set(id, new Promise((ok, bad) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => bad(new Error("貼紙載入失敗：" + id));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.svg);
    }));
  }
  return cache.get(id);
}
```

- [ ] **Step 4：在 `Painter` 的 `clearAll()` 後面加入**

```js
  // 貼紙：以 (x, y) 為中心蓋上去，不受不出線限制
  sticker(img, x, y, size) {
    const c = mk(size, size);
    c.getContext("2d").drawImage(img, 0, 0, size, size);
    this.commit(c, Math.round(x - size / 2), Math.round(y - size / 2), false);
  }
```

- [ ] **Step 5：語法檢查與測試**

Run：`for f in js/draw-stickers.js js/draw-paint.js; do node --input-type=module --check < $f && echo "$f OK"; done; node tools/draw-test/ui.js`
Expected：全部 ✅

- [ ] **Step 6：Commit**

```bash
git add -- js/draw-stickers.js js/draw-paint.js tools/draw-test/ui.js
git commit -m "畫畫遊戲：12 種貼紙" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7：特效——填色水波、亮粉閃爍、完成動畫（沒有聲音）

**Files:**
- Create: `js/draw-fx.js`
- Modify: `css/draw.css`（檔尾加 `.finish-ov`）
- Test: `tools/draw-test/ui.js`

零件設定格式（Task 10 的 `index.json` 會用到）：`{ "type": "blink" | "spin" | "wag" | "sway", "at": [[x, y], ...], "pivot": [x, y], "deg": 12 }`。`at` 是落在零件那幾塊裡的座標點（畫布像素）；`pivot` 是旋轉支點，沒寫就用零件中心；`deg` 是擺動角度，沒寫就是 12 度。眨眼是用「周圍顏色蓋住眼睛，再畫一條閉眼弧線」做出來的。

- [ ] **Step 1：寫測試**（插在 `// ── 後續 task 的測試插在這一行上面 ──` 上面）

```js
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
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node tools/draw-test/ui.js`
Expected：失敗，錯誤含 `draw-fx.js`（404）

- [ ] **Step 3：寫 `js/draw-fx.js`**

```js
// 畫畫遊戲特效：填色水波、亮粉閃爍、完成動畫（跳一下＋零件動作＋彩帶）。全部沒有聲音
import { regionAt, regionMask } from "./draw-core.js?v=1";
import { makeCanvas as mk } from "./draw-canvas.js?v=1";

export class Fx {
  constructor(board) { this.b = board; this.pending = null; this.sparkOn = false; this.parts = []; this.cells = []; }

  // 填色水波：f = painter.fill() 的回傳值；顏料從 (px, py) 圓形擴散，ms 毫秒後合進顏色層
  ripple(f, px, py, ms = 400) {
    this.flush();
    const F = this.b.fctx, c = f.canvas;
    const R = Math.max(...[[f.x, f.y], [f.x + c.width, f.y], [f.x, f.y + c.height], [f.x + c.width, f.y + c.height]]
      .map(([x, y]) => Math.hypot(x - px, y - py)));
    const job = { f, done: false }, t0 = performance.now();
    this.pending = job;
    const step = now => {
      if (job.done) return;
      const t = Math.min(1, (now - t0) / ms), e = 1 - (1 - t) ** 3;
      F.clearRect(f.x, f.y, c.width, c.height);
      F.save(); F.beginPath(); F.arc(px, py, Math.max(1, R * e), 0, Math.PI * 2); F.clip();
      F.drawImage(c, f.x, f.y); F.restore();
      if (t < 1) requestAnimationFrame(step); else this.flush();
    };
    requestAnimationFrame(step);
  }
  // 動畫還沒跑完就有新動作：立刻把這一筆合進顏色層
  flush() {
    const job = this.pending;
    if (!job || job.done) return;
    job.done = true; this.pending = null;
    this.b.fctx.clearRect(job.f.x, job.f.y, job.f.canvas.width, job.f.canvas.height);
    job.f.done();
  }

  // 亮粉閃爍：每秒看一次亮粉遮罩（縮小 16 倍），在有亮粉的格子隨機冒出小星光
  sparkleStart() {
    if (this.sparkOn) return;
    this.sparkOn = true; this.lastScan = 0;
    const loop = now => {
      if (!this.sparkOn) return;
      const F = this.b.fctx;
      if (now - this.lastScan > 1000) { this.scan(); this.lastScan = now; }
      for (const s of this.parts) F.clearRect(s.x - s.r - 2, s.y - s.r - 2, s.r * 2 + 4, s.r * 2 + 4);
      this.parts = this.parts.filter(s => now - s.t0 < 700);
      if (this.cells.length && this.parts.length < 24 && Math.random() < 0.5) {
        const [cx, cy] = this.cells[(Math.random() * this.cells.length) | 0];
        this.parts.push({ x: cx + Math.random() * 16, y: cy + Math.random() * 16, r: 8 + Math.random() * 10, t0: now });
      }
      for (const s of this.parts) { const a = Math.sin((now - s.t0) / 700 * Math.PI); spark(F, s.x, s.y, s.r * (0.6 + a * 0.4), a); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  sparkleStop() {
    this.sparkOn = false;
    for (const s of this.parts) this.b.fctx.clearRect(s.x - s.r - 2, s.y - s.r - 2, s.r * 2 + 4, s.r * 2 + 4);
    this.parts = [];
  }
  scan() {
    const b = this.b, G = 16, w = Math.ceil(b.W / G), h = Math.ceil(b.H / G);
    if (!this.small || this.small.width !== w) { this.small = mk(w, h); this.smx = this.small.getContext("2d", { willReadFrequently: true }); }
    this.smx.clearRect(0, 0, w, h); this.smx.drawImage(b.glit, 0, 0, w, h);
    const d = this.smx.getImageData(0, 0, w, h).data;
    this.cells = [];
    for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 128) this.cells.push([(i % w) * G, ((i / w) | 0) * G]);
  }

  // 完成動畫：約 2.2 秒，播完回傳（Promise）。parts = 這張線稿的零件設定
  finish(parts = []) {
    this.flush();
    const b = this.b, comp = b.composite();
    const P = parts.map(pt => this.cutPart(comp, pt)).filter(Boolean);
    const r = b.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const ov = mk(Math.round(r.width * dpr), Math.round(r.height * dpr));
    ov.className = "finish-ov";
    b.stage.appendChild(ov);
    const O = ov.getContext("2d"), k = Math.min(r.width / b.W, r.height / b.H) * dpr;
    const ox = (ov.width - b.W * k) / 2, oy = (ov.height - b.H * k) / 2;
    const conf = [];
    let burst = false;
    return new Promise(done => {
      const t0 = performance.now();
      const frame = now => {
        const s = (now - t0) / 1000, h = hop(s);
        O.clearRect(0, 0, ov.width, ov.height);
        O.save();
        O.translate(ox + b.W * k / 2, oy + b.H * k * (1 + h.dy));
        O.scale(h.sx * k, h.sy * k);
        O.translate(-b.W / 2, -b.H);
        O.drawImage(comp, 0, 0);
        for (const q of P) drawPart(O, q, s);
        O.restore();
        if (s > 0.65 && !burst) { burst = true; for (let i = 0; i < 90; i++) conf.push(confetti(ov.width, dpr)); }
        for (const c of conf) {
          c.vy += 0.35 * dpr; c.x += c.vx; c.y += c.vy; c.a += c.va;
          O.save(); O.translate(c.x, c.y); O.rotate(c.a); O.fillStyle = c.col; O.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); O.restore();
        }
        if (s < 2.2) requestAnimationFrame(frame); else { ov.remove(); done(); }
      };
      requestAnimationFrame(frame);
    });
  }

  // 依座標點找出零件那幾塊：眨眼只要位置和周圍顏色；會轉、會擺的要切出圖（含外框線）和補洞用的底色
  cutPart(comp, pt) {
    const b = this.b;
    const ids = [...new Set(pt.at.map(([x, y]) => regionAt(b.labels, b.W, b.H, x, y)).filter(id => id >= 0))];
    if (!ids.length) return null;
    const ms = ids.map(id => regionMask(b.labels, b.W, b.H, id, b.boxes[id], pt.type === "blink" ? 0 : 14));
    const x0 = Math.min(...ms.map(m => m.x)), y0 = Math.min(...ms.map(m => m.y));
    const w = Math.max(...ms.map(m => m.x + m.w)) - x0, h = Math.max(...ms.map(m => m.y + m.h)) - y0;
    const fill = surround(comp, x0, y0, w, h);
    if (pt.type === "blink") return { type: "blink", cx: x0 + w / 2, cy: y0 + h / 2, rx: w / 2 + 8, ry: h / 2 + 8, fill };
    const shape = mk(w, h), sx = shape.getContext("2d"), img = sx.createImageData(w, h);
    for (const m of ms) for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++)
      if (m.data[j * m.w + i]) img.data[((m.y - y0 + j) * w + (m.x - x0 + i)) * 4 + 3] = 255;
    sx.putImageData(img, 0, 0);
    const part = mk(w, h), px = part.getContext("2d");
    px.drawImage(shape, 0, 0); px.globalCompositeOperation = "source-in"; px.drawImage(comp, x0, y0, w, h, 0, 0, w, h);
    const hole = mk(w, h), hx = hole.getContext("2d");
    hx.drawImage(shape, 0, 0); hx.globalCompositeOperation = "source-in"; hx.fillStyle = fill; hx.fillRect(0, 0, w, h);
    const [cx, cy] = pt.pivot || [x0 + w / 2, y0 + h / 2];
    return { type: pt.type, deg: pt.deg || 12, x: x0, y: y0, img: part, hole, px: cx, py: cy };
  }
}

// 跳一下：sx/sy = 水平／垂直縮放，dy = 往上位移（畫面高度的比例，負數往上）
function hop(s) {
  const ease = t => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;
  if (s < 0.25) { const e = ease(s / 0.25); return { sx: 1 + 0.06 * e, sy: 1 - 0.1 * e, dy: 0 }; }
  if (s < 0.65) { const u = (s - 0.25) / 0.4, e = ease(u * 3); return { sx: 1.06 - 0.09 * e, sy: 0.9 + 0.15 * e, dy: -0.12 * Math.sin(Math.PI * u) }; }
  if (s < 0.85) { const e = ease((s - 0.65) / 0.2); return { sx: 1.06 - 0.06 * e, sy: 0.9 + 0.1 * e, dy: 0 }; }
  if (s < 1.2) return { sx: 1, sy: 1, dy: -0.025 * Math.sin(Math.PI * (s - 0.85) / 0.35) };
  return { sx: 1, sy: 1, dy: 0 };
}

function drawPart(O, q, s) {
  if (q.type === "blink") {
    if (!((s > 0.3 && s < 0.46) || (s > 1.3 && s < 1.46))) return;
    O.save();
    O.fillStyle = q.fill; O.beginPath(); O.ellipse(q.cx, q.cy, q.rx, q.ry, 0, 0, Math.PI * 2); O.fill();
    O.strokeStyle = "#000"; O.lineCap = "round"; O.lineWidth = Math.max(6, q.ry * 0.22);
    O.beginPath(); O.moveTo(q.cx - q.rx * 0.8, q.cy); O.quadraticCurveTo(q.cx, q.cy + q.ry * 0.5, q.cx + q.rx * 0.8, q.cy); O.stroke();
    O.restore();
    return;
  }
  const a = q.type === "spin" ? s * Math.PI * 2 : Math.sin(s * Math.PI * (q.type === "wag" ? 6 : 4)) * q.deg * Math.PI / 180;
  O.save();
  O.drawImage(q.hole, q.x, q.y);
  O.translate(q.px, q.py); O.rotate(a); O.translate(-q.px, -q.py);
  O.drawImage(q.img, q.x, q.y);
  O.restore();
}

// 零件外面一圈的顏色（避開黑線），用來補零件移開後露出的洞、或當眼皮顏色
function surround(comp, x, y, w, h) {
  const c = comp.getContext("2d");
  for (const [sx, sy] of [[x - 10, y + h / 2], [x + w + 10, y + h / 2], [x + w / 2, y - 10], [x + w / 2, y + h + 10]]) {
    if (sx < 0 || sy < 0 || sx >= comp.width || sy >= comp.height) continue;
    const d = c.getImageData(sx | 0, sy | 0, 1, 1).data;
    if (d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114 > 60) return `rgb(${d[0]},${d[1]},${d[2]})`;
  }
  return "#fff";
}

function spark(F, x, y, r, a) {
  F.save(); F.globalAlpha = a; F.fillStyle = "#fff";
  F.beginPath();
  F.moveTo(x, y - r); F.quadraticCurveTo(x, y, x + r, y); F.quadraticCurveTo(x, y, x, y + r);
  F.quadraticCurveTo(x, y, x - r, y); F.quadraticCurveTo(x, y, x, y - r);
  F.fill(); F.restore();
}

function confetti(W, dpr) {
  const cols = ["#e53935", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#fb8c00", "#ec407a"];
  return { x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: -10 * dpr, vx: (Math.random() - 0.5) * 18 * dpr, vy: Math.random() * 4 * dpr,
    a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, w: (8 + Math.random() * 8) * dpr, h: (5 + Math.random() * 5) * dpr,
    col: cols[(Math.random() * cols.length) | 0] };
}
```

- [ ] **Step 4：`css/draw.css` 檔尾加入**

```css
.finish-ov { position: absolute; inset: 0; width: 100%; height: 100%; background: #fff; z-index: 5; pointer-events: none; }
```

- [ ] **Step 5：語法檢查與測試**

Run：`node --input-type=module --check < js/draw-fx.js && node tools/draw-test/ui.js`
Expected：全部 ✅。目視 `%TEMP%\draw-shots\04-finish.png`：整張圖有在跳、有彩帶。

- [ ] **Step 6：Commit**

```bash
git add -- js/draw-fx.js css/draw.css tools/draw-test/ui.js
git commit -m "畫畫遊戲：填色水波、亮粉閃爍、完成動畫" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8：作品牆存取（IndexedDB）

**Files:**
- Create: `js/draw-gallery.js`
- Test: `tools/draw-test/ui.js`

每件作品的資料：`{ id, art（線稿編號）, done（是否完成）, t（最後存檔時間）, thumb（縮圖 JPEG）, image（完整作品 PNG）, color（顏色層 PNG）, glit（亮粉遮罩 PNG） }`。接著畫時用 `color` 和 `glit` 還原。

- [ ] **Step 1：寫測試**（插在 `// ── 後續 task 的測試插在這一行上面 ──` 上面）

```js
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
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node tools/draw-test/ui.js`
Expected：失敗，錯誤含 `draw-gallery.js`（404）

- [ ] **Step 3：寫 `js/draw-gallery.js`**

```js
// 畫畫遊戲作品牆：存在 iPad 瀏覽器的 IndexedDB，最多 50 件（含未完成），滿了不自動刪、由大人挑
export const MAX = 50;
const NAME = "draw-gallery", STORE = "works";
let dbp = null;

function open() {
  if (!dbp) dbp = new Promise((ok, bad) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
  return dbp;
}
function tx(mode, fn) {
  return open().then(db => new Promise((ok, bad) => {
    const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => bad(t.error);
    t.onabort = () => bad(t.error);
  }));
}

export const get = id => tx("readonly", s => s.get(id));
export const count = () => tx("readonly", s => s.count());
export const remove = id => tx("readwrite", s => s.delete(id));
export const wipe = () => tx("readwrite", s => s.clear());   // 只給測試用
export async function list() { return (await tx("readonly", s => s.getAll())).sort((a, b) => b.t - a.t); }

// 新作品在滿 50 件時丟出 code = "FULL"；已存在的作品照樣可以更新
export async function save(w) {
  if (!(await get(w.id)) && (await count()) >= MAX) { const e = new Error("作品牆滿了"); e.code = "FULL"; throw e; }
  await tx("readwrite", s => s.put({ ...w, t: Date.now() }));
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const toBlob = (canvas, type = "image/png", q) => new Promise(ok => canvas.toBlob(ok, type, q));
export function thumbOf(canvas, w = 360) {
  const c = document.createElement("canvas");
  c.width = w; c.height = Math.round(canvas.height * w / canvas.width);
  c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
  return toBlob(c, "image/jpeg", 0.8);
}

// 請瀏覽器不要自動清掉作品（Safari 不一定答應，回傳 true/false）
export async function persist() { try { return !!(await navigator.storage?.persist?.()); } catch { return false; } }

// 存到相簿：iPad 用分享選單（裡面有「儲存影像」），不支援分享的瀏覽器改成直接下載
export async function saveToPhotos(blob, name = "我的畫.png") {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return "share"; }
    catch (e) { if (e.name === "AbortError") return "cancel"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "download";
}
```

- [ ] **Step 4：語法檢查與測試**

Run：`node --input-type=module --check < js/draw-gallery.js && node tools/draw-test/ui.js`
Expected：全部 ✅

- [ ] **Step 5：Commit**

```bash
git add -- js/draw-gallery.js tools/draw-test/ui.js
git commit -m "畫畫遊戲：作品牆存取" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9：完整畫面——首頁、工具列、彈出選單、手勢、完成、作品牆畫面

這個 task 的 `draw.html`、`css/draw.css`、`js/draw.js` 要一起換掉才能跑，所以中間不要 commit，跑完 Step 9 的測試才 commit。

**Files:**
- Create: `IMAGE/draw/lineart/index.json`
- Modify: `js/draw-canvas.js`（`Board` 加 `zoomAt()`）、`js/draw-paint.js`（檔尾加 `previewMat()`）
- Replace: `draw.html`、`css/draw.css`、`js/draw.js`
- Test: `tools/draw-test/ui.js`

- [ ] **Step 1：寫 `IMAGE/draw/lineart/index.json`**（`test: true` 的只有網址帶 `?dev` 才會出現；Task 11 再補上 8 張正式線稿）

```json
{
  "themes": [
    { "id": "animal", "name": "動物", "icon": "🐱" },
    { "id": "vehicle", "name": "交通工具", "icon": "🚗" },
    { "id": "dino", "name": "恐龍", "icon": "🦖" },
    { "id": "fairy", "name": "公主", "icon": "👑" }
  ],
  "arts": [
    { "id": "test-shapes", "file": "test-shapes.svg", "theme": "animal", "level": 1, "test": true,
      "parts": [{ "type": "spin", "at": [[1550, 1100]] }, { "type": "wag", "at": [[700, 500]], "pivot": [500, 800], "deg": 15 }] }
  ]
}
```

- [ ] **Step 2：`js/draw-canvas.js` 的 `Board` 在 `toClient()` 後面加入**

```js
  // 以畫布上的 (ix, iy) 為定點縮放：縮放後那一點剛好落在螢幕 (clientX, clientY) 底下（兩指縮放用）
  zoomAt(ix, iy, clientX, clientY, s) {
    const r = this.stage.getBoundingClientRect();
    s = Math.min(4, Math.max(1, s));
    const k = this.base * s;
    this.setView({ s, tx: clientX - r.left - ix * k - (r.width - this.W * k) / 2, ty: clientY - r.top - iy * k - (r.height - this.H * k) / 2 });
  }
```

- [ ] **Step 3：`js/draw-paint.js` 檔尾加入**

```js
// 材質預覽小方塊（工具列和材質選單用）
export function previewMat(mat, color, size = 64) {
  const c = mk(size, size), x = c.getContext("2d");
  if (mat.kind === "solid") { x.fillStyle = color; x.fillRect(0, 0, size, size); }
  else x.drawImage(mat.kind === "glitter" ? glitterTile(color) : patternTile(mat.pattern, color), 0, 0, size, size);
  return c;
}
```

- [ ] **Step 4：整個換掉 `draw.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#fff4e0">
  <title>畫畫樂園</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="css/draw.css?v=1">
  <link rel="modulepreload" href="js/draw-core.js?v=1">
  <link rel="modulepreload" href="js/draw-canvas.js?v=1">
  <link rel="modulepreload" href="js/draw-paint.js?v=1">
  <link rel="modulepreload" href="js/draw-fx.js?v=1">
  <link rel="modulepreload" href="js/draw-gallery.js?v=1">
  <link rel="modulepreload" href="js/draw-stickers.js?v=1">
</head>
<body>
  <!-- 首頁：上排選主題，下面是線稿縮圖 -->
  <section id="home" class="screen on">
    <header class="top">
      <div class="themes" id="themes"></div>
      <button class="big" id="toGallery" aria-label="作品牆">🖼️</button>
    </header>
    <div class="arts" id="arts"></div>
  </section>

  <!-- 畫畫頁：左邊畫布、右邊工具列 -->
  <section id="paint" class="screen">
    <div id="stage"></div>
    <nav id="bar">
      <button id="bDone" class="btn ok" aria-label="完成">✔️</button>
      <button id="bHome" class="btn" aria-label="回首頁">🏠</button>
      <hr>
      <button class="btn tool on" data-tool="fill" aria-label="填色桶">🪣</button>
      <button class="btn tool" data-tool="brush" aria-label="筆刷">🖍️</button>
      <button class="btn tool" data-tool="sticker" aria-label="貼紙">⭐</button>
      <button class="btn tool" data-tool="eraser" aria-label="橡皮擦">🧽</button>
      <hr>
      <button id="bColor" class="btn" aria-label="顏色"><span class="dot"></span></button>
      <button id="bMat" class="btn" aria-label="材質"><canvas width="64" height="64"></canvas></button>
      <button id="bClip" class="btn on" aria-label="不出線">🛡️</button>
      <hr>
      <button id="bUndo" class="btn" aria-label="復原">↩️</button>
      <button id="bClear" class="btn hold" aria-label="清空（要按住）">🗑️<i class="ring"></i></button>
    </nav>
    <div id="pop" class="pop"></div>
    <div id="after" class="after">
      <button class="big" id="aHome" aria-label="回首頁">🏠</button>
      <button class="big" id="aAgain" aria-label="繼續畫">🖌️</button>
    </div>
  </section>

  <!-- 作品牆 -->
  <section id="gallery" class="screen">
    <header class="top">
      <button class="big" id="gBack" aria-label="回首頁">🏠</button>
      <span class="grow"></span>
      <button class="big" id="gTip" aria-label="加到主畫面">📲</button>
    </header>
    <div class="works" id="works"></div>
    <div id="view" class="view">
      <img id="vImg" alt="">
      <div class="vbar">
        <button class="big" id="vClose" aria-label="關閉">✖️</button>
        <button class="big" id="vEdit" aria-label="接著畫">🖌️</button>
        <button class="big" id="vSave" aria-label="存到相簿">📥</button>
        <button class="big hold" id="vDel" aria-label="刪除（要按住）">🗑️<i class="ring"></i></button>
      </div>
    </div>
    <div id="tip" class="tip">把這個遊戲加到主畫面，作品比較不會不見：<br>按 Safari 的「分享」⬆️ →「加入主畫面」➕</div>
  </section>

  <div id="full" class="toast">🖼️ 滿了</div>
  <div id="rotate" class="rotate">📱 ↻</div>
  <script type="module" src="js/draw.js?v=1"></script>
</body>
</html>
```

- [ ] **Step 5：整個換掉 `css/draw.css`**

```css
:root { --bar-w: 112px; --bg: #fff4e0; --wood: #f3dfb8; --wood-d: #e2c48f; --ink: #3b2a1a; --on: #ffcf4d; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); overflow: hidden; touch-action: none;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  font-family: system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; }
button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; }
.screen { position: fixed; inset: 0; display: none;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
.screen.on { display: flex; }
#home.on, #gallery.on { flex-direction: column; }
.grow { flex: 1; }

/* 首頁與作品牆 */
.top { display: flex; align-items: center; gap: 16px; padding: 16px 20px 8px; }
.themes { display: flex; gap: 16px; flex: 1; }
.big { width: 88px; height: 88px; border-radius: 24px; background: #fff; font-size: 48px; position: relative;
  box-shadow: 0 4px 0 var(--wood-d); flex: 0 0 auto; }
.big.on, .btn.on { background: var(--on); }
.big:active, .btn:active, .card:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--wood-d); }
.arts, .works { flex: 1; overflow-y: auto; touch-action: pan-y; display: grid; align-content: start; gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); padding: 12px 20px 24px; }
.card { position: relative; background: #fff; border-radius: 20px; box-shadow: 0 4px 0 var(--wood-d); overflow: hidden; aspect-ratio: 4 / 3; }
.card img { width: 100%; height: 100%; object-fit: contain; display: block; pointer-events: none; }
.card .lv { position: absolute; right: 10px; top: 8px; font-size: 26px; }
.card .wip { position: absolute; left: 10px; top: 8px; font-size: 30px; }

/* 畫畫頁 */
#stage { position: relative; flex: 1; overflow: hidden; background: #fff; margin: 12px; border-radius: 18px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .12); }
.board { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.layer { position: absolute; inset: 0; width: 100%; height: 100%; }
#bar { width: var(--bar-w); background: var(--wood); display: flex; flex-direction: column; align-items: center;
  gap: 8px; padding: 12px 0; overflow-y: auto; }
#bar hr { width: 70%; border: 0; border-top: 3px dashed var(--wood-d); margin: 2px 0; }
.btn { width: 76px; height: 62px; flex: 0 0 auto; border-radius: 18px; background: #fff; font-size: 32px; position: relative;
  display: grid; place-items: center; box-shadow: 0 4px 0 var(--wood-d); }
.btn.ok { background: #8bd96b; }
#bColor .dot { width: 40px; height: 40px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 0 2px var(--ink); }
#bMat canvas { width: 40px; height: 40px; border-radius: 10px; }
#bClip:not(.on) { opacity: .45; }

/* 要按住的按鈕：外圈紅色進度條，跑滿 1 秒才算 */
.ring { position: absolute; inset: -4px; border-radius: 22px; border: 5px solid #e53935; clip-path: inset(0 100% 0 0); pointer-events: none; }
.hold.holding .ring { animation: hold 1s linear forwards; }
@keyframes hold { to { clip-path: inset(0 0 0 0); } }

/* 彈出選單：貼在工具列左邊 */
.pop { position: absolute; right: calc(var(--bar-w) + 12px); top: 12px; z-index: 6; display: none; flex-wrap: wrap; gap: 10px;
  max-width: 470px; padding: 14px; background: #fff; border-radius: 22px; box-shadow: 0 8px 30px rgba(0, 0, 0, .25); }
.pop.on { display: flex; }
.pop .sw { width: 64px; height: 64px; border-radius: 50%; border: 4px solid #fff; box-shadow: 0 0 0 2px #ccc; }
.pop .sw.on { box-shadow: 0 0 0 4px var(--ink); }
.pop .opt { width: 76px; height: 76px; border-radius: 18px; background: #f6efe2; display: grid; place-items: center; font-size: 40px; }
.pop .opt.on { background: var(--on); }
.pop .opt canvas, .pop .opt img { width: 60px; height: 60px; border-radius: 12px; pointer-events: none; }
.pop .row { display: flex; gap: 10px; width: 100%; }
.pop .size i { display: block; border-radius: 50%; background: var(--ink); }

/* 完成後的兩顆大按鈕 */
.after { position: absolute; left: 0; right: var(--bar-w); bottom: 40px; z-index: 7; display: none; justify-content: center; gap: 40px; }
.after.on { display: flex; }
.finish-ov { position: absolute; inset: 0; width: 100%; height: 100%; background: #fff; z-index: 5; pointer-events: none; }

/* 作品牆：放大看 */
.view { position: fixed; inset: 0; z-index: 8; display: none; flex-direction: column; align-items: center; justify-content: center;
  gap: 20px; background: rgba(40, 30, 20, .85); }
.view.on { display: flex; }
.view img { max-width: 90vw; max-height: 72vh; border-radius: 16px; background: #fff; }
.vbar { display: flex; gap: 28px; }
.tip { position: fixed; left: 50%; bottom: 30px; transform: translateX(-50%); z-index: 9; display: none; padding: 16px 24px;
  font-size: 22px; line-height: 1.6; background: #fff; border-radius: 20px; box-shadow: 0 8px 30px rgba(0, 0, 0, .25); }
.tip.on { display: block; }
.toast { position: fixed; left: 50%; top: 40%; transform: translate(-50%, -50%); z-index: 20; display: none; padding: 24px 40px;
  font-size: 56px; background: #fff; border-radius: 28px; box-shadow: 0 8px 30px rgba(0, 0, 0, .3); }
.toast.on { display: block; }

/* 直向：整頁蓋上「請轉橫」 */
.rotate { position: fixed; inset: 0; z-index: 30; display: none; place-items: center; font-size: 96px; background: var(--bg); }
@media (orientation: portrait) { .rotate { display: grid; } }
```

- [ ] **Step 6：整個換掉 `js/draw.js`**

```js
// 畫畫遊戲主程式：首頁、畫畫頁（工具列、彈出選單、手勢）、完成、作品牆
import { Board } from "./draw-canvas.js?v=1";
import { Painter, previewMat } from "./draw-paint.js?v=1";
import { Fx } from "./draw-fx.js?v=1";
import * as G from "./draw-gallery.js?v=1";
import { STICKERS, stickerImage } from "./draw-stickers.js?v=1";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const DEV = Q.has("dev");   // 網址帶 ?dev 才看得到測試用線稿
const ART_DIR = "IMAGE/draw/lineart/";
const COLORS = ["#e53935", "#f06292", "#ad1457", "#ff7043", "#fb8c00", "#ffb300", "#fdd835", "#fff176",
  "#c0ca33", "#7cb342", "#43a047", "#00897b", "#4dd0e1", "#29b6f6", "#1e88e5", "#3949ab",
  "#7e57c2", "#8e24aa", "#8d6e63", "#5d4037", "#bdbdbd", "#757575", "#212121", "#ffffff"];
const MATS = [{ kind: "solid" }, { kind: "glitter" }, ...["star", "heart", "dot", "stripe", "snow"].map(p => ({ kind: "pattern", pattern: p }))];
const BRUSHES = [["marker", "🖊️"], ["crayon", "🖍️"], ["rainbow", "🌈"]];
const SIZES = [10, 22, 40];            // 筆刷半徑（畫布像素）
const STICKER_SIZE = [120, 200, 300];  // 貼紙邊長，跟著筆刷粗細

const S = { tool: "fill", brush: "marker", size: 1, color: COLORS[0], mat: MATS[0], sticker: "star", clip: true,
  art: null, workId: null, done: false, busy: false };
const board = new Board($("#stage"));
const painter = new Painter(board);
const fx = new Fx(board);
let INDEX = { themes: [], arts: [] };

function show(id) {
  $$(".screen").forEach(s => s.classList.toggle("on", s.id === id));
  if (id === "paint") fx.sparkleStart(); else fx.sparkleStop();
}
function el(tag, cls, html = "") { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; }
function button(cls, html, onTap, label = "") { const b = el("button", cls, html); b.setAttribute("aria-label", label); b.onclick = onTap; return b; }
function card(src, onTap, badge = "", wip = "") {
  const d = button("card", "", onTap), img = new Image();
  img.src = src; img.alt = "";
  d.append(img);
  if (badge) d.append(el("span", "lv", badge));
  if (wip) d.append(el("span", "wip", wip));
  return d;
}
// 按住 1 秒才觸發（清空、刪除作品），按鈕外圈有進度條
function hold(btn, fn) {
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; btn.classList.remove("holding"); };
  btn.addEventListener("pointerdown", e => { e.stopPropagation(); stop(); btn.classList.add("holding"); timer = setTimeout(() => { stop(); fn(); }, 1000); });
  for (const t of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(t, stop);
}

// ── 首頁 ──
function renderHome(theme) {
  theme = theme || INDEX.themes[0]?.id;
  $("#themes").replaceChildren(...INDEX.themes.map(t =>
    button("big" + (t.id === theme ? " on" : ""), t.icon, () => renderHome(t.id), t.name)));
  const arts = INDEX.arts.filter(a => a.theme === theme && (DEV || !a.test));
  $("#arts").replaceChildren(...arts.map(a => {
    const c = card(ART_DIR + a.file, () => startArt(a), a.level === 1 ? "⭐" : "⭐⭐⭐");
    c.dataset.id = a.id;
    return c;
  }));
}

// ── 畫畫頁 ──
async function startArt(a, work = null) {
  show("paint");
  $("#after").classList.remove("on");
  closePop();
  await board.load(a.url || ART_DIR + a.file);
  painter.reset();
  S.art = a; S.workId = work ? work.id : null; S.done = work ? !!work.done : false;
  if (work) {
    for (const [blob, ctx] of [[work.color, board.ctx], [work.glit, board.gctx]]) {
      if (!blob) continue;
      const bmp = await createImageBitmap(blob);
      ctx.clearRect(0, 0, board.W, board.H); ctx.drawImage(bmp, 0, 0);
    }
  }
}

async function saveWork() {
  const c = board.composite();
  const w = { id: S.workId || G.newId(), art: S.art.id, done: S.done, thumb: await G.thumbOf(c), image: await G.toBlob(c),
    color: await G.toBlob(board.color), glit: await G.toBlob(board.glit) };
  try { await G.save(w); S.workId = w.id; return true; }
  catch (e) {
    if (e.code !== "FULL") throw e;
    $("#full").classList.add("on");
    setTimeout(() => $("#full").classList.remove("on"), 2500);
    return false;
  }
}
function goHome() { $("#after").classList.remove("on"); show("home"); renderHome(S.art?.theme); }

$("#bDone").onclick = async () => {
  if (S.busy || !board.labels) return;
  S.busy = true; closePop(); fx.sparkleStop();
  await fx.finish(S.art.parts || []);
  S.done = true;
  await saveWork();
  $("#after").classList.add("on");
  fx.sparkleStart(); S.busy = false;
};
$("#aHome").onclick = goHome;
$("#aAgain").onclick = () => $("#after").classList.remove("on");
$("#bHome").onclick = async () => {
  if (S.busy) return;
  fx.flush(); closePop();
  if (painter.history.size) await saveWork();   // 有畫東西才存；沒畫完的作品牆會標 ✏️
  goHome();
};

$$(".tool").forEach(b => b.onclick = () => {
  const t = b.dataset.tool;
  if (S.tool === t && (t === "brush" || t === "sticker")) return togglePop(t);   // 已選的工具再點一次 → 開選單
  S.tool = t; closePop();
  $$(".tool").forEach(x => x.classList.toggle("on", x === b));
});
$("#bColor").onclick = () => togglePop("color");
$("#bMat").onclick = () => togglePop("mat");
$("#bClip").onclick = () => { S.clip = !S.clip; $("#bClip").classList.toggle("on", S.clip); };
$("#bUndo").onclick = () => { fx.flush(); painter.undo(); };
hold($("#bClear"), () => { fx.flush(); painter.clearAll(); });

function refreshBar() {
  $("#bColor .dot").style.background = S.color;
  const cv = $("#bMat canvas");
  cv.getContext("2d").drawImage(previewMat(S.mat, S.color, cv.width), 0, 0);
}

// ── 彈出選單 ──
let popKind = null;
function closePop() { popKind = null; $("#pop").classList.remove("on"); }
function togglePop(kind) { if (popKind === kind) closePop(); else renderPop(kind); }
function renderPop(kind) {
  popKind = kind;
  const P = $("#pop");
  P.replaceChildren();
  P.classList.add("on");
  if (kind === "color") for (const c of COLORS) {
    const b = button("sw" + (c === S.color ? " on" : ""), "", () => { S.color = c; refreshBar(); closePop(); }, c);
    b.style.background = c; P.append(b);
  }
  if (kind === "mat") for (const m of MATS) {
    const b = button("opt" + (m === S.mat ? " on" : ""), "", () => { S.mat = m; refreshBar(); closePop(); }, m.pattern || m.kind);
    b.append(previewMat(m, S.color, 120)); P.append(b);
  }
  if (kind === "brush") {
    const r1 = el("div", "row"), r2 = el("div", "row");
    for (const [id, icon] of BRUSHES) r1.append(button("opt" + (id === S.brush ? " on" : ""), icon, () => { S.brush = id; renderPop("brush"); }, id));
    SIZES.forEach((_, i) => r2.append(button("opt size" + (i === S.size ? " on" : ""),
      `<i style="width:${12 + i * 14}px;height:${12 + i * 14}px"></i>`, () => { S.size = i; renderPop("brush"); }, "size" + i)));
    P.append(r1, r2);
  }
  if (kind === "sticker") for (const s of STICKERS) {
    const b = button("opt" + (s.id === S.sticker ? " on" : ""), "", () => { S.sticker = s.id; closePop(); }, s.id), img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.svg);
    b.append(img); P.append(b);
  }
}

// ── 手勢：只認第一根手指畫畫；150 毫秒內放上第二根 → 取消那一筆改成縮放；之後才放上來的當手掌，不理 ──
const stage = $("#stage"), touches = new Map();
let g1 = null, pinch = null, lastTwoTap = 0;
const strokeOpts = () => ({ brush: S.tool === "eraser" ? "eraser" : S.brush, size: SIZES[S.size], mat: S.mat, color: S.color, clip: S.clip });

function startPinch() {
  const [a, b] = [...touches.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: board.view.s, img: board.toImage(mid.x, mid.y), mid0: mid, t: performance.now(), moved: 0 };
  if (g1) g1.mode = "pinch";
}
stage.addEventListener("pointerdown", e => {
  if (S.busy || !board.labels) return;
  closePop();
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 1) {
    g1 = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, mode: "tap" };
    if (S.tool === "brush" || S.tool === "eraser") {
      fx.flush();
      const pt = board.toImage(e.clientX, e.clientY);
      painter.strokeStart(pt.x, pt.y, strokeOpts());
      g1.mode = "draw";
    }
  } else if (touches.size === 2 && g1 && !pinch) {
    if (g1.mode === "tap") startPinch();
    else if (g1.mode === "draw" && performance.now() - g1.t < 150) { painter.strokeCancel(); startPinch(); }
  }
});
stage.addEventListener("pointermove", e => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size >= 2) {
    const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch.moved = Math.max(pinch.moved, Math.abs(d - pinch.d0), Math.hypot(mid.x - pinch.mid0.x, mid.y - pinch.mid0.y));
    board.zoomAt(pinch.img.x, pinch.img.y, mid.x, mid.y, pinch.s0 * d / pinch.d0);
    return;
  }
  if (!g1 || e.pointerId !== g1.id) return;
  g1.moved = Math.max(g1.moved, Math.hypot(e.clientX - g1.x, e.clientY - g1.y));
  if (g1.mode === "draw") {
    const evs = e.getCoalescedEvents?.() || [];   // iPad 一幀會合併好幾個點，全部畫才順
    for (const ev of evs.length ? evs : [e]) { const pt = board.toImage(ev.clientX, ev.clientY); painter.strokeMove(pt.x, pt.y); }
  }
});
function up(e) {
  if (!touches.has(e.pointerId)) return;
  touches.delete(e.pointerId);
  if (pinch) {
    if (touches.size === 0) {
      const now = performance.now();
      if (now - pinch.t < 250 && pinch.moved < 12) {   // 兩指輕點；連點兩下 → 回到原本大小
        if (now - lastTwoTap < 400) { board.fit(); lastTwoTap = 0; } else lastTwoTap = now;
      }
      pinch = null; g1 = null;
    }
    return;
  }
  if (!g1 || e.pointerId !== g1.id) return;
  const g = g1;
  g1 = null;
  if (g.mode === "draw") { if (e.type === "pointercancel") painter.strokeCancel(); else painter.strokeEnd(); return; }
  if (g.mode === "tap" && g.moved < 20 && e.type === "pointerup") tapAt(e.clientX, e.clientY);
}
stage.addEventListener("pointerup", up);
stage.addEventListener("pointercancel", up);

async function tapAt(cx, cy) {
  const pt = board.toImage(cx, cy);
  if (S.tool === "fill") {
    const id = painter.regionAt(pt.x, pt.y);
    if (id >= 0) fx.ripple(painter.fill(id, S.mat, S.color), pt.x, pt.y);
  } else if (S.tool === "sticker") {
    fx.flush();
    painter.sticker(await stickerImage(S.sticker), pt.x, pt.y, STICKER_SIZE[S.size]);
  }
}

// ── 作品牆 ──
let viewing = null, urls = [];
async function renderGallery() {
  show("gallery");
  urls.forEach(u => URL.revokeObjectURL(u));
  urls = [];
  const works = await G.list();
  $("#works").replaceChildren(...works.map(w => {
    const u = URL.createObjectURL(w.thumb);
    urls.push(u);
    return card(u, () => openWork(w), "", w.done ? "" : "✏️");
  }));
}
function openWork(w) {
  viewing = w;
  const u = URL.createObjectURL(w.image || w.thumb);
  urls.push(u);
  $("#vImg").src = u;
  $("#view").classList.add("on");
}
$("#toGallery").onclick = renderGallery;
$("#gBack").onclick = () => { show("home"); renderHome(); };
$("#gTip").onclick = () => $("#tip").classList.toggle("on");
$("#vClose").onclick = () => $("#view").classList.remove("on");
$("#vEdit").onclick = async () => {
  const a = INDEX.arts.find(x => x.id === viewing.art);
  $("#view").classList.remove("on");
  if (a) await startArt(a, viewing);
};
$("#vSave").onclick = () => G.saveToPhotos(viewing.image || viewing.thumb);
hold($("#vDel"), async () => { await G.remove(viewing.id); $("#view").classList.remove("on"); renderGallery(); });

// ── 開始 ──
window.addEventListener("resize", () => { if (board.labels && $("#paint").classList.contains("on")) board.fit(); });
window.__draw = { S, board, painter, fx, G, show, renderHome, startArt, renderGallery, COLORS };
(async () => {
  G.persist();
  refreshBar();
  INDEX = await (await fetch(ART_DIR + "index.json?v=1")).json();
  const art = Q.get("art");
  if (art) await startArt(INDEX.arts.find(a => ART_DIR + a.file === art) || { id: "dev", url: art, parts: [] });
  else { show("home"); renderHome(); }
})();
```

- [ ] **Step 7：寫畫面測試**（插在 `// ── 後續 task 的測試插在這一行上面 ──` 上面）

```js
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
```

- [ ] **Step 8：語法檢查**

Run：`for f in js/draw-canvas.js js/draw-paint.js js/draw.js; do node --input-type=module --check < $f && echo "$f OK"; done; node -e "JSON.parse(require('fs').readFileSync('IMAGE/draw/lineart/index.json','utf8'));console.log('index.json OK')"`
Expected：四行 OK

- [ ] **Step 9：跑全部測試**

Run：`node tools/draw-test/core.test.mjs && node tools/draw-test/ui.js`
Expected：兩支都「全部通過」。測試會從 Task 3 的 `?dev&art=` 直接開測試線稿；Task 9 這段走真正的首頁、工具列和作品牆。目視 `05-gallery.png`（兩張縮圖，一張有 ✏️）和 `06-paint.png`（右側工具列由上到下：✔️ 🏠 🪣 🖍️ ⭐ 🧽 顏色 材質 🛡️ ↩️ 🗑️）。

- [ ] **Step 10：Commit**

```bash
git add -- IMAGE/draw/lineart/index.json js/draw-canvas.js js/draw-paint.js draw.html css/draw.css js/draw.js tools/draw-test/ui.js
git commit -m "畫畫遊戲：首頁、工具列、手勢、完成與作品牆畫面" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10：線稿檢查與清理工具

**Files:**
- Create: `tools/draw-test/lineart-check.js`

用途：AI 生的線稿常有兩種毛病：(1) 黑線交叉處被抗鋸齒圍出幾個像素的白色碎塊，填色後會變成黑線上的白點；(2) 線條有缺口，兩塊連成一片。`--fix` 會把圖放大到長邊 2048、把小於 50 像素的碎塊塗黑；第 (2) 種只能看預覽圖用眼睛找，再請 AI 重生或手動補線。

- [ ] **Step 1：寫 `tools/draw-test/lineart-check.js`**

```js
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
```

- [ ] **Step 2：用測試線稿試跑**（SVG 長邊本來就是 2048、6 塊，所以等級 1 會報「塊數 6 不在 8～15」，這是預期的）

Run：`node tools/draw-test/lineart-check.js IMAGE/draw/lineart/test-shapes.svg 1`
Expected：`❌ test-shapes  2048×1536  6 塊`，問題只有「塊數 6 不在 8～15」。打開預覽圖：6 塊各一種顏色、黑線分得很清楚。

- [ ] **Step 3：Commit**

```bash
git add -- tools/draw-test/lineart-check.js
git commit -m "畫畫遊戲：線稿檢查與清理工具" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11：生成 8 張正式線稿（主對話自己做，不派 subagent）

這一步要用 ChatGPT 網頁版生圖，還要用眼睛判斷線條有沒有封好、零件座標放對沒有。視覺判斷交給 subagent 會被敷衍宣告（見全域 lessons-log 2026-09-08），所以一律由主對話親自做。

**Files:**
- Create: `IMAGE/draw/lineart/{animal-1,animal-2,vehicle-1,vehicle-2,dino-1,dino-2,fairy-1,fairy-2}.png`
- Modify: `IMAGE/draw/lineart/index.json`

| id | 主題 | 難度 | 畫什麼 | 零件動作 |
|---|---|---|---|---|
| animal-1 | animal | 1 | 坐著的小貓 | 眨眼、尾巴 wag |
| animal-2 | animal | 2 | 大象和停在鼻子上的小鳥，草地與太陽背景 | 眨眼、鼻子 sway |
| vehicle-1 | vehicle | 1 | 側面的圓圓小汽車 | 兩個輪子 spin |
| vehicle-2 | vehicle | 2 | 蒸汽火車頭加兩節車廂，鐵軌和雲 | 輪子 spin、煙 sway |
| dino-1 | dino | 1 | 胖胖的小暴龍 | 眨眼、尾巴 wag |
| dino-2 | dino | 2 | 長頸龍和冒煙的火山，蕨類植物背景 | 頭 sway、煙 sway |
| fairy-1 | fairy | 1 | 獨角獸 | 眨眼、尾巴 wag |
| fairy-2 | fairy | 2 | 城堡前的公主，旗子和花 | 裙子 sway、旗子 wag |

提示詞裡「畫什麼」的英文：
- animal-1：`a cute kitten sitting and facing forward, with a long curled tail`
- animal-2：`a baby elephant standing on grass, a small bird perched on its raised trunk, a big sun and two clouds in the sky`
- vehicle-1：`a round chubby little car seen from the side, with two big wheels`
- vehicle-2：`a steam locomotive pulling two carriages on railway tracks, a puff of smoke from the chimney, clouds in the sky`
- dino-1：`a chubby baby T-rex standing, with a big tail`
- dino-2：`a long-necked dinosaur next to a smoking volcano, with ferns and rocks in the foreground`
- fairy-1：`a cute unicorn standing, with a flowing mane and tail and a star on its side`
- fairy-2：`a princess in a big puffy dress in front of a castle with flags on the towers, flowers on the ground`

- [ ] **Step 1：生圖**——照 GAME DIY 記憶 `project-art-regen-gpt.md` 的 GPT 生圖流程（連常駐自動化 Chrome 9222、ChatGPT 對話命名「克勞德-GAME」、一個對話生 3～4 張就換新對話、用 CDP 在頁面內 fetch 轉 base64 取回原圖）。提示詞（英文給 GPT）：

```
Children's coloring page, {畫什麼的英文}, cute ORIGINAL character (not based on any existing brand or show).
Pure white background. Thick, clean, uniform black outlines (about 10 px). NO shading, NO gray, NO hatching, NO texture, NO text.
Every shape must be a fully closed outline so it can be bucket-filled.
{簡單：Very simple, about 10 large areas, big shapes for a 3-year-old. / 困難：Detailed with a background scene, about 40 areas, still no tiny gaps.}
Landscape 3:2.
```

存成 `IMAGE/draw/lineart/<id>.png`。

- [ ] **Step 2：清理與檢查**（每張都做）

Run：`node tools/draw-test/lineart-check.js IMAGE/draw/lineart/<id>.png <1|2> --fix`，然後不帶 `--fix` 再跑一次。
用 Read 打開預覽圖 `%TEMP%\draw-lineart-check\<id>-check.png` 親自看：主體和背景是不是不同顏色、眼睛和身體是不是不同顏色、有沒有兩塊同色連在一起（＝漏縫）。有漏縫就重生，同一張重生兩次還漏，就改提示詞（例如加 "thicker lines"）。

- [ ] **Step 3：寫進 `index.json`**——在 `arts` 陣列中、`test-shapes` 前面加 8 筆，格式如下（`at` 座標從預覽圖量：用 Read 看圖、對照長邊 2048 換算）：

```json
{ "id": "animal-1", "file": "animal-1.png", "theme": "animal", "level": 1,
  "parts": [{ "type": "blink", "at": [[860, 560], [1120, 560]] }, { "type": "wag", "at": [[1500, 900]], "pivot": [1380, 980], "deg": 15 }] }
```

上面的座標只是格式示範，每張都要依實際圖量。眨眼的 `at` 要點在眼白或眼珠那幾塊。

- [ ] **Step 4：逐張看完成動畫**——每張用 `draw.html?dev&art=IMAGE/draw/lineart/<id>.png` 開，填幾塊顏色後按完成，在動畫第 0.4 秒（眨眼中）和第 1.0 秒截圖，親自看：眨眼的位置對不對、會轉的輪子是不是繞中心轉、擺動的零件有沒有拖著奇怪的破洞。不對就改 `index.json` 的 `at`／`pivot`／`deg`。

- [ ] **Step 5：全部檢查**

Run：`node tools/draw-test/lineart-check.js`
Expected：8 張全部 ✅

- [ ] **Step 6：Commit**（PNG 是新檔，`git status --short -- IMAGE/draw/lineart/` 要看到 8 個 `A` 才算加到）

```bash
git add -- IMAGE/draw/lineart/animal-1.png IMAGE/draw/lineart/animal-2.png IMAGE/draw/lineart/vehicle-1.png IMAGE/draw/lineart/vehicle-2.png IMAGE/draw/lineart/dino-1.png IMAGE/draw/lineart/dino-2.png IMAGE/draw/lineart/fairy-1.png IMAGE/draw/lineart/fairy-2.png IMAGE/draw/lineart/index.json
git status --short -- IMAGE/draw/lineart/
git commit -m "畫畫遊戲：8 張原創線稿" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12：驗收、審查、上線、交給阿葉試玩

- [ ] **Step 1：全部測試**

Run：`node tools/draw-test/core.test.mjs && node tools/draw-test/ui.js && node tools/draw-test/lineart-check.js`
Expected：三支都通過

- [ ] **Step 2：效能量測**（headless 電腦版，iPad 會比較慢，結果寫進回報）

建立 `tools/draw-test/perf.js`：

```js
// 畫畫遊戲效能：開圖切塊、填色各要多久（電腦 headless，iPad 約慢 2～3 倍）
// 先開本機伺服器：python -m http.server 8765 --bind 127.0.0.1；用法：node tools/draw-test/perf.js [線稿id]
const path = require("path"), fs = require("fs");
const G = require("child_process").execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(G, "@playwright/mcp/node_modules/playwright"));
const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = path.join(base, fs.readdirSync(base).filter(n => n.startsWith("chromium_headless_shell-")).sort().pop(), "chrome-headless-shell-win64", "chrome-headless-shell.exe");
(async () => {
  const id = process.argv[2] || "animal-2";
  const browser = await chromium.launch({ headless: true, executablePath: shell });
  const p = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  await p.goto("http://127.0.0.1:8765/draw.html?dev");
  await p.waitForFunction(() => window.__draw && document.querySelector("#arts .card"));
  const r = await p.evaluate(async id => {
    const a = (await (await fetch("IMAGE/draw/lineart/index.json?v=1")).json()).arts.find(x => x.id === id);
    let t = performance.now(); await __draw.startArt(a); const load = performance.now() - t;
    const P = __draw.painter, ids = __draw.board.boxes.map((b, i) => [b.area, i]).sort((x, y) => y[0] - x[0]).slice(0, 5).map(x => x[1]);
    t = performance.now(); for (const i of ids) P.fill(i, { kind: "glitter" }, "#1e88e5").done(); const fill = (performance.now() - t) / ids.length;
    return { load: Math.round(load), fill: Math.round(fill), regions: __draw.board.boxes.length };
  }, id);
  console.log(`${id}：${r.regions} 塊，開圖切塊 ${r.load} 毫秒（目標 < 500），最大 5 塊平均填色 ${r.fill} 毫秒（目標 < 100）`);
  await browser.close();
})();
```

Run：`node tools/draw-test/perf.js animal-2 && node tools/draw-test/perf.js fairy-2`
Expected：兩張都在目標內（規格第 10 節）。超過的話先回報，不要自己改架構。最後把 `tools/draw-test/perf.js` 一起 commit。

- [ ] **Step 3：查證 Safari 7 天規則**（規格第 8 節要求）——WebSearch 查 WebKit 現在是否仍會刪除 7 天沒開的網站資料、加到主畫面的網頁是否不受影響，附來源和日期。結果和規格不同時，修正 `draw.html` 的 `#tip` 文字與規格第 8 節。

- [ ] **Step 4：審查**——主對話派兩位審查官（可以同時派），附上這份計畫和規格的路徑：
  - 里維（前端程式）：`js/draw*.js`、`draw.html`、`css/draw.css`
  - 寧次（畫面好不好用）：開 `http://127.0.0.1:8765/draw.html?dev` 實際截圖審
  - 收到意見後逐條判斷，要修的修完再跑一次 Step 1

- [ ] **Step 5：push 前檢查**——確認這次要上線的 commit 沒有夾帶刪除：

Run：`git fetch origin && git diff --name-status origin/master..HEAD | grep -E '^D' || echo "沒有刪除"`
Expected：`沒有刪除`。有任何 `D` 都停下來，不要 push。

- [ ] **Step 6：push 並確認線上**

Run：`git push origin master`，等 GitHub Pages 部署完（約 1～2 分鐘）後，用 `curl -s -o /dev/null -w "%{http_code}" "https://newyear83101234.github.io/motion-party-game/draw.html?nc=$(date +%s)"` 確認回 200，再跑一次 `DRAW_URL=https://newyear83101234.github.io/motion-party-game/draw.html node tools/draw-test/ui.js`（會在線上版寫入測試作品，但作品只存在 headless 瀏覽器裡、關掉就沒了）。

- [ ] **Step 7：交給阿葉**——給線上網址，請阿葉用 iPad 實際玩，並建議先「加入主畫面」。同時更新 GAME DIY 記憶 `project-drawing-game.md`（線上網址、完成狀態、待辦），以及規格第 9 節的檔名（實作時把 `draw-tools.js` 拆成 `draw-canvas.js`、`draw-paint.js`、`draw-stickers.js`）。

