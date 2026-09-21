# Data Model

**Проект:** MAX Hackathon 2026 — трек «Умный город»  
**Статус документа:** Final Candidate Data Contract after TCR-MAJ-001 / TCR-MIN-001 Closure Fix  
**Нормативная база:** `docs/01_PRODUCT_FREEZE.md` > `docs/02_PRODUCT_SPEC.md`  
**Связанный документ:** `docs_03_ARCHITECTURE_FINAL_CANDIDATE.md`  
**Дата:** 21 сентября 2026

---

## 1. Principles

Модель данных строится вокруг одного `Case` как aggregate / consistency boundary и обязана одновременно обеспечивать:

- один неизменяемый `case_id` на весь lifecycle;
- ровно восемь product states;
- authoritative current projection в `Case`;
- отдельные identity для `ContractorSelection`, `Assignment`, `Result`, `ResidentFeedback`;
- сохранение всех исторических фактов;
- append-only `CaseEvent` для EVT-001…EVT-017;
- `selected ≠ sent ≠ accepted`;
- current executor только после accepted;
- iteration `N+1` только после `ReturnToRework`;
- возможность accepted Assignment пережить границу iterations при доработке тем же исполнителем;
- формальный feedback только по конкретному актуальному Result;
- только УК завершает Case;
- backend-enforced organization / house / premises / assignment / executor / state / iteration / result isolation;
- deterministic synthetic demo data без подмены продуктовых правил.

Модель **не является full event sourcing**. Для текущего состояния authoritative source — `Case` и его current pointers. Для ответа «что произошло?» authoritative source — immutable business records + append-only `CaseEvent`. Обе стороны изменяются атомарно одной business command.

### 1.1. Идентификаторы

Для основных identity используется UUID:

- `organization_id`;
- `house_id`;
- `premises_id`;
- `app_user_id`;
- `category_id`;
- `contractor_id`;
- `case_id`;
- `iteration_id`;
- `selection_id`;
- `assignment_id`;
- `result_id`;
- `feedback_id`;
- `comment_id`;
- `attachment_id`;
- `event_id`;
- `command_id`;
- `notification_intent_id`;
- `demo_run_id`.

Human-readable номера могут существовать дополнительно, но не заменяют immutable identity в stale protection.

### 1.2. Время

Все persisted timestamps хранятся как timezone-aware UTC timestamps (`timestamptz` в PostgreSQL). UI отвечает только за локальное представление.

### 1.3. Product state enum

Разрешены **ровно восемь** значений:

| Код | Product state |
|---|---|
| `CREATED` | Создано |
| `ACCEPTED_BY_UK` | Принято УК |
| `SENT_TO_CONTRACTOR` | Передано подрядчику |
| `EXECUTION` | Исполнение |
| `AWAITING_RESULT_CHECK` | Ожидается проверка результата |
| `REMARKS_REVIEW` | Замечания рассматриваются |
| `REWORK` | Доработка |
| `COMPLETED` | Завершено |

Никакие `PENDING`, `ACCEPTED`, `DELIVERED`, `ACTIVE` и аналогичные технические статусы других таблиц не являются product states.

### 1.4. Role enum

Ровно четыре прикладные роли:

- `RESIDENT`;
- `UK_EMPLOYEE`;
- `UK_ADMIN`;
- `CONTRACTOR_EMPLOYEE`.

### 1.5. Supporting enums

Технически допустимы следующие вспомогательные enum, не расширяющие lifecycle:

- `ResultRequirement = NONE | PHOTO | FILE`;
- `AssignmentDecision = PENDING | ACCEPTED | REJECTED`;
- `ResidentFeedbackType = CONFIRMATION | REMARK`;
- `ClosureKind = CONFIRMED_RESULT | NO_RESIDENT_FEEDBACK | DISPUTED_WITH_EXPLANATION`;
- `NotificationStatus = PENDING | RETRY | CLAIMED | DELIVERED | PERMANENT_FAILURE`;
- `DemoRunStatus = ACTIVE | ARCHIVED`;
- `MaxIdentityLinkStatus = UNLINKED | LINKED_CONFIRMED`;
- `IdempotencyPrincipalType = APP_USER | MAX_IDENTITY`;
- `CommandExecutionStatus = IN_PROGRESS | SUCCEEDED`.

`NotificationStatus`, `DemoRunStatus` и статусы idempotency являются техническими состояниями и не добавляют product state.

---

---

## 2. Entity Overview

```text
Organization
 ├─ House
 │   └─ Premises
 ├─ Category
 ├─ OrganizationContractor ── Contractor
 └─ UserRoleBinding / UKHouseAccess

AppUser
 ├─ MaxIdentity
 ├─ UserRoleBinding
 └─ ResidentPremisesAccess

DemoRun
 └─ allowed synthetic actors + real MAX notification recipient

Case
 ├─ CaseIteration
 ├─ ContractorSelection
 ├─ Assignment
 ├─ Result
 │   └─ ResidentFeedback
 ├─ Comment
 ├─ Attachment links
 ├─ CaseEvent
 ├─ CommandExecution
 └─ NotificationIntent
```

`Case` содержит current projection. Все перечисленные дочерние business facts сохраняются как отдельные записи и не уничтожаются при смене current context.

---

## 3. Organization

### 3.1. Purpose

Представляет УК / управляющую организацию и является верхней границей tenant isolation для Case и конфигурации.

### 3.2. Fields

```text
Organization
- organization_id UUID PK
- name text NOT NULL
- active boolean NOT NULL
- created_at timestamptz NOT NULL
- updated_at timestamptz NOT NULL
```

### 3.3. Rules

- Case принадлежит ровно одной Organization.
- House и Category принадлежат ровно одной Organization.
- UK roles действуют только в своей Organization и дополнительно в разрешённых домах.
- Contractor не становится частью Organization; доступность фиксируется через `OrganizationContractor`.

---

## 4. House

### 4.1. Purpose

Дом в области управления конкретной Organization.

### 4.2. Fields

```text
House
- house_id UUID PK
- organization_id UUID FK -> Organization
- address text NOT NULL
- display_label text NULL
- active boolean NOT NULL
- created_at timestamptz NOT NULL
- updated_at timestamptz NOT NULL
```

### 4.3. Rules

- `(house_id, organization_id)` должен быть согласован с Case.
- Деактивация дома запрещает новые Case там, но не переписывает старые Case или историю.

---

## 5. Premises

### 5.1. Purpose

Помещение / квартира, к которой привязывается Resident access и Case.

### 5.2. Fields

```text
Premises
- premises_id UUID PK
- house_id UUID FK -> House
- number_or_label text NOT NULL
- active boolean NOT NULL
- created_at timestamptz NOT NULL
- updated_at timestamptz NOT NULL
```

### 5.3. Rules

- Premises всегда принадлежит ровно одному House.
- Resident может создать Case только по Premises из своего `ResidentPremisesAccess`.
- Деактивация блокирует новый Case, но не ломает read/history существующих Case.

---

## 6. User / Role Bindings

## 6.1. AppUser

```text
AppUser
- app_user_id UUID PK
- display_name text NOT NULL
- is_synthetic boolean NOT NULL DEFAULT false
- active boolean NOT NULL
- created_at timestamptz NOT NULL
- updated_at timestamptz NOT NULL
```

Один synthetic demo actor — один полноценный `AppUser`. `DEMO_MODE` не меняет роль одной записи на лету.

## 6.2. UserRoleBinding

```text
UserRoleBinding
- role_binding_id UUID PK
- app_user_id UUID FK -> AppUser
- role enum NOT NULL
- organization_id UUID NULL FK -> Organization
- contractor_id UUID NULL FK -> Contractor
- active boolean NOT NULL
- created_at timestamptz NOT NULL
```

Logical checks:

- `RESIDENT`: `organization_id` и `contractor_id` не являются источником помещения; доступ определяется `ResidentPremisesAccess`.
- `UK_EMPLOYEE`, `UK_ADMIN`: `organization_id` обязателен, `contractor_id` NULL.
- `CONTRACTOR_EMPLOYEE`: `contractor_id` обязателен, `organization_id` NULL.
- роль не является доверенным полем request; binding выбирается backend из effective actor.

## 6.3. ResidentPremisesAccess

