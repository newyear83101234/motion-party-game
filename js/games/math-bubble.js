/**
 * math-bubble.js — 數字氣球加法遊戲
 * 5-7 歲幼兒適配，三難度可選（初/中/高），雙人雙軸分題
 *
 * 核心循環：
 *   題目「a + b = ?」+ 語音朗讀 → N 顆數字氣球從下飄上 → 戳對加分 + 紙屑
 *   戳錯氣球輕彈、語音「再想想」（不扣分）→ 時間到顯示答案進下一題
 *
 * 雙人模式：左右半場各自題目、氣球分 P1（藍）P2（橘）光環、各算分
 */

// ── 調試開關 ──
const DEBUG_MODE = false;

// ── 配色 ──
const C = {
  bg:        "rgba(255,255,255,0.92)",
  text:      "#2D3436",
  brand:     "#C94FC8",
  accent:    "#F5A623",
  success:   "#1ABC9C",
  warning:   "#FF9F43",
  p1:        "#4DABF7",   // P1 藍光環
  p2:        "#FF922B",   // P2 橘光環
  panelBg:   "rgba(45,52,54,0.85)",
  mask:      "rgba(0,0,0,0.55)",
};

// ── 氣球四色（顏色與對錯無關，避免幼兒用顏色記答案）──
const BALLOON_COLORS = [
  { name: "red",    fill: "#FF6B6B", stroke: "#C92A2A" },
  { name: "yellow", fill: "#FFD43B", stroke: "#F08C00" },
  { name: "blue",   fill: "#74C0FC", stroke: "#1971C2" },
  { name: "green",  fill: "#69DB7C", stroke: "#2F9E44" },
];

// ── 難度設定（三階）──
const DIFFICULTY = {
  easy: {
    addRange: [1, 10], answerMax: 20,
    bubbleCount: 3, balloonSize: 180,
    timeLimit: 20,  // 每題 20 秒
    label: "初階", subLabel: "1-10 加法", color: "#1ABC9C",
  },
  medium: {
    addRange: [1, 20], answerMax: 40,
    bubbleCount: 4, balloonSize: 160,
    timeLimit: 15,
    label: "中階", subLabel: "1-20 加法", color: "#F5A623",
  },
  hard: {
    addRange: [1, 50], answerMax: 100,
    bubbleCount: 5, balloonSize: 140,
    timeLimit: 12,
    label: "高階", subLabel: "1-50 加法（含進位）", color: "#E74C3C",
  },
};

// ── 遊戲常數 ──
const WRIST_LEFT = 15;
const WRIST_RIGHT = 16;
// 戳氣球是定點動作（vs 敲冰塊的揮臂），速度門檻略低；下方計算用 aspect ratio 補正
const MIN_SWIPE_SPEED = 0.009;
const HIT_RADIUS_EXTRA = 30;       // 碰撞容許半徑
const TOTAL_QUESTIONS = 10;        // 一局最多 10 題（或 60 秒到）
const GAME_DURATION = 60;          // 60 秒一局
const SHOW_ANSWER_DURATION = 2000; // 時間到顯示答案 2 秒
const BALLOON_FLOAT_BASE = -1.3;   // 氣球往上飄速度（px/frame）— 從 -0.7 加快讓題目唸完氣球已飄到中央
const COMBO_TIMEOUT = 4000;        // 連擊中斷時間
const BUILD = (typeof window !== "undefined" && window.BUILD) || "0";

// ── 模組狀態 ──
let _ctx, _w, _h, _audio;
let _difficulty = "easy";
let _mode = "single";        // "single" | "dual"

// 狀態機：difficulty-select → countdown → playing → gameover
let _state = "difficulty-select";
let _stateStartTime = 0;

// 題目（單人 = _question；雙人 = _questionP1 + _questionP2）
let _question = null;
let _questionP1 = null;
let _questionP2 = null;
let _questionStartTime = 0;
let _questionStartTimeP2 = 0;

// 氣球與特效
let _balloons = [];
let _balloonsP2 = [];
let _confetti = [];
let _comboGlows = [];
let _floatTexts = [];   // 「+10」「Combo×3」之類飄字
let _shakeMessages = []; // 螢幕中央訊息（「答案是 X」「叫爸爸媽媽」）

// 分數
let _score = 0;
let _scoreP2 = 0;
let _combo = 0;
let _comboP2 = 0;
let _lastHitTime = 0;
let _lastHitTimeP2 = 0;
let _correctCount = 0;
let _correctCountP2 = 0;
let _consecutiveWrong = 0;
let _consecutiveWrongP2 = 0;
let _bestCombo = 0;
let _bestComboP2 = 0;

// 手腕追蹤（速度判定 + 雙人 ID 穩定）
let _prevWristP1 = { left: null, right: null };
let _prevWristP2 = { left: null, right: null };
let _prevP1ShoulderX = null;
let _prevP2ShoulderX = null;

// 計時
let _gameStartTime = 0;
let _timeLeft = GAME_DURATION;
let _showAnswerStart = 0;
let _showAnswerStartP2 = 0;
let _waitingNextQuestion = false;
let _waitingNextQuestionP2 = false;

// 倒數
let _countdownNum = 3;

// 結算按鈕
let _resultButtons = [];

// 難度選擇按鈕
let _difficultyButtons = [];

// 是否為首次教學（localStorage）
let _firstTime = true;
let _tutorialMessageShown = false;
// 結算「破紀錄」標記
let _newRecord = false;
// 最後 3 秒倒數音效標記
let _lastSecondsBeeped = new Set();

// 語音播放快取
const _voiceCache = {};
// 語音序列 token：每次新題目朗讀會 +1，舊序列遇到 token 不一致就中斷
let _voiceSeqToken = 0;
// 目前正在播放的 audio nodes（中斷時 pause）
let _currentVoiceNodes = [];


// ════════════════════════════════════════════
//   題目生成
// ════════════════════════════════════════════

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 生成題目，含「接近正確值」的錯誤答案池
 */
