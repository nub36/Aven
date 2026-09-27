/* Проверка Help Center, responsive navigation и reusable Tutorial engine.
   Запуск:
     NODE_PATH=/tmp/lab/node_modules node prototype/tests/help-tutorial-check.js
   jsdom используется только как regression smoke; реальный responsive дополнительно проверяется Playwright/manual. */
let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.error('Не найден jsdom. Запустите с NODE_PATH=/tmp/lab/node_modules после npm install jsdom@30.');
  process.exit(2);
}
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8101;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const BASE = 'http://127.0.0.1:' + PORT + '/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
async function load(hash, opts) {
  opts = opts || {};
  const width = opts.width;
  const dom = await JSDOM.fromURL(BASE + 'index.html' + (hash || ''), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(win) {
      if (width) {
        Object.defineProperty(win, 'innerWidth', { configurable: true, value: width });
        Object.defineProperty(win, 'innerHeight', { configurable: true, value: opts.height || 780 });
        win.matchMedia = (q) => ({ matches: /max-width:\s*(\d+)px/.test(q) ? width <= Number(/max-width:\s*(\d+)px/.exec(q)[1]) : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      }
    }
  });
  await sleep(750);
  const w = dom.window, d = w.document;
  return {
    dom, w, d,
    q: (sel) => d.querySelector(sel),
    qa: (sel) => Array.from(d.querySelectorAll(sel)),
    click: (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })),
    input: (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
    go: async (h) => { w.location.hash = h; await sleep(220); },
    text: (sel) => (d.querySelector(sel) || {}).textContent || '',
    st: () => w.AvenState.s()
  };
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  ok('R1 CSS не использует body overflow-x:hidden как основной responsive fix', !/body\s*\{[^}]*overflow-x\s*:\s*hidden/i.test(css));
  ok('R2 CSS содержит drawer mobile navigation вместо бесконечного сжатия sidebar', /body\.nav-open \.sidebar/.test(css) && /mobile-menu-btn/.test(css));
  ok('R3 Calendar Month использует repeat(7, minmax(0, 1fr)) для shrink', /cal-grid\s*\{[^}]*repeat\(7, minmax\(0, 1fr\)\)/s.test(css));

  for (const width of [360, 390, 430]) {
    const p = await load('#/calendar', { width });
    ok('R4 viewport ' + width + ': календарь рендерится с compact nav controls', !!p.q('#mobile-menu-btn') && !!p.q('.cal-grid') && !/Ошибка отрисовки/.test(p.text('#page')));
    p.w.AvenTutorial.start('calendar', { restart: true }); await sleep(180);
    ok('R5 viewport ' + width + ': tutorial становится mobile bottom sheet', p.q('.tour-pop') && p.q('.tour-pop').classList.contains('tour-pop-mobile'));
    p.w.AvenTutorial.close(false);
    p.dom.window.close();
  }

  {
    const p = await load('#/help');
    ok('H1 Help route opens', /Помощь/.test(p.text('h1')) && !/Ошибка отрисовки/.test(p.text('#page')));
    ok('H2 Help categories render', p.qa('.help-cat').length >= 8, p.qa('.help-cat').length);
    ok('H3 Help search field exists and is labelled', !!p.q('#help-q') && /Поиск/.test(p.text('[data-tour="help-search"]')));
    p.input(p.q('#help-q'), 'reminder'); await sleep(100);
    ok('H4 Help local search filters articles', /Reminder metadata/.test(p.text('.help-main')) && !/Что такое Aven/.test(p.text('.help-main')), p.text('.help-main').slice(0, 120));
    ok('H5 Help page has tutorial launcher', !!p.q('[data-action="tutorial-start"][data-tour-id="help"]'));
    p.dom.window.close();
  }

  {
    const p = await load('#/tasks');
    ok('C1 Contextual help action is present on Tasks', !!p.q('[data-action="help-topic"][data-topic="tasks"]'));
    p.click(p.q('[data-action="help-topic"][data-topic="tasks"]')); await sleep(300);
    ok('C2 Contextual help opens Help on matching category', p.w.location.hash === '#/help' && /Задачи/.test(p.text('.help-side .help-cat.active')), p.w.location.hash + ' / ' + p.text('.help-side .help-cat.active'));
    p.dom.window.close();
  }

  {
    const p = await load('#/home');
    ok('M1 Mobile menu button exists', !!p.q('#mobile-menu-btn'));
    p.click(p.q('#mobile-menu-btn')); await sleep(80);
    ok('M2 Mobile nav toggles body.nav-open and aria-expanded', p.d.body.classList.contains('nav-open') && p.q('#mobile-menu-btn').getAttribute('aria-expanded') === 'true');
    p.click(p.q('#nav-backdrop')); await sleep(80);
    ok('M3 Mobile nav closes from backdrop', !p.d.body.classList.contains('nav-open') && p.q('#mobile-menu-btn').getAttribute('aria-expanded') === 'false');
    p.dom.window.close();
  }

  {
    const p = await load('#/home');
    ok('T1 Tutorial engine is loaded with definitions', !!p.w.AvenTutorial && !!p.w.AvenTutorial.definitions.tasks);
    p.w.AvenTutorial.start('home', { restart: true }); await sleep(250);
    ok('T2 Tutorial start renders overlay/popover', !!p.q('.tour-layer') && /шаг 1\/4/.test(p.text('.tour-pop')), p.text('.tour-pop'));
    p.click(p.q('[data-action="tour-next"]')); await sleep(160);
    ok('T3 Tutorial next advances and persists progress', /шаг 2\/4/.test(p.text('.tour-pop')) && p.st().tutorials.progress.home === 1, p.text('.tour-pop'));
    p.click(p.q('[data-action="tour-prev"]')); await sleep(160);
    ok('T4 Tutorial previous returns to first step', /шаг 1\/4/.test(p.text('.tour-pop')));
    p.click(p.q('[data-action="tour-skip"]')); await sleep(160);
    ok('T5 Tutorial skip closes overlay without blocking page', !p.q('.tour-layer') && !/Ошибка отрисовки/.test(p.text('#page')));
    p.dom.window.close();
  }

  {
    const p = await load('#/help');
    p.w.AvenTutorial.start('help', { restart: true }); await sleep(160);
    p.click(p.q('[data-action="tour-next"]')); await sleep(120);
    p.click(p.q('[data-action="tour-next"]')); await sleep(120);
    p.click(p.q('[data-action="tour-finish"]')); await sleep(160);
    ok('T6 Tutorial finish stores completion', p.st().tutorials.completed.help === true && !p.q('.tour-layer'));
    p.w.AvenTutorial.start('help', { restart: true }); await sleep(160);
    ok('T7 Tutorial restart begins from step one', /шаг 1\/3/.test(p.text('.tour-pop')), p.text('.tour-pop'));
    p.w.AvenTutorial.close(false);
    p.dom.window.close();
  }

  {
    const p = await load('#/home');
    p.w.AvenTutorial.definitions.missing = { id: 'missing', route: 'home', title: 'Missing', steps: [{ target: 'no-such-target', title: 'Missing target', text: 'No crash.' }] };
    p.w.AvenTutorial.start('missing', { restart: true }); await sleep(180);
    ok('T8 Missing target does not crash engine', !!p.q('.tour-missing') && /No crash/.test(p.text('.tour-pop')));
    await p.go('#/tasks');
    ok('T9 Route change cleans up active tutorial', !p.q('.tour-layer'));
    p.dom.window.close();
  }

  {
    const p = await load('#/home');
    let spoken = 0, stopped = 0;
    p.w.AvenVoice.speak = () => { spoken++; return true; };
    p.w.AvenVoice.stop = () => { stopped++; };
    p.st().tutorials = { voice: true, progress: {}, completed: {} };
    p.w.AvenTutorial.start('home', { restart: true }); await sleep(180);
    ok('V1 Tutorial narration uses existing AvenVoice when enabled', spoken === 1, spoken);
    p.click(p.q('[data-action="tour-next"]')); await sleep(180);
    ok('V2 Next step stops previous narration before speaking new step', stopped >= 1 && spoken >= 2, 'spoken=' + spoken + ', stopped=' + stopped);
    p.click(p.q('[data-action="tour-voice"]')); await sleep(120);
    ok('V3 Voice guidance toggle disables narration', p.st().tutorials.voice === false);
    p.w.AvenTutorial.close(false);
    p.dom.window.close();
  }

  {
    const p = await load('#/home');
    p.w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    p.st().tutorials = { voice: true, progress: {}, completed: {} };
    p.w.AvenVoice.speak = () => { throw new Error('tts down'); };
    p.w.AvenVoice.stop = () => {};
    p.w.AvenTutorial.start('home', { restart: true }); await sleep(180);
    ok('V4 TTS failure does not break tutorial text UI', !!p.q('.tour-layer') && /Aven как центр дня/.test(p.text('.tour-pop')));
    ok('V5 Mobile tutorial presentation uses bottom-sheet class', p.q('.tour-pop').classList.contains('tour-pop-mobile'));
    p.w.AvenTutorial.close(false);
    p.dom.window.close();
  }

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
