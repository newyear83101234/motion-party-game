/**
 * 姿勢模仿遊戲 — 姿勢比對引擎
 * 使用加權關節角度比對法，計算玩家與目標姿勢的相似度百分比
 */

import { LANDMARK } from "./pose-library.js";

/**
 * 計算三個點之間的夾角（度）
 * @param {Object} a - 點 A {x, y}
 * @param {Object} b - 點 B（頂點）{x, y}
 * @param {Object} c - 點 C {x, y}
 * @returns {number} 角度（0-180）
 */
function calcAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);

  if (magAB === 0 || magCB === 0) return 0;

  // 限制在 [-1, 1] 避免浮點數誤差
  const cosine = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return Math.acos(cosine) * (180 / Math.PI);
}

/**
 * 計算軀幹傾斜角度
 * 肩膀中點到髖部中點的連線與垂直線的夾角
 * 正值 = 右傾，負值 = 左傾
 * @param {Array} landmarks - 33 個 landmark 點
 * @returns {number} 傾斜角度（度）
 */
function calcTorsoTilt(landmarks) {
  const ls = landmarks[LANDMARK.LEFT_SHOULDER];
  const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
  const lh = landmarks[LANDMARK.LEFT_HIP];
  const rh = landmarks[LANDMARK.RIGHT_HIP];

  // 肩膀中點
  const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  // 髖部中點
  const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };

  // 計算與垂直線的夾角
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;

  // atan2 回傳弧度，轉換為度
  // 注意：y 軸是向下的（螢幕座標），所以 dy 通常是負值
  const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
  return angle;
}

/**
 * 從 landmark 陣列計算所有 9 組關節角度
 * @param {Array} landmarks - MediaPipe 的 33 個 landmark
 * @returns {Object} 9 組關節角度
 */
export function extractAngles(landmarks) {
  const L = LANDMARK;

  return {
    // 肩膀角度：肘→肩→髖
    leftShoulder: calcAngle(
      landmarks[L.LEFT_ELBOW], landmarks[L.LEFT_SHOULDER], landmarks[L.LEFT_HIP]
    ),
    rightShoulder: calcAngle(
      landmarks[L.RIGHT_ELBOW], landmarks[L.RIGHT_SHOULDER], landmarks[L.RIGHT_HIP]
    ),
    // 手肘角度：肩→肘→腕
    leftElbow: calcAngle(
      landmarks[L.LEFT_SHOULDER], landmarks[L.LEFT_ELBOW], landmarks[L.LEFT_WRIST]
    ),
    rightElbow: calcAngle(
      landmarks[L.RIGHT_SHOULDER], landmarks[L.RIGHT_ELBOW], landmarks[L.RIGHT_WRIST]
    ),
    // 髖部角度：肩→髖→膝
    leftHip: calcAngle(
      landmarks[L.LEFT_SHOULDER], landmarks[L.LEFT_HIP], landmarks[L.LEFT_KNEE]
    ),
    rightHip: calcAngle(
      landmarks[L.RIGHT_SHOULDER], landmarks[L.RIGHT_HIP], landmarks[L.RIGHT_KNEE]
    ),
    // 膝蓋角度：髖→膝→踝
    leftKnee: calcAngle(
      landmarks[L.LEFT_HIP], landmarks[L.LEFT_KNEE], landmarks[L.LEFT_ANKLE]
    ),
    rightKnee: calcAngle(
      landmarks[L.RIGHT_HIP], landmarks[L.RIGHT_KNEE], landmarks[L.RIGHT_ANKLE]
    ),
    // 軀幹傾斜
    torsoTilt: calcTorsoTilt(landmarks),
  };
}

/**
 * 計算單一角度的匹配分數
 * 差距 0° = 100 分，差距 ≥ 45° = 0 分，線性遞減
 * @param {number} actual - 玩家的角度
 * @param {number} target - 目標角度
 * @returns {number} 0-100 的分數
 */
function angleScore(actual, target) {
  const diff = Math.abs(actual - target);
  const maxDiff = 45; // 超過 45° 差距就給 0 分
  return Math.max(0, 100 * (1 - diff / maxDiff));
}

