/**
 * main.js — 應用程式進入點
 * 初始化鏡頭、PoseLandmarker，管理選單與遊戲迴圈
 */

import { startCamera } from "./camera.js";
import { initPoseDetector, detect } from "./pose-detector.js";
import { FPSCounter } from "./fps-counter.js";
import { drawCamera, drawSkeleton } from "./renderer.js";
import audioManager from "./audio-manager.js";
import iceBreaker from "./games/ice-breaker.js";

// ── 配色（與遊戲一致）──
const C = {
  brand:   "#C94FC8",
  accent:  "#F5A623",
  success: "#1ABC9C",
  dark:    "#2D3436",
  light:   "#FDFEFE",
};

// DOM 元素
const videoEl = document.getElementById("camera");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const fpsEl = document.getElementById("fps");
const statusEl = document.getElementById("status");

// FPS 計數器
const fpsCounter = new FPSCounter(fpsEl);

// 應用程式狀態
let appState = "menu";       // "menu" | "modeSelect" | "playing" | "gameover"
let currentGame = null;
let currentGameName = "";
let selectedMode = "single"; // "single" | "dual"
let audioReady = false;
let settingsOpen = false;
let modeButtons = [];

// 從 localStorage 讀取音量設定
const savedBGMVol = parseFloat(localStorage.getItem("iceBreaker_bgmVolume") ?? "0.7");
const savedSFXVol = parseFloat(localStorage.getItem("iceBreaker_sfxVolume") ?? "0.85");

// 選單按鈕區域
let menuButtons = [];

// ── 設定面板相關 ──
const MAX_VOLUME = 5.0;          // 滑桿最大值（允許增益放大）
let settingsBtnArea = null;
let settingsCloseArea = null;
let bgmSliderArea = null;
let sfxSliderArea = null;
let bgmVolume = savedBGMVol;
let sfxVolume = savedSFXVol;

/**
 * 調整 Canvas 大小以符合視窗
 */
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
document.addEventListener("fullscreenchange", resizeCanvas);
document.addEventListener("webkitfullscreenchange", resizeCanvas);
resizeCanvas();

// ══════════════════════════════════════════
// ── 繪圖工具 ──
// ══════════════════════════════════════════

