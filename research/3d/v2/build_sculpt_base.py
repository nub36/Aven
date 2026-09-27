#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — следующий этап после отклонения автоматического face fit:
# СБОРКА BLENDER SCULPT-BASE ПРОЕКТА (ЧИСТАЯ base head, БЕЗ TPS-деформаций).
#
# ВАЖНО: геометрия берётся из out/basehuman.npz — это MPFB hm08 с макросами
# (gender 0, age 0.5 ADULT, muscle 0.30, weight 0.35, height 0.50, caucasian)
# ДО identity warp. Никакого TPS/RBF/landmark-fit. Прокси (глаза/зубы/язык/
# ресницы) — уже fitted к этой чистой базе (fit_02).
#
# Выход:
#   prototype/assets/3d/sculpt/female-aven-sculpt-base.blend  (+ .meta.json)
#
# Структура .blend (коллекции):
#   FEMALE_AVEN_BASE — Body (бюст: голова+шея+плечи, крышки срезов)
#   EYES             — eyes_L / eyes_R (отдельные глазные яблоки)
#   FACE_PROXIES     — Teeth / Tongue / Eyelashes (скрыты по умолчанию)
#   RIG              — armature root/spine/neck/head/jaw/eye.L/eye.R (БЕЗ весов:
#                      скульпт идёт на чистом меше; морфы НЕ переносились)
#   REFERENCES       — 6 image-плейнов + 6 камер, калиброванных по анатомии
#                      базы (глаза/подбородок/кончик носа) и ландмаркам референсов
#   GUIDES           — ось симметрии, горизонтальные уровни (brow/eyes/nose/
#                      mouth/chin), текстовый SCULPT GUIDE
#
# Запуск: LD_LIBRARY_PATH=/home/user/env/xstubs /home/user/venv-bpy/bin/python \
#           research/3d/v2/build_sculpt_base.py
# ============================================================================
import hashlib
import json
import math
import os

import numpy as np
import bpy
from mathutils import Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(HERE, "out")
SCULPT_DIR = os.path.join(REPO, "prototype", "assets", "3d", "sculpt")
os.makedirs(SCULPT_DIR, exist_ok=True)
BLEND_PATH = os.path.join(SCULPT_DIR, "female-aven-sculpt-base.blend")
META_PATH = os.path.join(SCULPT_DIR, "female-aven-sculpt-base.meta.json")
REF_DIR = os.path.join(REPO, "prototype", "assets", "character",
                       "v2-reference-views")
MASTER = os.path.join(REPO, "prototype", "assets", "character", "master",
                      "female-aven-reference.jpg")

Z_CUT = 1.15  # нижняя граница бюста (как в Stage 5)

# --------------------------------------------------------------------------
# 0. входные данные
# --------------------------------------------------------------------------
npz = np.load(os.path.join(OUT, "basehuman.npz"))
meta = json.load(open(os.path.join(OUT, "basehuman_meta.json")))
lm = json.load(open(os.path.join(OUT, "landmarks.json")))["views"]
groups = meta["vertex_groups"]

verts_all = npz["verts"]
body_idx = np.array(groups["body"])
bv = verts_all[body_idx]
npz_sha = hashlib.sha256(open(os.path.join(OUT, "basehuman.npz"), "rb")
                         .read()).hexdigest()
print("basehuman.npz sha256:", npz_sha[:16], "…  body verts:", len(bv))

# --------------------------------------------------------------------------
# 1. анатомические якоря ЧИСТОЙ базы (объективно, из геометрии)
# --------------------------------------------------------------------------
eye_proxy = npz["pv__eyes"]
eye_L = eye_proxy[eye_proxy[:, 0] > 0].mean(axis=0)
eye_R = eye_proxy[eye_proxy[:, 0] <= 0].mean(axis=0)
eye_mid = (eye_L + eye_R) / 2.0
# подбородок: самая низкая передняя точка лица
m_chin = (np.abs(bv[:, 0]) < 0.025) & (bv[:, 1] < -0.08) & (bv[:, 2] > 1.33)
chin_pt = bv[m_chin][bv[m_chin][:, 2].argmin()]
# кончик носа: самая передняя точка в области носа
m_nose = ((np.abs(bv[:, 0]) < 0.015) & (bv[:, 2] > 1.40) & (bv[:, 2] < 1.52)
          & (bv[:, 1] < -0.05))
