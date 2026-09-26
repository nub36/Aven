# Aven TTS на VPS — экспериментальный runtime (этап 5)

Бесплатный лёгкий русский женский голос на **вашем** VPS (Ubuntu 24.04, 1 CPU, 2 ГБ RAM, 15 ГБ NVMe,
без GPU), без оплаты за запрос и без внешних API. Код — этот каталог; **на реальный VPS агент ничего
не ставит** (доступа нет) — ниже пошаговая инструкция для владельца.

Архитектура (см. docs/TTS_RESEARCH.md §19):

```
Aven Web (GitHub Pages, HTTPS)
   → NaturalTTSProviderExperimental (prototype/js/tts/providers.js)
   → HTTPS endpoint на вашем VPS (Caddy, ваш домен)
   → research/tts/server.py (CPU TTS: Silero CIS или RHVoice)
   → audio/wav → браузер
   ⤷ fallback: системный speechSynthesis — ВСЕГДА доступен (Character Off / System TTS)
```

Секретов во frontend и в этом репозитории нет: публичный GitHub Pages обращается к публичному
HTTPS-endpoint на вашем VPS. Ограничение длины и приватность — как в `server.py` (текст запроса
не логируется и не пишется на диск).

## Голоса (финалисты этапа 5; финальный выбор — владелец на слух, prototype/voice-compare.html)

| Движок | Голоса | Лицензия | Коммерческое | RAM (RSS) | Примечание |
|---|---|---|---|---|---|
| Silero v5 CIS base + silero-stress | ru_aigul, ru_vika, ru_zara | MIT (код и веса CIS) | да | ~0,5 ГБ c torch | нейроголос, естественнее |
| RHVoice (HTS) | elena, dasha-rus | elena GPL-3.0; dasha-rus CC BY-SA 4.0 | да (dasha — с указанием авторства) | ~50 МБ | мгновенный, звучит синтетичнее |

Цифры задержек на честном «1 CPU» (taskset -c 0, CI) — `research/tts/results/vps_compare`
(заполняется прогоном `VPS TTS Compare`, см. §19). Выбранный движок ставится одной командой ниже.

## Шаг 1. Подключитесь к VPS по SSH

На Windows: PowerShell → `ssh root@IP_ВАШЕГО_VPS` (или пользователь с sudo, тогда команды ниже
через `sudo bash …`).

## Шаг 2. Скачайте репозиторий и запустите установку

```bash
git clone --depth 1 https://github.com/nub36/Aven.git
cd Aven/research/tts/runtime/vps
sudo ./deploy-vps.sh silero     # или: sudo ./deploy-vps.sh rhvoice
```

Скрипт сам ставит зависимости, движок, systemd-сервис `aven-tts` (порт **127.0.0.1:8080**,
`MemoryMax=1500M`) и в конце показывает health-check. Повторный запуск безопасен (idempotent
для уже установленного).

- **Silero**: ~700 МБ диска (torch CPU + модель ~60 МБ с models.silero.ai), первый синтез —
  после загрузки модели в память.
- **RHVoice**: сборка из исходников ~5–10 минут на 1 CPU; пиннинг коммита `7725bb9…` — тот же,
  что в CI-прогоне сравнения.

Смена голосов Silero: отредактируйте `SILERO_SPEAKERS` в `/etc/aven-tts.env` (полный список —
`research/tts/results/silero_cis_mit.json`, все ru_-голоса с F0>190 Гц женские) и
`systemctl restart aven-tts`.

## Шаг 3. Проверка на самом VPS

```bash
systemctl status aven-tts --no-pager
curl http://127.0.0.1:8080/api/tts/health
curl -X POST http://127.0.0.1:8080/api/tts/synthesize \
  -H 'Content-Type: application/json' \
  -d '{"text":"Здравствуйте. Я Авен.","voice":"silero/ru_aigul"}' -o /tmp/a.wav
play /tmp/a.wav   # или: aplay /tmp/a.wav (sox/alsa-utils)
```

## Шаг 4. HTTPS через Caddy (endpoint для Aven Web)

Браузер на GitHub Pages не может ходить на `http://` — нужен HTTPS. Caddy берёт и продлевает
сертификат Let's Encrypt автоматически; нужен домен, указывающий на IP VPS (A-запись).

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
tts.ваш-домен.ru {
    reverse_proxy 127.0.0.1:8080
}
EOF
sudo systemctl reload caddy
```

Проверка: `curl https://tts.ваш-домен.ru/api/tts/health` → `{"ok":true,...}`.

## Шаг 5. Подключение в Aven Web

Прототип → Настройки → TTS: выберите Natural (Experimental) и укажите endpoint
`https://tts.ваш-домен.ru`. Провайдер сам проверит `/api/tts/health`, покажет голоса и
отдаст синтез через `POST /api/tts/synthesize`. Системный speechSynthesis остаётся
fallback-опцией всегда; Character Off не зависит от голоса.

## Честные ограничения

- Это исследовательский runtime: 1 одновременный пользователь, без очереди/кэша на диск.
  Silero на 1 CPU синтезирует короткую фразу быстрее реального времени, но паузу в ~0,3–1 с
  заметно; RHVoice практически мгновенный (точные цифры — в `vps_compare`).
- `server.py` отдаёт PCM WAV (без перекодирования в MP3) — на LAN/мобильном интернете этого
  достаточно; если захотите MP3/Opus — это отдельный шаг (ffmpeg на VPS).
- Домен + VPS уже оплачены владельцем отдельно; сами движки бесплатны и офлайновы после установки.
- Липсинк: timings (виземы) из этого API не приходят — это зафиксировано как следующий этап
  (G2P ru из текста или анализ амплитуды в браузере, docs/TTS_RESEARCH.md §14, §19;
  рабочий «уровень 0» уже есть в prototype/aven-3d.html).

## Откат / удаление

```bash
sudo systemctl disable --now aven-tts
sudo rm /etc/systemd/system/aven-tts.service /etc/aven-tts.env
sudo rm -rf /opt/aven-tts            # Silero-модель и venv
# RHVoice: sudo scons -c install (из /tmp/RHVoice) или удалить /usr/local/{bin,lib,...}/RHVoice*
```
