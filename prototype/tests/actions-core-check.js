/* Проверка Common Action Layer задач/событий без DOM.
   Запуск из корня репозитория:
     node prototype/tests/actions-core-check.js
   Скрипт намеренно не создаёт document/jsdom: actions.js должен работать как слой
   state → business operation → result/history payload, пригодный для UI/Text/Voice. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const state = { tasks: [], events: [], history: [] };
let seq = 0;
const sandbox = {
  console,
  Date,
  Intl,
  window: {}
};
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
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'prototype/js/actions.js'), 'utf8'), sandbox, { filename: 'actions.js' });

const C = sandbox.window.AvenActions;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

const tomorrow = C.dates.todayISO(1);
const yesterday = C.dates.todayISO(-1);

ok('A1 слой загружен без document/jsdom', !!C && typeof sandbox.document === 'undefined');

const badTask = C.tasks.createTask({ title: '' }, { source: 'test' });
ok('T0 createTask без title возвращает error result', badTask.ok === false && badTask.code === 'TASK_TITLE_REQUIRED');

const cr = C.tasks.createTask({
  title: 'Купить масло', description: '5W-30', date: tomorrow, time: '10:00', deadline: tomorrow,
  priority: 'высокий', project: 'Авто', tags: ['авто', 'масло'], reminder: '1h'
}, { source: 'test' });
const taskId = cr.entity && cr.entity.id;
ok('T1 createTask создаёт задачу и структурированный result', cr.ok && cr.action === 'task.create' && taskId && cr.entity.completed === false);
ok('T2 createTask пишет историю с undo remove', state.history[0].action === 'task.create' && state.history[0].undo.type === 'remove');
ok('T3 getTasksForDate находит созданную задачу', C.tasks.getTasksForDate(tomorrow).items.some((t) => t.id === taskId));

const up = C.tasks.updateTask(taskId, { title: 'Купить масло и фильтр', priority: 'средний', tags: 'авто, ТО' }, { source: 'test' });
ok('T4 updateTask меняет поля и пишет action task.update', up.ok && up.entity.title.indexOf('фильтр') >= 0 && state.history[0].action === 'task.update');

const done = C.tasks.completeTask(taskId, { source: 'test' });
ok('T5 completeTask выставляет completed/done/status и action task.complete', done.ok && done.entity.done === true && done.entity.completed === true && done.entity.status === 'completed' && state.history[0].action === 'task.complete');
const reopen = C.tasks.reopenTask(taskId, { source: 'test' });
ok('T6 reopenTask возвращает active и action task.reopen', reopen.ok && reopen.entity.done === false && reopen.entity.status === 'active' && state.history[0].action === 'task.reopen');

C.tasks.createTask({ title: 'Старая задача', deadline: yesterday }, { source: 'test' });
ok('T7 getOverdueTasks возвращает просроченную активную задачу', C.tasks.getOverdueTasks(C.dates.todayISO()).items.some((t) => t.title === 'Старая задача'));

const del = C.tasks.deleteTask(taskId, { source: 'test' });
ok('T8 deleteTask удаляет и пишет undo restore', del.ok && !state.tasks.some((t) => t.id === taskId) && state.history[0].undo.type === 'restore');
ok('T9 task not-found возвращает TASK_NOT_FOUND', C.tasks.completeTask('missing').ok === false && C.tasks.deleteTask('missing').code === 'TASK_NOT_FOUND');

const badEvent = C.events.createEvent({ title: '' }, { source: 'test' });
ok('E0 createEvent без title возвращает error result', badEvent.ok === false && badEvent.code === 'EVENT_TITLE_REQUIRED');

const ev = C.events.createEvent({
  title: 'Встреча с Сергеем', date: tomorrow, startTime: '10:00', endTime: '11:00', place: 'Офис',
  category: 'Работа', color: '#4a7cf0', reminder: '15m', description: 'Обсудить договор'
}, { source: 'test' });
const eventId = ev.entity && ev.entity.id;
ok('E1 createEvent создаёт событие со startTime/endTime/reminder', ev.ok && ev.entity.startTime === '10:00' && ev.entity.endTime === '11:00' && ev.entity.reminder.minutesBefore === 15);
ok('E2 getEventsForDate находит событие', C.events.getEventsForDate(tomorrow).items.some((e) => e.id === eventId));
ok('E3 getNextEvent возвращает ближайшее событие', C.events.getNextEvent({ fromDate: C.dates.todayISO(), days: 7 }).ok === true);

const evUp = C.events.updateEvent(eventId, { startTime: '12:00', place: 'Zoom' }, { source: 'test' });
ok('E4 updateEvent меняет событие и пишет event.update', evUp.ok && evUp.entity.startTime === '12:00' && state.history[0].action === 'event.update');
const evDel = C.events.deleteEvent(eventId, { source: 'test' });
ok('E5 deleteEvent удаляет и пишет undo restore', evDel.ok && !state.events.some((e) => e.id === eventId) && state.history[0].undo.type === 'restore');
ok('E6 event not-found возвращает EVENT_NOT_FOUND', C.events.updateEvent('missing', { title: 'x' }).code === 'EVENT_NOT_FOUND' && C.events.deleteEvent('missing').ok === false);

console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
process.exit(fail ? 1 : 0);