function outlinedText(ctx, text, x, y, fill = C.light, stroke = C.dark, lw = 4) {
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function shadowOn(ctx) {
  ctx.shadowColor = C.dark;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
}
function shadowOff(ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ══════════════════════════════════════════
// ── 選單繪製 ──
// ══════════════════════════════════════════

function renderMenu() {
  const w = canvas.width;
  const h = canvas.height;

  // 半透明遮罩讓鏡頭畫面柔和
  ctx.fillStyle = "rgba(45,52,54,0.45)";
  ctx.fillRect(0, 0, w, h);

  // 標題
  ctx.save();
  ctx.font = "bold 52px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  shadowOn(ctx);
  outlinedText(ctx, "體感派對", w / 2, h * 0.14, C.light);
  shadowOff(ctx);
  ctx.restore();

  // 副標題
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  outlinedText(ctx, "用身體動作操控遊戲！", w / 2, h * 0.21, "rgba(255,255,255,0.7)", C.dark, 2);

  // 遊戲卡片
  const btnW = Math.min(300, w * 0.75);
  const btnH = 80;
  const btnX = (w - btnW) / 2;
  const startY = h * 0.32;

  const games = [
    { name: "ice-breaker", label: "❄  敲冰塊",     desc: "揮動手臂敲碎冰塊", color: "#4A90D9" },
    { name: "pose-match",  label: "🤸  姿勢模仿",  desc: "即將推出",         color: C.success },
    { name: "helicopter",  label: "🚁  直升機競賽", desc: "即將推出",         color: C.brand },
  ];

  menuButtons = [];
  games.forEach((game, i) => {
    const y = startY + i * (btnH + 18);
    const enabled = game.name === "ice-breaker";

    ctx.save();
    if (enabled) shadowOn(ctx);

    // 卡片背景
    ctx.fillStyle = enabled ? game.color : "rgba(80,80,80,0.4)";
    rrect(ctx, btnX, y, btnW, btnH, 20);
    ctx.fill();
    shadowOff(ctx);

    // 邊框
    ctx.strokeStyle = enabled ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 文字
    ctx.font = "bold 24px 'Arial Black', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (enabled) {
      outlinedText(ctx, game.label, w / 2, y + 30, C.light);
    } else {
      outlinedText(ctx, game.label, w / 2, y + 30, "rgba(255,255,255,0.35)", C.dark, 2);
    }
    ctx.font = "bold 14px sans-serif";
    outlinedText(ctx, game.desc, w / 2, y + 56,
      enabled ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)", C.dark, 2);

    if (enabled) {
      menuButtons.push({ x: btnX, y, w: btnW, h: btnH, game: game.name });
    }
  });
}

// ══════════════════════════════════════════
// ── 模式選擇頁面 ──
// ══════════════════════════════════════════

function renderModeSelect() {
  const w = canvas.width;
  const h = canvas.height;

  // 遮罩
  ctx.fillStyle = "rgba(45,52,54,0.45)";
  ctx.fillRect(0, 0, w, h);

  // 標題
  ctx.font = "bold 64px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  outlinedText(ctx, "選擇模式", w / 2, h * 0.18, C.light, C.dark, 5);

  const btnW = Math.min(380, w * 0.8);
  const btnH = 200;
  const gap = 40;
  const totalH = btnH * 2 + gap;
  const startY = (h - totalH) / 2;
  const btnX = (w - btnW) / 2;

  modeButtons = [];

  // 單人模式按鈕
  const singleY = startY;
  ctx.save();
  shadowOn(ctx);
  ctx.fillStyle = "#C94FC8";
  rrect(ctx, btnX, singleY, btnW, btnH, 28);
  ctx.fill();
  shadowOff(ctx);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.font = "80px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("👤", w / 2, singleY + 70);
  ctx.font = "bold 48px 'Arial Black', sans-serif";
  outlinedText(ctx, "單人模式", w / 2, singleY + 145, C.light, C.dark, 4);
  ctx.font = "bold 24px sans-serif";
  outlinedText(ctx, "一個人挑戰高分！", w / 2, singleY + 180, "rgba(255,255,255,0.7)", C.dark, 2);
  modeButtons.push({ x: btnX, y: singleY, w: btnW, h: btnH, mode: "single" });

  // 雙人模式按鈕
  const dualY = startY + btnH + gap;
  ctx.save();
  shadowOn(ctx);
  ctx.fillStyle = "#F5A623";
  rrect(ctx, btnX, dualY, btnW, btnH, 28);
  ctx.fill();
  shadowOff(ctx);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.font = "80px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("👥", w / 2, dualY + 70);
  ctx.font = "bold 48px 'Arial Black', sans-serif";
  outlinedText(ctx, "雙人模式", w / 2, dualY + 145, C.dark, "rgba(255,255,255,0.3)", 4);
  ctx.font = "bold 24px sans-serif";
  outlinedText(ctx, "兩個人一起玩！", w / 2, dualY + 180, "rgba(0,0,0,0.5)", C.dark, 2);
  modeButtons.push({ x: btnX, y: dualY, w: btnW, h: btnH, mode: "dual" });

  // 返回按鈕
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  outlinedText(ctx, "← 返回", 24, 50, "rgba(255,255,255,0.7)", C.dark, 3);
  modeButtons.push({ x: 0, y: 20, w: 160, h: 60, mode: "back" });
}

// ══════════════════════════════════════════
// ── 設定面板 ──
// ══════════════════════════════════════════

function renderSettingsButton() {
  const btnSize = 70;
  const margin = 16;
  const bx = canvas.width - btnSize - margin;
  const by = margin;

  ctx.save();
  ctx.fillStyle = "#2D3436";
  ctx.beginPath();
  ctx.arc(bx + btnSize / 2, by + btnSize / 2, btnSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#F5A623";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = "40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚙️", bx + btnSize / 2, by + btnSize / 2);
  ctx.restore();

  settingsBtnArea = { x: bx, y: by, w: btnSize, h: btnSize };
}

// ── 全螢幕按鈕 ──
let fullscreenBtnArea = null;

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function renderFullscreenButton() {
  const btnW = 120;
  const btnH = 44;
  const margin = 16;
  const bx = canvas.width - btnW - margin;
  const by = canvas.height - btnH - margin;
  const label = isFullscreen() ? "結束全螢幕" : "全螢幕";

  ctx.save();
  ctx.fillStyle = "rgba(26, 188, 156, 0.85)";
  rrect(ctx, bx, by, btnW, btnH, 12);
  ctx.fill();
  ctx.font = "bold 20px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  outlinedText(ctx, label, bx + btnW / 2, by + btnH / 2, C.light, C.dark, 3);
  ctx.restore();

  fullscreenBtnArea = { x: bx, y: by, w: btnW, h: btnH };
}

async function toggleFullscreen() {
  const el = document.documentElement;
  try {
    if (!isFullscreen()) {
      // 標準 API → webkit 前綴（iOS Safari）
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
      // 嘗試鎖定橫向
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  } catch (e) {
    console.warn("[Fullscreen]", e);
  }
}

function renderSettingsPanel() {
  const w = canvas.width;
  const h = canvas.height;
  const panelW = Math.min(500, w * 0.85);
  const panelH = 360;
  const px = (w - panelW) / 2;
  const py = (h - panelH) / 2;

  // 遮罩
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, w, h);

  // 面板
  ctx.save();
  ctx.fillStyle = "#2D3436";
  rrect(ctx, px, py, panelW, panelH, 28);
  ctx.fill();
  ctx.strokeStyle = "#C94FC8";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  // 標題
  ctx.font = "bold 40px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  outlinedText(ctx, "🔊 音量設定", w / 2, py + 50, C.light);

  // ── BGM 滑桿 ──
  const sliderX = px + 100;
  const sliderW = panelW - 160;
  const sliderH = 24;
  const bgmY = py + 120;

  ctx.font = "36px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText("🎵", px + 30, bgmY + sliderH / 2);

  // 軌道
  ctx.fillStyle = "#555";
  rrect(ctx, sliderX, bgmY, sliderW, sliderH, 12);
  ctx.fill();
  // 已填充
  ctx.fillStyle = "#F5A623";
  rrect(ctx, sliderX, bgmY, sliderW * (bgmVolume / MAX_VOLUME), sliderH, 12);
  ctx.fill();
  // 把手
  const bgmHandleX = sliderX + sliderW * (bgmVolume / MAX_VOLUME);
  ctx.fillStyle = "#FDFEFE";
  ctx.strokeStyle = "#F5A623";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(bgmHandleX, bgmY + sliderH / 2, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  bgmSliderArea = { x: sliderX, y: bgmY - 10, w: sliderW, h: sliderH + 20 };

  // ── SFX 滑桿 ──
  const sfxY = py + 210;

  ctx.font = "36px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.fillText("🔊", px + 30, sfxY + sliderH / 2);

  ctx.fillStyle = "#555";
  rrect(ctx, sliderX, sfxY, sliderW, sliderH, 12);
  ctx.fill();
  ctx.fillStyle = "#1ABC9C";
  rrect(ctx, sliderX, sfxY, sliderW * (sfxVolume / MAX_VOLUME), sliderH, 12);
  ctx.fill();
  const sfxHandleX = sliderX + sliderW * (sfxVolume / MAX_VOLUME);
  ctx.fillStyle = "#FDFEFE";
  ctx.strokeStyle = "#1ABC9C";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sfxHandleX, sfxY + sliderH / 2, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  sfxSliderArea = { x: sliderX, y: sfxY - 10, w: sliderW, h: sliderH + 20 };

  // ── 關閉按鈕 ──
  const closeSize = 56;
  const closeX = px + panelW - closeSize - 10;
  const closeY = py + 10;
  ctx.fillStyle = "#FF4757";
  ctx.beginPath();
  ctx.arc(closeX + closeSize / 2, closeY + closeSize / 2, closeSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText("✕", closeX + closeSize / 2, closeY + closeSize / 2);

  settingsCloseArea = { x: closeX, y: closeY, w: closeSize, h: closeSize };

  // 百分比文字
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "#F5A623";
  ctx.fillText(`${Math.round((bgmVolume / MAX_VOLUME) * 100)}%`, sliderX + sliderW + 55, bgmY + sliderH / 2);
  ctx.fillStyle = "#1ABC9C";
  ctx.fillText(`${Math.round((sfxVolume / MAX_VOLUME) * 100)}%`, sliderX + sliderW + 55, sfxY + sliderH / 2);
}

// ══════════════════════════════════════════
// ── 點擊處理 ──
// ══════════════════════════════════════════

canvas.addEventListener("click", async (e) => {
  // 第一次點擊時初始化音效
  if (!audioReady) {
    try {
      await audioManager.init("MUSIC");
      audioReady = true;
      audioManager.setBGMVolume(savedBGMVol);
      audioManager.setSFXVolume(savedSFXVol);
      console.log("[Main] 音效初始化完成，開始播放選單 BGM");
      audioManager.playBGM("menu");
    } catch (err) {
      console.warn("音效初始化失敗:", err);
      audioReady = true;
    }
  }
  audioManager.resume();

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  // 設定面板的點擊處理
  if (settingsOpen) {
    // 關閉按鈕
    if (settingsCloseArea &&
        cx >= settingsCloseArea.x && cx <= settingsCloseArea.x + settingsCloseArea.w &&
        cy >= settingsCloseArea.y && cy <= settingsCloseArea.y + settingsCloseArea.h) {
      settingsOpen = false;
      localStorage.setItem("iceBreaker_bgmVolume", bgmVolume.toString());
      localStorage.setItem("iceBreaker_sfxVolume", sfxVolume.toString());
    }
    // BGM 滑桿點擊
    if (bgmSliderArea &&
        cx >= bgmSliderArea.x && cx <= bgmSliderArea.x + bgmSliderArea.w &&
        cy >= bgmSliderArea.y && cy <= bgmSliderArea.y + bgmSliderArea.h) {
      bgmVolume = Math.max(0, Math.min(MAX_VOLUME, ((cx - bgmSliderArea.x) / bgmSliderArea.w) * MAX_VOLUME));
      audioManager.setBGMVolume(bgmVolume);
      localStorage.setItem("iceBreaker_bgmVolume", bgmVolume.toString());
    }
    // SFX 滑桿點擊
    if (sfxSliderArea &&
        cx >= sfxSliderArea.x && cx <= sfxSliderArea.x + sfxSliderArea.w &&
        cy >= sfxSliderArea.y && cy <= sfxSliderArea.y + sfxSliderArea.h) {
      sfxVolume = Math.max(0, Math.min(MAX_VOLUME, ((cx - sfxSliderArea.x) / sfxSliderArea.w) * MAX_VOLUME));
      audioManager.setSFXVolume(sfxVolume);
      localStorage.setItem("iceBreaker_sfxVolume", sfxVolume.toString());
    }
    return;
  }

  // 全螢幕按鈕點擊（只在選單時）
  if (appState === "menu" && fullscreenBtnArea &&
      cx >= fullscreenBtnArea.x && cx <= fullscreenBtnArea.x + fullscreenBtnArea.w &&
      cy >= fullscreenBtnArea.y && cy <= fullscreenBtnArea.y + fullscreenBtnArea.h) {
    toggleFullscreen();
    return;
  }

  // 設定按鈕點擊（只在選單時）
  if (appState === "menu" && settingsBtnArea &&
      cx >= settingsBtnArea.x && cx <= settingsBtnArea.x + settingsBtnArea.w &&
      cy >= settingsBtnArea.y && cy <= settingsBtnArea.y + settingsBtnArea.h) {
    settingsOpen = true;
    return;
  }

  if (appState === "menu") {
    for (const btn of menuButtons) {
      if (cx >= btn.x && cx <= btn.x + btn.w &&
          cy >= btn.y && cy <= btn.y + btn.h) {
        if (btn.game === "ice-breaker") {
          audioManager.play("menu_click");
          appState = "modeSelect";
        }
        break;
      }
    }
  } else if (appState === "modeSelect") {
    for (const btn of modeButtons) {
      if (cx >= btn.x && cx <= btn.x + btn.w &&
          cy >= btn.y && cy <= btn.y + btn.h) {
        if (btn.mode === "back") {
          appState = "menu";
          return;
        }
        audioManager.play("menu_click");
        selectedMode = btn.mode;
        // 雙人模式需要 numPoses: 2
        if (selectedMode === "dual") {
          initPoseDetector(2);
        }
        startGame("ice-breaker");
        break;
      }
    }
  } else if (appState === "gameover" && currentGame?.handleClick) {
    const action = currentGame.handleClick(cx, cy);
    audioManager.play("btn_click");
    if (action === "replay") {
      startGame(currentGameName);
    } else if (action === "menu") {
      currentGame.destroy();
      currentGame = null;
      currentGameName = "";
      appState = "menu";
      // 雙人模式回選單時恢復 numPoses: 1
      if (selectedMode === "dual") {
        initPoseDetector(1);
      }
      selectedMode = "single";
      audioManager.stopBGM(0);
      audioManager.playBGM("menu");
    }
  }
});

// 觸控/滑鼠拖曳支援（音量滑桿）
canvas.addEventListener("pointermove", (e) => {
  if (!settingsOpen) return;
  if (!(e.buttons > 0 || e.pointerType === "touch")) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  if (bgmSliderArea &&
      cx >= bgmSliderArea.x - 20 && cx <= bgmSliderArea.x + bgmSliderArea.w + 20 &&
      cy >= bgmSliderArea.y - 20 && cy <= bgmSliderArea.y + bgmSliderArea.h + 20) {
    bgmVolume = Math.max(0, Math.min(MAX_VOLUME, ((cx - bgmSliderArea.x) / bgmSliderArea.w) * MAX_VOLUME));
    audioManager.setBGMVolume(bgmVolume);
  }
  if (sfxSliderArea &&
      cx >= sfxSliderArea.x - 20 && cx <= sfxSliderArea.x + sfxSliderArea.w + 20 &&
      cy >= sfxSliderArea.y - 20 && cy <= sfxSliderArea.y + sfxSliderArea.h + 20) {
    sfxVolume = Math.max(0, Math.min(MAX_VOLUME, ((cx - sfxSliderArea.x) / sfxSliderArea.w) * MAX_VOLUME));
    audioManager.setSFXVolume(sfxVolume);
  }
});

// ══════════════════════════════════════════
// ── 遊戲生命週期 ──
// ══════════════════════════════════════════

function startGame(gameName) {
  if (gameName === "ice-breaker") {
    currentGame = iceBreaker;
  }
  if (!currentGame) return;
  currentGameName = gameName;

  // 切換到遊戲 BGM（即時停止，避免 fade-out 與新 BGM 的 gain 衝突）
  audioManager.stopBGM(0);
  audioManager.setBGMPlaybackRate(1.0);
  audioManager.playBGM("gameplay");

  currentGame.init(ctx, {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    mode: selectedMode,
    playerCount: selectedMode === "dual" ? 2 : 1,
    audioManager: audioManager,
  });
  appState = "playing";
}

// ══════════════════════════════════════════
// ── 主迴圈 ──
// ══════════════════════════════════════════

function loop(timestamp) {
  fpsCounter.tick(timestamp);

  const allLandmarks = detect(videoEl, timestamp);

  // 清除畫面
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 繪製鏡頭畫面（傳入當前狀態）
  drawCamera(ctx, videoEl, canvas.width, canvas.height, appState === "gameover" ? "gameover" : appState);

  // 骨架線已隱藏（僅保留遊戲內的手套渲染）

  if (appState === "menu") {
    renderMenu();
  } else if (appState === "modeSelect") {
    renderModeSelect();
  } else if (appState === "playing" && currentGame) {
    currentGame.update(allLandmarks, timestamp);
    currentGame.render(ctx);

    if (currentGame.isGameOver()) {
      appState = "gameover";
    }
  } else if (appState === "gameover" && currentGame) {
    currentGame.update(allLandmarks, timestamp);
    currentGame.render(ctx);
  }

  // debug：偵測人數
  if (allLandmarks.length > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`偵測 ${allLandmarks.length} 人`, 10, canvas.height - 8);
  }

  // 設定 + 全螢幕按鈕（只在選單畫面顯示）
  if (appState === "menu") {
    renderSettingsButton();
    renderFullscreenButton();
  }

  // 設定面板（覆蓋在最上層）
  if (settingsOpen) {
    renderSettingsPanel();
  }

  requestAnimationFrame(loop);
}

// ══════════════════════════════════════════
// ── 啟動 ──
// ══════════════════════════════════════════

async function init() {
  try {
    statusEl.textContent = "正在開啟鏡頭...";
    await startCamera(videoEl);
    statusEl.textContent = "鏡頭已就緒，正在載入姿態模型...";

    await initPoseDetector(1);
    statusEl.textContent = "";

    requestAnimationFrame(loop);
  } catch (err) {
    console.error("初始化失敗:", err);
    statusEl.textContent = `錯誤：${err.message}`;
    statusEl.style.color = "#FF6B6B";
  }
}

init();
