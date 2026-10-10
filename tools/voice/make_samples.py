"""產生「像真人說話」語音候選樣本 → voice/samples/<候選>/<句>.mp3 ＋ voice/samples/manifest.json

用法：python tools/voice/make_samples.py [--force]
- 已存在的 mp3 跳過（可中斷續跑）；--force 全部重生。
- Gemini 金鑰只從環境變數 GEMINI_API_KEY 讀（見 gemini_rest.py），不寫檔、不印出。
- 每句記錄：生成耗時、音長、Gemini 輸出 token，用來估算整套費用與時間。
"""
import asyncio
import json
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import edge_tts

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini_rest as g  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "voice" / "samples"
VOICES = json.loads((Path(__file__).resolve().parent / "gemini_voices.json").read_text(encoding="utf-8"))
FORCE = "--force" in sys.argv

# 樣本句：id, 顯示文字, 送給 TTS 的文字, 類別
LINES = [
    ("s1_intro", "聽聲音，點對的魚！", "聽聲音，點對的魚！", "intro"),
    ("s2_praise", "好棒！", "好棒！", "praise"),
    ("s3_praise", "你好會拼喔！", "你好會拼喔！", "praise"),
    ("s4_word", "魚", "魚", "word"),
    ("s5_word", "熊", "熊", "word"),
    ("s6_word", "老虎", "老虎", "word"),
    ("s7_word", "長頸鹿", "長頸鹿", "word"),
    ("s8_guide", "你好！快來選遊戲玩吧！", "你好！快來選遊戲玩吧！", "guide"),
    ("s9_result", "拿到 3 張新貼紙！", "拿到三張新貼紙！", "result"),
    # 台灣讀音風險字（遊戲詞庫裡真的有）
    ("r1_qie", "企鵝", "企鵝", "word"),      # 台灣 ㄑㄧˋ / 大陸 qǐ
    ("r2_guaniu", "蝸牛", "蝸牛", "word"),   # 台灣 ㄍㄨㄚ / 大陸 wō
    ("r3_binggan", "餅乾", "餅乾", "word"),  # 破音字 乾 ㄍㄢ / ㄑㄧㄢˊ
    ("r4_shuijiao", "睡覺", "睡覺", "word"), # 破音字 覺 ㄐㄧㄠˋ / ㄐㄩㄝˊ
]

STYLE_EN = {  # 設計聲音（口音已在聲音本身）：style 只放當下情緒
    "intro": "warm, gentle and cheerful, speaking slowly and clearly to a five-year-old child",
    "guide": "warm, gentle and cheerful, speaking slowly and clearly to a five-year-old child",
    "praise": "genuinely delighted and proud of the child, warm and encouraging",
    "word": "clear, careful, standard pronunciation, a little slow, like teaching a young child a new word",
    "result": "happy and excited, celebrating together with a child",
}
STYLE_ZH = {  # 內建聲音：照任務要求，用自然語言指定台灣口音＋幼兒園老師語氣
    "intro": "用台灣口音、溫柔開心的幼兒園老師語氣，慢慢地對五歲小朋友說",
    "guide": "用台灣口音、溫柔開心的幼兒園老師語氣，慢慢地對五歲小朋友說",
    "praise": "用台灣口音、幼兒園老師真心開心地稱讚小朋友",
    "word": "用台灣口音，清楚、標準、稍慢地唸出這個詞，像在教小朋友認字",
    "result": "用台灣口音、開心興奮地跟小朋友宣布",
}

CANDS = [
    dict(id="edge_hsiaochen", label="A　微軟 曉臻（HsiaoChen）調慢調高", vendor="edge-tts（微軟 Edge 線上語音）", engine="edge",
         voice="zh-TW-HsiaoChenNeural", rate="-12%", pitch="+8Hz", free=True,
         desc="台灣女聲，溫柔成熟；語速 -12%、音高 +8Hz"),
    dict(id="edge_hsiaoyu", label="B　微軟 曉雨（HsiaoYu）", vendor="edge-tts（微軟 Edge 線上語音）", engine="edge",
         voice="zh-TW-HsiaoYuNeural", rate="-10%", pitch="+4Hz", free=True,
         desc="台灣女聲，比較年輕可愛；語速 -10%、音高 +4Hz（數學遊戲用過這個）"),
    dict(id="gemini_teacher", label="C　Gemini 設計聲音「台灣幼兒園老師」", vendor="Google Gemini 3.8 Flash TTS", engine="gemini",
         voice=VOICES["tw_teacher"]["id"], style=STYLE_EN, free=False,
         desc="用文字描述「台北、20 多歲、溫柔的幼兒園老師、台灣國語口音」設計出來的專屬聲音，每句再加情緒指令"),
    dict(id="gemini_sister", label="D　Gemini 設計聲音「兒童節目大姐姐」", vendor="Google Gemini 3.8 Flash TTS", engine="gemini",
         voice=VOICES["tw_sister"]["id"], style=STYLE_EN, free=False,
         desc="用文字描述「台灣兒童節目主持人、20 出頭、活潑、台灣國語口音」設計的聲音"),
    dict(id="gemini_prebuilt", label="E　Gemini 內建女聲 Achernar＋老師指令", vendor="Google Gemini 3.8 Flash TTS", engine="gemini",
         voice="achernar", style=STYLE_ZH, free=False,
         desc="Google 內建女聲（官方標註：柔和、音高偏高，英語聲音），每句用中文指令要求「台灣口音、溫柔幼兒園老師」"),
]


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def duration(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(p)],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


