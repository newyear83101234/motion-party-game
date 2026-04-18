# PROJECT-CONTEXT.md
# 體感派對遊戲 — 專案背景與協作歷史

> 此文件整合自過去的 Cowork/MANUS/Claude Code 三方協作紀錄，供 Claude Code 接手後快速建立完整上下文。
> 開發規則請讀 `CLAUDE.md`，技術規格請讀 `SPEC.md`。

---

## 一、專案基本資訊

| 項目 | 內容 |
|------|------|
| 專案名稱 | 體感派對遊戲 |
| 主玩法 | 敲冰塊（主）+ 直升機競速 + 姿勢模仿 |
| 目標客群 | 2-6 歲幼兒 |
| 遊玩方式 | 手機/平板前鏡頭 + 身體姿態偵測 |
| 技術棧 | HTML5 Canvas + MediaPipe PoseLandmarker + Web Audio API |
| 部署方式 | GitHub Pages（deploy.sh 推 master，cache-bust 靠 `?v=${BUILD}`） |
| 原始提案 | `HELICOPTER-GAME-PROPOSAL.pdf` |
| 規格書 | `SPEC.md` |

## 二、原始三方協作架構（已於 2026-04-18 終止，整合由 Claude Code 接手）

### 2.1 角色分工
- **Cowork**：分析使用者回報、整合 MANUS 建議、撰寫 TASK 實作指南
- **MANUS**：設計方案、生成圖片素材、生成 BGM/SFX
- **Claude Code**：讀取 TASK 指南執行程式碼修改

### 2.2 協作中心（Notion）

| 頁面 | ID |
|------|----|
| 協作中心 | `338c428fb590812786d7cb425bcd5b95` |
| Claude 分析區 | `338c428fb590819e93e0dac20f39520e` |
| MANUS 分析區 | `338c428fb59081f2b521f0c4aad37ace` |

> 接手後若需查歷史分析，到 Notion 對應頁面找。Claude Code 若有 Notion MCP 可直接 fetch；否則請使用者手動提供。

## 三、TASK 歷史清單

所有 TASK 指南檔案都在專案根目錄（`TASK{N}-*.md`）。下表列出每個 TASK 的主題，方便 Claude Code 追溯歷史。

| TASK | 檔名 | 主題 |
|------|------|------|
| 4 | `TASK4-IMPLEMENTATION-GUIDE.md` | 早期基礎功能 |
| 5 | `TASK5-IMPLEMENTATION-GUIDE.md` | 遊戲引擎雛形 |
| 6 | `TASK6-IMPLEMENTATION-GUIDE.md` | 迷你遊戲初版 |
| 7 | `TASK7-IMPLEMENTATION-GUIDE.md` | 優化與 bugfix |
| 8 | `TASK8-IMPLEMENTATION-GUIDE.md` | **第六輪優化**：音量極限強化 + 雙人閃爍修復 + 手套覆蓋優化 |
| 9 | `TASK9-IMPLEMENTATION-GUIDE.md` | **第七輪優化**：BGM 根本修復 + 音量再強化 + 雙人閃爍根治 + 調試清理 |
| 10 | `TASK10-IMPLEMENTATION-GUIDE.md` | 直升機競速迭代 |
| 11 | `TASK11-ASSET-FIX.md` | 資產修正 |
| 12 | `TASK12-SKYLINE-FIX.md` | 天際線背景修正 |
| 13 | `TASK13-CACHE-BUST.md` | 快取清除 |
| 14 | `TASK14-POSE-MIRROR-BASE.md` | 姿勢模仿遊戲基礎版 |
| 15 | `TASK15-POSE-MIRROR-ENHANCE.md` | 姿勢模仿強化 |
| 16 | `TASK16-POSE-MIRROR-UI-FIX.md` | 姿勢模仿 UI 修正 |
| 17 | `TASK17-POSE-MIRROR-OVERHAUL.md` | 姿勢模仿翻修 |

**目前待執行**：TASK8、TASK9（2026-04-18 整合時狀態，請對照 `js/` 檔案時間戳判斷是否已執行）。

## 四、MANUS 生成的素材（歷史備查）

過去 MANUS 透過 CDN 提供素材，但**遊戲內不得引用 CDN URL**，必須先 curl 下載到本地。

