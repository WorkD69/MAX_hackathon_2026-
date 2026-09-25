# TG-022 — Resident create, comments, feedback и attachment UX

```text
TASK_ID = TG-022
RISK_CLASS = STANDARD
Primary Ownership = LANE-C
Execution Class = A — Implementation
CONTRACT_BASE_SHA = 611acf21240d36fc933b843022a26530f5a97526
UPSTREAM_TG021_IMPLEMENTATION_SHA = 55131985aa9ef791d33fffb7aa53b4820c6503a9
TG021_FINAL_READY = NO
CONTRACT_BRANCH = codex/tg-022-contract
CONTRACT_FILE = tasks/TG-022_TASK_CONTRACT.md
STATUS = TG022_LEAN_CONTRACT_AUTHORED | BLOCKED
IMPLEMENTATION_BLOCKED_UNTIL_TG021_FINAL = YES
```

## 1. Identity / BASE_SHA

`TASK_ID = TG-022`; `RISK_CLASS = STANDARD`; `Primary Ownership = LANE-C`; `Execution Class = A — Implementation`.
`CONTRACT_BASE_SHA = 611acf21240d36fc933b843022a26530f5a97526` (актуальный `origin/main` при authoring).
`UPSTREAM_TG021_IMPLEMENTATION_SHA = 55131985aa9ef791d33fffb7aa53b4820c6503a9` — TG-021 implementation candidate существует, но проходит canonical reconciliation; `TG021_FINAL_READY != YES`.
Contract branch: `codex/tg-022-contract`. Implementation branch: отдельная, создаётся только после `TG021_FINAL_READY = YES`.

## 2. Goal

Дать Resident полный путь UX от CreateCase через рабочие комментарии, уточняющие ответы, просмотр Result с материалами, взаимноисключающие формальные ветки feedback (confirmation / remark) и download до подтверждения завершения. Workflow mutations демонстрируют pending/success/semantic error/409 stale с authoritative refetch. CreateCase failure не создаёт fake local Case. Category/premises предлагаются только из доступных active server-provided options. Confirmation и remark — взаимоисключающие формальные feedback branches; confirmation НЕ означает закрытие Case; remark обязан target'ить current Result/current iteration по approved interface.

## 3. Canonical sources

