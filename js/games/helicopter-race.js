/**
 * helicopter-race.js — 直升機競賽迷你遊戲
 * 鏡頭實景背景，玩家扭動屁股讓直升機飛高，35 秒內比誰飛得高
 */

const DEBUG_MODE = false;

// ── 配色 ──
const C = {
  brand: "#C94FC8", accent: "#F5A623", success: "#1ABC9C",
  danger: "#FF4757", dark: "#2D3436", light: "#FDFEFE",
};

// ── 遊戲常數 ──
const GAME_DURATION = 35;
const WARNING_TIME = 5;

const HELI_COLORS = [
  { name: "紫紅", main: "#C94FC8", light: "#E080E0", dark: "#8B2D8B" },
  { name: "橙黃", main: "#F5A623", light: "#FFD080", dark: "#C07818" },
];

// ── 物理參數（幼兒適配，限制最大速度，強調持續搖動）──
const PHYSICS = {
  maxThrust:     2.5,    // 推力（大幅提高，確保搖動能上升）
  gravity:       0.3,    // 重力（低，停搖才緩慢下降）
  inertiaDecay:  0.95,   // 慣性（保持動量）
  maxVelocity:   1.2,    // 速度上限
  maxHeight:     0.85,   // 最高可達畫面 85%
};

// ── 偵測用 landmark 索引 ──
const DET = { hipL: 23, hipR: 24, shL: 11, shR: 12, hipVis: 0.3 };

// ── 圖片預載 ──
const heliImages = [];
["IMAGES/heli_p1.png", "IMAGES/heli_p2.png", "IMAGES/heli_p3.png", "IMAGES/heli_p4.png"].forEach((p, i) => {
  const img = new Image(); img.src = p; heliImages[i] = img;
});
const cloudImg = new Image(); cloudImg.src = "IMAGES/cloud.png";
const cityImg = new Image(); cityImg.src = "IMAGES/city_skyline.png";
const gogglesImg = new Image(); gogglesImg.src = "IMAGES/aviator_goggles.png";
const hulaImg = new Image(); hulaImg.src = "IMAGES/hula_hoop.png";

function imgReady(img) { return img && img.complete && img.naturalWidth > 0; }

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

// ══════════════════════════════════════════
// ── 遊戲狀態 ──
// ══════════════════════════════════════════

let _ctx, _w, _h, _audio, _mode;
let gameState = "countdown";
let countdown = 3, countdownTimer = 0;
let timeLeft = GAME_DURATION, lastFrameTime = 0;
let players = [];
let quitBtnArea = null, quitConfirmOpen = false;
let quitConfirmYes = null, quitConfirmNo = null;
let _resultButtons = [];
let _warningFired = false;
let _allLandmarks = [];
let _clouds = [];  // 雲朵裝飾

// ══════════════════════════════════════════
// ── 扭動偵測（屁股搖動速度）──
// ══════════════════════════════════════════

/**
 * 計算屁股搖動強度（僅偵測髖部 landmark 23/24）
 * 三種信號取最大值：左右晃、扭轉、上下跳
 * 同時記錄髖部螢幕座標供渲染標記用
 */
function calcTwist(landmarks, player) {
  if (!landmarks || landmarks.length < 25) return 0;

  const leftHip = landmarks[DET.hipL];
  const rightHip = landmarks[DET.hipR];

  // 髖部不可見 → 顯示提示，不 fallback 到肩膀
  const hipVis = Math.min(leftHip?.visibility ?? 0, rightHip?.visibility ?? 0);
  if (hipVis < 0.2 || !leftHip || !rightHip) {
    player.hipVisible = false;
    return 0;
  }
  player.hipVisible = true;

  // 記錄髖部螢幕座標（鏡像翻轉，用於渲染標記）
  player.hipScreenX = (1 - (leftHip.x + rightHip.x) / 2) * _w;
  player.hipScreenY = ((leftHip.y + rightHip.y) / 2) * _h;

  const centerX = (leftHip.x + rightHip.x) / 2;
  const centerY = (leftHip.y + rightHip.y) / 2;
  const dist = Math.abs(leftHip.x - rightHip.x);

  // 初始化
  if (player.lastCX === undefined) {
    player.lastCX = centerX;
    player.lastCY = centerY;
    player.lastDist = dist;
    return 0;
  }

  // 三種信號
  const dCX = Math.abs(centerX - player.lastCX);
  const dCY = Math.abs(centerY - player.lastCY);
  const dDist = Math.abs(dist - player.lastDist);
  player.lastCX = centerX;
  player.lastCY = centerY;
  player.lastDist = dist;

  const rawDelta = Math.max(dCX, dCY, dDist);
  if (rawDelta < 0.001) return 0;

  const now = Date.now();
  player.shakeHistory.push({ time: now, delta: rawDelta });
  player.shakeHistory = player.shakeHistory.filter(t => now - t.time < 1000);

  const avgDelta = player.shakeHistory.reduce((s, t) => s + t.delta, 0) / player.shakeHistory.length;
  const freq = 1 + Math.min(player.shakeHistory.length / 10, 1.0);
  const intensity = Math.min(avgDelta * freq * 250, 1.0);  // 高靈敏度

  return intensity;
}

