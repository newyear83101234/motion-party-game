/**
 * game.js — 揮手打擊（體感遊戲主程式）
 * ------------------------------------------------------------
 * 玩法：鏡頭看到你 → 東西從上面掉下來 → 揮手打到藍球(+1)、金球(+5)，
 *       但不要打到炸彈(-1 條命)。連續打中會累積 Combo（連擊）。
 *
 * 設計原則（這次和舊專案不一樣的地方）：
 *   1. 介面零中文，全部用符號 / 數字（⭐ ❤️ ✕ ▶ 🔁）
 *   2. 打中要「爽」：爆炸粒子 + 畫面震動 + 音效，三件一起發生
 *   3. 對 6-10 歲：判定放很寬、失敗容忍度高（只有打到炸彈才扣命）
 *   4. 越玩越快，製造心跳感
 *
 * 目前是「階段 1」：用色塊當佔位圖，先確認手感。美術 / 音樂之後再換。
 */

import { startCamera } from "./camera.js";
import { initPoseDetector, detect } from "./pose-detector.js";

// ===================== 基本元素 =====================
const video = document.getElementById("camera");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W = 0, H = 0; // 畫面寬高（像素）
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ===================== 遊戲狀態 =====================
// boot（點擊開始）→ loading（載入模型）→ playing（遊戲中）→ gameover（結束）
let state = "boot";

let score = 0;
let combo = 0;
let bestCombo = 0;
let lives = 3;

let targets = [];     // 掉落的目標
let particles = [];   // 爆炸粒子
let hands = [];       // 偵測到的雙手位置 [{x, y}]
let shake = 0;        // 畫面震動強度
let flash = null;     // 全畫面閃光（打到炸彈時變紅）

let spawnTimer = 0;        // 距離下一次生成的倒數（秒）
let spawnInterval = 0.85;  // 生成間隔（會越來越短）
let fallSpeed = 0.28;      // 掉落速度（畫面高度比例/秒，會越來越快）
let elapsed = 0;           // 已玩秒數
let lastTs = 0;            // 上一影格時間戳

// 手的判定半徑 / 目標半徑（用畫面短邊比例，確保各種手機一致）
const shortSide = () => Math.min(W, H);
const HAND_R = () => shortSide() * 0.10;   // 手的判定圈（放很大，小孩好打中）
const TARGET_R = () => shortSide() * 0.075; // 目標半徑

// ===================== 音效（Web Audio 即時合成，不需音檔） =====================
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}
/** 播一個簡單的音 */
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
function sndHit(comboLevel) {
  // 連擊越高，音越高，越有「往上爬」的爽感
  beep(520 + Math.min(comboLevel, 20) * 28, 0.10, "square", 0.25);
}
function sndGold() {
  beep(880, 0.10, "triangle", 0.3);
  setTimeout(() => beep(1320, 0.14, "triangle", 0.3), 70);
}
function sndBomb() {
  beep(90, 0.30, "sawtooth", 0.4);
}

// ===================== 開始 / 重設 =====================
function resetGame() {
  score = 0; combo = 0; bestCombo = 0; lives = 3;
  targets = []; particles = []; shake = 0; flash = null;
  spawnTimer = 0; spawnInterval = 0.85; fallSpeed = 0.28; elapsed = 0;
}

// 第一次點擊：要在使用者手勢裡開相機 + 音效（iOS 規定）
let starting = false;
async function startGame() {
  if (starting) return;
  starting = true;
  state = "loading";
  try {
    initAudio();                 // 解鎖音效
    await startCamera(video);    // 開鏡頭（會跳權限視窗）
    await initPoseDetector(1);   // 載入姿勢模型（這步最久，3~10 秒）
    resetGame();
    state = "playing";
  } catch (err) {
    console.error("啟動失敗：", err);
    state = "boot"; // 失敗就回到開始畫面讓他再點一次
  }
  starting = false;
}

// 點擊處理：依狀態決定行為
canvas.addEventListener("pointerdown", () => {
  if (state === "boot") startGame();
  else if (state === "gameover") { resetGame(); state = "playing"; }
});

