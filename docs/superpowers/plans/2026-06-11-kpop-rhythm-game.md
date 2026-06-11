# 獵魔女團 K-pop 節奏打魔 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在現有 motion-party-game 合集新增第四個遊戲：小孩本人入鏡變身獵魔女團，惡魔踩著 K-pop 戰歌的拍子走來，提早擺好舞蹈姿勢用唱歌光波轟掉，無命制、歌唱完按表現給星。

**Architecture:** 沿用現有單檔 `js/game.js` 狀態機與繪製管線，新增 `currentGame="kpop"`。音訊用 Web Audio（`AudioBufferSourceNode` + `audioCtx.currentTime` 當唯一真時鐘）驅動拍點與惡魔位置、rAF 只負責畫面。歌曲為 GOLDEN 原曲經 AES-GCM 加密成 `.enc`（原始 mp3 永不進 git），首次遊玩輸密碼解密。拍點表（beatmap）以「拍號」標注。判定哲學：拍點時姿勢已就位＝PERFECT。

**Tech Stack:** 純 HTML/Canvas/JS（無框架無打包）、MediaPipe PoseLandmarker（已封裝於 pose-detector.js）、Web Crypto（SubtleCrypto AES-GCM + PBKDF2）、Web Audio API。Python（cryptography 套件）做本機加密工具。驗證用 node --check + Playwright（假鏡頭 stub）。

**驗證慣例（本專案無測試框架，每個 task 結尾照此）：**
1. `node --check js/game.js`（必過）
2. 必要時本機 `python -m http.server 8099` + Playwright stub getUserMedia → 截圖確認渲染、`browser_console_messages` 零 JS 錯誤
3. `git add <自己的檔>` → commit（commit 尾巴 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`）
4. 需要上線時：`GIT_TERMINAL_PROMPT=0 git push origin HEAD:master` → 輪詢 curl 確認線上更新

**重要原則（設計文件）：** Phase 0-3「零美術」先用現成 `zombie.png` 當惡魔墊著、沿用現有 6 姿勢，做出可玩原型給阿葉手機測手感；手感對了才進 Phase 4 接美術。

---

## File Structure

- **Modify** `js/game.js`：新增 kpop 遊戲全部邏輯（狀態變數、beatmap、音訊時鐘、生成/判定/繪製、選單第 4 卡、loop 分派）。沿用現有 `senseBody`/`poseMatch`/`anyPoseMatch`/`burst`/`addFloat`/`drawPersonMasked`/`fpsTick`/`lsGet`/`lsSet`。
- **Modify** `index.html`：無（沿用單一進入點）。
- **Create** `tools/encrypt_song.py`：本機加密工具，把原始 mp3 → `MUSIC/kpop_song.enc`（AES-GCM）。
- **Create** `js/song-crypto.js`：ES module，匯出 `decryptSong(encBytes, password)` → 回 ArrayBuffer（解密後的 mp3 bytes）。獨立檔好單獨驗證、且不污染 game.js。
- **Modify** `.gitignore`：還原並加入原始音檔忽略規則（`*.mp3` 原檔、`tools/_src_song/`）。
- **Asset（阿葉產）** `MUSIC/kpop_song.enc`（加密歌）、後續 `IMAGE/stage_kpop.png`、惡魔/紫髮/Boss 圖。

**kpop 狀態命名空間（全部加 `kp` 前綴避免與現有衝突）：** `kpDemons`、`kpBeatmap`、`kpSongTime`、`kpT0`、`kpAudioBuf`、`kpSource`、`kpStars`、`kpStolen`、`kpPerfect`、`kpGood`、`kpNoteIdx`、`kpStage`、`kpBossCharge`、`kpPwOK`、`kpPwBuf`。

---

## Phase 0：腳手架（讓第四張卡能進、畫面有東西、零美術零音訊）

### Task 0.1：選單改 2×2 四卡佈局 + 新增 kpop 卡

**Files:**
- Modify: `js/game.js`（`menuCards()` 約 834-841、`drawMenu()` 約 842-853、`bestPvz` 同層加 `bestKpop`）

- [ ] **Step 1：新增 best 變數**

在 `js/game.js` 找到（約 133 行）：
```js
let bestWhack = 0, bestDodge = 0, bestPvz = 0;   // 最高分（localStorage）
```
改成：
```js
let bestWhack = 0, bestDodge = 0, bestPvz = 0, bestKpop = 0;   // 最高分（localStorage）
```

- [ ] **Step 2：載入 bestKpop**

Grep `bestPvz = lsGet` 找到讀取最高分處，照同模式加一行 `bestKpop = lsGet("best_kpop");`（緊接 bestPvz 那行之後）。

- [ ] **Step 3：menuCards 改 2×2 佈局**

把整個 `menuCards()` 函式替換為：
```js
function menuCards() {
  const cw = W * 0.4, ch = H * 0.3, gapX = W * 0.04, gapY = H * 0.035;
  const x0 = (W - cw * 2 - gapX) / 2, y0 = H * 0.22;
  const r1y = y0, r2y = y0 + ch + gapY;
  return [
    { x: x0,            y: r1y, w: cw, h: ch, game: "whack", bg: cityImg,  border: "rgba(90,170,255,0.95)", tint: "rgba(20,40,90,0.45)",  i1: "👊", i2: "🦖", best: bestWhack },
    { x: x0 + cw + gapX, y: r1y, w: cw, h: ch, game: "dodge", bg: spaceImg, border: "rgba(190,110,255,0.95)", tint: "rgba(40,20,80,0.45)",  i1: "🏃", i2: "☄️", best: bestDodge },
    { x: x0,            y: r2y, w: cw, h: ch, game: "pvz",   bg: lawnImg,  border: "rgba(120,210,90,0.95)", tint: "rgba(20,70,20,0.45)",  i1: "🏃", i2: "🧟", best: bestPvz },
    { x: x0 + cw + gapX, y: r2y, w: cw, h: ch, game: "kpop",  bg: stageKpopImg, border: "rgba(255,80,200,0.95)", tint: "rgba(70,10,60,0.5)", i1: "🎤", i2: "👿", best: bestKpop },
  ];
}
```

- [ ] **Step 4：宣告 stageKpopImg 佔位圖**

在 `js/game.js` 圖片宣告區（grep `lawnImg = new Image`）附近加：
```js
const stageKpopImg = new Image(); stageKpopImg.src = "IMAGE/sprites/stage_kpop.png"; // K-pop 舞台背景（阿葉後製、缺圖時卡片用程式底色）
```
（缺圖時 `drawCard` 已有 `imgReady` 判斷會 fallback，不會壞。）

- [ ] **Step 5：選單標題徽章與模式鈕位置不擋卡**

`drawMenu()` 內模式鈕 `my = H * 0.9` 維持；logo 在 `H*0.03`。2×2 卡片 y 範圍 0.22~約 0.59+0.3=0.89，會與模式鈕 0.9 接近但不重疊（卡底 0.59+0.3≈... 重新核算：r2y=0.22+0.3+0.035=0.555、底=0.555+0.3=0.855；模式鈕中心 0.9 半徑 ~0.085 → 頂 ~0.815，會與卡底 0.855 重疊）。**修正：** 把 `menuCards` 的 `y0 = H * 0.20`、`ch = H * 0.28`，使 r2 底 = 0.20+0.28+0.035+0.28 = 0.795，模式鈕頂 0.815，不重疊。將 Step 3 的 `ch = H * 0.3` 改 `H * 0.28`、`y0 = H * 0.22` 改 `H * 0.20`。

- [ ] **Step 6：node 語法檢查**

Run: `cd "D:\Claude\Projects\GAME DIY" && node --check js/game.js`
Expected: 無輸出（通過）

- [ ] **Step 7：Playwright 冒煙（選單顯示 4 卡）**

啟動 `python -m http.server 8099`，Playwright navigate `http://localhost:8099/index.html`，evaluate stub getUserMedia（用本 session 驗證過的假 canvas 串流寫法）+ dispatch pointerdown 進選單，截圖。
Expected: 看到 2×2 四張卡，第四張 🎤👿（背景為粉紫程式底色，因無 stage_kpop.png）。console 僅 favicon/stage_kpop.png 404，無 JS 錯誤。

