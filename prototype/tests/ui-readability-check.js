/* UI readability / layout polish regression checks (owner UI review, 2026-09-30).

   Что здесь проверяется и чего здесь НЕ проверяется — честно:
   - jsdom НЕ считает раскладку: у него нет layout engine, поэтому реальную ширину
     колонки, реальный перенос строки и реальное горизонтальное переполнение
     измерить нельзя. Эти проверки не выдают себя за браузерные.
   - Поэтому проверяются два измеримых слоя: (A) декларативный контракт раскладки
     в style.css (сколько колонок, какие span-ы, какие grid-areas, где ограничена
     мера строки) и (B) структура DOM, на которую этот контракт опирается
     (нужные классы и порядок блоков реально существуют на страницах).
   - Вместе это ловит именно те дефекты, из-за которых был сделан этап: колонка,
     которая физически не может стать шире; блок, который выпадает в чужую ячейку
     сетки; бейдж, который стоит в потоке заголовка и сдвигает текст. */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Не найден jsdom (нужен jsdom@30).'); process.exit(2); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8141;
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

/* Вырезает тело @media-блока с указанным max-width, чтобы правила разных
   брейкпоинтов не путались между собой при проверке. */
function mediaBlock(css, px) {
  const start = css.indexOf('@media (max-width: ' + px + 'px)');
  if (start < 0) return '';
  let i = css.indexOf('{', start), depth = 0, out = '';
  for (; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') { depth++; if (depth === 1) continue; }
    if (ch === '}') { depth--; if (depth === 0) break; }
    out += ch;
  }
  return out;
}
function ruleBody(css, selector) {
  const rx = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = rx.exec(css);
  return m ? m[1] : '';
}

