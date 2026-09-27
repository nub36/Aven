#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — Stage 2: базовый человек (MPFB 2, CC0) + предподгонка.
#
# Что делает:
#   - создаёт neutral female (young adult) base mesh MPFB (CC0, топология hm08);
#   - ПРЕДПОДГОНКА ПРОПОРЦИЙ: по измерениям canonical front reference
#     (landmarks.json) vs нейтральный меш выбирает corrective-таргеты MPFB
#     (mouth/nose/eyes/head/chin scale и т.п.) с весами из лог-отношений —
#     это топологически "родная" деформация, которая приближаетneutral face
#     к пропорциям Aven до тонкого RBF-фита (Stage 4);
#   - загружает ВСЕ 34 expression units (MakeHuman FACS-style, CC0) как shape keys;
#   - загружает CC0-прокси: глаза (high-poly), зубы, язык, ресницы;
#   - сохраняет out/basehuman.blend, out/basehuman.npz (вершины/грани/UV,
#     оффсеты correctives и expression units), out/basehuman_meta.json.
#
# Запуск (bpy 5.0 headless):
#   LD_LIBRARY_PATH=$ENV/xstubs $ENV/venv-bpy/bin/python fit_02_basehuman.py
# ============================================================================
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

ENV_ROOT = os.environ.get("AVEN3D_ENV", "/home/user/env")
MPFB_USERDATA = os.path.join(ENV_ROOT, "mpfb_userdata")

# --- макро-параметры базового человека --------------------------------------
MACROS = {
    "gender": 0.0,        # 0 = female
    "age": 0.5,           # adult (0.35 = подросток, ~1.45 м!)
    "muscle": 0.30,
    "weight": 0.35,
    "height": 0.50,
    "proportions": 0.50,
    "cupsize": 0.30,
    "firmness": 0.50,
    "caucasian": 1.0, "asian": 0.0, "african": 0.0,
}


def bootstrap_mpfb():
    import bpy
    bpy.ops.extensions.repo_refresh_all()
    if "bl_ext.user_default.mpfb" not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
    import importlib

    def dyn(pkg, key):
        for amod in list(sys.modules):
            if amod.endswith(pkg):
                return getattr(importlib.import_module(amod), key)
        raise ValueError("module not found: " + pkg)
    return dyn


def mesh_arrays(obj):
    me = obj.data
    n = len(me.vertices)
    verts = np.zeros((n, 3))
    for i, v in enumerate(me.vertices):
        verts[i] = v.co
    faces = np.zeros((len(me.polygons), max(len(p.vertices) for p in me.polygons)), dtype=np.int32)
    for i, p in enumerate(me.polygons):
        faces[i, :len(p.vertices)] = p.vertices
    uv = None
    if me.uv_layers and me.uv_layers.active:
        layer = me.uv_layers.active.data
        uv = np.zeros((len(me.loops), 2))
        for i, loop in enumerate(layer):
            uv[i] = loop.uv
    return verts, faces, uv


# --- измерения нейтрального лица (mesh, через маски expression-юнитов) ------
def mesh_face_measures(verts, unit_masks, groups):
    x, y, z = verts[:, 0], verts[:, 1], verts[:, 2]
    eyeL = verts[groups["joint-l-eye"][0]]
    eyeR = verts[groups["joint-r-eye"][0]]
    if eyeL[0] < eyeR[0]:
        eyeL, eyeR = eyeR, eyeL
    z_eye = 0.5 * (eyeL[2] + eyeR[2])

    def mask_of(*names):
        out = []
        for n in unit_masks:
            if n in names:
                out.extend(unit_masks[n])
        return np.array(sorted(set(out)), dtype=np.int64)

    m = {}
    m["iris_span"] = eyeL[0] - eyeR[0]
    # веки -> ширина глазной щели и уровень глаз
    lidL = verts[mask_of("eye-left-closure")]
    lidR = verts[mask_of("eye-right-closure")]
    m["eye_width"] = float(lidL[:, 0].max() - lidL[:, 0].min())
    # губы
    lips = verts[mask_of("mouth-compression", "mouth-pursing", "mouth-eversion",
                         "mouth-part-later", "mouth-protusion")]
    lips = lips[np.abs(lips[:, 0]) < 0.055]
    m["mouth_width"] = float(lips[:, 0].max() - lips[:, 0].min())
    m["mouth_z"] = float(np.median(lips[:, 2]))
    # нос
    nose = verts[mask_of("nose-compression", "nose-left-dilatation",
                         "nose-right-dilatation", "nose-depression")]
    nose = nose[(np.abs(nose[:, 0]) < 0.045) & (nose[:, 2] < z_eye)]
    m["nose_width"] = float(nose[:, 0].max() - nose[:, 0].min())
    # подбородок: низ ротовой зоны
    mo = verts[mask_of("mouth-open")]
    ch = mo[(mo[:, 1] < -0.10) & (mo[:, 2] < m["mouth_z"] - 0.01)]
    chin_z = float(ch[:, 2].min())
    m["eye_to_chin"] = z_eye - chin_z
    m["mouth_to_chin"] = m["mouth_z"] - chin_z
    # ширина лица: боковой контур головы на уровне скул (БЕЗ ушей: y фронтальнее)
    band = (np.abs(z - (z_eye - 0.045)) < 0.015) & (y < -0.045) & (y > -0.09)
    m["face_width"] = float(verts[band][:, 0].max() - verts[band][:, 0].min())
    m["eye_z"] = float(z_eye)
    m["chin_z"] = chin_z
    m["face_ratio_h_w"] = m["eye_to_chin"] / m["face_width"]
    return m


