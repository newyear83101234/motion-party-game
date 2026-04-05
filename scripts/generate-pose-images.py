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
