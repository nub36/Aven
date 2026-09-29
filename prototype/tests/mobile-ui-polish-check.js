/* Mobile UX + Design System & Motion regression checks.
   jsdom validates state/cleanup, style contracts and DOM structure. */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Не найден jsdom (нужен jsdom@30).'); process.exit(2); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8135;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
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
  else { fail++; console.error('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}
async function load(hash, width) {
  width = width || 390;
  const dom = await JSDOM.fromURL('http://127.0.0.1:' + PORT + '/index.html' + hash, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'innerWidth', { configurable: true, value: width });
      w.matchMedia = (q) => {
        const max = /max-width:\s*(\d+)px/.exec(q);
        return { matches: !!max && width <= Number(max[1]), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
      };
      w.scrollTo = () => {};
    }
  });
  await sleep(750);
  const w = dom.window, d = w.document;
  return { dom, w, d, q: (s) => d.querySelector(s), qa: (s) => Array.from(d.querySelectorAll(s)), click: (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })) };
}
(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  const charCss = fs.readFileSync(path.join(ROOT, 'css/character.css'), 'utf8');
  const admin = fs.readFileSync(path.join(ROOT, 'js/admin.js'), 'utf8');

  /* 1. Design Tokens & CSS Architecture */
  ok('CSS: no global overflow-x hidden clipping', !/body\s*\{[^}]*overflow-x\s*:\s*hidden/is.test(css));
  ok('CSS: decorative ambient layer no longer uses negative viewport insets', /body::before\s*\{[^}]*inset:\s*0\s*;/s.test(css) && !/body::before\s*\{[^}]*inset:\s*-/.test(css));
  ok('CSS: set-layout direct grid children can shrink', /\.set-layout\s*>\s*\*/.test(css) && /\.set-layout\s*\{[^}]*minmax\(0,\s*1fr\)/s.test(css));
  ok('CSS: admin nav scroll is local', /\.set-nav\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s.test(css));
  ok('CSS: reduced motion covers pseudo-elements', /prefers-reduced-motion:\s*reduce/.test(css) && /\*,\s*\*::before,\s*\*::after/.test(css));
  ok('CSS: spacing and radius design tokens exist', /--space-page/.test(css) && /--radius:/.test(css) && /--radius-sm:/.test(css));
  ok('CSS: motion and easing tokens contract defined', /--motion-fast/.test(css) && /--motion-base/.test(css) && /--ease-standard/.test(css) && /--ease-emphasized/.test(css));
  ok('CSS: touch target tokens defined', /--touch-target/.test(css) && /--touch-target-compact/.test(css));
  ok('CSS: interactive scale tokens defined', /--scale-pressed/.test(css) && /--scale-active/.test(css));
  ok('CSS: safe-area insets respected on topbar, drawer and modals', /env\(safe-area-inset-top\)/.test(css) && /env\(safe-area-inset-bottom\)/.test(css));
  ok('CSS: dynamic viewport height (100dvh) with fallback used', /height:\s*100vh/.test(css) && /height:\s*100dvh/.test(css));
  ok('Character CSS: covers reduced-motion for floating avatar and recording indicator', /prefers-reduced-motion:\s*reduce[\s\S]*\.float-btn\s*\{[\s\S]*animation:\s*none/.test(charCss) && /html\.reduce-motion\s+\.float-btn/.test(charCss));
  ok('Admin: wide tables have explicit mobile card semantics', /tbl adm-table/.test(admin) && /data-label="Действия"/.test(admin) && /data-label="Результат"/.test(admin));

  /* 2. Responsive DOM Smoke across mobile breakpoints */
  const routes = ['home', 'day', 'calendar', 'tasks', 'notes', 'finance', 'auto', 'shopping', 'tools', 'help', 'assistant', 'automation', 'history', 'admin', 'settings', 'profile'];
  for (const width of [320, 360, 390, 412, 430]) {
    const m = await load('#/home', width);
    let rendered = true;
    for (const route of routes) {
      m.w.location.hash = '#/' + route;
      await sleep(45);
      if (/Ошибка отрисовки/.test(m.q('#page').textContent)) rendered = false;
    }
    ok('DOM smoke ' + width + 'px: every existing route renders', rendered);
    m.dom.window.close();
  }

  /* 3. Mobile Navigation Drawer & Stacking Contract */
  const p = await load('#/home');
  const button = p.q('#mobile-menu-btn');
  p.click(button); await sleep(30);
  ok('Drawer open: class, aria, inert and lock contract', p.d.body.classList.contains('nav-open') && button.getAttribute('aria-expanded') === 'true' && p.q('#sidebar').getAttribute('aria-hidden') === 'false' && p.q('.main').hasAttribute('inert'));
  p.click(p.q('#nav-backdrop')); await sleep(30);
  ok('Backdrop close: all drawer state is restored', !p.d.body.classList.contains('nav-open') && button.getAttribute('aria-expanded') === 'false' && !p.q('.main').hasAttribute('inert') && p.q('#sidebar').getAttribute('aria-hidden') === 'true');
  p.click(button); p.d.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(30);
  ok('Escape close removes lock/inert', !p.d.body.classList.contains('nav-open') && !p.q('.main').hasAttribute('inert'));
  p.click(button); p.click(p.q('#sidebar [data-action="nav"][data-id="admin"]')); await sleep(250);
  ok('Navigation click / route change cleans drawer', p.w.location.hash === '#/admin' && !p.d.body.classList.contains('nav-open') && !p.q('.main').hasAttribute('inert'));
  ok('Admin route renders local tabs and responsive tables', !!p.q('.set-nav') && !!p.q('.adm-table') && !!p.q('.table-scroll'));

  /* 4. Modal Bottom Sheet & Dialog */
  p.w.Aven.openModal({ title: 'Test', body: '<input name="x">', submitText: null }); await sleep(40);
  ok('Modal open locks background and exposes dialog', p.d.body.classList.contains('modal-open') && p.q('.app').hasAttribute('inert') && !!p.q('.modal[role="dialog"]'));
  p.click(p.q('.modal [data-x]')); await sleep(30);
  ok('Modal close restores page and removes overlay', !p.d.body.classList.contains('modal-open') && !p.q('.app').hasAttribute('inert') && !p.q('.modal-overlay'));

  /* 5. Tutorial 2.0 Sheet & Preservation */
  p.w.AvenTutorial.start('help', { restart: true }); await sleep(420);
  ok('Tutorial open has mobile sheet and lock', p.d.body.classList.contains('tour-open') && p.q('.tour-pop').classList.contains('tour-pop-mobile'));
  p.click(p.q('[data-action="tour-close"]')); await sleep(40);
  ok('Tutorial close control restores body without a click-blocking backdrop', !p.q('.tour-layer') && !p.d.body.classList.contains('tour-open'));

  /* 6. Home Hierarchy & Action Affordances */
  p.w.location.hash = '#/home'; await sleep(120);
  ok('Home hero renders greeting and date', !!p.q('[data-tour="home-hero"] h1') && !!p.q('.hero-sign'));
  ok('Home command bar has input, mic and go buttons', !!p.q('[data-tour="command-bar"] input') && !!p.q('[data-tour="command-bar"] .mic') && !!p.q('[data-tour="command-bar"] .go'));
  ok('Home suggestions panel is accessible', !!p.q('[data-tour="home-suggestions"]'));
  ok('Home summary grid renders distinct entity cards', !!p.q('[data-tour="home-summary"]') && p.qa('[data-tour="home-summary"] .card').length >= 4);

  /* 7. Assistant Mode & Keyboard Polish */
  p.w.location.hash = '#/assistant'; await sleep(120);
  ok('Assistant container has proper viewport mode and chat log', p.d.body.classList.contains('assistant-mode') && !!p.q('#chat') && !!p.q('#chat-input'));
  ok('Assistant send button and example command pills present', !!p.q('[data-tour="command-send"]') && !!p.q('[data-tour="command-examples"]'));

  p.dom.window.close();
  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
