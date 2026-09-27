#!/usr/bin/env python3
# ============================================================================
# FEMALE AVEN 3D V2 — Stage 1: извлечение facial landmarks из reference-видов.
#
# Вход (УТВЕРЖДЁННЫЕ владельцем references):
#   - prototype/assets/character/master/female-aven-reference.jpg   (CANONICAL)
#   - prototype/assets/character/v2-reference-views/candidate-*.jpg  (aux, вар. A)
#
# Выход: out/landmarks.json
#   - на каждый вид: 478 mediapipe FaceMesh landmarks (refine=true, с irises)
#     в пикселях и нормализованных координатах + visibility;
#   - pose-landmarks (плечи) для canonical front;
#   - оценка yaw каждого вида; детекция того, какой профиль левый/правый;
#   - базовые симметричные измерения лица (для контроля фита).
#
# Запуск (после env_setup.sh):
#   LD_LIBRARY_PATH=$ENV/xstubs $ENV/venv-fit/bin/python fit_01_landmarks.py
# ============================================================================
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

MASTER = os.path.join(REPO, "prototype/assets/character/master/female-aven-reference.jpg")
VIEWS_DIR = os.path.join(REPO, "prototype/assets/character/v2-reference-views")

VIEWS = {
    # имя вида -> файл; front = canonical master (высший приоритет)
    "front": MASTER,
    "left34": os.path.join(VIEWS_DIR, "candidate-left-34.jpg"),
    "right34": os.path.join(VIEWS_DIR, "candidate-right-34.jpg"),
    "left_profile": os.path.join(VIEWS_DIR, "candidate-left-profile.jpg"),
    "right_profile": os.path.join(VIEWS_DIR, "candidate-right-profile.jpg"),
    "back": os.path.join(VIEWS_DIR, "candidate-back-hair.jpg"),
}

# Ключевые индексы FaceMesh (image-space: "L" = левая половина ИЗОБРАЖЕНИЯ)
KEY = {
    "nose_tip": 1, "nasion": 168, "bridge_mid": 6,
    "ala_L": 98, "ala_R": 327, "subnasale": 2,
    "chin_bottom": 152, "lip_top_center": 0, "lip_bottom_center": 17,
    "mouth_corner_L": 61, "mouth_corner_R": 291,
    "eye_outer_L": 33, "eye_inner_L": 133, "eye_outer_R": 263, "eye_inner_R": 362,
    "iris_center_L": 468, "iris_center_R": 473,
    "face_top": 10, "cheek_contour_L": 234, "cheek_contour_R": 454,
    "brow_inner_L": 55, "brow_inner_R": 285,
    "brow_mid_L": 105, "brow_mid_R": 334,
    "brow_outer_L": 107, "brow_outer_R": 336,
}

# Кольцо контура лица (face oval) в порядке обхода
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
             379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
             234, 127, 162, 21, 54, 103, 67, 109]

EYE_RING_L = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7]
EYE_RING_R = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]
LIPS_OUTER = [61, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]


def detect_view(img_path):
    """Возвращает (ok, landmarks_px Nx2, landmarks_norm Nx3, visibility Nx1, size)."""
    import mediapipe as mp
    img = cv2.imread(img_path)
    if img is None:
        raise IOError("cannot read " + img_path)
    h, w = img.shape[:2]
    with mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True, refine_landmarks=True, max_num_faces=1) as fm:
        r = fm.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    if not r.multi_face_landmarks:
        return False, None, None, None, (w, h)
    lm = r.multi_face_landmarks[0].landmark
    px = np.array([[p.x * w, p.y * h] for p in lm], dtype=np.float64)
    nrm = np.array([[p.x, p.y, p.z] for p in lm], dtype=np.float64)
    vis = np.array([p.visibility if hasattr(p, "visibility") else 1.0 for p in lm])
    return True, px, nrm, vis, (w, h)


