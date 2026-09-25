# Aven — Visual Prototype

**Визуальный интерактивный прототип будущего сайта Aven.**

> ⚠️ Это **НЕ** production-приложение: без backend, без базы данных, без авторизации, без API и миграций.
> Прототип нужен только для **UX/продуктового проектирования**: смотреть на структуру, навигацию, страницы и формы глазами пользователя.
> Технология прототипа (статический HTML/CSS/JS) **не является ADR для production** и не влияет на выбор production-стека ([docs/DECISIONS.md](../docs/DECISIONS.md)). Данные — mock/demo, хранятся локально в браузере (localStorage).

## Запуск

### Вариант 1 — просто открыть файл

Открыть в браузере:

```
prototype/index.html
```

(двойной клик по файлу или перетащить его в окно браузера; скрипты классические, работают с `file://`)

### Вариант 2 — локальный статический сервер

```bash
cd prototype
python3 -m http.server 8080
# открыть http://localhost:8080
```

или любой другой статический сервер (`npx serve`, `php -S`, nginx — что угодно).

## Что внутри

```
prototype/
├── index.html          — оболочка (sidebar + topbar + рабочая область + плавающий Aven)
├── voice-lab.html      — A/B-сравнение голосов исследования TTS (этап 1)
├── voice-lab-vd17.html — расширенный сценарный тест фаворита vd17-design (этап 2)
├── voice-lab-name.html — произношение «Aven / Авен»: мини-прогон способов (этап 2.1)
├── css/style.css       — единый дизайн, light/dark темы
├── css/character.css   — персонаж, плавающий виджет, демо-команды (опц. слой)
├── assets/
│   ├── aven-female.png — вымышленный персонаж «Ава» (Female, компактные аватары)
│   ├── aven-male.png   — вымышленный персонаж «Авен» (Male)
│   └── character/
│       ├── master/female-aven-reference.jpg — FINAL 2D MASTER (с фоном; не перезаписывать)
│       └── web/female-aven-transparent.png  — FINAL Female Aven, RGBA (hero, Assistant)
│   └── voice-samples/  — компактный набор MP3 исследования TTS (232 файла) + manifest.js
│                         (генерирует research/tts/collect.py по политике candidates.json → publish;
                         193 — базовый набор T1–T10 (вариант Б), +21 — расширенный тест vd17-design (этап 2),
                         +18 — мини-прогон произношения «Авен» (этап 2.1))
└── js/
    ├── data.js         — демо-данные (явно тестовые) + settings.character / voice.stt
    ├── state.js        — состояние (JS memory + localStorage, ключ aven-proto-v1)
    ├── ui.js           — модальные окна, тосты, форматирование
    ├── character.js    — персонаж: реестр Female/Male, аватар, плавающий Aven (опц. слой)
    ├── presence.js     — отображение состояния Aven (idle/listening/thinking/speaking/
    │                     waiting/success/important): текст + классы glow/wave; НЕ state engine
    ├── voice.js        — AvenVoice.speak/stop (через AvenTTS) + экспериментальный STT SpeechRecognition
    ├── tts/normalize.js — нормализация текста ТОЛЬКО для речи (числа, время, даты, деньги, единицы)
    ├── tts/providers.js — TTSProvider: System (speechSynthesis, fallback) + Natural (эксперимент)
    ├── flows.js        — демо state machine: многошаговая заправка, важное событие
    ├── pages1.js       — Главная (hero с Female Aven), День, Календарь, Задачи, Заметки
    ├── pages2.js       — Финансы, Авто, Покупки, Автоматизации, Assistant (+персонаж/STT)
    ├── tools.js        — Инструменты (часть функций реально работает)
    ├── settings.js     — Настройки и Профиль (+категория «Персонаж»)
    └── app.js          — роутер (hash), меню, тема, монтаж плавающего Aven
```

Зависимостей нет. Сборка не нужна.

`voice-lab.html` — A/B-сравнение голосов исследования TTS (docs/TTS_RESEARCH.md). Натуральный голос
для произвольного текста — через исследовательский сервер: `python research/tts/server.py` (см. docstring).

`voice-lab-vd17.html` — **расширенный сценарный тест фаворита владельца** `qwen3/vd17-design`
(Qwen3-TTS, этап 2): реальные реплики Aven группами (короткие ответы, напоминания, деньги, авто,
вопрос, предупреждение, длинный ответ), отдельный блок «произношение Aven/Авен» из 4 вариантов
нормализации, ★ за каждую фразу, проигрывание группы/всех подряд и кнопка «Системный голос»
для сравнения с текущим fallback. Данные берутся из `assets/voice-samples/manifest.js` → `extended`
(строится `research/tts/collect.py` из `research/tts/phrases_vd17.json`); если образцы ещё не
сгенерированы, страница честно говорит об этом. Это кандидат, а не обязательный голос Aven:
`speechSynthesis` остаётся движком по умолчанию.

