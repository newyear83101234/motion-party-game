# TASK15 — 姿勢模仿遊戲增強：去背、影子引導、雙人模式、音效、頭飾特效

> **目標：** 完善姿勢模仿遊戲的六大項目：圖片去背、影子引導系統（P0）、雙人模式、音效整合、頭部特效、UI 調整
> **優先級：** P0（核心體驗）
> **預估影響檔案：** 修改 `js/games/pose-mirror.js`、`js/pose-library.js`、`js/audio-manager.js`、`js/main.js`，新增 `IMAGES/poses/hats/` 目錄，新增 `scripts/remove-bg.py`、`scripts/generate-hats.py`

---

## 步驟 0：圖片去背（將白底轉為透明背景）

### 0.1 安裝依賴

```bash
pip install rembg onnxruntime Pillow --break-system-packages
```

如果 `rembg` 安裝失敗（可能因為 onnxruntime 版本衝突），改用 Pillow 白底去除法：

```bash
pip install Pillow --break-system-packages
```

### 0.2 建立去背腳本 `scripts/remove-bg.py`

```python
"""
姿勢卡片圖片去背腳本
將白色背景轉為透明，只保留動物圖案
"""
import os
from PIL import Image

INPUT_DIR = "IMAGES/poses"
# 就地覆蓋原檔案（去背後直接替換）

def remove_white_bg(img_path):
    """將白色/接近白色的背景轉為透明"""
    img = Image.open(img_path).convert("RGBA")
    data = img.getdata()

    new_data = []
    # 白色容差：RGB 每個通道 > 240 就視為白色背景
    threshold = 240
    for item in data:
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            new_data.append((255, 255, 255, 0))  # 完全透明
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(img_path, "PNG")
    return True

def main():
    print("=" * 50)
    print("姿勢卡片圖片去背")
    print("=" * 50)

    # 只處理 pose_*.png（不處理 stamp 和 title）
    files = [f for f in os.listdir(INPUT_DIR) if f.startswith("pose_") and f.endswith(".png")]

    for f in sorted(files):
        filepath = os.path.join(INPUT_DIR, f)
        print(f"  處理中: {f}...", end=" ")
        try:
            remove_white_bg(filepath)
            print("✓ 完成")
        except Exception as e:
            print(f"✗ 錯誤: {e}")

    print(f"\n去背完成，共處理 {len(files)} 張圖片")

if __name__ == "__main__":
    main()
```

### 0.3 執行

```bash
python scripts/remove-bg.py
```

### 0.4 驗證

用瀏覽器開啟任一張 `IMAGES/poses/pose_*.png`，確認背景是透明的（棋盤格底）而不是白色。

---

## 步驟 1：用 Gemini API 生成 12 頂動物頭飾圖片

### 1.1 建立頭飾目錄

```bash
mkdir -p IMAGES/poses/hats
```

### 1.2 建立頭飾生成腳本 `scripts/generate-hats.py`

```python
"""
姿勢模仿遊戲 — 動物頭飾圖片批量生成
使用 Gemini API 生成 12 頂與姿勢動物對應的頭飾
"""
import os
import io
import time
from google import genai
from google.genai import types
from PIL import Image

API_KEY = "AIzaSyBQW0A0UAJ_FqK3rSq62HC8M6ImjjXs4dQ"
client = genai.Client(api_key=API_KEY)
MODEL = "gemini-2.0-flash-preview-image-generation"

OUTPUT_DIR = "IMAGES/poses/hats"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── 12 頂頭飾定義 ──
HATS = [
    {
        "filename": "hat_hands_up.png",
        "animal": "golden retriever dog",
        "desc": "cute floppy golden retriever dog ears headband, front view",
    },
    {
        "filename": "hat_airplane.png",
        "animal": "eagle",
        "desc": "cute eagle head cap with small beak visor and feather crest on top, front view",
    },
    {
        "filename": "hat_big_v.png",
        "animal": "rabbit",
        "desc": "cute tall rabbit ears headband, pink inner ears, front view",
    },
    {
        "filename": "hat_hands_on_hips.png",
        "animal": "cat",
        "desc": "cute orange tabby cat ears headband with small bell collar, front view",
    },
    {
        "filename": "hat_zombie.png",
        "animal": "panda",
        "desc": "cute round panda ears headband, black and white, front view",
    },
    {
        "filename": "hat_star.png",
        "animal": "lion",
        "desc": "cute lion mane headdress forming a circle around the head, golden brown, front view",
    },
    {
        "filename": "hat_weightlifter.png",
        "animal": "bear",
        "desc": "cute round brown bear ears headband, simple and round, front view",
    },
    {
        "filename": "hat_superman.png",
        "animal": "penguin",
        "desc": "cute penguin head hood hat, black and white with orange beak on forehead, front view",
    },
    {
        "filename": "hat_scarecrow.png",
        "animal": "owl",
        "desc": "cute owl ear tufts headband with big round owl eyes on top, brown feathery, front view",
    },
    {
        "filename": "hat_sumo.png",
        "animal": "big bear",
        "desc": "cute sumo-style topknot hair bun on a bear ears headband, front view",
    },
    {
        "filename": "hat_gorilla.png",
        "animal": "gorilla",
        "desc": "cute dark gorilla forehead ridge headband with small ears, front view",
    },
    {
        "filename": "hat_surrender.png",
        "animal": "fox",
        "desc": "cute pointed orange fox ears headband with white inner ear tips, front view",
    },
]

PROMPT_TEMPLATE = """Create a single illustration of a {desc}.

Style requirements:
- Simple flat cartoon illustration, kawaii cute style
- Bold black outlines, bright cheerful colors
- Pure white background, absolutely nothing else in the image
- The headband/hat should be shown from the FRONT VIEW
- It should look like it can be worn on a child's head
- NO face, NO body, ONLY the headband/hat accessory itself
- NO text, NO labels, NO watermarks
- Centered in the image with some padding around it
- Size: suitable to overlay on top of a person's head in a game"""


def generate_and_save(prompt, filepath, max_retries=3):
    """呼叫 Gemini API 生成圖片並儲存"""
    for attempt in range(max_retries):
        try:
            print(f"  生成中 (第 {attempt + 1} 次)...")
            response = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["Text", "Image"]
                ),
            )
            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    img = Image.open(io.BytesIO(part.inline_data.data))
                    img = img.resize((256, 256), Image.LANCZOS)
                    img.save(filepath, "PNG", quality=95)
                    print(f"  ✓ 已儲存: {filepath}")
                    return True
            print(f"  ✗ 回應中沒有圖片，重試...")
        except Exception as e:
            print(f"  ✗ 錯誤: {e}")
            if attempt < max_retries - 1:
                wait = 10 * (attempt + 1)
                print(f"  等待 {wait} 秒後重試...")
                time.sleep(wait)
    print(f"  ✗✗✗ 生成失敗: {filepath}")
    return False


def remove_white_bg(filepath):
    """將白色背景轉為透明"""
    img = Image.open(filepath).convert("RGBA")
    data = img.getdata()
    new_data = []
    for item in data:
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
    img.putdata(new_data)
    img.save(filepath, "PNG")


def main():
    print("=" * 60)
    print("姿勢模仿遊戲 — 動物頭飾批量生成")
    print("=" * 60)

    success = 0
    for i, hat in enumerate(HATS):
        filepath = os.path.join(OUTPUT_DIR, hat["filename"])
        print(f"\n[{i+1}/{len(HATS)}] {hat['animal']} 頭飾")
        prompt = PROMPT_TEMPLATE.format(desc=hat["desc"])
        if generate_and_save(prompt, filepath):
            # 生成後立刻去背
            print(f"  去背中...", end=" ")
            try:
                remove_white_bg(filepath)
                print("✓")
            except:
                print("（跳過）")
            success += 1
        if i < len(HATS) - 1:
            time.sleep(3)

    print(f"\n完成！成功: {success}/{len(HATS)}")

if __name__ == "__main__":
    main()
```

