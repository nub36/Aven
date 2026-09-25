/* Aven prototype — абстракция TTS-провайдеров (docs/TTS_RESEARCH.md §7–10). Не production.
 *
 *   TTSProvider = {
 *     id, label,
 *     privacy(voiceId) → 'device' | 'browser-online' | 'self-hosted' | 'bundled',
 *     voices() → [{ id, label, privacy, meta }],
 *     available() → Promise<boolean>,
 *     speak(speechText, { voice, rate, pitch, volume, signal, onStart }) → Promise (resolve по окончании),
 *     stop()
 *   }
 *
 *   SystemTTSProvider — браузерный speechSynthesis (ВСЕГДА остаётся как бесплатный fallback).
 *   NaturalTTSProviderExperimental — нейросетевые голоса из исследования:
 *       1) self-hosted сервер (research/tts/server.py): POST {base}/api/tts/synthesize → WAV;
 *       2) если сервера нет — заранее сгенерированные образцы (только тестовые фразы T1–T10);
 *       3) иначе — честная ошибка → менеджер говорит системным голосом.
 *
 * Менеджер window.AvenTTS: normalize → provider → presence (preparing → speaking → idle),
 * stop() в любой момент, сессионный кэш аудио, замер задержки до начала звука.
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
  var audioEl = null;
  var serverState = { checked: 0, ok: false, voices: [], base: null, error: '' };

  function samples() { return window.AvenVoiceSamples || { phrases: {}, voices: {} }; }
  function serverBase() { return (cfg().natural.serverUrl || '').replace(/\/+$/, ''); }
  function canon(t) { return String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim(); }

  function checkServer(force) {
    var base = serverBase();
    if (location.protocol === 'file:' && !base) {
      serverState = { checked: Date.now(), ok: false, voices: [], base: base, error: 'страница открыта как файл — сервера нет' };
      return Promise.resolve(serverState);
    }
    if (!force && serverState.base === base && Date.now() - serverState.checked < 30000) return Promise.resolve(serverState);
    var ctl = new AbortController();
    var to = setTimeout(function () { ctl.abort(); }, 1500);
    return fetch(base + '/api/tts/voices', { signal: ctl.signal, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { serverState = { checked: Date.now(), ok: true, voices: j.voices || [], base: base, error: '' }; return serverState; })
      .catch(function (e) { serverState = { checked: Date.now(), ok: false, voices: [], base: base, error: e.name === 'AbortError' ? 'нет ответа' : String(e.message || e) }; return serverState; })
      .finally(function () { clearTimeout(to); });
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
        return !sv[k].catalogueOnly && !seen[k] && sv[k].engine !== 'espeak'; // eSpeak — эталон «робота», не вариант
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
          return fetch(serverBase() + '/api/tts/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, voice: o.voice, rate: o.rate || 1 }),
            signal: o.signal
          }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error('сервер TTS: ' + (t || r.status)); });
            return r.blob();
          }).then(function (b) {
            var url = URL.createObjectURL(b);
            if (o.cacheable) Cache.put(key, url);
            return playUrl(url, o).finally(function () { if (!o.cacheable) URL.revokeObjectURL(url); });
          });
        }
        var sample = self.sampleFor(o.voice, text);
        if (sample) { self.lastSource = 'готовый образец (исследование)'; return playUrl(sample, o); }
        var err = new Error(st.ok ? 'этого голоса нет на сервере, а готового образца для фразы нет' : 'сервер TTS недоступен, а готового образца для этой фразы нет');
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

    function started(label) {
      return function () {
        if (current !== me) return;
        stats.lastLatencyMs = Math.round(performance.now() - t0);
        stats.lastEngine = label;
        if (P()) P().set('speaking');
        o.onStart && o.onStart(stats);
      };
    }
    function finish(ok) {
      if (btn) btn.classList.remove('playing');
      if (current === me) { current = null; if (P()) P().set('idle'); }
      o.onEnd && o.onEnd(ok, stats);
      return ok;
    }
    function viaSystem() {
      return SystemTTSProvider.speak(speechText, {
        voice: v.voiceURI, rate: o.rate != null ? o.rate : v.rate, pitch: o.pitch != null ? o.pitch : v.pitch,
        volume: v.volume, signal: ctl.signal, onStart: started('system')
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
        signal: ctl.signal, onStart: started('natural'), cacheable: Cache.cacheable(displayText)
      }).then(function () { stats.lastSource = NaturalTTSProviderExperimental.lastSource; })
        .catch(function (e) {
          if (e.name === 'AbortError') throw e;
          // Fallback: Aven всё равно говорит — системным голосом, и честно сообщает об этом
          stats.lastFallback = e.message || String(e);
          stats.lastSource = 'fallback → системный голос';
          if (window.Aven && window.Aven.toast) window.Aven.toast('Натуральный голос недоступен (' + stats.lastFallback + ') — говорю системным голосом');
          return viaSystem();
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
    stats: stats,
    cache: Cache,
    privacyInfo: privacyInfo
  };
})();
