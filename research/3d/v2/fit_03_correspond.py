#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — Stage 3: предподгонка пропорций + соответствие
# mediapipe landmarks <-> вершины MPFB.
#
# Вход:  out/landmarks.json, out/basehuman.npz, out/basehuman_meta.json
# Выход: out/correspondence.json
#
# Этапы:
#   A) ИТЕРАТИВНАЯ ПРЕДПОДГОНКА: координатный спуск по corrective-таргетам
#      MPFB (CC0) — приближает пропорции нейтрального лица к пропорциям
#      canonical reference (рот/нос/глаза/высота лица/ширина лица/подбородок);
#      веса каппятся (экстраполяция линейных таргетов допустима);
#   B) робастная (IRLS/Huber) калибровка front-камеры по семантическим якорям;
#   C) RBF-перенос облака 478 landmarks в пространство меша -> соответствие
#      landmark<->вершина (порог + разрешение конфликтов);
#   D) калибровка профильных камер + z-цели контурных точек.
#
# Конвенции:
#   - MPFB-меш: лицо в -Y, верх +Z, subject's LEFT = +X.
#   - На НЕЗЕРКАЛЬНОМ фото subject's left = ПРАВАЯ половина изображения
#     => mediapipe "imgL" (например глаз 33) = mesh -X.
#   - front: px = cx + s*mx, py = cy - s*mz.
#   - профиль, видна ЛЕВАЯ сторона субъекта: px = cx + s*my (нос влево);
#     видна ПРАВАЯ: px = cx - s*my (нос вправо).
#
# Запуск: $ENV/venv-fit/bin/python fit_03_correspond.py
# ============================================================================
import json
import os

import numpy as np
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

from aven3d_common import (MP, FACE_OVAL, EYE_RING_imgL, EYE_RING_imgR, BROW_imgL,
                           BROW_imgR, LIPS_OUTER, LIPS_INNER, NOSE_BRIDGE, NOSE_BOTTOM,
                           mesh_face_measures, image_face_measures, mask_of)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

# --- какой таргет правит какую меру (порядок = последовательность решения) --
# face_width НЕ решаем таргетами: head-scale-horiz тянет глазницы (interpupillary),
# а реальную ширину скул дотянет TPS-warp (Stage 4) по контуру лица.
MEASURE_TARGETS = [
    ("eye_to_chin",   {"main": "head-scale-vert", "aux": []}),
    ("mouth_to_chin", {"main": "chin-height", "aux": []}),
    ("mouth_width",   {"main": "mouth-scale-horiz",
                       "aux": ["mouth-upperlip-width", "mouth-lowerlip-width"]}),
    ("nose_width",    {"main": "nose-scale-horiz", "aux": ["nose-width1", "nose-nostrils-width"]}),
]


