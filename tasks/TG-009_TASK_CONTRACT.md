# TG-009 — Pure domain state machine и invariant engine

## 1. Identity / BASE_SHA

- `TASK_ID`: `TG-009`
- `RISK_CLASS`: `CRITICAL`
- `BASE_SHA`: `0332bf029ab12a1217f1aef5f6bf0f26e6a2faca`
- Task branch: `codex/tg-009-contract`
- Primary ownership: `LANE-D`
- Перед authoring подтверждено: `git rev-parse HEAD` равен `BASE_SHA`.

## 2. Goal

Реализовать в `packages/domain/**` чистый TypeScript domain contract для закрытой state machine `TR-001…TR-022`: исчерпывающие validation results, exact-target requirements и детерминированные projection/event plans. Engine обязан сохранять продуктовые инварианты без HTTP, SQL, MAX, времени, I/O и без принятия frontend `allowed_actions` за authority.

## 3. Canonical sources

Приоритет источников не меняется:

1. `docs/01_PRODUCT_FREEZE.md` §§5–9, 16–17.
2. `docs/02_PRODUCT_SPEC.md` §§3.8–6, 8–9, 13–17, 22–24, особенно `TR-001…TR-022` и `INV-001…INV-041`.
3. `docs/03_ARCHITECTURE.md` §§13–16, 26.1.
4. `docs/04_DATA_MODEL.md` §§1.3–1.5, 9–17, 20, 29–32, 37.
5. `docs/05_INTERFACE_CONTRACTS.md` §§8, 10–23, 29, 32–33, 37–38.
6. `docs/07_DECISIONS.md`, прежде всего ADR-010…ADR-015.
7. `tasks/TASK_GRAPH.md`, раздел `TG-009`.
8. TG-002 exports: `packages/contracts/**`.

Проверка rework/reassignment не выявила `SPEC CONFLICT`: Product Spec §§8.8, 16, Data Model §§12.4, 20, 30–31 и Interface Contracts §§12–15, 20 согласованы.

## 4. Dependencies / unlocks

- `Depends On`: `TG-002` — COMPLETE на заданной базе.
- `Unlocks`: `TG-014`.
- `Parallel With`: `TG-006`, `TG-010`, `TG-020`.
- Graph semantics и wave placement не меняются.

## 5. Allowed write scope

Для implementation TG-009 разрешён только `packages/domain/**`, включая package-local tests/config. Shared manifests и `packages/contracts/**` принадлежат другим владельцам и не изменяются.

Для текущего contract-authoring разрешён только `tasks/TG-009_TASK_CONTRACT.md`.

## 6. Forbidden scope

- Никаких HTTP handlers/status codes, SQL/DB repositories/locks, MAX adapters, UI/`allowed_actions`, auth/tenant-resolution или runtime I/O.
- Не менять Product Freeze, Product Spec, Architecture, Data Model, Interface Contracts, Task Graph и TG-002 contracts.
- Не вводить generic state mutation/PATCH, девятое state, пятую role, reopen, timer/auto-close или автоматический retarget stale command.
- Не схлопывать `selected`, `sent` и `accepted`; не считать Resident confirmation завершением; не давать Contractor право завершать Case.
- Не реализовывать authoritative concurrency: transaction, Case row lock, повторная authorization/currentness validation и DB constraints остаются ответственностью backend/DB задач. Domain plan лишь детерминированно валидирует переданный актуальный snapshot и exact targets.
- Не добавлять runtime dependencies и не менять root manifests/lockfile в рамках TG-009.

## 7. Required behavior / invariants

### 7.1. Закрытые типы и validation contract

- Единственный closed state set: `CREATED`, `ACCEPTED_BY_UK`, `SENT_TO_CONTRACTOR`, `EXECUTION`, `AWAITING_RESULT_CHECK`, `REMARKS_REVIEW`, `REWORK`, `COMPLETED`; `COMPLETED` terminal.
- Использовать TG-002 wire types там, где они задают общий contract; forbidden ninth state должен быть непредставимым либо явно отвергаться на runtime boundary.
- Каждая команда возвращает закрытый discriminated validation result: valid domain plan либо rejection без projection/event effects. Rejection различает как минимум terminal, actor/state, stale exact target/currentness и business-input/invariant failures; transport mapping не входит в domain.
- Valid plan явно содержит необходимый next state, изменения current projection, создаваемые immutable domain facts и упорядоченный prescribed EVT set. В plan нет SQL, network call, clock read или сгенерированных persistence IDs.

### 7.2. Closed transition и prescribed event matrix

