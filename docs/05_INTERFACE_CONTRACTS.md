# Interface Contracts

**Проект:** MAX Hackathon 2026 — трек «Умный город»  
**Статус документа:** Final Candidate Normative Interface Contract after TCR-MAJ-001 / TCR-MIN-001 Closure Fix  
**Нормативная база:** `docs/01_PRODUCT_FREEZE.md` > `docs/02_PRODUCT_SPEC.md`  
**Связанные документы:** `docs_03_ARCHITECTURE_FINAL_CANDIDATE.md`, `docs_04_DATA_MODEL_FINAL_CANDIDATE.md`  
**Дата:** 21 сентября 2026

---

## 1. Principles

Этот документ задаёт нормативный HTTP/application contract для coding-агентов после прохождения независимого Technical Architecture Review.

Основные правила:

1. Backend — authoritative source workflow, authorization и current context.
2. Frontend не меняет `Case.state` напрямую.
3. Нет generic `PATCH /case` для product lifecycle.
4. Reads возвращают role-filtered данные; запрещённые поля не отправляются клиенту.
5. Mutations выражены явными business commands.
6. Любая command повторно валидирует actor, state, exact target identity и current pointers внутри DB transaction.
7. `allowed_actions` — server-generated UX capability, но не authorization token.
8. Любая mutating command обязана иметь `Idempotency-Key`.
9. Stale request никогда не retarget'ится автоматически на новый Selection/Assignment/Result.
10. Frontend после command success или `409` делает refetch Case snapshot.
11. MAX external calls не выполняются внутри Case business transaction.
12. Product Spec имеет приоритет над этим contract при любом обнаруженном расхождении.

### 1.1. Base paths

```text
/api/v1/*                     application API
/integrations/max/webhook     MAX Bot webhook
/health/live                  process liveness
/health/ready                 application readiness
/api/v1/system/info            build identity diagnostic
```

### 1.2. Formats

- JSON: `application/json; charset=utf-8`.
- Commands с файлами: `multipart/form-data`, где `payload` — JSON part, `files` — binary parts.
- UUID в JSON передаётся строкой.
- Time — RFC 3339 UTC timestamp.
- Product state — stable technical code из Data Model, UI локализует его отдельно.

### 1.3. Common headers

Authenticated application requests:

```text
Authorization: Bearer <application_session_token>
X-Request-Id: <optional client UUID>
```

Mutating requests дополнительно:

```text
Idempotency-Key: <UUID/random opaque value>
```

Server всегда возвращает собственный/принятый `request_id`.



### 1.4. Build identity diagnostic

```text
GET /api/v1/system/info
```

Public/read-only diagnostic response:

```json
{
  "build_sha": "03bbece0fe40b24e4c2cdbbc5b8800bc14e82920"
}
```

`build_sha` — machine-readable identity deployed artifact. Endpoint не возвращает environment values, Bot Token, webhook secret, DB URL или иные secrets. Submission verification сравнивает его с fixed submission SHA.

---

## 2. Authentication Context

## 2.1. Bootstrap from MAX Mini App

### Endpoint

```text
POST /api/v1/auth/max
```

### Request

```json
{
  "init_data": "<raw signed MAX initData>"
}
```

Frontend передаёт **raw signed initData**. `initDataUnsafe` не является trusted source.

### Server processing

Backend:

1. не логирует raw `init_data`;
2. валидирует текущим официальным HMAC-SHA256 algorithm MAX с server-only Bot Token;
3. проверяет freshness `auth_date`;
4. извлекает validated `user.id` и `chat.id/chat.type`;
5. обновляет/создаёт `MaxIdentity`, включая usable outbound chat target; `LINKED_CONFIRMED` допустим только вместе с non-null validated `delivery_chat_id/type`;
6. в normal mode resolve application mapping, где DB-level constraint допускает максимум один `MaxIdentity` на `AppUser`; в demo mode server-authoritatively resolve current ACTIVE DemoRun этой real MAX identity;
7. re-resolve authoritative active app/binding context;
8. выдаёт short-lived signed application session token.

Нельзя считать `user.id == Bot API user_id`. Обязательная notification path использует validated `chat.id` как documented Bot API `chat_id`. `startapp` не используется для identity correlation.

### Success `200`

```json
{
  "session_token": "<signed opaque/bearer token>",
  "expires_at": "2026-09-21T12:00:00Z",
  "session": {
    "real_max_identity": {
      "max_identity_id": "uuid",
      "display_name": "Эксперт MAX",
      "outbound_max_ready": true
    },
    "demo_mode": true,
    "demo_run_id": "uuid-or-null",
    "primary_case_id": "uuid-or-null",
    "effective_actor": {
      "app_user_id": "uuid-or-null",
      "role": "RESIDENT|UK_EMPLOYEE|UK_ADMIN|CONTRACTOR_EMPLOYEE|null",
      "display_name": "..."
    }
  }
}
```

`outbound_max_ready=true` означает наличие validated usable `chat_id/type` для обязательного outbound notification. Это не утверждение о фактической доставке конкретного будущего сообщения.

### Errors

- `400 INVALID_INIT_DATA_FORMAT`;
- `401 MAX_INIT_DATA_INVALID_SIGNATURE`;
- `401 MAX_INIT_DATA_EXPIRED`;
- `403 APP_USER_NOT_MAPPED` — normal mode;
- `500 AUTH_BOOTSTRAP_FAILED`.

## 2.2. Application session

Token содержит идентификаторы context, но **не является authorization snapshot до expiry**:

- session ID;
- real `max_identity_id`;
- effective `app_user_id`;
- selected role-binding identity/context;
- `demo_mode`;
- current `demo_run_id`, если demo;
- issued/expiry timestamps;
- token/schema version.

Frontend хранит token только runtime-memory.

Для **каждого protected read** backend повторно re-resolve из DB:

- `AppUser.active`;
- selected `UserRoleBinding.active`;
- organization/contractor binding;
- `ResidentPremisesAccess.active`;
- `UKHouseAccess.active`;
- current DemoRun/DemoRunActor, если demo.

Каждая mutation делает ту же revalidation **внутри transaction**. Revocation/disable применяется на следующий request и не ждёт token expiry.

Если AppUser имеет несколько bindings, session однозначно указывает выбранный binding; backend не union'ит права разных bindings.

## 2.3. Fresh bootstrap / cross-client demo continuity

В `DEMO_MODE=true` fresh bootstrap в mobile/web MAX:

- не создаёт новый DemoRun автоматически;
- server находит единственный ACTIVE current run этой real MAX identity;
- возвращает тот же `demo_run_id` и его `primary_case_id`;
- effective actor может потребовать явного выбора role view, но run/Case context сохраняется.

## 2.4. Session read

```text
GET /api/v1/session
```

Возвращает current real/effective context без secrets после authoritative revalidation.

---

---

## 3. Effective Actor Context

### 3.1. Normal mode

При `DEMO_MODE=false` effective actor определяется server-side mapping validated MAX identity → AppUser/selected active RoleBinding. Demo switch запрещён. Client-supplied role/org/contractor никогда не является authority.

### 3.2. Demo mode

```text
real MAX identity != effective synthetic actor
```

Frontend показывает **ровно четыре Product role views**: `RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`.

Contractor A/B — два synthetic actors **одной** role view. Frontend не выбирает `actor_alias` и не решает business state, чтобы определить contractor.

### 3.3. Actor switch

```text
POST /api/v1/demo/session/actor
```

Request:

```json
{
  "role_view": "CONTRACTOR_EMPLOYEE"
}
```

Backend:

1. проверяет `DEMO_MODE=true`;
2. revalidates real MAX identity + current ACTIVE DemoRun;
3. revalidates `DemoRunActor` allowlist;
4. для Resident/UK views выбирает соответствующего предсозданного actor;
5. для Contractor view server resolve конкретного actor по current DemoRun `primary_case_id`:
   - current pending Assignment contractor, если он существует;
   - иначе current executor contractor, если он существует;
   - иначе deterministic seeded default contractor actor только для предписанного pre-assignment demo entry, без предоставления Case access;
6. загружает active RoleBinding выбранного actor;
7. выдаёт новый signed token.

Success `200` возвращает новый token/context. Request не принимает trusted `role`, `actor_alias`, `contractor_id`.

Outside demo:

```text
403 DEMO_MODE_DISABLED
```

---

---

## 4. Error Contract

Все application errors имеют одну envelope shape:

```json
{
  "error": {
    "code": "STALE_ASSIGNMENT",
    "message": "Действие больше не относится к актуальному назначению.",
    "request_id": "uuid",
    "case_id": "uuid",
    "current_revision": 18,
    "details": {
      "target_assignment_id": "uuid"
    }
  }
}
```

