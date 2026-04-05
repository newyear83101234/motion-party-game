# TASK14 — 姿勢模仿（Pose Mirror）遊戲基礎建置

> **目標：** 建立「姿勢模仿」第三款體感迷你遊戲的基礎架構，包含圖片素材生成、姿勢資料結構、遊戲核心模組
> **優先級：** P1（核心功能全部實作）
> **預估影響檔案：** 新增 `js/games/pose-mirror.js`、`js/pose-comparator.js`、`js/pose-library.js`，修改 `js/main.js`，新增 `IMAGES/poses/` 目錄

---

## 步驟 0：用 Gemini API 批量生成姿勢卡片圖片

### 0.1 安裝依賴

```bash
pip install google-genai Pillow --break-system-packages
```

### 0.2 建立圖片目錄

```bash
mkdir -p IMAGES/poses
```

### 0.3 執行圖片生成腳本

建立 `scripts/generate-pose-images.py` 並執行。此腳本會用 Gemini API 批量生成 12 張姿勢卡片 + 1 張遊戲標題圖 + 2 張成功印章。

**重要：每個姿勢使用不同的動物角色，增加多樣性和趣味性。**

```python
"""
姿勢模仿遊戲 — 圖片素材批量生成腳本
使用 Gemini API 生成 12 張動物姿勢卡片 + UI 素材
"""
import os
import io
import time
from google import genai
from google.genai import types
from PIL import Image

# ── API 設定 ──
API_KEY = "AIzaSyBQW0A0UAJ_FqK3rSq62HC8M6ImjjXs4dQ"
client = genai.Client(api_key=API_KEY)
MODEL = "gemini-2.0-flash-preview-image-generation"

# ── 輸出目錄 ──
OUTPUT_DIR = "IMAGES/poses"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── 12 個姿勢定義（每個搭配不同動物）──
POSES = [
    {
        "id": "pose_hands_up",
        "filename": "pose_hands_up.png",
        "animal": "a cute cartoon golden retriever dog",
        "pose_desc": "standing upright with both arms raised straight up high above its head, like celebrating a victory",
        "name": "萬歲"
    },
    {
        "id": "pose_airplane",
        "filename": "pose_airplane.png",
        "animal": "a cute cartoon eagle",
        "pose_desc": "standing upright with both arms stretched out horizontally to the sides like an airplane, arms perfectly level with shoulders",
        "name": "飛機"
    },
    {
        "id": "pose_big_v",
        "filename": "pose_big_v.png",
        "animal": "a cute cartoon rabbit",
        "pose_desc": "standing upright with both arms raised up and spread apart in a V shape, like a cheerleader",
        "name": "大 V"
    },
    {
        "id": "pose_hands_on_hips",
        "filename": "pose_hands_on_hips.png",
        "animal": "a cute cartoon cat",
        "pose_desc": "standing upright with both hands on its hips, elbows pointing outward, looking confident",
        "name": "叉腰"
    },
    {
        "id": "pose_zombie",
        "filename": "pose_zombie.png",
        "animal": "a cute cartoon panda",
        "pose_desc": "standing upright with both arms stretched straight forward at shoulder height, like a zombie walking",
        "name": "殭屍"
    },
    {
        "id": "pose_star",
        "filename": "pose_star.png",
        "animal": "a cute cartoon lion",
        "pose_desc": "standing with legs apart and both arms raised up and out, forming a star or X shape with the whole body",
        "name": "大字型"
    },
    {
        "id": "pose_weightlifter",
        "filename": "pose_weightlifter.png",
        "animal": "a cute cartoon bear",
        "pose_desc": "standing upright with both arms raised and bent at the elbows, fists near the head, like flexing biceps or lifting weights",
        "name": "舉重"
    },
    {
        "id": "pose_superman",
        "filename": "pose_superman.png",
        "animal": "a cute cartoon penguin",
        "pose_desc": "standing upright with both arms stretched forward and slightly upward, like Superman flying pose but standing",
        "name": "超人"
    },
    {
        "id": "pose_scarecrow",
        "filename": "pose_scarecrow.png",
        "animal": "a cute cartoon owl",
        "pose_desc": "standing upright with both arms stretched out to the sides horizontally but elbows slightly bent downward, like a scarecrow",
        "name": "稻草人"
    },
    {
        "id": "pose_sumo",
        "filename": "pose_sumo.png",
        "animal": "a cute cartoon bear (big and round)",
        "pose_desc": "in a wide squat stance with knees bent and apart, both arms bent and pushed forward with open palms, like a sumo wrestler",
        "name": "相撲"
    },
    {
        "id": "pose_gorilla",
        "filename": "pose_gorilla.png",
        "animal": "a cute cartoon gorilla",
        "pose_desc": "standing with knees slightly bent in a slight squat, both arms hanging down loosely with hands near the knees, like a gorilla",
        "name": "大猩猩"
    },
    {
        "id": "pose_surrender",
        "filename": "pose_surrender.png",
        "animal": "a cute cartoon fox",
        "pose_desc": "standing upright with both arms raised up and bent at the elbows forming a U or goal-post shape, palms facing forward, like surrendering",
        "name": "投降"
    },
]

# ── 共用 prompt 模板 ──
def build_pose_prompt(animal, pose_desc):
    return f"""Create a single illustration of {animal} character {pose_desc}.

Style requirements:
- Simple flat cartoon illustration style, kawaii/cute aesthetic
- Bold black outlines, bright cheerful colors
- Pure white background, no other elements or text
- Full body must be clearly visible from head to toe
- The character should be facing the viewer (front view)
- The pose must be very clear and easy to understand
- Suitable for toddlers age 2-6
- The character should look happy and friendly
- NO text, NO labels, NO watermarks in the image"""

# ── UI 素材 prompt ──
UI_ASSETS = [
    {
        "filename": "title_pose_mirror.png",
        "prompt": """Create a game title logo illustration for a children's body pose game called 'Pose Mirror'.
Show several cute cartoon animals (bear, rabbit, penguin, cat) doing funny poses together in a playful scene.
Style: bright colorful kawaii cartoon, white background, no text, suitable for toddlers age 2-6.
The animals should look happy and energetic."""
    },
    {
        "filename": "stamp_perfect.png",
        "prompt": """Create a golden star burst celebration stamp icon.
A big shiny golden star with smaller stars and sparkles radiating outward, with rainbow light rays.
Style: flat cartoon illustration, pure white background, bright and celebratory, no text."""
    },
    {
        "filename": "stamp_great.png",
        "prompt": """Create a silver star celebration stamp icon.
A shiny silver star with smaller stars and sparkles around it.
Style: flat cartoon illustration, pure white background, bright and cheerful, no text."""
    },
]


def generate_and_save(prompt, filepath, max_retries=3):
    """呼叫 Gemini API 生成圖片並儲存"""
    for attempt in range(max_retries):
        try:
            print(f"  生成中 (第 {attempt + 1} 次)...")
            response = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["Text", "Image"]
                ),
            )

            # 從回應中擷取圖片
            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    img = Image.open(io.BytesIO(part.inline_data.data))
                    # 統一尺寸為 512x512
                    img = img.resize((512, 512), Image.LANCZOS)
                    img.save(filepath, "PNG", quality=95)
                    file_size = os.path.getsize(filepath)
                    print(f"  ✓ 已儲存: {filepath} ({file_size:,} bytes)")
                    return True

            print(f"  ✗ 回應中沒有圖片，重試...")
        except Exception as e:
            print(f"  ✗ 錯誤: {e}")
            if attempt < max_retries - 1:
                wait = 10 * (attempt + 1)
                print(f"  等待 {wait} 秒後重試...")
                time.sleep(wait)

    print(f"  ✗✗✗ 生成失敗: {filepath}")
    return False


def main():
    print("=" * 60)
    print("姿勢模仿遊戲 — 圖片素材批量生成")
    print("=" * 60)

    success_count = 0
    fail_count = 0

    # ── 生成 12 張姿勢卡片 ──
    print(f"\n📸 開始生成 {len(POSES)} 張姿勢卡片...\n")
    for i, pose in enumerate(POSES):
        filepath = os.path.join(OUTPUT_DIR, pose["filename"])
        print(f"[{i+1}/{len(POSES)}] {pose['name']}（{pose['animal']}）")

        prompt = build_pose_prompt(pose["animal"], pose["pose_desc"])
        if generate_and_save(prompt, filepath):
            success_count += 1
        else:
            fail_count += 1

        # API 限速保護：每張之間等 3 秒
        if i < len(POSES) - 1:
            time.sleep(3)

    # ── 生成 UI 素材 ──
    print(f"\n🎨 開始生成 {len(UI_ASSETS)} 張 UI 素材...\n")
    for i, asset in enumerate(UI_ASSETS):
        filepath = os.path.join(OUTPUT_DIR, asset["filename"])
        print(f"[{i+1}/{len(UI_ASSETS)}] {asset['filename']}")

        if generate_and_save(asset["prompt"], filepath):
            success_count += 1
        else:
            fail_count += 1

        if i < len(UI_ASSETS) - 1:
            time.sleep(3)

    # ── 結果報告 ──
    print("\n" + "=" * 60)
    print(f"生成完成！成功: {success_count}，失敗: {fail_count}")
    print(f"輸出目錄: {OUTPUT_DIR}/")
    print("=" * 60)

    # 列出所有生成的檔案
    print("\n生成的檔案：")
    for f in sorted(os.listdir(OUTPUT_DIR)):
        size = os.path.getsize(os.path.join(OUTPUT_DIR, f))
        print(f"  {f} ({size:,} bytes)")


if __name__ == "__main__":
    main()
```

