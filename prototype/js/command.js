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
      /* Ожидаемое состояние цели на момент показа подтверждения. Это не копия
         сущности как отдельной бизнес-записи, а минимальный слепок для повторной
         проверки: если событие успели изменить снаружи, подтверждение обязано
         безопасно отказать, а не применить устаревший перенос. */
      expected: ctx.expected && typeof ctx.expected === 'object' ? {
        title: String(ctx.expected.title || ''),
        dateISO: String(ctx.expected.dateISO || ''),
        time: String(ctx.expected.time || ''),
        endTime: String(ctx.expected.endTime || ''),
        allDay: ctx.expected.allDay === true,
        /* Для изменения содержимого заметки stale-guard сверяет именно текст,
           который человек видел перед подтверждением. Папка нужна, потому что
           она показывается как отличающая деталь выбранной заметки. */
        body: String(ctx.expected.body || ''),
        folder: String(ctx.expected.folder || ''),
        note: String(ctx.expected.note || ''),
        link: String(ctx.expected.link || ''),
        dismissed: ctx.expected.dismissed === true,
        snoozeUntilISO: String(ctx.expected.snoozeUntilISO || '')
      } : null,
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
    'Покажи расходы за сегодня',
    'Перенеси событие стоматолог на 12:00',
    'Удали задачу купить масло'
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
    UNSUPPORTED_EVENT_UPDATE: 'Перенести событие я умею так: «Перенеси встречу с Сергеем на завтра в 12:00» или «Перенеси событие стоматолог на 15:30» — и всегда спрошу подтверждение. В этой фразе я не поняла, какое событие переносить; название лучше писать сразу после слова «встречу» или «событие». Остальное в событии (название, место, описание, участники, повторение) пока меняется только в «Календаре».',
    UNSUPPORTED_EVENT_FIELD: 'Менять текстом название, место, описание, участников или повторение события я пока не умею — только дату и время: «Перенеси встречу с Сергеем на завтра в 12:00». Остальные поля есть в форме события в «Календаре».',
    EVENT_QUERY_REQUIRED: 'Не поняла, какое событие перенести. Напишите так: «Перенеси встречу с Сергеем на завтра в 12:00».',
    EVENT_WHEN_REQUIRED: 'Не поняла, на какую дату или время перенести событие. Напишите так: «Перенеси встречу с Сергеем на завтра», «Перенеси событие стоматолог на 15:30» или «… на пятницу в 15:30».',
    UNSUPPORTED_FINANCE: 'Записывать расходы и доходы текстом я пока не умею. Добавьте операцию в разделе «Финансы».',
    UNSUPPORTED_REMINDER: 'Не поняла действие с напоминанием. Перенести можно так: «Перенеси напоминание оплатить интернет на завтра в 10», отложить — до будущей даты, скрыть — «Скрой напоминание …», вернуть — «Верни напоминание …». Я ничего не изменила.',
    REMINDER_MANAGE_QUERY_REQUIRED: 'Укажите название одного напоминания. Например: «Скрой напоминание оплатить интернет». Я ничего не изменила.',
    REMINDER_WHEN_REQUIRED: 'Укажите новую дату и/или время. Например: «Перенеси напоминание оплатить интернет на завтра в 10». Я ничего не изменила.',
    REMINDER_SNOOZE_UNTIL_REQUIRED: 'Укажите будущую дату: «Отложи напоминание оплатить интернет до завтра», «на 3 дня» или «на неделю». Я ничего не изменила.',
    REMINDER_SNOOZE_TIME_UNSUPPORTED: 'Отложить уведомление до точного времени пока нельзя: существующий центр уведомлений хранит только дату. Укажите будущий день, например «до завтра». Я ничего не изменила.',
    REMINDER_SNOOZE_PAST: 'Отложить можно только до будущего дня. Укажите, например, «до завтра» или «на 3 дня». Я ничего не изменила.',
    UNSUPPORTED_BULK_REMINDER: 'Массово переносить, откладывать, скрывать или возвращать напоминания текстом нельзя. Назовите одно напоминание — я ничего не изменила.',
    UNSUPPORTED_AUTO: 'Эту команду об автомобиле я пока не понимаю. Заправку можно записать так: «Запиши заправку 45 л на 2500 рублей».',
    FUEL_LITERS_REQUIRED: 'Не поняла количество топлива. Напишите, например: «Запиши заправку 45 л».',
    FUEL_LITERS_INVALID: 'Количество топлива должно быть больше нуля.',
    MILEAGE_INVALID: 'Пробег должен быть целым числом не меньше нуля.',
    AUTO_SERVICE_TITLE_REQUIRED: 'Не поняла, какая работа выполнена. Напишите, например: «Запиши обслуживание замена масла».',
    AUTO_NUMBER_AMBIGUOUS: 'Не поняла число в команде об автомобиле. Укажите единицу: литры — «45 л», пробег — «104800 км», стоимость — «2500 рублей».',
    NOTE_CONTENT_REQUIRED: 'Не поняла, что записать в заметку. Напишите так: «Создай заметку купить фильтр для машины».',
    NOTE_BODY_QUERY_REQUIRED: 'Укажите название заметки перед двоеточием. Я ничего не изменила.',
    NOTE_BODY_CONTENT_REQUIRED: 'Укажите новый или добавляемый текст после двоеточия. Я ничего не изменила.',
    NOTE_BODY_FORMAT_REQUIRED: 'Разделите название заметки и текст двоеточием. Например: «Замени текст заметки План отпуска: Купить билеты» или «Дополни заметку План отпуска: Забронировать отель». Я ничего не изменила.',
    NOTE_BODY_SAME: 'В заметке уже сохранён такой текст. Ничего менять не нужно.',
    UNSUPPORTED_NOTE_UPDATE: 'Изменить текст заметки можно двумя точными командами с двоеточием: «Замени текст заметки План отпуска: Купить билеты» или «Дополни заметку План отпуска: Забронировать отель». Я ничего не изменила.',
    UNSUPPORTED_BULK_NOTE_UPDATE: 'Изменять сразу несколько заметок текстовой командой я не буду. Назовите одну заметку перед двоеточием — я найду её и попрошу подтверждение. Я ничего не изменила.',
    UNSUPPORTED_NOTE_ARCHIVE: 'Отправлять заметку в архив или возвращать её текстом я пока не умею. Это делается в разделе «Заметки».',
    REMINDER_CONTENT_REQUIRED: 'Не поняла, о чём напомнить. Напишите так: «Напомни купить масло на завтра».',
    PURCHASE_NAME_REQUIRED: 'Не поняла название покупки. Напишите, например: «Добавь покупку холодильник за 50000 рублей».',
    PURCHASE_QUERY_REQUIRED: 'Не поняла, о какой покупке спрашиваете. Напишите, например: «Когда закончится гарантия на телефон».',
    UNSUPPORTED_PURCHASE_UPDATE: 'Изменять уже созданную покупку, отмечать её купленной/проданной, менять статус или гарантию текстовой командой я пока не умею — это делается в разделе «Покупки», с записью в «Историю». Создать покупку и спросить про гарантию я уже умею: «Добавь покупку телефон за 45000 рублей», «Покажи покупки».',
    UNSUPPORTED_PURCHASE_REPAIR: 'Записывать ремонт и обслуживание покупки текстовой командой я пока не умею. Откройте покупку в разделе «Покупки» — там есть кнопка «Сервис». Это не ТО автомобиля: заправка и обслуживание авто записываются как «Запиши обслуживание замена масла».',
    UNSUPPORTED_PURCHASE_FILE: 'Прикладывать чеки, фото и файлы к покупкам я пока не умею и не имитирую это — для настоящих вложений нужен отдельный сервис хранения, который ещё не выбран.',
    WARRANTY_DATE_UNSUPPORTED: 'Не поняла дату окончания гарантии. Напишите, например: «Добавь покупку телефон гарантия до 12.05.2027».',
    AMOUNT_REQUIRED: 'Не поняла сумму расхода. Напишите её цифрами — например: «Запиши расход 850 ₽ на продукты», «Потратил 1 250,50 руб на продукты».',
    AMOUNT_UNSUPPORTED: 'Такую запись суммы я пока не понимаю: сокращения вроде «5к» или «1,2к» и пересчёт валют не поддерживаются. Напишите сумму полностью цифрами — например «5000», «500,50» или «1 250,50 ₽».',
    AMOUNT_INVALID: 'Сумма расхода должна быть больше нуля и записана цифрами — например «850» или «1 250,50 ₽».',
    CURRENCY_UNSUPPORTED: 'Я записываю расходы только в валюте вашего профиля и не пересчитываю курсы. Напишите сумму в рублях — например «850 ₽».',
    UNSUPPORTED_FINANCE_INCOME: 'Работать с доходами текстовой командой я пока не умею — умею только расходы. Доход можно добавить и посмотреть в разделе «Финансы».',
    UNSUPPORTED_FINANCE_UPDATE: 'Изменять уже записанную финансовую операцию текстовой командой я пока не умею. Откройте «Финансы» — там операцию можно отредактировать, и изменение попадёт в «Историю».',
    FINANCE_PERIOD_UNSUPPORTED: 'Показывать расходы за такой период я пока не умею. Могу за сегодня, за неделю или за месяц — например: «Покажи расходы за неделю». Остальные периоды есть в разделе «Финансы» с фильтрами.',
    AMOUNT_AMBIGUOUS: 'Не поняла, какая именно сумма расхода — в команде несколько чисел. Напишите одну сумму: «Запиши расход 850 ₽ на продукты».',
    REMINDER_DATE_REQUIRED: 'Не поняла, на какую дату напомнить — у напоминания обязательно должна быть дата. Напишите так: «Напомни купить масло на завтра» или «Напомни завтра в 10 позвонить Сергею».',
    /* Удаление текстом (итерация 9). Формулировки обязаны говорить человеку, ЧТО
       именно нужно уточнить, и подчёркивать, что пока ничего не изменилось. */
    DELETE_TARGET_REQUIRED: 'Не поняла, что именно удалить. Скажите тип записи и название: «Удали задачу купить масло», «Удали событие стоматолог», «Удали заметку про отпуск», «Удали напоминание про интернет» или «Удали покупку телефон». Я ничего не удалила.',
    DELETE_QUERY_REQUIRED: 'Не поняла, какую именно запись удалить — нужно название. Напишите, например: «Удали задачу купить масло». Я ничего не удалила.',
    UNSUPPORTED_BULK_DELETE: 'Удалять всё сразу я не буду: массовое удаление невозможно проверить глазами и легко потерять нужное. Удаляю строго по одной записи и всегда спрашиваю подтверждение — например: «Удали задачу купить масло». Если нужно очистить раздел целиком, это делается в самом разделе. Я ничего не удалила.',
    UNSUPPORTED_FINANCE_DELETE: 'Удалять уже записанную операцию текстовой командой я пока не умею: у расходов и доходов нет короткого названия, по которому я могла бы надёжно понять, какую именно запись вы имеете в виду, а ошибиться с деньгами нельзя. Откройте «Финансы» — там операцию можно удалить, баланс пересчитается, а действие попадёт в «Историю». Я ничего не удалила.',
    UNSUPPORTED_AUTO_DELETE: 'Удалять заправки и записи обслуживания текстовой командой я пока не умею: они различаются датой и пробегом, а не названием, и перепутать их слишком легко. Откройте «Авто» — там запись можно удалить, и это попадёт в «Историю». Я ничего не удалила.',
    /* Переименование текстом (итерация 10). Формулировки обязаны говорить человеку,
       ЧТО именно нужно уточнить, и подчёркивать, что пока ничего не изменилось. */
    RENAME_TARGET_REQUIRED: 'Не поняла, что именно переименовать. Скажите тип записи: «Переименуй задачу … в …», «Переименуй событие … в …», «Переименуй заметку … в …», «Переименуй напоминание … в …» или «Переименуй покупку … в …». Я ничего не изменила.',
    RENAME_QUERY_REQUIRED: 'Не поняла, какую именно запись переименовать — нужно старое название. Напишите, например: «Переименуй задачу купить масло в купить оливковое масло». Я ничего не изменила.',
    RENAME_NEW_REQUIRED: 'Не поняла новое название. Напишите так: «Переименуй задачу купить масло в купить оливковое масло». Я ничего не изменила.',
    RENAME_SAME_TITLE: 'Новое название совпадает со старым. Если нужно изменить запись, напишите другое название — пока ничего не изменилось.',
    UNSUPPORTED_BULK_RENAME: 'Переименовывать всё сразу я не буду: массовое изменение невозможно проверить глазами. Переименовываю строго по одной записи и всегда спрашиваю подтверждение — например: «Переименуй задачу купить масло в купить оливковое масло». Я ничего не изменила.',
    UNSUPPORTED_FINANCE_RENAME: 'Переименовывать финансовые операции текстовой командой я пока не умею: у них нет названия, по которому их можно надёжно найти. Откройте «Финансы» — там операцию можно отредактировать, и это попадёт в «Историю». Я ничего не изменила.',
    UNSUPPORTED_AUTO_RENAME: 'Переименовывать записи автомобиля текстовой командой я пока не умею: они различаются датой и пробегом, а не названием. Откройте «Авто» — там запись можно отредактировать, и это попадёт в «Историю». Я ничего не изменила.'
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

  /* ---------- Удаление текстом (Stage 2, итерация 9) ----------
     Удаление — разрушительная операция, поэтому грамматика намеренно УЖЕ, чем у
     остальных команд, а не шире (COMMAND_ENGINE §6, ADR-005):
     1) глагол удаления обязан стоять В НАЧАЛЕ фразы — иначе «Создай заметку удали
        задачу» перестало бы быть заметкой;
     2) тип записи обязателен — без слова «задачу/событие/заметку/напоминание/
        покупку» движок НЕ угадывает домен, потому что цена ошибки — чужая
        удалённая запись;
     3) название обязательно — «Удали задачу» без названия ничего не выбирает;
     4) «все/всё/всех» и «очисти» никогда не выполняются, а честно отклоняются:
        массовое удаление из текста не поддерживается вовсе.
     Новых Common Actions здесь нет: выполняют существующие
     tasks.deleteTask / events.deleteEvent / notes.deleteNote /
     reminders.delete / shopping.deletePurchase — те же, что и кнопка в разделе. */
  const DELETE_VERB = '(?:удали(?:те)?|удалить|удаляй|сотри(?:те)?|стереть|стирай|убери(?:те)?|убрать)';
  const CLEAR_VERB = '(?:очисти(?:те)?|очистить)';
  const BULK_PREFIX_WORDS = '(?:все|всё|все[хм]|всю|весь|любые|кажд[а-яе]*)';
  const BULK_WORD = '(?:все|всё|все[хм]|всю|весь|любые|подряд|полностью|целиком)';
  const REMINDER_DELETE_WORD = '(?:напоминани[а-яе]*)';
  /* Единый реестр доменов с именованными записями для удаления и переименования.
     Список строится лениво: PURCHASE_WORD объявлен ниже по файлу, и вычисление
     массива на этапе загрузки модуля упало бы в temporal dead zone. */
  let NAMED_DOMAINS = null;
  function namedDomains() {
    if (!NAMED_DOMAINS) {
      NAMED_DOMAINS = [
        { domain: 'task', word: TASK_WORD, label: 'задачу', deleteAction: 'task.delete', renameAction: 'task.rename' },
        { domain: 'note', word: NOTE_WORD, label: 'заметку', deleteAction: 'note.delete', renameAction: 'note.rename' },
        { domain: 'reminder', word: REMINDER_DELETE_WORD, label: 'напоминание', deleteAction: 'reminder.delete', renameAction: 'reminder.rename' },
        { domain: 'shopping', word: PURCHASE_WORD, label: 'покупку', deleteAction: 'shopping.purchase.delete', renameAction: 'shopping.purchase.rename' },
        { domain: 'event', word: '(?:встреч[уаией]|событи[а-яе]*|созвон[а-яё]*|звонок|при[её]м|визит)', label: 'событие', deleteAction: 'event.delete', renameAction: 'event.rename' }
      ];
    }
    return NAMED_DOMAINS;
  }
  function deleteDomains() {
    return namedDomains().map((d) => ({ action: d.deleteAction, word: d.word, label: d.label }));
  }
  function parseDelete(n, raw) {
    const startsDelete = startRx(DELETE_VERB, 'i').test(n);
    const startsClear = startRx(CLEAR_VERB, 'i').test(n);
    if (!startsDelete && !startsClear) return null;
    /* «Очисти историю», «Очисти список» и любое «удали все …», «удали каждую …» —
       массовая операция. Она не выполняется никогда, независимо от домена. */
    if (startsClear || new RegExp('^' + DELETE_VERB + '\\s+' + BULK_PREFIX_WORDS + NOT_AFTER, 'i').test(n) || hasWord(n, BULK_WORD)) {
      return fail('UNSUPPORTED_BULK_DELETE', 'guard.delete.bulk');
    }
    /* Домены, у которых записи не адресуются названием: деньги различаются суммой
       и датой, авто-записи — пробегом. Угадывать «последний расход» нельзя. */
    if (/(расход[а-яе]*|доход[а-яе]*|операци[а-яе]*|трат[а-яе]*|платеж[а-яе]*|платёж)/.test(n)) {
      return fail('UNSUPPORTED_FINANCE_DELETE', 'guard.delete.finance');
    }
    if (/(заправк[а-яе]*|обслуживани[а-яе]*|то\b|топлив[а-яе]*|бензин[а-яе]*)/.test(n)) {
      return fail('UNSUPPORTED_AUTO_DELETE', 'guard.delete.auto');
    }
    const domains = deleteDomains();
    for (let i = 0; i < domains.length; i++) {
      const d = domains[i];
      const rx = new RegExp('^' + DELETE_VERB + '\\s+(?:мо[юийё]\\s+|эт[уоа]т?\\s+)?' + d.word + NOT_AFTER + '\\s*(.*)$', 'i');
      if (!rx.test(n)) continue;
      const m = rx.exec(raw) || rx.exec(n);
      /* «про/о/об» — обычный способ назвать заметку или напоминание;
         на выбор записи это не влияет, поэтому предлог просто отбрасывается. */
      const query = tidy(String(m[1] || '').replace(/^(?:про|о|об|на тему)\s+/i, ''));
      if (!query) return fail('DELETE_QUERY_REQUIRED', 'delete.query');
      return intent(d.action, 'mutation', { query }, 'delete', { requiresConfirmation: true });
    }
    /* Глагол удаления есть, а типа записи нет: «Удали купить масло» могло бы быть
       и задачей, и заметкой, и покупкой. Молча выбрать домен нельзя. */
    return fail('DELETE_TARGET_REQUIRED', 'delete.target');
  }

  /* Переименование записи текстом (Stage 2, итерация 10).
     Позволяет изменить название существующей записи фразой:
     «Переименуй задачу купить масло в купить оливковое масло»,
     «Переименуй событие встреча с Сергеем в обед с Сергеем»,
     «Переименуй заметку идея в идеи для проекта»,
     «Переименуй напоминание интернет в оплатить интернет»,
     «Переименуй покупку телефон в смартфон».
     Также поддерживается: «Измени/Смени/Поменяй название [типа] [old] на/в [new]».
     Инварианты:
     1) глагол переименования в начале фразы (или «измени название ...»);
     2) тип записи обязателен — без слова задачи/события/заметки/напоминания/покупки
        домен не угадывается;
     3) старое и новое название обязательны;
     4) массовое переименование («переименуй все ...», «переименуй каждую ...»)
        не выполняется никогда — честный отказ;
     5) подтверждение ВСЕГДА обязательно (даже при точном совпадении). */
  const RENAME_VERB = '(?:переименуй(?:те)?|переименовать|переименуем|назови(?:те)?|назвать)';
  const CHANGE_TITLE_VERB = '(?:(?:измени(?:те)?|изменить|поменяй(?:те)?|поменять|смени(?:те)?|сменить)\\s+названи[ея])';
  const RENAME_PREFIX_RX = '(?:' + RENAME_VERB + '|' + CHANGE_TITLE_VERB + ')';

  function parseRename(n, raw) {
    const startsRename = startRx(RENAME_PREFIX_RX, 'i').test(n);
    if (!startsRename) return null;
    /* Массовое переименование не поддерживается */
    if (new RegExp('^' + RENAME_PREFIX_RX + '\\s+' + BULK_PREFIX_WORDS + NOT_AFTER, 'i').test(n) || hasWord(n, BULK_WORD)) {
      return fail('UNSUPPORTED_BULK_RENAME', 'guard.rename.bulk');
    }
    /* Неподдерживаемые домены без надёжного названия */
    if (/(расход[а-яе]*|доход[а-яе]*|операци[а-яе]*|трат[а-яе]*|платеж[а-яе]*|платёж)/.test(n)) {
      return fail('UNSUPPORTED_FINANCE_RENAME', 'guard.rename.finance');
    }
    if (/(заправк[а-яе]*|обслуживани[а-яе]*|то\b|топлив[а-яе]*|бензин[а-яе]*)/.test(n)) {
      return fail('UNSUPPORTED_AUTO_RENAME', 'guard.rename.auto');
    }
    const domains = namedDomains();
    for (let i = 0; i < domains.length; i++) {
      const d = domains[i];
      const rx = new RegExp('^' + RENAME_PREFIX_RX + '\\s+(?:мо[юийё]\\s+|эт[уоа]т?\\s+)?' + d.word + NOT_AFTER + '\\s*(.*)$', 'i');
      if (!rx.test(n)) continue;
      const mRaw = rx.exec(raw);
      const mNorm = rx.exec(n);
      const restRaw = mRaw ? String(mRaw[1] || '') : '';
      const restNorm = mNorm ? String(mNorm[1] || '') : '';
      if (!tidy(restNorm)) return fail('RENAME_QUERY_REQUIRED', 'rename.query');

      /* Разделение старого и нового названия через предлог «в», «на» или «как».
         Пример: «купить масло в купить оливковое масло».
         Если начинается прямо с предлога — старое название пропущено. */
      if (/^(?:в|на|как)\s+/i.test(restNorm)) {
        return fail('RENAME_QUERY_REQUIRED', 'rename.query');
      }

      const sepMatch = /\s+(?:в|на|как)\s+/i.exec(restNorm);
      if (!sepMatch) {
        return fail('RENAME_NEW_REQUIRED', 'rename.new');
      }

      /* Извлекаем части из raw (для сохранения регистра нового названия) */
      const sepIndex = sepMatch.index;
      const sepLen = sepMatch[0].length;
      const oldRaw = restRaw.slice(0, sepIndex);
      const newRaw = restRaw.slice(sepIndex + sepLen);

      const oldQuery = tidy(oldRaw.replace(/^(?:про|о|об|на тему)\s+/i, ''));
      const newTitle = capitalize(tidy(newRaw));

      if (!oldQuery) return fail('RENAME_QUERY_REQUIRED', 'rename.query');
      if (!newTitle) return fail('RENAME_NEW_REQUIRED', 'rename.new');

      return intent(d.renameAction, 'mutation', { query: oldQuery, newTitle }, 'rename', { requiresConfirmation: true });
    }
    return fail('RENAME_TARGET_REQUIRED', 'rename.target');
  }

  /* ---------- Текст существующей заметки (Stage 2, итерация 11) ----------
     Двоеточие — обязательная граница между названием заметки и содержимым. Без
     него движок не угадывает, где заканчивается цель и начинается новый текст.
     Replace и append остаются разными intent: первый полностью меняет body,
     второй сохраняет его байт-в-байт и добавляет одну новую строку. Оба всегда
     требуют подтверждения, потому что меняют уже существующую запись. */
  const NOTE_BODY_REPLACE_RX = /^(?:замени(?:те)?|заменить|измени(?:те)?|изменить|перепиши(?:те)?|переписать|отредактируй(?:те)?|отредактировать)\s+(?:текст|содержимое)\s+(?:в\s+)?заметк[а-яе]*\s*/i;
  const NOTE_BODY_APPEND_RX = /^(?:(?:дополни(?:те)?|дополнить|допиши(?:те)?|дописать)\s+(?:текст\s+)?(?:в\s+)?|(?:добавь(?:те)?|добавить)\s+(?:текст\s+)?в\s+)заметк[а-яе]*\s*/i;

  function parseNoteBodyEdit(n, raw, context, original) {
    /* Bulk guard стоит до обычного шаблона. Он проверяет только квантификатор
       ПЕРЕД словом «заметки», поэтому название «Про каждого клиента» не
       превращается в ложное массовое действие. */
    const bulk = /^(?:(?:замени(?:те)?|заменить|измени(?:те)?|изменить|перепиши(?:те)?|переписать|отредактируй(?:те)?|отредактировать)\s+(?:текст|содержимое)\s+(?:в\s+)?|(?:дополни(?:те)?|дополнить|допиши(?:те)?|дописать)\s+(?:текст\s+)?(?:в\s+)?|(?:добавь(?:те)?|добавить)\s+(?:текст\s+)?в\s+)(?:все|всё|всех|кажд(?:ую|ые|ой))\s+заметк[а-яе]*/i;
    if (bulk.test(n)) return fail('UNSUPPORTED_BULK_NOTE_UPDATE', 'note.body.bulk');

    let mode = '';
    let rx = null;
    if (NOTE_BODY_REPLACE_RX.test(n)) { mode = 'replace'; rx = NOTE_BODY_REPLACE_RX; }
    else if (NOTE_BODY_APPEND_RX.test(n)) { mode = 'append'; rx = NOTE_BODY_APPEND_RX; }

    if (!rx) {
      /* Узнаём намерение, но не принимаем менее точную форму: иначе короткое
         «измени заметку А на Б» нельзя надёжно отличить от rename/body update. */
      const looksLikeEdit = /^(?:замени(?:те)?|заменить|измени(?:те)?|изменить|перепиши(?:те)?|переписать|отредактируй(?:те)?|отредактировать|дополни(?:те)?|дополнить|допиши(?:те)?|дописать)(?:\s|$)/i.test(n) && /заметк[а-яе]*/i.test(n);
      if (looksLikeEdit) return fail('UNSUPPORTED_NOTE_UPDATE', 'note.body.format');
      return null;
    }

    const rawTrimmed = String(original == null ? raw : original).trim();
    const rawMatch = rx.exec(rawTrimmed);
    const normalizedMatch = rx.exec(n);
    const restRaw = rawMatch ? rawTrimmed.slice(rawMatch[0].length) : n.slice((normalizedMatch && normalizedMatch[0].length) || 0);
    const separator = restRaw.indexOf(':');
    if (separator < 0) return fail('NOTE_BODY_FORMAT_REQUIRED', 'note.body.' + mode);

    const query = tidy(cleanText(restRaw.slice(0, separator)).replace(/^(?:про|о|об|на тему)\s+/i, ''));
    /* В отличие от названия, body сохраняет конечную пунктуацию, кавычки и
       внутренние переводы строк — это пользовательский текст, а не служебная
       часть команды. CRLF нормализуется в LF; внешние пробелы остаются только
       границей самой команды. */
    const content = String(restRaw.slice(separator + 1))
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00a0\u202f\t]+/g, ' ')
      .trim();
    if (!query) return fail('NOTE_BODY_QUERY_REQUIRED', 'note.body.' + mode);
    if (!content) return fail('NOTE_BODY_CONTENT_REQUIRED', 'note.body.' + mode);

    return intent('note.body.' + mode, 'mutation', { query, content }, 'note.body.' + mode, {
      requiresConfirmation: true
    });
  }

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

  /* Управление существующим напоминанием (Stage 2, итерация 12).
     Напоминание — сохранённая сущность; hide/snooze/restore меняют только реакцию
     производного уведомления `manual:<id>`. Массовая форма проверяется строго в
     позиции перед словом «напоминание»: «про каждого клиента» остаётся названием. */
  const REMINDER_MOVE_VERB = '(?:перенеси|перенести|передвинь|передвинуть|сдвинь|сдвинуть)';
  const REMINDER_SNOOZE_VERB = '(?:отложи(?:те)?|отложить)';
  const REMINDER_HIDE_VERB = '(?:скрой(?:те)?|скрыть|спрячь(?:те)?|спрятать)';
  const REMINDER_RESTORE_VERB = '(?:верни(?:те)?|вернуть|восстанови(?:те)?|восстановить)';
  function reminderManageQuery(value) {
    return tidy(String(value || '').replace(/^(?:мо[её]|это|про|о|об|на тему)\s+/i, ''));
  }
  function parseReminderManage(n, raw, context) {
    const verbs = '(?:' + REMINDER_MOVE_VERB + '|' + REMINDER_SNOOZE_VERB + '|' + REMINDER_HIDE_VERB + '|' + REMINDER_RESTORE_VERB + ')';
    if (!startRx(verbs, 'i').test(n)) return null;
    const bulk = new RegExp('^' + verbs + '\\s+' + BULK_PREFIX_WORDS + NOT_AFTER + '\\s+' + REMINDER_WORD + NOT_AFTER, 'i');
    if (bulk.test(n)) return fail('UNSUPPORTED_BULK_REMINDER', 'guard.reminder.bulk');

    let rx = new RegExp('^' + REMINDER_MOVE_VERB + '\\s+(?:мо[её]\\s+|это\\s+)?' + REMINDER_WORD + NOT_AFTER + '\\s+(.+)\\s+на\\s+(.+)$', 'i');
    if (rx.test(n)) {
      const m = rx.exec(raw) || rx.exec(n);
      const query = reminderManageQuery(m[1]);
      if (!query) return fail('REMINDER_MANAGE_QUERY_REQUIRED', 'reminder.reschedule');
      const when = extractWhen(m[2] || '', context);
      if (when.error) return fail(when.error, 'reminder.reschedule');
      if (!when.dateISO && !when.time) return fail('REMINDER_WHEN_REQUIRED', 'reminder.reschedule');
      if (tidy(when.rest || '')) return fail('REMINDER_WHEN_REQUIRED', 'reminder.reschedule');
      return intent('reminder.reschedule', 'mutation', { query, dateISO: when.dateISO || '', time: when.time || '' }, 'reminder.reschedule');
    }
    if (startRx(REMINDER_MOVE_VERB, 'i').test(n) && new RegExp(NOT_BEFORE + REMINDER_WORD + NOT_AFTER).test(n)) {
      return fail('REMINDER_WHEN_REQUIRED', 'reminder.reschedule');
    }

    rx = new RegExp('^' + REMINDER_SNOOZE_VERB + '\\s+(?:мо[её]\\s+|это\\s+)?' + REMINDER_WORD + NOT_AFTER + '\\s+(.+)\\s+(?:до|на)\\s+(.+)$', 'i');
    if (rx.test(n)) {
      const m = rx.exec(raw) || rx.exec(n);
      const query = reminderManageQuery(m[1]);
      if (!query) return fail('REMINDER_MANAGE_QUERY_REQUIRED', 'reminder.snooze');
      const tail = tidy(m[2]);
      const tm = findTime(tail);
      if (tm.found) return fail(tm.error || 'REMINDER_SNOOZE_TIME_UNSUPPORTED', 'reminder.snooze');
      let untilISO = '';
      const duration = /^(\d+)\s+(?:дн(?:я|ей)?|сут(?:ки|ок)?)$/i.exec(tail);
      if (duration) untilISO = Core().dates.addDays(context.todayISO, Number(duration[1]));
      else if (/^(?:неделю|7\s+дн(?:ей|я)?)$/i.test(tail)) untilISO = Core().dates.addDays(context.todayISO, 7);
      else {
        const d = findDate(tail, context);
        if (d.found && d.error) return fail(d.error, 'reminder.snooze');
        if (d.found && !tidy(cut(tail, d.source))) untilISO = d.dateISO;
      }
      if (!untilISO) return fail('REMINDER_SNOOZE_UNTIL_REQUIRED', 'reminder.snooze');
      if (Core().dates.diffDays(untilISO, context.todayISO) <= 0) return fail('REMINDER_SNOOZE_PAST', 'reminder.snooze');
      return intent('reminder.snooze', 'mutation', { query, untilISO }, 'reminder.snooze');
    }
    if (startRx(REMINDER_SNOOZE_VERB, 'i').test(n) && new RegExp(NOT_BEFORE + REMINDER_WORD + NOT_AFTER).test(n)) {
      return fail('REMINDER_SNOOZE_UNTIL_REQUIRED', 'reminder.snooze');
    }

    const simple = [
      { verb: REMINDER_HIDE_VERB, action: 'reminder.hide', rule: 'reminder.hide' },
      { verb: REMINDER_RESTORE_VERB, action: 'reminder.restore', rule: 'reminder.restore' }
    ];
    for (let i = 0; i < simple.length; i++) {
      const d = simple[i];
      rx = new RegExp('^' + d.verb + '\\s+(?:скрытое\\s+|мо[её]\\s+|это\\s+)?' + REMINDER_WORD + NOT_AFTER + '\\s*(.*)$', 'i');
      if (!rx.test(n)) continue;
      const m = rx.exec(raw) || rx.exec(n);
      const query = reminderManageQuery(m[1]);
      if (!query) return fail('REMINDER_MANAGE_QUERY_REQUIRED', d.rule);
      return intent(d.action, 'mutation', { query }, d.rule);
    }
    return null;
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

  /* ---------- Авто текстом (Stage 2, итерация 6) ----------
     Стоимость — поле записи Auto, а НЕ команда создать расход. Связь с
     «Финансами» включается только явной фразой пользователя и тогда всегда
     проходит через общее подтверждение CommandSession. */
  const FINANCE_LINK_RX = /(?:,?\s*(?:и\s+)?(?:добавь|добавить|запиши|записать|учти|учесть)\s+(?:это\s+)?(?:в\s+)?(?:расход(?:ы|ах)?|финанс(?:ы|ах)))/i;
  function decimalField(text, unitBody) {
    const rx = new RegExp(NOT_BEFORE + '(\\d+(?:[.,]\\d{1,2})?)\\s*(?:' + unitBody + ')' + NOT_AFTER, 'i');
    const m = rx.exec(normalize(text));
    if (!m) return { found: false };
    const value = Number(m[1].replace(',', '.'));
    return { found: true, value, source: m[0] };
  }
  function integerField(text, lead, unitBody) {
    const rx = new RegExp(NOT_BEFORE + '(?:' + lead + ')\\s*(\\d[\\d ]*)\\s*(?:' + unitBody + ')?' + NOT_AFTER, 'i');
    const m = rx.exec(normalize(text));
    if (!m) return { found: false };
    const value = Number(m[1].replace(/ /g, ''));
    return { found: true, value, source: m[0] };
  }
  function autoFinanceParts(rest) {
    const linked = FINANCE_LINK_RX.test(rest);
    rest = tidy(rest.replace(FINANCE_LINK_RX, ' '));
    let accountQuery = '';
    const acc = new RegExp(NOT_BEFORE + '(?:со|с)\\s+(?:счет[а-яе]*|карт[а-яе]*)\\s+(.+)$', 'i').exec(rest);
    if (acc) { accountQuery = tidy(acc[1]); rest = tidy(rest.replace(acc[0], ' ')); }
    return { linked, accountQuery, rest };
  }
  function parseFuelCreate(n, raw, context) {
    const rx = /^(?:(?:запиши|добавь|создай)\s+(?:новую\s+)?заправк[ауи]?|заправил(?:ся|ась)?|заправка)\s*(.*)$/i;
    if (!rx.test(n)) return null;
    const rawRest = (rx.exec(n) || [])[1] || '';
    if (/-\s*\d+(?:[.,]\d+)?\s*(?:л|литр[а-яе]*)/.test(rawRest)) return fail('FUEL_LITERS_INVALID', 'auto.fuel.create');
    if (/пробег(?:ом)?\s*-/.test(rawRest)) return fail('MILEAGE_INVALID', 'auto.fuel.create');
    let parts = autoFinanceParts(rawRest);
    let rest = parts.rest;
    const liters = decimalField(rest, 'л|литр[а-яе]*');
    if (!liters.found) return fail('FUEL_LITERS_REQUIRED', 'auto.fuel.create');
    if (!(liters.value > 0) || !isFinite(liters.value)) return fail('FUEL_LITERS_INVALID', 'auto.fuel.create');
    rest = tidy(cut(rest, liters.source));
    const mileage = integerField(rest, 'пробег(?:ом)?', 'км|километр[а-яе]*');
    if (mileage.found) rest = tidy(cut(rest, mileage.source));
    if (mileage.found && (!(mileage.value >= 0) || !isFinite(mileage.value))) return fail('MILEAGE_INVALID', 'auto.fuel.create');
    const when = extractWhen(rest, context);
    if (when.error) return fail(when.error, 'auto.fuel.create');
    rest = tidy(when.rest || '');
    const amount = findAmount(rest);
    if (amount.error) return fail(amount.error, 'auto.fuel.create');
    if (amount.found) rest = tidy(cut(rest, amount.source).replace(/^на\s+/, ' ').replace(new RegExp('^' + CURRENCY_TAIL + NOT_AFTER, 'i'), ' '));
    if (parts.linked && !amount.found) return fail('AMOUNT_REQUIRED', 'auto.fuel.create');
    if (/\d/.test(rest)) return fail('AUTO_NUMBER_AMBIGUOUS', 'auto.fuel.create');
    const out = intent('auto.fuel.create', 'mutation', {
      liters: liters.value, amountMinor: amount.found ? amount.minor : 0,
      mileage: mileage.found ? mileage.value : null, dateISO: when.dateISO || '',
      note: '', linkFinance: parts.linked, accountQuery: parts.accountQuery
    }, 'auto.fuel.create');
    if (parts.linked) out.requiresConfirmation = true;
    return out;
  }
  function parseServiceCreate(n, raw, context) {
    const rx = /^(?:(?:запиши|добавь|создай)\s+(?:новое\s+)?(?:обслуживани[ея]|сервис)|(?:обслуживани[ея]|сервис))\s*(.*)$/i;
    if (!rx.test(n)) return null;
    const rawRest = (rx.exec(n) || [])[1] || '';
    if (/пробег(?:ом)?\s*-/.test(rawRest)) return fail('MILEAGE_INVALID', 'auto.service.create');
    let parts = autoFinanceParts(rawRest);
    let rest = parts.rest;
    const mileage = integerField(rest, 'пробег(?:ом)?', 'км|километр[а-яе]*');
    if (mileage.found) rest = tidy(cut(rest, mileage.source));
    if (mileage.found && (!(mileage.value >= 0) || !isFinite(mileage.value))) return fail('MILEAGE_INVALID', 'auto.service.create');
    const when = extractWhen(rest, context);
    if (when.error) return fail(when.error, 'auto.service.create');
    rest = tidy(when.rest || '');
    /* Стоимость у service вводится конструкцией «на/стоимость 3500 рублей»,
       чтобы число внутри названия работы не принималось за деньги. */
    const moneyRx = new RegExp(NOT_BEFORE + '(?:на|стоимост[ьюи]?)\\s+(\\d{1,3}(?: \\d{3})+|\\d+)(?:[.,](\\d{1,2}))?\\s*' + CURRENCY_TAIL + NOT_AFTER, 'i');
    const mm = moneyRx.exec(rest);
    let amountMinor = 0;
    if (mm) {
      const parsed = findAmount(mm[0]);
      if (parsed.error || !parsed.found) return fail((parsed.error || 'AMOUNT_INVALID'), 'auto.service.create');
      amountMinor = parsed.minor; rest = tidy(rest.replace(mm[0], ' '));
    } else if (new RegExp(NOT_BEFORE + CURRENCY_TAIL + NOT_AFTER, 'i').test(rest) || /-\s*\d/.test(rest)) {
      const parsed = findAmount(rest);
      return fail((parsed.error || 'AMOUNT_UNSUPPORTED'), 'auto.service.create');
    }
    if (parts.linked && !(amountMinor > 0)) return fail('AMOUNT_REQUIRED', 'auto.service.create');
    const title = capitalize(tidy(rest.replace(/^[,;:\-—–]+/, '')));
    if (!title) return fail('AUTO_SERVICE_TITLE_REQUIRED', 'auto.service.create');
    const out = intent('auto.service.create', 'mutation', {
      title, amountMinor, mileage: mileage.found ? mileage.value : null,
      dateISO: when.dateISO || '', comment: '', linkFinance: parts.linked,
      accountQuery: parts.accountQuery
    }, 'auto.service.create');
    if (parts.linked) out.requiresConfirmation = true;
    return out;
  }

  /* ---------- Покупки текстом (Stage 2, итерация 7) ----------
     Цена — поле записи «Покупки», а НЕ команда создать расход (Product Decision —
     Auto/Shopping cost and Finance-link policy, docs/DECISIONS.md): Finance link
     включается только явной фразой («и добавь в расходы», «и учти в финансах»)
     через тот же FINANCE_LINK_RX, что у Auto, и тогда всегда требует подтверждения.
     Второй схемы покупки здесь нет: все поля уходят в единственный существующий
     Common Action `AvenActions.shopping.createPurchase`, запросы — в
     `getPurchases`/`warrantyState` того же слоя. */
  const PURCHASE_WORD = '(?:покупк(?:а|у|ой|е|и|ок|ам|ами)?)';
  const WARRANTY_WORD_RX = /(гаранти[а-яе]*)/;

  /* «Добавь покупку холодильник за 50000 рублей», «Запиши покупку телефон 45000
     рублей в магазине Техно», «Добавь покупку ноутбук за 80000 гарантия до
     12.05.2027 и учти в финансах со счёта карта».
     Порядок извлечения: финансовая связь → гарантия → дата → магазин → цена →
     название. Магазин и цена только в явных конструкциях («в магазине …», сумма
     тем же findAmount, что расходы): выдумывать поля по контексту нельзя. */
  function parsePurchaseCreate(n, raw, context) {
    const rx = new RegExp('^' + CREATE_VERB + '\\s+(?:нов(?:ую|ое|ый)\\s+)?' + PURCHASE_WORD + NOT_AFTER + '\\s*(.*)$', 'i');
    if (!rx.test(n)) return null;
    const rawRest = (rx.exec(n) || [])[1] || '';
    let parts = autoFinanceParts(rawRest);
    let rest = parts.rest;
    /* Гарантия — только явной конструкцией «(с) гарантия до <дата>». Дата
       окончания разбирается тем же общим парсером; «два года» и слова — честный
       отказ, а не догадка. */
    let warrantyISO = '';
    const warrRx = new RegExp(NOT_BEFORE + '(?:с\\s+)?гаранти[а-яе]*\\s+(?:действует\\s+)?до\\s+(.+)$', 'i');
    const wm = warrRx.exec(rest);
    if (wm) {
      const wd = findDate(wm[1], context);
      if (wd.found && wd.error) return fail(wd.error, 'shopping.purchase.create');
      if (!wd.found) return fail('WARRANTY_DATE_UNSUPPORTED', 'shopping.purchase.create');
      warrantyISO = wd.dateISO;
      rest = tidy(rest.replace(wm[0], ' '));
    }
    const when = extractWhen(rest, context);
    if (when.error) return fail(when.error, 'shopping.purchase.create');
    rest = tidy(when.rest || '');
    /* Магазин отделяется от названия только явным «в/из магазине …»; без этой
       конструкции текст остаётся частью названия, а не угадывается местом. */
    let store = '';
    const storeRx = new RegExp(NOT_BEFORE + '(?:в|из)\\s+магазин[а-яе]*\\s+(.+?)(?=\\s+за\\s+\\d|$)', 'i');
    const sm = storeRx.exec(rest);
    if (sm) { store = capitalize(tidy(sm[1])); rest = tidy(rest.replace(sm[0], ' ')); }
    /* Цена — тем же проверенным findAmount, второго денежного парсера нет.
       Цена необязательна (модель покупки это допускает), но для явной связи
       с «Финансами» она обязательна — иначе связь была бы на нулевую сумму. */
    const amount = findAmount(rest);
    if (amount.error) return fail(amount.error, 'shopping.purchase.create');
    let name = rest;
    if (amount.found) {
      name = tidy(cut(rest, amount.source));
      for (let i = 0; i < 2; i++) {
        name = tidy(name.replace(new RegExp('\\s+' + CURRENCY_TAIL + NOT_AFTER + '\\s*$', 'i'), ''))
          .replace(/(?:^|\s)(?:за|на|по)\s*$/i, '').trim();
      }
    }
    if (parts.linked && !amount.found) return fail('AMOUNT_REQUIRED', 'shopping.purchase.create');
    name = capitalize(tidy(name.replace(/^[,;:\-—–]+/, '')));
    if (!name) return fail('PURCHASE_NAME_REQUIRED', 'shopping.purchase.create');
    const out = intent('shopping.purchase.create', 'mutation', {
      name, priceMinor: amount.found ? amount.minor : 0,
      dateISO: when.dateISO || '', store, warrantyISO,
      linkFinance: parts.linked, accountQuery: parts.accountQuery
    }, 'shopping.purchase.create');
    /* Явная связь с «Финансами» ВСЕГДА требует подтверждения — до Confirm не
       создаётся ни покупка, ни расход. Shopping-only команда остаётся обычной
       EXACT safe mutation по общей policy: цена сама по себе ничего не меняет. */
    if (parts.linked) out.requiresConfirmation = true;
    return out;
  }

  /* «Покажи покупки», «Найди покупку телефон» — read-only через существующий
     Common Query `getPurchases`. Пустой запрос — показ вещей в собственности
     (тот же default, что у раздела «Покупки»), запрос — поиск по всем статусам. */
  function parsePurchaseSearch(n, raw) {
    const rx = new RegExp('^(?:' + SHOW_VERB + '\\s+(?:мои\\s+)?|как[а-яе]*\\s+(?:у\\s+меня\\s+(?:есть\\s+)?)?)(?:все\\s+)?' +
      PURCHASE_WORD + NOT_AFTER + '\\s*(?:про|о|об|на тему)?\\s*(.*)$', 'i');
    if (!rx.test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const q = tidy(String(m[1] || '').replace(/^(?:про|о|об|на тему)\s+/i, ''));
    return intent('shopping.purchase.search', 'query', { q }, 'shopping.purchase.search');
  }

  /* Гарантийные вопросы — только показ: «Какие гарантии заканчиваются?»,
     «Покажи покупки с гарантией», «Какие покупки с истекшей гарантией?»,
     «Когда закончится гарантия на телефон?». Разборы «установи гарантию» сюда
     не доходят: они отклонены guard-ом ниже. */
  function parsePurchaseWarranty(n, raw, context) {
    if (!WARRANTY_WORD_RX.test(n)) return null;
    const itemRx = new RegExp(NOT_BEFORE + '(?:когда|до\\s+когда)\\s+(?:истекает|истечет|заканчивается|закончится|кончается|действует)?\\s*' +
      'гаранти[а-яе]*\\s+на\\s+(.+?)(?:\\s+(?:закончится|заканчивается|истекает|истечет))?$', 'i');
    const im = itemRx.exec(n);
    if (im) {
      const q = tidy(String(im[1] || ''));
      if (!q) return fail('PURCHASE_QUERY_REQUIRED', 'shopping.purchase.warranty');
      return intent('shopping.purchase.warranty', 'query', { mode: 'item', q }, 'shopping.purchase.warranty');
    }
    /* Формы «истекла» и «истекшей/истёкшей» (после нормализации ё→е — одна и та же
       строка) относятся к одному и тому же вопросу про уже закончившуюся гарантию.
       Это точечное перечисление словоформ, а не морфологический анализатор:
       «истекающая» по-прежнему означает «скоро закончится» и разбирается ниже. */
    if (/(истек(?:л|ш)[а-яе]*|просроченн[а-яе]*)\s+гаранти[а-яе]*|гаранти[а-яе]*\s+(?:истек(?:л|ш)[а-яе]*|просроченн[а-яе]*)/.test(n)) {
      return intent('shopping.purchase.warranty', 'query', { mode: 'expired' }, 'shopping.purchase.warranty');
    }
    if (/(скоро|заканчива(?:ется|ются)|законч(?:ится|атся)|истекающ[а-яе]*|истекает)/.test(n)) {
      return intent('shopping.purchase.warranty', 'query', { mode: 'soon' }, 'shopping.purchase.warranty');
    }
    if (new RegExp('^(?:' + SHOW_VERB + '\\s+(?:мои\\s+)?|как[а-яе]*\\s+(?:у\\s+меня\\s+(?:есть\\s+)?)?)(?:все\\s+)?гаранти[а-яе]*\\s*$', 'i').test(n)) {
      return intent('shopping.purchase.warranty', 'query', { mode: 'present' }, 'shopping.purchase.warranty');
    }
    if (new RegExp(NOT_BEFORE + '(?:с|на)\\s+(?:действующ[а-яе]*\\s+)?гаранти[еяюий]|действующ[а-яе]*\\s+гаранти[а-яе]*|гаранти[а-яе]*\\s+действует').test(n)) {
      return intent('shopping.purchase.warranty', 'query', { mode: 'present' }, 'shopping.purchase.warranty');
    }
    return null;
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

  /* ---------- Перенос уже существующего события (Stage 2, итерация 8) ----------
     «Перенеси встречу с Сергеем на завтра в 12:00», «Перенеси событие стоматолог
     на 15:30», «Измени встречу с врачом на пятницу в 15:30».

     Домен определяется ровно тем же явным словом, что и у `event.create`
     (EVENT_WORD/EVENT_LABEL): «встречу», «событие», «созвон», «звонок», «приём»,
     «визит» — и это слово должно стоять в начале названия. Никакого fuzzy-подбора
     домена по содержимому нет: «Перенеси задачу …» остаётся задачей, «перенеси
     заметку/напоминание/покупку …» — своими честными отказами. Название события
     собирается тем же правилом «метка + остаток», которым `event.create` строит
     заголовок, поэтому «перенеси встречу с Сергеем» ищет событие «Встреча
     с Сергеем» без морфологического анализатора.

     Разбор остаётся чистым: событие здесь не ищется и не меняется. */
  function parseEventPlaceUpdate(n, raw, context) {
    const rx = /^(?:измени|изменить|поменяй|поменять|перенеси|перенести)\s+(?:место|локацию)\s+(?:события|встречи|созвона|визита)?\s*(.*?)\s+на\s+(.+)$/i;
    if (!rx.test(n) || !EVENT_WORD.test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    let query = tidy(m[1] || '');
    query = query.replace(/^(?:события|встречи|созвона|визита)\s+/i, '').trim();
    const place = tidy(m[2] || '');
    if (!query) return fail('EVENT_QUERY_REQUIRED', 'event.place.update');
    if (!place) return fail('EVENT_PLACE_REQUIRED', 'event.place.update');
    if (place.length > 160) return fail('EVENT_PLACE_INVALID', 'event.place.update');
    return intent('event.place.update', 'mutation', { query, place }, 'event.place.update', { requiresConfirmation: true });
  }

  function parseEventReschedule(n, raw, context) {
    const rx = new RegExp('^(?:' + MOVE_VERB + '|измени|изменить|поменяй|поменять)\\s+(.+?)\\s+на\\s+(.+)$', 'i');
    if (!rx.test(n)) return null;
    if (!EVENT_WORD.test(n)) return null;
    /* Другие домены разбираются своими правилами — перехватывать их нельзя. */
    if (new RegExp(NOT_BEFORE + TASK_WORD + NOT_AFTER).test(n)) return null;
    if (new RegExp(NOT_BEFORE + '(?:' + NOTE_WORD + '|' + REMINDER_WORD + '|' + PURCHASE_WORD + '|' + EXPENSE_WORD + ')').test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const head = tidy(String(m[1] || '').replace(/^(?:мо[юяей][а-яё]*|эт[ауоей][а-яё]*)\s+/i, ''));
    const tail = tidy(m[2] || '');
    let label = null, restTitle = head;
    for (let i = 0; i < EVENT_LABEL.length; i++) {
      const e = EVENT_LABEL[i];
      if (e.rx.test(head)) { label = e.label; restTitle = tidy(head.replace(e.rx, ' ')); break; }
    }
    /* Слово события должно быть тем, что переносят, а не случайным словом внутри
       фразы: иначе «перенеси оплату на встречу» стало бы переносом события. */
    if (label === null) return null;
    const query = tidy(label ? label + ' ' + restTitle : restTitle);
    if (!query) return fail('EVENT_QUERY_REQUIRED', 'event.reschedule');
    const when = extractWhen(tail, context);
    if (when.error) return fail(when.error, 'event.reschedule');
    let time = when.time || '';
    let leftover = tidy(when.rest || '');
    if (!time && leftover) {
      /* «на 12» — это час, а не дата: числа как даты пишутся «12.05». Та же
         конвенция, что у «в 10» в существующем парсере времени. */
      const bare = /^(\d{1,2})(?:\s*(?:час[а-яе]*|ч))?$/.exec(normalize(leftover));
      if (bare) {
        const h = +bare[1];
        if (h > 23) return fail('TIME_INVALID', 'event.reschedule');
        time = pad(h) + ':00';
        leftover = '';
      }
    }
    /* Непонятый хвост («на следующую пятницу», «на утро») не отбрасывается молча:
       иначе команда выполнила бы не то, что попросили. */
    if (leftover && !/^(?:в|во|к|на|уже|пожалуйста)(?:\s+(?:в|во|к|на|уже|пожалуйста))*$/i.test(normalize(leftover))) {
      return fail('EVENT_WHEN_REQUIRED', 'event.reschedule');
    }
    if (!when.dateISO && !time) return fail('EVENT_WHEN_REQUIRED', 'event.reschedule');
    return intent('event.reschedule', 'mutation',
      { query, dateISO: when.dateISO || '', time }, 'event.reschedule');
  }

  function parseTaskComplete(n, raw) {
    const rx = new RegExp('^' + DONE_VERB + '\\s+(?:' + TASK_WORD + '\\s+)?(.+)$', 'i');
    if (!rx.test(n)) return null;
    const m = rx.exec(raw) || rx.exec(n);
    const query = tidy(String(m[1] || '').replace(DONE_TAIL, ' '));
    /* «Отметь покупку купленной» — это НЕ задача «покупку купленной»: статусы
       покупок текстом сознательно не поддержаны, отвечать «не нашла такую
       задачу» было бы нечестно (урок доменных коллизий PR #27). */
    if (new RegExp('^' + PURCHASE_WORD + NOT_AFTER).test(normalize(query))) {
      return fail('UNSUPPORTED_PURCHASE_UPDATE', 'guard.purchase.status');
    }
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
    /* Покупки: создание/поиск/гарантийные вопросы разобраны правилами выше.
       Здесь остаются честные отказы для того, что сознательно не поддержано:
       файлы/чеки/OCR (ждут StorageProvider), ремонты/сервис и любые изменения
       уже созданной покупки (update/status). Без мутации и без History. */
    if (/(распозна[йть]|сканиру[йть]|сфотографиру[йть])/.test(n) &&
        /(чек|квитанци[а-яе]*|фото|фотографи[а-яе]*|документ[а-яе]*)/.test(n)) {
      return fail('UNSUPPORTED_PURCHASE_FILE', 'guard.purchase.ocr');
    }
    if (/покупк|гаранти/.test(n)) {
      if (/(чек|чеки|квитанци[а-яе]*|фото|фотографи[а-яе]*|скан[а-яе]*|файл[а-яе]*|прилож[иь]|прикрепи|прикрепить|приклад)/.test(n)) {
        return fail('UNSUPPORTED_PURCHASE_FILE', 'guard.purchase.file');
      }
      if (/(ремонт[а-яе]*|обслуживани[а-яе]*|сервис[а-яе]*)/.test(n)) {
        return fail('UNSUPPORTED_PURCHASE_REPAIR', 'guard.purchase.repair');
      }
      if (hasWord(n, 'измени|изменить|обнови|обновить|отредактируй|отредактировать|перенос|перенеси|перенести|отметь|отметить|заверши|продай|продать|продал|продала|продли|продлить|установи|установить|поставь')) {
        return fail('UNSUPPORTED_PURCHASE_UPDATE', 'guard.purchase.update');
      }
    }
    /* Перенос события по дате/времени уже разобран правилом выше
       (parseEventReschedule). Если разбор дошёл сюда со словом события, значит это
       либо непонятая формулировка переноса, либо изменение других полей события —
       и то и другое честно объясняется, без мутации и без записи в «Историю». */
    if (EVENT_WORD.test(n)) {
      if (hasWord(n, 'описание|участник[а-яе]*|повтор[а-яе]*|напоминание')) {
        return fail('UNSUPPORTED_EVENT_FIELD', 'guard.event.field');
      }
      if (new RegExp('^(?:' + MOVE_VERB + '|измени|изменить|поменяй|поменять)').test(n)) {
        return fail('UNSUPPORTED_EVENT_UPDATE', 'guard.event.update');
      }
    }
    return null;
  }

  const RULES = [
    /* Удаление стоит первым сознательно: правило срабатывает только когда глагол
       удаления стоит в начале фразы, поэтому «Создай заметку удали задачу»
       остаётся заметкой, а разрушительная команда не может быть случайно
       перехвачена другим доменом и выполнена как что-то иное. */
    parseDelete,
    parseRename, parseNoteBodyEdit, parseReminderManage,
    parseTaskCreate, parseNoteCreate, parseNoteSearch, parseReminderCreate, parseReminderSearch,
    parseFuelCreate, parseServiceCreate, parseExpenseCreate, parseExpenseList,
    parsePurchaseCreate, parsePurchaseWarranty, parsePurchaseSearch, parseIncomeUnsupported,
    parseEventPlaceUpdate, parseEventReschedule, parseEventCreate, parseTaskComplete, parseTaskReschedule,
    parseCapabilities, parseFinanceQuery, parseAutoQuery, parseOverdueQuery,
    parseSuggestionsQuery, parseDayQuery, parseUnsupported
  ];

  /* parse(text, context) → намерение или понятная ошибка. Состояние НЕ меняется. */
  function parse(text, ctx) {
    const context = makeContext(ctx);
    const n = normalize(text);
    const raw = cleanText(text);
    const original = String(text == null ? '' : text);
    if (!n) return fail('EMPTY', 'empty');
    for (let i = 0; i < RULES.length; i++) {
      const res = RULES[i](n, raw, context, original);
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
  /* Событие как цель команды. Кандидат показывает пользователю только то, что
     помогает выбрать (название, дату, время); id нужен лишь для продолжения flow. */
  function eventCandidate(e) {
    const C = Core();
    return {
      id: e.id, kind: 'event', title: e.title || '',
      dateISO: e.date || '', time: C.events.start(e) || '', endTime: C.events.end(e) || '',
      allDay: !!e.allDay, repeat: e.repeat || 'none', place: e.place || ''
    };
  }
  /* Ровно те же дискретные правила, что у задач (resolveTask): полное название —
     EXACT, единственное вхождение целым словом/фразой с содержательным словом
     3+ символа — INFERRED, несколько — AMBIGUOUS, ничего — not_found.
     Отдельного EventResolutionEngine и fuzzy-подбора нет. */
  function resolveEvent(query, context) {
    const list = (Core().events.getEvents({}).items || []).filter((e) => e && !e.archived);
    const q = normalize(query);
    if (!q) return { ok: false, status: 'not_found', resolution: 'UNSUPPORTED', code: 'EVENT_NOT_FOUND', candidates: [] };
    const exact = list.filter((e) => normalize(e.title) === q);
    if (exact.length === 1) return { ok: true, status: 'resolved', resolution: 'EXACT', entity: eventCandidate(exact[0]) };
    if (exact.length > 1) return { ok: false, status: 'ambiguous', resolution: 'AMBIGUOUS', code: 'AMBIGUOUS_EVENT', candidates: exact.map(eventCandidate) };
    const meaningful = q.split(/\s+/).some((part) => part.length >= 3);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const partialRx = meaningful ? wordRx(escaped) : null;
    const partial = partialRx ? list.filter((e) => partialRx.test(normalize(e.title))) : [];
    if (partial.length === 1) return { ok: true, status: 'resolved', resolution: 'INFERRED', entity: eventCandidate(partial[0]) };
    if (partial.length > 1) return { ok: false, status: 'ambiguous', resolution: 'AMBIGUOUS', code: 'AMBIGUOUS_EVENT', candidates: partial.map(eventCandidate) };
    return { ok: false, status: 'not_found', resolution: 'UNSUPPORTED', code: 'EVENT_NOT_FOUND', candidates: [] };
  }
  /* Общий безымянный резолвер для доменов, у которых цель адресуется названием
     (заметка, напоминание, покупка). Правила РОВНО те же дискретные, что у
     resolveTask/resolveEvent: полное совпадение — EXACT, единственное вхождение
     целым словом с содержательным словом 3+ символа — INFERRED, несколько —
     AMBIGUOUS, ничего — not_found. Fuzzy/морфологии здесь нет намеренно: для
     удаления «похоже» не должно означать «достаточно похоже, чтобы стереть». */
  function resolveNamed(list, query, makeCandidate, notFoundCode) {
    const q = normalize(query);
    const none = { ok: false, status: 'not_found', resolution: 'UNSUPPORTED', code: notFoundCode, candidates: [] };
    if (!q) return none;
    const titleOf = (x) => normalize(makeCandidate(x).title);
    const exact = list.filter((x) => titleOf(x) === q);
    if (exact.length === 1) return { ok: true, status: 'resolved', resolution: 'EXACT', entity: makeCandidate(exact[0]) };
    if (exact.length > 1) return { ok: false, status: 'ambiguous', resolution: 'AMBIGUOUS', code: 'AMBIGUOUS', candidates: exact.map(makeCandidate) };
    const meaningful = q.split(/\s+/).some((part) => part.length >= 3);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = meaningful ? wordRx(escaped) : null;
    const partial = rx ? list.filter((x) => rx.test(titleOf(x))) : [];
    if (partial.length === 1) return { ok: true, status: 'resolved', resolution: 'INFERRED', entity: makeCandidate(partial[0]) };
    if (partial.length > 1) return { ok: false, status: 'ambiguous', resolution: 'AMBIGUOUS', code: 'AMBIGUOUS', candidates: partial.map(makeCandidate) };
    return none;
  }
  /* Кандидаты показывают пользователю только то, что помогает отличить одну
     запись от другой; id нужен лишь для продолжения flow. */
  function noteCandidate(x) {
    const C = Core();
    return {
      id: x.id, kind: 'note', title: x.title || 'Без названия',
      folder: C.notes.folderOf(x), body: String(x.body || ''),
      archived: !!x.archived, dateISO: x.updatedISO || ''
    };
  }
  function reminderCandidate(x) {
    const key = 'manual:' + x.id;
    const reaction = Core().reminders.reaction(key) || {};
    const snoozeUntilISO = reaction.snoozeUntilISO || '';
    const snoozed = !!(snoozeUntilISO && Core().dates.diffDays(snoozeUntilISO, Core().dates.todayISO()) > 0);
    return {
      id: x.id, kind: 'reminder', key, title: x.title || '', dateISO: x.dateISO || '', time: x.time || '',
      note: String(x.note || ''), link: String(x.link || ''),
      dismissed: !!reaction.dismissed, snoozeUntilISO,
      state: reaction.dismissed ? 'hidden' : (snoozed ? 'snoozed' : 'active')
    };
  }
  function purchaseCandidate(x) {
    const C = Core();
    return { id: x.id, kind: 'purchase', title: x.name || '', dateISO: C.shopping.dateISO(x) || '', price: Number(x.price) || 0 };
  }
  /* Удаление задачи намеренно видит и ВЫПОЛНЕННЫЕ задачи, в отличие от
     «отметь выполненной»/«перенеси»: выполненная задача существует, и ответ
     «не нашла» на неё был бы неправдой (ADR-010). Архивные по-прежнему вне
     обычного списка — для них есть отдельный честный ответ ниже. */
  function resolveTaskForDelete(query, context) {
    return resolveNamed(Core().tasks.getTasks({ today: context.todayISO }).items || [],
      query, taskCandidate, 'TASK_NOT_FOUND');
  }
  /* Архив — не «нет записи». Если имя совпало с архивной записью, Aven обязана
     сказать правду: запись существует, но лежит в архиве. */
  function resolveArchived(list, query, makeCandidate) {
    const res = resolveNamed(list.filter((x) => x && x.archived), query, makeCandidate, 'ARCHIVED');
    return res.ok || res.status === 'ambiguous';
  }
  function resolveNote(query) {
    return resolveNamed(Core().notes.getNotes({ status: 'active' }).items || [], query, noteCandidate, 'NOTE_NOT_FOUND');
  }
  function resolveReminder(query) {
    return resolveNamed(Core().reminders.list({}).items || [], query, reminderCandidate, 'REMINDER_NOT_FOUND');
  }
  function resolvePurchase(query) {
    return resolveNamed(Core().shopping.getPurchases({}).items || [], query, purchaseCandidate, 'PURCHASE_NOT_FOUND');
  }

  function toMinutes(hm) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(hm || ''));
    return m ? (+m[1]) * 60 + (+m[2]) : -1;
  }
  function fromMinutes(total) { return pad(Math.floor(total / 60)) + ':' + pad(total % 60); }

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
    if (intentObj.action === 'event.reschedule') {
      return resolveEvent((intentObj.params || {}).query, context);
    }
    if (intentObj.action === 'note.body.replace' || intentObj.action === 'note.body.append') {
      return resolveNote((intentObj.params || {}).query);
    }
    if (['reminder.reschedule', 'reminder.snooze', 'reminder.hide', 'reminder.restore'].indexOf(intentObj.action) >= 0) {
      return resolveReminder((intentObj.params || {}).query);
    }
    /* Удаление отвечает на resolve() тем же контрактом, что и остальные команды:
       это позволяет проверить цель, ничего не удаляя. */
    if (DELETE_ACTIONS[intentObj.action]) {
      return deleteSpec()[intentObj.action].resolve((intentObj.params || {}).query, context);
    }
    if ((intentObj.action === 'auto.fuel.create' || intentObj.action === 'auto.service.create') &&
        (intentObj.params || {}).linkFinance) {
      const p = intentObj.params || {};
      const cat = resolveFinanceSlot('cat', 'Авто', context.slots.cat);
      if (!cat.ok) return { ok: false, status: cat.status === 'stale' ? 'not_found' : cat.status,
        resolution: cat.status === 'not_found' ? 'UNSUPPORTED' : 'AMBIGUOUS', slot: 'cat', candidates: cat.candidates || cat.items || [] };
      const acc = resolveFinanceSlot('account', p.accountQuery, context.slots.account);
      if (!acc.ok) return { ok: false, status: acc.status === 'stale' || acc.status === 'not_found' ? 'not_found' : 'ambiguous',
        resolution: acc.status === 'not_found' ? 'UNSUPPORTED' : 'AMBIGUOUS', slot: 'account', candidates: acc.candidates || acc.items || [] };
      return { ok: true, status: 'resolved', resolution: acc.resolution,
        entity: { cat: cat.item.title, account: acc.item.title } };
    }
    if (intentObj.action === 'shopping.purchase.create' && (intentObj.params || {}).linkFinance) {
      const p = intentObj.params || {};
      /* Категория связанного расхода определяется единственным правилом общего
         слоя (shopping.financeCategory), а не догадкой Command Engine; счёт —
         только существующий, по тем же дискретным правилам. */
      const mapped = Core().shopping.financeCategory((p.category || '') || 'Другое') || 'Другое';
      const cat = resolveFinanceSlot('cat', mapped, context.slots.cat);
      if (!cat.ok) return { ok: false, status: cat.status === 'stale' ? 'not_found' : cat.status,
        resolution: cat.status === 'not_found' ? 'UNSUPPORTED' : 'AMBIGUOUS', slot: 'cat', candidates: cat.candidates || cat.items || [] };
      const acc = resolveFinanceSlot('account', p.accountQuery, context.slots.account);
      if (!acc.ok) return { ok: false, status: acc.status === 'stale' || acc.status === 'not_found' ? 'not_found' : 'ambiguous',
        resolution: acc.status === 'not_found' ? 'UNSUPPORTED' : 'AMBIGUOUS', slot: 'account', candidates: acc.candidates || acc.items || [] };
      return { ok: true, status: 'resolved', resolution: acc.resolution,
        entity: { cat: cat.item.title, account: acc.item.title } };
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
    const action = (intentObj && intentObj.action) || 'finance.expense.create';
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
  /* Текст подтверждения linked Shopping + Finance: пользователь обязан увидеть
     ОБЕ будущие сущности — покупку со всеми её полями и расход с суммой,
     категорией и счётом — прежде чем что-то изменится. */
  function purchaseLinkedSummary(preview) {
    const C = Core();
    return 'Добавить покупку ' + quote(preview.name) +
      (preview.price ? ': ' + C.money.exact(preview.price) : '') +
      (preview.dateISO ? ', дата ' + whenPhrase(preview.dateISO, '') : '') +
      (preview.store ? ', магазин ' + quote(preview.store) : '') +
      (preview.warrantyISO ? ', гарантия до ' + C.dates.humanDate(preview.warrantyISO) : '') +
      '. И добавить расход ' + C.money.exact(preview.price) + ' в «Финансы»: категория ' +
      quote(preview.cat) + ', счёт ' + quote(preview.accountName) +
      '. Продолжить? Пока ничего не изменилось.';
  }
  function autoSummary(kind, preview) {
    const C = Core();
    const fields = kind === 'fuel'
      ? 'Записать заправку: ' + preview.liters + ' л' +
        (preview.amountMinor ? ', ' + C.money.exact(preview.amountMinor / 100) : '') +
        ', пробег ' + preview.mileage + ' км, дата ' + whenPhrase(preview.dateISO, '')
      : 'Записать обслуживание ' + quote(preview.title) +
        (preview.amountMinor ? ': ' + C.money.exact(preview.amountMinor / 100) : '') +
        ', пробег ' + preview.mileage + ' км, дата ' + whenPhrase(preview.dateISO, '');
    return fields + '. И добавить расход ' + C.money.exact(preview.amountMinor / 100) +
      ' в «Финансы»: категория ' + quote(preview.cat) + ', счёт ' + quote(preview.accountName) +
      '. Продолжить? Пока ничего не изменилось.';
  }
  /* Сводка переноса события: пользователь обязан увидеть, какое это событие и что
     именно изменится — старая дата/время → новая дата/время, целиком. Ни id,
     ни JSON, ни имён действий. Интервал показывается полностью (начало—окончание),
     потому что окончание сдвигается вместе с началом (Product Decision «Event update text commands», DECISIONS.md, 2026-09-29). */
  function eventWhenText(dateISO, time, endTime, allDay) {
    const C = Core();
    const day = whenPhrase(dateISO, '');
    if (allDay) return day + ', весь день';
    if (!time) return day + ', без времени';
    return day + ', ' + C.format.time(time) + (endTime ? '–' + C.format.time(endTime) : '');
  }
  function eventMoveSummary(target, next) {
    return 'Перенести ' + quote(target.title) + ': ' +
      eventWhenText(target.dateISO, target.time, target.endTime, target.allDay) + ' → ' +
      eventWhenText(next.dateISO, next.time, next.endTime, target.allDay) +
      '? Пока ничего не изменилось.';
  }
  function noteBodyPreview(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'пусто';
    /* Существенное изменение нельзя подтверждать по обрезанному фрагменту:
       показываем весь старый/новый текст, а перенос доверяем существующему UI. */
    return quote(text);
  }
  function noteBodySummary(mode, target, content) {
    const where = target.folder ? ' в папке ' + quote(target.folder) : '';
    const before = String(target.body || '');
    const after = mode === 'append'
      ? before + (before ? '\n' : '') + String(content || '')
      : String(content || '');
    return (mode === 'append' ? 'Дополнить заметку ' : 'Заменить текст заметки ') +
      quote(target.title) + where + ': сейчас ' + noteBodyPreview(before) +
      ' → после подтверждения ' + noteBodyPreview(after) +
      '? Пока ничего не изменилось.';
  }
  function reminderStateText(target) {
    if (target.dismissed) return 'скрыто';
    if (target.snoozeUntilISO && Core().dates.diffDays(target.snoozeUntilISO, Core().dates.todayISO()) > 0) {
      return 'отложено до ' + Core().dates.humanDate(target.snoozeUntilISO);
    }
    return 'в списке';
  }
  function reminderManageSummary(action, target, preview, resolution) {
    const inferred = resolution === 'INFERRED' ? ' (нашла по части названия)' : '';
    const current = whenPhrase(target.dateISO, target.time);
    if (action === 'reminder.reschedule') {
      return 'Перенести напоминание ' + quote(target.title) + inferred + ': ' + current + ' → ' +
        whenPhrase(preview.dateISO, preview.time) + '? Пока ничего не изменилось.';
    }
    const verb = action === 'reminder.snooze' ? 'Отложить' : action === 'reminder.hide' ? 'Скрыть' : 'Вернуть';
    const next = action === 'reminder.snooze' ? 'отложено до ' + Core().dates.humanDate(preview.untilISO)
      : action === 'reminder.hide' ? 'скрыто' : 'в списке';
    return verb + ' уведомление напоминания ' + quote(target.title) + inferred + ': ' +
      reminderStateText(target) + ' → ' + next + '? Пока ничего не изменилось.';
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
      case 'note.body.replace':
      case 'note.body.append': {
        const mode = intentObj.action === 'note.body.append' ? 'append' : 'replace';
        let target = null;
        let resolution = 'EXACT';

        if (context.targetId) {
          const got = C.notes.getNote(context.targetId);
          if (!got.ok) return result(false, 'stale', intentObj.action, {
            code: 'STALE_TARGET', resolution: 'UNSUPPORTED', intent: intentObj,
            message: 'Заметка изменилась или была удалена. Повторите команду — ничего не изменено.'
          });
          const fresh = got.entity;
          if (fresh.archived) return result(false, 'unsupported', intentObj.action, {
            code: 'ARCHIVED_TARGET', resolution: 'UNSUPPORTED', intent: intentObj,
            message: 'Заметка «' + (fresh.title || 'Без названия') + '» находится в архиве. Верните её из архива в разделе «Заметки» и повторите команду. Ничего не изменено.'
          });
          const expectedFolder = context.expected && String(context.expected.folder || '');
          const freshFolder = C.notes.folderOf(fresh);
          if ((context.expectedTitle && String(fresh.title || '') !== String(context.expectedTitle)) ||
              (context.expected && (String(fresh.title || '') !== String(context.expected.title || '') ||
                String(fresh.body || '') !== String(context.expected.body || '') ||
                freshFolder !== expectedFolder))) {
            return result(false, 'stale', intentObj.action, {
              code: 'STALE_TARGET', resolution: 'UNSUPPORTED', intent: intentObj,
              message: 'Заметка изменилась после выбора. Повторите команду, чтобы увидеть актуальный текст. Ничего не изменено.'
            });
          }
          target = noteCandidate(fresh);
          resolution = context.selected ? 'EXACT' : (intentObj.match && intentObj.match.resolution) || 'EXACT';
        } else {
          const found = resolveNote(p.query);
          if (!found.ok) {
            if (found.status === 'ambiguous') return result(false, 'ambiguous', intentObj.action, {
              code: 'AMBIGUOUS_NOTE', resolution: 'AMBIGUOUS', intent: intentObj, candidates: found.candidates
            });
            const archived = resolveArchived(C.notes.getNotes({ status: 'all' }).items || [], p.query, noteCandidate);
            if (archived) return result(false, 'unsupported', intentObj.action, {
              code: 'ARCHIVED_TARGET', resolution: 'UNSUPPORTED', intent: intentObj,
              message: 'Такая заметка находится в архиве. Верните её из архива в разделе «Заметки» и повторите команду. Ничего не изменено.'
            });
            return result(false, 'not_found', intentObj.action, {
              code: 'NOTE_NOT_FOUND', resolution: 'UNSUPPORTED', intent: intentObj,
              message: 'Не нашла активную заметку «' + p.query + '». Ничего не изменено.'
            });
          }
          target = found.entity;
          resolution = found.resolution;
        }

        const oldBody = String(target.body || '');
        const nextBody = mode === 'append'
          ? oldBody + (oldBody ? '\n' : '') + String(p.content || '')
          : String(p.content || '');
        /* Replace с тем же телом — честный no-op ещё ДО подтверждения. Это важно:
           `updateNote` по общему контракту пишет History даже для пустого patch,
           поэтому command engine сам не вызывает action, когда менять нечего. */
        if (mode === 'replace' && oldBody === nextBody) {
          return result(true, 'info', intentObj.action, {
            code: 'NOTE_BODY_SAME', intent: intentObj, entity: target,
            data: { mode, title: target.title, body: target.body, unchanged: true }
          });
        }
        if (!context.confirmed) return result(false, 'confirmation_required', intentObj.action, {
          code: 'CONFIRMATION_REQUIRED', resolution, intent: intentObj, target,
          preview: {
            mode, title: target.title, folder: target.folder,
            before: oldBody, after: nextBody, content: p.content
          },
          summary: noteBodySummary(mode, target, p.content)
        });

        const res = C.notes.updateNote(target.id, { body: nextBody }, Object.assign({
          title: mode === 'append' ? 'Заметка дополнена' : 'Текст заметки заменён'
        }, opts));
        if (!res.ok) return actionFailed(intentObj.action, res, intentObj);
        return result(true, 'done', intentObj.action, {
          intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: { mode, title: res.entity.title, folder: C.notes.folderOf(res.entity),
            oldBody, body: String(res.entity.body || ''), content: p.content }
        });
      }
      case 'reminder.reschedule':
      case 'reminder.snooze':
      case 'reminder.hide':
      case 'reminder.restore': {
        const actionName = intentObj.action;
        let found;
        const stale = () => result(false, 'stale', actionName, {
          code: 'STALE_TARGET', resolution: 'UNSUPPORTED', intent: intentObj,
          message: 'Напоминание или состояние его уведомления изменилось после выбора. Повторите команду — ничего не изменено.'
        });
        if (context.targetId) {
          const got = C.reminders.get(context.targetId);
          if (!got.ok || !got.entity) return stale();
          const cand = reminderCandidate(got.entity);
          const exp = context.expected;
          if (context.expectedTitle && normalize(cand.title) !== normalize(context.expectedTitle)) return stale();
          if (exp && (String(cand.title || '') !== String(exp.title || '') ||
              String(cand.dateISO || '') !== String(exp.dateISO || '') ||
              String(cand.time || '') !== String(exp.time || '') ||
              String(cand.note || '') !== String(exp.note || '') ||
              String(cand.link || '') !== String(exp.link || '') ||
              cand.dismissed !== !!exp.dismissed ||
              String(cand.snoozeUntilISO || '') !== String(exp.snoozeUntilISO || ''))) return stale();
          found = { ok: true, resolution: context.selected ? 'EXACT' : 'INFERRED', entity: cand };
        } else found = resolveReminder(p.query);
        if (!found.ok && found.status === 'ambiguous') return result(false, 'ambiguous', actionName, {
          code: 'AMBIGUOUS_REMINDER', resolution: 'AMBIGUOUS', intent: intentObj, candidates: found.candidates
        });
        if (!found.ok) return result(false, 'not_found', actionName, {
          code: 'REMINDER_NOT_FOUND', resolution: 'UNSUPPORTED', intent: intentObj, query: p.query
        });
        const target = found.entity;
        const preview = {};
        if (actionName === 'reminder.reschedule') {
          preview.dateISO = p.dateISO || target.dateISO;
          preview.time = p.time || target.time;
          if (preview.dateISO === target.dateISO && preview.time === target.time) return result(true, 'info', actionName, {
            code: 'REMINDER_SCHEDULE_SAME', intent: intentObj, entity: target,
            data: { title: target.title, dateISO: target.dateISO, time: target.time, unchanged: true }
          });
        } else if (actionName === 'reminder.snooze') {
          const days = C.dates.diffDays(p.untilISO, context.todayISO);
          if (!(days > 0)) return result(false, 'invalid', actionName, {
            code: 'REMINDER_SNOOZE_PAST', message: PARSE_MESSAGES.REMINDER_SNOOZE_PAST, intent: intentObj
          });
          if (target.dismissed) return result(false, 'unsupported', actionName, {
            code: 'REMINDER_HIDDEN', intent: intentObj,
            message: 'Это уведомление скрыто. Сначала верните его командой «Верни напоминание ' + target.title + '». Ничего не изменено.'
          });
          preview.untilISO = p.untilISO;
          preview.days = days;
          if (target.snoozeUntilISO === p.untilISO) return result(true, 'info', actionName, {
            code: 'REMINDER_SNOOZE_SAME', intent: intentObj, entity: target,
            data: { title: target.title, untilISO: p.untilISO, unchanged: true }
          });
        } else if (actionName === 'reminder.hide') {
          if (target.dismissed) return result(true, 'info', actionName, {
            code: 'REMINDER_ALREADY_HIDDEN', intent: intentObj, entity: target,
            data: { title: target.title, unchanged: true }
          });
        } else if (!target.dismissed) return result(true, 'info', actionName, {
          code: 'REMINDER_ALREADY_VISIBLE', intent: intentObj, entity: target,
          data: { title: target.title, unchanged: true }
        });

        /* По общей политике EXACT reversible mutation выполняется сразу;
           INFERRED всегда требует явного подтверждения. */
        if ((found.resolution === 'INFERRED' || context.selected) && !context.confirmed) return result(false, 'confirmation_required', actionName, {
          code: 'CONFIRMATION_REQUIRED', resolution: found.resolution, intent: intentObj, target, preview,
          summary: reminderManageSummary(actionName, target, preview, found.resolution)
        });

        let res;
        if (actionName === 'reminder.reschedule') res = C.reminders.update(target.id,
          { dateISO: preview.dateISO, time: preview.time }, opts);
        else if (actionName === 'reminder.snooze') res = C.reminders.snooze(target.key, preview.days);
        else if (actionName === 'reminder.hide') res = C.reminders.dismiss(target.key);
        else res = C.reminders.restore(target.key);
        if (!res.ok) return actionFailed(actionName, res, intentObj);
        const fresh = C.reminders.get(target.id);
        const freshReaction = C.reminders.reaction(target.key) || {};
        return result(true, 'done', actionName, {
          resolution: found.resolution, intent: intentObj,
          entity: fresh.ok ? fresh.entity : target,
          historyId: res.entry && res.entry.id,
          data: {
            title: target.title, fromDateISO: target.dateISO, fromTime: target.time,
            dateISO: preview.dateISO || target.dateISO, time: preview.time || target.time,
            untilISO: preview.untilISO || '', hidden: actionName === 'reminder.hide',
            snoozeUntilISO: String(freshReaction.snoozeUntilISO || '')
          }
        });
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
      case 'auto.fuel.create':
      case 'auto.service.create': {
        const kind = intentObj.action === 'auto.fuel.create' ? 'fuel' : 'service';
        const amountMinor = Math.round(Number(p.amountMinor) || 0);
        const dateISO = ISO_RE.test(String(p.dateISO || '')) ? p.dateISO : context.todayISO;
        const car = C.auto.car();
        const mileage = p.mileage == null ? Math.round(Number(car.mileage) || 0) : Math.round(Number(p.mileage));
        if (!(mileage >= 0) || !isFinite(mileage)) return result(false, 'invalid', intentObj.action,
          { code: 'MILEAGE_INVALID', message: 'Пробег должен быть целым числом не меньше нуля.', intent: intentObj });
        let cat = null, acc = null;
        if (p.linkFinance) {
          cat = resolveFinanceSlot('cat', 'Авто', context.slots.cat);
          if (!cat.ok) return financeSlotProblem('cat', cat, intentObj);
          acc = resolveFinanceSlot('account', p.accountQuery, context.slots.account);
          if (!acc.ok) return financeSlotProblem('account', acc, intentObj);
          const preview = { kind, title: p.title || '', liters: p.liters || 0, amountMinor, mileage, dateISO,
            cat: cat.item.title, accountId: acc.item.id, accountName: acc.item.title };
          if (!context.confirmed) return result(false, 'confirmation_required', intentObj.action, {
            code: 'CONFIRMATION_REQUIRED', resolution: acc.resolution, intent: intentObj,
            preview, summary: autoSummary(kind, preview)
          });
        }
        const params = kind === 'fuel'
          ? { liters: p.liters, sum: amountMinor / 100, km: mileage, dateISO, note: p.note || '' }
          : { title: p.title, cost: amountMinor / 100, km: mileage, dateISO, comment: p.comment || '' };
        params.linkFinance = !!p.linkFinance;
        if (p.linkFinance) params.finance = { cat: cat.item.title, account: acc.item.id };
        const res = C.auto.createRecord(kind, params, opts);
        if (!res.ok) return actionFailed(intentObj.action, res, intentObj);
        return result(true, 'done', intentObj.action, {
          intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: { kind, title: res.entity.title || '', liters: res.entity.liters || 0,
            amount: kind === 'fuel' ? res.entity.sum : res.entity.cost, mileage: res.entity.km,
            dateISO: C.auto.dateISO(res.entity), linked: !!res.entity.financeOpId }
        });
      }
      /* --------- Покупки: создание / поиск / гарантия (Stage 2, итерация 7) ---------
         Shopping-only EXACT выполняется сразу — цена сама по себе не является
         Finance mutation. Явный Finance link — всегда через сводку и Confirm:
         до него ноль Shopping/Finance/History. Выполнение — только общим
         `AvenActions.shopping.createPurchase`, который делает связанное
         действие атомарным и компенсирует расход при сбое. */
      case 'shopping.purchase.create': {
        const priceMinor = Math.round(Number(p.priceMinor) || 0);
        const price = priceMinor > 0 ? priceMinor / 100 : '';
        const dateISO = ISO_RE.test(String(p.dateISO || '')) ? p.dateISO : '';
        const warrantyISO = ISO_RE.test(String(p.warrantyISO || '')) ? p.warrantyISO : '';
        const store = tidy(p.store || '');
        const name = tidy(p.name || '');
        if (!name) return result(false, 'invalid', 'shopping.purchase.create', {
          code: 'PURCHASE_NAME_REQUIRED', message: PARSE_MESSAGES.PURCHASE_NAME_REQUIRED, intent: intentObj
        });
        let cat = null, acc = null;
        if (p.linkFinance) {
          if (!(price > 0)) return result(false, 'invalid', 'shopping.purchase.create', {
            code: 'AMOUNT_REQUIRED', message: 'Для связи с «Финансами» у покупки должна быть цена больше нуля — укажите её цифрами или уберите «и добавь в расходы».', intent: intentObj
          });
          const mapped = Core().shopping.financeCategory((p.category || '') || 'Другое') || 'Другое';
          cat = resolveFinanceSlot('cat', mapped, context.slots.cat);
          if (!cat.ok) return financeSlotProblem('cat', cat, intentObj);
          acc = resolveFinanceSlot('account', p.accountQuery, context.slots.account);
          if (!acc.ok) return financeSlotProblem('account', acc, intentObj);
          const preview = { name, price, priceMinor, dateISO, store, warrantyISO,
            cat: cat.item.title, accountId: acc.item.id, accountName: acc.item.title };
          if (!context.confirmed) return result(false, 'confirmation_required', 'shopping.purchase.create', {
            code: 'CONFIRMATION_REQUIRED', resolution: acc.resolution, intent: intentObj,
            preview, summary: purchaseLinkedSummary(preview)
          });
        }
        const params = { name, price, linkFinance: !!p.linkFinance };
        if (dateISO) params.dateISO = dateISO;
        if (warrantyISO) params.warrantyISO = warrantyISO;
        if (store) params.store = store;
        if (p.linkFinance) params.finance = { cat: cat.item.title, account: acc.item.id };
        const res = C.shopping.createPurchase(params, opts);
        if (!res.ok) return actionFailed('shopping.purchase.create', res, intentObj);
        return result(true, 'done', 'shopping.purchase.create', {
          intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: { name: res.entity.name, price: res.entity.price, dateISO: C.shopping.dateISO(res.entity),
            store: res.entity.store || '', warrantyISO: C.shopping.warrantyISO(res.entity),
            category: res.entity.category || 'Другое', linked: !!res.entity.financeOpId,
            opCat: p.linkFinance ? cat.item.title : '', accountName: p.linkFinance ? acc.item.title : '' }
        });
      }
      case 'shopping.purchase.search': {
        const q = tidy(p.q || '');
        const items = q ? (C.shopping.getPurchases({ q }).items || [])
          : (C.shopping.getPurchases({ status: 'owned' }).items || []);
        const others = q ? 0 : Math.max(0, (C.shopping.getPurchases({}).count || 0) - items.length);
        return result(true, 'info', 'shopping.purchase.search', { intent: intentObj, data: { q, items, list: !q, others } });
      }
      case 'shopping.purchase.warranty': {
        const mode = ['present', 'soon', 'expired', 'item'].indexOf(p.mode) >= 0 ? p.mode : 'present';
        if (mode === 'item') {
          const q = tidy(p.q || '');
          const found = C.shopping.getPurchases({ q });
          let items = found.items || [];
          /* Падеж вопроса («на микроволновку») не тот, что в названии («Микроволновка»).
             НЕ морфология: только единичная финальная гласная последнего слова
             снимается, и только когда прямой поиск пуст — read-only, без догадок. */
          if (!items.length) {
            const words = q.split(/\s+/).filter(Boolean);
            const last = words[words.length - 1] || '';
            const stemmed = last.toLowerCase().replace(/(ую|юю|ое|ой|ою|её|[аеиоуыюяё])$/, '');
            if (stemmed.length >= 3 && stemmed !== last.toLowerCase()) {
              words[words.length - 1] = stemmed;
              items = C.shopping.getPurchases({ q: words.join(' ') }).items || [];
            }
          }
          return result(true, 'info', 'shopping.purchase.warranty', { intent: intentObj,
            data: { mode, q, items: items.slice(0, 5), total: items.length } });
        }
        const owned = (filter) => C.shopping.getPurchases(Object.assign({ status: 'owned' }, filter)).items || [];
        const items = mode === 'expired' ? owned({ warranty: 'expired' })
          : mode === 'soon' ? owned({ warranty: 'warn' })
            : owned({ warranty: 'active' }).concat(owned({ warranty: 'warn' }));
        return result(true, 'info', 'shopping.purchase.warranty', { intent: intentObj, data: { mode, items } });
      }
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
      case 'event.place.update': {
        let found;
        if (context.targetId) {
          const fresh = C.events.getEvent(context.targetId);
          const cand = fresh.ok ? eventCandidate(fresh.entity) : null;
          const exp = context.expected;
          if (!cand || (exp && (cand.title !== exp.title || cand.dateISO !== exp.dateISO || cand.time !== exp.time || cand.place !== exp.place)))
            return result(false, 'stale', 'event.place.update', { code: 'STALE_TARGET', intent: intentObj, message: 'Событие уже изменилось. Ничего не изменилось — повторите команду.' });
          found = { ok: true, resolution: context.selected ? 'EXACT' : 'INFERRED', entity: cand };
        } else found = resolveEvent(p.query, context);
        if (!found.ok && found.status === 'ambiguous') return result(false, 'ambiguous', 'event.place.update', { code: 'AMBIGUOUS_EVENT', resolution: 'AMBIGUOUS', intent: intentObj, candidates: found.candidates });
        if (!found.ok) return result(false, 'not_found', 'event.place.update', { code: 'EVENT_NOT_FOUND', intent: intentObj });
        const target = found.entity;
        if (target.repeat && target.repeat !== 'none') return result(false, 'invalid', 'event.place.update', { code: 'UNSUPPORTED_EVENT_REPEAT', intent: intentObj, message: 'Повторяющееся событие пока можно изменить только в «Календаре».' });
        if (target.place === p.place) return result(true, 'info', 'event.place.update', { intent: intentObj, data: { noop: true, title: target.title, place: target.place } });
        if (!context.confirmed) return result(false, 'confirmation_required', 'event.place.update', { code: 'CONFIRMATION_REQUIRED', resolution: found.resolution, intent: intentObj, target, preview: { place: p.place }, summary: 'Изменить место события «' + target.title + '» с «' + (target.place || 'не указано') + '» на «' + p.place + '»? Пока ничего не изменено.' });
        const res = C.events.updateEvent(target.id, { place: p.place }, opts);
        if (!res.ok) return actionFailed('event.place.update', res, intentObj);
        return result(true, 'done', 'event.place.update', { resolution: found.resolution, intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id, data: { title: res.entity.title, place: res.entity.place || '' } });
      }
      /* Перенос существующего события. Политика владельца: подтверждение ВСЕГДА,
         даже при EXACT-совпадении и простой смене времени. До Confirm событие,
         «Календарь» и «История» не меняются ни на байт. */
      case 'event.reschedule': {
        let found;
        if (context.targetId) {
          /* Продолжение flow хранит только ссылку и ожидаемые поля; перед
             выполнением цель перечитывается общим запросом. */
          const fresh = C.events.getEvent(context.targetId);
          const staleFail = () => result(false, 'stale', 'event.reschedule', {
            code: 'STALE_TARGET', intent: intentObj,
            message: 'Это событие уже изменилось или его больше нет. Ничего не изменилось — повторите команду.'
          });
          if (!fresh.ok || fresh.entity.archived) return staleFail();
          const cand = eventCandidate(fresh.entity);
          const exp = context.expected;
          if (context.expectedTitle && normalize(cand.title) !== normalize(context.expectedTitle)) return staleFail();
          if (exp && (cand.dateISO !== exp.dateISO || cand.time !== exp.time ||
              cand.endTime !== exp.endTime || cand.allDay !== exp.allDay)) return staleFail();
          found = { ok: true, resolution: context.selected ? 'EXACT' : 'INFERRED', entity: cand };
        } else found = resolveEvent(p.query, context);
        if (!found.ok && found.status === 'ambiguous') {
          return result(false, 'ambiguous', 'event.reschedule', {
            code: 'AMBIGUOUS_EVENT', resolution: 'AMBIGUOUS', intent: intentObj, candidates: found.candidates
          });
        }
        if (!found.ok) {
          return result(false, 'not_found', 'event.reschedule', {
            code: 'EVENT_NOT_FOUND', resolution: 'UNSUPPORTED', intent: intentObj, query: p.query
          });
        }
        const target = found.entity;
        /* Повторяющиеся события: перенести «это повторение» и «всю серию» —
           разные действия, и модель события такого выбора не хранит. Честный
           отказ вместо тихого сдвига всей серии. */
        if (target.repeat && target.repeat !== 'none') {
          return result(false, 'invalid', 'event.reschedule', {
            code: 'UNSUPPORTED_EVENT_REPEAT', intent: intentObj, target,
            message: 'Событие ' + quote(target.title) + ' повторяющееся, а перенести одно повторение и перенести всю серию — разные действия. Текстом я этого пока не делаю: откройте событие в «Календаре».'
          });
        }
        if (target.allDay && p.time) {
          return result(false, 'invalid', 'event.reschedule', {
            code: 'UNSUPPORTED_EVENT_ALLDAY_TIME', intent: intentObj, target,
            message: 'У события ' + quote(target.title) + ' стоит «весь день», поэтому времени у него нет. Дату я перенести могу («Перенеси событие ' + target.title.toLowerCase() + ' на пятницу»), а превратить его в событие со временем — только в «Календаре».'
          });
        }
        const next = { dateISO: p.dateISO || target.dateISO, time: target.time, endTime: target.endTime };
        if (p.time) {
          next.time = p.time;
          /* Длительность события сохраняется: окончание сдвигается на ту же
             величину, что и начало (Product Decision «Event update text commands», DECISIONS.md, 2026-09-29).
             Обе границы показываются в подтверждении — скрытых правил нет. */
          const from = toMinutes(target.time), to = toMinutes(target.endTime);
          if (from >= 0 && to >= 0) {
            const duration = to - from;
            if (duration < 0) {
              return result(false, 'invalid', 'event.reschedule', {
                code: 'EVENT_RANGE_INVALID', intent: intentObj, target,
                message: 'У события ' + quote(target.title) + ' окончание записано раньше начала, поэтому перенести его со сдвигом я не могу. Поправьте время в «Календаре».'
              });
            }
            const endMinutes = toMinutes(p.time) + duration;
            if (endMinutes >= 24 * 60) {
              return result(false, 'invalid', 'event.reschedule', {
                code: 'EVENT_TIME_OVERFLOW', intent: intentObj, target,
                message: 'С таким переносом событие ' + quote(target.title) + ' закончилось бы уже после полуночи, а событий через полночь в календаре пока нет. Выберите время пораньше или измените событие в «Календаре».'
              });
            }
            next.endTime = fromMinutes(endMinutes);
          }
        }
        if (next.dateISO === target.dateISO && next.time === target.time && next.endTime === target.endTime) {
          /* Переносить некуда: настоящего изменения нет, поэтому нет ни мутации,
             ни записи в «Историю» — фиктивная запись «изменений нет» была бы мусором. */
          return result(true, 'info', 'event.reschedule', {
            intent: intentObj, target,
            data: { noop: true, title: target.title, dateISO: target.dateISO, time: target.time, endTime: target.endTime, allDay: target.allDay }
          });
        }
        if (!context.confirmed) {
          return result(false, 'confirmation_required', 'event.reschedule', {
            code: 'CONFIRMATION_REQUIRED', resolution: found.resolution, intent: intentObj,
            target, preview: next, summary: eventMoveSummary(target, next)
          });
        }
        const patch = { date: next.dateISO };
        if (!target.allDay) { patch.startTime = next.time; patch.endTime = next.endTime; }
        const res = C.events.updateEvent(target.id, patch, opts);
        if (!res.ok) return actionFailed('event.reschedule', res, intentObj);
        return result(true, 'done', 'event.reschedule', {
          resolution: found.resolution, intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: {
            title: res.entity.title, allDay: !!res.entity.allDay,
            fromDateISO: target.dateISO, fromTime: target.time, fromEndTime: target.endTime,
            dateISO: res.entity.date, time: C.events.start(res.entity) || '', endTime: C.events.end(res.entity) || ''
          }
        });
      }
      /* ---------- Удаление записи текстом (Stage 2, итерация 9) ----------
         Один общий путь на пять доменов. Инварианты, обязательные для КАЖДОГО:
         — подтверждение ВСЕГДА, даже при точном совпадении названия (COMMAND_ENGINE §6);
         — до подтверждения нет ни мутации, ни записи в «Историю»;
         — перед самим удалением цель перечитывается общим запросом и сверяется
           со слепком: изменившаяся или уже исчезнувшая запись безопасно отклоняется;
         — удаляет только существующий Common Action — тот же, что и кнопка
           в разделе, поэтому «История» и Undo работают без отдельного кода. */
      case 'task.delete':
      case 'event.delete':
      case 'note.delete':
      case 'reminder.delete':
      case 'shopping.purchase.delete': {
        const spec = deleteSpec()[intentObj.action];
        const act = intentObj.action;
        let found;
        if (context.targetId) {
          const staleFail = () => result(false, 'stale', act, {
            code: 'STALE_TARGET', intent: intentObj,
            message: 'Эта запись уже изменилась или её больше нет. Ничего не удалено — повторите команду.'
          });
          const fresh = spec.get(context.targetId);
          if (!fresh.ok || !fresh.entity || fresh.entity.archived) return staleFail();
          const cand = spec.candidate(fresh.entity);
          const exp = context.expected;
          if (context.expectedTitle && normalize(cand.title) !== normalize(context.expectedTitle)) return staleFail();
          if (exp && ((cand.dateISO || '') !== (exp.dateISO || '') || (cand.time || '') !== (exp.time || ''))) return staleFail();
          found = { ok: true, resolution: context.selected ? 'EXACT' : 'INFERRED', entity: cand };
        } else found = spec.resolve(p.query, context);
        if (!found.ok && found.status === 'ambiguous') {
          return result(false, 'ambiguous', act, {
            code: 'AMBIGUOUS_DELETE', resolution: 'AMBIGUOUS', intent: intentObj, candidates: found.candidates
          });
        }
        if (!found.ok) {
          /* Запись может существовать, но лежать в архиве. Сказать «не нашла»
             было бы неправдой (ADR-010) — честно объясняем, где она. */
          const inArchive = typeof spec.archived === 'function' && spec.archived(p.query);
          return result(false, 'not_found', act, {
            code: inArchive ? 'ARCHIVED_TARGET' : spec.notFound,
            resolution: 'UNSUPPORTED', intent: intentObj, query: p.query, archived: !!inArchive
          });
        }
        const target = found.entity;
        /* Подтверждение обязательно всегда: уровень распознавания влияет только на
           формулировку, но никогда не разрешает удалить сразу. */
        if (!context.confirmed) {
          return result(false, 'confirmation_required', act, {
            code: 'CONFIRMATION_REQUIRED', resolution: found.resolution, intent: intentObj,
            target, summary: deleteSummary(act, target, found.resolution)
          });
        }
        const res = spec.del(target.id, opts);
        if (!res.ok) return actionFailed(act, res, intentObj);
        return result(true, 'done', act, {
          resolution: found.resolution, intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: { title: target.title, dateISO: target.dateISO || '', time: target.time || '', kind: target.kind }
        });
      }
      /* ---------- Переименование записи текстом (Stage 2, итерация 10) ----------
         Один общий путь на пять доменов. Инварианты, обязательные для КАЖДОГО:
         — подтверждение ВСЕГДА, даже при точном совпадении названия (COMMAND_ENGINE §6);
         — до подтверждения нет ни мутации, ни записи в «Историю»;
         — перед самим переименованием цель перечитывается общим запросом и сверяется
           со слепком: изменившаяся или уже исчезнувшая запись безопасно отклоняется;
         — выполняет только существующий Common Action — тот же, что и кнопка
           в разделе, поэтому «История» и Undo работают без отдельного кода. */
      case 'task.rename':
      case 'event.rename':
      case 'note.rename':
      case 'reminder.rename':
      case 'shopping.purchase.rename': {
        const spec = renameSpec()[intentObj.action];
        const act = intentObj.action;
        let found;
        if (context.targetId) {
          const staleFail = () => result(false, 'stale', act, {
            code: 'STALE_TARGET', intent: intentObj,
            message: 'Эта запись уже изменилась или её больше нет. Ничего не переименовано — повторите команду.'
          });
          const fresh = spec.get(context.targetId);
          if (!fresh.ok || !fresh.entity || fresh.entity.archived) return staleFail();
          const cand = spec.candidate(fresh.entity);
          const exp = context.expected;
          if (context.expectedTitle && normalize(cand.title) !== normalize(context.expectedTitle)) return staleFail();
          if (exp && ((cand.dateISO || '') !== (exp.dateISO || '') || (cand.time || '') !== (exp.time || ''))) return staleFail();
          found = { ok: true, resolution: context.selected ? 'EXACT' : 'INFERRED', entity: cand };
        } else found = spec.resolve(p.query, context);
        if (!found.ok && found.status === 'ambiguous') {
          return result(false, 'ambiguous', act, {
            code: 'AMBIGUOUS_RENAME', resolution: 'AMBIGUOUS', intent: intentObj, candidates: found.candidates
          });
        }
        if (!found.ok) {
          /* Запись может существовать, но лежать в архиве. Сказать «не нашла»
             было бы неправдой (ADR-010) — честно объясняем, где она. */
          const inArchive = typeof spec.archived === 'function' && spec.archived(p.query);
          return result(false, 'not_found', act, {
            code: inArchive ? 'ARCHIVED_TARGET' : spec.notFound,
            resolution: 'UNSUPPORTED', intent: intentObj, query: p.query, archived: !!inArchive
          });
        }
        const target = found.entity;
        if (normalize(target.title) === normalize(p.newTitle)) {
          return result(false, 'invalid', act, {
            code: 'RENAME_SAME_TITLE', message: PARSE_MESSAGES.RENAME_SAME_TITLE, intent: intentObj
          });
        }
        if (!context.confirmed) {
          return result(false, 'confirmation_required', act, {
            code: 'CONFIRMATION_REQUIRED', resolution: found.resolution, intent: intentObj,
            target, summary: renameSummary(act, target, p.newTitle, found.resolution)
          });
        }
        const res = spec.rename(target.id, p.newTitle, opts);
        if (!res.ok) return actionFailed(act, res, intentObj);
        return result(true, 'done', act, {
          resolution: found.resolution, intent: intentObj, entity: res.entity, historyId: res.entry && res.entry.id,
          data: { oldTitle: target.title, title: p.newTitle, dateISO: target.dateISO || '', time: target.time || '', kind: target.kind, where: spec.where }
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

  /* ---------- Таблица доменов удаления (Stage 2, итерация 9) ----------
     Здесь нет ни одной собственной операции над данными: только ссылки на уже
     существующие Common Actions и Common Queries. Строится лениво — Core()
     на этапе загрузки модуля ещё недоступен. */
  let DELETE_SPEC = null;
  function deleteSpec() {
    if (!DELETE_SPEC) {
      const C = () => Core();
      DELETE_SPEC = {
        'task.delete': {
          noun: 'Задача', where: '«Задачах»', section: '«Задачи»', notFound: 'TASK_NOT_FOUND',
          get: (id) => C().tasks.getTask(id), candidate: taskCandidate,
          resolve: (q, ctx) => resolveTaskForDelete(q, ctx), del: (id, o) => C().tasks.deleteTask(id, o),
          archived: (q) => resolveArchived(C().tasks.getTasks({ includeArchived: true }).items || [], q, taskCandidate)
        },
        'event.delete': {
          noun: 'Событие', where: '«Календаре»', section: '«Календарь»', notFound: 'EVENT_NOT_FOUND',
          get: (id) => C().events.getEvent(id), candidate: eventCandidate,
          resolve: (q, ctx) => resolveEvent(q, ctx), del: (id, o) => C().events.deleteEvent(id, o),
          archived: (q) => resolveArchived(C().events.getEvents({}).items || [], q, eventCandidate)
        },
        'note.delete': {
          noun: 'Заметка', where: '«Заметках»', section: '«Заметки»', notFound: 'NOTE_NOT_FOUND',
          get: (id) => C().notes.getNote(id), candidate: noteCandidate,
          resolve: (q) => resolveNote(q), del: (id, o) => C().notes.deleteNote(id, o),
          archived: (q) => resolveArchived(C().notes.getNotes({ status: 'all' }).items || [], q, noteCandidate)
        },
        'reminder.delete': {
          noun: 'Напоминание', where: '«Уведомлениях»', section: '«Уведомления»', notFound: 'REMINDER_NOT_FOUND',
          get: (id) => C().reminders.get(id), candidate: reminderCandidate,
          resolve: (q) => resolveReminder(q), del: (id, o) => C().reminders.delete(id, o)
        },
        'shopping.purchase.delete': {
          noun: 'Покупка', where: '«Покупках»', section: '«Покупки»', notFound: 'PURCHASE_NOT_FOUND',
          get: (id) => C().shopping.getPurchase(id), candidate: purchaseCandidate,
          resolve: (q) => resolvePurchase(q), del: (id, o) => C().shopping.deletePurchase(id, o)
        }
      };
    }
    return DELETE_SPEC;
  }
  /* Что именно исчезнет — человек обязан увидеть ДО подтверждения: тип записи,
     её название и отличающие детали (дата, время, папка, цена). */
  function deleteDetails(target) {
    const C = Core();
    const bits = [];
    if (target.kind === 'event') {
      if (target.dateISO) bits.push(C.dates.dateLabel(target.dateISO));
      if (target.allDay) bits.push('весь день');
      else if (target.time) bits.push(C.format.time(target.time) + (target.endTime ? '–' + C.format.time(target.endTime) : ''));
    } else if (target.kind === 'note') {
      if (target.folder) bits.push('папка ' + quote(target.folder));
    } else if (target.kind === 'purchase') {
      if (target.price > 0) bits.push(C.money.exact(target.price));
      if (target.dateISO) bits.push('куплено ' + C.dates.dateLabel(target.dateISO));
    } else {
      if (target.dateISO) bits.push(C.dates.dateLabel(target.dateISO));
      if (target.time) bits.push(C.format.time(target.time));
      /* Выполненная задача тоже удаляется, поэтому её состояние обязано быть
         видно в подтверждении — иначе легко стереть не ту. */
      if (target.status) bits.push(target.status === 'completed' ? 'выполнена' : 'открыта');
    }
    return bits.join(' · ');
  }
  function deleteSummary(action, target, resolution) {
    const spec = deleteSpec()[action];
    const details = deleteDetails(target);
    return 'Удалить: ' + spec.noun.toLowerCase() + ' ' + quote(target.title) +
      (details ? ' · ' + details : '') +
      (resolution === 'INFERRED' ? ' (нашла по части названия)' : '') +
      '. Запись исчезнет из раздела, но останется в «Истории» — оттуда её можно вернуть. ' +
      'Подтвердите — пока ничего не удалено.';
  }
  const DELETE_ACTIONS = {
    'task.delete': true, 'event.delete': true, 'note.delete': true,
    'reminder.delete': true, 'shopping.purchase.delete': true
  };
  const RENAME_ACTIONS = {
    'task.rename': true, 'event.rename': true, 'note.rename': true,
    'reminder.rename': true, 'shopping.purchase.rename': true
  };
  const NOTE_BODY_ACTIONS = {
    'note.body.replace': true, 'note.body.append': true
  };
  const REMINDER_MANAGE_ACTIONS = {
    'reminder.reschedule': true, 'reminder.snooze': true,
    'reminder.hide': true, 'reminder.restore': true
  };
  /* Род существительного задаётся явно: «Событие удалено», но «Задача удалена».
     Вычислять род из строки нельзя — получилось бы «удолена». Подлежащее второго
     предложения — всегда «Запись» (женский род), поэтому там форма постоянна. */
  const DELETE_GONE = {
    'task.delete': 'удалена', 'event.delete': 'удалено', 'note.delete': 'удалена',
    'reminder.delete': 'удалено', 'shopping.purchase.delete': 'удалена'
  };
  function deleteDoneText(res) {
    const spec = deleteSpec()[res.action];
    const d = res.data || {};
    return spec.noun + ' ' + quote(d.title) + ' ' + (DELETE_GONE[res.action] || 'удалена') +
      '. Запись исчезла из раздела ' + spec.section +
      ', но осталась в «Истории» — там же её можно вернуть кнопкой «Undo».';
  }

  /* ---------- Таблица доменов переименования (Stage 2, итерация 10) ----------
     Здесь нет ни одной собственной операции над данными: только ссылки на уже
     существующие Common Actions и Common Queries. Строится лениво — Core()
     на этапе загрузки модуля ещё недоступен. */
  let RENAME_SPEC = null;
  function renameSpec() {
    if (!RENAME_SPEC) {
      const C = () => Core();
      RENAME_SPEC = {
        'task.rename': {
          noun: 'Задача', where: '«Задачах»', section: '«Задачи»', notFound: 'TASK_NOT_FOUND',
          get: (id) => C().tasks.getTask(id), candidate: taskCandidate,
          resolve: (q, ctx) => resolveTaskForDelete(q, ctx),
          rename: (id, newTitle, o) => C().tasks.updateTask(id, { title: newTitle }, o),
          archived: (q) => resolveArchived(C().tasks.getTasks({ includeArchived: true }).items || [], q, taskCandidate)
        },
        'event.rename': {
          noun: 'Событие', where: '«Календаре»', section: '«Календарь»', notFound: 'EVENT_NOT_FOUND',
          get: (id) => C().events.getEvent(id), candidate: eventCandidate,
          resolve: (q, ctx) => resolveEvent(q, ctx),
          rename: (id, newTitle, o) => C().events.updateEvent(id, { title: newTitle }, o),
          archived: (q) => resolveArchived(C().events.getEvents({}).items || [], q, eventCandidate)
        },
        'note.rename': {
          noun: 'Заметка', where: '«Заметках»', section: '«Заметки»', notFound: 'NOTE_NOT_FOUND',
          get: (id) => C().notes.getNote(id), candidate: noteCandidate,
          resolve: (q) => resolveNote(q),
          rename: (id, newTitle, o) => C().notes.updateNote(id, { title: newTitle }, o),
          archived: (q) => resolveArchived(C().notes.getNotes({ status: 'all' }).items || [], q, noteCandidate)
        },
        'reminder.rename': {
          noun: 'Напоминание', where: '«Уведомлениях»', section: '«Уведомления»', notFound: 'REMINDER_NOT_FOUND',
          get: (id) => C().reminders.get(id), candidate: reminderCandidate,
          resolve: (q) => resolveReminder(q),
          rename: (id, newTitle, o) => C().reminders.update(id, { title: newTitle }, o)
        },
        'shopping.purchase.rename': {
          noun: 'Покупка', where: '«Покупках»', section: '«Покупки»', notFound: 'PURCHASE_NOT_FOUND',
          get: (id) => C().shopping.getPurchase(id), candidate: purchaseCandidate,
          resolve: (q) => resolvePurchase(q),
          rename: (id, newTitle, o) => C().shopping.updatePurchase(id, { name: newTitle }, o)
        }
      };
    }
    return RENAME_SPEC;
  }

  function renameSummary(action, target, newTitle, resolution) {
    const spec = renameSpec()[action];
    const details = deleteDetails(target);
    return 'Переименовать: ' + spec.noun.toLowerCase() + ' ' + quote(target.title) +
      (details ? ' · ' + details : '') +
      ' → ' + quote(newTitle) +
      (resolution === 'INFERRED' ? ' (нашла по части названия)' : '') +
      '. Подтвердите — пока ничего не изменилось.';
  }

  const RENAME_DONE_GENDER = {
    'task.rename': 'переименована',
    'event.rename': 'переименовано',
    'note.rename': 'переименована',
    'reminder.rename': 'переименовано',
    'shopping.purchase.rename': 'переименована'
  };

  function renameDoneText(res) {
    const spec = renameSpec()[res.action];
    const d = res.data || {};
    const gender = RENAME_DONE_GENDER[res.action] || 'переименована';
    return spec.noun + ' ' + quote(d.oldTitle) + ' ' + gender + ' в ' + quote(d.title) +
      (spec.where ? ' в ' + spec.where : '') +
      '. Отменить можно в «Истории».';
  }
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

  /* Ответ на создание покупки: честно говорим, что добавлено и куда — и что
     расход НЕ создавался, если пользователь не просил (политика владельца:
     цена покупки ≠ Finance mutation). */
  function purchaseCreateText(data) {
    const C = Core();
    return 'Покупка ' + quote(data.name) + ' добавлена' +
      (data.price > 0 ? ': ' + C.money.exact(data.price) : '') +
      (data.dateISO ? ', дата ' + whenPhrase(data.dateISO, '') : '') +
      (data.store ? ', магазин ' + quote(data.store) : '') +
      (data.warrantyISO ? ', гарантия до ' + C.dates.humanDate(data.warrantyISO) : '') +
      (data.linked
        ? '. Связанный расход создан в «Финансах»: категория ' + quote(data.opCat) + ', счёт ' + quote(data.accountName)
        : '. Расход в «Финансах» не создавался — цена остаётся данными покупки') +
      '. Покупка видна в разделе «Покупки»; отменить можно в «Истории».';
  }
  function purchaseSearchText(data) {
    const C = Core();
    const items = data.items || [];
    const priceText = (p) => (Number(p.price) > 0 ? ' — ' + C.money.exact(p.price) : '');
    const dateText = (p) => {
      const iso = C.shopping.dateISO(p);
      return iso ? ' (' + C.dates.dateLabel(iso) + ')' : '';
    };
    if (!items.length) {
      if (data.q) {
        return 'Не нашла покупок про ' + quote(data.q) + '. Проверьте название в разделе «Покупки» — я ничего не меняла.';
      }
      return data.others > 0
        ? 'В собственности покупок нет, но заархивировано или продано — ' + data.others + '. Их видно в разделе «Покупки» с фильтром статуса.'
        : 'Покупок пока нет. Добавьте покупку в разделе «Покупки» или командой «Добавь покупку …».';
    }
    if (items.length === 1) {
      const p0 = items[0];
      const w = C.shopping.warrantyState(C.shopping.warrantyISO(p0));
      return 'Нашла покупку ' + quote(p0.name) + priceText(p0) + dateText(p0) +
        (p0.store ? ', магазин ' + quote(p0.store) : '') +
        '. Статус: ' + C.shopping.statusLabel(p0) + ', ' + w.label +
        '. Подробности — в разделе «Покупки».';
    }
    const shown = items.slice(0, 5).map((p) => quote(p.name) + priceText(p) + dateText(p));
    const rest = items.length - shown.length;
    const head = data.q
      ? 'Нашла ' + plural(items.length, 'покупка', 'покупки', 'покупок') + ': '
      : 'У вас в собственности ' + plural(items.length, 'покупка', 'покупки', 'покупок') + ': ';
    return head + shown.join('; ') + (rest > 0 ? ' и ещё ' + rest : '') +
      (data.others ? '; кроме них продано или в архиве — ' + data.others : '') +
      '. Откройте «Покупки», чтобы посмотреть подробности.';
  }
  /* Гарантийный ответ: только пересказ общего warrantyState того же слоя, что
     «Главная», «Уведомления» и «Предложения» — второго расчёта гарантий нет. */
  function purchaseWarrantyText(data) {
    const C = Core();
    const items = data.items || [];
    if (data.mode === 'item') {
      if (!items.length) {
        return 'Не нашла покупок про ' + quote(data.q) + '. Проверьте название в разделе «Покупки» — я ничего не меняла.';
      }
      if (items.length === 1 || data.total === 1) {
        const p0 = items[0];
        const st = C.shopping.warrantyState(C.shopping.warrantyISO(p0));
        if (st.kind === 'none') return 'У покупки ' + quote(p0.name) + ' гарантия не указана. Указать её можно в карточке вещи в «Покупках».';
        if (st.kind === 'expired') return 'Гарантия на ' + quote(p0.name) + ' истекла (была до ' + C.dates.humanDate(st.untilISO) + '). Подробности — в «Покупках».';
        return 'Гарантия на ' + quote(p0.name) + ' действует до ' + C.dates.humanDate(st.untilISO) + '. Подробности — в разделе «Покупки».';
      }
      return 'По запросу ' + quote(data.q) + ' подходит несколько покупок: ' +
        items.map((x) => quote(x.name)).join(', ') + '. Уточните название или откройте «Покупки» — я не выбираю наугад.';
    }
    const line = (p) => quote(p.name) + ' — до ' + C.dates.humanDate(C.shopping.warrantyISO(p));
    if (!items.length) {
      return data.mode === 'expired' ? 'Покупок с истекшей гарантией нет.'
        : data.mode === 'soon' ? 'Гарантий, которые скоро закончатся, сейчас нет.'
          : 'Покупок с действующей гарантией нет. Указать гарантию можно в карточке вещи в «Покупках».';
    }
    const intro = data.mode === 'expired' ? 'Покупки с истекшей гарантией: '
      : data.mode === 'soon' ? 'Гарантия скоро закончится: '
        : 'Покупки с действующей гарантией сейчас: ';
    const shown = items.slice(0, 5).map(line);
    const rest = items.length - shown.length;
    return intro + shown.join('; ') + (rest > 0 ? ' и ещё ' + rest : '') +
      '. Эти же пункты «требуют внимания» показаны на «Главной» и в «Уведомлениях»; фильтр по гарантии есть и в «Покупках».';
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
        case 'note.body.replace':
          if (res.data.unchanged) {
            return 'В заметке ' + quote(res.data.title) + ' уже сохранён такой текст. Ничего менять не пришлось, новая запись в «Истории» не создана.';
          }
          return 'Текст заметки ' + quote(res.data.title) + ' заменён. Изменение уже видно в «Заметках» и в поиске; вернуть прежний текст можно в «Истории» кнопкой «Undo».';
        case 'note.body.append':
          return 'Заметка ' + quote(res.data.title) + ' дополнена: прежний текст сохранён, новый добавлен с новой строки. Изменение уже видно в «Заметках» и в поиске; отменить можно в «Истории».';
        case 'reminder.create':
          return 'Напоминание ' + quote(res.data.title) + ' создано на ' + whenPhrase(res.data.dateISO, res.data.time) +
            '. Оно уже видно в разделе «Уведомления»; отменить создание можно в «Истории».';
        case 'reminder.search': return reminderSearchText(res.data);
        case 'reminder.reschedule':
          if (res.data.unchanged) return 'Напоминание ' + quote(res.data.title) + ' уже стоит на ' + whenPhrase(res.data.dateISO, res.data.time) + '. Ничего не изменено, новой записи в «Истории» нет.';
          return 'Напоминание ' + quote(res.data.title) + ' перенесено: ' +
            whenPhrase(res.data.fromDateISO, res.data.fromTime) + ' → ' + whenPhrase(res.data.dateISO, res.data.time) +
            '. Новое расписание уже видно в «Уведомлениях»; отменить можно в «Истории».';
        case 'reminder.snooze':
          if (res.data.unchanged) return 'Уведомление напоминания ' + quote(res.data.title) + ' уже отложено до ' + C.dates.humanDate(res.data.untilISO) + '. Ничего не изменено.';
          return 'Уведомление напоминания ' + quote(res.data.title) + ' отложено до ' + C.dates.humanDate(res.data.untilISO) + '. Само напоминание не перенесено; отменить можно в «Истории».';
        case 'reminder.hide':
          if (res.data.unchanged) return 'Уведомление напоминания ' + quote(res.data.title) + ' уже скрыто. Само напоминание не удалено, новой записи в «Истории» нет.';
          return 'Уведомление напоминания ' + quote(res.data.title) + ' скрыто. Само напоминание не удалено; вернуть можно командой «Верни напоминание …» или через «Историю».';
        case 'reminder.restore':
          if (res.data.unchanged) return 'Уведомление напоминания ' + quote(res.data.title) + ' уже показано. Ничего не изменено.';
          if (res.data.snoozeUntilISO && C.dates.diffDays(res.data.snoozeUntilISO, C.dates.todayISO()) > 0) {
            return 'Уведомление напоминания ' + quote(res.data.title) + ' больше не скрыто, но остаётся отложено до ' +
              C.dates.humanDate(res.data.snoozeUntilISO) + '. Отменить возврат можно в «Истории».';
          }
          return 'Уведомление напоминания ' + quote(res.data.title) + ' возвращено в список. Отменить можно в «Истории».';
        case 'shopping.purchase.create': return purchaseCreateText(res.data);
        case 'shopping.purchase.search': return purchaseSearchText(res.data);
        case 'shopping.purchase.warranty': return purchaseWarrantyText(res.data);
        case 'task.complete':
          return 'Задача ' + quote(res.data.title) + ' отмечена выполненной. Вернуть её можно в «Задачах» или отменить в «Истории».';
        case 'task.reschedule':
          return 'Задача ' + quote(res.data.title) + ' перенесена на ' + whenPhrase(res.data.dateISO, '') +
            '. Отменить можно в «Истории».';
        case 'event.reschedule':
          if (res.data.noop) {
            return 'Событие ' + quote(res.data.title) + ' и так стоит на ' +
              eventWhenText(res.data.dateISO, res.data.time, res.data.endTime, res.data.allDay) +
              '. Ничего менять не пришлось — я ничего не изменила.';
          }
          return 'Событие ' + quote(res.data.title) + ' перенесено: ' +
            eventWhenText(res.data.fromDateISO, res.data.fromTime, res.data.fromEndTime, res.data.allDay) + ' → ' +
            eventWhenText(res.data.dateISO, res.data.time, res.data.endTime, res.data.allDay) +
            '. Оно уже на новом месте в «Календаре» и в «Дне»; отменить можно в «Истории».';
        case 'task.delete':
        case 'event.delete':
        case 'note.delete':
        case 'reminder.delete':
        case 'shopping.purchase.delete': return deleteDoneText(res);
        case 'task.rename':
        case 'event.rename':
        case 'note.rename':
        case 'reminder.rename':
        case 'shopping.purchase.rename': return renameDoneText(res);
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
        case 'auto.fuel.create':
          return 'Заправка записана: ' + res.data.liters + ' л, ' + C.money.exact(res.data.amount) +
            ', пробег ' + res.data.mileage + ' км, дата ' + whenPhrase(res.data.dateISO, '') +
            (res.data.linked ? '. Связанный расход создан в «Финансах»' : '. Расход в «Финансах» не создавался') +
            '. Запись видна в «Авто»; отменить можно в «Истории».';
        case 'auto.service.create':
          return 'Обслуживание ' + quote(res.data.title) + ' записано: ' + C.money.exact(res.data.amount) +
            ', пробег ' + res.data.mileage + ' км, дата ' + whenPhrase(res.data.dateISO, '') +
            (res.data.linked ? '. Связанный расход создан в «Финансах»' : '. Расход в «Финансах» не создавался') +
            '. Запись видно в «Авто»; отменить можно в «Истории».';
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
    if (REMINDER_MANAGE_ACTIONS[res.action]) {
      if (res.status === 'ambiguous') {
        return 'Под это название подходит несколько напоминаний: ' +
          (res.candidates || []).slice(0, 5).map((c, i) => (i + 1) + '. ' + quote(c.title) +
            ' — ' + whenPhrase(c.dateISO, c.time) + ' · ' + reminderStateText(c)).join('; ') +
          '. Выберите одно — пока ничего не изменилось.';
      }
      if (res.status === 'not_found') return 'Не нашла в «Уведомлениях» напоминание ' +
        quote(p.query || res.query || '') + '. Проверьте название — я ничего не изменила.';
      if (res.status === 'unsupported') return res.message || 'Сейчас это действие с напоминанием недоступно. Ничего не изменено.';
    }
    /* Удаление обязано отвечать про свой домен: общий текст «Нашла несколько
       задач» или «Не нашла подходящую открытую задачу» ввёл бы в заблуждение,
       когда речь о заметке или покупке. */
    if (DELETE_ACTIONS[res.action]) {
      const spec = deleteSpec()[res.action];
      if (res.status === 'ambiguous') {
        return 'Под это название подходит несколько записей: ' +
          (res.candidates || []).slice(0, 5).map((c, i) => {
            const det = deleteDetails(c);
            return (i + 1) + '. ' + quote(c.title) + (det ? ' — ' + det : '');
          }).join('; ') +
          '. Уточните, какую удалить — пока ничего не удалено.';
      }
      if (res.status === 'not_found') {
        if (res.code === 'ARCHIVED_TARGET') {
          return 'Запись ' + quote(p.query || res.query || '') + ' есть, но она в архиве, а архивные записи текстом я не удаляю. ' +
            'Откройте раздел ' + spec.section + ', покажите архив — и удалите её там. Я ничего не удалила.';
        }
        return 'Не нашла в ' + spec.where + ' запись ' + quote(p.query || res.query || '') +
          '. Проверьте название — я ничего не удалила.';
      }
    }
    /* Переименование также отвечает строго по своему домену. */
    if (RENAME_ACTIONS[res.action]) {
      const spec = renameSpec()[res.action];
      if (res.status === 'ambiguous') {
        return 'Под это название подходит несколько записей: ' +
          (res.candidates || []).slice(0, 5).map((c, i) => {
            const det = deleteDetails(c);
            return (i + 1) + '. ' + quote(c.title) + (det ? ' — ' + det : '');
          }).join('; ') +
          '. Уточните, какую переименовать — пока ничего не изменилось.';
      }
      if (res.status === 'not_found') {
        if (res.code === 'ARCHIVED_TARGET') {
          return 'Запись ' + quote(p.query || res.query || '') + ' есть, но она в архиве, а архивные записи текстом я не переименовываю. ' +
            'Откройте раздел ' + spec.section + ', покажите архив — и переименуйте её там. Я ничего не меняла.';
        }
        return 'Не нашла в ' + spec.where + ' запись ' + quote(p.query || res.query || '') +
          '. Проверьте название — я ничего не меняла.';
      }
    }
    if (NOTE_BODY_ACTIONS[res.action]) {
      if (res.status === 'ambiguous') {
        return 'Под это название подходит несколько активных заметок: ' +
          (res.candidates || []).slice(0, 5).map((c, i) =>
            (i + 1) + '. ' + quote(c.title) + (c.folder ? ' — папка ' + quote(c.folder) : '')
          ).join('; ') + '. Выберите одну — пока ни одна заметка не изменена.';
      }
      if (res.status === 'not_found') {
        return 'Не нашла активную заметку ' + quote(p.query || res.query || '') +
          '. Проверьте название в разделе «Заметки» — я ничего не изменила.';
      }
      if (res.status === 'unsupported') return res.message || 'Эту заметку сейчас нельзя изменить текстовой командой. Ничего не изменено.';
    }
    if (res.status === 'ambiguous' && res.code === 'AMBIGUOUS_EVENT') {
      return 'Нашла несколько подходящих событий: ' +
        (res.candidates || []).slice(0, 5).map((c, i) => (i + 1) + '. ' + quote(c.title) + ' — ' +
          eventWhenText(c.dateISO, c.time, c.endTime, c.allDay)).join('; ') +
        '. Уточните, какое перенести — пока ничего не изменилось.';
    }
    if (res.status === 'ambiguous') {
      return 'Нашла несколько задач: ' + listTitles(res.candidates) +
        '. Уточните, какую выбрать — пока ничего не изменилось.';
    }
    if (res.status === 'confirmation_required') return res.summary || 'Подтвердить это действие?';
    if (res.status === 'stale') return res.message || 'Эта запись уже недоступна. Ничего не изменилось.';
    if (res.status === 'not_found' && res.slot) return res.message;
    if (res.status === 'not_found' && res.code === 'EVENT_NOT_FOUND') {
      return 'Не нашла в «Календаре» событие ' + quote(p.query || res.query || '') +
        '. Новое событие вместо переноса я не создаю и ничего не меняла. Проверьте название в «Календаре» — ' +
        'создать новое можно командой «Добавь завтра в 10 встречу с Сергеем».';
    }
    if (res.status === 'not_found') {
      return 'Не нашла подходящую открытую задачу ' + quote(p.query || res.query || '') +
        '. Проверьте название в разделе «Задачи» — я ничего не меняла.' +
        (res.action === 'task.reschedule'
          ? ' Если это событие из «Календаря», напишите «Перенеси событие ' + (p.query || '') + ' на завтра».'
          : '');
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
        { action: 'shopping.purchase.search', example: 'Покажи покупки', about: 'вещи в собственности или поиск покупки по названию' },
        { action: 'shopping.purchase.warranty', example: 'Какие гарантии скоро закончатся?', about: 'покупки с истекающей, действующей или истекшей гарантией' },
        { action: 'help.capabilities', example: 'Что ты умеешь?', about: 'список понятных команд' }
      ],
      mutations: [
        { action: 'task.create', example: 'Создай задачу купить масло на завтра', about: 'создаёт задачу' },
        { action: 'event.create', example: 'Добавь завтра в 10 встречу с Сергеем', about: 'создаёт событие' },
        { action: 'task.complete', example: 'Отметь купить масло выполненной', about: 'отмечает задачу выполненной' },
        { action: 'task.reschedule', example: 'Перенеси задачу купить масло на пятницу', about: 'меняет дату задачи' },
        { action: 'event.reschedule', example: 'Перенеси событие стоматолог на 12:00', about: 'меняет дату и время уже существующего события — всегда после вашего подтверждения' },
        { action: 'note.create', example: 'Создай заметку купить фильтр для машины', about: 'создаёт заметку с этим текстом' },
        { action: 'note.body.replace', example: 'Замени текст заметки План отпуска: Купить билеты', about: 'полностью заменяет текст одной активной заметки — всегда после вашего подтверждения' },
        { action: 'note.body.append', example: 'Дополни заметку План отпуска: Забронировать отель', about: 'сохраняет прежний текст и дописывает новый с новой строки — всегда после вашего подтверждения' },
        { action: 'reminder.create', example: 'Напомни купить масло на завтра', about: 'создаёт напоминание на указанную дату' },
        { action: 'reminder.reschedule', example: 'Перенеси напоминание оплатить интернет на завтра в 10', about: 'меняет дату и/или время существующего напоминания' },
        { action: 'reminder.snooze', example: 'Отложи напоминание оплатить интернет до завтра', about: 'откладывает его уведомление до будущего дня; точное время не поддерживается' },
        { action: 'reminder.hide', example: 'Скрой напоминание оплатить интернет', about: 'скрывает уведомление, но не удаляет напоминание' },
        { action: 'reminder.restore', example: 'Верни напоминание оплатить интернет', about: 'возвращает скрытое уведомление' },
        { action: 'finance.expense.create', example: 'Запиши расход 850 ₽ на продукты', about: 'записывает расход — всегда после вашего подтверждения' },
        { action: 'auto.fuel.create', example: 'Запиши заправку 45 л на 2500 рублей', about: 'создаёт заправку в разделе «Авто»' },
        { action: 'auto.service.create', example: 'Запиши обслуживание замена масла на 3500 рублей', about: 'создаёт обслуживание в разделе «Авто»' },
        { action: 'shopping.purchase.create', example: 'Добавь покупку телефон за 45000 рублей', about: 'создаёт покупку в «Покупках»; связанный расход — только по явной просьбе и после подтверждения' },
        { action: 'task.delete', example: 'Удали задачу купить масло', about: 'удаляет задачу — всегда после вашего подтверждения, вернуть можно в «Истории»' },
        { action: 'event.delete', example: 'Удали событие стоматолог', about: 'удаляет событие — всегда после вашего подтверждения, вернуть можно в «Истории»' },
        { action: 'note.delete', example: 'Удали заметку про отпуск', about: 'удаляет заметку — всегда после вашего подтверждения, вернуть можно в «Истории»' },
        { action: 'reminder.delete', example: 'Удали напоминание про интернет', about: 'удаляет напоминание — всегда после вашего подтверждения, вернуть можно в «Истории»' },
        { action: 'shopping.purchase.delete', example: 'Удали покупку телефон', about: 'удаляет покупку — всегда после вашего подтверждения, вернуть можно в «Истории»' },
        { action: 'task.rename', example: 'Переименуй задачу купить масло в купить оливковое масло', about: 'переименовывает задачу — всегда после вашего подтверждения, вернуть можно в «Истории»' },
        { action: 'event.rename', example: 'Переименуй событие встреча с Сергеем в обед с Сергеем', about: 'переименовывает событие — всегда после вашего подтверждения, вернуть можно в «Истории»' },
        { action: 'note.rename', example: 'Переименуй заметку идея в идеи для проекта', about: 'переименовывает заметку — всегда после вашего подтверждения, вернуть можно в «Истории»' },
        { action: 'reminder.rename', example: 'Переименуй напоминание интернет в оплатить интернет', about: 'переименовывает напоминание — всегда после вашего подтверждения, вернуть можно в «Истории»' },
        { action: 'shopping.purchase.rename', example: 'Переименуй покупку телефон в смартфон', about: 'переименовывает покупку — всегда после вашего подтверждения, вернуть можно в «Истории»' }
      ],
      notYet: [
        'переименование и удаление сразу нескольких записей одной фразой («переименуй все задачи») — работаю строго по одной',
        'доходы текстом (расходы уже умею)',
        'изменение уже записанной финансовой операции текстом; удаление операции — только в «Финансах»',
        'удаление, замена и редактирование заправок и обслуживания текстом — только в «Авто»',
        'создание новых категорий и счетов текстом',
        'сокращения сумм вроде «5к» и пересчёт валют',
        'архивирование и возврат из архива текстовой командой (текст одной активной заметки уже умею заменять и дополнять)',
        'откладывание напоминания до точного времени (центр уведомлений хранит только день; перенос, откладывание до дня, скрытие и возврат уже умею)',
        'изменение даты/цены, ведение ремонтов и смена статуса покупок текстом (создание, переименование, поиск, гарантии и удаление уже умею)',
        'чеки, фото и файлы к покупкам — ждут сервис хранения',
        'изменение места, описания, участников и повторения события текстом (дату, время и название уже меняю)',
        'перенос повторяющихся событий текстом',
        'свободный разговор за пределами перечисленных уточнений'
      ]
    };
  }
  function examples() { return EXAMPLES.slice(); }

  return { normalize, parse, resolve, execute, respond, respondToParseError, run, supported, examples, context: makeContext };
})();
