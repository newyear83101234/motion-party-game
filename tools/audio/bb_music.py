"""方塊爆破（blocks.html）背景音樂：Suno 每個用途生 2 首（candidates/bb/<用途>_a.mp3、_b.mp3）
→ loopmaker 剪成無縫循環、響度正規化 → Gemini 聽（循環播兩次，接縫在正中間）評分 → 每個用途挑分數高的
→ 輸出 audio/bb/<用途>.mp3，循環點印出來貼進 js/blocks.js 的 BGM 表。結果也寫 candidates/bb/result.json。
用法：python bb_music.py   （金鑰讀環境變數 GEMINI_API_KEY，不印出）"""
import os, json, base64, re, sys, shutil, urllib.request
import numpy as np
from common import SR, decode, encode_mp3
from loopmaker import make_loop, normalize, seam_check, PAD

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "candidates", "bb")
OUT = os.path.join(HERE, "..", "..", "audio", "bb")
MODEL = os.environ.get("SCORE_MODEL", "gemini-2.5-pro")
KEY = os.environ.get("GEMINI_API_KEY")

USE = {
    "menu": "the MAIN MENU of a polished casual mobile block-puzzle game (like Block Blast): should be catchy, bright, inviting, make you want to start playing",
    "classic": "the endless CLASSIC gameplay of a casual block-puzzle game (like Block Blast): players think for many minutes, so it must be relaxing, steady, pleasant, NOT distracting or repetitive-annoying, no sudden loud parts",
    "adventure": "the ADVENTURE level mode of a casual block-puzzle game with a tropical jungle theme: cheerful, light exploring mood, still calm enough to think while playing",
}
PROMPT = """You are an audio QA reviewer for a mobile game. This clip is a background-music LOOP played TWICE, so the loop seam is at the exact middle.
Intended use: {use}.
Return ONLY JSON: {{"vocals": bool, "fit": 1-10 (how well it fits the intended use), "pleasant_long_listen": 1-10, "seam": 1-10 (10=inaudible join at the middle), "glitches": 1-10 (10=clean), "production_quality": 1-10, "overall": 1-10, "notes": "one short sentence"}}"""


def gemini(path, prompt):
    data = base64.b64encode(open(path, "rb").read()).decode()
    body = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "audio/mp3", "data": data}}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}}
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                                 data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": KEY})
    js = json.loads(urllib.request.urlopen(req, timeout=300).read())
    txt = js["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(re.search(r"\{.*\}", txt, re.S).group(0))


def main():
    if not KEY:
        sys.exit("沒有 GEMINI_API_KEY")
    os.makedirs(OUT, exist_ok=True)
    res, pick = {}, {}
    for use, desc in USE.items():
        best = None
        for v in ("a", "b"):
            n = f"{use}_{v}"
            src = os.path.join(SRC, n + ".mp3")
            if not os.path.exists(src):
                print("缺檔", src); continue
            full, loop, info = make_loop(src, target=60.0, lo=36.0, hi=80.0)
            y, mm = normalize(full, loop, target_lufs=-18.0)
            out = os.path.join(SRC, f"loop_{n}.mp3")
            encode_mp3(y, out)
            ls, le = PAD, PAD + info["loop_len"]
            sc = seam_check(out, ls, le)
            x = decode(out)
            seg = x[int(ls * SR):int(le * SR)]
            twice = os.path.join(SRC, f"twice_{n}.mp3")
            encode_mp3(np.concatenate([seg, seg]), twice)
            g = gemini(twice, PROMPT.format(use=desc))
            score = (g.get("overall", 0) * 2 + g.get("fit", 0) + g.get("seam", 0) + g.get("pleasant_long_listen", 0)
                     - (10 if g.get("vocals") else 0))
            res[n] = {"loop": {"ls": round(ls, 4), "le": round(le, 4), "len": round(info["loop_len"], 3), "bpm": info["bpm"], "similarity": info["similarity"]},
                      "seam": sc, "gemini": g, "score": score, "measure": mm}
            print(n, round(score, 1), json.dumps(g, ensure_ascii=False), flush=True)
            if not best or score > best[1]:
                best = (n, score)
        if best:
            n = best[0]
            shutil.copyfile(os.path.join(SRC, f"loop_{n}.mp3"), os.path.join(OUT, use + ".mp3"))
            pick[use] = {"from": n, **res[n]["loop"]}
    json.dump({"candidates": res, "pick": pick}, open(os.path.join(SRC, "result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    print("PICK", json.dumps(pick, ensure_ascii=False))


if __name__ == "__main__":
    main()