# --- измерения canonical reference (image) ----------------------------------
def image_face_measures(lm):
    px = np.array(lm["views"]["front"]["landmarks_px"])
    m = {}
    m["iris_span"] = px[473][0] - px[468][0]
    m["face_width"] = px[454][0] - px[234][0]
    eye_y = 0.5 * (px[159][1] + px[386][1])
    m["eye_to_chin"] = px[152][1] - eye_y
    m["mouth_width"] = px[291][0] - px[61][0]
    m["nose_width"] = px[327][0] - px[98][0]
    m["eye_width"] = ((px[133][0] - px[33][0]) + (px[263][0] - px[362][0])) / 2
    m["mouth_to_chin"] = px[152][1] - 0.5 * (px[13][1] + px[14][1])
    m["face_ratio_h_w"] = m["eye_to_chin"] / m["face_width"]
    return m


def choose_preshape(mesh_m, img_m):
    """Рецепт предподгонки. Абсолютный масштаб камеры = среднее из iris_span и
    eye_to_chin (стабильные признаки); веса = (img/s)/mesh - 1; нормировка
    ширины лица — только для формы (oval)."""
    s1 = img_m["iris_span"] / mesh_m["iris_span"]
    s2 = img_m["eye_to_chin"] / mesh_m["eye_to_chin"]
    s = 0.5 * (s1 + s2)

    def ratio(key):
        return (img_m[key] / s) / mesh_m[key]

    r = {}
    r["mouth"] = ratio("mouth_width")
    r["nose"] = ratio("nose_width")
    r["eye"] = ratio("eye_width")
    r["head_h"] = ratio("eye_to_chin")
    r["head_w"] = ratio("face_width")
    r["iris"] = ratio("iris_span")
    r["chin"] = ratio("mouth_to_chin")

    def w(rr, gain=1.0):
        return float(np.clip((rr - 1.0) * gain, -1.0, 1.0))

    plan = []

    def add(name, weight, min_abs=0.05):
        if abs(weight) >= min_abs:
            suffix = "incr" if weight > 0 else "decr"
            plan.append((f"{name}-{suffix}", abs(weight)))

    add("head-scale-vert", w(r["head_h"], 1.5))
    add("head-scale-horiz", w(r["head_w"], 1.5))
    # форма лица: овальность (scale-free)
    oval_delta = (img_m["face_ratio_h_w"] / mesh_m["face_ratio_h_w"]) - 1.0
    if oval_delta > 0.03:
        plan.append(("head-oval", float(np.clip(oval_delta * 4, 0, 1))))
    add("mouth-scale-horiz", w(r["mouth"], 1.5))
    add("mouth-lowerlip-width", w(r["mouth"], 0.7))
    add("mouth-upperlip-width", w(r["mouth"], 0.7))
    add("nose-scale-horiz", w(r["nose"], 1.5))
    add("nose-width1", w(r["nose"], 0.8))
    eye_w = w(r["eye"], 1.0)
    plan.append(("l-eye-scale-incr" if eye_w > 0 else "l-eye-scale-decr", abs(eye_w)))
    plan.append(("r-eye-scale-incr" if eye_w > 0 else "r-eye-scale-decr", abs(eye_w)))
    add("chin-height", w(r["chin"], 1.0))
    return plan, r