`details` не должен утекать данными, которые actor не вправе видеть.

### 4.1. Stable semantic codes

Минимальный словарь:

```text
MALFORMED_REQUEST
UNAUTHENTICATED
SESSION_EXPIRED
FORBIDDEN
RESOURCE_NOT_FOUND
INVALID_STATE
TERMINAL_CASE
STALE_SELECTION
STALE_ASSIGNMENT
STALE_ITERATION
STALE_RESULT
NOT_CURRENT_EXECUTOR
FEEDBACK_ALREADY_SUBMITTED
NO_FEEDBACK_ALREADY_RECORDED
COMPLETION_BASIS_INVALID
RESULT_MATERIAL_REQUIRED
RESULT_MATERIAL_INVALID
REJECT_REASON_REQUIRED
EXPLANATION_REQUIRED
CATEGORY_INACTIVE
CONTRACTOR_NOT_AVAILABLE
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_KEY_REUSE
VALIDATION_FAILED
MAX_NOTIFICATION_CONFIGURATION_ERROR
MAX_DELIVERY_TARGET_NOT_READY
DEMO_RUN_MISMATCH
DEMO_PRIMARY_CASE_EXISTS
CLARIFICATION_CONTEXT_REQUIRED
INTERNAL_ERROR
```

### 4.2. Stale semantics

`409` означает: request мог быть валидным относительно старого snapshot, но current domain context уже другой либо competing command уже зафиксировал ветку.

Frontend reaction:

1. не показывать success;
2. refetch Case;
3. заменить activity/allowed_actions;
4. сообщить: «Случай изменился с момента открытия. Данные обновлены.»;
5. **не** повторять command автоматически на новый target.

---

## 5. Idempotency Contract

### 5.1. Scope

`Idempotency-Key` обязателен для:

- всех Case mutating commands;
- CreateCase;
- configuration writes;
- Start DemoRun / actor switch;
- result-material upload;
- download-capability creation.

Auth bootstrap не требует key.

### 5.2. Discriminated principal

```text
APP_USER     — Case business/config commands
MAX_IDENTITY — demo technical command до effective actor
```

Real MAX identity нельзя подменять fake/system AppUser.

### 5.3. Serialization before lifecycle validation

Нормативный механизм — durable `CommandExecution` reservation из Data Model:

1. authenticate and derive principal;
2. compute canonical request fingerprint;
3. begin transaction and attempt `IN_PROGRESS` reservation for `(principal,key)`;
4. one request becomes owner; concurrent duplicate waits on unique conflict/transaction;
5. after owner commit duplicate rereads stored execution;
6. same fingerprint + succeeded → canonical stored HTTP status/body;
7. different fingerprint → `409 IDEMPOTENCY_KEY_REUSE`;
8. only owner proceeds to Case/config lifecycle validation.

Этот механизм работает и для `CreateCase`, где Case row ещё нет.

### 5.4. Fingerprint

JSON fingerprint includes method/path/command type + normalized payload.

Multipart fingerprint includes the same normalized payload **and SHA-256 bytes of every logical file** in stable logical order. Multipart boundary/header ordering не меняют fingerprint.

### 5.5. Replay

Same principal + same key + same fingerprint returns canonical stored success; optional header:

```text
Idempotency-Replayed: true
```

Different keys remain different business intents and still serialize on Case/config locks.

---

---

## 6. Case List Read Contract

### Endpoint

```text
GET /api/v1/cases
```

Optional `state`, `limit`, `cursor`.

Before query projection backend performs per-request authorization revalidation §2.2.

### Normal-mode filters

- Resident: Cases where actor is `resident_user_id` and current premises access permits read.
- UK: own Organization + allowed Houses.
- Contractor: only exact current pending Assignment limited context or current executor context.
- Historical old contractor does not regain LIVE row visibility from old Assignment.

### DEMO_MODE additional boundary

Every current demo list requires:

```text
Case.demo_run_id == session.demo_run_id
```

and current DemoRun belongs to real MAX identity. Cases from archived/other runs are not mixed into current run even though synthetic AppUsers are reused.

### Success `200`

```json
{
  "items": [{
    "case_id": "uuid",
    "display_number": "C-000123",
    "state": "EXECUTION",
    "category": "Отопление / стояк",
    "location_label": "Дом ..., кв. ...",
    "current_iteration_no": 1,
    "updated_at": "...",
    "responsibility": "CONTRACTOR"
  }],
  "next_cursor": null
}
```

`updated_at` comes **only** from physical authoritative `Case.updated_at`, updated by successful Case mutations. Fields are role-filtered server-side.

---

---

## 7. Case Snapshot Contract

### Endpoint

```text
GET /api/v1/cases/{caseId}
```

Backend first revalidates session rights; in DEMO_MODE also requires same current `demo_run_id`.

### Success shape

```json
{
  "case": {
    "case_id": "uuid",
    "display_number": "C-000123",
    "state": "AWAITING_RESULT_CHECK",
    "revision": 14,
    "created_at": "...",
    "updated_at": "...",
    "description": "...",
    "location": {"house": "...", "premises": "..."},
    "category": {"name": "Отопление / стояк", "result_requirement": "PHOTO"},
    "current_iteration": {"iteration_id": "uuid", "number": 2},
    "responsibility": {"semantic_code": "RESIDENT_CHECK_RESULT", "text": "Житель проверяет результат"},
    "initial_attachments": [{
      "attachment_id": "uuid",
      "file_name": "photo.jpg",
      "mime_type": "image/jpeg",
      "byte_size": 12345
    }],
    "selection": null,
    "assignment": {
      "assignment_id": "uuid",
      "contractor": {"contractor_id": "uuid", "name": "Подрядчик A"},
      "decision": "ACCEPTED"
    },
    "current_executor": {"contractor_id": "uuid", "name": "Подрядчик A"},
    "current_result": {
      "result_id": "uuid",
      "iteration_id": "uuid",
      "description": "Работы выполнены",
      "submitted_at": "...",
      "attachments": []
    },
    "resident_feedback": null,
    "activity": [],
    "allowed_actions": []
  }
}
```

### Initial attachments — canonical representation

`initial_attachments[]` — normative canonical read representation всех initial Case files.

Visible only to:

- Resident own Case;
- UK in organization/house scope;
- contractor of **current pending Assignment**;
- current executor.

Selected-only contractor и historical old contractor не получают эти files. Download выполняется только через §26 capability/authorization.

### Isolation/error ordering

Для guessed/foreign Case backend не выдаёт terminal/state/stale details. Resource/tenant/run visibility проверяется до such errors; hidden resource → `404`.

### Freshness

`revision` and `updated_at` are diagnostic/freshness metadata. Client cannot make stale data authoritative.

---

---

## 8. allowed_actions Contract

Backend возвращает массив semantically explicit capabilities.

### Shape

```json
{
  "code": "ACCEPT_ASSIGNMENT",
  "target": {
    "assignment_id": "uuid"
  },
  "input": {
    "reject_reason_required": false
  }
}
```

### Canonical codes

```text
CREATE_CASE                         # вне Case snapshot — session capability
ACCEPT_CASE
SELECT_CONTRACTOR
SEND_ASSIGNMENT
ACCEPT_ASSIGNMENT
REJECT_ASSIGNMENT
ADD_RESULT_MATERIAL
SUBMIT_RESULT
RESIDENT_CONFIRM
RESIDENT_REMARK
RECORD_NO_RESIDENT_FEEDBACK
REQUEST_CLARIFICATION
RETURN_TO_REWORK
COMPLETE_CASE
COMPLETE_WITH_EXPLANATION
ADD_COMMENT
```

### Rules

- Target-specific action содержит current identity: `selection_id`, `assignment_id`, `result_id`, `feedback_id`, `iteration_id` по необходимости.
- `allowed_actions` никогда не означает, что backend обязан принять будущий request: context мог измениться.
- Frontend не вычисляет additional permissions самостоятельно.
- Отсутствие action в массиве — UX signal; security всё равно server-side.

---

## 9. Activity / History Contract

### Canonical projection

`activity` содержит **ровно один activity item на один semantic business fact**, anchored `CaseEvent.event_id`.

Comment/Result/Feedback/Attachment domain entities **enrich** соответствующий event item; они не создают вторую sibling activity item для того же fact.

Chronological order is authoritative `CaseEvent.event_seq`, not client timestamp sorting.

### Item shape

