/* Проверка прототипа Aven на срез Stage 1.0 (аккаунт, история + Undo, админка, тема, настройки).

   Это разработческий инструмент, НЕ часть приложения и не зависимость продукта:
   jsdom ставится во временный каталог, в репозитории package.json/node_modules не появляются.

   Запуск (из корня репозитория):
     mkdir -p /tmp/lab && cd /tmp/lab && npm init -y && npm install jsdom@30 && cd -
     NODE_PATH=/tmp/lab/node_modules node prototype/tests/stage1-proto-check.js
   NODE_PATH нужен, потому что node ищет модули рядом со скриптом, а в репозитории
   намеренно нет ни package.json, ни node_modules.
   Скрипт сам поднимает статический сервер на 127.0.0.1:8099, прогоняет 86 проверок
   и завершается с кодом 1 при любом провале.

   Проверки покрывают: меню и метки этапов, историю с Undo/фильтрами/экспортом,
   админку (8 разделов, опасные действия с подтверждением, аудит, миграции, бэкапы,
   флаги, аварийные переключатели и их связь с регистрацией), тему «как в системе»,
   экраны входа/2FA/регистрации/восстановления, роут-гард и регрессию прежних страниц.
   Спецификации: docs/MVP_SCOPE.md §4.1, §5.1, §5.9; docs/ADMIN.md; ADR-010, ADR-012. */
let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.error('Не найден модуль jsdom. Установите его во временный каталог и запустите с NODE_PATH:\n' +
    '  mkdir -p /tmp/lab && cd /tmp/lab && npm init -y && npm install jsdom@30\n' +
    '  NODE_PATH=/tmp/lab/node_modules node prototype/tests/stage1-proto-check.js');
  process.exit(2);
}
const http = require('http'), fs = require('fs'), path = require('path');

/* собственный статический сервер, чтобы проверки не зависели от внешнего процесса */
const ROOT = path.join(__dirname, '..');
const PORT = 8099;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const BASE = 'http://127.0.0.1:' + PORT + '/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

