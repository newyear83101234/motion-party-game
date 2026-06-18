# -*- coding: utf-8 -*-
"""綠幕舞者影片→去背→合成到直式霓虹舞台→輸出普通mp4(全平台可播、舞者站在舞台上)。"""
import os, subprocess, tempfile, numpy as np
from PIL import Image
from scipy import ndimage
import imageio_ffmpeg

VID = r"d:\Claude\Projects\GAME DIY\VIDEO\demo2.mp4"
STAGE = r"d:\Claude\Projects\GAME DIY\IMAGE\sprites\stage_kpop.png"
OUT = r"d:\Claude\Projects\GAME DIY\VIDEO\kpop_dance.mp4"
OUTW, OUTH, FPS = 720, 1280, 24
ff = imageio_ffmpeg.get_ffmpeg_exe()
tmp_in, tmp_out = tempfile.mkdtemp(), tempfile.mkdtemp()

# 直式舞台背景(cover:填滿720x1280再置中裁)
st = Image.open(STAGE).convert("RGB"); sc = max(OUTW/st.width, OUTH/st.height)
st = st.resize((int(st.width*sc), int(st.height*sc)), Image.LANCZOS)
stage = st.crop(((st.width-OUTW)//2, (st.height-OUTH)//2, (st.width-OUTW)//2+OUTW, (st.height-OUTH)//2+OUTH))

subprocess.run([ff, "-y", "-v", "error", "-i", VID, os.path.join(tmp_in, "f%04d.png")], check=True)
frames = sorted(os.listdir(tmp_in))

def keyframe(arr):                                  # 綠幕去背→回傳(rgb, alpha)
    R, G, B = arr[..., 0], arr[..., 1], arr[..., 2]
    green = (G - np.maximum(R, B)) > 14             # 全圖去綠(角色無純綠)、清腳下殘留陰影綠
    alpha = np.where(green, 0, 255).astype(np.uint8)
    alpha = (ndimage.binary_closing(alpha > 0, iterations=1) * 255).astype(np.uint8)  # 補角色內小洞
    inner = ndimage.binary_erosion(alpha > 0, iterations=1); alpha = np.where(inner | (alpha == 0), alpha, 0).astype(np.uint8)  # 1px羽化消綠邊
    rgb = arr.copy(); mxRB = np.maximum(rgb[..., 0], rgb[..., 2])
    spill = (alpha > 0) & (rgb[..., 1] > mxRB); rgb[..., 1] = np.where(spill, mxRB, rgb[..., 1])  # despill去綠溢色
    return rgb.astype(np.uint8), alpha

# pass1:去背存透明PNG + 累積聯集bbox(固定裁切=舞者大小位置不跳)
ux0, uy0, ux1, uy1 = 1e9, 1e9, 0, 0
for fn in frames:
    arr = np.array(Image.open(os.path.join(tmp_in, fn)).convert("RGB")).astype(int)
    rgb, alpha = keyframe(arr)
    Image.fromarray(np.dstack([rgb, alpha]), "RGBA").save(os.path.join(tmp_in, "a_" + fn))
    ys, xs = np.where(alpha > 0)
    if len(ys): ux0, uy0, ux1, uy1 = min(ux0, xs.min()), min(uy0, ys.min()), max(ux1, xs.max()), max(uy1, ys.max())
bw, bh = ux1 - ux0, uy1 - uy0
scale = min(OUTH * 0.84 / bh, OUTW * 0.96 / bw)     # 舞者佔直式高84%、寬不超96%
sw, sh = int(bw * scale), int(bh * scale)
px, py = (OUTW - sw) // 2, (OUTH - sh) // 2 - int(OUTH * 0.04)  # 水平置中、垂直置中(略偏上一點點給捲軸)

# pass2:固定bbox裁→scale→貼舞台→輸出
for fn in frames:
    d = Image.open(os.path.join(tmp_in, "a_" + fn)).crop((ux0, uy0, ux1, uy1)).resize((sw, sh), Image.LANCZOS)
    canvas = stage.copy().convert("RGBA"); canvas.alpha_composite(d, (px, py))
    canvas.convert("RGB").save(os.path.join(tmp_out, fn))

subprocess.run([ff, "-y", "-v", "error", "-framerate", str(FPS), "-i", os.path.join(tmp_out, "f%04d.png"),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", OUT], check=True)
print(f"OK 合成 {len(frames)}幀 -> {OUT} ({OUTW}x{OUTH}) 舞者bbox {bw}x{bh}->scale{scale:.2f}")
