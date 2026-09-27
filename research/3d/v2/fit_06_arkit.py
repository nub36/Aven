#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — Stage 6: ARKit-52 + visemes из 34 expression-юнитов.
#
# Вход:  out/bust.npz (basis бюста + юниты на его вершинах)
# Выход: out/arkit.npz, out/arkit.json
#
# Правила:
#   - ARKit Left/Right = АНАТОМИЧЕСКАЯ сторона субъекта (Left = +X меша);
#   - сторона выделяется маскированием строк оффсета по x базовой вершины
#     (центральные строки |x|<eps всегда включаются, вес 1);
#   - юниты MakeHuman авторованы как пары, комбинации линейны — bake точный.
#
# Запуск: $ENV/venv-fit/bin/python fit_06_arkit.py
# ============================================================================
import json
import os

import numpy as np

from aven3d_common import OUT

X_EPS = 0.004  # центральная полоса — общая для обеих сторон

# (имя, [(unit, weight, side)]) side: None | "L" | "R"
ARKIT = [
    ("eyeBlinkLeft",        [("eye-left-closure", 1.0, "L")]),
    ("eyeBlinkRight",       [("eye-right-closure", 1.0, "R")]),
    ("eyeLookDownLeft",     [("eye-left-closure", 0.30, "L")]),
    ("eyeLookDownRight",    [("eye-right-closure", 0.30, "R")]),
    ("eyeLookInLeft",       [("eye-right-closure", 0.15, "R")]),
    ("eyeLookInRight",      [("eye-left-closure", 0.15, "L")]),
    ("eyeLookOutLeft",      [("eye-left-closure", 0.15, "L")]),
    ("eyeLookOutRight",     [("eye-right-closure", 0.15, "R")]),
    ("eyeLookUpLeft",       [("eye-left-opened-up", 0.40, "L")]),
    ("eyeLookUpRight",      [("eye-right-opened-up", 0.40, "R")]),
    ("browDownLeft",        [("eyebrows-left-down", 1.0, "L")]),
    ("browDownRight",       [("eyebrows-right-down", 1.0, "R")]),
    ("browInnerUp",         [("eyebrows-left-inner-up", 0.6, None),
                             ("eyebrows-right-inner-up", 0.6, None)]),
    ("browOuterUpLeft",     [("eyebrows-left-extern-up", 1.0, "L")]),
    ("browOuterUpRight",    [("eyebrows-right-extern-up", 1.0, "R")]),
    ("cheekPuff",           [("mouth-protusion", 0.25, None),
                             ("mouth-pursing", 0.20, None)]),  # аппроксимация
    ("cheekSquintLeft",     [("eye-left-slit", 0.8, "L")]),
    ("cheekSquintRight",    [("eye-right-slit", 0.8, "R")]),
    ("eyeSquintLeft",       [("eye-left-slit", 1.0, "L")]),
    ("eyeSquintRight",      [("eye-right-slit", 1.0, "R")]),
    ("eyeWideLeft",         [("eye-left-opened-up", 1.0, "L")]),
    ("eyeWideRight",        [("eye-right-opened-up", 1.0, "R")]),
    ("jawForward",          [("mouth-protusion", 0.5, None)]),
    ("jawLeft",             [("mouth-part-later", 0.5, "L"),
                             ("mouth-protusion", 0.2, None)]),
    ("jawOpen",             [("mouth-open", 1.0, None)]),
    ("jawRight",            [("mouth-part-later", 0.5, "R"),
                             ("mouth-protusion", 0.2, None)]),
    ("mouthClose",          [("mouth-compression", 0.7, None),
                             ("mouth-elevation", 0.3, None)]),
    ("mouthDimpleLeft",     [("mouth-retraction", 0.6, "L")]),
    ("mouthDimpleRight",    [("mouth-retraction", 0.6, "R")]),
    ("mouthFrownLeft",      [("mouth-depression-retraction", 0.8, "L")]),
    ("mouthFrownRight",     [("mouth-depression-retraction", 0.8, "R")]),
    ("mouthFunnel",         [("mouth-pursing", 0.6, None),
                             ("mouth-protusion", 0.25, None)]),
    ("mouthLeft",           [("mouth-part-later", 0.45, "L"),
                             ("mouth-protusion", 0.15, "L")]),
    ("mouthLowerDownLeft",  [("mouth-depression", 0.7, "L")]),
    ("mouthLowerDownRight", [("mouth-depression", 0.7, "R")]),
    ("mouthPressLeft",      [("mouth-compression", 0.7, "L")]),
    ("mouthPressRight",     [("mouth-compression", 0.7, "R")]),
    ("mouthPucker",         [("mouth-pursing", 1.0, None)]),
    ("mouthRight",          [("mouth-part-later", 0.45, "R"),
                             ("mouth-protusion", 0.15, "R")]),
    ("mouthRollLower",      [("mouth-eversion", 0.6, None)]),
    ("mouthRollUpper",      [("mouth-eversion", 0.5, None),
                             ("mouth-protusion", 0.3, None)]),
    ("mouthShrugLower",     [("mouth-depression", 0.4, None),
                             ("mouth-compression", 0.2, None)]),
    ("mouthShrugUpper",     [("mouth-elevation", 0.6, None)]),
    ("mouthSmileLeft",      [("mouth-corner-puller", 0.8, "L"),
                             ("mouth-upward-retraction", 0.5, "L")]),
    ("mouthSmileRight",     [("mouth-corner-puller", 0.8, "R"),
                             ("mouth-upward-retraction", 0.5, "R")]),
    ("mouthStretchLeft",    [("mouth-part-later", 0.6, "L"),
                             ("mouth-depression", 0.3, "L")]),
    ("mouthStretchRight",   [("mouth-part-later", 0.6, "R"),
                             ("mouth-depression", 0.3, "R")]),
    ("mouthUpperUpLeft",    [("mouth-elevation", 0.8, "L")]),
    ("mouthUpperUpRight",   [("mouth-elevation", 0.8, "R")]),
    ("noseSneerLeft",       [("nose-left-elevation", 0.9, "L")]),
    ("noseSneerRight",      [("nose-right-elevation", 0.9, "R")]),
]

