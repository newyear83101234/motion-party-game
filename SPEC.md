# 體感派對遊戲 — 開發規格書

> 版本：1.0 | 最後更新：2026-04-04

---

## 1. 專案總覽

### 1.1 產品定位
一款透過手機前置鏡頭進行體感操控的派對遊戲，支援單人與雙人模式，包含三款迷你遊戲。玩家無需額外控制器，僅靠身體動作即可遊玩。

### 1.2 技術棧
| 項目 | 選型 |
|------|------|
| 前端框架 | 純 HTML5 + Canvas + ES Modules（無打包工具） |
| 姿態偵測 | `@mediapipe/tasks-vision` — 僅使用 **PoseLandmarker** 單一模型 |
| CDN 來源 | jsDelivr（`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm`） |
| 音效引擎 | Web Audio API |
| 部署目標 | Netlify 或 Vercel（純靜態站台） |
| 本地測試 | `local-ssl-proxy`（手機需 HTTPS 才能存取鏡頭） |

### 1.3 不使用的技術
- **不使用** npm / Webpack / Vite 等打包工具
- **不使用** HandLandmarker、FaceLandmarker 等其他 MediaPipe 模型
- **不使用** 任何後端伺服器（純前端靜態）

---

## 2. MediaPipe PoseLandmarker 設定

### 2.1 模型載入
```javascript
import { PoseLandmarker, FilesetResolver } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
);

const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
    delegate: "GPU"               // 優先 GPU，失敗時自動回退 CPU
  },
  runningMode: "VIDEO",
  numPoses: 1                     // 單人模式預設值；雙人改為 2
});
```

### 2.2 使用的骨架關鍵點（33 點中的重點）
| 索引 | 名稱 | 用途 |
|------|------|------|
| 0 | nose | 姿勢模仿：頭部位置 |
| 11, 12 | left_shoulder, right_shoulder | 直升機：身體傾斜計算；姿勢模仿 |
| 13, 14 | left_elbow, right_elbow | 姿勢模仿：手臂角度 |
| 15, 16 | left_wrist, right_wrist | **敲冰塊：碰撞偵測主要點** |
| 23, 24 | left_hip, right_hip | 直升機：身體傾斜計算；姿勢模仿 |
| 25, 26 | left_knee, right_knee | 姿勢模仿：腿部角度 |
| 27, 28 | left_ankle, right_ankle | 姿勢模仿：腿部角度 |

### 2.3 偵測迴圈
```javascript
function detectFrame(timestamp) {
  const result = poseLandmarker.detectForVideo(videoElement, timestamp);
  // result.landmarks[0] = 第一位玩家的 33 個關鍵點
  // result.landmarks[1] = 第二位玩家的 33 個關鍵點（雙人模式）
  currentGame.update(result.landmarks);
  currentGame.render(ctx);
  requestAnimationFrame(detectFrame);
}
```

---

## 3. 遊戲模式

### 3.1 單人模式
- `numPoses: 1`
- 所有三款遊戲皆可單人遊玩
- 計分後顯示個人最高紀錄（localStorage）

### 3.2 雙人模式
- **主方案**：`numPoses: 2`，兩人同時入鏡，同時遊玩
- **備案**（效能不足時）：輪流模式 — 每人一回合交替進行，最終比較分數
- **切換條件**：若偵測到 `numPoses: 2` 時 FPS 持續低於 15 達 3 秒，自動提示切換為輪流模式

### 3.3 模式偵測邏輯
```
啟動遊戲 → 偵測畫面中人數
  → 偵測到 1 人 → 進入單人模式
  → 偵測到 2 人 → 嘗試雙人模式
    → FPS ≥ 15 → 維持雙人同時
    → FPS < 15 持續 3 秒 → 提示切換輪流模式
```

---

## 4. 迷你遊戲規格

### 4.1 遊戲一：敲冰塊（Ice Breaker）

#### 概念
冰塊從畫面上方落下，玩家揮動手腕敲碎冰塊得分。

#### 遊戲機制
- **操控方式**：追蹤雙手手腕（landmark 15, 16）的位置
- **冰塊生成**：隨機從畫面上方落下
- **遊戲時間**：60 秒一回合
- **生命值**：無（純計分制）