nose_pt = bv[m_nose][bv[m_nose][:, 1].argmin()]
crown_z = float(bv[:, 2].max())
print("anchors: eye_mid", np.round(eye_mid, 4), "chin", np.round(chin_pt, 4),
      "nose", np.round(nose_pt, 4), "crown_z", round(crown_z, 4))

# --------------------------------------------------------------------------
# 2. бюст-вырез чистой базы (логика Stage 5: квады -> трис, крышки выреза)
# --------------------------------------------------------------------------
from collections import defaultdict


def triangulate(quads):
    q = np.asarray(quads, dtype=np.int64)
    return np.vstack([q[:, [0, 1, 2]], q[:, [0, 2, 3]]])


def cut_boundary_loops(faces_body, kept_mask):
    edge_faces = defaultdict(list)
    for fi, (a, b, c) in enumerate(faces_body):
        for i, j in ((a, b), (b, c), (c, a)):
            edge_faces[(i, j)].append(fi)
    undirected = defaultdict(list)
    for (i, j), fis in edge_faces.items():
        undirected[(min(i, j), max(i, j))].extend(fis)
    dir_edges = {}
    for (i, j), fis in edge_faces.items():
        kept = [f for f in fis if kept_mask[f]]
        if len(kept) != 1:
            continue
        ukey = (min(i, j), max(i, j))
        others = [f for f in undirected[ukey] if not kept_mask[f]]
        if not others:
            continue
        dir_edges[i] = j
    used, loops = set(), []
    for start, first_to in dir_edges.items():
        if (start, first_to) in used:
            continue
        loop = [start]
        cur_from, cur_to = start, first_to
        used.add((cur_from, cur_to))
        while True:
            loop.append(cur_to)
            nxt = dir_edges.get(cur_to)
            if nxt is None or (cur_to, nxt) in used or len(loop) > 100000:
                break
            used.add((cur_to, nxt))
            cur_from, cur_to = cur_to, nxt
            if cur_to == start:
                break
        if len(loop) >= 3:
            loops.append(loop[:-1] if loop[-1] == loop[0] else loop)
    return loops


in_body = np.zeros(len(verts_all), dtype=bool)
for v in groups["body"]:
    in_body[v] = True
quads_all = npz["faces"].astype(np.int64)
face_mask = in_body[quads_all[:, 0]] & in_body[quads_all[:, 1]] & \
    in_body[quads_all[:, 2]] & in_body[quads_all[:, 3]]
faces_body = triangulate(quads_all[face_mask])
centroid_z = verts_all[faces_body].mean(axis=1)[:, 2]
kept_mask = centroid_z > Z_CUT
kept = faces_body[kept_mask]
loops = cut_boundary_loops(faces_body, kept_mask)
print("bust: tris", len(kept), "cut loops", [len(l) for l in loops])

used = sorted(set(kept.flatten().tolist()))
old2new = {o: i for i, o in enumerate(used)}
bust_v = verts_all[used].copy()
bust_f = np.array([[old2new[int(v)] for v in t] for t in kept], dtype=np.int64)
for loop in loops:
    idxs = [old2new[v] for v in loop]
    center = bust_v[idxs].mean(0)
    bust_v = np.vstack([bust_v, center])
    ci = len(bust_v) - 1
    n = len(idxs)
    for i in range(n):
        bust_f = np.vstack([bust_f, [idxs[i], idxs[(i + 1) % n], ci]])
print("clean bust: verts", len(bust_v), "tris", len(bust_f))