- [ ] **Step 8：Commit**

```bash
git add js/game.js
git commit -m "kpop Phase0.1: 選單改2x2四卡+新增獵魔女團卡(🎤👿)"
```

---

### Task 0.2：kpop 狀態變數 + start/reset + loop 分派（進得去、畫純色佔位）

**Files:**
- Modify: `js/game.js`（狀態變數區 ~137、start 函式區 ~309-318、`pickGame` ~319、loop 分派 ~1604）

- [ ] **Step 1：宣告 kpop 狀態變數**

在 runner 狀態變數（`let runnerObjs ...`）之後新增一段：
```js
// 獵魔女團 K-pop 節奏狀態（kp 前綴）
let kpDemons = [], kpBeatmap = null, kpAudioBuf = null, kpSource = null;
let kpT0 = 0, kpSongTime = 0, kpNoteIdx = 0;
let kpStars = 0, kpStolen = 0, kpPerfect = 0, kpGood = 0;
let kpStage = "intro", kpBossCharge = 0; // intro|verse|chorus|bridge|boss|done
let kpPwOK = false, kpPwBuf = "";          // 密碼門：是否通過 / 已輸入緩衝
const KP_SONG_BPM = 123, KP_SONG_OFFSET = 0; // GOLDEN 實測 123BPM、offset 由 beatmap task 量測填入
```

- [ ] **Step 2：resetKpop + startKpop**

在 `startPvz()` 函式之後新增：
```js
function resetKpop() {
  score = 0; combo = 0; bestCombo = 0;
  particles = []; floatTexts = []; shake = 0; bombFx = 0; gameOverPending = false;
  kpDemons = []; kpNoteIdx = 0; kpStars = 0; kpStolen = 0; kpPerfect = 0; kpGood = 0;
  kpStage = "intro"; kpBossCharge = 0; kpSongTime = 0; elapsed = 0;
  prevHands = []; punchSpeed = 0; poseFrame = 0; lastSenseTs = 0; noPersonT = 0; pvzTarget = null;
}
function startKpop() {
  currentGame = "kpop"; resetKpop();
  if (!kpPwOK) { state = "kppassword"; return; }   // 沒解過密碼 → 先進密碼門
  startKpopSong();                                  // 已解 → 直接開歌（Task 1.x 實作）
}
```

- [ ] **Step 3：startKpopSong 暫時佔位**

先放一個最小可跑版本（Task 1.3 會替換成真音訊）：
```js
function startKpopSong() {
  state = "playing";
  kpT0 = (audioCtx ? audioCtx.currentTime : performance.now() / 1000); // 暫用，Task 1.3 接真音訊
}
```

- [ ] **Step 4：pickGame 加 kpop 分支**

找到 `function pickGame(g) {`，改成：
```js
function pickGame(g) { if (g === "dodge") startDodge(); else if (g === "pvz") startPvz(); else if (g === "kpop") startKpop(); else startWhack(); }
```

- [ ] **Step 5：loop playing 分派加 kpop**

找到 loop 內 `else if (currentGame === "pvz") { updateRunner(dt); drawRunnerPlaying(); }`，其後加：
```js
    else if (currentGame === "kpop") { updateKpop(dt); drawKpopPlaying(); }
```
並在 loop 的 state 分派加密碼門：找到 `else if (state === "error") drawError();`，其後加：
```js
    else if (state === "kppassword") drawKpPassword();
```

- [ ] **Step 6：updateKpop / drawKpopPlaying / drawKpPassword 最小佔位**

