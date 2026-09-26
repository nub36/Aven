/* Aven prototype — абстракция TTS-провайдеров (docs/TTS_RESEARCH.md §7–10, §17–18). Не production.
 *
 *   TTSProvider = {
 *     id, label,
 *     privacy(voiceId) → 'device' | 'browser-online' | 'self-hosted' | 'bundled',
 *     voices() → [{ id, label, privacy, meta }],
 *     available() → Promise<boolean>,
 *     speak(speechText, { voice, rate, pitch, volume, signal, onStart }) → Promise (resolve по окончании),
 *     stop(),
 *     // Natural дополнительно (§9): health(), getStatus(), getVoice()
 *   }
 *
 *   SystemTTSProvider — браузерный speechSynthesis (ВСЕГДА остаётся как бесплатный fallback).
 *   NaturalTTSProviderExperimental — нейросетевые голоса из исследования:
 *       1) self-hosted/облачный сервер (research/tts/server.py — GPU-ПК или Modal, §18):
 *          GET {base}/api/tts/health → проверка, POST {base}/api/tts/synthesize → WAV;
 *       2) если сервера нет — заранее сгенерированные образцы (только тестовые фразы T1–T10);
 *       3) иначе — честная ошибка → менеджер говорит системным голосом
 *          («Natural Voice недоступен… — используется системный голос»), а не делает вид,
 *          что звучит Natural (ADR-010).
 *
 * Менеджер window.AvenTTS: normalize → provider → presence (preparing → speaking → idle),
 * stop() в любой момент, сессионный кэш аудио, замер задержки до начала звука,
 * таймаут запроса к серверу (natural.timeoutSec, по умолчанию 10 с) → fallback на системный.
 * Выбранный голос Natural по умолчанию — qwen3/vd17-design (решение владельца, §11).
 */
