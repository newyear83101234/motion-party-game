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

  // 模型檔也鎖死版號（原本 latest = Google 更新模型→判定手感默默改變，跟鎖死的舊 runtime 也可能不相容）
  const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

  // GPU delegate 在部分舊 Android / WebGL 被封鎖的機型會初始化失敗 → 自動退回 CPU（lite 模型 CPU 多數手機仍可玩）
  const buildOptions = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: numPoses,
    outputSegmentationMasks: withMask, // 輸出人體遮罩（背景替換用）；往前衝 runner 不需要、關掉省效能
  });
  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, buildOptions("GPU"));
  } catch (e) {
    console.warn("GPU delegate 初始化失敗，改用 CPU：", e);
    poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, buildOptions("CPU"));
  }
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
export function detect(video, timestamp, needMask = true) {
  if (!poseLandmarker) return { landmarks: [], mask: null };
  if (!video || video.readyState < 2) return { landmarks: [], mask: null };
  let result;
  try {
    result = poseLandmarker.detectForVideo(video, timestamp); // WebGL context lost 等情況可能丟例外
  } catch (e) {
    console.warn("detectForVideo 失敗（單幀略過）：", e);
    return { landmarks: [], mask: null };
  }
  const landmarks = filterNaN(result.landmarks || []);
  let mask = null;
  const masks = result.segmentationMasks;
  if (masks && masks.length) {
    // needMask 為 false（往前衝 runner）時跳過昂貴的 Float32Array 複製，但遮罩照樣全部 close
    if (needMask && masks[0]) {
      const m = masks[0];
      try { mask = { data: m.getAsFloat32Array(), width: m.width, height: m.height }; } catch (e) { mask = null; }
    }
    for (const mm of masks) { try { mm.close(); } catch (e) {} } // close 全部遮罩（雙人 masks[1] 之前漏掉=記憶體洩漏）
  }
  return { landmarks, mask };
}
