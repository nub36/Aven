"""Локальная проверка modal_app.py БЕЗ Modal-аккаунта, без модели и без GPU.

modal_app.py раскладывает файлы в контейнере так:
    /root/research/tts/**    (server.py, common.py, …)
    /root/prototype/**       (статика прототипа)
server.py вычисляет STATIC = HERE.parent.parent / "prototype" — тест воспроизводит эту
раскладку во временном каталоге, подменяет torch/qwen_tts заглушками (как
dryrun_server_qwen3.py) и поднимает НАСТОЯЩИЙ ThreadingHTTPServer из serve()-схемы
modal_app (load_engines → warmup → serve). Проверяется, что:

  M1  раскладка совпадает с ожиданием server.py (STATIC указывает на prototype/);
  M2  движок qwen3 поднимается с AVEN_TTS_QWEN3=1, голос qwen3/vd17-design;
  M3  GET /api/tts/health → ok, device из заглушки, vd17-design в голосах;
  M4  POST /api/tts/synthesize → audio/wav (RIFF);
  M5  GET / отдаёт prototype/index.html (бонус: endpoint сам раздаёт прототип Aven);
  M6  CORS для https://nub36.github.io (GitHub Pages) разрешён;
  M7  файл modal_app.py импортируется и декларирует L4/bf16-совместимый GPU по умолчанию.

Сам синтез Qwen3 и деплой на Modal здесь НЕ проверяются (нет GPU/аккаунта) — только
контракт и раскладка, чтобы `deploy-modal.sh` у владельца не упал на тривиальном.

  python research/tts/tests/dryrun_modal_layout.py
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import types
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent          # research/tts
RUNTIME = RESEARCH / "runtime"
REPO = RESEARCH.parent.parent   # корень Aven

PASS = 0
FAIL = 0


def ok(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS  " + name)
    else:
        FAIL += 1
        print("FAIL  " + name + (" — " + str(extra) if extra else ""))


# ---- раскладка «как в Modal-образе» (modal_app.py: /root/research/tts + /root/prototype) ----
# add_local_dir(TTS_DIR) копирует ВЕСЬ research/tts (server.py + common.py + phrases*.json —
# common.py читает их при импорте). Копируем так же, исключая артефакты (out/, models/).
root = Path(tempfile.mkdtemp(prefix="aven-modal-layout-"))
(root / "research" / "tts").mkdir(parents=True)
for p in RESEARCH.iterdir():
    if p.is_file():
        shutil.copy(p, root / "research" / "tts" / p.name)
shutil.copytree(REPO / "prototype", root / "prototype")

ok("M1 раскладка образа: server.py видит prototype на HERE.parent.parent/prototype",
   (root / "research" / "tts" / "server.py").exists() and (root / "prototype" / "index.html").exists())

# ---- заглушки torch/qwen_tts (модель не грузится; cuda «есть» — как на L4) ----
torch = types.ModuleType("torch")
torch.float32 = "float32"
torch.bfloat16 = "bfloat16"
torch.cuda = types.SimpleNamespace(is_available=lambda: True)   # GPU-контейнер Modal
sys.modules["torch"] = torch

CALLS = {"design": 0}


class FakeModel:
    @staticmethod
    def from_pretrained(name, device_map=None, dtype=None, **kw):
        assert name == "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", name
        assert device_map == "cuda", device_map
        assert dtype == "bfloat16", dtype        # на L4 server.py выбирает bf16
        return FakeModel()

    def generate_voice_design(self, text=None, instruct=None, language=None):
        CALLS["design"] += 1
        assert text and instruct and language == "Russian", (text, instruct, language)
        sr = 24000
        t = np.linspace(0, 0.3, int(sr * 0.3), endpoint=False)
        return [(0.4 * np.sin(2 * np.pi * 200 * t)).astype(np.float32)], sr


qwen_tts = types.ModuleType("qwen_tts")
qwen_tts.Qwen3TTSModel = FakeModel
sys.modules["qwen_tts"] = qwen_tts

# ---- импорт server.py ИЗ раскладки образа (не из репозитория!) ----
os.environ["AVEN_TTS_QWEN3"] = "1"
sys.path.insert(0, str(root / "research" / "tts"))
import server as srv  # noqa: E402

ok("M1a STATIC в раскладке образа указывает на скопированный prototype",
   srv.STATIC == root / "prototype", srv.STATIC)

# ---- serve()-схема из modal_app.serve(): engines → warmup → listen ----
engines = srv.load_engines()
ok("M2 движок qwen3 поднялся в раскладке образа", "qwen3" in engines, list(engines))
srv.ENGINES.update(engines)
srv.warmup()
ok("M2a warmup: один прогревочный синтез выполнен", CALLS["design"] == 1, CALLS)

httpd = ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{httpd.server_address[1]}"


def req(method, url, body=None, headers=None):
    r = urllib.request.Request(url, method=method)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    data = json.dumps(body).encode() if body is not None else None
    if data:
        r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, data=data, timeout=10) as resp:
        return resp.status, dict(resp.headers), resp.read()


st, hd, raw = req("GET", base + "/api/tts/health")
j = json.loads(raw)
ok("M3 health: ok, server=aven-tts-research, qwen3 на cuda, vd17-design в голосах",
   st == 200 and j["ok"] and j["engines"]["qwen3"]["device"] == "cuda"
   and any(v["id"] == "qwen3/vd17-design" for v in j["voices"]), j.get("engines"))

st, hd, raw = req("POST", base + "/api/tts/synthesize",
                  {"text": "Алексей, сегодня двадцать шестое сентября.", "voice": "qwen3/vd17-design", "rate": 1})
ok("M4 synthesize: 200 audio/wav, настоящий RIFF, синтез вызван",
   st == 200 and hd.get("Content-Type") == "audio/wav" and raw[:4] == b"RIFF" and CALLS["design"] == 2,
   (st, CALLS))

st, hd, raw = req("GET", base + "/")
ok("M5 GET / отдаёт prototype/index.html (endpoint сам раздаёт прототип)",
   st == 200 and b"<html" in raw[:200].lower() and b"Aven" in raw[:2000], raw[:80])

st, hd, raw = req("GET", base + "/api/tts/health", headers={"Origin": "https://nub36.github.io"})
ok("M6 CORS: https://nub36.github.io (GitHub Pages) разрешён",
   hd.get("Access-Control-Allow-Origin") == "https://nub36.github.io", hd.get("Access-Control-Allow-Origin"))

# ---- M7: сам modal_app.py импортируется и его параметры осмысленны ----
sys.path.insert(0, str(RUNTIME))
import modal  # noqa: E402
import modal_app  # noqa: E402

ok("M7 modal_app: app=aven-tts, GPU по умолчанию L4 (bf16-совместимая), порт 8000",
   modal_app.app.name == "aven-tts" and modal_app.GPU == "L4" and modal_app.PORT == 8000,
   (modal_app.app.name, modal_app.GPU, modal_app.PORT))
# в объявленном приложении (App.functions) есть serve и download_weights;
# после импорта атрибуты становятся объектами modal.functions.Function
ok("M7a объявлены serve (web endpoint) и download_weights (прогрев Volume)",
   isinstance(getattr(modal_app, "serve", None), modal.functions.Function)
   and isinstance(getattr(modal_app, "download_weights", None), modal.functions.Function),
   (type(getattr(modal_app, "serve", None)).__name__, type(getattr(modal_app, "download_weights", None)).__name__))

httpd.shutdown()
shutil.rmtree(root, ignore_errors=True)
print(f"\nИТОГО: {PASS} PASS, {FAIL} FAIL")
sys.exit(1 if FAIL else 0)
