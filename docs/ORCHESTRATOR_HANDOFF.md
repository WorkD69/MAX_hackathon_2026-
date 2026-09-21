# Передача CREATE-оркестратору

## Текущий этап

`CREATE / TASK GRAPH`. Product Freeze и Product Spec утверждены. Technical Architecture Gate пройден со статусом `PASS`; модель данных и интерфейсные контракты утверждены. Task Graph ещё не создан и не утверждён. Приложение ещё не реализовано, coding заблокирован. Состояние: [PROJECT_STATE](08_PROJECT_STATE.md).

## Утверждено и где читать

- [Product Freeze](01_PRODUCT_FREEZE.md): `APPROVED PRODUCT SCOPE`, верхний продуктовый приоритет.
- [Product Spec](02_PRODUCT_SPEC.md): `APPROVED PRODUCT SPEC v1.0 / READY FOR CREATE`, нормативное поведение.
- [Technical Architecture](03_ARCHITECTURE.md): утверждённая canonical architecture.
- [Data Model](04_DATA_MODEL.md): утверждённая canonical data model.
- [Interface Contracts](05_INTERFACE_CONTRACTS.md): утверждённые canonical interface contracts.
- [Критерии хакатона](09_HACKATHON_CRITERIA.md): официальные внешние требования и правила сдачи.
- [Краткое введение](00_PROJECT_BRIEF.md): контекст за 2–3 минуты. [Решения](07_DECISIONS.md): принятые ограничения.

Не читать прежние репозитории и продуктовые исследования. Документ final targeted recheck подтверждает прохождение gate и не задаёт новую продуктовую логику. Live MAX checks остаются будущими integration/delivery evidence и не являются architecture blockers.

## Запрет на самостоятельные продуктовые изменения

Нельзя менять MUST, роли, восемь состояний, переходы, инварианты, критерии приёмки, основной сценарий и границы Product Freeze ради удобства реализации. При конфликте остановить работу, сообщить `SPEC CONFLICT`; изменение возможно только по явному решению команды с записью в [журнале решений](07_DECISIONS.md).

## Первый шаг

Выполнить `git status` и `git rev-parse HEAD`, прочитать [правила агентов](../AGENTS.md), [состояние проекта](08_PROJECT_STATE.md), нормативные продуктовые документы и canonical technical baseline. Затем построить Task Graph, не создавая Task Contracts и не начиная разработку приложения до его утверждения.

## Следующий SDD pipeline

`Task Graph → Task Contracts → Coding Waves → Integration → E2E → Submission hardening`.

Команда — **4 человека**. Доступные ресурсы разработки: **Codex ×3, OpenCode ×1**. Параллелить независимые задачи, но не принятие одного и того же решения. Каждая задача по разработке должна иметь конкретный `base_sha` и контракт по [шаблону](../tasks/TASK_TEMPLATE.md). После каждой параллельной волны отдельный Integration Agent объединяет изменения, проверяет их и создаёт новый стабильный `main` для следующей волны.
