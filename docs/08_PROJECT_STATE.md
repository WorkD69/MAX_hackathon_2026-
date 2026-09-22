# Состояние проекта

| Поле | Значение |
| --- | --- |
| `PHASE` | `CREATE / WAVE 1 TASK CONTRACTS` |
| `PRODUCT_FREEZE` | `APPROVED` |
| `PRODUCT_SPEC` | `APPROVED` |
| `TECHNICAL_ARCHITECTURE` | `APPROVED / PASS` |
| `DATA_MODEL` | `APPROVED` |
| `INTERFACE_CONTRACTS` | `APPROVED` |
| `TASK_GRAPH` | `APPROVED / PASS` |
| `TASK_CONTRACTS` | `TG-001 COMPLETE; WAVE 1 UNBLOCKED` |
| `CURRENT_EXECUTION` | `PARALLEL WAVE-1 TASK CONTRACTS` |
| `TG-001_IMPLEMENTATION` | `COMPLETE` |
| `TG-001_IMPLEMENTATION_BRANCH` | `codex/tg-001-workspace-foundation` |
| `TG-001_IMPLEMENTATION_COMMIT` | `588e0aa1de6dbca5118ef1c0378967c8b36b73a6` |
| `TG-001_CONTRACT_BASE_SHA` | `1b2206899322ac4416a578a1fa5f50b336d9cab5` |
| `TG-001_CHECKPOINT` | `ESTABLISHED` |
| `CODING` | `BLOCKED FOR TG-002..TG-005 UNTIL EACH TASK CONTRACT APPROVAL` |
| `IC-0` | `WORKSPACE / PASS` |
| `WAVE_1_TASK_CONTRACTS` | `UNBLOCKED` |
| `TG-002` | `READY FOR TASK CONTRACT` |
| `TG-003` | `READY FOR TASK CONTRACT` |
| `TG-004` | `READY FOR TASK CONTRACT` |
| `TG-005` | `READY FOR TASK CONTRACT` |

**Следующая цель:** параллельно подготовить Task Contracts TG-002, TG-003, TG-004 и TG-005 на новом stable `main` checkpoint SHA. Порядок этапов — в [передаче оркестратору](ORCHESTRATOR_HANDOFF.md) и [плане этапов](../tasks/BACKLOG.md).

TG-001 implementation завершён, independently проверен и интегрирован; `IC-0 Workspace = PASS`, checkpoint установлен. Task Contracts TG-002–TG-005 разблокированы, но coding каждой из этих задач остаётся заблокированным до отдельного утверждения её Task Contract.

## Известные продуктовые исключения из MVP

По [Product Freeze, раздел 15](01_PRODUCT_FREEZE.md):

- РСО как базовая третья сторона; обязательная интеграция с ГИС ЖКХ; замена CRM/АДС/ГИС ЖКХ; отдельные CRM УК и подрядчика.
- Свободный приватный чат жителя с подрядчиком; отдельный групповой чат MAX для каждого случая; обязательная передача телефона жителя подрядчику.
- Автоматическое юридическое определение ответственного; универсальные нормативные SLA; реальные свободные слоты без интеграции; диспетчеризация маршрутов мастеров.
- Платежи; электронные подписи и юридически значимые акты; заявленная официальная регистрация обращения в ГИС ЖКХ; универсальный API-маркетплейс; обязательный ИИ; отдельные программные процессы для каждой категории.

В этом документе не хранится SHA собственного commit. Каждый агент перед началом работы самостоятельно выполняет `git status` и `git rev-parse HEAD`.
