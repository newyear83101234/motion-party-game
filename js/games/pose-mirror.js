/**
 * 姿勢模仿（Pose Mirror）— 遊戲主模組
 * 玩家模仿畫面上的目標姿勢，系統偵測相似度給分
 */

import { getRandomPoses, LANDMARK } from "../pose-library.js";
import { comparePose, checkFullBodyVisible } from "../pose-comparator.js";

// ── 配色方案（延續品牌風格）──
const C = {
  brand:   "#C94FC8",
  accent:  "#F5A623",
  success: "#2ECC71",
  warning: "#F39C12",
  danger:  "#E74C3C",
  dark:    "#2D3436",
  light:   "#FDFEFE",
};

// ── 遊戲常數 ──
const ROUNDS_PER_GAME = 6;          // 每場 6 輪
const PREVIEW_DURATION = 3000;       // 展示目標姿勢 3 秒
const COUNTDOWN_DURATION = 3000;     // 倒數 3-2-1
const DETECT_DURATION = 3000;        // 偵測 3 秒取最高分
const RESULT_DURATION = 2500;        // 結果動畫 2.5 秒

// ── 分數回饋門檻 ──
const SCORE_PERFECT = 90;   // ≥ 90%：PERFECT!
const SCORE_GREAT = 70;     // ≥ 70%：GREAT!
const SCORE_GOOD = 50;      // ≥ 50%：GOOD!
                              // < 50%：好棒！繼續加油！

// ── EMA 平滑參數 ──
const SCORE_EMA_ALPHA = 0.3;

// ── 遊戲狀態 ──
const STATE = {
  CALIBRATION: "calibration",   // 全身校準
  PREVIEW: "preview",           // 展示目標姿勢
  COUNTDOWN: "countdown",       // 3-2-1 倒數
  DETECTING: "detecting",       // 偵測中（3 秒取最高分）
  RESULT: "result",             // 顯示本輪結果
  GAME_OVER: "gameOver",        // 結算畫面
};

