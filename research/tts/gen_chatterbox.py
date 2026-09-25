"""Chatterbox Multilingual (Resemble AI, MIT). Исследование, не production.

23 языка вкл. русский; zero-shot клонирование; встроенный водяной знак PerTh.
Здесь — голос по умолчанию (без референса), CPU.
"""
import os
import time

import numpy as np
import torch

from common import Metrics, run_voice

torch.set_num_threads(int(os.environ.get("TTS_THREADS", "4")))
torch.manual_seed(0)
m = Metrics("chatterbox", license="MIT (code+weights)", device="cpu")
try:
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    t = time.perf_counter()
    model = ChatterboxMultilingualTTS.from_pretrained(device=torch.device("cpu"))
    load_s = time.perf_counter() - t
    m.voice("default", load_s=round(load_s, 2), sample_rate=model.sr)

    def synth(text):
        wav = model.generate(text, language_id="ru")
        return wav.squeeze().cpu().numpy(), model.sr

    run_voice(m, "chatterbox", "default", synth)
except Exception as e:  # noqa: BLE001
    import traceback
    traceback.print_exc()
    m.error(f"chatterbox: {type(e).__name__}: {e}")
m.save()
