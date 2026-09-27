/* Aven — Visual Prototype. Экраны «Утренний обзор» и «Итоги дня».
   Это пошаговый сценарий работы с УЖЕ существующими данными: собственных сущностей нет,
   все изменения идут через Common Actions (AvenActions) и попадают в History/Undo.
   Сводку считает DOM-free слой AvenDaily; здесь только отрисовка и обработчики. */
(function () {
  const A = window.Aven, S = window.AvenState;
  A.pages = A.pages || {};
  const Core = () => window.AvenActions;
  const Daily = () => window.AvenDaily;
  const D = () => Core().dates;

  /* Шаги сценариев. Порядок соответствует docs/FEATURES.md §3.7 и docs/UI_UX.md §3. */
  const FLOWS = {
    morning: {
      id: 'morning', title: 'Утренний обзор', icon: '🌅', route: 'morning',
      sub: 'Короткий старт дня: что сегодня и на что обратить внимание',
      steps: [
        { id: 'summary', label: 'Сводка', title: 'Доброе утро' },
        { id: 'next', label: 'События', title: 'Ближайшее событие и события дня' },
        { id: 'tasks', label: 'Задачи', title: 'Задачи на сегодня' },
        { id: 'attention', label: 'Внимание', title: 'Что требует внимания' },
        { id: 'suggestions', label: 'Предложения', title: 'Предложения Aven' },
        { id: 'finish', label: 'Готово', title: 'Утренний обзор завершён' }
      ]
    },
    evening: {
      id: 'evening', title: 'Итоги дня', icon: '🌙', route: 'evening',
      sub: 'Как прошёл день и что подготовить на завтра',
      steps: [
        { id: 'summary', label: 'Итоги', title: 'Как прошёл день' },
        { id: 'completed', label: 'Выполнено', title: 'Выполнено сегодня' },
        { id: 'remaining', label: 'Осталось', title: 'Осталось и просрочено' },
        { id: 'tomorrow', label: 'Завтра', title: 'Подготовка к завтрашнему дню' },
        { id: 'finish', label: 'Завершение', title: 'День подведён' }
      ]
    }
  };

  /* Текущий шаг — только состояние интерфейса, не данные. */
  const stepIndex = { morning: 0, evening: 0 };
  function clampStep(kind, i) {
    const total = FLOWS[kind].steps.length;
    return Math.max(0, Math.min(total - 1, Number(i) || 0));
  }
  A.dailySetStep = function (kind, step) {
    if (!FLOWS[kind]) return false;
    let index = step;
    if (typeof step === 'string') {
      index = FLOWS[kind].steps.map((x) => x.id).indexOf(step);
      if (index < 0) return false;
    }
    stepIndex[kind] = clampStep(kind, index);
    if ((location.hash || '').replace(/^#\//, '') !== kind) { location.hash = '#/' + kind; return true; }
    A.render();
    return true;
  };
  A.dailyCurrentStep = function (kind) {
    return FLOWS[kind] ? FLOWS[kind].steps[clampStep(kind, stepIndex[kind])].id : '';
  };

  /* ---------------- мелкие рендереры (общие для обоих сценариев) ---------------- */
  function taskRow(t, opts) {
    opts = opts || {};
    const done = Core().tasks.isCompleted(t);
    return `<div class="daily-row${done ? ' done' : ''}">
      <span class="daily-row-ico" aria-hidden="true">${done ? '✔' : opts.warn ? '⚠️' : '☐'}</span>
      <div class="grow">
        <div class="t">${A.esc(t.title)}</div>
        <div class="s">${A.esc(Core().format.taskDueLabel(t))} · приоритет: ${A.esc(Core().tasks.priority(t))} · ${A.esc(t.project || 'без проекта')}</div>
      </div>
      <div class="daily-row-actions">
        <button class="btn small" data-action="toggle-task" data-id="${A.esc(t.id)}">${done ? 'Вернуть' : 'Выполнить'}</button>
        ${opts.reschedule && !done ? `<button class="btn small" data-action="daily-reschedule" data-id="${A.esc(t.id)}" data-date="${A.esc(opts.dateISO || '')}">На завтра</button>` : ''}
        <button class="btn small" data-action="task-edit" data-id="${A.esc(t.id)}">Открыть</button>
      </div>
    </div>`;
  }
  function eventRow(e, dateISO) {
    return `<div class="daily-row">
      <span class="daily-row-ico time">${A.esc(Core().format.eventTime(e))}</span>
      <div class="grow">
        <div class="t">${A.esc(e.title)}</div>
        <div class="s">${A.esc(e.place || 'без места')} · ${A.esc(e.category || 'Личное')}${e.importance && e.importance !== 'обычная' ? ' · ' + A.esc(e.importance) : ''}</div>
      </div>
      <div class="daily-row-actions">
        <button class="btn small" data-action="cal-event" data-id="${A.esc(e.id)}" data-date="${A.esc(dateISO)}">Открыть</button>
      </div>
    </div>`;
  }
  function notifRow(n) {
    return `<a class="daily-row" href="${A.esc(n.href)}">
      <span class="daily-row-ico" aria-hidden="true">${A.esc(n.icon)}</span>
      <div class="grow"><div class="t">${A.esc(n.title)}</div><div class="s">${A.esc(n.sub)}</div></div>
      <span class="pill ${n.severity === 'danger' ? 'danger' : 'warn'}">${n.severity === 'danger' ? 'срочно' : 'внимание'}</span>
    </a>`;
  }
  function empty(text) { return `<div class="empty">${A.esc(text)}</div>`; }
  function pills(list) {
    return `<div class="btn-row daily-pills">${list.map((p) => `<span class="pill ${p.cls || ''}">${A.esc(p.text)}</span>`).join('')}</div>`;
  }
  function loadLabel(load) {
    return ({ free: 'день свободен', light: 'спокойный день', normal: 'обычная загрузка', busy: 'загруженный день' })[load] || 'обычная загрузка';
  }

  /* ---------------- содержимое шагов ---------------- */
  function morningStep(id, data) {
    if (id === 'summary') {
      return `
        <p class="daily-lead">${A.esc(A.greeting())}, ${A.esc((S.s().profile || {}).greeting || 'Алексей')}. Сегодня ${A.esc(data.humanDate)}.</p>
        ${pills([
          { text: 'событий: ' + data.summary.events },
          { text: 'открытых задач: ' + data.summary.tasksOpen },
          { text: 'выполнено: ' + data.summary.tasksDone, cls: 'ok' },
          data.summary.overdue ? { text: 'просрочено: ' + data.summary.overdue, cls: 'warn' } : { text: 'просроченного нет', cls: 'ok' },
          { text: loadLabel(data.summary.load), cls: data.summary.load === 'busy' ? 'warn' : '' }
        ])}
        ${data.empty.all ? empty('На сегодня ничего не запланировано. Это нормальное состояние — обзор можно просто закрыть.') : ''}
        <p class="s daily-note">Это те же задачи и события, что в разделах «Задачи», «Календарь» и «День». Обзор ничего не копирует и не хранит отдельно.</p>`;
    }
    if (id === 'next') {
      const next = data.nextEvent;
      return `
        ${next ? `<div class="daily-next">
          <div class="s">Ближайшее событие</div>
          <div class="t">${A.esc(next.event.title)}</div>
          <div class="s">${A.esc(D().dateLabel(next.dateISO))} · ${A.esc(Core().format.eventTime(next.event))}${next.event.place ? ' · ' + A.esc(next.event.place) : ''}</div>
          <div class="btn-row"><button class="btn small primary" data-action="cal-event" data-id="${A.esc(next.event.id)}" data-date="${A.esc(next.dateISO)}">Открыть событие</button></div>
        </div>` : empty('Ближайших событий нет.')}
        <h3>События сегодня</h3>
        ${data.events.length ? data.events.map((e) => eventRow(e, data.dateISO)).join('') : empty('На сегодня событий нет.')}`;
    }
    if (id === 'tasks') {
      return `
        ${data.tasks.length ? data.tasks.map((t) => taskRow(t, { dateISO: data.dateISO })).join('') : empty('На сегодня задач нет.')}
        ${data.completed.length ? `<h3>Уже выполнено сегодня</h3>${data.completed.map((t) => taskRow(t, { dateISO: data.dateISO })).join('')}` : ''}
        <div class="btn-row"><button class="btn small" data-action="daily-add-today">＋ Задача на сегодня</button><a class="btn small" href="#/tasks">Все задачи →</a></div>
        <p class="s daily-note">Если отметить задачу выполненной здесь, она станет выполненной и в разделе «Задачи», и в «Дне». Действие можно отменить в «Истории».</p>`;
    }
    if (id === 'attention') {
      return `
        <h3>Просроченные задачи</h3>
        ${data.overdue.length ? data.overdue.slice(0, 5).map((t) => taskRow(t, { warn: true, reschedule: true, dateISO: data.dateISO })).join('') : empty('Просроченных задач нет.')}
        <h3>Важные уведомления</h3>
        ${data.notifications.length ? data.notifications.map(notifRow).join('') : empty('Ничего не требует внимания.')}
        <p class="s daily-note">«Требует внимания» — это сроки и факты: просроченные задачи, документы и гарантии с близким сроком. Полный список — в разделе <a href="#/notifications">«Уведомления»</a>.</p>`;
    }
    if (id === 'suggestions') {
      return `
        ${A.suggestionCards ? A.suggestionCards(data.suggestions, { surface: 'morning', dateISO: data.dateISO }, 3) : ''}
        <p class="s daily-note">Предложение — это следующий полезный шаг, а не уведомление. Причина указана всегда; предложение можно отложить или скрыть.</p>`;
    }
    return `
      <p class="daily-lead">Обзор пройден. Дальше удобно работать в разделе «День».</p>
      ${pills([
        { text: 'событий: ' + data.summary.events },
        { text: 'открытых задач: ' + data.summary.tasksOpen },
        data.summary.overdue ? { text: 'просрочено: ' + data.summary.overdue, cls: 'warn' } : { text: 'просроченного нет', cls: 'ok' }
      ])}
      <p class="s daily-note">Ничего обязательного: обзор можно закрыть в любой момент и вернуться к нему позже.</p>`;
  }

  function eveningStep(id, data) {
    if (id === 'summary') {
      return `
        <p class="daily-lead">День ${A.esc(data.humanDate)}. Выполнено ${data.summary.completed} из ${data.summary.completed + data.summary.remaining} задач этого дня.</p>
        ${pills([
          { text: 'выполнено: ' + data.summary.completed, cls: 'ok' },
          { text: 'осталось: ' + data.summary.remaining, cls: data.summary.remaining ? 'warn' : '' },
          data.summary.overdue ? { text: 'просрочено: ' + data.summary.overdue, cls: 'warn' } : { text: 'просроченного нет', cls: 'ok' },
          { text: 'событий прошло: ' + data.summary.events }
        ])}
        <h3>Прошедшие события</h3>
        ${data.events.length ? data.events.map((e) => eventRow(e, data.dateISO)).join('') : empty('Событий в этот день не было.')}
        <p class="s daily-note">Здесь только фактические данные из ваших записей — без оценок и выводов о том, «хорошо» или «плохо» прошёл день.</p>`;
    }
    if (id === 'completed') {
      return `
        ${data.completed.length ? data.completed.map((t) => taskRow(t, { dateISO: data.dateISO })).join('') : empty('Сегодня ни одна задача не отмечена выполненной.')}
        <p class="s daily-note">Ошиблись? Кнопка «Вернуть» снова откроет задачу — изменение видно в «Задачах», «Дне» и «Истории».</p>`;
    }
    if (id === 'remaining') {
      return `
        <h3>Осталось на сегодня</h3>
        ${data.remaining.length ? data.remaining.map((t) => taskRow(t, { reschedule: true, dateISO: data.dateISO })).join('') : empty('Незакрытых задач на сегодня нет.')}
        <h3>Просроченное</h3>
        ${data.overdue.length ? data.overdue.slice(0, 5).map((t) => taskRow(t, { warn: true, reschedule: true, dateISO: data.dateISO })).join('') : empty('Просроченных задач нет.')}
        <h3>Важные уведомления</h3>
        ${data.notifications.length ? data.notifications.map(notifRow).join('') : empty('Ничего не требует внимания.')}
        <p class="s daily-note">«На завтра» меняет дату и срок задачи обычным способом. Новая дата сразу появится в «Задачах», «Дне» и «Календаре», а «История» вернёт прежнюю.</p>`;
    }
    if (id === 'tomorrow') {
      return `
        <p class="daily-lead">Завтра, ${A.esc(data.tomorrow.humanDate)}: ${data.summary.tomorrowEvents} событий и ${data.summary.tomorrowTasks} открытых задач.</p>
        <h3>События завтра</h3>
        ${data.tomorrow.events.length ? data.tomorrow.events.map((e) => eventRow(e, data.tomorrow.dateISO)).join('') : empty('На завтра событий нет.')}
        <h3>Задачи на завтра</h3>
        ${data.tomorrow.tasks.length ? data.tomorrow.tasks.map((t) => taskRow(t, { dateISO: data.tomorrow.dateISO })).join('') : empty('На завтра задач нет.')}
        <div class="btn-row">
          <button class="btn small primary" data-action="daily-add-tomorrow">＋ Задача на завтра</button>
          <button class="btn small" data-action="daily-open-tomorrow">Открыть завтрашний День</button>
        </div>
        ${A.suggestionCards ? A.suggestionCards(data.suggestions, { surface: 'evening', dateISO: data.dateISO }, 3) : ''}`;
    }
    return `
      <p class="daily-lead">День подведён. Завтра: ${data.summary.tomorrowEvents} событий и ${data.summary.tomorrowTasks} задач.</p>
      ${pills([
        { text: 'выполнено сегодня: ' + data.summary.completed, cls: 'ok' },
        { text: 'осталось: ' + data.summary.remaining, cls: data.summary.remaining ? 'warn' : '' },
        { text: 'на завтра задач: ' + data.summary.tomorrowTasks }
      ])}
      <p class="s daily-note">Вернуться к итогам можно в любой момент — ничего не блокируется.</p>`;
  }

  /* ---------------- общая страница сценария ---------------- */
  function flowPage(kind) {
    const flow = FLOWS[kind];
    const data = kind === 'morning' ? Daily().getMorning({}) : Daily().getEvening({});
    const index = clampStep(kind, stepIndex[kind]);
    const step = flow.steps[index];
    const total = flow.steps.length;
    const isLast = index === total - 1;
    const body = kind === 'morning' ? morningStep(step.id, data) : eveningStep(step.id, data);
    const percent = Math.round(((index + 1) / total) * 100);
    const enabled = kind === 'morning' ? Daily().config().morningEnabled : Daily().config().eveningEnabled;

    const html = `
    <div class="page-head">
      <div>
        <h1>${flow.icon} ${A.esc(flow.title)}</h1>
        <div class="sub">${A.esc(data.humanDate)} · ${A.esc(flow.sub)} · данные из «Задач», «Календаря» и «Уведомлений»</div>
      </div>
      <div class="btn-row">${A.helpActions ? A.helpActions('daily', kind) : ''}</div>
    </div>
    ${enabled ? '' : `<div class="card"><div class="tts-priv warn">Этот сценарий выключен в «Настройках → Aven». Сейчас вы открыли его вручную — на «Главной» он не предлагается.</div></div>`}
    ${data.errors.length ? `<div class="card"><div class="tts-priv warn">Часть данных не удалось прочитать (${A.esc(data.errors.map((e) => e.block).join(', '))}). Остальной обзор работает как обычно.</div></div>` : ''}
    <section class="card daily-flow daily-${A.esc(kind)}" data-tour="daily-${A.esc(kind)}" aria-labelledby="daily-step-title">
      <div class="daily-progress" data-tour="daily-progress">
        <ol class="daily-steps">
          ${flow.steps.map((st, i) => `<li class="daily-chip ${i === index ? 'active' : ''} ${i < index ? 'passed' : ''}">
            <button class="daily-chip-btn" data-action="daily-step" data-kind="${A.esc(kind)}" data-index="${i}"
              ${i === index ? 'aria-current="step"' : ''} aria-label="Шаг ${i + 1} из ${total}: ${A.esc(st.label)}">
              <span class="daily-chip-num" aria-hidden="true">${i + 1}</span>${A.esc(st.label)}
            </button></li>`).join('')}
        </ol>
        <div class="daily-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${index + 1}"
             aria-label="Прогресс сценария"><span style="width:${percent}%"></span></div>
        <div class="s daily-step-counter">Шаг ${index + 1} из ${total} · ${A.esc(step.label)}${data.reviewed ? ' · сегодня уже пройден' : ''}</div>
      </div>
      <div class="daily-panel" data-tour="daily-step-${A.esc(step.id)}">
        <h2 id="daily-step-title">${A.esc(step.title)}</h2>
        ${body}
      </div>
      <div class="daily-controls btn-row" data-tour="daily-controls">
        <button class="btn" data-action="daily-step" data-kind="${A.esc(kind)}" data-index="${index - 1}" ${index === 0 ? 'disabled' : ''}>← Назад</button>
        ${isLast
          ? `<button class="btn primary" data-action="daily-finish" data-kind="${A.esc(kind)}">Завершить и открыть День</button>`
          : `<button class="btn primary" data-action="daily-step" data-kind="${A.esc(kind)}" data-index="${index + 1}">Далее →</button>`}
        <button class="btn" data-action="daily-skip" data-kind="${A.esc(kind)}">Пропустить</button>
        <a class="btn" href="#/day">Открыть День</a>
      </div>
    </section>`;
    return { html };
  }

  A.pages.morning = function () { return flowPage('morning'); };
  A.pages.evening = function () { return flowPage('evening'); };

  /* ---------------- действия ----------------
     Никаких morningCompleteTask/eveningCreateTask: выполнение/возврат задачи идёт через
     общий обработчик toggle-task, редактирование — через task-edit, перенос и создание —
     через AvenDaily поверх Common Actions. */
  A.register({
    'daily-open': (el) => { location.hash = '#/' + (el.dataset.kind === 'evening' ? 'evening' : 'morning'); },
    'daily-step': (el) => {
      const kind = el.dataset.kind === 'evening' ? 'evening' : 'morning';
      stepIndex[kind] = clampStep(kind, el.dataset.index);
      A.render();
    },
    'daily-finish': (el) => {
      const kind = el.dataset.kind === 'evening' ? 'evening' : 'morning';
      Daily().markReviewed(kind, D().todayISO());
      stepIndex[kind] = 0;
      A.toast(kind === 'morning' ? 'Утренний обзор пройден · открываем «День»' : 'Итоги дня подведены · открываем «День»');
      location.hash = '#/day';
    },
    'daily-skip': (el) => {
      const kind = el.dataset.kind === 'evening' ? 'evening' : 'morning';
      stepIndex[kind] = 0;
      A.toast('Сценарий пропущен — его можно открыть позже с «Главной»');
      location.hash = '#/home';
    },
    'daily-reschedule': (el) => {
      const res = Daily().rescheduleToTomorrow(el.dataset.id, { fromDateISO: el.dataset.date || D().todayISO() });
      if (!res.ok) { A.toast(res.message || 'Не удалось перенести задачу'); return; }
      A.toast('Задача перенесена на ' + D().humanDate(Core().tasks.date(res.entity)) + ' · можно отменить в «Истории»');
      A.render();
    },
    'daily-add-tomorrow': () => { if (A.openTaskForm) A.openTaskForm(null, D().todayISO(1)); },
    'daily-add-today': () => { if (A.openTaskForm) A.openTaskForm(null, D().todayISO()); },
    'daily-open-tomorrow': () => {
      if (A.setDaySelected) A.setDaySelected(D().todayISO(1));
      location.hash = '#/day';
    }
  });
})();
