"""Сборка результатов исследования TTS в прототип.

  python collect.py [<out_dir> ...]

1. Метрики out/metrics/*.json → research/tts/results/*.json, логи → results/logs/ (для ВСЕХ движков —
   исследование остаётся воспроизводимым и проверяемым, даже если аудио движка не публикуется).
2. Для каждого out/<engine>/<voice>/<pid>.wav, разрешённого политикой candidates.json → "publish":
   → prototype/assets/voice-samples/<engine>/<voice>/<pid>.mp3 (моно, 24 кГц, 48 кбит/с).
3. Чистка: MP3 в prototype/assets/voice-samples, не входящие в "publish", удаляются —
   workflow не вернёт в git лишние образцы.
4. manifest.js (window.AvenVoiceSamples) строится ЗАНОВО по реально существующим MP3
   + метрикам из research/tts/results.

Без аргументов — только чистка и пересборка манифеста по уже имеющимся файлам.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DST = REPO / "prototype" / "assets" / "voice-samples"
RESULTS = HERE / "results"
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
CAND = json.loads((HERE / "candidates.json").read_text(encoding="utf-8"))
PHR = json.loads((HERE / "phrases.json").read_text(encoding="utf-8"))
PUBLISH = {k: v for k, v in CAND.get("publish", {}).items() if not k.startswith("_")}
ALL_PIDS = [p["id"] for p in PHR["phrases"]]


def allowed(engine: str, voice: str, pid: str) -> bool:
    rule = PUBLISH.get(engine)
    if not rule:
        return False
    ok_v = rule["voices"] == "*" or voice in rule["voices"]
    ok_p = rule["phrases"] == "*" or pid in rule["phrases"]
    return ok_v and ok_p and pid in ALL_PIDS


def to_mp3(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "24000",
                    "-codec:a", "libmp3lame", "-b:a", "48k", str(dst)], check=True)


def import_outputs(out_dirs):
    RESULTS.mkdir(parents=True, exist_ok=True)
    for od in map(Path, out_dirs):
        for mf in (od / "metrics").glob("*.json"):
            shutil.copy(mf, RESULTS / mf.name)
        for lf in (od / "logs").glob("*"):
            (RESULTS / "logs").mkdir(parents=True, exist_ok=True)
            lines = lf.read_text(encoding="utf-8", errors="replace").splitlines()
            (RESULTS / "logs" / lf.name).write_text("\n".join(lines[-400:]) + "\n", encoding="utf-8")
        for wav in sorted(od.glob("*/*/*.wav")):
            engine, voice, pid = wav.parent.parent.name, wav.parent.name, wav.stem
            if engine not in ("metrics", "logs") and allowed(engine, voice, pid):
                to_mp3(wav, DST / engine / voice / f"{pid}.mp3")


def prune():
    removed = 0
    for mp3 in sorted(DST.glob("*/*/*.mp3")):
        if not allowed(mp3.parent.parent.name, mp3.parent.name, mp3.stem):
            mp3.unlink()
            removed += 1
    for d in sorted(DST.glob("*/*"), reverse=True) + sorted(DST.glob("*")):
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
    return removed


def build_manifest():
    metrics = {}
    for mf in RESULTS.glob("*.json"):
        d = json.loads(mf.read_text(encoding="utf-8"))
        if "engine" in d:
            metrics[d["engine"]] = d
    asr = {}
    if (RESULTS / "asr.json").exists():
        asr = json.loads((RESULTS / "asr.json").read_text(encoding="utf-8")).get("voices", {})
    voices = {}
    for mp3 in sorted(DST.glob("*/*/*.mp3")):
        engine, voice, pid = mp3.parent.parent.name, mp3.parent.name, mp3.stem
        key = f"{engine}/{voice}"
        meta = CAND["engines"].get(engine, {})
        md = metrics.get(engine, {}).get("voices", {}).get(voice, {})
        lic = CAND.get("voice_license", {}).get(key)
        v = voices.setdefault(key, {
            "engine": engine, "voice": voice, "phrases": [],
            "title": f"{meta.get('title', engine)} · {voice}",
            "engineTitle": meta.get("title", engine),
            "class": meta.get("class", ""),
            "license": lic[0] if lic else meta.get("license_weights", "?"),
            "commercial": lic[1] if lic else meta.get("commercial", "unclear"),
            "status": meta.get("status", ""),
            "f0": md.get("info", {}).get("f0_median_hz"),
            "summary": md.get("summary"),
            "probe": md.get("phrases", {}).get("probe"),
            "loadS": md.get("info", {}).get("load_s"),
            "env": metrics.get(engine, {}).get("env", {}),
            "asrWer": asr.get(key, {}).get("mean_wer"),
        })
        v["phrases"].append(pid)
    for v in voices.values():
        v["phrases"].sort()
        # full — все T1–T10; key — ключевые фразы (Silero CIS: T1/T3/T4/T6); t01 — только каталог
        v["phraseSet"] = "full" if len(v["phrases"]) == len(ALL_PIDS) else ("t01" if v["phrases"] == ["t01"] else "key")
        v["catalogueOnly"] = v["phraseSet"] == "t01"
    payload = {
        "_note": "Сгенерировано research/tts/collect.py по реально существующим MP3. Исследовательские образцы TTS — не production. "
                 "Состав — candidates.json → publish; полные метрики всех движков — research/tts/results.",
        "phrases": {p["id"]: {"text": p["text"], "speech": p["speech"]} for p in PHR["phrases"]},
        "voices": dict(sorted(voices.items())),
    }
    DST.mkdir(parents=True, exist_ok=True)
    (DST / "manifest.js").write_text(
        "/* Сгенерировано research/tts/collect.py — не редактировать вручную. */\n"
        "window.AvenVoiceSamples = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8")
    return voices


def main(out_dirs):
    import_outputs(out_dirs)
    removed = prune()
    voices = build_manifest()
    n = sum(len(v["phrases"]) for v in voices.values())
    print(f"removed (not in publish): {removed}; voices: {len(voices)}; mp3: {n} → {DST / 'manifest.js'}")


if __name__ == "__main__":
    main(sys.argv[1:])
