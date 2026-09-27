#!/usr/bin/env bash
# Female Aven 3D V2 — сборка сравнительных листов для оценки владельцем.
#
# ВАЖНО: скрипт НЕ генерирует и НЕ редактирует лица. Он только CROP / RESIZE / COMPOSE
# уже существующих изображений (утверждённый master + ранее созданные AI-кандидаты) и
# добавляет текстовые подписи. Никакого beautify/morph/AI-генерации.
#
# Вход  (существующие файлы):
#   prototype/assets/character/master/female-aven-reference.jpg   (утверждённый reference)
#   prototype/assets/character/v2-reference-views/candidate-*.jpg (AI-кандидаты, Under Review)
# Выход:
#   contact-sheet.jpg   — reference в центре + 5 ракурсов вокруг, с подписями статуса
#   face-comparison.jpg — одинаково масштабированные crop лиц (turnaround: L→front→R)
# Оба кладутся в review/3d-v2-reference-views/ и prototype/assets/character/v2-reference-views/.
#
# Требуется: ImageMagick (convert, montage). Запуск из корня репозитория:
#   bash research/3d/build_v2_review_sheets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/prototype/assets/character/v2-reference-views"
OUT1="$ROOT/review/3d-v2-reference-views"
OUT2="$SRC"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FB="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

REF="$SRC/front-reference.jpg"            # = утверждённый master (копия для web)
L34="$SRC/candidate-left-34.jpg"
R34="$SRC/candidate-right-34.jpg"
LP="$SRC/candidate-left-profile.jpg"
RP="$SRC/candidate-right-profile.jpg"
BK="$SRC/candidate-back-hair.jpg"

# ---------- FACE COMPARISON (только crop + resize к общей высоте) ----------
# Боксы подобраны под кадры 1377x768 (кандидаты) и 1280x714 (front), проверены визуально.
FH=520   # общая высота кропов лица
convert "$LP"  -crop 420x490+460+95  +repage -resize x$FH "$TMP/c_lp.png"
convert "$L34" -crop 400x480+545+80  +repage -resize x$FH "$TMP/c_l34.png"
convert "$REF" -crop 380x460+455+55  +repage -resize x$FH "$TMP/c_front.png"
convert "$R34" -crop 400x480+520+80  +repage -resize x$FH "$TMP/c_r34.png"
convert "$RP"  -crop 430x490+560+95  +repage -resize x$FH "$TMP/c_rp.png"

# Подпись под каждым кропом (общая ширинa подписи = ширинa кропа).
cap_face () { # $1 img  $2 text  $3 bg  $4 fg  -> stacked png in $5
  local w; w=$(identify -format '%w' "$1")
  convert -size ${w}x54 -background "$3" -fill "$4" -font "$FB" -pointsize 20 \
          -gravity center caption:"$2" "$TMP/_capf.png"
  convert "$1" "$TMP/_capf.png" -append "$5"
}
cap_face "$TMP/c_lp.png"    "Left Profile · AI · НЕ УТВЕРЖДЁН"  "#2a1414" "#ff8a8a" "$TMP/t_lp.png"
cap_face "$TMP/c_l34.png"   "Left 3/4 · AI · НЕ УТВЕРЖДЁН"      "#2a1414" "#ff8a8a" "$TMP/t_l34.png"
cap_face "$TMP/c_front.png" "FRONT · УТВЕРЖДЁННЫЙ REFERENCE"    "#12341a" "#7ee29a" "$TMP/t_front.png"
cap_face "$TMP/c_r34.png"   "Right 3/4 · AI · НЕ УТВЕРЖДЁН"     "#2a1414" "#ff8a8a" "$TMP/t_r34.png"
cap_face "$TMP/c_rp.png"    "Right Profile · AI · НЕ УТВЕРЖДЁН" "#2a1414" "#ff8a8a" "$TMP/t_rp.png"

montage "$TMP/t_lp.png" "$TMP/t_l34.png" "$TMP/t_front.png" "$TMP/t_r34.png" "$TMP/t_rp.png" \
        -tile 5x1 -geometry +6+6 -background '#0d0f14' "$TMP/faces_row.png"
FW=$(identify -format '%w' "$TMP/faces_row.png")
convert -size ${FW}x108 -background '#0d0f14' -fill '#eef2f8' -font "$FB" -pointsize 26 \
   -gravity center caption:"FACE COMPARISON · одинаковый масштаб · только crop/resize (без beautify/morph)\nСравнивайте: лоб, брови, глаза и расстояние между ними, нос и переносицу, губы, подбородок, jawline, уши, линию волос" \
   "$TMP/faces_title.png"
