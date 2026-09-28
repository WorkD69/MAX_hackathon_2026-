# StartDemoRun session forward fix

## TASK ID

`TG-010 / TG-013 / TG-020` targeted runtime delta.

## TITLE

Атомарная application session после StartDemoRun и защита web context от поздних ответов.

## BASE_SHA

`ab58321637f052787e24777b9a28241ecb10b068` — task-local runtime base после проверки фактического `origin/main`.

## PURPOSE

Успешный Start выдаёт новую session той же server-derived MaxIdentity для нового DemoRun внутри command transaction. Web устанавливает её напрямую и защищает новый context локальным поколением.

## REQUIRED CONTEXT

`docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, `docs/05_INTERFACE_CONTRACTS.md`, `tasks/TG-013_TASK_CONTRACT.md`, `tasks/TG-020_TASK_CONTRACT.md`, reviewed contract `1304b3255042c8fc55004f6502724af08a9ea0bc`.

## IN SCOPE

TG-010 issuer, TG-013 Start orchestration/replay, TG-020 SessionProvider и связанные тесты.

## NON-GOALS

Live MAX, `/auth/max` после Start, TG-029 registry, изменение Product/Graph и создание Case.

## DEPENDENCIES

TG-010, TG-011, TG-012, TG-013 composition `ab58321637f052787e24777b9a28241ecb10b068`; independent review reviewed contract: PASS.

## ALLOWED FILES

`apps/api/src/modules/auth/service.ts`, `apps/api/src/modules/demo/**`, `apps/web/src/features/session/**`, этот task file и файлы reviewed contract, перенесённые cherry-pick.

## FORBIDDEN FILES

`docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, `tasks/TASK_GRAPH.md`, `apps/web/src/app/**`, MAX live adapter, Case workflow.

## ACCEPTANCE CRITERIA

Start по действующему Bearer работает при истёкшем исходном initData и выдаёт actor-null session нового run. Отказ выдачи/сериализации откатывает Start. Replay возвращает тот же body/token/expiry. Старый token не получает authority нового run. Web не вызывает повторный `/auth/max` и игнорирует поздние ответы старого поколения.

## VERIFICATION COMMANDS

`npm run typecheck`, `npm run build`, `npm test -w @max-smart-city/web`, TG-013 real PostgreSQL integration suite через owned-db harness, `git diff --check`.

## ESCALATION TRIGGERS

`SPEC CONFLICT`, неверный base, выход за разрешённые файлы или неразрешимый конфликт с reviewed contract.

## DELIVERABLE

Код, тесты, результаты проверок, commit SHA и статус remote branch.

## COMMIT / PUSH REQUIREMENTS

Commit и push только `codex/start-session-runtime-fix`; существующая человеческая Git identity без AI attribution. `main` не push.
