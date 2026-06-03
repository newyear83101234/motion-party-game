/**
 * game.js — 揮手打擊（體感遊戲主程式）
 * ------------------------------------------------------------
 * 玩法：鏡頭看到你 → 怪獸掉下來 → 揮手打掉（藍/紫=+1、金Boss=+5），
 *       不要打到紅炸彈怪（-1 命）。連續打中累積 Combo。
 *
 * 這版重點：
 *   1. 超人變身「不遮臉」（開放式頭盔，看得到小朋友的臉）
 *   2. 背景音樂自動播放 + 左下角靜音鈕
 *   3. 炸彈變大一點
 *   4. 打到炸彈：全螢幕 💥 特效（小孩一定看得到）
 */

import { startCamera } from "./camera.js";
import { initPoseDetector, detect } from "./pose-detector.js";

// ===================== 基本元素 =====================
const video = document.getElementById("camera");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W = 0, H = 0;
function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
window.addEventListener("resize", resize);
resize();

// ===================== 怪獸圖（去背透明 PNG） =====================
const SPRITE_SRC = {
  monster1: "IMAGE/sprites/monster1.png",
  monster2: "IMAGE/sprites/monster2.png",
  boss: "IMAGE/sprites/boss.png",
  bomb: "IMAGE/sprites/bomb.png",
};
const sprites = {};
for (const key in SPRITE_SRC) { const img = new Image(); img.src = SPRITE_SRC[key]; sprites[key] = img; }

// ===================== 背景音樂 =====================
const bgm = new Audio("MUSIC/theme.mp3");
bgm.loop = true;
bgm.volume = 0.5;
let muted = false;

// ===================== 遊戲狀態 =====================
let state = "boot";
let score = 0, combo = 0, bestCombo = 0, lives = 3;
let targets = [], particles = [], hands = [], poseLandmarks = null;
let shake = 0, bombFx = 0; // bombFx：打到炸彈的全螢幕特效計時（1→0）
let spawnTimer = 0, spawnInterval = 0.85, fallSpeed = 0.28, elapsed = 0, lastTs = 0;

const shortSide = () => Math.min(W, H);
const HAND_R = () => shortSide() * 0.10;
const TARGET_R = () => shortSide() * 0.078;
const tRadius = (t) => TARGET_R() * (t.scale || 1); // 每隻怪自己的半徑（炸彈較大）

// ===================== 音效 =====================
let audioCtx = null;
function initAudio() {
  if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; audioCtx = new AC(); }
  if (audioCtx.state === "suspended") audioCtx.resume();
}
function beep(freq, dur = 0.12, type = "triangle", vol = 0.3) {
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t); osc.stop(t + dur);
}
function sndHit(c) { beep(520 + Math.min(c, 20) * 28, 0.10, "square", 0.25); }
function sndGold() { beep(880, 0.10, "triangle", 0.3); setTimeout(() => beep(1320, 0.14, "triangle", 0.3), 70); }
function sndBomb() { beep(120, 0.35, "sawtooth", 0.45); beep(60, 0.5, "square", 0.4); setTimeout(() => beep(80, 0.3, "sawtooth", 0.35), 120); }

// ===================== 開始 / 重設 =====================
function resetGame() {
  score = 0; combo = 0; bestCombo = 0; lives = 3;
  targets = []; particles = []; shake = 0; bombFx = 0;
  spawnTimer = 0; spawnInterval = 0.85; fallSpeed = 0.28; elapsed = 0;
}
function playBgm() { bgm.muted = muted; bgm.play().catch(() => {}); }

let starting = false;
async function startGame() {
  if (starting) return;
  starting = true; state = "loading";
  try {
    initAudio();
    await startCamera(video);
    await initPoseDetector(1);
    resetGame();
    playBgm();
    state = "playing";
  } catch (err) { console.error("啟動失敗：", err); state = "boot"; }
  starting = false;
}

canvas.addEventListener("pointerdown", (e) => {
  if (state === "boot") { startGame(); return; }
  if (state === "gameover") { resetGame(); playBgm(); state = "playing"; return; }
  if (state === "playing") {
    // 左下角靜音鈕
    const r = shortSide() * 0.06, pad = shortSide() * 0.04, cx = pad + r, cy = H - pad - r;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if ((px - cx) ** 2 + (py - cy) ** 2 < r * r) { muted = !muted; bgm.muted = muted; }
  }
});

