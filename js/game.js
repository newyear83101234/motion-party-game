/**
 * game.js — 揮手打擊（體感遊戲主程式）
 * ------------------------------------------------------------
 * 玩法：鏡頭看到你 → 怪獸掉下來 → 揮手打掉（藍/紫=+1、金Boss=+5），
 *       不要打到紅炸彈怪（-1 命）。連續打中累積 Combo。
 *
 * 超人力霸王（全部用「生成美術」，不再用程式畫陽春圖形）：
 *   - 變身開場動畫（hero.png）
 *   - 遊戲中：頭盔 helmet.png（露臉）+ 胸甲 chest.png（貼身上）
 *   - 雙手 = 發光能量拳
 * 介面零中文（全符號）、6-10 歲、判定放寬、打中要爽。
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

// ===================== 圖片資源 =====================
const SPRITE_SRC = {
  monster1: "IMAGE/sprites/monster1.png",
  monster2: "IMAGE/sprites/monster2.png",
  boss: "IMAGE/sprites/boss.png",
  bomb: "IMAGE/sprites/bomb.png",
};
const sprites = {};
for (const key in SPRITE_SRC) { const img = new Image(); img.src = SPRITE_SRC[key]; sprites[key] = img; }

// 超人素材（生成美術；還沒生的圖程式會自動略過、不報錯）
const helmetImg = new Image(); helmetImg.src = "IMAGE/sprites/helmet.png"; // 開放式頭盔（露臉）
const heroImg = new Image(); heroImg.src = "IMAGE/sprites/hero.png";       // 變身開場英雄圖
const chestImg = new Image(); chestImg.src = "IMAGE/sprites/chest.png";    // 胸甲（貼身上）
const cityImg = new Image(); cityImg.src = "IMAGE/city.png";               // 城市背景
const imgReady = (im) => im && im.complete && im.naturalWidth > 0;

// 貼合微調參數（之後依阿葉回報調整）
const HELMET_SCALE = 1.5, HELMET_Y_OFFSET = -0.5; // 頭盔大小 / 上下（上移：只蓋頭髮、露整臉）
const CHEST_SCALE = 1.5, CHEST_Y_OFFSET = 0.0;     // 胸甲大小 / 上下

// ===================== 背景音樂 =====================
const bgm = new Audio("MUSIC/theme.mp3");
bgm.loop = true; bgm.volume = 0.5;
const winSfx = new Audio("MUSIC/victory.mp3"); winSfx.volume = 0.85; winSfx.preload = "auto"; // 勝利音效(Suno)；沒檔就用合成備援
const superSfx = new Audio("MUSIC/super.mp3"); superSfx.volume = 0.8; superSfx.preload = "auto";  // 大招音效(Suno)；同上
let muted = false;

// ===================== 遊戲狀態 =====================
let state = "boot"; // boot → loading → transform → playing → gameover
let score = 0, combo = 0, bestCombo = 0, lives = 3;
let targets = [], particles = [], hands = [], poseLandmarks = null, latestMask = null;
let shake = 0, bombFx = 0, transformT = 0, gameOverPending = false;
let superCharge = 0, superFx = 0, superCool = 0; // 大招：充能 / 特效 / 冷卻
let stage = 1, killCount = 0, bossActive = false, boss = null, bossHitCd = 0, bossClearFx = 0; // 關卡 / Boss
let spawnTimer = 0, spawnInterval = 0.85, fallSpeed = 0.28, elapsed = 0, lastTs = 0;
const TRANSFORM_DUR = 2.0;

const shortSide = () => Math.min(W, H);
const HAND_R = () => shortSide() * 0.10;
const TARGET_R = () => shortSide() * 0.078;
const tRadius = (t) => TARGET_R() * (t.scale || 1);

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
  gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t); osc.stop(t + dur);
}
function sndHit(c) { beep(520 + Math.min(c, 20) * 28, 0.10, "square", 0.25); }
function sndGold() { beep(880, 0.10, "triangle", 0.3); setTimeout(() => beep(1320, 0.14, "triangle", 0.3), 70); }
function sndBomb() { beep(120, 0.35, "sawtooth", 0.45); beep(60, 0.5, "square", 0.4); setTimeout(() => beep(80, 0.3, "sawtooth", 0.35), 120); }
function sndTransform() {
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(200, t); osc.frequency.exponentialRampToValueAtTime(1500, t + 1.2);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t); osc.stop(t + 1.7);
}
function sndSuper() { // 大招音效（上升和弦）
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime;
  [330, 440, 660, 880].forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(f, t + i * 0.05);
    g.gain.setValueAtTime(0.22, t + i * 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55 + i * 0.05);
    o.connect(g).connect(audioCtx.destination); o.start(t + i * 0.05); o.stop(t + 0.65 + i * 0.05);
  });
}
function playSfxFile(a) { // 有 Suno 音檔就播，回傳是否成功（沒檔回 false → 用合成備援）
  if (muted) return false;
  if (a.readyState >= 2) { try { a.currentTime = 0; a.play().catch(() => {}); return true; } catch (e) {} }
  return false;
}
function sndVictory() { // 合成勝利號角（Suno 音檔的備援）
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(f, t + i * 0.12);
    g.gain.setValueAtTime(0.25, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6 + i * 0.12);
    o.connect(g).connect(audioCtx.destination); o.start(t + i * 0.12); o.stop(t + 0.7 + i * 0.12);
  });
}
function startBoss() { // 出現大魔王
  bossActive = true;
  for (const t of targets) burst(t.x, t.y, "#7fe0ff", 6);
  targets = [];
  const hp = 8 + stage * 3;
  boss = { x: W / 2, y: H * 0.26, hp, maxHp: hp, t: 0, r: shortSide() * 0.17 };
}
function defeatBoss() { // 打贏 Boss
  for (let i = 0; i < 4; i++) burst(boss.x + (Math.random() - 0.5) * boss.r * 2, boss.y + (Math.random() - 0.5) * boss.r * 2, "#ffd54a", 22);
  score += 20 + stage * 10;
  bossActive = false; boss = null; stage++; bossClearFx = 1.6; shake = 18;
  if (!playSfxFile(winSfx)) sndVictory();
}
function fireSuper() { // 放大招：清掉全場怪獸（對 Boss 也造成大傷害）
  for (const t of targets) { if (t.type !== "bomb") score += 2; burst(t.x, t.y, t.type === "bomb" ? "#ff5252" : "#7fe0ff", 16); }
  targets = [];
  if (bossActive && boss) { boss.hp -= 5; burst(boss.x, boss.y, "#7fe0ff", 24); if (boss.hp <= 0) defeatBoss(); }
  superFx = 1; shake = 24; superCharge = 0; superCool = 2.0;
  if (!playSfxFile(superSfx)) sndSuper();
}

// ===================== 開始 / 重設 =====================
function resetGame() {
  score = 0; combo = 0; bestCombo = 0; lives = 3;
  targets = []; particles = []; shake = 0; bombFx = 0; gameOverPending = false;
  superCharge = 0; superFx = 0; superCool = 0;
  stage = 1; killCount = 0; bossActive = false; boss = null; bossHitCd = 0; bossClearFx = 0;
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
    transformT = 0; sndTransform(); state = "transform";
  } catch (err) { console.error("啟動失敗：", err); state = "boot"; }
  starting = false;
}

canvas.addEventListener("pointerdown", (e) => {
  if (state === "boot") { startGame(); return; }
  if (state === "gameover") { resetGame(); playBgm(); transformT = 0; sndTransform(); state = "transform"; return; }
  if (state === "playing") {
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
  if (r < 0.12) { type = "bomb"; sprite = "bomb"; scale = 1.3; }
  else if (r < 0.27) { type = "gold"; sprite = "boss"; scale = 1.1; }
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
    lives--; combo = 0; shake = 28; bombFx = 1;
    burst(t.x, t.y, "#ff5252", 26); sndBomb();
    if (lives <= 0) { bombFx = 1.5; gameOverPending = true; }
    return;
  }
  combo++; bestCombo = Math.max(bestCombo, combo); killCount++;
  const gain = t.type === "gold" ? 5 : 1;
  score += gain * (1 + Math.floor(combo / 5));
  shake = Math.min(14, 6 + combo * 0.3);
  if (t.type === "gold") { burst(t.x, t.y, "#ffd54a", 20); sndGold(); }
  else { burst(t.x, t.y, "#4fc3f7", 14); sndHit(combo); }
}

// ===================== 更新（playing） =====================
function update(dt) {
  if (gameOverPending) { // 致命炸彈：先把爆炸播完再結束
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
    particles = particles.filter((p) => p.life > 0);
    if (shake > 0) shake = Math.max(0, shake - dt * 60);
    if (bombFx > 0) bombFx = Math.max(0, bombFx - dt * 1.6);
    if (bombFx <= 0) { state = "gameover"; gameOverPending = false; }
    return;
  }
  elapsed += dt;
  const lvl = Math.floor(elapsed / 12) + (stage - 1); // 關卡越高越快
  spawnInterval = Math.max(0.30, 0.85 - lvl * 0.07);
  fallSpeed = 0.26 + lvl * 0.045;
  if (!bossActive) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnTarget(); spawnTimer = spawnInterval; }
    if (killCount >= 12) { killCount = 0; startBoss(); } // 打夠小怪 → 出 Boss
  }

  const res = detect(video, performance.now());
  const people = res.landmarks;
  poseLandmarks = people.length > 0 ? people[0] : null;
  latestMask = res.mask;
  hands = [];
  if (poseLandmarks) {
    for (const idx of [15, 16, 19, 20]) {
      const p = poseLandmarks[idx];
      if (p && p.visibility > 0.3) hands.push({ x: (1 - p.x) * W, y: p.y * H });
    }
  }
  checkHits();

  // 大招充能：雙手都舉到「頭以上」就充能，滿了自動發射
  const lw = poseLandmarks && poseLandmarks[15], rw = poseLandmarks && poseLandmarks[16], nz = poseLandmarks && poseLandmarks[0];
  const handsUp = lw && rw && nz && lw.visibility > 0.3 && rw.visibility > 0.3 && lw.y < nz.y - 0.02 && rw.y < nz.y - 0.02;
  if (superCool > 0) superCool = Math.max(0, superCool - dt);
  else if (handsUp) { superCharge += dt; if (superCharge >= 1) fireSuper(); }
  else superCharge = Math.max(0, superCharge - dt * 1.5);

  // Boss 移動 + 受擊
  if (bossActive && boss) {
    boss.t += dt;
    boss.x = W / 2 + Math.sin(boss.t * 0.8) * W * 0.3;
    boss.y = H * 0.24 + Math.sin(boss.t * 1.6) * H * 0.04;
    if (bossHitCd > 0) bossHitCd -= dt;
    if (bossHitCd <= 0) {
      for (const h of hands) {
        if ((h.x - boss.x) ** 2 + (h.y - boss.y) ** 2 < (boss.r + HAND_R()) ** 2) {
          boss.hp -= 1; bossHitCd = 0.12; shake = 8; sndHit(3);
          burst(boss.x + (Math.random() - 0.5) * boss.r, boss.y + (Math.random() - 0.5) * boss.r, "#ffd54a", 8);
          break;
        }
      }
    }
    if (boss.hp <= 0) defeatBoss();
  }

  for (const t of targets) {
    if (t.dead) continue;
    t.y += t.vy * dt; t.wobble += dt * 4;
    if (t.y - tRadius(t) > H) { t.dead = true; if (t.type !== "bomb") combo = 0; }
  }
  targets = targets.filter((t) => !t.dead);

  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
  particles = particles.filter((p) => p.life > 0);

  if (shake > 0) shake = Math.max(0, shake - dt * 60);
  if (bombFx > 0) bombFx = Math.max(0, bombFx - dt * 1.6);
  if (superFx > 0) superFx = Math.max(0, superFx - dt * 1.4);
  if (bossClearFx > 0) bossClearFx = Math.max(0, bossClearFx - dt);
}

// ===================== 繪製：鏡頭 =====================
function drawCameraMirrored() {
  ctx.save(); ctx.filter = "brightness(1.05) saturate(1.05)";
  ctx.scale(-1, 1); ctx.drawImage(video, -W, 0, W, H);
  ctx.restore(); ctx.filter = "none";
}

// ---- 背景替換：城市 + 把人摳出來疊上去 ----
let _personCv = null, _personCx = null, _maskCv = null, _maskCx = null, _maskImg = null;
function drawCityBg() {
  const iw = cityImg.naturalWidth, ih = cityImg.naturalHeight;
  const s = Math.max(W / iw, H / ih), dw = iw * s, dh = ih * s; // cover 填滿
  ctx.drawImage(cityImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
}
function drawPersonMasked(mask) {
  if (!_personCv || _personCv.width !== W || _personCv.height !== H) {
    _personCv = document.createElement("canvas"); _personCv.width = W; _personCv.height = H;
    _personCx = _personCv.getContext("2d");
  }
  const pcx = _personCx;
  pcx.setTransform(1, 0, 0, 1, 0, 0);
  pcx.globalCompositeOperation = "source-over";
  pcx.clearRect(0, 0, W, H);
  pcx.save(); pcx.scale(-1, 1); pcx.drawImage(video, -W, 0, W, H); pcx.restore(); // 鏡像鏡頭
  // 把遮罩畫進小 canvas（人=不透明）
  const mw = mask.width, mh = mask.height;
  if (!_maskCv || _maskCv.width !== mw || _maskCv.height !== mh) {
    _maskCv = document.createElement("canvas"); _maskCv.width = mw; _maskCv.height = mh;
    _maskCx = _maskCv.getContext("2d"); _maskImg = _maskCx.createImageData(mw, mh);
  }
  const d = _maskImg.data, src = mask.data;
  for (let i = 0; i < src.length; i++) {
    const j = i * 4; d[j] = 255; d[j + 1] = 255; d[j + 2] = 255;
    d[j + 3] = src[i] > 0.5 ? 255 : (src[i] * src[i] * 255) | 0; // 人保留、邊緣柔化
  }
  _maskCx.putImageData(_maskImg, 0, 0);
  pcx.globalCompositeOperation = "destination-in"; // 只留人
  pcx.save(); pcx.scale(-1, 1); pcx.drawImage(_maskCv, -W, 0, W, H); pcx.restore();
  pcx.globalCompositeOperation = "source-over";
  ctx.drawImage(_personCv, 0, 0);
}
function drawScene() {
  if (latestMask && imgReady(cityImg)) { drawCityBg(); drawPersonMasked(latestMask); }
  else drawCameraMirrored(); // 還沒有遮罩/城市時，退回顯示原鏡頭
}

// ===================== 關節點工具 =====================
function pt(i) {
  if (!poseLandmarks) return null;
  const p = poseLandmarks[i];
  if (!p || p.visibility < 0.3) return null;
  return { x: (1 - p.x) * W, y: p.y * H };
}
function mid(a, b) { return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// ===================== 繪製：胸甲（生成美術，貼身上、跟著轉） =====================
function drawChest() {
  if (!imgReady(chestImg)) return;
  const sL = pt(11), sR = pt(12);
  if (!sL || !sR) return;
  const sw = dist(sL, sR);
  const chest = mid(sL, sR), hips = mid(pt(23), pt(24));
  const ang = Math.atan2(sR.y - sL.y, sR.x - sL.x);
  const size = sw * CHEST_SCALE;
  const aspect = chestImg.naturalHeight / chestImg.naturalWidth;
  let cx = chest.x, cy = chest.y + sw * 0.55;
  if (hips) { cx = chest.x * 0.55 + hips.x * 0.45; cy = chest.y * 0.55 + hips.y * 0.45; }
  ctx.save(); ctx.translate(cx, cy + sw * CHEST_Y_OFFSET); ctx.rotate(ang);
  ctx.drawImage(chestImg, -size / 2, -size * aspect / 2, size, size * aspect);
  ctx.restore();
}

// ===================== 繪製：開放式頭盔（露臉、跟著頭轉） =====================
function drawHelmet() {
  if (!imgReady(helmetImg)) return;
  const earL = pt(7), earR = pt(8), nose = pt(0);
  const head = mid(earL, earR) || nose;
  if (!head) return;
  let fw = (earL && earR) ? dist(earL, earR) : shortSide() * 0.18;
  fw = Math.max(fw, shortSide() * 0.12);
  const ang = (earL && earR) ? Math.atan2(earR.y - earL.y, earR.x - earL.x) : 0;
  const size = fw * HELMET_SCALE;
  ctx.save();
  ctx.translate(head.x, head.y + fw * HELMET_Y_OFFSET);
  ctx.rotate(ang);
  ctx.drawImage(helmetImg, -size / 2, -size / 2, size, size);
  ctx.restore();
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
  if (imgReady(img)) ctx.drawImage(img, -drawR, -drawR, drawR * 2, drawR * 2);
  else { ctx.fillStyle = t.type === "gold" ? "#f6a609" : t.type === "bomb" ? "#222" : "#0288d1"; ctx.beginPath(); ctx.arc(0, 0, tr, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// ===================== 繪製：Boss + 血條 + 過關 =====================
function drawBoss() {
  if (!boss) return;
  const r = boss.r;
  ctx.save(); ctx.globalAlpha = 0.35 + 0.2 * Math.sin(boss.t * 4);
  ctx.fillStyle = "#ffd54a"; ctx.beginPath(); ctx.arc(boss.x, boss.y, r * 1.18, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const img = sprites.boss;
  if (imgReady(img)) ctx.drawImage(img, boss.x - r, boss.y - r, r * 2, r * 2);
  else { ctx.fillStyle = "#f6a609"; ctx.beginPath(); ctx.arc(boss.x, boss.y, r, 0, Math.PI * 2); ctx.fill(); }
  // 血條
  const bw = W * 0.6, bh = shortSide() * 0.028, bx = (W - bw) / 2, by = shortSide() * 0.12;
  ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#ff4444"; ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), bh);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
}
function drawBossClearFx() {
  if (bossClearFx <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, bossClearFx);
  ctx.font = `${shortSide() * 0.3}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🏆", W / 2, H * 0.4); ctx.restore();
}

// ===================== 繪製：能量拳（雙手） / 粒子 =====================
function drawHands() {
  for (const h of hands) {
    const hr = HAND_R();
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, hr);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(190,240,255,0.9)");
    g.addColorStop(0.6, "rgba(70,180,255,0.5)");
    g.addColorStop(1, "rgba(70,180,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, hr, 0, Math.PI * 2); ctx.fill();
    // 亮核心
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.arc(h.x, h.y, hr * 0.32, 0, Math.PI * 2); ctx.fill();
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
  const k = bombFx;
  ctx.fillStyle = `rgba(220,30,30,${0.55 * k})`; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, H / 2);
  ctx.strokeStyle = `rgba(255,255,255,${0.5 * k})`; ctx.lineWidth = shortSide() * 0.012;
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(shortSide() * 0.75 * (1.25 - k), 0); ctx.stroke(); }
  ctx.restore();
  ctx.font = `${shortSide() * (0.35 + (1 - k) * 0.18)}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillText("💥", W / 2, H / 2); ctx.globalAlpha = 1;
}

// 大招充能球（頭頂上方）
function drawSuperCharge() {
  if (superCharge <= 0) return;
  const nose = pt(0); if (!nose) return;
  const k = Math.min(1, superCharge);
  const cx = nose.x, cy = nose.y - shortSide() * 0.22;
  const r = shortSide() * (0.04 + 0.12 * k);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.5, `rgba(120,220,255,${0.7 * k})`);
  g.addColorStop(1, "rgba(120,220,255,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = shortSide() * 0.012;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
}
// 大招全螢幕光波
function drawSuperFx() {
  if (superFx <= 0) return;
  const k = superFx;
  ctx.fillStyle = `rgba(150,230,255,${0.45 * k})`; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = k;
  const bw = W * (0.2 + (1 - k) * 0.85);
  const grad = ctx.createLinearGradient(W / 2 - bw / 2, 0, W / 2 + bw / 2, 0);
  grad.addColorStop(0, "rgba(120,220,255,0)"); grad.addColorStop(0.5, "rgba(255,255,255,0.9)"); grad.addColorStop(1, "rgba(120,220,255,0)");
  ctx.fillStyle = grad; ctx.fillRect(W / 2 - bw / 2, 0, bw, H);
  ctx.restore();
}

// ===================== 變身開場（只先出現超人） =====================
function drawTransform(dt) {
  transformT += dt;
  const k = Math.min(1, transformT / TRANSFORM_DUR);
  drawCameraMirrored();
  ctx.fillStyle = "rgba(5,8,20,0.55)"; ctx.fillRect(0, 0, W, H); // 變暗聚焦
  ctx.save(); ctx.translate(W / 2, H * 0.52);
  const rays = 18, fade = 1 - Math.abs(0.5 - k) * 2;
  ctx.strokeStyle = `rgba(180,230,255,${0.6 * fade})`; ctx.lineWidth = shortSide() * 0.012;
  ctx.rotate(transformT * 2.5);
  for (let i = 0; i < rays; i++) { ctx.rotate(Math.PI * 2 / rays); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(shortSide() * 0.9 * k, 0); ctx.stroke(); }
  ctx.restore();
  if (imgReady(heroImg)) {
    const s = shortSide() * (0.4 + 0.55 * Math.min(1, k * 1.6));
    const aspect = heroImg.naturalHeight / heroImg.naturalWidth;
    ctx.globalAlpha = Math.min(1, k * 2.2);
    ctx.drawImage(heroImg, W / 2 - s / 2, H * 0.55 - s * aspect / 2, s, s * aspect);
    ctx.globalAlpha = 1;
  }
  const fl = Math.max(0, 1 - Math.abs(0.5 - k) * 3.5);
  if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl * 0.75})`; ctx.fillRect(0, 0, W, H); }
  if (transformT >= TRANSFORM_DUR) { transformT = 0; spawnTimer = 0.7; state = "playing"; }
}

// ===================== HUD / 畫面 =====================
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
  else if (state === "transform") drawTransform(dt);
  else if (state === "playing") {
    update(dt);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawScene();   // 城市背景 + 把你摳出來
    drawChest();   // 胸甲（生成美術）
    drawHelmet();  // 頭盔（生成美術）
    for (const t of targets) drawTarget(t);
    if (bossActive) drawBoss();
    drawParticles();
    drawHands();    // 能量拳
    drawSuperCharge(); // 大招充能球
    ctx.restore();
    drawBombFx();
    drawSuperFx();   // 大招光波（全螢幕）
    drawBossClearFx(); // 過關 🏆
    drawHUD();
  } else if (state === "gameover") drawGameOver();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
