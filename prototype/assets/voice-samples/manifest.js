/* Сгенерировано research/tts/collect.py — не редактировать вручную. */
window.AvenVoiceSamples = {
 "_note": "Сгенерировано research/tts/collect.py по реально существующим MP3. Исследовательские образцы TTS — не production. Состав — candidates.json → publish; полные метрики всех движков — research/tts/results.",
 "phrases": {
  "t01": {
   "text": "Здравствуйте. Я Aven, ваш персональный помощник. Чем могу помочь?",
   "speech": "Здравствуйте. Я Авен, ваш персональный помощник. Чем могу помочь?"
  },
  "t02": {
   "text": "Сегодня у вас стоматолог в десять часов, а в четырнадцать нужно забрать посылку.",
   "speech": "Сегодня у вас стоматолог в десять часов, а в четырнадцать нужно забрать посылку."
  },
  "t03": {
   "text": "Сегодня вы потратили три тысячи четыреста двадцать рублей.",
   "speech": "Сегодня вы потратили три тысячи четыреста двадцать рублей."
  },
  "t04": {
   "text": "Текущий пробег автомобиля — сто четыре тысячи пятьсот двадцать километров.",
   "speech": "Текущий пробег автомобиля — сто четыре тысячи пятьсот двадцать километров."
  },
  "t05": {
   "text": "Напомнить вам об этом за один час?",
   "speech": "Напомнить вам об этом за один час?"
  },
  "t06": {
   "text": "Хорошо. Я напомню вам в девять часов тридцать минут.",
   "speech": "Хорошо. Я напомню вам в девять часов тридцать минут."
  },
  "t07": {
   "text": "Заправка добавлена: сорок два литра, три тысячи двести рублей.",
   "speech": "Заправка добавлена: сорок два литра, три тысячи двести рублей."
  },
  "t08": {
   "text": "Я не совсем поняла команду. Повторите, пожалуйста.",
   "speech": "Я не совсем поняла команду. Повторите, пожалуйста."
  },
  "t09": {
   "text": "Через пятнадцать минут вам нужно выходить.",
   "speech": "Через пятнадцать минут вам нужно выходить."
  },
  "t10": {
   "text": "Доброе утро, Алексей. На сегодня запланировано три дела.",
   "speech": "Доброе утро, Алексей. На сегодня запланировано три дела."
  }
 },
 "voices": {
  "chatterbox/clone-silero-karina": {
   "engine": "chatterbox",
   "voice": "clone-silero-karina",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Chatterbox Multilingual · clone-silero-karina",
   "engineTitle": "Chatterbox Multilingual",
   "class": "C — крупный нейросетевой, желательно GPU",
   "license": "MIT",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 230.8,
   "summary": {
    "median_synth_s": 24.952,
    "median_rtf": 5.129,
    "max_synth_s": 27.406
   },
   "probe": {
    "synth_s": 15.587,
    "audio_s": 2.68,
    "rtf": 5.816,
    "first_call": false
   },
   "loadS": 29.37,
   "env": {
    "cpu": "AMD EPYC 9V45 96-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000275",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "chatterbox/default": {
   "engine": "chatterbox",
   "voice": "default",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Chatterbox Multilingual · default",
   "engineTitle": "Chatterbox Multilingual",
   "class": "C — крупный нейросетевой, желательно GPU",
   "license": "MIT",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 173.9,
   "summary": {
    "median_synth_s": 22.299,
    "median_rtf": 5.179,
    "max_synth_s": 24.68
   },
   "probe": {
    "synth_s": 10.977,
    "audio_s": 1.4,
    "rtf": 7.841,
    "first_call": false
   },
   "loadS": 29.37,
   "env": {
    "cpu": "AMD EPYC 9V45 96-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000275",
    "python": "3.11.16"
   },
   "asrWer": 0.147,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "espeak/ru-f": {
   "engine": "espeak",
   "voice": "ru-f",
   "phrases": [
    "t01",
    "t03"
   ],
   "title": "eSpeak NG (формантный) · ru-f",
   "engineTitle": "eSpeak NG (формантный)",
   "class": "A — ориентир «роботизированного» системного TTS",
   "license": "—",
   "commercial": "yes",
   "status": "baseline",
   "f0": 216.2,
   "summary": {
    "median_synth_s": 0.015,
    "median_rtf": 0.004,
    "max_synth_s": 0.016
   },
   "probe": {
    "synth_s": 0.012,
    "audio_s": 0.731,
    "rtf": 0.016,
    "first_call": false
   },
   "loadS": null,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000245",
    "python": "3.11.16"
   },
   "asrWer": 0.943,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "qwen3/base06-clone": {
   "engine": "qwen3",
   "voice": "base06-clone",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Qwen3-TTS (0.6B / 1.7B) · base06-clone",
   "engineTitle": "Qwen3-TTS (0.6B / 1.7B)",
   "class": "C — крупный нейросетевой, желательно GPU",
   "license": "Apache-2.0",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 296.3,
   "summary": {
    "median_synth_s": 23.845,
    "median_rtf": 6.409,
    "max_synth_s": 30.578
   },
   "probe": {
    "synth_s": 9.04,
    "audio_s": 1.04,
    "rtf": 8.692,
    "first_call": false
   },
   "loadS": 12.9,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000241",
    "python": "3.11.16"
   },
   "asrWer": 0.008,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "qwen3/cv06-ono_anna": {
   "engine": "qwen3",
   "voice": "cv06-ono_anna",
   "phrases": [
    "t01"
   ],
   "title": "Qwen3-TTS (0.6B / 1.7B) · cv06-ono_anna",
   "engineTitle": "Qwen3-TTS (0.6B / 1.7B)",
   "class": "C — крупный нейросетевой, желательно GPU",
   "license": "Apache-2.0",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 252.6,
   "summary": null,
   "probe": null,
   "loadS": 18.91,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000241",
    "python": "3.11.16"
   },
   "asrWer": 0.111,
   "phraseSet": "t01",
   "catalogueOnly": true
  },
  "qwen3/cv06-serena": {
   "engine": "qwen3",
   "voice": "cv06-serena",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Qwen3-TTS (0.6B / 1.7B) · cv06-serena",
   "engineTitle": "Qwen3-TTS (0.6B / 1.7B)",
   "class": "C — крупный нейросетевой, желательно GPU",
   "license": "Apache-2.0",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 243.7,
   "summary": {
    "median_synth_s": 24.41,
    "median_rtf": 5.651,
    "max_synth_s": 33.514
   },
   "probe": {
    "synth_s": 9.079,
    "audio_s": 1.6,
    "rtf": 5.674,
    "first_call": false
   },
   "loadS": 18.91,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000241",
    "python": "3.11.16"
   },
   "asrWer": 0.022,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "qwen3/cv06-sohee": {
   "engine": "qwen3",
   "voice": "cv06-sohee",
   "phrases": [
    "t01"
   ],
   "title": "Qwen3-TTS (0.6B / 1.7B) · cv06-sohee",
   "engineTitle": "Qwen3-TTS (0.6B / 1.7B)",
   "class": "C — крупный нейросетевой, желательно GPU",
   "license": "Apache-2.0",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 223.3,
   "summary": null,
   "probe": null,
   "loadS": 18.91,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000241",
    "python": "3.11.16"
   },
   "asrWer": 0.111,
   "phraseSet": "t01",
   "catalogueOnly": true
  },
  "qwen3/cv06-vivian": {
   "engine": "qwen3",
   "voice": "cv06-vivian",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Qwen3-TTS (0.6B / 1.7B) · cv06-vivian",
   "engineTitle": "Qwen3-TTS (0.6B / 1.7B)",
   "class": "C — крупный нейросетевой, желательно GPU",
   "license": "Apache-2.0",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 282.4,
   "summary": {
    "median_synth_s": 24.739,
    "median_rtf": 5.6,
    "max_synth_s": 53.138
   },
   "probe": {
    "synth_s": 6.818,
    "audio_s": 1.2,
    "rtf": 5.682,
    "first_call": false
   },
   "loadS": 18.91,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000241",
    "python": "3.11.16"
   },
   "asrWer": 0.033,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "qwen3/vd17-design": {
   "engine": "qwen3",
   "voice": "vd17-design",
   "phrases": [
    "t01",
    "x00",
    "x01",
    "x02",
    "x03",
    "x04",
    "x05",
    "x06",
    "x07",
    "x08",
    "x09",
    "x10",
    "x11",
    "x12",
    "x13",
    "x14",
    "x15",
    "x16",
    "x17",
    "x18",
    "x19",
    "x20"
   ],
   "title": "Qwen3-TTS (0.6B / 1.7B) · vd17-design",
   "engineTitle": "Qwen3-TTS (0.6B / 1.7B)",
   "class": "C — крупный нейросетевой, желательно GPU",
   "license": "Apache-2.0",
   "commercial": "yes",
   "status": "shortlist",
   "f0": null,
   "summary": null,
   "probe": null,
   "loadS": 22.65,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000241",
    "python": "3.11.16"
   },
   "asrWer": 0.285,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "rhvoice/dasha-rus": {
   "engine": "rhvoice",
   "voice": "dasha-rus",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "RHVoice (параметрический HTS) · dasha-rus",
   "engineTitle": "RHVoice (параметрический HTS)",
   "class": "B — очень лёгкий, CPU, офлайн",
   "license": "CC BY-SA 4.0",
   "commercial": "yes",
   "status": "baseline",
   "f0": 218.2,
   "summary": {
    "median_synth_s": 0.21,
    "median_rtf": 0.056,
    "max_synth_s": 0.354
   },
   "probe": {
    "synth_s": 0.113,
    "audio_s": 0.74,
    "rtf": 0.152,
    "first_call": false
   },
   "loadS": null,
   "env": {
    "cpu": "Intel(R) Xeon(R) Processor @ 2.60GHz",
    "cores": 2,
    "ram_gb": 3.8,
    "gpu": "none",
    "runner": "e2b.local",
    "python": "3.11.2"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "rhvoice/elena": {
   "engine": "rhvoice",
   "voice": "elena",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "RHVoice (параметрический HTS) · elena",
   "engineTitle": "RHVoice (параметрический HTS)",
   "class": "B — очень лёгкий, CPU, офлайн",
   "license": "GPL-3.0",
   "commercial": "yes",
   "status": "baseline",
   "f0": 200.0,
   "summary": {
    "median_synth_s": 0.261,
    "median_rtf": 0.076,
    "max_synth_s": 0.343
   },
   "probe": {
    "synth_s": 0.123,
    "audio_s": 0.595,
    "rtf": 0.207,
    "first_call": false
   },
   "loadS": null,
   "env": {
    "cpu": "Intel(R) Xeon(R) Processor @ 2.60GHz",
    "cores": 2,
    "ram_gb": 3.8,
    "gpu": "none",
    "runner": "e2b.local",
    "python": "3.11.2"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_aigul": {
   "engine": "silero_cis_mit",
   "voice": "ru_aigul",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_aigul",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 203.4,
   "summary": {
    "median_synth_s": 0.26,
    "median_rtf": 0.056,
    "max_synth_s": 0.341
   },
   "probe": {
    "synth_s": 0.069,
    "audio_s": 0.975,
    "rtf": 0.071,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_albina": {
   "engine": "silero_cis_mit",
   "voice": "ru_albina",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_albina",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 175.2,
   "summary": {
    "median_synth_s": 0.254,
    "median_rtf": 0.057,
    "max_synth_s": 0.327
   },
   "probe": {
    "synth_s": 0.068,
    "audio_s": 0.938,
    "rtf": 0.072,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_alfia": {
   "engine": "silero_cis_mit",
   "voice": "ru_alfia",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_alfia",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 208.7,
   "summary": {
    "median_synth_s": 0.224,
    "median_rtf": 0.057,
    "max_synth_s": 0.303
   },
   "probe": {
    "synth_s": 0.065,
    "audio_s": 0.912,
    "rtf": 0.072,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_alfia2": {
   "engine": "silero_cis_mit",
   "voice": "ru_alfia2",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_alfia2",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 208.7,
   "summary": {
    "median_synth_s": 0.258,
    "median_rtf": 0.056,
    "max_synth_s": 0.351
   },
   "probe": {
    "synth_s": 0.068,
    "audio_s": 1.0,
    "rtf": 0.068,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_ekaterina": {
   "engine": "silero_cis_mit",
   "voice": "ru_ekaterina",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_ekaterina",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 224.3,
   "summary": {
    "median_synth_s": 0.22,
    "median_rtf": 0.057,
    "max_synth_s": 0.286
   },
   "probe": {
    "synth_s": 0.071,
    "audio_s": 0.988,
    "rtf": 0.072,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.033,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_karina": {
   "engine": "silero_cis_mit",
   "voice": "ru_karina",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_karina",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 233.0,
   "summary": {
    "median_synth_s": 0.236,
    "median_rtf": 0.057,
    "max_synth_s": 0.3
   },
   "probe": {
    "synth_s": 0.067,
    "audio_s": 0.95,
    "rtf": 0.071,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_kermen": {
   "engine": "silero_cis_mit",
   "voice": "ru_kermen",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_kermen",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 222.2,
   "summary": {
    "median_synth_s": 0.218,
    "median_rtf": 0.058,
    "max_synth_s": 0.283
   },
   "probe": {
    "synth_s": 0.065,
    "audio_s": 0.887,
    "rtf": 0.074,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.03,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_nurgul": {
   "engine": "silero_cis_mit",
   "voice": "ru_nurgul",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_nurgul",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 195.1,
   "summary": {
    "median_synth_s": 0.298,
    "median_rtf": 0.056,
    "max_synth_s": 0.409
   },
   "probe": {
    "synth_s": 0.07,
    "audio_s": 0.988,
    "rtf": 0.071,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_oksana": {
   "engine": "silero_cis_mit",
   "voice": "ru_oksana",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_oksana",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 230.8,
   "summary": {
    "median_synth_s": 0.267,
    "median_rtf": 0.057,
    "max_synth_s": 0.332
   },
   "probe": {
    "synth_s": 0.068,
    "audio_s": 1.0,
    "rtf": 0.068,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.024,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_onaoy": {
   "engine": "silero_cis_mit",
   "voice": "ru_onaoy",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_onaoy",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 224.3,
   "summary": {
    "median_synth_s": 0.266,
    "median_rtf": 0.057,
    "max_synth_s": 0.362
   },
   "probe": {
    "synth_s": 0.069,
    "audio_s": 0.975,
    "rtf": 0.071,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_ramilia": {
   "engine": "silero_cis_mit",
   "voice": "ru_ramilia",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_ramilia",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 186.0,
   "summary": {
    "median_synth_s": 0.292,
    "median_rtf": 0.056,
    "max_synth_s": 0.389
   },
   "probe": {
    "synth_s": 0.07,
    "audio_s": 0.988,
    "rtf": 0.071,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_saida": {
   "engine": "silero_cis_mit",
   "voice": "ru_saida",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_saida",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 218.2,
   "summary": {
    "median_synth_s": 0.236,
    "median_rtf": 0.058,
    "max_synth_s": 0.317
   },
   "probe": {
    "synth_s": 0.067,
    "audio_s": 0.925,
    "rtf": 0.073,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_vika": {
   "engine": "silero_cis_mit",
   "voice": "ru_vika",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_vika",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 196.7,
   "summary": {
    "median_synth_s": 0.236,
    "median_rtf": 0.057,
    "max_synth_s": 0.323
   },
   "probe": {
    "synth_s": 0.069,
    "audio_s": 0.963,
    "rtf": 0.071,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_zara": {
   "engine": "silero_cis_mit",
   "voice": "ru_zara",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zara",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 210.5,
   "summary": {
    "median_synth_s": 0.243,
    "median_rtf": 0.057,
    "max_synth_s": 0.318
   },
   "probe": {
    "synth_s": 0.065,
    "audio_s": 0.925,
    "rtf": 0.071,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_zhadyra": {
   "engine": "silero_cis_mit",
   "voice": "ru_zhadyra",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zhadyra",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 199.2,
   "summary": {
    "median_synth_s": 0.242,
    "median_rtf": 0.057,
    "max_synth_s": 0.305
   },
   "probe": {
    "synth_s": 0.064,
    "audio_s": 0.9,
    "rtf": 0.071,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_zhazira": {
   "engine": "silero_cis_mit",
   "voice": "ru_zhazira",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zhazira",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 222.2,
   "summary": {
    "median_synth_s": 0.232,
    "median_rtf": 0.057,
    "max_synth_s": 0.302
   },
   "probe": {
    "synth_s": 0.064,
    "audio_s": 0.875,
    "rtf": 0.073,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "silero_cis_mit/ru_zinaida": {
   "engine": "silero_cis_mit",
   "voice": "ru_zinaida",
   "phrases": [
    "t01",
    "t03",
    "t04",
    "t06"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zinaida",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 195.1,
   "summary": {
    "median_synth_s": 0.228,
    "median_rtf": 0.057,
    "max_synth_s": 0.304
   },
   "probe": {
    "synth_s": 0.063,
    "audio_s": 0.875,
    "rtf": 0.072,
    "first_call": false
   },
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.022,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "supertonic/F1": {
   "engine": "supertonic",
   "voice": "F1",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Supertonic 3 (F1–F5) · F1",
   "engineTitle": "Supertonic 3 (F1–F5)",
   "class": "D — ONNX, CPU / браузер WebGPU/WASM",
   "license": "OpenRAIL-M (коммерция разрешена, есть use-based ограничения)",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 185.3,
   "summary": {
    "median_synth_s": 2.269,
    "median_rtf": 0.47,
    "max_synth_s": 2.729
   },
   "probe": {
    "synth_s": 0.957,
    "audio_s": 1.393,
    "rtf": 0.687,
    "first_call": false
   },
   "loadS": 6.62,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000243",
    "python": "3.11.16"
   },
   "asrWer": 0.024,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "supertonic/F2": {
   "engine": "supertonic",
   "voice": "F2",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Supertonic 3 (F1–F5) · F2",
   "engineTitle": "Supertonic 3 (F1–F5)",
   "class": "D — ONNX, CPU / браузер WebGPU/WASM",
   "license": "OpenRAIL-M (коммерция разрешена, есть use-based ограничения)",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 198.6,
   "summary": {
    "median_synth_s": 2.246,
    "median_rtf": 0.469,
    "max_synth_s": 2.646
   },
   "probe": {
    "synth_s": 1.036,
    "audio_s": 1.324,
    "rtf": 0.783,
    "first_call": false
   },
   "loadS": 6.62,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000243",
    "python": "3.11.16"
   },
   "asrWer": 0.027,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "supertonic/F3": {
   "engine": "supertonic",
   "voice": "F3",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Supertonic 3 (F1–F5) · F3",
   "engineTitle": "Supertonic 3 (F1–F5)",
   "class": "D — ONNX, CPU / браузер WebGPU/WASM",
   "license": "OpenRAIL-M (коммерция разрешена, есть use-based ограничения)",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 183.8,
   "summary": {
    "median_synth_s": 2.349,
    "median_rtf": 0.463,
    "max_synth_s": 2.969
   },
   "probe": {
    "synth_s": 0.953,
    "audio_s": 1.463,
    "rtf": 0.651,
    "first_call": false
   },
   "loadS": 6.62,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000243",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "supertonic/F4": {
   "engine": "supertonic",
   "voice": "F4",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Supertonic 3 (F1–F5) · F4",
   "engineTitle": "Supertonic 3 (F1–F5)",
   "class": "D — ONNX, CPU / браузер WebGPU/WASM",
   "license": "OpenRAIL-M (коммерция разрешена, есть use-based ограничения)",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 207.0,
   "summary": {
    "median_synth_s": 1.92,
    "median_rtf": 0.464,
    "max_synth_s": 2.382
   },
   "probe": {
    "synth_s": 0.94,
    "audio_s": 1.254,
    "rtf": 0.749,
    "first_call": false
   },
   "loadS": 6.62,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000243",
    "python": "3.11.16"
   },
   "asrWer": 0.019,
   "phraseSet": "key",
   "catalogueOnly": false
  },
  "supertonic/F5": {
   "engine": "supertonic",
   "voice": "F5",
   "phrases": [
    "t01",
    "t02",
    "t03",
    "t04",
    "t05",
    "t06",
    "t07",
    "t08",
    "t09",
    "t10"
   ],
   "title": "Supertonic 3 (F1–F5) · F5",
   "engineTitle": "Supertonic 3 (F1–F5)",
   "class": "D — ONNX, CPU / браузер WebGPU/WASM",
   "license": "OpenRAIL-M (коммерция разрешена, есть use-based ограничения)",
   "commercial": "yes",
   "status": "shortlist",
   "f0": 165.2,
   "summary": {
    "median_synth_s": 2.257,
    "median_rtf": 0.47,
    "max_synth_s": 2.694
   },
   "probe": {
    "synth_s": 0.955,
    "audio_s": 1.324,
    "rtf": 0.722,
    "first_call": false
   },
   "loadS": 6.62,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000243",
    "python": "3.11.16"
   },
   "asrWer": 0.011,
   "phraseSet": "key",
   "catalogueOnly": false
  }
 },
 "extended": {
  "engine": "qwen3",
  "voice": "vd17-design",
  "title": "Qwen3-TTS (0.6B / 1.7B) · vd17-design",
  "groups": [
   {
    "id": "consistency",
    "title": "Стабильность голоса между вызовами"
   },
   {
    "id": "dialog",
    "title": "Короткие реплики диалога"
   },
   {
    "id": "reminder",
    "title": "Напоминания, время, даты"
   },
   {
    "id": "money",
    "title": "Деньги и траты"
   },
   {
    "id": "car",
    "title": "Автомобиль: пробег, заправка, ТО"
   },
   {
    "id": "question",
    "title": "Вопросительная реплика"
   },
   {
    "id": "warning",
    "title": "Важное предупреждение"
   },
   {
    "id": "long",
    "title": "Развёрнутый ответ (2–3 предложения)"
   },
   {
    "id": "name",
    "title": "Произношение названия «Aven / Авен»"
   }
  ],
  "phrases": {
   "x00": {
    "text": "Здравствуйте. Я Aven, ваш персональный помощник. Чем могу помочь?",
    "speech": "Здравствуйте. Я Авен, ваш персональный помощник. Чем могу помочь?",
    "kind": "consistency",
    "note": "Тот же текст, что у базовой фразы T01, но сгенерирован отдельным вызовом 1.7B-VoiceDesign. Если тембр/манера заметно отличаются от сохранённого образца qwen3/vd17-design/t01.mp3 — модель не даёт стабильного голоса между вызовами, и для продукта нужен клон (0.6B/1.7B-Base) по эталонному клипу."
   },
   "x01": {
    "text": "Добрый день, Алексей. Чем помочь?",
    "speech": "Добрый день, Алексей. Чем помочь?",
    "kind": "dialog",
    "note": ""
   },
   "x02": {
    "text": "Готово.",
    "speech": "Готово.",
    "kind": "dialog",
    "note": ""
   },
   "x03": {
    "text": "Слушаю.",
    "speech": "Слушаю.",
    "kind": "dialog",
    "note": ""
   },
   "x04": {
    "text": "Напоминание создано.",
    "speech": "Напоминание создано.",
    "kind": "dialog",
    "note": ""
   },
   "x05": {
    "text": "Завтра в 7:30 не забудьте взять документы.",
    "speech": "Завтра в семь тридцать не забудьте взять документы.",
    "kind": "reminder",
    "note": ""
   },
   "x06": {
    "text": "Через 20 минут нужно выключить духовку.",
    "speech": "Через двадцать минут нужно выключить духовку.",
    "kind": "reminder",
    "note": ""
   },
   "x07": {
    "text": "Сегодня вы потратили 12 850 рублей.",
    "speech": "Сегодня вы потратили двенадцать тысяч восемьсот пятьдесят рублей.",
    "kind": "money",
    "note": ""
   },
   "x08": {
    "text": "Записала 850 рублей в категорию Продукты.",
    "speech": "Записала восемьсот пятьдесят рублей в категорию Продукты.",
    "kind": "money",
    "note": ""
   },
   "x09": {
    "text": "Следующая встреча сегодня в 18:30.",
    "speech": "Следующая встреча сегодня в восемнадцать тридцать.",
    "kind": "reminder",
    "note": ""
   },
   "x10": {
    "text": "Пробег автомобиля — 104 520 километров.",
    "speech": "Пробег автомобиля — сто четыре тысячи пятьсот двадцать километров.",
    "kind": "car",
    "note": ""
   },
   "x11": {
    "text": "До замены масла осталось 1 480 километров.",
    "speech": "До замены масла осталось одна тысяча четыреста восемьдесят километров.",
    "kind": "car",
    "note": ""
   },
   "x12": {
    "text": "Заправка добавлена: 42 литра, 3 200 рублей.",
    "speech": "Заправка добавлена: сорок два литра, три тысячи двести рублей.",
    "kind": "car",
    "note": ""
   },
   "x13": {
    "text": "На пробеге 120 000 километров напомню проверить ГРМ.",
    "speech": "На пробеге ста двадцати тысячах километров напомню проверить ГРМ.",
    "kind": "car",
    "note": "Проверка косвенного падежа числительного + аббревиатуры ГРМ (буквенное чтение «гэ-эр-эм»)."
   },
   "x14": {
    "text": "Вы хотите, чтобы я перенесла встречу на семь часов вечера?",
    "speech": "Вы хотите, чтобы я перенесла встречу на семь часов вечера?",
    "kind": "question",
    "note": ""
   },
   "x15": {
    "text": "Внимание. До конца оплаты осталось два дня, нужно подтверждение.",
    "speech": "Внимание. До конца оплаты осталось два дня, нужно подтверждение.",
    "kind": "warning",
    "note": ""
   },
   "x16": {
    "text": "Я нашла три свободных слота на этой неделе. Ближайший — сегодня в восемнадцать тридцать, но он рядом с вашей встречей. Могу предложить завтра в десять утра — вам удобно?",
    "speech": "Я нашла три свободных слота на этой неделе. Ближайший — сегодня в восемнадцать тридцать, но он рядом с вашей встречей. Могу предложить завтра в десять утра — вам удобно?",
    "kind": "long",
    "note": ""
   },
   "x17": {
    "text": "Aven слушает вас.",
    "speech": "Aven слушает вас.",
    "kind": "name",
    "note": "КОНТРОЛЬ без нормализации: латиница как есть. Если звучит «Эйвен» — значит, нормализация обязательна."
   },
   "x18": {
    "text": "Aven слушает вас.",
    "speech": "Авен слушает вас.",
    "kind": "name",
    "note": "Текущий словарь произношения (Aven → Авен). Экранный текст при этом остаётся «Aven»."
   },
   "x19": {
    "text": "Aven слушает вас.",
    "speech": "А́вен слушает вас.",
    "kind": "name",
    "note": "Вариант с явным знаком ударения (А́ = А + U+0301) — если модель понимает знак ударения как подсказку."
   },
   "x20": {
    "text": "Aven слушает вас.",
    "speech": "Авэн слушает вас.",
    "kind": "name",
    "note": "Вариант через «э» — форсировать открытый [э] вместо редуцированного [и]. Только для речи, на экране остаётся «Aven»."
   }
  },
  "metrics": {
   "x00": {
    "synth_s": 33.299,
    "audio_s": 5.2,
    "rtf": 6.404,
    "first_call": true
   },
   "x01": {
    "synth_s": 15.282,
    "audio_s": 2.32,
    "rtf": 6.587,
    "first_call": false
   },
   "x02": {
    "synth_s": 5.679,
    "audio_s": 0.72,
    "rtf": 7.888,
    "first_call": false
   },
   "x03": {
    "synth_s": 6.608,
    "audio_s": 0.88,
    "rtf": 7.509,
    "first_call": false
   },
   "x04": {
    "synth_s": 10.472,
    "audio_s": 1.52,
    "rtf": 6.89,
    "first_call": false
   },
   "x05": {
    "synth_s": 17.898,
    "audio_s": 2.8,
    "rtf": 6.392,
    "first_call": false
   },
   "x06": {
    "synth_s": 19.138,
    "audio_s": 3.04,
    "rtf": 6.295,
    "first_call": false
   },
   "x07": {
    "synth_s": 24.705,
    "audio_s": 3.76,
    "rtf": 6.57,
    "first_call": false
   },
   "x08": {
    "synth_s": 22.239,
    "audio_s": 3.44,
    "rtf": 6.465,
    "first_call": false
   },
   "x09": {
    "synth_s": 17.283,
    "audio_s": 2.72,
    "rtf": 6.354,
    "first_call": false
   },
   "x10": {
    "synth_s": 26.793,
    "audio_s": 4.32,
    "rtf": 6.202,
    "first_call": false
   },
   "x11": {
    "synth_s": 25.311,
    "audio_s": 4.0,
    "rtf": 6.328,
    "first_call": false
   },
   "x12": {
    "synth_s": 35.389,
    "audio_s": 5.68,
    "rtf": 6.23,
    "first_call": false
   },
   "x13": {
    "synth_s": 25.311,
    "audio_s": 4.0,
    "rtf": 6.328,
    "first_call": false
   },
   "x14": {
    "synth_s": 30.093,
    "audio_s": 4.88,
    "rtf": 6.167,
    "first_call": false
   },
   "x15": {
    "synth_s": 27.078,
    "audio_s": 4.4,
    "rtf": 6.154,
    "first_call": false
   },
   "x16": {
    "synth_s": 70.068,
    "audio_s": 11.12,
    "rtf": 6.301,
    "first_call": false
   },
   "x17": {
    "synth_s": 8.184,
    "audio_s": 1.12,
    "rtf": 7.307,
    "first_call": false
   },
   "x18": {
    "synth_s": 15.41,
    "audio_s": 2.24,
    "rtf": 6.879,
    "first_call": false
   },
   "x19": {
    "synth_s": 17.215,
    "audio_s": 2.56,
    "rtf": 6.725,
    "first_call": false
   },
   "x20": {
    "synth_s": 8.605,
    "audio_s": 1.2,
    "rtf": 7.171,
    "first_call": false
   }
  },
  "asr": {
   "x00": {
    "hyp": "Здравствуйте! Я Вен. Ваш персональный помощник. Чем могу помочь?",
    "wer": 0.111
   },
   "x01": {
    "hyp": "Добрый день, Алексей. Чем помочь?",
    "wer": 0.0
   },
   "x02": {
    "hyp": "Готово!",
    "wer": 0.0
   },
   "x03": {
    "hyp": "А, слушай!",
    "wer": 2.0
   },
   "x04": {
    "hyp": "Напоминание создано.",
    "wer": 0.0
   },
   "x05": {
    "hyp": "Завтра в 7.30 не забудьте взять документы.",
    "wer": 0.25
   },
   "x06": {
    "hyp": "Через 20 минут нужно выключить духовку.",
    "wer": 0.0
   },
   "x07": {
    "hyp": "Сегодня вы потратили 12 850 рублей.",
    "wer": 0.0
   },
   "x08": {
    "hyp": "Записала 850 рублей в категорию продукты.",
    "wer": 0.0
   },
   "x09": {
    "hyp": "Следующая встреча сегодня в 18.30",
    "wer": 0.333
   },
   "x10": {
    "hyp": "Пробег автомобиля – 104 500 20 километров.",
    "wer": 0.0
   },
   "x11": {
    "hyp": "До замены масла осталось 1 480 километров.",
    "wer": 0.0
   },
   "x12": {
    "hyp": "Заправка добавлена 42 литра 3200 рублей.",
    "wer": 0.0
   },
   "x13": {
    "hyp": "На пробеге 120 тысяч километров напомню проверить DRM.",
    "wer": 0.444
   },
   "x14": {
    "hyp": "Вы хотите, чтобы я перенесла встречу на 7 часов вечера?",
    "wer": 0.0
   },
   "x15": {
    "hyp": "Внимание, до конца оплаты осталось два дня. Нужно подтверждение.",
    "wer": 0.0
   },
   "x16": {
    "hyp": "Я нашла три свободных слота на этой неделе. Ближайший сегодня в 18.30, но он рядом с вашей встречей. Могу предложить завтра в 10 утра? Вам удобно?",
    "wer": 0.074
   },
   "x17": {
    "hyp": "Ай, вен слушит вас!",
    "wer": 1.0
   },
   "x18": {
    "hyp": "А вен слушает вас.",
    "wer": 0.667
   },
   "x19": {
    "hyp": "Айф, слушает вас.",
    "wer": 0.5
   },
   "x20": {
    "hyp": "А вон слушает вас.",
    "wer": 0.667
   }
  },
  "env": {
   "cpu": "Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz",
   "cores": 4,
   "ram_gb": 15.6,
   "gpu": "none",
   "runner": "GitHub Actions 1000000289",
   "python": "3.11.16"
  },
  "model": "Qwen3-TTS-12Hz-1.7B-VoiceDesign"
 }
};
