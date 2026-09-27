#!/usr/bin/env python3
# ============================================================================
# Female Aven 3D V2 — сборка CLAY COMPARISON SHEETS (диагностика геометрии).
#
# Только CROP / RESIZE / COMPOSE существующих изображений:
#   - утверждённые владельцем auxiliary reference views (PR #14);
#   - clay-рендеры из out/clay/ (geometry == GLB, см. clay_review.py).
# Никакой AI-генерации/ретуши/blur.
#
# Кроп reference-ов ПО ЛАНДМАРКАМ (out/landmarks.json, 478 точек из fit_01) —
# объективно, без ручного «подгонания» кадра.
#
# Выход:
#   review/3d-v2-model/clay-full-comparison.jpg   (7 ракурсов: REF | CLAY)
#   review/3d-v2-model/clay-face-closeup.jpg      (5 ракурсов, лицо крупно)
#
# Запуск: /home/user/venv-fit/bin/python research/3d/v2/compose_clay_sheets.py
# ============================================================================
import json
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
REF_DIR = os.path.join(REPO, "prototype", "assets", "character",
                       "v2-reference-views")
CLAY = os.path.join(HERE, "out", "clay")
OUT_DIR = os.path.join(REPO, "review", "3d-v2-model")

FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


LM = json.load(open(os.path.join(HERE, "out", "landmarks.json")))["views"]
META = json.load(open(os.path.join(CLAY, "clay_review_meta.json")))


def ref_crop(name, view, aspect=0.8, mx=0.15, my_top=0.25, my_bot=0.15):
    """Кроп reference по bbox ландмарок с полями; aspect = w/h (4:5 = 0.8)."""
    im = Image.open(os.path.join(REF_DIR, name)).convert("RGB")
    W, H = im.size
    lm = LM.get(view)
    if not lm or not lm.get("face_found"):
        return im
    xs = [p[0] for p in lm["landmarks_px"]]
    ys = [p[1] for p in lm["landmarks_px"]]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    w, h = x1 - x0, y1 - y0
    x0 -= w * mx
    x1 += w * mx
    y0 -= h * my_top
    y1 += h * my_bot
    # приводим к нужному аспекту, расширяя меньшую сторону
    cw, ch = x1 - x0, y1 - y0
    if cw / ch < aspect:
        cw = aspect * ch
        cx = (x0 + x1) / 2
        x0, x1 = cx - cw / 2, cx + cw / 2
    else:
        ch = cw / aspect
        cy = (y0 + y1) / 2
        y0, y1 = cy - ch / 2, cy + ch / 2
    # вписываем в границы изображения (сохраняя аспект)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(W, x1), min(H, y1)
    cw, ch = x1 - x0, y1 - y0
    if cw / ch > aspect:
        cw = aspect * ch
        cx = (x0 + x1) / 2
        x0, x1 = cx - cw / 2, cx + cw / 2
    else:
        ch = cw / aspect
        cy = (y0 + y1) / 2
        y0, y1 = cy - ch / 2, cy + ch / 2
    return im.crop((int(x0), int(y0), int(x1), int(y1)))


