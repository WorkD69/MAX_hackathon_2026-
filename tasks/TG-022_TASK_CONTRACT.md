# TG-022 — Resident create, comments, feedback и attachment UX

```text
TASK_ID = TG-022
RISK_CLASS = STANDARD
Primary Ownership = LANE-C
Execution Class = A — Implementation
CONTRACT_BASE_SHA = 611acf21240d36fc933b843022a26530f5a97526
UPSTREAM_TG021_IMPLEMENTATION_SHA = 55131985aa9ef791d33fffb7aa53b4820c6503a9
HISTORICAL_TG021_FINAL_READY = NO
CONTRACT_BRANCH = codex/tg-022-contract
CONTRACT_FILE = tasks/TG-022_TASK_CONTRACT.md
STATUS = HISTORICAL_TG022_CONTRACT; FINAL_COMPATIBILITY_REQUIRES_TG014_OPTIONS
HISTORICAL_IMPLEMENTATION_BLOCKED_UNTIL_TG021_FINAL = YES
```

## 1. Identity / BASE_SHA

`TASK_ID = TG-022`; `RISK_CLASS = STANDARD`; `Primary Ownership = LANE-C`; `Execution Class = A — Implementation`.
`CONTRACT_BASE_SHA = 611acf21240d36fc933b843022a26530f5a97526` (историческая authoring base; исходные SHA/status поля выше сохранены как provenance).
`UPSTREAM_TG021_IMPLEMENTATION_SHA = 55131985aa9ef791d33fffb7aa53b4820c6503a9` — историческое состояние TG-021 implementation candidate на момент исходного authoring; тогда `TG021_FINAL_READY != YES`.
Исторический contract branch: `codex/tg-022-contract`. Существующий TG-022 implementation contribution уже есть в `apps/web/src/features/resident/**` на текущей базе gap closure `b2805b197d1e3a8044ea3677af1c6fba68742114`; его финальная совместимость требует отдельной правки после TG-014 options surface. Старые строки о TG-021 readiness относятся к исходному authoring, а не отменяют существующий вклад.

## 2. Goal

Дать Resident полный путь UX от CreateCase через рабочие комментарии, уточняющие ответы, просмотр Result с материалами, взаимноисключающие формальные ветки feedback (confirmation / remark) и download до подтверждения завершения. Workflow mutations демонстрируют pending/success/semantic error/409 stale с authoritative refetch. CreateCase failure не создаёт fake local Case. Category/premises предлагаются только из доступных active server-provided options. Confirmation и remark — взаимоисключающие формальные feedback branches; confirmation НЕ означает закрытие Case; remark обязан target'ить current Result/current iteration по approved interface.

## 3. Canonical sources

