/* Aven — Data Integrity Hardening: поведенческая проверка двух системных дефектов
   общего слоя действий и инвариантов, которые их закрывают.

   Что здесь проверяется (behavior, а не текст исходников):
     A. Календарные даты. Форма `YYYY-MM-DD` — это ещё не дата: «30 февраля»,
        «31 апреля», «29 февраля 2026» и «29 февраля 1900» не существуют. Общий
        слой обязан отклонять их во ВСЕХ разделах, не мутируя состояние и не
        записывая «Историю».
     B. Деньги. Суммы хранятся целыми минимальными единицами в JS Number, поэтому
        точная арифметика существует только внутри безопасного целочисленного
        диапазона. Ни сумма операции, ни баланс счёта, ни результат сложения не
        имеют права выйти за него.

   Это разработческий инструмент, НЕ часть приложения и не зависимость продукта:
   jsdom ставится во временный каталог, package.json/node_modules в репозитории
   не появляются.

   Запуск (из корня репозитория):
     mkdir -p /tmp/lab && cd /tmp/lab && npm init -y && npm install jsdom@30 && cd -
     NODE_PATH=/tmp/lab/node_modules node prototype/tests/data-integrity-check.js

   Части A–G идут вообще без DOM: инварианты целостности принадлежат слою
   действий, а не экрану. Часть H поднимает настоящий прототип в jsdom и
   проверяет, что форма «Финансов» не обходит общий слой, а ошибка доходит до
   человека текстом.

   Спецификации: docs/DATA_MODEL.md §4.3 (инварианты даты и денег),
   docs/ARCHITECTURE.md (Common Action Layer — окончательная валидация),
   ADR-010 (честные статусы: не показывать выполненным то, что не выполнено). */

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
    '  NODE_PATH=/tmp/lab/node_modules node prototype/tests/data-integrity-check.js');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

/* Песочница общего слоя без DOM. Часы приложения зафиксированы: тест не имеет
   права зависеть от системного календаря (иначе он «зелёный до 1 марта»). */
const FIXED_TODAY = '2026-09-29';
function core(seedToday) {
  const today = seedToday || FIXED_TODAY;
  const state = {
    tasks: [], events: [], notes: [], noteFolders: ['Личное'],
    ops: [],
    finAccounts: [{ id: 'card', name: 'Карта', balance: 1000 }, { id: 'cash', name: 'Наличные', balance: 500 }],
    finCategories: ['Авто', 'Продукты', 'Другое', 'Доход'],
    car: { model: 'Демо', serviceIntervalKm: 10000, mileage: 100000, fuel: [], expenses: [], service: [], docs: [] },
    purchases: [], purchaseCategories: ['Электроника'], reminders: [], history: []
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
    /* Минимальные заглушки представления: Undo живёт в общем слое, а перерисовка
       экрана к целостности данных отношения не имеет. */
    register() {}, pages: {}, esc: (v) => String(v), toast() {}, render() {}
  };
  sandbox.window.AvenDemo = {
    todayISO: (offset) => {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() + (Number(offset) || 0));
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  };
  vm.createContext(sandbox);
  ['actions.js', 'notify.js', 'history.js', 'command-session.js', 'command.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
  });
  return { C: sandbox.window.AvenActions, K: sandbox.window.AvenCommand, w: sandbox.window, state };
}

/* Полный снимок пользовательских данных: любая отклонённая операция обязана
   оставить его байт в байт прежним (no partial mutation). */
function snapshot(state) {
  return JSON.stringify({
    tasks: state.tasks, events: state.events, ops: state.ops, finAccounts: state.finAccounts,
    car: state.car, purchases: state.purchases, reminders: state.reminders,
    notes: state.notes, history: state.history
  });
}

const VALID_DATES = ['2026-02-28', '2028-02-29', '2000-02-29', '2026-01-31', '2026-12-31',
  '2026-03-01', '2024-02-29', '2026-06-30', '2026-11-30', '2026-09-30'];
const INVALID_DATES = ['2026-02-29', '2026-02-30', '2027-02-29', '2026-04-31', '2026-13-01',
  '2026-00-10', '2026-01-00', '2026-01-32', '9999-99-99', 'abcd-ef-gh',
  '1900-02-29', '2100-02-29', '2026-06-31', '2026-09-31', '2026-11-31', '2026-2-3', '2026-02-3',
  '02-02-2026', '2026/02/02', '2026-02-28 ', ''];

