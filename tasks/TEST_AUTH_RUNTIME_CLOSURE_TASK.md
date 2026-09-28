# TEST Auth Runtime Closure

## TASK ID

`TEST_AUTH_RUNTIME_CLOSURE`

## TITLE

Проверка TEST-auth runtime на актуальном `main` с PostgreSQL 18.

## BASE_SHA

`f2ca44980ca054b2c8cecd9a5b5e4fdb40e79de1`

## PURPOSE

Закрыть runtime gate реализации `4af3828d55612beda6a1802d96302e88960be23b` без изменения продуктовой логики.

## REQUIRED CONTEXT

- Контракт `4a93255bbb439159d1773088e331fd5a677f5683`, independent review `PASS`.
- PostgreSQL isolation candidate `19e6e495b2f9137d751247960d05c65069d12d6f`, independent review `PASS`.
- `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, `docs/03_ARCHITECTURE.md`, `docs/05_INTERFACE_CONTRACTS.md` — нормативные границы.
- `scripts/test/README.md` — test-only provisioning и ownership receipts.

## IN SCOPE

- Временная composition implementation и PostgreSQL isolation candidate поверх указанной базы.
- Разрешение merge conflicts в тестах и адаптация test infrastructure к PostgreSQL suites актуального `main`.
- Проверка TEST profile, HMAC, freshness, identity/session, fail-closed и secret boundary.

## NON-GOALS

- Изменение продуктовых правил или auth implementation без доказанного source defect.
- Push в `main`, production deployment, изменение официального MAX protocol.

## DEPENDENCIES

Node `24.21.0`, npm `11.19.0`, выделенный PostgreSQL `18`, disposable test-only cluster.

## ALLOWED FILES

- Файлы implementation commit `4af3828d55612beda6a1802d96302e88960be23b`.
- Файлы PostgreSQL infrastructure commit `19e6e495b2f9137d751247960d05c65069d12d6f`.
- `apps/api/src/modules/notifications/store.pg.test.ts`, `apps/api/vitest.config.ts`.
- `tasks/TEST_AUTH_RUNTIME_CLOSURE_TASK.md`.

## FORBIDDEN FILES

`docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, production auth endpoints и browser code вне implementation commit.

## ACCEPTANCE CRITERIA

- Exact profile `TEST_DEMO_E2E_V1` с 32-byte TEST key; иные сочетания отвергаются при startup.
- Fresh signed `initData` проходит реальный `POST /api/v1/auth/max`, HMAC/freshness, persistence и session issuance.
- Нет fallback на TEST key в production, dual-key validation, утечки key в frontend/system info/logs/errors/responses.
- Все существующие PostgreSQL suites используют отдельные owned disposable DB; root tests идут с default file parallelism.
- Все обязательные команды проверки выполнены; отсутствующие будущие canonical suites отмечены отдельно.

## VERIFICATION COMMANDS

`npm ci`; targeted auth Vitest; `npm run test:infra`; `npm run test:infra:postgres`; `npm run test:integration:owned-db`; `npm run test:owned-db`; `npm run typecheck`; `npm run build`; `git diff --check`.

## ESCALATION TRIGGERS

`SPEC CONFLICT`, source defect, нарушение ownership receipt, ошибка cleanup, нехватка PostgreSQL test infrastructure.

## DELIVERABLE

Проверенная task branch, classification возможных сбоев и итоговые значения runtime gate.

## COMMIT / PUSH REQUIREMENTS

Commit и push только task branch с существующей человеческой Git identity; вернуть полный SHA.
