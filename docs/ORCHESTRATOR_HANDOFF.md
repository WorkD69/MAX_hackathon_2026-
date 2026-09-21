# Передача CREATE-оркестратору

## Текущий этап

`CREATE / TASK CONTRACTS`. Product Freeze и Product Spec утверждены. Technical Architecture Gate и Task Graph Gate пройдены со статусом `PASS`; модель данных и интерфейсные контракты утверждены. Canonical graph: [`tasks/TASK_GRAPH.md`](../tasks/TASK_GRAPH.md) — 35 tasks, 74 direct dependency edges, 17 waves, 4 lanes. Task Contracts ещё не созданы. Приложение ещё не реализовано, coding заблокирован. Состояние: [PROJECT_STATE](08_PROJECT_STATE.md).

## Утверждено и где читать

- [Product Freeze](01_PRODUCT_FREEZE.md): `APPROVED PRODUCT SCOPE`, верхний продуктовый приоритет.
- [Product Spec](02_PRODUCT_SPEC.md): `APPROVED PRODUCT SPEC v1.0 / READY FOR CREATE`, нормативное поведение.
- [Technical Architecture](03_ARCHITECTURE.md): утверждённая canonical architecture.
- [Data Model](04_DATA_MODEL.md): утверждённая canonical data model.
- [Interface Contracts](05_INTERFACE_CONTRACTS.md): утверждённые canonical interface contracts.
- [Task Graph](../tasks/TASK_GRAPH.md): утверждённый canonical graph; `TASK_GRAPH_GATE = PASS`.
- [Критерии хакатона](09_HACKATHON_CRITERIA.md): официальные внешние требования и правила сдачи.
- [Краткое введение](00_PROJECT_BRIEF.md): контекст за 2–3 минуты. [Решения](07_DECISIONS.md): принятые ограничения.

Не читать прежние репозитории и продуктовые исследования. Документ final targeted recheck подтверждает прохождение gate и не задаёт новую продуктовую логику. Live MAX checks остаются будущими integration/delivery evidence и не являются architecture blockers.

## Запрет на самостоятельные продуктовые изменения

Нельзя менять MUST, роли, восемь состояний, переходы, инварианты, критерии приёмки, основной сценарий и границы Product Freeze ради удобства реализации. При конфликте остановить работу, сообщить `SPEC CONFLICT`; изменение возможно только по явному решению команды с записью в [журнале решений](07_DECISIONS.md).

## Первый шаг текущего gate

Выполнить `git status` и `git rev-parse HEAD`, прочитать [правила агентов](../AGENTS.md), [состояние проекта](08_PROJECT_STATE.md), нормативные продуктовые документы, canonical technical baseline и [Task Graph](../tasks/TASK_GRAPH.md). Затем создать Task Contracts, привязав каждый контракт к конкретному стабильному SHA repository closure. После каждого предусмотренного integration checkpoint следующий контракт обязан использовать новый стабильный baseline. Coding не начинать до создания и разрешения соответствующего Task Contract.

## Следующий SDD pipeline

`Task Graph → Task Contracts → Coding Waves → Integration → E2E → Submission hardening`.

Команда — **4 человека**. Доступные ресурсы разработки: **Codex ×3, OpenCode ×1**. Параллелить независимые задачи, но не принятие одного и того же решения. Каждая задача по разработке должна иметь конкретный `base_sha` и контракт по [шаблону](../tasks/TASK_TEMPLATE.md). После каждой параллельной волны отдельный Integration Agent объединяет изменения, проверяет их и создаёт новый стабильный `main` для следующей волны.