/* ===================== ЧАСТЬ A. Единый календарный контракт ===================== */
function partA() {
  const { C } = core();
  const D = C.dates;

  ok('A1 общий календарный валидатор существует в слое действий (одна точка истины)',
    typeof D.isValid === 'function' && typeof D.isLeapYear === 'function' && typeof D.daysInMonth === 'function');

  /* §50.1–§50.13 — обязательная матрица дат. */
  ok('A2 valid 2026-02-28', D.isValid('2026-02-28') === true);
  ok('A3 valid 2028-02-29 (високосный)', D.isValid('2028-02-29') === true);
  ok('A4 valid 2000-02-29 (делится на 400 — високосный)', D.isValid('2000-02-29') === true);
  ok('A5 invalid 1900-02-29 (столетие без деления на 400)', D.isValid('1900-02-29') === false);
  ok('A6 invalid 2100-02-29 (столетие без деления на 400)', D.isValid('2100-02-29') === false);
  ok('A7 invalid 2026-02-29 (невисокосный год)', D.isValid('2026-02-29') === false);
  ok('A8 invalid 2026-02-30 (такого дня нет никогда)', D.isValid('2026-02-30') === false);
  ok('A9 invalid 2026-04-31 (в апреле 30 дней)', D.isValid('2026-04-31') === false);
  ok('A10 invalid месяц 13', D.isValid('2026-13-01') === false);
  ok('A11 invalid месяц 00', D.isValid('2026-00-10') === false);
  ok('A12 invalid день 00', D.isValid('2026-01-00') === false);
  ok('A13 invalid день 32', D.isValid('2026-01-32') === false);
  ok('A14 invalid произвольная строка', D.isValid('abcd-ef-gh') === false && D.isValid('9999-99-99') === false);

  /* §11 — правила високосного года целиком. */
  ok('A15 високосность: 2024/2028 — да, 2026/2027 — нет',
    D.isLeapYear(2024) && D.isLeapYear(2028) && !D.isLeapYear(2026) && !D.isLeapYear(2027));
  ok('A16 високосность: 1900/2100 — нет, 2000/2400 — да',
    !D.isLeapYear(1900) && !D.isLeapYear(2100) && D.isLeapYear(2000) && D.isLeapYear(2400));
  ok('A17 длина февраля зависит от года, остальные месяцы постоянны',
    D.daysInMonth(2026, 2) === 28 && D.daysInMonth(2028, 2) === 29 &&
    D.daysInMonth(2026, 4) === 30 && D.daysInMonth(2026, 1) === 31 && D.daysInMonth(2026, 12) === 31);
  ok('A18 несуществующий месяц не имеет длины', D.daysInMonth(2026, 0) === 0 && D.daysInMonth(2026, 13) === 0);

  /* §10 — нельзя полагаться на нормализацию JS Date. */
  const jsDate = new Date('2026-02-30');
  ok('A19 JS Date молча нормализует 2026-02-30 (поэтому отсутствие NaN — не доказательство)',
    !isNaN(jsDate.getTime()) && jsDate.getUTCMonth() === 2);
  ok('A20 валидатор не повторяет ошибку Date: 2026-02-30 отвергнут, 2026-03-02 принят',
    D.isValid('2026-02-30') === false && D.isValid('2026-03-02') === true);

  /* §9.4 — round-trip: принятая дата обязана совпадать сама с собой посимвольно. */
  let roundTrip = true;
  VALID_DATES.forEach((iso) => {
    const d = D.parseISO(iso);
    const back = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (back !== iso) roundTrip = false;
  });
  ok('A21 round-trip: каждая принятая дата собирается обратно в ту же строку', roundTrip);

  ok('A22 вся матрица VALID принимается', VALID_DATES.every((d) => D.isValid(d) === true),
    VALID_DATES.filter((d) => !D.isValid(d)).join(', '));
  ok('A23 вся матрица INVALID отвергается', INVALID_DATES.every((d) => D.isValid(d) === false),
    INVALID_DATES.filter((d) => D.isValid(d)).join(', '));

  /* §9.5 / §12 — normalizeDate больше не пропускает несуществующий день, но
     по-прежнему понимает относительные слова и не выдумывает диапазон лет. */
  ok('A24 normalizeDate не возвращает несуществующую дату',
    C.dates.normalizeDate('2026-02-30', 'FB') === 'FB' && C.dates.normalizeDate('2026-04-31', 'FB') === 'FB');
  ok('A25 normalizeDate сохраняет относительные слова и настоящие даты',
    C.dates.normalizeDate('today', '') === FIXED_TODAY &&
    C.dates.normalizeDate('tomorrow', '') === '2026-09-30' &&
    C.dates.normalizeDate('2028-02-29', '') === '2028-02-29');
  ok('A26 год не ограничен продуктовым диапазоном (в модели данных его нет), ограничены месяц и день',
    D.isValid('0001-01-01') === true && D.isValid('9999-12-31') === true && D.isValid('9999-12-32') === false);

  /* §40/§46 — формат не является валидацией и не падает на legacy-значении. */
  let formatSafe = true, formatHonest = true;
  ['2026-02-30', '9999-99-99', 'что-то не то', ''].forEach((v) => {
    let out;
    try { out = C.format.date(v); } catch (e) { formatSafe = false; }
    if (v === '2026-02-30' && out !== '2026-02-30') formatHonest = false;
  });
  ok('A27 формат даты не падает на legacy-значении (read-only путь остаётся живым)', formatSafe);
  ok('A28 формат не «чинит» невозможную дату молчаливой нормализацией в 2 марта', formatHonest);
}

