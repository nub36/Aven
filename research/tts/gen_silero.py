"""Silero TTS v5. Исследование, не production.

Лицензии (https://github.com/snakers4/silero-models#licence):
  * v5_5_ru (aidar, baya, kseniya, xenia, eugene) — CC BY-NC-SA 4.0 (некоммерческая!);
    коммерческое использование — только по отдельной лицензии Silero. Здесь — только
    как эталон качества для сравнения на слух.
  * v5_cis_base / v5_cis_base_nostress — MIT (LICENSE_CIS). Русские голоса с префиксом ru_.
    v5_cis_base ожидает ударения («к+ошка») → расставляем silero-stress (MIT).
"""
import os
import time
from pathlib import Path

import numpy as np
import torch

from common import Metrics, run_voice, PHRASES, f0_median, write_wav, OUT

torch.set_num_threads(int(os.environ.get("TTS_THREADS", "4")))
SR = 24000
CACHE = Path("models/silero")
CACHE.mkdir(parents=True, exist_ok=True)
T01 = [p for p in PHRASES if p["id"] == "t01"]


def load(name):
    f = CACHE / f"{name}.pt"
    if not f.exists():
        torch.hub.download_url_to_file(f"https://models.silero.ai/models/tts/ru/{name}.pt", str(f))
    t = time.perf_counter()
    model = torch.package.PackageImporter(str(f)).load_pickle("tts_models", "model")
    model.to(torch.device("cpu"))
    return model, time.perf_counter() - t, round(f.stat().st_size / 1e6, 1)


def make_synth(model, speaker, **extra):
    def synth(text):
        try:
            audio = model.apply_tts(text=text, speaker=speaker, sample_rate=SR, **extra)
        except TypeError:
            audio = model.apply_tts(text=text, speaker=speaker, sample_rate=SR)
        return audio.numpy(), SR
    return synth


# ---------- v5_5_ru (CC BY-NC-SA — только эталон для сравнения) ----------
m = Metrics("silero_v5_ru", license="CC BY-NC-SA 4.0 (non-commercial)", model="v5_5_ru")
try:
    model, load_s, mb = load("v5_5_ru")
    for spk in ["baya", "kseniya", "xenia"]:
        m.voice(spk, load_s=round(load_s, 2), model_mb=mb, sample_rate=SR)
        run_voice(m, "silero_v5_ru", spk, make_synth(model, spk, put_accent=True, put_yo=True))
    del model
except Exception as e:  # noqa: BLE001
    m.error(f"v5_5_ru: {type(e).__name__}: {e}")
m.save()

# ---------- v5_cis_base (MIT) + silero-stress (MIT) ----------
m = Metrics("silero_cis_mit", license="MIT (LICENSE_CIS) + silero-stress MIT", model="v5_cis_base")
try:
    from silero_stress import load_accentor

    t = time.perf_counter()
    accentor = load_accentor()
    stress_load = time.perf_counter() - t
    model, load_s, mb = load("v5_cis_base")
    ru = sorted(s for s in model.speakers if s.startswith("ru_"))
    print("ru speakers:", ru, flush=True)
    m.data["meta"]["ru_speakers"] = ru
    m.data["meta"]["stress_load_s"] = round(stress_load, 2)
    m.data["meta"]["stressed_example"] = accentor(PHRASES[0]["speech"])
    # 1) каталог: t01 каждым ru_-голосом + оценка F0 (женский ≈ ≥165 Гц)
    female = []
    for spk in ru:
        f0 = run_voice(m, "silero_cis_mit", spk, make_synth(model, spk), phrases=T01, probe=False, prep=accentor)
        m.voice(spk, load_s=round(load_s, 2), model_mb=mb, sample_rate=SR, catalogue_only=True)
        if f0 and f0 >= 165:
            female.append((spk, f0))
    print("female (by F0):", female, flush=True)
    m.data["meta"]["female_by_f0"] = female
    # 2) полный набор фраз для женских голосов
    for spk, _ in female:
        m.voice(spk, catalogue_only=False)
        run_voice(m, "silero_cis_mit", spk, make_synth(model, spk), prep=accentor)
    del model
    # 3) nostress-вариант (без расстановки ударений) — t01 для женских голосов, для сравнения
    model, load_s, mb = load("v5_cis_base_nostress")
    for spk, _ in female:
        vid = spk + "__nostress"
        m.voice(vid, load_s=round(load_s, 2), model_mb=mb, sample_rate=SR, catalogue_only=True)
        run_voice(m, "silero_cis_mit", vid, make_synth(model, spk), phrases=T01, probe=False)
except Exception as e:  # noqa: BLE001
    m.error(f"cis: {type(e).__name__}: {e}")
m.save()
