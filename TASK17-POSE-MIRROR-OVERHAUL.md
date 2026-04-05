# TASK17 — 姿勢模仿遊戲全面修復：截斷修復 + UI 重設計 + 姿勢多樣化 + 圖片重生成

> **目標：** 修復 pose-mirror.js 被截斷的致命問題，全面重新設計 UI 和互動流程，重新設計 12 個更多樣化的姿勢，重新生成所有圖片素材
> **優先級：** P0（遊戲無法正常運作）
> **影響檔案：** `js/games/pose-mirror.js`（主要，需要補完 + 重構）、`js/pose-library.js`（姿勢重新設計）、`IMAGES/poses/`（全部重生成）、`IMAGES/poses/hats/`（全部重生成）

---

## 第一部分：致命問題 — pose-mirror.js 被截斷

### 現況
`js/games/pose-mirror.js` 在第 777 行被截斷，`_renderPoseCard()` 函式寫到一半（停在 `ctx.stroke`）。以下函式全部缺失：
- `_renderPoseCard` 的後半段（姿勢名稱、提示語的文字渲染）
- `_renderResult()`（每輪結算畫面）
- `_renderGameOver()`（遊戲結束畫面）
- `_spawnResultParticles()`（慶祝粒子效果）
- `_updateParticles()` / `_renderParticles()`（粒子更新與渲染）
- `_roundRect()`（圓角矩形工具函式）
- `handleClick(x, y)`（觸控事件處理，含「提早結束」按鈕）
- `isGameOver()`（遊戲是否結束的判斷）
- `getResults()`（回傳遊戲成績）
- `cleanup()`（資源清理）
- 模組最終的 `export default poseMirror;`

### 修復要求
**必須補齊所有缺失的函式**，讓遊戲可以正常走完整個流程。以下是各缺失函式的功能規格：

#### `_renderResult(ctx, w, h)`
- 顯示本輪結算：姿勢卡片 + 本輪最終分數 + 評級印章
- 單人模式：顯示 `_bestScore`，>= 90 顯示 PERFECT 印章，>= 70 顯示 GREAT 印章
- 雙人模式：顯示 P1/P2 各自的 `_p1Best` / `_p2Best`，標示贏家
- 印章圖片用 `IMAGES/poses/stamp_perfect.png` 和 `stamp_great.png`

#### `_renderGameOver(ctx, w, h)`
- 單人模式：顯示所有輪次的分數列表 + 平均分數 + 總評價
- 雙人模式：顯示 P1/P2 各贏幾輪 + 最終贏家
- 底部顯示「點擊結束」按鈕

#### `handleClick(x, y)`
- 遊戲進行中：檢查是否點擊了「提早結束」按鈕區域
- GAME_OVER 狀態：點擊任意位置標記遊戲結束

#### `isGameOver()` / `getResults()` / `cleanup()`
- 標準遊戲介面函式，與 ice-breaker.js / helicopter-race.js 保持一致

---

## 第二部分：UI 全面重設計（2-6 歲幼兒優化）

### A. 校準畫面 — 人形剪影取代虛線框

**目前問題：** 白色虛線矩形框太抽象，幼兒無法理解要怎麼站。

**新設計：**
- 用 Canvas 繪製一個**簡化的人形剪影**（半透明白色，alpha ≈ 0.25）
- 人形由基本形狀組成：圓形頭部 + 橢圓身體 + 四肢線條
- 人形大小約佔畫面高度 70%，居中放置
- 雙人模式：畫兩個剪影，分別在畫面左 1/3 和右 1/3 處，標示 P1（藍）/ P2（橙）
- 玩家的身體一進入畫面，剪影逐漸從白色變成綠色，表示偵測成功
- 底部文字提示保留，但字體加大（畫面高度 × 5%）

### B. 倒數階段 — 數字不擋身體

**目前問題：** 倒數數字 3-2-1 在畫面正中央，蓋住玩家臉部和身體。

**新設計：**
- 倒數數字移到**畫面下方 25% 處**（`y = h * 0.75`）
- 數字用圓形背景包裹：品牌色半透明圓（`rgba(201,79,200,0.5)`）+ 白色大字
- 圓的直徑約畫面高度 × 12%
- 數字動畫保留（縮放呼吸效果），但位置不在臉上
- 姿勢卡片從左上角正常顯示（倒數時就能看到目標姿勢）

