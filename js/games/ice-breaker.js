/**
 * ice-breaker.js — 敲冰塊迷你遊戲（美化版）
 * 冰塊從上方掉落，玩家揮動手腕敲碎冰塊得分
 * 包含：粒子特效、連擊系統、HUD 動畫、結算畫面
 */

// ── 調試開關 ──
const DEBUG_MODE = false;

// ── 配色方案 ──
const C = {
  brand:   "#C94FC8",
  accent:  "#F5A623",
  success: "#1ABC9C",
  danger:  "#FF4757",
  dark:    "#2D3436",
  light:   "#FDFEFE",
  mask:    "rgba(0, 0, 0, 0.7)",
};

// ── 遊戲常數（2-6 歲幼兒適配）──
const GAME_DURATION    = 45;       // 原 60 → 45 秒（幼兒注意力短）
const HIT_RADIUS_EXTRA = 55;      // 原 30 → 55（放寬碰撞判定）
const MIN_SWIPE_SPEED  = 0.012;   // 0.008 偏低（MediaPipe 抖動會產生 ~0.005 假速度，有刷分風險），0.012 折衷（SPEC 原 0.02 太嚴）
const WRIST_LEFT       = 15;
const WRIST_RIGHT      = 16;
const COMBO_TIMEOUT    = 2000;    // 連擊中斷時間（ms）

// ── 冰塊類型（幼兒適配：放大、取消扣分、降低炸彈權重）──
const BLOCK_TYPES = [
  { type: "normal", size: 140, score: 10,  speedMult: 1.0, weight: 65, hits: 1 },
  { type: "gold",   size: 140, score: 30,  speedMult: 1.1, weight: 15, hits: 1 },
  { type: "bomb",   size: 130, score: 0,   speedMult: 0.8, weight: 8,  hits: 1 },
  { type: "big",    size: 200, score: 50,  speedMult: 0.6, weight: 12, hits: 3 },
];
const TOTAL_WEIGHT = BLOCK_TYPES.reduce((s, b) => s + b.weight, 0);

// ── 難度曲線（幼兒適配：降速、限制數量）──
const DIFFICULTY = [
  { time: 0,  spawnInterval: 1500, fallSpeed: 2.0, maxBlocks: 2 },
  { time: 12, spawnInterval: 1200, fallSpeed: 2.5, maxBlocks: 3 },
  { time: 25, spawnInterval: 1000, fallSpeed: 3.0, maxBlocks: 3 },
  { time: 38, spawnInterval: 800,  fallSpeed: 3.5, maxBlocks: 3 },
];

// ══════════════════════════════════════════
// ── 繪圖工具函式 ──
// ══════════════════════════════════════════

