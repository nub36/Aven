"""Движки с CLI: eSpeak NG (эталон «роботизированного» синтеза) и RHVoice.

  python gen_cli.py espeak
  python gen_cli.py rhvoice <путь к RHVoice-test> [голоса через запятую]

eSpeak NG (GPL-3.0) — формантный синтез; так звучит системный TTS браузера на
многих Linux-сборках. Это ориентир «как НЕ надо», не кандидат.
RHVoice — лёгкий параметрический (HTS) синтез; лицензии голосов разные
(elena — GPL-3.0, dasha-rus — CC BY-SA 4.0, anna/irina — не указана, остальные NC).
"""
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

import numpy as np

from common import Metrics, run_voice


def read_wav(path):
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return data.astype(np.float32) / 32768.0, sr


def cli_synth(cmd_builder):
    def synth(text):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "o.wav"
            subprocess.run(cmd_builder(out), input=text.encode("utf-8"), check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return read_wav(out)
    return synth


engine = sys.argv[1]
if engine == "espeak":
    m = Metrics("espeak", license="GPL-3.0", note="robotic baseline, not a candidate")
    try:
        run_voice(m, "espeak", "ru-f", cli_synth(lambda o: ["espeak-ng", "-v", "ru+f3", "-s", "160", "-w", str(o), "--stdin"]))
    except Exception as e:  # noqa: BLE001
        m.error(str(e))
    m.save()
elif engine == "rhvoice":
    exe = sys.argv[2]
    voices = (sys.argv[3] if len(sys.argv) > 3 else "elena,dasha-rus,anna,irina").split(",")
    lic = {"elena": "GPL-3.0", "dasha-rus": "CC BY-SA 4.0", "anna": "not stated", "irina": "not stated",
           "victoria": "CC BY-NC-ND 4.0", "tatiana": "CC BY-NC-ND 4.0", "arina": "CC BY-NC-ND 4.0",
           "lyudmila-rus": "CC BY-NC-SA 4.0"}
    m = Metrics("rhvoice", license="core LGPL-2.1+/GPL; voices vary", exe=exe)
    for v in voices:
        m.voice(v, voice_license=lic.get(v, "?"))
        try:
            run_voice(m, "rhvoice", v, cli_synth(lambda o, v=v: [exe, "-p", v, "-o", str(o)]))
        except Exception as e:  # noqa: BLE001
            m.error(f"{v}: {e}")
    m.save()
