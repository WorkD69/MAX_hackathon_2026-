# Передача CREATE-оркестратору

## Текущий этап

`CREATE / WAVE 1 TASK CONTRACTS`. Product Freeze и Product Spec утверждены. Technical Architecture Gate и Task Graph Gate пройдены со статусом `PASS`; модель данных и интерфейсные контракты утверждены. Canonical graph: [`tasks/TASK_GRAPH.md`](../tasks/TASK_GRAPH.md) — 35 tasks, 74 direct dependency edges, 17 waves, 4 lanes. TG-001 implementation commit `588e0aa1de6dbca5118ef1c0378967c8b36b73a6` independently проверен и интегрирован. `IC-0 Workspace = PASS`; TG-001 checkpoint установлен. TG-002 Task Contract канонизирован со статусом `APPROVED / PASS`; implementation TG-002 завершён и готов к IC-1. TG-004 Task Contract канонизирован со статусом `APPROVED / PASS`, coding разблокирован, implementation ещё не начат. TG-003 и TG-005 остаются на стадии contract closure/recheck. Wave 1 и `IC-1` не завершены. Состояние: [PROJECT_STATE](08_PROJECT_STATE.md).

## Утверждено и где читать

- [Product Freeze](01_PRODUCT_FREEZE.md): `APPROVED PRODUCT SCOPE`, верхний продуктовый приоритет.
- [Product Spec](02_PRODUCT_SPEC.md): `APPROVED PRODUCT SPEC v1.0 / READY FOR CREATE`, нормативное поведение.
- [Technical Architecture](03_ARCHITECTURE.md): утверждённая canonical architecture.
- [Data Model](04_DATA_MODEL.md): утверждённая canonical data model.
- [Interface Contracts](05_INTERFACE_CONTRACTS.md): утверждённые canonical interface contracts.
- [Task Graph](../tasks/TASK_GRAPH.md): утверждённый canonical graph; `TASK_GRAPH_GATE = PASS`.
- [TG-001 Task Contract](../tasks/TG-001_TASK_CONTRACT.md): утверждённый canonical contract; `BASE_SHA = 1b2206899322ac4416a578a1fa5f50b336d9cab5`, `TASK_CONTRACT_GATE = PASS`.
- [Final mechanical TG-001 R2 recheck](../FINAL_MECHANICAL_TG-001_R2_RECHECK.md): final gate evidence; `BLOCKER = 0`, `MAJOR = 0`, `MINOR = 0`, все contract findings закрыты.
- [TG-002 Task Contract](../tasks/TG-002_TASK_CONTRACT.md): утверждённый canonical contract; `BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99`, `TASK_CONTRACT_GATE = PASS`.
- [TG-002 targeted recheck](../FINAL_TG-002_TASK_CONTRACT_TARGETED_RECHECK.md): final gate evidence; оба findings закрыты, `BLOCKER = 0`, `MAJOR = 0`, `MINOR = 0`, implementation choices и gaps отсутствуют.
- [TG-004 Task Contract](../tasks/TG-004_TASK_CONTRACT.md): утверждённый canonical contract; `BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99`, `TASK_CONTRACT_GATE = PASS`.
- [TG-004 targeted closure recheck](../FINAL_TG-004_TASK_CONTRACT_TARGETED_RECHECK.md): final gate evidence; findings F-1…F-4 закрыты, `BLOCKER = 0`, `MAJOR = 0`, `MINOR = 0`, implementation choices и gaps отсутствуют.
- [Критерии хакатона](09_HACKATHON_CRITERIA.md): официальные внешние требования и правила сдачи.
- [Краткое введение](00_PROJECT_BRIEF.md): контекст за 2–3 минуты. [Решения](07_DECISIONS.md): принятые ограничения.

Не читать прежние репозитории и продуктовые исследования. Документ final targeted recheck подтверждает прохождение gate и не задаёт новую продуктовую логику. Live MAX checks остаются будущими integration/delivery evidence и не являются architecture blockers.

## Запрет на самостоятельные продуктовые изменения

Нельзя менять MUST, роли, восемь состояний, переходы, инварианты, критерии приёмки, основной сценарий и границы Product Freeze ради удобства реализации. При конфликте остановить работу, сообщить `SPEC CONFLICT`; изменение возможно только по явному решению команды с записью в [журнале решений](07_DECISIONS.md).

## Следующий шаг исполнения

TG-004 implementation выполняется от `BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99` по утверждённому контракту; repository closure commit не сдвигает implementation baseline. Contract Orchestrator продолжает closure/recheck Task Contracts TG-003 и TG-005. Coding каждой из них не начинается до отдельного approval. TG-002 implementation завершён и готов к Wave-1 checkpoint; `IC-1` остаётся будущим integration gate.

## Следующий SDD pipeline

`Task Graph → Task Contracts → Coding Waves → Integration → E2E → Submission hardening`.

Команда — **4 человека**. Доступные ресурсы разработки: **Codex ×3, OpenCode ×1**. Параллелить независимые задачи, но не принятие одного и того же решения. Каждая задача по разработке должна иметь конкретный `base_sha` и контракт по [шаблону](../tasks/TASK_TEMPLATE.md). После каждой параллельной волны отдельный Integration Agent объединяет изменения, проверяет их и создаёт новый стабильный `main` для следующей волны.
