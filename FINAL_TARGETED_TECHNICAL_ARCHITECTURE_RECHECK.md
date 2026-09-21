# FINAL TARGETED TECHNICAL ARCHITECTURE RECHECK

**Проект:** MAX Hackathon 2026 — трек «Умный город»  
**Тип review:** FINAL TARGETED RECHECK  
**Baseline SHA:** `03bbece0fe40b24e4c2cdbbc5b8800bc14e82920`  
**Дата:** 21 сентября 2026  

**Scope:** только `TCR-MAJ-001`, `TCR-MIN-001` и локальные cross-document регрессии, которые могли быть созданы этими двумя fixes. Ранее закрытые findings не переоткрывались без новой конкретной regression evidence.

Проверены final candidate documents:

- `docs_03_ARCHITECTURE_FINAL_CANDIDATE.md`;
- `docs_04_DATA_MODEL_FINAL_CANDIDATE.md`;
- `docs_05_INTERFACE_CONTRACTS_FINAL_CANDIDATE.md`;
- `FINAL_TWO_FINDINGS_RESOLUTION.md`;
- предыдущий `TARGETED_TECHNICAL_ARCHITECTURE_CLOSURE_REVIEW.md`.

Для локальной проверки Product invariants дополнительно сверены нормативные документы repository на baseline SHA:

- `docs/01_PRODUCT_FREEZE.md`;
- `docs/02_PRODUCT_SPEC.md`.

---

## 1. VERDICT

# **PASS**

# **TECHNICAL ARCHITECTURE GATE: PASS**

Итоговые counts:

| Severity | Count |
|---|---:|
| BLOCKER | **0** |
| MAJOR | **0** |
| MINOR | **0** |
| SPEC CONFLICTS | **0** |

Оба остаточных finding предыдущего Targeted Closure Review закрыты буквально и согласованно во всех трёх final-candidate документах.

Последние fixes не создали новой `BLOCKER` / `MAJOR` regression и не оставили semantic choice, который coding-agent должен был бы разрешать самостоятельно.

---

## 2. TCR-MAJ-001

**Status: CLOSED**

Предыдущий finding требовал закрыть ровно четыре materially связанные части normal-mode mandatory notification path:

1. deterministic relation `Case.resident_user_id -> exact outbound MaxIdentity`;
2. DB-level cardinality/readiness invariants;
3. early fail-closed readiness gate на `CreateCase`;
4. сохранение defensive recheck на `SubmitResult`, без поломки DEMO_MODE и без предположения `mini_app_user_id == bot_user_id`.

Все четыре части закрыты.

### Evidence: Architecture

`docs_03_ARCHITECTURE_FINAL_CANDIDATE.md`:

- L287–296: явно запрещено предположение `Mini App user.id == Bot API user_id`; обязательный delivery binding — validated `chat.id`, полученный из server-validated signed `initData`.
- L298: закреплены оба data invariant: максимум один mapped `MaxIdentity` на `AppUser` и `LINKED_CONFIRMED => delivery_chat_id/type NOT NULL`; delivery values остаются производными только от validated signed `initData`.
- L300: normal-mode recipient определён как **единственный outbound-ready `MaxIdentity`, mapped к `Case.resident_user_id`**; `first/latest/arbitrary/LINKED_CONFIRMED selector` прямо запрещён.
- L300: `NotificationIntent` snapshot'ит validated `delivery_chat_id/type` exact recipient identity.
- L302: normal `CreateCase` проверяет readiness **до** `Case`, `CaseIteration #1`, initial business facts и EVT-001; failure — `MAX_DELIVERY_TARGET_NOT_READY`.
- L302: `SubmitResult` сохраняет отдельный defensive current recheck перед Result/EVT-008/NotificationIntent.
- L304: DEMO_MODE recipient остаётся explicit `DemoRun.notification_recipient_max_identity_id`.
- L306: equality `mini_app_user_id == bot_user_id` не вводится.
- L785–796: notification section повторяет exact normal/demo recipient semantics и создаёт outbox intent только после defensive recheck; intent сохраняет snapshot exact validated delivery target.

