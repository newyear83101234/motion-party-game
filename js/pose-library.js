/**
 * 姿勢模仿遊戲 — 姿勢資料庫
 * 定義 12 個目標姿勢的標準關節角度與相關資料
 *
 * 角度說明：
 * - 所有角度以「度」為單位（0-180）
 * - 角度由三個關節點計算，代表該關節的彎曲程度
 * - 180 = 完全伸直，90 = 直角彎曲，0 = 完全折疊
 */

// ── MediaPipe Pose Landmark 索引 ──
export const LANDMARK = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

/**
 * 每個姿勢的資料結構：
 * - id: 唯一識別碼
 * - name: 中文名稱（顯示在畫面上）
 * - animal: 動物名稱（顯示用）
 * - image: 圖片路徑
 * - voiceHint: 語音提示文字（未來接 TTS 用）
 * - targetAngles: 標準關節角度
 *     leftShoulder:  左肘→左肩→左髖 的夾角
 *     rightShoulder: 右肘→右肩→右髖 的夾角
 *     leftElbow:     左肩→左肘→左腕 的夾角
 *     rightElbow:    右肩→右肘→右腕 的夾角
 *     leftHip:       左肩→左髖→左膝 的夾角
 *     rightHip:      右肩→右髖→右膝 的夾角
 *     leftKnee:      左髖→左膝→左踝 的夾角
 *     rightKnee:     右髖→右膝→右踝 的夾角
 *     torsoTilt:     軀幹傾斜角度（0 = 直立，正值 = 右傾，負值 = 左傾）
 * - weights: 各角度的權重（加總 = 1.0）
 */
