# -*- coding: utf-8 -*-
"""綠幕舞者影片→去背→合成到直式霓虹舞台→輸出普通mp4(全平台可播、舞者站在舞台上)。"""
import os, subprocess, tempfile, numpy as np
from PIL import Image, ImageEnhance
from scipy import ndimage
import imageio_ffmpeg

VIDS = [r"d:\Claude\Projects\GAME DIY\VIDEO\demo2.mp4",     # 多支綠幕影片依序拼接(動作不重複)
        r"d:\Claude\Projects\GAME DIY\VIDEO\demo3.mp4"]
STAGE = r"d:\Claude\Projects\GAME DIY\IMAGE\sprites\stage_kpop2.png"  # 魔法森林夜空背景
BG_BRIGHT = 1.22                                            # 背景提亮(夜景偏暗、舞者有打光、提亮對比剛好)
OUT = r"d:\Claude\Projects\GAME DIY\VIDEO\kpop_dance.mp4"
OUTW, OUTH, FPS = 720, 1280, 24
ff = imageio_ffmpeg.get_ffmpeg_exe()
tmp_in, tmp_out = tempfile.mkdtemp(), tempfile.mkdtemp()

# 直式背景(cover填滿720x1280置中裁)+提亮
st = Image.open(STAGE).convert("RGB"); sc = max(OUTW/st.width, OUTH/st.height)
st = st.resize((int(st.width*sc), int(st.height*sc)), Image.LANCZOS)
stage = st.crop(((st.width-OUTW)//2, (st.height-OUTH)//2, (st.width-OUTW)//2+OUTW, (st.height-OUTH)//2+OUTH))
stage = ImageEnhance.Brightness(stage).enhance(BG_BRIGHT)

# 多支影片拼接(同編碼直接concat)再抽幀
listf = os.path.join(tmp_in, "list.txt")
with open(listf, "w", encoding="utf-8") as f:
    for v in VIDS: f.write(f"file '{v}'\n")
combined = os.path.join(tmp_in, "combined.mp4")
subprocess.run([ff, "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listf, "-c", "copy", combined], check=True)
subprocess.run([ff, "-y", "-v", "error", "-i", combined, os.path.join(tmp_in, "f%04d.png")], check=True)
frames = sorted([x for x in os.listdir(tmp_in) if x.startswith("f") and x.endswith(".png")])

def keyframe(arr):                                  # 綠幕去背→回傳(rgb, alpha)
    R, G, B = arr[..., 0], arr[..., 1], arr[..., 2]
    green = (G - np.maximum(R, B)) > 14             # 全圖去綠(角色無純綠)、清腳下殘留陰影綠
    alpha = np.where(green, 0, 255).astype(np.uint8)
    alpha = (ndimage.binary_closing(alpha > 0, iterations=1) * 255).astype(np.uint8)  # 補角色內小洞
    inner = ndimage.binary_erosion(alpha > 0, iterations=1); alpha = np.where(inner | (alpha == 0), alpha, 0).astype(np.uint8)  # 1px羽化消綠邊
    rgb = arr.copy(); mxRB = np.maximum(rgb[..., 0], rgb[..., 2])
    spill = (alpha > 0) & (rgb[..., 1] > mxRB); rgb[..., 1] = np.where(spill, mxRB, rgb[..., 1])  # despill去綠溢色
    lbl, n = ndimage.label(alpha > 0)                  # 清孤立殘留塊(黃綠偽影非綠、只保留角色主體連通域)
    if n > 1:
        sizes = ndimage.sum(np.ones(lbl.shape), lbl, range(1, n + 1))
        keep = np.where(sizes > sizes.max() * 0.08)[0] + 1
        alpha = np.where(np.isin(lbl, keep), alpha, 0).astype(np.uint8)
    return rgb.astype(np.uint8), alpha

# pass1:去背存透明PNG + 累積聯集bbox(固定裁切) + 身體質心x(置中基準、手伸遠不影響)
ux0, uy0, ux1, uy1 = 1e9, 1e9, 0, 0
cxsum, cxn = 0.0, 0
for fn in frames:
    arr = np.array(Image.open(os.path.join(tmp_in, fn)).convert("RGB")).astype(int)
    rgb, alpha = keyframe(arr)
    Image.fromarray(np.dstack([rgb, alpha]), "RGBA").save(os.path.join(tmp_in, "a_" + fn))
    ys, xs = np.where(alpha > 0)
    if len(ys):
        ux0, uy0, ux1, uy1 = min(ux0, xs.min()), min(uy0, ys.min()), max(ux1, xs.max()), max(uy1, ys.max())
        cxsum += xs.mean(); cxn += 1
bw, bh = ux1 - ux0, uy1 - uy0
scale = min(OUTH * 0.92 / bh, OUTW * 1.03 / bw)     # 放大一點點(阿葉要)、寬可微超
sw, sh = int(bw * scale), int(bh * scale)
bodyCx = cxsum / cxn                                # 身體質心x(原圖)→真正置中(不被手伸遠拉歪)
px = int(OUTW / 2 - (bodyCx - ux0) * scale)
py = (OUTH - sh) // 2 - int(OUTH * 0.04)            # 垂直置中略偏上(給捲軸)

# pass2:固定bbox裁→scale→貼舞台→輸出
for fn in frames:
    d = Image.open(os.path.join(tmp_in, "a_" + fn)).crop((ux0, uy0, ux1, uy1)).resize((sw, sh), Image.LANCZOS)
    canvas = stage.copy().convert("RGBA"); canvas.alpha_composite(d, (px, py))
    canvas.convert("RGB").save(os.path.join(tmp_out, fn))

subprocess.run([ff, "-y", "-v", "error", "-framerate", str(FPS), "-i", os.path.join(tmp_out, "f%04d.png"),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", OUT], check=True)
print(f"OK 合成 {len(frames)}幀 -> {OUT} ({OUTW}x{OUTH}) 舞者bbox {bw}x{bh}->scale{scale:.2f}")