// ===================== 生成目標 =====================
function spawnTarget() {
  const r = Math.random();
  let type = "normal", sprite = Math.random() < 0.5 ? "monster1" : "monster2", scale = 1;
  if (r < 0.12) { type = "bomb"; sprite = "bomb"; scale = 1.3; }      // 炸彈大一點
  else if (r < 0.27) { type = "gold"; sprite = "boss"; scale = 1.1; } // Boss 稍大
  const margin = TARGET_R() * scale + 10;
  targets.push({
    x: margin + Math.random() * (W - margin * 2), y: -TARGET_R() * scale,
    vy: fallSpeed * H * (0.85 + Math.random() * 0.4),
    type, sprite, scale, wobble: Math.random() * Math.PI * 2, dead: false,
  });
}

// ===================== 粒子 =====================
function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 320;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, r: 3 + Math.random() * 5 });
  }
}

// ===================== 碰撞 =====================
function checkHits() {
  const hr = HAND_R();
  for (const t of targets) {
    if (t.dead) continue;
    const tr = tRadius(t);
    for (const h of hands) {
      const dx = h.x - t.x, dy = h.y - t.y;
      if (dx * dx + dy * dy < (hr + tr) * (hr + tr)) { hitTarget(t); break; }
    }
  }
}
function hitTarget(t) {
  t.dead = true;
  if (t.type === "bomb") {
    lives--; combo = 0; shake = 28; bombFx = 1; // 觸發全螢幕特效
    burst(t.x, t.y, "#ff5252", 26); sndBomb();
    if (lives <= 0) state = "gameover";
    return;
  }
  combo++; bestCombo = Math.max(bestCombo, combo);
  const gain = t.type === "gold" ? 5 : 1;
  score += gain * (1 + Math.floor(combo / 5));
  shake = Math.min(14, 6 + combo * 0.3);
  if (t.type === "gold") { burst(t.x, t.y, "#ffd54a", 20); sndGold(); }
  else { burst(t.x, t.y, "#4fc3f7", 14); sndHit(combo); }
}

// ===================== 更新 =====================
function update(dt) {
  elapsed += dt;
  const lvl = Math.floor(elapsed / 12);
  spawnInterval = Math.max(0.32, 0.85 - lvl * 0.08);
  fallSpeed = 0.28 + lvl * 0.05;
  spawnTimer -= dt;
  if (spawnTimer <= 0) { spawnTarget(); spawnTimer = spawnInterval; }

  const people = detect(video, performance.now());
  poseLandmarks = people.length > 0 ? people[0] : null;
  hands = [];
  if (poseLandmarks) {
    for (const idx of [15, 16, 19, 20]) {
      const p = poseLandmarks[idx];
      if (p && p.visibility > 0.3) hands.push({ x: (1 - p.x) * W, y: p.y * H });
    }
  }
  checkHits();

  for (const t of targets) {
    if (t.dead) continue;
    t.y += t.vy * dt; t.wobble += dt * 4;
    if (t.y - tRadius(t) > H) { t.dead = true; if (t.type !== "bomb") combo = 0; }
  }
  targets = targets.filter((t) => !t.dead);

  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
  particles = particles.filter((p) => p.life > 0);

  if (shake > 0) shake = Math.max(0, shake - dt * 60);
  if (bombFx > 0) bombFx = Math.max(0, bombFx - dt * 1.6); // 約 0.6 秒
}

// ===================== 繪製：鏡頭 =====================
function drawCameraMirrored() {
  ctx.save(); ctx.filter = "brightness(1.05) saturate(1.05)";
  ctx.scale(-1, 1); ctx.drawImage(video, -W, 0, W, H);
  ctx.restore(); ctx.filter = "none";
}

