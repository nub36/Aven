"""Aven — компактный набор для сравнения VPS-кандидатов TTS + честная проба «1 CPU» (этап 5).

Задача (docs/TTS_RESEARCH.md §19): vd17-design (reference, требует GPU) против 3–5 лучших
БЕСПЛАТНЫХ лёгких CPU-кандидатов для VPS владельца (Ubuntu 24.04, 1 CPU, 2 GB RAM, без GPU).
Финалисты по итогам этапа 1 (§3–§5) и лицензионной политики (§2):
  * Silero CIS MIT (v5_cis_base, MIT) — представители: ru_aigul, ru_vika, ru_zara
    (все WER 0,011 по ASR round-trip; F0 197–210 Гц — «молодая взрослая женщина»);
  * RHVoice elena (GPL-3.0) и dasha-rus (CC BY-SA 4.0).

Скрипт запускается в GitHub Actions ЦЕЛИКОМ под `taskset -c 0` (одно ядро!) —
все секунды ниже это ЧЕСТНЫЕ измерения для 1-CPU VPS, а не экстраполяция.

Что делает:
  1) генерирует НЕДОСТАЮЩИЕ фразы для страницы сравнения (prototype/voice-compare.html):
     «Слушаю.» (c01), «Готово.» (c02), длинный ответ (c03 = текст x16) — для RHVoice;
     для Silero дополнительно недостающие базовые t02,t05,t07,t08,t09,t10
     (в git из этапа 1 опубликованы только t01,t03,t04,t06 — политика «компактного набора»);
  2) меряет: загрузку модели, RSS, время синтеза короткой/средней/длинной фразы каждым
     движком и голосом → out/vps-probe/vps_probe.json;
  3) конвертирует WAV → MP3 (моно 24 кГц 48 кбит/с — те же флаги, что collect.py).

Результат НЕ коммитится воркфлоу: всё уходит в артефакт vps-tts-compare; агент забирает
артефакт и кладёт MP3 в prototype/assets/voice-compare/, метрики — в research/tts/results/.

Запуск (Actions, ubuntu-latest, 4 vCPU — но скрипт pinned на 1 ядро):
    taskset -c 0 python research/tts/vps_compare.py
RHVoice должен быть собран и установлен (scons install) — см. .github/workflows/vps-tts-compare.yml.

Лицензии: Silero CIS — MIT (LICENSE_CIS); silero-stress — MIT; RHVoice — GPL/LGPL (код)
+ данные голосов: elena GPL-3.0, dasha-rus CC BY-SA 4.0. Коммерческое использование — да.
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUT = Path(os.environ.get("TTS_OUT", HERE / "out")) / "vps-compare"
PROBE_OUT = Path(os.environ.get("TTS_OUT", HERE / "out")) / "vps-probe"

SILERO_URL = "https://models.silero.ai/models/tts/ru/v5_cis_base.pt"
SILERO_CACHE = HERE / "models" / "silero"
SILERO_VOICES = ["ru_aigul", "ru_vika", "ru_zara"]  # WER 0,011; F0 203/197/211 Гц (§5, asr.json)
SR = 24000

RHVOICE_BIN = os.environ.get("RHVOICE_BIN", "RHVoice-test")
RHVOICE_VOICES = ["elena", "dasha-rus"]

# Фразы сравнения (идентичны между движками; тексты — из проектных наборов):
# c01/c02 = x03/x02 (phrases_vd17.json), c03 = x16 (длинный ответ).
PHRASES = {
    "c01": "Слушаю.",
    "c02": "Готово.",
    "c03": ("Я нашла три свободных слота на этой неделе. Ближайший — сегодня в восемнадцать "
            "тридцать, но он рядом с вашей встречей. Могу предложить завтра в десять утра — вам удобно?"),
    # недостающие базовые фразы для Silero (в git только t01,t03,t04,t06)
    "t02": "Сегодня у вас стоматолог в десять часов, а в четырнадцать нужно забрать посылку.",
    "t05": "Напомнить вам об этом за один час?",
    "t07": "Заправка добавлена: сорок два литра, три тысячи двести рублей.",
    "t08": "Я не совсем поняла команду. Повторите, пожалуйста.",
    "t09": "Через пятнадцать минут вам нужно выходить.",
    "t10": "Доброе утро, Алексей. На сегодня запланировано три дела.",
}
PROBE_PIDS = ["c02", "t03", "c03"]  # короткая / средняя / длинная
T03_TEXT = "Сегодня вы потратили три тысячи четыреста двадцать рублей."  # средняя (есть в git у всех)

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")


def to_mp3(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "24000",
                    "-codec:a", "libmp3lame", "-b:a", "48k", str(dst)], check=True)


def wav_from_samples(path: Path, audio, sr: int) -> float:
    """float32 → int16 WAV; возвращает длительность в секундах."""
    import numpy as np
    import wave

    x = np.asarray(audio, dtype=np.float32).reshape(-1)
    x = x / max(1.0, float(np.max(np.abs(x))) if x.size else 1.0)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    return round(x.size / sr, 3)


def rss_mb() -> float:
    import resource

    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)


def run_silero(probe: dict) -> None:
    import torch

    torch.set_num_threads(1)  # честный 1-CPU режим (скрипт и так под taskset -c 0)
    SILERO_CACHE.mkdir(parents=True, exist_ok=True)
    model_path = SILERO_CACHE / "v5_cis_base.pt"
    if not model_path.exists():
        print(f"[silero] скачиваю модель {SILERO_URL} …", flush=True)
        urllib.request.urlretrieve(SILERO_URL, model_path)

    from silero_stress import load_accentor

    accentor = load_accentor()
    t = time.perf_counter()
    model = torch.package.PackageImporter(str(model_path)).load_pickle("tts_models", "model")
    model.to(torch.device("cpu"))
    load_s = round(time.perf_counter() - t, 2)
    rss_model = rss_mb()
    print(f"[silero] модель загружена за {load_s} с; RSS после загрузки {rss_model} МБ", flush=True)

    info = {"model": "v5_cis_base (MIT)", "model_mb": round(model_path.stat().st_size / 1e6, 1),
            "load_s_1cpu": load_s, "rss_after_load_mb": rss_model, "threads": 1, "voices": {}}

    for voice in SILERO_VOICES:
        vdata = {}
        for pid, text in PHRASES.items():
            stressed = accentor(text)
            t = time.perf_counter()
            audio = model.apply_tts(text=stressed, speaker=voice, sample_rate=SR)
            synth_s = round(time.perf_counter() - t, 3)
            wav = OUT / "silero_cis_mit" / voice / f"{pid}.wav"
            dur = wav_from_samples(wav, audio.numpy(), SR)
            to_mp3(wav, wav.with_suffix(".mp3"))
            wav.unlink()
            if pid in PROBE_PIDS or pid == "t03" or pid == "c01":
                vdata[pid] = {"synth_s_1cpu": synth_s, "audio_s": dur,
                              "rtf_1cpu": round(synth_s / dur, 3) if dur else None}
            print(f"[silero] {voice} {pid}: synth={synth_s}s audio={dur}s", flush=True)
        # средняя фраза t03 — генерируем тоже (probe)
        t = time.perf_counter()
        audio = model.apply_tts(text=accentor(T03_TEXT), speaker=voice, sample_rate=SR)
        synth_s = round(time.perf_counter() - t, 3)
        wav = OUT / "silero_cis_mit" / voice / "t03.wav"
        dur = wav_from_samples(wav, audio.numpy(), SR)
        to_mp3(wav, wav.with_suffix(".mp3"))
        wav.unlink()
        vdata["t03"] = {"synth_s_1cpu": synth_s, "audio_s": dur, "rtf_1cpu": round(synth_s / dur, 3)}
        vdata["rss_peak_mb"] = rss_mb()
        info["voices"][voice] = vdata
    probe["silero_cis_mit"] = info


def wav_duration_s(path: Path) -> float:
    import wave

    with wave.open(str(path), "rb") as w:
        return round(w.getnframes() / w.getframerate(), 3)


def run_rhvoice(probe: dict) -> None:
    info = {"bin": RHVOICE_BIN, "per_request_process": True, "voices": {}}
    for voice in RHVOICE_VOICES:
        vdata = {}
        texts = dict(PHRASES)
        texts["t03"] = T03_TEXT
        for pid, text in texts.items():
            wav = OUT / "rhvoice" / voice / f"{pid}.wav"
            wav.parent.mkdir(parents=True, exist_ok=True)
            t = time.perf_counter()
            # тот же вызов, что в research/tts/server.py (движок RHVoice): процесс на запрос
            subprocess.run([RHVOICE_BIN, "-p", voice, "-r", "100", "-o", str(wav)],
                           input=text.encode("utf-8"), check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
            wall_s = round(time.perf_counter() - t, 3)
            dur = wav_duration_s(wav)
            to_mp3(wav, wav.with_suffix(".mp3"))
            wav.unlink()
            if pid in PROBE_PIDS or pid == "c01":
                vdata[pid] = {"wall_s_1cpu": wall_s, "audio_s": dur,
                              "rtf_1cpu": round(wall_s / dur, 3) if dur else None}
            print(f"[rhvoice] {voice} {pid}: wall={wall_s}s audio={dur}s", flush=True)
        # RSS процесса RHVoice-test (один прогон через /usr/bin/time)
        r = subprocess.run(["/usr/bin/time", "-f", "%M", RHVOICE_BIN, "-p", voice,
                            "-o", str(OUT / "rhvoice" / voice / "_rss.wav")],
                           input=PHRASES["c02"].encode("utf-8"), capture_output=True, timeout=60)
        rss = None
        for line in r.stderr.decode("utf-8", "ignore").splitlines():
            if line.strip().isdigit():
                rss = round(int(line.strip()) / 1024, 1)
        vdata["rss_mb"] = rss
        (OUT / "rhvoice" / voice / "_rss.wav").unlink(missing_ok=True)
        info["voices"][voice] = vdata
    probe["rhvoice"] = info


def main() -> None:
    probe = {
        "_comment": "Честная проба 1-CPU: весь скрипт выполнялся под taskset -c 0 (одно ядро), "
                    "torch.set_num_threads(1). Окружение — GitHub Actions runner (см. env).",
        "env": {"cpu": "1 ядро (taskset -c 0)", "runner_cores": os.cpu_count(),
                "machine": platform.machine(), "python": platform.python_version()},
    }
    err = []
    try:
        run_silero(probe)
    except Exception as e:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        err.append(f"silero: {type(e).__name__}: {e}")
    try:
        run_rhvoice(probe)
    except Exception as e:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        err.append(f"rhvoice: {type(e).__name__}: {e}")
    probe["errors"] = err

    PROBE_OUT.mkdir(parents=True, exist_ok=True)
    (PROBE_OUT / "vps_probe.json").write_text(
        json.dumps(probe, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n[vps-compare] MP3: {OUT}\n[vps-probe] {PROBE_OUT / 'vps_probe.json'}", flush=True)
    if err:
        sys.exit(1)


if __name__ == "__main__":
    main()
