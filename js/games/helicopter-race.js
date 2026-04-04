/**
 * helicopter-race.js — 直升機競賽迷你遊戲
 * 玩家扭動身體讓直升機飛高，35 秒內比誰飛得高
 */

// ── 調試開關 ──
const DEBUG_MODE = false;

// ── 配色方案 ──
const C = {
  brand: "#C94FC8", accent: "#F5A623", success: "#1ABC9C",
  danger: "#FF4757", dark: "#2D3436", light: "#FDFEFE",
  sky: { low: "#87CEEB", mid: "#4FC3F7", high: "#1565C0", top: "#FFD54F" },
};

// ── 遊戲常數（2-6 歲幼兒適配）──
const GAME_DURATION = 35;
const WARNING_TIME = 5;

const HELI_COLORS = [
  { name: "紫紅", main: "#C94FC8", light: "#E080E0", dark: "#8B2D8B" },
  { name: "橙黃", main: "#F5A623", light: "#FFD080", dark: "#C07818" },
];

const PHYSICS = {
  sensitivity: 1.5, maxThrust: 8.0, gravity: 1.4,
  inertiaDecay: 0.95, boostSensitivity: 2.0, boostDuration: 5,
  noiseThreshold: 0.008, maxHeight: 0.80,
};

const DET = { hipL: 23, hipR: 24, shL: 11, shR: 12, hipVis: 0.3 };

