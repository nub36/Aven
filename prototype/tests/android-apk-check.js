/* Проверка Android wrapper'а и веб-CTA (Android distribution stage, ADR-114).
 * Чистый node БЕЗ jsdom и БЕЗ Android SDK: статические контракты проекта-android/,
 * полнота web-bundle после sync-web-assets.sh, CTA на сайте, отсутствие секретов.
 * Реальная сборка/верификация APK — GitHub Actions .github/workflows/android-apk.yml
 * (apksigner verify + aapt dump badging в CI-логе).
 *
 * Запуск:
 *   node prototype/tests/android-apk-check.js [--no-sync]
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const A = path.join(ROOT, 'android');
const WWW = path.join(A, 'app', 'src', 'main', 'assets', 'www');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readAbs = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* ---------- A. Структура проекта ---------- */
{
  const need = [
    'android/settings.gradle', 'android/build.gradle', 'android/gradle.properties',
    'android/gradle/wrapper/gradle-wrapper.properties', 'android/version.txt',
    'android/app/build.gradle', 'android/sync-web-assets.sh',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/java/io/github/nub36/aven/MainActivity.java',
    'android/app/src/main/res/values/strings.xml', 'android/app/src/main/res/values/colors.xml',
    'android/app/src/main/res/xml/network_security_config.xml',
    'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'
  ];
  ok('A1 файлы проекта android/ на месте', need.every(exists), need.filter((p) => !exists(p)).join(','));
  const icons = [];
  ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].forEach((d) => {
    ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'].forEach((f) => {
      const p = 'android/app/src/main/res/mipmap-' + d + '/' + f;
      if (exists(p)) icons.push(p);
    });
  });
  ok('A2 иконки лаунчера на 5 плотностей (15 PNG)', icons.length === 15, String(icons.length));
  ok('A3 gradle-wrapper.jar НЕ коммитится (генерируется в CI)', !exists('android/gradle/wrapper/gradle-wrapper.jar'));
  const walk = [];
  (function scan(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/assets|build/.test(e.name)) scan(fp); }
      else walk.push(fp);
    });
  })(A);
  ok('A4 в репозитории нет keystore/ключей (*.keystore/*.jks/*.p12)', !walk.some((p) => /\.(keystore|jks|p12|pem|key)$/i.test(p)), walk.filter((p) => /\.(keystore|jks|p12|pem|key)$/i.test(p)).join(','));
  const gi = read('.gitignore');
  ok('A5 .gitignore покрывает android-артефакты (build/.gradle/local.properties/www)',
    /android\/\*\/build|android\/build/.test(gi) && /local\.properties/.test(gi) && /assets\/www/.test(gi), gi.split('\n').filter((l) => l.includes('android')).join(' | '));
  ok('A6 APK бинарь не хранится в репо (ни один *.apk не коммитится)',
    !walk.some((p) => p.endsWith('.apk')) && /\.apk$/.test(gi) === false || !walk.some((p) => p.endsWith('.apk')),
    walk.filter((p) => p.endsWith('.apk')).join(','));
  ok('A7 workflow android-apk.yml существует', exists('.github/workflows/android-apk.yml'));
}

