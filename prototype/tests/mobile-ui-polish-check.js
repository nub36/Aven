/* Mobile UX regression checks. jsdom validates state/cleanup and DOM contracts only;
   real geometry (scrollWidth/getBoundingClientRect) requires a browser engine. */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Не найден jsdom (нужен jsdom@30).'); process.exit(2); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8104;
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
async function load(hash) {
  const dom = await JSDOM.fromURL('http://127.0.0.1:' + PORT + '/index.html' + hash, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'innerWidth', { configurable: true, value: 390 });
      w.matchMedia = (q) => ({ matches: /max-width:\s*860px/.test(q) || /max-width:\s*640px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.scrollTo = () => {};
    }
  });
  await sleep(750);
  const w = dom.window, d = w.document;
  return { dom, w, d, q: (s) => d.querySelector(s), click: (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })) };
}
(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  const admin = fs.readFileSync(path.join(ROOT, 'js/admin.js'), 'utf8');

  ok('CSS: no global overflow-x hidden clipping', !/body\s*\{[^}]*overflow-x\s*:\s*hidden/is.test(css));
  ok('CSS: decorative ambient layer no longer uses negative viewport insets', /body::before\s*\{[^}]*inset:\s*0\s*;/s.test(css) && !/body::before\s*\{[^}]*inset:\s*-/.test(css));
  ok('CSS: set-layout direct grid children can shrink', /\.set-layout\s*>\s*\*/.test(css) && /\.set-layout\s*\{[^}]*minmax\(0,\s*1fr\)/s.test(css));
  ok('CSS: admin nav scroll is local', /\.set-nav\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s.test(css));
  ok('CSS: reduced motion covers pseudo-elements', /prefers-reduced-motion:\s*reduce/.test(css) && /\*,\s*\*::before,\s*\*::after/.test(css));
  ok('Admin: wide tables have explicit mobile card semantics', /tbl adm-table/.test(admin) && /data-label="Действия"/.test(admin) && /data-label="Результат"/.test(admin));

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

  p.w.Aven.openModal({ title: 'Test', body: '<input name="x">', submitText: null }); await sleep(40);
  ok('Modal open locks background and exposes dialog', p.d.body.classList.contains('modal-open') && p.q('.app').hasAttribute('inert') && !!p.q('.modal[role="dialog"]'));
  p.click(p.q('.modal [data-x]')); await sleep(30);
  ok('Modal close restores page and removes overlay', !p.d.body.classList.contains('modal-open') && !p.q('.app').hasAttribute('inert') && !p.q('.modal-overlay'));

  p.w.AvenTutorial.start('help', { restart: true }); await sleep(420);
  ok('Tutorial open has mobile sheet and lock', p.d.body.classList.contains('tour-open') && p.q('.tour-pop').classList.contains('tour-pop-mobile'));
  p.click(p.q('.tour-scrim')); await sleep(40);
  ok('Tutorial backdrop closes and restores body', !p.q('.tour-layer') && !p.d.body.classList.contains('tour-open'));

  p.dom.window.close();
  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
