# -*- coding: utf-8 -*-
"""把白底角色圖去背成透明 PNG：從邊緣連通的白色才清掉(保留角色內部白色高光)。"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage

path = sys.argv[1] if len(sys.argv) > 1 else r"d:\Claude\Projects\GAME DIY\IMAGE\sprites\demo.png"
im = Image.open(path).convert("RGB")
arr = np.array(im)
R, G, B = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
mx = np.maximum(np.maximum(R, G), B); mn = np.minimum(np.minimum(R, G), B)
white = (mn > 224) & ((mx - mn) < 22)              # 接近白/淺灰、低彩度 = 背景候選

labeled, n = ndimage.label(white)
border = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
border.discard(0)
bg = np.isin(labeled, list(border))                # 只清「碰到邊緣」的白色連通域

alpha = np.where(bg, 0, 255).astype(np.uint8)
# 羽化邊緣 1px:把背景往內縮一點點、消抗鋸齒白邊
inner = ndimage.binary_erosion(alpha > 0, iterations=1)
alpha = np.where(inner | (alpha == 0), alpha, 0).astype(np.uint8)
# 邊界半透明過渡(對非背景但偏白的邊緣像素降 alpha、再消殘白)
edge = (alpha > 0) & (~ndimage.binary_erosion(alpha > 0, iterations=2)) & (mn > 205) & ((mx - mn) < 30)
alpha[edge] = 90

out = np.dstack([arr, alpha]).astype(np.uint8)
Image.fromarray(out, "RGBA").save(path)
print(f"OK 去背完成 {path} bg像素={int(bg.sum())} 連通域={n}")