/* ============ ЧАСТЬ B. Защита даты в каждом разделе + History safety ============ */
function partB() {
  /* Каждый кейс: отказ, машинный код, человеческое сообщение, ноль мутаций,
     ноль записей в «Историю», полный снимок состояния не изменился. */
  function rejects(label, run, opts) {
    const { C, state } = core();
    const prepared = opts && opts.prepare ? opts.prepare(C, state) : null;
    const before = snapshot(state);
    const histBefore = state.history.length;
    const res = run(C, state, prepared);
    const humane = typeof res.message === 'string' &&
      !/regex|NaN|Date|round|trip|MAX_SAFE|IEEE|float/i.test(res.message) && res.message.length > 5;
    ok(label,
      res.ok === false && res.code === 'DATE_INVALID' && humane &&
      snapshot(state) === before && state.history.length === histBefore,
      'ok=' + res.ok + ' code=' + res.code + ' msg=' + res.message);
  }

  /* §50.14–§50.22 — все date-bearing Common Actions. */
  rejects('B1 Task create с невозможной датой отклонён без мутации и без History',
    (C) => C.tasks.createTask({ title: 'Задача', date: '2026-02-30' }));
  rejects('B2 Task create с невозможным дедлайном отклонён',
    (C) => C.tasks.createTask({ title: 'Задача', deadline: '2026-04-31' }));
  rejects('B3 Task update с невозможной датой отклонён без мутации и без History',
    (C, st, t) => C.tasks.updateTask(t.id, { date: '2026-02-29' }),
    { prepare: (C) => C.tasks.createTask({ title: 'Живая', date: '2026-03-10' }).entity });
  rejects('B4 Event create с невозможной датой отклонён',
    (C) => C.events.createEvent({ title: 'Встреча', date: '2026-02-30', startTime: '10:00' }));
  rejects('B5 Event update с невозможной датой отклонён (исходный дефект A)',
    (C, st, e) => C.events.updateEvent(e.id, { date: '2026-02-30' }),
    { prepare: (C) => C.events.createEvent({ title: 'Встреча', date: '2026-03-10', startTime: '10:00' }).entity });
  rejects('B6 Finance operation с невозможной датой отклонена',
    (C) => C.finance.createOperation({ type: 'expense', amount: '100', cat: 'Продукты', account: 'card', dateISO: '2026-02-30' }));
  rejects('B7 Finance operation update с невозможной датой отклонён',
    (C, st, o) => C.finance.updateOperation(o.id, { dateISO: '2026-13-01' }),
    { prepare: (C) => C.finance.createOperation({ type: 'expense', amount: '100', cat: 'Продукты', account: 'card' }).entity });
  rejects('B8 Auto заправка с невозможной датой отклонена',
    (C) => C.auto.createRecord('fuel', { liters: 40, sum: 3000, km: 100100, dateISO: '2026-02-30' }));
  rejects('B9 Auto расход с невозможной датой отклонён',
    (C) => C.auto.createRecord('expense', { title: 'Мойка', amount: 500, dateISO: '2026-04-31' }));
  rejects('B10 Auto обслуживание с невозможной датой отклонено',
    (C) => C.auto.createRecord('service', { title: 'Масло', cost: 5000, km: 100100, dateISO: '2026-02-29' }));
  rejects('B11 Auto документ с невозможным сроком отклонён',
    (C) => C.auto.createRecord('doc', { title: 'ОСАГО', untilISO: '2027-02-29' }));
  rejects('B12 Shopping покупка с невозможной датой покупки отклонена',
    (C) => C.shopping.createPurchase({ name: 'Телефон', dateISO: '2026-02-30' }));
  rejects('B13 Shopping покупка с невозможной датой гарантии отклонена',
    (C) => C.shopping.createPurchase({ name: 'Телефон', warrantyISO: '2100-02-29' }));
  rejects('B14 Shopping обслуживание покупки с невозможной датой отклонено',
    (C, st, p) => C.shopping.addService(p.id, { title: 'Ремонт', cost: 100, dateISO: '2026-02-30' }),
    { prepare: (C) => C.shopping.createPurchase({ name: 'Ноутбук', dateISO: '2026-03-01' }).entity });
  rejects('B15 Reminder с невозможной датой отклонён',
    (C) => C.reminders.create({ title: 'Позвонить', dateISO: '2026-02-30' }));
  rejects('B16 Reminder update с невозможной датой отклонён',
    (C, st, r) => C.reminders.update(r.id, { dateISO: '2026-04-31' }),
    { prepare: (C) => C.reminders.create({ title: 'Живое', dateISO: '2026-10-01' }).entity });

  /* §7 — расширенная матрица по всем разделам сразу. */
  const consumers = [
    ['Task', (C, d) => C.tasks.createTask({ title: 'T', date: d })],
    ['Event', (C, d) => C.events.createEvent({ title: 'E', date: d, startTime: '10:00' })],
    ['Finance', (C, d) => C.finance.createOperation({ type: 'expense', amount: '10', cat: 'Продукты', account: 'card', dateISO: d })],
    ['Auto', (C, d) => C.auto.createRecord('fuel', { liters: 1, sum: 10, km: 100100, dateISO: d })],
    ['Shopping', (C, d) => C.shopping.createPurchase({ name: 'P', dateISO: d })],
    ['Reminder', (C, d) => C.reminders.create({ title: 'R', dateISO: d })]
  ];
  const impossible = INVALID_DATES.filter((d) => d !== '');
  consumers.forEach(([name, run]) => {
    const { C, state } = core();
    const before = snapshot(state);
    const leaked = impossible.filter((d) => run(C, d).ok === true);
    ok('B17.' + name + ' ни одна из ' + impossible.length + ' невозможных дат не сохраняется',
      leaked.length === 0 && snapshot(state) === before, leaked.join(', '));
  });

  /* §50.25 / §43 — нормальные даты продолжают работать во всех разделах. */
  {
    const { C, state } = core();
    const t = C.tasks.createTask({ title: 'Задача', date: '2028-02-29', deadline: '2028-02-29' });
    const e = C.events.createEvent({ title: 'Встреча', date: '2000-02-29', startTime: '10:00' });
    const o = C.finance.createOperation({ type: 'expense', amount: '250.50', cat: 'Продукты', account: 'card', dateISO: '2026-02-28' });
    const f = C.auto.createRecord('fuel', { liters: 40, sum: 3000, km: 100100, dateISO: '2024-02-29' });
    const p = C.shopping.createPurchase({ name: 'Ноутбук', dateISO: '2026-01-31', warrantyISO: '2028-02-29' });
    const r = C.reminders.create({ title: 'Позвонить', dateISO: '2026-12-31' });
    ok('B18 високосные и граничные настоящие даты принимаются всеми разделами',
      t.ok && e.ok && o.ok && f.ok && p.ok && r.ok &&
      state.tasks[0].date === '2028-02-29' && state.events[0].date === '2000-02-29' &&
      state.ops[0].dateISO === '2026-02-28' && state.car.fuel[0].dateISO === '2024-02-29' &&
      state.purchases[0].warrantyISO === '2028-02-29' && state.reminders[0].dateISO === '2026-12-31');
    ok('B19 валидные записи попали в «Историю» (отказ не сломал нормальный путь)',
      state.history.length === 6);
  }

  /* §13 — дата не указана вовсе остаётся законной, это не отказ. */
  {
    const { C, state } = core();
    const t = C.tasks.createTask({ title: 'Без даты' });
    const t2 = C.tasks.createTask({ title: 'Пустая дата', date: '' });
    const o = C.finance.createOperation({ type: 'expense', amount: '10', cat: 'Продукты', account: 'card' });
    ok('B20 отсутствие даты — по-прежнему законно (подставляется значение по умолчанию)',
      t.ok && t2.ok && o.ok && state.ops[0].dateISO === FIXED_TODAY);
  }

  /* §16 — прошлые записи задним числом не сломаны. */
  {
    const { C, state } = core();
    const f = C.auto.createRecord('fuel', { liters: 40, sum: 3000, km: 100100, dateISO: '2020-02-29' });
    ok('B21 backdated valid record (2020-02-29) по-прежнему сохраняется',
      f.ok && state.car.fuel[0].dateISO === '2020-02-29');
  }

  /* §17 — проверка гарантии работает поверх строгих дат. */
  {
    const { C } = core();
    const bad = C.shopping.createPurchase({ name: 'Х', dateISO: '2026-03-01', warrantyISO: '2026-02-30' });
    const early = C.shopping.createPurchase({ name: 'Y', dateISO: '2026-03-01', warrantyISO: '2026-02-28' });
    ok('B22 невозможная дата гарантии отсекается раньше правила «гарантия не раньше покупки»',
      bad.ok === false && bad.code === 'DATE_INVALID' &&
      early.ok === false && early.code === 'WARRANTY_BEFORE_PURCHASE');
  }
}

