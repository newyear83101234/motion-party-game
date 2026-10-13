"""進化曲：Suno 原曲一路都很熱，沒有慢慢蓄力的段落 → 自己做蓄力。
剪 [高潮-8s, 高潮+14s]；前 8 秒用時變低通（STFT 頻譜遮罩，截止頻率 250Hz→全頻、指數上升）＋音量 -14dB→0 漸強＋上升的濾波噪音（riser），
高潮那一下原曲全頻進來（爆開），最後 2.5 秒淡出。輸出候選並請 Gemini 聽。
用法：python v7_evolve_build.py"""
import os, json, sys
import numpy as np
from scipy.signal import stft, istft
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from v7_music import V7, gemini, P_EVO_CUT, refine_hit
from common import SR, decode, encode_mp3
from loopmaker import normalize

PRE, POST = 8.0, 14.0


def build(src, hit, out):
    x = decode(src)
    s0 = int((hit - PRE) * SR); s1 = int((hit + POST) * SR)
    y = x[s0:s1].astype(np.float64).copy()
    nb = int(PRE * SR)
    # 1) 時變低通：只處理前 8 秒（多留 0.3 秒讓遮罩在高潮前完全打開）
    nper = 2048
    seg = y[:nb + int(0.3 * SR)]
    out_ch = []
    for c in range(seg.shape[1]):
        f, t, Z = stft(seg[:, c], SR, nperseg=nper, noverlap=nper * 3 // 4)
        prog = np.clip(t / PRE, 0, 1)                         # 0→1
        fc = 250.0 * (16000.0 / 250.0) ** (prog ** 1.6)       # 指數打開，前段慢、後段快
        mask = 1.0 / (1.0 + (f[:, None] / fc[None, :]) ** 6)   # 6 階滾降
        _, xr = istft(Z * mask, SR, nperseg=nper, noverlap=nper * 3 // 4)
        out_ch.append(xr[:len(seg)])
    filt = np.stack(out_ch, axis=1)
    # 跟原曲在高潮點前 0.25 秒交叉（遮罩此時已幾乎全開）
    xf = int(0.25 * SR)
    w = np.linspace(0, 1, xf)[:, None]
    y[:nb - xf] = filt[:nb - xf]
    y[nb - xf:nb] = filt[nb - xf:nb] * (1 - w) + y[nb - xf:nb] * w
    # 2) 音量漸強 -14dB → 0dB
    g = 10 ** ((-14.0 * (1 - np.linspace(0, 1, nb) ** 1.3)) / 20)
    y[:nb] *= g[:, None]
    # 3) riser：粉紅噪音經高通、音量指數上升，在高潮那一下切掉
    rng = np.random.default_rng(7)
    n = rng.standard_normal(nb)
    n = np.cumsum(n); n -= np.convolve(n, np.ones(64) / 64, mode="same")   # 粗略帶通
    n /= np.max(np.abs(n)) + 1e-9
    env = (np.linspace(0, 1, nb) ** 3) * 0.16
    riser = (n * env)[:, None] * np.array([[0.9, 1.0]])
    y[:nb] += riser
    # 4) 開頭淡入、結尾淡出
    fi, fo = int(0.3 * SR), int(2.5 * SR)
    y[:fi] *= np.linspace(0, 1, fi)[:, None]
    y[-fo:] *= (np.linspace(1, 0, fo) ** 1.5)[:, None]
    yy, mm = normalize(y.astype(np.float32), y.astype(np.float32), target_lufs=-16.0)
    encode_mp3(yy, out)
    return mm


res = {}
for n, h in (("evolve_a", 46.59), ("evolve_b", 54.56), ("evolve_a", 16.08)):
    src = os.path.join(V7, n + ".mp3")
    hit = refine_hit(src, h, win=0.6)
    tag = f"{n}_{int(h)}"
    out = os.path.join(V7, f"build_{tag}.mp3")
    mm = build(src, hit, out)
    g = gemini(out, P_EVO_CUT)
    res[tag] = {"hit": round(hit, 2), "measure": mm, "review": g}
    print(tag, json.dumps(g, ensure_ascii=False), flush=True)
json.dump(res, open(os.path.join(V7, "result3.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