function generateQuestion(diffKey) {
  const d = DIFFICULTY[diffKey];
  const [min, max] = d.addRange;
  let a, b, answer;
  let safety = 50;
  do {
    a = randInt(min, max);
    b = randInt(min, max);
    answer = a + b;
    safety--;
  } while ((answer > d.answerMax || answer < min) && safety > 0);

  // 錯誤答案池：接近正確值的常見錯誤
  const errorPool = new Set();
  const candidates = [
    answer - 1, answer + 1,
    answer - 2, answer + 2,
    answer - 10, answer + 10,
    (a % 10) + (b % 10),     // 進位錯誤（個位相加忘記進位）
    Math.abs(a - b),          // 把加法做成減法
  ];
  for (const c of candidates) {
    if (c !== answer && c >= 0 && c <= 100) errorPool.add(c);
  }

  const errors = shuffle([...errorPool]).slice(0, d.bubbleCount - 1);
  const choices = shuffle([answer, ...errors]);

  return { a, b, answer, choices };
}


// ════════════════════════════════════════════
//   氣球工廠
// ════════════════════════════════════════════

function createBalloon(value, x, y, colorIdx, size, owner = "both") {
  return {
    value,
    x, y,
    color: BALLOON_COLORS[colorIdx % BALLOON_COLORS.length],
    size,
    owner,                          // "both" | "p1" | "p2"
    state: "alive",                 // "alive" | "popping" | "wrong" | "showing-answer"
    stateStart: 0,
    rotation: (Math.random() - 0.5) * 0.1,
    swayPhase: Math.random() * Math.PI * 2,
    floatSpeed: BALLOON_FLOAT_BASE + (Math.random() - 0.5) * 0.2,
    isCorrect: false,               // 設置時填
    glowOwner: null,                // 雙人模式：被誰戳中的（"p1"/"p2"），用於光環
  };
}

function spawnBalloons(question, ownerSide = "both") {
  const d = DIFFICULTY[_difficulty];
  const balloons = [];
  const margin = 90;
  let leftBound, rightBound;

  if (ownerSide === "p1")      { leftBound = margin;            rightBound = _w / 2 - margin / 2; }
  else if (ownerSide === "p2") { leftBound = _w / 2 + margin / 2; rightBound = _w - margin; }
  else                          { leftBound = margin;            rightBound = _w - margin; }

  const slotWidth = (rightBound - leftBound) / question.choices.length;

  question.choices.forEach((value, i) => {
    const x = leftBound + slotWidth * (i + 0.5) + (Math.random() * 30 - 15);
    // 氣球初始 y：靠近畫面底，題目唸完（約 4 秒）氣球已飄到畫面中段可戳區
    const y = _h + 30 + Math.random() * 80;
    const b = createBalloon(value, x, y, i, d.balloonSize, ownerSide);
    b.isCorrect = (value === question.answer);
    balloons.push(b);
  });

  return balloons;
}


// ════════════════════════════════════════════
//   語音播放（本地簡易播放器，繞過 audio-manager）
// ════════════════════════════════════════════

function playVoice(name) {
  // 用 cloneNode 允許多次重疊播放
  if (!_voiceCache[name]) {
    _voiceCache[name] = new Audio(`MUSIC/math_voice/${name}.mp3?v=${BUILD}`);
    _voiceCache[name].load();
  }
  const node = _voiceCache[name].cloneNode();
  node.volume = 0.85;
  node.play().catch(() => {}); // 忽略 autoplay 限制
}

/**
 * 依序播放多個語音（題目朗讀用）。
 * 同時間最多一個序列在跑：呼叫此函式會中斷上一個序列（避免「答案是 8 三 加 五」搶播）。
 */
async function playVoiceSeq(names, gapMs = 80) {
  // 中斷舊序列
  _voiceSeqToken++;
  const myToken = _voiceSeqToken;
  for (const node of _currentVoiceNodes) {
    try { node.pause(); } catch (_) {}
  }
  _currentVoiceNodes = [];

  for (const name of names) {
    if (myToken !== _voiceSeqToken) return; // 被新序列中斷
    await new Promise((resolve) => {
      try {
        if (!_voiceCache[name]) {
          _voiceCache[name] = new Audio(`MUSIC/math_voice/${name}.mp3?v=${BUILD}`);
        }
        const node = _voiceCache[name].cloneNode();
        node.volume = 0.85;
        _currentVoiceNodes.push(node);
        node.onended = () => setTimeout(resolve, gapMs);
        node.onerror = () => setTimeout(resolve, gapMs);
        node.play().catch(() => setTimeout(resolve, 200));
      } catch (e) {
        setTimeout(resolve, 100);
      }
    });
  }
}

/** 朗讀題目「a 加 b 等於 是多少」 */
function speakQuestion(q) {
  playVoiceSeq([`num_${q.a}`, `op_plus`, `num_${q.b}`, `op_equals`, `op_question`]);
}


// ════════════════════════════════════════════
//   Module 介面
// ════════════════════════════════════════════

