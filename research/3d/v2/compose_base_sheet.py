#!/usr/bin/env python3
# ============================================================================
# Female Aven 3D V2 — сборка листов ЧИСТОЙ SCULPT-BASE (НЕ Female Aven).
#
# Только CROP / RESIZE / COMPOSE существующих рендеров + подписи.
# Никакой AI-генерации/ретуши.
#
# Выход:
#   review/3d-v2-model/base-clay-views.jpg       (5 clay-ракурсов чистой базы)
#   review/3d-v2-model/base-reference-setup.jpg  (reference-стенд в Blender)
#
# Запуск: /home/user/venv-fit/bin/python research/3d/v2/compose_base_sheet.py
# ============================================================================
import json
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = os.path.join(HERE, "out", "sculpt_base")
OUT_DIR = os.path.join(REPO, "review", "3d-v2-model")

FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def cell(img_path, label, w, h, accent=(24, 24, 28)):
    im = Image.open(img_path).convert("RGB")
    canvas = Image.new("RGB", (w, h), (16, 16, 20))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, w, 30], fill=accent)
    d.text((10, 7), label, fill=(235, 235, 240), font=font(FB, 15))
    avail_w, avail_h = w - 16, h - 42
    im.thumbnail((avail_w, avail_h), Image.LANCZOS)
    canvas.paste(im, ((w - im.width) // 2, 36 + (avail_h - im.height) // 2))
    return canvas


def info_cell(lines, w, h):
    canvas = Image.new("RGB", (w, h), (16, 16, 20))
    d = ImageDraw.Draw(canvas)
    y = 44
    for size, color, text in lines:
        d.text((18, y), text, fill=color, font=font(
            FB if size > 15 else FR, size))
        y += size + 10
    return canvas


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    meta = json.load(open(os.path.join(
        REPO, "prototype", "assets", "3d", "sculpt",
        "female-aven-sculpt-base.meta.json")))

    # ---------- лист 1: 5 clay-видов чистой базы ----------
    W, H = 760, 950
    views = [
        ("base_clay_front.png", "BASE — front"),
        ("base_clay_left34.png", "BASE — left 3/4"),
        ("base_clay_right34.png", "BASE — right 3/4"),
        ("base_clay_left_profile.png", "BASE — left profile"),
        ("base_clay_right_profile.png", "BASE — right profile"),
    ]
    info = info_cell([
        (20, (242, 242, 246), "ЧТО ЭТО"),
        (14, (168, 170, 178), "Чистая нейтральная sculpt-base (MPFB hm08,"),
        (14, (168, 170, 178), "CC0; макросы: женщина, взрослый, 0.30 muscle,"),
        (14, (168, 170, 178), "0.35 weight). БЕЗ landmark/TPS-деформаций."),
        (14, (168, 170, 178), ""),
        (18, (242, 242, 246), "ЭТО НЕ FEMALE AVEN"),
        (14, (168, 170, 178), "Усреднённая человеческая голова-отправная"),
        (14, (168, 170, 178), "точка. Автоматический face fit ОТКЛОНён"),
        (14, (168, 170, 178), "владельцем (REJECTED: разрушена форма между"),
        (14, (168, 170, 178), "контрольными точками). Дальше — controlled"),
        (14, (168, 170, 178), "sculpt в Blender по reference views."),
        (14, (168, 170, 178), ""),
        (18, (242, 242, 246), "ДАННЫЕ"),
        (14, (168, 170, 178), "Body: %d verts / %d tris (бюст, крышки срезов)"
         % (meta["base"]["verts"], meta["base"]["tris"])),
        (14, (168, 170, 178), "Глаза: отдельные яблоки %d+%d; sockets открыты"
         % (meta["proxies"]["eyes_L"], meta["proxies"]["eyes_R"])),
        (14, (168, 170, 178), "Риг: %d костей, БЕЗ весов (sculpt first)"
         % len(meta["rig"]["bones"])),
        (14, (168, 170, 178), "Clay: серый матовый, metallic 0, rough 0.72"),
    ], W, H)
    cells = [cell(os.path.join(SRC, f), lab, W, H) for f, lab in views] + [info]
    sheet = Image.new("RGB", (2 * W, 30 + 3 * H), (10, 10, 12))
    d = ImageDraw.Draw(sheet)
    d.text((12, 5), "Female Aven V2 — ЧИСТАЯ SCULPT-BASE (НЕ Female Aven; "
                    "clay, геометрия без деформаций)",
           fill=(242, 242, 246), font=font(FB, 20))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % 2) * W, 30 + (i // 2) * H))
    out1 = os.path.join(OUT_DIR, "base-clay-views.jpg")
    sheet.save(out1, quality=90)
    print("written:", out1, sheet.size,
          "%.0f KB" % (os.path.getsize(out1) / 1024))

    # ---------- лист 2: reference-стенд ----------
    W2, H2 = 1280, 940
    sheet2 = Image.new("RGB", (W2, H2), (10, 10, 12))
    d = ImageDraw.Draw(sheet2)
    d.text((12, 8), "Sculpt-base .blend: reference-стенд (6 калиброванных "
                    "плейнов + 6 камер + гайды)",
           fill=(242, 242, 246), font=font(FB, 20))
    setup = Image.open(os.path.join(SRC, "base_reference_setup.png")).convert("RGB")
    setup.thumbnail((W2 - 24, H2 - 150), Image.LANCZOS)
    sheet2.paste(setup, ((W2 - setup.width) // 2, 44))
    y = 54 + setup.height
    d.text((14, y), "Плейны: front (canonical), left/right 3/4, left/right "
                    "profile, back/hair. Калибровка: глаза↔ирисы, "
                    "подбородок↔152, кончик носа↔1 (landmarks fit_01).",
           fill=(200, 202, 210), font=font(FR, 15))
    d.text((14, y + 24), "Коллекции: FEMALE_AVEN_BASE / EYES / FACE_PROXIES "
                         "(скрыты) / RIG (без весов) / REFERENCES / GUIDES "
                         "(ось симметрии + уровни brow..chin).",
           fill=(200, 202, 210), font=font(FR, 15))
    d.text((14, y + 48), "Файл: prototype/assets/3d/sculpt/"
                         "female-aven-sculpt-base.blend (%.1f МБ, изображения "
                         "упакованы)" % (meta["blend_bytes"] / 1048576),
           fill=(200, 202, 210), font=font(FR, 15))
    out2 = os.path.join(OUT_DIR, "base-reference-setup.jpg")
    sheet2.save(out2, quality=90)
    print("written:", out2, sheet2.size,
          "%.0f KB" % (os.path.getsize(out2) / 1024))


if __name__ == "__main__":
    main()
