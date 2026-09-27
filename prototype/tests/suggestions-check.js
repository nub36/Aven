/* Suggestions regression: deterministic DOM-free rules, suppression/history and UI integration.
   Run: NODE_PATH=/tmp/aven-jsdom/node_modules node prototype/tests/suggestions-check.js */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Не найден jsdom. Запустите с временным NODE_PATH.'); process.exit(2); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8105;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); } }
async function load(hash) {
  const dom = await JSDOM.fromURL('http://127.0.0.1:' + PORT + '/index.html' + (hash || ''), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
  await sleep(850); const w = dom.window, d = w.document;
  return { dom, w, d, S: () => w.AvenSuggestions, st: () => w.AvenState.s(), q: (x) => d.querySelector(x), qa: (x) => Array.from(d.querySelectorAll(x)), text: (x) => (d.querySelector(x) || {}).textContent || '' };
}
(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  { /* deterministic public contract */
    const p = await load('#/home'), E = p.S(), C = p.w.AvenActions;
    const ctx = { surface: 'home', dateISO: C.dates.todayISO() };
    const a = E.getSuggestions(ctx), b = E.getSuggestions(ctx);
    ok('E1 engine зарегистрирован и DOM-free API доступен', !!E && typeof E.getSuggestions === 'function');
    ok('E2 generation deterministic', JSON.stringify(a) === JSON.stringify(b));
    ok('E3 stable IDs across repeated analysis', a.map((x) => x.id).join('|') === b.map((x) => x.id).join('|'));
    ok('E4 duplicate IDs prevented', new Set(a.map((x) => x.id)).size === a.length);
    ok('E5 priority ordering descending', a.every((x, i) => !i || a[i - 1].priorityScore >= x.priorityScore));
    ok('E6 every suggestion has user-facing explanation', a.length >= 3 && a.every((x) => x.reason && x.message && x.title));
    ok('E7 source entity references are structured', a.every((x) => x.source && x.source.entityType && Array.isArray(x.source.ids)));
    ok('E8 actions describe result', a.every((x) => x.actions.length && x.actions.every((y) => y.id && y.label)));
    ok('E9 no notification read model leaked into suggestions', a.every((x) => !Object.prototype.hasOwnProperty.call(x, 'read') && !Object.prototype.hasOwnProperty.call(x, 'unread')));
    delete p.st().suggestionState; E.getSuggestions(ctx);
    ok('E10 analysis does not mutate state', !Object.prototype.hasOwnProperty.call(p.st(), 'suggestionState'));
    p.st().settings.suggestions.enabled = false;
    ok('E11 disabled setting returns empty list', E.getSuggestions(ctx).length === 0);
  }

  { /* dismiss/snooze/persistence/history/undo */
    const p = await load('#/home'), E = p.S(), C = p.w.AvenActions, ctx = { surface: 'home', dateISO: C.dates.todayISO() };
    const item = E.getSuggestions(ctx)[0], id = item.id;
    const dr = E.dismiss(id, ctx);
    ok('S1 dismiss succeeds and removes suggestion', dr.ok && !E.getSuggestions(ctx).some((x) => x.id === id));
    ok('S2 dismiss persisted separately from derived data', p.st().suggestionState[id].dismissed === true && JSON.parse(p.w.localStorage.getItem('aven-proto-v1')).suggestionState[id].dismissed === true);
    const dh = p.st().history.find((h) => h.action === 'suggestion.dismiss');
    ok('S3 dismiss writes undoable History entry', !!dh && dh.undoable && dh.undo && dh.undo.type === 'value');
    p.w.Aven.undoAction(dh.id);
    ok('S4 Undo restores actual visibility', E.getSuggestions(ctx).some((x) => x.id === id));
    const sr = E.snooze(id, 1, ctx);
    ok('S5 snooze hides until a stable ISO date', sr.ok && /^\d{4}-\d{2}-\d{2}$/.test(sr.until) && !E.getSuggestions(ctx).some((x) => x.id === id));
    ok('S6 snooze persisted and logged', p.st().suggestionState[id].snoozeUntilISO === sr.until && p.st().history.some((h) => h.action === 'suggestion.snooze'));
    p.st().suggestionState[id].snoozeUntilISO = C.dates.todayISO();
    ok('S7 expired snooze becomes visible automatically', E.getSuggestions(ctx).some((x) => x.id === id));
    p.st().suggestionState[id].snoozeUntilISO = sr.until;
    ok('S8 explicit unsnooze restores suggestion', E.unsnooze(id).ok && E.getSuggestions(ctx).some((x) => x.id === id));
  }

  { /* Common Actions and automatic resolution */
    const p = await load('#/home'), E = p.S(), C = p.w.AvenActions;
    const tomorrow = C.dates.todayISO(1), ctx = { surface: 'day', dateISO: tomorrow };
    const prep = E.getSuggestions(ctx).find((x) => x.type === 'event-preparation');
    ok('A1 future event yields preparation proposal', !!prep && prep.source.entityType === 'event');
    const before = p.st().tasks.length, r = prep && E.perform(prep.id, 'create-prep-task', ctx);
    ok('A2 proposal action uses Common Task Action', !!r && r.ok && r.action === 'task.create' && p.st().tasks.length === before + 1);
    ok('A3 normal task history path records suggestion source', !!r && r.entry && r.entry.action === 'task.create' && r.entry.source === 'suggestion');
    ok('A4 condition resolves automatically after task exists', !E.getSuggestions(ctx).some((x) => prep && x.id === prep.id));
    p.w.Aven.undoAction(r.entry.id);
    ok('A5 Undo removes created task and proposal can return', p.st().tasks.length === before && E.getSuggestions(ctx).some((x) => x.id === prep.id));
    p.st().events = [];
    ok('A6 missing source entities do not crash and proposal disappears', Array.isArray(E.getSuggestions(ctx)) && !E.getSuggestions(ctx).some((x) => x.type === 'event-preparation'));
  }

  { /* Home/Day/UI, Help/Tutorial, semantic controls */
    const p = await load('#/home');
    ok('U1 Home shows bounded Suggestions block', !!p.q('[data-tour="home-suggestions"]') && p.qa('[data-tour="home-suggestions"] .suggest-card').length <= 3);
    ok('U2 cards show explicit reason and visible actions', p.qa('.suggest-card').every((x) => /Почему:/.test(x.textContent) && x.querySelector('button, a')));
    ok('U3 dismiss and snooze are real keyboard/touch controls', !!p.q('button[data-action="suggest-dismiss"]') && !!p.q('button[data-action="suggest-snooze"]'));
    ok('U4 Home distinguishes proposals from notifications', /Это не уведомления/.test(p.text('[data-tour="home-suggestions"]')));
    p.w.location.hash = '#/day'; await sleep(300);
    const dayText = p.text('[data-tour="day-suggestions"]');
    ok('U5 Day has selected-date suggestion context', /Предложения для выбранного дня/.test(dayText) && /сегодня/i.test(dayText));
    const tomorrow = p.w.AvenActions.dates.todayISO(1);
    p.w.Aven.actions['day-date']({ value: tomorrow }); await sleep(100);
    ok('U6 Day reuses its selected date, not a second date state', p.text('[data-tour="day-suggestions"] .s').toLowerCase().includes('завтра'));
    const articles = p.w.AvenHelp.articles.filter((x) => x.cat === 'suggestions');
    ok('U7 Help fully covers suggestions in human language', articles.length >= 5 && /отложить/i.test(articles.map((x) => x.body).join(' ')) && /уведомлен/i.test(articles.map((x) => x.body).join(' ')));
    ok('U8 Help avoids developer jargon in suggestion articles', !/\b(engine|payload|derived state|DOM|action layer)\b/i.test(articles.map((x) => x.body).join(' ')));
    const tour = p.w.AvenTutorial.definitions.suggestions;
    ok('U9 tutorial has complete seven-step scenario', !!tour && tour.steps.length === 7);
    ok('U10 tutorial includes reason/action/snooze/dismiss/distinction', /почему|причин/i.test(tour.steps.map((x) => x.text).join(' ')) && /отлож/i.test(tour.steps.map((x) => x.text).join(' ')) && /скры/i.test(tour.steps.map((x) => x.text).join(' ')) && /уведомлен/i.test(tour.steps.map((x) => x.text).join(' ')));
    ok('U11 tutorial keeps optional existing TTS path', typeof p.w.AvenTutorial.start === 'function' && Object.prototype.hasOwnProperty.call(p.w.AvenTutorial.store(), 'voice'));
  }

  { /* Responsive DOM invariants at required widths (jsdom has no layout engine). */
    const p = await load('#/home');
    [320, 360, 390, 412, 430, 768, 1280].forEach((width) => {
      Object.defineProperty(p.w, 'innerWidth', { value: width, configurable: true });
      p.w.dispatchEvent(new p.w.Event('resize'));
      p.w.Aven.render();
      const cards = p.qa('.suggest-card');
      ok('R' + width + ' Suggestions controls remain in DOM at ' + width + 'px', cards.length > 0 && cards.every((card) => card.querySelector('[data-action="suggest-snooze"]') && card.querySelector('[data-action="suggest-dismiss"]')));
    });
  }

  { /* Assistant is a read-only consumer, settings persist */
    const p = await load('#/assistant');
    ok('I1 Assistant reads suggestions without new NLP', !!p.q('.assistant-suggestions') && /Предложения по текущим данным/.test(p.text('.assistant-suggestions')));
    p.st().settings.suggestions.enabled = false; p.w.AvenState.save(); p.w.Aven.render();
    ok('I2 disabling suggestions removes Assistant suggestions', !p.q('.assistant-suggestions'));
    p.w.location.hash = '#/settings'; await sleep(250); p.w.Aven.openSettingsCat('home'); await sleep(80);
    ok('I3 Settings exposes one simple Suggestions toggle', !!p.q('input[data-path="settings.suggestions.enabled"]'));
  }

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  console.log('ПРИМЕЧАНИЕ: jsdom не подтверждает layout/touch в реальном Android-браузере.');
  server.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
