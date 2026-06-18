# -*- coding: utf-8 -*-
"""壓縮首頁美術:四卡+背景(不透明)→JPEG縮到寬1280 q88、logo(透明)→PNG縮512。
   卡片/背景輸出.jpg(刪原.png)、logo覆蓋原.png。大幅減載入時間。"""
import os
from PIL import Image

BASE = r"d:\Claude\Projects\GAME DIY"
# (來源png, 輸出jpg) 不透明插畫
JPEGS = [
    ("IMAGE/sprites/card_whack.png", "IMAGE/sprites/card_whack.jpg"),
    ("IMAGE/sprites/card_dodge.png", "IMAGE/sprites/card_dodge.jpg"),
    ("IMAGE/sprites/card_pvz.png",   "IMAGE/sprites/card_pvz.jpg"),
    ("IMAGE/sprites/card_kpop.png",  "IMAGE/sprites/card_kpop.jpg"),
    ("IMAGE/menu_bg.png",            "IMAGE/menu_bg.jpg"),
]
for src, dst in JPEGS:
    p = os.path.join(BASE, src)
    im = Image.open(p).convert("RGB")
    w = 1280; h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    im.save(os.path.join(BASE, dst), "JPEG", quality=88, optimize=True, progressive=True)
    before = os.path.getsize(p); after = os.path.getsize(os.path.join(BASE, dst))
    os.remove(p)  # 刪原png
    print(f"{src} {before//1024}KB -> {dst} {after//1024}KB")

# logo 透明→PNG縮512
lp = os.path.join(BASE, "IMAGE/sprites/logo2.png")
im = Image.open(lp).convert("RGBA").resize((512, 512), Image.LANCZOS)
before = os.path.getsize(lp)
im.save(lp, "PNG", optimize=True)
print(f"logo2.png {before//1024}KB -> {os.path.getsize(lp)//1024}KB")
