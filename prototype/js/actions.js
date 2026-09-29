/* Aven — Visual Prototype. Common Action Layer для задач, событий, профиля и настроек.
   Тонкий слой над demo-state: DOM не используется. UI, демо Assistant/flows и будущий
   Text Command / Voice→STT должны вызывать эти же операции, а не дублировать бизнес-логику.
   Не production: состояние — localStorage/JS memory прототипа, без backend/API. */
window.AvenActions = (function () {
  const S = window.AvenState;
  const A = window.Aven || {};
  const s = () => S.s();

  const pad = (n) => String(n).padStart(2, '0');
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^\d{2}:\d{2}$/;

  function todayISO(offset) {
    if (window.AvenDemo && typeof window.AvenDemo.todayISO === 'function') return window.AvenDemo.todayISO(offset || 0);
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + (offset || 0));
    return localISO(d);
  }
  function localISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isISODate(v) { return ISO_RE.test(String(v || '')); }
  function parseISO(iso) {
    const p = String(iso || '').split('-').map(Number);
    return new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1, 12, 0, 0, 0);
  }
  function diffDays(aISO, bISO) { return Math.round((parseISO(aISO) - parseISO(bISO)) / 86400000); }
  function addDays(iso, offset) { const d = parseISO(iso || todayISO()); d.setDate(d.getDate() + (offset || 0)); return localISO(d); }
  /* Единая точка форматирования даты: результат зависит от «Формат даты» в профиле
     (MVP_SCOPE §5.2, приёмка 3). Все разделы зовут humanDate, поэтому настройка
     применяется сквозным образом, а не в одном экране. */
  function humanDate(iso) {
    if (!iso) return '—';
    return formatDateByProfile(iso);
  }
  function dateLabel(iso) {
    if (!iso) return 'без даты';
    const d = diffDays(iso, todayISO());
    if (d === -1) return 'вчера';
    if (d === 0) return 'сегодня';
    if (d === 1) return 'завтра';
    return humanDate(iso);
  }
  function normalizeDate(v, fallback) {
    if (isISODate(v)) return String(v);
    if (v === 'today') return todayISO();
    if (v === 'tomorrow' || v === 'soon') return todayISO(1);
    if (v === 'yesterday') return todayISO(-1);
    return fallback || '';
  }
  function normalizeTime(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(raw);
    if (!m) return TIME_RE.test(raw) ? raw : '';
    /* Значение вне суток — это ошибка ввода, а не «почти правильно»: молча
       подменять 25:99 на 23:59 нельзя, иначе сохранится не то, что ввёл человек. */
    const h = Number(m[1]), mm = Number(m[2]);
    if (!isFinite(h) || !isFinite(mm) || h > 23 || mm > 59) return '';
    return pad(h) + ':' + pad(mm);
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function ensureList(st, name) { if (!Array.isArray(st[name])) st[name] = []; return st[name]; }
  function getById(list, id) { return (list || []).filter((x) => x && x.id === id)[0] || null; }
  function indexOfId(list, id) {
    for (let i = 0; i < (list || []).length; i++) if (list[i] && list[i].id === id) return i;
    return -1;
  }
  function save() { if (S && S.save) S.save(); }
  function log(entry) { return (A && A.logAction) ? A.logAction(entry) : null; }
  function ok(action, entity, extra) { return Object.assign({ ok: true, action, entity }, extra || {}); }
  function err(action, code, message, extra) { return Object.assign({ ok: false, action, code, message: message || code }, extra || {}); }
  function same(a, b) { return JSON.stringify(a == null ? '' : a) === JSON.stringify(b == null ? '' : b); }
  function tags(v) {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    return String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  }

  /* ================= ПРОФИЛЬ, НАСТРОЙКИ И ФОРМАТЫ =================
     MVP_SCOPE §4.1 п.2 (Профиль) и п.10 (Настройки), §5.2 (приёмка форматов), §8.
     ADR-011: изменение настройки — такое же действие, как любое другое: одна точка входа,
     проверка значения, запись в историю, Undo. Экран настроек ничего не пишет в состояние
     сам; он только вызывает эти функции — как позже будут делать текстовые и голосовые
     команды. Слой не знает про DOM. */

  const CURRENCIES = [
    { value: '₽ (RUB)', label: '₽ · Рубль (RUB)', sign: '₽', locale: 'ru-RU', position: 'suffix' },
    { value: '$ (USD)', label: '$ · Доллар США (USD)', sign: '$', locale: 'en-US', position: 'prefix' },
    { value: '€ (EUR)', label: '€ · Евро (EUR)', sign: '€', locale: 'de-DE', position: 'suffix' },
    { value: '₸ (KZT)', label: '₸ · Тенге (KZT)', sign: '₸', locale: 'ru-RU', position: 'suffix' },
    { value: '₴ (UAH)', label: '₴ · Гривна (UAH)', sign: '₴', locale: 'ru-RU', position: 'suffix' },
    { value: '£ (GBP)', label: '£ · Фунт стерлингов (GBP)', sign: '£', locale: 'en-GB', position: 'prefix' }
  ];
  const DATE_FORMATS = [
    { value: 'ДД.ММ.ГГГГ', label: 'ДД.ММ.ГГГГ — 27.09.2026' },
    { value: 'ГГГГ-ММ-ДД', label: 'ГГГГ-ММ-ДД — 2026-09-27' },
    { value: 'ММ/ДД/ГГГГ', label: 'ММ/ДД/ГГГГ — 09/27/2026' },
    { value: 'Д месяца ГГГГ', label: 'Д месяца ГГГГ — 27 сентября 2026' }
  ];
  const TIME_FORMATS = [
    { value: '24 ч', label: '24 часа — 18:30' },
    { value: '12 ч', label: '12 часов — 6:30 PM' }
  ];
  const WEEK_STARTS = [
    { value: 'Понедельник', label: 'Понедельник', index: 1 },
    { value: 'Воскресенье', label: 'Воскресенье', index: 0 }
  ];
  const TIMEZONES = [
    { value: 'UTC+0', label: 'UTC+0 · Лондон', offset: 0 },
    { value: 'UTC+1', label: 'UTC+1 · Берлин', offset: 60 },
    { value: 'UTC+2', label: 'UTC+2 · Калининград, Хельсинки', offset: 120 },
    { value: 'UTC+3', label: 'UTC+3 · Москва', offset: 180 },
    { value: 'UTC+4', label: 'UTC+4 · Самара', offset: 240 },
    { value: 'UTC+5', label: 'UTC+5 · Екатеринбург', offset: 300 },
    { value: 'UTC+6', label: 'UTC+6 · Омск', offset: 360 },
    { value: 'UTC+7', label: 'UTC+7 · Красноярск', offset: 420 },
    { value: 'UTC+8', label: 'UTC+8 · Иркутск', offset: 480 },
    { value: 'UTC+10', label: 'UTC+10 · Владивосток', offset: 600 },
    { value: 'UTC-5', label: 'UTC−5 · Нью-Йорк', offset: -300 }
  ];
  const LANGUAGES = [
    { value: 'ru-RU', label: 'Русский' },
    { value: 'en-US', label: 'English — перспектива, пока недоступен', disabled: true }
  ];
  const ANSWER_STYLES = [
    { value: 'краткие', label: 'краткие' },
    { value: 'подробные', label: 'подробные' }
  ];
  const CONFIRM_LEVELS = [
    { value: 'перед опасными действиями', label: 'перед опасными действиями' },
    { value: 'перед удалениями', label: 'перед удалениями' },
    { value: 'всегда спрашивать', label: 'всегда спрашивать' }
  ];
  const TEXT_SIZES = [
    { value: 'sm', label: 'Мелкий' }, { value: 'md', label: 'Обычный' }, { value: 'lg', label: 'Крупный' }
  ];
  const THEMES = [
    { value: 'light', label: 'Светлая' }, { value: 'dark', label: 'Тёмная' }, { value: 'system', label: 'Как в системе' }
  ];

  /* Значения, сохранённые раньше или введённые вручную, приводим к списку вариантов,
     чтобы select не оказался «пустым», а форматирование — сломанным. */
  const LEGACY_VALUES = {
    'settings.behavior.confirmation': { 'только перед опасными': 'перед опасными действиями' },
    'profile.locale': { 'ru': 'ru-RU', 'Русский': 'ru-RU' },
    'settings.theme': { 'auto': 'system' },
    'profile.currency': { 'RUB': '₽ (RUB)', 'USD': '$ (USD)', 'EUR': '€ (EUR)' },
    'profile.timeFormat': { '24': '24 ч', '12': '12 ч' }
  };

  /* Описание полей: одно место для подписи, типа, вариантов и проверки.
     Используется экраном настроек, страницей профиля, историей и тестами. */
  const FIELDS = [
    { path: 'profile.name', label: 'Имя', type: 'text', group: 'profile', maxLength: 60, required: true,
      hint: 'как к вам обращаться в отчётах и истории' },
    { path: 'profile.greeting', label: 'Обращение', type: 'text', group: 'profile', maxLength: 60, required: true,
      hint: 'как Aven обращается к вам на Главной' },
    { path: 'profile.locale', label: 'Язык', type: 'select', group: 'profile', options: LANGUAGES },
    { path: 'profile.city', label: 'Регион / город', type: 'text', group: 'profile', maxLength: 80 },
    { path: 'profile.tz', label: 'Часовой пояс', type: 'select', group: 'profile', options: TIMEZONES,
      hint: 'определяет «сейчас»: приветствие, утро/вечер и отметки времени' },
    { path: 'profile.currency', label: 'Валюта', type: 'select', group: 'profile', options: CURRENCIES,
      hint: 'применяется ко всем суммам во всех разделах' },
    { path: 'profile.dateFormat', label: 'Формат даты', type: 'select', group: 'profile', options: DATE_FORMATS },
    { path: 'profile.timeFormat', label: 'Формат времени', type: 'select', group: 'profile', options: TIME_FORMATS },
    { path: 'profile.weekStart', label: 'Начало недели', type: 'select', group: 'profile', options: WEEK_STARTS,
      hint: 'первый столбец в сетке календаря' },

    { path: 'settings.behavior.answers', label: 'Ответы', type: 'select', group: 'aven', options: ANSWER_STYLES },
    { path: 'settings.behavior.confirmation', label: 'Уровень подтверждений', type: 'select', group: 'aven', options: CONFIRM_LEVELS },
    { path: 'settings.behavior.morning', label: '«Утро» начинается в', type: 'time', group: 'aven', order: 1 },
    { path: 'settings.behavior.day', label: '«День» начинается в', type: 'time', group: 'aven', order: 2 },
    { path: 'settings.behavior.evening', label: '«Вечер» начинается в', type: 'time', group: 'aven', order: 3 },
    { path: 'settings.behavior.night', label: '«Ночь» начинается в', type: 'time', group: 'aven', order: 4 },
    { path: 'settings.behavior.afterWork', label: '«После работы» — с', type: 'time', group: 'aven' },

    { path: 'settings.textSize', label: 'Размер текста', type: 'select', group: 'a11y', options: TEXT_SIZES },
    { path: 'settings.theme', label: 'Тема оформления', type: 'select', group: 'a11y', options: THEMES },

    { path: 'settings.notify.quietFrom', label: 'Тихие часы — с', type: 'time', group: 'notify' },
    { path: 'settings.notify.quietTo', label: 'Тихие часы — до', type: 'time', group: 'notify' },
    { path: 'settings.notify.horizonDays', label: 'Горизонт напоминаний, дней', type: 'number', group: 'notify', min: 1, max: 60 }
  ];

  /* Подписи для переключателей и прочих путей: слой действий не должен зависеть от
     того, что написано в разметке экрана. */
  const SETTING_LABELS = {
    'settings.daily.morning': 'Показывать утренний обзор',
    'settings.daily.evening': 'Показывать вечерний обзор',
    'settings.character.enabled': 'Показывать персонажа',
    'settings.character.id': 'Персонаж',
    'settings.character.name': 'Своё имя персонажа',
    'settings.character.floating': 'Плавающий Aven',
    'settings.character.greet': 'Приветствие при запуске',
    'settings.character.voiceProfile': 'Голосовой профиль персонажа',
    'settings.voice.enabled': 'Голосовые ответы',
    'settings.voice.alwaysVoice': 'Всегда отвечать голосом',
    'settings.voice.voiceURI': 'Системный голос',
    'settings.voice.engine': 'Движок озвучивания',
    'settings.voice.rate': 'Скорость речи',
    'settings.voice.pitch': 'Высота голоса',
    'settings.voice.volume': 'Громкость',
    'settings.voice.natural.voice': 'Голос Natural',
    'settings.voice.natural.serverUrl': 'Адрес сервера озвучки',
    'settings.voice.natural.timeoutSec': 'Таймаут сервера озвучки, с',
    'settings.voice.natural.cache': 'Кэш озвучки',
    'settings.voice.stt.enabled': 'Голосовой ввод (STT)',
    'settings.voice.stt.interim': 'Промежуточный текст',
    'settings.voice.stt.autoSend': 'Автоотправка распознанного',
    'settings.notify.inapp': 'Уведомления в приложении',
    'settings.notify.voiceAllowed': 'Произносить уведомления голосом',
    'settings.notify.quietHours': 'Тихие часы',
    'settings.notify.soundBefore': 'Звук перед голосом',
    'settings.suggestions.enabled': 'Предложения Aven',
    'settings.reduceMotion': 'Уменьшить анимации',
    'settings.experiments.canvas': 'Automation Canvas (превью)',
    'settings.experiments.aiRouter': 'AI Router (заглушка)',
    'settings.experiments.geoReminders': 'Гео-напоминания'
  };
  const SETTING_LABEL_PREFIX = [
    ['settings.modules.', 'Модуль'],
    ['settings.homeCards.', 'Карточка Главной'],
    ['settings.notify.sources.', 'Источник уведомлений']
  ];
  /* Настройки, которые PROJECT_PLAN №19 относит к чувствительным: приватность,
     безопасность, удаление данных, роли и права. */
  const SENSITIVE_PREFIX = ['privacy.', 'settings.privacy', 'settings.notify.privateInfo', 'auth.'];

  function getPath(root, path) {
    const parts = String(path || '').split('.');
    let o = root;
    for (let i = 0; i < parts.length; i++) {
      if (o == null || typeof o !== 'object') return undefined;
      o = o[parts[i]];
    }
    return o;
  }
  function setPath(root, path, value) {
    const parts = String(path || '').split('.');
    const key = parts.pop();
    let o = root;
    for (let i = 0; i < parts.length; i++) {
      if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[key] = value;
    return true;
  }
  function fieldByPath(path) { return FIELDS.filter((f) => f.path === path)[0] || null; }
  function fieldsOf(group) { return FIELDS.filter((f) => f.group === group).map((f) => Object.assign({}, f)); }
  function labelOf(path, fallback) {
    const f = fieldByPath(path);
    if (f) return f.label;
    if (SETTING_LABELS[path]) return SETTING_LABELS[path];
    for (let i = 0; i < SETTING_LABEL_PREFIX.length; i++) {
      const p = SETTING_LABEL_PREFIX[i];
      if (path.indexOf(p[0]) === 0) return p[1] + ' «' + path.slice(p[0].length) + '»';
    }
    return fallback || path;
  }
  function isSensitive(path) {
    return SENSITIVE_PREFIX.some((p) => String(path || '').indexOf(p) === 0);
  }
  function optionOf(list, value) { return (list || []).filter((o) => o.value === value)[0] || null; }
  function normalizeStored(path, value) {
    const legacy = LEGACY_VALUES[path];
    if (legacy && legacy[value] != null) return legacy[value];
    return value;
  }
  /* Прочитать значение настройки/профиля с учётом устаревших вариантов и значения по умолчанию. */
  function readValue(path) {
    const f = fieldByPath(path);
    let v = normalizeStored(path, getPath(s(), path));
    if (f && f.type === 'select' && f.options && !optionOf(f.options, v)) {
      const first = f.options.filter((o) => !o.disabled)[0];
      if (v == null || v === '') v = first ? first.value : v;
    }
    return v;
  }
  function displayValue(path, value) {
    const f = fieldByPath(path);
    if (typeof value === 'boolean') return value ? 'включено' : 'выключено';
    if (value == null || value === '') return '—';
    if (f && f.type === 'select') {
      const o = optionOf(f.options, value);
      if (o) return String(o.label).split(' — ')[0];
    }
    return String(value);
  }

  /* --------- проверка значения (одна для UI, будущих команд и тестов) --------- */
  function validateField(path, raw) {
    const f = fieldByPath(path);
    if (!f) return { ok: true, value: raw };
    if (f.type === 'text') {
      const v = String(raw == null ? '' : raw).trim();
      if (f.required && !v) return { ok: false, code: 'VALUE_REQUIRED', message: f.label + ': значение не может быть пустым' };
      if (f.maxLength && v.length > f.maxLength) return { ok: false, code: 'VALUE_TOO_LONG', message: f.label + ': не длиннее ' + f.maxLength + ' символов' };
      if (f.email && v && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v)) return { ok: false, code: 'VALUE_NOT_EMAIL', message: f.label + ': нужен адрес вида имя@пример.ру' };
      return { ok: true, value: v };
    }
    if (f.type === 'select') {
      const v = normalizeStored(path, String(raw == null ? '' : raw));
      const o = optionOf(f.options, v);
      if (!o) return { ok: false, code: 'VALUE_NOT_ALLOWED', message: f.label + ': такого варианта нет в списке' };
      if (o.disabled) return { ok: false, code: 'VALUE_NOT_AVAILABLE', message: f.label + ': вариант «' + o.label + '» пока недоступен' };
      return { ok: true, value: v };
    }
    if (f.type === 'time') {
      const v = normalizeTime(raw);
      if (!v) return { ok: false, code: 'VALUE_NOT_TIME', message: f.label + ': нужно время в виде ЧЧ:ММ' };
      if (f.order) {
        const order = FIELDS.filter((x) => x.order).sort((a, b) => a.order - b.order);
        const planned = order.map((x) => (x.path === path ? v : normalizeTime(getPath(s(), x.path))));
        for (let i = 1; i < planned.length; i++) {
          if (planned[i] <= planned[i - 1]) {
            return { ok: false, code: 'TIME_ORDER', message: 'Границы суток должны идти по возрастанию: утро → день → вечер → ночь' };
          }
        }
      }
      return { ok: true, value: v };
    }
    if (f.type === 'number') {
      const n = Math.round(Number(raw));
      if (!isFinite(n)) return { ok: false, code: 'VALUE_NOT_NUMBER', message: f.label + ': нужно число' };
      if (f.min != null && n < f.min) return { ok: false, code: 'VALUE_TOO_SMALL', message: f.label + ': не меньше ' + f.min };
      if (f.max != null && n > f.max) return { ok: false, code: 'VALUE_TOO_BIG', message: f.label + ': не больше ' + f.max };
      return { ok: true, value: n };
    }
    return { ok: true, value: raw };
  }

  /* --------- единая запись значения --------- */
  function writeValue(path, raw, opts) {
    opts = opts || {};
    const isProfile = String(path || '').indexOf('profile.') === 0;
    const action = opts.action || (isProfile ? 'profile.update' : 'settings.update');
    if (!path) return err(action, 'PATH_REQUIRED', 'Не указано, что менять');
    const check = validateField(path, raw);
    if (!check.ok) return err(action, check.code, check.message, { path });
    const value = check.value;
    const prev = getPath(s(), path);
    const label = opts.label || labelOf(path);
    if (same(prev, value)) {
      return ok(action, { path, value, label }, { unchanged: true, previous: prev, entry: null });
    }
    setPath(s(), path, value);
    save();
    let entry = null;
    if (opts.silent !== true) {
      entry = log({
        action, title: isProfile ? 'Профиль изменён' : 'Настройка изменена',
        object: (isProfile ? 'Профиль · ' : 'Настройки · ') + label,
        objectType: 'settings', source: opts.source || 'ui',
        undoable: true, sensitive: opts.sensitive != null ? !!opts.sensitive : isSensitive(path),
        changes: [{ field: label, from: displayValue(path, prev), to: displayValue(path, value) }],
        undo: { type: 'value', path, value: prev === undefined ? null : prev }
      });
    }
    return ok(action, { path, value, label }, { entry, previous: prev });
  }

  function setProfileField(field, raw, opts) {
    const path = String(field || '').indexOf('profile.') === 0 ? field : 'profile.' + field;
    return writeValue(path, raw, Object.assign({ action: 'profile.update' }, opts || {}));
  }
  function updateProfile(patch, opts) {
    const keys = Object.keys(patch || {});
    const results = [];
    for (let i = 0; i < keys.length; i++) {
      const r = setProfileField(keys[i], patch[keys[i]], opts);
      if (!r.ok) return r;
      results.push(r);
    }
    return ok('profile.update', getProfile(), { results, changed: results.filter((r) => !r.unchanged).length });
  }
  function getProfile() {
    const p = Object.assign({}, s().profile || {});
    fieldsOf('profile').forEach((f) => { p[f.path.split('.')[1]] = readValue(f.path); });
    return p;
  }
  function setSetting(path, raw, opts) {
    const full = String(path || '').indexOf('settings.') === 0 || String(path || '').indexOf('profile.') === 0
      ? path : 'settings.' + path;
    return writeValue(full, raw, opts);
  }
  function getSetting(path) {
    const full = String(path || '').indexOf('settings.') === 0 || String(path || '').indexOf('profile.') === 0
      ? path : 'settings.' + path;
    return readValue(full);
  }

  /* --------- форматы, зависящие от профиля --------- */
  function currencyInfo() {
    return optionOf(CURRENCIES, readValue('profile.currency')) || CURRENCIES[0];
  }
  function money(n) {
    const c = currencyInfo();
    const num = new Intl.NumberFormat(c.locale).format(Math.round(Number(n) || 0));
    return c.position === 'prefix' ? c.sign + num : num + ' ' + c.sign;
  }
  /* Обычный money() округляет до целых — так удобнее читать суммы в списках.
     Но там, где смысл именно в копейках (объяснение точности денег), округление
     превращает 0,30 в «0 ₽» и делает пример неверным. Поэтому здесь — тот же
     формат валюты, но с сохранением копеек. Арифметика не меняется: значение
     по-прежнему считается в целых минимальных единицах. */
  function moneyExact(n) {
    const c = currencyInfo();
    const num = new Intl.NumberFormat(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(minorUnits(n) / 100);
    return c.position === 'prefix' ? c.sign + num : num + ' ' + c.sign;
  }
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function formatDateByProfile(iso) {
    const raw = String(iso || '');
    if (!ISO_RE.test(raw)) {
      if (!raw) return '—';
      const d0 = parseISO(raw);
      if (isNaN(d0.getTime())) return raw;
    }
    const d = parseISO(raw);
    const dd = pad(d.getDate()), mm = pad(d.getMonth() + 1), yyyy = d.getFullYear();
    switch (readValue('profile.dateFormat')) {
      case 'ГГГГ-ММ-ДД': return yyyy + '-' + mm + '-' + dd;
      case 'ММ/ДД/ГГГГ': return mm + '/' + dd + '/' + yyyy;
      case 'Д месяца ГГГГ': return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ' ' + yyyy;
      default: return dd + '.' + mm + '.' + yyyy;
    }
  }
  /* Показ времени. Хранение всегда остаётся 24-часовым ЧЧ:ММ — меняется только отображение. */
  function formatTimeByProfile(hhmm) {
    const v = normalizeTime(hhmm);
    if (!v) return String(hhmm == null ? '' : hhmm);
    if (readValue('profile.timeFormat') !== '12 ч') return v;
    const parts = v.split(':');
    let h = Number(parts[0]);
    const suffix = h < 12 ? 'AM' : 'PM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + parts[1] + ' ' + suffix;
  }
  function weekStartIndex() {
    const o = optionOf(WEEK_STARTS, readValue('profile.weekStart'));
    return o ? o.index : 1;
  }
  function tzOffsetMinutes() {
    const o = optionOf(TIMEZONES, readValue('profile.tz'));
    if (o) return o.offset;
    const m = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(String(readValue('profile.tz') || ''));
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  }
  function tzLabel() {
    const o = optionOf(TIMEZONES, readValue('profile.tz'));
    return o ? o.label : String(readValue('profile.tz') || 'UTC+0');
  }
  /* «Сейчас» в часовом поясе профиля. Это единственное место, где прототип решает,
     который сейчас час: приветствие, утро/вечер и отметки времени берут его отсюда. */
  function nowDate() {
    const d = new Date();
    return new Date(d.getTime() + (d.getTimezoneOffset() + tzOffsetMinutes()) * 60000);
  }
  function nowMinutes() { const d = nowDate(); return d.getHours() * 60 + d.getMinutes(); }
  function nowHM() { const d = nowDate(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* ================= TASKS ================= */
  function taskCompleted(t) { return t ? (t.completed != null ? !!t.completed : (t.done != null ? !!t.done : t.status === 'completed')) : false; }
  function taskStatus(t) { return t && t.status ? t.status : (taskCompleted(t) ? 'completed' : 'active'); }
  function taskDescription(t) { return (t && (t.description != null ? t.description : t.desc)) || ''; }
  function taskPriority(t) { return (t && (t.priority || t.prio)) || 'средний'; }
  function taskTags(t) { return tags(t && t.tags); }
  function taskDate(t) {
    if (!t) return '';
    if (isISODate(t.date)) return t.date;
    if (isISODate(t.deadline)) return t.deadline;
    if (isISODate(t.dueDate)) return t.dueDate;
    if (t.date === 'today') return todayISO();
    if (t.date === 'soon' || t.date === 'tomorrow') return todayISO(1);
    if (t.date === 'yesterday') return todayISO(-1);
    return '';
  }
  function taskDeadline(t) {
    if (!t) return '';
    return normalizeDate(t.deadline || t.dueDate || t.date || '', taskDate(t));
  }
  function taskTime(t) { return normalizeTime((t && (t.time || t.dueTime)) || ''); }
  function taskSnapshot(t) {
    return {
      title: t.title || '',
      description: taskDescription(t), desc: taskDescription(t),
      date: taskDate(t), time: taskTime(t),
      deadline: taskDeadline(t), dueDate: taskDeadline(t), dueTime: taskTime(t),
      priority: taskPriority(t), prio: taskPriority(t), project: t.project || '',
      tags: taskTags(t), completed: taskCompleted(t), done: taskCompleted(t), status: taskStatus(t),
      archived: !!t.archived, reminder: t.reminder || null
    };
  }
  function taskObject(t) { return 'Задача «' + (t.title || 'Без названия') + '»'; }
  function taskDueLabel(t) {
    const d = taskDeadline(t) || taskDate(t);
    if (!d) return 'без срока';
    const tm = taskTime(t);
    return dateLabel(d) + (tm ? ' · ' + formatTimeByProfile(tm) : '');
  }
  function taskChanges(prev, next) {
    const labels = { title: 'Название', description: 'Описание', date: 'Дата', time: 'Время', deadline: 'Дедлайн',
      priority: 'Приоритет', project: 'Проект', tags: 'Теги', completed: 'Статус', status: 'Статус', archived: 'Архив', reminder: 'Напоминание' };
    const keys = ['title', 'description', 'date', 'time', 'deadline', 'priority', 'project', 'tags', 'completed', 'archived', 'reminder'];
    const out = [];
    keys.forEach((k) => {
      const a = prev[k], b = next[k];
      if (!same(a, b)) {
        let from = a, to = b;
        if (k === 'date' || k === 'deadline') { from = a ? humanDate(a) : '—'; to = b ? humanDate(b) : '—'; }
        else if (k === 'tags') { from = (a || []).join(', ') || '—'; to = (b || []).join(', ') || '—'; }
        else if (k === 'completed') { from = a ? 'Выполнена' : 'Открыта'; to = b ? 'Выполнена' : 'Открыта'; }
        else if (k === 'archived') { from = a ? 'в архиве' : 'активна'; to = b ? 'в архиве' : 'активна'; }
        else if (k === 'reminder') { from = reminderLabel(a); to = reminderLabel(b); }
        else { from = String(a || '—'); to = String(b || '—'); }
        out.push({ field: labels[k] || k, from, to });
      }
    });
    return out;
  }
  function applyTaskAliases(task) {
    task.description = task.description != null ? task.description : (task.desc || '');
    task.desc = task.description;
    task.date = normalizeDate(task.date || task.dueDate || task.deadline || '', '');
    task.time = normalizeTime(task.time || task.dueTime || '');
    task.deadline = normalizeDate(task.deadline || task.dueDate || task.date || '', task.date || '');
    task.dueDate = task.deadline || task.date || '';
    task.dueTime = task.time || '';
    task.priority = task.priority || task.prio || 'средний';
    task.prio = task.priority;
    task.tags = taskTags(task);
    task.completed = taskCompleted(task);
    task.done = task.completed;
    task.status = task.completed ? 'completed' : (task.status && task.status !== 'completed' ? task.status : 'active');
    if (task.archived == null) task.archived = false;
    return task;
  }
  function buildTaskFields(params, existing) {
    const ex = existing ? taskSnapshot(existing) : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(params || {}, k);
    const rawDate = has('date') ? params.date : (has('dueDate') ? params.dueDate : (has('deadline') ? params.deadline : ex.date));
    const rawDeadline = has('deadline') ? params.deadline : (has('dueDate') ? params.dueDate : (existing ? ex.deadline : rawDate));
    const rawTime = has('time') ? params.time : (has('dueTime') ? params.dueTime : ex.time);
    const completed = has('completed') ? !!params.completed
      : has('done') ? !!params.done
        : has('status') ? params.status === 'completed'
          : !!ex.completed;
    const status = completed ? 'completed' : (has('status') && params.status && params.status !== 'completed' ? params.status : 'active');
    const date = normalizeDate(rawDate, '');
    const deadline = normalizeDate(rawDeadline, date);
    const time = normalizeTime(rawTime);
    const description = has('description') ? params.description : (has('desc') ? params.desc : (ex.description || ''));
    const priority = has('priority') ? params.priority : (has('prio') ? params.prio : (ex.priority || 'средний'));
    return {
      title: String(has('title') ? params.title : (ex.title || '')).trim(),
      description: description || '', desc: description || '',
      date, time, deadline, dueDate: deadline || date || '', dueTime: time || '',
      priority: priority || 'средний', prio: priority || 'средний',
      project: has('project') ? (params.project || '') : (ex.project || ''),
      tags: has('tags') ? tags(params.tags) : (ex.tags || []),
      completed, done: completed, status,
      archived: has('archived') ? !!params.archived : !!ex.archived,
      reminder: has('reminder') ? normalizeReminder(params.reminder) : (ex.reminder || null)
    };
  }
  function createTask(params, opts) {
    opts = opts || {};
    const st = s(); const list = ensureList(st, 'tasks');
    const fields = buildTaskFields(params || {}, null);
    if (!fields.title) return err('task.create', 'TASK_TITLE_REQUIRED', 'Введите название задачи');
    const now = todayISO();
    const task = applyTaskAliases(Object.assign({ id: S.id('t'), createdISO: now, updatedISO: now }, fields));
    list.unshift(task);
    save();
    const entry = log({
      action: 'task.create', title: 'Задача создана', object: taskObject(task), objectType: 'task', source: opts.source || 'ui', undoable: true,
      changes: [
        { field: 'Название', from: '—', to: task.title },
        { field: 'Дата', from: '—', to: task.date ? humanDate(task.date) : 'не указана' },
        { field: 'Дедлайн', from: '—', to: task.deadline ? humanDate(task.deadline) + (task.time ? ' ' + task.time : '') : 'не указан' },
        { field: 'Приоритет', from: '—', to: task.priority },
        { field: 'Теги', from: '—', to: (task.tags || []).join(', ') || '—' }
      ],
      undo: { type: 'remove', list: 'tasks', id: task.id }
    });
    return ok('task.create', task, { entry });
  }
  function updateTask(id, patch, opts) {
    opts = opts || {};
    const list = ensureList(s(), 'tasks');
    const task = getById(list, id);
    if (!task) return err('task.update', 'TASK_NOT_FOUND', 'Задача не найдена', { id });
    const prev = taskSnapshot(task);
    const next = buildTaskFields(patch || {}, task);
    if (!next.title) return err('task.update', 'TASK_TITLE_REQUIRED', 'Введите название задачи', { id });
    Object.assign(task, next, { updatedISO: todayISO() });
    applyTaskAliases(task);
    save();
    const after = taskSnapshot(task);
    const entry = log({
      action: opts.historyAction || 'task.update', title: opts.title || 'Задача изменена', object: taskObject(task), objectType: 'task', source: opts.source || 'ui',
      undoable: true, changes: taskChanges(prev, after).length ? taskChanges(prev, after) : [{ field: 'Изменений нет', from: '—', to: '—' }],
      undo: { type: 'fields', list: 'tasks', id: task.id, fields: prev }
    });
    return ok(opts.historyAction || 'task.update', task, { entry, previous: prev });
  }
  function setTaskCompleted(id, completed, actionName, title, opts) {
    opts = opts || {};
    const list = ensureList(s(), 'tasks');
    const task = getById(list, id);
    if (!task) return err(actionName, 'TASK_NOT_FOUND', 'Задача не найдена', { id });
    const prev = taskSnapshot(task);
    task.completed = !!completed; task.done = !!completed; task.status = completed ? 'completed' : 'active'; task.updatedISO = todayISO();
    save();
    const entry = log({
      action: actionName, title, object: taskObject(task), objectType: 'task', source: opts.source || 'ui', undoable: true,
      changes: [{ field: 'Статус', from: prev.completed ? 'Выполнена' : 'Открыта', to: completed ? 'Выполнена' : 'Открыта' }],
      undo: { type: 'fields', list: 'tasks', id: task.id, fields: prev }
    });
    return ok(actionName, task, { entry, previous: prev });
  }
  function completeTask(id, opts) { return setTaskCompleted(id, true, 'task.complete', 'Задача выполнена', opts); }
  function reopenTask(id, opts) { return setTaskCompleted(id, false, 'task.reopen', 'Задача снова открыта', opts); }
  function deleteTask(id, opts) {
    opts = opts || {};
    const list = ensureList(s(), 'tasks');
    const i = indexOfId(list, id);
    if (i < 0) return err('task.delete', 'TASK_NOT_FOUND', 'Задача не найдена', { id });
    const item = list[i];
    list.splice(i, 1);
    save();
    const entry = log({
      action: 'task.delete', title: 'Задача удалена', object: taskObject(item), objectType: 'task', source: opts.source || 'ui', undoable: true, danger: true,
      changes: [{ field: 'Состояние', from: taskCompleted(item) ? 'Выполнена' : 'Открыта', to: 'Удалена' }],
      undo: { type: 'restore', list: 'tasks', index: i, item: clone(item) }
    });
    return ok('task.delete', item, { entry, index: i });
  }
  function getTask(id) {
    const task = getById(ensureList(s(), 'tasks'), id);
    return task ? ok('task.get', task) : err('task.get', 'TASK_NOT_FOUND', 'Задача не найдена', { id });
  }
  function taskSort(a, b) {
    if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
    if (taskCompleted(a) !== taskCompleted(b)) return taskCompleted(a) ? 1 : -1;
    const da = taskDeadline(a) || taskDate(a) || '9999-99-99';
    const db = taskDeadline(b) || taskDate(b) || '9999-99-99';
    if (da !== db) return da.localeCompare(db);
    const ta = taskTime(a) || '23:59', tb = taskTime(b) || '23:59';
    if (ta !== tb) return ta.localeCompare(tb);
    const rank = { 'высокий': 0, high: 0, 'средний': 1, medium: 1, 'низкий': 2, low: 2 };
    const pa = rank[taskPriority(a)] == null ? 1 : rank[taskPriority(a)];
    const pb = rank[taskPriority(b)] == null ? 1 : rank[taskPriority(b)];
    if (pa !== pb) return pa - pb;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
  }
  function getTasks(filters) {
    filters = filters || {};
    const today = normalizeDate(filters.today || filters.dateBase || todayISO(), todayISO());
    let list = ensureList(s(), 'tasks').slice();
    if (filters.includeArchived !== true) list = list.filter((t) => !t.archived);
    if (filters.archived != null) list = list.filter((t) => !!t.archived === !!filters.archived);
    if (filters.completed != null) list = list.filter((t) => taskCompleted(t) === !!filters.completed);
    if (filters.status) {
      if (filters.status === 'active') list = list.filter((t) => !taskCompleted(t) && !t.archived);
      else if (filters.status === 'completed' || filters.status === 'done') list = list.filter((t) => taskCompleted(t));
      else if (filters.status === 'overdue') list = list.filter((t) => !taskCompleted(t) && (taskDeadline(t) || taskDate(t)) && diffDays(taskDeadline(t) || taskDate(t), today) < 0);
      else if (filters.status === 'today') list = list.filter((t) => !taskCompleted(t) && (taskDeadline(t) || taskDate(t)) === today);
      else if (filters.status === 'upcoming') list = list.filter((t) => !taskCompleted(t) && (!(taskDeadline(t) || taskDate(t)) || diffDays(taskDeadline(t) || taskDate(t), today) > 0));
    }
    if (filters.date) {
      const d = normalizeDate(filters.date, '');
      list = list.filter((t) => (taskDate(t) === d) || (taskDeadline(t) === d));
    }
    if (filters.fromDate) list = list.filter((t) => (taskDeadline(t) || taskDate(t) || '9999-99-99') >= filters.fromDate);
    if (filters.toDate) list = list.filter((t) => (taskDeadline(t) || taskDate(t) || '0000-00-00') <= filters.toDate);
    if (filters.priority && filters.priority !== 'all') list = list.filter((t) => taskPriority(t) === filters.priority);
    if (filters.tag && filters.tag !== 'all') list = list.filter((t) => taskTags(t).indexOf(filters.tag) >= 0);
    if (filters.project && filters.project !== 'all') list = list.filter((t) => (t.project || '') === filters.project);
    const q = String(filters.q || '').trim().toLowerCase();
    if (q) list = list.filter((t) => [t.title, taskDescription(t), t.project, taskPriority(t), taskTags(t).join(' ')].join(' ').toLowerCase().includes(q));
    list.sort(taskSort);
    return ok('tasks.get', list, { items: list, count: list.length });
  }
  function getTasksForDate(date, filters) {
    filters = filters || {};
    const d = normalizeDate(date, todayISO());
    let list = ensureList(s(), 'tasks').filter((t) => !t.archived && (taskDate(t) === d || taskDeadline(t) === d));
    if (filters.includeCompleted === false) list = list.filter((t) => !taskCompleted(t));
    if (filters.completed != null) list = list.filter((t) => taskCompleted(t) === !!filters.completed);
    list.sort(taskSort);
    return ok('tasks.forDate', list, { items: list, date: d, count: list.length });
  }
  function getOverdueTasks(date) {
    const d = normalizeDate(date, todayISO());
    const list = ensureList(s(), 'tasks').filter((t) => !t.archived && !taskCompleted(t) && (taskDeadline(t) || taskDate(t)) && diffDays(taskDeadline(t) || taskDate(t), d) < 0).sort(taskSort);
    return ok('tasks.overdue', list, { items: list, date: d, count: list.length });
  }

  /* ================= EVENTS ================= */
  function eventStart(e) { return normalizeTime((e && (e.startTime || e.time)) || ''); }
  function eventEnd(e) { return normalizeTime((e && (e.endTime || e.end)) || ''); }
  function eventDesc(e) { return (e && (e.description != null ? e.description : e.desc)) || ''; }
  function eventTime(e) { return e && e.allDay ? 'весь день' : (formatTimeByProfile(eventStart(e)) || 'без времени'); }
  function eventObject(e) { return 'Событие «' + (e.title || 'Без названия') + '» · ' + humanDate(e.date) + (e.allDay ? ' · весь день' : (eventStart(e) ? ' · ' + formatTimeByProfile(eventStart(e)) : '')); }
  function repeatLabel(e) { return ({ daily: 'ежедневно', weekly: 'еженедельно', monthly: 'ежемесячно', yearly: 'ежегодно' }[(e && e.repeat) || 'none']) || ''; }
  function reminderLabel(r) {
    if (!r) return 'нет';
    const value = typeof r === 'string' ? r : (r.value || r.when || r.minutesBefore || r.type || 'нет');
    if (value === 'none' || value === '') return 'нет';
    if (value === 'at-time') return 'в момент события';
    if (value === '15m' || Number(value) === 15) return 'за 15 минут';
    if (value === '1h' || Number(value) === 60) return 'за 1 час';
    if (value === '1d' || Number(value) === 1440) return 'за 1 день';
    return String(value);
  }
  function normalizeReminder(v) {
    if (!v || v === 'none') return null;
    if (typeof v === 'object') return clone(v);
    const map = { 'at-time': 0, '15m': 15, '1h': 60, '1d': 1440 };
    return { value: v, minutesBefore: map[v] == null ? null : map[v], delivery: 'prototype-only' };
  }
  function eventSnapshot(e) {
    return {
      title: e.title || '', date: normalizeDate(e.date, todayISO()), startTime: eventStart(e), endTime: eventEnd(e),
      time: eventStart(e), end: eventEnd(e), allDay: !!e.allDay, place: e.place || '',
      description: eventDesc(e), desc: eventDesc(e), importance: e.importance || 'обычная', repeat: e.repeat || 'none',
      reminder: e.reminder || null, category: e.category || 'Личное', color: e.color || '', archived: !!e.archived
    };
  }
  function applyEventAliases(ev) {
    ev.date = normalizeDate(ev.date, todayISO());
    ev.startTime = ev.allDay ? '' : eventStart(ev);
    ev.endTime = ev.allDay ? '' : eventEnd(ev);
    ev.time = ev.startTime; ev.end = ev.endTime;
    ev.description = eventDesc(ev); ev.desc = ev.description;
    ev.importance = ev.importance || 'обычная';
    ev.repeat = ev.repeat || 'none';
    ev.category = ev.category || 'Личное';
    ev.color = ev.color || '';
    ev.reminder = normalizeReminder(ev.reminder);
    return ev;
  }
  function buildEventFields(params, existing) {
    const ex = existing ? eventSnapshot(existing) : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(params || {}, k);
    const allDay = has('allDay') ? !!params.allDay : !!ex.allDay;
    const start = allDay ? '' : normalizeTime(has('startTime') ? params.startTime : (has('time') ? params.time : (ex.startTime || '')));
    const end = allDay ? '' : normalizeTime(has('endTime') ? params.endTime : (has('end') ? params.end : (ex.endTime || '')));
    const description = has('description') ? params.description : (has('desc') ? params.desc : (ex.description || ''));
    return {
      title: String(has('title') ? params.title : (ex.title || '')).trim(),
      date: normalizeDate(has('date') ? params.date : ex.date, todayISO()),
      startTime: start, endTime: end, time: start, end,
      allDay, place: has('place') ? (params.place || '').trim() : (ex.place || ''),
      description: description || '', desc: description || '',
      importance: has('importance') ? (params.importance || 'обычная') : (ex.importance || 'обычная'),
      repeat: has('repeat') ? (params.repeat || 'none') : (ex.repeat || 'none'),
      reminder: has('reminder') ? normalizeReminder(params.reminder) : (ex.reminder || null),
      category: has('category') ? (params.category || 'Личное') : (ex.category || 'Личное'),
      color: has('color') ? (params.color || '') : (ex.color || '')
    };
  }
  function eventChanges(prev, next) {
    const labels = { title: 'Название', date: 'Дата', startTime: 'Начало', endTime: 'Окончание', allDay: 'Весь день',
      place: 'Место', description: 'Описание', importance: 'Важность', repeat: 'Повторение', reminder: 'Напоминание', category: 'Категория', color: 'Цвет' };
    const keys = ['title', 'date', 'startTime', 'endTime', 'allDay', 'place', 'description', 'importance', 'repeat', 'reminder', 'category', 'color'];
    const out = [];
    keys.forEach((k) => {
      const a = prev[k], b = next[k];
      if (!same(a, b)) {
        let from = a, to = b;
        if (k === 'date') { from = a ? humanDate(a) : '—'; to = b ? humanDate(b) : '—'; }
        else if (k === 'allDay') { from = a ? 'да' : 'нет'; to = b ? 'да' : 'нет'; }
        else if (k === 'repeat') { from = repeatLabel({ repeat: a }) || 'нет'; to = repeatLabel({ repeat: b }) || 'нет'; }
        else if (k === 'reminder') { from = reminderLabel(a); to = reminderLabel(b); }
        else { from = String(a || '—'); to = String(b || '—'); }
        out.push({ field: labels[k] || k, from, to });
      }
    });
    return out;
  }
  function eventOccursOn(e, iso) {
    if (!e || !e.date || !iso) return false;
    const delta = diffDays(iso, e.date);
    if (delta < 0) return false;
    if (e.repeat === 'daily') return true;
    if (e.repeat === 'weekly') return delta % 7 === 0;
    if (e.repeat === 'monthly') return parseISO(iso).getDate() === parseISO(e.date).getDate();
    if (e.repeat === 'yearly') {
      const a = parseISO(iso), b = parseISO(e.date);
      return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    }
    return e.date === iso;
  }
  function eventSort(a, b) {
    const aa = a.allDay ? '00:00' : (eventStart(a) || '23:59');
    const bb = b.allDay ? '00:00' : (eventStart(b) || '23:59');
    return aa.localeCompare(bb) || String(a.title || '').localeCompare(String(b.title || ''), 'ru');
  }
  function createEvent(params, opts) {
    opts = opts || {};
    const st = s(); const list = ensureList(st, 'events');
    const fields = buildEventFields(params || {}, null);
    if (!fields.title) return err('event.create', 'EVENT_TITLE_REQUIRED', 'Введите название события');
    if (!fields.date) return err('event.create', 'EVENT_DATE_REQUIRED', 'Выберите дату события');
    const ev = applyEventAliases(Object.assign({ id: S.id('e'), createdISO: todayISO(), updatedISO: todayISO() }, fields));
    list.unshift(ev);
    save();
    const entry = log({
      action: 'event.create', title: 'Событие создано', object: eventObject(ev), objectType: 'event', source: opts.source || 'ui', undoable: true,
      changes: [
        { field: 'Название', from: '—', to: ev.title },
        { field: 'Дата', from: '—', to: humanDate(ev.date) },
        { field: 'Время', from: '—', to: eventTime(ev) },
        { field: 'Категория', from: '—', to: ev.category },
        { field: 'Напоминание', from: '—', to: reminderLabel(ev.reminder) }
      ],
      undo: { type: 'remove', list: 'events', id: ev.id }
    });
    return ok('event.create', ev, { entry });
  }
  function updateEvent(id, patch, opts) {
    opts = opts || {};
    const list = ensureList(s(), 'events');
    const ev = getById(list, id);
    if (!ev) return err('event.update', 'EVENT_NOT_FOUND', 'Событие не найдено', { id });
    const prev = eventSnapshot(ev);
    const fields = buildEventFields(patch || {}, ev);
    if (!fields.title) return err('event.update', 'EVENT_TITLE_REQUIRED', 'Введите название события', { id });
    Object.assign(ev, fields, { updatedISO: todayISO() });
    applyEventAliases(ev);
    save();
    const after = eventSnapshot(ev);
    const changes = eventChanges(prev, after);
    const entry = log({
      action: 'event.update', title: 'Событие изменено', object: eventObject(ev), objectType: 'event', source: opts.source || 'ui', undoable: true,
      changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
      undo: { type: 'fields', list: 'events', id: ev.id, fields: prev }
    });
    return ok('event.update', ev, { entry, previous: prev });
  }
  function deleteEvent(id, opts) {
    opts = opts || {};
    const list = ensureList(s(), 'events');
    const i = indexOfId(list, id);
    if (i < 0) return err('event.delete', 'EVENT_NOT_FOUND', 'Событие не найдено', { id });
    const item = list[i];
    list.splice(i, 1);
    save();
    const entry = log({
      action: 'event.delete', title: 'Событие удалено', object: eventObject(item), objectType: 'event', source: opts.source || 'ui',
      undoable: true, danger: true, changes: [{ field: 'Состояние', from: 'в календаре', to: 'Удалено' }],
      undo: { type: 'restore', list: 'events', index: i, item: clone(item) }
    });
    return ok('event.delete', item, { entry, index: i });
  }
  function getEvent(id) {
    const ev = getById(ensureList(s(), 'events'), id);
    return ev ? ok('event.get', ev) : err('event.get', 'EVENT_NOT_FOUND', 'Событие не найдено', { id });
  }
  function getEvents(filters) {
    filters = filters || {};
    let list = ensureList(s(), 'events').slice();
    if (filters.category && filters.category !== 'all') list = list.filter((e) => (e.category || 'Личное') === filters.category);
    const q = String(filters.q || '').trim().toLowerCase();
    if (q) list = list.filter((e) => [e.title, e.place, eventDesc(e), e.category].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || eventSort(a, b));
    return ok('events.get', list, { items: list, count: list.length });
  }
  function getEventsForDate(date) {
    const d = normalizeDate(date, todayISO());
    const items = ensureList(s(), 'events').filter((e) => eventOccursOn(e, d)).sort(eventSort);
    return ok('events.forDate', items, { items, date: d, count: items.length });
  }
  function getAgenda(opts) {
    opts = opts || {};
    const from = normalizeDate(opts.fromDate, todayISO());
    const days = Math.max(1, Math.min(366, Number(opts.days) || 45));
    const limit = Number(opts.limit) || 100;
    const out = [];
    for (let i = 0; i < days && out.length < limit; i++) {
      const date = addDays(from, i);
      getEventsForDate(date).items.forEach((event) => out.push({ event, date }));
    }
    return ok('events.agenda', out, { items: out, fromDate: from, count: out.length });
  }
  function getNextEvent(opts) {
    opts = opts || {};
    const item = getAgenda({ fromDate: opts.fromDate || todayISO(), days: opts.days || 45, limit: 1 }).items[0] || null;
    return item ? ok('event.next', item.event, { item, date: item.date }) : err('event.next', 'EVENT_NOT_FOUND', 'Ближайших событий нет');
  }

  /* ================= ДЕНЬГИ =================
     Одно место для правил денег: суммы считаются в минимальных единицах валюты
     (копейки/центы), поэтому 0.1 + 0.2 даёт ровно 0.30, а не 0.30000000000000004.
     Раньше эти же правила лежали в истории действий (`A.minor`/`A.sumMoney`);
     теперь владелец правил — слой действий, а интерфейс только пользуется ими. */
  function minorUnits(v) { return Math.round((Number(v) || 0) * 100); }
  function sumMoney() {
    let total = 0;
    for (let i = 0; i < arguments.length; i++) total += minorUnits(arguments[i]);
    return total / 100;
  }
  function isBlank(v) { return v === '' || v === null || v === undefined; }
  function isFiniteNumber(v) {
    if (isBlank(v)) return false;
    return isFinite(Number(v));
  }

  /* ================= ЗАМЕТКИ =================
     MVP_SCOPE §4.1 п.5. Экран заметок больше не решает, что допустимо, как назвать
     изменение и что вернёт отмена: он вызывает эти операции — как позже сделает
     разбор текстовой команды. */
  const NOTE_FOLDERS_DEFAULT = ['Личное', 'Идеи', 'Документы'];
  function notesList() { return ensureList(s(), 'notes'); }
  function noteFolderOf(n) { return (n && n.folder) || 'Личное'; }
  function noteFolders() {
    const st = s();
    const base = Array.isArray(st.noteFolders) && st.noteFolders.length ? st.noteFolders : NOTE_FOLDERS_DEFAULT;
    const out = base.slice();
    notesList().forEach((n) => { if (n && n.folder && out.indexOf(n.folder) < 0) out.push(n.folder); });
    return out;
  }
  function noteTagList() {
    const seen = {};
    notesList().forEach((n) => tags(n && n.tags).forEach((t) => { seen[t] = true; }));
    return Object.keys(seen).sort((a, b) => a.localeCompare(b, 'ru'));
  }
  function notePreview(text) {
    const one = String(text || '').replace(/\s+/g, ' ').trim();
    return one.slice(0, 64) + (one.length > 64 ? '…' : '');
  }
  function noteSnapshot(n) {
    return {
      title: (n && n.title) || '', body: (n && n.body) || '', folder: noteFolderOf(n),
      tags: tags(n && n.tags), pinned: !!(n && n.pinned), archived: !!(n && n.archived),
      updated: (n && n.updated) || '', updatedISO: (n && n.updatedISO) || ''
    };
  }
  function noteObject(n) { return 'Заметка «' + ((n && n.title) || 'Без названия') + '»'; }
  function buildNoteFields(params, existing) {
    const ex = existing ? noteSnapshot(existing) : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(params || {}, k);
    return {
      title: String(has('title') ? params.title : (ex.title || '')).trim(),
      body: has('body') ? String(params.body == null ? '' : params.body) : (ex.body || ''),
      folder: String(has('folder') ? (params.folder || '') : (ex.folder || '')).trim() || 'Личное',
      tags: has('tags') ? tags(params.tags) : (ex.tags || []),
      pinned: has('pinned') ? !!params.pinned : !!ex.pinned,
      archived: has('archived') ? !!params.archived : !!ex.archived
    };
  }
  function noteChanges(prev, next) {
    const out = [];
    if (prev.title !== next.title) out.push({ field: 'Заголовок', from: prev.title || '—', to: next.title || '—' });
    if (prev.folder !== next.folder) out.push({ field: 'Папка', from: prev.folder || '—', to: next.folder || '—' });
    if ((prev.tags || []).join(', ') !== (next.tags || []).join(', ')) {
      out.push({ field: 'Теги', from: (prev.tags || []).join(', ') || '—', to: (next.tags || []).join(', ') || '—' });
    }
    if (!!prev.pinned !== !!next.pinned) out.push({ field: 'Закрепление', from: prev.pinned ? 'закреплена' : 'обычная', to: next.pinned ? 'закреплена' : 'обычная' });
    if (!!prev.archived !== !!next.archived) out.push({ field: 'Архив', from: prev.archived ? 'в архиве' : 'активна', to: next.archived ? 'в архиве' : 'активна' });
    if (String(prev.body || '') !== String(next.body || '')) {
      out.push({ field: 'Текст', from: prev.body ? notePreview(prev.body) : '—', to: next.body ? notePreview(next.body) : '—' });
    }
    return out;
  }
  function validateNote(fields) {
    if (!fields.title) return { ok: false, code: 'NOTE_TITLE_REQUIRED', message: 'Введите название заметки' };
    if (fields.title.length > 120) return { ok: false, code: 'NOTE_TITLE_TOO_LONG', message: 'Название заметки: не длиннее 120 символов' };
    return { ok: true };
  }
  function createNote(params, opts) {
    opts = opts || {};
    const fields = buildNoteFields(params || {}, null);
    const check = validateNote(fields);
    if (!check.ok) return err('note.create', check.code, check.message);
    const now = todayISO();
    const note = Object.assign({ id: S.id('n') }, fields, { updated: 'только что', updatedISO: now, createdISO: now });
    notesList().unshift(note);
    save();
    const entry = log({
      action: 'note.create', title: 'Заметка создана', object: noteObject(note), objectType: 'note',
      source: opts.source || 'ui', undoable: true, sensitive: true,
      changes: [
        { field: 'Заголовок', from: '—', to: note.title },
        { field: 'Папка', from: '—', to: note.folder },
        { field: 'Теги', from: '—', to: (note.tags || []).join(', ') || '—' }
      ],
      undo: { type: 'remove', list: 'notes', id: note.id }
    });
    return ok('note.create', note, { entry });
  }
  function updateNote(id, patch, opts) {
    opts = opts || {};
    const note = getById(notesList(), id);
    if (!note) return err('note.update', 'NOTE_NOT_FOUND', 'Заметка не найдена', { id });
    const prev = noteSnapshot(note);
    const fields = buildNoteFields(patch || {}, note);
    const check = validateNote(fields);
    if (!check.ok) return err('note.update', check.code, check.message, { id });
    const touched = String(prev.body || '') !== String(fields.body || '') || prev.title !== fields.title ||
      prev.folder !== fields.folder || (prev.tags || []).join(',') !== (fields.tags || []).join(',') ||
      !!prev.archived !== !!fields.archived;
    Object.assign(note, fields);
    if (touched) { note.updated = 'только что'; note.updatedISO = todayISO(); }
    save();
    const after = noteSnapshot(note);
    const changes = noteChanges(prev, after);
    const entry = log({
      action: opts.historyAction || 'note.update', title: opts.title || 'Заметка изменена', object: noteObject(note),
      objectType: 'note', source: opts.source || 'ui', undoable: true, sensitive: true,
      changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
      undo: { type: 'fields', list: 'notes', id: note.id, fields: prev }
    });
    return ok(opts.historyAction || 'note.update', note, { entry, previous: prev });
  }
  function setNotePinned(id, pinned, opts) {
    const note = getById(notesList(), id);
    if (!note) return err('note.update', 'NOTE_NOT_FOUND', 'Заметка не найдена', { id });
    const value = pinned == null ? !note.pinned : !!pinned;
    return updateNote(id, { pinned: value }, Object.assign({
      title: value ? 'Заметка закреплена' : 'Закрепление снято'
    }, opts || {}));
  }
  function setNoteArchived(id, archived, opts) {
    const note = getById(notesList(), id);
    if (!note) return err('note.update', 'NOTE_NOT_FOUND', 'Заметка не найдена', { id });
    const value = archived == null ? !note.archived : !!archived;
    return updateNote(id, { archived: value }, Object.assign({
      title: value ? 'Заметка отправлена в архив' : 'Заметка возвращена из архива'
    }, opts || {}));
  }
  /* Автосохранение текста — это то же изменение заметки, просто с другим названием
     в истории. Отдельного пути записи для него нет. */
  function saveNoteBody(id, body, opts) {
    const note = getById(notesList(), id);
    if (!note) return err('note.autosave', 'NOTE_NOT_FOUND', 'Заметка не найдена', { id });
    if (String(note.body || '') === String(body == null ? '' : body)) {
      return ok('note.autosave', note, { unchanged: true, entry: null });
    }
    return updateNote(id, { body }, Object.assign({
      historyAction: 'note.autosave', title: 'Заметка автосохранена'
    }, opts || {}));
  }
  function deleteNote(id, opts) {
    opts = opts || {};
    const list = notesList();
    const i = indexOfId(list, id);
    if (i < 0) return err('note.delete', 'NOTE_NOT_FOUND', 'Заметка не найдена', { id });
    const item = list[i];
    list.splice(i, 1);
    save();
    const entry = log({
      action: 'note.delete', title: 'Заметка удалена', object: noteObject(item), objectType: 'note',
      source: opts.source || 'ui', undoable: true, danger: true, sensitive: true,
      changes: [{ field: 'Состояние', from: 'в списке', to: 'Удалена' }],
      undo: { type: 'restore', list: 'notes', index: i, item: clone(item) }
    });
    return ok('note.delete', item, { entry, index: i });
  }
  function getNote(id) {
    const n = getById(notesList(), id);
    return n ? ok('note.get', n) : err('note.get', 'NOTE_NOT_FOUND', 'Заметка не найдена', { id });
  }
  function getNotes(filters) {
    filters = filters || {};
    const status = filters.status || 'all';
    const q = String(filters.q || '').trim().toLowerCase();
    const items = notesList().filter((n) => {
      if (status === 'active' && n.archived) return false;
      if (status === 'archived' && !n.archived) return false;
      if (filters.folder && filters.folder !== 'all' && noteFolderOf(n) !== filters.folder) return false;
      if (filters.tag && filters.tag !== 'all' && tags(n.tags).indexOf(filters.tag) < 0) return false;
      if (!q) return true;
      return [n.title, n.body, noteFolderOf(n), tags(n.tags).join(' ')].join(' ').toLowerCase().includes(q);
    }).sort((a, b) =>
      (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      String(b.updatedISO || '').localeCompare(String(a.updatedISO || '')) ||
      String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
    return ok('notes.get', items, { items, count: items.length });
  }
  function notesSummary() {
    const list = notesList();
    return {
      total: list.length,
      active: list.filter((n) => !n.archived).length,
      archived: list.filter((n) => !!n.archived).length,
      pinned: list.filter((n) => n.pinned && !n.archived).length,
      folders: noteFolders().length
    };
  }
  function createNoteFolder(name, opts) {
    opts = opts || {};
    const st = s();
    const value = String(name || '').trim();
    if (!value) return err('note.folder.create', 'FOLDER_NAME_REQUIRED', 'Введите название папки');
    if (value.length > 60) return err('note.folder.create', 'FOLDER_NAME_TOO_LONG', 'Название папки: не длиннее 60 символов');
    const prev = (Array.isArray(st.noteFolders) && st.noteFolders.length ? st.noteFolders : NOTE_FOLDERS_DEFAULT).slice();
    if (prev.some((x) => String(x).toLowerCase() === value.toLowerCase())) {
      return err('note.folder.create', 'FOLDER_EXISTS', 'Папка «' + value + '» уже есть');
    }
    st.noteFolders = prev.concat([value]);
    save();
    const entry = log({
      action: 'note.folder.create', title: 'Папка заметок создана', object: 'Папка «' + value + '»',
      objectType: 'note', source: opts.source || 'ui', undoable: true,
      changes: [{ field: 'Папка', from: '—', to: value }],
      undo: { type: 'value', path: 'noteFolders', value: prev }
    });
    return ok('note.folder.create', { name: value }, { entry });
  }

  /* ================= ФИНАНСЫ =================
     MVP_SCOPE §4.1 п.6, §5.6. Главный принцип этапа: суммы вверху экрана,
     суммы по фильтру, график и карточки на «Главной» считаются из одних и тех же
     операций. Отдельного «сохранённого итога месяца», который мог разойтись
     с операциями, больше нет — итоги вычисляются запросами. */
  const FIN_CATEGORIES_DEFAULT = ['Авто', 'Продукты', 'Дом', 'Подписки', 'Другое', 'Доход'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONTHS_FULL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  function opsList() { return ensureList(s(), 'ops'); }
  function finAccountsList() { return ensureList(s(), 'finAccounts'); }
  function finCategoriesList() {
    const st = s();
    if (!Array.isArray(st.finCategories) || !st.finCategories.length) st.finCategories = FIN_CATEGORIES_DEFAULT.slice();
    return st.finCategories;
  }
  function opDateISO(o) {
    if (!o) return '';
    if (isISODate(o.dateISO)) return o.dateISO;
    if (isISODate(o.date)) return o.date;
    if (o.date === 'сегодня') return todayISO();
    if (o.date === 'вчера') return todayISO(-1);
    return '';
  }
  function finAccount(id) {
    const list = finAccountsList();
    return list.filter((a) => a && a.id === id)[0] || list[0] || { id: 'card', name: 'Основная карта', balance: 0 };
  }
  function finAccountPath(id) {
    const list = finAccountsList();
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return 'finAccounts.' + i + '.balance';
    return null;
  }
  function opSnapshot(o) {
    return {
      type: o.type === 'income' ? 'income' : 'expense', cat: o.cat || '', account: o.account || 'card',
      title: o.title || '', amount: Number(o.amount) || 0, date: o.date || '', dateISO: opDateISO(o),
      comment: o.comment || ''
    };
  }
  /* Баланс счёта — атрибут самого счёта (на нём могут быть деньги, появившиеся до
     начала учёта), поэтому операции его сдвигают. Итоги месяца и общий баланс
     ничего не «накапливают»: они считаются заново по операциям и счетам. */
  function finAccountAdjust(fromOp, toOp) {
    const acc = {};
    if (fromOp && fromOp.account) acc[fromOp.account] = sumMoney(acc[fromOp.account] || 0, fromOp.type === 'income' ? -Number(fromOp.amount || 0) : Number(fromOp.amount || 0));
    if (toOp && toOp.account) acc[toOp.account] = sumMoney(acc[toOp.account] || 0, toOp.type === 'income' ? Number(toOp.amount || 0) : -Number(toOp.amount || 0));
    const out = [];
    Object.keys(acc).forEach((id) => {
      const path = finAccountPath(id);
      if (path && minorUnits(acc[id]) !== 0) out.push({ path, delta: acc[id] });
    });
    return out;
  }
  function applyFinAdjust(adjust) {
    const st = s();
    (adjust || []).forEach((x) => {
      const parts = String(x.path).split('.');
      const key = parts.pop();
      let o = st;
      for (let i = 0; i < parts.length; i++) { if (o == null) return; o = o[parts[i]]; }
      if (o && typeof o[key] === 'number') o[key] = sumMoney(o[key], x.delta);
    });
  }
  function buildOpFields(params, existing) {
    const ex = existing ? opSnapshot(existing) : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(params || {}, k);
    const type = has('type') ? (params.type === 'income' ? 'income' : 'expense') : (ex.type || 'expense');
    const rawAmount = has('amount') ? params.amount : ex.amount;
    /* Дату можно не указывать — тогда это «сегодня» по общим часам приложения
       (так же ведут себя задачи, события и записи авто). Но если дату передали
       и она непонятна — операция не сохраняется, молча подставлять нельзя. */
    const hasDate = has('dateISO') || has('date');
    const dateISO = hasDate ? (has('dateISO') ? params.dateISO : params.date)
      : (ex.dateISO != null && ex.dateISO !== '' ? ex.dateISO : todayISO());
    const cat = String(has('cat') ? (params.cat || '') : (has('category') ? (params.category || '') : (ex.cat || ''))).trim();
    return {
      type,
      cat: cat || (type === 'income' ? 'Доход' : (finCategoriesList()[0] || 'Другое')),
      account: String(has('account') ? (params.account || '') : (ex.account || '')).trim() || ((finAccountsList()[0] || {}).id || 'card'),
      title: String(has('title') ? (params.title || '') : (ex.title || '')).trim(),
      rawAmount,
      amount: minorUnits(rawAmount) / 100,
      dateISO: normalizeDate(dateISO, ''),
      comment: String(has('comment') ? (params.comment || '') : (ex.comment || '')).trim()
    };
  }
  function validateOperation(fields) {
    if (isBlank(fields.rawAmount)) return { ok: false, code: 'AMOUNT_REQUIRED', message: 'Введите сумму' };
    if (!isFiniteNumber(fields.rawAmount)) return { ok: false, code: 'AMOUNT_INVALID', message: 'Сумма: нужно число' };
    if (!(minorUnits(fields.rawAmount) > 0)) return { ok: false, code: 'AMOUNT_INVALID', message: 'Сумма должна быть больше нуля' };
    if (!fields.dateISO) return { ok: false, code: 'DATE_INVALID', message: 'Выберите дату операции' };
    if (!finAccountsList().some((a) => a && a.id === fields.account)) {
      return { ok: false, code: 'ACCOUNT_NOT_FOUND', message: 'Такого счёта нет — выберите счёт из списка' };
    }
    if (finCategoriesList().indexOf(fields.cat) < 0) {
      return { ok: false, code: 'CATEGORY_NOT_FOUND', message: 'Такой категории нет — выберите категорию из списка' };
    }
    return { ok: true };
  }
  function opObject(o) {
    return (o.type === 'income' ? 'Доход' : 'Расход') + ' «' + (o.title || o.cat || 'операция') + '» · ' + money(o.amount);
  }
  function opChanges(prev, next) {
    const labels = { type: 'Тип', cat: 'Категория', account: 'Счёт', title: 'Название', amount: 'Сумма', dateISO: 'Дата', comment: 'Комментарий' };
    const fmt = (k, v) => k === 'amount' ? money(v) : k === 'dateISO' ? (v ? humanDate(v) : '—')
      : k === 'account' ? finAccount(v).name : k === 'type' ? (v === 'income' ? 'Доход' : 'Расход') : (v || '—');
    return ['type', 'cat', 'account', 'title', 'amount', 'dateISO', 'comment'].reduce((acc, k) => {
      const a = prev[k], b = next[k];
      const differs = k === 'amount' ? minorUnits(a) !== minorUnits(b) : String(a == null ? '' : a) !== String(b == null ? '' : b);
      if (differs) acc.push({ field: labels[k], from: fmt(k, a), to: fmt(k, b) });
      return acc;
    }, []);
  }
  function createOperation(params, opts) {
    opts = opts || {};
    const fields = buildOpFields(params || {}, null);
    const check = validateOperation(fields);
    if (!check.ok) return err('finance.operation.create', check.code, check.message);
    const op = {
      id: S.id('o'), type: fields.type, cat: fields.cat, account: fields.account,
      title: fields.title || fields.cat, amount: fields.amount,
      dateISO: fields.dateISO, date: humanDate(fields.dateISO), comment: fields.comment
    };
    if (opts.link) Object.assign(op, opts.link);
    opsList().unshift(op);
    const adjust = finAccountAdjust(null, op);
    applyFinAdjust(adjust);
    save();
    const action = op.type === 'expense' ? 'finance.expense.create' : 'finance.income.create';
    const entry = opts.silent ? null : log({
      action, title: (op.type === 'expense' ? 'Расход' : 'Доход') + ' добавлен', object: opObject(op),
      objectType: op.type === 'expense' ? 'expense' : 'income', source: opts.source || 'ui', undoable: true,
      changes: [
        { field: 'Сумма', from: '—', to: money(op.amount) + ' (' + minorUnits(op.amount) + ' мин. ед.)' },
        { field: 'Категория', from: '—', to: op.cat },
        { field: 'Счёт', from: '—', to: finAccount(op.account).name },
        { field: 'Дата', from: '—', to: humanDate(op.dateISO) }
      ],
      undo: { type: 'remove', list: 'ops', id: op.id, adjust: finAccountAdjust(op, null) }
    });
    return ok(action, op, { entry, adjust });
  }
  function updateOperation(id, patch, opts) {
    opts = opts || {};
    const op = getById(opsList(), id);
    if (!op) return err('finance.operation.update', 'OPERATION_NOT_FOUND', 'Операция не найдена', { id });
    const prev = opSnapshot(op);
    const fields = buildOpFields(patch || {}, op);
    const check = validateOperation(fields);
    if (!check.ok) return err('finance.operation.update', check.code, check.message, { id });
    const next = {
      type: fields.type, cat: fields.cat, account: fields.account, title: fields.title || fields.cat,
      amount: fields.amount, dateISO: fields.dateISO, date: humanDate(fields.dateISO), comment: fields.comment
    };
    const adjust = finAccountAdjust(prev, next);
    Object.assign(op, next);
    applyFinAdjust(adjust);
    save();
    const after = opSnapshot(op);
    const changes = opChanges(prev, after);
    const action = after.type === 'income' ? 'finance.income.update' : 'finance.expense.update';
    const entry = opts.silent ? null : log({
      action, title: 'Операция изменена', object: opObject(op),
      objectType: after.type === 'income' ? 'income' : 'expense', source: opts.source || 'ui', undoable: true,
      changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
      undo: { type: 'fields', list: 'ops', id: op.id, fields: prev, adjust: finAccountAdjust(after, prev) }
    });
    return ok(action, op, { entry, previous: prev, adjust });
  }
  function deleteOperation(id, opts) {
    opts = opts || {};
    const list = opsList();
    const i = indexOfId(list, id);
    if (i < 0) return err('finance.operation.delete', 'OPERATION_NOT_FOUND', 'Операция не найдена', { id });
    const op = list[i];
    const copy = clone(op);
    const balanceBefore = financeBalance();
    list.splice(i, 1);
    const adjust = finAccountAdjust(copy, null);
    applyFinAdjust(adjust);
    save();
    const action = copy.type === 'income' ? 'finance.income.delete' : 'finance.expense.delete';
    const entry = opts.silent ? null : log({
      action, title: 'Операция удалена', object: opObject(copy),
      objectType: copy.type === 'income' ? 'income' : 'expense', source: opts.source || 'ui', undoable: true, danger: true,
      changes: [
        { field: 'Состояние', from: 'в списке', to: 'Удалена' },
        { field: 'Сумма', from: money(copy.amount), to: '—' },
        { field: 'Баланс', from: money(balanceBefore), to: money(financeBalance()) },
        { field: 'Счёт', from: finAccount(copy.account).name, to: 'пересчитан' }
      ],
      undo: { type: 'restore', list: 'ops', index: i, item: copy, adjust: finAccountAdjust(null, copy) }
    });
    return ok(action, copy, { entry, index: i, adjust });
  }
  function getOperation(id) {
    const op = getById(opsList(), id);
    return op ? ok('finance.operation.get', op) : err('finance.operation.get', 'OPERATION_NOT_FOUND', 'Операция не найдена', { id });
  }
  function opInPeriod(iso, period, refISO) {
    const today = refISO || todayISO();
    if (!period || period === 'all') return true;
    if (period === 'today') return iso === today;
    if (period === 'week') { const d = diffDays(today, iso); return d >= 0 && d <= 7; }
    if (period === 'month') return String(iso || '').slice(0, 7) === today.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(period)) return String(iso || '').slice(0, 7) === period;
    return true;
  }
  function getOperations(filters) {
    filters = filters || {};
    const q = String(filters.q || '').trim().toLowerCase();
    const items = opsList().filter((o) => {
      const iso = opDateISO(o);
      if (filters.type && filters.type !== 'all' && o.type !== filters.type) return false;
      if (filters.cat && filters.cat !== 'all' && o.cat !== filters.cat) return false;
      if (filters.account && filters.account !== 'all' && (o.account || 'card') !== filters.account) return false;
      if (!opInPeriod(iso, filters.period, filters.refISO)) return false;
      if (!q) return true;
      return [o.title, o.comment, o.cat, finAccount(o.account).name].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => (opDateISO(b) || '').localeCompare(opDateISO(a) || '') || String(b.id).localeCompare(String(a.id)));
    return ok('finance.operations.get', items, { items, count: items.length });
  }
  /* Итоги — это запрос, а не хранимое число: одна функция для карточек сверху,
     сумм «по фильтру», «Главной» и помощника. */
  function financeTotals(filters) {
    const items = getOperations(filters).items;
    const totals = items.reduce((acc, o) => {
      if (o.type === 'income') acc.income = sumMoney(acc.income, o.amount);
      else acc.expense = sumMoney(acc.expense, o.amount);
      return acc;
    }, { expense: 0, income: 0 });
    totals.net = sumMoney(totals.income, -totals.expense);
    totals.count = items.length;
    return totals;
  }
  function financeBalance() {
    return finAccountsList().reduce((sum, a) => sumMoney(sum, (a && a.balance) || 0), 0);
  }
  function financeSummary(refISO) {
    const today = refISO || todayISO();
    const month = financeTotals({ period: 'month', refISO: today });
    return {
      balance: financeBalance(),
      monthExpense: month.expense,
      monthIncome: month.income,
      monthNet: month.net,
      monthCount: month.count,
      monthKey: today.slice(0, 7),
      todayExpense: financeTotals({ period: 'today', type: 'expense', refISO: today }).expense
    };
  }
  function financeByCategory(filters) {
    const items = getOperations(filters).items.filter((o) => o.type !== 'income');
    const byCat = {};
    items.forEach((o) => { byCat[o.cat] = sumMoney(byCat[o.cat] || 0, o.amount); });
    return finCategoriesList().map((name) => ({ name, v: byCat[name] || 0 }))
      .concat(Object.keys(byCat).filter((k) => finCategoriesList().indexOf(k) < 0).map((name) => ({ name, v: byCat[name] })))
      .filter((c) => minorUnits(c.v) > 0)
      .sort((a, b) => minorUnits(b.v) - minorUnits(a.v));
  }
  function financeMonthly(limit) {
    const byKey = {};
    opsList().forEach((o) => {
      if (o.type === 'income') return;
      const iso = opDateISO(o);
      if (!isISODate(iso)) return;
      const key = iso.slice(0, 7);
      byKey[key] = sumMoney(byKey[key] || 0, o.amount);
    });
    /* Ряд всегда идёт подряд до текущего месяца: пустой месяц показывается нулём,
       иначе на графике «пропадали» бы месяцы без трат. */
    const n = limit || 12;
    const today = parseISO(todayISO());
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1, 12, 0, 0, 0);
      const key = localISO(d).slice(0, 7);
      const mi = d.getMonth();
      out.push({ key, m: MONTHS_SHORT[mi], full: MONTHS_FULL[mi] + ' ' + key.slice(0, 4), v: byKey[key] || 0 });
    }
    return out;
  }
  function createAccount(params, opts) {
    opts = opts || {};
    const name = String((params || {}).name || '').trim();
    if (!name) return err('finance.account.create', 'ACCOUNT_NAME_REQUIRED', 'Введите название счёта');
    const list = finAccountsList();
    if (list.some((a) => String(a.name || '').toLowerCase() === name.toLowerCase())) {
      return err('finance.account.create', 'ACCOUNT_EXISTS', 'Счёт «' + name + '» уже есть');
    }
    const raw = (params || {}).balance;
    if (raw !== '' && raw != null && !isFiniteNumber(raw)) {
      return err('finance.account.create', 'AMOUNT_INVALID', 'Баланс: нужно число');
    }
    const balance = minorUnits(raw) / 100;
    const acc = { id: S.id('acc'), name, balance };
    list.unshift(acc);
    save();
    const entry = log({
      action: 'finance.account.create', title: 'Счёт создан', object: 'Счёт «' + acc.name + '»', objectType: 'system',
      source: opts.source || 'ui', undoable: true,
      changes: [{ field: 'Название', from: '—', to: acc.name }, { field: 'Баланс', from: '—', to: money(acc.balance) }],
      undo: { type: 'remove', list: 'finAccounts', id: acc.id }
    });
    return ok('finance.account.create', acc, { entry });
  }
  function updateAccount(id, patch, opts) {
    opts = opts || {};
    const list = finAccountsList();
    const acc = getById(list, id);
    if (!acc) return err('finance.account.update', 'ACCOUNT_NOT_FOUND', 'Счёт не найден', { id });
    const has = (k) => Object.prototype.hasOwnProperty.call(patch || {}, k);
    const name = String(has('name') ? (patch.name || '') : acc.name).trim();
    if (!name) return err('finance.account.update', 'ACCOUNT_NAME_REQUIRED', 'Введите название счёта', { id });
    if (list.some((a) => a.id !== acc.id && String(a.name || '').toLowerCase() === name.toLowerCase())) {
      return err('finance.account.update', 'ACCOUNT_EXISTS', 'Счёт «' + name + '» уже есть', { id });
    }
    const rawBalance = has('balance') ? patch.balance : acc.balance;
    if (!isFiniteNumber(rawBalance)) return err('finance.account.update', 'AMOUNT_INVALID', 'Баланс: нужно число', { id });
    const prev = { name: acc.name, balance: acc.balance };
    acc.name = name;
    acc.balance = minorUnits(rawBalance) / 100;
    save();
    const changes = [];
    if (prev.name !== acc.name) changes.push({ field: 'Название', from: prev.name, to: acc.name });
    if (minorUnits(prev.balance) !== minorUnits(acc.balance)) changes.push({ field: 'Баланс', from: money(prev.balance), to: money(acc.balance) });
    const entry = log({
      action: 'finance.account.update', title: 'Счёт изменён', object: 'Счёт «' + acc.name + '»', objectType: 'system',
      source: opts.source || 'ui', undoable: true,
      changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
      undo: { type: 'fields', list: 'finAccounts', id: acc.id, fields: prev }
    });
    return ok('finance.account.update', acc, { entry, previous: prev });
  }
  function deleteAccount(id, opts) {
    opts = opts || {};
    const list = finAccountsList();
    const i = indexOfId(list, id);
    if (i < 0) return err('finance.account.delete', 'ACCOUNT_NOT_FOUND', 'Счёт не найден', { id });
    const acc = list[i];
    if (opsList().some((o) => (o.account || 'card') === acc.id)) {
      return err('finance.account.delete', 'ACCOUNT_IN_USE', 'Нельзя удалить счёт с операциями — сначала перенесите или удалите операции', { id });
    }
    const copy = clone(acc);
    list.splice(i, 1);
    save();
    const entry = log({
      action: 'finance.account.delete', title: 'Счёт удалён', object: 'Счёт «' + copy.name + '»', objectType: 'system',
      source: opts.source || 'ui', undoable: true, danger: true,
      changes: [{ field: 'Состояние', from: 'в списке', to: 'Удалён' }, { field: 'Баланс', from: money(copy.balance), to: '—' }],
      undo: { type: 'restore', list: 'finAccounts', index: i, item: copy }
    });
    return ok('finance.account.delete', copy, { entry, index: i });
  }
  function createCategory(name, opts) {
    opts = opts || {};
    const value = String(name || '').trim();
    if (!value) return err('finance.category.create', 'CATEGORY_NAME_REQUIRED', 'Введите название категории');
    const list = finCategoriesList();
    if (list.some((c) => String(c).toLowerCase() === value.toLowerCase())) {
      return err('finance.category.create', 'CATEGORY_EXISTS', 'Категория «' + value + '» уже есть');
    }
    const prev = list.slice();
    s().finCategories = prev.concat([value]);
    save();
    const entry = log({
      action: 'finance.category.create', title: 'Категория создана', object: 'Категория «' + value + '»',
      objectType: 'system', source: opts.source || 'ui', undoable: true,
      changes: [{ field: 'Категория', from: '—', to: value }],
      undo: { type: 'value', path: 'finCategories', value: prev }
    });
    return ok('finance.category.create', { name: value }, { entry });
  }
  function deleteCategory(name, opts) {
    opts = opts || {};
    const value = String(name || '').trim();
    const list = finCategoriesList();
    if (list.indexOf(value) < 0) return err('finance.category.delete', 'CATEGORY_NOT_FOUND', 'Категория не найдена');
    if (opsList().some((o) => o.cat === value)) {
      return err('finance.category.delete', 'CATEGORY_IN_USE', 'Нельзя удалить категорию, которая используется в операциях');
    }
    const prev = list.slice();
    s().finCategories = prev.filter((c) => c !== value);
    save();
    const entry = log({
      action: 'finance.category.delete', title: 'Категория удалена', object: 'Категория «' + value + '»',
      objectType: 'system', source: opts.source || 'ui', undoable: true, danger: true,
      changes: [{ field: 'Состояние', from: 'в списке', to: 'Удалена' }],
      undo: { type: 'value', path: 'finCategories', value: prev }
    });
    return ok('finance.category.delete', { name: value }, { entry });
  }

  /* ================= АВТО =================
     MVP_SCOPE §4.2. Заправки, расходы, обслуживание и документы — четыре вида
     записей одного раздела. Правила (что обязательно, как называется, как это
     связано с финансами) живут здесь, а не в четырёх похожих формах. */
  const AUTO_KINDS = ['fuel', 'expense', 'service', 'doc'];
  const AUTO_LABEL = { fuel: 'Заправка', expense: 'Расход авто', service: 'Обслуживание', doc: 'Документ' };
  const AUTO_LIST_PATH = { fuel: 'car.fuel', expense: 'car.expenses', service: 'car.service', doc: 'car.docs' };
  function carState() {
    const st = s();
    if (!st.car || typeof st.car !== 'object') st.car = { model: 'Автомобиль', mileage: 0 };
    if (!Array.isArray(st.car.fuel)) st.car.fuel = [];
    if (!Array.isArray(st.car.expenses)) st.car.expenses = [];
    if (!Array.isArray(st.car.service)) st.car.service = [];
    if (!Array.isArray(st.car.docs)) st.car.docs = [];
    return st.car;
  }
  function autoList(kind) {
    const car = carState();
    if (kind === 'fuel') return car.fuel;
    if (kind === 'expense') return car.expenses;
    if (kind === 'service') return car.service;
    if (kind === 'doc') return car.docs;
    return null;
  }
  function isoFromHumanDate(v) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(v || '').trim());
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }
  function autoDateISO(item) { return (item && (isISODate(item.dateISO) ? item.dateISO : isoFromHumanDate(item.date))) || ''; }
  function autoDocISO(item) { return (item && (isISODate(item.untilISO) ? item.untilISO : isoFromHumanDate(item.until))) || ''; }
  function autoCost(kind, item) {
    if (!item) return 0;
    if (kind === 'fuel') return Number(item.sum) || 0;
    if (kind === 'expense') return Number(item.amount) || 0;
    if (kind === 'service') return Number(item.cost) || 0;
    return 0;
  }
  function autoTitle(kind, item) {
    if (kind === 'fuel') return 'Заправка ' + (Number(item && item.liters) || 0) + ' л';
    return (item && item.title) || AUTO_LABEL[kind] || 'Авто';
  }
  function autoSnapshot(kind, item) {
    if (kind === 'fuel') {
      return { liters: Number(item.liters) || 0, sum: Number(item.sum) || 0, km: Number(item.km) || 0,
        date: item.date || '', dateISO: autoDateISO(item), note: item.note || '', financeOpId: item.financeOpId || '' };
    }
    if (kind === 'expense') {
      return { title: item.title || '', amount: Number(item.amount) || 0, category: item.category || 'Другое',
        date: item.date || '', dateISO: autoDateISO(item), comment: item.comment || '', financeOpId: item.financeOpId || '' };
    }
    if (kind === 'service') {
      return { title: item.title || '', cost: Number(item.cost) || 0, km: Number(item.km) || 0,
        date: item.date || '', dateISO: autoDateISO(item), comment: item.comment || '', financeOpId: item.financeOpId || '' };
    }
    return { title: item.title || '', until: item.until || '', untilISO: autoDocISO(item), remindDays: Number(item.remindDays) || 0 };
  }
  function buildAutoFields(kind, params, existing) {
    const ex = existing ? autoSnapshot(kind, existing) : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(params || {}, k);
    const pick = (k, fallback) => (has(k) ? params[k] : (ex[k] != null ? ex[k] : fallback));
    if (kind === 'doc') {
      const untilISO = normalizeDate(has('untilISO') ? params.untilISO : (has('until') ? params.until : ex.untilISO), '');
      return {
        title: String(pick('title', '')).trim(),
        untilISO, until: untilISO ? humanDate(untilISO) : 'без срока',
        remindDays: Math.max(0, Math.round(Number(pick('remindDays', 30)) || 0)),
        rawRemind: pick('remindDays', 30)
      };
    }
    const dateISO = normalizeDate(has('dateISO') ? params.dateISO : (has('date') ? params.date : ex.dateISO), '') || todayISO();
    const base = { dateISO, date: humanDate(dateISO) };
    if (kind === 'fuel') {
      return Object.assign(base, {
        rawLiters: pick('liters', ''), liters: Math.round((Number(pick('liters', 0)) || 0) * 100) / 100,
        rawSum: pick('sum', ''), sum: minorUnits(pick('sum', 0)) / 100,
        rawKm: pick('km', carState().mileage || 0), km: Math.round(Number(pick('km', carState().mileage || 0)) || 0),
        note: String(pick('note', '')).trim()
      });
    }
    if (kind === 'expense') {
      return Object.assign(base, {
        title: String(pick('title', '')).trim(),
        rawAmount: pick('amount', ''), amount: minorUnits(pick('amount', 0)) / 100,
        category: String(pick('category', 'Другое')).trim() || 'Другое',
        comment: String(pick('comment', '')).trim()
      });
    }
    return Object.assign(base, {
      title: String(pick('title', '')).trim(),
      rawCost: pick('cost', ''), cost: minorUnits(pick('cost', 0)) / 100,
      rawKm: pick('km', 0), km: Math.round(Number(pick('km', 0)) || 0),
      comment: String(pick('comment', '')).trim()
    });
  }
  function validateAuto(kind, fields) {
    if (kind === 'fuel') {
      if (!isFiniteNumber(fields.rawLiters) || !(fields.liters > 0)) return { ok: false, code: 'FUEL_LITERS_REQUIRED', message: 'Введите литры больше нуля' };
      if (!isFiniteNumber(fields.rawSum) || minorUnits(fields.rawSum) < 0) return { ok: false, code: 'AMOUNT_INVALID', message: 'Сумма: нужно число не меньше нуля' };
      if (!isFiniteNumber(fields.rawKm) || fields.km < 0) return { ok: false, code: 'MILEAGE_INVALID', message: 'Пробег: нужно число не меньше нуля' };
      if (!fields.dateISO) return { ok: false, code: 'DATE_INVALID', message: 'Выберите дату заправки' };
      return { ok: true };
    }
    if (kind === 'expense') {
      if (!fields.title) return { ok: false, code: 'TITLE_REQUIRED', message: 'Введите, за что расход' };
      if (!isFiniteNumber(fields.rawAmount) || !(fields.amount > 0)) return { ok: false, code: 'AMOUNT_REQUIRED', message: 'Введите сумму больше нуля' };
      if (!fields.dateISO) return { ok: false, code: 'DATE_INVALID', message: 'Выберите дату расхода' };
      return { ok: true };
    }
    if (kind === 'service') {
      if (!fields.title) return { ok: false, code: 'TITLE_REQUIRED', message: 'Введите, какая работа выполнена' };
      if (!isFiniteNumber(fields.rawCost) || minorUnits(fields.rawCost) < 0) return { ok: false, code: 'AMOUNT_INVALID', message: 'Стоимость: нужно число не меньше нуля' };
      if (!isFiniteNumber(fields.rawKm) || fields.km < 0) return { ok: false, code: 'MILEAGE_INVALID', message: 'Пробег: нужно число не меньше нуля' };
      if (!fields.dateISO) return { ok: false, code: 'DATE_INVALID', message: 'Выберите дату обслуживания' };
      return { ok: true };
    }
    if (!fields.title) return { ok: false, code: 'TITLE_REQUIRED', message: 'Введите название документа' };
    if (!isFiniteNumber(fields.rawRemind) || fields.remindDays > 365) return { ok: false, code: 'REMIND_INVALID', message: 'Напомнить за: число от 0 до 365 дней' };
    return { ok: true };
  }
  function autoChanges(kind, prev, next) {
    const km = (v) => (Number(v) || 0).toLocaleString('ru-RU') + ' км';
    const spec = kind === 'fuel'
      ? { liters: ['Литры', (v) => (Number(v) || 0) + ' л'], sum: ['Сумма', money], km: ['Пробег', km], dateISO: ['Дата', (v) => v ? humanDate(v) : '—'], note: ['Комментарий', (v) => v || '—'] }
      : kind === 'expense'
        ? { title: ['Что', (v) => v || '—'], amount: ['Сумма', money], category: ['Категория', (v) => v || '—'], dateISO: ['Дата', (v) => v ? humanDate(v) : '—'], comment: ['Комментарий', (v) => v || '—'] }
        : kind === 'service'
          ? { title: ['Работа', (v) => v || '—'], cost: ['Стоимость', money], km: ['Пробег', km], dateISO: ['Дата', (v) => v ? humanDate(v) : '—'], comment: ['Комментарий', (v) => v || '—'] }
          : { title: ['Документ', (v) => v || '—'], untilISO: ['Срок', (v) => v ? humanDate(v) : 'без срока'], remindDays: ['Напомнить за', (v) => (Number(v) || 0) + ' дн.'] };
    return Object.keys(spec).reduce((out, k) => {
      const a = prev[k] == null ? '' : prev[k], b = next[k] == null ? '' : next[k];
      const isMoneyField = k === 'sum' || k === 'amount' || k === 'cost';
      if (isMoneyField ? minorUnits(a) !== minorUnits(b) : String(a) !== String(b)) {
        out.push({ field: spec[k][0], from: spec[k][1](a), to: spec[k][1](b) });
      }
      return out;
    }, []);
  }
  function autoLinkedOp(item) {
    return item && item.financeOpId ? getById(opsList(), item.financeOpId) : null;
  }
  function autoFinancePayload(kind, item, finance) {
    finance = finance || {};
    const iso = kind === 'doc' ? todayISO() : (autoDateISO(item) || todayISO());
    return {
      type: 'expense',
      cat: finance.cat || (finCategoriesList().indexOf('Авто') >= 0 ? 'Авто' : (finCategoriesList()[0] || 'Другое')),
      account: finance.account || ((finAccountsList()[0] || {}).id || 'card'),
      title: kind === 'fuel' ? autoTitle(kind, item) : 'Авто: ' + autoTitle(kind, item),
      amount: autoCost(kind, item),
      dateISO: iso,
      comment: 'Связано с авто: ' + (carState().model || 'автомобиль') + ' · ' + AUTO_LABEL[kind]
    };
  }
  /* Связанная финансовая операция — не копия записи авто, а обычная операция
     «Финансов» со ссылкой на источник. Одна сумма, один источник истины. */
  function autoCreateLinkedFinance(kind, item, finance) {
    if (!(autoCost(kind, item) > 0)) return null;
    const res = createOperation(Object.assign(autoFinancePayload(kind, item, finance), {}), {
      silent: true, link: { carKind: kind, carItemId: item.id }
    });
    if (!res.ok) return null;
    item.financeOpId = res.entity.id;
    return { op: res.entity, adjust: res.adjust || [] };
  }
  function autoUpdateLinkedFinance(kind, item) {
    const op = autoLinkedOp(item);
    if (!op) return null;
    const prev = opSnapshot(op);
    const payload = autoFinancePayload(kind, item);
    const res = updateOperation(op.id, payload, { silent: true });
    if (!res.ok) return null;
    return { op, prev, next: opSnapshot(op) };
  }
  function autoObject(kind, item) { return AUTO_LABEL[kind] + ' «' + autoTitle(kind, item) + '»'; }
  function createAutoRecord(kind, params, opts) {
    opts = opts || {};
    if (AUTO_KINDS.indexOf(kind) < 0) return err('car.record.create', 'AUTO_KIND_INVALID', 'Неизвестный вид записи автомобиля');
    const fields = buildAutoFields(kind, params || {}, null);
    const check = validateAuto(kind, fields);
    if (!check.ok) return err('car.' + kind + '.create', check.code, check.message);
    const car = carState();
    const list = autoList(kind);
    const idPrefix = kind === 'fuel' ? 'f' : kind === 'expense' ? 'ce' : kind === 'service' ? 'cs' : 'cd';
    const item = Object.assign({ id: S.id(idPrefix) }, fields, kind === 'doc' ? {} : { financeOpId: '' });
    delete item.rawLiters; delete item.rawSum; delete item.rawKm; delete item.rawAmount; delete item.rawCost; delete item.rawRemind;
    const wasMileage = car.mileage;
    const wantLink = kind !== 'doc' && (params || {}).linkFinance !== false && !!(params || {}).linkFinance;
    /* Для связанной команды сначала создаётся обычная Finance operation через тот
       же Common Action, и только после её успеха запись попадает в Auto. Поэтому
       ошибка счёта/категории не оставляет половину пользовательского действия. */
    const link = wantLink ? autoCreateLinkedFinance(kind, item, (params || {}).finance) : null;
    if (wantLink && !link) return err('car.' + kind + '.create', 'FINANCE_LINK_FAILED', 'Не удалось создать связанный расход — запись авто не создана');
    list.unshift(item);
    if (kind === 'fuel' && item.km > (Number(car.mileage) || 0)) car.mileage = item.km;
    save();
    const steps = [{ type: 'remove', list: AUTO_LIST_PATH[kind], id: item.id }];
    if (link) steps.push({ type: 'remove', list: 'ops', id: link.op.id });
    if (car.mileage !== wasMileage) steps.push({ type: 'value', path: 'car.mileage', value: wasMileage });
    const changes = kind === 'fuel'
      ? [{ field: 'Литры', from: '—', to: item.liters + ' л' }, { field: 'Сумма', from: '—', to: money(item.sum) },
        { field: 'Пробег', from: '—', to: item.km + ' км' }, { field: 'Связанный расход', from: '—', to: link ? 'создан' : 'не создан' }]
      : kind === 'doc'
        ? [{ field: 'Документ', from: '—', to: item.title }, { field: 'Срок', from: '—', to: item.until }]
        : [{ field: kind === 'service' ? 'Работа' : 'Что', from: '—', to: item.title },
          { field: kind === 'service' ? 'Стоимость' : 'Сумма', from: '—', to: money(autoCost(kind, item)) },
          { field: 'Связанный расход', from: '—', to: link ? 'создан' : 'не создан' }];
    const entry = log({
      action: 'car.' + kind + '.create', title: AUTO_LABEL[kind] + ' добавлен' + (kind === 'fuel' || kind === 'service' ? 'о' : ''),
      object: autoObject(kind, item), objectType: 'car', source: opts.source || 'ui', undoable: true,
      changes,
      undo: steps.length > 1 ? { type: 'batch', steps, adjust: link ? finAccountAdjust(link.op, null) : [] } : steps[0]
    });
    return ok('car.' + kind + '.create', item, { entry, link: link ? link.op : null });
  }
  function updateAutoRecord(kind, id, patch, opts) {
    opts = opts || {};
    if (AUTO_KINDS.indexOf(kind) < 0) return err('car.record.update', 'AUTO_KIND_INVALID', 'Неизвестный вид записи автомобиля');
    const item = getById(autoList(kind), id);
    if (!item) return err('car.' + kind + '.update', 'RECORD_NOT_FOUND', AUTO_LABEL[kind] + ': запись не найдена', { id });
    const prev = autoSnapshot(kind, item);
    const fields = buildAutoFields(kind, patch || {}, item);
    const check = validateAuto(kind, fields);
    if (!check.ok) return err('car.' + kind + '.update', check.code, check.message, { id });
    const clean = Object.assign({}, fields);
    delete clean.rawLiters; delete clean.rawSum; delete clean.rawKm; delete clean.rawAmount; delete clean.rawCost; delete clean.rawRemind;
    Object.assign(item, clean);
    const link = kind === 'doc' ? null : autoUpdateLinkedFinance(kind, item);
    save();
    const after = autoSnapshot(kind, item);
    const changes = autoChanges(kind, prev, after);
    if (link) changes.push({ field: 'Связанный расход', from: link.prev.title + ' · ' + money(link.prev.amount), to: link.next.title + ' · ' + money(link.next.amount) });
    const entry = log({
      action: 'car.' + kind + '.update', title: AUTO_LABEL[kind] + ' изменён' + (kind === 'fuel' ? 'а' : kind === 'service' ? 'о' : ''),
      object: autoObject(kind, item), objectType: 'car', source: opts.source || 'ui', undoable: true,
      changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
      undo: link
        ? { type: 'batch', steps: [
          { type: 'fields', list: AUTO_LIST_PATH[kind], id: item.id, fields: prev },
          { type: 'fields', list: 'ops', id: link.op.id, fields: link.prev }
        ], adjust: finAccountAdjust(link.next, link.prev) }
        : { type: 'fields', list: AUTO_LIST_PATH[kind], id: item.id, fields: prev }
    });
    return ok('car.' + kind + '.update', item, { entry, previous: prev });
  }
  function deleteAutoRecord(kind, id, opts) {
    opts = opts || {};
    if (AUTO_KINDS.indexOf(kind) < 0) return err('car.record.delete', 'AUTO_KIND_INVALID', 'Неизвестный вид записи автомобиля');
    const list = autoList(kind);
    const i = indexOfId(list, id);
    if (i < 0) return err('car.' + kind + '.delete', 'RECORD_NOT_FOUND', AUTO_LABEL[kind] + ': запись не найдена', { id });
    const item = list[i];
    const itemCopy = clone(item);
    const linked = autoLinkedOp(item);
    const opIdx = linked ? indexOfId(opsList(), linked.id) : -1;
    const opCopy = linked ? clone(linked) : null;
    list.splice(i, 1);
    if (linked) {
      opsList().splice(opIdx, 1);
      applyFinAdjust(finAccountAdjust(opCopy, null));
    }
    save();
    const entry = log({
      action: 'car.' + kind + '.delete', title: AUTO_LABEL[kind] + ' удалён' + (kind === 'fuel' ? 'а' : kind === 'service' ? 'о' : ''),
      object: autoObject(kind, itemCopy), objectType: 'car', source: opts.source || 'ui', undoable: true, danger: true,
      changes: [{ field: 'Состояние', from: 'в списке', to: 'Удалено' },
        { field: 'Финансы', from: linked ? 'связанный расход' : '—', to: linked ? 'расход удалён' : '—' }],
      undo: linked
        ? { type: 'batch', steps: [
          { type: 'restore', list: AUTO_LIST_PATH[kind], index: i, item: itemCopy },
          { type: 'restore', list: 'ops', index: Math.max(0, opIdx), item: opCopy }
        ], adjust: finAccountAdjust(null, opCopy) }
        : { type: 'restore', list: AUTO_LIST_PATH[kind], index: i, item: itemCopy }
    });
    return ok('car.' + kind + '.delete', itemCopy, { entry, index: i });
  }
  function linkAutoFinance(kind, id, opts) {
    opts = opts || {};
    if (AUTO_KINDS.indexOf(kind) < 0 || kind === 'doc') return err('car.finance.link', 'AUTO_KIND_INVALID', 'Для документов финансовая операция не создаётся');
    const item = getById(autoList(kind), id);
    if (!item) return err('car.finance.link', 'RECORD_NOT_FOUND', AUTO_LABEL[kind] + ': запись не найдена', { id });
    if (autoLinkedOp(item)) return err('car.finance.link', 'ALREADY_LINKED', 'Финансовая операция уже связана', { id });
    if (!(autoCost(kind, item) > 0)) return err('car.finance.link', 'AMOUNT_REQUIRED', 'Для финансовой связи нужна сумма больше нуля', { id });
    const prev = autoSnapshot(kind, item);
    const link = autoCreateLinkedFinance(kind, item);
    if (!link) return err('car.finance.link', 'LINK_FAILED', 'Не удалось создать расход', { id });
    save();
    const entry = log({
      action: 'car.finance.link', title: 'Авто связано с финансами', object: autoObject(kind, item) + ' · ' + money(link.op.amount),
      objectType: 'car', source: opts.source || 'ui', undoable: true,
      changes: [{ field: 'Связанный расход', from: '—', to: link.op.title + ' · ' + money(link.op.amount) },
        { field: 'Счёт', from: '—', to: finAccount(link.op.account).name }],
      undo: { type: 'batch', steps: [
        { type: 'fields', list: AUTO_LIST_PATH[kind], id: item.id, fields: prev },
        { type: 'remove', list: 'ops', id: link.op.id }
      ], adjust: finAccountAdjust(link.op, null) }
    });
    return ok('car.finance.link', item, { entry, link: link.op });
  }
  function setMileage(km, opts) {
    opts = opts || {};
    if (!isFiniteNumber(km)) return err('car.mileage.update', 'MILEAGE_INVALID', 'Пробег: нужно число');
    const value = Math.round(Number(km));
    if (value < 0) return err('car.mileage.update', 'MILEAGE_INVALID', 'Пробег не может быть отрицательным');
    const car = carState();
    const was = Number(car.mileage) || 0;
    if (was === value) return ok('car.mileage.update', car, { unchanged: true, entry: null });
    car.mileage = value;
    save();
    const entry = log({
      action: 'car.mileage.update', title: 'Пробег обновлён', object: value.toLocaleString('ru-RU') + ' км',
      objectType: 'car', source: opts.source || 'ui', undoable: true,
      changes: [{ field: 'Пробег, км', from: String(was), to: String(value) }],
      undo: { type: 'value', path: 'car.mileage', value: was }
    });
    return ok('car.mileage.update', car, { entry, previous: was });
  }
  function getAutoRecords(kind) {
    const list = autoList(kind);
    if (!list) return err('car.records.get', 'AUTO_KIND_INVALID', 'Неизвестный вид записи автомобиля');
    const items = list.slice();
    return ok('car.records.get', items, { items, count: items.length });
  }
  function getAutoRecord(kind, id) {
    const list = autoList(kind);
    if (!list) return err('car.record.get', 'AUTO_KIND_INVALID', 'Неизвестный вид записи автомобиля');
    const item = getById(list, id);
    return item ? ok('car.record.get', item) : err('car.record.get', 'RECORD_NOT_FOUND', AUTO_LABEL[kind] + ': запись не найдена', { id });
  }
  function autoStats() {
    const car = carState();
    const fuel = car.fuel.slice().sort((a, b) => (Number(a.km) || 0) - (Number(b.km) || 0));
    const liters = fuel.reduce((sum, f) => sum + (Number(f.liters) || 0), 0);
    const fuelMoney = fuel.reduce((sum, f) => sumMoney(sum, f.sum || 0), 0);
    const firstKm = fuel.length ? Number(fuel[0].km) || 0 : 0;
    const lastKm = fuel.length ? Number(fuel[fuel.length - 1].km) || 0 : firstKm;
    const distance = Math.max(0, lastKm - firstKm);
    const expenseTotal = car.expenses.reduce((sum, e) => sumMoney(sum, e.amount || 0), 0);
    const serviceTotal = car.service.reduce((sum, e) => sumMoney(sum, e.cost || 0), 0);
    const lastService = car.service.slice().sort((a, b) => (Number(b.km) || 0) - (Number(a.km) || 0))[0] || null;
    const nextServiceLeft = lastService
      ? (Number(lastService.km) || 0) + (Number(car.serviceIntervalKm) || 10000) - (Number(car.mileage) || 0)
      : null;
    const docsAttention = car.docs.filter((d) => {
      const iso = autoDocISO(d);
      if (!iso) return false;
      return diffDays(iso, todayISO()) <= (Number(d.remindDays) || 0);
    });
    return {
      liters, fuelMoney, distance,
      avgPrice: liters > 0 ? fuelMoney / liters : 0,
      consumption: distance > 0 ? (liters / distance * 100).toFixed(1) + ' л / 100 км' : 'недостаточно данных',
      expenseTotal, serviceTotal, totalCost: sumMoney(fuelMoney, expenseTotal, serviceTotal),
      lastService, nextServiceLeft, docsAttention, docsAttentionCount: docsAttention.length,
      mileage: Number(car.mileage) || 0
    };
  }

  /* ================= ПОКУПКИ И ИМУЩЕСТВО =================
     MVP_SCOPE §4.2. Это не второй список задач: у предмета есть цена, гарантия,
     статус владения и записи обслуживания. */
  const SHOP_STATUS = {
    owned: { label: 'в собственности', cls: 'ok' },
    sold: { label: 'продано', cls: '' },
    archived: { label: 'архив', cls: 'warn' }
  };
  const PURCHASE_CATEGORIES_DEFAULT = ['Электроника', 'Дом', 'Авто', 'Одежда', 'Спорт', 'Документы', 'Другое'];
  function purchasesList() { return ensureList(s(), 'purchases'); }
  function purchaseStatusKey(p) {
    const raw = String((p && p.status) || 'owned').toLowerCase();
    if (raw === 'owned' || raw === 'в собственности') return 'owned';
    if (raw === 'sold' || raw === 'продано' || raw === 'продана') return 'sold';
    if (raw === 'archived' || raw === 'архив' || raw === 'в архиве') return 'archived';
    return 'owned';
  }
  function purchaseStatusLabel(p) { return SHOP_STATUS[purchaseStatusKey(p)].label; }
  function purchaseDateISO(p) { return (p && (isISODate(p.dateISO) ? p.dateISO : isoFromHumanDate(p.date))) || ''; }
  function purchaseWarrantyISO(p) { return (p && (isISODate(p.warrantyISO) ? p.warrantyISO : isoFromHumanDate(p.warranty))) || ''; }
  /* Состояние гарантии считается по ISO-дате, а не по строке на экране: иначе при
     смене формата даты в профиле подсказка «истекает» просто переставала работать. */
  function warrantyState(iso) {
    if (!iso || !isISODate(iso)) return { kind: 'none', cls: '', label: 'гарантия не указана', days: null };
    const days = diffDays(iso, todayISO());
    if (days < 0) return { kind: 'expired', cls: 'danger', label: 'Гарантия истекла', days, untilISO: iso };
    if (days < 90) return { kind: 'warn', cls: 'warn', label: 'Гарантия до ' + humanDate(iso), days, untilISO: iso };
    return { kind: 'active', cls: 'ok', label: 'Гарантия до ' + humanDate(iso), days, untilISO: iso };
  }
  function purchaseWarrantyKind(p) { return warrantyState(purchaseWarrantyISO(p)).kind; }
  function purchaseCategories() {
    const st = s();
    const out = (Array.isArray(st.purchaseCategories) && st.purchaseCategories.length ? st.purchaseCategories : PURCHASE_CATEGORIES_DEFAULT).slice();
    purchasesList().forEach((p) => { if (p && p.category && out.indexOf(p.category) < 0) out.push(p.category); });
    return out;
  }
  function purchaseRepairs(p) { return Array.isArray(p && p.repairs) ? p.repairs : []; }
  function purchaseRepairTotal(p) { return purchaseRepairs(p).reduce((sum, r) => sumMoney(sum, r.cost || 0), 0); }
  function purchaseSnapshot(p) {
    return {
      name: p.name || '', emoji: p.emoji || '📦', category: p.category || 'Другое', price: Number(p.price) || 0,
      date: p.date || '', dateISO: purchaseDateISO(p), store: p.store || '',
      warranty: p.warranty || '', warrantyISO: purchaseWarrantyISO(p), sn: p.sn || '',
      status: purchaseStatusKey(p), condition: p.condition || '', note: p.note || '', financeOpId: p.financeOpId || ''
    };
  }
  function buildPurchaseFields(params, existing) {
    const ex = existing ? purchaseSnapshot(existing) : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(params || {}, k);
    const pick = (k, fallback) => (has(k) ? params[k] : (ex[k] != null ? ex[k] : fallback));
    const dateISO = normalizeDate(has('dateISO') ? params.dateISO : (has('date') ? params.date : ex.dateISO), '');
    const warrantyISO = normalizeDate(has('warrantyISO') ? params.warrantyISO : (has('warranty') ? params.warranty : ex.warrantyISO), '');
    return {
      name: String(pick('name', '')).trim(),
      emoji: String(pick('emoji', '📦')).trim() || '📦',
      category: String(pick('category', 'Другое')).trim() || 'Другое',
      rawPrice: pick('price', ''), price: minorUnits(pick('price', 0)) / 100,
      dateISO, date: dateISO ? humanDate(dateISO) : '—',
      warrantyISO, warranty: warrantyISO ? humanDate(warrantyISO) : '—',
      store: String(pick('store', '')).trim(),
      sn: String(pick('sn', '')).trim(),
      status: purchaseStatusKey({ status: pick('status', 'owned') }),
      condition: String(pick('condition', '')).trim(),
      note: String(pick('note', '')).trim()
    };
  }
  function validatePurchase(fields, params) {
    if (!fields.name) return { ok: false, code: 'PURCHASE_NAME_REQUIRED', message: 'Введите название покупки' };
    if (!isBlank(fields.rawPrice) && (!isFiniteNumber(fields.rawPrice) || minorUnits(fields.rawPrice) < 0)) {
      return { ok: false, code: 'PRICE_INVALID', message: 'Цена: нужно число не меньше нуля' };
    }
    if (params && Object.prototype.hasOwnProperty.call(params, 'status') && !SHOP_STATUS[fields.status]) {
      return { ok: false, code: 'STATUS_INVALID', message: 'Такого статуса нет' };
    }
    if (fields.dateISO && fields.warrantyISO && diffDays(fields.warrantyISO, fields.dateISO) < 0) {
      return { ok: false, code: 'WARRANTY_BEFORE_PURCHASE', message: 'Гарантия не может заканчиваться раньше даты покупки' };
    }
    return { ok: true };
  }
  function purchaseChanges(prev, next) {
    const labels = { name: 'Название', emoji: 'Иконка', category: 'Категория', price: 'Цена', dateISO: 'Дата покупки',
      store: 'Магазин', warrantyISO: 'Гарантия до', sn: 'Серийный номер', status: 'Статус', condition: 'Состояние/место', note: 'Заметка' };
    const fmt = (k, v) => k === 'price' ? money(v || 0)
      : (k === 'dateISO' || k === 'warrantyISO') ? (v ? humanDate(v) : '—')
        : k === 'status' ? (SHOP_STATUS[v] || SHOP_STATUS.owned).label : (v || '—');
    return Object.keys(labels).reduce((acc, k) => {
      const a = prev[k] == null ? '' : prev[k], b = next[k] == null ? '' : next[k];
      if (k === 'price' ? minorUnits(a) !== minorUnits(b) : String(a) !== String(b)) acc.push({ field: labels[k], from: fmt(k, a), to: fmt(k, b) });
      return acc;
    }, []);
  }
  function purchaseFinancePayload(p) {
    const finCats = finCategoriesList();
    const cat = finCats.indexOf(p.category) >= 0 ? p.category
      : (/авто/i.test(p.category || '') && finCats.indexOf('Авто') >= 0) ? 'Авто'
        : (finCats.indexOf('Другое') >= 0 ? 'Другое' : (finCats[0] || 'Другое'));
    const iso = purchaseDateISO(p) || todayISO();
    return {
      type: 'expense', cat, account: ((finAccountsList()[0] || {}).id || 'card'),
      title: 'Покупка: ' + (p.name || 'Покупка'), amount: Number(p.price) || 0,
      dateISO: iso, comment: 'Связано с покупкой/имуществом: ' + (p.name || 'Покупка')
    };
  }
  function purchaseLinkedOp(p) { return p && p.financeOpId ? getById(opsList(), p.financeOpId) : null; }
  function purchaseObject(p) { return 'Покупка «' + (p.name || 'без названия') + '»'; }
  function createPurchase(params, opts) {
    opts = opts || {};
    const fields = buildPurchaseFields(params || {}, null);
    const check = validatePurchase(fields, params);
    if (!check.ok) return err('purchase.create', check.code, check.message);
    const clean = Object.assign({}, fields);
    delete clean.rawPrice;
    const item = Object.assign({ id: S.id('p'), repairs: [], financeOpId: '' }, clean);
    purchasesList().unshift(item);
    let link = null;
    if ((params || {}).linkFinance && item.price > 0) {
      const res = createOperation(purchaseFinancePayload(item), { silent: true, link: { purchaseId: item.id } });
      if (res.ok) { item.financeOpId = res.entity.id; link = res.entity; }
    }
    save();
    const entry = log({
      action: 'purchase.create', title: 'Покупка добавлена', object: purchaseObject(item) + ' · ' + money(item.price),
      objectType: 'purchase', source: opts.source || 'ui', undoable: true,
      changes: [
        { field: 'Название', from: '—', to: item.name }, { field: 'Цена', from: '—', to: money(item.price) },
        { field: 'Категория', from: '—', to: item.category }, { field: 'Гарантия до', from: '—', to: item.warranty },
        { field: 'Связанный расход', from: '—', to: link ? link.title + ' · ' + money(link.amount) : 'не создан' }
      ],
      undo: link
        ? { type: 'batch', steps: [
          { type: 'remove', list: 'purchases', id: item.id }, { type: 'remove', list: 'ops', id: link.id }
        ], adjust: finAccountAdjust(link, null) }
        : { type: 'remove', list: 'purchases', id: item.id }
    });
    return ok('purchase.create', item, { entry, link });
  }
  function updatePurchase(id, patch, opts) {
    opts = opts || {};
    const item = getById(purchasesList(), id);
    if (!item) return err('purchase.update', 'PURCHASE_NOT_FOUND', 'Покупка не найдена', { id });
    const prev = purchaseSnapshot(item);
    const fields = buildPurchaseFields(patch || {}, item);
    const check = validatePurchase(fields, patch);
    if (!check.ok) return err('purchase.update', check.code, check.message, { id });
    const clean = Object.assign({}, fields);
    delete clean.rawPrice;
    Object.assign(item, clean);
    const linked = purchaseLinkedOp(item);
    let linkedPrev = null, linkedNext = null;
    if (linked) {
      linkedPrev = opSnapshot(linked);
      const res = updateOperation(linked.id, purchaseFinancePayload(item), { silent: true });
      if (res.ok) linkedNext = opSnapshot(linked); else linkedPrev = null;
    }
    save();
    const after = purchaseSnapshot(item);
    const changes = purchaseChanges(prev, after);
    if (linkedPrev && linkedNext) {
      changes.push({ field: 'Связанный расход', from: linkedPrev.title + ' · ' + money(linkedPrev.amount), to: linkedNext.title + ' · ' + money(linkedNext.amount) });
    }
    const entry = log({
      action: opts.historyAction || 'purchase.update', title: opts.title || 'Покупка изменена', object: purchaseObject(item),
      objectType: 'purchase', source: opts.source || 'ui', undoable: true,
      changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
      undo: (linkedPrev && linkedNext)
        ? { type: 'batch', steps: [
          { type: 'fields', list: 'purchases', id: item.id, fields: prev },
          { type: 'fields', list: 'ops', id: linked.id, fields: linkedPrev }
        ], adjust: finAccountAdjust(linkedNext, linkedPrev) }
        : { type: 'fields', list: 'purchases', id: item.id, fields: prev }
    });
    return ok(opts.historyAction || 'purchase.update', item, { entry, previous: prev });
  }
  function setPurchaseStatus(id, status, opts) {
    const item = getById(purchasesList(), id);
    if (!item) return err('purchase.status.update', 'PURCHASE_NOT_FOUND', 'Покупка не найдена', { id });
    if (!SHOP_STATUS[status]) return err('purchase.status.update', 'STATUS_INVALID', 'Такого статуса нет', { id });
    return updatePurchase(id, { status }, Object.assign({
      historyAction: 'purchase.status.update', title: 'Статус покупки изменён'
    }, opts || {}));
  }
  function deletePurchase(id, opts) {
    opts = opts || {};
    const list = purchasesList();
    const i = indexOfId(list, id);
    if (i < 0) return err('purchase.delete', 'PURCHASE_NOT_FOUND', 'Покупка не найдена', { id });
    const item = list[i];
    const copy = clone(item);
    list.splice(i, 1);
    save();
    const entry = log({
      action: 'purchase.delete', title: 'Покупка удалена', object: purchaseObject(copy), objectType: 'purchase',
      source: opts.source || 'ui', undoable: true, danger: true,
      changes: [{ field: 'Статус', from: purchaseStatusLabel(copy), to: 'Удалена' }],
      undo: { type: 'restore', list: 'purchases', index: i, item: copy }
    });
    return ok('purchase.delete', copy, { entry, index: i });
  }
  function addPurchaseService(id, params, opts) {
    opts = opts || {};
    const list = purchasesList();
    const item = getById(list, id);
    if (!item) return err('purchase.service.create', 'PURCHASE_NOT_FOUND', 'Покупка не найдена', { id });
    const title = String((params || {}).title || '').trim();
    if (!title) return err('purchase.service.create', 'SERVICE_TITLE_REQUIRED', 'Введите, что сделали', { id });
    const rawCost = (params || {}).cost;
    if (rawCost !== '' && rawCost != null && !isFiniteNumber(rawCost)) {
      return err('purchase.service.create', 'AMOUNT_INVALID', 'Стоимость: нужно число', { id });
    }
    if (minorUnits(rawCost) < 0) return err('purchase.service.create', 'AMOUNT_INVALID', 'Стоимость не может быть отрицательной', { id });
    const dateISO = normalizeDate((params || {}).dateISO || (params || {}).date, '') || todayISO();
    if (!Array.isArray(item.repairs)) item.repairs = [];
    const rec = { id: S.id('pr'), title, dateISO, date: humanDate(dateISO), cost: minorUnits(rawCost) / 100, comment: String((params || {}).comment || '').trim() };
    item.repairs.unshift(rec);
    const idx = indexOfId(list, item.id);
    save();
    const entry = log({
      action: 'purchase.service.create', title: 'Обслуживание покупки добавлено', object: purchaseObject(item) + ' · ' + rec.title,
      objectType: 'purchase', source: opts.source || 'ui', undoable: true,
      changes: [{ field: 'Работа', from: '—', to: rec.title }, { field: 'Стоимость', from: '—', to: money(rec.cost) }],
      undo: { type: 'remove', list: 'purchases.' + idx + '.repairs', id: rec.id }
    });
    return ok('purchase.service.create', rec, { entry, purchase: item });
  }
  function linkPurchaseFinance(id, opts) {
    opts = opts || {};
    const item = getById(purchasesList(), id);
    if (!item) return err('purchase.finance.link', 'PURCHASE_NOT_FOUND', 'Покупка не найдена', { id });
    if (purchaseLinkedOp(item)) return err('purchase.finance.link', 'ALREADY_LINKED', 'Расход уже связан с покупкой', { id });
    if (!(Number(item.price) > 0)) return err('purchase.finance.link', 'AMOUNT_REQUIRED', 'Для связанного расхода нужна цена больше нуля', { id });
    const prev = purchaseSnapshot(item);
    const res = createOperation(purchaseFinancePayload(item), { silent: true, link: { purchaseId: item.id } });
    if (!res.ok) return err('purchase.finance.link', res.code || 'LINK_FAILED', res.message || 'Не удалось создать расход', { id });
    item.financeOpId = res.entity.id;
    save();
    const entry = log({
      action: 'purchase.finance.link', title: 'Покупка связана с финансами', object: purchaseObject(item) + ' · ' + money(res.entity.amount),
      objectType: 'purchase', source: opts.source || 'ui', undoable: true,
      changes: [{ field: 'Связанный расход', from: '—', to: res.entity.title + ' · ' + money(res.entity.amount) },
        { field: 'Счёт', from: '—', to: finAccount(res.entity.account).name }],
      undo: { type: 'batch', steps: [
        { type: 'fields', list: 'purchases', id: item.id, fields: prev },
        { type: 'remove', list: 'ops', id: res.entity.id }
      ], adjust: finAccountAdjust(res.entity, null) }
    });
    return ok('purchase.finance.link', item, { entry, link: res.entity });
  }
  function getPurchase(id) {
    const p = getById(purchasesList(), id);
    return p ? ok('purchase.get', p) : err('purchase.get', 'PURCHASE_NOT_FOUND', 'Покупка не найдена', { id });
  }
  function getPurchases(filters) {
    filters = filters || {};
    const q = String(filters.q || '').trim().toLowerCase();
    const items = purchasesList().filter((p) => {
      if (filters.status && filters.status !== 'all' && purchaseStatusKey(p) !== filters.status) return false;
      if (filters.category && filters.category !== 'all' && (p.category || 'Другое') !== filters.category) return false;
      if (filters.warranty && filters.warranty !== 'all' && purchaseWarrantyKind(p) !== filters.warranty) return false;
      if (!q) return true;
      return [p.name, p.category, p.store, p.sn, p.note, purchaseStatusLabel(p)].join(' ').toLowerCase().includes(q);
    });
    return ok('purchases.get', items, { items, count: items.length });
  }
  function purchasesSummary() {
    const items = purchasesList();
    const owned = items.filter((p) => purchaseStatusKey(p) === 'owned');
    return {
      total: items.length,
      owned: owned.length,
      value: owned.reduce((sum, p) => sumMoney(sum, p.price || 0), 0),
      warrantyActive: items.filter((p) => ['active', 'warn'].indexOf(purchaseWarrantyKind(p)) >= 0).length,
      warrantyAttention: items.filter((p) => ['warn', 'expired'].indexOf(purchaseWarrantyKind(p)) >= 0).length,
      serviceTotal: items.reduce((sum, p) => sumMoney(sum, purchaseRepairTotal(p)), 0)
    };
  }

  /* ================= НАПОМИНАНИЯ =================
     Движок «Уведомлений» (`AvenNotify`) уже умеет создавать, менять и удалять
     напоминания и хранить реакции «прочитано/отложено/скрыто». Второй такой слой
     создавать нельзя, поэтому здесь — единая точка входа общего контракта,
     которая передаёт вызов существующему движку. */
  function notifyEngine() { return window.AvenNotify || null; }
  function reminderResult(action, res) {
    if (!res) return err(action, 'NOTIFY_UNAVAILABLE', 'Раздел «Уведомления» ещё не загружен');
    if (res.ok) return ok(action, res.entity != null ? res.entity : (res.item || null), { entry: res.entry || null, raw: res });
    return err(action, res.code || 'ERROR', res.message || 'Не удалось выполнить действие', { raw: res });
  }
  function createReminder(params, opts) {
    const N = notifyEngine();
    if (!N) return err('reminder.create', 'NOTIFY_UNAVAILABLE', 'Раздел «Уведомления» ещё не загружен');
    return reminderResult('reminder.create', N.reminders.createReminder(params, opts));
  }
  function updateReminder(id, patch, opts) {
    const N = notifyEngine();
    if (!N) return err('reminder.update', 'NOTIFY_UNAVAILABLE', 'Раздел «Уведомления» ещё не загружен');
    return reminderResult('reminder.update', N.reminders.updateReminder(id, patch, opts));
  }
  function deleteReminder(id, opts) {
    const N = notifyEngine();
    if (!N) return err('reminder.delete', 'NOTIFY_UNAVAILABLE', 'Раздел «Уведомления» ещё не загружен');
    return reminderResult('reminder.delete', N.reminders.deleteReminder(id, opts));
  }
  function getReminder(id) {
    const N = notifyEngine();
    if (!N) return err('reminder.get', 'NOTIFY_UNAVAILABLE', 'Раздел «Уведомления» ещё не загружен');
    const r = N.reminders.getReminder(id);
    return r ? ok('reminder.get', r) : err('reminder.get', 'NOT_FOUND', 'Напоминание не найдено', { id });
  }
  function getReminders(filters) {
    const N = notifyEngine();
    if (!N) return err('reminders.get', 'NOTIFY_UNAVAILABLE', 'Раздел «Уведомления» ещё не загружен');
    filters = filters || {};
    let items = N.reminders.getReminders();
    if (filters.dateISO) items = items.filter((r) => r.dateISO === filters.dateISO);
    const q = String(filters.q || '').trim().toLowerCase();
    if (q) items = items.filter((r) => [r.title, r.note].join(' ').toLowerCase().includes(q));
    items = items.slice().sort((a, b) => String(a.dateISO || '').localeCompare(String(b.dateISO || '')) ||
      String(a.time || '').localeCompare(String(b.time || '')));
    return ok('reminders.get', items, { items, count: items.length });
  }
  function notificationAction(name, fn) {
    const N = notifyEngine();
    if (!N) return err(name, 'NOTIFY_UNAVAILABLE', 'Раздел «Уведомления» ещё не загружен');
    const res = fn(N);
    if (res && res.ok) return ok(name, res.entity || null, { raw: res, until: res.until, count: res.count });
    return err(name, (res && res.code) || 'ERROR', (res && res.message) || 'Действие недоступно', { raw: res });
  }

  return {
    dates: { todayISO, localISO, parseISO, diffDays, addDays, humanDate, dateLabel, normalizeDate,
      nowDate, nowMinutes, nowHM, tzOffsetMinutes, tzLabel },
    format: { taskDueLabel, eventTime, eventStart, eventEnd, repeatLabel, reminderLabel,
      money, moneyExact, date: formatDateByProfile, time: formatTimeByProfile, weekStartIndex, currency: currencyInfo },
    profile: { get: getProfile, setField: setProfileField, update: updateProfile,
      fields: () => fieldsOf('profile'), read: readValue, display: displayValue, validate: validateField },
    settings: { get: getSetting, set: setSetting, fields: fieldsOf, label: labelOf,
      field: (p) => { const f = fieldByPath(p); return f ? Object.assign({}, f) : null; },
      read: readValue, display: displayValue, validate: validateField, isSensitive },
    options: { currencies: CURRENCIES, dateFormats: DATE_FORMATS, timeFormats: TIME_FORMATS,
      weekStarts: WEEK_STARTS, timezones: TIMEZONES, languages: LANGUAGES,
      answerStyles: ANSWER_STYLES, confirmLevels: CONFIRM_LEVELS, textSizes: TEXT_SIZES, themes: THEMES },
    tasks: { createTask, updateTask, completeTask, reopenTask, deleteTask, getTask, getTasks, getTasksForDate, getOverdueTasks,
      normalize: applyTaskAliases, isCompleted: taskCompleted, date: taskDate, deadline: taskDeadline, time: taskTime,
      priority: taskPriority, description: taskDescription, tags: taskTags, snapshot: taskSnapshot },
    events: { createEvent, updateEvent, deleteEvent, getEvent, getEvents, getEventsForDate, getNextEvent, getAgenda,
      normalize: applyEventAliases, occursOn: eventOccursOn, start: eventStart, end: eventEnd, description: eventDesc, snapshot: eventSnapshot },

    /* --- Stage 1.3: те же правила контракта, что у задач и событий --- */
    money: { minor: minorUnits, sum: sumMoney, format: money, exact: moneyExact },
    notes: { createNote, updateNote, deleteNote, getNote, getNotes, setNotePinned, setNoteArchived, saveNoteBody,
      createFolder: createNoteFolder, folders: noteFolders, tags: noteTagList, summary: notesSummary,
      snapshot: noteSnapshot, preview: notePreview, folderOf: noteFolderOf },
    finance: { createOperation, updateOperation, deleteOperation, getOperation, getOperations,
      totals: financeTotals, summary: financeSummary, balance: financeBalance,
      byCategory: financeByCategory, monthly: financeMonthly,
      createAccount, updateAccount, deleteAccount, createCategory, deleteCategory,
      accounts: finAccountsList, account: finAccount, categories: finCategoriesList,
      dateISO: opDateISO, snapshot: opSnapshot, inPeriod: opInPeriod },
    auto: { createRecord: createAutoRecord, updateRecord: updateAutoRecord, deleteRecord: deleteAutoRecord,
      getRecord: getAutoRecord, getRecords: getAutoRecords, linkFinance: linkAutoFinance, setMileage,
      stats: autoStats, car: carState, kinds: AUTO_KINDS, label: (k) => AUTO_LABEL[k] || 'Авто',
      listPath: (k) => AUTO_LIST_PATH[k], snapshot: autoSnapshot, cost: autoCost, title: autoTitle,
      dateISO: autoDateISO, docISO: autoDocISO, linkedOp: autoLinkedOp },
    shopping: { createPurchase, updatePurchase, deletePurchase, getPurchase, getPurchases,
      setStatus: setPurchaseStatus, addService: addPurchaseService, linkFinance: linkPurchaseFinance,
      summary: purchasesSummary, categories: purchaseCategories, statuses: SHOP_STATUS,
      statusKey: purchaseStatusKey, statusLabel: purchaseStatusLabel, warrantyKind: purchaseWarrantyKind,
      warrantyState, dateISO: purchaseDateISO, warrantyISO: purchaseWarrantyISO,
      repairs: purchaseRepairs, repairTotal: purchaseRepairTotal, snapshot: purchaseSnapshot,
      linkedOp: purchaseLinkedOp },
    reminders: { create: createReminder, update: updateReminder, delete: deleteReminder,
      get: getReminder, list: getReminders,
      markRead: (key) => notificationAction('notification.read', (N) => N.markRead(key)),
      markAllRead: () => notificationAction('notification.readAll', (N) => N.markAllRead()),
      snooze: (key, days) => notificationAction('notification.snooze', (N) => N.snooze(key, days)),
      unsnooze: (key) => notificationAction('notification.unsnooze', (N) => N.unsnooze(key)),
      dismiss: (key) => notificationAction('notification.dismiss', (N) => N.dismiss(key)),
      restore: (key) => notificationAction('notification.restore', (N) => N.restore(key)),
      notifications: (opts) => { const N = notifyEngine(); return N ? N.build(opts) : []; },
      counts: () => { const N = notifyEngine(); return N ? { unread: N.unreadCount(), active: N.activeCount(), attention: N.attentionCount() } : { unread: 0, active: 0, attention: 0 }; } }
  };
})();
