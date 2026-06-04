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
const cityImg = new Image(); cityImg.src = "IMAGE/city.png";               // 城市背景（打怪）
const spaceImg = new Image(); spaceImg.src = "IMAGE/space.png";            // 太空背景（躲避）
const meteorImg = new Image(); meteorImg.src = "IMAGE/sprites/meteor.png"; // 隕石
const logoImg = new Image(); logoImg.src = "IMAGE/sprites/logo.png";        // 選單標題徽章
const warnImg = new Image(); warnImg.src = "IMAGE/sprites/boss_warning.png"; // Boss 預警
const starImg = new Image(); starImg.src = "IMAGE/sprites/star.png";        // 星星（躲避收集）
const bossBigImg = new Image(); bossBigImg.src = "IMAGE/sprites/boss_big.png"; // 大魔王
const comboBgImg = new Image(); comboBgImg.src = "IMAGE/sprites/combo_bg.png"; // Combo 底襯
const gameoverImg = new Image(); gameoverImg.src = "IMAGE/gameover_bg.png";    // 結束畫面背景
const imgReady = (im) => im && im.complete && im.naturalWidth > 0;

// 貼合微調參數（之後依阿葉回報調整）
const HELMET_SCALE = 1.5, HELMET_Y_OFFSET = -0.5; // 頭盔大小 / 上下（上移：只蓋頭髮、露整臉）
const CHEST_SCALE = 1.5, CHEST_Y_OFFSET = 0.0;     // 胸甲大小 / 上下

// ===================== 背景音樂 =====================
const bgmTheme = new Audio("MUSIC/theme.mp3");     // 打怪 BGM
const bgmMenu = new Audio("MUSIC/menu.mp3");       // 選單音樂
const bgmDodge = new Audio("MUSIC/dodge_bgm.mp3"); // 太空關 BGM
[bgmTheme, bgmMenu, bgmDodge].forEach((a) => { a.loop = true; a.volume = 0.5; });
let activeBgm = null;
const winSfx = new Audio("MUSIC/victory.mp3"); winSfx.volume = 0.85; winSfx.preload = "auto"; // 勝利音效(Suno)
const superSfx = new Audio("MUSIC/super.mp3"); superSfx.volume = 0.8; superSfx.preload = "auto";  // 大招音效(Suno)
let muted = false;
function playBgmTrack(a) { // 切換 BGM（暫停其他、播這首）
  if (activeBgm === a) { a.muted = muted; if (a.paused) a.play().catch(() => {}); return; }
  if (activeBgm) { try { activeBgm.pause(); } catch (e) {} }
  activeBgm = a; a.muted = muted; a.play().catch(() => {});
}
function setMuted(m) { muted = m; [bgmTheme, bgmMenu, bgmDodge].forEach((a) => { a.muted = m; }); }

