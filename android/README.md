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

**Bootstrap prerelease (2026-10-01):** пока workflow не на main (dispatch недоступен) и Secrets
не созданы, тестовый PRE-RELEASE публикуется разовой директивой `publish-prerelease:` в
`.github/triggers/android-apk.txt` — только с ephemeral-подписью, с явной пометкой
«ПРЕ-РЕЛИЗ / TEST BUILD» в примечаниях. После настройки Secrets владелец публикует полный
релиз dispatch'ом (`publish_release=true`) поверх того же тега: ассеты обновятся, prerelease-флаг
снимется автоматически. ⚠️ Prerelease НЕ может быть «latest» (ограничение GitHub API:
«Latest release cannot be draft or prerelease»), поэтому стабильный URL сайта
`releases/latest/download/aven-latest.apk` начинает отдавать APK только с первого ПОЛНОГО
релиза — merge PR с CTA сайта согласован с этим (gate в чек-листе владельца).

## Чек-лист релиза новой версии

1. Поднять `VERSION_NAME`/`VERSION_CODE` в `android/version.txt` и `version`/`apkFile`/
   `sizeHint` в `prototype/js/app-download.js` (синхронно!).
2. `node prototype/tests/android-apk-check.js` (обязан быть полностью зелёным) + полный
   прогон web-тестов prototype/tests.
3. Dispatch workflow `publish_release=true` (main).
4. Владелец ставит `aven-latest.apk` на реальное устройство (чек-лист приёма — в PR).

## Ограничения первой версии (фиксированный scope, не «перегреть»)

НЕТ: Google Play, автоапдейтера, push/background-сервисов, платежей, native-переписи,
новых персонажей/3D, voice-цепочки в shell. STT/system-TTS в WebView недоступны
(Web Speech API там нет) — поведение честно показывается в приложении и справке.
Страницы лаборатории голосов и 3D в APK не входят (экономия ~20 МБ) — вместо 404
показывается встроенное объяснение со ссылкой «назад в Aven».