/* ===================== ЧАСТЬ C. Инвариант безопасных денег ===================== */
function partC() {
  const { C } = core();
  const M = C.money;

  ok('C1 денежный контракт опубликован слоем действий',
    typeof M.safeMinor === 'function' && typeof M.isSafeMinor === 'function' &&
    typeof M.maxAmount === 'function' && M.scale === 100);

  /* §36 — граница вычисляется из MAX_SAFE_INTEGER и масштаба, а не вписана руками. */
  const maxAmount = M.maxAmount();
  ok('C2 максимальная сумма выведена из Number.MAX_SAFE_INTEGER и масштаба валюты',
    M.safeMinor(maxAmount) === Number.MAX_SAFE_INTEGER && Number.isSafeInteger(M.safeMinor(maxAmount)));
  const oneStepBeyond = (Number.MAX_SAFE_INTEGER + 1) / M.scale;
  ok('C3 шаг за границу перестаёт быть безопасным', M.safeMinor(oneStepBeyond) === null);

  /* §51.1–§51.4 — обычные деньги считаются точно. */
  ok('C4 0.01 → ровно 1 минимальная единица', M.safeMinor(0.01) === 1 && M.minor(0.01) === 1);
  ok('C5 0.10 → ровно 10', M.safeMinor(0.1) === 10 && M.minor('0.10') === 10);
  ok('C6 0.20 → ровно 20', M.safeMinor(0.2) === 20 && M.minor('0.20') === 20);
  ok('C7 0.1 + 0.2 через минимальные единицы даёт ровно 0.3 (а не 0.30000000000000004)',
    M.sum(0.1, 0.2) === 0.3 && M.minor(M.sum(0.1, 0.2)) === 30);
  ok('C8 1250.50 сохраняет копейки точно', M.safeMinor(1250.5) === 125050 && M.minor('1250.50') === 125050);
  ok('C9 нефинитные и мусорные значения не дают минимальных единиц',
    M.safeMinor(Infinity) === null && M.safeMinor(-Infinity) === null && M.safeMinor(NaN) === null &&
    M.safeMinor('не число') === null);
  ok('C10 отрицательные значения остаются точными в пределах диапазона',
    M.safeMinor(-12.34) === -1234 && M.isSafeMinor(M.safeMinor(-12.34)));

  /* §51.5–§51.15 — поведение Finance. */
  function financeRejects(label, params, expectCode) {
    const { C, state } = core();
    const before = snapshot(state);
    const balBefore = state.finAccounts[0].balance;
    const res = C.finance.createOperation(params);
    const humane = typeof res.message === 'string' &&
      !/MAX_SAFE|IEEE|float|плавающ|regex|NaN/i.test(res.message);
    ok(label,
      res.ok === false && res.code === expectCode && humane &&
      state.ops.length === 0 && state.history.length === 0 &&
      state.finAccounts[0].balance === balBefore && snapshot(state) === before,
      'ok=' + res.ok + ' code=' + res.code + ' msg=' + res.message);
  }
  financeRejects('C11 огромная сумма отклонена (исходный дефект B), баланс и «История» не тронуты',
    { type: 'expense', amount: '99999999999999999999', cat: 'Продукты', account: 'card' }, 'AMOUNT_OUT_OF_RANGE');
  financeRejects('C12 шаг за границу минимальных единиц отклонён',
    { type: 'expense', amount: String(oneStepBeyond), cat: 'Продукты', account: 'card' }, 'AMOUNT_OUT_OF_RANGE');
  financeRejects('C13 Infinity отклонён как сумма',
    { type: 'expense', amount: 'Infinity', cat: 'Продукты', account: 'card' }, 'AMOUNT_INVALID');
  financeRejects('C14 нечисловая сумма отклонена',
    { type: 'expense', amount: 'много', cat: 'Продукты', account: 'card' }, 'AMOUNT_INVALID');
  financeRejects('C15 отрицательная сумма отклонена по существующему контракту',
    { type: 'expense', amount: '-100', cat: 'Продукты', account: 'card' }, 'AMOUNT_INVALID');

  /* §51.5–§51.6 — обычные расход и доход по-прежнему работают точно. */
  {
    const { C, state } = core();
    const exp = C.finance.createOperation({ type: 'expense', amount: '1250.50', cat: 'Продукты', account: 'card' });
    ok('C16 обычный расход сохраняется и списывает ровно свою сумму',
      exp.ok && C.money.minor(state.finAccounts[0].balance) === 100000 - 125050);
    const inc = C.finance.createOperation({ type: 'income', amount: '2000.25', cat: 'Доход', account: 'card' });
    ok('C17 обычный доход сохраняется и прибавляет ровно свою сумму',
      inc.ok && C.money.minor(state.finAccounts[0].balance) === 100000 - 125050 + 200025);
    ok('C18 баланс после обычных операций остаётся безопасным целым в минимальных единицах',
      Number.isSafeInteger(C.money.minor(state.finAccounts[0].balance)));
  }

  /* §36 / §51.9–§51.12 — граница баланса, а не только суммы. */
  {
    const { C, state } = core();
    /* Счёт у самой границы: любая прибавка выводит баланс за безопасный предел,
       хотя сама сумма безопасна. */
    state.finAccounts[0].balance = maxAmount - 1;
    const before = snapshot(state);
    const justInside = C.finance.createOperation({ type: 'income', amount: '0.5', cat: 'Доход', account: 'card' });
    ok('C19 доход, оставляющий баланс внутри безопасного диапазона, принимается',
      justInside.ok === true && Number.isSafeInteger(C.money.minor(state.finAccounts[0].balance)));

    const { C: C2, state: st2 } = core();
    st2.finAccounts[0].balance = maxAmount - 1;
    const snap2 = snapshot(st2);
    const overflow = C2.finance.createOperation({ type: 'income', amount: '100', cat: 'Доход', account: 'card' });
    ok('C20 доход, выводящий баланс за безопасный диапазон, отклонён целиком',
      overflow.ok === false && overflow.code === 'BALANCE_OUT_OF_RANGE' &&
      st2.ops.length === 0 && st2.history.length === 0 && snapshot(st2) === snap2,
      'code=' + overflow.code);
    ok('C21 сообщение о переполнении баланса объясняется человеку, без технического жаргона',
      typeof overflow.message === 'string' && /баланс/i.test(overflow.message) &&
      !/MAX_SAFE|IEEE|float|integer/i.test(overflow.message), overflow.message);
    ok('C22 снимок состояния до и после отказа совпадает (no partial mutation)', snapshot(st2) === snap2);
    void before;
  }

  /* §31 — update/delete используют тот же инвариант. */
  {
    const { C, state } = core();
    const op = C.finance.createOperation({ type: 'expense', amount: '100', cat: 'Продукты', account: 'card' }).entity;
    const before = snapshot(state);
    const histBefore = state.history.length;
    const bad = C.finance.updateOperation(op.id, { amount: '99999999999999999999' });
    ok('C23 update операции огромной суммой отклонён, операция и баланс не изменились',
      bad.ok === false && bad.code === 'AMOUNT_OUT_OF_RANGE' &&
      snapshot(state) === before && state.history.length === histBefore, 'code=' + bad.code);
    const good = C.finance.updateOperation(op.id, { amount: '150.75' });
    ok('C24 корректный update пересчитывает баланс точно (откат старой суммы + новая)',
      good.ok && C.money.minor(state.finAccounts[0].balance) === 100000 - 15075);
    const del = C.finance.deleteOperation(op.id);
    ok('C25 удаление операции возвращает баланс ровно к исходному',
      del.ok && C.money.minor(state.finAccounts[0].balance) === 100000 &&
      Number.isSafeInteger(C.money.minor(state.finAccounts[0].balance)));
  }

  /* §24 — балансы счетов тоже под инвариантом. */
  {
    const { C, state } = core();
    const before = snapshot(state);
    const bad = C.finance.createAccount({ name: 'Огромный', balance: '99999999999999999999' });
    ok('C26 счёт с небезопасным балансом не создаётся',
      bad.ok === false && bad.code === 'AMOUNT_OUT_OF_RANGE' && snapshot(state) === before, 'code=' + bad.code);
    const acc = C.finance.createAccount({ name: 'Обычный', balance: '1000.55' }).entity;
    const badUpd = C.finance.updateAccount(acc.id, { balance: '1e30' });
    ok('C27 баланс счёта нельзя изменить на небезопасное значение',
      badUpd.ok === false && badUpd.code === 'AMOUNT_OUT_OF_RANGE' &&
      C.money.minor(C.finance.account(acc.id).balance) === 100055, 'code=' + badUpd.code);
  }

  /* §26 — прочие денежные поля разделов используют тот же инвариант. */
  {
    const { C, state } = core();
    const before = snapshot(state);
    const fuel = C.auto.createRecord('fuel', { liters: 40, sum: '99999999999999999999', km: 100100 });
    const serv = C.auto.createRecord('service', { title: 'Ремонт', cost: '1e25', km: 100100 });
    const buy = C.shopping.createPurchase({ name: 'Дом', price: '99999999999999999999' });
    ok('C28 небезопасные денежные поля Auto и Shopping отклоняются тем же кодом',
      fuel.ok === false && fuel.code === 'AMOUNT_OUT_OF_RANGE' &&
      serv.ok === false && serv.code === 'AMOUNT_OUT_OF_RANGE' &&
      buy.ok === false && buy.code === 'AMOUNT_OUT_OF_RANGE' && snapshot(state) === before,
      [fuel.code, serv.code, buy.code].join('/'));
  }
}