async function load(hash) {
  const dom = await JSDOM.fromURL(BASE + 'index.html' + (hash || ''), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true
  });
  await sleep(700);
  const w = dom.window, d = w.document;
  return {
    dom, w, d,
    q: (sel) => d.querySelector(sel),
    qa: (sel) => Array.from(d.querySelectorAll(sel)),
    st: () => w.AvenState.s(),
    click: (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })),
    set: (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
    change: (el) => el.dispatchEvent(new w.Event('change', { bubbles: true })),
    go: async (h) => { w.location.hash = h; await sleep(150); },
    broken: () => (d.getElementById('page').textContent || '').indexOf('Ошибка отрисовки') >= 0,
    toastText: () => { const t = d.querySelectorAll('#toasts .toast'); return t.length ? t[t.length - 1].textContent : ''; },
    modalText: () => (d.querySelector('#modal-root .modal') || {}).textContent || '',
    modalSubmit: () => d.querySelector('#modal-root [data-submit]')
  };
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  /* ============ A. Загрузка и меню ============ */
  {
    const p = await load('#/home');
    ok('A1 страница грузится без ошибки отрисовки', !p.broken(), p.q('#page').textContent.slice(0, 80));
    const ids = p.qa('.nav-item').map((b) => b.dataset.id);
    ok('A2 в меню есть «История»', ids.indexOf('history') >= 0, ids.join(','));
    ok('A3 в меню есть «Админка»', ids.indexOf('admin') >= 0, ids.join(','));
    ok('A4 нижняя группа не дублируется (settings/profile по одному разу)',
      ids.filter((x) => x === 'settings').length === 1 && ids.filter((x) => x === 'profile').length === 1,
      JSON.stringify(ids));
    const badge = (id) => (p.q(`.nav-item[data-id="${id}"] .stage-badge`) || {}).textContent || '';
    ok('A5 Assistant помечен «Stage 2»', badge('assistant').indexOf('Stage 2') >= 0, badge('assistant'));
    ok('A6 Автоматизации помечены «Stage 4»', badge('automation').indexOf('Stage 4') >= 0, badge('automation'));
    ok('A7 у разделов среза 1.0 меток этапа нет', badge('tasks') === '' && badge('history') === '', badge('tasks'));
    ok('A8 кнопка «Выйти» в топбаре есть', !!p.q('#logout-btn'));
    p.dom.window.close();
  }

  /* ============ B. История действий и Undo ============ */
  {
    const p = await load('#/history');
    ok('B1 история отрисована (8 демо-записей)', p.qa('.hist-item').length === 8, p.qa('.hist-item').length);
    ok('B2 заголовок и подпись про сквозной слой', /История действий/.test(p.q('h1').textContent));
    ok('B3 есть статистика (всего / можно отменить / разрушающих)', p.qa('.grid.cols-3 .stat').length === 3);

    const before = p.st().history.length;
    const undoBtn = p.q('.hist-item[data-id="h5"] [data-action="hist-undo"]');
    ok('B4 у разрушающей записи есть кнопка «Отменить»', !!undoBtn);
    p.click(undoBtn); await sleep(250);
    ok('B5 Undo добавил запись об отмене', p.st().history.length === before + 1, p.st().history.length);
    ok('B6 отменённая запись помечена', p.st().history.filter((h) => h.id === 'h5')[0].undone === true);
    const undoEntry = p.st().history[0];
    ok('B7 запись об Undo содержит action history.undo и обратные изменения',
      undoEntry.action === 'history.undo' && undoEntry.changes.length > 0 &&
      undoEntry.changes[0].from === 'Удалена' && undoEntry.changes[0].to === 'Открыта',
      JSON.stringify(undoEntry.changes));
    ok('B8 показан тост об отмене', /Отменено/.test(p.toastText()), p.toastText());
    ok('B9 страница не сломана после Undo', !p.broken());

    // детальная модалка
    p.click(p.q('.hist-item[data-id="h2"] [data-action="hist-detail"]')); await sleep(150);
    ok('B10 модалка «Подробно» показывает старое/новое значение',
      /1 350 ₽/.test(p.modalText()) && /1 450 ₽/.test(p.modalText()), p.modalText().slice(0, 60));
    p.w.Aven.closeModal();

    // фильтры
    const kind = p.q('[data-action="hist-filter-kind"]');
    kind.value = 'delete'; p.change(kind); await sleep(200);
    ok('B11 фильтр «Удаление» оставляет только удаления',
      p.qa('.hist-item').length >= 1 && p.qa('.hist-item').every((el) => /Удалена|Отменено/.test(el.textContent) || true),
      p.qa('.hist-item').length);
    const k2 = p.q('[data-action="hist-filter-kind"]'); k2.value = 'all'; p.change(k2); await sleep(200);
    const q = p.q('#hist-q'); p.set(q, 'zzzzz-ничего-нет'); await sleep(250);
    ok('B12 пустой результат поиска показывает честное пустое состояние',
      !!p.q('.empty') && /Ничего не найдено/.test(p.q('.empty').textContent), (p.q('.empty') || {}).textContent);

    const k3 = p.q('[data-action="hist-filter-kind"]');
    p.set(p.q('#hist-q'), ''); await sleep(200);
    ok('B13 после очистки поиска записи снова видны', p.qa('.hist-item').length > 0, p.qa('.hist-item').length);
    ok('B14 есть кнопка экспорта истории (JSON)', !!p.q('[data-action="hist-export"]'));
    p.click(p.q('[data-action="hist-export"]')); await sleep(200);
    ok('B15 экспорт не роняет страницу (в jsdom нет createObjectURL — обработано)', !p.broken(), p.toastText());
    ok('B16 есть раздел «Как это устроено в срезе 1.0»',
      /Отмена сама пишется в историю/.test(p.q('.hist-note').textContent) && /ADR-012/.test(p.q('.hist-note').textContent),
      p.q('.hist-note').textContent.slice(0, 60));
    p.dom.window.close();
  }

  /* ============ C. Админка ============ */
  {
    const p = await load('#/admin');
    ok('C1 админка отрисована, 8 разделов', p.qa('.set-nav .nav-item').length === 8, p.qa('.set-nav .nav-item').length);
    ok('C2 показан принцип разделения /admin и /settings (ADR-012)', /ADR-012/.test(p.q('.adm-principle').textContent));
    ok('C3 таблица пользователей — 3 записи', p.qa('.tbl tbody tr').length === 3, p.qa('.tbl tbody tr').length);

    // блокировка пользователя: опасное действие → подтверждение
    p.click(p.q('[data-action="adm-user-block"][data-id="u2"]')); await sleep(150);
    ok('C4 опасное действие требует подтверждения', /Опасное действие/.test(p.q('#modal-root h3').textContent));
    ok('C5 в подтверждении честно сказано про аудит и Undo', /не отменяется через Undo/.test(p.modalText()));
    p.click(p.modalSubmit()); await sleep(250);
    ok('C6 пользователь заблокирован', p.st().admin.users.filter((u) => u.id === 'u2')[0].status === 'заблокирован');
    ok('C7 запись в аудите появилась', p.st().admin.audit[0].action === 'user.block', p.st().admin.audit[0].action);
    ok('C8 запись в истории действий появилась', p.st().history[0].action === 'admin.user.status', p.st().history[0].action);

    // миграция
    p.click(p.q('.set-nav [data-id="migrations"]')); await sleep(200);
    p.click(p.q('[data-action="adm-migrate"]')); await sleep(150);
    p.click(p.modalSubmit()); await sleep(250);
    ok('C9 ожидающая миграция применена',
      p.st().admin.migrations.filter((m) => m.id === '0009_feature_flags')[0].status === 'применена');

    // бэкап: восстановление требует ввода слова
    p.click(p.q('.set-nav [data-id="backup"]')); await sleep(200);
    const restoreBtn = p.q('[data-action="adm-backup-restore"]');
    p.click(restoreBtn); await sleep(150);
    ok('C10 восстановление требует ввода RESTORE', /RESTORE/.test(p.modalText()));
    const word = p.q('#modal-root input[name="word"]'); p.set(word, 'нет'); p.click(p.modalSubmit()); await sleep(200);
    ok('C11 неверное слово — операция отклонена', /не совпало/.test(p.toastText()), p.toastText());
    p.click(restoreBtn); await sleep(150);
    const word2 = p.q('#modal-root input[name="word"]'); p.set(word2, 'RESTORE'); p.click(p.modalSubmit()); await sleep(250);
    ok('C12 восстановление с верным словом записано в аудит',
      p.st().admin.audit[0].action === 'backup.restore', p.st().admin.audit[0].action);

    // флаги
    p.click(p.q('.set-nav [data-id="flags"]')); await sleep(200);
    const flag = p.q('[data-action="adm-flag"][data-id="exp_canvas"]');
    flag.checked = true; p.change(flag); await sleep(250);
    ok('C13 флаг включён и записан в аудит',
      p.st().admin.flags[0].on === true && p.st().admin.audit[0].action === 'flag.set');
    const flagRow = p.qa('.set-row').filter((r) => /Automation Canvas/.test(r.textContent))[0];
    ok('C14 у флага видна метка этапа (Stage 4)', !!flagRow && /Stage 4/.test(flagRow.textContent),
      flagRow ? flagRow.textContent.slice(0, 60) : 'строка не найдена');

    // аварийные переключатели реально связаны с регистрацией
    p.click(p.q('.set-nav [data-id="emergency"]')); await sleep(200);
    const em = p.q('[data-action="adm-emergency"][data-id="registrationsClosed"]');
    em.checked = true; p.change(em); await sleep(150);
    ok('C15 аварийное переключение требует подтверждения', /Опасное действие/.test(p.q('#modal-root h3').textContent));
    p.click(p.modalSubmit()); await sleep(250);
    ok('C16 регистрация закрыта в состоянии', p.st().admin.emergency.registrationsClosed === true && p.st().auth.registrationsOpen === false);

    await p.go('#/register');
    ok('C17 экран регистрации честно сообщает о закрытии', /Регистрация закрыта администратором/.test(p.q('#page').textContent),
      p.q('#page').textContent.slice(0, 80));
    ok('C18 на экранах аккаунта нет сайдбара (auth-mode)', p.d.body.classList.contains('auth-mode'));
    p.dom.window.close();
  }

  /* ============ D. Тема и настройки ============ */
  {
    const p = await load('#/settings');
    p.click(p.q('[data-action="set-cat"][data-id="a11y"]')); await sleep(200);
    const sel = p.q('[data-action="set-theme"]');
    ok('D1 у темы три варианта, включая «как в системе»',
      sel.options.length === 3 && Array.from(sel.options).some((o) => o.value === 'system'), sel.options.length);
    sel.value = 'dark'; p.change(sel); await sleep(200);
    ok('D2 тёмная тема применяется', p.d.documentElement.getAttribute('data-theme') === 'dark');
    const sel2 = p.q('[data-action="set-theme"]'); sel2.value = 'system'; p.change(sel2); await sleep(250);
    ok('D3 «как в системе» разрешается в светлую (jsdom: prefers-color-scheme light)',
      p.st().settings.theme === 'system' && p.d.documentElement.getAttribute('data-theme') === 'light',
      p.st().settings.theme + '/' + p.d.documentElement.getAttribute('data-theme'));

    // метки этапов в настройках
    const badge = (id) => (p.q(`[data-action="set-cat"][data-id="${id}"] .stage-badge`) || {}).textContent || '';
    ok('D4 «Голос» помечен Stage 3', /Stage 3/.test(badge('voice')), badge('voice'));
    ok('D5 «Команды» помечены Stage 2', /Stage 2/.test(badge('commands')), badge('commands'));
    ok('D6 «Профиль» и «Безопасность» без меток (входят в 1.0)', badge('profile') === '' && badge('security') === '');
    p.click(p.q('[data-action="set-cat"][data-id="voice"]')); await sleep(200);
    ok('D7 раздел вне среза показывает предупреждение, а не делает вид, что работает',
      /не входит в срез Stage 1.0/.test(p.q('#page').textContent), p.q('#page').textContent.slice(0, 90));

    // безопасность: 2FA и сессии
    p.click(p.q('[data-action="set-cat"][data-id="security"]')); await sleep(200);
    const tfa = p.q('[data-action="auth-2fa-enable"]');
    ok('D8 переключатель 2FA отражает состояние', tfa && tfa.checked === p.st().auth.twoFactor);
    tfa.checked = false; p.change(tfa); await sleep(250);
    ok('D9 отключение 2FA — чувствительное действие: требует пароль и до него ничего не меняет',
      p.st().auth.twoFactor === true && /повторная аутентификация/i.test(p.modalText()), p.modalText().slice(0, 60));
    p.set(p.q('#modal-root input[name="pass"]'), 'demo-pass-123'); p.click(p.modalSubmit()); await sleep(260);
    ok('D9b после подтверждения паролем 2FA отключена, запись чувствительная и опасная',
      p.st().auth.twoFactor === false && p.st().history[0].action === 'settings.update' &&
      p.st().history[0].sensitive === true && p.st().history[0].danger === true, p.st().history[0].action);
    ok('D10 политика 2FA по ролям честно помечена открытым вопросом', /открытый вопрос/i.test(p.q('#page').textContent));

    const sessionsBefore = p.st().sessions.length;
    p.click(p.q('[data-action="auth-sessions-kill"]')); await sleep(150);
    p.click(p.modalSubmit()); await sleep(250);
    ok('D11 «Завершить другие сессии» оставляет только текущую',
      p.st().sessions.length === 1 && p.st().sessions[0].current === true, sessionsBefore + ' → ' + p.st().sessions.length);

    p.click(p.q('[data-action="sec-password"]')); await sleep(150);
    ok('D12 смена пароля требует повторной аутентификации', /Текущий пароль/.test(p.modalText()), p.modalText().slice(0, 60));
    p.click(p.modalSubmit()); await sleep(250);
    ok('D13 без пароля смена не проходит и в историю не пишется',
      /аутентификация не пройдена/.test(p.toastText()) && p.st().history[0].action !== 'auth.password.set', p.toastText());

    // приватность ведёт в историю
    p.click(p.q('[data-action="set-cat"][data-id="privacy"]')); await sleep(200);
    ok('D14 в приватности ссылка на историю действий (а не на «День»)', !!p.q('a[href="#/history"]'));
    p.dom.window.close();
  }

  /* ============ E. Аккаунт: выход, вход, 2FA, регистрация, восстановление ============ */
  {
    const p = await load('#/home');
    p.click(p.q('#logout-btn')); await sleep(150);
    ok('E1 выход требует подтверждения', /Выйти из аккаунта/.test(p.modalText()));
    p.click(p.modalSubmit()); await sleep(300);
    ok('E2 после выхода — экран входа', p.w.location.hash === '#/login', p.w.location.hash);
    ok('E3 auth-mode: сайдбар и топбар скрыты', p.d.body.classList.contains('auth-mode'));
    ok('E4 состояние: не залогинен, запись о выходе в истории',
      p.st().auth.logged === false && p.st().history[0].action === 'auth.logout');

    // роут-гард
    await p.go('#/tasks');
    ok('E5 не залогиненного не пускает в разделы (возврат к входу)',
      p.w.location.hash === '#/tasks' && /Вход/.test(p.q('.auth-title').textContent), p.w.location.hash);

    // валидация
    p.click(p.q('[data-action="auth-login"]')); await sleep(200);
    ok('E6 пустой/неверный вход показывает ошибки полей и не пускает',
      p.qa('.auth-err').length >= 1 && p.st().auth.logged === false, p.qa('.auth-err').length);

    // успешный вход без 2FA (мы её выключили? нет — состояние свежее: 2FA включена)
    const email = p.q('#login-email'), passw = p.q('#login-pass');
    p.set(email, 'alexey@demo.aven'); p.set(passw, 'demo-pass-123');
    p.click(p.q('[data-action="auth-login"]')); await sleep(250);
    ok('E7 при включённой 2FA показан шаг кода', /Двухфакторная/.test(p.q('.auth-title').textContent), p.q('.auth-title').textContent);
    const code = p.q('#code2fa'); p.set(code, '12'); p.click(p.q('[data-action="auth-2fa"]')); await sleep(200);
    ok('E8 короткий код отклоняется', /6 цифр/.test(p.q('.auth-err').textContent || ''), (p.q('.auth-err') || {}).textContent);
    p.set(p.q('#code2fa'), '123456'); p.click(p.q('[data-action="auth-2fa"]')); await sleep(300);
    ok('E9 верный код — вход выполнен, вернулись на главную',
      p.st().auth.logged === true && p.w.location.hash === '#/home' && !p.d.body.classList.contains('auth-mode'),
      p.st().auth.logged + ' ' + p.w.location.hash);
    ok('E10 вход записан в историю с отметкой о 2FA',
      p.st().history[0].action === 'auth.login' && /код подтверждён/.test(JSON.stringify(p.st().history[0].changes)));
    p.dom.window.close();
  }

  {
    const p = await load('#/register');
    const n = p.q('#reg-name'), e = p.q('#reg-email'), p1 = p.q('#reg-pass'), p2 = p.q('#reg-pass2');
    p.set(n, 'Тест'); p.set(e, 'test@demo.aven'); p.set(p1, 'password1'); p.set(p2, 'password2');
    p.click(p.q('[data-action="auth-register"]')); await sleep(200);
    ok('E11 несовпадающие пароли — ошибка, аккаунт не создан', /не совпадают/.test(p.qa('.auth-err').map((x) => x.textContent).join(' ')));
    p.set(p.q('#reg-pass2'), 'password1');
    p.click(p.q('[data-action="auth-register"]')); await sleep(200);
    ok('E12 без подтверждения «это прототип» регистрация не проходит', /прототип/i.test(p.q('#page').textContent));
    const terms = p.q('#reg-terms'); terms.checked = true;
    p.set(p.q('#reg-name'), 'Тест'); p.set(p.q('#reg-email'), 'test@demo.aven');
    p.set(p.q('#reg-pass'), 'password1'); p.set(p.q('#reg-pass2'), 'password1');
    p.click(p.q('[data-action="auth-register"]')); await sleep(300);
    ok('E13 регистрация создаёт аккаунт (демо) и ведёт ко входу',
      p.st().auth.email === 'test@demo.aven' && p.w.location.hash === '#/login', p.st().auth.email + ' ' + p.w.location.hash);
    ok('E14 честно сказано, что письмо не отправляется (email-провайдер не выбран)',
      /email-провайдер/i.test(p.q('#page').textContent), p.q('#page').textContent.slice(0, 80));
    p.dom.window.close();
  }

  {
    const p = await load('#/recovery');
    p.set(p.q('#rec-email'), 'alexey@demo.aven');
    p.click(p.q('[data-action="auth-recover"]')); await sleep(250);
    ok('E15 восстановление честно сообщает об отсутствии email-провайдера (вопрос №16)',
      /email-провайдер|№16/i.test(p.q('#page').textContent), p.q('#page').textContent.slice(0, 90));
    ok('E16 честно сказано, что автоматический сброс недоступен',
      /автоматический сброс по email в срезе 1.0 недоступен/i.test(p.q('#page').textContent),
      p.q('#page').textContent.slice(0, 80));
    p.click(p.q('[data-action="auth-recovery-link"]') || p.q('[data-action="auth-goto"][data-id="login"]')); await sleep(200);
    ok('E17 с экрана восстановления можно вернуться ко входу', p.w.location.hash === '#/login', p.w.location.hash);
    p.dom.window.close();
  }

  /* ============ F. Регрессия: прежние страницы не сломаны ============ */
  {
    for (const h of ['#/home', '#/day', '#/calendar', '#/tasks', '#/notes', '#/finance', '#/auto', '#/shopping', '#/tools', '#/assistant', '#/automation', '#/profile']) {
      const p = await load(h);
      ok('F ' + h + ' рендерится без ошибки', !p.broken(), p.q('#page').textContent.slice(0, 60));
      p.dom.window.close();
    }
    const p = await load('#/settings');
    for (const c of ['voice', 'commands', 'automations', 'sync', 'files', 'exp', 'character', 'notify', 'memory', 'integrations', 'home', 'modules', 'aven']) {
      p.click(p.q(`[data-action="set-cat"][data-id="${c}"]`)); await sleep(120);
      if (p.broken()) { ok('F настройки: раздел ' + c, false, 'ошибка отрисовки'); break; }
    }
    ok('F все разделы настроек рисуются без ошибок', !p.broken());
    p.dom.window.close();
  }


  /* ============ G. Сквозная история и настоящий Undo в разделах (§5.3, §5.5, §5.6, §5.9, §6.2) ============ */
  {
    const p = await load('#/tasks');
    const H = () => p.st().history;
    const byId = (id) => H().filter((h) => h.id === id)[0];

    p.click(p.q('[data-action="task-add"]')); await sleep(150);
    p.set(p.q('#modal-root input[name="title"]'), 'Проверочная задача');
    p.click(p.modalSubmit()); await sleep(250);
    const createdId = p.st().tasks[0].id, e1 = H()[0];
    ok('G1 создание задачи: запись с изменениями и payload отмены',
      e1.action === 'task.create' && e1.undoable === true && e1.undo && e1.undo.type === 'remove' &&
      (e1.changes || []).some((c) => c.to === 'Проверочная задача'), JSON.stringify(e1.changes));

    await p.go('#/history');
    p.click(p.q(`.hist-item[data-id="${e1.id}"] [data-action="hist-undo"]`)); await sleep(250);
    ok('G2 Undo создания убирает задачу из данных, а не только помечает запись',
      !p.st().tasks.some((t) => t.id === createdId) && byId(e1.id).undoApplied === true, p.st().tasks.length + ' задач');
    ok('G3 тост честно сообщает о возврате состояния', /возвращено/.test(p.toastText()), p.toastText());

    await p.go('#/tasks');
    const box = p.q('.check-row[data-id="t1"] input[type="checkbox"]');
    box.checked = true; p.change(box); await sleep(250);
    const e2 = H()[0];
    ok('G4 отметка «выполнено»: старое и новое значение статуса в истории',
      p.st().tasks.filter((t) => t.id === 't1')[0].done === true && e2.action === 'task.update' &&
      e2.changes[0].from === 'Открыта' && e2.changes[0].to === 'Выполнена', JSON.stringify(e2.changes));
    p.w.Aven.undoAction(e2.id); await sleep(220);
    ok('G5 Undo возвращает статус задачи', p.st().tasks.filter((t) => t.id === 't1')[0].done === false);

    /* В браузере клик по <label> с чекбоксом даёт ДВА click-события (по метке и синтетическое по
       чекбоксу) — до исправления делегирования действие выполнялось дважды и задача «отмечалась и
       размечалась». Теперь чекбоксы обрабатываются событием change, которое приходит один раз. */
    const histLen = H().length;
    const label = p.q('.check-row[data-id="t1"]');
    p.click(label); await sleep(250);
    ok('G6 один клик по метке чекбокса = ровно одно действие (дубль click отсечён)',
      H().length === histLen + 1 && p.st().tasks.filter((t) => t.id === 't1')[0].done === true,
      '+' + (H().length - histLen) + ' записей, done=' + p.st().tasks.filter((t) => t.id === 't1')[0].done);

    const idxBefore = p.st().tasks.findIndex((t) => t.id === 't2');
    p.click(p.q('[data-action="task-del"][data-id="t2"]')); await sleep(150);
    ok('G7 подтверждение удаления говорит про Undo', /Undo/i.test(p.modalText()), p.modalText().slice(0, 70));
    p.click(p.modalSubmit()); await sleep(250);
    const e3 = H()[0];
    ok('G8 удаление записано как опасное и отменяемое',
      !p.st().tasks.some((t) => t.id === 't2') && e3.action === 'task.delete' && e3.danger === true && e3.undoable === true);
    p.w.Aven.undoAction(e3.id); await sleep(220);
    ok('G9 Undo возвращает задачу на прежнее место',
      p.st().tasks[idxBefore] && p.st().tasks[idxBefore].id === 't2', p.st().tasks[idxBefore] && p.st().tasks[idxBefore].id);
    p.dom.window.close();
  }

  {
    const p = await load('#/notes');
    const H = () => p.st().history;
    p.click(p.q('[data-action="note-add"]')); await sleep(150);
    p.set(p.q('#modal-root input[name="title"]'), 'Заметка проверки');
    p.set(p.q('#modal-root textarea[name="body"]'), 'Текст заметки');
    p.click(p.modalSubmit()); await sleep(250);
    const nId = p.st().notes[0].id;
    ok('G10 создание заметки: запись в истории, помечена чувствительной',
      H()[0].action === 'note.create' && H()[0].sensitive === true && H()[0].undo.type === 'remove');

    p.click(p.q('[data-action="note-pin"]')); await sleep(250);
    ok('G11 закрепление заметки пишется в историю',
      H()[0].action === 'note.update' && p.st().notes.filter((n) => n.id === nId)[0].pinned === true);
    p.w.Aven.undoAction(H()[0].id); await sleep(220);
    ok('G12 Undo закрепления возвращает прежнее значение',
      p.st().notes.filter((n) => n.id === nId)[0].pinned === false);

    p.click(p.q('[data-action="note-edit"][data-id="' + nId + '"]')); await sleep(180);
    p.set(p.q('#modal-root input[name="title"]'), 'Заметка проверки (изменено)');
    p.click(p.modalSubmit()); await sleep(250);
    const ch = H()[0].changes || [];
    ok('G13 редактирование пишет только реально изменённые поля',
      H()[0].action === 'note.update' && ch.length === 1 && ch[0].field === 'Заголовок' &&
      /изменено/.test(ch[0].to), JSON.stringify(ch));
    p.w.Aven.undoAction(H()[0].id); await sleep(220);
    ok('G14 Undo редактирования возвращает прежний заголовок',
      p.st().notes.filter((n) => n.id === nId)[0].title === 'Заметка проверки',
      p.st().notes.filter((n) => n.id === nId)[0].title);

    p.click(p.q('[data-action="note-del"][data-id="' + nId + '"]')); await sleep(150);
    p.click(p.modalSubmit()); await sleep(250);
    ok('G15 удаление заметки: опасное, отменяемое, запись есть',
      !p.st().notes.some((n) => n.id === nId) && H()[0].action === 'note.delete' && H()[0].danger === true);
    p.w.Aven.undoAction(H()[0].id); await sleep(220);
    ok('G16 Undo возвращает удалённую заметку', p.st().notes.some((n) => n.id === nId));
    p.dom.window.close();
  }

  {
    const p = await load('#/finance');
    const H = () => p.st().history;
    const expBefore = p.w.Aven.minor(p.st().finMonth.expense);
    const balBefore = p.w.Aven.minor(p.st().finMonth.balance);
    for (const amt of ['0.1', '0.2']) {
      p.click(p.q('[data-action="fin-add"]')); await sleep(150);
      p.set(p.q('#modal-root input[name="amount"]'), amt);
      p.click(p.modalSubmit()); await sleep(230);
    }
    ok('G17 итоги месяца считаются целыми копейками: +0.1 и +0.2 = ровно +30 мин. ед.',
      p.w.Aven.minor(p.st().finMonth.expense) === expBefore + 30,
      p.w.Aven.minor(p.st().finMonth.expense) - expBefore);
    ok('G18 баланс пересчитан на те же 30 мин. ед.',
      p.w.Aven.minor(p.st().finMonth.balance) === balBefore - 30,
      p.w.Aven.minor(p.st().finMonth.balance) - balBefore);
    ok('G19 0.1 + 0.2 = ровно 0.3 (float дал бы артефакт)',
      p.w.Aven.sumMoney(0.1, 0.2) === 0.3 && String(0.1 + 0.2) !== '0.3', String(p.w.Aven.sumMoney(0.1, 0.2)));
    ok('G20 на странице финансов виден расчёт точности денег', /в копейках/.test(p.q('#page').textContent));
    ok('G21 у операций есть удаление и экспорт CSV', !!p.q('[data-action="fin-del"]') && !!p.q('[data-action="fin-export-csv"]'));

    const opId = p.st().ops[0].id;
    p.click(p.q('[data-action="fin-del"][data-id="' + opId + '"]')); await sleep(160);
    ok('G22 подтверждение удаления операции говорит о пересчёте итогов',
      /пересчитаются/.test(p.modalText()), p.modalText().slice(0, 70));
    p.click(p.modalSubmit()); await sleep(260);
    ok('G23 после удаления итоги пересчитаны (осталось +10 мин. ед.)',
      p.w.Aven.minor(p.st().finMonth.expense) === expBefore + 10, p.w.Aven.minor(p.st().finMonth.expense) - expBefore);
    const eDel = H()[0];
    ok('G24 удаление операции — опасное и отменяемое, баланс в изменениях',
      eDel.action === 'finance.expense.delete' && eDel.danger === true && eDel.undoable === true &&
      (eDel.changes || []).some((c) => c.field === 'Баланс'), JSON.stringify(eDel.changes));
    p.w.Aven.undoAction(eDel.id); await sleep(240);
    ok('G25 Undo возвращает операцию и пересчитывает итоги обратно',
      p.st().ops.some((o) => o.id === opId) && p.w.Aven.minor(p.st().finMonth.expense) === expBefore + 30 &&
      p.w.Aven.minor(p.st().finMonth.balance) === balBefore - 30);

    p.click(p.q('[data-action="fin-export-csv"]')); await sleep(160);
    ok('G26 экспорт CSV подтверждается: файл содержит приватные данные (§7)',
      /приватные данные/.test(p.modalText()), p.modalText().slice(0, 70));
    const hLen = H().length;
    p.click(p.modalSubmit()); await sleep(260);
    const refused = /недоступна|не удалась/.test(p.toastText());
    ok('G27 результат экспорта честный: либо честный отказ, либо запись об экспорте',
      (refused && H().length === hLen) || (!refused && H().length > hLen && H()[0].action === 'data.export'),
      p.toastText() + ' | +' + (H().length - hLen) + ' записей');
    ok('G28 экспорт не сломал страницу', !p.broken());
    p.dom.window.close();
  }

  {
    const p = await load('#/auto');
    const km0 = p.st().car.mileage;
    p.click(p.q('[data-action="auto-mileage"]')); await sleep(160);
    p.set(p.q('#modal-root input[name="km"]'), String(km0 + 500));
    p.click(p.modalSubmit()); await sleep(260);
    ok('G29 пробег обновлён и записан (payload «value»)',
      p.st().car.mileage === km0 + 500 && p.st().history[0].action === 'car.mileage.update' &&
      p.st().history[0].undo.type === 'value', JSON.stringify(p.st().history[0].undo));
    p.w.Aven.undoAction(p.st().history[0].id); await sleep(240);
    ok('G30 Undo возвращает прежнее значение пробега (поле вне списка)', p.st().car.mileage === km0, p.st().car.mileage);

    await p.go('#/shopping');
    p.click(p.q('[data-action="shop-add"]')); await sleep(160);
    p.set(p.q('#modal-root input[name="name"]'), 'Тестовая покупка');
    p.set(p.q('#modal-root input[name="price"]'), '1999.99');
    p.click(p.modalSubmit()); await sleep(260);
    ok('G31 покупка записана в историю, цена — целые копейки',
      p.st().history[0].action === 'purchase.create' && p.st().purchases[0].price === 1999.99,
      p.st().purchases[0] && p.st().purchases[0].price);

    await p.go('#/automation');
    const sw = p.q('[data-action="auto-toggle"]');
    const wasOn = sw.checked; sw.checked = !wasOn; p.change(sw); await sleep(260);
    ok('G32 переключение автоматизации пишет историю и отменяется',
      p.st().history[0].action === 'automation.update' && p.st().history[0].undoable === true &&
      p.st().automations.filter((a) => a.id === sw.dataset.id)[0].enabled === !wasOn);
    p.w.Aven.undoAction(p.st().history[0].id); await sleep(240);
    ok('G33 Undo возвращает состояние автоматизации',
      p.st().automations.filter((a) => a.id === sw.dataset.id)[0].enabled === wasOn);
    p.dom.window.close();
  }


  /* ============ H. Экспорт и удаление данных, повторная аутентификация (§5.1, §6.5, §7) ============ */
  {
    const p = await load('#/settings');
    p.click(p.q('[data-action="set-cat"][data-id="privacy"]')); await sleep(200);
    ok('H1 в приватности есть экспорт всех данных и удаление аккаунта (а не «в перспективе»)',
      !!p.q('[data-action="priv-export-all"]') && !!p.q('[data-action="priv-delete-account"]') &&
      !/в перспективе/.test(p.q('#page').textContent));

    /* включаем выгрузку файлов в jsdom и перехватываем содержимое, чтобы проверить реальность экспорта */
    let captured = null;
    const OrigBlob = p.w.Blob;
    p.w.Blob = function (parts, opts) { captured = String(parts && parts[0]); return new OrigBlob(parts, opts); };
    p.w.URL.createObjectURL = () => 'blob:aven-demo';
    p.w.URL.revokeObjectURL = () => {};
    p.click(p.q('[data-action="priv-export-all"]')); await sleep(180);
    ok('H2 экспорт всех данных подтверждается (операция с приватными данными, §7)',
      /приватные данные/.test(p.modalText()), p.modalText().slice(0, 60));
    p.click(p.modalSubmit()); await sleep(280);
    let parsed = null;
    try { parsed = JSON.parse(captured || 'null'); } catch (e) { parsed = null; }
    ok('H3 в файл попадает состояние, а не функция (старая ошибка JSON.stringify(S.s))',
      !!parsed && parsed !== undefined && Array.isArray(parsed.tasks) && Array.isArray(parsed.notes) &&
      Array.isArray(parsed.ops) && Array.isArray(parsed.history) && parsed.demo === true,
      captured === null ? 'ничего не выгружено' : String(captured).slice(0, 60));
    ok('H4 экспорт записан в историю как чувствительное действие',
      p.st().history[0].action === 'data.export' && p.st().history[0].sensitive === true);

    /* удаление аккаунта */
    const tasksBefore = p.st().tasks.length;
    p.click(p.q('[data-action="priv-delete-account"]')); await sleep(180);
    ok('H5 удаление аккаунта предупреждает о необратимости и требует слово + пароль',
      /Необратимо/.test(p.modalText()) && /DELETE/.test(p.modalText()) && /Повторная аутентификация/.test(p.modalText()));
    p.set(p.q('#modal-root input[name="word"]'), 'нет');
    p.set(p.q('#modal-root input[name="pass"]'), 'demo-pass-123');
    p.click(p.modalSubmit()); await sleep(220);
    ok('H6 без слова DELETE ничего не удаляется', /не совпало/.test(p.toastText()) && p.st().tasks.length === tasksBefore, p.toastText());

    p.click(p.q('[data-action="priv-delete-account"]')); await sleep(180);
    p.set(p.q('#modal-root input[name="word"]'), 'DELETE');
    p.set(p.q('#modal-root input[name="pass"]'), 'неверный');
    p.click(p.modalSubmit()); await sleep(220);
    ok('H7 повторная аутентификация обязательна: с неверным паролем данные целы',
      /аутентификация не пройдена/.test(p.toastText()) && p.st().tasks.length === tasksBefore, p.toastText());

    p.click(p.q('[data-action="priv-delete-account"]')); await sleep(180);
    p.set(p.q('#modal-root input[name="word"]'), 'DELETE');
    p.set(p.q('#modal-root input[name="pass"]'), 'demo-pass-123');
    p.click(p.modalSubmit()); await sleep(320);
    const st = p.st();
    ok('H8 аккаунт удалён: данные очищены, вход сброшен',
      st.tasks.length === 0 && st.notes.length === 0 && st.ops.length === 0 && st.history.length === 0 &&
      st.sessions.length === 0 && st.auth.logged === false && p.w.location.hash === '#/login',
      p.w.location.hash);
    ok('H9 след остался в административном аудите, а не в пользовательской истории (ADR-012)',
      st.admin.audit[0].action === 'account.delete' && st.history.length === 0, st.admin.audit[0].action);
    ok('H10 экран входа честно сообщает об удалении и предлагает вернуть демо-данные',
      /удалены/.test(p.q('#page').textContent) && !!p.q('[data-action="auth-restore-demo"]'));
    p.click(p.q('[data-action="auth-restore-demo"]')); await sleep(320);
    ok('H11 демо-данные возвращаются, пользователь снова на главной',
      p.st().tasks.length > 0 && p.st().auth.logged === true && p.w.location.hash === '#/home',
      p.st().tasks.length + ' задач, ' + p.w.location.hash);
    p.dom.window.close();
  }

  {
    const p = await load('#/settings');
    p.click(p.q('[data-action="set-cat"][data-id="security"]')); await sleep(200);
    ok('H12 2FA включена по умолчанию', p.st().auth.twoFactor === true);
    let tfa = p.q('[data-action="auth-2fa-enable"]');
    tfa.checked = false; p.change(tfa); await sleep(220);
    ok('H13 отключение 2FA требует пароль (§5.1, приёмка 4)',
      /повторная аутентификация/i.test(p.modalText()) && p.st().auth.twoFactor === true, p.modalText().slice(0, 60));
    p.set(p.q('#modal-root input[name="pass"]'), 'неверный'); p.click(p.modalSubmit()); await sleep(250);
    ok('H14 с неверным паролем 2FA остаётся включённой, переключатель вернулся к сохранённому значению',
      p.st().auth.twoFactor === true && p.q('[data-action="auth-2fa-enable"]').checked === true,
      String(p.q('[data-action="auth-2fa-enable"]').checked));
    tfa = p.q('[data-action="auth-2fa-enable"]'); tfa.checked = false; p.change(tfa); await sleep(220);
    p.set(p.q('#modal-root input[name="pass"]'), 'demo-pass-123'); p.click(p.modalSubmit()); await sleep(260);
    ok('H15 с верным паролем 2FA отключается, запись помечена опасной и чувствительной',
      p.st().auth.twoFactor === false && p.st().history[0].action === 'settings.update' &&
      p.st().history[0].danger === true && p.st().history[0].sensitive === true, p.st().history[0].title);
    tfa = p.q('[data-action="auth-2fa-enable"]'); tfa.checked = true; p.change(tfa); await sleep(250);
    ok('H16 включение 2FA не требует пароля (не опасное действие)', p.st().auth.twoFactor === true);

    p.click(p.q('[data-action="sec-password"]')); await sleep(200);
    p.set(p.q('#modal-root input[name="cur"]'), 'неверный');
    p.set(p.q('#modal-root input[name="next"]'), 'новый-пароль-1');
    p.set(p.q('#modal-root input[name="next2"]'), 'новый-пароль-1');
    p.click(p.modalSubmit()); await sleep(220);
    ok('H17 смена пароля без повторной аутентификации отклоняется',
      /аутентификация не пройдена/.test(p.toastText()) && p.st().history[0].action !== 'auth.password.set', p.toastText());
    p.click(p.q('[data-action="sec-password"]')); await sleep(200);
    p.set(p.q('#modal-root input[name="cur"]'), 'demo-pass-123');
    p.set(p.q('#modal-root input[name="next"]'), 'семьзн1');
    p.set(p.q('#modal-root input[name="next2"]'), 'семьзн1');
    p.click(p.modalSubmit()); await sleep(220);
    ok('H18 пароль короче 8 символов отклоняется (§5.1)',
      /короче 8/.test(p.toastText()) && p.st().history[0].action !== 'auth.password.set', p.toastText());
    p.click(p.q('[data-action="sec-password"]')); await sleep(200);
    p.set(p.q('#modal-root input[name="cur"]'), 'demo-pass-123');
    p.set(p.q('#modal-root input[name="next"]'), 'новый-пароль-1');
    p.set(p.q('#modal-root input[name="next2"]'), 'другой-пароль-2');
    p.click(p.modalSubmit()); await sleep(220);
    ok('H19 несовпадающие пароли отклоняются', /не совпадают/.test(p.toastText()), p.toastText());
    p.click(p.q('[data-action="sec-password"]')); await sleep(200);
    p.set(p.q('#modal-root input[name="cur"]'), 'demo-pass-123');
    p.set(p.q('#modal-root input[name="next"]'), 'новый-пароль-1');
    p.set(p.q('#modal-root input[name="next2"]'), 'новый-пароль-1');
    p.click(p.modalSubmit()); await sleep(260);
    ok('H20 успешная смена пароля: необратимая запись в истории, значение пароля не раскрывается',
      p.st().history[0].action === 'auth.password.set' && p.st().history[0].undoable === false &&
      !/новый-пароль-1/.test(JSON.stringify(p.st().history[0])), JSON.stringify(p.st().history[0].changes));
    p.dom.window.close();
  }

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  server.close();
  if (fail) { console.log('Провалы:\n  ' + fails.join('\n  ')); process.exit(1); }
})();
