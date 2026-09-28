# Неканоническая репетиция следующего backend checkpoint

## Identity и границы

`TASK_ID = NEXT_CRITICAL_CHECKPOINT_REHEARSAL`; `RISK_CLASS = CRITICAL` (cross-branch composition).
`BASE_SHA = 6b97fed7dd87cf7ed3281314d0a85a0b9e2f4328`; актуальный fetched `origin/main`, проверен до правок. Ожидавшийся `f2ca44980ca054b2c8cecd9a5b5e4fdb40e79de1` — его родитель.
Ветка: `codex/next-critical-checkpoint-rehearsal`. Эта задача не является новой задачей Task Graph и не меняет зависимости или статусы canonical checkpoint.

## Goal и sources

Собрать проверяемый non-canonical candidate из явно назначенных кандидатов. Продуктовая семантика определяется `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, утверждёнными interface/task contracts соответствующих кандидатов; репетиция их не меняет. Review состояния получены в задании: TG014/TG018 pending, frontend Fix2 и StartSession PASS; TEST auth local PASS, independent final review не подтверждён. Pending candidates разрешены только для обнаружения конфликтов, `NOT_CANONICAL_YET`.

## Allowed write scope и provenance

- Task-owned delta `dd9aa19`: Public API contracts/schemas; frontend delta `fc0b68d` + `45ee92d` без повторных contracts.
- TG014 delta `fc4f303` + `7dcd40b`; TG018 delta `ffdcd37` + `c820b3d`, без повторных Public API schemas.
- StartSession contract `567a728` и runtime `97c521a`, без исторического повторения TG013 composition.
- TEST auth closure `fe1d5ac` + `31fa324`: только недостающие test/infra changes поверх foundation main.
- Webhook, PG isolation, TG031 tooling/contract уже в базе `6b97fed`; повторно не применять.
- Минимальные integration seams только при подтверждённой технической несовместимости; продуктовых изменений нет.
- Этот task contract; временные verification logs/scripts/receipts — вне Git.

## Forbidden scope и invariants

Нет merge histories, main mutation/push, FAQ `c10c3d`, packaging, TG030/submission docs, TG033 evidence prep. Один semantic patch сохраняется один раз. Review transcript и временные internal evidence не коммитятся. Человеческая Git identity сохраняется. `SPEC CONFLICT` останавливает затронутую работу; pending review не подменяется rehearsal PASS.

## Acceptance и handoff

Node 24.21.0, npm 11.19.0, PostgreSQL 18.x; `npm ci`, typecheck, build, `test:owned-db`; real PG TG014/TG018/TG013/auth, frontend full, contracts, migrations, seed twice, `git diff --check`. Проверить scope/provenance, commit/push только task branch, вернуть SHA и все запрошенные статусы. До canonicalization нужны review PASS на неизменившихся candidate SHA, проверка отсутствия нового main drift и сохранение этого rehearsal как неканонического.

## Разрешённые пересечения интеграции

- `packages/contracts/src/{configuration,index,reads}.ts` сохранены в точности как в `dd9aa19`/`fc0b68d`; TG014/TG018 добавляли те же именованные schemas/aliases, повторные feature-hunks исключены.
- Frontend fixtures и runtime adaptation перенесены из `fc0b68d` + `45ee92d`; старые resilience commits уже эквивалентны main и повторно не применялись.
- `7dcd40b` и `31fa324` содержат одинаковый comment-feed test blob `993ab189f33ae24d2009816936565b7d05d1030c`. Его синхронизация сохранена один раз вместе с frontend adaptation.
- TEST-auth runtime и per-file PG isolation уже в базе. Перенесены только TG019 owned target/receipt и его TypeScript declaration, PG discovery, Vitest source-only include, listener-limit accounting и соответствующие guards из `fe1d5ac`.
- Обе разные записи `ADR-028` сохранены; новая запись StartSession получила свободный номер `ADR-029`. Содержание решений не менялось.
- Центральный runtime registry TG029 не реализуется этой задачей; TG031 проверяется только в назначенном tooling/contract scope.