const mathBubble = {
  name: "math-bubble",
  displayName: "🎈 數字氣球",

  init(ctx, opts) {
    _ctx = ctx;
    _w = opts.canvasWidth;
    _h = opts.canvasHeight;
    _audio = opts.audioManager;
    _mode = opts.mode || "single";

    // 重置全域狀態
    _state = "difficulty-select";
    _stateStartTime = performance.now();
    _difficulty = "easy";
    _question = null;
    _questionP1 = null;
    _questionP2 = null;
    _balloons = [];
    _balloonsP2 = [];
    _confetti = [];
    _comboGlows = [];
    _floatTexts = [];
    _shakeMessages = [];
    _score = 0;
    _scoreP2 = 0;
    _combo = 0;
    _comboP2 = 0;
    _correctCount = 0;
    _correctCountP2 = 0;
    _consecutiveWrong = 0;
    _consecutiveWrongP2 = 0;
    _bestCombo = 0;
    _bestComboP2 = 0;
    _prevWristP1 = { left: null, right: null };
    _prevWristP2 = { left: null, right: null };
    _prevP1ShoulderX = null;
    _prevP2ShoulderX = null;
    _timeLeft = GAME_DURATION;
    _gameStartTime = 0;
    _showAnswerStart = 0;
    _showAnswerStartP2 = 0;
    _waitingNextQuestion = false;
    _waitingNextQuestionP2 = false;
    _countdownNum = 3;
    _resultButtons = [];
    _difficultyButtons = [];
    _tutorialMessageShown = false;
    _newRecord = false;
    _lastSecondsBeeped = new Set();

    // 首次教學偵測
    _firstTime = !localStorage.getItem("mathBubble_played");

    // BGM
    if (_audio) {
      try { _audio.stopBGM(0); } catch (_) {}
      try { _audio.playBGM("menu"); } catch (_) {}
    }
  },

  update(allLandmarks, timestamp) {
    // ── 雙人 ID 穩定（4-distance 最近匹配）──
    let lm1 = allLandmarks && allLandmarks[0] ? allLandmarks[0] : null;
    let lm2 = allLandmarks && allLandmarks[1] ? allLandmarks[1] : null;
    if (_mode === "dual" && lm1 && lm2) {
      const getShoulderX = (lm) => {
        const ls = lm[11], rs = lm[12];
        if (ls && rs && ls.visibility > 0.1 && rs.visibility > 0.1) return (ls.x + rs.x) / 2;
        return null;
      };
      const sx0 = getShoulderX(lm1);
      const sx1 = getShoulderX(lm2);
      if (_prevP1ShoulderX != null && _prevP2ShoulderX != null && sx0 !== null && sx1 !== null) {
        const d00 = Math.abs(sx0 - _prevP1ShoulderX);
        const d01 = Math.abs(sx0 - _prevP2ShoulderX);
        const d10 = Math.abs(sx1 - _prevP1ShoulderX);
        const d11 = Math.abs(sx1 - _prevP2ShoulderX);
        if (d01 + d10 < d00 + d11) [lm1, lm2] = [lm2, lm1];
      } else if (_prevP1ShoulderX == null && sx0 !== null && sx1 !== null) {
        if (sx1 < sx0) [lm1, lm2] = [lm2, lm1];
      }
      const newSx0 = getShoulderX(lm1);
      const newSx1 = getShoulderX(lm2);
      if (newSx0 !== null) _prevP1ShoulderX = newSx0;
      if (newSx1 !== null) _prevP2ShoulderX = newSx1;
    }

    // 各狀態的更新
    if (_state === "difficulty-select") {
      // 等待點擊；不需更新任何遊戲邏輯
      return;
    }

    if (_state === "countdown") {
      const elapsed = timestamp - _stateStartTime;
      const newCount = Math.max(1, 3 - Math.floor(elapsed / 1000));
      if (newCount !== _countdownNum) {
        _countdownNum = newCount;
        if (_audio) {
          try { _audio.play(`countdown_${newCount}`); } catch (_) {}
        }
      }
      if (elapsed >= 3500) {
        // 進入遊戲
        _state = "playing";
        _stateStartTime = timestamp;
        _gameStartTime = timestamp;
        if (_audio) {
          try { _audio.play("countdown_go"); } catch (_) {}
          try { _audio.stopBGM(0); _audio.playBGM("gameplay"); } catch (_) {}
        }
        _startNewQuestion("p1", timestamp);
        if (_mode === "dual") _startNewQuestion("p2", timestamp);
        // 首次教學提示
        if (_firstTime && !_tutorialMessageShown) {
          _shakeMessages.push({ text: "揮揮手戳氣球！", y: _h * 0.4, life: 2500, start: timestamp, color: C.brand });
          playVoice("tut_wave");
          _tutorialMessageShown = true;
          localStorage.setItem("mathBubble_played", "1");
        }
      }
      return;
    }

    if (_state === "playing") {
      // 更新總時間
      _timeLeft = Math.max(0, GAME_DURATION - (timestamp - _gameStartTime) / 1000);
      // 最後 3 秒提示音（柔和、不刺耳）— 每秒一聲
      const intSecLeft = Math.ceil(_timeLeft);
      if (intSecLeft <= 3 && intSecLeft > 0 && !_lastSecondsBeeped.has(intSecLeft)) {
        _lastSecondsBeeped.add(intSecLeft);
        if (_audio) try { _audio.play("countdown_1"); } catch (_) {}
      }
      if (_timeLeft <= 0) {
        _endGame(timestamp);
        return;
      }

      // 處理玩家手腕（單人/雙人）
      if (_mode === "dual") {
        _processPlayer(lm1, "p1", timestamp);
        _processPlayer(lm2, "p2", timestamp);
      } else {
        _processPlayer(lm1, "p1", timestamp);
      }

      // 氣球飄行 + 過期清理
      _updateBalloons(_balloons, timestamp);
      if (_mode === "dual") _updateBalloons(_balloonsP2, timestamp);

      // 檢查每題限時
      _checkQuestionTimeout("p1", timestamp);
      if (_mode === "dual") _checkQuestionTimeout("p2", timestamp);

      // 紙屑
      _updateConfetti();
      _updateComboGlows(timestamp);
      _updateFloatTexts();
      _updateShakeMessages(timestamp);

      return;
    }

    if (_state === "gameover") {
      _updateConfetti();
      _updateComboGlows(timestamp);
      _updateFloatTexts();
      _updateShakeMessages(timestamp);
      return;
    }
  },

  render(ctx) {
    if (_state === "difficulty-select") {
      _renderDifficultySelect(ctx);
      return;
    }

    // 半透明遮罩讓元素更清楚
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(0, 0, _w, _h);

    // 雙人模式畫中線
    if (_mode === "dual" && (_state === "playing" || _state === "gameover")) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.setLineDash([12, 8]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(_w / 2, 80);
      ctx.lineTo(_w / 2, _h - 60);
      ctx.stroke();
      ctx.restore();
    }

    // 氣球
    _renderBalloons(ctx, _balloons);
    if (_mode === "dual") _renderBalloons(ctx, _balloonsP2);

    // 紙屑
    _renderConfetti(ctx);
    _renderComboGlows(ctx);

    // 題目（在頂部）
    if (_state === "playing" || _state === "gameover") {
      if (_mode === "dual") {
        _renderQuestionPanel(ctx, _questionP1, _w * 0.25, "p1");
        _renderQuestionPanel(ctx, _questionP2, _w * 0.75, "p2");
      } else {
        _renderQuestionPanel(ctx, _question, _w * 0.5, null);
      }
    }

    // 倒數畫面
    if (_state === "countdown") {
      _renderCountdown(ctx);
    }

    // HUD
    if (_state === "playing" || _state === "gameover") {
      _renderHUD(ctx);
    }

    // 飄字 + 中央訊息
    _renderFloatTexts(ctx);
    _renderShakeMessages(ctx);

    // 結算
    if (_state === "gameover") {
      _renderResults(ctx);
    }
  },

  getScore() {
    return _mode === "dual" ? Math.max(_score, _scoreP2) : _score;
  },

  isGameOver() {
    return _state === "gameover";
  },

  destroy() {
    _balloons = [];
    _balloonsP2 = [];
    _confetti = [];
    _comboGlows = [];
    _floatTexts = [];
    _shakeMessages = [];
    if (_audio) {
      try { _audio.stopBGM(0); } catch (_) {}
    }
  },

  handleClick(cx, cy) {
    if (_state === "difficulty-select") {
      for (const btn of _difficultyButtons) {
        if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
          _difficulty = btn.diffKey;
          _state = "countdown";
          _stateStartTime = performance.now();
          _countdownNum = 3;
          if (_audio) {
            try { _audio.play("btn_click"); } catch (_) {}
            try { _audio.play("countdown_3"); } catch (_) {}
          }
          // 用語音朗讀選了什麼難度（讓不識字的家長和小孩確認）
          // 初階朗讀「一加一」、中階「一加二十」、高階「一加五十」當示意
          const samples = { easy: ["num_1","op_plus","num_10"], medium: ["num_1","op_plus","num_20"], hard: ["num_1","op_plus","num_50"] };
          if (samples[btn.diffKey]) playVoiceSeq(samples[btn.diffKey]);
          return;
        }
      }
      return;
    }

    if (_state === "gameover") {
      for (const btn of _resultButtons) {
        if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
          if (_audio) try { _audio.play("btn_click"); } catch (_) {}
          return btn.action;
        }
      }
    }
  },
};

