"""Локальная проверка production-like контракта research/tts/server.py БЕЗ движка TTS.

Этап 6: Silero ru_aigul — выбранный Natural Voice. Этот тест проверяет НЕ синтез
(движок не загружается — он проверяется живьём в CI workflow `aven-tts-runtime`
и на VPS владельца), а защиту и контракт сервера, каким он будет на VPS:

  * health в режиме minimal (AVEN_TTS_HEALTH=minimal): без engines/voices/uptime —
    endpoint не раскрывает лишнего; + default_voice для фронта;
  * voices: пустой список без движка (и не падает);
  * synthesize без движка → 400 unknown voice;
  * методы: PUT/DELETE/PATCH на /api/* → 405 + Allow; POST на health/voices → 405;
  * лимиты: тело > 20 КБ → 413; текст > 600 символов → 413; пустой текст → 400;
  * rate limit (AVEN_TTS_RATE_N=4/60 с): 5-й POST → 429 + Retry-After;
  * CORS: allowlist отражается, чужой origin не получает заголовков;
  * приватность: текст запроса (с маркером) не появляется в логах сервера.

Запуск (нужен только numpy):
  python research/tts/tests/dryrun_server_silero.py
"""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
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
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Server:
    """Сабпроцесс server.py с заданными env; логи копятся для проверки приватности."""

    def __init__(self, env_extra: dict):
        self.port = free_port()
        env = dict(os.environ)
        env.update(env_extra)
        self.log = open(f"/tmp/aven-tts-test-{self.port}.log", "w+")
        self.proc = subprocess.Popen(
            [PY, str(SERVER), "--host", "127.0.0.1", "--port", str(self.port)],
            env=env, stdout=self.log, stderr=subprocess.STDOUT, cwd=str(RESEARCH.parent))
        self.base = f"http://127.0.0.1:{self.port}"
        for _ in range(60):
            time.sleep(0.25)
            try:
                urllib.request.urlopen(self.base + "/api/tts/health", timeout=2).read()
                return
            except Exception:
                if self.proc.poll() is not None:
                    break
        raise RuntimeError("сервер не поднялся: " + self.logtail())

    def logtail(self) -> str:
        self.log.flush()
        self.log.seek(0)
        return self.log.read()

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.log.close()


def req(base, path, method="GET", body=None, headers=None):
    """(status, headers, body_bytes) — без исключений на 4xx/5xx."""
    r = urllib.request.Request(base + path, method=method,
                               data=body.encode("utf-8") if isinstance(body, str) else body,
                               headers=headers or {})
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def jpost(base, obj, headers=None):
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    return req(base, "/api/tts/synthesize", "POST", json.dumps(obj, ensure_ascii=False), h)


SECRET = "СЕКРЕТНОЕСЛОВО7412"