```text
ResidentPremisesAccess
- app_user_id UUID FK -> AppUser
- premises_id UUID FK -> Premises
- active boolean NOT NULL
- created_at timestamptz NOT NULL
PRIMARY KEY(app_user_id, premises_id)
```

## 6.4. UKHouseAccess

```text
UKHouseAccess
- app_user_id UUID FK -> AppUser
- house_id UUID FK -> House
- active boolean NOT NULL
- created_at timestamptz NOT NULL
PRIMARY KEY(app_user_id, house_id)
```

Для `UK_ADMIN` допустимо выдать доступ ко всем домам своей Organization через явные bindings либо вычисляемое admin правило. В любом случае Organization scope проверяется всегда.

## 6.5. MaxIdentity

MAX identity отделена от application role. Для обязательной outbound-доставки MAX используется документированный dialog/chat target из **валидированного signed `initData`**, а не предположение о равенстве Mini App `user.id` и Bot API `user_id`.

```text
MaxIdentity
- max_identity_id UUID PK
- mini_app_user_id text NULL UNIQUE
- delivery_chat_id text NULL
- delivery_chat_type text NULL
- bot_user_id text NULL UNIQUE
- link_status MaxIdentityLinkStatus NOT NULL
- app_user_id UUID NULL FK -> AppUser
- first_seen_at timestamptz NOT NULL
- last_seen_at timestamptz NOT NULL
- linked_at timestamptz NULL
```

Правила:

- `mini_app_user_id`, `delivery_chat_id` и `delivery_chat_type` записываются только из server-validated `window.WebApp.initData`;
- `delivery_chat_id` — canonical outbound delivery binding для обязательного MAX notification, если этот target подтверждён текущим validated MAX context;
- normal application mapping однозначен на DB-level: один `AppUser` может быть связан максимум с одним `MaxIdentity` через partial `UNIQUE(app_user_id) WHERE app_user_id IS NOT NULL`;
- readiness invariant является нормативным DB contract: `link_status = LINKED_CONFIRMED => delivery_chat_id IS NOT NULL AND delivery_chat_type IS NOT NULL`;
- отсутствие mapping либо неготовый mapped identity означает, что normal-mode Resident **не** outbound-ready;
- нельзя считать `mini_app_user_id == bot_user_id`; `bot_user_id` остаётся optional platform identity и не нужен для MUST notification;
- `startapp/start_param` не используется для identity correlation или authorization;
- в normal mode Case notification recipient — единственный outbound-ready `MaxIdentity`, mapped к `Case.resident_user_id`; selector `first/latest/arbitrary row` запрещён;
- в DEMO_MODE real MAX identity может не совпадать с effective synthetic actor; notification recipient определяется explicit `DemoRun.notification_recipient_max_identity_id`, а не mapping synthetic Resident;
- изменение/обновление validated delivery target не меняет business actor или history.

---

---

## 7. Category

### 7.1. Purpose

Конфигурируемая категория обращения, использующая общий lifecycle.

### 7.2. Fields

```text
Category
- category_id UUID PK
- organization_id UUID FK -> Organization
- name text NOT NULL
- description text NULL
- default_contractor_id UUID NULL FK -> Contractor
- requires_premises_access boolean NOT NULL
- result_requirement ResultRequirement NOT NULL
- active boolean NOT NULL
- config_revision bigint NOT NULL
- created_at timestamptz NOT NULL
- updated_at timestamptz NOT NULL
- updated_by_user_id UUID NULL FK -> AppUser
```

### 7.3. Historical boundary

Для MVP выбирается snapshot relevant configuration в Case, а не полноценная `CategoryVersion` сущность.

При создании Case фиксируются как минимум:

- `category_name_snapshot`;
- `requires_access_snapshot`;
- `result_requirement_snapshot`;
- `default_contractor_snapshot_id`.

Изменение Category применяется к новым Case и не меняет смысл существующего Case.

---

## 8. Contractor

## 8.1. Contractor

```text
Contractor
- contractor_id UUID PK
- display_name text NOT NULL
- active boolean NOT NULL
- created_at timestamptz NOT NULL
- updated_at timestamptz NOT NULL
```

## 8.2. OrganizationContractor

```text
OrganizationContractor
- organization_id UUID FK -> Organization
- contractor_id UUID FK -> Contractor
- active boolean NOT NULL
- created_at timestamptz NOT NULL
PRIMARY KEY(organization_id, contractor_id)
```

Подрядчик может быть выбран только если текущая Organization имеет active связь с ним.

---

## 9. Case

### 9.1. Purpose

`Case` — главный aggregate и authoritative current projection.

### 9.2. Fields

```text
Case
- case_id UUID PK
- display_number text NULL UNIQUE

# immutable scope / origin
- organization_id UUID FK -> Organization NOT NULL
- house_id UUID FK -> House NOT NULL
- premises_id UUID FK -> Premises NOT NULL
- resident_user_id UUID FK -> AppUser NOT NULL
- category_id UUID FK -> Category NOT NULL
- description text NOT NULL
- created_at timestamptz NOT NULL
- updated_at timestamptz NOT NULL
- created_by_user_id UUID FK -> AppUser NOT NULL
- demo_run_id UUID NULL FK -> DemoRun

# configuration snapshots
- category_name_snapshot text NOT NULL
- requires_access_snapshot boolean NOT NULL
- result_requirement_snapshot ResultRequirement NOT NULL
- default_contractor_snapshot_id UUID NULL FK -> Contractor
- house_address_snapshot text NOT NULL
- premises_label_snapshot text NOT NULL

# authoritative current projection
- current_state CaseState NOT NULL
- current_iteration_id UUID NOT NULL
- current_selection_id UUID NULL
- current_assignment_id UUID NULL
- current_executor_contractor_id UUID NULL FK -> Contractor
- current_result_id UUID NULL

# closure projection
- closed_at timestamptz NULL
- closed_by_user_id UUID NULL FK -> AppUser
- closure_kind ClosureKind NULL
- closure_explanation text NULL

# freshness / ordering
- revision bigint NOT NULL DEFAULT 1
- last_event_seq bigint NOT NULL DEFAULT 0
```

### 9.3. Immutable Case fields

После `CreateCase` не меняются:

- `case_id`;
- organization/house/premises/resident/category;
- initial description;
- creation metadata;
- configuration snapshots;
- demo_run relation.

### 9.4. Current pointers

Current pointers не создают историю; они указывают на исторические records:

- `current_iteration_id`;
- `current_selection_id`;
- `current_assignment_id`;
- `current_executor_contractor_id`;
- `current_result_id`.

Ни один pointer не меняется отдельно от соответствующего domain fact + event в одной transaction.

### 9.5. `revision`

`revision` увеличивается на каждую успешно committed case-mutating command и используется для freshness/read UX/logging. `Case.updated_at` устанавливается той же transaction и является единственным authoritative источником `updated_at` в Case list. Основной consistency mechanism — row lock + exact target identity; `revision` не является вторым обязательным CAS framework.

`current_iteration_id` остаётся `NOT NULL` после каждого commit. Механизм bootstrap circular FK задан нормативно в §26.4: `case_id` и `iteration_id` генерируются заранее, а composite current-iteration FK является `DEFERRABLE INITIALLY DEFERRED`.

---

## 10. CaseIteration

### 10.1. Purpose

Явная identity каждой попытки довести тот же Case до результата.

### 10.2. Fields

```text
CaseIteration
- iteration_id UUID PK
- case_id UUID FK -> Case NOT NULL
- iteration_no integer NOT NULL
- start_reason enum(INITIAL, REWORK) NOT NULL
- started_at timestamptz NOT NULL
- started_by_user_id UUID FK -> AppUser NOT NULL
- source_result_id UUID NULL FK -> Result
- source_feedback_id UUID NULL FK -> ResidentFeedback
- started_by_event_id UUID NULL FK -> CaseEvent
UNIQUE(case_id, iteration_no)
CHECK(iteration_no >= 1)
```

### 10.3. Rules

- Initial Case всегда получает iteration `1`.
- Только `ReturnToRework` создаёт `N+1`.
- Rejection / selection / send / accept не меняют iteration.
- Iteration immutable после создания.

---

## 11. ContractorSelection

### 11.1. Purpose

Отдельный immutable факт `selected` до существования Assignment.

### 11.2. Fields

