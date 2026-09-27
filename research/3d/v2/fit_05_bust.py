#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — Stage 5: вырез бюста (head + neck + shoulders/chest).
#
# Вход:  out/fitidentity.npz, out/basehuman_meta.json
# Выход: out/bust.npz, out/bust.json
#
# Что делает:
#   - оставляет только поверхностные вершины (группа body) и их грани;
#   - вырезает бюст: грани с центроидом выше z_cut (плечи/верх груди);
#   - закрывает крышками ТОЛЬКО новые границы выреза (низ + культи рук);
#     родные отверстия меша (глазницы, полость рта) остаются открытыми;
#   - переносит shape keys (34 юнита) на новые индексы;
#   - сохраняет прокси и позиции joint-* (для рига Stage 7).
#
# Запуск: $ENV/venv-fit/bin/python fit_05_barpust.py  (см. ниже)
# ============================================================================
import json
import os
from collections import defaultdict

import numpy as np

from aven3d_common import OUT

Z_CUT = 1.15  # нижняя граница бюста (плечи + верхняя часть груди)

PROXIES = ["eyes", "teeth", "tongue", "eyelashes"]

JOINT_NAMES = ["joint-head", "joint-neck", "joint-jaw", "joint-l-eye",
               "joint-r-eye", "joint-l-upperlid", "joint-r-upperlid",
               "joint-l-lowerlid", "joint-r-lowerlid", "joint-mouth"]


def triangulate(quads):
    """Квады (n,4) -> треугольники (2n,3): (a,b,c)+(a,c,d)."""
    q = np.asarray(quads, dtype=np.int64)
    t1 = q[:, [0, 1, 2]]
    t2 = q[:, [0, 2, 3]]
    return np.vstack([t1, t2])


def cut_boundary_loops(faces_all, faces_body, kept_mask):
    """Контуры выреза через направленные рёбра.

    Ребро — граница выреза, если у него ровно одна kept-грань и хотя бы одна
    другая грань полного body-меша (т.е. сосед существовал, но отрезан).
    Ребро с единственной гранью вообще — родное отверстие меша: не крышуем.
    Возврат: список циклов вершин (в порядке обхода).
    """
    edge_faces = defaultdict(list)
    for fi, (a, b, c) in enumerate(faces_body):
        for i, j in ((a, b), (b, c), (c, a)):
            edge_faces[(i, j)].append(fi)  # направленное
    undirected = defaultdict(list)
    for (i, j), fis in edge_faces.items():
        undirected[(min(i, j), max(i, j))].extend(fis)

    # directed boundary edges: (i->j) из kept-грани, чей сосед отрезан
    dir_edges = {}
    for (i, j), fis in edge_faces.items():
        kept = [f for f in fis if kept_mask[f]]
        if len(kept) != 1:
            continue
        ukey = (min(i, j), max(i, j))
        others = [f for f in undirected[ukey] if not kept_mask[f]]
        if not others:
            continue  # родное отверстие
        dir_edges[i] = j  # pinch-вершины редки; конфликты решает walk ниже

    # walk по directed edges (каждое ребро один раз)
    used = set()
    loops = []
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