// ── 工具函式 ──
function outlinedText(ctx, text, x, y, fill = C.light, stroke = C.dark, lw = 4) {
  ctx.lineWidth = lw; ctx.lineJoin = "round";
  ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

function lerpColor(a, b, t) {
  const ah = parseInt(a.replace("#", ""), 16);
  const bh = parseInt(b.replace("#", ""), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

// ══════════════════════════════════════════
// ── 遊戲主體 ──
// ══════════════════════════════════════════

let _ctx, _w, _h, _audio, _mode;
let gameState = "countdown";
let countdown = 3, countdownTimer = 0;
let timeLeft = GAME_DURATION, lastFrameTime = 0;
let players = [], clouds = [];
let quitBtnArea = null, quitConfirmOpen = false;
let quitConfirmYes = null, quitConfirmNo = null;
let _resultButtons = [];
let _warningFired = false;

// ── 扭動偵測 ──
function calcTwist(landmarks, player) {
  if (!landmarks || landmarks.length < 25) return 0;

  let lIdx = DET.hipL, rIdx = DET.hipR;
  const hipVis = Math.min(
    landmarks[DET.hipL]?.visibility ?? 0,
    landmarks[DET.hipR]?.visibility ?? 0
  );
  if (hipVis < DET.hipVis) { lIdx = DET.shL; rIdx = DET.shR; }

  const left = landmarks[lIdx], right = landmarks[rIdx];
  if (!left || !right) return 0;

  const hipDist = Math.abs(left.x - right.x);
  if (player.baseHipDist === 0) {
    player.baseHipDist = hipDist;
    player.lastHipDist = hipDist;
    return 0;
  }

  player.baseHipDist = player.baseHipDist * 0.99 + hipDist * 0.01;
  const amplitude = Math.abs(hipDist - player.baseHipDist);
  const speed = Math.abs(hipDist - player.lastHipDist);
  player.lastHipDist = hipDist;

  if (amplitude < PHYSICS.noiseThreshold && speed < PHYSICS.noiseThreshold) return 0;

  const raw = amplitude * speed * PHYSICS.sensitivity * 1000;
  const now = Date.now();
  player.twistHistory.push({ time: now, intensity: raw });
  player.twistHistory = player.twistHistory.filter(t => now - t.time < 1000);
  const freqBonus = 1 + Math.min(player.twistHistory.length / 10, 1.0);

  return Math.min(raw * freqBonus, 1.0);
}

// ── 物理更新 ──
function updatePhysics(dt) {
  const elapsed = GAME_DURATION - timeLeft;
  const inBoost = elapsed < PHYSICS.boostDuration;

  players.forEach(p => {
    const sens = inBoost ? PHYSICS.boostSensitivity : PHYSICS.sensitivity;
    const thrust = p.currentIntensity * PHYSICS.maxThrust * (sens / PHYSICS.sensitivity);
    if (p.currentIntensity > 0) p.velocity += thrust * dt;
    p.velocity -= PHYSICS.gravity * dt;
    p.velocity *= PHYSICS.inertiaDecay;
    p.height += p.velocity * dt;
    p.height = Math.max(0, Math.min(PHYSICS.maxHeight, p.height));
    if (p.height <= 0) p.velocity = 0;
  });
}

// ── 背景繪製 ──
function renderSky() {
  const maxH = Math.max(...players.map(p => p.height));
  const prog = maxH / PHYSICS.maxHeight;
  const grad = _ctx.createLinearGradient(0, 0, 0, _h);
  if (prog < 0.33) {
    grad.addColorStop(0, C.sky.mid); grad.addColorStop(1, C.sky.low);
  } else if (prog < 0.66) {
    grad.addColorStop(0, C.sky.high); grad.addColorStop(1, C.sky.mid);
  } else {
    grad.addColorStop(0, lerpColor(C.sky.high, C.sky.top, (prog - 0.66) / 0.34));
    grad.addColorStop(1, C.sky.high);
  }
  _ctx.fillStyle = grad;
  _ctx.fillRect(0, 0, _w, _h);
}

function initClouds() {
  clouds = [];
  for (let i = 0; i < 15; i++) {
    clouds.push({
      x: Math.random() * _w,
      baseY: Math.random() * _h * 2 - _h * 0.5,
      size: 40 + Math.random() * 60,
      opacity: 0.4 + Math.random() * 0.4,
      layer: Math.floor(Math.random() * 3),
    });
  }
}

function renderClouds() {
  const maxH = Math.max(...players.map(p => p.height));
  clouds.forEach(c => {
    const parallax = 0.3 + c.layer * 0.3;
    const screenY = c.baseY + maxH * _h * parallax;
    if (screenY < -100 || screenY > _h + 100) return;
    _ctx.save(); _ctx.globalAlpha = c.opacity; _ctx.fillStyle = "white";
    const s = c.size;
    _ctx.beginPath();
    _ctx.arc(c.x, screenY, s * 0.5, 0, Math.PI * 2);
    _ctx.arc(c.x - s * 0.4, screenY + s * 0.1, s * 0.35, 0, Math.PI * 2);
    _ctx.arc(c.x + s * 0.4, screenY + s * 0.1, s * 0.35, 0, Math.PI * 2);
    _ctx.arc(c.x - s * 0.2, screenY - s * 0.15, s * 0.3, 0, Math.PI * 2);
    _ctx.arc(c.x + s * 0.2, screenY - s * 0.1, s * 0.3, 0, Math.PI * 2);
    _ctx.fill(); _ctx.restore();
  });
}

function renderCitySkyline() {
  const maxH = Math.max(...players.map(p => p.height));
  const scrollY = maxH * _h * 0.5;
  const baseY = _h * 0.9 + scrollY;
  if (baseY > _h + 200) return;
  _ctx.fillStyle = "rgba(30, 40, 50, 0.6)";
  const blds = [
    { x: 0, w: 60, h: 120 }, { x: 70, w: 40, h: 80 }, { x: 120, w: 80, h: 150 },
    { x: 210, w: 50, h: 100 }, { x: 270, w: 70, h: 130 }, { x: 350, w: 45, h: 90 },
    { x: 410, w: 90, h: 160 },
  ];
  blds.forEach(b => {
    for (let off = 0; off < _w; off += 500) {
      _ctx.fillRect(b.x + off, baseY - b.h, b.w, b.h + 200);
    }
  });
}

// ── 直升機繪製 ──
function drawHelicopter(x, y, color, propAngle, intensity) {
  const s = 50;
  _ctx.save();
  const wobble = Math.sin(Date.now() / 100) * intensity * 8;
  _ctx.translate(x, y);
  _ctx.rotate(wobble * Math.PI / 180);

  // 機身
  _ctx.fillStyle = color.main;
  _ctx.beginPath(); _ctx.ellipse(0, 0, s * 0.7, s * 0.45, 0, 0, Math.PI * 2); _ctx.fill();
  _ctx.strokeStyle = color.dark; _ctx.lineWidth = 2; _ctx.stroke();

  // 駕駛艙
  _ctx.fillStyle = "rgba(200,230,255,0.7)";
  _ctx.beginPath(); _ctx.ellipse(s * 0.15, -s * 0.05, s * 0.25, s * 0.25, 0, 0, Math.PI * 2); _ctx.fill();

  // 眼睛
  _ctx.fillStyle = "white";
  _ctx.beginPath(); _ctx.arc(s * 0.2, -s * 0.1, s * 0.15, 0, Math.PI * 2); _ctx.fill();
  _ctx.fillStyle = C.dark;
  _ctx.beginPath(); _ctx.arc(s * 0.23, -s * 0.1, s * 0.07, 0, Math.PI * 2); _ctx.fill();

  // 尾巴
  _ctx.fillStyle = color.dark;
  _ctx.beginPath();
  _ctx.moveTo(-s * 0.5, -s * 0.1); _ctx.lineTo(-s * 1.0, -s * 0.3);
  _ctx.lineTo(-s * 1.0, s * 0.1); _ctx.lineTo(-s * 0.5, s * 0.1);
  _ctx.closePath(); _ctx.fill();

  // 尾旋翼
  _ctx.strokeStyle = color.light; _ctx.lineWidth = 3;
  const ta = propAngle * 1.5;
  _ctx.beginPath();
  _ctx.moveTo(-s * 1.0, -s * 0.3 + Math.sin(ta) * s * 0.2);
  _ctx.lineTo(-s * 1.0, -s * 0.3 - Math.sin(ta) * s * 0.2);
  _ctx.stroke();

  // 螺旋槳
  _ctx.strokeStyle = color.light; _ctx.lineWidth = 4; _ctx.lineCap = "round";
  const pLen = s * 0.9;
  _ctx.beginPath();
  _ctx.moveTo(Math.cos(propAngle) * -pLen, -s * 0.45);
  _ctx.lineTo(Math.cos(propAngle) * pLen, -s * 0.45);
  _ctx.stroke();

  // 軸心
  _ctx.fillStyle = color.dark;
  _ctx.beginPath(); _ctx.arc(0, -s * 0.45, 4, 0, Math.PI * 2); _ctx.fill();

  // 速度線
  if (intensity > 0.2) {
    _ctx.strokeStyle = `rgba(255,255,255,${intensity * 0.6})`;
    _ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const ly = -s * 0.2 + i * s * 0.2;
      const lx = -s * 0.8 - Math.random() * s * intensity;
      _ctx.beginPath(); _ctx.moveTo(lx, ly); _ctx.lineTo(lx - s * 0.4 * intensity, ly); _ctx.stroke();
    }
  }
  _ctx.restore();
}

// ── HUD ──
function renderHUD() {
  // 計時器
  _ctx.save();
  const timeColor = timeLeft <= WARNING_TIME ? C.danger : C.light;
  const timeStr = Math.ceil(timeLeft).toString();
  _ctx.fillStyle = "rgba(0,0,0,0.5)";
  _ctx.beginPath(); _ctx.arc(_w / 2, 40, 32, 0, Math.PI * 2); _ctx.fill();
  if (timeLeft <= WARNING_TIME) {
    _ctx.strokeStyle = C.danger; _ctx.lineWidth = 3; _ctx.stroke();
  }
  _ctx.font = "bold 36px 'Arial Black', sans-serif";
  _ctx.textAlign = "center"; _ctx.textBaseline = "middle";
  outlinedText(_ctx, timeStr, _w / 2, 40, timeColor, C.dark, 3);
  _ctx.restore();

  // 高度進度條
  const barW = 20, barH = _h * 0.7;
  const barX = _w - barW - 16, barY = (_h - barH) / 2;
  _ctx.fillStyle = "rgba(0,0,0,0.3)";
  rrect(_ctx, barX, barY, barW, barH, 10); _ctx.fill();

  players.forEach(p => {
    const prog = p.height / PHYSICS.maxHeight;
    const mY = barY + barH - (prog * barH);
    _ctx.fillStyle = p.color.main;
    _ctx.beginPath(); _ctx.arc(barX + barW / 2, mY, 8, 0, Math.PI * 2); _ctx.fill();
    _ctx.strokeStyle = "white"; _ctx.lineWidth = 2; _ctx.stroke();
  });
  _ctx.font = "20px sans-serif"; _ctx.textAlign = "center";
  _ctx.fillText("⭐", barX + barW / 2, barY - 16);

  // 提前結束按鈕
  const qs = 48, qx = 12, qy = 12;
  _ctx.save();
  _ctx.fillStyle = "rgba(255,255,255,0.25)";
  _ctx.beginPath(); _ctx.arc(qx + qs / 2, qy + qs / 2, qs / 2, 0, Math.PI * 2); _ctx.fill();
  _ctx.font = "bold 24px sans-serif"; _ctx.textAlign = "center"; _ctx.textBaseline = "middle";
  _ctx.fillStyle = "rgba(255,255,255,0.7)";
  _ctx.fillText("✕", qx + qs / 2, qy + qs / 2);
  _ctx.restore();
  quitBtnArea = { x: qx, y: qy, w: qs, h: qs };
}

function renderQuitConfirm() {
  _ctx.fillStyle = "rgba(0,0,0,0.6)";
  _ctx.fillRect(0, 0, _w, _h);
  const boxW = Math.min(300, _w * 0.8), boxH = 180;
  const boxX = (_w - boxW) / 2, boxY = (_h - boxH) / 2;
  _ctx.fillStyle = "rgba(45,52,54,0.95)";
  rrect(_ctx, boxX, boxY, boxW, boxH, 20); _ctx.fill();
  _ctx.strokeStyle = C.accent; _ctx.lineWidth = 2; _ctx.stroke();

  _ctx.font = "bold 24px 'Arial Black', sans-serif";
  _ctx.textAlign = "center"; _ctx.textBaseline = "middle";
  outlinedText(_ctx, "確定要結束嗎？", _w / 2, boxY + 50, C.light, C.dark, 3);

  const btnW = 100, btnH = 44, btnY = boxY + boxH - 65;
  _ctx.fillStyle = C.danger;
  rrect(_ctx, _w / 2 - btnW - 10, btnY, btnW, btnH, 12); _ctx.fill();
  _ctx.font = "bold 20px sans-serif";
  outlinedText(_ctx, "結束", _w / 2 - btnW / 2 - 10, btnY + btnH / 2, C.light, C.dark, 2);
  quitConfirmYes = { x: _w / 2 - btnW - 10, y: btnY, w: btnW, h: btnH };

  _ctx.fillStyle = C.success;
  rrect(_ctx, _w / 2 + 10, btnY, btnW, btnH, 12); _ctx.fill();
  outlinedText(_ctx, "繼續", _w / 2 + 10 + btnW / 2, btnY + btnH / 2, C.light, C.dark, 2);
  quitConfirmNo = { x: _w / 2 + 10, y: btnY, w: btnW, h: btnH };
}

function renderCountdown() {
  _ctx.fillStyle = "rgba(0,0,0,0.4)";
  _ctx.fillRect(0, 0, _w, _h);
  const num = Math.ceil(countdown);
  const scale = 1 + (countdown % 1) * 0.3;
  _ctx.save();
  _ctx.translate(_w / 2, _h / 2); _ctx.scale(scale, scale);
  _ctx.font = "bold 120px 'Arial Black', sans-serif";
  _ctx.textAlign = "center"; _ctx.textBaseline = "middle";
  outlinedText(_ctx, num > 0 ? num.toString() : "GO!", 0, 0, C.accent, C.dark, 6);
  _ctx.restore();
}

function renderResults() {
  _ctx.fillStyle = "rgba(0,0,0,0.7)";
  _ctx.fillRect(0, 0, _w, _h);

  _ctx.font = "bold 48px 'Arial Black', sans-serif";
  _ctx.textAlign = "center"; _ctx.textBaseline = "middle";

  if (_mode === "dual") {
    const winner = players[0].height >= players[1].height ? 0 : 1;
    outlinedText(_ctx, "🏆 勝利者！", _w / 2, _h * 0.15, C.accent, C.dark, 5);
    drawHelicopter(_w / 2, _h * 0.32, players[winner].color, Date.now() / 50, 0.5);
    _ctx.font = "bold 36px sans-serif";
    outlinedText(_ctx, `玩家 ${winner + 1}`, _w / 2, _h * 0.48, players[winner].color.main, C.dark, 4);
    _ctx.font = "bold 24px sans-serif";
    const p1P = Math.round(players[0].height / PHYSICS.maxHeight * 100);
    const p2P = Math.round(players[1].height / PHYSICS.maxHeight * 100);
    outlinedText(_ctx, `玩家 1: ${p1P}%`, _w / 2, _h * 0.56, players[0].color.main, C.dark, 3);
    outlinedText(_ctx, `玩家 2: ${p2P}%`, _w / 2, _h * 0.62, players[1].color.main, C.dark, 3);
  } else {
    const pct = Math.round(players[0].height / PHYSICS.maxHeight * 100);
    const msg = pct >= 80 ? "🌟 太厲害了！" : pct >= 50 ? "👍 很不錯！" : "💪 再試一次！";
    const msgC = pct >= 80 ? C.accent : pct >= 50 ? C.success : C.brand;
    outlinedText(_ctx, msg, _w / 2, _h * 0.15, msgC, C.dark, 5);
    drawHelicopter(_w / 2, _h * 0.32, players[0].color, Date.now() / 50, 0.3);
    _ctx.font = "bold 64px 'Arial Black', sans-serif";
    outlinedText(_ctx, `${pct}%`, _w / 2, _h * 0.50, C.light, C.dark, 5);
    _ctx.font = "bold 20px sans-serif";
    outlinedText(_ctx, "到達高度", _w / 2, _h * 0.58, "rgba(255,255,255,0.6)", C.dark, 2);
  }

  // 按鈕
  _resultButtons = [];
  const btnW = Math.min(280, _w * 0.65), btnH = 88, btnGap = 20;
  const btnY = _h * 0.72;
  const cx = _w / 2;
  const buttons = [
    { label: "🔄 再玩一次", color: C.accent, action: "replay", x: cx - btnW - btnGap / 2 },
    { label: "🏠 回到選單", color: C.brand, action: "menu", x: cx + btnGap / 2 },
  ];
  buttons.forEach(btn => {
    _ctx.save();
    _ctx.fillStyle = btn.color;
    rrect(_ctx, btn.x, btnY, btnW, btnH, 20); _ctx.fill();
    _ctx.font = "bold 44px 'Arial Black', sans-serif";
    _ctx.textAlign = "center"; _ctx.textBaseline = "middle";
    outlinedText(_ctx, btn.label, btn.x + btnW / 2, btnY + btnH / 2, C.light);
    _ctx.restore();
    _resultButtons.push({ x: btn.x, y: btnY, w: btnW, h: btnH, action: btn.action });
  });
}

// ── 觸控 ──
function hitTest(x, y, a) {
  return a && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h;
}

// ══════════════════════════════════════════
// ── 匯出介面 ──
// ══════════════════════════════════════════

const helicopterRace = {
  name: "helicopter",
  displayName: "直升機競賽",

  init(ctx, options) {
    _ctx = ctx;
    _w = options.canvasWidth;
    _h = options.canvasHeight;
    _audio = options.audioManager || null;
    _mode = options.mode || "single";

    const numP = _mode === "dual" ? 2 : 1;
    players = [];
    for (let i = 0; i < numP; i++) {
      players.push({
        height: 0, velocity: 0, currentIntensity: 0,
        twistHistory: [], lastHipDist: 0, baseHipDist: 0,
        color: HELI_COLORS[i], propellerAngle: 0,
      });
    }

    gameState = "countdown";
    countdown = 3;
    countdownTimer = Date.now();
    timeLeft = GAME_DURATION;
    lastFrameTime = 0;
    quitConfirmOpen = false;
    _resultButtons = [];
    _warningFired = false;
    initClouds();
  },

  update(allLandmarks, timestamp) {
    const now = Date.now();
    const dt = lastFrameTime ? (now - lastFrameTime) / 1000 : 0.016;
    lastFrameTime = now;

    if (gameState === "countdown") {
      countdown = 3 - (now - countdownTimer) / 1000;
      if (countdown <= 0) {
        gameState = "playing";
        if (_audio) _audio.playBGM("gameplay");
      }
      return;
    }

    if (gameState === "playing" && !quitConfirmOpen) {
      timeLeft -= dt;
      if (timeLeft <= WARNING_TIME && !_warningFired) {
        _warningFired = true;
        if (_audio) _audio.playSFXFromFile("sfx_time_warning");
      }
      if (timeLeft <= 0) {
        timeLeft = 0;
        gameState = "finished";
        if (_audio) {
          _audio.stopBGM(0);
          _audio.playSFXFromFile("sfx_heli_win");
        }
        return;
      }

      // 更新扭動強度
      players.forEach((p, i) => {
        if (allLandmarks && allLandmarks[i]) {
          p.currentIntensity = calcTwist(allLandmarks[i], p);
          if (p.currentIntensity > 0.5 && Math.random() < 0.02 && _audio) {
            _audio.playSFXFromFile("sfx_heli_boost");
          }
        } else {
          p.currentIntensity *= 0.9;
        }
      });

      updatePhysics(dt);
      players.forEach(p => {
        p.propellerAngle += (3 + p.currentIntensity * 15) * dt * 10;
      });
    }
  },

  render(ctx) {
    renderSky();
    renderClouds();
    renderCitySkyline();

    players.forEach((p, i) => {
      let heliX = _mode === "dual" ? (i === 0 ? _w * 0.3 : _w * 0.7) : _w / 2;
      const heliY = _h * 0.85 - (p.height / PHYSICS.maxHeight) * (_h * 0.7);
      drawHelicopter(heliX, heliY, p.color, p.propellerAngle, p.currentIntensity);
    });

    if (gameState === "countdown") { renderCountdown(); }
    else if (gameState === "playing") {
      renderHUD();
      if (quitConfirmOpen) renderQuitConfirm();
    }
    else if (gameState === "finished") { renderResults(); }
  },

  getScore() {
    return Math.round(players[0]?.height / PHYSICS.maxHeight * 100) || 0;
  },

  isGameOver() { return gameState === "finished"; },

  handleClick(x, y) {
    // 結算畫面按鈕
    if (gameState === "finished") {
      for (const btn of _resultButtons) {
        if (hitTest(x, y, btn)) return btn.action;
      }
      return null;
    }
    // 遊戲中
    if (gameState === "playing" && !quitConfirmOpen) {
      if (hitTest(x, y, quitBtnArea)) { quitConfirmOpen = true; return null; }
    }
    if (quitConfirmOpen) {
      if (hitTest(x, y, quitConfirmYes)) {
        gameState = "finished"; quitConfirmOpen = false;
        if (_audio) _audio.stopBGM(0);
        return null;
      }
      if (hitTest(x, y, quitConfirmNo)) { quitConfirmOpen = false; return null; }
    }
    return null;
  },

  destroy() { players = []; clouds = []; },
};

export default helicopterRace;
