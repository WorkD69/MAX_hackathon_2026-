# TG-018 Production Fix2 — контракт исправления

## TASK ID

`TG-018 Production Fix2`

## TITLE

Устранить deadlock конфигурационных writers и ошибку cross-endpoint replay.

## BASE_SHA

`ffdcd37b193e0e9c1ac736d2ca0073eae03dceff`

## PURPOSE

Закрыть ровно два finding независимого review: F-01 P1 и F-02 P2.

## REQUIRED CONTEXT

Текущий запрос владельца Fix2, `tasks/TG-018_TASK_CONTRACT.md`,
`packages/db/src/transactions/command-kernel.ts`,
`packages/db/src/transactions/command-execution.ts`,
`packages/contracts/src/configuration.ts` и исходный implementation candidate.

## IN SCOPE

- Совместимый с FK `KEY SHARE` row lock для AppUser при сохранении сериализации child binding.
- Разрешение stored operation, target и success schema по исходному `CommandExecution`.
- Реальные PostgreSQL regression tests обоих finding, replay и security gates.

## NON-GOALS

Новые endpoint, изменение Product, central registry, TG-012 kernel, schema и migrations.

## DEPENDENCIES

Контракт `dd9aa19b4bc799c7fa2e3b5e4609d9cf4db9289c`, implementation candidate
`ffdcd37b193e0e9c1ac736d2ca0073eae03dceff`.

## ALLOWED FILES

- `apps/api/src/modules/configuration/service.ts`
- `apps/api/src/modules/configuration/repository.ts`
- `apps/api/src/modules/configuration/configuration.pg.test.ts`
- `tasks/TG-018_PRODUCTION_FIX2_TASK.md`

## FORBIDDEN FILES

`docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, central registration,
`packages/db/src/transactions/**`, migrations, frontend и остальные модули.

## ACCEPTANCE CRITERIA

- Два законных writers завершаются без `40P01` и HTTP 500 при обоих порядках.
- Same-key cross-operation с видимыми target даёт `IDEMPOTENCY_KEY_REUSE`/409.
- Скрытый requested или stored target даёт текущий security denial до конфликта ключа.
- Exact replay возвращает сохранённые status/body; отказ не меняет audit/revision.
- Сохранены изоляция tenant, lock order и протокол TG-012.

## VERIFICATION COMMANDS

`vitest run apps/api/src/modules/configuration/configuration.pg.test.ts`,
`npm run test:owned-db`, `npm run typecheck`, `npm run build`, `git diff --check`.
Тесты выполняются на Node 24.21.0, npm 11.19.0 и PostgreSQL 18.x.

## ESCALATION TRIGGERS

Несовпадение `BASE_SHA`, `SPEC CONFLICT`, необходимость изменения запрещённого файла
или невозможность подтвердить отсутствие `40P01` на реальном PostgreSQL.

## DELIVERABLE

Исходники, regression tests, результаты команд и полный SHA коммита.

## COMMIT / PUSH REQUIREMENTS

Commit и push ветки `codex/tg018-production-fix2` существующей человеческой Git identity.
