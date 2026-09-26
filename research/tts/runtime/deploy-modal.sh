#!/usr/bin/env bash
# Aven Natural Voice → Modal: ОДНО ДЕЙСТВИЕ ВЛАДЕЛЬЦА для настоящего GPU TTS-backend.
#
#   bash research/tts/runtime/deploy-modal.sh
#
# Что делает:
#   1) ставит CLI Modal (pip; при PEP 668 — в отдельный venv ~/.venvs/aven-modal);
#   2) `modal setup` — вход через GitHub (аккаунт Modal создаётся там же, Starter $0/мес,
#      $30 кредитов каждый месяц, карта НЕ нужна; см. docs/TTS_RESEARCH.md §18);
#   3) скачивает веса Qwen3-TTS (≈4,5 ГБ) в Volume — на CPU-контейнере, без оплаты GPU;
#   4) `modal deploy` — поднимает research/tts/server.py на GPU L4 и печатает HTTPS URL
#      вида https://tts--aven-tts-….modal.run.
#
# После этого: Aven → Настройки → Голос → Движок «Натуральный» → в поле «TTS-сервер
# Natural Voice» вставьте напечатанный URL → «Проверить backend» (звучит пробная фраза
# vd17-design) → «Проверка произвольной фразой» — любая фраза синтезируется по-настоящему.
#
# Отключить: `modal app stop aven-tts`. Расходов в простое нет (scale-to-zero).
# Секреты не нужны: ни в репозитории, ни во frontend ничего не добавляется.
set -euo pipefail
cd "$(dirname "$0")/../.."   # корень репозитория Aven

PY="python3"
command -v "$PY" >/dev/null 2>&1 || PY="python"

# 1) CLI Modal
if ! command -v modal >/dev/null 2>&1; then
  echo "==> Устанавливаю Modal CLI…"
  if ! "$PY" -m pip install -q modal 2>/dev/null; then
    # PEP 668 (Debian/Ubuntu): системный python не даёт ставить пакеты — отдельный venv
    echo "==> Системный python защищён (PEP 668) — ставлю в ~/.venvs/aven-modal"
    "$PY" -m venv "$HOME/.venvs/aven-modal"
    "$HOME/.venvs/aven-modal/bin/pip" install -q modal
    export PATH="$HOME/.venvs/aven-modal/bin:$PATH"
  fi
fi
echo "==> Modal CLI: $(modal --version)"

# 2) Вход (один раз): откроет браузер; вход через GitHub, аккаунт создастся там же
if [ ! -f "$HOME/.modal.toml" ]; then
  echo "==> Не найден токен Modal (~/.modal.toml) — запускаю `modal setup`."
  echo "    В открывшемся браузере: «Continue with GitHub» (аккаунт создастся сам, бесплатно)."
  modal setup
else
  echo "==> Токен Modal найден (~/.modal.toml) — пропускаю вход."
fi

# 3) Веса модели → Volume (CPU-контейнер; ≈4,5 ГБ, один раз)
echo "==> Скачиваю веса Qwen3-TTS-12Hz-1.7B-VoiceDesign в Volume (первый раз ≈4,5 ГБ)…"
modal run research/tts/runtime/modal_app.py::download_weights

# 4) Deploy: server.py на GPU + HTTPS endpoint
echo "==> Деплой (сборка образа + L4)…"
modal deploy research/tts/runtime/modal_app.py

cat <<'EOF'

======================================================================
 Готово. Скопируйте URL вида  https://tts--aven-tts-….modal.run  выше.

 В Aven:  Настройки → Голос
   • Движок речи: «Натуральный · эксперимент»
   • TTS-сервер Natural Voice: <вставьте URL>
   • «Проверить backend» — health + настоящая пробная фраза vd17-design
   • «Проверка произвольной фразой» — приёмочный тест (любой текст)

 Ориентир расходов: L4 ≈ $0,80/ч ТОЛЬКО во время синтеза/прогрева;
 в простое $0 (scale-to-zero). $30/мес кредитов ≈ 37 ч синтеза.
 Первый запрос после ~20 мин простоя ждёт cold start (десятки секунд) —
 фронтенд честно покажет «просыпается…». Остановить: modal app stop aven-tts
======================================================================
EOF
