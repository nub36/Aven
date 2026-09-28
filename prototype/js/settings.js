/* Aven — Visual Prototype. Настройки и Профиль. Переключения локальные (localStorage). Не production. */
(function () {
  const A = window.Aven, S = window.AvenState;
  A.pages = A.pages || {};
  const s = () => S.s();
  let cat = 'profile';

  /* четвёртый элемент — метка этапа: раздел не входит в срез Stage 1.0 (docs/MVP_SCOPE.md §8).
     Пустая метка = входит в 1.0. Метки честные: раздел показан как прототип, но помечен. */
  const cats = [
    ['profile', 'Профиль', '👤', ''], ['aven', 'Aven', '🤖', '1.1'], ['character', 'Персонаж', '🧍', 'опция (ADR-014)'],
    ['voice', 'Голос', '🎙️', 'Stage 3'], ['notify', 'Уведомления', '🔔', ''],
    ['commands', 'Команды', '⌨️', 'Stage 2'], ['dict', 'Словарь', '📖', 'Stage 2'],
    ['memory', 'Память', '🧠', '1.1'], ['home', 'Главная', '🏠', ''], ['modules', 'Модули', '🧩', ''],
    ['automations', 'Автоматизации', '⚡', 'Stage 4'], ['integrations', 'Интеграции', '🔌', '1.1'],
    ['sync', 'Синхронизация', '🔄', 'перспектива'], ['files', 'Файлы', '🗂️', '1.1'], ['privacy', 'Приватность', '🔐', ''],
    ['security', 'Безопасность', '🛡️', ''], ['a11y', 'Доступность', '♿', ''], ['exp', 'Экспериментальные', '🧪', '']
  ];
  const stageOf = (id) => (cats.filter((c) => c[0] === id)[0] || [])[3] || '';

  /* статус self-hosted TTS-сервера (асинхронно, без перерисовки всей страницы).
     Кнопка «Проверить» вызывает реальный health endpoint: при успехе — сервер/движки/число голосов/
     latency, при неудаче — конкретная причина (HTTP-код, timeout, mixed content, сеть/CORS),
     а не общее «не работает». */
  let lastServerKey = null;
  const serverKey = (st) => (st && st.checked ? st.ok + ':' + st.voices.map((v) => v.id).join(',') : 'unchecked');
  function refreshTtsServer(force) {
    if (!window.AvenTTS) return;
    window.AvenTTS.checkServer(force).then((st) => {
      const el = document.getElementById('tts-server-status');
      if (el) {
        if (st.ok) {
          // minimal health (VPS) не отдаёт список движков — не показываем «движков нет»
          const eng = st.info && st.info.engines ? Object.keys(st.info.engines) : [];
          el.textContent = 'подключён · ' + ((st.info && st.info.server) || 'сервер') +
            (st.info && st.info.version ? ' ' + st.info.version : '') +
            (eng.length ? ' · ' + eng.join(', ') : '') +
            ' · голосов: ' + st.voices.length + (st.latencyMs != null ? ' · ' + st.latencyMs + ' мс' : '');
        } else {
          el.textContent = 'сервер недоступен — ответы озвучатся системным голосом · ' + (st.error || 'нет ответа');
        }
        el.className = 'pill ' + (st.ok ? 'ok' : '');
      }
      // перерисовать, если список серверных голосов изменился с момента отрисовки
      if (serverKey(st) !== lastServerKey && document.getElementById('tts-server-status')) A.render();
    });
  }
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'tts-norm-in') {
      const o = document.getElementById('tts-norm-out');
      if (o && window.AvenSpeechText) o.textContent = window.AvenSpeechText.normalize(e.target.value);
    }
  });

  /* голоса Natural с сервера владельца, сгруппированные по движку */
  function natGroups(list, sel) {
    const groups = {};
    list.forEach((v) => {
      const g = (v.meta && v.meta.engineTitle) || 'Голоса сервера';
      (groups[g] = groups[g] || []).push(v);
    });
    return Object.keys(groups).map((g) => `<optgroup label="${A.esc(g)}">${groups[g].map((v) =>
      `<option value="${A.esc(v.id)}" ${v.id === sel ? 'selected' : ''}>${A.esc(v.label)}</option>`).join('')}</optgroup>`).join('');
  }

  function setRow(title, sub, control) {
    return `<div class="set-row"><div class="grow"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>${control}</div>`;
  }
  function sw(name, checked, action, label) {
    return `<label class="switch"><input type="checkbox" ${checked ? 'checked' : ''} data-action="${action || 'set-toggle'}" data-path="${name}"${label ? ` data-label="${A.esc(label)}"` : ''} aria-label="${A.esc(label || Core().settings.label(name))}"><span class="slider"></span></label>`;
  }
  /* Переключатель + подпись строки: подпись уходит в data-label, чтобы запись в истории
     была человеческой («Тихие часы: выключено → включено»), а слой действий не знал про DOM. */
  function swRow(title, sub, path, checked) {
    return setRow(title, sub, sw(path, checked, 'set-toggle', title));
  }

  /* ---------- поля профиля и настроек через общий слой действий ----------
     Тип контрола, варианты, подпись и подсказка приходят из AvenActions: экран не
     придумывает свои правила и не пишет в состояние напрямую (ADR-011, ADR-004). */
  const Core = () => window.AvenActions;
  function ctrlId(path) { return 'f-' + String(path).replace(/\./g, '-'); }
  function fieldControl(path, opts) {
    opts = opts || {};
    const f = Core().settings.field(path);
    if (!f) return '';
    const v = Core().settings.read(path);
    const id = ctrlId(path);
    const action = opts.action || 'set-field';
    const width = opts.width || (f.type === 'time' ? 130 : (f.type === 'number' ? 110 : 220));
    const base = `data-action="${action}" data-path="${A.esc(path)}" id="${id}" style="width:${width}px"`;
    if (f.type === 'select') {
      return `<select ${base}>${(f.options || []).map((o) =>
        `<option value="${A.esc(o.value)}"${o.value === v ? ' selected' : ''}${o.disabled ? ' disabled' : ''}>${A.esc(o.label)}</option>`).join('')}</select>`;
    }
    if (f.type === 'time') return `<input type="time" value="${A.esc(v || '')}" ${base}>`;
    if (f.type === 'number') return `<input type="number" min="${f.min}" max="${f.max}" step="1" value="${A.esc(String(v == null ? '' : v))}" ${base}>`;
    return `<input type="text" value="${A.esc(v == null ? '' : String(v))}" maxlength="${f.maxLength || 120}" ${base}>`;
  }
  function fieldRow(path, opts) {
    const f = Core().settings.field(path);
    if (!f) return '';
    const sub = (opts && opts.hint != null) ? opts.hint : (f.hint || '');
    return `<div class="set-row"><div class="grow"><label class="t" for="${ctrlId(path)}">${A.esc(f.label)}</label>${sub ? `<div class="s">${A.esc(sub)}</div>` : ''}</div>${fieldControl(path, opts)}</div>`;
  }
  /* Живой пример: видно сразу, как выбранные форматы выглядят в остальных разделах. */
  function formatPreview() {
    const C = Core();
    const today = C.dates.todayISO();
    return `<div class="tts-priv">Так это выглядит в остальных разделах: <b>${A.esc(A.money(47850))}</b> · <b>${A.esc(C.dates.humanDate(today))}</b> · <b>${A.esc(C.format.time('18:30'))}</b> · неделя начинается с «${A.esc(C.settings.read('profile.weekStart'))}» · сейчас по вашему поясу <b>${A.esc(C.dates.nowHM())}</b> (${A.esc(C.dates.tzLabel())}).</div>`;
  }

  A.pages.settings = function () {
    const nav = cats.map(([id, label, ico, stage]) =>
      `<button class="nav-item ${cat === id ? 'active' : ''}" data-action="set-cat" data-id="${id}"
         ${stage ? `title="Не входит в срез Stage 1.0: ${A.esc(stage)} (docs/MVP_SCOPE.md §8)"` : ''}><span class="ico">${ico}</span>${label}${stage ? `<span class="stage-badge ${stage === '1.1' ? 'next' : 'later'}">${A.esc(stage)}</span>` : ''}</button>`).join('');
    const html = `
    <div class="page-head">
      <div><h1>Настройки</h1><div class="sub">/settings — настройки конкретного пользователя (ADR-012: отдельно от /admin) · изменения сохраняются сразу, попадают в «Историю» и отменяются · метки «1.1», «Stage 2–4» означают, что раздел не входит в срез Stage 1.0 (docs/MVP_SCOPE.md §8)</div></div>
      <div class="btn-row">${A.helpActions ? A.helpActions('settings') : ''}</div>
    ${stageOf(cat) ? `<div class="card"><div class="tts-priv warn">Раздел «${A.esc((cats.filter((c) => c[0] === cat)[0] || [])[1] || cat)}» не входит в срез Stage 1.0 (${A.esc(stageOf(cat))}). В прототипе он показан для проектирования; в реализации 1.0 такого раздела не будет — заглушки запрещены (ADR-010).</div></div>` : ''}
    <div class="set-layout">
      <div class="set-nav">${nav}</div>
      <div>${renderCat()}</div>
    </div>`;
    return { html };
  };

  function renderCat() {
    const st = s();
    const V = st.settings.voice, N = st.settings.notify, B = st.settings.behavior;

    if (cat === 'profile') return `
      <h2 class="set-h">Профиль</h2><p class="set-sub">Имя, обращение, язык, регион, форматы. Значения применяются сразу во всех разделах</p>
      <div class="card" data-tour="settings-profile">
        ${['profile.name', 'profile.greeting', 'profile.locale', 'profile.city',
      'profile.tz', 'profile.currency', 'profile.dateFormat', 'profile.timeFormat', 'profile.weekStart']
      .map((p) => fieldRow(p)).join('')}
        ${formatPreview()}
      </div>
      <div class="card">
        ${setRow('Почта', 'адрес входа меняется в разделе «Безопасность» — это не настройка отображения', `<span>${A.esc(st.profile.email || '—')}</span>`)}
        <div class="tts-priv">Каждое изменение здесь попадает в «Историю действий» и отменяется кнопкой «Отменить». Время событий хранится как вы его ввели; часовой пояс определяет «сейчас» — приветствие, утро/вечер и отметки времени.</div>
      </div>`;

    if (cat === 'aven') return `
      <h2 class="set-h">Aven</h2><p class="set-sub">Поведение помощника и временные понятия</p>
      <div class="card" data-tour="settings-aven">
        ${fieldRow('settings.behavior.answers', { hint: 'краткие или подробные' })}
        ${fieldRow('settings.behavior.confirmation', { hint: 'когда спрашивать перед действием', width: 260 })}
        ${['settings.behavior.morning', 'settings.behavior.day', 'settings.behavior.evening',
      'settings.behavior.night', 'settings.behavior.afterWork'].map((p) => fieldRow(p)).join('')}
        <div class="tts-priv">Границы суток должны идти по возрастанию: утро → день → вечер → ночь. Если порядок нарушен, значение не сохранится и Aven скажет об этом.</div>
      </div>
      <h3 class="set-h">Дневные сценарии</h3>
      <p class="set-sub">Утренний обзор и итоги дня работают с уже существующими задачами, событиями и уведомлениями</p>
      <div class="card">
        ${swRow('Показывать утренний обзор', 'подсказка на «Главной» утром; сам раздел остаётся доступен всегда', 'settings.daily.morning', ((st.settings.daily || {}).morning !== false))}
        ${swRow('Показывать вечерний обзор', 'подсказка на «Главной» вечером; итоги дня можно открыть в любой момент', 'settings.daily.evening', ((st.settings.daily || {}).evening !== false))}
        <div class="tts-priv">Какой сейчас период — определяется временем выше («Утро», «Вечер») и часовым поясом из профиля. Это только подсказка в интерфейсе: прототип не будит и не шлёт оповещения при закрытой вкладке.</div>
      </div>`;

    if (cat === 'character') {
      const C = st.settings.character || { enabled: true, id: 'female' };
      const chars = window.AvenChar ? window.AvenChar.CHARS : {};
      const preview = window.AvenChar ? window.AvenChar.avatar('s52') : '';
      return `
      <h2 class="set-h">Персонаж</h2><p class="set-sub">Вымышленный визуальный образ Aven · опциональный слой оформления</p>
      <div class="card">
        <div class="set-row"><div class="grow"><div class="t">Текущий образ</div><div class="s">персонаж — только оформление, функции от него не зависят</div></div>${preview}</div>
        ${swRow('Показывать персонажа', 'выключите — будет нейтральный логотип «A»', 'settings.character.enabled', C.enabled)}
        ${setRow('Персонаж', 'вымышленные Female / Male', `<select data-action="set-char" style="width:220px">${Object.keys(chars).map((k) => `<option value="${k}" ${C.id === k ? 'selected' : ''}>${A.esc(chars[k].label)}</option>`).join('')}</select>`)}
        ${setRow('Своё имя персонажа', 'пусто — имя по умолчанию', `<input type="text" value="${A.esc(C.name || '')}" style="width:220px" data-action="set-char-name">`)}
        ${swRow('Плавающий Aven', 'кнопка-персонаж в углу экрана', 'settings.character.floating', C.floating)}
        ${swRow('Приветствие при запуске', 'показывать пузырь-приветствие', 'settings.character.greet', C.greet)}
        ${swRow('Голосовой профиль персонажа', 'подбирать тембр под образ (демо)', 'settings.character.voiceProfile', C.voiceProfile)}
        <div class="s" style="color:var(--muted);font-size:.82rem;padding:10px 4px">Персонажи — фикциональные. Это Presentation Layer: при отключении весь функционал сайта работает идентично.</div>
      </div>`;
    }

    if (cat === 'voice') {
      const T = window.AvenTTS;
      const sysVoices = T ? T.providers.system.voices() : [];
      const sttOn = window.AvenVoice ? window.AvenVoice.support.stt : false;
      const ttsOn = window.AvenVoice ? window.AvenVoice.support.tts : false;
      const ST = st.settings.voice.stt || { enabled: true, interim: true, autoSend: false };
      const engine = V.engine || 'system';
      const NV = V.natural || {};
      const natVoices = T ? T.providers.natural.voices() : [];
      const srvDef = (T && T.server() && T.server().defaultVoice) || '';
      const natSel = NV.voice && natVoices.some((x) => x.id === NV.voice)
        ? NV.voice
        : (srvDef && natVoices.some((x) => x.id === srvDef) ? srvDef : (natVoices[0] && natVoices[0].id) || '');
      const priv = T ? T.privacyInfo(engine, engine === 'natural' ? natSel : V.voiceURI) : null;
      const licPill = (m) => {
        if (!m) return '';
        const c = m.commercial === 'yes' ? 'lic-yes' : (m.commercial === 'no' ? 'lic-no' : 'lic-unclear');
        const t = m.commercial === 'yes' ? 'коммерция: да' : (m.commercial === 'no' ? 'некоммерческая' : 'лицензия не ясна');
        return `<span class="pill ${c}" title="${A.esc(m.license || '')}">${t}</span>`;
      };
      const natMeta = (natVoices.find((x) => x.id === natSel) || {}).meta;
      const stats = T ? T.stats : {};
      lastServerKey = T ? serverKey(T.server()) : null;
      if (engine === 'natural') setTimeout(() => refreshTtsServer(false), 0);
      return `
      <h2 class="set-h">Голос</h2><p class="set-sub">Озвучивание ответов и голосовой ввод · демо</p>
      <div class="card">
        ${swRow('Голосовые ответы', 'озвучивать ответы Aven', 'settings.voice.enabled', V.enabled)}
        ${swRow('Всегда отвечать голосом', 'если выключено — только по запросу', 'settings.voice.alwaysVoice', V.alwaysVoice)}
        ${setRow('Движок речи', 'системный голос остаётся всегда доступным запасным вариантом',
          `<select data-action="set-voice-engine" style="width:240px">
            <option value="system" ${engine === 'system' ? 'selected' : ''}>Системный (браузер / ОС)</option>
            <option value="natural" ${engine === 'natural' ? 'selected' : ''}>Natural Voice (Silero · свой сервер)</option>
          </select>`)}
        ${engine === 'system' ? setRow('Голос', sysVoices.length ? 'системные голоса: «на устройстве» — локально, «онлайн» — текст уходит поставщику' : 'системные голоса не найдены — демо',
          `<select data-action="set-voice" style="width:240px">${sysVoices.length ? sysVoices.map((v) => `<option value="${A.esc(v.id)}" ${v.id === V.voiceURI ? 'selected' : ''}>${A.esc(v.label)} · ${v.privacy === 'device' ? 'на устройстве' : 'онлайн'}</option>`).join('') : '<option>Системный (по умолчанию)</option>'}</select>`) : ''}
        ${engine === 'natural' ? setRow('Голос', 'голоса вашего TTS-сервера · произвольный текст синтезируется на сервере',
          `<select data-action="set-natural-voice" style="width:240px">${natVoices.length ? natGroups(natVoices, natSel) : '<option value="">сервер не подключён</option>'}</select>`) : ''}
        ${engine === 'natural' && natMeta ? setRow('Лицензия голоса', A.esc(natMeta.license || ''), licPill(natMeta)) : ''}
        ${engine === 'natural' ? setRow('Self-hosted TTS-сервер', 'адрес VPS с research/tts/server.py · пусто — тот же адрес, что у страницы',
          `<div style="display:flex;gap:6px;align-items:center"><input type="text" value="${A.esc(NV.serverUrl || '')}" placeholder="https://tts.ваш-домен.ru" style="width:190px" data-action="set-natural-server"><button class="btn small" data-action="tts-check-server">Проверить</button></div>`) : ''}
        ${engine === 'natural' ? setRow('Статус сервера', '', '<span class="pill" id="tts-server-status">проверяю…</span>') : ''}
        ${engine === 'natural' ? swRow('Кэш озвучки', 'только память вкладки; фразы с цифрами и именами не кэшируются', 'settings.voice.natural.cache', NV.cache !== false) : ''}
        ${engine === 'natural' ? setRow('Таймаут Natural, сек', 'сервер не ответил за это время → честный переход на системный голос · VPS 1 CPU (Silero) отвечает за доли секунды, значения по умолчанию (10 с) достаточно',
          `<input type="number" min="2" max="600" step="1" value="${A.esc(NV.timeoutSec != null ? NV.timeoutSec : 10)}" style="width:80px" data-action="set-natural-timeout">`) : ''}
        ${priv ? `<div class="tts-priv ${priv.ok ? '' : 'warn'}"><span class="pill ${priv.ok ? 'ok' : ''}">${A.esc(priv.tag)}</span><span>${A.esc(priv.text)}</span></div>` : ''}
        ${engine === 'system' ? setRow('Скорость', '', `<div class="slider-row" style="width:240px"><input type="range" min="0.5" max="2" step="0.1" value="${V.rate}" data-action="set-slider" data-path="settings.voice.rate"><span class="val">${V.rate}</span></div>`) : ''}
        ${engine === 'system' ? setRow('Высота', '', `<div class="slider-row" style="width:240px"><input type="range" min="0.5" max="1.5" step="0.1" value="${V.pitch}" data-action="set-slider" data-path="settings.voice.pitch"><span class="val">${V.pitch}</span></div>`) : ''}
        ${setRow('Громкость', '', `<div class="slider-row" style="width:240px"><input type="range" min="0" max="1" step="0.1" value="${V.volume}" data-action="set-slider" data-path="settings.voice.volume"><span class="val">${V.volume}</span></div>`)}
        ${setRow('Прослушать', engine === 'natural' ? 'тестовая фраза владельца: имя, время, числа, километры · Esc или повторное нажатие — стоп' : 'тестовая фраза T1 · Esc или повторное нажатие — стоп',
          `<div style="display:flex;gap:6px"><button class="btn primary" data-action="voice-test">▶ Прослушать</button><button class="btn" data-action="tts-stop">■ Стоп</button></div>`)}
        ${setRow('Последний запуск', 'время до начала звука · источник', `<span class="pill" id="tts-last">${stats.lastLatencyMs != null ? stats.lastLatencyMs + ' мс · ' + A.esc(stats.lastSource || stats.lastEngine) : '—'}</span>`)}
        ${setRow('Лаборатория голосов', 'исследование: A/B-прослушивание готовых образцов кандидатов, слепой режим', '<a class="btn" href="voice-lab.html" target="_blank" rel="noopener">Открыть лабораторию ↗</a>')}
        ${setRow('Поддержка браузера', 'честный статус возможностей', `<span class="pill ${ttsOn ? 'ok' : ''}">TTS: ${ttsOn ? 'да' : 'нет'}</span> <span class="pill ${sttOn ? 'ok' : ''}">STT: ${sttOn ? 'да' : 'нет'}</span>`)}
        ${setRow('Голосовой ввод (STT)', 'экспериментально · SpeechRecognition', sttOn ? sw('settings.voice.stt.enabled', ST.enabled, 'set-toggle', 'Голосовой ввод (STT)') : '<span class="pill">недоступно</span>')}
        ${sttOn && ST.enabled ? swRow('Промежуточный текст', 'показывать распознанное по мере речи', 'settings.voice.stt.interim', ST.interim) : ''}
        ${sttOn && ST.enabled ? swRow('Автоотправка', 'отправлять фразу сразу после распознавания', 'settings.voice.stt.autoSend', ST.autoSend) : ''}
        ${setRow('Fallback при недоступности TTS', 'натуральный голос недоступен → системный; нет TTS → текст', '<span class="pill ok">включён всегда</span>')}
      </div>
      <div class="card" style="margin-top:12px">
        <div class="t" style="font-weight:600;margin-bottom:4px">Как Aven прочитает текст</div>
        <div class="tts-note">На экране текст не меняется. Для речи числа, время, даты, деньги и единицы переводятся в слова.</div>
        <input type="text" id="tts-norm-in" data-action="tts-norm-preview" value="Заправка добавлена: 42 л, 3 200 ₽. Пробег 104 520 км, напомню в 9:30." style="width:100%">
        <div class="tts-norm" id="tts-norm-out">${A.esc(window.AvenSpeechText ? window.AvenSpeechText.normalize('Заправка добавлена: 42 л, 3 200 ₽. Пробег 104 520 км, напомню в 9:30.') : '')}</div>
      </div>`;
    }

    if (cat === 'notify') {
      const SRC = Object.assign({ taskDue: true, taskOverdue: true, eventUpcoming: true, eventReminder: true, autoDocs: true, warranty: true, manual: true }, N.sources || {});
      const srcRows = [
        ['taskOverdue', 'Просроченные задачи'],
        ['taskDue', 'Задачи со сроком сегодня'],
        ['eventUpcoming', 'События сегодня'],
        ['eventReminder', 'Напоминания к событиям'],
        ['autoDocs', 'Документы авто с близким сроком'],
        ['warranty', 'Истекающая гарантия покупок'],
        ['manual', 'Напоминания, созданные вручную']
      ];
      return `
      <h2 class="set-h">Уведомления</h2><p class="set-sub">Что показывать в разделе «Уведомления» · это уведомления внутри приложения</p>
      <div class="card">
        ${swRow('Уведомления в приложении', 'собирать напоминания на одном экране и на «колокольчике»', 'settings.notify.inapp', N.inapp !== false)}
      </div>
      <h3 class="set-h" style="font-size:1rem;margin-top:16px">Что учитывать</h3>
      <p class="set-sub">Выключите то, о чём напоминать не нужно. Данные разделов при этом не меняются.</p>
      <div class="card">
        ${srcRows.map(([id, label]) => swRow(label, '', 'settings.notify.sources.' + id, SRC[id] !== false)).join('')}
        <div class="s" style="color:var(--muted);font-size:.82rem;padding-top:8px">Пункты собираются из ваших задач, событий, авто и покупок. Пока вкладка закрыта, оповещений, писем и push нет — для этого нужен сервер и почтовый сервис (позже, открытые вопросы №16, №17).</div>
      </div>
      <h3 class="set-h" style="font-size:1rem;margin-top:16px">Голосовое произнесение <span class="stage-badge later">Stage 3</span></h3>
      <p class="set-sub">Голосовые события · тихие часы · приватность произнесения — относится к голосу (Stage 3, VOICE.md)</p>
      <div class="card">
        ${swRow('Разрешить голосовое произнесение уведомлений', '', 'settings.notify.voiceAllowed', N.voiceAllowed)}
        ${swRow('Тихие часы', 'не беспокоить голосом ночью', 'settings.notify.quietHours', N.quietHours)}
        ${N.quietHours ? setRow('Интервал тихих часов', '', `<div style="display:flex;gap:6px;align-items:center"><input type="time" value="${N.quietFrom}" style="width:110px"> — <input type="time" value="${N.quietTo}" style="width:110px"></div>`) : ''}
        ${swRow('Звук перед голосом', '', 'settings.notify.soundBefore', N.soundBefore)}
        ${setRow('При подключённых наушниках', 'поведение (реализуемость — открытый вопрос №22)', `<select><option ${N.headphones === 'продолжать' ? 'selected' : ''}>продолжать</option><option>только звук</option><option>молча</option></select>`)}
        ${setRow('Приватная информация', 'правила произнесения сумм и имен', `<select><option ${N.privateInfo === 'не произносить суммы' ? 'selected' : ''}>не произносить суммы</option><option>произносить всё</option><option>всегда молча</option></select>`)}
        <div class="s" style="color:var(--muted);font-size:.82rem;padding:10px 4px">Ограничения платформ отображаются честно: закрытая вкладка не получит голос (ADR-010).</div>
      </div>`;
    }

    if (cat === 'commands') {
      return `
      <h2 class="set-h">Команды</h2><p class="set-sub">Системные и пользовательские команды · демо (Command Engine — Stage 2)</p>
      <div class="card">
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn primary" data-action="cmd-add">＋ Команда</button></div>
        <table class="tbl">
          <tr><th>Фраза / шаблон</th><th>Action</th><th>Вкл.</th><th></th></tr>
          ${st.commands.map((c) => `
          <tr>
            <td><code>${A.esc(c.phrase)}</code></td>
            <td><span class="pill accent">${A.esc(c.action)}</span></td>
            <td>${sw('cmd', c.enabled, 'cmd-toggle:' + c.id, 'Команда «' + c.phrase + '»')}</td>
            <td><button class="btn small" data-action="cmd-test" data-id="${c.id}">Тест</button></td>
          </tr>`).join('')}
        </table>
        <div class="s" style="color:var(--muted);font-size:.82rem;margin-top:8px">Конфликты фраз подсвечиваются (демо: конфликтов нет). Связь с Automation Workflow — в перспективе.</div>
      </div>`;
    }

    if (cat === 'dict') return `
      <h2 class="set-h">Словарь</h2><p class="set-sub">Персональные значения слов · приоритет над системным там, где безопасно</p>
      <div class="card">
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn primary" data-action="dict-add">＋ Слово</button></div>
        <table class="tbl">
          <tr><th>Слово / фраза</th><th>Значение</th><th>Тип</th><th></th></tr>
          ${st.dictionary.map((d) => `
          <tr>
            <td><b>${A.esc(d.word)}</b></td>
            <td>${A.esc(d.value)}</td>
            <td><span class="pill">${A.esc(d.type)}</span></td>
            <td><button class="btn small danger" data-action="dict-del" data-id="${d.id}">Удалить</button></td>
          </tr>`).join('')}
        </table>
      </div>`;

    if (cat === 'memory') return `
      <h2 class="set-h">Память Aven</h2><p class="set-sub">Что Aven знает о вас — просмотр, редактирование, удаление · демо</p>
      <div class="grid cols-2">
        <div class="card">
          <h3>Факты</h3>
          ${st.memory.facts.map((m) => `
          <div class="mem-li"><div class="grow" style="flex:1">${A.esc(m.text)}</div>
            <button class="btn small" data-action="mem-edit" data-id="${m.id}" data-kind="facts">✏️</button>
            <button class="btn small danger" data-action="mem-del" data-id="${m.id}" data-kind="facts">🗑</button>
          </div>`).join('')}
          <button class="btn block" style="margin-top:10px" data-action="mem-add" data-kind="facts">＋ Факт</button>
        </div>
        <div class="card">
          <h3>Объекты</h3>
          ${st.memory.objects.map((m) => `
          <div class="mem-li"><div class="grow" style="flex:1">${A.esc(m.text)}</div>
            <button class="btn small" data-action="mem-edit" data-id="${m.id}" data-kind="objects">✏️</button>
            <button class="btn small danger" data-action="mem-del" data-id="${m.id}" data-kind="objects">🗑</button>
          </div>`).join('')}
          <button class="btn block" style="margin-top:10px" data-action="mem-add" data-kind="objects">＋ Объект</button>
        </div>
      </div>
      <div class="s" style="color:var(--muted);font-size:.84rem;margin-top:12px">Aven не сохраняет бесконтрольно каждую фразу как постоянную память. Очистка контекста диалога — в перспективе.</div>`;

    if (cat === 'home') {
      const C = st.settings.homeCards;
      const rows = [['suggestions', 'Блок «Предложения Aven»'], ['today', 'Карточка «Сегодня»'], ['tasks', 'Карточка «Задачи»'], ['expenses', 'Карточка «Расходы»'], ['car', 'Карточка «Автомобиль»'], ['shopping', 'Карточка «Гарантии» (покупки)'], ['notes', 'Карточка «Заметки»'], ['reminders', 'Карточка «Уведомления»'], ['actions', 'Карточка «Последние действия»'], ['quick', 'Быстрые действия']];
      const SG = st.settings.suggestions || { enabled: true };
      return `
      <h2 class="set-h">Главная</h2><p class="set-sub">Включение/отключение карточек · порядок — в перспективе (вопрос №25)</p>
      <div class="card">
      ${swRow('Предложения Aven', 'локальные подсказки по вашим задачам, событиям, авто и покупкам', 'settings.suggestions.enabled', SG.enabled !== false)}
      ${rows.map(([id, label]) => swRow(label, '', 'settings.homeCards.' + id, C[id] !== false)).join('')}
      <div class="s" style="color:var(--muted);font-size:.82rem;padding-top:10px">Изменения сразу применяются на главной странице.</div></div>`;
    }

    if (cat === 'modules') {
      const M = st.settings.modules;
      const rows = [['calendar', 'Календарь'], ['tasks', 'Задачи'], ['notes', 'Заметки'], ['finance', 'Финансы'], ['auto', 'Авто'], ['shopping', 'Покупки'], ['tools', 'Инструменты']];
      return `
      <h2 class="set-h">Модули</h2><p class="set-sub">Включение/отключение ненужных модулей — пункты скрываются в меню (демо)</p>
      <div class="card">
        ${rows.map(([id, label]) => swRow(label, '', 'settings.modules.' + id, M[id])).join('')}
        ${setRow('Пользовательские модули', 'собственные разделы — перспектива (ADR-009)', '<span class="pill">позже</span>')}
      </div>`;
    }

    if (cat === 'automations') return `
      <h2 class="set-h">Автоматизации</h2><p class="set-sub">Управление из настроек · полный список — в разделе «Автоматизации»</p>
      <div class="card">
        ${st.automations.map((a) => setRow(`${a.icon} ${A.esc(a.name)}`, A.esc(a.trigger), sw('auto', a.enabled, 'auto-toggle:' + a.id, 'Автоматизация «' + a.name + '»'))).join('')}
        ${setRow('Visual Automation Canvas', 'Stage 4 — планируется', '<span class="pill">планируется</span>')}
      </div>`;

    if (cat === 'integrations') return `
      <h2 class="set-h">Интеграции</h2><p class="set-sub">Подключённые сервисы · permissions · статус</p>
      <div class="card">
        ${st.integrations.map((i) => setRow(A.esc(i.name), 'последняя синхронизация: ' + A.esc(i.last), `<span class="pill ${i.status === 'подключено' ? 'ok' : ''}">${A.esc(i.status)}</span>`)).join('')}
        <div class="s" style="color:var(--muted);font-size:.82rem;padding-top:10px">Секреты интеграций шифруются и не попадают в логи (SECURITY.md).</div>
      </div>`;

    if (cat === 'sync') return `
      <h2 class="set-h">Синхронизация</h2><p class="set-sub">Состояния: Online / Offline / Sync pending — Future/Under Design</p>
      <div class="card">
        ${setRow('Статус', '', '<span class="pill ok">Online (демо)</span>')}
        ${st.sessions.map((x) => setRow(A.esc(x.device), A.esc(x.where) + ' · ' + A.esc(x.when), x.current ? '<span class="pill accent">текущее</span>' : '<span class="pill">offline</span>')).join('')}
        ${setRow('Pending operations', 'офлайн-очередь — не часть первого web-релиза', '<span class="pill">0</span>')}
        ${setRow('Offline storage', 'локальные данные браузера — где даёт практическую пользу', '<span class="pill">Future</span>')}
      </div>`;

    if (cat === 'files') return `
      <h2 class="set-h">Файлы</h2><p class="set-sub">Занятое пространство · квота · хранение</p>
      <div class="card">
        ${setRow('Занятое пространство', 'чеки и фото — в перспективе', '<b>12,4 МБ (демо)</b>')}
        ${setRow('Квота', 'модель квот не определена (вопрос №15)', '<b>5 ГБ (демо)</b>')}
        ${setRow('Backup / Export', 'экспорт состояния прототипа', '<button class="btn" data-action="export-state">⬇ Экспорт (демо)</button>')}
      </div>`;

    if (cat === 'privacy') return `
      <h2 class="set-h">Приватность</h2>
      <p class="set-sub">Пользователь контролирует свои данные: экспорт и удаление — в срезе 1.0, а не «когда-нибудь» (MVP_SCOPE §6.5, SECURITY §2)</p>
      <div class="card">
        ${setRow('Экспорт всех данных', 'JSON со всеми записями аккаунта; как операция с приватными данными требует подтверждения (§7)', '<button class="btn" data-action="priv-export-all">⬇ Выгрузить JSON</button>')}
        ${setRow('Экспорт истории действий', 'JSON-выгрузка записей истории с изменениями', '<a class="btn small" href="#/history">История → Экспорт JSON</a>')}
        ${setRow('Экспорт финансовых операций', 'CSV для таблиц (§5.6, приёмка 5)', '<a class="btn small" href="#/finance">Финансы → Экспорт CSV</a>')}
        ${setRow('Удаление аккаунта и всех данных', 'необратимо: повторная аутентификация + ввод слова DELETE', '<button class="btn danger" data-action="priv-delete-account">Удалить аккаунт…</button>')}
        ${setRow('Сброс демо-данных', 'вернуть исходный набор прототипа (это не удаление аккаунта)', '<button class="btn" data-action="privacy-reset">Сбросить демо-данные</button>')}
        ${swRow('Диагностические данные', 'управление телеметрией (вопрос №22)', 'privacy.diag', false)}
        ${setRow('История действий', 'что сделано и что можно отменить (Undo)', '<a class="btn small" href="#/history">Открыть историю</a>')}
        ${setRow('Экспорт истории', 'JSON-выгрузка записей истории', '<a class="btn small" href="#/history">История → Экспорт JSON</a>')}
        ${setRow('Постоянная память', 'управление тем, что разрешено сохранять', '<a href="#/settings" data-action="set-cat-link" data-id="memory">раздел «Память»</a>')}
      </div>`;

    if (cat === 'security') return `
      <h2 class="set-h">Безопасность</h2>
      <p class="set-sub">Пароль · 2FA (TOTP) · сессии и устройства · входит в срез Stage 1.0 (MVP_SCOPE §5.1, §8)</p>
      <div class="card">
        ${setRow('Пароль', 'изменение пароля — опасное действие, требует подтверждения', '<button class="btn" data-action="sec-password">Изменить…</button>')}
        ${setRow('Двухфакторная аутентификация (TOTP)', 'следующий вход потребует 6-значный код',
          `<label class="switch"><input type="checkbox" ${st.auth.twoFactor ? 'checked' : ''} data-action="auth-2fa-enable"><span class="slider"></span></label>`)}
        ${setRow('Резервные коды', 'выдаются при включении 2FA (в реальной системе)', st.auth.twoFactor ? '<span class="pill ok">10 кодов (демо)</span>' : '<span class="pill">2FA выключена</span>')}
        ${setRow('Активные сессии', 'завершение других устройств — опасное действие', '<button class="btn small" data-action="auth-sessions-kill">Завершить другие</button>')}
        ${st.sessions.map((x) => setRow('🖥 ' + A.esc(x.device), A.esc(x.where) + ' · ' + A.esc(x.when), x.current ? '<span class="pill accent">текущая</span>' : '<button class="btn small" data-action="sec-session-end" data-id="' + A.esc(x.id || '') + '">Завершить</button>')).join('')}
        ${setRow('Журнал безопасности', 'входы, выходы, изменения 2FA — в общей истории действий', '<a class="btn small" href="#/history">Открыть историю</a>')}
        ${setRow('Политика 2FA по ролям', 'обязательность для администраторов', '<span class="pill warn">открытый вопрос (SECURITY §11.3)</span>')}
        ${setRow('Экраны входа, 2FA и восстановления', 'в демо вход уже выполнен; чтобы посмотреть экраны аккаунта — выйдите', '<button class="btn small" data-action="logout">Выйти и показать экран входа</button>')}
      </div>`;

    if (cat === 'a11y') return `
      <h2 class="set-h">Доступность</h2><p class="set-sub">Размер текста · тема · анимации (демо)</p>
      <div class="card">
        ${fieldRow('settings.textSize', { action: 'set-textsize' })}
        ${fieldRow('settings.theme', { action: 'set-theme', hint: 'вопрос №32: светлая / тёмная / как в системе' })}
        ${swRow('Уменьшить анимации', 'меньше движения в интерфейсе', 'settings.reduceMotion', st.settings.reduceMotion)}
        ${setRow('Управление с клавиатуры', 'базовая навигация Tab/Enter работает в прототипе', '<span class="pill ok">включено</span>')}
      </div>`;

    if (cat === 'exp') return `
      <h2 class="set-h">Экспериментальные функции</h2><p class="set-sub">Возможность отдельно включать будущие возможности Aven</p>
      <div class="card">
        ${swRow('Automation Canvas (превью)', 'Stage 4', 'settings.experiments.canvas', st.settings.experiments.canvas)}
        ${swRow('AI Router (заглушка)', 'AI — необязательный слой, ADR-002', 'settings.experiments.aiRouter', st.settings.experiments.aiRouter)}
        ${swRow('Гео-напоминания', 'перспектива', 'settings.experiments.geoReminders', st.settings.experiments.geoReminders)}
        <div class="s" style="color:var(--muted);font-size:.82rem;padding-top:10px">Экспериментальные функции могут работать нестабильно — это ожидаемо.</div>
      </div>`;

    return '';
  }

  /* Страница «Профиль» — не копия настроек «только для чтения», а те же самые поля
     того же слоя действий: что изменено здесь, то изменено и в Настройках → Профиль. */
  A.pages.profile = function () {
    const p = s().profile;
    const initial = String(p.name || 'A').trim().charAt(0).toUpperCase() || 'A';
    return { html: `
    <div class="page-head">
      <div><h1>Профиль</h1><div class="sub">Имя, обращение и форматы отображения · те же поля, что в Настройках → Профиль · демо-аккаунт</div></div>
      <div class="btn-row">${A.helpActions ? A.helpActions('profile') : ''}</div>
    </div>
    <div class="grid cols-2" style="max-width:920px">
      <div class="card" data-tour="profile-fields">
        <div class="profile-head">
          <button class="avatar big" aria-hidden="true" tabindex="-1">${A.esc(initial)}</button>
          <div>
            <div style="font-size:1.2rem;font-weight:700">${A.esc(p.name)}</div>
            <div style="color:var(--muted)">${A.esc(p.email)}</div>
            <div style="margin-top:6px"><span class="pill accent">демо-аккаунт</span></div>
          </div>
        </div>
        <div style="margin-top:16px">
          ${['profile.name', 'profile.greeting', 'profile.city'].map((x) => fieldRow(x)).join('')}
        </div>
      </div>
      <div class="card" data-tour="profile-formats">
        <h3>Как показывать данные</h3>
        ${['profile.tz', 'profile.currency', 'profile.dateFormat', 'profile.timeFormat', 'profile.weekStart'].map((x) => fieldRow(x)).join('')}
        ${formatPreview()}
      </div>
      <div class="card">
        <h3>Быстрые ссылки</h3>
        ${setRow('Настройки', 'все категории', '<a class="btn small" href="#/settings">Открыть</a>')}
        ${setRow('Память Aven', 'что Aven знает о вас', `<a class="btn small" href="#/settings" data-action="set-cat-link" data-id="memory">Открыть</a>`)}
        ${setRow('Безопасность', 'сессии и устройства', `<a class="btn small" href="#/settings" data-action="set-cat-link" data-id="security">Открыть</a>`)}
        ${setRow('История изменений', 'что и когда вы меняли, с возможностью отменить', '<a class="btn small" href="#/history">Открыть</a>')}
      </div>
    </div>` };
  };

  /* ---------- действия ---------- */

  /* Единственная точка записи настроек и профиля с этого экрана. */
  function write(path, value, opts) { return Core().settings.set(path, value, opts || {}); }

  /* Изменение поля: проверка → сохранение → перерисовка с возвратом фокуса на тот же
     контрол (иначе после сохранения фокус терялся бы, и с клавиатуры экран был бы неудобен). */
  function applyField(path, value, el) {
    const res = write(path, value);
    if (!res.ok) {
      A.toast(res.message);
      if (el) {
        el.setAttribute('aria-invalid', 'true');
        const back = Core().settings.read(path);
        if (back != null) el.value = back;
        try { el.focus(); } catch (e) { /* демо */ }
      }
      return res;
    }
    if (el) el.removeAttribute('aria-invalid');
    if (/^settings\.(theme|textSize)$/.test(path)) A.applyEnv();
    if (!res.unchanged) A.toast(res.entity.label + ': ' + Core().settings.display(path, res.entity.value));
    renderKeepFocus(path);
    return res;
  }
  function renderKeepFocus(path) {
    const active = document.activeElement;
    const wasFocused = !!(active && active.dataset && active.dataset.path === path);
    const selStart = (wasFocused && active.selectionStart != null) ? active.selectionStart : null;
    A.render();
    if (!wasFocused) return;
    const next = document.querySelector('[data-path="' + path + '"]');
    if (!next) return;
    try {
      next.focus();
      if (selStart != null && next.setSelectionRange) next.setSelectionRange(selStart, selStart);
    } catch (e) { /* демо */ }
  }

  /* Открыть настройки на нужной категории из другого раздела (например, из «Уведомлений»). */
  A.openSettingsCat = function (id) {
    cat = id || 'profile';
    if ((location.hash || '').replace(/^#\//, '') !== 'settings') location.hash = '#/settings';
    else A.render();
  };

  A.register({
    'set-cat': (el) => { cat = el.dataset.id; A.render(); },
    'set-cat-link': (el) => { cat = el.dataset.id; },
    'set-open-cat': (el) => { A.openSettingsCat(el.dataset.id); },
    /* Любое изменение настройки или профиля идёт одним путём: слой действий проверяет
       значение, сохраняет, пишет в историю и готовит Undo. Экран только показывает
       результат (ADR-011; MVP_SCOPE §5.2, §8). */
    'set-field': (el) => applyField(el.dataset.path, el.value, el),
    'set-toggle': (el) => {
      const r = write(el.dataset.path, el.checked, { label: el.dataset.label });
      if (!r.ok) { el.checked = !el.checked; A.toast(r.message); return; }
      A.toast((r.entity.label || 'Настройка') + ': ' + (el.checked ? 'включено' : 'выключено'));
      if (/^settings\.modules\./.test(el.dataset.path) || /^settings\.homeCards\./.test(el.dataset.path)) A.applyEnv();
      if (/^settings\.reduceMotion$/.test(el.dataset.path)) A.applyEnv();
      if (/^settings\.character\./.test(el.dataset.path)) A.render(); // hero перестраивается под character on/off
    },
    'set-slider': (el) => {
      write(el.dataset.path, parseFloat(el.value), { silent: true });
      const val = el.parentElement.querySelector('.val');
      if (val) val.textContent = el.value;
    },
    'set-voice': (el) => { write('settings.voice.voiceURI', el.value); A.render(); },
    'set-voice-engine': (el) => {
      if (window.AvenTTS) window.AvenTTS.stop();
      write('settings.voice.engine', el.value === 'natural' ? 'natural' : 'system');
      A.render();
      if (el.value === 'natural') A.toast('Natural Voice: произвольный текст озвучивается вашим TTS-сервером (Silero Aigul на VPS). Без сервера — системный голос');
    },
    'set-natural-voice': (el) => { write('settings.voice.natural.voice', el.value); A.render(); },
    'set-natural-server': (el) => { write('settings.voice.natural.serverUrl', el.value.trim()); },
    'set-natural-timeout': (el) => {
      const t = Math.round(parseFloat(el.value));
      write('settings.voice.natural.timeoutSec', (isFinite(t) && t >= 2 && t <= 600) ? t : 10, { silent: true });
      el.value = s().settings.voice.natural.timeoutSec;
    },
    'tts-check-server': () => { refreshTtsServer(true); },
    'tts-stop': () => { if (window.AvenTTS) window.AvenTTS.stop(); },
    'tts-norm-preview': (el) => {
      const o = document.getElementById('tts-norm-out');
      if (o && window.AvenSpeechText) o.textContent = window.AvenSpeechText.normalize(el.value);
    },
    'set-char': (el) => {
      write('settings.character.id', el.value);
      A.render();
      if (window.AvenChar) window.AvenChar.mountFloat();
      A.toast('Персонаж: ' + (window.AvenChar ? window.AvenChar.current().label : el.value));
    },
    'set-char-name': (el) => { write('settings.character.name', el.value); A.render(); if (window.AvenChar) window.AvenChar.mountFloat(); },
    'set-textsize': (el) => applyField('settings.textSize', el.value, el),
    'set-theme': (el) => applyField('settings.theme', el.value, el),
    'voice-test': (el) => {
      // Для Natural — тестовая фраза владельца (этап 6): имя «Авен», время, числа, километры.
      // Для системного движка — T1 из research/tts/phrases.json.
      const V = (s().settings && s().settings.voice) || {};
      const phrase = (V.engine === 'natural')
        ? 'Авен проверяет натуральный голос. Сейчас 18 часов 43 минуты, пробег автомобиля 104520 километров.'
        : 'Здравствуйте. Я Aven, ваш персональный помощник. Чем могу помочь?';
      const upd = (st) => { const o = document.getElementById('tts-last'); if (o && st) o.textContent = (st.lastLatencyMs != null ? st.lastLatencyMs + ' мс · ' : '') + (st.lastSource || st.lastEngine || ''); };
      if (window.AvenVoice) window.AvenVoice.speak(phrase, el, { charProfile: true, onStart: upd, onEnd: (ok, st) => upd(st) });
      else A.speak(phrase, null);
    },
    'privacy-reset': () => {
      A.confirmModal('Сбросить все демо-данные прототипа к исходным?', () => {
        S.reset(); A.applyEnv(); A.render(); A.toast('Демо-данные сброшены');
      });
    },
    /* Экспорт всех данных (§6.5). Раньше здесь было JSON.stringify(S.s) — сериализовалась функция,
       а не состояние, то есть файл получался пустым; исправлено на S.s() + общая выгрузка A.downloadFile. */
    'priv-export-all': () => {
      const st = s();
      A.confirmModal('Выгрузить все данные аккаунта в JSON? Файл содержит задачи, заметки, финансы и историю — это приватные данные, поэтому выгрузка подтверждается (MVP_SCOPE §7).', () => {
        A.closeModal();
        const payload = {
          exportedAt: new Date().toISOString(), demo: true,
          profile: st.profile, tasks: st.tasks, notes: st.notes, ops: st.ops, finMonth: st.finMonth,
          car: st.car, purchases: st.purchases, history: st.history, settings: st.settings
        };
        if (!A.downloadFile('aven-data-demo.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')) return;
        A.logAction({ action: 'data.export', title: 'Экспорт всех данных', object: 'Аккаунт · JSON',
          objectType: 'system', undoable: false, sensitive: true });
        A.toast('Все данные выгружены в JSON');
      });
    },
    /* Удаление аккаунта и всех данных (§6.5, §7): необратимо, поэтому re-auth + слово DELETE */
    'priv-delete-account': () => {
      A.openModal({
        title: 'Удалить аккаунт и все данные?',
        body: `<div class="tts-priv warn">⚠️ Необратимо. Удаляются все записи пользователя и завершаются сессии;
                 след остаётся только в административном аудите (ADR-012). Undo для удаления аккаунта не
                 поддерживается (MVP_SCOPE §5.9).</div>
               <div class="field"><label>Повторная аутентификация — текущий пароль</label>
                 <input type="password" name="pass" placeholder="••••••••" autocomplete="current-password">
                 <div class="s">Демо: пароль не проверяется по-настоящему, принимается «demo-pass-123».
                 Механизм re-auth и окно доверия — открытый вопрос №21.</div></div>
               <div class="field"><label>Введите DELETE, чтобы подтвердить</label><input type="text" name="word"></div>`,
        submitText: 'Удалить аккаунт и данные',
        onSubmit: (v) => {
          if (String(v.word || '').trim().toUpperCase() !== 'DELETE') { A.toast('Подтверждение не совпало — ничего не удалено'); return; }
          if (String(v.pass || '') !== 'demo-pass-123') { A.toast('Повторная аутентификация не пройдена — ничего не удалено'); return; }
          const st = s();
          const who = (st.auth && st.auth.email) || 'user@demo.aven';
          st.tasks = []; st.notes = []; st.ops = []; st.history = []; st.sessions = []; st.purchases = [];
          st.finMonth = { expense: 0, income: 0, balance: 0 };
          if (st.car) { st.car.fuel = []; st.car.expenses = []; st.car.service = []; }
          st.auth.logged = false; st.auth.name = ''; st.auth.email = ''; st.auth.twoFactor = false;
          st.auth.deletedNote = 'Аккаунт и все данные удалены (демо-сценарий). Запись об удалении — в административном аудите (#/admin → Аудит), а не в пользовательской истории: аудит и история разделены (ADR-012).';
          if (st.admin && Array.isArray(st.admin.audit)) {
            st.admin.audit.unshift({ id: S.id('a'), when: A.nowLabel(), actor: who, action: 'account.delete',
              object: 'аккаунт удалён по запросу пользователя', result: 'необратимо' });
          }
          S.save(); A.closeModal(); location.hash = '#/login'; A.applyEnv(); A.render();
          A.toast('Аккаунт и данные удалены (демо). Запись — в аудите админки');
        }
      });
    },
    'demo-stub': () => A.toast('Демо: в прототипе действие не выполняется'),
    'sec-password': () => {
      A.openModal({
        title: 'Сменить пароль',
        body: `<div class="tts-priv">Опасное действие: требует повторной аутентификации и записывается в историю
                 (MVP_SCOPE §7). Порог сложности пароля задаёт владелец (§5.1).</div>
               <div class="field"><label>Текущий пароль</label><input type="password" name="cur" autocomplete="current-password">
                 <div class="s">Демо: принимается «demo-pass-123».</div></div>
               <div class="field"><label>Новый пароль (минимум 8 символов)</label><input type="password" name="next" autocomplete="new-password"></div>
               <div class="field"><label>Повторите новый пароль</label><input type="password" name="next2" autocomplete="new-password"></div>`,
        submitText: 'Сменить пароль',
        onSubmit: (v) => {
          if (String(v.cur || '') !== 'demo-pass-123') { A.toast('Повторная аутентификация не пройдена — пароль не изменён'); return; }
          const a = String(v.next || ''), b = String(v.next2 || '');
          if (a.length < 8) { A.toast('Новый пароль короче 8 символов — не изменён'); return; }
          if (a !== b) { A.toast('Пароли не совпадают — не изменён'); return; }
          A.logAction({ action: 'auth.password.set', title: 'Пароль изменён', object: 'Настройки → Безопасность',
            objectType: 'settings', undoable: false, danger: true, sensitive: true,
            changes: [{ field: 'Пароль', from: '••••••••', to: '•••••••• (обновлён)' }] });
          A.closeModal(); A.toast('Пароль изменён (демо) · запись в истории'); A.render();
        }
      });
    },
    'sec-session-end': (el) => {
      const st = s();
      const x = (st.sessions || []).filter((q) => (q.id || '') === el.dataset.id)[0];
      if (!x) { A.toast('Сессия не найдена (демо)'); return; }
      A.confirmModal('Завершить сессию «' + x.device + '»? Потребуется повторный вход.', () => {
        st.sessions = (st.sessions || []).filter((q) => q !== x); S.save();
        if (A.logAction) A.logAction({ action: 'session.end', title: 'Сессия завершена', object: x.device,
          objectType: 'session', undoable: true, danger: true, changes: [] });
        A.closeModal(); A.toast('Сессия завершена (демо)'); A.render();
      });
    },

    'cmd-toggle': (el) => {
      const [, id] = el.dataset.action.split(':');
      const c = s().commands.find((x) => x.id === id);
      if (c) { c.enabled = el.checked; S.save(); }
    },
    'cmd-test': (el) => {
      const c = s().commands.find((x) => x.id === el.dataset.id);
      if (!c) return;
      A.openModal({
        title: 'Тест распознавания',
        body: `
          <div class="field"><label>Введите фразу по шаблону: <code>${A.esc(c.phrase)}</code></label>
          <input type="text" id="cmd-test-in" placeholder="${A.esc(c.phrase)}"></div>
          <div class="tool-out" id="cmd-test-out">— до фактического выполнения в режиме теста ничего не изменяется —</div>`,
        submitText: 'Распознать',
        onSubmit: () => {
          const o = document.getElementById('cmd-test-out');
          if (o) o.textContent = 'Демо-разбор:\nintent: ' + c.action + '\nconfidence: высокая (демо)\nподтверждение: не требуется';
        }
      });
    },
    'cmd-add': () => {
      A.openModal({
        title: 'Новая команда',
        body: `
          <div class="field"><label>Фраза / шаблон</label><input type="text" name="phrase" placeholder="запиши {сумма} на {категория}"></div>
          <div class="field"><label>Action</label><select name="action"><option>expense.add</option><option>note.create</option><option>event.create</option><option>car.fuel.add</option><option>timer.start</option></select></div>`,
        onSubmit: (v) => {
          const st = S.s();
          st.commands.push({ id: S.id('c'), phrase: v.phrase || 'моя команда', action: v.action, enabled: true });
          S.save(); A.closeModal(); A.render(); A.demoToast('Команда добавлена (демо)');
        }
      });
    },

    'dict-add': () => {
      A.openModal({
        title: 'Новое слово',
        body: `
          <div class="field"><label>Слово / фраза</label><input type="text" name="word" placeholder="например: бэха"></div>
          <div class="field"><label>Значение</label><input type="text" name="value" placeholder="BMW 530d"></div>
          <div class="field"><label>Тип</label><select name="type"><option>Автомобиль</option><option>Место</option><option>Человек</option><option>Счёт</option><option>Другое</option></select></div>`,
        onSubmit: (v) => {
          const st = S.s();
          st.dictionary.push({ id: S.id('d'), word: v.word || 'слово', value: v.value || '—', type: v.type });
          S.save(); A.closeModal(); A.render(); A.demoToast('Слово добавлено (демо)');
        }
      });
    },
    'dict-del': (el) => {
      A.confirmModal('Удалить слово из персонального словаря (демо)?', () => {
        const st = S.s();
        st.dictionary = st.dictionary.filter((d) => d.id !== el.dataset.id);
        S.save(); A.render();
      });
    },

    'mem-add': (el) => memForm(el.dataset.kind),
    'mem-edit': (el) => {
      const m = s().memory[el.dataset.kind].find((x) => x.id === el.dataset.id);
      if (m) memForm(el.dataset.kind, m);
    },
    'mem-del': (el) => {
      A.confirmModal('Удалить запись памяти (демо)?', () => {
        const st = S.s();
        st.memory[el.dataset.kind] = st.memory[el.dataset.kind].filter((m) => m.id !== el.dataset.id);
        S.save(); A.render(); A.toast('Запись удалена из памяти (демо)');
      });
    }
  });

  function memForm(kind, existing) {
    A.openModal({
      title: (existing ? 'Редактировать: ' : 'Добавить в память — ') + (kind === 'facts' ? 'факт' : 'объект'),
      body: `<div class="field"><label>Текст</label><textarea name="text" style="min-height:70px">${A.esc(existing ? existing.text : '')}</textarea></div>
             <div class="s" style="color:var(--muted);font-size:.8rem">Aven сохраняет в постоянную память только то, что разрешено пользователем.</div>`,
      onSubmit: (v) => {
        const st = S.s();
        if (existing) existing.text = v.text || existing.text;
        else st.memory[kind].push({ id: S.id('m'), text: v.text || '—' });
        S.save(); A.closeModal(); A.render(); A.demoToast('Память обновлена (демо)');
      }
    });
  }
})();
