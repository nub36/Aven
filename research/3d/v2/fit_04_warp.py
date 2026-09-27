#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — Stage 4: identity warp (тонкая подгонка под reference).
#
# Вход:  out/basehuman.npz, out/basehuman_meta.json, out/landmarks.json,
#        out/correspondence.json
# Выход: out/fitidentity.npz, out/fitidentity.json
#
# Что делает:
#   - строит effective basis (neutral + preshape-коррективы из Stage 3);
#   - TPS-warp (thin plate spline) в 3D по 478 соответствиях landmark<->вершина:
#       * x и z (фронтальная плоскость) — все 478 якорей, front-камера;
#       * y (глубина) — контурные точки профилей с весами (нос/подбородок/губы);
#   - ограничение смещений и контроль деформации (перцентилями длин рёбер);
#   - ПЕРЕНОСИТ expression units на искривлённую геометрию:
#       new_unit = warp(basis + unit_off) - new_basis;
#   - аналогично деформирует прокси (глаза/зубы/язык/ресницы) тем же полем;
#   - метрики: пост-warp невязки якорей (px), меры лица vs reference, статы.
#
# Запуск: $ENV/venv-fit/bin/python fit_04_warp.py
# ============================================================================
import json
import os

import numpy as np
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

from aven3d_common import MP, mesh_face_measures, image_face_measures, mask_of

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

MAX_DISP = 0.06           # жёсткий потолок смещения вершины (м)
WARP_ITERS = 1            # одна итерация поля (итеративный догон нестабилен
                          # из-за clamp; вместо него — весовые дублирования якорей)
DEPTH_W_STRONG = 1.0      # вес глубины: ключевые точки профилей
DEPTH_W_WEAK = 0.5        # остальные контурные
STRONG_DEPTH = {"nose_tip", "nasion", "chin_bottom", "subnasale",
                "lip_top_center", "lip_bottom_center", "bridge_mid"}


def load_all():
    lm = json.load(open(os.path.join(OUT, "landmarks.json")))
    npz = np.load(os.path.join(OUT, "basehuman.npz"), allow_pickle=False)
    meta = json.load(open(os.path.join(OUT, "basehuman_meta.json")))
    corr = json.load(open(os.path.join(OUT, "correspondence.json")))
    return lm, npz, meta, corr


def build_basis(npz, meta, corr):
    verts = npz["verts"].copy()
    pw = corr["preshape_weights"]
    for name, w in pw.items():
        key = "sk__" + name
        if key in npz.files:
            verts = verts + w * npz[key]
    return verts, pw


def fit_depth_alignment(mesh_y, profile_my, iters=8):
    """Робастная линейная регрессия mesh_y = a*my + b (IRLS/Huber)."""
    A = np.column_stack([profile_my, np.ones_like(profile_my)])
    w = np.ones(len(mesh_y))

    def fit(w):
        sol, *_ = np.linalg.lstsq(A * w[:, None], mesh_y * w, rcond=None)
        return sol
    sol = fit(w)
    for _ in range(iters):
        r = mesh_y - (A @ sol)
        s_rob = 1.4826 * np.median(np.abs(r)) + 1e-9
        k = 2.0 * s_rob
        w = np.where(np.abs(r) <= k, 1.0, k / np.maximum(np.abs(r), 1e-9))
        sol = fit(w)
    return float(sol[0]), float(sol[1])


