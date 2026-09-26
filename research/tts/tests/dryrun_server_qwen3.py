"""Локальная проверка research/tts/server.py с движком Qwen3 VoiceDesign БЕЗ модели и без GPU
(исследовательский тест, не production).

torch и qwen_tts подменяются заглушками (паттерн — как в dryrun_name.py), numpy — настоящий.
Цель: проверить РЕАЛЬНЫЙ HTTP-контракт сервера end-to-end (настоящий ThreadingHTTPServer +
urllib): health/voices/synthesize/ошибки/CORS, до того как владелец запустит настоящий GPU
по research/tts/runtime/README.md. Сам синтез Qwen3 здесь НЕ проверяется (нет GPU/HF).

  python research/tts/tests/dryrun_server_qwen3.py
"""
import json
import os
import sys
import threading
import types
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
sys.path.insert(0, str(RESEARCH))

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


# ---- заглушка torch (cuda намеренно НЕДОСТУПНА: ветка CPU + предупреждение) ----
torch = types.ModuleType("torch")
torch.float32 = "float32"
torch.bfloat16 = "bfloat16"
torch.cuda = types.SimpleNamespace(is_available=lambda: False)
sys.modules["torch"] = torch

# ---- заглушка qwen_tts: фиксируем вызовы, генерируем синусоиду ----
CALLS = {"design": 0, "loads": []}


class FakeModel:
    def __init__(self, name, device_map, dtype):
        self.name = name
        self.device_map = device_map
        self.dtype = dtype
        CALLS["loads"].append((name, device_map, dtype))

    @staticmethod
    def from_pretrained(name, device_map=None, dtype=None, **kw):
        assert name == "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", name
        return FakeModel(name, device_map, dtype)

    def generate_voice_design(self, text=None, instruct=None, language=None):
        CALLS["design"] += 1
        assert text and instruct, "generate_voice_design без текста/промпта"
        assert "Russian" == language, language
        sr = 24000
        dur = max(0.2, min(5.0, len(text) * 0.05))
        t = np.linspace(0, dur, int(sr * dur), endpoint=False)
        return [(0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)], sr


qwen_tts = types.ModuleType("qwen_tts")
qwen_tts.Qwen3TTSModel = FakeModel
sys.modules["qwen_tts"] = qwen_tts

os.environ["AVEN_TTS_QWEN3"] = "1"

import server as srv  # noqa: E402


