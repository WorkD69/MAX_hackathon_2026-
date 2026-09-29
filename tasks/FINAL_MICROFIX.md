# FINAL MICRO-FIX — контракт задачи

## 1. Identity / BASE_SHA

`TASK_ID: FINAL_MICROFIX`; `RISK_CLASS: STANDARD`; `BASE_SHA: c69a71d65e250a5827667318c7876ae8db19467c`.
Ветка `codex/final-microfix`; `git rev-parse HEAD` перед изменениями совпал с базой.

## 2. Goal

Устранить непонятный отказ при отправке результата с локально выбранным фото и ложную ошибку после успешного отказа подрядчика.

## 3. Canonical sources

`docs/01_PRODUCT_FREEZE.md` (основной сценарий), `docs/02_PRODUCT_SPEC.md` (§9, §13, AC-021–AC-024, AC-067, AC-069–AC-072).

## 4. Dependencies / unlocks

Использовать существующие команды и read API; граф задач не менять. Результат передать Integration Agent.

## 5. Allowed write scope

`apps/web/src/features/contractor/contractor-case.tsx`, `contractor-case.test.tsx`, `contractor-routes.tsx`, `contractor-routes.test.tsx`, `apps/web/src/app/product-routes.tsx`, этот контракт. Активный demo-маршрут для подрядчика находится в `product-routes.tsx`.

## 6. Forbidden scope

Backend, контракты API, state machine, права доступа, события, MAX, Product Freeze/Spec, другие ветки и файлы.

## 7. Required behavior / invariants

WorkMaterial upload и SubmitResult остаются отдельными серверными действиями. Успешный отказ лишает A LIVE-доступа; список отражает назначение, УК может назначить B.

## 8. Dependency requests

`NONE`.

## 9. Acceptance criteria

Валидные PNG/JPEG проходят upload и submit с правильными material IDs. Невалидный файл и частичный сбой получают ясное сообщение о сохранённом состоянии. Успешный отказ показывает точный success, переводит в список и не показывает 404 как ошибку.

## 10. Required tests

Failing web regression tests, затем relevant web/API tests, `npm run typecheck`, `npm run build`, `npm run test:owned-db`; ручной browser smoke.

## 11. Git / integration handoff

После проверок commit и push `codex/final-microfix` с существующей человеческой Git identity; вернуть полный SHA и результаты Integration Agent.

## 12. Blocker protocol

При `SPEC CONFLICT`, неверной базе или необходимости выйти за write scope остановить затронутую работу и сообщить конкретный blocker.
