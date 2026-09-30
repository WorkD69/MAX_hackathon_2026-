# FINAL-SUBMISSION-FREEZE — контракт задачи

## TASK ID
FINAL-SUBMISSION-FREEZE

## TITLE
Финальный пакет сдачи MAX Smart City

## BASE_SHA
`332ac4aee174a8743324b82b38853b3a3751d2e9`. Проверен через `git rev-parse HEAD` до изменений.

## PURPOSE
Один submission commit с точным application code базового SHA, проверяемым Docker-запуском, API-документами и чистым архивом.

## REQUIRED CONTEXT
Задание пользователя, `AGENTS.md`, `tasks/TASK_TEMPLATE.md`, `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, актуальные routes/config/schema/seed и delivery baseline `22bf88be7ed9fc0c04d13b9cab13a455c7817a13`.

## IN SCOPE
Перенос и синхронизация только delivery, documentation и config artifacts. Независимые направления: API-документы; README и submission-документы; Docker/runtime; затем единая интеграция и проверка.

## NON-GOALS
Любые изменения business logic, UX, API behavior, state machine, auth, MAX integration и database semantics.

## DEPENDENCIES
Точный application SHA и существующие delivery artifacts. Final smoke production выполняет пользователь отдельно.

## ALLOWED FILES
`.dockerignore`, `.env.example`, `Dockerfile`, `compose*.yaml`, `README.md`, `openapi.yaml`, `DATA-API.yaml`, `docs/submission/**`, `scripts/delivery/**`, при доказанной необходимости только `package.json` и `package-lock.json`.

## FORBIDDEN FILES
`apps/**`, `packages/**`, прочие `scripts/**`, нормативные продуктовые документы, `AGENTS.md`, application tests.

## ACCEPTANCE CRITERIA
Application tree byte-for-byte соответствует `332ac4a`; route/schema parity; Docker build, migrations, idempotent seed, web/API/PostgreSQL/readiness/BUILD_SHA и persistence; PostgreSQL не опубликован; секреты отсутствуют; ZIP и SHA-256; один commit/push/tag после PASS.

## VERIFICATION COMMANDS
`git diff --check`; `node scripts/delivery/generate-api.mjs`; `node scripts/delivery/validate.mjs`; `python scripts/delivery/validate-openapi.py`; `docker compose config --quiet`; clean checkout `docker compose up --build`; HTTP smoke; restart/persistence; tree secret scan; archive listing/checksum; remote SHA check.

## ESCALATION TRIGGERS
`SPEC CONFLICT`, неверный base SHA, необходимость менять запрещённые файлы, невозможность подтвердить обязательные Docker/secret checks или расхождение API-документов с final code.

## DELIVERABLE
Проверенный пакет, полный commit SHA, tag, чистый ZIP и checksum либо честный `BLOCKED` с причиной.

## COMMIT / PUSH REQUIREMENTS
Один commit поверх base, push только `origin/codex/final-submission-freeze`, без merge/force push. Существующая человеческая Git identity, без AI attribution.
