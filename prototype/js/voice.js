/* Aven — Visual Prototype. Голос: TTS (System speechSynthesis / Natural-эксперимент) и
   экспериментальный STT через SpeechRecognition. Честная поддержка возможностей
   браузера: при недоступности — всегда текстовый fallback (ADR-003/ADR-010).
   Не production. */
window.AvenVoice = (function () {
  const S = window.AvenState;
  const s = () => S.s();

  const support = {
    get tts() { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance); },
    get stt() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  };

  /* ---------- TTS ----------
     Маршрутизация через window.AvenTTS (js/tts/providers.js): System (speechSynthesis —
     всегда доступный бесплатный fallback) или Natural (эксперимент, docs/TTS_RESEARCH.md).
     Экранный текст не меняется — в синтез уходит AvenSpeechText.normalize(text).
     opts: { charProfile } — демо-профиль персонажа (высота/темп системного голоса).
     Повторное нажатие на играющую кнопку или Esc — остановить речь. */
  function speak(text, btn, opts) {
    opts = opts || {};
    const voice = (s().settings && s().settings.voice) || { enabled: true };
    if (voice.enabled === false) { window.Aven && window.Aven.toast('Голосовые ответы выключены в настройках (демо)'); return false; }
    const T = window.AvenTTS;
    if (btn && btn.classList.contains('playing') && T && T.isSpeaking()) { T.stop(); return false; }
    const engine = voice.engine || 'system';
    if (engine === 'system' && !support.tts) { window.Aven && window.Aven.ttsToast(); pulse(btn); return false; }
    let rate, pitch;
    if (opts.charProfile && window.AvenChar) {
      const p = window.AvenChar.voiceProfile();
      if (p) { if (voice.pitch == null || voice.pitch === 1) pitch = p.pitch; if (voice.rate == null || voice.rate === 1) rate = p.rate; }
    }
    if (!T) { window.Aven && window.Aven.ttsToast(); pulse(btn); return false; }
    T.speak(text, { btn, rate, pitch, onStart: opts.onStart, onEnd: opts.onEnd });
    return true;
    function pulse(b) {
      if (!b) return;
      b.classList.add('playing');
      setTimeout(() => b.classList.remove('playing'), 900);
    }
  }

  function stop() { if (window.AvenTTS) window.AvenTTS.stop(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && window.AvenTTS && window.AvenTTS.isSpeaking()) stop(); });

  /* ---------- экспериментальный STT ----------
     createRecognizer({ lang, interim, onStart, onInterim, onFinal, onEnd, onError })
     Возвращает { start, stop, active } или null, если браузер не поддерживает. */
  function createRecognizer(handlers) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    let rec = null;
    let active = false;
    const st = (s().settings && s().settings.voice && s().settings.voice.stt) || { lang: 'ru-RU', interim: true };
    const api = {
      get active() { return active; },
      start() {
        if (active) return true;
        try {
          rec = new SR();
          rec.lang = (handlers && handlers.lang) || st.lang || 'ru-RU';
          rec.interimResults = !!(handlers && handlers.interim !== undefined ? handlers.interim : st.interim);
          rec.continuous = false;
          rec.maxAlternatives = 1;
          rec.onstart = () => { active = true; handlers && handlers.onStart && handlers.onStart(); };
          rec.onresult = (e) => {
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const t = e.results[i][0] && e.results[i][0].transcript ? e.results[i][0].transcript : '';
              if (e.results[i].isFinal) final += t; else interim += t;
            }
            if (interim) handlers && handlers.onInterim && handlers.onInterim(interim.trim());
            if (final.trim()) handlers && handlers.onFinal && handlers.onFinal(final.trim());
          };
          rec.onerror = (e) => { active = false; handlers && handlers.onError && handlers.onError(e && e.error); };
          rec.onend = () => { active = false; handlers && handlers.onEnd && handlers.onEnd(); };
          rec.start();
          return true;
        } catch (err) {
          active = false;
          handlers && handlers.onError && handlers.onError('exception');
          return false;
        }
      },
      stop() { try { rec && rec.stop(); } catch (e) { /* noop */ } }
    };
    return api;
  }

  return { support, speak, stop, createRecognizer };
})();