**Architecture conclusion:** requirement A/D/E/F/G/H/I выполнены без selector ambiguity.

### Evidence: Data Model

`docs_04_DATA_MODEL_FINAL_CANDIDATE.md`:

- L282: обязательная outbound-доставка основана на validated signed `initData`, а не на равенстве Mini App и Bot API user IDs.
- L300: `mini_app_user_id`, `delivery_chat_id`, `delivery_chat_type` записываются только из server-validated `window.WebApp.initData`.
- L302 и L1148, а также L1174: нормативно задан DB-level partial unique:
  ```text
  UNIQUE(app_user_id)
  WHERE app_user_id IS NOT NULL
  ```
- L303 и L1149, а также L1179–1186: нормативно задан CHECK/эквивалентный DB-level readiness constraint:
  ```text
  link_status <> 'LINKED_CONFIRMED'
  OR (delivery_chat_id IS NOT NULL AND delivery_chat_type IS NOT NULL)
  ```
- L305: `bot_user_id` optional и не участвует в MUST notification addressing; equality не предполагается.
- L307: normal-mode recipient = единственный outbound-ready mapped identity; `first/latest/arbitrary` запрещены.
- L308: demo recipient определяется `DemoRun.notification_recipient_max_identity_id`, а не mapping synthetic Resident.
- L960–966: `NotificationIntent` физически содержит `recipient_max_identity_id`, `delivery_chat_id`, `delivery_chat_type`, все обязательные для intent.
- L1001: `SubmitResult` выполняет defensive current readiness recheck exact recipient и snapshot'ит `recipient_max_identity_id + delivery_chat_id/type`.

**Data Model conclusion:** requirements B/C/D/E/H/I обеспечены как физический data contract, а не только prose expectation.

### Evidence: Interface

`docs_05_INTERFACE_CONTRACTS_FINAL_CANDIDATE.md`:

- L112–118: auth bootstrap извлекает validated `user.id + chat.id/chat.type`; `LINKED_CONFIRMED` допустим только с non-null target; DB mapping допускает максимум один `MaxIdentity` на `AppUser`; equality `user.id == bot_user_id` запрещена.
- L654–669: normal `CreateCase` до `Case`, `CaseIteration`, initial attachment/business rows и EVT-001 обязан resolve exact Resident mapping и проверить `LINKED_CONFIRMED + delivery_chat_id/type`; отсутствие/неготовность → `409 MAX_DELIVERY_TARGET_NOT_READY`; `first/latest/arbitrary` прямо запрещены.
- L669: normal mapping gate **не применяется** к synthetic Resident в DEMO_MODE; demo recipient остаётся explicit field current DemoRun.
- L1227–1231: `SubmitResult` выполняет defensive current recheck exact normal/demo recipient до Result/EVT-008/NotificationIntent.
- L1235: intent сохраняет exact `recipient_max_identity_id` и snapshot validated `delivery_chat_id/type`.
- L2256–2260: Notification Contract повторяет те же semantics без расхождения.

**Interface conclusion:** requirements A/F/G/H/I закрыты буквально; нет позднего-only readiness check и нет выбора recipient semantics.

### TCR-MAJ-001 closure result

# **TCR-MAJ-001 = CLOSED**

Причина предыдущего `MAJOR` устранена именно минимальным способом, требовавшимся прошлым review:

- one-to-zero/one mapping на DB-level;
- readiness CHECK;
- early normal-mode `CreateCase` gate;
- exact recipient contract;
- retained `SubmitResult` recheck;
- unchanged demo explicit recipient.

Новая MAX platform semantics не вводилась. Поэтому новый MAX research для этого recheck не требовался.

---

## 3. TCR-MIN-001

**Status: CLOSED**

Предыдущий finding был вызван тем, что три документа называли разный physical order нормативным. В final candidate этот конфликт устранён.