```json
{
  "activity_id": "event-id",
  "event_id": "event-id",
  "event_seq": 31,
  "semantic_code": "EVT_013",
  "occurred_at": "...",
  "iteration_no": 2,
  "actor": {"role": "UK_EMPLOYEE", "display_name": "Сотрудник УК"},
  "text": "Возвращено на доработку",
  "state_transition": {"from": "REMARKS_REVIEW", "to": "REWORK"},
  "domain": {
    "result": null,
    "feedback": null,
    "comment": null
  },
  "attachments": []
}
```

For example, `EVT-007` item is enriched by its Comment; `EVT-008` by Result; `EVT-010/011` by Feedback. The same business fact must not appear as `EVENT + COMMENT/RESULT/FEEDBACK`.

### Visibility

Projection service:

- preserves `event_seq`;
- preserves old iterations/history;
- omits role-forbidden data;
- does not create hidden Resident↔Contractor channel;
- applies current DEMO_MODE run boundary.

Optional `GET /api/v1/cases/{caseId}/activity` may paginate the same projection, never a different semantics.

---

---

## 10. Create Case Command

### Endpoint

```text
POST /api/v1/cases
```

`multipart/form-data`:

```text
payload = {
  "premises_id": "uuid",
  "category_id": "uuid",
  "description": "Не работает отопление"
}
files[] = optional initial attachments
```

### Actor

`RESIDENT` with active authoritative binding/access.

### Preconditions / configuration serialization

Inside transaction, after idempotency reservation backend locks/revalidates in canonical order:

1. Organization;
2. House;
3. Premises;
4. Category;
5. default Contractor / OrganizationContractor, if snapshot requires it;
6. ResidentPremisesAccess / relevant access rows in stable primary-key order.

All snapshot fields are read from this one coherent locked configuration set. Concurrent config writer uses compatible locks, so a Case cannot be assembled from mixed versions and cannot commit after a conflicting deactivation slipped between separate reads.

### Normal-mode MAX delivery readiness — early fail-closed gate

Если `DEMO_MODE=false`, **до создания `Case`, `CaseIteration`, initial Attachment/link rows и EVT-001** backend обязан resolve `MaxIdentity` по effective Resident `app_user_id` и проверить:

- mapped `MaxIdentity` существует ровно один в смысле application relation (DB constraint гарантирует at most one; отсутствие row = not ready);
- `link_status = LINKED_CONFIRMED`;
- `delivery_chat_id IS NOT NULL`;
- `delivery_chat_type IS NOT NULL`.

Если invariant не выполнен, CreateCase fail-closed:

```text
409 MAX_DELIVERY_TARGET_NOT_READY
```

Нельзя выбирать `first`, `latest`, любой произвольный `LINKED_CONFIRMED` row или создавать Case с расчётом проверить recipient только позже. В `DEMO_MODE=true` этот normal mapping gate не применяется к synthetic Resident: notification recipient остаётся explicit `DemoRun.notification_recipient_max_identity_id` и его readiness проверяется по demo contract.

### Circular FK bootstrap

Backend pre-generates `case_id + iteration_id`, inserts Case with non-null `current_iteration_id`, inserts CaseIteration #1, and relies on the normative composite `DEFERRABLE INITIALLY DEFERRED` current-iteration FK. Both records must exist by commit.

### DEMO_MODE binding

If demo:

- session must have current ACTIVE `demo_run_id` owned by current real MAX identity;
- Case gets immutable `demo_run_id=session.demo_run_id`;
- same transaction locks DemoRun and requires `primary_case_id IS NULL`;
- sets `DemoRun.primary_case_id=case_id`;
- a different key attempting second primary Case gets `409 DEMO_PRIMARY_CASE_EXISTS`;
- old/archived run cannot be mutated.

### Transaction effect

Atomic logical effect set: coherent config snapshots; Case + CaseIteration #1; optional DemoRun primary bind; durable initial Attachment/link rows; authoritative current projection; EVT-001. Нормативный physical transaction order задаётся §33: domain writes → current projection + `Case.updated_at` → EVT-001 → no NotificationIntent for CreateCase → increment `Case.revision` → finalize `CommandExecution` canonical `201` response using post-command revision → COMMIT. Deferred Case↔CaseIteration FK bootstrap остаётся единственным явно оговорённым insert-order exception внутри этой transaction.

### State effect / event

`CREATED`; EVT-001.

### Success `201`

```json
{
  "command_id": "uuid",
  "case_id": "uuid",
  "state": "CREATED",
  "revision": 1,
  "created": {"iteration_id": "uuid"},
  "event_ids": ["uuid"]
}
```

Different idempotency keys create different Cases in normal mode. Current DemoRun intentionally permits only one primary Case.

Foreign/cross-tenant category/premises → hidden `404` where existence-sensitive; inaccessible own-visible input → `403/422` per HTTP semantics.

---

---

## 11. Accept Case Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/accept
```

Request:

```json
{
  "client_revision": 3
}
```

`client_revision` optional diagnostic.

### Actor

`UK_EMPLOYEE` or `UK_ADMIN`.

### Required state

`CREATED`.

### Target identity

`caseId`.

### Preconditions

- own Organization;
- allowed House;
- non-terminal;
- state still `CREATED` after Case lock.

### Transaction effect

Update current state, append EVT-002, CommandExecution, increment revision.

### State effect

`CREATED → ACCEPTED_BY_UK`.

### Events

EVT-002.

### Success

`200` standard command response.

### Stale

`409 INVALID_STATE` if another valid action already moved state.

### Forbidden

`403` for authenticated UK without scope; `404` may be used for foreign tenant Case.

### Idempotency / Authorization

Required / fully server-side.

---

## 12. Select Contractor Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/select-contractor
```

### Request

```json
{
  "contractor_id": "uuid",
  "iteration_id": "uuid"
}
```

### Actor

`UK_EMPLOYEE` or `UK_ADMIN`.

### Required state

Either:

- `ACCEPTED_BY_UK`; or
- `REWORK` for selecting a **different** contractor.

### Target identity

Current `iteration_id` + requested contractor.

### Preconditions

Common:

- own Organization/House;
- request iteration == current iteration;
- contractor active and available through OrganizationContractor;
- backend locks/revalidates Contractor + OrganizationContractor using the shared configuration lock protocol before creating Selection.

In `REWORK`:

- requested contractor != current executor;
- this is the Product Spec reassignment path.

### Transaction effect

Create immutable ContractorSelection, set `current_selection_id`.

If state=`REWORK` and different contractor selected:

- clear `current_assignment_id`;
- clear `current_executor_contractor_id` immediately;
- old accepted Assignment remains historical unchanged.

Append EVT-003, CommandExecution, revision++.

### State effect

State unchanged:

- `ACCEPTED_BY_UK → ACCEPTED_BY_UK`; or
- `REWORK → REWORK`.

### Events

EVT-003.

### Success

```json
{
  "command_id": "uuid",
  "case_id": "uuid",
  "state": "REWORK",
  "revision": 22,
  "created": {"selection_id": "uuid"},
  "event_ids": ["uuid"]
}
```

### Stale

- `409 STALE_ITERATION`;
- `409 INVALID_STATE`;
- competing selection first valid wins for resulting current pointer; second request may itself be a valid later selection only if Product Spec still permits it in current state. Backend never silently sends old selection.

### Forbidden

Non-UK or wrong organization/house → 403/404.

### Idempotency

Required.

### Authorization

Role + org + house + current state + current iteration + contractor availability.

---

## 13. Send Assignment Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/send-assignment
```

### Request

```json
{
  "selection_id": "uuid",
  "iteration_id": "uuid"
}
```

### Actor

`UK_EMPLOYEE` or `UK_ADMIN`.

### Required state

- `ACCEPTED_BY_UK`; or
- `REWORK` after selecting different contractor.

### Target identity

Exact `selection_id` + current `iteration_id`.

### Preconditions

- `selection_id == Case.current_selection_id`;
- Selection belongs same Case/current iteration;
- contractor remains active/available after locking/revalidating Contractor + OrganizationContractor;
- state allows send;
- no other current pending Assignment resulting from another selection.

### Transaction effect

Create immutable Assignment (`PENDING`), set `current_assignment_id`, ensure executor NULL for new path, append EVT-004, store command.

### State effect

`ACCEPTED_BY_UK|REWORK → SENT_TO_CONTRACTOR`.

### Events

EVT-004.

### Success

Returns created `assignment_id`.

### Stale

`409 STALE_SELECTION` if request targets old selection.

### Forbidden

403/404 for wrong role/scope.

### Idempotency

Required; prevents double Assignment on transport retry.

### Authorization

Role + organization/house + current selection + iteration.

---

## 14. Accept Assignment Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/accept-assignment
```

### Request

```json
{
  "assignment_id": "uuid"
}
```

