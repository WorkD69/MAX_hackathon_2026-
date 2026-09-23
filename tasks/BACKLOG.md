# Этапы CREATE

TG-001 implementation завершён и интегрирован после independent IC-0 review. `IC-0 Workspace = PASS`; TG-001 checkpoint установлен. TG-002 Task Contract канонизирован со статусом `APPROVED / PASS`; implementation TG-002 завершён и готов к IC-1. TG-004 Task Contract канонизирован со статусом `APPROVED / PASS`; coding TG-004 разблокирован после repository closure, implementation ещё не начат. TG-005 Task Contract канонизирован со статусом `APPROVED / PASS`; coding TG-005 разблокирован после repository closure, implementation ещё не начат. TG-003 остаётся на стадии contract review/fix, его coding заблокирован до отдельного approval. Wave 1 и `IC-1` не завершены. Утверждённые определения задач находятся в [canonical Task Graph](TASK_GRAPH.md). Статус: [PROJECT_STATE](../docs/08_PROJECT_STATE.md).

| Приоритет | Этап | Результат |
| --- | --- | --- |
| P0 | Technical Architecture | Утверждено; canonical документ зафиксирован. |
| P0 | Data Model / Contracts | Утверждены; canonical документы зафиксированы. |
| P0 | Technical Architecture Review | `PASS`; замечаний не осталось. |
| P0 | Task Graph | `PASS / APPROVED`; 35 tasks, 74 direct dependency edges, 17 waves, 4 lanes. |
| P0 | TG-001 Task Contract | `PASS / APPROVED / CANONICAL`; `BASE_SHA = 1b2206899322ac4416a578a1fa5f50b336d9cab5`. |
| P0 | TG-001 Implementation | `COMPLETE`; implementation commit `588e0aa1de6dbca5118ef1c0378967c8b36b73a6` интегрирован с сохранением истории. |
| P0 | IC-0 Workspace | `PASS`; TG-001 checkpoint установлен. |
| P0 | TG-002 Task Contract | `PASS / APPROVED / CANONICAL`; `BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99`; coding разблокирован после repository closure. |
| P0 | TG-002 Implementation | `COMPLETE / IC1 READY`; implementation готов к Wave-1 checkpoint. |
| P0 | TG-003 Task Contract | `REVIEW/FIX IN PROGRESS`; coding заблокирован до approval. |
| P0 | TG-004 Task Contract | `PASS / APPROVED / CANONICAL`; `BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99`; coding разблокирован после repository closure. |
| P0 | TG-005 Task Contract | `PASS / APPROVED / CANONICAL`; `BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99`; coding разблокирован после repository closure. |

## Следующая волна

- Начать TG-004 implementation от exact TG-001 checkpoint SHA (`200b117bd58f7080c15fba1cfa556d386a085c99`) по [утверждённому контракту](TG-004_TASK_CONTRACT.md).
- Начать TG-005 implementation от exact TG-001 checkpoint SHA (`200b117bd58f7080c15fba1cfa556d386a085c99`) по [утверждённому контракту](TG-005_TASK_CONTRACT.md).
- Продолжить closure/recheck Task Contract TG-003; не начинать его coding до отдельного approval.
- TG-002 implementation завершён и готов к Wave-1 checkpoint (`IC-1`), который создаёт Integration Agent после closure TG-003.
- Coding Wave 2, Coding Wave 3 и последующие волны сохраняют зависимости canonical Task Graph.

Контракт каждой будущей задачи — [TASK_TEMPLATE](TASK_TEMPLATE.md). Canonical task definitions не дублируются. Новый stable `main` checkpoint после IC-0 является `BASE_SHA` для TG-002–TG-005.