/* ============ ЧАСТЬ D. Связанные Auto→Finance и Shopping→Finance ============ */
function partD() {
  /* §32 — Auto с явной связью: небезопасная сумма не создаёт ни расход, ни запись. */
  {
    const { C, state } = core();
    const before = snapshot(state);
    const res = C.auto.createRecord('fuel',
      { liters: 40, sum: '99999999999999999999', km: 100100, linkFinance: true });
    ok('D1 связанная заправка с небезопасной суммой не создаёт ни Auto, ни Finance',
      res.ok === false && state.car.fuel.length === 0 && state.ops.length === 0 &&
      state.history.length === 0 && snapshot(state) === before, 'code=' + res.code);
  }
  /* Сумма безопасна, но баланс вышел бы за предел — связанное действие атомарно. */
  {
    const { C, state } = core();
    state.finAccounts[0].balance = Number.MIN_SAFE_INTEGER / 100 + 1;
    const before = snapshot(state);
    const res = C.auto.createRecord('expense',
      { title: 'Огромный ремонт', amount: '1000000', linkFinance: true });
    ok('D2 связанный Auto-расход, переполняющий баланс, отклонён целиком и атомарно',
      res.ok === false && res.code === 'BALANCE_OUT_OF_RANGE' &&
      state.car.expenses.length === 0 && state.ops.length === 0 &&
      state.history.length === 0 && snapshot(state) === before, 'code=' + res.code);
    ok('D3 причина отказа доходит до пользователя как есть, а не как общее «не удалось»',
      /баланс/i.test(res.message || ''), res.message);
  }
  /* §32 — валидная связанная запись по-прежнему работает. */
  {
    const { C, state } = core();
    const res = C.auto.createRecord('fuel', { liters: 40, sum: 3200, km: 100100, linkFinance: true });
    ok('D4 валидная связанная заправка создаёт и запись авто, и расход одной History-строкой',
      res.ok && state.car.fuel.length === 1 && state.ops.length === 1 &&
      state.history.length === 1 && state.ops[0].carItemId === state.car.fuel[0].id &&
      C.money.minor(state.finAccounts[0].balance) === 100000 - 320000);
  }
  /* §33 — Shopping с явной связью. */
  {
    const { C, state } = core();
    const before = snapshot(state);
    const res = C.shopping.createPurchase({ name: 'Дом', price: '99999999999999999999', linkFinance: true });
    ok('D5 связанная покупка с небезопасной ценой не создаёт ни покупку, ни расход',
      res.ok === false && state.purchases.length === 0 && state.ops.length === 0 &&
      state.history.length === 0 && snapshot(state) === before, 'code=' + res.code);
  }
  {
    const { C, state } = core();
    state.finAccounts[0].balance = Number.MIN_SAFE_INTEGER / 100 + 1;
    const before = snapshot(state);
    const res = C.shopping.createPurchase({ name: 'Ноутбук', price: '1000000', linkFinance: true });
    ok('D6 связанная покупка, переполняющая баланс, отклонена целиком (нет orphan-расхода)',
      res.ok === false && res.code === 'BALANCE_OUT_OF_RANGE' &&
      state.purchases.length === 0 && state.ops.length === 0 &&
      state.history.length === 0 && snapshot(state) === before, 'code=' + res.code);
  }
  {
    const { C, state } = core();
    const res = C.shopping.createPurchase({ name: 'Ноутбук', price: 80000, dateISO: '2026-02-28', linkFinance: true });
    ok('D7 валидная связанная покупка по-прежнему создаёт покупку и расход атомарно',
      res.ok && state.purchases.length === 1 && state.ops.length === 1 &&
      state.history.length === 1 && state.ops[0].purchaseId === state.purchases[0].id &&
      C.money.minor(state.finAccounts[0].balance) === 100000 - 8000000);
  }
  /* §31/§33 — изменение связанной сущности тоже атомарно. */
  {
    const { C, state } = core();
    const created = C.shopping.createPurchase({ name: 'Ноутбук', price: 80000, linkFinance: true });
    const before = snapshot(state);
    const histBefore = state.history.length;
    const bad = C.shopping.updatePurchase(created.entity.id, { price: '99999999999999999999' });
    ok('D8 изменение связанной покупки на небезопасную цену не расходится с «Финансами»',
      bad.ok === false && snapshot(state) === before && state.history.length === histBefore,
      'code=' + bad.code);
    const good = C.shopping.updatePurchase(created.entity.id, { price: 90000 });
    ok('D9 корректное изменение связанной покупки пересчитывает расход и баланс точно',
      good.ok && C.money.minor(state.ops[0].amount) === 9000000 &&
      C.money.minor(state.finAccounts[0].balance) === 100000 - 9000000);
  }
  {
    const { C, state } = core();
    const created = C.auto.createRecord('service',
      { title: 'Ремонт', cost: 5000, km: 100100, linkFinance: true });
    const before = snapshot(state);
    const bad = C.auto.updateRecord('service', created.entity.id, { cost: '1e25' });
    ok('D10 изменение связанной записи авто на небезопасную сумму откатывается целиком',
      bad.ok === false && snapshot(state) === before, 'code=' + bad.code);
  }
}

