#!/usr/bin/env bash
# ============================================================================
# FEMALE AVEN 3D V2 — reproducible environment setup (sandbox / new machine)
#
# Что делает:
#   1) venv с официальным bpy-модулем Blender (headless, без GUI) + X/GL-заглушки
#      (Blender собран для десктопа; в headless-окружении без X11 мы удовлетворяем
#      динамический линковщик честными no-op заглушками — GUI никогда не вызывается);
#   2) venv с mediapipe (facemesh-landmarks, модели в комплекте wheels);
#   3) MPFB 2 (MakeHuman для Blender) из git по зафиксированному коммиту —
#      ставится как extension в пользовательский каталог Blender;
#   4) готовит user-data каталог MPFB.
#
# Все сторонние данные либо уже в репозитории (research/3d/v2/assets_vendor,
# sha256-верифицированные CC0-ассеты MakeHuman), либо ставятся этим скриптом
# с зафиксированными версиями. Сеть нужна только для PyPI и github.com.
#
# Использование:
#   bash research/3d/v2/env_setup.sh /home/user/env
#   (аргумент — каталог окружения; по умолчанию ./env рядом со скриптом)
# ============================================================================
set -euo pipefail

ENV_ROOT="${1:-$(cd "$(dirname "$0")" && pwd)/env}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MPFB_COMMIT="3edf9df0551765be43563d047888cf7877eb89b4"   # mpfb2 v2.0.17 (2026-09-26)
BPY_VERSION="5.0.1"
MP_VERSION="0.10.14"

mkdir -p "$ENV_ROOT"
cd "$ENV_ROOT"

echo "== [1/5] X/GL заглушки для headless bpy"
if [ ! -f "$ENV_ROOT/xstubs/libGL.so.1" ]; then
  mkdir -p xstubs
  cp "$REPO_ROOT/research/3d/v2/xstubs/"*.c "$REPO_ROOT/research/3d/v2/xstubs/"*.ver xstubs/ 2>/dev/null || true
  ( cd xstubs
    gcc -shared -fPIC -o libXfixes.so.3 xf.c
    gcc -shared -fPIC -o libXi.so.6    xi.c
    gcc -shared -fPIC -o libxkbcommon.so.0 xkb.c -Wl,--version-script=xkb.ver
    gcc -shared -fPIC -o libXt.so.6    xt.c
    gcc -shared -fPIC -o libSM.so.6    sm.c
    gcc -shared -fPIC -o libICE.so.6   ice.c
    gcc -shared -fPIC -o libGL.so.1    gl.c
    gcc -shared -fPIC -o libXrender.so.1 -x c /dev/null )
fi
export LD_LIBRARY_PATH="$ENV_ROOT/xstubs${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

echo "== [2/5] venv-bpy (Blender как python-модуль, $BPY_VERSION)"
if [ ! -x "$ENV_ROOT/venv-bpy/bin/python" ]; then
  python3 -m venv "$ENV_ROOT/venv-bpy"      # нужен python 3.11 (как у bpy-колеса)
  "$ENV_ROOT/venv-bpy/bin/pip" install --upgrade pip -q
  "$ENV_ROOT/venv-bpy/bin/pip" install "bpy==$BPY_VERSION"
fi

echo "== [3/5] venv-fit (mediapipe $MP_VERSION + numpy/scipy/pillow)"
if [ ! -x "$ENV_ROOT/venv-fit/bin/python" ]; then
  python3 -m venv "$ENV_ROOT/venv-fit"
  "$ENV_ROOT/venv-fit/bin/pip" install --upgrade pip -q
  "$ENV_ROOT/venv-fit/bin/pip" install "mediapipe==$MP_VERSION" scipy pillow
fi

echo "== [4/5] MPFB2 @ $MPFB_COMMIT -> extension для bpy"
if [ ! -d "$ENV_ROOT/mpfb2/.git" ]; then
  git clone https://github.com/makehumancommunity/mpfb2.git "$ENV_ROOT/mpfb2"
  git -C "$ENV_ROOT/mpfb2" checkout "$MPFB_COMMIT"
fi
BLEND_EXT_DIR="$HOME/.config/blender/5.0/extensions/user_default"
mkdir -p "$BLEND_EXT_DIR"
rm -rf "$BLEND_EXT_DIR/mpfb"
cp -r "$ENV_ROOT/mpfb2/src/mpfb" "$BLEND_EXT_DIR/mpfb"
# копируем верифицированные CC0-ассеты (глаза/зубы/язык/ресницы) в user data MPFB
# (из .mhcolo убираем строки material: материалы для V2 строятся своим этапом)
MPFB_DATA="$ENV_ROOT/mpfb_userdata/data"
mkdir -p "$MPFB_DATA"
for a in eyes teeth tongue eyelashes; do
  rm -rf "$MPFB_DATA/$a"; mkdir -p "$MPFB_DATA/$a"
  for f in "$REPO_ROOT/research/3d/v2/assets_vendor/$a/"*; do
    case "$f" in
      *.mhclo) grep -v "^material " "$f" > "$MPFB_DATA/$a/$(basename "$f")" ;;
      *) cp "$f" "$MPFB_DATA/$a/" ;;
    esac
  done
done

echo "== [5/5] smoke-тест"
"$ENV_ROOT/venv-bpy/bin/python" - << 'PYEOF'
import bpy
assert bpy.app.version_string.startswith("5.0"), bpy.app.version_string
bpy.ops.extensions.repo_refresh_all()
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
print("env_setup OK: bpy", bpy.app.version_string, "+ MPFB enabled")
PYEOF

echo "Готово. Дальше: bash research/3d/v2/run_all.sh $ENV_ROOT"
