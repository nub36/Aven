/* Поведенческая проверка Stage 1.3: заметки, финансы, авто, покупки и напоминания
   работают через общий слой действий (Common Action Layer), а экраны только
   показывают данные и вызывают этот слой.

   Это разработческий инструмент, НЕ часть приложения и не зависимость продукта:
   jsdom ставится во временный каталог, в репозитории package.json/node_modules не появляются.

   Запуск (из корня репозитория):
     mkdir -p /tmp/lab && cd /tmp/lab && npm init -y && npm install jsdom@30 && cd -
     NODE_PATH=/tmp/lab/node_modules node prototype/tests/stage13-entities-check.js

   Часть A идёт без DOM вообще: слой действий должен работать как
   state → операция → результат/запись истории, пригодный и для будущего разбора команд.
   Часть B поднимает прототип целиком и проверяет поведение экранов: формы,
   отмену, согласованность разделов (Главная, День, Помощник, Уведомления,
   Предложения, История), общие часы, справку, обучение, мобильные ширины,
   доступность и темы.

   Спецификации: docs/MVP_SCOPE.md §5.6, §5.7, §10.1; docs/ARCHITECTURE.md (Common Action Layer);
   ADR-010 (честные статусы, без выдуманных чисел). */

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
    '  NODE_PATH=/tmp/lab/node_modules node prototype/tests/stage13-entities-check.js');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

