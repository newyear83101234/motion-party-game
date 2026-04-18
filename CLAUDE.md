# 體感派對遊戲 — Claude Code 工作守則

> 此檔案供 Claude Code 自動載入，作為專案的持續性背景知識與工作規範。
> 更多專案背景請參考 `PROJECT-CONTEXT.md`，詳細規格請參考 `SPEC.md`。

---

## 一、專案簡介

一款體感互動派對遊戲，以「敲冰塊」為主軸的迷你遊戲集合，目標客群 **2-6 歲幼兒**。透過手機／平板的前置鏡頭，使用 MediaPipe 即時偵測玩家身體姿態，讓玩家用身體動作操控遊戲。支援單人與雙人模式。

## 二、技術棧

- **前端**：純 HTML5 + Canvas + ES Modules（無打包工具）
- **姿態偵測**：`@mediapipe/tasks-vision` 的 PoseLandmarker（jsDelivr CDN 載入）
- **音效**：Web Audio API
- **部署**：GitHub Pages（透過 `deploy.sh` 推 master 分支；cache-bust 靠 `?v=${BUILD}` query string）
- **本地測試**：`local-ssl-proxy`（手機需 HTTPS 才能存取鏡頭）

> 註：早期規劃曾考慮 Netlify / Vercel，現以 GitHub Pages 為主。若未來改用其他平台需通知老布審查官擴充定義檔。

**不使用**：npm/Webpack/Vite 打包工具、HandLandmarker/FaceLandmarker 等其他模型、任何後端伺服器。

## 三、專案目錄結構

```
motion-party-game/
├── index.html              # 入口 HTML
├── SPEC.md                 # 詳細規格書（必讀）
├── PROJECT-CONTEXT.md      # 專案背景與協作歷史
├── CLAUDE.md               # 本檔
├── css/style.css
├── js/
│   ├── main.js             # 主流程（選單、遊戲切換、狀態機）
│   ├── camera.js           # 鏡頭啟動
│   ├── pose-detector.js    # MediaPipe 封裝
│   ├── pose-library.js     # 姿勢庫（姿勢 mirror 遊戲用）
│   ├── pose-comparator.js  # 姿勢比對演算法
│   ├── audio-manager.js    # 音訊管理（BGM、SFX、masterGain）
│   ├── renderer.js         # 通用繪圖工具
│   ├── fps-counter.js
│   └── games/
│       ├── ice-breaker.js    # 敲冰塊（主遊戲）
│       ├── helicopter-race.js # 直升機競速
│       └── pose-mirror.js    # 姿勢模仿
├── IMAGES/                 # 實機用圖（本地化，不用 CDN）
│   └── poses/              # 姿勢示意圖
├── MUSIC/                  # 所有 BGM 和 SFX（.mp3 / .wav）
├── assets/sounds/
├── scripts/
│   └── generate-pose-images.py
└── TASK{N}-*.md            # 歷次實作指南（最新的未完成者才需執行）
```

## 四、開發原則

1. **手機優先** — 所有功能先在手機端（前鏡頭）確認可行。
2. **效能敏感** — 鏡頭解析度 640×480、requestAnimationFrame 驅動，避免每幀做昂貴運算。
3. **模組化** — 每個迷你遊戲是獨立模組，透過 `main.js` 的狀態機切換；共用引擎介面（init / update / render / cleanup）。
4. **繁體中文註解** — 所有程式碼註解使用繁體中文。
5. **回覆語言** — 與使用者溝通一律使用繁體中文。

## 五、資源處理規則

### 5.1 圖片
- **所有圖片必須是本地檔案**，放在 `IMAGES/` 下。**嚴禁使用 CDN URL**（例如 `files.manuscdn.com`）作為遊戲內 img src。
- 若要加入新圖片，必須先用 `curl` 或 `Invoke-WebRequest` 下載到 `IMAGES/` 再引用。
- 理由：CDN 連結會過期，且離線時失效。

### 5.2 音訊（BGM / SFX）
- **BGM 和音效檔必須實際存在於 `MUSIC/` 或 `assets/sounds/`**，不能只有程式碼路徑。
- `audio-manager.js` 載入音訊前應 `fetch` 檢查，若 404 要有錯誤處理，不可靜默失敗。
- 歷史踩坑（2026-04）：曾因 `MUSIC/bgm_02_gameplay.mp3` 根本不存在導致連續三輪回報「BGM 沒聲音」，最後才發現檔案缺失。**新增音效前必先確認檔案實際存在**。