def tps_warp_field(basis, anchors_src, anchors_dst_x, anchors_dst_z,
                   depth_src, depth_dst_y, depth_w, pins=None, smoothing=2e-4):
    """Два независимых RBF-поля:
       field_xz(pos) -> (dx, dz)  по 478 якорям (фронтальная плоскость);
       field_y(pos)  -> dy        по контурным точкам профилей (веса через
                                  дублирование точек).
    pins — вершины с нулевым смещением (фиксация дальних регионов).
    """
    disp_xz = np.column_stack([anchors_dst_x - anchors_src[:, 0],
                               anchors_dst_z - anchors_src[:, 2]])
    if pins is not None:
        src_all = np.vstack([anchors_src, pins])
        disp_xz_all = np.vstack([disp_xz, np.zeros((len(pins), 2))])
    else:
        src_all, disp_xz_all = anchors_src, disp_xz
    rbf_xz = RBFInterpolator(src_all, disp_xz_all, smoothing=smoothing,
                             kernel="thin_plate_spline")
    # глубина: RBF по взвешенным точкам (дублируем сильные якоря) + pins
    reps = np.ceil(depth_w).astype(int)
    reps[reps < 1] = 1
    ds = np.repeat(depth_src, reps, axis=0)
    dd = np.repeat(depth_dst_y * depth_w, reps, axis=0)
    if pins is not None:
        ds = np.vstack([ds, pins])
        dd = np.concatenate([dd, np.zeros(len(pins))])
    rbf_y = RBFInterpolator(ds, dd, smoothing=5e-4, kernel="thin_plate_spline")

    def warp(points):
        d_xz = rbf_xz(points)
        d_y = np.asarray(rbf_y(points)).reshape(-1)
        out = points.copy()
        out[:, 0] += d_xz[:, 0]
        out[:, 2] += d_xz[:, 1]
        out[:, 1] += d_y
        return out
    return warp, rbf_xz, rbf_y


def edge_strain(basis, warped, faces):
    """Перцентили изменения длин рёбер (контроль разрушения топологии)."""
    tris = faces[:, :3].astype(int)
    def edge_lens(v):
        a = v[tris[:, 0]]; b = v[trips[:, 1]] if False else v[tris[:, 1]]
        c = v[tris[:, 2]]
        lab = np.linalg.norm(a - b, axis=1)
        lbc = np.linalg.norm(b - c, axis=1)
        lca = np.linalg.norm(c - a, axis=1)
        return np.concatenate([lab, lbc, lca])
    l0 = edge_lens(basis)
    l1 = edge_lens(warped)
    r = l1 / np.maximum(l0, 1e-9)
    return {"p01": float(np.percentile(r, 1)), "p50": float(np.percentile(r, 50)),
            "p99": float(np.percentile(r, 99)), "max": float(r.max())}