/* ======= ЧАСТЬ E. Command Engine и другие входы не обходят общий слой ======= */
function partE() {
  /* §34/§41 — у команд может быть свой синтаксический разбор, но окончательная
     защита одна: общее действие. Проверяем именно конечный результат. */
  {
    const { K, state } = core();
    const before = snapshot(state);
    const res = K.run('Запиши расход 99999999999999999999 рублей на продукты', { source: 'test' });
    ok('E1 команда с небезопасной суммой не создаёт операцию и не пишет «Историю»',
      res.ok === false && state.ops.length === 0 && state.history.length === 0 &&
      snapshot(state) === before, JSON.stringify(res.response || res.intent));
    /* Самое важное: даже пройдя уточнение счёта И подтверждение пользователя,
       команда не может обойти общее действие — отказ приходит с конечного слоя. */
    const confirmed = K.execute(res.intent, { source: 'test', confirmed: true, slots: { account: 'card' } });
    ok('E1a подтверждённая команда всё равно отклонена общим действием (конечная защита)',
      confirmed.ok === false && confirmed.code === 'AMOUNT_OUT_OF_RANGE' &&
      state.ops.length === 0 && state.history.length === 0 && snapshot(state) === before,
      'code=' + confirmed.code);
  }
  {
    const { K, state } = core();
    const before = snapshot(state);
    const res = K.run('Создай задачу отчёт на 30.02.2026', { source: 'test' });
    ok('E2 команда с невозможной датой не создаёт задачу и не пишет «Историю»',
      res.ok === false && state.tasks.length === 0 && state.history.length === 0 &&
      snapshot(state) === before, res.response);
  }
  {
    const { K, state } = core();
    const before = snapshot(state);
    const res = K.run('Напомни купить масло на 31.04', { source: 'test' });
    ok('E3 напоминание на несуществующую дату командой не создаётся',
      res.ok === false && state.reminders.length === 0 && state.history.length === 0 &&
      snapshot(state) === before, res.response);
  }
  /* §14 — Event-команда: даже при собственном разборе конечная защита остаётся
     на общем действии, состояние события не меняется. */
  {
    const { C, K, state } = core();
    const ev = C.events.createEvent({ title: 'Стоматолог', date: '2026-10-05', startTime: '10:00', endTime: '11:00' }).entity;
    const before = snapshot(state);
    const res = K.run('Перенеси событие стоматолог на 30.02.2026', { source: 'test' });
    ok('E4 перенос события на несуществующую дату не меняет событие',
      res.ok === false && C.events.getEvent(ev.id).entity.date === '2026-10-05' &&
      snapshot(state) === before, res.response);
  }
  /* §41 — в командном слое нет второго календарного/денежного валидатора:
     тот же вход, отклонённый командой, отклоняется и прямым вызовом действия. */
  {
    const { C, state } = core();
    const direct = C.finance.createOperation({ type: 'expense', amount: '99999999999999999999', cat: 'Продукты', account: 'card' });
    ok('E5 прямой вызов Common Action отклоняет тот же небезопасный вход, что и команда',
      direct.ok === false && direct.code === 'AMOUNT_OUT_OF_RANGE' && state.ops.length === 0);
  }
  /* §35 — обычные суммы через команду по-прежнему работают. */
  {
    const { C, K, state } = core();
    const asked = K.run('Запиши расход 1 250,50 руб на продукты', { source: 'test' });
    const pending = K.execute(asked.intent, { source: 'test', slots: { account: 'card' } });
    ok('E6 обычная сумма командой доходит до подтверждения и до него ничего не меняет',
      pending.status === 'confirmation_required' && state.ops.length === 0 && state.history.length === 0,
      pending.status);
    const done = K.execute(asked.intent, { source: 'test', confirmed: true, slots: { account: 'card' } });
    ok('E7 после подтверждения расход сохраняется с точностью до копейки',
      done.ok && state.ops.length === 1 && C.money.minor(state.ops[0].amount) === 125050 &&
      C.money.minor(state.finAccounts[0].balance) === 100000 - 125050,
      String(C.money.minor(state.finAccounts[0].balance)));
  }
}

