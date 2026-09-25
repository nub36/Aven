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
      { id: 'assistant', icon: '🤖', label: 'Aven Assistant' },
      { id: 'automation', icon: '⚡', label: 'Автоматизации' }
    ]},
    { group: null, bottom: true, items: [
      { id: 'settings', icon: '⚙️', label: 'Настройки' },
      { id: 'profile', icon: '👤', label: 'Профиль' }
    ]}
  ];

  const TITLES = {
    home: 'Главная', day: 'День', calendar: 'Календарь', tasks: 'Задачи', notes: 'Заметки',
    finance: 'Финансы', auto: 'Авто', shopping: 'Покупки / Имущество', tools: 'Инструменты',
    assistant: 'Aven Assistant', automation: 'Автоматизации', settings: 'Настройки', profile: 'Профиль'
  };

  function route() {
    const h = (location.hash || '#/home').replace(/^#\//, '');
    return A.pages[h] ? h : 'home';
  }

  function buildSidebar(current) {
    const mods = S.s().settings.modules;
    let html = `
      <div class="side-logo"><div class="logo-mark">A</div><span>Aven <span style="color:var(--muted);font-size:.7rem;font-weight:500">prototype</span></span></div>
      <div class="side-scroll">`;
    NAV.forEach((g) => {
      if (g.group) html += `<div class="side-group">${g.group}</div>`;
      g.items.forEach((it) => {
        if (it.mod && mods[it.mod] === false) return; // модуль выключен в настройках
        html += `<button class="nav-item ${current === it.id ? 'active' : ''}" data-action="nav" data-id="${it.id}">
                   <span class="ico">${it.icon}</span>${it.label}</button>`;
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

  A.applyEnv = function () {
    const st = S.s();
    document.documentElement.setAttribute('data-theme', st.settings.theme === 'dark' ? 'dark' : 'light');
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
    main.innerHTML = out.html;
    if (window.AvenPresence) { try { window.AvenPresence.apply(); } catch (e) { /* демо */ } }
    document.getElementById('sidebar').innerHTML = buildSidebar(cur);
    document.getElementById('page-title').textContent = TITLES[cur] || 'Aven';
    document.getElementById('theme-btn').textContent = S.s().settings.theme === 'dark' ? '☀️' : '🌙';
    document.body.classList.toggle('assistant-mode', cur === 'assistant');
    if (out.mount) { try { out.mount(main); } catch (e) { console.error(e); } }
    if (window.AvenChar) { try { window.AvenChar.mountFloat(); } catch (e) { console.error(e); } }
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
      st.settings.theme = st.settings.theme === 'dark' ? 'light' : 'dark';
      S.save();
      A.applyEnv();
      A.render();
    },
    'go-profile': () => { location.hash = '#/profile'; }
  });

  window.addEventListener('hashchange', () => {
    if (route() !== 'assistant') A._chat = A._chat; // история чата сохраняется в рамках сессии
    A.render();
  });

  /* первый запуск */
  A.applyEnv();
  if (!location.hash) location.hash = '#/home';
  A.render();
  if (window.AvenChar) window.AvenChar.showGreeting();
})();