export default mathBubble;


// ════════════════════════════════════════════
//   玩家動作處理（手腕碰撞）
// ════════════════════════════════════════════

function _processPlayer(landmarks, who, timestamp) {
  if (!landmarks) return;
  const balloons = (who === "p2") ? _balloonsP2 : _balloons;
  const prev = (who === "p2") ? _prevWristP2 : _prevWristP1;

  for (const handIdx of [WRIST_LEFT, WRIST_RIGHT]) {
    const wristLm = landmarks[handIdx];
    if (!wristLm || wristLm.visibility < 0.4) continue;

    // 鏡像翻轉（與 ice-breaker 一致）
    const wx = (1 - wristLm.x) * _w;
    const wy = wristLm.y * _h;

    // 揮動速度（用 pixel 距離 → 再 normalize 回 0-1，避免畫面寬高比讓水平/垂直靈敏度不一致）
    const handKey = (handIdx === WRIST_LEFT) ? "left" : "right";
    let speed = 0;
    if (prev[handKey]) {
      const dxPx = (wristLm.x - prev[handKey].x) * _w;
      const dyPx = (wristLm.y - prev[handKey].y) * _h;
      speed = Math.sqrt(dxPx * dxPx + dyPx * dyPx) / _w;
    }
    prev[handKey] = { x: wristLm.x, y: wristLm.y };

    if (speed < MIN_SWIPE_SPEED) continue;

    // 找到第一個被戳中且還活著的氣球
    for (const b of balloons) {
      if (b.state !== "alive") continue;
      const dx = wx - b.x;
      const dy = wy - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < b.size / 2 + HIT_RADIUS_EXTRA) {
        _onBalloonHit(b, who, timestamp);
        break;
      }
    }
  }
}

function _onBalloonHit(b, who, timestamp) {
  const isP2 = (who === "p2");
  const q = isP2 ? _questionP2 : _questionP1;

  if (b.isCorrect) {
    // 戳對！
    b.state = "popping";
    b.stateStart = timestamp;
    b.glowOwner = who;

    // 連擊 + 計分
    if (isP2) {
      const sinceLastP2 = timestamp - _lastHitTimeP2;
      if (sinceLastP2 < COMBO_TIMEOUT) _comboP2++; else _comboP2 = 1;
      _lastHitTimeP2 = timestamp;
      const mult = _comboMultiplier(_comboP2);
      const base = 10;
      const timeBonus = Math.max(0, Math.floor(_questionTimeRemaining("p2", timestamp)));
      const gain = Math.round((base + timeBonus) * mult);
      _scoreP2 += gain;
      _correctCountP2++;
      _consecutiveWrongP2 = 0;
      if (_comboP2 > _bestComboP2) _bestComboP2 = _comboP2;
      _floatTexts.push(_makeFloatText(`+${gain}`, b.x, b.y, C.success));
      if (_comboP2 >= 2) _floatTexts.push(_makeFloatText(`Combo×${_comboP2}`, b.x, b.y - 40, C.accent));
    } else {
      const sinceLast = timestamp - _lastHitTime;
      if (sinceLast < COMBO_TIMEOUT) _combo++; else _combo = 1;
      _lastHitTime = timestamp;
      const mult = _comboMultiplier(_combo);
      const base = 10;
      const timeBonus = Math.max(0, Math.floor(_questionTimeRemaining("p1", timestamp)));
      const gain = Math.round((base + timeBonus) * mult);
      _score += gain;
      _correctCount++;
      _consecutiveWrong = 0;
      if (_combo > _bestCombo) _bestCombo = _combo;
      _floatTexts.push(_makeFloatText(`+${gain}`, b.x, b.y, C.success));
      if (_combo >= 2) _floatTexts.push(_makeFloatText(`Combo×${_combo}`, b.x, b.y - 40, C.accent));
    }

    // 紙屑爆發
    _spawnConfetti(b.x, b.y, isP2 ? C.p2 : C.p1, 30);

    // Combo 光環（每 3 連 + 一個）
    const combo = isP2 ? _comboP2 : _combo;
    if (combo >= 3 && combo % 3 === 0) {
      _comboGlows.push({ x: b.x, y: b.y, r: 30, life: 600, start: timestamp, color: C.accent });
    }

    // 音效 + 語音
    if (_audio) try { _audio.play("ice_hit"); } catch (_) {}
    playVoice("fb_good");

    // 進下一題（短延遲）
    if (isP2) _waitingNextQuestionP2 = true;
    else      _waitingNextQuestion = true;
    // 1200ms 讓紙屑飄完、玩家享受到成就感
    setTimeout(() => {
      if (_state !== "playing") return;
      _startNewQuestion(who, performance.now());
    }, 1200);

  } else {
    // 戳錯！輕彈、語音「再想想」、不扣分
    b.state = "wrong";
    b.stateStart = timestamp;
    if (isP2) {
      _comboP2 = 0;
      _consecutiveWrongP2++;
    } else {
      _combo = 0;
      _consecutiveWrong++;
    }
    if (_audio) try { _audio.play("miss"); } catch (_) {}
    playVoice("fb_think");
    _floatTexts.push(_makeFloatText("再想想", b.x, b.y - 30, C.warning));

    // 連錯 2 題提示「叫爸爸媽媽」
    const cw = isP2 ? _consecutiveWrongP2 : _consecutiveWrong;
    if (cw >= 2) {
      _shakeMessages.push({ text: "要不要叫爸爸媽媽？", y: _h * 0.45, life: 2500, start: timestamp, color: C.brand });
      playVoice("ask_parent");
      if (isP2) _consecutiveWrongP2 = 0;
      else      _consecutiveWrong = 0;
    }
  }
}

