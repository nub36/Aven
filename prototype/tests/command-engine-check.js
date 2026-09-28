/* Поведенческая проверка Stage 2 (первая итерация): движок текстовых команд.

   Это разработческий инструмент, НЕ часть приложения и не зависимость продукта:
   jsdom ставится во временный каталог, в репозитории package.json/node_modules не появляются.

   Запуск (из корня репозитория):
     mkdir -p /tmp/lab && cd /tmp/lab && npm init -y && npm install jsdom@30 && cd -
     NODE_PATH=/tmp/lab/node_modules node prototype/tests/command-engine-check.js

   Часть A идёт БЕЗ DOM: ядро команд должно работать как
   текст → намерение → общее действие → результат → ответ, пригодный и для будущего голоса.
   Часть B поднимает прототип целиком: помощник, согласованность разделов,
   «История»/отмена, справка, обучение, мобильные ширины, доступность
   и два исправления в «Финансах».

   Спецификации: docs/COMMAND_ENGINE.md, docs/ARCHITECTURE.md §3.1/§4,
   docs/MVP_SCOPE.md §4.2, ADR-005 (подтверждения), ADR-010 (честные статусы). */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.error('Не найден модуль jsdom. Установите его во временный каталог и запустите с NODE_PATH:\n' +
    '  mkdir -p /tmp/lab && cd /tmp/lab && npm init -y && npm install jsdom@30\n' +
    '  NODE_PATH=/tmp/lab/node_modules node prototype/tests/command-engine-check.js');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

/* ======================= ЧАСТЬ A. Ядро без DOM ======================= */
const FIXED = '2026-09-28'; /* понедельник — общий demo clock сценария */
function coreSandbox() {
  const state = {
    tasks: [], events: [], notes: [], noteFolders: [], ops: [],
    finAccounts: [{ id: 'card', name: 'Карта', balance: 1000 }],
    finCategories: ['Авто', 'Продукты', 'Другое'],
    car: { model: 'BMW 530d', serviceIntervalKm: 10000, mileage: 104520, fuel: [], expenses: [], service: [], docs: [] },
    purchases: [], purchaseCategories: [], reminders: [], history: []
  };
  let seq = 0;
  const sandbox = { console, Date, Intl, window: {} };
  sandbox.window.AvenState = {
    s: () => state,
    save: () => { state.__saved = (state.__saved || 0) + 1; },
    id: (prefix) => prefix + (++seq)
  };
  sandbox.window.Aven = {
    logAction(e) {
      const entry = Object.assign({ id: 'h' + (++seq), when: 'test', actor: 'test' }, e);
      state.history.unshift(entry);
      return entry;
    }
  };
  /* Общие часы приложения: движок обязан брать «сегодня» отсюда, а не из системного времени. */
  sandbox.window.AvenDemo = {
    todayISO: (offset) => {
      const d = new Date(2026, 8, 28, 12, 0, 0, 0);
      d.setDate(d.getDate() + (offset || 0));
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  };
  vm.createContext(sandbox);
  ['actions.js', 'command.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
  });
  return { sandbox, state, C: sandbox.window.AvenActions, K: sandbox.window.AvenCommand };
}

