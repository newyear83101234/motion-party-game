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
import { decryptSong } from "./song-crypto.js";

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
const stageKpopImg = new Image(); stageKpopImg.src = "IMAGE/sprites/stage_kpop.png"; // K-pop 舞台背景（阿葉後製、缺圖時卡片用程式底色）
const runnerFirstImg = new Image(); runnerFirstImg.src = "IMAGE/runner_bg_first.png"; // 影片第一幀（影片還沒播時當墊檔、街景一致）
const kpDemonImg = new Image(); kpDemonImg.src = "IMAGE/sprites/demo.png"; // 獵魔女團小紫惡魔（阿葉生、Q版透明PNG、靜態 fallback）
const kpDemonFrames = []; for (let i = 0; i < 8; i++) { const im = new Image(); im.src = `IMAGE/sprites/demon_frames/d${i}.png`; kpDemonFrames.push(im); } // 拍翅動畫8幀(阿葉綠幕影片抽幀去背、ping-pong輪播)
const zombieImg = new Image(); zombieImg.src = "IMAGE/sprites/zombie.png";    // 殭屍（走路第1格）
const zombieImgB = new Image(); zombieImgB.src = "IMAGE/sprites/zombie_b.png"; // 殭屍走路第2格（有放才會走動、沒放自動沿用第1格）
const zombie2Img = new Image(); zombie2Img.src = "IMAGE/sprites/zombie2.png"; // 鐵桶殭屍（耐打、高分）
const zombie2ImgB = new Image(); zombie2ImgB.src = "IMAGE/sprites/zombie2_b.png"; // 鐵桶殭屍走路第2格
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
let runnerWantBg = false, runnerBgDegraded = false; // 此局想用影片背景 / 是否因效能降級
// 獵魔女團「跟著舞者跳」示範影片（CSS背景、鏡像顯示給小孩照跳）
const kpDanceVid = document.createElement("video");
kpDanceVid.src = "VIDEO/kpop_dance.mp4?v=q5"; kpDanceVid.loop = true; kpDanceVid.muted = true; kpDanceVid.preload = "auto"; // ?v=換影片時改版號、破瀏覽器快取
kpDanceVid.playsInline = true; kpDanceVid.setAttribute("playsinline", ""); kpDanceVid.setAttribute("webkit-playsinline", "");
kpDanceVid.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#0c0820 url('IMAGE/sprites/stage_kpop2.png') center/cover no-repeat;z-index:0;display:none;transform:scaleX(-1)"; // contain留邊處透出魔法森林夜空背景
document.body.appendChild(kpDanceVid);
let kpRef = null, kpEnergy = 0, kpMatch = 0, kpSpawnT = 0, kpFlash = 0; // 示範動作序列/能量/當下相似度/惡魔生成計時/打擊閃光
// 每幀重評估：影片晚點才載好也會自動接上（解決「進場時影片還沒下載完→永遠 fallback」的 bug）。回傳是否真的在用影片
function syncBgVideo() {
  const want = runnerWantBg && !runnerBgDegraded && bgVideo.readyState >= 2;
  if (want) {
    if (bgVideo.style.display !== "block") bgVideo.style.display = "block";
    if (bgVideo.paused) bgVideo.play().catch(() => {});
    return !bgVideo.paused;
  }
  if (bgVideo.style.display !== "none") { bgVideo.style.display = "none"; try { bgVideo.pause(); } catch (e) {} }
  return false;
}
// FPS 監控：runner 用影片背景時若連續太卡 → 自動降級回靜態背景
let _fpsFrames = 0, _fpsLast = 0, _fpsLow = 0;
function fpsTick(ts) {
  _fpsFrames++;
  if (!_fpsLast) { _fpsLast = ts; return; }
  if (ts - _fpsLast >= 1000) {
    const fps = _fpsFrames * 1000 / (ts - _fpsLast); _fpsFrames = 0; _fpsLast = ts;
    if (state === "playing" && currentGame === "pvz" && runnerWantBg && !runnerBgDegraded && elapsed > 5) {
      if (fps < 15) { _fpsLow++; if (_fpsLow >= 4) runnerBgDegraded = true; } else _fpsLow = 0; // 5秒寬限後、連續4秒<15fps才降級(優先讓影片顯示)
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
let bestWhack = 0, bestDodge = 0, bestPvz = 0, bestKpop = 0;   // 最高分（localStorage）
// 植物大戰殭屍（pvz：比動作擋殭屍）狀態
let pvzTarget = null; // runner 用：目前要擺的姿勢（舊守家版其餘狀態已隨死碼移除）
// 往前衝 runner 狀態（第三遊戲現用）
let runnerObjs = [], runnerSpeed = 0.5, runnerDist = 0, runnerSpawnT = 0, runnerBuildT = 0;
let prevHands = [], punchSpeed = 0, poseFrame = 0, runnerStripe = 0;
let lastSenseTs = 0, noPersonT = 0, runnerPaused = false; // 揮拳速度時間正規化用 / 偵測不到人累計秒數 / runner 是否因沒人而暫停
const PVZ_POSES = ["handsup", "star", "tpose", "handshead", "armscross", "onehand"]; // 6 個姿勢（key 對應 pose 圖檔名）
// 獵魔女團 K-pop 節奏狀態（kp 前綴）
let kpDemons = [], kpBeatmap = null, kpAudioBuf = null, kpSource = null;
let kpT0 = 0, kpSongTime = 0, kpNoteIdx = 0;
let kpStars = 0, kpStolen = 0, kpPerfect = 0, kpGood = 0, kpMiss = 0;
let kpWaveT = -9, kpWaveGold = false; // 命中節點放出的光波特效（轟飛惡魔用）
let kpNextSpawn = 2.0; // 下一隻惡魔的歌曲時間（用音訊時鐘驅動、低fps也不掉密度）
let kpStage = "intro", kpBossCharge = 0; // intro|verse|chorus|bridge|boss|done
let kpTutorIdx = 0; // 教學前奏目前示範到第幾式
let kpPwOK = false, kpPwBuf = "";          // 密碼門：是否通過 / 已輸入緩衝
const KP_SONG_BPM = 123, KP_SONG_OFFSET = 0.18; // GOLDEN 實測 123BPM、首起聲 0.18s（ffmpeg 量測）
// 第一版用現有已驗證、互斥乾淨的姿勢（排除叉腰handshead易遮擋；保留好判的）
const KP_POSES = ["handsup", "star", "tpose", "armscross", "onehand"];
function kpBeatTime(beat) { return KP_SONG_OFFSET + beat * 60 / KP_SONG_BPM; } // 第幾拍 → 秒
// 測試用：每 2 拍一隻惡魔、姿勢輪換、左右交替（真歌 beatmap 之後手工標）
function buildTestBeatmap() {
  const notes = [];
  for (let i = 0; i < 40; i++) {
    notes.push({ beat: 8 + i * 2, pose: KP_POSES[i % KP_POSES.length], side: i % 2 ? 1 : -1, spawned: false });
  }
  return { bpm: KP_SONG_BPM, offset: KP_SONG_OFFSET, notes };
}
const KP_APPROACH = 2.0;          // 惡魔提前 2 秒出現開始走
const KP_PERFECT_W = 0.45, KP_GOOD_W = 0.75, KP_SENSE_LAG = 0.12; // 判定窗(秒)、感測延遲補償
// 段落邊界（秒）；真歌 beatmap 完成後校準。GOLDEN 全長約 194s
const KP_SECTIONS = [
  { stage: "intro",  until: 10 },   // 教學前奏（跟著擺、零失敗）
  { stage: "verse",  until: 60 },
  { stage: "chorus", until: 120 },
  { stage: "bridge", until: 140 },  // 呼吸點：無惡魔
  { stage: "boss",   until: 999 },  // 尾段 Boss
];
function kpStageAt(t) { for (const s of KP_SECTIONS) if (t < s.until) return s.stage; return "boss"; }
const KP_RING_Y = () => H * 0.62; // 光圈判定區 Y（玩家腳前）
function kpSpawnDemon(note) {
  const hitTime = kpBeatTime(note.beat);
  kpDemons.push({ note, hitTime, side: note.side, pose: note.pose, dead: false, judged: false, stolen: false, wob: Math.random() * 6 });
}
function kpDemonPos(d) {
  const prog = Math.min(1.2, (kpSongTime - (d.hitTime - KP_APPROACH)) / KP_APPROACH); // 0=剛出現 1=到光圈
  const ex = d.side < 0 ? W * 0.04 : W * 0.96;     // 起點（畫面邊）
  const cx = d.side < 0 ? W * 0.4 : W * 0.6;        // 終點（光圈兩側）
  const x = ex + (cx - ex) * prog;
  const y = H * 0.3 + (KP_RING_Y() - H * 0.3) * prog;
  const scale = 0.4 + 0.6 * prog;
  return { x, y, scale, prog };
}
const KP_POSE_ICON = { handsup: "🙌", star: "🤩", tpose: "🧎", armscross: "🙅", onehand: "🙋", handshead: "🙆" };
function kpDrawPoseIcon(pose, x, y, s) {
  ctx.font = `${s}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(KP_POSE_ICON[pose] || "❓", x, y);
}
let allPose = [], superHead = null; // 雙人：所有偵測到的人 / 大招充能者的頭
let playerMode = "solo";            // 玩家模式："solo"（單人）| "duo"（雙人）
let starCount = 0, dodgeCores = []; // 接到的星星數 / 躲避護盾核心位置
let superUsedEver = false;          // 是否用過大招（用過就不再顯示教學）
const WIN_STAGE = 3, DODGE_GOAL = 40; // 通關條件：打怪打贏3隻Boss / 躲避達標分數（往前衝用 RUN_GOAL）
let spawnTimer = 0, spawnInterval = 0.85, fallSpeed = 0.28, elapsed = 0, lastTs = 0;
const TRANSFORM_DUR = 2.0;
// 最高分（存在手機裡，給「破紀錄」動機）
function lsGet(k) { try { return +(localStorage.getItem(k) || 0); } catch (e) { return 0; } }
function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
bestWhack = lsGet("best_whack"); bestDodge = lsGet("best_dodge"); bestPvz = lsGet("best_pvz"); bestKpop = lsGet("best_kpop");
playerMode = lsGet("player_mode") === 1 ? "duo" : "solo";
superUsedEver = lsGet("super_used") === 1;
function commitBest() {
  if (currentGame === "whack") { if (score > bestWhack) { bestWhack = score; lsSet("best_whack", score); } }
  else if (currentGame === "pvz") { if (score > bestPvz) { bestPvz = score; lsSet("best_pvz", score); } }
  else if (currentGame === "kpop") { if (score > bestKpop) { bestKpop = score; lsSet("best_kpop", score); } }
  else { if (score > bestDodge) { bestDodge = score; lsSet("best_dodge", score); } }
}
function currentBest() { return currentGame === "whack" ? bestWhack : currentGame === "pvz" ? bestPvz : currentGame === "kpop" ? bestKpop : bestDodge; }
// 飄分數文字
function addFloat(x, y, text, color, size, decay = 1.3) { floatTexts.push({ x, y, text, color, size, life: 1, decay }); }
function updateFloats(dt) {
  for (const f of floatTexts) { f.y -= dt * shortSide() * 0.55 * (f.decay < 1 ? 0.5 : 1); f.life -= dt * f.decay; } // 慢消的也飄慢一點
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
let errIcon = "📷"; // error 畫面顯示的符號（相機問題=📷、載入問題=📡）
async function startGame() {
  if (starting) return;
  starting = true; state = "loading";
  try {
    initAudio();
    ALL_BGM.forEach((a) => { try { a.muted = true; const p = a.play(); if (p) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {}); } catch (e) {} }); // 靜音播一下解鎖手機音訊、立刻歸零（避免脫稿殘留）
    try { const pv = bgVideo.play(); if (pv) pv.then(() => bgVideo.pause()).catch(() => {}); } catch (e) {} // 在使用者手勢內解鎖背景影片自動播放
    await startCamera(video);
    await initPoseDetector(playerMode === "duo" ? 2 : 1); // 單人只抓1人(省效能)、雙人抓2人
    playBgmTrack(bgmMenu);
    state = "menu"; // 載入完成 → 進「選遊戲」選單
  } catch (err) {
    console.error("啟動失敗：", err);
    // 區分錯誤類型給對應圖示：相機權限被拒/逾時=📷、模型/CDN 載不到=📡。進 error 畫面而非默默退回(小孩會卡按鈕迴圈)
    const msg = String(err && (err.name || err.message) || err);
    errIcon = /NotAllowed|Permission|Denied|camera|NotFound|NotReadable|timeout/i.test(msg) ? "📷" : "📡";
    state = "error";
  }
  starting = false;
}

// 共用：偵測身體 → 填 poseLandmarks / hands / latestMask（兩個遊戲都用）
function senseBody() {
  const res = detect(video, performance.now(), currentGame !== "pvz"); // runner 不需要人像遮罩、跳過省效能
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
  prevHands = []; punchSpeed = 0; poseFrame = 0; runnerStripe = 0; pvzTarget = null; lastSenseTs = 0; noPersonT = 0;
  elapsed = 0;
}
function startPvz() { currentGame = "pvz"; resetPvz(); playBgmTrack(bgmPvz); _fpsLow = 0; runnerBgDegraded = false; runnerWantBg = true; try { bgVideo.playbackRate = 0.65; } catch (e) {} bgVideo.play().catch(() => {}); state = "playing"; } // 影片放慢=前進更慢
function resetKpop() {
  score = 0; combo = 0; bestCombo = 0;
  particles = []; floatTexts = []; shake = 0; bombFx = 0; gameOverPending = false;
  kpDemons = []; kpNoteIdx = 0; kpStars = 0; kpStolen = 0; kpPerfect = 0; kpGood = 0; kpMiss = 0; kpWaveT = -9;
  kpStage = "intro"; kpBossCharge = 0; kpSongTime = 0; elapsed = 0; kpTutorIdx = 0;
  kpEnergy = 0; kpMatch = 0; kpSpawnT = 2.0; kpFlash = 0;
  kpBeatmap = buildTestBeatmap(); kpNoteIdx = 0;
  prevHands = []; punchSpeed = 0; poseFrame = 0; lastSenseTs = 0; noPersonT = 0; pvzTarget = null;
  kpChoreo = buildChoreo();
  kpNodeIdx = 0; kpNodeBest = 0; kpNodeFx = 0; kpSpawnT = 2.0; kpDemons = []; kpNextSpawn = 2.0;
}
function startKpop() {
  currentGame = "kpop"; resetKpop();
  if (kpAudioBuf) { startKpopSong(); }          // 本次 session 已解碼 → 直接玩
  else { kpPwBuf = ""; state = "kppassword"; }   // 否則進密碼門（重開 app 要再輸一次、可接受）
}
async function tryKpUnlock() {
  state = "loading";
  try {
    const resp = await fetch("MUSIC/track4.bin");
    if (!resp.ok) throw new Error("enc not found");
    const enc = await resp.arrayBuffer();
    const mp3 = await decryptSong(enc, kpPwBuf);    // 密碼錯會 throw
    if (!audioCtx) initAudio();
    kpAudioBuf = await audioCtx.decodeAudioData(mp3); // 解碼成 AudioBuffer
    startKpopSong();
  } catch (e) {
    console.warn("密碼錯或解密/解碼失敗：", e);
    kpPwBuf = ""; shake = 18; state = "kppassword"; // 抖一下、清空重試
  }
}
async function startKpopSong() {
  if (!kpRef) { try { kpRef = await (await fetch("VIDEO/kpop_dance.json?v=q5")).json(); } catch (e) { console.warn("舞步資料載入失敗", e); } } // ?v=與影片同步換版號
  if (kpRef) kpChoreo = buildChoreoFromRef();   // 骨架載到→節點改「動作峰值對齊」(招牌pose、非過渡幀)
  state = "playing";
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  for (const t of ALL_BGM) { try { t.pause(); } catch (e) {} } activeBgm = null;
  try { if (kpSource) kpSource.stop(); } catch (e) {}
  kpSource = audioCtx.createBufferSource();
  kpSource.buffer = kpAudioBuf;
  kpSource.connect(audioCtx.destination);
  kpT0 = audioCtx.currentTime + 0.1;
  kpSource.start(kpT0);
  kpSource.onended = () => { if (state === "playing" && currentGame === "kpop") kpStage = "done"; };
  runnerWantBg = false;
  // AI舞者影片(主角1)當全螢幕coach背景、跟歌曲時鐘同步(updateKpop內校正)
  try { kpDanceVid.currentTime = 0; } catch (e) {}
  kpDanceVid.style.display = "block";
  kpDanceVid.play().catch(() => {});
}
function pickGame(g) { if (g === "dodge") startDodge(); else if (g === "pvz") startPvz(); else if (g === "kpop") startKpop(); else startWhack(); }
function togglePlayerMode() {
  playerMode = playerMode === "duo" ? "solo" : "duo";
  lsSet("player_mode", playerMode === "duo" ? 1 : 0);
  initPoseDetector(playerMode === "duo" ? 2 : 1).catch(() => {}); // 重建模型（單人省效能 + 不被路人干擾）
}

canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (W / rect.width);   // 校正：CSS 座標 → canvas 座標
  const py = (e.clientY - rect.top) * (H / rect.height);
  if (state === "boot" || state === "error") { startGame(); return; } // error 畫面點一下重試
  if (state === "kppassword") {
    const rr = shortSide() * 0.07, hx = shortSide() * 0.04 + rr, hy = shortSide() * 0.04 + rr;
    if ((px - hx) ** 2 + (py - hy) ** 2 < rr * rr) { playBgmTrack(bgmMenu); state = "menu"; return; }
    for (const g of kpPadKeys()) {
      if (px >= g.x && px <= g.x + g.w && py >= g.y && py <= g.y + g.h) {
        if (g.k === "⌫") kpPwBuf = kpPwBuf.slice(0, -1);
        else if (g.k === "✓") tryKpUnlock();
        else if (kpPwBuf.length < 8) kpPwBuf += g.k;
        return;
      }
    }
    return;
  }
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
  // 右上：kpop無命制→顯示完美數(取代誤導的愛心、小孩邊跳邊看自己跳對幾個);其他遊戲→命
  if (currentGame === "kpop") {
    ctx.textAlign = "right"; ctx.font = `bold ${fs}px sans-serif`;
    const t = "✨ " + kpPerfect, tw = ctx.measureText(t).width;
    ctx.fillStyle = "rgba(0,0,0,0.4)"; roundRectFill(W - pad - tw - fs * 0.35, pad, tw + fs * 0.5, fs * 1.25, fs * 0.3);
    ctx.fillStyle = "#ffe96b"; ctx.fillText(t, W - pad, pad + fs * 0.65);
  } else {
    const gap = fs * 0.52;
    ctx.textAlign = "center"; ctx.font = `${fs}px sans-serif`;
    for (let i = 0; i < lives; i++) ctx.fillText("❤️", W - pad - fs * 0.5 - i * gap, pad + fs * 0.65);
  }
  // Combo（描邊，移高避開怪物路徑；runner 模式下移避開頂部中央的姿勢提示圖）
  if (combo >= 2) {
    const comboY = currentGame === "pvz" ? H * 0.21 : H * 0.09;
    const big = shortSide() * (0.11 + Math.min(combo, 30) * 0.004);
    if (imgReady(comboBgImg)) {
      const bw = big * 3.6, bh = bw * comboBgImg.naturalHeight / comboBgImg.naturalWidth;
      ctx.drawImage(comboBgImg, W / 2 - bw / 2, comboY - bh / 2, bw, bh);
    }
    ctx.font = `bold ${big}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = big * 0.08; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.strokeText("✕" + combo, W / 2, comboY);
    ctx.fillStyle = "#fff"; ctx.fillText("✕" + combo, W / 2, comboY);
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
function drawError() {                       // 啟動失敗畫面：圖示 + 重試鈕（零中文、小孩看符號）
  ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${shortSide() * 0.22}px sans-serif`; ctx.fillText(errIcon, W / 2, H * 0.32);
  ctx.font = `${shortSide() * 0.1}px sans-serif`; ctx.fillStyle = "#ffcc00"; ctx.fillText("⚠", W / 2, H * 0.5);
  drawOverlayCircleButton("↻");             // 點畫面中央重試
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
function kpRating() {
  const total = kpPerfect + kpGood + kpMiss;   // 方向A：純跳舞準度（惡魔是特效、不參與評分）
  if (total === 0) return 1;
  const acc = (kpPerfect + kpGood * 0.5) / total;
  return acc >= 0.85 ? 3 : acc >= 0.5 ? 2 : 1;
}
// 通關畫面（達成條件）
function drawWin() {
  if (imgReady(gameoverImg)) { drawBgCover(gameoverImg); ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, 0, W, H); }
  else { ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${shortSide() * 0.22}px sans-serif`; ctx.fillText("🏆", W / 2, H * 0.16);
  ctx.fillStyle = "#fff"; ctx.font = `bold ${shortSide() * 0.16}px sans-serif`; ctx.fillText("⭐ " + score, W / 2, H * 0.33);
  if (currentGame === "kpop") {
    const stars = kpRating();
    ctx.font = `${shortSide() * 0.16}px sans-serif`; ctx.fillStyle = "#ffe96b"; ctx.textAlign = "center";
    ctx.fillText("⭐".repeat(stars) + "☆".repeat(3 - stars), W / 2, H * 0.3);
    ctx.font = `${shortSide() * 0.07}px sans-serif`; ctx.fillStyle = "#fff";
    ctx.fillText("PERFECT " + kpPerfect + "  GOOD " + kpGood, W / 2, H * 0.46);
  } else {
    ctx.font = `${shortSide() * 0.09}px sans-serif`; ctx.fillStyle = "#ffd54a"; ctx.fillText("🎉🎉🎉", W / 2, H * 0.45);
  }
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
  const cw = W * 0.4, ch = H * 0.28, gapX = W * 0.04, gapY = H * 0.035;
  const x0 = (W - cw * 2 - gapX) / 2, y0 = H * 0.20;
  const r1y = y0, r2y = y0 + ch + gapY;
  return [
    { x: x0,              y: r1y, w: cw, h: ch, game: "whack", bg: cityImg,      border: "rgba(90,170,255,0.95)",  tint: "rgba(20,40,90,0.45)",  i1: "👊", i2: "🦖", best: bestWhack },
    { x: x0 + cw + gapX,  y: r1y, w: cw, h: ch, game: "dodge", bg: spaceImg,     border: "rgba(190,110,255,0.95)", tint: "rgba(40,20,80,0.45)",  i1: "🏃", i2: "☄️", best: bestDodge },
    { x: x0,              y: r2y, w: cw, h: ch, game: "pvz",   bg: lawnImg,      border: "rgba(120,210,90,0.95)",  tint: "rgba(20,70,20,0.45)",  i1: "🏃", i2: "🧟", best: bestPvz },
    { x: x0 + cw + gapX,  y: r2y, w: cw, h: ch, game: "kpop",  bg: stageKpopImg, border: "rgba(255,80,200,0.95)",  tint: "rgba(70,10,60,0.5)",   i1: "🎤", i2: "👿", best: bestKpop },
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
const ZOMBIE_Z_SPEED = 0.17;              // 殭屍/看板逼近速度（放很慢=慢慢變大走過來）
const ZOMBIE_FAST_SPEED = 0.30;           // 快速殭屍逼近速度（要提早打）
const WARN_DUR = 0.7;                       // 殭屍出現前的「預告」秒數（地面警示先閃→才走出來）
function makeZombieSpec() {                 // 決定一隻殭屍的種類（隨關卡進度解鎖）
  const lvl = Math.floor(elapsed / 18);
  if (lvl >= 2 && Math.random() < 0.26) return { kind: "fast", hp: 1, zspd: ZOMBIE_FAST_SPEED };   // 快速殭屍
  if (lvl >= 1 && Math.random() < 0.30) return { kind: "tough", hp: 2, zspd: ZOMBIE_Z_SPEED };     // 鐵桶殭屍
  return { kind: "normal", hp: 1, zspd: ZOMBIE_Z_SPEED };                                            // 普通殭屍
}
function runnerSpawnEvent() {              // 生一個事件：殭屍(可能成群) 或 鏤空看板
  if (Math.random() < 0.32) {             // 看板
    runnerObjs.push({ type: "wall", worldX: 0, z: 1.3, pose: pickPose(), st: "approach", judgeT: 0, result: null });
    pvzTarget = runnerObjs[runnerObjs.length - 1].pose;
    return;
  }
  // 殭屍：依關卡決定成群數量（1~3 隻），每隻先放「預告」標記、WARN_DUR 秒後才走出來
  const lvl = Math.floor(elapsed / 18);
  let n = 1;
  if (lvl >= 3 && Math.random() < 0.22) n = 3;
  else if (lvl >= 1 && Math.random() < 0.38) n = 2;
  let spread;
  if (n === 1) { const s = Math.random() < 0.5 ? -1 : 1; spread = [s * (0.1 + Math.random() * 0.14)]; }
  else if (n === 2) spread = [-0.16, 0.16];
  else spread = [-0.2, 0, 0.2];
  for (let i = 0; i < n; i++) {
    const wx = spread[i] + (Math.random() - 0.5) * 0.05;
    runnerObjs.push({ type: "warn", worldX: wx, z: 0.92, t: WARN_DUR + i * 0.16, spec: makeZombieSpec() }); // 預告(在地平線附近閃)、錯開抵達時間
  }
}
function computePunchSpeed() {             // 揮拳位移 = 手相對上一取樣的最大移動距離（配對加距離上限、避免新出現的手配到遠處別隻手產生假高速）
  let mx = 0;
  const cap = shortSide() * 0.5;
  for (const h of hands) { let best = 1e9; for (const p of prevHands) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < best) best = d; } if (best < cap) mx = Math.max(mx, best); }
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
  if (poseFrame % 2 === 0) {                 // 隔幀偵測省效能
    senseBody();
    const now = performance.now();
    const sdt = lastSenseTs ? Math.max(0.001, (now - lastSenseTs) / 1000) : 1 / 30; // 取樣實際間隔(秒)
    lastSenseTs = now;
    punchSpeed = computePunchSpeed() / sdt;   // 換算成 px/秒 → 揮拳判定跨手機 fps 一致(高刷新率手機不再打不中)
  }
  // 偵測不到人(走出畫面/逆光/手擋鏡頭) → 暫停世界、不扣命(對小孩公平)
  if (allPose.length === 0) noPersonT += dt; else noPersonT = 0;
  if (noPersonT > 0.7) { runnerPaused = true; return; } // 凍結 spawn/移動/判定，等人回到畫面
  runnerPaused = false;
  elapsed += dt;
  runnerSpeed = Math.min(0.75, 0.32 + elapsed * 0.012);   // 前進放慢很多、緩慢加速
  runnerDist += runnerSpeed * dt;
  runnerStripe = (runnerStripe + runnerSpeed * dt) % 1; // 地面速度線流動
  // 生成
  const wallOnScreen = runnerObjs.some((o) => o.type === "wall" && o.st !== "pass" && o.st !== "fail");
  runnerSpawnT -= dt;
  if (runnerSpawnT <= 0 && !wallOnScreen) { runnerSpawnEvent(); runnerSpawnT = Math.max(2.6, 4.2 - elapsed * 0.03); } // 出現頻率放慢很多、看板在場時暫停生成
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
    if (o.type === "warn") { o.t -= dt; continue; }                    // 預告標記不移動、只倒數
    o.z -= (o.type === "zombie" ? (o.zspd || ZOMBIE_Z_SPEED) : o.type === "wall" ? ZOMBIE_Z_SPEED * (o.z < 0.3 ? 2.4 : 1) : runnerSpeed) * dt; // 殭屍各自速度(快速殭屍更快)、看板靠近時加速衝過(穿過去感)、樹快掠過
    if (o.type === "zombie") {
      if (o.dead) { o.deadAlpha = (o.deadAlpha != null ? o.deadAlpha : 1) - dt * 3; o.deadScale = (o.deadScale || 1) + dt * 1.6; o.wobble += dt * 12; continue; } // 打爆動畫：放大+旋轉+淡出
      o.wobble += dt * 7; if (o.hitCd > 0) o.hitCd -= dt; if (o.knock) o.knock *= 0.88;
      if (!o.dead && o.z < 0.55 && o.z > 0.02 && o.hitCd <= 0 && punchSpeed > shortSide() * 0.05) { // 可打範圍加寬(更早能打)
        const pr = projRun(o.worldX, o.z);
        const cr = Math.min(shortSide() * 0.16 * pr.scale, shortSide() * 0.26);
        for (const h of hands) {
          if ((h.x - pr.x) ** 2 + (h.y - pr.y) ** 2 < (cr + HR) ** 2) {
            o.hp--; o.hitCd = 0.25; shake = Math.max(shake, 8);
            burst(h.x, h.y, "#ffffff", 10);            // 拳頭打擊白閃
            if (o.hp <= 0) { o.dead = true; o.deadAlpha = 1; o.deadScale = 1; const pts = o.tough ? 2 : 1; score += pts; combo++; bestCombo = Math.max(bestCombo, combo); addFloat(h.x, h.y, "+" + pts, "#aef36b", shortSide() * 0.09); burst(pr.x, pr.y, "#7cb342", 18); if (!playSfxFile(sfxZombie)) beep(300, 0.12, "square", 0.3); } // 分數從打中的手跳出
            else { o.knock = (o.worldX < 0 ? -1 : 1) * 0.12; burst(pr.x, pr.y, "#cddc39", 10); beep(360, 0.08, "square", 0.25); } // 鐵桶第一下被打歪
            break;
          }
        }
      }
      if (!o.dead && o.z <= 0.02) { o.dead = true; o.deadAlpha = 1; o.deadScale = 1; lives--; combo = 0; shake = 22; bombFx = 0.9; if (!playSfxFile(sfxHurt)) sndBomb(); if (lives <= 0) { gameOverPending = true; bombFx = 1.3; } } // 撞到玩家
    } else if (o.type === "wall") {
      if (o.st === "approach" && o.z < 0.6) { o.st = "judge"; o.judgeT = 2.4; } // 提早開判定窗(補償靠近加速)、給足反應時間
      if (o.st === "judge") {
        o.judgeT -= dt;
        if (anyPoseMatch(o.pose)) { o.st = "pass"; score += 3; const pr = projRun(0, o.z); addFloat(W / 2, pr.y, "+3", "#aef36b", shortSide() * 0.1); burst(W / 2, pr.y, "#aef36b", 20); if (!playSfxFile(sfxCorrect)) beep(880, 0.1, "triangle", 0.3); }
        else if (o.judgeT <= 0 || o.z <= 0.04) { o.st = "fail"; lives--; combo = 0; shake = 24; bombFx = 1; if (!playSfxFile(sfxHurt)) sndBomb(); if (lives <= 0) { gameOverPending = true; bombFx = 1.3; } }
      }
    }
  }
  for (const o of runnerObjs) {                                       // 預告倒數到 → 從同一位置走出殭屍
    if (o.type === "warn" && o.t <= 0) {
      const sp = o.spec;
      runnerObjs.push({ type: "zombie", worldX: o.worldX, side: o.worldX < 0 ? -1 : 1, z: 0.98, hp: sp.hp, tough: sp.kind === "tough", fast: sp.kind === "fast", zspd: sp.zspd, dead: false, hitCd: 0, wobble: Math.random() * 6, stepPhase: Math.random() * Math.PI * 2 });
      o._done = true;
    }
  }
  runnerObjs = runnerObjs.filter((o) => !(o.type === "warn" && o._done) && o.z > -0.06 && !(o.type === "zombie" && o.dead && o.deadAlpha <= 0)); // 預告轉殭屍後移除、死亡動畫播完才移除
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
const ZOMBIE_W = 0.30;                      // 殭屍基準寬度(佔短邊比例)、放大讓存在感更強
function pickZombieFrame(o) {               // 2格走路動畫：依走路相位切換(第2格沒放圖就一直用第1格)
  const a = o.tough ? zombie2Img : zombieImg;
  const b = o.tough ? zombie2ImgB : zombieImgB;
  if (!imgReady(b)) return a;
  return Math.sin(o.wobble * 0.5 + (o.stepPhase || 0)) >= 0 ? a : b; // 與上下 bob 同相位、腳步對得上
}
function drawRunnerWarn(o) {                // 殭屍出現前的地面預告（黃=普通/鐵桶、紅=快速）
  const p = projRun(o.worldX, o.z);
  if (!p.visible) return;
  const fast = o.spec.kind === "fast";
  const col = fast ? "#ff3a28" : "#ffce00";
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 110);
  const s = shortSide() * 0.06;
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.45 * pulse;    // 地面警示橢圓（殭屍即將出現處）
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(p.x, p.y, s * 1.2, s * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.9;                     // 警告三角(手繪、不靠 emoji、跳動)
  ctx.translate(p.x, p.y - s * 1.7 - pulse * s * 0.5);
  ctx.beginPath(); ctx.moveTo(0, -s * 0.72); ctx.lineTo(s * 0.62, s * 0.5); ctx.lineTo(-s * 0.62, s * 0.5); ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = Math.max(2, s * 0.1); ctx.strokeStyle = "#222"; ctx.stroke();
  ctx.fillStyle = "#222"; ctx.fillRect(-s * 0.07, -s * 0.32, s * 0.14, s * 0.5); ctx.beginPath(); ctx.arc(0, s * 0.34, s * 0.1, 0, Math.PI * 2); ctx.fill(); // 驚嘆號
  ctx.restore();
}
function drawRunnerZombie(o) {
  const p = projRun(o.worldX + (o.knock || 0), o.z);
  if (!p.visible) return;                   // 還在地平線外（剛生成、很遠）先不畫
  const zimg = pickZombieFrame(o);          // 2格走路動畫
  const asp = imgReady(zimg) ? zimg.naturalHeight / zimg.naturalWidth : 1.2;
  const fast = !!o.fast;
  // 打爆動畫：放大+旋轉+淡出
  if (o.dead) {
    const w = shortSide() * ZOMBIE_W * p.scale * (o.deadScale || 1);
    ctx.save(); ctx.globalAlpha = Math.max(0, o.deadAlpha != null ? o.deadAlpha : 1);
    ctx.translate(p.x, p.y); ctx.rotate(o.wobble * 0.15);
    if (imgReady(zimg)) ctx.drawImage(zimg, -w / 2, -w * asp * 0.92, w, w * asp);
    ctx.restore(); return;
  }
  const w = shortSide() * ZOMBIE_W * p.scale;
  const inRange = o.z < 0.55 && o.z > 0.02;
  const bob = Math.sin(o.wobble * 0.5 + (o.stepPhase || 0)) * w * 0.07; // 上下走路擺動
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.34, w * 0.12, 0, 0, Math.PI * 2); ctx.fill(); // 腳下陰影(留在地面、不跟著bob)
  ctx.translate(0, bob);                    // bobbing
  ctx.rotate(Math.sin(o.wobble) * 0.06);
  if (fast) {                               // 快速殭屍：紅色脈動光暈(警示「快、要提早打」)
    ctx.save(); ctx.globalAlpha = 0.3 + 0.25 * Math.sin(performance.now() / 80);
    ctx.fillStyle = "#ff3320"; ctx.beginPath(); ctx.ellipse(0, -w * asp * 0.42, w * 0.46, w * asp * 0.52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (imgReady(zimg)) ctx.drawImage(zimg, -w / 2, -w * asp * 0.92, w, w * asp);
  else { ctx.fillStyle = "#6f8f3a"; ctx.beginPath(); ctx.arc(0, -w * 0.4, w * 0.5, 0, Math.PI * 2); ctx.fill(); }
  if (inRange) {                            // 可打擊：方框(快速=紅、其他=黃；取代shadowBlur,iOS相容)
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    ctx.strokeStyle = fast ? `rgba(255,70,40,${0.6 + pulse * 0.4})` : `rgba(255,220,0,${0.55 + pulse * 0.45})`; ctx.lineWidth = Math.max(2, w * 0.06);
    ctx.strokeRect(-w / 2, -w * asp * 0.92, w, w * asp);
  }
  ctx.restore();
  if (inRange) {                            // 頭頂往下箭頭(描邊、不靠emoji、Android也看得到)
    const ay = p.y - w * asp * 0.92 - w * 0.25 + Math.sin(performance.now() / 200) * w * 0.1;
    ctx.font = `bold ${Math.max(shortSide() * 0.06, w * 0.55)}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(3, w * 0.06); ctx.strokeStyle = "#333"; ctx.strokeText("▼", p.x, ay);
    ctx.fillStyle = fast ? "#ff5030" : "#ffdd00"; ctx.fillText("▼", p.x, ay);
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
  if (_wallCache[pose]) return _wallCache[pose];
  const bw = 760, bh = 1000;                                                                  // 固定直式人形牌比例（不隨螢幕方向變橫條）
  const oc = document.createElement("canvas"); oc.width = bw; oc.height = bh;
  const c = oc.getContext("2d");
  c.fillStyle = "#1f9e2e"; c.fillRect(0, 0, bw, bh);                                          // 綠牌面（像影片）
  c.fillStyle = "#157a22"; c.fillRect(0, 0, bw, bh * 0.05); c.fillRect(0, bh * 0.95, bw, bh * 0.05); // 上下橫木
  c.lineWidth = bw * 0.035; c.strokeStyle = "#ffd56b"; c.strokeRect(c.lineWidth, c.lineWidth, bw - c.lineWidth * 2, bh - c.lineWidth * 2); // 金邊
  c.globalCompositeOperation = "destination-out";                                             // 挖空人形洞（透出後方）
  fillPoseSilhouette(c, bw / 2, bh / 2, 640, pose);
  c.globalCompositeOperation = "source-over";
  _wallCache[pose] = oc; return oc;
}
function drawRunnerWall(o) {
  if (o.z >= 1) return;                      // 還在地平線外先不畫
  const s = 1 - o.z;
  const wallH = Math.min(H * 1.8, shortSide() * 1.6 * s), wallW = wallH * 0.76; // 靠近時長大到超過螢幕→人形洞罩住鏡頭=穿過去感
  if (wallW < 8) return;
  const cx = W / 2, cy = RUN_VP_Y() + (H - RUN_VP_Y()) * (1 - o.z) - wallH * 0.5;
  const matching = o.st === "judge" && anyPoseMatch(o.pose);
  const oc = getWallCanvas(o.pose);
  ctx.save();
  const fadeIn = Math.min(1, (1 - o.z) * 3);                                                   // 遠時半透明漸入、近時實心（減少突兀違和）
  ctx.globalAlpha = 0.92 * fadeIn;                                                             // 做對也保持實體、長大綠色衝過再離場(穿過去)，不在原地淡掉
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
function drawRunnerPlaying() {
  const useVid = syncBgVideo();            // 每幀重評估（影片載好就自動接上）
  if (useVid) ctx.clearRect(0, 0, W, H);                                   // 透明 → 露出後面的循環影片
  else if (imgReady(runnerFirstImg)) drawBgCover(runnerFirstImg);          // 影片還沒播 → 用影片第一幀(街景一致、消除開場跳變)
  else if (imgReady(lawnImg)) drawBgCover(lawnImg);
  else drawPvzLawnFallback();
  const streetBg = useVid || imgReady(runnerFirstImg);                     // 背景已是街景(影片或首幀)
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  if (!useVid) drawRunnerGround();         // 影片自帶前進感；靜態墊檔時畫速度線補動感
  for (const o of runnerObjs) {            // 已依 z 由遠到近排序
    if (o.type === "tree") { if (!streetBg) drawRunnerTree(o); } // 街景背景不畫程式樹(會跟街景打架)
    else if (o.type === "warn") drawRunnerWarn(o);   // 殭屍出現前的地面預告
    else if (o.type === "zombie") drawRunnerZombie(o);
    else if (o.type === "wall") drawRunnerWall(o);
  }
  drawParticles();
  drawRunnerFists();                       // 玩家拳套（看得到打到哪）
  drawFloatTexts();
  ctx.restore();
  drawBombFx();
  drawRunnerHint();
  if (runnerPaused) drawNoPersonHint();    // 偵測不到人：提示站回畫面、世界已暫停(不扣命)
  drawHUD();                               // 右下角小鏡頭已移除（畫面有拳套即可）
}
function drawNoPersonHint() {              // 「站回畫面中央」提示（零中文、閃爍人形框）
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
  const s = shortSide() * 0.16, cx = W / 2, cy = H * 0.42;
  ctx.strokeStyle = `rgba(255,235,80,${0.5 + pulse * 0.5})`; ctx.lineWidth = Math.max(3, s * 0.05);
  ctx.setLineDash([s * 0.12, s * 0.08]);
  roundRectPath(cx - s * 0.5, cy - s * 0.7, s, s * 1.5, s * 0.1); ctx.stroke(); // 虛線人形框
  ctx.setLineDash([]);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${s * 0.9}px sans-serif`; ctx.fillText("🧍", cx, cy);            // 站立人形
  ctx.font = `${s * 0.5}px sans-serif`; ctx.fillText("👈👉", cx, cy + s * 1.1); // 站到鏡頭中間
  ctx.restore();
}
function drawRunnerFists() {                // 雙手畫拳擊手套（取代光點）
  for (const h of hands) {
    const r = HAND_R();
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
    g.addColorStop(0, "rgba(255,255,255,0.45)"); g.addColorStop(1, "rgba(255,170,60,0)"); // 淡光暈底
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${r * 1.9}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🥊", h.x, h.y);          // 拳套
  }
}

// ===================== 獵魔女團 K-pop 節奏遊戲 =====================
// ===== 跟跳評分：比對玩家姿勢與示範舞者該時刻姿勢（骨頭方向向量、含鏡像、對小孩寬鬆）=====
const KP_BONES = [[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]];
const KP_LR = {11:12,12:11,13:14,14:13,15:16,16:15,23:24,24:23,25:26,26:25,27:28,28:27};
// 姿勢模板：正面火柴人各動作的關節 normalized 座標（給火柴人示範 + 節點評分共用）
const KP_TPL = {
  ready:    {0:[.5,.12],11:[.40,.27],12:[.60,.27],13:[.36,.40],14:[.64,.40],15:[.36,.52],16:[.64,.52],23:[.46,.56],24:[.54,.56],25:[.45,.77],26:[.55,.77],27:[.45,.95],28:[.55,.95]},
  handsup:  {0:[.5,.12],11:[.40,.27],12:[.60,.27],13:[.37,.15],14:[.63,.15],15:[.35,.03],16:[.65,.03],23:[.46,.56],24:[.54,.56],25:[.45,.77],26:[.55,.77],27:[.45,.95],28:[.55,.95]},
  tpose:    {0:[.5,.12],11:[.40,.27],12:[.60,.27],13:[.28,.27],14:[.72,.27],15:[.16,.27],16:[.84,.27],23:[.46,.56],24:[.54,.56],25:[.45,.77],26:[.55,.77],27:[.45,.95],28:[.55,.95]},
  star:     {0:[.5,.12],11:[.40,.27],12:[.60,.27],13:[.30,.17],14:[.70,.17],15:[.22,.06],16:[.78,.06],23:[.46,.56],24:[.54,.56],25:[.38,.77],26:[.62,.77],27:[.32,.95],28:[.68,.95]},
  rhand:    {0:[.5,.12],11:[.40,.27],12:[.60,.27],13:[.40,.42],14:[.63,.15],15:[.40,.54],16:[.65,.03],23:[.46,.56],24:[.54,.56],25:[.45,.77],26:[.55,.77],27:[.45,.95],28:[.55,.95]},
  lhand:    {0:[.5,.12],11:[.40,.27],12:[.60,.27],13:[.37,.15],14:[.60,.42],15:[.35,.03],16:[.60,.54],23:[.46,.56],24:[.54,.56],25:[.45,.77],26:[.55,.77],27:[.45,.95],28:[.55,.95]},
  clap:     {0:[.5,.12],11:[.40,.27],12:[.60,.27],13:[.44,.34],14:[.56,.34],15:[.49,.40],16:[.51,.40],23:[.46,.56],24:[.54,.56],25:[.45,.77],26:[.55,.77],27:[.45,.95],28:[.55,.95]},
};
const KP_SEQ = ["handsup","star","lhand","rhand","clap","tpose"];
let kpChoreo = [], kpNodeIdx = 0, kpNodeBest = 0, kpNodeFx = 0, kpNodeFxGold = false; // 編舞/目前節點/窗內最佳/結算閃光
function buildChoreo() {
  const notes = []; let i = 0;
  for (let beat = 16; beat < 398; beat += 4) { notes.push({ beat, pose: KP_SEQ[i % KP_SEQ.length], gold: (i % 8 === 7) }); i++; }
  return notes;
}
function kpNodeTime(node) { return node.nt != null ? node.nt : kpBeatTime(node.beat); } // 影片峰值節點用nt、fallback用beat
// 從舞者骨架序列找「動作停頓/頂點」時間(速度局部極小=擺好pose那刻)當節點，火柴人就顯示招牌動作而非過渡尷尬幀
function kpRefPeaks() {
  if (!kpRef || !kpRef.seq || kpRef.seq.length < 6) return [];
  const seq = kpRef.seq, J = [11,12,13,14,15,16,25,26,27,28]; // 肩肘腕膝踝(動作主要關節)
  const spd = seq.map((f, i) => {
    if (i === 0) return 0; const a = f.lm, b = seq[i-1].lm; let s = 0, n = 0;
    for (const j of J) if (a[j] && b[j]) { s += Math.hypot(a[j][0]-b[j][0], a[j][1]-b[j][1]); n++; }
    return n ? s/n : 0;
  });
  const sm = spd.map((v,i) => (spd[i-1]||v)*0.25 + v*0.5 + (spd[i+1]||v)*0.25); // 平滑
  const avg = sm.reduce((a,b)=>a+b,0) / sm.length, peaks = [];
  for (let i = 2; i < seq.length-2; i++) {
    if (sm[i] < avg*0.65 && sm[i] <= sm[i-1] && sm[i] <= sm[i+1]) {  // 速度低谷=停頓=pose頂點
      const t = seq[i].t; if (!peaks.length || t - peaks[peaks.length-1] > 0.9) peaks.push(t);
    }
  }
  return peaks.length >= 3 ? peaks : seq.filter((_,i)=>i%18===0).map(f=>f.t); // 太少→退回均勻取樣
}
function buildChoreoFromRef() {                 // 用峰值時間×影片循環生成整首歌的節點(絕對秒)
  const peaks = kpRefPeaks(); if (!peaks.length) return buildChoreo();
  const dur = kpRef.dur, songLen = 200, nodes = []; let gi = 0;
  for (let k = 0; k * dur < songLen; k++) for (const p of peaks) {
    const nt = p + k * dur; if (nt < 1.5 || nt > songLen) continue;
    nodes.push({ nt, gold: (gi % 8 === 7) }); gi++;
  }
  return nodes.sort((a,b) => a.nt - b.nt);
}
// 取模板某索引的點（{x,y,v:1} 或 null）
function kpTplPt(tpl, i) { const a = tpl[i]; return a ? { x: a[0], y: a[1], v: 1 } : null; }
// 編舞在時間 t 的「補間姿勢」：目前節點→下一節點平滑過渡（火柴人流暢示範用）
function kpChoreoPose(t) {
  if (!kpChoreo.length) return KP_TPL.ready;
  let idx = 0; for (let k = 0; k < kpChoreo.length; k++) { if (kpBeatTime(kpChoreo[k].beat) <= t) idx = k; else break; }
  const cur = KP_TPL[kpChoreo[idx].pose] || KP_TPL.ready;
  const nxt = KP_TPL[(kpChoreo[idx + 1] || kpChoreo[idx]).pose] || cur;
  const t0 = kpBeatTime(kpChoreo[idx].beat), t1 = kpBeatTime((kpChoreo[idx + 1] || kpChoreo[idx]).beat);
  let r = t1 > t0 ? (t - t0) / (t1 - t0) : 0; r = Math.max(0, Math.min(1, r));
  const e = r < 0.5 ? 0 : (r - 0.5) / 0.5; // 前半停在當前動作、後半才過渡到下一個(像 Just Dance 擺好再換)
  const out = {};
  for (const i of [0,11,12,13,14,15,16,23,24,25,26,27,28]) { const a = cur[i], b = nxt[i] || a; out[i] = [a[0] + (b[0]-a[0])*e, a[1] + (b[1]-a[1])*e]; }
  return out;
}
// 玩家現在的姿勢 vs 指定參考幀(影片某時刻的骨架)，骨頭向量、含鏡像、0~1寬鬆
function kpMatchRef(ref) {
  if (!poseLandmarks || !ref) return 0;
  const player = kpBoneVecs(i => { const p = poseLandmarks[i]; return p ? { x: p.x, y: p.y, v: p.visibility || 0 } : null; });
  const refD = kpBoneVecs(i => { const a = ref.lm[i]; return a ? { x: a[0], y: a[1], v: a[2] } : null; });
  const refM = kpBoneVecs(i => { const j = (KP_LR[i] != null ? KP_LR[i] : i); const a = ref.lm[j]; return a ? { x: 1 - a[0], y: a[1], v: a[2] } : null; });
  const cos = Math.max(kpCos(player, refD), kpCos(player, refM));
  return Math.max(0, Math.min(1, (cos - 0.4) / 0.6));
}
// 比對玩家現在的姿勢 vs 某模板（骨頭方向、含鏡像、0~1、寬鬆）
function kpMatchPose(poseKey) {
  if (!poseLandmarks) return 0;
  const tpl = KP_TPL[poseKey]; if (!tpl) return 0;
  const player = kpBoneVecs(i => { const p = poseLandmarks[i]; return p ? { x: p.x, y: p.y, v: p.visibility || 0 } : null; });
  const refD = kpBoneVecs(i => kpTplPt(tpl, i));
  const refM = kpBoneVecs(i => { const j = (KP_LR[i] != null ? KP_LR[i] : i); const a = tpl[j]; return a ? { x: 1 - a[0], y: a[1], v: 1 } : null; });
  const cos = Math.max(kpCos(player, refD), kpCos(player, refM));
  return Math.max(0, Math.min(1, (cos - 0.4) / 0.6));
}
function kpBoneVecs(getPt) {
  return KP_BONES.map(([a,b]) => {
    const pa = getPt(a), pb = getPt(b);
    if (!pa || !pb || pa.v < 0.3 || pb.v < 0.3) return null;
    let dx = pb.x - pa.x, dy = pb.y - pa.y; const L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  });
}
function kpCos(va, vb) {
  let s = 0, n = 0;
  for (let i = 0; i < va.length; i++) { if (va[i] && vb[i]) { s += va[i][0]*vb[i][0] + va[i][1]*vb[i][1]; n++; } }
  return n ? s / n : 0;
}
function kpRefFrame(t) {
  if (!kpRef || !kpRef.seq.length) return null;
  const tt = ((t % kpRef.dur) + kpRef.dur) % kpRef.dur;
  const s = kpRef.seq; let lo = 0, hi = s.length - 1;          // 二分搜尋最接近的幀(抽取跳幀也不會錯位)
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m].t <= tt) lo = m; else hi = m - 1; }
  return s[lo];
}
function kpQuality() {
  if (!poseLandmarks) return 0;
  const ref = kpRefFrame(kpSongTime); if (!ref) return 0;
  const player = kpBoneVecs(i => { const p = poseLandmarks[i]; return p ? { x: p.x, y: p.y, v: p.visibility || 0 } : null; });
  const refDirect = kpBoneVecs(i => { const a = ref.lm[i]; return a ? { x: a[0], y: a[1], v: a[2] } : null; });
  const refMirror = kpBoneVecs(i => { const j = (KP_LR[i] != null ? KP_LR[i] : i); const a = ref.lm[j]; return a ? { x: 1 - a[0], y: a[1], v: a[2] } : null; });
  const cos = Math.max(kpCos(player, refDirect), kpCos(player, refMirror));
  return Math.max(0, Math.min(1, (cos - 0.4) / 0.6));
}
function kpSpawnDanceDemon() {                 // 方向A：惡魔=純背景氛圍、沿兩側走、玩家不用看它
  const side = Math.random() < 0.5 ? -1 : 1;
  kpDemons.push({ side, born: kpSongTime, dur: 4.5, dead: false, deadAt: 0, dx: 0, dy: 0, dscale: 1 });
}
function kpDanceDemonPos(d) {
  const prog = Math.min(1.25, (kpSongTime - d.born) / d.dur);
  const ex = d.side < 0 ? -W * 0.04 : W * 1.04, cx = d.side < 0 ? W * 0.18 : W * 0.82; // 貼邊走、不擠中間搶注意力
  return { x: ex + (cx - ex) * prog, y: H * 0.34 + (H * 0.72 - H * 0.34) * prog, scale: 0.35 + 0.5 * prog, prog };
}
function kpDemonFrame(d) {                     // 拍翅動畫:ping-pong來回播(0..7..1無縫)、每隻依born錯開相位
  if (!kpDemonFrames.length || !imgReady(kpDemonFrames[0])) return imgReady(kpDemonImg) ? kpDemonImg : zombieImg;
  const n = kpDemonFrames.length, period = (n - 1) * 2, fps = 9;
  let k = Math.floor(kpSongTime * fps + d.born * 7) % period;
  if (k >= n) k = period - k;                 // 反彈
  return kpDemonFrames[k] || kpDemonImg;
}
function kpKillDemon(d) {                      // 被光波轟飛：凍結死亡位置、爽快粒子
  const p = kpDanceDemonPos(d);
  d.dead = true; d.deadAt = kpSongTime; d.dx = p.x; d.dy = p.y; d.dscale = p.scale;
  burst(p.x, p.y, "#ff7fdc", 14);
}
function updateKpop(dt) {
  poseFrame++;
  if (poseFrame % 2 === 0) senseBody();
  kpSongTime = audioCtx ? (audioCtx.currentTime - kpT0) : 0;
  if (allPose.length === 0) noPersonT += dt; else noPersonT = 0;
  if (kpNodeFx > 0) kpNodeFx -= dt;
  const node = kpChoreo[kpNodeIdx];
  // 連續算「現在跟目標像不像」:有影片骨架→比影片當下動作(看到的=被評分的);沒載到→fallback內建模板
  kpMatch = kpRef ? kpMatchRef(kpRefFrame(kpSongTime)) : (node ? kpMatchPose(node.pose) : 0);
  // 舞者影片跟歌曲時鐘同步(循環10s、漂移>0.3s校正、用環狀距離避免接縫處狂seek)
  if (kpRef && kpDanceVid.readyState >= 2) {
    const vt = ((kpSongTime % kpRef.dur) + kpRef.dur) % kpRef.dur;
    let dft = Math.abs(kpDanceVid.currentTime - vt); dft = Math.min(dft, kpRef.dur - dft);
    if (dft > 0.3) { try { kpDanceVid.currentTime = vt; } catch (e) {} }
  }
  if (kpSongTime >= kpNextSpawn) { kpSpawnDanceDemon(); kpNextSpawn = kpSongTime + Math.max(1.6, 2.8 - kpSongTime * 0.008); }
  if (node) {
    const nt = kpNodeTime(node);
    const inWin = kpSongTime >= nt - 0.7 && kpSongTime <= nt + 0.7;     // 放寬窗:容許小孩跟著大舞者跳的反應延遲(慢半拍也算)
    if (inWin && kpMatch > kpNodeBest) kpNodeBest = kpMatch;
    const hitNow = inWin && kpSongTime >= nt - 0.3 && kpMatch > 0.72;   // 擺到PERFECT就即時結算(做對馬上給星、因果不斷線、不等窗關)
    if (hitNow || kpSongTime > nt + 0.7) {
      const q = kpNodeBest;
      if (q > 0.45) {
        const perfect = q > 0.72;
        if (node.gold) {
          let n = 0; for (const d of kpDemons) if (!d.dead) { kpKillDemon(d); n++; }
          score += 10 + n * 2; kpPerfect++; combo++; bestCombo = Math.max(bestCombo, combo);
          burst(W/2, H*0.5, "#ffe96b", 60); shake = 18; bombFx = 0.8; kpNodeFx = 0.5; kpNodeFxGold = true;
          kpWaveT = kpSongTime; kpWaveGold = true;
          addFloat(W/2, H*0.28, "🌟⭐🌟", "#ffe96b", shortSide()*0.13, 0.6);   // 無中文、符號化、慢消(decay0.6=飄久看得清)
          sndGold(); // 短促金音效。⚠️別用pvzWinSfx:41秒長、Gold每~16s觸發=永遠有音樂疊著(阿葉回報「音效一直持續」)
        } else {
          // 方向A：跳得好自動放光波清惡魔（PERFECT清2隻、GOOD清1隻）、玩家不用看惡魔
          const alive = kpDemons.filter(d => !d.dead).sort((a, b) => (kpSongTime - b.born)/b.dur - (kpSongTime - a.born)/a.dur);
          const killed = alive.slice(0, perfect ? 2 : 1);
          for (const d of killed) kpKillDemon(d);
          score += (perfect ? 2 : 1) + killed.length; if (perfect) kpPerfect++; else kpGood++;
          combo++; bestCombo = Math.max(bestCombo, combo);
          burst(W/2, H*0.45, "#ff7fdc", 20); kpNodeFx = 0.4; kpNodeFxGold = false;
          kpWaveT = kpSongTime; kpWaveGold = false;
          addFloat(W/2, H*0.28, perfect ? "⭐⭐⭐" : "⭐⭐", perfect ? "#ffe96b" : "#aef36b", shortSide()*(perfect?0.12:0.1), 0.6); // 無中文、星數=好壞、慢消看得清
          if (!playSfxFile(sfxCorrect)) beep(880, 0.1, "triangle", 0.3);
        }
      } else { kpMiss++; combo = 0; addFloat(W/2, H*0.28, "💨", "#ff9bb0", shortSide()*0.11, 0.6); kpNodeFx = 0.3; kpNodeFxGold = false; } // 沒跟上=一陣風(不嚇人、無中文)
      kpNodeIdx++; kpNodeBest = 0;
    }
  }
  // 方向A：沒清到的惡魔走完安靜淡出、零懲罰（不偷星、不出聲、不逼玩家看）
  kpDemons = kpDemons.filter(d => d.dead ? (kpSongTime - d.deadAt < 0.9) : (kpSongTime - d.born) / d.dur < 1.25);
  for (const p of particles) { p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 600*dt; p.life -= dt*1.6; }
  particles = particles.filter(p => p.life > 0);
  updateFloats(dt);
  if (shake > 0) shake = Math.max(0, shake - dt*60);
  if (bombFx > 0) bombFx = Math.max(0, bombFx - dt*1.6);
  if (kpStage === "done") { commitBest(); state = "win"; }
}
// 通用:把一幀骨架(MediaPipe lm)畫成火柴人小圖(軀幹正規化縮放、鏡像、髖中錨定)。pictogram捲軸+居中示範共用
function kpDrawStickLM(lm, cx, cy, boxH, col, lineK, boxAlpha, markLeft) {
  if (!lm || !lm[11] || !lm[12] || !lm[23] || !lm[24]) return;
  // 用「骨架方向 + 典型固定肢長」重建:動作(關節角度)來自舞者、但比例標準化=正常火柴人(不被Q版頭大腿短影響)
  const L = i => (lm[i] && (lm[i][2] === undefined || lm[i][2] > 0.12)) ? [lm[i][0], lm[i][1]] : null;
  const mid = (a,b) => { const p=L(a),q=L(b); return (p&&q)?[(p[0]+q[0])/2,(p[1]+q[1])/2]:null; };
  const udir = (from, to, def) => { if(!from||!to) return def; const dx=-(to[0]-from[0]), dy=to[1]-from[1], d=Math.hypot(dx,dy); return d<1e-4?def:[dx/d,dy/d]; }; // 鏡像x負
  const step = (p,dir,len) => [p[0]+dir[0]*len, p[1]+dir[1]*len];
  const SP=boxH*0.27, HD=boxH*0.17, SHh=boxH*0.12, UA=boxH*0.17, FA=boxH*0.16, HPh=boxH*0.08, TH=boxH*0.21, SN=boxH*0.2; // 典型人體比例(頭/軀幹/上臂/前臂/大腿/小腿)
  const hipC=mid(23,24), shC=mid(11,12);
  const hip=[cx, cy + boxH*0.13];                                  // 髖中錨點
  const spineD=udir(hipC, shC, [0,-1]), neck=step(hip,spineD,SP), head=step(neck,spineD,HD);
  const shD=udir(L(12),L(11),[1,0]), lsh=step(neck,shD,SHh), rsh=step(neck,[-shD[0],-shD[1]],SHh);
  const lelb=step(lsh,udir(L(11),L(13),[0,1]),UA), lwr=step(lelb,udir(L(13),L(15),[0,1]),FA);
  const relb=step(rsh,udir(L(12),L(14),[0,1]),UA), rwr=step(relb,udir(L(14),L(16),[0,1]),FA);
  const lhip=step(hip,shD,HPh), rhip=step(hip,[-shD[0],-shD[1]],HPh);
  const lkne=step(lhip,udir(L(23),L(25),[0,1]),TH), lank=step(lkne,udir(L(25),L(27),[0,1]),SN);
  const rkne=step(rhip,udir(L(24),L(26),[0,1]),TH), rank=step(rkne,udir(L(26),L(28),[0,1]),SN);
  const segs=[[hip,neck],[lsh,rsh],[lhip,rhip],[lsh,lelb],[lelb,lwr],[rsh,relb],[relb,rwr],[lhip,lkne],[lkne,lank],[rhip,rkne],[rkne,rank]];
  const lw=boxH*(0.1+0.035*lineK), hr=boxH*0.14;
  ctx.save(); ctx.lineCap="round"; ctx.lineJoin="round";
  const body=(color,extra) => {
    ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=lw+extra;
    for (const [a,b] of segs) { ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(head[0],head[1],hr+extra*0.5,0,Math.PI*2); ctx.fill();
  };
  body("rgba(20,12,30,0.85)", boxH*0.07);                         // 黑描邊
  body(col, 0);                                                   // 實心主體
  if (markLeft) { ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(lwr[0],lwr[1],boxH*0.05,0,Math.PI*2); ctx.fill(); } // 一手白點=鏡像跟跳不擺反
  ctx.restore();
}
// Just Dance 式底部動作預告捲軸:接下來N個節點由右往左滑、判定線那格放大=當下目標
function kpDrawPictogramTrack() {
  if (!kpRef) return;
  const trackY = H * 0.88, box = shortSide() * 0.16, hitX = W * 0.58, lead = 4.0, N = 3; // 判定點中間偏右下方(阿葉要)、預告3個
  for (let i = Math.min(kpChoreo.length-1, kpNodeIdx + N - 1); i >= kpNodeIdx; i--) {  // 遠→近畫(近的蓋上面)
    const node = kpChoreo[i]; if (!node) continue;
    const nt = kpNodeTime(node), dt = nt - kpSongTime;
    if (dt > lead || dt < -0.6) continue;
    const frac = Math.max(0, dt) / lead;                         // 0(到判定線)..1(最遠)
    const x = hitX + frac * (W - hitX - box*0.8);
    const isCur = (i === kpNodeIdx);
    const sz = isCur ? box * 1.4 : box * (0.8 + 0.15*(1-frac));
    const lm = (kpRefFrame(nt) || {}).lm; if (!lm) continue;
    const lit = isCur && kpNodeFx > 0;
    const col = node.gold ? "#FFE96B" : (lit ? "#AEF36B" : (isCur ? "#FFB12E" : "rgba(255,255,255,0.72)")); // 當下橙黃/命中綠/Gold金/預告白
    ctx.save(); ctx.globalAlpha = isCur ? 1 : 0.7;
    if (isCur) {                                                 // 當下格腳下發光圓盤(取代脈動圈、站亮圈上那個=現在做)
      const ds = sz * 0.6, dy = trackY + sz * 0.52;
      ctx.save(); ctx.globalAlpha = 0.45 + 0.22*Math.sin(kpSongTime*6); ctx.fillStyle = node.gold ? "#FFE96B" : "#ff9be0";
      ctx.shadowColor = node.gold ? "#FFE96B" : "#ff7fdc"; ctx.shadowBlur = sz * 0.45;
      ctx.beginPath(); ctx.ellipse(x, dy, ds, ds*0.34, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
    }
    kpDrawStickLM(lm, x, trackY, sz, col, isCur ? 1 : 0.6, 0, isCur);  // isCur畫左手白點區分左右
    if (node.gold) { ctx.globalAlpha = isCur ? 0.95 : 0.6; ctx.fillStyle="#FFE96B"; ctx.font=`${sz*0.32}px sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("★", x, trackY - sz*0.88); }
    ctx.restore();
  }
}
function kpDrawRefFigure(vidMode) {          // 示範火柴人:影片模式縮角落當pictogram(描影片骨架)、否則居中當教練主體
  const pose = vidMode ? (kpRefFrame(kpSongTime) || {}).lm : kpChoreoPose(kpSongTime); if (!pose) return;
  const bw = shortSide() * (vidMode ? 0.24 : 0.5), bh = bw * 1.55,
        cx = vidMode ? W * 0.82 : W / 2, cy = vidMode ? H * 0.17 : H * 0.46;
  let P;
  if (vidMode && pose[11] && pose[12] && pose[23] && pose[24]) {
    // 影片骨架以「軀幹長」為基準放大塞滿小框(舞者只佔影片中央一小塊、直接映射動作會小到像靜止圖)
    const nkx = (pose[11][0] + pose[12][0]) / 2, nky = (pose[11][1] + pose[12][1]) / 2;
    const hpx = (pose[23][0] + pose[24][0]) / 2, hpy = (pose[23][1] + pose[24][1]) / 2;
    const torso = Math.hypot(nkx - hpx, nky - hpy) || 0.2;
    const s = bh * 0.27 / torso;                                  // 軀幹占盒高27%→手腳動作大而清楚
    P = (i) => { const a = pose[i]; if (!a) return null; return { x: cx + (hpx - a[0]) * s, y: cy + bh * 0.07 + (a[1] - hpy) * s }; }; // 鏡像、髖中錨定
  } else {
    P = (i) => { const a = pose[i]; if (!a) return null; return { x: cx + ((1 - a[0]) - 0.5) * bw, y: cy + (a[1] - 0.5) * bh }; }; // 鏡像
  }
  const M = (a, b) => { const p = P(a), q = P(b); return (p && q) ? { x: (p.x+q.x)/2, y: (p.y+q.y)/2 } : null; };
  const seg = (p, q) => { if (!p || !q) return; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };
  const neck = M(11,12), hipc = M(23,24), nose = P(0);
  const lit = kpNodeFx > 0;
  const good = kpMatch > 0.6;                                    // 跟得像→額外發亮綠(教練永遠清楚可見、不會暗到看不到)
  const col = lit ? (kpNodeFxGold ? "#ffe96b" : "#aef36b") : (good ? "#7CFFB0" : "#bfe6d8");
  const k = vidMode ? 0.5 : 1;                                   // pictogram縮小時線條/頭等比例變細
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (vidMode) { ctx.fillStyle = "rgba(10,5,20,0.45)"; const pad = bw*0.18;  // 暗底框、疊影片上看得清
    ctx.beginPath(); ctx.roundRect(cx - bw/2 - pad, cy - bh/2 - pad, bw + pad*2, bh + pad*2, bw*0.15); ctx.fill(); }
  // 黑描邊
  ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = Math.max(4, shortSide()*0.022*k);
  seg(nose, neck); seg(neck, hipc); seg(P(11), P(12)); seg(P(23), P(24));
  for (const [a,b] of [[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]]) seg(P(a), P(b));
  if (nose) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.arc(nose.x, nose.y, shortSide()*0.045*k, 0, Math.PI*2); ctx.fill(); }
  // 主體
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(2.5, shortSide()*0.015*k);
  seg(nose, neck); seg(neck, hipc); seg(P(11), P(12)); seg(P(23), P(24));
  for (const [a,b] of [[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]]) seg(P(a), P(b));
  if (nose) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(nose.x, nose.y, shortSide()*0.038*k, 0, Math.PI*2); ctx.fill(); }
  ctx.restore();
}
function drawKpopPlaying() {
  const vidOK = kpRef && kpDanceVid.readyState >= 2;             // 影片+骨架都到位→Just Dance版面
  if (vidOK) { ctx.clearRect(0, 0, W, H); ctx.fillStyle = "rgba(8,5,20,0.1)"; ctx.fillRect(0, 0, W, H); } // 透出影片+極輕暗罩(森林夜空背景已安靜、只壓一點點讓UI浮出、不再悶暗)
  else { ctx.fillStyle = "#1a0a24"; ctx.fillRect(0, 0, W, H); }  // fallback深色舞台(火柴人居中當主體)
  ctx.save();
  if (shake > 0) ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake);
  for (const d of kpDemons) {
    const dImg = kpDemonFrame(d);                                // 每隻取當下拍翅動畫幀
    const asp = imgReady(dImg) ? dImg.naturalHeight/dImg.naturalWidth : 1.2;
    if (d.dead) {                                                // 被光波轟飛：旋轉飛出去淡出（爽快特效）
      const t = kpSongTime - d.deadAt, w = shortSide() * 0.27 * d.dscale;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t * 1.2);
      ctx.translate(d.dx + d.side * t * W * 0.35, d.dy - t * H * 0.45); ctx.rotate(t * 7 * d.side);
      if (imgReady(dImg)) ctx.drawImage(dImg, -w/2, -w*asp*0.9, w, w*asp);
      ctx.restore(); continue;
    }
    const p = kpDanceDemonPos(d);
    const bob = Math.sin(kpSongTime * 4.5 + d.born * 4) * shortSide() * 0.025;   // 上下飄(懸浮感、疊在拍翅上)
    const rot = Math.sin(kpSongTime * 3.2 + d.born * 6) * 0.1;                   // 輕微左右搖擺
    const w = shortSide() * 0.27 * p.scale;                                       // 阿葉要惡魔放大~1.35倍
    ctx.save(); ctx.globalAlpha = p.prog > 1 ? Math.max(0, 1 - (p.prog - 1) * 4) : 1; // 走完才淡出、平時不透明
    ctx.translate(p.x, p.y + bob); ctx.rotate(rot);
    ctx.shadowColor = "#7CFFB0"; ctx.shadowBlur = shortSide() * 0.04;            // 青綠發光描邊(紫背景互補色、惡魔一眼跳出不再融背景)
    if (imgReady(dImg)) ctx.drawImage(dImg, -w/2, -w*asp*0.9, w, w*asp);
    else { ctx.fillStyle = "#a05"; ctx.beginPath(); ctx.arc(0, -w*0.4, w*0.5, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
  }
  // 命中節點放出的光波（從教練位置擴散、視覺上「跳舞掃掉惡魔」）
  if (kpWaveT >= 0) { const wt = kpSongTime - kpWaveT;
    if (wt < 0.55) { const r = shortSide() * (0.2 + wt * (kpWaveGold ? 3.4 : 2.2));
      ctx.save(); ctx.globalAlpha = 0.6 * (1 - wt / 0.55); ctx.strokeStyle = kpWaveGold ? "#ffe96b" : "#7CFFB0";
      ctx.lineWidth = Math.max(4, shortSide() * 0.02); ctx.beginPath(); ctx.arc(W/2, H*0.46, r, 0, Math.PI*2); ctx.stroke(); ctx.restore(); } }
  drawParticles(); drawFloatTexts();
  ctx.restore();
  if (vidOK) {
    kpDrawPictogramTrack();                                      // Just Dance式底部動作預告捲軸(取代右上角單一火柴人)
  } else {
    kpDrawRefFigure(false);                                      // 無影片fallback:居中大火柴人示範
    const node = kpChoreo[kpNodeIdx];                            // + 中央節點倒數圈
    if (node) { const nt = kpNodeTime(node), lead = 0.8, pr = (kpSongTime - (nt - lead)) / lead;
      if (pr > 0 && pr < 1.2) { const rr = shortSide() * (0.26 * (1 - Math.min(1, pr)) + 0.18); ctx.save(); ctx.globalAlpha = 0.75; ctx.strokeStyle = node.gold ? "#ffe96b" : "#ff7fdc"; ctx.lineWidth = Math.max(3, shortSide()*0.012); ctx.beginPath(); ctx.arc(W/2, H*0.46, rr, 0, Math.PI*2); ctx.stroke(); ctx.restore(); } }
  }
  // 開場暖身期(第一個動作前):跳舞emoji + 5-4-3-2-1數字倒數(無中文、數字小孩看得懂)
  const firstNt = kpChoreo.length ? kpNodeTime(kpChoreo[0]) : 0;
  if (kpSongTime < firstNt && kpSongTime > 0) {
    const left = firstNt - kpSongTime; ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `${shortSide()*0.12}px sans-serif`; ctx.fillText("💃🎵", W/2, H*0.26);
    if (left <= 5.2) { const n = Math.ceil(left); ctx.font = `bold ${shortSide()*0.34}px sans-serif`; ctx.fillStyle = "#fff";
      ctx.globalAlpha = Math.min(1, (left % 1) + 0.3); ctx.lineWidth = shortSide()*0.02; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.strokeText(n, W/2, H*0.5); ctx.fillText(n, W/2, H*0.5); }
    ctx.restore();
  }
  if (combo >= 2) { ctx.font = `bold ${shortSide()*0.075}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = shortSide()*0.012; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.fillStyle = "#ffd54a"; const ct = "🔥" + combo; ctx.strokeText(ct, W*0.5, H*0.1); ctx.fillText(ct, W*0.5, H*0.1); } // 連擊=火焰+數字
  if (noPersonT > 0.7) drawNoPersonHint();
  drawHUD();
}
function kpPadKeys() {            // 3x4 數字鍵盤格子座標
  const keys = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];
  const cols = 3, gw = shortSide() * 0.2, gh = gw * 0.72, gap = shortSide() * 0.03;
  const totalW = cols * gw + (cols - 1) * gap, x0 = (W - totalW) / 2, y0 = H * 0.4;
  return keys.map((k, i) => {
    const c = i % cols, r = (i / cols) | 0;
    return { k, x: x0 + c * (gw + gap), y: y0 + r * (gh + gap), w: gw, h: gh };
  });
}
function drawKpPassword() {
  ctx.fillStyle = "#1a0820"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff"; ctx.font = `${shortSide() * 0.12}px sans-serif`;
  ctx.fillText("🔒🎵", W / 2, H * 0.18);
  ctx.fillStyle = "#ff7fdc"; ctx.font = `${shortSide() * 0.08}px sans-serif`;
  ctx.fillText("•".repeat(kpPwBuf.length) || "▢▢▢▢", W / 2, H * 0.3);
  for (const g of kpPadKeys()) {
    ctx.fillStyle = "rgba(255,255,255,0.12)"; roundRectFill(g.x, g.y, g.w, g.h, g.w * 0.12);
    ctx.fillStyle = g.k === "✓" ? "#7fffa0" : g.k === "⌫" ? "#ffb86b" : "#fff";
    ctx.font = `${g.h * 0.5}px sans-serif`; ctx.fillText(g.k, g.x + g.w / 2, g.y + g.h / 2);
  }
  const rr = shortSide() * 0.07, hx = shortSide() * 0.04 + rr, hy = shortSide() * 0.04 + rr;
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.arc(hx, hy, rr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = `${rr}px sans-serif`; ctx.fillText("🏠", hx, hy);
}

// ===================== 主迴圈 =====================
function loop(ts) {
  try {
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    fpsTick(ts);
    if (!(state === "playing" && currentGame === "pvz")) { runnerWantBg = false; if (bgVideo.style.display === "block") { bgVideo.style.display = "none"; try { bgVideo.pause(); } catch (e) {} } } // 離開往前衝就關背景影片
    if (!(state === "playing" && currentGame === "kpop")) { if (kpDanceVid.style.display === "block") { kpDanceVid.style.display = "none"; try { kpDanceVid.pause(); } catch (e) {} } } // 離開kpop關示範影片
    if ((state === "win" || state === "gameover") && activeBgm) { for (const t of ALL_BGM) { try { t.pause(); } catch (e) {} } activeBgm = null; } // 結算畫面停掉所有 BGM：victory 音效不被遊戲 BGM 疊著重複播
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); // iOS 切背景回來後恢復音效
    if (state === "boot") drawBoot();
    else if (state === "loading") drawLoading();
    else if (state === "error") drawError();
    else if (state === "kppassword") drawKpPassword();
    else if (state === "menu") drawMenu();
    else if (state === "transform") drawTransform(dt);
    else if (state === "playing") {
      if (currentGame === "dodge") { updateDodge(dt); drawDodgePlaying(); }
      else if (currentGame === "pvz") { updateRunner(dt); drawRunnerPlaying(); }
      else if (currentGame === "kpop") { updateKpop(dt); drawKpopPlaying(); }
      else { update(dt); drawWhackPlaying(); }
    } else if (state === "gameover") drawGameOver();
    else if (state === "win") drawWin();
  } catch (e) {
    console.error("主迴圈單幀例外（已攔截、遊戲續跑）：", e); // 一幀出錯不讓整個遊戲凍結
  } finally {
    requestAnimationFrame(loop); // 無論如何都重排下一幀（保命）
  }
}
requestAnimationFrame(loop);
