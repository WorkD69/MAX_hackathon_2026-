# TG-017 — Role-filtered read models, activity и allowed_actions

## 1. Identity / BASE_SHA

`TASK_ID = TG-017`; `RISK_CLASS = STANDARD`; `Primary Ownership = LANE-A`; `CONTRACT_BASE_SHA = e44344f19671763e184508d81c0fa83b372d893f` (актуальный `origin/main` после fetch). Contract branch: `codex/tg-017-contract`. Этап: **только contract authoring + self-check**; implementation и canonicalization не выполняются.

## 2. Goal

Реализовать после открытия dependency gate backend-authoritative `GET /api/v1/cases` (`GET /cases`) и `GET /api/v1/cases/{caseId}` (`GET /cases/{id}`): до выборки применить TG-011 policy/scope, затем построить отдельную для роли list/snapshot projection, единый activity и canonical server-generated `allowed_actions` с exact current targets. Read model должен однозначно передавать semantic status, ответственность и следующий шаг, не сериализуя полный `Case` для последующего frontend hiding.

## 3. Canonical sources

Приоритет задаёт `AGENTS.md`. Продукт: `docs/01_PRODUCT_FREEZE.md` §§6–9; `docs/02_PRODUCT_SPEC.md` §§2, 4–6, 22.5–22.6, 23 и AC-028–038. Техника: `docs/03_ARCHITECTURE.md` §§8.2, 9.2, 11, 16; `docs/04_DATA_MODEL.md` §§9, 13, 17, 20–21, 34, 37; `docs/05_INTERFACE_CONTRACTS.md` §§6–9, 29–31; `docs/07_DECISIONS.md` ADR-015. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_GRAPH.md` (TG-017), `tasks/TASK_TEMPLATE.md`. Upstream/consumer: reviewed TG-007 contract `f760ed6703a1458dd1f01ef821b50afdd350e79e` на `origin/codex/tg-007-contract-artem-r2`, TG-011 authorization contract/policies, публичные TG-002 read schemas и `tasks/TG-021_TASK_CONTRACT.md`. TG-021 задаёт frontend expectations, но не backend semantics.

## 4. Dependencies / unlocks

`Depends On = TG-007, TG-016`; `Unlocks = TG-027, TG-029, TG-031`; `Parallel With = NONE` на финальном backend projection checkpoint. **Implementation запрещена до подтверждённых COMPLETE TG-007 и TG-016 и назначения Integration Agent точного implementation `BASE_SHA`.** Authoring этого контракта dependency gate не открывает.

## 5. Allowed write scope

Сейчас — только `tasks/TG-017_TASK_CONTRACT.md`. Будущая implementation после §4: `apps/api/src/modules/read-models/**`, принадлежащие TG-017 case query routes и целевые read-model unit/integration/golden tests. Использовать существующие TG-002 wire schemas и TG-011 policy descriptors; shared composition меняет только назначенный владелец через Integration Agent.

## 6. Forbidden scope

Не менять `main`, Product/Architecture/Data Model/Interface/Task Graph semantics, `packages/contracts/**`, TG-007 persistence, TG-011 authorization или TG-016 commands. Не реализовывать mutations, frontend/TG-021, optional отдельную activity pagination route, OpenAPI/TG-031 или integration/TG-029. Запрещены full-Case serialization с CSS/frontend hiding, клиентский вывод transitions/actions, client timestamps для freshness/order, исторический кабинет old contractor и раскрытие existence/details foreign tenant/run.

## 7. Required behavior / invariants

- **Reads и freshness.** `GET /api/v1/cases` поддерживает approved `state/limit/cursor`, применяет role/tenant/house/premises/current-assignment и demo-run scope **до** projection; list item соответствует TG-002 и использует только физический `Case.updated_at` как canonical freshness field. `GET /api/v1/cases/{caseId}` возвращает соответствующий TG-002 role schema, `revision/created_at/updated_at`, permitted current context, history, attachments metadata, activity и actions. Foreign/guessed tenant, Case или `demo_run_id != session.demo_run_id` — одинаковый hidden `404` до state/stale/terminal detail.
- **Semantic status / responsibility / next step.** Backend mapper покрывает ровно восемь states: `CREATED → UK / принять Case`; `ACCEPTED_BY_UK → UK / выбрать и отправить исполнителя`; `SENT_TO_CONTRACTOR → current pending contractor, при отказе UK / принять либо отклонить exact Assignment`; `EXECUTION → current executor и участники координации / выполнить работу и отправить Result`; `AWAITING_RESULT_CHECK → Resident, затем UK / дать formal feedback и завершить по валидному basis`; `REMARKS_REVIEW → UK / уточнить, вернуть на доработку либо завершить с объяснением`; `REWORK → current executor, либо UK при смене / повторно выполнить или провести новый selected→sent→accepted`; `COMPLETED → NONE / действий нет`. Wire не расширяется самовольно: canonical `state` несёт semantic status, list `responsibility` и snapshot `responsibility.semantic_code/text` несут server-authored «кто действует / что дальше»; формулировка role-safe и не раскрывает скрытые факты.
- **Role-filtered fields.** Resident получает только own permitted Cases, user-safe contractor/executor/status, свои feedback и разрешённую общую историю/материалы; exact reject reason, internal UK/contractor deliberation/audit и чужие identity/config отсутствуют в payload. UK Employee получает own organization + active house scope и полную разрешённую рабочую Case history, но не admin configuration/audit authority; UK Admin — те же Case reads для всех own-org houses и только разрешённые own-org admin details. Contractor selected-only не получает LIVE Case; exact current sent/pending contractor получает limited acceptance context и initial materials; accepted current executor — только work-relevant current context; rejected/reassigned old contractor исчезает из list и получает hidden `404` на snapshot/activity/attachments. Состояние само по себе не расширяет scope.
- **Activity.** `CaseEvent` — единственный anchor одного activity fact: `activity_id == event_id`, один event даёт ровно один item, строгий порядок по `event_seq`. `Comment`, `Result`, `ResidentFeedback` и attachment metadata только enrich связанный item; sibling comment/result/feedback/activity fact для того же события запрещён. Разрешённые старые `Result` и прошлые iteration facts сохраняются (Resident/UK согласно Case history; contractor — только если разрешает его current context), но не дублируются. Role filtering может удалить detail/item, не менять порядок оставшихся фактов и не создавать альтернативную историю.
- **Canonical `allowed_actions`.** Генерируются только backend после TG-011 revalidation из role + current state/pointers/context; это UX capability, не authorization token. Exact targets по TG-002: `ACCEPT_CASE {}`; `SELECT_CONTRACTOR {iteration_id}`; `SEND_ASSIGNMENT {selection_id, iteration_id}`; `ACCEPT_ASSIGNMENT|REJECT_ASSIGNMENT {assignment_id}`; `ADD_RESULT_MATERIAL|SUBMIT_RESULT {assignment_id, iteration_id}`; `RESIDENT_CONFIRM|RESIDENT_REMARK|RECORD_NO_RESIDENT_FEEDBACK {result_id, iteration_id}`; `REQUEST_CLARIFICATION|RETURN_TO_REWORK|COMPLETE_WITH_EXPLANATION {result_id, feedback_id}`; `COMPLETE_CASE {result_id}`; `ADD_COMMENT {}`. `REJECT_ASSIGNMENT.input.reject_reason_required = true`; остальные input hints следуют approved schema. `CREATE_CASE` остаётся session capability вне Case snapshot. Не выдавать action без current exact target и не выводить его лишь из пары role/state; command backend всегда повторно авторизует и проверяет target/currentness.

## 8. Dependency requests

`DEPENDENCY_REQUESTS = NONE`. Использовать существующие Fastify/Kysely/PostgreSQL, TG-002 schemas и TG-011 policies/scopes. Если TG-007/TG-016 final interfaces несовместимы с approved reads, остановить работу и передать exact conflict владельцу/Integration Agent; shared dependency или manifest change не добавлять молча.

## 9. Acceptance criteria

1. Оба обязательных GET endpoint возвращают schema-valid server-filtered projections; list pagination/filtering не обходит policy, а freshness берётся только из `Case.updated_at`.
2. Для всех восьми states server mapper выдаёт непротиворечивые role-safe semantic status, responsibility и next step; frontend не вычисляет workflow.
3. Resident, UK Employee, UK Admin, pending contractor, current executor и old contractor получают ровно разрешённые поля; old contractor не имеет LIVE row/details, Resident не получает reject/audit details.
4. Activity является `event_seq`-ordered one-event/one-item projection без дублирования enriched facts; разрешённые old Results остаются видимыми.
5. `allowed_actions` содержит только применимые canonical codes и exact current IDs из §7; foreign tenant/run скрыт как `404`, а последующая mutation не доверяет read capability.

## 10. Required tests

После implementation обязательны целевые read-model tests и API integration tests через real PostgreSQL, затем из корня `npm run typecheck`, `npm run build`, `npm test` без skip/`passWithNoTests`. Минимальная матрица: **4 role × 8 state golden snapshots** (Resident, UK Employee, UK Admin, Contractor Employee) плюс contractor variants pending/current/old; own/foreign tenant, house, premises и demo run; list filter/pagination и изменение позиции/freshness только по `Case.updated_at`; semantic status/responsibility/next-step mapping; activity out-of-time-order fixture, строгий `event_seq`, unique event/item и enrichment de-dup; every action exact target IDs и отсутствие stale/missing-target actions; old Result после новой iteration; Resident absence of exact rejection/internal audit; old contractor absent from list и hidden `404` для details/activity/attachments. Snapshot assertions обязаны проверять **absence** forbidden fields, не только UI omission.

## 11. Git / integration handoff

Contract: `codex/tg-017-contract` от указанного `CONTRACT_BASE_SHA`; commit/push только этого файла с существующей human Git identity, без merge/push в `main`. Передать полный contract SHA, self-check gates, write-scope diff, local/remote SHA match и clean worktree. После STANDARD canonicalization и закрытия TG-007+TG-016 Integration Agent отдельно назначает implementation branch/base; только Integration Agent объединяет implementation в стабильный `main`.

## 12. Blocker protocol

Остановить затронутую работу и сообщить точный blocker при `SPEC CONFLICT`, неверном base, незакрытых TG-007/TG-016, несовместимости TG-002/TG-011/upstream interfaces или необходимости выйти за write scope. Не исправлять конфликт новым полем, frontend inference, ослаблением hidden-404 или локальной копией authorization policy. Текущий blocker относится только к implementation: `TG-007 + TG-016 COMPLETE` ещё не подтверждены; contract authoring/self-check разрешены.
