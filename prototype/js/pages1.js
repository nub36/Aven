/* Aven — Visual Prototype. Страницы: Главная, День, Календарь, Задачи, Заметки. Не production. */
(function () {
  const A = window.Aven, S = window.AvenState, D = window.AvenDemo.staticData;
  A.pages = A.pages || {};
  const s = () => S.s();

  /* ================= ГЛАВНАЯ ================= */
  A.pages.home = function () {
    const st = s();
    const cards = st.settings.homeCards;
    const todayTasks = st.tasks.filter((t) => t.date === 'today' && !t.done);
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
          <span>Следующее: <b>Стоматолог</b> · 10:00</span>
          <span class="pill accent">через 1 ч 24 мин</span>
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
        <div class="row-item"><span class="time">10:00</span><div class="grow"><div class="t">Стоматолог</div></div></div>
        <div class="row-item"><span class="time">14:00</span><div class="grow"><div class="t">Забрать посылку</div></div></div>
        <div class="row-item"><span class="time">19:00</span><div class="grow"><div class="t">Купить продукты</div></div></div>
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
  A.pages.day = function () {
    const items = D.day[dayTab] || [];
    const st = s();
    const dayTasks = st.tasks.filter((t) => dayTab === 'today' ? t.date === 'today' : dayTab === 'tomorrow' ? t.date === 'soon' : t.done);
    const html = `
    <div class="page-head">
      <div>
        <h1>День</h1>
        <div class="sub">Текущее время пользователя · демо</div>
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
        ${items.length ? `<div class="timeline">${items.map((i) => `
          <div class="tl-item ${i.type}">
            <div style="display:flex;gap:12px"><span class="time">${i.t}</span><div><b>${A.esc(i.n)}</b>
            <div class="s" style="color:var(--muted);font-size:.8rem">${i.type === 'task' ? 'задача' : i.type === 'done' ? 'выполнено' : 'событие'}</div></div></div>
          </div>`).join('')}</div>` : '<div class="empty">На этот день ничего не запланировано</div>'}
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
          </label>`).join('') : '<div class="empty">Нет задач</div>'}
        <h3 style="margin-top:18px">Выполненное</h3>
        ${st.tasks.filter((t) => t.done).map((t) => `
          <div class="row-item"><span class="time">✔</span><div class="grow"><div class="t" style="color:var(--muted)">${A.esc(t.title)}</div></div></div>`).join('') || '<div class="empty">Пока ничего</div>'}
      </div>
    </div>`;
    return { html, mount: (root) => { A.bindTabs(root.querySelector('#day-tabs'), (v) => { dayTab = v; A.render(); }); } };
  };

  /* ================= КАЛЕНДАРЬ ================= */
  let calOffset = 0;
  A.pages.calendar = function () {
    const now = new Date();
    const view = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
    const y = view.getFullYear(), m = view.getMonth();
    const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(view);
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Пн=0
    const daysIn = new Date(y, m + 1, 0).getDate();
    const daysPrev = new Date(y, m, 0).getDate();
    let cells = [];
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ d: daysPrev - i, other: true });
    for (let d = 1; d <= daysIn; d++) cells.push({ d, other: false });
    while (cells.length % 7 !== 0) cells.push({ d: cells.length, other: true, next: true });
    const today = now.getDate();
    const html = `
    <div class="page-head">
      <div><h1>Календарь</h1><div class="sub">Пользоваться можно без ассистента</div></div>
      <button class="btn primary" data-action="cal-add">＋ Событие</button>
    </div>
    <div class="card">
      <div class="cal-head">
        <button class="btn small" data-action="cal-prev">←</button>
        <b style="text-transform:capitalize">${A.esc(monthName)}</b>
        <button class="btn small" data-action="cal-next">→</button>
      </div>
      <div class="cal-grid">
        ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells.map((c) => {
          const evs = (!c.other && D.eventsByDay[c.d]) || [];
          const isToday = !c.other && c.d === today && calOffset === 0;
          return `<div class="cal-cell ${c.other ? 'other' : ''} ${isToday ? 'today' : ''}">
            <div class="cal-day-num">${c.d}</div>
            ${evs.map((e, i) => `<div class="cal-ev" data-action="cal-event" data-d="${c.d}" data-i="${i}" title="${A.esc(e.n)}">${A.esc(e.t)} ${A.esc(e.n)}</div>`).join('')}
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:12px;color:var(--muted);font-size:.82rem">Демо-события месяца · клик по событию открывает карточку</div>
    </div>`;
    return { html };
  };

  /* ================= ЗАДАЧИ ================= */
  let taskFilter = 'all';
  A.pages.tasks = function () {
    const st = s().tasks;
    const counts = {
      all: st.length,
      today: st.filter((t) => t.date === 'today' && !t.done).length,
      soon: st.filter((t) => t.date === 'soon' && !t.done).length,
      done: st.filter((t) => t.done).length
    };
    let list = st.slice();
    if (taskFilter === 'today') list = st.filter((t) => t.date === 'today' && !t.done);
    if (taskFilter === 'soon') list = st.filter((t) => t.date === 'soon' && !t.done);
    if (taskFilter === 'done') list = st.filter((t) => t.done);
    const prioPill = { 'высокий': 'danger', 'средний': 'warn', 'низкий': '' };
    const html = `
    <div class="page-head">
      <div><h1>Задачи</h1><div class="sub">Списки · проекты · приоритеты · демо</div></div>
      <button class="btn primary" data-action="task-add">＋ Новая задача</button>
    </div>
    <div class="tabs" id="task-tabs">
      <button class="tab ${taskFilter === 'all' ? 'active' : ''}" data-tab="all">Все <span class="cnt">${counts.all}</span></button>
      <button class="tab ${taskFilter === 'today' ? 'active' : ''}" data-tab="today">Сегодня <span class="cnt">${counts.today}</span></button>
      <button class="tab ${taskFilter === 'soon' ? 'active' : ''}" data-tab="soon">Предстоящие <span class="cnt">${counts.soon}</span></button>
      <button class="tab ${taskFilter === 'done' ? 'active' : ''}" data-tab="done">Выполненные <span class="cnt">${counts.done}</span></button>
    </div>
    <div class="card">
      ${list.length ? list.map((t) => `
      <label class="check-row ${t.done ? 'done' : ''}" data-action="toggle-task" data-id="${t.id}">
        <input type="checkbox" ${t.done ? 'checked' : ''}>
        <span class="label">
          <b>${A.esc(t.title)}</b>
          <span class="pill ${prioPill[t.prio] || ''}" style="margin-left:8px">${A.esc(t.prio)}</span>
          ${t.project ? `<span class="pill" style="margin-left:6px">${A.esc(t.project)}</span>` : ''}
          <div class="s">${A.esc(t.desc || '')} ${t.date === 'today' ? '· сегодня' : t.date === 'soon' ? '· предстоящая' : ''}</div>
        </span>
        <button class="btn small danger" data-action="task-del" data-id="${t.id}">Удалить</button>
      </label>`).join('') : '<div class="empty">Нет задач в этой категории</div>'}
    </div>`;
    return { html, mount: (root) => { A.bindTabs(root.querySelector('#task-tabs'), (v) => { taskFilter = v; A.render(); }); } };
  };

  /* ================= ЗАМЕТКИ ================= */
  let noteId = 'n1';
  A.pages.notes = function () {
    const st = s().notes;
    if (!st.find((n) => n.id === noteId) && st.length) noteId = st[0].id;
    const cur = st.find((n) => n.id === noteId);
    const sorted = st.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    const html = `
    <div class="page-head">
      <div><h1>Заметки</h1><div class="sub">Папки · теги · поиск · закрепление · демо</div></div>
      <button class="btn primary" data-action="note-add">＋ Заметка</button>
    </div>
    <div class="notes-layout">
      <div class="card">
        <input type="search" id="note-search" placeholder="Поиск заметок…" value="${A.esc(A._noteQuery || '')}">
        <div style="margin-top:10px">
          ${sorted.filter((n) => !A._noteQuery || (n.title + ' ' + n.body + ' ' + n.tags.join(' ')).toLowerCase().includes(A._noteQuery.toLowerCase())).map((n) => `
          <div class="note-li ${n.id === noteId ? 'active' : ''}" data-action="note-open" data-id="${n.id}">
            <div class="nt">${n.pinned ? '📌' : '📄'} ${A.esc(n.title)}</div>
            <div class="np">${A.esc(n.body.slice(0, 46))}…</div>
            <div class="tags" style="margin-top:5px">${n.tags.map((t) => `<span class="pill">${A.esc(t)}</span>`).join('')}</div>
          </div>`).join('') || '<div class="empty">Ничего не найдено</div>'}
        </div>
      </div>
      <div class="card">
        ${cur ? `
        <div class="head">
          <h3>${cur.pinned ? '📌 ' : ''}${A.esc(cur.title)}</h3>
          <div class="btn-row">
            <button class="btn small" data-action="note-pin" data-id="${cur.id}">${cur.pinned ? 'Снять закрепление' : 'Закрепить'}</button>
            <button class="btn small" data-action="note-edit" data-id="${cur.id}">Редактировать</button>
            <button class="btn small danger" data-action="note-del" data-id="${cur.id}">Удалить</button>
          </div>
        </div>
        <div class="s" style="color:var(--muted);font-size:.82rem;margin-bottom:12px">Обновлено: ${A.esc(cur.updated)} · связи с сущностями — в перспективе</div>
        <div class="tags" style="margin-bottom:14px">${cur.tags.map((t) => `<span class="pill accent">${A.esc(t)}</span>`).join('')}</div>
        <div class="note-body">${A.esc(cur.body)}</div>` : '<div class="empty">Выберите заметку</div>'}
      </div>
    </div>`;
    return {
      html,
      mount: (root) => {
        const inp = root.querySelector('#note-search');
        inp.addEventListener('input', () => { A._noteQuery = inp.value; rerenderNoteList(); });
        function rerenderNoteList() {
          const q = inp.value.toLowerCase();
          root.querySelectorAll('.note-li').forEach((li) => {
            const n = s().notes.find((x) => x.id === li.dataset.id);
            li.style.display = !q || (n.title + ' ' + n.body + ' ' + n.tags.join(' ')).toLowerCase().includes(q) ? '' : 'none';
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
    'quick-expense': () => expenseForm(),
    'quick-task': () => taskForm(),
    'quick-event': () => eventForm('Сегодня'),
    'quick-note': () => noteForm(),
    'quick-fuel': () => fuelForm(),

    'task-add': () => taskForm(),
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

    'day-add-event': () => eventForm(dayTab === 'yesterday' ? 'Вчера' : dayTab === 'today' ? 'Сегодня' : 'Завтра'),
    'day-add-task': () => taskForm(),

    'cal-prev': () => { calOffset--; A.render(); },
    'cal-next': () => { calOffset++; A.render(); },
    'cal-add': () => eventForm('Выберите день в календаре (демо: 25-е)'),
    'cal-event': (el) => {
      const d = D.eventsByDay[el.dataset.d][+el.dataset.i];
      A.openModal({
        title: 'Событие',
        body: `<div class="set-row"><div class="grow"><div class="t">${A.esc(d.n)}</div>
               <div class="s">Время: ${A.esc(d.t)}</div></div></div>
               <div class="set-row"><div class="grow"><div class="t">${el.dataset.d}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${new Date().getFullYear()}</div><div class="s">дата</div></div></div>
               <div class="set-row"><div class="grow"><div class="t">важность: обычная</div><div class="s">связанные сущности — в перспективе</div></div></div>`,
        submitText: null,
        cancelText: 'Закрыть'
      });
    },

    'note-open': (el) => { noteId = el.dataset.id; A.render(); },
    'note-add': () => noteForm(),
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
  function taskForm() {
    A.openModal({
      title: 'Новая задача',
      body: `
        <div class="field"><label>Название</label><input type="text" name="title" placeholder="Что нужно сделать?"></div>
        <div class="field"><label>Описание</label><textarea name="desc" style="min-height:60px"></textarea></div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date"></div>
          <div class="field"><label>Приоритет</label>
            <select name="prio"><option>низкий</option><option selected>средний</option><option>высокий</option></select></div>
        </div>
        <div class="field"><label>Проект</label>
          <select name="project"><option>Личное</option><option>Дом</option><option>Авто</option><option>Работа</option><option>Здоровье</option><option>Покупки</option></select></div>`,
      onSubmit: (v) => {
        const st = S.s();
        const t = { id: S.id('t'), title: v.title || 'Без названия', desc: v.desc, date: v.date === todayISO() ? 'today' : 'soon', prio: v.prio, project: v.project, done: false };
        st.tasks.unshift(t);
        S.save();
        A.logAction({
          action: 'task.create', title: 'Задача создана', object: t.title, objectType: 'task', undoable: true,
          changes: [
            { field: 'Название', from: '—', to: t.title },
            { field: 'Приоритет', from: '—', to: t.prio },
            { field: 'Проект', from: '—', to: t.project },
            { field: 'Срок', from: '—', to: v.date || 'не указан' }
          ],
          undo: { type: 'remove', list: 'tasks', id: t.id }
        });
        A.closeModal(); A.render(); A.toast('Задача добавлена · запись в истории, можно отменить');
      }
    });
  }

  function eventForm(dayLabel) {
    A.openModal({
      title: 'Новое событие',
      body: `
        <div class="field"><label>Название</label><input type="text" name="title" placeholder="Например: встреча"></div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date"></div>
          <div class="field"><label>Время</label><input type="time" name="time" value="12:00"></div>
        </div>
        <div class="field"><label>Важность</label><select name="prio"><option>обычное</option><option>важное</option><option>критическое (насколько позволяет платформа)</option></select></div>
        <div class="s" style="color:var(--muted);font-size:.8rem">Демо: день — ${A.esc(dayLabel || 'Сегодня')}</div>`,
      onSubmit: (v) => {
        /* Честно (ADR-010): события в прототипе пока не сохраняются — календарь и «День» работают на
           статичном демо-наборе (data.js → eventsByDay/day). Реальное создание с повторениями,
           пересечением по времени и Undo — следующая задача по MVP_SCOPE §5.4. */
        A.closeModal();
        A.toast('Демо: событие «' + (v.title || 'Без названия') + '» НЕ сохранено — раздел событий в прототипе ещё на статичных данных (MVP_SCOPE §5.4)');
      }
    });
  }

  function noteForm(existing) {
    A.openModal({
      title: existing ? 'Редактировать заметку' : 'Новая заметка',
      body: `
        <div class="field"><label>Название</label><input type="text" name="title" value="${A.esc(existing ? existing.title : '')}"></div>
        <div class="field"><label>Теги (через запятую)</label><input type="text" name="tags" value="${A.esc(existing ? existing.tags.join(', ') : '')}"></div>
        <div class="field"><label>Текст</label><textarea name="body">${A.esc(existing ? existing.body : '')}</textarea></div>`,
      onSubmit: (v) => {
        const st = S.s();
        const tags = v.tags.split(',').map((x) => x.trim()).filter(Boolean);
        if (existing) {
          const prev = { title: existing.title, tags: existing.tags.slice(), body: existing.body, updated: existing.updated };
          existing.title = v.title || existing.title;
          existing.tags = tags;
          existing.body = v.body;
          existing.updated = 'только что';
          S.save();
          const changes = [];
          if (prev.title !== existing.title) changes.push({ field: 'Заголовок', from: prev.title, to: existing.title });
          if (prev.tags.join(', ') !== tags.join(', ')) changes.push({ field: 'Теги', from: prev.tags.join(', ') || '—', to: tags.join(', ') || '—' });
          if (prev.body !== existing.body) changes.push({ field: 'Текст', from: prev.body ? prev.body.slice(0, 60) + (prev.body.length > 60 ? '…' : '') : '—', to: existing.body ? existing.body.slice(0, 60) + (existing.body.length > 60 ? '…' : '') : '—' });
          A.logAction({
            action: 'note.update', title: 'Заметка изменена', object: existing.title, objectType: 'note',
            undoable: true, sensitive: true, changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: { type: 'fields', list: 'notes', id: existing.id, fields: prev }
          });
          A.closeModal(); A.render(); A.toast('Заметка сохранена · запись в истории');
        } else {
          const n = { id: S.id('n'), title: v.title || 'Без названия', tags: tags, body: v.body, pinned: false, updated: 'только что' };
          st.notes.unshift(n);
          noteId = n.id;
          S.save();
          A.logAction({
            action: 'note.create', title: 'Заметка создана', object: n.title, objectType: 'note',
            undoable: true, sensitive: true,
            changes: [{ field: 'Заголовок', from: '—', to: n.title }, { field: 'Теги', from: '—', to: tags.join(', ') || '—' }],
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

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // экспорт для других страниц (быстрые действия Авто)
  A.fuelForm = fuelForm;
})();