const poseMirror = {
  name: "pose-mirror",
  displayName: "🪞 姿勢模仿",

  // ── 內部狀態 ──
  _w: 0,
  _h: 0,
  _mode: "single",
  _audio: null,
  _gameOver: false,

  // 遊戲流程
  _state: STATE.CALIBRATION,
  _stateStartTime: 0,
  _poses: [],           // 本場的姿勢清單
  _currentRound: 0,     // 目前第幾輪（0-based）
  _currentPose: null,   // 目前的目標姿勢

  // 校準
  _calibrationReady: false,
  _calibrationReadyTime: 0,   // 持續全身可見的計時
  _calibrationMessage: "",

  // 偵測
  _currentScore: 0,        // 即時分數（EMA 平滑後）
  _rawScore: 0,            // 原始分數
  _bestScore: 0,           // 本輪最高分
  _partScores: {},         // 各部位分數（用於三色回饋）

  // 結果
  _roundResults: [],       // 每輪結果 [{ pose, bestScore }]

  // 圖片快取
  _imageCache: {},
  _imagesLoaded: false,

  // 影子引導骨架
  _targetSkeletonAngles: null,

  // 特效粒子
  _particles: [],

  // ═══════════════════════════════════════
  // 遊戲介面方法
  // ═══════════════════════════════════════

  /**
   * 初始化遊戲
   */
  init(ctx, options) {
    this._w = options.canvasWidth;
    this._h = options.canvasHeight;
    this._mode = options.mode || "single";
    this._audio = options.audioManager || null;
    this._gameOver = false;

    // 重設所有狀態
    this._state = STATE.CALIBRATION;
    this._stateStartTime = performance.now();
    this._poses = getRandomPoses(ROUNDS_PER_GAME);
    this._currentRound = 0;
    this._currentPose = null;
    this._calibrationReady = false;
    this._calibrationReadyTime = 0;
    this._calibrationMessage = "請站到全身都在畫面中";
    this._currentScore = 0;
    this._rawScore = 0;
    this._bestScore = 0;
    this._partScores = {};
    this._roundResults = [];
    this._particles = [];

    // 預載所有姿勢圖片
    this._preloadImages();
  },

  /**
   * 預載圖片
   */
  _preloadImages() {
    this._imagesLoaded = false;
    let loaded = 0;
    const total = this._poses.length;

    for (const pose of this._poses) {
      if (this._imageCache[pose.id]) {
        loaded++;
        if (loaded >= total) this._imagesLoaded = true;
        continue;
      }
      const img = new Image();
      img.onload = () => {
        this._imageCache[pose.id] = img;
        loaded++;
        if (loaded >= total) this._imagesLoaded = true;
      };
      img.onerror = () => {
        console.warn(`圖片載入失敗: ${pose.image}`);
        loaded++;
        if (loaded >= total) this._imagesLoaded = true;
      };
      img.src = pose.image;
    }

    if (total === 0) this._imagesLoaded = true;
  },

  /**
   * 每幀更新遊戲邏輯
   */
  update(allLandmarks, timestamp) {
    if (this._gameOver) return;

    const landmarks = allLandmarks && allLandmarks[0] ? allLandmarks[0] : null;
    const elapsed = timestamp - this._stateStartTime;

    switch (this._state) {
      case STATE.CALIBRATION:
        this._updateCalibration(landmarks, timestamp);
        break;

      case STATE.PREVIEW:
        if (elapsed >= PREVIEW_DURATION) {
          this._changeState(STATE.COUNTDOWN, timestamp);
        }
        break;

      case STATE.COUNTDOWN:
        if (elapsed >= COUNTDOWN_DURATION) {
          this._bestScore = 0;
          this._currentScore = 0;
          this._changeState(STATE.DETECTING, timestamp);
        }
        break;

      case STATE.DETECTING:
        this._updateDetecting(landmarks, timestamp, elapsed);
        break;

      case STATE.RESULT:
        // 更新粒子特效
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
   * 更新校準狀態
   */
  _updateCalibration(landmarks, timestamp) {
    if (!landmarks) {
      this._calibrationReady = false;
      this._calibrationReadyTime = 0;
      this._calibrationMessage = "偵測不到人，請站到鏡頭前";
      return;
    }

    const check = checkFullBodyVisible(landmarks);

    if (check.allVisible) {
      if (!this._calibrationReady) {
        this._calibrationReady = true;
        this._calibrationReadyTime = timestamp;
      }
      this._calibrationMessage = "很好！保持不動...";

      // 持續 2 秒全身可見 → 進入遊戲
      if (timestamp - this._calibrationReadyTime >= 2000) {
        this._currentPose = this._poses[0];
        this._changeState(STATE.PREVIEW, timestamp);
      }
    } else {
      this._calibrationReady = false;
      this._calibrationReadyTime = 0;
      if (check.needStepBack) {
        this._calibrationMessage = "請再退後一步，讓全身都在畫面中～";
      } else {
        this._calibrationMessage = `偵測不到：${check.missingParts.join("、")}`;
      }
    }
  },

  /**
   * 更新偵測狀態
   */
  _updateDetecting(landmarks, timestamp, elapsed) {
    if (elapsed >= DETECT_DURATION) {
      // 偵測時間到，記錄結果
      this._roundResults.push({
        pose: this._currentPose,
        bestScore: this._bestScore,
      });
      this._spawnResultParticles();
      this._changeState(STATE.RESULT, timestamp);
      return;
    }

    if (!landmarks) return;

    // 計算姿勢匹配度
    const result = comparePose(landmarks, this._currentPose);
    this._rawScore = result.totalScore;
    this._partScores = result.partScores;

    // EMA 平滑顯示分數
    this._currentScore = this._currentScore * (1 - SCORE_EMA_ALPHA)
                        + this._rawScore * SCORE_EMA_ALPHA;

    // 記錄最高分
    if (this._rawScore > this._bestScore) {
      this._bestScore = this._rawScore;
    }
  },

  /**
   * 進入下一輪
   */
  _nextRound(timestamp) {
    this._currentRound++;
    if (this._currentRound >= ROUNDS_PER_GAME) {
      this._changeState(STATE.GAME_OVER, timestamp);
      this._spawnResultParticles();
    } else {
      this._currentPose = this._poses[this._currentRound];
      this._currentScore = 0;
      this._rawScore = 0;
      this._bestScore = 0;
      this._partScores = {};
      this._changeState(STATE.PREVIEW, timestamp);
    }
  },

  /**
   * 切換遊戲狀態
   */
  _changeState(newState, timestamp) {
    this._state = newState;
    this._stateStartTime = timestamp;
  },

  // ═══════════════════════════════════════
  // 渲染方法
  // ═══════════════════════════════════════

  /**
   * 渲染遊戲畫面
   */
  render(ctx) {
    const w = this._w;
    const h = this._h;

    switch (this._state) {
      case STATE.CALIBRATION:
        this._renderCalibration(ctx, w, h);
        break;

      case STATE.PREVIEW:
        this._renderPreview(ctx, w, h);
        break;

      case STATE.COUNTDOWN:
        this._renderCountdown(ctx, w, h);
        break;

      case STATE.DETECTING:
        this._renderDetecting(ctx, w, h);
        break;

      case STATE.RESULT:
        this._renderResult(ctx, w, h);
        break;

      case STATE.GAME_OVER:
        this._renderGameOver(ctx, w, h);
        break;
    }
  },

  /**
   * 渲染校準畫面
   */
  _renderCalibration(ctx, w, h) {
    // 半透明遮罩
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, w, h);

    // 人形輪廓框
    const frameW = w * 0.5;
    const frameH = h * 0.8;
    const frameX = (w - frameW) / 2;
    const frameY = (h - frameH) / 2;

    ctx.strokeStyle = this._calibrationReady ? C.success : C.light;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    // 畫一個簡化的人形輪廓
    ctx.beginPath();
    // 頭部（圓）
    const headR = frameW * 0.12;
    const headCX = frameX + frameW / 2;
    const headCY = frameY + headR + 10;
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    // 身體（矩形）
    const bodyTop = headCY + headR + 5;
    const bodyW = frameW * 0.4;
    const bodyH = frameH * 0.35;
    ctx.moveTo(headCX - bodyW / 2, bodyTop);
    ctx.lineTo(headCX + bodyW / 2, bodyTop);
    ctx.lineTo(headCX + bodyW / 2, bodyTop + bodyH);
    ctx.lineTo(headCX - bodyW / 2, bodyTop + bodyH);
    ctx.closePath();
    // 腿（兩條線）
    const legTop = bodyTop + bodyH;
    ctx.moveTo(headCX - bodyW * 0.25, legTop);
    ctx.lineTo(headCX - bodyW * 0.3, frameY + frameH - 10);
    ctx.moveTo(headCX + bodyW * 0.25, legTop);
    ctx.lineTo(headCX + bodyW * 0.3, frameY + frameH - 10);
    // 手臂（兩條線）
    ctx.moveTo(headCX - bodyW / 2, bodyTop + 10);
    ctx.lineTo(frameX + 10, bodyTop + bodyH * 0.6);
    ctx.moveTo(headCX + bodyW / 2, bodyTop + 10);
    ctx.lineTo(frameX + frameW - 10, bodyTop + bodyH * 0.6);
    ctx.stroke();
    ctx.setLineDash([]);

    // 提示訊息
    const fontSize = Math.max(18, w * 0.04);
    ctx.fillStyle = this._calibrationReady ? C.success : C.light;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(this._calibrationMessage, w / 2, frameY + frameH + fontSize + 10);

    // 如果校準中，顯示進度
    if (this._calibrationReady) {
      ctx.fillStyle = C.success;
      ctx.font = `${fontSize * 0.8}px sans-serif`;
      ctx.fillText("✓ 全身偵測成功！", w / 2, frameY - 10);
    }
  },

  /**
   * 渲染展示目標姿勢（全螢幕）
   */
  _renderPreview(ctx, w, h) {
    const pose = this._currentPose;
    const elapsed = performance.now() - this._stateStartTime;
    const progress = Math.min(1, elapsed / PREVIEW_DURATION);

    // 半透明背景
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, w, h);

    // 輪次指示
    const smallFont = Math.max(14, w * 0.03);
    ctx.fillStyle = C.light;
    ctx.font = `${smallFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`第 ${this._currentRound + 1} / ${ROUNDS_PER_GAME} 輪`, w / 2, smallFont + 10);

    // 姿勢卡片（全螢幕居中顯示）
    const img = this._imageCache[pose.id];
    if (img) {
      const imgSize = Math.min(w * 0.6, h * 0.5);
      const imgX = (w - imgSize) / 2;
      const imgY = (h - imgSize) / 2 - h * 0.05;

      // 白色圓角卡片背景
      const padding = 15;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      this._roundRect(ctx, imgX - padding, imgY - padding,
        imgSize + padding * 2, imgSize + padding * 2, 20);
      ctx.fill();

      ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
    }

    // 姿勢名稱 + 動物名稱
    const nameFont = Math.max(24, w * 0.06);
    ctx.fillStyle = C.accent;
    ctx.font = `bold ${nameFont}px sans-serif`;
    ctx.textAlign = "center";
    const textY = h * 0.82;
    ctx.fillText(`${pose.animal}的${pose.name}`, w / 2, textY);

    // 語音提示文字
    ctx.fillStyle = C.light;
    ctx.font = `${nameFont * 0.6}px sans-serif`;
    ctx.fillText(pose.voiceHint, w / 2, textY + nameFont);

    // 進度條
    const barW = w * 0.6;
    const barH = 6;
    const barX = (w - barW) / 2;
    const barY = h - 30;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = C.brand;
    ctx.fillRect(barX, barY, barW * progress, barH);
  },

  /**
   * 渲染倒數 3-2-1
   */
  _renderCountdown(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const count = 3 - Math.floor(elapsed / 1000);

    if (count > 0) {
      // 大數字
      const fontSize = Math.max(80, w * 0.2);
      const scale = 1 + 0.3 * Math.sin((elapsed % 1000) / 1000 * Math.PI);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.fillStyle = C.light;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // 描邊效果
      ctx.strokeStyle = C.brand;
      ctx.lineWidth = 4;
      ctx.strokeText(count, 0, 0);
      ctx.fillText(count, 0, 0);
      ctx.restore();
    }

    // 同時顯示縮小版的目標姿勢卡（左上角）
    this._renderPoseCard(ctx, w, h);
  },

  /**
   * 渲染偵測中畫面
   */
  _renderDetecting(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const timeLeft = Math.max(0, (DETECT_DURATION - elapsed) / 1000);

    // 左上角姿勢卡片
    this._renderPoseCard(ctx, w, h);

    // 中央大百分比數字
    const score = Math.round(this._currentScore);
    const fontSize = Math.max(48, w * 0.12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 分數顏色隨高低變化
    if (score >= SCORE_PERFECT) ctx.fillStyle = C.success;
    else if (score >= SCORE_GREAT) ctx.fillStyle = C.accent;
    else if (score >= SCORE_GOOD) ctx.fillStyle = C.warning;
    else ctx.fillStyle = C.danger;

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeText(`${score}%`, w / 2, h * 0.15);
    ctx.fillText(`${score}%`, w / 2, h * 0.15);

    // 最高分小字
    const bestFont = Math.max(14, w * 0.03);
    ctx.fillStyle = C.light;
    ctx.font = `${bestFont}px sans-serif`;
    ctx.fillText(`最高: ${Math.round(this._bestScore)}%`, w / 2, h * 0.15 + fontSize * 0.5 + 10);

    // 倒數計時（右上角）
    const timerFont = Math.max(18, w * 0.04);
    ctx.fillStyle = timeLeft <= 1 ? C.danger : C.light;
    ctx.font = `bold ${timerFont}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`⏱ ${timeLeft.toFixed(1)}`, w - 15, timerFont + 10);

    // 各部位三色回饋（畫在骨架上）
    this._renderPartFeedback(ctx, w, h);

    // 影子引導（半透明目標骨架）
    this._renderTargetSkeleton(ctx, w, h);
  },

  /**
   * 渲染左上角姿勢卡片（縮小版）
   */
  _renderPoseCard(ctx, w, h) {
    const pose = this._currentPose;
    const img = this._imageCache[pose.id];
    if (!img) return;

    const cardSize = w * 0.25;
    const margin = 10;

    // 白色圓角卡片
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    this._roundRect(ctx, margin, margin, cardSize + 16, cardSize + 16, 12);
    ctx.fill();

    // 發光邊框
    ctx.strokeStyle = C.brand;
    ctx.lineWidth = 3;
    this._roundRect(ctx, margin, margin, cardSize + 16, cardSize + 16, 12);
    ctx.stroke();

    ctx.drawImage(img, margin + 8, margin + 8, cardSize, cardSize);
  },

  /**
   * 渲染各部位的三色回饋
   * 綠色（≥80%）、黃色（50-79%）、紅色（<50%）
   */
  _renderPartFeedback(ctx, w, h) {
    // 各部位分數對應到簡化的身體區域指示
    const scores = this._partScores;
    if (!scores || Object.keys(scores).length === 0) return;

    // 用顏色圓點顯示在畫面右側
    const parts = [
      { name: "左肩", key: "leftShoulder" },
      { name: "右肩", key: "rightShoulder" },
      { name: "左肘", key: "leftElbow" },
      { name: "右肘", key: "rightElbow" },
      { name: "左髖", key: "leftHip" },
      { name: "右髖", key: "rightHip" },
      { name: "左膝", key: "leftKnee" },
      { name: "右膝", key: "rightKnee" },
      { name: "軀幹", key: "torsoTilt" },
    ];

    const startY = h * 0.3;
    const spacing = Math.max(18, h * 0.04);
    const dotR = 6;
    const fontSize = Math.max(11, w * 0.022);

    ctx.textAlign = "right";
    ctx.font = `${fontSize}px sans-serif`;

    for (let i = 0; i < parts.length; i++) {
      const score = scores[parts[i].key] || 0;
      const y = startY + i * spacing;
      const x = w - 15;

      // 顏色
      let color;
      if (score >= 80) color = C.success;
      else if (score >= 50) color = C.warning;
      else color = C.danger;

      // 圓點
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fill();

      // 文字
      ctx.fillStyle = C.light;
      ctx.fillText(parts[i].name, x - dotR - 5, y + fontSize * 0.35);
    }
  },

  /**
   * 渲染半透明目標骨架（影子引導）
   * 在玩家身上疊加一個半透明的目標骨架輪廓
   * 讓玩家可以「對齊」而不是看旁邊的小圖
   */
  _renderTargetSkeleton(ctx, w, h) {
    // TODO: 在 TASK15 中實作
    // 需要根據玩家的肩寬和位置，縮放目標骨架
    // 並以半透明白色線條繪製在玩家身上
  },

  /**
   * 渲染本輪結果
   */
  _renderResult(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const result = this._roundResults[this._roundResults.length - 1];
    const score = Math.round(result.bestScore);

    // 半透明背景
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, w, h);

    // 評語和分數
    let text, color;
    if (score >= SCORE_PERFECT) {
      text = "PERFECT! ⭐";
      color = "#FFD700";
    } else if (score >= SCORE_GREAT) {
      text = "GREAT! ⭐";
      color = C.success;
    } else if (score >= SCORE_GOOD) {
      text = "GOOD!";
      color = C.accent;
    } else {
      text = "好棒！繼續加油！";
      color = C.brand;
    }

    // 評語（帶縮放動畫）
    const scale = Math.min(1.2, 0.5 + elapsed / 500);
    const textFont = Math.max(32, w * 0.08);
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

    // 分數
    const scoreFont = Math.max(48, w * 0.15);
    ctx.fillStyle = C.light;
    ctx.font = `bold ${scoreFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${score}%`, w / 2, h * 0.55);

    // 姿勢名稱
    const nameFont = Math.max(16, w * 0.035);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `${nameFont}px sans-serif`;
    ctx.fillText(`${result.pose.animal}的${result.pose.name}`, w / 2, h * 0.65);

    // 粒子特效
    this._renderParticles(ctx);
  },

  /**
   * 渲染結算畫面
   */
  _renderGameOver(ctx, w, h) {
    // 背景
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, w, h);

    // 標題
    const titleFont = Math.max(28, w * 0.06);
    ctx.fillStyle = C.accent;
    ctx.font = `bold ${titleFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("🎉 遊戲結束！", w / 2, titleFont + 20);

    // 計算總分和評語
    const avgScore = this._roundResults.reduce((s, r) => s + r.bestScore, 0) / this._roundResults.length;
    const perfectCount = this._roundResults.filter(r => r.bestScore >= SCORE_PERFECT).length;
    const greatCount = this._roundResults.filter(r => r.bestScore >= SCORE_GREAT).length;

    // 總評語
    let verdict;
    if (perfectCount >= 4) verdict = "姿勢大師！🏆";
    else if (greatCount >= 4) verdict = "超厲害！⭐";
    else if (greatCount >= 2) verdict = "做得很好！👍";
    else verdict = "越來越厲害了！💪";

    const verdictFont = Math.max(22, w * 0.05);
    ctx.fillStyle = C.light;
    ctx.font = `bold ${verdictFont}px sans-serif`;
    ctx.fillText(verdict, w / 2, titleFont + 20 + verdictFont + 20);

    // 平均分
    const avgFont = Math.max(36, w * 0.09);
    ctx.fillStyle = C.brand;
    ctx.font = `bold ${avgFont}px sans-serif`;
    ctx.fillText(`${Math.round(avgScore)}%`, w / 2, h * 0.4);

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `${Math.max(14, w * 0.03)}px sans-serif`;
    ctx.fillText("平均分數", w / 2, h * 0.4 + avgFont * 0.4 + 10);

    // 每輪成績列表
    const listTop = h * 0.52;
    const rowH = Math.max(22, h * 0.05);
    const listFont = Math.max(13, w * 0.028);
    ctx.font = `${listFont}px sans-serif`;
    ctx.textAlign = "left";

    for (let i = 0; i < this._roundResults.length; i++) {
      const r = this._roundResults[i];
      const y = listTop + i * rowH;
      const score = Math.round(r.bestScore);

      // 分數顏色
      if (score >= SCORE_PERFECT) ctx.fillStyle = "#FFD700";
      else if (score >= SCORE_GREAT) ctx.fillStyle = C.success;
      else if (score >= SCORE_GOOD) ctx.fillStyle = C.accent;
      else ctx.fillStyle = C.light;

      ctx.fillText(
        `${i + 1}. ${r.pose.animal}的${r.pose.name}　${score}%${score >= SCORE_PERFECT ? " ⭐" : ""}`,
        w * 0.15, y
      );
    }

    // 按鈕
    this._renderButton(ctx, "再玩一次", w * 0.28, h * 0.88, w * 0.2, h * 0.07, C.brand);
    this._renderButton(ctx, "回主選單", w * 0.52, h * 0.88, w * 0.2, h * 0.07, C.dark);

    // 粒子
    this._renderParticles(ctx);
  },

  // ═══════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════

  /**
   * 畫圓角矩形
   */
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

  /**
   * 畫按鈕
   */
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

  /**
   * 產生慶祝粒子
   */
  _spawnResultParticles() {
    const result = this._roundResults[this._roundResults.length - 1];
    const count = result.bestScore >= SCORE_PERFECT ? 40 :
                  result.bestScore >= SCORE_GREAT ? 25 : 15;

    for (let i = 0; i < count; i++) {
      this._particles.push({
        x: this._w / 2 + (Math.random() - 0.5) * this._w * 0.5,
        y: this._h * 0.4,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        size: Math.random() * 8 + 3,
        color: ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"][
          Math.floor(Math.random() * 6)
        ],
        life: 1,
        decay: 0.01 + Math.random() * 0.02,
      });
    }
  },

  _updateParticles() {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // 重力
      p.life -= p.decay;
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
  // 互動處理
  // ═══════════════════════════════════════

  /**
   * 處理點擊事件
   */
  handleClick(x, y) {
    if (this._state === STATE.GAME_OVER) {
      const w = this._w;
      const h = this._h;
      const btnW = w * 0.2;
      const btnH = h * 0.07;
      const btnY = h * 0.88;

      // 再玩一次按鈕
      if (x >= w * 0.28 && x <= w * 0.28 + btnW && y >= btnY && y <= btnY + btnH) {
        return "replay";
      }
      // 回主選單按鈕
      if (x >= w * 0.52 && x <= w * 0.52 + btnW && y >= btnY && y <= btnY + btnH) {
        return "menu";
      }
    }
    return null;
  },

  isGameOver() {
    return this._gameOver;
  },

  getResults() {
    const avgScore = this._roundResults.reduce((s, r) => s + r.bestScore, 0) / this._roundResults.length;
    return {
      averageScore: Math.round(avgScore),
      rounds: this._roundResults,
      perfectCount: this._roundResults.filter(r => r.bestScore >= SCORE_PERFECT).length,
    };
  },

  destroy() {
    this._particles = [];
    this._imageCache = {};
  },
};

export default poseMirror;