```text
ContractorSelection
- selection_id UUID PK
- case_id UUID FK -> Case NOT NULL
- created_iteration_id UUID FK -> CaseIteration NOT NULL
- contractor_id UUID FK -> Contractor NOT NULL
- selected_by_user_id UUID FK -> AppUser NOT NULL
- selected_at timestamptz NOT NULL
- selection_no integer NOT NULL
UNIQUE(case_id, selection_no)
```

### 11.3. Currentness

Selection не содержит `is_current`. Current selection определяется **только** `Case.current_selection_id`.

### 11.4. Stale protection

`SendAssignment` обязан target'ить `selection_id`, а не только `contractor_id`.

---

## 12. Assignment

### 12.1. Purpose

Конкретный факт `sent` конкретному contractor на основании конкретного Selection.

### 12.2. Fields

```text
Assignment
- assignment_id UUID PK
- case_id UUID FK -> Case NOT NULL
- selection_id UUID FK -> ContractorSelection NOT NULL
- contractor_id UUID FK -> Contractor NOT NULL
- created_iteration_id UUID FK -> CaseIteration NOT NULL
- assignment_no integer NOT NULL
- sent_by_user_id UUID FK -> AppUser NOT NULL
- sent_at timestamptz NOT NULL

- decision_status AssignmentDecision NOT NULL DEFAULT PENDING
- accepted_at timestamptz NULL
- accepted_by_user_id UUID NULL FK -> AppUser
- rejected_at timestamptz NULL
- rejected_by_user_id UUID NULL FK -> AppUser
- reject_reason text NULL

UNIQUE(case_id, assignment_no)
```

### 12.3. Decision constraints

Logical checks:

```text
PENDING  => accepted_at IS NULL AND rejected_at IS NULL
ACCEPTED => accepted_at IS NOT NULL
            AND accepted_by_user_id IS NOT NULL
            AND rejected_at IS NULL
            AND rejected_by_user_id IS NULL
            AND reject_reason IS NULL
REJECTED => rejected_at IS NOT NULL
            AND rejected_by_user_id IS NOT NULL
            AND reject_reason IS NOT EMPTY
            AND accepted_at IS NULL
            AND accepted_by_user_id IS NULL
```

Decision меняется из `PENDING` только один раз.

### 12.4. Critical iteration rule

`Assignment.created_iteration_id` означает **iteration, в которой Assignment был создан**, а не предел его validity.

При rework тем же current executor Product Spec не требует повторного acceptance. Поэтому accepted Assignment из iteration `N` может оставаться current и обосновывать Result iteration `N+1`.

**Запрещён constraint:**

```text
Result.iteration_id == Assignment.created_iteration_id
```

Он был бы ошибочным и ломал бы утверждённый rework lifecycle.

---

## 13. Result

### 13.1. Purpose

Immutable сообщение current executor о выполненной работе в конкретной iteration.

### 13.2. Fields

```text
Result
- result_id UUID PK
- case_id UUID FK -> Case NOT NULL
- iteration_id UUID FK -> CaseIteration NOT NULL
- assignment_id UUID FK -> Assignment NOT NULL
- contractor_id UUID FK -> Contractor NOT NULL
- author_user_id UUID FK -> AppUser NOT NULL
- description text NOT NULL
- submitted_at timestamptz NOT NULL
UNIQUE(iteration_id)
```

### 13.3. Rules

- Result создаётся только current executor.
- `iteration_id == Case.current_iteration_id` в момент commit.
- `assignment_id == Case.current_assignment_id` в момент commit, включая Assignment, созданный в более ранней iteration.
- Description непустой.
- Required material по `Case.result_requirement_snapshot` проверяется до Result commit.
- Старый Result никогда не обновляется новым Result.
- `Case.current_result_id` указывает только на актуальный Result текущей iteration.

---

## 14. ResidentFeedback

### 14.1. Fields

```text
ResidentFeedback
- feedback_id UUID PK
- case_id UUID FK -> Case NOT NULL
- iteration_id UUID FK -> CaseIteration NOT NULL
- result_id UUID FK -> Result NOT NULL
- resident_user_id UUID FK -> AppUser NOT NULL
- type ResidentFeedbackType NOT NULL
- remark_text text NULL
- created_at timestamptz NOT NULL
UNIQUE(result_id)
```

### 14.2. Constraints

```text
CONFIRMATION => remark_text IS NULL or empty
REMARK       => remark_text IS NOT EMPTY
```

### 14.3. Rules

- Feedback всегда относится к конкретному Result.
- Только Resident исходного Case может его создать.
- Result должен быть `Case.current_result_id`.
- Result должен относиться к current iteration.
- На один Result — максимум одна formal branch.
- Confirmation **не** переводит Case в `COMPLETED`.
- Remark переводит Case в `REMARKS_REVIEW`.
- После открытия следующей iteration старый Result не принимает новый formal feedback.

---

## 15. Comment

### 15.1. Purpose

Одна наблюдаемая рабочая лента Case. Отдельных приватных каналов нет.

### 15.2. Fields

```text
Comment
- comment_id UUID PK
- case_id UUID FK -> Case NOT NULL
- iteration_id UUID FK -> CaseIteration NOT NULL
- author_user_id UUID FK -> AppUser NOT NULL
- actor_role_snapshot Role NOT NULL
- actor_organization_id UUID NULL
- actor_contractor_id UUID NULL
- comment_kind enum(WORKING, CLARIFICATION_REQUEST, CLARIFICATION_REPLY) NOT NULL
- context_result_id UUID NULL FK -> Result
- context_feedback_id UUID NULL FK -> ResidentFeedback
- in_reply_to_comment_id UUID NULL FK -> Comment
- body text NOT NULL
- created_at timestamptz NOT NULL
```

### 15.3. Rules

- Нет поля `private_to_role`, `visibility=resident-contractor` или аналогичной произвольной приватности.
- Read visibility определяется server-side role projection.
- Contractor comment доступен только current executor в разрешённых states.
- Completed Case не принимает новые comments.
- `RequestClarification` в `REMARKS_REVIEW` создаёт `CLARIFICATION_REQUEST` + EVT-012 и **обязательно** фиксирует exact current `result_id`, `feedback_id` и current `iteration_id`.
- Resident comment в `REMARKS_REVIEW` допустим только как `CLARIFICATION_REPLY`: `in_reply_to_comment_id` обязан указывать на существующий `CLARIFICATION_REQUEST` того же Case, current Result, current REMARK Feedback и current iteration.
- Для `CLARIFICATION_REPLY` `context_result_id/context_feedback_id` совпадают с target request; arbitrary resident comment в `REMARKS_REVIEW` без такого context запрещён.
- Same-case/same-iteration/context integrity закрепляется composite FK/constraint rules из §26.

---

---

## 16. Attachment

### 16.1. Storage choice

Для hackathon MVP metadata и bytes хранятся в PostgreSQL. Container filesystem не является authoritative storage.

### 16.2. Fields

```text
Attachment
- attachment_id UUID PK
- case_id UUID FK -> Case NOT NULL
- uploaded_by_user_id UUID FK -> AppUser NOT NULL
- file_name text NOT NULL
- mime_type text NOT NULL
- byte_size bigint NOT NULL
- sha256 text NOT NULL
- content bytea NOT NULL
- created_at timestamptz NOT NULL
```

### 16.3. Typed relationships

Чтобы Attachment не «переезжала» между Case или business meanings, link rows несут `case_id` и используют обязательные same-case composite relations:

```text
CaseInitialAttachment
- case_id
- attachment_id
PRIMARY KEY(case_id, attachment_id)

WorkMaterialAttachment
- case_id
- iteration_id
- assignment_id
- attachment_id
- created_event_id
PRIMARY KEY(attachment_id)

ResultAttachment
- case_id
- result_id
- attachment_id
PRIMARY KEY(result_id, attachment_id)

FeedbackAttachment
- case_id
- feedback_id
- attachment_id
PRIMARY KEY(feedback_id, attachment_id)

CommentAttachment
- case_id
- comment_id
- attachment_id
PRIMARY KEY(comment_id, attachment_id)
```

Обязательные integrity rules:

