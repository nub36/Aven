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
    ['voice', 'Голос', '🎙️', 'Stage 3'], ['notify', 'Уведомления', '🔔', 'частично 1.0'],
    ['commands', 'Команды', '⌨️', 'Stage 2'], ['dict', 'Словарь', '📖', 'Stage 2'],
    ['memory', 'Память', '🧠', '1.1'], ['home', 'Главная', '🏠', ''], ['modules', 'Модули', '🧩', ''],
    ['automations', 'Автоматизации', '⚡', 'Stage 4'], ['integrations', 'Интеграции', '🔌', '1.1'],
    ['sync', 'Синхронизация', '🔄', 'перспектива'], ['files', 'Файлы', '🗂️', '1.1'], ['privacy', 'Приватность', '🔐', ''],
    ['security', 'Безопасность', '🛡️', ''], ['a11y', 'Доступность', '♿', ''], ['exp', 'Экспериментальные', '🧪', '']
  ];
  const stageOf = (id) => (cats.filter((c) => c[0] === id)[0] || [])[3] || '';

  /* статус self-hosted TTS-сервера (асинхронно, без перерисовки всей страницы) */
  let lastServerKey = null;
  const serverKey = (st) => (st && st.checked ? st.ok + ':' + st.voices.map((v) => v.id).join(',') : 'unchecked');
  function refreshTtsServer(force) {
    if (!window.AvenTTS) return;
    window.AvenTTS.checkServer(force).then((st) => {
      const el = document.getElementById('tts-server-status');
      if (el) {
        el.textContent = st.ok ? 'подключён · голосов: ' + st.voices.length : 'не подключён — ' + (st.error || 'нет ответа');
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

  /* натуральные голоса, сгруппированные по источнику/движку */
  function natGroups(list, sel) {
    const groups = {};
    list.forEach((v) => {
      const g = v.privacy === 'self-hosted' ? 'Self-hosted сервер' : ((v.meta && v.meta.engineTitle) || 'Образцы') + (v.meta && v.meta.commercial && v.meta.commercial !== 'yes' ? ' — только сравнение' : '');
      (groups[g] = groups[g] || []).push(v);
    });
    return Object.keys(groups).map((g) => `<optgroup label="${A.esc(g)}">${groups[g].map((v) =>
      `<option value="${A.esc(v.id)}" ${v.id === sel ? 'selected' : ''}>${A.esc(v.privacy === 'self-hosted' ? v.label : ((v.meta && v.meta.voice) || v.label) + (v.meta && v.meta.sampleNote ? ' · ' + v.meta.sampleNote : ''))}</option>`).join('')}</optgroup>`).join('');
  }

  function setRow(title, sub, control) {
    return `<div class="set-row"><div class="grow"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>${control}</div>`;
  }
  function sw(name, checked, action) {
    return `<label class="switch"><input type="checkbox" ${checked ? 'checked' : ''} data-action="${action || 'set-toggle'}" data-path="${name}"><span class="slider"></span></label>`;
  }

  A.pages.settings = function () {
    const nav = cats.map(([id, label, ico, stage]) =>
      `<button class="nav-item ${cat === id ? 'active' : ''}" data-action="set-cat" data-id="${id}"
         ${stage ? `title="Не входит в срез Stage 1.0: ${A.esc(stage)} (docs/MVP_SCOPE.md §8)"` : ''}><span class="ico">${ico}</span>${label}${stage ? `<span class="stage-badge ${stage === '1.1' ? 'next' : 'later'}">${A.esc(stage)}</span>` : ''}</button>`).join('');
    const html = `
    <div class="page-head"><div><h1>Настройки</h1><div class="sub">/settings — настройки конкретного пользователя (ADR-012: отдельно от /admin) · демо, переключения локальные · метки «1.1», «Stage 2–4» означают, что раздел не входит в срез Stage 1.0 (docs/MVP_SCOPE.md §8)</div></div>
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
      <h2 class="set-h">Профиль</h2><p class="set-sub">Имя, обращение, язык, регион, форматы</p>
      <div class="card">
        ${setRow('Имя', '', `<input type="text" value="${A.esc(st.profile.name)}" style="width:220px" data-action-stop>`)}
        ${setRow('Обращение', 'как Aven обращается к вам', `<input type="text" value="${A.esc(st.profile.greeting)}" style="width:220px">`)}
        ${setRow('Язык', '', `<select><option selected>Русский</option><option>English (перспектива)</option></select>`)}
        ${setRow('Регион / город', '', `<input type="text" value="${A.esc(st.profile.city)}" style="width:220px">`)}
        ${setRow('Часовой пояс', '', `<input type="text" value="${A.esc(st.profile.tz)}" style="width:220px">`)}
        ${setRow('Валюта', '', `<input type="text" value="${A.esc(st.profile.currency)}" style="width:220px">`)}
        ${setRow('Формат даты', '', `<select><option selected>ДД.ММ.ГГГГ</option><option>ГГГГ-ММ-ДД</option></select>`)}
        ${setRow('Формат времени', '', `<select><option selected>24 ч</option><option>12 ч</option></select>`)}
        ${setRow('Начало недели', '', `<select><option selected>Понедельник</option><option>Воскресенье</option></select>`)}
      </div>`;

    if (cat === 'aven') return `
      <h2 class="set-h">Aven</h2><p class="set-sub">Поведение помощника и временные понятия</p>
      <div class="card">
        ${setRow('Ответы', 'краткие или подробные', `<select data-action-stop><option ${B.answers === 'краткие' ? 'selected' : ''}>краткие</option><option ${B.answers === 'подробные' ? 'selected' : ''}>подробные</option></select>`)}
        ${setRow('Уровень подтверждений', 'когда спрашивать перед действием', `<select><option ${B.confirmation === 'только перед опасными' ? 'selected' : ''}>перед опасными действиями</option><option ${B.confirmation === 'перед удалениями' ? 'selected' : ''}>перед удалениями</option><option>всегда спрашивать</option></select>`)}
        ${setRow('«Утро» начинается в', '', `<input type="time" value="${B.morning}" style="width:130px">`)}
        ${setRow('«День» начинается в', '', `<input type="time" value="${B.day}" style="width:130px">`)}
        ${setRow('«Вечер» начинается в', '', `<input type="time" value="${B.evening}" style="width:130px">`)}
        ${setRow('«Ночь» начинается в', '', `<input type="time" value="${B.night}" style="width:130px">`)}
        ${setRow('«После работы» — с', '', `<input type="time" value="${B.afterWork}" style="width:130px">`)}
      </div>`;

    if (cat === 'character') {
      const C = st.settings.character || { enabled: true, id: 'female' };
      const chars = window.AvenChar ? window.AvenChar.CHARS : {};
      const preview = window.AvenChar ? window.AvenChar.avatar('s52') : '';
      return `
      <h2 class="set-h">Персонаж</h2><p class="set-sub">Вымышленный визуальный образ Aven · опциональный слой оформления</p>
      <div class="card">
        <div class="set-row"><div class="grow"><div class="t">Текущий образ</div><div class="s">персонаж — только оформление, функции от него не зависят</div></div>${preview}</div>
        ${setRow('Показывать персонажа', 'выключите — будет нейтральный логотип «A»', sw('settings.character.enabled', C.enabled))}
        ${setRow('Персонаж', 'вымышленные Female / Male', `<select data-action="set-char" style="width:220px">${Object.keys(chars).map((k) => `<option value="${k}" ${C.id === k ? 'selected' : ''}>${A.esc(chars[k].label)}</option>`).join('')}</select>`)}
        ${setRow('Своё имя персонажа', 'пусто — имя по умолчанию', `<input type="text" value="${A.esc(C.name || '')}" style="width:220px" data-action="set-char-name">`)}
        ${setRow('Плавающий Aven', 'кнопка-персонаж в углу экрана', sw('settings.character.floating', C.floating))}
        ${setRow('Приветствие при запуске', 'показывать пузырь-приветствие', sw('settings.character.greet', C.greet))}
        ${setRow('Голосовой профиль персонажа', 'подбирать тембр под образ (демо)', sw('settings.character.voiceProfile', C.voiceProfile))}
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
      const natSel = NV.voice && natVoices.some((x) => x.id === NV.voice) ? NV.voice : (natVoices[0] && natVoices[0].id) || '';
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
        ${setRow('Голосовые ответы', 'озвучивать ответы Aven', sw('settings.voice.enabled', V.enabled))}
        ${setRow('Всегда отвечать голосом', 'если выключено — только по запросу', sw('settings.voice.alwaysVoice', V.alwaysVoice))}
        ${setRow('Движок речи', 'системный голос остаётся всегда доступным запасным вариантом',
          `<select data-action="set-voice-engine" style="width:240px">
            <option value="system" ${engine === 'system' ? 'selected' : ''}>Системный (браузер / ОС)</option>
            <option value="natural" ${engine === 'natural' ? 'selected' : ''}>Натуральный · эксперимент</option>
          </select>`)}
        ${engine === 'system' ? setRow('Голос', sysVoices.length ? 'системные голоса: «на устройстве» — локально, «онлайн» — текст уходит поставщику' : 'системные голоса не найдены — демо',
          `<select data-action="set-voice" style="width:240px">${sysVoices.length ? sysVoices.map((v) => `<option value="${A.esc(v.id)}" ${v.id === V.voiceURI ? 'selected' : ''}>${A.esc(v.label)} · ${v.privacy === 'device' ? 'на устройстве' : 'онлайн'}</option>`).join('') : '<option>Системный (по умолчанию)</option>'}</select>`) : ''}
        ${engine === 'natural' ? setRow('Натуральный голос', 'кандидаты исследования TTS · выбор — за владельцем после прослушивания',
          `<select data-action="set-natural-voice" style="width:240px">${natVoices.length ? natGroups(natVoices, natSel) : '<option value="">образцов пока нет</option>'}</select>`) : ''}
        ${engine === 'natural' && natMeta ? setRow('Лицензия голоса', A.esc(natMeta.license || ''), licPill(natMeta)) : ''}
        ${engine === 'natural' ? setRow('Self-hosted TTS-сервер', 'research/tts/server.py · пусто — тот же адрес, что у страницы',
          `<div style="display:flex;gap:6px;align-items:center"><input type="text" value="${A.esc(NV.serverUrl || '')}" placeholder="http://192.168.1.10:8080" style="width:190px" data-action="set-natural-server"><button class="btn small" data-action="tts-check-server">Проверить</button></div>`) : ''}
        ${engine === 'natural' ? setRow('Статус сервера', '', '<span class="pill" id="tts-server-status">проверяю…</span>') : ''}
        ${engine === 'natural' ? setRow('Кэш озвучки', 'только память вкладки; фразы с цифрами и именами не кэшируются', sw('settings.voice.natural.cache', NV.cache !== false)) : ''}
        ${priv ? `<div class="tts-priv ${priv.ok ? '' : 'warn'}"><span class="pill ${priv.ok ? 'ok' : ''}">${A.esc(priv.tag)}</span><span>${A.esc(priv.text)}</span></div>` : ''}
        ${engine === 'system' ? setRow('Скорость', '', `<div class="slider-row" style="width:240px"><input type="range" min="0.5" max="2" step="0.1" value="${V.rate}" data-action="set-slider" data-path="settings.voice.rate"><span class="val">${V.rate}</span></div>`) : ''}
        ${engine === 'system' ? setRow('Высота', '', `<div class="slider-row" style="width:240px"><input type="range" min="0.5" max="1.5" step="0.1" value="${V.pitch}" data-action="set-slider" data-path="settings.voice.pitch"><span class="val">${V.pitch}</span></div>`) : ''}
        ${setRow('Громкость', '', `<div class="slider-row" style="width:240px"><input type="range" min="0" max="1" step="0.1" value="${V.volume}" data-action="set-slider" data-path="settings.voice.volume"><span class="val">${V.volume}</span></div>`)}
        ${setRow('Прослушать', 'тестовая фраза T1 · Esc или повторное нажатие — стоп',
          `<div style="display:flex;gap:6px"><button class="btn primary" data-action="voice-test">▶ Прослушать</button><button class="btn" data-action="tts-stop">■ Стоп</button></div>`)}
        ${setRow('Последний запуск', 'время до начала звука · источник', `<span class="pill" id="tts-last">${stats.lastLatencyMs != null ? stats.lastLatencyMs + ' мс · ' + A.esc(stats.lastSource || stats.lastEngine) : '—'}</span>`)}
        ${setRow('Сравнить голоса', 'A/B-прослушивание одинаковых фраз всеми кандидатами, слепой режим', '<a class="btn" href="voice-lab.html" target="_blank" rel="noopener">Открыть сравнение ↗</a>')}
        ${setRow('Поддержка браузера', 'честный статус возможностей', `<span class="pill ${ttsOn ? 'ok' : ''}">TTS: ${ttsOn ? 'да' : 'нет'}</span> <span class="pill ${sttOn ? 'ok' : ''}">STT: ${sttOn ? 'да' : 'нет'}</span>`)}
        ${setRow('Голосовой ввод (STT)', 'экспериментально · SpeechRecognition', sttOn ? sw('settings.voice.stt.enabled', ST.enabled) : '<span class="pill">недоступно</span>')}
        ${sttOn && ST.enabled ? setRow('Промежуточный текст', 'показывать распознанное по мере речи', sw('settings.voice.stt.interim', ST.interim)) : ''}
        ${sttOn && ST.enabled ? setRow('Автоотправка', 'отправлять фразу сразу после распознавания', sw('settings.voice.stt.autoSend', ST.autoSend)) : ''}
        ${setRow('Fallback при недоступности TTS', 'натуральный голос недоступен → системный; нет TTS → текст', '<span class="pill ok">включён всегда</span>')}
      </div>
      <div class="card" style="margin-top:12px">
        <div class="t" style="font-weight:600;margin-bottom:4px">Как Aven прочитает текст</div>
        <div class="tts-note">На экране текст не меняется. Для речи числа, время, даты, деньги и единицы переводятся в слова.</div>
        <input type="text" id="tts-norm-in" data-action="tts-norm-preview" value="Заправка добавлена: 42 л, 3 200 ₽. Пробег 104 520 км, напомню в 9:30." style="width:100%">
        <div class="tts-norm" id="tts-norm-out">${A.esc(window.AvenSpeechText ? window.AvenSpeechText.normalize('Заправка добавлена: 42 л, 3 200 ₽. Пробег 104 520 км, напомню в 9:30.') : '')}</div>
      </div>`;
    }

    if (cat === 'notify') return `
      <h2 class="set-h">Уведомления</h2><p class="set-sub">Голосовые события · тихие часы · приватность произнесения</p>
      <div class="card">
        ${setRow('Разрешить голосовое произнесение уведомлений', '', sw('settings.notify.voiceAllowed', N.voiceAllowed))}
        ${setRow('Тихие часы', 'не беспокоить голосом ночью', sw('settings.notify.quietHours', N.quietHours))}
        ${N.quietHours ? setRow('Интервал тихих часов', '', `<div style="display:flex;gap:6px;align-items:center"><input type="time" value="${N.quietFrom}" style="width:110px"> — <input type="time" value="${N.quietTo}" style="width:110px"></div>`) : ''}
        ${setRow('Звук перед голосом', '', sw('settings.notify.soundBefore', N.soundBefore))}
        ${setRow('При подключённых наушниках', 'поведение (реализуемость — открытый вопрос №22)', `<select><option ${N.headphones === 'продолжать' ? 'selected' : ''}>продолжать</option><option>только звук</option><option>молча</option></select>`)}
        ${setRow('Приватная информация', 'правила произнесения сумм и имен', `<select><option ${N.privateInfo === 'не произносить суммы' ? 'selected' : ''}>не произносить суммы</option><option>произносить всё</option><option>всегда молча</option></select>`)}
        <div class="s" style="color:var(--muted);font-size:.82rem;padding:10px 4px">Ограничения платформ отображаются честно: закрытая вкладка не получит голос (ADR-010).</div>
      </div>`;

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
            <td>${sw('cmd', c.enabled, 'cmd-toggle:' + c.id)}</td>
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
      const rows = [['today', 'Карточка «Сегодня»'], ['tasks', 'Карточка «Задачи»'], ['expenses', 'Карточка «Расходы»'], ['car', 'Карточка «Автомобиль»'], ['quick', 'Быстрые действия']];
      return `
      <h2 class="set-h">Главная</h2><p class="set-sub">Включение/отключение карточек · порядок — в перспективе (вопрос №25)</p>
      <div class="card">${rows.map(([id, label]) => setRow(label, '', sw('settings.homeCards.' + id, C[id]))).join('')}
      <div class="s" style="color:var(--muted);font-size:.82rem;padding-top:10px">Изменения сразу применяются на главной странице.</div></div>`;
    }

    if (cat === 'modules') {
      const M = st.settings.modules;
      const rows = [['calendar', 'Календарь'], ['tasks', 'Задачи'], ['notes', 'Заметки'], ['finance', 'Финансы'], ['auto', 'Авто'], ['shopping', 'Покупки'], ['tools', 'Инструменты']];
      return `
      <h2 class="set-h">Модули</h2><p class="set-sub">Включение/отключение ненужных модулей — пункты скрываются в меню (демо)</p>
      <div class="card">
        ${rows.map(([id, label]) => setRow(label, '', sw('settings.modules.' + id, M[id]))).join('')}
        ${setRow('Пользовательские модули', 'собственные разделы — перспектива (ADR-009)', '<span class="pill">позже</span>')}
      </div>`;
    }

    if (cat === 'automations') return `
      <h2 class="set-h">Автоматизации</h2><p class="set-sub">Управление из настроек · полный список — в разделе «Автоматизации»</p>
      <div class="card">
        ${st.automations.map((a) => setRow(`${a.icon} ${A.esc(a.name)}`, A.esc(a.trigger), sw('auto', a.enabled, 'auto-toggle:' + a.id))).join('')}
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
      <h2 class="set-h">Приватность</h2><p class="set-sub">Пользователь контролирует свои данные</p>
      <div class="card">
        ${setRow('Экспорт данных', 'весь аккаунт — в перспективе', '<button class="btn" data-action="export-state">⬇ Экспорт прототипа</button>')}
        ${setRow('Удаление данных', 'delete account — в перспективе', '<button class="btn danger" data-action="privacy-reset">Сбросить демо-данные</button>')}
        ${setRow('Диагностические данные', 'управление телеметрией (вопрос №22)', sw('privacy.diag', false))}
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
        ${setRow('Размер текста', '', `<select data-action="set-textsize"><option value="sm" ${st.settings.textSize === 'sm' ? 'selected' : ''}>Мелкий</option><option value="md" ${st.settings.textSize === 'md' ? 'selected' : ''}>Обычный</option><option value="lg" ${st.settings.textSize === 'lg' ? 'selected' : ''}>Крупный</option></select>`)}
        ${setRow('Тема оформления', 'вопрос №32: светлая / тёмная / как в системе', `<select data-action="set-theme">
            <option value="light" ${st.settings.theme === 'light' ? 'selected' : ''}>Светлая</option>
            <option value="dark" ${st.settings.theme === 'dark' ? 'selected' : ''}>Тёмная</option>
            <option value="system" ${(st.settings.theme === 'system' || st.settings.theme === 'auto') ? 'selected' : ''}>Как в системе</option>
          </select>`)}
        ${setRow('Уменьшить анимации', 'reduced motion', sw('settings.reduceMotion', st.settings.reduceMotion))}
        ${setRow('Управление с клавиатуры', 'базовая навигация Tab/Enter работает в прототипе', '<span class="pill ok">включено</span>')}
      </div>`;

    if (cat === 'exp') return `
      <h2 class="set-h">Экспериментальные функции</h2><p class="set-sub">Возможность отдельно включать будущие возможности Aven</p>
      <div class="card">
        ${setRow('Automation Canvas (превью)', 'Stage 4', sw('settings.experiments.canvas', st.settings.experiments.canvas))}
        ${setRow('AI Router (заглушка)', 'AI — необязательный слой, ADR-002', sw('settings.experiments.aiRouter', st.settings.experiments.aiRouter))}
        ${setRow('Гео-напоминания', 'перспектива', sw('settings.experiments.geoReminders', st.settings.experiments.geoReminders))}
        <div class="s" style="color:var(--muted);font-size:.82rem;padding-top:10px">Экспериментальные функции могут работать нестабильно — это ожидаемо.</div>
      </div>`;

    return '';
  }

  A.pages.profile = function () {
    const p = s().profile;
    return { html: `
    <div class="page-head"><div><h1>Профиль</h1><div class="sub">Демо-пользователь · настоящая авторизация не нужна</div></div></div>
    <div class="grid cols-2" style="max-width:860px">
      <div class="card">
        <div class="profile-head">
          <button class="avatar big">А</button>
          <div>
            <div style="font-size:1.2rem;font-weight:700">${A.esc(p.name)}</div>
            <div style="color:var(--muted)">${A.esc(p.email)}</div>
            <div style="margin-top:6px"><span class="pill accent">демо-аккаунт</span></div>
          </div>
        </div>
        <div style="margin-top:16px">
          ${setRow('Город', '', `<span>${A.esc(p.city)}</span>`)}
          ${setRow('Часовой пояс', '', `<span>${A.esc(p.tz)}</span>`)}
          ${setRow('Валюта', '', `<span>${A.esc(p.currency)}</span>`)}
        </div>
      </div>
      <div class="card">
        <h3>Быстрые ссылки</h3>
        ${setRow('Настройки', 'все категории', '<a class="btn small" href="#/settings">Открыть</a>')}
        ${setRow('Память Aven', 'что Aven знает о вас', `<a class="btn small" href="#/settings" data-action="set-cat-link" data-id="memory">Открыть</a>`)}
        ${setRow('Безопасность', 'сессии и устройства', `<a class="btn small" href="#/settings" data-action="set-cat-link" data-id="security">Открыть</a>`)}
        ${setRow('Выйти', 'в прототипе — просто вернуться на главную', '<a class="btn small" href="#/home">На главную</a>')}
      </div>
    </div>` };
  };

  /* ---------- действия ---------- */
  function getByPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  function setByPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = val;
  }

  A.register({
    'set-cat': (el) => { cat = el.dataset.id; A.render(); },
    'set-cat-link': (el) => { cat = el.dataset.id; },
    'set-toggle': (el) => {
      setByPath(s(), el.dataset.path, el.checked);
      S.save();
      A.toast(el.checked ? 'Включено (демо)' : 'Выключено (демо)');
      if (/^settings\.modules\./.test(el.dataset.path) || /^settings\.homeCards\./.test(el.dataset.path)) A.applyEnv();
      if (/^settings\.character\./.test(el.dataset.path)) A.render(); // hero перестраивается под character on/off
    },
    'set-slider': (el) => {
      setByPath(s(), el.dataset.path, parseFloat(el.value));
      S.save();
      const val = el.parentElement.querySelector('.val');
      if (val) val.textContent = el.value;
    },
    'set-voice': (el) => { s().settings.voice.voiceURI = el.value; S.save(); A.render(); },
    'set-voice-engine': (el) => {
      if (window.AvenTTS) window.AvenTTS.stop();
      s().settings.voice.engine = el.value === 'natural' ? 'natural' : 'system';
      S.save(); A.render();
      if (el.value === 'natural') A.toast('Натуральный голос — эксперимент: без сервера доступны только тестовые фразы, остальное — системным голосом');
    },
    'set-natural-voice': (el) => { s().settings.voice.natural.voice = el.value; S.save(); A.render(); },
    'set-natural-server': (el) => { s().settings.voice.natural.serverUrl = el.value.trim(); S.save(); },
    'tts-check-server': () => { refreshTtsServer(true); },
    'tts-stop': () => { if (window.AvenTTS) window.AvenTTS.stop(); },
    'tts-norm-preview': (el) => {
      const o = document.getElementById('tts-norm-out');
      if (o && window.AvenSpeechText) o.textContent = window.AvenSpeechText.normalize(el.value);
    },
    'set-char': (el) => {
      s().settings.character.id = el.value;
      S.save();
      A.render();
      if (window.AvenChar) window.AvenChar.mountFloat();
      A.toast('Персонаж: ' + (window.AvenChar ? window.AvenChar.current().label : el.value) + ' (демо)');
    },
    'set-char-name': (el) => { s().settings.character.name = el.value; S.save(); A.render(); if (window.AvenChar) window.AvenChar.mountFloat(); },
    'set-textsize': (el) => { s().settings.textSize = el.value; S.save(); A.applyEnv(); },
    'set-theme': (el) => { s().settings.theme = el.value; S.save(); A.applyEnv(); A.render(); },
    'voice-test': (el) => {
      // T1 из research/tts/phrases.json — у натуральных голосов для неё есть готовый образец
      const phrase = 'Здравствуйте. Я Aven, ваш персональный помощник. Чем могу помочь?';
      const upd = (st) => { const o = document.getElementById('tts-last'); if (o && st) o.textContent = (st.lastLatencyMs != null ? st.lastLatencyMs + ' мс · ' : '') + (st.lastSource || st.lastEngine || ''); };
      if (window.AvenVoice) window.AvenVoice.speak(phrase, el, { charProfile: true, onStart: upd, onEnd: (ok, st) => upd(st) });
      else A.speak(phrase, null);
    },
    'privacy-reset': () => {
      A.confirmModal('Сбросить все демо-данные прототипа к исходным?', () => {
        S.reset(); A.applyEnv(); A.render(); A.toast('Демо-данные сброшены');
      });
    },
    'export-state': () => {
      try {
        const blob = new Blob([JSON.stringify(S.s, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'aven-prototype-state.json';
        a.click();
        A.demoToast('Экспорт состояния прототипа');
      } catch (e) { A.toast('Экспорт недоступен в этом браузере'); }
    },
    'demo-stub': () => A.toast('Демо: в прототипе действие не выполняется'),
    'sec-password': () => {
      A.confirmModal('Сменить пароль? В реальной системе это опасное действие: оно требует текущего пароля и записывается в историю.', () => {
        if (A.logAction) A.logAction({ action: 'auth.password.set', title: 'Пароль изменён (демо)', object: 'Настройки → Безопасность',
          objectType: 'settings', undoable: false, danger: true, sensitive: true, changes: [] });
        A.closeModal(); A.toast('Пароль изменён (демо) · запись в истории'); A.render();
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
