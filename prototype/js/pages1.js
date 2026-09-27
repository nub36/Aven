/* Aven — Visual Prototype. Страницы: Главная, День, Календарь, Задачи, Заметки. Не production. */
(function () {
  const A = window.Aven, S = window.AvenState;
  A.pages = A.pages || {};
  const s = () => S.s();

  /* ---------- даты, задачи и события: UI читает общий Common Action Layer ---------- */
  const Core = () => window.AvenActions;
  function todayISO(offset) { return Core().dates.todayISO(offset); }
  function localISO(d) { return Core().dates.localISO(d); }
  function parseISO(iso) { return Core().dates.parseISO(iso); }
  function diffDays(aISO, bISO) { return Core().dates.diffDays(aISO, bISO); }
  function addDays(iso, offset) { return Core().dates.addDays(iso, offset); }
  function humanDate(iso) { return Core().dates.humanDate(iso); }
  function dateLabel(iso) { return Core().dates.dateLabel(iso); }
  function eventTime(e) { return Core().format.eventTime(e); }
  function eventStart(e) { return Core().format.eventStart(e); }
  function eventEnd(e) { return Core().format.eventEnd(e); }
  function eventsForDate(iso) { return Core().events.getEventsForDate(iso).items; }
  function nextEvents(limit) {
    return Core().events.getAgenda({ fromDate: todayISO(), days: 45, limit: limit || 5 }).items;
  }
  function repeatLabel(e) { return Core().format.repeatLabel(e); }
  function reminderLabel(r) { return Core().format.reminderLabel(r); }
  function importanceClass(v) {
    if (v === 'критическое') return 'danger';
    if (v === 'важное') return 'warn';
    return '';
  }
  function taskDueISO(t) { return Core().tasks.deadline(t) || Core().tasks.date(t); }
  function taskDateISO(t) { return Core().tasks.date(t) || Core().tasks.deadline(t); }
  function taskTime(t) { return Core().tasks.time(t); }
  function taskDone(t) { return Core().tasks.isCompleted(t); }
  function taskPriority(t) { return Core().tasks.priority(t); }
  function taskDesc(t) { return Core().tasks.description(t); }
  function taskTags(t) { return Core().tasks.tags(t); }
  function taskBucket(t) {
    if (t && taskDone(t)) return 'done';
    const d = taskDueISO(t);
    if (!d) return 'soon';
    const delta = diffDays(d, todayISO());
    if (delta < 0) return 'overdue';
    if (delta === 0) return 'today';
    return 'soon';
  }
  function taskDueLabel(t) { return Core().format.taskDueLabel(t); }
  function taskStatusLabel(t) { return taskDone(t) ? 'Выполнена' : 'Открыта'; }

  /* ---------- агрегаты Главной и Дня из текущих данных (без хардкода, MVP_SCOPE §10.1) ---------- */
  function daysToISO(iso) { return diffDays(iso, todayISO()); }
  function homeFinance(st) {
    const today = todayISO();
    const pref = today.slice(0, 7);
    const exp = (st.ops || []).filter((o) => o.type === 'expense');
    const todaySum = exp.filter((o) => o.dateISO === today).reduce((acc, o) => A.sumMoney(acc, o.amount || 0), 0);
    const month = exp.filter((o) => String(o.dateISO || '').slice(0, 7) === pref);
    const largest = month.slice().sort((a, b) => A.minor(b.amount || 0) - A.minor(a.amount || 0))[0] || null;
    return { todaySum, monthCount: month.length, largest };
  }
  function carServiceLeft(car) {
    const last = (car.service || []).slice().sort((a, b) => (Number(b.km) || 0) - (Number(a.km) || 0))[0];
    if (!last) return null;
    return (Number(last.km) || 0) + (Number(car.serviceIntervalKm) || 10000) - (Number(car.mileage) || 0);
  }
  function carDocsAttention(car) {
    return (car.docs || []).filter((d) => {
      if (!d.untilISO) return false;
      return daysToISO(d.untilISO) <= (Number(d.remindDays) || 0);
    }).length;
  }
  /* тот же порог, что у A.warrantyStatus: < 0 — истекла, < 90 — скоро закончится */
  function warrantyKind(p) {
    if (!p || p.status === 'sold' || p.status === 'archived') return 'skip';
    if (!p.warrantyISO) return 'none';
    const d = daysToISO(p.warrantyISO);
    if (d < 0) return 'expired';
    if (d < 90) return 'warn';
    return 'ok';
  }
  function homeWarranties(st) {
    const items = (st.purchases || []).filter((p) => ['skip', 'none'].indexOf(warrantyKind(p)) < 0);
    return {
      active: items.filter((p) => warrantyKind(p) === 'ok').length,
      ending: items.filter((p) => ['warn', 'expired'].indexOf(warrantyKind(p)) >= 0)
    };
  }
  function homeNotes(st) {
    const active = (st.notes || []).filter((n) => !n.archived);
    const pinned = active.filter((n) => n.pinned);
    const recent = active.slice().sort((a, b) => String(b.updatedISO || '').localeCompare(String(a.updatedISO || '')));
    const seen = {};
    return pinned.concat(recent).filter((n) => (seen[n.id] ? false : (seen[n.id] = true))).slice(0, 4);
  }
  /* «Требует внимания» в разделе «День»: расчёт по текущим данным, без фоновых проверок.
     Пункты берутся только из включённых модулей (Настройки → Модули). */
  function attentionItems(st) {
    const items = [];
    const MOD = (st.settings || {}).modules || {};
    Core().tasks.getOverdueTasks(todayISO()).items.forEach((t) => {
      const d = taskDueISO(t);
      if (MOD.tasks === false) return;
      items.push({ icon: '☑️', title: t.title, sub: 'задача просрочена · ' + humanDate(d), href: '#/tasks', cls: 'warn' });
    });
    (MOD.auto === false ? [] : (st.car.docs || [])).forEach((doc) => {
      if (!doc.untilISO) return;
      const days = daysToISO(doc.untilISO);
      if (days <= (Number(doc.remindDays) || 0)) {
        items.push({
          icon: '📄', title: doc.title,
          sub: days < 0 ? 'срок истёк ' + humanDate(doc.untilISO) : 'срок ' + humanDate(doc.untilISO),
          href: '#/auto', cls: days < 0 ? 'danger' : 'warn'
        });
      }
    });
    (MOD.shopping === false ? [] : (st.purchases || [])).forEach((p) => {
      const kind = warrantyKind(p);
      if (kind === 'warn' || kind === 'expired') {
        items.push({
          icon: p.emoji || '📦', title: p.name,
          sub: kind === 'expired' ? 'гарантия истекла ' + humanDate(p.warrantyISO) : 'гарантия до ' + humanDate(p.warrantyISO),
          href: '#/shopping', cls: kind === 'expired' ? 'danger' : 'warn'
        });
      }
    });
    return items;
  }

  /* ================= ГЛАВНАЯ ================= */
  A.pages.home = function () {
    const st = s();
    const cards = Object.assign({ today: true, tasks: true, expenses: true, car: true, shopping: true, notes: true, quick: true, actions: true }, st.settings.homeCards || {});
    /* карточка видна только если включён источник: раздел-модуль (Настройки → Модули) */
    const MOD = st.settings.modules || {};
    if (MOD.calendar === false) cards.today = false;
    if (MOD.tasks === false) cards.tasks = false;
    if (MOD.finance === false) cards.expenses = false;
    if (MOD.auto === false) cards.car = false;
    if (MOD.shopping === false) cards.shopping = false;
    if (MOD.notes === false) cards.notes = false;
    const todayTasks = Core().tasks.getTasksForDate(todayISO(), { includeCompleted: false }).items;
    const todayEvents = eventsForDate(todayISO());
    const upcoming = nextEvents(1)[0];
    const latestHistory = (st.history || []).slice(0, 5);
    const fin = homeFinance(st);
    const taskStats = {
      open: Core().tasks.getTasks({ status: 'active' }).count,
      done: Core().tasks.getTasks({ status: 'completed' }).count,
      overdue: Core().tasks.getOverdueTasks(todayISO()).count
    };
    const svcLeft = carServiceLeft(st.car);
    const docsAttn = carDocsAttention(st.car);
    const warr = homeWarranties(st);
    const topNotes = homeNotes(st);
    const charOn = !!(window.AvenChar && !window.AvenChar.isOff() && window.AvenChar.current().id === 'female');
    const last = A._lastReply ? A.esc(A._lastReply) : 'Напишите команду — или нажмите на Aven справа.';
    const html = `
    <div class="hero ${charOn ? '' : 'no-char'}" data-state="idle">
      <div class="hero-top">
        <h1>${A.esc(A.greeting())}, ${A.esc(st.profile.greeting)}</h1>
        <div class="hero-sign">Aven · ваш помощник · ${A.esc(cap(A.todayFull()))} · демо-данные</div>
        <div class="hero-state-row"><span class="aven-state" role="status" aria-live="polite" data-state="idle">● Готова</span></div>
      </div>

      <div class="hero-interact">
        <div class="hero-ask">Чем помочь?</div>
        <div class="cmdbar">
          <input type="text" id="home-cmd" placeholder="Что сделать? Например: «Запиши 850 рублей на продукты» (демо)">
          <button class="icon-btn mic" data-action="home-mic" title="Голосовой ввод (экспериментально)">🎤</button>
          <button class="btn primary go" data-action="home-cmd-send" title="Отправить">→</button>
        </div>
        <div class="hero-sugg" id="hero-sugg" hidden>
          <button class="btn small" data-action="home-sugg" data-q="Что сегодня?">Что сегодня?</button>
          <button class="btn small" data-action="home-sugg" data-q="Заправился">⚡ Заправился</button>
          <button class="btn small" data-action="home-sugg" data-q="Важное событие">⚡ Важное событие</button>
          <button class="btn small" data-action="home-sugg" data-q="Мои расходы">Мои расходы</button>
        </div>
        <div class="hero-last" id="hero-last">${last}</div>
        <div class="hero-next">
          <span aria-hidden="true">📅</span>
          ${upcoming ? `<span>Следующее: <b>${A.esc(upcoming.event.title)}</b> · ${A.esc(eventTime(upcoming.event))}</span>
          <span class="pill accent">${A.esc(dateLabel(upcoming.date))}</span>` : '<span>Ближайших событий нет</span><span class="pill">пусто</span>'}
        </div>
        <div class="hero-links"><button class="btn small" data-action="go-assistant">Открыть Assistant →</button></div>
      </div>

      ${charOn ? `
      <div class="hero-char" id="hero-char" data-action="hero-char-click" role="button" tabindex="0"
           aria-label="Aven — нажмите, чтобы перейти к полю команды" title="Aven: клик — фокус на поле команды">
        <span class="hc-glow" aria-hidden="true"></span>
        <span class="hc-ring r1" aria-hidden="true"></span>
        <span class="hc-ring r2" aria-hidden="true"></span>
        <img class="hc-img" src="assets/character/web/female-aven-transparent.png"
             alt="Aven — Female Aven, виртуальный помощник: голова, шея и плечи">
        <span class="hc-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      </div>` : ''}
    </div>

    <div class="home-grid">
      ${cards.today ? `
      <div class="card">
        <div class="head"><h3>Сегодня</h3><a href="#/day" class="btn small">День →</a></div>
        ${todayEvents.length ? todayEvents.slice(0, 4).map((e) => `
          <div class="row-item"><span class="time">${A.esc(eventTime(e))}</span><div class="grow"><div class="t">${A.esc(e.title)}</div><div class="s">${A.esc(e.place || 'без места')}${repeatLabel(e) ? ' · ' + A.esc(repeatLabel(e)) : ''}</div></div>${e.importance !== 'обычная' ? `<span class="pill ${importanceClass(e.importance)}">${A.esc(e.importance)}</span>` : ''}</div>`).join('') : '<div class="empty">На сегодня событий нет · добавьте в Календаре</div>'}
        ${todayTasks.length ? `<div style="margin-top:10px"><span class="pill ok">задач на сегодня: ${todayTasks.length}</span></div>` : ''}
      </div>` : ''}

      ${cards.tasks ? `
      <div class="card">
        <div class="head"><h3>Задачи</h3><a href="#/tasks" class="btn small">Все →</a></div>
        ${todayTasks.length ? todayTasks.map((t) => `
          <label class="check-row" data-action="toggle-task" data-id="${A.esc(t.id)}">
            <input type="checkbox" ${taskDone(t) ? 'checked' : ''}>
            <span class="label">${A.esc(t.title)}</span>
          </label>`).join('') : '<div class="empty">Активных задач на сегодня нет</div>'}
        <div class="btn-row" style="margin-top:10px">
          <span class="pill">открытых: ${taskStats.open}</span>
          <span class="pill ok">выполнено: ${taskStats.done}</span>
          ${taskStats.overdue ? `<span class="pill warn">просрочено: ${taskStats.overdue}</span>` : ''}
        </div>
      </div>` : ''}

      ${cards.expenses ? `
      <div class="card">
        <div class="head"><h3>Расходы</h3><a href="#/finance" class="btn small">Финансы →</a></div>
        <div class="row-item"><div class="grow"><div class="t">Сегодня</div></div><b class="num">${A.money(fin.todaySum)}</b></div>
        <div class="row-item"><div class="grow"><div class="t">Месяц</div></div><b class="num">${A.money(st.finMonth.expense)}</b></div>
        ${fin.largest ? `<div class="row-item"><div class="grow"><div class="s">Крупнейшая в месяце: ${A.esc(fin.largest.title)}</div></div><span class="num s">${A.money(fin.largest.amount)}</span></div>` : '<div class="empty">Операций в этом месяце нет</div>'}
      </div>` : ''}

      ${cards.car ? `
      <div class="card">
        <div class="head"><h3>Автомобиль</h3><a href="#/auto" class="btn small">Авто →</a></div>
        <div class="row-item"><div class="grow"><div class="t">${A.esc(st.car.model)}</div><div class="s">${st.car.year} · основной</div></div></div>
        <div class="row-item"><div class="grow"><div class="s">Пробег</div></div><b class="num">${st.car.mileage.toLocaleString('ru-RU')} км</b></div>
        <div class="row-item"><div class="grow"><div class="s">До следующего ТО</div></div><span class="pill ${svcLeft != null && svcLeft < 0 ? 'danger' : svcLeft != null && svcLeft < 1000 ? 'warn' : ''}">${svcLeft == null ? '—' : Math.max(0, svcLeft).toLocaleString('ru-RU') + ' км'}</span></div>
        <div class="row-item"><div class="grow"><div class="s">Документы</div></div>${docsAttn ? `<span class="pill warn">к вниманию: ${docsAttn}</span>` : '<span class="pill ok">без предупреждений</span>'}</div>
      </div>` : ''}

      ${cards.shopping ? `
      <div class="card">
        <div class="head"><h3>Гарантии</h3><a href="#/shopping" class="btn small">Покупки →</a></div>
        <div class="row-item"><div class="grow"><div class="t">Действуют</div></div><b class="num">${warr.active}</b></div>
        ${warr.ending.length ? warr.ending.slice(0, 3).map((p) => `
          <div class="row-item"><div class="grow"><div class="t">${A.esc(p.emoji || '📦')} ${A.esc(p.name)}</div><div class="s">гарантия до ${A.esc(humanDate(p.warrantyISO))}</div></div><span class="pill ${warrantyKind(p) === 'expired' ? 'danger' : 'warn'}">${daysToISO(p.warrantyISO) < 0 ? 'истекла' : Math.max(0, daysToISO(p.warrantyISO)) + ' дн.'}</span></div>`).join('') : '<div class="empty">Ничего не истекает в ближайшие 90 дней</div>'}
      </div>` : ''}

      ${cards.notes ? `
      <div class="card">
        <div class="head"><h3>Заметки</h3><a href="#/notes" class="btn small">Все →</a></div>
        ${topNotes.length ? topNotes.map((n) => `
          <div class="row-item"><div class="grow"><div class="t">${n.pinned ? '📌 ' : ''}${A.esc(n.title)}</div><div class="s">${A.esc(n.folder)}${(n.tags || []).length ? ' · ' + A.esc(n.tags.join(', ')) : ''}</div></div><span class="s" style="color:var(--muted)">${A.esc(dateLabel(n.updatedISO))}</span></div>`).join('') : '<div class="empty">Заметок пока нет</div>'}
      </div>` : ''}

      ${cards.actions ? `
      <div class="card">
        <div class="head"><h3>Последние действия</h3><a href="#/history" class="btn small">История →</a></div>
        ${latestHistory.length ? latestHistory.map((h) => `
          <div class="row-item"><div class="grow"><div class="t">${A.esc(h.title)}</div><div class="s">${A.esc(h.object || h.action)} · ${A.esc(h.when || '')}</div></div>${h.undoable && !h.undone ? '<span class="pill">Undo</span>' : ''}</div>`).join('') : '<div class="empty">История появится после первого изменения данных</div>'}
      </div>` : ''}

      ${cards.quick ? `
      <div class="card ${cards.today ? '' : 'span-2'}">
        <div class="head"><h3>Быстрые действия</h3></div>
        <div class="btn-row">
          <button class="btn" data-action="quick-expense">＋ Расход</button>
          <button class="btn" data-action="quick-task">＋ Задача</button>
          <button class="btn" data-action="quick-event">＋ Событие</button>
          <button class="btn" data-action="quick-note">＋ Заметка</button>
          <button class="btn" data-action="quick-fuel">＋ Заправка</button>
        </div>
        <div class="s" style="color:var(--muted);font-size:.82rem;margin-top:10px">Действия открывают демо-формы; данные сохраняются локально.</div>
      </div>` : ''}
    </div>`;
    return { html, mount };
  };

  /* монтаж hero: клавиатура персонажа + suggestions-поведение */
  function mount(main) {
    const char = main.querySelector('#hero-char');
    if (char) {
      char.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.Aven.actions['hero-char-click'](); }
      });
    }
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ================= ДЕНЬ ================= */
  let dayTab = 'today';
  let daySelected = todayISO();
  function setDayTab(tab) {
    dayTab = tab;
    if (tab === 'yesterday') daySelected = todayISO(-1);
    else if (tab === 'tomorrow') daySelected = todayISO(1);
    else if (tab === 'today') daySelected = todayISO();
    else dayTab = 'custom';
  }
  function selectedDayISO() { return daySelected || todayISO(); }
  function taskForDay(t, iso) {
    if (!t || t.archived) return false;
    return taskDateISO(t) === iso || taskDueISO(t) === iso;
  }
  A.pages.day = function () {
    const st = s();
    const iso = selectedDayISO();
    const evs = eventsForDate(iso);
    const dayTasks = Core().tasks.getTasksForDate(iso, { includeCompleted: true }).items;
    const activeTasks = dayTasks.filter((t) => !taskDone(t));
    const completedTasks = dayTasks.filter((t) => taskDone(t));
    const overdue = Core().tasks.getOverdueTasks(iso).items;
    const next = Core().events.getNextEvent({ fromDate: iso, days: 45 });
    const doneActions = (st.history || []).filter((h) => /\.(create|update|delete|complete|reopen)$/.test(h.action || '')).slice(0, 4);
    const dayNotes = (((st.settings || {}).modules || {}).notes === false ? [] : (st.notes || []))
      .filter((n) => !n.archived && n.updatedISO === iso).slice(0, 4);
    const attention = attentionItems(st);
    const timeline = [];
    evs.forEach((e) => timeline.push({ id: e.id, date: iso, t: eventTime(e), n: e.title, type: e.importance === 'важное' ? 'important' : 'event', sub: (e.place || e.category || repeatLabel(e) || 'событие') + (reminderLabel(e.reminder) !== 'нет' ? ' · напоминание: ' + reminderLabel(e.reminder) : '') }));
    activeTasks.forEach((t) => timeline.push({ id: t.id, t: taskTime(t) || taskDueLabel(t), n: t.title, type: 'task', sub: 'задача · ' + (t.project || 'без проекта') + (taskTags(t).length ? ' · #' + taskTags(t).join(' #') : '') }));
    timeline.sort((a, b) => {
      const aa = /^\d{2}:\d{2}$/.test(a.t) ? a.t : (a.t === 'весь день' ? '00:00' : '23:59');
      const bb = /^\d{2}:\d{2}$/.test(b.t) ? b.t : (b.t === 'весь день' ? '00:00' : '23:59');
      return aa.localeCompare(bb);
    });
    const summary = [
      evs.length + ' событий',
      activeTasks.length + ' активных задач',
      completedTasks.length + ' выполнено',
      overdue.length + ' просрочено к этой дате'
    ];
    const html = `
    <div class="page-head">
      <div>
        <h1>День</h1>
        <div class="sub">${A.esc(dateLabel(iso))} · единые задачи/события из Common Actions · демо</div>
      </div>
      <div class="btn-row">
        <button class="btn" data-action="day-add-event">＋ Событие на дату</button>
        <button class="btn" data-action="day-add-task">＋ Задача на дату</button>
      </div>
    </div>
    <div class="tabs" id="day-tabs">
      <button class="tab ${dayTab === 'yesterday' ? 'active' : ''}" data-tab="yesterday">Вчера</button>
      <button class="tab ${dayTab === 'today' ? 'active' : ''}" data-tab="today">Сегодня</button>
      <button class="tab ${dayTab === 'tomorrow' ? 'active' : ''}" data-tab="tomorrow">Завтра</button>
      <button class="tab ${dayTab === 'custom' ? 'active' : ''}" data-tab="custom">Выбранная дата</button>
    </div>
    <div class="card day-tools">
      <div class="field-row">
        <label class="field"><span>Дата дня</span><input type="date" data-action="day-date" value="${A.esc(iso)}" aria-label="Выбрать дату раздела День"></label>
        <div class="field"><span>Краткая сводка</span><div class="btn-row">${summary.map((x, i) => `<span class="pill ${i === 3 && overdue.length ? 'warn' : i === 2 ? 'ok' : ''}">${A.esc(x)}</span>`).join('')}</div></div>
      </div>
      <div class="s" style="color:var(--muted);font-size:.82rem">Напоминания здесь — только metadata. Web-прототип не обещает фоновые уведомления, если браузер закрыт.</div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <div class="head"><h3>Timeline</h3>${next.ok ? `<span class="pill accent">следующее: ${A.esc(next.item.event.title)} · ${A.esc(dateLabel(next.item.date))}</span>` : '<span class="pill">нет ближайших событий</span>'}</div>
        ${timeline.length ? `<div class="timeline">${timeline.map((i) => `
          <div class="tl-item ${i.type}">
            <div style="display:flex;gap:12px;align-items:flex-start"><span class="time">${A.esc(i.t)}</span><div class="grow"><b>${A.esc(i.n)}</b>
            <div class="s" style="color:var(--muted);font-size:.8rem">${A.esc(i.sub)}</div></div>
            ${i.type === 'task' ? `<button class="btn small" data-action="task-edit" data-id="${A.esc(i.id)}">Открыть</button>` : `<button class="btn small" data-action="cal-event" data-id="${A.esc(i.id)}" data-date="${A.esc(i.date)}">Открыть</button>`}
            </div>
          </div>`).join('')}</div>` : '<div class="empty">На этот день ничего не запланировано. Создайте событие или задачу.</div>'}
        <h3 style="margin-top:18px">Заметки этого дня</h3>
        ${dayNotes.length ? dayNotes.map((n) => `
          <div class="row-item"><span class="time">📝</span><div class="grow"><div class="t">${n.pinned ? '📌 ' : ''}${A.esc(n.title)}</div><div class="s">${A.esc(n.folder)}</div></div></div>`).join('') : '<div class="empty">В этот день заметок не меняли</div>'}
      </div>
      <div class="card">
        <h3>Задачи на дату</h3>
        ${dayTasks.length ? dayTasks.map((t) => `
          <div class="check-row ${taskDone(t) ? 'done' : ''}" data-action="toggle-task" data-id="${A.esc(t.id)}">
            <input type="checkbox" ${taskDone(t) ? 'checked' : ''} aria-label="${taskDone(t) ? 'Вернуть задачу' : 'Выполнить задачу'}: ${A.esc(t.title)}">
            <span class="label"><b>${A.esc(t.title)}</b><div class="s">${A.esc(taskStatusLabel(t))} · приоритет: ${A.esc(taskPriority(t))} · ${A.esc(t.project || 'без проекта')} · ${A.esc(taskDueLabel(t))}${taskTags(t).length ? ' · #' + A.esc(taskTags(t).join(' #')) : ''}</div></span>
            <span class="task-actions"><button class="btn small" data-action="task-edit" data-id="${A.esc(t.id)}">Редактировать</button></span>
          </div>`).join('') : '<div class="empty">Нет задач для этого дня</div>'}
        <h3 style="margin-top:18px">Просроченные к этой дате</h3>
        ${overdue.length ? overdue.slice(0, 5).map((t) => `
          <div class="row-item"><span class="time">⚠️</span><div class="grow"><div class="t">${A.esc(t.title)}</div><div class="s">срок: ${A.esc(taskDueLabel(t))}</div></div><button class="btn small" data-action="task-edit" data-id="${A.esc(t.id)}">Открыть</button></div>`).join('') : '<div class="empty">Просроченных задач нет</div>'}
        <h3 style="margin-top:18px">Выполненное и изменения</h3>
        ${completedTasks.slice(0, 4).map((t) => `
          <div class="row-item"><span class="time">✔</span><div class="grow"><div class="t" style="color:var(--muted)">${A.esc(t.title)}</div></div><button class="btn small" data-action="toggle-task" data-id="${A.esc(t.id)}">Вернуть</button></div>`).join('') || ''}
        ${doneActions.map((h) => `
          <div class="row-item"><span class="time">•</span><div class="grow"><div class="t">${A.esc(h.title)}</div><div class="s">${A.esc(h.object || h.action)} · ${A.esc(h.when)}</div></div></div>`).join('')}
        ${!completedTasks.length && !doneActions.length ? '<div class="empty">Пока ничего</div>' : ''}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="head"><h3>Требует внимания</h3><span class="pill">расчёт по текущим данным</span></div>
      ${attention.length ? `<div class="grid cols-3">${attention.map((i) => `
        <div class="row-item"><span class="time">${A.esc(i.icon)}</span><div class="grow"><div class="t">${A.esc(i.title)}</div><div class="s">${A.esc(i.sub)}</div></div><span class="pill ${i.cls}">${i.href === '#/tasks' ? 'задачи' : i.href === '#/auto' ? 'авто' : 'покупки'}</span></div>`).join('')}</div>` : '<div class="empty">Просроченных задач, истекающих документов и гарантий нет</div>'}
      <div class="s" style="color:var(--muted);font-size:.82rem;margin-top:10px">Напоминания и уведомления — Stage 1.1 (MVP_SCOPE §4.2): здесь только расчёт по текущим данным разделов, без фоновых проверок.</div>
    </div>`;
    return { html, mount: (root) => { A.bindTabs(root.querySelector('#day-tabs'), (v) => { setDayTab(v); A.render(); }); } };
  };

  /* ================= КАЛЕНДАРЬ ================= */
  let calOffset = 0, calView = 'month', calSelected = todayISO();
  function monthBounds(offset) {
    const now = new Date();
    const view = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12, 0, 0, 0);
    return { y: view.getFullYear(), m: view.getMonth(), view };
  }
  function eventChip(e, iso) {
    const rep = repeatLabel(e);
    return `<div class="cal-ev ${importanceClass(e.importance)}" data-action="cal-event" data-id="${A.esc(e.id)}" data-date="${A.esc(iso)}" title="${A.esc(e.title)}">
      ${A.esc(eventTime(e))} ${rep ? '↻ ' : ''}${A.esc(e.title)}
    </div>`;
  }
  function monthView() {
    const mb = monthBounds(calOffset);
    const y = mb.y, m = mb.m;
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Пн=0
    const daysIn = new Date(y, m + 1, 0).getDate();
    const daysPrev = new Date(y, m, 0).getDate();
    let cells = [];
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ d: daysPrev - i, other: true, iso: localISO(new Date(y, m - 1, daysPrev - i, 12)) });
    for (let d = 1; d <= daysIn; d++) cells.push({ d, other: false, iso: localISO(new Date(y, m, d, 12)) });
    let n = 1;
    while (cells.length % 7 !== 0) { cells.push({ d: n, other: true, next: true, iso: localISO(new Date(y, m + 1, n, 12)) }); n++; }
    const today = todayISO();
    return `<div class="cal-grid">
      ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells.map((c) => {
        const evs = eventsForDate(c.iso);
        const isToday = c.iso === today;
        return `<div class="cal-cell ${c.other ? 'other' : ''} ${isToday ? 'today' : ''} ${calSelected === c.iso ? 'selected' : ''}" data-action="cal-day" data-date="${A.esc(c.iso)}" tabindex="0" aria-label="${A.esc(humanDate(c.iso))}, событий: ${evs.length}">
          <div class="cal-day-num">${c.d}</div>
          ${evs.slice(0, 3).map((e) => eventChip(e, c.iso)).join('')}
          ${evs.length > 3 ? `<div class="cal-more">+${evs.length - 3}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }
  function weekView() {
    const base = parseISO(calSelected || todayISO());
    const dow = (base.getDay() + 6) % 7;
    const monday = new Date(base); monday.setDate(base.getDate() - dow);
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); days.push(localISO(d)); }
    return `<div class="week-grid">
      ${days.map((iso) => {
        const evs = eventsForDate(iso);
        return `<div class="week-col ${iso === todayISO() ? 'today' : ''}">
          <button class="week-head" data-action="cal-day" data-date="${A.esc(iso)}">${A.esc(new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).format(parseISO(iso)))}</button>
          ${evs.length ? evs.map((e) => `<div class="week-event" data-action="cal-event" data-id="${A.esc(e.id)}" data-date="${A.esc(iso)}"><b>${A.esc(eventTime(e))}</b><span>${A.esc(e.title)}</span></div>`).join('') : '<div class="empty mini">нет событий</div>'}
        </div>`;
      }).join('')}
    </div>`;
  }
  function dayView() {
    const evs = eventsForDate(calSelected || todayISO());
    return `<div class="card cal-day-card">
      <div class="head"><h3>${A.esc(new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseISO(calSelected || todayISO())))}</h3>
      <button class="btn small" data-action="cal-add-selected">＋ Событие в этот день</button></div>
      ${evs.length ? `<div class="timeline">${evs.map((e) => `
        <div class="tl-item ${importanceClass(e.importance) === 'warn' ? 'important' : ''}">
          <div style="display:flex;gap:12px"><span class="time">${A.esc(eventTime(e))}</span><div class="grow"><b>${A.esc(e.title)}</b>
          <div class="s" style="color:var(--muted);font-size:.8rem">${A.esc(e.place || 'без места')} · ${A.esc(e.category || 'Личное')} ${repeatLabel(e) ? '· ' + A.esc(repeatLabel(e)) : ''}${reminderLabel(e.reminder) !== 'нет' ? ' · напоминание: ' + A.esc(reminderLabel(e.reminder)) : ''}</div></div>
          <button class="btn small" data-action="cal-event" data-id="${A.esc(e.id)}" data-date="${A.esc(calSelected)}">Открыть</button></div>
        </div>`).join('')}</div>` : '<div class="empty">В этот день нет событий. Создайте первое событие.</div>'}
    </div>`;
  }
  function agendaView() {
    const items = Core().events.getAgenda({ fromDate: calSelected || todayISO(), days: 45, limit: 40 }).items;
    return `<div class="agenda-list">
      ${items.length ? items.map((it) => {
        const e = it.event;
        return `<div class="row-item agenda-item">
          <span class="time">${A.esc(dateLabel(it.date))}<br>${A.esc(eventTime(e))}</span>
          <div class="grow"><div class="t">${A.esc(e.title)}</div><div class="s">${A.esc(humanDate(it.date))} · ${A.esc(e.place || 'без места')} · ${A.esc(e.category || 'Личное')}${repeatLabel(e) ? ' · ' + A.esc(repeatLabel(e)) : ''}</div></div>
          ${e.importance !== 'обычная' ? `<span class="pill ${importanceClass(e.importance)}">${A.esc(e.importance)}</span>` : ''}
          <button class="btn small" data-action="cal-event" data-id="${A.esc(e.id)}" data-date="${A.esc(it.date)}">Открыть</button>
        </div>`;
      }).join('') : '<div class="empty">В ближайшие 45 дней событий нет.</div>'}
    </div>`;
  }
  A.pages.calendar = function () {
    const mb = monthBounds(calOffset);
    const titleDate = calView === 'month' ? mb.view : parseISO(calSelected || todayISO());
    const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(titleDate);
    const html = `
    <div class="page-head">
      <div><h1>Календарь</h1><div class="sub">Месяц / Agenda / неделя / день · события через Common Actions · без ассистента</div></div>
      <button class="btn primary" data-action="cal-add">＋ Событие</button>
    </div>
    <div class="tabs" id="cal-tabs">
      <button class="tab ${calView === 'month' ? 'active' : ''}" data-tab="month">Месяц</button>
      <button class="tab ${calView === 'agenda' ? 'active' : ''}" data-tab="agenda">Agenda</button>
      <button class="tab ${calView === 'week' ? 'active' : ''}" data-tab="week">Неделя</button>
      <button class="tab ${calView === 'day' ? 'active' : ''}" data-tab="day">День</button>
    </div>
    <div class="card">
      <div class="cal-head">
        <button class="btn small" data-action="cal-prev">←</button>
        <div><b style="text-transform:capitalize">${A.esc(monthName)}</b><div class="s" style="color:var(--muted);font-size:.8rem">Выбранный день: ${A.esc(humanDate(calSelected))}</div></div>
        <div class="btn-row"><button class="btn small" data-action="cal-today">Сегодня</button><button class="btn small" data-action="cal-next">→</button></div>
      </div>
      ${calView === 'month' ? monthView() : calView === 'agenda' ? agendaView() : calView === 'week' ? weekView() : dayView()}
      <div style="margin-top:12px;color:var(--muted);font-size:.82rem">События сохраняются в localStorage прототипа через Common Actions, пишутся в историю и отменяются через Undo. Повторы показаны как виртуальные вхождения. Reminder metadata хранится честно, но фоновые уведомления не гарантируются.</div>
    </div>`;
    return { html, mount: (root) => {
      A.bindTabs(root.querySelector('#cal-tabs'), (v) => { calView = v; A.render(); });
      root.querySelectorAll('.cal-cell[tabindex]').forEach((cell) => cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); calSelected = cell.dataset.date; A.render(); }
      }));
    } };
  };

  /* ================= ЗАДАЧИ ================= */
  let taskFilter = 'active', taskQuery = '', taskProject = 'all', taskPrio = 'all', taskTag = 'all';
  A.pages.tasks = function () {
    const st = s().tasks || [];
    const activeAll = Core().tasks.getTasks({ status: 'active' }).items;
    const counts = {
      active: activeAll.length,
      today: Core().tasks.getTasks({ status: 'today' }).count,
      upcoming: Core().tasks.getTasks({ status: 'upcoming' }).count,
      overdue: Core().tasks.getOverdueTasks(todayISO()).count,
      completed: Core().tasks.getTasks({ status: 'completed' }).count,
      archive: st.filter((t) => t.archived).length
    };
    const baseFilters = { q: taskQuery, project: taskProject, priority: taskPrio, tag: taskTag };
    let list;
    if (taskFilter === 'archive') list = Core().tasks.getTasks(Object.assign({}, baseFilters, { includeArchived: true, archived: true })).items;
    else if (taskFilter === 'today') list = Core().tasks.getTasks(Object.assign({}, baseFilters, { status: 'today' })).items;
    else if (taskFilter === 'upcoming') list = Core().tasks.getTasks(Object.assign({}, baseFilters, { status: 'upcoming' })).items;
    else if (taskFilter === 'overdue') list = Core().tasks.getTasks(Object.assign({}, baseFilters, { status: 'overdue' })).items;
    else if (taskFilter === 'completed') list = Core().tasks.getTasks(Object.assign({}, baseFilters, { status: 'completed' })).items;
    else list = Core().tasks.getTasks(Object.assign({}, baseFilters, { status: 'active' })).items;
    const projects = Array.from(new Set(st.map((t) => t.project).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'));
    const tags = Array.from(new Set([].concat.apply([], st.map((t) => taskTags(t))))).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'));
    const priorities = ['высокий', 'средний', 'низкий'];
    const prioPill = { 'высокий': 'danger', 'средний': 'warn', 'низкий': '' };
    const html = `
    <div class="page-head">
      <div><h1>Задачи</h1><div class="sub">Создание · редактирование · выполнение/возврат · дедлайны · теги · Common Actions</div></div>
      <button class="btn primary" data-action="task-add">＋ Новая задача</button>
    </div>
    <div class="tabs" id="task-tabs">
      <button class="tab ${taskFilter === 'active' ? 'active' : ''}" data-tab="active">Активные <span class="cnt">${counts.active}</span></button>
      <button class="tab ${taskFilter === 'today' ? 'active' : ''}" data-tab="today">Сегодня <span class="cnt">${counts.today}</span></button>
      <button class="tab ${taskFilter === 'upcoming' ? 'active' : ''}" data-tab="upcoming">Предстоящие <span class="cnt">${counts.upcoming}</span></button>
      <button class="tab ${taskFilter === 'overdue' ? 'active' : ''}" data-tab="overdue">Просроченные <span class="cnt">${counts.overdue}</span></button>
      <button class="tab ${taskFilter === 'completed' ? 'active' : ''}" data-tab="completed">Выполненные <span class="cnt">${counts.completed}</span></button>
      <button class="tab ${taskFilter === 'archive' ? 'active' : ''}" data-tab="archive">Архив <span class="cnt">${counts.archive}</span></button>
    </div>
    <div class="card task-filters">
      <div class="field-row">
        <label class="field grow"><span>Поиск</span><input type="search" id="task-q" value="${A.esc(taskQuery)}" placeholder="Название, описание, проект, тег…"></label>
        <label class="field"><span>Проект</span><select data-action="task-project-filter">
          <option value="all" ${taskProject === 'all' ? 'selected' : ''}>Все проекты</option>
          ${projects.map((p) => `<option value="${A.esc(p)}" ${taskProject === p ? 'selected' : ''}>${A.esc(p)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Приоритет</span><select data-action="task-prio-filter">
          <option value="all" ${taskPrio === 'all' ? 'selected' : ''}>Любой</option>
          ${priorities.map((p) => `<option value="${A.esc(p)}" ${taskPrio === p ? 'selected' : ''}>${A.esc(p)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Тег</span><select data-action="task-tag-filter">
          <option value="all" ${taskTag === 'all' ? 'selected' : ''}>Все теги</option>
          ${tags.map((t) => `<option value="${A.esc(t)}" ${taskTag === t ? 'selected' : ''}>#${A.esc(t)}</option>`).join('')}
        </select></label>
      </div>
      <div class="s" style="color:var(--muted);font-size:.8rem">Фильтры и поиск не пишутся в историю. История фиксирует только существенные действия: create/update/complete/reopen/delete.</div>
    </div>
    <div class="card task-card">
      ${list.length ? `<div class="task-list">${list.map((t) => `
      <div class="check-row task-row ${taskDone(t) ? 'done' : ''} ${t.archived ? 'archived' : ''}" data-action="toggle-task" data-id="${A.esc(t.id)}">
        <input type="checkbox" ${taskDone(t) ? 'checked' : ''} ${t.archived ? 'disabled' : ''} aria-label="${taskDone(t) ? 'Вернуть задачу' : 'Выполнить задачу'}: ${A.esc(t.title)}">
        <span class="label">
          <b>${A.esc(t.title)}</b>
          <span class="pill ${prioPill[taskPriority(t)] || ''}" style="margin-left:8px">${A.esc(taskPriority(t))}</span>
          ${t.project ? `<span class="pill" style="margin-left:6px">${A.esc(t.project)}</span>` : ''}
          ${taskTags(t).map((tag) => `<span class="pill" style="margin-left:6px">#${A.esc(tag)}</span>`).join('')}
          ${t.archived ? '<span class="pill">архив</span>' : ''}
          <div class="s">${A.esc(taskDesc(t) || 'без описания')} · дата: ${A.esc(dateLabel(taskDateISO(t)))} · срок: ${A.esc(taskDueLabel(t))} · статус: ${A.esc(taskStatusLabel(t))}</div>
        </span>
        <span class="task-actions">
          <button class="btn small" data-action="task-edit" data-id="${A.esc(t.id)}">Редактировать</button>
          <button class="btn small" data-action="task-archive" data-id="${A.esc(t.id)}">${t.archived ? 'Вернуть' : 'В архив'}</button>
          <button class="btn small danger" data-action="task-del" data-id="${A.esc(t.id)}">Удалить</button>
        </span>
      </div>`).join('')}</div>` : '<div class="empty">Нет задач в этой категории или по фильтрам</div>'}
    </div>`;
    return {
      html,
      mount: (root) => {
        A.bindTabs(root.querySelector('#task-tabs'), (v) => { taskFilter = v; A.render(); });
        const inp = root.querySelector('#task-q');
        if (inp) inp.addEventListener('input', () => { taskQuery = inp.value; A.render(); });
      }
    };
  };

  /* ================= ЗАМЕТКИ ================= */
  let noteId = 'n1';
  let noteFilter = { status: 'active', folder: 'all', tag: 'all', q: '' };

  function noteFolders(st) {
    const out = (st.noteFolders || ['Личное', 'Идеи', 'Документы']).slice();
    (st.notes || []).forEach((n) => { if (n.folder && out.indexOf(n.folder) < 0) out.push(n.folder); });
    return out;
  }
  function noteTags(notes) {
    const set = {};
    (notes || []).forEach((n) => (n.tags || []).forEach((t) => { if (t) set[t] = true; }));
    return Object.keys(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }
  function noteFolder(n) { return n.folder || 'Личное'; }
  function noteUpdatedISO(n) { return n.updatedISO || todayISO(); }
  function noteUpdatedLabel(n) { return n.updated || dateLabel(noteUpdatedISO(n)); }
  function noteMatch(n) {
    const q = noteFilter.q.trim().toLowerCase();
    if (noteFilter.status === 'active' && n.archived) return false;
    if (noteFilter.status === 'archived' && !n.archived) return false;
    if (noteFilter.folder !== 'all' && noteFolder(n) !== noteFilter.folder) return false;
    if (noteFilter.tag !== 'all' && (n.tags || []).indexOf(noteFilter.tag) < 0) return false;
    if (!q) return true;
    return [n.title, n.body, noteFolder(n), (n.tags || []).join(' ')].join(' ').toLowerCase().includes(q);
  }
  function noteSort(a, b) {
    return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      String(noteUpdatedISO(b)).localeCompare(String(noteUpdatedISO(a))) ||
      String(a.title).localeCompare(String(b.title), 'ru');
  }
  function notePreview(text) {
    const one = String(text || '').replace(/\s+/g, ' ').trim();
    return one.slice(0, 64) + (one.length > 64 ? '…' : '');
  }
  function noteTextChange(from, to) {
    return {
      field: 'Текст',
      from: from ? notePreview(from) : '—',
      to: to ? notePreview(to) : '—'
    };
  }

  A.pages.notes = function () {
    const st0 = s();
    const notes = st0.notes || [];
    const folders = noteFolders(st0);
    const tags = noteTags(notes);
    const filtered = notes.filter(noteMatch).sort(noteSort);
    if ((!notes.find((n) => n.id === noteId) || (filtered.length && !filtered.some((n) => n.id === noteId))) && filtered.length) noteId = filtered[0].id;
    if (!notes.find((n) => n.id === noteId) && notes.length) noteId = notes.slice().sort(noteSort)[0].id;
    const cur = filtered.find((n) => n.id === noteId) || (filtered.length ? filtered[0] : null);
    const active = notes.filter((n) => !n.archived).length;
    const archived = notes.filter((n) => n.archived).length;
    const pinned = notes.filter((n) => n.pinned && !n.archived).length;
    const html = `
    <div class="page-head">
      <div><h1>Заметки</h1><div class="sub">Папки · теги · архив · автосохранение · история/Undo · демо</div></div>
      <div class="btn-row">
        <button class="btn" data-action="note-folder-add">＋ Папка</button>
        <button class="btn primary" data-action="note-add">＋ Заметка</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="card stat"><div class="l">Активные</div><div class="v">${active}</div><div class="d">заметок</div></div>
      <div class="card stat"><div class="l">Закреплены</div><div class="v">${pinned}</div><div class="d">поверх списка</div></div>
      <div class="card stat"><div class="l">Папки</div><div class="v">${folders.length}</div><div class="d">управляемый справочник</div></div>
      <div class="card stat"><div class="l">Архив</div><div class="v">${archived}</div><div class="d">скрыты из активных</div></div>
    </div>
    <div class="notes-layout">
      <div class="card note-sidebar">
        <div class="note-filters">
          <label class="field"><span>Поиск</span><input type="search" id="note-search" placeholder="Поиск заметок…" value="${A.esc(noteFilter.q)}"></label>
          <div class="field-row">
            <label class="field"><span>Статус</span><select data-action="note-filter-status">
              <option value="active" ${noteFilter.status === 'active' ? 'selected' : ''}>Активные</option>
              <option value="archived" ${noteFilter.status === 'archived' ? 'selected' : ''}>Архив</option>
              <option value="all" ${noteFilter.status === 'all' ? 'selected' : ''}>Все</option>
            </select></label>
            <label class="field"><span>Папка</span><select data-action="note-filter-folder">
              <option value="all" ${noteFilter.folder === 'all' ? 'selected' : ''}>Все</option>
              ${folders.map((f) => `<option value="${A.esc(f)}" ${noteFilter.folder === f ? 'selected' : ''}>${A.esc(f)}</option>`).join('')}
            </select></label>
          </div>
          <label class="field"><span>Тег</span><select data-action="note-filter-tag">
            <option value="all" ${noteFilter.tag === 'all' ? 'selected' : ''}>Все</option>
            ${tags.map((t) => `<option value="${A.esc(t)}" ${noteFilter.tag === t ? 'selected' : ''}>#${A.esc(t)}</option>`).join('')}
          </select></label>
        </div>
        <div class="note-list">
          ${filtered.map((n) => `
          <div class="note-li ${n.id === (cur && cur.id) ? 'active' : ''} ${n.archived ? 'archived' : ''}" data-action="note-open" data-id="${n.id}">
            <div class="nt">${n.pinned ? '📌' : n.archived ? '🗄️' : '📄'} ${A.esc(n.title)}</div>
            <div class="np">${A.esc(notePreview(n.body))}</div>
            <div class="tags" style="margin-top:5px"><span class="pill accent">${A.esc(noteFolder(n))}</span>${(n.tags || []).map((t) => `<span class="pill">${A.esc(t)}</span>`).join('')}${n.archived ? '<span class="pill warn">архив</span>' : ''}</div>
          </div>`).join('') || '<div class="empty">Ничего не найдено</div>'}
        </div>
      </div>
      <div class="card note-detail">
        ${cur ? `
        <div class="head">
          <h3>${cur.pinned ? '📌 ' : ''}${A.esc(cur.title)}</h3>
          <div class="btn-row">
            <button class="btn small" data-action="note-pin" data-id="${cur.id}">${cur.pinned ? 'Снять закрепление' : 'Закрепить'}</button>
            <button class="btn small" data-action="note-archive" data-id="${cur.id}">${cur.archived ? 'Вернуть из архива' : 'В архив'}</button>
            <button class="btn small" data-action="note-edit" data-id="${cur.id}">Редактировать</button>
            <button class="btn small danger" data-action="note-del" data-id="${cur.id}">Удалить</button>
          </div>
        </div>
        <div class="s" style="color:var(--muted);font-size:.82rem;margin-bottom:12px">Папка: ${A.esc(noteFolder(cur))} · обновлено: ${A.esc(noteUpdatedLabel(cur))}${cur.archived ? ' · архив' : ''}</div>
        <div class="tags" style="margin-bottom:14px">${(cur.tags || []).map((t) => `<span class="pill accent">${A.esc(t)}</span>`).join('') || '<span class="pill">без тегов</span>'}</div>
        <div class="field note-autosave-field">
          <label>Текст заметки <span id="note-save-state" class="pill">автосохранение включено</span></label>
          <textarea id="note-autosave" data-id="${cur.id}" rows="14">${A.esc(cur.body || '')}</textarea>
        </div>
        <div class="tts-priv"><span>📝</span><div>Автосохранение пишет запись в историю и поддерживает Undo. Вложения/файлы для заметок не имитируются — это будущий StorageProvider.</div></div>` : '<div class="empty">Выберите заметку или измените фильтры</div>'}
      </div>
    </div>`;
    return {
      html,
      mount: (root) => {
        const inp = root.querySelector('#note-search');
        if (inp) inp.addEventListener('input', () => { noteFilter.q = inp.value; A.render(); });
        const auto = root.querySelector('#note-autosave');
        const state = root.querySelector('#note-save-state');
        if (auto) {
          let timer = null;
          auto.addEventListener('input', () => {
            if (state) state.textContent = 'сохранение…';
            clearTimeout(timer);
            timer = setTimeout(() => {
              const st = S.s();
              const n = (st.notes || []).find((x) => x.id === auto.dataset.id);
              if (!n) return;
              const body = auto.value;
              if (String(n.body || '') === body) { if (state) state.textContent = 'без изменений'; return; }
              const prev = { body: n.body || '', updated: n.updated || '', updatedISO: n.updatedISO || '' };
              n.body = body;
              n.updated = 'только что';
              n.updatedISO = todayISO();
              S.save();
              A.logAction({
                action: 'note.autosave', title: 'Заметка автосохранена', object: n.title, objectType: 'note',
                undoable: true, sensitive: true,
                changes: [noteTextChange(prev.body, body)],
                undo: { type: 'fields', list: 'notes', id: n.id, fields: prev }
              });
              if (state) state.textContent = 'сохранено';
            }, 320);
          });
        }
      }
    };
  };

  /* ================= действия ================= */
  const confirmDelete = 'Элемент будет удалён локально в прототипе. Удалить? Отмена (Undo) останется доступна в истории действий.';

  /* экспериментальный STT в поле Главной: state → listening, interim-текст в поле */
  function homeMic() {
    const inp = document.getElementById('home-cmd');
    const PH = 'Что сделать? Например: «Запиши 850 рублей на продукты» (демо)';
    if (!window.AvenVoice || !window.AvenVoice.support.stt) { A.micToast(); return; }
    if (A._homeStt && A._homeStt.active) { A._homeStt.stop(); A._homeStt = null; return; }
    const P = window.AvenPresence;
    A._homeStt = window.AvenVoice.createRecognizer({
      onStart: () => { if (P) P.set('listening'); if (inp) inp.placeholder = 'Слушаю… (экспериментальный STT)'; },
      onInterim: (t) => { if (inp) inp.value = t; },
      onFinal: (t) => { if (inp) inp.value = t; },
      onEnd: () => { A._homeStt = null; if (P) P.set('idle'); if (inp) inp.placeholder = PH; },
      onError: (err) => {
        A._homeStt = null; if (P) P.set('idle'); if (inp) inp.placeholder = PH;
        const map = { 'not-allowed': 'Нет доступа к микрофону', 'no-speech': 'Речь не распознана', 'audio-capture': 'Микрофон не найден' };
        A.toast((map[err] || 'Ошибка распознавания') + ' (экспериментально)');
      }
    });
    if (A._homeStt) A._homeStt.start(); else A.micToast();
  }

  A.register({
    'mic-demo': () => homeMic(),
    'home-mic': () => homeMic(),

    /* клик по Female Aven: фокус в поле команды; если уже в фокусе — suggestions */
    'hero-char-click': () => {
      const inp = document.getElementById('home-cmd');
      const sugg = document.getElementById('hero-sugg');
      if (!inp) return;
      if (document.activeElement === inp) { if (sugg) sugg.hidden = !sugg.hidden; }
      else { inp.focus(); }
    },
    'home-sugg': (el) => {
      const inp = document.getElementById('home-cmd');
      if (inp && el.dataset.q) { inp.value = el.dataset.q; inp.focus(); }
    },

    'home-cmd-send': (el) => {
      const inp = document.getElementById('home-cmd');
      const v = (inp && inp.value || '').trim();
      if (!v) { A.toast('Введите команду — или откройте Aven Assistant'); return; }
      location.hash = '#/assistant';
      setTimeout(() => { A._assistantSend && A._assistantSend(v); }, 120);
    },

    'go-assistant': () => { location.hash = '#/assistant'; },

    'toggle-task': (el) => {
      const t = Core().tasks.getTask(el.dataset.id).entity;
      if (!t) { A.toast('Задача не найдена'); return; }
      if (t.archived) { A.toast('Задача в архиве — сначала верните её из архива'); return; }
      const res = taskDone(t) ? Core().tasks.reopenTask(t.id) : Core().tasks.completeTask(t.id);
      if (!res.ok) { A.toast(res.message || 'Не удалось изменить задачу'); return; }
      A.render();
    },

    /* --- быстрые действия и формы --- */
    'quick-expense': () => { if (A.actions['fin-add']) A.actions['fin-add'](); else expenseForm(); },
    'quick-task': () => taskForm(),
    'quick-event': () => eventForm(null, todayISO()),
    'quick-note': () => noteForm(),
    'quick-fuel': () => fuelForm(),

    'task-add': () => taskForm(),
    'task-edit': (el) => {
      const t = Core().tasks.getTask(el.dataset.id).entity;
      if (t) taskForm(t);
    },
    'task-project-filter': (el) => { taskProject = el.value; A.render(); },
    'task-prio-filter': (el) => { taskPrio = el.value; A.render(); },
    'task-tag-filter': (el) => { taskTag = el.value; A.render(); },
    'task-archive': (el) => {
      const t = Core().tasks.getTask(el.dataset.id).entity;
      if (!t) { A.toast('Задача не найдена'); return; }
      const res = Core().tasks.updateTask(t.id, { archived: !t.archived }, { title: !t.archived ? 'Задача отправлена в архив' : 'Задача возвращена из архива' });
      if (!res.ok) { A.toast(res.message || 'Не удалось изменить задачу'); return; }
      A.render(); A.toast(res.entity.archived ? 'Задача в архиве · можно отменить' : 'Задача возвращена из архива · можно отменить');
    },
    'task-del': (el, ev) => {
      A.confirmModal(confirmDelete, () => {
        const res = Core().tasks.deleteTask(el.dataset.id);
        if (!res.ok) { A.toast(res.message || 'Задача не найдена'); return; }
        A.render(); A.toast('Задача удалена — можно отменить в истории');
      });
    },

    'day-add-event': () => eventForm(null, selectedDayISO()),
    'day-add-task': () => taskForm(null, selectedDayISO()),
    'day-date': (el) => { if (el.value) { daySelected = el.value; dayTab = 'custom'; A.render(); } },

    'cal-prev': () => {
      if (calView === 'month') calOffset--;
      else calSelected = addDays(calSelected || todayISO(), -(calView === 'week' || calView === 'agenda' ? 7 : 1));
      A.render();
    },
    'cal-next': () => {
      if (calView === 'month') calOffset++;
      else calSelected = addDays(calSelected || todayISO(), (calView === 'week' || calView === 'agenda' ? 7 : 1));
      A.render();
    },
    'cal-today': () => { calOffset = 0; calSelected = todayISO(); A.render(); },
    'cal-day': (el) => { if (el.dataset.date) { calSelected = el.dataset.date; if (calView === 'month') { /* выбрать, но остаться в месяце */ } A.render(); } },
    'cal-add': () => eventForm(null, calSelected || todayISO()),
    'cal-add-selected': () => eventForm(null, calSelected || todayISO()),
    'cal-event': (el) => openEvent(el.dataset.id, el.dataset.date || calSelected),
    'event-edit': (el) => {
      const ev = Core().events.getEvent(el.dataset.id).entity;
      if (ev) eventForm(ev, el.dataset.date || ev.date);
    },
    'event-del': (el) => deleteEvent(el.dataset.id),

    'note-open': (el) => { noteId = el.dataset.id; A.render(); },
    'note-filter-status': (el) => { noteFilter.status = el.value; A.render(); },
    'note-filter-folder': (el) => { noteFilter.folder = el.value; A.render(); },
    'note-filter-tag': (el) => { noteFilter.tag = el.value; A.render(); },
    'note-add': () => noteForm(),
    'note-folder-add': () => noteFolderForm(),
    'note-edit': (el) => {
      const n = s().notes.find((x) => x.id === el.dataset.id);
      if (n) noteForm(n);
    },
    'note-pin': (el) => {
      const n = s().notes.find((x) => x.id === el.dataset.id);
      if (!n) return;
      const was = n.pinned;
      n.pinned = !n.pinned;
      S.save();
      A.logAction({
        action: 'note.update', title: n.pinned ? 'Заметка закреплена' : 'Закрепление снято', object: n.title,
        objectType: 'note', undoable: true,
        changes: [{ field: 'Закрепление', from: was ? 'закреплена' : 'обычная', to: n.pinned ? 'закреплена' : 'обычная' }],
        undo: { type: 'fields', list: 'notes', id: n.id, fields: { pinned: was } }
      });
      A.render();
    },
    'note-archive': (el) => {
      const n = s().notes.find((x) => x.id === el.dataset.id);
      if (!n) return;
      const was = !!n.archived;
      n.archived = !was;
      n.updated = 'только что';
      n.updatedISO = todayISO();
      S.save();
      A.logAction({
        action: 'note.update', title: n.archived ? 'Заметка отправлена в архив' : 'Заметка возвращена из архива', object: n.title,
        objectType: 'note', undoable: true, sensitive: true,
        changes: [{ field: 'Архив', from: was ? 'в архиве' : 'активна', to: n.archived ? 'в архиве' : 'активна' }],
        undo: { type: 'fields', list: 'notes', id: n.id, fields: { archived: was } }
      });
      A.render(); A.toast(n.archived ? 'Заметка в архиве · можно отменить' : 'Заметка возвращена · можно отменить');
    },
    'note-del': (el) => {
      A.confirmModal(confirmDelete, () => {
        const list = S.s().notes;
        const i = A.indexOfId(list, el.dataset.id);
        const item = list[i];
        if (!item) { A.toast('Заметка не найдена'); return; }
        list.splice(i, 1);
        S.save();
        A.logAction({
          action: 'note.delete', title: 'Заметка удалена', object: item.title, objectType: 'note',
          undoable: true, danger: true, sensitive: true,
          changes: [{ field: 'Состояние', from: 'в списке', to: 'Удалена' }],
          undo: { type: 'restore', list: 'notes', index: i, item: JSON.parse(JSON.stringify(item)) }
        });
        A.render(); A.toast('Заметка удалена — можно отменить в истории');
      });
    }
  });

  /* ---------- формы (общие) ---------- */
  function taskForm(existing, dateHint) {
    const ex = existing ? Core().tasks.snapshot(existing) : { title: '', description: '', date: dateHint || todayISO(), time: '', deadline: dateHint || todayISO(), priority: 'средний', project: 'Личное', tags: [], completed: false, archived: false, reminder: null };
    const projects = ['Личное', 'Дом', 'Авто', 'Работа', 'Здоровье', 'Покупки'];
    if (ex.project && projects.indexOf(ex.project) < 0) projects.push(ex.project);
    const reminderValue = ex.reminder && (ex.reminder.value || (ex.reminder.minutesBefore === 15 ? '15m' : ex.reminder.minutesBefore === 60 ? '1h' : ex.reminder.minutesBefore === 1440 ? '1d' : 'none'));
    A.openModal({
      title: existing ? 'Редактировать задачу' : 'Новая задача',
      wide: true,
      body: `
        <div class="field"><label>Название</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="Что нужно сделать?"></div>
        <div class="field"><label>Описание</label><textarea name="description" style="min-height:60px">${A.esc(ex.description || '')}</textarea></div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date" value="${A.esc(ex.date || '')}"></div>
          <div class="field"><label>Время</label><input type="time" name="time" value="${A.esc(ex.time || '')}"></div>
          <div class="field"><label>Дедлайн</label><input type="date" name="deadline" value="${A.esc(ex.deadline || ex.date || '')}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Приоритет</label>
            <select name="priority"><option ${ex.priority === 'низкий' ? 'selected' : ''}>низкий</option><option ${!ex.priority || ex.priority === 'средний' ? 'selected' : ''}>средний</option><option ${ex.priority === 'высокий' ? 'selected' : ''}>высокий</option></select></div>
          <div class="field"><label>Проект</label>
            <select name="project">${projects.map((p) => `<option ${ex.project === p ? 'selected' : ''}>${A.esc(p)}</option>`).join('')}</select></div>
          <div class="field"><label>Статус</label>
            <select name="completed"><option value="false" ${!ex.completed ? 'selected' : ''}>Открыта</option><option value="true" ${ex.completed ? 'selected' : ''}>Выполнена</option></select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Теги (через запятую)</label><input type="text" name="tags" value="${A.esc((ex.tags || []).join(', '))}" placeholder="например: дом, срочно"></div>
          <div class="field"><label>Reminder metadata</label><select name="reminder">
            <option value="none" ${!reminderValue || reminderValue === 'none' ? 'selected' : ''}>нет</option>
            <option value="at-time" ${reminderValue === 'at-time' ? 'selected' : ''}>в момент</option>
            <option value="15m" ${reminderValue === '15m' ? 'selected' : ''}>за 15 минут</option>
            <option value="1h" ${reminderValue === '1h' ? 'selected' : ''}>за 1 час</option>
            <option value="1d" ${reminderValue === '1d' ? 'selected' : ''}>за 1 день</option>
          </select></div>
        </div>
        <label class="check-row" style="margin-bottom:12px"><input type="checkbox" name="archived" ${ex.archived ? 'checked' : ''}><span class="label">Архивировать</span></label>
        <div class="s" style="color:var(--muted);font-size:.8rem">Напоминание сохраняется как metadata. Прототип не обещает доставку уведомлений при закрытом браузере; фоновые уведомления — future.</div>`,
      onSubmit: (v) => {
        const payload = {
          title: v.title,
          description: v.description,
          date: v.date,
          time: v.time,
          deadline: v.deadline || v.date,
          priority: v.priority,
          project: v.project,
          tags: v.tags,
          completed: v.completed === 'true',
          archived: !!v.archived,
          reminder: v.reminder === 'none' ? null : v.reminder
        };
        const res = existing ? Core().tasks.updateTask(existing.id, payload) : Core().tasks.createTask(payload);
        if (!res.ok) { A.toast(res.message || 'Не удалось сохранить задачу'); return; }
        A.closeModal(); A.render(); A.toast(existing ? 'Задача сохранена · запись в истории' : 'Задача добавлена · запись в истории, можно отменить');
      }
    });
  }

  function fmtEventObject(e) {
    return e.title + ' · ' + humanDate(e.date) + (e.allDay ? ' · весь день' : (eventStart(e) ? ' · ' + eventStart(e) : ''));
  }

  function openEvent(id, occurrenceDate) {
    const ev = Core().events.getEvent(id).entity;
    if (!ev) { A.toast('Событие не найдено'); return; }
    const rep = repeatLabel(ev);
    A.openModal({
      title: ev.title,
      submitText: null,
      cancelText: 'Закрыть',
      body: `
        <div class="set-row"><div class="grow"><div class="t">${A.esc(eventTime(ev))}${eventEnd(ev) && !ev.allDay ? '–' + A.esc(eventEnd(ev)) : ''}</div><div class="s">время</div></div></div>
        <div class="set-row"><div class="grow"><div class="t">${A.esc(humanDate(occurrenceDate || ev.date))}</div><div class="s">${occurrenceDate && occurrenceDate !== ev.date ? 'вхождение повторяющегося события; редактируется исходное' : 'дата'}</div></div></div>
        <div class="set-row"><div class="grow"><div class="t">${A.esc(ev.place || '—')}</div><div class="s">место</div></div></div>
        <div class="set-row"><div class="grow"><div class="t"><span class="pill ${importanceClass(ev.importance)}">${A.esc(ev.importance || 'обычная')}</span>${rep ? ` <span class="pill accent">${A.esc(rep)}</span>` : ''} <span class="pill">${A.esc(ev.category || 'Личное')}</span></div><div class="s">важность, повторение и категория</div></div></div>
        <div class="set-row"><div class="grow"><div class="t">${A.esc(reminderLabel(ev.reminder))}</div><div class="s">reminder metadata (без гарантированной фоновой доставки)</div></div></div>
        ${Core().events.description(ev) ? `<div class="set-row"><div class="grow"><div class="t">${A.esc(Core().events.description(ev))}</div><div class="s">описание</div></div></div>` : ''}
        <div class="btn-row" style="margin-top:14px">
          <button class="btn" data-action="event-edit" data-id="${A.esc(ev.id)}" data-date="${A.esc(occurrenceDate || ev.date)}">Редактировать</button>
          <button class="btn danger" data-action="event-del" data-id="${A.esc(ev.id)}">Удалить</button>
        </div>`
    });
  }

  function deleteEvent(id) {
    const ev = Core().events.getEvent(id).entity;
    if (!ev) { A.toast('Событие не найдено'); return; }
    A.confirmModal('Удалить событие «' + ev.title + '»? Повторяющееся событие удалится целиком. Отмена (Undo) останется доступна в истории действий.', () => {
      const res = Core().events.deleteEvent(id);
      if (!res.ok) { A.toast(res.message || 'Событие не найдено'); return; }
      A.render(); A.toast('Событие удалено — можно отменить в истории');
    });
  }

  function eventForm(existing, dateHint) {
    const ex = existing ? Core().events.snapshot(existing) : { title: '', date: dateHint || todayISO(), startTime: '12:00', endTime: '', allDay: false, place: '', description: '', importance: 'обычная', repeat: 'none', reminder: null, category: 'Личное', color: '' };
    const dfltDate = ex.date || dateHint || todayISO();
    const repeat = ex.repeat || 'none';
    const reminderValue = ex.reminder && (ex.reminder.value || (ex.reminder.minutesBefore === 15 ? '15m' : ex.reminder.minutesBefore === 60 ? '1h' : ex.reminder.minutesBefore === 1440 ? '1d' : 'none'));
    A.openModal({
      title: existing ? 'Редактировать событие' : 'Новое событие',
      wide: true,
      body: `
        <div class="field"><label>Название</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="Например: встреча"></div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date" value="${A.esc(dfltDate)}"></div>
          <div class="field"><label>Начало</label><input type="time" name="startTime" value="${A.esc(ex.startTime || '12:00')}"></div>
          <div class="field"><label>Окончание</label><input type="time" name="endTime" value="${A.esc(ex.endTime || '')}"></div>
        </div>
        <label class="check-row" style="margin-bottom:12px"><input type="checkbox" name="allDay" ${ex.allDay ? 'checked' : ''}><span class="label">Весь день</span></label>
        <div class="field-row">
          <div class="field"><label>Важность</label><select name="importance">
            <option ${ex.importance === 'обычная' || !ex.importance ? 'selected' : ''}>обычная</option>
            <option ${ex.importance === 'важное' ? 'selected' : ''}>важное</option>
            <option ${ex.importance === 'критическое' ? 'selected' : ''}>критическое</option>
          </select></div>
          <div class="field"><label>Повторение</label><select name="repeat">
            <option value="none" ${repeat === 'none' ? 'selected' : ''}>не повторять</option>
            <option value="daily" ${repeat === 'daily' ? 'selected' : ''}>ежедневно</option>
            <option value="weekly" ${repeat === 'weekly' ? 'selected' : ''}>еженедельно</option>
            <option value="monthly" ${repeat === 'monthly' ? 'selected' : ''}>ежемесячно</option>
            <option value="yearly" ${repeat === 'yearly' ? 'selected' : ''}>ежегодно</option>
          </select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Категория</label><select name="category">
            ${['Личное', 'Работа', 'Дом', 'Авто', 'Здоровье', 'Покупки'].map((c) => `<option ${ex.category === c ? 'selected' : ''}>${A.esc(c)}</option>`).join('')}
          </select></div>
          <div class="field"><label>Цвет (metadata)</label><input type="text" name="color" value="${A.esc(ex.color || '')}" placeholder="#5a5fd8"></div>
          <div class="field"><label>Reminder metadata</label><select name="reminder">
            <option value="none" ${!reminderValue || reminderValue === 'none' ? 'selected' : ''}>нет</option>
            <option value="at-time" ${reminderValue === 'at-time' ? 'selected' : ''}>в момент</option>
            <option value="15m" ${reminderValue === '15m' ? 'selected' : ''}>за 15 минут</option>
            <option value="1h" ${reminderValue === '1h' ? 'selected' : ''}>за 1 час</option>
            <option value="1d" ${reminderValue === '1d' ? 'selected' : ''}>за 1 день</option>
          </select></div>
        </div>
        <div class="field"><label>Место</label><input type="text" name="place" value="${A.esc(ex.place || '')}" placeholder="необязательно"></div>
        <div class="field"><label>Описание</label><textarea name="description" style="min-height:70px">${A.esc(ex.description || '')}</textarea></div>
        <div class="s" style="color:var(--muted);font-size:.8rem">Событие сохраняется через Common Actions и появляется в «Календаре», «Дне» и на «Главной». Reminder metadata не означает гарантированную доставку уведомления при закрытом браузере.</div>`,
      onSubmit: (v) => {
        const payload = {
          title: v.title,
          date: v.date,
          startTime: v.startTime,
          endTime: v.endTime,
          allDay: !!v.allDay,
          place: v.place,
          importance: v.importance,
          repeat: v.repeat,
          description: v.description,
          reminder: v.reminder === 'none' ? null : v.reminder,
          category: v.category,
          color: v.color
        };
        const res = existing ? Core().events.updateEvent(existing.id, payload) : Core().events.createEvent(payload);
        if (!res.ok) { A.toast(res.message || 'Не удалось сохранить событие'); return; }
        calSelected = res.entity.date;
        A.closeModal(); A.render(); A.toast(existing ? 'Событие сохранено · запись в истории' : 'Событие добавлено · видно в Календаре, Дне и на Главной');
      }
    });
  }

  function noteFolderForm() {
    A.openModal({
      title: 'Новая папка заметок',
      body: `<div class="field"><label>Название папки</label><input type="text" name="name" placeholder="Например: Работа"></div>`,
      onSubmit: (v) => {
        const st = S.s();
        const name = (v.name || '').trim();
        if (!name) { A.toast('Введите название папки'); return; }
        const prev = (st.noteFolders || []).slice();
        if (prev.some((x) => x.toLowerCase() === name.toLowerCase())) { A.toast('Такая папка уже есть'); return; }
        st.noteFolders = prev.concat([name]);
        S.save();
        A.logAction({
          action: 'note.folder.create', title: 'Папка заметок создана', object: name, objectType: 'note', undoable: true,
          changes: [{ field: 'Папка', from: '—', to: name }],
          undo: { type: 'value', path: 'noteFolders', value: prev }
        });
        A.closeModal(); A.render(); A.toast('Папка добавлена · можно отменить');
      }
    });
  }

  function noteForm(existing) {
    const st0 = s();
    const folders = noteFolders(st0);
    const ex = existing || { title: '', tags: [], body: '', folder: folders[0] || 'Личное', archived: false };
    if (ex.folder && folders.indexOf(ex.folder) < 0) folders.push(ex.folder);
    A.openModal({
      title: existing ? 'Редактировать заметку' : 'Новая заметка',
      wide: true,
      body: `
        <div class="field-row">
          <div class="field"><label>Название</label><input type="text" name="title" value="${A.esc(ex.title || '')}"></div>
          <div class="field"><label>Папка</label><select name="folder">${folders.map((f) => `<option ${noteFolder(ex) === f ? 'selected' : ''}>${A.esc(f)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Теги (через запятую)</label><input type="text" name="tags" value="${A.esc((ex.tags || []).join(', '))}"></div>
        <div class="field"><label>Текст</label><textarea name="body" rows="8">${A.esc(ex.body || '')}</textarea></div>
        <label class="set-row"><input type="checkbox" name="archived" ${ex.archived ? 'checked' : ''}> <div class="grow"><div class="t">В архиве</div><div class="s">Архив скрывает заметку из активного списка, но не удаляет данные.</div></div></label>`,
      onSubmit: (v) => {
        const st = S.s();
        const tags = (v.tags || '').split(',').map((x) => x.trim()).filter(Boolean);
        const fields = {
          title: (v.title || '').trim() || 'Без названия',
          tags,
          body: v.body || '',
          folder: v.folder || ((st.noteFolders || [])[0] || 'Личное'),
          archived: !!v.archived,
          updated: 'только что',
          updatedISO: todayISO()
        };
        if (existing) {
          const prev = { title: existing.title, tags: (existing.tags || []).slice(), body: existing.body || '',
            folder: noteFolder(existing), archived: !!existing.archived, updated: existing.updated || '', updatedISO: existing.updatedISO || '' };
          Object.assign(existing, fields);
          S.save();
          const changes = [];
          if (prev.title !== existing.title) changes.push({ field: 'Заголовок', from: prev.title, to: existing.title });
          if (prev.folder !== existing.folder) changes.push({ field: 'Папка', from: prev.folder, to: existing.folder });
          if (prev.tags.join(', ') !== tags.join(', ')) changes.push({ field: 'Теги', from: prev.tags.join(', ') || '—', to: tags.join(', ') || '—' });
          if (prev.archived !== existing.archived) changes.push({ field: 'Архив', from: prev.archived ? 'в архиве' : 'активна', to: existing.archived ? 'в архиве' : 'активна' });
          if (prev.body !== existing.body) changes.push(noteTextChange(prev.body, existing.body));
          A.logAction({
            action: 'note.update', title: 'Заметка изменена', object: existing.title, objectType: 'note',
            undoable: true, sensitive: true, changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: { type: 'fields', list: 'notes', id: existing.id, fields: prev }
          });
          A.closeModal(); A.render(); A.toast('Заметка сохранена · запись в истории');
        } else {
          const n = Object.assign({ id: S.id('n'), pinned: false }, fields);
          st.notes.unshift(n);
          noteId = n.id;
          S.save();
          A.logAction({
            action: 'note.create', title: 'Заметка создана', object: n.title, objectType: 'note',
            undoable: true, sensitive: true,
            changes: [{ field: 'Заголовок', from: '—', to: n.title }, { field: 'Папка', from: '—', to: n.folder },
                      { field: 'Теги', from: '—', to: tags.join(', ') || '—' }],
            undo: { type: 'remove', list: 'notes', id: n.id }
          });
          A.closeModal(); A.render(); A.toast('Заметка создана · можно отменить в истории');
        }
      }
    });
  }

  function expenseForm() {
    A.openModal({
      title: 'Новый расход',
      body: `
        <div class="field-row">
          <div class="field"><label>Сумма, ₽</label><input type="number" name="amount" placeholder="850"></div>
          <div class="field"><label>Дата</label><input type="date" name="date"></div>
        </div>
        <div class="field"><label>Категория</label><select name="cat"><option>Продукты</option><option>Авто</option><option>Дом</option><option>Подписки</option><option>Другое</option></select></div>
        <div class="field"><label>Комментарий</label><input type="text" name="comment" placeholder="необязательно"></div>`,
      onSubmit: (v) => {
        const st = S.s();
        const amt = +v.amount || 0;
        st.ops.unshift({ id: S.id('o'), type: 'expense', cat: v.cat, title: v.comment || v.cat, amount: amt, date: 'сегодня', comment: '' });
        st.finMonth.expense += amt;
        S.save(); A.closeModal(); A.render(); A.demoToast('Расход ' + A.money(amt) + ' записан (демо)');
      }
    });
  }

  function fuelForm() {
    A.openModal({
      title: 'Новая заправка',
      body: `
        <div class="field-row">
          <div class="field"><label>Литры</label><input type="number" name="liters" placeholder="42"></div>
          <div class="field"><label>Сумма, ₽</label><input type="number" name="sum" placeholder="3200"></div>
        </div>
        <div class="field"><label>Пробег, км</label><input type="number" name="km" value="${s().car.mileage}"></div>`,
      onSubmit: (v) => {
        const st = S.s();
        const f = { id: S.id('f'), liters: +v.liters || 0, sum: +v.sum || 0, km: +v.km || st.car.mileage, date: 'сегодня' };
        st.car.fuel.unshift(f);
        S.save();
        A.logAction({
          action: 'car.fuel.create', title: 'Заправка добавлена', object: f.liters + ' л · ' + A.money(f.sum),
          objectType: 'car', undoable: true,
          changes: [{ field: 'Литры', from: '—', to: String(f.liters) }, { field: 'Сумма', from: '—', to: A.money(f.sum) },
                    { field: 'Пробег', from: '—', to: f.km + ' км' }],
          undo: { type: 'remove', list: 'car.fuel', id: f.id }
        });
        A.closeModal(); A.render(); A.toast('Заправка добавлена · запись в истории (раздел Stage 1.1)');
      }
    });
  }

  // экспорт для других страниц (быстрые действия Авто)
  A.fuelForm = fuelForm;
})();
