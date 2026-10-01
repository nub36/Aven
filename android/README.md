# Aven для Android (shell прототипа)

Минимальная Android-обёртка над общим web-прототипом (`prototype/`). Нативных копий
разделов НЕТ: вся бизнес-логика, стили и контент — общие с веб-сайтом; shell добавляет
только Android-семантику (Back-поведение, внешние ссылки → браузер, локальный origin,
безопасные WebView-настройки). Решение: owner handoff 2026-10-01, см. docs/DECISIONS.md ADR-114.

- **applicationId**: `io.github.nub36.aven` · имя: **Aven**
- **версия**: `android/version.txt` (VERSION_NAME/VERSION_CODE) — единственный источник;
  веб-конфиг скачивания: `prototype/js/app-download.js` (держать версии синхронно!)
- **minSdk 24** (Android 7.0) · **targetSdk 34** · Java/Kotlin: только Java 17
- **permission**: только `INTERNET` · **cleartext**: выключен · **backup**: выключен
- иконка: та же метка Aven, что и favicon сайта (#5A5FD8 + белая «A»), adaptive icon
- единственная runtime-зависимость: `androidx.webkit:webkit` (WebViewAssetLoader)

## Модель распространения (v1)

- веб-ассеты **встроены в APK** (вариант A): приложение открывается сразу и не зависит от
  GitHub Pages; контент обслуживается через WebViewAssetLoader с origin `https://localhost`
- ручная установка из APK через **GitHub Releases** (вне Google Play, осознанно);
  бинарные APK в git-ветках не хранятся
- обновление: скачать новый APK той же кнопкой в приложении/на сайте и поставить поверх;
  автоматического механизма обновлений нет
- данные (localStorage) — только на устройстве, без облачной синхронизации

## Сборка

Локально (при установленных JDK 17 + Android SDK 34):

```bash
bash android/sync-web-assets.sh     # prototype/ → android/app/src/main/assets/www/
cd android && gradle wrapper --gradle-version 8.9 --distribution-type bin
./gradlew assembleRelease
```

Без `AVEN_*` env-переменных сборка упадёт guard-чеком (unsigned release не собираем).
Подпись задаётся ТОЛЬКО переменными окружения: `AVEN_KEYSTORE_FILE`,
`AVEN_KEYSTORE_PASSWORD`, `AVEN_KEYSTORE_ALIAS`, `AVEN_KEY_PASSWORD`.

GitHub Actions (основной путь): Actions → **Android APK** → Run workflow. Режимы подписи:

- **Стабильная (целевая)** — ключ в Actions Secrets (`AVEN_ANDROID_KEYSTORE_*`).
  Создаёт владелец один раз (свои руки + свой gh-токен; агенту/CI значения не видны):
  ```bash
  keytool -genkeypair -keystore /tmp/aven-release.keystore -alias aven-release \
    -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10950 -storetype PKCS12 \
    -dname "CN=Aven Android Release, O=Aven" \
    -storepass ОДИН_ПАРОЛЬ -keypass ОДИН_ПАРОЛЬ
  base64 -w0 /tmp/aven-release.keystore | gh secret set AVEN_ANDROID_KEYSTORE_BASE64 --repos nub36/Aven
  gh secret set AVEN_ANDROID_KEYSTORE_PASSWORD --body "ОДИН_ПАРОЛЬ" --repos nub36/Aven
  gh secret set AVEN_ANDROID_KEYSTORE_ALIAS --body "aven-release" --repos nub36/Aven
  gh secret set AVEN_ANDROID_KEY_PASSWORD --body "ОДИН_ПАРОЛЬ" --repos nub36/Aven
  # keystore дополнительно держать в безопасном месте вне репозитория (менеджер паролей/сейф)
  ```

  **Windows (PowerShell), если нет macOS/Linux/WSL под рукой** — тот же `keytool` идёт в комплекте
  с любым установленным JDK (например Temurin 17: `winget install EclipseAdoptium.Temurin.17.JDK`),
  параметры ключа идентичны (RSA 4096, PKCS12, один пароль store/key):
  ```powershell
  keytool -genkeypair -keystore aven-release.p12 -alias aven-release `
    -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10950 -storetype PKCS12 `
    -dname "CN=Aven Android Release, O=Aven" `
    -storepass ОДИН_ПАРОЛЬ -keypass ОДИН_ПАРОЛЬ

  # base64 без переносов строк (GitHub Secret ожидает одну "строку")
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("aven-release.p12")) | Set-Content -NoNewline aven-release.b64

  # gh CLI (winget install GitHub.cli), авторизован под владельцем репозитория:
  gh secret set AVEN_ANDROID_KEYSTORE_BASE64 --repo nub36/Aven < aven-release.b64
  gh secret set AVEN_ANDROID_KEYSTORE_PASSWORD --body "ОДИН_ПАРОЛЬ" --repo nub36/Aven
  gh secret set AVEN_ANDROID_KEYSTORE_ALIAS --body "aven-release" --repo nub36/Aven
  gh secret set AVEN_ANDROID_KEY_PASSWORD --body "ОДИН_ПАРОЛЬ" --repo nub36/Aven
  ```
  Секреты также можно задать без `gh` — через веб-UI: **Settings → Secrets and variables →
  Actions → New repository secret** (значение `AVEN_ANDROID_KEYSTORE_BASE64` — содержимое
  файла `aven-release.b64` целиком, без переносов строк).

  ⚠️ **Критический бэкап (делать СРАЗУ после создания ключа, до закрытия терминала):**
  `aven-release.p12`/`.keystore` и пароль — ЕДИНСТВЕННЫЙ способ выпускать совместимые
  обновления Aven для уже установленных у пользователей APK; его потеря эквивалентна потере
  возможности обновлять приложение (придётся завести новый ключ и просить всех переустановить
  с потерей локальных данных). Сохранить файл **минимум в двух независимых безопасных местах**
  (например: менеджер паролей с вложениями + отдельное зашифрованное облачное хранилище/внешний
  диск) — НЕ оставлять единственную копию на одном диске/в одной временной папке. Файл и пароль
  никогда не коммитятся в git и не публикуются в issues/PR/чатах.

  ⚠️ PKCS12 в Java шифрует ключ ВСЕГДА паролем хранилища — отдельный `-keypass` keytool молча
  игнорирует. Поэтому `-storepass` и `-keypass` обязаны совпадать, и оба секрета
  (`AVEN_ANDROID_KEYSTORE_PASSWORD`/`AVEN_ANDROID_KEY_PASSWORD`) получают одно значение —
  иначе сборка падает «Get Key failed: Given final block not properly padded».
  (Автоматический bootstrap из workflow НЕВОЗМОЖЕН: GITHUB_TOKEN/GitHub-App токен агента не
  имеет scope на запись Actions Secrets — проверено 2026-10-01, 403 «Resource not accessible
  by integration».)
- **Эфемерная (интерни)**, если секретов нет: release-key этого запуска (не debug-ключ),
  живёт только в памяти runner'а. ⚠️ Поверхустановка APK, подписанного ДРУГИМ ключом,
  невозможна (Android): переход ephemeral→stable требует удалить приложение и поставить
  заново — локальные данные сотрутся. Режим фиксируется в build-info.txt (`signing_mode`)
  и примечаниях релиза.

Workflow всегда выкладывает artifact (`android-apk-<run_id>`: aven-<VN>.apk, aven-latest.apk,
sha256sums, apksigner/aapt-логи, compiled-манифест, листинг архива); с `publish_release=true`
дополнительно создаёт tag `aven-android-v<VN>` и GitHub Release.

**Bootstrap prerelease (2026-10-01, PR #48, merged):** пока workflow не было на main и Secrets
не было создано, тестовый PRE-RELEASE (`aven-android-v0.1.0`, ephemeral-подпись) был опубликован
разовой директивой `publish-prerelease:` в `.github/triggers/android-apk.txt`, с явной пометкой
«ПРЕ-РЕЛИЗ / TEST BUILD» в примечаниях. Workflow теперь на `main`; `workflow_dispatch` доступен
владельцу через **Actions → Android APK → Run workflow** в веб-UI GitHub (агентский
GitHub-App токен dispatch делать НЕ может: 403 `actions:write`, перепроверено 2026-10-01 —
тот же инфраструктурный предел, что и для записи Secrets, п. выше). После настройки Secrets
владелец публикует полный релиз dispatch'ом (`publish_release=true`) поверх ТОГО ЖЕ тега
`aven-android-v0.1.0`: workflow сам обновит ассеты (`--clobber`), снимет `prerelease`-флаг и
выставит `--latest` — отдельный новый тег заводить не нужно (идемпотентно, см. job `release`).
⚠️ Prerelease НЕ может быть «latest» (ограничение GitHub API: «Latest release cannot be draft or
prerelease»), поэтому стабильный URL сайта `releases/latest/download/aven-latest.apk` начинает
отдавать APK только с первого ПОЛНОГО релиза — подтверждено: на 2026-10-01 эта ссылка возвращает
404, пока существует только prerelease.

### Guard: отпечаток сертификата (защита будущих обновлений)

После ПЕРВОГО успешного stable-релиза (`mode=secrets`) скопируйте строку
`signing certificate SHA-256: …` из лога шага **«Проверка APK»** (или `certificate SHA-256:` из
`apksigner.txt`/примечаний релиза) в файл [`android/release-cert-sha256.txt`](release-cert-sha256.txt)
вместо `PENDING` и закоммитьте (это публичный отпечаток — не секрет). С этого момента CI
проверяет совпадение сертификата на КАЖДОМ следующем stable-релизе и **падает**, если ключ
подписи вдруг отличается — это защищает уже установленные у пользователей APK от случайно
опубликованного несовместимого обновления. Пока файл содержит `PENDING`, сверка пропускается
(иначе первый stable-релиз не смог бы пройти).

## Чек-лист релиза новой версии

1. Поднять `VERSION_NAME`/`VERSION_CODE` в `android/version.txt` и `version`/`apkFile`/
   `sizeHint` в `prototype/js/app-download.js` (синхронно!). `VERSION_CODE` **обязан** быть строго
   больше любого ранее опубликованного stable-релиза (Android отклоняет установку APK с
   versionCode ≤ уже установленного) — никогда не повторять и не уменьшать; если сомневаетесь,
   сверьтесь с `versionCode` в примечаниях последнего опубликованного GitHub Release.
2. `node prototype/tests/android-apk-check.js` (обязан быть полностью зелёным) + полный
   прогон web-тестов prototype/tests.
3. Dispatch workflow `publish_release=true` на `main` (Actions → Android APK → Run workflow —
   делает владелец вручную через веб-UI, агент выполнить dispatch не может).
4. После первого stable-релиза — заполнить `android/release-cert-sha256.txt` (см. Guard выше),
   если это ещё не сделано.
5. Владелец ставит `aven-latest.apk` на реальное устройство (чек-лист приёма — в PR).

## Ограничения первой версии (фиксированный scope, не «перегреть»)

НЕТ: Google Play, автоапдейтера, push/background-сервисов, платежей, native-переписи,
новых персонажей/3D, voice-цепочки в shell. STT/system-TTS в WebView недоступны
(Web Speech API там нет) — поведение честно показывается в приложении и справке.
Страницы лаборатории голосов и 3D в APK не входят (экономия ~20 МБ) — вместо 404
показывается встроенное объяснение со ссылкой «назад в Aven».
