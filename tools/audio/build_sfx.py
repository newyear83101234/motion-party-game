"""Build audio/sfx/*.mp3 from Kenney CC0 packs (tools/audio/kenney/) + numpy synthesis.
Run: python build_sfx.py   -> audio/sfx/<name>.mp3 and tools/audio/sfx_sources.json
"""
import os, sys, json
import numpy as np
from scipy.signal import lfilter, butter, sosfilt
from common import SR, ROOT, decode, encode_mp3, sample_peak_db, db

HERE = os.path.dirname(os.path.abspath(__file__))
K = os.path.join(HERE, "kenney")
OUT = os.path.join(ROOT, "audio", "sfx")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

PACK_URL = {
    "interface-sounds": "https://kenney.nl/assets/interface-sounds",
    "impact-sounds": "https://kenney.nl/assets/impact-sounds",
    "ui-audio": "https://kenney.nl/assets/ui-audio",
    "digital-audio": "https://kenney.nl/assets/digital-audio",
    "rpg-audio": "https://kenney.nl/assets/rpg-audio",
    "music-jingles": "https://kenney.nl/assets/music-jingles",
}


def kfile(pack, name):
    for r, _, fs in os.walk(os.path.join(K, pack)):
        if name in fs:
            return os.path.join(r, name)
    raise FileNotFoundError(pack + "/" + name)


def kl(pack, name, gain=1.0, rate=1.0):
    x = decode(kfile(pack, name), 1)[:, 0] * gain
    if rate != 1.0:  # resample by linear interp (changes pitch & speed)
        idx = np.arange(0, len(x) - 1, rate)
        x = np.interp(idx, np.arange(len(x)), x)
    return x.astype(np.float32)


def t(dur):
    return np.arange(int(dur * SR)) / SR


def silence(d):
    return np.zeros(int(d * SR), np.float32)


def mix(*parts):
    """parts: (offset_sec, array, gain)"""
    n = max(int(o * SR) + len(a) for o, a, g in parts)
    y = np.zeros(n, np.float32)
    for o, a, g in parts:
        i = int(o * SR)
        y[i:i + len(a)] += a * g
    return y


def bell(f, dur=0.6, decay=7.0, bright=0.35):
    tt = t(dur)
    env = np.exp(-decay * tt) * np.minimum(1, tt / 0.003)
    y = np.sin(2 * np.pi * f * tt) + bright * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-12 * tt) \
        + 0.15 * np.sin(2 * np.pi * f * 4.1 * tt) * np.exp(-20 * tt)
    return (y * env).astype(np.float32)


def marimba(f, dur=0.5, decay=9.0):
    tt = t(dur)
    env = np.exp(-decay * tt) * np.minimum(1, tt / 0.002)
    y = np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 4 * tt) * np.exp(-30 * tt)
    return (y * env).astype(np.float32)


def noise(dur):
    return rng.standard_normal(int(dur * SR)).astype(np.float32)


def bp(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x).astype(np.float32)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, btype="low", fs=SR, output="sos"), x).astype(np.float32)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, btype="high", fs=SR, output="sos"), x).astype(np.float32)


def swept_noise(dur, f0, f1, q=0.25):
    """band-passed noise whose center sweeps f0->f1 (block-wise)."""
    n = int(dur * SR)
    x = noise(dur)
    y = np.zeros(n, np.float32)
    B = 512
    for i in range(0, n, B):
        fc = f0 * (f1 / f0) ** (i / n)
        lo, hi = max(40, fc * (1 - q)), min(SR / 2 - 100, fc * (1 + q))
        sos = butter(2, [lo, hi], btype="band", fs=SR, output="sos")
        y[i:i + B] = sosfilt(sos, x[i:i + B])
    return y


def env_ad(n, a=0.01, r=0.1):
    e = np.ones(n, np.float32)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] = np.minimum(e[-nr:], np.linspace(1, 0, nr))
    return e


def glide_sine(f0, f1, dur, decay=None):
    tt = t(dur)
    f = f0 * (f1 / f0) ** (tt / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph)
    if decay:
        y *= np.exp(-decay * tt)
    return y.astype(np.float32)


