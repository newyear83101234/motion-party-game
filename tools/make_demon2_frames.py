# -*- coding: utf-8 -*-
"""Boss男團綠幕影片→抽8幀→綠幕去背→只取「中間那隻」(內容寬度中間1/3、含翅膀)→垂直透明PNG。
   產第二種小惡魔(穿插飛出、畫面不單調)。輸出 IMAGE/sprites/demon2_frames/d0~d7.png。"""
import os, subprocess, tempfile, numpy as np
from PIL import Image
from scipy import ndimage
import imageio_ffmpeg

VID = r"d:\Claude\Projects\GAME DIY\VIDEO\Boss.mp4"
OUT = r"d:\Claude\Projects\GAME DIY\IMAGE\sprites\demon2_frames"
N, OUTW, T0, T1 = 8, 360, 0.3, 14.5            # 8幀、輸出寬360(單隻角色、高按比例)
MID_LO, MID_HI = 0.34, 0.66                    # 取內容寬度的中間段(=中間角色、含翅膀小margin、兩側角色排除)
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
    return rgb.astype(np.uint8), alpha

# 1) 抽幀+去背
rgbas = []
for i, t in enumerate(times):
    p = os.path.join(tmp, f"r{i}.png")
    subprocess.run([ff, "-y", "-v", "error", "-ss", str(t), "-i", VID, "-frames:v", "1", p], check=True)
    rgb, alpha = keyframe(np.array(Image.open(p).convert("RGB")).astype(int))
    rgbas.append(np.dstack([rgb, alpha]).astype(np.uint8))

# 2) 全幀聯集→算「整體3人內容」的x範圍→切中間段(=中間角色)
union = np.zeros(rgbas[0].shape[:2], bool)
for r in rgbas: union |= (r[..., 3] > 0)
ys_all, xs_all = np.where(union)
cx0, cx1 = xs_all.min(), xs_all.max()
mx0 = int(cx0 + (cx1 - cx0) * MID_LO); mx1 = int(cx0 + (cx1 - cx0) * MID_HI)

# 3) 只保留中間段、每幀清掉殘留(中間段內保留主體+翅膀、丟孤立小噪點)
mids = []
for r in rgbas:
    m = r.copy()
    m[:, :mx0, 3] = 0; m[:, mx1:, 3] = 0          # 中間段外全透明
    a = m[..., 3] > 0
    lbl, n = ndimage.label(a)
    if n > 1:
        sizes = ndimage.sum(np.ones(lbl.shape), lbl, range(1, n + 1))
        main = int(np.argmax(sizes)) + 1                     # 中間角色=最大連通塊(身體+翅膀相連)
        cxs = ndimage.center_of_mass(a, lbl, range(1, n + 1))
        mcx = cxs[main - 1][1]
        keep = [main]
        for j in range(1, n + 1):                            # 額外保留貼近主體、夠大的碎塊(翅膀尖等)、丟兩側角色殘片
            if j != main and sizes[j - 1] > sizes.max() * 0.04 and abs(cxs[j - 1][1] - mcx) < (mx1 - mx0) * 0.30:
                keep.append(j)
        m[..., 3] = np.where(np.isin(lbl, keep), m[..., 3], 0).astype(np.uint8)
    mids.append(m)

# 4) 中間角色的聯集bbox統一裁切(8幀對齊不跳)
u2 = np.zeros(mids[0].shape[:2], bool)
for m in mids: u2 |= (m[..., 3] > 0)
ys, xs = np.where(u2); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
pad = int(max(y1 - y0, x1 - x0) * 0.05)
H, W = mids[0].shape[:2]
y0, y1 = max(0, y0 - pad), min(H, y1 + pad); x0, x1 = max(0, x0 - pad), min(W, x1 + pad)
outh = int(OUTW * (y1 - y0) / (x1 - x0))
for i, m in enumerate(mids):
    Image.fromarray(m[y0:y1, x0:x1], "RGBA").resize((OUTW, outh), Image.LANCZOS).save(os.path.join(OUT, f"d{i}.png"))
print(f"OK {N}幀 -> {OUT} (中間角色 bbox {x1-x0}x{y1-y0} -> {OUTW}x{outh})")
