"""Общие утилиты исследовательских генераторов TTS (Aven, docs/TTS_RESEARCH.md).

Это НЕ production-код: скрипты только генерируют одинаковые тестовые фразы
разными движками и замеряют скорость в доступной среде.

Каждый генератор пишет:
  out/<engine>/<voice>/<phrase_id>.wav
  out/metrics/<engine>.json
"""
from __future__ import annotations

import json
import os
import platform
import subprocess
import time
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / "phrases.json").read_text(encoding="utf-8"))
PHRASES = DATA["phrases"]
PROBE = DATA["latency_probe"]
OUT = Path(os.environ.get("TTS_OUT", HERE / "out"))


def env_info() -> dict:
    cpu = platform.processor() or ""
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                cpu = line.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    mem_gb = None
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemTotal"):
                mem_gb = round(int(line.split()[1]) / 1024 / 1024, 1)
    except OSError:
        pass
    return {
        "cpu": cpu,
        "cores": os.cpu_count(),
        "ram_gb": mem_gb,
        "gpu": "none",
        "runner": os.environ.get("RUNNER_NAME") or platform.node(),
        "python": platform.python_version(),
    }


def to_int16(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32).reshape(-1)
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    if peak > 1.0:
        x = x / peak
    return (np.clip(x, -1.0, 1.0) * 32767).astype(np.int16)


def write_wav(path: Path, audio: np.ndarray, sr: int) -> float:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = audio if audio.dtype == np.int16 else to_int16(audio)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(data.tobytes())
    return len(data) / float(sr)


def f0_median(audio: np.ndarray, sr: int) -> float | None:
    """Грубая оценка медианной частоты основного тона (для фильтра «женский голос»)."""
    x = np.asarray(audio, dtype=np.float32).reshape(-1)
    if x.dtype != np.float32 or np.max(np.abs(x)) > 2:
        x = x / 32768.0
    frame, hop = int(0.04 * sr), int(0.01 * sr)
    lo, hi = int(sr / 400), int(sr / 70)
    if len(x) < frame + hi:
        return None
    energy_thr = 0.02 * float(np.max(np.abs(x)) or 1)
    vals = []
    for start in range(0, len(x) - frame, hop):
        fr = x[start:start + frame]
        if np.sqrt(np.mean(fr ** 2)) < energy_thr:
            continue
        fr = fr - fr.mean()
        ac = np.correlate(fr, fr, mode="full")[frame - 1:]
        if ac[0] <= 0:
            continue
        seg = ac[lo:hi]
        lag = int(np.argmax(seg)) + lo
        if ac[lag] / ac[0] > 0.45:
            vals.append(sr / lag)
    return round(float(np.median(vals)), 1) if len(vals) > 10 else None


class Metrics:
    """Сбор метрик одного движка → out/metrics/<engine>.json."""

    def __init__(self, engine: str, **meta):
        self.engine = engine
        self.data = {"engine": engine, "env": env_info(), "meta": meta, "voices": {}, "errors": []}
        self.t0 = time.perf_counter()

    def voice(self, voice_id: str, **info) -> dict:
        v = self.data["voices"].setdefault(voice_id, {"info": info, "phrases": {}})
        v["info"].update(info)
        return v

    def phrase(self, voice_id: str, pid: str, synth_s: float, audio_s: float, first_call: bool = False):
        v = self.voice(voice_id)
        v["phrases"][pid] = {
            "synth_s": round(synth_s, 3),
            "audio_s": round(audio_s, 3),
            "rtf": round(synth_s / audio_s, 3) if audio_s else None,
            "first_call": first_call,
        }

    def error(self, msg: str):
        print("ERROR:", msg, flush=True)
        self.data["errors"].append(msg)

    def save(self):
        self.data["total_s"] = round(time.perf_counter() - self.t0, 1)
        # сводка по голосам (тёплые вызовы, без первого)
        for v in self.data["voices"].values():
            warm = [p for pid, p in v["phrases"].items() if pid.startswith("t") and not p["first_call"]]
            if warm:
                v["summary"] = {
                    "median_synth_s": round(float(np.median([p["synth_s"] for p in warm])), 3),
                    "median_rtf": round(float(np.median([p["rtf"] for p in warm if p["rtf"]])), 3),
                    "max_synth_s": round(max(p["synth_s"] for p in warm), 3),
                }
        path = OUT / "metrics" / f"{self.engine}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"metrics → {path}", flush=True)


def timed(fn, *a, **kw):
    t = time.perf_counter()
    r = fn(*a, **kw)
    return r, time.perf_counter() - t


def run_voice(m: Metrics, engine_dir: str, voice_id: str, synth, phrases=None, probe=True, prep=None):
    """synth(text) -> (np.ndarray audio, sr). prep(text) -> text (например, ударения)."""
    phrases = phrases if phrases is not None else PHRASES
    first = True
    f0 = None
    for ph in phrases:
        text = prep(ph["speech"]) if prep else ph["speech"]
        try:
            (audio, sr), dt = timed(synth, text)
        except Exception as e:  # noqa: BLE001 — исследовательский скрипт
            m.error(f"{voice_id}/{ph['id']}: {type(e).__name__}: {e}")
            first = False
            continue
        dur = write_wav(OUT / engine_dir / voice_id / f"{ph['id']}.wav", audio, sr)
        m.phrase(voice_id, ph["id"], dt, dur, first_call=first)
        if ph["id"] == "t01":
            f0 = f0_median(audio if audio.dtype != np.int16 else audio.astype(np.float32) / 32768.0, sr)
        print(f"{engine_dir}/{voice_id}/{ph['id']}: synth {dt:.2f}s audio {dur:.2f}s", flush=True)
        first = False
    if probe:
        text = prep(PROBE["speech"]) if prep else PROBE["speech"]
        try:
            (audio, sr), dt = timed(synth, text)
            m.phrase(voice_id, "probe", dt, len(audio) / float(sr))
        except Exception as e:  # noqa: BLE001
            m.error(f"{voice_id}/probe: {e}")
    m.voice(voice_id, f0_median_hz=f0)
    return f0


def sh(cmd: str) -> str:
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout
