# TEST Auth Stable Gate Closure

## TASK ID

`TEST_AUTH_STABLE_GATE_CLOSURE`

## TITLE

Закрытие оставшегося TEST-auth verification gate.

## BASE_SHA

`fe1d5ac9ea4d0de61ad9d67a9c5e376ffa8cb8c6`

## PURPOSE

Отделить перегрузку review host от дефекта owned PostgreSQL test infrastructure и обеспечить
воспроизводимую проверку root suite без изменения product/auth runtime.

## REQUIRED CONTEXT

- `tasks/TEST_AUTH_RUNTIME_CLOSURE_TASK.md` и входные SHA задачи.
- `scripts/test/README.md`, `tests/support/provisioning.postgres.mjs`.
- `apps/web/src/features/resident/comments/comment-feed.test.tsx` только для найденного root blocker.

## IN SCOPE

- Измерения targeted auth, real auth/PG, PG infrastructure, existing PG suites и root.
- Узкая синхронизация web-теста после failed mutation, если root blocker воспроизведён.
- Проверка cleanup owned DB/roles, typecheck и build.

## NON-GOALS

- Production auth, продуктовые правила, глобальные timeout и file parallelism.
- Будущие TG026/TG027 suites и изменение интеграции main.

## DEPENDENCIES

Node 24.21.0, npm 11.19.0, выделенный disposable PostgreSQL 18.x.

## ALLOWED FILES

- `apps/web/src/features/resident/comments/comment-feed.test.tsx`.
- `tasks/TEST_AUTH_STABLE_GATE_CLOSURE_TASK.md`.
- Временный, не коммитимый `apps/api/tests/test-auth-real-pg-gate.mjs`.

## FORBIDDEN FILES

- `apps/api/src/**` и `apps/web/src/**` вне указанного test-файла.
- `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`.
- Production routes, migrations, canonical test runner configuration.

## ACCEPTANCE CRITERIA

- Целевые auth и real HTTP→HMAC→PG→session проверки проходят; tampered/expired и production key отвергаются.
- PG infrastructure и existing real-PG suites проходят без cancelled/timeouts и без owned resource leak.
- Три полных root PASS после узкого тестового исправления; file parallelism остаётся default.
- Typecheck, build и cleanup проходят.

## VERIFICATION COMMANDS

`npm ci`; targeted auth Vitest; `npm run test:infra:postgres`;
`npm run test:integration:owned-db`; `npm run test:owned-db`;
`npm run typecheck`; `npm run build`; `git diff --check`.

## ESCALATION TRIGGERS

SPEC CONFLICT, source defect, выход за разрешённые файлы, несоответствие base SHA,
недоказанный ownership или cleanup failure.

## DELIVERABLE

Task branch с тестовой правкой при необходимости, измерениями и итоговым gate status.

## COMMIT / PUSH REQUIREMENTS

Commit и push только task branch с существующей человеческой Git identity; вернуть полный SHA.