- каждый link `(case_id, attachment_id)` ссылается на Attachment того же Case;
- `WorkMaterialAttachment.iteration_id` и `assignment_id` принадлежат тому же Case;
- `WorkMaterialAttachment.assignment_id` — тот Assignment, который был current/accepted authority при добавлении материала;
- Result/Feedback/Comment links ссылаются на parent entity того же Case;
- ни одна link-table не может сделать bytes одного Case доступными через parent другого Case.

### 16.4. Result material lifecycle

`AddResultMaterial` в `EXECUTION` / `REWORK`:

1. проверяет current executor, assignment и iteration;
2. создаёт Attachment;
3. создаёт `WorkMaterialAttachment`;
4. создаёт EVT-009;
5. state не меняет.

`SubmitResult` затем target'ит конкретные уже созданные attachment IDs и создаёт immutable `ResultAttachment` links. Это позволяет валидировать required PHOTO/FILE до EVT-008 и не создавать ложный Result при невалидном материале.

### 16.5. Immutability

После связи с business fact изменять bytes, filename, sha256 или смысл Attachment нельзя. Исправление = новая Attachment.

---

---

## 17. CaseEvent

### 17.1. Purpose

Append-only семантическая история business facts.

### 17.2. Fields

```text
CaseEvent
- event_id UUID PK
- case_id UUID FK -> Case NOT NULL
- event_seq bigint NOT NULL
- event_type enum(EVT_001 ... EVT_017) NOT NULL
- occurred_at timestamptz NOT NULL

- actor_user_id UUID NULL FK -> AppUser
- actor_role_snapshot Role NULL
- actor_organization_id UUID NULL
- actor_contractor_id UUID NULL

- from_state CaseState NULL
- to_state CaseState NULL

- iteration_id UUID NULL FK -> CaseIteration
- selection_id UUID NULL FK -> ContractorSelection
- assignment_id UUID NULL FK -> Assignment
- result_id UUID NULL FK -> Result
- feedback_id UUID NULL FK -> ResidentFeedback
- comment_id UUID NULL FK -> Comment
- attachment_id UUID NULL FK -> Attachment

- description text NOT NULL
- presentation_data jsonb NULL
- command_id UUID NOT NULL FK -> CommandExecution
- caused_by_event_id UUID NULL FK -> CaseEvent
- derived boolean NOT NULL DEFAULT false

UNIQUE(case_id, event_seq)
```

### 17.3. Mandatory catalog

| Event | Meaning |
|---|---|
| EVT-001 | Case created |
| EVT-002 | УК приняла Case |
| EVT-003 | Contractor selected |
| EVT-004 | Assignment sent |
| EVT-005 | Contractor accepted Assignment |
| EVT-006 | Contractor rejected Assignment |
| EVT-007 | Comment added |
| EVT-008 | Contractor submitted Result |
| EVT-009 | Result/work material added |
| EVT-010 | Resident confirmation |
| EVT-011 | Resident remark |
| EVT-012 | УК requested clarification |
| EVT-013 | УК returned Case to rework |
| EVT-014 | New iteration started |
| EVT-015 | No resident feedback recorded by УК |
| EVT-016 | УК completed Case on normal basis |
| EVT-017 | УК completed disputed Case with explanation |

### 17.4. EVT-014

EVT-014 не является отдельной пользовательской кнопкой. `ReturnToRework` создаёт EVT-013 и EVT-014 в одной transaction; EVT-014 помечается `derived=true`, связывается `caused_by_event_id` с EVT-013 и получает тот же initiating UK actor / `command_id`.

### 17.5. Append-only enforcement

Runtime application не имеет business path `UPDATE` / `DELETE` для `CaseEvent`. Migration обязана закрепить append-only runtime contract DB privileges либо небольшим immutable trigger/role policy.

### 17.6. Command correlation and EVT-015 integrity

- `CaseEvent.command_id -> CommandExecution.command_id` — обязательный FK. Idempotency reservation создаётся до Case/domain writes, поэтому referenced `CommandExecution` уже существует при insert event; FK может быть immediate.
- Для `EVT_015` действует CHECK: `event_type = EVT_015 => result_id IS NOT NULL`.
- Дополнительно сохраняется partial `UNIQUE(result_id,event_type) WHERE event_type = EVT_015`, поэтому один Result не получает два EVT-015.

---

## 18. Idempotency / Command Execution

### 18.1. Purpose

Отличает повтор транспортного запроса от нового business intent и задаёт единственную serialization point для concurrent одинаковых idempotency keys.

### 18.2. Fields

```text
CommandExecution
- command_id UUID PK
- principal_type IdempotencyPrincipalType NOT NULL
- app_user_id UUID NULL FK -> AppUser
- max_identity_id UUID NULL FK -> MaxIdentity
- idempotency_key text NOT NULL
- command_type text NOT NULL
- case_id UUID NULL FK -> Case
- request_hash text NOT NULL
- execution_status CommandExecutionStatus NOT NULL
- http_status integer NULL
- response_body jsonb NULL
- created_at timestamptz NOT NULL
- completed_at timestamptz NULL
```

Principal CHECK:

```text
principal_type = APP_USER
  => app_user_id IS NOT NULL AND max_identity_id IS NULL

principal_type = MAX_IDENTITY
  => max_identity_id IS NOT NULL AND app_user_id IS NULL
```

Partial uniqueness:

```text
UNIQUE(app_user_id, idempotency_key)
  WHERE principal_type = 'APP_USER'

UNIQUE(max_identity_id, idempotency_key)
  WHERE principal_type = 'MAX_IDENTITY'
```

Status consistency:

```text
IN_PROGRESS => http_status IS NULL
               AND response_body IS NULL
               AND completed_at IS NULL

SUCCEEDED   => http_status IS NOT NULL
               AND response_body IS NOT NULL
               AND completed_at IS NOT NULL
```

### 18.3. Principal semantics

- Case business commands и configuration writes выполняются с `APP_USER` principal.
- Demo technical commands, доступные после real MAX validation, но до выбора effective actor, используют `MAX_IDENTITY` principal.
- Real MAX identity нельзя маскировать fake/system AppUser.

### 18.4. Concurrent same-key protocol

Нормативный механизм — durable `CommandExecution` reservation:

1. после authentication и canonical fingerprint backend пытается создать `IN_PROGRESS` row для `(principal,key)` **до lifecycle/stale validation**;
2. unique index допускает одного owner; concurrent duplicate ждёт завершения conflicting insert/transaction;
3. после owner commit duplicate повторно читает row;
4. same fingerprint + `SUCCEEDED` → canonical replay stored status/body;
5. другой fingerprint → `409 IDEMPOTENCY_KEY_REUSE`;
6. owner выполняет business writes и переводит ту же row в `SUCCEEDED` в одной transaction.

Если owner transaction rollback'нулась, reservation также исчезает и следующий request может стать owner.

Fingerprint для JSON строится из canonicalized method/path/command type + normalized payload. Для multipart он дополнительно включает ordered logical file descriptors и SHA-256 **самих file bytes**; случайная multipart boundary не участвует.

Idempotency не заменяет Case lock/stale validation для разных keys.

---

---

## 19. Notification Intent / Outbox

### 19.1. Purpose

Отделяет atomic Result commit от ненадёжного внешнего MAX API.

### 19.2. Fields

```text
NotificationIntent
- notification_intent_id UUID PK
- case_id UUID FK -> Case NOT NULL
- result_id UUID FK -> Result NOT NULL
- recipient_max_identity_id UUID FK -> MaxIdentity NOT NULL
- delivery_chat_id text NOT NULL
- delivery_chat_type text NOT NULL
- notification_kind enum(RESULT_READY) NOT NULL
- dedupe_key text NOT NULL UNIQUE
- payload jsonb NOT NULL
- status NotificationStatus NOT NULL
- attempt_count integer NOT NULL DEFAULT 0
- next_attempt_at timestamptz NULL
- last_attempt_at timestamptz NULL
- claim_token UUID NULL
- claimed_at timestamptz NULL
- lease_expires_at timestamptz NULL
- delivered_at timestamptz NULL
- provider_message_id text NULL
- last_error_code text NULL
- last_error_message text NULL
- operational_redrive_count integer NOT NULL DEFAULT 0
- created_at timestamptz NOT NULL
```

Required unique:

```text
UNIQUE(result_id, notification_kind)
```

Status consistency CHECKs:

