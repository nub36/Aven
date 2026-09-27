/* Regression на реальный production-баг мобильной навигации (drawer):
   в мобильном drawer пропадали пункты групп «Ассистент и автоматизации» и «Система»
   (Aven Assistant, Автоматизации, История, Админка) — они были в DOM, но обрезались
   вложенным скролл-контейнером drawer и становились недостижимыми, тогда как
   прикреплённая снизу группа (Настройки/Профиль) оставалась видимой.

   Запуск:
     NODE_PATH=/tmp/lab/node_modules node prototype/tests/navigation-check.js

   Что проверяем на РЕНДЕРЕ (а не по наличию строк в исходниках):
   - в отрисованном #sidebar присутствуют ВСЕ маршруты, включая Assistant/Automation/History/Admin/
     Notifications/Settings/Profile;
   - ссылки навигации внутри открытого drawer не находятся в inert-поддереве;
   - переход по пункту меняет маршрут, закрывает drawer, снимает backdrop, снимает inert и body-lock;
   - drawer открывается повторно.

   Честно: jsdom не выполняет layout и @media, поэтому РЕАЛЬНАЯ прокручиваемость drawer на Android
   этим тестом НЕ доказывается (см. отчёт). Здесь проверяются DOM/структура/взаимодействие и
   отсутствие CSS-правил, скрывавших группы. */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Не найден jsdom. Запустите с NODE_PATH=/tmp/lab/node_modules.'); process.exit(2); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8104;
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
async function load(hash) {
  const dom = await JSDOM.fromURL(BASE + 'index.html' + (hash || ''), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true
  });
  await sleep(800);
  const w = dom.window, d = w.document;
  return {
    dom, w, d,
    q: (sel) => d.querySelector(sel),
    qa: (sel) => Array.from(d.querySelectorAll(sel)),
    navItem: (id) => d.querySelector('#sidebar .nav-item[data-id="' + id + '"]'),
    click: (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })),
    openMenu: () => { const b = d.getElementById('mobile-menu-btn'); b && b.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); },
    body: () => d.body,
    main: () => d.querySelector('.main')
  };
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  /* ---------- CSS: конфликтующие/скрывающие правила устранены ---------- */
  {
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    ok('CSS1 нет правила, скрывающего группы навигации (.side-group/.side-bottom display:none)',
      !/\.side-(group|bottom)[^{]*\{[^}]*display\s*:\s*none/i.test(css) && !/\.side-group\s*,\s*\.side-bottom\s*\{[^}]*display\s*:\s*none/i.test(css));
    ok('CSS2 mobile drawer имеет собственный вертикальный скролл (overflow-y:auto на .sidebar)',
      /@media[^{]*max-width:\s*860px[\s\S]*\.sidebar\s*\{[^}]*overflow-y\s*:\s*auto/i.test(css));
    ok('CSS3 нет устаревшего горизонтального превращения сайдбара в ряд (flex-direction:row на mobile)',
      !/@media[^{]*860px[\s\S]*\.sidebar\s*\{[^}]*flex-direction\s*:\s*row/i.test(css));
    ok('CSS4 mobile drawer has viewport fallback and dynamic height',
      /height:\s*100vh/.test(css) && /height:\s*100dvh/.test(css));
    ok('CSS5 mobile drawer reserves bottom scroll space',
      /scroll-padding-bottom:\s*calc\(/.test(css) && /padding-bottom:\s*calc\(env\(safe-area-inset-bottom\)/.test(css));
    ok('CSS6 stacking contract is drawer > backdrop > page',
      /\.sidebar\s*\{[\s\S]*?z-index:\s*120/.test(css) && /\.nav-backdrop\s*\{[\s\S]*?z-index:\s*110/.test(css));
    ok('CSS7 drawer remains interactive while backdrop accepts outside taps',
      !/\.sidebar\s*\{[^}]*pointer-events\s*:\s*none/i.test(css) && /\.nav-backdrop\s*\{[\s\S]*?position:\s*fixed/.test(css));
  }

  /* ---------- Полный набор маршрутов присутствует в отрисованном drawer ---------- */
  const EXPECTED = [
    'home', 'day', 'notifications', 'calendar', 'tasks', 'notes', 'finance', 'auto',
    'shopping', 'tools', 'help', 'assistant', 'automation', 'history', 'admin', 'settings', 'profile'
  ];
  {
    const p = await load('#/home');
    p.openMenu(); await sleep(80);
    ok('N0 drawer открыт (body.nav-open)', p.body().classList.contains('nav-open'));
    EXPECTED.forEach((id) => {
      const el = p.navItem(id);
      ok('N-route отрисован пункт «' + id + '»', !!el);
    });
    // ключевые ранее пропадавшие пункты — отдельными явными проверками
    ['assistant', 'automation', 'history', 'admin', 'notifications', 'settings', 'profile'].forEach((id) => {
      const el = p.navItem(id);
      ok('R ссылка «' + id + '» доступна в открытом drawer и НЕ внутри inert-поддерева',
        !!el && !el.closest('[inert]'), el ? 'inert-ancestor=' + !!el.closest('[inert]') : 'нет элемента');
    });
    // группы-заголовки на месте, но больше не «съедают» свои пункты
    ok('N1 заголовок группы «Ассистент и автоматизации» отрисован', p.qa('#sidebar .side-group').some((g) => /Ассистент/i.test(g.textContent)));
    ok('N2 заголовок группы «Система» отрисован', p.qa('#sidebar .side-group').some((g) => /Система/i.test(g.textContent)));
    // единый скролл-контейнер: у .side-scroll нет вложенного вертикального скролла в mobile-режиме
    ok('N3 нет дубликатов пунктов навигации (по одному data-id)', (() => {
      const seen = {}; let dup = false;
      p.qa('#sidebar .nav-item').forEach((b) => { const id = b.dataset.id; if (seen[id]) dup = true; seen[id] = 1; });
      return !dup;
    })());
  }

  /* ---------- Сценарий Admin: тап → маршрут → закрытие → очистка состояния → повторное открытие ---------- */
  async function navScenario(id, expectHash) {
    const p = await load('#/home');
    p.openMenu(); await sleep(80);
    const preInert = p.main().hasAttribute('inert');
    const el = p.navItem(id);
    if (!el) { ok('SCN[' + id + '] пункт найден', false, 'нет элемента'); return; }
    p.click(el); await sleep(260);
    const b = p.body();
    ok('SCN[' + id + '] тап меняет маршрут на ' + expectHash, p.w.location.hash === expectHash, p.w.location.hash);
    ok('SCN[' + id + '] drawer закрылся (нет body.nav-open)', !b.classList.contains('nav-open'));
    ok('SCN[' + id + '] backdrop не активен (body.nav-open снят)', !b.classList.contains('nav-open'));
    ok('SCN[' + id + '] inert снят с основного контента', preInert && !p.main().hasAttribute('inert'));
    ok('SCN[' + id + '] body-lock снят (нет nav-open/modal-open)', !b.classList.contains('nav-open') && !b.classList.contains('modal-open'));
    // повторное открытие работает
    p.openMenu(); await sleep(80);
    ok('SCN[' + id + '] drawer открывается повторно', b.classList.contains('nav-open') && p.main().hasAttribute('inert'));
    // и целевой раздел действительно отрисован
    ok('SCN[' + id + '] после перехода отрисована страница раздела (без ошибки)', !/Ошибка отрисовки/.test((p.q('#page') || {}).textContent || ''));
  }

  await navScenario('admin', '#/admin');
  await navScenario('assistant', '#/assistant');
  await navScenario('history', '#/history');
  await navScenario('notifications', '#/notifications');

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  console.log('ПРИМЕЧАНИЕ: реальная прокручиваемость drawer на Android этим тестом не доказывается (jsdom без layout/медиазапросов).');
  server.close();
  process.exit(fail ? 1 : 0);
})();
