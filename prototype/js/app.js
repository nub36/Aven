/* Aven — Visual Prototype. Роутер, меню, тема, запуск. Не production. */
(function () {
  const A = window.Aven, S = window.AvenState;

  /* порядок и содержимое меню */
  const NAV = [
    { group: null, items: [
      { id: 'home', icon: '🏠', label: 'Главная' },
      { id: 'day', icon: '🌤️', label: 'День' },
      { id: 'morning', icon: '🌅', label: 'Утренний обзор' },
      { id: 'evening', icon: '🌙', label: 'Итоги дня' },
      { id: 'notifications', icon: '🔔', label: 'Уведомления' },
      { id: 'calendar', icon: '📅', label: 'Календарь', mod: 'calendar' },
      { id: 'tasks', icon: '✅', label: 'Задачи', mod: 'tasks' },
      { id: 'notes', icon: '📝', label: 'Заметки', mod: 'notes' },
      { id: 'finance', icon: '💰', label: 'Финансы', mod: 'finance' },
      { id: 'auto', icon: '🚗', label: 'Авто', mod: 'auto' },
      { id: 'shopping', icon: '🛍️', label: 'Покупки', mod: 'shopping' },
      { id: 'tools', icon: '🧰', label: 'Инструменты', mod: 'tools' },
      { id: 'help', icon: '❓', label: 'Помощь' }
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
    home: 'Главная', day: 'День', morning: 'Утренний обзор', evening: 'Итоги дня', notifications: 'Уведомления', calendar: 'Календарь', tasks: 'Задачи', notes: 'Заметки',
    finance: 'Финансы', auto: 'Авто', shopping: 'Покупки / Имущество', tools: 'Инструменты', help: 'Помощь',
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
      <div class="side-logo"><div class="logo-mark">A</div><span>Aven <span style="color:var(--muted);font-size:.7rem;font-weight:500">prototype</span></span><button class="icon-btn nav-close" data-action="menu-close" aria-label="Закрыть навигацию">✕</button></div>
      <div class="side-scroll">`;
    NAV.forEach((g) => {
      if (g.bottom) return; // нижняя группа рисуется отдельно, в .side-bottom
      if (g.group) html += `<div class="side-group">${g.group}</div>`;
      g.items.forEach((it) => {
        if (it.mod && mods[it.mod] === false) return; // модуль выключен в настройках
        html += `<button class="nav-item ${current === it.id ? 'active' : ''}" data-action="nav" data-id="${it.id}" data-tour="nav-${it.id}"
                   ${it.stage ? `title="Не входит в срез Stage 1.0 — ${A.esc(it.stage)} (docs/MVP_SCOPE.md §4.3)"` : ''}>
                   <span class="ico">${it.icon}</span>${it.label}${it.stage ? `<span class="stage-badge later">${A.esc(it.stage)}</span>` : ''}</button>`;
      });
    });
    html += `</div><div class="side-bottom">`;
    // CTA скачивания Android-приложения: не маршрут — открывает модальное окно (ADR-114)
    html += `<button class="nav-item nav-android" data-action="android-download" data-id="android-download" data-tour="nav-android" title="Установить Aven на Android (APK)">
               <span class="ico">📱</span>Скачать приложение</button>`;
    NAV.find((g) => g.bottom).items.forEach((it) => {
      html += `<button class="nav-item ${current === it.id ? 'active' : ''}" data-action="nav" data-id="${it.id}" data-tour="nav-${it.id}">
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
    /* Route/render cleanup must use the same path as an explicit drawer close:
       no stale scroll lock, inert content or invisible touch-blocking backdrop. */
    setMobileMenu(false, { restoreFocus: false });
    main.innerHTML = out.html;
    if (window.AvenPresence) { try { window.AvenPresence.apply(); } catch (e) { /* демо */ } }
    if (!authMode) document.getElementById('sidebar').innerHTML = buildSidebar(cur);
    document.getElementById('page-title').textContent = TITLES[cur] || 'Aven';
    document.getElementById('theme-btn').textContent = A.resolvedTheme() === 'dark' ? '☀️' : '🌙';
    if (out.mount) { try { out.mount(main); } catch (e) { console.error(e); } }
    if (window.AvenChar && !authMode) { try { window.AvenChar.mountFloat(); } catch (e) { console.error(e); } }
    A.updateNotifBadge(authMode);
    window.scrollTo(0, 0);
  };

  /* Счётчик непрочитанных уведомлений на «колокольчике» в топбаре. */
  A.updateNotifBadge = function (authMode) {
    const btn = document.getElementById('notif-btn');
    const badge = document.getElementById('notif-badge');
    if (!btn || !badge) return;
    if (authMode) { btn.hidden = true; return; }
    btn.hidden = false;
    let n = 0;
    try { n = window.AvenNotify ? window.AvenNotify.unreadCount() : 0; } catch (e) { n = 0; }
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = n > 99 ? '99+' : String(n);
      btn.setAttribute('aria-label', 'Уведомления: ' + n + ' непрочитанных');
    } else {
      badge.hidden = true;
      btn.setAttribute('aria-label', 'Уведомления: непрочитанных нет');
    }
  };

  /* делегирование кликов по data-action */
  /* Делегирование действий.
     Важно: чекбоксы и радиокнопки обрабатываются ТОЛЬКО событием change (ниже).
     В браузере клик по <label> с чекбоксом порождает два click-события — по самой метке и
     синтетическое по чекбоксу, — из-за чего действие выполнялось бы дважды (задача «отмечалась»
     и тут же «размечалась», а в истории появлялись две записи). Событие change приходит ровно один
     раз независимо от того, кликнули по чекбоксу или по подписи рядом с ним. */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return; // контролы — только change/input
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;  // по клику не трогаем: только change
    if (el.tagName === 'LABEL' && el.querySelector('input[type="checkbox"],input[type="radio"]')) return;
    const raw = el.dataset.action;
    const name = raw.split(':')[0];
    if (A.actions[name]) {
      if (el.tagName === 'A') e.preventDefault();
      A.actions[name](el, e);
    }
  });

  /* тогглы-переключатели (switch), чекбоксы действий и выпадающие списки */
  document.addEventListener('change', (e) => {
    const t = e.target;
    const el = t.closest('[data-action]');   // у чекбокса задачи data-action на <label>, у переключателя — на самом input
    if (!el) return;
    const isControl = el.tagName === 'INPUT' || el.tagName === 'SELECT';
    const isLabeledBox = el.tagName === 'LABEL' && (t.type === 'checkbox' || t.type === 'radio');
    const isAncestorBox = (t.type === 'checkbox' || t.type === 'radio');
    if (!isControl && !isLabeledBox && !isAncestorBox) return;
    const name = el.dataset.action.split(':')[0];
    if (A.actions[name]) A.actions[name](el, e);
  });

  /* кнопки топбара и навигация */
  function setMobileMenu(open, opts) {
    open = !!open;
    opts = opts || {};
    const body = document.body;
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('.main');
    const btn = document.getElementById('mobile-menu-btn');
    body.classList.toggle('nav-open', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    const mobile = !window.matchMedia || window.matchMedia('(max-width: 860px)').matches;
    if (sidebar) sidebar.setAttribute('aria-hidden', mobile && !open ? 'true' : 'false');
    if (main) {
      if (open) { main.setAttribute('inert', ''); main.setAttribute('aria-hidden', 'true'); }
      else { main.removeAttribute('inert'); main.removeAttribute('aria-hidden'); }
    }
    if (open) {
      const first = document.querySelector('#sidebar .nav-item.active') || document.querySelector('#sidebar .nav-item');
      try { first && first.focus(); } catch (e) { /* noop */ }
    } else if (opts.restoreFocus !== false) {
      try { btn && btn.focus(); } catch (e) { /* noop */ }
    }
  }

  /* -------- CTA скачивания Android-приложения (ADR-114) --------
     Кнопка топбара (desktop) и пункт drawer открывают одно модальное окно: что скачивается
     (APK, версия, размер, канал), ручная установка вне Google Play, честная мини-инструкция
     по «неизвестному источнику». Конфиг — prototype/js/app-download.js. */
  function openAndroidDownloadModal() {
    const d = window.AvenAppDownload || {};
    const esc = A.esc;
    A.openModal({
      title: 'Aven для Android',
      body:
        `<div class="field"><label>Что это</label><div class="tts-norm">Тот же Aven, упакованный как приложение для Android · ${esc(d.channel || 'GitHub Releases')}</div></div>` +
        `<div class="field"><label>Скачивается</label><div class="tts-norm">${esc(d.apkFile || 'aven.apk')} · версия ${esc(d.version || '?')} · ${esc(d.sizeHint || '')} · ${esc(d.minAndroid || '')}</div></div>` +
        `<div class="field"><label>Как установить</label><div class="s" style="line-height:1.55">1. Нажмите «Скачать APK».<br>2. Откройте скачанный файл.<br>3. Android может спросить разрешение на установку из этого источника — оно относится к вашему браузеру или файловому менеджеру, подтвердите один раз.<br>4. Нажмите «Установить» — появится иконка Aven.<br>5. После установки разрешение на установку из источника можно снова выключить (глобально безопасность Android отключать не нужно).<br>6. Данные приложения хранятся на устройстве; обновления — повторным скачиванием с этой кнопки.</div></div>` +
        `<div class="tts-priv"><span class="pill">без Google Play</span><span>Ручная установка APK · подпись релизным ключом проекта · страница релизов: <a href="${esc(d.releasePage || '#')}" target="_blank" rel="noopener">GitHub Releases ↗</a></span></div>`,
      cancelText: 'Закрыть',
      submitText: '⬇ Скачать APK',
      onSubmit: () => {
        if (d.apkUrl) window.open(d.apkUrl, '_blank', 'noopener');
        A.closeModal();
        A.toast('Скачивание ' + (d.apkFile || 'APK') + ' открыто — после загрузки откройте файл для установки');
      }
    });
  }

  A.register({
    'nav': (el) => { setMobileMenu(false); location.hash = '#/' + el.dataset.id; },
    'menu-toggle': () => setMobileMenu(!document.body.classList.contains('nav-open')),
    'menu-close': () => setMobileMenu(false),
    'android-download': () => { setMobileMenu(false); openAndroidDownloadModal(); },
    'theme-toggle': () => {
      // переключение задаёт явную тему ( light ⇄ dark ), уходя от «как в системе»;
      // запись идёт тем же путём, что и в Настройках — с историей и Undo
      window.AvenActions.settings.set('settings.theme', A.resolvedTheme() === 'dark' ? 'light' : 'dark');
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('nav-open')) setMobileMenu(false);
  });

  window.addEventListener('hashchange', () => {
    /* Незавершённое уточнение/подтверждение — не business state и не скрытая память:
       при уходе из Assistant оно исчезает, обычная история чата с ответами остаётся. */
    if (route() !== 'assistant' && A._commandSession) A._commandSession.reset();
    setMobileMenu(false, { restoreFocus: false });
    if (A.closeModal) A.closeModal({ restoreFocus: false });
    A.render();
  });
  window.addEventListener('resize', () => {
    if (window.matchMedia && !window.matchMedia('(max-width: 860px)').matches) {
      setMobileMenu(false, { restoreFocus: false });
    }
  });

  /* первый запуск */
  A.applyEnv();
  if (!location.hash) location.hash = '#/home';
  A.render();
  if (window.AvenChar && !A.isAuthRoute(route())) window.AvenChar.showGreeting();
})();
