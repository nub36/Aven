# CHARACTER — Визуальный персонаж Aven (Presentation Layer)

> **Статус:** проектная документация + реализация в визуальном прототипе (`/prototype`).
> **Последнее обновление:** 2026-09-25
> Связанные документы: [UI_UX.md](UI_UX.md), [VOICE.md](VOICE.md), [DECISIONS.md](DECISIONS.md) (ADR-014), [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Суть

Aven может иметь **вымышленный визуальный образ** — персонажа, который озвучивает и «показывает» ответы.
В прототипе доступны два фикциональных персонажа:

| ID | Имя | Образ | Ассет |
|---|---|---|---|
| `female` | Ава | женский | `prototype/assets/aven-female.png` |
| `male` | Авен | мужской | `prototype/assets/aven-male.png` |
| `none` | — | нейтральный логотип «A» | без ассета |

Персонажи — **фикциональные** (выдуманные иллюстрации), не основаны на реальных людях.

## 2. Ключевой принцип: персонаж — опциональный Presentation Layer

- Персонаж — **только визуальное и речевое оформление** (аватар, имя, приветствия, демо-профиль тембра TTS).
- **Никакая бизнес-логика, данные, команды и Command Engine НЕ зависят от персонажа.**
- При выключенном персонаже (`enabled: false` или `none`) весь функционал сайта работает **идентично**, отображается нейтральный логотип «A».
- Это согласуется с ADR-002 (функции без обязательного AI) и ADR-003 (текст всегда доступен): персонаж и голос — надстройка, не условие работы.

## 3. Реализация в прототипе

| Файл | Роль |
|---|---|
| `prototype/js/character.js` | реестр персонажей, конфигурация, аватар с честным fallback, плавающий Aven |
| `prototype/css/character.css` | стили персонажа, плавающего виджета, демо-команд |
| `prototype/js/voice.js` | TTS (speechSynthesis) + экспериментальный STT (SpeechRecognition) |
| `prototype/js/flows.js` | демо state machine: многошаговая заправка, важное событие, демо-команды |
| `prototype/assets/*.png` | изображения персонажей (512×512, оптимизированы) |
| настройки `settings.character` | включение, выбор образа, своё имя, плавающий, приветствие, голосовой профиль |

### Честность (ADR-010)

- Если изображение не загрузилось — аватар честно заменяется логотипом «A» (`onerror`).
- Если браузер не поддерживает STT/TTS — показывается честный статус «нет» и текстовый fallback.
- Авто-озвучка при загрузке **не** выполняется без жеста пользователя (ограничения браузеров); приветствие показывается текстом с кнопкой 🔊.

## 4. Что НЕ является частью персонажа

- Command Engine (Stage 2) и бизнес-логика — не зависят.
- Production-реализация — персонаж в прототипе **не** является ADR для production-стека.
- AI — не используется; фразы персонажа — статичные шаблоны.

## 5. Открытые вопросы

- Нужен ли выбор/кастомизация персонажа в production (или фиксированный бренд-образ)?
- Юридическая чистота и лицензирование финальных ассетов (в прототипе — сгенерированные иллюстрации).
- Анимация/мимика персонажа (в прототипе — только «парение» и пульс индикаторов).

## 6. 3D-направление: бюст, visual concepts (этап review)

> Решение владельца от 2026-09-25; зафиксировано как [ADR-015](DECISIONS.md) (Proposed).

### 6.1 Новая визуальная цель

- 3D Aven — **бюст**: голова + полная шея + немного плеч + верхняя часть груди; нижний край
  кадра немного ниже ключиц («виртуальный собеседник при видеозвонке»). Не до пояса, не полное тело.
- Стиль: premium realistic / semi-realistic digital human; clean, premium, calm, modern,
  slightly futuristic, НЕ sci-fi; без cartoon/anime/plastic doll/uncanny/robot/fantasy/sexualized.
- Одежда: минималистичная верхняя часть; цвета dark navy / indigo / graphite с небольшими
  violet-blue акцентами; без логотипов сторонних брендов.
- **Сначала только Female.** Male 3D — позже, в том же стиле, после утверждения Female владельцем.

### 6.2 Текущий этап: visual concepts (НЕ 3D-модели)

- Кандидаты: `review/3d-character-concepts/` — `female-A.jpg`, `female-B.jpg`,
  `female-C.jpg`, `female-D.jpg` + README с описаниями и чек-листом требований.
- **Это только visual concepts, НЕ готовые 3D models.** PNG/JPG не являются rigged-моделью:
  нет геометрии, rig, blendshapes, visemes; в WebGL они не используются.
- Все кандидаты: одна композиция (бюст), одинаковые освещение и стиль, фронт/небольшой 3/4,
  взгляд на пользователя; различаются лицо, причёска, детали одежды.
- **Решение ждёт владельца.** Победитель не выбран; интеграция в основной интерфейс и
  замена текущего персонажа прототипа запрещены до явного «Выбираю вариант X».
- После утверждения внешности отдельно решается pipeline настоящей модели: custom 3D /
  character creator / commissioned model / licensed base / другой; требования (GLB/GLTF,
  rig head/neck/eyes/jaw, blendshapes incl. blinkLeft/blinkRight/jawOpen, visemes
  REST/A/E/I/O/U/M-B-P/F-V с mapping, hair cards, realtime-бюджет, PBR, лицензионная
  проверка) — в `review/3d-character-concepts/README.md`.

### 6.4 3D V2 pipeline (2026-09-26) — см. AVATAR_3D_V2_PLAN.md, ADR-016

- V1 (TripoSR) зафиксирован как **TECHNICAL 3D POC** (не Female Aven): грубая геометрия, лицо
  плохо держит reference, нет rig/глаз/век/jaw/blendshapes. Его viewer (`aven-3d.html`) не
  улучшается, на Главную не ставится.
- **V2 pipeline (рекомендация):** основной — Epic **Mesh to MetaHuman** (полный ARKit-52 риг,
  отдельные глаза/зубы/веки/jaw, шея, грумы, web-GLB; бесплатно для не-Unreal при выручке <$1M);
  запасной CC0 — **MPFB 2 / MakeHuman** + скульпт художника. FLAME/MICA/DECA отклонены
  (non-commercial). Требует ПК с GPU/художника и решения владельца.
- **Reference turnaround:** доп. виды (front + 3/4 L/R + профили L/R + back) — в
  `prototype/assets/character/v2-reference-views/` и `review/3d-v2-reference-views/`; проверка
  identity на `prototype/aven-3d-v2.html` (contact sheet + face comparison, только crop/resize).
  Статус — **AI-generated candidate reference views — Under Review**: сходство identity не
  подтверждено, виды не canonical до одобрения владельцем. Canonical-источник лица — фронтальный
  master. Внешность не менялась.

### 6.3 Честный статус предыдущего 3D-прототипа

- Коммит предыдущего 3D-прототипа (`ddd1c31`: процедурная Three.js-голова, states, blink,
  visemes, event bus, fallback) **не был push в GitHub и отсутствует в репозитории**;
  3D-кода в репозитории нет; работа невосстановима (проверено 2026-09-25, WORK_LOG запись VII).
- Процедурная голова, если будет пересоздана, — только **Developer/Test Model**
  (Developer Settings → «Use Test 3D Model») для проверки состояний/blink/visemes/lip-sync/
  event bus/fallback. Пользователю как основной 3D Aven она не предлагается.
- Существующие 2D-аватары прототипа (`prototype/assets/aven-*.png`) остаются текущим
  Presentation Layer прототипа до отдельных решений владельца; 3D-направление прототип пока не меняет.

## 7. FINAL 2D MASTER Female Aven (утверждено владельцем 2026-09-25)

> Это UX/art decision владельца, **НЕ новый ADR**. Внешность не перегенерировать без
> прямого указания владельца.

### 7.1 Утверждённый reference

- Face: reference face (раунд 1, вариант D) → **HAIR A** (прямые ~до плеч) → **COLOR B**
  (dark chocolate brown) → **MAKEUP B** (Soft Professional).
- Одежда: dark minimal (charcoal mock-neck с violet-blue zip-деталью); композиция: бюст
  (head + full neck + shoulders).
- Source master с фоном: `prototype/assets/character/master/female-aven-reference.jpg`
  (не перезаписывать). Прозрачная производная для web:
  `prototype/assets/character/web/female-aven-transparent.png` (RGBA 741×700).
- Pipeline прозрачности, QC краёв и preview — `prototype/assets/character/README.md` и
  `review/3d-character-concepts/final/` (preview A белый / B почти чёрный / C фон Главной
  light / D dark theme; qc-sheet краёв). Без синей/белой каймы и halo; внешность не
  регенерировалась — фон удалён у утверждённого изображения.

### 7.2 Статус интеграции

- Preview одобрены владельцем (2026-09-25): «Прозрачную FINAL FEMALE AVEN принимаю».
- **Интегрировано в UX-прототип (2026-09-25):** hero Главной — слева приветствие,
  состояние Aven текстом, «Чем помочь?», поле команды + 🎤 + отправить, строка последнего
  ответа, ближайшее событие; справа Female Aven (transparent asset) без рамки и
  прямоугольного фона; glow/круги/waveform — CSS; низ бюста растворяется у границы hero.
  Клик по персонажу — фокус в поле команды, повторный — suggestions. Assistant использует
  тот же asset в шапке (`.char-bust`). Состояния (idle/listening/thinking/speaking/waiting/
  success/important) выводятся из существующих подсистем через `js/presence.js`
  (НЕ второй state engine). Character Off → hero во всю ширину; reduced motion отключает
  glow/wave. Скриншоты проверки (desktop light/dark, mobile light/dark, speaking, listening,
  character off): `review/hero-integration/`.
- Внешность НЕ перегенерировалась; master не изменён; Male/3D/AI не добавлялись.
- История подборов (этапы 0–3): `review/3d-character-concepts/` (face → hair → color →
  makeup; все этапы identity-locked от master reference).