### Evidence: Architecture

`docs_03_ARCHITECTURE_FINAL_CANDIDATE.md`, L398–427:

Нормативный physical order теперь:

```text
domain writes
→ current projection + Case.updated_at
→ CaseEvent(s)
→ NotificationIntent if required
→ increment Case.revision
→ finalize CommandExecution canonical response using post-command revision
→ COMMIT
```

Дополнительно:

- L400–404: `CommandExecution(IN_PROGRESS)` reservation создаётся до lifecycle/domain validation;
- L425: command-specific effect lists объявлены `atomic logical effect set`, а не альтернативным physical order;
- L427: для `CreateCase` первая committed revision прямо фиксируется как `1`, а не `2`.

### Evidence: Data Model

`docs_04_DATA_MODEL_FINAL_CANDIDATE.md`:

- L1271: `CaseEvent.command_id -> CommandExecution.command_id` совместим с новым order, потому что `CommandExecution(IN_PROGRESS)` существует **до** Case/domain writes и event insert; после event/outbox идут revision и canonical finalization.
- L1341–1361: общий normative transaction order буквально совпадает с Architecture и Interface.
- L1368: command-specific lists — atomic logical set, не самостоятельный physical order.
- L1370: первая committed `CreateCase` revision = `1`.
- L1372–1388: CreateCase-specific transaction сохраняет reservation-first semantics, readiness gate до Case writes, deferred Case/Iteration bootstrap, EVT-001, затем `revision = 1`, canonical response и commit.

### Evidence: Interface

`docs_05_INTERFACE_CONTRACTS_FINAL_CANDIDATE.md`:

- L2305–2324: Stale Action Contract повторяет тот же physical order.
- L2455–2475: §33 задаёт один normative physical order:
  ```text
  domain writes
  → current projection + Case.updated_at
  → CaseEvent(s)
  → NotificationIntent if required
  → increment Case.revision
  → finalize CommandExecution canonical success using post-command revision
  → commit
  ```
- L2477: все command-specific `Transaction effect` sections — atomic logical effect sets и не переопределяют §33.
- L2479: `CreateCase` canonical success содержит revision `1`; общий revision-step трактуется как первая committed revision из implicit pre-creation `0`, не `1 -> 2`.
- L688 и L701: CreateCase-specific contract также возвращает `revision: 1` и прямо ссылается на общий order.
- L1235: SubmitResult-specific section использует тот же physical order и canonical post-command revision.

### Command-specific effect lists

Локально проверены command-specific `Transaction effect` blocks, включая `ReturnToRework`, где логические эффекты перечислены отдельным списком. §33 Interface, §28.1 Data Model и §9.4 Architecture теперь явно имеют приоритет как **единственный physical order**.

Поэтому списки вида:

```text
append EVT
create/update domain entities
store command
revision++
```

не создают второго normative insert/update order: это только atomic effect set. Coding-agent больше не должен выбирать между двумя нормативными последовательностями.

### CreateCase revision

Риск `revision = 2` закрыт тройным образом:

- Architecture L427;
- Data Model §28.1/§28.2;
- Interface L2479 + CreateCase success L701.

Первая committed revision нормативно равна **1**.

### TCR-MIN-001 closure result

# **TCR-MIN-001 = CLOSED**

---

## 4. Cross-Document Propagation