#### 冰塊類型
| 類型 | 顏色 | 大小(px) | 分數 | 掉落速度 | 出現機率 |
|------|------|----------|------|----------|----------|
| 普通冰塊 | 淡藍 `#A8D8EA` | 80×80 | +10 | 基礎速度 | 60% |
| 金色冰塊 | 金色 `#FFD700` | 60×60 | +30 | 基礎速度 ×1.2 | 15% |
| 炸彈冰塊 | 黑色 `#333333` | 70×70 | -20 | 基礎速度 ×0.8 | 15% |
| 巨大冰塊 | 深藍 `#4A90D9` | 120×120 | +50 | 基礎速度 ×0.6 | 10%（需敲 3 次） |

#### 碰撞偵測公式
```javascript
// 手腕與冰塊中心的歐氏距離
const dx = wrist.x * canvasWidth - block.centerX;
const dy = wrist.y * canvasHeight - block.centerY;
const distance = Math.sqrt(dx * dx + dy * dy);

// 碰撞半徑 = 冰塊半徑 + 手腕容許半徑(30px)
const hitRadius = block.size / 2 + 30;
const isHit = distance < hitRadius;

// 揮動速度門檻（防止靜止手放在冰塊上得分）
// 需比較當前幀與前一幀的手腕位移
const wristSpeed = Math.sqrt(
  (wrist.x - prevWrist.x) ** 2 + (wrist.y - prevWrist.y) ** 2
);
const MIN_SWIPE_SPEED = 0.02; // 歸一化座標下的最小速度
const validHit = isHit && wristSpeed > MIN_SWIPE_SPEED;
```

#### 難度曲線
| 時間區間 | 冰塊生成間隔(ms) | 掉落速度(px/frame) | 同時最大冰塊數 |
|----------|------------------|---------------------|----------------|
| 0–15 秒 | 1200 | 3 | 4 |
| 15–30 秒 | 900 | 4 | 6 |
| 30–45 秒 | 700 | 5 | 8 |
| 45–60 秒 | 500 | 6 | 10 |

#### 雙人模式差異
- 畫面左右分割，各自半場有冰塊落下
- 各自計分，回合結束後比較

---

### 4.2 遊戲二：姿勢模仿（Pose Match）

#### 概念
畫面顯示目標姿勢剪影，玩家需在倒數時間內模仿該姿勢，越接近得分越高。

#### 遊戲機制
- **操控方式**：全身骨架角度比對
- **回合制**：共 10 個姿勢，每個姿勢限時 5 秒
- **判定方式**：取限時內最高匹配分數

#### 目標姿勢庫（Phase 1 最少 8 個）
| 姿勢名稱 | 描述 | 難度 |
|----------|------|------|
| T-Pose | 雙手水平張開 | ★☆☆ |
| 舉手歡呼 | 雙手高舉過頭呈 V 字 | ★☆☆ |
| 單腳站立 | 一腳抬起，雙手平伸 | ★★☆ |
| 蹲下 | 雙膝彎曲下蹲 | ★☆☆ |
| 三角形 | 雙手在頭頂合攏成三角 | ★★☆ |
| 弓箭步 | 一腳前一腳後的弓步 | ★★☆ |
| 超人飛行 | 一手前伸一手後擺 | ★★★ |
| 樹式 | 瑜伽樹式：單腳站，雙手合十舉高 | ★★★ |

#### 角度比對公式
```javascript
// 計算三個關鍵點形成的角度
function calcAngle(a, b, c) {
  // b 是關節點（角的頂點），a 和 c 是兩側
  const radians = Math.atan2(c.y - b.y, c.x - b.x)
                - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * 180 / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

// 需要比對的關節角度組（共 8 個角度）
const ANGLE_PAIRS = [
  [11, 13, 15],  // 左肩-左肘-左腕（左手肘角度）
  [12, 14, 16],  // 右肩-右肘-右腕（右手肘角度）
  [13, 11, 23],  // 左肘-左肩-左臀（左肩角度）
  [14, 12, 24],  // 右肘-右肩-右臀（右肩角度）
  [11, 23, 25],  // 左肩-左臀-左膝（左臀角度）
  [12, 24, 26],  // 右肩-右臀-右膝（右臀角度）
  [23, 25, 27],  // 左臀-左膝-左踝（左膝角度）
  [24, 26, 28],  // 右臀-右膝-右踝（右膝角度）
];

// 匹配分數計算
function calcMatchScore(playerLandmarks, targetAngles) {
  let totalDiff = 0;
  for (const [i, j, k] of ANGLE_PAIRS) {
    const playerAngle = calcAngle(
      playerLandmarks[i], playerLandmarks[j], playerLandmarks[k]
    );
    const targetAngle = targetAngles[`${i}_${j}_${k}`];
    totalDiff += Math.abs(playerAngle - targetAngle);
  }
  // 平均角度差 → 0~100 分
  const avgDiff = totalDiff / ANGLE_PAIRS.length;
  // 角度差 0° = 100分，角度差 ≥45° = 0分
  const score = Math.max(0, Math.round(100 - (avgDiff / 45) * 100));
  return score;
}
```

