"""LIVE-тест Silero ru_aigul на реальном research/tts/server.py (этап 6, CI; docs/TTS_RESEARCH.md §19).

Отличие от dryrun_server_silero.py: там проверялся контракт БЕЗ движка; здесь —
НАСТОЯЩИЙ Silero (torch + models.silero.ai/…/v5_cis_base.pt), настоящий сервер
в production-like режиме VPS:

  * health minimal: ровно {ok, status, server, version, max_chars, default_voice},
    без engines/voices/uptime — ничего лишнего о сервере;
  * синтез РЕАЛЬНЫХ фраз владельца голосом silero_cis_mit/ru_aigul:
    произвольный текст, «Авен», числа, время, даты, рубли, километры, литры,
    короткие и длинные ответы, тестовая фраза успеха
    «Авен проверяет натуральный голос. Сейчас 18 часов 43 минуты,
     пробег автомобиля 104520 километров.»;
  * каждый ответ — настоящий RIFF/WAV; меряется synth_s (X-Synth-Seconds),
    длительность аудио и RTF; WAV → MP3 (ffmpeg) для прослушивания владельцем;
  * лимиты: текст > 600 символов → 413, неизвестный голос → 400,
    rate limit (отдельный инстанс N=3/60 c) → 429 + Retry-After.

Запуск (нужны torch/silero-stress/numpy, модель и ffmpeg; в песочнице агента
download.pytorch.org и models.silero.ai недоступны — живой запуск только в CI):
  python research/tts/tests/live_server_silero.py --model /path/v5_cis_base.pt --out research/tts/out/silero-live

Результат: research/tts/out/silero-live/silero_live.json + MP3 фраз для прослушивания.
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
SERVER = RESEARCH / "server.py"
PY = sys.executable

PASS = 0
FAIL = 0


def ok(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS  " + name)
    else:
        FAIL += 1
        print("FAIL  " + name + ((" — " + str(extra)) if extra else ""))


def free_port() -> int:
    import socket
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Server:
    def __init__(self, model: str, env_extra: dict):
        self.port = free_port()
        env = dict(__import__("os").environ)
        env.update({
            "SILERO_MODEL": model,
            "SILERO_SPEAKERS": "ru_aigul",
            "AVEN_TTS_HEALTH": "minimal",
            "AVEN_TTS_DEFAULT_VOICE": "silero_cis_mit/ru_aigul",
        })
        env.update(env_extra)
        self.proc = subprocess.Popen(
            [PY, str(SERVER), "--host", "127.0.0.1", "--port", str(self.port), "--warmup"],
            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=str(RESEARCH.parent))
        self.base = f"http://127.0.0.1:{self.port}"
        t0 = time.time()
        while time.time() - t0 < 300:
            try:
                urllib.request.urlopen(self.base + "/api/tts/health", timeout=3).read()
                return
            except Exception:
                if self.proc.poll() is not None:
                    break
                time.sleep(1)
        raise RuntimeError("сервер с Silero не поднялся за 300 с")

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def http(base, path, method="GET", obj=None):
    """(status, headers, body_bytes)."""
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8") if obj is not None else None
    r = urllib.request.Request(base + path, method=method, data=data,
                               headers={"Content-Type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def wav_seconds(b: bytes) -> float:
    import io
    with wave.open(io.BytesIO(b)) as w:
        return w.getnframes() / float(w.getframerate())


PHRASES = [
    ("owner", "Авен проверяет натуральный голос. Сейчас 18 часов 43 минуты, пробег автомобиля 104520 километров."),
    ("arbitrary", "Завтра необычный день: солнце встаёт рано, а я хочу успеть сделать все дела до полудня."),
    ("name", "Здравствуйте. Я Авен, ваш персональный помощник. Чем могу помочь?"),
    ("numbers", "Сегодня записано расходов на 3420 рублей, остаток бюджета 87500 рублей."),
    ("time", "Напомню в девять тридцать. Сейчас 18:45, в 21:00 у вас встреча."),
    ("date", "Напомню третьего октября. Двадцать шестое сентября две тысячи двадцать шестого года."),
    ("units", "Заправка добавлена: 42 литра, 3200 рублей. Пробег 104520 километров, средний расход 8 литров."),
    ("short", "Готово."),
    ("long", ("Ваш день насыщенный. Утром в девять часов совещание по проекту, затем в одиннадцать "
              "звонок мастеру про машину. После обеда в пятнадцать тридцать тренировка, а вечером "
              "в девятнадцать надо забрать посылку. Расходы за неделю составили четыре тысячи "
              "двести рублей, из них тысяча двести — продукты. Пробег автомобиля достиг ста четырёх "
              "тысяч километров, шины пора поменять через две тысячи километров. Не забудьте также "
              "заправить двадцать литров и проверить давление в шинах.")),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="путь к v5_cis_base.pt")
    ap.add_argument("--out", default=str(RESEARCH / "out" / "silero-live"))
    a = ap.parse_args()
    out = Path(a.out)
    (out / "mp3").mkdir(parents=True, exist_ok=True)

    t_start = time.time()
    srv = Server(a.model, {"AVEN_TTS_RATE_N": "0"})  # основная батарея — без лимита
    results = {"phrases": [], "limits": {}}
    try:
        # --- health minimal: ровно ожидаемый набор ключей ---
        st, _, body = http(srv.base, "/api/tts/health")
        j = json.loads(body)
        ok("L1 health → 200 ok", st == 200 and j.get("ok") is True)
        ok("L2 minimal: ключи ровно ok/status/server/version/max_chars/default_voice",
           set(j.keys()) == {"ok", "status", "server", "version", "max_chars", "default_voice"}, sorted(j.keys()))
        ok("L3 default_voice = silero_cis_mit/ru_aigul", j.get("default_voice") == "silero_cis_mit/ru_aigul")
        results["health"] = j

        st, _, body = http(srv.base, "/api/tts/voices")
        vj = json.loads(body)
        ok("L4 voices: единственный голос — silero_cis_mit/ru_aigul («Aigul · Silero CIS»)",
           st == 200 and [v["id"] for v in vj.get("voices", [])] == ["silero_cis_mit/ru_aigul"]
           and "Aigul" in vj["voices"][0]["label"])

        # --- батарея фраз: настоящий синтез ---
        for pid, text in PHRASES:
            st, h, b = http(srv.base, "/api/tts/synthesize", "POST",
                            {"text": text, "voice": "silero_cis_mit/ru_aigul"})
            name = f"L-synth[{pid}]"
            good = st == 200 and b[:4] == b"RIFF" and len(b) > 44
            ok(f"{name} → 200, настоящий RIFF/WAV ({len(text)} симв.)", good, st)
            if not good:
                continue
            synth_s = float(h.get("X-Synth-Seconds", "nan"))
            audio_s = wav_seconds(b)
            rtf = synth_s / audio_s if audio_s > 0 else None
            (out / f"{pid}.wav").write_bytes(b)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(out / f"{pid}.wav"),
                            "-codec:a", "libmp3lame", "-qscale:a", "4", str(out / "mp3" / f"{pid}.mp3")],
                           check=True)
            results["phrases"].append({"id": pid, "chars": len(text), "synth_s": round(synth_s, 3),
                                       "audio_s": round(audio_s, 2), "rtf": round(rtf, 4) if rtf else None})
            ok(f"{name}: synth {synth_s:.3f}s, аудио {audio_s:.2f}s, RTF {rtf:.3f}", True)

        # --- лимиты (RATE_N=0): 413/400 ---
        st, _, body = http(srv.base, "/api/tts/synthesize", "POST", {"text": "а" * 601, "voice": "silero_cis_mit/ru_aigul"})
        ok("L5 текст 601 символ → 413 text too long", st == 413 and b"too long" in body, st)
        st, _, body = http(srv.base, "/api/tts/synthesize", "POST", {"text": "тест", "voice": "silero/ru_aigul"})
        ok("L6 неверный id голоса → 400 unknown voice", st == 400 and b"unknown voice" in body, st)
    finally:
        srv.stop()
        results["server_uptime_s"] = round(time.time() - t_start, 1)

    # --- rate limit: отдельный инстанс N=3/60 c (модель уже в кэше страниц, поднимется быстро) ---
    srv2 = Server(a.model, {"AVEN_TTS_RATE_N": "3", "AVEN_TTS_RATE_WINDOW_S": "60"})
    try:
        codes = []
        for i in range(4):
            st, h, _ = http(srv2.base, "/api/tts/synthesize", "POST", {"text": "Проверка.", "voice": "silero_cis_mit/ru_aigul"})
            codes.append(st)
            if st == 429:
                results["limits"]["retry_after_s"] = h.get("Retry-After")
        ok("L7 rate limit 3/60 c: 3 синтеза ок, 4-й → 429 + Retry-After",
           codes[:3] == [200, 200, 200] and codes[3] == 429 and "Retry-After" in (h or {}), codes)
        results["limits"]["rate_codes"] = codes
    finally:
        srv2.stop()

    results["pass"] = PASS
    results["fail"] = FAIL
    results["voice"] = "silero_cis_mit/ru_aigul"
    results["server_version"] = j.get("version")
    (out / "silero_live.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nИТОГО: {PASS} PASS, {FAIL} FAIL")
    print(f"Результаты: {out / 'silero_live.json'}; MP3 для прослушивания: {out / 'mp3'}")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