### C. 姿勢卡片區 — 重新排版

**目前問題：** 文字超出螢幕左邊界（程式截斷 + textAlign 問題）。

**新設計（單人模式版面）：**
```
┌─────────────────────────────────────┐
│ [圖片]                    [分數/表情] │
│  動物的姿勢名          第 1/6 輪     │
│  提示語                              │
│                                     │
│          （玩家全身畫面）             │
│          （影子引導骨架）             │
│                                     │
│            ③ ← 倒數圓圈             │
│  ████████████░░░  進度條             │
└─────────────────────────────────────┘
```

| 元素 | 位置 | 尺寸 | 樣式 |
|------|------|------|------|
| 姿勢圖片 | 左上角，margin = 10 | 畫面寬度 × 20%（正方形） | 去背透明圖，無底框 |
| 姿勢名稱 | 圖片正下方，x = margin | 較大字體（h × 3.5%） | 橙黃粗體，黑色描邊，`textAlign: "left"` |
| 提示語 | 名稱下方 | 較小字體（h × 2.5%） | 白色，黑色描邊，`textAlign: "left"` |
| 輪次 | 右上角（`textAlign: "right"`，`x = w - 15`） | h × 3% | 白色 |
| 分數 | 右上角，輪次下方 | 大字（h × 12%） | 依分數變色 + 黑色描邊 |
| 即時表情 | 分數旁邊或下方 | h × 8% | ≥90→⭐ / ≥70→👍 / ≥50→💪 / <50→🔥加油 |
| 倒數數字 | 底部上方（`y = h * 0.75`） | 圓圈直徑 h × 12% | 品牌色半透明圓 + 白色數字 |
| 進度條 | 底部，寬 80% 置中 | 高 8px | 品牌色粉紫漸層 |

**雙人模式版面：**
```
┌─────────────────────────────────────┐
│ P1 [分數]   [圖片+名稱]   [分數] P2 │
│              提示語                  │
│                                     │
│   （玩家1）     │    （玩家2）       │
│                                     │
│              ③                      │
│  ████████████░░░  進度條             │
└─────────────────────────────────────┘
```
- 姿勢卡片移到**頂部正中央**
- P1 分數在左上，P2 分數在右上
- 卡片尺寸縮小到 15%

### D. 偵測階段 — 加入即時回饋

**目前問題：** 只有數字百分比，幼兒不理解意義。

**新增即時回饋機制：**
- 分數 ≥ 90：顯示大星星特效 + 卡片邊框發光（金色）
- 分數 ≥ 70：顯示讚的圖示
- 分數 ≥ 50：顯示肌肉圖示
- 分數 < 50：顯示火焰圖示 + 「加油」文字
- 這些用 Canvas 繪製即可（圓形 + emoji 文字），不需要額外圖片

### E. 結算階段 — 印章彈跳

- PERFECT / GREAT 印章用 `stamp_perfect.png` / `stamp_great.png`
- 印章從畫面外飛入，帶彈跳動畫（先放大再縮回正常大小）
- 伴隨粒子爆炸效果（五彩圓點四散）

---

## 第三部分：姿勢重新設計 — 增加多樣性

### 現有問題
目前 12 個姿勢大多是「站直 + 手臂不同位置」，太單調。需要加入更多身體部位的變化。

### 新的 12 個姿勢設計

以下是重新設計的姿勢，增加了蹲、彎腰、單腳等動作變化：

