# Этапы CREATE

Wave 0–1 завершены по прежнему strict SDD и **grandfathered**: TG-001…TG-005 `COMPLETE`, `IC-0 = PASS`, `IC-1 = PASS`. `IC1_CHECKPOINT_SHA = 56d24135bb30f9f957b4f56b261bb3bd472ee253`. Их контракты и review history не переписываются. Lean Hackathon SDD действует только с Wave 2. Текущий статус — [PROJECT_STATE](../docs/08_PROJECT_STATE.md).

[Canonical Task Graph](TASK_GRAPH.md) остаётся единственным источником task IDs, definitions, `Depends On`, `Unlocks`, wave numbering и lanes: **35 tasks, 74 direct dependency edges, 17 waves, 4 lanes**. Его исторические gate/status-блоки не задают текущий workflow. Ни одной зависимости, назначения wave или задачи эта governance-правка не меняет.

| Этап | Статус |
| --- | --- |
| Product / Architecture / Data Model / Interface Contracts | Утверждены; semantics сохраняется. |
| Task Graph | `PASS / APPROVED`; состав и зависимости неизменны. |
| Wave 0: TG-001 | `COMPLETE`; `IC-0 PASS`. |
| Wave 1: TG-002, TG-003, TG-004, TG-005 | `COMPLETE`; `IC-1 PASS`. |
| Wave 2: TG-006, TG-009, TG-010, TG-020 | **NEXT**; implementation этой governance-задачей не начата. |

## Risk-class workflow для Wave 2+

Оркестратор назначает класс каждой задачи по реальным границам риска; execution classes A–D в Task Graph не заменяются и не меняются. Если задача затрагивает несколько классов, выбрать более строгий применимый flow.

| Класс | Применение | Flow |
| --- | --- | --- |
| **CRITICAL** | State machine; DB/migrations; auth/authorization; tenant isolation; concurrency/idempotency; MAX integration; outbox/notification; security boundaries; cross-cutting composition. | Краткий Task Contract → **один** independent review → implementation → wave integration. При `FIX_REQUIRED`: один полный batch findings → один batch fix → только targeted closure. |
| **STANDARD** | Обычные API/use cases и read models; frontend screens/flows, forms, routing, already-defined role UI, simple config UI. | Краткий Task Contract → self-check → canonicalize → implementation → wave integration. Independent contract review только при реальной неустранимой semantic ambiguity или high-risk boundary. |
| **DELIVERY** | Docker, compose, OpenAPI, deploy, HTTPS, README, runbook, presentation, submission package, runtime evidence. | При однозначных canonical docs: implementation/delivery → verification; без отдельного contract/review ради процесса. |

Для нужного контракта использовать [Lean Task Contract](TASK_TEMPLATE.md): только what, boundaries, acceptance. Не создавать многоступенчатые review/fix циклы и контракты на 600–800 строк. При `SPEC CONFLICT` действуют нормативные продуктовые правила.

Начиная с Wave 2, не коммитить новые `*_AUTHORING_REPORT.md`, `*_REVIEW.md`, `*_RECHECK.md`, `*_TARGETED_RECHECK.md`, closure matrices, temporary internal evidence и review transcripts. Review может проходить вне canonical repository. Существующие Wave-0/1 артефакты сейчас сохраняются.

**FINAL REPOSITORY HYGIENE** выполнить ближе к TG-034/TG-035: проверить references, сохранить официально необходимые submission/runtime/docs материалы, удалить только ненужный internal process clutter. Сейчас ничего не удалять.