### Actor

`CONTRACTOR_EMPLOYEE`.

### Required state

`SENT_TO_CONTRACTOR`.

### Target identity

Exact `assignment_id`.

### Preconditions

- `assignment_id == Case.current_assignment_id`;
- Assignment status `PENDING`;
- Assignment contractor == actor contractor membership;
- state rechecked after lock.

### Transaction effect

Assignment decision → ACCEPTED, set acceptance actor/time, set `Case.current_executor_contractor_id`, append EVT-005, store command.

### State effect

`SENT_TO_CONTRACTOR → EXECUTION`.

### Events

EVT-005.

### Success

200.

### Stale

- `409 STALE_ASSIGNMENT` for old Assignment;
- `409 INVALID_STATE` if reject/other branch already committed.

### Forbidden

- actor from other contractor → 404/403;
- selected-but-not-sent contractor has no access.

### Idempotency

Required.

### Authorization

Exact assignment membership; not merely contractor name/id supplied by client.

---

## 15. Reject Assignment Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/reject-assignment
```

### Request

```json
{
  "assignment_id": "uuid",
  "reason": "Нет возможности выполнить работы в срок"
}
```

### Actor

`CONTRACTOR_EMPLOYEE` of current pending Assignment.

### Required state

`SENT_TO_CONTRACTOR`.

### Target identity

Exact assignment.

### Preconditions

Same as Accept + nonempty reason.

### Transaction effect

- Assignment → REJECTED with immutable reason;
- Case.current_assignment=NULL;
- Case.current_executor=NULL;
- Case.current_selection=NULL;
- append EVT-006;
- command + revision.

### State effect

`SENT_TO_CONTRACTOR → ACCEPTED_BY_UK`.

Iteration unchanged; Case unchanged.

### Events

EVT-006.

### Success

200.

### Stale

`409 STALE_ASSIGNMENT` / `409 INVALID_STATE`.

### Forbidden

Wrong contractor → 404/403.

### Idempotency

Required.

### Authorization

Exact current pending Assignment membership.

---

## 15A. Add Result Material Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/result-materials
```

`multipart/form-data`:

```text
payload = {
  "assignment_id": "uuid",
  "iteration_id": "uuid"
}
file = <one binary file>
```

### Actor

`CONTRACTOR_EMPLOYEE` who is current executor.

### Required state

`EXECUTION` or `REWORK`.

### Target identity

Exact current assignment + iteration.

### Preconditions

- actor contractor == Case.current_executor;
- assignment == Case.current_assignment;
- current Assignment accepted;
- iteration == Case.current_iteration;
- file type/size valid.

### Transaction effect

Create Attachment + WorkMaterialAttachment + EVT-009 + CommandExecution.

### State effect

None.

### Events

EVT-009.

### Success

```json
{
  "command_id": "uuid",
  "case_id": "uuid",
  "state": "EXECUTION",
  "revision": 9,
  "created": {"attachment_id": "uuid"},
  "event_ids": ["uuid"]
}
```

### Stale

`409 STALE_ASSIGNMENT` / `STALE_ITERATION` / `NOT_CURRENT_EXECUTOR`.

### Forbidden

Wrong contractor or historical contractor → 404/403.

### Idempotency

Required; same upload retry does not create second attachment/event.

### Authorization

Current executor only.

---

## 16. Submit Result Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/submit-result
```

### Request

```json
{
  "assignment_id": "uuid",
  "iteration_id": "uuid",
  "description": "Стояк отремонтирован, протечка устранена.",
  "material_attachment_ids": ["uuid"]
}
```

### Actor

Current executor `CONTRACTOR_EMPLOYEE`.

### Required state

`EXECUTION` or `REWORK`.

### Target identity

- current `assignment_id`;
- current `iteration_id`;
- exact material IDs.

### Preconditions

- actor contractor == current executor;
- Assignment == current Assignment and is ACCEPTED;
- iteration == current iteration;
- description nonempty;
- every material already belongs to same Case/current iteration/current Assignment and actor;
- `result_requirement_snapshot` satisfied:
  - NONE → material optional;
  - PHOTO → at least one accepted image MIME;
  - FILE → at least one allowed file;
- no Result already exists for current iteration;
- mandatory outbound MAX target проходит **defensive current recheck** непосредственно перед writes:
  - normal mode — exact recipient есть единственный outbound-ready `MaxIdentity`, mapped к `Case.resident_user_id`;
  - DEMO_MODE — exact recipient есть explicit `DemoRun.notification_recipient_max_identity_id`;
  - в обоих случаях validated `delivery_chat_id/type` non-null;
- иначе `409 MAX_DELIVERY_TARGET_NOT_READY` **до** Result/EVT-008/NotificationIntent commit. Early CreateCase readiness gate не отменяет этот defensive recheck.

### Transaction effect

Atomic logical effect set: immutable Result + ResultAttachment links; `Case.current_result_id`; state `AWAITING_RESULT_CHECK`; EVT-008; exactly one `NotificationIntent(result_id, RESULT_READY)` whose `recipient_max_identity_id` is the exact normal/demo recipient and whose `delivery_chat_id/type` are a snapshot of that identity's validated delivery target. Нормативный physical transaction order — §33: domain writes → current projection + `Case.updated_at` → EVT-008 → NotificationIntent → increment `Case.revision` → finalize `CommandExecution` canonical response using post-command revision → COMMIT.

**MAX network call not performed in this transaction.**

### State effect

`EXECUTION|REWORK → AWAITING_RESULT_CHECK`.

### Events

EVT-008. Existing EVT-009 material events are not duplicated.

### Success

`200`:

```json
{
  "command_id": "uuid",
  "case_id": "uuid",
  "state": "AWAITING_RESULT_CHECK",
  "revision": 10,
  "created": {
    "result_id": "uuid",
    "notification_intent_id": "uuid"
  },
  "event_ids": ["uuid"],
  "notification": {
    "status": "QUEUED"
  }
}
```

`QUEUED` означает, что обязательная реальная MAX доставка поставлена в durable outbox; это не fake success о фактической доставке.

### Stale

- `409 STALE_ASSIGNMENT`;
- `409 STALE_ITERATION`;
- `409 INVALID_STATE`;
- competing duplicate result → 409 after first commit.

### Forbidden

Non-current contractor → 404/403.

### Idempotency

Required. Retry notification не выполняет SubmitResult повторно.

### Authorization

Current executor + accepted Assignment + state + iteration + material ownership.

---

## 17. Resident Confirmation Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/resident-confirmation
```

### Request

```json
{
  "result_id": "uuid",
  "iteration_id": "uuid"
}
```

### Actor

Case Resident.

### Required state

`AWAITING_RESULT_CHECK`.

### Target identity

Current `result_id` + current iteration.

### Preconditions

- actor is Case resident;
- result == Case.current_result;
- result iteration == current iteration;
- no ResidentFeedback exists for Result.

### Transaction effect

Create ResidentFeedback type CONFIRMATION, append EVT-010, command, revision++.

### State effect

**No state change.** Remains `AWAITING_RESULT_CHECK`.

### Events

EVT-010.

### Success

200, state remains awaiting.

### Stale

`409 STALE_RESULT`, `STALE_ITERATION`, `FEEDBACK_ALREADY_SUBMITTED`, `INVALID_STATE`.

### Forbidden

Other Resident → 404/403.

### Idempotency

Required.

### Authorization

Exact Case resident + current result context.

---

## 18. Resident Remark Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/resident-remark
```

`multipart/form-data`:

```text
payload = {
  "result_id": "uuid",
  "iteration_id": "uuid",
  "remark_text": "Течёт в соединении после ремонта"
}
files[] = optional supporting attachments
```

### Actor

Case Resident.

### Required state

`AWAITING_RESULT_CHECK`.

### Target identity

Current Result + current iteration.

### Preconditions

- exact resident;
- result current;
- iteration current;
- no existing feedback;
- nonempty remark;
- attachment validation.

### Transaction effect

Create Feedback REMARK + attachments/links + EVT-011 + command + revision.

### State effect

`AWAITING_RESULT_CHECK → REMARKS_REVIEW`.

### Events

EVT-011.

### Success

200.

### Stale

Same family as confirmation; competing confirmation/remark → exactly one wins, loser gets 409.

### Forbidden

Other actor → 403/404.

### Idempotency

Required.

### Authorization

Exact Case resident/current Result.

---

## 19. Request Clarification Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/request-clarification
```

Request:

```json
{
  "result_id": "uuid",
  "feedback_id": "uuid",
  "message": "Уточните, где именно остаётся протечка."
}
```

Optional attachments may use multipart variant with the same payload.