### 5.3 音量策略（歷史經驗）
音量一直是痛點，目前（TASK8、TASK9 之後）採用五層強化：
1. 所有 oscillator gain 拉到 0.95-1.0
2. DynamicsCompressor 設為接近 limiter（threshold -50, ratio 20, knee 0）
3. masterGain 上限 5.0（預設 3.0）
4. WaveShaperNode 做 soft clipping（tanh curve）防破音
5. BGM 使用 GainNode 再額外放大

若再有「太小聲」回報，先確認上述五層都還在、masterGain 實際值、以及 BGM 檔案本身振幅。

## 六、除錯與除錯模式

- **正式版不得有除錯痕跡**：骨架連線、綠色碰撞圓圈、landmark 小點等，只能在明確的 DEBUG flag 開啟時才渲染。
- 歷史踩坑：多次把調試渲染留在正式版被使用者抓包。

## 七、雙人模式注意事項

- PoseLandmarker 回傳多人姿態時，**玩家 ID 可能每幀交換**。必須先用「最近距離匹配」穩定 ID，再套 EMA 平滑。
- 若先套 EMA 再認 ID，會導致玩家左右互換時畫面閃爍。

## 八、TASK 執行流程

1. 使用者（阿葉）會告訴 Claude Code 讀取哪個 `TASK{N}-*.md`。
2. Claude Code 應逐步執行指南中的每個步驟，**每完成一步就在回覆中標記 ✅**。
3. 執行前先讀 `CLAUDE.md`（本檔）、`PROJECT-CONTEXT.md`、`SPEC.md` 建立完整上下文。
4. 執行後進行驗證：跑起來、手機實測、檢查 console error。
5. 完成後提醒使用者 commit。

## 九、目前待執行 TASK（2026-04-18 整合時狀態）

- `TASK8-IMPLEMENTATION-GUIDE.md` — 第六輪優化（音量極限強化 + 雙人模式閃爍修復 + 手套覆蓋優化）
- `TASK9-IMPLEMENTATION-GUIDE.md` — 第七輪優化（BGM 根本修復 + 音量再強化 + 雙人閃爍根治 + 調試模式清理）

> TASK4-7、TASK10-17 的部分可能已執行過（對照 `js/` 檔案時間戳判斷）。如不確定是否執行，先問使用者再動手。

## 十、與舊協作流程的差異（2026-04-18 後）

此專案之前由三方協作：Cowork（分析、寫 TASK 指南）、MANUS（設計圖片/音訊）、Claude Code（寫程式碼）。自 2026-04-18 起**全部整合由 Claude Code 接手**：分析、規劃、實作、驗證都在本專案內進行，不再透過 Cowork 中轉。

- 若需要新圖片/BGM，Claude Code 可直接請使用者提供或用 AI 生成後下載到 `IMAGES/` 或 `MUSIC/`。
- 歷史分析與協作紀錄保留在 Notion（頁面 ID 見 `PROJECT-CONTEXT.md`）。

---

## 十一、審查員召喚對照表（2026-04-18 健檢後建立）

本專案目前生效的審查員：**7 位**（專案層 6 位 + 全域 1 位通用）。

### 11.1 主審員速查

| 修改主題 | 主審 | 副審 / Route 對象 |
|---------|------|-------------------|
| `js/audio-manager.js`、`MUSIC/`、`assets/sounds/` | **小音** | 老陳（架構） |
| `js/pose-detector.js`、`js/pose-comparator.js` | **阿凱** | 老陳（架構） |
| `js/pose-library.js`（姿勢庫資料） | **阿育**（姿勢對 2-6 歲合不合適） | 阿凱（座標可行性） |
| 任何使用 landmarks 的遊戲邏輯 | **阿凱** | 小畫（視覺呈現） |
| 雙人模式行為 | **阿凱** | 小畫（HUD 分割） |
| `IMAGES/` 資產、render 程式碼、HUD/UI、裝扮貼圖 | **小畫** | 阿凱（座標源） |
| `js/main.js`、`js/renderer.js`、`js/fps-counter.js` 等架構/共用工具 | **老陳** | — |
| `js/camera.js`、權限提示文案、任何 fetch / WebSocket / canvas.toBlob | **小安** | 老陳（錯誤處理） |
| `deploy.sh`、cache-bust（`?v=BUILD`）、GitHub Pages 設定、跨瀏覽器議題 | **老布** | 阿凱（wasm/GPU） |
| 選單流程、教學畫面、結算畫面、loading、家長指引 | **阿育** | 小畫（視覺）/ 小安（家長文案） |
| `SPEC.md` 修改 | **老陳** | 涉及領域的審查員（改音訊規格找小音、改體感找阿凱⋯⋯） |
| 新增/修改 agent 本身 | **老吳** | — |

