/* Aven — Visual Prototype. Роутер, меню, тема, запуск. Не production. */
(function () {
  const A = window.Aven, S = window.AvenState;

  /* порядок и содержимое меню */
  const NAV = [
    { group: null, items: [
      { id: 'home', icon: '🏠', label: 'Главная' },
      { id: 'day', icon: '🌤️', label: 'День' },
      { id: 'calendar', icon: '📅', label: 'Календарь', mod: 'calendar' },
      { id: 'tasks', icon: '✅', label: 'Задачи', mod: 'tasks' },
      { id: 'notes', icon: '📝', label: 'Заметки', mod: 'notes' },
      { id: 'finance', icon: '💰', label: 'Финансы', mod: 'finance' },
      { id: 'auto', icon: '🚗', label: 'Авто', mod: 'auto' },
      { id: 'shopping', icon: '🛍️', label: 'Покупки', mod: 'shopping' },
      { id: 'tools', icon: '🧰', label: 'Инструменты', mod: 'tools' }
    ]},
    { group: 'Ассистент и автоматизации', items: [
      { id: 'assistant', icon: '🤖', label: 'Aven Assistant', stage: 'Stage 2' },
      { id: 'automation', icon: '⚡', label: 'Автоматизации', stage: 'Stage 4' }
    ]},
    /* система: сквозной слой 1.0 и административная область (ADR-012 — отдельно от /settings) */
    { group: 'Система', items: [
      { id: 'history', icon: '🕘', label: 'История' },
      { id: 'admin', icon: '🛡️', label: 'Админка' }
    ]},
    { group: null, bottom: true, items: [
      { id: 'settings', icon: '⚙️', label: 'Настройки' },
      { id: 'profile', icon: '👤', label: 'Профиль' }
    ]}
  ];

  const TITLES = {
    home: 'Главная', day: 'День', calendar: 'Календарь', tasks: 'Задачи', notes: 'Заметки',
    finance: 'Финансы', auto: 'Авто', shopping: 'Покупки / Имущество', tools: 'Инструменты',
    assistant: 'Aven Assistant', automation: 'Автоматизации', settings: 'Настройки', profile: 'Профиль',
    history: 'История действий', admin: 'Админка',
    login: 'Вход', register: 'Регистрация', recovery: 'Восстановление доступа'
  };

  /* экраны аккаунта рисуются без сайдбара и топбара (body.auth-mode) */
  const AUTH = { login: 1, register: 1, recovery: 1 };
  A.isAuthRoute = (id) => !!AUTH[id];

  function route() {
    const h = (location.hash || '#/home').replace(/^#\//, '');
    const known = A.pages[h] ? h : 'home';
    const st = S.s();
    const logged = !st.auth || st.auth.logged !== false;
    if (logged) return known;                     // залогиненному доступны все экраны, включая вход (демо-просмотр)
    return AUTH[known] ? known : 'login';         // не залогинен — только экраны аккаунта
  }

  function buildSidebar(current) {
    const mods = S.s().settings.modules;
    let html = `
      <div class="side-logo"><div class="logo-mark">A</div><span>Aven <span style="color:var(--muted);font-size:.7rem;font-weight:500">prototype</span></span></div>
      <div class="side-scroll">`;
    NAV.forEach((g) => {
      if (g.bottom) return; // нижняя группа рисуется отдельно, в .side-bottom
      if (g.group) html += `<div class="side-group">${g.group}</div>`;
      g.items.forEach((it) => {
        if (it.mod && mods[it.mod] === false) return; // модуль выключен в настройках
        html += `<button class="nav-item ${current === it.id ? 'active' : ''}" data-action="nav" data-id="${it.id}"
                   ${it.stage ? `title="Не входит в срез Stage 1.0 — ${A.esc(it.stage)} (docs/MVP_SCOPE.md §4.3)"` : ''}>
                   <span class="ico">${it.icon}</span>${it.label}${it.stage ? `<span class="stage-badge later">${A.esc(it.stage)}</span>` : ''}</button>`;
      });
    });
    html += `</div><div class="side-bottom">`;
    NAV.find((g) => g.bottom).items.forEach((it) => {
      html += `<button class="nav-item ${current === it.id ? 'active' : ''}" data-action="nav" data-id="${it.id}">
                 <span class="ico">${it.icon}</span>${it.label}</button>`;
    });
    html += `</div>`;
    return html;
  }

  /* фактическая тема с учётом значения 'system' (вопрос №32: следование настройке ОС) */
  A.resolvedTheme = function () {
    const st = S.s();
    const t = st.settings.theme;
    if (t === 'system' || t === 'auto') {
      try {
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      } catch (e) { return 'light'; }
    }
    return t === 'dark' ? 'dark' : 'light';
  };

  A.applyEnv = function () {
    const st = S.s();
    const dark = A.resolvedTheme() === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('reduce-motion', !!st.settings.reduceMotion);
    document.documentElement.classList.toggle('text-sm', st.settings.textSize === 'sm');
    document.documentElement.classList.toggle('text-lg', st.settings.textSize === 'lg');
  };

  A.render = function () {
    const cur = route();
    const main = document.getElementById('page');
    const page = A.pages[cur] || A.pages.home;
    let out;
    try { out = page(); }
    catch (e) {
      main.innerHTML = '<div class="card"><div class="empty">Ошибка отрисовки страницы (демо): ' + A.esc(e.message) + '</div></div>';
      console.error(e);
      return;
    }
    const authMode = !!AUTH[cur];
    document.body.classList.toggle('auth-mode', authMode);
    document.body.classList.toggle('assistant-mode', !authMode && cur === 'assistant');
    main.innerHTML = out.html;
    if (window.AvenPresence) { try { window.AvenPresence.apply(); } catch (e) { /* демо */ } }
    if (!authMode) document.getElementById('sidebar').innerHTML = buildSidebar(cur);
    document.getElementById('page-title').textContent = TITLES[cur] || 'Aven';
    document.getElementById('theme-btn').textContent = A.resolvedTheme() === 'dark' ? '☀️' : '🌙';
    if (out.mount) { try { out.mount(main); } catch (e) { console.error(e); } }
    if (window.AvenChar && !authMode) { try { window.AvenChar.mountFloat(); } catch (e) { console.error(e); } }
    window.scrollTo(0, 0);
  };

  /* делегирование кликов по data-action */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
      // чекбокс-тогглы обрабатываются своим событием change ниже;
      // здесь — только "действия-чекбоксы" (например toggle-task)
      const name = el.dataset.action.split(':')[0];
      if (name === 'toggle-task') { A.act(name, el, e); }
      return;
    }
    if (el.tagName === 'INPUT') return; // инпуты без действий не трогаем
    if (el.tagName === 'SELECT') return; // выпадающие списки — по событию change (ниже), не по клику при открытии
    const raw = el.dataset.action;
    const name = raw.split(':')[0];
    if (A.actions[name]) {
      if (el.tagName === 'A') e.preventDefault();
      A.actions[name](el, e);
    }
  });

  /* тогглы-переключатели (switch) и чекбоксы действий */
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'SELECT')) return;
    const raw = el.dataset.action;
    if (raw === 'toggle-task') return; // уже обработан кликом
    const name = raw.split(':')[0];
    if (A.actions[name]) A.actions[name](el, e);
  });

  /* кнопки топбара и навигация */
  A.register({
    'nav': (el) => { location.hash = '#/' + el.dataset.id; },
    'theme-toggle': () => {
      const st = S.s();
      // переключение задаёт явную тему ( light ⇄ dark ), уходя от «как в системе»
      st.settings.theme = A.resolvedTheme() === 'dark' ? 'light' : 'dark';
      S.save();
      A.applyEnv();
      A.render();
    },
    'go-profile': () => { location.hash = '#/profile'; }
  });

  try {
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onSys = () => { const t = S.s().settings.theme; if (t === 'system' || t === 'auto') { A.applyEnv(); A.render(); } };
      if (mq.addEventListener) mq.addEventListener('change', onSys);
      else if (mq.addListener) mq.addListener(onSys);
    }
  } catch (e) { /* демо: matchMedia может отсутствовать */ }

  window.addEventListener('hashchange', () => {
    if (route() !== 'assistant') A._chat = A._chat; // история чата сохраняется в рамках сессии
    A.render();
  });

  /* первый запуск */
  A.applyEnv();
  if (!location.hash) location.hash = '#/home';
  A.render();
  if (window.AvenChar && !A.isAuthRoute(route())) window.AvenChar.showGreeting();
})();