### Actor

`UK_EMPLOYEE` / `UK_ADMIN`.

### Required state

`REMARKS_REVIEW`.

### Target identity

Exact `result_id + feedback_id`. Iteration is **not client-selected**; backend derives it from immutable Result/Feedback and under Case lock requires it equals `Case.current_iteration_id`.

### Preconditions

- own org/house;
- current result matches request;
- feedback belongs current result, type REMARK, same Case/iteration;
- message nonempty.

### Transaction effect

Create Comment kind `CLARIFICATION_REQUEST` with exact `context_result_id/context_feedback_id/current iteration`, optional attachments, append **EVT-012**, command, revision.

Не создаётся дополнительный EVT-007 для того же clarification command; EVT-012 является нормативным business event этой операции.

### State effect

No change: `REMARKS_REVIEW`.

### Events

EVT-012.

### Success

200.

### Stale

`409 STALE_RESULT`, `INVALID_STATE`.

### Forbidden

Non-UK / wrong scope → 403/404.

### Idempotency

Required.

### Authorization

UK scope + current remark context.

---

## 19A. Record No Resident Feedback Command

Product Spec содержит отдельный business fact EVT-015; поэтому contract обязан иметь явную команду, хотя она не была перечислена в кратком примерном URL-наборе.

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/record-no-resident-feedback
```

### Request

```json
{
  "result_id": "uuid",
  "iteration_id": "uuid",
  "basis_confirmed": true,
  "basis_note": "Связь с жителем выполнена по установленному процессу, формальной реакции нет."
}
```

### Actor

`UK_EMPLOYEE` / `UK_ADMIN`.

### Required state

`AWAITING_RESULT_CHECK`.

### Target identity

Current Result + iteration.

### Preconditions

- exact current Result/current iteration;
- ResidentFeedback отсутствует;
- EVT-015 для Result ещё не существует;
- `basis_confirmed=true`;
- process basis является явным manual assertion УК; backend **не** выводит молчание из таймера автоматически.

### Transaction effect

Append unique EVT-015, CommandExecution, revision++.

### State effect

No change: `AWAITING_RESULT_CHECK`.

### Events

EVT-015.

### Success

200 returns `no_feedback_event_id`.

### Stale

- feedback уже появился → `409 FEEDBACK_ALREADY_SUBMITTED`;
- result стал old → `409 STALE_RESULT`;
- EVT-015 already exists → idempotent replay if same key, otherwise `409 NO_FEEDBACK_ALREADY_RECORDED`.

### Forbidden

Only UK in scope.

### Idempotency

Required.

### Authorization

UK role + org/house + current Result.

---

## 20. Return To Rework Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/return-to-rework
```

### Request

```json
{
  "result_id": "uuid",
  "feedback_id": "uuid"
}
```

### Actor

`UK_EMPLOYEE` / `UK_ADMIN`.

### Required state

`REMARKS_REVIEW`.

### Target identity

Exact `result_id + feedback_id`. Iteration is derived from immutable Result/Feedback and under Case lock must equal `Case.current_iteration_id`.

### Preconditions

- own org/house;
- feedback belongs current Result and type REMARK, same Case/current iteration;
- current accepted Assignment/executor exists.

### Transaction effect

In **one transaction**:

1. append EVT-013;
2. create CaseIteration `N+1`;
3. set `Case.current_iteration_id=N+1`;
4. set `Case.current_result_id=NULL`;
5. preserve current accepted Assignment/current executor;
6. state=`REWORK`;
7. append derived EVT-014 linked to EVT-013;
8. store command;
9. revision++.

### State effect

`REMARKS_REVIEW → REWORK`.

### Events

EVT-013 + EVT-014.

### Success

```json
{
  "command_id": "uuid",
  "case_id": "uuid",
  "state": "REWORK",
  "revision": 31,
  "created": {"iteration_id": "new-uuid", "iteration_no": 2},
  "event_ids": ["evt13-uuid", "evt14-uuid"]
}
```

### Stale

Concurrent disputed completion wins first → loser `409 INVALID_STATE`; stale result/feedback → 409.

### Forbidden

Only UK scope.

### Idempotency

Required; retry cannot create N+2.

### Authorization

UK + current remark context.

---

## 21. Complete Case Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/complete
```

### Actor / state

`UK_EMPLOYEE` / `UK_ADMIN`; required state `AWAITING_RESULT_CHECK`.

### Request — confirmation basis

```json
{
  "result_id": "uuid",
  "basis": {
    "type": "RESIDENT_CONFIRMATION",
    "feedback_id": "uuid"
  }
}
```

### Request — no-feedback basis

```json
{
  "result_id": "uuid",
  "basis": {
    "type": "NO_RESIDENT_FEEDBACK",
    "event_id": "evt-015-uuid",
    "completion_basis": {
      "confirmed": true,
      "process_reference": "manual-uk-process-reference"
    }
  }
}
```

`completion_basis` is a **separate explicit UK assertion** that the basis for manual completion under the process of this UK has arisen. It is distinct from the basis previously used to record EVT-015. `process_reference` is nonempty audit text/code; it is not a universal timer.

### Preconditions

Common:

- current Result/current iteration;
- own org/house;
- not terminal.

Confirmation:

- Feedback belongs current Result and type CONFIRMATION.

No-feedback:

- no ResidentFeedback exists at commit;
- referenced Event is EVT-015 for exact current Result;
- EVT-015 existence alone is **insufficient**;
- `completion_basis.confirmed=true`;
- `completion_basis.process_reference` nonempty;
- backend does not infer this basis from elapsed time and does not auto-close.

### Transaction effect

Set closure projection, `COMPLETED`, append EVT-016. For no-feedback branch EVT-016 audit/presentation data stores explicit `completion_basis`, distinguishable from EVT-015 recording basis.

### State / event

`AWAITING_RESULT_CHECK → COMPLETED`; EVT-016.

### Stale/conflict

- stale Result → `409 STALE_RESULT`;
- feedback appears / basis branch changes → `409 COMPLETION_BASIS_INVALID`;
- competing remark/rework changes state → 409.

Only UK can complete. Idempotency required.

---

---

## 22. Complete With Explanation Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/commands/complete-with-explanation
```

### Request

```json
{
  "result_id": "uuid",
  "feedback_id": "uuid",
  "explanation": "Проверка УК показала ..., работы признаны выполненными потому что ..."
}
```

### Actor

`UK_EMPLOYEE` / `UK_ADMIN`.

### Required state

`REMARKS_REVIEW`.

### Target identity

Exact `result_id + feedback_id`. Iteration derives from immutable Result/Feedback and must equal `Case.current_iteration_id` under lock.

### Preconditions

- feedback current and REMARK, same Case/current iteration;
- explanation nonempty and meets validation;
- own org/house.

### Transaction effect

Set closure fields with `DISPUTED_WITH_EXPLANATION`, state COMPLETED, append **EVT-017 only** as terminal event, command, revision.

### State effect

`REMARKS_REVIEW → COMPLETED`.

### Events

EVT-017. Не создаёт дополнительный EVT-016 для того же terminal decision.

### Success

200.

### Stale

Concurrent ReturnToRework first wins → 409; stale Result/Feedback → 409.

### Forbidden

Only UK.

### Idempotency

Required.

### Authorization

UK + current disputed feedback context.

---

## 23. Add Comment Command

### Endpoint

```text
POST /api/v1/cases/{caseId}/comments
```

`multipart/form-data`:

```text
payload = {
  "body": "Буду дома после 18:00",
  "clarification_request_id": "uuid-or-null"
}
files[] = optional
```

### Actor / states

Resident:

- own Case in `EXECUTION` or `REWORK` — normal permitted working context;
- in `REMARKS_REVIEW` **only** as reply to an existing current clarification request.

Contractor:

- current executor only in `EXECUTION|REWORK`.

UK:

- own org/house in Product-Spec-permitted non-terminal context.

### Machine-checkable Resident clarification context

For Resident in `REMARKS_REVIEW`:

1. `clarification_request_id` MUST be provided;
2. target Comment must be `CLARIFICATION_REQUEST`;
3. same Case;
4. target `context_result_id == Case.current_result_id`;
5. target `context_feedback_id` is current REMARK Feedback;
6. target iteration == `Case.current_iteration_id`;
7. target Comment is visible to Resident.

If any fails → `409 CLARIFICATION_CONTEXT_REQUIRED` or hidden `404` as appropriate.

Successful Resident reply is stored as `CLARIFICATION_REPLY` with direct `in_reply_to_comment_id` and inherited Result/Feedback context, plus EVT-007. Arbitrary Resident comment in `REMARKS_REVIEW` is forbidden.

