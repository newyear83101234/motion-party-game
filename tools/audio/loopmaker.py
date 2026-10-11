"""Seamless-loop maker.
file layout = [last PAD s of loop] + loop(L) + [first PAD s of loop];  loopStart=PAD, loopEnd=PAD+L (exact samples)
The loop's tail has the audio that precedes the start point crossfaded in (XF s), so wrap-around is true audio continuity.
"""
import numpy as np
from scipy.signal import stft
from common import SR, decode, encode_mp3, measure_array, sample_peak_db, db
import subprocess

PAD = 0.5
XF = 0.15


def onset_env(mono, hop=512):
    f, tt, Z = stft(mono, SR, nperseg=1024, noverlap=1024 - hop, boundary=None)
    S = np.log1p(np.abs(Z) * 50)
    flux = np.maximum(0, np.diff(S, axis=1)).sum(axis=0)
    flux = np.concatenate([[0], flux])
    flux = flux - np.convolve(flux, np.ones(43) / 43, mode="same")
    return np.maximum(flux, 0), SR / hop


def beat_grid(mono):
    env, fps = onset_env(mono)
    n = len(env)
    ac = np.correlate(env, env, "full")[n - 1:]
    lo, hi = int(fps * 60 / 150), int(fps * 60 / 55)
    k = lo + int(np.argmax(ac[lo:hi]))
    best = (-1, None, None)
    for T in np.arange(k * 0.96, k * 1.04, k * 0.0004):
        # score beats at T frames spacing for the best phase
        idx = np.arange(0, n, T)
        for ph in np.arange(0, T, 1.0):
            pos = np.round(idx[idx + ph < n - 1] + ph).astype(int)
            s = env[pos].sum() / len(pos)
            if s > best[0]:
                best = (s, T, ph)
    _, T, ph = best
    # half/double tempo normalisation into 70..140 BPM
    Ts = T / fps
    bpm = 60 / Ts
    while bpm < 70:
        bpm *= 2
        Ts /= 2
    while bpm > 140:
        bpm /= 2
        Ts *= 2
    return Ts, ph / fps, bpm


def band_feat(x, sr=SR, n=24):
    """log band energies of a mono window -> vector"""
    w = np.hanning(len(x))
    sp = np.abs(np.fft.rfft(x * w)) ** 2
    fr = np.fft.rfftfreq(len(x), 1 / sr)
    edges = np.geomspace(60, 12000, n + 1)
    return np.log10(np.array([sp[(fr >= edges[i]) & (fr < edges[i + 1])].sum() + 1e-9 for i in range(n)]))