// ===================== 遊戲狀態 =====================
let state = "boot"; // boot → loading → transform → playing → gameover
let score = 0, combo = 0, bestCombo = 0, lives = 3;
let targets = [], particles = [], hands = [], poseLandmarks = null, latestMask = null;
let shake = 0, bombFx = 0, transformT = 0, gameOverPending = false;
let superCharge = 0, superFx = 0, superCool = 0; // 大招：充能 / 特效 / 冷卻
let stage = 1, killCount = 0, bossActive = false, boss = null, bossHitCd = 0, bossClearFx = 0, bossWarnT = 0; // 關卡 / Boss / 預警
let currentGame = "whack";          // 目前遊戲："whack"（打怪）| "dodge"（躲避）
let meteors = [], dodgeInvuln = 0, stars = [], starTimer = 0; // 躲避：隕石 / 無敵 / 星星 / 星星計時
let floatTexts = [];                // 飄分數文字（+1 / +5 往上飄）
let bestWhack = 0, bestDodge = 0;   // 最高分（localStorage）
let allPose = [], superHead = null; // 雙人：所有偵測到的人 / 大招充能者的頭
let spawnTimer = 0, spawnInterval = 0.85, fallSpeed = 0.28, elapsed = 0, lastTs = 0;
const TRANSFORM_DUR = 2.0;
// 最高分（存在手機裡，給「破紀錄」動機）
function lsGet(k) { try { return +(localStorage.getItem(k) || 0); } catch (e) { return 0; } }
function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
bestWhack = lsGet("best_whack"); bestDodge = lsGet("best_dodge");
function commitBest() {
  if (currentGame === "whack") { if (score > bestWhack) { bestWhack = score; lsSet("best_whack", score); } }
  else { if (score > bestDodge) { bestDodge = score; lsSet("best_dodge", score); } }
}
// 飄分數文字
function addFloat(x, y, text, color, size) { floatTexts.push({ x, y, text, color, size, life: 1 }); }
function updateFloats(dt) {
  for (const f of floatTexts) { f.y -= dt * shortSide() * 0.55; f.life -= dt * 1.3; }
  floatTexts = floatTexts.filter((f) => f.life > 0);
}
function drawFloatTexts() {
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const f of floatTexts) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.font = `bold ${f.size}px sans-serif`;
    ctx.lineWidth = f.size * 0.14; ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

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
  for (let i = 0; i < 6; i++) burst(Math.random() * W, H * 0.1 + Math.random() * H * 0.3, "#ffe082", 8); // 滿天金色慶祝
  const reward = 20 + stage * 10;
  addFloat(boss.x, boss.y, "+" + reward, "#ffd54a", shortSide() * 0.1);
  score += reward;
  bossActive = false; boss = null; stage++; bossClearFx = 2.4; shake = 18;
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
  stage = 1; killCount = 0; bossActive = false; boss = null; bossHitCd = 0; bossClearFx = 0; bossWarnT = 0;
  meteors = []; floatTexts = []; dodgeInvuln = 0; stars = []; starTimer = 0;
  spawnTimer = 0; spawnInterval = 0.85; fallSpeed = 0.28; elapsed = 0;
}
// BGM 改用上方 playBgmTrack(track) 切換

let starting = false;
async function startGame() {
  if (starting) return;
  starting = true; state = "loading";
  try {
    initAudio();
    [bgmTheme, bgmMenu, bgmDodge].forEach((a) => { try { a.play().then(() => a.pause()).catch(() => {}); } catch (e) {} }); // 在使用者手勢內解鎖音訊
    await startCamera(video);
    await initPoseDetector(2); // 偵測最多 2 人（雙人合作）
    playBgmTrack(bgmMenu);
    state = "menu"; // 載入完成 → 進「選遊戲」選單
  } catch (err) { console.error("啟動失敗：", err); state = "boot"; }
  starting = false;
}

// 共用：偵測身體 → 填 poseLandmarks / hands / latestMask（兩個遊戲都用）
function senseBody() {
  const res = detect(video, performance.now());
  allPose = res.landmarks;                          // 所有偵測到的人（最多 2）
  poseLandmarks = allPose.length > 0 ? allPose[0] : null;
  latestMask = res.mask;
  hands = [];
  for (const lm of allPose) {                       // 把每個人的手都收進來（雙人共打）
    for (const idx of [15, 16, 19, 20]) {
      const p = lm[idx];
      if (p && p.visibility > 0.3) hands.push({ x: (1 - p.x) * W, y: p.y * H });
    }
  }
}
function resetDodge() {
  score = 0; combo = 0; bestCombo = 0; lives = 3;
  particles = []; shake = 0; bombFx = 0; gameOverPending = false;
  targets = []; bossActive = false; boss = null; bossHitCd = 0; bossClearFx = 0; bossWarnT = 0;
  superCharge = 0; superFx = 0; superCool = 0;
  meteors = []; floatTexts = []; dodgeInvuln = 0; stars = []; starTimer = 0; spawnTimer = 0; elapsed = 0;
}
function startWhack() { currentGame = "whack"; resetGame(); playBgmTrack(bgmTheme); transformT = 0; sndTransform(); state = "transform"; }
function startDodge() { currentGame = "dodge"; resetDodge(); playBgmTrack(bgmDodge); spawnTimer = 0.6; state = "playing"; }
function pickGame(g) { if (g === "dodge") startDodge(); else startWhack(); }

canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  if (state === "boot") { startGame(); return; }
  if (state === "menu") { pickGame(px < W / 2 ? "whack" : "dodge"); return; } // 左=打怪 右=躲避
  if (state === "gameover") {
    const rr = shortSide() * 0.07, hx = shortSide() * 0.04 + rr, hy = shortSide() * 0.04 + rr;
    if ((px - hx) ** 2 + (py - hy) ** 2 < rr * rr) { playBgmTrack(bgmMenu); state = "menu"; return; } // 🏠 回選單
    if (currentGame === "dodge") startDodge(); else startWhack(); // 🔁 重玩
    return;
  }
  if (state === "playing") {
    const r = shortSide() * 0.06, pad = shortSide() * 0.04, cx = pad + r, cy = H - pad - r;
    if ((px - cx) ** 2 + (py - cy) ** 2 < r * r) setMuted(!muted);
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
  const pts = gain * (1 + Math.floor(combo / 5));
  score += pts;
  shake = Math.min(14, 6 + combo * 0.3);
  addFloat(t.x, t.y - tRadius(t), "+" + pts, t.type === "gold" ? "#ffd54a" : "#fff", shortSide() * (t.type === "gold" ? 0.09 : 0.07));
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
    if (bombFx <= 0) { commitBest(); state = "gameover"; gameOverPending = false; }
    return;
  }
  elapsed += dt;
  const lvl = Math.floor(elapsed / 12) + (stage - 1); // 關卡越高越快
  spawnInterval = Math.max(0.30, 0.85 - lvl * 0.07);
  fallSpeed = 0.26 + lvl * 0.045;
  if (!bossActive) {
    if (bossWarnT > 0) { bossWarnT -= dt; if (bossWarnT <= 0) startBoss(); } // 預警跑完才出 Boss
    else {
      spawnTimer -= dt;
      if (spawnTimer <= 0) { spawnTarget(); spawnTimer = spawnInterval; }
      if (killCount >= 12) { killCount = 0; bossWarnT = 1.2; beep(740, 0.18, "square", 0.28); } // 打夠 → Boss 預警
    }
  }

  senseBody();
  checkHits();

  // 大招充能：雙手都舉到「頭以上」就充能，滿了自動發射
  superHead = null;
  for (const lm of allPose) { // 任何一個人雙手舉過頭就充能
    const lw = lm[15], rw = lm[16], nz = lm[0];
    if (lw && rw && nz && lw.visibility > 0.3 && rw.visibility > 0.3 && lw.y < nz.y - 0.02 && rw.y < nz.y - 0.02) { superHead = ptL(lm, 0); break; }
  }
  if (superCool > 0) superCool = Math.max(0, superCool - dt);
  else if (superHead) { superCharge += dt; if (superCharge >= 1) fireSuper(); }
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
    if (t.y - tRadius(t) > H) { t.dead = true; if (t.type !== "bomb") { combo = 0; burst(t.x, H - 6, "#888", 5); } } // 漏接小爆煙
  }
  targets = targets.filter((t) => !t.dead);

  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
  particles = particles.filter((p) => p.life > 0);
  updateFloats(dt);

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
let _personCv = null, _personCx = null, _maskCv = null, _maskCx = null, _maskImg = null, _maskTick = 0;
function drawBgCover(img) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const s = Math.max(W / iw, H / ih), dw = iw * s, dh = ih * s; // cover 填滿
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
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
  let justCreated = false;
  if (!_maskCv || _maskCv.width !== mw || _maskCv.height !== mh) {
    _maskCv = document.createElement("canvas"); _maskCv.width = mw; _maskCv.height = mh;
    _maskCx = _maskCv.getContext("2d"); _maskImg = _maskCx.createImageData(mw, mh); justCreated = true;
  }
  _maskTick++;
  if (justCreated || _maskTick % 2 === 1) { // 隔幀才重算遮罩像素（人形變化慢）
    const d = _maskImg.data, src = mask.data;
    for (let i = 0; i < src.length; i++) {
      const j = i * 4; d[j] = 255; d[j + 1] = 255; d[j + 2] = 255;
      d[j + 3] = src[i] > 0.5 ? 255 : (src[i] * src[i] * 255) | 0; // 人保留、邊緣柔化
    }
    _maskCx.putImageData(_maskImg, 0, 0);
  }
  pcx.globalCompositeOperation = "destination-in"; // 只留人
  pcx.save(); pcx.scale(-1, 1); pcx.drawImage(_maskCv, -W, 0, W, H); pcx.restore();
  pcx.globalCompositeOperation = "source-over";
  ctx.drawImage(_personCv, 0, 0);
}
function drawSceneWith(bgImg) {
  if (latestMask && imgReady(bgImg)) { drawBgCover(bgImg); drawPersonMasked(latestMask); }
  else drawCameraMirrored(); // 還沒有遮罩/背景時，退回原鏡頭
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
// 取「某個人 lm」的第 i 個關節點螢幕座標（雙人用）
function ptL(lm, i) { const p = lm[i]; if (!p || p.visibility < 0.3) return null; return { x: (1 - p.x) * W, y: p.y * H }; }

// ===================== 繪製：胸甲（生成美術，貼身上、跟著轉） =====================
function drawChest() { if (imgReady(chestImg)) for (const lm of allPose) drawChestFor(lm); }
function drawChestFor(lm) {
  const sL = ptL(lm, 11), sR = ptL(lm, 12);
  if (!sL || !sR) return;
  const sw = dist(sL, sR);
  const chest = mid(sL, sR), hips = mid(ptL(lm, 23), ptL(lm, 24));
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
function drawHelmet() { if (imgReady(helmetImg)) for (const lm of allPose) drawHelmetFor(lm); }
function drawHelmetFor(lm) {
  const earL = ptL(lm, 7), earR = ptL(lm, 8), nose = ptL(lm, 0);
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
  const img = imgReady(bossBigImg) ? bossBigImg : sprites.boss;
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
  const k = bossClearFx / 2.4; // 1→0
  ctx.save(); // 擴散光環
  ctx.globalAlpha = k * 0.5; ctx.strokeStyle = "#ffe082"; ctx.lineWidth = shortSide() * 0.02;
  ctx.beginPath(); ctx.arc(W / 2, H * 0.38, shortSide() * (1 - k) * 1.3, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${shortSide() * 0.3}px sans-serif`; ctx.fillText("🏆", W / 2, H * 0.36);
  ctx.font = `bold ${shortSide() * 0.1}px sans-serif`; // 進入下一關 ▶ N
  ctx.lineWidth = shortSide() * 0.01; ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeText("▶ " + stage, W / 2, H * 0.55); ctx.fillStyle = "#fff"; ctx.fillText("▶ " + stage, W / 2, H * 0.55);
  ctx.restore();
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
  const nose = superHead || pt(0); if (!nose) return;
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
  // 分數（左上，圓角底框，任何背景都看得清）
  ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = `bold ${fs}px sans-serif`;
  const sTxt = "⭐ " + score, sw = ctx.measureText(sTxt).width;
  ctx.fillStyle = "rgba(0,0,0,0.4)"; roundRectFill(pad - fs * 0.2, pad, sw + fs * 0.5, fs * 1.25, fs * 0.3);
  ctx.fillStyle = "#fff"; ctx.fillText(sTxt, pad + fs * 0.08, pad + fs * 0.65);
  // 命（右上，逐顆固定間距）
  const gap = fs * 0.52;
  ctx.textAlign = "center"; ctx.font = `${fs}px sans-serif`;
  for (let i = 0; i < lives; i++) ctx.fillText("❤️", W - pad - fs * 0.5 - i * gap, pad + fs * 0.65);
  // Combo（描邊，移高避開怪物路徑）
  if (combo >= 2) {
    const big = shortSide() * (0.11 + Math.min(combo, 30) * 0.004);
    if (imgReady(comboBgImg)) {
      const bw = big * 3.6, bh = bw * comboBgImg.naturalHeight / comboBgImg.naturalWidth;
      ctx.drawImage(comboBgImg, W / 2 - bw / 2, H * 0.09 - bh / 2, bw, bh);
    }
    ctx.font = `bold ${big}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = big * 0.08; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.strokeText("✕" + combo, W / 2, H * 0.09);
    ctx.fillStyle = "#fff"; ctx.fillText("✕" + combo, W / 2, H * 0.09);
  }
  // 靜音鈕（左下）
  const r = shortSide() * 0.06, cx = pad + r, cy = H - pad - r;
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.font = `${r * 1.05}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(muted ? "🔇" : "🔊", cx, cy);
  if (allPose.length >= 2) { ctx.font = `${fs * 0.85}px sans-serif`; ctx.fillStyle = "#fff"; ctx.fillText("👥", W / 2, pad + fs * 0.55); } // 雙人指示
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
  if (imgReady(gameoverImg)) { drawBgCover(gameoverImg); ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, H); }
  else { drawCameraMirrored(); ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `bold ${shortSide() * 0.18}px sans-serif`; ctx.fillText("⭐ " + score, W / 2, H * 0.32);
  if (currentGame === "whack") {
    ctx.font = `${shortSide() * 0.08}px sans-serif`; ctx.fillStyle = "#ffeb3b";
    ctx.fillText("✕" + bestCombo, W / 2, H * 0.46);
  }
  // 最高分（破紀錄 🎉，否則 🏅）
  const best = currentGame === "whack" ? bestWhack : bestDodge;
  const isNew = score >= best && score > 0;
  ctx.font = `${shortSide() * 0.07}px sans-serif`; ctx.fillStyle = "#ffd54a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText((isNew ? "🎉 " : "🏅 ") + best, W / 2, H * 0.72);
  drawOverlayCircleButton("🔁"); // 重玩
  // 🏠 回選單（左上）
  const rr = shortSide() * 0.07, hx = shortSide() * 0.04 + rr, hy = shortSide() * 0.04 + rr;
  ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(hx, hy, rr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = `${rr * 1.1}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🏠", hx, hy + rr * 0.05);
}

// ===================== 選遊戲選單 =====================
function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function roundRectFill(x, y, w, h, r) { roundRectPath(x, y, w, h, r); ctx.fill(); }
function drawCard(x, y, w, h, r, bgImg, border, tint, icon1, icon2, best) {
  ctx.save();
  roundRectPath(x, y, w, h, r); ctx.clip();
  if (imgReady(bgImg)) {
    const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight, s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    ctx.drawImage(bgImg, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else { ctx.fillStyle = "#1a2238"; ctx.fillRect(x, y, w, h); }
  ctx.fillStyle = tint; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = border; ctx.lineWidth = shortSide() * 0.007; roundRectPath(x, y, w, h, r); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${shortSide() * 0.2}px sans-serif`; ctx.fillText(icon1, x + w / 2, y + h * 0.38);
  ctx.font = `${shortSide() * 0.1}px sans-serif`; ctx.fillText(icon2, x + w / 2, y + h * 0.66);
  ctx.font = `bold ${shortSide() * 0.06}px sans-serif`; ctx.fillStyle = "#ffd54a";
  ctx.fillText("🏅" + best, x + w / 2, y + h * 0.88);
}
function drawMenu() {
  ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
  if (imgReady(logoImg)) { const sz = shortSide() * 0.32; ctx.drawImage(logoImg, W / 2 - sz / 2, H * 0.02, sz, sz); } // 標題徽章
  const cy = H * 0.3, ch = H * 0.5, cw = W * 0.4, rad = shortSide() * 0.04;
  drawCard(W * 0.06, cy, cw, ch, rad, cityImg, "rgba(90,170,255,0.95)", "rgba(20,40,90,0.45)", "👊", "🦖", bestWhack);
  drawCard(W * 0.54, cy, cw, ch, rad, spaceImg, "rgba(190,110,255,0.95)", "rgba(40,20,80,0.45)", "🏃", "☄️", bestDodge);
  if ((Math.floor(performance.now() / 400) % 2) === 0) { // 閃爍提示（底部）
    ctx.fillStyle = "#fff"; ctx.font = `${shortSide() * 0.08}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("👆", W / 2, H * 0.88);
  }
}

// ===================== 躲避遊戲（太空躲隕石） =====================
function spawnMeteor(mfall) {
  const r = shortSide() * (0.05 + Math.random() * 0.045);
  meteors.push({ x: r + Math.random() * (W - 2 * r), y: -r, vy: mfall * H * (0.85 + Math.random() * 0.5), r, spin: Math.random() * 6, dead: false });
}
function spawnStar() {
  const r = shortSide() * 0.06;
  stars.push({ x: r + Math.random() * (W - 2 * r), y: -r, vy: 0.3 * H * (0.8 + Math.random() * 0.4), r, spin: Math.random() * 6, dead: false });
}
function sndStar() { beep(1046, 0.08, "triangle", 0.3); setTimeout(() => beep(1568, 0.12, "triangle", 0.3), 60); }
function drawStar(s) {
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.sin(s.spin) * 0.2);
  if (imgReady(starImg)) ctx.drawImage(starImg, -s.r, -s.r, s.r * 2, s.r * 2);
  else { ctx.fillStyle = "#ffd54a"; ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
// Boss 出現前的紅色 ! 預警
function drawBossWarning() {
  if (bossWarnT <= 0 || !imgReady(warnImg)) return;
  const k = bossWarnT / 1.2;
  const sz = shortSide() * (0.24 + 0.04 * Math.sin(performance.now() / 70));
  ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
  ctx.drawImage(warnImg, W / 2 - sz / 2, H * 0.3 - sz / 2, sz, sz);
  ctx.restore();
}
function updateDodge(dt) {
  if (gameOverPending) {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
    particles = particles.filter((p) => p.life > 0);
    if (shake > 0) shake = Math.max(0, shake - dt * 60);
    if (bombFx > 0) bombFx = Math.max(0, bombFx - dt * 1.6);
    if (bombFx <= 0) { commitBest(); state = "gameover"; gameOverPending = false; }
    return;
  }
  senseBody();
  elapsed += dt;
  const lvl = Math.floor(elapsed / 12);
  const interval = Math.max(0.42, 1.0 - lvl * 0.08);
  const mfall = 0.32 + lvl * 0.05;
  spawnTimer -= dt;
  if (spawnTimer <= 0) { spawnMeteor(mfall); spawnTimer = interval; }
  if (dodgeInvuln > 0) dodgeInvuln -= dt;
  // 身體危險點（頭、雙肩、雙臀、軀幹中心）
  const bodyPts = [];
  for (const lm of allPose) { // 每個人的身體都是危險區（雙人一起躲）
    for (const i of [0, 11, 12, 23, 24]) { const p = ptL(lm, i); if (p) bodyPts.push(p); }
    const tm = mid(ptL(lm, 11), ptL(lm, 12)); if (tm) bodyPts.push(tm);
  }
  const bodyR = shortSide() * 0.07;
  for (const m of meteors) {
    if (m.dead) continue;
    m.y += m.vy * dt; m.spin += dt * 3;
    if (m.y - m.r > H) { m.dead = true; score += 1; } // 成功躲過 +1
    else if (dodgeInvuln <= 0) {
      for (const b of bodyPts) {
        if ((b.x - m.x) ** 2 + (b.y - m.y) ** 2 < (m.r + bodyR) ** 2) {
          m.dead = true; lives--; dodgeInvuln = 1.0; shake = 26; bombFx = 1;
          burst(m.x, m.y, "#ff7043", 22); sndBomb();
          if (lives <= 0) { gameOverPending = true; bombFx = 1.3; }
          break;
        }
      }
    }
  }
  meteors = meteors.filter((m) => !m.dead);
  // 星星（移動身體去接 → +5）
  starTimer -= dt;
  if (starTimer <= 0) { spawnStar(); starTimer = 2.5 + Math.random() * 2.5; }
  for (const s of stars) {
    if (s.dead) continue;
    s.y += s.vy * dt; s.spin += dt * 2;
    if (s.y - s.r > H) { s.dead = true; }
    else { for (const b of bodyPts) { if ((b.x - s.x) ** 2 + (b.y - s.y) ** 2 < (s.r + bodyR) ** 2) { s.dead = true; score += 5; addFloat(s.x, s.y, "+5", "#ffd54a", shortSide() * 0.08); burst(s.x, s.y, "#ffd54a", 16); sndStar(); break; } } }
  }
  stars = stars.filter((s) => !s.dead);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
  particles = particles.filter((p) => p.life > 0);
  updateFloats(dt);
  if (shake > 0) shake = Math.max(0, shake - dt * 60);
  if (bombFx > 0) bombFx = Math.max(0, bombFx - dt * 1.6);
}
// 危險預警：上方紅色 ▼ 標出即將砸下的隕石
function drawDodgeWarnings() {
  if ((Math.floor(performance.now() / 120) % 2) !== 0) return; // 閃爍
  ctx.fillStyle = "#ff3b30"; ctx.font = `${shortSide() * 0.06}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const m of meteors) { if (!m.dead && m.y < H * 0.2) ctx.fillText("▼", m.x, H * 0.015); }
}
function drawSpaceTint() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(5,6,30,0.5)"); g.addColorStop(0.5, "rgba(5,6,30,0.12)"); g.addColorStop(1, "rgba(5,6,30,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function drawMeteor(m) {
  ctx.save(); ctx.translate(m.x, m.y);
  const tg = ctx.createLinearGradient(0, -m.r * 2.6, 0, 0);
  tg.addColorStop(0, "rgba(255,120,0,0)"); tg.addColorStop(1, "rgba(255,160,40,0.6)");
  ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-m.r * 0.6, 0); ctx.lineTo(0, -m.r * 2.6); ctx.lineTo(m.r * 0.6, 0); ctx.closePath(); ctx.fill();
  ctx.rotate(m.spin * 0.2);
  if (imgReady(meteorImg)) {
    ctx.drawImage(meteorImg, -m.r * 1.08, -m.r * 1.08, m.r * 2.16, m.r * 2.16);
  } else {
    const g = ctx.createRadialGradient(-m.r * 0.3, -m.r * 0.3, m.r * 0.2, 0, 0, m.r);
    g.addColorStop(0, "#9e9e9e"); g.addColorStop(1, "#4a4a4a");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, m.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.arc(m.r * 0.3, -m.r * 0.2, m.r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-m.r * 0.2, m.r * 0.3, m.r * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawDodgePlaying() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawSceneWith(spaceImg); // 太空背景 + 把你摳出來
  for (const s of stars) drawStar(s);
  for (const m of meteors) drawMeteor(m);
  drawDodgeWarnings();      // 危險預警 ▼
  drawParticles();
  drawFloatTexts();
  ctx.restore();
  drawBombFx();
  drawHUD();
}

// ===================== 打怪遊戲畫面 =====================
function drawWhackPlaying() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawSceneWith(cityImg);   // 城市背景 + 把你摳出來
  drawChest();   // 胸甲
  drawHelmet();  // 頭盔
  for (const t of targets) drawTarget(t);
  if (bossActive) drawBoss();
  drawParticles();
  drawHands();    // 能量拳
  drawSuperCharge(); // 大招充能球
  drawFloatTexts();
  ctx.restore();
  drawBombFx();
  drawSuperFx();
  drawBossClearFx();
  drawBossWarning(); // Boss 出現預警
  drawHUD();
}

// ===================== 主迴圈 =====================
function loop(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
  lastTs = ts;
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); // iOS 切背景回來後恢復音效
  if (state === "boot") drawBoot();
  else if (state === "loading") drawLoading();
  else if (state === "menu") drawMenu();
  else if (state === "transform") drawTransform(dt);
  else if (state === "playing") {
    if (currentGame === "dodge") { updateDodge(dt); drawDodgePlaying(); }
    else { update(dt); drawWhackPlaying(); }
  } else if (state === "gameover") drawGameOver();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