| # | ID | 名稱 | 動物 | 動作描述 | 關鍵角度特徵 |
|---|-----|------|------|---------|-------------|
| 1 | pose_hands_up | 萬歲 | 兔子 | 雙手高舉過頭，身體站直 | 肩 170°，肘 170°，腿直 |
| 2 | pose_airplane | 飛機 | 老鷹 | 雙手水平張開，像飛機翅膀 | 肩 90°，肘 170°，腿直 |
| 3 | pose_squat | 深蹲 | 青蛙 | 蹲下，雙手前伸保持平衡 | 肩 90°，膝 90°，髖 90° |
| 4 | pose_hands_on_hips | 叉腰 | 貓咪 | 雙手插腰，挺胸站立 | 肩 45°，肘 50°，腿直 |
| 5 | pose_flamingo | 金雞獨立 | 紅鶴 | 單腳站立，雙手水平 | 肩 90°，一膝 90° 抬起 |
| 6 | pose_star | 大字型 | 海星 | 全身張開成星形 | 肩 130°，肘 170°，髖 45°，腿開 |
| 7 | pose_bow | 鞠躬 | 企鵝 | 身體前彎 45 度，雙手自然下垂 | 髖 135°（前彎），軀幹傾斜 |
| 8 | pose_superman | 超人 | 獅子 | 單手指天，另一手叉腰，腿微弓 | 一肩 170°一肩 45°，不對稱 |
| 9 | pose_hug | 抱抱 | 熊 | 雙手環抱自己，身體微蹲 | 肩 30°，肘 30°（手在胸前），膝微彎 |
| 10 | pose_zombie | 殭屍 | 蝙蝠 | 雙手前伸，身體僵直前傾 | 肩 90°（前伸），肘 170°，軀幹微前傾 |
| 11 | pose_sumo | 相撲 | 大猩猩 | 馬步深蹲，雙手握拳前舉 | 髖 100°，膝 100°，肩 90° |
| 12 | pose_surrender | 投降 | 小鹿 | 雙手舉高，微微仰頭 | 肩 170°，肘 90°（手肘彎曲），腿直 |

### 與舊版差異
- **新增**：深蹲（青蛙）、金雞獨立（紅鶴）、鞠躬（企鵝）、抱抱（熊）
- **調整**：大 V → 用金雞獨立取代（增加下半身動作）、舉重 → 用深蹲取代、稻草人 → 用鞠躬取代、大猩猩 → 改為相撲的動物
- **保留**：萬歲、飛機、叉腰、大字型、超人、殭屍、相撲、投降

### pose-library.js 修改要點
- 更新 POSE_DATA 陣列，替換對應的姿勢
- 每個姿勢的 `targetAngles` 由 Claude Code 根據上述動作描述推算合理角度值
- `weights` 根據該姿勢的關鍵角度調整（比如深蹲的膝蓋權重要高、金雞獨立的單腿權重要高）
- `voiceHint` 更新為對應的幼兒友善提示語

---

## 第四部分：圖片全部重新生成

### 姿勢卡片圖片（12 張）

使用 Gemini API 重新生成所有 12 張姿勢卡片。

**通用 Prompt 前綴（每張必加）：**
```
A cute cartoon [動物] character doing [動作描述], full body visible, front view, transparent background, PNG format, cute Japanese cartoon style, thick black outline 3-4px, saturated warm colors, flat 2D illustration, no shading gradient, no realistic texture, suitable for children aged 2-6, clean vector look, 512x512
```

**12 張卡片的動物和動作：**

| 檔名 | 動物 | 動作描述（英文，給 Gemini） |
|------|------|---------------------------|
| `pose_hands_up.png` | rabbit | standing with both arms raised high above head, celebrating, jumping with joy |
| `pose_airplane.png` | eagle | standing with both arms stretched horizontally like airplane wings, looking proud |
| `pose_squat.png` | frog | squatting down low with arms reaching forward for balance, like a frog ready to jump |
| `pose_hands_on_hips.png` | cat | standing with both hands on hips, chest out, looking confident and sassy |
| `pose_flamingo.png` | flamingo | standing on one leg with the other leg lifted up, arms spread horizontally for balance |
| `pose_star.png` | starfish | standing with arms and legs spread wide apart making a star/X shape with whole body |
| `pose_bow.png` | penguin | bowing forward at the waist at 45 degrees, arms at sides, polite greeting pose |
| `pose_superman.png` | lion | one arm pointing straight up to sky, other hand on hip, heroic superhero pose |
| `pose_hug.png` | bear | arms wrapped around itself in a self-hug, slightly squatting, warm cozy expression |
| `pose_zombie.png` | bat | both arms stretched forward stiffly, body slightly leaning forward, zombie walking |
| `pose_sumo.png` | gorilla | deep wide squat with fists raised in front, powerful sumo wrestler stance |
| `pose_surrender.png` | deer | both hands raised up with elbows bent at 90 degrees, palms forward, cute surrender |

**重要：**
- 每張圖都要求 `transparent background`
- 如果 Gemini 回傳的圖片仍有白底，用 rembg 或 Pillow 做二次去背
- 確認每張圖片 > 10KB，如果太小（< 5KB）表示是 placeholder，需要重新生成