async function load(hash, width) {
  width = width || 1440;
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
  await sleep(800);
  const w = dom.window, d = w.document;
  const go = async (h) => { w.location.hash = h; await sleep(450); };
  return {
    dom, w, d,
    q: (s) => d.querySelector(s),
    qa: (s) => Array.from(d.querySelectorAll(s)),
    go,
    text: () => d.getElementById('page').textContent || '',
    broken: () => (d.getElementById('page').textContent || '').indexOf('Ошибка отрисовки') >= 0
  };
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  const m1100 = mediaBlock(css, 1100);
  const m860 = mediaBlock(css, 860);
  const m640 = mediaBlock(css, 640);

  /* ==== A. Контракт раскладки в CSS ==== */

  /* A1. Помощник: рабочая область больше не заперта в узкую колонку. */
  {
    const inner = ruleBody(css, '.assistant .a-inner');
    ok('A1 рабочая область помощника больше не ограничена узкими 720px',
      !!inner && !/max-width:\s*720px/.test(inner), inner.trim().slice(0, 90));
    ok('A2 ширина помощника задана относительно доступной ширины с разумным пределом',
      /max-width:\s*min\(100%,\s*\d{3,4}px\)/.test(inner));
    const px = /max-width:\s*min\(100%,\s*(\d{3,4})px\)/.exec(inner);
    ok('A3 предел ширины помощника заметно шире прежнего, но не бесконечный',
      !!px && Number(px[1]) >= 900 && Number(px[1]) <= 1400, px ? px[1] : 'нет');
    ok('A4 длина строки реплики ограничена мерой текста, а не только процентом',
      /\.msg\s*\{[^}]*max-width:\s*min\([^)]*\d+ch\)/.test(css));
    ok('A5 длинное слово в реплике переносится, а не распирает чат',
      /\.msg\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css));
    ok('A6 на узком экране помощник занимает всю ширину',
      /\.assistant \.a-inner\s*\{\s*max-width:\s*100%/.test(m860));
    const hint = ruleBody(css, '.a-hint');
    ok('A7 короткая подсказка под полем имеет собственный стиль и ограниченную меру строки',
      !!hint && /flex/.test(hint) && /\.a-hint > span\s*\{[^}]*max-width:\s*\d+ch/.test(css));
  }

  /* A8–A13. Главная: у текстовых карточек физически больше места. */
  {
    const grid = ruleBody(css, '.home-grid');
    ok('A8 сетка Главной переведена на дробные колонки (6), чтобы давать разную ширину',
      /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/.test(grid));
    const card = ruleBody(css, '.home-grid > .card');
    const wide = ruleBody(css, '.home-grid > .card.wide');
    const cardSpan = /span\s*(\d)/.exec(card), wideSpan = /span\s*(\d)/.exec(wide);
    ok('A9 обычная карточка занимает треть строки', !!cardSpan && Number(cardSpan[1]) === 2);
    ok('A10 текстовая карточка («Уведомления», «Последние действия») занимает половину строки',
      !!wideSpan && Number(wideSpan[1]) === 3);
    ok('A11 текстовая карточка строго шире обычной — это и есть суть исправления',
      !!cardSpan && !!wideSpan && Number(wideSpan[1]) > Number(cardSpan[1]));
    ok('A12 на узком десктопе/планшете две колонки, а текстовая карточка берёт строку целиком',
      /\.home-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(m1100) &&
      /\.home-grid > \.card\.wide[^{]*\{\s*grid-column:\s*span 2/.test(m1100));
    ok('A13 на мобильном все span-ы сброшены и сетка одноколоночная',
      /\.home-grid[^{]*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(m860) &&
      /\.home-grid > \.card\.wide[^{]*\{[^}]*grid-column:\s*auto/.test(m860));
    ok('A14 размер шрифта карточек Главной не уменьшался ради вмещения текста',
      !/\.home-grid[^{]*\{[^}]*font-size/.test(css));
  }

  /* A15–A17. День: «Требует внимания» тянется на полезную ширину. */
  {
    const at = ruleBody(css, '.attention-grid');
    ok('A15 блок «Требует внимания» использует auto-fit, поэтому пустых колонок справа не остаётся',
      /repeat\(auto-fit,\s*minmax\(min\(100%,\s*\d+px\),\s*1fr\)\)/.test(at));
    ok('A16 мера строки заголовка и описания ограничена — строка не становится бесконечной',
      /\.attention-grid \.t,\s*\.attention-grid \.s\s*\{[^}]*max-width:\s*\d+ch/.test(css));
    ok('A17 элементы блока могут сжиматься и не рвут сетку',
      /\.attention-grid > \.row-item\s*\{[^}]*min-width:\s*0/.test(css));
  }

  /* A18–A24. Уведомления: единый макет icon | content | status + actions. */
  {
    const item = ruleBody(css, '.notif-item');
    ok('A18 карточка уведомления имеет три колонки: иконка, содержимое, статус',
      /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/.test(item));
    ok('A19 места блоков заданы явно через grid-areas, а не «как получится»',
      /grid-template-areas:\s*"ico main status"/.test(item));
    ok('A20 действия всегда в одном и том же месте — отдельной строкой под содержимым',
      /grid-template-areas:[^;]*"\.\s+actions actions"/.test(item) &&
      /\.notif-actions\s*\{[^}]*grid-area:\s*actions/.test(css));
    ok('A21 колонка иконки фиксированной ширины — заголовки начинаются по одной линии',
      /\.notif-ico\s*\{[^}]*width:\s*[\d.]+em/.test(css) &&
      /\.notif-ico\s*\{[^}]*min-width:\s*[\d.]+em/.test(css));
    ok('A22 точка «непрочитано» выведена из потока заголовка и не сдвигает текст',
      /\.notif-dot\s*\{[^}]*position:\s*absolute/.test(css) &&
      /\.notif-ico\s*\{[^}]*position:\s*relative/.test(css));
    ok('A23 содержимое может сжиматься, длинные слова переносятся',
      /\.notif-main\s*\{[^}]*min-width:\s*0/.test(css) &&
      /\.notif-title\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css));
    ok('A24 на мобильном карточка складывается в столбик, сохраняя порядок блоков',
      /\.notif-item\s*\{[^}]*grid-template-areas:\s*"ico main"\s*"\.\s+status"\s*"\.\s+actions"/.test(m640));
    ok('A25 описание уведомления не растягивается в бесконечную строку',
      /\.notif-sub\s*\{[^}]*max-width:\s*\d+ch/.test(css));
  }

  /* A26. Ничего из нового не ломает тему и анимации. */
  {
    const added = ['.a-hint', '.attention-grid', '.notif-ico', '.notif-main', '.notif-status', '.notif-actions', '.notif-dot', '.notif-title', '.notif-sub'];
    const bodies = added.map((s) => ruleBody(css, s)).join(' ');
    ok('A26 новые правила не задают собственных анимаций (reduced-motion не нарушен)',
      !/animation\s*:/.test(bodies) && !/transition\s*:/.test(bodies));
    ok('A27 новые правила берут цвета только из токенов темы (Light/Dark)',
      !/#[0-9a-f]{3,8}\b/i.test(bodies) && !/\brgb\(/i.test(bodies));
  }

  /* ==== B. Структура DOM, на которую опирается контракт ==== */

  /* B1. Главная. */
  {
    const p = await load('#/home', 1440);
    const notif = p.q('.home-grid [data-card="notifications"]');
    const acts = p.q('.home-grid [data-card="actions"]');
    ok('B1 карточка «Уведомления» на Главной помечена как текстовая (широкая)',
      !!notif && notif.classList.contains('wide'));
    ok('B2 карточка «Последние действия» на Главной помечена как текстовая (широкая)',
      !!acts && acts.classList.contains('wide'));
    ok('B3 «Быстрые действия» остаются компактными и не занимают половину строки',
      !!p.q('[data-tour="quick-actions"]') && !p.q('[data-tour="quick-actions"]').classList.contains('wide'));
    ok('B4 широких карточек ровно две — остальные остаются по трети строки',
      p.qa('.home-grid > .card.wide').length === 2);
    ok('B5 Главная отрисовалась без ошибок', !p.broken());
    p.dom.window.close();
  }

  /* B2. День. */
  {
    const p = await load('#/day', 1440);
    const block = p.q('[data-tour="day-attention"]');
    ok('B6 блок «Требует внимания» существует', !!block);
    ok('B7 блок использует тянущуюся сетку, а не фиксированные три колонки',
      !!block && (!!block.querySelector('.attention-grid') || !!block.querySelector('.empty')));
    ok('B8 внутри блока больше нет жёсткой сетки cols-3',
      !!block && !block.querySelector('.cols-3'));
    ok('B9 «День» отрисовался без ошибок', !p.broken());
    p.dom.window.close();
  }

  /* B3. Уведомления — единый макет для карточек разных типов. */
  {
    const p = await load('#/notifications', 1440);
    const items = p.qa('.notif-item');
    ok('B10 список уведомлений отрисован', items.length >= 1, String(items.length));
    const shape = items.map((el) => Array.from(el.children).map((c) => c.className.split(' ')[0]).join('|'));
    const uniform = shape.every((x) => x === 'notif-ico|notif-main|notif-status|notif-actions');
    ok('B11 все карточки имеют одинаковую структуру icon | content | status | actions',
      items.length > 0 && uniform, shape.slice(0, 3).join(' ⟂ '));
    ok('B12 заголовок лежит в своей ячейке — одинаково у всех карточек',
      items.every((el) => !!el.querySelector('.notif-main > .notif-title')));
    ok('B13 описание находится под заголовком, внутри того же блока содержимого',
      items.every((el) => !!el.querySelector('.notif-main > .notif-sub')));
    ok('B14 бейдж важности лежит в колонке статуса, а не в строке заголовка',
      items.every((el) => !!el.querySelector('.notif-status > .pill')) &&
      items.every((el) => !el.querySelector('.notif-title .pill')));
    ok('B15 точка «непрочитано» живёт в ячейке иконки и не сдвигает заголовок',
      items.every((el) => !el.querySelector('.notif-main .notif-dot')));
    const unread = items.filter((el) => el.classList.contains('is-unread'));
    ok('B16 у непрочитанной карточки точка действительно есть — признак не потерян',
      unread.length === 0 || unread.every((el) => !!el.querySelector('.notif-ico > .notif-dot')));
    ok('B17 действия у всех карточек лежат в одном и том же контейнере',
      items.every((el) => !!el.querySelector(':scope > .notif-actions')));
    ok('B18 действия остаются настоящими кнопками и ссылками (клавиатура и screen reader)',
      items.every((el) => Array.from(el.querySelectorAll('.notif-actions > *'))
        .every((b) => (b.tagName === 'BUTTON' || b.tagName === 'A') && (b.textContent || '').trim().length > 0)));
    ok('B19 «Открыть» присутствует у каждой карточки — поведение не изменилось',
      items.every((el) => !!el.querySelector('[data-action="notif-open"]')));
    ok('B20 раздел отрисовался без ошибок', !p.broken());
    p.dom.window.close();
  }

  /* B4. Помощник — ширина, примеры, короткая подсказка, целостность Help/Tutorial. */
  {
    const p = await load('#/assistant', 1440);
    const chips = p.qa('[data-action="cmd-example"]');
    ok('B21 на экране 2–3 примера команд, а не каталог',
      chips.length >= 2 && chips.length <= 3, String(chips.length));
    const hint = p.q('#cmd-hint');
    ok('B22 подсказка под полем короткая и человеческая',
      !!hint && (hint.textContent || '').trim().length < 220);
    ok('B23 подсказка не содержит технического перечня возможностей',
      !!hint && !/Пока не умею/i.test(hint.textContent || ''));
    ok('B24 из подсказки есть вход в справку по командам',
      !!hint && !!hint.querySelector('button[data-action="help-topic"][data-topic="commands"]'));
    ok('B25 честное предупреждение про «не свободный разговор» осталось на экране',
      /не свободный разговор/i.test(p.text()) && /не внешний AI/i.test(p.text()));
    ok('B26 поле ввода по-прежнему связано с подсказкой для screen reader',
      (p.q('#chat-input') || {}).getAttribute &&
      p.q('#chat-input').getAttribute('aria-describedby') === 'cmd-hint');

    /* Owner review: после изменения раскладки помощника обучение и справка
       обязаны продолжать указывать на существующие элементы. */
    const steps = p.w.AvenTutorial.definitions.commands.steps;
    const missing = steps.map((s) => s.target).filter((t, i, a) => a.indexOf(t) === i)
      .filter((t) => typeof t === 'string' && !p.q('[data-tour="' + t + '"]'));
    ok('B27 все шаги обучения по командам по-прежнему находят свои элементы',
      missing.length === 0, missing.join(', '));
    ok('B28 ключевые якоря обучения на экране помощника сохранены',
      ['command-chat', 'command-input', 'command-send', 'command-examples', 'command-limits']
        .every((t) => !!p.q('[data-tour="' + t + '"]')));
    ok('B29 кнопки справки и обучения на экране помощника на месте',
      !!p.q('[data-action="help-topic"][data-topic="commands"]') &&
      !!p.q('[data-action="tutorial-start"][data-tour-id="commands"]'));
    ok('B30 помощник отрисовался без ошибок', !p.broken());
    p.dom.window.close();
  }

  /* B5. Все затронутые экраны живы на всех заявленных ширинах. */
  {
    for (const width of [320, 360, 390, 412, 430, 768, 1024, 1440]) {
      const p = await load('#/home', width);
      let allOk = !p.broken() && !!p.q('.home-grid');
      for (const route of ['#/day', '#/notifications', '#/assistant']) {
        await p.go(route);
        if (p.broken()) allOk = false;
      }
      ok('B31[' + width + '] Главная, День, Уведомления и Помощник отрисовываются на ширине ' + width, allOk);
      p.dom.window.close();
    }
  }

  console.log('\nвсего проверок: ' + (pass + fail) + ', провалено: ' + fail);
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
