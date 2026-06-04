# -*- coding: utf-8 -*-
"""
process_hero.py — 處理超人素材（頭盔 / 英雄圖）。
用「整張去綠」(global chroma key)：把所有綠色像素變透明，
這樣頭盔「中間被框住的臉洞綠」也會被挖空（露臉）。
頭盔/英雄都是銀紅黃配色、沒有綠色，所以整張去綠很安全。
"""
import os
import numpy as np
from PIL import Image

BASE = r"d:\Claude\Projects\GAME DIY\IMAGE"
OUT = os.path.join(BASE, "sprites")
os.makedirs(OUT, exist_ok=True)

JOBS = [("helmet.png", "helmet.png"), ("hero.png", "hero.png"), ("chest.png", "chest.png"),
        ("meteor.png", "meteor.png"), ("logo.png", "logo.png"),
        ("boss_warning.png", "boss_warning.png"), ("star.png", "star.png")]

def process(src_path, out_path):
    im = Image.open(src_path).convert("RGB")
    arr = np.array(im).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]

    # 綠色判定：綠明顯壓過紅與藍
    green = (g > 90) & ((g - r) > 40) & ((g - b) > 40)

    # 去綠邊：非綠、但偏綠的邊緣 -> 把綠壓到 max(r,b)
    greenish = (~green) & ((g - r) > 12) & ((g - b) > 12)
    g2 = g.copy()
    g2[greenish] = np.maximum(r, b)[greenish]

    h, w = green.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., 0] = r.astype(np.uint8)
    out[..., 1] = g2.astype(np.uint8)
    out[..., 2] = b.astype(np.uint8)
    out[..., 3] = np.where(green, 0, 255).astype(np.uint8)
    out[green] = (0, 0, 0, 0)  # 透明像素 RGB 也歸零，徹底消除綠邊/預覽殘綠

    rgba = Image.fromarray(out, "RGBA")
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    cw, ch = rgba.size
    side = max(cw, ch)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(rgba, ((side - cw) // 2, (side - ch) // 2))
    square.save(out_path)
    a = np.array(square)[..., 3]
    print(f"  -> {os.path.basename(out_path)}  {side}x{side}  透明比例={(a==0).mean():.0%}")

print("處理超人素材...")
for src, out_name in JOBS:
    sp = os.path.join(BASE, src)
    if not os.path.exists(sp):
        print(f"[找不到] {src}"); continue
    print(f"處理 {src}")
    process(sp, os.path.join(OUT, out_name))
print("完成:", OUT)