// ===================== 生成目標 =====================
function spawnTarget() {
  const r = Math.random();
  let type = "normal";
  if (r < 0.12) type = "bomb";       // 12% 炸彈
  else if (r < 0.27) type = "gold";  // 15% 金球
  const margin = TARGET_R() + 10;
  targets.push({
    x: margin + Math.random() * (W - margin * 2),
    y: -TARGET_R(),
    vy: fallSpeed * H * (0.85 + Math.random() * 0.4),
    type,
    spin: Math.random() * Math.PI,
    dead: false,
  });
}

// ===================== 粒子爆炸 =====================
function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1,
      color,
      r: 3 + Math.random() * 5,
    });
  }
}

// ===================== 碰撞：手 vs 目標 =====================
function checkHits() {
  const hr = HAND_R();
  const tr = TARGET_R();
  for (const t of targets) {
    if (t.dead) continue;
    for (const h of hands) {
      const dx = h.x - t.x;
      const dy = h.y - t.y;
      if (dx * dx + dy * dy < (hr + tr) * (hr + tr)) {
        hitTarget(t);
        break;
      }
    }
  }
}

function hitTarget(t) {
  t.dead = true;
  if (t.type === "bomb") {
    // 打到炸彈：扣命、紅閃、重震、斷連擊
    lives--;
    combo = 0;
    shake = 22;
    flash = { color: "255,60,60", a: 0.55 };
    burst(t.x, t.y, "#ff5252", 22);
    sndBomb();
    if (lives <= 0) state = "gameover";
    return;
  }
  // 藍球 / 金球：加分、加連擊
  combo++;
  bestCombo = Math.max(bestCombo, combo);
  const gain = t.type === "gold" ? 5 : 1;
  score += gain * (1 + Math.floor(combo / 5)); // 連擊每 5 段加成
  shake = Math.min(14, 6 + combo * 0.3);
  if (t.type === "gold") { burst(t.x, t.y, "#ffd54a", 20); sndGold(); }
  else { burst(t.x, t.y, "#4fc3f7", 14); sndHit(combo); }
}

// ===================== 每一影格更新 =====================
function update(dt) {
  elapsed += dt;

  // 難度遞增：每 12 秒變快一點
  const lvl = Math.floor(elapsed / 12);
  spawnInterval = Math.max(0.32, 0.85 - lvl * 0.08);
  fallSpeed = 0.28 + lvl * 0.05;

  // 生成
  spawnTimer -= dt;
  if (spawnTimer <= 0) { spawnTarget(); spawnTimer = spawnInterval; }

  // 偵測雙手位置（landmark 15=左腕, 16=右腕；座標 0~1，需鏡像翻轉）
  const ts = performance.now();
  const people = detect(video, ts);
  hands = [];
  if (people.length > 0) {
    const lm = people[0];
    for (const idx of [15, 16, 19, 20]) { // 手腕 + 食指，判定點多一點更好打
      const p = lm[idx];
      if (p && p.visibility > 0.3) {
        hands.push({ x: (1 - p.x) * W, y: p.y * H }); // 鏡像：1 - x
      }
    }
  }

  checkHits();

  // 移動目標 + 移除出界
  for (const t of targets) {
    if (t.dead) continue;
    t.y += t.vy * dt;
    if (t.y - TARGET_R() > H) {
      t.dead = true;
      // 漏接「藍/金球」會斷連擊（炸彈漏掉沒事，反而是好事）
      if (t.type !== "bomb") combo = 0;
    }
  }
  targets = targets.filter((t) => !t.dead);

  // 粒子
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 600 * dt; // 重力
    p.life -= dt * 1.6;
  }
  particles = particles.filter((p) => p.life > 0);

  // 震動 / 閃光衰減
  if (shake > 0) shake = Math.max(0, shake - dt * 60);
  if (flash) { flash.a -= dt * 1.5; if (flash.a <= 0) flash = null; }
}

// ===================== 繪製 =====================
function drawCameraMirrored() {
  ctx.save();
  ctx.filter = "brightness(1.05) saturate(1.05)";
  ctx.scale(-1, 1);
  ctx.drawImage(video, -W, 0, W, H); // 鏡像翻轉，像照鏡子
  ctx.restore();
  ctx.filter = "none";
}

