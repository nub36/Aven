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
# Веса опубликованы с CUDA-тензорами → на CPU-раннере принудительно map_location=cpu
_torch_load = torch.load


def _cpu_load(*a, **kw):
    kw.setdefault("map_location", torch.device("cpu"))
    return _torch_load(*a, **kw)


torch.load = _cpu_load
# Референс для клонирования: русский женский голос с лицензией MIT (Silero CIS base, образец T1 из этого исследования)
REF = os.environ.get("CHATTERBOX_REF", "../../prototype/assets/voice-samples/silero_cis_mit/ru_karina/t01.mp3")
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

    if os.path.exists(REF):
        m.voice("clone-silero-karina", load_s=round(load_s, 2), sample_rate=model.sr, reference=REF)

        def synth_clone(text):
            wav = model.generate(text, language_id="ru", audio_prompt_path=REF)
            return wav.squeeze().cpu().numpy(), model.sr

        run_voice(m, "chatterbox", "clone-silero-karina", synth_clone)
    else:
        m.error(f"reference not found: {REF}")
except Exception as e:  # noqa: BLE001
    import traceback
    traceback.print_exc()
    m.error(f"chatterbox: {type(e).__name__}: {e}")
m.save()