- `attempt_count >= 0`, `operational_redrive_count >= 0`;
- `PENDING|RETRY` => claim fields NULL, `delivered_at IS NULL`; `next_attempt_at IS NOT NULL`;
- `CLAIMED` => `claim_token`, `claimed_at`, `lease_expires_at` all NOT NULL and `delivered_at IS NULL`;
- `DELIVERED` => `delivered_at IS NOT NULL`, claim fields NULL;
- `PERMANENT_FAILURE` => `delivered_at IS NULL`, claim fields NULL, `next_attempt_at IS NULL`.

### 19.3. Creation rule

`SubmitResult` создаёт `Result`, EVT-008, current projection и **ровно один** `NotificationIntent` типа `RESULT_READY` в одной DB transaction. Перед этими writes backend выполняет defensive current readiness recheck exact recipient: в normal mode это единственный outbound-ready `MaxIdentity`, mapped к `Case.resident_user_id`; в demo это explicit `DemoRun.notification_recipient_max_identity_id`. Intent фиксирует `recipient_max_identity_id` и snapshot validated `delivery_chat_id/type`, использовавшийся для обязательной доставки.

### 19.4. Durable claim / lease

Worker protocol нормативный:

1. короткая transaction выбирает due `PENDING|RETRY` либо expired `CLAIMED`, блокирует row, выставляет `CLAIMED`, новый `claim_token`, `claimed_at`, `lease_expires_at`, increment `attempt_count`, commit;
2. MAX network call идёт **вне** DB transaction;
3. finalize transaction обновляет row только при совпадении `claim_token`;
4. success → `DELIVERED`;
5. temporary failure → `RETRY` + `next_attempt_at`, claim clear;
6. unrecoverable current auth/config failure → `PERMANENT_FAILURE`, claim clear;
7. crash после claim восстанавливается после lease expiration.

Внешняя доставка остаётся at-least-once: crash после фактического send и до finalize может дать duplicate external message, но не второй Result/Event.

### 19.5. Operational redrive

После исправления Bot Token/config team-only operational reconciliation может перевести **тот же** `PERMANENT_FAILURE` intent в `RETRY`, увеличить `operational_redrive_count`, очистить delivery error и назначить `next_attempt_at`. Это не product command, не создаёт новый Result/EVT-008/NotificationIntent и не меняет Case state.

---

---

## 20. Current Projection

Ниже — нормативные изменения current pointers.

| Business command | Projection effect |
|---|---|
| Create Case | state=`CREATED`; iteration=1; selection/assignment/executor/result=NULL |
| Accept Case | state=`ACCEPTED_BY_UK` |
| Select Contractor в `ACCEPTED_BY_UK` | `current_selection_id=new`; state unchanged |
| Send Assignment | `current_assignment_id=new`; state=`SENT_TO_CONTRACTOR`; executor NULL |
| Accept Assignment | assignment accepted; `current_executor_contractor_id=assignment.contractor`; state=`EXECUTION` |
| Reject Assignment | assignment rejected; state=`ACCEPTED_BY_UK`; current_selection/current_assignment/current_executor=NULL |
| Submit Result | `current_result_id=new`; state=`AWAITING_RESULT_CHECK` |
| Resident Confirmation | state stays `AWAITING_RESULT_CHECK` |
| Resident Remark | state=`REMARKS_REVIEW` |
| Request Clarification | state stays `REMARKS_REVIEW` |
| Return To Rework | create iteration N+1; state=`REWORK`; current_result=NULL; accepted current_assignment/current_executor preserved |
| Select different contractor in `REWORK` | create new selection; state stays `REWORK`; **current_assignment=NULL; current_executor=NULL immediately** |
| Send new Assignment in rework | current_assignment=new; state=`SENT_TO_CONTRACTOR` |
| Accept new Assignment | current_executor=new contractor; state=`EXECUTION` |
| Record no feedback | state stays `AWAITING_RESULT_CHECK`; current_result unchanged |
| Complete | state=`COMPLETED`; closure fields set |
| Complete With Explanation | state=`COMPLETED`; closure fields set incl. explanation |

### 20.1. Why clear executor on rework reassignment

При выборе другого подрядчика в `REWORK` старый accepted contractor больше не должен иметь LIVE-access. Поэтому старый Assignment остаётся immutable `ACCEPTED` в истории, но `Case.current_assignment_id` и `current_executor_contractor_id` очищаются атомарно при новом Selection. Это не переписывает историю; это меняет current authority.

---

## 21. Historical Snapshots

Historical semantics нельзя вычислять из сегодняшней mutable configuration.

### 21.1. Case configuration snapshot

Case хранит relevant Category/House/Premises facts на момент создания.

### 21.2. Actor snapshots

Event/Comment хранят role snapshot; при необходимости presentation data содержит display name snapshots. Историческая запись не должна становиться непонятной после переименования Contractor/Category.

### 21.3. Assignment / Result facts

Assignment хранит actual contractor; Result — actual author/contractor/assignment. Изменение default contractor не меняет старые facts.

---

## 22. Relationships

Ключевые отношения:

```text
Organization 1 ── * House
House        1 ── * Premises
Organization 1 ── * Category
Organization * ── * Contractor (OrganizationContractor)

Case 1 ── * CaseIteration
Case 1 ── * ContractorSelection
Case 1 ── * Assignment
Case 1 ── * Result
Case 1 ── * ResidentFeedback
Case 1 ── * Comment
Case 1 ── * CaseEvent
Case 1 ── * Attachment

ContractorSelection 1 ── 0..1 Assignment
Assignment          1 ── * Result historically across iterations
Result              1 ── 0..1 ResidentFeedback
Result              1 ── * ResultAttachment
Comment             1 ── * CommentAttachment
ResidentFeedback    1 ── * FeedbackAttachment
```

`ContractorSelection 1 ── 0..1 Assignment` является hard relational cardinality и обеспечивается `UNIQUE(Assignment.selection_id)`.

## 23. Cardinalities

| Relation | Cardinality | Rule |
|---|---:|---|
| Case → Iteration | 1..* | первая при Create, следующие только rework |
| Case → Selection | 0..* | history сохраняется |
| Case → Assignment | 0..* | каждое send = новая identity |
| Case → Result | 0..* | максимум один на iteration |
| Result → Feedback | 0..1 | confirmation XOR remark |
| Case → Comment | 0..* | одна общая лента |
| Case → Event | 1..* | минимум EVT-001 |
| Result → NotificationIntent(`RESULT_READY`) | exactly 1 | после валидного SubmitResult |
| Case → current iteration | exactly 1 | `NOT NULL` после commit |
| Case → current selection | 0..1 | same-case pointer |
| Case → current assignment | 0..1 | same-case pointer |
| Case → current executor | 0..1 | только accepted current Assignment |
| Case → current result | 0..1 | same-case current Result |
| real MAX identity → ACTIVE DemoRun | 0..1 | server-authoritative current run |
| DemoRun → primary Case | 0..1 | первый/единственный primary Case run |

## 24. Required Constraints

Минимальный DB-level набор является нормативным:

1. PK для всех identity.
2. NOT NULL для обязательных immutable facts.
3. FK для всех entity relations.
4. CHECK для enum/state-consistent полей и role-binding shape.
5. `iteration_no >= 1`, `revision >= 1`, `last_event_seq >= 0`.
6. Assignment decision consistency.
7. Feedback remark consistency.
8. Completed Case closure consistency; non-completed Case не имеет closure projection.
9. Event sequence уникальна в Case.
10. Current pointers принадлежат тому же Case.
11. Result/Feedback/Comment iteration принадлежит тому же Case.
12. Result Assignment принадлежит тому же Case.
13. Feedback Result и iteration принадлежат тому же Case.
14. Organization/House/Premises/Category tenant scope согласован.
15. Typed attachment links принадлежат тому же Case; work material дополнительно согласован с iteration + Assignment.
16. `EVT_015 => result_id IS NOT NULL`.
17. `CaseEvent.command_id` всегда ссылается на `CommandExecution`.
18. Demo primary Case принадлежит тому же DemoRun.
19. `UserRoleBinding` shape:
   - UK roles: `organization_id NOT NULL`, `contractor_id NULL`;
   - contractor role: `contractor_id NOT NULL`, `organization_id NULL`;
   - role binding относится к существующему AppUser.
