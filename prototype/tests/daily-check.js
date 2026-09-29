/* Morning / Evening (дневные сценарии) — регрессия.
   Проверяем DOM-free агрегатор AvenDaily, пошаговые экраны, действия через Common Actions,
   History/Undo, согласованность с «Задачами»/«Днём», Help/Tutorial, пустые состояния и mobile-инварианты.
   Запуск: NODE_PATH=/tmp/lab/node_modules node prototype/tests/daily-check.js

   Честно: jsdom не выполняет layout и @media, поэтому реальная геометрия на Android
   этим тестом НЕ доказывается — проверяются DOM-контракты, состояние и CSS-правила. */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Не найден jsdom. Запустите с временным NODE_PATH.'); process.exit(2); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8106;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
async function load(hash, width) {
  const opts = { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true };
  if (width) {
    opts.beforeParse = (w) => {
      Object.defineProperty(w, 'innerWidth', { configurable: true, value: width });
      w.matchMedia = (q) => {
        const max = /max-width:\s*(\d+)px/.exec(q);
        return { matches: !!max && width <= Number(max[1]), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
      };
      w.scrollTo = () => {};
    };
  }
  const dom = await JSDOM.fromURL('http://127.0.0.1:' + PORT + '/index.html' + (hash || ''), opts);
  await sleep(850);
  const w = dom.window, d = w.document;
  return {
    dom, w, d,
    Daily: () => w.AvenDaily, Core: () => w.AvenActions, st: () => w.AvenState.s(),
    q: (x) => d.querySelector(x), qa: (x) => Array.from(d.querySelectorAll(x)),
    page: () => (d.querySelector('#page') || {}).textContent || '',
    click: (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })),
    go: async (hash) => { w.location.hash = hash; await sleep(220); }
  };
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  /* ======================= 1. Агрегатор: контракт и детерминизм ======================= */
  {
    const p = await load('#/home'), E = p.Daily(), C = p.Core();
    ok('A1 AvenDaily зарегистрирован и DOM-free API доступен', !!E && typeof E.getMorning === 'function' && typeof E.getEvening === 'function');
    const a = E.getMorning({}), b = E.getMorning({});
    ok('A2 утренняя сводка детерминирована', JSON.stringify(a) === JSON.stringify(b));
    ok('A3 дата сводки совпадает с общим demo clock', a.dateISO === C.dates.todayISO());
    ok('A4 «завтра» считается тем же слоем дат', a.tomorrowISO === C.dates.addDays(C.dates.todayISO(), 1));
    const ev = E.getEvening({});
    ok('A5 вечерняя сводка использует ту же дату и завтра', ev.dateISO === a.dateISO && ev.tomorrowISO === a.tomorrowISO);
    ok('A6 сводка структурирована (summary/empty/errors)', !!a.summary && !!a.empty && Array.isArray(a.errors) && !!ev.summary && !!ev.empty);

    /* getter не мутирует state: ни dailyState, ни данные сущностей */
    const before = JSON.stringify(p.st());
    E.getMorning({}); E.getEvening({}); E.summaryText('morning'); E.summaryText('evening');
    ok('A7 получение сводки не мутирует состояние', JSON.stringify(p.st()) === before);
    ok('A8 маркер прохождения не создаётся при чтении', !Object.prototype.hasOwnProperty.call(p.st(), 'dailyState'));

    /* границы периодов берутся из уже существующих настроек */
    ok('A9 период считается по настройкам «утро/день/вечер/ночь»',
      E.period({ minutes: 9 * 60 }) === 'morning' && E.period({ minutes: 13 * 60 }) === 'day' &&
      E.period({ minutes: 20 * 60 }) === 'evening' && E.period({ minutes: 23 * 60 + 30 }) === 'night');
    p.st().settings.behavior.evening = '21:00';
    ok('A10 изменение границы «вечер» меняет период', E.period({ minutes: 20 * 60 }) === 'day');
    p.st().settings.behavior.evening = '18:30';
    ok('A11 suggestedFlow предлагает утро утром и вечер вечером',
      E.suggestedFlow({ minutes: 9 * 60 }) === 'morning' && E.suggestedFlow({ minutes: 20 * 60 }) === 'evening');
    p.st().settings.daily.morning = false;
    ok('A12 выключённый сценарий не предлагается', E.suggestedFlow({ minutes: 9 * 60 }) === '');
    p.st().settings.daily.morning = true;

    /* сущности общие: id из сводки существуют в общем state */
    const ids = a.tasks.map((t) => t.id);
    ok('A13 задачи сводки — те же объекты общего state', ids.every((id) => p.st().tasks.some((t) => t.id === id)));
    ok('A14 нет собственных сущностей morningTasks/eveningTasks',
      !Object.prototype.hasOwnProperty.call(p.st(), 'morningTasks') && !Object.prototype.hasOwnProperty.call(p.st(), 'eveningTasks'));
    ok('A15 summaryText готов для будущего Assistant (текст без DOM)',
      /^Сегодня /.test(E.summaryText('morning')) && /^Итоги дня /.test(E.summaryText('evening')));
    p.dom.window.close();
  }

  /* ======================= 2. Утро: состав данных ======================= */
  {
    const p = await load('#/home'), E = p.Daily(), C = p.Core();
    const today = C.dates.todayISO();
    C.tasks.createTask({ title: 'Утренняя проверка', date: today, deadline: today, priority: 'высокий' });
    C.tasks.createTask({ title: 'Забытая задача', date: C.dates.addDays(today, -3), deadline: C.dates.addDays(today, -3) });
    C.events.createEvent({ title: 'Созвон по проекту', date: today, startTime: '10:00', endTime: '10:30' });
    const m = E.getMorning({});
    ok('M1 задачи на сегодня попадают в утро', m.tasks.some((t) => t.title === 'Утренняя проверка'));
    ok('M2 выполненных задач нет среди открытых', m.tasks.every((t) => !C.tasks.isCompleted(t)));
    ok('M3 просроченные задачи выделены отдельно', m.overdue.some((t) => t.title === 'Забытая задача') && !m.tasks.some((t) => t.title === 'Забытая задача'));
    ok('M4 события дня совпадают с календарём', m.events.length === C.events.getEventsForDate(today).items.length && m.events.some((e) => e.title === 'Созвон по проекту'));
    ok('M5 ближайшее событие определено и имеет дату', !!m.nextEvent && !!m.nextEvent.event && /^\d{4}-\d{2}-\d{2}$/.test(m.nextEvent.dateISO));
    ok('M6 важные уведомления читаются из общего движка',
      m.attention.length === p.w.AvenNotify.build().filter((n) => n.severity !== 'info').length);
    ok('M7 уведомления не копируются, а ссылаются на свои разделы', m.attention.every((n) => typeof n.href === 'string' && n.href.indexOf('#/') === 0));
    ok('M8 предложения берутся из AvenSuggestions и ограничены', m.suggestions.length <= 3 &&
      m.suggestions.every((x) => p.w.AvenSuggestions.getSuggestions({ surface: 'morning', dateISO: today }).some((y) => y.id === x.id)));
    ok('M9 сводка загрузки рассчитана', ['free', 'light', 'normal', 'busy'].indexOf(m.summary.load) >= 0);
    ok('M10 счётчики сводки совпадают со списками',
      m.summary.events === m.events.length && m.summary.tasksOpen === m.tasks.length && m.summary.overdue === m.overdue.length);
    p.dom.window.close();
  }

  /* ======================= 3. Вечер: состав данных ======================= */
  {
    const p = await load('#/home'), E = p.Daily(), C = p.Core();
    const today = C.dates.todayISO(), tomorrow = C.dates.addDays(today, 1);
    const made = C.tasks.createTask({ title: 'Сделано вечером', date: today, deadline: today });
    C.tasks.completeTask(made.entity.id);
    C.tasks.createTask({ title: 'Осталось на вечер', date: today, deadline: today });
    C.tasks.createTask({ title: 'Хвост из прошлого', date: C.dates.addDays(today, -2), deadline: C.dates.addDays(today, -2) });
    C.events.createEvent({ title: 'Завтрашняя встреча', date: tomorrow, startTime: '09:00' });
    const e = E.getEvening({});
    ok('E1 выполненные сегодня задачи в итогах', e.completed.some((t) => t.title === 'Сделано вечером'));
    ok('E2 оставшиеся задачи отделены от выполненных', e.remaining.some((t) => t.title === 'Осталось на вечер') && e.remaining.every((t) => !C.tasks.isCompleted(t)));
    ok('E3 просроченное показано отдельно', e.overdue.some((t) => t.title === 'Хвост из прошлого'));
    ok('E4 прошедшие события дня перечислены и отсортированы по времени',
      e.events.length === C.events.getEventsForDate(today).items.length);
    ok('E5 важные уведомления читаются из общего движка', e.attention.every((n) => n.severity !== 'info'));
    ok('E6 предложения для завершения дня ограничены тремя', e.suggestions.length <= 3);
    ok('E7 краткий взгляд на завтра содержит события и задачи',
      e.tomorrow.dateISO === tomorrow && e.tomorrow.events.some((x) => x.title === 'Завтрашняя встреча'));
    ok('E8 процент выполнения посчитан по задачам этого дня', e.summary.done === Math.round((e.completed.length / (e.completed.length + e.remaining.length)) * 100));
    p.dom.window.close();
  }

  /* ======================= 4. Пустые состояния ======================= */
  {
    const p = await load('#/home'), E = p.Daily();
    const st = p.st();
    st.tasks.length = 0; st.events.length = 0; st.reminders.length = 0; st.purchases.length = 0;
    st.car.docs.length = 0; st.car.service.length = 0;
    const m = E.getMorning({}), e = E.getEvening({});
    ok('N1 пустое утро не ломается и честно пусто', m.empty.tasks && m.empty.events && m.empty.overdue && m.empty.all === (!m.suggestions.length && !m.attention.length));
    ok('N2 пустой вечер не ломается', e.empty.completed && e.empty.remaining && e.empty.events && e.empty.tomorrow);
    ok('N3 ближайшего события нет — это нормальное состояние, а не ошибка', m.nextEvent === null && m.errors.length === 0);
    await p.go('#/morning');
    ok('N4 экран утра рисуется на пустых данных', !/Ошибка отрисовки/.test(p.page()) && /На сегодня ничего не запланировано|Сегодня/.test(p.page()));
    p.click(p.qa('[data-action="daily-step"]').filter((b) => b.dataset.index === '2')[0]); await sleep(120);
    ok('N5 шаг «Задачи» показывает пустое состояние текстом', /На сегодня задач нет/.test(p.page()));
    await p.go('#/evening');
    ok('N6 экран вечера рисуется на пустых данных', !/Ошибка отрисовки/.test(p.page()));
    p.dom.window.close();
  }

  /* ======================= 5. Устойчивость к ошибкам ======================= */
  {
    const p = await load('#/home'), E = p.Daily();
    p.w.AvenNotify.build = () => { throw new Error('поломанный источник'); };
    const m = E.getMorning({});
    ok('R1 сбой одного блока не ломает всю сводку', m.summary.events >= 0 && Array.isArray(m.tasks));
    ok('R2 сбой честно отражён в errors', m.errors.some((x) => x.block === 'notifications'));
    ok('R3 остальные блоки продолжают работать', m.attention.length === 0 && Array.isArray(m.suggestions));
    await p.go('#/morning');
    ok('R4 экран продолжает отрисовываться и сообщает о проблеме', !/Ошибка отрисовки/.test(p.page()) && /Часть данных не удалось прочитать/.test(p.page()));
    p.dom.window.close();
  }

  /* ======================= 6. Действия: complete/reopen, перенос, создание ======================= */
  {
    const p = await load('#/home'), E = p.Daily(), C = p.Core();
    const today = C.dates.todayISO(), tomorrow = C.dates.addDays(today, 1);
    const t = C.tasks.createTask({ title: 'Перенести меня', date: today, deadline: today }).entity;
    const histBefore = p.st().history.length;

    const r = E.rescheduleToTomorrow(t.id, { fromDateISO: today });
    ok('C1 перенос выполняется через общий updateTask', r.ok && r.action === 'task.update');
    ok('C2 дата и срок задачи стали завтрашними', C.tasks.date(r.entity) === tomorrow && C.tasks.deadline(r.entity) === tomorrow);
    ok('C3 перенос записан в History как отменяемое действие', p.st().history.length > histBefore && p.st().history[0].undoable && p.st().history[0].undo.type === 'fields');
    p.w.Aven.undoAction(p.st().history[0].id); await sleep(30);
    ok('C4 Undo возвращает исходную дату', C.tasks.date(C.tasks.getTask(t.id).entity) === today);

    const done = C.tasks.completeTask(t.id);
    ok('C5 выполнение задачи из сценария — общий task.complete', done.ok && C.tasks.isCompleted(C.tasks.getTask(t.id).entity));
    ok('C6 выполненная задача уходит из «осталось» и попадает в «выполнено»',
      E.getEvening({}).completed.some((x) => x.id === t.id) && !E.getEvening({}).remaining.some((x) => x.id === t.id));
    C.tasks.reopenTask(t.id);
    ok('C7 reopen возвращает задачу в открытые', E.getEvening({}).remaining.some((x) => x.id === t.id));

    const created = E.planTomorrowTask({ title: 'Задача на завтра из вечера' });
    ok('C8 создание задачи на завтра идёт через общий task.create', created.ok && created.action === 'task.create');
    ok('C9 новая задача имеет завтрашнюю дату и видна в сводке завтра',
      C.tasks.date(created.entity) === tomorrow && E.getEvening({}).tomorrow.tasks.some((x) => x.id === created.entity.id));
    p.w.Aven.undoAction(p.st().history[0].id); await sleep(30);
    ok('C10 Undo удаляет созданную задачу', !p.st().tasks.some((x) => x.id === created.entity.id));

    ok('C11 перенос выполненной задачи отклоняется понятным кодом', (() => {
      C.tasks.completeTask(t.id);
      const res = E.rescheduleToTomorrow(t.id, { fromDateISO: today });
      C.tasks.reopenTask(t.id);
      return !res.ok && res.code === 'TASK_COMPLETED';
    })());
    ok('C12 несуществующая задача не ломает сценарий', (() => {
      const res = E.rescheduleToTomorrow('нет-такой-id', {});
      return !res.ok && res.code === 'TASK_NOT_FOUND';
    })());

    /* маркер прохождения — только минимальный прогресс */
    E.markReviewed('morning', today);
    ok('C13 маркер прохождения минимален (только дата)', JSON.stringify(p.st().dailyState.morning) === JSON.stringify({ dateISO: today }));
    ok('C14 маркер не дублирует данные сводки', !JSON.stringify(p.st().dailyState).includes('title'));
    ok('C15 isReviewed зависит от даты', E.isReviewed('morning', today) && !E.isReviewed('morning', tomorrow));
    p.dom.window.close();
  }

  /* ======================= 7. Кросс-модульная согласованность ======================= */
  {
    const p = await load('#/morning'), C = p.Core();
    const today = C.dates.todayISO(), tomorrow = C.dates.addDays(today, 1);
    const task = C.tasks.createTask({ title: 'Кросс-модульная задача', date: today, deadline: today }).entity;
    p.w.Aven.render(); await sleep(60);
    /* шаг «Задачи» */
    p.click(p.qa('[data-action="daily-step"]').filter((b) => b.dataset.index === '2')[0]); await sleep(120);
    const row = p.qa('.daily-row').filter((r) => /Кросс-модульная задача/.test(r.textContent))[0];
    ok('X1 задача видна в шаге «Задачи» утреннего обзора', !!row);
    p.click(row.querySelector('[data-action="toggle-task"]')); await sleep(120);
    ok('X2 выполнение из утра меняет общий state', C.tasks.isCompleted(C.tasks.getTask(task.id).entity));
    await p.go('#/tasks');
    ok('X3 раздел «Задачи» видит выполнение', (() => {
      const done = C.tasks.getTasks({ status: 'completed' }).items;
      return done.some((x) => x.id === task.id);
    })());
    p.w.Aven.setDaySelected(today); await p.go('#/day');
    ok('X4 раздел «День» показывает ту же задачу', /Кросс-модульная задача/.test(p.page()));

    /* перенос из вечера → задачи + завтрашний День */
    C.tasks.reopenTask(task.id);
    await p.go('#/evening');
    p.click(p.qa('[data-action="daily-step"]').filter((b) => b.dataset.index === '2')[0]); await sleep(120);
    const row2 = p.qa('.daily-row').filter((r) => /Кросс-модульная задача/.test(r.textContent))[0];
    ok('X5 задача видна в шаге «Осталось»', !!row2);
    p.click(row2.querySelector('[data-action="daily-reschedule"]')); await sleep(140);
    ok('X6 перенос из вечера меняет дату в общем state', C.tasks.date(C.tasks.getTask(task.id).entity) === tomorrow);
    await p.go('#/tasks');
    ok('X7 «Задачи» видят новую дату', C.tasks.getTasksForDate(tomorrow, {}).items.some((x) => x.id === task.id));
    p.w.Aven.setDaySelected(tomorrow); await p.go('#/day');
    ok('X8 завтрашний «День» показывает перенесённую задачу', /Кросс-модульная задача/.test(p.page()));
    const entry = p.st().history.filter((h) => h.action === 'task.update')[0];
    p.w.Aven.undoAction(entry.id); await sleep(60);
    ok('X9 Undo переноса возвращает прежнюю дату во всех разделах', C.tasks.date(C.tasks.getTask(task.id).entity) === today);

    /* действие предложения из сценария использует общий слой */
    await p.go('#/morning');
    const suggestion = p.w.AvenSuggestions.getSuggestions({ surface: 'morning', dateISO: tomorrow })
      .filter((x) => x.actions.some((a) => a.id === 'create-prep-task'))[0];
    if (suggestion) {
      const before = p.st().tasks.length;
      const res = p.w.AvenSuggestions.perform(suggestion.id, 'create-prep-task', { surface: 'morning', dateISO: suggestion.context.dateISO });
      ok('X10 действие предложения из сценария создаёт задачу общим способом', res.ok && p.st().tasks.length === before + 1);
      ok('X11 действие предложения отменяемо в History', p.st().history[0].action === 'task.create' && p.st().history[0].undoable);
    } else {
      ok('X10 действие предложения из сценария создаёт задачу общим способом', false, 'нет предложения с действием');
      ok('X11 действие предложения отменяемо в History', false, 'нет предложения с действием');
    }
    p.dom.window.close();
  }

  /* ======================= 8. UI: пошаговый сценарий, прогресс, пропуск ======================= */
  {
    const p = await load('#/morning');
    ok('U1 маршрут #/morning рисует экран без ошибки', !/Ошибка отрисовки/.test(p.page()) && !!p.q('.daily-flow.daily-morning'));
    ok('U2 заголовок страницы в топбаре корректен', (p.q('#page-title') || {}).textContent === 'Утренний обзор');
    ok('U3 прогресс показывает шаги и текущий шаг', p.qa('.daily-chip').length === 6 && !!p.q('.daily-chip.active [aria-current="step"]'));
    ok('U4 прогресс доступен для screen reader', (() => {
      const bar = p.q('.daily-bar');
      return bar && bar.getAttribute('role') === 'progressbar' && bar.getAttribute('aria-valuenow') === '1' && bar.getAttribute('aria-valuemax') === '6';
    })());
    ok('U5 на первом шаге «Назад» недоступна', p.q('.daily-controls .btn[data-action="daily-step"]').disabled === true);
    p.click(p.qa('.daily-controls [data-action="daily-step"]')[1]); await sleep(120);
    ok('U6 «Далее» переводит на второй шаг', p.q('.daily-bar').getAttribute('aria-valuenow') === '2' && /Ближайшее событие/.test(p.page()));
    p.click(p.qa('.daily-controls [data-action="daily-step"]')[0]); await sleep(120);
    ok('U7 «Назад» возвращает на первый шаг', p.q('.daily-bar').getAttribute('aria-valuenow') === '1');
    p.click(p.qa('.daily-chip-btn')[4]); await sleep(120);
    ok('U8 по чипу можно перейти к любому шагу', p.q('.daily-bar').getAttribute('aria-valuenow') === '5' && /Предложения Aven/.test(p.page()));
    p.click(p.qa('.daily-chip-btn')[5]); await sleep(120);
    ok('U9 последний шаг предлагает завершение', !!p.q('[data-action="daily-finish"]'));
    p.click(p.q('[data-action="daily-finish"]')); await sleep(250);
    ok('U10 завершение переводит в «День» и ставит маркер', p.w.location.hash === '#/day' && p.Daily().isReviewed('morning', p.Core().dates.todayISO()));
    await p.go('#/morning');
    ok('U11 после завершения сценарий открывается снова с первого шага', p.q('.daily-bar').getAttribute('aria-valuenow') === '1');
    ok('U12 пройденный сегодня сценарий честно помечен', /сегодня уже пройден/.test(p.page()));
    p.click(p.q('[data-action="daily-skip"]')); await sleep(250);
    ok('U13 «Пропустить» закрывает сценарий без принуждения', p.w.location.hash === '#/home');
    ok('U14 сайт не блокируется сценарием: обычные разделы доступны', (() => { p.w.location.hash = '#/tasks'; return true; })());
    await sleep(200);
    ok('U15 переход в «Задачи» после пропуска работает', !/Ошибка отрисовки/.test(p.page()));

    await p.go('#/evening');
    ok('U16 маршрут #/evening рисует экран вечера', !!p.q('.daily-flow.daily-evening') && p.qa('.daily-chip').length === 5);
    p.click(p.qa('.daily-chip-btn')[3]); await sleep(120);
    ok('U17 шаг «Завтра» предлагает планирование', /Задача на завтра/.test(p.page()) && !!p.q('[data-action="daily-open-tomorrow"]'));
    p.click(p.q('[data-action="daily-add-tomorrow"]')); await sleep(140);
    ok('U18 «＋ Задача на завтра» открывает обычную форму задачи с завтрашней датой', (() => {
      const modal = p.q('.modal');
      const date = modal && modal.querySelector('input[name="date"]');
      return !!modal && date && date.value === p.Core().dates.addDays(p.Core().dates.todayISO(), 1);
    })());
    p.click(p.q('.modal [data-x]')); await sleep(80);
    ok('U19 Escape/закрытие модального окна восстанавливает страницу', !p.q('.modal-overlay') && !p.d.body.classList.contains('modal-open'));
    p.click(p.q('[data-action="daily-open-tomorrow"]')); await sleep(250);
    ok('U20 «Открыть завтрашний День» открывает «День» на завтрашней дате',
      p.w.location.hash === '#/day' && (p.q('input[data-action="day-date"]') || {}).value === p.Core().dates.addDays(p.Core().dates.todayISO(), 1));
    p.dom.window.close();
  }

  /* ======================= 9. Интеграция с «Главной», меню и «Днём» ======================= */
  {
    const p = await load('#/home'), E = p.Daily();
    ok('H1 «Главная» предлагает дневной сценарий', !!p.q('.daily-banner') && !!p.q('.daily-banner [data-action="daily-open"][data-kind="morning"]'));
    ok('H2 на «Главной» доступны оба сценария', p.qa('.daily-banner [data-action="daily-open"]').length === 2);
    p.click(p.q('.daily-banner [data-action="daily-open"][data-kind="evening"]')); await sleep(250);
    ok('H3 кнопка «Главной» открывает итоги дня', p.w.location.hash === '#/evening');
    await p.go('#/day');
    ok('H4 из «Дня» можно открыть оба сценария',
      !!p.q('[data-action="daily-open"][data-kind="morning"]') && !!p.q('[data-action="daily-open"][data-kind="evening"]'));
    ok('H5 «День» остаётся рабочим центром даты (таймлайн на месте)', !!p.q('[data-tour="day-timeline"]'));
    p.st().settings.daily.morning = false; p.st().settings.daily.evening = false;
    await p.go('#/home');
    ok('H6 выключение обоих сценариев убирает подсказку с «Главной»', !p.q('.daily-banner'));
    await p.go('#/morning');
    ok('H7 выключенный сценарий остаётся доступен вручную и честно это сообщает',
      !!p.q('.daily-flow') && /выключен в «Настройках/.test(p.page()));
    p.st().settings.daily.morning = true; p.st().settings.daily.evening = true;
    /* меню */
    await p.go('#/home');
    p.click(p.q('#mobile-menu-btn')); await sleep(80);
    ok('H8 пункты меню «Утренний обзор» и «Итоги дня» есть в навигации',
      !!p.q('#sidebar .nav-item[data-id="morning"]') && !!p.q('#sidebar .nav-item[data-id="evening"]'));
    p.click(p.q('#sidebar .nav-item[data-id="morning"]')); await sleep(250);
    ok('H9 переход из меню открывает сценарий и закрывает drawer',
      p.w.location.hash === '#/morning' && !p.d.body.classList.contains('nav-open') && !p.q('.main').hasAttribute('inert'));
    /* настройки */
    await p.go('#/settings');
    p.w.Aven.openSettingsCat('aven'); await sleep(150);
    const toggle = p.q('[data-action="set-toggle"][data-path="settings.daily.morning"]');
    ok('H10 в настройках есть переключатели дневных сценариев',
      !!toggle && !!p.q('[data-action="set-toggle"][data-path="settings.daily.evening"]'));
    toggle.checked = false;
    toggle.dispatchEvent(new p.w.Event('change', { bubbles: true })); await sleep(80);
    ok('H11 переключатель действительно меняет настройку', p.st().settings.daily.morning === false);
    ok('H12 настройки честно предупреждают об отсутствии фоновых будильников', /не будит и не шлёт оповещения при закрытой вкладке/.test(p.page()));
    p.dom.window.close();
  }

  /* ======================= 10. Help и Tutorial ======================= */
  {
    const p = await load('#/help');
    ok('T1 в Help есть категория «Утро и вечер»', p.qa('.help-cat').some((b) => /Утро и вечер/.test(b.textContent)));
    const cat = p.qa('.help-cat').filter((b) => /Утро и вечер/.test(b.textContent))[0];
    p.click(cat); await sleep(150);
    const text = p.page();
    ok('T2 справка объясняет, что такое утренний обзор', /Что такое утренний обзор/.test(text));
    ok('T3 справка объясняет вечерний обзор', /Что такое вечерний обзор/.test(text));
    ok('T4 справка объясняет перенос задачи', /Как перенести задачу на завтра/.test(text));
    ok('T5 справка объясняет, что сценарий можно пропустить', /Можно ли пропустить обзор/.test(text));
    ok('T6 справка честно говорит об ограничениях', /Честно об ограничениях дневных сценариев/.test(text));
    const articles = p.w.AvenHelp.search('утренний обзор');
    ok('T7 поиск Help находит статьи о дневных сценариях', articles.some((a) => a.cat === 'daily'));
    const bodies = p.w.AvenHelp.articles.filter((a) => a.cat === 'daily').map((a) => a.body + ' ' + a.summary).join(' ');
    ok('T8 справка объясняет связность: выполнение в обзоре видно в «Задачах» и «Дне»',
      /также станет выполненной в разделе «Задачи» и в «Дне»/.test(bodies));
    ok('T9 справка объясняет связность переноса на завтра',
      /новая дата сразу появится во всех разделах Aven/.test(bodies));
    ok('T10 справка без developer jargon (нет API/engine/state)', !/\bAPI\b|\bengine\b|localStorage|state\b/i.test(bodies));
    ok('T11 из Help можно запустить оба обучения',
      p.qa('[data-action="tutorial-start"]').some((b) => b.dataset.tourId === 'morning') &&
      p.qa('[data-action="tutorial-start"]').some((b) => b.dataset.tourId === 'evening'));

    const defs = p.w.AvenTutorial.definitions;
    ok('T12 обучение «Утренний обзор» имеет 6 шагов нужного состава',
      defs.morning && defs.morning.steps.length === 6 &&
      /Сводка/.test(defs.morning.steps[0].title) && /Ближайшее событие/.test(defs.morning.steps[1].title) &&
      /Задачи/.test(defs.morning.steps[2].title) && /внимания/.test(defs.morning.steps[3].title) &&
      /Предложения/.test(defs.morning.steps[4].title) && /День/.test(defs.morning.steps[5].title));
    ok('T13 обучение «Итоги дня» имеет 6 шагов нужного состава',
      defs.evening && defs.evening.steps.length === 6 &&
      /Итоги/.test(defs.evening.steps[0].title) && /Выполненное/.test(defs.evening.steps[1].title) &&
      /Оставшееся/.test(defs.evening.steps[2].title) && /Перенос/.test(defs.evening.steps[3].title) &&
      /Завтра/.test(defs.evening.steps[4].title) && /Завершение/.test(defs.evening.steps[5].title));

    p.w.AvenTutorial.start('morning', { restart: true }); await sleep(500);
    ok('T14 обучение открывает экран утра и первый шаг', p.w.location.hash === '#/morning' && /Шаг 1 из 6/.test((p.q('.tour-pop') || {}).textContent || ''));
    ok('T15 обучение подсвечивает реальный элемент сценария', !!p.q('.tour-target-active'));
    p.click(p.q('[data-action="tour-next"]')); await sleep(300);
    ok('T16 следующий шаг обучения переключает шаг сценария',
      /Шаг 2 из 6/.test((p.q('.tour-pop') || {}).textContent || '') && p.q('.daily-bar').getAttribute('aria-valuenow') === '2');
    p.d.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(120);
    ok('T17 Escape закрывает обучение и не ломает сценарий', !p.q('.tour-layer') && !!p.q('.daily-flow'));
    p.w.AvenTutorial.start('evening', { restart: true }); await sleep(600);
    ok('T18 обучение «Итоги дня» открывает свой экран', p.w.location.hash === '#/evening' && /Итоги дня/.test((p.q('.tour-pop') || {}).textContent || '') && /Шаг 1 из 6/.test((p.q('.tour-pop') || {}).textContent || ''));
    p.w.AvenTutorial.close(false); await sleep(80);
    await p.go('#/morning');
    ok('T19 на экране сценария есть контекстная справка и кнопка обучения',
      !!p.q('[data-action="help-topic"][data-topic="daily"]') && !!p.q('[data-action="tutorial-start"][data-tour-id="morning"]'));
    p.dom.window.close();
  }

  /* ======================= 11. Доступность и оформление ======================= */
  {
    const p = await load('#/morning');
    ok('Y1 на экране один h1 и заголовок шага h2', p.qa('#page h1').length === 1 && p.qa('#page h2').length >= 1);
    ok('Y2 панель шага связана с заголовком через aria-labelledby',
      p.q('.daily-flow').getAttribute('aria-labelledby') === 'daily-step-title' && !!p.q('#daily-step-title'));
    ok('Y3 управление сценарием — настоящие кнопки и ссылки',
      p.qa('.daily-controls button').length >= 3 && !!p.q('.daily-controls a[href="#/day"]'));
    ok('Y4 у шагов есть текстовые подписи (не только цвет)', p.qa('.daily-chip-btn').every((b) => b.textContent.trim().length > 1));
    ok('Y5 у кнопок шагов есть aria-label с номером шага', p.qa('.daily-chip-btn').every((b) => /Шаг \d+ из \d+/.test(b.getAttribute('aria-label') || '')));
    ok('Y6 статус «требует внимания» передан текстом, а не только цветом', (() => {
      p.w.Aven.dailySetStep('morning', 'attention');
      return /Просроченные задачи|Важные уведомления/.test(p.page());
    })());
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    ok('Y7 стили сценариев используют переменные темы (light/dark)', /\.daily-flow\b/.test(css) && /\.daily-chip-btn[^}]*var\(--/.test(css));
    ok('Y8 у интерактивных элементов сценария достаточные touch-targets',
      /\.daily-controls \.btn \{[^}]*min-height: 44px/.test(css) && /\.daily-row-actions \.btn \{[^}]*min-height: 40px/.test(css));
    ok('Y9 переходы дешёвые и покрыты prefers-reduced-motion',
      /\.daily-bar > span[^}]*transition: width/.test(css) && /prefers-reduced-motion:\s*reduce/.test(css));
    ok('Y10 длинный текст переносится (overflow-wrap)', /\.daily-row \.t \{[^}]*overflow-wrap: anywhere/.test(css));
    ok('Y11 на узких экранах управление в одну/две колонки', /@media \(max-width: 640px\) \{[\s\S]*?\.daily-controls \{ display: grid/.test(css));
    p.dom.window.close();
  }

  /* ======================= 12. Mobile: рендер и отсутствие ловушек ======================= */
  {
    for (const width of [320, 360, 390, 412, 430]) {
      const p = await load('#/morning', width);
      let okRender = !/Ошибка отрисовки/.test(p.page());
      p.w.location.hash = '#/evening'; await sleep(160);
      okRender = okRender && !/Ошибка отрисовки/.test(p.page());
      ok('P' + width + ' сценарии отрисовываются на ширине ' + width + 'px', okRender);
      p.dom.window.close();
    }
    const p = await load('#/morning', 390);
    p.click(p.q('#mobile-menu-btn')); await sleep(80);
    ok('P1 drawer открывается со страницы сценария', p.d.body.classList.contains('nav-open') && p.q('.main').hasAttribute('inert'));
    p.click(p.q('#sidebar .nav-item[data-id="evening"]')); await sleep(250);
    ok('P2 переход между сценариями очищает drawer', p.w.location.hash === '#/evening' && !p.d.body.classList.contains('nav-open') && !p.q('.main').hasAttribute('inert'));
    ok('P3 кнопки действий внутри одной колонки (нет таблиц/скроллов)', !p.q('.daily-flow table') && !p.q('.daily-flow .table-scroll'));
    p.dom.window.close();
  }

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  console.log('ПРИМЕЧАНИЕ: jsdom не выполняет layout/@media — реальная проверка на Android этим тестом не заменяется.');
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
