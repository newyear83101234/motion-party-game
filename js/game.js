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
function resize() {
  // 限制 canvas 內部解析度上限：投映到電視/大螢幕時減輕繪製負擔、避免卡頓
  const cssW = window.innerWidth, cssH = window.innerHeight, cap = 1280;
  const sc = Math.min(1, cap / Math.max(cssW, cssH));
  W = canvas.width = Math.round(cssW * sc);
  H = canvas.height = Math.round(cssH * sc);
}
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
const lawnImg = new Image(); lawnImg.src = "IMAGE/lawn.png";                  // 草坪背景（植物大戰殭屍）
const zombieImg = new Image(); zombieImg.src = "IMAGE/sprites/zombie.png";    // 殭屍
const zombie2Img = new Image(); zombie2Img.src = "IMAGE/sprites/zombie2.png"; // 鐵桶殭屍（耐打、高分）
const houseImg = new Image(); houseImg.src = "IMAGE/sprites/house.png";       // 向日葵/豌豆射手陣地（要守的家）
const poseImgs = {}; // 6 張公主姿勢示範圖（姿勢卡用）
for (const k of ["handsup", "star", "tpose", "handshead", "armscross", "onehand"]) { const im = new Image(); im.src = "IMAGE/sprites/pose_" + k + ".png"; poseImgs[k] = im; }
const imgReady = (im) => im && im.complete && im.naturalWidth > 0;

// 貼合微調參數（之後依阿葉回報調整）
const HELMET_SCALE = 1.5, HELMET_Y_OFFSET = -0.5; // 頭盔大小 / 上下（上移：只蓋頭髮、露整臉）
const CHEST_SCALE = 1.5, CHEST_Y_OFFSET = 0.0;     // 胸甲大小 / 上下

// ===================== 背景音樂 =====================
const bgmTheme = new Audio("MUSIC/theme.mp3");     // 打怪 BGM
const bgmMenu = new Audio("MUSIC/menu.mp3");       // 選單音樂
const bgmDodge = new Audio("MUSIC/dodge_bgm.mp3"); // 太空關 BGM
const bgmPvz = new Audio("MUSIC/pvz_bgm.mp3");     // 擋殭屍 BGM
[bgmTheme, bgmMenu, bgmDodge, bgmPvz].forEach((a) => { a.loop = true; a.volume = 0.5; });
let activeBgm = null;
const winSfx = new Audio("MUSIC/victory.mp3"); winSfx.volume = 0.85; winSfx.preload = "auto"; // 勝利音效(Suno)
const superSfx = new Audio("MUSIC/super.mp3"); superSfx.volume = 0.8; superSfx.preload = "auto";  // 大招音效(Suno)
// 擋殭屍音效（Suno Sounds / 有檔用檔、無檔用合成備援）
const pvzWinSfx = new Audio("MUSIC/victory_pvz.mp3"); pvzWinSfx.volume = 0.85; pvzWinSfx.preload = "auto"; // 通關
const sfxCorrect = new Audio("MUSIC/sfx_correct.mp3"); sfxCorrect.volume = 0.7; sfxCorrect.preload = "auto"; // 姿勢做對/射豌豆
const sfxZombie = new Audio("MUSIC/sfx_zombie.mp3"); sfxZombie.volume = 0.8; sfxZombie.preload = "auto"; // 殭屍倒下
const sfxHurt = new Audio("MUSIC/sfx_hurt.mp3"); sfxHurt.volume = 0.85; sfxHurt.preload = "auto"; // 被攻進扣命
// 往前衝背景影片（Seedance 第一人稱街景循環）：用 CSS 墊在透明 canvas 後面、走硬體解碼最省效能
const bgVideo = document.createElement("video");
bgVideo.src = "VIDEO/runner_bg.mp4"; bgVideo.loop = true; bgVideo.muted = true; bgVideo.preload = "auto";
bgVideo.playsInline = true; bgVideo.setAttribute("playsinline", ""); bgVideo.setAttribute("webkit-playsinline", "");
bgVideo.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;display:none";
document.body.appendChild(bgVideo);
canvas.style.zIndex = "1"; // canvas 疊在背景影片之上（runner clearRect 透明處才露出影片）
let runnerBgOn = false, runnerBgDegraded = false; // 是否用影片背景 / 是否因效能降級
function showBgVideo(on) {
  if (on && bgVideo.readyState >= 2 && !runnerBgDegraded) { bgVideo.style.display = "block"; bgVideo.play().catch(() => {}); runnerBgOn = true; }
  else { bgVideo.style.display = "none"; try { bgVideo.pause(); } catch (e) {} runnerBgOn = false; }
}
// FPS 監控：runner 用影片背景時若連續太卡 → 自動降級回靜態背景
let _fpsFrames = 0, _fpsLast = 0, _fpsLow = 0;
function fpsTick(ts) {
  _fpsFrames++;
  if (!_fpsLast) { _fpsLast = ts; return; }
  if (ts - _fpsLast >= 1000) {
    const fps = _fpsFrames * 1000 / (ts - _fpsLast); _fpsFrames = 0; _fpsLast = ts;
    if (state === "playing" && currentGame === "pvz" && runnerBgOn) {
      if (fps < 22) { _fpsLow++; if (_fpsLow >= 2) { runnerBgDegraded = true; showBgVideo(false); } } else _fpsLow = 0;
    }
  }
}
let muted = false;
const ALL_BGM = [bgmTheme, bgmMenu, bgmDodge, bgmPvz];
function playBgmTrack(a) { // 切換 BGM：先暫停「所有其他首」（根治解鎖時脫稿播放的殘留），再播這首
  for (const t of ALL_BGM) { if (t !== a) { try { t.pause(); } catch (e) {} } }
  activeBgm = a; a.muted = muted; if (a.paused) a.play().catch(() => {});
}
function setMuted(m) { muted = m; ALL_BGM.forEach((a) => { a.muted = m; }); }

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
let bestWhack = 0, bestDodge = 0, bestPvz = 0;   // 最高分（localStorage）
// 植物大戰殭屍（pvz：比動作擋殭屍）狀態
let pvzZombies = [], pvzPeas = [], pvzTarget = null, pvzHold = 0, pvzLock = 0, pvzSpawnT = 0, pvzFireFx = 0; // (舊守家版，已停用)
// 往前衝 runner 狀態（第三遊戲現用）
let runnerObjs = [], runnerSpeed = 0.5, runnerDist = 0, runnerSpawnT = 0, runnerBuildT = 0;
let prevHands = [], punchSpeed = 0, poseFrame = 0, runnerStripe = 0;
const PVZ_POSES = ["handsup", "star", "tpose", "handshead", "armscross", "onehand"]; // 6 個姿勢（key 對應 pose 圖檔名）
let allPose = [], superHead = null; // 雙人：所有偵測到的人 / 大招充能者的頭
let playerMode = "solo";            // 玩家模式："solo"（單人）| "duo"（雙人）
let starCount = 0, dodgeCores = []; // 接到的星星數 / 躲避護盾核心位置
let superUsedEver = false;          // 是否用過大招（用過就不再顯示教學）
const WIN_STAGE = 3, DODGE_GOAL = 40, PVZ_GOAL = 25; // 通關條件：打怪打贏3隻Boss / 躲避達標分數 / 擋殭屍擊殺數
let spawnTimer = 0, spawnInterval = 0.85, fallSpeed = 0.28, elapsed = 0, lastTs = 0;
const TRANSFORM_DUR = 2.0;
// 最高分（存在手機裡，給「破紀錄」動機）
function lsGet(k) { try { return +(localStorage.getItem(k) || 0); } catch (e) { return 0; } }
function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
bestWhack = lsGet("best_whack"); bestDodge = lsGet("best_dodge"); bestPvz = lsGet("best_pvz");
playerMode = lsGet("player_mode") === 1 ? "duo" : "solo";
superUsedEver = lsGet("super_used") === 1;
function commitBest() {
  if (currentGame === "whack") { if (score > bestWhack) { bestWhack = score; lsSet("best_whack", score); } }
  else if (currentGame === "pvz") { if (score > bestPvz) { bestPvz = score; lsSet("best_pvz", score); } }
  else { if (score > bestDodge) { bestDodge = score; lsSet("best_dodge", score); } }
}
function currentBest() { return currentGame === "whack" ? bestWhack : currentGame === "pvz" ? bestPvz : bestDodge; }
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
  if (stage > WIN_STAGE) { commitBest(); state = "win"; } // 打贏 WIN_STAGE 隻 Boss → 通關
}
function fireSuper() { // 放大招：清掉全場怪獸（對 Boss 也造成大傷害）
  for (const t of targets) { if (t.type !== "bomb") score += 2; burst(t.x, t.y, t.type === "bomb" ? "#ff5252" : "#7fe0ff", 16); }
  targets = [];
  if (bossActive && boss) { boss.hp -= 5; burst(boss.x, boss.y, "#7fe0ff", 24); if (boss.hp <= 0) defeatBoss(); }
  superFx = 1; shake = 24; superCharge = 0; superCool = 2.0;
  if (!superUsedEver) { superUsedEver = true; lsSet("super_used", 1); } // 用過就不再顯示教學
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
    ALL_BGM.forEach((a) => { try { a.muted = true; const p = a.play(); if (p) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {}); } catch (e) {} }); // 靜音播一下解鎖手機音訊、立刻歸零（避免脫稿殘留）
    await startCamera(video);
    await initPoseDetector(playerMode === "duo" ? 2 : 1); // 單人只抓1人(省效能)、雙人抓2人
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
  meteors = []; floatTexts = []; dodgeInvuln = 0; stars = []; starTimer = 0; starCount = 0; dodgeCores = []; spawnTimer = 0; elapsed = 0;
}
function startWhack() { currentGame = "whack"; resetGame(); playBgmTrack(bgmTheme); transformT = 0; sndTransform(); state = "transform"; }
function startDodge() { currentGame = "dodge"; resetDodge(); playBgmTrack(bgmDodge); spawnTimer = 0.6; state = "playing"; }
function resetPvz() { // 往前衝 runner 的重設
  score = 0; combo = 0; bestCombo = 0; lives = 3;
  particles = []; floatTexts = []; shake = 0; bombFx = 0; gameOverPending = false;
  runnerObjs = []; runnerSpeed = 0.5; runnerDist = 0; runnerSpawnT = 1.0; runnerBuildT = 0.3;
  prevHands = []; punchSpeed = 0; poseFrame = 0; runnerStripe = 0; pvzTarget = null;
  elapsed = 0;
}
function startPvz() { currentGame = "pvz"; resetPvz(); playBgmTrack(bgmPvz); _fpsLow = 0; showBgVideo(true); state = "playing"; }
function pickGame(g) { if (g === "dodge") startDodge(); else if (g === "pvz") startPvz(); else startWhack(); }
function togglePlayerMode() {
  playerMode = playerMode === "duo" ? "solo" : "duo";
  lsSet("player_mode", playerMode === "duo" ? 1 : 0);
  initPoseDetector(playerMode === "duo" ? 2 : 1).catch(() => {}); // 重建模型（單人省效能 + 不被路人干擾）
}

canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (W / rect.width);   // 校正：CSS 座標 → canvas 座標
  const py = (e.clientY - rect.top) * (H / rect.height);
  if (state === "boot") { startGame(); return; }
  if (state === "menu") {
    const r = shortSide() * 0.085, mx = W / 2, my = H * 0.9; // 模式切換鈕（底部中央）
    if ((px - mx) ** 2 + (py - my) ** 2 < r * r) { togglePlayerMode(); return; }
    for (const c of menuCards()) { if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) { pickGame(c.game); return; } }
    return; // 左=打怪 中=躲避 右=擋殭屍
  }
  if (state === "gameover" || state === "win") {
    const rr = shortSide() * 0.07, hx = shortSide() * 0.04 + rr, hy = shortSide() * 0.04 + rr;
    if ((px - hx) ** 2 + (py - hy) ** 2 < rr * rr) { playBgmTrack(bgmMenu); state = "menu"; return; } // 🏠 回選單
    if (currentGame === "dodge") startDodge(); else if (currentGame === "pvz") startPvz(); else startWhack(); // 🔁 重玩
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
  if (particles.length > 90) return; // 上限保護：避免特效爆量讓手機掉幀
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
  const iw = img.videoWidth || img.naturalWidth, ih = img.videoHeight || img.naturalHeight;
  if (!iw || !ih) return;
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
  const best = currentBest();
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
// 通關畫面（達成條件）
function drawWin() {
  if (imgReady(gameoverImg)) { drawBgCover(gameoverImg); ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, 0, W, H); }
  else { ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${shortSide() * 0.22}px sans-serif`; ctx.fillText("🏆", W / 2, H * 0.16);
  ctx.fillStyle = "#fff"; ctx.font = `bold ${shortSide() * 0.16}px sans-serif`; ctx.fillText("⭐ " + score, W / 2, H * 0.33);
  ctx.font = `${shortSide() * 0.09}px sans-serif`; ctx.fillStyle = "#ffd54a"; ctx.fillText("🎉🎉🎉", W / 2, H * 0.45);
  const best = currentBest();
  ctx.font = `${shortSide() * 0.07}px sans-serif`; ctx.fillText("🏅 " + best, W / 2, H * 0.72);
  drawOverlayCircleButton("🔁");
  const rr = shortSide() * 0.07, hx = shortSide() * 0.04 + rr, hy = shortSide() * 0.04 + rr;
  ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(hx, hy, rr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = `${rr * 1.1}px sans-serif`; ctx.fillText("🏠", hx, hy + rr * 0.05);
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
  ctx.font = `${w * 0.5}px sans-serif`; ctx.fillText(icon1, x + w / 2, y + h * 0.36);
  ctx.font = `${w * 0.32}px sans-serif`; ctx.fillText(icon2, x + w / 2, y + h * 0.64);
  ctx.font = `bold ${w * 0.18}px sans-serif`; ctx.fillStyle = "#ffd54a";
  ctx.fillText("🏅" + best, x + w / 2, y + h * 0.88);
}
// 選單 3 張遊戲卡（畫面與點擊命中共用同一份座標，避免不一致）
function menuCards() {
  const cw = W * 0.28, ch = H * 0.42, cy = H * 0.34, gap = W * 0.04, x0 = W * 0.04;
  return [
    { x: x0, y: cy, w: cw, h: ch, game: "whack", bg: cityImg, border: "rgba(90,170,255,0.95)", tint: "rgba(20,40,90,0.45)", i1: "👊", i2: "🦖", best: bestWhack },
    { x: x0 + (cw + gap), y: cy, w: cw, h: ch, game: "dodge", bg: spaceImg, border: "rgba(190,110,255,0.95)", tint: "rgba(40,20,80,0.45)", i1: "🏃", i2: "☄️", best: bestDodge },
    { x: x0 + (cw + gap) * 2, y: cy, w: cw, h: ch, game: "pvz", bg: lawnImg, border: "rgba(120,210,90,0.95)", tint: "rgba(20,70,20,0.45)", i1: "🏃", i2: "🧟", best: bestPvz },
  ];
}
function drawMenu() {
  ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
  if (imgReady(logoImg)) { const sz = shortSide() * 0.28; ctx.drawImage(logoImg, W / 2 - sz / 2, H * 0.03, sz, sz); } // 標題徽章
  const rad = shortSide() * 0.035;
  for (const c of menuCards()) drawCard(c.x, c.y, c.w, c.h, rad, c.bg, c.border, c.tint, c.i1, c.i2, c.best);
  // 單人/雙人 模式切換鈕（底部中央）
  const mr = shortSide() * 0.085, mx = W / 2, my = H * 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = mr * 0.08; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${mr}px sans-serif`; ctx.fillText(playerMode === "duo" ? "👥" : "👤", mx, my);
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
// 每個人胸口一個護盾核心（躲避遊戲：要保護的東西 / 接星星的接點）
function getCores() {
  const cores = [];
  for (const lm of allPose) {
    const sL = ptL(lm, 11), sR = ptL(lm, 12);
    if (!sL || !sR) continue;
    const sw = dist(sL, sR);
    const chest = mid(sL, sR), hips = mid(ptL(lm, 23), ptL(lm, 24));
    let cx = chest.x, cy = chest.y + sw * 0.4;
    if (hips) { cx = chest.x * 0.5 + hips.x * 0.5; cy = chest.y * 0.5 + hips.y * 0.5; }
    cores.push({ x: cx, y: cy, r: Math.max(sw * 0.5, shortSide() * 0.09) });
  }
  return cores;
}
function drawCores() {
  const pulse = 0.6 + 0.3 * Math.sin(performance.now() / 200);
  for (const c of dodgeCores) {
    const g = ctx.createRadialGradient(c.x, c.y, c.r * 0.2, c.x, c.y, c.r);
    g.addColorStop(0, "rgba(120,220,255,0.1)");
    g.addColorStop(0.75, `rgba(90,180,255,${0.18 * pulse})`);
    g.addColorStop(1, `rgba(120,220,255,${0.55 * pulse})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(160,235,255,${0.85 * pulse})`; ctx.lineWidth = shortSide() * 0.008;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `${c.r * 0.85}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🛡️", c.x, c.y);
  }
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
  const lvl = Math.floor(elapsed / 14);
  const interval = Math.max(0.55, 1.1 - lvl * 0.06); // 生成放慢
  const mfall = 0.22 + lvl * 0.035;                   // 掉落放慢
  spawnTimer -= dt;
  if (spawnTimer <= 0) { spawnMeteor(mfall); spawnTimer = interval; }
  if (dodgeInvuln > 0) dodgeInvuln -= dt;
  dodgeCores = getCores(); // 每個人胸口一個發光護盾（要保護、別被砸到的東西）
  // 隕石：砸到護盾 → 扣命
  for (const m of meteors) {
    if (m.dead) continue;
    m.y += m.vy * dt; m.spin += dt * 3;
    if (m.y - m.r > H) { m.dead = true; score += 1; } // 躲過 +1
    else if (dodgeInvuln <= 0) {
      for (const c of dodgeCores) {
        if ((c.x - m.x) ** 2 + (c.y - m.y) ** 2 < (m.r + c.r) ** 2) {
          m.dead = true; lives--; dodgeInvuln = 1.0; shake = 26; bombFx = 1;
          burst(m.x, m.y, "#ff7043", 22); sndBomb();
          if (lives <= 0) { gameOverPending = true; bombFx = 1.3; }
          break;
        }
      }
    }
  }
  meteors = meteors.filter((m) => !m.dead);
  // 星星：用護盾接到 → +5，每 5 顆回 1 命
  starTimer -= dt;
  if (starTimer <= 0) { spawnStar(); starTimer = 2.5 + Math.random() * 2.5; }
  for (const s of stars) {
    if (s.dead) continue;
    s.y += s.vy * dt; s.spin += dt * 2;
    if (s.y - s.r > H) { s.dead = true; }
    else {
      for (const c of dodgeCores) {
        if ((c.x - s.x) ** 2 + (c.y - s.y) ** 2 < (s.r + c.r) ** 2) {
          s.dead = true; score += 5; starCount++;
          addFloat(s.x, s.y, "+5", "#ffd54a", shortSide() * 0.08); burst(s.x, s.y, "#ffd54a", 16); sndStar();
          if (starCount % 5 === 0 && lives < 5) { lives++; addFloat(s.x, s.y - shortSide() * 0.08, "❤️+1", "#ff6b6b", shortSide() * 0.09); beep(1318, 0.15, "triangle", 0.3); }
          break;
        }
      }
    }
  }
  stars = stars.filter((s) => !s.dead);
  if (score >= DODGE_GOAL) { commitBest(); state = "win"; return; } // 達標通關
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
  drawCores();             // 護盾（要保護的東西）
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
  drawSuperHint();   // 大招教學（沒用過時）
  drawHUD();
}
function drawSuperHint() {
  if (superUsedEver) return;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
  ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * pulse;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${shortSide() * 0.06}px sans-serif`; ctx.fillStyle = "#fff";
  ctx.fillText("⬆️ ⬆️", W / 2, H * 0.72);
  ctx.font = `${shortSide() * 0.12}px sans-serif`;
  ctx.fillText("🙌", W / 2, H * 0.8);
  ctx.restore();
}

// ===================== 植物大戰殭屍（pvz：比動作擋殭屍） =====================
const pvzGroundY = () => H * 0.82;   // 殭屍走的地面線
const pvzHouseX = () => W * 0.13;    // 要守的家（陣地）X
function pickPose() {
  let k = PVZ_POSES[(Math.random() * PVZ_POSES.length) | 0];
  if (k === pvzTarget) k = PVZ_POSES[(PVZ_POSES.indexOf(k) + 1) % PVZ_POSES.length]; // 避免連續同姿勢
  return k;
}
// 用 normalized 關節判斷某人是否擺出某姿勢（判定放寬給小孩）
function poseMatch(lm, key) {
  const vis = (i) => lm[i] && lm[i].visibility > 0.3;
  if (!vis(11) || !vis(12) || !vis(0) || !vis(15) || !vis(16)) return false;
  const s11 = lm[11], s12 = lm[12], nose = lm[0], w15 = lm[15], w16 = lm[16];
  const sw = Math.abs(s11.x - s12.x) || 0.001;   // 肩寬（normalized）當尺度單位
  const shY = (s11.y + s12.y) / 2;               // 肩線 y
  const spread = Math.abs(w15.x - w16.x);        // 兩手腕水平距離
  switch (key) {
    case "handsup":   return w15.y < nose.y && w16.y < nose.y && spread < sw * 1.7;                 // 雙手舉高過頭、不太張開
    case "star":      return w15.y < shY && w16.y < shY && spread > sw * 1.7;                       // 大字：手舉肩以上 + 張很開
    case "tpose":     return Math.abs(w15.y - shY) < sw * 0.8 && Math.abs(w16.y - shY) < sw * 0.8 && spread > sw * 1.7; // 雙手平舉
    case "handshead": return Math.hypot(w15.x - nose.x, w15.y - nose.y) < sw * 1.2 && Math.hypot(w16.x - nose.x, w16.y - nose.y) < sw * 1.2 && w15.y < shY && w16.y < shY; // 抱頭
    case "armscross": {                                                                              // 抱胸：雙手在胸口、靠攏交叉
      return w15.y > shY + sw * 0.2 && w16.y > shY + sw * 0.2 && w15.y < shY + sw * 1.8 && w16.y < shY + sw * 1.8 && spread < sw * 0.9;
    }
    case "onehand": {                                                                                // 單手舉高：一手過鼻、另一手在肩下（雙邊皆可）
      const up15 = w15.y < nose.y, up16 = w16.y < nose.y, dn15 = w15.y > shY, dn16 = w16.y > shY;
      return (up15 && dn16) || (up16 && dn15);
    }
  }
  return false;
}
function anyPoseMatch(key) { for (const lm of allPose) if (poseMatch(lm, key)) return true; return false; }
function spawnZombie() {
  const r = shortSide() * 0.085;
  const lvl = Math.floor(elapsed / 15);
  const tough = lvl >= 1 && Math.random() < 0.3;   // 第二關後 30% 出鐵桶殭屍（耐打、高分）
  pvzZombies.push({ x: W + r, y: pvzGroundY() - r * 0.4 + (Math.random() - 0.5) * shortSide() * 0.04, r: tough ? r * 1.1 : r, wobble: Math.random() * 6, dead: false, hp: tough ? 2 : 1, tough });
}
function leftmostZombie() { let b = null; for (const z of pvzZombies) if (!z.dead && (!b || z.x < b.x)) b = z; return b; }
function killZombie(z) {
  z.dead = true; const pts = z.tough ? 2 : 1;
  score += pts; combo++; bestCombo = Math.max(bestCombo, combo);
  addFloat(z.x, z.y - z.r, "+" + pts, "#aef36b", shortSide() * 0.08);
  burst(z.x, z.y, "#7cb342", 16);
  if (!playSfxFile(sfxZombie)) beep(300, 0.12, "square", 0.3);
}
function firePea() {                  // 姿勢做對 → 射豌豆
  pvzLock = 0.5; pvzHold = 0; pvzFireFx = 0.25;
  pvzPeas.push({ x: pvzHouseX(), y: pvzGroundY() - shortSide() * 0.08, vx: W * 1.1, dead: false });
  if (!playSfxFile(sfxCorrect)) beep(640, 0.07, "square", 0.28);
  pvzTarget = pickPose();            // 立刻換下一個姿勢（小孩持續運動）
}
function updatePvz(dt) {
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
  const lvl = Math.floor(elapsed / 15);
  const interval = Math.max(1.0, 2.4 - lvl * 0.25);  // 殭屍生成越來越快
  pvzSpawnT -= dt;
  if (pvzSpawnT <= 0) { spawnZombie(); pvzSpawnT = interval; }
  // 殭屍前進 → 走到家扣命
  const zspeed = 0.02 + lvl * 0.004, hx = pvzHouseX();
  for (const z of pvzZombies) {
    if (z.dead) continue;
    z.x -= zspeed * W * dt; z.wobble += dt * 7;
    if (z.x - z.r <= hx) { z.dead = true; lives--; combo = 0; shake = 24; bombFx = 0.9; burst(hx, z.y, "#ff6b6b", 20); if (!playSfxFile(sfxHurt)) sndBomb(); if (lives <= 0) { gameOverPending = true; bombFx = 1.3; } }
  }
  pvzZombies = pvzZombies.filter((z) => !z.dead);
  // 姿勢比對（撐住 0.22 秒就發射）
  if (pvzLock > 0) pvzLock -= dt;
  if (!pvzTarget) pvzTarget = pickPose();
  if (pvzLock <= 0 && pvzTarget) {
    if (anyPoseMatch(pvzTarget)) { pvzHold += dt; if (pvzHold >= 0.22) firePea(); }
    else pvzHold = Math.max(0, pvzHold - dt * 0.8);
  }
  // 豌豆飛行 + 命中（碰到 x 範圍內最前面的殭屍）
  for (const p of pvzPeas) {
    if (p.dead) continue;
    p.x += p.vx * dt;
    if (p.x > W + 60) { p.dead = true; continue; }
    for (const z of pvzZombies) {
      if (!z.dead && p.x >= z.x - z.r && p.x <= z.x + z.r) {
        p.dead = true; z.hp--;
        if (z.hp <= 0) killZombie(z);
        else { burst(z.x, z.y, "#cddc39", 8); beep(360, 0.08, "square", 0.25); } // 鐵桶殭屍第一下：噴火花、還沒倒
        break;
      }
    }
  }
  pvzPeas = pvzPeas.filter((p) => !p.dead);
  pvzZombies = pvzZombies.filter((z) => !z.dead);
  if (score >= PVZ_GOAL) { commitBest(); if (!playSfxFile(pvzWinSfx)) sndVictory(); state = "win"; return; } // 擊殺達標 → 通關
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
  particles = particles.filter((p) => p.life > 0);
  updateFloats(dt);
  if (shake > 0) shake = Math.max(0, shake - dt * 60);
  if (bombFx > 0) bombFx = Math.max(0, bombFx - dt * 1.6);
  if (pvzFireFx > 0) pvzFireFx = Math.max(0, pvzFireFx - dt * 3);
}
// ---- pvz 繪製 ----
function drawPvzLawnFallback() {       // 沒有 lawn.png 時的程式草坪
  const sky = ctx.createLinearGradient(0, 0, 0, pvzGroundY());
  sky.addColorStop(0, "#8fd3ff"); sky.addColorStop(1, "#cdeeff");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, pvzGroundY());
  const gr = ctx.createLinearGradient(0, pvzGroundY(), 0, H);
  gr.addColorStop(0, "#6abf3f"); gr.addColorStop(1, "#3f8f28");
  ctx.fillStyle = gr; ctx.fillRect(0, pvzGroundY(), W, H - pvzGroundY());
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) { const y = pvzGroundY() + (H - pvzGroundY()) * i / 6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function drawHouse() {                  // 要守的家（向日葵陣地）
  const hx = pvzHouseX(), s = shortSide() * 0.16, by = pvzGroundY() - s * 0.1;
  if (imgReady(houseImg)) { const asp = houseImg.naturalHeight / houseImg.naturalWidth; ctx.drawImage(houseImg, hx - s / 2, by - s * asp, s, s * asp); return; }
  ctx.save(); ctx.translate(hx, by);   // 佔位：盆 + 向日葵
  ctx.fillStyle = "#8d5a2b"; roundRectFill(-s * 0.28, -s * 0.05, s * 0.56, s * 0.4, s * 0.06);
  ctx.strokeStyle = "#2e7d32"; ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.moveTo(0, -s * 0.05); ctx.lineTo(0, -s * 0.5); ctx.stroke();
  ctx.fillStyle = "#fdd835"; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(Math.cos(a) * s * 0.22, -s * 0.5 + Math.sin(a) * s * 0.22, s * 0.1, s * 0.05, a, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#6d4c41"; ctx.beginPath(); ctx.arc(0, -s * 0.5, s * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawZombie(z) {
  ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(Math.sin(z.wobble) * 0.08);
  const zimg = z.tough ? zombie2Img : zombieImg;
  if (imgReady(zimg)) { const asp = zimg.naturalHeight / zimg.naturalWidth, w = z.r * 2, h = w * asp; ctx.drawImage(zimg, -w / 2, -h * 0.62, w, h); ctx.restore(); return; }
  const r = z.r;                        // 佔位：綠殭屍
  ctx.fillStyle = "#6f8f3a"; roundRectFill(-r * 0.5, -r * 0.4, r, r * 1.3, r * 0.18);
  ctx.fillStyle = "#9bbf5a"; ctx.beginPath(); ctx.arc(0, -r * 0.62, r * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2b2b2b"; ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.66, r * 0.07, 0, Math.PI * 2); ctx.arc(r * 0.15, -r * 0.66, r * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#6f8f3a"; ctx.lineWidth = r * 0.18; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.1); ctx.lineTo(-r * 0.95, -r * 0.2); ctx.moveTo(r * 0.5, -r * 0.1); ctx.lineTo(r * 0.95, -r * 0.2); ctx.stroke();
  ctx.restore();
}
function drawPea(p) {
  const r = shortSide() * 0.028;
  const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.2, p.x, p.y, r);
  g.addColorStop(0, "#d4ff7a"); g.addColorStop(1, "#5fae1f");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
}
// 火柴人姿勢示意（畫在姿勢卡裡，告訴小孩要擺什麼）。每個姿勢都做成「一眼能認」的明確剪影。
function drawPoseFigure(cx, cy, s, key, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s * 0.11; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const headR = s * 0.12, neckY = cy - s * 0.3, hipY = cy + s * 0.2, shY = neckY + s * 0.06;
  ctx.beginPath(); ctx.arc(cx, neckY - headR * 0.9, headR, 0, Math.PI * 2); ctx.fill();  // 頭
  ctx.beginPath(); ctx.moveTo(cx, neckY); ctx.lineTo(cx, hipY); ctx.stroke();            // 身體
  // 腿：大字張很開、其餘自然站
  const legSpread = key === "star" ? s * 0.3 : s * 0.14;
  ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx - legSpread, cy + s * 0.52); ctx.moveTo(cx, hipY); ctx.lineTo(cx + legSpread, cy + s * 0.52); ctx.stroke();
  // 手臂：依姿勢畫成明確剪影
  ctx.beginPath();
  if (key === "handsup") {            // 萬歲：雙手往上、微開成 Y
    ctx.moveTo(cx, shY); ctx.lineTo(cx - s * 0.2, neckY - headR * 2.4);
    ctx.moveTo(cx, shY); ctx.lineTo(cx + s * 0.2, neckY - headR * 2.4);
  } else if (key === "star") {        // 大字：雙手斜上張很開
    ctx.moveTo(cx, shY); ctx.lineTo(cx - s * 0.38, cy - s * 0.5);
    ctx.moveTo(cx, shY); ctx.lineTo(cx + s * 0.38, cy - s * 0.5);
  } else if (key === "tpose") {       // 平舉：雙手水平
    ctx.moveTo(cx, shY); ctx.lineTo(cx - s * 0.44, shY);
    ctx.moveTo(cx, shY); ctx.lineTo(cx + s * 0.44, shY);
  } else if (key === "handshead") {   // 抱頭：手肘外開、手碰頭（兩段彎臂）
    ctx.moveTo(cx, shY); ctx.lineTo(cx - s * 0.3, shY - s * 0.04); ctx.lineTo(cx - headR * 0.7, neckY - headR);
    ctx.moveTo(cx, shY); ctx.lineTo(cx + s * 0.3, shY - s * 0.04); ctx.lineTo(cx + headR * 0.7, neckY - headR);
  } else if (key === "armscross") {   // 抱胸：雙手交叉到對側胸前
    ctx.moveTo(cx, shY); ctx.lineTo(cx + s * 0.22, cy + s * 0.04);
    ctx.moveTo(cx, shY); ctx.lineTo(cx - s * 0.22, cy + s * 0.04);
  } else if (key === "onehand") {     // 單手舉高：右手上、左手垂
    ctx.moveTo(cx, shY); ctx.lineTo(cx + s * 0.2, neckY - headR * 2.4);
    ctx.moveTo(cx, shY); ctx.lineTo(cx - s * 0.18, hipY - s * 0.02);
  }
  ctx.stroke();
  ctx.restore();
}
function drawPoseCard() {
  if (!pvzTarget) return;
  const matching = anyPoseMatch(pvzTarget);
  const cardW = shortSide() * 0.26, cardH = cardW * 1.15, cx = W / 2, cy = H * 0.18;
  const x = cx - cardW / 2, y = cy - cardH / 2;
  ctx.save();
  ctx.fillStyle = matching ? "rgba(60,160,40,0.85)" : "rgba(0,0,0,0.5)";
  roundRectFill(x, y, cardW, cardH, cardW * 0.12);
  ctx.strokeStyle = matching ? "#aef36b" : "rgba(255,255,255,0.7)"; ctx.lineWidth = cardW * 0.04;
  roundRectPath(x, y, cardW, cardH, cardW * 0.12); ctx.stroke();
  const pimg = poseImgs[pvzTarget];   // 公主示範圖（裝在卡內留白邊）；沒圖時退回火柴人
  if (imgReady(pimg)) {
    const pad = cardW * 0.09, iw = cardW - pad * 2, ih = cardH - pad * 2, asp = pimg.naturalHeight / pimg.naturalWidth;
    let dw = iw, dh = iw * asp; if (dh > ih) { dh = ih; dw = ih / asp; }
    ctx.drawImage(pimg, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    drawPoseFigure(cx, cy - cardH * 0.04, cardH * 0.5, pvzTarget, "#fff");
  }
  ctx.restore();
  if (pvzLock <= 0) {                  // 持續比對進度環
    const k = Math.min(1, pvzHold / 0.22);
    if (k > 0) { ctx.strokeStyle = "#aef36b"; ctx.lineWidth = cardW * 0.06; ctx.beginPath(); ctx.arc(cx, cy, cardW * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); }
  }
}
function drawPvzPlaying() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  if (latestMask && imgReady(lawnImg)) { drawBgCover(lawnImg); drawPersonMasked(latestMask); }
  else if (latestMask) { drawPvzLawnFallback(); drawPersonMasked(latestMask); }
  else if (imgReady(lawnImg)) drawBgCover(lawnImg);
  else drawPvzLawnFallback();
  drawHouse();
  for (const z of pvzZombies) drawZombie(z);
  for (const p of pvzPeas) drawPea(p);
  drawParticles();
  drawFloatTexts();
  ctx.restore();
  drawBombFx();
  drawPoseCard();
  drawHUD();
}

// ===================== 往前衝 runner（第三遊戲：植物大戰殭屍 往前衝）=====================
// 偽3D投影：worldX(-1~1 左右)、z(0=貼臉 ~ 1=遠方滅點) → 螢幕座標 + scale
const RUN_VP_Y = () => H * 0.34;          // 地平線/滅點 Y
function projRun(worldX, z) {
  const cz = Math.min(z, 0.999);           // z>1（地平線外）夾住、不畫
  const scale = Math.max(0.0001, 1 - cz);
  const x = W / 2 + worldX * W * 0.62 * scale;
  const y = RUN_VP_Y() + (H - RUN_VP_Y()) * (1 - cz);
  return { x, y, scale, visible: z < 1.0 };
}
const RUN_GOAL = 30;                       // 通關分數（打殭屍+1、穿看板+3）
const ZOMBIE_Z_SPEED = 0.32;              // 殭屍/看板逼近速度（固定、比背景慢=慢慢變大走過來）
function runnerSpawnEvent() {              // 生一個事件：殭屍 或 鏤空看板
  if (Math.random() < 0.32) {             // 看板
    runnerObjs.push({ type: "wall", worldX: 0, z: 1.3, pose: pickPose(), st: "approach", judgeT: 0, result: null });
    pvzTarget = runnerObjs[runnerObjs.length - 1].pose;
  } else {                                 // 殭屍：固定從左右兩側出現
    const lvl = Math.floor(elapsed / 18);
    const tough = lvl >= 1 && Math.random() < 0.3;
    const side = Math.random() < 0.5 ? -1 : 1;
    runnerObjs.push({ type: "zombie", worldX: side * (0.4 + Math.random() * 0.25), side, z: 1.4, hp: tough ? 2 : 1, tough, dead: false, hitCd: 0, wobble: Math.random() * 6 });
  }
}
function runnerSpawnBuilding() {           // 路旁房子/樹（純佈景、製造速度感）
  const side = Math.random() < 0.5 ? -1 : 1;
  runnerObjs.push({ type: "build", worldX: side * (0.78 + Math.random() * 0.5), z: 1, h: 0.18 + Math.random() * 0.22, hue: 20 + Math.random() * 40 });
}
function computePunchSpeed() {             // 揮拳速度 = 手相對上一取樣移動的最大距離
  let mx = 0;
  for (const h of hands) { let best = 1e9; for (const p of prevHands) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < best) best = d; } if (best < 1e9) mx = Math.max(mx, best); }
  prevHands = hands.map((h) => ({ x: h.x, y: h.y }));
  return mx;
}
function updateRunner(dt) {
  if (gameOverPending) {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
    particles = particles.filter((p) => p.life > 0);
    if (shake > 0) shake = Math.max(0, shake - dt * 60);
    if (bombFx > 0) bombFx = Math.max(0, bombFx - dt * 1.6);
    if (bombFx <= 0) { commitBest(); state = "gameover"; gameOverPending = false; }
    return;
  }
  poseFrame++;
  if (poseFrame % 2 === 0) { senseBody(); punchSpeed = computePunchSpeed(); } // 隔幀偵測省效能
  elapsed += dt;
  runnerSpeed = Math.min(1.3, 0.5 + elapsed * 0.02);   // 越跑越快
  runnerDist += runnerSpeed * dt;
  runnerStripe = (runnerStripe + runnerSpeed * dt) % 1; // 地面速度線流動
  // 生成
  const wallOnScreen = runnerObjs.some((o) => o.type === "wall" && o.st !== "pass" && o.st !== "fail");
  runnerSpawnT -= dt;
  if (runnerSpawnT <= 0 && !wallOnScreen) { runnerSpawnEvent(); runnerSpawnT = Math.max(1.0, 1.8 - elapsed * 0.02); } // 看板在場時暫停生成(降認知負荷)
  runnerBuildT -= dt;
  if (runnerBuildT <= 0) { // 左右各噴一棵樹掠過 → 前進感
    const hue = 95 + Math.random() * 35;
    runnerObjs.push({ type: "tree", worldX: -(0.62 + Math.random() * 0.5), z: 1, hue });
    runnerObjs.push({ type: "tree", worldX: (0.62 + Math.random() * 0.5), z: 1, hue });
    runnerBuildT = Math.max(0.18, 0.34 - elapsed * 0.004);
  }
  // 移動 + 邏輯
  const HR = HAND_R();
  for (const o of runnerObjs) {
    o.z -= (o.type === "zombie" || o.type === "wall" ? ZOMBIE_Z_SPEED : runnerSpeed) * dt; // 殭屍/看板慢慢逼近、樹快速掠過
    if (o.type === "zombie") {
      o.wobble += dt * 7; if (o.hitCd > 0) o.hitCd -= dt; if (o.knock) o.knock *= 0.88;
      if (!o.dead && o.z < 0.55 && o.z > 0.02 && o.hitCd <= 0 && punchSpeed > shortSide() * 0.05) { // 可打範圍加寬(更早能打)
        const pr = projRun(o.worldX, o.z);
        const cr = Math.min(shortSide() * 0.14 * pr.scale, shortSide() * 0.24);
        for (const h of hands) {
          if ((h.x - pr.x) ** 2 + (h.y - pr.y) ** 2 < (cr + HR) ** 2) {
            o.hp--; o.hitCd = 0.25; shake = Math.max(shake, 8);
            burst(h.x, h.y, "#ffffff", 10);            // 拳頭打擊白閃
            if (o.hp <= 0) { o.dead = true; const pts = o.tough ? 2 : 1; score += pts; combo++; bestCombo = Math.max(bestCombo, combo); addFloat(pr.x, pr.y, "+" + pts, "#aef36b", shortSide() * 0.09); burst(pr.x, pr.y, "#7cb342", 18); if (!playSfxFile(sfxZombie)) beep(300, 0.12, "square", 0.3); }
            else { o.knock = (o.worldX < 0 ? -1 : 1) * 0.12; burst(pr.x, pr.y, "#cddc39", 10); beep(360, 0.08, "square", 0.25); } // 鐵桶第一下被打歪
            break;
          }
        }
      }
      if (!o.dead && o.z <= 0.02) { o.dead = true; lives--; combo = 0; shake = 22; bombFx = 0.9; if (!playSfxFile(sfxHurt)) sndBomb(); if (lives <= 0) { gameOverPending = true; bombFx = 1.3; } } // 撞到玩家
    } else if (o.type === "wall") {
      if (o.st === "approach" && o.z < 0.4) { o.st = "judge"; o.judgeT = 0.9; }
      if (o.st === "judge") {
        o.judgeT -= dt;
        if (anyPoseMatch(o.pose)) { o.st = "pass"; score += 3; const pr = projRun(0, o.z); addFloat(W / 2, pr.y, "+3", "#aef36b", shortSide() * 0.1); burst(W / 2, pr.y, "#aef36b", 20); if (!playSfxFile(sfxCorrect)) beep(880, 0.1, "triangle", 0.3); }
        else if (o.judgeT <= 0 || o.z <= 0.04) { o.st = "fail"; lives--; combo = 0; shake = 24; bombFx = 1; if (!playSfxFile(sfxHurt)) sndBomb(); if (lives <= 0) { gameOverPending = true; bombFx = 1.3; } }
      }
    }
  }
  runnerObjs = runnerObjs.filter((o) => o.z > -0.06 && !(o.type === "zombie" && o.dead));
  runnerObjs.sort((a, b) => b.z - a.z); // 遠的先畫
  if (score >= RUN_GOAL) { commitBest(); if (!playSfxFile(pvzWinSfx)) sndVictory(); state = "win"; return; }
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt * 1.6; }
  particles = particles.filter((p) => p.life > 0);
  updateFloats(dt);
  if (shake > 0) shake = Math.max(0, shake - dt * 60);
  if (bombFx > 0) bombFx = Math.max(0, bombFx - dt * 1.6);
}
// ---- runner 繪製 ----
function drawRunnerGround() {              // 地面流動速度線（疊在 lawn 路面上、製造前進感）
  const vy = RUN_VP_Y();
  const speedA = Math.min(1, runnerSpeed / 1.3);
  ctx.save();
  // 20 條橫向速度線（密+亮+隨速度增強）
  ctx.lineWidth = Math.max(1.5, shortSide() * 0.004);
  for (let i = 0; i < 20; i++) {
    const z = ((i / 20 + runnerStripe) % 1);
    const p = projRun(0, z);
    const halfW = (W * 0.5) * (1 - z) * 0.92;
    ctx.strokeStyle = `rgba(255,255,210,${(1 - z) * (0.28 + 0.5 * speedA)})`;
    ctx.beginPath(); ctx.moveTo(W / 2 - halfW, p.y); ctx.lineTo(W / 2 + halfW, p.y); ctx.stroke();
  }
  // 左右兩條透視路邊線（往滅點收斂）
  ctx.lineWidth = Math.max(2, shortSide() * 0.008);
  ctx.strokeStyle = `rgba(255,255,170,${0.45 * speedA})`;
  ctx.beginPath();
  ctx.moveTo(W * 0.18, H); ctx.lineTo(W / 2, vy);
  ctx.moveTo(W * 0.82, H); ctx.lineTo(W / 2, vy);
  ctx.stroke();
  ctx.restore();
}
function drawRunnerTree(o) {               // 路側樹（從滅點往兩側掠過、parallax 前進感）
  const p = projRun(o.worldX, o.z);
  const s = shortSide() * 0.5 * p.scale;
  if (s < 4) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, (1 - o.z) * 1.8);
  ctx.fillStyle = "#7a5230"; ctx.fillRect(p.x - s * 0.06, p.y - s * 0.5, s * 0.12, s * 0.5);        // 樹幹
  ctx.fillStyle = `hsl(${o.hue},55%,42%)`; ctx.beginPath(); ctx.arc(p.x, p.y - s * 0.6, s * 0.34, 0, Math.PI * 2); ctx.fill(); // 樹冠
  ctx.fillStyle = `hsl(${o.hue},55%,50%)`; ctx.beginPath(); ctx.arc(p.x - s * 0.12, p.y - s * 0.72, s * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawRunnerBuilding(o) {
  const p = projRun(o.worldX, o.z);
  const w = shortSide() * 0.5 * p.scale, h = H * o.h * (0.6 + (1 - o.z));
  ctx.save(); ctx.globalAlpha = Math.min(1, (1 - o.z) * 1.6);
  ctx.fillStyle = `hsl(${o.hue},45%,55%)`; ctx.fillRect(p.x - w / 2, p.y - h, w, h);
  ctx.fillStyle = `hsl(${o.hue},45%,42%)`; ctx.fillRect(p.x - w / 2, p.y - h, w, h * 0.18); // 屋頂帶
  ctx.restore();
}
function drawRunnerZombie(o) {
  const p = projRun(o.worldX + (o.knock || 0), o.z);
  if (!p.visible) return;                   // 還在地平線外（剛生成、很遠）先不畫
  const w = shortSide() * 0.24 * p.scale;
  const inRange = o.z < 0.55 && o.z > 0.02;
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(o.wobble) * 0.06);
  if (inRange) { ctx.shadowColor = "#ffe23a"; ctx.shadowBlur = shortSide() * 0.05; } // 可打擊：發光提示
  const zimg = o.tough ? zombie2Img : zombieImg;
  if (imgReady(zimg)) { const asp = zimg.naturalHeight / zimg.naturalWidth; ctx.drawImage(zimg, -w / 2, -w * asp * 0.92, w, w * asp); }
  else { ctx.fillStyle = "#6f8f3a"; ctx.beginPath(); ctx.arc(0, -w * 0.4, w * 0.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  if (inRange) {                          // 揮拳提示（頭頂閃爍拳頭）
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 150);
    ctx.font = `${Math.max(shortSide() * 0.06, w * 0.5)}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("👊", p.x, p.y - w * 0.9);
    ctx.restore();
  }
}
// 粗手臂（實心多邊形，給挖洞剪影用）
function fillThickArm(c, x1, y1, x2, y2, thick) {
  const ang = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
  const dx = Math.cos(ang) * thick / 2, dy = Math.sin(ang) * thick / 2;
  c.beginPath(); c.moveTo(x1 + dx, y1 + dy); c.lineTo(x2 + dx, y2 + dy); c.lineTo(x2 - dx, y2 - dy); c.lineTo(x1 - dx, y1 - dy); c.closePath(); c.fill();
  c.beginPath(); c.arc(x2, y2, thick / 2, 0, Math.PI * 2); c.fill(); // 手端圓頭
}
// 實心人形剪影（填滿，給 destination-out 挖洞用）
function fillPoseSilhouette(c, cx, cy, s, key) {
  c.fillStyle = "#000";
  const headR = s * 0.13, neckY = cy - s * 0.26, hipY = neckY + s * 0.46, shY = neckY + s * 0.05;
  c.beginPath(); c.arc(cx, neckY - headR * 0.6, headR, 0, Math.PI * 2); c.fill();          // 頭
  c.fillRect(cx - s * 0.12, neckY, s * 0.24, s * 0.48);                                      // 身體
  const armW = s * 0.13, legW = s * 0.15;
  const legSpread = key === "star" ? s * 0.26 : s * 0.1;
  fillThickArm(c, cx, hipY, cx - legSpread, cy + s * 0.5, legW);                             // 腿
  fillThickArm(c, cx, hipY, cx + legSpread, cy + s * 0.5, legW);
  if (key === "handsup") { fillThickArm(c, cx, shY, cx - s * 0.18, neckY - headR * 2.2, armW); fillThickArm(c, cx, shY, cx + s * 0.18, neckY - headR * 2.2, armW); }
  else if (key === "star") { fillThickArm(c, cx, shY, cx - s * 0.42, cy - s * 0.42, armW); fillThickArm(c, cx, shY, cx + s * 0.42, cy - s * 0.42, armW); }
  else if (key === "tpose") { fillThickArm(c, cx, shY, cx - s * 0.46, shY, armW); fillThickArm(c, cx, shY, cx + s * 0.46, shY, armW); }
  else if (key === "handshead") { fillThickArm(c, cx, shY, cx - s * 0.26, shY - s * 0.06, armW); fillThickArm(c, cx - s * 0.26, shY - s * 0.06, cx - s * 0.1, neckY - headR * 1.2, armW); fillThickArm(c, cx, shY, cx + s * 0.26, shY - s * 0.06, armW); fillThickArm(c, cx + s * 0.26, shY - s * 0.06, cx + s * 0.1, neckY - headR * 1.2, armW); }
  else if (key === "armscross") { fillThickArm(c, cx, shY, cx + s * 0.2, hipY - s * 0.04, armW); fillThickArm(c, cx, shY, cx - s * 0.2, hipY - s * 0.04, armW); }
  else if (key === "onehand") { fillThickArm(c, cx, shY, cx + s * 0.18, neckY - headR * 2.2, armW); fillThickArm(c, cx, shY, cx - s * 0.16, hipY - s * 0.02, armW); }
}
const _wallCache = {};
function getWallCanvas(pose) {              // 預烤「中間挖空人形洞」的看板（每姿勢快取一次）
  const key = pose + "_" + W + "x" + H;
  if (_wallCache[key]) return _wallCache[key];
  const bw = Math.max(2, Math.round(W * 1.1)), bh = Math.max(2, Math.round(H * 0.95));
  const oc = document.createElement("canvas"); oc.width = bw; oc.height = bh;
  const c = oc.getContext("2d");
  c.fillStyle = "#1f9e2e"; c.fillRect(0, 0, bw, bh);                                          // 綠牌面（像影片）
  c.fillStyle = "#157a22"; c.fillRect(0, 0, bw, bh * 0.06); c.fillRect(0, bh * 0.94, bw, bh * 0.06); // 上下橫木
  c.lineWidth = bw * 0.03; c.strokeStyle = "#ffd56b"; c.strokeRect(c.lineWidth, c.lineWidth, bw - c.lineWidth * 2, bh - c.lineWidth * 2); // 金邊
  c.globalCompositeOperation = "destination-out";                                             // 挖空人形洞（透出後方）
  fillPoseSilhouette(c, bw / 2, bh / 2, Math.min(bw, bh) * 0.72, pose);
  c.globalCompositeOperation = "source-over";
  _wallCache[key] = oc; return oc;
}
function drawRunnerWall(o) {
  if (o.z >= 1) return;                      // 還在地平線外先不畫
  const s = 1 - o.z;
  const wallW = W * 1.3 * s, wallH = H * 1.02 * s; // 放大、越近越佔滿畫面
  if (wallW < 8) return;
  const cx = W / 2, cy = RUN_VP_Y() + (H - RUN_VP_Y()) * (1 - o.z) - wallH * 0.5;
  const matching = o.st === "judge" && anyPoseMatch(o.pose);
  const oc = getWallCanvas(o.pose);
  ctx.save();
  ctx.globalAlpha = o.st === "pass" ? Math.max(0, o.z * 16) : 0.92;                            // 穿過後淡出
  ctx.filter = (matching || o.st === "pass") ? "hue-rotate(120deg) saturate(1.5)" : o.st === "fail" ? "grayscale(0.85)" : "none"; // 做對變綠(舊iOS不支援filter→維持紅,仍可玩)
  ctx.drawImage(oc, cx - wallW / 2, cy - wallH / 2, wallW, wallH);
  ctx.restore();
}
function drawRunnerHint() {                // 看板還遠時、上方先提示「等下要擺的姿勢」
  let nextWall = null;
  for (const o of runnerObjs) if (o.type === "wall" && (o.st === "approach" || o.st === "judge") && (!nextWall || o.z < nextWall.z)) nextWall = o;
  if (!nextWall) return;
  const pimg = poseImgs[nextWall.pose];
  const s = shortSide() * 0.16, x = W / 2 - s / 2, y = H * 0.04;
  ctx.save(); ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(0,0,0,0.4)"; roundRectFill(x - s * 0.1, y - s * 0.05, s * 1.2, s * 1.15, s * 0.12);
  if (imgReady(pimg)) { const asp = pimg.naturalHeight / pimg.naturalWidth; ctx.drawImage(pimg, x, y, s, s * asp > s * 1 ? s : s * asp); }
  ctx.restore();
}
function drawCamWindow() {                 // 右下角小鏡頭框（看得到自己）
  const w = W * 0.24, h = w * 0.78, pad = shortSide() * 0.03, x = W - w - pad, y = H - h - pad;
  ctx.save();
  roundRectPath(x, y, w, h, w * 0.08); ctx.clip();
  ctx.translate(x + w, y); ctx.scale(-1, 1);
  try { ctx.drawImage(video, 0, 0, w, h); } catch (e) {}
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = shortSide() * 0.006; roundRectPath(x, y, w, h, w * 0.08); ctx.stroke();
}
function drawRunnerPlaying() {
  const useVid = runnerBgOn && bgVideo.readyState >= 2 && !bgVideo.paused; // 影片背景在播？
  if (useVid) ctx.clearRect(0, 0, W, H);                                   // 透明 → 露出後面的循環影片
  else if (imgReady(lawnImg)) drawBgCover(lawnImg);
  else drawPvzLawnFallback();
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  if (!useVid) drawRunnerGround();         // 影片自帶前進感，不用程式速度線
  for (const o of runnerObjs) {            // 已依 z 由遠到近排序
    if (o.type === "tree") { if (!useVid) drawRunnerTree(o); } // 影片自帶路樹
    else if (o.type === "zombie") drawRunnerZombie(o);
    else if (o.type === "wall") drawRunnerWall(o);
  }
  drawParticles();
  drawHands();                             // 玩家拳頭（發光拳，看得到打到哪）
  drawFloatTexts();
  ctx.restore();
  drawBombFx();
  drawRunnerHint();
  drawCamWindow();
  drawHUD();
}

// ===================== 主迴圈 =====================
function loop(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
  lastTs = ts;
  fpsTick(ts);
  if (!(state === "playing" && currentGame === "pvz") && bgVideo.style.display === "block") showBgVideo(false); // 離開往前衝就關背景影片
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); // iOS 切背景回來後恢復音效
  if (state === "boot") drawBoot();
  else if (state === "loading") drawLoading();
  else if (state === "menu") drawMenu();
  else if (state === "transform") drawTransform(dt);
  else if (state === "playing") {
    if (currentGame === "dodge") { updateDodge(dt); drawDodgePlaying(); }
    else if (currentGame === "pvz") { updateRunner(dt); drawRunnerPlaying(); }
    else { update(dt); drawWhackPlaying(); }
  } else if (state === "gameover") drawGameOver();
  else if (state === "win") drawWin();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
