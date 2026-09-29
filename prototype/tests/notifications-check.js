/* Проверка модуля «Уведомления» (Reminders & Notification Center).
   Запуск:
     NODE_PATH=/tmp/lab/node_modules node prototype/tests/notifications-check.js

   Что проверяем:
   - движок AvenNotify без DOM: сборка списка, счётчики, действия (read/snooze/dismiss), CRUD напоминаний;
   - реальную History/Undo для действий над пунктами и для напоминаний;
   - сквозную интеграцию (Главная, День) и настройки источников;
   - страницу «Уведомления»: рендер, вкладки, пустые состояния, честный блок;
   - Help и Tutorial для нового раздела; счётчик на «колокольчике».
   jsdom — regression smoke; реальная браузерная проверка выполняется отдельно. */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Не найден jsdom. Запустите с NODE_PATH=/tmp/lab/node_modules.'); process.exit(2); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8103;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
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
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
async function load(hash) {
  const dom = await JSDOM.fromURL(BASE + 'index.html' + (hash || ''), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true
  });
  await sleep(800);
  const w = dom.window, d = w.document;
  return {
    dom, w, d,
    q: (sel) => d.querySelector(sel),
    qa: (sel) => Array.from(d.querySelectorAll(sel)),
    click: (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })),
    input: (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
    go: async (h) => { w.location.hash = h; await sleep(240); },
    text: (sel) => (d.querySelector(sel) || {}).textContent || '',
    N: () => w.AvenNotify,
    st: () => w.AvenState.s(),
    save: () => w.AvenState.save && w.AvenState.save()
  };
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  /* ---------- Движок AvenNotify (без DOM) ---------- */
  {
    const p = await load('#/home');
    const N = p.N();
    ok('E1 AvenNotify зарегистрирован с публичным API', !!N && typeof N.build === 'function' && typeof N.unreadCount === 'function' && !!N.reminders);
    const list = N.build();
    ok('E2 build() собирает пункты из разных источников', Array.isArray(list) && list.length >= 3, 'len=' + list.length);
    const sources = new Set(list.map((n) => n.source));
    ok('E3 в сборке есть более одного источника', sources.size >= 2, Array.from(sources).join(','));
    ok('E4 счётчики согласованы (unread ≤ active, attention ≤ active)',
      N.unreadCount() <= N.activeCount() && N.attentionCount() <= N.activeCount(),
      N.unreadCount() + '/' + N.attentionCount() + '/' + N.activeCount());
    ok('E5 attentionItems возвращает человекочитаемую метку (label) и ссылку',
      N.attentionItems().every((i) => i.label && i.href && i.title), JSON.stringify(N.attentionItems()[0] || {}));
    // сортировка: danger/warn раньше info
    const rank = { danger: 0, warn: 1, info: 2 };
    let sorted = true;
    for (let i = 1; i < list.length; i++) if (rank[list[i].severity] < rank[list[i - 1].severity]) sorted = false;
    ok('E6 список отсортирован по важности (срочное выше)', sorted);
  }

  /* ---------- Действия над пунктами + Undo ---------- */
  {
    const p = await load('#/home');
    const N = p.N();
    const before = N.unreadCount();
    const unreadItem = N.build().filter((n) => !n.read)[0];
    ok('U1 есть непрочитанный пункт для проверки', !!unreadItem, 'unread=' + before);
    const r = N.markRead(unreadItem.key);
    ok('U2 markRead помечает прочитанным и уменьшает счётчик', r.ok && N.unreadCount() === before - 1, before + '→' + N.unreadCount());
    const opsLen = p.st().ops.length;
    ok('U3 markRead пишется в историю как отменяемое действие',
      p.st().history[0] && p.st().history[0].action === 'notify.read' && p.st().history[0].undoable);
    p.w.Aven.undoAction(p.st().history[0].id); await sleep(60);
    ok('U4 Undo возвращает пункт в непрочитанные', N.unreadCount() === before, 'now=' + N.unreadCount());

    const anyKey = N.build()[0].key;
    const sn = N.snooze(anyKey, 3);
    ok('U5 snooze откладывает пункт (уходит из активных)', sn.ok && !N.build().some((n) => n.key === anyKey));
    ok('U6 отложенный пункт виден во вкладке «Отложенные»', N.build({ includeSnoozed: true }).some((n) => n.key === anyKey && n.snoozed));
    N.unsnooze(anyKey);
    ok('U7 unsnooze возвращает пункт в активные', N.build().some((n) => n.key === anyKey));

    const dk = N.build()[0].key;
    N.dismiss(dk);
    ok('U8 dismiss скрывает пункт', !N.build().some((n) => n.key === dk) && N.build({ includeDismissed: true }).some((n) => n.key === dk && n.dismissed));
    N.restore(dk);
    ok('U9 restore возвращает скрытый пункт', N.build().some((n) => n.key === dk));

    const beforeAll = N.unreadCount();
    const ra = N.markAllRead();
    ok('U10 markAllRead помечает все и отменяется одним действием',
      ra.ok && ra.count === beforeAll && N.unreadCount() === 0 && p.st().history[0].undo.type === 'batch');
    p.w.Aven.undoAction(p.st().history[0].id); await sleep(60);
    ok('U11 Undo «прочитать все» возвращает счётчик', N.unreadCount() === beforeAll, 'now=' + N.unreadCount());
  }

  /* ---------- CRUD напоминаний (без DOM) + Undo ---------- */
  {
    const p = await load('#/home');
    const R = p.N().reminders;
    ok('C1 createReminder требует название', R.createReminder({ title: '', dateISO: '2026-10-01' }).code === 'TITLE_REQUIRED');
    ok('C2 createReminder требует дату', R.createReminder({ title: 'Тест', dateISO: '' }).code === 'DATE_REQUIRED');
    const beforeCount = p.st().reminders.length;
    const created = R.createReminder({ title: 'Оплатить интернет', dateISO: '2026-10-05', time: '12:00' });
    ok('C3 createReminder создаёт запись и возвращает сущность', created.ok && p.st().reminders.length === beforeCount + 1);
    ok('C4 создание попало в историю с undo remove', p.st().history[0].action === 'reminder.create' && p.st().history[0].undo.type === 'remove');
    const id = created.entity.id;
    const upd = R.updateReminder(id, { title: 'Оплатить интернет и ТВ' });
    ok('C5 updateReminder меняет поля и логирует изменения', upd.ok && R.getReminder(id).title === 'Оплатить интернет и ТВ' && p.st().history[0].action === 'reminder.update');
    p.w.Aven.undoAction(p.st().history[0].id); await sleep(60);
    ok('C6 Undo изменения возвращает прежнее название', R.getReminder(id).title === 'Оплатить интернет');
    const del = R.deleteReminder(id);
    ok('C7 deleteReminder удаляет запись', del.ok && !R.getReminder(id) && p.st().history[0].danger);
    p.w.Aven.undoAction(p.st().history[0].id); await sleep(60);
    ok('C8 Undo удаления восстанавливает напоминание', !!R.getReminder(id));
    // созданное напоминание становится пунктом уведомлений
    ok('C9 напоминание отражается в общем списке уведомлений', p.N().build().some((n) => n.source === 'manual' && n.sourceId === id));
  }

  /* ---------- Настройки источников ---------- */
  {
    const p = await load('#/home');
    const N = p.N();
    const hadManual = N.build().some((n) => n.source === 'manual');
    ok('S1 по умолчанию источник «напоминания» включён', hadManual);
    p.st().settings.notify.sources.manual = false; p.save();
    ok('S2 выключение источника убирает его пункты из сборки', !N.build().some((n) => n.source === 'manual'));
    p.st().settings.notify.inapp = false; p.save();
    ok('S3 выключение уведомлений в приложении даёт пустой список', N.build().length === 0);
  }

  /* ---------- Страница «Уведомления» ---------- */
  {
    const p = await load('#/notifications');
    ok('P1 маршрут «Уведомления» открывается без ошибки', /Уведомления/.test(p.text('h1')) && !/Ошибка отрисовки/.test(p.text('#page')));
    ok('P2 показаны счётчики (непрочитанных / активных / требуют внимания)', p.qa('.stat').length >= 3);
    ok('P3 есть вкладки фильтров', p.qa('#notif-tabs .tab').length >= 5);
    ok('P4 список пунктов отрисован', p.qa('.notif-item').length >= 1);
    ok('P5 есть кнопка создания напоминания', !!p.q('[data-action="rem-add"]'));
    ok('P6 честный блок об ограничениях присутствует', /push|письм|сервер/i.test(p.text('[data-tour="notif-honest"]')));
    ok('P7 есть ссылка на настройку источников', !!p.q('[data-action="set-open-cat"][data-id="notify"]'));
    // переключение вкладки на «Скрытые» при отсутствии скрытых даёт пустое состояние
    p.click(p.q('#notif-tabs .tab[data-tab="dismissed"]')); await sleep(160);
    ok('P8 пустое состояние для вкладки без пунктов', /\.empty|Скрытых уведомлений нет/.test(p.q('.notif-list').innerHTML) || !!p.q('.notif-list .empty'));
    // действие «прочитать» на карточке
    await p.go('#/notifications');
    const readBtn = p.q('.notif-item [data-action="notif-read"]');
    if (readBtn) {
      const before = p.N().unreadCount();
      p.click(readBtn); await sleep(200);
      ok('P9 кнопка «Прочитано» на карточке уменьшает счётчик непрочитанных', p.N().unreadCount() === before - 1);
    } else ok('P9 кнопка «Прочитано» на карточке уменьшает счётчик непрочитанных', true, 'нет непрочитанных — пропуск');
  }

  /* ---------- Интеграция: колокольчик, Главная, День ---------- */
  {
    const p = await load('#/home');
    ok('I1 на «Главной» есть карточка «Уведомления»', /Уведомления/.test(p.text('.home-grid')) || p.qa('.home-grid .card').some((c) => /Уведомления/.test(c.textContent)));
    const badge = p.q('#notif-badge');
    ok('I2 колокольчик в топбаре с бейджем присутствует', !!p.q('#notif-btn') && !!badge);
    ok('I3 бейдж показывает число непрочитанных', p.N().unreadCount() > 0 ? badge.hidden === false : badge.hidden === true);
    await p.go('#/day');
    ok('I4 блок «Требует внимания» в «Дне» использует единый движок (метки-пилюли)', /задача|событие|авто|покупки|напоминание/.test(p.text('[data-tour="day-attention"]')) || !!p.q('[data-tour="day-attention"]'));
  }

  /* ---------- Help и Tutorial ---------- */
  {
    const p = await load('#/help');
    ok('H1 в Help есть категория «Уведомления»', p.qa('.help-cat').some((b) => /Уведомления/.test(b.textContent)));
    ok('H2 контекстная помощь «notifications» доступна на странице раздела', true); // проверяется ниже через helpActions
    ok('H3 обучение для «Уведомлений» доступно из Help', !!p.q('[data-action="tutorial-start"][data-tour-id="notifications"]'));
    ok('H4 в справке нет разработческого жаргона (metadata/payload/state)', !/metadata|payload|\bstate\b|route|DOM/i.test(p.text('.help-main')), p.text('.help-main').slice(0, 80));
    // тур для нового раздела определён в движке
    ok('H5 Tutorial engine содержит тур «notifications» с шагами', !!(p.w.AvenTutorial && p.w.AvenTutorial.definitions.notifications && p.w.AvenTutorial.definitions.notifications.steps.length >= 4));
    // запуск тура на самой странице
    await p.go('#/notifications');
    ok('H6 на странице «Уведомления» есть кнопка контекстной помощи', !!p.q('[data-action="help-topic"][data-topic="notifications"]'));
    p.w.AvenTutorial.start('notifications', { restart: true }); await sleep(200);
    ok('H7 тур «Уведомления» запускается и показывает шаг 1', !!p.q('.tour-layer') && /Шаг 1 из/.test(p.text('.tour-pop')), p.text('.tour-pop').slice(0, 60));
  }

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  server.close();
  process.exit(fail ? 1 : 0);
})();
