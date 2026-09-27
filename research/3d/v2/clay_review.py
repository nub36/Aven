#!/usr/bin/env python3
# ============================================================================
# Female Aven 3D V2 — CLAY GEOMETRY REVIEW (диагностика, БЕЗ изменения геометрии).
#
# Цель: честные рендеры ТОЧНО той геометрии, что лежит в
#   prototype/assets/3d/female-aven-v2.glb (PR #15).
#
# Метод гарантии соответствия:
#   1) сцена рендера строится ПРЯМО ИМПОРТОМ этого GLB (не из blend-исходника);
#   2) дополнительно вершины импортированного Body сверяются KDTree с базисом
#      blend-сборки (out/aven_v2_assembly.blend): каждая вершина GLB должна
#      совпасть с вершиной сборки < 1e-4 м;
#   3) все shape keys = 0 (нейтральное выражение), evaluated == basis.
#
# Что НАМЕРЕННО выключено (по заданию владельца): волосы, одежда, ресницы,
# текстуры кожи, makeup, vertex colors (материал их не читает).
# Материалы: нейтральный матовый clay (светло-серый, metallic 0, roughness 0.7);
# глаза — отдельная геометрия с более тёмным нейтральным материалом.
#
# Выход: research/3d/v2/out/clay/*.png (в .gitignore; в PR идут только листы).
#
# Запуск: LD_LIBRARY_PATH=/home/user/env/xstubs /home/user/venv-bpy/bin/python \
#           research/3d/v2/clay_review.py
# ============================================================================
import hashlib
import json
import math
import os

import numpy as np
import bpy
from mathutils import Vector, kdtree

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GLB = os.path.join(REPO, "prototype", "assets", "3d", "female-aven-v2.glb")
ASM = os.path.join(os.path.dirname(__file__), "out", "aven_v2_assembly.blend")
OUT = os.path.join(os.path.dirname(__file__), "out", "clay")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- 0. sha256 GLB
sha = hashlib.sha256(open(GLB, "rb").read()).hexdigest()
print("GLB sha256:", sha)

# --------------------------------------------- 1. базис сборки (для сверки)
bpy.ops.wm.open_mainfile(filepath=ASM)
asm_body = bpy.data.objects["Body"]
asm_co = np.array([v.co.copy() for v in asm_body.data.vertices])
print("assembly Body basis verts:", len(asm_co))

# ------------------------------------------------- 2. импорт САМОГО GLB
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
objs = {o.name: o for o in bpy.data.objects}
print("imported objects:", sorted(objs.keys()))

body = objs["Body"]

# --- 2a. нейтральность морфов
if body.data.shape_keys:
    for kb in body.data.shape_keys.key_blocks:
        kb.value = 0.0
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    d = np.array([v.co for v in ev.data.vertices]) - np.array(
        [v.co for v in body.data.vertices])
    print("shape keys:", len(body.data.shape_keys.key_blocks) - 1,
          "max |evaluated-basis| =", float(np.abs(d).max()))
    # допуск = погрешность float32 хранения вершин (~1e-7 м = 0.1 микрона)
    assert np.abs(d).max() < 1e-5, "морфы влияют на базис!"

# --- 2b. сверка вершин GLB с базисом сборки (KDTree, объективная)
glb_co = np.array([v.co.copy() for v in body.data.vertices])
print("imported Body verts:", len(glb_co))
kd = kdtree.KDTree(len(asm_co))
for i, c in enumerate(asm_co):
    kd.insert(c, i)
kd.balance()
dists = []
for c in glb_co:
    co, idx, dist = kd.find(c)
    dists.append(dist)
dists = np.array(dists)
print("GLB->assembly vertex distance: max=%.2e mean=%.2e" %
      (dists.max(), dists.mean()))
assert dists.max() < 1e-4, "геометрия GLB != геометрия сборки!"
print("VERIFIED: геометрия рендера == геометрия GLB == базис сборки")

