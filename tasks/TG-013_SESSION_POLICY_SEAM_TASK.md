# TG-013 — совместимость session/policy seam

## TASK ID

`TG013-CRIT-001`.

## TITLE

Точный выбранный RoleBinding для demo session и текущая проверка прав.

## BASE_SHA

`4f9116ac62fbc2139b340154fe3b2cfdd0325bef`.

## PURPOSE

Закрыть только зависимость §8 final TG-013 contract `e797423dd0cf20e8ad04e2089d841c335142a477`.

## REQUIRED CONTEXT

`tasks/TG-013_TASK_CONTRACT.md` в указанном commit, `docs/05_INTERFACE_CONTRACTS.md` §§2–3, 33, `docs/04_DATA_MODEL.md` §29.3, текущий TG-010/TG-011/TG-012 код.

## IN SCOPE

Минимальные изменения TG-010 session/token/bootstrap/read, TG-011 policy/revalidation, shared authorization bridge и целевые тесты. Ownership TG-010/TG-011 сохраняется.

## NON-GOALS

DemoRun routes/lifecycle, endpoint actor switch, primary Case binding, TG-014 и frontend.

## DEPENDENCIES

TG-008 `1075a07d7b2546fc7aaed8c060837d58fb315c29`; TG-012 `141d4a5ea7206cc34410def9ecdfa97b61fe1d53`; final TG-013 contract `e797423dd0cf20e8ad04e2089d841c335142a477`.

## ALLOWED FILES

`tasks/TG-013_SESSION_POLICY_SEAM_TASK.md`, `apps/api/src/modules/auth/**`, `apps/api/src/modules/authorization/**`, `apps/api/src/modules/max-identity/repository.ts`, `apps/api/src/modules/commands/kernel/authorization.ts`, `apps/api/test-integration/**`, целевые тесты в этих каталогах.

## FORBIDDEN FILES

`docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, DB migrations, seed, frontend, DemoRun routes и TG-014.

## ACCEPTANCE CRITERIA

§§7, 9–10 TG-013: exact selected binding без fallback/union; текущая проверка user, binding, relevant access, run/allowlist, contractor и Case/Assignment на всех применимых границах; revoke действует на следующий request, включая replay; valid actor восстанавливается.

## VERIFICATION COMMANDS

`npm ci`, `npm run typecheck`, `npm run build`, TG-010/TG-011/TG-012 regressions, новые seam и PostgreSQL tests, `npm test`, `git diff --check`.

## ESCALATION TRIGGERS

`SPEC CONFLICT`, неверный base SHA, выход за разрешённые файлы, невозможность обеспечить current policy без смены продуктового правила.

## DELIVERABLE

Изменения, результаты проверок и SHA ветки.

## COMMIT / PUSH REQUIREMENTS

Commit и push только `codex/tg-013-session-policy-seam` с существующей человеческой Git identity; вернуть полный SHA и проверить remote match.