/** 描邊文字（先 stroke 再 fill，確保可讀） */
function outlinedText(ctx, text, x, y, fill = C.light, stroke = C.dark, lw = 5) {
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** 開啟硬陰影（帶模糊增強對比） */
function shadowOn(ctx) {
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
}
function shadowOff(ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** 圓角矩形路徑 */
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** 8 角星芒 */
function drawStarBurst(ctx, x, y, outerR, innerR, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 加權隨機選擇冰塊類型 */
function pickBlockType() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const bt of BLOCK_TYPES) {
    r -= bt.weight;
    if (r <= 0) return bt;
  }
  return BLOCK_TYPES[0];
}

// ── 圖片預載 ──
// 冰塊圖片 v2 — 全部去背透明 PNG（本地路徑）
const BLOCK_IMAGES = {};
const IMAGE_PATHS = {
  normal: "IMAGES/ice_normal.png",
  gold:   "IMAGES/ice_gold.png",
  bomb:   "IMAGES/ice_bomb.png",
  big:    "IMAGES/ice_big.png",
};

for (const [type, path] of Object.entries(IMAGE_PATHS)) {
  const img = new Image();
  img.src = path;
  img.onload = () => console.log(`[IceBreaker] 圖片載入完成: ${type}`);
  img.onerror = () => console.warn(`[IceBreaker] 圖片載入失敗: ${type}，將使用備用繪製`);
  BLOCK_IMAGES[type] = img;
}

// 雪帽圖片
const hatImg = new Image();
hatImg.src = "IMAGES/hat_snow.png";
hatImg.onload = () => console.log("[IceBreaker] 雪帽圖片載入完成");

// 鋼鐵手套圖片
const gauntletImg = new Image();
gauntletImg.src = "IMAGES/gauntlet.png";
gauntletImg.onload = () => console.log("[IceBreaker] 手套圖片載入完成");

// 玩家 2 雪帽圖片（橘色）
const hatOrangeImg = new Image();
hatOrangeImg.src = "IMAGES/hat_orange.png";
hatOrangeImg.onload = () => console.log("[IceBreaker] 玩家2 雪帽圖片載入完成");

// 玩家 2 鋼鐵手套圖片（橘紅色）
const gauntletOrangeImg = new Image();
gauntletOrangeImg.src = "IMAGES/gauntlet_orange.png";
gauntletOrangeImg.onload = () => console.log("[IceBreaker] 玩家2 手套圖片載入完成");

// 隨機鼓勵文字
const ENCOURAGE_TEXTS = ["你好棒！", "超厲害！", "繼續加油！", "冰塊剋星！", "太強了！"];

// ══════════════════════════════════════════
// ── 遊戲主體 ──
// ══════════════════════════════════════════

export default {
  name: "ice-breaker",
  displayName: "敲冰塊",

  // ── 狀態欄位 ──
  _w: 0, _h: 0,
  _mode: "single",        // "single" | "dual"
  _score: 0,
  _timeLeft: GAME_DURATION,
  _startTime: 0,
  _lastSpawn: 0,
  _blocks: [],
  _gameOver: false,
  _prevWrists: { left: null, right: null },
  _wristState: { left: null, right: null },  // 當前幀手腕位置＋速度

  // 特效系統
  _particles: [],       // 碎片粒子
  _starBursts: [],      // 星芒特效
  _floatingTexts: [],   // 浮動加分文字
  _snowflakes: [],      // 背景雪花

  // 連擊系統
  _combo: 0,
  _lastHitTime: 0,
  _comboPopup: null,    // { startTime, combo }
  _screenFlash: null,   // { startTime }

  // HUD 動畫
  _scoreBounce: 0,      // 分數彈跳時間戳
  _displayScore: 0,     // 顯示用分數（結算計數動畫）

  // 結算畫面
  _resultStartTime: 0,
  _resultConfetti: [],
  _resultButtons: [],   // { x, y, w, h, action }

  // 音效
  _audio: null,
  _timeWarningFired: false,    // 是否已觸發時間警告音
  _lastScoreRollTime: 0,       // 結算分數滾動音的節流
  _starsRevealed: 0,           // 已播放幾顆星的音效
  _confettiFired: false,       // 紙片音效是否已觸發
  _bgmAccelStage: 0,          // BGM 加速階段（0/1/2/3）

  // ── 初始化 ──
  init(ctx, options) {
    this._w = options.canvasWidth;
    this._h = options.canvasHeight;
    this._mode = options.mode || "single";
    this._audio = options.audioManager || null;
    this._score = 0;
    this._timeLeft = GAME_DURATION;
    this._startTime = 0;
    this._lastSpawn = 0;
    this._blocks = [];
    this._gameOver = false;
    this._prevWrists = { left: null, right: null };
    this._wristState = { left: null, right: null };
    this._particles = [];
    this._starBursts = [];
    this._floatingTexts = [];
    this._combo = 0;
    this._lastHitTime = 0;
    this._comboPopup = null;
    this._screenFlash = null;
    this._scoreBounce = 0;
    this._displayScore = 0;
    this._resultStartTime = 0;
    this._resultConfetti = [];
    this._resultButtons = [];
    this._now = 0;
    this._landmarks = null;         // 當前幀的骨架資料（用於帽子渲染）
    this._hitScaleLeft = 0;         // 左手套擊中放大時間戳
    this._hitScaleRight = 0;        // 右手套擊中放大時間戳
    this._encourageText = ENCOURAGE_TEXTS[Math.floor(Math.random() * ENCOURAGE_TEXTS.length)];
    this._hitFlashes = [];
    this._shockwaves = [];
    this._screenShake = null;
    this._starParticles = [];
    this._timeWarningFired = false;
    this._lastWarnSec = 0;
    this._lastScoreRollTime = 0;
    this._starsRevealed = 0;
    this._confettiFired = false;
    this._bgmAccelStage = 0;
    this._quitConfirmOpen = false;
    this._quitBtnArea = null;
    this._quitYes = null;
    this._quitNo = null;

    // 雙人模式狀態
    this._player2Score = 0;
    this._player2Combo = 0;
    this._player2Landmarks = null;
    this._p2WristState = { left: null, right: null };
    this._p2PrevWrists = { left: null, right: null };
    this._p2HitScaleLeft = 0;
    this._p2HitScaleRight = 0;
    this._p2ScoreBounce = 0;
    this._p2LastHitTime = 0;
    this._lastSpawnP2 = 0;

    // 雙人模式：玩家 ID 穩定追蹤
    this._prevP1ShoulderX = null;  // 上一幀玩家 1 肩膀中心 x
    this._prevP2ShoulderX = null;  // 上一幀玩家 2 肩膀中心 x

    // EMA 平滑（帽子 + 手套共用）
    this._emaAlpha = 0.15;         // EMA 係數（越小越平滑，0.15 適合雙人防閃爍）
    this._emaP1Hat = null;         // { x, y, w, h } 玩家 1 帽子 EMA
    this._emaP2Hat = null;         // 玩家 2 帽子 EMA
    this._emaP1Wrists = { left: null, right: null };
    this._emaP2Wrists = { left: null, right: null };

    // 暫存機制：landmarks 消失後保留 10 幀
    this._p1StaleFrames = 0;
    this._p2StaleFrames = 0;
    this._cachedP1Landmarks = null;
    this._cachedP2Landmarks = null;

    // 初始化背景雪花
    this._snowflakes = [];
    for (let i = 0; i < 18; i++) {
      this._snowflakes.push({
        x: Math.random() * this._w,
        y: Math.random() * this._h,
        size: 5 + Math.random() * 5,
        speed: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.005 + Math.random() * 0.01,
        alpha: 0.15 + Math.random() * 0.2,
      });
    }

  },

  // ── 每幀更新 ──
  update(allLandmarks, timestamp) {
    this._now = timestamp;

    // 更新雪花
    for (const s of this._snowflakes) {
      s.y += s.speed;
      s.phase += s.phaseSpeed;
      s.x += Math.sin(s.phase) * 0.8;
      if (s.y > this._h + 10) { s.y = -10; s.x = Math.random() * this._w; }
    }

    // 更新粒子
    this._particles = this._particles.filter(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.15;          // 重力
      p.life -= 1 / 30;      // 約 0.5 秒壽命
      p.rotation += p.rotSpeed;
      return p.life > 0;
    });

    // 更新星芒
    this._starBursts = this._starBursts.filter(s => {
      s.elapsed = (timestamp - s.startTime) / 1000;
      return s.elapsed < 0.3;
    });

    // 更新浮動文字
    this._floatingTexts = this._floatingTexts.filter(t => {
      t.elapsed = (timestamp - t.startTime) / 1000;
      return t.elapsed < 0.8;
    });

    // 更新白色閃光
    this._hitFlashes = this._hitFlashes.filter(f => {
      f.elapsed = (timestamp - f.startTime) / 1000;
      return f.elapsed < 0.12;
    });

    // 更新衝擊波
    this._shockwaves = this._shockwaves.filter(s => {
      s.elapsed = (timestamp - s.startTime) / 1000;
      return s.elapsed < 0.2;
    });

    // 更新星星粒子
    this._starParticles = this._starParticles.filter(p => {
      p.y -= p.speed;
      p.elapsed = (timestamp - p.startTime) / 1000;
      return p.elapsed < 0.54;
    });

    // 畫面震動（炸彈用）
    if (this._screenShake) {
      if ((timestamp - this._screenShake.startTime) > 200) {
        this._screenShake = null;
      }
    }

    // 連擊超時重置
    if (this._combo > 0 && timestamp - this._lastHitTime > COMBO_TIMEOUT) {
      this._combo = 0;
    }

    // 結算畫面不再更新遊戲邏輯
    if (this._gameOver) {
      // 更新結算紙片
      for (const c of this._resultConfetti) {
        c.y += c.speed;
        c.x += Math.sin(c.phase) * 0.5;
        c.phase += c.phaseSpeed;
        c.rotation += c.rotSpeed;
        if (c.y > this._h + 20) { c.y = -20; c.x = Math.random() * this._w; }
      }
      return;
    }

    // 初始化開始時間
    if (this._startTime === 0) {
      this._startTime = timestamp;
      this._lastSpawn = timestamp;
    }

    // 倒數計時
    const elapsed = (timestamp - this._startTime) / 1000;
    this._timeLeft = Math.max(0, GAME_DURATION - elapsed);

    // 時間警告音效（剩 10 秒時每秒觸發一次）
    if (this._timeLeft <= 10 && this._timeLeft > 0) {
      const sec = Math.ceil(this._timeLeft);
      if (!this._timeWarningFired || this._lastWarnSec !== sec) {
        this._lastWarnSec = sec;
        if (this._audio) this._audio.play("time_warning");
        this._timeWarningFired = true;
      }
    }

    // BGM 難度加速（依據分數）
    if (this._audio) {
      const newStage = this._score >= 150 ? 3 : this._score >= 100 ? 2 : this._score >= 50 ? 1 : 0;
      if (newStage !== this._bgmAccelStage) {
        this._bgmAccelStage = newStage;
        const rates = [1.0, 1.1, 1.15, 1.23];
        this._audio.setBGMPlaybackRate(rates[newStage]);
      }
    }

    if (this._timeLeft <= 0) {
      this._gameOver = true;
      this._resultStartTime = timestamp;
      this._displayScore = 0;
      // 清除所有殘留冰塊（觸發爆裂動畫）
      for (const block of this._blocks) {
        this._spawnHitParticles(block);
        this._starBursts.push({ x: block.x, y: block.y, startTime: timestamp, elapsed: 0 });
      }
      this._blocks = [];
      // 時間到音效 + 切換結算 BGM
      if (this._audio) {
        this._audio.play("time_up");
        this._audio.stopBGM(0);
        this._audio.playBGM("results", false);
      }
      // 生成結算紙片
      this._resultConfetti = [];
      const colors = [C.danger, C.accent, C.success, "#5B6DFF", C.brand];
      for (let i = 0; i < 60; i++) {
        this._resultConfetti.push({
          x: Math.random() * this._w,
          y: -20 - Math.random() * this._h,
          size: 6 + Math.random() * 4,
          speed: 1 + Math.random() * 2,
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: 0.02 + Math.random() * 0.03,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: 0.02 + Math.random() * 0.05,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
      return;
    }

    // 難度
    const diff = this._getDifficulty(elapsed);

    // 生成冰塊
    if (this._mode === "dual") {
      // 玩家 1 冰塊（左半邊）
      const leftCount = this._blocks.filter(b => b.x < this._w / 2).length;
      if (timestamp - this._lastSpawn >= diff.spawnInterval && leftCount < diff.maxBlocks) {
        this._spawnBlock(diff, "left");
        this._lastSpawn = timestamp;
        if (this._audio) this._audio.play("ice_appear");
      }
      // 玩家 2 冰塊（右半邊）
      const rightCount = this._blocks.filter(b => b.x >= this._w / 2).length;
      if (timestamp - this._lastSpawnP2 >= diff.spawnInterval && rightCount < diff.maxBlocks) {
        this._spawnBlock(diff, "right");
        this._lastSpawnP2 = timestamp;
      }
    } else {
      if (timestamp - this._lastSpawn >= diff.spawnInterval &&
          this._blocks.length < diff.maxBlocks) {
        this._spawnBlock(diff);
        this._lastSpawn = timestamp;
        if (this._audio) this._audio.play("ice_appear");
      }
    }

    // 更新冰塊
    for (let i = this._blocks.length - 1; i >= 0; i--) {
      const b = this._blocks[i];
      b.y += diff.fallSpeed * b.speedMult;
      if (b.y > this._h + b.size) {
        // 漏掉的冰塊（非炸彈），中斷連擊
        if (b.type !== "bomb") {
          this._combo = 0;
          if (this._audio) this._audio.play("miss");
        }
        this._blocks.splice(i, 1);
      }
    }

    // ── 玩家 ID 穩定追蹤（雙人模式防閃爍）──
    this._wristState = { left: null, right: null };

    if (this._mode === "dual" && allLandmarks.length >= 2) {
      // 計算每組 landmarks 的肩膀中心 x
      const getShoulderX = (lm) => {
        const ls = lm[11], rs = lm[12];
        if (ls && rs && ls.visibility > 0.1 && rs.visibility > 0.1) {
          return (ls.x + rs.x) / 2;
        }
        return null;
      };
      const sx0 = getShoulderX(allLandmarks[0]);
      const sx1 = getShoulderX(allLandmarks[1]);

      let p1Lm = allLandmarks[0];
      let p2Lm = allLandmarks[1];

      // 4-distance 比較：同時考慮兩位玩家的上一幀位置
      if (this._prevP1ShoulderX !== null && this._prevP2ShoulderX !== null &&
          sx0 !== null && sx1 !== null) {
        const d00 = Math.abs(sx0 - this._prevP1ShoulderX); // 新[0] vs 舊P1
        const d01 = Math.abs(sx0 - this._prevP2ShoulderX); // 新[0] vs 舊P2
        const d10 = Math.abs(sx1 - this._prevP1ShoulderX); // 新[1] vs 舊P1
        const d11 = Math.abs(sx1 - this._prevP2ShoulderX); // 新[1] vs 舊P2
        // 如果 新[0]→舊P2 + 新[1]→舊P1 更近，就交換
        if (d01 + d10 < d00 + d11) {
          p1Lm = allLandmarks[1];
          p2Lm = allLandmarks[0];
        }
      } else if (this._prevP1ShoulderX === null && sx0 !== null && sx1 !== null) {
        // 首幀初始分配：畫面左邊（較小的 sx）為 P1，避免第一幀 MediaPipe 順序不定造成整輪錯位
        if (sx1 < sx0) { p1Lm = allLandmarks[1]; p2Lm = allLandmarks[0]; }
      }
      // 用 swap 後的結果更新上一幀位置
      this._prevP1ShoulderX = getShoulderX(p1Lm) ?? this._prevP1ShoulderX;
      this._prevP2ShoulderX = getShoulderX(p2Lm) ?? this._prevP2ShoulderX;

      this._landmarks = p1Lm;
      this._player2Landmarks = p2Lm;
      this._cachedP1Landmarks = p1Lm;
      this._cachedP2Landmarks = p2Lm;
      this._p1StaleFrames = 0;
      this._p2StaleFrames = 0;
    } else if (this._mode === "dual") {
      // 不足 2 人：用暫存（最多 10 幀）
      if (allLandmarks.length >= 1) {
        this._landmarks = allLandmarks[0];
        this._cachedP1Landmarks = allLandmarks[0];
        this._p1StaleFrames = 0;
      } else {
        this._p1StaleFrames++;
        this._landmarks = this._p1StaleFrames <= 20 ? this._cachedP1Landmarks : null;
      }
      this._p2StaleFrames++;
      this._player2Landmarks = this._p2StaleFrames <= 20 ? this._cachedP2Landmarks : null;
      this._p2WristState = { left: null, right: null };
    } else {
      // 單人模式
      this._landmarks = allLandmarks.length > 0 ? allLandmarks[0] : null;
    }

    // 碰撞偵測 — 玩家 1
    if (this._landmarks) {
      this._checkWristHit(this._landmarks, WRIST_LEFT, "left", timestamp, 1);
      this._checkWristHit(this._landmarks, WRIST_RIGHT, "right", timestamp, 1);
    }

    // 碰撞偵測 — 玩家 2（雙人模式）
    if (this._mode === "dual") {
      if (!this._p2WristState) this._p2WristState = { left: null, right: null };
      if (this._player2Landmarks) {
        this._checkWristHit(this._player2Landmarks, WRIST_LEFT, "left", timestamp, 2);
        this._checkWristHit(this._player2Landmarks, WRIST_RIGHT, "right", timestamp, 2);
      }
    }
  },

  // ── 每幀繪製 ──
  render(ctx) {
    const w = this._w;
    const h = this._h;
    const now = this._now;

    // 畫面震動（炸彈爆炸）
    if (this._screenShake) {
      const shakeT = (now - this._screenShake.startTime);
      if (shakeT < 200) {
        const offsetX = (Math.random() - 0.5) * 12;
        const offsetY = (Math.random() - 0.5) * 12;
        ctx.save();
        ctx.translate(offsetX, offsetY);
      }
    }

    // 極輕微品牌色調遮罩（幾乎無感）
    ctx.fillStyle = "rgba(201, 79, 200, 0.06)";
    ctx.fillRect(0, 0, w, h);

    // 背景雪花
    for (const s of this._snowflakes) {
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 雪帽 AR 疊加（遊戲進行中）
    if (!this._gameOver) {
      this._renderHat(ctx, this._landmarks, hatImg, w, h, 1);
      if (this._mode === "dual") {
        this._renderHat(ctx, this._player2Landmarks, hatOrangeImg, w, h, 2);
      }
    }

    // 冰塊
    for (const block of this._blocks) {
      this._renderBlock(ctx, block, now);
    }

    // 碎片粒子
    for (const p of this._particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      const sz = p.size;
      ctx.moveTo(0, -sz);
      ctx.lineTo(sz * 0.866, sz * 0.5);
      ctx.lineTo(-sz * 0.866, sz * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // 星芒
    for (const s of this._starBursts) {
      const t = s.elapsed / 0.3;            // 0→1
      const scale = t < 0.3 ? t / 0.3 : 1; // 快速展開
      const alpha = 1 - t;                  // 漸隱
      drawStarBurst(ctx, s.x, s.y, 80 * scale, 30 * scale, alpha * 0.8);
    }

    // 白色閃光
    for (const f of this._hitFlashes) {
      const t = f.elapsed / 0.12;
      const radius = 80 * t;
      const alpha = 0.9 * (1 - t);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 衝擊波（炸彈用）
    for (const s of this._shockwaves) {
      const t = s.elapsed / 0.2;
      const radius = 120 * t;
      const alpha = 0.8 * (1 - t);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#FF4757";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 星星粒子
    for (const p of this._starParticles) {
      const alpha = 1 - (p.elapsed / 0.54);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
      ctx.font = `${p.size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⭐", p.x, p.y);
      ctx.restore();
    }

    // 浮動加分文字（放大，彈跳效果）
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const ft of this._floatingTexts) {
      const t = ft.elapsed / 0.8;
      const alpha = 1 - t;
      const offsetY = -80 * t;
      const scale = t < 0.2 ? 1 + 0.5 * (t / 0.2) : 1.5 - 0.5 * ((t - 0.2) / 0.6);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ft.x, ft.y + offsetY);
      ctx.scale(scale, scale);
      ctx.font = "bold 56px 'Arial Black', sans-serif";
      outlinedText(ctx, ft.text, 0, 0, ft.color, C.dark, 4);
      ctx.restore();
    }

    // 鋼鐵手套（玩家 1）
    this._renderGauntlet(ctx, this._wristState.left, "left", this._landmarks, gauntletImg, this._hitScaleLeft, 1);
    this._renderGauntlet(ctx, this._wristState.right, "right", this._landmarks, gauntletImg, this._hitScaleRight, 1);
    // 鋼鐵手套（玩家 2，雙人模式）
    if (this._mode === "dual") {
      this._renderGauntlet(ctx, this._p2WristState.left, "left", this._player2Landmarks, gauntletOrangeImg, this._p2HitScaleLeft, 2);
      this._renderGauntlet(ctx, this._p2WristState.right, "right", this._player2Landmarks, gauntletOrangeImg, this._p2HitScaleRight, 2);
    }

    // 畫面邊緣金色閃光（combo ≥ 10）
    if (this._screenFlash) {
      const ft = (now - this._screenFlash.startTime) / 500;
      if (ft < 1) {
        const alpha = (1 - ft) * 0.4;
        const grad = ctx.createLinearGradient(0, 0, 40, 0);
        grad.addColorStop(0, `rgba(255, 215, 0, ${alpha})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 40, h);
        const grad2 = ctx.createLinearGradient(w, 0, w - 40, 0);
        grad2.addColorStop(0, `rgba(255, 215, 0, ${alpha})`);
        grad2.addColorStop(1, "transparent");
        ctx.fillStyle = grad2;
        ctx.fillRect(w - 40, 0, 40, h);
      } else {
        this._screenFlash = null;
      }
    }

    // ── 雙人分隔線 ──
    if (this._mode === "dual" && !this._gameOver) {
      const midX = w / 2;
      ctx.save();
      ctx.shadowColor = "#C94FC8";
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, h);
      ctx.stroke();
      ctx.restore();
      // VS 標誌
      ctx.save();
      ctx.fillStyle = C.dark;
      ctx.beginPath();
      ctx.arc(midX, h / 2, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 56px 'Arial Black', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      outlinedText(ctx, "VS", midX, h / 2, C.accent, C.dark, 4);
      ctx.restore();
    }

    // ── HUD ──
    if (!this._gameOver) {
      if (this._mode === "dual") {
        this._renderDualHUD(ctx, now);
      } else {
        this._renderHUD(ctx, now);
      }
      this._renderBorders(ctx, now);
    } else {
      this._renderResult(ctx, now);
    }

    // 結束畫面震動位移
    if (this._screenShake) {
      const shakeT = (now - this._screenShake.startTime);
      if (shakeT < 200) {
        ctx.restore();
      }
    }
  },

  getScore() { return this._score; },
  isGameOver() { return this._gameOver; },
  destroy() { this._blocks = []; this._particles = []; },

  /** 點擊處理 */
  handleClick(x, y) {
    // 結算畫面
    if (this._gameOver) {
      for (const btn of this._resultButtons) {
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          return btn.action;
        }
      }
      return null;
    }
    // 確認對話框
    if (this._quitConfirmOpen) {
      if (this._quitYes && x >= this._quitYes.x && x <= this._quitYes.x + this._quitYes.w &&
          y >= this._quitYes.y && y <= this._quitYes.y + this._quitYes.h) {
        this._quitConfirmOpen = false;
        this._gameOver = true;
        this._resultStartTime = this._now;
        this._displayScore = 0;
        this._encourageText = ENCOURAGE_TEXTS[Math.floor(Math.random() * ENCOURAGE_TEXTS.length)];
        for (const block of this._blocks) { this._spawnHitParticles(block); }
        this._blocks = [];
        if (this._audio) { this._audio.stopBGM(0); this._audio.play("time_up"); }
        this._resultConfetti = [];
        const colors = [C.danger, C.accent, C.success, "#5B6DFF", C.brand];
        for (let i = 0; i < 60; i++) {
          this._resultConfetti.push({ x: Math.random() * this._w, y: -20 - Math.random() * this._h,
            size: 6 + Math.random() * 4, speed: 1 + Math.random() * 2,
            phase: Math.random() * Math.PI * 2, phaseSpeed: 0.02 + Math.random() * 0.03,
            rotation: Math.random() * Math.PI * 2, rotSpeed: 0.02 + Math.random() * 0.05,
            color: colors[Math.floor(Math.random() * colors.length)] });
        }
        return null;
      }
      if (this._quitNo && x >= this._quitNo.x && x <= this._quitNo.x + this._quitNo.w &&
          y >= this._quitNo.y && y <= this._quitNo.y + this._quitNo.h) {
        this._quitConfirmOpen = false;
        return null;
      }
      return null;
    }
    // 提前結束按鈕
    if (this._quitBtnArea && x >= this._quitBtnArea.x && x <= this._quitBtnArea.x + this._quitBtnArea.w &&
        y >= this._quitBtnArea.y && y <= this._quitBtnArea.y + this._quitBtnArea.h) {
      this._quitConfirmOpen = true;
      return null;
    }
    return null;
  },

  // ══════════════════════════════════════════
  // ── 內部方法 ──
  // ══════════════════════════════════════════

  _getDifficulty(elapsed) {
    let cur = DIFFICULTY[0];
    for (const d of DIFFICULTY) { if (elapsed >= d.time) cur = d; }
    return cur;
  },

  _spawnBlock(diff, side = null) {
    const bt = pickBlockType();
    const w = this._w;
    let minX, maxX;
    if (this._mode === "dual") {
      if (side === "left") {
        minX = w * 0.05 + bt.size / 2;
        maxX = w * 0.45 - bt.size / 2;
      } else {
        minX = w * 0.55 + bt.size / 2;
        maxX = w * 0.95 - bt.size / 2;
      }
    } else {
      minX = w * 0.15 + bt.size / 2;
      maxX = w * 0.85 - bt.size / 2;
    }
    this._blocks.push({
      x: minX + Math.random() * (Math.max(0, maxX - minX)),
      y: -bt.size,
      type: bt.type,
      size: bt.size,
      score: bt.score,
      speedMult: bt.speedMult,
      hitsLeft: bt.hits,
    });
  },

  _checkWristHit(landmarks, wristIndex, side, timestamp, player = 1) {
    const wrist = landmarks[wristIndex];
    if (!wrist || wrist.visibility < 0.5) return;

    const wx = (1 - wrist.x) * this._w;
    const wy = wrist.y * this._h;

    // 揮動速度
    const prevWrists = player === 1 ? this._prevWrists : this._p2PrevWrists;
    const prev = prevWrists[side];
    let speed = 0;
    if (prev) {
      speed = Math.sqrt((wrist.x - prev.x) ** 2 + (wrist.y - prev.y) ** 2);
    }
    prevWrists[side] = { x: wrist.x, y: wrist.y };
    // 更新手腕狀態
    if (player === 1) {
      this._wristState[side] = { px: wx, py: wy, speed };
    } else {
      this._p2WristState[side] = { px: wx, py: wy, speed };
    }

    if (speed < MIN_SWIPE_SPEED) return;

    // 雙人模式：只能打自己半邊的冰塊
    const midX = this._w / 2;

    // 碰撞偵測
    for (let i = this._blocks.length - 1; i >= 0; i--) {
      const block = this._blocks[i];

      // 雙人模式歸屬判定
      if (this._mode === "dual") {
        if (player === 1 && block.x >= midX) continue;
        if (player === 2 && block.x < midX) continue;
      }

      const dx = wx - block.x;
      const dy = wy - block.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = block.size / 2 + HIT_RADIUS_EXTRA;

      if (dist < hitRadius) {
        block.hitsLeft--;
        if (block.hitsLeft <= 0) {
          // 冰塊碎裂
          this._blocks.splice(i, 1);
          if (player === 1) {
            this._score = Math.max(0, this._score + block.score);
            this._scoreBounce = timestamp;
          } else {
            this._player2Score = Math.max(0, this._player2Score + block.score);
            this._p2ScoreBounce = timestamp;
          }

          // 音效：依冰塊類型播放不同擊碎音
          if (this._audio) {
            if (block.type === "bomb") {
              this._audio.play("bomb_hit");
            } else {
              this._audio.play("ice_hit");
              this._audio.play("score");
            }
          }

          // 連擊（各玩家各自計算）
          const comboRef = player === 1 ? this : { _combo: this._player2Combo, _lastHitTime: this._p2LastHitTime };
          if (block.type !== "bomb") {
            if (player === 1) {
              this._combo++;
              this._lastHitTime = timestamp;
            } else {
              this._player2Combo++;
              this._p2LastHitTime = timestamp;
            }
            const combo = player === 1 ? this._combo : this._player2Combo;
            if (combo >= 5 && combo % 5 === 0) {
              this._comboPopup = { startTime: timestamp, combo };
            }
            if (combo >= 10 && combo % 10 === 0) {
              this._screenFlash = { startTime: timestamp };
            }
            if (this._audio) {
              if (combo === 10 || (combo > 10 && combo % 10 === 0)) this._audio.play("combo_10");
              else if (combo === 5 || (combo > 5 && combo % 5 === 0)) this._audio.play("combo_5");
              else if (combo === 3) this._audio.play("combo_3");
            }
          } else {
            if (player === 1) this._combo = 0;
            else this._player2Combo = 0;
          }

          // 手套放大動畫
          if (player === 1) {
            if (side === "left") this._hitScaleLeft = timestamp;
            else this._hitScaleRight = timestamp;
          } else {
            if (side === "left") this._p2HitScaleLeft = timestamp;
            else this._p2HitScaleRight = timestamp;
          }

          // 碎片粒子
          this._spawnHitParticles(block);
          this._starBursts.push({ x: block.x, y: block.y, startTime: timestamp, elapsed: 0 });

          // 浮動加分文字
          const scoreText = block.score >= 0 ? `+${block.score}` : `${block.score}`;
          const textColor = block.type === "gold" ? C.accent :
                            block.type === "bomb" ? C.danger : C.light;
          this._floatingTexts.push({
            x: block.x, y: block.y, text: scoreText, color: textColor,
            startTime: timestamp, elapsed: 0,
          });
        }
        break;
      }
    }
  },

  _spawnHitParticles(block) {
    const timestamp = this._now;

    // 白色閃光（所有冰塊）
    this._hitFlashes.push({
      x: block.x, y: block.y, startTime: timestamp, elapsed: 0,
    });

    // 普通冰塊：冰晶碎片 + 星星粒子
    if (block.type !== "bomb") {
      const colors = block.type === "gold"
        ? ["#FFD700", "#FFA500", "#FFE066"]
        : ["#87CEEB", "#FFFFFF", "#B3E5FC"];
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.5;
        const v = 4 + Math.random() * 6;
        this._particles.push({
          x: block.x, y: block.y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v - 3,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.5,
          size: 10 + Math.random() * 8,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 0.65, maxLife: 0.65,
        });
      }
      // 星星粒子向上飄散（兒童化加分）
      const starCount = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < starCount; i++) {
        this._starParticles.push({
          x: block.x + (Math.random() - 0.5) * 40,
          y: block.y,
          speed: 1.5 + Math.random() * 2,
          size: 12 + Math.random() * 8,
          color: block.type === "gold" ? "#FFD700" : "#F5A623",
          startTime: timestamp, elapsed: 0,
        });
      }
      // 金色冰塊額外：20 個金色星星爆炸
      if (block.type === "gold") {
        for (let i = 0; i < 20; i++) {
          const angle = (Math.PI * 2 * i) / 20;
          const v = 3 + Math.random() * 5;
          this._particles.push({
            x: block.x, y: block.y,
            vx: Math.cos(angle) * v,
            vy: Math.sin(angle) * v - 2,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.3,
            size: 8 + Math.random() * 6,
            color: "#FFD700",
            life: 0.6, maxLife: 0.6,
          });
        }
      }
    }

    // 炸彈冰塊：爆炸碎片 + 衝擊波 + 畫面震動
    if (block.type === "bomb") {
      const bombColors = ["#FF4757", "#F5A623", "#FDFEFE"];
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.3;
        const v = 6 + Math.random() * 8;
        this._particles.push({
          x: block.x, y: block.y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v - 3,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.5,
          size: 12 + Math.random() * 12,
          color: bombColors[Math.floor(Math.random() * bombColors.length)],
          life: 0.55, maxLife: 0.55,
        });
      }
      this._shockwaves.push({
        x: block.x, y: block.y, startTime: timestamp, elapsed: 0,
      });
      this._screenShake = { startTime: timestamp };
    }
  },

  // ── 繪製子函式 ──

  /** 繪製單個冰塊（優先使用圖片，備用 Canvas 繪製） */
  _renderBlock(ctx, block, now) {
    const { x, y, size, type, hitsLeft } = block;
    const half = size / 2;
    const img = BLOCK_IMAGES[type];

    ctx.save();
    shadowOn(ctx);

    // 優先使用圖片繪製
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x - half, y - half, size, size);
      shadowOff(ctx);
    } else {
      // === 備用：Canvas 繪製 ===
      if (type === "bomb") {
        ctx.shadowColor = "#FF4757";
        ctx.shadowBlur = 16;
        const grad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, half);
        grad.addColorStop(0, C.danger);
        grad.addColorStop(1, C.dark);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, half, 0, Math.PI * 2);
        ctx.fill();
        shadowOff(ctx);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, half, 0, Math.PI * 2);
        ctx.stroke();
      } else if (type === "gold") {
        const shimmer = 0.7 + Math.sin(now * 0.006) * 0.3;
        ctx.globalAlpha = shimmer;
        const grad = ctx.createLinearGradient(x - half, y - half, x + half, y + half);
        grad.addColorStop(0, "#FFD700");
        grad.addColorStop(1, "#FFA500");
        ctx.fillStyle = grad;
        rrect(ctx, x - half, y - half, size, size, 15);
        ctx.fill();
        shadowOff(ctx);
        ctx.globalAlpha = 1;
      } else {
        const lightBlue = type === "big" ? "#6BB3D9" : "#87CEEB";
        const grad = ctx.createLinearGradient(x - half, y - half, x + half, y + half);
        grad.addColorStop(0, lightBlue);
        grad.addColorStop(1, "#E0F7FA");
        ctx.fillStyle = grad;
        rrect(ctx, x - half, y - half, size, size, 15);
        ctx.fill();
        shadowOff(ctx);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }

    // 巨大冰塊顯示剩餘命中數 & 裂痕
    if (type === "big") {
      ctx.font = `bold ${size * 0.2}px 'Arial Black', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      outlinedText(ctx, `×${hitsLeft}`, x, y + half * 0.55, C.light, C.dark, 2);
      const cracks = 3 - hitsLeft;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      if (cracks >= 1) {
        ctx.beginPath();
        ctx.moveTo(x - half * 0.3, y - half * 0.4);
        ctx.lineTo(x + half * 0.1, y + half * 0.1);
        ctx.lineTo(x + half * 0.3, y + half * 0.4);
        ctx.stroke();
      }
      if (cracks >= 2) {
        ctx.beginPath();
        ctx.moveTo(x + half * 0.2, y - half * 0.3);
        ctx.lineTo(x - half * 0.15, y + half * 0.2);
        ctx.stroke();
      }
    }

    ctx.restore();
  },

  /** 繪製雪帽（動態縮放 + EMA 平滑） */
  _renderHat(ctx, landmarks, img, w, h, player = 1) {
    if (!landmarks || !img || !img.complete || img.naturalWidth === 0) return;
    const nose = landmarks[0];
    if (!nose || nose.visibility < 0.5) return;

    // 動態計算帽子尺寸
    let hatWidth;
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    if (leftEar && rightEar && leftEar.visibility > 0.1 && rightEar.visibility > 0.1) {
      hatWidth = Math.abs(leftEar.x - rightEar.x) * w * 1.6;
    } else if (leftShoulder && rightShoulder && leftShoulder.visibility > 0.1 && rightShoulder.visibility > 0.1) {
      hatWidth = Math.abs(leftShoulder.x - rightShoulder.x) * w * 0.7;
    } else {
      hatWidth = 280;
    }
    hatWidth = Math.max(hatWidth, 200);
    const hatHeight = hatWidth * 0.85;

    let hatCX = (1 - nose.x) * w;
    let hatCY = nose.y * h - hatHeight * 1.3 + hatHeight / 2;

    // EMA 平滑
    const emaKey = player === 1 ? "_emaP1Hat" : "_emaP2Hat";
    const alpha = this._emaAlpha;
    if (this[emaKey]) {
      hatCX = this[emaKey].x * (1 - alpha) + hatCX * alpha;
      hatCY = this[emaKey].y * (1 - alpha) + hatCY * alpha;
      hatWidth = this[emaKey].w * (1 - alpha) + hatWidth * alpha;
    }
    this[emaKey] = { x: hatCX, y: hatCY, w: hatWidth };
    const smoothH = hatWidth * 0.85;

    ctx.save();
    ctx.translate(hatCX, hatCY);
    ctx.rotate(-8 * Math.PI / 180);
    ctx.drawImage(img, -hatWidth / 2, -smoothH / 2, hatWidth, smoothH);
    ctx.restore();
  },

  /** 繪製鋼鐵手套（動態縮放 + 旋轉 + EMA 平滑） */
  _renderGauntlet(ctx, ws, side, landmarks, img, hitTime, player = 1) {
    if (this._gameOver || !ws) return;
    const now = this._now;
    const w = this._w;
    const h = this._h;

    // ── 動態計算手套尺寸和角度 ──
    const wristIdx = side === "left" ? WRIST_LEFT : WRIST_RIGHT;
    const elbowIdx = side === "left" ? 13 : 14;
    const wristLm = landmarks ? landmarks[wristIdx] : null;
    const elbowLm = landmarks ? landmarks[elbowIdx] : null;

    let gloveSize = 180;
    let armAngle = 0;
    let centerX = ws.px;
    let centerY = ws.py;

    if (wristLm && elbowLm && wristLm.visibility > 0.1 && elbowLm.visibility > 0.1) {
      const wx = (1 - wristLm.x) * w;
      const wy = wristLm.y * h;
      const ex = (1 - elbowLm.x) * w;
      const ey = elbowLm.y * h;

      const dx = wx - ex;
      const dy = wy - ey;
      const forearmLen = Math.sqrt(dx * dx + dy * dy);

      const sizeMult = this._mode === "single" ? 1.5 : 0.9;
      gloveSize = Math.max(forearmLen * sizeMult, 160);
      armAngle = Math.atan2(dy, dx);

      centerX = wx + Math.cos(armAngle) * gloveSize * 0.2;
      centerY = wy + Math.sin(armAngle) * gloveSize * 0.2;
    }

    // ── EMA 平滑（防閃爍）──
    const emaStore = player === 1 ? this._emaP1Wrists : this._emaP2Wrists;
    const emaKey = side;
    const alpha = this._emaAlpha;
    if (emaStore[emaKey]) {
      const prev = emaStore[emaKey];
      centerX = prev.x * (1 - alpha) + centerX * alpha;
      centerY = prev.y * (1 - alpha) + centerY * alpha;
      gloveSize = prev.size * (1 - alpha) + gloveSize * alpha;
      // 角度平滑（處理 -PI/PI 跨越）
      let angleDiff = armAngle - prev.angle;
      if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      armAngle = prev.angle + angleDiff * alpha;
    }
    emaStore[emaKey] = { x: centerX, y: centerY, size: gloveSize, angle: armAngle };

    // 底部光圈（僅調試模式顯示）
    if (DEBUG_MODE) {
      const outerR = 45;
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = C.success;
      ctx.beginPath();
      ctx.arc(ws.px, ws.py, outerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 鋼鐵手套
    const gImg = img && img.complete && img.naturalWidth > 0 ? img : null;

    // 擊中放大效果
    const hitElapsed = (now - hitTime) / 200;
    let gauntletScale = 1.0;
    if (hitElapsed >= 0 && hitElapsed < 1) {
      gauntletScale = 1.0 + 0.5 * (1.0 - hitElapsed);
    }

    if (gImg) {
      const finalSize = gloveSize * gauntletScale;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(armAngle);
      if (side === "right") ctx.scale(1, -1);
      ctx.drawImage(gImg, -finalSize / 2, -finalSize / 2, finalSize, finalSize);
      ctx.restore();
    }
  },

  /** HUD：分數面板 + 計時器徽章 + 連擊 */
  _renderHUD(ctx, now) {
    const w = this._w;

    // ── 分數面板（左上角）──
    ctx.save();
    shadowOn(ctx);
    ctx.fillStyle = "rgba(45,52,54,0.75)";
    rrect(ctx, 12, 10, 200, 70, 12);
    ctx.fill();
    shadowOff(ctx);
    // 品牌色邊框
    ctx.strokeStyle = "rgba(201,79,200,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 分數文字 + 彈跳動畫
    const bounceDt = (now - this._scoreBounce) / 200;
    let scoreScale = 1;
    if (bounceDt >= 0 && bounceDt < 1) {
      scoreScale = 1 + 0.3 * Math.sin(bounceDt * Math.PI);
    }
    ctx.save();
    ctx.translate(112, 48);
    ctx.scale(scoreScale, scoreScale);
    ctx.font = "bold 38px 'Arial Black', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    outlinedText(ctx, `${this._score}`, 0, 0, C.accent);
    ctx.restore();
    // "SCORE" 小標
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    outlinedText(ctx, "⭐ 分數", 112, 14, "rgba(255,255,255,0.7)", C.dark, 2);

    // ── 計時器徽章（上方中央）──
    const sec = Math.ceil(this._timeLeft);
    const lastTen = sec <= 10;
    // 計時器脈動：每秒數字切換時跳動
    const fractional = this._timeLeft - Math.floor(this._timeLeft);
    const secBounce = fractional > 0.7 ? 1 + 0.3 * ((fractional - 0.7) / 0.3) : 1;
    let timerScale = secBounce;
    if (lastTen) {
      timerScale *= 1 + 0.15 * Math.abs(Math.sin(now * 0.005));
    }
    const tcx = w / 2;
    const tcy = 50;
    ctx.save();
    ctx.translate(tcx, tcy);
    ctx.scale(timerScale, timerScale);
    shadowOn(ctx);
    ctx.fillStyle = lastTen ? C.danger : C.accent;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fill();
    shadowOff(ctx);
    // 計時器邊框
    ctx.strokeStyle = "#F5A623";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "bold 36px 'Arial Black', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    outlinedText(ctx, `${sec}`, 0, 1, C.light);
    ctx.restore();

    // ── 連擊計數器（右下角）──
    if (this._combo >= 3) {
      ctx.save();
      ctx.font = "bold 36px 'Arial Black', sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      outlinedText(ctx, `⚡ 連擊 ×${this._combo}!`, w - 16, this._h - 20, C.accent);
      ctx.restore();
    }

    // 連擊彈出大字（combo ≥ 5 觸發）
    if (this._comboPopup) {
      const ct = (now - this._comboPopup.startTime) / 1000;
      if (ct < 1) {
        let scale, alpha;
        if (ct < 0.15) {
          scale = 1 + 0.5 * (ct / 0.15);
        } else if (ct < 0.4) {
          scale = 1.5 - 0.5 * ((ct - 0.15) / 0.25);
        } else {
          scale = 1;
          alpha = 1 - (ct - 0.4) / 0.6;
        }
        alpha = alpha !== undefined ? alpha : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(w / 2, this._h * 0.4);
        ctx.scale(scale, scale);
        ctx.font = "bold 56px 'Arial Black', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        outlinedText(ctx, `COMBO ×${this._comboPopup.combo}!`, 0, 0, C.accent);
        ctx.restore();
      } else {
        this._comboPopup = null;
      }
    }

    // 提前結束按鈕（左上角）
    const qs = 48, qx = 12, qy = 90;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath(); ctx.arc(qx + qs / 2, qy + qs / 2, qs / 2, 0, Math.PI * 2); ctx.fill();
    ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("✕", qx + qs / 2, qy + qs / 2);
    ctx.restore();
    this._quitBtnArea = { x: qx, y: qy, w: qs, h: qs };

    // 確認對話框
    if (this._quitConfirmOpen) {
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, w, this._h);
      const boxW = Math.min(300, w * 0.8), boxH = 180;
      const boxX = (w - boxW) / 2, boxY = (this._h - boxH) / 2;
      ctx.fillStyle = "rgba(45,52,54,0.95)";
      rrect(ctx, boxX, boxY, boxW, boxH, 20); ctx.fill();
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = "bold 24px 'Arial Black', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      outlinedText(ctx, "確定要結束嗎？", w / 2, boxY + 50, C.light, C.dark, 3);
      const btnW2 = 100, btnH2 = 44, btnY2 = boxY + boxH - 65;
      ctx.fillStyle = C.danger;
      rrect(ctx, w / 2 - btnW2 - 10, btnY2, btnW2, btnH2, 12); ctx.fill();
      ctx.font = "bold 20px sans-serif";
      outlinedText(ctx, "結束", w / 2 - btnW2 / 2 - 10, btnY2 + btnH2 / 2, C.light, C.dark, 2);
      this._quitYes = { x: w / 2 - btnW2 - 10, y: btnY2, w: btnW2, h: btnH2 };
      ctx.fillStyle = C.success;
      rrect(ctx, w / 2 + 10, btnY2, btnW2, btnH2, 12); ctx.fill();
      outlinedText(ctx, "繼續", w / 2 + 10 + btnW2 / 2, btnY2 + btnH2 / 2, C.light, C.dark, 2);
      this._quitNo = { x: w / 2 + 10, y: btnY2, w: btnW2, h: btnH2 };
    }
  },

  /** 邊框裝飾系統 */
  /** 雙人模式 HUD */
  _renderDualHUD(ctx, now) {
    const w = this._w;
    const sec = Math.ceil(this._timeLeft);

    // 玩家 1 分數（左上角，藍色）
    ctx.save();
    shadowOn(ctx);
    ctx.fillStyle = "rgba(45,52,54,0.75)";
    rrect(ctx, 12, 10, 160, 60, 12);
    ctx.fill();
    shadowOff(ctx);
    ctx.strokeStyle = "rgba(79,195,247,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.font = "bold 34px 'Arial Black', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    outlinedText(ctx, `⭐ ${this._score}`, 92, 42, "#4FC3F7", C.dark, 3);

    // 玩家 2 分數（右上角，橘色）
    ctx.save();
    shadowOn(ctx);
    ctx.fillStyle = "rgba(45,52,54,0.75)";
    rrect(ctx, w - 172, 10, 160, 60, 12);
    ctx.fill();
    shadowOff(ctx);
    ctx.strokeStyle = "rgba(245,166,35,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.font = "bold 34px 'Arial Black', sans-serif";
    ctx.textAlign = "center";
    outlinedText(ctx, `⭐ ${this._player2Score}`, w - 92, 42, "#F5A623", C.dark, 3);

    // 共用倒數計時（頂部中央）
    const lastTen = sec <= 10;
    let timerScale = 1;
    if (lastTen) timerScale = 1 + 0.15 * Math.abs(Math.sin(now * 0.005));
    ctx.save();
    ctx.translate(w / 2, 42);
    ctx.scale(timerScale, timerScale);
    shadowOn(ctx);
    ctx.fillStyle = lastTen ? C.danger : C.accent;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    shadowOff(ctx);
    ctx.font = "bold 28px 'Arial Black', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    outlinedText(ctx, `${sec}`, 0, 1, C.light);
    ctx.restore();
  },

  _renderBorders(ctx, now) {
    const w = this._w;
    const h = this._h;

    // 頂部漸層裝飾條（8px）
    const topGrad = ctx.createLinearGradient(0, 0, w, 0);
    topGrad.addColorStop(0, "#C94FC8");
    topGrad.addColorStop(0.5, "#F5A623");
    topGrad.addColorStop(1, "#1ABC9C");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 8);

    // 底部裝飾條（8px）
    ctx.fillStyle = "#F5A623";
    ctx.fillRect(0, h - 8, w, 8);

    // 四角 L 形裝飾（青綠色）
    const cornerSize = 40;
    const lineW = 4;
    ctx.strokeStyle = "#1ABC9C";
    ctx.lineWidth = lineW;
    ctx.lineCap = "round";

    // 左上角
    ctx.beginPath();
    ctx.moveTo(lineW, cornerSize); ctx.lineTo(lineW, lineW); ctx.lineTo(cornerSize, lineW);
    ctx.stroke();
    // 右上角
    ctx.beginPath();
    ctx.moveTo(w - cornerSize, lineW); ctx.lineTo(w - lineW, lineW); ctx.lineTo(w - lineW, cornerSize);
    ctx.stroke();
    // 左下角
    ctx.beginPath();
    ctx.moveTo(lineW, h - cornerSize); ctx.lineTo(lineW, h - lineW); ctx.lineTo(cornerSize, h - lineW);
    ctx.stroke();
    // 右下角
    ctx.beginPath();
    ctx.moveTo(w - cornerSize, h - lineW); ctx.lineTo(w - lineW, h - lineW); ctx.lineTo(w - lineW, h - cornerSize);
    ctx.stroke();

    // 時間警告紅色邊框（剩 10 秒時閃爍）
    if (this._timeLeft <= 10 && this._timeLeft > 0) {
      const flash = Math.abs(Math.sin(now * 0.006));
      ctx.strokeStyle = `rgba(255, 71, 87, ${flash})`;
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, w, h);
    }
  },

  /** 結算畫面（幼兒適配版） */
  _renderResult(ctx, now) {
    const w = this._w;
    const h = this._h;
    const t = (now - this._resultStartTime) / 1000;

    // 遮罩
    ctx.fillStyle = "rgba(45,52,54,0.6)";
    ctx.fillRect(0, 0, w, h);

    // ── 雙人結算 ──
    if (this._mode === "dual") {
      this._renderDualResult(ctx, now, t, w, h);
      return;
    }

    // 紙片粒子
    for (const c of this._resultConfetti) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
      ctx.restore();
    }

    const cx = w / 2;

    // 標題「時間到！」— 從上方滑入
    const titleY = t < 0.5 ? -50 + (h * 0.18 + 50) * (t / 0.5) : h * 0.18;
    ctx.font = "bold 64px 'Arial Black', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    outlinedText(ctx, "時間到！", cx, titleY, C.light);

    // 分數計數動畫（0.5s ~ 2.5s）
    if (t > 0.5) {
      const countT = Math.min(1, (t - 0.5) / 2);
      const ease = 1 - Math.pow(1 - countT, 4);
      this._displayScore = Math.round(this._score * ease);

      // 分數滾動音效
      if (this._audio && countT < 1 && now - this._lastScoreRollTime > 80) {
        this._audio.play("score_roll");
        this._lastScoreRollTime = now;
      }

      ctx.font = "bold 24px sans-serif";
      outlinedText(ctx, "🎉 你得了", cx, h * 0.35 - 55, "rgba(255,255,255,0.8)", C.dark, 2);
      ctx.font = "bold 80px 'Arial Black', sans-serif";
      outlinedText(ctx, `${this._displayScore} 分！`, cx, h * 0.35, C.accent);
    }

    // 星級評價（2.5s 後逐顆彈跳出現，100px emoji 星星）
    if (t > 2.5) {
      const starCount = this._score >= 200 ? 3 : this._score >= 100 ? 2 : 1;
      const starSize = 100;
      const starSpacing = 120;
      const starY = h * 0.52;
      const startX = cx - ((starCount - 1) / 2) * starSpacing;

      for (let i = 0; i < starCount; i++) {
        const starDelay = i * 0.4;
        const starT = t - 2.5 - starDelay;
        if (starT <= 0) continue;

        // 音效
        if (this._audio && i >= this._starsRevealed && starT > 0) {
          this._starsRevealed = i + 1;
          this._audio.play("star_appear");
        }

        // 彈跳：0→1.5→1.0
        let starScale;
        if (starT < 0.25) {
          starScale = (starT / 0.25) * 1.5;
        } else if (starT < 0.5) {
          starScale = 1.5 - 0.5 * ((starT - 0.25) / 0.25);
        } else {
          starScale = 1;
        }

        ctx.save();
        ctx.translate(startX + i * starSpacing, starY);
        ctx.scale(starScale, starScale);
        ctx.font = `${starSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⭐", 0, 0);
        ctx.restore();
      }

      // 鼓勵文字（星星全部出現後 0.5s，所有結果都正面）
      const encourageDelay = 2.5 + starCount * 0.4 + 0.5;
      if (t > encourageDelay) {
        ctx.font = "bold 52px 'Arial Black', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        outlinedText(ctx, this._encourageText, cx, h * 0.65, C.accent);
      }
    }

    // 紙片慶祝音效
    if (t > 3.3 && !this._confettiFired && this._audio) {
      this._audio.play("confetti");
      this._confettiFired = true;
    }

    // 按鈕（3.5s 後出現，幼兒化：放大 + 圖示）
    this._resultButtons = [];
    if (t > 3.5) {
      const btnW = Math.min(280, w * 0.65);
      const btnH = 88;
      const btnGap = 20;
      const btnY = h * 0.75;
      const replayX = cx - btnW - btnGap / 2;
      const menuX = cx + btnGap / 2;

      const buttons = [
        { label: "🔄 再玩一次", color: C.accent, action: "replay", x: replayX },
        { label: "🏠 回到選單", color: C.brand, action: "menu", x: menuX },
      ];

      for (const btn of buttons) {
        ctx.save();
        shadowOn(ctx);
        ctx.fillStyle = btn.color;
        rrect(ctx, btn.x, btnY, btnW, btnH, 20);
        ctx.fill();
        shadowOff(ctx);
        ctx.font = "bold 44px 'Arial Black', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        outlinedText(ctx, btn.label, btn.x + btnW / 2, btnY + btnH / 2, C.light);
        ctx.restore();

        this._resultButtons.push({ x: btn.x, y: btnY, w: btnW, h: btnH, action: btn.action });
      }
    }
  },

  /** 雙人模式結算畫面 */
  _renderDualResult(ctx, now, t, w, h) {
    const cx = w / 2;

    // 紙片粒子
    for (const c of this._resultConfetti) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
      ctx.restore();
    }

    // 判定贏家
    const p1Wins = this._score > this._player2Score;
    const p2Wins = this._player2Score > this._score;
    const tie = this._score === this._player2Score;

    // 標題（0.5s 後出現）
    if (t > 0.5) {
      ctx.font = "bold 56px 'Arial Black', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (tie) {
        outlinedText(ctx, "🤝 平手！", cx, h * 0.18, "#1ABC9C", C.dark, 5);
      } else if (p1Wins) {
        outlinedText(ctx, "👑 玩家 1 贏了！", cx, h * 0.18, "#4FC3F7", C.dark, 5);
      } else {
        outlinedText(ctx, "👑 玩家 2 贏了！", cx, h * 0.18, "#F5A623", C.dark, 5);
      }
    }

    // 分數對比（1s 後出現）
    if (t > 1) {
      // 玩家 1
      const p1Scale = p1Wins ? 1.3 : 1.0;
      ctx.save();
      ctx.globalAlpha = p1Wins || tie ? 1.0 : 0.6;
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      outlinedText(ctx, "玩家 1", w * 0.3, h * 0.33, "#4FC3F7", C.dark, 3);
      ctx.font = `bold ${Math.round(56 * p1Scale)}px 'Arial Black', sans-serif`;
      outlinedText(ctx, `${this._score}`, w * 0.3, h * 0.42, "#4FC3F7", C.dark, 4);
      ctx.restore();

      // VS
      ctx.font = "bold 40px 'Arial Black', sans-serif";
      ctx.textAlign = "center";
      outlinedText(ctx, "VS", cx, h * 0.38, C.accent, C.dark, 3);

      // 玩家 2
      const p2Scale = p2Wins ? 1.3 : 1.0;
      ctx.save();
      ctx.globalAlpha = p2Wins || tie ? 1.0 : 0.6;
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      outlinedText(ctx, "玩家 2", w * 0.7, h * 0.33, "#F5A623", C.dark, 3);
      ctx.font = `bold ${Math.round(56 * p2Scale)}px 'Arial Black', sans-serif`;
      outlinedText(ctx, `${this._player2Score}`, w * 0.7, h * 0.42, "#F5A623", C.dark, 4);
      ctx.restore();
    }

    // 鼓勵文字（2s 後）
    if (t > 2) {
      ctx.font = "bold 52px 'Arial Black', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      outlinedText(ctx, this._encourageText, cx, h * 0.55, C.accent);
    }

    // 按鈕（3s 後出現）
    this._resultButtons = [];
    if (t > 3) {
      const btnW = Math.min(280, w * 0.65);
      const btnH = 88;
      const btnGap = 20;
      const btnY = h * 0.68;
      const replayX = cx - btnW - btnGap / 2;
      const menuX = cx + btnGap / 2;

      const buttons = [
        { label: "🔄 再玩一次", color: C.accent, action: "replay", x: replayX },
        { label: "🏠 回到選單", color: C.brand, action: "menu", x: menuX },
      ];

      for (const btn of buttons) {
        ctx.save();
        shadowOn(ctx);
        ctx.fillStyle = btn.color;
        rrect(ctx, btn.x, btnY, btnW, btnH, 20);
        ctx.fill();
        shadowOff(ctx);
        ctx.font = "bold 44px 'Arial Black', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        outlinedText(ctx, btn.label, btn.x + btnW / 2, btnY + btnH / 2, C.light);
        ctx.restore();
        this._resultButtons.push({ x: btn.x, y: btnY, w: btnW, h: btnH, action: btn.action });
      }
    }
  },
};
