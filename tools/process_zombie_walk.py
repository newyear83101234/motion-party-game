# -*- coding: utf-8 -*-
"""
process_zombie_walk.py — 把並排兩隻殭屍的 zombie3.png 切兩半、各自去背。
做法：先找中央綠色空隙當切割線 → 左半=普通殭屍走路第2格、右半=鐵桶殭屍走路第2格。
去背沿用 runner 立體殭屍法：邊緣灌色 floodfill thresh=50、跳過去綠邊(保綠皮)。
左半輸出 zombie_b.png（接普通殭屍走路動畫）；右半輸出 zombie3_cone_b.png（備用、風格待確認）。
"""
import os
import numpy as np
from PIL import Image, ImageDraw

BASE = r"d:\Claude\Projects\GAME DIY\IMAGE"
OUT = os.path.join(BASE, "sprites")
SRC = os.path.join(OUT, "zombie3.png")
SENT = (255, 0, 255)  # 洋紅哨兵色


def find_split(im_rgb):
    arr = np.array(im_rgb).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    green = (g > 90) & ((g - r) > 40) & ((g - b) > 40)   # 亮綠背景
    nongreen = (~green).sum(axis=0)
    w = im_rgb.size[0]
    lo, hi = int(w * 0.38), int(w * 0.62)
    split = lo + int(np.argmin(nongreen[lo:hi]))
    return split, int(nongreen[split])


def keyout(im_rgb):
    im2 = im_rgb.copy()
    W, H = im2.size
    seeds = [(1, 1), (W - 2, 1), (1, H - 2), (W - 2, H - 2),
             (W // 2, 1), (W // 2, H - 2), (1, H // 2), (W - 2, H // 2)]
    for s in seeds:
        ImageDraw.floodfill(im2, s, SENT, thresh=50)
    a = np.array(im2).astype(np.int16)
    bg = (a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255)
    out = np.zeros((H, W, 4), dtype=np.uint8)
    out[..., 0] = a[..., 0].astype(np.uint8)
    out[..., 1] = a[..., 1].astype(np.uint8)
    out[..., 2] = a[..., 2].astype(np.uint8)
    out[..., 3] = np.where(bg, 0, 255).astype(np.uint8)
    out[bg] = (0, 0, 0, 0)
    rgba = Image.fromarray(out, "RGBA")
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    cw, ch = rgba.size
    side = max(cw, ch)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(rgba, ((side - cw) // 2, (side - ch) // 2))
    return sq, (a.shape[1], a.shape[0]), (cw, ch)


im = Image.open(SRC).convert("RGB")
w, h = im.size
split, gap = find_split(im)
print(f"原圖 {w}x{h}，切割線 x={split}（該欄非綠像素={gap}，越小越乾淨）")

left = im.crop((0, 0, split, h))
right = im.crop((split, 0, w, h))

for name, half in [("zombie_b.png", left), ("zombie3_cone_b.png", right)]:
    sq, _, (cw, ch) = keyout(half)
    p = os.path.join(OUT, name)
    sq.save(p)
    a = np.array(sq)[..., 3]
    print(f"  -> {name}  {sq.size[0]}x{sq.size[1]}  角色bbox={cw}x{ch}(比例{ch/cw:.2f})  透明比例={(a==0).mean():.0%}")

print("完成。")
