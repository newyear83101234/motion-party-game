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

  // ── 頭飾特效（用 landmark 7/8 耳朵定位）──
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
    const headCX = ((1 - leftEar.x) + (1 - rightEar.x)) / 2 * w;  // 鏡像翻轉
    const headCY = (leftEar.y + rightEar.y) / 2 * h;
    const faceW = Math.abs(leftEar.x - rightEar.x) * w;

    // 耳朵寬度 = 臉寬 × 0.8
    const hatW = Math.max(faceW * 0.8, 60);
    const hatH = hatW;  // 正方形

    // 位置：頭頂上方（臉高 × 0.3 偏移）
    const hatY = headCY - faceW * 0.6 - hatH;

    ctx.drawImage(hatImg, headCX - hatW / 2, hatY, hatW, hatH);
  },

  // ── 左上角姿勢卡片（統一版面，佔 22% 寬度）──
  _renderPoseCard(ctx, w, h) {
    const pose = this._currentPose;
    if (!pose) return;
    const img = this._imageCache[pose.id];
    const cardSize = w * 0.22;
    const margin = 12;

    // 直接繪製去背透明圖（不畫白底框）
    if (img) {
      ctx.drawImage(img, margin, margin, cardSize, cardSize);
    }

    // 姿勢名稱（圖片下方）
    const nameFont = Math.max(14, h * 0.03);
    ctx.fillStyle = C.accent;
    ctx.font = `bold ${nameFont}px sans-serif`;
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeText(`${pose.animal}的${pose.name}`, margin, margin + cardSize + nameFont + 4);
    ctx.fillText(`${pose.animal}的${pose.name}`, margin, margin + cardSize + nameFont + 4);

    // 提示語
    ctx.fillStyle = C.light;
    ctx.font = `${nameFont * 0.85}px sans-serif`;
    ctx.strokeText(pose.voiceHint, margin, margin + cardSize + nameFont * 2 + 8);
    ctx.fillText(pose.voiceHint, margin, margin + cardSize + nameFont * 2 + 8);

    // 輪次（頂部中央）
    ctx.fillStyle = C.light;
    ctx.font = `${Math.max(14, h * 0.03)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.strokeText(`第 ${this._currentRound + 1} / ${this._totalRounds} 輪`, w / 2, Math.max(14, h * 0.03) + 10);
    ctx.fillText(`第 ${this._currentRound + 1} / ${this._totalRounds} 輪`, w / 2, Math.max(14, h * 0.03) + 10);
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
