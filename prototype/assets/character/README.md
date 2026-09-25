# Aven character assets — FINAL 2D MASTER Female

**Статус: FINAL FEMALE AVEN утверждена владельцем (2026-09-25).** Интеграция на Главную —
после отдельного одобрения preview владельцем (preview выполнены, ждут решения).

## Утверждённый visual reference (UX/art decision, НЕ ADR)

- Face: reference face (этап 0, вариант D первого раунда)
- Hair: **HAIR A** — прямые распущенные ~до плеч, пробор как в master
- Hair color: **COLOR B** — dark chocolate brown
- Makeup: **MAKEUP B** — Soft Professional
- Clothing: текущая dark minimal (charcoal mock-neck с violet-blue zip-деталью)
- Composition: head + full neck + shoulders (бюст)

Внешность **НЕ перегенерировать** без прямого указания владельца.

## Файлы

| Путь | Назначение | Правило |
|---|---|---|
| `master/female-aven-reference.jpg` | SOURCE MASTER с фоном (утверждённый MAKEUP B) | **НИКОГДА не перезаписывать** обработанными версиями |
| `web/female-aven-transparent.png` | производная: master с удалённым фоном, RGBA (741×700) | регенерируется только из master pipeline'ом ниже |

## Pipeline прозрачности (воспроизводимо)

1. Source: `master/female-aven-reference.jpg` (без регенерации внешности).
2. MediaPipe Selfie Segmentation (model_selection=1, модель встроена в wheel) → soft mask.
3. Trimap (FG >0.93 / BG <0.07 / unknown) → pymatting closed-form alpha (`estimate_alpha_cf`).
4. Деконтаминация цвета фона: `estimate_foreground_ml` (анти-halo).
5. Crop по alpha bbox + pad 6px → RGBA PNG.
Инструменты: venv с mediapipe 0.10.21 + pymatting + opencv-headless (вне репозитория).

## Проверка качества (выполнена)

- QC-лист краёв (макушка / уши+пряди / плечи+одежда) на белом и почти чёрном:
  `../../../review/3d-character-concepts/final/qc-sheet.jpg` — без синей/белой каймы,
  без halo, без остатков фона, пряди сохранены.
- Preview: A белый, B почти чёрный, C реальный фон Главной (light `#f4f5fa`),
  D dark theme (`#0f1117`) — `../../../review/3d-character-concepts/final/preview-*.jpg`.

## План интеграции (после одобрения preview владельцем)

- Desktop: слева приветствие + «Что сделать?», справа Female Aven **без собственного
  прямоугольного фона**; за ней CSS background сайта (soft radial indigo/violet glow).
- Female должна визуально находиться В интерфейсе, а не выглядеть вставленной фотографией.
- Персонаж не содержит нарисованного background (прозрачность подтверждена preview).
