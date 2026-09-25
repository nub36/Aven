"""Qwen3-TTS (Alibaba Qwen, Apache-2.0 код и веса). Исследование, не production.

Запуск на CPU (без GPU) — чтобы честно увидеть, что будет на дешёвом сервере.
  * 0.6B-CustomVoice: пресетные голоса (Serena/Vivian — носители китайского,
    Ono_Anna — японского, Sohee — корейского), говорят по-русски.
  * 1.7B-VoiceDesign → эталонная фраза «молодая русская женщина, спокойно,
    дружелюбно» → 0.6B-Base клонирует этот голос на все фразы (стабильный тембр).
Примечание: пакет qwen-tts 0.1.x НЕ даёт настоящего потокового вывода
(non_streaming_mode=False лишь имитирует потоковый ввод текста).
"""
import gc
import os
import time

import numpy as np
import torch

from common import Metrics, run_voice, PHRASES, write_wav, OUT

torch.set_num_threads(int(os.environ.get("TTS_THREADS", "4")))
torch.manual_seed(0)
LANG = "Russian"
T01 = [p for p in PHRASES if p["id"] == "t01"]
DESIGN = (
    "A young adult Russian woman, about 27 years old. Calm, friendly and confident voice, "
    "warm but not overly emotional. Natural conversational Russian with clear diction, "
    "like a helpful personal assistant. Not a news anchor, not childish, not cartoonish."
)

m = Metrics("qwen3", license="Apache-2.0 (code+weights)", device="cpu", dtype="float32", design_prompt=DESIGN)
try:
    from qwen_tts import Qwen3TTSModel

    def load(name):
        t = time.perf_counter()
        mdl = Qwen3TTSModel.from_pretrained(f"Qwen/{name}", device_map="cpu", dtype=torch.float32)
        return mdl, time.perf_counter() - t

    # --- 0.6B CustomVoice ---
    model, load_s = load("Qwen3-TTS-12Hz-0.6B-CustomVoice")
    m.data["meta"]["speakers_0.6B"] = model.get_supported_speakers()
    for spk, full in [("Serena", True), ("Vivian", True), ("Ono_Anna", False), ("Sohee", False)]:
        vid = "cv06-" + spk.lower()
        m.voice(vid, load_s=round(load_s, 2), model="0.6B-CustomVoice", catalogue_only=not full)

        def synth(text, spk=spk):
            wavs, sr = model.generate_custom_voice(text=text, speaker=spk, language=LANG)
            return np.asarray(wavs[0]).reshape(-1), sr

        run_voice(m, "qwen3", vid, synth, phrases=None if full else T01, probe=full)
    del model
    gc.collect()

    # --- 1.7B VoiceDesign: эталон голоса ---
    model, load_s = load("Qwen3-TTS-12Hz-1.7B-VoiceDesign")
    m.voice("vd17-design", load_s=round(load_s, 2), model="1.7B-VoiceDesign", catalogue_only=True)
    ref_text = T01[0]["speech"]
    t = time.perf_counter()
    wavs, sr = model.generate_voice_design(text=ref_text, instruct=DESIGN, language=LANG)
    dt = time.perf_counter() - t
    ref = np.asarray(wavs[0]).reshape(-1)
    dur = write_wav(OUT / "qwen3" / "vd17-design" / "t01.wav", ref, sr)
    m.phrase("vd17-design", "t01", dt, dur, first_call=True)
    del model
    gc.collect()

    # --- 0.6B Base: клон спроектированного голоса на все фразы ---
    model, load_s = load("Qwen3-TTS-12Hz-0.6B-Base")
    m.voice("base06-clone", load_s=round(load_s, 2), model="0.6B-Base (clone of vd17-design)")
    prompt = model.create_voice_clone_prompt(ref_audio=(ref, sr), ref_text=ref_text)

    def synth_clone(text):
        wavs, sr2 = model.generate_voice_clone(text=text, language=LANG, voice_clone_prompt=prompt)
        return np.asarray(wavs[0]).reshape(-1), sr2

    run_voice(m, "qwen3", "base06-clone", synth_clone)
except Exception as e:  # noqa: BLE001
    import traceback
    traceback.print_exc()
    m.error(f"qwen3: {type(e).__name__}: {e}")
m.save()
