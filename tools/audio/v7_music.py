"""v7（10-13）兩首 Suno 新曲：陀螺對戰 battle（無縫循環）、寵物進化 evolve（一次性約 22 秒，前段蓄力、約第 9 秒高潮）。
流程：battle_a/b → loopmaker 做循環 → Gemini 聽（循環播兩次）評分；evolve_a/b → Gemini 聽整首找「蓄力後第一個大高潮」秒數 →
在附近用起音強度校正 → 剪 [高潮-9s, 高潮+13s]、淡入淡出、響度正規化 → Gemini 再聽剪好的段落確認。結果寫 candidates/v7/result.json。
用法：python v7_music.py   （金鑰讀環境變數 GEMINI_API_KEY，不印出）"""
import os, json, base64, re, sys, urllib.request
import numpy as np
from common import SR, decode, encode_mp3, measure
from loopmaker import make_loop, normalize, seam_check, onset_env, PAD

HERE = os.path.dirname(os.path.abspath(__file__))
V7 = os.path.join(HERE, "candidates", "v7")
MODEL = os.environ.get("SCORE_MODEL", "gemini-2.5-pro")
KEY = os.environ.get("GEMINI_API_KEY")


def gemini(path, prompt):
    data = base64.b64encode(open(path, "rb").read()).decode()
    body = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "audio/mp3", "data": data}}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}}
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                                 data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": KEY})
    js = json.loads(urllib.request.urlopen(req, timeout=300).read())
    txt = js["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(re.search(r"\{.*\}", txt, re.S).group(0))


P_BATTLE = """You are an audio QA reviewer for a children's iPad game (players 5-7). This clip is a background-music LOOP played TWICE, so the loop seam is at the exact middle.
Intended use: a competitive spinning-top battle (like a kids' anime tournament): must feel intense, exciting, energetic, but not scary.
Return ONLY JSON: {"vocals": bool, "energy": 1-10, "excitement": 1-10, "seam": 1-10 (10=inaudible join at the middle), "glitches": 1-10 (10=clean), "kid_suitability": 1-10, "overall": 1-10, "notes": "one short sentence"}"""

P_EVO_FULL = """Listen to this whole instrumental track. It will be used for a 22-second "pet evolution" transformation sequence in a kids' game (like an anime monster evolving): a build-up, then a big triumphant HIT where the new form is revealed.
Find the best moment for that reveal: a strong, triumphant downbeat / climax hit that comes right after a build-up (riser, drum roll, rising arpeggio), ideally within the first 100 seconds.
Return ONLY JSON: {"vocals": bool, "quality": 1-10, "heroic": 1-10, "climax_time": seconds (float, the exact hit), "build_start": seconds, "alt_climax_times": [floats], "notes": "one short sentence"}"""

P_EVO_CUT = """This is a 22-second music cue for a kids' game "pet evolution" sequence. Intended shape: ~9 seconds of build-up (tension rising), then a big triumphant hit at about 9 seconds where the evolved pet is revealed, then a heroic celebratory section that fades out at the end.
Return ONLY JSON: {"vocals": bool, "shape_match": 1-10 (how well it builds then hits near 9s), "hit_time": seconds (when the big hit actually lands), "heroic": 1-10, "glitches": 1-10 (10=clean, no abrupt cut at start/end), "overall": 1-10, "notes": "one short sentence"}"""


def refine_hit(path, t_guess, win=1.5):
    x = decode(path)
    mono = x.mean(axis=1) if x.ndim > 1 else x
    env, fps = onset_env(mono)
    a, b = int(max(0, (t_guess - win) * fps)), int(min(len(env) - 1, (t_guess + win) * fps))
    if b <= a:
        return t_guess
    return (a + int(np.argmax(env[a:b]))) / fps


def cut_evolve(src, hit, out, pre=9.0, post=13.0):
    x = decode(src)
    s, e = int(max(0, hit - pre) * SR), int(min(len(x) / SR, hit + post) * SR)
    y = x[s:e].copy()
    fi, fo = int(0.25 * SR), int(2.5 * SR)
    y[:fi] *= np.linspace(0, 1, fi)[:, None]
    y[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    full, _ = y, None
    yy, mm = normalize(y, y, target_lufs=-16.0)
    encode_mp3(yy, out)
    return {"hit_in_cut": round(hit - max(0, hit - pre), 2), "len": round(len(y) / SR, 2), "measure": mm}


def main():
    if not KEY:
        sys.exit("沒有 GEMINI_API_KEY")
    res = {}
    for n in ("battle_a", "battle_b"):
        src = os.path.join(V7, n + ".mp3")
        full, loop, info = make_loop(src, target=64.0, lo=40.0, hi=90.0)
        y, mm = normalize(full, loop)
        out = os.path.join(V7, f"loop_{n}.mp3")
        encode_mp3(y, out)
        ls, le = PAD, PAD + info["loop_len"]
        sc = seam_check(out, ls, le)
        # 試聽檔：循環播兩次
        x = decode(out)
        seg = x[int(ls * SR):int(le * SR)]
        twice = os.path.join(V7, f"twice_{n}.mp3")
        encode_mp3(np.concatenate([seg, seg]), twice)
        g = gemini(twice, P_BATTLE)
        res[n] = {"loop": {"loopStart": ls, "loopEnd": le, "loopLength": info["loop_len"], "bpm": info["bpm"], "similarity": info["similarity"]}, "seam": sc, "gemini": g, "measure": mm}
        print(n, json.dumps(res[n]["gemini"], ensure_ascii=False), flush=True)
    for n in ("evolve_a", "evolve_b"):
        src = os.path.join(V7, n + ".mp3")
        g = gemini(src, P_EVO_FULL)
        hit = refine_hit(src, float(g["climax_time"]))
        out = os.path.join(V7, f"cut_{n}.mp3")
        info = cut_evolve(src, hit, out)
        g2 = gemini(out, P_EVO_CUT)
        res[n] = {"full": g, "hit_refined": round(hit, 2), "cut": info, "cut_review": g2}
        print(n, json.dumps({"full": g, "hit": round(hit, 2), "cut": g2}, ensure_ascii=False), flush=True)
    json.dump(res, open(os.path.join(V7, "result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
