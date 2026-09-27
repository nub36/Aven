#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — clay-рендеры ЧИСТОЙ SCULPT-BASE (НЕ Female Aven).
#
# Вход:  prototype/assets/3d/sculpt/female-aven-sculpt-base.blend
# Выход: research/3d/v2/out/sculpt_base/*.png (gitignore; в PR — только листы)
#
# Ракурсы: front / left 3/4 / right 3/4 / left profile / right profile
# (одинаковые масштаб/FOV, нейтральная база) + вид reference-стенда (сверху-
# сбоку: модель + 6 калиброванных image-плейнов).
#
# Запуск: LD_LIBRARY_PATH=/home/user/env/xstubs /home/user/venv-bpy/bin/python \
#           research/3d/v2/sculpt_base_renders.py
# ============================================================================
import math
import os

import numpy as np
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLEND = os.path.join(REPO, "prototype", "assets", "3d", "sculpt",
                     "female-aven-sculpt-base.blend")
OUT = os.path.join(HERE, "out", "sculpt_base")
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
objs = {o.name: o for o in bpy.data.objects}
print("objects:", sorted(objs.keys()))

# геометрия НЕ проверяется на соответствие GLB: base — отдельная чистая мешь
# (REJECTED fit тут ни при чём); сверка базы с basehuman.npz — в build-скрипте.
eyes = objs["eyes_L"]
eye_mid = np.array([eyes.matrix_world @ v.co for v in eyes.data.vertices]).mean(0)
eye_mid = np.concatenate([eye_mid[:1].mean() + 0 * eye_mid[:1], eye_mid[1:]]) \
    if False else eye_mid  # левый глаз; x-центр = 0 по симметрии
target_face = Vector((0.0, eye_mid[1], eye_mid[2]))
target_full = Vector((0.0, eye_mid[1] + 0.02, eye_mid[2] - 0.10))

# плейны по умолчанию ВИДИМЫ (emission) — для setup-вида; для clay-видов
# скроем ВСЁ вспомогательное (refs + guides + подписи), чтобы видеть чистую
# геометрию без засорения кадра
ref_objs = [o for n, o in objs.items() if n.startswith("REF_")]
guide_objs = [o for n, o in objs.items()
              if n.startswith(("GUIDE_", "LABEL_", "SCULPT_GUIDE"))]

cam_data = bpy.data.cameras.new("RenderCam")
cam_data.lens = 60.0
cam_data.sensor_fit = "HORIZONTAL"
cam_data.sensor_width = 36.0
cam = bpy.data.objects.new("RenderCam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

f_dir = Vector((0.0, -1.0, 0.0))   # перед модели
L_dir = Vector((1.0, 0.0, 0.0))    # лево субъекта


def cam_pos(target, az_deg, el_deg, dist):
    az, el = math.radians(az_deg), math.radians(el_deg)
    d = (f_dir * math.cos(az) + L_dir * math.sin(az)) * math.cos(el) + \
        Vector((0, 0, 1)) * math.sin(el)
    return target + d * dist


def look_at(ob, target):
    d = target - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render(name, target, az, el, dist, rx, ry, hide_refs, lens=60.0):
    cam_data.lens = lens
    for o in ref_objs + guide_objs:
        o.hide_render = hide_refs
    scene.render.resolution_x = rx
    scene.render.resolution_y = ry
    cam.location = cam_pos(target, az, el, dist)
    look_at(cam, target)
    scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("rendered:", name)


scene.render.engine = "CYCLES"
scene.cycles.samples = 128
try:
    scene.cycles.use_denoising = True
except Exception:
    pass
scene.render.film_transparent = False

# --- 5 clay видов (плейны скрыты) ---
render("base_clay_front", target_full, 0, 4, 1.62, 960, 1200, True)
render("base_clay_left34", target_full, 42, 5, 1.62, 960, 1200, True)
render("base_clay_right34", target_full, -42, 5, 1.62, 960, 1200, True)
render("base_clay_left_profile", target_full, 90, 3, 1.62, 960, 1200, True)
render("base_clay_right_profile", target_full, -90, 3, 1.62, 960, 1200, True)

# --- reference-стенд (плейны видны, изометрия сверху-сбоку; широко, чтобы
# поместились все 6 плейнов стенда диаметром ~2.8 м) ---
render("base_reference_setup", target_face, 50, 30, 3.1, 1400, 1000, False,
       lens=40.0)

print("DONE")