### Other preconditions

Case non-terminal; body or permitted attachment nonempty; current actor permissions revalidated; attachment same-case.

### State/event

No state change; EVT-007. Idempotency required.

---

---

## 24. Configuration Contracts

Configuration is `UK_ADMIN`-only, own-Organization surface. It is not Case state API and does not implement HR lifecycle.

### 24.1. Common mutation rules

Every config write:

- requires active `UK_ADMIN` binding for own Organization;
- hides foreign tenant target as `404`;
- requires `Idempotency-Key` with APP_USER principal;
- locks affected configuration rows with the shared deterministic lock order;
- revalidates organization/contractor/house scope inside transaction;
- writes mandatory `ConfigurationChange` in same transaction;
- never rewrites existing Case snapshots/history;
- never sends invitations, password recovery, offboarding or creates a fifth product role.

### 24.2. Reads

```text
GET /api/v1/config/organization
GET /api/v1/config/houses
GET /api/v1/config/categories
GET /api/v1/config/contractors
GET /api/v1/config/users
```

### 24.3. Basic Organization update

```text
PATCH /api/v1/config/organization
```

```json
{
  "name": "УК Дом"
}
```

Only whitelisted basic display data. `organization_id`, tenant ownership and historical Case scope are immutable via this endpoint.

### 24.4. House create/update

```text
POST  /api/v1/config/houses
PATCH /api/v1/config/houses/{houseId}
```

Create:

```json
{
  "address": "Казань, ...",
  "display_label": "Дом 1",
  "active": true
}
```

Update whitelist: `address`, `display_label`, `active`. House always belongs to current admin Organization; client cannot choose another `organization_id`.

### 24.5. Category create/update + default contractor

```text
POST  /api/v1/config/categories
PATCH /api/v1/config/categories/{categoryId}
```

```json
{
  "name": "Отопление / стояк",
  "description": "...",
  "default_contractor_id": "uuid-or-null",
  "requires_premises_access": true,
  "result_requirement": "PHOTO",
  "active": true
}
```

`default_contractor_id`, if set, must be active Contractor bound to same Organization. Update affects future decisions/snapshots only.

### 24.6. Contractor directory / Organization binding

Add a contractor organization and bind it to current UK:

```text
POST /api/v1/config/contractors
```

```json
{
  "display_name": "Подрядчик Б"
}
```

Transaction creates Contractor directory row + active `OrganizationContractor` for own Organization.

Bind/reactivate an existing directory contractor:

```text
PUT /api/v1/config/contractors/{contractorId}/binding
```

```json
{"active": true}
```

`active=false` deactivates only current Organization binding; it does not delete Contractor or historical Assignment/Result.

### 24.7. Permitted role assignment to pre-created AppUser

```text
PUT /api/v1/config/users/{appUserId}/role-binding
```

```json
{
  "role": "RESIDENT|UK_EMPLOYEE|UK_ADMIN|CONTRACTOR_EMPLOYEE",
  "contractor_id": "uuid-or-null",
  "house_ids": ["uuid"]
}
```

Target AppUser must already exist. Endpoint may create/update/deactivate only Product Freeze role bindings and related own-scope `UKHouseAccess` required by request.

Rules:

- UK roles bind only current Organization;
- Contractor role requires contractor actively bound to current Organization;
- Resident role does not create arbitrary premises access here unless separately preconfigured by scenario; no HR/user creation;
- no invitation/recovery/offboarding.

### 24.8. Contractor employee binding/configuration

```text
PUT /api/v1/config/contractors/{contractorId}/employees/{appUserId}
```

```json
{"active": true}
```

Both contractor and pre-created AppUser must exist; contractor must be bound to current Organization. Effect is create/reactivate/deactivate corresponding `CONTRACTOR_EMPLOYEE` binding. No new AppUser is created.

### 24.9. Configuration concurrency

Config writer and Case command use one lock protocol:

`Organization → House → Premises → Category → Contractor → OrganizationContractor → access/binding rows by PK`.

`CreateCase`, `SelectContractor`, `SendAssignment` revalidate relevant active rows while holding compatible locks. Therefore a Case snapshot cannot mix configuration versions and a concurrently disabled contractor/category cannot be used after the disabling transaction wins.

### 24.10. Errors

- non-admin → 403;
- foreign target → hidden 404;
- invalid same-org mapping / inactive dependency → 422;
- idempotency conflict → 409.

All writes emit `ConfigurationChange`.

---

---

## 25. DEMO_MODE Contract

### 25.1. Start new Demo Run

```text
POST /api/v1/demo/runs
```

Principal: validated real `MAX_IDENTITY`; effective AppUser may be absent.

Request:

```json
{"scenario_key": "primary-housing-demo"}
```

Preconditions:

- server `DEMO_MODE=true`;
- real MAX identity validated;
- usable outbound MAX target (`chat_id/type`) confirmed; otherwise run is not advertised as runnable.

Transaction:

1. idempotency reservation under MAX_IDENTITY principal;
2. lock real MaxIdentity/current DemoRun relation;
3. archive previous ACTIVE run, if any, setting only technical run status/timestamp;
4. create new ACTIVE DemoRun;
5. bind deterministic preseed DemoRunActors;
6. previous Cases/history untouched.

Success `201`:

```json
{
  "demo_run_id": "uuid",
  "status": "ACTIVE",
  "primary_case_id": null,
  "role_views": [
    "RESIDENT",
    "UK_EMPLOYEE",
    "UK_ADMIN",
    "CONTRACTOR_EMPLOYEE"
  ]
}
```

Exactly four Product role views. Contractor A/B are internal actors, not additional role views.

### 25.2. Current-run restore

Fresh MAX bootstrap resolves this single ACTIVE run by real MAX identity and returns its `demo_run_id/primary_case_id`. Reload and web/mobile bootstrap therefore continue the same current run/Case.

### 25.3. Case binding/security boundary

- demo CreateCase binds immutable `Case.demo_run_id=current run`;
- atomically sets `DemoRun.primary_case_id` if null;
- second primary Case is rejected;
- current demo Case list/snapshot/activity/attachment reads require same `demo_run_id`;
- every Case mutation rechecks same run under lock;
- new run cannot mutate archived run Case.

### 25.4. Role switch

Endpoint/body are §3.3. Backend resolves Contractor actor; frontend sends only role view.

### 25.5. Normal repeatability

`Run #1 / Case A` remains immutable; starting `Run #2` archives only run metadata, then Resident performs normal CreateCase for Case B. No product reset/reopen.

### 25.6. Maintenance

No destructive reset/reseed public product endpoint. Team-only maintenance can exist outside application API only in explicit non-production/demo environment.

---

---

## 26. Attachment Contract

### 26.1. Supported contexts

- initial Case files;
- contractor work/result material;
- Resident remark attachment;
- Comment/clarification attachment;
- Result links to validated work-material IDs.

All links pass same-case integrity.

### 26.2. Authenticated metadata/stream endpoint

```text
GET /api/v1/attachments/{attachmentId}
```

Requires Bearer session and full same Case + tenant + current DemoRun + contractor-context authorization. Foreign/old contractor → hidden 404.

### 26.3. Short-lived scoped download capability

Native MAX `window.WebApp.downloadFile(url,file_name)` accepts a direct HTTPS URL and does not provide an application Bearer-header parameter. Therefore authenticated UI first requests:

```text
POST /api/v1/attachments/{attachmentId}/download-capability
Idempotency-Key: ...
```

Success:

```json
{
  "download_url": "https://public-host.example/downloads/<opaque-capability>",
  "file_name": "photo.jpg",
  "expires_at": "2026-09-21T12:01:00Z"
}
```

Before minting capability backend performs the **same authorization check** as direct download. Capability is:

- random/signed opaque;
- attachment-scoped;
- short-lived;
- non-renewable without fresh authorization;
- not a raw DB/storage URL;
- does not encode secrets or broad session rights.

### 26.4. Client behavior

- native MAX Mini App: user click → capability → `window.WebApp.downloadFile(download_url,file_name)`;
- web MAX/browser: capability URL may be fetched/downloaded with normal browser mechanism, or Bearer-authenticated endpoint may stream bytes;
- `href` is not the normative native MAX path.

### 26.5. Upload/download security

Safe Content-Type/Length/Disposition; stored filename cannot become filesystem path; configured size/MIME validation; bytes never logged; DEMO_MODE run scope inherited.

---

---

## 27. Bot / MAX Integration Contracts

Verified against current official MAX documentation on 21 September 2026.

### 27.1. Bot API / outbound transport