function _comboMultiplier(combo) {
  if (combo >= 10) return 5;
  if (combo >= 5)  return 3;
  if (combo >= 3)  return 2;
  if (combo >= 2)  return 1.5;
  return 1;
}

function _questionTimeRemaining(who, timestamp) {
  const start = (who === "p2") ? _questionStartTimeP2 : _questionStartTime;
  const limit = DIFFICULTY[_difficulty].timeLimit * 1000;
  return Math.max(0, (limit - (timestamp - start)) / 1000);
}


// ════════════════════════════════════════════
//   題目流程
// ════════════════════════════════════════════

function _startNewQuestion(who, timestamp) {
  const q = generateQuestion(_difficulty);
  if (_mode === "dual") {
    if (who === "p2") {
      _questionP2 = q;
      _questionStartTimeP2 = timestamp;
      _balloonsP2 = spawnBalloons(q, "p2");
      _waitingNextQuestionP2 = false;
      _showAnswerStartP2 = 0;
    } else {
      _questionP1 = q;
      _questionStartTime = timestamp;
      _balloons = spawnBalloons(q, "p1");
      _waitingNextQuestion = false;
      _showAnswerStart = 0;
    }
  } else {
    _question = q;
    _questionP1 = q; // 單人時 _questionP1 也指向同一題（HUD render 用）
    _questionStartTime = timestamp;
    _balloons = spawnBalloons(q, "both");
    _waitingNextQuestion = false;
    _showAnswerStart = 0;
  }

  // 朗讀題目（延遲 200ms 讓畫面先出來）
  setTimeout(() => {
    if (_state === "playing") speakQuestion(q);
  }, 200);
}

function _checkQuestionTimeout(who, timestamp) {
  const isP2 = (who === "p2");
  if (isP2) {
    if (_waitingNextQuestionP2 || !_questionP2) return;
    if (_showAnswerStartP2 > 0) {
      if (timestamp - _showAnswerStartP2 >= SHOW_ANSWER_DURATION) {
        _startNewQuestion("p2", timestamp);
      }
      return;
    }
    const limit = DIFFICULTY[_difficulty].timeLimit * 1000;
    if (timestamp - _questionStartTimeP2 >= limit) {
      _showAnswer("p2", timestamp);
    }
  } else {
    if (_waitingNextQuestion || !_questionP1) return;
    if (_showAnswerStart > 0) {
      if (timestamp - _showAnswerStart >= SHOW_ANSWER_DURATION) {
        _startNewQuestion("p1", timestamp);
      }
      return;
    }
    const limit = DIFFICULTY[_difficulty].timeLimit * 1000;
    if (timestamp - _questionStartTime >= limit) {
      _showAnswer("p1", timestamp);
    }
  }
}

function _showAnswer(who, timestamp) {
  const isP2 = (who === "p2");
  const q = isP2 ? _questionP2 : _questionP1;
  const balloons = isP2 ? _balloonsP2 : _balloons;

  // 把所有氣球設成顯示答案狀態（正確的閃爍放大）
  balloons.forEach(b => {
    b.state = "showing-answer";
    b.stateStart = timestamp;
  });
  if (isP2) _showAnswerStartP2 = timestamp;
  else      _showAnswerStart = timestamp;

  // 語音「答案是 X」
  playVoiceSeq(["fb_answer", `num_${q.answer}`]);
}

function _endGame(timestamp) {
  _state = "gameover";
  _stateStartTime = timestamp;
  if (_audio) {
    try { _audio.stopBGM(0); _audio.playBGM("results"); } catch (_) {}
    try { _audio.play("game_over"); } catch (_) {}
  }
  // 結算紙屑慶祝
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      _spawnConfetti(_w / 2 + (Math.random() - 0.5) * 200, _h * 0.3, C.accent, 40);
    }, i * 200);
  }
  playVoice("tut_welldone");

  // 保存歷史最高分（per 難度）
  const finalScore = (_mode === "dual") ? Math.max(_score, _scoreP2) : _score;
  const key = `mathBubble_best_${_difficulty}`;
  const oldBest = parseInt(localStorage.getItem(key) || "0", 10);
  if (finalScore > oldBest) {
    localStorage.setItem(key, finalScore.toString());
    _newRecord = true;
  } else {
    _newRecord = false;
  }
}


// ════════════════════════════════════════════
//   氣球更新與繪製
// ════════════════════════════════════════════

function _updateBalloons(balloons, timestamp) {
  for (let i = balloons.length - 1; i >= 0; i--) {
    const b = balloons[i];
    if (b.state === "alive") {
      b.y += b.floatSpeed;
      b.x += Math.sin((timestamp / 600) + b.swayPhase) * 0.4;
      b.rotation = Math.sin((timestamp / 800) + b.swayPhase) * 0.05;
      // 飄出畫面頂端 → 移除
      if (b.y < -b.size) balloons.splice(i, 1);
    } else if (b.state === "popping") {
      // 0.4 秒後消失
      if (timestamp - b.stateStart > 400) balloons.splice(i, 1);
    } else if (b.state === "wrong") {
      // 0.6 秒後恢復 alive（讓玩家還能戳到）
      if (timestamp - b.stateStart > 600) {
        b.state = "alive";
      }
    } else if (b.state === "showing-answer") {
      // 不移動、繼續閃爍
    }
  }
}