VISEMES = [
    ("viseme_sil", []),                                   # REST: нули
    ("viseme_A", [("mouth-open", 0.45, None), ("mouth-corner-puller", 0.15, None)]),
    ("viseme_E", [("mouth-part-later", 0.50, None), ("mouth-open", 0.20, None)]),
    ("viseme_I", [("mouth-part-later", 0.35, None), ("mouth-open", 0.10, None)]),
    ("viseme_O", [("mouth-pursing", 0.55, None), ("mouth-open", 0.30, None)]),
    ("viseme_U", [("mouth-pursing", 0.70, None), ("mouth-open", 0.12, None)]),
    ("viseme_MB", [("mouth-compression", 0.75, None)]),
    ("viseme_FV", [("mouth-compression", 0.35, None), ("mouth-protusion", 0.30, None)]),
]


def side_mask(base_x, side):
    """Маска строк для стороны: L = +X (анатомич. лево), R = -X; центр всегда."""
    if side is None:
        return np.ones(len(base_x))
    if side == "L":
        return ((base_x > -X_EPS)).astype(float)
    return ((base_x < X_EPS)).astype(float)


def main():
    bust = np.load(os.path.join(OUT, "bust.npz"))
    base = bust["verts"]
    base_x = base[:, 0]
    units = json.loads(str(bust["sk_names"]))
    n = len(base)
    unit_off = {}
    for u in units:
        arr = bust["sk__" + u]
        if len(arr) < n:  # крышки (центры вееров) не двигаются юнитами
            arr = np.vstack([arr, np.zeros((n - len(arr), 3))])
        unit_off[u] = arr

    out_offsets = {}
    provenance = {}
    for name, parts in ARKIT + VISEMES:
        off = np.zeros_like(base)
        recipe = []
        for uname, w, side in parts:
            if uname not in unit_off:
                print("WARN: unit missing:", uname)
                continue
            m = side_mask(base_x, side)[:, None]
            off += w * unit_off[uname] * m
            recipe.append({"unit": uname, "weight": w, "side": side})
        out_offsets[name] = off
        moved = int((np.linalg.norm(off, axis=1) > 1e-6).sum())
        provenance[name] = {"recipe": recipe, "moved_verts": moved}

    np.savez_compressed(
        os.path.join(OUT, "arkit.npz"),
        **{f"sk__{k}": v for k, v in out_offsets.items()})
    with open(os.path.join(OUT, "arkit.json"), "w") as fp:
        json.dump({
            "arkit_count": len(ARKIT),
            "viseme_count": len(VISEMES),
            "names": [n for n, _ in ARKIT],
            "viseme_names": [n for n, _ in VISEMES],
            "provenance": provenance,
            "convention": "Left = anatomical left of the subject (+X in mesh)",
        }, fp, indent=1)
    print("ARKit:", len(ARKIT), "shapes; visemes:", len(VISEMES))
    for name in ["eyeBlinkLeft", "jawOpen", "mouthSmileLeft", "viseme_O"]:
        print("  %-18s moved %d verts, max |d| %.4f" %
              (name, provenance[name]["moved_verts"],
               np.linalg.norm(out_offsets[name], axis=1).max()))
    print("written:", os.path.join(OUT, "arkit.npz"))


if __name__ == "__main__":
    main()
