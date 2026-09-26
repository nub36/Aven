# Female Aven V2 — кандидатные reference-виды (на утверждение владельца)

> Дата: 2026-09-26. Связано с [docs/AVATAR_3D_V2_PLAN.md](../../docs/AVATAR_3D_V2_PLAN.md)
> (раздел 4) и [docs/CHARACTER.md](../../docs/CHARACTER.md) §7 (утверждённая внешность).

## Что это

Кандидатные дополнительные виды Female Aven, полученные из **утверждённого фронтального
reference** (`prototype/assets/character/master/female-aven-reference.jpg`) как входного
изображения — с жёсткой инструкцией «тот же человек, та же причёска (Hair A), цвет (Color B),
макияж (Makeup B), одежда (charcoal mock-neck), фон и свет; меняется только ракурс камеры».

Цель — turnaround для будущего 3D-пайплайна (MetaHuman-фит / FaceBuilder multi-view / скульпт
художника), где одного фронтального фото недостаточно.

**Статус: AI-generated candidate reference views — Under Review.** Утверждён только фронтальный
master. Дополнительные виды **не canonical**, пока их не одобрит владелец.

## Файлы

| Файл | Ракурс |
|---|---|
| (master) `../../prototype/assets/character/master/female-aven-reference.jpg` | front (утверждён) |
| `candidate-left-34.jpg` | 3/4 слева |
| `candidate-left-profile.jpg` | левый профиль (90°) |
| `candidate-right-34.jpg` | 3/4 справа |
| `candidate-right-profile.jpg` | правый профиль (90°) |
| `candidate-back-hair.jpg` | вид сзади (объём/длина волос) |

Сравнительные листы (только crop/resize/компоновка существующих файлов, скрипт
`research/3d/build_v2_review_sheets.sh`):

| Файл | Что это |
|---|---|
| `contact-sheet.jpg` | reference в центре, 5 AI-ракурсов вокруг с пометкой «НЕ УТВЕРЖДЁН» |
| `face-comparison.jpg` | одинаково масштабированные crop лиц (L профиль → L 3/4 → FRONT → R 3/4 → R профиль) |

Те же файлы для web-просмотра: `prototype/assets/character/v2-reference-views/`
(страница проверки identity — `prototype/aven-3d-v2.html`).

## Честный статус

- Статус — **AI-generated candidate reference views — Under Review**.
- Субъективно виды выглядят близко к reference (впечатление агента), но это **НЕ доказательство**
  и **не утверждение**, что «это точно один и тот же человек». **Сходство identity не подтверждено.**
- Это **AI-экстраполяция**, а не фотограмметрический захват: возможны как мелкие расхождения на
  скрытых деталях (ухо, затылок, корни волос), так и незаметные глазу сдвиги черт, меняющие identity.
- Canonical-источник лица остаётся фронтальный master; доп. виды — вспомогательные и только если
  владелец их одобрит.
- **Решение — за владельцем.** Если сходство недостаточно — turnaround должен подготовить
  человек/3D-художник по одному рендеру/модели (см. план, раздел 4, «Если владелец сочтёт…»).

## Лицензия

Производные от утверждённого master Female Aven (проектный ассет). Внешность не
перегенерировалась «с нуля» — использован сам master как вход. Не canonical до утверждения.
