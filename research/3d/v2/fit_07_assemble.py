#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — Stage 7: сборка модели (Blender headless, чистый bpy).
#
# Вход:  out/bust.npz (геометрия бюста + юниты + прокси), out/arkit.npz,
#        out/bust.json (joints), assets_vendor/* (CC0 текстуры)
# Выход: prototype/assets/3d/female-aven-v2.glb + .stats.json,
#        out/aven_v2_assembly.blend, out/preview/*.png (QC-рендеры)
#
# Компоненты:
#   - Body: бюст (5533 v) + shape keys ARKit-51 + visemes-7;
#   - прокси: глаза (brown_eye.png), зубы, язык, ресницы (alpha);
#     ресницы получают blink-шейпы переносом от body (ближайшая вершина);
#   - волосы: процедурные "ленты" (Hair A: прямые до плеч, тёмный шоколад),
#     2 слоя, радиальный скан черепа;
#   - одежда: charcoal mock-neck (offset-shell) + violet-blue zip-акцент;
#   - риг: root/spine/neck/head/jaw/eye.L/eye.R, auto-weights для body/clothes;
#   - GLB (Y-up, morphs, skin, без Draco — морфы несовместимы с Draco);
#   - QC-рендеры Cycles CPU: 4 ракурса + 5 выражений.
#
# Запуск:
#   LD_LIBRARY_PATH=$ENV/xstubs $ENV/venv-bpy/bin/python fit_07_assemble.py
# ============================================================================
import json
import math
import os
import struct

import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GLB_PATH = os.path.join(REPO, "prototype", "assets", "3d", "female-aven-v2.glb")
STATS_PATH = os.path.join(REPO, "prototype", "assets", "3d", "female-aven-v2.stats.json")
PREVIEW_DIR = os.path.join(OUT, "preview")
AVENDOR = os.path.join(HERE, "assets_vendor")

SKIN_COLOR = (0.912, 0.762, 0.686, 1.0)     # fair warm
HAIR_COLOR = (0.145, 0.098, 0.071, 1.0)     # dark chocolate brown
CLOTH_COLOR = (0.118, 0.118, 0.133, 1.0)    # charcoal
ZIP_COLOR = (0.360, 0.404, 0.760, 1.0)      # violet-blue accent
SCLERA_TINT = (1.0, 1.0, 1.0, 1.0)


# ----------------------------------------------------------------------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def triangulate(quads):
    q = np.asarray(quads, dtype=np.int64)
    t1 = q[:, [0, 1, 2]]
    t2 = q[:, [0, 2, 3]]
    return np.vstack([t1, t2])


def uv_padded(verts, uv):
    """uv может быть короче на вершины-центры крышек — паддим нулями."""
    if len(uv) < len(verts):
        uv = np.vstack([uv, np.zeros((len(verts) - len(uv), 2))])
    return uv


