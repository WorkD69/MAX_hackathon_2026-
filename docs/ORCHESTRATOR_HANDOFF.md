# Передача оркестратору

## Текущий checkpoint

Wave 0–1 завершены по прежнему strict SDD и **grandfathered**: TG-001…TG-005 не переписывать и не возвращать в review chains. `IC-0 = PASS`; `IC-1 = PASS`. `IC1_CHECKPOINT_SHA = 56d24135bb30f9f957b4f56b261bb3bd472ee253`. Текущая фаза — `LEAN GOVERNANCE TRANSITION → WAVE 2`. Следующая executable wave: **W2 = TG-006, TG-009, TG-010, TG-020**; эта governance-правка не реализует их. Точный статус — в [PROJECT_STATE](08_PROJECT_STATE.md).

Canonical [Task Graph](../tasks/TASK_GRAPH.md) остаётся неизменным: 35 tasks, 74 direct dependency edges, 17 waves, 4 lanes. Его исторические gate/status-блоки относятся к моменту утверждения графа; текущий статус ведётся здесь и в PROJECT_STATE. [Product Freeze](01_PRODUCT_FREEZE.md), [Product Spec](02_PRODUCT_SPEC.md), [Architecture](03_ARCHITECTURE.md), [Data Model](04_DATA_MODEL.md) и [Interface Contracts](05_INTERFACE_CONTRACTS.md) сохраняют утверждённую семантику.

## Lean Hackathon SDD с Wave 2

Перед каждой задачей оркестратор назначает класс риска по [BACKLOG](../tasks/BACKLOG.md):

| Класс | Порядок |
| --- | --- |
| **CRITICAL** | Краткий Task Contract → один independent review → implementation → wave integration. При `FIX_REQUIRED`: один полный пакет findings, одно пакетное исправление, только targeted closure. |
| **STANDARD** | Краткий Task Contract → self-check → canonicalize → implementation → wave integration. Independent contract review нужен только при реальной неустранимой semantic ambiguity или high-risk boundary. |
| **DELIVERY** | При однозначных canonical docs: implementation/delivery → verification, без отдельного contract/review ради процесса. |

Краткий контракт фиксирует **what, boundaries, acceptance** по [шаблону](../tasks/TASK_TEMPLATE.md), без построчного псевдокода и многоступенчатых review-циклов. Для Wave 2+ новые `*_AUTHORING_REPORT.md`, `*_REVIEW.md`, `*_RECHECK.md`, `*_TARGETED_RECHECK.md`, closure matrices, временные internal evidence и review transcripts не коммитятся. Review может проходить вне canonical repository. Существующие артефакты Wave 0–1 сейчас не удалять.

## Приоритет исполнения

1. Рабочий обязательный E2E.
2. Соответствие Product Freeze / Product Spec.
3. Стабильное демо.
4. Реальный путь MAX.
5. Воспроизводимый запуск.
6. Submission evidence.
7. Ясность архитектуры.
8. Internal process artifacts только по необходимости.

Partial executable path проверять регулярно по мере сборки, не ждать TG-029. Реальный MAX path обязателен; fake/test adapter не считается его подтверждением. Product, роли, восемь состояний, инварианты и утверждённые контракты не меняются ради скорости. При `SPEC CONFLICT` остановить затронутую работу и вынести решение команде с записью в [DECISIONS](07_DECISIONS.md).

## Git и завершение

Canonical mutation `main` сериализуется: перед правкой и push сверять актуальный `origin/main`, без force и перезаписи чужих изменений. Feature branches используют конкретный task `BASE_SHA`, когда это предписано контрактом. После параллельной волны Integration Agent объединяет изменения, проверяет их и создаёт стабильный `main`.

**FINAL REPOSITORY HYGIENE** — ближе к TG-034/TG-035: проверить ссылки на существующие review/recheck artifacts, сохранить всё необходимое для официальной сдачи, runtime и документации, удалить только ненужный внутренний process clutter. Сейчас cleanup не выполнять.