在 runner 繪製區之後新增三個佔位函式（之後 task 逐步充實）：
```js
function updateKpop(dt) {
  poseFrame++;
  if (poseFrame % 2 === 0) { senseBody(); }
  elapsed += dt;
  if (score >= 0 && kpStage === "done") { commitBest(); state = "win"; }
}
function drawKpopPlaying() {
  ctx.fillStyle = "#2a0a2e"; ctx.fillRect(0, 0, W, H); // 佔位舞台底色
  drawHUD();
}
function drawKpPassword() {
  ctx.fillStyle = "#1a0820"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${shortSide() * 0.12}px sans-serif`; ctx.fillText("🔒", W / 2, H * 0.3);
}
```

- [ ] **Step 7：node 語法檢查**

Run: `node --check js/game.js` → 通過

- [ ] **Step 8：Playwright 冒煙（點第四卡進密碼門佔位）**

進選單後 dispatch pointerdown 在第四卡位置（2×2 右下，約 W*0.72, H*0.65），截圖。
Expected: 看到 🔒 密碼門佔位畫面（因 kpPwOK=false）。console 無 JS 錯誤。

- [ ] **Step 9：Commit**

```bash
git add js/game.js
git commit -m "kpop Phase0.2: kp狀態+start/reset+loop分派+密碼門佔位(進得去)"
```

---

## Phase 1：音樂加密管線 + 密碼門 + 音訊時鐘

### Task 1.1：本機加密工具 encrypt_song.py + .gitignore

**Files:**
- Create: `tools/encrypt_song.py`
- Modify: `.gitignore`（本機已刪、需還原）

- [ ] **Step 1：還原 .gitignore 並加音檔忽略**

Write `.gitignore`（內容）：
```
# 原始音檔（版權：加密後才上傳，原檔永不進 git）
tools/_src_song/
*.rawmp3
# 測試暫存
.playwright-mcp/
*-check.png
```
（註：加密輸出檔副檔名 `.enc` 不在忽略內、要上傳。原始檔請阿葉放 `tools/_src_song/` 或命名 `*.rawmp3`。）

- [ ] **Step 2：寫加密工具**

Create `tools/encrypt_song.py`：
```python
# -*- coding: utf-8 -*-
"""
encrypt_song.py — 把原始 mp3 用密碼加密成 .enc（與前端 Web Crypto 對齊）。
方案：PBKDF2-HMAC-SHA256(密碼, salt, 200000 次) 派生 256-bit 金鑰 → AES-256-GCM。
輸出檔結構（純 bytes 串接）：salt(16) || iv(12) || ciphertext(含 GCM tag)。
原始 mp3 永不進 git；本工具只在本機跑。
用法：python tools/encrypt_song.py <原始mp3路徑> <密碼>
"""
import sys, os
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

OUT = r"d:\Claude\Projects\GAME DIY\MUSIC\kpop_song.enc"
ITER = 200000

def main():
    if len(sys.argv) < 3:
        print("用法：python tools/encrypt_song.py <原始mp3路徑> <密碼>"); return
    src, pw = sys.argv[1], sys.argv[2]
    data = open(src, "rb").read()
    salt = os.urandom(16)
    iv = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER)
    key = kdf.derive(pw.encode("utf-8"))
    ct = AESGCM(key).encrypt(iv, data, None)  # 回傳 ciphertext||tag
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "wb").write(salt + iv + ct)
    print(f"OK 加密完成 -> {OUT}  ({len(salt+iv+ct)} bytes, 原始 {len(data)} bytes)")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3：驗證工具可跑（用假資料）**

Run:
```bash
cd "D:\Claude\Projects\GAME DIY" && python -c "import cryptography; print('cryptography OK')" || pip install cryptography
printf 'FAKEAUDIODATA12345' > tools/_fake.rawmp3
python tools/encrypt_song.py tools/_fake.rawmp3 1234
```
Expected: 印出 `OK 加密完成 -> ...kpop_song.enc (... bytes ...)`。

- [ ] **Step 4：清理假檔（不留 enc 佔位，避免誤上線壞檔）**

Run: `rm -f tools/_fake.rawmp3 "MUSIC/kpop_song.enc"`

- [ ] **Step 5：Commit（只加工具與 gitignore，不含任何音檔）**

```bash
git add tools/encrypt_song.py .gitignore
git status --short  # 確認沒有任何 .mp3/.rawmp3/.enc 被暫存
git commit -m "kpop Phase1.1: 本機歌曲加密工具(AES-GCM+PBKDF2)+還原.gitignore"
```

---

### Task 1.2：前端解密模組 song-crypto.js

**Files:**
- Create: `js/song-crypto.js`

- [ ] **Step 1：寫解密模組（與 Python 對齊）**

Create `js/song-crypto.js`：
```js
/**
 * song-crypto.js — 用密碼解密 .enc 歌曲檔（對齊 tools/encrypt_song.py）。
 * 檔案結構：salt(16) || iv(12) || ciphertext(含GCM tag)。
 * PBKDF2-HMAC-SHA256 200000 次派生 AES-256-GCM 金鑰。
 */
const ITER = 200000;
export async function decryptSong(encBytes, password) {
  const buf = new Uint8Array(encBytes);
  const salt = buf.slice(0, 16);
  const iv = buf.slice(16, 28);
  const ct = buf.slice(28);
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  // 解密失敗（密碼錯）會 throw → 呼叫端 catch 當作密碼錯誤
  return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); // 回 ArrayBuffer（mp3 bytes）
}
```

- [ ] **Step 2：node 語法檢查（ESM）**

Run: `cp js/song-crypto.js js/_chk.mjs && node --check js/_chk.mjs && rm js/_chk.mjs && echo OK`
Expected: OK

- [ ] **Step 3：Round-trip 驗證（Python 加密 → Node 解密還原）**

Run（建立臨時驗證腳本）:
```bash
cd "D:\Claude\Projects\GAME DIY"
printf 'HELLO-KPOP-ROUNDTRIP' > tools/_rt.rawmp3
python tools/encrypt_song.py tools/_rt.rawmp3 mypass
node --input-type=module -e "
import { webcrypto } from 'node:crypto'; globalThis.crypto = webcrypto;
import fs from 'node:fs';
const { decryptSong } = await import('./js/song-crypto.js');
const enc = fs.readFileSync('MUSIC/kpop_song.enc');
const out = await decryptSong(enc.buffer.slice(enc.byteOffset, enc.byteOffset+enc.byteLength), 'mypass');
console.log('解密還原:', new TextDecoder().decode(out));
try { await decryptSong(enc.buffer.slice(enc.byteOffset, enc.byteOffset+enc.byteLength), 'wrongpw'); console.log('ERROR 錯密碼竟成功'); } catch(e){ console.log('錯密碼正確被拒'); }
"
rm -f tools/_rt.rawmp3 MUSIC/kpop_song.enc
```
Expected: 印出 `解密還原: HELLO-KPOP-ROUNDTRIP` 與 `錯密碼正確被拒`。

- [ ] **Step 4：Commit**

```bash
git add js/song-crypto.js
git commit -m "kpop Phase1.2: 前端解密模組song-crypto.js(對齊Python、round-trip驗證過)"
```

---

### Task 1.3：密碼門 UI + 解密 + 音訊解碼 + 時鐘

**Files:**
- Modify: `js/game.js`（import song-crypto、drawKpPassword 充實、密碼輸入 pointerdown、startKpopSong 接真音訊、updateKpop 用 audio clock）

- [ ] **Step 1：在 game.js 頂部 import 解密模組**