def solve_preshape(verts_neutral, npz, meta, lm, steps_per_measure=10, tol=0.05,
                   wcap=3.0, damp=0.85):
    """Последовательный устойчивый solve весов corrective-таргетов.

    Камера масштабируется по eye_to_chin (стабильная крупная мера; iris_span
    у нейтрального MPFB аномально мал). Для каждой меры — конечноразностная
    чувствительность в текущей точке, шаг демпфируется, веса каппятся.
    Таргеты не двигают крайние точки (углы рта/крылья носа) — их дотянет
    TPS; здесь правится масса губ/носа изнутри.
    """
    groups = meta["vertex_groups"]
    unit_masks = meta["unit_masks"]
    img_m = image_face_measures(lm)
    weights = {}

    def target_off(name):
        return npz["sk__" + name] if ("sk__" + name) in npz.files else None

    def current_verts():
        v = verts_neutral.copy()
        for name, w in weights.items():
            off = target_off(name)
            if off is not None and w != 0:
                v = v + w * off
        return v

    base_m = mesh_face_measures(verts_neutral, unit_masks, groups)
    s_cam = img_m["eye_to_chin"] / base_m["eye_to_chin"]
    print("camera scale (pre, eye_to_chin): %.1f px/m" % s_cam)

    def m_of(v):
        return mesh_face_measures(v, unit_masks, groups)

    for measure_key, fam in MEASURE_TARGETS:
        target_val = img_m[measure_key] / s_cam
        main = fam["main"]
        cap = 1.5 if main.startswith("head") else wcap
        # "ширина" мер тянем и парой aux (по 1/3 шага) для плавности
        aux_names = [a for a in fam["aux"]
                     if target_off(a + "-decr") is not None or target_off(a + "-incr") is not None]
        for step in range(steps_per_measure):
            v = current_verts()
            m = m_of(v)
            cur = m[measure_key]
            if cur < 1e-6:
                break
            r = target_val / cur
            if abs(r - 1) < tol:
                break
            eps = 0.2
            cands = [main] + aux_names
            best, best_eff = None, 0.0
            for base in cands:
                for sfx in ("decr", "incr"):
                    tn = f"{base}-{sfx}"
                    off = target_off(tn)
                    if off is None:
                        continue
                    trial = v + eps * off
                    d = (m_of(trial)[measure_key] - cur) / eps
                    if abs(d) < 1e-7:
                        continue
                    if np.sign(d) == np.sign(r - 1) and abs(d) > abs(best_eff):
                        best, best_eff = tn, d
            if best is None:
                break
            share = 1.0 / (1.0 + 0.5 * len(aux_names)) if best.rsplit("-", 1)[0] == main else 0.5
            dw = damp * share * (r - 1) * cur / best_eff
            new_w = float(np.clip(weights.get(best, 0.0) + dw, -cap, cap))
            weights[best] = new_w
        m = m_of(current_verts())
        print("measure %-14s -> mesh %.4f target %.4f ratio %.3f" %
              (measure_key, m[measure_key], target_val,
               target_val / max(m[measure_key], 1e-9)))

    v = current_verts()
    m = m_of(v)
    if abs(m["iris_span"] - base_m["iris_span"]) > 0.15 * base_m["iris_span"]:
        print("WARN: iris_span drifted: %.4f -> %.4f" % (base_m["iris_span"], m["iris_span"]))
    print("final measures:", {k: round(x, 4) for k, x in m.items()})
    print("final weights:", {k: round(w, 3) for k, w in sorted(weights.items()) if abs(w) > 1e-3})
    return v, weights, s_cam


