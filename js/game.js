/**
 * game.js — 揮手打擊（體感遊戲主程式）
 * ------------------------------------------------------------
 * 玩法：鏡頭看到你 → 怪獸從上面掉下來 → 揮手打掉怪獸（藍/紫=+1、金色Boss=+5），
 *       不要打到紅色炸彈怪（-1 條命）。連續打中累積 Combo（連擊）。
 *
 * 這版新增：
 *   1. 真實怪獸美術（ChatGPT 生圖 + 自動去背）
 *   2. 「超人力霸王變身」：用身體關節點即時畫銀紅英雄裝，手臂跟著你動
 *   3. 雙手變成發光「光線」
 *
 * 設計原則：介面零中文（全符號）、6-10 歲、判定放寬、打中要爽。
 */

import { startCamera } from "./camera.js";
import { initPoseDetector, detect } from "./pose-detector.js";

// ===================== 基本元素 =====================
const video = document.getElementById("camera");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W = 0, H = 0;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ===================== 載入怪獸圖（去背過的透明 PNG） =====================
const SPRITE_SRC = {
  monster1: "IMAGE/sprites/monster1.png",
  monster2: "IMAGE/sprites/monster2.png",
  boss: "IMAGE/sprites/boss.png",
  bomb: "IMAGE/sprites/bomb.png",
};
const sprites = {};
for (const key in SPRITE_SRC) {
  const img = new Image();
  img.src = SPRITE_SRC[key];
  sprites[key] = img; // img.complete 為 true 時才畫，否則用備用圓圈
}

// ===================== 遊戲狀態 =====================
let state = "boot"; // boot → loading → playing → gameover
let score = 0, combo = 0, bestCombo = 0, lives = 3;

let targets = [];
let particles = [];
let hands = [];            // 雙手螢幕座標（打擊判定 + 畫光線）
let poseLandmarks = null;  // 最新整組關節點（畫英雄裝用）
let shake = 0, flash = null;

let spawnTimer = 0, spawnInterval = 0.85, fallSpeed = 0.28, elapsed = 0, lastTs = 0;

const shortSide = () => Math.min(W, H);
const HAND_R = () => shortSide() * 0.10;
const TARGET_R = () => shortSide() * 0.078;

// ===================== 音效（Web Audio 即時合成） =====================
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}
function beep(freq, dur = 0.12, type = "triangle", vol = 0.3) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}
function sndHit(c) { beep(520 + Math.min(c, 20) * 28, 0.10, "square", 0.25); }
function sndGold() { beep(880, 0.10, "triangle", 0.3); setTimeout(() => beep(1320, 0.14, "triangle", 0.3), 70); }
function sndBomb() { beep(90, 0.30, "sawtooth", 0.4); }

// ===================== 開始 / 重設 =====================
function resetGame() {
  score = 0; combo = 0; bestCombo = 0; lives = 3;
  targets = []; particles = []; shake = 0; flash = null;
  spawnTimer = 0; spawnInterval = 0.85; fallSpeed = 0.28; elapsed = 0;
}

let starting = false;
async function startGame() {
  if (starting) return;
  starting = true;
  state = "loading";
  try {
    initAudio();
    await startCamera(video);
    await initPoseDetector(1);
    resetGame();
    state = "playing";
  } catch (err) {
    console.error("啟動失敗：", err);
    state = "boot";
  }
  starting = false;
}

canvas.addEventListener("pointerdown", () => {
  if (state === "boot") startGame();
  else if (state === "gameover") { resetGame(); state = "playing"; }
});

// ===================== 生成目標 =====================
function spawnTarget() {
  const r = Math.random();
  let type = "normal", sprite = Math.random() < 0.5 ? "monster1" : "monster2";
  if (r < 0.12) { type = "bomb"; sprite = "bomb"; }
  else if (r < 0.27) { type = "gold"; sprite = "boss"; }
  const margin = TARGET_R() + 10;
  targets.push({
    x: margin + Math.random() * (W - margin * 2),
    y: -TARGET_R(),
    vy: fallSpeed * H * (0.85 + Math.random() * 0.4),
    type, sprite,
    wobble: Math.random() * Math.PI * 2,
    dead: false,
  });
}