- API domain: `https://platform-api2.max.ru`;
- server calls use `Authorization: <Bot Token>`;
- Bot Token is server-only;
- outbound environment trusts the certificate chain required by current MAX endpoint, including current Ministry of Digital certificate requirement documented by MAX;
- `POST /messages` may address documented `chat_id`;
- for Mini App, `chat_id` may be obtained from validated `window.WebApp.initData`.

### 27.2. Incoming Webhook

```text
POST /integrations/max/webhook
```

Production contract:

- public **HTTPS only**;
- port **443**;
- trusted certificate; self-signed unsupported;
- hostname matches certificate CN/SAN;
- server presents full certificate chain;
- subscription is created with a strong `secret`;
- backend verifies exact `X-Max-Bot-Api-Secret` before processing;
- returns HTTP 200 within **30 seconds**;
- long business processing not inline.

MAX retries failed webhook delivery with exponential intervals (up to 10 retries in current docs). If no successful response is obtained within roughly 8 hours, MAX automatically unsubscribes the bot. Therefore operations must reconcile subscriptions using current subscriptions API and recreate missing expected subscription.

### 27.3. Bot → Mini App

Bot uses documented Mini App/open action and HTTPS application URL. `startapp/start_param` may carry **untrusted contextual data only** after ordinary validation.

Official docs state startapp deep link may open Mini App **without launching the bot**. Therefore it is forbidden as identity-link correlation assumption.

### 27.4. Validated delivery binding

Architecture does **not** assume:

```text
Mini App user.id == Bot API user_id
```

Mandatory delivery binding is validated `chat.id/chat.type` from signed initData. Backend persists it on MaxIdentity/DemoRun notification target and verifies readiness before runnable MUST notification flow.

No `startapp` nonce linking fallback is part of required architecture.

---

---

## 28. Notification Contract

### 28.1. Trigger

Valid `SubmitResult` creates exactly one intent `(result_id, RESULT_READY)` in same business transaction as Result + EVT-008.

### 28.2. Recipient / readiness

Normal mode: **the unique outbound-ready `MaxIdentity` mapped to `Case.resident_user_id`**. Its validated `delivery_chat_id/type` are the only allowed outbound target. Selection by `first`, `latest`, arbitrary row or arbitrary `LINKED_CONFIRMED` identity is forbidden.

DEMO_MODE: current DemoRun's explicit `notification_recipient_max_identity_id`; its validated `delivery_chat_id/type` are used. Synthetic Resident mapping is irrelevant to demo notification recipient semantics.

Normal `CreateCase` fail-closed checks readiness before Case/CaseIteration/EVT-001; `SubmitResult` performs a defensive current recheck before Result/EVT-008/NotificationIntent. Required flow does not depend on `user.id == Bot API user_id`.

### 28.3. Durable intent

Intent snapshots exact outbound chat target. Database uniqueness enforces one Result + notification kind.

### 28.4. Durable claim/lease worker

1. short transaction claims due `PENDING|RETRY` or expired claim;
2. sets `CLAIMED`, random claim token, claimed/lease timestamps, attempt count; commit;
3. MAX network call outside transaction;
4. finalize transaction only if claim token still matches;
5. success → DELIVERED;
6. temporary network/429/5xx → RETRY/backoff;
7. current unrecoverable auth/config → PERMANENT_FAILURE;
8. expired lease is recoverable after crash.

External delivery remains at-least-once. No retry/redrive creates another Result or EVT-008.

### 28.5. Permanent-failure redrive

After team fixes Bot Token/config, a **team-only operational reconciliation** reuses the same `NotificationIntent`:

`PERMANENT_FAILURE → RETRY`

with error cleared/redrive counter incremented. This is not an `/api/v1` product command, not a product state and not a second business fact.

### 28.6. Business semantics

Notification failure after commit never rolls back Result. Case remains `AWAITING_RESULT_CHECK`; UI must not ask contractor to resubmit Result to cause delivery.

### 28.7. Observability

UK/admin may see technical diagnostic as role-permitted operations data. Notification status is never a ninth Case state.

---

---

## 29. Stale Action Contract

### 29.1. Authoritative server order

For existing Case mutation:

```text
authenticate
→ canonical idempotency principal/fingerprint
BEGIN
→ acquire/replay CommandExecution reservation
→ lock Case FOR UPDATE
→ re-resolve authoritative active bindings/access
→ check tenant/resource/DemoRun visibility
→ terminal guard
→ exact target IDs/currentness
→ current state/iteration/pointers
→ lock/revalidate dependent mutable config if any
→ business/input rules
→ domain writes
→ current projection + Case.updated_at
→ CaseEvent(s)
→ NotificationIntent if required
→ increment Case.revision
→ finalize CommandExecution canonical response using post-command revision
COMMIT
```

**Visibility/authorization precedes terminal/state/stale errors after Case load/lock.** Foreign tenant/run/resource gets hidden 404; backend does not leak existence by `TERMINAL_CASE` or `STALE_*`.

### 29.2. Typical conflicts

| Scenario | Error |
|---|---|
| send old selection | `409 STALE_SELECTION` |
| accept/reject old assignment | `409 STALE_ASSIGNMENT` |
| feedback old result | `409 STALE_RESULT` |
| old iteration | `409 STALE_ITERATION` |
| already completed visible own Case | `409 TERMINAL_CASE` |
| competing feedback | `409 FEEDBACK_ALREADY_SUBMITTED` |
| invalid no-feedback completion basis | `409 COMPLETION_BASIS_INVALID` |
| Resident REMARKS_REVIEW reply without current clarification | `409 CLARIFICATION_CONTEXT_REQUIRED` |

Frontend on 409 refetches and requires a fresh explicit user action; never retargets automatically.

---

---

## 30. Read Visibility Matrix

The server constructs a different projection from the same Case/history.

| Data / capability | Resident | UK Employee | UK Admin | Contractor Employee |
|---|---|---|---|---|
| Own/allowed Cases list | Own Cases | Own org + house scope | Own org | Only current pending/current executor contexts |
| Case ID/state/iteration | Yes | Yes | Yes | Yes only while current access exists |
| Resident identity/details | Self/minimal | As needed for work | As needed | Minimal required work context only |
| Full internal UK configuration | No | No/minimal | Yes own org | No |
| Selected contractor | User-safe presentation | Yes | Yes | Own selection not sufficient for Case access before sent |
| Pending Assignment identity | No internal details beyond status | Yes | Yes | Yes if exact current Assignment is theirs |
| Exact reject reason | **No** | Yes | Yes | Rejecting contractor sees own submitted reason if still permitted response context |
| Current executor | Yes user-safe | Yes | Yes | Yes if actor belongs current executor |
| Historical old Assignment | User-safe timeline only | Yes | Yes | No future/live access from historical assignment alone |
| Current Result | Yes | Yes | Yes | Current executor sees submitted Result where permitted |
| Old Results | Yes according to Case history | Yes | Yes | Only data server permits in current assignment context; no automatic full history |
| Resident Feedback | Yes own | Yes | Yes | Current executor sees work-relevant remark in rework context; not UK-only deliberation |
| One comment feed | Yes permitted entries | Yes | Yes | Only while current executor/allowed context |
| Exact internal admin audit | No | No/minimal | Yes | No |
| `allowed_actions` | Resident actions | UK actions | UK + config actions | Only exact assignment/executor actions |
| Configuration screen | No | No | Yes | No |
| Completion action | No | Yes when basis valid | Yes when basis valid | No |
| Demo role switch | Demo shell only, server controlled | Same | Same | Same |

### 30.1. Critical data-boundary rule

Fields not visible to role are omitted server-side. Example: contractor reject reason is not sent to Resident and hidden with CSS; it simply is not in Resident snapshot.

### 30.2. Old contractor

After rejection or reassignment that clears current executor, old Contractor Employee no longer has LIVE Case read access unless a separately valid current Assignment later grants it again.

---

## 31. HTTP Semantics

Exact semantics chosen for MVP:

| HTTP | Meaning | Examples |
|---:|---|---|
| `200` | Successful read or command | command committed, session switched |
| `201` | New top-level resource created | Case, DemoRun, config resource |
| `400` | Malformed transport/request schema | invalid JSON, UUID syntax, missing required structural field |
| `401` | Authentication absent/invalid/expired | session token invalid, signed MAX bootstrap invalid/expired |
| `403` | Authenticated actor known, action forbidden | role cannot perform command in visible own resource |
| `404` | Resource absent **or intentionally hidden by isolation** | foreign tenant Case/attachment |
| `409` | Current-context conflict / stale / idempotency conflict | old assignment, old result, terminal Case, key reuse |
| `422` | Well-formed request but fixable content/business input validation failed | empty reject reason, missing required photo/file, inactive category on CreateCase |
| `500` | Unexpected internal failure | unhandled bug / infrastructure failure |
| `503` | Optional only for readiness/unavailable dependency at edge | application not ready; not used for normal MAX notification retry |

