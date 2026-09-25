"""Vosk TTS (alphacep/vosk-tts, код Apache-2.0). Исследование, не production.

Лицензия ВЕСОВ моделей vosk-model-tts-ru-* явно не опубликована (голоса обучены,
в т.ч., на Tiflocomp Irina / Natasha из SOVA) → статус «лицензия не ясна»,
в продукт без письменного подтверждения AlphaCephei не брать.
"""
import json
import os
import sys
import time
from pathlib import Path

import numpy as np

from common import Metrics, run_voice, PHRASES, OUT

MODEL = sys.argv[1] if len(sys.argv) > 1 else "vosk-model-tts-ru-0.10-multi"
MAX_FULL = int(os.environ.get("VOSK_MAX_FULL", "4"))
T01 = [p for p in PHRASES if p["id"] == "t01"]

m = Metrics("vosk", package="vosk-tts (Apache-2.0 code)", model=MODEL, weights_license="unclear")
try:
    from vosk_tts import Model, Synth

    # vosk_tts при неизвестном имени модели делает sys.exit → ловим SystemExit и пробуем старые версии
    model, errs = None, []
    for name in [MODEL] + [x for x in ("vosk-model-tts-ru-0.9-multi", "vosk-model-tts-ru-0.8-multi") if x != MODEL]:
        t = time.perf_counter()
        try:
            model = Model(model_name=name)
            m.data["meta"]["model"] = name
            break
        except BaseException as e:  # noqa: BLE001
            errs.append(f"{name}: {type(e).__name__}: {e}")
            print("model load failed:", errs[-1], flush=True)
    load_s = time.perf_counter() - t
    if model is None:
        raise RuntimeError("; ".join(errs))
    synth_obj = Synth(model)
    cfg = model.config
    n = cfg.get("num_speakers") or cfg.get("n_speakers") or len(cfg.get("speaker_id_map", {})) or 5
    m.data["meta"].update({"load_s": round(load_s, 2), "num_speakers": n,
                           "config_keys": sorted(cfg.keys()), "inference": cfg.get("inference")})
    sr = cfg.get("audio", {}).get("sample_rate", 22050)

    def mk(spk):
        def synth(text):
            audio = synth_obj.synth_audio(text, speaker_id=spk)
            return np.asarray(audio), sr
        return synth

    female = []
    for spk in range(int(n)):
        vid = f"spk{spk:02d}"
        f0 = run_voice(m, "vosk", vid, mk(spk), phrases=T01, probe=False)
        m.voice(vid, load_s=round(load_s, 2), sample_rate=sr, catalogue_only=True)
        if f0 and f0 >= 165:
            female.append((vid, spk, f0))
    m.data["meta"]["female_by_f0"] = female
    for vid, spk, _ in female[:MAX_FULL]:
        m.voice(vid, catalogue_only=False)
        run_voice(m, "vosk", vid, mk(spk))
except Exception as e:  # noqa: BLE001
    m.error(f"vosk: {type(e).__name__}: {e}")
m.save()
