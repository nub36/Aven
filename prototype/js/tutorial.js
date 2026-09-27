/* Aven — Visual Prototype. Reusable Guided Tutorial / Tour engine.
   Только UX-прототип: декларативные шаги, подсветка UI и optional narration через существующий AvenVoice/AvenTTS.
   Не создаёт отдельную бизнес-логику задач/событий и не меняет voice/TTS infrastructure. */
window.AvenTutorial = (function () {
  const A = window.Aven;
  const S = window.AvenState;
  const s = () => S.s();

  const STORE_KEY = 'tutorials';
  const MOBILE_QUERY = '(max-width: 640px)';
  let active = null; // { id, step, previousFocus, navigating }
  let els = null;
  let resizeTimer = null;

  const defs = {
    home: {
      id: 'home', route: 'home', title: 'Главная',
      steps: [
        { target: 'home-hero', title: 'Aven как центр дня', text: 'Главная собирает ближайшие события, задачи и последние изменения из общих данных. Персонаж — presentation layer: он не меняет ваши записи.' },
        { target: 'command-bar', title: 'Command bar', text: 'Здесь можно написать демо-команду или открыть Assistant. Это не полноценный NLP Command Engine, а безопасный вход в существующие demo-routes.' },
        { target: 'home-summary', title: 'Summary blocks', text: 'Карточки читают реальные demo-state данные: задачи, календарь, финансы, авто, гарантии, заметки и историю. Изменения из разделов сразу отражаются здесь.' },
        { target: 'quick-actions', title: 'Быстрые действия', text: 'Быстрые кнопки открывают обычные формы. Реальные задачи и события всё равно проходят через Common Action Layer и попадают в History/Undo.' }
      ]
    },
    tasks: {
      id: 'tasks', route: 'tasks', title: 'Задачи',
      steps: [
        { target: 'task-create', title: 'Создать задачу', text: 'Кнопка открывает форму задачи. Форма сохраняет title, description, date/time/deadline, priority, tags, status и reminder metadata через common task actions.' },
        { target: 'task-tabs', title: 'Фильтры статусов', text: 'Вкладки показывают активные, сегодняшние, предстоящие, просроченные, выполненные и архивные задачи. Переключение фильтров не пишется в историю.' },
        { target: 'task-filters', title: 'Search / priority / tag', text: 'Поиск и фильтры помогают сузить список без изменения данных. Сами задачи остаются общими для «Задач», «Дня» и «Главной».' },
        { target: 'task-list', title: 'Complete / reopen / edit / delete', text: 'Чекбокс выполняет или возвращает задачу, редактирование меняет поля, удаление требует подтверждения. Эти действия пишутся в History и имеют Undo.' }
      ]
    },
    calendar: {
      id: 'calendar', route: 'calendar', title: 'Календарь',
      steps: [
        { target: 'calendar-create', title: 'Создание события', text: 'Событие создаётся обычной формой и сохраняется через event.create. Оно сразу видно в календаре, «Дне» и на «Главной».' },
        { target: 'calendar-views', title: 'Month / Agenda / Week / Day', text: 'Месяц подходит для обзора, Agenda — для списка ближайших событий, неделя и день — для фокуса. Все виды читают один event state.' },
        { target: 'calendar-board', title: 'Выбранная дата', text: 'Нажмите день, чтобы выбрать дату. Reminder metadata хранится в событии, но web-прототип не обещает доставку уведомлений при закрытом браузере.' },
        { target: 'calendar-event-actions', title: 'Edit / delete', text: 'Карточки событий открывают просмотр, редактирование и удаление с подтверждением. Изменения проходят через event.* actions и доступны Undo.' }
      ]
    },
    day: {
      id: 'day', route: 'day', title: 'День',
      steps: [
        { target: 'day-date', title: 'Выбор даты', text: '«День» можно переключать на вчера, сегодня, завтра или любую дату через date picker. Это меняет обзор, а не отдельное хранилище.' },
        { target: 'day-summary', title: 'Сводка дня', text: 'Сводка показывает количество событий, активных и выполненных задач, а также просроченное к выбранной дате.' },
        { target: 'day-timeline', title: 'Timeline', text: 'Timeline объединяет события и задачи выбранного дня из общих task/event getters.' },
        { target: 'day-tasks', title: 'Действия с задачами', text: 'Задачу можно выполнить, вернуть или открыть на редактирование. Это те же task.complete/task.reopen/task.update, что в разделе «Задачи».' },
        { target: 'day-attention', title: 'Требует внимания', text: 'Блок показывает просроченные задачи, документы авто и гарантии по текущим данным. Это не имитация фоновых уведомлений.' }
      ]
    },
    help: {
      id: 'help', route: 'help', title: 'Помощь',
      steps: [
        { target: 'help-search', title: 'Поиск по Help', text: 'Поиск локальный и быстрый: ищет по заголовкам, ключевым словам и текстам статей без AI и внешних сервисов.' },
        { target: 'help-categories', title: 'Категории', text: 'Категории сгруппированы по существующим возможностям: старт, Главная, задачи, календарь, день, команды, голос, FAQ и доступность.' },
        { target: 'help-results', title: 'Материалы и обучение', text: 'Из Help можно открыть релевантную статью, запустить tutorial для раздела или прослушать текст, если голос включён.' }
      ]
    }
  };

  function store() {
    const st = s();
    if (!st[STORE_KEY]) st[STORE_KEY] = { voice: false, progress: {}, completed: {} };
    st[STORE_KEY].progress = st[STORE_KEY].progress || {};
    st[STORE_KEY].completed = st[STORE_KEY].completed || {};
    return st[STORE_KEY];
  }
  function save() { if (S && S.save) S.save(); }
  function isMobile() {
    try { return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches; }
    catch (e) { return window.innerWidth <= 640; }
  }
  function currentRoute() { return (location.hash || '#/home').replace(/^#\//, '') || 'home'; }
  function targetSelector(name) { return '[data-tour="' + String(name || '').replace(/"/g, '') + '"]'; }
  function stepDef() { return active && defs[active.id] && defs[active.id].steps[active.step]; }

  function textForSpeech(step) {
    if (!step) return '';
    return step.title + '. ' + step.text;
  }
  function stopVoice() {
    try { if (window.AvenVoice && window.AvenVoice.stop) window.AvenVoice.stop(); }
    catch (e) { /* narration is optional */ }
  }
  function speakStep() {
    const st = store();
    const step = stepDef();
    if (!active || !st.voice || !step) return false;
    stopVoice();
    try {
      if (window.AvenVoice && window.AvenVoice.speak) return !!window.AvenVoice.speak(textForSpeech(step), null);
    } catch (e) { /* TTS failure must not break tutorial */ }
    return false;
  }

  function ensureEls() {
    if (els && document.body.contains(els.layer)) return els;
    const layer = document.createElement('div');
    layer.className = 'tour-layer';
    layer.innerHTML = '<div class="tour-scrim" aria-hidden="true"></div><div class="tour-pop" role="dialog" aria-modal="false" aria-live="polite"></div>';
    document.body.appendChild(layer);
    els = { layer, pop: layer.querySelector('.tour-pop') };
    return els;
  }
  function clearTarget() {
    document.querySelectorAll('.tour-target-active').forEach((el) => el.classList.remove('tour-target-active'));
  }
  function cleanup(removeCompletion) {
    stopVoice();
    clearTarget();
    if (els && els.layer && els.layer.parentNode) els.layer.parentNode.removeChild(els.layer);
    els = null;
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey);
    const prev = active && active.previousFocus;
    active = null;
    if (removeCompletion === true) return;
    try { if (prev && document.contains(prev)) prev.focus(); } catch (e) { /* noop */ }
  }
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 80);
  }
  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  }
  window.addEventListener('hashchange', () => {
    if (!active) return;
    if (active.navigating) { active.navigating = false; setTimeout(render, 180); return; }
    close();
  });

  function placePopover(target) {
    if (!els) return;
    const pop = els.pop;
    pop.classList.toggle('tour-pop-mobile', isMobile());
    if (isMobile() || !target) {
      pop.style.left = '12px';
      pop.style.right = '12px';
      pop.style.top = 'auto';
      pop.style.bottom = '12px';
      pop.style.maxWidth = 'none';
      return;
    }
    const r = target.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const pw = Math.min(380, Math.max(300, pop.offsetWidth || 340));
    const ph = Math.min(320, pop.offsetHeight || 220);
    let left = r.left + Math.min(r.width / 2, 160) + 18;
    let top = r.top;
    if (left + pw + 16 > vw) left = r.left - pw - 18;
    if (left < 12) left = Math.min(vw - pw - 12, 12);
    if (top + ph + 16 > vh) top = Math.max(12, vh - ph - 16);
    pop.style.left = Math.round(left) + 'px';
    pop.style.right = 'auto';
    pop.style.top = Math.round(top) + 'px';
    pop.style.bottom = 'auto';
    pop.style.maxWidth = pw + 'px';
  }

  function render() {
    if (!active) return;
    const def = defs[active.id];
    const step = def && def.steps[active.step];
    if (!def || !step) return close();
    const ui = ensureEls();
    clearTarget();
    const target = document.querySelector(targetSelector(step.target));
    if (target) {
      target.classList.add('tour-target-active');
      try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* jsdom */ }
    }
    const total = def.steps.length;
    const st = store();
    const canPrev = active.step > 0;
    const isLast = active.step >= total - 1;
    ui.pop.innerHTML = `
      <div class="tour-kicker">Обучение · ${A.esc(def.title)} · шаг ${active.step + 1}/${total}</div>
      <h3>${A.esc(step.title)}</h3>
      <p>${A.esc(step.text)}</p>
      ${target ? '' : '<div class="tour-missing">Этот элемент сейчас не виден. Можно продолжить обучение: engine не ломает страницу при missing target.</div>'}
      <div class="tour-controls" aria-label="Управление обучением">
        <button class="btn small" data-action="tour-prev" ${canPrev ? '' : 'disabled'}>← Назад</button>
        ${isLast ? '<button class="btn primary small" data-action="tour-finish">Готово</button>' : '<button class="btn primary small" data-action="tour-next">Далее →</button>'}
        <button class="btn small" data-action="tour-skip">Пропустить</button>
      </div>
      <div class="tour-voice">
        <button class="btn small" data-action="tour-voice" aria-pressed="${st.voice ? 'true' : 'false'}">${st.voice ? '🔊 Голос: вкл' : '🔇 Голос: выкл'}</button>
        <button class="btn small" data-action="tour-repeat">Повторить</button>
        <button class="btn small" data-action="tour-stop">Стоп</button>
        <button class="icon-btn" data-action="tour-close" aria-label="Закрыть обучение">✕</button>
      </div>`;
    placePopover(target);
    st.progress[active.id] = active.step;
    save();
    const focus = ui.pop.querySelector(isLast ? '[data-action="tour-finish"]' : '[data-action="tour-next"]');
    try { focus && focus.focus(); } catch (e) { /* noop */ }
    speakStep();
  }

  function start(id, opts) {
    const def = defs[id];
    if (!def) return false;
    close(false);
    const st = store();
    const restart = opts && opts.restart;
    const saved = Number(st.progress[id] || 0);
    active = {
      id,
      step: restart ? 0 : Math.max(0, Math.min(saved, def.steps.length - 1)),
      previousFocus: document.activeElement,
      navigating: false
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
    const route = currentRoute();
    if (def.route && route !== def.route) {
      active.navigating = true;
      location.hash = '#/' + def.route;
      setTimeout(render, 260);
    } else render();
    return true;
  }
  function next() {
    if (!active) return;
    const def = defs[active.id];
    stopVoice();
    active.step = Math.min(active.step + 1, def.steps.length - 1);
    render();
  }
  function prev() {
    if (!active) return;
    stopVoice();
    active.step = Math.max(active.step - 1, 0);
    render();
  }
  function finish() {
    if (!active) return;
    const st = store();
    st.completed[active.id] = true;
    st.progress[active.id] = 0;
    save();
    A && A.toast && A.toast('Обучение завершено: ' + (defs[active.id] && defs[active.id].title));
    close(false);
  }
  function skip() {
    if (!active) return;
    const st = store();
    st.progress[active.id] = 0;
    save();
    A && A.toast && A.toast('Обучение пропущено — можно запустить позже из Help');
    close(false);
  }
  function close(showToast) {
    if (!active) return;
    cleanup(false);
    if (showToast !== false && A && A.toast) A.toast('Обучение закрыто');
  }
  function toggleVoice() {
    const st = store();
    st.voice = !st.voice;
    save();
    if (!st.voice) stopVoice();
    render();
  }
  function repeat() { speakStep(); }

  A.helpActions = function (topic) {
    const id = A.esc(topic || 'home');
    return `<div class="context-help btn-row" data-tour="context-help">
      <button class="btn small" data-action="help-topic" data-topic="${id}">? Справка</button>
      <button class="btn small" data-action="tutorial-start" data-tour-id="${id}">▶ Обучение</button>
    </div>`;
  };

  A.register({
    'tutorial-start': (el) => start(el.dataset.tourId || el.dataset.id || 'home', { restart: true }),
    'tour-next': () => next(),
    'tour-prev': () => prev(),
    'tour-finish': () => finish(),
    'tour-skip': () => skip(),
    'tour-close': () => close(),
    'tour-voice': () => toggleVoice(),
    'tour-repeat': () => repeat(),
    'tour-stop': () => stopVoice()
  });

  return {
    definitions: defs,
    start, next, prev, finish, skip, close,
    isActive: () => !!active,
    current: () => active ? { id: active.id, step: active.step } : null,
    store
  };
})();
