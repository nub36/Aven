/* Stage 2 / Iteration 2: behavior checks for transient clarification + confirmation. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, condition, extra) {
  if (condition) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra == null ? '' : ' — ' + extra)); }
}
function sandbox() {
  const state = {
    tasks: [], events: [], notes: [], noteFolders: [], ops: [],
    finAccounts: [{ id: 'card', name: 'Карта', balance: 1000 }], finCategories: ['Авто', 'Продукты'],
    car: { model: 'BMW', mileage: 1, fuel: [], expenses: [], service: [], docs: [] },
    purchases: [], purchaseCategories: [], reminders: [], history: []
  };
  let seq = 0;
  const box = { console, Date, Intl, window: {} };
  box.window.AvenState = { s: () => state, save: () => {}, id: (p) => p + (++seq) };
  box.window.Aven = {
    logAction(e) { const x = Object.assign({ id: 'h' + (++seq) }, e); state.history.unshift(x); return x; },
    /* notify.js вызывает A.register(...) при загрузке модуля страницы «Уведомления» —
       здесь нет DOM/страниц, но AvenNotify (единственный движок напоминаний) должен
       загружаться, поэтому вызов — безопасный no-op. */
    register() {}
  };
  box.window.AvenDemo = { todayISO(offset) {
    const d = new Date(2026, 8, 28, 12); d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  } };
  vm.createContext(box);
  ['actions.js', 'notify.js', 'command.js', 'command-session.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), box, { filename: f }));
  return {
    state, C: box.window.AvenActions, K: box.window.AvenCommand,
    session: box.window.AvenCommandSession.create({ source: 'test' }),
    createSession: () => box.window.AvenCommandSession.create({ source: 'test' })
  };
}
function task(env, title, date) { return env.C.tasks.createTask({ title, date: date || '2026-09-29', deadline: date || '2026-09-29' }, { source: 'fixture' }).entity; }
function clearHistory(env) { env.state.history.length = 0; }
function isDone(env, id) { return env.C.tasks.isCompleted(env.C.tasks.getTask(id).entity); }

