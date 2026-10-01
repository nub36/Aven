/* Aven для Android — минимальный WebView-shell прототипа (Android distribution stage,
 * 2026-10-01, ADR-114). Native-копии разделов НЕ создаются: вся бизнес-логика остаётся
 * общей с web (prototype/), shell добавляет только Android-семантику:
 *
 *   - контент: WebViewAssetLoader, origin https://localhost (дет.1.1 — локальные ассеты
 *     из app/src/main/assets/www, синхронизируются android/sync-web-assets.sh);
 *   - Back: сначала история внутри Aven (WebView.goBack), затем выход по конвенции Android;
 *   - внешние http/https-ссылки → системный браузер; не-http(s) схемы блокируются;
 *   - страницы лаборатории/3D в APK не входят → честная заглушка вместо белого экрана;
 *   - storage: domStorageEnabled → localStorage («aven-proto-v1») сохраняется между
 *     запусками; облачной синхронизации нет (allowBackup=false в manifest);
 *   - сеть: только HTTPS для внешних запросов (cleartext отключён, см. manifest +
 *     network_security_config); certificate validation не отключается;
 *   - permissions: только INTERNET (микрофон/камера/геолокация не запрашиваются).
 */
package io.github.nub36.aven;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.util.Locale;

public class MainActivity extends Activity {

    private WebView web;
    private WebViewAssetLoader assetLoader;

    private static final String HOME_URL = "https://localhost/assets/www/index.html";

    /* Страницы исследования (voice-lab/voice-compare/aven-3d + их медиа) не входят в APK:
     * экономия ~20 МБ и осознанный scope (docs/ADR-114). Вместо 404 — честное объяснение. */
    private boolean isExcludedPage(String path) {
        if (path == null) return false;
        String p = path.toLowerCase(Locale.US);
        return p.endsWith("voice-lab.html") || p.endsWith("voice-lab-vd17.html")
                || p.endsWith("voice-lab-name.html") || p.endsWith("voice-compare.html")
                || p.endsWith("aven-3d.html") || p.endsWith("aven-3d-v2.html");
    }

    private void showExcludedPageNotice() {
        String html = "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>Недоступно в приложении</title></head>"
                + "<body style=\"font-family:sans-serif;margin:24px;line-height:1.5\">"
                + "<h2 style=\"margin:0 0 8px\">Эта страница не входит в Android-версию</h2>"
                + "<p>Лаборатория голосов и 3D-эксперименты — часть только веб-прототипа: "
                + "их медиаматериалы не включены в установочный APK, чтобы он оставался лёгким.</p>"
                + "<p>Откройте веб-версию Aven в браузере, чтобы посмотреть эти материалы.</p>"
                + "<p><a href=\"" + HOME_URL + "\">← Вернуться в Aven</a></p>"
                + "</body></html>";
        web.loadDataWithBaseURL(HOME_URL, html, "text/html", "utf-8", null);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .setDomain("localhost")
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);              // прототип — JS-приложение
        s.setDomStorageEnabled(true);              // localStorage «aven-proto-v1» — persistence между запусками
        s.setAllowFileAccess(false);               // контент только через assetLoader (https://localhost)
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMediaPlaybackRequiresUserGesture(false); // WebView-аналог sticky-gesture: иначе озвучка
        // ответов/предпрослушивание, инициированная из async fetch по уже случившемуся клику,
        // блокировалась бы автоплей-политикой. Стороннего контента в shell нет.

        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.US);
                String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.US);

                // внутренние ссылки Aven (локальный origin обёртки) — внутри приложения
                if ("https".equals(scheme) && "localhost".equals(host)) {
                    String path = u.getPath();
                    if (path != null && isExcludedPage(path)) {
                        showExcludedPageNotice();
                        return true;
                    }
                    return false; // обычная навигация/hash — WebView сам обработает
                }

                // внешние http/https — в системный браузер
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (android.content.ActivityNotFoundException ignored) {
                        // нет системного браузера — просто не открываем
                    }
                    return true;
                }

                // произвольные схемы (intent:, market:, javascript:, data:, tel: и т.п.) — блокируем
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState); // поворот/пересоздание — не теряем маршрут
        } else {
            web.loadUrl(HOME_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    /* Android Back: сначала назад внутри Aven (#/home → предыдущий hash), затем — выход. */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
