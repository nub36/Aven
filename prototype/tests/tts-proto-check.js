/* Проверка голосового пути прототипа Aven: Natural TTS end-to-end (контракт, воспроизведение,
   состояния, честный fallback) — сценарии A–J из постановки «Natural Voice Female Aven» (§22),
   плюс §18: vd17-design по умолчанию + миграция, cold start (двухстадийный health),
   «адрес не задан» на GitHub Pages, кнопка «Проверить backend» (health + настоящий синтез),
   произвольная фраза (приёмочный критерий Natural Voice).

   Это разработческий инструмент, НЕ часть приложения и не зависимость продукта:
   jsdom ставится во временный каталог (см. ниже), в репозитории package.json/node_modules нет.

   Запуск (из корня репозитория):
     mkdir -p /tmp/lab && cd /tmp/lab && npm init -y && npm install jsdom@30 && cd -
     NODE_PATH=/tmp/lab/node_modules node prototype/tests/tts-proto-check.js

   Что проверяется РЕАЛЬНО: весь frontend-путь — normalize → выбор провайдера → fetch-контракт
   (POST /api/tts/synthesize, GET /api/tts/health) → blob → воспроизведение → presence
   («Готовлю речь…/Говорю · Natural/Говорю · системный голос/Готова») → stop/прерывание →
   честные тосты fallback. Сеть/Audio/speechSynthesis — стабы, потому что jsdom их не имеет.
   Что ЗДЕСЬ НЕ проверяется (честно): сам синтез Qwen3 — он возможен только на GPU-бэкенде
   (research/tts/runtime/ — GPU-ПК или Modal); серверный контракт без модели — research/tts/tests/
   dryrun_server_qwen3.py. Mixed-content guard (https-страница → http-сервер) здесь не
   воспроизводится: страница теста открыта по http — покрыто код-ревью провайдера. */
let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.error('Не найден модуль jsdom. Установите его во временный каталог и запустите с NODE_PATH:\\n' +
    '  mkdir -p /tmp/lab && cd /tmp/lab && npm init -y && npm install jsdom@30\\n' +
    '  NODE_PATH=/tmp/lab/node_modules node prototype/tests/tts-proto-check.js');
  process.exit(2);
}
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8098;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
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
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

/* ---- минимальный настоящий RIFF/WAV (стаб только транспорта, байты корректные) ---- */
function wavBytes() {
  const n = 800; // 0,05 с PCM 8 кГц — достаточно для пути «получили аудио»
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(16000, 28); buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(12000 * Math.sin(i / 3)), 44 + i * 2);
  return buf;
}
const WAV64 = wavBytes().toString('base64');

