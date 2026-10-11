# -*- coding: utf-8 -*-
"""
注音小島 3D 自製模型產生器（Blender 無頭 bpy）

用法：
  blender.exe -b --factory-startup --python tools/blender/build_models.py -- [--only mole,frog]

輸出：IMAGE/zy3d/models/*.glb（21 個；qmark＝卡背問號，不進 models.json），最後會重新匯入每個 GLB 印出三角面數與尺寸。

風格：比照 Kenney Cube Pets（方身、大眼、短腿、圓角、上亮下暗漸層）。
做法：
- 所有模型共用一張自製「漸層色票貼圖」（256x256，每格 16x64 一個顏色，上亮下暗），
  跟 Kenney 的 colormap 一樣靠 UV 指到某一格來上色 → 每個模型只有 1 個材質、1 次 draw call。
- 平面著色（flat shading），貼圖內嵌在 GLB。
- 座標：Blender 裡臉朝 -Y、Z 朝上；匯出 glTF 後 = 臉朝 +Z、Y 朝上（跟 Cube Pets 一樣）。
- 每個模型底部貼地（最低點 z=0），原點在腳底中心。
"""
import bpy
import bmesh
import math
import os
import sys
import random
import tempfile
from mathutils import Vector, Matrix, Euler

PROJ = r"D:\Claude\Projects\GAME DIY"
OUT_DIR = os.path.join(PROJ, "IMAGE", "zy3d", "models")
POLAR_GLB = os.path.join(PROJ, "IMAGE", "_src", "iso", "kits", "cube-pets",
                         "Models", "GLB format", "animal-polar.glb")
BUNNY_GLB = os.path.join(PROJ, "IMAGE", "_src", "iso", "kits", "cube-pets",
                         "Models", "GLB format", "animal-bunny.glb")

# ---------------------------------------------------------------------------
# 色票：名稱 → (上方顏色, 下方顏色)，sRGB 十六進位。兩色相同 = 平塗。
# ---------------------------------------------------------------------------
PALETTE = {
    "white":       ("#fcfcfd", "#fcfcfd"),
    "eye_dark":    ("#3b3d48", "#3b3d48"),   # 眼珠（接近 Kenney 的深灰藍）
    # 地鼠
    "mole":        ("#d08a4c", "#a5623a"),
    "mole_face":   ("#fae6b0", "#f0cf8e"),
    "nose_pink":   ("#f27f96", "#e8687f"),
    "cheek":       ("#f7a7aa", "#f7a7aa"),
    "paw":         ("#f6c7a8", "#eaa98a"),   # 地鼠手掌（肉色）
    "mouth":       ("#6a2b34", "#6a2b34"),
    "tongue":      ("#f2808c", "#f2808c"),
    "star":        ("#ffdc4a", "#f7b52c"),
    # 青蛙
    "frog":        ("#7bd24f", "#4fa63c"),
    "frog_belly":  ("#eef9c4", "#d8eea0"),
    # 貓頭鷹
    "owl":         ("#c28b55", "#99663a"),
    "owl_face":    ("#f8e9cc", "#f0dab2"),
    "owl_wing":    ("#9a653d", "#774a2b"),
    "owl_eye":     ("#7cc64e", "#6ab43e"),
    "beak":        ("#f7a33a", "#f08a26"),
    "cap":         ("#3a3b45", "#25262d"),
    "gold":        ("#f6c445", "#eaa92c"),
    # 棕熊
    "bear":        ("#b57d4c", "#8d5a35"),
    "bear_muzzle": ("#f3dcb8", "#e8c99a"),
    "bear_ear":    ("#7a4a2e", "#6a3f27"),
    # 氣球
    "red":         ("#f5525a", "#c9313b"),
    "red_hi":      ("#ffb3b6", "#ffb3b6"),
    "blue":        ("#4a97f5", "#2a66c6"),
    "blue_hi":     ("#c2deff", "#c2deff"),
    "green":       ("#4bcb70", "#2b9850"),
    "green_hi":    ("#bdf3cc", "#bdf3cc"),
    "yellow":      ("#ffd54a", "#f5a623"),
    "yellow_hi":   ("#fff6c8", "#fff6c8"),
    "string":      ("#f4f4f8", "#d6d6e0"),
    # 蛋
    "egg":         ("#fff6e3", "#efd5a3"),
    "spot_pink":   ("#f593b5", "#f593b5"),
    "spot_blue":   ("#6cb8f2", "#6cb8f2"),
    "spot_green":  ("#80d46c", "#80d46c"),
    "spot_yellow": ("#f7c948", "#f7c948"),
    "crack":       ("#6e4a35", "#6e4a35"),
    # 地鼠洞（土色對齊計畫書土壁 #a8673f/#7d4a2e ≈ nature-kit dirtDark；碎土用 nature-kit dirt）
    "dirt":        ("#b0703f", "#7d4a2e"),
    "dirt_light":  ("#e38a5c", "#d27a4e"),
    "hole_dark":   ("#4a2c1c", "#22140d"),
    # 白兔（Cube Pets 兔子改色；接在最後面，舊模型的色票位置不變）
    "bunny":       ("#ffffff", "#e4e0ee"),
    "bunny_ear":   ("#f9a6c3", "#ee88ad"),
    "bunny_muzzle": ("#fff0f4", "#f8d9e2"),
    # 方塊動物（Kenney 原色）＋卡背問號
    "cat":         ("#74758c", "#5c5d71"),
    "cat_ear":     ("#8e94b0", "#7d839e"),
    "cat_eye":     ("#ffd26a", "#ffbf4d"),
    "fox":         ("#ec8a4f", "#d8733c"),
    "fox_white":   ("#fbf8fd", "#e3e0ec"),
    "fox_ear":     ("#efc09c", "#dfab85"),
    "lion":        ("#ffa443", "#f58d2a"),
    "lion_mane":   ("#ea966e", "#d77f58"),
    "lion_muzzle": ("#f3c7a3", "#e3b08d"),
    "panda":       ("#fbfbfd", "#e2e2ec"),
    "panda_dark":  ("#4c4f5e", "#3c3e4a"),
    "penguin_white": ("#fbfbfd", "#e6e6ee"),
    "penguin_dark":  ("#525566", "#41434f"),
    "qmark":       ("#ffffff", "#e9eef6"),
    # 獎勵系統：超稀有寵物
    "dino":        ("#7ccf5a", "#4fa83f"),
    "dino_belly":  ("#effac8", "#d3eda0"),
    "dino_fin":    ("#ffd24f", "#f7a62e"),
    "whale":       ("#6cb2f2", "#3f80d6"),
    "whale_belly": ("#eef7ff", "#c9def6"),
    "spout":       ("#ffffff", "#bfe7ff"),
    "dragon":      ("#b9a2f2", "#8f74da"),
    "dragon_belly": ("#fff3d8", "#f5dcb0"),
    "dragon_wing": ("#ffc6e4", "#f39ac9"),
    "horn":        ("#fff0c2", "#f2d48a"),
    "rb_red":      ("#ff6b6b", "#e94b4b"),
    "rb_orange":   ("#ffa24a", "#f0842a"),
    "rb_yellow":   ("#ffe066", "#f5c63a"),
    "rb_green":    ("#7ed66b", "#57b84a"),
    "rb_blue":     ("#5fb0f5", "#3c8de0"),
    "rb_purple":   ("#b07cf0", "#8c58dc"),
    # 配件
    "gold_light":  ("#ffe89a", "#f9cd5a"),
    "jewel_red":   ("#ff5a6e", "#d63a52"),
    "jewel_blue":  ("#5ab4ff", "#2f86e0"),
    "cape_red":    ("#ef5a66", "#c83e4b"),
    "bow_pink":    ("#ff8fb6", "#f06a98"),
    "bow_pink_dk": ("#f06a98", "#d94f80"),
    "hat_blue":    ("#6cb6ff", "#4692e6"),
    "hat_yellow":  ("#ffe066", "#f5c23a"),
    "sprout":      ("#8fd85a", "#5fb43c"),
    # 扭蛋
    "gacha_red":   ("#f4707c", "#d94a58"),
    "gacha_cream": ("#fff6e6", "#f2e2c4"),
    "cap_blue":    ("#5aa8ff", "#3a84e0"),
    "cap_purple":  ("#b07cf0", "#8c58dc"),
    "cap_gold":    ("#ffd34d", "#f2a91f"),
    "cap_pink":    ("#ff9ec2", "#f27aa6"),
    "cap_green":   ("#7ed66b", "#57b84a"),
    # 小島裝飾、彩蛋
    "stone":       ("#dcd8d0", "#bdb7ad"),
    "stone_lt":    ("#f2efea", "#e0dcd5"),
    "stone_dk":    ("#aba49a", "#8d867c"),
    "leaf":        ("#79c24e", "#559e38"),
    "flower_pink": ("#ff9ec2", "#f27aa6"),
    "flower_yellow": ("#ffe066", "#f5c63a"),
    "egg_purple":  ("#c7a6ff", "#9572e6"),
    "egg_lilac":   ("#f3e8ff", "#e2ceff"),
    "egg_gold":    ("#ffe07a", "#f2b02e"),
    "bpmf":        ("#f59a4c", "#e07a2a"),
}


def kenney_palette():
    """Cube Pets 原貼圖 4 列 x 16 欄 → 色票 k_列_欄（取格子中心色，做一點上亮下暗）"""
    path = os.path.join(PROJ, "IMAGE", "_src", "iso", "kits", "cube-pets", "Models", "GLB format", "Textures", "colormap.png")
    if not os.path.exists(path):
        return {}
    img = bpy.data.images.load(path)
    W, H = img.size
    px = list(img.pixels)
    out = {}
    hx = lambda c: "#%02x%02x%02x" % tuple(max(0, min(255, round(v * 255))) for v in c)
    for r in range(4):
        for c in range(16):
            x, y = int((c + 0.5) / 16 * W), int((1 - (r + 0.5) / 4) * H)
            j = (y * W + x) * 4
            col = px[j:j + 3]
            out[f"k_{r}_{c}"] = (hx([v * 0.92 + 0.08 for v in col]), hx([v * 0.88 for v in col]))
    bpy.data.images.remove(img)
    return out


PALETTE.update(kenney_palette())
PALETTE.update({   # 10-12 寵物換裝的新配件（接在最後面：舊色票的位置不變）
    "hat_blue_dk":  ("#5aa6f5", "#3a7ed6"),
    "flower_lilac": ("#dcc4ff", "#b48cf0"),
    "flower_coral": ("#ff8f8f", "#ef5f6c"),
    "wing_white":   ("#ffffff", "#c2d6f6"),
    "wing_pink":    ("#ffe4f1", "#f6b4d2"),
    "pack_red":     ("#ff6670", "#d9404d"),
    "pack_red_dk":  ("#d9404d", "#b8303c"),
})
NAMES = list(PALETTE)
INDEX = {n: i for i, n in enumerate(NAMES)}
IMG = 512          # 貼圖邊長
CELL_W, CELL_H = 16, 32   # 每格大小 → 32 欄 x 16 列 = 512 色（2026-10-10 從 64 色擴充；舊 GLB 各自內嵌舊色票，不受影響）
COLS = IMG // CELL_W
assert len(NAMES) <= COLS * (IMG // CELL_H)


def srgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def uv_for(name, t):
    """色票名稱 + 高度比例 t(0=底,1=頂) → UV 座標"""
    i = INDEX[name]
    col, row = i % COLS, i // COLS
    u = (col * CELL_W + CELL_W / 2) / IMG
    v = (row * CELL_H + 2 + (CELL_H - 4) * t) / IMG
    return (u, v)


def build_palette_image():
    """產生漸層色票貼圖，存成暫存 PNG（匯出 GLB 時會內嵌）"""
    px = [1.0] * (IMG * IMG * 4)
    for i, name in enumerate(NAMES):
        top, bot = srgb(PALETTE[name][0]), srgb(PALETTE[name][1])
        col, row = i % COLS, i // COLS
        for yy in range(CELL_H):
            t = min(1.0, max(0.0, (yy + 0.5 - 2) / (CELL_H - 4.0)))
            c = [bot[k] + (top[k] - bot[k]) * t for k in range(3)]
            y = row * CELL_H + yy
            for xx in range(CELL_W):
                j = (y * IMG + col * CELL_W + xx) * 4
                px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; px[j + 3] = 1.0
    img = bpy.data.images.new("zy_palette", IMG, IMG, alpha=False)
    img.pixels.foreach_set(px)
    path = os.path.join(tempfile.gettempdir(), "zy_palette.png")
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def make_material(img, name, rough):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True   # 5.x 已預設，舊版需要
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = 'Linear'
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    return m


# ---------------------------------------------------------------------------
# 矩陣小工具
# ---------------------------------------------------------------------------
def T(x, y, z):
    return Matrix.Translation((x, y, z))


def R(rx=0.0, ry=0.0, rz=0.0):
    """角度制旋轉（XYZ 順序）"""
    return Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ').to_matrix().to_4x4()


def S(sx, sy, sz):
    return Matrix.Diagonal((sx, sy, sz, 1.0))


def frame(X, Y, Z):
    """三個軸向量 → 旋轉矩陣（欄向量）"""
    return Matrix((X, Y, Z)).transposed().to_4x4()


FRONT = R(90, 0, 0)   # 把 +Z 軸轉到 -Y：用來讓圓盤／星星面向前方


# ---------------------------------------------------------------------------
# 基本形（每個回傳一個新的 bmesh，中心在原點）
# ---------------------------------------------------------------------------
def p_box(sx, sy, sz, bev=0.0, segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    if bev > 0:
        if bev < 0.05:
            segs = 1          # 小零件圓角只切一刀，省三角面
        bev = min(bev, 0.45 * min(sx, sy, sz))
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=bev, offset_type='OFFSET',
                        segments=segs, profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm


def p_cyl(r, h, n=12, r2=None, caps=True):
    """圓柱／圓台，軸向 Z；r 在底(-Z)、r2 在頂(+Z)"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=n,
                          radius1=r, radius2=(r if r2 is None else r2), depth=h)
    return bm


def p_cone(r, h, n=8):
    """尖錐（頂點在 +Z）"""
    bm = bmesh.new()
    ring = [bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), -h / 2)) for i in range(n)]
    apex = bm.verts.new((0, 0, h / 2))
    for i in range(n):
        bm.faces.new((ring[i], ring[(i + 1) % n], apex))
    bm.faces.new(list(reversed(ring)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def p_sphere(r, us=12, vs=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=us, v_segments=vs, radius=r)
    return bm


def p_ico(r, sub=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return bm


def p_star(ro, ri, h, n=5):
    """五角星（平躺在 XY、厚度沿 Z，一個尖角朝 +Y）"""
    bm = bmesh.new()
    top, bot = [], []
    for k in range(2 * n):
        a = math.pi / 2 + k * math.pi / n
        rr = ro if k % 2 == 0 else ri
        top.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), h / 2)))
        bot.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), -h / 2)))
    ct = bm.verts.new((0, 0, h / 2))
    cb = bm.verts.new((0, 0, -h / 2))
    m = 2 * n
    for k in range(m):
        k2 = (k + 1) % m
        bm.faces.new((ct, top[k], top[k2]))
        bm.faces.new((cb, bot[k2], bot[k]))
        bm.faces.new((top[k], bot[k], bot[k2], top[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


# ---------------------------------------------------------------------------
# Part：一個輸出物件（body、arm-left…），內含一個 bmesh
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name, pivot=(0, 0, 0), base=None):
        self.name = name
        self.base = base.copy() if base is not None else Matrix.Identity(4)   # 整個部件的姿勢矩陣
        self.pivot = self.base @ Vector(pivot)    # 物件原點（關節位置），世界座標
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def add(self, src, color, M=None, grad=True, zr=None):
        """把基本形 src 經 M 擺好後併入本部件；依世界高度做上亮下暗漸層"""
        M = self.base @ (M if M is not None else Matrix.Identity(4))
        src.transform(M)
        zs = [v.co.z for v in src.verts]
        z0, z1 = zr if zr else (min(zs), max(zs))
        uvl = src.loops.layers.uv.verify()
        for f in src.faces:
            for lp in f.loops:
                if grad and z1 - z0 > 1e-6:
                    t = min(1.0, max(0.0, (lp.vert.co.z - z0) / (z1 - z0)))
                else:
                    t = 0.5
                lp[uvl].uv = uv_for(color, t)
        # 複製頂點與面（保留 UV、平面著色）
        vmap = {v: self.bm.verts.new(v.co) for v in src.verts}
        for f in src.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.smooth = False
            uv_by_v = {vmap[lp.vert]: lp[uvl].uv.copy() for lp in f.loops}
            for lp in nf.loops:
                lp[self.uv].uv = uv_by_v[lp.vert]
        src.free()

    def transform(self, M):
        self.bm.transform(M)
        self.pivot = M @ self.pivot


# ---------------------------------------------------------------------------
# 常用零件
# ---------------------------------------------------------------------------
def disc(part, r, depth, pos, color, sx=1.0, sz=1.0, n=12, M=None):
    """面向前方(-Y)的扁圓盤：眼白、瞳孔、腮紅…"""
    m = T(*pos) @ (M if M is not None else Matrix.Identity(4)) @ FRONT @ S(sx, sz, 1.0)
    part.add(p_cyl(r, depth, n), color, m, grad=False)


def seg_box(part, p1, p2, width, depth, normal, color, extra=0.0):
    """沿 p1→p2 的細長方塊（裂痕、嘴線、流蘇繩）；depth 沿 normal 方向"""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    L = d.length
    X = d / L
    n = Vector(normal)
    Nn = (n - X * n.dot(X)).normalized()
    Z = X.cross(Nn)
    part.add(p_box(L + extra, depth, width), color, T(*((p1 + p2) / 2)) @ frame(X, Nn, Z), grad=False)


def seg_cyl(part, p1, p2, r, color, n=6, extra=0.0):
    """沿 p1→p2 的細圓柱（氣球線、流蘇線）"""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    q = d.normalized().to_track_quat('Z', 'Y')
    part.add(p_cyl(r, d.length + extra, n), color, T(*((p1 + p2) / 2)) @ q.to_matrix().to_4x4(), grad=False)


def add_eye(part, x, z, yf, rw, rp, iris=None, ri=0.0, look=(0.0, 0.0), szw=1.1):
    """Kenney 式大眼：白眼盤 →（虹膜）→ 深色瞳孔 → 白色反光點；yf=貼附面的 y"""
    lx, lz = look
    disc(part, rw, 0.04, (x, yf - 0.01, z), "white", sz=szw, n=14)
    if iris:
        disc(part, ri, 0.02, (x + lx * 0.6, yf - 0.035, z + lz * 0.6), iris, sz=1.05, n=14)
    disc(part, rp, 0.02, (x + lx, yf - 0.05, z + lz), "eye_dark", sz=1.1, n=12)
    disc(part, rp * 0.36, 0.02, (x + lx - rp * 0.38, yf - 0.065, z + lz + rp * 0.45), "white", n=8)


def bead_eye(part, x, z, yf, r):
    """小黑豆眼＋反光點"""
    disc(part, r, 0.04, (x, yf - 0.01, z), "eye_dark", sz=1.15, n=12)
    disc(part, r * 0.34, 0.02, (x - r * 0.35, yf - 0.035, z + r * 0.45), "white", n=8)


# ---------------------------------------------------------------------------
# 1-2. 地鼠（一般／被敲暈）
# ---------------------------------------------------------------------------
def build_mole(hit=False):
    if hit:
        W, D, H = 1.26, 1.12, 1.2      # 被敲到：身體壓扁一點
        base = R(0, 6, 0)              # 整隻歪一邊
    else:
        W, D, H = 1.2, 1.1, 1.3
        base = Matrix.Identity(4)
    s = H / 1.3
    yf = -D / 2
    body = Part("body", base=base)
    body.add(p_box(W, D, H, 0.13), "mole", T(0, 0, H / 2))
    # 淺色肚子
    body.add(p_box(0.74, 0.06, 0.42 * s, 0.05), "mole_face", T(0, yf - 0.005, 0.07 + 0.21 * s), grad=False)
    # 口鼻塊（淺色，往前凸）
    mz = 0.78 * s
    body.add(p_box(0.64, 0.2, 0.36, 0.08), "mole_face", T(0, yf - 0.08, mz))
    yfm = yf - 0.18                    # 口鼻塊正面
    # 粉紅鼻子
    body.add(p_box(0.22, 0.1, 0.14, 0.045), "nose_pink", T(0, yfm - 0.03, mz + 0.09))
    if hit:
        # 嘴巴張成 O 型＋舌頭
        disc(body, 0.07, 0.03, (0, yfm - 0.004, mz - 0.075), "mouth", sx=1.25, sz=0.95, n=10)
        disc(body, 0.04, 0.02, (0, yfm - 0.016, mz - 0.1), "tongue", sx=1.3, sz=0.7, n=8)
    else:
        # 開心張嘴＋舌頭
        body.add(p_box(0.24, 0.03, 0.13, 0.035), "mouth", T(0, yfm - 0.004, mz - 0.075), grad=False)
        body.add(p_box(0.14, 0.03, 0.045, 0.015), "tongue", T(0, yfm - 0.014, mz - 0.115), grad=False)
    # 兩顆小門牙（從嘴巴上緣垂下）
    for sx in (1, -1):
        body.add(p_box(0.075, 0.04, 0.07, 0.012), "white", T(sx * 0.042, yfm - 0.022, mz - 0.045), grad=False)
    # 眼睛
    ez = 0.79 * H
    for sx in (1, -1):
        if hit:
            # 暈眩漩渦眼：白底圓盤＋深色螺旋（左右眼鏡像）
            disc(body, 0.155, 0.04, (sx * 0.28, yf - 0.01, ez), "white", sz=1.05, n=14)
            pts = []
            turns = 3.4 * math.pi
            for k in range(23):
                th = 0.5 + (turns - 0.5) * k / 22
                rr = 0.13 * th / turns
                pts.append(Vector((sx * 0.28 + sx * rr * math.cos(th), yf - 0.04, ez + rr * math.sin(th))))
            for a, b in zip(pts, pts[1:]):
                seg_box(body, a, b, 0.024, 0.02, (0, -1, 0), "eye_dark", extra=0.014)
        else:
            bead_eye(body, sx * 0.28, ez, yf, 0.12)
        # 腮紅
        disc(body, 0.085, 0.02, (sx * 0.43, yf - 0.005, 0.66 * H), "cheek", sx=1.35, n=10)
        # 小圓耳朵（上半露出頭頂）
        disc(body, 0.15, 0.12, (sx * 0.43, -0.05, H - 0.03), "mole", n=10)
        disc(body, 0.085, 0.02, (sx * 0.43, -0.12, H - 0.01), "cheek", n=8)
    parts = [body]
    # 手臂往上舉（遊戲會在頭上畫注音牌，看起來像牠舉著）
    tilts = {1: 24, -1: 6} if hit else {1: 10, -1: 10}
    for sx in (1, -1):
        name = "arm-left" if sx > 0 else "arm-right"   # 面向 -Y，牠的左手在 +X
        piv = (sx * 0.6, -0.05, 0.62 * H)
        arm_base = base @ T(*piv) @ R(0, sx * tilts[sx], 0)
        arm = Part(name, (0, 0, 0), base=arm_base)
        arm.add(p_box(0.26, 0.28, 0.66, 0.09), "mole", T(0, 0, 0.28))
        arm.add(p_box(0.34, 0.32, 0.22, 0.09), "paw", T(0, 0, 0.66))        # 手掌
        for dx in (-0.095, 0.0, 0.095):                                      # 小爪
            arm.add(p_box(0.06, 0.07, 0.07, 0.02), "mole_face", T(dx, -0.1, 0.785), grad=False)
        parts.append(arm)
    if hit:
        # 頭上 3 顆小星星（獨立物件 stars，方便做旋轉動畫）
        stars = Part("stars", (0, 0, H + 0.32))
        for ang, dz, tilt in ((215, 0.06, 14), (-45, 0.16, -10), (55, 0.02, 20)):
            a = math.radians(ang)
            p = (0.5 * math.cos(a), 0.5 * math.sin(a), H + 0.32 + dz)
            stars.add(p_star(0.2, 0.088, 0.08), "star", T(*p) @ R(0, 0, 45) @ R(0, tilt, 0) @ FRONT)
        parts.append(stars)
    return parts


# ---------------------------------------------------------------------------
# 3-4. 青蛙（蹲坐／跳躍）
# ---------------------------------------------------------------------------
def frog_face(body, yf, ztop, zmid, mouth_open):
    """青蛙臉：頭頂兩顆眼丘＋大眼、鼻孔、嘴、腮紅（座標都是 body 的區域座標）"""
    for sx in (1, -1):
        body.add(p_box(0.46, 0.44, 0.36, 0.14), "frog", T(sx * 0.33, -0.2, ztop + 0.1))
        add_eye(body, sx * 0.33, ztop + 0.12, -0.42, 0.17, 0.105, look=(-sx * 0.02, 0.01 if mouth_open else -0.01))
        disc(body, 0.025, 0.02, (sx * 0.09, yf - 0.006, zmid + 0.2), "eye_dark", n=6)       # 鼻孔
        disc(body, 0.09, 0.02, (sx * 0.46, yf - 0.03, zmid - 0.04), "cheek", sx=1.3, n=10)  # 腮紅（蓋在肚子前）
    if mouth_open:
        body.add(p_box(0.42, 0.04, 0.2, 0.06), "mouth", T(0, yf - 0.02, zmid + 0.0), grad=False)
        body.add(p_box(0.28, 0.04, 0.08, 0.03), "tongue", T(0, yf - 0.026, zmid - 0.06), grad=False)
    else:
        # 微笑線：中段＋兩端上揚
        y = yf - 0.012
        pts = [(-0.36, zmid + 0.05), (-0.2, zmid + 0.0), (0.2, zmid + 0.0), (0.36, zmid + 0.05)]
        for (x1, z1), (x2, z2) in zip(pts, pts[1:]):
            seg_box(body, (x1, y, z1), (x2, y, z2), 0.035, 0.03, (0, -1, 0), "mouth", extra=0.03)


def build_frog(jump=False):
    parts = []
    if not jump:
        W, D, H, z0 = 1.3, 1.15, 0.95, 0.16
        yf = -D / 2
        body = Part("body")
        body.add(p_box(W, D, H, 0.13), "frog", T(0, 0, z0 + H / 2))
        body.add(p_box(0.76, 0.06, 0.4, 0.06), "frog_belly", T(0, yf - 0.005, z0 + 0.24))
        frog_face(body, yf, z0 + H, z0 + 0.6 * H, False)
        parts.append(body)
        for sx in (1, -1):
            side = "left" if sx > 0 else "right"
            # 前腳：短手＋扁平腳掌
            fl = Part("leg-front-" + side, (sx * 0.32, -0.36, z0 + 0.15))
            fl.add(p_box(0.2, 0.2, 0.3, 0.06), "frog", T(sx * 0.33, -0.4, 0.17))
            fl.add(p_box(0.34, 0.3, 0.08, 0.035), "frog", T(sx * 0.36, -0.5, 0.04), grad=False)
            for dx in (-0.11, 0.0, 0.11):
                fl.add(p_box(0.08, 0.07, 0.07, 0.025), "frog", T(sx * 0.36 + dx, -0.66, 0.035), grad=False)
            parts.append(fl)
            # 後腳：摺起的大腿＋往前的腳掌
            bl = Part("leg-back-" + side, (sx * 0.6, 0.15, z0 + 0.25))
            bl.add(p_box(0.36, 0.74, 0.46, 0.14), "frog", T(sx * 0.66, 0.1, 0.28))
            bl.add(p_box(0.4, 0.5, 0.08, 0.035), "frog", T(sx * 0.74, -0.3, 0.04), grad=False)
            for dx in (-0.12, 0.0, 0.12):
                bl.add(p_box(0.08, 0.07, 0.07, 0.025), "frog", T(sx * 0.74 + dx, -0.58, 0.035), grad=False)
            parts.append(bl)
        return parts

    # 跳躍：身體往後仰、張嘴、手張開、後腳伸直往後下方
    c = Vector((0, 0, 1.2))
    Bb = T(*c) @ R(-14, 0, 0)        # body 區域座標 → 世界（臉朝上仰 14 度）
    W, D, H = 1.22, 1.1, 1.05
    yf = -D / 2
    body = Part("body", base=Bb)
    body.add(p_box(W, D, H, 0.13), "frog")
    body.add(p_box(0.74, 0.06, 0.38, 0.06), "frog_belly", T(0, yf - 0.005, -0.28))
    frog_face(body, yf, H / 2, 0.08, True)
    parts.append(body)
    for sx in (1, -1):
        side = "left" if sx > 0 else "right"
        # 前手：往外上方張開，手掌攤開（3 指）
        arm = Part("leg-front-" + side, (sx * 0.58, -0.15, -0.05), base=Bb)
        A = T(sx * 0.58, -0.15, -0.05) @ R(0, -sx * 32, 0)
        arm.add(p_box(0.5, 0.18, 0.18, 0.06), "frog", A @ T(sx * 0.25, 0, 0))
        arm.add(p_box(0.24, 0.08, 0.22, 0.04), "frog", A @ T(sx * 0.55, -0.02, 0.0), grad=False)
        for k, ang in enumerate((-30, 0, 30)):
            arm.add(p_box(0.06, 0.06, 0.14, 0.02), "frog",
                    A @ T(sx * 0.55, -0.02, 0.0) @ R(0, sx * ang, 0) @ T(0, 0, 0.15), grad=False)
        parts.append(arm)
        # 後腳：伸直往後下方，腳掌朝後
        leg = Part("leg-back-" + side, (sx * 0.36, 0.3, -0.5), base=Bb)
        L = T(sx * 0.36, 0.3, -0.5) @ R(30, -sx * 8, 0)
        leg.add(p_box(0.32, 0.34, 0.62, 0.1), "frog", L @ T(0, 0, -0.28))
        leg.add(p_box(0.4, 0.1, 0.38, 0.04), "frog", L @ T(0, 0.05, -0.72), grad=False)   # 腳掌順著腿往後下
        for dx in (-0.13, 0.0, 0.13):
            leg.add(p_box(0.09, 0.08, 0.09, 0.025), "frog", L @ T(dx, 0.05, -0.93), grad=False)
        parts.append(leg)
    return parts


# ---------------------------------------------------------------------------
# 5. 貓頭鷹嚮導（學士帽）
# ---------------------------------------------------------------------------
def build_owl():
    W, D, H, z0 = 1.2, 1.1, 1.35, 0.15
    yf = -D / 2
    top = z0 + H
    body = Part("body")
    body.add(p_box(W, D, H, 0.12), "owl", T(0, 0, z0 + H / 2))
    ez = z0 + 0.88
    for sx in (1, -1):
        disc(body, 0.31, 0.05, (sx * 0.27, yf - 0.005, ez), "owl_face", n=16)     # 臉盤（兩圓相疊）
        add_eye(body, sx * 0.27, ez, yf - 0.03, 0.235, 0.1, iris="owl_eye", ri=0.165,
                look=(-sx * 0.015, -0.01))
        # 耳羽（從帽簷下往外翹）
        body.add(p_box(0.16, 0.24, 0.26, 0.05), "owl_wing", T(sx * 0.52, -0.05, top - 0.02) @ R(0, sx * 28, 0))
    # 小喙：菱形四角錐朝前
    body.add(p_cone(0.1, 0.2, 4), "beak", T(0, yf - 0.09, z0 + 0.66) @ R(12, 0, 0) @ FRONT @ R(0, 0, 45) @ S(0.8, 0.8, 1))
    # 肚子＋三個羽毛斑
    body.add(p_box(0.78, 0.05, 0.42, 0.04), "owl_face", T(0, yf - 0.005, z0 + 0.33), grad=False)
    for x, z in ((-0.17, 0.42), (0.17, 0.42), (0.0, 0.27)):
        body.add(p_box(0.09, 0.03, 0.09, 0.01), "owl_wing", T(x, yf - 0.035, z0 + z) @ R(0, 45, 0), grad=False)
    parts = [body]
    for sx in (1, -1):
        side = "left" if sx > 0 else "right"
        wing = Part("wing-" + side, (sx * 0.6, 0.05, z0 + 1.0))
        wing.add(p_box(0.12, 0.66, 0.8, 0.05), "owl_wing",
                 T(sx * 0.6, 0.05, z0 + 1.0) @ R(0, -sx * 10, 0) @ T(sx * 0.05, 0, -0.38))
        parts.append(wing)
        leg = Part("leg-" + side, (sx * 0.25, -0.2, z0))
        leg.add(p_box(0.28, 0.24, 0.15, 0.05), "beak", T(sx * 0.25, -0.2, 0.075))
        for dx in (-0.09, 0.0, 0.09):
            leg.add(p_box(0.07, 0.12, 0.08, 0.025), "beak", T(sx * 0.25 + dx, -0.36, 0.04), grad=False)
        parts.append(leg)
    # 學士帽（獨立物件 hat）：帽身＋方頂＋金鈕扣＋流蘇（掛在左前角）
    hb = T(0, 0, top) @ R(4, -6, 0)
    hat = Part("hat", (0, 0, 0), base=hb)
    hat.add(p_box(0.84, 0.8, 0.24, 0.05), "cap", T(0, 0, 0.06))
    hat.add(p_box(1.36, 1.36, 0.07, 0.02), "cap", T(0, 0, 0.215), grad=False)
    hat.add(p_cyl(0.075, 0.045, 10), "gold", T(0, 0, 0.27), grad=False)
    cx, cy = -0.64, -0.64
    seg_box(hat, (0, 0, 0.262), (cx, cy, 0.262), 0.04, 0.025, (0, 0, 1), "gold", extra=0.03)
    seg_cyl(hat, (cx, cy, 0.26), (cx, cy, -0.06), 0.022, "gold", n=6)
    hat.add(p_cyl(0.075, 0.18, 8, r2=0.03), "gold", T(cx, cy, -0.13))
    parts.append(hat)
    return parts


# ---------------------------------------------------------------------------
# 6. 棕熊（Cube Pets 北極熊改色，保留 body＋4 腿與物件名）
# ---------------------------------------------------------------------------
PET_DIR = os.path.join(PROJ, "IMAGE", "_src", "iso", "kits", "cube-pets", "Models", "GLB format")
# 每隻的設定（座標＝Blender 世界座標：臉朝 -Y、Z 朝上，x 正負對稱）
#   cells：原貼圖格子 → 色票；body：其餘的面；muzzle：(色票, y 門檻) 臉上往前凸的面歸口鼻
#   erase：(格子, 區域 |x|0,|x|1,z0,z1, 最前 y, 塗成) 把舊眼睛塗回臉色（狐狸／獅子的眼睛半閉）
#   eyes：新圓眼 (x, z, 眼白半徑, 瞳孔半徑)；eyes_auto：在這些色票的眼圈上自動找中心（熊貓）
#   hl：在舊眼珠上加反光點 (色票, 區域)；mouth：(x, z, 半徑) 微笑弧最低點；cheeks：腮紅中心 (x, z)
PETS = {
    "bear": dict(src="animal-polar", cells={(3, 15): "eye_dark", (2, 1): "bear_ear"}, body="bear", muzzle=("bear_muzzle", -0.64),
                 grad=("bear", "bear_muzzle"), hl=(("eye_dark",), (0.06, 0.4, 0.75, 1.1, -0.70)), mouth=(0.0, 0.6, 0.05), cheeks=(0.41, 0.72)),
    "bunny": dict(src="animal-bunny", cells={(3, 15): "eye_dark", (2, 3): "white", (3, 1): "nose_pink", (3, 5): "bunny_ear", (2, 7): "bunny_muzzle"},
                  body="bunny", grad=("bunny", "bunny_muzzle"), flat=False, hl=(("eye_dark",), (0.06, 0.4, 0.75, 1.1, -0.70)), mouth=(0.0, 0.63, 0.045), cheeks=(0.4, 0.72)),
    "cat": dict(src="animal-cat", cells={(3, 15): "eye_dark", (2, 1): "cat_ear", (2, 15): "cat_eye"}, body="cat", grad=("cat",), flat=False,
                hl=(("eye_dark",), (0.08, 0.4, 0.78, 1.06, -0.70)), cheeks=(0.43, 0.7)),
    "fox": dict(src="animal-fox", cells={(3, 15): "eye_dark", (2, 3): "fox_white", (3, 5): "fox_ear"}, body="fox", grad=("fox", "fox_white"), flat=False,
                erase=({(2, 3), (3, 15)}, (0.06, 0.45, 0.74, 1.12, -0.68), "fox"), eyes=[(0.2, 0.92, 0.135, 0.085)], mouth=(0.0, 0.66, 0.045), cheeks=(0.43, 0.72)),
    "lion": dict(src="animal-lion", cells={(3, 15): "eye_dark", (2, 5): "lion_mane", (3, 5): "lion_muzzle", (2, 3): "white"}, body="lion",
                 grad=("lion", "lion_mane", "lion_muzzle"), flat=False, erase=({(2, 3), (3, 15)}, (0.1, 0.45, 0.8, 1.18, -0.68), "lion"),
                 eyes=[(0.2, 0.98, 0.13, 0.082)], cheeks=(0.31, 0.73)),
    "panda": dict(src="animal-panda", cells={(3, 15): "panda_dark"}, body="panda", grad=("panda",), flat=False,
                  eyes_auto=(("panda_dark",), (0.08, 0.45, 0.78, 1.2, -0.70), 0.105, 0.072), mouth=(0.0, 0.64, 0.045), cheeks=(0.44, 0.72)),
    "penguin": dict(src="animal-penguin", cells={(3, 7): "beak", (2, 3): "penguin_white"}, body="penguin_dark", grad=("penguin_white", "penguin_dark"), flat=False,
                    hl_at=(0.183, 0.924, 0.12, 0.09),   # 企鵝頭的深色面太多，自動找會抓錯 → 直接給位置
                    cheeks=(0.33, 0.74)),
}


# 稀有 17 隻（自動模式）：new_eyes＝換成張開的圓眼；hl＝原本是黑豆眼，只加反光點；mouth＝微笑最低點；cheeks＝腮紅
HL = (("k_3_15",), (0.06, 0.42, 0.8, 1.12, -0.70))
def _auto(src, **kw):
    d = dict(src=src, auto=True, flat=False, cheeks=(0.42, 0.72))
    d.update(kw)
    return d
PETS.update({
    "dog":      _auto("animal-dog", new_eyes=True, mouth=(0.0, 0.745, 0.05)),
    "chick":    _auto("animal-chick", hl=HL, cheeks=(0.41, 0.74)),
    "pig":      _auto("animal-pig", new_eyes=True, mouth=(0.0, 0.64, 0.045)),
    "cow":      _auto("animal-cow", new_eyes=True, mouth=(0.0, 0.6, 0.045), cheeks=(0.44, 0.72)),
    "monkey":   _auto("animal-monkey", new_eyes=True, eye_at=(0.2, 0.9, 0.14, 0.088)),
    "koala":    _auto("animal-koala", new_eyes=True, eye_at=(0.2, 0.9, 0.14, 0.088), mouth=(0.0, 0.53, 0.045)),
    "giraffe":  _auto("animal-giraffe", new_eyes=True, mouth=(0.0, 0.66, 0.045), cheeks=(0.44, 0.72)),
    "tiger":    _auto("animal-tiger", new_eyes=True),
    "deer":     _auto("animal-deer", new_eyes=True, mouth=(0.0, 0.62, 0.045)),
    "parrot":   _auto("animal-parrot", new_eyes=True, eye_at=(0.2, 0.9, 0.14, 0.088), cheeks=(0.41, 0.74)),
    "bee":      _auto("animal-bee", hl=HL, cheeks=(0.4, 0.74)),
    "crab":     _auto("animal-crab", hl=HL, cheeks=(0.4, 0.74)),
    "beaver":   _auto("animal-beaver", new_eyes=True),
    "hog":      _auto("animal-hog", new_eyes=True, mouth=(0.0, 0.58, 0.045), cheeks=(0.47, 0.72)),
    "polar":    _auto("animal-polar", hl=(("k_3_15",), (0.06, 0.4, 0.75, 1.1, -0.70)), mouth=(0.0, 0.6, 0.05), cheeks=(0.41, 0.72)),
    "caterpillar": _auto("animal-caterpillar", hl=HL, cheeks=(0.4, 0.7)),
    "elephant": _auto("animal-elephant", new_eyes=True, eye_at=(0.19, 0.84, 0.13, 0.085), erase_zone=(0.43, 0.68, 1.02), cheeks=(0.47, 0.7)),
})


def pet_cat(spec):
    if spec.get("auto"):                            # 顏色直接用 Kenney 原貼圖（k_列_欄）
        rec = spec.get("recolor", {})
        return lambda ob, cell, c: rec.get(cell, f"k_{min(3, max(0, cell[0]))}_{min(15, max(0, cell[1]))}")
    def f(ob, cell, c):
        er = spec.get("erase")
        if er and ob.name == "body" and cell in er[0]:
            x0, x1, z0, z1, ymin = er[1]
            if x0 <= abs(c.x) <= x1 and z0 <= c.z <= z1 and c.y >= ymin:
                return er[2]
        if cell in spec["cells"]:
            return spec["cells"][cell]
        mz = spec.get("muzzle")
        if mz and ob.name == "body" and c.y < mz[1]:
            return mz[0]
        return spec["body"]
    return f


def build_pet(name, mat):
    s = PETS[name]
    grad = s.get("grad") or tuple(k for k in PALETTE if k.startswith("k_"))
    recolor_pet(mat, os.path.join(PET_DIR, s["src"] + ".glb"), s["src"], name, pet_cat(s), grad, flat=s.get("flat", True), spec=s)


def build_bear(mat):
    build_pet("bear", mat)


def build_bunny(mat):
    build_pet("bunny", mat)


def front_y(bm, mw, x, z):
    """(x, z) 那一點臉面的 y（取朝前的面裡最前面的那片）"""
    best = None
    for f in bm.faces:
        n = (mw.to_3x3() @ f.normal)
        if n.y > -0.6:
            continue
        ps = [mw @ v.co for v in f.verts]
        if min(p.x for p in ps) - 0.004 <= x <= max(p.x for p in ps) + 0.004 and min(p.z for p in ps) - 0.004 <= z <= max(p.z for p in ps) + 0.004:
            y = sum(p.y for p in ps) / len(ps)
            best = y if best is None else min(best, y)
    if best is None:                                  # 那一點沒有朝前的面（臉不平的寵物）→ 用標準臉面
        print(f"[front_y] ({x:.2f},{z:.2f}) 找不到臉面，用 -0.635")
        best = -0.635
    return best


def zone_boxes(bm, mw, cats, want, zone):
    """want 色票、落在 zone 裡的臉面 → 左右各自的外框 (cx, cz, 半寬, 半高, 最前 y)"""
    x0, x1, z0, z1, ymin = zone
    out = {}
    for f, cat in cats.items():
        if cat not in want:
            continue
        c = mw @ f.calc_center_median()
        if not (x0 <= abs(c.x) <= x1 and z0 <= c.z <= z1 and ymin <= c.y <= -0.55):
            continue
        for v in f.verts:
            p = mw @ v.co
            b = out.setdefault(1 if c.x > 0 else -1, [9, -9, 9, -9, 9])
            b[0] = min(b[0], p.x); b[1] = max(b[1], p.x); b[2] = min(b[2], p.z); b[3] = max(b[3], p.z); b[4] = min(b[4], p.y)
    return {sx: ((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[1] - b[0]) / 2, (b[3] - b[2]) / 2, b[4]) for sx, b in out.items()}


def smile(part, x, z, r, y):
    """微笑弧：(x, z) 是最低點"""
    pts = [(x + r * math.cos(math.radians(a)), y, z + r + r * math.sin(math.radians(a))) for a in (205, 237, 270, 303, 335)]
    for p1, p2 in zip(pts, pts[1:]):
        seg_box(part, p1, p2, 0.024, 0.02, (0, -1, 0), "mouth", extra=0.012)


def merge_into(bm, uvl, mw, tmp):
    tmp.bm.transform(mw.inverted())
    tuv = tmp.uv
    vmap = {v: bm.verts.new(v.co) for v in tmp.bm.verts}
    for f in tmp.bm.faces:
        try:
            nf = bm.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            continue
        nf.smooth = False
        uvs = {vmap[lp.vert]: lp[tuv].uv.copy() for lp in f.loops}
        for lp in nf.loops:
            lp[uvl].uv = uvs[lp.vert]
    tmp.bm.free()


def erase_old_eyes(bm, mw, cats, spec):
    """Kenney 半閉眼：臉面（y≈-0.63）眼區裡的眼白／瞳孔面 → 改成眼區周圍臉面最多的顏色"""
    x1, z0, z1 = spec.get("erase_zone", (0.43, 0.76, 1.12))
    eye_cats = spec.get("eye_cats", ("k_2_3", "k_3_15"))
    on_plane = lambda c: abs(c.y + 0.63) < 0.03
    cand, ring = [], {}
    for f, cat in cats.items():
        c = mw @ f.calc_center_median()
        if not on_plane(c):
            continue
        if cat in eye_cats and abs(c.x) <= x1 and z0 <= c.z <= z1:
            cand.append(f)
        elif abs(c.x) <= 0.62 and z0 - 0.25 <= c.z <= z1 + 0.2:
            ring[cat] = ring.get(cat, 0.0) + f.calc_area()
    if not cand or not ring:
        return
    tgt = max(ring, key=ring.get)
    print(f"[erase] {len(cand)} 個舊眼睛面 → {tgt}")
    for f in cand:
        cats[f] = tgt


def recolor_pet(mat, glb, src_name, name, classify, grad_cats, flat=True, spec=None):
    """匯入 Cube Pets 原檔 → 依原貼圖格子把每個面換成自製色票 → 臉上加眼睛反光／圓眼、嘴、腮紅"""
    spec = spec or {}
    imgs_before = set(bpy.data.images)
    bpy.ops.import_scene.gltf(filepath=glb)
    src_img = next(i for i in bpy.data.images if i not in imgs_before)
    for ob in list(bpy.data.objects):
        if ob.type == 'EMPTY' and ob.name.startswith(src_name):
            ob.name = name
    for ob in [o for o in bpy.data.objects if o.type == 'MESH']:
        me = ob.data
        bm = bmesh.new()
        bm.from_mesh(me)
        uvl = bm.loops.layers.uv.active
        mw = ob.matrix_world
        cats = {}
        for f in bm.faces:
            us = [lp[uvl].uv for lp in f.loops]
            u = sum(x.x for x in us) / len(us)
            v = sum(x.y for x in us) / len(us)
            cell = (int((1 - v) * 4), int(u * 16))
            cats[f] = classify(ob, cell, mw @ f.calc_center_median())
        if ob.name == "body" and spec.get("new_eyes"):
            erase_old_eyes(bm, mw, cats, spec)
        # 每一類用自己的高度範圍做漸層
        zr = {}
        for f, cat in cats.items():
            for vtx in f.verts:
                z = (mw @ vtx.co).z
                lo, hi = zr.get(cat, (9e9, -9e9))
                zr[cat] = (min(lo, z), max(hi, z))
        for f, cat in cats.items():
            lo, hi = zr[cat]
            grad = cat in grad_cats
            for lp in f.loops:
                z = (mw @ lp.vert.co).z
                t = (z - lo) / (hi - lo) if grad and hi - lo > 1e-6 else 0.5
                lp[uvl].uv = uv_for(cat, t)
            if flat:
                f.smooth = False   # 白兔不要：平面著色在白色上會露出三角面斜線
        if ob.name == "body":
            tmp = Part("tmp")
            if spec.get("hl"):                        # 舊眼珠上加白色反光點
                for sx, (cx, cz, hw, hh, fy) in zone_boxes(bm, mw, cats, *spec["hl"]).items():
                    print(f"[{name}] eye {sx}: center=({cx:.3f},{cz:.3f}) half=({hw:.3f},{hh:.3f}) front_y={fy:.3f}")
                    disc(tmp, min(hw, hh) * 0.36, 0.02, (cx - hw * 0.3, fy - 0.006, cz + hh * 0.35), "white", n=8)
            if spec.get("hl_at"):
                x, z, hw, hh = spec["hl_at"]
                for sx in (1, -1):
                    fy = front_y(bm, mw, sx * x, z)
                    disc(tmp, min(hw, hh) * 0.36, 0.02, (sx * x - hw * 0.3, fy - 0.03, z + hh * 0.35), "white", n=8)
            eyes = [(sx * x, z, rw, rp) for (x, z, rw, rp) in spec.get("eyes", []) for sx in (1, -1)]
            if spec.get("new_eyes"):
                x, z, rw, rp = spec.get("eye_at", (0.2, 0.93, 0.14, 0.088))
                eyes += [(x, z, rw, rp), (-x, z, rw, rp)]
            if spec.get("eyes_auto"):
                want, zone, rw, rp = spec["eyes_auto"]
                eyes += [(cx, cz, rw, rp) for (cx, cz, hw, hh, fy) in zone_boxes(bm, mw, cats, want, zone).values()]
            for (x, z, rw, rp) in eyes:                # 新的圓眼：白眼盤＋大瞳孔＋反光點（瞳孔稍微往鼻子看）
                fy = front_y(bm, mw, x, z)
                print(f"[{name}] new eye ({x:.3f},{z:.3f}) face_y={fy}")
                add_eye(tmp, x, z, fy, rw, rp, look=(-0.012 if x > 0 else 0.012, -0.008), szw=1.06)
            if spec.get("mouth"):
                x, z, r = spec["mouth"]
                fy = front_y(bm, mw, x, z)
                print(f"[{name}] mouth ({x:.3f},{z:.3f}) face_y={fy}")
                smile(tmp, x, z, r, fy - 0.012)
            if spec.get("cheeks"):
                cx, cz = spec["cheeks"]
                for sx in (1, -1):
                    fy = front_y(bm, mw, sx * cx, cz)
                    disc(tmp, 0.075, 0.014, (sx * cx, fy - 0.006, cz), "cheek", sx=1.3, sz=0.82, n=14)
            merge_into(bm, uvl, mw, tmp)
        bm.to_mesh(me)
        bm.free()
        me.materials.clear()
        me.materials.append(mat)
    # 移除原本的 colormap 材質與貼圖（改用自製色票）
    for m in list(bpy.data.materials):
        if m.name.startswith("colormap"):
            bpy.data.materials.remove(m)
    bpy.data.images.remove(src_img)


def build_qmark(mat):
    """卡背用的 3D「?」：Blender 文字物件擠出＋導角 → 網格；站立、面朝前(-Y)、底部貼地"""
    bpy.ops.object.text_add(location=(0, 0, 0))
    ob = bpy.context.object
    cu = ob.data
    cu.body = "?"
    # 圓體粗字（Arial Rounded MT Bold）：上半圓弧＋下方圓點，小孩一眼認得；沒有就退回內建字型
    for fp in (r"C:\Windows\Fonts\ARLRDBD.TTF", r"C:\Windows\Fonts\segoeuib.ttf"):
        if os.path.exists(fp):
            cu.font = bpy.data.fonts.load(fp)
            break
    cu.size = 1.6
    cu.extrude = 0.16
    cu.bevel_depth = 0.085   # 導角厚一點＝筆畫變粗（小孩一眼認得出問號）
    cu.bevel_resolution = 2
    cu.align_x = 'CENTER'
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.object
    ob.name = "qmark"
    ob.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    bm = bmesh.new()
    bm.from_mesh(me)
    zs = [v.co.z for v in bm.verts]
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    off = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))
    for v in bm.verts:
        v.co -= off
    z0, z1 = 0.0, max(zs) - min(zs)
    uvl = bm.loops.layers.uv.active
    for f in bm.faces:
        f.smooth = False
        for lp in f.loops:
            lp[uvl].uv = uv_for("qmark", (lp.vert.co.z - z0) / (z1 - z0))
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(mat)


# ---------------------------------------------------------------------------
# 7. 氣球（四色）
# ---------------------------------------------------------------------------
def build_balloon(color):
    R0, ZS = 0.5, 1.15
    string_top = 0.66
    cz = string_top + 0.06 + R0 * ZS      # 氣球中心高度（線底 z=0）
    ball = Part("balloon", (0, 0, cz))
    bm = p_sphere(R0, 12, 9)
    for v in bm.verts:
        zn = v.co.z / R0
        f = 1.0 - 0.24 * max(0.0, -zn) ** 1.7     # 下半部收窄成水滴形
        v.co = Vector((v.co.x * f, v.co.y * f, v.co.z * ZS))
    ball.add(bm, color, T(0, 0, cz))
    # 打結（下寬上窄的小圓台＋一圈）
    kz = cz - R0 * ZS
    ball.add(p_cyl(0.085, 0.1, 8, r2=0.035), color, T(0, 0, kz - 0.02))
    ball.add(p_cyl(0.05, 0.035, 8), color, T(0, 0, kz - 0.08), grad=False)
    # 反光：在氣球左上前方貼一片亮色橢圓（從等角相機看在左上）
    d = Vector((-0.1, -0.75, 0.66)).normalized()
    p = Vector((d.x * R0, d.y * R0, d.z * R0 * ZS))
    n = Vector((p.x / R0 ** 2, p.y / R0 ** 2, p.z / (R0 * ZS) ** 2)).normalized()
    up = (Vector((0, 0, 1)) - n * n.z).normalized()
    side = n.cross(up)
    ball.add(p_sphere(0.1, 8, 6), color + "_hi",
             T(0, 0, cz) @ T(*(p - n * 0.012)) @ frame(side, n, up) @ S(0.75, 0.25, 1.35), grad=False)
    # 一條短線（有點彎）
    string = Part("string", (0, 0, string_top))
    pts = [(0, 0, kz - 0.09), (0.04, 0.0, 0.45), (-0.035, 0.0, 0.22), (0.02, 0.0, 0.0)]
    for a, b in zip(pts, pts[1:]):
        seg_cyl(string, a, b, 0.016, "string", n=5, extra=0.02)
    return [ball, string]


# ---------------------------------------------------------------------------
# 8. 蛋（斑點版／裂痕版）
# ---------------------------------------------------------------------------
EGG_R, EGG_Z = 0.5, 1.27


def egg_point(theta, phi):
    """球面角度 → 蛋殼表面點（底部 z=0）"""
    co = Vector((math.cos(phi) * math.cos(theta), math.cos(phi) * math.sin(theta), math.sin(phi))) * EGG_R
    zn = co.z / EGG_R
    f = 1.0 - 0.13 * zn - 0.06 * max(0.0, zn) ** 2   # 上窄下寬
    return Vector((co.x * f, co.y * f, co.z * EGG_Z + EGG_R * EGG_Z))


def egg_normal(theta, phi):
    e = 1e-3
    a = egg_point(theta + e, phi) - egg_point(theta - e, phi)
    b = egg_point(theta, phi + e) - egg_point(theta, phi - e)
    n = a.cross(b).normalized()
    p = egg_point(theta, phi)
    if n.dot(p - Vector((0, 0, EGG_R * EGG_Z))) < 0:
        n = -n
    return n


CRACK_ZN = 0.3   # 裂痕高度（sin(phi)）


def build_egg(crack=False):
    egg = Part("shell")
    bm = p_sphere(EGG_R, 14, 11)
    for v in bm.verts:
        zn = v.co.z / EGG_R
        f = 1.0 - 0.13 * zn - 0.06 * max(0.0, zn) ** 2
        v.co = Vector((v.co.x * f, v.co.y * f, v.co.z * EGG_Z + EGG_R * EGG_Z))
    egg.add(bm, "egg")
    # 彩色斑點：費氏球面分佈（固定排列，兩顆蛋一模一樣），避開裂痕帶
    cols = ["spot_pink", "spot_blue", "spot_green", "spot_yellow"]
    N = 22
    k = 0
    for i in range(N):
        zn = 1 - 2 * (i + 0.5) / N
        if abs(zn) > 0.8 or abs(zn - CRACK_ZN) < 0.13:
            continue
        theta = i * math.pi * (3 - math.sqrt(5)) - math.pi / 4
        phi = math.asin(zn)
        p = egg_point(theta, phi)
        n = egg_normal(theta, phi)
        r = 0.065 + 0.03 * ((i * 7) % 5) / 4
        q = n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        egg.add(p_cyl(r, 0.03, 10), cols[k % 4], T(*(p - n * 0.006)) @ q, grad=False)
        k += 1
    if crack:
        # 鋸齒裂痕：繞前半圈（相機那側），上下交錯
        pts = []
        steps = 19
        for i in range(steps):
            th = math.radians(-175 + 270 * i / (steps - 1))
            zn = CRACK_ZN + (0.075 if i % 2 == 0 else -0.075)
            ph = math.asin(zn)
            pts.append((egg_point(th, ph), egg_normal(th, ph)))
        for (p1, n1), (p2, n2) in zip(pts, pts[1:]):
            nm = (n1 + n2).normalized()
            seg_box(egg, p1 + nm * 0.004, p2 + nm * 0.004, 0.045, 0.04, nm, "crack", extra=0.04)
    return [egg]


# ---------------------------------------------------------------------------
# 9. 地鼠洞
# ---------------------------------------------------------------------------
def build_hole():
    hole = Part("mound")
    rnd = random.Random(7)
    N = 20
    IRX, IRY = 0.8, 0.7          # 洞口（內壁）半徑：地鼠身寬 1.2 放得進去
    ORX, ORY = 1.3, 1.16         # 土堆外緣
    # 斜坡環：外緣貼地、內緣抬高到 0.2
    bm = bmesh.new()
    outer = [bm.verts.new((ORX * math.cos(2 * math.pi * i / N), ORY * math.sin(2 * math.pi * i / N), 0.0)) for i in range(N)]
    inner = [bm.verts.new((IRX * math.cos(2 * math.pi * i / N), IRY * math.sin(2 * math.pi * i / N), 0.2)) for i in range(N)]
    for i in range(N):
        j = (i + 1) % N
        f = bm.faces.new((outer[i], outer[j], inner[j], inner[i]))
    bm.normal_update()
    flip = [f for f in bm.faces if f.normal.z < 0]
    if flip:
        bmesh.ops.reverse_faces(bm, faces=flip)
    hole.add(bm, "dirt", zr=(0.0, 0.34))
    # 內壁（法線朝內，從洞口看得到後側的壁）
    wall = p_cyl(1.0, 0.21, N, caps=False)
    for v in wall.verts:
        v.co = Vector((v.co.x * IRX, v.co.y * IRY, v.co.z))
    bmesh.ops.reverse_faces(wall, faces=wall.faces[:])
    hole.add(wall, "hole_dark", T(0, 0, 0.105))
    # 洞底（深色，貼地略高一點，避免被島的地面蓋住）
    flo = p_cyl(1.0, 0.02, N)
    for v in flo.verts:
        v.co = Vector((v.co.x * IRX * 1.02, v.co.y * IRY * 1.02, v.co.z))
    hole.add(flo, "hole_dark", T(0, 0, 0.012), grad=False)
    # 一圈蓬鬆土塊
    LR, LRY = 1.03, 0.92
    n_l = 12
    for i in range(n_l):
        a = 2 * math.pi * i / n_l + math.radians(rnd.uniform(-6, 6))
        r = 0.27 + rnd.uniform(-0.04, 0.05)
        lump = p_ico(r, 1)
        p = Vector((LR * math.cos(a), LRY * math.sin(a), 0.16 + rnd.uniform(-0.01, 0.03)))
        hole.add(lump, "dirt", T(*p) @ R(0, 0, math.degrees(a)) @ S(1.0, 1.35, 0.62), zr=(0.0, 0.36))
    # 散落碎土（nature-kit 的亮土色）
    for i in range(8):
        a = rnd.uniform(0, 2 * math.pi)
        rr = rnd.uniform(1.0, 1.38)
        sz = rnd.uniform(0.08, 0.13)
        p = (rr * math.cos(a) * 1.0, rr * math.sin(a) * 0.9, 0.0)
        # 在土堆上的碎土要放到土堆表面高度；外圍的就躺在地上
        k = (rr - LR) / 0.3
        zc = 0.16 + 0.17 * math.sqrt(1 - k * k) + 0.02 if abs(k) < 1 else sz * 0.35
        hole.add(p_box(sz, sz, sz * 0.7, 0.02), "dirt_light",
                 T(p[0], p[1], zc) @ R(rnd.uniform(-20, 20), rnd.uniform(-20, 20), rnd.uniform(0, 90)), grad=False)
    # 壓平：任何低於地面的點貼齊 z=0
    for v in hole.bm.verts:
        if v.co.z < 0:
            v.co.z = 0.0
    return [hole]


# ---------------------------------------------------------------------------
# 輸出
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# 10. 獎勵系統（docs/zhuyin-rewards-spec.md）：超稀有寵物、配件、扭蛋、小島裝飾、彩蛋
#     座標同上：臉朝 -Y、Z 朝上、底部貼地；配件原點＝掛點（見各函式說明）
# ---------------------------------------------------------------------------
def p_hemi(r, us=16, vs=8, up=True):
    """半球（開口在 z=0，up＝往 +Z 的上半）"""
    bm = p_sphere(r, us, vs)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co.z < -1e-4 if up else v.co.z > 1e-4)], context='VERTS')
    return bm


def legs4(parts, color, w=0.36, h=0.32, off=0.3):
    """Cube Pets 式四條短腿：leg-front-left／right、leg-back-left／right，關節在腿頂"""
    for sy, fb in ((-1, "front"), (1, "back")):
        for sx in (1, -1):
            side = "left" if sx > 0 else "right"
            leg = Part(f"leg-{fb}-{side}", (sx * off, sy * off, h))
            leg.add(p_box(w, w, h + 0.06, 0.07), color, T(sx * off, sy * off, (h + 0.06) / 2 - 0.03))
            parts.append(leg)


def pet_face(body, yf, ez, mz, cz, ex=0.21, rw=0.15, rp=0.095, cx=0.38):
    """張開的圓眼＋微笑＋腮紅（yf＝臉面 y）"""
    for sx in (1, -1):
        add_eye(body, sx * ex, ez, yf, rw, rp, look=(-sx * 0.012, -0.008), szw=1.06)
        disc(body, 0.075, 0.014, (sx * cx, yf - 0.006, cz), "cheek", sx=1.3, sz=0.82, n=14)
    smile(body, 0.0, mz, 0.05, yf - 0.012)


def build_dino():
    """小恐龍：綠色方身、背上一排圓圓的黃色背鰭、短尾巴"""
    parts = []
    W, D, H, z0 = 1.24, 1.22, 1.16, 0.26
    yf = -D / 2
    body = Part("body")
    body.add(p_box(W, D, H, 0.16), "dino", T(0, 0, z0 + H / 2))
    disc(body, 0.2, 0.03, (0, yf - 0.004, z0 + 0.19), "dino_belly", sx=1.75, sz=0.8, n=18)   # 圓圓的肚子
    pet_face(body, yf, z0 + 0.74, z0 + 0.44, z0 + 0.5)
    for sx in (1, -1):
        for (y, z, r) in [(-0.2, z0 + 0.75, 0.11), (0.2, z0 + 0.45, 0.09), (0.3, z0 + 0.85, 0.07)]:
            body.add(p_cyl(r, 0.03, 10), "dino_belly", T(sx * W / 2, y, z) @ R(0, 90, 0), grad=False)
    for (y, z, r) in [(-0.32, z0 + H, 0.17), (-0.02, z0 + H, 0.23), (0.3, z0 + H, 0.22), (D / 2, z0 + H - 0.24, 0.2), (D / 2, z0 + H - 0.6, 0.15)]:
        body.add(p_cyl(r, 0.1, 14), "dino_fin", T(0, y, z) @ R(0, 90, 0), grad=False)
    body.add(p_box(0.5, 0.55, 0.42, 0.13), "dino", T(0, D / 2 + 0.2, z0 + 0.3))
    body.add(p_box(0.3, 0.42, 0.26, 0.08), "dino", T(0, D / 2 + 0.56, z0 + 0.18))
    body.add(p_cyl(0.07, 0.1, 10), "dino_fin", T(0, D / 2 + 0.47, z0 + 0.52) @ R(0, 90, 0), grad=False)
    parts.append(body)
    legs4(parts, "dino")
    return parts


def build_whale():
    """小鯨魚：藍色圓方身、白肚、頭頂噴水（獨立物件 spout）、尾鰭往上翹；四片小鰭＝四條腿"""
    parts = []
    W, D, H, z0 = 1.42, 1.46, 1.0, 0.2
    yf = -D / 2
    body = Part("body")
    body.add(p_box(W, D, H, 0.3), "whale", T(0, 0, z0 + H / 2))
    disc(body, 0.22, 0.03, (0, yf - 0.004, z0 + 0.16), "whale_belly", sx=2.1, sz=0.62, n=20)
    pet_face(body, yf, z0 + 0.58, z0 + 0.28, z0 + 0.38, ex=0.27, rw=0.14, rp=0.09, cx=0.45)
    body.add(p_box(0.42, 0.5, 0.36, 0.12), "whale", T(0, D / 2 + 0.16, z0 + 0.5))
    for sx in (1, -1):
        body.add(p_box(0.5, 0.26, 0.1, 0.05), "whale", T(sx * 0.24, D / 2 + 0.42, z0 + 0.72) @ R(0, sx * -28, 0) @ R(-20, 0, 0))
    parts.append(body)
    sp = Part("spout", (0, -0.12, z0 + H))
    sp.add(p_cyl(0.06, 0.34, 8), "spout", T(0, -0.12, z0 + H + 0.16))
    for (x, y, z, r) in [(0, -0.12, 0.44, 0.1), (0.15, -0.12, 0.4, 0.075), (-0.15, -0.12, 0.4, 0.075), (0.25, -0.1, 0.3, 0.06), (-0.25, -0.1, 0.3, 0.06), (0.08, -0.25, 0.36, 0.06), (-0.06, 0.02, 0.38, 0.06)]:
        sp.add(p_ico(r, 1), "spout", T(x, y, z0 + H + z))
    parts.append(sp)
    # 小鰭當腳（leg-* 物件，選單可以擺動）
    for sy, fb in ((-1, "front"), (1, "back")):
        for sx in (1, -1):
            side = "left" if sx > 0 else "right"
            fin = Part(f"leg-{fb}-{side}", (sx * 0.42, sy * 0.42, 0.24))
            fin.add(p_box(0.42, 0.3, 0.12, 0.05), "whale", T(sx * 0.55, sy * 0.42, 0.12) @ R(0, sx * 18, 0))
            parts.append(fin)
    return parts


def build_dragon():
    """彩虹小龍：淡紫方身、奶油色肚子、彩虹背刺、小翅膀（wing-left／right 物件）、小角"""
    parts = []
    W, D, H, z0 = 1.22, 1.22, 1.14, 0.26
    yf = -D / 2
    body = Part("body")
    body.add(p_box(W, D, H, 0.16), "dragon", T(0, 0, z0 + H / 2))
    disc(body, 0.2, 0.03, (0, yf - 0.004, z0 + 0.19), "dragon_belly", sx=1.75, sz=0.8, n=18)
    pet_face(body, yf, z0 + 0.74, z0 + 0.44, z0 + 0.5)
    for sx in (1, -1):
        body.add(p_cone(0.08, 0.26, 8), "horn", T(sx * 0.3, -0.18, z0 + H + 0.1) @ R(-18, sx * 12, 0))
    rb = ["rb_red", "rb_orange", "rb_yellow", "rb_green", "rb_blue", "rb_purple"]
    spikes = [(-0.38, z0 + H, 0), (-0.12, z0 + H, 0), (0.14, z0 + H, 0), (0.4, z0 + H, 0), (D / 2, z0 + H - 0.28, 1), (D / 2, z0 + H - 0.6, 1)]
    for k, (y, z, back) in enumerate(spikes):
        Mx = T(0, y, z) @ (R(-70, 0, 0) if back else Matrix.Identity(4))
        body.add(p_cone(0.15, 0.4, 4), rb[k], Mx @ T(0, 0, 0.13) @ S(0.5, 1.0, 1.0), grad=False)
    body.add(p_box(0.46, 0.55, 0.4, 0.12), "dragon", T(0, D / 2 + 0.2, z0 + 0.3))
    body.add(p_box(0.28, 0.4, 0.24, 0.08), "dragon", T(0, D / 2 + 0.55, z0 + 0.2))
    body.add(p_cone(0.16, 0.22, 4), "rb_purple", T(0, D / 2 + 0.82, z0 + 0.2) @ R(-90, 0, 0) @ S(1.0, 0.45, 1.0), grad=False)
    parts.append(body)
    for sx in (1, -1):
        side = "left" if sx > 0 else "right"
        wg = Part(f"wing-{side}", (sx * 0.58, 0.2, z0 + H - 0.25))
        A = T(sx * 0.6, 0.2, z0 + H - 0.25) @ R(0, 0, sx * 25)           # 往外、往後張
        wg.add(p_cone(0.2, 0.62, 3), "dragon_wing", A @ R(0, sx * 55, 0) @ T(0, 0, 0.3) @ S(1.0, 0.28, 1.0))
        wg.add(p_cone(0.15, 0.42, 3), "dragon_wing", A @ R(0, sx * 100, 0) @ T(0, 0, 0.2) @ S(1.0, 0.28, 1.0))
        wg.add(p_ico(0.07, 1), "dragon", A)
        parts.append(wg)
    legs4(parts, "dragon")
    return parts


# ----- 配件：原點＝掛點 -----
def build_crown():
    """皇冠：原點在底部中心（放在寵物頭頂 head 掛點）"""
    c = Part("crown_body")
    c.add(p_cyl(0.27, 0.14, 14), "gold", T(0, 0, 0.07))
    for k in range(5):
        a = math.radians(90 + k * 72)
        x, y = 0.23 * math.cos(a), 0.23 * math.sin(a)
        c.add(p_cone(0.08, 0.18, 6), "gold", T(x, y, 0.22))
        c.add(p_ico(0.04, 1), "gold_light", T(x, y, 0.33))
    c.add(p_ico(0.055, 1), "jewel_red", T(0, -0.27, 0.07))
    for sx in (1, -1):
        c.add(p_ico(0.04, 1), "jewel_blue", T(sx * 0.19, -0.19, 0.07))
    return [c]


def build_cape():
    """小披風：原點在上緣中間、貼著寵物背面（back 掛點）；往下垂、下襬往後張開（+Y＝背後）"""
    c = Part("cape_cloth")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=6, y_segments=6, size=1.0)
    for v in bm.verts:
        u, w = v.co.x, (1.0 - v.co.y) / 2          # w：0＝上緣、1＝下襬
        v.co = Vector((u * (0.36 + 0.2 * w), 0.02 + 0.16 * w * w - 0.06 * u * u, -w * 0.92))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.035)
    c.add(bm, "cape_red")
    c.add(p_box(0.78, 0.07, 0.08, 0.03), "gold", T(0, 0.0, -0.02))
    c.add(p_ico(0.06, 1), "gold_light", T(0, -0.04, -0.02))
    return [c]


def build_bow():
    """蝴蝶結：原點在底部中心（head 掛點，可以往一側偏一點）"""
    b = Part("bow_knot")
    for sx in (1, -1):
        b.add(p_sphere(0.14, 12, 8), "bow_pink", T(sx * 0.15, 0, 0.14) @ R(0, sx * 18, 0) @ S(1.25, 0.5, 0.85))
        b.add(p_box(0.08, 0.04, 0.18, 0.02), "bow_pink_dk", T(sx * 0.07, 0.02, 0.05) @ R(0, sx * 22, 0))
    b.add(p_ico(0.07, 1), "bow_pink_dk", T(0, -0.02, 0.14))
    return [b]


def build_hat():
    """帽子（小禮帽）：原點在底部中心（head 掛點）；藍色帽身＋黃色帽帶＋前面一顆小星星
       10-12 寵物換裝：原本的藍黃條紋圓錐改名 party_hat（派對帽），帽子改成真的帽子，兩件才不會長得一樣"""
    h = Part("hat_top")
    h.add(p_cyl(0.335, 0.05, 22), "hat_blue_dk", T(0, 0, 0.025), grad=False)                    # 帽簷
    h.add(p_cyl(0.30, 0.03, 22, r2=0.235), "hat_blue_dk", T(0, 0, 0.06), grad=False)             # 帽簷往帽身收的斜邊（圓潤一點）
    h.add(p_cyl(0.205, 0.29, 18, r2=0.228), "hat_blue", T(0, 0, 0.05 + 0.145))                 # 帽身（上面寬一點點）
    h.add(p_cyl(0.228, 0.035, 18, r2=0.19), "hat_blue", T(0, 0, 0.352), grad=False)           # 帽頂斜邊
    h.add(p_cyl(0.19, 0.012, 18), "hat_blue", T(0, 0, 0.375), grad=False)
    h.add(p_cyl(0.213, 0.075, 18, r2=0.218), "hat_yellow", T(0, 0, 0.05 + 0.045), grad=False)   # 帽帶
    h.add(p_star(0.075, 0.034, 0.035), "white", T(0, -0.226, 0.095) @ FRONT, grad=False)      # 帽帶前面的小星星
    return [h]


def build_party_hat():
    """派對帽：原點在底部中心（head 掛點）；粉紫條紋圓錐＋彩色圓點＋底下一圈小毛球＋頂上黃毛球"""
    h = Part("party_cone")
    Hh, R0 = 0.52, 0.215
    rr = lambda z: R0 * (1 - z / (Hh * 1.06))
    for k in range(5):
        z1, z2 = k * Hh / 5, (k + 1) * Hh / 5
        h.add(p_cyl(rr(z1), Hh / 5, 16, r2=rr(z2)), "cap_pink" if k % 2 == 0 else "cap_purple", T(0, 0, (z1 + z2) / 2), grad=False)
    rnd = random.Random(12)
    dots = ["rb_yellow", "rb_green", "rb_blue", "white"]
    for k, (a, z) in enumerate([(-80, 0.12), (-35, 0.25), (-120, 0.3), (10, 0.15), (-60, 0.4), (40, 0.32), (95, 0.2), (150, 0.12), (-160, 0.22), (200, 0.36)]):
        r = rr(z) - 0.004
        h.add(p_ico(0.03 + rnd.uniform(0, 0.006), 1), dots[k % 4], T(r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), z) @ S(1, 1, 1), grad=False)
    for k in range(14):                                                                            # 底下一圈白色小毛球
        a = 2 * math.pi * k / 14
        h.add(p_ico(0.045, 1), "white", T(0.225 * math.cos(a), 0.225 * math.sin(a), 0.035))
    h.add(p_ico(0.085, 1), "rb_yellow", T(0, 0, Hh + 0.035))
    for k in range(5):                                                                             # 毛球蓬一點
        a = 2 * math.pi * k / 5
        h.add(p_ico(0.05, 1), "rb_yellow", T(0.05 * math.cos(a), 0.05 * math.sin(a), Hh + 0.055))
    return [h]


def build_baby_tuft():
    """寶寶頭頂的小芽：原點在底部中心（head 掛點）"""
    t = Part("sprout")
    seg_cyl(t, (0, 0, -0.02), (0.02, 0, 0.13), 0.024, "sprout")
    seg_cyl(t, (0.02, 0, 0.13), (-0.005, 0, 0.21), 0.022, "sprout")
    for sx in (1, -1):
        t.add(p_sphere(0.09, 10, 6), "sprout", T(sx * 0.08, 0, 0.23) @ R(0, sx * -32, 0) @ S(1.35, 0.35, 0.75))
    return [t]


# ----- 10-12 寵物換裝：新配件（原點＝掛點，尺寸跟皇冠／披風／蝴蝶結差不多） -----
def blossom(part, M, r, petal, center, n=5, cup=16, seg=(8, 5)):
    """一朵小花：M 的區域座標裡面朝 +Z；花瓣是壓扁的圓球繞一圈、外緣往上翹 cup 度，中間一顆花心"""
    for k in range(n):
        part.add(p_sphere(r * 0.6, *seg), petal, M @ R(0, 0, 360.0 * k / n + 90) @ T(r * 0.62, 0, 0) @ R(0, -cup, 0) @ S(1.0, 0.8, 0.36))
    part.add(p_sphere(r * 0.42, *seg), center, M @ T(0, 0, r * 0.14) @ S(1, 1, 0.62), grad=False)


def build_flower_crown():
    """花圈：原點在底部中心（head 掛點）；一圈綠藤＋7 朵小花（朝上、往外翹）＋花之間的小葉子"""
    c = Part("flower_ring")
    R0, N = 0.25, 16
    pts = [(R0 * math.cos(2 * math.pi * k / N), R0 * math.sin(2 * math.pi * k / N), 0.04) for k in range(N)]
    for k in range(N):
        seg_cyl(c, pts[k], pts[(k + 1) % N], 0.036, "leaf", n=6, extra=0.03)
    cols = ["flower_pink", "white", "flower_yellow", "flower_lilac", "flower_pink", "flower_yellow", "flower_lilac"]
    nf = len(cols)
    for k in range(nf):                                                               # 花往外翻 62 度：從旁邊、低角度看也看得到花面
        a = 2 * math.pi * k / nf - math.pi / 2
        blossom(c, T(R0 * math.cos(a), R0 * math.sin(a), 0.085) @ R(0, 0, math.degrees(a)) @ R(0, 62, 0), 0.105,
                cols[k], "rb_orange" if cols[k] == "flower_yellow" else "rb_yellow", seg=(7, 4))
        b = a + math.pi / nf                                                              # 兩朵花中間一片葉子
        c.add(p_sphere(0.06, 7, 4), "leaf", T(R0 * 1.12 * math.cos(b), R0 * 1.12 * math.sin(b), 0.05) @ R(0, 0, math.degrees(b)) @ R(0, -35, 0) @ S(1.5, 0.75, 0.35))
    return [c]


def build_flower():
    """小花（頭側，跟蝴蝶結同一個 head_side 掛點）：原點在底部中心；一朵面朝前的大花＋兩片葉子"""
    f = Part("flower_clip")
    blossom(f, T(0, 0, 0.17) @ FRONT, 0.15, "flower_coral", "rb_yellow", n=5, cup=12, seg=(10, 6))
    for sx in (1, -1):
        f.add(p_sphere(0.075, 8, 5), "leaf", T(sx * 0.13, 0.035, 0.05) @ R(0, sx * 40, 0) @ S(1.55, 0.35, 0.7))
    return [f]


def _wing_outline():
    """翅膀底片輪廓（翅膀平面座標 u＝往外、v＝往上；根部在原點）：圓圓的水滴形，上緣弧到翅尖再圓圓地繞回根部"""
    return [(0.0, 0.0), (0.05, 0.2), (0.2, 0.38), (0.42, 0.52), (0.66, 0.6), (0.86, 0.6), (0.98, 0.52), (1.0, 0.4),
            (0.93, 0.28), (0.79, 0.17), (0.6, 0.07), (0.4, 0.0), (0.2, -0.05), (0.06, -0.05)]


def _wing(part, sx, color, inner):
    """一片天使翅膀：水滴形底片加厚度＋下緣 3 片圓圓的大羽毛（往外下方垂）＋根部一片粉紅小內層；翅膀面往後斜 20 度、往上翹"""
    beta = math.radians(20)
    h = Vector((sx * math.cos(beta), math.sin(beta), 0.0))       # 水平往外（＋一點往後）
    up = Vector((0.0, 0.0, 1.0))
    N = up.cross(h).normalized()                                  # 翅膀面的法線（統一朝後）
    if N.y < 0:
        N = -N
    in_plane = lambda phi: (h * math.cos(math.radians(phi)) + up * math.sin(math.radians(phi))).normalized()
    U, V = in_plane(22), in_plane(112)
    K = 1.12
    root = Vector((sx * 0.1, 0.07, -0.12))
    at = lambda u, v, off=0.0: root + N * off + (U * u + V * v) * K
    for col, k, off, th in ((color, 1.0, 0.0, 0.065), (inner, 0.55, 0.045, 0.05)):
        bm = bmesh.new()
        vs = [bm.verts.new(root + N * off + (U * u + V * v) * K * k) for (u, v) in _wing_outline()]
        bm.faces.new(vs)
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=th)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        part.add(bm, col)
    for k, (u, v, ang, L, w) in enumerate([(0.86, 0.26, -55, 0.42, 0.24), (0.62, 0.1, -70, 0.42, 0.25), (0.38, 0.0, -84, 0.36, 0.24)]):
        X = (U * math.cos(math.radians(ang)) + V * math.sin(math.radians(ang))).normalized()   # 羽毛往外下方垂
        part.add(p_sphere(1.0, 10, 6), color if k else inner, T(*at(u, v, -0.012 - 0.004 * k)) @ frame(X, N, X.cross(N)) @ T(L * 0.3, 0, 0) @ S(L / 2, 0.034, w / 2))
    part.add(p_ico(0.09, 1), color, T(*root))


def build_wings():
    """翅膀：原點在上緣中間、貼著寵物背面（back 掛點，跟披風一樣，+Y＝背後）；左右兩片白色天使翅膀"""
    w = Part("wings_pair")
    for sx in (1, -1):
        _wing(w, sx, "wing_white", "wing_pink")
    w.add(p_box(0.3, 0.06, 0.12, 0.03), "wing_white", T(0, 0.05, -0.08))                  # 中間的小扣子（把兩片連起來）
    return [w]


def build_backpack():
    """背包：原點在上緣中間、貼著寵物背面（back 掛點，+Y＝背後）；紅色包身＋黃色蓋子＋前口袋＋提把"""
    b = Part("backpack_body")
    W, D, H, y0, top = 0.56, 0.25, 0.54, 0.02, 0.05
    b.add(p_box(W, D, H, 0.08), "pack_red", T(0, y0 + D / 2, top - H / 2))                        # 包身
    b.add(p_box(W + 0.02, D + 0.03, 0.08, 0.035), "hat_yellow", T(0, y0 + D / 2 + 0.01, top - 0.02))   # 蓋子頂
    b.add(p_box(W - 0.02, 0.06, 0.24, 0.035), "hat_yellow", T(0, y0 + D + 0.01, top - 0.15))           # 蓋子垂下來的那片
    b.add(p_box(0.1, 0.035, 0.07, 0.012), "white", T(0, y0 + D + 0.05, top - 0.25))                    # 扣子
    b.add(p_box(0.36, 0.07, 0.17, 0.035), "hat_yellow", T(0, y0 + D + 0.01, top - 0.42))               # 前口袋
    b.add(p_star(0.045, 0.021, 0.025), "white", T(0, y0 + D + 0.05, top - 0.42) @ R(-90, 0, 0), grad=False)   # 口袋上的小星星（面朝後）
    arc = [(0.09 * math.cos(math.radians(t)), y0 + D / 2, top + 0.035 + 0.075 * math.sin(math.radians(t))) for t in range(0, 181, 30)]
    for p1, p2 in zip(arc, arc[1:]):                                                                    # 提把
        seg_cyl(b, p1, p2, 0.018, "pack_red", n=6, extra=0.012)
    for sx in (1, -1):                                                                                   # 兩條肩帶的頭（從包包上緣往前接到寵物背上）
        b.add(p_box(0.08, 0.06, 0.1, 0.02), "pack_red_dk", T(sx * 0.17, y0 + 0.01, top - 0.04))
    return [b]


def _cape_strip(part, w0, w1, color):
    """披風的一條橫帶（w＝0 上緣、1 下襬）；形狀跟 build_cape 一模一樣"""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=6, y_segments=1, size=1.0)
    for v in bm.verts:
        u, t = v.co.x, (1.0 - v.co.y) / 2
        w = w0 + (w1 - w0) * t
        v.co = Vector((u * (0.36 + 0.2 * w), 0.02 + 0.16 * w * w - 0.06 * u * u, -w * 0.92))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.035)
    part.add(bm, color)


def build_cape_rainbow():
    """彩虹披風：跟 cape 同形狀（原點在上緣中間、貼著寵物背面），紅橙黃綠藍紫六條橫帶＋金色領扣＋星星扣"""
    c = Part("cape_cloth")
    cols = ["rb_red", "rb_orange", "rb_yellow", "rb_green", "rb_blue", "rb_purple"]
    for k, col in enumerate(cols):
        _cape_strip(c, k / 6, (k + 1) / 6, col)
    c.add(p_box(0.78, 0.07, 0.08, 0.03), "gold", T(0, 0.0, -0.02))
    c.add(p_star(0.085, 0.04, 0.05), "gold_light", T(0, -0.045, -0.02) @ FRONT, grad=False)
    return [c]


# ----- 扭蛋 -----
def build_coin():
    """扭蛋幣：金色、正反兩面浮雕星星；直立、面朝前"""
    c = Part("coin_body")
    c.add(p_cyl(0.5, 0.12, 32), "gold", T(0, 0, 0.5) @ FRONT, grad=False)
    c.add(p_cyl(0.41, 0.13, 32), "gold_light", T(0, 0, 0.5) @ FRONT, grad=False)
    for y, rot in ((-0.065, FRONT), (0.065, R(-90, 0, 0))):
        c.add(p_star(0.27, 0.12, 0.05), "gold", T(0, y, 0.5) @ rot, grad=False)
    return [c]


def build_capsule():
    """扭蛋膠囊：capsule_top（上半，單色材質，程式可換藍／紫／金）＋capsule_bottom（下半白色）；
       capsule_top 的原點在背面接縫（樞紐），往後轉＝打開"""
    r = 0.32
    top = Part("capsule_top", (0, r, r))
    top.add(p_hemi(r, 20, 8, up=True), "white", T(0, 0, r), grad=False)
    bot = Part("capsule_bottom")
    bot.add(p_hemi(r * 0.985, 20, 8, up=False), "white", T(0, 0, r), grad=False)
    bot.add(p_cyl(r * 1.01, 0.04, 20), "gacha_cream", T(0, 0, r - 0.01), grad=False)
    return [top, bot]


def capsule_points():
    """扭蛋機圓頂裡的膠囊位置（在球內、偏下方堆著）"""
    rnd = random.Random(5)
    pts, C, Rd, r = [], Vector((0, 0, 1.5)), 0.56, 0.11
    for z in (1.08, 1.26, 1.44):
        for k in range(9):
            a = k / 9 * math.pi * 2 + z * 3
            rr = 0.33 if z > 1.1 else 0.22
            p = Vector((rr * math.cos(a), rr * math.sin(a), z)) + Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), 0))
            if (p - C).length <= Rd - r - 0.03 and all((p - q).length > 2 * r * 0.95 for q in pts):
                pts.append(p)
    return pts, r


def build_gacha():
    """扭蛋機：base（紅色底座：投幣口、出口、星星）、dome（玻璃圓頂，透明材質）、capsules（彩色膠囊）、
       handle（前面的轉把，原點在轉軸中心，繞前後軸轉）、top（頂上的小球）"""
    parts = []
    base = Part("base")
    base.add(p_box(1.2, 1.0, 0.86, 0.13), "gacha_red", T(0, 0, 0.53))
    for sx in (1, -1):
        for sy in (1, -1):
            base.add(p_box(0.16, 0.16, 0.12, 0.04), "gacha_cream", T(sx * 0.45, sy * 0.36, 0.06))
    base.add(p_box(0.94, 0.05, 0.64, 0.06), "gacha_cream", T(0, -0.5, 0.53))
    base.add(p_box(0.2, 0.04, 0.24, 0.03), "gold", T(0.3, -0.53, 0.66))
    base.add(p_box(0.05, 0.05, 0.16, 0.015), "hole_dark", T(0.3, -0.555, 0.66))
    base.add(p_box(0.36, 0.05, 0.2, 0.05), "hole_dark", T(0, -0.53, 0.32))
    base.add(p_box(0.4, 0.07, 0.06, 0.025), "gold", T(0, -0.55, 0.44))
    base.add(p_star(0.1, 0.045, 0.04), "gold", T(-0.3, -0.535, 0.66) @ FRONT)
    base.add(p_cyl(0.56, 0.1, 28), "gold", T(0, 0, 1.0))
    parts.append(base)
    hd = Part("handle", (0, -0.56, 0.66))
    hd.add(p_cyl(0.13, 0.06, 20), "white", T(0, -0.56, 0.66) @ FRONT)
    hd.add(p_box(0.3, 0.06, 0.07, 0.025), "gold", T(0, -0.6, 0.66))
    hd.add(p_cyl(0.04, 0.1, 10), "gold", T(0.12, -0.65, 0.66) @ FRONT)
    parts.append(hd)
    dome = Part("dome", (0, 0, 1.5))
    dome.add(p_sphere(0.56, 28, 16), "white", T(0, 0, 1.5), grad=False)
    parts.append(dome)
    top = Part("top")
    top.add(p_cyl(0.12, 0.08, 16), "gacha_red", T(0, 0, 2.07))
    top.add(p_ico(0.08, 1), "gold", T(0, 0, 2.15))
    parts.append(top)
    caps = Part("capsules")
    cols = ["cap_blue", "cap_purple", "cap_gold", "cap_pink", "cap_green"]
    rnd = random.Random(9)
    pts, r = capsule_points()
    for k, p in enumerate(pts):
        M = T(*p) @ R(rnd.uniform(-60, 60), rnd.uniform(-60, 60), 0)
        caps.add(p_hemi(r, 10, 5, up=True), cols[k % len(cols)], M, grad=False)
        caps.add(p_hemi(r, 10, 5, up=False), "white", M, grad=False)
    parts.append(caps)
    return parts


# ----- 小島裝飾 -----
def build_statue_owl():
    """貓頭鷹雕像（石材）：台座＋戴學士帽的貓頭鷹"""
    s = Part("owl_statue")
    s.add(p_box(0.9, 0.9, 0.34, 0.05), "stone_dk", T(0, 0, 0.17))
    s.add(p_box(1.0, 1.0, 0.08, 0.03), "stone", T(0, 0, 0.38))
    z = 0.42
    s.add(p_box(0.64, 0.56, 0.72, 0.17), "stone", T(0, 0, z + 0.36))
    for sx in (1, -1):
        s.add(p_cyl(0.13, 0.04, 16), "stone_lt", T(sx * 0.15, -0.28, z + 0.5) @ FRONT, grad=False)
        s.add(p_cyl(0.06, 0.04, 12), "stone_dk", T(sx * 0.15, -0.3, z + 0.5) @ FRONT, grad=False)
        s.add(p_box(0.08, 0.36, 0.42, 0.04), "stone_dk", T(sx * 0.34, 0.02, z + 0.32))
        s.add(p_cone(0.07, 0.18, 6), "stone", T(sx * 0.22, 0, z + 0.8) @ R(0, sx * 18, 0))
    s.add(p_cone(0.05, 0.12, 6), "stone_dk", T(0, -0.3, z + 0.38) @ R(180, 0, 0))
    s.add(p_box(0.32, 0.32, 0.1, 0.03), "stone_dk", T(0, 0, z + 0.78))
    s.add(p_box(0.52, 0.52, 0.04, 0.01), "stone_dk", T(0, 0, z + 0.85) @ R(0, 0, 45))
    return [s]


def build_flower_arch():
    """花拱門：兩根白柱＋半圓拱，綠葉上開粉紅／白／黃花"""
    a = Part("arch_frame")
    rnd = random.Random(3)
    for sx in (1, -1):
        a.add(p_box(0.12, 0.12, 1.1, 0.03), "white", T(sx * 0.7, 0, 0.55))
        a.add(p_box(0.24, 0.24, 0.1, 0.03), "stone", T(sx * 0.7, 0, 0.05))
    pts = [(0.7 * math.cos(math.radians(t)), 1.1 + 0.7 * math.sin(math.radians(t))) for t in range(0, 181, 15)]
    for (x1, z1), (x2, z2) in zip(pts, pts[1:]):
        seg_box(a, (x1, 0, z1), (x2, 0, z2), 0.1, 0.1, (0, -1, 0), "white", extra=0.06)
    flowers = ["flower_pink", "white", "flower_yellow", "flower_pink"]
    spots = [(sx * 0.7, 0.25 + k * 0.22) for sx in (1, -1) for k in range(4)] + [(x, z) for (x, z) in pts[1:-1]]
    for k, (x, z) in enumerate(spots):
        a.add(p_ico(0.12, 1), "leaf", T(x + rnd.uniform(-0.04, 0.04), rnd.uniform(-0.06, 0.04), z))
        a.add(p_ico(0.065, 1), flowers[k % 4], T(x + rnd.uniform(-0.05, 0.05), -0.1, z + rnd.uniform(-0.04, 0.06)), grad=False)
    return [a]


def text_mesh(ch, fonts, size, extrude, bevel, color, name, mat):
    """Blender 文字物件 → 網格、站立面朝前（-Y）、底部貼 z=0、x 置中；回傳物件"""
    bpy.ops.object.text_add(location=(0, 0, 0))
    ob = bpy.context.object
    cu = ob.data
    cu.body = ch
    for fp in fonts:
        if os.path.exists(fp):
            try:
                cu.font = bpy.data.fonts.load(fp)
                break
            except Exception as e:
                print("[font] 載入失敗", fp, e)
    cu.size, cu.extrude, cu.bevel_depth, cu.bevel_resolution, cu.align_x = size, extrude, bevel, 2, 'CENTER'
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.object
    ob.name = name
    ob.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    bm = bmesh.new()
    bm.from_mesh(me)
    xs, ys, zs = [v.co.x for v in bm.verts], [v.co.y for v in bm.verts], [v.co.z for v in bm.verts]
    off = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))
    for v in bm.verts:
        v.co -= off
    z1 = max(zs) - min(zs)
    uvl = bm.loops.layers.uv.active
    for f in bm.faces:
        f.smooth = False
        for lp in f.loops:
            lp[uvl].uv = uv_for(color, lp.vert.co.z / z1)
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(mat)
    return ob, z1


def build_statue_bpmf(mat):
    """ㄅ字雕像：石台座＋橘色立體「ㄅ」（微軟正黑體粗體）"""
    ped = Part("pedestal")
    ped.add(p_box(0.9, 0.7, 0.3, 0.05), "stone_dk", T(0, 0, 0.15))
    ped.add(p_box(1.0, 0.8, 0.08, 0.03), "stone", T(0, 0, 0.34))
    parts_to_scene("statue_bpmf", [ped], mat)
    root = bpy.data.objects["statue_bpmf"]
    fonts = [r"C:\Windows\Fonts\msjhbd.ttc", r"C:\Windows\Fonts\msjh.ttc", r"C:\Windows\Fonts\kaiu.ttf"]
    ob, h = text_mesh("ㄅ", fonts, 1.25, 0.16, 0.04, "bpmf", "bpmf", mat)
    if len(ob.data.vertices) < 8:
        print("[bpmf] 字型沒有ㄅ，雕像只有台座")
    ob.location = (0, 0, 0.38)
    ob.parent = root


def build_egg_color(base, spots, name):
    """紫蛋（稀有）／金蛋（超稀有）：同 egg.glb 的蛋形，換底色和斑點色"""
    egg = Part("shell")
    bm = p_sphere(EGG_R, 14, 11)
    for v in bm.verts:
        zn = v.co.z / EGG_R
        f = 1.0 - 0.13 * zn - 0.06 * max(0.0, zn) ** 2
        v.co = Vector((v.co.x * f, v.co.y * f, v.co.z * EGG_Z + EGG_R * EGG_Z))
    egg.add(bm, base)
    N, k = 22, 0
    for i in range(N):
        zn = 1 - 2 * (i + 0.5) / N
        if abs(zn) > 0.8:
            continue
        theta = i * math.pi * (3 - math.sqrt(5)) - math.pi / 4
        phi = math.asin(zn)
        p, n = egg_point(theta, phi), egg_normal(theta, phi)
        q = n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        if spots == "stars":
            egg.add(p_star(0.085, 0.04, 0.03), "white" if k % 2 else "gold_light", T(*(p - n * 0.004)) @ q, grad=False)
        else:
            r = 0.065 + 0.03 * ((i * 7) % 5) / 4
            egg.add(p_cyl(r, 0.03, 10), spots[k % len(spots)], T(*(p - n * 0.006)) @ q, grad=False)
        k += 1
    return [egg]


def solid_material(name, rgba, alpha=1.0, rough=0.4):
    """不吃色票的單色材質（膠囊上半＝程式換色；圓頂玻璃＝半透明）"""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        for attr, val in (("blend_method", "BLEND"), ("surface_render_method", "BLENDED")):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    return m


def set_object_material(obname, m, smooth=False):
    ob = bpy.data.objects[obname]
    ob.data.materials.clear()
    ob.data.materials.append(m)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True


CUSTOM = {   # 名稱 → (建模函式, 建好後的處理)
    "dino": (build_dino, None), "whale": (build_whale, None), "dragon": (build_dragon, None),
    "crown": (build_crown, None), "cape": (build_cape, None), "bow": (build_bow, None), "hat": (build_hat, None), "baby_tuft": (build_baby_tuft, None),
    "flower_crown": (build_flower_crown, None), "party_hat": (build_party_hat, None), "flower": (build_flower, None),   # 10-12 寵物換裝
    "wings": (build_wings, None), "backpack": (build_backpack, None), "cape_rainbow": (build_cape_rainbow, None),
    "coin": (build_coin, None),
    "capsule": (build_capsule, lambda: (set_object_material("capsule_top", solid_material("capsule_top", (0.28, 0.6, 1.0, 1.0))), set_object_material("capsule_bottom", bpy.data.objects["capsule_bottom"].data.materials[0], smooth=True), [setattr(p, "use_smooth", True) for p in bpy.data.objects["capsule_top"].data.polygons])),
    "gacha_machine": (build_gacha, lambda: set_object_material("dome", solid_material("glass", (0.82, 0.94, 1.0, 1.0), alpha=0.28, rough=0.1), smooth=True)),
    "statue_owl": (build_statue_owl, None), "flower_arch": (build_flower_arch, None),
    "egg_rare": (lambda: build_egg_color("egg_purple", ["white", "egg_lilac", "spot_pink", "white"], "egg_rare"), None),
    "egg_ssr": (lambda: build_egg_color("egg_gold", "stars", "egg_ssr"), None),
}


def pet_anchors(path):
    """寵物配件掛點（glTF 座標：x、y 上、z 朝前）：
       head＝身體朝上的面裡最高的一大層（≥最大層 25%）的中心；back＝頭頂往下 0.38、身體中線（|x|<0.3）最後面的點"""
    clear_objects()
    bpy.ops.import_scene.gltf(filepath=path)
    ob = bpy.data.objects.get("body")
    if ob is None:
        return None
    mw = ob.matrix_world
    me = ob.data
    up, bk = {}, {}
    for p in me.polygons:
        n = mw.to_3x3() @ p.normal
        c = mw @ p.center
        if n.z > 0.9:
            k = round(c.z, 2); a = up.setdefault(k, [0.0, 0.0, 0.0]); a[0] += p.area; a[1] += c.x * p.area; a[2] += c.y * p.area
        if n.y > 0.9:
            k = round(c.y, 2); b = bk.setdefault(k, [0.0, -9.0]); b[0] += p.area; b[1] = max(b[1], max((mw @ me.vertices[i].co).z for i in p.vertices))
    if not up:
        return None
    bigu = max(v[0] for v in up.values())
    hz = max(k for k, v in up.items() if v[0] >= bigu * 0.25)      # 最高的一大層＝頭頂（螃蟹的鉗子、獅子鬃毛不算）
    a = up[hz]
    head = [round(a[1] / a[0], 3), round(hz, 3), round(-a[2] / a[0], 3)]
    bz, ys = hz - 0.38, []
    for p in me.polygons:                              # 朝後、而且蓋住 (x=0, 頭頂往下 0.38) 那一點的面
        if (mw.to_3x3() @ p.normal).y < 0.7:
            continue
        ps = [mw @ me.vertices[i].co for i in p.vertices]
        if min(q.x for q in ps) <= 0.0 <= max(q.x for q in ps) and min(q.z for q in ps) <= bz <= max(q.z for q in ps):
            ys.append(max(q.y for q in ps))
    back = [0.0, round(bz, 3), round(-max(ys), 3)] if ys else None
    return {"head": head, "back": back}


def clear_objects():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def ground_parts(parts):
    """整組平移，讓最低點 z=0"""
    mz = min(v.co.z for p in parts for v in p.bm.verts)
    if abs(mz) > 1e-6:
        for p in parts:
            p.transform(T(0, 0, -mz))


def parts_to_scene(model_name, parts, mat):
    root = bpy.data.objects.new(model_name, None)
    bpy.context.scene.collection.objects.link(root)
    for p in parts:
        p.bm.transform(T(*(-p.pivot)))
        p.bm.normal_update()
        me = bpy.data.meshes.new(p.name)
        p.bm.to_mesh(me)
        p.bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(p.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = p.pivot
        ob.parent = root


def export_glb(path):
    kw = dict(filepath=path, export_format='GLB', use_selection=False, export_yup=True,
              export_texcoords=True, export_normals=True, export_materials='EXPORT',
              export_image_format='AUTO', export_animations=False, export_cameras=False,
              export_lights=False, export_apply=False)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print("[build] 匯出參數不相容，改用精簡參數：", e)
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB')


def verify(paths):
    """重新匯入每個 GLB：確認不報錯、統計三角面數與尺寸、確認貼圖有內嵌"""
    print("\n[verify] 檔名 | 三角面 | 寬X x 高Y x 深Z (glTF, Y 朝上) | 物件 | 內嵌貼圖")
    ok = True
    for p in paths:
        clear_objects()
        for m in list(bpy.data.materials):
            bpy.data.materials.remove(m)
        for im in list(bpy.data.images):
            bpy.data.images.remove(im)
        try:
            bpy.ops.import_scene.gltf(filepath=p)
        except Exception as e:
            print("[verify] 匯入失敗", p, e)
            ok = False
            continue
        tris = 0
        pts = []
        names = []
        for ob in bpy.data.objects:
            if ob.type == 'MESH':
                names.append(ob.name)
                me = ob.data
                tris += sum(len(poly.vertices) - 2 for poly in me.polygons)
                pts += [ob.matrix_world @ v.co for v in me.vertices]
        dx = max(q.x for q in pts) - min(q.x for q in pts)
        dy = max(q.y for q in pts) - min(q.y for q in pts)
        dz = max(q.z for q in pts) - min(q.z for q in pts)
        imgs = [f"{im.name}({im.size[0]}x{im.size[1]},packed={im.packed_file is not None})" for im in bpy.data.images]
        print(f"[verify] {os.path.basename(p)} | {tris} | {dx:.2f} x {dz:.2f} x {dy:.2f} | "
              f"{','.join(sorted(names))} | {';'.join(imgs)}")
        if tris >= 3000:
            print("[verify] 警告：三角面超過 3000", p)
            ok = False
    print("[verify] 全部通過" if ok else "[verify] 有問題，見上方")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = None
    if "--only" in argv:
        only = set(argv[argv.index("--only") + 1].split(","))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    img = build_palette_image()
    mat = make_material(img, "zy_palette", 0.9)
    mat_gloss = make_material(img, "zy_palette_gloss", 0.45)   # 氣球：亮一點

    jobs = [
        ("mole", lambda: build_mole(False), mat),
        ("mole_hit", lambda: build_mole(True), mat),
        ("frog", lambda: build_frog(False), mat),
        ("frog_jump", lambda: build_frog(True), mat),
        ("owl", build_owl, mat),
        ("bear", None, mat),
        ("bunny", None, mat),
        ("cat", None, mat), ("fox", None, mat), ("lion", None, mat), ("panda", None, mat), ("penguin", None, mat),
        ("qmark", None, mat),
        ("balloon_red", lambda: build_balloon("red"), mat_gloss),
        ("balloon_blue", lambda: build_balloon("blue"), mat_gloss),
        ("balloon_green", lambda: build_balloon("green"), mat_gloss),
        ("balloon_yellow", lambda: build_balloon("yellow"), mat_gloss),
        ("egg", lambda: build_egg(False), mat),
        ("egg_crack", lambda: build_egg(True), mat),
        ("hole", build_hole, mat),
    ]
    jobs += [(n, None, mat) for n in PETS if n not in {j[0] for j in jobs}]   # 稀有寵物（自動模式）
    jobs += [(n, None, mat) for n in CUSTOM] + [("statue_bpmf", None, mat)]   # 獎勵系統自製模型
    done = []
    for name, fn, m in jobs:
        if only and name not in only:
            continue
        clear_objects()
        if name == "bear":
            build_bear(m)
        elif name in PETS:
            build_pet(name, m)
        elif name == "qmark":
            build_qmark(m)
        elif name == "statue_bpmf":
            build_statue_bpmf(m)
        elif name in CUSTOM:
            fn, post = CUSTOM[name]
            parts = fn()
            if name not in ("cape", "crown", "bow", "hat", "baby_tuft", "flower_crown", "party_hat", "flower", "wings", "backpack", "cape_rainbow"):   # 配件的原點＝掛點，不要重新貼地
                ground_parts(parts)
            parts_to_scene(name, parts, m)
            if post:
                post()
        else:
            parts = fn()
            ground_parts(parts)
            parts_to_scene(name, parts, m)
        path = os.path.join(OUT_DIR, name + ".glb")
        export_glb(path)
        print("[build] 輸出", path)
        done.append(path)
    verify(done)
    if "--anchors" in argv:                       # 印出寵物配件掛點（給 models.json）
        import json
        out = {}
        for n in argv[argv.index("--anchors") + 1].split(","):
            pth = os.path.join(OUT_DIR, n + ".glb")
            if os.path.exists(pth):
                out[n] = pet_anchors(pth)
        print("[anchors] " + json.dumps(out))


main()