def detect_pose_shoulders(img_path):
    """Поза (плечи/уши) на canonical front — для посадки бюста и ширины плеч."""
    import mediapipe as mp
    img = cv2.imread(img_path)
    h, w = img.shape[:2]
    with mp.solutions.pose.Pose(static_image_mode=True) as pose:
        r = pose.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    out = {}
    if r.pose_landmarks:
        for name, idx in [("ear_L", 7), ("ear_R", 8), ("shoulder_L", 11), ("shoulder_R", 12)]:
            p = r.pose_landmarks.landmark[idx]
            out[name] = [p.x * w, p.y * h, p.visibility]
    return out


def main():
    result = {"views": {}, "pose": {}, "metrics": {}}
    for name, path in VIEWS.items():
        ok, px, nrm, vis, size = detect_view(path)
        print(f"[{name}] face={'OK' if ok else 'NOT FOUND'} size={size[0]}x{size[1]}")
        if not ok:
            result["views"][name] = {"face_found": False, "size": list(size)}
            continue
        view = {"face_found": True, "size": list(size),
                "landmarks_px": px.round(3).tolist(),
                "landmarks_norm": nrm.round(5).tolist(),
                "visibility": vis.round(3).tolist()}
        # оценка yaw: смещение кончика носа относительно середины между контурами лица
        cx = 0.5 * (px[KEY["cheek_contour_L"]][0] + px[KEY["cheek_contour_R"]][0])
        face_w = abs(px[KEY["cheek_contour_R"]][0] - px[KEY["cheek_contour_L"]][0])
        nose_off = (px[KEY["nose_tip"]][0] - cx) / max(face_w, 1e-6)
        yaw_est = float(np.degrees(np.arcsin(np.clip(nose_off / 0.5, -1, 1))))
        view["yaw_estimate_deg"] = round(yaw_est, 2)
        # какой глаз виден лучше (для профилей)
        vis_eye_L = float(np.mean(vis[EYE_RING_L]))
        vis_eye_R = float(np.mean(vis[EYE_RING_R]))
        view["eye_visibility"] = {"imgL": round(vis_eye_L, 3), "imgR": round(vis_eye_R, 3)}
        # видимый профиль: если лучше виден imgL-глаз -> это сторона L изображения
        result["views"][name] = view

    # canonical front: симметричные измерения (в пикселях)
    if result["views"]["front"]["face_found"]:
        px = np.array(result["views"]["front"]["landmarks_px"])
        m = {}
        m["face_width_contour"] = float(px[454][0] - px[234][0])
        m["face_height_top_to_chin"] = float(px[152][1] - px[10][1])
        m["eye_distance_outer"] = float(px[263][0] - px[33][0])
        m["eye_distance_inner"] = float(px[362][0] - px[133][0])
        m["iris_distance"] = float(px[473][0] - px[468][0])
        m["iris_diameter_L"] = float(np.linalg.norm(px[469] - px[471]))
        m["iris_diameter_R"] = float(np.linalg.norm(px[474] - px[476]))
        m["mouth_width"] = float(px[291][0] - px[61][0])
        m["nose_width_ala"] = float(px[327][0] - px[98][0])
        m["eye_to_nose_tip_y"] = float(px[1][1] - 0.5 * (px[159][1] + px[386][1]))
        m["ratio_face_h_over_w"] = round(m["face_height_top_to_chin"] / m["face_width_contour"], 4)
        m["ratio_eye_over_face_w"] = round(m["eye_distance_outer"] / m["face_width_contour"], 4)
        result["metrics"] = {k: round(v, 3) for k, v in m.items()}
        print("front metrics:", json.dumps(result["metrics"], indent=1))

    result["pose"] = detect_pose_shoulders(MASTER)
    print("pose:", result["pose"])

    out_path = os.path.join(OUT, "landmarks.json")
    with open(out_path, "w") as f:
        json.dump(result, f)
    print("written:", out_path)


if __name__ == "__main__":
    main()
