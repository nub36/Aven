/* Aven — Visual Prototype. Страницы: Главная, День, Календарь, Задачи, Заметки. Не production. */
(function () {
  const A = window.Aven, S = window.AvenState, D = window.AvenDemo.staticData;
  A.pages = A.pages || {};
  const s = () => S.s();

  /* ---------- даты и события (общие для Главной, Дня и Календаря) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  function localISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function todayISO(offset) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + (offset || 0));
    return localISO(d);
  }
  function parseISO(iso) {
    const p = String(iso || '').split('-').map(Number);
    return new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1, 12, 0, 0, 0);
  }
  function diffDays(aISO, bISO) {
    return Math.round((parseISO(aISO) - parseISO(bISO)) / 86400000);
  }
  function humanDate(iso) {
    if (!iso) return '—';
    const d = parseISO(iso);
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
  function dateLabel(iso) {
    const d = diffDays(iso, todayISO());
    if (d === -1) return 'вчера';
    if (d === 0) return 'сегодня';
    if (d === 1) return 'завтра';
    return humanDate(iso);
  }
  function eventTime(e) { return e.allDay ? 'весь день' : (e.time || 'без времени'); }
  function eventOccursOn(e, iso) {
    if (!e || !e.date || !iso) return false;
    const delta = diffDays(iso, e.date);
    if (delta < 0) return false;
    if (e.repeat === 'daily') return true;
    if (e.repeat === 'weekly') return delta % 7 === 0;
    if (e.repeat === 'monthly') return parseISO(iso).getDate() === parseISO(e.date).getDate();
    if (e.repeat === 'yearly') {
      const a = parseISO(iso), b = parseISO(e.date);
      return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    }
    return e.date === iso;
  }
  function eventsForDate(iso) {
    return (s().events || []).filter((e) => eventOccursOn(e, iso)).sort((a, b) => {
      const aa = a.allDay ? '00:00' : (a.time || '23:59');
      const bb = b.allDay ? '00:00' : (b.time || '23:59');
      return aa.localeCompare(bb) || a.title.localeCompare(b.title);
    });
  }
  function nextEvents(limit) {
    const out = [];
    for (let i = 0; i <= 45 && out.length < (limit || 5); i++) {
      const iso = todayISO(i);
      eventsForDate(iso).forEach((e) => out.push({ event: e, date: iso }));
    }
    return out.slice(0, limit || 5);
  }
  function repeatLabel(e) {
    return ({ daily: 'ежедневно', weekly: 'еженедельно', monthly: 'ежемесячно', yearly: 'ежегодно' }[e.repeat]) || '';
  }
  function importanceClass(v) {
    if (v === 'критическое') return 'danger';
    if (v === 'важное') return 'warn';
    return '';
  }

  /* ---------- задачи (общие для Главной, Дня и раздела Задачи) ---------- */
  function taskDueISO(t) {
    if (t && t.dueDate) return t.dueDate;
    if (t && t.date === 'today') return todayISO();
    if (t && t.date === 'soon') return todayISO(1);
    return '';
  }
  function taskBucket(t) {
    if (t && t.done) return 'done';
    const d = taskDueISO(t);
    if (!d) return 'soon';
    const delta = diffDays(d, todayISO());
    if (delta <= 0) return 'today';
    return 'soon';
  }
  function taskDueLabel(t) {
    const d = taskDueISO(t);
    if (!d) return 'без срока';
    return dateLabel(d) + (t.dueTime ? ' · ' + t.dueTime : '');
  }
  function taskSnapshot(t) {
    return {
      title: t.title, desc: t.desc, date: t.date, dueDate: t.dueDate || '', dueTime: t.dueTime || '',
      prio: t.prio, project: t.project, done: !!t.done, archived: !!t.archived
    };
  }

  /* ================= ГЛАВНАЯ ================= */
  A.pages.home = function () {
    const st = s();
    const cards = Object.assign({ today: true, tasks: true, expenses: true, car: true, quick: true, actions: true }, st.settings.homeCards || {});
    const todayTasks = st.tasks.filter((t) => !t.archived && taskBucket(t) === 'today');
    const todayEvents = eventsForDate(todayISO());
    const upcoming = nextEvents(1)[0];
    const latestHistory = (st.history || []).slice(0, 5);
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
          <label class="check-row" data-action="toggle-task" data-id="${t.id}">
            <input type="checkbox" ${t.done ? 'checked' : ''}>
            <span class="label">${A.esc(t.title)}</span>
          </label>`).join('') : '<div class="empty">Активных задач на сегодня нет</div>'}
        <div style="margin-top:10px"><span class="pill">Выполнено сегодня: 1</span></div>
      </div>` : ''}

      ${cards.expenses ? `
      <div class="card">
        <div class="head"><h3>Расходы</h3><a href="#/finance" class="btn small">Финансы →</a></div>
        <div class="row-item"><div class="grow"><div class="t">Сегодня</div></div><b class="num">${A.money(3420)}</b></div>
        <div class="row-item"><div class="grow"><div class="t">Месяц</div></div><b class="num">${A.money(st.finMonth.expense)}</b></div>
        <div class="row-item"><div class="grow"><div class="s">Крупнейшая: АЗС Лукойл</div></div><span class="num s">${A.money(3200)}</span></div>
      </div>` : ''}

      ${cards.car ? `
      <div class="card">
        <div class="head"><h3>Автомобиль</h3><a href="#/auto" class="btn small">Авто →</a></div>
        <div class="row-item"><div class="grow"><div class="t">${A.esc(st.car.model)}</div><div class="s">${st.car.year} · основной</div></div></div>
        <div class="row-item"><div class="grow"><div class="s">Пробег</div></div><b class="num">${st.car.mileage.toLocaleString('ru-RU')} км</b></div>
        <div class="row-item"><div class="grow"><div class="s">До замены масла</div></div><span class="pill warn">2 480 км</span></div>
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
  function dayISO(tab) {
    return tab === 'yesterday' ? todayISO(-1) : tab === 'tomorrow' ? todayISO(1) : todayISO();
  }
  function taskForTab(t, tab) {
    if (t.archived) return false;
    if (tab === 'today') return taskBucket(t) === 'today';
    if (tab === 'tomorrow') return !t.done && taskBucket(t) === 'soon';
    return t.done;
  }
  A.pages.day = function () {
    const st = s();
    const iso = dayISO(dayTab);
    const evs = eventsForDate(iso);
    const dayTasks = st.tasks.filter((t) => taskForTab(t, dayTab));
    const doneActions = (st.history || []).filter((h) => /\.(create|update|delete)$/.test(h.action || '')).slice(0, 4);
    const timeline = [];
    evs.forEach((e) => timeline.push({ t: eventTime(e), n: e.title, type: e.importance === 'важное' ? 'important' : 'event', sub: e.place || repeatLabel(e) || 'событие' }));
    dayTasks.filter((t) => !t.done).forEach((t) => timeline.push({ t: taskDueLabel(t), n: t.title, type: 'task', sub: 'задача · ' + t.project }));
    timeline.sort((a, b) => {
      const aa = /^\d{2}:\d{2}$/.test(a.t) ? a.t : (a.t === 'весь день' ? '00:00' : '23:59');
      const bb = /^\d{2}:\d{2}$/.test(b.t) ? b.t : (b.t === 'весь день' ? '00:00' : '23:59');
      return aa.localeCompare(bb);
    });
    const html = `
    <div class="page-head">
      <div>
        <h1>День</h1>
        <div class="sub">${A.esc(dateLabel(iso))} · события из Календаря + задачи + последние действия · демо</div>
      </div>
      <div class="btn-row">
        <button class="btn" data-action="day-add-event">＋ Добавить событие</button>
        <button class="btn" data-action="day-add-task">＋ Добавить задачу</button>
      </div>
    </div>
    <div class="tabs" id="day-tabs">
      <button class="tab ${dayTab === 'yesterday' ? 'active' : ''}" data-tab="yesterday">Вчера</button>
      <button class="tab ${dayTab === 'today' ? 'active' : ''}" data-tab="today">Сегодня</button>
      <button class="tab ${dayTab === 'tomorrow' ? 'active' : ''}" data-tab="tomorrow">Завтра</button>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <h3>Timeline</h3>
        ${timeline.length ? `<div class="timeline">${timeline.map((i) => `
          <div class="tl-item ${i.type}">
            <div style="display:flex;gap:12px"><span class="time">${A.esc(i.t)}</span><div><b>${A.esc(i.n)}</b>
            <div class="s" style="color:var(--muted);font-size:.8rem">${A.esc(i.sub)}</div></div></div>
          </div>`).join('')}</div>` : '<div class="empty">На этот день ничего не запланировано. Создайте событие или задачу.</div>'}
        <h3 style="margin-top:18px">Напоминания</h3>
        ${D.reminders.map((r) => `
          <div class="row-item"><span class="time">${A.esc(r.t)}</span><div class="grow"><div class="t">${A.esc(r.n)}</div></div>🔔</div>`).join('')}
      </div>
      <div class="card">
        <h3>Задачи</h3>
        ${dayTasks.length ? dayTasks.map((t) => `
          <label class="check-row ${t.done ? 'done' : ''}" data-action="toggle-task" data-id="${t.id}">
            <input type="checkbox" ${t.done ? 'checked' : ''}>
            <span class="label">${A.esc(t.title)}<div class="s">приоритет: ${A.esc(t.prio)} · ${A.esc(t.project)}</div></span>
          </label>`).join('') : '<div class="empty">Нет задач для этого дня</div>'}
        <h3 style="margin-top:18px">Выполненное и изменения</h3>
        ${st.tasks.filter((t) => t.done).slice(0, 3).map((t) => `
          <div class="row-item"><span class="time">✔</span><div class="grow"><div class="t" style="color:var(--muted)">${A.esc(t.title)}</div></div></div>`).join('') || ''}
        ${doneActions.map((h) => `
          <div class="row-item"><span class="time">•</span><div class="grow"><div class="t">${A.esc(h.title)}</div><div class="s">${A.esc(h.object || h.action)} · ${A.esc(h.when)}</div></div></div>`).join('')}
        ${!st.tasks.some((t) => t.done) && !doneActions.length ? '<div class="empty">Пока ничего</div>' : ''}
      </div>
    </div>`;
    return { html, mount: (root) => { A.bindTabs(root.querySelector('#day-tabs'), (v) => { dayTab = v; A.render(); }); } };
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
          <div class="s" style="color:var(--muted);font-size:.8rem">${A.esc(e.place || 'без места')} ${repeatLabel(e) ? '· ' + A.esc(repeatLabel(e)) : ''}</div></div>
          <button class="btn small" data-action="cal-event" data-id="${A.esc(e.id)}" data-date="${A.esc(calSelected)}">Открыть</button></div>
        </div>`).join('')}</div>` : '<div class="empty">В этот день нет событий. Создайте первое событие.</div>'}
    </div>`;
  }
  A.pages.calendar = function () {
    const mb = monthBounds(calOffset);
    const titleDate = calView === 'month' ? mb.view : parseISO(calSelected || todayISO());
    const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(titleDate);
    const html = `
    <div class="page-head">
      <div><h1>Календарь</h1><div class="sub">Месяц / неделя / день · создание, изменение, удаление, повторения · без ассистента</div></div>
      <button class="btn primary" data-action="cal-add">＋ Событие</button>
    </div>
    <div class="tabs" id="cal-tabs">
      <button class="tab ${calView === 'month' ? 'active' : ''}" data-tab="month">Месяц</button>
      <button class="tab ${calView === 'week' ? 'active' : ''}" data-tab="week">Неделя</button>
      <button class="tab ${calView === 'day' ? 'active' : ''}" data-tab="day">День</button>
    </div>
    <div class="card">
      <div class="cal-head">
        <button class="btn small" data-action="cal-prev">←</button>
        <div><b style="text-transform:capitalize">${A.esc(monthName)}</b><div class="s" style="color:var(--muted);font-size:.8rem">Выбранный день: ${A.esc(humanDate(calSelected))}</div></div>
        <div class="btn-row"><button class="btn small" data-action="cal-today">Сегодня</button><button class="btn small" data-action="cal-next">→</button></div>
      </div>
      ${calView === 'month' ? monthView() : calView === 'week' ? weekView() : dayView()}
      <div style="margin-top:12px;color:var(--muted);font-size:.82rem">События сохраняются в localStorage прототипа, пишутся в историю и отменяются через Undo. Повторы показаны как виртуальные вхождения.</div>
    </div>`;
    return { html, mount: (root) => {
      A.bindTabs(root.querySelector('#cal-tabs'), (v) => { calView = v; A.render(); });
      root.querySelectorAll('.cal-cell[tabindex]').forEach((cell) => cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); calSelected = cell.dataset.date; A.render(); }
      }));
    } };
  };

  /* ================= ЗАДАЧИ ================= */
  let taskFilter = 'all', taskQuery = '', taskProject = 'all';
  A.pages.tasks = function () {
    const st = s().tasks || [];
    const active = st.filter((t) => !t.archived);
    const archived = st.filter((t) => t.archived);
    const counts = {
      all: active.length,
      today: active.filter((t) => taskBucket(t) === 'today').length,
      soon: active.filter((t) => !t.done && taskBucket(t) === 'soon').length,
      done: active.filter((t) => t.done).length,
      archive: archived.length
    };
    let list = taskFilter === 'archive' ? archived.slice() : active.slice();
    if (taskFilter === 'today') list = active.filter((t) => taskBucket(t) === 'today');
    if (taskFilter === 'soon') list = active.filter((t) => !t.done && taskBucket(t) === 'soon');
    if (taskFilter === 'done') list = active.filter((t) => t.done);
    if (taskProject !== 'all') list = list.filter((t) => (t.project || '') === taskProject);
    const q = taskQuery.trim().toLowerCase();
    if (q) list = list.filter((t) => [t.title, t.desc, t.project, t.prio].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (taskDueISO(a) || '9999-99-99').localeCompare(taskDueISO(b) || '9999-99-99');
    });
    const projects = Array.from(new Set(st.map((t) => t.project).filter(Boolean))).sort();
    const prioPill = { 'высокий': 'danger', 'средний': 'warn', 'низкий': '' };
    const html = `
    <div class="page-head">
      <div><h1>Задачи</h1><div class="sub">Сроки · проекты · приоритеты · редактирование · архив · демо</div></div>
      <button class="btn primary" data-action="task-add">＋ Новая задача</button>
    </div>
    <div class="tabs" id="task-tabs">
      <button class="tab ${taskFilter === 'all' ? 'active' : ''}" data-tab="all">Все <span class="cnt">${counts.all}</span></button>
      <button class="tab ${taskFilter === 'today' ? 'active' : ''}" data-tab="today">Сегодня <span class="cnt">${counts.today}</span></button>
      <button class="tab ${taskFilter === 'soon' ? 'active' : ''}" data-tab="soon">Предстоящие <span class="cnt">${counts.soon}</span></button>
      <button class="tab ${taskFilter === 'done' ? 'active' : ''}" data-tab="done">Выполненные <span class="cnt">${counts.done}</span></button>
      <button class="tab ${taskFilter === 'archive' ? 'active' : ''}" data-tab="archive">Архив <span class="cnt">${counts.archive}</span></button>
    </div>
    <div class="card task-filters">
      <div class="field-row">
        <label class="field grow"><span>Поиск</span><input type="search" id="task-q" value="${A.esc(taskQuery)}" placeholder="Название, описание, проект…"></label>
        <label class="field"><span>Проект</span><select data-action="task-project-filter">
          <option value="all" ${taskProject === 'all' ? 'selected' : ''}>Все проекты</option>
          ${projects.map((p) => `<option value="${A.esc(p)}" ${taskProject === p ? 'selected' : ''}>${A.esc(p)}</option>`).join('')}
        </select></label>
      </div>
      <div class="s" style="color:var(--muted);font-size:.8rem">Фильтры и поиск работают по текущему demo-state; архив скрыт из обычных списков, но сохраняется и отменяется через историю.</div>
    </div>
    <div class="card task-card">
      ${list.length ? `<div class="task-list">${list.map((t) => `
      <div class="check-row task-row ${t.done ? 'done' : ''} ${t.archived ? 'archived' : ''}" data-action="toggle-task" data-id="${A.esc(t.id)}">
        <input type="checkbox" ${t.done ? 'checked' : ''} ${t.archived ? 'disabled' : ''}>
        <span class="label">
          <b>${A.esc(t.title)}</b>
          <span class="pill ${prioPill[t.prio] || ''}" style="margin-left:8px">${A.esc(t.prio)}</span>
          ${t.project ? `<span class="pill" style="margin-left:6px">${A.esc(t.project)}</span>` : ''}
          ${t.archived ? '<span class="pill">архив</span>' : ''}
          <div class="s">${A.esc(t.desc || 'без описания')} · срок: ${A.esc(taskDueLabel(t))}</div>
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
      const t = s().tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      if (t.archived) { A.toast('Задача в архиве — сначала верните её из архива'); return; }
      const was = t.done;
      t.done = !t.done;
      S.save();
      A.logAction({
        action: 'task.update', title: t.done ? 'Задача выполнена' : 'Задача снова открыта', object: t.title,
        objectType: 'task', undoable: true,
        changes: [{ field: 'Статус', from: was ? 'Выполнена' : 'Открыта', to: t.done ? 'Выполнена' : 'Открыта' }],
        undo: { type: 'fields', list: 'tasks', id: t.id, fields: { done: was } }
      });
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
      const t = s().tasks.find((x) => x.id === el.dataset.id);
      if (t) taskForm(t);
    },
    'task-project-filter': (el) => { taskProject = el.value; A.render(); },
    'task-archive': (el) => {
      const t = s().tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      const was = !!t.archived;
      t.archived = !was;
      S.save();
      A.logAction({
        action: 'task.update', title: t.archived ? 'Задача отправлена в архив' : 'Задача возвращена из архива', object: t.title,
        objectType: 'task', undoable: true,
        changes: [{ field: 'Архив', from: was ? 'в архиве' : 'активна', to: t.archived ? 'в архиве' : 'активна' }],
        undo: { type: 'fields', list: 'tasks', id: t.id, fields: { archived: was } }
      });
      A.render(); A.toast(t.archived ? 'Задача в архиве · можно отменить' : 'Задача возвращена из архива · можно отменить');
    },
    'task-del': (el, ev) => {
      A.confirmModal(confirmDelete, () => {
        const list = S.s().tasks;
        const i = A.indexOfId(list, el.dataset.id);
        const item = list[i];
        if (!item) { A.toast('Задача не найдена'); return; }
        list.splice(i, 1);
        S.save();
        A.logAction({
          action: 'task.delete', title: 'Задача удалена', object: item.title, objectType: 'task',
          undoable: true, danger: true,
          changes: [{ field: 'Состояние', from: item.done ? 'Выполнена' : 'Открыта', to: 'Удалена' }],
          undo: { type: 'restore', list: 'tasks', index: i, item: JSON.parse(JSON.stringify(item)) }
        });
        A.render(); A.toast('Задача удалена — можно отменить в истории');
      });
    },

    'day-add-event': () => eventForm(null, dayISO(dayTab)),
    'day-add-task': () => taskForm(),

    'cal-prev': () => {
      if (calView === 'month') calOffset--;
      else calSelected = todayISO(diffDays(calSelected, todayISO()) - (calView === 'week' ? 7 : 1));
      A.render();
    },
    'cal-next': () => {
      if (calView === 'month') calOffset++;
      else calSelected = todayISO(diffDays(calSelected, todayISO()) + (calView === 'week' ? 7 : 1));
      A.render();
    },
    'cal-today': () => { calOffset = 0; calSelected = todayISO(); A.render(); },
    'cal-day': (el) => { if (el.dataset.date) { calSelected = el.dataset.date; if (calView === 'month') { /* выбрать, но остаться в месяце */ } A.render(); } },
    'cal-add': () => eventForm(null, calSelected || todayISO()),
    'cal-add-selected': () => eventForm(null, calSelected || todayISO()),
    'cal-event': (el) => openEvent(el.dataset.id, el.dataset.date || calSelected),
    'event-edit': (el) => {
      const ev = (s().events || []).find((x) => x.id === el.dataset.id);
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
  function taskForm(existing) {
    const ex = existing || {};
    const due = ex.dueDate || (ex.date === 'today' ? todayISO() : '');
    const projects = ['Личное', 'Дом', 'Авто', 'Работа', 'Здоровье', 'Покупки'];
    if (ex.project && projects.indexOf(ex.project) < 0) projects.push(ex.project);
    A.openModal({
      title: existing ? 'Редактировать задачу' : 'Новая задача',
      body: `
        <div class="field"><label>Название</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="Что нужно сделать?"></div>
        <div class="field"><label>Описание</label><textarea name="desc" style="min-height:60px">${A.esc(ex.desc || '')}</textarea></div>
        <div class="field-row">
          <div class="field"><label>Дата / срок</label><input type="date" name="dueDate" value="${A.esc(due)}"></div>
          <div class="field"><label>Время</label><input type="time" name="dueTime" value="${A.esc(ex.dueTime || '')}"></div>
          <div class="field"><label>Приоритет</label>
            <select name="prio"><option ${ex.prio === 'низкий' ? 'selected' : ''}>низкий</option><option ${!ex.prio || ex.prio === 'средний' ? 'selected' : ''}>средний</option><option ${ex.prio === 'высокий' ? 'selected' : ''}>высокий</option></select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Проект</label>
            <select name="project">${projects.map((p) => `<option ${ex.project === p ? 'selected' : ''}>${A.esc(p)}</option>`).join('')}</select></div>
          <div class="field"><label>Статус</label>
            <select name="done"><option value="false" ${!ex.done ? 'selected' : ''}>Открыта</option><option value="true" ${ex.done ? 'selected' : ''}>Выполнена</option></select></div>
        </div>
        <label class="check-row" style="margin-bottom:12px"><input type="checkbox" name="archived" ${ex.archived ? 'checked' : ''}><span class="label">Архивировать</span></label>`,
      onSubmit: (v) => {
        const st = S.s();
        const title = (v.title || '').trim();
        if (!title) { A.toast('Введите название задачи'); return; }
        const fields = {
          title,
          desc: v.desc || '',
          dueDate: v.dueDate || '',
          dueTime: v.dueTime || '',
          date: v.dueDate === todayISO() ? 'today' : (v.dueDate ? 'soon' : 'none'),
          prio: v.prio,
          project: v.project,
          done: v.done === 'true',
          archived: !!v.archived
        };
        if (existing) {
          const prev = taskSnapshot(existing);
          Object.assign(existing, fields);
          S.save();
          const labels = { title: 'Название', desc: 'Описание', dueDate: 'Срок', dueTime: 'Время', prio: 'Приоритет', project: 'Проект', done: 'Статус', archived: 'Архив' };
          const changes = [];
          Object.keys(fields).forEach((k) => {
            if (k === 'date') return;
            const from = prev[k];
            const to = fields[k];
            if (String(from == null ? '' : from) !== String(to == null ? '' : to)) {
              changes.push({ field: labels[k] || k, from: k === 'dueDate' ? (from ? humanDate(from) : '—') : (k === 'done' ? (from ? 'Выполнена' : 'Открыта') : (k === 'archived' ? (from ? 'в архиве' : 'активна') : String(from || '—'))),
                to: k === 'dueDate' ? (to ? humanDate(to) : '—') : (k === 'done' ? (to ? 'Выполнена' : 'Открыта') : (k === 'archived' ? (to ? 'в архиве' : 'активна') : String(to || '—'))) });
            }
          });
          A.logAction({
            action: 'task.update', title: 'Задача изменена', object: existing.title, objectType: 'task',
            undoable: true, changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: { type: 'fields', list: 'tasks', id: existing.id, fields: prev }
          });
          A.closeModal(); A.render(); A.toast('Задача сохранена · запись в истории');
        } else {
          const t = Object.assign({ id: S.id('t') }, fields);
          st.tasks.unshift(t);
          S.save();
          A.logAction({
            action: 'task.create', title: 'Задача создана', object: t.title, objectType: 'task', undoable: true,
            changes: [
              { field: 'Название', from: '—', to: t.title },
              { field: 'Приоритет', from: '—', to: t.prio },
              { field: 'Проект', from: '—', to: t.project },
              { field: 'Срок', from: '—', to: t.dueDate ? humanDate(t.dueDate) + (t.dueTime ? ' ' + t.dueTime : '') : 'не указан' }
            ],
            undo: { type: 'remove', list: 'tasks', id: t.id }
          });
          A.closeModal(); A.render(); A.toast('Задача добавлена · запись в истории, можно отменить');
        }
      }
    });
  }

  function fmtEventObject(e) {
    return e.title + ' · ' + humanDate(e.date) + (e.allDay ? ' · весь день' : (e.time ? ' · ' + e.time : ''));
  }

  function openEvent(id, occurrenceDate) {
    const ev = (s().events || []).find((x) => x.id === id);
    if (!ev) { A.toast('Событие не найдено'); return; }
    const rep = repeatLabel(ev);
    A.openModal({
      title: ev.title,
      submitText: null,
      cancelText: 'Закрыть',
      body: `
        <div class="set-row"><div class="grow"><div class="t">${A.esc(eventTime(ev))}${ev.end && !ev.allDay ? '–' + A.esc(ev.end) : ''}</div><div class="s">время</div></div></div>
        <div class="set-row"><div class="grow"><div class="t">${A.esc(humanDate(occurrenceDate || ev.date))}</div><div class="s">${occurrenceDate && occurrenceDate !== ev.date ? 'вхождение повторяющегося события; редактируется исходное' : 'дата'}</div></div></div>
        <div class="set-row"><div class="grow"><div class="t">${A.esc(ev.place || '—')}</div><div class="s">место</div></div></div>
        <div class="set-row"><div class="grow"><div class="t"><span class="pill ${importanceClass(ev.importance)}">${A.esc(ev.importance || 'обычная')}</span>${rep ? ` <span class="pill accent">${A.esc(rep)}</span>` : ''}</div><div class="s">важность и повторение</div></div></div>
        ${ev.desc ? `<div class="set-row"><div class="grow"><div class="t">${A.esc(ev.desc)}</div><div class="s">описание</div></div></div>` : ''}
        <div class="btn-row" style="margin-top:14px">
          <button class="btn" data-action="event-edit" data-id="${A.esc(ev.id)}" data-date="${A.esc(occurrenceDate || ev.date)}">Редактировать</button>
          <button class="btn danger" data-action="event-del" data-id="${A.esc(ev.id)}">Удалить</button>
        </div>`
    });
  }

  function deleteEvent(id) {
    const list = S.s().events || [];
    const i0 = list.findIndex((x) => x && x.id === id);
    const item0 = list[i0];
    if (i0 < 0 || !item0) { A.toast('Событие не найдено'); return; }
    A.confirmModal('Удалить событие «' + item0.title + '»? Повторяющееся событие удалится целиком. Отмена (Undo) останется доступна в истории действий.', () => {
      const st = S.s();
      const i = (st.events || []).findIndex((x) => x && x.id === id);
      const item = (st.events || [])[i];
      if (i < 0 || !item) { A.toast('Событие не найдено'); return; }
      st.events.splice(i, 1);
      S.save();
      A.logAction({
        action: 'event.delete', title: 'Событие удалено', object: fmtEventObject(item), objectType: 'event',
        undoable: true, danger: true,
        changes: [{ field: 'Состояние', from: 'в календаре', to: 'Удалено' }],
        undo: { type: 'restore', list: 'events', index: i, item: JSON.parse(JSON.stringify(item)) }
      });
      A.render(); A.toast('Событие удалено — можно отменить в истории');
    });
  }

  function eventForm(existing, dateHint) {
    const ex = existing || {};
    const dfltDate = ex.date || dateHint || todayISO();
    const repeat = ex.repeat || 'none';
    A.openModal({
      title: existing ? 'Редактировать событие' : 'Новое событие',
      body: `
        <div class="field"><label>Название</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="Например: встреча"></div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date" value="${A.esc(dfltDate)}"></div>
          <div class="field"><label>Начало</label><input type="time" name="time" value="${A.esc(ex.time || '12:00')}"></div>
          <div class="field"><label>Окончание</label><input type="time" name="end" value="${A.esc(ex.end || '')}"></div>
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
        <div class="field"><label>Место</label><input type="text" name="place" value="${A.esc(ex.place || '')}" placeholder="необязательно"></div>
        <div class="field"><label>Описание</label><textarea name="desc" style="min-height:70px">${A.esc(ex.desc || '')}</textarea></div>
        <div class="s" style="color:var(--muted);font-size:.8rem">Событие сохранится в demo-state, появится в «Календаре», «Дне» и на «Главной», а изменение попадёт в историю.</div>`,
      onSubmit: (v) => {
        const title = (v.title || '').trim();
        if (!title) { A.toast('Введите название события'); return; }
        if (!v.date) { A.toast('Выберите дату события'); return; }
        const fields = {
          title,
          date: v.date,
          time: v.allDay ? '' : (v.time || ''),
          end: v.allDay ? '' : (v.end || ''),
          allDay: !!v.allDay,
          place: (v.place || '').trim(),
          importance: v.importance || 'обычная',
          repeat: v.repeat || 'none',
          desc: (v.desc || '').trim()
        };
        const st = S.s();
        if (!Array.isArray(st.events)) st.events = [];
        if (existing) {
          const prev = {
            title: existing.title, date: existing.date, time: existing.time, end: existing.end,
            allDay: existing.allDay, place: existing.place, importance: existing.importance,
            repeat: existing.repeat, desc: existing.desc
          };
          Object.assign(existing, fields);
          S.save();
          const labels = { title: 'Название', date: 'Дата', time: 'Начало', end: 'Окончание', allDay: 'Весь день', place: 'Место', importance: 'Важность', repeat: 'Повторение', desc: 'Описание' };
          const changes = Object.keys(fields).filter((k) => String(prev[k] == null ? '' : prev[k]) !== String(fields[k] == null ? '' : fields[k]))
            .map((k) => ({ field: labels[k] || k, from: k === 'date' ? humanDate(prev[k]) : String(prev[k] || '—'), to: k === 'date' ? humanDate(fields[k]) : String(fields[k] || '—') }));
          A.logAction({
            action: 'event.update', title: 'Событие изменено', object: fmtEventObject(existing), objectType: 'event',
            undoable: true, changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: { type: 'fields', list: 'events', id: existing.id, fields: prev }
          });
          calSelected = existing.date;
          A.closeModal(); A.render(); A.toast('Событие сохранено · запись в истории');
        } else {
          const ev = Object.assign({ id: S.id('e') }, fields);
          st.events.unshift(ev);
          S.save();
          A.logAction({
            action: 'event.create', title: 'Событие создано', object: fmtEventObject(ev), objectType: 'event', undoable: true,
            changes: [
              { field: 'Название', from: '—', to: ev.title },
              { field: 'Дата', from: '—', to: humanDate(ev.date) },
              { field: 'Время', from: '—', to: eventTime(ev) },
              { field: 'Повторение', from: '—', to: repeatLabel(ev) || 'нет' }
            ],
            undo: { type: 'remove', list: 'events', id: ev.id }
          });
          calSelected = ev.date;
          A.closeModal(); A.render(); A.toast('Событие добавлено · видно в Календаре, Дне и на Главной');
        }
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
