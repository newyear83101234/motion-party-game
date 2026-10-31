"""Generate 3 'draw studio' BGM candidates with Lyria (reuses gen_music.call), loop+normalize them, score with Gemini.
Outputs candidates/bgm/draw_N.mp3, candidates/loops/draw_N.mp3, candidates/draw_loops.json. Key via env, never printed."""
import os, sys, json
from concurrent.futures import ThreadPoolExecutor
import gen_music as G
from loopmaker import make_loop, normalize, seam_check
from common import encode_mp3, measure
HERE = G.HERE
THEME = ("Cheerful, gentle, creative art-studio music for kids painting, about 92 BPM. Pizzicato strings, celesta and glockenspiel sparkles, "
         "soft marimba, light ukulele, warm and playful, unobtrusive. Runs about 60 seconds or longer.")
def gen(i):
    p = os.path.join(G.OUT, f"draw_{i}.mp3")
    if os.path.exists(p) and os.path.getsize(p) > 10000: return i, "skip"
    for a in range(2):
        try:
            d = G.call(G.COMMON + THEME); open(p, "wb").write(d); return i, "ok %d" % len(d)
        except Exception as e:
            m = repr(e)[:150]
    return i, "FAIL " + m
if __name__ == "__main__":
    with ThreadPoolExecutor(3) as ex:
        for r in ex.map(gen, [1, 2, 3]): print(*r, flush=True)
    os.makedirs(os.path.join(HERE, "candidates", "loops"), exist_ok=True)
    meta = {}
    for i in (1, 2, 3):
        src = os.path.join(G.OUT, f"draw_{i}.mp3")
        if not os.path.exists(src): continue
        try:
            full, loop, info = make_loop(src)
            y, mm = normalize(full, loop)
            out = os.path.join(HERE, "candidates", "loops", f"draw_{i}.mp3")
            encode_mp3(y, out, kbps=128)
            ls, le = 0.5, 0.5 + len(loop) / 44100
            info.update(loopStart=ls, loopEnd=round(le, 6), tp=mm["tp"], lufs=mm["lufs"], seam=seam_check(out, ls, le))
            meta[f"draw_{i}"] = info; print(i, info, flush=True)
        except Exception as e:
            print(i, "loop fail", repr(e)[:200])
    json.dump(meta, open(os.path.join(HERE, "candidates", "draw_loops.json"), "w"), indent=1)
