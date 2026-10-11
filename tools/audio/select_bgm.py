"""Pick the best candidate per BGM key (Gemini listening scores + loop/seam metrics), copy to audio/bgm/<key>.mp3,
build the party jingle, write tools/audio/bgm_selected.json (used by build_manifest.py and the audition page)."""
import os, json, shutil
import numpy as np
from common import SR, ROOT, encode_mp3, measure, measure_array, db, decode

HERE = os.path.dirname(os.path.abspath(__file__))
CAND = os.path.join(HERE, "candidates")
OUT = os.path.join(ROOT, "audio", "bgm")
os.makedirs(OUT, exist_ok=True)
KEYS = ["island", "calm", "town", "rainbow", "night", "road", "dress", "bubble"]


def total(sc, lp):
    if "error" in sc:
        return -99
    s = 2 * sc["overall"] + 1.5 * sc["voice_friendly"] + 0.7 * sc["seam"] + 0.5 * sc["rhythm_stability"] + 0.5 * sc["glitches"] + 0.3 * sc["kid_suitability"]
    s += 4 * lp["similarity"] + 3 * max(0, lp["xcorr"])
    if lp["energy_diff_db"] > 3:
        s -= 3
    if sc.get("vocals"):
        s -= 30
    return round(s, 2)


def party():
    from party_pick import synth_party
    x = synth_party()
    x = x / np.max(np.abs(x)) * db(-6)
    m = measure_array(x)
    x = x * db(-18 - m["lufs"])
    for _ in range(8):
        m = measure_array(x)
        if m["tp"] <= -1.8:
            break
        x = x * db(-0.7)
        x = x * db(0)  # keep simple; LUFS re-checked below
    # trim leading silence
    idx = np.where(np.abs(x).max(axis=1) > 1e-3)[0]
    x = x[max(0, idx[0] - 100):]
    encode_mp3(x, os.path.join(OUT, "party.mp3"), kbps=160)
    return measure(os.path.join(OUT, "party.mp3"))


if __name__ == "__main__":
    loops = json.load(open(os.path.join(CAND, "loops.json")))
    scores = json.load(open(os.path.join(CAND, "scores.json"), encoding="utf-8"))
    sel = {}
    for k in KEYS:
        rows = []
        for name in sorted(n for n in loops if n.split("_")[0] == k):
            lp, sc = loops[name], scores.get(name, {"error": "no score"})
            rows.append({"name": name, "total": total(sc, lp), "loop": lp, "score": sc})
        rows.sort(key=lambda r: -r["total"])
        best = rows[0]
        dst = os.path.join(OUT, k + ".mp3")
        shutil.copy(os.path.join(CAND, "loops", best["name"] + ".mp3"), dst)
        m = measure(dst)
        lp = best["loop"]
        sel[k] = {"chosen": best["name"], "source": "Suno v6 (Pro plan)" if best["name"].split("_")[1].startswith("s") else "Gemini Lyria lyria-3.5",
                  "loopStart": lp["loopStart"], "loopEnd": lp["loopEnd"], "loopLen": lp["loop_len"], "bpm": lp["bpm"],
                  "file_duration": m["duration"], "lufs_loop": lp["lufs_loop"], "tp_file": m["tp"], "seam": {"energy_diff_db": lp["energy_diff_db"], "jump_ratio": lp["jump_ratio"]},
                  "gemini": {k2: v for k2, v in best["score"].items() if not k2.startswith("_")},
                  "ranking": [{"name": r["name"], "total": r["total"]} for r in rows]}
        print(k, best["name"], best["total"], [(r["name"], r["total"]) for r in rows])
    sel["party"] = {"chosen": "synth_fanfare", "source": "synth (numpy, tools/audio/party_pick.py)", "measure": party()}
    print("party", sel["party"]["measure"])
    json.dump(sel, open(os.path.join(HERE, "bgm_selected.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
