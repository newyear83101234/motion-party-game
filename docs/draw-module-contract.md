# 新模組共同規格（今晚平行開發用）

專案：D:\Claude\Projects\GAME DIY\ 的兒童著色遊戲 draw.html（先讀 overnight/brief.md 了解遊戲）。iPad 橫向、3～10 歲、不認字、全用圖示。

## 你只能新增檔案，不能改任何既有檔案
- 可以新增：`js/draw-<名稱>.js`、`css/draw-<名稱>.css`、`tools/draw-test/<名稱>-harness.html`、`tools/draw-test/<名稱>.js`（測試）
- 不准改：draw.html、js/draw.js、css/draw.css 與其他既有 js（主對話會另外接線）。另一個分身同時在做別的模組，碰既有檔會互相蓋掉。
- 不准 git add / commit。

## 模組長相
- ES module，**不 import 任何既有模組**（版號會變），需要的東西都從 `deps` 傳進來。
- 匯出一個 `mountXxx(deps)`，呼叫一次：自己建立畫面 DOM（`<section id="xxx" class="screen">` append 到 body）、自己插入 CSS：`<link rel="stylesheet" href="css/draw-xxx.css?v=` + deps.v + `">`。回傳一個物件（各模組規格另訂）。
- deps 一定會有：
  - `v`：目前版號字串（例 "7"）
  - `show(id)`：切換畫面（把 id 相符的 `.screen` 加上 `.on`、其他拿掉；離開畫畫頁時會收掉全螢幕與提示）
  - `A`：聲音 API：`A.sfx(name, {gain})`（name 可用 tap/pick/fill/sticker/undo/clear/open/finish/save/magic/pop）、`A.note(i, {gain, dur})`（i 是五聲音階第幾個音，0～20，越大越高）、`A.chime(gain)`、`A.strokeOn(brushName)`／`A.strokeSpeed(v)`（v 約 0～3，手速）／`A.strokeOff()`（畫筆沙沙聲）
  - `Particles`：粒子類別，`new Particles(hostEl)` 會在 hostEl 上疊一層透明畫布；方法：`trail(clientX, clientY, {brush, color})`、`splash(clientX, clientY, color|null)`、`stars(clientX, clientY, size)`；`fit()` 在大小改變時呼叫
  - `toast(text, ms)`：畫面中間跳一個短訊息
  - `onHome()`：回首頁（模組裡的 🏠 按鈕呼叫它）
- 按鈕：一律用 `<button>`，用 `onclick` 綁動作。主程式已有全域機制：手指放開就觸發 click、自動播按鈕音效（`data-sfx="none"` 可關掉、或指定其他音效名）。所以你的按鈕不用自己處理 pointerup。要「按住才觸發」的按鈕加 class `hold`，自己用 pointerdown/up 計時 1 秒。
- 樣式：沿用 css/draw.css 的設計變數與按鈕 class（先讀它）：`.btn`（工具列方鈕）、`.big`（大圓角鈕）、變數 `--sun --tomato --mint --sky --lift --press --spring` 等。圖示先用 emoji 或內嵌 SVG；主對話之後會換成統一的立體圖示，所以每顆按鈕給**固定 id**。
- 觸控：畫布 `touch-action: none`；只認第一根手指，其他手指（手掌）不理。
- 不准用 localStorage 以外的持久化（作品牆由主程式負責）；localStorage 讀寫一律 try/catch，壞資料要能自己復原成預設值。
- 程式風格：跟既有 js 一樣——繁體中文註解寫「為什麼」、精簡、2 格縮排、雙引號。

## 測試（必做，完成的定義）
- 寫 `tools/draw-test/<名稱>-harness.html`：載入你的模組，用假的 deps（A 全是空函式並記錄呼叫、Particles 用簡單假物件、show 自己切 class）把畫面開起來。
- 寫 `tools/draw-test/<名稱>.js`：Playwright 無頭測試，照 tools/draw-test/ui.js 開頭的寫法找 playwright 與 chrome-headless-shell，連 `http://127.0.0.1:8765/tools/draw-test/<名稱>-harness.html`（本機伺服器已在跑），viewport 1180×820、hasTouch。逐項 `check(名稱, 條件)` 印 ✅/❌，最後全過印「全部通過」並 exit 0，有失敗 exit 1。至少 12 項，涵蓋主要操作、邊界（壞掉的 localStorage、連點、視窗大小改變）、沒有 pageerror。
- 截圖：測試裡在關鍵畫面截圖存到 `tools/draw-test/_review/<名稱>/`，完成後自己用 Read 看圖確認畫面美觀、沒有跑版。
- ES module 語法檢查：把 js 複製成 .mjs 到暫存資料夾再 `node --check`（直接 check .js 抓不到模組語法錯）。

## 回報（≤30 行）
改了哪些檔、匯出的 API（簽名＋一句話）、測試結果原文最後 5 行、截圖路徑、還沒做到或有疑慮的地方。不要貼整段程式碼。