#### 評分等級
| 匹配分數 | 等級 | 顯示文字 | 得分 |
|----------|------|----------|------|
| 90–100 | Perfect | ⭐ PERFECT! | 100 |
| 70–89 | Great | 👍 GREAT! | 70 |
| 50–69 | Good | 👌 GOOD | 40 |
| 30–49 | OK | 🤔 OK | 20 |
| 0–29 | Miss | ❌ MISS | 0 |

#### 難度曲線
| 回合 | 姿勢難度 | 倒數秒數 | 備註 |
|------|----------|----------|------|
| 1–3 | ★☆☆ | 6 秒 | 暖身 |
| 4–6 | ★★☆ | 5 秒 | 正常 |
| 7–8 | ★★★ | 4 秒 | 挑戰 |
| 9–10 | 隨機 | 3 秒 | 衝刺 |

#### 雙人模式差異
- 兩人同時模仿同一個姿勢
- 各自計算匹配分數，回合結束後比較總分

---

### 4.3 遊戲三：直升機競賽（Helicopter Race）

#### 概念
玩家操控一架直升機，透過身體左右傾斜控制方向，閃避障礙物並收集金幣。

#### 遊戲機制
- **操控方式**：身體傾斜角度控制直升機水平移動
- **遊戲時間**：無限制，直到撞到障礙物（生命值歸零）
- **生命值**：3 顆心

#### 傾斜角度計算
```javascript
// 使用雙肩中點與雙臀中點的連線計算身體傾斜角
function calcBodyTilt(landmarks) {
  const shoulderMid = {
    x: (landmarks[11].x + landmarks[12].x) / 2,
    y: (landmarks[11].y + landmarks[12].y) / 2
  };
  const hipMid = {
    x: (landmarks[23].x + landmarks[24].x) / 2,
    y: (landmarks[23].y + landmarks[24].y) / 2
  };
  // 計算傾斜角（弧度），正值 = 向右傾斜
  const tiltRad = Math.atan2(
    shoulderMid.x - hipMid.x,
    hipMid.y - shoulderMid.y   // y 軸向下，所以用 hip - shoulder
  );
  return tiltRad;  // 約 -0.5 ~ +0.5 弧度為正常活動範圍
}

// 直升機水平位移
const TILT_SENSITIVITY = 8;     // 傾斜靈敏度（px/frame per radian）
const DEAD_ZONE = 0.05;         // 死區（弧度），避免靜止時微動
const MAX_SPEED = 6;            // 最大水平移動速度(px/frame)

function updateHelicopter(tiltRad) {
  let speed = 0;
  if (Math.abs(tiltRad) > DEAD_ZONE) {
    speed = (tiltRad - Math.sign(tiltRad) * DEAD_ZONE) * TILT_SENSITIVITY;
    speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
  }
  helicopter.x += speed;
  // 限制邊界
  helicopter.x = Math.max(0, Math.min(canvasWidth - helicopter.width, helicopter.x));
}
```

#### 場景元素
| 元素 | 大小(px) | 效果 | 顏色 |
|------|----------|------|------|
| 直升機 | 50×40 | 玩家操控角色 | 綠色 `#4CAF50` |
| 障礙物（柱子）| 寬60, 高隨機 | 撞到扣 1 心 | 灰色 `#757575` |
| 金幣 | 30×30 | +10 分 | 金色 `#FFC107` |
| 加速道具 | 25×25 | 捲動加速 5 秒 | 紅色 `#F44336` |
| 護盾道具 | 25×25 | 免疫 1 次碰撞 | 藍色 `#2196F3` |