def cos(a, b):
    a = a - a.mean()
    b = b - b.mean()
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def make_loop(path, target=64.0, lo=40.0, hi=90.0):
    x = decode(path, 2)
    mono = x.mean(axis=1)
    Ts, phase, bpm = beat_grid(mono)
    unit = 12 * Ts  # lcm of 3 and 4 beats
    n = max(1, int(round(target / unit)))
    while n * unit > hi:
        n -= 1
    while n * unit < lo:
        n += 1
    L0 = n * unit
    total = len(mono) / SR
    Lsamp = int(round(L0 * SR))
    best = None
    s_min, s_max = 10.0, total - L0 - XF - 8.0
    t0 = phase + np.ceil((s_min - phase) / Ts) * Ts
    cands = np.arange(t0, s_max, Ts)
    W = int(1.0 * Ts * 4 * SR)  # one bar of context
    for s in cands:
        si = int(round(s * SR))
        if si - W < 0 or si + Lsamp + W > len(mono):
            continue
        # context before start vs before end, and after start vs after end-of-loop continuation
        a = band_feat(mono[si - W: si])
        b = band_feat(mono[si + Lsamp - W: si + Lsamp])
        c = band_feat(mono[si: si + W])
        d = band_feat(mono[si + Lsamp: si + Lsamp + W])
        sc = 0.6 * cos(a, b) + 0.4 * cos(c, d)
        # prefer loud, steady middle (avoid low energy intros/outros)
        if best is None or sc > best[0]:
            best = (sc, si)
    sc, si = best
    # slide the start a little (loop length unchanged => still bar-aligned) to dodge a transient right at the join
    w20 = int(0.02 * SR)
    Wx = int(0.3 * SR)
    bo, bcost = 0, 1e9
    for o in range(-int(0.3 * Ts * SR), int(0.3 * Ts * SR), int(0.01 * SR)):
        s2 = si + o
        if s2 - Wx < 0 or s2 + Lsamp + 1 > len(mono):
            continue
        e1 = np.sqrt(np.mean(mono[s2 - w20:s2] ** 2)) + 1e-9
        e2 = np.sqrt(np.mean(mono[s2:s2 + w20] ** 2)) + 1e-9
        a_, b_ = mono[s2 - Wx:s2], mono[s2 + Lsamp - Wx:s2 + Lsamp]
        xc = float(a_ @ b_ / (np.linalg.norm(a_) * np.linalg.norm(b_) + 1e-9))
        cost = abs(20 * np.log10(e1 / e2)) + 4 * (1 - max(0, xc))
        if cost < bcost:
            bcost, bo = cost, o
    si += bo
    # refine loop length by waveform correlation around the join (window 0.3 s before start vs before end)
    Wc = int(0.3 * SR)
    ref = mono[si - Wc: si]
    bestd, bestc = 0, -2
    for d in range(-int(0.04 * SR), int(0.04 * SR) + 1, 4):
        seg = mono[si + Lsamp + d - Wc: si + Lsamp + d]
        if len(seg) != Wc:
            continue
        c = float(ref @ seg / (np.linalg.norm(ref) * np.linalg.norm(seg) + 1e-9))
        if c > bestc:
            bestc, bestd = c, d
    L = Lsamp + bestd
    xf = int(XF * SR)
    loop = x[si: si + L].copy()
    pre = x[si - xf: si]  # audio just before the start
    tail = x[si + L - xf: si + L]
    fade = np.linspace(0, 1, xf)[:, None]
    loop[L - xf:] = tail * np.cos(fade * np.pi / 2) + pre * np.sin(fade * np.pi / 2)
    p = int(PAD * SR)
    full = np.concatenate([loop[L - p:], loop, loop[:p]])
    info = {"bpm": round(bpm, 1), "beat": round(Ts, 5), "loop_start_src": round(si / SR, 3), "loop_len": L / SR,
            "similarity": round(sc, 3), "xcorr": round(bestc, 3), "units": n}
    return full, loop, info


def normalize(full, loop, target_lufs=-18.0, tp_limit=-1.5):
    p = int(PAD * SR)
    m = measure_array(loop)
    g = db(target_lufs - m["lufs"])
    y = full * g
    # soft safety limiter with ffmpeg alimiter on float; iterate on decoded-mp3 true peak
    lim = 0.84
    for _ in range(6):
        out = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                              "-af", f"alimiter=limit={lim}:attack=2:release=40:level=false", "-f", "f32le", "-"],
                             input=y.astype(np.float32).tobytes(), capture_output=True, check=True).stdout
        yl = np.frombuffer(out, np.float32).reshape(-1, 2)
        mm = measure_array(yl[p:-p])
        if mm["tp"] <= tp_limit - 0.3:
            # re-correct loudness if limiter lowered it
            if abs(mm["lufs"] - target_lufs) > 0.3:
                yl = yl * db(target_lufs - mm["lufs"])
            return yl.astype(np.float32), mm
        lim *= 0.92
    return yl.astype(np.float32), mm


def seam_check(mp3_path, loop_start, loop_end):
    """decode the final mp3, play loop region twice, measure the join. -> dict"""
    x = decode(mp3_path, 2).mean(axis=1)
    a, b = int(round(loop_start * SR)), int(round(loop_end * SR))
    seg = x[a:b]
    played = np.concatenate([seg, seg])
    j = len(seg)
    w = int(0.02 * SR)
    e1 = np.sqrt(np.mean(played[j - w:j] ** 2)) + 1e-9
    e2 = np.sqrt(np.mean(played[j:j + w] ** 2)) + 1e-9
    energy_diff = abs(20 * np.log10(e1 / e2))
    d = np.abs(np.diff(played))
    local = d[j - SR // 2: j + SR // 2]
    jump = float(d[j - 1])
    ratio = jump / (np.percentile(local, 99.5) + 1e-9)
    return {"energy_diff_db": round(float(energy_diff), 2), "jump_ratio": round(float(ratio), 2)}
