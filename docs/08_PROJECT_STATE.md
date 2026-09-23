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
| `TASK_CONTRACTS` | `TG-001 COMPLETE; TG-002, TG-004, TG-005 APPROVED / CANONICAL / PASS; TG-003 REVIEW/FIX IN PROGRESS` |
| `CURRENT_EXECUTION` | `TG-002 IMPLEMENTATION COMPLETE / IC1 READY; TG-004 IMPLEMENTATION UNBLOCKED; TG-005 TASK CONTRACT APPROVED / CODING UNBLOCKED; TG-003 TASK CONTRACT REVIEW/FIX` |
| `TG-001_IMPLEMENTATION` | `COMPLETE` |
| `TG-001_IMPLEMENTATION_BRANCH` | `codex/tg-001-workspace-foundation` |
| `TG-001_IMPLEMENTATION_COMMIT` | `588e0aa1de6dbca5118ef1c0378967c8b36b73a6` |
| `TG-001_CONTRACT_BASE_SHA` | `1b2206899322ac4416a578a1fa5f50b336d9cab5` |
| `TG-001_CHECKPOINT` | `ESTABLISHED` |
| `CODING` | `TG-002 IMPLEMENTATION COMPLETE; TG-004, TG-005 UNBLOCKED AFTER REPOSITORY CLOSURE; TG-003 BLOCKED UNTIL TASK CONTRACT APPROVAL` |
| `IC-0` | `WORKSPACE / PASS` |
| `WAVE_1_TASK_CONTRACTS` | `UNBLOCKED` |
| `TG-002` | `IMPLEMENTATION COMPLETE / IC1 READY` |
| `TG-003` | `TASK CONTRACT REVIEW/FIX IN PROGRESS` |
| `TG-004` | `TASK CONTRACT APPROVED / PASS; CODING UNBLOCKED; IMPLEMENTATION NOT STARTED` |
| `TG-005` | `TASK CONTRACT APPROVED / PASS; CODING UNBLOCKED AFTER REPOSITORY CLOSURE; IMPLEMENTATION NOT STARTED` |
| `WAVE_1` | `NOT COMPLETE` |
| `IC-1` | `NOT COMPLETE` |

**Следующая цель:** начать TG-004 и TG-005 implementation от неизменного `BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99` по [утверждённому контракту](../tasks/TG-004_TASK_CONTRACT.md) и [утверждённому контракту](../tasks/TG-005_TASK_CONTRACT.md); продолжить review/fix Task Contract TG-003. Порядок этапов — в [передаче оркестратору](ORCHESTRATOR_HANDOFF.md) и [плане этапов](../tasks/BACKLOG.md).

TG-001 implementation завершён, independently проверен и интегрирован; `IC-0 Workspace = PASS`, checkpoint установлен. TG-002 Task Contract прошёл independent review и targeted recheck, канонизирован со статусом `APPROVED / PASS`; implementation TG-002 завершён и готов к IC-1. TG-004 Task Contract прошёл independent review, one-batch targeted fix и targeted closure recheck, канонизирован со статусом `APPROVED / PASS`; coding TG-004 разблокирован после repository closure, implementation ещё не начат. TG-005 Task Contract прошёл independent review, one-batch targeted fix, final targeted fix и final targeted closure recheck со статусом `PASS`; findings закрыты 10/10 (`BLOCKER / MAJOR / MINOR = 0 / 0 / 0`, implementation choices и gaps отсутствуют), контракт канонизирован со статусом `APPROVED / PASS`; coding TG-005 разблокирован после repository closure, implementation ещё не начат. TG-003 остаётся на стадии closure/recheck контракта; его coding заблокирован до отдельного approval. Wave 1 и `IC-1` не завершены; TG-004 и TG-005 implementation complete не объявляется.

## Известные продуктовые исключения из MVP

По [Product Freeze, раздел 15](01_PRODUCT_FREEZE.md):

- РСО как базовая третья сторона; обязательная интеграция с ГИС ЖКХ; замена CRM/АДС/ГИС ЖКХ; отдельные CRM УК и подрядчика.
- Свободный приватный чат жителя с подрядчиком; отдельный групповой чат MAX для каждого случая; обязательная передача телефона жителя подрядчику.
- Автоматическое юридическое определение ответственного; универсальные нормативные SLA; реальные свободные слоты без интеграции; диспетчеризация маршрутов мастеров.
- Платежи; электронные подписи и юридически значимые акты; заявленная официальная регистрация обращения в ГИС ЖКХ; универсальный API-маркетплейс; обязательный ИИ; отдельные программные процессы для каждой категории.

В этом документе не хранится SHA собственного commit. Каждый агент перед началом работы самостоятельно выполняет `git status` и `git rev-parse HEAD`.
