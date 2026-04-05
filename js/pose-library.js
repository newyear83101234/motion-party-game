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
 * - voiceFile: 語音檔路徑
 * - hatImage: 帽子圖片路徑
 * - targetAngles: 標準關節角度
 *     leftShoulder:  左肘→左肩→左髖 的夾角
 *     rightShoulder: 右肘→右肩→右髖 的夾角
 *     leftElbow:     左肩→左肘→左腕 的夾角
 *     rightElbow:    右肩→右肘→右腕 的夾角
 *     leftHip:       左肩→左髖→左膝 的夾角
 *     rightHip:      右肩→右髖→右膝 的夾角
 *     leftKnee:      左髖→左膝→左踝 的夾角
 *     rightKnee:     右髖→右膝→右踝 的夾角
 *     torsoTilt:     軀幹傾斜角度（0 = 直立，正值 = 前傾）
 * - weights: 各角度的權重（加總 = 1.0）
 */
const POSE_DATA = [
  // 1. 萬歲 — 兔子：雙手高舉過頭，身體站直
  {
    id: "pose_hands_up",
    name: "萬歲",
    animal: "兔子",
    image: "IMAGES/poses/pose_hands_up.png",
    voiceHint: "把手舉高高，像兔子耳朵！",
    voiceFile: "MUSIC/pose_01_wansui.wav",
    hatImage: "IMAGES/poses/hats/hat_hands_up.png",
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
  // 2. 飛機 — 老鷹：雙手水平張開，像飛機翅膀
  {
    id: "pose_airplane",
    name: "飛機",
    animal: "老鷹",
    image: "IMAGES/poses/pose_airplane.png",
    voiceHint: "像老鷹一樣張開翅膀飛！",
    voiceFile: "MUSIC/pose_02_airplane.wav",
    hatImage: "IMAGES/poses/hats/hat_airplane.png",
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
  // 3. 深蹲 — 青蛙（新增）：蹲下，雙手前伸保持平衡
  {
    id: "pose_squat",
    name: "深蹲",
    animal: "青蛙",
    image: "IMAGES/poses/pose_squat.png",
    voiceHint: "蹲下來像青蛙，呱呱！",
    voiceFile: "MUSIC/pose_03_squat.wav",
    hatImage: "IMAGES/poses/hats/hat_squat.png",
    targetAngles: {
      leftShoulder: 90,
      rightShoulder: 90,
      leftElbow: 170,
      rightElbow: 170,
      leftHip: 90,
      rightHip: 90,
      leftKnee: 90,
      rightKnee: 90,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.10,
      rightShoulder: 0.10,
      leftElbow: 0.05,
      rightElbow: 0.05,
      leftHip: 0.15,
      rightHip: 0.15,
      leftKnee: 0.15,
      rightKnee: 0.15,
      torsoTilt: 0.10,
    },
  },
  // 4. 叉腰 — 貓咪：雙手插腰，挺胸站立
  {
    id: "pose_hands_on_hips",
    name: "叉腰",
    animal: "貓咪",
    image: "IMAGES/poses/pose_hands_on_hips.png",
    voiceHint: "手放腰上，像貓咪一樣帥！",
    voiceFile: "MUSIC/pose_04_handsonhips.wav",
    hatImage: "IMAGES/poses/hats/hat_hands_on_hips.png",
    targetAngles: {
      leftShoulder: 45,
      rightShoulder: 45,
      leftElbow: 50,
      rightElbow: 50,
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
  // 5. 金雞獨立 — 紅鶴（新增）：單腳站立，雙手水平
  {
    id: "pose_flamingo",
    name: "金雞獨立",
    animal: "紅鶴",
    image: "IMAGES/poses/pose_flamingo.png",
    voiceHint: "抬起一隻腳，像紅鶴站站！",
    voiceFile: "MUSIC/pose_05_flamingo.wav",
    hatImage: "IMAGES/poses/hats/hat_flamingo.png",
    targetAngles: {
      leftShoulder: 90,
      rightShoulder: 90,
      leftElbow: 170,
      rightElbow: 170,
      leftHip: 180,
      rightHip: 90,
      leftKnee: 175,
      rightKnee: 90,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.10,
      rightShoulder: 0.10,
      leftElbow: 0.05,
      rightElbow: 0.05,
      leftHip: 0.05,
      rightHip: 0.20,
      leftKnee: 0.05,
      rightKnee: 0.20,
      torsoTilt: 0.20,
    },
  },
  // 6. 大字型 — 海星：全身張開成星形
  {
    id: "pose_star",
    name: "大字型",
    animal: "海星",
    image: "IMAGES/poses/pose_star.png",
    voiceHint: "全身張開變海星！",
    voiceFile: "MUSIC/pose_06_star.wav",
    hatImage: "IMAGES/poses/hats/hat_star.png",
    targetAngles: {
      leftShoulder: 130,
      rightShoulder: 130,
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
  // 7. 鞠躬 — 企鵝（新增）：身體前彎 45 度，雙手自然下垂
  {
    id: "pose_bow",
    name: "鞠躬",
    animal: "企鵝",
    image: "IMAGES/poses/pose_bow.png",
    voiceHint: "彎腰鞠躬，像企鵝打招呼！",
    voiceFile: "MUSIC/pose_07_bow.wav",
    hatImage: "IMAGES/poses/hats/hat_bow.png",
    targetAngles: {
      leftShoulder: 20,
      rightShoulder: 20,
      leftElbow: 160,
      rightElbow: 160,
      leftHip: 135,
      rightHip: 135,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 30,
    },
    weights: {
      leftShoulder: 0.05,
      rightShoulder: 0.05,
      leftElbow: 0.05,
      rightElbow: 0.05,
      leftHip: 0.20,
      rightHip: 0.20,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.30,
    },
  },
  // 8. 超人 — 獅子：單手指天，另一手叉腰，不對稱姿勢
  {
    id: "pose_superman",
    name: "超人",
    animal: "獅子",
    image: "IMAGES/poses/pose_superman.png",
    voiceHint: "一隻手指天空，超人出發！",
    voiceFile: "MUSIC/pose_08_superman.wav",
    hatImage: "IMAGES/poses/hats/hat_superman.png",
    targetAngles: {
      leftShoulder: 170,
      rightShoulder: 45,
      leftElbow: 170,
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
      rightElbow: 0.10,
      leftHip: 0.05,
      rightHip: 0.05,
      leftKnee: 0.05,
      rightKnee: 0.05,
      torsoTilt: 0.15,
    },
  },
  // 9. 抱抱 — 熊（新增）：雙手環抱自己，身體微蹲
  {
    id: "pose_hug",
    name: "抱抱",
    animal: "熊",
    image: "IMAGES/poses/pose_hug.png",
    voiceHint: "抱抱自己，像大熊一樣暖！",
    voiceFile: "MUSIC/pose_09_hug.wav",
    hatImage: "IMAGES/poses/hats/hat_hug.png",
    targetAngles: {
      leftShoulder: 30,
      rightShoulder: 30,
      leftElbow: 30,
      rightElbow: 30,
      leftHip: 170,
      rightHip: 170,
      leftKnee: 160,
      rightKnee: 160,
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
  // 10. 殭屍 — 蝙蝠：雙手前伸，身體僵直微前傾
  {
    id: "pose_zombie",
    name: "殭屍",
    animal: "蝙蝠",
    image: "IMAGES/poses/pose_zombie.png",
    voiceHint: "手伸直直，變蝙蝠殭屍！",
    voiceFile: "MUSIC/pose_10_zombie.wav",
    hatImage: "IMAGES/poses/hats/hat_zombie.png",
    targetAngles: {
      leftShoulder: 90,
      rightShoulder: 90,
      leftElbow: 170,
      rightElbow: 170,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 175,
      rightKnee: 175,
      torsoTilt: 5,
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
  // 11. 相撲 — 大猩猩：馬步深蹲，雙手握拳前舉
  {
    id: "pose_sumo",
    name: "相撲",
    animal: "大猩猩",
    image: "IMAGES/poses/pose_sumo.png",
    voiceHint: "蹲低馬步，嘿嘿嘿！",
    voiceFile: "MUSIC/pose_11_sumo.wav",
    hatImage: "IMAGES/poses/hats/hat_sumo.png",
    targetAngles: {
      leftShoulder: 90,
      rightShoulder: 90,
      leftElbow: 110,
      rightElbow: 110,
      leftHip: 100,
      rightHip: 100,
      leftKnee: 100,
      rightKnee: 100,
      torsoTilt: 0,
    },
    weights: {
      leftShoulder: 0.10,
      rightShoulder: 0.10,
      leftElbow: 0.08,
      rightElbow: 0.08,
      leftHip: 0.14,
      rightHip: 0.14,
      leftKnee: 0.13,
      rightKnee: 0.13,
      torsoTilt: 0.10,
    },
  },
  // 12. 投降 — 小鹿：雙手舉高但手肘彎曲，腿直
  {
    id: "pose_surrender",
    name: "投降",
    animal: "小鹿",
    image: "IMAGES/poses/pose_surrender.png",
    voiceHint: "雙手舉高投降，像小鹿一樣可愛！",
    voiceFile: "MUSIC/pose_12_surrender.wav",
    hatImage: "IMAGES/poses/hats/hat_surrender.png",
    targetAngles: {
      leftShoulder: 170,
      rightShoulder: 170,
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