20. Normal `MaxIdentity` application mapping: `UNIQUE(app_user_id) WHERE app_user_id IS NOT NULL`.
21. MAX readiness CHECK/invariant: `link_status <> 'LINKED_CONFIRMED' OR (delivery_chat_id IS NOT NULL AND delivery_chat_type IS NOT NULL)`.

Cross-row lifecycle transitions остаются в domain layer под Case lock; DB не превращается в workflow engine.

## 25. Unique Constraints

Обязательные unique constraints:

```text
UNIQUE(Case.display_number)                    # если используется
UNIQUE(case_id, iteration_no) ON CaseIteration
UNIQUE(case_id, iteration_id) ON CaseIteration
UNIQUE(case_id, selection_no) ON ContractorSelection
UNIQUE(case_id, selection_id) ON ContractorSelection
UNIQUE(selection_id) ON Assignment
UNIQUE(case_id, assignment_no) ON Assignment
UNIQUE(case_id, assignment_id) ON Assignment
UNIQUE(iteration_id) ON Result
UNIQUE(case_id, result_id) ON Result
UNIQUE(result_id) ON ResidentFeedback
UNIQUE(case_id, event_seq) ON CaseEvent
UNIQUE(result_id, notification_kind) ON NotificationIntent
UNIQUE(dedupe_key) ON NotificationIntent
UNIQUE(mini_app_user_id) WHERE NOT NULL ON MaxIdentity
UNIQUE(bot_user_id) WHERE NOT NULL ON MaxIdentity
UNIQUE(app_user_id) WHERE app_user_id IS NOT NULL ON MaxIdentity
```

Idempotency principal uniqueness задаётся двумя partial unique indexes из §18.

Для `MaxIdentity` readiness дополнительно обязателен CHECK/эквивалентный DB-level constraint:

```text
CHECK(
  link_status <> 'LINKED_CONFIRMED'
  OR (delivery_chat_id IS NOT NULL AND delivery_chat_type IS NOT NULL)
)
```

Этот CHECK не делает `bot_user_id` обязательным и не вводит предположение `mini_app_user_id == bot_user_id`.

EVT-015:

```text
CHECK(event_type <> 'EVT_015' OR result_id IS NOT NULL)

UNIQUE(result_id, event_type)
WHERE event_type = 'EVT_015'
```

Для DemoRun:

```text
UNIQUE(created_by_max_identity_id)
WHERE status = 'ACTIVE'
```

тем самым у одной real MAX identity не бывает двух current ACTIVE runs.

## 26. Foreign Keys

### 26.1. Same-tenant scope — MUST

Referenced tables предоставляют composite candidate keys, и Case использует обязательные composite FK:

```text
House:      UNIQUE(organization_id, house_id)
Premises:   UNIQUE(house_id, premises_id)
Category:   UNIQUE(organization_id, category_id)

Case(organization_id, house_id)
  -> House(organization_id, house_id)

Case(house_id, premises_id)
  -> Premises(house_id, premises_id)

Case(organization_id, category_id)
  -> Category(organization_id, category_id)
```

### 26.2. Same-case current pointers — MUST

```text
Case(case_id, current_iteration_id)
  -> CaseIteration(case_id, iteration_id)

Case(case_id, current_selection_id)
  -> ContractorSelection(case_id, selection_id)

Case(case_id, current_assignment_id)
  -> Assignment(case_id, assignment_id)

Case(case_id, current_result_id)
  -> Result(case_id, result_id)
```

Nullable pointers остаются nullable; non-null pointer физически не может ссылаться на child другого Case.

### 26.3. Same-case child relations — MUST

- каждый child с `iteration_id` использует `(case_id,iteration_id) -> CaseIteration`;
- `Result(case_id,assignment_id) -> Assignment(case_id,assignment_id)`;
- ResidentFeedback ссылается на Result того же Case и согласованной iteration;
- clarification Comment context Result/Feedback относится к тому же Case/current iteration;
- attachment link `(case_id,attachment_id)` → Attachment того же Case;
- WorkMaterialAttachment дополнительно использует `(case_id,iteration_id)` и `(case_id,assignment_id)`;
- Result/Feedback/Comment attachment links используют parent same-case composite relation.

### 26.4. Case ↔ initial CaseIteration circular bootstrap — MUST

Выбран один механизм, сохраняющий `Case.current_iteration_id NOT NULL` после commit:

1. `CreateCase` заранее генерирует `case_id` и `iteration_id`;
2. `(case_id,current_iteration_id) -> CaseIteration(case_id,iteration_id)` объявляется `DEFERRABLE INITIALLY DEFERRED`;
3. Case вставляется сразу с известным `current_iteration_id`;
4. CaseIteration #1 вставляется с тем же `case_id/iteration_id`;
5. к `COMMIT` обе записи обязаны существовать и composite FK обязан пройти.

`current_iteration_id` не делается nullable как альтернативный bootstrap.

### 26.5. CaseEvent → CommandExecution

`CaseEvent.command_id -> CommandExecution.command_id` обязателен. Нормативный runtime insert order в части этого FK: idempotency reservation `CommandExecution(IN_PROGRESS)` создаётся до Case/domain writes, поэтому events могут ссылаться на `command_id`. После domain writes, projection/`Case.updated_at`, events и optional outbox общий порядок §28.1 требует сначала increment `Case.revision`, затем перевод той же execution row в `SUCCEEDED` с canonical response, содержащим post-command revision, и только затем COMMIT.

### 26.6. DemoRun ↔ Case

`Case.demo_run_id` immutable. `DemoRun.primary_case_id`, если non-null, ссылается на Case того же `demo_run_id`; для этого используется composite `(demo_run_id,case_id)` key на Case. Новый run не переписывает foreign keys старых Cases.

---

---

## 27. Immutable Fields

После insert нельзя изменять business identity/facts у:

### CaseIteration

- case;
- iteration_no;
- started_at;
- reason/source.

### ContractorSelection

- case;
- iteration;
- contractor;
- selected actor/time.

### Assignment

Immutable:

- case;
- selection;
- contractor;
- created_iteration;
- sent actor/time.

Mutable ровно один раз: decision fields `PENDING → ACCEPTED|REJECTED`.

### Result

Полностью immutable.

### ResidentFeedback

Полностью immutable.

### Comment

Полностью immutable для business history; нет edit/delete в MVP.

### Attachment

Immutable bytes/metadata после business association.

### CaseEvent

Полностью append-only.

### CommandExecution

Principal/key/hash/command identity immutable после reservation. `IN_PROGRESS → SUCCEEDED` — единственный normal status transition; после `SUCCEEDED` canonical response immutable.

---

## 28. Transaction Boundaries

### 28.1. Common Case command transaction

Нормативный порядок:

```text
authenticate / validate request
→ derive idempotency principal + canonical fingerprint
BEGIN
→ acquire CommandExecution reservation for principal/key
→ replay / key-reuse decision if duplicate
→ SELECT Case ... FOR UPDATE
→ re-resolve active authorization data
→ tenant/resource visibility check
→ terminal/state/stale checks
→ lock/read mutable configuration rows required by command
→ business preconditions
→ domain writes
→ current projection + Case.updated_at
→ append CaseEvent(s)
→ create NotificationIntent if required
→ increment Case.revision
→ CommandExecution IN_PROGRESS -> SUCCEEDED with canonical response using post-command revision
COMMIT
```

Tenant/resource authorization идёт **до** terminal/state/stale errors после Case lock, чтобы foreign tenant не получил oracle о существовании Case.

При любой ошибке до commit — никаких partial domain facts, ложных events или current state change; reservation transaction также rollback'ится.

Command-specific списки эффектов в этом документе являются **atomic logical effect set**, а не самостоятельным physical insert/update order. Нормативный физический порядок — §28.1; иной insert order допустим только если конкретный явно указанный FK/deferred-FK contract требует его внутри той же transaction.

Для `CreateCase` первая committed `Case.revision` остаётся `1`; общий шаг `increment Case.revision` означает формирование первой post-command revision из implicit pre-creation value `0`, а не `1 → 2` после insert.

### 28.2. CreateCase transaction

Case row ещё не существует. После idempotency reservation:

