# -*- coding: utf-8 -*-
"""從綠幕惡魔影片抽幀→綠幕去背→聯集bbox對齊裁切→輸出逐幀動畫sprite。"""
import os, subprocess, tempfile, numpy as np
from PIL import Image
from scipy import ndimage
import imageio_ffmpeg

VID = r"d:\Claude\Projects\GAME DIY\VIDEO\demo.mp4"
OUT = r"d:\Claude\Projects\GAME DIY\IMAGE\sprites\demon_frames"
N, SIZE, T0, T1 = 8, 360, 0.15, 3.6        # 抽8幀、輸出360方、避開頭尾各一點點
ff = imageio_ffmpeg.get_ffmpeg_exe()
os.makedirs(OUT, exist_ok=True)
tmp = tempfile.mkdtemp()
times = [round(T0 + i * (T1 - T0) / (N - 1), 3) for i in range(N)]

rgbas = []
for i, t in enumerate(times):
    p = os.path.join(tmp, f"r{i}.png")
    subprocess.run([ff, "-y", "-v", "error", "-ss", str(t), "-i", VID, "-frames:v", "1", p], check=True)
    arr = np.array(Image.open(p).convert("RGB")).astype(int)
    R, G, B = arr[..., 0], arr[..., 1], arr[..., 2]
    green = (G - np.maximum(R, B)) > 18                      # 綠幕:綠明顯壓過紅藍
    labeled, _ = ndimage.label(green)
    border = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
    border.discard(0)
    bg = np.isin(labeled, list(border))                     # 只清碰邊緣的綠連通域
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    inner = ndimage.binary_erosion(alpha > 0, iterations=1) # 1px羽化消綠邊
    alpha = np.where(inner | (alpha == 0), alpha, 0).astype(np.uint8)
    rgb = arr.copy()
    mxRB = np.maximum(rgb[..., 0], rgb[..., 2])              # despill:保留像素去綠溢色
    spill = (alpha > 0) & (rgb[..., 1] > mxRB)
    rgb[..., 1] = np.where(spill, mxRB, rgb[..., 1])
    rgbas.append(np.dstack([rgb, alpha]).astype(np.uint8))

# 聯集 bbox(含手臂最張開):8幀統一裁切=角色佔滿且彼此對齊不跳動
union = np.zeros(rgbas[0].shape[:2], bool)
for r in rgbas: union |= (r[..., 3] > 0)
ys, xs = np.where(union)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
pad = int(max(y1 - y0, x1 - x0) * 0.06)
H, W = rgbas[0].shape[:2]
y0, y1 = max(0, y0 - pad), min(H, y1 + pad); x0, x1 = max(0, x0 - pad), min(W, x1 + pad)
side = max(y1 - y0, x1 - x0)                                 # pad 成正方形(置中)
for i, r in enumerate(rgbas):
    crop = Image.fromarray(r[y0:y1, x0:x1], "RGBA")
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f"d{i}.png"))
print(f"OK {N}幀 -> {OUT} (bbox {x1-x0}x{y1-y0} -> {SIZE}方)")
