#!/usr/bin/env bash
# Aven — production-like TTS-сервер Natural Voice на VPS владельца (этап 6).
# Ubuntu 24.04, 1 CPU, 2 ГБ RAM, без GPU. НИЧЕГО платного, ключей нет.
#
# Выбранный голос: Silero v5 CIS (MIT) ru_aigul — Natural Voice Female Aven
# (решение владельца по итогам этапа 5; docs/TTS_RESEARCH.md §18–19).
#
# Использование (на VPS, от root или через sudo):
#   ./deploy-vps.sh silero    # Silero ru_aigul — основной путь этапа 6
#   ./deploy-vps.sh rhvoice   # запасной лёгкий движок (26 МБ RAM), если Silero не подойдёт
#
# Обновление кода Aven:   AVEN_REF=main ./deploy-vps.sh silero
# Откат на конкретный SHA: AVEN_REF=<commit> ./deploy-vps.sh silero
#   (скрипт подтягивает AVEN_REF из github.com/nub36/Aven и перезапускает сервис)
#
# Что делает:
#   * ставит системные зависимости и python-venv в /opt/aven-tts;
#   * ставит выбранный движок (Silero: torch CPU + модель с models.silero.ai;
#     RHVoice: сборка из исходников, пиннинг коммита — та же версия, что в CI);
#   * пишет /etc/aven-tts.env и systemd-юнит aven-tts.service (порт 8080, 127.0.0.1);
#     production-like режим server.py 0.4.0: health minimal, default_voice,
#     rate limit 12/60 c, busy-timeout 20 c;
#   * прогоняет self-check (health + синтез голосом Aigul).
#
# HTTPS: сервер слушает только 127.0.0.1 — наружу его публикует Caddy (см. README-vps.md).
# Это код для владельца: агент ничего не устанавливает на реальный VPS.
set -euo pipefail

ENGINE="${1:-silero}"
AVEN_REPO="${AVEN_REPO:-https://github.com/nub36/Aven.git}"
AVEN_REF="${AVEN_REF:-main}"    # ветка или commit: обновление/откат кода Aven
APP=/opt/aven-tts
VENV="$APP/venv"
MODEL_DIR="$APP/models"
RHVOICE_COMMIT="7725bb9cb15e09492c5d448d9b20c57ddf706644"   # пиннинг = как в .github/workflows/vps-tts-compare.yml
SILERO_URL="https://models.silero.ai/models/tts/ru/v5_cis_base.pt"
SILERO_SPEAKERS="ru_aigul"                                  # выбранный Natural Voice; можно дописать ru_vika,ru_zara
RHVOICE_VOICES="elena,dasha-rus"

[ "$(id -u)" -eq 0 ] || { echo "Запустите от root: sudo ./deploy-vps.sh $ENGINE"; exit 1; }
case "$ENGINE" in
  silero|rhvoice) ;;
  *) echo "Неизвестный движок: $ENGINE (доступны: silero, rhvoice)"; exit 1 ;;
esac

echo "==> Aven TTS на VPS: движок=$ENGINE"
echo "==> Системные зависимости"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
if [ "$ENGINE" = "rhvoice" ]; then
  # RHVoice: GCC + pkg-config + SCons + одна аудио-библиотека (libao)
  apt-get install -y -qq python3 python3-venv python3-pip git curl \
    build-essential pkg-config scons libao-dev >/dev/null
else
  apt-get install -y -qq python3 python3-venv python3-pip git curl >/dev/null
fi

echo "==> Код Aven (ветка/commit: $AVEN_REF) и venv ($APP)"
mkdir -p "$APP" "$MODEL_DIR"
if [ ! -d "$APP/src/.git" ]; then
  git clone -q --depth 1 -b "$AVEN_REF" "$AVEN_REPO" "$APP/src" || {
    # AVEN_REF может быть commit-SHA, а не ветка — тогда fetch по SHA
    git clone -q "$AVEN_REPO" "$APP/src"
    git -C "$APP/src" fetch --depth 1 origin "$AVEN_REF"
    git -C "$APP/src" checkout -q FETCH_HEAD
  }
else
  echo "   обновляю код до $AVEN_REF"
  git -C "$APP/src" fetch --depth 1 origin "$AVEN_REF"
  git -C "$APP/src" checkout -q FETCH_HEAD
  git -C "$APP/src" reset -q --hard FETCH_HEAD