`voice-lab-name.html` — **мини-прогон способов произношения «Авен»** (этап 2.1): 18 вариантов,
сгруппированных по способу (эталон VoiceDesign · перебор орфографии · подсказка в промпте · клоны
0.6B-Base и 1.7B-Base), сравнение шести вариантов одной фразы подряд, ★ за каждый вариант,
кнопка «Системный голос», побуквенная метрика имени `name_lwer` и таблица «кто как говорит «Авен»»
по всем предыдущим прогонам. Данные — `assets/voice-samples/manifest.js` → `name` (строит
`research/tts/collect.py` из `research/tts/phrases_name.json`); если образцов ещё нет, страница
честно об этом говорит, а метрики по прежним клипам показывает всё равно. Итоги — docs/TTS_RESEARCH.md §16.

## Персонаж и голос (опциональный слой, без AI)

- **Hero Главной с Female Aven (FINAL 2D master):** слева приветствие + состояние
  (● Готова / Слушаю… / Думаю… / Говорю… / Жду ответа… / Готово / Важное событие) +
  «Чем помочь?» + поле команды + 🎤 + отправить + строка последнего ответа + ближайшее
  событие; справа — прозрачный bust `assets/character/web/female-aven-transparent.png`
  **без рамки и прямоугольного фона**: glow / декоративные круги / voice waveform рисует
  CSS под персонажем (не часть PNG); низ бюста мягко растворяется у границы hero (mask).
  Клик по персонажу — фокус в поле команды; повторный клик — suggestions. Состояния
  выводятся из существующих подсистем (TTS onstart/onend, STT, flows) через `presence.js` —
  второго state engine нет. Character Off → hero во всю ширину. Reduced motion отключает
  glow/wave-анимации. Скриншоты проверки: `../review/hero-integration/`.
- **Персонаж** (вымышленные «Ава»/«Авен») — только оформление: аватар в Assistant, плавающая кнопка, приветствия. Включается/выключается в «Настройки → Персонаж»; при выключении — нейтральный логотип «A», функции не меняются ([docs/CHARACTER.md](../docs/CHARACTER.md), ADR-014).
- **Голос:** озвучка ответов через браузерный `speechSynthesis`; голосовой ввод — экспериментальный `SpeechRecognition` (🎤). Честный статус поддержки — в «Настройки → Голос»; при недоступности — всегда текст.
- **Демо-команды (state machine, без AI):** «⚡ Заправился» и «⚡ Важное событие» — многошаговые сценарии с валидацией и подтверждением; «Отмена» ничего не записывает.
- Это UX-прототип: не Command Engine, не production, нет AI и платных API.

## GitHub Pages preview

Постоянный публичный preview прототипа публикуется через GitHub Actions ([.github/workflows/prototype-pages.yml](../.github/workflows/prototype-pages.yml)) — только содержимое папки `prototype/`. Это preview для UX-проектирования, не production.

### Что нужно сделать владельцу (один раз)

1. Зайти на GitHub: репозиторий **nub36/Aven** → вкладка **Settings**.
2. В левом меню выбрать **Pages** (раздел «Code and automation»).
3. В блоке **Build and deployment → Source** выбрать **GitHub Actions** (не «Deploy from a branch»).
4. Запустить деплой:
   - вкладка **Actions** → слева **Prototype Pages** → **Run workflow** → выбрать ветку (`arena/01a0d7ec-aven` или `main`) → **Run workflow**;
   - либо просто дождаться/сделать push с изменениями в `prototype/**` в эти ветки — workflow сработает автоматически.
5. Дождаться зелёной галочки у job `deploy` — ссылка появится в выводе шага «Deploy to GitHub Pages».

### Итоговая постоянная ссылка

```
https://nub36.github.io/Aven/
```

Прототип рассчитан на размещение в подкаталоге: в `index.html` только относительные пути (`css/style.css`, `js/*.js`), навигация — hash-based (`#/home`), favicon — data-URI, абсолютных путей (`/assets/...`) нет.

### Обновление preview

- Изменения `prototype/**` в ветках `main` или `arena/01a0d7ec-aven` деплоятся автоматически.
- Из другой ветки — вручную: **Actions → Prototype Pages → Run workflow → выбрать ветку**.
- Если основная ветка проекта изменится — поправьте список веток в `on.push.branches` в workflow-файле.

> Примечание: если репозиторий приватный, GitHub Pages может требовать платный план — тогда откройте репозиторий или используйте локальный запуск (см. выше).

## Сброс демо-данных

Настройки → Приватность → «Сбросить демо-данные» (или очистить localStorage: ключ `aven-proto-v1`).
