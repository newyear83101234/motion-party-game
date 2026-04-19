"""
generate-math-voice.py — 用 edge-tts 生成《數字氣球》遊戲所需語音

為什麼用 edge-tts：
    - 完全不需要 API key（Microsoft Edge 瀏覽器內建 TTS 服務）
    - 台灣中文神經音色（HsiaoYu / HsiaoChen / YunJhe）品質高
    - 對 5-7 歲幼兒：HsiaoYu 較可愛、HsiaoChen 較溫柔
    - 避開 Google API key 反覆被自動禁用的問題

輸出：d:/Claude/Projects/party game/MUSIC/math_voice/*.mp3
    - num_0.mp3 ~ num_100.mp3        數字朗讀
    - op_plus.mp3                     「加」
    - op_equals.mp3                   「等於」
    - op_question.mp3                 「是多少？」
    - fb_good.mp3                     「好棒！」
    - fb_think.mp3                    「再想想～」
    - fb_retry.mp3                    「再試試看」
    - fb_answer.mp3                   「答案是」
    - tut_wave.mp3                    「揮揮手戳氣球」
    - tut_find.mp3                    「找出正確答案」
    - tut_welldone.mp3                「做得很好」
    - ask_parent.mp3                  「要不要叫爸爸媽媽幫忙？」

用法：
    cd "d:/Claude/Projects/party game"
    python scripts/generate-math-voice.py             # 補生成缺失的（斷點續跑）
    python scripts/generate-math-voice.py --test      # 只生 3 個樣本試聽
    python scripts/generate-math-voice.py --force     # 強制全部重生

斷點續跑：已存在的 .mp3 自動跳過。
"""

import asyncio
import sys
import time
from pathlib import Path

import edge_tts

# ── 專案路徑 ──
PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "MUSIC" / "math_voice"

# ── TTS 設定 ──
# HsiaoYu（小語）：女聲、可愛活潑、適合幼兒互動
# 備選：zh-TW-HsiaoChenNeural（小晨，溫柔成熟）、zh-TW-YunJheNeural（雲哲，男聲）
VOICE_NAME = "zh-TW-HsiaoYuNeural"

# 慢一點（rate=-15% 比正常慢約 15%）讓幼兒聽得清楚
RATE = "-15%"
# 略高一點的音調讓聲音更童趣
PITCH = "+5Hz"


# ── 語音清單 ──
def num_to_zh(n: int) -> str:
    """0-100 → 中文朗讀字串。"""
    NUMBER_ZH = {
        0: "零", 1: "一", 2: "二", 3: "三", 4: "四", 5: "五",
        6: "六", 7: "七", 8: "八", 9: "九", 10: "十",
    }
    if n < 0 or n > 100:
        raise ValueError(f"不支援：{n}")
    if n <= 10:
        return NUMBER_ZH[n]
    if n < 20:
        return "十" + NUMBER_ZH[n - 10]
    if n == 100:
        return "一百"
    tens, ones = n // 10, n % 10
    result = NUMBER_ZH[tens] + "十"
    if ones > 0:
        result += NUMBER_ZH[ones]
    return result


def build_voice_list() -> dict:
    items = {}
    # 1. 數字 0-100
    for n in range(0, 101):
        items[f"num_{n}"] = num_to_zh(n)
    # 2. 運算符
    items["op_plus"]      = "加"
    items["op_equals"]    = "等於"
    items["op_question"]  = "是多少？"
    # 3. 回饋語
    items["fb_good"]      = "好棒！"
    items["fb_think"]     = "再想想～"
    items["fb_retry"]     = "再試試看"
    items["fb_answer"]    = "答案是"
    # 4. 教學語
    items["tut_wave"]     = "揮揮手，戳戳看氣球"
    items["tut_find"]     = "找出正確答案喔"
    items["tut_welldone"] = "你做得很好！"
    items["ask_parent"]   = "要不要叫爸爸媽媽幫忙呢？"
    return items


# ── edge-tts 呼叫 ──
async def generate_one(text: str, output_path: Path) -> bool:
    """生成單一語音檔。成功回傳 True。"""
    try:
        communicate = edge_tts.Communicate(
            text=text,
            voice=VOICE_NAME,
            rate=RATE,
            pitch=PITCH,
        )
        await communicate.save(str(output_path))
        return True
    except Exception as e:
        print(f"    失敗：{e}")
        return False


async def main_async():
    force = "--force" in sys.argv
    test_mode = "--test" in sys.argv

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    voices = build_voice_list()
    total = len(voices)

    if test_mode:
        sample_keys = ["num_3", "op_plus", "fb_good"]
        pending = {k: voices[k] for k in sample_keys if k in voices}
        print(f"[TEST 模式] 只生成 3 個樣本供試聽")
    elif not force:
        pending = {k: v for k, v in voices.items() if not (OUTPUT_DIR / f"{k}.mp3").exists()}
    else:
        pending = voices

    if not pending:
        print(f"所有 {total} 個語音檔都已存在。用 --force 強制重生。")
        return

    print(f"準備生成 {len(pending)}/{total} 個語音檔到 {OUTPUT_DIR}")
    print(f"聲線：{VOICE_NAME}（HsiaoYu 小語，女聲、活潑）")
    print(f"語速：{RATE}（慢一點讓幼兒聽得清楚）  音調：{PITCH}（略高童趣）")
    print("─" * 60)

    success = 0
    failed = []
    start = time.time()

    for i, (key, text) in enumerate(pending.items(), 1):
        output_path = OUTPUT_DIR / f"{key}.mp3"
        print(f"[{i}/{len(pending)}] {key}: 「{text}」...", end=" ", flush=True)

        if await generate_one(text, output_path):
            size_kb = output_path.stat().st_size / 1024
            print(f"OK ({size_kb:.1f} KB)")
            success += 1
        else:
            failed.append(key)

        # 輕微 rate limit（避免 Edge 服務限流）
        await asyncio.sleep(0.2)

    elapsed = time.time() - start
    print("─" * 60)
    print(f"完成：{success}/{len(pending)} 成功，耗時 {elapsed:.1f} 秒")
    if failed:
        print(f"失敗 {len(failed)} 個：{', '.join(failed[:10])}{'...' if len(failed) > 10 else ''}")
        print("重跑一次會繼續處理失敗的（斷點續跑）")


if __name__ == "__main__":
    asyncio.run(main_async())