// ===================== 繪製：超人變身（開放式頭盔、不遮臉） =====================
const HERO_SILVER = "#cdd2da", HERO_SILVER_D = "#9aa1ab", HERO_RED = "#e8362a";
function pt(i) {
  if (!poseLandmarks) return null;
  const p = poseLandmarks[i];
  if (!p || p.visibility < 0.3) return null;
  return { x: (1 - p.x) * W, y: p.y * H };
}
function mid(a, b) { return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function strokeLimb(a, b, width, color) {
  if (!a || !b) return;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

function drawHero() {
  const sL = pt(11), sR = pt(12);
  if (!sL || !sR) return;
  const sw = Math.max(dist(sL, sR), shortSide() * 0.18), armW = sw * 0.34;

  // ---- 軀幹 ----
  let hL = pt(23), hR = pt(24);
  if (!hL) hL = { x: sL.x, y: sL.y + sw * 1.2 };
  if (!hR) hR = { x: sR.x, y: sR.y + sw * 1.2 };
  ctx.save();
  ctx.fillStyle = HERO_SILVER; ctx.strokeStyle = HERO_SILVER_D; ctx.lineWidth = sw * 0.06; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(sL.x, sL.y); ctx.lineTo(sR.x, sR.y); ctx.lineTo(hR.x, hR.y); ctx.lineTo(hL.x, hL.y); ctx.closePath();
  ctx.fill(); ctx.stroke();
  const chest = mid(sL, sR), belly = mid(hL, hR);
  strokeLimb(chest, belly, sw * 0.16, HERO_RED);
  const pulse = 0.6 + 0.4 * Math.sin(elapsed * 6);
  const cTimer = { x: chest.x * 0.5 + belly.x * 0.5, y: chest.y * 0.62 + belly.y * 0.38 };
  ctx.fillStyle = `rgba(80,200,255,${pulse})`;
  ctx.beginPath(); ctx.arc(cTimer.x, cTimer.y, sw * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ---- 手臂（跟著你的手動）----
  strokeLimb(sL, pt(13), armW, HERO_SILVER); strokeLimb(pt(13), pt(15), armW * 0.9, HERO_SILVER);
  strokeLimb(sR, pt(14), armW, HERO_SILVER); strokeLimb(pt(14), pt(16), armW * 0.9, HERO_SILVER);
  for (const wi of [15, 16]) {
    const w = pt(wi);
    if (w) { ctx.fillStyle = HERO_RED; ctx.beginPath(); ctx.arc(w.x, w.y, armW * 0.55, 0, Math.PI * 2); ctx.fill(); }
  }

  // ---- 開放式頭盔（只框住臉的「上方+兩側」，中間留空看得到臉）----
  const earL = pt(7), earR = pt(8), nose = pt(0);
  const head = mid(earL, earR) || nose;
  if (head) {
    let fw = (earL && earR) ? dist(earL, earR) : sw * 0.5;
    fw = Math.max(fw, sw * 0.35);
    const ang = (earL && earR) ? Math.atan2(earR.y - earL.y, earR.x - earL.x) : 0;
    const half = fw / 2;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(ang);
    // 兩側護頰（在臉的左右外側，不蓋中間）
    ctx.fillStyle = HERO_SILVER; ctx.strokeStyle = HERO_SILVER_D; ctx.lineWidth = fw * 0.05;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * half * 1.02, 0, fw * 0.17, fw * 0.5, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // 額頭橫帶（在眼睛上方，不蓋眼睛）
    ctx.beginPath();
    ctx.moveTo(-half, -fw * 0.30);
    ctx.quadraticCurveTo(0, -fw * 0.92, half, -fw * 0.30);
    ctx.quadraticCurveTo(0, -fw * 0.55, -half, -fw * 0.30);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 紅色頭冠鰭
    ctx.fillStyle = HERO_RED;
    ctx.beginPath();
    ctx.moveTo(0, -fw * 1.35); ctx.lineTo(fw * 0.16, -fw * 0.6); ctx.lineTo(-fw * 0.16, -fw * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ===================== 繪製：怪獸 =====================
function drawTarget(t) {
  const tr = tRadius(t), drawR = tr * 1.28;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(Math.sin(t.wobble) * 0.12);
  if (t.type === "bomb") {
    ctx.save(); ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t.wobble * 2);
    ctx.fillStyle = "#ff1744"; ctx.beginPath(); ctx.arc(0, 0, drawR * 1.08, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const img = sprites[t.sprite];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -drawR, -drawR, drawR * 2, drawR * 2);
  } else {
    ctx.fillStyle = t.type === "gold" ? "#f6a609" : t.type === "bomb" ? "#222" : "#0288d1";
    ctx.beginPath(); ctx.arc(0, 0, tr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ===================== 繪製：雙手光線 =====================
function drawHands() {
  for (const h of hands) {
    const hr = HAND_R();
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, hr);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.4, "rgba(120,220,255,0.6)");
    g.addColorStop(1, "rgba(120,220,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, hr, 0, Math.PI * 2); ctx.fill();
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ===================== 全螢幕炸彈特效 =====================
function drawBombFx() {
  if (bombFx <= 0) return;
  const k = bombFx; // 1 → 0
  ctx.fillStyle = `rgba(220,30,30,${0.55 * k})`;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.strokeStyle = `rgba(255,255,255,${0.5 * k})`; ctx.lineWidth = shortSide() * 0.012;
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(shortSide() * 0.75 * (1.25 - k), 0); ctx.stroke(); }
  ctx.restore();
  ctx.font = `${shortSide() * (0.35 + (1 - k) * 0.18)}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.globalAlpha = Math.min(1, k * 1.6);
  ctx.fillText("💥", W / 2, H / 2);
  ctx.globalAlpha = 1;
}

// ===================== HUD =====================
function drawHUD() {
  const pad = shortSide() * 0.04, fs = shortSide() * 0.07;
  ctx.textBaseline = "top"; ctx.font = `${fs}px sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 8; ctx.fillStyle = "#fff";
  ctx.textAlign = "left"; ctx.fillText("⭐ " + score, pad, pad);
  ctx.textAlign = "right"; ctx.fillText("❤️".repeat(Math.max(0, lives)), W - pad, pad);
  ctx.shadowBlur = 0;
  if (combo >= 2) {
    const big = shortSide() * (0.12 + Math.min(combo, 30) * 0.004);
    ctx.font = `bold ${big}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffeb3b"; ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 12;
    ctx.fillText("✕" + combo, W / 2, H * 0.16); ctx.shadowBlur = 0;
  }
  // 左下角靜音鈕
  const r = shortSide() * 0.06, cx = pad + r, cy = H - pad - r;
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.font = `${r * 1.05}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(muted ? "🔇" : "🔊", cx, cy + r * 0.05);
}

function drawOverlayCircleButton(symbol) {
  const r = shortSide() * 0.16;
  ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = r * 0.08; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = `${r * 1.1}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(symbol, W / 2, H / 2 + r * 0.05);
}
function drawBoot() {
  ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
  ctx.font = `${shortSide() * 0.2}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("👋", W / 2, H * 0.3); drawOverlayCircleButton("▶");
}
function drawLoading() {
  ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
  const r = shortSide() * 0.1, a = (performance.now() / 1000) * 4;
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = r * 0.18;
  ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#4fc3f7"; ctx.beginPath(); ctx.arc(W / 2, H / 2, r, a, a + Math.PI * 1.2); ctx.stroke();
}
function drawGameOver() {
  drawCameraMirrored();
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `bold ${shortSide() * 0.18}px sans-serif`; ctx.fillText("⭐ " + score, W / 2, H * 0.32);
  ctx.font = `${shortSide() * 0.08}px sans-serif`; ctx.fillStyle = "#ffeb3b";
  ctx.fillText("✕" + bestCombo, W / 2, H * 0.46);
  drawOverlayCircleButton("🔁");
}

// ===================== 主迴圈 =====================
function loop(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
  lastTs = ts;
  if (state === "boot") drawBoot();
  else if (state === "loading") drawLoading();
  else if (state === "playing") {
    update(dt);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawCameraMirrored();
    drawHero();
    for (const t of targets) drawTarget(t);
    drawParticles();
    drawHands();
    ctx.restore();
    drawBombFx();   // 全螢幕特效（在最上層，一定看得到）
    drawHUD();
  } else if (state === "gameover") drawGameOver();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
