"""Build audio/draw/sfx/*.mp3 for the colouring game from local CC0 sources (Kenney + Freesound) or numpy synth.
Mono 44.1k, trimmed leading silence, faded tail, RMS-normalised, peak-limited. Writes audio/draw/sfx_report.json.
Does NOT touch audio/manifest.json, audio/bgm, audio/sfx."""
import os, json
import numpy as np
from common import SR, decode, encode_mp3, ROOT
K = os.path.join(ROOT, "tools", "audio", "kenney"); F = os.path.join(ROOT, "tools", "audio", "freesound")
OUT = os.path.join(ROOT, "audio", "draw", "sfx"); os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(F, "freesound", "meta.json"))) if False else json.load(open(os.path.join(F, "meta.json")))

def kn(pack, name): return os.path.join(K, pack, "Audio", name + ".ogg")
def fs(cat, id_): return os.path.join(F, cat, str(id_) + ".mp3")
def fsrc(cat, id_):
    m = meta[f"{cat}/{id_}"]; return f"Freesound {m['title']} by {m['user']} ({m['url']})", "CC0 1.0"
KEN = ("Kenney %s (kenney.nl)", "CC0 1.0")

def load(p): return decode(p, 1)[:, 0]
def trim_lead(x, thr=0.01):
    i = np.argmax(np.abs(x) > thr * max(1e-6, np.abs(x).max())); return x[i:]
def fade(x, ms): n = min(len(x), int(ms * SR / 1000)); x = x.copy(); x[-n:] *= np.linspace(1, 0, n) ** 1.5; return x
def lp(x, fc):
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(2, fc / (SR / 2), output="sos"), x)
def finish(x, maxdur, fade_ms, rms_db, hp=None):
    x = trim_lead(x)[: int(maxdur * SR)]
    # trim trailing silence
    e = np.abs(x) > 0.004 * np.abs(x).max(); x = x[: np.nonzero(e)[0][-1] + 1] if e.any() else x
    x = fade(x, fade_ms)
    act = x[np.abs(x) > 0.05 * np.abs(x).max()]
    r = np.sqrt(np.mean(act ** 2)); x = x * (10 ** (rms_db / 20) / r)
    pk = np.abs(x).max()
    if pk > 0.84: x = x * 0.84 / pk
    return np.concatenate([x, np.zeros(int(0.03 * SR))]).astype(np.float32)
def tone(f0, f1, dur, shape=3.0):
    t = np.arange(int(dur * SR)) / SR; f = f0 + (f1 - f0) * (t / dur); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-shape * t / dur)
def bell(f, dur, dec=5.0):
    t = np.arange(int(dur * SR)) / SR
    return sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-dec * m * 0.6 * t) for a, m in [(1, 1), (0.35, 2.76), (0.2, 5.4)])

specs = {}
def add(name, x, src, lic, maxdur, fade_ms, rms, gain, synth=False):
    specs[name] = (x, src, lic, maxdur, fade_ms, rms, gain, synth)

add("tap", load(kn("interface-sounds", "click_002")), "Kenney Interface Sounds click_002", "CC0 1.0", 0.12, 10, -22, 0.55)
add("pick", load(kn("interface-sounds", "tick_001")), "Kenney Interface Sounds tick_001", "CC0 1.0", 0.15, 10, -21, 0.6)
s, l = fsrc("splash", 410335); add("fill", lp(load(fs("splash", 410335)), 6000), s + " (lowpassed, trimmed)", l, 0.75, 220, -19, 0.7)
# sticker: elastic 'boing-pop' + tiny sparkle (synth)
st = np.zeros(int(0.5 * SR)); b = tone(260, 820, 0.14, 2.5); st[:len(b)] += b * 0.9
b2 = tone(700, 520, 0.2, 4.0); st[int(0.12 * SR): int(0.12 * SR) + len(b2)] += b2 * 0.5
sp = bell(1760, 0.3, 9); st[int(0.1 * SR): int(0.1 * SR) + len(sp)] += sp * 0.25
add("sticker", st, "numpy synth (elastic pop + bell sparkle)", "CC0 (own synthesis)", 0.5, 150, -19, 0.7, True)
s, l = fsrc("whoosh", 60013); add("undo", lp(load(fs("whoosh", 60013)), 8000)[::-1].copy(), s + " (reversed, lowpassed, trimmed)", l, 0.45, 40, -21, 0.55)
rng = np.random.default_rng(7)
def crumple():
    from scipy.signal import butter, sosfilt
    n = int(0.9 * SR); y = np.zeros(n)
    for _ in range(70):
        t0 = int((rng.random() ** 1.6) * 0.8 * SR); L = int(rng.uniform(0.004, 0.014) * SR)
        b = rng.standard_normal(L) * np.hanning(L) * rng.uniform(0.3, 1.0) * (1 - t0 / n * 0.6)
        y[t0:t0 + L] += b[: n - t0]
    y = sosfilt(butter(2, [1500 / (SR / 2), 7000 / (SR / 2)], "band", output="sos"), y)
    body = sosfilt(butter(2, 1800 / (SR / 2), output="sos"), rng.standard_normal(n)) * np.hanning(n) ** 2 * 0.35
    return y + body
add("clear", crumple(), "numpy synth (paper crumple: random noise crackle + soft whoosh body)", "CC0 (own synthesis)", 0.9, 350, -20, 0.6, True)
add("open", load(kn("rpg-audio", "bookFlip3")), "Kenney RPG Audio bookFlip3", "CC0 1.0", 0.6, 120, -20, 0.6)
s, l = fsrc("star", 456965); add("finish", load(fs("star", 456965)), s + " (trimmed 2.2s, faded)", l, 2.2, 600, -18, 0.75)
s, l = fsrc("ding", 625174); add("save", load(fs("ding", 625174)), s + " (trimmed)", l, 0.7, 250, -19, 0.7)
s, l = fsrc("sticker", 511485); add("magic", load(fs("sticker", 511485)), s + " (trimmed)", l, 1.2, 400, -21, 0.55)
s, l = fsrc("pop", 401542); add("pop", load(fs("pop", 401542)), s + " (trimmed)", l, 0.2, 40, -21, 0.5)

if __name__ == "__main__":
    rep = {}
    for n, (x, src, lic, md, fm, rms, gain, syn) in specs.items():
        y = finish(x, md, fm, rms); encode_mp3(y, os.path.join(OUT, n + ".mp3"), kbps=128)
        rep[n] = {"source": src, "license": lic, "gain": gain, "synth": syn}
    json.dump(rep, open(os.path.join(ROOT, "tools", "audio", "candidates", "draw_sfx_src.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("built", len(rep))
