# FINAL-PACKAGING-CLEANUP — контракт задачи

## TASK ID / TITLE
FINAL-PACKAGING-CLEANUP — документация, PDF-презентация и upload ZIP.

## BASE_SHA
`4f719b0d9d2f40cee8ab16c61b86b40b63ca7d72`; проверен через `git rev-parse HEAD` до изменений.

## PURPOSE
Один documentation-only commit с фактическими результатами проверок и финальной PDF; чистый ZIP
с PDF в корне, проверкой размера, открытия, секретов и SHA-256.

## REQUIRED CONTEXT
Запрос пользователя, `AGENTS.md`, `tasks/TASK_TEMPLATE.md`, `docs/01_PRODUCT_FREEZE.md`,
`docs/02_PRODUCT_SPEC.md`, существующие submission evidence и указанная финальная PPTX.

## IN SCOPE / NON-GOALS
Обновить только презентацию и документы по уже полученным фактам. Исключены feature code,
business logic, UX, API behavior, auth, MAX integration, state machine и database semantics.

## DEPENDENCIES
Проверенный source commit `4f719b0…`, clean Docker evidence прошлого шага, исходная PPTX.

## ALLOWED FILES
`README.md`, `docs/submission/*.md`, корневой `Хакатон MAX — Умный город — Two pizza.pdf`.
Итоговый ZIP и обновлённая PPTX создаются вне репозитория.

## FORBIDDEN FILES
`apps/**`, `packages/**`, manifests/lockfile, Docker/Compose/env/API YAML, migrations,
нормативные продуктовые документы и любые секреты.

## ACCEPTANCE CRITERIA
Первый слайд содержит полный source SHA; PDF — 13 корректно отображаемых слайдов; документы не
содержат устаревших маркеров для выполненных проверок; ZIP открывается, меньше 50 MB, содержит PDF
в корне и исключает запрещённые файлы; secret scan 0; SHA-256 вычислен; application blobs совпадают.

## VERIFICATION COMMANDS
Сравнение slide render, PDF text/pages, `git diff --check`, `git diff --name-only` по forbidden
paths, проверка ZIP listing/size/open, Gitleaks по извлечённому ZIP, `Get-FileHash -Algorithm SHA256`,
`git ls-remote` после push.

## ESCALATION TRIGGERS
`SPEC CONFLICT`, необходимость изменения application code, повреждённая презентация,
ZIP ≥50 MB, найденный рабочий секрет или ошибка проверок.

## DELIVERABLE / COMMIT / PUSH REQUIREMENTS
Один documentation-only commit поверх base и push без force. Использовать существующую человеческую
Git identity, без AI attribution; вернуть полный новый SHA и upload ZIP checksum.
