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
├── index.html        — оболочка (sidebar + topbar + рабочая область)
├── css/style.css     — единый дизайн, light/dark темы
└── js/
    ├── data.js       — демо-данные (явно тестовые)
    ├── state.js      — состояние (JS memory + localStorage, ключ aven-proto-v1)
    ├── ui.js         — модальные окна, тосты, форматирование
    ├── pages1.js     — Главная, День, Календарь, Задачи, Заметки
    ├── pages2.js     — Финансы, Авто, Покупки, Автоматизации, Assistant
    ├── tools.js      — Инструменты (часть функций реально работает)
    ├── settings.js   — Настройки и Профиль
    └── app.js        — роутер (hash), меню, тема
```

Зависимостей нет. Сборка не нужна.

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