def main():
    dyn = bootstrap_mpfb()
    import bpy

    HumanService = dyn("mpfb.services.humanservice", "HumanService")
    TargetService = dyn("mpfb.services.targetservice", "TargetService")
    HumanObjectProperties = dyn("mpfb.entities.objectproperties", "HumanObjectProperties")
    LocationService = dyn("mpfb.services.locationservice", "LocationService")

    # --- 1. базовый человек -------------------------------------------------
    human = HumanService.create_human(mask_helpers=False, detailed_helpers=True,
                                      extra_vertex_groups=True, feet_on_ground=True)
    for key, val in MACROS.items():
        HumanObjectProperties.set_value(key, val, entity_reference=human)
    TargetService.reapply_macro_details(human)
    print("base mesh:", len(human.data.vertices), "verts,", len(human.data.polygons), "polys")

    verts, faces, uv = mesh_arrays(human)

    # группы -> словарь
    groups = {}
    for g in human.vertex_groups:
        idxs = [v.index for v in human.data.vertices
                if any(vg.group == g.index for vg in v.groups)]
        if idxs:
            groups[g.name] = idxs

    # --- 2. expression units как shape keys (weight 0) ----------------------
    tdir = LocationService.get_mpfb_data("targets")
    expr_dir = os.path.join(tdir, "expression", "units", "caucasian")
    units = sorted(f for f in os.listdir(expr_dir) if f.endswith(".target.gz"))
    for u in units:
        TargetService.load_target(human, os.path.join(expr_dir, u), weight=0.0, name=None)
    print("expression units loaded:", len(units))

    # семантические маски юнитов (для измерений и последующих стадий)
    basis = verts.copy()
    sk_all = {}
    if human.data.shape_keys:
        for block in human.data.shape_keys.key_blocks:
            if block.name == "Basis":
                continue
            arr = np.zeros((len(verts), 3))
            for i, pt in enumerate(block.data):
                arr[i] = pt.co
            sk_all[block.name] = arr - basis
    unit_names = set(u[:-10] for u in units)
    unit_masks = {}
    for name, offs in sk_all.items():
        if name in unit_names:
            moved = np.any(np.abs(offs) > 1e-7, axis=1)
            if moved.sum() > 0:
                unit_masks[name] = np.nonzero(moved)[0].tolist()

    # --- 3. библиотека corrective-таргетов для предподгонки (веса решает
    #     Stage 3 итеративно; здесь только загружаем оффсеты с weight=0) ------
    lm = json.load(open(os.path.join(OUT, "landmarks.json")))
    img_m = image_face_measures(lm)
    print("img measures(px):", {k: round(v, 2) for k, v in img_m.items()})

    CORRECTIVE_LIB = [
        "head-scale-vert", "head-scale-horiz", "head-scale-depth",
        "head-oval", "head-diamond", "head-rectangular", "head-invertedtriangular",
        "chin-height", "chin-width", "chin-prognathism", "chin-jaw-drop",
        "mouth-scale-horiz", "mouth-scale-vert", "mouth-scale-depth",
        "mouth-upperlip-width", "mouth-lowerlip-width",
        "mouth-upperlip-height", "mouth-lowerlip-height",
        "mouth-trans-up", "mouth-trans-down", "mouth-trans-in", "mouth-trans-out",
        "nose-scale-horiz", "nose-scale-vert", "nose-scale-depth",
        "nose-width1", "nose-width2", "nose-width3", "nose-nostrils-width",
        "nose-point-width", "nose-flaring", "nose-hump", "nose-greek",
        "l-eye-scale", "r-eye-scale",
        "l-eye-height1", "r-eye-height1",
        "l-cheek-bones", "r-cheek-bones",
        "forehead-scale-vert",
        "eyebrows-trans-up", "eyebrows-trans-down",
    ]
    loaded_correctives = []
    for fam in CORRECTIVE_LIB:
        for suffix in ("incr", "decr"):
            name = f"{fam}-{suffix}"
            path = None
            for sub in ["mouth", "nose", "eyes", "head", "chin", "cheek", "face",
                        "forehead", "eyebrows", "ears", "neck", "torso"]:
                p = os.path.join(tdir, sub, name + ".target.gz")
                if os.path.exists(p):
                    path = p
                    break
            if path is not None:
                TargetService.load_target(human, path, weight=0.0, name=name)
                loaded_correctives.append(name)
    print("corrective library loaded:", len(loaded_correctives))

    # --- 4. прокси -----------------------------------------------------------
    # ВАЖНО: add_mhclo_asset импортирует геометрию в "авторских" координатах
    # OBJ; подгонку под текущий basemesh делает fit_clothes_to_human (по
    # vertex-маппингу из .mhclo). Без неё прокси висят у груди, а не у лица.
    ClothesService = dyn("mpfb.services.clothesservice", "ClothesService")
    data_dir = os.path.join(MPFB_USERDATA, "data")
    proxies = {}
    for atype, rel, key in [
            ("Eyes", "eyes/high-poly.mhclo", "eyes"),
            ("Teeth", "teeth/Teeth-base.mhclo", "teeth"),
            ("Tongue", "tongue/tongue.mhclo", "tongue"),
            ("Eyelashes", "eyelashes/eyelashes01.mhclo", "eyelashes")]:
        obj = HumanService.add_mhclo_asset(
            os.path.join(data_dir, rel), human, asset_type=atype, subdiv_levels=0,
            set_up_rigging=False, import_weights=False, import_subrig=False,
            interpolate_weights=False)
        # mhcolo грузим сами (AssetService не знает про наш mpfb_userdata)
        Mhclo = dyn("mpfb.entities.clothes.mhclo", "Mhclo")
        mhclo = Mhclo()
        mhclo.load(os.path.join(data_dir, rel))
        mhclo.clothes = obj
        ClothesService.fit_clothes_to_human(obj, human, mhclo=mhclo, set_parent=False)
        proxies[key] = obj
        import numpy as _np
        _co = _np.array([v.co for v in obj.data.vertices])
        print("proxy fitted:", key, "->", obj.name, len(obj.data.vertices),
              "verts center=", _co.mean(0).round(4).tolist())

    # --- 5. массивы для numpy-стадий ----------------------------------------
    # ВАЖНО: реальная форма человека = MIX (макро-ключи имеют ненулевые
    # значения). Экспортируем вершины ИЗ from-mix; оффсеты shape keys
    # относительны сырого Basis и остаются корректными линейными дельтами.
    probe_name = "aven_neutral_mix"
    human.shape_key_add(name=probe_name, from_mix=True)
    mix_block = human.data.shape_keys.key_blocks[probe_name]
    verts = np.zeros((len(human.data.vertices), 3))
    for i, pt in enumerate(mix_block.data):
        verts[i] = pt.co
    print("base bounds (mix):", verts.min(0).round(4), verts.max(0).round(4))
    sk_data = {}
    raw_basis = np.zeros((len(verts), 3))
    for i, pt in enumerate(human.data.shape_keys.key_blocks["Basis"].data):
        raw_basis[i] = pt.co
    if human.data.shape_keys:
        for block in human.data.shape_keys.key_blocks:
            if block.name in ("Basis", probe_name):
                continue
            arr = np.zeros((len(verts), 3))
            for i, pt in enumerate(block.data):
                arr[i] = pt.co
            sk_data[block.name] = arr - raw_basis
    print("shape keys:", len(sk_data))

    proxy_data = {}
    for key, obj in proxies.items():
        pverts, pfaces, puv = mesh_arrays(obj)
        proxy_data[key] = {"verts": pverts, "faces": pfaces, "uv": puv,
                           "world": np.array(obj.matrix_world, dtype=np.float64)}

    np.savez_compressed(
        os.path.join(OUT, "basehuman.npz"),
        verts=verts, faces=faces, uv=uv if uv is not None else np.zeros((0, 2)),
        sk_names=json.dumps(list(sk_data.keys())),
        **{f"sk__{k}": v for k, v in sk_data.items()},
        **{f"pv__{k}": v["verts"] for k, v in proxy_data.items()},
        **{f"pf__{k}": v["faces"] for k, v in proxy_data.items()},
        **{f"puv__{k}": (v["uv"] if v["uv"] is not None else np.zeros((0, 2)))
           for k, v in proxy_data.items()},
        **{f"pw__{k}": v["world"] for k, v in proxy_data.items()},
    )
    with open(os.path.join(OUT, "basehuman_meta.json"), "w") as f:
        json.dump({
            "macros": MACROS,
            "expression_units": [u[:-10] for u in units],
            "corrective_library": loaded_correctives,
            "unit_masks": unit_masks,
            "vertex_groups": groups,
            "proxy_names": {k: proxies[k].name for k in proxies},
            "img_measures_px": {k: float(v) for k, v in img_m.items()},
        }, f, indent=1)
    print("unit masks:", len(unit_masks), "groups:", len(groups))

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "basehuman.blend"))
    print("saved:", os.path.join(OUT, "basehuman.blend"))


def units_names(units):
    """Имена expression-юнитов из имён файлов (xxx.target.gz -> xxx)."""
    return set(u[:-10] for u in units)


if __name__ == "__main__":
    main()
