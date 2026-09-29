/* Tutorial 2.0 behavioral regression.
   NODE_PATH=/tmp/lab/node_modules node prototype/tests/tutorial2-interactive-check.js
   jsdom validates behavior/structure, not real pixel layout or Android touch rendering. */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Не найден jsdom@30 во временном NODE_PATH.'); process.exit(2); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8112;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
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
  else { fail++; console.log('FAIL  ' + name + (extra === undefined ? '' : ' — ' + extra)); }
}
async function load(hash, width) {
  const dom = await JSDOM.fromURL('http://127.0.0.1:' + PORT + '/index.html' + (hash || ''), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'innerWidth', { configurable: true, value: width || 1280 });
      Object.defineProperty(w, 'innerHeight', { configurable: true, value: 780 });
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.matchMedia = (q) => ({
        matches: /prefers-reduced-motion/.test(q) || (/max-width:\s*(\d+)px/.test(q) && (width || 1280) <= Number(/max-width:\s*(\d+)px/.exec(q)[1])),
        media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
      });
    }
  });
  await sleep(700);
  const w = dom.window, d = w.document;
  w.AvenState.s().settings.reduceMotion = true; w.Aven.applyEnv();
  return {
    dom, w, d, q: (x) => d.querySelector(x), qa: (x) => Array.from(d.querySelectorAll(x)),
    click(el) { return el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); },
    input(el, value) { el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
    key(el, key) { el.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); },
    text(x) { return (d.querySelector(x) || {}).textContent || ''; }, st() { return w.AvenState.s(); }
  };
}
(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  /* Reusable engine contract and lifecycle. */
  {
    const p = await load('#/home');
    const trigger = p.q('[data-action="tutorial-start"]') || p.q('[data-tour="command-bar"] input');
    trigger && trigger.focus();
    p.w.AvenTutorial.definitions.engine2 = {
      id: 'engine2', route: 'home', title: 'Engine test', steps: [
        { target: 'home-hero', title: 'Info', text: 'Old info contract.' },
        { target: () => p.d.getElementById('engine-target'), title: 'Action', text: 'Click target.', interaction: {
          event: 'click', success: '✓ Exact target accepted.', validate: ({ context }) => { context.accepted = (context.accepted || 0) + 1; return context.accepted === 1; }
        } },
        { target: 'home-summary', title: 'Done', text: 'Finished.' }
      ]
    };
    const btn = p.d.createElement('button'); btn.id = 'engine-target'; btn.textContent = 'Target'; p.d.body.appendChild(btn);
    ok('E1 old informational definition remains supported', p.w.AvenTutorial.start('engine2', { restart: true }));
    ok('E2 info step has enabled Next', !p.q('[data-action="tour-next"]').disabled);
    p.click(p.q('[data-action="tour-next"]')); await sleep(30);
    ok('E3 action step enters waiting state', p.w.AvenTutorial.current().waiting && /Теперь ваша очередь/.test(p.text('.tour-pop')));
    ok('E4 action step focuses exact target', p.d.activeElement === btn);
    ok('E5 required Next is disabled', p.q('[data-action="tour-next"]').disabled);
    ok('E6 API next cannot bypass required action', p.w.AvenTutorial.next() === false && p.w.AvenTutorial.current().step === 1);
    p.click(p.q('#theme-btn')); await sleep(20);
    ok('E7 wrong click does not advance', p.w.AvenTutorial.current().step === 1);
    ok('E8 wrong click gives friendly hint', /Попробуйте/.test(p.text('.tour-feedback')));
    p.click(btn); p.click(btn); await sleep(160);
    ok('E9 correct click advances', p.w.AvenTutorial.current().step === 2);
    ok('E10 double click does not skip two steps', /Done/.test(p.text('#tour-title')));
    ok('E11 success callback ran once', p.w.AvenTutorial.current().context.accepted === 1);
    ok('E12 progress is semantic', p.q('[role="progressbar"]').getAttribute('aria-valuenow') === '3');
    p.w.AvenTutorial.prev(); await sleep(20);
    ok('E13 Previous returns to action instruction', p.w.AvenTutorial.current().step === 1);
    ok('E14 completed action is represented honestly', /уже выполнено/.test(p.text('.tour-turn')));
    p.w.AvenTutorial.close(false);
    ok('E15 close removes layer/body lock', !p.q('.tour-layer') && !p.d.body.classList.contains('tour-open'));
    ok('E16 close restores prior focus', p.d.activeElement === trigger || p.d.activeElement === p.d.body);
    p.w.AvenTutorial.start('engine2', { restart: true });
    ok('E17 restart resets to first step and feedback', p.w.AvenTutorial.current().step === 0 && !p.text('.tour-feedback').trim());
    p.key(p.d.body, 'Escape'); await sleep(20);
    ok('E18 Escape closes tutorial', !p.w.AvenTutorial.isActive() && !p.q('.tour-layer'));
    p.w.AvenTutorial.start('engine2', { restart: true }); p.w.AvenTutorial.skip();
    ok('E19 Skip closes without completing', !p.w.AvenTutorial.isActive() && !p.st().tutorials.completed.engine2);
    p.w.AvenTutorial.start('engine2', { restart: true }); p.w.AvenTutorial.next(true); p.w.AvenTutorial.next(true); p.w.AvenTutorial.finish();
    ok('E20 Finish uses backward-compatible completed map', p.st().tutorials.completed.engine2 === true && p.st().tutorials.progress.engine2 === 0);
    p.st().tutorials.progress.home = 2; p.w.AvenTutorial.start('home');
    ok('E20a persisted informational progress remains backward-compatible', p.w.AvenTutorial.current().step === 2);
    p.w.AvenTutorial.close(false); p.st().tutorials.progress.engine2 = 1; p.w.AvenTutorial.start('engine2');
    ok('E20b stale persisted action checkpoint safely restarts scenario', p.w.AvenTutorial.current().step === 0);
    p.w.AvenTutorial.close(false);

    /* Delegation survives replacing the target node; old listeners do not accumulate. */
    let replacements = 0;
    p.w.AvenTutorial.definitions.replace2 = { id: 'replace2', route: 'home', title: 'Replace', steps: [
      { target: () => p.d.getElementById('replace-target'), title: 'Replace', text: 'Click.', interaction: {
        event: 'click', validate: () => ++replacements === 1, success: '✓ Replacement works.'
      } }, { target: 'home-hero', title: 'End', text: 'End.' }
    ] };
    btn.remove(); const old = p.d.createElement('button'); old.id = 'replace-target'; p.d.body.appendChild(old);
    p.w.AvenTutorial.start('replace2', { restart: true });
    const fresh = old.cloneNode(true); old.replaceWith(fresh); p.click(fresh); await sleep(150);
    ok('E21 replaced target is re-resolved', p.w.AvenTutorial.current().step === 1);
    ok('E22 replaced-target action transitions once', replacements === 1);
    p.w.AvenTutorial.close(false); p.click(fresh);
    ok('E23 listeners are removed after close', replacements === 1);

    p.w.AvenTutorial.definitions.missing2 = { id: 'missing2', route: 'home', title: 'Missing', steps: [
      { target: 'absent-2', title: 'Missing', text: 'No selector leakage.', interaction: { event: 'click', validate: () => false } },
      { target: 'home-hero', title: 'Safe', text: 'Continued.' }
    ] };
    p.w.AvenTutorial.start('missing2', { restart: true });
    ok('E24 missing target has graceful message', /Элемент сейчас не виден/.test(p.text('.tour-missing')) && !/absent-2/.test(p.text('.tour-pop')));
    ok('E25 missing target offers retry and continue', !!p.q('[data-action="tour-retry"]') && !!p.q('[data-action="tour-continue"]'));
    p.click(p.q('[data-action="tour-continue"]')); await sleep(20);
    ok('E26 missing required target can continue safely', p.w.AvenTutorial.current().step === 1);
    ok('E27 reduced-motion class remains effective', p.d.documentElement.classList.contains('reduce-motion'));
    ok('E28 spotlight root does not capture pointer events', /\.tour-layer[^}]*pointer-events:\s*none/.test(fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8')));
    p.w.AvenTutorial.close(false); p.dom.window.close();
  }

  /* Complete Tasks → History → correlated Undo vertical. */
  {
    const p = await load('#/tasks');
    const originalIds = p.st().tasks.map((x) => x.id), originalCount = originalIds.length;
    p.w.AvenTutorial.start('tasks', { restart: true });
    ok('T1 Tasks tutorial starts with explanation', p.w.AvenTutorial.current().step === 0);
    p.click(p.q('[data-action="tour-next"]')); await sleep(30);
    ok('T2 exact New Task control highlighted', p.q('[data-tour="task-create"]').classList.contains('tour-target-active'));
    ok('T3 Tasks waits for real click', p.w.AvenTutorial.current().waiting);
    p.click(p.q('[data-tour="task-create"]')); await sleep(150);
    ok('T4 real form opens', !!p.q('.modal') && !!p.q('[data-tour="task-title"]'));
    ok('T5 exact title input highlighted', p.q('[data-tour="task-title"]').classList.contains('tour-target-active'));
    p.input(p.q('[data-tour="task-title"]'), 'Учебная задача Aven'); p.q('[data-tour="task-title"]').dispatchEvent(new p.w.Event('change', { bubbles: true })); await sleep(150);
    ok('T6 non-empty input recognized', p.w.AvenTutorial.current().step === 3);
    ok('T7 exact Save target highlighted', p.q('[data-tour="task-submit"]').classList.contains('tour-target-active'));
    const submit = p.q('[data-tour="task-submit"]'); p.click(submit); p.click(submit); await sleep(220);
    const ctx = p.w.AvenTutorial.current().context;
    ok('T8 actual UI submit creates exactly one task', p.st().tasks.length === originalCount + 1, p.st().tasks.length);
    ok('T9 newly created task is correlated by new ID', !!ctx.taskId && originalIds.indexOf(ctx.taskId) < 0);
    ok('T10 duplicate existing title is not correlation strategy', ctx.taskTitle === 'Учебная задача Aven' && !!ctx.taskId);
    ok('T11 created Task is visible in Tasks', !!p.q('.task-row[data-id="' + ctx.taskId + '"]'));
    ok('T12 matching History entry captured', !!ctx.taskHistoryId && !!p.st().history.find((x) => x.id === ctx.taskHistoryId));
    p.click(p.q('[data-action="tour-next"]')); await sleep(30);
    ok('T13 History navigation is a required real action', p.w.AvenTutorial.current().waiting);
    p.click(p.q('[data-tour="nav-history"]')); await sleep(320);
    ok('T14 route transition survives and opens History', p.w.location.hash === '#/history' && p.w.AvenTutorial.isActive());
    ok('T15 exact correlated Undo button highlighted', !!p.q('[data-action="hist-undo"][data-id="' + ctx.taskHistoryId + '"]'));
    p.click(p.q('[data-action="hist-undo"][data-id="' + ctx.taskHistoryId + '"]')); await sleep(200);
    ok('T16 Undo removes the taught entity', !p.st().tasks.some((x) => x.id === ctx.taskId));
    ok('T17 Undo does not remove unrelated tasks', originalIds.every((id) => p.st().tasks.some((x) => x.id === id)));
    ok('T18 matching History action is marked undone', p.st().history.some((x) => x.id === ctx.taskHistoryId && x.undone));
    ok('T19 final feedback explains causal result', /сами отменили именно это действие/.test(p.text('.tour-pop')));
    p.w.AvenTutorial.finish();
    ok('T20 Tasks completion persists in existing schema', p.st().tutorials.completed.tasks === true);

    p.w.location.hash = '#/tasks'; await sleep(260);
    p.w.AvenTutorial.start('tasks', { restart: true }); p.click(p.q('[data-action="tour-next"]')); p.click(p.q('[data-tour="task-create"]')); await sleep(140);
    p.key(p.d.body, 'Escape'); await sleep(30);
    ok('T21 Escape closes Tutorial without also closing business form', !p.w.AvenTutorial.isActive() && !!p.q('.modal'));
    p.w.Aven.closeModal();

    p.w.AvenTutorial.start('tasks', { restart: true }); p.click(p.q('[data-action="tour-next"]')); p.click(p.q('[data-tour="task-create"]')); await sleep(140);
    p.input(p.q('[data-tour="task-title"]'), 'Учебная задача остаётся после Skip'); p.q('[data-tour="task-title"]').dispatchEvent(new p.w.Event('change', { bubbles: true })); await sleep(140);
    p.click(p.q('[data-tour="task-submit"]')); await sleep(200);
    const keptId = p.w.AvenTutorial.current().context.taskId;
    p.w.AvenTutorial.skip();
    ok('T22 Skip never silently deletes a completed real action', !!keptId && p.st().tasks.some((x) => x.id === keptId));
    ok('T23 Skip does not secretly mark matching History action undone', p.st().history.some((x) => x.undo && x.undo.id === keptId && !x.undone));
    ok('T24 page remains usable after Skip', !p.q('.tour-layer') && !p.d.body.classList.contains('tour-open'));
    p.dom.window.close();
  }

  /* Assistant read-only vertical, including retry. */
  {
    const p = await load('#/assistant');
    const beforeTasks = p.st().tasks.map((x) => x.id).join('|'), beforeHistory = p.st().history.length;
    p.w.AvenTutorial.start('commands', { restart: true });
    ok('C1 Commands tutorial starts in Assistant', p.w.location.hash === '#/assistant' && p.w.AvenTutorial.current().step === 0);
    p.click(p.q('[data-action="tour-next"]')); await sleep(30);
    ok('C2 exact Assistant input is highlighted', p.q('#chat-input').classList.contains('tour-target-active'));
    p.input(p.q('#chat-input'), 'неподдерживаемая команда'); await sleep(30);
    ok('C3 unsupported text does not falsely advance', p.w.AvenTutorial.current().step === 1);
    p.input(p.q('#chat-input'), 'Что у меня сегодня?'); await sleep(150);
    ok('C4 supported read-only text advances to send', p.w.AvenTutorial.current().step === 2);
    ok('C5 send step waits for real response', p.w.AvenTutorial.current().waiting);
    const form = p.q('#cmd-form');
    form.dispatchEvent(new p.w.Event('submit', { bubbles: true, cancelable: true }));
    await sleep(600);
    ok('C6 Enter/form submit uses real Command Engine', !!p.w.Aven._lastCommand && p.w.Aven._lastCommand.intent.kind === 'query');
    ok('C7 engine waited for and validated response', p.w.AvenTutorial.current().step === 3);
    ok('C8 positive feedback/result is shown', /Ответ уже в диалоге/.test(p.text('.tour-pop')) && /сегодня/i.test(p.text('#chat')));
    ok('C9 read-only lesson creates no business mutation', p.st().tasks.map((x) => x.id).join('|') === beforeTasks);
    ok('C10 read-only lesson creates no History entry', p.st().history.length === beforeHistory);
    p.w.AvenTutorial.prev(); await sleep(30);
    ok('C11 Previous does not mutate data or fake Undo', p.st().history.length === beforeHistory && p.st().tasks.map((x) => x.id).join('|') === beforeTasks);
    p.w.AvenTutorial.close(false);
    ok('C12 close leaves Assistant interactive', !p.q('.tour-layer') && !p.q('#chat-input').hasAttribute('inert'));
    p.dom.window.close();
  }

  /* Mobile structure at the required widths. */
  for (const width of [320, 360, 390, 412, 430]) {
    const p = await load('#/tasks', width); p.w.AvenTutorial.start('tasks', { restart: true });
    ok('M' + width + ' mobile card presentation selected', p.q('.tour-pop').classList.contains('tour-pop-mobile'));
    ok('M' + width + ' controls remain present', !!p.q('[data-action="tour-next"]') && !!p.q('[data-action="tour-skip"]') && !!p.q('[data-action="tour-close"]'));
    ok('M' + width + ' card avoids fixed oversized width', /calc\(100vw - 24px\)/.test(fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8')));
    p.w.AvenTutorial.close(false); p.dom.window.close();
  }

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  console.log('ПРИМЕЧАНИЕ: jsdom не является real-browser/mobile pixel validation.');
  server.close(); process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); server.close(); process.exitCode = 1; });
