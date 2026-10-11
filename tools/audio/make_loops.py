"""Loop-ify every BGM candidate -> candidates/loops/<name>.mp3 + candidates/loops.json (skips existing)."""
import os, json, glob, sys
from concurrent.futures import ProcessPoolExecutor
from loopmaker import make_loop, normalize, seam_check, PAD
from common import encode_mp3, measure

HERE = os.path.dirname(os.path.abspath(__file__))
CAND = os.path.join(HERE, "candidates")
LOOPS = os.path.join(CAND, "loops")
os.makedirs(LOOPS, exist_ok=True)


def work(src):
    name = os.path.splitext(os.path.basename(src))[0]
    if name.startswith("party"):
        return name, None
    out = os.path.join(LOOPS, name + ".mp3")
    try:
        full, loop, info = make_loop(src)
        y, mm = normalize(full, loop)
        encode_mp3(y, out, kbps=160)
        info["loopStart"] = PAD
        info["loopEnd"] = PAD + info["loop_len"]
        info.update(seam_check(out, info["loopStart"], info["loopEnd"]))
        m = measure(out)
        info["file_lufs_total"] = m["lufs"]
        info["tp_loop"] = mm["tp"]
        info["lufs_loop"] = mm["lufs"]
        info["tp_file"] = m["tp"]
        return name, info
    except Exception as e:
        return name, {"error": repr(e)}


if __name__ == "__main__":
    srcs = sorted(glob.glob(os.path.join(CAND, "bgm", "*.mp3")))
    jf = os.path.join(CAND, "loops.json")
    res = json.load(open(jf)) if os.path.exists(jf) else {}
    todo = [s for s in srcs if os.path.splitext(os.path.basename(s))[0] not in res and not os.path.basename(s).startswith("party")]
    with ProcessPoolExecutor(4) as ex:
        for name, info in ex.map(work, todo):
            if info:
                res[name] = info
                print(name, info, flush=True)
    json.dump(res, open(jf, "w"), indent=1)