def req(method, url, body=None, headers=None, expect_json=False):
    r = urllib.request.Request(url, method=method)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    data = json.dumps(body).encode() if body is not None else None
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, data=data, timeout=5) as resp:
            raw = resp.read()
            return resp.status, dict(resp.headers), (json.loads(raw) if expect_json else raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            parsed = json.loads(raw)
        except Exception:  # noqa: BLE001
            parsed = raw
        return e.code, dict(e.headers), parsed


def main():
    engines = srv.load_engines()
    ok("T1 движок qwen3 поднялся (env AVEN_TTS_QWEN3=1)", "qwen3" in engines)
    eng = engines.get("qwen3")
    vs = eng.voices()
    ok("T2 голос qwen3/vd17-design зарегистрирован с лицензией Apache-2.0",
       any(v["id"] == "qwen3/vd17-design" and v["license"] == "Apache-2.0" for v in vs), vs)
    ok("T3 модель загружена с device_map=cpu (cuda недоступна) и float32",
       CALLS["loads"] and CALLS["loads"][0][1] == "cpu" and CALLS["loads"][0][2] == "float32", CALLS["loads"])

    srv.ENGINES.update(engines)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"

    st, hd, j = req("GET", base + "/api/tts/health", expect_json=True)
    ok("T4 GET /api/tts/health → 200 status ok", st == 200 and j.get("ok") and j.get("status") == "ok", st)
    ok("T5 health: server/version/engine/device/voices присутствуют",
       j.get("server") == "aven-tts-research" and bool(j.get("version"))
       and j.get("engines", {}).get("qwen3", {}).get("model") == srv.Qwen3VoiceDesign.MODEL
       and j.get("engines", {}).get("qwen3", {}).get("device") == "cpu"
       and any(v["id"] == "qwen3/vd17-design" for v in j.get("voices", [])), j.get("engines"))

    st, hd, j = req("GET", base + "/api/tts/voices", expect_json=True)
    ok("T6 GET /api/tts/voices → vd17-design в списке",
       st == 200 and any(v["id"] == "qwen3/vd17-design" for v in j.get("voices", [])), st)

    st, hd, raw = req("POST", base + "/api/tts/synthesize", {"text": "Готово.", "voice": "qwen3/vd17-design", "rate": 1})
    ok("T7 POST synthesize → 200 audio/wav", st == 200 and hd.get("Content-Type") == "audio/wav", (st, hd.get("Content-Type")))
    ok("T8 тело — настоящий RIFF/WAV ненулевой длины", isinstance(raw, (bytes, bytearray)) and raw[:4] == b"RIFF" and len(raw) > 100, len(raw) if isinstance(raw, (bytes, bytearray)) else raw)
    ok("T9 заголовок X-Synth-Seconds присутствует", "X-Synth-Seconds" in hd)

    st, hd, j = req("POST", base + "/api/tts/synthesize", {"text": "Скорость?", "voice": "qwen3/vd17-design", "rate": 1.5})
    ok("T10 rate≠1 для VoiceDesign → честный X-Rate-Applied: ignored", hd.get("X-Rate-Applied") == "ignored", dict(hd))

    st, hd, j = req("POST", base + "/api/tts/synthesize", {"text": "Готово.", "voice": "qwen3/no-such", "rate": 1})
    ok("T11 неизвестный голос → 400", st == 400, st)
    st, hd, j = req("POST", base + "/api/tts/no-such-endpoint", {"text": "x"})
    ok("T12 неизвестный путь POST → 404", st == 404, st)

    # CORS: только разрешённые origin, без "*"
    st, hd, j = req("GET", base + "/api/tts/health", headers={"Origin": "https://nub36.github.io"})
    ok("T13 CORS: https://nub36.github.io разрешён (origin отражён, не *)",
       hd.get("Access-Control-Allow-Origin") == "https://nub36.github.io", hd.get("Access-Control-Allow-Origin"))
    st, hd, j = req("GET", base + "/api/tts/health", headers={"Origin": "http://localhost:5173"})
    ok("T14 CORS: localhost (dev) разрешён", hd.get("Access-Control-Allow-Origin") == "http://localhost:5173", hd.get("Access-Control-Allow-Origin"))
    st, hd, j = req("GET", base + "/api/tts/health", headers={"Origin": "https://evil.example"})
    ok("T15 CORS: чужой origin НЕ разрешён (заголовка нет)", "Access-Control-Allow-Origin" not in hd, hd.get("Access-Control-Allow-Origin"))
    st, hd, j = req("GET", base + "/api/tts/health")
    ok("T16 без Origin — без CORS-заголовков (same-origin/curl)", "Access-Control-Allow-Origin" not in hd)
    st, hd, j = req("OPTIONS", base + "/api/tts/synthesize", headers={
        "Origin": "https://nub36.github.io",
        "Access-Control-Request-Private-Network": "true",
    })
    ok("T17 OPTIONS: preflight 204 + Private Network Access",
       st == 204 and hd.get("Access-Control-Allow-Private-Network") == "true", (st, hd.get("Access-Control-Allow-Private-Network")))

    ok("T18 синтез вызван ровно за двумя POST (T7 + T10)", CALLS["design"] == 2, CALLS["design"])

    srv.warmup()
    ok("T19 --warmup: прогрев проходит по движкам без ошибок", CALLS["design"] == 3, CALLS["design"])

    httpd.shutdown()
    print(f"\nИТОГО: {PASS} PASS, {FAIL} FAIL")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
