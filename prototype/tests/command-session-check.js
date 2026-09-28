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
  box.window.Aven = { logAction(e) { const x = Object.assign({ id: 'h' + (++seq) }, e); state.history.unshift(x); return x; } };
  box.window.AvenDemo = { todayISO(offset) {
    const d = new Date(2026, 8, 28, 12); d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  } };
  vm.createContext(box);
  ['actions.js', 'command.js', 'command-session.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), box, { filename: f }));
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
    ok('S73 destructive command без confirmation/поддержки невозможна', del.status === 'unsupported' && e.C.tasks.getTask(t.id).ok);
    ok('S74 unsupported не мутирует и не пишет History', e.state.history.length === 0);
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
