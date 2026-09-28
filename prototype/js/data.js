/* Aven — Visual Prototype. Демо-данные (явно тестовые). Не production. */
window.AvenDemo = (function () {
  // Фиксированная «сегодняшняя» дата прототипа: тесты и демо-сценарии должны быть воспроизводимыми.
  const DEMO_TODAY = '2026-09-27';

  function demoState() {
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (offset) => {
      const p = DEMO_TODAY.split('-').map(Number);
      const d = new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
      d.setDate(d.getDate() + offset);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    };
    const humanDate = (v) => {
      const p = String(v || '').split('-');
      return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : (v || '—');
    };
    const today = iso(0), tomorrow = iso(1), yesterday = iso(-1);

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
          natural: { voice: '', serverUrl: '', rate: 1, cache: true, timeoutSec: 10 },
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
          /* Уведомления в приложении (Центр уведомлений, раздел «Уведомления»).
             Это то, что реально работает в срезе 1.0/1.1: собирает напоминания из разных
             разделов на одном экране. Фоновые/почтовые/push-уведомления при закрытой вкладке
             НЕ входят сюда — им нужен сервер (открытые вопросы №16, №17). */
          inapp: true,
          sources: {
            taskDue: true,      // задачи со сроком сегодня
            taskOverdue: true,  // просроченные задачи
            eventUpcoming: true,// события сегодня
            eventReminder: true,// события с включённым напоминанием
            autoDocs: true,     // документы авто с близким сроком
            warranty: true,     // истекающая/истёкшая гарантия покупок
            manual: true        // напоминания, созданные вручную
          },
          horizonDays: 7,       // насколько вперёд собирать напоминания
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
        suggestions: {
          /* Локальные объяснимые предложения по уже существующим данным. Это правила,
             не AI/LLM; выключение не меняет задачи, события и другие сущности. */
          enabled: true
        },
        daily: {
          /* Дневные сценарии (утренний обзор и итоги дня). Это только подсказка на «Главной»
             и отдельные экраны: фоновых будильников и оповещений при закрытой вкладке нет.
             Границы «утро/день/вечер/ночь» берутся из settings.behavior. */
          morning: true,
          evening: true
        },
        homeCards: { suggestions: true, today: true, tasks: true, expenses: true, car: true, reminders: true, quick: true, actions: true },
        modules: { calendar: true, tasks: true, notes: true, finance: true, auto: true, shopping: true, tools: true },
        experiments: { canvas: false, aiRouter: false, geoReminders: false }
      },

      tasks: [
        { id: 't1', title: 'Забрать документы', description: 'Готовность подтвердили вчера', desc: 'Готовность подтвердили вчера',
          date: today, time: '18:00', deadline: today, dueDate: today, dueTime: '18:00',
          priority: 'высокий', prio: 'высокий', project: 'Личное', tags: ['документы', 'личное'],
          completed: false, done: false, status: 'active', archived: false, reminder: { value: '1h', minutesBefore: 60, delivery: 'prototype-only' } },
        { id: 't2', title: 'Купить фильтр', description: 'Воздушный фильтр для BMW', desc: 'Воздушный фильтр для BMW',
          date: tomorrow, time: '', deadline: tomorrow, dueDate: tomorrow, dueTime: '',
          priority: 'средний', prio: 'средний', project: 'Авто', tags: ['авто', 'покупки'],
          completed: false, done: false, status: 'active', archived: false, reminder: null },
        { id: 't3', title: 'Оплатить интернет', description: '', desc: '',
          date: today, time: '20:00', deadline: today, dueDate: today, dueTime: '20:00',
          priority: 'низкий', prio: 'низкий', project: 'Дом', tags: ['дом', 'платёж'],
          completed: true, done: true, status: 'completed', archived: false, reminder: null },
        { id: 't4', title: 'Записаться к стоматологу на чистку', description: '', desc: '',
          date: iso(4), time: '', deadline: iso(4), dueDate: iso(4), dueTime: '',
          priority: 'средний', prio: 'средний', project: 'Здоровье', tags: ['здоровье'],
          completed: false, done: false, status: 'active', archived: false, reminder: null },
        { id: 't5', title: 'Позвонить в сервис по гарантии телефона', description: '', desc: '',
          date: iso(2), time: '12:00', deadline: iso(2), dueDate: iso(2), dueTime: '12:00',
          priority: 'низкий', prio: 'низкий', project: 'Покупки', tags: ['покупки', 'гарантия'],
          completed: false, done: false, status: 'active', archived: false, reminder: { value: '15m', minutesBefore: 15, delivery: 'prototype-only' } }
      ],

      noteFolders: ['Личное', 'Авто', 'Дом', 'Документы', 'Идеи'],
      notes: [
        {
          id: 'n1', title: 'Что купить для машины', pinned: true, folder: 'Авто', archived: false,
          tags: ['авто', 'список'], updated: 'сегодня', updatedISO: today,
          body: '— Воздушный фильтр\n— Щётки стеклоочистителя\n— Незамерзайка (к сезону)\n— Проверить давление в шинах'
        },
        {
          id: 'n2', title: 'Идеи', pinned: false, folder: 'Идеи', archived: false,
          tags: ['идеи'], updated: 'вчера', updatedISO: yesterday,
          body: '— Велопарковка у подъезда: написать в УК\n— Подписка на облачный бэкап фото\n— Настроить автоматизацию «утренний обзор»'
        },
        {
          id: 'n3', title: 'Ремонт квартиры', pinned: false, folder: 'Дом', archived: false,
          tags: ['дом'], updated: '3 дня назад', updatedISO: iso(-3),
          body: 'Приоритет: ванная.\n1. Гидроизоляция\n2. Плитка\n3. Сантехника\nСмета — уточнить у мастера, ориентир 120–150 тыс. ₽'
        },
        {
          id: 'n4', title: 'Список документов', pinned: true, folder: 'Документы', archived: false,
          tags: ['документы'], updated: 'на прошлой неделе', updatedISO: iso(-7),
          body: '— Паспорт\n— СТС и страховка (машина)\n— Трудовой договор\n— Полис ДМС'
        }
      ],

      /* События календаря — теперь часть изменяемого demo-state, а не только staticData.
         Это нужно для связанной петли Stage 1.0: создать событие → увидеть в Календаре, Дне,
         Главной и Истории → удалить/отменить через Undo (MVP_SCOPE §5.4, §5.7, §5.8, §5.9). */
      events: [
        { id: 'e1', title: 'Бассейн', date: yesterday, startTime: '08:00', endTime: '09:00', time: '08:00', end: '09:00', allDay: false,
          place: 'Фитнес-клуб', category: 'Здоровье', color: '#17966b', importance: 'обычная', repeat: 'none', reminder: null, description: '', desc: '' },
        { id: 'e2', title: 'Обед с Максимом', date: yesterday, startTime: '13:00', endTime: '14:00', time: '13:00', end: '14:00', allDay: false,
          place: 'Кафе у офиса', category: 'Личное', color: '#5a5fd8', importance: 'обычная', repeat: 'none', reminder: null, description: '', desc: '' },
        { id: 'e3', title: 'Стоматолог', date: today, startTime: '10:00', endTime: '11:00', time: '10:00', end: '11:00', allDay: false,
          place: 'Клиника', category: 'Здоровье', color: '#b26a00', importance: 'важное', repeat: 'none', reminder: { value: '1h', minutesBefore: 60, delivery: 'prototype-only' }, description: 'Проверка и план лечения', desc: 'Проверка и план лечения' },
        { id: 'e4', title: 'Забрать посылку', date: today, startTime: '14:00', endTime: '14:30', time: '14:00', end: '14:30', allDay: false,
          place: 'Пункт выдачи', category: 'Дом', color: '#5a5fd8', importance: 'обычная', repeat: 'none', reminder: { value: '15m', minutesBefore: 15, delivery: 'prototype-only' }, description: '', desc: '' },
        { id: 'e5', title: 'Планёрка', date: tomorrow, startTime: '10:00', endTime: '10:45', time: '10:00', end: '10:45', allDay: false,
          place: 'Онлайн', category: 'Работа', color: '#4a7cf0', importance: 'обычная', repeat: 'weekly', reminder: null, description: 'Повторяется еженедельно (демо)', desc: 'Повторяется еженедельно (демо)' },
        { id: 'e6', title: 'Спортзал', date: tomorrow, startTime: '18:30', endTime: '20:00', time: '18:30', end: '20:00', allDay: false,
          place: 'Зал', category: 'Здоровье', color: '#17966b', importance: 'обычная', repeat: 'none', reminder: null, description: '', desc: '' },
        { id: 'e7', title: 'День рождения Сергея', date: iso(-24), startTime: '', endTime: '', time: '', end: '', allDay: true,
          place: '', category: 'Личное', color: '#e05a7a', importance: 'важное', repeat: 'yearly', reminder: { value: '1d', minutesBefore: 1440, delivery: 'prototype-only' }, description: 'Демо: ежегодное событие', desc: 'Демо: ежегодное событие' },
        { id: 'e8', title: 'Замена масла (выполнено)', date: iso(-15), startTime: '13:00', endTime: '14:30', time: '13:00', end: '14:30', allDay: false,
          place: 'Автосервис', category: 'Авто', color: '#b26a00', importance: 'обычная', repeat: 'none', reminder: null, description: 'Связь с авто — в 1.1', desc: 'Связь с авто — в 1.1' },
        { id: 'e9', title: 'Техосмотр', date: iso(1), startTime: '11:00', endTime: '12:00', time: '11:00', end: '12:00', allDay: false,
          place: 'Сервис', category: 'Авто', color: '#b26a00', importance: 'важное', repeat: 'none', reminder: { value: '1d', minutesBefore: 1440, delivery: 'prototype-only' }, description: 'Документы авто', desc: 'Документы авто' },
        { id: 'e10', title: 'Оплата интернета', date: iso(3), startTime: '09:00', endTime: '09:10', time: '09:00', end: '09:10', allDay: false,
          place: '', category: 'Дом', color: '#5a5fd8', importance: 'обычная', repeat: 'monthly', reminder: null, description: 'Демо: ежемесячное событие', desc: 'Демо: ежемесячное событие' }
      ],

      ops: [
        { id: 'o1', type: 'expense', cat: 'Авто', account: 'card', title: 'АЗС Лукойл', amount: 3200, date: 'сегодня', dateISO: today, comment: '42 л' },
        { id: 'o2', type: 'expense', cat: 'Продукты', account: 'card', title: 'Пятёрочка', amount: 1450, date: 'сегодня', dateISO: today, comment: '' },
        { id: 'o3', type: 'expense', cat: 'Дом', account: 'card', title: 'Интернет', amount: 790, date: 'вчера', dateISO: yesterday, comment: 'за месяц' },
        { id: 'o4', type: 'income', cat: 'Доход', account: 'card', title: 'Зарплата', amount: 96000, date: '5 дней назад', dateISO: iso(-5), comment: '' },
        { id: 'o5', type: 'expense', cat: 'Другое', account: 'cash', title: 'Аптека', amount: 560, date: '6 дней назад', dateISO: iso(-6), comment: '' }
      ],
      finAccounts: [
        { id: 'card', name: 'Основная карта', balance: 118540 },
        { id: 'cash', name: 'Наличные', balance: 10000 },
        { id: 'savings', name: 'Накопительный счёт', balance: 0 }
      ],
      finCategories: ['Авто', 'Продукты', 'Дом', 'Подписки', 'Другое', 'Доход'],
      /* Итогов месяца в данных больше нет: баланс, расходы и доходы всегда считаются
         из операций и счетов, поэтому карточки и таблица не могут разойтись. */

      car: {
        model: 'BMW 530d', year: 2018, primary: true, fuelType: 'дизель', serviceIntervalKm: 10000,
        mileage: 104520,
        fuel: [
          { id: 'f1', liters: 42, sum: 3200, km: 104120, date: humanDate(today), dateISO: today, financeOpId: 'o1', note: 'Лукойл' },
          { id: 'f2', liters: 40, sum: 2940, km: 103600, date: humanDate(iso(-14)), dateISO: iso(-14), financeOpId: '', note: '' },
          { id: 'f3', liters: 41, sum: 3010, km: 103050, date: humanDate(iso(-28)), dateISO: iso(-28), financeOpId: '', note: '' }
        ],
        expenses: [
          { id: 'ce1', title: 'Ремонт подвески', amount: 25000, date: humanDate(iso(-7)), dateISO: iso(-7), category: 'Ремонт', financeOpId: '', comment: 'Передняя ось' },
          { id: 'ce2', title: 'Мойка', amount: 800, date: humanDate(iso(-11)), dateISO: iso(-11), category: 'Уход', financeOpId: '', comment: '' },
          { id: 'ce3', title: 'Щётки стеклоочистителя', amount: 1250, date: humanDate(iso(-24)), dateISO: iso(-24), category: 'Запчасти', financeOpId: '', comment: '' }
        ],
        service: [
          { id: 'cs1', title: 'Замена масла и фильтра', date: '12.08.2026', dateISO: '2026-08-12', cost: 8900, km: 102300, financeOpId: '', comment: 'Следующее через 10 000 км' },
          { id: 'cs2', title: 'ТО: тормозные колодки', date: '04.06.2026', dateISO: '2026-06-04', cost: 14200, km: 98700, financeOpId: '', comment: '' }
        ],
        docs: [
          { id: 'cd1', title: 'ОСАГО', until: '14.03.2027', untilISO: '2027-03-14', remindDays: 30 },
          { id: 'cd2', title: 'Техосмотр', until: '10.02.2027', untilISO: '2027-02-10', remindDays: 30 },
          { id: 'cd3', title: 'СТС', until: 'без срока', untilISO: '', remindDays: 0 }
        ]
      },

      purchaseCategories: ['Электроника', 'Дом', 'Авто', 'Одежда', 'Спорт', 'Документы', 'Другое'],
      purchases: [
        { id: 'p1', name: 'Ноутбук', emoji: '💻', category: 'Электроника', price: 89990,
          date: '14.03.2025', dateISO: '2025-03-14', store: 'DNS', warranty: '14.03.2027', warrantyISO: '2027-03-14',
          sn: 'SN-DEMO-77120', status: 'owned', condition: 'используется', financeOpId: '',
          note: 'Рабочий ноутбук. Чек — будет файловым вложением после StorageProvider.', repairs: [
            { id: 'pr1', title: 'Чистка системы охлаждения', date: '10.06.2026', dateISO: '2026-06-10', cost: 2500, comment: 'Профилактика' }
          ] },
        { id: 'p2', name: 'Телефон', emoji: '📱', category: 'Электроника', price: 54990,
          date: '02.09.2025', dateISO: '2025-09-02', store: 're:Store', warranty: '02.09.2027', warrantyISO: '2027-09-02',
          sn: 'SN-DEMO-44012', status: 'owned', condition: 'используется', financeOpId: '',
          note: 'Основной телефон.', repairs: [] },
        { id: 'p3', name: 'Телевизор', emoji: '📺', category: 'Дом', price: 62400,
          date: '20.01.2024', dateISO: '2024-01-20', store: 'М.Видео', warranty: '15.11.2026', warrantyISO: '2026-11-15',
          sn: 'SN-DEMO-90344', status: 'owned', condition: 'гостиная', financeOpId: '',
          note: 'Гарантия скоро закончится — хороший пример фильтра.', repairs: [] }
      ],

      automations: [
        { id: 'a1', name: 'Утренний обзор', icon: '🌅', trigger: 'Каждый день, 08:00', enabled: true, last: 'сегодня, 08:00', next: 'завтра, 08:00' },
        { id: 'a2', name: 'Контроль страховки', icon: '🛡️', trigger: 'Ежедневная проверка даты', enabled: true, last: 'вчера, 09:00', next: 'сегодня, 09:00' },
        { id: 'a3', name: 'Обслуживание BMW', icon: '🚗', trigger: 'По пробегу / дате', enabled: true, last: '3 дня назад', next: 'по данным авто' }
      ],

      /* Напоминания, созданные вручную (раздел «Уведомления»). Это самостоятельные записи
         пользователя: их можно создать, изменить и удалить. Остальные пункты Центра уведомлений
         вычисляются из задач, событий, документов авто и гарантий и отдельно не хранятся. */
      reminders: [
        { id: 'r1', title: 'Передать показания счётчиков', note: 'Вода и электричество за месяц', dateISO: yesterday, time: '20:00', link: '', createdISO: iso(-2), updatedISO: iso(-2) },
        { id: 'r2', title: 'Продлить абонемент в бассейн', note: 'Заканчивается на этой неделе', dateISO: today, time: '19:00', link: '', createdISO: iso(-1), updatedISO: iso(-1) },
        { id: 'r3', title: 'Поздравить маму с годовщиной', note: '', dateISO: tomorrow, time: '10:00', link: '', createdISO: iso(-1), updatedISO: iso(-1) }
      ],

      /* Пользовательская реакция хранится отдельно от вычисляемых предложений:
         stable suggestion id → dismissed/snoozeUntilISO. */
      suggestionState: {},

      /* Состояние Центра уведомлений по каждому пункту (прочитано / отложено / скрыто).
         Ключ — стабильный идентификатор пункта (тип:источник), значение — что с ним сделал
         пользователь. Пункты сами по себе живут в задачах/событиях/гарантиях, а здесь хранится
         только реакция на них, чтобы «прочитано» и «отложено» не терялись между открытиями. */
      notifState: {
        'event-upcoming:e3': { read: true, readAt: 'сегодня, 08:10' }
      },

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

  function todayISO(offset) {
    const pad = (n) => String(n).padStart(2, '0');
    const p = DEMO_TODAY.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  return { demoState, staticData, todayISO, demoTodayISO: DEMO_TODAY };
})();
