/* Aven — deterministic local Suggestions for the visual prototype.
   The engine is DOM-free: it only reads shared state, derives explainable suggestions and
   delegates entity mutations to the existing Common Action layer. No AI, network or clock drift. */
window.AvenSuggestions = (function () {
  const S = window.AvenState;
  const state = () => S.s();
  const Core = () => window.AvenActions;
  const clone = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
  const PRIORITY = { critical: 400, high: 300, medium: 200, low: 100 };

  function config() {
    const cfg = ((state().settings || {}).suggestions) || {};
    return { enabled: cfg.enabled !== false };
  }
  function store(create) {
    const st = state();
    if (!st.suggestionState || typeof st.suggestionState !== 'object') {
      if (!create) return {};
      st.suggestionState = {};
    }
    return st.suggestionState;
  }
  function dateOf(context) {
    return (context && context.dateISO) || Core().dates.todayISO();
  }
  function activeTask(t) { return t && !Core().tasks.isCompleted(t) && !t.archived; }
  function taskDue(t) { return Core().tasks.deadline(t) || Core().tasks.date(t); }
  function words(n, one, few, many) {
    const x = Math.abs(Number(n) || 0) % 100, y = x % 10;
    return n + ' ' + (x > 10 && x < 20 ? many : y === 1 ? one : y > 1 && y < 5 ? few : many);
  }
  function suggestion(input) {
    return Object.assign({
      type: 'next-action', priority: 'medium', derivedDate: Core().dates.todayISO(),
      context: {}, source: { kind: 'local', entityType: 'other', ids: [] }, actions: []
    }, input);
  }

  function taskRules(out, context, date) {
    const st = state(), mods = (st.settings || {}).modules || {};
    if (mods.tasks === false) return;
    const tasks = (st.tasks || []).filter(activeTask);
    const overdue = tasks.filter((t) => taskDue(t) && Core().dates.diffDays(taskDue(t), date) < 0);
    if (overdue.length) {
      const oldest = overdue.slice().sort((a, b) => String(taskDue(a)).localeCompare(String(taskDue(b))))[0];
      const days = Math.abs(Core().dates.diffDays(taskDue(oldest), date));
      out.push(suggestion({
        id: 'tasks:overdue:' + date, type: 'task-review', priority: 'critical', derivedDate: date,
        title: 'Разобрать просроченные задачи',
        message: 'Открыть задачи и решить, что выполнить, перенести или отменить?',
        reason: words(overdue.length, 'задача просрочена', 'задачи просрочены', 'задач просрочены') + '. Самая ранняя — на ' + words(days, 'день', 'дня', 'дней') + '.',
        context: { surface: context.surface || 'home', dateISO: date, count: overdue.length },
        source: { kind: 'tasks', entityType: 'task', ids: overdue.map((t) => t.id) },
        actions: [{ id: 'open', label: 'Открыть задачи', href: '#/tasks' }]
      }));
    }
    const due = tasks.filter((t) => taskDue(t) === date);
    if (due.length) out.push(suggestion({
      id: 'tasks:due:' + date, type: 'day-plan', priority: due.some((t) => Core().tasks.priority(t) === 'высокий') ? 'high' : 'medium', derivedDate: date,
      title: 'Запланировать задачи на ' + Core().dates.dateLabel(date),
      message: 'Посмотреть задачи этого дня и выбрать порядок выполнения?',
      reason: 'На эту дату открыто ' + words(due.length, 'задача', 'задачи', 'задач') + (due.some((t) => Core().tasks.priority(t) === 'высокий') ? ', среди них есть задача с высоким приоритетом.' : '.'),
      context: { surface: context.surface || 'home', dateISO: date, count: due.length },
      source: { kind: 'tasks', entityType: 'task', ids: due.map((t) => t.id) },
      actions: [{ id: 'open-day', label: 'Открыть день', href: '#/day' }]
    }));
  }

  function calendarRules(out, context, date) {
    const st = state(), mods = (st.settings || {}).modules || {};
    if (mods.calendar === false) return;
    const events = Core().events.getEventsForDate(date).items;
    const dayTasks = mods.tasks === false ? [] : Core().tasks.getTasksForDate(date, { includeCompleted: false }).items;
    if (events.length + dayTasks.length >= 3) out.push(suggestion({
      id: 'day:busy:' + date, type: 'day-review', priority: 'high', derivedDate: date,
      title: 'Проверить загруженный день',
      message: 'Открыть план дня и проверить, хватает ли времени между делами?',
      reason: 'На ' + Core().dates.dateLabel(date) + ' запланировано ' + words(events.length, 'событие', 'события', 'событий') + ' и ' + words(dayTasks.length, 'открытая задача', 'открытые задачи', 'открытых задач') + '.',
      context: { surface: context.surface || 'home', dateISO: date, eventCount: events.length, taskCount: dayTasks.length },
      source: { kind: 'day', entityType: 'mixed', ids: events.map((e) => e.id).concat(dayTasks.map((t) => t.id)) },
      actions: [{ id: 'open-day', label: 'Открыть день', href: '#/day' }]
    }));

    /* Preparation is offered only for a future event and disappears once the Common Task Action
       creates the exact preparation task. This is deterministic automatic resolution. */
    if (Core().dates.diffDays(date, Core().dates.todayISO()) > 0 && events.length) {
      const event = events[0];
      const title = 'Подготовиться: ' + event.title;
      const already = (st.tasks || []).some((t) => t && !t.archived && String(t.title || '').toLowerCase() === title.toLowerCase());
      if (!already) out.push(suggestion({
        id: 'event:prepare:' + event.id + ':' + date, type: 'event-preparation', priority: event.importance === 'важное' ? 'high' : 'medium', derivedDate: Core().dates.todayISO(),
        title: 'Подготовиться к событию',
        message: 'Создать задачу «' + title + '» на сегодня?',
        reason: Core().dates.dateLabel(date).replace(/^./, (c) => c.toUpperCase()) + ' запланировано событие «' + event.title + '»' + (Core().events.start(event) ? ' в ' + Core().events.start(event) : '') + '.',
        context: { surface: context.surface || 'home', dateISO: date, eventId: event.id },
        source: { kind: 'calendar', entityType: 'event', ids: [event.id] },
        actions: [{ id: 'create-prep-task', label: 'Создать задачу' }, { id: 'open', label: 'Открыть событие', href: '#/calendar' }]
      }));
    }
  }

  function moduleRules(out, context) {
    if (context.surface === 'day') return; // Day remains about its selected date, not unrelated global cards.
    const st = state(), mods = (st.settings || {}).modules || {}, today = Core().dates.todayISO();
    if (mods.auto !== false && st.car) {
      /* Пробег до следующего обслуживания считает раздел «Авто» в общем слое действий —
         подсказка и карточка авто не могут показать разные числа. */
      const autoStats = Core().auto.stats();
      if (autoStats.lastService) {
        const left = autoStats.nextServiceLeft;
        if (left <= 2500) out.push(suggestion({
          id: 'auto:service:' + (st.car.id || 'primary'), type: 'car-service', priority: left <= 0 ? 'critical' : 'high',
          title: left <= 0 ? 'Проверить обслуживание автомобиля' : 'Запланировать обслуживание автомобиля',
          message: 'Открыть историю обслуживания и проверить следующую запись?',
          reason: left <= 0 ? 'По текущему пробегу интервал обслуживания превышен на ' + Math.abs(left).toLocaleString('ru-RU') + ' км.' : 'До следующего обслуживания по указанному интервалу осталось ' + left.toLocaleString('ru-RU') + ' км.',
          context: { surface: context.surface || 'home', dateISO: today, kmLeft: left },
          source: { kind: 'auto', entityType: 'car', ids: [st.car.id || 'primary'] },
          actions: [{ id: 'open', label: 'Открыть авто', href: '#/auto' }]
        }));
      }
    }
    if (mods.shopping !== false) {
      /* «Гарантия скоро закончится» — тот же признак, что на карточках покупок. */
      const expiring = Core().shopping.getPurchases({ status: 'owned', warranty: 'warn' }).items
        .filter((p) => Core().dates.diffDays(Core().shopping.warrantyISO(p), today) >= 0);
      if (expiring.length) out.push(suggestion({
        id: 'shopping:warranty:' + expiring.map((p) => p.id).sort().join('-'), type: 'warranty-review', priority: 'medium',
        title: 'Проверить покупки с истекающей гарантией',
        message: 'Открыть покупки и проверить документы или необходимость сервиса?',
        reason: expiring.length === 1 ? 'У одной покупки гарантия заканчивается в ближайшие 90 дней.' : 'У ' + expiring.length + ' покупок гарантия заканчивается в ближайшие 90 дней.',
        context: { surface: context.surface || 'home', dateISO: today, count: expiring.length },
        source: { kind: 'shopping', entityType: 'purchase', ids: expiring.map((p) => p.id) },
        actions: [{ id: 'open', label: 'Открыть покупки', href: '#/shopping' }]
      }));
    }
  }

  function getSuggestions(context) {
    context = context || {};
    if (!config().enabled) return [];
    const date = dateOf(context), raw = [];
    taskRules(raw, context, date);
    calendarRules(raw, context, date);
    moduleRules(raw, context);
    const seen = {}, today = Core().dates.todayISO(), meta = store();
    return raw.filter((item) => {
      if (!item || !item.id || seen[item.id]) return false;
      seen[item.id] = true;
      const m = meta[item.id] || {};
      if (m.dismissed) return false;
      if (m.snoozeUntilISO && Core().dates.diffDays(m.snoozeUntilISO, today) > 0) return false;
      item.userState = clone(m);
      item.priorityScore = PRIORITY[item.priority] || 0;
      return true;
    }).sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
  }

  function rawById(id, context) {
    const prior = config().enabled;
    if (!prior) return null;
    const meta = store(), saved = meta[id];
    delete meta[id];
    const item = getSuggestions(context).filter((x) => x.id === id)[0] || null;
    if (saved !== undefined) meta[id] = saved;
    return item;
  }
  function recordState(id, patch, event) {
    const map = store(true), prior = clone(map[id] || null);
    map[id] = Object.assign({}, map[id] || {}, patch);
    S.save();
    const A = window.Aven;
    const entry = A && A.logAction ? A.logAction(Object.assign({
      object: 'Предложение «' + ((event && event.item && event.item.title) || id) + '»', objectType: 'suggestion', source: 'ui', undoable: true,
      undo: { type: 'value', path: 'suggestionState.' + id, value: prior }
    }, event || {})) : null;
    return { ok: true, entry, state: clone(map[id]) };
  }
  function dismiss(id, context) {
    const item = rawById(id, context);
    if (!item) return { ok: false, code: 'NOT_FOUND' };
    return recordState(id, { dismissed: true, snoozeUntilISO: '' }, { item, action: 'suggestion.dismiss', title: 'Предложение скрыто', changes: [{ field: 'Состояние', from: 'показано', to: 'скрыто' }] });
  }
  function restore(id) {
    const m = store()[id];
    if (!m || !m.dismissed) return { ok: false, code: 'NOOP' };
    return recordState(id, { dismissed: false }, { action: 'suggestion.restore', title: 'Предложение возвращено', changes: [{ field: 'Состояние', from: 'скрыто', to: 'показано' }] });
  }
  function snooze(id, days, context) {
    const item = rawById(id, context);
    if (!item) return { ok: false, code: 'NOT_FOUND' };
    const until = Core().dates.addDays(Core().dates.todayISO(), Math.max(1, Number(days) || 1));
    const result = recordState(id, { snoozeUntilISO: until }, { item, action: 'suggestion.snooze', title: 'Предложение отложено', changes: [{ field: 'Отложено до', from: '—', to: Core().dates.humanDate(until) }] });
    result.until = until;
    return result;
  }
  function unsnooze(id) {
    const m = store()[id];
    if (!m || !m.snoozeUntilISO) return { ok: false, code: 'NOOP' };
    return recordState(id, { snoozeUntilISO: '' }, { action: 'suggestion.unsnooze', title: 'Предложение возвращено из отложенных', changes: [{ field: 'Отложено до', from: Core().dates.humanDate(m.snoozeUntilISO), to: '—' }] });
  }
  function perform(id, actionId, context) {
    const item = rawById(id, context);
    if (!item) return { ok: false, code: 'NOT_FOUND' };
    if (actionId !== 'create-prep-task' || item.type !== 'event-preparation') return { ok: false, code: 'NAVIGATION_ACTION' };
    const eventResult = Core().events.getEvent(item.context.eventId);
    if (!eventResult.ok) return { ok: false, code: 'SOURCE_NOT_FOUND' };
    const event = eventResult.entity;
    return Core().tasks.createTask({
      title: 'Подготовиться: ' + event.title,
      description: 'Подготовка к событию «' + event.title + '» ' + Core().dates.humanDate(item.context.dateISO) + '.',
      date: Core().dates.todayISO(), deadline: Core().dates.todayISO(), priority: event.importance === 'важное' ? 'высокий' : 'средний',
      project: 'Личное', tags: ['подготовка', 'календарь']
    }, { source: 'suggestion' });
  }

  return { getSuggestions, dismiss, restore, snooze, unsnooze, perform, config, state: () => clone(store()) };
})();
