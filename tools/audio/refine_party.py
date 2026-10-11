"""Prepare party-jingle candidates (stereo, 2-6 s, ~-18.5 LUFS, TP <= -1.5) from freesound/party/*.mp3 + the existing synth + Lyria cuts.
usage: python refine_party.py <freesound_dir> <out_dir>   -> out_dir/party/<name>.mp3 ; cur.mp3 = current audio/bgm/party.mp3"""
import os, sys, glob, shutil
import numpy as np
from common import SR, ROOT, decode, encode_mp3, measure_array

HERE = os.path.dirname(os.path.abspath(__file__))
MAXD = 6.0


def prep(path):
    x = decode(path, 2)
    pk = np.max(np.abs(x))
    idx = np.where(np.abs(x).max(axis=1) > pk * 10 ** (-45 / 20))[0]
    x = x[max(0, idx[0] - int(0.01 * SR)): idx[-1] + int(0.05 * SR)]
    if len(x) > MAXD * SR:
        x = x[: int(MAXD * SR)]
    fi, fo = int(0.005 * SR), min(int(0.35 * SR), len(x) // 3)
    x[:fi] *= np.linspace(0, 1, fi)[:, None]
    x[-fo:] *= (np.linspace(1, 0, fo) ** 1.5)[:, None]
    for _ in range(5):
        m = measure_array(x)
        g = 10 ** (-18.5 / 20 * 0 + (-18.5 - m["lufs"]) / 20)
        x = x * g
        pk = 20 * np.log10(np.max(np.abs(x)) + 1e-9)
        if pk > -3:   # soft-limit instead of clipping
            ceil, knee = 10 ** (-3.2 / 20), 10 ** (-9 / 20)
            a = np.abs(x); o = a > knee
            x[o] = np.sign(x[o]) * (knee + (ceil - knee) * np.tanh((a[o] - knee) / (ceil - knee)))
        else:
            break
    return x.astype(np.float32)


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    od = os.path.join(out, "party")
    os.makedirs(od, exist_ok=True)
    shutil.copy(os.path.join(ROOT, "audio", "bgm", "party.mp3"), os.path.join(od, "cur.mp3"))
    for p in glob.glob(os.path.join(HERE, "candidates", "party", "lyria_clip*_cut.mp3")):
        encode_mp3(prep(p), os.path.join(od, os.path.basename(p)), kbps=128)
    for p in sorted(glob.glob(os.path.join(src, "party", "*.mp3"))):
        y = prep(p)
        encode_mp3(y, os.path.join(od, os.path.basename(p)), kbps=128)
        m = measure_array(y)
        print(os.path.basename(p), round(len(y) / SR, 2), "s", m)
