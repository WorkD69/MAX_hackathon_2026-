# FINAL TGR-MAJ-004 RESOLUTION

## 1. Scope

Исправлен только residual finding `TGR-MAJ-004` относительно:

- `outputs/TASK_GRAPH_CANDIDATE_REVISED.md`;
- `C:/Users/Artem/Documents/Codex/2026-09-21/max-hackathon-2026-senior-sdd-task-3/outputs/FINAL_TARGETED_TASK_GRAPH_RECHECK.md`;
- canonical baseline `821a85f651d3beda227b656c1c9d2e5f957a1628`.

Изменения task semantics ограничены TG-006, TG-007 и TG-026. Новые tasks, edges, waves, roles, product states, architecture decisions, Task Contracts и production code не создавались.

## 2. Что было ошибочно

TG-006 выполняется в WAVE 2 после TG-005 и владеет только Case/workflow schema. Однако revised candidate требовал от TG-006 real-PostgreSQL negative UPDATE/DELETE proof для:

- Attachment bytes/immutable metadata after business association;
- successful CommandExecution canonical response.

Attachment и CommandExecution создаются operational migration owner TG-007 только в WAVE 3. Поэтому TG-006 не мог детерминированно реализовать или проверить эти guarantees в своём dependency/file boundary. TG-026 содержал полный regression matrix, но как TEST-only task не имел права исправлять отсутствующее production enforcement.

## 3. Что удалено из TG-006

Из TG-006 `Required Tests` удалена ответственность за:

- Attachment bytes и immutable metadata;
- successful CommandExecution identity/canonical response.

TG-006 теперь владеет только DB-level immutability enforcement и real-PostgreSQL negative UPDATE/DELETE proof для созданных им Case/workflow facts:

- Result;
- ResidentFeedback;
- Comment;
- ContractorSelection identity;
- immutable Assignment identity;
- one-way Assignment decision;
- CaseEvent.

`Required Outputs` и `Acceptance Criteria` TG-006 явно закрепляют эту границу. Schema semantics остальных TG-006 entities не изменены.

## 4. Что добавлено в TG-007

TG-007 остаётся production owner operational schema и теперь явно отвечает за DB-level enforcement canonical Data Model §27 semantics.

### Attachment

В `Required Outputs`, `Acceptance Criteria` и `Required Tests` добавлены:

- immutable authoritative bytes after business association;
- immutable canonical metadata after business association;
- rejection of prohibited UPDATE and arbitrary DELETE;
- real-PostgreSQL negative proof that the authoritative row remains unchanged.

### CommandExecution

В `Required Outputs`, `Acceptance Criteria` и `Required Tests` добавлены:

- immutable principal/key/fingerprint/command identity after reservation;
- единственный normal transition `IN_PROGRESS → SUCCEEDED`;
- immutable finalized successful canonical response;
- rejection of second transition, response rewrite and arbitrary deletion of completed successful execution;
- explicit allowed-finalization fixture followed by negative real-PostgreSQL UPDATE/DELETE proof.

Новая constraint strategy не задана. Task применяет только уже утверждённые semantics Data Model §§18, 27 и существующую PostgreSQL persistence boundary.

## 5. Что сохранено в TG-026

TG-026 сохраняет полный cross-module real-PostgreSQL regression matrix для:

- Result;
- ResidentFeedback;
- Comment;
- Attachment bytes/metadata;
- ContractorSelection identity;
- Assignment immutable identity;
- one-way Assignment decision;
- CaseEvent;
- successful CommandExecution canonical response.

TG-026 остаётся TEST-only: production feature/schema edits запрещены. `Integration Notes` теперь явно указывает, что TG-026 проверяет guarantees TG-006 и TG-007 и возвращает defect соответствующему production owner.

## 6. Final Ownership

```text
TG-006 = Case/workflow immutability owner
TG-007 = operational Attachment/CommandExecution immutability owner
TG-026 = full cross-module regression owner
```

Каждая production guarantee теперь принадлежит task, которая создаёт соответствующую schema до выполнения regression task.

## 7. Graph Topology Regression Check

Final candidate был независимо разобран после правки. Его dependency/scheduling representations совпадают с revised candidate.

```text
TASK_COUNT = 35
DEPENDENCY_EDGES = 74
WAVE_COUNT = 17
LANES = 4

CYCLES = 0
DANGLING = 0
MERMAID_MISMATCHES = 0
UNLOCKS_MISMATCHES = 0
WAVE_VIOLATIONS = 0
PARALLEL_WITH_MISMATCHES = 0

TOPOLOGY_AND_SCHEDULING_IDENTICAL_TO_REVISED = YES
```

Не изменены:

- `Depends On`;
- `Unlocks`;
- Mermaid;
- waves;
- `Parallel With`;
- lane allocation;
- critical paths.

## 8. Canonical Semantics Regression Check

```text
PRODUCT_FREEZE_CHANGED = NO
PRODUCT_SPEC_CHANGED = NO
ARCHITECTURE_CHANGED = NO
DATA_MODEL_CHANGED = NO
INTERFACE_CONTRACTS_CHANGED = NO
ADR_CHANGED = NO
SPEC_CONFLICTS = 0
```

Перенесено только implementation/test ownership уже утверждённых immutable facts. Новая DB constraint strategy, новая product semantics или новый architecture decision не вводились.

## 9. Remaining Findings

```text
TGR_MAJ_004 = RESOLVED
TARGET_FINDINGS_REMAINING = 0
```

Independent final single-finding recheck всё ещё обязателен. Task Contracts и coding остаются blocked до отдельного gate decision.

## 10. Self-Status

```text
READY FOR FINAL SINGLE-FINDING RECHECK
```
