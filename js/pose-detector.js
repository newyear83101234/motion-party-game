/**
 * pose-detector.js — MediaPipe PoseLandmarker 封裝
 * （沿用自舊專案 party game，已驗證可用）
 * 負責載入姿勢偵測模型，並對每一影格回傳身體 33 個關節點。
 */

// 從 jsDelivr CDN 載入 MediaPipe Vision
// 已鎖版本（原本 @latest 是定時炸彈，哪天 MediaPipe 大改版會壞掉）
const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

/** @type {any} */
let poseLandmarker = null;

/**
 * 初始化 PoseLandmarker（只偵測 1 個人）
 * @returns {Promise<void>}
 */
export async function initPoseDetector(numPoses = 1, withMask = true) {
  if (poseLandmarker) {
    try { poseLandmarker.close(); } catch (_) {}
    poseLandmarker = null;
  }

  const vision = await import(`${VISION_CDN}/vision_bundle.mjs`);
  const { PoseLandmarker, FilesetResolver } = vision;

  const filesetResolver = await FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);

  poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      // lite 模型：精度稍低但速度快，適合手機 + 小孩大動作
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: numPoses,
    outputSegmentationMasks: withMask, // 輸出人體遮罩（背景替換用）；往前衝 runner 不需要、關掉省效能
  });
}

/**
 * 過濾 landmarks 中的 NaN / Infinity 座標
 * 低光源或極端角度時 MediaPipe 偶爾吐 NaN
 */
function filterNaN(landmarks) {
  return landmarks.map((personLm) =>
    personLm.map((pt) => {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) {
        return { x: 0, y: 0, z: 0, visibility: 0 };
      }
      return pt;
    })
  );
}

/**
 * 對當前影格執行骨架偵測
 * @param {HTMLVideoElement} video - 鏡頭 video 元素
 * @param {number} timestamp - requestAnimationFrame 的時間戳（毫秒、遞增）
 * @returns {Array<Array<{x:number, y:number, z:number, visibility:number}>>} 各玩家的 33 個關鍵點（座標為 0~1 比例）
 */
export function detect(video, timestamp) {
  if (!poseLandmarker) return { landmarks: [], mask: null };
  if (!video || video.readyState < 2) return { landmarks: [], mask: null };
  const result = poseLandmarker.detectForVideo(video, timestamp);
  const landmarks = filterNaN(result.landmarks || []);
  let mask = null;
  const masks = result.segmentationMasks;
  if (masks && masks[0]) {
    const m = masks[0];
    try { mask = { data: m.getAsFloat32Array(), width: m.width, height: m.height }; } catch (e) { mask = null; }
    try { m.close(); } catch (e) {} // 釋放 WASM 記憶體，避免洩漏
  }
  return { landmarks, mask };
}