# --------------------------------------------------------------------------
# 3. калибровка reference-плейнов (все числа из ландмарок + анатомии базы)
# --------------------------------------------------------------------------
# масштаб вида: px/м по высоте глаза-подбородок (устойчивая мера лица)
def s_view(view):
    """px/м по высоте глаза-подбородок (landmarks reference ↔ анатомия базы)."""
    p = lm[view]["landmarks_px"]
    eye_py = (p[468][1] + p[473][1]) / 2.0
    chin_py = p[152][1]
    return (chin_py - eye_py) / float(eye_mid[2] - chin_pt[2]), p

CAL = {}
for view in ["front", "left34", "right34", "left_profile", "right_profile"]:
    s, p = s_view(view)
    CAL[view] = {"s": s, "iris_mid_px": ((p[468][0] + p[473][0]) / 2.0,
                                         (p[468][1] + p[473][1]) / 2.0)}
    print("scale %-14s %.0f px/m" % (view, s))
s_aux_avg = float(np.mean([CAL[v]["s"] for v in CAL]))
CAL["back"] = {"s": s_aux_avg}  # ландмарок нет (face_found=False)
print("scale back (avg aux) %.0f px/m" % s_aux_avg)

# --------------------------------------------------------------------------
# 4. сборка сцены
# --------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

COLS = {}
for name in ["FEMALE_AVEN_BASE", "EYES", "FACE_PROXIES", "RIG",
             "REFERENCES", "GUIDES"]:
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    COLS[name] = c


def new_mesh(name, v, f, coll):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(x) for x in v], [], [tuple(t) for t in f])
    me.validate()
    ob = bpy.data.objects.new(name, me)
    COLS[coll].objects.link(ob)
    return ob


body_ob = new_mesh("Body", bust_v, bust_f, "FEMALE_AVEN_BASE")

# прокси: глаза (split L/R), зубы, язык, ресницы
pf = {"eyes": triangulate(npz["pf__eyes"]),
      "teeth": triangulate(npz["pf__teeth"]),
      "tongue": triangulate(npz["pf__tongue"]),
      "eyelashes": triangulate(npz["pf__eyelashes"])}
pv = {k: npz["pv__" + k] for k in pf}
side = pv["eyes"][:, 0] > 0
eyesL_f = pf["eyes"][side[pf["eyes"]].all(axis=1)]
eyesR_f = pf["eyes"][~side[pf["eyes"]].all(axis=1)]
eyesL_v = pv["eyes"][side]
eyesR_v = pv["eyes"][~side]
eye_L_ob = new_mesh("eyes_L", eyesL_v, eyesL_f, "EYES")
eye_R_ob = new_mesh("eyes_R", eyesR_v, eyesR_f, "EYES")
teeth_ob = new_mesh("Teeth", pv["teeth"], pf["teeth"], "FACE_PROXIES")
tongue_ob = new_mesh("Tongue", pv["tongue"], pf["tongue"], "FACE_PROXIES")
lash_ob = new_mesh("Eyelashes", pv["eyelashes"], pf["eyelashes"],
                   "FACE_PROXIES")
for ob in [teeth_ob, tongue_ob, lash_ob]:
    ob.hide_set(True)      # не мешают скульпту; включаются по необходимости
    ob.hide_render = True
print("proxies: eyes %d/%d, teeth %d, tongue %d, lashes %d" %
      (len(eyesL_v), len(eyesR_v), len(pv["teeth"]), len(pv["tongue"]),
       len(pv["eyelashes"])))