#### 障礙物生成
```javascript
// 柱子從右側進入，向左捲動（類似 Flappy Bird 橫版）
// 上下柱子間留出通道
const MIN_GAP = 150;       // 最小通道高度(px)
const SCROLL_SPEED = 3;    // 基礎捲動速度(px/frame)

function spawnPillar() {
  const gapY = random(MIN_GAP, canvasHeight - MIN_GAP);
  const gapHeight = currentGap;  // 隨難度遞減
  return {
    x: canvasWidth,
    gapTop: gapY - gapHeight / 2,
    gapBottom: gapY + gapHeight / 2,
    width: 60,
    passed: false
  };
}
```

#### 碰撞偵測（AABB）
```javascript
function checkCollision(heli, pillar) {
  // 直升機矩形 vs 上方柱子
  const hitTop = heli.x < pillar.x + pillar.width &&
                 heli.x + heli.width > pillar.x &&
                 heli.y < pillar.gapTop;
  // 直升機矩形 vs 下方柱子
  const hitBottom = heli.x < pillar.x + pillar.width &&
                    heli.x + heli.width > pillar.x &&
                    heli.y + heli.height > pillar.gapBottom;
  return hitTop || hitBottom;
}
```

#### 難度曲線
| 存活時間 | 捲動速度 | 柱子間距(px) | 通道高度(px) | 金幣頻率 |
|----------|----------|-------------|-------------|----------|
| 0–20 秒 | 3 | 300 | 200 | 每根柱子 1 個 |
| 20–40 秒 | 4 | 260 | 180 | 每根柱子 1 個 |
| 40–60 秒 | 5 | 220 | 160 | 每 2 根柱子 1 個 |
| 60 秒+ | 5.5 | 200 | 140 | 每 2 根柱子 1 個 |

#### 雙人模式差異
- 畫面上下分割，各自一條賽道
- 各自操控各自的直升機
- 比較誰存活更久或分數更高

---

## 5. 共用遊戲引擎介面

### 5.1 模組介面
每個迷你遊戲必須實作以下介面：

```javascript
// games/ice-breaker.js | games/pose-match.js | games/helicopter.js
export default {
  name: "ice-breaker",        // 遊戲識別名
  displayName: "敲冰塊",      // 顯示名稱

  init(ctx, options) {},       // 初始化（接收 canvas context 與設定）
  update(landmarks, dt) {},    // 每幀更新（接收骨架資料與 deltaTime）
  render(ctx) {},              // 每幀繪製
  getScore() {},               // 取得當前分數
  isGameOver() {},             // 是否結束
  destroy() {},                // 清理資源
};
```

### 5.2 options 參數
```javascript
{
  mode: "single" | "dual",     // 遊戲模式
  canvasWidth: 640,
  canvasHeight: 480,
  playerCount: 1 | 2,
  audioManager: AudioManager,  // 音效管理器實例
}
```

---

## 6. 專案結構

```
motion-party-game/
├── index.html                  # 主頁面
├── css/
│   └── style.css               # 全域樣式
├── js/
│   ├── main.js                 # 進入點：初始化鏡頭、PoseLandmarker、遊戲選單
│   ├── pose-engine.js          # PoseLandmarker 封裝（載入模型、偵測迴圈）
│   ├── game-engine.js          # 遊戲引擎：管理遊戲生命週期、計分、計時
│   ├── audio-manager.js        # Web Audio API 音效管理
│   ├── ui-manager.js           # UI 狀態管理（選單、分數顯示、結算畫面）
│   └── utils.js                # 工具函式（角度計算、碰撞偵測、向量運算）
├── js/games/
│   ├── ice-breaker.js          # 敲冰塊
│   ├── pose-match.js           # 姿勢模仿
│   └── helicopter.js           # 直升機競賽
├── assets/
│   └── sounds/                 # 音效檔（.mp3 或 .wav）
├── CLAUDE.md
├── SPEC.md
└── README.md
```

---

## 7. UI 規格

### 7.1 畫面佈局（手機直式 Portrait）
```
┌──────────────────────┐
│     [遊戲標題列]       │  ← 高 40px，顯示遊戲名稱 + 分數
├──────────────────────┤
│                      │
│                      │
│    [鏡頭畫面 +        │  ← Canvas 區域，佔滿剩餘空間
│     遊戲元素疊加]      │     鏡頭影像 + 骨架線 + 遊戲物件
│                      │
│                      │
├──────────────────────┤
│  [計時/生命/狀態列]    │  ← 高 50px，遊戲狀態資訊
└──────────────────────┘
```

