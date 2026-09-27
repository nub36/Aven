/* Aven — Visual Prototype. Daily Summary Engine (утренний обзор и вечернее планирование).
   Тонкий DOM-free слой НАД уже существующими данными: задачи, события, уведомления, предложения.
   Здесь НЕТ собственных сущностей (никаких morningTasks/eveningTasks) и НЕТ прямых мутаций:
   любое изменение данных делегируется Common Action Layer (AvenActions), поэтому History/Undo,
   «Задачи», «День» и «Календарь» остаются единым источником правды.
   Даты берутся из общего demo clock (AvenActions.dates), поэтому результат воспроизводим. */
window.AvenDaily = (function () {
  const S = window.AvenState;
  const state = () => S.s();
  const Core = () => window.AvenActions;
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

  const KINDS = { morning: 1, evening: 1 };
  const STORE_KEY = 'dailyState';

  /* ---------------- настройки и границы периодов ----------------
     Границы «утро/день/вечер/ночь» уже есть в настройках (Настройки → Aven, settings.behavior).
     Никаких фоновых будильников тут нет и быть не может: это веб-прототип. */
  function behavior() {
    const b = ((state().settings || {}).behavior) || {};
    return {
      morning: b.morning || '08:00',
      day: b.day || '12:00',
      evening: b.evening || '18:30',
      night: b.night || '23:00'
    };
  }
  function config() {
    const cfg = ((state().settings || {}).daily) || {};
    return {
      morningEnabled: cfg.morning !== false,
      eveningEnabled: cfg.evening !== false,
      boundaries: behavior()
    };
  }
  function toMinutes(hhmm, fallback) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return fallback;
    return Math.max(0, Math.min(23, Number(m[1]))) * 60 + Math.max(0, Math.min(59, Number(m[2])));
  }
  /* Единственное место во всём Morning/Evening, где читается настенное время суток.
     Даты (сегодня/завтра) всегда берутся из общего demo clock. */
  function nowMinutes() {
    try { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
    catch (e) { return 0; }
  }
  function period(opts) {
    const b = behavior();
    const mins = (opts && opts.minutes != null) ? Number(opts.minutes) : nowMinutes();
    const morning = toMinutes(b.morning, 480), day = toMinutes(b.day, 720);
    const evening = toMinutes(b.evening, 1110), night = toMinutes(b.night, 1380);
    if (mins >= night || mins < morning) return 'night';
    if (mins < day) return 'morning';
    if (mins < evening) return 'day';
    return 'evening';
  }
  /* Какой сценарий уместно предложить на «Главной». Пусто — значит не навязываем ничего. */
  function suggestedFlow(opts) {
    const cfg = config();
    const p = period(opts);
    if ((p === 'morning' || p === 'night') && cfg.morningEnabled) return 'morning';
    if (p === 'evening' && cfg.eveningEnabled) return 'evening';
    if (cfg.morningEnabled && p === 'day') return '';
    return '';
  }

  /* ---------------- минимальный маркер прохождения (не второй источник данных) ---------------- */
  function store(create) {
    const st = state();
    if (!st[STORE_KEY] || typeof st[STORE_KEY] !== 'object') {
      if (!create) return {};
      st[STORE_KEY] = {};
    }
    return st[STORE_KEY];
  }
  function isReviewed(kind, dateISO) {
    if (!KINDS[kind]) return false;
    const date = Core().dates.normalizeDate(dateISO, Core().dates.todayISO());
    return (store()[kind] || {}).dateISO === date;
  }
  function markReviewed(kind, dateISO) {
    if (!KINDS[kind]) return { ok: false, code: 'UNKNOWN_FLOW' };
    const date = Core().dates.normalizeDate(dateISO, Core().dates.todayISO());
    const map = store(true);
    map[kind] = { dateISO: date };
    if (S && S.save) S.save();
    return { ok: true, kind, dateISO: date };
  }
  function clearReviewed(kind) {
    const map = store();
    if (map && map[kind]) { delete map[kind]; if (S && S.save) S.save(); }
    return { ok: true };
  }
  function progress() { return clone(store()); }

  /* ---------------- безопасное чтение блоков ----------------
     Повреждённый или недоступный блок не должен ломать весь обзор (раздел «Error resilience»). */
  function safe(errors, name, fn, fallback) {
    try {
      const v = fn();
      return v == null ? fallback : v;
    } catch (e) {
      errors.push({ block: name, message: String((e && e.message) || e) });
      return fallback;
    }
  }
  function modules() { return ((state().settings || {}).modules) || {}; }
  function notifyItems(errors) {
    return safe(errors, 'notifications', () => (window.AvenNotify ? window.AvenNotify.build() : []), []);
  }
  function attentionFrom(items) { return (items || []).filter((n) => n && n.severity !== 'info'); }
  function suggestionsFor(errors, surface, dateISO, limit) {
    const list = safe(errors, 'suggestions', () => (window.AvenSuggestions
      ? window.AvenSuggestions.getSuggestions({ surface, dateISO })
      : []), []);
    return list.slice(0, limit || 3);
  }
  function eventSortKey(e) {
    if (!e) return '23:59';
    if (e.allDay) return '00:00';
    return Core().events.start(e) || '23:59';
  }

  /* ---------------- УТРО: «что у меня сегодня и на что обратить внимание?» ---------------- */
  function getMorning(context) {
    context = context || {};
    const D = Core().dates;
    const errors = [];
    const dateISO = D.normalizeDate(context.dateISO, D.todayISO());
    const mods = modules();

    const events = mods.calendar === false ? [] : safe(errors, 'events', () => Core().events.getEventsForDate(dateISO).items, []);
    const tasks = mods.tasks === false ? [] : safe(errors, 'tasks', () => Core().tasks.getTasksForDate(dateISO, { includeCompleted: false }).items, []);
    const completed = mods.tasks === false ? [] : safe(errors, 'tasks-done', () => Core().tasks.getTasksForDate(dateISO, { completed: true }).items, []);
    const overdue = mods.tasks === false ? [] : safe(errors, 'overdue', () => Core().tasks.getOverdueTasks(dateISO).items, []);
    const nextResult = mods.calendar === false ? null : safe(errors, 'next-event', () => {
      const r = Core().events.getNextEvent({ fromDate: dateISO, days: 45 });
      return r.ok ? { event: r.item.event, dateISO: r.date, isToday: r.date === dateISO } : null;
    }, null);
    const notifications = notifyItems(errors);
    const attention = attentionFrom(notifications);
    const suggestions = suggestionsFor(errors, 'morning', dateISO, context.suggestionLimit || 3);

    const load = events.length + tasks.length;
    const summary = {
      events: events.length,
      tasksOpen: tasks.length,
      tasksDone: completed.length,
      overdue: overdue.length,
      attention: attention.length,
      unread: safe(errors, 'unread', () => (window.AvenNotify ? window.AvenNotify.unreadCount() : 0), 0),
      suggestions: suggestions.length,
      load: load === 0 ? 'free' : load <= 2 ? 'light' : load <= 4 ? 'normal' : 'busy'
    };
    return {
      kind: 'morning',
      dateISO,
      tomorrowISO: D.addDays(dateISO, 1),
      dateLabel: D.dateLabel(dateISO),
      humanDate: D.humanDate(dateISO),
      summary,
      nextEvent: nextResult,
      events,
      tasks,
      completed,
      overdue,
      notifications: attention.slice(0, 5),
      attention,
      suggestions,
      empty: {
        events: !events.length,
        tasks: !tasks.length,
        overdue: !overdue.length,
        attention: !attention.length,
        suggestions: !suggestions.length,
        all: !events.length && !tasks.length && !overdue.length && !attention.length && !suggestions.length
      },
      reviewed: isReviewed('morning', dateISO),
      errors
    };
  }

  /* ---------------- ВЕЧЕР: «как прошёл день и что подготовить на завтра?» ---------------- */
  function getEvening(context) {
    context = context || {};
    const D = Core().dates;
    const errors = [];
    const dateISO = D.normalizeDate(context.dateISO, D.todayISO());
    const tomorrowISO = D.addDays(dateISO, 1);
    const mods = modules();

    const completed = mods.tasks === false ? [] : safe(errors, 'completed', () => Core().tasks.getTasksForDate(dateISO, { completed: true }).items, []);
    const remaining = mods.tasks === false ? [] : safe(errors, 'remaining', () => Core().tasks.getTasksForDate(dateISO, { includeCompleted: false }).items, []);
    const overdue = mods.tasks === false ? [] : safe(errors, 'overdue', () => Core().tasks.getOverdueTasks(dateISO).items, []);
    const events = mods.calendar === false ? [] : safe(errors, 'events', () => Core().events.getEventsForDate(dateISO).items, []);
    const tomorrowEvents = mods.calendar === false ? [] : safe(errors, 'tomorrow-events', () => Core().events.getEventsForDate(tomorrowISO).items, []);
    const tomorrowTasks = mods.tasks === false ? [] : safe(errors, 'tomorrow-tasks', () => Core().tasks.getTasksForDate(tomorrowISO, { includeCompleted: false }).items, []);
    const notifications = notifyItems(errors);
    const attention = attentionFrom(notifications);
    const suggestions = suggestionsFor(errors, 'evening', dateISO, context.suggestionLimit || 3);

    const sortedEvents = events.slice().sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)));
    const summary = {
      completed: completed.length,
      remaining: remaining.length,
      overdue: overdue.length,
      events: events.length,
      attention: attention.length,
      suggestions: suggestions.length,
      tomorrowEvents: tomorrowEvents.length,
      tomorrowTasks: tomorrowTasks.length,
      done: completed.length + remaining.length ? Math.round((completed.length / (completed.length + remaining.length)) * 100) : 0
    };
    return {
      kind: 'evening',
      dateISO,
      tomorrowISO,
      dateLabel: D.dateLabel(dateISO),
      humanDate: D.humanDate(dateISO),
      summary,
      completed,
      remaining,
      overdue,
      events: sortedEvents,
      notifications: attention.slice(0, 5),
      attention,
      suggestions,
      tomorrow: {
        dateISO: tomorrowISO,
        humanDate: D.humanDate(tomorrowISO),
        events: tomorrowEvents,
        tasks: tomorrowTasks,
        empty: !tomorrowEvents.length && !tomorrowTasks.length
      },
      empty: {
        completed: !completed.length,
        remaining: !remaining.length,
        overdue: !overdue.length,
        events: !events.length,
        attention: !attention.length,
        suggestions: !suggestions.length,
        tomorrow: !tomorrowEvents.length && !tomorrowTasks.length,
        all: !completed.length && !remaining.length && !overdue.length && !events.length && !attention.length && !suggestions.length
      },
      reviewed: isReviewed('evening', dateISO),
      errors
    };
  }

  /* ---------------- планирование завтрашнего дня ----------------
     Никакого прямого task.date = ...: только существующий updateTask/createTask,
     поэтому History/Undo возвращает исходную дату, а «Задачи»/«День» видят изменение сразу. */
  function rescheduleToTomorrow(taskId, opts) {
    opts = opts || {};
    const D = Core().dates;
    const base = D.normalizeDate(opts.fromDateISO, D.todayISO());
    const target = D.normalizeDate(opts.toDateISO, D.addDays(base, 1));
    const found = Core().tasks.getTask(taskId);
    if (!found.ok) return { ok: false, code: 'TASK_NOT_FOUND', message: 'Задача не найдена' };
    const task = found.entity;
    if (Core().tasks.isCompleted(task)) return { ok: false, code: 'TASK_COMPLETED', message: 'Задача уже выполнена' };
    return Core().tasks.updateTask(task.id, { date: target, deadline: target }, {
      source: opts.source || 'daily',
      title: 'Задача перенесена на ' + D.humanDate(target)
    });
  }
  function planTomorrowTask(params, opts) {
    opts = opts || {};
    const D = Core().dates;
    const base = D.normalizeDate(opts.fromDateISO, D.todayISO());
    const target = D.normalizeDate((params || {}).date, D.addDays(base, 1));
    return Core().tasks.createTask(Object.assign({}, params || {}, { date: target, deadline: target }),
      { source: opts.source || 'daily' });
  }

  /* ---------------- подготовка к Assistant ----------------
     Готовый текстовый ответ по уже посчитанной сводке. Новый parser/NLP здесь НЕ появляется:
     это только структурированный доступ к данным для будущих команд. */
  function words(n, one, few, many) {
    const x = Math.abs(Number(n) || 0) % 100, y = x % 10;
    return n + ' ' + (x > 10 && x < 20 ? many : y === 1 ? one : y > 1 && y < 5 ? few : many);
  }
  function summaryText(kind, context) {
    if (kind === 'evening') {
      const e = getEvening(context);
      return [
        'Итоги дня ' + e.humanDate + '.',
        'Выполнено: ' + words(e.summary.completed, 'задача', 'задачи', 'задач') + '.',
        'Осталось открытыми: ' + words(e.summary.remaining, 'задача', 'задачи', 'задач') + '.',
        e.summary.overdue ? 'Просрочено: ' + words(e.summary.overdue, 'задача', 'задачи', 'задач') + '.' : 'Просроченных задач нет.',
        'На завтра: ' + words(e.summary.tomorrowEvents, 'событие', 'события', 'событий') + ' и ' +
          words(e.summary.tomorrowTasks, 'задача', 'задачи', 'задач') + '.'
      ].join(' ');
    }
    const m = getMorning(context);
    return [
      'Сегодня ' + m.humanDate + '.',
      'Событий: ' + m.summary.events + ', открытых задач: ' + m.summary.tasksOpen + '.',
      m.summary.overdue ? 'Просрочено: ' + words(m.summary.overdue, 'задача', 'задачи', 'задач') + '.' : 'Просроченных задач нет.',
      m.nextEvent ? 'Ближайшее событие: ' + m.nextEvent.event.title + ' — ' + Core().dates.dateLabel(m.nextEvent.dateISO) +
        (Core().events.start(m.nextEvent.event) ? ', ' + Core().events.start(m.nextEvent.event) : '') + '.' : 'Ближайших событий нет.'
    ].join(' ');
  }

  return {
    config, period, suggestedFlow,
    getMorning, getEvening, summaryText,
    rescheduleToTomorrow, planTomorrowTask,
    isReviewed, markReviewed, clearReviewed, progress
  };
})();