### 0.4 執行腳本

```bash
python scripts/generate-pose-images.py
```

**預期結果：**
`IMAGES/poses/` 目錄下應有 15 個 PNG 檔案（12 張姿勢卡 + 3 張 UI），每個 > 0 bytes。

**如果某張圖片生成失敗：**
重新執行腳本即可，已存在的檔案會被覆蓋。如果 API 回傳 429（限速），腳本會自動等待重試。

---

## 步驟 1：建立姿勢資料庫 `js/pose-library.js`

此模組定義所有 12 個姿勢的標準關節角度、圖片路徑、語音提示文字。

```javascript
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
```

---

## 步驟 2：建立姿勢比對引擎 `js/pose-comparator.js`

此模組負責計算玩家姿勢與目標姿勢的相似度。

```javascript
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
```

---

## 步驟 3：建立遊戲主模組 `js/games/pose-mirror.js`

此模組是遊戲的核心邏輯，負責遊戲流程控制、計分、畫面渲染。

```javascript
/**
 * 姿勢模仿（Pose Mirror）— 遊戲主模組
 * 玩家模仿畫面上的目標姿勢，系統偵測相似度給分
 */

import { getRandomPoses, LANDMARK } from "../pose-library.js";
import { comparePose, checkFullBodyVisible } from "../pose-comparator.js";

// ── 配色方案（延續品牌風格）──
const C = {
  brand:   "#C94FC8",
  accent:  "#F5A623",
  success: "#2ECC71",
  warning: "#F39C12",
  danger:  "#E74C3C",
  dark:    "#2D3436",
  light:   "#FDFEFE",
};

// ── 遊戲常數 ──
const ROUNDS_PER_GAME = 6;          // 每場 6 輪
const PREVIEW_DURATION = 3000;       // 展示目標姿勢 3 秒
const COUNTDOWN_DURATION = 3000;     // 倒數 3-2-1
const DETECT_DURATION = 3000;        // 偵測 3 秒取最高分
const RESULT_DURATION = 2500;        // 結果動畫 2.5 秒

// ── 分數回饋門檻 ──
const SCORE_PERFECT = 90;   // ≥ 90%：PERFECT!
const SCORE_GREAT = 70;     // ≥ 70%：GREAT!
const SCORE_GOOD = 50;      // ≥ 50%：GOOD!
                              // < 50%：好棒！繼續加油！

// ── EMA 平滑參數 ──
const SCORE_EMA_ALPHA = 0.3;

// ── 遊戲狀態 ──
const STATE = {
  CALIBRATION: "calibration",   // 全身校準
  PREVIEW: "preview",           // 展示目標姿勢
  COUNTDOWN: "countdown",       // 3-2-1 倒數
  DETECTING: "detecting",       // 偵測中（3 秒取最高分）
  RESULT: "result",             // 顯示本輪結果
  GAME_OVER: "gameOver",        // 結算畫面
};

const poseMirror = {
  name: "pose-mirror",
  displayName: "🪞 姿勢模仿",

  // ── 內部狀態 ──
  _w: 0,
  _h: 0,
  _mode: "single",
  _audio: null,
  _gameOver: false,

  // 遊戲流程
  _state: STATE.CALIBRATION,
  _stateStartTime: 0,
  _poses: [],           // 本場的姿勢清單
  _currentRound: 0,     // 目前第幾輪（0-based）
  _currentPose: null,   // 目前的目標姿勢

  // 校準
  _calibrationReady: false,
  _calibrationReadyTime: 0,   // 持續全身可見的計時
  _calibrationMessage: "",

  // 偵測
  _currentScore: 0,        // 即時分數（EMA 平滑後）
  _rawScore: 0,            // 原始分數
  _bestScore: 0,           // 本輪最高分
  _partScores: {},         // 各部位分數（用於三色回饋）

  // 結果
  _roundResults: [],       // 每輪結果 [{ pose, bestScore }]

  // 圖片快取
  _imageCache: {},
  _imagesLoaded: false,

  // 影子引導骨架
  _targetSkeletonAngles: null,

  // 特效粒子
  _particles: [],

  // ═══════════════════════════════════════
  // 遊戲介面方法
  // ═══════════════════════════════════════

  /**
   * 初始化遊戲
   */
  init(ctx, options) {
    this._w = options.canvasWidth;
    this._h = options.canvasHeight;
    this._mode = options.mode || "single";
    this._audio = options.audioManager || null;
    this._gameOver = false;

    // 重設所有狀態
    this._state = STATE.CALIBRATION;
    this._stateStartTime = performance.now();
    this._poses = getRandomPoses(ROUNDS_PER_GAME);
    this._currentRound = 0;
    this._currentPose = null;
    this._calibrationReady = false;
    this._calibrationReadyTime = 0;
    this._calibrationMessage = "請站到全身都在畫面中";
    this._currentScore = 0;
    this._rawScore = 0;
    this._bestScore = 0;
    this._partScores = {};
    this._roundResults = [];
    this._particles = [];

    // 預載所有姿勢圖片
    this._preloadImages();
  },

  /**
   * 預載圖片
   */
  _preloadImages() {
    this._imagesLoaded = false;
    let loaded = 0;
    const total = this._poses.length;

    for (const pose of this._poses) {
      if (this._imageCache[pose.id]) {
        loaded++;
        if (loaded >= total) this._imagesLoaded = true;
        continue;
      }
      const img = new Image();
      img.onload = () => {
        this._imageCache[pose.id] = img;
        loaded++;
        if (loaded >= total) this._imagesLoaded = true;
      };
      img.onerror = () => {
        console.warn(`圖片載入失敗: ${pose.image}`);
        loaded++;
        if (loaded >= total) this._imagesLoaded = true;
      };
      img.src = pose.image;
    }

    if (total === 0) this._imagesLoaded = true;
  },

  /**
   * 每幀更新遊戲邏輯
   */
  update(allLandmarks, timestamp) {
    if (this._gameOver) return;

    const landmarks = allLandmarks && allLandmarks[0] ? allLandmarks[0] : null;
    const elapsed = timestamp - this._stateStartTime;

    switch (this._state) {
      case STATE.CALIBRATION:
        this._updateCalibration(landmarks, timestamp);
        break;

      case STATE.PREVIEW:
        if (elapsed >= PREVIEW_DURATION) {
          this._changeState(STATE.COUNTDOWN, timestamp);
        }
        break;

      case STATE.COUNTDOWN:
        if (elapsed >= COUNTDOWN_DURATION) {
          this._bestScore = 0;
          this._currentScore = 0;
          this._changeState(STATE.DETECTING, timestamp);
        }
        break;

      case STATE.DETECTING:
        this._updateDetecting(landmarks, timestamp, elapsed);
        break;

      case STATE.RESULT:
        // 更新粒子特效
        this._updateParticles();
        if (elapsed >= RESULT_DURATION) {
          this._nextRound(timestamp);
        }
        break;

      case STATE.GAME_OVER:
        this._updateParticles();
        this._gameOver = true;
        break;
    }
  },

  /**
   * 更新校準狀態
   */
  _updateCalibration(landmarks, timestamp) {
    if (!landmarks) {
      this._calibrationReady = false;
      this._calibrationReadyTime = 0;
      this._calibrationMessage = "偵測不到人，請站到鏡頭前";
      return;
    }

    const check = checkFullBodyVisible(landmarks);

    if (check.allVisible) {
      if (!this._calibrationReady) {
        this._calibrationReady = true;
        this._calibrationReadyTime = timestamp;
      }
      this._calibrationMessage = "很好！保持不動...";

      // 持續 2 秒全身可見 → 進入遊戲
      if (timestamp - this._calibrationReadyTime >= 2000) {
        this._currentPose = this._poses[0];
        this._changeState(STATE.PREVIEW, timestamp);
      }
    } else {
      this._calibrationReady = false;
      this._calibrationReadyTime = 0;
      if (check.needStepBack) {
        this._calibrationMessage = "請再退後一步，讓全身都在畫面中～";
      } else {
        this._calibrationMessage = `偵測不到：${check.missingParts.join("、")}`;
      }
    }
  },

  /**
   * 更新偵測狀態
   */
  _updateDetecting(landmarks, timestamp, elapsed) {
    if (elapsed >= DETECT_DURATION) {
      // 偵測時間到，記錄結果
      this._roundResults.push({
        pose: this._currentPose,
        bestScore: this._bestScore,
      });
      this._spawnResultParticles();
      this._changeState(STATE.RESULT, timestamp);
      return;
    }

    if (!landmarks) return;

    // 計算姿勢匹配度
    const result = comparePose(landmarks, this._currentPose);
    this._rawScore = result.totalScore;
    this._partScores = result.partScores;

    // EMA 平滑顯示分數
    this._currentScore = this._currentScore * (1 - SCORE_EMA_ALPHA)
                        + this._rawScore * SCORE_EMA_ALPHA;

    // 記錄最高分
    if (this._rawScore > this._bestScore) {
      this._bestScore = this._rawScore;
    }
  },

  /**
   * 進入下一輪
   */
  _nextRound(timestamp) {
    this._currentRound++;
    if (this._currentRound >= ROUNDS_PER_GAME) {
      this._changeState(STATE.GAME_OVER, timestamp);
      this._spawnResultParticles();
    } else {
      this._currentPose = this._poses[this._currentRound];
      this._currentScore = 0;
      this._rawScore = 0;
      this._bestScore = 0;
      this._partScores = {};
      this._changeState(STATE.PREVIEW, timestamp);
    }
  },

  /**
   * 切換遊戲狀態
   */
  _changeState(newState, timestamp) {
    this._state = newState;
    this._stateStartTime = timestamp;
  },

  // ═══════════════════════════════════════
  // 渲染方法
  // ═══════════════════════════════════════

  /**
   * 渲染遊戲畫面
   */
  render(ctx) {
    const w = this._w;
    const h = this._h;

    switch (this._state) {
      case STATE.CALIBRATION:
        this._renderCalibration(ctx, w, h);
        break;

      case STATE.PREVIEW:
        this._renderPreview(ctx, w, h);
        break;

      case STATE.COUNTDOWN:
        this._renderCountdown(ctx, w, h);
        break;

      case STATE.DETECTING:
        this._renderDetecting(ctx, w, h);
        break;

      case STATE.RESULT:
        this._renderResult(ctx, w, h);
        break;

      case STATE.GAME_OVER:
        this._renderGameOver(ctx, w, h);
        break;
    }
  },

  /**
   * 渲染校準畫面
   */
  _renderCalibration(ctx, w, h) {
    // 半透明遮罩
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, w, h);

    // 人形輪廓框
    const frameW = w * 0.5;
    const frameH = h * 0.8;
    const frameX = (w - frameW) / 2;
    const frameY = (h - frameH) / 2;

    ctx.strokeStyle = this._calibrationReady ? C.success : C.light;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    // 畫一個簡化的人形輪廓
    ctx.beginPath();
    // 頭部（圓）
    const headR = frameW * 0.12;
    const headCX = frameX + frameW / 2;
    const headCY = frameY + headR + 10;
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    // 身體（矩形）
    const bodyTop = headCY + headR + 5;
    const bodyW = frameW * 0.4;
    const bodyH = frameH * 0.35;
    ctx.moveTo(headCX - bodyW / 2, bodyTop);
    ctx.lineTo(headCX + bodyW / 2, bodyTop);
    ctx.lineTo(headCX + bodyW / 2, bodyTop + bodyH);
    ctx.lineTo(headCX - bodyW / 2, bodyTop + bodyH);
    ctx.closePath();
    // 腿（兩條線）
    const legTop = bodyTop + bodyH;
    ctx.moveTo(headCX - bodyW * 0.25, legTop);
    ctx.lineTo(headCX - bodyW * 0.3, frameY + frameH - 10);
    ctx.moveTo(headCX + bodyW * 0.25, legTop);
    ctx.lineTo(headCX + bodyW * 0.3, frameY + frameH - 10);
    // 手臂（兩條線）
    ctx.moveTo(headCX - bodyW / 2, bodyTop + 10);
    ctx.lineTo(frameX + 10, bodyTop + bodyH * 0.6);
    ctx.moveTo(headCX + bodyW / 2, bodyTop + 10);
    ctx.lineTo(frameX + frameW - 10, bodyTop + bodyH * 0.6);
    ctx.stroke();
    ctx.setLineDash([]);

    // 提示訊息
    const fontSize = Math.max(18, w * 0.04);
    ctx.fillStyle = this._calibrationReady ? C.success : C.light;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(this._calibrationMessage, w / 2, frameY + frameH + fontSize + 10);

    // 如果校準中，顯示進度
    if (this._calibrationReady) {
      ctx.fillStyle = C.success;
      ctx.font = `${fontSize * 0.8}px sans-serif`;
      ctx.fillText("✓ 全身偵測成功！", w / 2, frameY - 10);
    }
  },

  /**
   * 渲染展示目標姿勢（全螢幕）
   */
  _renderPreview(ctx, w, h) {
    const pose = this._currentPose;
    const elapsed = performance.now() - this._stateStartTime;
    const progress = Math.min(1, elapsed / PREVIEW_DURATION);

    // 半透明背景
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, w, h);

    // 輪次指示
    const smallFont = Math.max(14, w * 0.03);
    ctx.fillStyle = C.light;
    ctx.font = `${smallFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`第 ${this._currentRound + 1} / ${ROUNDS_PER_GAME} 輪`, w / 2, smallFont + 10);

    // 姿勢卡片（全螢幕居中顯示）
    const img = this._imageCache[pose.id];
    if (img) {
      const imgSize = Math.min(w * 0.6, h * 0.5);
      const imgX = (w - imgSize) / 2;
      const imgY = (h - imgSize) / 2 - h * 0.05;

      // 白色圓角卡片背景
      const padding = 15;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      this._roundRect(ctx, imgX - padding, imgY - padding,
        imgSize + padding * 2, imgSize + padding * 2, 20);
      ctx.fill();

      ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
    }

    // 姿勢名稱 + 動物名稱
    const nameFont = Math.max(24, w * 0.06);
    ctx.fillStyle = C.accent;
    ctx.font = `bold ${nameFont}px sans-serif`;
    ctx.textAlign = "center";
    const textY = h * 0.82;
    ctx.fillText(`${pose.animal}的${pose.name}`, w / 2, textY);

    // 語音提示文字
    ctx.fillStyle = C.light;
    ctx.font = `${nameFont * 0.6}px sans-serif`;
    ctx.fillText(pose.voiceHint, w / 2, textY + nameFont);

    // 進度條
    const barW = w * 0.6;
    const barH = 6;
    const barX = (w - barW) / 2;
    const barY = h - 30;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = C.brand;
    ctx.fillRect(barX, barY, barW * progress, barH);
  },

  /**
   * 渲染倒數 3-2-1
   */
  _renderCountdown(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const count = 3 - Math.floor(elapsed / 1000);

    if (count > 0) {
      // 大數字
      const fontSize = Math.max(80, w * 0.2);
      const scale = 1 + 0.3 * Math.sin((elapsed % 1000) / 1000 * Math.PI);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.fillStyle = C.light;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // 描邊效果
      ctx.strokeStyle = C.brand;
      ctx.lineWidth = 4;
      ctx.strokeText(count, 0, 0);
      ctx.fillText(count, 0, 0);
      ctx.restore();
    }

    // 同時顯示縮小版的目標姿勢卡（左上角）
    this._renderPoseCard(ctx, w, h);
  },

  /**
   * 渲染偵測中畫面
   */
  _renderDetecting(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const timeLeft = Math.max(0, (DETECT_DURATION - elapsed) / 1000);

    // 左上角姿勢卡片
    this._renderPoseCard(ctx, w, h);

    // 中央大百分比數字
    const score = Math.round(this._currentScore);
    const fontSize = Math.max(48, w * 0.12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 分數顏色隨高低變化
    if (score >= SCORE_PERFECT) ctx.fillStyle = C.success;
    else if (score >= SCORE_GREAT) ctx.fillStyle = C.accent;
    else if (score >= SCORE_GOOD) ctx.fillStyle = C.warning;
    else ctx.fillStyle = C.danger;

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeText(`${score}%`, w / 2, h * 0.15);
    ctx.fillText(`${score}%`, w / 2, h * 0.15);

    // 最高分小字
    const bestFont = Math.max(14, w * 0.03);
    ctx.fillStyle = C.light;
    ctx.font = `${bestFont}px sans-serif`;
    ctx.fillText(`最高: ${Math.round(this._bestScore)}%`, w / 2, h * 0.15 + fontSize * 0.5 + 10);

    // 倒數計時（右上角）
    const timerFont = Math.max(18, w * 0.04);
    ctx.fillStyle = timeLeft <= 1 ? C.danger : C.light;
    ctx.font = `bold ${timerFont}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`⏱ ${timeLeft.toFixed(1)}`, w - 15, timerFont + 10);

    // 各部位三色回饋（畫在骨架上）
    this._renderPartFeedback(ctx, w, h);

    // 影子引導（半透明目標骨架）
    this._renderTargetSkeleton(ctx, w, h);
  },

  /**
   * 渲染左上角姿勢卡片（縮小版）
   */
  _renderPoseCard(ctx, w, h) {
    const pose = this._currentPose;
    const img = this._imageCache[pose.id];
    if (!img) return;

    const cardSize = w * 0.25;
    const margin = 10;

    // 白色圓角卡片
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    this._roundRect(ctx, margin, margin, cardSize + 16, cardSize + 16, 12);
    ctx.fill();

    // 發光邊框
    ctx.strokeStyle = C.brand;
    ctx.lineWidth = 3;
    this._roundRect(ctx, margin, margin, cardSize + 16, cardSize + 16, 12);
    ctx.stroke();

    ctx.drawImage(img, margin + 8, margin + 8, cardSize, cardSize);
  },

  /**
   * 渲染各部位的三色回饋
   * 綠色（≥80%）、黃色（50-79%）、紅色（<50%）
   */
  _renderPartFeedback(ctx, w, h) {
    // 各部位分數對應到簡化的身體區域指示
    const scores = this._partScores;
    if (!scores || Object.keys(scores).length === 0) return;

    // 用顏色圓點顯示在畫面右側
    const parts = [
      { name: "左肩", key: "leftShoulder" },
      { name: "右肩", key: "rightShoulder" },
      { name: "左肘", key: "leftElbow" },
      { name: "右肘", key: "rightElbow" },
      { name: "左髖", key: "leftHip" },
      { name: "右髖", key: "rightHip" },
      { name: "左膝", key: "leftKnee" },
      { name: "右膝", key: "rightKnee" },
      { name: "軀幹", key: "torsoTilt" },
    ];

    const startY = h * 0.3;
    const spacing = Math.max(18, h * 0.04);
    const dotR = 6;
    const fontSize = Math.max(11, w * 0.022);

    ctx.textAlign = "right";
    ctx.font = `${fontSize}px sans-serif`;

    for (let i = 0; i < parts.length; i++) {
      const score = scores[parts[i].key] || 0;
      const y = startY + i * spacing;
      const x = w - 15;

      // 顏色
      let color;
      if (score >= 80) color = C.success;
      else if (score >= 50) color = C.warning;
      else color = C.danger;

      // 圓點
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fill();

      // 文字
      ctx.fillStyle = C.light;
      ctx.fillText(parts[i].name, x - dotR - 5, y + fontSize * 0.35);
    }
  },

  /**
   * 渲染半透明目標骨架（影子引導）
   * 在玩家身上疊加一個半透明的目標骨架輪廓
   * 讓玩家可以「對齊」而不是看旁邊的小圖
   */
  _renderTargetSkeleton(ctx, w, h) {
    // TODO: 在 TASK15 中實作
    // 需要根據玩家的肩寬和位置，縮放目標骨架
    // 並以半透明白色線條繪製在玩家身上
  },

  /**
   * 渲染本輪結果
   */
  _renderResult(ctx, w, h) {
    const elapsed = performance.now() - this._stateStartTime;
    const result = this._roundResults[this._roundResults.length - 1];
    const score = Math.round(result.bestScore);

    // 半透明背景
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, w, h);

    // 評語和分數
    let text, color;
    if (score >= SCORE_PERFECT) {
      text = "PERFECT! ⭐";
      color = "#FFD700";
    } else if (score >= SCORE_GREAT) {
      text = "GREAT! ⭐";
      color = C.success;
    } else if (score >= SCORE_GOOD) {
      text = "GOOD!";
      color = C.accent;
    } else {
      text = "好棒！繼續加油！";
      color = C.brand;
    }

    // 評語（帶縮放動畫）
    const scale = Math.min(1.2, 0.5 + elapsed / 500);
    const textFont = Math.max(32, w * 0.08);
    ctx.save();
    ctx.translate(w / 2, h * 0.35);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.font = `bold ${textFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 3;
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();

    // 分數
    const scoreFont = Math.max(48, w * 0.15);
    ctx.fillStyle = C.light;
    ctx.font = `bold ${scoreFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${score}%`, w / 2, h * 0.55);

    // 姿勢名稱
    const nameFont = Math.max(16, w * 0.035);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `${nameFont}px sans-serif`;
    ctx.fillText(`${result.pose.animal}的${result.pose.name}`, w / 2, h * 0.65);

    // 粒子特效
    this._renderParticles(ctx);
  },

  /**
   * 渲染結算畫面
   */
  _renderGameOver(ctx, w, h) {
    // 背景
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, w, h);

    // 標題
    const titleFont = Math.max(28, w * 0.06);
    ctx.fillStyle = C.accent;
    ctx.font = `bold ${titleFont}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("🎉 遊戲結束！", w / 2, titleFont + 20);

    // 計算總分和評語
    const avgScore = this._roundResults.reduce((s, r) => s + r.bestScore, 0) / this._roundResults.length;
    const perfectCount = this._roundResults.filter(r => r.bestScore >= SCORE_PERFECT).length;
    const greatCount = this._roundResults.filter(r => r.bestScore >= SCORE_GREAT).length;

    // 總評語
    let verdict;
    if (perfectCount >= 4) verdict = "姿勢大師！🏆";
    else if (greatCount >= 4) verdict = "超厲害！⭐";
    else if (greatCount >= 2) verdict = "做得很好！👍";
    else verdict = "越來越厲害了！💪";

    const verdictFont = Math.max(22, w * 0.05);
    ctx.fillStyle = C.light;
    ctx.font = `bold ${verdictFont}px sans-serif`;
    ctx.fillText(verdict, w / 2, titleFont + 20 + verdictFont + 20);

    // 平均分
    const avgFont = Math.max(36, w * 0.09);
    ctx.fillStyle = C.brand;
    ctx.font = `bold ${avgFont}px sans-serif`;
    ctx.fillText(`${Math.round(avgScore)}%`, w / 2, h * 0.4);

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `${Math.max(14, w * 0.03)}px sans-serif`;
    ctx.fillText("平均分數", w / 2, h * 0.4 + avgFont * 0.4 + 10);

    // 每輪成績列表
    const listTop = h * 0.52;
    const rowH = Math.max(22, h * 0.05);
    const listFont = Math.max(13, w * 0.028);
    ctx.font = `${listFont}px sans-serif`;
    ctx.textAlign = "left";

    for (let i = 0; i < this._roundResults.length; i++) {
      const r = this._roundResults[i];
      const y = listTop + i * rowH;
      const score = Math.round(r.bestScore);

      // 分數顏色
      if (score >= SCORE_PERFECT) ctx.fillStyle = "#FFD700";
      else if (score >= SCORE_GREAT) ctx.fillStyle = C.success;
      else if (score >= SCORE_GOOD) ctx.fillStyle = C.accent;
      else ctx.fillStyle = C.light;

      ctx.fillText(
        `${i + 1}. ${r.pose.animal}的${r.pose.name}　${score}%${score >= SCORE_PERFECT ? " ⭐" : ""}`,
        w * 0.15, y
      );
    }

    // 按鈕
    this._renderButton(ctx, "再玩一次", w * 0.28, h * 0.88, w * 0.2, h * 0.07, C.brand);
    this._renderButton(ctx, "回主選單", w * 0.52, h * 0.88, w * 0.2, h * 0.07, C.dark);

    // 粒子
    this._renderParticles(ctx);
  },

  // ═══════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════

  /**
   * 畫圓角矩形
   */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  /**
   * 畫按鈕
   */
  _renderButton(ctx, text, x, y, w, h, color) {
    ctx.fillStyle = color;
    this._roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();

    ctx.fillStyle = C.light;
    ctx.font = `bold ${Math.max(12, h * 0.4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2);
  },

  /**
   * 產生慶祝粒子
   */
  _spawnResultParticles() {
    const result = this._roundResults[this._roundResults.length - 1];
    const count = result.bestScore >= SCORE_PERFECT ? 40 :
                  result.bestScore >= SCORE_GREAT ? 25 : 15;

    for (let i = 0; i < count; i++) {
      this._particles.push({
        x: this._w / 2 + (Math.random() - 0.5) * this._w * 0.5,
        y: this._h * 0.4,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        size: Math.random() * 8 + 3,
        color: ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"][
          Math.floor(Math.random() * 6)
        ],
        life: 1,
        decay: 0.01 + Math.random() * 0.02,
      });
    }
  },

  _updateParticles() {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // 重力
      p.life -= p.decay;
      if (p.life <= 0) this._particles.splice(i, 1);
    }
  },

  _renderParticles(ctx) {
    for (const p of this._particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  // ═══════════════════════════════════════
  // 互動處理
  // ═══════════════════════════════════════

  /**
   * 處理點擊事件
   */
  handleClick(x, y) {
    if (this._state === STATE.GAME_OVER) {
      const w = this._w;
      const h = this._h;
      const btnW = w * 0.2;
      const btnH = h * 0.07;
      const btnY = h * 0.88;

      // 再玩一次按鈕
      if (x >= w * 0.28 && x <= w * 0.28 + btnW && y >= btnY && y <= btnY + btnH) {
        return "replay";
      }
      // 回主選單按鈕
      if (x >= w * 0.52 && x <= w * 0.52 + btnW && y >= btnY && y <= btnY + btnH) {
        return "menu";
      }
    }
    return null;
  },

  isGameOver() {
    return this._gameOver;
  },

  getResults() {
    const avgScore = this._roundResults.reduce((s, r) => s + r.bestScore, 0) / this._roundResults.length;
    return {
      averageScore: Math.round(avgScore),
      rounds: this._roundResults,
      perfectCount: this._roundResults.filter(r => r.bestScore >= SCORE_PERFECT).length,
    };
  },

  destroy() {
    this._particles = [];
    this._imageCache = {};
  },
};

export default poseMirror;
```

---

## 步驟 4：修改 `js/main.js` — 註冊新遊戲

### 4.1 在檔案開頭新增 import

在現有的 import 區塊加入：

```javascript
import poseMirror from "./games/pose-mirror.js";
```

### 4.2 在遊戲清單中加入姿勢模仿

找到 `games` 陣列（應該有 `ice-breaker` 和 `helicopter` 的定義），加入：

```javascript
{ name: "pose-mirror", label: "🪞 姿勢模仿", color: "#9B59B6" },
```

### 4.3 在遊戲切換邏輯中加入

找到根據 `gameName` 判斷要使用哪個遊戲模組的地方（通常是 if/switch），加入：

```javascript
if (gameName === "pose-mirror") currentGame = poseMirror;
```

---

## 步驟 5：驗證

### 5.1 檔案檢查

確認以下檔案都已建立：
- [ ] `scripts/generate-pose-images.py` 存在且可執行
- [ ] `IMAGES/poses/` 目錄下有 15 個 PNG 檔案，每個 > 0 bytes
- [ ] `js/pose-library.js` 存在
- [ ] `js/pose-comparator.js` 存在
- [ ] `js/games/pose-mirror.js` 存在
- [ ] `js/main.js` 已更新（import + 遊戲清單 + 切換邏輯）

### 5.2 功能測試

1. 開啟遊戲主選單，確認「🪞 姿勢模仿」按鈕出現
2. 點擊進入，確認校準畫面顯示人形輪廓
3. 站到全身可見位置，確認框框變綠並自動開始
4. 確認目標姿勢圖片顯示正確
5. 確認倒數 3-2-1 正常
6. 擺姿勢時確認百分比數字有變化
7. 確認 6 輪後進入結算畫面
8. 確認「再玩一次」和「回主選單」按鈕可點擊

### 5.3 已知限制（後續 TASK 處理）

- **影子引導系統**（目標骨架疊在玩家身上）→ TASK15
- **雙人模式** → TASK15
- **語音提示** → 待配音檔完成後整合
- **音效整合** → TASK15

---

## 注意事項

1. **Gemini API Key**：腳本中已內建，如果遇到 429 錯誤（限速），等 30-60 秒再重新執行
2. **圖片風格不一致是正常的**：每張用不同動物，本來就要不一樣，反而增加趣味性
3. **角度數值可能需要微調**：先用目前的預設值測試，後續根據實際偵測結果調整
4. **鏡像座標**：鏡頭畫面是水平翻轉的，但 MediaPipe 回傳的座標已經是翻轉後的，所以比對引擎不需要額外處理
