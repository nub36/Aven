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
EXT = json.loads((HERE / "phrases_vd17.json").read_text(encoding="utf-8"))
PUBLISH = {k: v for k, v in CAND.get("publish", {}).items() if not k.startswith("_")}
ALL_PIDS = [p["id"] for p in PHR["phrases"]] + [p["id"] for p in EXT["phrases"]]


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


def extended_payload() -> dict:
    """Расширенный сценарный тест фаворита (research/tts/phrases_vd17.json) — для prototype/voice-lab-vd17.html.

    Берутся только реально существующие MP3: если прогон ещё не делался, страница честно
    показывает «образцов пока нет». Метрики ищутся по голосу во всех results/*.json
    (метрики расширенного прогона пишутся в results/qwen3_vd17.json).
    """
    engine, voice = EXT["engine"], EXT["voice"]
    out = {
        "engine": engine,
        "voice": voice,
        "title": f"{CAND['engines'].get(engine, {}).get('title', engine)} · {voice}",
        "groups": EXT["groups"],
        "phrases": {},
        "metrics": {},
        "asr": {},
        "env": None,
        "model": None,
    }
    p_by_id = {p["id"]: p for p in EXT["phrases"]}
    for pid in sorted(p_by_id):
        p = p_by_id[pid]
        if not (DST / engine / voice / f"{pid}.mp3").exists():
            continue
        out["phrases"][pid] = {
            "text": p["text"],
            "speech": p["speech"],
            "kind": p["kind"],
            "note": p.get("note", ""),
        }
    # метрики синтеза (из любого results/*.json, где есть этот голос и xNN-фразы)
    for mf in RESULTS.glob("*.json"):
        try:
            d = json.loads(mf.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        v = (d.get("voices") or {}).get(voice)
        if not v:
            continue
        for pid, mm in (v.get("phrases") or {}).items():
            if pid.startswith("x"):
                out["metrics"][pid] = {
                    "synth_s": mm.get("synth_s"),
                    "audio_s": mm.get("audio_s"),
                    "rtf": mm.get("rtf"),
                    "first_call": mm.get("first_call", False),
                }
        if out["metrics"]:
            out["env"] = d.get("env")
            out["model"] = (v.get("info") or {}).get("model")
    # разборчивость (ASR round-trip) — сырая гипотеза Whisper важна для проверки «Авен»
    asrf = RESULTS / "asr.json"
    if asrf.exists():
        clips = json.loads(asrf.read_text(encoding="utf-8")).get("clips", {})
        for pid in out["phrases"]:
            c = clips.get(f"{engine}/{voice}/{pid}")
            if c:
                out["asr"][pid] = {"hyp": c.get("hyp", ""), "wer": c.get("wer")}
    return out


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
        "extended": extended_payload(),
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
