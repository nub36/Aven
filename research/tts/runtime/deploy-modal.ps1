# Aven Natural Voice -> Modal: запуск из Windows (PowerShell).
# Windows-эквивалент deploy-modal.sh (bash — для macOS/Linux). Bash/WSL/Git НЕ нужны.
#
# ЗАПУСК (скопируйте в PowerShell целиком, из любой папки):
#   powershell -ExecutionPolicy Bypass -File research\tts\runtime\deploy-modal.ps1
#
# Скрипт делает всё сам:
#   1) проверяет Python 3.10+ (если нет — скажет, что установить, и выйдет);
#   2) ставит Modal CLI (pip --user);
#   3) ОДИН РАЗ логинится в Modal: откроется браузер -> «Continue with GitHub»;
#      тариф Starter бесплатный ($0/мес, $30 кредитов ежемесячно), карта НЕ нужна;
#      если сайт требует карту/оплату — закройте его и остановитесь: это не нужно;
#   4) скачивает веса Qwen3-TTS (≈4,5 ГБ) в Volume Modal — на машинах Modal, не ваших;
#   5) modal deploy — поднимает research/tts/server.py на GPU L4 и печатает
#      постоянный HTTPS-адрес вида https://tts--aven-tts-<ваш-workspace>.modal.run
#
# Секретов нет: токен Modal сохраняется локально в %USERPROFILE%\.modal.toml,
# в репозиторий и на сайт ничего не попадает.

$ErrorActionPreference = "Stop"

# modal_app.py лежит рядом с этим скриптом
$app = Join-Path $PSScriptRoot "modal_app.py"
if (-not (Test-Path $app)) {
  Write-Host "!! Не найден modal_app.py рядом со скриптом: $app"
  Write-Host "   Скачайте архив репозитория заново (см. инструкцию владельца)."
  exit 1
}

# ---------- 1. Python ----------
function Get-PythonVersion([string]$exe, [string[]]$preArgs) {
  try {
    $v = $null
    if ($preArgs.Count -gt 0) { $v = & $exe @preArgs --version } else { $v = & $exe --version }
    if ($LASTEXITCODE -ne 0) { return $null }
    return ("$v").Trim()
  } catch { return $null }
}

$pyExe = $null; $pyPre = @(); $pyVer = $null
$pyVer = Get-PythonVersion "python" @()
if ($pyVer) { $pyExe = "python" } else {
  $pyVer = Get-PythonVersion "py" @("-3")
  if ($pyVer) { $pyExe = "py"; $pyPre = @("-3") }
}
if (-not $pyExe) {
  Write-Host ""
  Write-Host "!! Python 3 не найден. Установите его и запустите этот скрипт ещё раз:"
  Write-Host "   1) Откройте в браузере:  https://www.python.org/downloads/"
  Write-Host "   2) Скачайте «Windows installer (64-bit)» и запустите."
  Write-Host "   3) ВАЖНО: на первом экране установщика отметьте галочку «Add python.exe to PATH»."
  Write-Host "   4) Нажмите Install Now и дождитесь окончания."
  Write-Host "   5) Закройте это окно, откройте НОВОЕ окно PowerShell и повторите команду запуска."
  exit 1
}
if ($pyVer -notmatch "Python 3\.(\d+)" -or [int]$Matches[1] -lt 10) {
  Write-Host "!! Найден Python: $pyVer — нужен 3.10 или новее."
  Write-Host "   Установите свежий с https://www.python.org/downloads/ (с галочкой «Add python.exe to PATH») и повторите."
  exit 1
}
function RunPy([string[]]$arguments) {
  if ($pyPre.Count -gt 0) { & $pyExe @pyPre @arguments } else { & $pyExe @arguments }
}
Write-Host "==> Python: $pyVer"

# ---------- 2. Modal CLI ----------
Write-Host "==> Устанавливаю Modal CLI (pip, ~минута)…"
RunPy @("-m","pip","install","--user","--disable-pip-version-check","-q","modal")
if ($LASTEXITCODE -ne 0) {
  Write-Host "   Вариант «--user» не сработал, пробую обычную установку…"
  RunPy @("-m","pip","install","--disable-pip-version-check","-q","modal")
  if ($LASTEXITCODE -ne 0) {
    Write-Host "!! Не удалось установить Modal CLI. Скопируйте всё красное выше и пришлите мне."
    exit 1
  }
}