Приоритет задаёт `AGENTS.md`. Продукт: `docs/01_PRODUCT_FREEZE.md` §§6–9, 11; `docs/02_PRODUCT_SPEC.md` §7, §11, §§13–17, AC-001/002/006/014/015/021–027/039. Техника: `docs/03_ARCHITECTURE.md` §§8, 11, 16, 19; `docs/05_INTERFACE_CONTRACTS.md` §§10, 17–18, 23, 26, 4.2; `docs/07_DECISIONS.md` ADR-015/025/032. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` (TG-022). Interfaces: публичные `packages/contracts/src/reads.ts` TG-002, `packages/contracts/src/commands.ts` TG-002, `packages/contracts/src/attachments.ts` TG-002, сессия и demo context TG-020.

## 4. Dependencies / unlocks

`Depends On = TG-021 only`. `Unlocks = TG-028, TG-029`. `Parallel With = TG-008, TG-012, TG-019`. TG-021 должен быть `FINAL_READY = YES` перед запуском implementation TG-022. До того момента контракт авторится и проходит self-check, но implementation НЕ запускается.

## 5. Allowed write scope

Contract: только `tasks/TG-022_TASK_CONTRACT.md`. Implementation: `apps/web/src/features/resident/**`, включая create form, comment/clarification UI, Result view/material download, confirmation/remark forms, pending/success/error и refetch layers, transport seam, fixtures и тесты внутри этой директории. Потреблять публичные TG-002 contracts, TG-020 session context и TG-021 read components. Не менять backend, `packages/contracts/**`, root manifests/lockfile, Product/Architecture/Interface semantics или файлы TG-028/TG-029.

## 6. Forbidden scope

Не добавлять: contractor assignment controls; UK controls; completion control; private Resident↔Contractor channel; free remark-review comment без clarification target; fake notification-delivered indicator. Не создавать raw storage URL. Не считать upload завершением workflow. Не оптимистично мутировать workflow. Не автоматически retry stale command. Не retarget stale action. Не добавлять девятое состояние или пятую роль. Не создавать fake local Case при failed CreateCase. Не показать confirmation text, говорящий о закрытии Case. Не разрешить remark без exact current Result/iteration target. Не менять Task Graph.

## 7. Required behavior / invariants

### CreateCase
- Житель выбирает только доступные active server-provided category/premises options; список формируется из server projection, а не client-hardcoded.
- CreateCase отправляет `POST /api/v1/cases` с `Idempotency-Key` (principal `APP_USER`); multipart: JSON payload `{premises_id, category_id, description}` + optional initial attachments.
- Failed CreateCase НЕ создаёт fake local Case; UI показывает semantic error и позволяет повторить.
- На success — refetch authoritative Case snapshot; переход к Case details.

### Attachments / files
- Поддержать canonical upload/download contracts из TG-002 (`packages/contracts/src/attachments.ts`).
- Не создавать raw storage URL; использовать approved capability mint/consume и web download adapters.
- Upload retry/idempotency key lifecycle согласно Interface Contracts §5: same principal + same key + same fingerprint возвращает canonical stored success; different fingerprint → `409 IDEMPOTENCY_KEY_REUSE`.
- Multipart fingerprint включает canonical normalized JSON payload + SHA-256 каждого logical file в stable logical order.
- Upload НЕ считается завершением workflow.

### Observable comments
- Единая лента комментариев внутри случая (Product Spec §11, §5.2, §10.1).
- Resident пишет комментарий в `EXECUTION`/`REWORK` (координация доступа/выполнения) и в `REMARKS_REVIEW` только как reply на существующий `CLARIFICATION_REQUEST`.
- Clarification reply: Resident отвечает на запрос уточнения УК с `clarification_request_id`, target Comment `CLARIFICATION_REQUEST`, same Case, `context_result_id == Case.current_result_id`, `context_feedback_id` current REMARK Feedback, target iteration == `Case.current_iteration_id`.
- Не создать private Resident↔Contractor канал.

### Confirmation vs Remark (взаимоисключающие branches)
- **Confirmation** (`RESIDENT_CONFIRM`): Житель подтверждает актуальный результат; состояние остаётся `AWAITING_RESULT_CHECK`; НЕ закрывает Case; создаёт `ResidentFeedback type=CONFIRMATION` + EVT-010.
- **Remark** (`RESIDENT_REMARK`): Житель оставляет формальное замечание по актуальному результату текущей итерации; переходит в `REMARKS_REVIEW`; создаёт `ResidentFeedback type=REMARK` + EVT-011.
- Confirmation и remark взаимоисключающие: конкурирующая операция → `409`, первое валидно зафиксированное действие побеждает.
- Confirmation text НЕ говорит «Case закрыт» / «Случай завершён».
- Remark обязан target'ить exact `result_id + iteration_id` текущего Result/current iteration по approved interface (`/api/v1/cases/{caseId}/commands/resident-remark`).

### Result review / materials / download
- Resident видит текущий Result подрядчика: description, submitted_at, attachments.
- Результат и материалы загружаются через native capability и web download adapters; download capability создаётся backend, URL opaque.
- Material validation по `result_requirement_snapshot` (NONE/PHOTO/FILE) — server-side; frontend отображает требования.

### Confirmation и завершение
- Confirmation НЕ означает завершение Case. Case завершает только УК (TR-011/TR-012).
- После confirmation Resident видит понятный статус «Результат подтверждён. Ожидается решение УК» или аналог.
- После remark Resident видит «Ваше замечание передано в УК» и ожидает решения УК.

### Stale / mutation UX
- Все workflow mutations: `pending` → `success` / `semantic error` / `409 stale`.
- `409` вызывает refetch authoritative state; нет auto-retry, нет retarget, нет optimistic workflow transition.
- После 409 показывать понятное сообщение: «Случай изменился с момента открытия. Данные обновлены.»; требуется новое явное действие пользователя.
- Idempotency key lifecycle для retry/upload — только согласно Interface Contracts §5.

### Mobile / web
- Все экраны и формы пригодны в mobile и web MAX viewport.
- Responsive layout; touch-friendly controls; доступная навигация.

## 8. Dependency requests

`NONE`. Достаточны React, TanStack Query, React Router, TG-002 contracts (reads, commands, attachments), TG-020 session context и TG-021 read components. Shared manifests/lockfile не менять. Не требуются новые dependency additions.

## 9. Acceptance criteria

1. CreateCase validation: только active server-provided category/premises; failed create НЕ создаёт fake local Case; semantic error отображается.
2. Accessible category/premises fixtures: dropdown/picker получает options из server projection; пустой/неактивный вариант недоступен.
3. Upload retry/idempotency key lifecycle: same key replay returns canonical success; different key with same intent serializes; multipart fingerprint includes SHA-256 file bytes.
4. Resident comment: доступен в `EXECUTION`/`REWORK`/`REMARKS_REVIEW` (только как reply на clarification); clarification reply с machine-checkable `clarification_request_id` и target context validation.
5. Result/material rendering: current Result отображается с description, submitted_at, attachments; materials доступны через native/web download adapter.
6. Native/web download adapter: download capability создаётся backend; resident получает opaque capability URL; raw storage URL не экспонируется.
7. Confirmation vs remark: mutually exclusive; confirmation text does NOT say closed; remark targets exact `result_id + iteration_id`; competing confirmation/remark → `409`.
8. Action visibility: `allowed_actions` от server-filtered snapshot; `CREATE_CASE`, `ADD_COMMENT`, `RESIDENT_CONFIRM`, `RESIDENT_REMARK` отображаются согласно state/role; forbidden actions отсутствуют.
9. 409 refetch: stale command → `409` → refetch Case/activity/`allowed_actions`; no auto-retry, no retarget; manual/focus refresh работают.
10. Pending/success/error: каждый mutation показывает pending indicator; success → refetch; semantic error → понятное сообщение; 409 → stale banner + refetch.
11. Mobile/web: все flows проходят в обоих viewport; layout адаптивный.

## 10. Required tests

На implementation branch: `npm run typecheck -w @max-smart-city/web`, `npm test -w @max-smart-city/web`, `npm run build -w @max-smart-city/web`, relevant root typecheck/tests и `git diff --check <TG-021-implementation-SHA>`. Все без skip, `passWithNoTests` или подавления ошибок.

Проверить:
- CreateCase validation; accessible category/premises fixtures; failed create no fake Case.
- Upload retry/idempotency key lifecycle.
- Resident comment; clarification reply с `clarification_request_id`.
- Result/material rendering; native/web download adapter.
- Confirmation vs remark; confirmation text does NOT say closed; remark exact target.
- Action visibility fixtures.
- 409 refetch; pending/success/error/stale.
- Mobile/web layout.

## 11. Git / integration handoff

Contract branch: `codex/tg-022-contract`, создана от `origin/main` (`611acf21240d36fc933b843022a26530f5a97526`). Commit/push с существующей человеческой Git identity, один осмысленный commit `tasks/TG-022_TASK_CONTRACT.md`.

Implementation branch создаётся отдельно после `TG021_FINAL_READY = YES`, от exact TG-021 implementation SHA. Implementation branch: `codex/tg-022-implementation`. Не merge implementation в `main`. Передать Integration Agent полный commit SHA, результаты self-check gates, write-scope diff, remote/local SHA match и clean worktree.

## 12. Blocker protocol

Остановить затронутую работу при `SPEC CONFLICT`, неверной exact implementation base, несовместимых approved interfaces или необходимости писать в чужой scope; сообщить конкретный blocker.

`TG021_FINAL_READY != YES` — implementation блокирован до получения подтверждения, что TG-021 contract canonicalized и ready. Контракт TG-022 авторен и проходит self-check, но implementation НЕ запускается.

`SPEC CONFLICT`, baseline mismatch, необходимость расширить allowed files, изменить approved product/API semantics или нарушение чужой ownership → остановиться; сообщить конкретный source/расхождение владельцу и Integration Agent. Изменение Freeze/Spec только по явному решению команды с записью в `docs/07_DECISIONS.md`.
