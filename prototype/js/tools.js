/* Aven — Visual Prototype. Раздел «Инструменты». Простые функции реализованы, сложные — макеты. Не production. */
(function () {
  const A = window.Aven;
  A.pages = A.pages || {};
  let currentTool = null;

  A.pages.tools = function () {
    if (currentTool) return toolScreen(currentTool);
    const T = window.AvenDemo.staticData.tools;
    const html = `
    <div class="page-head">
      <div><h1>Инструменты</h1><div class="sub">Полезно сразу, даже без личных данных · приватные файлы обрабатываются локально · демо</div></div>
    </div>
    <div class="tools-grid">
      ${T.map((t) => `
      <div class="card tool-card" data-action="tool-open" data-id="${t.id}">
        <div class="ph">${t.icon}</div>
        <div class="tt">${A.esc(t.name)}</div>
        <div class="td">${A.esc(t.desc)}</div>
      </div>`).join('')}
    </div>
    <div class="s" style="color:var(--muted);font-size:.84rem;margin-top:14px">
      Конкретный набор первого релиза определяется отдельно (открытый вопрос №27 в PROJECT_PLAN.md). QR-код — демо-изображение, не настоящий QR.
    </div>`;
    return { html };
  };

  function head(t, back) {
    return `<div class="page-head">
      <div><h1>${t.icon} ${A.esc(t.name)}</h1><div class="sub">${A.esc(t.desc)}</div></div>
      <button class="btn" data-action="tool-back">← К инструментам</button>
    </div>`;
  }

  function toolScreen(id) {
    const t = window.AvenDemo.staticData.tools.find((x) => x.id === id);
    const render = toolRenders[id] || ((t) => head(t) + '<div class="card"><div class="empty">Макет инструмента</div></div>');
    return { html: render(t), mount: mountTool };
  }

  function mountTool() {
    const d = new Date().toISOString().slice(0, 10);
    [['d1', d], ['d2', d]].forEach(([id, v]) => { const el = document.getElementById(id); if (el && !el.value) el.value = v; });
    const ux = document.getElementById('ux-d');
    if (ux && !ux.value) ux.value = new Date().toISOString().slice(0, 16);
    if (currentTool === 'qr') setTimeout(drawQr, 30);
    const rl = document.getElementById('pw-len');
    if (rl) rl.addEventListener('input', () => { const v = document.getElementById('pw-len-v'); if (v) v.textContent = rl.value; });
  }

  /* ---------- реализации ---------- */
  const toolRenders = {

    qr: (t) => head(t) + `
      <div class="card" style="max-width:480px">
        <div class="field"><label>Текст или ссылка</label><input type="text" id="qr-text" value="https://aven.demo"></div>
        <canvas id="qr-canvas" width="220" height="220" style="display:block;margin:14px auto;border:1px solid var(--border);border-radius:10px;background:#fff"></canvas>
        <div class="s" style="color:var(--muted);font-size:.8rem;text-align:center">Демо-изображение в стиле QR (не сканируется). Настоящая генерация — отдельное решение.</div>
      </div>`,
    _qrDraw: drawQr,

    percent: (t) => head(t) + `
      <div class="grid cols-2" style="max-width:820px">
        <div class="card">
          <h3>X% от числа</h3>
          <div class="field-row">
            <div class="field"><label>Число</label><input type="number" id="p-a" value="2500"></div>
            <div class="field"><label>Процент</label><input type="number" id="p-b" value="15"></div>
          </div>
          <button class="btn primary" data-action="tool-percent">Посчитать</button>
          <div class="tool-out" id="p-out" style="margin-top:12px">—</div>
        </div>
        <div class="card">
          <h3>Изменение с A на B, %</h3>
          <div class="field-row">
            <div class="field"><label>Было</label><input type="number" id="pc-a" value="3200"></div>
            <div class="field"><label>Стало</label><input type="number" id="pc-b" value="2900"></div>
          </div>
          <button class="btn primary" data-action="tool-percent-change">Посчитать</button>
          <div class="tool-out" id="pc-out" style="margin-top:12px">—</div>
        </div>
      </div>`,

    dates: (t) => head(t) + `
      <div class="card" style="max-width:520px">
        <div class="field-row">
          <div class="field"><label>Первая дата</label><input type="date" id="d1"></div>
          <div class="field"><label>Вторая дата</label><input type="date" id="d2"></div>
        </div>
        <button class="btn primary" data-action="tool-dates">Посчитать</button>
        <div class="tool-out" id="d-out" style="margin-top:12px">—</div>
      </div>`,

    units: (t) => head(t) + `
      <div class="card" style="max-width:560px">
        <div class="field-row">
          <div class="field"><label>Значение</label><input type="number" id="u-v" value="10"></div>
          <div class="field"><label>Из</label><select id="u-from"><option>км</option><option>м</option><option>мили</option><option>кг</option><option>фунты</option><option>°C</option><option>°F</option></select></div>
          <div class="field"><label>В</label><select id="u-to"><option>км</option><option selected>м</option><option>мили</option><option>кг</option><option>фунты</option><option>°C</option><option>°F</option></select></div>
        </div>
        <button class="btn primary" data-action="tool-units">Конвертировать</button>
        <div class="tool-out" id="u-out" style="margin-top:12px">—</div>
      </div>`,

    fuel: (t) => head(t) + `
      <div class="grid cols-2" style="max-width:820px">
        <div class="card">
          <h3>Стоимость заправки</h3>
          <div class="field-row">
            <div class="field"><label>Литры</label><input type="number" id="f-l" value="42"></div>
            <div class="field"><label>Цена литра, ₽</label><input type="number" id="f-p" value="76.2" step="0.1"></div>
          </div>
          <button class="btn primary" data-action="tool-fuel">Посчитать</button>
          <div class="tool-out" id="f-out" style="margin-top:12px">—</div>
        </div>
        <div class="card">
          <h3>Расход на 100 км</h3>
          <div class="field-row">
            <div class="field"><label>Литры</label><input type="number" id="fc-l" value="42"></div>
            <div class="field"><label>Км на баке</label><input type="number" id="fc-k" value="570"></div>
          </div>
          <button class="btn primary" data-action="tool-fuel-cons">Посчитать</button>
          <div class="tool-out" id="fc-out" style="margin-top:12px">—</div>
        </div>
      </div>`,

    trip: (t) => head(t) + `
      <div class="card" style="max-width:560px">
        <div class="field-row">
          <div class="field"><label>Расстояние, км</label><input type="number" id="tr-k" value="720"></div>
          <div class="field"><label>Расход, л/100км</label><input type="number" id="tr-c" value="7.4" step="0.1"></div>
          <div class="field"><label>Цена литра, ₽</label><input type="number" id="tr-p" value="76.2" step="0.1"></div>
        </div>
        <button class="btn primary" data-action="tool-trip">Посчитать</button>
        <div class="tool-out" id="tr-out" style="margin-top:12px">—</div>
      </div>`,

    pass: (t) => head(t) + `
      <div class="card" style="max-width:520px">
        <div class="field"><label>Длина: <span id="pw-len-v">16</span></label>
          <div class="slider-row"><input type="range" id="pw-len" min="6" max="64" value="16"><span class="val"></span></div></div>
        <div class="set-row"><div class="grow"><div class="t">Символы !@#$%</div></div><input type="checkbox" id="pw-sym" checked></div>
        <div class="set-row"><div class="grow"><div class="t">Цифры</div></div><input type="checkbox" id="pw-num" checked></div>
        <div class="btn-row" style="margin-top:14px">
          <button class="btn primary" data-action="tool-pass">Сгенерировать</button>
          <button class="btn" data-action="tool-pass-copy">Скопировать</button>
        </div>
        <div class="tool-out" id="pw-out" style="margin-top:12px">—</div>
        <div class="s" style="color:var(--muted);font-size:.8rem;margin-top:8px">Генерация — только в браузере, никуда не отправляется.</div>
      </div>`,

    base64: (t) => head(t) + `
      <div class="card" style="max-width:640px">
        <div class="field"><label>Текст</label><textarea id="b64-in" style="min-height:70px">Привет, Aven!</textarea></div>
        <div class="btn-row"><button class="btn primary" data-action="tool-b64-enc">Кодировать</button><button class="btn" data-action="tool-b64-dec">Декодировать</button></div>
        <div class="tool-out" id="b64-out" style="margin-top:12px">—</div>
      </div>`,

    url: (t) => head(t) + `
      <div class="card" style="max-width:640px">
        <div class="field"><label>Текст / URL</label><textarea id="url-in" style="min-height:70px">https://aven.demo/поиск?q=Aven прототип</textarea></div>
        <div class="btn-row"><button class="btn primary" data-action="tool-url-enc">Кодировать</button><button class="btn" data-action="tool-url-dec">Декодировать</button></div>
        <div class="tool-out" id="url-out" style="margin-top:12px">—</div>
      </div>`,

    unix: (t) => head(t) + `
      <div class="card" style="max-width:640px">
        <div class="field-row">
          <div class="field"><label>Дата и время</label><input type="datetime-local" id="ux-d"></div>
          <div class="field"><label>Unix timestamp</label><input type="number" id="ux-t" placeholder="1758798000"></div>
        </div>
        <div class="btn-row">
          <button class="btn primary" data-action="tool-unix-to">Дата → Timestamp</button>
          <button class="btn" data-action="tool-unix-from">Timestamp → Дата</button>
          <button class="btn" data-action="tool-unix-now">Сейчас</button>
        </div>
        <div class="tool-out" id="ux-out" style="margin-top:12px">—</div>
      </div>`,

    uuid: (t) => head(t) + `
      <div class="card" style="max-width:640px">
        <div class="field"><label>Количество</label><input type="number" id="uu-n" value="3" min="1" max="20"></div>
        <button class="btn primary" data-action="tool-uuid">Сгенерировать</button>
        <div class="tool-out" id="uu-out" style="margin-top:12px">—</div>
      </div>`,

    json: (t) => head(t) + `
      <div class="card" style="max-width:720px">
        <div class="field"><label>JSON</label><textarea id="js-in" style="min-height:120px">{"user":"Алексей","cars":[{"model":"BMW 530d","year":2018}]}</textarea></div>
        <div class="btn-row">
          <button class="btn primary" data-action="tool-json">Форматировать</button>
          <button class="btn" data-action="tool-json-min">Сжать</button>
        </div>
        <div class="tool-out" id="js-out" style="margin-top:12px">—</div>
      </div>`,

    diff: (t) => head(t) + `
      <div class="card" style="max-width:760px">
        <div class="grid cols-2">
          <div class="field"><label>Текст A</label><textarea id="df-a" style="min-height:110px">Aven — помощник
версия демо
третья строка</textarea></div>
          <div class="field"><label>Текст B</label><textarea id="df-b" style="min-height:110px">Aven — помощник
версия прототипа
третья строка
новая строка</textarea></div>
        </div>
        <button class="btn primary" data-action="tool-diff">Сравнить</button>
        <div class="tool-out" id="df-out" style="margin-top:12px">—</div>
      </div>`
  };

  /* ---------- логика простых функций ---------- */
  function drawQr() {
    const cv = document.getElementById('qr-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const n = 21, cell = cv.width / n;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#111';
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const inFinder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
      if (!inFinder && rnd() > 0.52) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
    function finder(fx, fy) {
      ctx.fillStyle = '#111';
      ctx.fillRect(fx * cell, fy * cell, 7 * cell, 7 * cell);
      ctx.fillStyle = '#fff';
      ctx.fillRect((fx + 1) * cell, (fy + 1) * cell, 5 * cell, 5 * cell);
      ctx.fillStyle = '#111';
      ctx.fillRect((fx + 2) * cell, (fy + 2) * cell, 3 * cell, 3 * cell);
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  }

  const num = (id) => parseFloat((document.getElementById(id) || {}).value || '0');
  const out = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  function uuidv4() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  A.register({
    'tool-open': (el) => { currentTool = el.dataset.id; A.render(); if (currentTool === 'qr') setTimeout(drawQr, 40); },
    'tool-back': () => { currentTool = null; A.render(); },

    'tool-percent': () => out('p-out', `${num('p-b')}% от ${num('p-a').toLocaleString('ru-RU')} = ${(num('p-a') * num('p-b') / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`),
    'tool-percent-change': () => {
      const a = num('pc-a'), b = num('pc-b');
      if (!a) return out('pc-out', 'Деление на ноль');
      out('pc-out', `Изменение: ${((b - a) / a * 100).toFixed(2)}%`);
    },
    'tool-dates': () => {
      const v1 = (document.getElementById('d1') || {}).value, v2 = (document.getElementById('d2') || {}).value;
      if (!v1 || !v2) return out('d-out', 'Выберите обе даты');
      const days = Math.round((new Date(v2) - new Date(v1)) / 86400000);
      out('d-out', `Разница: ${days} дн. (${(days / 7).toFixed(1)} нед.)`);
    },
    'tool-units': () => {
      const v = num('u-v'), f = (document.getElementById('u-from') || {}).value, to = (document.getElementById('u-to') || {}).value;
      const len = { 'км': 1000, 'м': 1, 'мили': 1609.34 };
      const w = { 'кг': 1, 'фунты': 0.4536 };
      try {
        if (f === '°C' && to === '°F') return out('u-out', `${v} °C = ${(v * 9 / 5 + 32).toFixed(1)} °F`);
        if (f === '°F' && to === '°C') return out('u-out', `${v} °F = ${((v - 32) * 5 / 9).toFixed(1)} °C`);
        if (len[f] && len[to]) return out('u-out', `${v} ${f} = ${(v * len[f] / len[to]).toFixed(3)} ${to}`);
        if (w[f] && w[to]) return out('u-out', `${v} ${f} = ${(v * w[f] / w[to]).toFixed(3)} ${to}`);
        out('u-out', 'Эта пара единиц в демо не конвертируется');
      } catch (e) { out('u-out', 'Ошибка'); }
    },
    'tool-fuel': () => out('f-out', `Стоимость: ${(num('f-l') * num('f-p')).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`),
    'tool-fuel-cons': () => {
      const k = num('fc-k');
      out('fc-out', k ? `Расход: ${(num('fc-l') / k * 100).toFixed(1)} л / 100 км` : 'Км не могут быть нулём');
    },
    'tool-trip': () => {
      const liters = num('tr-k') * num('tr-c') / 100;
      out('tr-out', `Топливо: ${liters.toFixed(1)} л · Стоимость: ${(liters * num('tr-p')).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`);
    },
    'tool-pass': () => {
      const len = num('pw-len') || 16;
      let abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
      if ((document.getElementById('pw-num') || {}).checked) abc += '23456789';
      if ((document.getElementById('pw-sym') || {}).checked) abc += '!@#$%^&*-_=+';
      let res = '';
      const arr = window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(len)) : null;
      for (let i = 0; i < len; i++) {
        const r = arr ? arr[i] / 4294967296 : Math.random();
        res += abc[Math.floor(r * abc.length)];
      }
      out('pw-out', res);
    },
    'tool-pass-copy': () => {
      const el = document.getElementById('pw-out');
      if (el && el.textContent && el.textContent !== '—') {
        (navigator.clipboard && navigator.clipboard.writeText(el.textContent)) || A.toast('Копирование недоступно в этом браузере');
        A.toast('Скопировано (демо)');
      }
    },
    'tool-b64-enc': () => {
      try { out('b64-out', btoa(unescape(encodeURIComponent((document.getElementById('b64-in') || {}).value || '')))); }
      catch (e) { out('b64-out', 'Ошибка кодирования'); }
    },
    'tool-b64-dec': () => {
      try { out('b64-out', decodeURIComponent(escape(atob((document.getElementById('b64-in') || {}).value || '').replace(/\s/g, '')))); }
      catch (e) { out('b64-out', 'Некорректный Base64'); }
    },
    'tool-url-enc': () => out('url-out', encodeURIComponent((document.getElementById('url-in') || {}).value || '')),
    'tool-url-dec': () => {
      try { out('url-out', decodeURIComponent((document.getElementById('url-in') || {}).value || '')); }
      catch (e) { out('url-out', 'Некорректная строка'); }
    },
    'tool-unix-to': () => {
      const v = (document.getElementById('ux-d') || {}).value;
      out('ux-out', v ? `Timestamp: ${Math.floor(new Date(v).getTime() / 1000)}` : 'Выберите дату');
    },
    'tool-unix-from': () => {
      const t = num('ux-t');
      out('ux-out', t ? new Date(t * 1000).toLocaleString('ru-RU') : 'Введите timestamp');
    },
    'tool-unix-now': () => out('ux-out', `Сейчас: ${Math.floor(Date.now() / 1000)}`),
    'tool-uuid': () => {
      const n = Math.min(20, Math.max(1, num('uu-n') || 1));
      out('uu-out', Array.from({ length: n }, uuidv4).join('\n'));
    },
    'tool-json': () => {
      try { out('js-out', JSON.stringify(JSON.parse((document.getElementById('js-in') || {}).value || '{}'), null, 2)); }
      catch (e) { out('js-out', 'Ошибка JSON: ' + e.message); }
    },
    'tool-json-min': () => {
      try { out('js-out', JSON.stringify(JSON.parse((document.getElementById('js-in') || {}).value || '{}'))); }
      catch (e) { out('js-out', 'Ошибка JSON: ' + e.message); }
    },
    'tool-diff': () => {
      const a = ((document.getElementById('df-a') || {}).value || '').split('\n');
      const b = ((document.getElementById('df-b') || {}).value || '').split('\n');
      const rows = [];
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i++) {
        if (a[i] === b[i]) rows.push(`<div>${A.esc(a[i] == null ? '' : a[i])}</div>`);
        else {
          if (a[i] !== undefined) rows.push(`<div class="diff-del">− ${A.esc(a[i])}</div>`);
          if (b[i] !== undefined) rows.push(`<div class="diff-add">+ ${A.esc(b[i])}</div>`);
        }
      }
      out('df-out', '') ;
      const o = document.getElementById('df-out');
      if (o) { o.style.whiteSpace = 'normal'; o.innerHTML = rows.join(''); }
    }
  });

})();
