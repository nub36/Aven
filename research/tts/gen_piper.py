"""Piper (OHF-Voice/piper1-gpl) — ru_RU-irina-medium. Исследование, не production.

Модель: https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU/irina/medium
ВНИМАНИЕ: в MODEL_CARD датасета указано «License: Unknown» → в продукт без
выяснения лицензии использовать нельзя (docs/TTS_RESEARCH.md).
"""
import sys
import time
from pathlib import Path

import numpy as np

from common import Metrics, run_voice, OUT

MODELS = Path(sys.argv[1] if len(sys.argv) > 1 else "models/piper")

m = Metrics("piper", package="piper-tts (GPL-3.0)", model="ru_RU-irina-medium (dataset license: Unknown)")
try:
    from piper import PiperVoice, SynthesisConfig

    t = time.perf_counter()
    voice = PiperVoice.load(MODELS / "ru_RU-irina-medium.onnx")
    load_s = time.perf_counter() - t
    size_mb = round((MODELS / "ru_RU-irina-medium.onnx").stat().st_size / 1e6, 1)
    m.voice("irina-medium", load_s=round(load_s, 2), model_mb=size_mb, sample_rate=voice.config.sample_rate)
    cfg = SynthesisConfig(length_scale=1.0)

    def synth(text):
        chunks = [c.audio_float_array for c in voice.synthesize(text, syn_config=cfg)]
        return np.concatenate(chunks), voice.config.sample_rate

    run_voice(m, "piper", "irina-medium", synth)
except Exception as e:  # noqa: BLE001
    m.error(f"piper: {type(e).__name__}: {e}")
m.save()
