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
}
NAMES = list(PALETTE)
INDEX = {n: i for i, n in enumerate(NAMES)}
IMG = 256          # 貼圖邊長
CELL_W, CELL_H = 16, 64   # 每格大小 → 16 欄 x 4 列 = 64 色
assert len(NAMES) <= 64


def srgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def uv_for(name, t):
    """色票名稱 + 高度比例 t(0=底,1=頂) → UV 座標"""
    i = INDEX[name]
    col, row = i % 16, i // 16
    u = (col * CELL_W + CELL_W / 2) / IMG
    v = (row * CELL_H + 4 + 56 * t) / IMG
    return (u, v)


def build_palette_image():
    """產生漸層色票貼圖，存成暫存 PNG（匯出 GLB 時會內嵌）"""
    px = [1.0] * (IMG * IMG * 4)
    for i, name in enumerate(NAMES):
        top, bot = srgb(PALETTE[name][0]), srgb(PALETTE[name][1])
        col, row = i % 16, i // 16
        for yy in range(CELL_H):
            t = min(1.0, max(0.0, (yy + 0.5 - 4) / 56.0))
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


def pet_cat(spec):
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
    recolor_pet(mat, os.path.join(PET_DIR, s["src"] + ".glb"), s["src"], name, pet_cat(s), s["grad"], flat=s.get("flat", True), spec=s)


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
    return best


def zone_boxes(bm, mw, cats, want, zone):
    """want 色票、落在 zone 裡的臉面 → 左右各自的外框 (cx, cz, 半寬, 半高, 最前 y)"""
    x0, x1, z0, z1, ymin = zone
    out = {}
    for f, cat in cats.items():
        if cat not in want:
            continue
        c = mw @ f.calc_center_median()
        if not (x0 <= abs(c.x) <= x1 and z0 <= c.z <= z1 and c.y >= ymin):
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
        else:
            parts = fn()
            ground_parts(parts)
            parts_to_scene(name, parts, m)
        path = os.path.join(OUT_DIR, name + ".glb")
        export_glb(path)
        print("[build] 輸出", path)
        done.append(path)
    verify(done)


main()
