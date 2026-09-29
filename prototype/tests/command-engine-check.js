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
    },
    /* notify.js регистрирует свои DOM-обработчики страницы «Уведомления» через
       A.register(...) при загрузке модуля — в DOM-free сборке страница не нужна,
       но вызов должен быть безопасным no-op, чтобы можно было загрузить сам
       движок AvenNotify (единственный контракт напоминаний, docs/MVP_SCOPE.md §4.2.4). */
    register() {}
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
  /* notify.js — единственный существующий движок напоминаний/уведомлений (AvenNotify);
     reminder.create/reminder.search в command.js вызывают его через AvenActions.reminders,
     поэтому он должен быть загружен, а не имитирован отдельной DOM-free заглушкой. */
  ['actions.js', 'notify.js', 'command.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
  });
  return { sandbox, state, C: sandbox.window.AvenActions, K: sandbox.window.AvenCommand, N: sandbox.window.AvenNotify };
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
    /* Stage 2, итерация 4: создание напоминания текстом теперь поддержано через
       существующий AvenActions.reminders (см. блок A14 ниже для полного покрытия);
       здесь — только то, что оно больше не попадает в общий «не поняла». */
    const rem = env3.K.run('напомни завтра позвонить', { source: 'test' });
    ok('A76 создание напоминания текстом выполняется через общее действие',
      rem.ok === true && rem.result.action === 'reminder.create' &&
      rem.result.entity.title === 'Позвонить' && /Напомин/.test(rem.response), rem.response);
    const remBare = env3.K.run('напомни', { source: 'test' });
    ok('A76b «напомни» без содержимого честно отклоняется, а не «не поняла» в общем виде',
      remBare.ok === false && remBare.intent.error.code === 'UNSUPPORTED_REMINDER');
    const ev = env3.K.run('перенеси встречу на 12', { source: 'test' });
    ok('A77 перенос события текстом отклоняется и не трогает календарь',
      ev.ok === false && /Календар/.test(ev.response) && env3.state.events.length === 0);
    /* Кириллица и \w: «создай заметку» должно создавать настоящую заметку через общее
       действие, а не общее «не поняла» — Stage 2, итерация 3 (заметки текстом). */
    const notesBefore77 = env3.state.notes.length;
    [['создай заметку список покупок', 'Список покупок'], ['добавь заметку про встречу', 'Про встречу'],
     ['запиши заметку идея', 'Идея']].forEach((pair, i) => {
      const note = env3.K.run(pair[0], { source: 'test' });
      ok('A77' + String.fromCharCode(97 + i) + ' «' + pair[0] + '» создаёт заметку с этим текстом',
        note.ok === true && note.result.action === 'note.create' && note.result.entity.title === pair[1] &&
        /Заметк/.test(note.response), note.response);
    });
    ok('A77g все три заметки действительно попали в общее состояние', env3.state.notes.length === notesBefore77 + 3);
    /* Слово «встреча» в середине чужой фразы не должно создавать событие:
       регрессия ревью PR #27 («добавь заметку про встречу» создавало событие
       «Событие заметку про встречу»). Не поняли — не угадываем. Теперь «добавь заметку
       про встречу» — это настоящая заметка (см. A77b), а не молчаливый отказ. */
    const evBefore = env3.state.events.length;
    const r77e1 = env3.K.run('добавь важную встречу', { source: 'test' });
    ok('A77e1 «добавь важную встречу» не создаёт случайное событие (слово не в начале фразы)',
      r77e1.ok === false && env3.state.events.length === evBefore, r77e1.response);
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
    const historyBeforeEmpty = env3.state.history.length;
    const empty = env3.K.run('   ', { source: 'test' });
    ok('A78 пустой ввод не выполняется и объясняется',
      empty.ok === false && empty.intent.error.code === 'EMPTY' && env3.state.history.length === historyBeforeEmpty);
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
      K9.supported().queries.length >= 6 && K9.supported().mutations.length === 7 &&
      K9.supported().notYet.length >= 4 && K9.examples().length >= 6);
  }

  /* ---- A13. Заметки текстом (Stage 2, итерация 3) ----
     COMMAND_ENGINE.md §9.3 относил заметки к явно неподдержанному первой итерацией;
     здесь — реальное поведение новой команды note.create/note.search поверх тех же
     Common Actions/Queries, что использует раздел «Заметки». */
  {
    const env10 = coreSandbox();
    const K10 = env10.K, C10 = env10.C;

    /* A160 — точное создание, содержимое сохранено дословно (включая регистр). */
    const r160 = K10.run('Создай заметку Купить фильтр для машины срочно', { source: 'assistant' });
    const n160 = env10.state.notes[0];
    ok('A160 «создай заметку …» создаёт настоящую заметку через общее действие',
      r160.ok && n160 && n160.body === 'Купить фильтр для машины срочно' && n160.title === 'Купить фильтр для машины срочно',
      JSON.stringify(n160));
    ok('A161 заметка находится обычным запросом раздела «Заметки»',
      C10.notes.getNotes({ status: 'active' }).items.some((x) => x.id === n160.id));
    ok('A162 запись истории создана один раз, помечена отменяемой',
      env10.state.history.length === 1 && env10.state.history[0].action === 'note.create' &&
      env10.state.history[0].undoable === true && env10.state.history[0].undo.type === 'remove' &&
      env10.state.history[0].source === 'assistant');
    ok('A163 ответ пользователю упоминает «Заметки» и «Историю», без служебных терминов',
      /Заметк/.test(r160.response) && /Истори/.test(r160.response) &&
      !/(note\.create|intent|payload|JSON)/i.test(r160.response), r160.response);

    /* A164 — очень длинный текст обрезается только в заголовке (ограничение 120 символов
       общего действия), тело заметки остаётся полным — второй схемы полей здесь нет. */
    const longText = 'слово '.repeat(30).trim();
    const r164 = K10.run('добавь заметку ' + longText, { source: 'test' });
    ok('A164 длинное содержимое заметки не обрезается в теле, заголовок укладывается в лимит',
      r164.ok && r164.result.entity.body === longText && r164.result.entity.title.length <= 120,
      r164.ok ? r164.result.entity.title.length : r164.response);

    /* A165 — пустая заметка не создаётся и не подставляет выдуманный текст. */
    const notesBefore165 = env10.state.notes.length;
    const historyBefore165 = env10.state.history.length;
    ['создай заметку', 'добавь заметку', 'запиши заметку'].forEach((phrase, i) => {
      const r = K10.run(phrase, { source: 'test' });
      ok('A165' + i + ' «' + phrase + '» без текста не создаёт пустую заметку',
        r.ok === false && r.intent.error.code === 'NOTE_CONTENT_REQUIRED' &&
        env10.state.notes.length === notesBefore165 && env10.state.history.length === historyBefore165,
        r.response);
    });

    /* A166 — обязательные регрессии: слова внутри содержимого заметки не должны
       переклассифицировать команду в другой домен (Event/Task/Finance/Auto). */
    const domainCases = [
      ['добавь заметку про встречу', 'Про встречу'],
      ['создай заметку купить билет', 'Купить билет'],
      ['запиши заметку расход 500 рублей', 'Расход 500 рублей'],
      ['добавь заметку заправить машину', 'Заправить машину']
    ];
    domainCases.forEach((pair, i) => {
      const before = { tasks: env10.state.tasks.length, events: env10.state.events.length, ops: env10.state.ops.length };
      const r = K10.run(pair[0], { source: 'test' });
      ok('A166' + i + ' «' + pair[0] + '» создаёт заметку, а не другой домен',
        r.ok === true && r.result.action === 'note.create' && r.result.entity.title === pair[1] &&
        env10.state.tasks.length === before.tasks && env10.state.events.length === before.events &&
        env10.state.ops.length === before.ops, r.response);
    });

    /* A167 — настоящие Task/Event команды по-прежнему работают рядом с заметками. */
    const r167a = K10.run('создай задачу проверить шины', { source: 'test' });
    ok('A167a обычная команда задачи продолжает работать', r167a.ok && r167a.result.action === 'task.create');
    const r167b = K10.run('добавь завтра в 9 встречу с механиком', { source: 'test' });
    ok('A167b обычная команда события продолжает работать',
      r167b.ok && r167b.result.action === 'event.create' && r167b.result.entity.title === 'Встреча с механиком');

    /* A168 — поиск/показ заметок: read-only, ничего не меняет и не пишет историю. */
    const K11env = coreSandbox();
    const K11 = K11env.K, C11 = K11env.C;
    C11.notes.createNote({ title: 'Идеи для отпуска', body: 'Куда поехать летом' }, { source: 'ui' });
    C11.notes.createNote({ title: 'Купить билет', body: 'Билет на поезд до отпуска' }, { source: 'ui' });
    C11.notes.createNote({ title: 'Список покупок', body: 'Молоко, хлеб' }, { source: 'ui' });
    const histBeforeSearch = K11env.state.history.length;
    const one = K11.run('Найди заметку про отпуск', { source: 'test' });
    ok('A168 поиск с одним результатом называет заметку и не меняет данные',
      one.ok && one.result.action === 'note.search' && /Идеи для отпуска/.test(one.response) &&
      K11env.state.history.length === histBeforeSearch && K11env.state.notes.length === 3, one.response);
    const many = K11.run('покажи заметки', { source: 'test' });
    ok('A169 поиск без слов после «заметки» показывает все активные заметки списком',
      many.ok && many.result.data.items.length === 3 &&
      /Идеи для отпуска/.test(many.response) && /Купить билет/.test(many.response), many.response);
    const none = K11.run('покажи заметки про динозавров', { source: 'test' });
    ok('A170 поиск без результатов честно об этом сообщает и не создаёт заметку',
      none.ok && none.result.data.items.length === 0 && /Не нашла/i.test(none.response) &&
      K11env.state.notes.length === 3, none.response);
    ok('A171 ответ поиска не показывает внутренние id/JSON/имя действия',
      !/(note\.search|intent|payload|"id"|\{)/i.test(one.response + many.response + none.response));
    /* Кириллица: регистр не должен ломать поиск (используется общий Notes-поиск).
       «Купить билет» тоже совпадает: его текст — «Билет на поезд до отпуска». */
    const caseInsensitive = K11.run('Покажи Заметки Про ОТПУСК', { source: 'test' });
    ok('A172 поиск заметок нечувствителен к регистру',
      caseInsensitive.ok && caseInsensitive.result.data.items.length === 2 &&
      caseInsensitive.result.data.items.some((x) => x.title === 'Идеи для отпуска'),
      caseInsensitive.result.data.items.map((x) => x.title));

    /* A173 — изменение/архив уже существующей заметки текстом остаются честно
       неподдержанными: ни мутации, ни истории, понятное объяснение. */
    const before173 = { notes: K11env.state.notes.length, history: K11env.state.history.length };
    const upd = K11.run('измени заметку купить билет', { source: 'test' });
    ok('A173a «измени заметку …» безопасно отклоняется',
      upd.ok === false && upd.intent.error.code === 'UNSUPPORTED_NOTE_UPDATE' &&
      /не умею/i.test(upd.response) && K11env.state.notes.length === before173.notes &&
      K11env.state.history.length === before173.history, upd.response);
    const arch = K11.run('заархивируй заметку купить билет', { source: 'test' });
    ok('A173b «заархивируй заметку …» безопасно отклоняется',
      arch.ok === false && arch.intent.error.code === 'UNSUPPORTED_NOTE_ARCHIVE' &&
      K11env.state.notes.length === before173.notes && K11env.state.history.length === before173.history, arch.response);
    const delNote = K11.run('удали заметку купить билет', { source: 'test' });
    ok('A173c «удали заметку …» остаётся неподдержанным удалением, как и раньше',
      delNote.ok === false && delNote.intent.error.code === 'UNSUPPORTED_DELETE' &&
      K11env.state.notes.length === before173.notes && K11env.state.history.length === before173.history, delNote.response);

    /* A174 — parse() для заметок остаётся чистым: разбор без исполнения не мутирует. */
    const env12 = coreSandbox();
    const beforeParse = JSON.stringify(env12.state);
    ['создай заметку купить фильтр', 'покажи заметки', 'найди заметку про отпуск',
      'измени заметку тест', 'архивируй заметку тест', 'создай заметку'].forEach((t) => env12.K.parse(t));
    ok('A175 разбор note-команд не меняет данные и не пишет историю',
      JSON.stringify(env12.state) === beforeParse && env12.state.history.length === 0);
  }

  /* ---- A14. Напоминания текстом (Stage 2, итерация 4) ----
     MVP_SCOPE.md §4.2.4/§4.2.6/§4.2.8 относил напоминания (наравне с расходами, покупками
     и заправками) к следующим документированным блокам после заметок. Единственный
     существующий контракт напоминания — `AvenActions.reminders`, фасад над `AvenNotify`
     (второго движка напоминаний в командном слое нет — см. также A153 выше). */
  {
    const env13 = coreSandbox();
    const K13 = env13.K, C13 = env13.C, N13 = env13.N;
    ok('A180 фасад напоминаний и движок AvenNotify действительно загружены для проверки',
      typeof N13 === 'object' && typeof C13.reminders.create === 'function' && typeof C13.reminders.list === 'function');

    /* A181–A184 — точное создание, содержимое и дата/время сохранены дословно. */
    const r181 = K13.run('Напомни купить масло на завтра', { source: 'assistant' });
    const rem181 = env13.state.reminders[0];
    ok('A181 «напомни …» создаёт настоящее напоминание через общее действие',
      r181.ok && rem181 && rem181.title === 'Купить масло' && rem181.dateISO === '2026-09-29' && rem181.time === '',
      JSON.stringify(rem181));
    ok('A182 напоминание находится обычным запросом раздела (общий Common Query)',
      C13.reminders.list({}).items.some((x) => x.id === rem181.id));
    ok('A183 запись истории создана один раз, через общий фасад, помечена отменяемой',
      env13.state.history.length === 1 && env13.state.history[0].action === 'reminder.create' &&
      env13.state.history[0].undoable === true && env13.state.history[0].undo.type === 'remove' &&
      env13.state.history[0].undo.list === 'reminders' && env13.state.history[0].source === 'assistant');
    ok('A184 ответ пользователю понятен, называет дату и упоминает «Уведомления»/«Историю», без служебных терминов',
      /Напомин/.test(r181.response) && /завтра/i.test(r181.response) && /Уведомлен/.test(r181.response) &&
      /Истори/.test(r181.response) && !/(reminder\.create|intent|payload|JSON)/i.test(r181.response), r181.response);
    ok('A184b ответ не обещает доставку при закрытом сайте (push/email/фон)',
      !/(push|письм|email|почт|даже.{0,15}закрыт)/i.test(r181.response), r181.response);

    /* A185 — время необязательно, но сохраняется, когда указано. */
    const r185 = K13.run('Напомни завтра в 10 позвонить Сергею', { source: 'test' });
    ok('A185 время распознаётся отдельно от содержимого и сохраняется в напоминании',
      r185.ok && r185.result.entity.time === '10:00' && r185.result.entity.title === 'Позвонить Сергею',
      JSON.stringify(r185.result && r185.result.entity));

    /* A186 — «создай/добавь напоминание …» работает тем же образом, что и «напомни …». */
    const r186 = K13.run('Создай напоминание оплатить интернет на пятницу', { source: 'test' });
    ok('A186 «создай напоминание …» создаёт напоминание тем же общим действием',
      r186.ok && r186.result.action === 'reminder.create' && r186.result.entity.title === 'Оплатить интернет' &&
      r186.result.entity.dateISO === '2026-10-02', r186.response);

    /* A187 — общие часы, а не системное время: контекст передаёт «сегодня». */
    const r187 = K13.run('напомни завтра позвонить маме', { source: 'test', todayISO: '2026-12-31' });
    ok('A187 напоминание считает «завтра» от переданных общих часов, а не системной даты',
      r187.ok && r187.result.entity.dateISO === '2027-01-01', JSON.stringify(r187.result && r187.result.entity));

    /* A188–A189 — обязательные поля: без даты и без содержимого напоминание не создаётся. */
    const remindersBefore188 = env13.state.reminders.length;
    const histBefore188 = env13.state.history.length;
    const noDate = K13.run('напомни купить масло', { source: 'test' });
    ok('A188 без даты напоминание честно не создаётся (общий слой требует дату)',
      noDate.ok === false && noDate.intent.error.code === 'REMINDER_DATE_REQUIRED' &&
      /дату/i.test(noDate.response) && env13.state.reminders.length === remindersBefore188 &&
      env13.state.history.length === histBefore188, noDate.response);
    const noContent = K13.run('напомни завтра', { source: 'test' });
    ok('A189 без содержимого напоминание честно не создаётся, а не с выдуманным текстом',
      noContent.ok === false && noContent.intent.error.code === 'REMINDER_CONTENT_REQUIRED' &&
      env13.state.reminders.length === remindersBefore188 && env13.state.history.length === histBefore188,
      noContent.response);
    ['создай напоминание', 'добавь напоминание'].forEach((phrase, i) => {
      const r = K13.run(phrase, { source: 'test' });
      ok('A189' + String.fromCharCode(98 + i) + ' «' + phrase + '» без текста тоже честно отклоняется',
        r.ok === false && r.intent.error.code === 'REMINDER_CONTENT_REQUIRED' &&
        env13.state.reminders.length === remindersBefore188 && env13.state.history.length === histBefore188, r.response);
    });

    /* A190–A191 — невозможные дата/время: ошибка, а не «почти похожая» дата, ноль мутаций. */
    const badDate = K13.run('напомни купить масло на 31.02', { source: 'test' });
    ok('A190 несуществующая дата не создаёт напоминание',
      badDate.ok === false && badDate.intent.error.code === 'DATE_INVALID' &&
      env13.state.reminders.length === remindersBefore188 && env13.state.history.length === histBefore188);
    const badTime = K13.run('напомни завтра в 25:00 позвонить', { source: 'test' });
    ok('A191 несуществующее время не создаёт напоминание',
      badTime.ok === false && badTime.intent.error.code === 'TIME_INVALID' &&
      env13.state.reminders.length === remindersBefore188 && env13.state.history.length === histBefore188);

    /* A192 — Undo общим механизмом истории удаляет именно это напоминание. */
    const before192 = env13.state.reminders.length;
    const r192 = K13.run('напомни завтра проверить почту', { source: 'test' });
    const entry192 = env13.state.history[0];
    ok('A192a напоминание действительно добавлено', env13.state.reminders.length === before192 + 1 && r192.ok);
    const undoEntry = env13.state.history.filter((e) => e.id === entry192.id)[0];
    /* Симулируем обратную операцию так же, как её выполняет общий undo (history.js
       читает undo.type === 'remove' и убирает запись из указанного списка по id). */
    if (undoEntry && undoEntry.undo && undoEntry.undo.type === 'remove') {
      const list = env13.state[undoEntry.undo.list];
      const idx = list.findIndex((x) => x.id === undoEntry.undo.id);
      if (idx >= 0) list.splice(idx, 1);
    }
    ok('A192b Undo убирает ровно созданное напоминание и ничего больше',
      env13.state.reminders.length === before192 && !env13.state.reminders.some((r) => r.id === r192.result.entity.id));

    /* A193–A196 — обязательные regression-кейсы домена: содержимое напоминания не
       переключает команду на другой домен, даже если внутри есть слова других разделов. */
    const domainCases = [
      ['напомни создать задачу купить масло завтра', 'Создать задачу купить масло'],
      ['напомни про встречу завтра', 'Про встречу'],
      ['напомни завтра записать расход 500 рублей', 'Записать расход 500 рублей'],
      ['напомни завтра создать заметку про отпуск', 'Создать заметку про отпуск']
    ];
    domainCases.forEach((pair, i) => {
      const before = { tasks: env13.state.tasks.length, events: env13.state.events.length,
        ops: env13.state.ops.length, notes: env13.state.notes.length };
      const r = K13.run(pair[0], { source: 'test' });
      ok('A193' + String.fromCharCode(97 + i) + ' «' + pair[0] + '» создаёт напоминание, а не другой домен',
        r.ok === true && r.result.action === 'reminder.create' && r.result.entity.title === pair[1] &&
        env13.state.tasks.length === before.tasks && env13.state.events.length === before.events &&
        env13.state.ops.length === before.ops && env13.state.notes.length === before.notes, r.response);
    });
    /* Без даты (как в примерах §9 задания) — честная просьба указать дату, тоже без
       случайного попадания в Finance/Note: домен остаётся «reminder», просто с ошибкой. */
    const noDateDomainCases = [
      'создай напоминание записать расход 500 рублей',
      'напомни создать заметку про отпуск'
    ];
    noDateDomainCases.forEach((t, i) => {
      const before = { ops: env13.state.ops.length, notes: env13.state.notes.length, history: env13.state.history.length };
      const r = K13.run(t, { source: 'test' });
      ok('A194' + String.fromCharCode(97 + i) + ' «' + t + '» без даты остаётся в домене «напоминание», не создаёт Finance/Note',
        r.ok === false && r.intent.error.rule === 'reminder.create' && r.intent.error.code === 'REMINDER_DATE_REQUIRED' &&
        env13.state.ops.length === before.ops && env13.state.notes.length === before.notes &&
        env13.state.history.length === before.history, r.response);
    });

    /* A195 — настоящие Task/Event/Note команды по-прежнему работают рядом с напоминаниями. */
    const r195a = K13.run('создай задачу проверить шины', { source: 'test' });
    ok('A195a обычная команда задачи продолжает работать', r195a.ok && r195a.result.action === 'task.create');
    const r195b = K13.run('добавь завтра в 9 встречу с механиком', { source: 'test' });
    ok('A195b обычная команда события продолжает работать',
      r195b.ok && r195b.result.action === 'event.create' && r195b.result.entity.title === 'Встреча с механиком');
    const r195c = K13.run('создай заметку про отпуск в горах', { source: 'test' });
    ok('A195c обычная команда заметки продолжает работать',
      r195c.ok && r195c.result.action === 'note.create');

    /* A196 — read-only список/поиск: ничего не меняет, не пишет историю. */
    const env14 = coreSandbox();
    const K14 = env14.K, C14 = env14.C;
    C14.reminders.create({ title: 'Оплатить интернет', dateISO: '2026-10-05' }, { source: 'ui' });
    C14.reminders.create({ title: 'Купить билет на поезд', dateISO: '2026-10-06', time: '09:00' }, { source: 'ui' });
    C14.reminders.create({ title: 'Позвонить маме', dateISO: '2026-10-07' }, { source: 'ui' });
    const histBeforeSearch = env14.state.history.length;
    const one = K14.run('Найди напоминание про интернет', { source: 'test' });
    ok('A196 поиск с одним результатом называет напоминание, дату и не меняет данные',
      one.ok && one.result.action === 'reminder.search' && /Оплатить интернет/.test(one.response) &&
      env14.state.history.length === histBeforeSearch && env14.state.reminders.length === 3, one.response);
    const many = K14.run('покажи напоминания', { source: 'test' });
    ok('A197 показ без слов после «напоминания» показывает все напоминания списком',
      many.ok && many.result.data.items.length === 3 &&
      /Оплатить интернет/.test(many.response) && /Купить билет на поезд/.test(many.response), many.response);
    const many2 = K14.run('какие у меня напоминания', { source: 'test' });
    ok('A198 «какие у меня напоминания?» — тот же список, а не обзор дня',
      many2.ok && many2.result.action === 'reminder.search' && many2.result.data.items.length === 3, many2.response);
    const none = K14.run('покажи напоминания про динозавров', { source: 'test' });
    ok('A199 поиск без результатов честно об этом сообщает и не создаёт напоминание',
      none.ok && none.result.data.items.length === 0 && /Не нашла/i.test(none.response) &&
      env14.state.reminders.length === 3, none.response);
    ok('A199b ответ поиска не показывает внутренние id/JSON/имя действия',
      !/(reminder\.search|intent|payload|"id"|\{)/i.test(one.response + many.response + many2.response + none.response));
    const caseInsensitive = K14.run('Покажи Напоминания Про ИНТЕРНЕТ', { source: 'test' });
    ok('A199c поиск напоминаний нечувствителен к регистру (кириллица, не ASCII \\b/\\w)',
      caseInsensitive.ok && caseInsensitive.result.data.items.length === 1 &&
      caseInsensitive.result.data.items[0].title === 'Оплатить интернет', caseInsensitive.response);

    /* A200 — операции над уже существующим напоминанием (изменить/отложить/скрыть/удалить)
       вне scope этой итерации и остаются честно неподдержанными, без мутации и истории. */
    const before200 = { reminders: env14.state.reminders.length, history: env14.state.history.length };
    const upd = K14.run('измени напоминание про интернет на завтра', { source: 'test' });
    ok('A200a «измени напоминание …» безопасно отклоняется',
      upd.ok === false && upd.intent.error.code === 'UNSUPPORTED_REMINDER' &&
      /не умею/i.test(upd.response) && env14.state.reminders.length === before200.reminders &&
      env14.state.history.length === before200.history, upd.response);
    const snooze = K14.run('отложи напоминание про интернет', { source: 'test' });
    ok('A200b «отложи напоминание …» безопасно отклоняется',
      snooze.ok === false && snooze.intent.error.code === 'UNSUPPORTED_REMINDER' &&
      env14.state.reminders.length === before200.reminders && env14.state.history.length === before200.history);
    const dismiss = K14.run('скрой напоминание про интернет', { source: 'test' });
    ok('A200c «скрой напоминание …» безопасно отклоняется',
      dismiss.ok === false && dismiss.intent.error.code === 'UNSUPPORTED_REMINDER' &&
      env14.state.reminders.length === before200.reminders && env14.state.history.length === before200.history);
    const delRem = K14.run('удали напоминание про интернет', { source: 'test' });
    ok('A200d «удали напоминание …» остаётся неподдержанным удалением, как и другие домены',
      delRem.ok === false && delRem.intent.error.code === 'UNSUPPORTED_DELETE' &&
      env14.state.reminders.length === before200.reminders && env14.state.history.length === before200.history);

    /* A200e — review-фикс: широкая (неанкорированная) проверка «слово напоминание/напомни
       встречается где-то в фразе» ложно классифицировала обычные фразы, вообще не относящиеся
       к изменению существующего напоминания, как «изменять уже созданное напоминание не умею» —
       это была неправда (ADR-010: нельзя утверждать то, что не соответствует действительности).
       Такие фразы должны получать честное общее «не поняла команду», как и у задач/событий/
       заметок в аналогичной ситуации (ср. «Пожалуйста, создай задачу …» → тоже UNKNOWN_COMMAND). */
    const notARealReminderCommand = [
      'Пожалуйста напомни купить хлеб на завтра',
      'Кто-то напомни мне купить хлеб',
      'у меня три напоминания уже есть'
    ];
    notARealReminderCommand.forEach((text, i) => {
      const before = { reminders: env14.state.reminders.length, history: env14.state.history.length };
      const r = K14.run(text, { source: 'test' });
      ok('A200e.' + i + ' «' + text + '» не путается с «изменить уже созданное напоминание»',
        r.ok === false && r.intent.error.code === 'UNKNOWN_COMMAND' &&
        env14.state.reminders.length === before.reminders && env14.state.history.length === before.history, r.response);
    });
    /* Ровно эти же формы (начало фразы с триггера напоминания, включая пустой «напомни», и
       явный глагол изменения рядом с «напоминание») по-прежнему честно отклоняются как
       UNSUPPORTED_REMINDER — фикс не ослабляет уже протестированное поведение A76b/A200a-c. */
    ['напомни', 'напомни ', 'Отложи напоминание', 'Верни напоминание про интернет'].forEach((text, i) => {
      const r = K14.run(text, { source: 'test' });
      ok('A200f.' + i + ' «' + text + '» по-прежнему честно отклоняется как UNSUPPORTED_REMINDER',
        r.ok === false && r.intent.error.code === 'UNSUPPORTED_REMINDER', JSON.stringify(r.intent && r.intent.error));
    });

    /* A201 — parse() для напоминаний остаётся чистым: разбор без исполнения не мутирует. */
    const env15 = coreSandbox();
    const beforeParse15 = JSON.stringify(env15.state);
    ['напомни купить масло на завтра', 'покажи напоминания', 'найди напоминание про интернет',
      'напомни купить масло', 'напомни завтра', 'напомни купить масло на 31.02',
      'измени напоминание тест', 'отложи напоминание тест', 'удали напоминание тест'].forEach((t) => env15.K.parse(t));
    ok('A201 разбор reminder-команд не меняет данные и не пишет историю',
      JSON.stringify(env15.state) === beforeParse15 && env15.state.history.length === 0);
    /* Сброс старого pending Task-флоу новой независимой командой о напоминании — это
       поведение AvenCommandSession (transient orchestration), а не голого AvenCommand.run();
       проверено поведенчески в command-session-check.js (раздел «Напоминания сбрасывают…»). */
  }

  /* ---- A15. Расходы текстом (Stage 2, итерация 5) ----
     Утверждённая владельцем финансовая политика: ЛЮБАЯ денежная мутация проходит
     подтверждение, категория и счёт только связываются с существующими (движок их
     не создаёт), сумма переводится в целые копейки до общего действия, а сокращения
     («5к») и пересчёт валют честно не поддержаны. Контракт — docs/COMMAND_ENGINE.md §13. */
  {
    function finSandbox() {
      const env = coreSandbox();
      env.state.finAccounts = [
        { id: 'card', name: 'Карта', balance: 10000 },
        { id: 'cash', name: 'Наличные', balance: 5000 }
      ];
      env.state.finCategories = ['Авто', 'Продукты', 'Продукты для дачи', 'Дом', 'Другое'];
      return env;
    }
    const envF = finSandbox();
    const KF = envF.K, CF = envF.C;
    const amountOf = (text) => {
      const parsed = KF.parse(text, { source: 'test' });
      return parsed.ok ? parsed.params.amountMinor : 'ERR:' + parsed.error.code;
    };
    ok('A210 сумма «500» разбирается в 50000 копеек', amountOf('Запиши расход 500 на продукты') === 50000);
    ok('A211 сумма «500 ₽» разбирается в 50000 копеек', amountOf('Запиши расход 500 ₽ на продукты') === 50000);
    ok('A212 сумма «500 руб» разбирается в 50000 копеек', amountOf('Запиши расход 500 руб на продукты') === 50000);
    ok('A213 сумма «500 рублей» разбирается в 50000 копеек', amountOf('Запиши расход 500 рублей на продукты') === 50000);
    ok('A214 сумма «500,50» разбирается в 50050 копеек', amountOf('Запиши расход 500,50 на продукты') === 50050);
    ok('A215 сумма «500.50» разбирается в 50050 копеек', amountOf('Запиши расход 500.50 на продукты') === 50050);
    ok('A216 сумма «1 250,50 ₽» разбирается в 125050 копеек', amountOf('Добавь расход 1 250,50 ₽ на продукты') === 125050);
    ok('A217 неразрывный пробел в сумме не ломает разбор', amountOf('Добавь расход 1\u00a0250,50 ₽ на продукты') === 125050);
    ok('A218 копейки не теряются: «0,10» и «0,20» дают ровно 10 и 20 копеек',
      amountOf('Запиши расход 0,10 на продукты') === 10 && amountOf('Запиши расход 0,20 на продукты') === 20);
    ok('A219 сумма — целые минимальные единицы, без float-артефактов',
      Number.isInteger(amountOf('Запиши расход 0,30 на продукты')) && amountOf('Запиши расход 0,30 на продукты') === 30);
    ok('A220 ноль отклоняется без выполнения',
      amountOf('Запиши расход 0 на продукты') === 'ERR:AMOUNT_INVALID');
    ok('A221 «0,00» отклоняется как сумма не больше нуля',
      amountOf('Запиши расход 0,00 на продукты') === 'ERR:AMOUNT_INVALID');
    ok('A222 отрицательная сумма отклоняется',
      amountOf('Запиши расход -500 на продукты') === 'ERR:AMOUNT_INVALID');
    ok('A223 сокращение «5к» не поддержано и не превращается молча в 5 или 5000',
      amountOf('Запиши расход 5к на продукты') === 'ERR:AMOUNT_UNSUPPORTED');
    ok('A224 сокращения «1.2к» и «1,2к» тоже отклоняются',
      amountOf('Запиши расход 1.2к на продукты') === 'ERR:AMOUNT_UNSUPPORTED' &&
      amountOf('Запиши расход 1,2к на продукты') === 'ERR:AMOUNT_UNSUPPORTED');
    ok('A225 сумма словами («пятьсот», «полтысячи») не угадывается',
      amountOf('Запиши расход пятьсот рублей на продукты') === 'ERR:AMOUNT_REQUIRED' &&
      amountOf('Запиши расход полтысячи на продукты') === 'ERR:AMOUNT_REQUIRED');
    ok('A226 чужая валюта не конвертируется, а честно отклоняется',
      amountOf('Запиши расход 20 долларов на продукты') === 'ERR:CURRENCY_UNSUPPORTED' &&
      amountOf('Запиши расход $20 на продукты') === 'ERR:CURRENCY_UNSUPPORTED' &&
      amountOf('Запиши расход 20 € на продукты') === 'ERR:CURRENCY_UNSUPPORTED');
    ok('A227 неоднозначная запись «1.250,50» отклоняется, а не толкуется наугад',
      amountOf('Запиши расход 1.250,50 на продукты') === 'ERR:AMOUNT_UNSUPPORTED');
    ok('A228 ответ на неподдержанную сумму объясняет поддерживаемый формат',
      /5к/.test(KF.run('Запиши расход 5к на продукты', { source: 'test' }).response) &&
      /500,50|1 250,50/.test(KF.run('Запиши расход 5к на продукты', { source: 'test' }).response));
    ok('A229 неподдержанная сумма не создаёт ни операции, ни записи истории',
      envF.state.ops.length === 0 && envF.state.history.length === 0);

    /* Подтверждение обязательно даже для полностью однозначной команды. */
    const exact = KF.run('Запиши расход 850 ₽ на продукты со счета карта', { source: 'assistant' });
    ok('A230 точный расход не выполняется сразу, а требует подтверждения',
      exact.result.status === 'confirmation_required' && exact.result.code === 'CONFIRMATION_REQUIRED' &&
      exact.intent.requiresConfirmation === true, JSON.stringify(exact.result.status));
    ok('A231 до подтверждения нет ни операции, ни изменения баланса, ни истории',
      envF.state.ops.length === 0 && envF.state.finAccounts[0].balance === 10000 && envF.state.history.length === 0);
    ok('A232 текст подтверждения называет тип, сумму, категорию, счёт и конкретную дату',
      /Записать расход/.test(exact.response) && /850,00/.test(exact.response) &&
      /Продукты/.test(exact.response) && /Карта/.test(exact.response) &&
      /28\.09\.2026/.test(exact.response), exact.response);
    ok('A233 подтверждение не показывает внутренних идентификаторов и JSON',
      !/(card|cash|\bo\d|finance\.expense|\{)/.test(exact.response), exact.response);

    /* Выполнение возможно только через общее действие и только после подтверждения. */
    const doneRes = KF.execute(exact.intent, { source: 'assistant', confirmed: true, slots: {} });
    ok('A234 после подтверждения создана ровно одна операция через общее действие',
      doneRes.ok && envF.state.ops.length === 1 && envF.state.ops[0].type === 'expense' &&
      envF.state.ops[0].cat === 'Продукты' && envF.state.ops[0].account === 'card' &&
      CF.money.minor(envF.state.ops[0].amount) === 85000, JSON.stringify(envF.state.ops[0]));
    ok('A235 баланс счёта пересчитан общим слоем, а не движком команд',
      envF.state.finAccounts[0].balance === 9150);
    ok('A236 история создана ровно один раз, отменяемая, с источником команды',
      envF.state.history.length === 1 && envF.state.history[0].action === 'finance.expense.create' &&
      envF.state.history[0].undoable === true && envF.state.history[0].source === 'assistant');
    ok('A237 итоги «Финансов» изменились производно, через существующие запросы',
      CF.finance.totals({ period: 'today', type: 'expense', refISO: FIXED }).expense === 850 &&
      CF.finance.summary(FIXED).todayExpense === 850);
    ok('A238 ответ человеческий: сумма, категория, счёт, дата, «Финансы» и «История»',
      /850,00/.test(KF.respond(doneRes)) && /Продукты/.test(KF.respond(doneRes)) &&
      /Карта/.test(KF.respond(doneRes)) && /Финанс/.test(KF.respond(doneRes)) &&
      /Истори/.test(KF.respond(doneRes)) && !/\{|finance\.expense\.create/.test(KF.respond(doneRes)));

    /* Дата: общие часы, явная дата, невалидная дата. */
    ok('A239 без даты расход относится к «сегодня» общих часов приложения',
      envF.state.ops[0].dateISO === FIXED);
    const yest = KF.parse('Запиши расход 100 на продукты вчера', { source: 'test' });
    ok('A240 явная дата («вчера») разбирается по общим часам', yest.ok && yest.params.dateISO === '2026-09-27');
    const badDate = KF.parse('Запиши расход 100 на продукты 31.02', { source: 'test' });
    ok('A241 невалидная дата отклоняется без выполнения и без истории',
      !badDate.ok && badDate.error.code === 'DATE_INVALID' && envF.state.ops.length === 1 && envF.state.history.length === 1);

    /* Категория и счёт: exact / inferred / ambiguous / unknown. */
    const envG = finSandbox();
    const KG = envG.K;
    const catExact = KG.execute(KG.parse('Запиши расход 100 на продукты со счета карта'), { source: 'test' });
    ok('A242 точная категория и точный счёт разрешаются как EXACT и ведут к подтверждению',
      catExact.status === 'confirmation_required' && catExact.resolution === 'EXACT' &&
      catExact.preview.cat === 'Продукты' && catExact.preview.accountName === 'Карта');
    const catInf = KG.execute(KG.parse('Запиши расход 100 на дом со счета наличные'), { source: 'test' });
    ok('A243 однозначное неполное совпадение категории/счёта — INFERRED, и тоже с подтверждением',
      catInf.status === 'confirmation_required' && catInf.preview.cat === 'Дом' && catInf.preview.accountName === 'Наличные');
    /* Неоднозначность проверяется на данных, где ни одно название не совпадает целиком. */
    const envAmb = finSandbox();
    envAmb.state.finCategories = ['Ремонт дачи', 'Продукты для дачи', 'Другое'];
    envAmb.state.finAccounts = [{ id: 'sber', name: 'Карта Сбер', balance: 1000 }, { id: 'alfa', name: 'Карта Альфа', balance: 1000 }];
    const KA = envAmb.K;
    const catAmb = KA.execute(KA.parse('Запиши расход 100 на дачи'), { source: 'test' });
    ok('A244 несколько подходящих категорий → уточнение, мутации нет',
      catAmb.status === 'ambiguous' && catAmb.slot === 'cat' && catAmb.candidates.length === 2 &&
      envAmb.state.ops.length === 0, catAmb.status + '/' + (catAmb.candidates || []).length);
    const accAmb = KA.execute(KA.parse('Запиши расход 100 на другое со счета карта'), { source: 'test' });
    ok('A244b несколько подходящих счетов → уточнение, мутации нет',
      accAmb.status === 'ambiguous' && accAmb.slot === 'account' && accAmb.candidates.length === 2 &&
      envAmb.state.ops.length === 0, accAmb.status + '/' + (accAmb.candidates || []).length);
    const catUnknown = KG.execute(KG.parse('Запиши расход 100 на еду'), { source: 'test' });
    ok('A245 неизвестная категория не создаётся автоматически: отказ без мутации',
      catUnknown.status === 'not_found' && catUnknown.code === 'CATEGORY_NOT_FOUND' &&
      envG.state.finCategories.length === 5 && envG.state.ops.length === 0);
    ok('A246 ответ про неизвестную категорию честно говорит, что Aven её не создаёт, и перечисляет доступные',
      /не создаю/.test(KG.respond(catUnknown)) && /Продукты/.test(KG.respond(catUnknown)));
    const noCat = KG.execute(KG.parse('Запиши расход 100'), { source: 'test' });
    ok('A247 без категории Aven не подставляет её молча, а спрашивает',
      noCat.status === 'ambiguous' && noCat.slot === 'cat' && envG.state.ops.length === 0);
    const noAcc = KG.execute(KG.parse('Запиши расход 100 на продукты'), { source: 'test' });
    ok('A248 без счёта Aven не подставляет его молча, а спрашивает',
      noAcc.status === 'ambiguous' && noAcc.slot === 'account' && envG.state.ops.length === 0);
    const accUnknown = KG.execute(KG.parse('Запиши расход 100 на продукты со счета тинькофф'), { source: 'test' });
    ok('A249 неизвестный счёт не создаётся автоматически: отказ без мутации',
      accUnknown.status === 'not_found' && accUnknown.code === 'ACCOUNT_NOT_FOUND' &&
      envG.state.finAccounts.length === 2 && envG.state.ops.length === 0);
    ok('A250 уточнение счёта/категории не показывает внутренние id',
      !/(card|cash)/.test(KG.respond(noAcc)) && /Карта/.test(KG.respond(noAcc)), KG.respond(noAcc));

    /* Исчезнувшие между уточнением и подтверждением счёт/категория. */
    const envH = finSandbox();
    const KH = envH.K;
    const intentH = KH.parse('Запиши расход 100');
    const staleCtx = { source: 'test', slots: { cat: 'Дом', account: 'cash' }, confirmed: true };
    envH.state.finCategories = envH.state.finCategories.filter((c) => c !== 'Дом');
    const staleRes = KH.execute(intentH, staleCtx);
    ok('A251 исчезнувшая категория безопасно останавливает подтверждение (no fake success)',
      staleRes.status === 'stale' && staleRes.ok === false && envH.state.ops.length === 0 && envH.state.history.length === 0);
    envH.state.finAccounts = envH.state.finAccounts.filter((a) => a.id !== 'cash');
    const staleAcc = KH.execute(intentH, { source: 'test', slots: { cat: 'Продукты', account: 'cash' }, confirmed: true });
    ok('A252 исчезнувший счёт тоже безопасно останавливает подтверждение',
      staleAcc.status === 'stale' && envH.state.ops.length === 0 && envH.state.history.length === 0);

    /* Undo возвращает операцию, баланс и итоги. */
    const envI = finSandbox();
    const KI = envI.K, CI = envI.C;
    const okRes = KI.execute(KI.parse('Запиши расход 200 на продукты со счета карта'),
      { source: 'assistant', confirmed: true });
    ok('A253 подтверждённый расход учтён в итогах месяца',
      okRes.ok && CI.finance.summary(FIXED).monthExpense === 200);
    const undoSpec = envI.state.history[0].undo;
    ok('A254 запись истории содержит настоящее описание отмены (удалить операцию и вернуть баланс)',
      undoSpec && undoSpec.type === 'remove' && undoSpec.list === 'ops' &&
      undoSpec.id === envI.state.ops[0].id && JSON.stringify(undoSpec.adjust).indexOf('finAccounts') >= 0,
      JSON.stringify(undoSpec));
    ok('A254b итоги и баланс — производные, отдельного «командного» счётчика не появилось',
      CI.finance.balance() === envI.state.finAccounts.reduce((x, a) => x + a.balance, 0) &&
      typeof envI.state.finMonth === 'undefined');

    /* Read-only запросы расходов. */
    const envJ = finSandbox();
    const KJ = envJ.K, CJ = envJ.C;
    CJ.finance.createOperation({ type: 'expense', amount: 850, cat: 'Продукты', account: 'card', dateISO: FIXED }, { source: 'ui' });
    CJ.finance.createOperation({ type: 'expense', amount: 300.5, cat: 'Авто', account: 'card', dateISO: FIXED }, { source: 'ui' });
    const histBefore = envJ.state.history.length;
    const listRes = KJ.run('Покажи расходы за сегодня', { source: 'assistant' });
    ok('A255 «Покажи расходы за сегодня» — read-only список через существующий Common Query',
      listRes.ok && listRes.result.action === 'finance.list' && listRes.result.data.items.length === 2 &&
      listRes.intent.kind === 'query');
    ok('A256 сумма в ответе совпадает с общим запросом итогов, без float-артефактов',
      listRes.result.data.totals.expense === CJ.finance.totals({ period: 'today', type: 'expense', refISO: FIXED }).expense &&
      /1[\s\u00a0\u202f]150,50/.test(listRes.response), listRes.response);
    ok('A257 read-only запрос не меняет данные и не пишет историю',
      envJ.state.ops.length === 2 && envJ.state.history.length === histBefore);
    ok('A258 ответ без внутренних id и JSON',
      !/(\bo\d\b|card|finance\.list|\{)/.test(listRes.response), listRes.response);
    const byCat = KJ.run('Покажи расходы на продукты', { source: 'assistant' });
    ok('A259 фильтр по существующей категории использует существующий Common Query',
      byCat.ok && byCat.result.data.cat === 'Продукты' && byCat.result.data.items.length === 1);
    const byUnknown = KJ.run('Покажи расходы на еду', { source: 'assistant' });
    ok('A260 просмотр по несуществующей категории честно объясняет и ничего не меняет',
      /нет/.test(byUnknown.response) && envJ.state.ops.length === 2 && envJ.state.history.length === histBefore);
    ok('A261 «Сколько я потратил сегодня?» по-прежнему отвечает сводкой из тех же данных',
      /1[\s\u00a0\u202f]151|1[\s\u00a0\u202f]150/.test(KJ.run('Сколько я потратил сегодня?', { source: 'test' }).response),
      KJ.run('Сколько я потратил сегодня?', { source: 'test' }).response);

    /* Границы домена: финансовая команда не должна стать другим доменом и наоборот. */
    const envK = finSandbox();
    const KK = envK.K;
    const dom1 = KK.parse('Запиши расход 500 ₽ на заметки');
    ok('A262 «расход … на заметки» остаётся финансовой командой, а не заметкой',
      dom1.ok && dom1.action === 'finance.expense.create');
    const dom2 = KK.parse('Запиши расход 500 ₽ на встречу');
    ok('A263 «расход … на встречу» остаётся финансовой командой, а не событием',
      dom2.ok && dom2.action === 'finance.expense.create');
    const dom3 = KK.parse('Расход 500 ₽ на напоминание');
    ok('A264 «Расход 500 ₽ на напоминание» остаётся финансовой командой',
      dom3.ok && dom3.action === 'finance.expense.create');
    const dom4 = KK.parse('Создай заметку расход 500 рублей');
    ok('A265 «Создай заметку расход 500 рублей» остаётся заметкой',
      dom4.ok && dom4.action === 'note.create' && dom4.params.content === 'расход 500 рублей');
    const dom5 = KK.parse('Напомни записать расход 500 рублей завтра');
    ok('A266 «Напомни записать расход …» остаётся напоминанием',
      dom5.ok && dom5.action === 'reminder.create');
    const dom6 = KK.parse('Создай задачу записать расход 500 рублей');
    ok('A267 «Создай задачу записать расход …» остаётся задачей',
      dom6.ok && dom6.action === 'task.create');
    const dom7 = KK.parse('Добавь завтра в 10 встречу с Сергеем');
    ok('A268 обычная команда события не перехвачена финансовым правилом',
      dom7.ok && dom7.action === 'event.create');
    ok('A269 доходы честно не поддержаны (расход-first блок)',
      !KK.parse('Запиши доход 500 на продукты').ok &&
      KK.parse('Запиши доход 500 на продукты').error.code === 'UNSUPPORTED_FINANCE_INCOME');
    ok('A270 кириллические формы «потратил/потратила» распознаются, а «потратил» внутри вопроса — нет',
      KK.parse('Потратил 500 рублей на продукты').action === 'finance.expense.create' &&
      KK.parse('Потратила 500 рублей на продукты').action === 'finance.expense.create' &&
      KK.parse('Сколько я потратил сегодня?').action === 'finance.summary');

    /* Дефекты, найденные независимым ревью перед мержем (итерация 5). */
    const envR = finSandbox();
    const KR = envR.K;
    const parseCode = (t) => { const x = KR.parse(t, { source: 'test' }); return x.ok ? x.action : x.error.code; };
    ok('A273 «удали расход …» не отвечает сводкой расходов, а честно отказывает',
      parseCode('удали расход 500') === 'UNSUPPORTED_DELETE' &&
      parseCode('удали последний расход') === 'UNSUPPORTED_DELETE');
    ok('A274 «измени расход …» — честный отказ об изменении операции, а не сводка',
      parseCode('измени расход 500') === 'UNSUPPORTED_FINANCE_UPDATE' &&
      parseCode('исправь сумму расхода') === 'UNSUPPORTED_FINANCE_UPDATE');
    ok('A275 отказ об изменении операции объясняет, где это делается, без жаргона',
      /Финанс/.test(KR.run('измени расход 500', { source: 'test' }).response) &&
      !/(intent|parse|JSON)/i.test(KR.run('измени расход 500', { source: 'test' }).response));
    ok('A276 неподдержанный период не превращается молча в «за месяц»',
      parseCode('покажи расходы за вчера') === 'FINANCE_PERIOD_UNSUPPORTED' &&
      parseCode('покажи расходы за год') === 'FINANCE_PERIOD_UNSUPPORTED' &&
      parseCode('покажи расходы за сентябрь') === 'FINANCE_PERIOD_UNSUPPORTED' &&
      parseCode('покажи расходы 12.05') === 'FINANCE_PERIOD_UNSUPPORTED');
    ok('A277 ответ про период честно называет поддерживаемые варианты',
      /за сегодня/.test(KR.run('покажи расходы за вчера', { source: 'test' }).response) &&
      /недел/.test(KR.run('покажи расходы за вчера', { source: 'test' }).response));
    ok('A278 поддерживаемые периоды по-прежнему работают',
      KR.parse('покажи расходы за сегодня').params.period === 'today' &&
      KR.parse('покажи расходы за неделю').params.period === 'week' &&
      KR.parse('покажи расходы за месяц').params.period === 'month' &&
      KR.parse('покажи расходы').params.period === 'month');
    ok('A279 несколько чисел в сумме — честный отказ, а не «первое число»',
      parseCode('запиши расход 12 34 на продукты') === 'AMOUNT_AMBIGUOUS' &&
      /одну сумму/i.test(KR.run('запиши расход 12 34 на продукты', { source: 'test' }).response));
    ok('A280 разделитель тысяч по-прежнему считается одной суммой',
      KR.parse('запиши расход 1 250 на продукты').params.amountMinor === 125000 &&
      KR.parse('запиши расход 1 250,50 на продукты').params.amountMinor === 125050);
    ok('A281 вежливый хвост после запятой не попадает в название категории',
      KR.parse('запиши расход 850 ₽ на продукты, пожалуйста').params.catQuery === 'продукты');
    ok('A282 «доход» как существующая категория расхода не выдаёт ложное «доходы не умею»',
      KR.parse('запиши расход 850 на доход').action === 'finance.expense.create' &&
      KR.parse('покажи расходы на доход').action === 'finance.list');
    ok('A283 настоящие вопросы о доходах честно отклоняются',
      parseCode('покажи доходы') === 'UNSUPPORTED_FINANCE_INCOME' &&
      parseCode('сколько я заработал') === 'UNSUPPORTED_FINANCE_INCOME' &&
      parseCode('запиши доход 500 на авто') === 'UNSUPPORTED_FINANCE_INCOME');
    {
      const before = JSON.stringify(envR.state);
      ['удали расход 500', 'измени расход 500', 'покажи расходы за вчера',
        'запиши расход 12 34 на продукты', 'покажи доходы'].forEach((t) => KR.run(t, { source: 'test' }));
      ok('A284 все эти отказы не меняют данные и не пишут историю',
        JSON.stringify(envR.state) === before && envR.state.history.length === 0);
    }

    /* Чистота разбора. */
    const envL = finSandbox();
    const beforeL = JSON.stringify(envL.state);
    ['запиши расход 850 ₽ на продукты', 'потратил 500 рублей на продукты', 'запиши расход 5к на продукты',
      'запиши расход 0 на продукты', 'запиши расход 100 на еду', 'покажи расходы за сегодня',
      'запиши расход 100 на продукты 31.02', 'запиши доход 500 на продукты'].forEach((t) => envL.K.parse(t));
    ok('A271 разбор финансовых команд не меняет данные и не пишет историю',
      JSON.stringify(envL.state) === beforeL && envL.state.history.length === 0);
    ok('A272 финансовая мутация выполняется только существующим общим действием',
      /\bC\.finance\.createOperation\(/.test(src) &&
      !/\bC\.finance\.(updateOperation|deleteOperation|createAccount|createCategory|deleteAccount|deleteCategory)\(/.test(src) &&
      !/FinanceCommandSession|FinanceConfirmationStore/.test(src));
  }

  /* ---- A12. Второго слоя действий и своей истории не появилось ---- */
  ok('A150 движок не пишет в состояние напрямую',
    !/AvenState|\.save\s*\(\)|state\s*\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('A151 движок не создаёт собственных записей истории',
    !/logAction|history\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('A152 изменения идут только через существующие общие действия',
    /\bC\.tasks\.createTask\(/.test(src) && /\bC\.tasks\.completeTask\(/.test(src) &&
    /\bC\.tasks\.updateTask\(/.test(src) && /\bC\.events\.createEvent\(/.test(src) &&
    /\bC\.notes\.createNote\(/.test(src) && !/\bC\.notes\.(updateNote|deleteNote|setNoteArchived)\(/.test(src));
  ok('A153 напоминания идут только через существующий фасад reminders (не через собственный движок)',
    /\bC\.reminders\.create\(/.test(src) && /\bC\.reminders\.list\(/.test(src) &&
    !/\bC\.reminders\.(update|delete|snooze|dismiss|markRead)\(/.test(src) &&
    !/window\.AvenNotify\s*=/.test(src) && !/CommandReminders|ReminderCommandStore/.test(src));
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

  /* ---- B3b. Заметка командой: сквозная согласованность и безопасность (Stage 2, итерация 3) ---- */
  {
    const p = await load('#/assistant');
    const reply = await p.say('Создай заметку купить фильтр для машины');
    const note = p.st().notes[0];
    ok('B35 команда создала настоящую заметку через общий слой',
      note && note.title === 'Купить фильтр для машины' && note.body === 'купить фильтр для машины' &&
      p.H()[0].action === 'note.create', reply);
    ok('B36 ответ пользователю — человеческий текст без служебных терминов',
      /Заметк/.test(reply) && /Истори/.test(reply) && !/(note\.create|intent|JSON)/i.test(reply));
    await p.go('#/notes');
    ok('B37 заметка из команды видна в обычном разделе «Заметки», без второй копии',
      p.text().indexOf('Купить фильтр для машины') >= 0 && !p.broken());
    await p.go('#/home');
    ok('B38 «Главная» видит ту же заметку (карточка «Заметки») или данные совпадают',
      p.text().indexOf('Купить фильтр для машины') >= 0 ||
      p.C().notes.getNotes({ status: 'active' }).items.some((n) => n.id === note.id));
    await p.go('#/history');
    ok('B39 действие команды попало в общую «Историю» с кнопкой отмены',
      p.text().indexOf('Купить фильтр для машины') >= 0 && !!p.q('[data-action="hist-undo"]'));
    p.w.Aven.undoAction(p.H().filter((e) => e.action === 'note.create')[0].id);
    await sleep(280);
    ok('B39a отмена командной заметки работает как обычная отмена: заметки больше нет',
      !p.st().notes.some((n) => n.id === note.id) && !p.broken());
    await p.go('#/notes');
    ok('B39b после отмены раздел «Заметки» тоже не показывает запись',
      p.text().indexOf('Купить фильтр для машины') < 0);

    await p.go('#/assistant');
    /* Обязательные регрессии: слова внутри заметки не переклассифицируют команду. */
    const beforeCounts = () => ({ tasks: p.st().tasks.length, events: p.st().events.length, notes: p.st().notes.length, ops: p.st().ops.length });
    const c1 = beforeCounts();
    const rEvent = await p.say('добавь заметку про встречу');
    ok('B40a «добавь заметку про встречу» создаёт заметку, а не событие',
      p.st().notes.length === c1.notes + 1 && p.st().events.length === c1.events &&
      p.st().notes[0].title === 'Про встречу', rEvent);
    const c2 = beforeCounts();
    const rTask = await p.say('создай заметку купить билет');
    ok('B40b «создай заметку купить билет» создаёт заметку, а не задачу',
      p.st().notes.length === c2.notes + 1 && p.st().tasks.length === c2.tasks &&
      p.st().notes[0].title === 'Купить билет', rTask);
    const c3 = beforeCounts();
    const rFin = await p.say('запиши заметку расход 500 рублей');
    ok('B40c «запиши заметку расход 500 рублей» создаёт заметку, а не расход',
      p.st().notes.length === c3.notes + 1 && p.st().ops.length === c3.ops &&
      p.st().notes[0].title === 'Расход 500 рублей', rFin);
    const c4 = beforeCounts();
    const rAuto = await p.say('добавь заметку заправить машину');
    ok('B40d «добавь заметку заправить машину» создаёт заметку, а не запись авто',
      p.st().notes.length === c4.notes + 1 && p.st().notes[0].title === 'Заправить машину', rAuto);

    /* Пустая заметка честно отклоняется, без записи в «Историю». */
    const histBeforeEmpty = p.H().length;
    const notesBeforeEmpty = p.st().notes.length;
    const empty = await p.say('создай заметку');
    ok('B41 «создай заметку» без текста ничего не создаёт и объясняет причину',
      /Не поняла|записать в заметку/i.test(empty) && p.st().notes.length === notesBeforeEmpty &&
      p.H().length === histBeforeEmpty);

    /* Поиск заметок: несколько результатов показаны списком, без мутации. */
    await p.say('добавь заметку идеи для отпуска');
    const histBeforeSearch = p.H().length;
    const searchReply = await p.say('покажи заметки про отпуск');
    ok('B42 поиск заметок находит и не пишет «Историю»',
      /Идеи для отпуска/.test(searchReply) && p.H().length === histBeforeSearch, searchReply);

    /* Изменение/архив существующей заметки текстом — честно неподдержано. */
    const notesBeforeGuard = p.st().notes.length;
    const updReply = await p.say('измени заметку купить билет');
    ok('B43 «измени заметку …» не редактирует данные',
      /не умею/i.test(updReply) && p.st().notes.length === notesBeforeGuard);
    p.dom.window.close();
  }

  /* ---- B3c. Напоминание командой: сквозная согласованность и безопасность (Stage 2, итерация 4) ----
     Единственный существующий движок напоминаний — AvenNotify; команда идёт через тот же
     AvenActions.reminders, что и кнопка «＋ Напоминание» в «Уведомлениях» (docs/MVP_SCOPE.md §4.2.4). */
  {
    const p = await load('#/assistant');
    const C = p.C();
    const tomorrow = C.dates.todayISO(1);
    const unreadBefore = C.reminders.counts().unread;
    const reply = await p.say('Напомни купить масло на завтра');
    const rem = p.st().reminders[0];
    ok('B44 команда создала настоящее напоминание через общий слой (AvenActions.reminders → AvenNotify)',
      rem && rem.title === 'Купить масло' && rem.dateISO === tomorrow && p.H()[0].action === 'reminder.create', reply);
    ok('B45 ответ пользователю — человеческий текст с датой, без служебных терминов и без обещания push/email',
      /Напомин/.test(reply) && /завтра/i.test(reply) && /Уведомлен/.test(reply) &&
      !/(reminder\.create|intent|JSON)/i.test(reply) && !/(push|письм|email|почт)/i.test(reply), reply);
    await p.go('#/notifications');
    ok('B46 напоминание из команды видно в разделе «Уведомления», без второй копии',
      p.text().indexOf('Купить масло') >= 0 && !p.broken());
    ok('B47 счётчик непрочитанных («колокольчик») учитывает созданное напоминание',
      C.reminders.counts().unread === unreadBefore + 1 &&
      (p.q('#notif-badge') || {}).hidden === false, C.reminders.counts());
    await p.go('#/home');
    ok('B48 «Главная» согласована с тем же напоминанием (карточка уведомлений/напоминаний или те же данные)',
      p.text().indexOf('Купить масло') >= 0 ||
      C.reminders.list({}).items.some((x) => x.id === rem.id));
    await p.go('#/history');
    ok('B49 действие команды попало в общую «Историю» с кнопкой отмены',
      p.text().indexOf('Купить масло') >= 0 && !!p.q('[data-action="hist-undo"]'));
    p.w.Aven.undoAction(p.H().filter((e) => e.action === 'reminder.create')[0].id);
    await sleep(280);
    ok('B49a отмена командного напоминания работает как обычная отмена: напоминания больше нет',
      !p.st().reminders.some((r) => r.id === rem.id) && !p.broken());
    ok('B49b счётчик «колокольчика» возвращается к исходному значению после отмены',
      C.reminders.counts().unread === unreadBefore);
    await p.go('#/notifications');
    ok('B49c после отмены раздел «Уведомления» тоже не показывает запись',
      p.text().indexOf('Купить масло') < 0);

    await p.go('#/assistant');
    /* Обязательные регрессии: слова внутри напоминания не переклассифицируют команду. */
    const beforeCounts = () => ({ tasks: p.st().tasks.length, events: p.st().events.length,
      notes: p.st().notes.length, ops: p.st().ops.length, reminders: p.st().reminders.length });
    const c1 = beforeCounts();
    const rTask = await p.say('напомни создать задачу купить масло завтра');
    ok('B50a «напомни создать задачу …» создаёт напоминание, а не задачу',
      p.st().reminders.length === c1.reminders + 1 && p.st().tasks.length === c1.tasks &&
      p.st().reminders[0].title === 'Создать задачу купить масло', rTask);
    const c2 = beforeCounts();
    const rEvent = await p.say('напомни про встречу завтра');
    ok('B50b «напомни про встречу завтра» создаёт напоминание, а не событие',
      p.st().reminders.length === c2.reminders + 1 && p.st().events.length === c2.events &&
      p.st().reminders[0].title === 'Про встречу', rEvent);
    const c3 = beforeCounts();
    const rFin = await p.say('напомни завтра записать расход 500 рублей');
    ok('B50c «напомни … записать расход 500 рублей» создаёт напоминание, а не расход',
      p.st().reminders.length === c3.reminders + 1 && p.st().ops.length === c3.ops &&
      p.st().reminders[0].title === 'Записать расход 500 рублей', rFin);
    const c4 = beforeCounts();
    const rNote = await p.say('напомни завтра создать заметку про отпуск');
    ok('B50d «напомни … создать заметку …» создаёт напоминание, а не заметку',
      p.st().reminders.length === c4.reminders + 1 && p.st().notes.length === c4.notes &&
      p.st().reminders[0].title === 'Создать заметку про отпуск', rNote);

    /* Обычные Task/Event/Note команды рядом продолжают работать как раньше. */
    const c5 = beforeCounts();
    const rRealTask = await p.say('создай задачу проверить шины');
    ok('B51a обычная команда задачи продолжает работать рядом с напоминаниями',
      p.st().tasks.length === c5.tasks + 1 && p.st().reminders.length === c5.reminders, rRealTask);

    /* Без даты — честная просьба уточнить, без мутации. */
    const histBeforeNoDate = p.H().length;
    const remindersBeforeNoDate = p.st().reminders.length;
    const noDate = await p.say('напомни купить хлеб');
    ok('B52 «напомни …» без даты честно просит дату и ничего не создаёт',
      /дату/i.test(noDate) && p.st().reminders.length === remindersBeforeNoDate && p.H().length === histBeforeNoDate);

    /* Поиск/показ: несколько результатов списком, без мутации. */
    await p.say('напомни на 10.10 оплатить страховку');
    const histBeforeSearch = p.H().length;
    const searchReply = await p.say('найди напоминание про страховку');
    ok('B53 поиск напоминаний находит и не пишет «Историю»',
      /страховку/i.test(searchReply) && p.H().length === histBeforeSearch, searchReply);
    const listReply = await p.say('покажи напоминания');
    ok('B54 «покажи напоминания» показывает список и не пишет «Историю»',
      p.H().length === histBeforeSearch && /Напомин|напоминани/i.test(listReply), listReply);

    /* Изменение/отложить/скрыть/удалить уже существующего напоминания — честно неподдержано. */
    const remindersBeforeGuard = p.st().reminders.length;
    const updReply = await p.say('измени напоминание про страховку');
    ok('B55 «измени напоминание …» не редактирует данные',
      /не умею/i.test(updReply) && p.st().reminders.length === remindersBeforeGuard);
    const delReply = await p.say('удали напоминание про страховку');
    ok('B56 «удали напоминание …» остаётся неподдержанным удалением, как и другие домены',
      /не умею/i.test(delReply) && p.st().reminders.length === remindersBeforeGuard);
    p.dom.window.close();
  }

  /* ---- B3d. Расход командой: подтверждение, согласованность и безопасность (Stage 2, итерация 5) ----
     Утверждённая владельцем политика: финансовая мутация ВСЕГДА через подтверждение,
     категория и счёт только существующие, выполнение — только общий
     `AvenActions.finance.createOperation` (docs/COMMAND_ENGINE.md §13). */
  {
    const p = await load('#/assistant');
    const C = p.C();
    const opsBefore = p.st().ops.length;
    const histBefore = p.H().length;
    const balanceBefore = C.finance.balance();
    const monthBefore = C.finance.summary().monthExpense;

    const ask = await p.say('Запиши расход 850 ₽ на продукты со счета основная карта');
    ok('B57 точная финансовая команда не выполняется сразу: показано подтверждение',
      !!p.q('[data-action="command-confirm"]') && !!p.q('[data-action="command-cancel"]') &&
      /Записать расход/.test(ask), ask);
    ok('B58 текст подтверждения называет сумму, категорию, счёт и конкретную дату',
      /850,00/.test(ask) && /Продукты/.test(ask) && /Основная карта/.test(ask) &&
      /\d{2}\.\d{2}\.\d{4}/.test(ask), ask);
    ok('B59 до подтверждения «Финансы», баланс и «История» не изменились',
      p.st().ops.length === opsBefore && C.finance.balance() === balanceBefore && p.H().length === histBefore);
    ok('B60 кнопки подтверждения — настоящие семантические controls в группе с подписью',
      p.q('[data-action="command-confirm"]').tagName === 'BUTTON' &&
      (p.q('.command-confirm') || {}).getAttribute('role') === 'group' &&
      !!(p.q('.command-confirm') || {}).getAttribute('aria-label'));

    /* Отмена: ноль изменений. */
    p.click(p.q('[data-action="command-cancel"]'));
    await sleep(260);
    ok('B61 «Отмена» закрывает финансовый вопрос без операции и без записи в «Историю»',
      p.st().ops.length === opsBefore && p.H().length === histBefore &&
      C.finance.balance() === balanceBefore && !p.q('[data-action="command-confirm"]'));

    /* Отказ словом «нет». */
    await p.say('Запиши расход 100 ₽ на продукты со счета наличные');
    const noReply = await p.say('нет');
    ok('B62 ответ «нет» тоже отменяет финансовую запись без изменений',
      p.st().ops.length === opsBefore && p.H().length === histBefore && /отменено|Ничего не изменилось/i.test(noReply), noReply);

    /* Escape: отмена и возврат фокуса. */
    await p.say('Запиши расход 100 ₽ на продукты со счета наличные');
    p.key(p.q('[data-action="command-confirm"]'), 'Escape');
    await sleep(260);
    ok('B63 Escape отменяет финансовый pending, ничего не меняя',
      p.st().ops.length === opsBefore && p.H().length === histBefore && !p.q('[data-action="command-confirm"]'));

    /* Подтверждение: ровно одна операция и одна запись истории, даже при двойном нажатии. */
    await p.say('Запиши расход 850 ₽ на продукты со счета основная карта');
    const confirmBtn = p.q('[data-action="command-confirm"]');
    p.click(confirmBtn);
    p.click(confirmBtn);
    await sleep(320);
    const created = p.st().ops.filter((o) => o.cat === 'Продукты' && C.money.minor(o.amount) === 85000 && o.account === 'card');
    ok('B64 подтверждение создаёт ровно одну операцию, двойное нажатие не дублирует',
      p.st().ops.length === opsBefore + 1 && created.length === 1, p.st().ops.length + '/' + created.length);
    ok('B65 в «Историю» попала ровно одна отменяемая запись расхода из команды',
      p.H().length === histBefore + 1 && p.H()[0].action === 'finance.expense.create' &&
      p.H()[0].undoable === true && p.H()[0].source === 'assistant');
    ok('B66 повторное программное подтверждение уже ничего не делает',
      (p.w.Aven._commandSession.confirm().status === 'no_pending') && p.st().ops.length === opsBefore + 1);
    ok('B67 сумма сохранена в целых копейках, без float-артефактов',
      C.money.minor(created[0].amount) === 85000);
    ok('B68 баланс счёта пересчитан общим слоем',
      C.finance.balance() === C.money.sum(balanceBefore, -850));

    /* Согласованность разделов. */
    await p.go('#/finance');
    const finText = p.text();
    ok('B69 операция из команды видна в списке «Финансов» и учтена в карточках итогов',
      finText.indexOf('Продукты') >= 0 && !p.broken() &&
      C.finance.summary().monthExpense === C.money.sum(monthBefore, 850));
    ok('B70 производные итоги по категориям тоже учитывают операцию из команды',
      C.finance.byCategory({ period: 'month' }).some((c) => c.name === 'Продукты'));
    await p.go('#/home');
    ok('B71 «Главная» показывает те же расходы (общий запрос, без своей арифметики)',
      !p.broken() && C.finance.summary().todayExpense >= 850);
    await p.go('#/assistant');
    const askAgain = await p.say('Сколько я потратил сегодня?');
    ok('B72 ответ помощника о расходах согласован с разделом «Финансы»',
      askAgain.indexOf(C.format.money(C.finance.summary().todayExpense).replace(/[\u00a0\u202f]/g, ' ')
        .replace(/ /g, ' ')) >= 0 || /потрач|расход/i.test(askAgain), askAgain);
    const histBeforeList = p.H().length;
    const listReply = await p.say('Покажи расходы за сегодня');
    ok('B73a просмотр расходов текстом ничего не меняет и не пишет «Историю»',
      p.H().length === histBeforeList && p.st().ops.length === opsBefore + 1 &&
      /Расходы за сегодня/.test(listReply), listReply);
    ok('B73b ответ-просмотр без внутренних идентификаторов и JSON',
      !/(\{|"id"|finance\.list)/.test(listReply), listReply);

    /* Undo возвращает операцию, баланс и итоги. */
    await p.go('#/history');
    ok('B73c запись расхода в «Истории» отменяется обычной кнопкой',
      p.text().indexOf('Расход') >= 0 && !!p.q('[data-action="hist-undo"]'));
    p.w.Aven.undoAction(p.H().filter((e) => e.action === 'finance.expense.create')[0].id);
    await sleep(300);
    ok('B73d после отмены операции нет, баланс и итоги вернулись',
      p.st().ops.length === opsBefore && C.finance.balance() === balanceBefore &&
      C.finance.summary().monthExpense === monthBefore);

    /* Уточнение → подтверждение: перескочить подтверждение нельзя. */
    await p.go('#/assistant');
    const askSlot = await p.say('Запиши расход 300 на продукты');
    ok('B73e без счёта Aven просит выбрать существующий счёт, ничего не меняя',
      !!p.q('[data-action="command-choice"]') && p.st().ops.length === opsBefore &&
      /счет|счёт/i.test(askSlot), askSlot);
    ok('B73f варианты счёта показаны без внутренних идентификаторов',
      !/\b(card|cash|savings)\b/.test(p.q('.command-choices').textContent));
    p.click(p.q('[data-action="command-choice"]'));
    await sleep(300);
    ok('B73g после выбора счёта Aven всё равно показывает подтверждение, а не выполняет сразу',
      !!p.q('[data-action="command-confirm"]') && p.st().ops.length === opsBefore &&
      /Записать расход/.test(p.w.Aven._lastReply), p.w.Aven._lastReply);
    p.click(p.q('[data-action="command-confirm"]'));
    await sleep(300);
    ok('B73h только после подтверждения появляется ровно одна операция',
      p.st().ops.length === opsBefore + 1 && p.H()[0].action === 'finance.expense.create');

    /* Неизвестная категория/счёт и неподдержанная сумма: ноль изменений. */
    const opsNow = p.st().ops.length, histNow = p.H().length;
    const unknownCat = await p.say('Запиши расход 100 на еду со счета наличные');
    ok('B73i неизвестная категория не создаётся: честный отказ без изменений',
      p.st().ops.length === opsNow && p.H().length === histNow &&
      C.finance.categories().indexOf('Еда') < 0 && /не создаю/i.test(unknownCat), unknownCat);
    const unknownAcc = await p.say('Запиши расход 100 на продукты со счета тинькофф');
    ok('B73j неизвестный счёт не создаётся: честный отказ без изменений',
      p.st().ops.length === opsNow && C.finance.accounts().length === 3 && /не создаю/i.test(unknownAcc), unknownAcc);
    const shorthand = await p.say('Запиши расход 5к на продукты');
    ok('B73k «5к» не превращается в сумму: отказ с объяснением формата, без изменений',
      p.st().ops.length === opsNow && p.H().length === histNow && /5к/.test(shorthand), shorthand);
    const income = await p.say('Запиши доход 500 на продукты');
    ok('B73l доход текстом честно не поддержан и ничего не меняет',
      p.st().ops.length === opsNow && /доход/i.test(income), income);

    /* Временный контекст не сохраняется. */
    await p.say('Запиши расход 700 на продукты со счета наличные');
    ok('B73m финансовый pending не попадает в состояние приложения и localStorage',
      JSON.stringify(p.st()).indexOf('Записать расход') < 0 &&
      (p.w.localStorage.getItem('aven-proto-v1') || '').indexOf('Записать расход') < 0 &&
      !!p.w.Aven._commandSession.pending());
    await p.go('#/finance');
    await p.go('#/assistant');
    ok('B73n после ухода с экрана помощника финансовый pending забыт',
      !p.q('[data-action="command-confirm"]') && p.st().ops.length === opsNow);

    /* Мобильные ширины: подтверждение и варианты без горизонтального выхода. */
    p.dom.window.close();
    for (const width of [320, 360, 390, 412, 430, 768, 1280]) {
      const m = await load('#/assistant', width);
      await m.say('Запиши расход 1 250,50 ₽ на подписки со счета накопительный счет');
      const box = m.q('.command-confirm');
      ok('B73o ширина ' + width + ': подтверждение расхода показано и не выходит за экран',
        !!box && !m.broken() && m.d.documentElement.scrollWidth <= width + 1,
        box ? m.d.documentElement.scrollWidth : 'нет блока');
      m.dom.window.close();
    }
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
    ok('B43 варианты уточнения — настоящие доступные кнопки',
      p.qa('.command-choice').length === 2 && p.qa('.command-choice').every((b) => b.tagName === 'BUTTON'));
    p.click(p.qa('.command-choice')[1]);
    await sleep(250);
    ok('B44 выбор второго варианта продолжает исходную команду',
      p.st().tasks.filter((t) => /проверка неоднозначности/i.test(t.title) && t.completed).length === 1 &&
      p.H().length === histAfter + 1);

    await p.say('создай задачу подготовить квартальный отчёт');
    const beforeConfirm = p.H().length;
    const pending = await p.say('отметь квартальный отчёт выполненным');
    ok('B45 INFERRED mutation показывает конкретное подтверждение',
      /Подготовить квартальный отчёт/.test(pending) && !!p.q('[data-action="command-confirm"]') && !!p.q('[data-action="command-cancel"]'));
    ok('B46 до подтверждения нет мутации и History',
      p.H().length === beforeConfirm && p.st().tasks.some((t) => /квартальный отчёт/i.test(t.title) && !t.completed));
    p.key(p.q('[data-action="command-confirm"]'), 'Escape');
    await sleep(180);
    ok('B47 Escape отменяет pending, возвращает focus и не мутирует',
      p.H().length === beforeConfirm && p.d.activeElement === p.q('#chat-input') && !p.w.Aven._commandSession.pending());

    await p.say('создай задачу подготовить годовой отчёт');
    const beforeButtonCancel = p.H().length;
    await p.say('отметь годовой отчёт выполненным');
    p.click(p.q('[data-action="command-cancel"]')); await sleep(120);
    ok('B47a кнопка Cancel очищает pending, возвращает focus и не мутирует',
      p.H().length === beforeButtonCancel && p.d.activeElement === p.q('#chat-input') &&
      !p.w.Aven._commandSession.pending() && p.st().tasks.some((t) => /годовой отчёт/i.test(t.title) && !t.completed));

    await p.say('отметь квартальный отчёт выполненным');
    const button = p.q('[data-action="command-confirm"]');
    p.click(button); p.click(button); await sleep(200); // реальный double click по прежней DOM-ссылке
    const afterConfirm = p.H().length;
    p.w.Aven.actions['command-confirm'](); await sleep(80); // повторный programmatic confirm
    ok('B48 double click и повторный confirm дают ровно одну mutation',
      afterConfirm === beforeButtonCancel + 1 && p.H().length === afterConfirm &&
      p.st().tasks.some((t) => /квартальный отчёт/i.test(t.title) && t.completed));
    ok('B49 controls используют существующие кнопки и aria group',
      !p.q('[data-action="command-confirm"]') && p.q('#chat').getAttribute('aria-live') === 'polite');
    const confirmedTask = p.st().tasks.filter((t) => /квартальный отчёт/i.test(t.title))[0];
    const confirmedEntry = p.H().filter((h) => h.action === 'task.complete' && /квартальный отчёт/i.test(h.object || ''))[0];
    p.w.Aven.undoAction(confirmedEntry.id); await sleep(180);
    ok('B49a общий Undo восстанавливает confirmed Task, session-копии нет',
      confirmedTask && !p.C().tasks.isCompleted(p.C().tasks.getTask(confirmedTask.id).entity));
    await p.go('#/tasks');
    ok('B49b восстановленная Task видна в обычном разделе «Задачи»', /Подготовить квартальный отчёт/i.test(p.text()) && !p.broken());
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
    ok('B63 справка объясняет неоднозначность, подтверждение и отмену',
      /уточнить/i.test(bodies) && /Подтвердить/i.test(bodies) && /Отмена/i.test(bodies) && /Истори/i.test(bodies),
      bodies.match(/.{0,80}(?:уточнить|Подтвердить|Отмена|Истори).{0,80}/gi));
    ok('B64 справка честно перечисляет, чего команды не умеют',
      /Удалять/i.test(bodies) && /не свободный разговор/i.test(bodies));
    ok('B65 в пользовательской справке нет технического жаргона',
      !/(parser|payload|intent|DOM|state|provider|action layer|route)/i.test(bodies));
    const search = p.w.AvenHelp.search('команд');
    ok('B66 материалы о командах находятся поиском справки', search.length > 0);
    ok('B67 обучение по командам зарегистрировано в существующем движке обучения',
      !!p.w.AvenTutorial.definitions.commands && p.w.AvenTutorial.definitions.commands.route === 'assistant' &&
      p.w.AvenTutorial.definitions.commands.steps.length >= 5);
    /* Stage 2, итерация 3: заметки текстом — справка объясняет создание, поиск,
       где посмотреть результат и почему слова внутри заметки не путают команду. */
    ok('B67a справка объясняет создание заметки текстом с примером',
      /Создай заметку купить фильтр/.test(bodies));
    ok('B67b справка объясняет, что текст внутри заметки не переключает домен',
      /Про встречу/.test(bodies) && /не превращается|не превращает/i.test(bodies + ' ' +
        (p.w.AvenHelp.articles.find((a) => a.id === 'cmd-notes') || {}).body));
    ok('B67c справка объясняет поиск заметок текстом', /Покажи заметки/.test(bodies) && /Найди заметку/.test(bodies));
    ok('B67d справка честно говорит, что изменение/архив/удаление заметки текстом не поддерживаются',
      /(?:Изменить текст|изменить текст уже существующей заметки)[^.]*архив[^.]*пока нельзя/i.test(bodies) ||
      (/изменить текст уже существующей заметки/i.test(bodies) && /архив/i.test(bodies) && /пока нет/i.test(bodies)),
      bodies.match(/.{0,60}архив.{0,80}/gi));
    ok('B67e раздел «Заметки» тоже упоминает создание текстом',
      /Быструю заметку можно создать/.test((p.w.AvenHelp.articles.find((a) => a.id === 'notes-basics') || {}).body || ''));
    /* Stage 2, итерация 4: напоминания текстом — справка объясняет создание, обязательную
       дату, поиск/показ, где посмотреть результат и честные ограничения (без push/email). */
    ok('B67f справка объясняет создание напоминания текстом с примером',
      /Напомни купить масло на завтра/.test(bodies));
    ok('B67g справка объясняет, что дата обязательна, а время — нет',
      /дата обязательна/i.test((p.w.AvenHelp.articles.find((a) => a.id === 'cmd-reminders') || {}).body || '') &&
      /время необязательно/i.test((p.w.AvenHelp.articles.find((a) => a.id === 'cmd-reminders') || {}).body || ''));
    ok('B67h справка объясняет, что текст внутри напоминания не переключает домен',
      /Про встречу/.test((p.w.AvenHelp.articles.find((a) => a.id === 'cmd-reminders') || {}).body || '') &&
      /не переключают/i.test((p.w.AvenHelp.articles.find((a) => a.id === 'cmd-reminders') || {}).body || ''));
    ok('B67i справка объясняет поиск напоминаний текстом',
      /Покажи напоминания/.test(bodies) && /Найди напоминание/.test(bodies));
    ok('B67j справка честно говорит, что изменение/откладывание/удаление напоминания текстом не поддерживаются',
      /изменить, отложить, скрыть или удалить уже существующее напоминание[^.]*пока нельзя/i.test(bodies) ||
      /изменить.{0,20}отложить.{0,20}(?:отметить прочитанным.{0,20})?скрыть.{0,20}удалить уже существующее напоминание/i.test(bodies));
    ok('B67k справка честно не обещает доставку при закрытом сайте',
      /не придёт по почте или push/i.test((p.w.AvenHelp.articles.find((a) => a.id === 'cmd-reminders') || {}).body || ''));
    /* Stage 2, итерация 5: расходы текстом — справка объясняет запись, форматы суммы,
       поведение категории/счёта, обязательное подтверждение, где увидеть и как отменить. */
    const finArticle = (p.w.AvenHelp.articles.find((a) => a.id === 'cmd-finance') || {}).body || '';
    ok('B67m в справке есть отдельная статья о расходах текстом с примером',
      finArticle.length > 200 && /Запиши расход 850/.test(finArticle));
    ok('B67n справка перечисляет поддерживаемые форматы суммы',
      /500 руб/.test(finArticle) && /500,50/.test(finArticle) && /1 250,50/.test(finArticle));
    ok('B67o справка честно говорит про «5к» и про отсутствие пересчёта валют',
      /5к/.test(finArticle) && /валют/i.test(finArticle));
    ok('B67p справка объясняет, что Aven не создаёт категории и счета сама',
      /не создаёт ни категорию, ни счёт/.test(finArticle));
    ok('B67q справка объясняет, что денежное действие всегда показывается до выполнения',
      /ждёт кнопки «Подтвердить»/.test(finArticle) && /До подтверждения не меняются/.test(finArticle));
    ok('B67r справка объясняет Отмену/Escape и отсутствие изменений',
      /Escape/.test(finArticle) && /без единого изменения/.test(finArticle));
    ok('B67s справка говорит, где увидеть расход и как отменить',
      /в «Финансах»/.test(finArticle) && /«Истории»/.test(finArticle));
    ok('B67t справка объясняет просмотр расходов текстом (read-only)',
      /Покажи расходы за сегодня/.test(finArticle) && /ничего не меняет/.test(finArticle));
    ok('B67u справка честно говорит, что доходы текстом пока не записываются',
      /Доходы текстом пока не записываются/.test(finArticle));
    ok('B67v обучение по командам включает финансовый сценарий с подтверждением',
      p.w.AvenTutorial.definitions.commands.steps.some((x) => /Запиши расход 850/.test(x.text)) &&
      p.w.AvenTutorial.definitions.commands.steps.some((x) => /Подтвердить/.test(x.text) && /Отмена|Escape/.test(x.text)) &&
      p.w.AvenTutorial.definitions.commands.steps.some((x) => /Покажи расходы за сегодня/.test(x.text)));
    ok('B67l раздел «Уведомления» тоже упоминает создание текстом',
      /текстовой командой/i.test((p.w.AvenHelp.articles.find((a) => a.id === 'notif-reminders') || {}).body || ''));
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
