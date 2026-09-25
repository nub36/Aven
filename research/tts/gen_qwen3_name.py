"""Qwen3-TTS · мини-прогон СПОСОБОВ произношения «Авен» (этап 2.1, 2026-09-25).

Зачем. В этапе 2 (§11.2 docs/TTS_RESEARCH.md) ни один из четырёх вариантов нормализации
не дал эталонного «А́вен» по данным ASR, а способы исправления были только описаны.
Здесь они проверяются на CPU-раннере GitHub Actions одним прогоном:

  1. эталонный клип VoiceDesign (n00) — тот же текст T1 и тот же DESIGN_PROMPT, что в этапе 1;
     из него создаётся voice_clone_prompt (официально рекомендуемый разработчиком пайплайн
     «спроектировать голос один раз → дальше генерировать клоном Base»);
  2. способ 3 — перебор орфографии (n01–n05): тембр не меняется, правится только текст для TTS;
  3. способ 2 — подсказка о произношении в промпте описания голоса (n06–n07): влияет и на тембр,
     поэтому помечается отдельно и требует переслушивания голоса целиком;
  4. способ 1 — in-context learning: клоны 0.6B-Base (n10–n13) и 1.7B-Base (n20–n25) по эталону n00.
     Повод: в этапе 1 у qwen3/base06-clone на T1 Whisper услышал ровно «Я Авен» (WER 0%),
     тогда как у самого VoiceDesign — «Я Аван».

Способ 4 (готовый образец имени) генерации не требует: это механизм продукта, а не теста
(см. §13 вариант D и §16 отчёта).

Базовые наборы phrases.json (T1–T10) и phrases_vd17.json (xNN) НЕ меняются — сравнимость
прежних прогонов сохранена. Метрики → out/metrics/qwen3_name.json, аудио → out/qwen3/<voice>/nNN.wav
(в git попадают только MP3 по политике candidates.json → publish).

Примечание: GPU в этом окружении нет, поэтому все цифры — CPU, а не целевая production-среда
(см. §12 отчёта). Запуск: python gen_qwen3_name.py
"""
import gc
import os
import time

import numpy as np
import torch

from common import (
    DESIGN_PROMPT,
    NAME,
    NAME_HINT,
    NAME_PHRASES,
    OUT,
    Metrics,
    f0_median,
    timed,
    write_wav,
)

torch.set_num_threads(int(os.environ.get("TTS_THREADS", "4")))
torch.manual_seed(0)
LANG = "Russian"
ENGINE_DIR = NAME["engine"]                     # qwen3
VD_MODEL = "Qwen3-TTS-12Hz-1.7B-VoiceDesign"
B06_MODEL = "Qwen3-TTS-12Hz-0.6B-Base"
B17_MODEL = "Qwen3-TTS-12Hz-1.7B-Base"
HINT_PROMPT = DESIGN_PROMPT + NAME_HINT

BY_ID = {p["id"]: p for p in NAME_PHRASES}
REF_ID = "n00"
REF_SPEECH = BY_ID[REF_ID]["speech"]            # == текст T1 из phrases.json

m = Metrics(
    "qwen3_name",
    license="Apache-2.0 (code+weights)",
    device="cpu",
    dtype="float32",
    engine_dir=ENGINE_DIR,
    purpose="мини-прогон способов произношения «Авен» (этап 2.1)",
    design_prompt=DESIGN_PROMPT,
    hint_prompt=HINT_PROMPT,
    name_target=NAME["name_target"],
    phrases=[p["id"] for p in NAME_PHRASES],
)


def by_kind(kind: str) -> list[dict]:
    return [p for p in NAME_PHRASES if p["kind"] == kind]


WARMED: set[str] = set()      # голоса, у которых уже был первый («холодный») вызов


