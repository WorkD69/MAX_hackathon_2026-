# Передача CREATE-оркестратору

## Текущий этап

`CREATE / TG-001 IMPLEMENTATION`. Product Freeze и Product Spec утверждены. Technical Architecture Gate и Task Graph Gate пройдены со статусом `PASS`; модель данных и интерфейсные контракты утверждены. Canonical graph: [`tasks/TASK_GRAPH.md`](../tasks/TASK_GRAPH.md) — 35 tasks, 74 direct dependency edges, 17 waves, 4 lanes. [TG-001 Task Contract](../tasks/TG-001_TASK_CONTRACT.md) канонизирован со статусом `APPROVED / PASS`. TG-001 implementation авторизован, но ещё не начат; coding разрешён только для TG-001 после execution-environment bootstrap. `IC-0` — `PENDING`, WAVE 1 заблокирована. Состояние: [PROJECT_STATE](08_PROJECT_STATE.md).

## Утверждено и где читать

- [Product Freeze](01_PRODUCT_FREEZE.md): `APPROVED PRODUCT SCOPE`, верхний продуктовый приоритет.
- [Product Spec](02_PRODUCT_SPEC.md): `APPROVED PRODUCT SPEC v1.0 / READY FOR CREATE`, нормативное поведение.
- [Technical Architecture](03_ARCHITECTURE.md): утверждённая canonical architecture.
- [Data Model](04_DATA_MODEL.md): утверждённая canonical data model.
- [Interface Contracts](05_INTERFACE_CONTRACTS.md): утверждённые canonical interface contracts.
- [Task Graph](../tasks/TASK_GRAPH.md): утверждённый canonical graph; `TASK_GRAPH_GATE = PASS`.
- [TG-001 Task Contract](../tasks/TG-001_TASK_CONTRACT.md): утверждённый canonical contract; `BASE_SHA = 1b2206899322ac4416a578a1fa5f50b336d9cab5`, `TASK_CONTRACT_GATE = PASS`.
- [Final mechanical TG-001 R2 recheck](../FINAL_MECHANICAL_TG-001_R2_RECHECK.md): final gate evidence; `BLOCKER = 0`, `MAJOR = 0`, `MINOR = 0`, все contract findings закрыты.
- [Критерии хакатона](09_HACKATHON_CRITERIA.md): официальные внешние требования и правила сдачи.
- [Краткое введение](00_PROJECT_BRIEF.md): контекст за 2–3 минуты. [Решения](07_DECISIONS.md): принятые ограничения.

Не читать прежние репозитории и продуктовые исследования. Документ final targeted recheck подтверждает прохождение gate и не задаёт новую продуктовую логику. Live MAX checks остаются будущими integration/delivery evidence и не являются architecture blockers.

## Запрет на самостоятельные продуктовые изменения

Нельзя менять MUST, роли, восемь состояний, переходы, инварианты, критерии приёмки, основной сценарий и границы Product Freeze ради удобства реализации. При конфликте остановить работу, сообщить `SPEC CONFLICT`; изменение возможно только по явному решению команды с записью в [журнале решений](07_DECISIONS.md).

## Следующий шаг исполнения

Contract / Execution Orchestrator выполняет execution-environment bootstrap по canonical TG-001 Task Contract: local branch `codex/tg-001-workspace-foundation` должна быть создана или безопасно проверена ровно на `1b2206899322ac4416a578a1fa5f50b336d9cab5` с clean worktree. Затем coding-agent выполняет только TG-001. После independent IC-0 verification отдельный Integration Agent merge'ит approved implementation, push'ит stable `main` и возвращает новый `TG-001 CHECKPOINT SHA`. Только этот будущий SHA становится `BASE_SHA` для TG-002–TG-005; contract closure commit им не является.

## Следующий SDD pipeline

`Task Graph → Task Contracts → Coding Waves → Integration → E2E → Submission hardening`.

Команда — **4 человека**. Доступные ресурсы разработки: **Codex ×3, OpenCode ×1**. Параллелить независимые задачи, но не принятие одного и того же решения. Каждая задача по разработке должна иметь конкретный `base_sha` и контракт по [шаблону](../tasks/TASK_TEMPLATE.md). После каждой параллельной волны отдельный Integration Agent объединяет изменения, проверяет их и создаёт новый стабильный `main` для следующей волны.