# ---------- finishing ----------
def finish(x, peak_db=-4.3, rms_db=-17.0, tail_fade=0.03, keep_tail=0.02, trim=True, sat=True):
    x = np.asarray(x, np.float32)
    x = x - np.mean(x[: min(len(x), 64)]) * 0  # no-op (keep DC untouched)
    pk = np.max(np.abs(x)) + 1e-9
    if trim:
        thr = pk * db(-48)
        idx = np.where(np.abs(x) > thr)[0]
        a = max(0, idx[0] - int(0.004 * SR))
        b = min(len(x), idx[-1] + int(keep_tail * SR))
        x = x[a:b]
    n = len(x)
    fi = min(int(0.004 * SR), n // 4)
    x[:fi] *= np.linspace(0, 1, fi)
    fo = min(int(tail_fade * SR), n // 2)
    x[-fo:] *= np.linspace(1, 0, fo) ** 1.5
    pk = np.max(np.abs(x)) + 1e-9
    act = x[np.abs(x) > pk * db(-30)]
    rms = np.sqrt(np.mean(act ** 2)) if len(act) else pk
    g = min(db(peak_db) / pk, db(rms_db) / rms)
    y = x * g
    # peaky material (Kenney foley) hits the peak cap before reaching the RMS target: soft-saturate to even out loudness
    pt = db(peak_db)
    def act_rms(v):
        a = v[np.abs(v) > np.max(np.abs(v)) * db(-30)]
        return np.sqrt(np.mean(a ** 2))
    if sat and act_rms(y) < db(rms_db) * 0.9:
        d = 1.0
        while d < 4.5:
            d += 0.25
            z = np.tanh(d * y / pt) / np.tanh(d) * pt
            if act_rms(z) >= db(rms_db):
                break
        y = z
    return y.astype(np.float32)


# ---------- recipes ----------
def r_ok():
    return mix((0, marimba(784, 0.5), 1), (0.11, marimba(1175, 0.7, 7), 1), (0.11, bell(2349, 0.4, 10, 0.1), 0.25))


def r_ng():  # gentle, falling, soft - not a buzzer
    return mix((0, marimba(330, 0.45, 8), 1), (0.16, marimba(262, 0.6, 7), 0.9))


def r_win():
    notes = [523, 659, 784, 1047, 1319]
    parts = [(0.1 * i, bell(f, 0.9, 5, 0.3), 0.8) for i, f in enumerate(notes)]
    parts += [(0.5, bell(1568, 1.4, 3.5, 0.2), 0.6), (0.5, bell(1047, 1.4, 3.5, 0.2), 0.5), (0.5, bell(784, 1.4, 3.5, 0.2), 0.5)]
    return mix(*parts)


def r_sticker():
    f = [1568, 2093, 1760, 2637, 2349, 3136, 2794]
    parts = [(0.045 * i, bell(x, 0.5, 9, 0.15), 0.8) for i, x in enumerate(f)]
    parts.append((0.0, hp(noise(0.3), 5000) * np.exp(-10 * t(0.3)) * 0.08, 1))
    return mix(*parts)


def r_star():
    return mix((0, bell(1568, 0.7, 6, 0.2), 1), (0.06, bell(2349, 0.6, 7, 0.2), 0.8), (0.0, glide_sine(900, 1500, 0.06) * 0.2, 1))


def r_coin():
    tt = t(0.5)
    a = np.sign(np.sin(2 * np.pi * 1976 * t(0.07))) * 0.35 * env_ad(int(0.07 * SR), 0.003, 0.02)
    b = np.sign(np.sin(2 * np.pi * 2637 * tt)) * 0.35 * np.exp(-9 * tt)
    return lp(mix((0, a, 1), (0.07, b.astype(np.float32), 1)), 6000)


def r_pop():
    d = glide_sine(500, 1400, 0.05, 40) + 0.2 * glide_sine(1000, 2800, 0.03, 60)[: int(0.03 * SR)].mean() * 0
    c = hp(noise(0.02), 2000) * np.exp(-200 * t(0.02)) * 0.3
    return mix((0, d.astype(np.float32), 1), (0, c.astype(np.float32), 1))


def r_whoosh():
    d = 0.55
    x = swept_noise(d, 400, 3500, 0.5)
    e = np.sin(np.pi * np.clip(t(d) / d, 0, 1)) ** 2
    return lp(x * e, 5000)


def r_truck_start():  # cranking then catching
    d = 1.7
    tt = t(d)
    rate = np.where(tt < 0.9, 5 + 4 * tt, 9 + (tt - 0.9) * 28)  # pulses/s
    rate = np.minimum(rate, 22)
    ph = np.cumsum(rate) / SR
    saw = 2 * (ph % 1) - 1
    pulse = np.maximum(0, np.sin(2 * np.pi * ph)) ** 2
    eng = lp(saw * (0.4 + 0.6 * pulse), 420, 2) + 0.4 * lp(noise(d), 200)
    amp = np.where(tt < 0.9, 0.55, 0.55 + 0.45 * np.minimum(1, (tt - 0.9) / 0.5))
    y = eng * amp * np.minimum(1, tt / 0.05)
    return (y * np.minimum(1, (d - tt) / 0.15)).astype(np.float32)


def r_truck_drive():  # periodic: integer cycles so it loops
    d = 1.6
    tt = t(d)
    f0 = 30.0  # 48 cycles in 1.6 s -> periodic
    ph = f0 * tt
    saw = 2 * (ph % 1) - 1
    pulse = 0.5 + 0.5 * np.sin(2 * np.pi * ph)
    wob = 1 + 0.12 * np.sin(2 * np.pi * 2 * tt / d * 3)
    eng = lp(saw * (0.35 + 0.65 * pulse ** 2) * wob, 800, 2)
    nz = noise(d)
    rum = lp(nz, 250)
    # make noise periodic by crossfading its tail into head
    n = len(rum)
    L = int(0.1 * SR)
    rum[:L] = rum[:L] * np.linspace(0, 1, L) + rum[n - L:] * np.linspace(1, 0, L)
    rum = rum[: n - L]
    eng = eng[: n - L]
    return (eng + 0.5 * rum[: len(eng)]).astype(np.float32)


def r_truck_stop():
    d = 1.1
    tt = t(d)
    rate = np.maximum(4, 22 - 20 * tt)
    ph = np.cumsum(rate) / SR
    saw = 2 * (ph % 1) - 1
    eng = lp((saw * (0.4 + 0.6 * np.maximum(0, np.sin(2 * np.pi * ph)) ** 2)).astype(np.float32), 650) * np.exp(-1.4 * tt)
    tb = t(0.6)
    brake = lp(hp(noise(0.6), 1800), 7000) * (np.minimum(1, tb / 0.04) * np.exp(-5 * tb)) * 0.5
    return mix((0, eng.astype(np.float32), 1.5), (0.12, brake.astype(np.float32), 0.12))


def r_horn():
    def honk(f, d):
        tt = t(d)
        y = np.sign(np.sin(2 * np.pi * f * tt)) * 0.5 + np.sign(np.sin(2 * np.pi * f * 1.26 * tt)) * 0.5
        y = lp(y.astype(np.float32), 1800, 2) * env_ad(len(tt), 0.01, 0.04)
        return y
    return mix((0, honk(420, 0.16), 1), (0.22, honk(420, 0.22), 1))


def r_boat_horn():
    d = 1.5
    tt = t(d)
    y = np.sign(np.sin(2 * np.pi * 110 * tt)) + 0.8 * np.sign(np.sin(2 * np.pi * 165 * tt * 1.003))
    y = lp(y.astype(np.float32), 600, 2)
    e = np.minimum(1, tt / 0.12) * np.minimum(1, (d - tt) / 0.35)
    return (y * e).astype(np.float32)


def r_splash():
    d = 0.8
    tt = t(d)
    x = swept_noise(d, 3000, 900, 0.9) * np.exp(-6 * tt) * np.minimum(1, tt / 0.012)
    bub = [(0.06 + 0.07 * i, glide_sine(400 + 120 * i, 900 + 200 * i, 0.07, 30), 0.3) for i in range(4)]
    return mix((0, hp(x.astype(np.float32), 700), 1), *bub)


def seagull_call(f0, dur, vib=22):
    tt = t(dur)
    f = f0 * (1 + 0.55 * np.sin(np.pi * np.clip(tt / dur, 0, 1)) - 0.25 * tt / dur) + 40 * np.sin(2 * np.pi * vib * tt)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.3 * np.sin(3 * ph)
    y = y * (0.8 + 0.2 * np.sin(2 * np.pi * 70 * tt))
    return (y * env_ad(len(tt), 0.03, 0.08)).astype(np.float32)


def r_seagull():
    c = [seagull_call(1500, 0.32), seagull_call(1650, 0.26), seagull_call(1400, 0.4, 18)]
    return lp(mix((0, c[0], 1), (0.42, c[1], 0.9), (0.8, c[2], 0.85)), 6000)


def r_gacha_crank():
    parts = []
    tms = 0.0
    gap = 0.16
    for i in range(9):
        parts.append((tms, kl("rpg-audio", "metalClick.ogg", rate=0.85 + 0.03 * (i % 3)), 0.9))
        tms += gap
        gap = max(0.07, gap * 0.9)
    parts.append((tms + 0.05, kl("impact-sounds", "impactWood_medium_001.ogg"), 1.0))
    return mix(*parts)


def r_capsule_open():
    a = kl("impact-sounds", "impactPlate_light_001.ogg")[: int(0.15 * SR)]
    return mix((0, a, 0.8), (0.0, r_pop(), 0.9), (0.1, r_sticker()[: int(0.5 * SR)], 0.7))


def r_hatch():
    crack = [(0.0, kl("impact-sounds", "impactGlass_light_001.ogg")[: int(0.25 * SR)], 0.7),
             (0.35, kl("impact-sounds", "impactGlass_light_003.ogg")[: int(0.25 * SR)], 0.8)]
    def peep(f, d=0.12):
        return (glide_sine(f, f * 1.5, d) * env_ad(int(d * SR), 0.01, 0.05)).astype(np.float32)
    ch = [(0.75, peep(1800), 0.5), (0.92, peep(2000), 0.5), (1.3, r_sticker()[: int(0.5 * SR)], 0.6)]
    return mix(*crack, *ch)


def r_unlock():
    return mix((0, kl("rpg-audio", "metalLatch.ogg"), 0.9),
               (0.2, bell(784, 0.7, 6), 0.8), (0.3, bell(988, 0.7, 6), 0.8), (0.4, bell(1319, 0.9, 5), 0.9))


def r_deliver_ok():
    return mix((0, marimba(659, 0.5), 1), (0.1, marimba(880, 0.5), 1), (0.2, marimba(1319, 0.9, 6), 1.1),
               (0.2, bell(2637, 0.5, 8, 0.1), 0.3), (0.45, r_coin()[: int(0.4 * SR)], 0.5))


def r_ding():
    return mix((0, bell(1319, 1.0, 4.5, 0.25), 1), (0.45, bell(988, 1.3, 3.5, 0.25), 1))


def r_bridge():
    d = 1.9
    tt = t(d)
    f = 95 + 45 * (tt / d) + 6 * np.sin(2 * np.pi * 5 * tt)
    ph = 2 * np.pi * np.cumsum(f) / SR
    g = lp((np.sin(ph) + 0.6 * np.sin(2 * ph) + 0.4 * np.sin(3 * ph) + 0.25 * np.sin(5 * ph)).astype(np.float32), 700)
    g = g * np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 0.7 * (0.8 + 0.2 * np.sin(2 * np.pi * 11 * tt))
    rr = np.random.default_rng(3)
    parts = [(0.0, g.astype(np.float32), 1.4)]
    for i in range(14):  # chain-link clinks
        fc = float(rr.choice([2100, 2600, 3100, 2350]))
        parts.append((0.05 + 0.125 * i + float(rr.uniform(0, 0.03)), (bp(noise(0.05), fc, fc * 1.6) * np.exp(-70 * t(0.05))).astype(np.float32), 0.6))
    parts.append((1.95, kl("impact-sounds", "impactWood_heavy_002.ogg"), 1.0))
    parts.append((1.95, kl("impact-sounds", "impactPlank_medium_001.ogg"), 0.5))
    return mix(*parts)


def r_wear():
    c = kl("rpg-audio", "cloth2.ogg")[: int(0.4 * SR)]
    return mix((0, c, 1.0), (0.18, bell(1568, 0.5, 8, 0.15), 0.6), (0.26, bell(2093, 0.6, 8, 0.15), 0.6))


def r_load():
    return mix((0, kl("rpg-audio", "dropLeather.ogg"), 0.8), (0.04, kl("impact-sounds", "impactWood_heavy_001.ogg"), 1.0))


def r_unload():
    return mix((0, kl("rpg-audio", "handleSmallLeather.ogg"), 0.8), (0.18, kl("impact-sounds", "impactWood_medium_003.ogg"), 1.0))


def r_flip():
    return kl("rpg-audio", "bookFlip2.ogg")


def r_select():
    return mix((0, kl("interface-sounds", "select_002.ogg"), 1), (0.0, marimba(988, 0.2, 14), 0.3))


def r_tap():
    return mix((0, kl("interface-sounds", "click_003.ogg"), 1), (0, marimba(1568, 0.09, 30), 0.35))


def r_door():
    x = lp(kl("rpg-audio", "doorClose_3.ogg"), 3000)
    n = int(0.012 * SR)
    x[:n] *= np.linspace(0, 1, n)
    return x


def r_lever():
    return mix((0, kl("impact-sounds", "impactMetal_heavy_002.ogg"), 0.8), (0.0, kl("rpg-audio", "metalLatch.ogg"), 0.8),
               (0.1, kl("impact-sounds", "impactWood_light_001.ogg"), 0.6))


# name -> (fn, sources-description, tail_fade)
RECIPES = {
    "tap": (r_tap, "Kenney Interface Sounds click_003", ["interface-sounds"]),
    "select": (r_select, "Kenney Interface Sounds select_002 + synth marimba", ["interface-sounds"]),
    "ok": (r_ok, "synth (numpy marimba/bell)", []),
    "ng": (r_ng, "synth (numpy soft marimba, falling)", []),
    "win": (r_win, "synth (numpy bell arpeggio)", []),
    "sticker": (r_sticker, "synth (numpy bell sparkle)", []),
    "pop": (r_pop, "synth (numpy pitch glide)", []),
    "flip": (r_flip, "Kenney RPG Audio bookFlip2", ["rpg-audio"]),
    "star": (r_star, "synth (numpy bell)", []),
    "coin": (r_coin, "synth (numpy square blips)", []),
    "whoosh": (r_whoosh, "synth (numpy swept noise)", []),
    "gacha_crank": (r_gacha_crank, "Kenney RPG Audio metalClick x9 + Impact Sounds impactWood_medium_001", ["rpg-audio", "impact-sounds"]),
    "capsule_open": (r_capsule_open, "Kenney Impact Sounds impactPlate_light_001 + synth pop/sparkle", ["impact-sounds"]),
    "hatch": (r_hatch, "Kenney Impact Sounds impactGlass_light_001/003 + synth peeps", ["impact-sounds"]),
    "unlock": (r_unlock, "Kenney RPG Audio metalLatch + synth bells", ["rpg-audio"]),
    "truck_start": (r_truck_start, "synth (numpy engine)", []),
    "truck_drive": (r_truck_drive, "synth (numpy engine, periodic loop)", []),
    "truck_stop": (r_truck_stop, "synth (numpy engine + air brake)", []),
    "horn": (r_horn, "synth (numpy two-tone honk)", []),
    "load": (r_load, "Kenney RPG Audio dropLeather + Impact Sounds impactWood_heavy_001", ["rpg-audio", "impact-sounds"]),
    "unload": (r_unload, "Kenney RPG Audio handleSmallLeather + Impact Sounds impactWood_medium_003", ["rpg-audio", "impact-sounds"]),
    "deliver_ok": (r_deliver_ok, "synth (numpy marimba/coin)", []),
    "door": (r_door, "Kenney RPG Audio doorClose_3 (lowpassed)", ["rpg-audio"]),
    "lever": (r_lever, "Kenney RPG Audio metalLatch + Impact Sounds impactMetal_heavy_002/impactWood_light_001", ["rpg-audio", "impact-sounds"]),
    "bridge": (r_bridge, "synth wood groan + chain clinks (numpy) + Kenney Impact Sounds impactWood_heavy_002/impactPlank_medium_001", ["impact-sounds"]),
    "ding": (r_ding, "synth (numpy doorbell bells)", []),
    "splash": (r_splash, "synth (numpy filtered noise + bubbles)", []),
    "seagull": (r_seagull, "synth (numpy FM calls)", []),
    "boat_horn": (r_boat_horn, "synth (numpy low horn)", []),
    "wear": (r_wear, "Kenney RPG Audio cloth2 + synth bells", ["rpg-audio"]),
}
NO_TRIM = {"truck_drive"}

if __name__ == "__main__":
    info = {}
    only = sys.argv[1:]
    for name, (fn, src, packs) in RECIPES.items():
        if only and name not in only:
            continue
        x = fn()
        loop = name == "truck_drive"
        y = finish(x, trim=not loop, tail_fade=0.0005 if loop else 0.03, sat=name not in ("splash", "truck_stop"))
        if loop:
            # no fades on loop material; scale only
            pk = np.max(np.abs(x)) + 1e-9
            y = (x * min(db(-4.3) / pk, db(-17) / np.sqrt(np.mean(x ** 2)))).astype(np.float32)
        pth = os.path.join(OUT, name + ".mp3")
        for _ in range(4):  # mp3 can overshoot: verify decoded peak <= -3.3 dBFS, re-encode lower if not
            encode_mp3(y, pth, kbps=128)
            dp = sample_peak_db(decode(pth, 1))
            if dp <= -3.3:
                break
            y = y * db(-3.5 - dp)
        info[name] = {"source": src, "packs": [PACK_URL[p] for p in packs], "synth": "synth" in src, "len": len(y) / SR}
        print(name, round(len(y) / SR, 2), "s", round(sample_peak_db(y), 1), "dB", flush=True)
    path = os.path.join(HERE, "sfx_sources.json")
    old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    old.update(info)
    json.dump(old, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
