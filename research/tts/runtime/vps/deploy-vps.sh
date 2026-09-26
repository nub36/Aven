#!/usr/bin/env bash
# Aven — экспериментальный лёгкий TTS-сервер для VPS владельца (этап 5).
# Ubuntu 24.04, 1 CPU, 2 ГБ RAM, без GPU. НИЧЕГО не платного, ключей нет.
#
# Использование (на VPS, от root или через sudo):
#   ./deploy-vps.sh silero    # Silero v5 CIS (MIT): ru_aigul, ru_vika, ru_zara
#   ./deploy-vps.sh rhvoice   # RHVoice (GPL/LGPL): elena (GPL-3.0), dasha-rus (CC BY-SA 4.0)
#
# Что делает:
#   * ставит системные зависимости и python-venv в /opt/aven-tts;
#   * ставит выбранный движок (Silero: torch CPU + модель с models.silero.ai;
#     RHVoice: сборка из исходников, пиннинг коммита — та же версия, что в CI);
#   * пишет /etc/aven-tts.env и systemd-юнит aven-tts.service (порт 8080, 127.0.0.1);
#   * прогоняет self-check (health endpoint).
#
# HTTPS: сервер слушает только 127.0.0.1 — наружу его публикует Caddy (см. README-vps.md).
# Это код для владельца: агент ничего не устанавливает на реальный VPS.
set -euo pipefail

ENGINE="${1:-silero}"
AVEN_REPO="${AVEN_REPO:-https://github.com/nub36/Aven.git}"
APP=/opt/aven-tts
VENV="$APP/venv"
MODEL_DIR="$APP/models"
RHVOICE_COMMIT="7725bb9cb15e09492c5d448d9b20c57ddf706644"   # пиннинг = как в .github/workflows/vps-tts-compare.yml
SILERO_URL="https://models.silero.ai/models/tts/ru/v5_cis_base.pt"
SILERO_SPEAKERS="ru_aigul,ru_vika,ru_zara"                  # финалисты этапа 5; список можно менять
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

echo "==> Код Aven и venv ($APP)"
mkdir -p "$APP" "$MODEL_DIR"
if [ ! -d "$APP/src/.git" ]; then
  git clone -q --depth 1 "$AVEN_REPO" "$APP/src"
else
  echo "   уже склонирован, пропускаю clone"
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
if [ "$ENGINE" = "silero" ]; then
  cat > /etc/aven-tts.env <<EOF
AVEN_TTS_PORT=8080
AVEN_TTS_BIND=127.0.0.1
SILERO_MODEL=$MODEL_DIR/v5_cis_base.pt
SILERO_SPEAKERS=$SILERO_SPEAKERS
EOF
else
  cat > /etc/aven-tts.env <<EOF
AVEN_TTS_PORT=8080
AVEN_TTS_BIND=127.0.0.1
RHVOICE_BIN=/usr/local/bin/RHVoice-test
RHVOICE_VOICES=$RHVOICE_VOICES
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
curl -fsS "http://127.0.0.1:8080/api/tts/health" && echo
echo
echo "Готово. Сервер слушает 127.0.0.1:8080. Дальше — HTTPS через Caddy: README-vps.md, шаг 4."