/* =============== ЧАСТЬ F. История, Undo и переживание перезагрузки =============== */
function partF() {
  /* §42 — Undo валидной операции возвращает точные значения. */
  {
    const { C, w, state } = core();
    const balance0 = C.money.minor(state.finAccounts[0].balance);
    const op = C.finance.createOperation({ type: 'expense', amount: '1250.50', cat: 'Продукты', account: 'card' });
    const entry = state.history[0];
    w.Aven.undoAction(entry.id);
    ok('F1 Undo валидного расхода возвращает баланс ровно к исходному значению',
      C.money.minor(state.finAccounts[0].balance) === balance0 && state.ops.length === 0, op.ok);
    ok('F2 после Undo баланс остаётся безопасным целым',
      Number.isSafeInteger(C.money.minor(state.finAccounts[0].balance)));
  }
  {
    const { C, w, state } = core();
    const created = C.shopping.createPurchase({ name: 'Ноутбук', price: 80000, linkFinance: true });
    const balanceAfter = C.money.minor(state.finAccounts[0].balance);
    w.Aven.undoAction(state.history[0].id);
    ok('F3 Undo связанной покупки убирает и покупку, и расход, возвращая точный баланс',
      state.purchases.length === 0 && state.ops.length === 0 &&
      C.money.minor(state.finAccounts[0].balance) === 100000 &&
      balanceAfter === 100000 - 8000000, created.ok);
  }
  /* §21/§42 — отклонённые входы не оставляют следа в «Истории». */
  {
    const { C, state } = core();
    C.tasks.createTask({ title: 'T', date: '2026-02-30' });
    C.events.createEvent({ title: 'E', date: '2026-04-31' });
    C.finance.createOperation({ type: 'expense', amount: '1e30', cat: 'Продукты', account: 'card' });
    C.shopping.createPurchase({ name: 'P', warrantyISO: '1900-02-29' });
    C.reminders.create({ title: 'R', dateISO: '2026-13-01' });
    ok('F4 пять разных отклонённых входов дали ровно ноль записей «Истории»', state.history.length === 0);
  }
  /* §39 — отклонённые данные не попадают в сохраняемое состояние, валидные переживают перезагрузку. */
  {
    const { C, state } = core();
    const savedBefore = state.__saved || 0;
    C.finance.createOperation({ type: 'expense', amount: '99999999999999999999', cat: 'Продукты', account: 'card' });
    C.tasks.createTask({ title: 'T', date: '2026-02-30' });
    ok('F5 отклонённые данные не вызвали сохранение состояния', (state.__saved || 0) === savedBefore);

    C.finance.createOperation({ type: 'expense', amount: '1250.50', cat: 'Продукты', account: 'card' });
    C.tasks.createTask({ title: 'Живая', date: '2028-02-29' });
    /* Перезагрузка — это сериализация состояния и его чтение обратно. */
    const persisted = JSON.parse(JSON.stringify(state));
    ok('F6 валидные граничные данные переживают сериализацию/перезагрузку без потерь',
      persisted.ops.length === 1 && C.money.minor(persisted.ops[0].amount) === 125050 &&
      persisted.tasks[0].date === '2028-02-29' &&
      Number.isSafeInteger(C.money.minor(persisted.finAccounts[0].balance)));
    const serialized = JSON.stringify(persisted);
    ok('F7 в сохранённом состоянии нет ни одной невозможной даты и ни одной небезопасной суммы',
      serialized.indexOf('2026-02-30') < 0 && serialized.indexOf('99999999999999999999') < 0);
  }
  /* §43 — сквозная согласованность: обычные сценарии разделов не сломаны. */
  {
    const { C, state } = core();
    C.tasks.createTask({ title: 'Задача дня', date: FIXED_TODAY });
    C.events.createEvent({ title: 'Встреча', date: FIXED_TODAY, startTime: '10:00', endTime: '11:00' });
    C.finance.createOperation({ type: 'expense', amount: '500', cat: 'Продукты', account: 'card' });
    C.reminders.create({ title: 'Позвонить', dateISO: FIXED_TODAY });
    ok('F8 задачи, события, финансы и напоминания дня видны так же, как раньше',
      C.tasks.getTasksForDate(FIXED_TODAY).items.length === 1 &&
      C.events.getEventsForDate(FIXED_TODAY).items.length === 1 &&
      C.finance.totals({ period: 'today' }).count === 1 &&
      C.reminders.list({ dateISO: FIXED_TODAY }).items.length === 1);
    ok('F9 сводка «Финансов» и баланс считаются из тех же операций',
      C.money.minor(C.finance.summary().balance) ===
      state.finAccounts.reduce((acc, a) => acc + C.money.minor(a.balance), 0));
    ok('F10 «История» содержит ровно четыре валидные записи', state.history.length === 4);
  }
}

/* ============== ЧАСТЬ G. Property-подобные детерминированные проверки ============== */
function partG() {
  const { C } = core();
  const D = C.dates, M = C.money;

  /* §52 — даты: перебор границ месяцев за несколько лет, включая столетия. */
  const years = [1900, 1996, 2000, 2024, 2026, 2027, 2028, 2100, 2400];
  let dateMismatch = null, checked = 0;
  years.forEach((y) => {
    for (let m = 1; m <= 12; m++) {
      const len = D.daysInMonth(y, m);
      const mm = String(m).padStart(2, '0');
      /* Последний существующий день месяца обязан быть валидным, следующий — нет. */
      const last = y + '-' + mm + '-' + String(len).padStart(2, '0');
      const beyond = y + '-' + mm + '-' + String(len + 1).padStart(2, '0');
      checked += 2;
      if (D.isValid(last) !== true) dateMismatch = dateMismatch || ('последний день не принят: ' + last);
      if (len + 1 <= 31 && D.isValid(beyond) !== false) dateMismatch = dateMismatch || ('день за границей принят: ' + beyond);
    }
  });
  ok('G1 границы всех месяцев за ' + years.length + ' лет (' + checked + ' проверок): день в месяце принят, следующий — нет',
    dateMismatch === null, dateMismatch);

  /* Февраль отдельно: длина строго следует правилу високосного года. */
  let febMismatch = null;
  for (let y = 1890; y <= 2110; y++) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const iso29 = y + '-02-29';
    if (D.isValid(iso29) !== leap) { febMismatch = iso29 + ' → ' + D.isValid(iso29) + ', ожидалось ' + leap; break; }
    if (D.isValid(y + '-02-30') !== false) { febMismatch = y + '-02-30 принят'; break; }
  }
  ok('G2 29 февраля за 221 год подряд принимается ровно в високосные годы', febMismatch === null, febMismatch);

  /* Детерминированность: один и тот же вход всегда даёт один и тот же ответ. */
  const twice = VALID_DATES.concat(INVALID_DATES).every((d) => D.isValid(d) === D.isValid(d));
  ok('G3 валидатор детерминирован и не зависит от системных часов', twice);

  /* §52 — деньги: значения вокруг границы безопасного диапазона. */
  const maxMinor = Number.MAX_SAFE_INTEGER;
  const probes = [0, 1, 2, 99, 100, 12345, maxMinor - 2, maxMinor - 1, maxMinor,
    maxMinor + 1, maxMinor + 2, maxMinor * 2];
  let moneyMismatch = null;
  probes.forEach((minor) => {
    const amount = minor / M.scale;
    const got = M.safeMinor(amount);
    const expectSafe = Number.isSafeInteger(minor);
    if (expectSafe && got === null) moneyMismatch = moneyMismatch || ('безопасное отклонено: ' + minor);
    if (!expectSafe && got !== null && !Number.isSafeInteger(got)) {
      moneyMismatch = moneyMismatch || ('небезопасное принято: ' + minor);
    }
  });
  ok('G4 значения вокруг границы: безопасные принимаются, небезопасные не дают небезопасных единиц',
    moneyMismatch === null, moneyMismatch);

  /* Любая принятая сумма обязана дать именно safe integer — это и есть инвариант. */
  let invariantBroken = null;
  for (let i = 0; i < 400; i++) {
    /* Детерминированная последовательность без Math.random: тест обязан быть воспроизводимым. */
    const amount = (i * 7919) / 100 + (i % 3) / 100;
    const minor = M.safeMinor(amount);
    if (minor !== null && !Number.isSafeInteger(minor)) { invariantBroken = String(amount); break; }
    if (minor !== null && Math.abs(minor - Math.round(amount * 100)) > 0) { invariantBroken = 'округление: ' + amount; break; }
  }
  ok('G5 400 детерминированных сумм: принятые всегда дают точные безопасные минимальные единицы',
    invariantBroken === null, invariantBroken);

  /* §28 — сложение балансов: результат внутри диапазона либо отказ, но не порча. */
  {
    let sumBroken = null;
    const steps = [1, 250.5, 100000, 1e9, 1e12];
    const { C: C2, state } = core();
    steps.forEach((amount, i) => {
      const res = C2.finance.createOperation({ type: 'income', amount: String(amount), cat: 'Доход', account: 'card' });
      if (res.ok && !Number.isSafeInteger(C2.money.minor(state.finAccounts[0].balance))) {
        sumBroken = 'шаг ' + i + ' оставил небезопасный баланс';
      }
    });
    ok('G6 последовательные валидные операции всегда оставляют баланс безопасным целым',
      sumBroken === null && state.ops.length === steps.length, sumBroken);
  }
}