fi
[ -d "$VENV" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" -q install --upgrade pip

if [ "$ENGINE" = "silero" ]; then
  echo "==> Silero v5 CIS (MIT): torch CPU + silero-stress + модель"
  "$VENV/bin/pip" -q install torch --index-url https://download.pytorch.org/whl/cpu
  "$VENV/bin/pip" -q install numpy silero-stress
  if [ ! -f "$MODEL_DIR/v5_cis_base.pt" ]; then
    curl -fsSL "$SILERO_URL" -o "$MODEL_DIR/v5_cis_base.pt"
  fi
  ls -la "$MODEL_DIR"
else
  echo "==> RHVoice: сборка из исходников (коммит $RHVOICE_COMMIT)"
  apt-get install -y -qq scons >/dev/null
  if [ ! -x /usr/local/bin/RHVoice-test ]; then
    rm -rf /tmp/RHVoice
    git init -q /tmp/RHVoice && cd /tmp/RHVoice
    git remote add origin https://github.com/RHVoice/RHVoice.git
    git fetch --depth 1 origin "$RHVOICE_COMMIT"
    git checkout -q FETCH_HEAD
    git submodule update --init --depth 1 --recursive \
      external cmake/thirdParty/sanitizers src/third-party/cldr
    git submodule update --init --depth 1 \
      data/languages/Russian data/voices/elena data/voices/dasha-rus
    scons -j"$(nproc)"   # на 1-CPU VPS это займёт несколько минут
    scons install
    ldconfig             # иначе RHVoice-test не найдёт libRHVoice_core.so (проверено в CI)
    cd - >/dev/null
  else
    echo "   RHVoice уже установлен, пропускаю сборку"
  fi
  echo "Слушаю." | RHVoice-test -p elena -o /tmp/rhvoice-check.wav
  ls -la /tmp/rhvoice-check.wav
fi

echo "==> Конфигурация /etc/aven-tts.env"
# Порт 8080 на 127.0.0.1: наружу — только через reverse-proxy (Caddy, см. README-vps.md).
# Production-like режим server.py 0.4.0 (этап 6): health minimal (не раскрывает лишнее),
# default_voice для фронта, rate limit 12 синтезов/60 c на IP, busy-timeout 20 c.
if [ "$ENGINE" = "silero" ]; then
  cat > /etc/aven-tts.env <<EOF
AVEN_TTS_PORT=8080
AVEN_TTS_BIND=127.0.0.1
SILERO_MODEL=$MODEL_DIR/v5_cis_base.pt
SILERO_SPEAKERS=$SILERO_SPEAKERS
AVEN_TTS_HEALTH=minimal
AVEN_TTS_DEFAULT_VOICE=silero_cis_mit/ru_aigul
AVEN_TTS_RATE_N=12
AVEN_TTS_RATE_WINDOW_S=60
AVEN_TTS_BUSY_TIMEOUT_S=20
EOF
else
  cat > /etc/aven-tts.env <<EOF
AVEN_TTS_PORT=8080
AVEN_TTS_BIND=127.0.0.1
RHVOICE_BIN=/usr/local/bin/RHVoice-test
RHVOICE_VOICES=$RHVOICE_VOICES
AVEN_TTS_HEALTH=minimal
AVEN_TTS_RATE_N=12
AVEN_TTS_RATE_WINDOW_S=60
AVEN_TTS_BUSY_TIMEOUT_S=20
EOF
fi
cat /etc/aven-tts.env

echo "==> systemd: aven-tts.service"
cat > /etc/systemd/system/aven-tts.service <<EOF
[Unit]
Description=Aven experimental TTS server ($ENGINE)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP/src
EnvironmentFile=/etc/aven-tts.env
ExecStart=$VENV/bin/python research/tts/server.py --host \${AVEN_TTS_BIND} --port \${AVEN_TTS_PORT} --warmup
Restart=on-failure
RestartSec=3
# VPS 2 ГБ: не даём сервису съесть всю память
MemoryMax=1500M
# минимальный hardening: серверу не нужен ни root-запись, ни сеть наружу (её открывает прокси)
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadOnlyPaths=$APP

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable aven-tts.service
systemctl restart aven-tts.service
sleep 3

echo "==> Self-check"
systemctl --no-pager -l status aven-tts.service | head -12
echo "--- health (minimal: без engines/voices/uptime) ---"
curl -fsS "http://127.0.0.1:8080/api/tts/health" && echo
echo "--- синтез голосом Aigul (тестовая фраза владельца) ---"
if [ "$ENGINE" = "silero" ]; then
  curl -fsS -X POST "http://127.0.0.1:8080/api/tts/synthesize" \
    -H 'Content-Type: application/json' \
    -d '{"text":"Авен проверяет натуральный голос. Сейчас 18 часов 43 минуты, пробег автомобиля 104520 километров.","voice":"silero_cis_mit/ru_aigul"}' \
    -o /tmp/aigul-check.wav
else
  curl -fsS -X POST "http://127.0.0.1:8080/api/tts/synthesize" \
    -H 'Content-Type: application/json' \
    -d '{"text":"Здравствуйте. Я Авен.","voice":"rhvoice/elena"}' \
    -o /tmp/aigul-check.wav
fi
ls -la /tmp/aigul-check.wav
echo
echo "Готово. Сервер слушает 127.0.0.1:8080 (Silero загружен в память один раз при старте)."
echo "Файл для прослушивания на VPS: /tmp/aigul-check.wav (aplay /tmp/aigul-check.wav)."
echo "Дальше — HTTPS через Caddy: README-vps.md, шаг 4."
