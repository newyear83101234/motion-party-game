# 把 ChatGPT 生的「洋紅底一整張」切成一張張透明背景的小圖（貼紙、圖示）
# 洋紅底去背＋邊緣去洋紅色暈；每個物件用連通區塊找出來（先膨脹，讓同一個物件的零件黏在一起），由上到下、由左到右排序
# 用法：python tools/draw-art/cut_sheet.py <整張.png> <輸出資料夾> <邊長> 名稱1 名稱2 ...（名稱數＝要切出的張數）
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, out, size, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:]
M = np.array([255, 0, 255], float)
im = np.asarray(Image.open(src).convert("RGB")).astype(float)
m = np.minimum(im[..., 0], im[..., 2]) - im[..., 1]          # 越洋紅越大
a = np.clip(1 - (m - 40) / (200 - 40), 0, 1)                 # 0＝背景、1＝物件
a3 = np.maximum(a, 1e-3)[..., None]
col = np.clip((im - (1 - a3) * M) / a3, 0, 255)              # 半透明邊緣把洋紅色扣掉
rgba = np.dstack([col, a * 255]).astype(np.uint8)

mask = a > 0.5
lab, n = ndi.label(ndi.binary_dilation(mask, iterations=12))
objs = []
for i, sl in enumerate(ndi.find_objects(lab), 1):
    area = int((lab[sl] == i).sum())
    objs.append((area, sl, i))
objs = sorted(objs, key=lambda o: -o[0])[:len(names)]
if len(objs) < len(names):
    sys.exit(f"只找到 {len(objs)} 個物件，要 {len(names)} 個")
h = im.shape[0]
# 分排：中心 y 相近的歸同一排，排內由左到右
cent = [((o[1][0].start + o[1][0].stop) / 2, (o[1][1].start + o[1][1].stop) / 2, o) for o in objs]
cent.sort(key=lambda c: (c[0], c[1]))
rows, cur = [], [cent[0]]
for c in cent[1:]:
    if abs(c[0] - cur[-1][0]) < h * 0.12: cur.append(c)
    else: rows.append(cur); cur = [c]
rows.append(cur)
ordered = [c[2] for r in rows for c in sorted(r, key=lambda c: c[1])]
os.makedirs(out, exist_ok=True)
for name, (area, sl, i) in zip(names, ordered):
    crop = Image.fromarray(rgba[sl])
    crop.putalpha(Image.fromarray((np.asarray(crop)[..., 3] * (lab[sl] == i)).astype(np.uint8)))
    w, hh = crop.size; k = (size * 0.94) / max(w, hh)
    crop = crop.resize((max(1, round(w * k)), max(1, round(hh * k))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((size - crop.width) // 2, (size - crop.height) // 2))
    canvas.save(os.path.join(out, name + ".png"), optimize=True)
    print(name, crop.size)
