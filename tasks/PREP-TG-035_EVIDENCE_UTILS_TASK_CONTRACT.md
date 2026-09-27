# PREP-TG-035 — утилиты метаданных доказательств

## TASK ID

PREP-TG-035

## TITLE

Подготовить отдельный кандидат утилит для будущего TG-035.

## BASE_SHA

`03395807603e205bf321437a559adc70b94ed504`

## PURPOSE

Воспроизводимо формировать метаданные исходного дерева, явных артефактов и lockfile без оценки готовности релиза.

## REQUIRED CONTEXT

`docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/TASK_GRAPH.md` (TG-035), `tasks/TASK_TEMPLATE.md`, `tasks/TG-001_TASK_CONTRACT.md` (§9).

## IN SCOPE

Три CLI-утилиты `scripts/evidence/*.mjs`, их узкие тесты и этот контракт.

## NON-GOALS

Продуктовый код, прохождение TG-035, юридическая оценка лицензий, сеть, установка зависимостей.

## DEPENDENCIES

Git и Node.js; `package-lock.json` требуется только при фактическом запуске соответствующих команд.

## ALLOWED FILES

`scripts/evidence/release-identity.mjs`, `scripts/evidence/artifact-manifest.mjs`, `scripts/evidence/dependency-inventory.mjs`, `scripts/evidence/evidence.test.mjs`, `tasks/PREP-TG-035_EVIDENCE_UTILS_TASK_CONTRACT.md`.

## FORBIDDEN FILES

Продуктовый код, `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, `package.json`, `package-lock.json`, `main`.

## ACCEPTANCE CRITERIA

Команды записывают только явно указанный файл вывода; не выводят содержимое файлов, значения окружения или секреты; manifest сортирует пути и исключает собственный вывод; inventory принимает только lockfile v3, помечает workspace links; `--require-clean` отклоняет грязное дерево. Результат не означает `TG-035 PASS`.

## VERIFICATION COMMANDS

`node --version`; `npm --version`; `node --test scripts/evidence/evidence.test.mjs`; повторные запуски manifest/inventory с побайтовым сравнением; `git diff --check`; `git status --short`.

## ESCALATION TRIGGERS

`SPEC CONFLICT`, несовпадение `BASE_SHA`, необходимость менять запрещённые файлы, отсутствие точного Node/npm baseline из TG-001 для релизной проверки.

## DELIVERABLE

Четыре файла в `scripts/evidence`, результаты проверок, commit SHA и статус remote SHA.

## COMMIT / PUSH REQUIREMENTS

Коммит в `codex/release-evidence-utils` с существующей человеческой Git identity. Допускается push только этой ветки; `main` не трогать.
