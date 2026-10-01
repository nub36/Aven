/* Aven — Visual Prototype. Напоминания и Центр уведомлений (раздел «Уведомления»).

   Что это делает:
   - собирает на одном экране всё, о чём стоит вспомнить: просроченные задачи и задачи на сегодня,
     события дня и события с включённым напоминанием, документы авто с близким сроком, истекающие
     гарантии и напоминания, созданные вручную;
   - показывает непрочитанные, позволяет отметить прочитанным, отложить на потом и скрыть пункт;
   - хранит только реакцию пользователя (прочитано/отложено/скрыто), а сами пункты берёт из уже
     существующих разделов — отдельной копии данных нет (изменил задачу → изменился и пункт).

   Архитектура: движок (build / счётчики / действия и CRUD напоминаний) — БЕЗ DOM, чтобы позже те же
   операции могли вызвать текстовые/голосовые команды. Страница ниже — только представление.
   Честность (ADR-010): это уведомления ВНУТРИ приложения. Доставка при закрытой вкладке, push и email —
   не в этом срезе: им нужен сервер и выбранный email-провайдер (открытые вопросы №16, №17). */
window.AvenNotify = (function () {
  const A = window.Aven || {};
  const S = window.AvenState;
  const s = () => S.s();
  const Core = () => window.AvenActions;
  const D = () => Core().dates;

  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

  /* ---------------- конфигурация из настроек ---------------- */
  const SRC_DEFAULT = { taskDue: true, taskOverdue: true, eventUpcoming: true, eventReminder: true, autoDocs: true, warranty: true, manual: true };
  function cfg() {
    const n = ((s().settings || {}).notify) || {};
    return {
      inapp: n.inapp !== false,
      sources: Object.assign({}, SRC_DEFAULT, n.sources || {}),
      horizon: Math.max(1, Math.min(60, Number(n.horizonDays) || 7))
    };
  }
  function mods() { return ((s().settings || {}).modules) || {}; }

  /* ---------------- состояние пунктов (прочитано/отложено/скрыто) ---------------- */
  function nstate() { const st = s(); if (!st.notifState || typeof st.notifState !== 'object') st.notifState = {}; return st.notifState; }
  /* Read path stays pure: building/resolving notification candidates must not create
     an empty persisted reaction object. Mutation initializes it only in setUserState. */
  function stateOf(key) {
    const st = s();
    return st.notifState && typeof st.notifState === 'object' ? (st.notifState[key] || null) : null;
  }
  function save() { if (S && S.save) S.save(); }
  function log(entry) { return (A && A.logAction) ? A.logAction(entry) : null; }

  const SEV_RANK = { danger: 0, warn: 1, info: 2 };

  /* ---------------- сборка списка уведомлений ----------------
     opts: { includeDismissed, includeSnoozed }. По умолчанию скрытые и отложенные не показываем. */
  function build(opts) {
    opts = opts || {};
    const c = cfg();
    if (!c.inapp) return [];
    const st = s();
    const today = D().todayISO();
    const M = mods();
    const raw = [];

    /* напоминания, созданные вручную */
    if (c.sources.manual) {
      (st.reminders || []).forEach((r) => {
        const date = r.dateISO || '';
        const delta = date ? D().diffDays(date, today) : 999;
        const sev = delta < 0 ? 'warn' : 'info';
        raw.push({
          key: 'manual:' + r.id, source: 'manual', sourceId: r.id, editable: true,
          icon: '🔔', title: r.title, sub: (r.note ? r.note + ' · ' : '') + (delta < 0 ? 'просрочено · ' : '') + 'напоминание · ' + D().dateLabel(date) + (r.time ? ' · ' + Core().format.time(r.time) : ''),
          dateISO: date, time: r.time || '', severity: sev, href: '#/notifications'
        });
      });
    }

    /* просроченные задачи */
    if (c.sources.taskOverdue && M.tasks !== false) {
      Core().tasks.getOverdueTasks(today).items.forEach((t) => {
        const due = Core().tasks.deadline(t) || Core().tasks.date(t);
        raw.push({
          key: 'task-overdue:' + t.id, source: 'taskOverdue', sourceId: t.id,
          icon: '☑️', title: t.title, sub: 'задача просрочена · ' + D().humanDate(due),
          dateISO: due, time: Core().tasks.time(t), severity: 'warn', href: '#/tasks'
        });
      });
    }

    /* задачи со сроком сегодня (кроме просроченных — они выше) */
    if (c.sources.taskDue && M.tasks !== false) {
      Core().tasks.getTasksForDate(today, { includeCompleted: false }).items.forEach((t) => {
        const due = Core().tasks.deadline(t) || Core().tasks.date(t);
        if (due && D().diffDays(due, today) < 0) return; // уже в просроченных
        const tm = Core().tasks.time(t);
        raw.push({
          key: 'task-due:' + t.id, source: 'taskDue', sourceId: t.id,
          icon: '✅', title: t.title, sub: 'задача на сегодня' + (tm ? ' · ' + Core().format.time(tm) : ''),
          dateISO: today, time: tm, severity: 'info', href: '#/tasks'
        });
      });
    }

    /* события сегодня */
    if (c.sources.eventUpcoming && M.calendar !== false) {
      Core().events.getEventsForDate(today).items.forEach((e) => {
        raw.push({
          key: 'event-upcoming:' + e.id, source: 'eventUpcoming', sourceId: e.id,
          icon: '📅', title: e.title, sub: 'событие сегодня · ' + (e.allDay ? 'весь день' : (Core().events.start(e) || 'без времени')) + (e.place ? ' · ' + e.place : ''),
          dateISO: today, time: Core().events.start(e), severity: 'info', href: '#/calendar'
        });
      });
    }

    /* события с включённым напоминанием в ближайшие дни (кроме сегодняшних — они выше) */
    if (c.sources.eventReminder && M.calendar !== false) {
      Core().events.getAgenda({ fromDate: D().addDays(today, 1), days: c.horizon }).items.forEach((it) => {
        const e = it.event;
        if (!e.reminder) return;
        raw.push({
          key: 'event-reminder:' + e.id + ':' + it.date, source: 'eventReminder', sourceId: e.id,
          icon: '⏰', title: e.title, sub: 'напоминание к событию · ' + D().dateLabel(it.date) + (Core().events.start(e) ? ' · ' + Core().events.start(e) : '') + ' · ' + Core().format.reminderLabel(e.reminder),
          dateISO: it.date, time: Core().events.start(e), severity: 'info', href: '#/calendar'
        });
      });
    }

    /* документы авто с близким сроком */
    if (c.sources.autoDocs && M.auto !== false) {
      ((st.car && st.car.docs) || []).forEach((doc) => {
        if (!doc.untilISO) return;
        const days = D().diffDays(doc.untilISO, today);
        if (days <= (Number(doc.remindDays) || 0)) {
          raw.push({
            key: 'autodoc:' + doc.id, source: 'autoDocs', sourceId: doc.id,
            icon: '📄', title: doc.title, sub: days < 0 ? 'срок истёк ' + D().humanDate(doc.untilISO) : 'срок ' + D().humanDate(doc.untilISO),
            dateISO: doc.untilISO, time: '', severity: days < 0 ? 'danger' : 'warn', href: '#/auto'
          });
        }
      });
    }

    /* истекающая/истёкшая гарантия покупок (порог 90 дней, как у A.warrantyStatus) */
    if (c.sources.warranty && M.shopping !== false) {
      (st.purchases || []).forEach((p) => {
        if (!p || p.status === 'sold' || p.status === 'archived' || !p.warrantyISO) return;
        const days = D().diffDays(p.warrantyISO, today);
        if (days >= 90) return;
        raw.push({
          key: 'warranty:' + p.id, source: 'warranty', sourceId: p.id,
          icon: p.emoji || '📦', title: p.name, sub: days < 0 ? 'гарантия истекла ' + D().humanDate(p.warrantyISO) : 'гарантия до ' + D().humanDate(p.warrantyISO),
          dateISO: p.warrantyISO, time: '', severity: days < 0 ? 'danger' : 'warn', href: '#/shopping'
        });
      });
    }

    /* наложить реакцию пользователя и отфильтровать */
    const out = [];
    raw.forEach((it) => {
      const us = stateOf(it.key) || {};
      it.read = !!us.read;
      it.readAt = us.readAt || '';
      it.snoozeUntilISO = us.snoozeUntilISO || '';
      it.dismissed = !!us.dismissed;
      it.snoozed = !!(it.snoozeUntilISO && D().diffDays(it.snoozeUntilISO, today) > 0);
      if (it.dismissed && !opts.includeDismissed) return;
      if (it.snoozed && !opts.includeSnoozed) return;
      out.push(it);
    });
    out.sort((a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]) ||
      String(a.dateISO || '').localeCompare(String(b.dateISO || '')) ||
      String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
    return out;
  }

  function unreadCount() { return build().filter((n) => !n.read).length; }
  function activeCount() { return build().length; }
  function attentionCount() { return build().filter((n) => n.severity !== 'info').length; }

  /* «Требует внимания» — то же, что раньше считала Главная/День вручную: только warn+danger.
     Возвращаем форму { icon, title, sub, href, cls } для существующей разметки. */
  const SRC_LABEL = { taskOverdue: 'задача', taskDue: 'задача', eventUpcoming: 'событие', eventReminder: 'событие', autoDocs: 'авто', warranty: 'покупки', manual: 'напоминание' };
  function attentionItems() {
    return build().filter((n) => n.severity !== 'info').map((n) => ({
      icon: n.icon, title: n.title, sub: n.sub, href: n.href,
      cls: n.severity === 'danger' ? 'danger' : 'warn',
      label: SRC_LABEL[n.source] || 'пункт'
    }));
  }

  /* ---------------- действия над пунктами (без DOM) ---------------- */
  function findMeta(key) { return build({ includeDismissed: true, includeSnoozed: true }).filter((n) => n.key === key)[0] || null; }
  function objOf(meta) { return meta ? (meta.title + ' · ' + meta.sub) : 'уведомление'; }

  function setUserState(key, patch, entry) {
    const ns = nstate();
    const prior = clone(ns[key] || null);
    ns[key] = Object.assign({}, ns[key] || {}, patch);
    save();
    if (entry) {
      entry.undo = { type: 'value', path: 'notifState.' + key, value: prior };
      log(entry);
    }
    return prior;
  }

  function markRead(key) {
    const meta = findMeta(key);
    if (!meta || meta.read) return { ok: false, code: 'NOOP' };
    setUserState(key, { read: true, readAt: A.nowLabel ? A.nowLabel() : '' }, {
      action: 'notify.read', title: 'Уведомление прочитано', object: objOf(meta), objectType: 'notification',
      undoable: true, changes: [{ field: 'Статус', from: 'непрочитано', to: 'прочитано' }]
    });
    return { ok: true };
  }

  function markAllRead() {
    const list = build().filter((n) => !n.read);
    if (!list.length) return { ok: false, code: 'NOOP' };
    const ns = nstate();
    const steps = [];
    const when = A.nowLabel ? A.nowLabel() : '';
    list.forEach((n) => {
      steps.push({ type: 'value', path: 'notifState.' + n.key, value: clone(ns[n.key] || null) });
      ns[n.key] = Object.assign({}, ns[n.key] || {}, { read: true, readAt: when });
    });
    save();
    log({
      action: 'notify.readAll', title: 'Все уведомления прочитаны', object: list.length + ' шт.', objectType: 'notification',
      undoable: true, changes: [{ field: 'Непрочитанных', from: String(list.length), to: '0' }],
      undo: { type: 'batch', steps: steps }
    });
    return { ok: true, count: list.length };
  }

  function snooze(key, days) {
    const meta = findMeta(key);
    if (!meta) return { ok: false, code: 'NOT_FOUND' };
    const until = D().addDays(D().todayISO(), Math.max(1, Number(days) || 1));
    setUserState(key, { snoozeUntilISO: until, read: true }, {
      action: 'notify.snooze', title: 'Уведомление отложено', object: objOf(meta), objectType: 'notification',
      undoable: true, changes: [{ field: 'Отложено до', from: meta.snoozeUntilISO ? D().humanDate(meta.snoozeUntilISO) : '—', to: D().humanDate(until) }]
    });
    return { ok: true, until };
  }

  function unsnooze(key) {
    const meta = findMeta(key);
    if (!meta || !meta.snoozeUntilISO) return { ok: false, code: 'NOOP' };
    setUserState(key, { snoozeUntilISO: '' }, {
      action: 'notify.unsnooze', title: 'Возвращено из отложенных', object: objOf(meta), objectType: 'notification',
      undoable: true, changes: [{ field: 'Отложено до', from: D().humanDate(meta.snoozeUntilISO), to: '—' }]
    });
    return { ok: true };
  }

  function dismiss(key) {
    const meta = findMeta(key);
    if (!meta || meta.dismissed) return { ok: false, code: 'NOOP' };
    setUserState(key, { dismissed: true, read: true }, {
      action: 'notify.dismiss', title: 'Уведомление скрыто', object: objOf(meta), objectType: 'notification',
      undoable: true, changes: [{ field: 'Состояние', from: 'в списке', to: 'скрыто' }]
    });
    return { ok: true };
  }

  function restore(key) {
    const meta = findMeta(key);
    if (!meta || !meta.dismissed) return { ok: false, code: 'NOOP' };
    setUserState(key, { dismissed: false }, {
      action: 'notify.restore', title: 'Уведомление возвращено', object: objOf(meta), objectType: 'notification',
      undoable: true, changes: [{ field: 'Состояние', from: 'скрыто', to: 'в списке' }]
    });
    return { ok: true };
  }

  /* ---------------- CRUD напоминаний, созданных вручную (без DOM) ---------------- */
  function reminderObject(r) { return 'Напоминание «' + (r.title || 'Без названия') + '» · ' + D().humanDate(r.dateISO) + (r.time ? ' · ' + Core().format.time(r.time) : ''); }
  function reminderSnapshot(r) { return { title: r.title || '', note: r.note || '', dateISO: r.dateISO || '', time: r.time || '', link: r.link || '' }; }
  function buildReminderFields(params, existing) {
    const ex = existing ? reminderSnapshot(existing) : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(params || {}, k);
    return {
      title: String(has('title') ? params.title : (ex.title || '')).trim(),
      note: String(has('note') ? params.note : (ex.note || '')).trim(),
      dateISO: D().normalizeDate(has('dateISO') ? params.dateISO : (has('date') ? params.date : ex.dateISO), ''),
      time: normalizeTime(has('time') ? params.time : ex.time),
      link: has('link') ? String(params.link || '').trim() : (ex.link || '')
    };
  }
  function normalizeTime(v) {
    const raw = String(v || '').trim();
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(raw);
    if (!m) return /^\d{2}:\d{2}$/.test(raw) ? raw : '';
    const h = Math.max(0, Math.min(23, Number(m[1]) || 0));
    const mm = Math.max(0, Math.min(59, Number(m[2]) || 0));
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  function reminderChanges(prev, next) {
    const labels = { title: 'Название', note: 'Заметка', dateISO: 'Дата', time: 'Время', link: 'Ссылка' };
    const out = [];
    ['title', 'note', 'dateISO', 'time', 'link'].forEach((k) => {
      let a = prev[k], b = next[k];
      if (String(a || '') === String(b || '')) return;
      if (k === 'dateISO') { a = a ? D().humanDate(a) : '—'; b = b ? D().humanDate(b) : '—'; }
      out.push({ field: labels[k], from: String(a || '—'), to: String(b || '—') });
    });
    return out;
  }
  function ensureReminders() { const st = s(); if (!Array.isArray(st.reminders)) st.reminders = []; return st.reminders; }
  /* Календарный контракт даты один на весь прототип и живёт в слое действий:
     второй проверки здесь нет, напоминания просто пользуются общей. */
  function reminderDateIssue(action, params) {
    const issue = Core().dates.paramsIssue(params, [['dateISO', 'дату напоминания'], ['date', 'дату напоминания']]);
    return issue ? { ok: false, action, code: issue.code, message: issue.message } : null;
  }

  function createReminder(params, opts) {
    opts = opts || {};
    const list = ensureReminders();
    const badDate = reminderDateIssue('reminder.create', params);
    if (badDate) return badDate;
    const f = buildReminderFields(params || {}, null);
    if (!f.title) return { ok: false, action: 'reminder.create', code: 'TITLE_REQUIRED', message: 'Введите название напоминания' };
    if (!f.dateISO) return { ok: false, action: 'reminder.create', code: 'DATE_REQUIRED', message: 'Выберите дату напоминания' };
    const now = D().todayISO();
    const r = Object.assign({ id: S.id('r'), createdISO: now, updatedISO: now }, f);
    list.unshift(r);
    save();
    const entry = log({
      action: 'reminder.create', title: 'Напоминание создано', object: reminderObject(r), objectType: 'reminder',
      source: opts.source || 'ui', undoable: true,
      changes: [{ field: 'Название', from: '—', to: r.title }, { field: 'Дата', from: '—', to: D().humanDate(r.dateISO) + (r.time ? ' · ' + Core().format.time(r.time) : '') }],
      undo: { type: 'remove', list: 'reminders', id: r.id }
    });
    return { ok: true, action: 'reminder.create', entity: r, entry };
  }
  function updateReminder(id, patch, opts) {
    opts = opts || {};
    const list = ensureReminders();
    const r = list.filter((x) => x && x.id === id)[0];
    if (!r) return { ok: false, action: 'reminder.update', code: 'NOT_FOUND', message: 'Напоминание не найдено' };
    const badDate = reminderDateIssue('reminder.update', patch);
    if (badDate) return badDate;
    const prev = reminderSnapshot(r);
    const f = buildReminderFields(patch || {}, r);
    if (!f.title) return { ok: false, action: 'reminder.update', code: 'TITLE_REQUIRED', message: 'Введите название напоминания' };
    if (!f.dateISO) return { ok: false, action: 'reminder.update', code: 'DATE_REQUIRED', message: 'Выберите дату напоминания' };
    Object.assign(r, f, { updatedISO: D().todayISO() });
    save();
    const changes = reminderChanges(prev, reminderSnapshot(r));
    const entry = log({
      action: 'reminder.update', title: 'Напоминание изменено', object: reminderObject(r), objectType: 'reminder',
      source: opts.source || 'ui', undoable: true,
      changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
      undo: { type: 'fields', list: 'reminders', id: r.id, fields: prev }
    });
    return { ok: true, action: 'reminder.update', entity: r, entry };
  }
  function deleteReminder(id, opts) {
    opts = opts || {};
    const list = ensureReminders();
    let i = -1;
    for (let k = 0; k < list.length; k++) if (list[k] && list[k].id === id) { i = k; break; }
    if (i < 0) return { ok: false, action: 'reminder.delete', code: 'NOT_FOUND', message: 'Напоминание не найдено' };
    const item = list[i];
    list.splice(i, 1);
    save();
    const entry = log({
      action: 'reminder.delete', title: 'Напоминание удалено', object: reminderObject(item), objectType: 'reminder',
      source: opts.source || 'ui', undoable: true, danger: true,
      changes: [{ field: 'Состояние', from: 'в списке', to: 'Удалено' }],
      undo: { type: 'restore', list: 'reminders', index: i, item: clone(item) }
    });
    return { ok: true, action: 'reminder.delete', entity: item, entry, index: i };
  }
  function getReminders() { return (s().reminders || []).slice(); }
  function getReminder(id) { return (s().reminders || []).filter((r) => r.id === id)[0] || null; }

  return {
    build, unreadCount, activeCount, attentionCount, attentionItems,
    reaction: (key) => clone(stateOf(key)),
    markRead, markAllRead, snooze, unsnooze, dismiss, restore,
    reminders: { createReminder, updateReminder, deleteReminder, getReminders, getReminder, snapshot: reminderSnapshot },
    sources: () => cfg().sources
  };
})();

/* ============================ Страница «Уведомления» ============================ */
(function () {
  const A = window.Aven, S = window.AvenState;
  const N = window.AvenNotify;
  A.pages = A.pages || {};
  const s = () => S.s();
  /* Экран «Уведомления» работает через общий слой действий: напоминания, прочтение,
     откладывание и скрытие проходят одинаковый путь и одинаково попадают в историю. */
  const C = () => window.AvenActions;
  const D = () => C().dates;

  let filter = 'all';
  const FILTERS = [
    ['all', 'Активные'],
    ['unread', 'Непрочитанные'],
    ['today', 'Сегодня'],
    ['attention', 'Требует внимания'],
    ['snoozed', 'Отложенные'],
    ['dismissed', 'Скрытые']
  ];

  function listFor(f) {
    if (f === 'snoozed') return N.build({ includeSnoozed: true }).filter((n) => n.snoozed);
    if (f === 'dismissed') return N.build({ includeDismissed: true }).filter((n) => n.dismissed);
    let list = N.build();
    if (f === 'unread') list = list.filter((n) => !n.read);
    if (f === 'today') list = list.filter((n) => n.dateISO === D().todayISO());
    if (f === 'attention') list = list.filter((n) => n.severity !== 'info');
    return list;
  }

  const sevPill = { danger: 'danger', warn: 'warn', info: '' };
  const sevLabel = { danger: 'срочно', warn: 'внимание', info: 'к сведению' };

  function itemHtml(n) {
    const isSnoozed = n.snoozed, isDismissed = n.dismissed;
    return `
    <div class="card notif-item sev-${n.severity} ${n.read ? 'is-read' : 'is-unread'}" data-key="${A.esc(n.key)}">
      <div class="notif-ico">
        <span aria-hidden="true">${n.icon}</span>
        ${n.read ? '' : '<span class="notif-dot" title="Непрочитано" aria-label="Непрочитано" role="img"></span>'}
      </div>
      <div class="notif-main">
        <span class="notif-title">${A.esc(n.title)}</span>
        <div class="notif-sub">${A.esc(n.sub)}</div>
      </div>
      <div class="notif-status">
        <span class="pill ${sevPill[n.severity]}">${sevLabel[n.severity]}</span>
        ${isSnoozed ? `<span class="pill">отложено до ${A.esc(D().humanDate(n.snoozeUntilISO))}</span>` : ''}
        ${isDismissed ? '<span class="pill">скрыто</span>' : ''}
      </div>
      <div class="notif-actions">
        <a class="btn small" href="${A.esc(n.href)}" data-action="notif-open" data-key="${A.esc(n.key)}">Открыть</a>
        ${n.editable ? `<button class="btn small" data-action="rem-edit" data-id="${A.esc(n.sourceId)}">Изменить</button>` : ''}
        ${isDismissed
          ? `<button class="btn small" data-action="notif-restore" data-key="${A.esc(n.key)}">Вернуть</button>`
          : `${n.read ? '' : `<button class="btn small" data-action="notif-read" data-key="${A.esc(n.key)}">Прочитано</button>`}
             ${isSnoozed
               ? `<button class="btn small" data-action="notif-unsnooze" data-key="${A.esc(n.key)}">Не откладывать</button>`
               : `<button class="btn small" data-action="notif-snooze" data-key="${A.esc(n.key)}" data-days="1">Отложить</button>`}
             <button class="btn small danger" data-action="notif-dismiss" data-key="${A.esc(n.key)}">Скрыть</button>`}
        ${n.editable && !isDismissed ? `<button class="btn small danger" data-action="rem-del" data-id="${A.esc(n.sourceId)}">Удалить</button>` : ''}
      </div>
    </div>`;
  }

  A.pages.notifications = function () {
    const st = s();
    const inapp = ((st.settings || {}).notify || {}).inapp !== false;
    const unread = N.unreadCount();
    const total = N.activeCount();
    const attention = N.attentionCount();
    const list = listFor(filter);

    const emptyText = {
      all: 'Сейчас ничего не требует внимания. Новые пункты появляются из задач, событий, документов авто, гарантий и ваших напоминаний.',
      unread: 'Непрочитанных уведомлений нет.',
      today: 'На сегодня уведомлений нет.',
      attention: 'Ничего срочного: просроченных задач, истекающих документов и гарантий нет.',
      snoozed: 'Отложенных уведомлений нет.',
      dismissed: 'Скрытых уведомлений нет.'
    };

    const html = `
    <div class="page-head" data-tour="notif-head">
      <div>
        <h1>Уведомления</h1>
        <div class="sub">Одно место для всего, о чём стоит вспомнить · собирается из ваших разделов · демо-данные</div>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-action="rem-add" data-tour="notif-add">＋ Напоминание</button>
        ${A.helpActions ? A.helpActions('notifications') : ''}
      </div>
    </div>

    ${!inapp ? `<div class="card"><div class="tts-priv warn">Уведомления в приложении выключены в «Настройки → Уведомления». Включите их, чтобы видеть напоминания здесь.</div></div>` : ''}

    <div class="grid cols-3" data-tour="notif-stats">
      <div class="card stat"><div class="v">${unread}</div><div class="l">непрочитанных</div></div>
      <div class="card stat"><div class="v">${total}</div><div class="l">активных пунктов</div></div>
      <div class="card stat"><div class="v">${attention}</div><div class="l">требуют внимания</div></div>
    </div>

    <div class="tabs" id="notif-tabs" data-tour="notif-tabs">
      ${FILTERS.map(([id, label]) => `<button class="tab ${filter === id ? 'active' : ''}" data-tab="${id}">${A.esc(label)}</button>`).join('')}
    </div>

    <div class="btn-row" style="margin:0 0 12px">
      <button class="btn" data-action="notif-readall" ${unread ? '' : 'disabled'}>Отметить все прочитанными</button>
      <button class="btn" data-action="set-open-cat" data-id="notify">Настроить источники</button>
    </div>

    <div class="notif-list" data-tour="notif-list">
      ${list.length ? list.map(itemHtml).join('') : `<div class="card"><div class="empty">${A.esc(emptyText[filter] || 'Пусто')}</div></div>`}
    </div>

    <div class="card hist-note" data-tour="notif-honest">
      <div class="set-h">Как это работает — честно</div>
      <ul class="set-sub" style="margin:0 0 0 18px">
        <li>Пункты собираются из ваших разделов: изменили или выполнили задачу — пункт исчезнет сам после обновления.</li>
        <li>«Прочитано», «Отложить» и «Скрыть» можно отменить в разделе <a href="#/history">«История»</a> — как и другие действия.</li>
        <li>Какие источники показывать, выбирается в «Настройки → Уведомления».</li>
        <li>Это уведомления внутри приложения. Пока вкладка закрыта, звонков, писем и push‑сообщений не будет — для этого нужен сервер и почтовый сервис (они появятся позже).</li>
      </ul>
    </div>`;

    return {
      html,
      mount(main) {
        A.bindTabs(main.querySelector('#notif-tabs'), (v) => { filter = v; A.render(); });
      }
    };
  };

  /* ---------------- форма напоминания ---------------- */
  function reminderForm(existing) {
    const ex = existing ? N.reminders.snapshot(existing) : { title: '', note: '', dateISO: D().todayISO(), time: '', link: '' };
    A.openModal({
      title: existing ? 'Изменить напоминание' : 'Новое напоминание',
      wide: true,
      body: `
        <div class="field"><label>Название</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="О чём напомнить?"></div>
        <div class="field"><label>Заметка (необязательно)</label><textarea name="note" style="min-height:56px">${A.esc(ex.note || '')}</textarea></div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="dateISO" value="${A.esc(ex.dateISO || '')}"></div>
          <div class="field"><label>Время (необязательно)</label><input type="time" name="time" value="${A.esc(ex.time || '')}"></div>
        </div>
        <div class="s" style="color:var(--muted);font-size:.8rem">Напоминание появится в этом разделе и в блоке «Требует внимания», когда подойдёт дата. Оповещения при закрытой вкладке в прототипе не приходят.</div>`,
      onSubmit: (v) => {
        const payload = { title: v.title, note: v.note, dateISO: v.dateISO, time: v.time };
        /* Общий слой действий: те же правила и та же запись в истории для любого входа. */
        const res = existing ? C().reminders.update(existing.id, payload) : C().reminders.create(payload);
        if (!res.ok) { A.toast(res.message || 'Не удалось сохранить напоминание'); return; }
        A.closeModal(); A.render();
        A.toast(existing ? 'Напоминание сохранено · запись в истории' : 'Напоминание создано · запись в истории, можно отменить');
      }
    });
  }

  A.register({
    'notif-open': (el) => {
      const key = el.dataset.key;
      if (key) N.markRead(key);
      const href = el.getAttribute('href') || '';
      if (href && href !== '#/notifications') location.hash = href;
      else A.render();
    },
    'notif-read': (el) => { C().reminders.markRead(el.dataset.key); A.render(); },
    'notif-readall': () => { const r = C().reminders.markAllRead(); A.render(); A.toast(r.ok ? ('Отмечено прочитанными: ' + r.count) : 'Непрочитанных нет'); },
    'notif-snooze': (el) => {
      const key = el.dataset.key;
      A.openModal({
        title: 'Отложить уведомление', submitText: null, cancelText: 'Закрыть',
        body: `<p class="s">На сколько отложить? Пункт вернётся в список в выбранный день.</p>
          <div class="btn-row">
            <button class="btn" data-action="notif-snooze-do" data-key="${A.esc(key)}" data-days="1">На завтра</button>
            <button class="btn" data-action="notif-snooze-do" data-key="${A.esc(key)}" data-days="3">На 3 дня</button>
            <button class="btn" data-action="notif-snooze-do" data-key="${A.esc(key)}" data-days="7">На неделю</button>
          </div>`
      });
    },
    'notif-snooze-do': (el) => {
      const r = C().reminders.snooze(el.dataset.key, Number(el.dataset.days) || 1);
      A.closeModal(); A.render();
      if (r.ok) A.toast('Отложено до ' + D().humanDate(r.until) + ' · можно отменить в истории');
    },
    'notif-unsnooze': (el) => { C().reminders.unsnooze(el.dataset.key); A.render(); A.toast('Возвращено в список'); },
    'notif-dismiss': (el) => { C().reminders.dismiss(el.dataset.key); A.render(); A.toast('Скрыто · можно вернуть или отменить в истории'); },
    'notif-restore': (el) => { C().reminders.restore(el.dataset.key); A.render(); A.toast('Возвращено в список'); },
    'rem-add': () => reminderForm(),
    'rem-edit': (el) => { const r = C().reminders.get(el.dataset.id); if (r.ok) reminderForm(r.entity); else A.toast(r.message); },
    'rem-del': (el) => {
      const got = C().reminders.get(el.dataset.id);
      if (!got.ok) { A.toast(got.message); return; }
      A.confirmModal('Удалить напоминание «' + (got.entity.title || '') + '»? Это можно отменить в истории.', () => {
        A.closeModal();
        const res = C().reminders.delete(el.dataset.id);
        A.render();
        A.toast(res.ok ? 'Напоминание удалено · можно отменить' : (res.message || 'Не удалось удалить'));
      });
    }
  });
})();