def sem_points_from_units(verts, unit_masks, groups):
    """Семантические точки меша (imgL/imgR = сторона ИЗОБРАЖЕНИЯ = mesh ∓X)."""
    lidL = mask_of(unit_masks, "eye-left-closure")    # subject's left (+X)
    lidR = mask_of(unit_masks, "eye-right-closure")
    eye_subjL = verts[lidL].mean(0)
    eye_subjR = verts[lidR].mean(0)

    mouth_zone = mask_of(unit_masks, "mouth-open")
    lips_zone = mask_of(unit_masks, "mouth-compression", "mouth-pursing",
                        "mouth-eversion", "mouth-part-later", "mouth-protusion")
    mz = verts[mouth_zone]
    mouth_z = np.median(mz[:, 2])
    nose_zone = mask_of(unit_masks, "nose-compression", "nose-left-dilatation",
                        "nose-right-dilatation", "nose-depression")
    nz = verts[nose_zone]
    nose_tip = nz[np.argmin(nz[:, 1])]

    browL = mask_of(unit_masks, "eyebrows-left-up")
    browR = mask_of(unit_masks, "eyebrows-right-up")

    sem = {}
    for side, lid, imgside in [("subjL", lidL, "imgR"), ("subjR", lidR, "imgL")]:
        p = verts[lid]
        sgn = +1 if side == "subjL" else -1
        sem[f"eye_outer_{imgside}"] = p[np.argmax(sgn * p[:, 0])]
        sem[f"eye_inner_{imgside}"] = p[np.argmin(sgn * p[:, 0])]
        sem[f"iris_center_{imgside}"] = eye_subjL if side == "subjL" else eye_subjR
    # рот
    lv = verts[lips_zone]
    lv = lv[(lv[:, 1] < -0.09)]
    sem["mouth_corner_imgL"] = lv[np.argmin(lv[:, 0])]
    sem["mouth_corner_imgR"] = lv[np.argmax(lv[:, 0])]
    lvc = lv[np.abs(lv[:, 0]) < 0.012]
    sem["lip_top_center"] = lvc[np.argmin(lvc[:, 1])]
    sem["lip_bottom_center"] = lvc[np.argmax(lvc[:, 1])]
    # нос
    sem["nose_tip"] = nose_tip
    nas = verts[(np.abs(verts[:, 0]) < 0.006) &
                (np.abs(verts[:, 2] - (eye_subjL[2] - 0.012)) < 0.010)]
    sem["nasion"] = nas[np.argmin(nas[:, 1])]
    nz2 = verts[nose_zone]
    nz2 = nz2[(nz2[:, 2] > nose_tip[2] - 0.014) & (np.abs(nz2[:, 0]) < 0.05)]
    sem["ala_imgL"] = nz2[np.argmin(nz2[:, 0])]
    sem["ala_imgR"] = nz2[np.argmax(nz2[:, 0])]
    sn = nz2[(np.abs(nz2[:, 0]) < 0.008)]
    if len(sn):
        sem["subnasale"] = sn[np.argmin(sn[:, 1])]
    # подбородок
    ch = mz[(mz[:, 1] < -0.10) & (mz[:, 2] < mouth_z - 0.01)]
    sem["chin_bottom"] = ch[np.argmin(ch[:, 2])]
    # брови
    for side, brow, imgside in [("subjL", browL, "imgR"), ("subjR", browR, "imgL")]:
        p = verts[brow]
        sgn = +1 if side == "subjL" else -1
        sem[f"brow_inner_{imgside}"] = p[np.argmin(sgn * p[:, 0])]
        sem[f"brow_outer_{imgside}"] = p[np.argmax(sgn * p[:, 0])]
        mid = p[(np.abs(p[:, 0]) > 0.012)]
        if len(mid):
            sem[f"brow_mid_{imgside}"] = mid[np.argmin(np.abs(mid[:, 0] - sgn * 0.024))]
    return sem, {"mouth_z": float(mouth_z)}


def procrustes2d_robust(mesh_xy, img_xy, iters=6):
    """Робастная (Huber IRLS) ортокалибровка front: общий масштаб + центр.

    Модель: px = s*mx + cx, py = -s*mz + cy (масштаб общий на обе оси).
    """
    m = np.asarray(mesh_xy, dtype=np.float64)
    w = np.ones(len(m))

    def fit(w):
        A = np.zeros((2 * len(m), 3))
        b = np.zeros(2 * len(m))
        A[0::2, 0] = m[:, 0];  A[0::2, 1] = 1.0; b[0::2] = img_xy[:, 0]
        A[1::2, 0] = -m[:, 1]; A[1::2, 2] = 1.0; b[1::2] = img_xy[:, 1]
        sw = np.sqrt(np.repeat(w, 2))
        sol, *_ = np.linalg.lstsq(A * sw[:, None], b * sw, rcond=None)
        return sol

    sol = fit(w)
    for _ in range(iters):
        pred_x = sol[0] * m[:, 0] + sol[1]
        pred_y = -sol[0] * m[:, 1] + sol[2]
        r = np.linalg.norm(np.column_stack([pred_x - img_xy[:, 0], pred_y - img_xy[:, 1]]), axis=1)
        s_rob = 1.4826 * np.median(r) + 1e-9
        k = 2.0 * s_rob
        w = np.where(r <= k, 1.0, k / np.maximum(r, 1e-9))
        sol = fit(w)
    pred_x = sol[0] * m[:, 0] + sol[1]
    pred_y = -sol[0] * m[:, 1] + sol[2]
    resid = np.linalg.norm(np.column_stack([pred_x - img_xy[:, 0], pred_y - img_xy[:, 1]]), axis=1)
    return float(sol[0]), float(sol[1]), float(sol[2]), resid


