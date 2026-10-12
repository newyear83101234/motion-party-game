# Kenney 調色盤縮圖（效能體檢 10-12）：colormap.png（512²）→ colormap-128.png（128²），小島／配送站的換色畫布跟著變 128²（GPU 每張 1MB → 64KB）
# 只縮「顏色不會變」的套件：把套件裡每個 GLB 的每個 UV，用 three.js 的取樣方式（LinearFilter、ClampToEdge、flipY=false）
# 在原圖與縮圖各取一次顏色，最大差 ≤ 1（0–255）才寫檔；超過就跳過那一套（色塊裡的漸層比較陡，縮了會差 2 以上）。
# 縮法：4×4 平均（BOX）。結果要跟 js/zhuyin-hub3d.js、js/zhuyin-deliver.js 的 KIT_SMALL 清單一致。
# 用法：python tools/render3d/colormap_small.py [套件名 ...]（不給＝檢查全部有調色盤的套件，只印結果不寫檔：加 --write 才寫）
import struct, json, sys, os, glob
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "IMAGE", "zy3d", "kenney")
KITS = ["city-kit-commercial", "city-kit-suburban", "fantasy-town-kit", "pirate-kit", "watercraft-pack", "car-kit", "holiday-kit", "food-kit", "cube-pets"]
SIZE, LIMIT = 128, 1.0

def glb_uvs(path):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]; j = json.loads(b[20:20 + n]); off = 20 + n
    bl = struct.unpack("<I", b[off:off + 4])[0]; bin_ = b[off + 8:off + 8 + bl]
    out = []
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            if "TEXCOORD_0" not in p["attributes"]:
                continue
            a = j["accessors"][p["attributes"]["TEXCOORD_0"]]; bv = j["bufferViews"][a["bufferView"]]
            st = bv.get("byteStride", 8); base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
            if a.get("componentType", 5126) != 5126:
                raise ValueError("UV 不是 float：" + path)
            for i in range(a["count"]):
                out.append(struct.unpack("<ff", bin_[base + i * st:base + i * st + 8]))
    return out

def sample(img, u, v):
    H, W = img.shape[:2]
    x = np.clip(u, 0, 1) * W - 0.5; y = np.clip(v, 0, 1) * H - 0.5
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    px = lambda xx, yy: img[np.clip(yy, 0, H - 1), np.clip(xx, 0, W - 1)]
    return px(x0, y0) * (1 - fx) * (1 - fy) + px(x0 + 1, y0) * fx * (1 - fy) + px(x0, y0 + 1) * (1 - fx) * fy + px(x0 + 1, y0 + 1) * fx * fy

write = "--write" in sys.argv
kits = [k for k in sys.argv[1:] if not k.startswith("--")] or KITS
for kit in kits:
    src = Image.open(os.path.join(ROOT, kit, "Textures", "colormap.png")).convert("RGBA")
    small = src.resize((SIZE, SIZE), Image.BOX)
    uv = np.array(sorted({(round(u, 6), round(v, 6)) for g in glob.glob(os.path.join(ROOT, kit, "*.glb")) for u, v in glb_uvs(g)}))
    d = np.abs(sample(np.asarray(small).astype(float)[..., :3], uv[:, 0], uv[:, 1]) - sample(np.asarray(src).astype(float)[..., :3], uv[:, 0], uv[:, 1])).max(axis=1)
    ok = d.max() <= LIMIT
    print(f"{kit:22s} UV {len(uv):4d} 個  最大差 {d.max():.2f}  {'可以縮' if ok else '不縮（顏色會變）'}")
    if ok and write:
        out = os.path.join(ROOT, kit, "Textures", f"colormap-{SIZE}.png")
        small.save(out, optimize=True); print("   寫入", os.path.relpath(out, os.path.join(ROOT, "..", "..", "..")), os.path.getsize(out), "bytes")