# --- 2c. мировые ориентиры (после Y-up->Z-up конверсии импортёра)
def mesh_center(name):
    ob = objs[name]
    co = np.array([obj.matrix_world @ v.co for v in ob.data.vertices]
                  if False else
                  [ob.matrix_world @ v.co for v in ob.data.vertices])
    return co.mean(axis=0)

eyes_c = (mesh_center("eyes_L") + mesh_center("eyes_R")) / 2.0
teeth_c = mesh_center("Teeth")
print("eyes center:", np.round(eyes_c, 4), " teeth center:", np.round(teeth_c, 4))
assert abs(eyes_c[2] - 1.49) < 0.05, "глаза не на высоте головы после импорта?"
body_c = glb_co.mean(axis=0)
front = teeth_c - body_c
front[2] = 0.0
front = front / np.linalg.norm(front)
print("front dir (horizontal):", np.round(front, 3), "(ожидание ~[0,-1,0])")
assert abs(front[1] + 1.0) < 0.2, "неожиданное направление лица после импорта"

# ------------------------------------- 3. убираем волосы/одежду/ресницы
# (и всё прочее, кроме явного списка: импортёр gltf может создать служебные
#  объекты вроде Icosphere — они не должны попасть в кадр)
KEEP = {"Body", "eyes_L", "eyes_R", "Teeth", "Tongue", "AvenRig"}
for ob in list(bpy.data.objects):
    if ob.name not in KEEP:
        print("removed:", ob.name)
        bpy.data.objects.remove(ob, do_unlink=True)

# ------------------------------------- 4. clay-материалы (neutral, matte)
def clay_mat(name, color, rough=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    try:
        bsdf.inputs["Metallic"].default_value = 0.0
    except Exception:
        pass
    bsdf.inputs["Roughness"].default_value = rough
    return mat

mat_skin = clay_mat("ClaySkin", (0.80, 0.80, 0.82), 0.72)
mat_eye = clay_mat("ClayEye", (0.52, 0.53, 0.57), 0.45)
mat_mouth = clay_mat("ClayMouth", (0.72, 0.72, 0.74), 0.7)
for name, mat in [("Body", mat_skin), ("eyes_L", mat_eye), ("eyes_R", mat_eye),
                  ("Teeth", mat_mouth), ("Tongue", mat_mouth)]:
    ob = objs[name]
    for i in range(len(ob.data.materials)):
        ob.data.materials[i] = mat
    if not len(ob.data.materials):
        ob.data.materials.append(mat)

# ------------------------------------- 5. studio light (фиксирован в мире)
scene = bpy.context.scene
world = bpy.data.worlds.new("ClayWorld")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.36, 0.37, 0.40, 1.0)
bg.inputs[1].default_value = 0.55

def add_light(name, loc, power, size):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy = power
    ld.shadow_soft_size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.hide_render = False
    ob.visible_camera = False  # лампы не должны быть видны в кадре
    scene.collection.objects.link(ob)
    return ob

add_light("key", (-0.7, -1.6, 2.05), 100.0, 1.2)
add_light("fillR", (1.4, -1.0, 1.65), 50.0, 1.6)
add_light("fillL", (-1.4, -1.0, 1.65), 40.0, 1.6)
add_light("rim", (0.2, 1.6, 2.0), 65.0, 1.0)

