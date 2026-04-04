/**
 * pose-detector.js — MediaPipe PoseLandmarker 封裝
 * 負責載入模型與執行骨架偵測
 */

// 從 jsDelivr CDN 載入 MediaPipe Vision
const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

/** @type {import("@mediapipe/tasks-vision").PoseLandmarker | null} */
let poseLandmarker = null;

/**
 * 初始化 PoseLandmarker
 * @param {number} numPoses - 偵測人數（1 或 2）
 * @returns {Promise<void>}
 */
export async function initPoseDetector(numPoses = 1) {
  // 動態匯入 MediaPipe Vision 模組
  const vision = await import(`${VISION_CDN}/vision_bundle.mjs`);
  const { PoseLandmarker, FilesetResolver } = vision;

  // 載入 WASM 檔案集
  const filesetResolver = await FilesetResolver.forVisionTasks(
    `${VISION_CDN}/wasm`
  );

  // 建立 PoseLandmarker 實例
  poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: numPoses,
  });
}

/**
 * 對當前影格執行骨架偵測
 * @param {HTMLVideoElement} video - 鏡頭 video 元素
 * @param {number} timestamp - requestAnimationFrame 的時間戳
 * @returns {Array<Array<{x:number, y:number, z:number, visibility:number}>>} 各玩家的 33 個關鍵點
 */
export function detect(video, timestamp) {
  if (!poseLandmarker) return [];
  const result = poseLandmarker.detectForVideo(video, timestamp);
  return result.landmarks || [];
}