# --- clay-материалы (нейтральные, та же схема что в clay_review) -----------
def clay_mat(name, color, rough=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    try:
        b.inputs["Metallic"].default_value = 0.0
    except Exception:
        pass
    b.inputs["Roughness"].default_value = rough
    return mat


mat_skin = clay_mat("ClaySkin", (0.80, 0.80, 0.82), 0.72)
mat_eye = clay_mat("ClayEye", (0.52, 0.53, 0.57), 0.45)
mat_mouth = clay_mat("ClayMouth", (0.72, 0.72, 0.74), 0.7)
for ob, mat in [(body_ob, mat_skin), (eye_L_ob, mat_eye), (eye_R_ob, mat_eye),
                (teeth_ob, mat_mouth), (tongue_ob, mat_mouth)]:
    if ob.data.materials:
        ob.data.materials[0] = mat
    else:
        ob.data.materials.append(mat)

# --- риг (КОСТИ БЕЗ ВЕСОВ: скульпт на чистом меше) -------------------------
arm_data = bpy.data.armatures.new("SculptRig")
arm = bpy.data.objects.new("SculptRig", arm_data)
COLS["RIG"].objects.link(arm)
bones = [
    ("root", (0, 0, 1.14), (0, 0, 1.22), ""),
    ("spine", (0, 0, 1.22), (0, 0, 1.33), "root"),
    ("neck", (0, 0, 1.33), (0, 0, 1.45), "spine"),
    ("head", (0, 0, 1.45), (0, 0, 1.62), "neck"),
    ("jaw", (0, -0.03, 1.455), (0, -0.16, 1.415), "head"),
    ("eye.L", tuple(eye_L), tuple(eye_L + (0, -0.02, 0)), "head"),
    ("eye.R", tuple(eye_R), tuple(eye_R + (0, -0.02, 0)), "head"),
]
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for name, head, tail, parent in bones:
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = head, tail
    if parent:
        b.parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")
arm_data.display_type = "OCTAHEDRAL"
arm.show_in_front = True
print("rig: 7 bones, NO weights (sculpt first)")

# --------------------------------------------------------------------------
# 5. REFERENCES: 6 image-плейнов + 6 камер
# --------------------------------------------------------------------------
REFS = [
    # view, файл, d_cam (модель->камера), anchor
    ("front", os.path.join(REF_DIR, "front-reference.jpg"),
     Vector((0, -1, 0)), "eyes"),
    ("left34", os.path.join(REF_DIR, "candidate-left-34.jpg"),
     Vector((math.sin(math.radians(45)), -math.cos(math.radians(45)), 0)),
     "eyes"),
    ("right34", os.path.join(REF_DIR, "candidate-right-34.jpg"),
     Vector((-math.sin(math.radians(45)), -math.cos(math.radians(45)), 0)),
     "eyes"),
    ("left_profile", os.path.join(REF_DIR, "candidate-left-profile.jpg"),
     Vector((1, 0, 0)), "nose"),
    ("right_profile", os.path.join(REF_DIR, "candidate-right-profile.jpg"),
     Vector((-1, 0, 0)), "nose"),
    ("back", os.path.join(REF_DIR, "candidate-back-hair.jpg"),
     Vector((0, 1, 0)), "head"),
]
PLANE_DIST = 1.05

def ref_plane_mat(name, img):
    """Emission-материал плейна: картинка видна в Material Preview и рендере;
    backface culling — с обратной стороны плейн прозрачен (не мешает скульпту)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf:
        nt.nodes.remove(bsdf)
    out = nt.nodes.get("Material Output") or nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


plane_info = {}
for view, path, d_cam, anchor_kind in REFS:
    img = bpy.data.images.load(path)
    img.name = "REF_" + view
    img.pack()  # .blend самодостаточен
    W, H = img.size
    s_px_per_m = CAL[view]["s"]
    wpp = 1.0 / s_px_per_m  # метров на пиксель
    if anchor_kind == "eyes":
        ax, ay = CAL[view]["iris_mid_px"]
        anchor_w = Vector(eye_mid)
    elif anchor_kind == "nose":
        p = lm[view]["landmarks_px"]
        ax, ay = p[1]  # кончик носа
        anchor_w = Vector((0.0, nose_pt[1], nose_pt[2]))
    else:  # back: ландмарок нет — центрируем по голове
        ax, ay = W / 2.0, H / 2.0
        anchor_w = Vector((0.0, 0.0, (crown_z + chin_pt[2]) / 2.0))
    q = d_cam.to_track_quat("Z", "Y")  # нормаль плейна -> к камере вида
    X = q @ Vector((1, 0, 0))
    Y = q @ Vector((0, 1, 0))
    x_loc = (ax - W / 2.0) * wpp
    y_loc = (H / 2.0 - ay) * wpp
    center = anchor_w + d_cam * PLANE_DIST - X * x_loc - Y * y_loc
    # mesh-плейн c UV (primitive_plane_add), масштаб в метрах
    bpy.ops.mesh.primitive_plane_add(size=2, location=center)
    e = bpy.context.active_object
    e.name = "REF_" + view
    e.rotation_mode = "QUATERNION"
    e.rotation_quaternion = q
    e.scale = (W * wpp / 2.0, H * wpp / 2.0, 1.0)
    e.data.materials.append(ref_plane_mat("MAT_REF_" + view, img))
    for c in list(e.users_collection):
        c.objects.unlink(e)
    COLS["REFERENCES"].objects.link(e)
    plane_info[view] = {"image": os.path.basename(path),
                        "px_per_m": round(float(s_px_per_m), 1),
                        "anchor": anchor_kind}
    # камера вида
    cam_data = bpy.data.cameras.new("CAM_" + view)
    cam_data.lens = 50.0
    cam = bpy.data.objects.new("CAM_" + view, cam_data)
    target = Vector(eye_mid) + Vector((0, 0, -0.02))
    cam.location = target + d_cam * 1.55 + Vector((0, 0, 0.05))
    direction = target - cam.location
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = direction.to_track_quat("-Z", "Y")
    COLS["REFERENCES"].objects.link(cam)
print("references: %d planes + %d cameras" % (len(REFS), len(REFS)))

# --------------------------------------------------------------------------
# 6. GUIDES: ось симметрии, уровни, sculpt-гайд
# --------------------------------------------------------------------------
def small_plane(name, w, h, loc, coll="GUIDES"):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0),
                    (w / 2, h / 2, 0), (-w / 2, h / 2, 0)], [],
                   [(0, 1, 2), (0, 2, 3)])
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    COLS[coll].objects.link(ob)
    return ob


axis = small_plane("GUIDE_axis_X0", 0.0025, 0.5, (0, 0, 1.40))

mat_guide = clay_mat("GuideColor", (0.95, 0.55, 0.15), 0.5)
axis.data.materials.append(mat_guide)

# горизонтальные уровни из front-ландмарок (метры, через s_front)
fp = lm["front"]["landmarks_px"]
s_front = CAL["front"]["s"]
wpp_front = 1.0 / s_front
eye_py = (fp[468][1] + fp[473][1]) / 2.0


def z_world(py):
    return eye_mid[2] + (eye_py - py) * wpp_front


LEVELS = [
    ("brow", (fp[105][1] + fp[334][1]) / 2.0),
    ("eyes", eye_py),
    ("nose_tip", fp[1][1]),
    ("mouth", (fp[13][1] + fp[14][1]) / 2.0),
    ("chin", fp[152][1]),
]
levels_m = {}
for name, py in LEVELS:
    z = z_world(py)
    levels_m[name] = round(float(z), 4)
    ln = small_plane("GUIDE_level_" + name, 0.60, 0.0025, (0, 0, z))
    ln.data.materials.append(mat_guide)
    txt = bpy.data.curves.new("LABEL_" + name, type="FONT")
    txt.body = "%s z=%.3f" % (name, z)
    txt.size = 0.016
    t = bpy.data.objects.new("LABEL_" + name, txt)
    t.location = (-0.33, 0, z)
    COLS["GUIDES"].objects.link(t)
print("levels (m):", levels_m)

# текстовый sculpt-гайд в сцене
GUIDE_TEXT = (
    "FEMALE AVEN — SCULPT GUIDE (neutral face, symmetry X ON)\n"
    "0. База = усреднённый человек. Задача: довести до Female Aven ПО REFERENCE.\n"
    "1. skull / общий объём головы   2. forehead\n"
    "3. brow ridge                   4. eye sockets\n"
    "5. положение и размер глаз      6. nose bridge\n"
    "7. nose projection              8. nose tip\n"
    "9. nostrils                    10. cheekbones\n"
    "11. cheeks                     12. mouth width\n"
    "13. upper/lower lips           14. philtrum\n"
    "15. chin                       16. jawline\n"
    "17. ears                       18. neck transition\n"
    "ПРАВИЛА: symmetry X до мелких деталей; landmarks (GUIDES) — только визуальные\n"
    "подсказки, НЕ жёсткие ограничения; микродетали кожи — после утверждения identity.\n"
    "ПОРЯДОК: neutral face -> утверждение владельцем -> rig -> blendshapes -> materials."
)
gtxt = bpy.data.curves.new("SCULPT_GUIDE", type="FONT")
gtxt.body = GUIDE_TEXT
gtxt.size = 0.014
gtxt.align_x = "LEFT"
guide_ob = bpy.data.objects.new("SCULPT_GUIDE_TEXT", gtxt)
guide_ob.location = (-0.95, 0.0, 1.25)
guide_ob.rotation_euler = (math.radians(90), 0, math.radians(90))
COLS["GUIDES"].objects.link(guide_ob)

# --- studio-свет + нейтральный мир (для просмотра; как в clay_review) ------
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
    ob.visible_camera = False
    scene.collection.objects.link(ob)
    return ob

add_light("key", (-0.7, -1.6, 2.05), 100.0, 1.2)
add_light("fillR", (1.4, -1.0, 1.65), 50.0, 1.6)
add_light("fillL", (-1.4, -1.0, 1.65), 40.0, 1.6)
add_light("rim", (0.2, 1.6, 2.0), 65.0, 1.0)

# symmetry X в sculpt-настройках (если доступно в headless)
try:
    ts = bpy.context.scene.tool_settings
    ts.sculpt.use_symmetry_x = True
    print("sculpt symmetry X: ON")
except Exception as ex:
    print("sculpt symmetry: не задано headless (%s) — включить в UI" % ex)

# --------------------------------------------------------------------------
# 7. сохранение
# --------------------------------------------------------------------------
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, compress=True)
info = {
    "name": "female-aven-sculpt-base",
    "status": "SCULPT BASE (НЕ Female Aven; автоматический face fit REJECTED)",
    "source": "MPFB2 hm08 CC0, макросы fit_02 (age 0.5 = взрослый), БЕЗ warp",
    "basehuman_npz_sha256": npz_sha,
    "base": {
        "verts": int(len(bust_v)),
        "tris": int(len(bust_f)),
        "z_cut": Z_CUT,
        "cut_loops": [len(l) for l in loops],
    },
    "anchors": {
        "eye_mid": [round(float(x), 4) for x in eye_mid],
        "eye_L": [round(float(x), 4) for x in eye_L],
        "eye_R": [round(float(x), 4) for x in eye_R],
        "chin": [round(float(x), 4) for x in chin_pt],
        "nose_tip": [round(float(x), 4) for x in nose_pt],
        "crown_z": round(float(crown_z), 4),
    },
    "proxies": {
        "eyes_L": int(len(eyesL_v)), "eyes_R": int(len(eyesR_v)),
        "teeth": int(len(pv["teeth"])), "tongue": int(len(pv["tongue"])),
        "eyelashes": int(len(pv["eyelashes"])),
    },
    "rig": {
        "bones": [b[0] for b in bones],
        "weights": "NONE (sculpt first; ARKit-морфы НЕ переносились)",
    },
    "collections": ["FEMALE_AVEN_BASE", "EYES", "FACE_PROXIES", "RIG",
                    "REFERENCES", "GUIDES"],
    "reference_planes": plane_info,
    "guide_levels_z": levels_m,
    "blend_bytes": os.path.getsize(BLEND_PATH),
}
with open(META_PATH, "w") as fp:
    json.dump(info, fp, indent=1, ensure_ascii=False)
print("saved:", BLEND_PATH, info["blend_bytes"], "bytes")
print("meta:", META_PATH)