### 7.2 主選單
- 全螢幕 Canvas 背景
- 遊戲標題：「體感派對」
- 三個遊戲卡片，點擊進入
- 每張卡片顯示：遊戲名稱 + 簡短說明 + 最高紀錄

### 7.3 遊戲內 HUD
| 元素 | 位置 | 格式 |
|------|------|------|
| 分數 | 右上角 | `SCORE: 0000` 白色粗體 |
| 計時器 | 左上角 | `00:45` 倒數或正數 |
| 生命值 | 左上角（計時下方）| ❤️ ×3（直升機用） |
| FPS | 左下角（僅 debug） | `FPS: 28` 半透明灰色 |
| 倒數提示 | 畫面中央 | 3 → 2 → 1 → GO! |

### 7.4 結算畫面
- 遮罩覆蓋遊戲畫面（半透明黑色）
- 顯示最終分數、最高紀錄、評價等級
- 雙人模式額外顯示勝負結果
- 按鈕：「再玩一次」「回選單」

### 7.5 鏡頭影像處理
- Canvas 繪製時需 **水平翻轉**（mirror），讓玩家看到鏡像
- 半透明繪製鏡頭畫面（`globalAlpha = 0.3`），遊戲元素在上層

---

## 8. 音效規格

### 8.1 音效列表
| 音效 ID | 用途 | 生成方式 | 頻率/波形 |
|---------|------|----------|-----------|
| `hit` | 敲中冰塊 | Web Audio 合成 | 短促高頻脈衝 800Hz, 持續 80ms |
| `hit_gold` | 敲中金色冰塊 | Web Audio 合成 | 上升音階 800→1200Hz, 持續 150ms |
| `hit_bomb` | 敲中炸彈 | Web Audio 合成 | 低頻爆炸 150Hz, 持續 200ms |
| `hit_big` | 敲巨大冰塊（每次）| Web Audio 合成 | 中頻碎裂 500Hz, 持續 100ms |
| `pose_perfect` | 姿勢 Perfect | Web Audio 合成 | 上升三和弦 C-E-G, 持續 300ms |
| `pose_good` | 姿勢 Good 以上 | Web Audio 合成 | 單音 E5, 持續 150ms |
| `pose_miss` | 姿勢 Miss | Web Audio 合成 | 下降音 400→200Hz, 持續 200ms |
| `coin` | 收集金幣 | Web Audio 合成 | 短促高音 1000Hz, 持續 50ms |
| `crash` | 直升機碰撞 | Web Audio 合成 | 噪音波 + 低頻, 持續 300ms |
| `countdown` | 倒數計時 | Web Audio 合成 | 短嗶 600Hz, 持續 100ms |
| `game_start` | 遊戲開始 | Web Audio 合成 | 上升掃頻 300→800Hz, 持續 400ms |
| `game_over` | 遊戲結束 | Web Audio 合成 | 下降掃頻 800→200Hz, 持續 500ms |

### 8.2 AudioManager 介面
```javascript
class AudioManager {
  constructor() {}
  play(soundId) {}          // 播放指定音效
  setVolume(level) {}       // 0.0 ~ 1.0
  mute() {}                 // 靜音
  unmute() {}               // 取消靜音
}
```

### 8.3 音效原則
- 所有音效使用 Web Audio API **即時合成**，Phase 1 不載入外部音檔
- 音效延遲需 < 50ms
- 預設音量 0.5，可調整

---

## 9. 效能規格與 Phase 1 Go/No-Go 門檻

### 9.1 目標裝置
- 中階 Android 手機（如 Pixel 6a、Samsung A54）
- iPhone SE 2 以上
- Chrome / Safari 最新版

### 9.2 Phase 1 Go/No-Go 門檻（必須全部通過）
| 指標 | 門檻 | 量測方式 |
|------|------|----------|
| **偵測 FPS** | ≥ 20 fps（單人模式） | 連續 10 秒取平均，`performance.now()` 計算 |
| **端到端延遲** | < 150ms（動作→畫面回饋） | 時間戳差值：`detectForVideo` 呼叫前 vs render 完成 |
| **鏡頭啟動時間** | < 5 秒 | 從 `getUserMedia` resolve 到第一幀偵測結果 |
| **模型載入時間** | < 10 秒（WiFi 環境） | 從 `createFromOptions` 開始到 resolve |
| **記憶體使用** | < 300MB | Chrome DevTools Performance Monitor |
| **骨架穩定性** | 靜止時關鍵點抖動 < 5px | 連續 30 幀同一關鍵點的標準差 |

