# TASK16 — 姿勢模仿 UI 修復：去背、版面統一、頭飾對齊

> **目標：** 修復三個視覺問題 — 圖片白底未去除、Preview 階段多餘、頭飾位置偏移
> **優先級：** P0（直接影響遊戲體驗）
> **影響檔案：** `js/games/pose-mirror.js`，以及可能需要重新處理 `IMAGES/poses/*.png`

---

## 問題 1：圖片去背失敗

### 現況
姿勢卡片圖片（`IMAGES/poses/pose_*.png`）仍然有白色背景，且渲染時 `_renderPreview` 還額外畫了一層 `rgba(255,255,255,0.8)` 的白色圓角卡片底。

### 修復方案

**方案 A（優先）：用 Python rembg 重新去背**
- 安裝 `rembg` 和 `Pillow`
- 對 `IMAGES/poses/` 下所有 `pose_*.png` 執行去背，輸出為 RGBA 透明背景 PNG
- 去背後確認每張圖片的 mode 為 RGBA，背景像素 alpha = 0

**方案 B（備案）：如果 rembg 裝不起來**
- 用 Pillow 的簡單白色去除法：RGB 三通道都 > 240 的像素設為透明
- 邊緣可能會有白邊鋸齒，但至少比白底方框好

**方案 C（補充）：渲染端也要改**
- 不管去背成不成功，渲染程式碼中不要再畫白底圓角矩形
- 直接 `drawImage` 即可，讓 PNG 的透明背景自然融入鏡頭畫面

---

## 問題 2：移除 Preview 階段，統一版面配置

### 現況
目前遊戲流程：`CALIBRATION → PREVIEW（3秒全螢幕展示）→ COUNTDOWN → DETECTING → RESULT → GAME_OVER`

PREVIEW 階段把姿勢卡片放在畫面正中央，擋住玩家身體，幼兒無法預先調整姿勢。

### 修復方案

**刪除 PREVIEW 狀態**，新流程為：
```
CALIBRATION → COUNTDOWN（3秒）→ DETECTING（3秒）→ RESULT → GAME_OVER
```

**統一版面配置**（從 COUNTDOWN 到 DETECTING 到 RESULT 都一樣）：

```
┌──────────────────────────────────┐
│  [姿勢圖]  第 1/6 輪    [分數]   │
│  獅子的萬歲                       │
│  把手舉高高！                     │
│                                  │
│         （玩家全身畫面）           │
│                                  │
│  ██████████████░░░  倒數進度條    │
└──────────────────────────────────┘
```

### 各區域規格

| 元素 | 位置 | 尺寸 | 樣式 |
|------|------|------|------|
| 姿勢圖片 | 左上角，padding 約 12px | 畫面寬度 × 22%（正方形） | **無白底框**，直接 drawImage，去背透明圖 |
| 姿勢名稱 | 圖片正下方 | 自適應字體 | 橙黃色粗體（`C.accent`） |
| 提示語 | 名稱下方 | 較小字體 | 白色，帶黑色描邊（確保在任何背景上可讀） |
| 輪次 | 頂部正中央 | 中等字體 | 白色 |
| 分數 | 右上角 | 大字體（畫面高度 × 18%） | 依分數變色（綠 / 橙 / 紅） |
| 倒數進度條 | 底部，寬 60% 置中 | 高 6px | 粉紫色（`C.brand`） |

### 狀態間差異

- **COUNTDOWN**：進度條跑 3 秒，中央顯示大字 3→2→1，分數區域不顯示
- **DETECTING**：進度條跑 3 秒，顯示即時分數 + 剩餘秒數 + 影子引導 + 頭飾
- **RESULT**：顯示本輪最終分數 + 印章（PERFECT/GREAT）

### 程式碼修改要點

1. 從 `STATE` 物件中移除 `PREVIEW`
2. 刪除 `_renderPreview` 函式
3. 在狀態切換邏輯中，校準完成後直接進入 `COUNTDOWN`
4. `_renderCountdown`、`_renderDetecting`、`_renderResult` 三者都呼叫同一個 `_renderPoseCard` 來畫左上角卡片
5. `_renderPoseCard` 不要畫白底圓角矩形，直接繪製透明圖片

---

## 問題 3：頭飾重新設計 — 只要耳朵，不要框

