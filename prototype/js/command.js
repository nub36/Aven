/* Aven — Visual Prototype. Stage 2, первая итерация: детерминированный движок текстовых команд.

   Путь команды (docs/ARCHITECTURE.md §3.1, docs/COMMAND_ENGINE.md):

     текст → normalize → parse → структурированное намерение (intent)
           → execute → общий слой действий (AvenActions) / общие запросы
           → структурированный результат → respond → обычный человеческий ответ

   Жёсткие правила этого файла:
   - DOM не используется: ни document, ни innerHTML, ни обработчиков событий.
     Экран (Assistant) — отдельный адаптер; позже тем же путём пойдёт распознанная речь.
   - Разбор текста НЕ меняет состояние: parse() чист, все изменения — только в execute().
   - Своей бизнес-логики задач/событий/финансов здесь нет: движок вызывает уже
     существующие общие действия и запросы, поэтому «Историю» и Undo создаёт тот же слой.
   - Никакого AI/LLM/сети: только явные шаблоны русского языка, перечисленные ниже.
   - Даты берутся из общих часов приложения (AvenActions.dates), а не из системного времени.
   - Разрушительные действия (удаление, массовые изменения) в первую итерацию НЕ входят. */
window.AvenCommand = (function () {
  const Core = () => window.AvenActions;

  /* ======================= 1. Нормализация ======================= */
  /* Ровно столько, сколько нужно шаблонам: регистр, ё/е, лишние пробелы,
     неразрывные пробелы, кавычки и завершающая пунктуация. Морфологического
     анализатора русского языка здесь намеренно нет. */
  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/[\u00a0\u202f\t\r\n]+/g, ' ')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[«»"'`]+/g, ' ')
      .replace(/[!?.,;:]+\s*$/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  /* Тот же текст, но с сохранением регистра — из него берутся названия задач и событий. */
  function cleanText(text) {
    return String(text == null ? '' : text)
      .replace(/[\u00a0\u202f\t\r\n]+/g, ' ')
      .replace(/[«»"'`]+/g, ' ')
      .replace(/[!?.,;:]+\s*$/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function tidy(str) {
    return String(str || '').replace(/\s+/g, ' ').replace(/^[\s,;:.\-—–]+/, '').replace(/[\s,;:.\-—–]+$/, '').trim();
  }
  function capitalize(str) {
    const v = tidy(str);
    return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  }

  /* ======================= 2. Контекст и общие часы ======================= */
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  function makeContext(ctx) {
    ctx = ctx || {};
    const D = Core().dates;
    const todayISO = ISO_RE.test(String(ctx.todayISO || '')) ? String(ctx.todayISO) : D.todayISO();
    return {
      todayISO,
      nowHM: /^\d{2}:\d{2}$/.test(String(ctx.nowHM || '')) ? String(ctx.nowHM) : D.nowHM(),
      source: ctx.source || 'command',
      surface: ctx.surface || 'assistant',
      /* Только transient orchestration flags; business state сюда не попадает. */
      targetId: ctx.targetId || '',
      expectedTitle: ctx.expectedTitle || '',
      selected: ctx.selected === true,
      confirmed: ctx.confirmed === true
    };
  }

  /* ======================= 3. Разбор дат и времени ======================= */
  const WEEKDAYS = [
    { rx: /понедельник[а-яе]*/, index: 1 },
    { rx: /вторник[а-яе]*/, index: 2 },
    { rx: /сред[ауые][а-яе]*/, index: 3 },
    { rx: /четверг[а-яе]*/, index: 4 },
    { rx: /пятниц[ауые][а-яе]*/, index: 5 },
    { rx: /суббот[ауые][а-яе]*/, index: 6 },
    { rx: /воскресень[еяю][а-яе]*/, index: 0 }
  ];
  const RELATIVE = [
    { rx: /послезавтра/, offset: 2 },
    { rx: /позавчера/, offset: -2 },
    { rx: /завтра/, offset: 1 },
    { rx: /сегодня/, offset: 0 },
    { rx: /вчера/, offset: -1 }
  ];
  /* В JavaScript \b рассчитан на латиницу: между кириллической буквой и пробелом
     границы слова НЕТ. Поэтому границы задаются явно — иначе шаблоны молча
     переставали бы срабатывать на русских словах. */
  const CH = 'a-zа-яё0-9';
  const NOT_BEFORE = '(?:^|[^' + CH + '])';
  const NOT_AFTER = '(?![' + CH + '])';
  function wordRx(body, flags) { return new RegExp(NOT_BEFORE + '(?:' + body + ')' + NOT_AFTER, flags || ''); }
  function startRx(body, flags) { return new RegExp('^(?:' + body + ')' + NOT_AFTER, flags || ''); }
  function hasWord(text, body) { return wordRx(body).test(text); }

  const MONTH_LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) { return m === 2 && isLeap(y) ? 29 : MONTH_LEN[m - 1]; }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* Ищет дату в тексте. Возвращает { found, dateISO, source } либо ошибку разбора.
     Никаких догадок: если дата написана неверно (31.02), это ошибка, а не «почти то же». */
  function findDate(text, context) {
    const t = normalize(text);
    if (!t) return { found: false };
    for (let i = 0; i < RELATIVE.length; i++) {
      const r = RELATIVE[i];
      const hit = new RegExp(NOT_BEFORE + '(?:(?:на|в|во)\\s+)?(?:' + r.rx.source + ')' + NOT_AFTER).exec(t);
      if (hit) return { found: true, dateISO: Core().dates.addDays(context.todayISO, r.offset), source: hit[0] };
    }
    const iso = new RegExp(NOT_BEFORE + '(\\d{4})-(\\d{2})-(\\d{2})' + NOT_AFTER).exec(t);
    if (iso) {
      const y = +iso[1], mo = +iso[2], d = +iso[3];
      if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
        return { found: true, error: 'DATE_INVALID', source: iso[0] };
      }
      return { found: true, dateISO: y + '-' + pad(mo) + '-' + pad(d), source: iso[0] };
    }
    const dm = new RegExp(NOT_BEFORE + '(\\d{1,2})[.\\/](\\d{1,2})(?:[.\\/](\\d{2,4}))?' + NOT_AFTER).exec(t);
    if (dm) {
      const d = +dm[1], mo = +dm[2];
      let y = dm[3] ? (+dm[3] < 100 ? 2000 + +dm[3] : +dm[3]) : Number(context.todayISO.slice(0, 4));
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || d > daysInMonth(y, mo)) {
        return { found: true, error: 'DATE_INVALID', source: dm[0] };
      }
      const candidate = y + '-' + pad(mo) + '-' + pad(d);
      /* Дата без года — это про ближайшее будущее: «12.05», когда май уже прошёл,
         означает следующий год, иначе команда молча создавала бы просроченную запись. */
      if (!dm[3] && candidate < context.todayISO) y += 1;
      return { found: true, dateISO: y + '-' + pad(mo) + '-' + pad(d), source: dm[0] };
    }
    for (let i = 0; i < WEEKDAYS.length; i++) {
      const w = WEEKDAYS[i];
      const m = new RegExp(NOT_BEFORE + '(?:(?:на|в|во)\\s+)?(?:' + w.rx.source + ')' + NOT_AFTER).exec(t);
      if (m) {
        const base = Core().dates.parseISO(context.todayISO);
        let delta = (w.index - base.getDay() + 7) % 7;
        if (delta === 0) delta = 7; /* «в понедельник» в понедельник — это следующий понедельник */
        return { found: true, dateISO: Core().dates.addDays(context.todayISO, delta), source: m[0] };
      }
    }
    return { found: false };
  }

  /* Время: «в 10», «в 10:30», «в 10 часов», «10:30». Форма «10.30» намеренно не
     поддерживается — её нельзя надёжно отличить от даты 10 марта. */
  function findTime(text) {
    const t = normalize(text);
    let m = new RegExp(NOT_BEFORE + '(?:(?:в|во|к|на)\\s+)?(\\d{1,2}):(\\d{2})' + NOT_AFTER).exec(t);
    if (m) {
      const h = +m[1], mi = +m[2];
      if (h > 23 || mi > 59) return { found: true, error: 'TIME_INVALID', source: m[0] };
      return { found: true, time: pad(h) + ':' + pad(mi), source: m[0] };
    }
    m = new RegExp(NOT_BEFORE + '(?:в|во|к)\\s+(\\d{1,2})(?:\\s*(?:час[а-яё]*|ч))?' + NOT_AFTER + '(?!\\s*[:.\\/]\\d)').exec(t);
    if (m) {
      const h = +m[1];
      if (h > 23) return { found: true, error: 'TIME_INVALID', source: m[0] };
      return { found: true, time: pad(h) + ':00', source: m[0] };
    }
    return { found: false };
  }
  /* Удаляет найденный фрагмент (дату/время) из исходного текста, сохраняя регистр остального. */
  function cut(raw, source) {
    if (!source) return raw;
    const escaped = String(source).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[еЕёЁ]');
    return raw.replace(new RegExp(escaped, 'i'), ' ');
  }
  /* Из «купить масло на завтра в 10:00» делает { title, dateISO, time }. */
  function extractWhen(raw, context) {
    let rest = raw;
    const out = { dateISO: '', time: '' };
    const d = findDate(rest, context);
    if (d.found && d.error) return { error: d.error };
    if (d.found) { out.dateISO = d.dateISO; rest = cut(rest, d.source); }
    const t = findTime(rest);
    if (t.found && t.error) return { error: t.error };
    if (t.found) { out.time = t.time; rest = cut(rest, t.source); }
    out.rest = tidy(rest.replace(/\s+(на|в|во|к)\s*$/i, ' '));
    return out;
  }

  /* ======================= 4. Намерение и ошибки разбора ======================= */
  const EXAMPLES = [
    'Что у меня сегодня?',
    'Что у меня завтра?',
    'Покажи просроченные задачи',
    'Какие есть предложения?',
    'Создай задачу купить масло на завтра',
    'Добавь завтра в 10 встречу с Сергеем',
    'Отметь купить масло выполненной',
    'Перенеси задачу купить масло на пятницу'
  ];
  const PARSE_MESSAGES = {
    EMPTY: 'Напишите команду — например: «Что у меня сегодня?»',
    UNKNOWN_COMMAND: 'Я не поняла эту команду.',
    TASK_TITLE_REQUIRED: 'Не поняла, какую задачу создать. Напишите так: «Создай задачу купить масло на завтра».',
    TASK_QUERY_REQUIRED: 'Не поняла, какую задачу отметить. Напишите так: «Отметь купить масло выполненной».',
    EVENT_TITLE_REQUIRED: 'Не поняла, какое событие создать. Напишите так: «Добавь завтра в 10 встречу с Сергеем».',
    DATE_INVALID: 'Такой даты не существует. Напишите, например, «на завтра», «на пятницу» или «12.05».',
    TIME_INVALID: 'Такого времени не бывает. Напишите время как «в 10» или «в 10:30».',
    RESCHEDULE_DATE_REQUIRED: 'Напишите, на какую дату перенести: «Перенеси задачу купить масло на завтра».',
    UNSUPPORTED_DELETE: 'Удалять записи текстовой командой я пока не умею — это делается в разделе, с подтверждением и возможностью отмены.',
    UNSUPPORTED_EVENT_UPDATE: 'Переносить события текстом я пока не умею. Откройте событие в «Календаре» — там можно изменить дату и время.',
    UNSUPPORTED_FINANCE: 'Записывать расходы и доходы текстом я пока не умею. Добавьте операцию в разделе «Финансы».',
    UNSUPPORTED_REMINDER: 'Создавать напоминания текстом я пока не умею. Добавьте напоминание в разделе «Уведомления» — или создайте задачу с датой.',
    UNSUPPORTED_AUTO: 'Записывать заправки и обслуживание текстом я пока не умею. Это делается в разделе «Авто».',
    UNSUPPORTED_NOTE: 'Создавать заметки текстом я пока не умею. Это делается в разделе «Заметки».'
  };
  function intent(action, kind, params, rule, extra) {
    return Object.assign({
      ok: true,
      kind,                       /* query | mutation */
      domain: String(action).split('.')[0],
      action,                     /* task.create, day.plan, ... */
      params: params || {},
      /* Дискретный уровень вместо выдуманной числовой «уверенности».
         Для полного совпадения синтаксического правила исходный уровень — EXACT;
         Entity Resolver ниже может понизить его до INFERRED или AMBIGUOUS. */
      match: { rule, resolution: 'EXACT' },
      requiresConfirmation: false
    }, extra || {});
  }
  function fail(code, rule, extra) {
    return Object.assign({
      ok: false,
      error: {
        code,
        message: PARSE_MESSAGES[code] || PARSE_MESSAGES.UNKNOWN_COMMAND,
        rule: rule || null,
        examples: EXAMPLES.slice(0, 4)
      }
    }, extra || {});
  }

  /* ======================= 5. Шаблоны (parse) ======================= */
  const TASK_WORD = '(?:задач[уаи]|дело|дела|таск)';
  const CREATE_VERB = '(?:созда[йть]?(?:ть|й)?|добав(?:ь|ить)|запиши|записать|запланируй|запланировать|поставь|поставить)';
  const DONE_VERB = '(?:отметь|отметить|заверши|завершить|выполни|выполнить|закрой|закрыть)';
  const MOVE_VERB = '(?:перенеси|перенести|передвинь|передвинуть|сдвинь|сдвинуть)';
  const DONE_TAIL = /\s*(?:как\s+)?(?:выполненн(?:ой|ым|ую|ая)|выполнено|выполнена|сделанн(?:ой|ым|ую)|сделано|готов(?:о|ой|ым|ую)|завершенн(?:ой|ым|ую))\s*$/i;
  const EVENT_WORD = /(встреч[уаией]|событи[ея]|созвон|звонок|при[её]м|визит)/i;
  const EVENT_LABEL = [
    { rx: startRx('встреч[уаией]', 'i'), label: 'Встреча' },
    { rx: startRx('созвон[а-яё]*', 'i'), label: 'Созвон' },
    { rx: startRx('звонок', 'i'), label: 'Звонок' },
    { rx: startRx('при[её]м', 'i'), label: 'Приём' },
    { rx: startRx('визит', 'i'), label: 'Визит' },
    { rx: startRx('событи[а-яе]*', 'i'), label: '' }
  ];

  function parseTaskCreate(n, raw, context) {
    const rx = new RegExp('^' + CREATE_VERB + '\\s+(?:нов(?:ую|ое|ый)\\s+)?' + TASK_WORD + NOT_AFTER + '\\s*(.*)$', 'i');
    if (!rx.test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const when = extractWhen(m[1] || '', context);
    if (when.error) return fail(when.error, 'task.create');
    const title = capitalize(when.rest);
    if (!title) return fail('TASK_TITLE_REQUIRED', 'task.create');
    return intent('task.create', 'mutation',
      { title, dateISO: when.dateISO || '', time: when.time || '' }, 'task.create');
  }

  function parseEventCreate(n, raw, context) {
    const rx = new RegExp('^(?:' + CREATE_VERB + '|назначь|назначить)\\s+(.+)$', 'i');
    if (!rx.test(n)) return null;
    if (new RegExp('^' + CREATE_VERB + '\\s+(?:нов(?:ую|ое|ый)\\s+)?' + TASK_WORD + NOT_AFTER, 'i').test(n)) return null;
    if (!EVENT_WORD.test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const when = extractWhen(m[1] || '', context);
    if (when.error) return fail(when.error, 'event.create');
    let rest = tidy(String(when.rest || '').replace(/^(?:нов(?:ую|ое|ый)\s+)/i, ''));
    let label = null, tail = rest;
    for (let i = 0; i < EVENT_LABEL.length; i++) {
      const e = EVENT_LABEL[i];
      if (e.rx.test(rest)) { label = e.label; tail = tidy(rest.replace(e.rx, ' ')); break; }
    }
    /* Слово «встреча/созвон/событие» должно быть тем, что создают, а не случайно
       встретиться в середине фразы: иначе «добавь заметку про встречу» превращалось
       бы в событие «Событие заметку про встречу». Не поняли — не угадываем. */
    if (label === null) return null;
    const title = label ? tidy(label + ' ' + tail) : capitalize(tail);
    if (!title || /^событие$/i.test(title)) return fail('EVENT_TITLE_REQUIRED', 'event.create');
    return intent('event.create', 'mutation',
      { title, dateISO: when.dateISO || context.todayISO, time: when.time || '' }, 'event.create');
  }

  function parseTaskComplete(n, raw) {
    const rx = new RegExp('^' + DONE_VERB + '\\s+(?:' + TASK_WORD + '\\s+)?(.+)$', 'i');
    if (!rx.test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const query = tidy(String(m[1] || '').replace(DONE_TAIL, ' '));
    if (!query) return fail('TASK_QUERY_REQUIRED', 'task.complete');
    return intent('task.complete', 'mutation', { query }, 'task.complete');
  }

  function parseTaskReschedule(n, raw, context) {
    const rx = new RegExp('^' + MOVE_VERB + '\\s+(?:' + TASK_WORD + '\\s+)?(.+?)\\s+на\\s+(.+)$', 'i');
    if (!rx.test(n)) return null;
    if (EVENT_WORD.test(n)) return fail('UNSUPPORTED_EVENT_UPDATE', 'task.reschedule');
    const m = rx.exec(raw) || rx.exec(n);
    const when = findDate(m[2] || '', context);
    if (when.found && when.error) return fail(when.error, 'task.reschedule');
    if (!when.found) return fail('RESCHEDULE_DATE_REQUIRED', 'task.reschedule');
    const query = tidy(m[1] || '');
    if (!query) return fail('TASK_QUERY_REQUIRED', 'task.reschedule');
    return intent('task.reschedule', 'mutation', { query, dateISO: when.dateISO }, 'task.reschedule');
  }

  function parseCapabilities(n) {
    if (!startRx('что ты умеешь|что умеешь|что ты можешь|что ты умеешь делать|помощь|команды|какие команды|help', '').test(n)) return null;
    return intent('help.capabilities', 'query', {}, 'help.capabilities');
  }
  function parseFinanceQuery(n) {
    if (!/(потрат|расход|трат)/.test(n)) return null;
    if (/(запиши|добавь|созда|внеси)/.test(n)) return null; /* это уже попытка записи — см. guard ниже */
    return intent('finance.summary', 'query', {}, 'finance.summary');
  }
  function parseAutoQuery(n) {
    if (!/(пробег|машин|автомобил|бэх)/.test(n) && !hasWord(n, 'авто')) return null;
    if (/(заправ|залил|бензин|топлив)/.test(n)) return null;
    return intent('auto.status', 'query', {}, 'auto.status');
  }
  function parseOverdueQuery(n) {
    if (!/просроч/.test(n)) return null;
    return intent('tasks.overdue', 'query', {}, 'tasks.overdue');
  }
  function parseSuggestionsQuery(n) {
    if (!/(предложен|рекоменд|что стоит сделать|посоветуй)/.test(n)) return null;
    return intent('suggestions.list', 'query', {}, 'suggestions.list');
  }
  function parseDayQuery(n, raw, context) {
    if (!hasWord(n, 'что|какие|какой|покажи|показать|план|расписание|дела|дел|занят[а-яё]*')) return null;
    const d = findDate(n, context);
    if (d.found && d.error) return fail(d.error, 'day.plan');
    if (!d.found) {
      if (!hasWord(n, 'что|какие')) return null;
      return intent('day.plan', 'query', { dateISO: context.todayISO }, 'day.plan.today');
    }
    const out = intent('day.plan', 'query', { dateISO: d.dateISO }, 'day.plan');
    /* Детерминированное сокращение без слов «у меня/план/дела» — честный INFERRED
       query: результат однозначен и read-only, поэтому подтверждение не нужно. */
    if (/^(?:что|какие)\s+(?:сегодня|завтра|послезавтра)$/i.test(n)) out.match.resolution = 'INFERRED';
    return out;
  }

  /* Честные отказы: команда понята, но возможности пока нет. Состояние не меняется. */
  function parseUnsupported(n) {
    if (hasWord(n, 'удали|удалить|удаляй|сотри|стереть|стирай|очисти|очистить|убери')) return fail('UNSUPPORTED_DELETE', 'guard.delete');
    if (new RegExp(NOT_BEFORE + 'напомн').test(n)) return fail('UNSUPPORTED_REMINDER', 'guard.reminder');
    if (/(заправ|залил|бензин|топлив)/.test(n)) return fail('UNSUPPORTED_AUTO', 'guard.auto');
    if (/(запиши|добавь|созда|внеси|потратил|заплатил|оплатил)/.test(n) && (/(рубл|₽|расход|доход|трат)/.test(n) || hasWord(n, 'р'))) return fail('UNSUPPORTED_FINANCE', 'guard.finance');
    /* Здесь тоже нельзя опираться на \w: он не знает кириллицы, поэтому «создай заметку»
       проходил бы мимо честного отказа и попадал в «не поняла». */
    if (/(?:созда|добав|запиши|запис)[а-яе]*\s+заметк/.test(n)) return fail('UNSUPPORTED_NOTE', 'guard.note');
    if (new RegExp('^(?:' + MOVE_VERB + ')').test(n) && EVENT_WORD.test(n)) return fail('UNSUPPORTED_EVENT_UPDATE', 'guard.event.update');
    return null;
  }

  const RULES = [
    parseTaskCreate, parseEventCreate, parseTaskComplete, parseTaskReschedule,
    parseCapabilities, parseFinanceQuery, parseAutoQuery, parseOverdueQuery,
    parseSuggestionsQuery, parseDayQuery, parseUnsupported
  ];

  /* parse(text, context) → намерение или понятная ошибка. Состояние НЕ меняется. */
  function parse(text, ctx) {
    const context = makeContext(ctx);
    const n = normalize(text);
    const raw = cleanText(text);
    if (!n) return fail('EMPTY', 'empty');
    for (let i = 0; i < RULES.length; i++) {
      const res = RULES[i](n, raw, context);
      if (res) {
        res.input = { text: String(text == null ? '' : text), normalized: n };
        res.context = { todayISO: context.todayISO };
        return res;
      }
    }
    const miss = fail('UNKNOWN_COMMAND', null);
    miss.input = { text: String(text == null ? '' : text), normalized: n };
    return miss;
  }

  /* ======================= 6. Выполнение (execute) ======================= */
  function result(ok, status, action, extra) {
    return Object.assign({ ok, status, action: action || null }, extra || {});
  }
  function actionFailed(actionName, res, intentObj) {
    return result(false, 'invalid', actionName, {
      code: (res && res.code) || 'ACTION_FAILED',
      message: (res && res.message) || 'Не удалось выполнить действие',
      intent: intentObj
    });
  }
  /* Минимальный универсальный контракт разрешения сущности. Fuzzy/NLP здесь нет:
     полное название = EXACT, единственное детерминированное вхождение = INFERRED,
     несколько кандидатов = AMBIGUOUS, отсутствие = UNSUPPORTED/not-found. */
  function taskCandidate(t) {
    return {
      id: t.id, title: t.title,
      dateISO: Core().tasks.date(t) || '',
      time: Core().tasks.time(t) || '',
      due: Core().tasks.deadline(t) || Core().tasks.date(t) || '',
      status: Core().tasks.isCompleted(t) ? 'completed' : 'active'
    };
  }
  function resolveTask(query, context) {
    const list = Core().tasks.getTasks({ status: 'active', today: context.todayISO }).items || [];
    const q = normalize(query);
    if (!q) return { ok: false, status: 'not_found', resolution: 'UNSUPPORTED', code: 'NOT_FOUND', candidates: [] };
    const exact = list.filter((t) => normalize(t.title) === q);
    if (exact.length === 1) return { ok: true, status: 'resolved', resolution: 'EXACT', entity: taskCandidate(exact[0]) };
    if (exact.length > 1) return { ok: false, status: 'ambiguous', resolution: 'AMBIGUOUS', code: 'AMBIGUOUS', candidates: exact.map(taskCandidate) };
    const partial = list.filter((t) => normalize(t.title).indexOf(q) >= 0);
    if (partial.length === 1) return { ok: true, status: 'resolved', resolution: 'INFERRED', entity: taskCandidate(partial[0]) };
    if (partial.length > 1) return { ok: false, status: 'ambiguous', resolution: 'AMBIGUOUS', code: 'AMBIGUOUS', candidates: partial.map(taskCandidate) };
    return { ok: false, status: 'not_found', resolution: 'UNSUPPORTED', code: 'NOT_FOUND', candidates: [] };
  }
  function resolve(intentObj, ctx) {
    const context = makeContext(ctx);
    if (!intentObj || intentObj.ok !== true) return { ok: false, status: 'unsupported', resolution: 'UNSUPPORTED', candidates: [] };
    if (intentObj.action === 'task.complete' || intentObj.action === 'task.reschedule') {
      return resolveTask((intentObj.params || {}).query, context);
    }
    return { ok: true, status: 'resolved', resolution: (intentObj.match && intentObj.match.resolution) || 'EXACT', entity: null };
  }
  function ambiguous(actionName, intentObj, candidates) {
    return result(false, 'ambiguous', actionName, {
      code: 'AMBIGUOUS_TASK', resolution: 'AMBIGUOUS', intent: intentObj, candidates
    });
  }

  function execute(intentObj, ctx) {
    const context = makeContext(ctx);
    if (!intentObj || intentObj.ok !== true || !intentObj.action) {
      return result(false, 'invalid', (intentObj && intentObj.action) || null, {
        code: (intentObj && intentObj.error && intentObj.error.code) || 'NO_INTENT',
        message: (intentObj && intentObj.error && intentObj.error.message) || PARSE_MESSAGES.UNKNOWN_COMMAND,
        intent: intentObj || null
      });
    }
    const C = Core();
    const p = intentObj.params || {};
    const opts = { source: context.source };

    switch (intentObj.action) {
      case 'task.create': {
        const params = { title: p.title, priority: 'средний' };
        if (p.dateISO) { params.date = p.dateISO; params.deadline = p.dateISO; }
        if (p.time) params.time = p.time;
        const res = C.tasks.createTask(params, opts);
        if (!res.ok) return actionFailed('task.create', res, intentObj);
        return result(true, 'done', 'task.create', {
          intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: { title: res.entity.title, dateISO: C.tasks.date(res.entity) || '', time: C.tasks.time(res.entity) || '' }
        });
      }
      case 'event.create': {
        const params = { title: p.title, date: p.dateISO || context.todayISO };
        if (p.time) params.startTime = p.time; else params.allDay = true;
        const res = C.events.createEvent(params, opts);
        if (!res.ok) return actionFailed('event.create', res, intentObj);
        return result(true, 'done', 'event.create', {
          intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: { title: res.entity.title, dateISO: res.entity.date, time: C.events.start(res.entity) || '' }
        });
      }
      case 'task.complete':
      case 'task.reschedule': {
        const actionName = intentObj.action;
        let found;
        /* Продолжение flow хранит только id и перед выполнением снова читает
           сущность из Common Query. Устаревший snapshot никогда не мутируется. */
        if (context.targetId) {
          const fresh = C.tasks.getTask(context.targetId);
          if (!fresh.ok || C.tasks.isCompleted(fresh.entity) ||
              (context.expectedTitle && normalize(fresh.entity.title) !== normalize(context.expectedTitle))) {
            return result(false, 'stale', actionName, {
              code: 'STALE_TARGET', intent: intentObj,
              message: 'Эта задача уже недоступна или изменилась. Ничего не изменилось.'
            });
          }
          found = { ok: true, resolution: context.selected ? 'EXACT' : 'INFERRED', entity: taskCandidate(fresh.entity) };
        } else found = resolveTask(p.query, context);
        if (!found.ok && found.status === 'ambiguous') return ambiguous(actionName, intentObj, found.candidates);
        if (!found.ok) return result(false, 'not_found', actionName, { code: 'TASK_NOT_FOUND', resolution: 'UNSUPPORTED', intent: intentObj, query: p.query });
        /* INFERRED mutation только описывается: выполнить её может лишь CommandSession
           после явного подтверждения. Создание pending action ничего не меняет. */
        if (found.resolution === 'INFERRED' && !context.confirmed) {
          const summary = actionName === 'task.complete'
            ? 'Отметить задачу «' + found.entity.title + '» выполненной?'
            : 'Перенести задачу «' + found.entity.title + '» на ' + C.dates.dateLabel(p.dateISO) + '?';
          return result(false, 'confirmation_required', actionName, {
            code: 'CONFIRMATION_REQUIRED', resolution: 'INFERRED', intent: intentObj,
            target: found.entity, summary
          });
        }
        let res;
        if (actionName === 'task.complete') res = C.tasks.completeTask(found.entity.id, opts);
        else res = C.tasks.updateTask(found.entity.id, { date: p.dateISO, deadline: p.dateISO },
          Object.assign({ title: 'Задача перенесена на ' + C.dates.humanDate(p.dateISO) }, opts));
        if (!res.ok) return actionFailed(actionName, res, intentObj);
        return result(true, 'done', actionName, {
          resolution: found.resolution, intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: actionName === 'task.complete' ? { title: res.entity.title } : { title: res.entity.title, dateISO: p.dateISO }
        });
      }
      case 'day.plan': {
        const dateISO = ISO_RE.test(String(p.dateISO || '')) ? p.dateISO : context.todayISO;
        const events = C.events.getEventsForDate(dateISO).items || [];
        const tasks = C.tasks.getTasksForDate(dateISO, { includeCompleted: true }).items || [];
        const open = tasks.filter((t) => !C.tasks.isCompleted(t));
        const done = tasks.filter((t) => C.tasks.isCompleted(t));
        const overdue = dateISO === context.todayISO ? (C.tasks.getOverdueTasks(context.todayISO).items || []) : [];
        return result(true, 'info', 'day.plan', {
          intent: intentObj,
          data: { dateISO, events, tasksOpen: open, tasksDone: done, overdue }
        });
      }
      case 'tasks.overdue': {
        const items = C.tasks.getOverdueTasks(context.todayISO).items || [];
        return result(true, 'info', 'tasks.overdue', { intent: intentObj, data: { items } });
      }
      case 'suggestions.list': {
        const engine = window.AvenSuggestions;
        const items = engine ? engine.getSuggestions({ surface: context.surface, dateISO: context.todayISO }).slice(0, 3) : [];
        return result(true, 'info', 'suggestions.list', { intent: intentObj, data: { items } });
      }
      case 'finance.summary': {
        const summary = C.finance.summary();
        const monthOps = C.finance.getOperations({ period: 'month', type: 'expense' }).items || [];
        const largest = monthOps.slice().sort((a, b) => C.money.minor(b.amount || 0) - C.money.minor(a.amount || 0))[0] || null;
        return result(true, 'info', 'finance.summary', { intent: intentObj, data: { summary, count: monthOps.length, largest } });
      }
      case 'auto.status': {
        const car = C.auto.car();
        const stats = C.auto.stats();
        const monthSum = C.finance.totals({ period: 'month', type: 'expense', cat: 'Авто' }).expense;
        return result(true, 'info', 'auto.status', { intent: intentObj, data: { car, stats, monthSum } });
      }
      case 'help.capabilities':
        return result(true, 'info', 'help.capabilities', { intent: intentObj, data: { supported: supported() } });
      default:
        return result(false, 'invalid', intentObj.action, {
          code: 'UNKNOWN_ACTION', message: PARSE_MESSAGES.UNKNOWN_COMMAND, intent: intentObj
        });
    }
  }

  /* ======================= 7. Ответ пользователю (respond) ======================= */
  function plural(n, one, few, many) {
    const x = Math.abs(Number(n) || 0) % 100, y = x % 10;
    return n + ' ' + (x > 10 && x < 20 ? many : y === 1 ? one : y > 1 && y < 5 ? few : many);
  }
  function quote(v) { return '«' + String(v || '') + '»'; }
  function whenPhrase(dateISO, time) {
    const C = Core();
    const label = C.dates.dateLabel(dateISO);
    const human = C.dates.humanDate(dateISO);
    const date = label === human ? human : label + ', ' + human;
    return date + (time ? ', ' + C.format.time(time) : '');
  }
  function listTitles(items, limit) {
    const max = limit || 5;
    const names = items.slice(0, max).map((x) => quote(x.title));
    const rest = items.length - names.length;
    return names.join(', ') + (rest > 0 ? ' и ещё ' + rest : '');
  }
  function examplesLine() {
    return 'Например: ' + EXAMPLES.slice(0, 4).map((x) => quote(x)).join(', ') + '.';
  }
  function dayText(data) {
    const C = Core();
    const label = C.dates.dateLabel(data.dateISO);
    const head = capitalize(label === C.dates.humanDate(data.dateISO) ? label : label + ', ' + C.dates.humanDate(data.dateISO));
    const parts = [head + ': ' + plural(data.events.length, 'событие', 'события', 'событий') +
      ' и ' + plural(data.tasksOpen.length, 'открытая задача', 'открытые задачи', 'открытых задач') + '.'];
    if (data.events.length) {
      parts.push('События: ' + data.events.map((e) => (C.format.eventTime(e) + ' — ' + e.title)).join('; ') + '.');
    }
    if (data.tasksOpen.length) parts.push('Задачи: ' + data.tasksOpen.map((t) => t.title).join('; ') + '.');
    if (data.tasksDone.length) parts.push('Уже выполнено: ' + data.tasksDone.length + '.');
    if (data.overdue.length) parts.push('Просрочено: ' + plural(data.overdue.length, 'задача', 'задачи', 'задач') + '.');
    if (!data.events.length && !data.tasksOpen.length) parts.push('Свободно — записей на эту дату нет.');
    return parts.join(' ');
  }
  function autoText(data) {
    const C = Core();
    const A = window.Aven;
    const money = (v) => (A && A.money ? A.money(v) : C.format.money(v));
    if (!data.car || !data.car.model) return 'Автомобиль не заведён. Добавьте его в разделе «Авто».';
    const km = (v) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(v) || 0)).replace(/[\u00a0\u202f]/g, ' ') + ' км';
    const last = data.stats && data.stats.lastService;
    const interval = Number(data.car.serviceIntervalKm) || 0;
    let next = '';
    if (last && interval) {
      const left = (Number(last.km) || 0) + interval - (Number(data.car.mileage) || 0);
      next = left > 0 ? '. До следующего ТО — ' + km(left) : '. Плановое ТО просрочено на ' + km(-left);
    }
    return data.car.model + ', пробег ' + km(data.car.mileage) +
      (last ? '. Последнее обслуживание: ' + last.title + ' · ' + C.dates.dateLabel(C.auto.dateISO(last)) : '') + next +
      '. Расходы по категории «Авто» за месяц: ' + money(data.monthSum) + '.';
  }
  function financeText(data) {
    const A = window.Aven;
    const money = (v) => (A && A.money ? A.money(v) : Core().format.money(v));
    if (!data.count) return 'Расходов пока не записано. Добавьте операцию в разделе «Финансы» — и я буду считать по ней.';
    return 'Сегодня записано расходов на ' + money(data.summary.todayExpense) + ', за месяц — ' + money(data.summary.monthExpense) +
      (data.largest ? '. Самая крупная в месяце — ' + data.largest.title + ', ' + money(data.largest.amount) : '') + '.';
  }
  function capabilitiesText() {
    const list = supported();
    return 'Сейчас я понимаю короткие команды о задачах, событиях и обзоре дня. Вопросы: ' +
      list.queries.map((x) => quote(x.example)).join(', ') + '. Действия: ' +
      list.mutations.map((x) => quote(x.example)).join(', ') +
      '. Пока не умею: ' + list.notYet.join('; ') + '. Все разделы по-прежнему работают обычными кнопками и формами.';
  }

  /* respond(result) → обычный текст. Ни JSON, ни имён действий, ни внутренних номеров записей. */
  function respond(res) {
    if (!res) return PARSE_MESSAGES.UNKNOWN_COMMAND + ' ' + examplesLine();
    const C = Core();
    const p = (res.intent && res.intent.params) || {};
    if (res.ok) {
      switch (res.action) {
        case 'task.create':
          return 'Задача ' + quote(res.data.title) + ' создана' +
            (res.data.dateISO ? ' на ' + whenPhrase(res.data.dateISO, res.data.time) : ' без даты') +
            '. Она уже видна в «Задачах»; отменить можно в «Истории».';
        case 'event.create':
          return 'Событие ' + quote(res.data.title) + ' создано на ' + whenPhrase(res.data.dateISO, res.data.time) +
            (res.data.time ? '' : ' (на весь день)') + '. Оно уже видно в «Календаре»; отменить можно в «Истории».';
        case 'task.complete':
          return 'Задача ' + quote(res.data.title) + ' отмечена выполненной. Вернуть её можно в «Задачах» или отменить в «Истории».';
        case 'task.reschedule':
          return 'Задача ' + quote(res.data.title) + ' перенесена на ' + whenPhrase(res.data.dateISO, '') +
            '. Отменить можно в «Истории».';
        case 'day.plan': return dayText(res.data);
        case 'tasks.overdue':
          return res.data.items.length
            ? 'Просроченных задач ' + res.data.items.length + ': ' +
              res.data.items.map((t) => t.title + ' — срок ' + C.format.taskDueLabel(t)).join('; ') + '.'
            : 'Просроченных задач нет.';
        case 'suggestions.list':
          return res.data.items.length
            ? 'Сейчас предлагаю: ' + res.data.items.map((x) => x.title + ' (почему: ' + x.reason + ')').join('; ') + '.'
            : 'Сейчас предложений нет: по вашим записям я не вижу полезного следующего шага.';
        case 'finance.summary': return financeText(res.data);
        case 'auto.status': return autoText(res.data);
        case 'help.capabilities': return capabilitiesText();
        default: return 'Готово.';
      }
    }
    if (res.status === 'ambiguous') {
      return 'Нашла несколько задач: ' + listTitles(res.candidates) +
        '. Уточните, какую выбрать — пока ничего не изменилось.';
    }
    if (res.status === 'confirmation_required') return res.summary || 'Подтвердить это действие?';
    if (res.status === 'stale') return res.message || 'Эта запись уже недоступна. Ничего не изменилось.';
    if (res.status === 'not_found') {
      return 'Не нашла подходящую открытую задачу ' + quote(p.query || res.query || '') +
        '. Проверьте название в разделе «Задачи» — я ничего не меняла.';
    }
    if (res.status === 'invalid') {
      return (res.message || PARSE_MESSAGES.UNKNOWN_COMMAND) + ' Ничего не изменилось.';
    }
    return (res.message || PARSE_MESSAGES.UNKNOWN_COMMAND) + ' ' + examplesLine();
  }
  /* Ответ на неразобранный текст: понятная причина + примеры, без изменений данных. */
  function respondToParseError(parsed) {
    const err = (parsed && parsed.error) || {};
    if (err.code === 'UNKNOWN_COMMAND' || !err.message) {
      return 'Я не поняла эту команду и ничего не изменила. ' + examplesLine() +
        ' Это не свободный разговор: я понимаю только перечисленные короткие фразы.';
    }
    if (String(err.code).indexOf('UNSUPPORTED_') === 0) return err.message;
    return err.message + ' Пока ничего не изменилось.';
  }

  /* ======================= 8. Единая точка для интерфейса ======================= */
  function run(text, ctx) {
    const context = makeContext(ctx);
    const parsed = parse(text, context);
    if (!parsed.ok) {
      return { ok: false, intent: parsed, result: null, response: respondToParseError(parsed), context };
    }
    const res = execute(parsed, context);
    return { ok: !!res.ok, intent: parsed, result: res, response: respond(res), context };
  }

  /* Что движок умеет — один список для интерфейса, справки и тестов. */
  function supported() {
    return {
      queries: [
        { action: 'day.plan', example: 'Что у меня сегодня?', about: 'события и задачи выбранного дня' },
        { action: 'day.plan', example: 'Что у меня завтра?', about: 'то же для завтрашнего дня' },
        { action: 'tasks.overdue', example: 'Покажи просроченные задачи', about: 'задачи с прошедшим сроком' },
        { action: 'suggestions.list', example: 'Какие есть предложения?', about: 'подсказки по вашим записям' },
        { action: 'finance.summary', example: 'Сколько я потратил?', about: 'расходы за сегодня и за месяц' },
        { action: 'auto.status', example: 'Какой пробег?', about: 'автомобиль, пробег и ближайшее ТО' },
        { action: 'help.capabilities', example: 'Что ты умеешь?', about: 'список понятных команд' }
      ],
      mutations: [
        { action: 'task.create', example: 'Создай задачу купить масло на завтра', about: 'создаёт задачу' },
        { action: 'event.create', example: 'Добавь завтра в 10 встречу с Сергеем', about: 'создаёт событие' },
        { action: 'task.complete', example: 'Отметь купить масло выполненной', about: 'отмечает задачу выполненной' },
        { action: 'task.reschedule', example: 'Перенеси задачу купить масло на пятницу', about: 'меняет дату задачи' }
      ],
      notYet: [
        'удаление записей текстом',
        'расходы, заметки, заправки и напоминания текстом',
        'перенос событий текстом',
        'свободный разговор за пределами перечисленных уточнений'
      ]
    };
  }
  function examples() { return EXAMPLES.slice(); }

  return { normalize, parse, resolve, execute, respond, respondToParseError, run, supported, examples, context: makeContext };
})();
