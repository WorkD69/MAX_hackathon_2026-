# Этапы CREATE

Разработка приложения не начата. Утверждённые определения задач находятся в [canonical Task Graph](TASK_GRAPH.md). [TG-001 Task Contract](TG-001_TASK_CONTRACT.md) канонизирован со статусом `APPROVED / PASS`; TG-001 implementation авторизован, но ещё не начат. Coding разрешён только для TG-001 после execution-environment bootstrap. `IC-0` — `PENDING`, WAVE 1 заблокирована. Статус: [PROJECT_STATE](../docs/08_PROJECT_STATE.md).

| Приоритет | Этап | Результат |
| --- | --- | --- |
| P0 | Technical Architecture | Утверждено; canonical документ зафиксирован. |
| P0 | Data Model / Contracts | Утверждены; canonical документы зафиксированы. |
| P0 | Technical Architecture Review | `PASS`; замечаний не осталось. |
| P0 | Task Graph | `PASS / APPROVED`; 35 tasks, 74 direct dependency edges, 17 waves, 4 lanes. |
| P0 | TG-001 Task Contract | `PASS / APPROVED / CANONICAL`; `BASE_SHA = 1b2206899322ac4416a578a1fa5f50b336d9cab5`. |
| P0 | TG-001 Implementation | `AUTHORIZED / NOT STARTED`; branch `codex/tg-001-workspace-foundation` создаётся от contract `BASE_SHA`. |
| P0 | IC-0 Workspace | `PENDING`; checkpoint создаёт Integration Agent после implementation и independent verification. |

## Заблокировано до IC-0 checkpoint

- WAVE 1, Coding Wave 2, Coding Wave 3 и последующие волны.
- TG-002, TG-003, TG-004 и TG-005 до нового stable `main` checkpoint SHA.
- Возможные крупные области будущей декомпозиции: backend, Mini App, MAX Bot, `DEMO_MODE` и роли, конфигурация, проверки, интеграция, подготовка сдачи.

Контракт каждой будущей задачи — [TASK_TEMPLATE](TASK_TEMPLATE.md). Canonical task definitions не дублируются. Текущий contract closure разрешает coding только для TG-001 и не является TG-001 implementation commit, `IC-0` checkpoint или `BASE_SHA` для TG-002–TG-005.