# ---------- 3. Вход в Modal (один раз) ----------
$tokenPath = Join-Path $env:USERPROFILE ".modal.toml"
if (Test-Path $tokenPath) {
  Write-Host "==> Токен Modal найден ($tokenPath) — пропускаю вход."
} else {
  Write-Host ""
  Write-Host "==> ВХОД В MODAL. СЕЙЧАС ОТКРОЕТСЯ БРАУЗЕР."
  Write-Host "    В браузере:"
  Write-Host "      - нажмите «Continue with GitHub» и разрешите доступ;"
  Write-Host "      - если появится кнопка «Create token» / «Confirm» — нажмите её;"
  Write-Host "      - карта и оплата НЕ нужны (тариф Starter бесплатный); если их требуют —"
  Write-Host "        закройте страницу и остановитесь, напишите мне."
  Write-Host "    Если браузер не открылся сам — скопируйте ссылку из этого окна в браузер вручную."
  Write-Host "    Ждите сообщения об успешном входе в ЭТОМ окне…"
  RunPy @("-m","modal","setup")
  if ($LASTEXITCODE -ne 0) {
    Write-Host "!! Вход не завершился. Запустите скрипт ещё раз — шаг входа предложится снова."
    exit 1
  }
}

# ---------- 4. Веса модели -> Volume Modal (один раз) ----------
$runTarget = $app + "::download_weights"
Write-Host "==> Скачиваю веса Qwen3-TTS (≈4,5 ГБ) в Volume Modal…"
Write-Host "    (качают машины Modal, а не ваш компьютер; один раз; ~3–10 минут)"
RunPy @("-m","modal","run",$runTarget)
if ($LASTEXITCODE -ne 0) {
  Write-Host "!! Не удалось скачать веса. Скопируйте всё красное выше и пришлите мне."
  exit 1
}

# ---------- 5. Деплой ----------
Write-Host "==> Деплой: сборка образа и запуск на GPU L4 — 5–15 минут. НЕ закрывайте окно."
RunPy @("-m","modal","deploy",$app)
if ($LASTEXITCODE -ne 0) {
  Write-Host "!! Деплой не прошёл. Скопируйте всё красное выше и пришлите мне."
  exit 1
}

Write-Host ""
Write-Host "======================================================================"
Write-Host " ГОТОВО! В выводе выше найдите строку с «Created web endpoint» —"
Write-Host " рядом ссылка вида:"
Write-Host "     https://tts--aven-tts-<ваш-workspace>.modal.run"
Write-Host " СКОПИРУЙТЕ ЕЁ — это постоянный адрес настоящего Natural Voice backend."
Write-Host ""
Write-Host " Дальше (подробно — в инструкции владельца):"
Write-Host "  1) В НОВОЙ вкладке браузера откройте  https://ЭТОТ-АДРЕС/api/tts/health"
Write-Host "     — первое включение контейнера занимает 30–90 секунд, после чего"
Write-Host "     появится JSON со строчкой server: aven-tts-research — backend проснулся."
Write-Host "  2) Aven: https://nub36.github.io/Aven/ -> Настройки -> Голос:"
Write-Host "     движок «Натуральный · эксперимент»; в поле сервера — ваш адрес;"
Write-Host "     голос vd17-design; кнопка «Проверить»."
Write-Host "  3) «Прослушать» и любой вопрос на Главной — живой синтез"
Write-Host "     (источник «self-hosted сервер» в строке «Последний запуск»)."
Write-Host ""
Write-Host " Остановить backend:  python -m modal app stop aven-tts"
Write-Host " Это бесплатно: Starter `$0/мес, кредиты `$30 ежемесячно тратятся только"
Write-Host " во время синтеза; простой не стоит ничего. Карта не нужна."
Write-Host "======================================================================"