def cell(img, label, w, h, bg_label="REFERENCE", accent=(24, 24, 28)):
    """Ячейка: полка с подписью сверху + вписанное изображение."""
    canvas = Image.new("RGB", (w, h), (16, 16, 20))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, w, 30], fill=accent)
    d.text((10, 7), label, fill=(235, 235, 240), font=font(FB, 15))
    avail_w, avail_h = w - 16, h - 42
    im = img.copy()
    im.thumbnail((avail_w, avail_h), Image.LANCZOS)
    canvas.paste(im, ((w - im.width) // 2, 36 + (avail_h - im.height) // 2))
    return canvas


def placeholder(w, h, text):
    canvas = Image.new("RGB", (w, h), (28, 28, 34))
    d = ImageDraw.Draw(canvas)
    d.text((16, 16), text, fill=(150, 152, 160), font=font(FR, 15))
    return canvas


def sheet(rows, cell_w, cell_h, title, subtitle, out_name):
    cols = 2
    header_h = 86
    W = cols * cell_w
    H = header_h + len(rows) * (cell_h + 26)
    img = Image.new("RGB", (W, H), (10, 10, 12))
    d = ImageDraw.Draw(img)
    d.text((12, 10), title, fill=(242, 242, 246), font=font(FB, 22))
    d.text((12, 44), subtitle, fill=(168, 170, 178), font=font(FR, 14))
    y = header_h
    for label, ref_im, clay_name, note in rows:
        clay_im = Image.open(os.path.join(CLAY, clay_name + ".png")).convert("RGB")
        c1 = cell(ref_im, "REFERENCE — " + label, cell_w, cell_h)
        c2 = cell(clay_im, "V2 CLAY — " + label, cell_w, cell_h,
                  accent=(46, 52, 64))
        img.paste(c1, (0, y))
        img.paste(c2, (cell_w, y))
        if note:
            d.text((12, y + cell_h + 5), note, fill=(150, 152, 160),
                   font=font(FR, 13))
        y += cell_h + 26
    out = os.path.join(OUT_DIR, out_name)
    img.save(out, quality=88)
    print("written:", out, img.size,
          "%.0f KB" % (os.path.getsize(out) / 1024))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sha = META["glb_sha256"][:12]

    # ---------- лист 1: полное сравнение (7 ракурсов) ----------
    full_rows = [
        ("FRONT (canonical master)", ref_crop("front-reference.jpg", "front",
                                               mx=0.45, my_top=0.45, my_bot=0.60),
         "clay_full_front", ""),
        ("LEFT 3/4", ref_crop("candidate-left-34.jpg", "left34",
                              mx=0.45, my_top=0.45, my_bot=0.60),
         "clay_full_left34", ""),
        ("RIGHT 3/4", ref_crop("candidate-right-34.jpg", "right34",
                               mx=0.45, my_top=0.45, my_bot=0.60),
         "clay_full_right34", ""),
        ("LEFT PROFILE", ref_crop("candidate-left-profile.jpg", "left_profile",
                                  mx=0.45, my_top=0.45, my_bot=0.60),
         "clay_full_left_profile", ""),
        ("RIGHT PROFILE", ref_crop("candidate-right-profile.jpg", "right_profile",
                                   mx=0.45, my_top=0.45, my_bot=0.60),
         "clay_full_right_profile", ""),
        ("BACK", Image.open(os.path.join(REF_DIR, "candidate-back-hair.jpg")).convert("RGB"),
         "clay_full_back",
         "BACK: на reference — волосы; в clay волосы скрыты (видна форма головы)."),
        ("TOP ~30°", None, "clay_full_top",
         "TOP: reference-ракурс сверху не создавался (только clay)."),
    ]
    rows = []
    for label, ref_im, clay_name, note in full_rows:
        if ref_im is None:
            ref_im = placeholder(720, 900, "REFERENCE: —\n(ракурс сверху не создавался)")
        rows.append((label, ref_im, clay_name, note))
    sheet(rows, 720, 900,
          "Female Aven 3D V2 — CLAY GEOMETRY REVIEW (полные ракурсы)",
          "Геометрия НЕ изменена: рендер из самого GLB (sha256 " + sha +
          "…), сверена с базисом сборки (KDTree < 1e-4 м). "
          "Волосы/одежда/ресницы скрыты; clay: серый матовый, metallic 0, roughness 0.72. "
          "Верdict по геометрии — владелец.",
          "clay-full-comparison.jpg")

    # ---------- лист 2: лицо крупно (5 ракурсов) ----------
    close_rows = [
        ("FRONT", ref_crop("front-reference.jpg", "front"),
         "clay_close_front"),
        ("LEFT 3/4", ref_crop("candidate-left-34.jpg", "left34"),
         "clay_close_left34"),
        ("RIGHT 3/4", ref_crop("candidate-right-34.jpg", "right34"),
         "clay_close_right34"),
        ("LEFT PROFILE", ref_crop("candidate-left-profile.jpg", "left_profile"),
         "clay_close_left_profile"),
        ("RIGHT PROFILE", ref_crop("candidate-right-profile.jpg", "right_profile"),
         "clay_close_right_profile"),
    ]
    rows = [(label, ref_im, clay_name, "") for label, ref_im, clay_name in close_rows]
    sheet(rows, 840, 1050,
          "Female Aven 3D V2 — FACE GEOMETRY CLOSE-UP (clay vs reference)",
          "Только лицо крупно. Кроп reference по 478 ландмаркам (объективно). "
          "Clay = та же геометрия GLB (sha256 " + sha +
          "…), нейтральное выражение, рот закрыт. Оценка: A (сохраняем) / B (правим области) / C (не похоже).",
          "clay-face-closeup.jpg")


if __name__ == "__main__":
    main()