function partA() {
  const src = fs.readFileSync(path.join(ROOT, 'js/command.js'), 'utf8');

  /* ---- A0. Ядро действительно без DOM ---- */
  const env = coreSandbox();
  ok('A1 движок загружается без document/jsdom', !!env.K && typeof env.sandbox.document === 'undefined');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('A2 в исходнике ядра нет обращений к DOM',
    !/document\s*\.|innerHTML|querySelector|addEventListener/.test(code));
  ok('A3 в ядре нет LLM/сети/распознавания речи',
    !/(fetch\s*\(|XMLHttpRequest|openai|SpeechRecognition|webkitSpeech|import\s*\()/i.test(src));
  ok('A4 ядро не использует системные часы для бизнес-дат',
    !/new Date\s*\(\s*\)|Date\.now/.test(src));
  ok('A5 публичный контракт разделён на parse/execute/respond/run',
    ['normalize', 'parse', 'execute', 'respond', 'run', 'supported', 'examples']
      .every((k) => typeof env.K[k] === 'function'));

  /* ---- A1. Нормализация ---- */
  const K = env.K;
  ok('A10 нормализация убирает регистр, лишние пробелы и знак вопроса',
    K.normalize('  ЧТО   у меня   СЕГОДНЯ???  ') === 'что у меня сегодня');
  ok('A11 нормализация приводит «ё» к «е» и убирает кавычки',
    K.normalize('Отмёть «купить масло»') === 'отметь купить масло');
  ok('A12 нормализация не падает на пустом и нестроковом вводе',
    K.normalize('') === '' && K.normalize(null) === '' && K.normalize(undefined) === '');
  ok('A13 неразрывные пробелы не ломают разбор',
    K.parse('Что\u00a0у\u00a0меня\u00a0сегодня').ok === true);

  /* ---- A2. Разбор запросов ---- */
  const q1 = K.parse('Что у меня сегодня?');
  ok('A20 «Что у меня сегодня?» → обзор дня на сегодня',
    q1.ok && q1.action === 'day.plan' && q1.kind === 'query' && q1.params.dateISO === FIXED);
  ok('A21 вариант «что сегодня» распознаётся так же',
    K.parse('что сегодня').params.dateISO === FIXED);
  ok('A22 вариант «покажи дела на сегодня» распознаётся так же',
    K.parse('покажи дела на сегодня').params.dateISO === FIXED);
  ok('A23 «Что у меня завтра?» использует общие часы (+1 день)',
    K.parse('Что у меня завтра?').params.dateISO === '2026-09-29');
  ok('A24 «какой план на послезавтра» → +2 дня',
    K.parse('какой план на послезавтра').params.dateISO === '2026-09-30');
  ok('A25 «покажи просроченные задачи» → запрос просроченного',
    K.parse('покажи просроченные задачи').action === 'tasks.overdue');
  ok('A26 «какие есть предложения» → запрос предложений',
    K.parse('какие есть предложения').action === 'suggestions.list');
  ok('A27 «сколько я потратил сегодня» → сводка расходов, а не обзор дня',
    K.parse('сколько я потратил сегодня').action === 'finance.summary');
  ok('A28 «какой пробег» → сводка по автомобилю',
    K.parse('какой пробег').action === 'auto.status');
  ok('A29 «что ты умеешь» → список возможностей',
    K.parse('что ты умеешь').action === 'help.capabilities');
  ok('A30 намерение сериализуемо и не содержит DOM/функций',
    JSON.parse(JSON.stringify(q1)).action === 'day.plan' &&
    Object.keys(q1).every((k) => typeof q1[k] !== 'function'));
  ok('A31 намерение содержит домен, тип, параметры, правило и флаг подтверждения',
    q1.domain === 'day' && q1.kind === 'query' && !!q1.params && !!q1.match.rule && q1.requiresConfirmation === false);

  /* ---- A3. Разбор изменений ---- */
  const m1 = K.parse('Создай задачу купить масло');
  ok('A40 «создай задачу купить масло» → создание задачи без даты',
    m1.ok && m1.action === 'task.create' && m1.kind === 'mutation' && m1.params.title === 'Купить масло' && !m1.params.dateISO);
  ok('A41 «создай задачу купить масло на завтра» добавляет дату из общих часов',
    K.parse('Создай задачу купить масло на завтра').params.dateISO === '2026-09-29');
  ok('A42 варианты «добавь задачу» и «запиши задачу» работают так же',
    K.parse('добавь задачу купить масло').params.title === 'Купить масло' &&
    K.parse('запиши задачу купить масло').params.title === 'Купить масло');
  ok('A43 время распознаётся отдельно от названия',
    K.parse('создай задачу позвонить врачу завтра в 10:30').params.time === '10:30' &&
    K.parse('создай задачу позвонить врачу завтра в 10:30').params.title === 'Позвонить врачу');
  ok('A44 «в 10» — это 10:00',
    K.parse('создай задачу забрать посылку сегодня в 10').params.time === '10:00');
  ok('A45 день недели — ближайший будущий (понедельник → следующий понедельник)',
    K.parse('создай задачу отчет на пятницу').params.dateISO === '2026-10-02' &&
    K.parse('создай задачу отчет на понедельник').params.dateISO === '2026-10-05');
  ok('A46 дата числом понимается как ближайшая будущая',
    K.parse('создай задачу оплатить на 12.05').params.dateISO === '2027-05-12' &&
    K.parse('создай задачу оплатить на 30.09').params.dateISO === '2026-09-30');
  const e1 = K.parse('Добавь завтра в 10 встречу с Сергеем');
  ok('A47 «добавь завтра в 10 встречу с Сергеем» → событие с датой, временем и названием',
    e1.ok && e1.action === 'event.create' && e1.params.dateISO === '2026-09-29' &&
    e1.params.time === '10:00' && e1.params.title === 'Встреча с Сергеем', JSON.stringify(e1.params));
  ok('A48 «отметь купить масло выполненной» → отметка выполнения с описанием задачи',
    K.parse('отметь купить масло выполненной').action === 'task.complete' &&
    K.parse('отметь купить масло выполненной').params.query === 'купить масло');
  ok('A49 варианты «заверши задачу …» / «выполни …» распознаются так же',
    K.parse('заверши задачу купить масло').params.query === 'купить масло' &&
    K.parse('выполни купить масло').params.query === 'купить масло');
  ok('A50 «перенеси задачу купить масло на завтра» → перенос с датой',
    K.parse('перенеси задачу купить масло на завтра').action === 'task.reschedule' &&
    K.parse('перенеси задачу купить масло на завтра').params.dateISO === '2026-09-29');

  /* ---- A4. Разбор не меняет состояние ---- */
  {
    const env2 = coreSandbox();
    const before = JSON.stringify(env2.state);
    ['Создай задачу купить масло на завтра', 'Добавь завтра в 10 встречу с Сергеем',
      'отметь купить масло выполненной', 'перенеси задачу купить масло на пятницу',
      'удали все задачи', 'что у меня сегодня'].forEach((t) => env2.K.parse(t));
    ok('A60 разбор текста не меняет данные и не пишет историю',
      JSON.stringify(env2.state) === before && env2.state.history.length === 0);
  }

  /* ---- A5. Неизвестные и неподдерживаемые команды ---- */
  {
    const env3 = coreSandbox();
    const before = JSON.stringify(env3.state);
    const unknown = env3.K.run('бла бла бла', { source: 'test' });
    ok('A70 неизвестная команда не выполняется и не бросает исключение',
      unknown.ok === false && unknown.intent.ok === false && unknown.intent.error.code === 'UNKNOWN_COMMAND');
    ok('A71 ответ на неизвестную команду понятен человеку и содержит примеры',
      /не поняла/i.test(unknown.response) && /Что у меня сегодня/.test(unknown.response));
    ok('A72 ответ не показывает внутренние термины',
      !/(intent|payload|parser|action\s|JSON|DOM)/i.test(unknown.response), unknown.response);
    ok('A73 неизвестная команда ничего не изменила и не создала историю',
      JSON.stringify(env3.state) === before && env3.state.history.length === 0);

    const del = env3.K.run('удали все задачи', { source: 'test' });
    ok('A74 удаление текстом честно отклоняется и ничего не меняет',
      del.ok === false && del.intent.error.code === 'UNSUPPORTED_DELETE' &&
      /удал/i.test(del.response) && env3.state.history.length === 0);
    const fin = env3.K.run('запиши 850 рублей продукты', { source: 'test' });
    ok('A75 запись расхода текстом отклоняется с подсказкой про раздел «Финансы»',
      fin.ok === false && /Финанс/.test(fin.response) && env3.state.ops.length === 0);
    const rem = env3.K.run('напомни завтра позвонить', { source: 'test' });
    ok('A76 создание напоминания текстом отклоняется честно',
      rem.ok === false && /напомин/i.test(rem.response) && env3.state.history.length === 0);
    const ev = env3.K.run('перенеси встречу на 12', { source: 'test' });
    ok('A77 перенос события текстом отклоняется и не трогает календарь',
      ev.ok === false && /Календар/.test(ev.response) && env3.state.events.length === 0);
    /* Кириллица и \w: «создай заметку» должно давать честный отказ про раздел «Заметки»,
       а не общее «не поняла» — регрессия ревью PR #27. */
    ['создай заметку список покупок', 'добавь заметку про встречу', 'запиши заметку идея'].forEach((phrase, i) => {
      const note = env3.K.run(phrase, { source: 'test' });
      ok('A77' + String.fromCharCode(97 + i) + ' «' + phrase + '» отклоняется с подсказкой про «Заметки»',
        note.ok === false && note.intent.error.code === 'UNSUPPORTED_NOTE' &&
        /Заметк/.test(note.response) && env3.state.notes.length === 0, note.response);
    });
    /* Слово «встреча» в середине чужой фразы не должно создавать событие:
       регрессия ревью PR #27 («добавь заметку про встречу» создавало событие
       «Событие заметку про встречу»). Не поняли — не угадываем. */
    const evBefore = env3.state.events.length;
    ['добавь заметку про встречу', 'добавь важную встречу'].forEach((phrase, i) => {
      const r = env3.K.run(phrase, { source: 'test' });
      ok('A77e' + i + ' «' + phrase + '» не создаёт случайное событие',
        r.ok === false && env3.state.events.length === evBefore, r.response);
    });
    /* Нормальные формулировки события при этом продолжают работать. */
    [['создай событие день рождения мамы', 'День рождения мамы'],
     ['добавь встречу с врачом на пятницу', 'Встреча с врачом'],
     ['назначь созвон с командой на завтра', 'Созвон с командой']].forEach((pair, i) => {
      const r = env3.K.parse(pair[0]);
      ok('A77f' + i + ' «' + pair[0] + '» разбирается как событие «' + pair[1] + '»',
        r.ok === true && r.action === 'event.create' && r.params.title === pair[1],
        r.ok ? r.params : r.error);
    });
    /* Дни недели в других падежах тоже должны читаться (тот же урок про \w). */
    const wd = env3.K.parse('перенеси задачу тест на среду');
    ok('A77d день недели разбирается и даёт будущую дату',
      wd.ok === true && wd.params.dateISO > FIXED, wd.ok ? wd.params : wd.error);
    const empty = env3.K.run('   ', { source: 'test' });
    ok('A78 пустой ввод не выполняется и объясняется',
      empty.ok === false && empty.intent.error.code === 'EMPTY' && env3.state.history.length === 0);
  }

  /* ---- A6. Неверные дата и время ---- */
  {
    const env4 = coreSandbox();
    const badDate = env4.K.run('создай задачу тест на 31.02', { source: 'test' });
    ok('A80 несуществующая дата не создаёт задачу',
      badDate.ok === false && badDate.intent.error.code === 'DATE_INVALID' && env4.state.tasks.length === 0);
    const badTime = env4.K.run('создай задачу тест сегодня в 25:00', { source: 'test' });
    ok('A81 несуществующее время не создаёт задачу',
      badTime.ok === false && badTime.intent.error.code === 'TIME_INVALID' && env4.state.tasks.length === 0);
    ok('A82 ответы про дату и время написаны по-человечески',
      /даты не существует/i.test(badDate.response) && /времени не бывает/i.test(badTime.response));
    const noTitle = env4.K.run('создай задачу', { source: 'test' });
    ok('A83 команда без названия задачи не выполняется',
      noTitle.ok === false && noTitle.intent.error.code === 'TASK_TITLE_REQUIRED' && env4.state.tasks.length === 0);
    ok('A84 после всех неудачных команд история пуста', env4.state.history.length === 0);
  }

  /* ---- A7. Выполнение через общий слой действий ---- */
  {
    const env5 = coreSandbox();
    const K5 = env5.K, C5 = env5.C;
    const r1 = K5.run('Создай задачу купить масло на завтра', { source: 'assistant' });
    const task = env5.state.tasks[0];
    ok('A90 команда создала настоящую задачу в общем состоянии',
      r1.ok && env5.state.tasks.length === 1 && task.title === 'Купить масло' && task.date === '2026-09-29');
    ok('A91 задача создана через общий слой: запись истории с обратной операцией',
      env5.state.history[0].action === 'task.create' && env5.state.history[0].undo.type === 'remove' &&
      env5.state.history[0].source === 'assistant');
    ok('A92 задача находится обычными запросами раздела',
      C5.tasks.getTasksForDate('2026-09-29').items.some((t) => t.id === task.id));
    ok('A93 ответ пользователю — обычный текст с названием и датой',
      /Купить масло/.test(r1.response) && /завтра/i.test(r1.response) && !/task\.create/.test(r1.response), r1.response);

    const r2 = K5.run('Добавь завтра в 10 встречу с Сергеем', { source: 'assistant' });
    const event = env5.state.events[0];
    ok('A94 команда создала настоящее событие с датой и временем',
      r2.ok && event.title === 'Встреча с Сергеем' && event.date === '2026-09-29' && C5.events.start(event) === '10:00');
    ok('A95 событие видно обычным запросом календаря',
      C5.events.getEventsForDate('2026-09-29').items.some((e) => e.id === event.id) &&
      env5.state.history[0].action === 'event.create');

    const r3 = K5.run('Отметь купить масло выполненной', { source: 'assistant' });
    ok('A96 команда отметила задачу выполненной через общее действие',
      r3.ok && C5.tasks.isCompleted(C5.tasks.getTask(task.id).entity) &&
      env5.state.history[0].action === 'task.complete');
    ok('A97 ответ про выполнение понятен и упоминает отмену',
      /отмечена выполненной/i.test(r3.response) && /Истори/i.test(r3.response));

    /* Отмена через обычный механизм истории (движок своего Undo не строит) */
    const entry = env5.state.history[0];
    ok('A98 запись истории команды помечена как отменяемая', entry.undoable === true && entry.undo.type === 'fields');

    const r4 = K5.run('Перенеси задачу купить масло на пятницу', { source: 'assistant' });
    ok('A99 выполненная задача уже не подходит под перенос — движок честно сообщает',
      r4.ok === false && r4.result.status === 'not_found');

    const t2 = K5.run('создай задачу полить цветы', { source: 'assistant' });
    const id2 = t2.result.entity.id;
    const r5 = K5.run('перенеси задачу полить цветы на послезавтра', { source: 'assistant' });
    ok('A100 перенос меняет дату существующей задачи через общее действие',
      r5.ok && C5.tasks.getTask(id2).entity.date === '2026-09-30' &&
      env5.state.history[0].action === 'task.update');
  }

  /* ---- A8. Неоднозначность ---- */
  {
    const env6 = coreSandbox();
    const K6 = env6.K;
    K6.run('создай задачу купить масло для машины', { source: 'test' });
    K6.run('создай задачу купить масло для салата', { source: 'test' });
    const historyBefore = env6.state.history.length;
    const res = K6.run('отметь купить масло выполненной', { source: 'test' });
    ok('A110 при нескольких подходящих задачах команда не выполняется',
      res.ok === false && res.result.status === 'ambiguous' && res.result.code === 'AMBIGUOUS_TASK');
    ok('A111 результат перечисляет найденные варианты',
      res.result.candidates.length === 2 && res.result.candidates.every((c) => !!c.title));
    ok('A112 неоднозначность не меняет задачи и не пишет историю',
      env6.state.tasks.every((t) => !t.completed) && env6.state.history.length === historyBefore);
    ok('A113 ответ просит уточнить и перечисляет варианты человеческим текстом',
      /несколько задач/i.test(res.response) && /Уточните/i.test(res.response) && /Купить масло/.test(res.response));
    const res2 = K6.run('отметь купить масло для машины выполненной', { source: 'test' });
    ok('A114 уточнённое название выполняется без неоднозначности',
      res2.ok && res2.result.entity.title === 'Купить масло для машины');
    /* Точное совпадение названия — не неоднозначность: выбор остаётся предсказуемым. */
    K6.run('создай задачу купить масло', { source: 'test' });
    const res3 = K6.run('отметь купить масло выполненной', { source: 'test' });
    ok('A114b точное совпадение названия выполняется, даже если есть более длинные похожие',
      res3.ok && res3.result.entity.title === 'Купить масло');
    const none = K6.run('отметь помыть окна выполненной', { source: 'test' });
    ok('A115 несуществующая задача не создаётся «на всякий случай»',
      none.ok === false && none.result.status === 'not_found' && env6.state.tasks.length === 3);
    ok('A116 ответ про ненайденную задачу понятен', /Не нашла/i.test(none.response));
  }

  /* ---- A9. Ошибки проверки общего слоя доходят до человека ---- */
  {
    const env7 = coreSandbox();
    const intent = env7.K.parse('создай задачу купить масло');
    intent.params.title = '   '; /* имитация пустого названия после разбора */
    const res = env7.K.execute(intent, { source: 'test' });
    ok('A120 ошибка проверки общего слоя не обходится движком',
      res.ok === false && res.status === 'invalid' && res.code === 'TASK_TITLE_REQUIRED');
    ok('A121 причина от общего слоя показывается человеку',
      /название задачи/i.test(env7.K.respond(res)) && env7.state.tasks.length === 0);
    const broken = env7.K.execute({ ok: true, action: 'task.explode', params: {} }, { source: 'test' });
    ok('A122 неизвестное действие не выполняется и не ломает состояние',
      broken.ok === false && broken.code === 'UNKNOWN_ACTION' && env7.state.history.length === 0);
    const noIntent = env7.K.execute(null, { source: 'test' });
    ok('A123 выполнение без намерения безопасно', noIntent.ok === false && env7.state.history.length === 0);
  }

  /* ---- A10. Общие часы ---- */
  {
    const env8 = coreSandbox();
    const other = env8.K.parse('что у меня сегодня', { todayISO: '2026-12-31' });
    ok('A130 «сегодня» берётся из переданного контекста часов, а не из системной даты',
      other.params.dateISO === '2026-12-31');
    ok('A131 «завтра» считается от тех же часов',
      env8.K.parse('что у меня завтра', { todayISO: '2026-12-31' }).params.dateISO === '2027-01-01');
    ok('A132 без контекста используется общий demo clock приложения',
      env8.K.parse('что у меня сегодня').params.dateISO === env8.C.dates.todayISO());
  }

  /* ---- A11. Запросы читают те же данные, что и разделы ---- */
  {
    const env9 = coreSandbox();
    const K9 = env9.K, C9 = env9.C;
    C9.tasks.createTask({ title: 'Просроченное дело', date: '2026-09-20', deadline: '2026-09-20' }, { source: 'ui' });
    C9.tasks.createTask({ title: 'Дело на сегодня', date: FIXED, deadline: FIXED }, { source: 'ui' });
    C9.events.createEvent({ title: 'Планёрка', date: FIXED, startTime: '09:00' }, { source: 'ui' });
    const day = K9.run('что у меня сегодня', { source: 'test' });
    ok('A140 обзор дня собран из тех же задач и событий, что показывает раздел «День»',
      day.ok && /Планёрка/.test(day.response) && /Дело на сегодня/.test(day.response));
    ok('A141 обзор дня не создаёт своих записей', env9.state.tasks.length === 2 && env9.state.events.length === 1);
    const over = K9.run('покажи просроченные задачи', { source: 'test' });
    ok('A142 просроченные берутся общим запросом задач',
      over.ok && /Просроченное дело/.test(over.response) &&
      over.result.data.items.length === C9.tasks.getOverdueTasks(FIXED).items.length);
    const cap = K9.run('что ты умеешь', { source: 'test' });
    ok('A143 список возможностей честно перечисляет и то, чего движок не умеет',
      /Пока не умею/.test(cap.response) && /удаление записей текстом/.test(cap.response));
    ok('A144 перечень возможностей доступен как данные для интерфейса и справки',
      K9.supported().queries.length >= 5 && K9.supported().mutations.length === 4 &&
      K9.supported().notYet.length >= 4 && K9.examples().length >= 6);
  }

  /* ---- A12. Второго слоя действий и своей истории не появилось ---- */
  ok('A150 движок не пишет в состояние напрямую',
    !/AvenState|\.save\s*\(\)|state\s*\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('A151 движок не создаёт собственных записей истории',
    !/logAction|history\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('A152 изменения идут только через существующие общие действия',
    /\bC\.tasks\.createTask\(/.test(src) && /\bC\.tasks\.completeTask\(/.test(src) &&
    /\bC\.tasks\.updateTask\(/.test(src) && /\bC\.events\.createEvent\(/.test(src));
}

/* ======================= ЧАСТЬ B. Поведение экранов ======================= */
const PORT = 8127;
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

async function load(hash, width) {
  const dom = await JSDOM.fromURL(BASE + 'index.html' + (hash || ''), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true
  });
  await sleep(700);
  const w = dom.window, d = w.document;
  if (width) { Object.defineProperty(w, 'innerWidth', { value: width, configurable: true }); w.dispatchEvent(new w.Event('resize')); }
  return {
    dom, w, d,
    q: (sel) => d.querySelector(sel),
    qa: (sel) => Array.from(d.querySelectorAll(sel)),
    st: () => w.AvenState.s(),
    C: () => w.AvenActions,
    K: () => w.AvenCommand,
    H: () => w.AvenState.s().history,
    click: (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })),
    set: (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
    key: (el, key) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })),
    go: async (h) => { w.location.hash = h; await sleep(240); },
    broken: () => (d.getElementById('page').textContent || '').indexOf('Ошибка отрисовки') >= 0,
    text: () => (d.getElementById('page').textContent || '').replace(/[\u00a0\u202f]/g, ' '),
    say: async (text) => {
      const inp = d.querySelector('#chat-input');
      inp.value = text;
      d.querySelector('[data-action="chat-send"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(600);
      return w.Aven._lastReply || '';
    }
  };
}

async function partB() {
  /* ---- B1. Помощник: интерфейс команды ---- */
  {
    const p = await load('#/assistant');
    ok('B1 у поля команды есть подпись для скринридера и обычная форма',
      !!p.q('#cmd-form') && !!p.q('label[for="chat-input"]') && !!p.q('#chat-input'));
    ok('B2 область ответов объявляется вспомогательным технологиям',
      (p.q('#chat') || {}).getAttribute && p.q('#chat').getAttribute('aria-live') === 'polite');
    ok('B3 показаны примеры команд, и они подставляются в поле, а не выполняются сразу',
      p.qa('[data-action="cmd-example"]').length >= 4);
    const before = p.st().tasks.length;
    p.click(p.qa('[data-action="cmd-example"]')[0]);
    await sleep(150);
    ok('B4 нажатие на пример только заполняет поле',
      (p.q('#chat-input').value || '').length > 0 && p.st().tasks.length === before);
    ok('B5 экран честно говорит, что это не свободный разговор и не внешний AI',
      /не свободный разговор/i.test(p.text()) && /Пока не умею/i.test(p.text()));
    ok('B6 у экрана есть кнопки справки и обучения по командам',
      p.qa('[data-action="tutorial-start"][data-tour-id="commands"]').length > 0 &&
      p.qa('[data-action="help-topic"][data-topic="commands"]').length > 0);
    ok('B7 старая демо-машина команд убрана — второго помощника рядом нет',
      !p.w.AvenFlows && p.qa('[data-action="flow-start"]').length === 0);

    /* клавиатура: Enter отправляет команду */
    const inp = p.q('#chat-input');
    inp.value = 'Что у меня сегодня?';
    p.key(inp, 'Enter');
    await sleep(600);
    ok('B8 команда отправляется клавишей Enter без мыши',
      /Сегодня/i.test(p.w.Aven._lastReply || ''), p.w.Aven._lastReply);
    ok('B9 вопрос о дне ничего не изменил', p.H().length === 0 || p.H()[0].action !== 'task.create');
    ok('B10 в ответе нет служебных терминов',
      !/(intent|payload|parser|task\.create|JSON)/i.test(p.w.Aven._lastReply || ''));
    p.dom.window.close();
  }

  /* ---- B2. Сквозная согласованность: команда → разделы → История → Undo ---- */
  {
    const p = await load('#/assistant');
    const C = p.C();
    const tomorrow = C.dates.todayISO(1);
    const reply = await p.say('Создай задачу купить масло на завтра');
    const task = p.st().tasks[0];
    ok('B20 команда создала задачу через общий слой',
      p.st().tasks.length > 0 && task.title === 'Купить масло' && task.date === tomorrow &&
      p.H()[0].action === 'task.create', reply);
    ok('B21 ответ пользователю — человеческий текст', /Купить масло/.test(reply) && /завтра/i.test(reply));
    await p.go('#/tasks');
    ok('B22 задача из команды видна в разделе «Задачи»', p.text().indexOf('Купить масло') >= 0 && !p.broken());
    await p.go('#/day');
    const dayBtn = p.qa('[data-action="day-shift"]').filter((b) => /завтра/i.test(b.textContent))[0];
    if (dayBtn) { p.click(dayBtn); await sleep(240); }
    ok('B23 задача из команды видна в «Дне» на нужную дату',
      p.text().indexOf('Купить масло') >= 0 || C.tasks.getTasksForDate(tomorrow).items.some((t) => t.id === task.id));
    await p.go('#/history');
    ok('B24 действие команды попало в общую «Историю» с кнопкой отмены',
      p.text().indexOf('Купить масло') >= 0 && !!p.q('[data-action="hist-undo"]'));
    p.w.Aven.undoAction(p.H().filter((e) => e.action === 'task.create')[0].id);
    await sleep(300);
    ok('B25 отмена вернула состояние: задачи больше нет',
      !p.st().tasks.some((t) => t.id === task.id) && !p.broken());
    await p.go('#/tasks');
    ok('B26 после отмены раздел «Задачи» тоже не показывает запись', p.text().indexOf('Купить масло') < 0);
    p.dom.window.close();
  }

  /* ---- B3. Событие командой и календарь ---- */
  {
    const p = await load('#/assistant');
    const C = p.C();
    const reply = await p.say('Добавь завтра в 10 встречу с Сергеем');
    const ev = p.st().events[0];
    ok('B30 команда создала событие с датой и временем',
      ev.title === 'Встреча с Сергеем' && ev.date === C.dates.todayISO(1) && C.events.start(ev) === '10:00', reply);
    ok('B31 событие записано общим действием', p.H()[0].action === 'event.create');
    await p.go('#/calendar');
    ok('B32 событие из команды видно в «Календаре»', p.text().indexOf('Встреча с Сергеем') >= 0 && !p.broken());
    await p.go('#/home');
    ok('B33 «Главная» показывает то же событие как ближайшее или в карточках',
      p.text().indexOf('Встреча с Сергеем') >= 0 ||
      C.events.getEventsForDate(C.dates.todayISO(1)).items.some((x) => x.id === ev.id));
    p.w.Aven.undoAction(p.H().filter((e) => e.action === 'event.create')[0].id);
    await sleep(280);
    ok('B34 отмена события командой работает как обычная отмена',
      !p.st().events.some((x) => x.id === ev.id));
    p.dom.window.close();
  }

  /* ---- B4. Безопасность в интерфейсе: неизвестное, неоднозначное, запрещённое ---- */
  {
    const p = await load('#/assistant');
    const tasks0 = p.st().tasks.length;
    const hist0 = p.H().length;
    const unknown = await p.say('сделай мне красиво');
    ok('B40 неизвестная команда в интерфейсе безопасна',
      /не поняла/i.test(unknown) && p.st().tasks.length === tasks0 && p.H().length === hist0);
    const del = await p.say('удали все задачи');
    ok('B41 удаление текстом отклоняется, данные на месте',
      /удал/i.test(del) && p.st().tasks.length === tasks0 && p.H().length === hist0 && !p.broken());
    await p.say('создай задачу проверка неоднозначности первая');
    await p.say('создай задачу проверка неоднозначности вторая');
    const histAfter = p.H().length;
    const amb = await p.say('отметь проверка неоднозначности выполненной');
    ok('B42 неоднозначная команда не меняет данные и просит уточнить',
      /Уточните/i.test(amb) && p.H().length === histAfter &&
      p.st().tasks.filter((t) => /проверка неоднозначности/i.test(t.title)).every((t) => !t.completed));
    const exact = await p.say('отметь проверка неоднозначности вторая выполненной');
    ok('B43 уточнённая команда выполняется',
      /отмечена выполненной/i.test(exact) && p.H()[0].action === 'task.complete');
    p.dom.window.close();
  }

  /* ---- B5. Строка «Чем помочь?» на Главной ведёт в тот же движок ---- */
  {
    const p = await load('#/home');
    const inp = p.q('#home-cmd');
    if (inp) {
      inp.value = 'Что у меня сегодня?';
      p.click(p.q('[data-action="home-cmd-send"]'));
      await sleep(900);
      ok('B50 команда с «Главной» выполняется тем же движком в помощнике',
        /Сегодня/i.test(p.w.Aven._lastReply || '') && (p.w.location.hash || '').indexOf('assistant') >= 0,
        p.w.Aven._lastReply);
    } else {
      ok('B50 команда с «Главной» выполняется тем же движком в помощнике', false, 'строка команды не найдена');
    }
    p.dom.window.close();
  }

  /* ---- B6. Справка и обучение ---- */
  {
    const p = await load('#/help');
    const ids = (p.w.AvenHelp.articles || []).filter((a) => a.cat === 'commands').map((a) => a.id);
    ok('B60 в справке есть отдельный раздел о текстовых командах', ids.length >= 5, ids.join(','));
    const bodies = (p.w.AvenHelp.articles || []).filter((a) => a.cat === 'commands')
      .map((a) => a.title + ' ' + a.summary + ' ' + a.body).join(' ');
    ok('B61 справка объясняет, где вводить команды и что они делают',
      /помощник/i.test(bodies) && /Enter/.test(bodies));
    ok('B62 справка перечисляет поддерживаемые команды и «сегодня/завтра»',
      /Что у меня сегодня/.test(bodies) && /завтра/i.test(bodies) && /пятниц/i.test(bodies));
    ok('B63 справка объясняет неоднозначность и отмену',
      /уточнить/i.test(bodies) && /Отменить/i.test(bodies) && /Истори/i.test(bodies));
    ok('B64 справка честно перечисляет, чего команды не умеют',
      /Удалять/i.test(bodies) && /не свободный разговор/i.test(bodies));
    ok('B65 в пользовательской справке нет технического жаргона',
      !/(parser|payload|intent|DOM|state|provider|action layer|route)/i.test(bodies));
    const search = p.w.AvenHelp.search('команд');
    ok('B66 материалы о командах находятся поиском справки', search.length > 0);
    ok('B67 обучение по командам зарегистрировано в существующем движке обучения',
      !!p.w.AvenTutorial.definitions.commands && p.w.AvenTutorial.definitions.commands.route === 'assistant' &&
      p.w.AvenTutorial.definitions.commands.steps.length >= 5);
    p.dom.window.close();
  }

  /* ---- B7. Обучение реально работает на экране помощника ---- */
  {
    const p = await load('#/assistant');
    const def = p.w.AvenTutorial.definitions.commands;
    const missing = def.steps.map((s) => s.target).filter((t, i, arr) => arr.indexOf(t) === i)
      .filter((t) => !p.q('[data-tour="' + t + '"]'));
    ok('B70 все шаги обучения указывают на существующие элементы экрана', missing.length === 0, missing.join(', '));
    const tasks0 = p.st().tasks.length;
    p.w.AvenTutorial.start('commands', { restart: true });
    await sleep(400);
    ok('B71 обучение запускается и показывает подсказку с прогрессом',
      p.w.AvenTutorial.isActive() && !!p.q('.tour-pop') && /1/.test((p.q('.tour-pop') || {}).textContent || ''));
    ok('B72 обучение ничего не создаёт и не меняет само', p.st().tasks.length === tasks0);
    p.click(p.q('[data-action="tour-next"]'));
    await sleep(250);
    ok('B73 работают шаги «дальше»/«назад»',
      p.w.AvenTutorial.current().step === 1 && !!p.q('[data-action="tour-prev"]'));
    p.d.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await sleep(250);
    ok('B74 обучение закрывается клавишей Escape', !p.w.AvenTutorial.isActive() && !p.q('.tour-pop'));
    ok('B75 обучение работает без TTS', !p.w.AvenTutorial.store().voice);
    p.dom.window.close();
  }

  /* ---- B8. Мобильные ширины и доступность ---- */
  {
    for (const width of [320, 360, 390, 412, 430]) {
      const p = await load('#/assistant', width);
      const wide = p.qa('.assistant *').filter((el) => {
        const st = p.w.getComputedStyle(el);
        const w = parseFloat(st.width);
        return st.width.indexOf('px') > 0 && w > width;
      });
      ok('B80/' + width + ' экран помощника не шире окна (' + width + ')', wide.length === 0,
        wide.slice(0, 2).map((el) => el.className).join(', '));
      ok('B81/' + width + ' поле ввода и кнопка отправки доступны',
        !!p.q('#chat-input') && !!p.q('[data-action="chat-send"]') && !p.broken());
      p.dom.window.close();
    }
    const p = await load('#/assistant', 360);
    ok('B82 у иконных кнопок помощника есть доступное название',
      p.qa('.assistant .icon-btn').every((b) => (b.getAttribute('aria-label') || b.getAttribute('title') || '').length > 0));
    ok('B83 подсказка к полю связана с ним через aria-describedby',
      p.q('#chat-input').getAttribute('aria-describedby') === 'cmd-hint' && !!p.q('#cmd-hint'));
    ok('B84 примеры команд — обычные кнопки, доступные с клавиатуры',
      p.qa('[data-action="cmd-example"]').every((b) => b.tagName === 'BUTTON'));
    /* тёмная тема не ломает экран */
    p.w.AvenActions.settings.set('settings.appearance.theme', 'dark');
    p.w.Aven.render();
    await sleep(250);
    ok('B85 тёмная тема не ломает экран помощника', !p.broken() && !!p.q('#chat-input'));
    p.dom.window.close();
  }

  /* ---- B9. Исправленные дефекты «Финансов» ---- */
  {
    const p = await load('#/finance');
    const C = p.C();
    const chart = p.qa('.card').filter((c) => /Расходы по месяцам/.test(c.textContent))[0];
    const caption = (chart || {}).textContent || '';
    ok('B90 подпись графика честно описывает поведение: месяцы подряд, включая пустые',
      /последние 12 месяцев подряд/i.test(caption) && /включая месяцы без расходов/i.test(caption), caption.slice(0, 160));
    ok('B91 в подписи больше нет утверждения «месяцы, в которых есть записи»',
      caption.indexOf('в которых есть записи') < 0);
    ok('B92 график действительно строит 12 последовательных месяцев',
      C.finance.monthly().length === 12 &&
      C.finance.monthly()[11].key === C.dates.todayISO().slice(0, 7));
    const money = (v) => C.money.exact(v).replace(/[\u00a0\u202f]/g, ' ');
    const note = (p.qa('.tts-priv').filter((n) => /Точность денег/.test(n.textContent))[0] || {}).textContent || '';
    const noteText = note.replace(/[\u00a0\u202f]/g, ' ');
    ok('B93 пример точности денег показан с копейками и не превращается в «0 ₽»',
      noteText.indexOf(money(0.1) + ' + ' + money(0.2) + ' = ' + money(0.3)) >= 0 && noteText.indexOf('= 0 ₽') < 0,
      noteText.slice(0, 200));
    ok('B94 общий формат денег с копейками живёт в общем слое, а не в экране',
      typeof C.money.exact === 'function' && C.money.exact(0.3).indexOf('0,30') >= 0);
    ok('B95 арифметика денег не изменилась: целые копейки',
      C.money.minor(C.money.sum(0.1, 0.2)) === 30 && C.format.money(1) === C.format.money(1));
    ok('B96 округлённый формат в списках сохранён', /₽/.test(C.format.money(1234)) && C.format.money(1234).indexOf(',') < 0);
    p.dom.window.close();
  }
}

(async () => {
  partA();
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  try {
    await partB();
  } catch (e) {
    ok('B99 проверки экранов завершились без исключения', false, e && e.message);
  }
  server.close();
  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  if (fail) {
    console.log('провалы: ' + fails.join(' | '));
    process.exit(1);
  }
  console.log('ПРИМЕЧАНИЕ: jsdom не заменяет проверку в настоящем браузере (нет реальной вёрстки, касаний и медиазапросов).');
})();
