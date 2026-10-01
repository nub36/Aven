/* Aven — Visual Prototype. Конфигурация скачивания Android-приложения (Android distribution
   stage, 2026-10-01, ADR-114). Используют: кнопка «📱 Android» в топбаре (desktop), пункт
   «Скачать приложение» в drawer (mobile/desktop), модальное окно загрузки, справка.

   Источник версии приложения — android/version.txt; при выпуске APK версии здесь и там
   меняют синхронно (чек-лист релиза — android/README.md). Скачивание — через GitHub Releases
   (бинарные APK в git-хистории не хранятся): «latest» указывает на последний опубликованный
   релиз, поэтому URL кнопки стабилен между версиями. */
window.AvenAppDownload = {
  version: '0.1.0',            // = VERSION_NAME из android/version.txt
  versionCode: 1,
  apkFile: 'aven-0.1.0.apk',   // именованный asset релиза (фиксированная версия)
  apkUrl: 'https://github.com/nub36/Aven/releases/latest/download/aven-latest.apk',
  releasePage: 'https://github.com/nub36/Aven/releases/latest',
  sizeHint: '≈8 МБ',           // уточняется по факту сборки (WORK_LOG)
  applicationId: 'io.github.nub36.aven',
  minAndroid: 'Android 7.0+',  // minSdk 24
  channel: 'GitHub Releases',  // ручная установка APK, вне Google Play (осознанно, ADR-114)
  // Подпись релизных APK: 'stable' — ключ в Actions Secrets (создаёт владелец по
  // android/README.md); 'ephemeral' — временный ключ сборки (интерни, см. ADR-114):
  // тогда поверхустановка следующего релиза ТРЕБУЕТ удаления старого приложения.
  signing: 'ephemeral'
};