game.js 開頭（grep 現有 `import` 行，與 camera/pose-detector import 同處）加：
```js
import { decryptSong } from "./song-crypto.js";
```

- [ ] **Step 2：密碼門畫面（數字鍵盤、零中文）**

替換佔位 `drawKpPassword()`：
```js
function kpPadKeys() {            // 3x4 數字鍵盤格子座標
  const keys = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];
  const cols = 3, gw = shortSide() * 0.2, gh = gw * 0.72, gap = shortSide() * 0.03;
  const totalW = cols * gw + (cols - 1) * gap, x0 = (W - totalW) / 2, y0 = H * 0.4;
  return keys.map((k, i) => {
    const c = i % cols, r = (i / cols) | 0;
    return { k, x: x0 + c * (gw + gap), y: y0 + r * (gh + gap), w: gw, h: gh };
  });
}
function drawKpPassword() {
  ctx.fillStyle = "#1a0820"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff"; ctx.font = `${shortSide() * 0.12}px sans-serif`;
  ctx.fillText("🔒🎵", W / 2, H * 0.18);
  // 已輸入：顯示為圓點
  ctx.fillStyle = "#ff7fdc"; ctx.font = `${shortSide() * 0.08}px sans-serif`;
  ctx.fillText("•".repeat(kpPwBuf.length) || "▢▢▢▢", W / 2, H * 0.3);
  for (const g of kpPadKeys()) {
    ctx.fillStyle = "rgba(255,255,255,0.12)"; roundRectFill(g.x, g.y, g.w, g.h, g.w * 0.12);
    ctx.fillStyle = g.k === "✓" ? "#7fffa0" : g.k === "⌫" ? "#ffb86b" : "#fff";
    ctx.font = `${g.h * 0.5}px sans-serif`; ctx.fillText(g.k, g.x + g.w / 2, g.y + g.h / 2);
  }
  // 回選單鈕（左上）沿用 gameover 的 🏠 位置慣例
  const rr = shortSide() * 0.07, hx = shortSide() * 0.04 + rr, hy = shortSide() * 0.04 + rr;
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.arc(hx, hy, rr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = `${rr}px sans-serif`; ctx.fillText("🏠", hx, hy);
}
```

- [ ] **Step 3：密碼門點擊處理**

在 `canvas.addEventListener("pointerdown", ...)` 內，找到 `if (state === "boot" || state === "error")` 區塊附近，新增：
```js
  if (state === "kppassword") {
    const rr = shortSide() * 0.07, hx = shortSide() * 0.04 + rr, hy = shortSide() * 0.04 + rr;
    if ((px - hx) ** 2 + (py - hy) ** 2 < rr * rr) { playBgmTrack(bgmMenu); state = "menu"; return; }
    for (const g of kpPadKeys()) {
      if (px >= g.x && px <= g.x + g.w && py >= g.y && py <= g.y + g.h) {
        if (g.k === "⌫") kpPwBuf = kpPwBuf.slice(0, -1);
        else if (g.k === "✓") tryKpUnlock();
        else if (kpPwBuf.length < 8) kpPwBuf += g.k;
        return;
      }
    }
    return;
  }
```

- [ ] **Step 4：解鎖 + 解密 + 解碼**

新增（startKpopSong 上方）：
```js
async function tryKpUnlock() {
  state = "loading";
  try {
    const resp = await fetch("MUSIC/kpop_song.enc");
    if (!resp.ok) throw new Error("enc not found");
    const enc = await resp.arrayBuffer();
    const mp3 = await decryptSong(enc, kpPwBuf);   // 密碼錯會 throw
    if (!audioCtx) initAudio();
    kpAudioBuf = await audioCtx.decodeAudioData(mp3); // 解碼成 AudioBuffer
    kpPwOK = true; lsSet("kpop_pw_ok", 1);            // 記住此裝置已解
    startKpopSong();
  } catch (e) {
    console.warn("密碼錯或解密/解碼失敗：", e);
    kpPwBuf = ""; shake = 18; state = "kppassword";   // 抖一下、清空重試
  }
}
```
並在 startGame 載入最高分處附近加 `kpPwOK = lsGet("kpop_pw_ok") === 1;`（記住已解過的裝置；注意：仍需 enc 檔在、解碼在 startKpopSong 時做）。
> 修正：因 `kpAudioBuf` 不持久，即使 `kpPwOK=true` 仍需重新 fetch+解密+解碼。將 `startKpop()` 改為：`if (!kpPwOK) { state="kppassword"; return; } else { kpPwBuf = lsGet... }` 不可行（密碼沒存明文）。**決議：密碼不存明文**，每次開遊戲都要 `kpAudioBuf` → 若 `kpAudioBuf` 已在記憶體（同次 session 解過）直接用，否則回密碼門。把 `startKpop()` 改：
```js
function startKpop() {
  currentGame = "kpop"; resetKpop();
  if (kpAudioBuf) { startKpopSong(); }      // 本次 session 已解碼 → 直接玩
  else { kpPwBuf = ""; state = "kppassword"; } // 否則進密碼門（每次重開 app 要再輸一次，可接受）
}
```
（移除 Step 4 的 `lsSet("kpop_pw_ok")` 與 startGame 的讀取，因密碼不存明文、kpAudioBuf 不持久。kppassword 體驗：同次玩耍只需輸入一次。）

- [ ] **Step 5：startKpopSong 接真音訊時鐘**

替換 startKpopSong：
```js
function startKpopSong() {
  state = "playing";
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  for (const t of ALL_BGM) { try { t.pause(); } catch (e) {} } activeBgm = null; // 停掉選單 BGM
  try { if (kpSource) kpSource.stop(); } catch (e) {}
  kpSource = audioCtx.createBufferSource();
  kpSource.buffer = kpAudioBuf;
  kpSource.connect(audioCtx.destination);
  kpT0 = audioCtx.currentTime + 0.1;       // 0.1s 後開始、給排程餘裕
  kpSource.start(kpT0);
  kpSource.onended = () => { if (state === "playing" && currentGame === "kpop") kpStage = "done"; };
}
```

- [ ] **Step 6：updateKpop 用 audio clock 當時鐘**

