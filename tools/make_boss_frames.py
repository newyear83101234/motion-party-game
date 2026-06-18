# -*- coding: utf-8 -*-
"""Boss男團綠幕影片→抽8幀→綠幕去背→聯集bbox對齊裁切→橫向透明PNG(ping-pong動畫sprite)。"""
import os, subprocess, tempfile, numpy as np
from PIL import Image
from scipy import ndimage
import imageio_ffmpeg

VID = r"d:\Claude\Projects\GAME DIY\VIDEO\Boss.mp4"
OUT = r"d:\Claude\Projects\GAME DIY\IMAGE\sprites\boss_frames"
N, OUTW, T0, T1 = 8, 720, 0.3, 14.5            # 8幀、輸出寬720(3人橫排、高按比例)
ff = imageio_ffmpeg.get_ffmpeg_exe()
os.makedirs(OUT, exist_ok=True)
tmp = tempfile.mkdtemp()
times = [round(T0 + i * (T1 - T0) / (N - 1), 3) for i in range(N)]

def keyframe(arr):
    R, G, B = arr[..., 0], arr[..., 1], arr[..., 2]
    green = (G - np.maximum(R, B)) > 14
    alpha = np.where(green, 0, 255).astype(np.uint8)
    alpha = (ndimage.binary_closing(alpha > 0, iterations=1) * 255).astype(np.uint8)
    inner = ndimage.binary_erosion(alpha > 0, iterations=1); alpha = np.where(inner | (alpha == 0), alpha, 0).astype(np.uint8)
    rgb = arr.copy(); mxRB = np.maximum(rgb[..., 0], rgb[..., 2])
    spill = (alpha > 0) & (rgb[..., 1] > mxRB); rgb[..., 1] = np.where(spill, mxRB, rgb[..., 1])
    lbl, n = ndimage.label(alpha > 0)              # 清孤立殘留(保留主體、Boss是3人可能3塊→保留>最大15%)
    if n > 1:
        sizes = ndimage.sum(np.ones(lbl.shape), lbl, range(1, n + 1))
        keep = np.where(sizes > sizes.max() * 0.15)[0] + 1
        alpha = np.where(np.isin(lbl, keep), alpha, 0).astype(np.uint8)
    return rgb.astype(np.uint8), alpha

rgbas = []
for i, t in enumerate(times):
    p = os.path.join(tmp, f"r{i}.png")
    subprocess.run([ff, "-y", "-v", "error", "-ss", str(t), "-i", VID, "-frames:v", "1", p], check=True)
    rgb, alpha = keyframe(np.array(Image.open(p).convert("RGB")).astype(int))
    rgbas.append(np.dstack([rgb, alpha]).astype(np.uint8))

union = np.zeros(rgbas[0].shape[:2], bool)         # 聯集bbox統一裁切(8幀對齊不跳)
for r in rgbas: union |= (r[..., 3] > 0)
ys, xs = np.where(union); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
pad = int(max(y1 - y0, x1 - x0) * 0.04)
H, W = rgbas[0].shape[:2]
y0, y1 = max(0, y0 - pad), min(H, y1 + pad); x0, x1 = max(0, x0 - pad), min(W, x1 + pad)
outh = int(OUTW * (y1 - y0) / (x1 - x0))           # 保持橫向比例
for i, r in enumerate(rgbas):
    Image.fromarray(r[y0:y1, x0:x1], "RGBA").resize((OUTW, outh), Image.LANCZOS).save(os.path.join(OUT, f"b{i}.png"))
print(f"OK {N}幀 -> {OUT} (bbox {x1-x0}x{y1-y0} -> {OUTW}x{outh})")