def main():
    f = np.load(os.path.join(OUT, "fitidentity.npz"))
    meta = json.load(open(os.path.join(OUT, "basehuman_meta.json")))
    verts = f["basis"]
    faces_all = f["faces"].astype(np.int64)
    uv_all = f["uv"]
    groups = meta["vertex_groups"]
    body_set = set(groups["body"])
    units = json.loads(str(f["sk_names"]))

    # --- 1. только body-грани -------------------------------------------------
    in_body = np.zeros(len(verts), dtype=bool)
    for v in body_set:
        in_body[v] = True
    face_mask = in_body[faces_all[:, 0]] & in_body[faces_all[:, 1]] & \
        in_body[faces_all[:, 2]] & in_body[faces_all[:, 3]]
    # hm08 — все квады; триангулируем (a,b,c)+(a,c,d)
    faces_body = triangulate(faces_all[face_mask])
    print("body tris:", len(faces_body), "from", face_mask.sum(), "quads")

    # --- 2. вырез бюста --------------------------------------------------------
    centroid_z = verts[faces_body].mean(axis=1)[:, 2]
    kept_mask = centroid_z > Z_CUT
    kept = faces_body[kept_mask]
    print("bust faces (z > %.2f):" % Z_CUT, len(kept))

    # --- 3. контуры выреза + крышки --------------------------------------------
    loops = cut_boundary_loops(kept, faces_body, kept_mask)
    print("cut loops:", [(len(l), verts[l][:, 2].mean().round(3)) for l in loops])

    used = sorted(set(kept.flatten().tolist()))
    old2new = {old: i for i, old in enumerate(used)}
    new_verts = verts[used].copy()
    new_faces = np.array([[old2new[int(v)] for v in t] for t in kept],
                          dtype=np.int64)
    for loop in loops:
        idxs = [old2new[v] for v in loop]
        center = new_verts[idxs].mean(0)
        ci = len(new_verts)
        new_verts = np.vstack([new_verts, center])
        n = len(idxs)
        for i in range(n):
            new_faces = np.vstack([new_faces,
                                   [idxs[i], idxs[(i + 1) % n], ci]])
    print("capped: verts", len(new_verts), "faces", len(new_faces))

    # --- 4. shape keys ----------------------------------------------------------
    new_units = {}
    for u in units:
        new_units[u] = f["sk__" + u][used]

    # --- 5. прокси ---------------------------------------------------------------
    proxies = {}
    for key in PROXIES:
        proxies[key] = {
            "verts": f["pv__" + key],
            "faces": triangulate(f["pf__" + key]),
            "uv": f["puv__" + key],
        }

    # --- 6. joint-позиции (helper-кубы) для рига --------------------------------
    joints = {}
    for gname in JOINT_NAMES:
        idxs = groups.get(gname)
        if idxs:
            joints[gname] = verts[idxs].mean(axis=0).tolist()
    print("joints:", {k: [round(c, 3) for c in v] for k, v in joints.items()})

    # --- 7. вершинные uv из loop-uv оригинала ------------------------------------
    vuv = np.zeros((len(verts), 2))
    seen = np.zeros(len(verts), dtype=bool)
    li = 0
    for row in faces_all:
        fs = int((row >= 0).sum())
        for k in range(fs):
            vi = int(row[k])
            if not seen[vi]:
                vuv[vi] = uv_all[li + k]
                seen[vi] = True
        li += fs
    new_uv = vuv[used]

    np.savez_compressed(
        os.path.join(OUT, "bust.npz"),
        verts=new_verts, faces=new_faces, uv=new_uv,
        sk_names=json.dumps(units),
        **{f"sk__{k}": v for k, v in new_units.items()},
        **{f"pv__{k}": v["verts"] for k, v in proxies.items()},
        **{f"pf__{k}": v["faces"] for k, v in proxies.items()},
        **{f"puv__{k}": v["uv"] for k, v in proxies.items()},
    )
    stats = {
        "z_cut": Z_CUT,
        "verts": int(len(new_verts)),
        "faces": int(len(new_faces)),
        "unit_count": len(new_units),
        "loops_capped": [len(l) for l in loops],
        "joints": joints,
        "proxies": {k: {"verts": len(v["verts"]), "faces": len(v["faces"])}
                    for k, v in proxies.items()},
    }
    with open(os.path.join(OUT, "bust.json"), "w") as fp:
        json.dump(stats, fp, indent=1)
    print("written:", os.path.join(OUT, "bust.npz"))
    print("stats:", {k: stats[k] for k in ["verts", "faces", "unit_count"]})


if __name__ == "__main__":
    main()