/**
 * 比較玩家姿勢與目標姿勢，回傳總分與各部位分數
 *
 * ★ 對稱處理：同時計算「正向匹配」和「鏡像匹配」，取較高分。
 *   這樣無論玩家面對鏡頭的方向如何，都不會被錯誤扣分。
 *
 * @param {Array} landmarks - 玩家的 33 個 landmark
 * @param {Object} targetPose - 目標姿勢資料（來自 pose-library）
 * @returns {Object} { totalScore, partScores, usedMirror }
 *   - totalScore: 0-100 的加權平均總分
 *   - partScores: 每個部位的個別分數（用於三色回饋）
 *   - usedMirror: 是否使用了鏡像匹配
 */
export function comparePose(landmarks, targetPose) {
  const target = targetPose.targetAngles;
  const weights = targetPose.weights;

  // 提取玩家的關節角度
  const playerAngles = extractAngles(landmarks);

  // ── 正向匹配 ──
  const normalScores = {};
  let normalTotal = 0;
  for (const key of Object.keys(target)) {
    normalScores[key] = angleScore(playerAngles[key], target[key]);
    normalTotal += normalScores[key] * (weights[key] || 0);
  }

  // ── 鏡像匹配（左右互換）──
  const mirrorMap = {
    leftShoulder: "rightShoulder",
    rightShoulder: "leftShoulder",
    leftElbow: "rightElbow",
    rightElbow: "leftElbow",
    leftHip: "rightHip",
    rightHip: "leftHip",
    leftKnee: "rightKnee",
    rightKnee: "leftKnee",
    torsoTilt: "torsoTilt",  // 軀幹傾斜取反
  };

  const mirrorScores = {};
  let mirrorTotal = 0;
  for (const key of Object.keys(target)) {
    const mirrorKey = mirrorMap[key];
    let mirrorAngle = playerAngles[mirrorKey];
    // 軀幹傾斜鏡像時取反
    if (key === "torsoTilt") mirrorAngle = -mirrorAngle;
    mirrorScores[key] = angleScore(mirrorAngle, target[key]);
    mirrorTotal += mirrorScores[key] * (weights[key] || 0);
  }

  // 取較高分的版本
  const usedMirror = mirrorTotal > normalTotal;
  const totalScore = Math.max(normalTotal, mirrorTotal);
  const partScores = usedMirror ? mirrorScores : normalScores;

  return { totalScore, partScores, usedMirror };
}

/**
 * 檢查關鍵 landmark 是否都可見（用於全身校準）
 * @param {Array} landmarks - 33 個 landmark
 * @returns {Object} { allVisible, missingParts }
 */
export function checkFullBodyVisible(landmarks) {
  const criticalPoints = [
    { idx: LANDMARK.LEFT_SHOULDER, name: "左肩" },
    { idx: LANDMARK.RIGHT_SHOULDER, name: "右肩" },
    { idx: LANDMARK.LEFT_ELBOW, name: "左肘" },
    { idx: LANDMARK.RIGHT_ELBOW, name: "右肘" },
    { idx: LANDMARK.LEFT_WRIST, name: "左腕" },
    { idx: LANDMARK.RIGHT_WRIST, name: "右腕" },
    { idx: LANDMARK.LEFT_HIP, name: "左髖" },
    { idx: LANDMARK.RIGHT_HIP, name: "右髖" },
    { idx: LANDMARK.LEFT_KNEE, name: "左膝" },
    { idx: LANDMARK.RIGHT_KNEE, name: "右膝" },
    { idx: LANDMARK.LEFT_ANKLE, name: "左踝" },
    { idx: LANDMARK.RIGHT_ANKLE, name: "右踝" },
  ];

  const VISIBILITY_THRESHOLD = 0.5;
  const missingParts = [];

  for (const point of criticalPoints) {
    if (!landmarks[point.idx] || landmarks[point.idx].visibility < VISIBILITY_THRESHOLD) {
      missingParts.push(point.name);
    }
  }

  return {
    allVisible: missingParts.length === 0,
    missingParts,
    // 如果腿部偵測不到，提示玩家退後
    needStepBack: missingParts.some(p =>
      p.includes("膝") || p.includes("踝") || p.includes("髖")
    ),
  };
}

export default { extractAngles, comparePose, checkFullBodyVisible };