def gen(voice: str, synth, phrases: list[dict], **voice_info):
    """Прогон списка фраз одним голосом. Ошибка фразы не роняет весь прогон.

    first_call=True только у ПЕРВОГО клипа голоса: одна и та же модель может вызываться
    несколькими группами (эталон → орфография → подсказка в промпте), и помечать холодным
    первый клип каждой группы было бы неверно (исправлено после прогона run 36184248453,
    где n01/n06 получили first_call ошибочно).
    """
    m.voice(voice, **voice_info)
    first = voice not in WARMED
    for p in phrases:
        pid = p["id"]
        try:
            (audio, sr), dt = timed(synth, p)
        except Exception as e:  # noqa: BLE001 — исследовательский скрипт
            m.error(f"{voice}/{pid}: {type(e).__name__}: {e}")
            first = False
            continue
        dur = write_wav(OUT / ENGINE_DIR / voice / f"{pid}.wav", audio, sr)
        f0 = f0_median(np.asarray(audio, dtype=np.float32).reshape(-1), sr)
        m.phrase(voice, pid, dt, dur, first_call=first, speech=p["speech"],
                 kind=p["kind"], model=p.get("model", ""), f0_median_hz=f0)
        print(f"{ENGINE_DIR}/{voice}/{pid}: synth {dt:.2f}s audio {dur:.2f}s f0 {f0}", flush=True)
        WARMED.add(voice)
        first = False


def load(name: str):
    from qwen_tts import Qwen3TTSModel

    t = time.perf_counter()
    model = Qwen3TTSModel.from_pretrained(f"Qwen/{name}", device_map="cpu", dtype=torch.float32)
    return model, round(time.perf_counter() - t, 2)


try:
    # ---------- 1) VoiceDesign 1.7B: эталон + орфография + подсказка в промпте ----------
    vd, vd_load = load(VD_MODEL)
    m.voice("vd17-design", load_s=vd_load, model=VD_MODEL, name_run=True)

    def synth_design(p):
        instruct = HINT_PROMPT if p.get("instruct") == "hint" else DESIGN_PROMPT
        wavs, sr = vd.generate_voice_design(text=p["speech"], instruct=instruct, language=LANG)
        return np.asarray(wavs[0]).reshape(-1), sr

    # n00 — первым вызовом после загрузки (как в этапе 1): из него делается clone prompt
    gen("vd17-design", synth_design, by_kind("reference"), model=VD_MODEL, name_run=True, load_s=vd_load)
    ref_wav = OUT / ENGINE_DIR / "vd17-design" / f"{REF_ID}.wav"
    ref = None
    if ref_wav.exists():
        import wave

        with wave.open(str(ref_wav), "rb") as w:
            ref_sr = w.getframerate()
            ref = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    gen("vd17-design", synth_design, by_kind("spelling"), model=VD_MODEL, name_run=True)
    gen("vd17-design", synth_design, by_kind("prompt"), model=VD_MODEL, name_run=True, instruct="hint")
    del vd
    gc.collect()

    # ---------- 2) клоны Base по эталонному клипу ----------
    if ref is None:
        m.error("эталонный клип n00 не создан — клоны Base не запускались")
    else:
        for model_name, voice, kind in ((B06_MODEL, "base06-clone", "clone06"),
                                        (B17_MODEL, "base17-clone", "clone17")):
            try:
                base, load_s = load(model_name)
                t = time.perf_counter()
                prompt = base.create_voice_clone_prompt(ref_audio=(ref, ref_sr), ref_text=REF_SPEECH)
                prompt_s = round(time.perf_counter() - t, 2)

                def synth_clone(p, base=base, prompt=prompt):
                    wavs, sr = base.generate_voice_clone(text=p["speech"], language=LANG,
                                                         voice_clone_prompt=prompt)
                    return np.asarray(wavs[0]).reshape(-1), sr

                gen(voice, synth_clone, by_kind(kind), model=f"{model_name} (clone of {REF_ID})",
                    name_run=True, load_s=load_s, clone_prompt_s=prompt_s,
                    ref_clip=f"{ENGINE_DIR}/vd17-design/{REF_ID}", ref_text=REF_SPEECH)
                del base, prompt
                gc.collect()
            except Exception as e:  # noqa: BLE001
                import traceback

                traceback.print_exc()
                m.error(f"{voice}: {type(e).__name__}: {e}")
except Exception as e:  # noqa: BLE001
    import traceback

    traceback.print_exc()
    m.error(f"qwen3_name: {type(e).__name__}: {e}")
m.save()