// ===================== 粒子 =====================
function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, r: 3 + Math.random() * 5 });
  }
}

// ===================== 碰撞 =====================
function checkHits() {
  const hr = HAND_R(), tr = TARGET_R();
  for (const t of targets) {
    if (t.dead) continue;
    for (const h of hands) {
      const dx = h.x - t.x, dy = h.y - t.y;
      if (dx * dx + dy * dy < (hr + tr) * (hr + tr)) { hitTarget(t); break; }
    }
  }
}
function hitTarget(t) {
  t.dead = true;
  if (t.type === "bomb") {
    lives--; combo = 0; shake = 22; flash = { color: "255,60,60", a: 0.55 };
    burst(t.x, t.y, "#ff5252", 22); sndBomb();
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

  // 偵測身體
  const people = detect(video, performance.now());
  poseLandmarks = people.length > 0 ? people[0] : null;
  hands = [];
  if (poseLandmarks) {
    for (const idx of [15, 16, 19, 20]) { // 手腕 + 食指
      const p = poseLandmarks[idx];
      if (p && p.visibility > 0.3) hands.push({ x: (1 - p.x) * W, y: p.y * H });
    }
  }

  checkHits();

  for (const t of targets) {
    if (t.dead) continue;
    t.y += t.vy * dt;
    t.wobble += dt * 4;
    if (t.y - TARGET_R() > H) { t.dead = true; if (t.type !== "bomb") combo = 0; }
  }
  targets = targets.filter((t) => !t.dead);

  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6;
  }
  particles = particles.filter((p) => p.life > 0);

  if (shake > 0) shake = Math.max(0, shake - dt * 60);
  if (flash) { flash.a -= dt * 1.5; if (flash.a <= 0) flash = null; }
}

// ===================== 繪製：鏡頭 =====================
function drawCameraMirrored() {
  ctx.save();
  ctx.filter = "brightness(1.05) saturate(1.05)";
  ctx.scale(-1, 1);
  ctx.drawImage(video, -W, 0, W, H);
  ctx.restore();
  ctx.filter = "none";
}

// ===================== 繪製：超人力霸王變身（用關節點即時畫） =====================
// 顏色
const HERO_SILVER = "#cdd2da", HERO_SILVER_D = "#9aa1ab", HERO_RED = "#e8362a", HERO_EYE = "#fff27a";
// 取某關節點的螢幕座標（含鏡像）；visibility 太低回 null
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
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

