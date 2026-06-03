# -*- coding: utf-8 -*-
"""
process_sprites.py — 把 ChatGPT 生的「綠底怪獸圖」去背成透明 PNG。
做法：從四個角落「灌色」(floodfill) 把背景綠填成洋紅哨兵色，遇到粗黑外框就停，
      所以不會誤吃到怪獸身上的綠（綠底配綠怪最容易出包的點）。
最後做去綠邊(de-spill) + 裁切 + 補成正方形。
"""
import os
import numpy as np
from PIL import Image, ImageDraw

BASE = r"d:\Claude\Projects\GAME DIY\IMAGE"
OUT = os.path.join(BASE, "sprites")
os.makedirs(OUT, exist_ok=True)

# 來源檔 -> 輸出檔名
JOBS = [
    ("ChatGPT Image 2026年6月3日 下午07_44_03.png", "monster1.png"),  # 青怪（普通）
    ("ChatGPT Image 2026年6月3日 下午07_48_52.png", "monster2.png"),  # 紫怪（普通）
    ("ChatGPT Image 2026年6月3日 下午07_48_56.png", "boss.png"),      # 金色 Boss（金球）
    ("ChatGPT Image 2026年6月3日 下午07_49_00.png", "bomb.png"),      # 紅炸彈怪（別打）
]

SENT = (255, 0, 255)  # 洋紅哨兵色（圖裡不會出現）

def process(src_path, out_path):
    im = Image.open(src_path).convert("RGB")
    w, h = im.size
    # 從四角 + 四邊中點灌色，thresh=80（綠底很平整，足以填滿又不越過黑框）
    seeds = [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2),
             (w // 2, 1), (w // 2, h - 2), (1, h // 2), (w - 2, h // 2)]
    for s in seeds:
        ImageDraw.floodfill(im, s, SENT, thresh=80)

    arr = np.array(im).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]

    # 哨兵色的像素 = 背景 -> 透明
    bg = (arr[..., 0] == 255) & (arr[..., 1] == 0) & (arr[..., 2] == 255)

    # 去綠邊：非背景、但偏綠的邊緣像素，把綠壓到 max(r,b)
    greenish = (~bg) & (g > r + 12) & (g > b + 12)
    g2 = g.copy()
    g2[greenish] = np.maximum(r, b)[greenish]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., 0] = r.astype(np.uint8)
    out[..., 1] = g2.astype(np.uint8)
    out[..., 2] = b.astype(np.uint8)
    out[..., 3] = np.where(bg, 0, 255).astype(np.uint8)

    rgba = Image.fromarray(out, "RGBA")

    # 裁切到實際範圍
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)

    # 補成正方形（置中），方便遊戲裡用固定尺寸繪製
    cw, ch = rgba.size
    side = max(cw, ch)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(rgba, ((side - cw) // 2, (side - ch) // 2))
    square.save(out_path)
    # 統計透明比例，方便判斷有沒有去背成功
    a = np.array(square)[..., 3]
    transparent_ratio = (a == 0).mean()
    print(f"  -> {os.path.basename(out_path)}  {side}x{side}  透明比例={transparent_ratio:.0%}")

print("開始去背...")
for src, out_name in JOBS:
    src_path = os.path.join(BASE, src)
    if not os.path.exists(src_path):
        print(f"[找不到] {src}")
        continue
    print(f"處理 {src}")
    process(src_path, os.path.join(OUT, out_name))
print("完成，輸出在:", OUT)