function _renderBalloons(ctx, balloons) {
  for (const b of balloons) {
    if (b.state === "popping") {
      _drawPoppingBalloon(ctx, b);
    } else if (b.state === "wrong") {
      _drawBalloon(ctx, b, { shake: true });
    } else if (b.state === "showing-answer") {
      _drawBalloon(ctx, b, { highlight: b.isCorrect });
    } else {
      _drawBalloon(ctx, b);
    }
  }
}

function _drawBalloon(ctx, b, opts = {}) {
  ctx.save();
  let dx = 0;
  if (opts.shake) {
    const t = (performance.now() - b.stateStart);
    dx = Math.sin(t / 30) * 8 * Math.max(0, 1 - t / 600);
  }
  ctx.translate(b.x + dx, b.y);
  ctx.rotate(b.rotation);

  // 答案閃爍放大效果
  let scale = 1;
  if (opts.highlight) {
    const t = performance.now() / 200;
    scale = 1.15 + Math.sin(t) * 0.08;
  }
  ctx.scale(scale, scale);

  const r = b.size / 2;

  // 氣球主體
  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 0, 0, 0, r);
  grad.addColorStop(0, "#FFFFFF");
  grad.addColorStop(0.25, b.color.fill);
  grad.addColorStop(1, b.color.stroke);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 1.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // 高光
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.18, r * 0.28, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // 氣球底部三角繩結
  ctx.fillStyle = b.color.stroke;
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, r * 1.05);
  ctx.lineTo(r * 0.1, r * 1.05);
  ctx.lineTo(0, r * 1.18);
  ctx.fill();

  // 繩子
  ctx.strokeStyle = "rgba(80,80,80,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, r * 1.18);
  ctx.bezierCurveTo(15, r * 1.4, -15, r * 1.6, 5, r * 1.85);
  ctx.stroke();

  // 數字
  const fontSize = Math.floor(b.size * 0.42);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeText(b.value, 0, 0);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(b.value, 0, 0);

  // 雙人模式：戳中後光環
  if (b.glowOwner) {
    const glowColor = (b.glowOwner === "p2") ? C.p2 : C.p1;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, r + 8, r * 1.08 + 8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function _drawPoppingBalloon(ctx, b) {
  const t = (performance.now() - b.stateStart) / 400; // 0..1
  if (t > 1) return;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.globalAlpha = 1 - t;
  ctx.scale(1 + t * 0.6, 1 + t * 0.6);

  // 爆裂線條（射出 8 條）
  ctx.strokeStyle = b.color.fill;
  ctx.lineWidth = 4;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * b.size * 0.2, Math.sin(angle) * b.size * 0.2);
    ctx.lineTo(Math.cos(angle) * b.size * 0.55, Math.sin(angle) * b.size * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}


// ════════════════════════════════════════════
//   紙屑（粒子）
// ════════════════════════════════════════════

function _spawnConfetti(x, y, themeColor, count) {
  const colors = ["#FF6B6B", "#FFD43B", "#74C0FC", "#69DB7C", "#C94FC8", themeColor];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 6;
    _confetti.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      life: 1.0,
      gravity: 0.25,
    });
  }
}

function _updateConfetti() {
  for (let i = _confetti.length - 1; i >= 0; i--) {
    const c = _confetti[i];
    c.x += c.vx;
    c.y += c.vy;
    c.vy += c.gravity;
    c.vx *= 0.99;
    c.rotation += c.rotSpeed;
    c.life -= 0.012;
    if (c.life <= 0 || c.y > _h + 50) _confetti.splice(i, 1);
  }
}

function _renderConfetti(ctx) {
  for (const c of _confetti) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, c.life);
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rotation);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
    ctx.restore();
  }
}


// ════════════════════════════════════════════
//   Combo 光環
// ════════════════════════════════════════════

function _updateComboGlows(timestamp) {
  for (let i = _comboGlows.length - 1; i >= 0; i--) {
    const g = _comboGlows[i];
    if (timestamp - g.start > g.life) _comboGlows.splice(i, 1);
  }
}

