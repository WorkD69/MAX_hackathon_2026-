# FINAL PRODUCT UX HARDENING

## TASK ID

FINAL-UX-2026

## TITLE

Финальная продуктовая и визуальная доработка frontend

## BASE_SHA

f5d2f6613e977ab042185f62cd1081be352ae0d6

## PURPOSE

Сделать демонстрационный сценарий понятным с первого экрана и удобным на мобильном экране, сохранив каноническую бизнес-логику.

## REQUIRED CONTEXT

Задание владельца продукта в этом чате; `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, `packages/contracts/src`, существующие frontend и тесты.

## IN SCOPE

Тексты, компоновка, доступность, клиентская устойчивость форм и запросов, визуальное представление истории и материалов в `apps/web`.

## NON-GOALS

Изменение состояний, ролей, backend authorization, схемы БД, MAX auth, Docker и deployment.

## DEPENDENCIES

Backend/security исправления выполняются отдельно. Работа ведётся на `codex/final-product-ux-hardening` от указанного SHA.

## ALLOWED FILES

`apps/web/**`, `tasks/FINAL_PRODUCT_UX_HARDENING_TASK.md`.

## FORBIDDEN FILES

`apps/api/**`, `packages/db/**`, `packages/domain/**`, `packages/contracts/**`, `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, инфраструктура.

## ACCEPTANCE CRITERIA

Все пункты пользовательского задания от first 30 seconds до mobile/accessibility, без изменения канонических фактов и role projection.

## VERIFICATION COMMANDS

`npm run typecheck`, `npm run build`, `npm run test --workspace @max-smart-city/web`, релевантные contract tests, Playwright/manual smoke на мобильном и desktop.

## ESCALATION TRIGGERS

`SPEC CONFLICT`, несоответствие BASE_SHA, потребность выйти за разрешённые файлы, нарушение backend contract.

## DELIVERABLE

Изменения frontend, результаты проверок, commit SHA и push status.

## COMMIT / PUSH REQUIREMENTS

Существующая человеческая Git identity; commit и push в указанную ветку.
