"""Qwen3-TTS · vd17-design — РАСШИРЕННЫЙ сценарный тест (этап 2, 2026-09-25).

Фаворит владельца — голос `vd17-design` (Qwen3-TTS-12Hz-1.7B-VoiceDesign, промпт DESIGN_PROMPT
из common.py). В этапе 1 у него был только один клип (T1, каталог). Здесь тот же голос
прогоняется по реальным репликам Aven: короткие ответы, напоминания, деньги, авто,
вопрос, предупреждение, длинный ответ и 4 варианта произношения названия «Aven».

Отдельно от базового gen_qwen3.py:
  * базовый набор phrases.json (T1–T10) не меняется — сравнимость движков этапа 1 сохраняется;
  * прогон идёт самим 1.7B-VoiceDesign (а не клоном 0.6B-Base), потому что владелец слушал
    именно этот голос; фраза x00 повторяет текст T1 отдельным вызовом — по ней видно,
    держит ли VoiceDesign один и тот же тембр от вызова к вызову.

Запуск (GitHub Actions, CPU):
    python gen_qwen3_vd17.py
Результат: out/qwen3/vd17-design/xNN.wav + out/metrics/qwen3_vd17.json
(полные WAV — только в артефактах; в git попадают MP3 по политике candidates.json → publish).

Примечание: в этом окружении GPU нет, поэтому цифры ниже — CPU, а не целевая production-среда.
Про GPU/latency см. docs/TTS_RESEARCH.md §12 (наши измерения vs опубликованные данные Qwen).
"""
import os
import time

import numpy as np
import torch

from common import (Metrics, run_voice, f0_median, EXT, EXT_PHRASES, DESIGN_PROMPT, OUT)

torch.set_num_threads(int(os.environ.get("TTS_THREADS", "4")))
torch.manual_seed(0)
LANG = "Russian"
ENGINE_DIR = EXT["engine"]      # qwen3
VOICE_ID = EXT["voice"]         # vd17-design
MODEL_NAME = "Qwen3-TTS-12Hz-1.7B-VoiceDesign"

m = Metrics(
    "qwen3_vd17",
    license="Apache-2.0 (code+weights)",
    device="cpu",
    dtype="float32",
    engine_dir=ENGINE_DIR,
    voice_id=VOICE_ID,
    model=MODEL_NAME,
    design_prompt=DESIGN_PROMPT,
    extended=True,
)
try:
    from qwen_tts import Qwen3TTSModel

    t = time.perf_counter()
    model = Qwen3TTSModel.from_pretrained(f"Qwen/{MODEL_NAME}", device_map="cpu", dtype=torch.float32)
    load_s = round(time.perf_counter() - t, 2)
    m.voice(VOICE_ID, load_s=load_s, model=MODEL_NAME, extended=True)

    def synth(text):
        wavs, sr = model.generate_voice_design(text=text, instruct=DESIGN_PROMPT, language=LANG)
        return np.asarray(wavs[0]).reshape(-1), sr

    run_voice(m, ENGINE_DIR, VOICE_ID, synth, phrases=EXT_PHRASES, probe=False)
    # F0 — с эталонной фразы x00 (текст совпадает с T1 базового набора)
    ref = OUT / ENGINE_DIR / VOICE_ID / "x00.wav"
    if ref.exists():
        import wave
        with wave.open(str(ref), "rb") as w:
            sr = w.getframerate()
            a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        m.voice(VOICE_ID, f0_median_hz=f0_median(a, sr))
except Exception as e:  # noqa: BLE001
    import traceback
    traceback.print_exc()
    m.error(f"qwen3_vd17: {type(e).__name__}: {e}")
m.save()
