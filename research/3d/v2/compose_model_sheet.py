#!/usr/bin/env python3
# ============================================================================
# Female Aven 3D V2 — сборка превью-листа модели для оценки владельцем.
#
# Только CROP / RESIZE / COMPOSE уже существующих изображений (утверждённый
# reference + QC-рендеры собранной 3D-модели) + текстовые подписи.
# Никакой AI-генерации/редтирования лиц.
#
# Вход:
#   prototype/assets/character/master/female-aven-reference.jpg  (canonical)
#   research/3d/v2/out/preview/v2_*.png                          (Cycles QC)
# Выход:
#   review/3d-v2-model/female-aven-v2-preview.jpg
#
# Запуск: $ENV/venv-fit/bin/python research/3d/v2/compose_model_sheet.py
# ============================================================================
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
REF = os.path.join(REPO, "prototype", "assets", "character", "master",
                   "female-aven-reference.jpg")
PREV = os.path.join(HERE, "out", "preview")
OUT_DIR = os.path.join(REPO, "review", "3d-v2-model")
os.makedirs(OUT_DIR, exist_ok=True)

FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def cell(img_path, label, w, h, label_bg=(24, 24, 28)):
    im = Image.open(img_path).convert("RGB")
    # вписываем с сохранением пропорций
    im.thumbnail((w, h - 34), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), (16, 16, 20))
    canvas.paste(im, ((w - im.width) // 2, 34 + (h - 34 - im.height) // 2))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, w, 30], fill=label_bg)
    d.text((10, 6), label, fill=(235, 235, 240), font=font(FB, 16))
    return canvas


def main():
    W, H = 380, 500
    cols = 4
    REF_KEY = "__REF__"
    rows = [
        [(REF_KEY, "REFERENCE (утверждённый)"),
         ("v2_front.png", "V2 RENDER: front"),
         ("v2_left34.png", "V2: left 3/4"),
         ("v2_right34.png", "V2: right 3/4")],
        [("v2_left.png", "V2: слева"),
         ("v2_right.png", "V2: справа"),
         ("v2_back.png", "V2: сзади (волосы)"),
         ("v2_expr_smile.png", "V2: улыбка")],
        [("v2_expr_jawopen.png", "V2: jawOpen"),
         ("v2_expr_blink.png", "V2: blink"),
         ("v2_expr_viseme_o.png", "V2: viseme O"),
         ("v2_expr_brow.png", "V2: brows up")],
    ]
    sheet = Image.new("RGB", (cols * W, 20 + len(rows) * H + 30), (10, 10, 12))
    d = ImageDraw.Draw(sheet)
    d.text((10, 4), "Female Aven 3D V2 — первый кандидат (MPFB2 base + "
                    "landmarks-fit). Оценка сходства: владелец.",
           fill=(240, 240, 245), font=font(FB, 18))
    y = 30
    for row in rows:
        x = 0
        for path, label in row:
            if path == REF_KEY:
                c = cell(REF, label, W, H)
            else:
                c = cell(os.path.join(PREV, path), label, W, H)
            sheet.paste(c, (x, y))
            x += W
        y += H
    out = os.path.join(OUT_DIR, "female-aven-v2-preview.jpg")
    sheet.save(out, quality=90)
    print("written:", out, sheet.size)


if __name__ == "__main__":
    main()
