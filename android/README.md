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

GitHub Actions (основной путь): Actions → **Android APK** → Run workflow. Первый запуск
bootstrap'ит release-key в Actions Secrets (`AVEN_ANDROID_KEYSTORE_*`), далее подпись
стабильна (поверхустановка работает). Workflow всегда выкладывает artifact
(`android-apk-<run_id>`: aven-<VN>.apk, aven-latest.apk, sha256sums, apksigner/aapt-логи);
с `publish_release=true` дополнительно создаёт tag `aven-android-v<VN>` и GitHub Release.

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