### 31.1. 400 vs 422

`400` — request cannot be structurally understood.

`422` — command is structurally understood, actor/context may be valid, but submitted content fails explicit validation.

### 31.2. 403 vs 404

- use `403` when resource is legitimately visible to actor but requested action is forbidden;
- use `404` for foreign tenant/assignment/attachment where revealing existence would violate isolation.

### 31.3. 409 vs 422

- `409` = server current domain context conflicts with target/intention;
- `422` = content itself invalid while target/context is otherwise current.

### 31.4. 500 and business rollback

Unexpected failure before commit must roll back. Frontend must never infer business success from network failure/500.

### 31.5. MAX notification failure is not SubmitResult 500 after commit

Because delivery is asynchronous outbox, a later MAX outage cannot convert already committed SubmitResult into failed HTTP response or cause second Result.

---

# 32. Standard Command Success Contract

Unless a command has a special response, use:

```json
{
  "command_id": "uuid",
  "case_id": "uuid",
  "state": "EXECUTION",
  "revision": 8,
  "created": {
    "assignment_id": "uuid"
  },
  "event_ids": ["uuid"]
}
```

Rules:

- response describes committed effect;
- it is not a full Case snapshot;
- frontend refetches Case after success;
- no optimistic workflow mutation is required;
- `created` includes only entities relevant to command.

---

# 33. Server-Side Command Validation Order

Normative order for existing Case mutation:

1. authenticate session;
2. derive discriminated idempotency principal;
3. validate request schema and canonical fingerprint;
4. begin transaction;
5. acquire/wait/replay `CommandExecution` reservation for principal/key;
6. lock Case `FOR UPDATE`;
7. re-resolve active AppUser/RoleBinding/access/DemoRun context;
8. validate tenant/resource/run visibility — foreign hidden as 404;
9. terminal guard;
10. exact target/currentness;
11. state/iteration/business preconditions;
12. lock/revalidate dependent configuration rows in canonical order;
13. domain writes;
14. current projection + Case.updated_at;
15. append CaseEvent(s);
16. NotificationIntent if required;
17. increment Case.revision;
18. finalize CommandExecution canonical success using the post-command revision;
19. commit.

Все command-specific разделы `Transaction effect` выше описывают **atomic logical effect set**, если прямо не сказано иное. Они не переопределяют physical insert/update order §33. Исключение возможно только для явно указанного FK/deferred-FK contract, который требует конкретной последовательности insert'ов внутри той же DB transaction.

Для `CreateCase` post-command `revision` в canonical success response остаётся `1`; общий step 17 трактуется как формирование первой committed revision из implicit pre-creation `0`, а не как `1 → 2` после insert.

For CreateCase, idempotency reservation comes first, then locked coherent configuration/access rows and the deferred Case/Iteration bootstrap. There is no Case row lock yet.

No command may return terminal/stale details for a resource that current actor/run is not allowed to know exists.

---

---

# 34. Configuration vs Product Command Boundary

Allowed generic update patterns apply only to mutable configuration resources. The following endpoint family is explicitly prohibited:

```text
PATCH /api/v1/cases/{caseId}
{ "state": "..." }
```

Also prohibited:

- setting executor directly;
- setting current assignment directly;
- setting iteration directly;
- setting completed=true;
- writing formal feedback as generic CRUD;
- deleting historical Result/Event to “reset” demo.

All such facts arise only from explicit commands above.

---

# 35. Real / Synthetic / Demo Contract

Interface descriptions and UI must consistently distinguish:

### REAL

- MAX Bot launch;
- signed initData validation;
- Bot → Mini App;
- Bot API notification;
- backend/DB state transitions.

### SYNTHETIC DATA

- demo resident;
- addresses/premises;
- УК employees;
- contractor organizations/employees;
- case texts/files/categories.

### DEMO MECHANISM

- switching effective synthetic actor;
- DemoRun;
- maintenance reseed if team uses it.

No endpoint or copy may claim CRM/ГИС integration that does not exist.

---

# 36. MAX Live Verification Dependencies in Contracts

Current official documentation removes the former hidden MUST dependency on equality of user namespaces.

### V-01 — `open_app` / contextual payload parity

Live-check web/mobile UX. MUST flow remains generic and does not depend on contextual payload.

### V-02 — Mini App `user.id` vs Bot API `user_id`

May be verified observationally, but **MUST flow does not depend on equality**. Notification uses documented validated `chat.id` → Bot API `chat_id`.

### V-03 — proactive Bot message lifecycle

Official `POST /messages` exists; live account/dialog lifecycle still requires E2E proof. If target/API is not usable, runnable readiness is false; no local fake substitute.

### V-04 — web/mobile launch/download parity

Live-check same DemoRun/primary Case after fresh bootstrap in both clients and attachment download via native Bridge/web path.

These are integration evidence gates, not unresolved architectural semantics.

---

---

# 37. Contract Test Obligations

Automated/API integration tests must prove at least:

- invalid/revoked role cannot act on next request even with unexpired signed token;
- foreign organization/house/premises/run hidden before terminal/stale leakage;
- old Selection cannot be sent;
- old Assignment cannot accept/reject;
- selected/sent contractor lacks executor rights before accept;
- current executor only after accept;
- same accepted Assignment may submit Result in N+1;
- old contractor loses LIVE access after reassignment;
- duplicate/concurrent same idempotency key waits then canonical-replays;
- multipart same key with changed file bytes → key reuse conflict;
- circular Case/Iteration insert commits with both non-null-valid FKs;
- config update/deactivation races serialize with CreateCase/Select/Send;
- duplicate Result produces one Result/EVT-008/notification intent;
- outbox concurrent workers honor claim token/lease;
- permanent failure redrive reuses same NotificationIntent;
- confirmation/remark race creates one feedback branch;
- confirmation does not close Case;
- EVT-015 alone cannot complete no-feedback branch;
- no-feedback completion requires separate explicit basis;
- Resident in REMARKS_REVIEW cannot comment without current clarification target;
- UK remark decisions target result+feedback and derive iteration;
- activity has one item per CaseEvent event_id, no duplicated Result/Comment/Feedback facts;
- initial attachments visible to allowed four contexts and hidden from selected/old contractor;
- attachment typed links reject cross-Case parent; download capability is scoped/short-lived;
- ReturnToRework creates exactly N+1 and EVT-013/014;
- disputed completion creates EVT-017 only;
- Completed rejects process mutations;
- DemoRun fresh bootstrap restores same current run/primary Case; new run cannot mutate old run;
- frontend exposes four role views; backend resolves Contractor A/B actor;
- webhook wrong secret rejected; expected subscription reconciliation detects/recreates lost subscription;
- machine-readable `/api/v1/system/info.build_sha` matches deployed build.

Live MAX tests additionally prove real notification and native/web download on judging environment.

---

---


# 37A. Submission Delivery Output Contract

Эти артефакты **не создаются данным fix pass**, но являются обязательными будущими delivery outputs по repository criteria:

- `Dockerfile`;
- `compose.yaml` / `docker-compose.yml`;
- `.dockerignore`;
- `.env.example` без рабочих secrets;
- README с purpose/scenario/architecture/start-stop/env/ports/dependencies/integrations/data/verification;
- one-command Docker startup;
- build criterion ≤ 5 minutes excluding initial base-image pull;
- public HTTPS application/API address;
- OpenAPI 3.0/3.1 for own API;
- `DATA-API.yaml` with method/path/parameters/role/expected response checks;
- test roles/access and synthetic test data;
- fixed submission SHA;
- verification procedure including `/api/v1/system/info.build_sha`, MAX mobile/web flow and restart persistence.

These are delivery artifacts, not new Product Spec features.

---

# 38. SPEC Conflict Status

**Blocking SPEC CONFLICTS: 0.**

Этот contract не добавляет:

- новую роль;
- девятое product state;
- pending-assignment withdrawal;
- auto-close timer;
- resident completion;
- contractor completion;
- new Case on rework;
- generic editable state;
- fake MAX notification.

---

# 39. Interface Contract Gate Recommendation

Final-candidate contract точечно закрывает `TCR-MAJ-001` и `TCR-MIN-001` поверх ранее принятых fixes и достаточно конкретен для final targeted recheck без самостоятельного выбора coding-agent по blocking semantics.

Он **не является self-PASS**.

**STATUS: READY FOR FINAL TARGETED RECHECK.**
