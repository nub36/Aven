"""Supertonic 3 (Supertone) — ONNX, 31 язык вкл. русский. Исследование, не production.

Лицензии: код примеров MIT; веса — OpenRAIL-M (коммерция разрешена с use-based
ограничениями). Репозиторий кода архивирован 2026-09-09 (риск поддержки).
Работает и в браузере (onnxruntime-web, WebGPU/WASM) — кандидат класса D.
"""
import os
import time

import numpy as np

from common import Metrics, run_voice

STEPS = int(os.environ.get("SUPERTONIC_STEPS", "8"))
m = Metrics("supertonic", package="supertonic (MIT code)", model="supertonic-3 (OpenRAIL-M weights)", steps=STEPS)
try:
    from supertonic import TTS

    t = time.perf_counter()
    tts = TTS(auto_download=True)
    load_s = time.perf_counter() - t
    sr = tts.sample_rate
    for name in ["F1", "F2", "F3", "F4", "F5"]:
        try:
            style = tts.get_voice_style(name)
        except Exception as e:  # noqa: BLE001
            m.error(f"style {name}: {e}")
            continue
        m.voice(name, load_s=round(load_s, 2), sample_rate=sr)

        def synth(text, style=style):
            wav, _ = tts.synthesize(text, voice_style=style, lang="ru", total_steps=STEPS, speed=1.0)
            return np.asarray(wav).reshape(-1), sr

        run_voice(m, "supertonic", name, synth)
except Exception as e:  # noqa: BLE001
    m.error(f"supertonic: {type(e).__name__}: {e}")
m.save()
