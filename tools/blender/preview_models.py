# -*- coding: utf-8 -*-
"""
注音小島 3D 模型預覽總表（Blender 無頭渲染）

用法：
  blender.exe -b --factory-startup --python tools/blender/preview_models.py -- [選項]

選項：
  --out 路徑        輸出 PNG（預設 IMAGE/_src/iso/models_preview.png）
  --res 寬度        輸出寬度像素（預設 2000，高度依內容自動算）
  --only a,b,c      只排這幾個（名稱同 LAYOUT；Cube Pets 用 pet:animal-cat 這種寫法）
  --cols N          搭配 --only 時每列幾個（預設 6）

相機：正交等角，水平 45°、俯角 30°；柔和陽光＋淺色地面；每個模型下方印檔名。
"""
import bpy
import sys
import os
import math
from mathutils import Vector, Euler

PROJ = r"D:\Claude\Projects\GAME DIY"
MODELS_DIR = os.path.join(PROJ, "IMAGE", "zy3d", "models")
PETS_DIR = os.path.join(PROJ, "IMAGE", "_src", "iso", "kits", "cube-pets", "Models", "GLB format")
DEFAULT_OUT = os.path.join(PROJ, "IMAGE", "_src", "iso", "models_preview.png")

# 排版：由後排到前排。前排放方塊動物，原版 Cube Pets 夾在中間方便比對比例
LAYOUT = [
    ["balloon_red", "balloon_blue", "balloon_green", "balloon_yellow", "egg", "egg_crack"],
    ["mole", "mole_hit", "hole", "frog_jump", "pet:animal-fox", "pet:animal-panda"],
    ["pet:animal-cat", "bear", "owl", "frog", "mole"],
]
# 第 3 排第 5 格是「地鼠從洞裡冒出」的組合示意：在地鼠底下多放一個洞
COMBO = {(2, 4): "hole"}

SPACING = 3.4       # 格距（世界單位；Cube Pets 身寬 1.25）
ROW_SPACING = 6.2   # 排距（俯角 30°，畫面上只剩一半高）


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opt = {"out": DEFAULT_OUT, "res": 2000, "only": None, "cols": 6}
    i = 0
    while i < len(argv):
        k = argv[i]
        if k == "--out":
            opt["out"] = argv[i + 1]; i += 2
        elif k == "--res":
            opt["res"] = int(argv[i + 1]); i += 2
        elif k == "--only":
            opt["only"] = [s for s in argv[i + 1].split(",") if s]; i += 2
        elif k == "--cols":
            opt["cols"] = int(argv[i + 1]); i += 2
        else:
            i += 1
    return opt


def hex_lin(h, a=1.0):
    """#rrggbb（sRGB）→ Blender 線性色"""
    h = h.lstrip("#")
    out = []
    for i in range(3):
        c = int(h[i * 2:i * 2 + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


def glb_path(name):
    if name.startswith("pet:"):
        return os.path.join(PETS_DIR, name[4:] + ".glb")
    return os.path.join(MODELS_DIR, name + ".glb")


def import_at(name, pos):
    """匯入 GLB，整組平移到 pos（x,y），底部貼地 z=0；回傳 (holder, bbox_min, bbox_max)"""
    path = glb_path(name)
    if not os.path.exists(path):
        print("[preview] 找不到", path)
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    holder = bpy.data.objects.new("holder_" + name, None)
    bpy.context.scene.collection.objects.link(holder)
    for o in new:
        if o.parent is None:
            o.parent = holder
    bpy.context.view_layer.update()
    pts = []
    for o in new:
        if o.type == 'MESH':
            for v in o.data.vertices:
                pts.append(o.matrix_world @ v.co)
    if not pts:
        return None
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (mn + mx) / 2
    holder.location = Vector((pos[0] - c.x, pos[1] - c.y, -mn.z))
    bpy.context.view_layer.update()
    off = holder.location
    return holder, mn + off, mx + off


def make_label(text, loc, rot, size):
    cu = bpy.data.curves.new("lbl_" + text, 'FONT')
    cu.body = text
    cu.align_x = 'CENTER'
    cu.align_y = 'TOP'
    cu.size = size
    ob = bpy.data.objects.new("lbl_" + text, cu)
    bpy.context.scene.collection.objects.link(ob)
    try:
        ob.visible_shadow = False   # 文字不投影
    except Exception:
        pass
    ob.location = loc
    ob.rotation_euler = rot
    mat = bpy.data.materials.get("lbl_mat")
    if mat is None:
        # 文字用自發光深青色（UI 規範 #24515c），不受光影影響
        mat = bpy.data.materials.new("lbl_mat")
        nt = mat.node_tree
        nt.nodes.clear()
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = hex_lin("#24515c")
        em.inputs["Strength"].default_value = 1.0
        outn = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(em.outputs[0], outn.inputs[0])
    cu.materials.append(mat)
    return ob


def setup_render(scene, res_x, res_y):
    # EEVEE（Blender 4.2+ 叫 BLENDER_EEVEE_NEXT，5.x 又改回 BLENDER_EEVEE）
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    # Standard 色彩轉換：平塗色才會跟色票一致（AgX 會洗淡）
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    try:
        scene.eevee.taa_render_samples = 64
    except Exception:
        pass
    try:
        scene.eevee.use_shadows = True
    except Exception:
        pass
    # 世界光：淡藍白環境光，讓暗面不死黑
    world = bpy.data.worlds.new("preview_world")
    scene.world = world
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == 'BACKGROUND')
    bg.inputs["Color"].default_value = hex_lin("#dfe9f0")
    bg.inputs["Strength"].default_value = 0.9


def main():
    opt = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # 相機方向：水平 45°、俯角 30°（rotation_x = 90-30 = 60°）
    cam_rot = Euler((math.radians(60), 0.0, math.radians(45)), 'XYZ')
    rm = cam_rot.to_matrix()
    right = rm @ Vector((1, 0, 0))
    up = rm @ Vector((0, 1, 0))
    fwd = rm @ Vector((0, 0, -1))
    # 地面上的「畫面右」與「畫面深處」方向（用來排格子，讓排列在畫面上是水平的）
    g_right = Vector((right.x, right.y, 0)).normalized()
    g_depth = Vector((fwd.x, fwd.y, 0)).normalized()

    if opt["only"]:
        names = opt["only"]
        cols = max(1, min(opt["cols"], len(names)))
        layout = [names[i:i + cols] for i in range(0, len(names), cols)]
        layout.reverse()  # 第一個名字放前排左邊
        combo = {}
    else:
        layout = LAYOUT
        combo = COMBO

    all_pts = []
    labels = []
    nrows = len(layout)
    for r, row in enumerate(layout):
        n = len(row)
        for c, name in enumerate(row):
            # r=0 是最後排（離相機最遠、畫面最上方）
            depth = ((nrows - 1) / 2 - r) * ROW_SPACING
            lateral = (c - (n - 1) / 2) * SPACING
            p = g_right * lateral + g_depth * depth
            res = import_at(name, (p.x, p.y))
            if res is None:
                continue
            holder, mn, mx = res
            label = name.replace("pet:", "") + ("" if name.startswith("pet:") else ".glb")
            if (r, c) in combo:
                # 組合格：額外放一個洞在同位置，並把地鼠往下沉一點，看起來從洞裡冒出
                res2 = import_at(combo[(r, c)], (p.x, p.y))
                if res2:
                    holder.location.z -= 0.25
                    label = name + " + " + combo[(r, c)]
                    mn2, mx2 = res2[1], res2[2]
                    mn = Vector((min(mn.x, mn2.x), min(mn.y, mn2.y), 0))
                    mx = Vector((max(mx.x, mx2.x), max(mx.y, mx2.y), max(mx.z, mx2.z)))
            for x in (mn.x, mx.x):
                for y in (mn.y, mx.y):
                    for z in (mn.z, mx.z):
                        all_pts.append(Vector((x, y, z)))
            # 標籤：放在模型最前緣再往前一點（才不會被土堆之類蓋住），面向相機；
            # 文字從原點往下長，所以原點抬高避免沉到地面下
            near = min((Vector((x, y, 0)) - Vector((p.x, p.y, 0))).dot(g_depth)
                       for x in (mn.x, mx.x) for y in (mn.y, mx.y))
            front = Vector((p.x, p.y, 0.0)) + g_depth * (near - 0.7) + up * 0.42
            labels.append((label, front))

    for text, loc in labels:
        ob = make_label(text, loc, cam_rot, 0.30)
        all_pts.append(loc - up * 0.45)

    # 地面：一大片淺色平面接影子
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
    ground = bpy.context.active_object
    gm = bpy.data.materials.new("ground_mat")
    bsdf = gm.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_lin("#c9d6dc")
    bsdf.inputs["Roughness"].default_value = 1.0
    ground.data.materials.append(gm)

    # 依所有內容在相機平面上的投影，算出畫面大小
    xs = [p.dot(right) for p in all_pts]
    ys = [p.dot(up) for p in all_pts]
    w = max(xs) - min(xs)
    h = max(ys) - min(ys)
    margin = 1.08
    w *= margin
    h *= margin
    res_x = opt["res"]
    res_y = max(200, int(round(res_x * h / w)))
    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2
    center = right * cx + up * cy
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = w
    cam_data.clip_start = 0.1
    cam_data.clip_end = 400
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.rotation_euler = cam_rot
    cam.location = center - fwd * 60
    scene.camera = cam

    # 陽光：從畫面左上前方打下來，柔和陰影
    sun_data = bpy.data.lights.new("sun", 'SUN')
    sun_data.energy = 2.6
    sun_data.angle = math.radians(12)
    sun_data.color = (1.0, 0.97, 0.92)
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    light_dir = (-right * 0.8 - fwd * 0.6 + Vector((0, 0, 1.6))).normalized()
    sun.rotation_euler = light_dir.to_track_quat('Z', 'Y').to_euler()

    setup_render(scene, res_x, res_y)
    os.makedirs(os.path.dirname(opt["out"]), exist_ok=True)
    scene.render.filepath = opt["out"]
    bpy.ops.render.render(write_still=True)
    print("[preview] 輸出", opt["out"], res_x, "x", res_y)


main()