TRIM = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,"
        "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse")


def wav_to_mp3(wav, mp3):
    """（Gemini wav 或 edge 原始 mp3）→ 去頭尾靜音 → 響度對齊 edge-tts（約 -18 LUFS）→ 48kbps 單聲道 mp3"""
    run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-af", TRIM + ",loudnorm=I=-18:TP=-1.5:LRA=11",
         "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "48k", str(mp3)])


async def edge_one(c, text, mp3):
    t0 = time.time()
    raw = mp3.with_suffix(".raw.mp3")
    await edge_tts.Communicate(text, c["voice"], rate=c["rate"], pitch=c["pitch"]).save(str(raw))
    lat = time.time() - t0
    wav_to_mp3(raw, mp3)   # 跟 Gemini 同一套處理：edge 原檔頭尾約有 0.5–1 秒空白，去掉＋響度對齊
    raw.unlink()
    return lat


RPM_GAP = 6.5            # 這把金鑰是 Tier 1：gemini-3.8-flash-tts 每分鐘 10 次 → 每次間隔 ≥6.5 秒
_lock = threading.Lock()
_next = [0.0]


def _slot():
    with _lock:
        wait = _next[0] - time.time()
        _next[0] = max(time.time(), _next[0]) + RPM_GAP
    if wait > 0:
        time.sleep(wait)


def gemini_one(c, text, cat, mp3):
    last = None
    for attempt in range(5):
        _slot()
        t0 = time.time()
        try:
            wav, usage = g.tts(text, c["voice"], style=c["style"][cat])
            break
        except Exception as e:  # 429 照伺服器說的秒數等；503 退避重試
            last = e
            m = re.search(r"retry in (\d+)s", str(e))
            time.sleep(int(m.group(1)) + 2 if m else 5 * (attempt + 1))
    else:
        raise last
    lat = time.time() - t0
    tmp = mp3.with_suffix(".wav")
    tmp.write_bytes(wav)
    wav_to_mp3(tmp, mp3)
    tmp.unlink()
    return lat, usage.get("total_output_tokens", 0), usage.get("total_input_tokens", 0)


def main():
    manifest_p = OUT / "manifest.json"
    old = json.loads(manifest_p.read_text(encoding="utf-8")) if manifest_p.exists() else {}
    old_rows = {(r["cand"], r["line"]): r for r in old.get("rows", [])}
    rows = []
    for c in CANDS:
        d = OUT / c["id"]
        d.mkdir(parents=True, exist_ok=True)
        jobs = [(lid, text, tts, cat, d / f"{lid}.mp3") for lid, text, tts, cat in LINES]
        todo = [j for j in jobs if FORCE or not j[4].exists()]
        results = {}
        if c["engine"] == "edge":
            async def go():
                for lid, text, tts, cat, mp3 in todo:
                    results[lid] = (await edge_one(c, tts, mp3), 0, 0)
            asyncio.run(go())
        else:
            with ThreadPoolExecutor(4) as ex:
                futs = {lid: ex.submit(gemini_one, c, tts, cat, mp3) for lid, text, tts, cat, mp3 in todo}
                for lid, f in futs.items():
                    try:
                        results[lid] = f.result()
                    except Exception as e:
                        print(f"[失敗] {c['id']}/{lid}: {e}")
        for lid, text, tts, cat, mp3 in jobs:
            prev = old_rows.get((c["id"], lid), {})
            lat, otok, itok = results.get(lid, (prev.get("latency"), prev.get("out_tokens"), prev.get("in_tokens")))
            rows.append(dict(cand=c["id"], line=lid, text=text, tts_text=tts, cat=cat,
                             file=f"voice/samples/{c['id']}/{lid}.mp3", exists=mp3.exists(),
                             duration=round(duration(mp3), 3) if mp3.exists() else 0,
                             bytes=mp3.stat().st_size if mp3.exists() else 0,
                             latency=round(lat, 2) if lat else lat, out_tokens=otok, in_tokens=itok))
        print(c["id"], "完成", sum(1 for r in rows if r["cand"] == c["id"] and r["exists"]), "/", len(jobs))
    cands = [{k: v for k, v in c.items() if k != "style"} | ({"style": c["style"]} if "style" in c else {}) for c in CANDS]
    manifest_p.write_text(json.dumps(dict(cands=cands, lines=[dict(id=a, text=b, tts_text=t, cat=k) for a, b, t, k in LINES],
                                          rows=rows), ensure_ascii=False, indent=1), encoding="utf-8")
    print("寫入", manifest_p)


if __name__ == "__main__":
    main()
