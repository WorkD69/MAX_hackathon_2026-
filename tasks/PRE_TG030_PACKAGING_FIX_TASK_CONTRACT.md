# PRE-TG030 — исправление production packaging boundary

## 1. Identity / BASE_SHA

- `TASK_ID`: `PRE-TG030-PACKAGING-FIX`.
- `RISK_CLASS`: `DELIVERY`.
- `BASE_SHA`: `f2ca44980ca054b2c8cecd9a5b5e4fdb40e79de1` (`origin/main` на старте).
- Ветка: `codex/docker-production-output-fix`; исходный spike
  `12ec1a66d34ee30ae234ff531d6ad1a96cf9effa` включён merge-коммитом.

## 2. Goal

Исключить тестовые модули, фикстуры и синтетические credential markers из
runtime output Docker spike без изменения обычной тестовой сборки API.

## 3. Canonical sources

- `tasks/TASK_GRAPH.md`, TG-029/TG-030: финальная композиция предшествует TG-030.
- `docs/09_HACKATHON_CRITERIA.md`: требования Docker к сдаче.
- `apps/api/src/config/schema.ts`: контракт `BUILD_SHA`.

Продуктовые правила не меняются.

## 4. Dependencies / unlocks

Этот preparation fix закрывает structural packaging finding до TG-030. Он не
меняет canonical dependency `TG-029 → TG-030` и не закрывает TG-030.

## 5. Allowed write scope

`apps/api/tsconfig.production.json`, `apps/api/package.json`,
`Dockerfile.spike`, `compose.spike.yaml`, `.dockerignore`, `.gitignore`,
`tests/support/production-package.test.mjs`, `spike/README.md` и этот контракт.

## 6. Forbidden scope

Product Freeze/Spec, TG-029 registry, canonical `Dockerfile`/`compose.yaml`,
production credentials, VPS, live MAX и deploy.

## 7. Required behavior / invariants

Production API output исключает `*.test.*`, `*.spec.*`, integration/e2e helpers,
fixtures и test-only modules. Runtime сохраняет API, web assets, DB migrations,
seed CLI/dependencies, workspace metadata и `USER node`. Healthcheck проверяет
только liveness. `BUILD_SHA` задаётся полным immutable commit SHA при build.

## 8. Dependency requests

`NONE`: новые пакеты не нужны.

## 9. Acceptance criteria

Структурный gate проходит на production output и Docker COPY boundary; normal
build/test compilation остаётся доступной. Linux runtime evidence отдельно
обозначается `NOT_RUN`, если Docker Engine недоступен.

## 10. Required tests

`npm ci`, production build, `npm run test`, `npm run typecheck`, `npm run build`,
`node --test tests/support/production-package.test.mjs`, `git diff --check`.
При доступном Docker Engine — optional image build/smoke.

## 11. Git / integration handoff

Commit и push только рабочей ветки; вернуть полный SHA, результат проверок и
передать на отдельную интеграцию. `main` не push.

## 12. Blocker protocol

Остановить затронутую работу при `SPEC CONFLICT`, неожиданном изменении базы,
выходе за write scope или изменении утверждённого контракта. Не выдавать
недоступный Linux runtime и readiness за PASS.