def main():
    lm = json.load(open(os.path.join(OUT, "landmarks.json")))
    npz = np.load(os.path.join(OUT, "basehuman.npz"), allow_pickle=False)
    meta = json.load(open(os.path.join(OUT, "basehuman_meta.json")))
    verts_neutral = npz["verts"]
    unit_masks = meta["unit_masks"]
    groups = meta["vertex_groups"]

    # --- A. итеративная предподгонка ----------------------------------------
    verts, preshape_weights, s_pre = solve_preshape(verts_neutral, npz, meta, lm)

    sem, aux = sem_points_from_units(verts, unit_masks, groups)
    for k, v in sem.items():
        print("  sem %-22s %s" % (k, np.round(v, 4).tolist()))

    front = lm["views"]["front"]
    px = np.array(front["landmarks_px"])

    # --- B. калибровка front-камеры: структурная инициализация ----------------
    # Пропорции нейтрального лица отличаются от reference, поэтому LSQ по всем
    # якорям даёт компромиссный (неверный) масштаб. Инициализируем камеру по
    # структурным парам (межзрачковое + линия глаз->подбородок), затем
    # уточняем по всем 478 точкам соответствия (pass 0 -> 1).
    irisL = sem["iris_center_imgL"]; irisR = sem["iris_center_imgR"]
    mesh_iris_span = abs(irisR[0] - irisL[0])
    mesh_eye_z = 0.5 * (irisL[2] + irisR[2])
    img_iris_mid_x = 0.5 * (px[MP["iris_center_imgL"]][0] + px[MP["iris_center_imgR"]][0])
    img_eye_y = 0.5 * (px[159][1] + px[386][1])
    mesh_e2c = mesh_eye_z - sem["chin_bottom"][2]
    s_h = (px[MP["iris_center_imgR"]][0] - px[MP["iris_center_imgL"]][0]) / mesh_iris_span
    s_v = (px[MP["chin_bottom"]][1] - img_eye_y) / mesh_e2c
    s = 0.5 * (s_h + s_v)
    cx = img_iris_mid_x - s * 0.5 * (irisL[0] + irisR[0])
    cy = img_eye_y + s * mesh_eye_z
    print("front camera (structural): scale=%.1f px/m (h=%.1f v=%.1f) center=(%.1f, %.1f)" %
          (s, s_h, s_v, cx, cy))

    # --- C. RBF-перенос 478 landmarks + соответствие (2 прохода) -------------
    rbf_names = ["nose_tip", "nasion", "chin_bottom", "mouth_corner_imgL",
                 "mouth_corner_imgR", "eye_outer_imgL", "eye_inner_imgL",
                 "eye_outer_imgR", "eye_inner_imgR", "iris_center_imgL",
                 "iris_center_imgR", "ala_imgL", "ala_imgR", "lip_top_center",
                 "lip_bottom_center", "brow_inner_imgL", "brow_inner_imgR",
                 "subnasale"]

    def build_lm3(s_, cx_, cy_):
        lm3 = np.zeros((478, 3))
        lm3[:, 0] = (px[:, 0] - cx_) / s_
        lm3[:, 2] = (cy_ - px[:, 1]) / s_
        lm3[:, 1] = np.array(front["landmarks_norm"])[:, 2] * 0.1
        return lm3

    def rbf_map(lm3_):
        src_pts = np.array([lm3_[MP[n]] for n in rbf_names if n in sem])
        dst_pts = np.array([sem[n] for n in rbf_names if n in sem])
        interp = RBFInterpolator(src_pts, dst_pts, smoothing=1e-4,
                                 kernel="thin_plate_spline")
        return interp(lm3_)

    # соответствие ищем ТОЛЬКО по поверхностным вершинам (группа body):
    # helper-геометрия (волосы/джоинты) сидит близко к лицу и перехватывает
    # ближайших соседей у landmark'ов
    body_idx = np.array(sorted(meta["vertex_groups"]["body"]), dtype=np.int64)
    tree = cKDTree(verts[body_idx])
    lm3 = build_lm3(s, cx, cy)
    for pass_i in range(2):
        lm3_mesh = rbf_map(lm3)
        dist, idx_local = tree.query(lm3_mesh, k=1)
        idx = body_idx[idx_local]
        keep = dist < 0.03
        print("correspondence pass %d: keep %d / 478 (median=%.4f)" %
              (pass_i, keep.sum(), np.median(dist[keep])))
        if pass_i == 0:
            # уточнение ЦЕНТРА по всем надёжным точкам; масштаб (абсолютный
            # размер головы) фиксируем структурным: s задаёт, сколько метров
            # реального лица приходится на пиксель, его смещение раздувало бы
            # целевые пропорции
            ki = np.nonzero(keep)[0]
            # px = s*mx + cx -> cx = mean(px - s*mx)
            cx2 = float(np.mean(px[ki][:, 0] - s * lm3_mesh[ki][:, 0]))
            cy2 = float(np.mean(px[ki][:, 1] + s * lm3_mesh[ki][:, 2]))
            res2 = np.sqrt((s * lm3_mesh[ki][:, 0] + cx2 - px[ki][:, 0]) ** 2 +
                           (cy2 - s * lm3_mesh[ki][:, 2] - px[ki][:, 1]) ** 2)
            print("refined center: (%.1f, %.1f) resid median=%.2fpx" %
                  (cx2, cy2, np.median(res2)))
            lm3 = build_lm3(s, cx2, cy2)
            cx, cy = cx2, cy2
    keep = dist < 0.03
    resid = res2
    corr = {}
    for mp_i in np.nonzero(keep)[0]:
        v = int(idx[mp_i]); d = float(dist[mp_i])
        if v not in corr or corr[v][1] > d:
            corr[v] = (int(mp_i), d)
    corr_mp = {mp: v for v, (mp, d) in corr.items()}

    # --- D. профили ----------------------------------------------------------
    prof = {}
    for view_name in ["left_profile", "right_profile"]:
        v = lm["views"][view_name]
        if not v.get("face_found"):
            continue
        ppx = np.array(v["landmarks_px"])
        vis = np.array(v["visibility"])
        visL = float(np.mean(vis[EYE_RING_imgL]))
        visR = float(np.mean(vis[EYE_RING_imgR]))
        visible_ring_imgL = visL >= visR
        nose_x = ppx[MP["nose_tip"]][0]
        vis_eye_x = np.mean(ppx[EYE_RING_imgL][:, 0]) if visible_ring_imgL \
            else np.mean(ppx[EYE_RING_imgR][:, 0])
        nose_left_of_eye = nose_x < vis_eye_x
        subj_side = "left" if nose_left_of_eye else "right"
        ring_says = "left" if not visible_ring_imgL else "right"
        print(f"[{view_name}] ring vis imgL={visL:.2f} imgR={visR:.2f} says {ring_says}; "
              f"nose-left-of-eye={nose_left_of_eye} -> subject {subj_side}")
        if ring_says != subj_side:
            print("  WARN: heuristics disagree; trusting nose direction")

        sign = 1.0 if subj_side == "left" else -1.0
        pts3 = [("nose_tip", "nose_tip"), ("nasion", "nasion"),
                ("chin_bottom", "chin_bottom"), ("subnasale", "subnasale"),
                ("lip_top_center", "lip_top_center"),
                ("lip_bottom_center", "lip_bottom_center"),
                ("ala_imgL", "ala_imgL"), ("ala_imgR", "ala_imgR"),
                ("brow_inner_imgL", "brow_inner_imgL"),
                ("brow_inner_imgR", "brow_inner_imgR"),
                ("brow_mid_imgL", "brow_mid_imgL"),
                ("brow_mid_imgR", "brow_mid_imgR")]
        rows, rhs = [], []
        for mp_name, sem_name in pts3:
            if sem_name not in sem:
                continue
            p = sem[sem_name]
            rows.append([sign * p[1], 0.0, 1.0, 0.0]); rhs.append(ppx[MP[mp_name]][0])
            rows.append([0.0, -p[2], 0.0, 1.0]); rhs.append(ppx[MP[mp_name]][1])
        A = np.array(rows); b = np.array(rhs)
        sol, *_ = np.linalg.lstsq(A, b, rcond=None)
        pred = A @ sol
        pres = np.linalg.norm((pred - b).reshape(-1, 2), axis=1)
        prof[view_name] = {"subj_side": subj_side, "sign": sign,
                           "scale": float(sol[0]), "cx": float(sol[1]), "cy": float(sol[2]),
                           "resid_mean_px": float(pres.mean()),
                           "eye_visibility": {"imgL": round(visL, 3), "imgR": round(visR, 3)}}
        print("  profile cam: scale=%.2f px/m c=(%.1f, %.1f) resid=%.1fpx" %
              (sol[0], sol[1], sol[2], pres.mean()))

    # z-цели контурных точек
    OUTLINE_NAMES = (NOSE_BRIDGE + ["nose_tip", "subnasale", "ala_imgL", "ala_imgR",
                                    "chin_bottom", "chin_imgL", "chin_imgR",
                                    "lip_top_center", "lip_bottom_center",
                                    "brow_inner_imgL", "brow_inner_imgR",
                                    "brow_mid_imgL", "brow_mid_imgR",
                                    "forehead_mid", "forehead_high_imgL",
                                    "forehead_high_imgR", "nasion"]
                     + LIPS_OUTER[:5] + LIPS_OUTER[9:14])
    z_targets = {}
    for view_name, cam in prof.items():
        v = lm["views"][view_name]
        ppx = np.array(v["landmarks_px"])
        for name in OUTLINE_NAMES:
            mp_i = MP.get(name, name if isinstance(name, int) else None)
            if mp_i is None:
                continue
            my = cam["sign"] * (ppx[mp_i][0] - cam["cx"]) / cam["scale"]
            mz = (cam["cy"] - ppx[mp_i][1]) / cam["scale"]
            z_targets.setdefault(int(mp_i), []).append(
                {"my": float(my), "mz": float(mz), "from": view_name})
    z_agg = {}
    for mp_i, lst in z_targets.items():
        z_agg[mp_i] = {"my": float(np.mean([e["my"] for e in lst])),
                       "mz": float(np.mean([e["mz"] for e in lst])),
                       "n": len(lst)}

    def vertex_index_of(point):
        return int(np.argmin(np.linalg.norm(verts - point, axis=1)))

    out = {
        "front_camera": {"scale": s, "cx": cx, "cy": cy,
                         "resid_mean_px": float(resid.mean()),
                         "resid_median_px": float(np.median(resid))},
        "preshape_weights": preshape_weights,
        "correspondence": {str(k): v for k, v in corr_mp.items()},
        "lm_corr": {str(i): {"v": int(idx[i]), "d": float(dist[i])}
                    for i in range(478)},
        "corr_dist_median": float(np.median(dist[keep])),
        "profiles": prof,
        "z_targets": z_agg,
        "semantic_mesh_vertex": {k: vertex_index_of(p) for k, p in sem.items()},
        "face_oval": FACE_OVAL, "eye_ring_L": EYE_RING_imgL, "eye_ring_R": EYE_RING_imgR,
        "brow_L": BROW_imgL, "brow_R": BROW_imgR,
        "lips_outer": LIPS_OUTER, "lips_inner": LIPS_INNER,
        "nose_bridge": NOSE_BRIDGE, "nose_bottom": NOSE_BOTTOM,
        "aux": {"mouth_z": aux["mouth_z"]},
    }
    with open(os.path.join(OUT, "correspondence.json"), "w") as f:
        json.dump(out, f, indent=1)
    print("written:", os.path.join(OUT, "correspondence.json"),
          "| corr:", len(corr_mp), "| z_targets:", len(z_agg))


if __name__ == "__main__":
    main()