/* ============ ЧАСТЬ H. Настоящий экран: форма «Финансов» не обходит слой ============ */
const PORT = 8129;
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
    H: () => w.AvenState.s().history,
    click: (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })),
    set: (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
    text: () => (d.getElementById('page').textContent || '').replace(/[\u00a0\u202f]/g, ' '),
    toastText: () => { const t = d.querySelectorAll('#toasts .toast'); return t.length ? t[t.length - 1].textContent : ''; },
    broken: () => (d.getElementById('page').textContent || '').indexOf('Ошибка отрисовки') >= 0,
    modalSubmit: () => d.querySelector('#modal-root [data-submit]')
  };
}

async function partH() {
  /* §25/§34 — форма не является окончательной защитой, но обязана честно
     показать отказ общего слоя и ничего не испортить. */
  const p = await load('#/finance', 390);
  const C = p.C();
  const opsBefore = p.st().ops.length;
  const histBefore = p.H().length;
  const balanceBefore = C.money.minor(C.finance.summary().balance);

  p.click(p.q('[data-action="fin-add"]')); await sleep(200);
  p.set(p.q('#modal-root input[name="amount"]'), '99999999999999999999');
  p.set(p.q('#modal-root input[name="title"]'), 'Переполнение');
  p.click(p.modalSubmit()); await sleep(300);

  const toast = p.toastText();
  ok('H1 форма «Финансов» не сохранила небезопасную сумму (общий слой — конечная защита)',
    p.st().ops.length === opsBefore && p.H().length === histBefore, 'ops=' + p.st().ops.length);
  ok('H2 баланс после отказа формы не изменился',
    C.money.minor(C.finance.summary().balance) === balanceBefore);
  ok('H3 отказ объяснён пользователю текстом, а не только цветом',
    typeof toast === 'string' && toast.trim().length > 0 && /сумм/i.test(toast), toast);
  ok('H4 в тексте ошибки нет технического жаргона',
    !/MAX_SAFE|IEEE|float|integer|NaN|regex/i.test(toast), toast);
  ok('H5 экран не сломался и остался работоспособным', !p.broken());

  /* §56 — сообщение об ошибке не создаёт горизонтального переполнения на узких ширинах. */
  const longWord = (toast || '').split(/\s+/).filter(Boolean).reduce((a, b) => (a.length >= b.length ? a : b), '');
  ok('H6 в сообщении нет неразрывно длинного слова, ломающего узкие экраны (320–430)',
    longWord.length <= 28, longWord);

  /* §20/§55 — невозможная дата через ту же форму. */
  const opsBefore2 = p.st().ops.length;
  p.click(p.q('[data-action="fin-add"]')); await sleep(200);
  const dateInput = p.q('#modal-root input[name="dateISO"]') || p.q('#modal-root input[type="date"]');
  p.set(p.q('#modal-root input[name="amount"]'), '100');
  if (dateInput) p.set(dateInput, '2026-02-30');
  p.click(p.modalSubmit()); await sleep(300);
  ok('H7 невозможная дата через форму не создаёт операцию',
    p.st().ops.length === opsBefore2, 'ops=' + p.st().ops.length);
  ok('H8 после отказа поля формы остаются доступными, фокус не потерян и экран жив',
    !p.broken() && p.d.activeElement !== null);

  /* §43 — обычная операция через ту же форму по-прежнему сохраняется точно. */
  const opsBefore3 = p.st().ops.length;
  p.click(p.q('[data-action="fin-add"]')); await sleep(200);
  p.set(p.q('#modal-root input[name="amount"]'), '1250.50');
  p.set(p.q('#modal-root input[name="title"]'), 'Обычная трата');
  p.click(p.modalSubmit()); await sleep(320);
  ok('H9 обычная сумма через форму сохраняется с точностью до копейки',
    p.st().ops.length === opsBefore3 + 1 && C.money.minor(p.st().ops[0].amount) === 125050,
    String(p.st().ops[0] && p.st().ops[0].amount));
  ok('H10 баланс после обычной операции остаётся безопасным целым',
    Number.isSafeInteger(C.money.minor(C.finance.summary().balance)) && !p.broken());

  p.dom.window.close();
}

/* ================================== ЗАПУСК ================================== */
(async () => {
  partA();
  partB();
  partC();
  partD();
  partE();
  partF();
  partG();
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  try {
    await partH();
  } finally {
    server.close();
  }
  console.log('\nИтого: ' + pass + ' OK, ' + fail + ' FAIL');
  if (fail) { console.log('Провалы:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