Приоритет задаёт `AGENTS.md`. Продукт: `docs/01_PRODUCT_FREEZE.md` §§6–9, 11; `docs/02_PRODUCT_SPEC.md` §7, §11, §§13–17, AC-001/002/006/014/015/021–027/039. Техника: `docs/03_ARCHITECTURE.md` §§8, 11, 16, 19; `docs/05_INTERFACE_CONTRACTS.md` §§9A–10, 17–18, 23, 26, 4.2; `docs/07_DECISIONS.md` ADR-015/025/032. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` (TG-022). Interfaces: публичные `packages/contracts/src/reads.ts` TG-002 c coordinated options schema, `packages/contracts/src/commands.ts` TG-002, `packages/contracts/src/attachments.ts` TG-002, сессия и demo context TG-020; TG-014 registerable options endpoint.

## 4. Dependencies / unlocks

`Depends On = TG-014, TG-021`. `Unlocks = TG-028, TG-029`. `Parallel With = TG-015`. Финальная совместимость существующего TG-022 contribution требует TG-014 Resident-safe options/read endpoint и согласованной shared response schema. Сам факт ранней TG-022 реализации сохраняется; он не закрывает этот dependency. Центральная регистрация TG-014 backend и TG-022 route contribution остаётся TG-029.

## 5. Allowed write scope

В этом canonical gap-closure pass меняются только согласованные contract/docs/graph files, без production code. Последующая compatibility implementation: `apps/web/src/features/resident/**`, прежде всего `resident-transport.ts`, `create-case/create-case-form.tsx`, fixtures и targeted tests; остальные существующие TG-022 screens сохраняются и адаптируются только по необходимости. Потреблять публичные TG-002 contracts, TG-020 session context, TG-021 read components и TG-014 options endpoint. Shared `packages/contracts/src/reads.ts` schema согласуется с владельцем TG-002 через Integration Agent до изменения; не править backend/central router/root manifests/lockfile или Product semantics в TG-022.

## 6. Forbidden scope

Не добавлять: contractor assignment controls; UK controls; completion control; private Resident↔Contractor channel; free remark-review comment без clarification target; fake notification-delivered indicator. Resident CreateCase не вызывает `/api/v1/config/categories` или иной `UK_ADMIN` configuration endpoint и не получает default contractor internals. Не создавать raw storage URL. Не считать upload завершением workflow. Не оптимистично мутировать workflow. Не автоматически retry stale command. Не retarget stale action. Не добавлять девятое состояние или пятую роль. Не создавать fake local Case при failed CreateCase. Не показать confirmation text, говорящий о закрытии Case. Не разрешить remark без exact current Result/iteration target.

## 7. Required behavior / invariants

### CreateCase
- Житель получает current accessible premises через `GET /api/v1/cases/create-options`; после выбора помещения запрашивает тот же endpoint с `premises_id`, получает только категории, допустимые для этого помещения и выведенной сервером Organization. Response shape — Interface §9A; `result_requirement` и Resident-visible category fields показываются до submit, где нужны UX. UI не выбирает tenant и не читает admin configuration.
- После смены помещения category selection сбрасывается; после refresh/invalidation options перечитываются. `404` для утратившего доступ помещения убирает старый выбор. Options read не даёт authority на создание: `POST /api/v1/cases` повторно проверяет доступ и конфигурацию, а UI показывает canonical error без fake Case.
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

Новых packages не требуется. Для финальной совместимости обязателен TG-014 `GET /api/v1/cases/create-options` и согласованная TG-002 shared response schema из `reads.ts` по Interface §9A. Владелец shared schema и Integration Agent координируют экспорт до TG-022 compatibility implementation; TG-022 не создаёт ad hoc admin config projection. React, TanStack Query, React Router, TG-020 session context и TG-021 read components достаточны; shared manifests/lockfile не менять.

## 9. Acceptance criteria

1. CreateCase validation: только доступные premises и категории, возвращённые TG-014 Resident-safe endpoint для выбранного помещения; нет вызова `/api/v1/config/categories`; failed create НЕ создаёт fake local Case; semantic error отображается.
2. Accessible category/premises fixtures: dropdown/picker потребляет §9A options без tenant/default contractor internals, при смене помещения сбрасывает category; пустой/неактивный или отозванный вариант недоступен, а `404`/stale command вызывает refresh.
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

На будущей compatibility implementation branch: `npm run typecheck -w @max-smart-city/web`, `npm test -w @max-smart-city/web`, `npm run build -w @max-smart-city/web`, relevant root typecheck/tests и `git diff --check` относительно назначенной base. Все без skip, `passWithNoTests` или подавления ошибок. В текущем authoring pass эти implementation tests не запускаются.

Проверить:
- CreateCase options transport использует только `/api/v1/cases/create-options` без `/api/v1/config/**`; запрос без/с `premises_id`, selected-premises category scoping, category reset, `404`/access refresh, `result_requirement` display; failed create no fake Case.
- Upload retry/idempotency key lifecycle.
- Resident comment; clarification reply с `clarification_request_id`.
- Result/material rendering; native/web download adapter.
- Confirmation vs remark; confirmation text does NOT say closed; remark exact target.
- Action visibility fixtures.
- 409 refetch; pending/success/error/stale.
- Mobile/web layout.

## 11. Git / integration handoff

Исторический TG-022 authoring/implementation contribution уже присутствует в repository; его SHA/branch поля §1 сохранены как provenance. Текущий canonical gap closure коммитится с графом и интерфейсом только в `codex/canonical-gap-closure-tg014-tg018-tg022`; production compatibility implementation выполняется позже на назначенной Integration Agent базе после TG-014 options. Не merge/push `main` из этого authoring pass. Передать exact closure SHA и потребность в compatibility fix на independent review.

## 12. Blocker protocol

Остановить затронутую работу при `SPEC CONFLICT`, неверной exact implementation base, несовместимых approved interfaces или необходимости писать в чужой scope; сообщить конкретный blocker.

Исторический `TG021_FINAL_READY != YES` в §1 относится к моменту исходного authoring. Существующий TG-022 вклад не считается финально совместимым, пока TG-014 options и coordinated shared schema не доступны; compatibility implementation не входит в текущий authoring pass.

`SPEC CONFLICT`, baseline mismatch, необходимость расширить allowed files, изменить approved product/API semantics или нарушение чужой ownership → остановиться; сообщить конкретный source/расхождение владельцу и Integration Agent. Изменение Freeze/Spec только по явному решению команды с записью в `docs/07_DECISIONS.md`.