function drawHero() {
  const sL = pt(11), sR = pt(12); // 雙肩
  if (!sL || !sR) return;          // 看不到肩膀就不畫
  const sw = Math.max(dist(sL, sR), shortSide() * 0.18); // 肩寬（當作整體比例）
  const armW = sw * 0.34;

  // ---- 軀幹 ----
  let hL = pt(23), hR = pt(24);
  if (!hL) hL = { x: sL.x, y: sL.y + sw * 1.2 };
  if (!hR) hR = { x: sR.x, y: sR.y + sw * 1.2 };
  ctx.save();
  ctx.fillStyle = HERO_SILVER;
  ctx.strokeStyle = HERO_SILVER_D; ctx.lineWidth = sw * 0.06; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(sL.x, sL.y); ctx.lineTo(sR.x, sR.y);
  ctx.lineTo(hR.x, hR.y); ctx.lineTo(hL.x, hL.y); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // 紅色中線
  const chest = mid(sL, sR), belly = mid(hL, hR);
  strokeLimb(chest, belly, sw * 0.16, HERO_RED);
  // 胸口能量計（會閃）
  const pulse = 0.6 + 0.4 * Math.sin(elapsed * 6);
  const ct = { x: chest.x * 0.5 + belly.x * 0.5, y: chest.y * 0.62 + belly.y * 0.38 };
  ctx.fillStyle = `rgba(80,200,255,${pulse})`;
  ctx.beginPath(); ctx.arc(ct.x, ct.y, sw * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ---- 手臂（跟著你的手動！）----
  strokeLimb(sL, pt(13), armW, HERO_SILVER); strokeLimb(pt(13), pt(15), armW * 0.9, HERO_SILVER);
  strokeLimb(sR, pt(14), armW, HERO_SILVER); strokeLimb(pt(14), pt(16), armW * 0.9, HERO_SILVER);
  // 手腕紅護腕
  for (const wi of [15, 16]) {
    const w = pt(wi);
    if (w) { ctx.fillStyle = HERO_RED; ctx.beginPath(); ctx.arc(w.x, w.y, armW * 0.55, 0, Math.PI * 2); ctx.fill(); }
  }

  // ---- 頭盔 ----
  const ears = mid(pt(7), pt(8));
  const head = ears || pt(0);
  if (head) {
    const hr = sw * 0.5;
    ctx.save();
    ctx.translate(head.x, head.y - hr * 0.2);
    // 銀色頭盔
    ctx.fillStyle = HERO_SILVER;
    ctx.strokeStyle = HERO_SILVER_D; ctx.lineWidth = hr * 0.12;
    ctx.beginPath(); ctx.ellipse(0, 0, hr, hr * 1.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 紅色頭冠鰭
    ctx.fillStyle = HERO_RED;
    ctx.beginPath();
    ctx.moveTo(0, -hr * 1.5); ctx.lineTo(hr * 0.22, -hr * 0.4); ctx.lineTo(-hr * 0.22, -hr * 0.4);
    ctx.closePath(); ctx.fill();
    // 發光眼睛
    ctx.fillStyle = HERO_EYE; ctx.shadowColor = HERO_EYE; ctx.shadowBlur = hr * 0.4;
    ctx.beginPath(); ctx.ellipse(-hr * 0.38, hr * 0.05, hr * 0.26, hr * 0.42, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hr * 0.38, hr * 0.05, hr * 0.26, hr * 0.42, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ===================== 繪製：目標怪獸 =====================
function drawTarget(t) {
  const tr = TARGET_R();
  const drawR = tr * 1.28; // 圖比判定圈稍大，看起來有份量
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(Math.sin(t.wobble) * 0.12);
  if (t.type === "bomb") { // 危險紅光
    ctx.save(); ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t.wobble * 2);
    ctx.fillStyle = "#ff1744"; ctx.beginPath(); ctx.arc(0, 0, drawR * 1.05, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const img = sprites[t.sprite];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -drawR, -drawR, drawR * 2, drawR * 2);
  } else {
    // 備用圓圈（圖還沒載入時）
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
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(h.x, h.y, hr, 0, Math.PI * 2); ctx.fill();
  }
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
}

function drawOverlayCircleButton(symbol) {
  const r = shortSide() * 0.16;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = r * 0.08; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = `${r * 1.1}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(symbol, W / 2, H / 2 + r * 0.05);
}
function drawBoot() {
  ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
  ctx.font = `${shortSide() * 0.2}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("👋", W / 2, H * 0.3);
  drawOverlayCircleButton("▶");
}
function drawLoading() {
  ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
  const r = shortSide() * 0.1, a = (performance.now() / 1000) * 4;
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = r * 0.18;
  ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#4fc3f7";
  ctx.beginPath(); ctx.arc(W / 2, H / 2, r, a, a + Math.PI * 1.2); ctx.stroke();
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
    drawHero();                       // 超人力霸王變身（在身上）
    for (const t of targets) drawTarget(t); // 怪獸（在英雄前面）
    drawParticles();
    drawHands();                      // 雙手光線（最上層）
    ctx.restore();
    if (flash) { ctx.fillStyle = `rgba(${flash.color},${flash.a})`; ctx.fillRect(0, 0, W, H); }
    drawHUD();
  } else if (state === "gameover") drawGameOver();

  requestAnimationFrame(loop);
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
requestAnimationFrame(loop);