def make_mesh(name, verts, faces, uv=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    me.validate()
    if uv is not None and len(uv):
        me.uv_layers.new(name="UVMap")
        # uv по loops: для треугольника (a,b,c) берём uv вершин
        layer = me.uv_layers.active.data
        for fi, poly in enumerate(me.polygons):
            for k, li in enumerate(poly.loop_indices):
                v = poly.vertices[k]
                layer[li].uv = uv[v].tolist()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def add_shape_keys(ob, basis, offsets):
    """basis (n,3) + dict name->offset (n,3)."""
    me = ob.data
    me.shape_keys or ob.shape_key_add(name="Basis", from_mix=False)
    kb = ob.data.shape_keys.key_blocks["Basis"]
    for i, v in enumerate(basis):
        kb.data[i].co = v.tolist()
    for name, off in offsets.items():
        sk = ob.shape_key_add(name=name, from_mix=False)
        for i in range(len(basis)):
            sk.data[i].co = (basis[i] + off[i]).tolist()
        sk.value = 0.0  # ВАЖНО: Blender 5.0 создаёт ключи с value=1.0
    return ob


def vertex_uv_from_loop(loop_uv, quads):
    """loop-uv квадов -> вершинные uv (первое вхождение)."""
    vuv = {}
    li = 0
    for row in np.asarray(quads):
        fs = int((row >= 0).sum())
        for k in range(fs):
            vi = int(row[k])
            if vi not in vuv:
                vuv[vi] = loop_uv[li + k]
        li += fs
    return vuv


def principled(name, base_color=None, image=None, rough=0.5, alpha=False,
               metallic=0.0, backface=True, alpha_clip=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if base_color:
        bsdf.inputs["Base Color"].default_value = base_color
    if image:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha:
            try:
                mat.blend_method = "CLIP" if alpha_clip else "HASHED"
                mat.shadow_method = "CLIP" if alpha_clip else "HASHED"
            except Exception:
                pass  # Blender 5.0: blend_method может быть удалён
            mat.use_backface_culling = False
            mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    if backface:
        mat.use_backface_culling = False
    return mat


# --- волосы: процедурные ленты ------------------------------------------------
def build_hair(base_verts, base_faces):
    """Радиальный скан головы -> ленты волос до плеч (2 слоя).

    Тангаж: theta вокруг оси Z, 0 = лицо (-Y), против часовой (в сторону +X).
    Лицо открыто: |theta| < FACE_HALF ниже лба.
    """
    x, y, z = base_verts[:, 0], base_verts[:, 1], base_verts[:, 2]
    z_crown = z.max()
    z_eye = 1.494
    FACE_HALF = math.radians(42)
    Z_SHOULDER = 1.27
    Z_HAIRLINE = 1.545

    def head_radius(theta, zz):
        """Макс радиус в секторе ±10° на высоте zz±0.012 (только голова/шея)."""
        ang = np.arctan2(x, -y)  # 0 = -Y (лицо)
        d = np.abs(np.angle(np.exp(1j * (ang - theta))))
        m = (d < math.radians(10)) & (np.abs(z - zz) < 0.014)
        if m.sum() < 3:
            return None
        r = np.sqrt(x[m] ** 2 + y[m] ** 2)
        return float(np.percentile(r, 95))

    ribbons = []  # (theta)
    N = 40
    for i in range(N):
        theta = -math.pi + (i + 0.5) * 2 * math.pi / N
        # центральные углы относительно лица
        rel = (theta + math.pi) % (2 * math.pi) - math.pi
        if abs(rel) < FACE_HALF:
            continue
        ribbons.append(theta)

    layers = []
    for layer, (off, zlen) in enumerate([(0.010, 1.0), (0.024, 1.0)]):
        verts = []
        faces = []
        for theta in ribbons:
            rel = (theta + math.pi) % (2 * math.pi) - math.pi
            frontish = abs(rel) < math.radians(75)
            # вертикальная полилиния
            zs = np.linspace(z_crown + 0.004, Z_SHOULDER, 14)
            pts = []
            for zz in zs:
                if abs(rel) < FACE_HALF and zz < 1.575:
                    continue  # лицо открыто
                r = head_radius(theta, min(zz, 1.50))
                if r is None:
                    # ниже головы: волосы висят вокруг шеи
                    r = max(head_radius(theta, 1.42) or 0.085, 0.085)
                    r = r * 1.06 + 0.02 * max(0.0, 1.42 - zz)
                else:
                    if zz < 1.42:  # плавный отвод от шеи
                        r = r * 1.04 + 0.015 * max(0.0, 1.42 - zz)
                rr = r + off
                px = rr * math.sin(theta)
                py = -rr * math.cos(theta)
                pts.append((px, py, zz))
            if len(pts) < 3:
                continue
            base_i = len(verts)
            for p in pts:
                verts.append(p)
            for k in range(len(pts) - 1):
                a = base_i + k
                b = base_i + k + 1
                c = a + 1  # заглушка, заменим ниже
                # лента шириной w вдоль тангенциального направления
            # ширина ленты
            w = 2 * math.pi * 0.10 / len(ribbons) * 1.15
        # строим ленту как quad-strip: для каждой полилинии делаем 2 ряда
        verts2 = []
        faces2 = []
        for theta in ribbons:
            rel = (theta + math.pi) % (2 * math.pi) - math.pi
            zs = np.linspace(z_crown + 0.004, Z_SHOULDER, 14)
            pts = []
            for zz in zs:
                if abs(rel) < FACE_HALF and zz < 1.575:
                    continue
                r = head_radius(theta, min(zz, 1.50))
                if r is None:
                    r = max(head_radius(theta, 1.42) or 0.085, 0.085)
                    r = r * 1.06 + 0.02 * max(0.0, 1.42 - zz)
                else:
                    if zz < 1.42:
                        r = r * 1.04 + 0.015 * max(0.0, 1.42 - zz)
                rr = r + off
                tang = (math.cos(theta), math.sin(theta), 0.0)  # тангенс
                w = 2 * math.pi * max(rr, 0.05) / len(ribbons) * 1.05
                px = rr * math.sin(theta)
                py = -rr * math.cos(theta)
                pts.append(((px + tang[0] * w / 2, py + tang[1] * w / 2, zz),
                            (px - tang[0] * w / 2, py - tang[1] * w / 2, zz)))
            if len(pts) < 3:
                continue
            b0 = len(verts2)
            for left, right in pts:
                verts2.append(left)
                verts2.append(right)
            for k in range(len(pts) - 1):
                a0, a1 = b0 + 2 * k, b0 + 2 * k + 1
                b0n, b1n = b0 + 2 * (k + 1), b0 + 2 * (k + 1) + 1
                faces2.append((a0, a1, b1n))
                faces2.append((a0, b1n, b0n))
        layers.append((np.array(verts2, dtype=np.float64),
                       np.array(faces2, dtype=np.int64)))
    # объединяем слои
    all_v = [l[0] for l in layers]
    all_f = []
    shift = 0
    for v, f in layers:
        all_f.append(f + shift)
        shift += len(v)
    verts = np.vstack(all_v)
    faces = np.vstack(all_f)
    return verts, faces


# --- одежда: offset-shell ------------------------------------------------------
def build_clothes(base_verts, base_faces):
    x, y, z = base_verts[:, 0], base_verts[:, 1], base_verts[:, 2]
    centroid_z = base_verts[base_faces].mean(axis=1)[:, 2]
    Z_TOP = 1.425
    mask = (centroid_z > 1.165) & (centroid_z < Z_TOP)
    faces = base_faces[mask]
    idx = np.array(sorted(set(faces.flatten().tolist())), dtype=np.int64)
    old2new = {int(o): i for i, o in enumerate(idx)}
    sub = base_verts[idx]
    # нормали вершин подмножества
    sub_faces = np.array([[old2new[int(v)] for v in t] for t in faces])
    n = _vertex_normals(sub, sub_faces)
    sub = sub + n * 0.009
    return sub, sub_faces, idx, old2new


def _vertex_normals(verts, faces):
    v = verts
    f = faces.astype(np.int64)
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    fn = np.cross(b - a, c - a)
    vn = np.zeros_like(v)
    for k in range(3):
        np.add.at(vn, f[:, k], fn)
    norm = np.linalg.norm(vn, axis=1, keepdims=True)
    norm[norm < 1e-12] = 1.0
    return vn / norm


# --- рендеры -------------------------------------------------------------------
def setup_render():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 640
    sc.render.resolution_y = 800
    sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new("World")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.32, 0.33, 0.36, 1.0)
    bg.inputs[1].default_value = 0.5
    # свет: трёхточечная схема
    for name, loc, energy in [
            ("key", (-0.8, -1.5, 2.0), 160),
            ("fill", (1.5, -1.0, 1.7), 60),
            ("rim", (0.4, 1.6, 1.9), 110)]:
        lamp_data = bpy.data.lights.new(name, "AREA")
        lamp_data.energy = energy
        lamp_data.size = 1.6
        lamp = bpy.data.objects.new(name, lamp_data)
        lamp.location = loc
        lamp.rotation_euler = mathutils_target(loc, (0.0, -0.10, 1.47))
        # светильники НЕ видны камере (иначе заливают кадр белым)
        try:
            lamp.visible_camera = False
        except Exception:
            try:
                lamp.cycles_visibility.camera = False
            except Exception:
                pass
        bpy.context.scene.collection.objects.link(lamp)


def render_cam(azimuth_deg, name, target=(0.0, -0.10, 1.44), dist=1.55,
               height=1.50):
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam_" + name)
    cam = bpy.data.objects.new("cam_" + name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    az = math.radians(azimuth_deg)
    # камера ходит вокруг оси Z; 0 = перед лицом (-Y)
    cam.location = (-dist * math.sin(az), -dist * math.cos(az), height)
    direction = mathutils_target(cam.location, target)
    cam.rotation_euler = direction
    sc.camera = cam
    sc.render.filepath = os.path.join(PREVIEW_DIR, name + ".png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def mathutils_target(loc, target):
    import mathutils
    d = mathutils.Vector(target) - mathutils.Vector(loc)
    return d.to_track_quat("-Z", "Y").to_euler()


# ----------------------------------------------------------------------------
def main():
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    bust = np.load(os.path.join(OUT, "bust.npz"))
    arkit = np.load(os.path.join(OUT, "arkit.npz"))
    bust_meta = json.load(open(os.path.join(OUT, "bust.json")))

    base = bust["verts"]
    faces = bust["faces"]
    uv = bust["uv"]
    arkit_names = json.loads(open(os.path.join(OUT, "arkit.json")).read())
    arkit_list = arkit_names["names"]
    viseme_list = arkit_names["viseme_names"]

    clear_scene()

    # --- 1. body --------------------------------------------------------------
    body = make_mesh("Body", base, faces, uv_padded(base, uv))
    offsets = {}
    for n in arkit_list + viseme_list:
        if n == "viseme_sil":
            continue
        offsets[n] = arkit["sk__" + n]
    add_shape_keys(body, base, offsets)
    print("body:", len(base), "verts,", len(faces), "tris,",
          len(offsets), "shape keys")

    # --- 2. прокси --------------------------------------------------------------
    proxies = {}
    tex_specs = {
        "eyes": ("brown_eye.png", 0.25),
        "teeth": ("teeth.png", 0.35),
        "tongue": ("tongue01_diffuse.png", 0.5),
        "eyelashes": ("eyelashes01.png", 0.55),
    }
    tex_dirs = {"eyes": AVENDOR + "/eyes", "teeth": AVENDOR + "/teeth",
                "tongue": AVENDOR + "/tongue", "eyelashes": AVENDOR + "/eyelashes"}
    quads_raw = {k: bust["pf__" + k] for k in ["eyes", "teeth", "tongue", "eyelashes"]}
    for key in ["eyes", "teeth", "tongue", "eyelashes"]:
        pv = bust["pv__" + key]
        pf = bust["pf__" + key]  # уже треугольники (триангуляция в Stage 5)
        # восстанавливаем квады (порядок triangulate: t1=(a,b,c), t2=(a,c,d))
        tri = np.asarray(pf, dtype=np.int64)
        quads = np.stack([tri[0::2, 0], tri[0::2, 1], tri[0::2, 2],
                          tri[1::2, 2]], axis=1)
        vuv_map = vertex_uv_from_loop(bust["puv__" + key], quads)
        vuv = np.array([vuv_map.get(i, (0.0, 0.0)) for i in range(len(pv))])
        if key == "eyes":
            # делим на два глаза для раздельного вращения костями
            for side, sgn in [("eyes_L", +1), ("eyes_R", -1)]:
                verts_mask = sgn * pv[:, 0] > -0.004
                viset = set(np.nonzero(verts_mask)[0].tolist())
                fsel = np.array([all(int(v) in viset for v in t) for t in pf])
                fsub = pf[fsel]
                idx = np.array(sorted({int(v) for t in fsub for v in t}))
                m = {int(o): i for i, o in enumerate(idx)}
                ob = make_mesh(side, pv[idx],
                               np.array([[m[int(v)] for v in t] for t in fsub]),
                               vuv[idx])
                proxies[side] = ob
                print("proxy:", side, len(idx), "verts")
        else:
            ob = make_mesh(key.capitalize(), pv, pf, vuv)
            proxies[key] = ob
            print("proxy:", key, len(pv), "verts")

    # --- 3. шейпы век на ресницах ----------------------------------------------
    lash = proxies["eyelashes"]
    assert lash is not None
    lash_v = bust["pv__eyelashes"]
    # ближайшая ВЕРШИНА ВЕКА (маска eye-*-closure) для каждой вершины ресниц —
    # семантически правильная привязка blink-смещений
    lid_union = []
    for u in ["eye-left-closure", "eye-right-closure"]:
        off = bust["sk__" + u]
        lid_union.extend(np.nonzero((np.linalg.norm(off, axis=1) > 1e-6))[0].tolist())
    lid_union = np.array(sorted(set(lid_union)), dtype=np.int64)
    lids = base[lid_union]
    d2 = ((lash_v[:, None, :] - lids[None, :, :]) ** 2).sum(axis=2)
    idx_l = np.argmin(d2, axis=1)
    idx = lid_union[idx_l]
    d = np.sqrt(d2[np.arange(len(lash_v)), idx_l])
    near = d < 0.030
    lash_offsets = {}
    for n in ["eyeBlinkLeft", "eyeBlinkRight", "eyeSquintLeft",
              "eyeSquintRight", "eyeWideLeft", "eyeWideRight",
              "eyeLookDownLeft", "eyeLookDownRight",
              "eyeLookUpLeft", "eyeLookUpRight"]:
        off = arkit["sk__" + n][idx] * near[:, None]
        lash_offsets[n] = off
    add_shape_keys(lash, lash_v, lash_offsets)
    print("eyelash shape keys:", len(lash_offsets),
          "near-body frac: %.2f" % near.mean())

    # --- 4. волосы ---------------------------------------------------------------
    hair_v, hair_f = build_hair(base, faces)
    hair = make_mesh("Hair", hair_v, hair_f)
    print("hair:", len(hair_v), "verts,", len(hair_f), "tris")

    # --- 5. одежда -----------------------------------------------------------------
    cloth_v, cloth_f, cloth_idx, cloth_map = build_clothes(base, faces)
    cloth = make_mesh("Clothes", cloth_v, cloth_f)
    print("clothes:", len(cloth_v), "verts,", len(cloth_f), "tris")

    # --- 6. материалы ----------------------------------------------------------------
    mat_skin = principled("AvenSkin", base_color=SKIN_COLOR, rough=0.52,
                          metallic=0.0)
    body.data.materials.append(mat_skin)

    # 6a. vertex colors: брови (тёмные), губы (тёплый розовый), скальф под
    # волосами (тёмный, чтобы не просвечивал череп); переходы сглаживаем
    # усреднением по соседям
    def mask_union(names):
        out = []
        for u in names:
            key = "sk__" + u
            if key in bust.files:
                off = bust[key]
                out.extend(np.nonzero((np.linalg.norm(off, axis=1) > 1e-6))[0].tolist())
        return np.array(sorted(set(out)), dtype=np.int64)

    n_v = len(base)
    vc = np.ones((n_v, 3))
    lips_m = mask_union(["mouth-compression", "mouth-pursing", "mouth-eversion",
                         "mouth-part-later", "mouth-protusion"])
    lips_m = np.array([i for i in lips_m if i < n_v and
                       abs(base[i][2] - 1.439) < 0.030 and base[i][1] < -0.12],
                      dtype=np.int64)
    vc[lips_m] = (0.86, 0.60, 0.62)
    brows_m = mask_union(["eyebrows-left-up", "eyebrows-right-up",
                          "eyebrows-left-down", "eyebrows-right-down",
                          "eyebrows-left-inner-up", "eyebrows-right-inner-up",
                          "eyebrows-left-extern-up", "eyebrows-right-extern-up"])
    brows_m = np.array([i for i in brows_m if i < n_v and base[i][2] > 1.49],
                       dtype=np.int64)
    vc[brows_m] = (0.34, 0.28, 0.25)
    scalp_m = np.nonzero((base[:, 2] > 1.545) & (base[:, 1] > -0.06))[0]
    vc[scalp_m] = (0.36, 0.30, 0.27)
    # сглаживание: соседство по граням
    neighbor = [set() for _ in range(n_v)]
    for a, b, c in faces:
        neighbor[a].update((b, c)); neighbor[b].update((a, c)); neighbor[c].update((a, b))
    for _ in range(12):
        sm = vc.copy()
        for i in range(n_v):
            if neighbor[i]:
                avg = np.zeros(3)
                for j in neighbor[i]:
                    avg += vc[j]
                sm[i] = 0.45 * vc[i] + 0.55 * avg / len(neighbor[i])
        vc = sm
    # применяем как color attribute
    cattr = body.data.attributes.new("Col", "FLOAT_COLOR", "POINT")
    for i in range(n_v):
        cattr.data[i].color = (vc[i][0], vc[i][1], vc[i][2], 1.0)
    print("vertex colors: lips %d, brows %d, scalp %d" %
          (len(lips_m), len(brows_m), len(scalp_m)))

    img_eyes = bpy.data.images.load(tex_dirs["eyes"] + "/brown_eye.png")
    mat_eyes = principled("AvenEyes", image=img_eyes, rough=0.2)
    proxies["eyes_L"].data.materials.append(mat_eyes)
    proxies["eyes_R"].data.materials.append(mat_eyes)

    img_teeth = bpy.data.images.load(tex_dirs["teeth"] + "/teeth.png")
    mat_teeth = principled("AvenTeeth", image=img_teeth, rough=0.32)
    proxies["teeth"].data.materials.append(mat_teeth)

    img_tongue = bpy.data.images.load(tex_dirs["tongue"] + "/tongue01_diffuse.png")
    mat_tongue = principled("AvenTongue", image=img_tongue, rough=0.5)
    proxies["tongue"].data.materials.append(mat_tongue)

    img_lash = bpy.data.images.load(tex_dirs["eyelashes"] + "/eyelashes01.png")
    mat_lash = principled("AvenLashes", image=img_lash, rough=0.55, alpha=True)
    proxies["eyelashes"].data.materials.append(mat_lash)

    mat_hair = principled("AvenHair", base_color=HAIR_COLOR, rough=0.45)
    hair.data.materials.append(mat_hair)

    mat_cloth = principled("AvenCloth", base_color=CLOTH_COLOR, rough=0.85)
    mat_zip = principled("AvenZip", base_color=ZIP_COLOR, rough=0.4)
    cloth.data.materials.append(mat_cloth)
    # zip-акцент: передние центральные треугольники воротника
    cz = cloth_v[cloth_f].mean(axis=1)
    cy = cloth_v[cloth_f].mean(axis=1)
    cx = cloth_v[cloth_f].mean(axis=1)
    zip_mask = (np.abs(cx) < 0.016) & (cy < -0.08)
    if zip_mask.sum():
        cloth.data.polygons[len(cloth.data.polygons) - len(cloth_f):]
        for fi, m in enumerate(zip_mask):
            if m:
                cloth.data.polygons[fi].material_index = 1
        cloth.data.materials.append(mat_zip)
    print("zip faces:", int(zip_mask.sum()))

    # --- 7. риг ------------------------------------------------------------------------
    # центры глазных яблок — из фitten-прокси (pivot глазной кости = центр глаза)
    def eye_center(ob):
        co = np.array([v.co for v in ob.data.vertices])
        return co.mean(axis=0)
    ec_l = eye_center(proxies["eyes_L"])
    ec_r = eye_center(proxies["eyes_R"])
    print("eye centers: L %s R %s" % (np.round(ec_l, 4), np.round(ec_r, 4)))

    arm_data = bpy.data.armatures.new("AvenRig")
    arm = bpy.data.objects.new("AvenRig", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    joints = bust_meta["joints"]
    bones = [
        ("root", (0, 0, 1.14), (0, 0, 1.22), ""),
        ("spine", (0, 0, 1.22), (0, 0, 1.33), "root"),
        ("neck", (0, 0, 1.33), (0, 0, 1.45), "spine"),
        ("head", (0, 0, 1.45), (0, 0, 1.62), "neck"),
        ("jaw", (0, -0.02, 1.455), (0, -0.185, 1.415), "head"),
        ("eye.L", tuple(ec_l), tuple(ec_l + (0.0, -0.02, 0.0)), "head"),
        ("eye.R", tuple(ec_r), tuple(ec_r + (0.0, -0.02, 0.0)), "head"),
    ]
    for name, head, tail, parent in bones:
        b = arm_data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    # --- 8. весы ---------------------------------------------------------------------
    # body + clothes: автоматические веса (bone heat)
    for ob in [body, cloth]:
        ob.parent = arm
        ob.select_set(True)
    body.select_set(True)
    cloth.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # глазные кости НЕ должны тянуть кожу: глаза — отдельные объекты (bone-parent)
    for vg_name in ("eye.L", "eye.R"):
        for ob in (body, cloth):
            vg = ob.vertex_groups.get(vg_name)
            if vg:
                ob.vertex_groups.remove(vg)
    print("eye vertex groups removed from body/clothes")
    # жёсткое парентинг: глаза -> глазные кости, прочее -> head
    for key, bone in [("eyes_L", "eye.L"), ("eyes_R", "eye.R"),
                      ("teeth", "head"), ("tongue", "jaw"),
                      ("eyelashes", "head")]:
        ob = proxies[key]
        ob.parent = arm
        ob.parent_type = "BONE"
        ob.parent_bone = bone
        # ВАЖНО: Blender парентит объект к ХВОСТУ кости:
        # P = matrix_local @ T(0, bone.length, 0); компенсируем полностью
        import mathutils
        b = arm.data.bones[bone]
        bone_m = arm.matrix_world @ b.matrix_local @ \
            mathutils.Matrix.Translation((0.0, b.length, 0.0))
        ob.matrix_parent_inverse = bone_m.inverted()
    hair.parent = arm
    hair.parent_type = "BONE"
    hair.parent_bone = "head"
    import mathutils
    hb = arm.data.bones["head"]
    bone_m = arm.matrix_world @ hb.matrix_local @ \
        mathutils.Matrix.Translation((0.0, hb.length, 0.0))
    hair.matrix_parent_inverse = bone_m.inverted()
    print("rig + weights done")

    # --- 9. сохранение blend -----------------------------------------------------------
    bpy.ops.wm.save_as_mainfile(
        filepath=os.path.join(OUT, "aven_v2_assembly.blend"))

    # --- 10. GLB экспорт -----------------------------------------------------------------
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH, export_format="GLB", export_morph=True,
        export_skins=True, export_animations=False,
        export_apply=False, export_yup=True,
        export_extras=False)
    print("GLB:", GLB_PATH, os.path.getsize(GLB_PATH), "bytes")

    # --- 11. QC-рендеры -------------------------------------------------------------------
    setup_render()
    render_cam(0, "v2_front")
    render_cam(35, "v2_left34")
    render_cam(-35, "v2_right34")
    render_cam(90, "v2_left")
    render_cam(-90, "v2_right")
    render_cam(180, "v2_back")
    # выражения (фронт)
    exprs = [("smile", {"mouthSmileLeft": 0.8, "mouthSmileRight": 0.8}),
             ("jawopen", {"jawOpen": 0.65}),
             ("blink", {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0}),
             ("viseme_o", {"viseme_O": 0.9}),
             ("brow", {"browInnerUp": 0.8, "browOuterUpLeft": 0.5,
                       "browOuterUpRight": 0.5})]
    for ename, params in exprs:
        for k, v in params.items():
            body.data.shape_keys.key_blocks[k].value = v
            if k in lash.data.shape_keys.key_blocks:
                lash.data.shape_keys.key_blocks[k].value = v
        render_cam(0, "v2_expr_" + ename)
        for k in params:
            body.data.shape_keys.key_blocks[k].value = 0.0
            if k in lash.data.shape_keys.key_blocks:
                lash.data.shape_keys.key_blocks[k].value = 0.0
    print("previews:", sorted(os.listdir(PREVIEW_DIR)))

    # --- 12. статистика --------------------------------------------------------------------
    def obj_tris(ob):
        return len(ob.data.polygons)

    def obj_verts(ob):
        return len(ob.data.vertices)

    def glb_count(kind):
        """Подсчёт вершин/треугольников прямо в JSON-чанке GLB."""
        with open(GLB_PATH, "rb") as fp:
            head = fp.read(12)
            assert head[:4] == b"glTF", "GLB header"
            jlen = struct.unpack("<I", fp.read(4))[0]
            assert fp.read(4) == b"JSON", "GLB chunk type"
            g = json.loads(fp.read(jlen))
        total = 0
        for m in g["meshes"]:
            for p in m["primitives"]:
                if kind == "verts":
                    total += g["accessors"][p["attributes"]["POSITION"]]["count"]
                else:
                    idx = p.get("indices")
                    total += (g["accessors"][idx]["count"] if idx is not None
                              else g["accessors"][p["attributes"]["POSITION"]]["count"]) // 3
        return total

    stats = {
        "name": "female-aven-v2",
        "source": "MPFB2 (CC0 base mesh) + landmarks-driven identity warp",
        "body": {"verts": obj_verts(body), "tris": obj_tris(body)},
        "proxies": {k: {"verts": obj_verts(v), "tris": obj_tris(v)}
                    for k, v in sorted(proxies.items())},
        "hair": {"verts": obj_verts(hair), "tris": obj_tris(hair)},
        "clothes": {"verts": obj_verts(cloth), "tris": obj_tris(cloth)},
        "total_tris": sum(obj_tris(o) for o in [body, hair, cloth] +
                          list(proxies.values())),
        "total_verts": sum(obj_verts(o) for o in [body, hair, cloth] +
                           list(proxies.values())),
        "bones": [b[0] for b in bones],
        "morph_targets": sorted(offsets.keys()),
        "arkit_count": len(arkit_list),
        "visemes": [v for v in viseme_list if v != "viseme_sil"],
        "glb_bytes": os.path.getsize(GLB_PATH),
        # Точные числа ИЗ ЭКСПОРТИРОВАННОГО GLB (Blender-экспортёр дублирует
        # вершины на швах нормалей/UV, поэтому glb_verts >= total_verts)
        "glb_verts": glb_count("verts"),
        "glb_tris": glb_count("tris"),
        "textures": ["brown_eye.png (CC0 MakeHuman)", "teeth.png (CC0)",
                     "tongue01_diffuse.png (CC0)", "eyelashes01.png (CC0)"],
        "licenses": {"base_mesh": "CC0 (MakeHuman/MPFB hm08)",
                     "targets": "CC0", "three.js": "MIT"},
    }
    with open(STATS_PATH, "w") as fp:
        json.dump(stats, fp, indent=1, ensure_ascii=False)
    print("stats written:", STATS_PATH)
    print("TOTAL: %d verts, %d tris, %d morphs" %
          (stats["total_verts"], stats["total_tris"], len(stats["morph_targets"])))


if __name__ == "__main__":
    main()