function drawTarget(t) {
  const tr = TARGET_R();
  ctx.save();
  ctx.translate(t.x, t.y);
  if (t.type === "bomb") {
    // 炸彈：黑圓 + 引信 + ✕
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(0, 0, tr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff5252"; ctx.lineWidth = tr * 0.18;
    ctx.beginPath();
    ctx.moveTo(-tr * 0.4, -tr * 0.4); ctx.lineTo(tr * 0.4, tr * 0.4);
    ctx.moveTo(tr * 0.4, -tr * 0.4); ctx.lineTo(-tr * 0.4, tr * 0.4);
    ctx.stroke();
  } else {
    const grad = ctx.createRadialGradient(-tr * 0.3, -tr * 0.3, tr * 0.1, 0, 0, tr);
    if (t.type === "gold") { grad.addColorStop(0, "#fff3b0"); grad.addColorStop(1, "#f6a609"); }
    else { grad.addColorStop(0, "#b3e5fc"); grad.addColorStop(1, "#0288d1"); }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, tr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = tr * 0.12;
    ctx.stroke();
    if (t.type === "gold") {
      // 金球畫一顆星
      ctx.fillStyle = "#fff";
      ctx.font = `${tr * 1.1}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("⭐", 0, tr * 0.08);
    }
  }
  ctx.restore();
}

function drawHands() {
  for (const h of hands) {
    const hr = HAND_R();
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, hr);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(h.x, h.y, hr, 0, Math.PI * 2); ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const pad = shortSide() * 0.04;
  const fs = shortSide() * 0.07;
  ctx.textBaseline = "top";

  // 左上：⭐ 分數
  ctx.font = `${fs}px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 8;
  ctx.fillText("⭐ " + score, pad, pad);

  // 右上：❤️ 生命
  ctx.textAlign = "right";
  ctx.fillText("❤️".repeat(Math.max(0, lives)), W - pad, pad);
  ctx.shadowBlur = 0;

  // 中央：Combo 連擊（≥2 才顯示，越大越醒目）
  if (combo >= 2) {
    const big = shortSide() * (0.12 + Math.min(combo, 30) * 0.004);
    ctx.font = `bold ${big}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffeb3b";
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 12;
    ctx.fillText("✕" + combo, W / 2, H * 0.16);
    ctx.shadowBlur = 0;
  }
}

function drawOverlayCircleButton(symbol) {
  // 中央一個半透明大圓 + 符號（▶ 或 🔁）
  const r = shortSide() * 0.16;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = r * 0.08;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `${r * 1.1}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(symbol, W / 2, H / 2 + r * 0.05);
}

function drawBoot() {
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, W, H);
  // 一隻手在揮的提示圖示
  ctx.font = `${shortSide() * 0.2}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("👋", W / 2, H * 0.3);
  drawOverlayCircleButton("▶");
}

function drawLoading() {
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, W, H);
  // 旋轉的載入圈（不用文字，避免小孩看不懂）
  const r = shortSide() * 0.1;
  const a = (performance.now() / 1000) * 4;
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = r * 0.18;
  ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#4fc3f7";
  ctx.beginPath(); ctx.arc(W / 2, H / 2, r, a, a + Math.PI * 1.2); ctx.stroke();
}

function drawGameOver() {
  drawCameraMirrored();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);
  // 大大的最終分數
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `bold ${shortSide() * 0.18}px sans-serif`;
  ctx.fillText("⭐ " + score, W / 2, H * 0.32);
  // 最佳連擊
  ctx.font = `${shortSide() * 0.08}px sans-serif`;
  ctx.fillStyle = "#ffeb3b";
  ctx.fillText("✕" + bestCombo, W / 2, H * 0.46);
  // 重玩按鈕
  drawOverlayCircleButton("🔁");
}

// ===================== 主迴圈 =====================
function loop(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0; // 限制 dt 避免切背景後爆衝
  lastTs = ts;

  if (state === "boot") {
    drawBoot();
  } else if (state === "loading") {
    drawLoading();
  } else if (state === "playing") {
    update(dt);

    // 畫面震動
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawCameraMirrored();
    for (const t of targets) drawTarget(t);
    drawParticles();
    drawHands();
    ctx.restore();

    if (flash) {
      ctx.fillStyle = `rgba(${flash.color},${flash.a})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawHUD();

    // 在遊戲中也可能因炸彈歸零切到 gameover
  } else if (state === "gameover") {
    drawGameOver();
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