# ------------------------------------- 6. камера + ракурсы
cam_data = bpy.data.cameras.new("ClayCam")
cam_data.lens = 60.0
cam_data.sensor_fit = "HORIZONTAL"
cam_data.sensor_width = 36.0
cam = bpy.data.objects.new("ClayCam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

# система координат вида: front = f, left = L (cross(Z, f)), up = Z
f = Vector((front[0], front[1], 0.0))
L = Vector((0.0, 0.0, 1.0)).cross(f)  # (+X при f=(0,-1,0)) — ЛЕВО субъекта

def cam_pos(target, az_deg, el_deg, dist):
    az, el = math.radians(az_deg), math.radians(el_deg)
    d = (f * math.cos(az) + L * math.sin(az)) * math.cos(el) + \
        Vector((0, 0, 1)) * math.sin(el)
    return target + d * dist

def look_at(ob, target):
    d = target - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

face_t = Vector((eyes_c * 0.6 + teeth_c * 0.4))
full_t = Vector((eyes_c + teeth_c) / 2.0) + Vector((0, 0, -0.10))

VIEWS_FULL = [  # (имя файла, азимут°, возвышение°)
    ("clay_full_front", 0, 4),
    ("clay_full_left34", 42, 5),
    ("clay_full_right34", -42, 5),
    ("clay_full_left_profile", 90, 3),
    ("clay_full_right_profile", -90, 3),
    ("clay_full_back", 180, 4),
    ("clay_full_top", 14, 33),
]
# Профильные close-up центрируем по ЦЕНТРУ ГОЛОВЫ (не лица), иначе затылок
# обрезается кадром; масштаб и FOV одинаковы во всех ракурсах.
head_sel = (glb_co[:, 2] > 1.40) & (glb_co[:, 2] < 1.65)
head_cy = float(glb_co[head_sel][:, 1].min() + glb_co[head_sel][:, 1].max()) / 2.0
print("head bbox y:", float(glb_co[head_sel][:, 1].min()),
      float(glb_co[head_sel][:, 1].max()), "center y =", round(head_cy, 4))
VIEWS_CLOSE = [
    ("clay_close_front", 0, 2, False),
    ("clay_close_left34", 42, 2, False),
    ("clay_close_right34", -42, 2, False),
    ("clay_close_left_profile", 90, 2, True),
    ("clay_close_right_profile", -90, 2, True),
]

scene.render.engine = "CYCLES"
scene.cycles.samples = 128
try:
    scene.cycles.use_denoising = True
except Exception:
    pass
scene.render.resolution_x = 960
scene.render.resolution_y = 1200
scene.render.film_transparent = False

def render_set(name, target, az, el, dist, rx, ry):
    scene.render.resolution_x = rx
    scene.render.resolution_y = ry
    cam.location = cam_pos(target, az, el, dist)
    look_at(cam, target)
    path = os.path.join(OUT, name + ".png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered:", path)

import sys as _sys
only = _sys.argv[1] if len(_sys.argv) > 1 else None
for name, az, el in VIEWS_FULL:
    if only and only not in name:
        continue
    render_set(name, full_t, az, el, 1.62, 960, 1200)
for name, az, el, center_head in VIEWS_CLOSE:
    if only and only not in name:
        continue
    t = Vector((face_t.x, head_cy, face_t.z)) if center_head else face_t
    render_set(name, t, az, el, 0.46, 1000, 1250)

# метрики для отчёта
info = {
    "glb_sha256": sha,
    "glb_verts": int(len(glb_co)),
    "assembly_verts": int(len(asm_co)),
    "kdtree_max_dist_m": float(dists.max()),
    "eyes_center": [round(float(x), 4) for x in eyes_c],
    "teeth_center": [round(float(x), 4) for x in teeth_c],
    "face_target": [round(float(x), 4) for x in face_t],
    "full_target": [round(float(x), 4) for x in full_t],
    "removed": ["Hair", "Clothes", "Eyelashes"],
    "clay": {"skin": "0.80 gray, rough 0.72", "eyes": "0.52 gray, rough 0.45",
             "metallic": 0.0},
    "lights": "key 100W (-0.7,-1.6,2.05) / fillR 50W / fillL 40W / rim 65W, "
              "bg (0.36,0.37,0.40)@0.55",
    "camera": "60mm, sensor 36mm; full: dist 1.62; close: dist 0.46",
}
with open(os.path.join(OUT, "clay_review_meta.json"), "w") as fp:
    json.dump(info, fp, indent=1)
print("meta written")
print("DONE")