function _renderComboGlows(ctx) {
  const now = performance.now();
  for (const g of _comboGlows) {
    const t = (now - g.start) / g.life; // 0..1
    if (t > 1) continue;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.7;
    const r = g.r + t * 80;
    const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
    grad.addColorStop(0, g.color);
    grad.addColorStop(0.7, g.color + "00");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}


// ════════════════════════════════════════════
//   飄字 + 中央訊息
// ════════════════════════════════════════════

function _makeFloatText(text, x, y, color) {
  return { text, x, y, vy: -1.5, life: 1.0, color, start: performance.now() };
}

function _updateFloatTexts() {
  for (let i = _floatTexts.length - 1; i >= 0; i--) {
    const t = _floatTexts[i];
    t.y += t.vy;
    t.life -= 0.018;
    if (t.life <= 0) _floatTexts.splice(i, 1);
  }
}

function _renderFloatTexts(ctx) {
  for (const t of _floatTexts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, t.life);
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
}

function _updateShakeMessages(timestamp) {
  for (let i = _shakeMessages.length - 1; i >= 0; i--) {
    const m = _shakeMessages[i];
    if (timestamp - m.start > m.life) _shakeMessages.splice(i, 1);
  }
}

function _renderShakeMessages(ctx) {
  const now = performance.now();
  for (const m of _shakeMessages) {
    const elapsed = now - m.start;
    const t = elapsed / m.life;
    if (t > 1) continue;
    const alpha = t < 0.15 ? t / 0.15 : (t > 0.85 ? (1 - t) / 0.15 : 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // 圓角背景框
    const padding = 30;
    const textWidth = ctx.measureText(m.text).width;
    const boxW = textWidth + padding * 2;
    const boxH = 80;
    ctx.fillStyle = C.panelBg;
    _rrect(ctx, _w / 2 - boxW / 2, m.y - boxH / 2, boxW, boxH, 16);
    ctx.fill();
    // 文字
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.strokeText(m.text, _w / 2, m.y);
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, _w / 2, m.y);
    ctx.restore();
  }
}


// ════════════════════════════════════════════
//   題目面板（頂部）+ 倒數 + HUD
// ════════════════════════════════════════════

function _renderQuestionPanel(ctx, q, centerX, owner) {
  if (!q) return;
  const panelW = _mode === "dual" ? _w * 0.4 : 420;
  const panelH = 150;  // 加高給點點圖示空間
  const x = centerX - panelW / 2;
  const y = 20;

  ctx.save();
  // 背景
  ctx.fillStyle = C.bg;
  _rrect(ctx, x, y, panelW, panelH, 20);
  ctx.fill();
  // 邊框：雙人模式分色
  if (owner) {
    ctx.strokeStyle = (owner === "p2") ? C.p2 : C.p1;
    ctx.lineWidth = 4;
    _rrect(ctx, x, y, panelW, panelH, 20);
    ctx.stroke();
  }
  // 題目文字
  ctx.fillStyle = C.text;
  ctx.font = "bold 48px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${q.a} + ${q.b} = ?`, centerX, y + 40);

  // 點點圖示輔助（給不識字的幼兒視覺化）— 高階數字大就不畫了
  if (q.a + q.b <= 30) {
    _drawDotGroup(ctx, centerX - 80, y + 95, q.a, "#FF6B6B");
    ctx.fillStyle = "#666";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("+", centerX, y + 95);
    _drawDotGroup(ctx, centerX + 30, y + 95, q.b, "#74C0FC");
  }

  // 雙人模式下方標 P1 / P2
  if (owner) {
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = (owner === "p2") ? C.p2 : C.p1;
    ctx.fillText(owner === "p2" ? "玩家 2" : "玩家 1", centerX, y + panelH - 12);
  }
  ctx.restore();
}

/** 畫一群圓點（最多 10 個一行，超過分行，右對齊） */
function _drawDotGroup(ctx, startX, centerY, count, color) {
  const dotR = 6;
  const gap = 4;
  const perRow = Math.min(count, 10);
  const rows = Math.ceil(count / 10);
  const totalW = perRow * (dotR * 2 + gap) - gap;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 10);
    const col = i % 10;
    const x = startX - totalW + col * (dotR * 2 + gap) + dotR;
    const y = centerY + (row - (rows - 1) / 2) * (dotR * 2 + gap);
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function _renderCountdown(ctx) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, _w, _h);

  const elapsed = performance.now() - _stateStartTime;
  const inSec = (elapsed % 1000) / 1000;
  const scale = 1 + (1 - inSec) * 0.5;
  const alpha = 1 - inSec * 0.3;

  if (elapsed < 3000) {
    const num = Math.max(1, 3 - Math.floor(elapsed / 1000));
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.floor(220 * scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 12;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeText(num, _w / 2, _h / 2);
    ctx.fillStyle = C.brand;
    ctx.fillText(num, _w / 2, _h / 2);
  } else {
    // GO!
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.floor(180 * scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 12;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeText("GO!", _w / 2, _h / 2);
    ctx.fillStyle = C.success;
    ctx.fillText("GO!", _w / 2, _h / 2);
  }
  ctx.restore();
}

function _renderHUD(ctx) {
  ctx.save();

  // 計時（左上角）
  const timeStr = _formatTime(_timeLeft);
  ctx.fillStyle = C.panelBg;
  _rrect(ctx, 12, _h - 70, 130, 56, 12);
  ctx.fill();
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⏱ " + timeStr, 12 + 65, _h - 70 + 28);

  // 分數（右上角；雙人各佔一邊）
  if (_mode === "dual") {
    _drawScoreBadge(ctx, 12, 130, _score, _combo, "P1", C.p1);
    _drawScoreBadge(ctx, _w - 220 - 12, 130, _scoreP2, _comboP2, "P2", C.p2);
  } else {
    _drawScoreBadge(ctx, _w - 220 - 12, 130, _score, _combo, "分數", C.brand);
  }

  ctx.restore();
}

function _drawScoreBadge(ctx, x, y, score, combo, label, color) {
  ctx.save();
  ctx.fillStyle = C.panelBg;
  _rrect(ctx, x, y, 220, 70, 12);
  ctx.fill();
  // 邊條
  ctx.fillStyle = color;
  _rrect(ctx, x, y, 6, 70, 3);
  ctx.fill();
  // label
  ctx.fillStyle = color;
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label, x + 14, y + 8);
  // score
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(score.toString().padStart(4, "0"), x + 14, y + 26);
  // combo
  if (combo >= 2) {
    ctx.fillStyle = C.accent;
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`🔥 Combo ×${combo}`, x + 220 - 12, y + 14);
  }
  ctx.restore();
}

function _formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}


// ════════════════════════════════════════════
//   難度選擇畫面
// ════════════════════════════════════════════

