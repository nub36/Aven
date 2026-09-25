"""Локальная проверка gen_qwen3_name.py БЕЗ модели и без GPU (исследовательский тест, не production).

torch и qwen_tts подменяются заглушками, numpy — настоящий; генерируются синусоиды нужной длины.
Цель: поймать опечатки/ошибки потока управления до того, как прогон поедет в GitHub Actions
(12 минут CPU-раннера за каждый запуск).

  /tmp/venv/bin/python research/tts/tests/dryrun_name.py
"""
import json
import os
import sys
import types
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
OUT = Path(os.environ.get("TTS_OUT", "/tmp/tts-dryrun-out"))
sys.path.insert(0, str(RESEARCH))

# ---- заглушка torch ----
torch = types.ModuleType("torch")
torch.float32 = "float32"
torch.set_num_threads = lambda n: None
torch.manual_seed = lambda s: None
sys.modules["torch"] = torch

# ---- заглушка qwen_tts ----
CALLS = {"design": 0, "clone": 0, "prompt": 0, "loads": []}


class FakeModel:
    def __init__(self, name):
        self.name = name
        CALLS["loads"].append(name)

    @staticmethod
    def from_pretrained(name, device_map=None, dtype=None):
        return FakeModel(name)

    def _tone(self, text, sr=24000):
        dur = max(0.4, min(12.0, len(text) * 0.16))
        t = np.linspace(0, dur, int(sr * dur), endpoint=False)
        return (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32), sr

    def generate_voice_design(self, text=None, instruct=None, language=None):
        CALLS["design"] += 1
        assert instruct, "VoiceDesign без instruct"
        a, sr = self._tone(text)
        return [a], sr

    def create_voice_clone_prompt(self, ref_audio=None, ref_text=None, **kw):
        CALLS["prompt"] += 1
        assert ref_audio is not None and ref_text, "clone prompt без эталона"
        return {"ref_text": ref_text, "n": int(np.asarray(ref_audio[0]).size)}

    def generate_voice_clone(self, text=None, language=None, voice_clone_prompt=None, **kw):
        CALLS["clone"] += 1
        assert voice_clone_prompt, "clone без prompt"
        a, sr = self._tone(text)
        return [a], sr

    def get_supported_speakers(self):
        return ["Serena", "Vivian"]


qwen = types.ModuleType("qwen_tts")
qwen.Qwen3TTSModel = FakeModel
sys.modules["qwen_tts"] = qwen

os.environ["TTS_OUT"] = str(OUT)
os.environ["TTS_THREADS"] = "1"

import gen_qwen3_name  # noqa: E402  (запускается при импорте — это скрипт)

expected = {p["id"]: p["voice"] for p in gen_qwen3_name.NAME_PHRASES}
missing, extra = [], []
for pid, voice in expected.items():
    f = OUT / "qwen3" / voice / f"{pid}.wav"
    if not f.exists():
        missing.append(f"qwen3/{voice}/{pid}.wav")
got = sorted(str(p.relative_to(OUT)) for p in OUT.glob("qwen3/*/*.wav"))
want = sorted(f"qwen3/{v}/{k}.wav" for k, v in expected.items())
extra = sorted(set(got) - set(want))

met = json.loads((OUT / "metrics" / "qwen3_name.json").read_text(encoding="utf-8"))
voices = met["voices"]
errs = met["errors"]
phr = {v: sorted(d["phrases"].keys()) for v, d in voices.items()}

ok = True
print("загрузки моделей:", CALLS["loads"])
print("вызовы: design", CALLS["design"], "clone", CALLS["clone"], "prompt", CALLS["prompt"])
print("фраз по голосам:", json.dumps(phr, ensure_ascii=False))
print("wav:", len(got), "ожидалось", len(want))
if missing:
    ok = False
    print("НЕ ХВАТАЕТ:", missing)
if extra:
    ok = False
    print("ЛИШНИЕ:", extra)
if errs:
    ok = False
    print("ОШИБКИ В МЕТРИКАХ:", errs)
if CALLS["prompt"] != 2:
    ok = False
    print("clone prompt должен создаваться дважды (0.6B и 1.7B), а не", CALLS["prompt"])
# эталон n00 должен быть создан ДО клонов и тем же VoiceDesign
if "qwen3/vd17-design/n00.wav" not in got:
    ok = False
    print("нет эталонного клипа n00")
if not met.get("meta", {}).get("hint_prompt", "").startswith(met["meta"]["design_prompt"][:20]):
    ok = False
    print("hint_prompt не содержит design_prompt")
# summary считается и для n-фраз
for v, d in voices.items():
    if d["phrases"] and "summary" not in d and len(d["phrases"]) > 1:
        print(f"WARN: у {v} нет summary")
print("f0 у n00:", voices["vd17-design"]["phrases"]["n00"].get("f0_median_hz"))
print("ИТОГ:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
