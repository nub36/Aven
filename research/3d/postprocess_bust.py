"""Постобработка бюста Female Aven после TripoSR (этап 3D-исследования, эксперимент).

Вход: out/tripo/<i>/mesh.obj + texture.png (xatlas UV + запечённая текстура) — результат
`TripoSR/run.py prototype/assets/character/master/female-aven-reference.jpg --bake-texture`.

Что делает:
  * грузит OBJ с текстурой (trimesh), перестраивает нормали;
  * децимация до realtime-friendly размера (fast-simplification, ~120k треугольников).
    ВАЖНО: fast-simplification не знает про UV — после децимации UV переопроектируются
    на исходные вершины через cKDTree (ближайшая вершина исходного меша), текстура
    сохраняется; честно отмечаем uv="reprojected" в stats. Если децимация не нужна
    (меш уже легче цели), UV остаются родными (uv="native");
  * центрирование/масштаб под стандарт «бюст 1.6 юнита высотой, основание на y=0»;
  * экспорт GLB (текстура встраивается) для браузерного viewer'а (Three.js);
  * честная сводка: вершины/треугольники/размер файла → stats.json.

Зависимости: trimesh>=4.4 (совместим с numpy 2.x; на 4.0.5 падает на удалённом
ndarray.ptp), fast-simplification, scipy, Pillow.

ВАЖНО (docs/AVATAR_3D_RESEARCH.md): результат — ЭКСПЕРИМЕНТАЛЬНАЯ автоматическая
реконструкция по одному фото. Это НЕ утверждённая Female Aven и НЕ финальная модель:
нет rig/blendshapes/глаз/век; сходство лица оценивает ТОЛЬКО владелец по рендерам.

Запуск (в контейнере Actions после TripoSR):
    python research/3d/postprocess_bust.py out/tripo/0 master out/glb
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import trimesh

TARGET_FACES = 120_000   # realtime-friendly для браузера (Three.js, средние устройства)
TARGET_HEIGHT = 1.6      # условная высота бюста в юнитах сцены viewer'а


def process(src_dir: Path, label: str, dst_glb: Path, stats: dict) -> None:
    t0 = time.perf_counter()
    obj = src_dir / "mesh.obj"
    if not obj.exists():
        raise FileNotFoundError(obj)

    mesh = trimesh.load(str(obj), force="mesh", process=True)
    if not isinstance(mesh.visual, trimesh.visual.TextureVisuals):
        # без текстуры GLB получится с vertex colors — честно фиксируем в stats
        stats["texture"] = "vertex colors (текстура не найдена)"
    else:
        img = getattr(mesh.visual.material, "image", None) or mesh.visual.image
        stats["texture"] = f"{img.size} px" if img is not None else "texture (image not loaded)"

    stats["src_faces"] = int(len(mesh.faces))
    stats["src_vertices"] = int(len(mesh.vertices))

    # децимация. fast-simplification теряет UV/текстуру → сохраняем и переопроектируем
    had_texture = isinstance(mesh.visual, trimesh.visual.TextureVisuals)
    if had_texture:
        orig_uv = np.asarray(mesh.visual.uv, dtype=np.float64) if mesh.visual.uv is not None else None
        orig_v = np.asarray(mesh.vertices, dtype=np.float64)
        tex_image = getattr(mesh.visual.material, "image", None) or mesh.visual.image
    else:
        orig_uv = None

    if len(mesh.faces) > TARGET_FACES:
        mesh = mesh.simplify_quadric_decimation(face_count=TARGET_FACES)
        if had_texture and orig_uv is not None and tex_image is not None:
            # UV по ближайшей исходной вершине (cKDTree): децимированные вершины лежат
            # на исходной поверхности, поэтому соответствие достаточно точное для
            # запечённой текстуры; на границах UV-островов возможно лёгкое смешение.
            from scipy.spatial import cKDTree
            _, idx = cKDTree(orig_v).query(np.asarray(mesh.vertices, dtype=np.float64), k=1)
            mat = trimesh.visual.texture.SimpleMaterial(image=tex_image)
            mesh.visual = trimesh.visual.TextureVisuals(uv=orig_uv[idx], material=mat, image=tex_image)
            stats["uv"] = "reprojected (nearest vertex after decimation)"
        else:
            stats["uv"] = "lost (decimation без текстуры)"
    else:
        stats["uv"] = "native" if had_texture else "none"
    stats["faces"] = int(len(mesh.faces))
    stats["vertices"] = int(len(mesh.vertices))

    # нормали после децимации
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()

    # центрирование + масштаб: основание на y=0, высота TARGET_HEIGHT
    lo, hi = mesh.bounds
    mesh.apply_translation(-(lo + hi) / 2 * [1, 0, 1] - [0, lo[1], 0])  # центр XZ, низ в 0
    mesh.apply_scale(TARGET_HEIGHT / (hi[1] - lo[1]))

    dst_glb.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(str(dst_glb))
    stats["glb_mb"] = round(dst_glb.stat().st_size / 1e6, 2)
    stats["postprocess_s"] = round(time.perf_counter() - t0, 1)
    print(f"[bust:{label}] {stats['src_faces']}→{stats['faces']} faces, "
          f"GLB {stats['glb_mb']} МБ, {stats['postprocess_s']} с", flush=True)


def main() -> None:
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("out/tripo/0")
    label = sys.argv[2] if len(sys.argv) > 2 else "master"
    dst_glb = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(f"out/glb/aven-bust-experimental-{label}.glb")
    stats: dict = {"label": label, "source_dir": str(src_dir)}
    process(src_dir, label, dst_glb, stats)
    out_json = dst_glb.with_suffix(".stats.json")
    out_json.write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    main()