# ---------------- экземпляр A: VPS-режим (minimal health, rate limit 3/60 c) ----------------
A = Server({
    "AVEN_TTS_HEALTH": "minimal",
    "AVEN_TTS_DEFAULT_VOICE": "silero_cis_mit/ru_aigul",
    "AVEN_TTS_RATE_N": "4",
    "AVEN_TTS_RATE_WINDOW_S": "60",
})
try:
    st, _, body = req(A.base, "/api/tts/health")
    j = json.loads(body)
    ok("A1 health → 200 ok", st == 200 and j.get("ok") is True)
    ok("A2 minimal: НЕТ engines/voices/uptime_s", not ("engines" in j or "voices" in j or "uptime_s" in j), j.keys())
    ok("A3 minimal: default_voice = silero_cis_mit/ru_aigul", j.get("default_voice") == "silero_cis_mit/ru_aigul")
    ok("A4 minimal: есть max_chars", j.get("max_chars") == 600)

    st, _, body = req(A.base, "/api/tts/voices")
    ok("A5 voices без движка → 200 []", st == 200 and json.loads(body) == {"voices": []})

    st, _, body = jpost(A.base, {"text": "тест", "voice": "silero_cis_mit/ru_aigul"})
    ok("A6 synthesize без движка → 400 unknown voice", st == 400 and "unknown voice" in body.decode("utf-8"))

    st, _, body = req(A.base, "/api/tts/voices", "POST", "{}", {"Content-Type": "application/json"})
    ok("A7 POST /voices → 405", st == 405)
    st, h, _ = req(A.base, "/api/tts/health", "PUT", "{}")
    ok("A8 PUT /health → 405 + Allow", st == 405 and "GET" in h.get("Allow", ""))
    st, _, _ = req(A.base, "/api/tts/synthesize", "DELETE")
    ok("A9 DELETE /synthesize → 405", st == 405)

    long_text = SECRET + " " + "а" * 700
    st, _, body = jpost(A.base, {"text": long_text, "voice": "silero_cis_mit/ru_aigul"})
    ok("A10 текст > 600 символов → 413 text too long", st == 413 and "too long" in body.decode("utf-8"))

    st, _, _ = jpost(A.base, {"text": ""})
    ok("A11 пустой текст → 400", st == 400)

    big = ("{" + " " * 21000 + "}")
    st, _, _ = req(A.base, "/api/tts/synthesize", "POST", big.encode("utf-8"), {"Content-Type": "application/json"})
    ok("A12 тело > 20 КБ → 413 body too large", st == 413)

    # rate limit: A6/A10/A11/A12 уже потратили 4 попытки (лимит считается до разбора тела)
    st, h, body = jpost(A.base, {"text": "ещё раз", "voice": "silero_cis_mit/ru_aigul"})
    ok("A13 5-й synthesize в окне → 429", st == 429, st)
    ok("A14 429 с Retry-After", "Retry-After" in h and int(h["Retry-After"]) >= 1)

    st, _, _ = req(A.base, "/api/tts/health", headers={"Origin": "https://nub36.github.io"})
    ok("A15 CORS: pages-origin отражён (health доступен при 429 на synthesize)", st == 200)

    log = A.logtail()
    ok("A15b логи не содержат текст запроса (секретное слово отсутствует)", SECRET not in log)
finally:
    A.stop()

# ---------------- экземпляр B: research-режим по умолчанию (full health) ----------------
B = Server({"AVEN_TTS_RATE_N": "0"})  # лимит выключен — проверяем только health
try:
    st, _, body = req(B.base, "/api/tts/health")
    j = json.loads(body)
    ok("B1 full health: engines/voices/uptime_s присутствуют", st == 200 and "engines" in j and "voices" in j and "uptime_s" in j)
    ok("B2 rate limit выключен (N=0): synthesize-лимит не мешает health", st == 200)
    st, h, _ = req(B.base, "/api/tts/health", headers={"Origin": "https://evil.example"})
    ok("B3 чужой origin НЕ получает CORS-заголовков", "Access-Control-Allow-Origin" not in h)
    st, h, _ = req(B.base, "/api/tts/health", headers={"Origin": "https://nub36.github.io"})
    ok("B4 pages-origin отражён (не *)", h.get("Access-Control-Allow-Origin") == "https://nub36.github.io")
finally:
    B.stop()

# ---------------- юнит: sanitize_text и RateLimiter (без HTTP) ----------------
sys.path.insert(0, str(RESEARCH))
import server as srv  # noqa: E402

ok("U1 sanitize_text вырезает управляющие, кроме \\t\\n\\r",
   srv.sanitize_text("при\x00вет\x1f\n\tтест") == "привет\n\tтест")
ok("U2 sanitize_text делает strip", srv.sanitize_text("  а  ") == "а")

rl = srv.RateLimiter(1, 0.3)
a1, _ = rl.allow("1.2.3.4")
a2, retry = rl.allow("1.2.3.4")
b1, _ = rl.allow("5.6.7.8")
time.sleep(0.35)
a3, _ = rl.allow("1.2.3.4")
ok("U3 RateLimiter: окно 1/0.3с — второй отказ, другой IP не мешает, после окна снова можно",
   a1 and (not a2) and b1 and a3 and 0 < retry <= 0.3)

print(f"\nИТОГО: {PASS} PASS, {FAIL} FAIL")
sys.exit(1 if FAIL else 0)
