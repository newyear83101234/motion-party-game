"""Shared helpers: decode via ffmpeg, encode mp3, loudness / true-peak measure."""
import subprocess, re, json, os
import numpy as np

SR = 44100
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def decode(path, channels=2, sr=SR):
    """-> float32 array shape (n, channels)"""
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", str(channels), "-ar", str(sr), "-f", "f32le", "-"],
                       capture_output=True, check=True)
    a = np.frombuffer(p.stdout, dtype=np.float32)
    return a.reshape(-1, channels).copy()


def encode_mp3(x, path, sr=SR, kbps=160):
    x = np.asarray(x, dtype=np.float32)
    ch = 1 if x.ndim == 1 else x.shape[1]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", str(ch), "-i", "-",
                    "-c:a", "libmp3lame", "-b:a", f"{kbps}k", path], input=x.tobytes(), check=True)


def measure(path):
    """-> dict(lufs, tp (dBTP), duration) using ffmpeg ebur128 with true peak"""
    p = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    t = p.stderr
    s = t[t.rfind("Summary:"):]
    lufs = float(re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", s).group(1).replace("-inf", "-70"))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", s).group(1).replace("-inf", "-90"))
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
                       capture_output=True, text=True).stdout.strip()
    return {"lufs": lufs, "tp": tp, "duration": float(d)}


def sample_peak_db(x):
    return 20 * np.log10(max(1e-9, float(np.max(np.abs(x)))))


def db(x):
    return 10 ** (x / 20)


def measure_array(x, sr=SR):
    """x float32 (n,ch) -> dict(lufs, tp) via ffmpeg ebur128 (true peak)."""
    x = np.asarray(x, np.float32)
    ch = 1 if x.ndim == 1 else x.shape[1]
    p = subprocess.run(["ffmpeg", "-nostats", "-f", "f32le", "-ar", str(sr), "-ac", str(ch), "-i", "-",
                        "-af", "ebur128=peak=true", "-f", "null", "-"], input=x.tobytes(), capture_output=True)
    s = p.stderr.decode("utf8", "ignore")
    s = s[s.rfind("Summary:"):]
    lufs = float(re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", s).group(1).replace("-inf", "-70"))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", s).group(1).replace("-inf", "-90"))
    return {"lufs": lufs, "tp": tp}