### 動物耳朵圖片（12 張）

生成到 `IMAGES/poses/hats/` 目錄。

**通用 Prompt 前綴（每張必加）：**
```
transparent background, PNG format, top-down view of animal ears only, no head, no body, no face, cute cartoon style, thick black outline 3-4px, saturated warm colors, flat 2D illustration, no shading gradient, no realistic texture, suitable for children aged 2-6, clean vector look, for children's game overlay, 512x512
```

**12 張耳朵的專屬描述：**

| 檔名 | 動物 | 專屬描述 |
|------|------|---------|
| `hat_hands_up.png` | 兔子 | two fluffy white bunny ears, tall and upright, soft pink inner ear, slightly tilted |
| `hat_airplane.png` | 老鷹 | two brown eagle feather tufts on top, small rounded, wild bird style |
| `hat_squat.png` | 青蛙 | two round green frog eyes on stalks, bulging and cute, sitting on top of head |
| `hat_hands_on_hips.png` | 貓咪 | two orange tabby cat ears with pink inside, small and pointy, slightly tilted |
| `hat_flamingo.png` | 紅鶴 | small pink flamingo feather crest, elegant and fluffy, coral pink color |
| `hat_star.png` | 海星 | two tiny orange starfish arm tips pointing up, rounded and bubbly |
| `hat_bow.png` | 企鵝 | two small round black penguin head bumps, very subtle and cute |
| `hat_superman.png` | 獅子 | two small rounded lion ears with orange mane around them, regal look |
| `hat_hug.png` | 熊 | two round brown bear ears, fluffy and rounded, simple cartoon style |
| `hat_zombie.png` | 蝙蝠 | two dark purple bat ears, triangular with lighter purple inner membrane |
| `hat_sumo.png` | 大猩猩 | two small dark grey gorilla ears, flat on sides, realistic but cute |
| `hat_surrender.png` | 小鹿 | two small deer antlers with tiny velvet bumps, light brown, branching slightly |

---

## 第五部分：頭飾定位修正

### 目前程式碼（_renderHat）的錨點邏輯
目前用 landmark 7/8（耳朵），已經比較好了。但有一個 bug：

```javascript
const headCX = ((1 - leftEar.x) + (1 - rightEar.x)) / 2 * w;  // 鏡像翻轉
```

這行的鏡像翻轉邏輯有問題。MediaPipe 回傳的 x 座標在鏡頭翻轉後可能已經是正確的（取決於 main.js 裡鏡頭 canvas 是否已經做了 `ctx.scale(-1, 1)` 翻轉）。需要確認：
- 如果 canvas 已經做了水平翻轉 → headCX 不需要再 `1 - x`
- 如果 canvas 沒有翻轉 → 才需要 `1 - x`

### 定位規格（不變）
- 基準點：左右耳 landmark 7 和 8 的中點
- 往上偏移：臉部高度 × 0.3
- 耳朵寬度 = 臉部寬度 × 0.8（左右對稱）
- 不要圓形框，直接繪製 PNG

---

## 驗證清單

1. [ ] `node -c js/games/pose-mirror.js` 語法檢查通過
2. [ ] 遊戲能完整走完：校準 → 倒數 → 偵測 → 結算 → ... → 遊戲結束
3. [ ] 校準畫面有人形剪影引導（非虛線矩形）
4. [ ] 倒數數字在畫面下方，不擋住玩家身體
5. [ ] 姿勢卡片在左上角，文字沒有超出螢幕邊界
6. [ ] 偵測時有即時表情回饋（星星/讚/加油）
7. [ ] 結算畫面有印章動畫和分數顯示
8. [ ] 遊戲結束畫面有總成績和「點擊結束」功能
9. [ ] 12 張姿勢卡片全部重新生成，透明背景，> 10KB
10. [ ] 12 張耳朵圖片全部重新生成，透明背景，> 5KB
11. [ ] 新姿勢（青蛙深蹲、紅鶴金雞獨立、企鵝鞠躬、熊抱抱）的 targetAngles 合理
12. [ ] 頭飾正確顯示在玩家頭頂，不蓋住臉
13. [ ] 單人模式和雙人模式都正常運作
14. [ ] handleClick 可正常觸發提早結束和遊戲結束