替換 updateKpop（本 task 只接時鐘，生成/判定後續 task）：
```js
function updateKpop(dt) {
  poseFrame++;
  if (poseFrame % 2 === 0) {
    senseBody();
    const now = performance.now();
    const sdt = lastSenseTs ? Math.max(0.001, (now - lastSenseTs) / 1000) : 1 / 30;
    lastSenseTs = now;
    punchSpeed = computePunchSpeed() / sdt;
  }
  kpSongTime = audioCtx ? (audioCtx.currentTime - kpT0) : 0; // 歌曲時間＝唯一真時鐘
  // 偵測不到人：歌照播、判定掛起（不凍世界、不扣分）
  if (allPose.length === 0) noPersonT += dt; else noPersonT = 0;
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
  particles = particles.filter((p) => p.life > 0);
  updateFloats(dt);
  if (shake > 0) shake = Math.max(0, shake - dt * 60);
  if (kpStage === "done") { commitBest(); state = "win"; }
}
```

- [ ] **Step 7：drawKpopPlaying 顯示歌曲時間（暫時除錯用）**

```js
function drawKpopPlaying() {
  ctx.fillStyle = "#2a0a2e"; ctx.fillRect(0, 0, W, H);
  if (imgReady(stageKpopImg)) drawBgCover(stageKpopImg);
  if (latestMask) drawPersonMasked(latestMask);     // 本人入鏡
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawParticles(); drawFloatTexts();
  ctx.restore();
  if (noPersonT > 0.7) drawNoPersonHint();
  drawHUD();
}
```

- [ ] **Step 8：commitBest 支援 kpop**

Grep `function commitBest`，在其內依 currentGame 比對最高分的邏輯加 kpop 分支（仿 pvz）：kpop 用「星數×100＋分數」或直接 `score` 比 bestKpop、破紀錄寫 `lsSet("best_kpop", ...)`。具體：
```js
// commitBest 內加：
else if (currentGame === "kpop") { if (score > bestKpop) { bestKpop = score; lsSet("best_kpop", score); } }
```

- [ ] **Step 9：node 檢查**

Run: `node --check js/game.js` → 通過

- [ ] **Step 10：本機真檔驗證（需阿葉提供測試 mp3 + 密碼）**

> ⚠️ 此 step 需要一個真 mp3 才能完整測解碼。執行時：請阿葉放任一 mp3 到 `tools/_src_song/test.rawmp3`，跑 `python tools/encrypt_song.py tools/_src_song/test.rawmp3 1234` 產生 `MUSIC/kpop_song.enc`，Playwright 進密碼門輸入 1234 ✓ → 確認進入 playing（歌播放、無 JS 錯誤）。測完 `rm MUSIC/kpop_song.enc`（除非就是正式歌）。
> 若此時尚無 mp3：跳過實聽、僅靠 Step 9 node 檢查 + 密碼門 UI 截圖。

- [ ] **Step 11：Commit**

```bash
git add js/game.js
git commit -m "kpop Phase1.3: 密碼門UI+解密+Web Audio解碼+audioCtx時鐘"
```

---

## Phase 2：節奏核心（惡魔踩拍走來、提早擺好＝PERFECT、無命制）

### Task 2.1：Beatmap 結構 + 拍點時間換算 + 測試用 beatmap

**Files:**
- Modify: `js/game.js`（新增 KP_DEMON_POSES、beatNoteTime、預設測試 beatmap）

- [ ] **Step 1：定義可用姿勢子集（第一版沿用現有、排除技術判死的）**

設計文件：第一版沿用現有 6 式、但 Boss/判定穩定性考量先用穩的。新增：
```js
// 第一版用現有已驗證、互斥乾淨的姿勢（排除叉腰handshead易遮擋；保留好判的）
const KP_POSES = ["handsup", "star", "tpose", "armscross", "onehand"];
```

- [ ] **Step 2：拍點時間換算**

```js
function kpBeatTime(beat) { return KP_SONG_OFFSET + beat * 60 / KP_SONG_BPM; } // 第幾拍 → 秒
```

- [ ] **Step 3：測試用 beatmap（無真歌也能測手感：用程式生成規律拍點）**

```js
// 測試用：每 2 拍一隻惡魔、姿勢輪換、左右交替（真歌 beatmap 之後手工標）
function buildTestBeatmap() {
  const notes = [];
  for (let i = 0; i < 40; i++) {
    notes.push({ beat: 8 + i * 2, pose: KP_POSES[i % KP_POSES.length], side: i % 2 ? 1 : -1, spawned: false });
  }
  return { bpm: KP_SONG_BPM, offset: KP_SONG_OFFSET, notes };
}
```
並在 resetKpop 內加 `kpBeatmap = buildTestBeatmap(); kpNoteIdx = 0;`

- [ ] **Step 4：node 檢查 + Commit**

```bash
node --check js/game.js
git add js/game.js
git commit -m "kpop Phase2.1: beatmap結構+拍點換算+測試beatmap(規律拍點)"
```

---

### Task 2.2：惡魔生成（提前 2 秒踩拍從兩側走向光圈）

**Files:**
- Modify: `js/game.js`（updateKpop 加生成、新增 kpSpawnDemon、複用 projRun 或自寫簡易接近）

- [ ] **Step 1：定義惡魔接近模型（沿用 runner projRun 偽3D 或簡化 2D 由小走近）**

採用簡化 2D：惡魔從兩側水平走向中央光圈。新增常數與生成：
```js
const KP_APPROACH = 2.0;          // 惡魔提前 2 秒出現開始走
const KP_RING_Y = () => H * 0.62; // 光圈判定區 Y（玩家腳前）
function kpSpawnDemon(note) {
  // hitTime = 該拍的歌曲時間；惡魔在 hitTime - KP_APPROACH 出現，hitTime 抵達光圈
  const hitTime = kpBeatTime(note.beat);
  kpDemons.push({ note, hitTime, side: note.side, pose: note.pose, dead: false, judged: false, stolen: false, wob: Math.random() * 6 });
}
```

- [ ] **Step 2：updateKpop 內依歌曲時間生成到期的 note**

在 updateKpop 的 `kpSongTime` 計算後加：
```js
  while (kpBeatmap && kpNoteIdx < kpBeatmap.notes.length) {
    const n = kpBeatmap.notes[kpNoteIdx];
    if (kpSongTime >= kpBeatTime(n.beat) - KP_APPROACH) { kpSpawnDemon(n); kpNoteIdx++; }
    else break;
  }
```

- [ ] **Step 3：惡魔位置 = 依歌曲時間插值（0→1 從邊緣到光圈）**

