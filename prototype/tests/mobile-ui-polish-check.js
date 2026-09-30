/* Mobile UX + Design System, Motion & Finance regression checks.
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

  /* 2. Finance Defect A & B CSS Contracts */
  ok('CSS Defect A: Finance monthly chart has bounded horizontal scroll region', /\.bars-scroll\s*\{[^}]*overflow-x:\s*auto/s.test(css) && /\.bars-scroll\s*\{[^}]*overscroll-behavior-inline:\s*contain/s.test(css));
  ok('CSS Defect B: Finance operations table has responsive mobile card semantics', /\.fin-table tr\.fin-row\s*\{[^}]*grid-template-areas:/s.test(css) && /\.fin-table\s*\{[^}]*display:\s*block/s.test(css));

  /* 2b. Mobile Shell Stacking & Interaction Invariants (P0 hotfix) */
  ok('CSS Stacking: Desktop hides drawer controls (.mobile-menu-btn, .nav-close, .nav-backdrop)', /\.mobile-menu-btn,\s*\.nav-close,\s*\.nav-backdrop\s*\{\s*display:\s*none;\s*pointer-events:\s*none;/s.test(css));
  ok('CSS Stacking: Mobile closed backdrop is hidden and cannot intercept pointer events', /@media\s*\(max-width:\s*860px\)\s*\{[\s\S]*\.nav-backdrop\s*\{\s*display:\s*none;[\s\S]*pointer-events:\s*none;/s.test(css));
  ok('CSS Stacking: Mobile open backdrop is displayed with pointer-events auto', /body\.nav-open\s+\.nav-backdrop\s*\{\s*display:\s*block;\s*opacity:\s*1;\s*pointer-events:\s*auto;/s.test(css));
  ok('CSS Stacking: Mobile drawer sidebar (z:220) sits strictly above backdrop (z:210)', /z-index:\s*220/.test(css) && /z-index:\s*210/.test(css));
  ok('CSS Stacking: Mobile menu button and close button are interactive', /@media\s*\(max-width:\s*860px\)\s*\{[\s\S]*\.mobile-menu-btn\s*\{[^}]*pointer-events:\s*auto;[\s\S]*\.nav-close\s*\{[^}]*pointer-events:\s*auto;/s.test(css));

  /* 2c. P0 REOPEN (2026-09-30) — PR #38 was deployed and byte-verified in production
     (fetched HTML/CSS matched source), yet the owner's real Android remained fully
     unclickable. Static source/CSS review found no additional hit-testable full-screen
     blocker beyond the nav-backdrop PR #38 already fixed. The best-evidenced explanation
     consistent with "server content correct, device still broken": prototype/index.html
     referenced css/js with NO cache-busting, and GitHub Pages sets a fixed, non-configurable
     Cache-Control: max-age=600 on every asset (confirmed by GitHub Support; not
     configurable from this repo) — https://webapps.stackexchange.com/questions/119286 .
     A device that had already loaded the prototype earlier (e.g. testing the previous
     PR) can keep serving the OLD cached css/js for up to that window (and longer on some
     mobile networks/browsers) even after a fully correct new deploy, silently
     reproducing the exact original bug. This is a genuine, provable delivery-pipeline
     defect — not "advice to clear cache": the fix below is enforced in code/CI, not left
     to a human to remember. See docs/WORK_LOG.md for the full writeup and the explicit
     "real-browser validation not performed" caveat. */
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const workflowYml = fs.readFileSync(path.join(ROOT, '..', '.github', 'workflows', 'prototype-pages.yml'), 'utf8');
  const localAssetRefs = [...indexHtml.matchAll(/<(?:script src|link[^>]*href)="((?:css|js|assets)\/[^"]*)"/g)].map((m) => m[1]);
  ok('P0 cache-busting: index.html references local css/js/assets at all (sanity)', localAssetRefs.length >= 25);
  ok('P0 cache-busting: every local css/js/assets reference carries a ?v= version query',
    localAssetRefs.length > 0 && localAssetRefs.every((t) => /\?v=/.test(t)),
    'без версии: ' + localAssetRefs.filter((t) => !/\?v=/.test(t)).join(', '));
  ok('P0 cache-busting: version is the workflow-substituted __ASSET_VERSION__ placeholder (not a hand-typed date that can be forgotten)',
    localAssetRefs.length > 0 && localAssetRefs.every((t) => /\?v=__ASSET_VERSION__$/.test(t)));
  const subStepIdx = workflowYml.indexOf('__ASSET_VERSION__');
  const uploadStepIdx = workflowYml.indexOf('upload-pages-artifact');
  ok('P0 cache-busting: Pages workflow substitutes __ASSET_VERSION__ with the commit SHA', /sed -i "s\/__ASSET_VERSION__\/\$\{GITHUB_SHA\}\/g"/.test(workflowYml));
  ok('P0 cache-busting: substitution step runs BEFORE the Pages artifact is uploaded (order matters)',
    subStepIdx > -1 && uploadStepIdx > -1 && subStepIdx < uploadStepIdx);
  ok('P0 cache-busting: workflow fails the build if the placeholder is missing or not fully replaced',
    /exit 1/.test(workflowYml) && /__ASSET_VERSION__.*не найден/.test(workflowYml));

  /* 2d. P0 REOPEN — generic full-viewport hit-test blocker audit (not just nav-backdrop).
     Parses actual CSS rules (media-query aware) and flags any selector whose OWN
     declaration block combines `position: fixed` with `inset: 0` (a screen-covering
     layer candidate). Every match must be an already-reviewed, explicitly safe pattern;
     an unrecognised match fails loudly so a FUTURE invisible blocker (the PR #37 class of
     bug) cannot ship silently again — this audit would have caught PR #37's bug too. */
  function extractCssRules(cssText) {
    const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    const stack = [{ selector: '', buf: '' }];
    for (const ch of clean) {
      if (ch === '{') {
        const top = stack[stack.length - 1];
        stack.push({ selector: top.buf.trim(), buf: '' });
        top.buf = '';
      } else if (ch === '}') {
        const frame = stack.pop();
        if (frame.selector && !frame.selector.startsWith('@')) rules.push({ selector: frame.selector, body: frame.buf });
      } else {
        stack[stack.length - 1].buf += ch;
      }
    }
    return rules;
  }
  const KNOWN_SAFE_SCREEN_COVERING_RULES = {
    'body::before': (body) => /pointer-events:\s*none/.test(body),
    '.modal-overlay': () => !/id="modal-root"[^>]*>[\s\S]*?class="modal-overlay"/.test(indexHtml),
    '.assistant': () => !/class="[^"]*\bassistant\b[^"]*"/.test(indexHtml.replace(/<!--[\s\S]*?-->/g, '')),
    '.tour-layer': (body) => /pointer-events:\s*none/.test(body),
    '.sidebar': (body) => /transform:\s*translate3d/.test(body) && /z-index:\s*220/.test(body),
    '.nav-backdrop': (body) => /display:\s*none/.test(body) && /pointer-events:\s*none/.test(body)
  };
  const allCss = css + '\n' + charCss;
  const screenCoveringRules = extractCssRules(allCss).filter((r) => /position:\s*fixed/.test(r.body) && /inset:\s*0\b/.test(r.body));
  ok('P0 overlay audit: at least the known screen-covering rules are detected (scanner sanity)', screenCoveringRules.length >= 6);
  for (const rule of screenCoveringRules) {
    const knownKey = Object.keys(KNOWN_SAFE_SCREEN_COVERING_RULES).find((k) => rule.selector.split(',').map((s) => s.trim()).includes(k));
    ok('P0 overlay audit: `' + rule.selector + '` is a recognised, explicitly reviewed screen-covering rule',
      !!knownKey, 'неизвестный fixed+inset:0 селектор — требует ручного review hit-testing перед merge');
    if (knownKey) ok('P0 overlay audit: `' + rule.selector + '` satisfies its documented non-blocking contract', KNOWN_SAFE_SCREEN_COVERING_RULES[knownKey](rule.body));
  }
  const unrecognisedSelectors = screenCoveringRules
    .map((r) => r.selector)
    .filter((sel) => !Object.keys(KNOWN_SAFE_SCREEN_COVERING_RULES).some((k) => sel.split(',').map((s) => s.trim()).includes(k)));
  ok('P0 overlay audit: no unreviewed fixed+inset:0 selector exists in style.css/character.css', unrecognisedSelectors.length === 0, unrecognisedSelectors.join(', '));

  /* 3. Responsive DOM Smoke across mobile breakpoints */
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

  /* 4. Mobile Navigation Drawer & Stacking Contract */
  const p = await load('#/home');
  const button = p.q('#mobile-menu-btn');
  p.click(button); await sleep(30);
  ok('Drawer open: class, aria, inert and lock contract', p.d.body.classList.contains('nav-open') && button.getAttribute('aria-expanded') === 'true' && p.q('#sidebar').getAttribute('aria-hidden') === 'false' && p.q('.main').hasAttribute('inert'));
  p.click(p.q('#nav-backdrop')); await sleep(30);
  ok('Backdrop close: all drawer state is restored', !p.d.body.classList.contains('nav-open') && button.getAttribute('aria-expanded') === 'false' && !p.q('.main').hasAttribute('inert') && p.q('#sidebar').getAttribute('aria-hidden') === 'true');
  p.click(button); p.click(p.q('.nav-close')); await sleep(30);
  ok('Nav close button (✕) closes drawer and restores state', !p.d.body.classList.contains('nav-open') && button.getAttribute('aria-expanded') === 'false' && !p.q('.main').hasAttribute('inert'));
  p.click(button); p.d.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(30);
  ok('Escape close removes lock/inert', !p.d.body.classList.contains('nav-open') && !p.q('.main').hasAttribute('inert'));
  p.click(button); p.click(p.q('#sidebar [data-action="nav"][data-id="admin"]')); await sleep(250);
  ok('Navigation click / route change cleans drawer', p.w.location.hash === '#/admin' && !p.d.body.classList.contains('nav-open') && !p.q('.main').hasAttribute('inert'));
  ok('Admin route renders local tabs and responsive tables', !!p.q('.set-nav') && !!p.q('.adm-table') && !!p.q('.table-scroll'));

  /* 4b. Desktop Drawer Visibility Invariants */
  const dtop = await load('#/home', 1280);
  ok('Desktop shell: sidebar is present and main is not inert', !!dtop.q('#sidebar') && !dtop.q('.main').hasAttribute('inert') && !dtop.d.body.classList.contains('nav-open'));
  dtop.dom.window.close();

  /* 5. Modal Bottom Sheet & Dialog */
  p.w.Aven.openModal({ title: 'Test', body: '<input name="x">', submitText: null }); await sleep(40);
  ok('Modal open locks background and exposes dialog', p.d.body.classList.contains('modal-open') && p.q('.app').hasAttribute('inert') && !!p.q('.modal[role="dialog"]'));
  p.click(p.q('.modal [data-x]')); await sleep(30);
  ok('Modal close restores page and removes overlay', !p.d.body.classList.contains('modal-open') && !p.q('.app').hasAttribute('inert') && !p.q('.modal-overlay'));

  /* 6. Tutorial 2.0 Sheet & Preservation */
  p.w.AvenTutorial.start('help', { restart: true }); await sleep(420);
  ok('Tutorial open has mobile sheet and lock', p.d.body.classList.contains('tour-open') && p.q('.tour-pop').classList.contains('tour-pop-mobile'));
  p.click(p.q('[data-action="tour-close"]')); await sleep(40);
  ok('Tutorial close control restores body without a click-blocking backdrop', !p.q('.tour-layer') && !p.d.body.classList.contains('tour-open'));

  /* 7. Home Hierarchy & Action Affordances */
  p.w.location.hash = '#/home'; await sleep(120);
  ok('Home hero renders greeting and date', !!p.q('[data-tour="home-hero"] h1') && !!p.q('.hero-sign'));
  ok('Home command bar has input, mic and go buttons', !!p.q('[data-tour="command-bar"] input') && !!p.q('[data-tour="command-bar"] .mic') && !!p.q('[data-tour="command-bar"] .go'));
  ok('Home suggestions panel is accessible', !!p.q('[data-tour="home-suggestions"]'));
  ok('Home summary grid renders distinct entity cards', !!p.q('[data-tour="home-summary"]') && p.qa('[data-tour="home-summary"] .card').length >= 4);

  /* 8. Assistant Mode & Keyboard Polish */
  p.w.location.hash = '#/assistant'; await sleep(120);
  ok('Assistant container has proper viewport mode and chat log', p.d.body.classList.contains('assistant-mode') && !!p.q('#chat') && !!p.q('#chat-input'));
  ok('Assistant send button and example command pills present', !!p.q('[data-tour="command-send"]') && !!p.q('[data-tour="command-examples"]'));

  /* 9. Finance Screen Defect A & B DOM Validation */
  p.w.location.hash = '#/finance'; await sleep(120);
  const finScroll = p.q('.bars-scroll');
  ok('Finance DOM Defect A: Monthly chart renders in bounded scroll container', !!finScroll && finScroll.querySelectorAll('.bar-wrap').length === 12);
  const finRows = p.qa('.fin-table tr.fin-row');
  ok('Finance DOM Defect B: Operations list renders with semantic card structure', finRows.length > 0 && !!p.q('.fin-td-what') && !!p.q('.fin-td-sum') && !!p.q('.fin-td-cat') && !!p.q('.fin-td-account') && !!p.q('.fin-td-date') && !!p.q('.fin-td-actions'));
  ok('Finance DOM Defect B: Edit and delete controls preserved', !!p.q('[data-action="fin-edit"]') && !!p.q('[data-action="fin-del"]'));

  p.dom.window.close();
  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
