"""Aven — исследовательский self-hosted TTS-сервер для прототипа. НЕ production.

Отдаёт статический прототип (prototype/) и минимальный API, которым пользуется
NaturalTTSProviderExperimental (prototype/js/tts/providers.js):

  GET  /api/tts/health      → {ok, status, server, version, engines, voices, uptime_s, max_chars}
  GET  /api/tts/voices      → {"voices": [{id, label, engine, license, commercial}]}
  POST /api/tts/synthesize  {"text": "...", "voice": "qwen3/vd17-design", "rate": 1.0} → audio/wav

Формат ответа — PCM WAV: фронт играет его <audio>-элементом без перекодирования;
MP3/Opus требовали бы кодека на сервере и ничего не дали бы на LAN-скоростях.

Приватность: текст запросов НЕ пишется в лог и на диск (логируются только длина и время).
Лицензии: по умолчанию включаются только голоса с ясной лицензией, допускающей коммерцию.
Голоса с неясной/NC-лицензией — только с AVEN_TTS_ALLOW_UNCLEAR=1 (для прослушивания).

CORS: контролируемый, НЕ "*". Разрешены https://nub36.github.io и localhost/127.0.0.1
(любой порт, development). Дополнительные origin — переменной AVEN_TTS_ORIGINS
(через запятую, например туннель для public demo). Запросы без Origin (same-origin,
curl) заголовков CORS не получают и не нуждаются в них. Поддержан preflight
Private Network Access (Access-Control-Allow-Private-Network) — нужен Chrome, когда
публичная страница обращается к адресу в частной сети.

Движки подключаются, если доступны:
  Qwen3 VoiceDesign — AVEN_TTS_QWEN3=1; pip install qwen-tts torch; НУЖЕН GPU ≥8 ГБ VRAM
      (на CPU измерено 18–70 с на фразу — непригодно, docs/TTS_RESEARCH.md §12).
      Голос qwen3/vd17-design (фаворит владельца), промпт — common.DESIGN_PROMPT.
      Веса (≈4,5 ГБ) качаются с Hugging Face при первом запуске, в git не попадают.
      Опционально AVEN_TTS_QWEN3_FA2=1 — FlashAttention 2 (pip install flash-attn).
  RHVoice    — RHVOICE_BIN=/путь/RHVoice-test  (голоса RHVOICE_VOICES, по умолчанию elena,dasha-rus)
  Silero CIS — pip install torch silero-stress; SILERO_MODEL=/путь/v5_cis_base.pt; SILERO_SPEAKERS=ru_…,ru_…
  Supertonic — pip install supertonic (голоса F1–F5; веса скачиваются с Hugging Face при первом запуске)
  Piper      — PIPER_MODELS=/каталог/*.onnx (лицензия данных irina не ясна → только с ALLOW_UNCLEAR)

Запуск:  python research/tts/server.py --host 0.0.0.0 --port 8080
         python research/tts/server.py --warmup   # + один короткий синтез на движок после загрузки
Полная инструкция по GPU-запуску Qwen3 — research/tts/runtime/README.md.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
STATIC = HERE.parent.parent / "prototype"
ALLOW_UNCLEAR = os.environ.get("AVEN_TTS_ALLOW_UNCLEAR") == "1"
MAX_CHARS = 600
VERSION = "0.3.0"
STARTED = time.time()


def wav_bytes(audio: np.ndarray, sr: int) -> bytes:
    x = np.asarray(audio, dtype=np.float32).reshape(-1)
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    if peak > 1.0:
        x = x / peak
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


class Engine:
    name = ""
    supports_rate = True  # False → клиенту честно отдаётся X-Rate-Applied: ignored
    lock: threading.Lock

    def __init__(self):
        self.lock = threading.Lock()

    def voices(self) -> list[dict]:
        return []

    def synth(self, text: str, voice: str, rate: float) -> bytes:
        raise NotImplementedError

    def info(self) -> dict:
        """Факты о движке для /api/tts/health (модель, устройство, время загрузки)."""
        return {}


class Qwen3VoiceDesign(Engine):
    """Qwen3-TTS-12Hz-1.7B-VoiceDesign — голос `qwen3/vd17-design` (фаворит владельца,
    docs/TTS_RESEARCH.md §11). Включается только через AVEN_TTS_QWEN3=1.

    Требования: GPU ≥8 ГБ VRAM (комфортно 12 ГБ) и pip install qwen-tts torch
    (см. research/tts/runtime/requirements.txt). На CPU диалог невозможен —
    наши CPU-измерения: медиана 18,5 с на фразу, RTF 6,43 (TTS_RESEARCH §12.1).
    Промпт описания голоса — common.DESIGN_PROMPT, тот же, что в генераторах образцов:
    иначе это будет другой тембр. Менять нельзя.
    Модель держится загруженной постоянно (kept-alive), как рекомендует §12.4.
    """

    name = "qwen3"
    MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
    supports_rate = False  # у generate_voice_design нет параметра скорости — скорость не применяется

    def __init__(self):
        super().__init__()
        import torch
        from qwen_tts import Qwen3TTSModel
        from common import DESIGN_PROMPT

        self.instruct = DESIGN_PROMPT
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        if self.device == "cpu":
            print("[tts] ВНИМАНИЕ: Qwen3 запущен НА CPU — 18–70 с на фразу, для диалога непригоден "
                  "(docs/TTS_RESEARCH.md §12.1). Для Natural Voice нужен GPU ≥ 8 ГБ VRAM.", flush=True)
        self.dtype = "bfloat16" if self.device == "cuda" else "float32"
        kw = {}
        if os.environ.get("AVEN_TTS_QWEN3_FA2") == "1":
            kw["attn_implementation"] = "flash_attention_2"  # требует pip install flash-attn
        t = time.perf_counter()
        self.model = Qwen3TTSModel.from_pretrained(self.MODEL, device_map=self.device,
                                                   dtype=getattr(torch, self.dtype), **kw)
        self.load_s = round(time.perf_counter() - t, 2)

    def voices(self):
        return [{"id": "qwen3/vd17-design", "label": "Qwen3 · vd17-design (Natural Female Aven)",
                 "engine": self.name, "license": "Apache-2.0", "commercial": "yes"}]

    def synth(self, text, voice, rate):
        wavs, sr = self.model.generate_voice_design(text=text, instruct=self.instruct, language="Russian")
        return wav_bytes(np.asarray(wavs[0]).reshape(-1), sr)

    def info(self):
        return {"model": self.MODEL, "device": self.device, "dtype": self.dtype, "load_s": self.load_s}


class RHVoice(Engine):
    name = "rhvoice"
    LIC = {"elena": ("GPL-3.0", "yes"), "dasha-rus": ("CC BY-SA 4.0", "yes"),
           "anna": ("не указана", "unclear"), "irina": ("не указана", "unclear")}

    def __init__(self, exe: str):
        super().__init__()
        self.exe = exe
        self.names = [v for v in os.environ.get("RHVOICE_VOICES", "elena,dasha-rus").split(",") if v]

    def voices(self):
        out = []
        for v in self.names:
            lic, com = self.LIC.get(v, ("?", "unclear"))
            if com != "yes" and not ALLOW_UNCLEAR:
                continue
            out.append({"id": f"rhvoice/{v}", "label": f"RHVoice · {v}", "engine": "rhvoice", "license": lic, "commercial": com})
        return out

    def synth(self, text, voice, rate):
        with tempfile.TemporaryDirectory() as d:
            o = Path(d) / "o.wav"
            r = max(30, min(300, int(100 * rate)))  # RHVoice-test: проценты, 100 — норма
            subprocess.run([self.exe, "-p", voice, "-r", str(r), "-o", str(o)], input=text.encode("utf-8"),
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
            return o.read_bytes()


class SileroCIS(Engine):
    name = "silero_cis_mit"
    supports_rate = False  # apply_tts вызывается без параметра скорости

    def __init__(self, model_path: str):
        super().__init__()
        import torch
        from silero_stress import load_accentor

        torch.set_num_threads(int(os.environ.get("TTS_THREADS", "4")))
        self.model = torch.package.PackageImporter(model_path).load_pickle("tts_models", "model")
        self.accentor = load_accentor()
        env = os.environ.get("SILERO_SPEAKERS", "")
        self.speakers = [s for s in env.split(",") if s] or sorted(s for s in self.model.speakers if s.startswith("ru_"))

    def voices(self):
        return [{"id": f"silero_cis_mit/{s}", "label": f"Silero CIS · {s}", "engine": self.name, "license": "MIT", "commercial": "yes"} for s in self.speakers]

    def synth(self, text, voice, rate):
        audio = self.model.apply_tts(text=self.accentor(text), speaker=voice, sample_rate=24000)
        return wav_bytes(audio.numpy(), 24000)


class Supertonic(Engine):
    name = "supertonic"

    def __init__(self):
        super().__init__()
        from supertonic import TTS

        self.tts = TTS(auto_download=True)
        self.styles = {n: self.tts.get_voice_style(n) for n in ["F1", "F2", "F3", "F4", "F5"]}

    def voices(self):
        return [{"id": f"supertonic/{n}", "label": f"Supertonic 3 · {n}", "engine": self.name, "license": "OpenRAIL-M", "commercial": "yes"} for n in self.styles]

    def synth(self, text, voice, rate):
        wav, _ = self.tts.synthesize(text, voice_style=self.styles[voice], lang="ru", total_steps=8, speed=float(rate))
        return wav_bytes(np.asarray(wav), self.tts.sample_rate)


class Piper(Engine):
    name = "piper"

    def __init__(self, models_dir: str):
        super().__init__()
        from piper import PiperVoice

        self.models = {p.stem.replace("ru_RU-", ""): PiperVoice.load(str(p)) for p in Path(models_dir).glob("*.onnx")}

    def voices(self):
        if not ALLOW_UNCLEAR:
            return []
        return [{"id": f"piper/{k}", "label": f"Piper · {k}", "engine": self.name, "license": "Unknown (данные)", "commercial": "unclear"} for k in self.models]

    def synth(self, text, voice, rate):
        from piper import SynthesisConfig

        v = self.models[voice]
        chunks = [c.audio_float_array for c in v.synthesize(text, syn_config=SynthesisConfig(length_scale=1.0 / max(0.5, rate)))]
        return wav_bytes(np.concatenate(chunks), v.config.sample_rate)


def load_engines() -> dict[str, Engine]:
    engines: dict[str, Engine] = {}
    tries = []
    if os.environ.get("AVEN_TTS_QWEN3") == "1":
        tries.append(Qwen3VoiceDesign)
    if os.environ.get("RHVOICE_BIN"):
        tries.append(lambda: RHVoice(os.environ["RHVOICE_BIN"]))
    if os.environ.get("SILERO_MODEL"):
        tries.append(lambda: SileroCIS(os.environ["SILERO_MODEL"]))
    if os.environ.get("AVEN_TTS_SUPERTONIC") == "1":
        tries.append(Supertonic)
    if os.environ.get("PIPER_MODELS"):
        tries.append(lambda: Piper(os.environ["PIPER_MODELS"]))
    for t in tries:
        try:
            e = t()
            engines[e.name] = e
            print(f"[tts] engine ready: {e.name} ({len(e.voices())} voices)", flush=True)
        except Exception as ex:  # noqa: BLE001
            print(f"[tts] engine unavailable: {ex}", flush=True)
    return engines


ENGINES: dict[str, Engine] = {}


def voice_list() -> list[dict]:
    return [v for e in ENGINES.values() for v in e.voices()]


def cors_allowlist() -> set[str]:
    """Явные origin: GitHub Pages прототипа + что владелец дописал в AVEN_TTS_ORIGINS.
    localhost/127.0.0.1 (любой порт) разрешены отдельно в allowed_origin — это dev-режим."""
    env = os.environ.get("AVEN_TTS_ORIGINS", "")
    out = {o.strip().rstrip("/") for o in env.split(",") if o.strip()}
    out.add("https://nub36.github.io")
    return out


def allowed_origin(origin: str | None) -> str | None:
    """Контролируемый CORS (без "*"): отражаем origin только из разрешённых."""
    if not origin:
        return None
    o = origin.rstrip("/")
    if o in cors_allowlist():
        return o
    try:
        from urllib.parse import urlparse

        u = urlparse(o)
        if u.scheme in ("http", "https") and (u.hostname or "").lower() in ("localhost", "127.0.0.1", "::1"):
            return o  # development: локальная страница прототипа
    except Exception:  # noqa: BLE001
        pass
    return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def log_message(self, fmt, *args):  # без текста запросов — только путь и код
        sys.stderr.write("[http] %s %s %s\n" % (self.client_address[0], self.command, self.path.split("?")[0]))

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # CORS только для API и только для явно разрешённых origin (см. allowed_origin)
        if self.path.startswith("/api/"):
            o = allowed_origin(self.headers.get("Origin"))
            if o:
                self.send_header("Access-Control-Allow-Origin", o)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        # Chrome Private Network Access: публичная страница → сервер в частной сети
        if self.headers.get("Access-Control-Request-Private-Network"):
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/tts/health"):
            return self._json(200, {
                "ok": True,
                "status": "ok",
                "server": "aven-tts-research",
                "version": VERSION,
                "engines": {name: dict(voices=[v["id"] for v in e.voices()],
                                       supports_rate=e.supports_rate, **e.info())
                            for name, e in ENGINES.items()},
                "voices": voice_list(),
                "uptime_s": round(time.time() - STARTED, 1),
                "max_chars": MAX_CHARS,
            })
        if self.path.startswith("/api/tts/voices"):
            return self._json(200, {"voices": voice_list()})
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api/tts/synthesize"):
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(min(n, 20000)) or b"{}")
            text = str(req.get("text", "")).strip()[:MAX_CHARS]
            vid = str(req.get("voice", ""))
            rate = float(req.get("rate") or 1.0)
            engine_name, _, voice = vid.partition("/")
            eng = ENGINES.get(engine_name)
            if not text or not eng or vid not in {v["id"] for v in eng.voices()}:
                return self._json(400, {"error": "unknown voice or empty text"})
            t = time.perf_counter()
            with eng.lock:
                data = eng.synth(text, voice, rate)
            dt = time.perf_counter() - t
            sys.stderr.write(f"[tts] {vid} chars={len(text)} synth={dt:.3f}s\n")
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Synth-Seconds", f"{dt:.3f}")
            if not eng.supports_rate and abs(rate - 1.0) > 1e-6:
                self.send_header("X-Rate-Applied", "ignored")  # честно: скорость этим движком не применяется
            self.end_headers()
            self.wfile.write(data)
        except Exception as ex:  # noqa: BLE001
            return self._json(500, {"error": f"{type(ex).__name__}: {ex}"})


def warmup():
    """Один короткий синтез на движок после загрузки — у первого реального запроса
    не будет холодного старта (docs/TTS_RESEARCH.md §12.4). Текст в лог не пишется."""
    for name, eng in ENGINES.items():
        vs = eng.voices()
        if not vs:
            continue
        vid = vs[0]["id"]
        _, _, voice = vid.partition("/")
        t = time.perf_counter()
        try:
            eng.synth("Готово.", voice, 1.0)
            sys.stderr.write(f"[tts] warmup {vid}: {time.perf_counter() - t:.3f}s\n")
        except Exception as ex:  # noqa: BLE001
            sys.stderr.write(f"[tts] warmup {vid} failed: {type(ex).__name__}: {ex}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--warmup", action="store_true", help="один короткий синтез на движок после загрузки")
    a = ap.parse_args()
    ENGINES.update(load_engines())
    if a.warmup and ENGINES:
        warmup()
    print(f"[tts] aven-tts-research {VERSION}; static: {STATIC}; "
          f"engines: {list(ENGINES) or 'нет — только статические образцы'}", flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
