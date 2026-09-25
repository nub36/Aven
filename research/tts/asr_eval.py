"""Объективная разборчивость образцов: ASR round-trip (faster-whisper small, CPU). Исследование.

  python asr_eval.py [engine ...]     # без аргументов — только клипы, которых ещё нет в results/asr.json

Для каждого prototype/assets/voice-samples/<engine>/<voice>/<pid>.mp3:
  распознаём Whisper'ом → цифры в гипотезе переводим в слова тем же нормализатором, что и прототип
  (node prototype/js/tts/normalize.js) → WER относительно текста для синтеза (phrases.json → speech).
Это НЕ оценка естественности: метрика ловит проглоченные/искажённые слова и числа, а не «роботность».
Одинаковый ASR для всех голосов → сравнение относительное.

Этап 2 (2026-09-25): в референс добавлен расширенный набор phrases_vd17.json (xNN). Сырая гипотеза
(поле hyp) нужна не только для WER, но и как объективная проверка произношения названия: слышит ли
ASR «Авен», «Авин» или «Эйвен» в четырёх вариантах нормализации.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SAMPLES = REPO / "prototype" / "assets" / "voice-samples"
OUTF = HERE / "results" / "asr.json"
PHR = {p["id"]: p for p in json.loads((HERE / "phrases.json").read_text(encoding="utf-8"))["phrases"]}
# Расширенный сценарный набор (vd17-design) — те же правила подсчёта.
PHR.update({p["id"]: p for p in json.loads((HERE / "phrases_vd17.json").read_text(encoding="utf-8"))["phrases"]})


def words(t: str) -> list[str]:
    t = t.lower().replace("ё", "е")
    return re.findall(r"[а-яa-z]+", t)


def wer(ref: list[str], hyp: list[str]) -> float:
    d = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, h in enumerate(hyp, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r != h))
            prev, d[j] = d[j], cur
    return d[len(hyp)] / max(1, len(ref))


def normalize_js(texts: list[str]) -> list[str]:
    js = ("const N=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d);"
          "process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s).map(t=>N.normalize(t)))));")
    r = subprocess.run(["node", "-e", js, str(REPO / "prototype" / "js" / "tts" / "normalize.js")],
                       input=json.dumps(texts), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def main(engines):
    from faster_whisper import WhisperModel

    res = json.loads(OUTF.read_text(encoding="utf-8")) if OUTF.exists() else {"model": "", "clips": {}}
    clips = res["clips"]
    todo = []
    for f in sorted(SAMPLES.glob("*/*/*.mp3")):
        key = f"{f.parent.parent.name}/{f.parent.name}/{f.stem}"
        if f.stem in PHR and (f.parent.parent.name in engines or key not in clips):
            todo.append((key, f))
    print(f"clips to evaluate: {len(todo)}", flush=True)
    if not todo:
        return
    model = WhisperModel("small", device="cpu", compute_type="int8")
    res["model"] = "faster-whisper small int8, language=ru, beam_size=5"
    hyps = []
    for key, f in todo:
        segs, _ = model.transcribe(str(f), language="ru", beam_size=5, condition_on_previous_text=False)
        hyps.append(" ".join(s.text.strip() for s in segs))
    norm = normalize_js(hyps)
    for (key, f), h, hn in zip(todo, hyps, norm):
        ref = PHR[f.stem]["speech"]
        clips[key] = {"hyp": h, "wer": round(wer(words(ref), words(hn)), 3)}
        print(f"{key}: WER {clips[key]['wer']:.2f} | {h}", flush=True)
    # сводка по голосам
    per = {}
    for key, c in clips.items():
        e, v, _ = key.split("/")
        per.setdefault(f"{e}/{v}", []).append(c["wer"])
    res["voices"] = {k: {"mean_wer": round(sum(x) / len(x), 3), "n": len(x)} for k, x in sorted(per.items())}
    OUTF.parent.mkdir(parents=True, exist_ok=True)
    OUTF.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
