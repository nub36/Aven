"""Сборка результатов исследования TTS в прототип.

  python collect.py <out_dir> [<out_dir> ...]

Для каждого out/<engine>/<voice>/<pid>.wav:
  → prototype/assets/voice-samples/<engine>/<voice>/<pid>.mp3 (моно, 48 кбит/с)
Метрики out/metrics/*.json → research/tts/results/*.json
Манифест → prototype/assets/voice-samples/manifest.js (window.AvenVoiceSamples)
Существующие записи манифеста сохраняются (можно собирать по частям).
"""
import json
import os
import re
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


def load_manifest():
    f = DST / "manifest.js"
    if not f.exists():
        return {}
    txt = f.read_text(encoding="utf-8")
    m = re.search(r"window\.AvenVoiceSamples\s*=\s*(\{.*\});?\s*$", txt, re.S)
    return json.loads(m.group(1)).get("voices", {}) if m else {}


def to_mp3(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "24000",
                    "-codec:a", "libmp3lame", "-b:a", "48k", str(dst)], check=True)


def main(out_dirs):
    voices = load_manifest()
    RESULTS.mkdir(parents=True, exist_ok=True)
    metrics = {}
    for od in map(Path, out_dirs):
        for mf in (od / "metrics").glob("*.json"):
            d = json.loads(mf.read_text(encoding="utf-8"))
            metrics[d["engine"]] = d
            shutil.copy(mf, RESULTS / mf.name)
    for od in map(Path, out_dirs):
        for wav in sorted(od.glob("*/*/*.wav")):
            engine, voice, pid = wav.parent.parent.name, wav.parent.name, wav.stem
            if engine == "metrics":
                continue
            to_mp3(wav, DST / engine / voice / f"{pid}.mp3")
            key = f"{engine}/{voice}"
            meta = CAND["engines"].get(engine, {})
            md = metrics.get(engine, {}).get("voices", {}).get(voice, {})
            lic = CAND.get("voice_license", {}).get(key)
            v = voices.setdefault(key, {"engine": engine, "voice": voice, "phrases": []})
            v.update({
                "title": f"{meta.get('title', engine)} · {voice}",
                "engineTitle": meta.get("title", engine),
                "class": meta.get("class", ""),
                "license": lic[0] if lic else meta.get("license_weights", "?"),
                "commercial": lic[1] if lic else meta.get("commercial", "unclear"),
                "status": meta.get("status", ""),
                "catalogueOnly": bool(md.get("info", {}).get("catalogue_only", False)),
                "f0": md.get("info", {}).get("f0_median_hz"),
                "summary": md.get("summary"),
                "probe": md.get("phrases", {}).get("probe"),
                "loadS": md.get("info", {}).get("load_s"),
                "env": metrics.get(engine, {}).get("env", {}),
            })
            if pid not in v["phrases"]:
                v["phrases"].append(pid)
                v["phrases"].sort()
    for v in voices.values():
        v["catalogueOnly"] = len(v["phrases"]) < len(PHR["phrases"])
    payload = {
        "_note": "Сгенерировано research/tts/collect.py. Исследовательские образцы TTS — не production.",
        "phrases": {p["id"]: {"text": p["text"], "speech": p["speech"]} for p in PHR["phrases"]},
        "voices": dict(sorted(voices.items())),
    }
    DST.mkdir(parents=True, exist_ok=True)
    (DST / "manifest.js").write_text(
        "/* Сгенерировано research/tts/collect.py — не редактировать вручную. */\n"
        "window.AvenVoiceSamples = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8")
    print(f"voices: {len(voices)} → {DST / 'manifest.js'}")


if __name__ == "__main__":
    main(sys.argv[1:] or [str(HERE / "out")])
