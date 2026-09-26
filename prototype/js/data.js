/* Aven — Visual Prototype. Демо-данные (явно тестовые). Не production. */
window.AvenDemo = (function () {

  function demoState() {
    return {
      profile: {
        name: 'Алексей',
        greeting: 'Алексей',
        email: 'alexey@demo.aven',
        city: 'Москва (демо)',
        tz: 'UTC+3',
        currency: '₽ (RUB)',
        locale: 'ru-RU',
        weekStart: 'Понедельник',
        dateFormat: 'ДД.ММ.ГГГГ',
        timeFormat: '24 ч'
      },

      settings: {
        theme: 'light',
        textSize: 'md',
        reduceMotion: false,
        voice: {
          enabled: true,
          alwaysVoice: false,
          voiceURI: '',
          rate: 1,
          pitch: 1,
          volume: 1,
          engine: 'system', // 'system' | 'natural' (эксперимент, docs/TTS_RESEARCH.md)
          natural: { voice: 'qwen3/vd17-design', serverUrl: '', rate: 1, cache: true, timeoutSec: 10 }, // vd17-design — выбранный владельцем кандидат (§11)
          stt: { enabled: true, lang: 'ru-RU', interim: true, autoSend: false }
        },
        character: {
          enabled: true,
          id: 'female',
          name: '',
          floating: true,
          greet: true,
          voiceProfile: true
        },
        notify: {
          voiceAllowed: true,
          quietHours: true,
          quietFrom: '23:00',
          quietTo: '08:00',
          soundBefore: true,
          headphones: 'продолжать',
          privateInfo: 'не произносить суммы'
        },
        behavior: {
          answers: 'краткие',
          confirmation: 'перед удалениями',
          morning: '08:00',
          day: '12:00',
          evening: '18:30',
          night: '23:00',
          afterWork: '19:00'
        },
        homeCards: { today: true, tasks: true, expenses: true, car: true, quick: true },
        modules: { calendar: true, tasks: true, notes: true, finance: true, auto: true, shopping: true, tools: true },
        experiments: { canvas: false, aiRouter: false, geoReminders: false }
      },

      tasks: [
        { id: 't1', title: 'Забрать документы', desc: 'Готовность подтвердили вчера', date: 'today', prio: 'высокий', project: 'Личное', done: false },
        { id: 't2', title: 'Купить фильтр', desc: 'Воздушный фильтр для BMW', date: 'soon', prio: 'средний', project: 'Авто', done: false },
        { id: 't3', title: 'Оплатить интернет', desc: '', date: 'today', prio: 'низкий', project: 'Дом', done: true },
        { id: 't4', title: 'Записаться к стоматологу на чистку', desc: '', date: 'soon', prio: 'средний', project: 'Здоровье', done: false },
        { id: 't5', title: 'Позвонить в сервис по гарантии телефона', desc: '', date: 'soon', prio: 'низкий', project: 'Покупки', done: false }
      ],

      notes: [
        {
          id: 'n1', title: 'Что купить для машины', pinned: true,
          tags: ['авто', 'список'], updated: 'сегодня',
          body: '— Воздушный фильтр\n— Щётки стеклоочистителя\n— Незамерзайка (к сезону)\n— Проверить давление в шинах'
        },
        {
          id: 'n2', title: 'Идеи', pinned: false,
          tags: ['идеи'], updated: 'вчера',
          body: '— Велопарковка у подъезда: написать в УК\n— Подписка на облачный бэкап фото\n— Настроить автоматизацию «утренний обзор»'
        },
        {
          id: 'n3', title: 'Ремонт квартиры', pinned: false,
          tags: ['дом'], updated: '3 дня назад',
          body: 'Приоритет: ванная.\n1. Гидроизоляция\n2. Плитка\n3. Сантехника\nСмета — уточнить у мастера, ориентир 120–150 тыс. ₽'
        },
        {
          id: 'n4', title: 'Список документов', pinned: true,
          tags: ['документы'], updated: 'на прошлой неделе',
          body: '— Паспорт\n— СТС и страховка (машина)\n— Трудовой договор\n— Полис ДМС'
        }
      ],

      ops: [
        { id: 'o1', type: 'expense', cat: 'Авто', title: 'АЗС Лукойл', amount: 3200, date: 'сегодня', comment: '42 л' },
        { id: 'o2', type: 'expense', cat: 'Продукты', title: 'Пятёрочка', amount: 1450, date: 'сегодня', comment: '' },
        { id: 'o3', type: 'expense', cat: 'Дом', title: 'Интернет', amount: 790, date: 'вчера', comment: 'за месяц' },
        { id: 'o4', type: 'income', cat: 'Доход', title: 'Зарплата', amount: 96000, date: '5 дней назад', comment: '' },
        { id: 'o5', type: 'expense', cat: 'Другое', title: 'Аптека', amount: 560, date: '6 дней назад', comment: '' }
      ],
      finMonth: { expense: 47850, income: 96000, balance: 128540 },
      finChart: [
        { m: 'апр', v: 42100 }, { m: 'май', v: 47300 }, { m: 'июн', v: 38900 },
        { m: 'июл', v: 51200 }, { m: 'авг', v: 44100 }, { m: 'сен', v: 47850 }
      ],
      finCats: [
        { name: 'Авто', v: 18940 }, { name: 'Продукты', v: 12300 }, { name: 'Дом', v: 7600 },
        { name: 'Подписки', v: 2100 }, { name: 'Другое', v: 6910 }
      ],

      car: {
        model: 'BMW 530d', year: 2018, primary: true,
        mileage: 104520,
        consumption: '7.4 л / 100 км',
        monthCost: '18 940 ₽',
        lastService: '12.08.2026 — замена масла',
        nextService: 'через 2 480 км',
        fuel: [
          { id: 'f1', liters: 42, sum: 3200, km: 104120, date: '29.09' },
          { id: 'f2', liters: 40, sum: 2940, km: 103600, date: '15.09' },
          { id: 'f3', liters: 41, sum: 3010, km: 103050, date: '01.09' }
        ],
        expenses: [
          { id: 'ce1', title: 'Ремонт подвески', amount: 25000, date: '22.09' },
          { id: 'ce2', title: 'Мойка', amount: 800, date: '18.09' },
          { id: 'ce3', title: 'Щётки стеклоочистителя', amount: 1250, date: '05.09' }
        ],
        service: [
          { id: 'cs1', title: 'Замена масла и фильтра', date: '12.08.2026', cost: 8900, km: 102300 },
          { id: 'cs2', title: 'ТО: тормозные колодки', date: '04.06.2026', cost: 14200, km: 98700 }
        ],
        docs: [
          { id: 'cd1', title: 'ОСАГО', until: '14.03.2027' },
          { id: 'cd2', title: 'Техосмотр', until: '10.02.2027' },
          { id: 'cd3', title: 'СТС', until: 'без срока' }
        ]
      },

      purchases: [
        { id: 'p1', name: 'Ноутбук', emoji: '💻', price: 89990, date: '14.03.2025', warranty: '14.03.2027', sn: 'SN-DEMO-77120', status: 'в собственности' },
        { id: 'p2', name: 'Телефон', emoji: '📱', price: 54990, date: '02.09.2025', warranty: '02.09.2027', sn: 'SN-DEMO-44012', status: 'в собственности' },
        { id: 'p3', name: 'Телевизор', emoji: '📺', price: 62400, date: '20.01.2024', warranty: '20.01.2026', sn: 'SN-DEMO-90344', status: 'в собственности' }
      ],

      automations: [
        { id: 'a1', name: 'Утренний обзор', icon: '🌅', trigger: 'Каждый день, 08:00', enabled: true, last: 'сегодня, 08:00', next: 'завтра, 08:00' },
        { id: 'a2', name: 'Контроль страховки', icon: '🛡️', trigger: 'Ежедневная проверка даты', enabled: true, last: 'вчера, 09:00', next: 'сегодня, 09:00' },
        { id: 'a3', name: 'Обслуживание BMW', icon: '🚗', trigger: 'По пробегу / дате', enabled: true, last: '3 дня назад', next: 'по данным авто' }
      ],

      commands: [
        { id: 'c1', phrase: 'запиши {сумма} на {категория}', action: 'expense.add', enabled: true },
        { id: 'c2', phrase: 'напомни {дата} в {время} {текст}', action: 'event.create', enabled: true },
        { id: 'c3', phrase: 'залил {литры} литров', action: 'car.fuel.add', enabled: true },
        { id: 'c4', phrase: 'заправился на {сумма}', action: 'car.fuel.add', enabled: true },
        { id: 'c5', phrase: 'что у меня завтра', action: 'event.list', enabled: true },
        { id: 'c6', phrase: 'покажи расходы за {период}', action: 'expense.stats', enabled: false }
      ],

      dictionary: [
        { id: 'd1', word: 'бэха', value: 'BMW 530d', type: 'Автомобиль' },
        { id: 'd2', word: 'домой', value: 'Дом', type: 'Место' },
        { id: 'd3', word: 'работа', value: 'Работа (адрес)', type: 'Место' },
        { id: 'd4', word: 'маман', value: 'Мама (контакт)', type: 'Человек' },
        { id: 'd5', word: 'основная карта', value: 'Основной счёт', type: 'Счёт' }
      ],

      memory: {
        facts: [
          { id: 'm1', text: 'Основная машина — BMW 530d' },
          { id: 'm2', text: 'Зимние колёса находятся в гараже' },
          { id: 'm3', text: 'День рождения Сергея — 3 мая' },
          { id: 'm4', text: 'Интернет оплачивается до 30 числа' }
        ],
        objects: [
          { id: 'mo1', text: 'BMW 530d (2018) — автомобиль' },
          { id: 'mo2', text: 'Квартира — жильё' },
          { id: 'mo3', text: 'Ноутбук — покупка, гарантия до 14.03.2027' }
        ]
      },

      integrations: [
        { name: 'Курсы валют (демо-источник)', status: 'подключено', last: 'сегодня, 07:00' },
        { name: 'Email (демо)', status: 'не подключено', last: '—' }
      ],

      sessions: [
        { device: 'Chrome · Windows', where: 'Москва (демо)', when: 'текущая сессия', current: true, id: 'sess-1' },
        { device: 'Aven Demo App · Android', where: 'Москва (демо)', when: '2 дня назад', current: false, id: 'sess-2' }
      ],

      /* Вход выполнен (демо). Экраны входа/регистрации/2FA — js/auth.js; «Выйти» в топбаре. */
      auth: {
        logged: true,
        name: 'Алексей',
        email: 'alexey@demo.aven',
        role: 'owner',
        twoFactor: true,          // TOTP включён — вход через код (демо: любой 6-значный код)
        registrationsOpen: true,
        recoveryNote: 'Email-провайдер не выбран (открытый вопрос №16) — восстановление доступа в срезе 1.0 ограничено'
      },

      /* История действий — сквозной слой среза 1.0 (MVP_SCOPE §5.9, ADR-005/ADR-010). */
      history: [
        { id: 'h1', when: 'сегодня, 09:12', actor: 'вы', action: 'expense.create', title: 'Создан расход',
          object: 'Расход «АЗС Лукойл» · 3 200 ₽', objectType: 'expense', source: 'ui', undoable: true, danger: false,
          changes: [{ field: 'Сумма', from: '—', to: '3 200 ₽' }, { field: 'Категория', from: '—', to: 'Авто' }] },
        { id: 'h2', when: 'сегодня, 08:47', actor: 'вы', action: 'expense.update', title: 'Изменён расход',
          object: 'Расход «Пятёрочка»', objectType: 'expense', source: 'ui', undoable: true, danger: false,
          changes: [{ field: 'Сумма', from: '1 350 ₽', to: '1 450 ₽' }] },
        { id: 'h3', when: 'сегодня, 08:31', actor: 'вы', action: 'task.create', title: 'Создана задача',
          object: 'Задача «Позвонить в сервис»', objectType: 'task', source: 'ui', undoable: true, danger: false,
          changes: [{ field: 'Срок', from: '—', to: 'сегодня, 18:00' }, { field: 'Приоритет', from: '—', to: 'высокий' }] },
        { id: 'h4', when: 'вчера, 21:04', actor: 'вы', action: 'note.create', title: 'Создана заметка',
          object: 'Заметка «Идея: учёт расхода по месяцам»', objectType: 'note', source: 'ui', undoable: true, danger: false,
          changes: [{ field: 'Папка', from: '—', to: 'Идеи' }] },
        { id: 'h5', when: 'вчера, 19:58', actor: 'вы', action: 'task.delete', title: 'Удалена задача',
          object: 'Задача «Купить подарок»', objectType: 'task', source: 'ui', undoable: true, danger: true,
          changes: [{ field: 'Статус', from: 'Открыта', to: 'Удалена' }] },
        { id: 'h6', when: 'вчера, 18:20', actor: 'вы', action: 'settings.update', title: 'Изменена настройка',
          object: 'Настройки → Приватность', objectType: 'settings', source: 'ui', undoable: true, danger: false,
          sensitive: true, changes: [{ field: 'Видимость сумм', from: 'показывать', to: 'скрывать в уведомлениях' }] },
        { id: 'h7', when: 'вчера, 09:02', actor: 'вы', action: 'auth.login', title: 'Вход в аккаунт',
          object: 'Chrome · Windows · Москва (демо)', objectType: 'session', source: 'ui', undoable: false, danger: false,
          changes: [{ field: '2FA', from: '—', to: 'код подтверждён' }] },
        { id: 'h8', when: '2 дня назад, 03:00', actor: 'система', action: 'backup.create', title: 'Создан бэкап',
          object: 'Бэкап b-2026-09-24 · 47 МБ', objectType: 'system', source: 'system', undoable: false, danger: false,
          changes: [] }
      ],

      /* Административная область /admin — отдельно от /settings (ADR-012). Данные демо. */
      admin: {
        users: [
          { id: 'u1', name: 'Алексей (вы)', email: 'alexey@demo.aven', role: 'owner', status: 'активен', last: 'сейчас', twoFactor: true },
          { id: 'u2', name: 'Мария Соколова', email: 'maria@demo.aven', role: 'user', status: 'активен', last: '2 дня назад', twoFactor: false },
          { id: 'u3', name: 'Иван Петров', email: 'ivan@demo.aven', role: 'admin', status: 'заблокирован', last: 'месяц назад', twoFactor: true }
        ],
        roles: [
          { id: 'owner', name: 'Владелец', users: 1, perms: 'все права, удаление аккаунта, назначение ролей' },
          { id: 'admin', name: 'Администратор', users: 1, perms: 'пользователи, аудит, миграции, бэкап, флаги' },
          { id: 'user', name: 'Пользователь', users: 1, perms: 'только свои данные' }
        ],
        audit: [
          { id: 'a1', when: 'сегодня, 08:55', actor: 'alexey@demo.aven', action: 'user.block', object: 'Иван Петров', result: 'ok' },
          { id: 'a2', when: 'вчера, 03:00', actor: 'система', action: 'backup.create', object: 'b-2026-09-25', result: 'ok' },
          { id: 'a3', when: '2 дня назад, 11:20', actor: 'alexey@demo.aven', action: 'migration.apply', object: '0008_finance_accounts', result: 'ok' },
          { id: 'a4', when: '3 дня назад, 14:02', actor: 'alexey@demo.aven', action: 'flag.set', object: 'exp_canvas = off', result: 'ok' },
          { id: 'a5', when: '4 дня назад, 09:41', actor: 'ivan@demo.aven', action: 'user.role.set', object: 'Мария Соколова = user', result: 'denied' }
        ],
        migrations: [
          { id: '0007_history_undo', name: 'История действий и Undo', status: 'применена', at: '2026-09-20 03:12' },
          { id: '0008_finance_accounts', name: 'Счета и категории финансов', status: 'применена', at: '2026-09-24 11:20' },
          { id: '0009_feature_flags', name: 'Флаги функций', status: 'ожидает', at: '—' }
        ],
        health: {
          uptime: '12 д 4 ч', version: '0.0.0-demo', db: 'PostgreSQL (демо)', dbSize: '48 МБ',
          queue: '0 в работе · 12 за сутки', lastBackup: 'сегодня, 03:00', errors24h: 0, storage: '1.2 ГБ из 10 ГБ'
        },
        backups: [
          { id: 'b-2026-09-26', at: 'сегодня, 03:00', size: '48 МБ', kind: 'автоматический', verified: false },
          { id: 'b-2026-09-25', at: 'вчера, 03:00', size: '47 МБ', kind: 'автоматический', verified: true },
          { id: 'b-manual-1', at: '2 дня назад, 12:40', size: '47 МБ', kind: 'ручной', verified: true }
        ],
        flags: [
          { id: 'exp_canvas', name: 'Automation Canvas', stage: 'Stage 4', on: false },
          { id: 'exp_aiRouter', name: 'AI Router', stage: 'опция (ADR-002)', on: false },
          { id: 'voice_natural', name: 'Натуральный TTS (self-hosted)', stage: 'Stage 3', on: false },
          { id: 'notify_email', name: 'Email-уведомления', stage: 'Stage 1.1', on: false },
          { id: 'files_attachments', name: 'Вложения и чеки', stage: 'Stage 1.1', on: false }
        ],
        emergency: { readonly: false, registrationsClosed: false, maintenance: false }
      }
    };
  }

  // статичные данные, не редактируются в прототипе
  const staticData = {
    eventsByDay: {
      3:  [{ t: 'весь день', n: 'День рождения Сергея' }],
      12: [{ t: '13:00', n: 'Замена масла (выполнено)' }],
      25: [{ t: '10:00', n: 'Стоматолог' }, { t: '14:00', n: 'Забрать посылку' }],
      28: [{ t: '11:00', n: 'Техосмотр' }],
      30: [{ t: '09:00', n: 'Оплата интернета' }]
    },
    day: {
      yesterday: [
        { t: '08:00', n: 'Бассейн', type: 'event' },
        { t: '13:00', n: 'Обед с Максимом', type: 'event' },
        { t: '19:30', n: 'Оплатил ЖКХ', type: 'done' }
      ],
      today: [
        { t: '08:00', n: 'Подъём', type: 'event' },
        { t: '10:00', n: 'Стоматолог', type: 'event' },
        { t: '14:00', n: 'Забрать посылку', type: 'event' },
        { t: '19:00', n: 'Купить продукты', type: 'task' }
      ],
      tomorrow: [
        { t: '10:00', n: 'Планёрка', type: 'event' },
        { t: '18:30', n: 'Спортзал', type: 'event' }
      ]
    },
    reminders: [
      { t: 'за 1 ч до', n: 'Стоматолог' },
      { t: '20:00', n: 'Купить продукты' },
      { t: '30.09', n: 'Передать показания счётчиков' }
    ],
    assistantReplies: [
      { q: 'потратил|расход', a: 'Сегодня записано расходов на 3 420 ₽. Самая крупная — АЗС Лукойл, 3 200 ₽.' },
      { q: 'завтра', a: 'Завтра у вас два события: планёрка в 10:00 и спортзал в 18:30. Напомнить о них заранее?' },
      { q: 'машина|bmw|бэх|авто|пробег', a: 'BMW 530d, пробег 104 520 км. До замены масла — 2 480 км. Расходы за месяц: 18 940 ₽.' },
      { q: 'сегодня|план', a: 'Сегодня: стоматолог в 10:00, забрать посылку в 14:00, купить продукты в 19:00. Из задач — забрать документы.' },
      { q: 'напомн', a: 'Хорошо. О чём напомнить и когда? (демо: попробуйте фразу «завтра в 10 позвонить Сергею»)' },
      { q: 'что ты умеешь', a: 'Я могу вести расходы, заправки и обслуживание авто, задачи, события, заметки и напоминания. Скажите, что сделать — или откройте нужный раздел в меню.' }
    ],
    assistantDefault: 'Демо-режим: здесь появится ответ Aven. Попробуйте подсказки под полем или откройте разделы в меню (выйдите из ассистента кнопкой ←).',
    tools: [
      { id: 'qr', icon: '🔳', name: 'QR-код', desc: 'Генерация QR (демо-изображение)' },
      { id: 'percent', icon: '％', name: 'Проценты', desc: 'X% от числа, изменение в %' },
      { id: 'dates', icon: '📆', name: 'Разница между датами', desc: 'Дни между двумя датами' },
      { id: 'units', icon: '📐', name: 'Конвертер единиц', desc: 'Длина, вес, температура' },
      { id: 'fuel', icon: '⛽', name: 'Калькулятор топлива', desc: 'Стоимость заправки, расход' },
      { id: 'trip', icon: '🧭', name: 'Стоимость поездки', desc: 'Расстояние × расход × цена' },
      { id: 'pass', icon: '🔑', name: 'Генератор паролей', desc: 'Длина, символы, цифры' },
      { id: 'base64', icon: '🔤', name: 'Base64', desc: 'Кодирование и декодирование' },
      { id: 'url', icon: '🔗', name: 'URL Encoder/Decoder', desc: 'Кодирование ссылок и текста' },
      { id: 'unix', icon: '⏱️', name: 'Unix Time', desc: 'Timestamp ↔ дата' },
      { id: 'uuid', icon: '🆔', name: 'UUID', desc: 'Генерация идентификаторов' },
      { id: 'json', icon: '🧾', name: 'JSON Formatter', desc: 'Форматирование JSON' },
      { id: 'diff', icon: '🔀', name: 'Diff', desc: 'Сравнение двух текстов' }
    ],
    automationTemplates: ['Утренний обзор', 'Вечернее планирование', 'Контроль расходов', 'Автомобиль', 'Страховка', 'Регулярные платежи']
  };

  return { demoState, staticData };
})();
