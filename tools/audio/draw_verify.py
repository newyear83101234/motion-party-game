"""Verify audio/draw files, write audio/draw/audio.json and audio/draw/_seam.mp3 (read-only on the rest of audio/)."""
import os, json, subprocess, numpy as np
from common import SR, decode, encode_mp3, measure, ROOT
from loopmaker import seam_check
D = os.path.join(ROOT, "audio", "draw"); man = json.load(open(os.path.join(ROOT, "audio", "manifest.json"), encoding="utf-8"))["bgm"]["rainbow"]
src = json.load(open(os.path.join(ROOT, "tools", "audio", "candidates", "draw_sfx_src.json"), encoding="utf-8"))
def probe(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=channels,sample_rate", "-of", "csv=p=0", p], capture_output=True, text=True).stdout.strip()
    return o
bgm = os.path.join(D, "bgm.mp3"); ls, le = man["loopStart"], man["loopEnd"]
x = decode(bgm, 2); a, b = int(ls * SR), int(le * SR)
j = np.concatenate([x[b - SR:b], x[a:a + SR]]); encode_mp3(j, os.path.join(D, "_seam.mp3"), kbps=128)
mono = j.mean(axis=1); w = 441
print("BGM", probe(bgm), measure(bgm), "seam", seam_check(bgm, ls, le))
print("seam rms 20ms windows around join (dBFS):", [round(float(20*np.log10(np.sqrt(np.mean(mono[SR+k*w:SR+(k+1)*w]**2))+1e-9)),1) for k in range(-3,3)])
print("seam max |sample step| at join / 99.9pct local:", round(float(abs(mono[SR]-mono[SR-1])),4), round(float(np.percentile(np.abs(np.diff(mono[SR-4410:SR+4410])),99.9)),4))
doc = {"bgm": {"file": "audio/draw/bgm.mp3", "loopStart": ls, "loopEnd": le, "lufs": man["lufs"], "bpm": man["bpm"],
               "source": "reused audio/bgm/rainbow.mp3 (Gemini Lyria lyria-3.5, candidate rainbow_3); Lyria call for a new draw theme failed HTTP 402",
               "license": "Gemini API generated (Lyria 3.5, instrumental); no attribution needed; see audio/CREDITS.md"}, "sfx": {}}
for n, m in src.items():
    p = os.path.join(D, "sfx", n + ".mp3"); y = decode(p, 1)[:, 0]; dur = len(y) / SR
    nz = np.nonzero(np.abs(y) > 0.01 * np.abs(y).max())[0][0] / SR * 1000
    act = y[np.abs(y) > 0.05 * np.abs(y).max()]; rms = 20 * np.log10(np.sqrt(np.mean(act ** 2)))
    pk = 20 * np.log10(np.abs(y).max()); tail = 20 * np.log10(np.abs(y[-int(0.01*SR):]).max() + 1e-9)
    print(f"{n:8s} {probe(p)} dur={dur:.2f}s lead={nz:.0f}ms rms={rms:.1f} peak={pk:.1f} tail10ms={tail:.1f}dBFS")
    doc["sfx"][n] = {"file": f"audio/draw/sfx/{n}.mp3", "gain": m["gain"], "dur": round(dur, 3), "source": m["source"], "license": m["license"]}
json.dump(doc, open(os.path.join(D, "audio.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