| TR | Допустимый переход | Обязательный event plan |
| --- | --- | --- |
| TR-001 | `— → CREATED`, только Resident | `EVT-001` |
| TR-002 | `CREATED → ACCEPTED_BY_UK`, только UK | `EVT-002` |
| TR-003 | `ACCEPTED_BY_UK → ACCEPTED_BY_UK`, UK select | `EVT-003` |
| TR-004 | `ACCEPTED_BY_UK → SENT_TO_CONTRACTOR`, UK send exact selection | `EVT-004` |
| TR-005 | `SENT_TO_CONTRACTOR → EXECUTION`, exact pending-assignment Contractor accepts | `EVT-005` |
| TR-006 | `SENT_TO_CONTRACTOR → ACCEPTED_BY_UK`, exact pending-assignment Contractor rejects | `EVT-006` |
| TR-007 | `EXECUTION → AWAITING_RESULT_CHECK`, current executor submits valid Result | `EVT-008` |
| TR-008 | `AWAITING_RESULT_CHECK → AWAITING_RESULT_CHECK`, Resident confirms current Result | `EVT-010` |
| TR-009 | `AWAITING_RESULT_CHECK → REMARKS_REVIEW`, Resident remarks current Result | `EVT-011` |
| TR-010 | `AWAITING_RESULT_CHECK → AWAITING_RESULT_CHECK`, UK records no feedback | unique `EVT-015` |
| TR-011 | `AWAITING_RESULT_CHECK → COMPLETED`, UK completes on current confirmation | `EVT-016` |
| TR-012 | `AWAITING_RESULT_CHECK → COMPLETED`, UK completes on exact no-feedback basis | `EVT-016` |
| TR-013 | `REMARKS_REVIEW → REMARKS_REVIEW`, UK requests clarification | `EVT-012` only |
| TR-014 | `REMARKS_REVIEW → REMARKS_REVIEW`, Resident replies to current clarification | `EVT-007` |
| TR-015 | `REMARKS_REVIEW → REWORK`, UK returns current remark | ordered `EVT-013`, derived `EVT-014` |
| TR-016 | `REMARKS_REVIEW → COMPLETED`, UK completes with nonempty explanation | `EVT-017` only |
| TR-017 | `REWORK → AWAITING_RESULT_CHECK`, preserved current executor submits Result | `EVT-008` |
| TR-018 | `REWORK → REWORK`, UK selects different contractor | `EVT-003` |
| TR-019 | `REWORK → SENT_TO_CONTRACTOR`, UK sends exact new selection | `EVT-004` |
| TR-020 | Resident comment in permitted current context, state unchanged | `EVT-007` |
| TR-021 | UK comment/clarification in permitted non-terminal context, state unchanged | `EVT-007`, кроме отдельного TR-013 plan |
| TR-022 | current executor comment in `EXECUTION|REWORK`, state unchanged | `EVT-007` |

Add-result-material — отдельный valid plan без state change с `EVT-009`; он не заменяет Submit Result и не создаёт `EVT-008`.

### 7.3. Exact targets, projections и completion basis

- Select Contractor: current `iteration_id` + requested contractor; в `REWORK` новый contractor обязан отличаться от current executor.
- Send Assignment: exact current `selection_id + iteration_id`.
- Accept/Reject Assignment: exact current pending `assignment_id`; первое валидное решение закрывает второе. Reject требует непустую причину, очищает current selection/assignment/executor, возвращает `ACCEPTED_BY_UK`, сохраняет Case и iteration.
- Add Result Material: exact current accepted `assignment_id + iteration_id`. Submit Result: те же targets плюс exact material IDs; только current executor, непустой текст, `NONE|PHOTO|FILE` requirement, максимум один Result на iteration.
- Resident feedback: exact current `result_id + iteration_id`, максимум одна formal branch. Confirmation не меняет state и не завершает Case; remark переводит в `REMARKS_REVIEW`.
- Clarification, Return To Rework и disputed completion: exact current `result_id + feedback_id`; iteration выводится из immutable targets и обязана быть current. Resident reply в `REMARKS_REVIEW` target'ит current clarification context.
- Return To Rework — единственный plan, создающий ровно `N+1`: сохраняет Case ID и history, очищает current Result, сохраняет accepted current Assignment/executor для того же подрядчика и создаёт `EVT-013 + EVT-014` одной операцией.
- Выбор другого contractor в `REWORK` не создаёт ещё одну iteration: новый Selection становится current, а previous current Assignment/executor очищаются немедленно; old accepted Assignment остаётся immutable history. Далее обязательна цепочка new select → send → accept.
- Rejection, selection/reassignment, send и accept никогда не создают `N+1`.
- Normal completion имеет ровно две basis-ветки: (a) exact current CONFIRMATION feedback; (b) exact current Result + exact `EVT-015` этого Result + отсутствие feedback при validation + отдельный explicit UK `completion_basis` с подтверждением и непустым process reference. Сам `EVT-015` недостаточен.
- Disputed completion требует exact current REMARK feedback и непустое explanation, создаёт `EVT-017` без `EVT-016`.
- Любая completion выполняется только UK. Resident/Contractor не закрывают Case; elapsed time не создаёт event, basis или transition.