新增繪製輔助：
```js
function kpDemonPos(d) {
  const prog = Math.min(1.2, (kpSongTime - (d.hitTime - KP_APPROACH)) / KP_APPROACH); // 0=剛出現 1=到光圈
  const ex = d.side < 0 ? W * 0.04 : W * 0.96;     // 起點（畫面邊）
  const cx = d.side < 0 ? W * 0.4 : W * 0.6;        // 終點（光圈兩側）
  const x = ex + (cx - ex) * prog;
  const y = H * 0.3 + (KP_RING_Y() - H * 0.3) * prog;
  const scale = 0.4 + 0.6 * prog;
  return { x, y, scale, prog };
}
```

- [ ] **Step 4：繪製惡魔（用現成 zombieImg 當佔位）+ 光圈 + 頭頂姿勢圖示**

drawKpopPlaying 內 drawParticles 之前加：
```js
  // 光圈判定區
  ctx.strokeStyle = "rgba(255,127,220,0.6)"; ctx.lineWidth = shortSide() * 0.012;
  ctx.beginPath(); ctx.ellipse(W / 2, KP_RING_Y(), W * 0.16, H * 0.04, 0, 0, Math.PI * 2); ctx.stroke();
  // 惡魔
  for (const d of kpDemons) {
    if (d.dead) continue;
    const p = kpDemonPos(d);
    const w = shortSide() * 0.22 * p.scale;
    const asp = imgReady(zombieImg) ? zombieImg.naturalHeight / zombieImg.naturalWidth : 1.2;
    if (imgReady(zombieImg)) ctx.drawImage(zombieImg, p.x - w / 2, p.y - w * asp * 0.9, w, w * asp);
    else { ctx.fillStyle = "#a05"; ctx.beginPath(); ctx.arc(p.x, p.y - w * 0.4, w * 0.5, 0, Math.PI * 2); ctx.fill(); }
    // 頭頂姿勢圖示（用現有 drawPoseFigure？已刪→用 emoji 對照表佔位）
    kpDrawPoseIcon(d.pose, p.x, p.y - w * asp * 0.9 - shortSide() * 0.06, shortSide() * 0.07);
  }
```
新增姿勢圖示佔位（之後換真示範圖）：
```js
const KP_POSE_ICON = { handsup: "🙌", star: "🤩", tpose: "🧎", armscross: "🙅", onehand: "🙋", handshead: "🙆" };
function kpDrawPoseIcon(pose, x, y, s) {
  ctx.font = `${s}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(KP_POSE_ICON[pose] || "❓", x, y);
}
```

- [ ] **Step 5：node 檢查 + Playwright 冒煙（需測試 enc 或暫時繞過密碼）**

為了無歌也能截圖：暫時在 Playwright evaluate 裡設 `kpAudioBuf` 繞不過（模組封裝）。改用：在 startKpop 加一個 `?nokpaudio` 測試旁路——**不**，避免測試後門。改為：此 step 用測試 enc（Task1.3 Step10 的方式）跑起來截圖，確認惡魔從兩側走向光圈、頭頂 emoji。
Expected: 惡魔由小變大走向粉色光圈、頭頂姿勢 emoji、無 JS 錯誤。

- [ ] **Step 6：Commit**

```bash
git add js/game.js
git commit -m "kpop Phase2.2: 惡魔踩拍從兩側走向光圈+頭頂姿勢圖示(zombie佔位)"
```

---

### Task 2.3：判定（提早擺好＝PERFECT、窗內＝GOOD、沒打到＝偷星跑掉）

**Files:**
- Modify: `js/game.js`（updateKpop 加判定、光波特效、結算計數）

- [ ] **Step 1：判定常數**

```js
const KP_PERFECT_W = 0.45, KP_GOOD_W = 0.75, KP_SENSE_LAG = 0.12; // 判定窗(秒)、感測延遲補償
```

- [ ] **Step 2：判定邏輯（每隻惡魔在窗內檢查該拍指定姿勢、連2幀確認由 poseMatch 的瞬時性近似）**

updateKpop 生成迴圈之後加：
```js
  for (const d of kpDemons) {
    if (d.dead || d.judged) continue;
    const rel = kpSongTime - d.hitTime + KP_SENSE_LAG; // <0=還沒到拍、>0=過了
    // 提早擺好等惡魔：在 [-GOOD, +GOOD] 窗內，若已擺對該姿勢 → 判定
    if (rel >= -KP_GOOD_W && rel <= KP_GOOD_W) {
      if (anyPoseMatch(d.pose)) {
        d.judged = true; d.dead = true;
        const perfect = Math.abs(rel) <= KP_PERFECT_W;
        const pts = perfect ? 2 : 1; score += pts;
        if (perfect) kpPerfect++; else kpGood++;
        combo++; bestCombo = Math.max(bestCombo, combo);
        const p = kpDemonPos(d);
        addFloat(p.x, p.y, perfect ? "PERFECT" : "GOOD", perfect ? "#ffe96b" : "#aef36b", shortSide() * (perfect ? 0.08 : 0.07));
        burst(W / 2, KP_RING_Y(), "#ff7fdc", 22);      // 唱歌光波
        if (!playSfxFile(sfxCorrect)) beep(880, 0.1, "triangle", 0.3);
      }
    } else if (rel > KP_GOOD_W) {
      // 過了窗還沒打掉 → 惡魔偷一顆星搞笑跑掉（無命制）
      d.judged = true; d.stolen = true;
      kpStolen++; combo = 0;
      const p = kpDemonPos(d);
      addFloat(p.x, p.y, "⭐➖", "#ff6b6b", shortSide() * 0.07);
      if (!playSfxFile(sfxZombie)) beep(200, 0.12, "sawtooth", 0.25);
    }
  }
  kpDemons = kpDemons.filter((d) => !d.dead && !(d.stolen && kpSongTime - d.hitTime > 1.2)); // 偷完跑掉的延遲移除做動畫
```

- [ ] **Step 3：偷星惡魔的搞笑跑掉動畫（繪製）**

drawKpopPlaying 惡魔繪製內，`d.stolen` 時讓它往上翻滾淡出（不撲向玩家、不嚇人）：
```js
    if (d.stolen) {
      const t = kpSongTime - d.hitTime;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t); ctx.translate(p.x, p.y - t * H * 0.3); ctx.rotate(t * 6);
      if (imgReady(zombieImg)) ctx.drawImage(zombieImg, -w / 2, -w * asp * 0.9, w, w * asp);
      ctx.restore(); continue;
    }