### 4.1 BGM（`MUSIC/`）
- `bgm_01_main_menu.mp3`、`bgm_02_gameplay.mp3`、`bgm_03_results.mp3`（MANUS 舊版）
- `bgm_gameplay.mp3`（128 BPM，活潑歡樂，木琴+打擊樂，第七輪新增）
- `bgm_menu.mp3`（100 BPM，溫馨輕柔，音樂盒+馬林巴琴，第七輪新增）

### 4.2 SFX（`MUSIC/`）
- `sfx_countdown.mp3`、`sfx_time_warning.mp3`
- `sfx_heli_boost.mp3`、`sfx_heli_whoosh.mp3`、`sfx_heli_win.mp3`
- `sys_01_calibrate.wav` 至 `sys_12_gameover.wav`（系統語音）
- `pose_01_wansui.wav` 至 `pose_12_surrender.wav`（姿勢名稱語音）

### 4.3 圖片（`IMAGES/`）
- 冰塊：`ice_normal.png`, `ice_big.png`, `ice_bomb.png`, `ice_gold.png`
- 手套/帽子：`gauntlet.png`, `gauntlet_orange.png`, `hat_snow.png`, `hat_orange.png`
- 直升機：`heli_p1.png` ~ `heli_p4.png`, `cloud.png`, `city_skyline.png`, `aviator_goggles.png`, `hula_hoop.png`
- 姿勢示意：`IMAGES/poses/pose_*.png`（12 張）

## 五、歷史踩坑與經驗紀錄（重要）

### 5.1 BGM 檔案不存在（2026-04，連續三輪回報）
- **症狀**：`playBGM("gameplay")` 靜默失敗，沒有背景音樂。
- **根因**：`MUSIC/bgm_02_gameplay.mp3` 根本沒放進專案。
- **教訓**：新增音訊功能前**必先確認檔案實際存在**，`audio-manager.js` 的 fetch 必須加錯誤處理。

### 5.2 音量不夠大（連續四輪回報）
- **症狀**：手機上音量拉到最大還是很小聲。
- **修正**：五層強化策略（詳見 `CLAUDE.md` 第 5.3 節）。

### 5.3 雙人模式畫面閃爍
- **症狀**：兩個玩家的手套/帽子畫面頻繁閃爍。
- **根因**：PoseLandmarker 每幀回傳的玩家順序會交換，若先做 EMA 平滑再認 ID，插值會在錯誤玩家身上。
- **修正**：先用「最近距離匹配」穩定玩家 ID，再套 EMA 平滑。

### 5.4 直接編輯程式碼造成亂碼
- **症狀**：2026-04-05 曾有協作者直接用 Edit 工具改 `helicopter-race.js`，因 Unicode 處理問題，替換位置錯誤把護目鏡程式碼覆蓋成呼啦圈，產生垃圾殘留。
- **修正**：`git show HEAD` 還原。
- **教訓**：對含中文註解的檔案做大範圍替換前，先仔細讀整份檔案、優先用小範圍精確的 `old_string`。

### 5.5 調試模式殘留在正式版
- **症狀**：骨架連線、綠色碰撞圓圈留在玩家看得到的畫面。
- **教訓**：所有調試渲染必須包在 `if (DEBUG)` 裡，commit 前檢查一次。

## 六、使用者（阿葉）偏好

- **語言**：繁體中文（回覆、程式碼註解、文件皆中文）
- **角色**：台灣電商經營者 / 專案發起人
- **工作方式**：每次給 TASK 指南後，希望附上一段可直接複製到 Claude Code 的啟動指令
- **期待**：Claude Code 每執行完一步就 ✅ 標記，完成後主動驗證

## 七、後續工作建議

整合到 Claude Code 之後的建議工作方式：

1. 使用者回報問題 → Claude Code 直接在本專案內分析、規劃、實作、驗證。
2. 若需要新素材（圖片、音樂），Claude Code 可：
   - 請使用者提供
   - 用 AI 生圖工具產生後，curl 下載到 `IMAGES/` 或 `MUSIC/`
3. 若要沿用「先寫 TASK 指南再執行」的節奏（適合大改動），可在根目錄建立新的 `TASK{N}-*.md`。
4. 小改動可直接修改程式碼，但 commit message 要說清楚改了什麼、為何改。

---

*最後更新：2026-04-18，整合由 Cowork 交接到 Claude Code*