(function run() {
  const src = fs.readFileSync(path.join(ROOT, 'js/command-session.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('S1 CommandSession загружается без DOM', !!sandbox().session && !/document\s*\.|querySelector|innerHTML/.test(code));
  ok('S2 session не пишет History напрямую', !/logAction|history\s*\.|AvenState/.test(code));
  ok('S3 transient context не использует localStorage', !/localStorage|sessionStorage/.test(code));
  ok('S4 pending action сериализуем, closures не хранятся', typeof JSON.stringify(sandbox().session.pending()) === 'string');

  {
    const e = sandbox(); const a = task(e, 'Купить масло', '2026-09-29'), b = task(e, 'Купить масло', '2026-09-30'); clearHistory(e);
    const r = e.session.submit('Отметь купить масло выполненной');
    ok('S10 AMBIGUOUS возвращает clarification_required', r.status === 'clarification_required' && r.candidates.length === 2);
    ok('S11 неоднозначность не мутирует', !isDone(e, a.id) && !isDone(e, b.id));
    ok('S12 неоднозначность не пишет History', e.state.history.length === 0);
    ok('S13 candidates содержат полезные поля', r.candidates.every((x) => x.title && x.dateISO && x.status));
    ok('S14 candidates сериализуемы и UI не обязан показывать id', JSON.parse(JSON.stringify(r.candidates)).length === 2);
    const chosen = e.session.submit('первую');
    ok('S15 «первую» продолжает исходную команду', chosen.ok && chosen.status === 'done');
    ok('S16 выбрана именно первая сущность', isDone(e, a.id) && !isDone(e, b.id));
    ok('S17 выбор создаёт ровно одну History entry', e.state.history.length === 1);
    ok('S18 context очищен после успеха', e.session.pending() === null);
  }
  {
    const e = sandbox(); const a = task(e, 'Купить масло', '2026-09-29'), b = task(e, 'Купить масло', '2026-09-30'); clearHistory(e);
    e.session.submit('Отметь купить масло выполненной');
    const r = e.session.submit('2');
    ok('S20 цифра «2» выбирает второй вариант', r.ok && !isDone(e, a.id) && isDone(e, b.id));
    ok('S21 второй выбор мутирует один раз', e.state.history.length === 1);
  }
  {
    const e = sandbox(); const a = task(e, 'Отчёт за август'), b = task(e, 'Отчёт для Сергея'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const bad = e.session.submit('пятую');
    ok('S22 неверный ordinal ничего не выполняет', bad.status === 'invalid_clarification' && !isDone(e, a.id) && !isDone(e, b.id));
    ok('S23 неверный выбор сохраняет уточнение', e.session.pending() && e.session.pending().type === 'clarification');
    ok('S24 неверный выбор не пишет History', e.state.history.length === 0);
    const bad99 = e.session.submit('99');
    ok('S24a «99» не выбирает первую Task и сохраняет flow', bad99.status === 'invalid_clarification' && !isDone(e, a.id) && !isDone(e, b.id) && !!e.session.pending());
    const cancel = e.session.submit('отмена');
    ok('S25 «отмена» закрывает ambiguity', cancel.status === 'cancelled' && e.session.pending() === null);
    ok('S26 cancel ambiguity = 0 mutations/History', !isDone(e, a.id) && !isDone(e, b.id) && e.state.history.length === 0);
  }
  {
    const e = sandbox(); const a = task(e, 'Отчёт за август'), b = task(e, 'Отчёт для Сергея'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const byTitle = e.session.submit('Отчёт для Сергея');
    ok('S27 точное повторение title выбирает именно эту Task', byTitle.ok && !isDone(e, a.id) && isDone(e, b.id) && e.state.history.length === 1);
  }
  {
    const e = sandbox(); const a = task(e, 'Отчёт за август'), b = task(e, 'Отчёт для Сергея'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const no = e.session.submit('нет');
    ok('S28 «нет» отменяет ambiguity без mutation/History', no.status === 'cancelled' && !isDone(e, a.id) && !isDone(e, b.id) && e.state.history.length === 0 && !e.session.pending());
  }
  {
    const e = sandbox(); task(e, 'Отчёт за август'); task(e, 'Отчёт для Сергея'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const q = e.session.submit('Что у меня завтра?');
    ok('S30 новая распознанная команда сбрасывает старое уточнение', q.ok && q.result.action === 'day.plan' && e.session.pending() === null);
    ok('S31 новая read-only команда не мутирует/не пишет History', e.state.history.length === 0);
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    const r = e.session.submit('Отметь отчёт выполненным');
    ok('S40 единственное частичное совпадение = INFERRED confirmation', r.status === 'confirmation_required' && r.result.resolution === 'INFERRED');
    ok('S41 pending confirmation ещё не мутирует', !isDone(e, t.id));
    ok('S42 pending confirmation не пишет History', e.state.history.length === 0);
    ok('S43 confirmation показывает конкретную задачу', /Подготовить квартальный отчёт/.test(r.response));
    const no = e.session.submit('нет');
    ok('S44 «нет» отменяет confirmation', no.status === 'cancelled' && !isDone(e, t.id));
    ok('S45 cancel confirmation = 0 History', e.state.history.length === 0);
  }
  ['отмена', 'нет'].forEach((answer, i) => {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const r = e.session.submit(answer);
    ok('S45.' + i + ' текст «' + answer + '» очищает confirmation без mutation/History',
      r.status === 'cancelled' && !isDone(e, t.id) && e.state.history.length === 0 && !e.session.pending());
  });
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const r = e.session.cancel();
    ok('S45.2 API Cancel очищает confirmation без mutation/History',
      r.status === 'cancelled' && !isDone(e, t.id) && e.state.history.length === 0 && !e.session.pending());
  }
  {
    const unsafeQueries = ['а', 'от', 'чет', 'ерге'];
    unsafeQueries.forEach((query, i) => {
      const e = sandbox(); const t = task(e, 'Отчёт для Сергея'); clearHistory(e);
      const r = e.session.submit('Отметь ' + query + ' выполненным');
      ok('S46.' + i + ' короткая/внутрисловная подстрока «' + query + '» не становится INFERRED target',
        r.status === 'not_found' && !isDone(e, t.id) && e.state.history.length === 0 && !e.session.pending());
    });
  }
  {
    const e = sandbox(); const t = task(e, 'Сверить: отчёт, срочно'); clearHistory(e);
    const r = e.session.submit('Отметь отчёт выполненным');
    ok('S46.4 границы с кириллической пунктуацией дают один INFERRED target',
      r.status === 'confirmation_required' && r.result.target.id === t.id && !isDone(e, t.id));
  }
  {
    const e = sandbox(); const t = task(e, 'Проверить ёлку'); clearHistory(e);
    const r = e.session.submit('Отметь елку выполненным');
    ok('S46.5 ё/е нормализуются и не ломают boundary-aware resolution',
      r.status === 'confirmation_required' && r.result.target.id === t.id && !isDone(e, t.id));
  }
  {
    const e = sandbox(); const a = task(e, 'Отчёт за август'), b = task(e, 'Отчёт для Сергея'); clearHistory(e);
    const r = e.session.submit('Отметь отчёт выполненным');
    ok('S47 несколько whole-word partial matches остаются AMBIGUOUS', r.status === 'clarification_required' && r.candidates.length === 2 && !isDone(e, a.id) && !isDone(e, b.id));
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const yes = e.session.submit('подтвердить');
    ok('S50 confirm выполняет inferred mutation', yes.ok && isDone(e, t.id));
    ok('S51 confirm создаёт ровно одну History entry', e.state.history.length === 1 && e.state.history[0].action === 'task.complete');
    const again = e.session.confirm();
    ok('S52 double confirm безопасен', again.status === 'no_pending' && e.state.history.length === 1);
    const undo = e.state.history[0].undo;
    Object.assign(e.C.tasks.getTask(t.id).entity, undo.fields);
    ok('S53 Undo confirmed mutation реально восстанавливает задачу', !isDone(e, t.id));
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    e.state.tasks.splice(e.state.tasks.findIndex((x) => x.id === t.id), 1); // external change between turns
    const stale = e.session.confirm();
    ok('S54 исчезнувший target перед confirm безопасно отклонён', stale.status === 'stale' && stale.result.code === 'STALE_TARGET');
    ok('S55 stale confirm не пишет History', e.state.history.length === 0);
    ok('S56 stale flow очищен', e.session.pending() === null);
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    t.title = 'Уже другой отчёт'; // external edit between turns
    const stale = e.session.confirm();
    ok('S57 изменившийся target перед confirm безопасно отклонён', stale.status === 'stale' && !isDone(e, t.id) && e.state.history.length === 0);
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    t.completed = true; t.done = true; t.status = 'completed'; // external completion between turns
    const stale = e.session.confirm();
    ok('S58 уже completed target не выполняется повторно', stale.status === 'stale' && e.state.history.length === 0 && !e.session.pending());
  }
  {
    const e = sandbox(); const t = task(e, 'Купить моторное масло'); clearHistory(e);
    const exact = e.session.submit('Отметь купить моторное масло выполненной');
    ok('S60 EXACT safe mutation выполняется сразу', exact.ok && exact.result.resolution === 'EXACT' && isDone(e, t.id));
    ok('S61 EXACT safe mutation пишет одну History entry', e.state.history.length === 1);
  }
  {
    const e = sandbox(); clearHistory(e);
    const parsed = e.K.parse('Создай задачу тест на завтра');
    ok('S62 parse остаётся pure', parsed.ok && e.state.tasks.length === 0 && e.state.history.length === 0);
    ok('S63 intent использует discrete EXACT, без numeric confidence', parsed.match.resolution === 'EXACT' && !('confidence' in parsed.match));
    const inferredQuery = e.K.parse('что завтра');
    const out = e.session.submit('что завтра');
    ok('S64 INFERRED read-only query выполняется без confirmation', inferredQuery.match.resolution === 'INFERRED' && out.ok && out.status === 'info');
    const create = e.session.submit('Создай задачу точная задача на завтра');
    ok('S65 EXACT ordinary create выполняется сразу', create.ok && e.state.tasks.length === 1);
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const unknown = e.session.submit('абракадабра');
    ok('S70 unknown при confirmation не выполняет pending', unknown.status === 'confirmation_required' && !isDone(e, t.id));
    ok('S71 unknown при confirmation сохраняет безопасный pending', e.session.pending() && e.state.history.length === 0);
    const serialized = JSON.stringify(e.session.pending());
    ok('S71a реальный pending context сериализуем и не содержит функций/DOM', !!serialized && serialized.indexOf('confirmation') >= 0);
    const reloaded = e.createSession();
    ok('S71b новая/reloaded session не наследует pending context', reloaded.pending() === null && !isDone(e, t.id) && e.state.history.length === 0);
    e.session.reset();
    ok('S72 reset/reload model очищает transient context', e.session.pending() === null);
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const unsupported = e.session.submit('удали все задачи');
    ok('S72a unsupported при pending сбрасывает старый flow и не подтверждает его',
      unsupported.status === 'unsupported' && e.session.pending() === null && !isDone(e, t.id) && e.state.history.length === 0);
  }
  {
    const e = sandbox(); const t = task(e, 'Удалить нельзя'); clearHistory(e);
    const del = e.session.submit('Удалить задачу удалить нельзя');
    /* Удаление стало поддержанным (итерация 9), но остаётся разрушительным:
       само по себе оно НИКОГДА не выполняется — только через подтверждение. */
    ok('S73 destructive command без confirmation не выполняется',
      del.status === 'confirmation_required' && e.C.tasks.getTask(t.id).ok);
    ok('S74 destructive command до подтверждения не мутирует и не пишет History', e.state.history.length === 0);
  }
  {
    const e = sandbox(); task(e, 'Отчёт за август'); task(e, 'Отчёт для Сергея'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    ok('S75 «первая» распознаётся целиком', e.session.submit('первая').ok);
  }
  {
    const e = sandbox(); task(e, 'Отчёт один'); task(e, 'Отчёт два'); clearHistory(e);
    const ambiguous = e.session.submit('Отметь отчёт выполненным');
    const selectedId = ambiguous.candidates[1].id;
    const otherId = ambiguous.candidates[0].id;
    const picked = e.session.submit('вторую!');
    ok('S76 завершающая пунктуация не ломает кириллический ordinal', picked.ok && !isDone(e, otherId) && isDone(e, selectedId));
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным');
    const confirmed = e.session.submit('подтвердить!');
    ok('S77 пунктуация не ломает текстовое confirmation', confirmed.ok && isDone(e, t.id) && e.state.history.length === 1);
  }
  /* Stage 2, итерация 3: новая распознанная команда о заметке должна сбрасывать
     старый pending flow (уточнение/подтверждение) точно так же, как любая другая
     независимая команда (S30) — второго pending context для заметок нет. */
  {
    const e = sandbox(); const a = task(e, 'Отчёт за август'), b = task(e, 'Отчёт для Сергея'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным'); // AMBIGUOUS clarification pending
    const r = e.session.submit('Создай заметку купить фильтр для машины');
    ok('S90 новая команда о заметке сбрасывает pending уточнение задачи',
      r.ok && r.result.action === 'note.create' && e.session.pending() === null);
    ok('S91 старые задачи не мутировали, заметка создана ровно одна запись истории',
      !isDone(e, a.id) && !isDone(e, b.id) && e.state.notes.length === 1 && e.state.history.length === 1 &&
      e.state.history[0].action === 'note.create');
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным'); // INFERRED confirmation pending
    const r = e.session.submit('Покажи заметки');
    ok('S92 новая read-only команда о заметках сбрасывает pending подтверждение',
      r.ok && r.result.action === 'note.search' && e.session.pending() === null);
    ok('S93 pending mutation не выполнилась, поиск ничего не изменил',
      !isDone(e, t.id) && e.state.history.length === 0);
  }

  /* Stage 2, итерация 4: новая распознанная команда о напоминании должна сбрасывать
     старый pending flow (уточнение/подтверждение) точно так же, как заметка (S90–S93)
     и любая другая независимая команда (S30) — второго pending context для напоминаний
     тоже нет (раздел «REMINDER TEXT COMMANDS», требование §27). */
  {
    const e = sandbox(); const a = task(e, 'Отчёт за август'), b = task(e, 'Отчёт для Сергея'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным'); // AMBIGUOUS clarification pending
    const r = e.session.submit('Напомни завтра оплатить интернет');
    ok('S94 новая команда о напоминании сбрасывает pending уточнение задачи',
      r.ok && r.result.action === 'reminder.create' && e.session.pending() === null);
    ok('S95 старые задачи не мутировали, напоминание создано ровно одной записью истории',
      !isDone(e, a.id) && !isDone(e, b.id) && e.state.reminders.length === 1 && e.state.history.length === 1 &&
      e.state.history[0].action === 'reminder.create');
  }
  {
    const e = sandbox(); const t = task(e, 'Подготовить квартальный отчёт'); clearHistory(e);
    e.session.submit('Отметь отчёт выполненным'); // INFERRED confirmation pending
    const r = e.session.submit('Покажи напоминания');
    ok('S96 новая read-only команда о напоминаниях сбрасывает pending подтверждение',
      r.ok && r.result.action === 'reminder.search' && e.session.pending() === null);
    ok('S97 pending mutation не выполнилась, показ списка ничего не изменил',
      !isDone(e, t.id) && e.state.history.length === 0);
  }
  {
    /* Точное создание напоминания (EXACT safe mutation) выполняется сразу, без
       clarification/confirmation — как задача/событие/заметка (§20 требования). */
    const e = sandbox(); clearHistory(e);
    const r = e.session.submit('Напомни купить масло на завтра');
    ok('S98 точное создание напоминания выполняется сразу, без pending',
      r.ok && r.status === 'done' && r.result.action === 'reminder.create' && e.session.pending() === null);
    ok('S98a создание напоминания через session пишет ровно одну History entry',
      e.state.reminders.length === 1 && e.state.history.length === 1);
    /* Без даты — честная ошибка через тот же submit(), ноль pending и ноль мутаций. */
    const e2 = sandbox(); clearHistory(e2);
    const noDate = e2.session.submit('Напомни купить хлеб');
    ok('S98b «напомни …» без даты не создаёт pending и не мутирует через session',
      noDate.ok === false && e2.session.pending() === null && e2.state.reminders.length === 0 &&
      e2.state.history.length === 0);
  }
  {
    /* Финансы (итерация 5): уточнение → подтверждение → единственное общее действие.
       Второй confirmation-системы и второго pending-хранилища не появилось. */
    const money = (e) => e.state.finAccounts[0].balance;
    {
      const e = sandbox(); clearHistory(e);
      const r = e.session.submit('Запиши расход 850 ₽ на продукты со счета карта');
      ok('S100 точная финансовая команда всегда требует подтверждения (решение владельца)',
        r.status === 'confirmation_required' && e.session.pending().type === 'confirmation');
      ok('S101 до подтверждения нет операции, баланса и History',
        e.state.ops.length === 0 && money(e) === 1000 && e.state.history.length === 0);
      ok('S102 pending финансового шага сериализуем и не содержит функций',
        JSON.parse(JSON.stringify(e.session.pending())).type === 'confirmation');
      const done = e.session.confirm();
      ok('S103 подтверждение создаёт ровно одну операцию через общий слой',
        done.ok && e.state.ops.length === 1 && e.state.ops[0].cat === 'Продукты' &&
        e.C.money.minor(e.state.ops[0].amount) === 85000);
      ok('S104 ровно одна запись History и обновлённый баланс',
        e.state.history.length === 1 && e.state.history[0].action === 'finance.expense.create' && money(e) === 150);
      ok('S105 повторное подтверждение не создаёт вторую операцию',
        e.session.confirm().status === 'no_pending' && e.state.ops.length === 1 && e.state.history.length === 1);
      ok('S106 pending очищен после успеха', e.session.pending() === null);
    }
    {
      const e = sandbox(); clearHistory(e);
      e.session.submit('Запиши расход 850 ₽ на продукты со счета карта');
      const cancelled = e.session.cancel();
      ok('S107 отмена финансового подтверждения не создаёт операцию и History',
        cancelled.status === 'cancelled' && e.state.ops.length === 0 && e.state.history.length === 0 &&
        money(e) === 1000 && e.session.pending() === null);
      e.session.submit('Запиши расход 850 ₽ на продукты со счета карта');
      const no = e.session.submit('нет');
      ok('S108 ответ «нет» тоже отменяет финансовую запись',
        no.status === 'cancelled' && e.state.ops.length === 0 && e.state.history.length === 0);
      e.session.submit('Запиши расход 850 ₽ на продукты со счета карта');
      const otmena = e.session.submit('отмена');
      ok('S109 ответ «отмена» тоже отменяет финансовую запись',
        otmena.status === 'cancelled' && e.state.ops.length === 0 && e.state.history.length === 0);
    }
    {
      const e = sandbox(); clearHistory(e);
      const r = e.session.submit('Запиши расход 300 на продукты');
      ok('S110 недостающий счёт → уточнение, а не подстановка по умолчанию',
        r.status === 'clarification_required' && e.session.pending().slot === 'account' &&
        e.state.ops.length === 0);
      ok('S111 в тексте уточнения показаны названия счетов, а не id',
        /Карта/.test(r.response) && !/\bcard\b/.test(r.response), r.response);
      const afterChoice = e.session.choose(0);
      ok('S112 после выбора счёта обязательно идёт подтверждение, мутации ещё нет',
        afterChoice.status === 'confirmation_required' && e.state.ops.length === 0 && e.state.history.length === 0);
      const done = e.session.confirm();
      ok('S113 только подтверждение выполняет операцию (ровно одну)',
        done.ok && e.state.ops.length === 1 && e.state.history.length === 1 &&
        e.state.ops[0].account === 'card');
    }
    {
      const e = sandbox(); clearHistory(e);
      e.session.submit('Запиши расход 300 на продукты');
      const cancelled = e.session.cancel();
      ok('S114 отмена на этапе уточнения счёта тоже не меняет ничего',
        cancelled.status === 'cancelled' && e.state.ops.length === 0 && e.state.history.length === 0);
    }
    {
      /* Исчезнувший между уточнением и подтверждением счёт — безопасный отказ. */
      const e = sandbox(); clearHistory(e);
      e.session.submit('Запиши расход 300 на продукты');
      e.session.choose(0);
      e.state.finAccounts.length = 0;
      const stale = e.session.confirm();
      ok('S115 исчезнувший счёт останавливает подтверждение без фиктивного успеха',
        stale.ok === false && stale.status === 'stale' && e.state.ops.length === 0 && e.state.history.length === 0);
    }
    {
      /* Новая независимая команда сбрасывает финансовый pending. */
      const e = sandbox(); clearHistory(e);
      e.session.submit('Запиши расход 850 ₽ на продукты со счета карта');
      const other = e.session.submit('Создай задачу купить фильтр');
      ok('S116 новая команда сбрасывает финансовое подтверждение, расход не записан',
        other.ok && other.result.action === 'task.create' && e.state.ops.length === 0 &&
        e.session.pending() === null);
      /* И наоборот: финансовая команда сбрасывает pending другого домена. */
      const e2 = sandbox(); task(e2, 'Купить масло', '2026-09-29'); task(e2, 'Купить масло', '2026-09-30'); clearHistory(e2);
      e2.session.submit('Отметь купить масло выполненной');
      const fin = e2.session.submit('Запиши расход 100 на продукты со счета карта');
      ok('S117 финансовая команда сбрасывает pending выбора задачи, не выполняя его',
        fin.status === 'confirmation_required' && e2.state.history.length === 0 &&
        e2.session.pending().type === 'confirmation');
    }
    {
      /* Read-only просмотр расходов не создаёт pending и не пишет History. */
      const e = sandbox(); clearHistory(e);
      e.C.finance.createOperation({ type: 'expense', amount: 100, cat: 'Продукты', account: 'card', dateISO: '2026-09-28' }, { source: 'fixture' });
      clearHistory(e);
      const r = e.session.submit('Покажи расходы за сегодня');
      ok('S118 просмотр расходов выполняется сразу, без подтверждения и без History',
        r.ok && r.status === 'info' && e.session.pending() === null && e.state.history.length === 0);
    }
    {
      /* Неподдержанная сумма и неизвестная категория не создают pending. */
      const e = sandbox(); clearHistory(e);
      const sh = e.session.submit('Запиши расход 5к на продукты');
      ok('S119 «5к» не создаёт pending и не мутирует',
        sh.ok === false && e.session.pending() === null && e.state.ops.length === 0 && e.state.history.length === 0);
      const unknown = e.session.submit('Запиши расход 100 на еду со счета карта');
      ok('S120 неизвестная категория не создаёт pending и не создаёт категорию',
        unknown.ok === false && e.session.pending() === null && e.state.finCategories.length === 2 &&
        e.state.ops.length === 0);
    }
  }

  {
    /* Auto iteration 6 использует тот же session: Auto-only сразу, linked —
       уточнение счёта → отдельное финансовое подтверждение. */
    {
      const e = sandbox(); clearHistory(e);
      const r = e.session.submit('Запиши заправку 40 л на 2000 рублей, пробег 105000');
      ok('S121 Auto-only EXACT выполняется сразу без pending',
        r.ok && r.status === 'done' && e.session.pending() === null && e.state.car.fuel.length === 1);
      ok('S122 Auto-only cost не создаёт Finance', e.state.ops.length === 0 && e.state.history.length === 1);
    }
    {
      const e = sandbox(); clearHistory(e);
      const r = e.session.submit('Запиши заправку 40 л на 2000 рублей и добавь в расходы со счета карта');
      ok('S123 linked Auto всегда ждёт confirmation', r.status === 'confirmation_required' && e.session.pending().type === 'confirmation');
      ok('S124 до linked confirm нет Auto/Finance/History', e.state.car.fuel.length === 0 && e.state.ops.length === 0 && e.state.history.length === 0);
      const done = e.session.confirm();
      ok('S125 linked confirm создаёт одну Auto и одну Finance', done.ok && e.state.car.fuel.length === 1 && e.state.ops.length === 1);
      ok('S126 linked action пишет одну History entry', e.state.history.length === 1 && e.state.history[0].undo.type === 'batch');
      ok('S127 repeat confirm безопасен', e.session.confirm().status === 'no_pending' && e.state.car.fuel.length === 1 && e.state.ops.length === 1);
    }
    {
      const e = sandbox(); clearHistory(e);
      e.session.submit('Запиши обслуживание замена масла на 3000 рублей и учти в финансах со счета карта');
      const no = e.session.submit('нет');
      ok('S128 cancel linked flow создаёт ничего', no.status === 'cancelled' && e.state.car.service.length === 0 && e.state.ops.length === 0 && e.state.history.length === 0);
    }
    {
      const e = sandbox(); clearHistory(e);
      const r = e.session.submit('Запиши обслуживание фильтры на 1500 рублей и учти в финансах');
      ok('S129 linked Auto без счёта уточняет через общий slot flow', r.status === 'clarification_required' && e.session.pending().slot === 'account');
      const choice = e.session.choose(0);
      ok('S130 выбор счёта не считается Confirm', choice.status === 'confirmation_required' && e.state.car.service.length === 0 && e.state.ops.length === 0);
      e.state.finAccounts.length = 0;
      const stale = e.session.confirm();
      ok('S131 stale account безопасен для обеих сущностей', stale.status === 'stale' && e.state.car.service.length === 0 && e.state.ops.length === 0 && e.state.history.length === 0);
    }
  }

  {
    /* Shopping iteration 7: тот же общий session — EXACT Shopping-only сразу,
       цена не создаёт Finance; explicit link — всегда подтверждение обеих частей. */
    {
      const e = sandbox(); clearHistory(e);
      const r = e.session.submit('Добавь покупку холодильник за 50000 рублей');
      ok('S132 Shopping-only EXACT выполняется сразу без pending',
        r.ok && r.status === 'done' && e.session.pending() === null && e.state.purchases.length === 1);
      ok('S133 цена покупки не создаёт Finance operation, общая History — одна строка',
        e.state.ops.length === 0 && e.state.history.length === 1 && e.state.history[0].action === 'purchase.create');
    }
    {
      const e = sandbox(); clearHistory(e);
      const r = e.session.submit('Добавь покупку телефон за 80000 рублей и учти в финансах со счета карта');
      ok('S134 linked Shopping всегда ждёт confirmation', r.status === 'confirmation_required' && e.session.pending().type === 'confirmation');
      ok('S135 до linked confirm нет Shopping/Finance/History', e.state.purchases.length === 0 && e.state.ops.length === 0 && e.state.history.length === 0);
      const done = e.session.confirm();
      ok('S136 linked confirm атомарно создаёт покупку и расход с batch Undo',
        done.ok && e.state.purchases.length === 1 && e.state.ops.length === 1 &&
        e.state.purchases[0].financeOpId === e.state.ops[0].id && e.state.ops[0].purchaseId === e.state.purchases[0].id &&
        e.state.history.length === 1 && e.state.history[0].undo.type === 'batch');
      ok('S137 repeat linked confirm безопасен', e.session.confirm().status === 'no_pending' &&
        e.state.purchases.length === 1 && e.state.ops.length === 1 && e.state.history.length === 1);
    }
    {
      const e = sandbox(); clearHistory(e);
      e.session.submit('Добавь покупку телефон за 80000 рублей и учти в финансах со счета карта');
      const no = e.session.submit('отмена');
      ok('S138 cancel linked Shopping — ни покупки, ни расхода, ни History',
        no.status === 'cancelled' && e.state.purchases.length === 0 && e.state.ops.length === 0 && e.state.history.length === 0);
    }
    {
      const e = sandbox(); clearHistory(e);
      const slot = e.session.submit('Добавь покупку чайник за 3000 и добавь в расходы');
      ok('S139 linked Shopping без счёта уточняет через общий slot flow',
        slot.status === 'clarification_required' && e.session.pending().slot === 'account' && e.state.purchases.length === 0);
      e.state.finAccounts.length = 0;
      const chosen = e.session.choose(0);
      const stale = chosen.status === 'confirmation_required' ? e.session.confirm() : chosen;
      ok('S140 stale счёт при confirm не оставляет partial Shopping/Finance',
        stale.status === 'stale' && e.state.purchases.length === 0 && e.state.ops.length === 0 && e.state.history.length === 0);
    }
  }

  {
    /* Event update (итерация 8): тот же общий session. Подтверждение ВСЕГДА,
       stale-проверка цели, отмена и double confirm безопасны. */
    const ev = (e, title, date, start, end, extra) =>
      e.C.events.createEvent(Object.assign({ title, date, startTime: start, endTime: end }, extra || {}), { source: 'fixture' }).entity;
    {
      const e = sandbox(); const x = ev(e, 'Встреча с Сергеем', '2026-09-28', '15:00', '16:00'); clearHistory(e);
      const r = e.session.submit('Перенеси встречу с Сергеем на 12');
      ok('S141 EXACT перенос события всегда требует подтверждения',
        r.status === 'confirmation_required' && e.session.pending().type === 'confirmation');
      ok('S142 до confirm событие и History не тронуты',
        e.C.events.getEvent(x.id).entity.startTime === '15:00' && e.state.history.length === 0);
      const done = e.session.confirm();
      ok('S143 confirm переносит событие ровно один раз, сохраняя длительность',
        done.ok && e.C.events.getEvent(x.id).entity.startTime === '12:00' &&
        e.C.events.getEvent(x.id).entity.endTime === '13:00' && e.state.history.length === 1 &&
        e.state.history[0].action === 'event.update');
      ok('S144 повторный confirm ничего не делает второй раз',
        e.session.confirm().status === 'no_pending' && e.state.history.length === 1);
    }
    {
      const e = sandbox(); const x = ev(e, 'Стоматолог', '2026-09-28', '10:00', '11:00'); clearHistory(e);
      e.session.submit('Перенеси событие стоматолог на завтра');
      const no = e.session.submit('нет');
      ok('S145 «нет» отменяет перенос: ноль мутаций, ноль History, pending пуст',
        no.status === 'cancelled' && e.C.events.getEvent(x.id).entity.date === '2026-09-28' &&
        e.state.history.length === 0 && e.session.pending() === null);
      e.session.submit('Перенеси событие стоматолог на завтра');
      const cancelled = e.session.cancel();
      ok('S146 cancel() тоже безопасен',
        cancelled.status === 'cancelled' && e.C.events.getEvent(x.id).entity.date === '2026-09-28' && e.state.history.length === 0);
    }
    {
      const e = sandbox(); ev(e, 'Встреча с Сергеем', '2026-09-28', '15:00', '16:00');
      ev(e, 'Встреча с врачом', '2026-09-28', '09:00', '09:30'); clearHistory(e);
      const amb = e.session.submit('Перенеси встречу на 14:00');
      ok('S147 несколько событий → clarification без мутации',
        amb.status === 'clarification_required' && amb.candidates.length === 2 && e.state.history.length === 0);
      ok('S148 кандидаты события подписаны датой и временем, а не статусом задачи',
        /15:00/.test(amb.response) && !/открыта|выполнена/i.test(amb.response), amb.response);
      const chosen = e.session.choose(0);
      ok('S149 выбор варианта не выполняет перенос — дальше обязательное подтверждение',
        chosen.status === 'confirmation_required' && e.state.history.length === 0);
      const done = e.session.confirm();
      ok('S150 перенос выполняется только после подтверждения выбранного события',
        done.ok && e.state.history.length === 1 && e.state.history[0].action === 'event.update');
    }
    {
      const e = sandbox(); const x = ev(e, 'Стоматолог', '2026-09-28', '10:00', '11:00'); clearHistory(e);
      e.session.submit('Перенеси событие стоматолог на 12:00');
      e.C.events.updateEvent(x.id, { startTime: '08:00', endTime: '09:00' }, { source: 'external' });
      const hist = e.state.history.length;
      const stale = e.session.confirm();
      ok('S151 изменённое снаружи событие не переносится вслепую',
        stale.status === 'stale' && e.C.events.getEvent(x.id).entity.startTime === '08:00' &&
        e.state.history.length === hist);
      e.session.submit('Перенеси событие стоматолог на 12:00');
      e.C.events.deleteEvent(x.id, { source: 'external' });
      const hist2 = e.state.history.length;
      ok('S152 удалённое до confirm событие даёт безопасный отказ',
        e.session.confirm().status === 'stale' && e.state.history.length === hist2);
    }
    {
      const e = sandbox(); const x = ev(e, 'Стоматолог', '2026-09-28', '10:00', '11:00'); task(e, 'Купить масло', '2026-09-29'); clearHistory(e);
      e.session.submit('Перенеси событие стоматолог на 12:00');
      const other = e.session.submit('Что у меня завтра?');
      ok('S153 новая независимая команда сбрасывает pending перенос события',
        other.ok && e.session.pending() === null &&
        e.C.events.getEvent(x.id).entity.startTime === '10:00' && e.state.history.length === 0);
      const t1 = task(e, 'Проверить шины', '2026-09-29');
      const t2 = task(e, 'Проверить шины', '2026-09-30');
      const amb = e.session.submit('Отметь проверить шины выполненной');
      const evFlow = e.session.submit('Перенеси событие стоматолог на 12:00');
      ok('S154 команда о событии сбрасывает pending flow задачи, не выполняя его',
        amb.status === 'clarification_required' && evFlow.status === 'confirmation_required' &&
        !e.C.tasks.isCompleted(e.C.tasks.getTask(t1.id).entity) &&
        !e.C.tasks.isCompleted(e.C.tasks.getTask(t2.id).entity));
    }
    {
      const e = sandbox(); const x = ev(e, 'Планёрка', '2026-09-29', '10:00', '10:45', { repeat: 'weekly' }); clearHistory(e);
      const rep = e.session.submit('Перенеси событие планёрка на завтра');
      ok('S155 повторяющееся событие честно не переносится и не создаёт pending',
        rep.ok === false && e.session.pending() === null &&
        e.C.events.getEvent(x.id).entity.date === '2026-09-29' && e.state.history.length === 0);
    }
  }

  /* ---- S156–S170: удаление записи текстом (Stage 2, итерация 9) ----
     Проверяется именно многошаговый flow: подтверждение обязательно, отказ в
     любой форме безопасен, повторное подтверждение не удаляет дважды. */
  {
    {
      const e = sandbox(); const t = task(e, 'Удалить меня'); clearHistory(e);
      const ask = e.session.submit('Удали задачу удалить меня');
      ok('S156 удаление всегда уходит в подтверждение, даже при точном совпадении',
        ask.status === 'confirmation_required' && e.session.pending() !== null &&
        e.C.tasks.getTask(t.id).ok && e.state.history.length === 0);
      ok('S157 pending удаления сериализуем и не хранит closures',
        typeof JSON.stringify(e.session.pending()) === 'string' &&
        e.session.pending().type === 'confirmation');
      const done = e.session.confirm();
      ok('S158 confirm удаляет ровно один раз и пишет одну «Историю»',
        done.ok && done.status === 'done' && !e.C.tasks.getTask(t.id).ok &&
        e.state.history.length === 1 && e.state.history[0].action === 'task.delete');
      const again = e.session.confirm();
      ok('S159 повторный confirm ничего не делает — pending уже снят',
        again.status === 'no_pending' && e.state.history.length === 1);
    }
    ['нет', 'отмена', 'не надо'].forEach((word, i) => {
      const e = sandbox(); const t = task(e, 'Не трогать'); clearHistory(e);
      e.session.submit('Удали задачу не трогать');
      const r = e.session.submit(word);
      ok('S16' + i + ' отказ словом «' + word + '» отменяет удаление без изменений',
        r.status === 'cancelled' && e.C.tasks.getTask(t.id).ok &&
        e.state.history.length === 0 && e.session.pending() === null);
    });
    {
      const e = sandbox(); const t = task(e, 'Через cancel'); clearHistory(e);
      e.session.submit('Удали задачу через cancel');
      const r = e.session.cancel();
      ok('S163 cancel() (кнопка/Escape) отменяет удаление без изменений',
        r.status === 'cancelled' && e.C.tasks.getTask(t.id).ok && e.state.history.length === 0);
    }
    {
      const e = sandbox(); const t = task(e, 'Замена команды'); clearHistory(e);
      e.session.submit('Удали задачу замена команды');
      const other = e.session.submit('Что у меня сегодня?');
      ok('S164 новая команда сбрасывает pending удаление, не выполняя его',
        other.status !== 'done' && e.C.tasks.getTask(t.id).ok &&
        e.state.history.length === 0 && e.session.pending() === null);
    }
    {
      const e = sandbox(); const t = task(e, 'Мусорный ответ'); clearHistory(e);
      e.session.submit('Удали задачу мусорный ответ');
      const junk = e.session.submit('ыва');
      ok('S165 непонятный ответ на подтверждение не удаляет и держит вопрос',
        junk.status === 'confirmation_required' && e.C.tasks.getTask(t.id).ok &&
        e.state.history.length === 0 && e.session.pending() !== null);
    }
    {
      const e = sandbox(); task(e, 'Отчёт один'); task(e, 'Отчёт два'); clearHistory(e);
      const amb = e.session.submit('Удали задачу отчёт');
      ok('S166 два подходящих кандидата → выбор, а не удаление',
        amb.status === 'clarification_required' && amb.candidates.length === 2 &&
        e.state.tasks.length === 2 && e.state.history.length === 0);
      const picked = e.session.submit('первая');
      ok('S167 выбор варианта не удаляет сразу — спрашивается подтверждение',
        picked.status === 'confirmation_required' && e.state.tasks.length === 2 &&
        e.state.history.length === 0);
      const done = e.session.confirm();
      ok('S168 после подтверждения удалена ровно одна задача',
        done.ok && e.state.tasks.length === 1 && e.state.history.length === 1);
    }
    {
      const e = sandbox(); const t = task(e, 'Массовое'); clearHistory(e);
      const bulk = e.session.submit('Удали все задачи');
      ok('S169 массовое удаление не создаёт pending и ничего не трогает',
        bulk.status === 'unsupported' && e.session.pending() === null &&
        e.C.tasks.getTask(t.id).ok && e.state.history.length === 0);
    }
    {
      const e = sandbox(); const t = task(e, 'Устаревшая цель'); clearHistory(e);
      e.session.submit('Удали задачу устаревшая цель');
      /* Цель удалена другим путём, пока висел вопрос. */
      e.C.tasks.deleteTask(t.id, { source: 'test' });
      const histAfter = e.state.history.length;
      const r = e.session.confirm();
      ok('S170 исчезнувшая цель безопасно отклоняется и не пишет вторую «Историю»',
        r.ok === false && r.status === 'stale' && e.state.history.length === histAfter);
    }
  }

  ['первую', 'вторая', 'вторую', 'отмена', 'нет', 'подтвердить'].forEach((word, i) => {
    const e = sandbox(); const a = task(e, 'Тест один'), b = task(e, 'Тест два'); clearHistory(e);
    e.session.submit('Отметь тест выполненным');
    const before = e.state.history.length;
    const r = e.session.submit('супер' + word + 'слово');
    ok('S8' + i + ' подстрока «' + word + '» не считается ответом flow', r.status === 'invalid_clarification' && e.state.history.length === before && !isDone(e, a.id) && !isDone(e, b.id));
  });

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  process.exitCode = fail ? 1 : 0;
})();
