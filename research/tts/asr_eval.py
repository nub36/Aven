"""Объективная разборчивость образцов: ASR round-trip (faster-whisper small, CPU). Исследование.

  python asr_eval.py [engine ...]     # без аргументов — только клипы, которых ещё нет в results/asr.json
  python asr_eval.py --derive         # БЕЗ распознавания: пересчитать производные метрики по сохранённым
                                      # гипотезам (полезно локально, faster-whisper не нужен)

Для каждого prototype/assets/voice-samples/<engine>/<voice>/<pid>.mp3:
  распознаём Whisper'ом → цифры в гипотезе переводятся в слова тем же нормализатором, что и прототип
  (node prototype/js/tts/normalize.js) → WER относительно текста для синтеза (phrases.json → speech).
Это НЕ оценка естественности: метрика ловит проглоченные/искажённые слова и числа, а не «роботность».
Одинаковый ASR для всех голосов → сравнение относительное.

Этап 2 (2026-09-25): в референс добавлен расширенный набор phrases_vd17.json (xNN). Сырая гипотеза
(поле hyp) нужна не только для WER, но и как объективная проверка произношения названия: слышит ли
ASR «Авен», «Авин» или «Эйвен» в четырёх вариантах нормализации.

Этап 2.1 (2026-09-25, мини-прогон способов произношения — phrases_name.json, nNN): добавлены
производные метрики, которые считаются из гипотезы и НЕ требуют повторного распознавания:
  hyp_norm — гипотеза после нормализатора чисел (то, с чем сравнивается WER);
  wer      — словесный WER относительно поданного в TTS текста (speech) — прежний смысл, не меняется;
  twer     — словесный WER относительно target («что хотим услышать»); для вариантов произношения
             имени target ≠ speech (в TTS подаётся «Авин», а услышать мы хотим «Авен»), поэтому
             сравнивать с поданным текстом бессмысленно;
  lwer     — то же на буквах (без пробелов/пунктуации): не наказывает ASR за разбиение «Авен» → «А вен»;
  name     — {letters, target, lwer}: буквы имени, вырезанные из гипотезы по якорям name_prev/name_after,
             и их расстояние до эталона «авен». Это главная метрика этапа 2.1: она показывает, ЧТО именно
             модель сказала вместо имени, независимо от остальной фразы.
Якоря ищутся нестрого (difflib + окно с минимальным расстоянием Левенштейна, допуск 3 буквы):
Whisper сам пишет с ошибками. Если якорь не найден — честно пишется name.error, а не «0%».
Вырезанные буквы сохраняются в результатах, поэтому каждую оценку можно проверить глазами по hyp.
"""
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SAMPLES = REPO / "prototype" / "assets" / "voice-samples"
OUTF = HERE / "results" / "asr.json"


def phrase_sets():
    sets = ["phrases.json", "phrases_vd17.json", "phrases_name.json"]
    out = {}
    for name in sets:
        f = HERE / name
        if not f.exists():
            continue
        for p in json.loads(f.read_text(encoding="utf-8"))["phrases"]:
            out[p["id"]] = p
    return out


PHR = phrase_sets()
NAME_DEFAULT = "авен"


def words(t: str) -> list[str]:
    t = t.lower().replace("ё", "е").replace("\u0301", "")
    return re.findall(r"[а-яa-z]+", t)


def letters(t: str) -> str:
    """Только буквы (ё→е, знак ударения и пунктуация/пробелы/цифры убираются)."""
    t = t.lower().replace("ё", "е").replace("\u0301", "")
    return "".join(re.findall(r"[а-яa-z]", t))


def edit_distance(a, b) -> int:
    """Расстояние Левенштейна — одинаково для строк (буквы) и списков (слова)."""
    if a == b:
        return 0
    if len(a) == 0:
        return len(b)
    if len(b) == 0:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


lev = edit_distance          # короткое имя для буквенных сравнений


def wer(ref: list[str], hyp: list[str]) -> float:
    return edit_distance(ref, hyp) / max(1, len(ref))