```

- [ ] **Step 4：node 檢查 + 手機/Playwright 手感測（核心驗收點）**

> 這是設計文件「步驟②：手感驗收」的關鍵。需真 enc 歌（或測試 mp3）。阿葉手機實測：提早擺姿勢能否 PERFECT、窗是否夠寬、偷星演出好不好笑。
Expected: 擺對姿勢→惡魔消失+光波+PERFECT/GOOD 字；沒擺→惡魔翻滾跑掉+⭐➖。

- [ ] **Step 5：Commit**

```bash
git add js/game.js
git commit -m "kpop Phase2.3: 判定(提早擺好=PERFECT/窗內GOOD/沒打到偷星跑掉、無命制)"
```

---

## Phase 3：關卡結構 + 結算 + 教學前奏

### Task 3.1：歌曲分段（intro 教學 / verse / chorus / bridge / boss）

**Files:**
- Modify: `js/game.js`（updateKpop 依 kpSongTime 切 kpStage、生成密度隨段變化）

- [ ] **Step 1：段落時間表（依真歌結構，先用比例佔位、標真 beatmap 時校準）**

```js
// 段落邊界（秒）；真歌 beatmap 完成後校準。GOLDEN 全長約 194s
const KP_SECTIONS = [
  { stage: "intro",  until: 10 },   // 教學前奏（無傷生成、跟著擺）
  { stage: "verse",  until: 60 },
  { stage: "chorus", until: 120 },
  { stage: "bridge", until: 140 },  // 呼吸點：無惡魔
  { stage: "boss",   until: 999 },  // 尾段 Boss
];
function kpStageAt(t) { for (const s of KP_SECTIONS) if (t < s.until) return s.stage; return "boss"; }
```
updateKpop 內：`kpStage = kpStageAt(kpSongTime);` 並在 bridge 段暫停生成（`if (kpStage === "bridge") { /* 不生成 */ }` 包住生成迴圈）。

- [ ] **Step 2：node 檢查 + Commit**

```bash
node --check js/game.js
git add js/game.js
git commit -m "kpop Phase3.1: 歌曲分段intro/verse/chorus/bridge/boss+橋段呼吸點"
```

---

### Task 3.2：教學前奏（零失敗、跟著擺）

**Files:**
- Modify: `js/game.js`（intro 段：依序示範 KP_POSES、擺對放煙火、不偷星）

- [ ] **Step 1：intro 段邏輯**

updateKpop 內，intro 段不跑一般判定，改跑教學：依序顯示一個大姿勢圖示、偵測到擺對→煙火+下一個。新增 `kpTutorIdx`（resetKpop 設 0）。
```js
  if (kpStage === "intro") {
    if (kpTutorIdx < 3) {
      const pose = KP_POSES[kpTutorIdx];
      if (anyPoseMatch(pose)) { burst(W / 2, H * 0.4, "#ffe96b", 24); if (!playSfxFile(sfxCorrect)) beep(990, 0.1, "triangle", 0.3); kpTutorIdx++; }
    }
    return; // intro 不生成惡魔、不判定
  }
```

- [ ] **Step 2：intro 繪製（中央大姿勢圖示 + 提示）**

drawKpopPlaying 內，`kpStage === "intro"` 時畫中央大 icon：
```js
  if (kpStage === "intro" && kpTutorIdx < 3) {
    kpDrawPoseIcon(KP_POSES[kpTutorIdx], W / 2, H * 0.4, shortSide() * 0.2);
    ctx.fillStyle = "#fff"; ctx.font = `${shortSide() * 0.05}px sans-serif`;
    ctx.textAlign = "center"; ctx.fillText("👆" + (kpTutorIdx + 1) + "/3", W / 2, H * 0.56);
  }
```

- [ ] **Step 3：node 檢查 + Commit**

```bash
node --check js/game.js
git add js/game.js
git commit -m "kpop Phase3.2: 教學前奏(依序示範3式、擺對放煙火、零失敗)"
```

---

### Task 3.3：Boss 段（5 人並排、擺住大姿勢 4 拍充能 → 全螢幕金光波）

**Files:**
- Modify: `js/game.js`（boss 段邏輯、充能條、全螢幕光波）

- [ ] **Step 1：boss 段邏輯**

```js
  if (kpStage === "boss") {
    const bossPose = "star"; // 大姿勢（大字最好認最好判）
    if (anyPoseMatch(bossPose)) { kpBossCharge = Math.min(1, kpBossCharge + dt / 2.0); } // 擺住約2秒(4拍@123bpm≈1.95s)充滿
    else kpBossCharge = Math.max(0, kpBossCharge - dt * 0.4);
    if (kpBossCharge >= 1) {
      // 全螢幕金光波轟飛 Boss
      kpStars += 1; score += 10; bombFx = 1.0; shake = 22;
      burst(W / 2, H / 2, "#ffe96b", 60);
      if (!playSfxFile(pvzWinSfx)) sndVictory();
      kpStage = "done";
    }
    return;
  }
```

- [ ] **Step 2：Boss 繪製（5 隻並排 + 充能條 + 大姿勢提示）**

drawKpopPlaying 內 boss 段：
```js
  if (kpStage === "boss") {
    for (let i = 0; i < 5; i++) {
      const x = W * (0.2 + i * 0.15), w = shortSide() * 0.18;
      const asp = imgReady(zombieImg) ? zombieImg.naturalHeight / zombieImg.naturalWidth : 1.2;
      if (imgReady(zombieImg)) { ctx.save(); ctx.filter = `hue-rotate(${i * 40}deg)`; ctx.drawImage(zombieImg, x - w / 2, H * 0.4, w, w * asp); ctx.restore(); }
    }
    kpDrawPoseIcon("star", W / 2, H * 0.25, shortSide() * 0.14);
    // 充能條
    ctx.fillStyle = "rgba(255,255,255,0.2)"; roundRectFill(W * 0.2, H * 0.7, W * 0.6, H * 0.03, H * 0.015);
    ctx.fillStyle = "#ffe96b"; roundRectFill(W * 0.2, H * 0.7, W * 0.6 * kpBossCharge, H * 0.03, H * 0.015);
  }
