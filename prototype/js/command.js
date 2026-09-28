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
      confirmed: ctx.confirmed === true,
      /* Slots — заполненные пользователем недостающие параметры (счёт/категория
         финансовой операции). Это transient orchestration data того же рода, что
         targetId: бизнес-состояние сюда не попадает и нигде не сохраняется. */
      slots: {
        cat: (ctx.slots && ctx.slots.cat) || '',
        account: (ctx.slots && ctx.slots.account) || ''
      }
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
    'Перенеси задачу купить масло на пятницу',
    'Создай заметку купить фильтр для машины',
    'Покажи заметки про отпуск',
    'Напомни купить масло на завтра',
    'Покажи напоминания',
    'Запиши расход 850 ₽ на продукты',
    'Покажи расходы за сегодня'
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
    UNSUPPORTED_REMINDER: 'Изменять, откладывать или скрывать уже созданное напоминание текстовой командой я пока не умею. Откройте «Уведомления» — там это можно сделать, и действие попадёт в «Историю». Создать новое напоминание и посмотреть список я уже умею: «Напомни купить масло на завтра», «Покажи напоминания».',
    UNSUPPORTED_AUTO: 'Записывать заправки и обслуживание текстом я пока не умею. Это делается в разделе «Авто».',
    NOTE_CONTENT_REQUIRED: 'Не поняла, что записать в заметку. Напишите так: «Создай заметку купить фильтр для машины».',
    UNSUPPORTED_NOTE_UPDATE: 'Изменять текст уже существующей заметки текстовой командой я пока не умею. Откройте заметку в разделе «Заметки» — там можно отредактировать текст.',
    UNSUPPORTED_NOTE_ARCHIVE: 'Отправлять заметку в архив или возвращать её текстом я пока не умею. Это делается в разделе «Заметки».',
    REMINDER_CONTENT_REQUIRED: 'Не поняла, о чём напомнить. Напишите так: «Напомни купить масло на завтра».',
    AMOUNT_REQUIRED: 'Не поняла сумму расхода. Напишите её цифрами — например: «Запиши расход 850 ₽ на продукты», «Потратил 1 250,50 руб на продукты».',
    AMOUNT_UNSUPPORTED: 'Такую запись суммы я пока не понимаю: сокращения вроде «5к» или «1,2к» и пересчёт валют не поддерживаются. Напишите сумму полностью цифрами — например «5000», «500,50» или «1 250,50 ₽».',
    AMOUNT_INVALID: 'Сумма расхода должна быть больше нуля и записана цифрами — например «850» или «1 250,50 ₽».',
    CURRENCY_UNSUPPORTED: 'Я записываю расходы только в валюте вашего профиля и не пересчитываю курсы. Напишите сумму в рублях — например «850 ₽».',
    UNSUPPORTED_FINANCE_INCOME: 'Работать с доходами текстовой командой я пока не умею — умею только расходы. Доход можно добавить и посмотреть в разделе «Финансы».',
    UNSUPPORTED_FINANCE_UPDATE: 'Изменять уже записанную финансовую операцию текстовой командой я пока не умею. Откройте «Финансы» — там операцию можно отредактировать, и изменение попадёт в «Историю».',
    FINANCE_PERIOD_UNSUPPORTED: 'Показывать расходы за такой период я пока не умею. Могу за сегодня, за неделю или за месяц — например: «Покажи расходы за неделю». Остальные периоды есть в разделе «Финансы» с фильтрами.',
    AMOUNT_AMBIGUOUS: 'Не поняла, какая именно сумма расхода — в команде несколько чисел. Напишите одну сумму: «Запиши расход 850 ₽ на продукты».',
    REMINDER_DATE_REQUIRED: 'Не поняла, на какую дату напомнить — у напоминания обязательно должна быть дата. Напишите так: «Напомни купить масло на завтра» или «Напомни завтра в 10 позвонить Сергею».'
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
  /* Любое кириллическое окончание принимается сознательно (как у дней недели выше):
     «заметку», «заметки», «заметке», «заметок» — без отдельного морфологического анализатора. */
  const NOTE_WORD = '(?:заметк[а-яе]*)';
  const SHOW_VERB = '(?:покажи|показать|найди|найти|поищи|поискать|искать)';
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

  /* Напоминания (Stage 2, итерация 4): «напомни …» — прямой триггер, «создай/добавь
     напоминание …» — тот же домен через обычный CREATE_VERB, как у задач/заметок.
     Любое кириллическое окончание принимается сознательно (см. NOTE_WORD выше). */
  const REMINDER_VERB = '(?:напомни(?:те)?|напомнить)';
  const REMINDER_WORD = '(?:напоминани[а-яе]*)';

  /* Заголовок заметки для общего действия (у него title обязателен и ограничен 120
     символами — docs/MVP_SCOPE.md §5.5). Второй схемы заметок здесь нет: это просто
     подготовка поля перед вызовом единственного существующего Common Action. */
  function noteTitleFromContent(content) {
    const clean = tidy(content);
    const short = clean.length > 60 ? clean.slice(0, 60).trim() + '…' : clean;
    return capitalize(short);
  }

  /* «Создай/добавь/запиши заметку …» — весь текст после слова «заметк*» становится
     содержимым заметки целиком, без разбора даты/времени и без повторного поиска
     доменных слов внутри него: команда уже однозначно определена конструкцией
     «глагол + заметку», поэтому «встреча», «билет», «расход» и т.п. внутри текста
     не должны переклассифицировать её в событие/задачу/финансы (см. секцию ниже —
     ровно эта регрессия уже случалась в PR #27 review). */
  function parseNoteCreate(n, raw) {
    const rx = new RegExp('^' + CREATE_VERB + '\\s+(?:нов(?:ую|ое|ый)\\s+)?' + NOTE_WORD + NOT_AFTER + '\\s*(.*)$', 'i');
    if (!rx.test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const content = tidy(m[1] || '');
    if (!content) return fail('NOTE_CONTENT_REQUIRED', 'note.create');
    return intent('note.create', 'mutation', { content, title: noteTitleFromContent(content) }, 'note.create');
  }

  /* «Покажи/найди заметки [про …]» — read-only поиск через существующий Common Query.
     Пустой запрос («покажи заметки») означает «покажи все активные», а не ошибку. */
  function parseNoteSearch(n, raw) {
    const rx = new RegExp('^' + SHOW_VERB + '\\s+(?:мои\\s+)?' + NOTE_WORD + NOT_AFTER +
      '\\s*(?:про|о|об|на тему)?\\s*(.*)$', 'i');
    if (!rx.test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const q = tidy(String(m[1] || '').replace(/^(?:про|о|об|на тему)\s+/i, ''));
    return intent('note.search', 'query', { q }, 'note.search');
  }

  /* «Напомни …» или «Создай/добавь напоминание …» — весь остаток после триггера
     становится содержимым напоминания целиком, той же логикой, что и у заметок
     (раздел 11.2 COMMAND_ENGINE.md): «встреча», «задача», «заметка», «расход» и
     другие доменные слова внутри содержимого не переключают команду на другой
     домен — ровно тот же урок про PR #27, применённый к напоминаниям. Единственный
     существующий контракт напоминания — общий слой `AvenActions.reminders`
     (фасад над `AvenNotify`, docs/MVP_SCOPE.md §4.2.4): дата обязательна, время
     необязательно, второй схемы здесь нет. */
  function parseReminderCreate(n, raw, context) {
    let rx = new RegExp('^' + REMINDER_VERB + NOT_AFTER + '\\s+(.+)$', 'i');
    let matched = rx.test(n);
    if (!matched) {
      rx = new RegExp('^' + CREATE_VERB + '\\s+(?:нов(?:ое|ую|ый)\\s+)?' + REMINDER_WORD + NOT_AFTER + '\\s*(.*)$', 'i');
      matched = rx.test(n);
    }
    if (!matched) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const when = extractWhen(m[1] || '', context);
    if (when.error) return fail(when.error, 'reminder.create');
    const content = tidy(when.rest || '');
    /* Содержимого может не быть даже при найденной дате («напомни завтра») —
       без текста непонятно, о чём напоминать, а выдумывать его нельзя. */
    if (!content) return fail('REMINDER_CONTENT_REQUIRED', 'reminder.create');
    /* Общий слой требует дату (§4.2.4): без неё — честная просьба уточнить,
       а не молчаливая подстановка «сегодня». */
    if (!when.dateISO) return fail('REMINDER_DATE_REQUIRED', 'reminder.create');
    return intent('reminder.create', 'mutation',
      { title: capitalize(content), dateISO: when.dateISO, time: when.time || '' }, 'reminder.create');
  }

  /* «Покажи/найди [мои] напоминания [про …]» и «Какие [у меня] напоминания?» —
     read-only поиск/показ через существующий Common Query `AvenActions.reminders.list`.
     Пустой остаток означает «покажи все», а не ошибку — как и у заметок. */
  function parseReminderSearch(n, raw) {
    const rx = new RegExp('^(?:' + SHOW_VERB + '\\s+(?:мои\\s+)?|как[а-яе]*\\s+(?:у\\s+меня\\s+)?)' +
      REMINDER_WORD + NOT_AFTER + '\\s*(?:про|о|об|на тему)?\\s*(.*)$', 'i');
    if (!rx.test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const q = tidy(String(m[1] || '').replace(/^(?:про|о|об|на тему)\s+/i, ''));
    return intent('reminder.search', 'query', { q }, 'reminder.search');
  }

  /* ---------- Финансы текстом (Stage 2, итерация 5) ----------
     Только расход: создание (всегда через подтверждение) и read-only просмотр.
     Второго денежного движка здесь нет — сумма лишь извлекается из текста и
     переводится в целые минимальные единицы (копейки) тем же правилом, что и в
     общем слое (`AvenActions.money.minor`), после чего её проверяет и сохраняет
     единственное существующее общее действие `AvenActions.finance.createOperation`. */
  const EXPENSE_WORD = '(?:расход[а-яе]*|трат[а-яе]*)';
  const SPEND_VERB = '(?:потратил[аи]?|потратить|истратил[аи]?|заплатил[аи]?|заплатить|оплатил[аи]?|оплатить)';
  const CURRENCY_TAIL = '(?:₽|руб(?:\\.|л[а-яе]*)?|р\\.?)';
  const INCOME_WORD = /(доход[а-яе]*|зарплат[а-яе]*|аванс[а-яе]*|премия|премию)/;

  /* Извлечение суммы. Поддерживается ровно то, что задокументировано:
       500 · 500 ₽ · 500 руб · 500 рублей · 500,50 · 500.50 · 1 250,50 ₽
     Сокращения («5к», «1,2к», «полтысячи»), словесные суммы и чужая валюта —
     осознанный отказ без мутации, а не молчаливая догадка. */
  function findAmount(text) {
    const t = normalize(text);
    if (!t) return { found: false };
    if (new RegExp('\\d\\s*(?:к|k|тыс[а-яе]*|млн|kk)' + NOT_AFTER).test(t)) return { error: 'AMOUNT_UNSUPPORTED' };
    if (/[$€£]/.test(t) || /(доллар[а-яе]*|евро|usd|eur)/.test(t)) return { error: 'CURRENCY_UNSUPPORTED' };
    if (/\d+[.,]\d{3,}/.test(t)) return { error: 'AMOUNT_UNSUPPORTED' };
    if (/-\s*\d/.test(t)) return { error: 'AMOUNT_INVALID' };
    const rx = new RegExp(NOT_BEFORE + '(\\d{1,3}(?: \\d{3})+|\\d+)(?:[.,](\\d{1,2}))?(?!\\d)');
    const m = rx.exec(t);
    if (!m) return { found: false };
    const rubles = Number(String(m[1]).replace(/ /g, ''));
    const kopeks = Number((m[2] || '').padEnd(2, '0') || 0);
    if (!isFinite(rubles) || !isFinite(kopeks)) return { error: 'AMOUNT_INVALID' };
    /* Целые минимальные единицы: никакого накопления во float. */
    const minor = Math.round(rubles) * 100 + Math.round(kopeks);
    if (!(minor > 0)) return { error: 'AMOUNT_INVALID' };
    return { found: true, minor, source: m[0] };
  }

  /* «Запиши расход 850 ₽ на продукты», «Добавь расход 1 250,50 ₽ на бензин»,
     «Потратил 500 рублей на продукты», «Расход 500 ₽ на продукты вчера».
     Категория и счёт только СВЯЗЫВАЮТСЯ с уже существующими — их разрешение
     выполняется в execute(), поэтому parse остаётся чистым. */
  function parseExpenseCreate(n, raw, context) {
    const head = '^(?:' + CREATE_VERB + '\\s+(?:нов[а-яе]+\\s+)?' + EXPENSE_WORD + NOT_AFTER +
      '|' + EXPENSE_WORD + NOT_AFTER + '|' + SPEND_VERB + NOT_AFTER + ')\\s*(.*)$';
    const rx = new RegExp(head, 'i');
    if (!rx.test(n)) return null;
    /* Начало без глагола («расходы за сегодня») — это ещё не попытка записи:
       такой текст должен достаться read-only правилу ниже, а не получить
       ошибку «не поняла сумму». */
    const withVerb = new RegExp('^(?:' + CREATE_VERB + '\\s|' + SPEND_VERB + NOT_AFTER + ')', 'i').test(n);
    /* Слово «доход» внутри такой фразы — это уже НЕ попытка записать доход: команда
       явно начата словом «расход» или глаголом траты, поэтому «доход» может быть только
       названием существующей категории. Отвечать здесь «доходы не умею» было бы неправдой. */
    const m = rx.exec(n);
    let rest = String(m[1] || '');
    const amount = findAmount(rest);
    if (amount.error) {
      if (!withVerb && !/\d/.test(rest)) return null;
      return fail(amount.error, 'finance.expense.create');
    }
    if (!amount.found) {
      if (!withVerb) return null;
      return fail('AMOUNT_REQUIRED', 'finance.expense.create');
    }
    rest = tidy(cut(rest, amount.source));
    rest = tidy(rest.replace(new RegExp('^' + CURRENCY_TAIL + NOT_AFTER, 'i'), ' '));
    /* Счёт — только явная конструкция «со счёта …»/«с карты …», чтобы обычное
       «на продукты» никогда не было понято как счёт. Разбирается до дат, иначе
       общая обрезка хвостовых предлогов могла бы «съесть» название счёта. */
    let accountQuery = '';
    const accRx = new RegExp(NOT_BEFORE + '(?:со|с)\\s+(?:счет[а-яе]*|карт[а-яе]*)\\s+(.+?)(?=\\s+(?:на|по)' + NOT_AFTER + '|$)', 'i');
    const accM = accRx.exec(rest);
    if (accM) {
      accountQuery = tidy(accM[1]);
      rest = tidy(rest.replace(accM[0], ' '));
    }
    const when = extractWhen(rest, context);
    if (when.error) return fail(when.error, 'finance.expense.create');
    rest = tidy(when.rest || '');
    /* Если между суммой и первым предлогом осталось ещё одно число («расход 12 34 на
       продукты»), сумма неоднозначна — брать первое число молча нельзя. */
    const headTail = String(rest).split(new RegExp(NOT_BEFORE + '(?:на|по)' + NOT_AFTER))[0];
    if (/\d/.test(headTail)) return fail('AMOUNT_AMBIGUOUS', 'finance.expense.create');
    /* Хвост после запятой («…на продукты, пожалуйста») в название категории не входит. */
    const catQuery = tidy(String(rest).replace(new RegExp('^(?:на|по|за)\\s+(?:категори[а-яе]*\\s+)?', 'i'), '').split(',')[0]);
    const out = intent('finance.expense.create', 'mutation',
      { amountMinor: amount.minor, catQuery, accountQuery, dateISO: when.dateISO || '' },
      'finance.expense.create');
    /* Финансовая мутация ВСЕГДА подтверждается — решение владельца, даже когда
       команда распознана полностью и однозначно. */
    out.requiresConfirmation = true;
    return out;
  }

  /* «Покажи расходы [за сегодня|за неделю|за месяц] [на продукты]» — read-only
     через существующие Common Queries; своих расчётов здесь нет. */
  function parseExpenseList(n, raw, context) {
    const rx = new RegExp('^(?:' + SHOW_VERB + '\\s+(?:мои\\s+)?|как[а-яе]*\\s+(?:у\\s+меня\\s+)?)?' +
      EXPENSE_WORD + NOT_AFTER + '\\s*(.*)$', 'i');
    if (!rx.test(n)) return null;
    const m = rx.exec(n);
    let rest = tidy(m[1] || '');
    let period = 'month';
    if (new RegExp(NOT_BEFORE + '(?:за\\s+)?сегодня' + NOT_AFTER).test(rest)) { period = 'today'; rest = tidy(rest.replace(/(?:за\s+)?сегодня/, ' ')); }
    else if (new RegExp(NOT_BEFORE + '(?:за\\s+)?(?:эту\\s+)?недел[юяи][а-яе]*' + NOT_AFTER).test(rest)) { period = 'week'; rest = tidy(rest.replace(/(?:за\s+)?(?:эту\s+)?недел[юяи][а-яе]*/, ' ')); }
    else if (new RegExp(NOT_BEFORE + '(?:за\\s+)?(?:этот\\s+)?месяц' + NOT_AFTER).test(rest)) { period = 'month'; rest = tidy(rest.replace(/(?:за\s+)?(?:этот\s+)?месяц/, ' ')); }
    /* Периоды, которых существующий Common Query не поддерживает («за вчера», «за год»,
       «за сентябрь», конкретная дата), не должны молча превращаться в «за месяц» —
       это был бы неверный ответ на заданный вопрос. Честно объясняем, что умеем. */
    const unsupportedPeriod = /(год[а-яе]*|прошл[а-яе]*|позапрошл[а-яе]*|январ|феврал|март|апрел|ма[йея]|июн|июл|август|сентябр|октябр|ноябр|декабр|квартал[а-яе]*)/.test(rest) ||
      findDate(rest, context).found;
    if (unsupportedPeriod) return fail('FINANCE_PERIOD_UNSUPPORTED', 'finance.list');
    const catQuery = tidy(String(rest).replace(new RegExp('^(?:на|по|за)\\s+(?:категори[а-яе]*\\s+)?', 'i'), '').split(',')[0]);
    return intent('finance.list', 'query', { period, catQuery }, 'finance.list');
  }

  /* Доходы текстом в эту итерацию не входят (расход-first блок по документации).
     Честный отказ должен сработать раньше общих правил вроде «какой пробег»,
     иначе «Запиши доход 500 на авто» попало бы в другой домен. */
  function parseIncomeUnsupported(n) {
    const aboutIncome = INCOME_WORD.test(n) || /(заработал[аи]?|заработок)/.test(n);
    if (!aboutIncome) return null;
    if (!/(запиши|запишите|добавь|добавить|созда|внеси|внести|получил|получила|заработал|заработала|заработок|покажи|показать|найди|сколько|каки[ем]|какой)/.test(n)) return null;
    return fail('UNSUPPORTED_FINANCE_INCOME', 'guard.finance.income');
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
    /* Попытка удалить или изменить уже записанную операцию — это НЕ вопрос «сколько
       я потратил»: отвечать на неё сводкой расходов было бы неправдой (ADR-010).
       Такие фразы уходят к честным отказам guard-ов ниже. */
    if (hasWord(n, 'удали|удалить|сотри|стереть|убери|очисти|очистить')) return null;
    if (hasWord(n, 'измени|изменить|исправь|исправить|отредактируй|отредактировать|обнови|обновить|перенеси|перенести')) return null;
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
    /* Создание и поиск/показ уже разобраны отдельными правилами выше (parseReminderCreate/
       parseReminderSearch) — если разбор дошёл сюда, это НЕ удалось разобрать как create/search.
       Честный отказ «изменять/откладывать/скрывать уже существующее напоминание не умею»
       уместен только тогда, когда фраза действительно похожа на попытку такого действия:
       начинается с триггера напоминания (включая «напомни» без содержимого — «создай
       напоминание …» без текста) или содержит слово «напоминание/напоминания/…» рядом с
       глаголом изменения. Проверка на «слово где-то в середине предложения» была слишком
       широкой: «Пожалуйста, напомни купить хлеб на завтра» или «Кто-то напомни мне купить
       хлеб» не являются попыткой изменить существующее напоминание, и им нельзя честно
       отвечать «уже созданное напоминание менять не умею» — это была бы неправда (ADR-010:
       Aven не должен утверждать то, что не соответствует действительности). Для таких фраз
       правильный честный ответ — общее «не поняла команду», как у задач/событий/заметок в
       эквивалентной ситуации. */
    const reminderStartsHere = startRx(REMINDER_VERB + '|' + REMINDER_WORD, '').test(n);
    const reminderEditVerbNearby = new RegExp(NOT_BEFORE + REMINDER_WORD).test(n) &&
      hasWord(n, 'измени|изменить|перенеси|перенести|перенос|отложи|отложить|скрой|скрыть|верни|вернуть|восстанови|восстановить');
    if (reminderStartsHere || reminderEditVerbNearby) return fail('UNSUPPORTED_REMINDER', 'guard.reminder');
    if (/(заправ|залил|бензин|топлив)/.test(n)) return fail('UNSUPPORTED_AUTO', 'guard.auto');
    /* Расходы текстом уже разобраны правилами выше (parseExpenseCreate/parseExpenseList).
       Здесь остаются только доходы и прочие финансовые записи, которых в этой итерации нет. */
    if (/(запиши|добавь|созда|внеси|получил|получила)/.test(n) && INCOME_WORD.test(n)) return fail('UNSUPPORTED_FINANCE_INCOME', 'guard.finance.income');
    /* Изменение уже записанной операции текстом — честный отдельный отказ, а не общее
       «не поняла» и тем более не сводка расходов. Удаление остаётся под UNSUPPORTED_DELETE выше. */
    if (/(расход|доход|операци|трат)/.test(n) &&
      hasWord(n, 'измени|изменить|исправь|исправить|отредактируй|отредактировать|обнови|обновить|перенеси|перенести')) {
      return fail('UNSUPPORTED_FINANCE_UPDATE', 'guard.finance.update');
    }
    if (/(запиши|добавь|созда|внеси|потратил|заплатил|оплатил)/.test(n) && (/(рубл|₽|расход|доход|трат)/.test(n) || hasWord(n, 'р'))) return fail('UNSUPPORTED_FINANCE', 'guard.finance');
    /* Создание заметки уже разобрано отдельным правилом выше (см. parseNoteCreate) —
       если разбор дошёл сюда со словом «заметк*», это изменение/архив уже существующей
       заметки, а не создание. Явные честные отказы вместо общего «не поняла»
       (тот же урок про \w и кириллицу, что и у остальных guard-ов). */
    if (/заметк/.test(n)) {
      if (/архив/.test(n)) return fail('UNSUPPORTED_NOTE_ARCHIVE', 'guard.note.archive');
      if (hasWord(n, 'измени|изменить|переименуй|переименовать|отредактируй|отредактировать|обнови|обновить|допиши|дополни|дополнить'))
        return fail('UNSUPPORTED_NOTE_UPDATE', 'guard.note.update');
    }
    if (new RegExp('^(?:' + MOVE_VERB + ')').test(n) && EVENT_WORD.test(n)) return fail('UNSUPPORTED_EVENT_UPDATE', 'guard.event.update');
    return null;
  }

  const RULES = [
    parseTaskCreate, parseNoteCreate, parseNoteSearch, parseReminderCreate, parseReminderSearch,
    parseExpenseCreate, parseExpenseList, parseIncomeUnsupported,
    parseEventCreate, parseTaskComplete, parseTaskReschedule,
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
    /* INFERRED допускается только для целых слов/фраз с хотя бы одним содержательным
       словом (3+ символа). Иначе «а», «от» или кусок слова «чет» могли бы выбрать
       единственную Task только потому, что других задач сейчас нет. */
    const meaningful = q.split(/\s+/).some((part) => part.length >= 3);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const partialRx = meaningful ? wordRx(escaped) : null;
    const partial = partialRx ? list.filter((t) => partialRx.test(normalize(t.title))) : [];
    if (partial.length === 1) return { ok: true, status: 'resolved', resolution: 'INFERRED', entity: taskCandidate(partial[0]) };
    if (partial.length > 1) return { ok: false, status: 'ambiguous', resolution: 'AMBIGUOUS', code: 'AMBIGUOUS', candidates: partial.map(taskCandidate) };
    return { ok: false, status: 'not_found', resolution: 'UNSUPPORTED', code: 'NOT_FOUND', candidates: [] };
  }
  /* Общий безопасный подбор справочного значения (категория/счёт финансов).
     Ровно те же дискретные правила, что у задач: полное совпадение — EXACT,
     единственное вхождение целым словом — INFERRED, несколько — AMBIGUOUS,
     ничего — not_found. Ничего нового движок не создаёт. */
  function resolveChoice(query, items) {
    const q = normalize(query);
    if (!q) return { ok: false, status: 'missing', resolution: 'AMBIGUOUS', candidates: items };
    const exact = items.filter((it) => normalize(it.title) === q);
    if (exact.length === 1) return { ok: true, status: 'resolved', resolution: 'EXACT', item: exact[0] };
    if (exact.length > 1) return { ok: false, status: 'ambiguous', resolution: 'AMBIGUOUS', candidates: exact };
    const meaningful = q.split(/\s+/).some((part) => part.length >= 3);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = meaningful ? wordRx(escaped) : null;
    const partial = rx ? items.filter((it) => rx.test(normalize(it.title))) : [];
    if (partial.length === 1) return { ok: true, status: 'resolved', resolution: 'INFERRED', item: partial[0] };
    if (partial.length > 1) return { ok: false, status: 'ambiguous', resolution: 'AMBIGUOUS', candidates: partial };
    return { ok: false, status: 'not_found', resolution: 'UNSUPPORTED', candidates: [] };
  }
  function financeCategories() {
    return (Core().finance.categories() || []).map((name) => ({ id: name, title: name, hint: 'категория' }));
  }
  function financeAccounts() {
    return (Core().finance.accounts() || []).filter((a) => a && a.id)
      .map((a) => ({ id: a.id, title: a.name || a.id, hint: 'счёт' }));
  }
  /* Разрешение одного слота финансовой операции. Возвращает либо значение, либо
     описание того, что нужно уточнить: мутации на этом шаге не происходит никогда. */
  function resolveFinanceSlot(kind, query, chosenId) {
    const items = kind === 'account' ? financeAccounts() : financeCategories();
    if (chosenId) {
      const still = items.filter((it) => it.id === chosenId)[0];
      /* Между уточнением и подтверждением счёт/категорию могли удалить или
         переименовать — тогда честный отказ, а не «почти правильная» запись. */
      if (!still) return { ok: false, status: 'stale', kind, items };
      return { ok: true, item: still, resolution: 'EXACT' };
    }
    const res = resolveChoice(query, items);
    if (res.ok) return { ok: true, item: res.item, resolution: res.resolution };
    if (res.status === 'not_found') return { ok: false, status: 'not_found', kind, query, items };
    return { ok: false, status: res.status === 'missing' ? 'missing' : 'ambiguous', kind, query, candidates: res.candidates, items };
  }

  function resolve(intentObj, ctx) {
    const context = makeContext(ctx);
    if (!intentObj || intentObj.ok !== true) return { ok: false, status: 'unsupported', resolution: 'UNSUPPORTED', candidates: [] };
    if (intentObj.action === 'task.complete' || intentObj.action === 'task.reschedule') {
      return resolveTask((intentObj.params || {}).query, context);
    }
    if (intentObj.action === 'finance.expense.create') {
      const p = intentObj.params || {};
      const cat = resolveFinanceSlot('cat', p.catQuery, context.slots.cat);
      if (!cat.ok) {
        return { ok: false, status: cat.status === 'ambiguous' || cat.status === 'missing' ? 'ambiguous' : 'not_found',
          resolution: cat.status === 'not_found' ? 'UNSUPPORTED' : 'AMBIGUOUS', slot: 'cat', candidates: cat.candidates || cat.items || [] };
      }
      const acc = resolveFinanceSlot('account', p.accountQuery, context.slots.account);
      if (!acc.ok) {
        return { ok: false, status: acc.status === 'ambiguous' || acc.status === 'missing' ? 'ambiguous' : 'not_found',
          resolution: acc.status === 'not_found' ? 'UNSUPPORTED' : 'AMBIGUOUS', slot: 'account', candidates: acc.candidates || acc.items || [] };
      }
      return { ok: true, status: 'resolved', resolution: cat.resolution === 'INFERRED' || acc.resolution === 'INFERRED' ? 'INFERRED' : 'EXACT',
        entity: { cat: cat.item.title, account: acc.item.title } };
    }
    return { ok: true, status: 'resolved', resolution: (intentObj.match && intentObj.match.resolution) || 'EXACT', entity: null };
  }
  /* Единый ответ движка на «нужно уточнить счёт/категорию» и на исчезнувшее
     значение. Во всех этих случаях мутации нет и «История» не пишется. */
  const SLOT_LABEL = { cat: 'категорию', account: 'счёт' };
  const SLOT_SELF = { cat: 'её', account: 'его' };
  function financeSlotProblem(kind, res, intentObj) {
    const action = 'finance.expense.create';
    if (res.status === 'stale') {
      return result(false, 'stale', action, {
        code: 'STALE_' + (kind === 'account' ? 'ACCOUNT' : 'CATEGORY'), intent: intentObj, slot: kind,
        message: kind === 'account'
          ? 'Этого счёта больше нет в «Финансах». Ничего не изменилось — выберите счёт заново.'
          : 'Этой категории больше нет в «Финансах». Ничего не изменилось — выберите категорию заново.'
      });
    }
    if (res.status === 'not_found') {
      return result(false, 'not_found', action, {
        code: kind === 'account' ? 'ACCOUNT_NOT_FOUND' : 'CATEGORY_NOT_FOUND', intent: intentObj, slot: kind,
        query: res.query || '', candidates: res.items || [],
        message: (kind === 'account'
          ? 'Счёта ' + quote(res.query || '') + ' у вас нет, а сама я счета не создаю.'
          : 'Категории ' + quote(res.query || '') + ' у вас нет, а сама я категории не создаю.') +
          ' Ничего не изменилось. Доступные варианты: ' + (res.items || []).map((x) => quote(x.title)).join(', ') +
          '. Выберите один из них или добавьте новый в разделе «Финансы».'
      });
    }
    return result(false, 'ambiguous', action, {
      code: 'CLARIFICATION_REQUIRED', resolution: 'AMBIGUOUS', intent: intentObj, slot: kind,
      candidates: (res.candidates || res.items || []).slice(),
      question: (res.status === 'missing'
        ? 'Уточните ' + SLOT_LABEL[kind] + ' расхода — сама я ' + SLOT_SELF[kind] + ' не выбираю.'
        : 'Подходит несколько вариантов. Уточните ' + SLOT_LABEL[kind] + ' расхода.')
    });
  }
  /* Текст подтверждения: пользователь обязан увидеть конкретные тип, сумму,
     категорию, счёт и РАЗРЕШЁННУЮ дату — скрытых значений по умолчанию нет. */
  function expenseSummary(preview) {
    const C = Core();
    return 'Записать расход ' + C.money.exact(preview.amountMinor / 100) +
      ' · категория ' + quote(preview.cat) +
      ' · счёт ' + quote(preview.accountName) +
      ' · дата ' + whenPhrase(preview.dateISO, '') +
      '. Подтвердите — пока ничего не изменилось.';
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
      case 'note.create': {
        /* Никакой второй схемы заметок: единственные поля, которые движок готовит, —
           title (обязателен у общего действия) и body (весь текст команды целиком). */
        const res = C.notes.createNote({ title: p.title, body: p.content }, opts);
        if (!res.ok) return actionFailed('note.create', res, intentObj);
        return result(true, 'done', 'note.create', {
          intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: { title: res.entity.title, body: res.entity.body || '' }
        });
      }
      case 'note.search': {
        const q = tidy(p.q || '');
        const items = C.notes.getNotes({ status: 'active', q }).items || [];
        return result(true, 'info', 'note.search', { intent: intentObj, data: { q, items } });
      }
      case 'reminder.create': {
        /* Единственный существующий контракт напоминания: `AvenActions.reminders`
           (фасад над AvenNotify, docs/MVP_SCOPE.md §4.2.4). Второй схемы полей
           здесь нет — движок готовит ровно те поля, что понимает общий слой. */
        const res = C.reminders.create({ title: p.title, dateISO: p.dateISO, time: p.time || '' }, opts);
        if (!res.ok) return actionFailed('reminder.create', res, intentObj);
        return result(true, 'done', 'reminder.create', {
          intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: { title: res.entity.title, dateISO: res.entity.dateISO || '', time: res.entity.time || '' }
        });
      }
      case 'reminder.search': {
        const q = tidy(p.q || '');
        const items = (C.reminders.list({ q }).items) || [];
        return result(true, 'info', 'reminder.search', { intent: intentObj, data: { q, items } });
      }
      /* --------- Финансы: создание расхода (Stage 2, итерация 5) ---------
         Три обязательных шага владельца: уточнение недостающего → подтверждение
         конкретной операции → только потом единственное общее действие.
         Ни на одном шаге до подтверждения состояние и «История» не меняются. */
      case 'finance.expense.create': {
        const amountMinor = Math.round(Number(p.amountMinor) || 0);
        if (!(amountMinor > 0) || !isFinite(amountMinor)) {
          return result(false, 'invalid', 'finance.expense.create', {
            code: 'AMOUNT_INVALID', message: PARSE_MESSAGES.AMOUNT_INVALID, intent: intentObj
          });
        }
        const dateISO = ISO_RE.test(String(p.dateISO || '')) ? p.dateISO : context.todayISO;
        const cat = resolveFinanceSlot('cat', p.catQuery, context.slots.cat);
        if (!cat.ok) return financeSlotProblem('cat', cat, intentObj);
        const acc = resolveFinanceSlot('account', p.accountQuery, context.slots.account);
        if (!acc.ok) return financeSlotProblem('account', acc, intentObj);
        const preview = {
          amountMinor, amount: amountMinor / 100, cat: cat.item.title,
          accountId: acc.item.id, accountName: acc.item.title, dateISO
        };
        if (!context.confirmed) {
          return result(false, 'confirmation_required', 'finance.expense.create', {
            code: 'CONFIRMATION_REQUIRED',
            resolution: cat.resolution === 'INFERRED' || acc.resolution === 'INFERRED' ? 'INFERRED' : 'EXACT',
            intent: intentObj, preview, summary: expenseSummary(preview)
          });
        }
        const res = C.finance.createOperation({
          type: 'expense', amount: preview.amount, cat: preview.cat,
          account: preview.accountId, dateISO: preview.dateISO
        }, opts);
        if (!res.ok) return actionFailed('finance.expense.create', res, intentObj);
        return result(true, 'done', 'finance.expense.create', {
          intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: {
            amount: res.entity.amount, amountMinor: C.money.minor(res.entity.amount),
            cat: res.entity.cat, accountName: C.finance.account(res.entity.account).name,
            dateISO: C.finance.dateISO(res.entity)
          }
        });
      }
      case 'finance.list': {
        const period = ['today', 'week', 'month', 'all'].indexOf(p.period) >= 0 ? p.period : 'month';
        let cat = '';
        if (tidy(p.catQuery || '')) {
          const found = resolveChoice(p.catQuery, financeCategories());
          if (!found.ok) {
            return result(true, 'info', 'finance.list', {
              intent: intentObj,
              data: { period, unknownCat: tidy(p.catQuery), items: [], totals: null, candidates: found.candidates || [] }
            });
          }
          cat = found.item.title;
        }
        const filters = { type: 'expense', period, refISO: context.todayISO };
        if (cat) filters.cat = cat;
        const items = C.finance.getOperations(filters).items || [];
        const totals = C.finance.totals(filters);
        return result(true, 'info', 'finance.list', { intent: intentObj, data: { period, cat, items, totals } });
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
  /* Ответ на read-only просмотр расходов: человеческий текст с обычным денежным
     форматом. Сумма НЕ пересчитывается здесь заново — она берётся из того же
     общего запроса итогов, что и карточки раздела «Финансы». */
  const PERIOD_LABEL = { today: 'за сегодня', week: 'за неделю', month: 'за этот месяц', all: 'за всё время' };
  function expenseListText(data) {
    const C = Core();
    const period = PERIOD_LABEL[data.period] || PERIOD_LABEL.month;
    if (data.unknownCat) {
      return 'Категории ' + quote(data.unknownCat) + ' у вас нет, поэтому показать расходы по ней не могу. ' +
        'Категории есть такие: ' + (C.finance.categories() || []).map((x) => quote(x)).join(', ') + '.';
    }
    const items = data.items || [];
    const where = data.cat ? ' по категории ' + quote(data.cat) : '';
    if (!items.length) return 'Расходов ' + period + where + ' пока нет.';
    const shown = items.slice(0, 5).map((o) => (o.title || o.cat) + ' — ' + C.money.exact(o.amount) +
      ' (' + C.dates.dateLabel(C.finance.dateISO(o)) + ')');
    const rest = items.length - shown.length;
    return 'Расходы ' + period + where + ': ' + plural(items.length, 'операция', 'операции', 'операций') +
      ' на ' + C.money.exact(data.totals.expense) + '. ' + shown.join('; ') +
      (rest > 0 ? ' и ещё ' + rest : '') + '. Все они видны в разделе «Финансы».';
  }
  function capabilitiesText() {
    const list = supported();
    return 'Сейчас я понимаю короткие команды о задачах, событиях, заметках и обзоре дня. Вопросы: ' +
      list.queries.map((x) => quote(x.example)).join(', ') + '. Действия: ' +
      list.mutations.map((x) => quote(x.example)).join(', ') +
      '. Пока не умею: ' + list.notYet.join('; ') + '. Все разделы по-прежнему работают обычными кнопками и формами.';
  }
  /* Ответ на поиск/показ заметок: только заголовок и короткий превью текста —
     ни id, ни служебных полей. */
  function noteSearchText(data) {
    const C = Core();
    const items = data.items || [];
    if (!items.length) {
      return data.q
        ? 'Не нашла заметок про ' + quote(data.q) + '. Проверьте название в разделе «Заметки» — я ничего не меняла.'
        : 'Заметок пока нет. Добавьте заметку в разделе «Заметки» или командой «Создай заметку …».';
    }
    if (items.length === 1) {
      const n0 = items[0];
      const preview = C.notes.preview(n0.body || '');
      return 'Нашла заметку ' + quote(n0.title) + (preview ? ': ' + preview : '') +
        ' (папка «' + C.notes.folderOf(n0) + '»). Открыть можно в «Заметках».';
    }
    return 'Нашла ' + plural(items.length, 'заметка', 'заметки', 'заметок') + ': ' +
      listTitles(items, 5) + '. Откройте «Заметки», чтобы посмотреть их целиком.';
  }
  /* Ответ на поиск/показ напоминаний: заголовок и когда (дата/время), без
     служебных полей id/status. Список напоминаний не имеет собственного признака
     «активно/скрыто/отложено» — это реакция на производное уведомление в Центре
     уведомлений (AvenNotify), а не свойство самого напоминания, поэтому команда
     честно показывает все существующие ручные напоминания, как и раздел «Уведомления»
     при открытии карточки для редактирования. */
  function reminderSearchText(data) {
    const items = data.items || [];
    if (!items.length) {
      return data.q
        ? 'Не нашла напоминаний про ' + quote(data.q) + '. Проверьте название в разделе «Уведомления» — я ничего не меняла.'
        : 'Напоминаний пока нет. Создайте их командой «Напомни …» или в разделе «Уведомления».';
    }
    if (items.length === 1) {
      const r0 = items[0];
      return 'Напоминание ' + quote(r0.title) + ' — на ' + whenPhrase(r0.dateISO, r0.time) +
        (r0.note ? '. Заметка: ' + r0.note : '') + '. Посмотреть и изменить можно в «Уведомлениях».';
    }
    const shown = items.slice(0, 5).map((r) => quote(r.title) + ' (' + whenPhrase(r.dateISO, r.time) + ')');
    const rest = items.length - shown.length;
    return 'Нашла ' + plural(items.length, 'напоминание', 'напоминания', 'напоминаний') + ': ' +
      shown.join(', ') + (rest > 0 ? ' и ещё ' + rest : '') + '. Откройте «Уведомления», чтобы увидеть все.';
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
        case 'note.create':
          return 'Заметка ' + quote(res.data.title) + ' создана. Она уже видна в «Заметках»; отменить можно в «Истории».';
        case 'note.search': return noteSearchText(res.data);
        case 'reminder.create':
          return 'Напоминание ' + quote(res.data.title) + ' создано на ' + whenPhrase(res.data.dateISO, res.data.time) +
            '. Оно уже видно в разделе «Уведомления»; отменить создание можно в «Истории».';
        case 'reminder.search': return reminderSearchText(res.data);
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
        case 'finance.expense.create':
          return 'Расход ' + C.money.exact(res.data.amount) + ' записан: категория ' + quote(res.data.cat) +
            ', счёт ' + quote(res.data.accountName) + ', дата ' + whenPhrase(res.data.dateISO, '') +
            '. Он уже виден в «Финансах» и учтён в итогах; отменить можно в «Истории».';
        case 'finance.list': return expenseListText(res.data);
        case 'auto.status': return autoText(res.data);
        case 'help.capabilities': return capabilitiesText();
        default: return 'Готово.';
      }
    }
    if (res.status === 'ambiguous' && res.slot) {
      return (res.question || 'Уточните выбор.') + ' Варианты: ' +
        (res.candidates || []).map((x, i) => (i + 1) + '. ' + x.title).join('; ') + '. Пока ничего не изменилось.';
    }
    if (res.status === 'ambiguous') {
      return 'Нашла несколько задач: ' + listTitles(res.candidates) +
        '. Уточните, какую выбрать — пока ничего не изменилось.';
    }
    if (res.status === 'confirmation_required') return res.summary || 'Подтвердить это действие?';
    if (res.status === 'stale') return res.message || 'Эта запись уже недоступна. Ничего не изменилось.';
    if (res.status === 'not_found' && res.slot) return res.message;
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
        { action: 'note.search', example: 'Покажи заметки про отпуск', about: 'ищет заметки по тексту' },
        { action: 'reminder.search', example: 'Покажи напоминания', about: 'показывает или ищет напоминания' },
        { action: 'finance.list', example: 'Покажи расходы за сегодня', about: 'список расходов за сегодня, неделю или месяц' },
        { action: 'help.capabilities', example: 'Что ты умеешь?', about: 'список понятных команд' }
      ],
      mutations: [
        { action: 'task.create', example: 'Создай задачу купить масло на завтра', about: 'создаёт задачу' },
        { action: 'event.create', example: 'Добавь завтра в 10 встречу с Сергеем', about: 'создаёт событие' },
        { action: 'task.complete', example: 'Отметь купить масло выполненной', about: 'отмечает задачу выполненной' },
        { action: 'task.reschedule', example: 'Перенеси задачу купить масло на пятницу', about: 'меняет дату задачи' },
        { action: 'note.create', example: 'Создай заметку купить фильтр для машины', about: 'создаёт заметку с этим текстом' },
        { action: 'reminder.create', example: 'Напомни купить масло на завтра', about: 'создаёт напоминание на указанную дату' },
        { action: 'finance.expense.create', example: 'Запиши расход 850 ₽ на продукты', about: 'записывает расход — всегда после вашего подтверждения' }
      ],
      notYet: [
        'удаление записей текстом',
        'доходы текстом (расходы уже умею)',
        'изменение и удаление уже записанной финансовой операции текстом',
        'создание новых категорий и счетов текстом',
        'сокращения сумм вроде «5к» и пересчёт валют',
        'заправки и обслуживание авто текстом',
        'изменение, архивирование и удаление уже существующих заметок текстом',
        'изменение, откладывание, скрытие и удаление уже существующих напоминаний текстом',
        'перенос событий текстом',
        'свободный разговор за пределами перечисленных уточнений'
      ]
    };
  }
  function examples() { return EXAMPLES.slice(); }

  return { normalize, parse, resolve, execute, respond, respondToParseError, run, supported, examples, context: makeContext };
})();