def main():
    lm, npz, meta, corr = load_all()
    basis, preshape_w = build_basis(npz, meta, corr)
    unit_masks = meta["unit_masks"]
    groups = meta["vertex_groups"]

    front = lm["views"]["front"]
    px = np.array(front["landmarks_px"])
    cam = corr["front_camera"]
    s, cx, cy = cam["scale"], cam["cx"], cam["cy"]

    # --- якоря front-камеры: все 478 соответствий ---------------------------
    lm_corr = corr["lm_corr"]
    src_list, dstx_list, dstz_list, mp_list = [], [], [], []
    for mp_s, rec in lm_corr.items():
        mp_i = int(mp_s)
        v = basis[rec["v"]]
        src_list.append(v)
        dstx_list.append((px[mp_i][0] - cx) / s)
        dstz_list.append((cy - px[mp_i][1]) / s)
        mp_list.append(mp_i)
    src = np.array(src_list)
    dst_x = np.array(dstx_list)
    dst_z = np.array(dstz_list)
    mp_arr = np.array(mp_list)

    # --- глубинные якоря из профилей ------------------------------------------
    zt = corr["z_targets"]
    depth_src, depth_dst, depth_w = [], [], []
    for mp_s, rec in zt.items():
        mp_i = int(mp_s)
        v = basis[lm_corr[mp_s]["v"]]
        depth_src.append(v)
        depth_dst.append(rec["my"])
        name = next((n for n, i in MP.items() if i == mp_i), None)
        w = DEPTH_W_STRONG if name in STRONG_DEPTH else DEPTH_W_WEAK
        depth_w.append(w)
    depth_src = np.array(depth_src)
    depth_dst = np.array(depth_dst)
    depth_w = np.array(depth_w)
    print("anchors: front %d, depth %d" % (len(src), len(depth_src)))

    # глубина: профильные my живут в системе профильной КАМЕРЫ (my=0 — центр
    # кадра), а не тела. Робастно выравниваем: mesh_y = a*my + b по якорям,
    # затем dy = (a*my + b) - y_current
    a_d, b_d = fit_depth_alignment(depth_src[:, 1], depth_dst)
    depth_dst_aligned = a_d * depth_dst + b_d
    print("depth alignment: y = %.3f*my + %.3f (raw spread %.3f -> %.3f)" %
          (a_d, b_d, depth_dst.max() - depth_dst.min(),
           depth_dst_aligned.max() - depth_dst_aligned.min()))
    dy_targets = depth_dst_aligned - depth_src[:, 1]

    # --- якоря-фиксаторы: регионы вдали от лица не должны двигаться -----------
    # TPS — глобальное поле: без фиксаторов оно взрывается на экстраполяции
    # (тело/плечи). Нулевые смещения для вершин дальше PIN_DIST от любого якоря.
    PIN_DIST = 0.09
    rng = np.random.default_rng(42)
    all_idx = np.arange(len(basis))
    anchor_set = np.array([lm_corr[m]["v"] for m in lm_corr])
    tree_a = cKDTree(basis[anchor_set])
    d_anchor, _ = tree_a.query(basis, k=1)
    far = all_idx[d_anchor > PIN_DIST]
    if len(far) > 600:
        far = rng.choice(far, 600, replace=False)
    pins = basis[far]
    print("pins (zero-displacement anchors): %d" % len(pins))

    # warp-поле; ключевые семантические якоря дублируем (вес) — иначе
    # сглаживание TPS расплёскивает их смещение по соседям
    anchor_vi = np.array([lm_corr[m]["v"] for m in lm_corr])
    depth_vi = np.array([lm_corr[m]["v"] for m in zt])
    SEMANTIC_MP = [MP[n] for n in
                   ["nose_tip", "nasion", "chin_bottom", "subnasale",
                    "mouth_corner_imgL", "mouth_corner_imgR",
                    "eye_outer_imgL", "eye_inner_imgL",
                    "eye_outer_imgR", "eye_inner_imgR",
                    "iris_center_imgL", "iris_center_imgR",
                    "ala_imgL", "ala_imgR", "lip_top_center", "lip_bottom_center",
                    "brow_inner_imgL", "brow_inner_imgR",
                    "brow_mid_imgL", "brow_mid_imgR",
                    "brow_outer_imgL", "brow_outer_imgR"]]
    sem_pos = np.where(np.isin(mp_arr, SEMANTIC_MP))[0]
    cur = basis.copy()
    warp = None
    for it in range(WARP_ITERS):
        # цели по x/z (front) и y (профили) в координатах ТЕКУЩЕГО состояния
        err_x = dst_x - cur[anchor_vi][:, 0]
        err_z = dst_z - cur[anchor_vi][:, 2]
        depth_cur_y = cur[depth_vi][:, 1]
        dy_t = depth_dst_aligned - depth_cur_y
        # дублируем семантические якоря (вес x3)
        a_src = np.vstack([cur[anchor_vi]] + [cur[anchor_vi][sem_pos]] * 2)
        a_dx = np.concatenate([err_x] + [err_x[sem_pos]] * 2)
        a_dz = np.concatenate([err_z] + [err_z[sem_pos]] * 2)
        warp, rbf_xz, rbf_y = tps_warp_field(
            cur, a_src, a_src[:, 0] + a_dx, a_src[:, 2] + a_dz,
            cur[depth_vi], dy_t, depth_w, pins=pins)
        cur = warp(cur)
        # жёсткий потолок полного смещения от исходного basis
        disp_full = cur - basis
        dn = np.linalg.norm(disp_full, axis=1)
        over = dn > MAX_DISP
        if over.any():
            cur = basis + disp_full * np.minimum(1.0, MAX_DISP / np.maximum(dn, 1e-12))[:, None]
        proj = cur[anchor_vi]
        rx = s * proj[:, 0] + cx - px[mp_arr][:, 0]
        ry = cy - s * proj[:, 2] - px[mp_arr][:, 1]
        rr = np.sqrt(rx ** 2 + ry ** 2)
        print("warp iter %d: anchor resid median %.2fpx p95 %.2fpx, clamped %d" %
              (it, np.median(rr), np.percentile(rr, 95), over.sum()))
    warped = cur
    disp = warped - basis
    disp_norm = np.linalg.norm(disp, axis=1)
    print("displacement (m): mean %.4f p95 %.4f max %.4f" %
          (disp_norm.mean(), np.percentile(disp_norm, 95), disp_norm.max()))

    # --- пост-warp проверка якорей --------------------------------------------
    anchor_pos = warped[anchor_vi]
    pred_x = s * anchor_pos[:, 0] + cx
    pred_y = cy - s * anchor_pos[:, 2]
    resid = np.sqrt((pred_x - px[mp_arr][:, 0]) ** 2 + (pred_y - px[mp_arr][:, 1]) ** 2)
    print("post-warp anchor resid: mean %.2fpx median %.2fpx p95 %.2fpx" %
          (resid.mean(), np.median(resid), np.percentile(resid, 95)))

    # --- меры лица после warp vs reference -------------------------------------
    m_after = mesh_face_measures(warped, unit_masks, groups)
    img_m = image_face_measures(lm)
    s_check = img_m["eye_to_chin"] / m_after["eye_to_chin"]
    print("post-warp measures (m):", {k: round(v, 4) for k, v in m_after.items()})
    for k in ["mouth_width", "nose_width", "eye_width", "face_width",
              "eye_to_chin", "mouth_to_chin"]:
        target = img_m[k] / s
        print("   %-14s %.4f (target %.4f, ratio %.3f)" %
              (k, m_after[k], target, m_after[k] / target))

    # --- перенос expression units ---------------------------------------------
    # TPS-поле сглаживает/усиливает локальные деформации неравномерно:
    # нормируем амплитуду каждого юнита к оригиналу (RMS по движущимся
    # вершинам; каппим отношение, чтобы не раздуть шум)
    unit_names = meta["expression_units"]
    new_units = {}
    for u in unit_names:
        key = "sk__" + u
        if key not in npz.files:
            continue
        off = npz[key]
        moved = np.linalg.norm(off, axis=1) > 1e-7
        full = warp(basis + off)
        new_off = full - warped
        new_off[~moved] = 0.0
        rms_o = np.sqrt((off[moved] ** 2).sum() / max(moved.sum(), 1) / 3)
        rms_n = np.sqrt((new_off[moved] ** 2).sum() / max(moved.sum(), 1) / 3)
        if rms_n > 1e-9:
            scale = float(np.clip(rms_o / rms_n, 0.5, 3.0))
            new_off = new_off * scale
        new_units[u] = new_off
    print("expression units transferred:", len(new_units))

    # --- прокси тем же полем ---------------------------------------------------
    proxies = {}
    for key in ["eyes", "teeth", "tongue", "eyelashes"]:
        pv = npz["pv__" + key]
        proxies[key] = warp(pv)

    # --- контроль топологии ----------------------------------------------------
    faces = npz["faces"]
    strain = edge_strain(basis, warped, faces)
    print("edge strain ratio:", {k: round(v, 3) for k, v in strain.items()})

    np.savez_compressed(
        os.path.join(OUT, "fitidentity.npz"),
        basis=warped, basis_preshape=basis, faces=faces, uv=npz["uv"],
        sk_names=json.dumps(list(new_units.keys())),
        **{f"sk__{k}": v for k, v in new_units.items()},
        **{f"pv__{k}": v for k, v in proxies.items()},
        **{f"pf__{k}": npz["pf__" + k] for k in proxies},
        **{f"puv__{k}": npz["puv__" + k] for k in proxies},
        **{f"pw__{k}": npz["pw__" + k] for k in proxies},
    )
    stats = {
        "anchors_front": len(src),
        "anchors_depth": len(depth_src),
        "preshape_weights": preshape_w,
        "camera": {"scale": s, "cx": cx, "cy": cy},
        "post_warp_anchor_resid_px": {"mean": float(resid.mean()),
                                      "median": float(np.median(resid)),
                                      "p95": float(np.percentile(resid, 95))},
        "displacement_m": {"mean": float(disp_norm.mean()),
                           "p95": float(np.percentile(disp_norm, 95)),
                           "max": float(disp_norm.max())},
        "measures_after": {k: float(v) for k, v in m_after.items()},
        "measures_img_m": {k: float(img_m[k] / s) for k in img_m},
        "edge_strain": strain,
    }
    with open(os.path.join(OUT, "fitidentity.json"), "w") as f:
        json.dump(stats, f, indent=1)
    print("written:", os.path.join(OUT, "fitidentity.npz"))


def src_idx_of(warped, src):
    from scipy.spatial import cKDTree
    return cKDTree(warped).query(src)[1]


if __name__ == "__main__":
    main()
