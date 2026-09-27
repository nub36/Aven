/* Aven — Visual Prototype. Help Center + contextual help hooks.
   Локальный справочник по фактически существующим возможностям прототипа.
   Не AI-search, не Command Engine, не новая voice infrastructure. */
window.AvenHelp = (function () {
  const A = window.Aven;
  const S = window.AvenState;
  A.pages = A.pages || {};
  let query = '';
  let category = 'start';

  const cats = [
    ['start', 'Начало работы', '🚀'],
    ['home', 'Главная', '🏠'],
    ['tasks', 'Задачи', '✅'],
    ['calendar', 'Календарь', '📅'],
    ['day', 'День', '🌤️'],
    ['commands', 'Команды Aven', '⌘'],
    ['voice', 'Голос', '🔊'],
    ['faq', 'FAQ', '❓'],
    ['accessibility', 'Клавиатура и доступность', '♿'],
    ['troubleshooting', 'Типичные проблемы', '🧭']
  ];
  const catLabel = (id) => (cats.filter((c) => c[0] === id)[0] || [id, id, '•']);

  const articles = [
    { id: 'start-overview', cat: 'start', title: 'Что такое Aven в этом прототипе', keywords: 'старт прототип сайт помощник данные',
      summary: 'Aven — персональный цифровой помощник и сайт для дел, календаря, задач, заметок, финансов и связанных данных.',
      body: 'Это UX-прототип: данные demo/localStorage, без backend и production API. Сайт полезен мышью, клавиатурой, формами и кнопками; голос и Assistant — дополнительный слой, а не единственный способ управления.' },
    { id: 'start-safe', cat: 'start', title: 'Что уже работает и что честно ограничено', keywords: 'ограничения backend localStorage production',
      summary: 'Разделы сохраняют demo-state локально, а опасные изменения пишутся в History/Undo.',
      body: 'Задачи, события, заметки, финансы, авто и покупки работают в рамках demo-state. Production backend, синхронизация, настоящий email, полноценный NLP Command Engine и фоновые уведомления ещё не реализованы.' },
    { id: 'home-cards', cat: 'home', title: 'Главная: summary blocks из общих данных', keywords: 'главная карточки сегодня задачи расходы авто гарантии заметки история',
      summary: 'Главная показывает ближайшие события, задачи, расходы, авто, гарантии, заметки и последние действия из единого состояния.',
      body: 'Карточки не являются отдельной копией данных. Если создать событие в календаре или выполнить задачу в разделе «День», это отразится на Главной после рендера.' },
    { id: 'home-command', cat: 'home', title: 'Command bar «Чем помочь?»', keywords: 'command bar чем помочь микрофон assistant',
      summary: 'Главный ввод отправляет текст в demo Assistant routes и поддерживает микрофон, если браузер позволяет.',
      body: 'Command bar не является полноценным NLP engine. Он передаёт фразы в существующий демо Assistant / flows. Кнопка микрофона использует экспериментальный SpeechRecognition, когда он доступен в браузере.' },
    { id: 'tasks-basics', cat: 'tasks', title: 'Задачи: создать, выполнить, вернуть', keywords: 'задачи создать выполнить вернуть complete reopen',
      summary: 'Задачи создаются и меняются через Common Action Layer.',
      body: 'Форма задачи содержит название, описание, дату, время, дедлайн, приоритет, проект и теги. Чекбокс выполняет задачу; выполненную задачу можно вернуть. Эти действия пишутся в History и поддерживают Undo.' },
    { id: 'tasks-filters', cat: 'tasks', title: 'Задачи: фильтры, поиск, archive/delete', keywords: 'фильтр поиск priority tag archive delete undo',
      summary: 'Фильтры не меняют данные, а delete/archive меняют данные и пишутся в историю.',
      body: 'Вкладки активные/сегодня/предстоящие/просроченные/выполненные/архив помогают быстро найти нужное. Удаление требует подтверждения и может быть отменено через History/Undo.' },
    { id: 'calendar-views', cat: 'calendar', title: 'Календарь: Month, Agenda, Week, Day', keywords: 'календарь month agenda week day событие',
      summary: 'Все виды календаря читают один event state.',
      body: 'Month удобен для общего обзора, Agenda показывает ближайшие события списком, Week и Day помогают сфокусироваться на выбранной дате. Создание/редактирование/удаление проходят через event.* actions.' },
    { id: 'calendar-reminders', cat: 'calendar', title: 'Reminder metadata в событиях', keywords: 'reminder metadata уведомления браузер закрыт',
      summary: 'Напоминания сохраняются как metadata и не обещают доставку при закрытом браузере.',
      body: 'В прототипе можно указать reminder для события, но это только данные для будущего уведомителя. Web-страница без отдельного фонового механизма не гарантирует уведомления, если браузер закрыт.' },
    { id: 'day-workcenter', cat: 'day', title: 'День: выбранная дата и общий work center', keywords: 'день дата вчера сегодня завтра datepicker timeline',
      summary: 'Раздел «День» объединяет задачи, события, overdue, completed и next event для выбранной даты.',
      body: 'Можно переключаться между вчера/сегодня/завтра или выбрать дату вручную. Созданные в «Дне» задачи и события появляются в «Задачах» и «Календаре», потому что используют общий state.' },
    { id: 'commands-current', cat: 'commands', title: 'Какие команды сейчас действительно есть', keywords: 'команды assistant flows demo NLP',
      summary: 'Сейчас есть demo-routes и flows, а не полноценный Command Engine.',
      body: 'Assistant умеет простые фразы вроде «Что у меня сегодня/завтра?» и «Просроченные задачи?», а также demo-flow «Заправился» и «Важное событие». Полноценный Text Command Engine с intents/confidence — Stage 2.' },
    { id: 'voice-current', cat: 'voice', title: 'Голосовые возможности в прототипе', keywords: 'voice TTS STT Natural System микрофон',
      summary: 'Голос — дополнительный интерфейс: text всегда остаётся основным и доступным.',
      body: 'Aven может озвучивать ответы через существующий TTS frontend interface: System TTS или Natural Voice, если настроен сервер. STT через браузерный SpeechRecognition экспериментален и зависит от браузера. Help/tutorial narration не меняет TTS infrastructure.' },
    { id: 'faq-data', cat: 'faq', title: 'Где хранятся данные прототипа?', keywords: 'faq localStorage reset данные',
      summary: 'В localStorage браузера под ключом aven-proto-v1.',
      body: 'Это demo-state. Его можно сбросить в Настройки → Приватность → «Сбросить демо-данные» или очистить localStorage вручную.' },
    { id: 'faq-ai', cat: 'faq', title: 'Это уже AI assistant?', keywords: 'faq AI assistant command engine',
      summary: 'Нет: прототип не использует AI как ядро и не имитирует готовый NLP.',
      body: 'Сейчас это UX-прототип сайта и связанных данных. AI/NLP может появиться позже как слой над теми же actions, но не является готовой функцией этого этапа.' },
    { id: 'a11y-keyboard', cat: 'accessibility', title: 'Клавиатура и фокус', keywords: 'keyboard focus escape tab доступность',
      summary: 'Основные действия доступны кнопками и формами, а overlay/tutorial закрывается Escape.',
      body: 'Используйте Tab/Shift+Tab для перехода по контролам. Модальные окна и tutorial имеют кнопки закрытия. Декоративные движения отключаются настройкой reduce motion и media query prefers-reduced-motion.' },
    { id: 'trouble-mobile', cat: 'troubleshooting', title: 'Если интерфейс тесный на телефоне', keywords: 'mobile responsive viewport hamburger overflow',
      summary: 'На телефоне используйте меню ☰: все разделы доступны в выезжающей навигации.',
      body: 'Desktop sidebar не сжимается бесконечно. На узких экранах Aven показывает compact header и drawer navigation, чтобы не создавать горизонтальное переполнение body.' },
    { id: 'trouble-tts', cat: 'troubleshooting', title: 'Если голос не звучит', keywords: 'tts voice unavailable fallback stop',
      summary: 'Текст всегда остаётся видимым, а TTS failure не блокирует работу.',
      body: 'Проверьте Настройки → Голос. Если Natural Voice недоступен, существующий TTS manager честно fallback-ит на системный голос или показывает причину. Tutorial продолжает работать текстом.' }
  ];

  function normalized(v) { return String(v || '').toLowerCase().replace(/ё/g, 'е'); }
  function articleText(a) { return [a.title, a.keywords, a.summary, a.body].join(' '); }
  function filtered() {
    const q = normalized(query.trim());
    let items = articles.slice();
    if (!q && category !== 'all') items = items.filter((a) => a.cat === category);
    if (q) items = items.filter((a) => normalized(articleText(a)).indexOf(q) >= 0);
    return items;
  }
  function openTopic(topic) {
    category = topic || 'start';
    query = '';
    if ((location.hash || '').replace(/^#\//, '') !== 'help') location.hash = '#/help';
    else A.render();
  }
  function speak(text) {
    try {
      if (window.AvenVoice && window.AvenVoice.speak) return window.AvenVoice.speak(text, null);
    } catch (e) { /* help voice is optional */ }
    A.toast('Голос сейчас недоступен — текст справки остаётся на экране');
    return false;
  }

  function resultsHtml() {
    const items = filtered();
    return `
        <div class="card help-intro">
          <h3>${A.esc(catLabel(category)[1] || 'Все материалы')}</h3>
          <p>Справка описывает только фактически существующие возможности прототипа. Будущий NLP Command Engine, production backend и фоновые уведомления не выдаются за готовые функции.</p>
        </div>
        ${items.length ? items.map((a) => `
          <article class="card help-article" data-help-id="${A.esc(a.id)}">
            <div class="help-article-top"><span class="pill accent">${A.esc(catLabel(a.cat)[1])}</span><button class="btn small" data-action="help-speak" data-help-id="${A.esc(a.id)}">🔊 Прослушать</button></div>
            <h3>${A.esc(a.title)}</h3>
            <p class="help-summary">${A.esc(a.summary)}</p>
            <p>${A.esc(a.body)}</p>
            ${tutorialForCat(a.cat) ? `<button class="btn small" data-action="tutorial-start" data-tour-id="${A.esc(tutorialForCat(a.cat))}">▶ Обучение: ${A.esc(defTitle(tutorialForCat(a.cat)))}</button>` : ''}
          </article>`).join('') : '<div class="card"><div class="empty">Ничего не найдено. Попробуйте другой запрос или категорию.</div></div>'}`;
  }

  A.pages.help = function () {
    const progress = (S.s().tutorials || {}).completed || {};
    const html = `
    <div class="page-head help-head" data-tour="help-head">
      <div><h1>Помощь</h1><div class="sub">Help Center: справка, поиск и обучение по существующим разделам Aven</div></div>
      ${A.helpActions ? A.helpActions('help') : ''}
    </div>
    <div class="help-layout">
      <aside class="card help-side" data-tour="help-categories" aria-label="Категории справки">
        <div class="field" data-tour="help-search"><label for="help-q">Поиск по Help</label><input id="help-q" type="search" value="${A.esc(query)}" placeholder="Например: задачи, голос, reminder…"></div>
        <div class="help-cats">
          <button class="help-cat ${category === 'all' ? 'active' : ''}" data-action="help-cat" data-cat="all">🔎 Всё</button>
          ${cats.map((c) => `<button class="help-cat ${category === c[0] ? 'active' : ''}" data-action="help-cat" data-cat="${A.esc(c[0])}">${c[2]} ${A.esc(c[1])}</button>`).join('')}
        </div>
        <div class="help-progress">
          <div class="s">Обучение можно перезапустить в любой момент:</div>
          ${['home', 'tasks', 'calendar', 'day', 'help'].map((id) => `<button class="btn small" data-action="tutorial-start" data-tour-id="${id}">${progress[id] ? '↻' : '▶'} ${A.esc(defTitle(id))}</button>`).join('')}
        </div>
      </aside>
      <section class="help-main" data-tour="help-results" aria-live="polite">${resultsHtml()}</section>
    </div>`;
    return { html, mount: (root) => {
      const q = root.querySelector('#help-q');
      if (q) q.addEventListener('input', () => {
        query = q.value;
        const main = root.querySelector('.help-main');
        if (main) main.innerHTML = resultsHtml();
      });
    } };
  };

  function defTitle(id) {
    return (window.AvenTutorial && window.AvenTutorial.definitions[id] && window.AvenTutorial.definitions[id].title) || id;
  }
  function tutorialForCat(cat) {
    return ({ home: 'home', tasks: 'tasks', calendar: 'calendar', day: 'day', start: 'home' })[cat] || '';
  }

  A.register({
    'help-topic': (el) => openTopic(el.dataset.topic || 'start'),
    'help-cat': (el) => { category = el.dataset.cat || 'start'; query = ''; A.render(); },
    'help-speak': (el) => {
      const a = articles.filter((x) => x.id === el.dataset.helpId)[0];
      if (a) speak(a.title + '. ' + a.summary + ' ' + a.body);
    }
  });

  return { articles, categories: cats, openTopic, search: (q) => { query = q || ''; return filtered(); } };
})();