convert "$TMP/faces_title.png" "$TMP/faces_row.png" -append -background '#0d0f14' \
   -bordercolor '#0d0f14' -border 10 "$TMP/face-comparison.jpg"

# ---------- CONTACT SHEET (3x3, reference в центре) ----------
TW=480; TH=320   # размер картиночной части тайла
tile () { # $1 img  $2 caption  $3 capbg  $4 capfg  $5 framecolor  -> $6 out
  # картиночная часть: вписать в TWxTH, красная рамка для reference через extent
  if [ -n "$5" ]; then
    convert "$1" -resize $((TW-14))x$((TH-14)) -background '#20222a' -gravity center \
            -extent $((TW-14))x$((TH-14)) -bordercolor "$5" -border 7 "$TMP/_img.png"
  else
    convert "$1" -resize ${TW}x${TH} -background '#20222a' -gravity center \
            -extent ${TW}x${TH} "$TMP/_img.png"
  fi
  convert "$TMP/_img.png" -resize ${TW}x${TH}! "$TMP/_img.png"
  convert -size ${TW}x62 -background "$3" -fill "$4" -font "$FB" -pointsize 22 \
          -gravity center caption:"$2" "$TMP/_cap.png"
  convert "$TMP/_img.png" "$TMP/_cap.png" -append "$6"
}
texttile () { # $1 text  $2 fg  -> $3
  convert -size ${TW}x$((TH+62)) -background '#151821' -fill "$2" -font "$FB" -pointsize 22 \
          -gravity center caption:"$1" "$3"
}

tile "$L34" "Left 3/4 · AI · НЕ УТВЕРЖДЁН"      "#2a1414" "#ff8a8a" "" "$TMP/g_l34.png"
tile "$BK"  "Back / Hair · AI · НЕ УТВЕРЖДЁН"   "#2a1414" "#ff8a8a" "" "$TMP/g_bk.png"
tile "$R34" "Right 3/4 · AI · НЕ УТВЕРЖДЁН"     "#2a1414" "#ff8a8a" "" "$TMP/g_r34.png"
tile "$LP"  "Left Profile · AI · НЕ УТВЕРЖДЁН"  "#2a1414" "#ff8a8a" "" "$TMP/g_lp.png"
tile "$REF" "★ УТВЕРЖДЁННЫЙ REFERENCE ★"        "#12341a" "#8be0a6" "#e23b3b" "$TMP/g_ref.png"
tile "$RP"  "Right Profile · AI · НЕ УТВЕРЖДЁН" "#2a1414" "#ff8a8a" "" "$TMP/g_rp.png"
texttile "Female Aven\n3D V2 · contact sheet" "#eef2f8" "$TMP/g_title.png"
texttile "СТАТУС\nЦЕНТР (в рамке) — УТВЕРЖДЁН.\nОстальные 5 — AI GENERATED,\nUnder Review (НЕ утверждены)." "#ffd27a" "$TMP/g_status.png"
texttile "Только crop/resize\nсуществующих файлов.\nБез генерации, beautify,\nmorph и правок черт." "#bcd3ff" "$TMP/g_legend.png"

montage "$TMP/g_l34.png"   "$TMP/g_bk.png"     "$TMP/g_r34.png" \
        "$TMP/g_lp.png"    "$TMP/g_ref.png"    "$TMP/g_rp.png" \
        "$TMP/g_title.png" "$TMP/g_status.png" "$TMP/g_legend.png" \
        -tile 3x3 -geometry +8+8 -background '#0d0f14' "$TMP/grid.png"
GW=$(identify -format '%w' "$TMP/grid.png")
convert -size ${GW}x96 -background '#0d0f14' -fill '#eef2f8' -font "$FB" -pointsize 30 \
   -gravity center caption:"Female Aven — сравнение ракурсов · ЦЕНТР = УТВЕРЖДЁННЫЙ REFERENCE · остальные AI, НЕ УТВЕРЖДЕНЫ" \
   "$TMP/grid_title.png"
convert "$TMP/grid_title.png" "$TMP/grid.png" -append -background '#0d0f14' \
   -bordercolor '#0d0f14' -border 10 "$TMP/contact-sheet.jpg"

# ---------- publish ----------
for d in "$OUT1" "$OUT2"; do
  mkdir -p "$d"
  cp "$TMP/contact-sheet.jpg"   "$d/contact-sheet.jpg"
  cp "$TMP/face-comparison.jpg" "$d/face-comparison.jpg"
done
echo "contact-sheet:   $(identify -format '%wx%h' "$OUT2/contact-sheet.jpg")"
echo "face-comparison: $(identify -format '%wx%h' "$OUT2/face-comparison.jpg")"