### 1.3 執行

```bash
python scripts/generate-hats.py
```

### 1.4 驗證

`IMAGES/poses/hats/` 下應有 12 個透明背景的 PNG 檔案。

---

## 步驟 2：修改 `js/pose-library.js` — 加入音檔路徑與頭飾路徑

### 2.1 在每個姿勢資料中新增兩個欄位

在 POSE_DATA 陣列中，為每個姿勢物件加入 `voiceFile` 和 `hatImage` 欄位。

**第 1 個姿勢（pose_hands_up）：** 在 `voiceHint: "把手舉高高！",` 這行後面加入：

```javascript
    voiceFile: "MUSIC/pose_01_wansui.wav",
    hatImage: "IMAGES/poses/hats/hat_hands_up.png",
```

**第 2 個姿勢（pose_airplane）：**

```javascript
    voiceFile: "MUSIC/pose_02_airplane.wav",
    hatImage: "IMAGES/poses/hats/hat_airplane.png",
```

**第 3 個姿勢（pose_big_v）：**

```javascript
    voiceFile: "MUSIC/pose_03_bigv.wav",
    hatImage: "IMAGES/poses/hats/hat_big_v.png",
```

**第 4 個姿勢（pose_hands_on_hips）：**

```javascript
    voiceFile: "MUSIC/pose_04_handsonhips.wav",
    hatImage: "IMAGES/poses/hats/hat_hands_on_hips.png",
```

**第 5 個姿勢（pose_zombie）：**

```javascript
    voiceFile: "MUSIC/pose_05_zombie.wav",
    hatImage: "IMAGES/poses/hats/hat_zombie.png",
```

**第 6 個姿勢（pose_star）：**

```javascript
    voiceFile: "MUSIC/pose_06_starfish.wav",
    hatImage: "IMAGES/poses/hats/hat_star.png",
```

**第 7 個姿勢（pose_weightlifter）：**

```javascript
    voiceFile: "MUSIC/pose_07_weightlift.wav",
    hatImage: "IMAGES/poses/hats/hat_weightlifter.png",
```

**第 8 個姿勢（pose_superman）：**

```javascript
    voiceFile: "MUSIC/pose_08_superman.wav",
    hatImage: "IMAGES/poses/hats/hat_superman.png",
```

**第 9 個姿勢（pose_scarecrow）：**

```javascript
    voiceFile: "MUSIC/pose_09_scarecrow.wav",
    hatImage: "IMAGES/poses/hats/hat_scarecrow.png",
```

**第 10 個姿勢（pose_sumo）：**

```javascript
    voiceFile: "MUSIC/pose_10_sumo.wav",
    hatImage: "IMAGES/poses/hats/hat_sumo.png",
```

**第 11 個姿勢（pose_gorilla）：**

```javascript
    voiceFile: "MUSIC/pose_11_gorilla.wav",
    hatImage: "IMAGES/poses/hats/hat_gorilla.png",
```

**第 12 個姿勢（pose_surrender）：**

```javascript
    voiceFile: "MUSIC/pose_12_surrender.wav",
    hatImage: "IMAGES/poses/hats/hat_surrender.png",
```

---

## 步驟 3：修改 `js/audio-manager.js` — 加入姿勢模仿音效預載

### 3.1 在 `init()` 方法中，找到預載 SFX 的區塊

找到這段：

```javascript
    const sfxFiles = {
      sfx_heli_boost:   `${basePath}/sfx_heli_boost.mp3`,
      sfx_heli_whoosh:  `${basePath}/sfx_heli_whoosh.mp3`,
      sfx_heli_win:     `${basePath}/sfx_heli_win.mp3`,
      sfx_countdown:    `${basePath}/sfx_countdown.mp3`,
      sfx_time_warning: `${basePath}/sfx_time_warning.mp3`,
    };
```

替換為（加入姿勢模仿的所有音效）：

```javascript
    const sfxFiles = {
      // ── 直升機競賽音效 ──
      sfx_heli_boost:   `${basePath}/sfx_heli_boost.mp3`,
      sfx_heli_whoosh:  `${basePath}/sfx_heli_whoosh.mp3`,
      sfx_heli_win:     `${basePath}/sfx_heli_win.mp3`,
      sfx_countdown:    `${basePath}/sfx_countdown.mp3`,
      sfx_time_warning: `${basePath}/sfx_time_warning.mp3`,

      // ── 姿勢模仿：姿勢語音提示 ──
      pose_01_wansui:       `${basePath}/pose_01_wansui.wav`,
      pose_02_airplane:     `${basePath}/pose_02_airplane.wav`,
      pose_03_bigv:         `${basePath}/pose_03_bigv.wav`,
      pose_04_handsonhips:  `${basePath}/pose_04_handsonhips.wav`,
      pose_05_zombie:       `${basePath}/pose_05_zombie.wav`,
      pose_06_starfish:     `${basePath}/pose_06_starfish.wav`,
      pose_07_weightlift:   `${basePath}/pose_07_weightlift.wav`,
      pose_08_superman:     `${basePath}/pose_08_superman.wav`,
      pose_09_scarecrow:    `${basePath}/pose_09_scarecrow.wav`,
      pose_10_sumo:         `${basePath}/pose_10_sumo.wav`,
      pose_11_gorilla:      `${basePath}/pose_11_gorilla.wav`,
      pose_12_surrender:    `${basePath}/pose_12_surrender.wav`,

      // ── 姿勢模仿：系統音效 ──
      sys_calibrate:  `${basePath}/sys_01_calibrate.wav`,
      sys_ready:      `${basePath}/sys_02_ready.wav`,
      sys_count3:     `${basePath}/sys_03_count3.wav`,
      sys_count2:     `${basePath}/sys_04_count2.wav`,
      sys_count1:     `${basePath}/sys_05_count1.wav`,
      sys_go:         `${basePath}/sys_06_go.wav`,
      sys_perfect:    `${basePath}/sys_07_perfect.wav`,
      sys_great:      `${basePath}/sys_08_great.wav`,
      sys_good:       `${basePath}/sys_09_good.wav`,
      sys_tryagain:   `${basePath}/sys_10_tryagain.wav`,
      sys_winner:     `${basePath}/sys_11_winner.wav`,
      sys_gameover:   `${basePath}/sys_12_gameover.wav`,
    };
```

這樣所有音效都會在遊戲初始化時預載到 `_sfxBuffers` 中，後續用 `playSFXFromFile("sys_perfect")` 就能播放。

---

