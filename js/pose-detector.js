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
 * 若已有舊實例會先 close 避免記憶體洩漏（切換單人/雙人模式時會重建）
 * @param {number} numPoses - 偵測人數（1 或 2）
 * @returns {Promise<void>}
 */
export async function initPoseDetector(numPoses = 1) {
  // 切換 numPoses 時先 close 舊實例，避免 wasm heap 洩漏與雙實例並存
  if (poseLandmarker) {
    try { poseLandmarker.close(); } catch (_) {}
    poseLandmarker = null;
  }

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
 * 過濾 landmarks 中的 NaN / Infinity 座標
 * 低光源或極端角度時 MediaPipe 偶爾吐 NaN，會污染整條 EMA 歷史
 * @param {Array<Array<{x:number, y:number, z:number, visibility:number}>>} landmarks
 * @returns {Array<Array<{x:number, y:number, z:number, visibility:number}>>}
 */
function filterNaN(landmarks) {
  return landmarks.map(personLm =>
    personLm.map(pt => {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) {
        // 回傳低 visibility 標記，讓後續邏輯自然排除
        return { x: 0, y: 0, z: 0, visibility: 0 };
      }
      return pt;
    })
  );
}

/**
 * 對當前影格執行骨架偵測
 * @param {HTMLVideoElement} video - 鏡頭 video 元素
 * @param {number} timestamp - requestAnimationFrame 的時間戳
 * @returns {Array<Array<{x:number, y:number, z:number, visibility:number}>>} 各玩家的 33 個關鍵點
 */
export function detect(video, timestamp) {
  if (!poseLandmarker) return [];
  // readyState < 2 時 video metadata 還沒備妥，detect 會吐空資料污染 EMA
  if (!video || video.readyState < 2) return [];
  const result = poseLandmarker.detectForVideo(video, timestamp);
  return filterNaN(result.landmarks || []);
}