/* ---------- B. Manifest/Gradle контракт ---------- */
{
  const man = read('android/app/src/main/AndroidManifest.xml');
  const perms = (man.match(/<uses-permission\s+android:name="([^"]+)"/g) || []);
  ok('B1 единственный permission — INTERNET', perms.length === 1 && /android\.permission\.INTERNET/.test(perms[0]), perms.join(','));
  ok('B2 cleartext выключен на уровне manifest + network config',
    /usesCleartextTraffic="false"/.test(man) && /networkSecurityConfig/.test(man) &&
    /cleartextTrafficPermitted="false"/.test(read('android/app/src/main/res/xml/network_security_config.xml')));
  ok('B3 авто-бэкап выключен (данные только локально, без облака)', /allowBackup="false"/.test(man));
  ok('B4 launcher activity exported + adjustResize + configChanges (поворот без рестарта web-слоя)',
    /exported="true"/.test(man) && /adjustResize/.test(man) && /configChanges=/.test(man) && /singleTask/.test(man));
  ok('B5 имя приложения — «Aven»', /<string name="app_name">Aven<\/string>/.test(read('android/app/src/main/res/values/strings.xml')));
  const vt = read('android/version.txt');
  const vn = (vt.match(/^VERSION_NAME=(.+)$/m) || [])[1];
  const vc = (vt.match(/^VERSION_CODE=(\d+)$/m) || [])[1];
  ok('B6 version.txt содержит VERSION_NAME/VERSION_CODE', !!vn && !!vc, vt.trim());
  const bg = read('android/app/build.gradle');
  ok('B7 gradle: applicationId io.github.nub36.aven', /applicationId 'io\.github\.nub36\.aven'/.test(bg));
  ok('B8 gradle: minSdk 24 / targetSdk 34 / compileSdk 34, Java 17', /minSdk 24/.test(bg) && /targetSdk 34/.test(bg) && /compileSdk 34/.test(bg) && /VERSION_17/.test(bg));
  ok('B9 gradle: подпись только из env, никаких inline-паролей', !/storePassword\s+['"]/.test(bg) && !/keyPassword\s+['"]/.test(bg) && /System\.getenv\('AVEN_KEYSTORE_FILE'\)/.test(bg));
  ok('B10 gradle: зависимость одна — androidx.webkit (WebViewAssetLoader)', (bg.match(/implementation '/g) || []).length === 1 && /androidx\.webkit:webkit:/.test(bg), bg.split('\n').filter((l) => l.includes('implementation')).join(';'));
}

/* ---------- C. MainActivity контракт ---------- */
{
  const m = read('android/app/src/main/java/io/github/nub36/aven/MainActivity.java');
  ok('C1 локальные ассеты через WebViewAssetLoader, origin https://localhost', /WebViewAssetLoader/.test(m) && /setDomain\("localhost"\)/.test(m) && /https:\/\/localhost\/assets\/www\/index\.html/.test(m));
  ok('C2 Back: goBack внутри истории Aven, затем системный выход', /canGoBack\(\)/.test(m) && /goBack\(\)/.test(m) && /super\.onBackPressed\(\)/.test(m));
  ok('C3 внешние http/https → системный браузер (ACTION_VIEW), домен localhost обрабатывается внутри',
    /ACTION_VIEW/.test(m) && /setAllowUniversalAccessFromFileURLs\(false\)/.test(m));
  ok('C4 не-http(s) схемы блокируются (исключён произвольный intent:/javascript:)', /схемы.*блокируем|return true;\s*$/m.test(m));
  ok('C5 storage включён и изолирован: domStorageEnabled(true), file/content access выключены',
    /setDomStorageEnabled\(true\)/.test(m) && /setAllowFileAccess\(false\)/.test(m) && /setAllowContentAccess\(false\)/.test(m));
  ok('C6 WebView debugging не включён принудительно', !/setWebContentsDebuggingEnabled\(true\)/.test(m));
  ok('C7 TTS: mediaPlaybackRequiresUserGesture(false) (проигрывание после async-синтеза)', /setMediaPlaybackRequiresUserGesture\(false\)/.test(m));
  ok('C8 исключённые lab/3D страницы — честная заглушка (не белый экран)', /isExcludedPage/.test(m) && /loadDataWithBaseURL/.test(m));
}

/* ---------- D. Web-bundle (после sync) ---------- */
{
  if (!process.argv.includes('--no-sync')) {
    cp.execSync('bash android/sync-web-assets.sh', { cwd: ROOT, stdio: 'pipe' });
  }
  ok('D1 bundle www существует после sync', fs.existsSync(WWW) && fs.existsSync(path.join(WWW, 'index.html')));
  const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  const refs = [];
  const re = /(?:src|href)="([^"#]+?)"/g; let mm;
  while ((mm = re.exec(html))) {
    const u = mm[1];
    if (/^(data:|https?:|mailto:|#)/.test(u)) continue;
    refs.push(u.replace(/\?.*$/, ''));
  }
  const missing = refs.filter((u) => !fs.existsSync(path.join(WWW, u)));
  ok('D2 все src/href из index.html существуют в bundle', missing.length === 0, missing.join(','));
  ok('D3 __ASSET_VERSION__ подставлен версией', !/__ASSET_VERSION__/.test(html));
  const heavy = ['assets/3d', 'assets/vendor', 'assets/character/master', 'assets/character/v2-reference-views'];
  ok('D4 тяжёлые research-ассеты НЕ входят в bundle', heavy.every((d) => !fs.existsSync(path.join(WWW, d))));
  let files = 0, bytes = 0, mp3 = 0;
  (function scan(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) scan(fp);
      else { files++; bytes += fs.statSync(fp).size; if (fp.endsWith('.mp3')) mp3++; }
    });
  })(WWW);
  ok('D5 в bundle нет MP3 лаборатории голосов', mp3 === 0, String(mp3));
  ok('D6 размер bundle ≤ 6 МБ (цель ~2.5 МБ без research-ассетов)', bytes <= 6 * 1024 * 1024, (bytes / 1048576).toFixed(2) + ' МБ, файлов ' + files);
  ['assets/aven-female.png', 'assets/aven-male.png', 'assets/character/web/female-aven-transparent.png', 'assets/voice-samples/manifest.js']
    .forEach((f, i) => ok('D7.' + (i + 1) + ' в bundle есть ' + f, fs.existsSync(path.join(WWW, f))));
  ['voice-lab.html', 'voice-lab-vd17.html', 'voice-lab-name.html', 'voice-compare.html', 'aven-3d.html', 'aven-3d-v2.html']
    .forEach((f, i) => ok('D8.' + (i + 1) + ' lab/3D-страница ' + f + ' НЕ входит в bundle', !fs.existsSync(path.join(WWW, f))));
  ok('D9 js/aven3d.js исключён из bundle (его страницы не входят)', !fs.existsSync(path.join(WWW, 'js', 'aven3d.js')));
}

/* ---------- E. CTA на веб-сайте ---------- */
{
  const idx = read('prototype/index.html');
  const pB = idx.indexOf('demo-badge'), pC = idx.indexOf('id="android-cta"'), pN = idx.indexOf('id="notif-btn"');
  ok('E1 кнопка «📱 Android» в топбаре (после demo-badge, до правых контролов)',
    pB >= 0 && pC > pB && pN > pC && /data-action="android-download"/.test(idx.slice(pC, pN)),
    'positions: ' + [pB, pC, pN].join('<'));
  ok('E1b topbar-CTA содержит подпись «📱 Android»', /android-cta" data-action="android-download"[^>]*>📱 Android<\/button>/.test(idx));
  ok('E2 js/app-download.js подключён в index.html', /js\/app-download\.js\?v=/.test(idx));
  const css = read('prototype/css/style.css');
  const media = css.slice(css.indexOf('@media (max-width: 860px)'));
  ok('E3 правило .top-android-cta есть в CSS', /\.top-android-cta/.test(css));
  ok('E4 на mobile (≤860px) topbar-CTA скрыта (CTA живёт в drawer, overflow исключён)', /\.top-android-cta\s*\{\s*display:\s*none/.test(media));
  const app = read('prototype/js/app.js');
  ok('E5 drawer: пункт «Скачать приложение» (data-id=android-download, свой data-action)', /data-action="android-download" data-id="android-download"/.test(app));
  ok('E6 обработчик android-download зарегистрирован и ведёт в модальное окно', /'android-download': \(\) => \{ setMobileMenu\(false\); openAndroidDownloadModal\(\); \}/.test(app));
  ok('E7 модальное окно показывает версию/размер/инструкцию установки', /openAndroidDownloadModal/.test(app) && /Как установить/.test(app) && /releasePage/.test(app));
  const dcfg = read('prototype/js/app-download.js');
  const vt = read('android/version.txt');
  const vn = (vt.match(/^VERSION_NAME=(.+)$/m) || [])[1].trim();
  const dvn = (dcfg.match(/version: '([^']+)'/) || [])[1];
  ok('E8 версия в app-download.js совпадает с android/version.txt', dvn === vn, dvn + ' vs ' + vn);
  ok('E9 download URL — стабильный releases/latest/download/aven-latest.apk',
    /github\.com\/nub36\/Aven\/releases\/latest\/download\/aven-latest\.apk/.test(dcfg));
  ok('E10 help-статья «Aven для Android» есть (id start-android, с инструкцией установки)',
    /id: 'start-android'/.test(read('prototype/js/help.js')) && /разрешение/.test(read('prototype/js/help.js')));
}

/* ---------- F. Прочие guard checks ---------- */
{
  const wf = read('.github/workflows/android-apk.yml');
  ok('F1 workflow: не публикует релиз с marker-push (только workflow_dispatch+publish_release)',
    /github\.event_name == 'workflow_dispatch' && inputs\.publish_release/.test(wf));
  ok('F2 workflow: APK верифицируется apksigner и aapt до любой публикации', /apksigner" verify|"--print-certs"|apksigner verify/.test(wf) && /aapt" dump badging|"aapt" dump|aapt dump badging/.test(wf));
  const f3a = /-storepass:env STORE_PASS/.test(wf);              // пароль не в argv keytool
  const f3b = /::add-mask::\$STORE_PASS/.test(wf) && /::add-mask::\$KEY_PASS/.test(wf); // замаскированы до использования
  const f3c = !/echo\s+["']?\$(STORE_PASS|KEY_PASS)["']?\s*$/m.test(wf); // нет прямого echo пароля в лог
  const f3d = /unset STORE_PASS KEY_PASS/.test(wf);               // стираемся из окружения шага
  ok('F3 workflow: пароли маскируются (add-mask), keytool читает из env, прямого echo нет', f3a && f3b && f3c && f3d, [f3a, f3b, f3c, f3d].join(','));
  ok('F4 workflow: сборка падает без keystore/паролей (никаких unsigned релизов)', /test -n "\$\{AVEN_KEYSTORE_PASSWORD:-\}"/.test(wf));
  ok('F5 workflow: нет невалидных permission-scopes / попыток записи Secrets (GITHUB_TOKEN не умеет)',
    !/^\s+secrets\s*:/m.test(wf) && !/gh secret set/.test(wf), 'запись Secrets только владельцем — android/README.md');
  ok('F6 workflow: режим подписи фиксируется в build-info (ephemeral|secrets)', /signing_mode=/.test(wf) && /AVEN_SIGNING_MODE/.test(wf));
  // PKCS12: Java всегда шифрует ключ паролем STORE — отдельный -keypass keytool игнорирует,
  // и AGP падает «Get Key failed: Given final block not properly padded» (run 36844417480).
  ok('F7 workflow: ephemeral PKCS12 — один пароль для store и key (KEY_PASS=STORE_PASS, без отдельного -keypass)',
    /KEY_PASS="\$STORE_PASS"/.test(wf) && !/-keypass:env/.test(wf));
  ok('F8 android/README: инструкция стабильного ключа не разводит store/key пароли PKCS12',
    !/ПАРОЛЬ_КЛЮЧА/.test(read('android/README.md')) && /ОДИН_ПАРОЛЬ/.test(read('android/README.md')));
}

console.log('\nИТОГО: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
