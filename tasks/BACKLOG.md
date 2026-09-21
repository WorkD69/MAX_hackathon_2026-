# Этапы CREATE

Разработка приложения не начата. Утверждённые определения задач находятся в [canonical Task Graph](TASK_GRAPH.md). Текущий gate — `TASK CONTRACTS`; Task Contracts ещё не созданы, coding заблокирован. Статус: [PROJECT_STATE](../docs/08_PROJECT_STATE.md).

| Приоритет | Этап | Результат |
| --- | --- | --- |
| P0 | Technical Architecture | Утверждено; canonical документ зафиксирован. |
| P0 | Data Model / Contracts | Утверждены; canonical документы зафиксированы. |
| P0 | Technical Architecture Review | `PASS`; замечаний не осталось. |
| P0 | Task Graph | `PASS / APPROVED`; 35 tasks, 74 direct dependency edges, 17 waves, 4 lanes. |
| P0 | Task Contracts | Текущий gate; `NOT STARTED`. |

## Заблокировано до создания и разрешения Task Contracts

- Coding Wave 1, Coding Wave 2, Coding Wave 3 и последующие волны.
- Возможные крупные области будущей декомпозиции: backend, Mini App, MAX Bot, `DEMO_MODE` и роли, конфигурация, проверки, интеграция, подготовка сдачи.

Контракт каждой будущей задачи — [TASK_TEMPLATE](TASK_TEMPLATE.md). Canonical task definitions не дублируются; Task Contracts ещё не созданы. Утверждение Task Graph не разрешает coding.