## 步驟 4：大幅修改 `js/games/pose-mirror.js` — 核心增強

以下是需要修改的重點區塊。由於修改量大，建議整個檔案重寫。

### 4.1 完整替換 `js/games/pose-mirror.js`

```javascript
/**
 * 姿勢模仿（Pose Mirror）— 遊戲主模組 v2
 * 增強版：影子引導、雙人模式、音效、頭飾特效、UI 重排
 */

import { getRandomPoses, LANDMARK } from "../pose-library.js";
import { comparePose, checkFullBodyVisible } from "../pose-comparator.js";

// ── 配色方案 ──
const C = {
  brand:   "#C94FC8",
  accent:  "#F5A623",
  success: "#2ECC71",
  warning: "#F39C12",
  danger:  "#E74C3C",
  dark:    "#2D3436",
  light:   "#FDFEFE",
  p1:      "#4A90D9",   // 玩家 1 藍色
  p2:      "#F5A623",   // 玩家 2 橙色
};

// ── 遊戲常數 ──
const ROUNDS_SINGLE = 6;
const ROUNDS_DUAL = 5;
const PREVIEW_DURATION = 3000;
const COUNTDOWN_DURATION = 3000;
const DETECT_DURATION = 3000;
const RESULT_DURATION = 2500;

// ── 分數門檻 ──
const SCORE_PERFECT = 90;
const SCORE_GREAT = 70;
const SCORE_GOOD = 50;

// ── EMA 平滑 ──
const SCORE_EMA_ALPHA = 0.3;

// ── 遊戲狀態 ──
const STATE = {
  CALIBRATION: "calibration",
  PREVIEW: "preview",
  COUNTDOWN: "countdown",
  DETECTING: "detecting",
  RESULT: "result",
  GAME_OVER: "gameOver",
};

// ── 影子引導骨架的連線定義 ──
const SKELETON_CONNECTIONS = [
  // 軀幹
  [LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER],
  [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP],
  [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP],
  [LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP],
  // 左臂
  [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW],
  [LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST],
  // 右臂
  [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW],
  [LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
  // 左腿
  [LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE],
  [LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE],
  // 右腿
  [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE],
  [LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE],
];

const poseMirror = {
  name: "pose-mirror",
  displayName: "🪞 姿勢模仿",

  // ── 內部狀態 ──
  _w: 0,
  _h: 0,
  _mode: "single",    // "single" 或 "dual"
  _audio: null,
  _gameOver: false,

  // 遊戲流程
  _state: STATE.CALIBRATION,
  _stateStartTime: 0,
  _poses: [],
  _currentRound: 0,
  _currentPose: null,
  _totalRounds: ROUNDS_SINGLE,

  // 校準
  _calibrationReady: false,
  _calibrationReadyTime: 0,
  _calibrationMessage: "",
  _calibrationSoundPlayed: false,

  // 單人偵測
  _currentScore: 0,
  _rawScore: 0,
  _bestScore: 0,
  _partScores: {},

  // 雙人偵測
  _p1Score: 0, _p1Best: 0, _p1Parts: {},
  _p2Score: 0, _p2Best: 0, _p2Parts: {},
  _p1Wins: 0, _p2Wins: 0,

  // 結果
  _roundResults: [],

  // 圖片快取
  _imageCache: {},
  _hatCache: {},

  // 最新的 landmarks（用於影子引導定位）
  _lastLandmarks: null,
  _lastLandmarksP2: null,

  // 特效粒子
  _particles: [],

  // 音效播放旗標（避免重複播放）
  _voicePlayed: false,
  _countdownSoundsPlayed: { 3: false, 2: false, 1: false },
  _goSoundPlayed: false,
  _resultSoundPlayed: false,

  // ═══════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════

  init(ctx, options) {
    this._w = options.canvasWidth;
    this._h = options.canvasHeight;
    this._mode = options.mode || "single";
    this._audio = options.audioManager || null;
    this._gameOver = false;

    this._totalRounds = this._mode === "dual" ? ROUNDS_DUAL : ROUNDS_SINGLE;
    this._state = STATE.CALIBRATION;
    this._stateStartTime = performance.now();
    this._poses = getRandomPoses(this._totalRounds);
    this._currentRound = 0;
    this._currentPose = null;

    // 重設校準
    this._calibrationReady = false;
    this._calibrationReadyTime = 0;
    this._calibrationMessage = "請站到全身都在畫面中";
    this._calibrationSoundPlayed = false;

    // 重設分數
    this._currentScore = 0; this._rawScore = 0; this._bestScore = 0; this._partScores = {};
    this._p1Score = 0; this._p1Best = 0; this._p1Parts = {};
    this._p2Score = 0; this._p2Best = 0; this._p2Parts = {};
    this._p1Wins = 0; this._p2Wins = 0;

    this._roundResults = [];
    this._particles = [];
    this._lastLandmarks = null;
    this._lastLandmarksP2 = null;

    // 音效旗標重設
    this._voicePlayed = false;
    this._countdownSoundsPlayed = { 3: false, 2: false, 1: false };
    this._goSoundPlayed = false;
    this._resultSoundPlayed = false;

    // 預載圖片（姿勢卡 + 頭飾）
    this._preloadImages();

    // 播放校準語音
    if (this._audio) {
      this._audio.playSFXFromFile("sys_calibrate");
    }
  },

  _preloadImages() {
    for (const pose of this._poses) {
      // 姿勢卡片
      if (!this._imageCache[pose.id]) {
        const img = new Image();
        img.src = pose.image;
        img.onload = () => { this._imageCache[pose.id] = img; };
      }
      // 頭飾
      if (pose.hatImage && !this._hatCache[pose.id]) {
        const hat = new Image();
        hat.src = pose.hatImage;
        hat.onload = () => { this._hatCache[pose.id] = hat; };
      }
    }
  },

  // ═══════════════════════════════════════
  // 更新邏輯
  // ═══════════════════════════════════════

  update(allLandmarks, timestamp) {
    if (this._gameOver) return;

    const lm1 = allLandmarks && allLandmarks[0] ? allLandmarks[0] : null;
    const lm2 = allLandmarks && allLandmarks[1] ? allLandmarks[1] : null;
    this._lastLandmarks = lm1;
    this._lastLandmarksP2 = lm2;

    const elapsed = timestamp - this._stateStartTime;

    switch (this._state) {
      case STATE.CALIBRATION:
        this._updateCalibration(lm1, lm2, timestamp);
        break;

      case STATE.PREVIEW:
        // 在展示階段播放姿勢語音提示
        if (!this._voicePlayed && this._audio && this._currentPose) {
          const voiceKey = this._getVoiceKey(this._currentPose);
          if (voiceKey) this._audio.playSFXFromFile(voiceKey);
          this._voicePlayed = true;
        }
        if (elapsed >= PREVIEW_DURATION) {
          this._countdownSoundsPlayed = { 3: false, 2: false, 1: false };
          this._goSoundPlayed = false;
          this._changeState(STATE.COUNTDOWN, timestamp);
        }
        break;

      case STATE.COUNTDOWN: {
        const count = 3 - Math.floor(elapsed / 1000);
        // 播放倒數音效
        if (this._audio) {
          if (count === 3 && !this._countdownSoundsPlayed[3]) {
            this._audio.playSFXFromFile("sys_count3");
            this._countdownSoundsPlayed[3] = true;
          } else if (count === 2 && !this._countdownSoundsPlayed[2]) {
            this._audio.playSFXFromFile("sys_count2");
            this._countdownSoundsPlayed[2] = true;
          } else if (count === 1 && !this._countdownSoundsPlayed[1]) {
            this._audio.playSFXFromFile("sys_count1");
            this._countdownSoundsPlayed[1] = true;
          }
        }
        if (elapsed >= COUNTDOWN_DURATION) {
          // 播放 GO! 音效
          if (this._audio && !this._goSoundPlayed) {
            this._audio.playSFXFromFile("sys_go");
            this._goSoundPlayed = true;
          }
          this._resetScores();
          this._changeState(STATE.DETECTING, timestamp);
        }
        break;
      }

      case STATE.DETECTING:
        this._updateDetecting(lm1, lm2, timestamp, elapsed);
        break;

      case STATE.RESULT:
        this._updateParticles();
        if (elapsed >= RESULT_DURATION) {
          this._nextRound(timestamp);
        }
        break;

      case STATE.GAME_OVER:
        this._updateParticles();
        this._gameOver = true;
        break;
    }
  },

  /**
   * 從 voiceFile 路徑取得 sfxBuffers 的 key
   * "MUSIC/pose_01_wansui.wav" → "pose_01_wansui"
   */
  _getVoiceKey(pose) {
    if (!pose.voiceFile) return null;
    const filename = pose.voiceFile.split("/").pop();   // "pose_01_wansui.wav"
    return filename.replace(/\.\w+$/, "");              // "pose_01_wansui"
  },

  _resetScores() {
    this._currentScore = 0; this._rawScore = 0; this._bestScore = 0; this._partScores = {};
    this._p1Score = 0; this._p1Best = 0; this._p1Parts = {};
    this._p2Score = 0; this._p2Best = 0; this._p2Parts = {};
  },

  _updateCalibration(lm1, lm2, timestamp) {
    const isDual = this._mode === "dual";
    const landmarks = lm1; // 至少需要偵測到一個人

    if (!landmarks) {
      this._calibrationReady = false;
      this._calibrationReadyTime = 0;
      this._calibrationMessage = "偵測不到人，請站到鏡頭前";
      return;
    }

    const check1 = checkFullBodyVisible(landmarks);
    let check2 = { allVisible: true };
    if (isDual) {
      if (!lm2) {
        this._calibrationReady = false;
        this._calibrationMessage = "需要兩位玩家都站在鏡頭前";
        return;
      }
      check2 = checkFullBodyVisible(lm2);
    }

    if (check1.allVisible && check2.allVisible) {
      if (!this._calibrationReady) {
        this._calibrationReady = true;
        this._calibrationReadyTime = timestamp;
        if (this._audio) this._audio.playSFXFromFile("sys_ready");
      }
      this._calibrationMessage = "很好！保持不動...";

      if (timestamp - this._calibrationReadyTime >= 2000) {
        this._currentPose = this._poses[0];
        this._voicePlayed = false;
        this._changeState(STATE.PREVIEW, timestamp);
      }
    } else {
      this._calibrationReady = false;
      this._calibrationReadyTime = 0;
      if (check1.needStepBack || check2.needStepBack) {
        this._calibrationMessage = "請再退後一步，讓全身都在畫面中～";
      } else {
        const missing = [...check1.missingParts, ...check2.missingParts];
        this._calibrationMessage = `偵測不到：${missing.join("、")}`;
      }
    }
  },

  _updateDetecting(lm1, lm2, timestamp, elapsed) {
    if (elapsed >= DETECT_DURATION) {
      // 時間到，記錄結果
      this._resultSoundPlayed = false;

      if (this._mode === "dual") {
        const p1Win = this._p1Best >= this._p2Best;
        const p2Win = this._p2Best > this._p1Best;
        if (p1Win) this._p1Wins++;
        if (p2Win) this._p2Wins++;
        this._roundResults.push({
          pose: this._currentPose,
          p1Score: this._p1Best,
          p2Score: this._p2Best,
          winner: p1Win ? 1 : (p2Win ? 2 : 0),
        });
      } else {
        this._roundResults.push({
          pose: this._currentPose,
          bestScore: this._bestScore,
        });
      }

      this._spawnResultParticles();
      this._playResultSound();
      this._changeState(STATE.RESULT, timestamp);
      return;
    }

    // 單人模式
    if (this._mode === "single") {
      if (!lm1) return;
      const result = comparePose(lm1, this._currentPose);
      this._rawScore = result.totalScore;
      this._partScores = result.partScores;
      this._currentScore = this._currentScore * (1 - SCORE_EMA_ALPHA) + this._rawScore * SCORE_EMA_ALPHA;
      if (this._rawScore > this._bestScore) this._bestScore = this._rawScore;
    }
    // 雙人模式
    else {
      if (lm1) {
        const r1 = comparePose(lm1, this._currentPose);
        this._p1Score = this._p1Score * (1 - SCORE_EMA_ALPHA) + r1.totalScore * SCORE_EMA_ALPHA;
        this._p1Parts = r1.partScores;
        if (r1.totalScore > this._p1Best) this._p1Best = r1.totalScore;
      }
      if (lm2) {
        const r2 = comparePose(lm2, this._currentPose);
        this._p2Score = this._p2Score * (1 - SCORE_EMA_ALPHA) + r2.totalScore * SCORE_EMA_ALPHA;
        this._p2Parts = r2.partScores;
        if (r2.totalScore > this._p2Best) this._p2Best = r2.totalScore;
      }
    }
  },

  _playResultSound() {
    if (!this._audio || this._resultSoundPlayed) return;
    this._resultSoundPlayed = true;

    if (this._mode === "dual") {
      const last = this._roundResults[this._roundResults.length - 1];
      if (last.winner) this._audio.playSFXFromFile("sys_winner");
    } else {
      const score = this._bestScore;
      if (score >= SCORE_PERFECT) this._audio.playSFXFromFile("sys_perfect");
      else if (score >= SCORE_GREAT) this._audio.playSFXFromFile("sys_great");
      else if (score >= SCORE_GOOD) this._audio.playSFXFromFile("sys_good");
      else this._audio.playSFXFromFile("sys_tryagain");
    }
  },

  _nextRound(timestamp) {
    this._currentRound++;
    if (this._currentRound >= this._totalRounds) {
      if (this._audio) this._audio.playSFXFromFile("sys_gameover");
      this._changeState(STATE.GAME_OVER, timestamp);
      this._spawnResultParticles();
    } else {
      this._currentPose = this._poses[this._currentRound];
      this._resetScores();
      this._voicePlayed = false;
      this._changeState(STATE.PREVIEW, timestamp);
    }
  },

  _changeState(newState, timestamp) {
    this._state = newState;
    this._stateStartTime = timestamp;
  },

  // ═══════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════

  render(ctx) {
    const w = this._w;
    const h = this._h;

    switch (this._state) {
      case STATE.CALIBRATION:  this._renderCalibration(ctx, w, h); break;
      case STATE.PREVIEW:      this._renderPreview(ctx, w, h); break;
      case STATE.COUNTDOWN:    this._renderCountdown(ctx, w, h); break;
      case STATE.DETECTING:    this._renderDetecting(ctx, w, h); break;
      case STATE.RESULT:       this._renderResult(ctx, w, h); break;
      case STATE.GAME_OVER:    this._renderGameOver(ctx, w, h); break;
    }
  },

  // ── 校準畫面 ──
  _renderCalibration(ctx, w, h) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, w, h);

    // 人形輪廓框
    const frameW = this._mode === "dual" ? w * 0.7 : w * 0.5;
    const frameH = h * 0.8;
    const frameX = (w - frameW) / 2;
    const frameY = (h - frameH) / 2;

    ctx.strokeStyle = this._calibrationReady ? C.success : C.light;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(frameX, frameY, frameW, frameH);
    ctx.setLineDash([]);

    // 雙人模式顯示中線
    if (this._mode === "dual") {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(w / 2, frameY);
      ctx.lineTo(w / 2, frameY + frameH);
      ctx.stroke();
      ctx.setLineDash([]);

      // P1 / P2 標示
      const labelFont = Math.max(16, w * 0.035);
      ctx.font = `bold ${labelFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = C.p1;
      ctx.fillText("P1", w * 0.3, frameY + labelFont + 10);
      ctx.fillStyle = C.p2;
      ctx.fillText("P2", w * 0.7, frameY + labelFont + 10);
    }

    // 提示訊息
    const fontSize = Math.max(18, h * 0.045);
    ctx.fillStyle = this._calibrationReady ? C.success : C.light;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(this._calibrationMessage, w / 2, frameY + frameH + fontSize + 15);

    if (this._calibrationReady) {
      ctx.fillStyle = C.success;
      ctx.font = `${fontSize * 0.8}px sans-serif`;
      ctx.fillText("✓ 全身偵測成功！", w / 2, frameY - 10);
    }
  },

  // ── 展示目標姿勢（全螢幕）──
  _renderPreview(ctx, w, h) {
    const pose = this._currentPose;
    const elapsed = performance.now() - this._stateStartTime;
    const progress = Math.min(1, elapsed / PREVIEW_DURATION);

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, w, h);

    // 輪次
    const smallFont = Math.max(14, h * 0.035);
    ctx.fillStyle = C.light;
    ctx.font = `${smallFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`第 ${this._currentRound + 1} / ${this._totalRounds} 輪`, w / 2, smallFont + 10);

    // 姿勢卡片（全螢幕居中）
    const img = this._imageCache[pose.id];
    if (img) {
      const imgSize = Math.min(w * 0.55, h * 0.45);
      const imgX = (w - imgSize) / 2;
      const imgY = (h - imgSize) / 2 - h * 0.08;

      // 半透明圓角卡片底
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      this._roundRect(ctx, imgX - 12, imgY - 12, imgSize + 24, imgSize + 24, 20);
      ctx.fill();

      ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
    }

    // 姿勢名稱
    const nameFont = Math.max(24, h * 0.06);
    ctx.fillStyle = C.accent;
    ctx.font = `bold ${nameFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${pose.animal}的${pose.name}`, w / 2, h * 0.82);

    // 語音提示文字
    ctx.fillStyle = C.light;
    ctx.font = `${nameFont * 0.6}px sans-serif`;
    ctx.fillText(pose.voiceHint, w / 2, h * 0.82 + nameFont);

    // 進度條
    const barW = w * 0.6;
    const barH = 6;
    const barX = (w - barW) / 2;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(barX, h - 25, barW, barH);
    ctx.fillStyle = C.brand;
    ctx.fillRect(barX, h - 25, barW * progress, barH);
  },

  // ── 倒數 3-2-1 ──
  _renderCountdown(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const count = 3 - Math.floor(elapsed / 1000);

    // 左上角姿勢卡片
    this._renderPoseCard(ctx, w, h);

    if (count > 0) {
      const fontSize = Math.max(80, h * 0.2);
      const scale = 1 + 0.3 * Math.sin((elapsed % 1000) / 1000 * Math.PI);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.fillStyle = C.light;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = C.brand;
      ctx.lineWidth = 4;
      ctx.strokeText(count, 0, 0);
      ctx.fillText(count, 0, 0);
      ctx.restore();
    }
  },

  // ── 偵測中 ──
  _renderDetecting(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const timeLeft = Math.max(0, (DETECT_DURATION - elapsed) / 1000);

    // ★ P0：影子引導（半透明目標骨架疊在玩家身上）
    if (this._mode === "single") {
      this._renderTargetSkeleton(ctx, w, h, this._lastLandmarks, this._currentPose);
    } else {
      this._renderTargetSkeleton(ctx, w, h, this._lastLandmarks, this._currentPose);
      this._renderTargetSkeleton(ctx, w, h, this._lastLandmarksP2, this._currentPose);
    }

    // 頭飾特效
    if (this._mode === "single") {
      this._renderHat(ctx, w, h, this._lastLandmarks, this._currentPose);
    } else {
      this._renderHat(ctx, w, h, this._lastLandmarks, this._currentPose);
      this._renderHat(ctx, w, h, this._lastLandmarksP2, this._currentPose);
    }

    // 姿勢卡片（左上角，佔 28% 寬度）
    this._renderPoseCard(ctx, w, h);

    // 分數顯示
    if (this._mode === "single") {
      this._renderSingleScore(ctx, w, h, timeLeft);
    } else {
      this._renderDualScore(ctx, w, h, timeLeft);
    }

    // 倒數計時（頂部中央）
    const timerFont = Math.max(18, h * 0.04);
    ctx.fillStyle = timeLeft <= 1 ? C.danger : C.light;
    ctx.font = `bold ${timerFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeText(`⏱ ${timeLeft.toFixed(1)}`, w / 2, timerFont + 8);
    ctx.fillText(`⏱ ${timeLeft.toFixed(1)}`, w / 2, timerFont + 8);
  },

  // ── 單人分數（右上角，大字） ──
  _renderSingleScore(ctx, w, h, timeLeft) {
    const score = Math.round(this._currentScore);
    // 分數佔畫面高度 18%
    const fontSize = Math.max(48, h * 0.18);

    // 分數顏色
    if (score >= SCORE_PERFECT) ctx.fillStyle = C.success;
    else if (score >= SCORE_GREAT) ctx.fillStyle = C.accent;
    else if (score >= SCORE_GOOD) ctx.fillStyle = C.warning;
    else ctx.fillStyle = C.danger;

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "right";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeText(`${score}%`, w - 15, fontSize + 10);
    ctx.fillText(`${score}%`, w - 15, fontSize + 10);

    // 最高分
    const bestFont = Math.max(14, h * 0.03);
    ctx.fillStyle = C.light;
    ctx.font = `${bestFont}px sans-serif`;
    ctx.fillText(`最高: ${Math.round(this._bestScore)}%`, w - 15, fontSize + bestFont + 18);
  },

  // ── 雙人分數（左右兩側各自顯示） ──
  _renderDualScore(ctx, w, h, timeLeft) {
    const fontSize = Math.max(36, h * 0.14);
    const p1 = Math.round(this._p1Score);
    const p2 = Math.round(this._p2Score);

    // P1 分數（左側）
    ctx.fillStyle = C.p1;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeText(`${p1}%`, 15, h * 0.85);
    ctx.fillText(`${p1}%`, 15, h * 0.85);

    // P1 最高
    const bestFont = Math.max(12, h * 0.025);
    ctx.font = `${bestFont}px sans-serif`;
    ctx.fillText(`最高: ${Math.round(this._p1Best)}%`, 15, h * 0.85 + bestFont + 5);

    // P2 分數（右側）
    ctx.fillStyle = C.p2;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "right";
    ctx.strokeText(`${p2}%`, w - 15, h * 0.85);
    ctx.fillText(`${p2}%`, w - 15, h * 0.85);

    ctx.font = `${bestFont}px sans-serif`;
    ctx.fillText(`最高: ${Math.round(this._p2Best)}%`, w - 15, h * 0.85 + bestFont + 5);
  },

  // ── ★ P0：影子引導 — 半透明目標骨架疊在玩家身上 ──
  _renderTargetSkeleton(ctx, w, h, landmarks, pose) {
    if (!landmarks || !pose) return;

    // 用玩家的肩膀和髖部位置來定位目標骨架
    const ls = landmarks[LANDMARK.LEFT_SHOULDER];
    const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
    const lh = landmarks[LANDMARK.LEFT_HIP];
    const rh = landmarks[LANDMARK.RIGHT_HIP];

    if (!ls || !rs || !lh || !rh) return;
    if (ls.visibility < 0.3 || rs.visibility < 0.3) return;

    // 計算玩家的肩寬和身體中心（螢幕座標）
    const playerShoulderW = Math.abs(rs.x - ls.x) * w;
    const playerCenterX = ((ls.x + rs.x) / 2) * w;
    const playerShoulderY = ((ls.y + rs.y) / 2) * h;
    const playerHipY = ((lh.y + rh.y) / 2) * h;
    const playerTorsoH = playerHipY - playerShoulderY;

    // 根據目標角度，計算目標骨架的相對座標
    // 使用簡化方法：根據目標角度推算各關節的理想位置
    const ta = pose.targetAngles;

    // 標準化的骨架（以肩膀中點為原點，肩寬為單位）
    // 這裡用角度來推算各點的相對位置
    const unit = playerShoulderW * 0.5; // 半肩寬作為單位長度
    const armLen = unit * 1.8;    // 上臂+前臂長度
    const legLen = unit * 2.2;    // 大腿+小腿長度

    // 肩膀位置
    const shoulderL = { x: playerCenterX - unit, y: playerShoulderY };
    const shoulderR = { x: playerCenterX + unit, y: playerShoulderY };

    // 髖部位置
    const hipL = { x: playerCenterX - unit * 0.5, y: playerHipY };
    const hipR = { x: playerCenterX + unit * 0.5, y: playerHipY };

    // 用肩膀角度推算手肘位置
    const elbowL = this._calcTargetJoint(shoulderL, ta.leftShoulder, unit * 1.0, hipL, true);
    const elbowR = this._calcTargetJoint(shoulderR, ta.rightShoulder, unit * 1.0, hipR, false);

    // 用手肘角度推算手腕位置
    const wristL = this._calcTargetJoint(elbowL, ta.leftElbow, unit * 0.9, shoulderL, true);
    const wristR = this._calcTargetJoint(elbowR, ta.rightElbow, unit * 0.9, shoulderR, false);

    // 用髖部角度推算膝蓋位置
    const kneeL = this._calcTargetJoint(hipL, ta.leftHip, unit * 1.2, shoulderL, true);
    const kneeR = this._calcTargetJoint(hipR, ta.rightHip, unit * 1.2, shoulderR, false);

    // 用膝蓋角度推算腳踝位置
    const ankleL = this._calcTargetJoint(kneeL, ta.leftKnee, unit * 1.1, hipL, true);
    const ankleR = this._calcTargetJoint(kneeR, ta.rightKnee, unit * 1.1, hipR, false);

    // 組裝目標骨架點
    const targetPoints = {};
    targetPoints[LANDMARK.LEFT_SHOULDER] = shoulderL;
    targetPoints[LANDMARK.RIGHT_SHOULDER] = shoulderR;
    targetPoints[LANDMARK.LEFT_ELBOW] = elbowL;
    targetPoints[LANDMARK.RIGHT_ELBOW] = elbowR;
    targetPoints[LANDMARK.LEFT_WRIST] = wristL;
    targetPoints[LANDMARK.RIGHT_WRIST] = wristR;
    targetPoints[LANDMARK.LEFT_HIP] = hipL;
    targetPoints[LANDMARK.RIGHT_HIP] = hipR;
    targetPoints[LANDMARK.LEFT_KNEE] = kneeL;
    targetPoints[LANDMARK.RIGHT_KNEE] = kneeR;
    targetPoints[LANDMARK.LEFT_ANKLE] = ankleL;
    targetPoints[LANDMARK.RIGHT_ANKLE] = ankleR;

    // 繪製半透明目標骨架
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(4, w * 0.008);
    ctx.setLineDash([8, 4]);

    for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
      const p1 = targetPoints[startIdx];
      const p2 = targetPoints[endIdx];
      if (!p1 || !p2) continue;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // 繪製關節圓點
    ctx.fillStyle = "#FFFFFF";
    ctx.setLineDash([]);
    for (const key of Object.keys(targetPoints)) {
      const p = targetPoints[key];
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(3, w * 0.005), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  },

  /**
   * 根據角度計算目標關節位置
   * @param {Object} origin - 起點（如肩膀）
   * @param {number} angle - 目標角度（度）
   * @param {number} length - 骨骼長度（像素）
   * @param {Object} refPoint - 參考點（用於確定角度方向）
   * @param {boolean} isLeft - 是否是左側
   * @returns {Object} { x, y } 目標位置
   */
  _calcTargetJoint(origin, angle, length, refPoint, isLeft) {
    // 計算從參考點到起點的角度
    const refAngle = Math.atan2(refPoint.y - origin.y, refPoint.x - origin.x);
    // 將目標角度轉換為弧度，並根據左右側調整方向
    const targetRad = angle * Math.PI / 180;
    // 對左側，手臂往左展開；對右側，往右展開
    const dir = isLeft ? 1 : -1;
    const finalAngle = refAngle + dir * targetRad;

    return {
      x: origin.x + Math.cos(finalAngle) * length,
      y: origin.y + Math.sin(finalAngle) * length,
    };
  },

  // ── 頭飾特效 ──
  _renderHat(ctx, w, h, landmarks, pose) {
    if (!landmarks || !pose) return;
    const hatImg = this._hatCache[pose.id];
    if (!hatImg) return;

    // 用鼻子（landmark 0）定位頭部
    const nose = landmarks[0];
    const ls = landmarks[LANDMARK.LEFT_SHOULDER];
    const rs = landmarks[LANDMARK.RIGHT_SHOULDER];

    if (!nose || nose.visibility < 0.3) return;
    if (!ls || !rs) return;

    // 頭飾大小根據肩寬計算
    const shoulderW = Math.abs(rs.x - ls.x) * w;
    const hatSize = shoulderW * 1.0; // 頭飾寬度 = 肩寬

    // 頭飾位置：鼻子上方
    const hatX = nose.x * w - hatSize / 2;
    const hatY = nose.y * h - hatSize * 1.1; // 在鼻子上方

    ctx.drawImage(hatImg, hatX, hatY, hatSize, hatSize);
  },

  // ── 左上角姿勢卡片（偵測階段用，佔 28% 寬度）──
  _renderPoseCard(ctx, w, h) {
    const pose = this._currentPose;
    const img = this._imageCache[pose.id];
    if (!img) return;

    // 佔畫面寬度 28%
    const cardSize = w * 0.28;
    const margin = 8;

    // 半透明圓角卡片（不再是純白底）
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    this._roundRect(ctx, margin, margin, cardSize + 12, cardSize + 12, 12);
    ctx.fill();

    // 品牌色發光邊框
    ctx.strokeStyle = C.brand;
    ctx.lineWidth = 2;
    this._roundRect(ctx, margin, margin, cardSize + 12, cardSize + 12, 12);
    ctx.stroke();

    ctx.drawImage(img, margin + 6, margin + 6, cardSize, cardSize);
  },

  // ── 結果畫面 ──
  _renderResult(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, w, h);

    if (this._mode === "single") {
      const result = this._roundResults[this._roundResults.length - 1];
      const score = Math.round(result.bestScore);

      let text, color;
      if (score >= SCORE_PERFECT)   { text = "PERFECT! ⭐"; color = "#FFD700"; }
      else if (score >= SCORE_GREAT) { text = "GREAT! ⭐"; color = C.success; }
      else if (score >= SCORE_GOOD)  { text = "GOOD!"; color = C.accent; }
      else { text = "好棒！繼續加油！"; color = C.brand; }

      const scale = Math.min(1.2, 0.5 + elapsed / 500);
      const textFont = Math.max(32, h * 0.08);
      ctx.save();
      ctx.translate(w / 2, h * 0.35);
      ctx.scale(scale, scale);
      ctx.fillStyle = color;
      ctx.font = `bold ${textFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 3;
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      ctx.restore();

      const scoreFont = Math.max(48, h * 0.18);
      ctx.fillStyle = C.light;
      ctx.font = `bold ${scoreFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${score}%`, w / 2, h * 0.55);
    } else {
      // 雙人結果
      const result = this._roundResults[this._roundResults.length - 1];
      const p1 = Math.round(result.p1Score);
      const p2 = Math.round(result.p2Score);

      const scoreFont = Math.max(36, h * 0.14);

      // P1
      ctx.fillStyle = result.winner === 1 ? "#FFD700" : C.p1;
      ctx.font = `bold ${scoreFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${p1}%`, w * 0.25, h * 0.4);
      if (result.winner === 1) {
        ctx.font = `${Math.max(20, h * 0.05)}px sans-serif`;
        ctx.fillText("👑 WIN!", w * 0.25, h * 0.4 + scoreFont * 0.6);
      }

      // VS
      ctx.fillStyle = C.light;
      ctx.font = `bold ${Math.max(24, h * 0.06)}px sans-serif`;
      ctx.fillText("VS", w / 2, h * 0.4);

      // P2
      ctx.fillStyle = result.winner === 2 ? "#FFD700" : C.p2;
      ctx.font = `bold ${scoreFont}px sans-serif`;
      ctx.fillText(`${p2}%`, w * 0.75, h * 0.4);
      if (result.winner === 2) {
        ctx.font = `${Math.max(20, h * 0.05)}px sans-serif`;
        ctx.fillText("👑 WIN!", w * 0.75, h * 0.4 + scoreFont * 0.6);
      }

      // 目前戰況
      ctx.fillStyle = C.light;
      ctx.font = `${Math.max(16, h * 0.035)}px sans-serif`;
      ctx.fillText(`P1 ${this._p1Wins} : ${this._p2Wins} P2`, w / 2, h * 0.65);
    }

    // 姿勢名稱
    const last = this._roundResults[this._roundResults.length - 1];
    const nameFont = Math.max(14, h * 0.03);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `${nameFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${last.pose.animal}的${last.pose.name}`, w / 2, h * 0.75);

    this._renderParticles(ctx);
  },

  // ── 結算畫面 ──
  _renderGameOver(ctx, w, h) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, w, h);

    const titleFont = Math.max(28, h * 0.06);
    ctx.fillStyle = C.accent;
    ctx.font = `bold ${titleFont}px sans-serif`;
    ctx.textAlign = "center";

    if (this._mode === "single") {
      ctx.fillText("🎉 遊戲結束！", w / 2, titleFont + 20);

      const avgScore = this._roundResults.reduce((s, r) => s + r.bestScore, 0) / this._roundResults.length;
      const perfectCount = this._roundResults.filter(r => r.bestScore >= SCORE_PERFECT).length;
      const greatCount = this._roundResults.filter(r => r.bestScore >= SCORE_GREAT).length;

      let verdict;
      if (perfectCount >= 4) verdict = "姿勢大師！🏆";
      else if (greatCount >= 4) verdict = "超厲害！⭐";
      else if (greatCount >= 2) verdict = "做得很好！👍";
      else verdict = "越來越厲害了！💪";

      ctx.fillStyle = C.light;
      ctx.font = `bold ${Math.max(22, h * 0.05)}px sans-serif`;
      ctx.fillText(verdict, w / 2, titleFont + 20 + Math.max(22, h * 0.05) + 20);

      const avgFont = Math.max(36, h * 0.1);
      ctx.fillStyle = C.brand;
      ctx.font = `bold ${avgFont}px sans-serif`;
      ctx.fillText(`${Math.round(avgScore)}%`, w / 2, h * 0.4);

      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = `${Math.max(14, h * 0.03)}px sans-serif`;
      ctx.fillText("平均分數", w / 2, h * 0.4 + avgFont * 0.4 + 10);

      // 每輪成績
      const listTop = h * 0.52;
      const rowH = Math.max(20, h * 0.045);
      ctx.font = `${Math.max(13, h * 0.028)}px sans-serif`;
      ctx.textAlign = "left";

      for (let i = 0; i < this._roundResults.length; i++) {
        const r = this._roundResults[i];
        const y = listTop + i * rowH;
        const sc = Math.round(r.bestScore);
        if (sc >= SCORE_PERFECT) ctx.fillStyle = "#FFD700";
        else if (sc >= SCORE_GREAT) ctx.fillStyle = C.success;
        else if (sc >= SCORE_GOOD) ctx.fillStyle = C.accent;
        else ctx.fillStyle = C.light;
        ctx.fillText(`${i + 1}. ${r.pose.animal}的${r.pose.name}　${sc}%${sc >= SCORE_PERFECT ? " ⭐" : ""}`, w * 0.15, y);
      }
    } else {
      // 雙人結算
      const winner = this._p1Wins > this._p2Wins ? "P1" : (this._p2Wins > this._p1Wins ? "P2" : "平手");
      ctx.fillText(winner === "平手" ? "🤝 平手！" : `🎉 ${winner} 獲勝！`, w / 2, titleFont + 20);

      const scoreFont = Math.max(36, h * 0.1);
      ctx.fillStyle = C.p1;
      ctx.font = `bold ${scoreFont}px sans-serif`;
      ctx.fillText(`P1: ${this._p1Wins}`, w * 0.3, h * 0.35);

      ctx.fillStyle = C.p2;
      ctx.fillText(`P2: ${this._p2Wins}`, w * 0.7, h * 0.35);

      // 每輪紀錄
      const listTop = h * 0.45;
      const rowH = Math.max(20, h * 0.045);
      ctx.font = `${Math.max(13, h * 0.028)}px sans-serif`;
      ctx.textAlign = "center";

      for (let i = 0; i < this._roundResults.length; i++) {
        const r = this._roundResults[i];
        const y = listTop + i * rowH;
        const p1s = Math.round(r.p1Score);
        const p2s = Math.round(r.p2Score);

        ctx.fillStyle = r.winner === 1 ? C.p1 : (r.winner === 2 ? C.p2 : C.light);
        ctx.fillText(
          `${i + 1}. ${r.pose.name}　P1 ${p1s}% vs ${p2s}% P2${r.winner ? (r.winner === 1 ? " ← 勝" : " 勝 →") : ""}`,
          w / 2, y
        );
      }
    }

    // 按鈕
    this._renderButton(ctx, "再玩一次", w * 0.28, h * 0.88, w * 0.2, h * 0.07, C.brand);
    this._renderButton(ctx, "回主選單", w * 0.52, h * 0.88, w * 0.2, h * 0.07, C.dark);
    this._renderParticles(ctx);
  },

  // ═══════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  _renderButton(ctx, text, x, y, w, h, color) {
    ctx.fillStyle = color;
    this._roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = C.light;
    ctx.font = `bold ${Math.max(12, h * 0.4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2);
  },

  _spawnResultParticles() {
    const count = (this._bestScore >= SCORE_PERFECT || this._p1Best >= SCORE_PERFECT || this._p2Best >= SCORE_PERFECT) ? 40 : 20;
    for (let i = 0; i < count; i++) {
      this._particles.push({
        x: this._w / 2 + (Math.random() - 0.5) * this._w * 0.5,
        y: this._h * 0.4,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        size: Math.random() * 8 + 3,
        color: ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"][Math.floor(Math.random() * 6)],
        life: 1,
        decay: 0.01 + Math.random() * 0.02,
      });
    }
  },

  _updateParticles() {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= p.decay;
      if (p.life <= 0) this._particles.splice(i, 1);
    }
  },

  _renderParticles(ctx) {
    for (const p of this._particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  // ═══════════════════════════════════════
  // 互動
  // ═══════════════════════════════════════

  handleClick(x, y) {
    if (this._state === STATE.GAME_OVER) {
      const w = this._w, h = this._h;
      const btnW = w * 0.2, btnH = h * 0.07, btnY = h * 0.88;
      if (x >= w * 0.28 && x <= w * 0.28 + btnW && y >= btnY && y <= btnY + btnH) return "replay";
      if (x >= w * 0.52 && x <= w * 0.52 + btnW && y >= btnY && y <= btnY + btnH) return "menu";
    }
    return null;
  },

  isGameOver() { return this._gameOver; },

  getResults() {
    if (this._mode === "single") {
      const avg = this._roundResults.reduce((s, r) => s + r.bestScore, 0) / this._roundResults.length;
      return { averageScore: Math.round(avg), rounds: this._roundResults };
    } else {
      return { p1Wins: this._p1Wins, p2Wins: this._p2Wins, rounds: this._roundResults };
    }
  },

  destroy() {
    this._particles = [];
    this._imageCache = {};
    this._hatCache = {};
  },
};

export default poseMirror;
```

---

## 步驟 5：修改 `js/main.js` — 確保雙人模式傳入正確

確認 `main.js` 中啟動姿勢模仿遊戲時，`numPoses` 設定正確：

找到設定 `numPoses` 的邏輯，確認：
- 單人模式：`numPoses = 1`
- 雙人模式：`numPoses = 2`

這個邏輯應該已經存在（直升機和敲冰塊已有），確認姿勢模仿也走同樣路徑即可。

---

## 步驟 6：驗證清單

### 6.1 圖片去背

- [ ] `IMAGES/poses/pose_*.png` 背景已透明（在遊戲中不再有白色方塊）

### 6.2 頭飾

- [ ] `IMAGES/poses/hats/` 下有 12 個透明背景 PNG
- [ ] 遊戲中偵測階段，玩家頭上顯示對應動物頭飾
- [ ] 頭飾大小隨距離（肩寬）自動縮放

### 6.3 影子引導（P0）

- [ ] 偵測階段，玩家身上疊加白色半透明虛線骨架
- [ ] 骨架位置根據玩家的肩膀和髖部動態對齊
- [ ] 骨架不會遮住三色回饋或分數

### 6.4 音效

- [ ] 進入校準 → 播放 `sys_01_calibrate.wav`
- [ ] 校準成功 → 播放 `sys_02_ready.wav`
- [ ] 展示姿勢 → 播放對應語音（如 `pose_04_handsonhips.wav`）
- [ ] 倒數 3-2-1 → 分別播放 `sys_03/04/05`
- [ ] GO! → 播放 `sys_06_go.wav`
- [ ] 結果 PERFECT → `sys_07_perfect.wav`
- [ ] 結果 GREAT → `sys_08_great.wav`
- [ ] 結果 GOOD → `sys_09_good.wav`
- [ ] 結果 < 50% → `sys_10_tryagain.wav`
- [ ] 結算畫面 → `sys_12_gameover.wav`

### 6.5 雙人模式

- [ ] 主選單可選擇雙人模式進入姿勢模仿
- [ ] 校準階段偵測兩人全身，顯示 P1/P2 標示
- [ ] 偵測階段左右各顯示各自的百分比
- [ ] 每輪結果顯示 P1 vs P2 比分
- [ ] 結算畫面顯示勝者和每輪紀錄
- [ ] 雙人勝者 → 播放 `sys_11_winner.wav`

### 6.6 UI 調整

- [ ] 姿勢卡片在偵測階段位於左上角（佔 28% 寬度），不遮住軀幹
- [ ] 分數字體佔畫面高度 18%（`h * 0.18`），遠距離可讀
- [ ] 卡片底框為半透明（75% 不透明度）
- [ ] 計時器在頂部中央

---

## 注意事項

1. **影子引導的骨架位置計算**是本 TASK 最難的部分。`_calcTargetJoint` 方法用目標角度推算各關節的理想位置，但角度→座標的轉換涉及三角函數，可能需要實際測試微調。如果影子骨架位置不太對，調整 `_renderTargetSkeleton` 中的 `unit`、`armLen`、`legLen` 比例係數。

2. **頭飾大小**根據肩寬計算（`shoulderW * 1.0`），如果太大或太小，調整這個倍率。

3. **音效預載量增加很多**（24 個新檔案），如果初始載入太慢，可以考慮延遲載入姿勢模仿的音效（只在選擇這款遊戲時才載入）。

4. **鏡頭座標翻轉**：MediaPipe 回傳的 x 座標在鏡頭模式下已經是翻轉的，影子引導和頭飾定位不需要額外處理。如果發現左右相反，在 x 座標前加 `(1 - x)` 翻轉。