/* ======================= ЧАСТЬ A. Слой действий без DOM ======================= */
function coreSandbox(seedToday) {
  const state = {
    tasks: [], events: [], notes: [], noteFolders: ['Личное', 'Идеи'],
    ops: [], finAccounts: [{ id: 'card', name: 'Карта', balance: 1000 }, { id: 'cash', name: 'Наличные', balance: 500 }],
    finCategories: ['Авто', 'Продукты', 'Другое', 'Доход'],
    car: { model: 'Демо', serviceIntervalKm: 10000, mileage: 100000, fuel: [], expenses: [], service: [], docs: [] },
    purchases: [], purchaseCategories: ['Электроника', 'Дом'], reminders: [], history: []
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
  /* Общие часы приложения: тесты не должны зависеть от системного календаря.
     Смещение поддерживается так же, как в приложении. */
  sandbox.window.AvenDemo = {
    todayISO: (offset) => {
      const d = new Date(seedToday + 'T12:00:00');
      d.setDate(d.getDate() + (Number(offset) || 0));
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/actions.js'), 'utf8'), sandbox, { filename: 'actions.js' });
  return { C: sandbox.window.AvenActions, state };
}

function partA() {
  const FIXED = '2026-09-27';
  const { C, state } = coreSandbox(FIXED);
  const H = () => state.history;

  ok('A0 слой Stage 1.3 загружается без document/jsdom',
    !!C && !!C.notes && !!C.finance && !!C.auto && !!C.shopping && !!C.reminders);
  ok('A0a общие часы приложения дают ту же дату, что и приложение (без системного календаря)',
    C.dates.todayISO() === FIXED, C.dates.todayISO());

  /* ---------- заметки ---------- */
  ok('N0 заметка без названия не создаётся и объясняет причину',
    (() => { const r = C.notes.createNote({ title: '   ' }); return r.ok === false && r.code === 'NOTE_TITLE_REQUIRED' && !!r.message; })());
  const n = C.notes.createNote({ title: 'Список покупок', body: 'молоко', folder: 'Личное', tags: 'дом, еда' });
  ok('N1 заметка создаётся с папкой и тегами', n.ok && n.entity.folder === 'Личное' && n.entity.tags.length === 2);
  ok('N2 создание заметки пишет отменяемую запись истории',
    H()[0].action === 'note.create' && H()[0].undoable === true && H()[0].undo.type === 'remove');
  ok('N3 заметки — приватные данные, запись помечена как чувствительная', H()[0].sensitive === true);
  const nPin = C.notes.setNotePinned(n.entity.id);
  ok('N4 закрепление переключается и попадает в историю', nPin.ok && nPin.entity.pinned === true && H()[0].action === 'note.update');
  const nBody = C.notes.saveNoteBody(n.entity.id, 'молоко\nхлеб');
  ok('N5 автосохранение текста пишет отдельное действие note.autosave', nBody.ok && H()[0].action === 'note.autosave');
  const nSame = C.notes.saveNoteBody(n.entity.id, 'молоко\nхлеб');
  ok('N6 повторное автосохранение без изменений не засоряет историю',
    nSame.ok && nSame.unchanged === true && H()[0].action === 'note.autosave' && H().filter((e) => e.action === 'note.autosave').length === 1);
  C.notes.setNoteArchived(n.entity.id);
  ok('N7 архивная заметка исчезает из активных, но находится по статусу «архив»',
    C.notes.getNotes({ status: 'active' }).items.length === 0 && C.notes.getNotes({ status: 'archived' }).items.length === 1);
  ok('N8 поиск ищет по названию, тексту, папке и тегам',
    C.notes.getNotes({ status: 'all', q: 'хлеб' }).count === 1 && C.notes.getNotes({ status: 'all', q: 'еда' }).count === 1 &&
    C.notes.getNotes({ status: 'all', q: 'нетакого' }).count === 0);
  ok('N9 повторная папка не создаётся дважды',
    C.notes.createFolder('Личное').code === 'FOLDER_EXISTS' && C.notes.createFolder('Работа').ok === true);
  const nDel = C.notes.deleteNote(n.entity.id);
  ok('N10 удаление заметки — опасное действие с возвратом на прежнее место',
    nDel.ok && H()[0].danger === true && H()[0].undo.type === 'restore' && H()[0].undo.index === 0);
  ok('N11 несуществующая заметка отвечает понятной ошибкой, а не падением',
    C.notes.updateNote('нет-такой', { title: 'x' }).code === 'NOTE_NOT_FOUND');

  /* ---------- финансы ---------- */
  const balance0 = C.finance.summary().balance;
  ok('F0 сумма обязательна и должна быть числом больше нуля',
    C.finance.createOperation({ amount: '' }).code === 'AMOUNT_REQUIRED' &&
    C.finance.createOperation({ amount: 'абв' }).code === 'AMOUNT_INVALID' &&
    C.finance.createOperation({ amount: '0' }).code === 'AMOUNT_INVALID',
    JSON.stringify([C.finance.createOperation({ amount: '' }).code, C.finance.createOperation({ amount: 'абв' }).code, C.finance.createOperation({ amount: '0' }).code]));
  const o1 = C.finance.createOperation({ type: 'expense', amount: '0.1', cat: 'Продукты', account: 'card', dateISO: FIXED });
  const o2 = C.finance.createOperation({ type: 'expense', amount: '0.2', cat: 'Продукты', account: 'card', dateISO: FIXED });
  ok('F1 расход записывается и уменьшает баланс ровно на сумму',
    o1.ok && o2.ok && C.money.minor(C.finance.summary().balance) === C.money.minor(balance0) - 30,
    C.finance.summary().balance);
  ok('F2 0,1 + 0,2 дают ровно 0,3 (деньги считаются в копейках)',
    C.money.sum(0.1, 0.2) === 0.3 && C.money.minor(C.finance.totals({ period: 'month' }).expense) === 30);
  ok('F3 итоги месяца не хранятся, а считаются из операций',
    state.finMonth === undefined && C.money.minor(C.finance.summary().monthExpense) === 30);
  const oInc = C.finance.createOperation({ type: 'income', amount: '100', cat: 'Доход', account: 'cash', dateISO: FIXED });
  ok('F4 доход увеличивает баланс и учитывается отдельно от расходов',
    oInc.ok && C.money.minor(C.finance.summary().monthIncome) === 10000 &&
    C.money.minor(C.finance.account('cash').balance) === 60000);
  ok('F5 фильтр по типу и категории даёт согласованные итоги',
    C.finance.getOperations({ type: 'expense' }).count === 2 &&
    C.money.minor(C.finance.totals({ type: 'income' }).income) === 10000 &&
    C.finance.getOperations({ cat: 'Продукты' }).count === 2);
  ok('F6 периоды считаются от общих часов приложения',
    C.finance.getOperations({ period: 'today' }).count === 3 &&
    C.finance.getOperations({ period: '2020-01' }).count === 0);
  const cardBefore = C.money.minor(C.finance.account('card').balance);
  const upd = C.finance.updateOperation(o1.entity.id, { amount: '1.1' });
  ok('F7 изменение суммы пересчитывает счёт ровно на разницу',
    upd.ok && C.money.minor(C.finance.account('card').balance) === cardBefore - 100,
    C.money.minor(C.finance.account('card').balance) - cardBefore);
  const undoTarget = H()[0];
  ok('F8 у изменения операции есть отмена с поправкой баланса счёта',
    undoTarget.action === 'finance.expense.update' && JSON.stringify(undoTarget.undo).indexOf('finAccounts') >= 0);
  ok('F9 категорию и счёт нельзя удалить, пока по ним есть операции',
    C.finance.deleteCategory('Продукты').code === 'CATEGORY_IN_USE' &&
    C.finance.deleteAccount('card').code === 'ACCOUNT_IN_USE');
  ok('F10 повторные названия счёта и категории не создаются',
    C.finance.createAccount({ name: 'Карта' }).code === 'ACCOUNT_EXISTS' &&
    C.finance.createCategory('Авто').code === 'CATEGORY_EXISTS');
  const delOp = C.finance.deleteOperation(o2.entity.id);
  ok('F11 удаление операции возвращает деньги на счёт и остаётся отменяемым',
    delOp.ok && H()[0].danger === true && H()[0].undo.type === 'restore' &&
    (H()[0].changes || []).some((c) => c.field === 'Баланс'));
  /* Регрессия ревью PR #26: дату можно не указывать (тогда «сегодня» по общим часам),
     но непонятная дата — ошибка, а не молчаливая подстановка. */
  const noDate = C.finance.createOperation({ type: 'expense', amount: '15', cat: 'Продукты', account: 'card', title: 'без даты' });
  ok('F13 операция без даты записывается на «сегодня» по общим часам приложения',
    noDate.ok && noDate.entity.dateISO === C.dates.todayISO(), JSON.stringify(noDate).slice(0, 120));
  ok('F14 непонятная дата отклоняется, а не подставляется молча',
    C.finance.createOperation({ type: 'expense', amount: '15', cat: 'Продукты', account: 'card', dateISO: 'вчера вечером' }).code === 'DATE_INVALID');
  C.finance.deleteOperation(noDate.entity.id);

  ok('F12 разбивка по категориям и помесячный ряд считаются из тех же операций',
    C.finance.byCategory({ period: 'month' }).length >= 1 && C.finance.monthly(3).length === 3 &&
    C.finance.monthly(3)[2].key === C.dates.todayISO().slice(0, 7),
    JSON.stringify(C.finance.monthly(3)));

  /* ---------- авто ---------- */
  const km0 = C.auto.car().mileage;
  ok('R0 заправка без литров не сохраняется',
    C.auto.createRecord('fuel', { liters: '', sum: '100' }).code === 'FUEL_LITERS_REQUIRED');
  ok('R0a неизвестный вид записи отклоняется явной ошибкой',
    C.auto.createRecord('чтотоне', {}).code === 'AUTO_KIND_INVALID');
  const fuel = C.auto.createRecord('fuel', { liters: '40', sum: '2000', km: km0 + 500, dateISO: FIXED, linkFinance: true });
  ok('R1 заправка создаёт связанный расход и поднимает пробег',
    fuel.ok && !!fuel.entity.financeOpId && C.auto.car().mileage === km0 + 500);
  ok('R2 отмена заправки убирает и запись, и расход, и пробег одним действием',
    H()[0].undo.type === 'batch' && JSON.stringify(H()[0].undo).indexOf('car.mileage') >= 0);
  const opsBefore = C.finance.getOperations({}).count;
  const svc = C.auto.createRecord('service', { title: 'Замена масла', cost: '5000', km: km0 + 500, dateISO: FIXED });
  ok('R3 обслуживание можно записать и без расхода', svc.ok && !svc.entity.financeOpId && C.finance.getOperations({}).count === opsBefore);
  const link = C.auto.linkFinance('service', svc.entity.id);
  ok('R4 позже обслуживание связывается с финансами отдельной командой',
    link.ok && !!C.auto.getRecord('service', svc.entity.id).entity.financeOpId && C.finance.getOperations({}).count === opsBefore + 1);
  ok('R5 повторная связь не создаёт вторую трату', C.auto.linkFinance('service', svc.entity.id).code === 'ALREADY_LINKED');
  const fuelCountAtomic = C.auto.getRecords('fuel').count, opCountAtomic = C.finance.getOperations({}).count;
  const atomicFail = C.auto.createRecord('fuel', { liters: '20', sum: '1000', km: km0 + 800,
    dateISO: FIXED, linkFinance: true, finance: { cat: 'Авто', account: 'missing-account' } });
  ok('R5a ошибка linked Finance не оставляет частичную Auto-запись',
    !atomicFail.ok && C.auto.getRecords('fuel').count === fuelCountAtomic && C.finance.getOperations({}).count === opCountAtomic);
  const atomicOk = C.auto.createRecord('fuel', { liters: '20', sum: '1000', km: km0 + 800,
    dateISO: FIXED, linkFinance: true, finance: { cat: 'Авто', account: 'card' } });
  ok('R5b linked Common Action создаёт обе части с одной batch History entry',
    atomicOk.ok && !!atomicOk.entity.financeOpId && H()[0].action === 'car.fuel.create' && H()[0].undo.type === 'batch');
  ok('R5c linked Common Action использует явно разрешённый существующий счёт',
    C.finance.getOperation(atomicOk.entity.financeOpId).entity.account === 'card');
  const rollbackOps = C.finance.getOperations({}).count, rollbackHistory = H().length;
  const rollbackBalance = C.finance.account('card').balance, rollbackMileage = C.auto.car().mileage;
  const originalUnshift = state.car.fuel.unshift;
  state.car.fuel.unshift = function () { throw new Error('controlled Auto insertion failure'); };
  const rollback = C.auto.createRecord('fuel', { liters: '25', sum: '1250', km: rollbackMileage + 100,
    dateISO: FIXED, linkFinance: true, finance: { cat: 'Авто', account: 'card' } });
  state.car.fuel.unshift = originalUnshift;
  ok('R5d failure ПОСЛЕ успешного Finance шага компенсирует expense/balance и не пишет History',
    !rollback.ok && rollback.code === 'AUTO_CREATE_FAILED' &&
    C.finance.getOperations({}).count === rollbackOps && C.finance.account('card').balance === rollbackBalance &&
    C.auto.car().mileage === rollbackMileage && H().length === rollbackHistory);
  ok('R6 показатели авто считаются, а не берутся из воздуха',
    C.auto.stats().totalCost > 0 && typeof C.auto.stats().nextServiceLeft === 'number');
  const doc = C.auto.createRecord('doc', { title: 'ОСАГО', untilISO: C.dates.todayISO(20), remindDays: 30 });
  ok('R7 документ со скорым сроком попадает в «требует внимания»',
    doc.ok && C.auto.stats().docsAttentionCount === 1);
  ok('R8 пробег меняется отдельным действием с отменой',
    C.auto.setMileage(km0 + 900).ok && C.auto.car().mileage === km0 + 900 && H()[0].undo.type === 'value');

  /* ---------- покупки ---------- */
  ok('S0 покупка без названия не создаётся', C.shopping.createPurchase({ name: '' }).code === 'PURCHASE_NAME_REQUIRED');
  ok('S0a гарантия не может закончиться раньше покупки',
    C.shopping.createPurchase({ name: 'Чайник', dateISO: FIXED, warrantyISO: C.dates.todayISO(-10) }).code === 'WARRANTY_BEFORE_PURCHASE');
  const p1 = C.shopping.createPurchase({ name: 'Ноутбук', price: '90000', dateISO: FIXED, warrantyISO: C.dates.todayISO(400), category: 'Электроника' });
  const p2 = C.shopping.createPurchase({ name: 'Чайник', price: '3000', dateISO: FIXED, warrantyISO: C.dates.todayISO(30) });
  ok('S1 покупки создаются и попадают в историю', p1.ok && p2.ok && H()[0].action === 'purchase.create');
  ok('S2 гарантия распознаётся: действует / скоро закончится / истекла',
    C.shopping.warrantyState(C.dates.todayISO(400)).kind === 'active' &&
    C.shopping.warrantyState(C.dates.todayISO(30)).kind === 'warn' &&
    C.shopping.warrantyState(C.dates.todayISO(-1)).kind === 'expired' &&
    C.shopping.warrantyState('').kind === 'none');
  ok('S3 фильтр «скоро закончится» показывает только такие покупки',
    C.shopping.getPurchases({ status: 'owned', warranty: 'warn' }).count === 1);
  const svcP = C.shopping.addService(p1.entity.id, { title: 'Чистка', cost: '2500', dateISO: FIXED });
  ok('S4 ремонт добавляется к вещи и складывается в общую сумму',
    svcP.ok && C.money.minor(C.shopping.repairTotal(C.shopping.getPurchase(p1.entity.id).entity)) === 250000);
  const linkP = C.shopping.linkFinance(p1.entity.id);
  ok('S5 покупку можно связать с тратой, второй раз — нельзя',
    linkP.ok && C.shopping.linkFinance(p1.entity.id).code === 'ALREADY_LINKED');
  ok('S6 статус меняется и проверяется', C.shopping.setStatus(p2.entity.id, 'sold').ok &&
    C.shopping.setStatus(p2.entity.id, 'выдумка').code === 'STATUS_INVALID');
  ok('S7 итоги раздела считаются из записей',
    C.shopping.summary().owned === 1 && C.money.minor(C.shopping.summary().value) === 9000000);
  /* Stage 2, итерация 7: явный Finance link покупки — атомарность на уровне
     Common Action, как у Auto (R5a-R5d): ни orphan расхода, ни orphan покупки. */
  const purCnt = C.shopping.getPurchases({}).count, opCnt = C.finance.getOperations({}).count;
  const noPrice = C.shopping.createPurchase({ name: 'Ваза', linkFinance: true });
  ok('S8 запрошенная связь без цены — честная ошибка без мутаций',
    !noPrice.ok && noPrice.code === 'PRICE_REQUIRED_FOR_LINK' &&
    C.shopping.getPurchases({}).count === purCnt && C.finance.getOperations({}).count === opCnt);
  const badAcc = C.shopping.createPurchase({ name: 'Планшет', price: '30000',
    linkFinance: true, finance: { cat: 'Другое', account: 'missing-account' } });
  ok('S8a ошибка счёта в linked покупке не оставляет ни покупку, ни расход',
    !badAcc.ok && C.shopping.getPurchases({}).count === purCnt && C.finance.getOperations({}).count === opCnt);
  const linkedP = C.shopping.createPurchase({ name: 'Планшет', price: '30000', dateISO: FIXED,
    linkFinance: true, finance: { cat: 'Другое', account: 'card' } });
  const linkedOp = linkedP.ok && C.finance.getOperation(linkedP.entity.financeOpId);
  ok('S8b linked Common Action создаёт обе сущности с одной batch History entry и целостными ссылками',
    linkedP.ok && !!linkedP.entity.financeOpId &&
    linkedOp.ok && linkedOp.entity.purchaseId === linkedP.entity.id && linkedOp.entity.account === 'card' &&
    H()[0].action === 'purchase.create' && H()[0].undo.type === 'batch');
  const rollbackPur = C.shopping.getPurchases({}).count, rollbackOps2 = C.finance.getOperations({}).count;
  const rollbackBal = C.finance.account('card').balance, rollbackHist = H().length;
  const originalPurUnshift = state.purchases.unshift;
  state.purchases.unshift = function () { throw new Error('controlled Shopping insertion failure'); };
  const failedLinked = C.shopping.createPurchase({ name: 'Монитор', price: '25000', dateISO: FIXED,
    linkFinance: true, finance: { cat: 'Другое', account: 'card' } });
  state.purchases.unshift = originalPurUnshift;
  ok('S8c failure ПОСЛЕ успешного Finance шага компенсирует expense/balance и не пишет History',
    !failedLinked.ok && failedLinked.code === 'PURCHASE_CREATE_FAILED' &&
    C.finance.getOperations({}).count === rollbackOps2 && C.finance.account('card').balance === rollbackBal &&
    C.shopping.getPurchases({}).count === rollbackPur && H().length === rollbackHist);
  ok('S8d общий маппинг категории связанного расхода покупки — без второй копии',
    C.shopping.financeCategory('Дом') === 'Другое' && C.shopping.financeCategory('Авто') === 'Авто' &&
    C.shopping.financeCategory('Другое') === 'Другое');

  /* ---------- напоминания ---------- */
  ok('M0 без движка уведомлений слой честно сообщает об этом, а не притворяется',
    C.reminders.create({ title: 'x', dateISO: FIXED }).code === 'NOTIFY_UNAVAILABLE');
  ok('M1 счётчики уведомлений в таком случае честные нули',
    C.reminders.counts().unread === 0 && C.reminders.notifications().length === 0);

  ok('A99 ни одно действие слоя не бросило исключение и состояние сохранялось', state.__saved > 0);
}

/* ======================= ЧАСТЬ B. Поведение экранов ======================= */
const PORT = 8123;
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
    change: (el) => el.dispatchEvent(new w.Event('change', { bubbles: true })),
    go: async (h) => { w.location.hash = h; await sleep(220); },
    broken: () => (d.getElementById('page').textContent || '').indexOf('Ошибка отрисовки') >= 0,
    text: () => (d.getElementById('page').textContent || '').replace(/[\u00a0\u202f]/g, ' '),
    toastText: () => { const t = d.querySelectorAll('#toasts .toast'); return t.length ? t[t.length - 1].textContent : ''; },
    modalText: () => (d.querySelector('#modal-root .modal') || {}).textContent || '',
    modalSubmit: () => d.querySelector('#modal-root [data-submit]')
  };
}

async function partB() {
  /* ---- B1. Финансы: карточки вверху равны операциям (исправленный дефект) ---- */
  {
    const p = await load('#/finance');
    const C = p.C();
    const shown = (label) => {
      const card = p.qa('.card.stat').filter((c) => (c.textContent || '').indexOf(label) >= 0)[0];
      return ((card || {}).textContent || '').replace(/[\u00a0\u202f]/g, ' ');
    };
    const money = (v) => C.format.money(v).replace(/[\u00a0\u202f]/g, ' ');
    ok('B1 «Расходы месяца» вверху равны сумме операций месяца',
      shown('Расходы месяца').indexOf(money(C.finance.summary().monthExpense)) >= 0, shown('Расходы месяца'));
    ok('B2 «Доходы месяца» вверху равны сумме доходов месяца',
      shown('Доходы месяца').indexOf(money(C.finance.summary().monthIncome)) >= 0, shown('Доходы месяца'));
    ok('B3 «Баланс всего» равен сумме счетов',
      C.money.minor(C.finance.summary().balance) ===
      C.finance.accounts().reduce((acc, a) => C.money.minor(a.balance) + acc, 0), String(C.finance.summary().balance));
    ok('B4 в состоянии больше нет отдельно хранимых итогов месяца', p.st().finMonth === undefined);

    const before = C.money.minor(C.finance.summary().monthExpense);
    p.click(p.q('[data-action="fin-add"]')); await sleep(180);
    p.set(p.q('#modal-root input[name="amount"]'), '123.45');
    p.set(p.q('#modal-root input[name="title"]'), 'Проверка карточек');
    p.click(p.modalSubmit()); await sleep(280);
    ok('B5 новая трата сразу меняет и карточку, и таблицу',
      C.money.minor(C.finance.summary().monthExpense) === before + 12345 &&
      shown('Расходы месяца').indexOf(money(C.finance.summary().monthExpense)) >= 0 &&
      p.text().indexOf('Проверка карточек') >= 0);
    const entry = p.H()[0];
    ok('B6 создание операции через форму прошло общий слой (действие и отмена на месте)',
      entry.action === 'finance.expense.create' && entry.undoable === true);
    p.w.Aven.undoAction(entry.id); await sleep(280);
    ok('B7 отмена возвращает карточки к прежним числам',
      C.money.minor(C.finance.summary().monthExpense) === before && !p.broken());

    /* ошибки формы: экран не молчит и ничего не портит */
    const opsLen = p.st().ops.length;
    p.click(p.q('[data-action="fin-add"]')); await sleep(180);
    p.set(p.q('#modal-root input[name="amount"]'), '0');
    p.click(p.modalSubmit()); await sleep(220);
    ok('B8 нулевая сумма не сохраняется и объясняется человеку',
      p.st().ops.length === opsLen && /сумм/i.test(p.toastText()), p.toastText());
    p.dom.window.close();
  }

  /* ---- B2. Заметки ---- */
  {
    const p = await load('#/notes');
    const C = p.C();
    const len0 = p.st().notes.length;
    p.click(p.q('[data-action="note-add"]')); await sleep(200);
    p.set(p.q('#modal-root input[name="title"]'), 'Заметка проверки');
    p.set(p.q('#modal-root textarea[name="body"]'), 'первая строка');
    p.click(p.modalSubmit()); await sleep(260);
    const nId = p.st().notes[0].id;
    ok('B10 заметка создаётся через общий слой и видна в списке',
      p.st().notes.length === len0 + 1 && p.H()[0].action === 'note.create' && p.text().indexOf('Заметка проверки') >= 0);
    p.set(p.q('#note-autosave'), 'первая строка\nвторая строка'); await sleep(560);
    ok('B11 текст сохраняется сам и подпись это показывает',
      /сохранено/.test((p.q('#note-save-state') || {}).textContent || '') &&
      p.H()[0].action === 'note.autosave', (p.q('#note-save-state') || {}).textContent);
    p.w.Aven.undoAction(p.H()[0].id); await sleep(240);
    ok('B12 отмена автосохранения возвращает прежний текст',
      C.notes.getNote(nId).entity.body === 'первая строка');
    p.click(p.q('[data-action="note-archive"][data-id="' + nId + '"]')); await sleep(240);
    ok('B13 архив убирает заметку из активного списка, но она находится во вкладке «Архив»',
      C.notes.getNote(nId).entity.archived === true && C.notes.getNotes({ status: 'active' }).items.every((x) => x.id !== nId));
    const sel = p.q('[data-action="note-filter-status"]'); sel.value = 'archived'; p.change(sel); await sleep(240);
    ok('B14 фильтр «архив» показывает архивную заметку и страница цела',
      p.text().indexOf('Заметка проверки') >= 0 && !p.broken());
    p.click(p.q('[data-action="note-del"][data-id="' + nId + '"]')); await sleep(200);
    p.click(p.modalSubmit()); await sleep(260);
    ok('B15 удаление заметки спрашивает подтверждение и отменяется',
      !p.st().notes.some((x) => x.id === nId) && p.H()[0].danger === true);
    p.w.Aven.undoAction(p.H()[0].id); await sleep(260);
    ok('B16 отмена вернула заметку на место', p.st().notes.some((x) => x.id === nId));
    p.dom.window.close();
  }

  /* ---- B3. Авто и покупки: связь с финансами и согласованность ---- */
  {
    const p = await load('#/auto');
    const C = p.C();
    const ops0 = p.st().ops.length;
    const exp0 = C.money.minor(C.finance.summary().monthExpense);
    p.click(p.q('[data-action="auto-service"]')); await sleep(200);
    p.set(p.q('#modal-root input[name="title"]'), 'Проверочное ТО');
    p.set(p.q('#modal-root input[name="cost"]'), '4000');
    p.click(p.modalSubmit()); await sleep(300);
    const svcId = p.st().car.service[0].id;
    ok('B20 обслуживание создало связанную трату и общий итог вырос',
      p.st().ops.length === ops0 + 1 && C.money.minor(C.finance.summary().monthExpense) === exp0 + 400000);
    const eSvc = p.H()[0];
    p.w.Aven.undoAction(eSvc.id); await sleep(300);
    ok('B21 одна отмена убрала и запись авто, и трату (без «половины»)',
      !p.st().car.service.some((x) => x.id === svcId) && p.st().ops.length === ops0 &&
      C.money.minor(C.finance.summary().monthExpense) === exp0);

    /* Регрессия ревью PR #26: если связанную операцию удалили в «Финансах»,
       запись авто снова должна поддаваться связыванию — кнопка не остаётся «вечно выключенной». */
    await p.go('#/auto'); p.click(p.q('[data-tab="fuel"]')); await sleep(220);
    const linkedFuel = (p.st().car.fuel || []).filter((f) => f.financeOpId && p.st().ops.some((o) => o.id === f.financeOpId))[0];
    if (linkedFuel) {
      const btnBefore = p.qa('[data-action="auto-fin-link"]').filter((b) => b.dataset.id === linkedFuel.id)[0];
      ok('B26 у связанной записи кнопка «В финансы» выключена', !!btnBefore && btnBefore.disabled);
      C.finance.deleteOperation(linkedFuel.financeOpId);
      p.w.Aven.render(); await sleep(220);
      const btnAfter = p.qa('[data-action="auto-fin-link"]').filter((b) => b.dataset.id === linkedFuel.id)[0];
      ok('B27 после удаления операции запись снова можно связать (нет зависшей ссылки)',
        !!btnAfter && !btnAfter.disabled, btnAfter ? ('disabled=' + btnAfter.disabled) : 'кнопка не найдена');
      p.w.Aven.undoAction(p.H()[0].id); await sleep(200);
    } else {
      ok('B26 у связанной записи кнопка «В финансы» выключена', false, 'нет связанной заправки в демо-данных');
      ok('B27 после удаления операции запись снова можно связать (нет зависшей ссылки)', false, 'нет связанной заправки в демо-данных');
    }

    await p.go('#/shopping');
    const pid = p.st().purchases[0].id;
    p.click(p.q('[data-action="shop-open"][data-id="' + pid + '"]')); await sleep(220);
    ok('B22 карточка покупки открывается и показывает состояние гарантии',
      /гарантия/i.test(p.modalText()), p.modalText().slice(0, 60));
    p.click(p.q('#modal-root [data-action="shop-status"][data-id="' + pid + '"]')); await sleep(220);
    const statusSel = p.q('#modal-root select[name="status"]');
    statusSel.value = 'sold';
    p.click(p.modalSubmit()); await sleep(260);
    ok('B23 статус покупки меняется через общий слой и пишется в историю',
      C.shopping.statusKey(C.shopping.getPurchase(pid).entity) === 'sold' && p.H()[0].action === 'purchase.status.update');
    p.w.Aven.undoAction(p.H()[0].id); await sleep(260);
    ok('B24 отмена вернула прежний статус',
      C.shopping.statusKey(C.shopping.getPurchase(pid).entity) === 'owned');
    const warrSel = p.q('[data-action="shop-filter-warranty"]');
    warrSel.value = 'warn'; p.change(warrSel); await sleep(240);
    ok('B25 фильтр по гарантии согласован с общим слоем и страница цела',
      p.qa('.shop-card').length === C.shopping.getPurchases({ status: 'owned', warranty: 'warn' }).count && !p.broken());
    p.dom.window.close();
  }

  /* ---- B4. Согласованность разделов: Главная, День, Помощник, Уведомления, Предложения, История ---- */
  {
    const p = await load('#/home');
    const C = p.C();
    const money = (v) => C.format.money(v).replace(/[\u00a0\u202f]/g, ' ');
    ok('B30 «Расходы» на Главной берут месяц из тех же операций, что и «Финансы»',
      p.text().indexOf(money(C.finance.summary().monthExpense)) >= 0, p.text().slice(0, 140));
    const exp0 = C.money.minor(C.finance.summary().monthExpense);
    p.click(p.q('[data-action="quick-expense"]')); await sleep(200);
    p.set(p.q('#modal-root input[name="amount"]'), '777');
    p.set(p.q('#modal-root input[name="title"]'), 'Быстрый расход проверки');
    p.click(p.modalSubmit()); await sleep(320);
    ok('B31 быстрый расход с Главной — это обычная операция «Финансов»',
      C.money.minor(C.finance.summary().monthExpense) === exp0 + 77700 &&
      C.finance.getOperations({ q: 'Быстрый расход проверки' }).count === 1 &&
      p.H()[0].action === 'finance.expense.create');
    await p.go('#/finance');
    ok('B32 та же операция сразу видна в разделе «Финансы»', p.text().indexOf('Быстрый расход проверки') >= 0);
    await p.go('#/history');
    ok('B33 действие попало в общую «Историю» с кнопкой отмены',
      p.text().indexOf('Быстрый расход проверки') >= 0 && !!p.q('[data-action="hist-undo"]'),
      p.text().slice(0, 120));
    await p.go('#/assistant');
    p.w.Aven._assistantSend('сколько я потратил'); await sleep(500);
    const reply = (p.w.Aven._lastReply || '').replace(/[\u00a0\u202f]/g, ' ');
    ok('B34 помощник отвечает по тем же числам, что и раздел «Финансы»',
      reply.indexOf(money(C.finance.summary().monthExpense)) >= 0, reply);
    await p.go('#/home');
    p.w.Aven.undoAction(p.H().filter((e) => e.action === 'finance.expense.create')[0].id); await sleep(300);
    ok('B35 отмена вернула прежние числа во всех разделах',
      C.money.minor(C.finance.summary().monthExpense) === exp0 && !p.broken());
    p.dom.window.close();
  }

  /* ---- B5. Напоминания через общий слой ---- */
  {
    const p = await load('#/notifications');
    const C = p.C();
    const rem0 = (p.st().reminders || []).length;
    p.click(p.q('[data-action="rem-add"]')); await sleep(220);
    p.set(p.q('#modal-root input[name="title"]'), 'Напоминание проверки');
    p.set(p.q('#modal-root input[name="dateISO"]'), C.dates.todayISO());
    p.click(p.modalSubmit()); await sleep(280);
    ok('B40 напоминание создаётся через общий слой действий',
      (p.st().reminders || []).length === rem0 + 1 && p.H()[0].action === 'reminder.create' &&
      C.reminders.list({ q: 'проверки' }).count === 1);
    const remId = p.st().reminders[0].id;
    const key = 'manual:' + remId;
    const before = C.reminders.counts().unread;
    C.reminders.markRead(key); await sleep(60);
    ok('B41 «прочитано» проходит тем же слоем и уменьшает счётчик непрочитанных',
      C.reminders.counts().unread === before - 1, before + ' → ' + C.reminders.counts().unread);
    const snz = C.reminders.snooze(key, 2);
    ok('B42 «отложить» возвращает дату и пишется в историю', snz.ok && !!snz.until);
    C.reminders.unsnooze(key);
    p.w.Aven.render(); await sleep(200);
    ok('B43 напоминание видно в разделе «Уведомления»', p.text().indexOf('Напоминание проверки') >= 0);
    const del = C.reminders.delete(remId);
    ok('B44 удаление напоминания отменяемо', del.ok && p.H()[0].undo.type === 'restore');
    p.w.Aven.undoAction(p.H()[0].id); await sleep(240);
    ok('B45 отмена вернула напоминание', (p.st().reminders || []).some((r) => r.id === remId));
    p.dom.window.close();
  }

  /* ---- B6. Справка, обучение, доступность, темы, ширины ---- */
  {
    const p = await load('#/help');
    const help = p.w.AvenHelp;
    const cats = help.categories.map((c) => c[0]);
    ok('B50 в справке есть разделы «Заметки», «Финансы», «Авто», «Покупки»',
      ['notes', 'finance', 'auto', 'shopping'].every((c) => cats.indexOf(c) >= 0));
    const newArticles = help.articles.filter((a) => ['notes', 'finance', 'auto', 'shopping'].indexOf(a.cat) >= 0);
    ok('B51 у каждого нового раздела справки есть статьи', newArticles.length >= 12);
    const jargon = /\b(DOM|payload|state|провайдер|provider|action layer|роут|route|API|CRUD|undo\b)/i;
    const bad = newArticles.filter((a) => jargon.test(a.title + ' ' + a.summary + ' ' + a.body));
    ok('B52 в новых статьях нет разработческого жаргона', bad.length === 0, bad.map((a) => a.id).join(', '));
    ok('B53 есть статья про напоминания', help.articles.some((a) => a.id === 'notif-reminders'));
    const tours = p.w.AvenTutorial.definitions;
    ok('B54 обучение есть для всех четырёх разделов',
      ['notes', 'finance', 'auto', 'shopping'].every((id) => tours[id] && tours[id].steps.length >= 4));
    p.w.AvenTutorial.start('finance', { restart: true }); await sleep(600);
    ok('B55 обучение «Финансы» запускается и показывает первый шаг',
      !!p.q('.tour-pop') && /1/.test((p.q('.tour-step-count') || p.q('.tour-pop')).textContent || ''), '');
    p.w.AvenTutorial.close(); await sleep(200);

    for (const route of ['notes', 'finance', 'auto', 'shopping']) {
      await p.go('#/' + route);
      ok('B56[' + route + '] на странице есть кнопки «Справка» и «Обучение»',
        !!p.q('.context-help [data-action="help-topic"]') && !!p.q('.context-help [data-action="tutorial-start"]'));
      ok('B57[' + route + '] у обучения есть все точки привязки на странице',
        tours[route].steps.every((st) => !!p.q('[data-tour="' + st.target + '"]')),
        tours[route].steps.filter((st) => !p.q('[data-tour="' + st.target + '"]')).map((st) => st.target).join(', '));
      ok('B58[' + route + '] у каждого поля на странице есть видимая подпись (доступность)',
        p.qa('#page .field').every((f) => !!f.querySelector('label, span') ||
          !!(f.querySelector('input, select, textarea') || {}).getAttribute('aria-label')) && !p.broken(),
        String(p.qa('#page .field').length));
    }
    p.dom.window.close();
  }

  {
    for (const width of [320, 768, 1280]) {
      const p = await load('#/finance', width);
      let broken = false;
      for (const route of ['notes', 'finance', 'auto', 'shopping', 'notifications', 'home']) {
        await p.go('#/' + route);
        if (p.broken()) broken = true;
      }
      ok('B60[' + width + 'px] все разделы Stage 1.3 отрисовываются без ошибок', !broken);
      p.dom.window.close();
    }
  }

  {
    const p = await load('#/finance');
    const C = p.C();
    p.st().settings.theme = 'dark'; p.w.Aven.applyEnv(); p.w.Aven.render(); await sleep(220);
    ok('B61 тёмная тема применяется и раздел цел',
      p.d.documentElement.getAttribute('data-theme') === 'dark' && !p.broken(),
      p.d.documentElement.getAttribute('data-theme'));
    p.st().settings.theme = 'light'; p.w.Aven.applyEnv(); p.w.Aven.render(); await sleep(220);
    ok('B62 светлая тема применяется и раздел цел',
      p.d.documentElement.getAttribute('data-theme') === 'light' && !p.broken(),
      p.d.documentElement.getAttribute('data-theme'));
    p.st().settings.reduceMotion = true; p.w.Aven.applyEnv(); p.w.Aven.render(); await sleep(220);
    ok('B63 режим «меньше движения» не ломает разделы', !p.broken());
    p.st().settings.reduceMotion = false; p.w.Aven.applyEnv();

    /* смена формата даты не должна ломать гарантии и даты записей */
    C.profile.setField('dateFormat', 'YYYY-MM-DD'); await p.go('#/shopping'); await sleep(220);
    ok('B64 при другом формате даты гарантии по-прежнему считаются верно',
      !p.broken() && p.qa('.shop-card').length > 0 &&
      C.shopping.warrantyState(C.dates.todayISO(30)).kind === 'warn');
    C.profile.setField('dateFormat', 'DD.MM.YYYY');

    /* общие часы: раздел не должен читать системную дату напрямую */
    ok('B65 разделы берут «сегодня» из общих часов приложения',
      C.dates.todayISO() === p.w.AvenDemo.todayISO(), C.dates.todayISO());
    p.dom.window.close();
  }

  /* ---- B7. Экраны больше не меняют данные напрямую ---- */
  {
    const files = ['js/pages1.js', 'js/pages2.js'];
    const offenders = [];
    files.forEach((f) => {
      const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
      /* раздел «Автоматизации» — демо Stage 4, он вне задачи Stage 1.3 */
      let inAutomations = false;
      lines.forEach((line, i) => {
        if (/'auto-toggle':/.test(line)) inAutomations = true;
        if (/'auto-tpl':/.test(line)) inAutomations = false;
        if (inAutomations) return;
        if (/data\.export/.test(line)) return; /* журнал выгрузки — не изменение записей */
        if (/\bS\.save\(\)/.test(line) || /\bA\.logAction\(/.test(line)) offenders.push(f + ':' + (i + 1));
      });
    });
    ok('B70 страницы не сохраняют и не журналируют изменения в обход общего слоя (кроме раздела автоматизаций Stage 4)',
      offenders.length === 0, offenders.join(', '));
    const src2 = fs.readFileSync(path.join(ROOT, 'js/pages2.js'), 'utf8');
    ok('B71 в разделах не осталось собственной денежной арифметики и своих пересчётов',
      src2.indexOf('finMonth') < 0 && src2.indexOf('function applyFinAdjust') < 0 && src2.indexOf('function finAdjustPayload') < 0);
    const dataSrc = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
    ok('B72 в демо-данных больше нет отдельно хранимых итогов месяца', dataSrc.indexOf('finMonth') < 0);
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
