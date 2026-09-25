/* Сгенерировано research/tts/collect.py — не редактировать вручную. */
window.AvenVoiceSamples = {
 "_note": "Сгенерировано research/tts/collect.py. Исследовательские образцы TTS — не production.",
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
  "espeak/ru-f": {
   "engine": "espeak",
   "voice": "ru-f",
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
   "title": "eSpeak NG (формантный) · ru-f",
   "engineTitle": "eSpeak NG (формантный)",
   "class": "A — ориентир «роботизированного» системного TTS",
   "license": "—",
   "commercial": "yes",
   "status": "baseline",
   "catalogueOnly": false,
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
   "asrWer": 0.943
  },
  "piper/irina-medium": {
   "engine": "piper",
   "voice": "irina-medium",
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
   "title": "Piper ru_RU-irina-medium · irina-medium",
   "engineTitle": "Piper ru_RU-irina-medium",
   "class": "B/D — лёгкий VITS (ONNX), CPU и браузер (WASM)",
   "license": "Unknown (MODEL_CARD: датасет RHVoice Irina, License: Unknown)",
   "commercial": "unclear",
   "status": "not-for-product",
   "catalogueOnly": false,
   "f0": 165.8,
   "summary": {
    "median_synth_s": 0.305,
    "median_rtf": 0.063,
    "max_synth_s": 0.423
   },
   "probe": {
    "synth_s": 0.092,
    "audio_s": 1.022,
    "rtf": 0.09,
    "first_call": false
   },
   "loadS": 1.03,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000244",
    "python": "3.11.16"
   },
   "asrWer": 0.011
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
   "catalogueOnly": false,
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
   "asrWer": 0.008
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
   "catalogueOnly": true,
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
   "asrWer": 0.111
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
   "catalogueOnly": false,
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
   "asrWer": 0.022
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
   "catalogueOnly": true,
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
   "asrWer": 0.111
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
   "catalogueOnly": false,
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
   "asrWer": 0.033
  },
  "qwen3/vd17-design": {
   "engine": "qwen3",
   "voice": "vd17-design",
   "phrases": [
    "t01"
   ],
   "title": "Qwen3-TTS (0.6B / 1.7B) · vd17-design",
   "engineTitle": "Qwen3-TTS (0.6B / 1.7B)",
   "class": "C — крупный нейросетевой, желательно GPU",
   "license": "Apache-2.0",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
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
   "asrWer": 0.222
  },
  "rhvoice/anna": {
   "engine": "rhvoice",
   "voice": "anna",
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
   "title": "RHVoice (параметрический HTS) · anna",
   "engineTitle": "RHVoice (параметрический HTS)",
   "class": "B — очень лёгкий, CPU, офлайн",
   "license": "не указана",
   "commercial": "unclear",
   "status": "baseline",
   "catalogueOnly": false,
   "f0": 215.3,
   "summary": {
    "median_synth_s": 0.201,
    "median_rtf": 0.059,
    "max_synth_s": 0.246
   },
   "probe": {
    "synth_s": 0.115,
    "audio_s": 0.595,
    "rtf": 0.193,
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
   "asrWer": 0.011
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
   "catalogueOnly": false,
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
   "asrWer": 0.011
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
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "rhvoice/irina": {
   "engine": "rhvoice",
   "voice": "irina",
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
   "title": "RHVoice (параметрический HTS) · irina",
   "engineTitle": "RHVoice (параметрический HTS)",
   "class": "B — очень лёгкий, CPU, офлайн",
   "license": "не указана",
   "commercial": "unclear",
   "status": "baseline",
   "catalogueOnly": false,
   "f0": 169.0,
   "summary": {
    "median_synth_s": 0.338,
    "median_rtf": 0.073,
    "max_synth_s": 0.393
   },
   "probe": {
    "synth_s": 0.367,
    "audio_s": 0.84,
    "rtf": 0.437,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_aigul": {
   "engine": "silero_cis_mit",
   "voice": "ru_aigul",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_aigul",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_aigul__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_aigul__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_aigul__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 216.2,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_albina": {
   "engine": "silero_cis_mit",
   "voice": "ru_albina",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_albina",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_albina__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_albina__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_albina__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 189.0,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_alexandr": {
   "engine": "silero_cis_mit",
   "voice": "ru_alexandr",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_alexandr",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 117.6,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_alfia": {
   "engine": "silero_cis_mit",
   "voice": "ru_alfia",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_alfia",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_alfia2": {
   "engine": "silero_cis_mit",
   "voice": "ru_alfia2",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_alfia2",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_alfia2__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_alfia2__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_alfia2__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 206.9,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_alfia__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_alfia__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_alfia__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 213.3,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_bogdan": {
   "engine": "silero_cis_mit",
   "voice": "ru_bogdan",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_bogdan",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 120.6,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_dmitriy": {
   "engine": "silero_cis_mit",
   "voice": "ru_dmitriy",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_dmitriy",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 127.7,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_eduard": {
   "engine": "silero_cis_mit",
   "voice": "ru_eduard",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_eduard",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 132.6,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_ekaterina": {
   "engine": "silero_cis_mit",
   "voice": "ru_ekaterina",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_ekaterina",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.033
  },
  "silero_cis_mit/ru_ekaterina__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_ekaterina__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_ekaterina__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 226.4,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_gamat": {
   "engine": "silero_cis_mit",
   "voice": "ru_gamat",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_gamat",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 156.9,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_igor": {
   "engine": "silero_cis_mit",
   "voice": "ru_igor",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_igor",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
   "f0": 183.2,
   "summary": {
    "median_synth_s": 0.264,
    "median_rtf": 0.057,
    "max_synth_s": 0.327
   },
   "probe": {
    "synth_s": 0.065,
    "audio_s": 0.912,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_igor__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_igor__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_igor__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 189.0,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_karina": {
   "engine": "silero_cis_mit",
   "voice": "ru_karina",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_karina",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_karina__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_karina__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_karina__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 233.0,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_kejilgan": {
   "engine": "silero_cis_mit",
   "voice": "ru_kejilgan",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_kejilgan",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 112.1,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_kermen": {
   "engine": "silero_cis_mit",
   "voice": "ru_kermen",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_kermen",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.03
  },
  "silero_cis_mit/ru_kermen__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_kermen__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_kermen__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 224.3,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_marat": {
   "engine": "silero_cis_mit",
   "voice": "ru_marat",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_marat",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 137.9,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_miyau": {
   "engine": "silero_cis_mit",
   "voice": "ru_miyau",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_miyau",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 112.7,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_nurgul": {
   "engine": "silero_cis_mit",
   "voice": "ru_nurgul",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_nurgul",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_nurgul__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_nurgul__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_nurgul__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 189.0,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_oksana": {
   "engine": "silero_cis_mit",
   "voice": "ru_oksana",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_oksana",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.024
  },
  "silero_cis_mit/ru_oksana__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_oksana__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_oksana__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 228.6,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_onaoy": {
   "engine": "silero_cis_mit",
   "voice": "ru_onaoy",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_onaoy",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_onaoy__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_onaoy__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_onaoy__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 224.3,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_ramilia": {
   "engine": "silero_cis_mit",
   "voice": "ru_ramilia",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_ramilia",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_ramilia__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_ramilia__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_ramilia__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 195.1,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_roman": {
   "engine": "silero_cis_mit",
   "voice": "ru_roman",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_roman",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 113.7,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_safarhuja": {
   "engine": "silero_cis_mit",
   "voice": "ru_safarhuja",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_safarhuja",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 104.3,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_saida": {
   "engine": "silero_cis_mit",
   "voice": "ru_saida",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_saida",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_saida__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_saida__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_saida__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 226.4,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_sibday": {
   "engine": "silero_cis_mit",
   "voice": "ru_sibday",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_sibday",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 162.2,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_vika": {
   "engine": "silero_cis_mit",
   "voice": "ru_vika",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_vika",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_vika__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_vika__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_vika__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 201.7,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_zara": {
   "engine": "silero_cis_mit",
   "voice": "ru_zara",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zara",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_zara__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_zara__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zara__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 216.2,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_zhadyra": {
   "engine": "silero_cis_mit",
   "voice": "ru_zhadyra",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zhadyra",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_zhadyra__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_zhadyra__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zhadyra__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 205.1,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_zhazira": {
   "engine": "silero_cis_mit",
   "voice": "ru_zhazira",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zhazira",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "silero_cis_mit/ru_zhazira__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_zhazira__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zhazira__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 226.4,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_cis_mit/ru_zinaida": {
   "engine": "silero_cis_mit",
   "voice": "ru_zinaida",
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
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zinaida",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": false,
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
   "asrWer": 0.022
  },
  "silero_cis_mit/ru_zinaida__nostress": {
   "engine": "silero_cis_mit",
   "voice": "ru_zinaida__nostress",
   "phrases": [
    "t01"
   ],
   "title": "Silero v5 CIS base (ru_*) + silero-stress · ru_zinaida__nostress",
   "engineTitle": "Silero v5 CIS base (ru_*) + silero-stress",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "MIT (LICENSE_CIS) — только base cis-модели",
   "commercial": "yes",
   "status": "shortlist",
   "catalogueOnly": true,
   "f0": 203.4,
   "summary": null,
   "probe": null,
   "loadS": 0.16,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.111
  },
  "silero_v5_ru/baya": {
   "engine": "silero_v5_ru",
   "voice": "baya",
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
   "title": "Silero v5_5_ru (baya / kseniya / xenia) · baya",
   "engineTitle": "Silero v5_5_ru (baya / kseniya / xenia)",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "CC BY-NC-SA 4.0 (некоммерческая); коммерция — отдельная лицензия Silero",
   "commercial": "no",
   "status": "reference",
   "catalogueOnly": false,
   "f0": 250.0,
   "summary": {
    "median_synth_s": 0.216,
    "median_rtf": 0.058,
    "max_synth_s": 0.3
   },
   "probe": {
    "synth_s": 0.061,
    "audio_s": 0.825,
    "rtf": 0.074,
    "first_call": false
   },
   "loadS": 0.69,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.025
  },
  "silero_v5_ru/kseniya": {
   "engine": "silero_v5_ru",
   "voice": "kseniya",
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
   "title": "Silero v5_5_ru (baya / kseniya / xenia) · kseniya",
   "engineTitle": "Silero v5_5_ru (baya / kseniya / xenia)",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "CC BY-NC-SA 4.0 (некоммерческая); коммерция — отдельная лицензия Silero",
   "commercial": "no",
   "status": "reference",
   "catalogueOnly": false,
   "f0": 247.4,
   "summary": {
    "median_synth_s": 0.217,
    "median_rtf": 0.058,
    "max_synth_s": 0.298
   },
   "probe": {
    "synth_s": 0.063,
    "audio_s": 0.875,
    "rtf": 0.072,
    "first_call": false
   },
   "loadS": 0.69,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.022
  },
  "silero_v5_ru/xenia": {
   "engine": "silero_v5_ru",
   "voice": "xenia",
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
   "title": "Silero v5_5_ru (baya / kseniya / xenia) · xenia",
   "engineTitle": "Silero v5_5_ru (baya / kseniya / xenia)",
   "class": "B — лёгкий нейросетевой, self-hosted CPU",
   "license": "CC BY-NC-SA 4.0 (некоммерческая); коммерция — отдельная лицензия Silero",
   "commercial": "no",
   "status": "reference",
   "catalogueOnly": false,
   "f0": 206.9,
   "summary": {
    "median_synth_s": 0.198,
    "median_rtf": 0.059,
    "max_synth_s": 0.262
   },
   "probe": {
    "synth_s": 0.066,
    "audio_s": 0.887,
    "rtf": 0.074,
    "first_call": false
   },
   "loadS": 0.69,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000242",
    "python": "3.11.16"
   },
   "asrWer": 0.011
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
   "catalogueOnly": false,
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
   "asrWer": 0.024
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
   "catalogueOnly": false,
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
   "asrWer": 0.027
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
   "catalogueOnly": false,
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
   "asrWer": 0.011
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
   "catalogueOnly": false,
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
   "asrWer": 0.019
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
   "catalogueOnly": false,
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
   "asrWer": 0.011
  },
  "vosk/spk00": {
   "engine": "vosk",
   "voice": "spk00",
   "phrases": [
    "t01"
   ],
   "title": "Vosk TTS ru multi · spk00",
   "engineTitle": "Vosk TTS ru multi",
   "class": "B — лёгкий VITS+BERT, CPU",
   "license": "не опубликована явно (голоса Irina/Tiflocomp, Natasha/SOVA и др.)",
   "commercial": "unclear",
   "status": "not-for-product",
   "catalogueOnly": true,
   "f0": 153.7,
   "summary": null,
   "probe": null,
   "loadS": 70.06,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000248",
    "python": "3.11.16"
   },
   "asrWer": 0.0
  },
  "vosk/spk01": {
   "engine": "vosk",
   "voice": "spk01",
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
   "title": "Vosk TTS ru multi · spk01",
   "engineTitle": "Vosk TTS ru multi",
   "class": "B — лёгкий VITS+BERT, CPU",
   "license": "не опубликована явно (голоса Irina/Tiflocomp, Natasha/SOVA и др.)",
   "commercial": "unclear",
   "status": "not-for-product",
   "catalogueOnly": false,
   "f0": 237.1,
   "summary": {
    "median_synth_s": 1.428,
    "median_rtf": 0.447,
    "max_synth_s": 1.823
   },
   "probe": {
    "synth_s": 0.361,
    "audio_s": 0.511,
    "rtf": 0.708,
    "first_call": false
   },
   "loadS": 70.06,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000248",
    "python": "3.11.16"
   },
   "asrWer": 0.0
  },
  "vosk/spk02": {
   "engine": "vosk",
   "voice": "spk02",
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
   "title": "Vosk TTS ru multi · spk02",
   "engineTitle": "Vosk TTS ru multi",
   "class": "B — лёгкий VITS+BERT, CPU",
   "license": "не опубликована явно (голоса Irina/Tiflocomp, Natasha/SOVA и др.)",
   "commercial": "unclear",
   "status": "not-for-product",
   "catalogueOnly": false,
   "f0": 171.6,
   "summary": {
    "median_synth_s": 1.716,
    "median_rtf": 0.437,
    "max_synth_s": 2.2
   },
   "probe": {
    "synth_s": 0.516,
    "audio_s": 0.848,
    "rtf": 0.609,
    "first_call": false
   },
   "loadS": 70.06,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000248",
    "python": "3.11.16"
   },
   "asrWer": 0.011
  },
  "vosk/spk03": {
   "engine": "vosk",
   "voice": "spk03",
   "phrases": [
    "t01"
   ],
   "title": "Vosk TTS ru multi · spk03",
   "engineTitle": "Vosk TTS ru multi",
   "class": "B — лёгкий VITS+BERT, CPU",
   "license": "не опубликована явно (голоса Irina/Tiflocomp, Natasha/SOVA и др.)",
   "commercial": "unclear",
   "status": "not-for-product",
   "catalogueOnly": true,
   "f0": 111.1,
   "summary": null,
   "probe": null,
   "loadS": 70.06,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000248",
    "python": "3.11.16"
   },
   "asrWer": 0.0
  },
  "vosk/spk04": {
   "engine": "vosk",
   "voice": "spk04",
   "phrases": [
    "t01"
   ],
   "title": "Vosk TTS ru multi · spk04",
   "engineTitle": "Vosk TTS ru multi",
   "class": "B — лёгкий VITS+BERT, CPU",
   "license": "не опубликована явно (голоса Irina/Tiflocomp, Natasha/SOVA и др.)",
   "commercial": "unclear",
   "status": "not-for-product",
   "catalogueOnly": true,
   "f0": 129.7,
   "summary": null,
   "probe": null,
   "loadS": 70.06,
   "env": {
    "cpu": "AMD EPYC 7763 64-Core Processor",
    "cores": 4,
    "ram_gb": 15.6,
    "gpu": "none",
    "runner": "GitHub Actions 1000000248",
    "python": "3.11.16"
   },
   "asrWer": 0.0
  }
 }
};
