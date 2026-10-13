"""v7_music.py 第二輪：battle 試多種循環長度挑接縫最好的；evolve 改用開頭前奏的蓄力（第一個高潮，約 16 秒）剪。"""
import os, json, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from v7_music import V7, gemini, P_BATTLE, P_EVO_CUT, refine_hit, cut_evolve
from common import SR, decode, encode_mp3
from loopmaker import make_loop, normalize, seam_check, PAD

res = {}
for n in ("battle_a", "battle_b"):
    src = os.path.join(V7, n + ".mp3")
    for tgt, lo, hi in ((32.0, 24.0, 40.0), (48.0, 40.0, 56.0), (96.0, 80.0, 110.0)):
        try:
            full, loop, info = make_loop(src, target=tgt, lo=lo, hi=hi)
        except Exception as e:
            print(n, tgt, "失敗", e); continue
        y, mm = normalize(full, loop)
        tag = f"{n}_{int(tgt)}"
        out = os.path.join(V7, f"loop_{tag}.mp3")
        encode_mp3(y, out)
        ls, le = PAD, PAD + info["loop_len"]
        x = decode(out); seg = x[int(ls * SR):int(le * SR)]
        twice = os.path.join(V7, f"twice_{tag}.mp3"); encode_mp3(np.concatenate([seg, seg]), twice)
        g = gemini(twice, P_BATTLE)
        res[tag] = {"loopStart": ls, "loopEnd": le, "loopLength": info["loop_len"], "bpm": info["bpm"], "similarity": info["similarity"],
                    "seam": seam_check(out, ls, le), "gemini": g, "measure": mm}
        print(tag, round(info["loop_len"], 1), "s", json.dumps(g, ensure_ascii=False), flush=True)
for n, hits in (("evolve_a", (16.2, 31.5, 45.2)), ("evolve_b", (16.8,))):
    src = os.path.join(V7, n + ".mp3")
    for h in hits:
        hit = refine_hit(src, h)
        for pre in (8.0,):
            tag = f"{n}_{int(h)}"
            out = os.path.join(V7, f"cut_{tag}.mp3")
            info = cut_evolve(src, hit, out, pre=pre, post=14.0)
            g2 = gemini(out, P_EVO_CUT)
            res[tag] = {"hit_refined": round(hit, 2), "cut": info, "review": g2}
            print(tag, "hit", round(hit, 2), json.dumps(g2, ensure_ascii=False), flush=True)
json.dump(res, open(os.path.join(V7, "result2.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
