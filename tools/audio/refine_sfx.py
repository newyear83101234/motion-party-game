"""Process downloaded CC0 candidates (tools/audio/freesound/<target>/<id>.mp3) into game-ready SFX candidates.
trim silence -> pick best window if too long -> short fades -> mono 44.1k -> level (activeRms ~ -17.4 dBFS, peak <= -3.5) -> mp3 128k
usage: python refine_sfx.py <freesound_dir> <out_dir>      (out_dir/<target>/<id>.mp3; also copies current audio/sfx/<t>.mp3 -> out_dir/<target>/cur.mp3)
"""
import os, sys, glob, shutil, json
import numpy as np
from common import SR, ROOT, decode, encode_mp3, sample_peak_db, measure_array

TARGET_RMS = -17.4     # same as the rest of audio/manifest.json (activeRms_dBFS)
PEAK_CEIL = -3.5       # leave headroom for mp3 overshoot; spec = <= -3 dBFS
# target -> (max seconds, fade-out seconds, loop?)
CFG = {
    "seagull": (1.3, 0.12, False), "boat_horn": (1.8, 0.25, False), "horn": (0.75, 0.04, False), "splash": (1.0, 0.15, False),
    "bridge": (2.4, 0.25, False), "door": (0.9, 0.12, False), "coin": (0.6, 0.08, False), "ok": (0.9, 0.2, False), "ng": (0.9, 0.2, False),
    "win": (2.0, 0.3, False), "sticker": (1.0, 0.2, False), "star": (0.8, 0.15, False), "pop": (0.3, 0.03, False), "whoosh": (0.6, 0.08, False),
    "ding": (1.8, 0.25, False), "deliver_ok": (1.3, 0.25, False), "truck_start": (1.8, 0.15, False), "truck_drive": (1.5, 0.0, True),
    "truck_stop": (1.3, 0.2, False),
}


def active_rms_db(x):
    a = x[np.abs(x) > np.max(np.abs(x)) * 10 ** (-30 / 20)]
    return float(20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-12))


def hp(x, fc=40.0):
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(2, fc / (SR / 2), "high", output="sos"), x).astype(np.float32)


def trim(x, thr_db=-42):
    pk = np.max(np.abs(x))
    idx = np.where(np.abs(x) > pk * 10 ** (thr_db / 20))[0]
    return x[max(0, idx[0] - int(0.004 * SR)): idx[-1] + int(0.01 * SR)]


def best_window(x, L):
    """loudest window of L samples; start snapped to the envelope minimum in the 120 ms before it."""
    if len(x) <= L:
        return x
    hop = int(0.02 * SR)
    e = np.array([np.mean(x[i:i + hop] ** 2) for i in range(0, len(x) - hop, hop)])
    w = L // hop
    cs = np.concatenate([[0], np.cumsum(e)])
    sc = cs[w:] - cs[:-w]
    s = int(np.argmax(sc)) * hop
    lo = max(0, s - int(0.12 * SR))
    seg = np.abs(x[lo:s + hop]).reshape(-1)[: (s + hop - lo) // hop * hop].reshape(-1, hop).mean(axis=1) if s + hop - lo >= hop else None
    if seg is not None and len(seg):
        s = lo + int(np.argmin(seg)) * hop
    return x[s:s + L]


def make_loop(x, L):
    xf = int(0.15 * SR)
    s = x[:L] if len(x) >= L else np.pad(x, (0, L - len(x)))
    out = s[: len(s) - xf].copy()
    t = np.linspace(0, np.pi / 2, xf)
    out[:xf] = s[:xf] * np.sin(t) + s[len(s) - xf:] * np.cos(t)
    return out


def level(x):
    """gain to TARGET_RMS, soft-limit peaks to PEAK_CEIL, re-trim gain a few times."""
    ceil = 10 ** (PEAK_CEIL / 20)
    y = x * 10 ** ((TARGET_RMS - active_rms_db(x)) / 20)
    z = y
    for _ in range(4):
        knee = ceil * 0.55
        a = np.abs(y)
        over = a > knee
        z = y.copy()
        z[over] = np.sign(y[over]) * (knee + (ceil - knee) * np.tanh((a[over] - knee) / (ceil - knee)))
        d = TARGET_RMS - active_rms_db(z)
        if abs(d) < 0.3:
            y = z
            break
        y = y * 10 ** (d / 20) if np.max(np.abs(z)) < ceil * 0.985 else y * 10 ** (d / 40)
    return np.clip(z, -ceil, ceil).astype(np.float32)


def process(path, target):
    maxd, fo_s, is_loop = CFG[target]
    x = decode(path, 1)[:, 0]
    x = hp(x, 35 if target.startswith("truck") else 60)
    x = trim(x)
    x = best_window(x, int(maxd * SR))
    if is_loop:
        x = make_loop(x, len(x))
    else:
        fi = int(0.004 * SR); fo = min(int(fo_s * SR), len(x) // 3)
        x = x.copy()
        x[:fi] *= np.linspace(0, 1, fi)
        if fo > 0:
            x[-fo:] *= np.linspace(1, 0, fo) ** 1.5
    return level(x)


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    for tdir in sorted(glob.glob(os.path.join(src, "*"))):
        if not os.path.isdir(tdir):
            continue
        t = os.path.basename(tdir)
        if t not in CFG:
            continue
        od = os.path.join(out, t)
        os.makedirs(od, exist_ok=True)
        cur = os.path.join(ROOT, "audio", "sfx", t + ".mp3")
        if os.path.exists(cur) and not os.path.exists(os.path.join(od, "cur.mp3")):
            shutil.copy(cur, os.path.join(od, "cur.mp3"))
        for f in sorted(glob.glob(os.path.join(tdir, "*.mp3"))):
            n = os.path.basename(f)
            try:
                y = process(f, t)
                encode_mp3(y, os.path.join(od, n), kbps=128)
                print(t, n, round(len(y) / SR, 2), "s peak", round(sample_peak_db(y), 1), "rms", round(active_rms_db(y), 1))
            except Exception as e:
                print("FAIL", t, n, repr(e)[:100])
