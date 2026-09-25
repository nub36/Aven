# ADMIN — Спецификация административной панели

> **Статус:** проектная документация (спецификация будущей админ-панели). В MVP входит лишь «базовая админка» (черновик состава — [PROJECT_PLAN.md](PROJECT_PLAN.md)).
> **Последнее обновление:** 2026-09-25

---

## 0. Ключевые ограничения

- **Администратор не должен по умолчанию получать содержимое приватных пользовательских заметок и файлов.** ([ADR-008](DECISIONS.md))
- **Критический audit trail нельзя позволять обычному администратору незаметно удалять.**
- Не логировать секреты, passwords, raw auth tokens и лишние приватные данные.

---

## 1. Dashboard

- регистрации;
- активные пользователи;
- команды;
- workflows;
- состояние очередей;
- errors;
- storage;
- service health.

## 2. Users

- поиск;
- ID;
- email;
- статус;
- registration date;
- last login;
- devices;
- quota;
- block/unblock;
- технические действия.

## 3. RBAC

Роли:

- user;
- moderator;
- support;
- admin;
- superadmin;
- granular permissions (детальные права).

## 4. Global Settings

- название;
- branding;
- registration enabled;
- email verification;
- quotas;
- module enable/disable;
- maintenance mode.

## 5. Feature Flags

- по модулю;
- группе;
- проценту пользователей;
- конкретным аккаунтам — в будущем.

## 6. Voice

- STT providers;
- TTS providers;
- languages;
- defaults;
- fallback;
- limits.

Связано: [VOICE.md](VOICE.md).

## 7. Command Engine

- intents;
- actions;
- system phrases;
- synonyms;
- parameter types;
- conflicts;
- versions;
- diagnostics.

Связано: [COMMAND_ENGINE.md](COMMAND_ENGINE.md).

## 8. Automation

- workflows;
- executions;
- queues;
- failed runs;
- retry;
- disable workflow;
- block registry (реестр разрешённых блоков — [AUTOMATION.md](AUTOMATION.md)).

## 9. Integrations

- API providers;
- configuration;
- health;
- encrypted secrets.

Связано: [INTEGRATIONS.md](INTEGRATIONS.md).

## 10. Notifications

- scheduled;
- delivered;
- failed;
- retry.

## 11. Email

- SMTP/provider;
- templates;
- test sending.

## 12. Storage

- total;
- quotas;
- file types;
- max size;
- backend configuration.

## 13. Security

- admin sessions;
- mandatory/available 2FA;
- rate limits;
- suspicious activity;
- security events.

## 14. Audit Log

- admin;
- action;
- timestamp;
- target;
- old/new — где безопасно;
- IP/session metadata.

**Ограничение:** критический audit trail нельзя позволять обычному администратору незаметно удалять (механизм — открытое решение, см. [SECURITY.md](SECURITY.md)).

## 15. System Logs

- backend;
- scheduler;
- workers;
- WebSocket;
- sync;
- integrations.

**Ограничение:** не логировать секреты, passwords, raw auth tokens и лишние приватные данные.

## 16. Health

- API;
- DB;
- cache/queue;
- workers;
- scheduler;
- storage;
- email;
- push;
- voice integrations.

## 17. Backup

- состояние;
- последний успешный backup;
- restore verification status.

## 18. Migrations

- database schema version;
- migration status.

## 19. Announcements

- глобальные и выборочные сообщения (пользователям).

## 20. Privacy/Legal

- версии документов (политика и т.п.);
- consent version tracking (какие версии условий принял пользователь).

## 21. Emergency Controls

- disable registration;
- disable upload;
- disable integration;
- pause workflow execution;
- maintenance mode.

---

## Открытые вопросы

1. Состав «базовой админки» MVP — какой минимальный набор разделов (вероятно: Users, базовые Global Settings, Feature Flags, Health) — утвердить на этапе 1.
2. Механизм защиты критического audit trail.
3. Модель гранулярных прав (granular permissions) — формат и управление.
4. Инструменты «технических действий» над пользователем (Users) — точный перечень и их аудит.
