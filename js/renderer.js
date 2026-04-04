/**
 * renderer.js — Canvas 繪製模組
 * 負責繪製鏡頭畫面與骨架關鍵點
 */

// 骨架連線定義（PoseLandmarker 33 點的連接關係）
const SKELETON_CONNECTIONS = [
  // 軀幹
  [11, 12], // 雙肩
  [11, 23], [12, 24], // 肩到臀
  [23, 24], // 雙臀
  // 左臂
  [11, 13], [13, 15],
  // 右臂
  [12, 14], [14, 16],
  // 左腿
  [23, 25], [25, 27],
  // 右腿
  [24, 26], [26, 28],
  // 左手指
  [15, 17], [15, 19], [15, 21],
  // 右手指
  [16, 18], [16, 20], [16, 22],
  // 左腳
  [27, 29], [27, 31],
  // 右腳
  [28, 30], [28, 32],
];

// 關鍵點顏色（依身體部位分色）
const POINT_COLORS = {
  face: "#FF6B6B",    // 臉部（0-10）
  body: "#4ECDC4",    // 軀幹（11-12, 23-24）
  leftArm: "#45B7D1", // 左臂（13, 15, 17, 19, 21）
  rightArm: "#96CEB4",// 右臂（14, 16, 18, 20, 22）
  leftLeg: "#FFEAA7",  // 左腿（25, 27, 29, 31）
  rightLeg: "#DDA0DD", // 右腿（26, 28, 30, 32）
};

/**
 * 取得關鍵點對應的顏色
 */
function getPointColor(index) {
  if (index <= 10) return POINT_COLORS.face;
  if ([11, 12, 23, 24].includes(index)) return POINT_COLORS.body;
  if ([13, 15, 17, 19, 21].includes(index)) return POINT_COLORS.leftArm;
  if ([14, 16, 18, 20, 22].includes(index)) return POINT_COLORS.rightArm;
  if ([25, 27, 29, 31].includes(index)) return POINT_COLORS.leftLeg;
  return POINT_COLORS.rightLeg;
}

// 偵測 ctx.filter 支援度（初次呼叫時判斷）
let _supportsFilter = null;

/**
 * 繪製鏡頭畫面（鏡像翻轉）
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLVideoElement} video
 * @param {number} w - canvas 寬度
 * @param {number} h - canvas 高度
 * @param {"menu"|"playing"|"gameover"} mode - 遊戲階段
 */
export function drawCamera(ctx, video, w, h, mode = "playing") {
  if (_supportsFilter === null) {
    _supportsFilter = typeof ctx.filter !== "undefined";
  }

  ctx.save();
  ctx.globalAlpha = 1.0;

  // 依階段設定不同濾鏡
  if (_supportsFilter) {
    switch (mode) {
      case "menu":
        ctx.filter = "brightness(1.0) saturate(0.85)";
        break;
      case "playing":
        ctx.filter = "brightness(1.05) contrast(1.1) saturate(1.05)";
        break;
      case "gameover":
        ctx.filter = "brightness(0.7) saturate(0.6)";
        break;
    }
  }

  // 鏡像翻轉繪製
  ctx.scale(-1, 1);
  ctx.drawImage(video, -w, 0, w, h);
  ctx.restore();

  // 重置濾鏡（避免影響上層元素）
  ctx.filter = "none";
}

/**
 * 繪製骨架關鍵點與連線
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number, y:number, visibility:number}>} landmarks - 33 個關鍵點
 * @param {number} w - canvas 寬度
 * @param {number} h - canvas 高度
 */
export function drawSkeleton(ctx, landmarks, w, h) {
  if (!landmarks || landmarks.length === 0) return;

  const VISIBILITY_THRESHOLD = 0.5;

  // 繪製連線
  ctx.lineWidth = 3;
  for (const [i, j] of SKELETON_CONNECTIONS) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (a.visibility < VISIBILITY_THRESHOLD || b.visibility < VISIBILITY_THRESHOLD) continue;

    // 鏡像翻轉 x 座標
    const ax = (1 - a.x) * w;
    const ay = a.y * h;
    const bx = (1 - b.x) * w;
    const by = b.y * h;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // 繪製關鍵點
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (lm.visibility < VISIBILITY_THRESHOLD) continue;

    const x = (1 - lm.x) * w;
    const y = lm.y * h;
    const radius = [11, 12, 23, 24, 15, 16].includes(i) ? 7 : 4;

    ctx.fillStyle = getPointColor(i);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 外圈
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
