# Состояние проекта

| Поле | Значение |
| --- | --- |
| `PHASE` | `CREATE / TG-001 IMPLEMENTATION` |
| `PRODUCT_FREEZE` | `APPROVED` |
| `PRODUCT_SPEC` | `APPROVED` |
| `TECHNICAL_ARCHITECTURE` | `APPROVED / PASS` |
| `DATA_MODEL` | `APPROVED` |
| `INTERFACE_CONTRACTS` | `APPROVED` |
| `TASK_GRAPH` | `APPROVED / PASS` |
| `TASK_CONTRACTS` | `TG-001 APPROVED / CANONICAL / PASS` |
| `CURRENT_EXECUTION` | `TG-001 IMPLEMENTATION` |
| `TG-001_IMPLEMENTATION` | `NOT STARTED` |
| `TG-001_IMPLEMENTATION_BRANCH` | `codex/tg-001-workspace-foundation` |
| `TG-001_CONTRACT_BASE_SHA` | `1b2206899322ac4416a578a1fa5f50b336d9cab5` |
| `CODING` | `ALLOWED FOR TG-001 ONLY AFTER EXECUTION-ENVIRONMENT BOOTSTRAP` |
| `IC-0` | `PENDING` |
| `WAVE_1` | `BLOCKED` |
| `TG-002` | `BLOCKED UNTIL IC-0 CHECKPOINT` |
| `TG-003` | `BLOCKED UNTIL IC-0 CHECKPOINT` |
| `TG-004` | `BLOCKED UNTIL IC-0 CHECKPOINT` |
| `TG-005` | `BLOCKED UNTIL IC-0 CHECKPOINT` |

**Следующая цель:** выполнить TG-001 implementation по [утверждённому canonical Task Contract](../tasks/TG-001_TASK_CONTRACT.md). До передачи coding-agent Contract / Execution Orchestrator создаёт или безопасно проверяет local branch `codex/tg-001-workspace-foundation` ровно от `TG-001_CONTRACT_BASE_SHA`. Порядок этапов — в [передаче оркестратору](ORCHESTRATOR_HANDOFF.md) и [плане этапов](../tasks/BACKLOG.md).

**Разрешено только TG-001:** repository foundation после execution-environment bootstrap. TG-001 implementation ещё не начат. `IC-0` не пройден; WAVE 1 и Task Contracts TG-002–TG-005 заблокированы до нового stable `main` checkpoint SHA, созданного Integration Agent.

## Известные продуктовые исключения из MVP

По [Product Freeze, раздел 15](01_PRODUCT_FREEZE.md):

- РСО как базовая третья сторона; обязательная интеграция с ГИС ЖКХ; замена CRM/АДС/ГИС ЖКХ; отдельные CRM УК и подрядчика.
- Свободный приватный чат жителя с подрядчиком; отдельный групповой чат MAX для каждого случая; обязательная передача телефона жителя подрядчику.
- Автоматическое юридическое определение ответственного; универсальные нормативные SLA; реальные свободные слоты без интеграции; диспетчеризация маршрутов мастеров.
- Платежи; электронные подписи и юридически значимые акты; заявленная официальная регистрация обращения в ГИС ЖКХ; универсальный API-маркетплейс; обязательный ИИ; отдельные программные процессы для каждой категории.

В этом документе не хранится SHA собственного commit. Каждый агент перед началом работы самостоятельно выполняет `git status` и `git rev-parse HEAD`.