1. lock authoritative access/config rows в порядке §29.4;
2. revalidate Resident/access/house/premises/category;
3. в **normal mode** resolve `MaxIdentity` по Resident `app_user_id` и fail-closed, если unique mapped identity отсутствует либо не outbound-ready; ошибка — `MAX_DELIVERY_TARGET_NOT_READY`, причём до insert Case/CaseIteration/EVT-001;
4. в **DEMO_MODE** normal Resident mapping не используется: readiness recipient уже определяется explicit `DemoRun.notification_recipient_max_identity_id`;
5. получить coherent configuration snapshot;
6. pre-generate `case_id/iteration_id`;
7. insert Case + CaseIteration по deferred mechanism §26.4;
8. в DEMO_MODE atomically bind `Case.demo_run_id` к current run и установить `DemoRun.primary_case_id`, только если он ещё NULL;
9. создать initial attachments/domain facts и current projection + `Case.updated_at`;
10. append EVT-001;
11. `NotificationIntent` для CreateCase не требуется;
12. установить первую post-command `Case.revision = 1` в семантике общего шага increment;
13. finalize `CommandExecution` canonical response с этим revision и commit.

### 28.3. Outbound MAX

MAX network call никогда не выполняется внутри Case transaction. Worker использует отдельный durable claim/lease protocol §19.4.

### 28.4. Cross-case transactions

Product business command одного Case не мутирует другой Case. Demo run creation/archive и team-only notification reconciliation — technical operations, не product commands.

## 29. Concurrency Rules

Основной Case consistency mechanism:

> **короткая PostgreSQL transaction + `SELECT ... FOR UPDATE` по Case + повторная validation + exact target identities + DB constraints.**

Отдельные bounded locks нужны только для тех ресурсов, для которых Case lock не может решить задачу: idempotency principal/key, mutable configuration и DemoRun currentness.

### 29.1. Required target identities

- Send Assignment → `selection_id`;
- Accept/Reject → `assignment_id`;
- Add Result Material → `assignment_id`, `iteration_id`;
- Submit Result → `assignment_id`, `iteration_id`, material IDs;
- Resident feedback → `result_id`, `iteration_id`;
- no-feedback → `result_id`;
- clarification/rework/disputed completion → exact `result_id + feedback_id`; iteration derives from immutable entities and must equal current;
- normal completion → exact current Result + exact completion basis.

### 29.2. First valid wins

После Case row lock второй concurrent request перечитывает committed current context. Если target/state больше не актуальны, он отклоняется как stale/conflict; автоматически применять его к новому Assignment/Result запрещено.

### 29.3. Per-request authorization revalidation

Signed session token не является вечным snapshot rights. Каждый protected read, а mutation — внутри transaction, re-resolve:

- `AppUser.active`;
- selected `UserRoleBinding.active`;
- organization/contractor binding;
- `ResidentPremisesAccess.active`;
- `UKHouseAccess.active`;
- DemoRun/DemoRunActor и run ownership/status, если demo.

Revocation/disable влияет на **следующий request**, не ждёт token expiry.

### 29.4. Configuration concurrency / lock order

Выбран row-lock protocol. Все commands, зависящие от active configuration, и все configuration writers используют совместимые locks.

Global order:

1. idempotency principal/key reservation;
2. Case row, если Case уже существует;
3. Organization;
4. House;
5. Premises;
6. Category;
7. Contractor;
8. OrganizationContractor;
9. access/binding rows в stable primary-key order;
10. child writes.

- `CreateCase` удерживает relevant House/Premises/Category/access rows до commit, поэтому snapshot не смешивает config revisions и concurrent deactivation не может «обогнать» уже validated create.
- `SelectContractor/SendAssignment` под Case lock дополнительно lock/revalidate Contractor + OrganizationContractor before effect.
- config writer берёт те же relevant rows `FOR UPDATE` в том же порядке.
- Case snapshot configuration фиксируется из одного locked coherent set.

`revision` не заменяет эти locks.

---

---

## 30. Iteration Rules

1. Case создаётся с iteration 1.
2. Только `ReturnToRework` создаёт N+1.
3. Отказ Assignment не увеличивает iteration.
4. Выбор/отправка/принятие нового contractor внутри текущей rework iteration не увеличивает iteration.
5. Result принадлежит iteration, в которой он submitted.
6. Feedback принадлежит Result и той же iteration.
7. Comment привязан к current iteration на момент создания.
8. Старые iterations остаются read-only history.
9. После перехода N→N+1 `Case.current_result_id = NULL`.
10. Accepted Assignment и current executor **сохраняются**, если УК не выбирает другого contractor.
11. Если УК выбирает другого contractor в `REWORK`, current executor authority снимается немедленно, но old Assignment остаётся `ACCEPTED` historical fact.
12. Result N+1 может ссылаться на Assignment, созданный в iteration N.

---

## 31. Assignment Rules

### 31.1. Selected

Selection создаёт только УК и не даёт подрядчику никаких live permissions.

### 31.2. Sent

Send создаёт новый Assignment и state `SENT_TO_CONTRACTOR`. Только exact current Assignment доступен contractor для accept/reject.

### 31.3. Accepted

После accepted:

- Assignment decision = ACCEPTED;
- Case.current_executor = contractor;
- Case state = `EXECUTION`;
- contractor получает current executor permissions.

### 31.4. Rejected

После rejected:

- Assignment history сохраняется;
- reason immutable;
- Case state = `ACCEPTED_BY_UK`;
- current assignment/executor/selection очищаются;
- iteration unchanged;
- старый contractor не имеет дальнейшего LIVE-access.

### 31.5. Rework same contractor

Не создаёт новый acceptance автоматически. Existing accepted current Assignment остаётся основанием executor authority.

### 31.6. Rework different contractor

`SelectContractor` в `REWORK`:

- contractor должен отличаться от current executor;
- создаёт new Selection;
- current old assignment/executor очищаются;
- state остаётся `REWORK`;
- затем требуется new Send → new Assignment → new Accept.

---

## 32. Result / Feedback Rules

### Result

- максимум один valid Result на iteration;
- text обязателен;
- configured material обязателен;
- только current executor;
- exact assignment/current iteration;
- success → state `AWAITING_RESULT_CHECK` + EVT-008 + notification intent.

### Confirmation

- unique feedback по current Result;
- creates EVT-010;
- state остаётся `AWAITING_RESULT_CHECK`;
- Case не закрывается.

### Remark

- unique feedback;
- nonempty text;
- creates EVT-011;
- state → `REMARKS_REVIEW`.

### No feedback

- не является автоматически inferred confirmation;
- фиксируется только явной UK command в допустимом context;
- creates unique EVT-015 с non-null current `result_id`;
- state остаётся `AWAITING_RESULT_CHECK`;
- наличие EVT-015 **не является само по себе** достаточным основанием завершения;
- no-feedback completion требует отдельного explicit UK process completion basis, зафиксированного командой completion;
- universal timer/auto-close не вводится.

### Completion

- normal completion creates EVT-016;
- для `NO_RESIDENT_FEEDBACK` EVT-016 presentation/audit data фиксирует отдельный explicit completion basis, отличный от basis записи EVT-015;
- disputed remark completion requires explanation and creates EVT-017, не EVT-016;
- only UK roles;
- state `COMPLETED` terminal.

---

## 33. Configuration History

### 33.1. ConfigurationChange — mandatory persisted audit

Каждый successful configuration write UK_ADMIN обязан в **той же transaction** создать append-only record:

```text
ConfigurationChange
- config_change_id UUID PK
- organization_id UUID FK -> Organization NOT NULL
- entity_type text NOT NULL
- entity_id UUID NOT NULL
- action text NOT NULL
- before_data jsonb NULL
- after_data jsonb NOT NULL
- actor_user_id UUID FK -> AppUser NOT NULL
- occurred_at timestamptz NOT NULL
- command_id UUID FK -> CommandExecution NOT NULL
```

Это MUST persisted contract, не recommendation. `ConfigurationChange` не является `CaseEvent` и не входит в Case state machine.

Audit обязателен для:

- basic Organization update;
- House create/update;
- Category create/update;
- contractor directory/binding activation/deactivation;
- default contractor update;
- permitted role assignment заранее созданному AppUser;
- contractor employee binding/configuration.

Audit не создаёт HR lifecycle, invitations, recovery или offboarding.

### 33.2. Snapshot rule

