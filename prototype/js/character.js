/* Aven — Visual Prototype. Персонаж Aven (Female/Male): опциональный Presentation Layer.
   Персонаж — ТОЛЬКО визуальное и речевое оформление. Никакая бизнес-логика,
   данные и команды НЕ зависят от персонажа; при выключенном персонаже всё
   работает идентично (нейтральный логотип «A»). Не production. */
window.AvenChar = (function () {
  const S = window.AvenState;
  const A = window.Aven;
  const s = () => S.s();

  /* ---------- реестр вымышленных персонажей ---------- */
  const CHARS = {
    female: {
      id: 'female',
      name: 'Ава',
      label: 'Ава (female)',
      gender: 'female',
      asset: 'assets/aven-female.png',
      tagline: 'Внимательная и собранная',
      voice: { pitch: 1.12, rate: 1 },          // демо-профиль TTS
      greet: ['Привет, {name}! Я на связи.', 'Здравствуйте, {name}. Чем помочь сегодня?'],
      thinking: ['Секунду, смотрю…', 'Минуту, проверяю…'],
      done: ['Готово!', 'Сделано.'],
      cancel: ['Хорошо, отменила.', 'Ок, без изменений.'],
      fallback: ['Это демо, но я подскажу. Попробуйте команды ниже.']
    },
    male: {
      id: 'male',
      name: 'Авен',
      label: 'Авен (male)',
      gender: 'male',
      asset: 'assets/aven-male.png',
      tagline: 'Спокойный и надёжный',
      voice: { pitch: 0.86, rate: 1 },          // демо-профиль TTS
      greet: ['Привет, {name}! Я здесь.', 'Здравствуйте, {name}. Готов помочь.'],
      thinking: ['Секунду, смотрю…', 'Минуту, проверяю…'],
      done: ['Готово!', 'Сделано.'],
      cancel: ['Хорошо, отменил.', 'Ок, без изменений.'],
      fallback: ['Это демо, но я подскажу. Попробуйте команды ниже.']
    },
    none: {
      id: 'none',
      name: 'Aven',
      label: 'Без персонажа (нейтрально)',
      gender: 'none',
      asset: null,
      tagline: 'Нейтральный режим',
      voice: { pitch: 1, rate: 1 },
      greet: ['Привет, {name}!'],
      thinking: ['Секунду…'],
      done: ['Готово.'],
      cancel: ['Отменено.'],
      fallback: ['Это демо. Попробуйте команды ниже.']
    }
  };

  /* ---------- конфигурация из настроек (с безопасным дефолтом) ---------- */
  function cfg() {
    const c = (s().settings && s().settings.character) || {};
    return Object.assign({ enabled: true, id: 'female', name: '', floating: true, greet: true, voiceProfile: true }, c);
  }
  function enabled() { return !!cfg().enabled && !!CHARS[cfg().id] && CHARS[cfg().id].asset !== null; }
  function isOff() { return !enabled(); }
  function current() {
    const c = cfg();
    if (!enabled()) return CHARS.none;
    return CHARS[c.id] || CHARS.female;
  }
  function display() {
    const c = current();
    const custom = cfg().name && cfg().name.trim();
    return custom ? custom : c.name;
  }
  function pick(arr) {
    if (!arr || !arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function phrase(kind) {
    const c = current();
    const txt = pick(c[kind]) || '';
    return txt.replace('{name}', (s().profile && s().profile.greeting) || 'друг');
  }
  function voiceProfile() {
    const c = current();
    return (cfg().voiceProfile && c.voice) ? c.voice : null;
  }

  /* ---------- HTML аватара с честным fallback (если картинки нет — логотип «A») ---------- */
  function avatar(cls) {
    const c = current();
    if (isOff() || !c.asset) {
      return `<span class="logo-mark ${cls || 's32'}" aria-hidden="true">A</span>`;
    }
    return `<img class="char-img ${cls || 's32'}" src="${A.esc(c.asset)}" alt="${A.esc(c.label)}"
      onerror="this.outerHTML='<span class=\\'logo-mark ${cls || 's32'}\\'>A</span>'">`;
  }

  /* ---------- плавающий Aven (глобальный, не зависит от страниц) ---------- */
  let floatOpen = false;
  let greeted = false;

  function floatRoot() { return document.getElementById('aven-float-root'); }

  function mountFloat() {
    const root = floatRoot();
    if (!root) return;
    if (isOff() || !cfg().floating) { root.innerHTML = ''; floatOpen = false; return; }
    const c = current();
    const support = window.AvenVoice ? window.AvenVoice.support : { tts: false, stt: false };
    const st = `
      <span class="pill ${support.tts ? 'ok' : ''}">${support.tts ? 'TTS: да' : 'TTS: нет'}</span>
      <span class="pill ${support.stt ? 'ok' : ''}">${support.stt ? 'STT: да' : 'STT: нет (эксп.)'}</span>`;
    root.innerHTML = `
      <div class="aven-float">
        ${floatOpen ? `
        <div class="float-pop" role="dialog" aria-label="Персонаж Aven">
          <div class="fp-head">${avatar('s52')}<div><div class="fp-name">${A.esc(display())}</div><div class="fp-tag">${A.esc(c.tagline)}</div></div></div>
          <div class="fp-body">${greeted ? A.esc(phrase('greet')) : A.esc(phrase('greet'))}</div>
          <div class="fp-actions">
            <button class="btn small primary" data-action="float-open-assistant">💬 Assistant</button>
            <button class="btn small" data-action="float-test-voice">🔊 Голос</button>
            <button class="btn small" data-action="float-hide">Скрыть</button>
          </div>
          <div class="fp-status">${st}</div>
        </div>` : ''}
        <button class="float-btn" data-action="float-toggle" title="Персонаж: ${A.esc(display())}">
          ${avatar('s52')}
          <span class="float-dot"></span>
        </button>
      </div>`;
  }

  function showGreeting() {
    if (greeted || isOff() || !cfg().floating || !cfg().greet) return;
    greeted = true;
    floatOpen = true;
    mountFloat();
  }

  A.register({
    'float-toggle': () => { floatOpen = !floatOpen; mountFloat(); },
    'float-hide': () => { s().settings.character.floating = false; S.save(); floatOpen = false; mountFloat(); A.toast('Плавающий персонаж скрыт (Настройки → Персонаж)'); },
    'float-open-assistant': () => { floatOpen = false; mountFloat(); location.hash = '#/assistant'; },
    'float-test-voice': () => {
      const text = phrase('greet');
      if (window.AvenVoice) window.AvenVoice.speak(text, null, { charProfile: true });
    }
  });

  return { CHARS, cfg, enabled, isOff, current, display, pick, phrase, voiceProfile, avatar, mountFloat, showGreeting };
})();