### 7.4. Invariants и concurrency boundary

- Domain validation и plans покрывают все применимые к pure engine части `INV-001…INV-041`: identity/history/state, assignment/executor, UK completion, feedback/iterations, comments, Result и category snapshot rules. Persistent append-only/uniqueness/access guarantees остаются downstream enforcement, но domain plan не может им противоречить.
- `selected ≠ sent ≠ accepted`; executor возникает только после accept exact current Assignment.
- Старые iteration/result/selection/assignment и actor/state combinations отклоняются; valid rejection не содержит ложных success events/effects.
- `first valid wins` моделируется как повторная validation того же intent против переданного current snapshot: изменившийся target/state даёт rejection, без retarget. Authoritative serialization/revalidation под DB lock остаётся backend/DB responsibility.
- Любая process mutation из `COMPLETED` отклоняется terminal guard. Frontend `allowed_actions` — только projection hint и не является входом доверия для решения domain engine.

## 8. Dependency requests

`NONE`. Используются уже зафиксированные TypeScript/Vitest workspace capabilities и TG-002 contracts. Если реализация докажет необходимость нового пакета, запрос направляется Integration Agent; TG-009 не меняет root manifests/lockfile самостоятельно.

## 9. Acceptance criteria

1. Package остаётся pure и импортирует только domain-safe TG-002 types; HTTP/SQL/MAX/runtime I/O imports отсутствуют.
2. Closed tables исчерпывающе представляют `TR-001…TR-022`, все 8 states, exact targets, actor/state guards и prescribed EVT plans; generic/fallback transition отсутствует.
3. Every valid result содержит согласованный projection/event plan; every invalid result не содержит mutation/event success plan.
4. `COMPLETED` terminal; Resident confirmation остаётся `AWAITING_RESULT_CHECK`; только UK создаёт completion plan.
5. Только Return To Rework создаёт ровно `N+1`; rejection/reassignment iteration не меняют; same accepted Assignment/executor переживает same-contractor rework.
6. Different-contractor rework немедленно снимает old current authority и требует new send/accept, не меняя iteration повторно.
7. Все three completion branches используют exact current basis; no-feedback имеет отдельный explicit completion basis; timer/auto-close отсутствует.
8. Stale exact targets, forbidden actor/state combinations, ninth state и terminal mutations отвергаются без success effects.
9. `INV-001…INV-041` имеют table-driven coverage в применимой к pure engine части; границы persistence/auth/config enforcement явно не подменяются.
10. Изменения ограничены `packages/domain/**`; dependencies, shared contracts и canonical semantics не изменены.

## 10. Required tests

Обязательны deterministic table-driven tests:

- каждая строка `TR-001…TR-022`, включая actor, source/next state, projection effect и exact EVT set;
- domain-relevant `INV-001…INV-041` с явной traceability в test names/data;
- все 8 states и runtime/compile-time negative для forbidden ninth state;
- terminal guard для каждой process command family;
- stale selection/assignment/iteration/result/feedback/clarification/completion targets;
- forbidden actor/state combinations и selected/sent-before-accepted executor negatives;
- event plan assertions, включая `EVT-012` only, `EVT-013+EVT-014`, `EVT-017` only и `EVT-009` без state change;
- confirmation-not-completion;
- normal rework `N+1`, rejection iteration unchanged, reassignment iteration unchanged, same-contractor accepted Assignment reuse в `N+1`;
- exact completion-basis branches: confirmation, no-feedback с отдельным basis, disputed explanation; negatives для EVT-015-only, late feedback и empty explanation;
- first-valid-wins simulations через sequential validation against updated snapshot, без заявления о проверке DB race.

После implementation должны проходить:

```text
npm run typecheck --workspace @max-smart-city/domain
npm run test --workspace @max-smart-city/domain
npm run build --workspace @max-smart-city/domain
npm run typecheck
npm test
```

## 11. Git / integration handoff

- Implementation стартует только от назначенного stable `BASE_SHA`; contract branch: `codex/tg-009-contract` от `0332bf029ab12a1217f1aef5f6bf0f26e6a2faca`.
- Для CRITICAL contract обязателен ровно один independent review до implementation.
- Commit/push выполняются существующей человеческой Git identity, без AI attribution; handoff содержит полный commit SHA, список changed files и результаты проверок.
- Integration Agent принимает implementation после review closure и объединяет Wave 2; task agent не меняет canonical `main`.

## 12. Blocker protocol

Остановить затронутую работу и сообщить конкретный blocker при `SPEC CONFLICT`, неверном `BASE_SHA`, необходимости выйти за write scope, drift TG-002 contract или несовместимости утверждённых Product Spec/Data Model/Interface Contracts. Не изобретать semantics и не обходить конфликт кодом. Для `CRITICAL` review с `FIX_REQUIRED`: один полный batch findings, один batch fix, затем только targeted closure.