Существующий Case использует snapshot конфигурации, записанный при creation. Изменение Category/default contractor применяется к новым Cases и не переписывает прежние requirements/history.

### 33.3. Concurrency

Config writes используют row locks и lock order §29.4. Это один нормативный protocol для конфигурации и commands, которые её читают.

---

---

## 34. Authorization-Relevant Data

Authorization нельзя вычислять только из role или signed token claims.

Для каждого protected read backend заново читает authoritative active rows; для mutation это выполняется внутри transaction после Case lock и **до** раскрывающих terminal/state/stale ошибок.

Минимум:

- effective `app_user_id` и `AppUser.active`;
- selected `UserRoleBinding` и `active`;
- binding organization/contractor scope;
- Case.organization_id;
- Case.house_id / premises_id;
- `ResidentPremisesAccess.active`;
- `UKHouseAccess.active`;
- `OrganizationContractor.active`, когда релевантно;
- `Case.current_state`;
- current iteration/selection/assignment/executor/result;
- Assignment contractor/membership;
- Result/Feedback identity;
- в DEMO_MODE: `Case.demo_run_id`, current `DemoRun`, `DemoRunActor`, real MAX owner;
- terminal guard после visibility/authorization.

Foreign tenant/resource возвращается как hidden `404`; server не должен сначала выдавать `TERMINAL_CASE`, `STALE_*` или другие existence-sensitive errors.

Жителю exact reject reason не выдаётся; role-forbidden поля исключаются из server read model, а не скрываются CSS.

---

---

## 35. DEMO_MODE Data

### 35.1. DemoRun

`DemoRun` — test/demo security boundary, не product entity и не product state.

```text
DemoRun
- demo_run_id UUID PK
- scenario_key text NOT NULL
- status DemoRunStatus NOT NULL
- created_by_max_identity_id UUID FK -> MaxIdentity NOT NULL
- notification_recipient_max_identity_id UUID FK -> MaxIdentity NOT NULL
- primary_case_id UUID NULL
- created_at timestamptz NOT NULL
- archived_at timestamptz NULL
```

Rules:

- у одной real MAX identity максимум один `ACTIVE` run — partial unique §25;
- Start DemoRun serializes on real `MaxIdentity`, archives previous ACTIVE run without modifying its Case/history, then creates new ACTIVE run;
- bootstrap resolves current run server-side by real validated MAX identity;
- new mutations require current run `ACTIVE`.

### 35.2. DemoRunActor

```text
DemoRunActor
- demo_run_id UUID FK -> DemoRun
- app_user_id UUID FK -> AppUser
- role Role NOT NULL
- actor_alias text NOT NULL
PRIMARY KEY(demo_run_id, app_user_id)
UNIQUE(demo_run_id, role, actor_alias)
```

Seed может содержать Resident, UK employee, UK admin, Contractor A employee и Contractor B employee. Это **пять synthetic actors, но ровно четыре Product role views**; оба contractor actors имеют `CONTRACTOR_EMPLOYEE`.

Frontend выбирает только role view. Backend выбирает конкретного contractor actor из current run/primary Case/current pending Assignment/current executor; frontend не повторяет эту domain rule.

### 35.3. DemoRun ↔ Case scope

- Demo Case всегда получает `Case.demo_run_id = session.demo_run_id` при CreateCase.
- Первый Case run atomically становится `DemoRun.primary_case_id`; случайный второй primary Case запрещён.
- Case list/snapshot/activity/attachment read в current demo flow требует `Case.demo_run_id == session.demo_run_id`.
- Любая Case mutation под lock повторно проверяет same run.
- Archived/old run не мутируется из нового current run.
- Reload и новый web/mobile bootstrap восстанавливают server-authoritative current run/primary Case, а не создают новый автоматически.

### 35.4. Real vs effective identity

Session знает real validated MAX identity, current DemoRun и effective synthetic actor. Signed token не заменяет per-request revalidation §29.3.

### 35.5. Notification recipient

`DemoRun.notification_recipient_max_identity_id` должен иметь validated usable `delivery_chat_id/type`. Реальное MAX notification уходит этой real MAX identity; synthetic Resident остаётся business actor.

### 35.6. Repeat demo

```text
DemoRun #1 → Case A → COMPLETED/immutable
Start DemoRun #2 → archive #1 → Case B
```

Case A/history не rewind/reset/delete. Новый run не является destructive product reset.

---

---

## 36. Seed Requirements

Deterministic seed должен создать минимум:

- одну synthetic Organization;
- один active House;
- одно active Premises;
- synthetic Resident;
- synthetic UK employee;
- synthetic UK admin;
- Contractor A и B;
- по одному employee каждой contractor organization;
- две active Category;
- default contractor mapping;
- required role/access bindings;
- aliases/business keys для reproducible lookup.

Seed не обязан создавать основной Case: предпочтительно, чтобы основной demo начинался normal `CreateCase` Resident actor.

Seed:

- выполняется после migrations;
- идемпотентен;
- не зависит от случайных numeric PK;
- не содержит реальных персональных данных;
- не создаёт fake CRM/ГИС facts.

### 36.1. Maintenance reseed

Отдельная team-only destructive command допустима только:

- при `DEMO_MODE=true`;
- в явно non-production/demo environment;
- только для synthetic demo tenant/run data;
- вне product API/action model;
- без rollback migrations;
- с явным audit/log warning.

Она является recovery mechanism, а не способом повторить завершённый Case.

---

## 37. Data Invariants Mapping

| Product invariant | Data-model enforcement |
|---|---|
| Один Case / постоянный ID | immutable `Case.case_id`; rework создаёт Iteration, не Case |
| Ровно 8 states | closed CaseState enum |
| `COMPLETED` terminal | domain terminal guard + no mutation endpoints after terminal |
| Immutable history | immutable child records + append-only CaseEvent |
| selected ≠ sent ≠ accepted | separate Selection, Assignment, Assignment decision |
| Current executor only after accepted | Case.current_executor set только AcceptAssignment |
| Old contractor loses LIVE access | authorization reads current executor/current assignment, not historical accepted row |
| Reject does not create new Case/iteration | Assignment rejected + projection to ACCEPTED_BY_UK |
| Iteration increments only rework | CaseIteration insert exists only ReturnToRework domain path |
| Same contractor rework without re-accept | current accepted Assignment/executor preserved into N+1 |
| New contractor in rework full chain | new Selection → Assignment → Accept |
| Contractor Result ≠ physical fact | separate immutable Result entity, ResidentFeedback later |
| Feedback targets Result | non-null result FK + current-result validation |
| Confirmation does not close | no state change in ResidentConfirmation |
| One feedback branch | `UNIQUE(result_id)` |
| New Result preserves old | Result immutable + unique per iteration, current pointer only |
| Old Result no new feedback | current iteration/result precondition |
| Only UK completes | RoleBinding authorization on completion commands |
| One comment feed | one Comment entity, no private channel visibility field |
| Organization/house isolation | scope FKs + role/access relations + server filters |
| Stale action protection | exact IDs + Case lock + current pointers |
| Duplicate request safety | discriminated principal + CommandExecution reservation/partial unique principal/key |
| Duplicate result safety | state revalidation + `UNIQUE(iteration_id)` |
| Duplicate EVT-015 safety | non-null result CHECK + partial unique per Result/event type |
| Config changes do not rewrite history | coherent locked Case config snapshot + mandatory ConfigurationChange audit |
| Original attachments same-case | typed composite link integrity |
| Activity no duplicate facts | projection anchored one item per CaseEvent.event_id |
| No-feedback completion | EVT-015 separate from explicit UK completion basis |
| Revocation next request | authoritative active bindings/access revalidated per request |
| Real notification without duplicate Result | validated chat target + unique Result/kind intent + transactional outbox claim/lease |
| Synthetic repeatable demo | one current DemoRun per real identity + run-scoped Case/attachments; new run/new Case |

---

# Final Data Model Status

**SPEC CONFLICTS: 0.**

Эта final-candidate модель точечно закрывает `TCR-MAJ-001` и `TCR-MIN-001` поверх ранее принятых fixes и предназначена для final targeted recheck. SQL migrations намеренно не входят в этот документ; coding остаётся заблокирован до отдельного gate PASS.

**STATUS: READY FOR FINAL TARGETED RECHECK.**
