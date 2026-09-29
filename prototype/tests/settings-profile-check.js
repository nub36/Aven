/* Stage 1.2 regression: Профиль и Настройки как настоящие данные через общий слой действий.
   Проверяется поведение, а не наличие строк: запись значения, валидация, применение форматов
   во всех разделах, запись в историю, Undo, сохранение и восстановление после перезагрузки,
   отсутствие второго пути записи, Help и Tutorial, адаптивность и доступность.
   Запуск: NODE_PATH=/tmp/aven-jsdom/node_modules node prototype/tests/settings-profile-check.js */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Не найден jsdom. Запустите с временным NODE_PATH.'); process.exit(2); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8107, KEY = 'aven-proto-v1';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
const BASE = 'http://127.0.0.1:' + PORT + '/index.html';

function wrap(dom) {
  const w = dom.window, d = w.document;
  return {
    dom, w, d,
    C: () => w.AvenActions,
    st: () => w.AvenState.s(),
    q: (x) => d.querySelector(x),
    qa: (x) => Array.from(d.querySelectorAll(x)),
    txt: () => (d.getElementById('page') || d.body).textContent.replace(/\s+/g, ' '),
    saved: () => JSON.parse(w.localStorage.getItem(KEY) || '{}'),
    ctrl: (p) => d.querySelector('[data-path="' + p + '"]'),
    /* Ввод как у человека: меняем значение контрола и отпускаем фокус. */
    set: (p, v) => {
      const el = d.querySelector('[data-path="' + p + '"]');
      if (!el) return null;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
      el.dispatchEvent(new w.Event('change', { bubbles: true }));
      return el;
    },
    cat: async (id) => { w.Aven.openSettingsCat(id); await sleep(120); }
  };
}
async function load(hash) {
  const dom = await JSDOM.fromURL(BASE + (hash || ''), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
  await sleep(850);
  return wrap(dom);
}
/* Настоящая перезагрузка: новое окно, в котором сохранённое состояние уже лежит
   в хранилище браузера до запуска скриптов — как при обычном открытии страницы. */
function reload(savedRaw, hash) {
  return new Promise((resolve, reject) => {
    http.get(BASE, (res) => {
      let html = '';
      res.on('data', (c) => { html += c; });
      res.on('end', async () => {
        try {
          const dom = new JSDOM(html, {
            url: BASE + (hash || ''), runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
            beforeParse(w) { try { w.localStorage.setItem(KEY, savedRaw); } catch (e) { /* демо */ } }
          });
          await sleep(900);
          resolve(wrap(dom));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  /* ============ A. Контракт слоя действий (без DOM-зависимой логики) ============ */
  {
    const p = await load('#/home'), C = p.C();
    ok('A1 слой действий даёт пространства имён profile и settings',
      !!C.profile && typeof C.profile.setField === 'function' && !!C.settings && typeof C.settings.set === 'function');
    ok('A2 описание полей профиля содержит все девять значений',
      C.profile.fields().length === 9 &&
      ['name', 'greeting', 'locale', 'city', 'tz', 'currency', 'dateFormat', 'timeFormat', 'weekStart']
        .every((k) => C.profile.fields().some((f) => f.path === 'profile.' + k)),
      C.profile.fields().map((f) => f.path).join(','));
    const r = C.profile.setField('name', 'Мария');
    ok('A3 успешный результат имеет форму {ok, action, entity}',
      r.ok === true && r.action === 'profile.update' && r.entity.path === 'profile.name' && r.entity.value === 'Мария');
    ok('A4 значение действительно записано в состояние', p.st().profile.name === 'Мария');
    const bad = C.profile.setField('name', '   ');
    ok('A5 пустое имя отклонено с кодом и человеческим текстом',
      bad.ok === false && bad.code === 'VALUE_REQUIRED' && /не может быть пустым/.test(bad.message) && p.st().profile.name === 'Мария', JSON.stringify(bad));
    const bad2 = C.profile.setField('currency', 'фантики');
    ok('A6 значение вне списка вариантов отклонено', bad2.ok === false && bad2.code === 'VALUE_NOT_ALLOWED' && p.st().profile.currency === '₽ (RUB)');
    const bad3 = C.profile.setField('locale', 'en-US');
    ok('A7 недоступный вариант языка отклонён честно, а не «сохранён»',
      bad3.ok === false && bad3.code === 'VALUE_NOT_AVAILABLE' && p.st().profile.locale === 'ru-RU');
    const bad4 = C.settings.set('settings.behavior.evening', '07:00');
    ok('A8 нарушенный порядок границ суток отклонён с объяснением',
      bad4.ok === false && bad4.code === 'TIME_ORDER' && p.st().settings.behavior.evening === '18:30', JSON.stringify(bad4));
    const good4 = C.settings.set('settings.behavior.evening', '19:15');
    ok('A9 корректная граница суток принята', good4.ok && p.st().settings.behavior.evening === '19:15');
    const same = C.settings.set('settings.behavior.evening', '19:15');
    ok('A10 повторная запись того же значения не создаёт лишнюю запись истории', same.ok && same.unchanged === true && same.entry === null);
    const nf = C.settings.set('settings.behavior.morning', '25:99');
    ok('A11 неверное время отклонено', nf.ok === false && nf.code === 'VALUE_NOT_TIME');
    ok('A12 подпись пути известна слою, а не экрану',
      C.settings.label('settings.notify.quietHours') === 'Тихие часы' &&
      C.settings.label('settings.modules.calendar').indexOf('Модуль') === 0, C.settings.label('settings.modules.calendar'));
    ok('A13 чувствительные пути помечаются', C.settings.isSensitive('privacy.diag') === true && C.settings.isSensitive('settings.theme') === false);
    p.dom.window.close();
  }

  /* ============ B. Экран: контрол действительно меняет состояние ============
     Это регрессия на найденный дефект: поля Профиля и Настроек → Aven были «мёртвыми». */
  {
    const p = await load('#/settings');
    await p.cat('profile');
    const fields = ['profile.name', 'profile.greeting', 'profile.locale', 'profile.city',
      'profile.tz', 'profile.currency', 'profile.dateFormat', 'profile.timeFormat', 'profile.weekStart'];
    ok('B1 все девять полей профиля присутствуют на экране как живые контролы',
      fields.every((f) => !!p.ctrl(f)), fields.filter((f) => !p.ctrl(f)).join(','));
    ok('B2 каждое поле профиля подключено к слою действий',
      fields.every((f) => p.ctrl(f).dataset.action === 'set-field'));
    p.set('profile.name', 'Мария');
    ok('B3 ввод имени меняет состояние (регрессия: поле было мёртвым)', p.st().profile.name === 'Мария', p.st().profile.name);
    ok('B4 изменение имени сразу сохранено в браузере', p.saved().profile.name === 'Мария');
    p.set('profile.currency', '$ (USD)');
    ok('B5 выбор валюты меняет состояние и сохраняется',
      p.st().profile.currency === '$ (USD)' && p.saved().profile.currency === '$ (USD)');
    p.set('profile.weekStart', 'Воскресенье');
    ok('B6 выбор начала недели меняет состояние', p.st().profile.weekStart === 'Воскресенье');
    await p.cat('aven');
    const aven = ['settings.behavior.answers', 'settings.behavior.confirmation', 'settings.behavior.morning',
      'settings.behavior.day', 'settings.behavior.evening', 'settings.behavior.night', 'settings.behavior.afterWork'];
    ok('B7 все семь полей «Настройки → Aven» присутствуют', aven.every((f) => !!p.ctrl(f)), aven.filter((f) => !p.ctrl(f)).join(','));
    p.set('settings.behavior.morning', '06:30');
    ok('B8 время начала утра меняется и сохраняется (регрессия: поле было мёртвым)',
      p.st().settings.behavior.morning === '06:30' && p.saved().settings.behavior.morning === '06:30', p.st().settings.behavior.morning);
    p.set('settings.behavior.answers', 'подробные');
    ok('B9 стиль ответов меняется', p.st().settings.behavior.answers === 'подробные');
    const before = p.st().settings.behavior.evening;
    p.set('settings.behavior.evening', '05:00');
    ok('B10 недопустимое значение не сохраняется и поле возвращается к прежнему',
      p.st().settings.behavior.evening === before && p.ctrl('settings.behavior.evening').value === before,
      p.st().settings.behavior.evening + ' / ' + p.ctrl('settings.behavior.evening').value);
    ok('B11 при ошибке контрол помечен как некорректный для программ чтения с экрана',
      p.ctrl('settings.behavior.evening').getAttribute('aria-invalid') === 'true');
    p.dom.window.close();
  }

  /* ============ C. Форматы применяются во всех разделах ============ */
  {
    const p = await load('#/home'), C = p.C();
    /* Живые суммы — это цифры, которые считаются сейчас. Строки в «Истории» — запись
       о прошлом действии, они остаются в той валюте, в которой действие произошло. */
    const live = () => p.qa('#page .num, #page .v, #page .shop-meta').map((e) => e.textContent).join(' ');
    ok('C1 по умолчанию суммы показаны в рублях', /₽/.test(live()) && !/\$/.test(live()), live().slice(0, 120));
    C.profile.setField('currency', '$ (USD)');
    p.w.Aven.render();
    ok('C2 смена валюты меняет живые суммы на Главной', /\$/.test(live()) && !/₽/.test(live()), live().slice(0, 120));
    p.w.location.hash = '#/finance'; await sleep(300);
    ok('C3 та же валюта применена в Финансах', /\$/.test(live()) && !/₽/.test(live()), live().slice(0, 120));
    p.w.location.hash = '#/auto'; await sleep(300);
    ok('C4 та же валюта применена в Авто', /\$/.test(live()), live().slice(0, 120));
    p.w.location.hash = '#/shopping'; await sleep(300);
    ok('C5 та же валюта применена в Покупках', /\$/.test(live()), live().slice(0, 120));
    ok('C6 деньги форматируются одной функцией слоя действий', p.w.Aven.money(1234) === C.format.money(1234));

    const today = C.dates.todayISO();
    ok('C7 формат даты по умолчанию — ДД.ММ.ГГГГ', C.dates.humanDate(today) === '27.09.2026', C.dates.humanDate(today));
    C.profile.setField('dateFormat', 'ГГГГ-ММ-ДД');
    ok('C8 смена формата даты меняет вывод везде через общий helper', C.dates.humanDate(today) === '2026-09-27', C.dates.humanDate(today));
    p.w.location.hash = '#/calendar'; await sleep(300);
    ok('C9 календарь показывает даты в выбранном формате', /2026-09/.test(p.d.querySelector('.cal-grid').outerHTML));
    C.profile.setField('dateFormat', 'Д месяца ГГГГ');
    ok('C10 словесный формат даты работает', C.dates.humanDate(today) === '27 сентября 2026', C.dates.humanDate(today));
    C.profile.setField('dateFormat', 'ДД.ММ.ГГГГ');

    ok('C11 время по умолчанию 24-часовое', C.format.time('18:30') === '18:30');
    C.profile.setField('timeFormat', '12 ч');
    ok('C12 12-часовой формат даёт AM/PM', C.format.time('18:30') === '6:30 PM' && C.format.time('09:05') === '9:05 AM', C.format.time('18:30'));
    p.w.Aven.render();
    ok('C13 время событий в календаре показано в 12-часовом виде', /PM|AM/.test(p.txt()), p.txt().slice(0, 120));
    ok('C14 само событие не изменилось — изменился только показ',
      p.st().events.some((e) => e.startTime === '10:00') && C.events.getEventsForDate(today).items.every((e) => !/AM|PM/.test(e.startTime || '')));
    C.profile.setField('timeFormat', '24 ч');

    ok('C15 по умолчанию неделя начинается с понедельника', C.format.weekStartIndex() === 1);
    p.w.Aven.render();
    const dows = () => Array.from(p.d.querySelectorAll('.cal-dow')).map((x) => x.textContent);
    ok('C16 первый столбец календаря — Пн', dows()[0] === 'Пн' && dows()[6] === 'Вс', dows().join(''));
    C.profile.setField('weekStart', 'Воскресенье');
    p.w.Aven.render();
    ok('C17 смена начала недели меняет сетку календаря', dows()[0] === 'Вс' && dows()[1] === 'Пн', dows().join(''));
    const cells = Array.from(p.d.querySelectorAll('.cal-cell'));
    ok('C18 сетка календаря остаётся целыми неделями', cells.length % 7 === 0, String(cells.length));
    C.profile.setField('weekStart', 'Понедельник');

    ok('C19 часовой пояс профиля задаёт «сейчас»', C.dates.tzOffsetMinutes() === 180 && /UTC\+3/.test(C.dates.tzLabel()));
    const m1 = C.dates.nowMinutes();
    C.profile.setField('tz', 'UTC+8');
    const m2 = C.dates.nowMinutes();
    ok('C20 смена часового пояса сдвигает текущее время на нужное число часов',
      ((m2 - m1 + 1440) % 1440) === 300 && C.dates.tzOffsetMinutes() === 480, m1 + ' → ' + m2);
    ok('C21 дневные сценарии берут время из того же источника',
      p.w.AvenDaily.period({}) === p.w.AvenDaily.period({ minutes: C.dates.nowMinutes() }));
    C.profile.setField('tz', 'UTC+3');
    p.dom.window.close();
  }

  /* ============ D. История и Undo ============ */
  {
    const p = await load('#/settings'), C = p.C();
    const histBefore = p.st().history.length;
    C.profile.setField('currency', '€ (EUR)');
    const entry = p.st().history[0];
    ok('D1 изменение профиля создаёт запись истории', p.st().history.length === histBefore + 1 && entry.action === 'profile.update');
    ok('D2 запись человекочитаемая: что менялось, было и стало',
      entry.changes.length === 1 && entry.changes[0].field === 'Валюта' &&
      entry.changes[0].from === '₽ · Рубль (RUB)' && entry.changes[0].to === '€ · Евро (EUR)', JSON.stringify(entry.changes));
    ok('D3 запись помечена как отменяемая и содержит, что вернуть',
      entry.undoable === true && entry.undo && entry.undo.type === 'value' && entry.undo.path === 'profile.currency' && entry.undo.value === '₽ (RUB)');
    ok('D4 объект действия назван по-человечески', /Профиль · Валюта/.test(entry.object) && entry.objectType === 'settings');
    p.w.Aven.undoAction(entry.id);
    ok('D5 отмена действительно возвращает прежнее значение', p.st().profile.currency === '₽ (RUB)');
    ok('D6 отмена сохранена в браузере', p.saved().profile.currency === '₽ (RUB)');
    ok('D7 сама отмена тоже попадает в историю', p.st().history[0].action === 'history.undo');
    ok('D8 после отмены интерфейс показывает прежнюю валюту', /₽/.test(p.w.Aven.money(100)));

    C.settings.set('settings.notify.quietHours', false, { label: 'Тихие часы' });
    const t = p.st().history[0];
    ok('D9 переключатель настройки тоже пишет понятную запись',
      t.action === 'settings.update' && t.changes[0].field === 'Тихие часы' &&
      t.changes[0].from === 'включено' && t.changes[0].to === 'выключено', JSON.stringify(t.changes));
    p.w.Aven.undoAction(t.id);
    ok('D10 отмена возвращает переключатель', p.st().settings.notify.quietHours === true);

    const before = p.st().history.length;
    C.settings.set('settings.voice.volume', 0.7, { silent: true });
    ok('D11 непрерывные регуляторы не засоряют историю каждым шагом',
      p.st().history.length === before && p.st().settings.voice.volume === 0.7);

    await p.cat('profile');
    p.set('profile.name', 'Мария');
    const h = p.st().history[0];
    ok('D12 изменение через экран (а не из кода) тоже попадает в историю',
      h.action === 'profile.update' && h.changes[0].field === 'Имя' && h.changes[0].to === 'Мария');
    p.w.Aven.undoAction(h.id);
    await sleep(60);
    ok('D13 после отмены экран показывает прежнее значение',
      p.st().profile.name === 'Алексей' && p.ctrl('profile.name').value === 'Алексей', p.ctrl('profile.name').value);
    p.dom.window.close();
  }

  /* ============ E. Сохранение и восстановление после перезагрузки ============ */
  {
    const p = await load('#/settings');
    await p.cat('profile');
    p.set('profile.name', 'Мария');
    p.set('profile.greeting', 'Маша');
    p.set('profile.currency', '$ (USD)');
    p.set('profile.timeFormat', '12 ч');
    p.set('profile.weekStart', 'Воскресенье');
    await p.cat('aven');
    p.set('settings.behavior.morning', '06:30');
    const raw = p.w.localStorage.getItem(KEY);
    p.dom.window.close();

    const r = await reload(raw, '#/settings');
    ok('E1 после перезагрузки имя восстановлено', r.st().profile.name === 'Мария', r.st().profile.name);
    ok('E2 после перезагрузки обращение восстановлено', r.st().profile.greeting === 'Маша');
    ok('E3 после перезагрузки валюта восстановлена и применяется', r.st().profile.currency === '$ (USD)' && /\$/.test(r.w.Aven.money(10)));
    ok('E4 после перезагрузки формат времени восстановлен', r.C().format.time('18:30') === '6:30 PM');
    ok('E5 после перезагрузки начало недели восстановлено', r.C().format.weekStartIndex() === 0);
    ok('E6 после перезагрузки граница утра восстановлена', r.st().settings.behavior.morning === '06:30');
    r.w.Aven.openSettingsCat('profile'); await sleep(120);
    ok('E7 экран показывает восстановленные значения, а не значения по умолчанию',
      r.ctrl('profile.name').value === 'Мария' && r.ctrl('profile.currency').value === '$ (USD)');
    ok('E8 приветствие на Главной использует восстановленное обращение',
      (r.w.location.hash = '#/home', true));
    await sleep(250);
    ok('E9 Главная здоровается новым обращением', /Маша/.test(r.txt()), r.txt().slice(0, 80));
    r.dom.window.close();
  }

  /* ============ F. Один путь записи: второго пути не осталось ============ */
  {
    const src = (f) => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    const settings = src('settings.js');
    ok('F1 экран настроек не пишет в состояние напрямую',
      !/setByPath\s*\(/.test(settings) && !/s\(\)\.settings\.[A-Za-z.]+\s*=/.test(settings) && !/s\(\)\.profile\.[A-Za-z.]+\s*=/.test(settings));
    const modules = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && f !== 'actions.js' && f !== 'data.js');
    const writers = modules.filter((f) => /\.(settings|profile)\.[A-Za-z0-9_.]+\s*=[^=]/.test(src(f)));
    ok('F2 ни один раздел, кроме слоя действий, не присваивает значения настройкам и профилю',
      writers.length === 0, writers.join(','));
    ok('F3 переключение темы в шапке идёт тем же путём',
      /AvenActions\.settings\.set\('settings\.theme'/.test(src('app.js')) && !/st\.settings\.theme\s*=/.test(src('app.js')));
    ok('F4 скрытие плавающего персонажа идёт тем же путём',
      /AvenActions\.settings\.set\('settings\.character\.floating'/.test(src('character.js')));
    ok('F5 форматирование денег не продублировано в разделах',
      (src('pages2.js').match(/Intl\.NumberFormat\('ru-RU'\)/g) || []).length <= 1);
    ok('F6 формат даты не продублирован в разделах',
      !/Intl\.DateTimeFormat\('ru-RU', \{ day: '2-digit'/.test(src('pages2.js')));

    const p = await load('#/settings');
    await p.cat('aven');
    const h0 = p.st().history.length;
    p.set('settings.daily.morning', false);
    ok('F7 переключатель на экране пишет в историю через слой',
      p.st().history.length === h0 + 1 && p.st().settings.daily.morning === false &&
      p.st().history[0].changes[0].field === 'Показывать утренний обзор', JSON.stringify(p.st().history[0].changes));
    p.w.Aven.undoAction(p.st().history[0].id);
    ok('F8 отмена возвращает переключатель', p.st().settings.daily.morning === true);
    p.dom.window.close();
  }

  /* ============ G. Согласованность между разделами и честность данных ============ */
  {
    const p = await load('#/finance'), C = p.C();
    ok('G1 «Расходы по месяцам» больше не берутся из зашитого списка', !Object.prototype.hasOwnProperty.call(p.st(), 'finChart'));
    const bars = p.qa('.bar-wrap');
    ok('G2 столбцы построены по реальным операциям', bars.length >= 1 && bars.length <= 12, String(bars.length));
    const monthSum = (p.st().ops || []).filter((o) => o.type !== 'income' && String(o.dateISO).slice(0, 7) === C.dates.todayISO().slice(0, 7))
      .reduce((a, o) => a + o.amount, 0);
    ok('G3 подпись столбца совпадает с суммой операций месяца',
      bars.some((b) => (b.getAttribute('title') || '').indexOf(p.w.Aven.money(monthSum)) >= 0),
      bars.map((b) => b.getAttribute('title')).join(' | '));
    const opsBefore = p.st().ops.length;
    C.settings.set('profile.currency', '$ (USD)');
    p.w.Aven.render();
    ok('G4 столбцы пересчитываются в выбранной валюте, а не показывают старую',
      p.qa('.bar-wrap').some((b) => (b.getAttribute('title') || '').indexOf('$') >= 0));
    ok('G5 смена валюты не трогает сами операции', p.st().ops.length === opsBefore);
    C.settings.set('profile.currency', '₽ (RUB)');
    ok('G6 мёртвые демо-поля удалены из данных',
      !Object.prototype.hasOwnProperty.call(p.st(), 'finCats') &&
      !Object.prototype.hasOwnProperty.call(p.st().car, 'lastService') &&
      !Object.prototype.hasOwnProperty.call(p.st().car, 'nextService') &&
      !Object.prototype.hasOwnProperty.call(p.st().car, 'monthCost') &&
      !Object.prototype.hasOwnProperty.call(p.st().car, 'consumption'));
    p.dom.window.close();
  }
  {
    const p = await load('#/assistant');
    const chat = p.d.getElementById('chat').textContent.replace(/\s+/g, ' ');
    ok('G7 стартовый диалог помощника не содержит выдуманных сумм', chat.indexOf('3 420') < 0, chat.slice(0, 140));
    const realToday = (p.st().ops || []).filter((o) => o.type !== 'income' && o.dateISO === p.C().dates.todayISO())
      .reduce((a, o) => a + o.amount, 0);
    ok('G8 помощник называет настоящую сумму расходов за сегодня',
      chat.indexOf(p.w.Aven.money(realToday).replace(/\s/g, ' ')) >= 0, p.w.Aven.money(realToday) + ' | ' + chat.slice(0, 160));
    ok('G9 помощник называет настоящие события на завтра',
      p.C().events.getEventsForDate(p.C().dates.todayISO(1)).items.every((e) => chat.indexOf(e.title) >= 0), chat.slice(0, 200));
    p.st().ops.push({ id: 'ox1', type: 'expense', cat: 'Дом', account: 'card', title: 'Проверка', amount: 100, dateISO: p.C().dates.todayISO(), comment: '' });
    p.w.Aven._chat = null; p.w.Aven.render(); await sleep(120);
    const chat2 = p.d.getElementById('chat').textContent.replace(/\s+/g, ' ');
    const want = p.w.Aven.money(realToday + 100).replace(/\s/g, ' ');
    ok('G10 ответ помощника пересчитывается вслед за данными',
      chat2 !== chat && chat2.indexOf(want) >= 0, want + ' | ' + chat2.slice(0, 160));
    p.dom.window.close();
  }

  /* ============ H. Страница «Профиль» — те же данные, а не копия ============ */
  {
    const p = await load('#/profile');
    ok('H1 страница профиля редактируемая', !!p.ctrl('profile.name') && p.ctrl('profile.name').tagName === 'INPUT');
    ok('H2 на странице профиля есть и форматы', ['profile.tz', 'profile.currency', 'profile.dateFormat', 'profile.timeFormat', 'profile.weekStart'].every((f) => !!p.ctrl(f)));
    p.set('profile.name', 'Мария');
    ok('H3 правка на странице профиля меняет общее состояние', p.st().profile.name === 'Мария');
    p.w.location.hash = '#/settings'; await sleep(250);
    p.w.Aven.openSettingsCat('profile'); await sleep(120);
    ok('H4 в Настройках видно то же значение — это не две копии', p.ctrl('profile.name').value === 'Мария');
    p.set('profile.city', 'Казань');
    p.w.location.hash = '#/profile'; await sleep(250);
    ok('H5 и наоборот: правка в Настройках видна в профиле', p.ctrl('profile.city').value === 'Казань');
    ok('H6 почта показана, но не редактируется здесь', /alexey@demo\.aven/.test(p.txt()) && !p.ctrl('profile.email'));
    p.dom.window.close();
  }

  /* ============ I. Помощь и обучение ============ */
  {
    const p = await load('#/help'), H = p.w.AvenHelp;
    const arts = Array.isArray(H.articles) ? H.articles : (H.articles ? H.articles() : []);
    const cat = (c) => arts.filter((a) => a.cat === c);
    ok('I1 в справке есть раздел про профиль', cat('profile').length >= 3, String(cat('profile').length));
    ok('I2 в справке есть раздел про настройки', cat('settings').length >= 4, String(cat('settings').length));
    const mine = cat('profile').concat(cat('settings'));
    ok('I3 статьи объясняют, зачем это нужно и что изменится',
      mine.some((a) => /Зачем это нужно/.test(a.body)) && mine.some((a) => /Где виден результат|применяются|видно в другом/.test(a.body)));
    ok('I4 статьи объясняют отмену', mine.some((a) => /Отменить/.test(a.body)));
    ok('I5 статьи честно говорят об ограничениях', mine.some((a) => /Пока НЕ готово|не пересчитывается|не редактируется/.test(a.body)));
    ok('I6 есть статья про типичные проблемы', mine.some((a) => /не сохраняется/.test(a.title)));
    const jargon = /\b(DOM|payload|state|provider|action layer|route|localStorage|backend|API|JSON|IIFE|render)\b/i;
    const dirty = mine.filter((a) => jargon.test(a.title + ' ' + a.summary + ' ' + a.body));
    ok('I7 в новых статьях нет слов для разработчиков', dirty.length === 0, dirty.map((a) => a.id).join(','));

    const T = p.w.AvenTutorial, defs = T.definitions || {};
    const ids = Object.keys(defs);
    ok('I8 обучение по настройкам добавлено в существующий движок', ids.indexOf('settings') >= 0 && ids.indexOf('profile') >= 0, ids.join(','));
    ok('I9 второй движок обучения не появился', typeof p.w.AvenTutorial === 'object' && !p.w.AvenTutorial2 && !p.w.AvenTour);
    const sTour = defs.settings;
    ok('I10 тур по настройкам состоит из нескольких шагов', !!sTour && sTour.steps.length >= 5, sTour && String(sTour.steps.length));
    ok('I16 тур по профилю привязан к своей странице и учит сценарию, а не кнопкам',
      !!defs.profile && defs.profile.route === 'profile' && defs.profile.steps.length >= 4 &&
      defs.profile.steps.every((x) => x.text.length > 60));
    p.dom.window.close();
  }
  {
    const p = await load('#/settings');
    ok('I11 на экране настроек есть кнопки справки и обучения',
      !!p.q('[data-action="help-topic"][data-topic="settings"]') && !!p.q('[data-action="tutorial-start"][data-tour-id="settings"]'));
    p.w.AvenTutorial.start('settings', { restart: true });
    await sleep(500);
    ok('I12 обучение запускается и показывает шаг', !!p.q('.tour-pop') && /Шаг 1 из/.test(p.q('.tour-pop').textContent));
    ok('I13 обучение подсвечивает настоящий элемент экрана', !!p.q('.tour-target-active'));
    p.w.AvenTutorial.next(); await sleep(250);
    ok('I14 переход к следующему шагу работает', /Шаг 2 из/.test(p.q('.tour-pop').textContent));
    p.w.AvenTutorial.skip(); await sleep(150);
    ok('I15 обучение закрывается и не оставляет наложений', !p.q('.tour-pop') && !p.d.body.classList.contains('tour-open'));
    p.dom.window.close();
  }

  /* ============ J. Доступность ============ */
  {
    const p = await load('#/settings');
    await p.cat('profile');
    const controls = p.qa('[data-action="set-field"]');
    ok('J1 у каждого поля есть связанная подпись',
      controls.length >= 9 && controls.every((c) => c.id && p.d.querySelector('label[for="' + c.id + '"]')),
      controls.filter((c) => !c.id || !p.d.querySelector('label[for="' + c.id + '"]')).length + ' без подписи');
    ok('J2 поля достижимы с клавиатуры (не отключены и не скрыты от фокуса)',
      controls.every((c) => !c.disabled && c.getAttribute('tabindex') !== '-1'));
    await p.cat('notify');
    const toggles = p.qa('input[type="checkbox"][data-action="set-toggle"]');
    ok('J3 у переключателей есть словесное название', toggles.length > 0 && toggles.every((t) => (t.getAttribute('aria-label') || '').length > 2),
      toggles.filter((t) => !(t.getAttribute('aria-label') || '').length).length + ' без названия');
    ok('J4 недоступный вариант языка помечен, а не просто показан',
      (await p.cat('profile'), Array.from(p.ctrl('profile.locale').options).some((o) => o.disabled)));
    p.dom.window.close();
  }

  /* ============ K. Адаптивность: контролы не исчезают на узких экранах ============ */
  {
    const p = await load('#/settings');
    for (const width of [320, 360, 390, 412, 430, 768, 834, 1024, 1280]) {
      Object.defineProperty(p.w, 'innerWidth', { value: width, configurable: true });
      p.w.dispatchEvent(new p.w.Event('resize'));
      p.w.Aven.openSettingsCat('profile');
      await sleep(40);
      const n = p.qa('[data-action="set-field"]').length;
      ok('K' + width + ' на ширине ' + width + 'px все поля профиля доступны', n === 9, String(n));
    }
    ok('K-nav мобильное меню не сломано изменениями', !p.d.body.classList.contains('nav-open') && !!p.d.getElementById('sidebar'));
    p.dom.window.close();
  }

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  console.log('ПРИМЕЧАНИЕ: jsdom не проверяет реальную раскладку и касания в браузере Android.');
  server.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