function _renderDifficultySelect(ctx) {
  ctx.save();
  // 半透明遮罩
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, _w, _h);

  // 標題
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 56px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeText("🎈 數字氣球", _w / 2, _h * 0.15);
  ctx.fillStyle = "#FFF";
  ctx.fillText("🎈 數字氣球", _w / 2, _h * 0.15);

  ctx.font = "26px sans-serif";
  ctx.fillStyle = "#FFE";
  ctx.fillText("選擇難度", _w / 2, _h * 0.22);

  // 三個難度按鈕
  const btnW = 280, btnH = 110;
  const gap = 20;
  const startY = _h * 0.32;
  const keys = ["easy", "medium", "hard"];
  _difficultyButtons = [];

  keys.forEach((key, i) => {
    const d = DIFFICULTY[key];
    const x = (_w - btnW) / 2;
    const y = startY + i * (btnH + gap);

    // 背景
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    _rrect(ctx, x, y, btnW, btnH, 18);
    ctx.fill();
    // 左邊條
    ctx.fillStyle = d.color;
    _rrect(ctx, x, y, 12, btnH, 6);
    ctx.fill();
    // 主標
    ctx.fillStyle = d.color;
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(d.label, x + 32, y + 18);
    // 副標
    ctx.fillStyle = "#666";
    ctx.font = "20px sans-serif";
    ctx.fillText(d.subLabel, x + 32, y + 60);
    // 右側秒數
    ctx.fillStyle = d.color;
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${d.timeLimit} 秒/題`, x + btnW - 20, y + 70);

    _difficultyButtons.push({ x, y, w: btnW, h: btnH, diffKey: key });
  });

  // 提示
  ctx.fillStyle = "#FFE";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("👆 點擊難度卡片開始", _w / 2, startY + 3 * (btnH + gap) + 10);

  ctx.restore();
}


// ════════════════════════════════════════════
//   結算畫面
// ════════════════════════════════════════════

function _renderResults(ctx) {
  ctx.save();
  // 遮罩
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, _w, _h);

  const cx = _w / 2;
  const titleY = _h * 0.16;

  // 標題
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 48px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  const title = (_mode === "dual") ? _resultTitleDual() : "好棒喔！";
  ctx.strokeText(title, cx, titleY);
  ctx.fillStyle = "#FFF";
  ctx.fillText(title, cx, titleY);

  // 分數區
  if (_mode === "dual") {
    _drawDualScoreCard(ctx, _w * 0.27, _h * 0.42, _score, _correctCount, _bestCombo, "P1", C.p1);
    _drawDualScoreCard(ctx, _w * 0.73, _h * 0.42, _scoreP2, _correctCountP2, _bestComboP2, "P2", C.p2);
  } else {
    _drawSingleScoreCard(ctx, cx, _h * 0.42);
  }

  // 星星評級
  const starY = _h * 0.65;
  const stars = _calcStars(_score);
  _drawStars(ctx, cx, starY, stars);

  // 歷史紀錄與破紀錄提示
  const bestKey = `mathBubble_best_${_difficulty}`;
  const bestScore = parseInt(localStorage.getItem(bestKey) || "0", 10);
  const recordY = _h * 0.78;
  ctx.fillStyle = "#FFE";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (_newRecord) {
    // 破紀錄文字閃爍
    const t = performance.now() / 250;
    ctx.fillStyle = `hsl(${(t * 30) % 360}, 90%, 65%)`;
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(`🎊 新紀錄！${bestScore}`, cx, recordY);
  } else {
    ctx.fillText(`歷史最高：${bestScore}`, cx, recordY);
  }

  // 按鈕：再玩一次（大）+ 回主選單（小）— 莎夏要求視覺權重不對等
  const btnYBig = _h - 100;
  const replayW = 280, replayH = 80;
  const menuW = 180, menuH = 60;
  const gap = 20;
  const totalW = replayW + menuW + gap;
  const replayX = cx - totalW / 2;
  const menuX = replayX + replayW + gap;
  const menuY = btnYBig + (replayH - menuH) / 2;

  _resultButtons = [
    { x: replayX, y: btnYBig, w: replayW, h: replayH, action: "replay", label: "🎮 再玩一次", color: C.success, fontSize: 32 },
    { x: menuX,   y: menuY,   w: menuW,   h: menuH,   action: "menu",   label: "回主選單",     color: "rgba(80,80,80,0.85)", fontSize: 22 },
  ];
  for (const btn of _resultButtons) {
    ctx.fillStyle = btn.color;
    _rrect(ctx, btn.x, btn.y, btn.w, btn.h, 16);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${btn.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
  }

  ctx.restore();
}

function _resultTitleDual() {
  if (_score > _scoreP2) return "🎉 玩家 1 贏了！";
  if (_scoreP2 > _score) return "🎉 玩家 2 贏了！";
  return "🤝 平手！";
}

function _drawSingleScoreCard(ctx, cx, cy) {
  ctx.fillStyle = C.bg;
  _rrect(ctx, cx - 220, cy - 80, 440, 160, 20);
  ctx.fill();

  ctx.fillStyle = C.brand;
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("最終分數", cx, cy - 50);

  ctx.fillStyle = C.text;
  ctx.font = "bold 88px sans-serif";
  ctx.fillText(_score.toString(), cx, cy + 5);

  ctx.font = "20px sans-serif";
  ctx.fillStyle = "#666";
  ctx.fillText(`答對 ${_correctCount} 題  最高 Combo ${_bestCombo}`, cx, cy + 60);
}

function _drawDualScoreCard(ctx, cx, cy, score, correct, bestCombo, label, color) {
  ctx.fillStyle = C.bg;
  _rrect(ctx, cx - 150, cy - 80, 300, 160, 20);
  ctx.fill();
  ctx.fillStyle = color;
  _rrect(ctx, cx - 150, cy - 80, 8, 160, 4);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy - 56);

  ctx.fillStyle = C.text;
  ctx.font = "bold 64px sans-serif";
  ctx.fillText(score.toString(), cx, cy + 5);

  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#666";
  ctx.fillText(`答對 ${correct} ・ Combo ${bestCombo}`, cx, cy + 56);
}

function _calcStars(score) {
  // 依難度動態調整門檻
  const d = _difficulty;
  const thresholds = {
    easy:   [50, 120, 200],
    medium: [70, 160, 280],
    hard:   [90, 200, 360],
  }[d];
  if (score >= thresholds[2]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[0]) return 1;
  return 0;
}

function _drawStars(ctx, cx, cy, stars) {
  const starSize = 56;
  const gap = 16;
  const totalW = starSize * 3 + gap * 2;
  const startX = cx - totalW / 2 + starSize / 2;

  for (let i = 0; i < 3; i++) {
    const x = startX + i * (starSize + gap);
    const lit = i < stars;
    ctx.save();
    ctx.translate(x, cy);
    if (lit) {
      const t = performance.now() / 400 + i * 0.3;
      ctx.scale(1 + Math.sin(t) * 0.06, 1 + Math.sin(t) * 0.06);
    }
    _drawStar(ctx, 0, 0, starSize / 2, lit ? "#FFD43B" : "rgba(255,255,255,0.25)", lit ? "#F08C00" : null);
    ctx.restore();
  }

  // 鼓勵語
  let msg = "";
  if (stars === 3) msg = "完美無缺！⭐⭐⭐";
  else if (stars === 2) msg = "做得很好！再接再厲";
  else if (stars === 1) msg = "有進步喔！再玩一次更厲害";
  else msg = "你好棒！下次會更好";
  ctx.font = "bold 22px sans-serif";
  ctx.fillStyle = "#FFE";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(msg, cx, cy + 60);
}

function _drawStar(ctx, cx, cy, r, fill, stroke) {
  // 五角星
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    const ia = angle + Math.PI / 5;
    ctx.lineTo(cx + Math.cos(ia) * r * 0.4, cy + Math.sin(ia) * r * 0.4);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}


// ════════════════════════════════════════════
//   工具：圓角矩形 path
// ════════════════════════════════════════════
function _rrect(ctx, x, y, w, h, r) {
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
}