| Required semantic | Architecture | Data Model | Interface | Result |
|---|---|---|---|---|
| Normal recipient = unique outbound-ready mapped MaxIdentity | explicit | explicit + DB cardinality | explicit | **CONSISTENT** |
| No selector `first/latest/arbitrary` | explicit prohibition | explicit prohibition | explicit prohibition | **CONSISTENT** |
| `UNIQUE(app_user_id) WHERE app_user_id IS NOT NULL` | references invariant | physical required constraint | relies on DB constraint | **CONSISTENT** |
| `LINKED_CONFIRMED => delivery_chat_id/type NOT NULL` | explicit invariant | physical CHECK/equivalent | auth/CreateCase checks | **CONSISTENT** |
| chat target only from validated signed initData | explicit | explicit | explicit | **CONSISTENT** |
| no `mini_app_user_id == bot_user_id` assumption | explicit | explicit | explicit | **CONSISTENT** |
| normal CreateCase early readiness gate | explicit | §28.2 | explicit error contract | **CONSISTENT** |
| demo synthetic Resident bypasses normal mapping gate | explicit | explicit | explicit | **CONSISTENT** |
| SubmitResult defensive current recheck | explicit | explicit | explicit | **CONSISTENT** |
| NotificationIntent snapshots exact identity + chat target | explicit | physical fields + creation rule | explicit | **CONSISTENT** |
| one normative physical transaction order | §9.4 | §28.1 | §29/§33 | **CONSISTENT** |
| reservation before lifecycle/domain validation | explicit | explicit | explicit | **CONSISTENT** |
| CaseEvent.command_id FK compatible with order | explicit reservation model | explicit immediate-FK rationale | reservation precedes event | **CONSISTENT** |
| canonical response uses post-command revision | explicit | explicit | explicit | **CONSISTENT** |
| CreateCase first committed revision = 1 | explicit | explicit | explicit | **CONSISTENT** |

Cross-document propagation is complete. Ни одна из двух правок не осталась только в одном документе.

---

## 5. Local Regression Check

Проверялись только регрессии, которые могли логически возникнуть из fixes `TCR-MAJ-001` и `TCR-MIN-001`.

### 5.1. Product states

**PASS.**

Architecture L646–655 и Data Model §1.3 сохраняют ровно 8 product states:

1. `CREATED`;
2. `ACCEPTED_BY_UK`;
3. `SENT_TO_CONTRACTOR`;
4. `EXECUTION`;
5. `AWAITING_RESULT_CHECK`;
6. `REMARKS_REVIEW`;
7. `REWORK`;
8. `COMPLETED`.

Baseline Product Spec на SHA `03bbece0...` также требует ровно восемь состояний и запрещает девятое.

### 5.2. Roles

**PASS.**

Data Model сохраняет ровно 4 прикладные роли:

- `RESIDENT`;
- `UK_EMPLOYEE`;
- `UK_ADMIN`;
- `CONTRACTOR_EMPLOYEE`.

Architecture L545–552 и Interface demo contract сохраняют ровно четыре role views. Contractor A/B остаются actors одной роли, а не новыми ролями.

### 5.3. DemoRun semantics

**PASS.**

Fix normal-mode recipient не переопределяет demo relation:

```text
DemoRun.notification_recipient_max_identity_id
```

остаётся explicit recipient.

Synthetic Resident не обязан иметь normal mapped `MaxIdentity`. Architecture L304/L611, Data Model L308 и Interface L669/L2258 согласованы.

### 5.4. Notification addressing

**PASS.**

Обязательная доставка всё ещё использует validated `chat.id/type`, полученные из signed MAX initData. Fix не вернул `user.id == bot_user_id` и не ввёл новый transport mechanism.

### 5.5. No fake MAX integration

**PASS.**

`NotificationIntent` означает queued durable outbox, а не фактическую доставку. MAX network call остаётся вне Case transaction. Runtime delivery proof остаётся отдельной live verification задачей.

### 5.6. CreateCase idempotency

**PASS.**

`CommandExecution(IN_PROGRESS)` reservation по-прежнему создаётся раньше readiness/lifecycle/domain validation. Early readiness gate вставлен после reservation и до Case/domain writes; он не создаёт второй idempotency mechanism и не позволяет создать Case до проверки recipient readiness.

Нормативный CreateCase response по-прежнему использует один `command_id`, один `case_id` и первую committed `revision = 1`.

### 5.7. Normal readiness check vs demo synthetic Resident

**PASS.**

Normal readiness gate явно ограничен `DEMO_MODE=false`.