### 11.2 灰色地帶仲裁規則

當問題跨越多位審查員時的優先順序：

1. **裝扮對位錯誤**：
   - 「貼歪了 / 偏移」→ 先讓**阿凱**檢查座標計算（`landmark.x * canvasWidth + offset` 是否正確）
   - 「貼圖本身對不上 anchor」→ 再讓**小畫**檢查 anchor point 與 drawImage 參數

2. **Debug 渲染殘留**（骨架線、綠色碰撞圈、landmark 點）：
   - 視覺層（畫了什麼、有沒有外流到玩家螢幕）→ **小畫**
   - 程式層（DEBUG flag 判定條件、是否預設 false）→ **阿凱**

3. **音訊載入造成 UI 卡頓**：
   - 音訊本身的 fetch / decode → **小音**
   - UI loading 提示與錯誤回饋 → **老陳**（架構） / **阿育**（幼兒友善）

4. **iOS Safari 上音訊不出聲**：
   - AudioContext.resume() 時機 → **小音**
   - touchend handler 與部署設定（playsinline 等）→ **老布**

5. **鏡頭權限請求不友善**：
   - **首次開機的隱私同意書 / 鏡頭權限說明**（給家長看的法律性透明度文案）→ **小安**主審
   - **遊戲中卡住時跳的家長提示 / 鏡頭沒看到人的友善提示**（純互動引導）→ **阿育**主審
   - 切割點：「是否涉及隱私 / 法規」歸小安，「純互動引導」歸阿育

6. **雙人模式 HUD 切割**（左右各佔多少、安全區邊距、P1/P2 顏色對比）：
   - 阿凱定行為（哪些資料屬 P1/P2、左半場 vs 右半場的判定邏輯）
   - 小畫定版面（左右各佔多少、安全區邊距、橘 vs 原色對比）

7. **DEBUG flag 開啟條件**（URL param？localStorage？快捷鍵？）：
   - 條件本身（哪個變數 + 預設值） → 阿凱
   - 視覺呈現（畫了什麼） → 小畫
   - 開啟機制（從哪裡讀、如何切換）→ **老陳**（架構面）

8. **音訊載入造成 UI 卡頓**（仲裁第 3 條延伸）：
   - **老陳當主審**（他改檔案結構），小音和阿育當會簽
   - 阿育的會簽只看「Loading > 3 秒有沒有趣味動畫 + 語音」這一條

9. **倒數音效是否會嚇哭**：
   - 音效**音量過大 / 頻率刺耳 / 突然出現**（技術面）→ **小音**
   - 音效**情緒設計、是否該換成柔和提示**（幼兒體驗）→ **阿育**

10. **音訊檔案來源版權 / AI 生成歸屬**：（移到 11.4「使用者自決事項」段，不是仲裁灰色地帶）

11. **靜音模式 UI 開關**：
    - 開關長相（按鈕視覺）→ **小畫**
    - 行為記憶（localStorage 持久化）→ **小音**
    - 靜音時是否顯示視覺替代回饋（震動、icon 閃爍）→ **阿育**

12. **暫停 / 恢復**（玩家按暫停或接電話）：
    - **阿凱**主審（相機 + landmark 重置 + 偵測迴圈暫停）
    - **小音**會簽（BGM 暫停或 fadeout、AudioContext suspend / resume）
    - **小安**會簽（暫停期間相機是否釋放，避免家長對「暫停了還在錄影」起疑）
    - **阿育**會簽（暫停 UI 對幼兒是否清楚，要不要顯示「玩到一半喔～」提示）

13. **頁面 visibility change**（切到背景再回來）：
    - **阿凱**主審（iOS Safari readyState 重觸發、video.play() 重啟）
    - **小音**會簽（AudioContext suspend / resume、避免回來時破音）
    - **小安**會簽（背景時是否關相機保護隱私，回來時是否重新請求權限）
    - **老布**會簽（visibility API 跨瀏覽器差異）

14. **橫直屏切換**（玩家旋轉手機）：
    - **小畫**主審（HUD reflow、安全區邊距、按鈕位置重算）
    - **老布**會簽（viewport meta、CSS 媒體查詢、`orientationchange` 事件）
    - **阿凱**會簽（鏡像座標重算、canvas 尺寸重設、landmark 對位是否仍正確）