const POSE_DATA = [
  {
    id: "pose_hands_up",
    name: "萬歲",
    animal: "狗狗",
    image: "IMAGES/poses/pose_hands_up.png",
    voiceHint: "把手舉高高！",
    targetAngles: {
      leftShoulder: 170,
      rightShoulder: 170,
      leftElbow: 170,
      rightElbow: 170,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.20,
      rightShoulder: 0.20,
      leftElbow: 0.15,
      rightElbow: 0.15,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_airplane",
    name: "飛機",
    animal: "老鷹",
    image: "IMAGES/poses/pose_airplane.png",
    voiceHint: "像飛機一樣張開手！",
    targetAngles: {
      leftShoulder: 90,
      rightShoulder: 90,
      leftElbow: 170,
      rightElbow: 170,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.20,
      rightShoulder: 0.20,
      leftElbow: 0.15,
      rightElbow: 0.15,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_big_v",
    name: "大 V",
    animal: "兔子",
    image: "IMAGES/poses/pose_big_v.png",
    voiceHint: "雙手打開變 V！",
    targetAngles: {
      leftShoulder: 135,
      rightShoulder: 135,
      leftElbow: 170,
      rightElbow: 170,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.22,
      rightShoulder: 0.22,
      leftElbow: 0.13,
      rightElbow: 0.13,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_hands_on_hips",
    name: "叉腰",
    animal: "貓咪",
    image: "IMAGES/poses/pose_hands_on_hips.png",
    voiceHint: "手放腰上，好帥！",
    targetAngles: {
      leftShoulder: 40,
      rightShoulder: 40,
      leftElbow: 60,
      rightElbow: 60,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.20,
      rightShoulder: 0.20,
      leftElbow: 0.15,
      rightElbow: 0.15,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_zombie",
    name: "殭屍",
    animal: "熊貓",
    image: "IMAGES/poses/pose_zombie.png",
    voiceHint: "手伸直直，變殭屍！",
    targetAngles: {
      leftShoulder: 90,
      rightShoulder: 90,
      leftElbow: 170,
      rightElbow: 170,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.20,
      rightShoulder: 0.20,
      leftElbow: 0.15,
      rightElbow: 0.15,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_star",
    name: "大字型",
    animal: "獅子",
    image: "IMAGES/poses/pose_star.png",
    voiceHint: "全身張開變星星！",
    targetAngles: {
      leftShoulder: 135,
      rightShoulder: 135,
      leftElbow: 170,
      rightElbow: 170,
      leftHip: 150,
      rightHip: 150,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.15,
      rightShoulder: 0.15,
      leftElbow: 0.10,
      rightElbow: 0.10,
      leftHip: 0.15,
      rightHip: 0.15,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_weightlifter",
    name: "舉重",
    animal: "小熊",
    image: "IMAGES/poses/pose_weightlifter.png",
    voiceHint: "舉起來！好有力！",
    targetAngles: {
      leftShoulder: 135,
      rightShoulder: 135,
      leftElbow: 80,
      rightElbow: 80,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.18,
      rightShoulder: 0.18,
      leftElbow: 0.17,
      rightElbow: 0.17,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_superman",
    name: "超人",
    animal: "企鵝",
    image: "IMAGES/poses/pose_superman.png",
    voiceHint: "飛起來！超人出發！",
    targetAngles: {
      leftShoulder: 135,
      rightShoulder: 135,
      leftElbow: 170,
      rightElbow: 170,
      leftHip: 175,
      rightHip: 175,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 10,
    },
    weights: {
      leftShoulder: 0.20,
      rightShoulder: 0.20,
      leftElbow: 0.12,
      rightElbow: 0.12,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.16,
    },
  },
  {
    id: "pose_scarecrow",
    name: "稻草人",
    animal: "貓頭鷹",
    image: "IMAGES/poses/pose_scarecrow.png",
    voiceHint: "站好好，手彎彎！",
    targetAngles: {
      leftShoulder: 90,
      rightShoulder: 90,
      leftElbow: 110,
      rightElbow: 110,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.20,
      rightShoulder: 0.20,
      leftElbow: 0.15,
      rightElbow: 0.15,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_sumo",
    name: "相撲",
    animal: "大熊",
    image: "IMAGES/poses/pose_sumo.png",
    voiceHint: "蹲下來，嘿！",
    targetAngles: {
      leftShoulder: 80,
      rightShoulder: 80,
      leftElbow: 110,
      rightElbow: 110,
      leftHip: 120,
      rightHip: 120,
      leftKnee: 110,
      rightKnee: 110,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.12,
      rightShoulder: 0.12,
      leftElbow: 0.10,
      rightElbow: 0.10,
      leftHip: 0.13,
      rightHip: 0.13,
      leftKnee: 0.10,
      rightKnee: 0.10,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_gorilla",
    name: "大猩猩",
    animal: "大猩猩",
    image: "IMAGES/poses/pose_gorilla.png",
    voiceHint: "蹲低低，手垂下來！",
    targetAngles: {
      leftShoulder: 20,
      rightShoulder: 20,
      leftElbow: 150,
      rightElbow: 150,
      leftHip: 140,
      rightHip: 140,
      leftKnee: 140,
      rightKnee: 140,
      torsoTilt: 5,
    },
    weights: {
      leftShoulder: 0.15,
      rightShoulder: 0.15,
      leftElbow: 0.10,
      rightElbow: 0.10,
      leftHip: 0.12,
      rightHip: 0.12,
      leftKnee: 0.08,
      rightKnee: 0.08,
      torsoTilt: 0.10,
    },
  },
  {
    id: "pose_surrender",
    name: "投降",
    animal: "狐狸",
    image: "IMAGES/poses/pose_surrender.png",
    voiceHint: "雙手舉高，投降！",
    targetAngles: {
      leftShoulder: 135,
      rightShoulder: 135,
      leftElbow: 90,
      rightElbow: 90,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.20,
      rightShoulder: 0.20,
      leftElbow: 0.15,
      rightElbow: 0.15,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.10,
    },
  },
];

/**
 * 取得所有姿勢資料
 */
export function getAllPoses() {
  return POSE_DATA;
}

/**
 * 隨機抽取 N 個姿勢（用於每場遊戲）
 * @param {number} count - 要抽取的數量（預設 6）
 * @returns {Array} 隨機排序的姿勢陣列
 */
export function getRandomPoses(count = 6) {
  const shuffled = [...POSE_DATA].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, POSE_DATA.length));
}

/**
 * 根據 ID 取得單一姿勢
 */
export function getPoseById(id) {
  return POSE_DATA.find(p => p.id === id) || null;
}

export default { getAllPoses, getRandomPoses, getPoseById, LANDMARK };
