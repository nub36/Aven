"""Aven Natural Voice на Modal — serverless GPU HTTPS-endpoint для GitHub Pages (этап 4, §18).

Поднимает research/tts/server.py БЕЗ ИЗМЕНЕНИЙ (тот же API-контракт: GET /api/tts/health,
GET /api/tts/voices, POST /api/tts/synthesize → audio/wav) с настоящим движком
Qwen3-TTS-12Hz-1.7B-VoiceDesign — голос `qwen3/vd17-design`, промпт DESIGN_PROMPT
(общий с образцами исследования, поэтому тембр тот же, что владелец слушал в voice-lab).

Почему Modal (см. docs/TTS_RESEARCH.md §18):
  * Starter-план $0/мес: $30 бесплатных кредитов КАЖДЫЙ месяц, карта НЕ нужна, вход через GitHub;
  * оплата поминутно-посекундно, в простое — $0 (scale-to-zero) — нет «горящего» счётчика;
  * HTTPS-endpoint даётся автоматически (https://…modal.run) — GitHub Pages (https://nub36.github.io)
    зовёт его напрямую; CORS для этого origin уже разрешён в server.py;
  * секреты не нужны ни в репозитории, ни во frontend.

Что здесь честно НЕ решается: холодный старт. После ~20 мин простоя контейнер выключается,
первый запрос ждёт загрузки модели (десятки секунд). Фронтенд это понимает: двухстадийная
проверка health (быстрый probe → терпеливый повтор с «просыпается…»), см. providers.js §18.

Запуск полностью — одной командой: research/tts/runtime/deploy-modal.sh
По шагам:
    pip install modal && modal setup                              # вход через GitHub
    modal run  research/tts/runtime/modal_app.py::download_weights # ≈4,5 ГБ весов → Volume (CPU)
    modal deploy research/tts/runtime/modal_app.py                 # → печатает HTTPS URL

GPU: L4 (24 ГБ, bf16) по умолчанию; переопределяется AVEN_MODAL_GPU (A10G/L40S/A100…).
T4 НЕ подходит: архитектура Turing без bfloat16, а server.py на CUDA грузит модель в bf16.
Ориентир стоимости (сен. 2026): L4 ≈ $0,80/ч → $30 кредитов ≈ 37 ч активного синтеза в месяц.

Безопасность: endpoint публичный (без аутентификации). Любой, кто знает URL, может
синтезировать в пределах ваших кредитов. Для личного демо приемлемо; URL не публикуйте.
Более строгие варианты (proxy-auth Modal, свой домен+WAF) — вне рамок этого этапа.
"""
from __future__ import annotations

import os
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent          # research/tts/runtime
TTS_DIR = HERE.parent                            # research/tts
REPO = TTS_DIR.parent.parent                     # корень Aven

app = modal.App("aven-tts")
hf_cache = modal.Volume.from_name("aven-tts-hf", create_if_missing=True)

# Каталоги раскладываем так же, как в репозитории (research/tts + prototype):
# server.py вычисляет STATIC = HERE.parent.parent / "prototype" — на контейнере это
# /root/prototype, т.е. сервер заодно сам раздаёт прототип Aven на том же endpoint.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch", "torchaudio", "qwen-tts==0.1.1", "numpy", "soundfile", "huggingface_hub")
    .add_local_dir(TTS_DIR, "/root/research/tts", copy=True,
                   ignore=["**/out/**", "**/models/**", "**/__pycache__/**"])
    .add_local_dir(REPO / "prototype", "/root/prototype", copy=True)
)

GPU = os.environ.get("AVEN_MODAL_GPU", "L4")
PORT = 8000


@app.function(
    image=image,
    gpu=GPU,
    timeout=600,               # синтез фразы на GPU — секунды; запас на загрузку модели и длинные фразы
    scaledown_window=1200,     # максимум Modal: контейнер тёплый 20 мин после последнего запроса
    max_containers=1,          # один GPU: параллельные контейнеры не плодим (очередь — внутри сервера)
    volumes={"/root/.cache/huggingface": hf_cache},   # веса качаются один раз, живут в Volume
)
@modal.concurrent(max_inputs=4)
@modal.web_server(PORT, startup_timeout=15 * 60, label="tts")
def serve():
    """Запускает research/tts/server.py внутри контейнера на 0.0.0.0:8000.

    Порядок сознательный: сначала загрузить модель и прогреть синтез, только потом
    начать слушать порт — Modal держит запросы, пока порт не готов (startup_timeout),
    поэтому первый реальный пользователь не получает «движок ещё не загружен».
    """
    import sys

    sys.path.insert(0, "/root/research/tts")
    os.environ["AVEN_TTS_QWEN3"] = "1"   # движок Qwen3 VoiceDesign → голос qwen3/vd17-design
    from http.server import ThreadingHTTPServer

    import server as srv                  # research/tts/server.py — без изменений

    srv.ENGINES.update(srv.load_engines())
    srv.warmup()
    print(f"[tts] aven-tts-research {srv.VERSION} · qwen3/vd17-design · gpu={GPU} · слушаю 0.0.0.0:{PORT}",
          flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), srv.Handler).serve_forever()


@app.function(
    image=image,
    volumes={"/root/.cache/huggingface": hf_cache},
    timeout=30 * 60,
)
def download_weights():
    """Заранее скачивает веса Qwen3 в Volume (CPU-контейнер — GPU за загрузку не платится)."""
    from huggingface_hub import snapshot_download

    p = snapshot_download("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
    print(f"[tts] веса Qwen3-TTS-12Hz-1.7B-VoiceDesign в Volume: {p}", flush=True)
