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

  return {
    dates: { todayISO, localISO, parseISO, diffDays, addDays, humanDate, dateLabel, normalizeDate,
      nowDate, nowMinutes, nowHM, tzOffsetMinutes, tzLabel },
    format: { taskDueLabel, eventTime, eventStart, eventEnd, repeatLabel, reminderLabel,
      money, date: formatDateByProfile, time: formatTimeByProfile, weekStartIndex, currency: currencyInfo },
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
      normalize: applyEventAliases, occursOn: eventOccursOn, start: eventStart, end: eventEnd, description: eventDesc, snapshot: eventSnapshot }
  };
})();