### 現況
- 頭飾蓋住玩家臉部上半部，看起來像面具而不是戴在頭上
- 目前用了圓形框包住頭飾圖片，視覺突兀
- `IMAGES/poses/hats/hat_*.png` 都只有 ~2KB，很可能是 placeholder，需要全部重新生成

### 設計原則
目標效果是玩家頭頂上「長出」動物耳朵，像 Snapchat 的動物濾鏡那樣——輕薄、貼合、不遮臉。**不需要任何圓圈、框線、或背景。**

### 定位演算法

- 基準點：左右耳 landmark 7 和 8 的中點
- 往上偏移：臉部高度 × 0.3（讓耳朵在頭頂上方）
- 耳朵寬度 = 臉部寬度 × 0.8（左右各一隻，對稱放置）
- 不需要任何圓圈、框線、或背景

### 耳朵圖片重新生成

目前的 hat 圖片需要用 Gemini API 全部重新生成。每張圖片的通用格式如下，再加上各動物的專屬描述：

**通用 Prompt 前綴（每張都要加）：**
```
transparent background, PNG format, top-down view of animal ears only, no head, no body, no face, cute cartoon style, thick black outline 3-4px, saturated warm colors, flat 2D illustration, no shading gradient, no realistic texture, suitable for children aged 2-6, clean vector look, for children's game overlay
```

**12 組動物耳朵專屬描述：**

| 姿勢 | 動物 | 檔名 | 專屬描述 |
|------|------|------|---------|
| 萬歲 | 兔子 | `hat_hands_up.png` | two fluffy white bunny ears, tall and upright, soft pink inner ear, slightly tilted |
| 飛機 | 老鷹 | `hat_airplane.png` | two brown eagle feather tufts on top, small rounded, wild bird style |
| 大V | 狐狸 | `hat_big_v.png` | two pointy orange fox ears with white and black tips, alert and perky |
| 叉腰 | 貓咪 | `hat_hands_on_hips.png` | two orange tabby cat ears with pink inside, small and pointy, slightly tilted |
| 殭屍 | 蝙蝠 | `hat_zombie.png` | two dark purple bat ears, triangular with lighter purple inner membrane |
| 大字型 | 熊貓 | `hat_star.png` | two round black panda ears, fluffy and cute |
| 舉重 | 獅子 | `hat_weightlifter.png` | two small rounded lion ears with orange mane around them, regal look |
| 超人 | 企鵝 | `hat_superman.png` | two small round black penguin ears/head bumps, very subtle and cute |
| 稻草人 | 貓頭鷹 | `hat_scarecrow.png` | two brown owl ear tufts, feathery tips, slightly asymmetrical for character |
| 相撲 | 熊 | `hat_sumo.png` | two round brown bear ears, fluffy and rounded, simple cartoon style |
| 大猩猩 | 大猩猩 | `hat_gorilla.png` | two small dark grey gorilla ears, flat on sides, realistic but cute |
| 投降 | 小鹿 | `hat_surrender.png` | two small deer antlers with tiny velvet bumps, light brown, branching slightly |

**圖片規格：**
- 512×512 PNG，透明背景
- 只有耳朵部分，不包含頭部或臉部
- 俯視角度（top-down），因為要疊在玩家頭頂上
- 風格統一：日系圓潤卡通風，大眼睛、厚輪廓線、飽和色彩（與現有姿勢卡片一致）

---

## 驗證清單

1. [ ] 所有 `pose_*.png` 在瀏覽器中顯示為透明背景（棋盤格底）
2. [ ] 遊戲啟動後，校準完成直接進入倒數，沒有全螢幕預覽階段
3. [ ] 倒數、偵測、結算三個階段，左上角卡片位置和大小一致不跳動
4. [ ] 卡片圖片沒有白色方框底圖
5. [ ] 耳朵出現在玩家頭頂上方，不蓋住臉部，無圓形框線
6. [ ] 耳朵大小隨玩家距鏡頭遠近自動縮放（基於 landmark 7/8 耳距）
7. [ ] `hat_*.png` 全部重新生成，透明背景、> 5KB、風格統一（日系卡通、粗輪廓線）
8. [ ] 單人模式和雙人模式都正常運作
9. [ ] `node -c js/games/pose-mirror.js` 語法檢查通過