def anchor_window(h: str, anchor: str, side: str, tol: int = 3):
    """Окно в строке букв h, ближайшее к anchor.

    side="prev"  — самое ПОЗДНЕЕ подходящее окно (якорь стоит до имени);
    side="after" — самое РАННЕЕ (якорь стоит после имени).
    Возврат: (start, end) или None, если якорь не найден.
    """
    if not anchor:
        return (0, 0) if side == "prev" else (len(h), len(h))
    if not h:
        return None
    sm = difflib.SequenceMatcher(None, h, anchor, autojunk=False)
    mt = sm.find_longest_match(0, len(h), 0, len(anchor))
    if mt.size < max(3, len(anchor) // 3):
        return None
    guess = max(0, mt.a - mt.b)                     # предполагаемое начало окна
    best = None
    for length in range(max(1, len(anchor) - tol), min(len(h), len(anchor) + tol) + 1):
        for i in range(max(0, guess - tol - 1), min(len(h) - length, guess + tol + 1) + 1):
            d = lev(h[i:i + length], anchor)
            if d > tol:
                continue
            key = (d, i) if side == "after" else (d, -i)
            if best is None or key < best[0]:
                best = (key, i, i + length)
    return (best[1], best[2]) if best else None


def name_letters(hyp: str, p: dict):
    """Вырезать из гипотезы то, что сказано вместо имени. Возврат: (letters, error)."""
    h = letters(hyp)
    start = 0
    prev = p.get("name_prev") or ""
    if prev:
        pos = anchor_window(h, prev, "prev")
        if pos is None:
            return None, f"якорь «{prev}» не найден"
        start = pos[1]
    end = len(h)
    after = p.get("name_after") or ""
    if after:
        pos = anchor_window(h[start:], after, "after")
        if pos is None:
            return None, f"якорь «{after}» не найден"
        end = start + pos[0]
    if end <= start:
        return None, "имя не вырезалось (пустой фрагмент)"
    return h[start:end], None


def normalize_js(texts: list[str]) -> list[str]:
    js = ("const N=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d);"
          "process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s).map(t=>N.normalize(t)))));")
    r = subprocess.run(["node", "-e", js, str(REPO / "prototype" / "js" / "tts" / "normalize.js")],
                       input=json.dumps(texts), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def derive(clips: dict) -> int:
    """Пересчитать производные метрики по сохранённым гипотезам. Возвращает число изменённых клипов."""
    todo = [(k, c) for k, c in clips.items() if c.get("hyp") and k.split("/")[-1] in PHR]
    if not todo:
        return 0
    keys = [k for k, _ in todo]
    hyps = [c["hyp"] for _, c in todo]
    try:
        norms = normalize_js(hyps)
    except Exception as e:  # noqa: BLE001 — нормализатор недоступен, считаем без него
        print(f"normalize.js недоступен ({e}) — гипотезы не нормализуются", flush=True)
        norms = hyps
    changed = 0
    for k, c, hn in zip(keys, [c for _, c in todo], norms):
        p = PHR[k.split("/")[-1]]
        speech = p["speech"]
        target = p.get("target") or speech
        new = {"hyp_norm": hn}
        if "wer" not in c:                                   # прежний смысл: относительно speech
            new["wer"] = round(wer(words(speech), words(hn)), 3)
        if target != speech or "twer" not in c:
            new["twer"] = round(wer(words(target), words(hn)), 3)
        if "lwer" not in c:
            lt, lh = letters(target), letters(hn)
            new["lwer"] = round(lev(lt, lh) / max(1, len(lt)), 3)
        if p.get("name_prev") or p.get("name_after"):
            got, err = name_letters(hn, p)
            want = letters(p.get("name_target") or NAME_DEFAULT)
            new["name"] = ({"letters": got, "target": want,
                            "lwer": round(lev(want, got) / max(1, len(want)), 3)} if got
                           else {"error": err, "target": want})
        if any(c.get(f) != v for f, v in new.items()):
            changed += 1
        c.update(new)
    return changed


def main(engines, derive_only=False):
    res = json.loads(OUTF.read_text(encoding="utf-8")) if OUTF.exists() else {"model": "", "clips": {}}
    clips = res.setdefault("clips", {})

    if not derive_only:
        from faster_whisper import WhisperModel

        todo = []
        for f in sorted(SAMPLES.glob("*/*/*.mp3")):
            key = f"{f.parent.parent.name}/{f.parent.name}/{f.stem}"
            if f.stem in PHR and (f.parent.parent.name in engines or key not in clips):
                todo.append((key, f))
        print(f"clips to evaluate: {len(todo)}", flush=True)
        if todo:
            model = WhisperModel("small", device="cpu", compute_type="int8")
            res["model"] = "faster-whisper small int8, language=ru, beam_size=5"
            hyps = []
            for key, f in todo:
                segs, _ = model.transcribe(str(f), language="ru", beam_size=5, condition_on_previous_text=False)
                hyps.append(" ".join(s.text.strip() for s in segs))
            for (key, f), h in zip(todo, hyps):
                clips[key] = {"hyp": h}          # производные метрики досчитает derive()
                print(f"{key}: {h}", flush=True)

    changed = derive(clips)
    print(f"derived metrics: обновлено клипов {changed}", flush=True)

    # сводка по голосам
    per = {}
    for key, c in clips.items():
        e, v, _ = key.split("/")
        per.setdefault(f"{e}/{v}", []).append(c.get("wer", 0))
    res["voices"] = {k: {"mean_wer": round(sum(x) / len(x), 3), "n": len(x)} for k, x in sorted(per.items())}
    # сводка по произношению имени: среднее name.lwer у голосов, где оно посчитано
    names = {}
    for key, c in clips.items():
        nm = c.get("name")
        if not nm or nm.get("lwer") is None:
            continue
        e, v, _ = key.split("/")
        names.setdefault(f"{e}/{v}", []).append(nm["lwer"])
    res["name_pronunciation"] = {
        k: {"mean_name_lwer": round(sum(x) / len(x), 3), "n": len(x),
            "exact": sum(1 for i in x if i == 0)}
        for k, x in sorted(names.items())
    }
    OUTF.parent.mkdir(parents=True, exist_ok=True)
    OUTF.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"→ {OUTF}", flush=True)


if __name__ == "__main__":
    args = sys.argv[1:]
    derive_only = "--derive" in args
    main({a for a in args if not a.startswith("--")}, derive_only=derive_only)
