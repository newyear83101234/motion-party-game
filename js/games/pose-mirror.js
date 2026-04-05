/**
 * 姿勢模仿（Pose Mirror）— 遊戲主模組 v3
 * 全面修復版：人形剪影校準、底部倒數、左對齊卡片、emoji 回饋、
 * 正確帽子定位（不鏡像翻轉）、完整遊戲流程
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
  displayName: "\u{1FA9E} 姿勢模仿",

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

  // ═══════════════════════════════════════
  // 預載圖片
  // ═══════════════════════════════════════

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

      case STATE.COUNTDOWN: {
        // 播放姿勢語音提示（倒數開始時）
        if (!this._voicePlayed && this._audio && this._currentPose) {
          const voiceKey = this._getVoiceKey(this._currentPose);
          if (voiceKey) this._audio.playSFXFromFile(voiceKey);
          this._voicePlayed = true;
        }
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

  // ── 校準更新 ──
  _updateCalibration(lm1, lm2, timestamp) {
    const isDual = this._mode === "dual";
    const landmarks = lm1;

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
        this._changeState(STATE.COUNTDOWN, timestamp);
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

  // ── 偵測更新 ──
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
      this._countdownSoundsPlayed = { 3: false, 2: false, 1: false };
      this._goSoundPlayed = false;
      this._changeState(STATE.COUNTDOWN, timestamp);
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
      case STATE.COUNTDOWN:    this._renderCountdown(ctx, w, h); break;
      case STATE.DETECTING:    this._renderDetecting(ctx, w, h); break;
      case STATE.RESULT:       this._renderResult(ctx, w, h); break;
      case STATE.GAME_OVER:    this._renderGameOver(ctx, w, h); break;
    }
  },

  // ── 校準畫面：人形剪影引導 ──
  _renderCalibration(ctx, w, h) {
    // 半透明遮罩
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, w, h);

    const isDual = this._mode === "dual";
    const silColor = this._calibrationReady ? C.success : "rgba(255,255,255,0.25)";

    if (isDual) {
      // 雙人模式：左 1/3 和右 1/3 各一個剪影
      this._drawSilhouette(ctx, w * 0.33, h * 0.5, h * 0.7, silColor);
      this._drawSilhouette(ctx, w * 0.67, h * 0.5, h * 0.7, silColor);

      // P1 / P2 標示
      const labelFont = Math.max(16, w * 0.035);
      ctx.font = `bold ${labelFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = C.p1;
      ctx.fillText("P1", w * 0.33, h * 0.08);
      ctx.fillStyle = C.p2;
      ctx.fillText("P2", w * 0.67, h * 0.08);

      // 中線分隔
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.1);
      ctx.lineTo(w / 2, h * 0.9);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // 單人模式：正中央一個剪影
      this._drawSilhouette(ctx, w * 0.5, h * 0.5, h * 0.7, silColor);
    }

    // 偵測成功提示
    if (this._calibrationReady) {
      const checkFont = Math.max(16, h * 0.035);
      ctx.fillStyle = C.success;
      ctx.font = `bold ${checkFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u2713 全身偵測成功！", w / 2, h * 0.1);
    }

    // 底部提示訊息
    const fontSize = Math.max(18, h * 0.05);
    ctx.fillStyle = this._calibrationReady ? C.success : C.light;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this._calibrationMessage, w / 2, h * 0.9);
  },

  /**
   * 繪製簡化人形剪影（圓形頭 + 橢圓身體 + 線條四肢）
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx - 中心 x
   * @param {number} cy - 中心 y
   * @param {number} totalH - 人形總高度
   * @param {string} color - 填充/描邊顏色
   */
  _drawSilhouette(ctx, cx, cy, totalH, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(3, totalH * 0.015);
    ctx.lineCap = "round";

    const headR = totalH * 0.08;          // 頭部半徑
    const bodyH = totalH * 0.28;          // 軀幹橢圓高度
    const bodyW = totalH * 0.12;          // 軀幹橢圓寬度
    const armLen = totalH * 0.22;         // 手臂長度
    const legLen = totalH * 0.28;         // 腿長度

    const headY = cy - totalH * 0.38;     // 頭部中心 y
    const shoulderY = headY + headR + totalH * 0.04; // 肩膀 y
    const bodyTopY = shoulderY;            // 軀幹頂部
    const hipY = bodyTopY + bodyH;         // 髖部 y

    // 頭部（圓形）
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // 軀幹（橢圓）
    ctx.beginPath();
    ctx.ellipse(cx, bodyTopY + bodyH / 2, bodyW, bodyH / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // 左臂（從肩膀往左下延伸）
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.8, shoulderY + totalH * 0.02);
    ctx.lineTo(cx - bodyW * 0.8 - armLen * 0.5, shoulderY + armLen * 0.85);
    ctx.stroke();

    // 右臂（從肩膀往右下延伸）
    ctx.beginPath();
    ctx.moveTo(cx + bodyW * 0.8, shoulderY + totalH * 0.02);
    ctx.lineTo(cx + bodyW * 0.8 + armLen * 0.5, shoulderY + armLen * 0.85);
    ctx.stroke();

    // 左腿（從髖部往左下延伸）
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.4, hipY);
    ctx.lineTo(cx - bodyW * 0.6 - legLen * 0.15, hipY + legLen);
    ctx.stroke();

    // 右腿（從髖部往右下延伸）
    ctx.beginPath();
    ctx.moveTo(cx + bodyW * 0.4, hipY);
    ctx.lineTo(cx + bodyW * 0.6 + legLen * 0.15, hipY + legLen);
    ctx.stroke();

    ctx.restore();
  },

  // ── 倒數 3-2-1：數字在底部，卡片在左上 ──
  _renderCountdown(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const count = 3 - Math.floor(elapsed / 1000);

    // 左上角姿勢卡片（倒數時就能看到目標姿勢）
    this._renderPoseCard(ctx, w, h);

    if (count > 0) {
      // 倒數數字在 y = h * 0.75（底部區域），避免擋住玩家身體
      const circleR = Math.max(30, h * 0.06); // 圓半徑 = h * 12% 直徑的一半
      const cx = w / 2;
      const cy = h * 0.75;
      const scale = 1 + 0.15 * Math.sin((elapsed % 1000) / 1000 * Math.PI);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      // 品牌色半透明圓形背景
      ctx.beginPath();
      ctx.arc(0, 0, circleR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(201, 79, 200, 0.5)";
      ctx.fill();

      // 白色大字數字
      const numFont = Math.max(36, circleR * 1.2);
      ctx.fillStyle = C.light;
      ctx.font = `bold ${numFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(count, 0, 0);

      ctx.restore();
    }
  },

  // ── 偵測中 ──
  _renderDetecting(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const timeLeft = Math.max(0, (DETECT_DURATION - elapsed) / 1000);

    // 影子引導（半透明目標骨架疊在玩家身上）
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

    // 姿勢卡片（左上角，佔 20% 寬度）
    this._renderPoseCard(ctx, w, h);

    // 分數顯示
    if (this._mode === "single") {
      this._renderSingleScore(ctx, w, h, timeLeft);
    } else {
      this._renderDualScore(ctx, w, h, timeLeft);
    }

    // 即時 emoji 回饋
    if (this._mode === "single") {
      const score = Math.round(this._currentScore);
      let emoji = "\u{1F525}";  // 火焰 < 50
      if (score >= SCORE_PERFECT) emoji = "\u2B50";       // 星星 >= 90
      else if (score >= SCORE_GREAT) emoji = "\u{1F44D}"; // 讚 >= 70
      else if (score >= SCORE_GOOD) emoji = "\u{1F4AA}";  // 肌肉 >= 50

      const emojiFont = Math.max(24, h * 0.08);
      ctx.font = `${emojiFont}px sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(emoji, w - 15, h * 0.22);
    }

    // 倒數計時（頂部中央）
    const timerFont = Math.max(18, h * 0.04);
    ctx.fillStyle = timeLeft <= 1 ? C.danger : C.light;
    ctx.font = `bold ${timerFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeText(`\u23F1 ${timeLeft.toFixed(1)}`, w / 2, timerFont + 8);
    ctx.fillText(`\u23F1 ${timeLeft.toFixed(1)}`, w / 2, timerFont + 8);

    // 底部進度條
    const barW = w * 0.8;
    const barH = 8;
    const barX = (w - barW) / 2;
    const barY = h - 20;
    const progress = Math.min(1, elapsed / DETECT_DURATION);

    // 進度條背景
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    this._roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();

    // 進度條填充（品牌色粉紫漸層）
    if (progress > 0) {
      const grad = ctx.createLinearGradient(barX, barY, barX + barW * progress, barY);
      grad.addColorStop(0, C.brand);
      grad.addColorStop(1, "#E040FB");
      ctx.fillStyle = grad;
      this._roundRect(ctx, barX, barY, barW * progress, barH, barH / 2);
      ctx.fill();
    }
  },

  // ── 左上角姿勢卡片（左對齊，20% 寬度） ──
  _renderPoseCard(ctx, w, h) {
    const pose = this._currentPose;
    if (!pose) return;
    const img = this._imageCache[pose.id];
    const cardSize = w * 0.20;
    const margin = 10;

    // 直接繪製去背透明圖（不畫白底框）
    if (img) {
      ctx.drawImage(img, margin, margin, cardSize, cardSize);
    }

    // 姿勢名稱（圖片正下方），textAlign = "left"
    const nameFont = Math.max(14, h * 0.035);
    ctx.fillStyle = C.accent;
    ctx.font = `bold ${nameFont}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 2;
    const nameY = margin + cardSize + 4;
    ctx.strokeText(`${pose.animal}的${pose.name}`, margin, nameY);
    ctx.fillText(`${pose.animal}的${pose.name}`, margin, nameY);

    // 提示語（名稱下方）
    const hintFont = Math.max(12, h * 0.025);
    ctx.fillStyle = C.light;
    ctx.font = `${hintFont}px sans-serif`;
    ctx.textAlign = "left";
    const hintY = nameY + nameFont + 4;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1.5;
    ctx.strokeText(pose.voiceHint, margin, hintY);
    ctx.fillText(pose.voiceHint, margin, hintY);

    // 輪次指示（右上角）
    const roundFont = Math.max(14, h * 0.03);
    ctx.fillStyle = C.light;
    ctx.font = `${roundFont}px sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    const roundText = `第 ${this._currentRound + 1}/${this._totalRounds} 輪`;
    ctx.strokeText(roundText, w - 15, 10);
    ctx.fillText(roundText, w - 15, 10);
  },

  // ── 單人分數（右側，h * 12% 字體） ──
  _renderSingleScore(ctx, w, h, timeLeft) {
    const score = Math.round(this._currentScore);
    const fontSize = Math.max(48, h * 0.12);

    // 分數顏色
    if (score >= SCORE_PERFECT) ctx.fillStyle = C.success;
    else if (score >= SCORE_GREAT) ctx.fillStyle = C.accent;
    else if (score >= SCORE_GOOD) ctx.fillStyle = C.warning;
    else ctx.fillStyle = C.danger;

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    const scoreY = Math.max(14, h * 0.03) + 18; // 在輪次下方
    ctx.strokeText(`${score}%`, w - 15, scoreY);
    ctx.fillText(`${score}%`, w - 15, scoreY);

    // 最高分
    const bestFont = Math.max(14, h * 0.03);
    ctx.fillStyle = C.light;
    ctx.font = `${bestFont}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`最高: ${Math.round(this._bestScore)}%`, w - 15, scoreY + fontSize + 4);
  },

  // ── 雙人分數（P1 左，P2 右） ──
  _renderDualScore(ctx, w, h, timeLeft) {
    const fontSize = Math.max(36, h * 0.12);
    const p1 = Math.round(this._p1Score);
    const p2 = Math.round(this._p2Score);

    // P1 分數（左側）
    ctx.fillStyle = C.p1;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeText(`${p1}%`, 15, h * 0.75);
    ctx.fillText(`${p1}%`, 15, h * 0.75);

    // P1 最高
    const bestFont = Math.max(12, h * 0.025);
    ctx.font = `${bestFont}px sans-serif`;
    ctx.fillText(`最高: ${Math.round(this._p1Best)}%`, 15, h * 0.75 + fontSize + 5);

    // P2 分數（右側）
    ctx.fillStyle = C.p2;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "right";
    ctx.strokeText(`${p2}%`, w - 15, h * 0.75);
    ctx.fillText(`${p2}%`, w - 15, h * 0.75);

    ctx.font = `${bestFont}px sans-serif`;
    ctx.fillText(`最高: ${Math.round(this._p2Best)}%`, w - 15, h * 0.75 + fontSize + 5);
  },

  // ── 影子引導：半透明白色虛線骨架 ──
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

    // 根據目標角度推算各關節的理想位置
    const ta = pose.targetAngles;
    const unit = playerShoulderW * 0.5; // 半肩寬作為單位長度

    // 肩膀位置
    const shoulderL = { x: playerCenterX - unit, y: playerShoulderY };
    const shoulderR = { x: playerCenterX + unit, y: playerShoulderY };

    // 髖部位置
    const hipL = { x: playerCenterX - unit * 0.5, y: playerHipY };
    const hipR = { x: playerCenterX + unit * 0.5, y: playerHipY };

    // 用角度推算各關節位置
    const elbowL = this._calcTargetJoint(shoulderL, ta.leftShoulder, unit * 1.0, hipL, true);
    const elbowR = this._calcTargetJoint(shoulderR, ta.rightShoulder, unit * 1.0, hipR, false);
    const wristL = this._calcTargetJoint(elbowL, ta.leftElbow, unit * 0.9, shoulderL, true);
    const wristR = this._calcTargetJoint(elbowR, ta.rightElbow, unit * 0.9, shoulderR, false);
    const kneeL = this._calcTargetJoint(hipL, ta.leftHip, unit * 1.2, shoulderL, true);
    const kneeR = this._calcTargetJoint(hipR, ta.rightHip, unit * 1.2, shoulderR, false);
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

    // 繪製半透明白色虛線骨架
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
   * @param {Object} origin - 起點
   * @param {number} angle - 目標角度（度）
   * @param {number} length - 骨骼長度（像素）
   * @param {Object} refPoint - 參考點
   * @param {boolean} isLeft - 是否是左側
   * @returns {Object} { x, y } 目標位置
   */
  _calcTargetJoint(origin, angle, length, refPoint, isLeft) {
    const refAngle = Math.atan2(refPoint.y - origin.y, refPoint.x - origin.x);
    const targetRad = angle * Math.PI / 180;
    const dir = isLeft ? 1 : -1;
    const finalAngle = refAngle + dir * targetRad;
    return {
      x: origin.x + Math.cos(finalAngle) * length,
      y: origin.y + Math.sin(finalAngle) * length,
    };
  },

  // ── 頭飾特效（用 landmark 7/8 耳朵定位，不做鏡像翻轉）──
  _renderHat(ctx, w, h, landmarks, pose) {
    if (!landmarks || !pose) return;
    const hatImg = this._hatCache[pose.id];
    if (!hatImg) return;

    // 用耳朵 landmark 7/8 定位頭頂
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    if (!leftEar || !rightEar) return;
    if (leftEar.visibility < 0.2 && rightEar.visibility < 0.2) return;

    // 耳朵中點 = 頭部中心
    // 不做 1-x 鏡像翻轉，因為 canvas 已經做了水平翻轉
    const headCX = (leftEar.x + rightEar.x) / 2 * w;
    const headCY = (leftEar.y + rightEar.y) / 2 * h;
    const faceW = Math.abs(leftEar.x - rightEar.x) * w;

    // 耳朵寬度 = 臉寬 * 0.8
    const hatW = Math.max(faceW * 0.8, 60);
    const hatH = hatW;  // 正方形

    // 位置：頭頂上方（臉高 * 0.3 偏移）
    const hatY = headCY - faceW * 0.6 - hatH;

    ctx.drawImage(hatImg, headCX - hatW / 2, hatY, hatW, hatH);
  },

  // ── 結算畫面 ──
  _renderResult(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;

    // 半透明遮罩
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, w, h);

    if (this._mode === "single") {
      const result = this._roundResults[this._roundResults.length - 1];
      const score = Math.round(result.bestScore);

      // 評級文字和顏色
      let text, color;
      if (score >= SCORE_PERFECT)   { text = "PERFECT! \u2B50"; color = "#FFD700"; }
      else if (score >= SCORE_GREAT) { text = "GREAT! \u2B50"; color = C.success; }
      else if (score >= SCORE_GOOD)  { text = "GOOD!"; color = C.accent; }
      else { text = "好棒！繼續加油！"; color = C.brand; }

      // 印章彈跳動畫（先放大再縮回）
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

      // 大分數
      const scoreFont = Math.max(48, h * 0.18);
      ctx.fillStyle = C.light;
      ctx.font = `bold ${scoreFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
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
      ctx.textBaseline = "middle";
      ctx.fillText(`${p1}%`, w * 0.25, h * 0.4);
      if (result.winner === 1) {
        ctx.font = `${Math.max(20, h * 0.05)}px sans-serif`;
        ctx.fillText("\u{1F451} WIN!", w * 0.25, h * 0.4 + scoreFont * 0.6);
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
        ctx.fillText("\u{1F451} WIN!", w * 0.75, h * 0.4 + scoreFont * 0.6);
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
    ctx.textBaseline = "middle";
    ctx.fillText(`${last.pose.animal}的${last.pose.name}`, w / 2, h * 0.75);

    this._renderParticles(ctx);
  },

  // ── 遊戲結束畫面 ──
  _renderGameOver(ctx, w, h) {
    // 深色遮罩
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, w, h);

    const titleFont = Math.max(28, h * 0.06);
    ctx.fillStyle = C.accent;
    ctx.font = `bold ${titleFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (this._mode === "single") {
      ctx.fillText("\u{1F389} 遊戲結束！", w / 2, titleFont + 20);

      const avgScore = this._roundResults.reduce((s, r) => s + r.bestScore, 0) / this._roundResults.length;
      const perfectCount = this._roundResults.filter(r => r.bestScore >= SCORE_PERFECT).length;
      const greatCount = this._roundResults.filter(r => r.bestScore >= SCORE_GREAT).length;

      let verdict;
      if (perfectCount >= 4) verdict = "姿勢大師！\u{1F3C6}";
      else if (greatCount >= 4) verdict = "超厲害！\u2B50";
      else if (greatCount >= 2) verdict = "做得很好！\u{1F44D}";
      else verdict = "越來越厲害了！\u{1F4AA}";

      ctx.fillStyle = C.light;
      ctx.font = `bold ${Math.max(22, h * 0.05)}px sans-serif`;
      ctx.fillText(verdict, w / 2, titleFont + 20 + Math.max(22, h * 0.05) + 20);

      // 平均分數
      const avgFont = Math.max(36, h * 0.1);
      ctx.fillStyle = C.brand;
      ctx.font = `bold ${avgFont}px sans-serif`;
      ctx.fillText(`${Math.round(avgScore)}%`, w / 2, h * 0.4);

      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = `${Math.max(14, h * 0.03)}px sans-serif`;
      ctx.fillText("平均分數", w / 2, h * 0.4 + avgFont * 0.4 + 10);

      // 每輪成績列表
      const listTop = h * 0.52;
      const rowH = Math.max(20, h * 0.045);
      ctx.font = `${Math.max(13, h * 0.028)}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      for (let i = 0; i < this._roundResults.length; i++) {
        const r = this._roundResults[i];
        const y = listTop + i * rowH;
        const sc = Math.round(r.bestScore);
        if (sc >= SCORE_PERFECT) ctx.fillStyle = "#FFD700";
        else if (sc >= SCORE_GREAT) ctx.fillStyle = C.success;
        else if (sc >= SCORE_GOOD) ctx.fillStyle = C.accent;
        else ctx.fillStyle = C.light;
        ctx.fillText(
          `${i + 1}. ${r.pose.animal}的${r.pose.name}  ${sc}%${sc >= SCORE_PERFECT ? " \u2B50" : ""}`,
          w * 0.15, y
        );
      }
    } else {
      // 雙人結算
      const winner = this._p1Wins > this._p2Wins ? "P1" : (this._p2Wins > this._p1Wins ? "P2" : "平手");
      ctx.fillText(
        winner === "平手" ? "\u{1F91D} 平手！" : `\u{1F389} ${winner} 獲勝！`,
        w / 2, titleFont + 20
      );

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
      ctx.textBaseline = "top";

      for (let i = 0; i < this._roundResults.length; i++) {
        const r = this._roundResults[i];
        const y = listTop + i * rowH;
        const p1s = Math.round(r.p1Score);
        const p2s = Math.round(r.p2Score);

        ctx.fillStyle = r.winner === 1 ? C.p1 : (r.winner === 2 ? C.p2 : C.light);
        ctx.fillText(
          `${i + 1}. ${r.pose.name}  P1 ${p1s}% vs ${p2s}% P2${r.winner ? (r.winner === 1 ? " \u2190 勝" : " 勝 \u2192") : ""}`,
          w / 2, y
        );
      }
    }

    // 按鈕：「再玩一次」和「回到選單」
    this._renderButton(ctx, "再玩一次", w * 0.28, h * 0.88, w * 0.2, h * 0.07, C.brand);
    this._renderButton(ctx, "回到選單", w * 0.52, h * 0.88, w * 0.2, h * 0.07, C.dark);

    this._renderParticles(ctx);
  },

  // ═══════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════

  // ── 圓角矩形 ──
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

  // ── 按鈕繪製 ──
  _renderButton(ctx, text, x, y, bw, bh, color) {
    ctx.fillStyle = color;
    this._roundRect(ctx, x, y, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = C.light;
    ctx.font = `bold ${Math.max(12, bh * 0.4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + bw / 2, y + bh / 2);
  },

  // ── 粒子特效 ──
  _spawnResultParticles() {
    const isPerfect = this._bestScore >= SCORE_PERFECT ||
                      this._p1Best >= SCORE_PERFECT ||
                      this._p2Best >= SCORE_PERFECT;
    const count = isPerfect ? 40 : 20;
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
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
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
  // 互動
  // ═══════════════════════════════════════

  handleClick(x, y) {
    if (this._state === STATE.GAME_OVER) {
      const bw = this._w * 0.2;
      const bh = this._h * 0.07;
      const btnY = this._h * 0.88;

      // 「再玩一次」按鈕
      if (x >= this._w * 0.28 && x <= this._w * 0.28 + bw && y >= btnY && y <= btnY + bh) {
        return "replay";
      }
      // 「回到選單」按鈕
      if (x >= this._w * 0.52 && x <= this._w * 0.52 + bw && y >= btnY && y <= btnY + bh) {
        return "menu";
      }
    }
    return null;
  },

  isGameOver() {
    return this._gameOver;
  },

  getResults() {
    if (this._mode === "single") {
      const avg = this._roundResults.length > 0
        ? this._roundResults.reduce((s, r) => s + r.bestScore, 0) / this._roundResults.length
        : 0;
      return { averageScore: Math.round(avg), rounds: this._roundResults };
    } else {
      return { p1Wins: this._p1Wins, p2Wins: this._p2Wins, rounds: this._roundResults };
    }
  },

  destroy() {
    this._particles = [];
    this._imageCache = {};
    this._hatCache = {};
    this._lastLandmarks = null;
    this._lastLandmarksP2 = null;
  },
};

export default poseMirror;
