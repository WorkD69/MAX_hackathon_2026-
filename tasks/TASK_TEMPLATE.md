# Lean Task Contract (Wave 2+)

Использовать для CRITICAL и STANDARD задач по [risk-class workflow](BACKLOG.md). Для DELIVERY при однозначных canonical docs отдельный контракт не обязателен. Контракт фиксирует **WHAT, BOUNDARIES, ACCEPTANCE**, без построчного implementation pseudocode. TG-001…TG-005 сохраняют свои исторические контракты.

## 1. Identity / BASE_SHA

`TASK_ID`, краткое название, `RISK_CLASS`, полный `BASE_SHA` стабильной базы. Перед работой сверить его с `git rev-parse HEAD` выбранной ветки.

## 2. Goal

Проверяемый результат задачи в нескольких предложениях.

## 3. Canonical sources

Только необходимые нормативные и технические документы/разделы с путями; их приоритет не меняется.

## 4. Dependencies / unlocks

Точные `Depends On` и `Unlocks` из [Task Graph](TASK_GRAPH.md); не менять graph semantics.

## 5. Allowed write scope

Разрешённые файлы или пути и владелец shared files.

## 6. Forbidden scope

Явные запреты: чужие файлы, Product/Architecture semantics, future task scope и другие важные границы.

## 7. Required behavior / invariants

Наблюдаемое поведение и обязательные инварианты со ссылками на canonical sources; без навязывания построчной реализации.

## 8. Dependency requests

Нужные пакеты или изменения shared manifests; если не нужны — `NONE`. Указать владельца и маршрут интеграции, не допускать конкурентных правок shared files.

## 9. Acceptance criteria

Короткие проверяемые условия завершения задачи.

## 10. Required tests

Необходимые проверки и команды с ожидаемым результатом; тесты соразмерны риску.

## 11. Git / integration handoff

Ветка и `BASE_SHA` по контракту, commit/push с существующей человеческой Git identity, полный commit SHA, результаты проверок и передача Integration Agent.

## 12. Blocker protocol

Остановить затронутую работу при `SPEC CONFLICT`, неверном `BASE_SHA`, выходе за write scope или несовместимости утверждённых контрактов; сообщить конкретный blocker ответственному. Для CRITICAL review с `FIX_REQUIRED` — один полный batch findings, один batch fix и targeted closure.
