# Состояние проекта

| Поле | Значение |
| --- | --- |
| `PHASE` | `LEAN GOVERNANCE TRANSITION → WAVE 2` |
| `PRODUCT_FREEZE` | `APPROVED` |
| `PRODUCT_SPEC` | `APPROVED` |
| `TECHNICAL_ARCHITECTURE` | `APPROVED / PASS` |
| `DATA_MODEL` | `APPROVED` |
| `INTERFACE_CONTRACTS` | `APPROVED` |
| `TASK_GRAPH` | `APPROVED / PASS; 35 tasks / 74 direct dependency edges / 17 waves / 4 lanes` |
| `TG-001` | `COMPLETE; IC-0 PASS` |
| `TG-002` | `COMPLETE` |
| `TG-003` | `COMPLETE` |
| `TG-004` | `COMPLETE` |
| `TG-005` | `COMPLETE` |
| `WAVE_0_1` | `COMPLETE; GRANDFATHERED` |
| `IC-1` | `PASS` |
| `IC1_CHECKPOINT_SHA` | `56d24135bb30f9f957b4f56b261bb3bd472ee253` |
| `NEXT_EXECUTABLE_WAVE` | `W2: TG-006, TG-009, TG-010, TG-020` |
| `WAVE_2_IMPLEMENTATION` | `NOT STARTED BY GOVERNANCE TRANSITION` |

IC-1 прошёл clean install, typecheck, build, 256 unique tests, real PostgreSQL tests и migrations, catalog/constraint checks, readiness negatives и partial executable smoke. Один canonical root `package-lock.json`; semantic changes и blockers отсутствуют. Lean Hackathon SDD действует только начиная с Wave 2. Операционный порядок — в [передаче оркестратору](ORCHESTRATOR_HANDOFF.md), зависимости — в [Task Graph](../tasks/TASK_GRAPH.md).

## Известные продуктовые исключения из MVP

По [Product Freeze, раздел 15](01_PRODUCT_FREEZE.md):

- РСО как базовая третья сторона; обязательная интеграция с ГИС ЖКХ; замена CRM/АДС/ГИС ЖКХ; отдельные CRM УК и подрядчика.
- Свободный приватный чат жителя с подрядчиком; отдельный групповой чат MAX для каждого случая; обязательная передача телефона жителя подрядчику.
- Автоматическое юридическое определение ответственного; универсальные нормативные SLA; реальные свободные слоты без интеграции; диспетчеризация маршрутов мастеров.
- Платежи; электронные подписи и юридически значимые акты; заявленная официальная регистрация обращения в ГИС ЖКХ; универсальный API-маркетплейс; обязательный ИИ; отдельные программные процессы для каждой категории.

В этом документе не хранится SHA собственного commit. Каждый агент перед началом работы выполняет `git status` и `git rev-parse HEAD`.