(function () {
  'use strict';

  var S = function () { return window.AvenState && window.AvenState.s(); };
  var cfg = function () {
    var st = S();
    var v = (st && st.settings && st.settings.voice) || {};
    v.natural = v.natural || {};
    return v;
  };

  /* ---------------- кэш (§9) ----------------
   * Только память вкладки (Map объектных URL), максимум 30 записей, без localStorage/IndexedDB.
   * Кэшируются лишь «общие» фразы: без цифр, e-mail и имён из профиля — личные ответы
   * (суммы, пробег, время дел) не кэшируются. Выключается в настройках. */
  var Cache = {
    max: 30,
    map: new Map(),
    cacheable: function (displayText) {
      var v = cfg();
      if (v.natural.cache === false) return false;
      if (/\d|@/.test(displayText) || displayText.length > 120) return false;
      var st = S();
      var name = st && st.profile && st.profile.name;
      if (name && displayText.indexOf(String(name).split(' ')[0]) >= 0) return false;
      return true;
    },
    get: function (k) {
      var u = this.map.get(k);
      if (u) { this.map.delete(k); this.map.set(k, u); }
      return u;
    },
    put: function (k, url) {
      this.map.set(k, url);
      while (this.map.size > this.max) {
        var first = this.map.keys().next().value;
        URL.revokeObjectURL(this.map.get(first));
        this.map.delete(first);
      }
    },
    clear: function () { this.map.forEach(function (u) { URL.revokeObjectURL(u); }); this.map.clear(); },
    get size() { return this.map.size; }
  };

  function abortError() { var e = new Error('aborted'); e.name = 'AbortError'; return e; }

  /* ---------------- System ---------------- */
  var SystemTTSProvider = {
    id: 'system',
    label: 'Системный голос (браузер / ОС)',
    ruVoices: function () {
      if (!window.speechSynthesis) return [];
      return window.speechSynthesis.getVoices().filter(function (v) { return (v.lang || '').toLowerCase().indexOf('ru') === 0; });
    },
    voices: function () {
      return this.ruVoices().map(function (v) {
        return { id: v.voiceURI, label: v.name, privacy: v.localService ? 'device' : 'browser-online', meta: { lang: v.lang } };
      });
    },
    pick: function (voiceURI) {
      var vs = this.ruVoices();
      return vs.find(function (v) { return v.voiceURI === voiceURI; }) || vs.find(function (v) { return v.localService; }) || vs[0] || null;
    },
    privacy: function (voiceURI) {
      var v = this.pick(voiceURI);
      if (!v) return 'device';
      return v.localService ? 'device' : 'browser-online';
    },
    available: function () { return Promise.resolve(!!(window.speechSynthesis && window.SpeechSynthesisUtterance)); },
    speak: function (text, o) {
      return new Promise(function (resolve, reject) {
        if (!window.speechSynthesis) return reject(new Error('speechSynthesis недоступен'));
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'ru-RU';
        u.rate = o.rate != null ? o.rate : 1;
        u.pitch = o.pitch != null ? o.pitch : 1;
        u.volume = o.volume != null ? o.volume : 1;
        var v = SystemTTSProvider.pick(o.voice);
        if (v) u.voice = v;
        u.onstart = function () { o.onStart && o.onStart(); };
        u.onend = function () { resolve(); };
        u.onerror = function (e) { (e && (e.error === 'interrupted' || e.error === 'canceled')) ? reject(abortError()) : reject(new Error(e && e.error || 'tts error')); };
        if (o.signal) o.signal.addEventListener('abort', function () { window.speechSynthesis.cancel(); reject(abortError()); });
        window.speechSynthesis.speak(u);
      });
    },
    stop: function () { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* noop */ } }
  };

  /* ---------------- Natural (эксперимент) ---------------- */
  var SAMPLES_BASE = 'assets/voice-samples/';
  var HEALTH_TIMEOUT_MS = 3000;        // быстрая проверка живого сервера
  var HEALTH_WAKE_TIMEOUT_MS = 75000;  // cold start serverless GPU (Modal): модель грузится десятки секунд
  var audioEl = null;
  var serverState = { checked: 0, ok: false, voices: [], base: null, error: '', kind: '', latencyMs: null, info: null };

  function samples() { return window.AvenVoiceSamples || { phrases: {}, voices: {} }; }
  function serverBase() { return (cfg().natural.serverUrl || '').replace(/\/+$/, ''); }
  function canon(t) { return String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim(); }
  function wakeTimeoutMs() {
    // тестовый хук (jsdom-тесты ускоряют вторую стадию); в продукте — всегда 75 с
    var v = (typeof window !== 'undefined' && Number(window.__AVEN_TTS_TEST_WAKE_MS)) || 0;
    return v > 0 ? v : HEALTH_WAKE_TIMEOUT_MS;
  }

  /* Таймаут ответа сервера на синтез (§13): по умолчанию 10 с — здоровый GPU-сервер отвечает
   * за доли секунды (TTS_RESEARCH §12.2: RTF 0,29–0,46), зависший не должен вешать Aven.
   * Для CPU-проверки собственного сервера значение поднимается в Настройках (CPU: 18–70 с!). */
  function timeoutCfg() {
    var t = Number(cfg().natural.timeoutSec);
    return (isFinite(t) && t >= 2 && t <= 600) ? t : 10;
  }

  function failState(base, error, kind, httpStatus) {
    serverState = { checked: Date.now(), ok: false, voices: [], base: base, error: error, kind: kind || '', httpStatus: httpStatus || null, latencyMs: null, info: null };
    return serverState;
  }

  /**
   * Проверка сервера (§14, §18). Результат — serverState:
   *   ok: true + voices[], latencyMs, info.engine/server/version
   *   ok: false + kind: 'no-base' | 'mixed-content' | 'http' (+httpStatus) | 'timeout' | 'network' | 'no-base'
   * Честный текст причины — в .error (никакого общего «не работает»).
   *
   * Две стадии (§18): сначала быстрый probe (3 с). Если он упёрся в timeout —
   * это может быть честный cold start serverless-бэкенда (Modal: контейнер с GPU
   * загружает модель десятки секунд, запрос висит, а не падает). Тогда одна
   * терпеливая повторная попытка (75 с); onWaking сообщают UI, что идёт просыпание.
   */
  function checkServer(force, onWaking) {
    var base = serverBase();
    if (location.protocol === 'file:' && !base) {
      return Promise.resolve(failState(base, 'страница открыта как файл — сервера нет', 'no-base'));
    }
    // §18: «пусто — тот же адрес, что у страницы». На HTTP это LAN/localhost-режим, а на HTTPS:
    // если страницу отдаёт сам TTS-сервер (например, прототип с https://tts--…modal.run/) —
    // health идёт относительным путём и всё работает; если же это GitHub Pages — статический
    // хостинг, синтезировать речь он не может, и пустое поле означает отсутствие сервера —
    // говорим это сразу и честно, не делая вид, что «проверяем» то, чего нет.
    if (location.protocol === 'https:' && !base && /github\.io$/i.test(location.hostname)) {
      return Promise.resolve(failState(base,
        'адрес TTS-сервера не задан. GitHub Pages — статический хостинг и синтезировать речь не может: ' +
        'нужен HTTPS-endpoint Aven TTS (research/tts/runtime/README.md — GPU-ПК или Modal)', 'no-base'));
    }
    if (!force && serverState.base === base && Date.now() - serverState.checked < 30000) return Promise.resolve(serverState);
    // §16: HTTPS-страница (GitHub Pages) не может обратиться к HTTP-серверу — браузер заблокирует.
    // Показываем причину сразу, не дожидаясь TypeError от fetch.
    if (location.protocol === 'https:' && /^http:\/\//i.test(base)) {
      return Promise.resolve(failState(base,
        'mixed content: страница открыта по HTTPS, а сервер — HTTP: браузер блокирует запрос. ' +
        'Local Development Mode: откройте прототип по HTTP с адреса сервера (http://<IP>:8080/) ' +
        'или поднимите TTS endpoint по HTTPS', 'mixed-content'));
    }
    return probeHealth(base, HEALTH_TIMEOUT_MS).then(function (st) {
      if (st.ok || st.kind !== 'timeout') return st;
      onWaking && onWaking();
      return probeHealth(base, wakeTimeoutMs());
    });
  }

  /** Один GET {base}/api/tts/health с таймаутом timeoutMs (см. checkServer). */
  function probeHealth(base, timeoutMs) {
    var ctl = new AbortController();
    var timedOut = false;
    var to = setTimeout(function () { timedOut = true; ctl.abort(); }, timeoutMs);
    var t0 = performance.now();
    function classify(e) {
      if (timedOut) return failState(base, 'нет ответа за ' + Math.round(timeoutMs / 1000) + ' с (timeout) — сервер молчит' +
        (timeoutMs > HEALTH_TIMEOUT_MS ? ' (включая ожидание cold start)' : ''), 'timeout');
      if (e && e.kind === 'http') {
        var h = e.httpStatus;
        var hint = h === 404 ? ' — endpoint не найден: по этому адресу работает НЕ Aven TTS server ' +
          '(нужен research/tts/server.py с /api/tts/health). Проверьте адрес и порт' : '';
        return failState(base, 'HTTP ' + h + hint, 'http', h);
      }
      // TypeError в браузере неотличим: нет соединения, DNS, CORS-блок — честно перечисляем варианты
      return failState(base, 'сеть/CORS: нет соединения, сервер не принимает соединение или CORS не разрешён ' +
        '(разрешённые origin задаются AVEN_TTS_ORIGINS на сервере)', 'network');
    }
    function proceed(j) {
      var latency = Math.round(performance.now() - t0);
      if (Array.isArray(j.voices)) {
        serverState = {
          checked: Date.now(), ok: true, voices: j.voices, base: base, error: '', kind: '',
          latencyMs: latency,
          info: { server: j.server || 'aven-tts', version: j.version || '?', engines: j.engines || {} }
        };
        return serverState;
      }
      // старый сервер: health есть, но списка голосов в нём нет → добираем /api/tts/voices
      return fetch(base + '/api/tts/voices', { signal: ctl.signal, cache: 'no-store' })
        .then(function (r) { if (!r.ok) { var e = new Error('HTTP ' + r.status); e.kind = 'http'; e.httpStatus = r.status; throw e; } return r.json(); })
        .then(function (j2) {
          serverState = { checked: Date.now(), ok: true, voices: j2.voices || [], base: base, error: '', kind: '', latencyMs: latency, info: { server: j.server || 'aven-tts', version: j.version || '?', engines: j.engines || {} } };
          return serverState;
        });
    }
    return fetch(base + '/api/tts/health', { signal: ctl.signal, cache: 'no-store' })
      .then(function (r) { if (!r.ok) { var e = new Error('HTTP ' + r.status); e.kind = 'http'; e.httpStatus = r.status; throw e; } return r.json(); })
      .then(proceed, classify)
      .then(function (st) { clearTimeout(to); return st; }, function (e) { clearTimeout(to); return classify(e); });
  }

  function playUrl(url, o) {
    return new Promise(function (resolve, reject) {
      if (audioEl) { audioEl.pause(); audioEl.src = ''; }
      var a = audioEl = new Audio();
      a.preload = 'auto';
      a.volume = o.volume != null ? Math.max(0, Math.min(1, o.volume)) : 1;
      a.onplaying = function () { o.onStart && o.onStart(); };
      a.onended = function () { resolve(); };
      a.onerror = function () { reject(new Error('не удалось воспроизвести аудио')); };
      if (o.signal) o.signal.addEventListener('abort', function () { a.pause(); reject(abortError()); });
      a.src = url;
      var p = a.play();
      if (p && p.catch) p.catch(function (e) { reject(e.name === 'AbortError' ? abortError() : e); });
    });
  }

  /* POST синтеза с таймаутом (§13): отдельный AbortController — внешний signal (Стоп/новая речь)
   * и таймер. Таймаут → ошибка 'NaturalTimeout' → fallback; внешняя отмена → AbortError → тишина. */
  function synthesizeFetch(text, o) {
    var ctl = new AbortController();
    var tsec = timeoutCfg();
    var timedOut = false;
    var to = setTimeout(function () { timedOut = true; ctl.abort(); }, tsec * 1000);
    if (o.signal) o.signal.addEventListener('abort', function () { ctl.abort(); });
    return fetch(serverBase() + '/api/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, voice: o.voice, rate: o.rate || 1 }),
      signal: ctl.signal
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('сервер TTS: HTTP ' + r.status + (t ? ' — ' + t.slice(0, 200) : '')); });
      return r.blob();
    }).then(function (b) {
      var url = URL.createObjectURL(b);
      if (o.cacheable) Cache.put(o.cacheKey, url);
      return playUrl(url, o).finally(function () { if (!o.cacheable) URL.revokeObjectURL(url); });
    }).catch(function (e) {
      if (timedOut) {
        var te = new Error('Natural Voice не ответил вовремя (' + tsec + ' с)');
        te.name = 'NaturalTimeout';
        throw te;
      }
      if (e && e.name === 'AbortError') throw abortError();
      throw e;
    }).finally(function () { clearTimeout(to); });
  }

  var NaturalTTSProviderExperimental = {
    id: 'natural',
    label: 'Натуральный голос (эксперимент)',
    lastSource: '',
    voices: function () {
      var list = [];
      var seen = {};
      serverState.voices.forEach(function (v) {
        seen[v.id] = 1;
        list.push({ id: v.id, label: v.label || v.id, privacy: 'self-hosted', meta: v });
      });
      var sv = samples().voices;
      var order = { shortlist: 0, baseline: 1, reference: 2, 'not-for-product': 3 };
      Object.keys(sv).filter(function (k) {
        // eSpeak — эталон «робота», не вариант; nameTestOnly — клипы мини-прогона произношения имени,
        // для озвучки реплик Aven они не подходят (нет образцов T1–T10).
        return !sv[k].catalogueOnly && !sv[k].nameTestOnly && !seen[k] && sv[k].engine !== 'espeak';
      }).sort(function (a, b) {
        return ((order[sv[a].status] != null ? order[sv[a].status] : 9) - (order[sv[b].status] != null ? order[sv[b].status] : 9)) || a.localeCompare(b);
      }).forEach(function (k) {
        list.push({ id: k, label: sv[k].title, privacy: 'bundled', meta: sv[k] });
      });
      return list;
    },
    privacy: function (voice) {
      return serverState.ok && serverState.voices.some(function (v) { return v.id === voice; }) ? 'self-hosted' : 'bundled';
    },
    available: function () {
      return checkServer().then(function (st) { return st.ok || Object.keys(samples().voices).length > 0; });
    },
    /* capabilities (§9): реальный health endpoint, статус, выбранный голос */
    health: function () { return checkServer(true); },
    getStatus: function () { return serverState; },
    getVoice: function () { return cfg().natural.voice || ''; },
    sampleFor: function (voice, speechText) {
      var man = samples();
      var v = man.voices[voice];
      if (!v) return null;
      var c = canon(speechText);
      var pid = Object.keys(man.phrases).find(function (id) {
        return canon(man.phrases[id].speech) === c || canon(man.phrases[id].text) === c;
      });
      return pid && v.phrases.indexOf(pid) >= 0 ? SAMPLES_BASE + voice + '/' + pid + '.mp3' : null;
    },
    speak: function (text, o) {
      var self = this;
      var key = [o.voice, o.rate, text].join('|');
      var cached = o.cacheable ? Cache.get(key) : null;
      if (cached) { self.lastSource = 'кэш сессии'; return playUrl(cached, o); }
      return checkServer().then(function (st) {
        var onServer = st.ok && st.voices.some(function (v) { return v.id === o.voice; });
        if (onServer) {
          self.lastSource = 'self-hosted сервер';
          return synthesizeFetch(text, {
            voice: o.voice, rate: o.rate, volume: o.volume, signal: o.signal,
            onStart: o.onStart, cacheable: o.cacheable, cacheKey: key
          });
        }
        var sample = self.sampleFor(o.voice, text);
        if (sample) { self.lastSource = 'готовый образец (исследование)'; return playUrl(sample, o); }
        var err = new Error(st.ok ? 'этого голоса нет на сервере, а готового образца для фразы нет' : 'сервер TTS недоступен (' + (st.error || 'нет ответа') + '), а готового образца для этой фразы нет');
        err.name = 'NaturalUnavailable';
        throw err;
      });
    },
    stop: function () { if (audioEl) { audioEl.pause(); } }
  };

  /* ---------------- менеджер ---------------- */
  var providers = { system: SystemTTSProvider, natural: NaturalTTSProviderExperimental };
  var current = null; // { ctl, provider }
  var stats = { lastLatencyMs: null, lastEngine: '', lastSource: '', lastFallback: '' };

  var P = function () { return window.AvenPresence; };

  function stop() {
    if (current) { current.ctl.abort(); current = null; }
    SystemTTSProvider.stop();
    NaturalTTSProviderExperimental.stop();
    if (P() && (P().get() === 'speaking' || P().get() === 'preparing')) P().set('idle');
  }

  /**
   * speak(displayText, { btn, rate, pitch, engine, voice, onStart, onEnd }) → Promise<boolean>
   * displayText не меняется; в TTS уходит normalize(displayText).
   */
  function speak(displayText, o) {
    o = o || {};
    stop();
    var v = cfg();
    var engine = o.engine || v.engine || 'system';
    var speechText = window.AvenSpeechText ? window.AvenSpeechText.normalize(displayText) : displayText;
    var ctl = new AbortController();
    var me = current = { ctl: ctl };
    var t0 = performance.now();
    var btn = o.btn;
    if (btn) btn.classList.add('playing');

    function started(label, speakLabel) {
      return function () {
        if (current !== me) return;
        stats.lastLatencyMs = Math.round(performance.now() - t0);
        stats.lastEngine = label;
        if (P()) P().set('speaking', speakLabel ? { label: speakLabel } : undefined);
        o.onStart && o.onStart(stats);
      };
    }
    function finish(ok) {
      if (btn) btn.classList.remove('playing');
      if (current === me) { current = null; if (P()) P().set('idle'); }
      o.onEnd && o.onEnd(ok, stats);
      return ok;
    }
    function viaSystem(speakLabel) {
      return SystemTTSProvider.speak(speechText, {
        voice: v.voiceURI, rate: o.rate != null ? o.rate : v.rate, pitch: o.pitch != null ? o.pitch : v.pitch,
        volume: v.volume, signal: ctl.signal, onStart: started('system', speakLabel)
      });
    }

    var run;
    stats.lastFallback = '';
    if (engine === 'natural') {
      if (P()) P().set('preparing');
      // сохранённый голос мог быть удалён из набора образцов — берём первый доступный
      var natList = NaturalTTSProviderExperimental.voices();
      var natVoice = o.voice || v.natural.voice;
      if (!natList.some(function (x) { return x.id === natVoice; }) && natList.length) natVoice = natList[0].id;
      run = NaturalTTSProviderExperimental.speak(speechText, {
        voice: natVoice, rate: v.natural.rate || 1, volume: v.volume,
        signal: ctl.signal, onStart: started('natural', 'Говорю · Natural'), cacheable: Cache.cacheable(displayText)
      }).then(function () { stats.lastSource = NaturalTTSProviderExperimental.lastSource; })
        .catch(function (e) {
          if (e.name === 'AbortError') throw e;
          // Fallback: Aven всё равно говорит — системным голосом, и ЧЕСТНО сообщает об этом (ADR-010):
          // пользователь всегда видит, что звучит не Natural, а системный голос.
          stats.lastFallback = e.message || String(e);
          stats.lastSource = 'fallback → системный голос';
          if (window.Aven && window.Aven.toast) {
            window.Aven.toast(e.name === 'NaturalTimeout'
              ? 'Natural Voice не ответил вовремя — используется системный голос'
              : 'Natural Voice недоступен (' + stats.lastFallback + ') — используется системный голос');
          }
          return viaSystem('Говорю · системный голос');
        });
    } else {
      stats.lastSource = 'speechSynthesis';
      run = viaSystem();
    }
    return run.then(function () { return finish(true); }, function (e) {
      if (e.name !== 'AbortError' && window.Aven && window.Aven.ttsToast) window.Aven.ttsToast();
      return finish(false);
    });
  }

  function privacyInfo(engine, voice) {
    var p = engine === 'natural' ? NaturalTTSProviderExperimental.privacy(voice) : SystemTTSProvider.privacy(voice);
    return {
      device: { tag: 'Локально', ok: true, text: 'Речь синтезируется на этом устройстве, текст никуда не отправляется.' },
      'browser-online': { tag: 'Онлайн-голос браузера', ok: false, text: 'Этот системный голос облачный: браузер отправляет текст поставщику (Google / Microsoft / Apple). Для личных данных выберите голос с пометкой «на устройстве».' },
      'self-hosted': { tag: 'Self-hosted', ok: true, text: 'Текст уходит только на ваш собственный TTS-сервер (' + (serverBase() || location.host) + '). Внешние облака не используются.' },
      bundled: { tag: 'Готовые образцы', ok: true, text: 'Воспроизводятся заранее записанные файлы из прототипа. Произвольный текст без сервера озвучивается системным голосом.' }
    }[p];
  }

  window.AvenTTS = {
    providers: providers,
    speak: speak,
    stop: stop,
    isSpeaking: function () { return !!current; },
    checkServer: checkServer,
    server: function () { return serverState; },
    timeoutCfg: timeoutCfg,
    stats: stats,
    cache: Cache,
    privacyInfo: privacyInfo
  };
})();
