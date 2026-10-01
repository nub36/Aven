#!/usr/bin/env bash
# Aven для Android — синхронизация web-ассетов прототипа в bundle APK.
#
# Модель v1 (ADR-114): вариант A — ЛОКАЛЬНЫЕ ассеты внутри APK (не тонкая обёртка URL):
# приложение запускается без зависимости от GitHub Pages, версия APK детерминирована.
# Источник истины — prototype/ (общая с веб-сайтом бизнес-логика; android-копий разделов нет).
#
# Что входит (runtime-путь index.html):
#   index.html, css/**, js/** (кроме js/aven3d.js — его страницы не входят),
#   assets/aven-female.png, assets/aven-male.png, assets/character/web/female-aven-transparent.png,
#   assets/voice-samples/manifest.js (подключён <script> в index.html).
# Что НЕ входит (~20 МБ, экономия APK):
#   assets/3d (эксперимент), assets/voice-samples/**.mp3 (лаборатория голосов),
#   assets/character/master|v2-reference-views (исследование), assets/vendor (three.js — только
#   3D-страницы), prototype/tests, voice-lab*.html, voice-compare.html, aven-3d*.html, README.
#
# Cache-bust: __ASSET_VERSION__ в index.html заменяется VERSION_NAME (та же роль, что у
# подстановки SHA в Pages-workflow).
#
# Запуск: bash android/sync-web-assets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/prototype"
DST="$ROOT/android/app/src/main/assets/www"

VERSION_NAME="$(grep '^VERSION_NAME=' "$ROOT/android/version.txt" | cut -d= -f2)"
[ -n "$VERSION_NAME" ] || { echo "sync-web-assets: VERSION_NAME пустой"; exit 1; }

rm -rf "$DST"
mkdir -p "$DST/assets/character/web" "$DST/assets/voice-samples"

cp "$SRC/index.html" "$DST/"
cp -R "$SRC/css" "$DST/css"
cp -R "$SRC/js" "$DST/js"
rm -f "$DST/js/aven3d.js"
cp "$SRC/assets/aven-female.png" "$DST/assets/aven-female.png"
cp "$SRC/assets/aven-male.png" "$DST/assets/aven-male.png"
cp "$SRC/assets/character/web/female-aven-transparent.png" "$DST/assets/character/web/female-aven-transparent.png"
cp "$SRC/assets/voice-samples/manifest.js" "$DST/assets/voice-samples/manifest.js"

# cache-bust аналогично Pages (SHA → здесь VERSION_NAME)
sed -i "s/__ASSET_VERSION__/$VERSION_NAME/g" "$DST/index.html"
if grep -q '__ASSET_VERSION__' "$DST/index.html"; then
  echo "sync-web-assets: не все __ASSET_VERSION__ заменены"; exit 1
fi

SIZE="$(du -sm "$DST" | cut -f1)"
echo "sync-web-assets: $DST готов ($SIZE МБ, версия $VERSION_NAME)"