```

- [ ] **Step 3：node 檢查 + Commit**

```bash
node --check js/game.js
git add js/game.js
git commit -m "kpop Phase3.3: Boss段(5人並排+擺住大字充能4拍+全螢幕金光波)"
```

---

### Task 3.4：結算畫面（按表現給 ⭐⭐⭐）

**Files:**
- Modify: `js/game.js`（win 畫面 kpop 分支 或共用 drawWin 加 kpop 評級）

- [ ] **Step 1：評級計算**

新增：
```js
function kpRating() {
  const total = kpPerfect + kpGood + kpStolen;
  if (total === 0) return 1;
  const acc = (kpPerfect + kpGood * 0.5) / total;
  return acc >= 0.85 ? 3 : acc >= 0.5 ? 2 : 1;
}
```

- [ ] **Step 2：drawWin 加 kpop 分支顯示星級**

Grep `function drawWin`，加：
```js
  if (currentGame === "kpop") {
    const stars = kpRating();
    ctx.font = `${shortSide() * 0.16}px sans-serif`; ctx.fillStyle = "#ffe96b"; ctx.textAlign = "center";
    ctx.fillText("⭐".repeat(stars) + "☆".repeat(3 - stars), W / 2, H * 0.3);
    ctx.font = `${shortSide() * 0.07}px sans-serif`; ctx.fillStyle = "#fff";
    ctx.fillText("PERFECT " + kpPerfect + "  GOOD " + kpGood, W / 2, H * 0.46);
  }
```

- [ ] **Step 3：node 檢查 + Commit + 部署**

```bash
node --check js/game.js
git add js/game.js
git commit -m "kpop Phase3.4: 結算評級⭐⭐⭐(依PERFECT/GOOD準確率)"
GIT_TERMINAL_PROMPT=0 git push origin HEAD:master
```
部署後輪詢 curl 確認線上含 `function updateKpop`。

---

## Phase 4：美術接入（手感驗收通過後才做，依阿葉產素材順序）

> 每個 task 都是「阿葉產一樣素材 → Claude 接上 → 部署」。前置：Phase 0-3 手感已獲阿葉認可。

### Task 4.1：演唱會舞台背景

- [ ] **Step 1：** 阿葉產 `IMAGE/sprites/stage_kpop.png`（演唱會舞台）。
- [ ] **Step 2：** 已宣告 `stageKpopImg`（Task 0.1）；drawKpopPlaying 已 `drawBgCover(stageKpopImg)`。確認載入即顯示。加程式燈光閃爍（可選）：在背景上疊半透明掃光。
- [ ] **Step 3：** node 檢查 + Playwright 截圖確認舞台顯示 + commit + 部署。

### Task 4.2：惡魔美術（順便測 ChatGPT 透明背景 PNG）

- [ ] **Step 1：** 阿葉產惡魔圖 1-2 種。**實驗：** ChatGPT 直接輸出透明背景 PNG（成功則略過綠底去背流程；失敗回退 `process_sprites.py`）。輸出 `IMAGE/sprites/demon.png`（+`demon2.png`）。
- [ ] **Step 2：** 宣告 `const demonImg = new Image(); demonImg.src="IMAGE/sprites/demon.png";`，把 drawKpopPlaying 惡魔繪製的 `zombieImg` 換成 `demonImg`（缺圖 fallback zombieImg→程式圓形）。
- [ ] **Step 3：** node 檢查 + 截圖 + commit + 部署。

### Task 4.3：紫色長髮造型配件（mask 入鏡疊圖）

- [ ] **Step 1：** 阿葉產 `IMAGE/sprites/hair_purple.png`（頭戴式、透明或綠底）。
- [ ] **Step 2：** 仿 whack 的 `drawHelmet`（grep 現有頭部配件繪製），錨定頭部 landmark（nose/雙肩中點推算頭頂），在 drawKpopPlaying 的 `drawPersonMasked` 之後疊畫紫髮。新增 `drawKpHair(lm)`。
- [ ] **Step 3：** node 檢查 + 截圖 + commit + 部署。

### Task 4.4：Boss 男團（1 隻 + 程式變色 4 隻，已在 Task 3.3 用 hue-rotate）

- [ ] **Step 1：** 阿葉產 `IMAGE/sprites/boss_kpop.png`（邪派男團 1 隻）。
- [ ] **Step 2：** Task 3.3 的 boss 繪製 `zombieImg` 換 `bossKpopImg`，5 隻用 `hue-rotate(i*40deg)` 變色（已寫）。
- [ ] **Step 3：** node 檢查 + 截圖 + commit + 部署。

### Task 4.5：真歌 beatmap（替換測試 beatmap）

- [ ] **Step 1：** 阿葉提供正式 `MUSIC/kpop_song.enc`（GOLDEN 加密）+ 密碼。
- [ ] **Step 2：** Claude 用波形量測首拍 offset（Audacity 或 `librosa` 在本機原始檔上）→ 填 `KP_SONG_OFFSET`。手工撰寫真 beatmap（取代 `buildTestBeatmap`）：依歌曲段落在對應拍號放姿勢、密度照 verse/chorus/bridge 設計。校準 `KP_SECTIONS` 段落邊界對齊真歌。
- [ ] **Step 3：** 阿葉手機實測整首 → 依櫻木 8 項清單調（判定窗、密度、疲勞）+ commit + 部署。

---

## Self-Review 註記（撰寫者已檢查）

- **Spec 覆蓋：** 玩法循環(2.x)、無命制偷星(2.3)、判定哲學提早擺好(2.3)、音訊時鐘(1.3)、加密密碼門(1.1-1.3)、beatmap拍號(2.1/4.5)、姿勢沿用現有(2.1)、Boss充能(3.3)、教學前奏(3.2)、結算評級(3.4)、mask入鏡+紫髮(4.3)、降級(沿用fpsTick，4.x可補)、雙人(未列獨立task→補註)。
- **雙人模式**：設計文件列「左右各歸一人」；本計畫 Phase 2 先做單人核心，雙人判定（左惡魔歸玩家1/右歸玩家2）列為 **Phase 5 後續**（Task 2.3 的 anyPoseMatch 已天然支援「任一人對就算」當合作 fallback，雙人分邊計分待手感確認後再加，避免過早複雜化）。
- **降級策略**：mask 效能降級沿用現有 fpsTick 模式，於 Task 4.3 接入紫髮後若實機掉幀再補（複用 runner `runnerBgDegraded` 模式）。
- **無 placeholder**：各 step 均含實際程式碼；Phase 4 為「等素材」性質、步驟為接入動作（素材由阿葉產，非程式 placeholder）。
- **型別一致**：kp 前綴變數、`kpBeatTime`/`kpDemonPos`/`kpRating`/`kpStageAt` 命名跨 task 一致；`KP_POSES`/`KP_POSE_ICON` 同名沿用。