В `DEMO_MODE=true` synthetic Resident не обязан иметь mapped normal `MaxIdentity`; readiness относится к explicit current DemoRun recipient.

### 5.8. SubmitResult / outbox semantics

**PASS.**

Последний fix не изменил:

- Result immutability;
- EVT-008 semantics;
- exactly-one `NotificationIntent(result_id, RESULT_READY)`;
- durable outbox;
- MAX call after commit;
- claim/lease worker;
- at-least-once external delivery semantics.

Изменён только deterministic recipient resolution/readiness.

### 5.9. CaseEvent.command_id FK

**PASS.**

Data Model L861 и L1271 сохраняют обязательный FK:

```text
CaseEvent.command_id -> CommandExecution.command_id
```

Он совместим с final transaction order, потому что `CommandExecution(IN_PROGRESS)` reservation создаётся до Case/domain writes и до CaseEvent insert.

### 5.10. Canonical response / post-command revision

**PASS.**

Во всех трёх документах canonical response финализируется **после** формирования post-command `Case.revision`.

CreateCase имеет отдельную однозначную семантику первой revision `1`.

### Local regression result

# **New local BLOCKER/MAJOR regression: 0**

# **New local MINOR semantic regression: 0**

---

## 6. Remaining Findings

**Нет.**

| ID | Status |
|---|---|
| `TCR-MAJ-001` | **CLOSED** |
| `TCR-MIN-001` | **CLOSED** |

Remaining counts:

- **BLOCKER = 0**
- **MAJOR = 0**
- **MINOR = 0**

Ни один ранее закрытый finding не переоткрывается: evidence новой regression, вызванной двумя последними fixes, не обнаружено.

---

## 7. Runtime Live Verification Items

Следующие пункты **не являются architecture defects** и не влияют на PASS этого final targeted recheck:

- фактическая proactive MAX notification;
- mobile MAX E2E;
- web MAX E2E;
- сохранение same current DemoRun / primary Case между mobile и web;
- deployed webhook secret verification;
- deployed HTTPS/443/certificate behavior;
- subscription loss/recreate;
- operational redrive;
- native MAX `downloadFile`;
- web attachment download;
- public HTTPS hosting;
- deployed `/api/v1/system/info.build_sha`;
- Docker build/restart/persistence.

Эти пункты требуют runtime/delivery evidence позже. Final candidate уже определяет architecture semantics достаточно однозначно; отсутствие live proof на текущем gate не превращается в `FIX REQUIRED`.

---

## 8. SPEC CONFLICTS

# **SPEC CONFLICTS = 0**

Обе последние правки являются технической детерминизацией уже утверждённого продукта:

- `TCR-MAJ-001` делает mandatory MAX notification recipient однозначным и fail-closed достаточно рано;
- `TCR-MIN-001` унифицирует physical transaction order.

Они не меняют Product Freeze / Product Spec, не добавляют состояние, роль, новую product branch, auto-close или fake integration.

---

## 9. FINAL GATE DECISION

# **TECHNICAL ARCHITECTURE GATE: PASS**

Подтверждается отдельно:

- **TCR-MAJ-001 = CLOSED;**
- **TCR-MIN-001 = CLOSED;**
- **Architecture Final Candidate = ACCEPTED;**
- **Data Model Final Candidate = ACCEPTED;**
- **Interface Contracts Final Candidate = ACCEPTED;**
- **SPEC CONFLICTS = 0;**
- **repository architecture closure is allowed;**
- **Task Graph ещё не начинается до canonical repo update и нового stable SHA;**
- **Coding ещё не начинается.**

Текущий final targeted technical architecture recheck завершён.

**Следующий допустимый шаг:** canonical repository architecture closure с фиксацией принятых final-candidate документов и нового stable SHA. Только после этого может начинаться Task Graph. Coding на текущем SHA по-прежнему не начинается.

---

**END OF FINAL TARGETED TECHNICAL ARCHITECTURE RECHECK**