### 11.3 本專案不召喚的全域 agent

以下 6 位全域 agent 是其他電商 / 倉儲專案用的，**本專案不主動召喚**：

| Agent | 原本領域 | 為何不適用 |
|-------|---------|-----------|
| 小敏 — 精打細算買家 | 蝦皮買家視角 | 本專案非電商 |
| 美玲 — 電商文案策略師 | 蝦皮 SEO 標題 | 本專案非電商 |
| 阿國 — 電商視覺總監 | 蝦皮商品圖規範 | 本專案非電商 |
| 大衛 — 平台合規審查官 | 蝦皮/酷澎/LINE 規範 | 本專案非電商；隱私部分由小安接手 |
| 小芳 — 美編操作員 | 葉子小舖美編工具 | 本專案非該工具 |
| 阿豪 — 倉儲外場人員 | 葉子小舖倉儲 | 本專案非倉儲 |
| 凱哥 — 蝦皮實戰情報員 | 蝦皮競品分析 | 本專案非電商；**注意：此 agent 原名「阿凱」已於 2026-04-18 更名為「凱哥」以避免與本專案 MediaPipe 阿凱撞名** |

**本專案「阿凱」一律指 MediaPipe 阿凱**（專案層 `reviewer-mediapipe.md`）。蝦皮阿凱已更名為「凱哥」，不會再撞名。

**全域 agent 檔案保留**（未來其他電商專案還能用），只是本專案不召喚。

**例外恢復條款**：
- **大衛**：若本專案未來要上架 App Store / Google Play / Google Play Family / PWA Store / LINE Mini App，請恢復召喚大衛接手「商店審查條款」「Google Designed for Families」「平台合規」這類本專案隱私顧問（小安）做不了的事
- **其他電商 agent（小敏、美玲、阿國、凱哥）**：若本專案未來開發配套販售（例如周邊商品、課程），可恢復召喚

### 11.4 使用者自決事項（無人審查）

以下事項不在任何審查員職責範圍，由使用者（阿葉）自行判斷與承擔：

- **音訊檔案來源版權 / AI 生成歸屬**：commit 任何 BGM/SFX 到 `MUSIC/` 或 `assets/sounds/` 前，自行確認版權狀態
- **圖片素材的視覺著作權**：commit 任何圖片到 `IMAGES/` 前，自行確認版權狀態
- **MediaPipe / Google 模型授權條款**：使用 `pose_landmarker_lite.task` 須遵守 Google 模型使用條款
- **目標客群擴展決策**：「2-6 歲」是當前定位，若擴大到學齡兒童或成人，整個審查體系（特別是阿育、小安）需重新校準
- **未來商業化方向**：個人/家用 vs 商業上架 vs 機構授權，三種路徑會觸發不同的 agent 召喚（見 11.3 例外恢復條款）

---

## 十二、程式碼修改安全紅線

### 12.1 對含中文註解 / 字串檔案的編輯

**歷史踩坑**：2026-04-05 曾有協作者用 Edit 工具改 `helicopter-race.js`，因 Unicode 處理問題，替換位置錯誤把護目鏡程式碼覆蓋成呼啦圈，產生垃圾殘留（PROJECT-CONTEXT 5.4）。

**紅線守則**：

1. **改前先 Read 整檔**：對含中文註解 / 中文字串的檔案做大範圍 Edit 前，必須先 Read 整份檔案建立完整脈絡，不要只憑 grep 結果出手
2. **優先用小範圍精確 `old_string`**：盡量讓 `old_string` 包含足夠上下文（前後各 1-2 行）以唯一識別位置
3. **避免 `replace_all` 在中文段落**：`replace_all` 只用在英文識別子（變數名、函式名）的重新命名；含中文的字串千萬不要用
4. **大改動拆多次**：單一檔案的修改若超過 5 處，拆成 5 次 Edit 而非一次 replace_all
5. **改完用 git diff 自檢**：完成大改動後跑 `git diff <file>` 確認沒有亂碼、沒有意外被覆蓋的段落、沒有 BOM 異常
6. **遇到亂碼立刻 git checkout**：發現產出有亂碼或非預期內容，立刻 `git checkout -- <file>` 還原，不要嘗試「再改回來」（會越改越糟）

### 12.2 跨檔案大改動

修改三個檔案以上的議題，建議改用 Plan Mode 對齊方向再動手，避免做到一半才回頭 rollback。