### 9.3 效能監控
```javascript
// 內建 FPS 計數器
class PerfMonitor {
  constructor() {
    this.frames = [];
    this.lastTime = 0;
  }
  tick(timestamp) {
    this.frames.push(timestamp);
    // 保留最近 60 幀
    if (this.frames.length > 60) this.frames.shift();
  }
  getFPS() {
    if (this.frames.length < 2) return 0;
    const elapsed = this.frames[this.frames.length - 1] - this.frames[0];
    return Math.round((this.frames.length - 1) / (elapsed / 1000));
  }
}
```

---

## 10. 手機測試方案

### 10.1 問題
手機瀏覽器要求 HTTPS 才能存取 `getUserMedia`（鏡頭），但本地開發使用 HTTP。

### 10.2 解決方案：local-ssl-proxy
```bash
# 安裝（全域一次性）
npm install -g local-ssl-proxy

# 啟動本地靜態伺服器（例如用 Python）
python -m http.server 8080

# 啟動 SSL proxy（另一個終端）
local-ssl-proxy --source 8443 --target 8080
```

### 10.3 手機連線步驟
1. 電腦與手機連接同一 WiFi
2. 找到電腦區域網路 IP（如 `192.168.1.100`）
3. 手機瀏覽器開啟 `https://192.168.1.100:8443`
4. 接受自簽憑證警告
5. 允許鏡頭權限

### 10.4 替代方案
- VS Code Live Server + mkcert
- ngrok（`ngrok http 8080`，自動提供 HTTPS）

---

## 11. 開發階段

### Phase 1：技術驗證（MVP）
**目標**：驗證 PoseLandmarker 在手機上的可行性

交付項目：
- [x] 專案結構建立
- [ ] PoseLandmarker 載入與鏡頭串接
- [ ] 骨架關鍵點即時繪製（debug 視覺化）
- [ ] FPS 監控與顯示
- [ ] 單人模式下達到 Go/No-Go 門檻
- [ ] 基礎遊戲選單 UI
- [ ] 完成「敲冰塊」基礎版（碰撞偵測 + 計分）

**Go/No-Go 檢查**：手機 FPS ≥ 20、延遲 < 150ms

### Phase 2：核心遊戲
- [ ] 完成三款迷你遊戲
- [ ] 音效系統整合
- [ ] 雙人模式實作
- [ ] 計分與最高紀錄系統

### Phase 3：打磨
- [ ] UI 美化與動畫
- [ ] 遊戲平衡調整
- [ ] 更多姿勢庫
- [ ] 部署上線

---

## 12. 鏡頭與 Canvas 座標系

### 12.1 座標轉換
- MediaPipe 回傳的 landmark 座標為 **歸一化座標**（0.0 ~ 1.0）
- 轉換為 Canvas 像素座標：`pixelX = landmark.x * canvasWidth`，`pixelY = landmark.y * canvasHeight`
- 因為使用前置鏡頭 + 鏡像翻轉，x 座標需翻轉：`mirroredX = canvasWidth - pixelX`

### 12.2 Canvas 設定
```javascript
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 鏡頭影像繪製（鏡像翻轉）
ctx.save();
ctx.scale(-1, 1);
ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
ctx.restore();
```

---

## 附錄 A：PoseLandmarker 33 個關鍵點索引

```
 0: nose               1: left_eye_inner     2: left_eye
 3: left_eye_outer     4: right_eye_inner    5: right_eye
 6: right_eye_outer    7: left_ear           8: right_ear
 9: mouth_left        10: mouth_right       11: left_shoulder
12: right_shoulder    13: left_elbow        14: right_elbow
15: left_wrist        16: right_wrist       17: left_pinky
18: right_pinky       19: left_index        20: right_index
21: left_thumb        22: right_thumb       23: left_hip
24: right_hip         25: left_knee         26: right_knee
27: left_ankle        28: right_ankle       29: left_heel
30: right_heel        31: left_foot_index   32: right_foot_index
```