/** Стабы окружения внутри страницы: fetch (по режиму), Audio (управляемый), speechSynthesis. */
async function load(hash, mode, opts) {
  opts = opts || {};
  const dom = await JSDOM.fromURL(BASE + 'index.html' + (hash || ''), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(window) { // предзаполненный localStorage (миграции/старые сохранённые состояния)
      if (opts.seed) { try { window.localStorage.setItem('aven-proto-v1', JSON.stringify(opts.seed)); } catch (e) { /* noop */ } }
    }
  });
  await sleep(700);
  const w = dom.window, d = w.document;

  // jsdom не имеет URL.createObjectURL/revokeObjectURL — полифилл того же контракта
  let blobSeq = 0;
  w.URL.createObjectURL = function (blob) { return 'blob:mock-' + (++blobSeq) + ':' + blob.size; };
  w.URL.revokeObjectURL = function () {};

  // управляемый Audio: onplaying через 5 мс, onended через audioMs мс (null — не заканчивается)
  w.__audioMs = opts.audioMs != null ? opts.audioMs : 300;
  w.__audios = [];
  const Audios = w.__audios;
  w.Audio = class {
    constructor() { this.preload = ''; this.volume = 1; this._src = ''; this.paused = false; this._playing = false; Audios.push(this); }
    set src(v) { this._src = v; }
    get src() { return this._src; }
    play() {
      this._playing = true;
      setTimeout(() => { if (this._playing) this.onplaying && this.onplaying(); }, 5);
      if (w.__audioMs != null) setTimeout(() => { if (this._playing) { this._playing = false; this.onended && this.onended(); } }, w.__audioMs);
      return Promise.resolve();
    }
    pause() { this._playing = false; this.paused = true; if (this.onpause) this.onpause(); }
  };

  // speechSynthesis-стаб (jsdom его не имеет): тот же контракт, что ждёт SystemTTSProvider
  w.__speechMs = opts.speechMs != null ? opts.speechMs : 250;
  w.__uttered = [];
  w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; } };
  w.speechSynthesis = {
    getVoices: () => [{ voiceURI: 'ru-test', name: 'RU Test Voice', lang: 'ru-RU', localService: true }],
    speak(u) {
      w.__uttered.push(u); w.__curUtt = u;
      setTimeout(() => { if (!u._dead) u.onstart && u.onstart(); }, 5);
      if (w.__speechMs != null) setTimeout(() => { if (!u._dead) { u._dead = true; u.onend && u.onend(); } }, w.__speechMs);
    },
    cancel() { const u = w.__curUtt; if (u && !u._dead) { u._dead = true; if (u.onerror) u.onerror({ error: 'canceled' }); } }
  };

  // fetch-стаб по режиму; в jsdom fetch нет, поэтому отвечаем объектом той же формы
  w.__synthLog = [];
  const jsonRes = (status, obj) => ({ ok: status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj), blob: async () => new w.Blob([]) });
  w.fetch = (url, fopts) => {
    fopts = fopts || {};
    if (mode === 'network') return Promise.reject(new TypeError('Failed to fetch'));
    if (mode === '404') return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => 'nf', blob: async () => new w.Blob([]) });
    if (url.indexOf('/api/tts/health') >= 0) {
      return Promise.resolve(jsonRes(200, {
        ok: true, status: 'ok', server: 'aven-tts-research', version: '0.3.0',
        engines: { qwen3: { voices: ['qwen3/vd17-design'], supports_rate: false, model: 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', device: 'cuda', load_s: 8.2 } },
        voices: [{ id: 'qwen3/vd17-design', label: 'Qwen3 · vd17-design (Natural Female Aven)', engine: 'qwen3', license: 'Apache-2.0', commercial: 'yes' }],
        uptime_s: 12.5, max_chars: 600
      }));
    }
    if (url.indexOf('/api/tts/synthesize') >= 0) {
      const body = JSON.parse(fopts.body || '{}');
      w.__synthLog.push(body);
      if (mode === 'synth-hang') {
        return new Promise((resolve, reject) => {
          fopts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
        });
      }
      const bytes = Uint8Array.from(w.atob(WAV64), (c) => c.charCodeAt(0));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => '', blob: async () => new w.Blob([bytes], { type: 'audio/wav' }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => 'nf', blob: async () => new w.Blob([]) });
  };

  async function waitFor(cond, ms, what) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 6000)) { if (cond()) return true; await sleep(25); }
    throw new Error('waitFor timeout: ' + (what || '?'));
  }
  return {
    dom, w, d, waitFor,
    q: (sel) => d.querySelector(sel),
    qa: (sel) => Array.from(d.querySelectorAll(sel)),
    st: () => w.AvenState.s(),
    click: (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })),
    change: (el) => el && el.dispatchEvent(new w.Event('change', { bubbles: true })),
    go: async (h) => { w.location.hash = h; await sleep(180); },
    presence: () => w.AvenPresence && w.AvenPresence.get(),
    toastText: () => { const t = d.querySelectorAll('#toasts .toast'); return t.length ? t[t.length - 1].textContent : ''; },
    norm: (t) => w.AvenSpeechText.normalize(t),
    setNatural: () => {
      const v = p_voice();
      v.engine = 'natural'; v.enabled = true; v.alwaysVoice = true;
      v.natural.voice = 'qwen3/vd17-design'; v.natural.serverUrl = 'http://tts.test';
      w.AvenState.save();
      function p_voice() { return w.AvenState.s().settings.voice; }
    }
  };
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  /* ============ S. Настройки → Голос: честный статус сервера и vd17-design по умолчанию (§14, §18) ============ */
  {
    // S0: свежее состояние — голос Natural по умолчанию qwen3/vd17-design (решение владельца)
    const p0 = await load('#/settings', 'ok');
    ok('S0 голос Natural по умолчанию — qwen3/vd17-design', p0.st().settings.voice.natural.voice === 'qwen3/vd17-design',
      p0.st().settings.voice.natural.voice);
    p0.st().settings.voice.engine = 'natural'; // раздел Natural рендерится при движке natural
    p0.w.AvenState.save();
    p0.click(p0.q('[data-action="set-cat"][data-id="voice"]'));
    await sleep(150);
    const sel0 = p0.q('[data-action="set-natural-voice"]');
    ok('S0a в списке кандидатов выбран именно vd17-design', sel0 && sel0.value === 'qwen3/vd17-design', sel0 && sel0.value);
    p0.dom.window.close();

    // S0b: миграция старого localStorage с пустым natural.voice → vd17-design
    const p0b = await load('#/settings', 'ok');
    p0b.st().settings.voice.natural.voice = '';
    p0b.w.AvenState.save();
    p0b.dom.window.close();
    const p0c = await load('#/settings', 'ok');
    ok('S0b миграция: пустой natural.voice → qwen3/vd17-design', p0c.st().settings.voice.natural.voice === 'qwen3/vd17-design',
      p0c.st().settings.voice.natural.voice);
    p0c.dom.window.close();

    const p = await load('#/settings', 'ok');
    p.setNatural();
    p.click(p.q('[data-action="set-cat"][data-id="voice"]'));
    await sleep(250);
    await p.waitFor(() => { const el = p.q('#tts-server-status'); return el && el.textContent.indexOf('подключён') >= 0; }, 8000, 'server status ok');
    ok('S1 health: статус «подключён» с сервером/движком (c устройство)/голосами/vd17', (() => {
      const t = p.q('#tts-server-status').textContent;
      return t.indexOf('подключён') >= 0 && t.indexOf('aven-tts-research 0.3.0') >= 0 && t.indexOf('qwen3 (cuda)') >= 0 && t.indexOf('голосов: 1') >= 0 && t.indexOf('vd17-design доступен') >= 0;
    })(), p.q('#tts-server-status').textContent);
    ok('S2 latency показан (… мс)', (p.q('#tts-server-status').textContent.match(/·\s*\d+\s*мс/) || null) !== null);
    ok('S3 поле таймаута Natural существует со значением по умолчанию 10', (() => {
      const el = p.q('[data-action="set-natural-timeout"]');
      return el && el.value === '10';
    })(), p.q('[data-action="set-natural-timeout"]') ? 'есть' : 'нет поля');
    ok('S3a подсказки «нет hint при подключённом сервере»', (p.q('#tts-server-hint') || { textContent: '' }).textContent === '');
    p.dom.window.close();

    const p2 = await load('#/settings', '404');
    p2.setNatural();
    p2.click(p2.q('[data-action="set-cat"][data-id="voice"]'));
    await p2.waitFor(() => { const el = p2.q('#tts-server-status'); return el && el.textContent.indexOf('НЕ подключён') >= 0; }, 8000, 'server status 404');
    ok('S4 HTTP 404: честная причина с подсказкой про endpoint', (() => {
      const t = p2.q('#tts-server-status').textContent;
      return t.indexOf('HTTP 404') >= 0 && t.indexOf('НЕ Aven TTS server') >= 0;
    })(), p2.q('#tts-server-status').textContent);
    p2.dom.window.close();

    const p3 = await load('#/settings', 'network');
    p3.setNatural();
    p3.click(p3.q('[data-action="set-cat"][data-id="voice"]'));
    await p3.waitFor(() => { const el = p3.q('#tts-server-status'); return el && el.textContent.indexOf('НЕ подключён') >= 0; }, 8000, 'server status network');
    ok('S5 сеть/CORS: причина перечислена честно', p3.q('#tts-server-status').textContent.indexOf('сеть/CORS') >= 0, p3.q('#tts-server-status').textContent);
    ok('S5a подсказка при отключённом backend честно объясняет, что делать', (p3.q('#tts-server-hint') || { textContent: '' }).textContent.indexOf('deploy-modal.sh') >= 0, p3.q('#tts-server-hint') && p3.q('#tts-server-hint').textContent.slice(0, 80));
    p3.dom.window.close();

    // S6: сервер молчит совсем — быстрый probe (3 с) + терпеливый повтор (тест ускоряет до 1,5 с)
    const p4 = await load('#/settings', 'synth-hang');
    p4.setNatural();
    p4.w.__AVEN_TTS_TEST_WAKE_MS = 1500; // хук теста: вторая стадия проверки короче
    let healthCalls = 0;
    p4.w.fetch = (url, fo) => new Promise((resolve, reject) => { // health «молчит», пока таймаут не прервёт
      healthCalls++;
      const sig = fo && fo.signal;
      if (sig) sig.addEventListener('abort', () => { const er = new Error('aborted'); er.name = 'AbortError'; reject(er); });
      else setTimeout(() => { const er = new Error('mock dead'); reject(er); }, 20000);
    });
    p4.click(p4.q('[data-action="set-cat"][data-id="voice"]'));
    await p4.waitFor(() => { const el = p4.q('#tts-server-status'); return el && el.textContent.indexOf('timeout') >= 0; }, 12000, 'server status timeout');
    ok('S6 health timeout: честный «timeout» после двух стадий (3 с + повтор)', p4.q('#tts-server-status').textContent.indexOf('timeout') >= 0 && healthCalls === 2,
      p4.q('#tts-server-status').textContent + ' | calls=' + healthCalls);
    p4.dom.window.close();

    // S7: cold start serverless (Modal) — первый health висит (контейнер грузится), второй успешен
    const p7 = await load('#/settings', 'ok');
    p7.setNatural();
    p7.w.__AVEN_TTS_TEST_WAKE_MS = 60000;
    let wakeSeen = false;
    const okHealth = () => Promise.resolve({
      ok: true, status: 200,
      json: async () => ({
        ok: true, status: 'ok', server: 'aven-tts-modal', version: '0.3.0',
        engines: { qwen3: { voices: ['qwen3/vd17-design'], device: 'cuda' } },
        voices: [{ id: 'qwen3/vd17-design', label: 'Qwen3 · vd17-design', engine: 'qwen3', license: 'Apache-2.0', commercial: 'yes' }]
      }),
      text: async () => '', blob: async () => new p7.w.Blob([])
    });
    let calls7 = 0;
    p7.w.fetch = (url, fo) => {
      if (url.indexOf('/api/tts/health') < 0) return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => 'nf', blob: async () => new p7.w.Blob([]) });
      calls7++;
      if (calls7 === 1) return new Promise((resolve, reject) => { // cold start: висим до abort
        const sig = fo && fo.signal;
        sig.addEventListener('abort', () => { const er = new Error('aborted'); er.name = 'AbortError'; reject(er); });
      });
      return okHealth();
    };
    const st7 = await p7.w.AvenTTS.checkServer(true, () => { wakeSeen = true; });
    ok('S7 cold start: onWaking вызван, терпеливый повтор успешен', wakeSeen === true && st7.ok === true && st7.voices.length === 1 && calls7 === 2,
      'wake=' + wakeSeen + ' ok=' + st7.ok + ' calls=' + calls7);
    p7.dom.window.close();

    // S8: GitHub Pages (https) без адреса сервера — сразу честное «не подключён», без запроса
    const p8 = await load('#/settings', 'ok');
    p8.setNatural();
    p8.st().settings.voice.natural.serverUrl = '';
    p8.w.AvenState.save();
    let fetches8 = 0;
    const realFetch8 = p8.w.fetch;
    p8.w.fetch = (u, fo) => { fetches8++; return realFetch8(u, fo); };
    p8.dom.reconfigure({ url: 'https://nub36.github.io/Aven/#/settings' }); // страница «как на GitHub Pages»
    await sleep(200); // jsdom reconfigure: даём событийному циклу settle до клика
    p8.click(p8.q('[data-action="set-cat"][data-id="voice"]'));
    await p8.waitFor(() => { const el = p8.q('#tts-server-status'); return el && el.textContent.indexOf('НЕ подключён') >= 0; }, 6000, 'no-base status');
    ok('S8 https без адреса: «статический хостинг… не может» и запроса не было',
      p8.q('#tts-server-status').textContent.indexOf('статический хостинг') >= 0 && fetches8 === 0,
      p8.q('#tts-server-status').textContent + ' | fetches=' + fetches8);
    p8.dom.window.close();

    // S11: страницу отдаёт сам TTS-сервер по HTTPS (например https://tts--…modal.run/):
    // пустое поле сервера = «тот же адрес» → health по относительному пути (same-origin, без CORS)
    const p11 = await load('#/settings', 'ok');
    p11.setNatural();
    p11.st().settings.voice.natural.serverUrl = '';
    p11.w.AvenState.save();
    let seenUrl11 = '';
    const realFetch11 = p11.w.fetch;
    p11.w.fetch = (u, fo) => { if (String(u).indexOf('/api/tts/health') >= 0) seenUrl11 = String(u); return realFetch11(u, fo); };
    p11.dom.reconfigure({ url: 'https://tts--aven-tts-demo.modal.run/#/settings' });
    await sleep(200); // jsdom reconfigure: даём событийному циклу settle до клика
    p11.click(p11.q('[data-action="set-cat"][data-id="voice"]'));
    await p11.waitFor(() => { const el = p11.q('#tts-server-status'); return el && el.textContent.indexOf('подключён') >= 0; }, 6000, 'same-origin status');
    ok('S11 same-origin (…modal.run): пустое поле → относительный /api/tts/health, «подключён»',
      seenUrl11 === '/api/tts/health' && p11.q('#tts-server-status').textContent.indexOf('подключён') >= 0,
      'seenUrl=' + seenUrl11);
    p11.dom.window.close();

    // S9: кнопка «Проверить backend» — health + НАСТОЯЩИЙ синтез пробной фразы vd17-design
    const p9 = await load('#/settings', 'ok');
    p9.setNatural();
    p9.click(p9.q('[data-action="set-cat"][data-id="voice"]'));
    await p9.waitFor(() => { const el = p9.q('#tts-server-status'); return el && el.textContent.indexOf('подключён') >= 0; }, 8000, 'S9 health');
    p9.click(p9.q('[data-action="tts-check-server"]'));
    await p9.waitFor(() => { const el = p9.q('#tts-server-status'); return el && el.textContent.indexOf('настоящий синтез vd17-design проверен') >= 0; }, 8000, 'S9 deep check');
    ok('S9 deep check: пробная фраза ушла в POST synthesize голосом vd17-design',
      p9.w.__synthLog.length === 1 && p9.w.__synthLog[0].voice === 'qwen3/vd17-design' && p9.w.__synthLog[0].text === 'Проверка Natural Voice.',
      JSON.stringify(p9.w.__synthLog[0]));
    ok('S9a звук реально проигран (Audio создан)', p9.w.__audios.length >= 1);
    p9.dom.window.close();

    // S10: произвольная фраза (критерий приёмки) — текста нет среди готовых MP3
    const p10 = await load('#/settings', 'ok');
    p10.setNatural();
    p10.click(p10.q('[data-action="set-cat"][data-id="voice"]'));
    await p10.waitFor(() => { const el = p10.q('#tts-server-status'); return el && el.textContent.indexOf('подключён') >= 0; }, 8000, 'S10 health');
    const phrase10 = 'Алексей, сегодня двадцать шестое сентября. Aven проверяет настоящий натуральный голос.';
    p10.q('#tts-arb-in').value = phrase10;
    p10.click(p10.q('[data-action="tts-speak-arbitrary"]'));
    await p10.waitFor(() => p10.w.__synthLog.length === 1, 6000, 'S10 synthesize');
    ok('S10 произвольная фраза ушла настоящему серверу голосом vd17-design (нормализованная)',
      p10.w.__synthLog[0].voice === 'qwen3/vd17-design' && p10.w.__synthLog[0].text === p10.norm(phrase10),
      JSON.stringify(p10.w.__synthLog[0]));
    p10.dom.window.close();
  }

  /* ============ A. Главная: «Что у меня сегодня?» → Natural end-to-end (§2, §23) ============ */
  {
    const p = await load('#/home', 'ok');
    p.setNatural();
    p.q('#home-cmd').value = 'Что у меня сегодня?';
    p.click(p.q('[data-action="home-cmd-send"]'));
    // ждём именно НАШ ответ: Assistant сидируется двумя демо-репликами, их нельзя принять за него
    await p.waitFor(() => p.w.__synthLog.length === 1, 6000, 'synthesize POST');
    const shown = p.qa('.msg.aven').pop().textContent.replace(/🔊 Озвучить\s*$/, '').trim();
    ok('A1 demo-ответ показан текстом (экранный не изменён)', shown.indexOf('Сегодня: стоматолог в 10:00') >= 0, shown.slice(0, 60));
    ok('A2 ответ ушёл в POST /api/tts/synthesize голосом vd17-design', p.w.__synthLog[0].voice === 'qwen3/vd17-design');
    ok('A3 в синтез ушёл НОРМАЛИЗОВАННЫЙ текст (= normalize экранного)', p.w.__synthLog[0].text === p.norm(shown),
      (p.w.__synthLog[0].text || '').slice(0, 90));
    await p.waitFor(() => p.presence() === 'speaking', 3000, 'speaking');
    ok('A4 состояние: speaking («Говорю…») во время воспроизведения', true);
    await p.waitFor(() => p.presence() === 'idle', 3000, 'idle');
    ok('A5 состояние после окончания: idle («Готова»)', true);
    const st = p.w.AvenTTS.stats;
    ok('A6 источник честно «self-hosted сервер», latency измерен', st.lastSource === 'self-hosted сервер' && st.lastLatencyMs != null, st.lastSource + ' · ' + st.lastLatencyMs);
    ok('A7 НЕТ тоста fallback (Natural реально прозвучал)', p.toastText().indexOf('системный голос') < 0, p.toastText());
    p.dom.window.close();
  }

  /* ============ B/C. Деньги и пробег через Главную → нормализация чисел (§10) ============ */
  {
    const p = await load('#/home', 'ok');
    p.setNatural();
    p.q('#home-cmd').value = 'Сколько я сегодня потратил?';
    p.click(p.q('[data-action="home-cmd-send"]'));
    await p.waitFor(() => p.w.__synthLog.length === 1, 6000, 'synth B');
    ok('B1 «Сколько я сегодня потратил?» → деньги словами («…рублей», без цифр)', /рубл/i.test(p.w.__synthLog[0].text) && !/\d/.test(p.w.__synthLog[0].text),
      p.w.__synthLog[0].text);
    await p.waitFor(() => p.presence() === 'idle', 4000, 'idle B');

    // тот же ассистент: второй вопрос про пробег
    const inp = p.q('#chat-input');
    inp.value = 'Какой пробег?';
    p.click(p.q('[data-action="chat-send"]'));
    await p.waitFor(() => p.w.__synthLog.length === 2, 6000, 'synth C');
    const cText = p.w.__synthLog[1].text;
    ok('C1 «Какой пробег?» → автомобильный ответ со 104 520 км словами', cText.indexOf('сто четыре тысячи пятьсот двадцать километров') >= 0, cText);
    ok('C2 экранный текст при этом остался с цифрами', p.qa('.msg.aven').pop().textContent.indexOf('104 520 км') >= 0);
    p.dom.window.close();
  }

  /* ============ D/E. Прямые speak: время «пятнадцать минут» + лейблы Natural (§11) ============ */
  {
    const p = await load('#/home', 'ok');
    p.setNatural();
    p.w.AvenTTS.speak('Через пятнадцать минут вам нужно выходить.');
    await p.waitFor(() => p.w.__synthLog.length === 1, 4000, 'synth D');
    ok('D1 фраза без цифр ушла неизменённой', p.w.__synthLog[0].text === 'Через пятнадцать минут вам нужно выходить.', p.w.__synthLog[0].text);
    await p.waitFor(() => p.presence() === 'idle', 4000, 'idle D');

    p.w.AvenTTS.speak('Готово.');
    await p.waitFor(() => p.presence() === 'speaking', 4000, 'speaking E');
    const stEl = p.q('.aven-state');
    ok('E1 лейбл состояния на Главной: «● Говорю · Natural»', stEl && stEl.textContent === '● Говорю · Natural', stEl && stEl.textContent);
    await p.waitFor(() => p.presence() === 'idle', 4000, 'idle E');
    ok('E2 после окончания: «● Готова»', stEl && stEl.textContent === '● Готова', stEl && stEl.textContent);
    p.dom.window.close();
  }

  /* ============ F. Сервер недоступен → честный fallback на System TTS (§2, §11) ============ */
  {
    const p = await load('#/home', 'network');
    p.setNatural();
    p.w.AvenTTS.speak('Сегодня записано расходов на 3 420 ₽.');
    await p.waitFor(() => p.w.__uttered.length === 1, 5000, 'system speech F');
    ok('F1 fallback: заговорил System TTS тем же нормализованным текстом', p.w.__uttered[0].text === p.norm('Сегодня записано расходов на 3 420 ₽.'), p.w.__uttered[0].text);
    ok('F2 честный тост: «Natural Voice недоступен … используется системный голос»',
      p.toastText().indexOf('Natural Voice недоступен') >= 0 && p.toastText().indexOf('используется системный голос') >= 0, p.toastText());
    const stEl = p.q('.aven-state');
    ok('F3 лейбл во время fallback: «Говорю · системный голос»', stEl && stEl.textContent === '● Говорю · системный голос', stEl && stEl.textContent);
    await p.waitFor(() => p.presence() === 'idle', 4000, 'idle F');
    ok('F4 stats честно: fallback → системный голос', p.w.AvenTTS.stats.lastSource === 'fallback → системный голос', p.w.AvenTTS.stats.lastSource);
    p.dom.window.close();
  }

  /* ============ G. Сервер отвечает 404 → fallback с причиной ============ */
  {
    const p = await load('#/home', '404');
    p.setNatural();
    p.w.AvenTTS.speak('Сегодня записано расходов на 3 420 ₽.');
    await p.waitFor(() => p.w.__uttered.length === 1, 5000, 'system speech G');
    ok('G1 404 → fallback на системный голос', true);
    ok('G2 тост содержит HTTP 404', p.toastText().indexOf('HTTP 404') >= 0, p.toastText());
    p.dom.window.close();
  }

  /* ============ H. Таймаут Natural (§13) ============ */
  {
    const p = await load('#/home', 'synth-hang', { speechMs: 250 });
    p.setNatural();
    p.st().settings.voice.natural.timeoutSec = 3; p.w.AvenState.save();
    p.w.AvenTTS.speak('Сегодня записано расходов на 3 420 ₽.');
    await p.waitFor(() => p.w.__uttered.length === 1, 9000, 'system speech H (после таймаута)');
    ok('H1 таймаут 3 с → fallback на System TTS (не ждём молча)', true);
    ok('H2 тост: «Natural Voice не ответил вовремя»', p.toastText().indexOf('Natural Voice не ответил вовремя') >= 0, p.toastText());
    await p.waitFor(() => p.presence() === 'idle', 5000, 'idle H');
    ok('H3 состояние вернулось в «Готова»', true);
    p.dom.window.close();
  }

  /* ============ I. Остановить речь (§12) ============ */
  {
    const p = await load('#/home', 'ok', { audioMs: 2000 });
    p.setNatural();
    p.w.AvenTTS.speak('Готово.');
    await p.waitFor(() => p.presence() === 'speaking', 4000, 'speaking I');
    const a = p.w.__audios[p.w.__audios.length - 1];
    p.w.AvenTTS.stop();
    await sleep(150);
    ok('I1 stop(): воспроизведение остановлено (pause)', a.paused === true && a._playing === false);
    ok('I2 состояние после stop: idle', p.presence() === 'idle', p.presence());
    p.dom.window.close();
  }

  /* ============ J. Новая речь во время предыдущей (§12) ============ */
  {
    const p = await load('#/home', 'ok', { audioMs: 2000 });
    p.setNatural();
    p.w.AvenTTS.speak('Готово.');
    await p.waitFor(() => p.presence() === 'speaking', 4000, 'speaking J1');
    const first = p.w.__audios[p.w.__audios.length - 1];
    p.w.AvenTTS.speak('Слушаю.');
    await p.waitFor(() => p.w.__synthLog.length === 2, 4000, 'synth J2');
    await p.waitFor(() => p.presence() === 'speaking' && p.w.__audios.length >= 2 && p.w.__audios[p.w.__audios.length - 1]._playing, 4000, 'speaking J2');
    const last = p.w.__audios[p.w.__audios.length - 1];
    ok('J1 предыдущая речь остановлена новой', first.paused === true);
    ok('J2 новая речь играет (текст второй фразы ушёл на сервер)', p.w.__synthLog[1].text === 'Слушаю.' && last._playing === true);
    ok('J3 прерывание — НЕ ошибка: тоста fallback не появилось', p.toastText().indexOf('Natural Voice недоступен') < 0, p.toastText());
    p.dom.window.close();
  }

  /* ============ N. Нормализация контрактных примеров (§10) — напрямую ============ */
  {
    const norm = require('../js/tts/normalize.js');
    ok('N1 «3 420 ₽» → «три тысячи четыреста двадцать рублей»', norm.normalize('Сегодня записано расходов на 3 420 ₽.').indexOf('три тысячи четыреста двадцать рублей') >= 0,
      norm.normalize('Сегодня записано расходов на 3 420 ₽.'));
    ok('N2 «104 520 км» → «сто четыре тысячи пятьсот двадцать километров»', norm.normalize('Пробег 104 520 км.').indexOf('сто четыре тысячи пятьсот двадцать километров') >= 0,
      norm.normalize('Пробег 104 520 км.'));
    const t = norm.normalize('Напомню в 10:30.');
    ok('N3 «10:30» читается как время', t.indexOf('десять часов тридцать минут') >= 0, t);
    ok('N4 «Aven» → «Авен» (текущий словарь)', norm.normalize('Aven слушает вас.').indexOf('Авен') >= 0, norm.normalize('Aven слушает вас.'));
  }

  console.log('\\nИТОГО: ' + pass + ' PASS, ' + fail + ' FAIL');
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); server.close(); process.exit(1); });
