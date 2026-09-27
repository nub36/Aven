#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — общие утилиты стадий (измерения лица, семантика).
# ============================================================================
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

MP = {
    "nose_tip": 1, "nasion": 168, "bridge_mid": 6, "subnasale": 2,
    "ala_imgL": 98, "ala_imgR": 327,
    "chin_bottom": 152, "chin_imgL": 172, "chin_imgR": 397,
    "lip_top_center": 0, "lip_bottom_center": 17,
    "mouth_corner_imgL": 61, "mouth_corner_imgR": 291,
    "eye_outer_imgL": 33, "eye_inner_imgL": 133,
    "eye_outer_imgR": 263, "eye_inner_imgR": 362,
    "iris_center_imgL": 468, "iris_center_imgR": 473,
    "cheek_contour_imgL": 234, "cheek_contour_imgR": 454,
    "brow_inner_imgL": 55, "brow_inner_imgR": 285,
    "brow_mid_imgL": 105, "brow_mid_imgR": 334,
    "brow_outer_imgL": 107, "brow_outer_imgR": 336,
    "jaw_imgL": 132, "jaw_imgR": 361,
    "temple_imgL": 127, "temple_imgR": 356,
    "forehead_mid": 151, "forehead_high_imgL": 103, "forehead_high_imgR": 332,
}
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
             379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
             234, 127, 162, 21, 54, 103, 67, 109]
EYE_RING_imgL = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7]
EYE_RING_imgR = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]
BROW_imgL = [70, 63, 105, 66, 107]
BROW_imgR = [300, 293, 334, 296, 336]
LIPS_OUTER = [61, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
NOSE_BRIDGE = [168, 6, 197, 195, 5, 4]
NOSE_BOTTOM = [129, 98, 97, 2, 326, 327, 352]


def mask_of(unit_masks, *names):
    out = []
    for n in unit_masks:
        if n in names:
            out.extend(unit_masks[n])
    return np.array(sorted(set(out)), dtype=np.int64)


def mesh_face_measures(verts, unit_masks, groups):
    """Измерения лица меша (метры) через маски expression-юнитов.

    Ориентация MPFB: лицо в -Y, верх +Z, subject's left = +X.
    """
    x, y, z = verts[:, 0], verts[:, 1], verts[:, 2]
    eyeL = verts[groups["joint-l-eye"][0]]
    eyeR = verts[groups["joint-r-eye"][0]]
    if eyeL[0] < eyeR[0]:
        eyeL, eyeR = eyeR, eyeL
    z_eye = 0.5 * (eyeL[2] + eyeR[2])

    m = {}
    m["iris_span"] = float(eyeL[0] - eyeR[0])
    lidL = verts[mask_of(unit_masks, "eye-left-closure")]
    lidR = verts[mask_of(unit_masks, "eye-right-closure")]
    m["eye_width"] = float(lidL[:, 0].max() - lidL[:, 0].min())
    lips = verts[mask_of(unit_masks, "mouth-compression", "mouth-pursing",
                         "mouth-eversion", "mouth-part-later", "mouth-protusion")]
    lips = lips[np.abs(lips[:, 0]) < 0.055]
    m["mouth_width"] = float(lips[:, 0].max() - lips[:, 0].min())
    m["mouth_z"] = float(np.median(lips[:, 2]))
    nose = verts[mask_of(unit_masks, "nose-compression", "nose-left-dilatation",
                         "nose-right-dilatation", "nose-depression")]
    nose = nose[(np.abs(nose[:, 0]) < 0.045) & (nose[:, 2] < z_eye)]
    m["nose_width"] = float(nose[:, 0].max() - nose[:, 0].min())
    mo = verts[mask_of(unit_masks, "mouth-open")]
    ch = mo[(mo[:, 1] < -0.10) & (mo[:, 2] < m["mouth_z"] - 0.005) &
            (mo[:, 2] > m["mouth_z"] - 0.06) & (np.abs(mo[:, 0]) < 0.03)]
    chin_z = float(ch[:, 2].min())
    m["eye_to_chin"] = float(z_eye - chin_z)
    m["mouth_to_chin"] = m["mouth_z"] - chin_z
    # ширина лица: контур щёк (ПЕРЕД ушами; уши сидят на y > -0.10)
    band = (np.abs(z - (z_eye - 0.045)) < 0.015) & (y < -0.10) & (y > -0.145)
    m["face_width"] = float(verts[band][:, 0].max() - verts[band][:, 0].min())
    m["eye_z"] = float(z_eye)
    m["chin_z"] = chin_z
    m["face_ratio_h_w"] = m["eye_to_chin"] / m["face_width"]
    return m


def image_face_measures(lm):
    """Измерения canonical front reference (в пикселях)."""
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