// ══════════════════════════════════════════
// ── 物理更新 ──
// ══════════════════════════════════════════

function updatePhysics(dt) {
  players.forEach(p => {
    if (p.currentIntensity > 0.05) {
      // 搖動中：施加推進力
      p.velocity += p.currentIntensity * PHYSICS.maxThrust * dt;
    }
    // 重力（永遠向下拉）
    p.velocity -= PHYSICS.gravity * dt;
    // 慣性衰減
    p.velocity *= PHYSICS.inertiaDecay;
    // 限制最大速度（核心：避免一下飛上去）
    p.velocity = Math.max(-PHYSICS.maxVelocity, Math.min(PHYSICS.maxVelocity, p.velocity));

    p.height += p.velocity * dt;
    p.height = Math.max(0, Math.min(PHYSICS.maxHeight, p.height));
    if (p.height <= 0) p.velocity = Math.max(0, p.velocity);
  });
}

// ══════════════════════════════════════════
// ── 直升機繪製 ──
// ══════════════════════════════════════════

function drawHelicopter(ctx, x, y, color, propAngle, intensity, size = 50, playerIdx = 0) {
  const s = size;
  ctx.save();
  const wobble = Math.sin(Date.now() / 100) * intensity * 8;
  ctx.translate(x, y);
  ctx.rotate(wobble * Math.PI / 180);

  const img = heliImages[playerIdx];
  if (imgReady(img)) {
    // 圖片繪製（保持寬高比，寬度 = size * 2.2）
    const drawW = s * 2.2;
    const drawH = drawW * (img.naturalHeight / img.naturalWidth);
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.shadowColor = "transparent";
  } else {
    // Canvas fallback — 簡化版
    ctx.fillStyle = color.main;
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color.dark; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "white";
    ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.1, s * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.dark;
    ctx.beginPath(); ctx.arc(s * 0.22, -s * 0.1, s * 0.06, 0, Math.PI * 2); ctx.fill();
  }

  // 螺旋槳（圖片和 fallback 都畫，增加動態感）
  ctx.strokeStyle = color.light || "#ccc"; ctx.lineWidth = 4; ctx.lineCap = "round";
  const pLen = s * 0.9;
  ctx.beginPath();
  ctx.moveTo(Math.cos(propAngle) * -pLen, -s * 0.5);
  ctx.lineTo(Math.cos(propAngle) * pLen, -s * 0.5);
  ctx.stroke();

  // 速度線
  if (intensity > 0.2) {
    ctx.strokeStyle = `rgba(255,255,255,${intensity * 0.6})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const ly = -s * 0.2 + i * s * 0.2;
      const lx = -s * 0.8 - Math.random() * s * intensity;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - s * 0.4 * intensity, ly); ctx.stroke();
    }
  }
  ctx.restore();
}

// ══════════════════════════════════════════
// ── HUD ──
// ══════════════════════════════════════════

function renderHUD(ctx) {
  // 計時器（頂部中央）
  const timeColor = timeLeft <= WARNING_TIME ? C.danger : C.light;
  const sec = Math.ceil(timeLeft);
  const lastTen = sec <= 10;
  let timerScale = 1;
  if (lastTen) timerScale = 1 + 0.15 * Math.abs(Math.sin(Date.now() * 0.005));

  ctx.save();
  ctx.translate(_w / 2, 42);
  ctx.scale(timerScale, timerScale);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
  if (lastTen) { ctx.strokeStyle = C.danger; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.font = "bold 34px 'Arial Black', sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  outlinedText(ctx, `${sec}`, 0, 1, timeColor, C.dark, 3);
  ctx.restore();

  // 高度進度條（右側）
  const barW = 24, barH = _h * 0.65;
  const barX = _w - barW - 16, barY = (_h - barH) / 2;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  rrect(ctx, barX, barY, barW, barH, 12); ctx.fill();

  // 高度刻度線
  for (let i = 0; i <= 4; i++) {
    const y = barY + barH - (i / 4) * barH;
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(barX, y); ctx.lineTo(barX + barW, y); ctx.stroke();
  }

  players.forEach(p => {
    const prog = p.height / PHYSICS.maxHeight;
    const mY = barY + barH - (prog * barH);
    ctx.fillStyle = p.color.main;
    ctx.beginPath(); ctx.arc(barX + barW / 2, mY, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
  });
  ctx.font = "24px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("⭐", barX + barW / 2, barY - 18);

  // 搖動強度指示（底部，給小朋友看的回饋）
  players.forEach((p, i) => {
    const barW2 = _mode === "dual" ? _w * 0.35 : _w * 0.6;
    const barX2 = _mode === "dual" ? (i === 0 ? _w * 0.05 : _w * 0.55) : (_w - barW2) / 2;
    const barY2 = _h - 50;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    rrect(ctx, barX2, barY2, barW2, 20, 10); ctx.fill();

    const fillW = barW2 * p.currentIntensity;
    const intColor = p.currentIntensity > 0.6 ? C.danger : p.currentIntensity > 0.3 ? C.accent : C.success;
    ctx.fillStyle = intColor;
    rrect(ctx, barX2, barY2, fillW, 20, 10); ctx.fill();

    ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    outlinedText(ctx, "搖動力量！", barX2 + barW2 / 2, barY2 + 10, C.light, C.dark, 2);
  });

  // 提前結束按鈕
  const qs = 48, qx = 12, qy = 12;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.arc(qx + qs / 2, qy + qs / 2, qs / 2, 0, Math.PI * 2); ctx.fill();
  ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("✕", qx + qs / 2, qy + qs / 2);
  ctx.restore();
  quitBtnArea = { x: qx, y: qy, w: qs, h: qs };
}

function renderQuitConfirm(ctx) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, _w, _h);
  const boxW = Math.min(300, _w * 0.8), boxH = 180;
  const boxX = (_w - boxW) / 2, boxY = (_h - boxH) / 2;
  ctx.fillStyle = "rgba(45,52,54,0.95)";
  rrect(ctx, boxX, boxY, boxW, boxH, 20); ctx.fill();
  ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = "bold 24px 'Arial Black', sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  outlinedText(ctx, "確定要結束嗎？", _w / 2, boxY + 50, C.light, C.dark, 3);
  const bw = 100, bh = 44, by = boxY + boxH - 65;
  ctx.fillStyle = C.danger;
  rrect(ctx, _w / 2 - bw - 10, by, bw, bh, 12); ctx.fill();
  ctx.font = "bold 20px sans-serif";
  outlinedText(ctx, "結束", _w / 2 - bw / 2 - 10, by + bh / 2, C.light, C.dark, 2);
  quitConfirmYes = { x: _w / 2 - bw - 10, y: by, w: bw, h: bh };
  ctx.fillStyle = C.success;
  rrect(ctx, _w / 2 + 10, by, bw, bh, 12); ctx.fill();
  outlinedText(ctx, "繼續", _w / 2 + 10 + bw / 2, by + bh / 2, C.light, C.dark, 2);
  quitConfirmNo = { x: _w / 2 + 10, y: by, w: bw, h: bh };
}

function renderCountdown(ctx) {
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, 0, _w, _h);
  const num = Math.ceil(countdown);
  const scale = 1 + (countdown % 1) * 0.3;
  ctx.save();
  ctx.translate(_w / 2, _h / 2); ctx.scale(scale, scale);
  ctx.font = "bold 120px 'Arial Black', sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  outlinedText(ctx, num > 0 ? num.toString() : "GO!", 0, 0, C.accent, C.dark, 6);
  ctx.restore();

  // 提示文字
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  outlinedText(ctx, "搖動屁股讓直升機飛起來！", _w / 2, _h * 0.7, C.light, C.dark, 3);
}

function renderResults(ctx) {
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, _w, _h);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  if (_mode === "dual") {
    const winner = players[0].height >= players[1].height ? 0 : 1;
    const tie = Math.abs(players[0].height - players[1].height) < 0.01;

    ctx.font = "bold 48px 'Arial Black', sans-serif";
    if (tie) {
      outlinedText(ctx, "🤝 平手！", _w / 2, _h * 0.15, C.success, C.dark, 5);
    } else {
      outlinedText(ctx, `👑 玩家 ${winner + 1} 贏了！`, _w / 2, _h * 0.15, players[winner].color.main, C.dark, 5);
    }

    drawHelicopter(ctx, _w / 2, _h * 0.32, players[winner].color, Date.now() / 50, 0.5, 120, winner);

    ctx.font = "bold 24px sans-serif";
    const p1P = Math.round(players[0].height / PHYSICS.maxHeight * 100);
    const p2P = Math.round(players[1].height / PHYSICS.maxHeight * 100);
    outlinedText(ctx, `玩家 1: ${p1P}%`, _w / 2, _h * 0.50, players[0].color.main, C.dark, 3);
    outlinedText(ctx, `玩家 2: ${p2P}%`, _w / 2, _h * 0.56, players[1].color.main, C.dark, 3);
  } else {
    const pct = Math.round(players[0].height / PHYSICS.maxHeight * 100);
    const msg = pct >= 80 ? "🌟 太厲害了！" : pct >= 50 ? "👍 很不錯！" : "💪 再試一次！";
    const msgC = pct >= 80 ? C.accent : pct >= 50 ? C.success : C.brand;
    ctx.font = "bold 48px 'Arial Black', sans-serif";
    outlinedText(ctx, msg, _w / 2, _h * 0.15, msgC, C.dark, 5);
    drawHelicopter(ctx, _w / 2, _h * 0.32, players[0].color, Date.now() / 50, 0.3, 120, 0);
    ctx.font = "bold 64px 'Arial Black', sans-serif";
    outlinedText(ctx, `${pct}%`, _w / 2, _h * 0.50, C.light, C.dark, 5);
    ctx.font = "bold 20px sans-serif";
    outlinedText(ctx, "到達高度", _w / 2, _h * 0.58, "rgba(255,255,255,0.6)", C.dark, 2);
  }

  // 鼓勵
  const msgs = ["你好棒！", "超厲害！", "繼續加油！", "小飛行員！", "太強了！"];
  ctx.font = "bold 44px 'Arial Black', sans-serif";
  outlinedText(ctx, msgs[Math.floor(Date.now() / 5000) % msgs.length], _w / 2, _h * 0.65, C.accent, C.dark, 4);

  // 按鈕
  _resultButtons = [];
  const btnW = Math.min(280, _w * 0.65), btnH = 88, btnGap = 20;
  const btnY = _h * 0.75, cx = _w / 2;
  [
    { label: "🔄 再玩一次", color: C.accent, action: "replay", x: cx - btnW - btnGap / 2 },
    { label: "🏠 回到選單", color: C.brand, action: "menu", x: cx + btnGap / 2 },
  ].forEach(btn => {
    ctx.save();
    ctx.fillStyle = btn.color;
    rrect(ctx, btn.x, btnY, btnW, btnH, 20); ctx.fill();
    ctx.font = "bold 44px 'Arial Black', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    outlinedText(ctx, btn.label, btn.x + btnW / 2, btnY + btnH / 2, C.light);
    ctx.restore();
    _resultButtons.push({ x: btn.x, y: btnY, w: btnW, h: btnH, action: btn.action });
  });
}

// ══════════════════════════════════════════
// ── 匯出介面 ──
// ══════════════════════════════════════════

function hitTest(x, y, a) {
  return a && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h;
}

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
        shakeHistory: [],
        lastCX: undefined, lastCY: undefined, lastDist: undefined,
        hipVisible: false, hipScreenX: 0, hipScreenY: 0,
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

    // 初始化雲朵
    _clouds = [];
    for (let i = 0; i < 10; i++) {
      _clouds.push({
        x: Math.random() * _w,
        baseY: Math.random() * _h * 1.5 - _h * 0.3,
        size: 60 + Math.random() * 80,
        opacity: 0.3 + Math.random() * 0.4,
        speed: 0.2 + Math.random() * 0.3, // 水平飄移速度
        layer: Math.floor(Math.random() * 3), // 0=近, 1=中, 2=遠
      });
    }
  },

  update(allLandmarks, timestamp) {
    const now = Date.now();
    const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.05) : 0.016;
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

      // 儲存 landmarks 供渲染用
      _allLandmarks = allLandmarks || [];

      // 更新扭動強度
      players.forEach((p, i) => {
        if (allLandmarks && allLandmarks[i]) {
          p.currentIntensity = calcTwist(allLandmarks[i], p);
        } else {
          p.currentIntensity *= 0.85;
        }
      });

      updatePhysics(dt);

      // 螺旋槳轉速
      players.forEach(p => {
        p.propellerAngle += (3 + p.currentIntensity * 15) * dt * 10;
      });
    }
  },

  render(ctx) {
    // 鏡頭畫面已由 main.js 繪製，這裡疊加遊戲元素
    // 輕微暗化讓遊戲元素更清晰
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, _w, _h);

    // 雲朵裝飾（視差捲動 + 水平飄移）
    const maxH = players.length > 0 ? Math.max(...players.map(p => p.height)) : 0;
    _clouds.forEach(c => {
      c.x += c.speed;
      if (c.x > _w + c.size) c.x = -c.size;
      const parallax = 0.2 + c.layer * 0.25;
      const screenY = c.baseY + maxH * _h * parallax;
      if (screenY < -c.size || screenY > _h + c.size) return;

      ctx.save();
      ctx.globalAlpha = c.opacity + 0.2; // 提高可見度
      ctx.fillStyle = "white";
      ctx.shadowColor = "rgba(255,255,255,0.5)";
      ctx.shadowBlur = 15;

      // 用多個圓形組合成蓬鬆雲朵
      const s = c.size;
      ctx.beginPath();
      ctx.arc(c.x, screenY, s * 0.45, 0, Math.PI * 2);
      ctx.arc(c.x - s * 0.35, screenY + s * 0.05, s * 0.32, 0, Math.PI * 2);
      ctx.arc(c.x + s * 0.35, screenY + s * 0.05, s * 0.32, 0, Math.PI * 2);
      ctx.arc(c.x - s * 0.15, screenY - s * 0.2, s * 0.28, 0, Math.PI * 2);
      ctx.arc(c.x + s * 0.15, screenY - s * 0.15, s * 0.28, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.restore();
    });

    // AR 裝飾 + 屁股偵測標記
    if (gameState === "playing" || gameState === "countdown") {
      players.forEach((p, i) => {
        const lm = _allLandmarks[i];

        // ── 飛行員護目鏡（改用肩膀定位，避免臉不在畫面時不��示）──
        if (lm && imgReady(gogglesImg)) {
          const lSh = lm[11], rSh = lm[12];
          if (lSh && rSh && lSh.visibility > 0.2 && rSh.visibility > 0.2) {
            const shoulderCX = (1 - (lSh.x + rSh.x) / 2) * _w;
            const shoulderCY = ((lSh.y + rSh.y) / 2) * _h;
            const shoulderW = Math.abs(lSh.x - rSh.x) * _w;

            const gogglesW = shoulderW * 0.55;
            const gogglesH = gogglesW * (gogglesImg.naturalHeight / gogglesImg.naturalWidth);
            const gogglesY = shoulderCY - shoulderW * 0.85; // 肩膀上方約一個肩寬

            ctx.save();
            ctx.drawImage(gogglesImg, shoulderCX - gogglesW / 2, gogglesY - gogglesH / 2, gogglesW, gogglesH);
            ctx.restore();
          }
        }

        // ── 呼啦圈（Canvas 繪製彩色橢圓，環住腰部）──
        if (p.hipVisible) {
          const lHip = lm ? lm[DET.hipL] : null;
          const rHip = lm ? lm[DET.hipR] : null;
          const lSh = lm ? lm[11] : null;
          const rSh = lm ? lm[12] : null;

          // 根據肩寬計算呼啦圈尺寸（肩寬 × 1.3）
          let hulaW = 350;
          if (lSh && rSh && lSh.visibility > 0.2 && rSh.visibility > 0.2) {
            hulaW = Math.abs(lSh.x - rSh.x) * _w * 1.3;
          }
          hulaW = Math.max(hulaW, 300);
          const hulaH = hulaW * 0.35;

          // 傾斜角度
          let tiltAngle = 0;
          if (lHip && rHip) {
            tiltAngle = Math.max(-0.5, Math.min(0.5, (lHip.y - rHip.y) * 5));
          }
          tiltAngle += Math.sin(Date.now() / 150) * p.currentIntensity * 0.3;

          ctx.save();
          ctx.translate(p.hipScreenX, p.hipScreenY);
          ctx.rotate(tiltAngle);

          // 繪製多圈彩色條紋呼啦圈
          const colors = ["#FF69B4", "#FFD700", "#00BFFF", "#32CD32", "#FF6347", "#9370DB"];
          const ringWidth = 12;
          for (let r = 0; r < colors.length; r++) {
            ctx.strokeStyle = colors[r];
            ctx.lineWidth = ringWidth;
            ctx.beginPath();
            ctx.ellipse(0, 0, hulaW / 2 - r * 3, hulaH / 2 - r * 1.5, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          // 外圈白色高光
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(0, 0, hulaW / 2 + 2, hulaH / 2 + 1, 0, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
        }
      });

      // 髖部不可見提示
      const anyHipMissing = players.some(p => !p.hipVisible);
      if (anyHipMissing && gameState === "playing") {
        ctx.save();
        ctx.font = "bold 28px 'Arial Black', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const flash = 0.6 + Math.sin(Date.now() * 0.005) * 0.4;
        ctx.globalAlpha = flash;
        outlinedText(ctx, "📷 請站遠一點，讓鏡頭拍到屁股！", _w / 2, _h * 0.5, C.accent, C.dark, 3);
        ctx.restore();
      }
    }

    // 城市天際線（底部固定，連續鋪滿）
    if (imgReady(cityImg)) {
      const cityH = _h * 0.22;
      const cityW = cityH * (cityImg.naturalWidth / cityImg.naturalHeight);
      ctx.save();
      ctx.globalAlpha = 0.5;
      let ox = 0;
      while (ox < _w) {
        ctx.drawImage(cityImg, ox, _h - cityH, cityW, cityH);
        ox += cityW - 1; // -1 避免接縫間隙
      }
      ctx.restore();
    }

    // 直升機
    players.forEach((p, i) => {
      const heliX = _mode === "dual" ? (i === 0 ? _w * 0.3 : _w * 0.7) : _w / 2;
      const heliY = _h * 0.88 - (p.height / PHYSICS.maxHeight) * (_h * 0.75);
      const heliSize = 120 + p.currentIntensity * 20;
      drawHelicopter(ctx, heliX, heliY, p.color, p.propellerAngle, p.currentIntensity, heliSize, i);

      // 玩家標籤
      if (_mode === "dual") {
        ctx.font = "bold 18px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        outlinedText(ctx, `P${i + 1}`, heliX, heliY + 40, p.color.main, C.dark, 2);
      }
    });

    // 雙人分隔線
    if (_mode === "dual" && gameState === "playing") {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.moveTo(_w / 2, 0); ctx.lineTo(_w / 2, _h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (gameState === "countdown") { renderCountdown(ctx); }
    else if (gameState === "playing") {
      renderHUD(ctx);
      if (quitConfirmOpen) renderQuitConfirm(ctx);
    }
    else if (gameState === "finished") { renderResults(ctx); }
  },

  getScore() {
    return Math.round(players[0]?.height / PHYSICS.maxHeight * 100) || 0;
  },

  isGameOver() { return gameState === "finished"; },

  handleClick(x, y) {
    if (gameState === "finished") {
      for (const btn of _resultButtons) {
        if (hitTest(x, y, btn)) return btn.action;
      }
      return null;
    }
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

  destroy() { players = []; },
};

export default helicopterRace;
