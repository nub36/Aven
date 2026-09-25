"""Проверки целостности исследовательского набора TTS (не production).

  python research/tts/check.py

Что проверяется:
  1. phrases.json и phrases_vd17.json — уникальные id, есть text/speech, наборы не пересекаются.
  2. candidates.json → publish — голоса/фразы относятся к известным движкам.
  3. prototype/assets/voice-samples/manifest.js — разбирается, все ссылки на MP3 существуют,
     и на диске нет MP3, которых нет в манифесте/политике публикации.
  4. Расширенный набор vd17-design — если прогон сделан, все xNN из phrases_vd17.json есть в манифесте.

Код выхода: 0 — всё ок; 1 — есть ошибки (ворнинги не роняют проверку).
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SAMPLES = REPO / "prototype" / "assets" / "voice-samples"
MANIFEST = SAMPLES / "manifest.js"
CAND = json.loads((HERE / "candidates.json").read_text(encoding="utf-8"))
PHR = json.loads((HERE / "phrases.json").read_text(encoding="utf-8"))
EXT = json.loads((HERE / "phrases_vd17.json").read_text(encoding="utf-8"))
PUBLISH = {k: v for k, v in CAND.get("publish", {}).items() if not k.startswith("_")}

errors: list[str] = []
warns: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)
    print("ERROR:", msg)


def warn(msg: str) -> None:
    warns.append(msg)
    print("WARN: ", msg)


def check_phrases() -> None:
    for name, data in (("phrases.json", PHR), ("phrases_vd17.json", EXT)):
        seen = set()
        for p in data["phrases"]:
            if not p.get("text") or not p.get("speech"):
                err(f"{name}: у фразы {p.get('id')} нет text или speech")
            if p["id"] in seen:
                err(f"{name}: повтор id {p['id']}")
            seen.add(p["id"])
        print(f"{name}: {len(seen)} фраз")
    cross = {p["id"] for p in PHR["phrases"]} & {p["id"] for p in EXT["phrases"]}
    if cross:
        err(f"наборы фраз пересекаются: {sorted(cross)}")
    if PHR.get("lexicon", {}).get("Aven") != "Авен":
        warn("словарь произношения phrases.json: Aven → "
             f"{PHR.get('lexicon', {}).get('Aven')!r} (ожидалось «Авен»)")


def check_publish() -> None:
    for engine, rule in PUBLISH.items():
        if engine not in CAND["engines"]:
            err(f"publish: неизвестный движок {engine}")
            continue
        if rule.get("voices") != "*":
            for v in rule["voices"]:
                if not isinstance(v, str):
                    err(f"publish/{engine}: некорректное имя голоса {v!r}")
        print(f"publish: {engine} — голосов "
              f"{'все' if rule.get('voices') == '*' else len(rule['voices'])}, фраз "
              f"{'все' if rule.get('phrases') == '*' else len(rule['phrases'])}")


def load_manifest() -> dict:
    js = ("const fs=require('fs');global.window={};eval(fs.readFileSync(process.argv[1],'utf8'));"
          "process.stdout.write(JSON.stringify(window.AvenVoiceSamples));")
    r = subprocess.run(["node", "-e", js, str(MANIFEST)], capture_output=True, text=True)
    if r.returncode != 0:
        err(f"manifest.js не разбирается: {r.stderr.strip()[:300]}")
        return {}
    return json.loads(r.stdout)


def check_manifest(m: dict) -> None:
    on_disk = {f"{f.parent.parent.name}/{f.parent.name}/{f.stem}" for f in SAMPLES.glob("*/*/*.mp3")}
    referenced: set[str] = set()
    for key, v in (m.get("voices") or {}).items():
        # v.phrases — только общие для всех движков id; полный путь совпадает с ключом
        for pid in v["phrases"]:
            referenced.add(f"{key}/{pid}")
    ext = m.get("extended") or {}
    if ext.get("engine"):
        for pid in ext.get("phrases", {}):
            referenced.add(f"{ext['engine']}/{ext['voice']}/{pid}")
    missing = sorted(referenced - on_disk)
    orphan = sorted(on_disk - referenced)
    if missing:
        err(f"manifest ссылается на отсутствующие MP3 ({len(missing)}): {missing[:5]}")
    if orphan:
        err(f"MP3 на диске, которых нет в manifest ({len(orphan)}): {orphan[:5]}")
    print(f"manifest: голосов {len(m.get('voices') or {})}, ссылок {len(referenced)}, "
          f"MP3 на диске {len(on_disk)}")
    # политика публикации: запрещённые голоса не должны лежать в git
    for key in sorted(on_disk):
        engine, voice, pid = key.split("/")
        rule = PUBLISH.get(engine)
        if not rule:
            err(f"в git лежит MP3 движка, которого нет в publish: {key}")
            continue
        if rule["voices"] != "*" and voice not in rule["voices"]:
            err(f"в git лежит MP3 голоса вне publish: {key}")
        if rule["phrases"] != "*" and pid not in rule["phrases"]:
            err(f"в git лежит MP3 фразы вне publish: {key}")
    # расширенный набор
    want = [p["id"] for p in EXT["phrases"]]
    have = sorted((ext.get("phrases") or {}).keys())
    if have and have != sorted(want):
        warn(f"расширенный набор неполный: есть {len(have)} из {len(want)}")
    elif not have:
        warn("расширенный набор vd17-design ещё не сгенерирован (research/tts/results/qwen3_vd17.json "
             "и MP3 xNN отсутствуют) — запустите workflow с engines=qwen3-vd17")
    else:
        print(f"extended: {len(have)}/{len(want)} фраз vd17-design")


def main() -> int:
    check_phrases()
    check_publish()
    if not MANIFEST.exists():
        err(f"нет {MANIFEST}")
    else:
        m = load_manifest()
        if m:
            check_manifest(m)
    print(f"\nошибок: {len(errors)}, предупреждений: {len(warns)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
