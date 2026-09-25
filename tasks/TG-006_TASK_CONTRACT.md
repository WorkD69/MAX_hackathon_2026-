# TG-006 TASK CONTRACT

> Lean Task Contract (Wave 2+). Статус контракта: **AUTHORED** — готов к одному independent review (CRITICAL flow).
> Репо-относительные пути считаются от корня `https://github.com/WorkD69/MAX_hackathon_2026-`.
> Контракт фиксирует WHAT / BOUNDARIES / ACCEPTANCE; построчного implementation pseudocode не содержит.

## 1. Identity / BASE_SHA

```text
TASK_ID        = TG-006
TITLE          = Case aggregate, history и workflow schema
TYPE           = DATA
EXECUTION_CLASS = A — Implementation
RISK_CLASS     = CRITICAL
WAVE           = WAVE 2
LANE           = LANE-B
BASE_SHA       = 0332bf029ab12a1217f1aef5f6bf0f26e6a2faca
```

`BASE_SHA` — стабильный `main` после Wave 1 (`docs(governance): Adopt lean SDD from Wave 2`).
Перед началом implementation-агент сверяет `git rev-parse HEAD` выбранной ветки с полным `BASE_SHA`
(сокращения запрещены); несоответствие — `BASELINE_MISMATCH`, стоп.

## 2. Goal

Реализовать canonical relational Case модель и все same-case / current-pointer / immutability constraints
в PostgreSQL и не расширять их поверхностную семантику:

- ровно 8 product states; `CaseIteration`, `ContractorSelection`, `Assignment`, `Result`, `ResidentFeedback`,
  `Comment`, `CaseEvent` как отдельные immutable business records;
- deferred circular `Case ↔ CaseIteration` FK при `Case.current_iteration_id NOT NULL` после commit;
- same-case composite keys/FKs, отвергающие cross-Case ссылки;
- DB-level immutability: Result, ResidentFeedback, Comment, CaseIteration identity, ContractorSelection identity,
  immutable Assignment identity, one-way Assignment decision, append-only CaseEvent;
- event sequencing + `EVT-015` invariant;
- легальный accepted Assignment из iteration `N`, обосновывающий Result iteration `N+1`.

Результат — детерминированная аппендинг-миграция `0002_case_workflow` поверх immutable `0001_foundation`,
Kysely type surface (13 → 21 таблиц) и real-PostgreSQL constraint suite. Операционные таблицы
(attachments, CommandExecution, NotificationIntent, ConfigurationChange) **не** создаются — собственность TG-007.

## 3. Canonical sources

Все источники читаются из immutable checkout на exact `BASE_SHA`; приоритет по AGENTS.md. Только необходимые разделы:

1. `AGENTS.md` — правила контрактов, `BASE_SHA`, file ownership, Git identity, commit/push.
2. `tasks/TASK_GRAPH.md` § 3 (TG-006 verbatim definition), § 2 (scope lock, lanes) — норматив identity задачи.
3. `tasks/BACKLOG.md` — risk-class workflow (CRITICAL), запрет review-артефактов в repository.
4. `tasks/TASK_TEMPLATE.md` — структура Lean контракта.
5. `docs/04_DATA_MODEL.md` §§ 1–2, 9–18, 20–32, 26.4–26.6 — сущности, инварианты, unique/FK/immutability,
   current projection, iteration rules, Result/Feedback rules, transaction/concurrency; § 1.3 — ровно 8 states.
6. `docs/02_PRODUCT_SPEC.md` §§ 3–6, 13–17, 23 — EVT-001…EVT-017, инварианты, AC (для семантики событий и
   состояний; TG-006 не реализует state machine).
7. `docs/03_ARCHITECTURE.md` §§ 13–17 — Case/event/result persistence boundary.
8. `docs/07_DECISIONS.md` ADR-010 (Case как consistency boundary), ADR-011 (история = append-only CaseEvent);
   при необходимости ADR-016/017/020 по смежным границам.
9. `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md` — W2 как NEXT_EXECUTABLE_WAVE; lean flow CRITICAL.
10. `tasks/TG-005_TASK_CONTRACT.md` § 6–7 (naming/ownership precedent, frozen config policy, claimed
    deferred FK `demo_run.primary_case_id`), § 11 (Node/npm baseline), § 13–14 (test strategy pattern).
11. `tasks/TG-001_TASK_CONTRACT.md` — frozen workspace scripts / manifest ownership (по запросу через TG-005).

## 4. Dependencies / unlocks

Canonical из `tasks/TASK_GRAPH.md` § 3 (внешние рёбра не менять):

```text
Depends On:   TG-005
Unlocks:      TG-007
Parallel With: TG-009, TG-010, TG-020
Primary Ownership: LANE-B
```

- Основа миграционного цепочки — immutable `packages/db/migrations/0001_foundation.ts` (Wave 1 checkpoint).
- `demo_run.primary_case_id` создан в TG-005 как `uuid NULL` без FK; TG-005 контракт § 7 явно делегирует TG-006
  добавление composite same-run FK `(demo_run_id, case_id)` и FK `primary_case_id` (Data Model § 26.6).
  Это **внутри scope** задачи, включается в `0002_case_workflow`.
- `CaseEvent.command_id` и `CaseEvent.attachment_id` ссылаются на таблицы TG-007 (CommandExecution, Attachment).
  TG-006 создаёт **колонки без FK**; FK объявляет TG-007 в своей операционной миграции (§ 8 «Dependency requests»).

## 5. Allowed write scope

Однозначный whitelist на время implementation (после independent review). Вне списка правки запрещены;
формулировка «other files as needed» не допускается.

| # | Path | Action | Назначение |
|---|---|---|---|
| 1 | `packages/db/migrations/0002_case_workflow.ts` | create | единственная аппендинг-миграция TG-006 (`up` + `down`), DDL § 7, exact constraint names |
| 2 | `packages/db/src/index.ts` | edit | добавить 8 таблиц TG-006 в `Database` (13 → 21 ключей) и закрытые enum-union типы; сохранить self-contained single-file boundary без относительных src-imports |
| 3 | `packages/db/src/types.typecheck.ts` | bounded edit | расширить `_DbKeysExact`/`keyof Database`-ассерции на 8 новых ключей; добавить closed-assertions новых enum-union; остальные TG-005 ассерции не трогать |
| 4 | `packages/db/src/foundation.unit.test.ts` | bounded edit | расширить exact `keyof Database`-ассерцию на 8 новых ключей; остальные TG-005 unit-тесты не трогать |
| 5 | `packages/db/src/index.test.ts` | bounded edit | расширить `databaseKeys` до 21; boundary smoke не менять |
| 6 | `packages/db/src/db-foundation.integration.test.ts` | bounded edit | расширить `APP_TABLES` и catalog-бюджеты (PK/U/C/F) на набор TG-006; rollback/re-up и остальные ассерции не трогать |
| 7 | `packages/db/src/case-workflow.unit.test.ts` | create | offline DDL-manifest тесты `0002_case_workflow` (по прецеденту TG-005 § 13.1) |
| 8 | `packages/db/src/case-workflow.integration.test.ts` | create | real-PostgreSQL constraint / negative / immutability suite (§ 10) |

Правила:

- `0001_foundation.ts` (immutable), frozen `packages/db/tsconfig.json`, frozen root scripts и root
  `package-lock.json` **не редактируются** (TG005-R-B01/B02 precedents).
- Правки TG-005-owned test/typecheck файлов (№ 3–6) разрешены **только** для поддержания green frozen
  workspace проверок (`npm run typecheck`, `npm test`, сборка миграций) при аппендинге каталога TG-006;
  единственный тип изменений — расширение exact-перечней/бюджетов на новый набор. Любые другие изменения
  этих файлов — вне scope.
- **TG-005 env-имена и safety-guard не нормализуются**: `TG005_TEST_DATABASE_URL` и guard `current_database() … '_tg005_test'`
  остаются **без изменений**; TG-006 не переименовывает их и не редактирует TG-005 harness ради env-name
  унификации (M03). TG-006 предоставляет **отдельную** `TG005_TEST_DATABASE_URL` с `*_tg005_test` БД
  для запуска TG-005 suite, и свою `TG006_TEST_DATABASE_URL` с `*_tg006_test` для TG-006 suite.
- Disposable writes (`node_modules/**`, локальные `dist/**`, `*.tsbuildinfo`, отчёты vitest) игнорируются
  и не stage'ятся. Root lockfile при необходимости — только локальная install-проверка с
  `git restore --source <BaseSha> -- package-lock.json` (как TG-005 § 6.1/16.2).

## 6. Forbidden scope

- Не создавать операционные таблицы TG-007: `attachment` + typed links, `command_execution`,
  `notification_intent`, `configuration_change`.
- Не кодировать state machine / lifecycle-переходы (EVT-013→EVT-014→N+1 логику) в DB triggers: DB не является
  workflow engine (Data Model § 24, § 17.4; `TR-*` остаются в domain layer TG-009/TG-016).
- Не вводить constraint `Result.iteration_id == Assignment.created_iteration_id` (§ 12.4 обязателен к запрету).
- Не делать `Case.current_iteration_id` nullable даже как bootstrap-альтернативу (§ 26.4).
- Не создавать ninth state / пятую роль; `PENDING/ACCEPTED/DELIVERED/ACTIVE` — не product states (§ 1.3).
- Не редактировать чужие файлы вне whitelist; не менять Product/Architecture semantics и documents
  (Freeze/Spec/Data Model/Interface Contracts); не коммитить review/recheck/closure-артефакты (BACKLOG).
- Не добавлять dependencies, не менять root manifests; не изобретать native enum types (CHECK-constraints по
  прецеденту TG-005); не использовать SQLite/in-memory DB как evidence (только реальный PostgreSQL).
- Не делегировать coding-агенту выбор семантики: exact constraint names, enum-наборы и immutability-budget
  заданы этим контрактом (§ 7).
- Не писать второй CAS/revision-gate: `revision` — метаданные, не correctness gate (Data Model § 9.5).

## 7. Required behavior / invariants

Все сущности и поля — по Data Model §§ 9–18 (карточки ниже называют обязательные части; полные field-списки
нормативно в этих разделах). UUID-identity, `timestamptz NOT NULL` без defaults, CHECK-constraints вместо native
enum — по прецеденту § 7 TG-005. Exact constraint names фиксируются таблицей § 7.13.

### 7.1. `Case` (Data Model § 9)

- immutable scope/origin: `case_id`, `organization_id`, `house_id`, `premises_id`, `resident_user_id`,
  `category_id`, description, creation metadata, configuration snapshots, `demo_run_id`.
- same-tenant composite FK (Data Model § 26.1 MUST):
  `Case(organization_id, house_id) → House(organization_id, house_id)`,
  `Case(house_id, premises_id) → Premises(house_id, premises_id)`,
  `Case(organization_id, category_id) → Category(organization_id, category_id)`.
- `current_state` CHECK на ровно 8 значений (§ 1.3): `CREATED, ACCEPTED_BY_UK, SENT_TO_CONTRACTOR, EXECUTION,
  AWAITING_RESULT_CHECK, REMARKS_REVIEW, REWORK, COMPLETED`.
- `result_requirement_snapshot` closed-domain CHECK на `ResultRequirement` (§ 1.5): `NONE, PHOTO, FILE`.
- current pointers: `current_iteration_id NOT NULL`; `current_selection_id`, `current_assignment_id`,
  `current_executor_contractor_id`, `current_result_id` — nullable, same-case composite FKs (§ 26.2).
- closure projection — два отдельных exact CHECK (§ 7.13):
  - `ck_case_closure_kind`: `closure_kind` только из canonical `ClosureKind` (§ 1.5)
    `CONFIRMED_RESULT, NO_RESIDENT_FEEDBACK, DISPUTED_WITH_EXPLANATION`; NULL допустим (nullable column),
    закрытый Case несёт NOT NULL через `ck_case_closure_consistency`. Иных значений, включая «технические»
    статусы других таблиц, быть не может;
  - `ck_case_closure_consistency` (§ 24 п. 8 + § 32 + AC-019):
    - `current_state='COMPLETED' ⇒ closed_at, closed_by_user_id, closure_kind NOT NULL`;
    - `closure_kind='DISPUTED_WITH_EXPLANATION' ⇒ closure_explanation IS NOT NULL AND btrim(closure_explanation) <> ''`
      (спорное завершение требует непустого объяснения; пустая строка/whitespace-only не принимается);
    - `current_state<>'COMPLETED' ⇒ closed_at/closed_by_user_id/closure_kind/closure_explanation NULL`;
    - для `CONFIRMED_RESULT` и `NO_RESIDENT_FEEDBACK` `closure_explanation` **не ограничивается** (canonical
      docs не задают для них требования): NULL допустим, дополнительное правило было бы новой семантикой.
- `revision >= 1`, `last_event_seq >= 0`; partial unique `uq_case_display_number` на `display_number`
  (nullable).
- `demo_run_id` → `DemoRun` (single FK, nullable) **плюс** полный composite candidate key
  `uq_case_demo_run_case` § 7.9.

### 7.2. `CaseIteration` (Data Model § 10)

- `cq_iteration_case_iteration` UNIQUE(case_id, iteration_id), `cq_iteration_case_no`
  UNIQUE(case_id, iteration_no), `iteration_no >= 1`, `start_reason IN (INITIAL, REWORK)`.
- Initial Case commit всегда создаёт iteration `1` в той же transaction, что и Case (§ 26.4 deferred circular FK).
- Identity immutable после вставки (immutability § 7.12).
- Same-case composite FKs для sibling pointers: `fk_iteration_source_result_id`,
  `fk_iteration_source_feedback_id` (→ Result / ResidentFeedback same-case composite),
  `fk_iteration_started_by_event_id` → CaseEvent same-case composite, DEFERRABLE INITIALLY DEFERRED (§ 7.11).

### 7.3. `ContractorSelection` (Data Model § 11)

- immutable fact `selected`; identity (case/iteration/contractor/selected-by/time) immutable.
- `cq_selection_case_selection` UNIQUE(case_id, selection_id);
  `cq_selection_case_no` UNIQUE(case_id, selection_no); **без** `is_current`-флага — current
  определяется только `Case.current_selection_id`.
- Same-case composite FK `fk_selection_created_iteration_id` → CaseIteration same-case composite
  (§ 7.13).

### 7.4. `Assignment` (Data Model § 12)

- immutable identity: case/selection/contractor/created_iteration/sent-by/time.
- `cq_assignment_case_assignment` UNIQUE(case_id, assignment_id); `cq_assignment_case_no`
  UNIQUE(case_id, assignment_no); `UNIQUE(selection_id)` (hard cardinality Selection →0..1 Assignment).
- decision: `UNIQUE` один переход `PENDING → ACCEPTED | REJECTED` с exact shape § 12.3:
  - `PENDING   ⇒ accepted/rejected флаги NULL`;
  - `ACCEPTED  ⇒ accepted_at/by NOT NULL, rejected флаги NULL`;
  - `REJECTED  ⇒ rejected_at/by/reject_reason NOT NULL (reason непустой), accepted флаги NULL`.
- Критически: `created_iteration_id` — iteration **создания**, НЕ предел validity; accepted Assignment из
  iteration `N` может оставаться current и обосновывать Result iteration `N+1` (§ 12.4). Constraint
  `Result.iteration_id == Assignment.created_iteration_id` **запрещён**.
- Same-case composite FKs: `fk_assignment_selection_id` → ContractorSelection same-case composite,
  `fk_assignment_created_iteration_id` → CaseIteration same-case composite (§ 7.13).

### 7.5. `Result` (Data Model § 13)

- полностью immutable; `UNIQUE(iteration_id)` (один Result на iteration), `cq_result_case_result`
  UNIQUE(case_id, result_id) для same-case composite FK.
- description непустой (CHECK).
- Same-case composite FKs `fk_result_iteration_id`, `fk_result_assignment_id`
  (§ 7.13).

### 7.6. `ResidentFeedback` (Data Model § 14)

- полностью immutable; `UNIQUE(result_id)` (ровно одна formal branch на Result);
  `type IN (CONFIRMATION, REMARK)`; `CONFIRMATION ⇒ remark пуст/null`, `REMARK ⇒ remark непуст`.
- Same-case composite candidate key `cq_feedback_case_feedback` UNIQUE(case_id, feedback_id) (M01);
  same-case composite FKs `fk_feedback_iteration_id`, `fk_feedback_result_id` (§ 7.13).

### 7.7. `Comment` (Data Model § 15)

- immutable для business history; `comment_kind IN (WORKING, CLARIFICATION_REQUEST, CLARIFICATION_REPLY)`;
  без поля произвольной приватности.
- `actor_role_snapshot` closed-domain CHECK `ck_comment_actor_role_snapshot` (4 role values, § 1.4);
  same-case composite candidate key `cq_comment_case_comment` UNIQUE(case_id, comment_id) (M01);
  same-case composite FKs `fk_comment_iteration_id`, `fk_comment_context_result_id`,
  `fk_comment_context_feedback_id`, `fk_comment_in_reply_to_comment_id` (§ 7.13).

### 7.8. `CaseEvent` (Data Model § 17)

- `actor_role_snapshot` (nullable) closed-domain CHECK `ck_event_actor_role_snapshot`
  (§ 1.4); `from_state`, `to_state` (nullable) closed-domain CHECK `ck_event_from_state`,
  `ck_event_to_state` (§ 1.3) — exact 8 product-state values, NULL допустим.
- append-only (immutability § 7.12); `event_type` CHECK на ровно 17 значений `EVT_001 … EVT_017`;
  `UNIQUE(case_id, event_seq)`; `cq_event_case_event` UNIQUE(case_id, event_id) (M01).
- `EVT-015`: `CHECK(event_type <> 'EVT_015' OR result_id IS NOT NULL)` +
  partial unique `UNIQUE(result_id, event_type) WHERE event_type = 'EVT_015'` (один EVT-015 на Result).
- `command_id` колонка `NOT NULL` **без FK** (FK → CommandExecution добавляет TG-007);
  `attachment_id` nullable **без FK** (FK → Attachment добавляет TG-007).
- Same-case composite pointers на sibling Case-records через composite FKs § 7.13
  (`fk_event_iteration_id`, `fk_event_selection_id`, `fk_event_assignment_id`,
  `fk_event_result_id`, `fk_event_feedback_id`, `fk_event_comment_id`,
  `fk_event_caused_by_event_id`).
- `caused_by_event_id` self-FK nullable; EVT-014 derived/caused-by-связь — семантика domain layer
  (TG-009/TG-016), не DB-триггер; цикл `started_by_event_id ↔ iteration_id` deferred (§ 7.11).

### 7.9. DemoRun deferred FK (Data Model § 26.6)

- в `0002_case_workflow`: `fk_case_demo_run_id` `Case.demo_run_id` → `DemoRun.demo_run_id` (nullable);
  полный composite unique `uq_case_demo_run_case` `UNIQUE(demo_run_id, case_id)` **без partial predicate**;
  composite `fk_demo_run_primary_case` `DemoRun(demo_run_id, primary_case_id) → Case(demo_run_id, case_id)`
  (declared deferred в TG-005 § 7).
- Partial predicate `WHERE demo_run_id IS NOT NULL` **запрещён** как referenced candidate key:
  PostgreSQL не принимает partial unique index в качестве целевого уникального ограничения для FK.
  Семантика «множество Cases без `demo_run_id` допустимо» сохраняется штатным NULL-семантиком
  PostgreSQL (NULLs distinct в plain `UNIQUE`), эффект эквивалентен former partial-индексу.
- `uq_case_demo_run_case` — именованный candidate key, на который ссылается `fk_demo_run_primary_case` (§ 7.13).

### 7.10. Deferred circular FK (Data Model § 26.4)

- `Case(case_id, current_iteration_id) → CaseIteration(case_id, iteration_id)` как
  `DEFERRABLE INITIALLY DEFERRED`; к `COMMIT` обе записи обязаны существовать. `current_iteration_id`
  **не nullable** — никаких альтернативных bootstrap (NULL-подход запрещён).
- nullable circular пара `CaseIteration.started_by_event_id ↔ CaseEvent.iteration_id` должна разрешаться
  в одной CreateCase transaction (механизм по § 26.4/28.1; без NULL current iteration).

### 7.11. Same-case composite FK (Data Model § 26.2–26.3)

- Каждый child/sibling pointer с `case_id` использует composite shape
  `(case_id, <id>) → (<target_table>(case_id, <id>))` — exact column pairs зафиксированы
  в § 7.13. Single-column FK на ту же пару **не дублируется**: composite строго сильнее
  (referenced PK входит в candidate key), поэтому он его заменяет.
- Referenced tables обязаны предоставлять exact named composite candidate keys (§ 7.13,
  `cq_*`). Без них PostgreSQL отклонит DDL: FK требует usable non-partial candidate key
  (это ровно находка TG006-R-M01).
- Partial unique index не может быть referenced candidate key (см. § 7.9).
- Nullable composite pointers остаются nullable; non-null pointer физически не может
  ссылаться на record другого Case (negative fixtures § 10).
- Циклические пары nullable FKs (`CaseIteration.started_by_event_id ↔ CaseEvent.iteration_id`)
  объявляются `DEFERRABLE INITIALLY DEFERRED` и разрешаются внутри одной CreateCase
  transaction (механизм по § 26.4/§ 28.1; без NULL `current_iteration_id`).

### 7.12. DB-level immutability (Data Model § 27, § 17.5; Task Graph TG-006 Required Outputs)

Enforcement — на выбор implementation: небольшие `BEFORE UPDATE/DELETE` triggers либо role/privilege policy
(§ 17.5 допускает оба) — **immutable triggers НЕ кодируют state machine** (граница § 6).

- Result, ResidentFeedback, Comment, CaseEvent: любой `UPDATE` / любой `DELETE` → rejected; `SELECT` работает.
- CaseIteration: `UPDATE`/`DELETE` identity-полей (case, iteration_no, started_at, start_reason/source) →
  rejected.
- ContractorSelection: любой `UPDATE`/`DELETE` → rejected (полностью immutable identity).
- Assignment: `DELETE` rejected; `UPDATE` разрешён **только** на decision-полях и **только** как один переход
  `PENDING → ACCEPTED|REJECTED` (§ 12.3); любые изменения identity-полей (case/selection/contractor/
  created_iteration/sent) или повторный/обратный transition → rejected.
- Требование доказательства: failed `UPDATE`/`DELETE` не изменяет stored authoritative fact (select после
  rejected-попытки возвращает прежние значения; last_event_seq/closure/revision не «съедаются»).

### 7.13. Exact constraint registry (catalog-pin)

Каждый констант/индекс объявляется отдельным оператором с приведённым именем (прецедент TG-005 § 7).
Имена ниже нормативны для тестов каталога; точные column-наборы берутся из §§ 9–18, 25, 26.
**Composite FK строго сильнее single-column** (referenced PK входит в composite key) — single-column
вариант на ту же пару не дублируется (§ 7.11). Partial unique index помечен `(partial)` и **не может
быть referenced FK target**.

```text
# Case
ck_case_current_state                 CHECK current_state IN ('CREATED','ACCEPTED_BY_UK','SENT_TO_CONTRACTOR','EXECUTION','AWAITING_RESULT_CHECK','REMARKS_REVIEW','REWORK','COMPLETED')
ck_case_result_requirement_snapshot   CHECK result_requirement_snapshot IN ('NONE','PHOTO','FILE')
ck_case_closure_kind                  CHECK closure_kind IS NULL OR closure_kind IN ('CONFIRMED_RESULT','NO_RESIDENT_FEEDBACK','DISPUTED_WITH_EXPLANATION')
ck_case_closure_consistency           CHECK closure projection: § 24 п.8 + § 32 + AC-019 (см. § 7.1)
ck_case_revision                      CHECK revision >= 1
ck_case_last_event_seq                CHECK last_event_seq >= 0
uq_case_display_number                UNIQUE(display_number) WHERE display_number IS NOT NULL        (partial index)
uq_case_demo_run_case                 UNIQUE(demo_run_id, case_id)                                        (полный composite; FK target)
fk_case_organization_house            Case(organization_id, house_id) → House(organization_id, house_id)
fk_case_house_premises                Case(house_id, premises_id) → Premises(house_id, premises_id)
fk_case_organization_category         Case(organization_id, category_id) → Category(organization_id, category_id)
fk_case_demo_run_id                   Case(demo_run_id) → DemoRun(demo_run_id)
fk_case_current_iteration             Case(case_id, current_iteration_id) → CaseIteration(case_id, iteration_id) DEFERRABLE INITIALLY DEFERRED
fk_case_current_selection             Case(case_id, current_selection_id) → ContractorSelection(case_id, selection_id)
fk_case_current_assignment            Case(case_id, current_assignment_id) → Assignment(case_id, assignment_id)
fk_case_current_result                Case(case_id, current_result_id) → Result(case_id, result_id)
fk_case_org_id / fk_case_house_id / fk_case_premises_id / fk_case_resident_user_id / fk_case_category_id / fk_case_created_by_user_id / fk_case_default_contractor_snapshot_id / fk_case_closed_by_user_id / fk_case_current_executor_contractor_id
# CaseIteration
ck_iteration_number                   CHECK iteration_no >= 1
ck_iteration_start_reason             CHECK start_reason IN ('INITIAL','REWORK')
cq_iteration_case_iteration           UNIQUE(case_id, iteration_id)
cq_iteration_case_no                  UNIQUE(case_id, iteration_no)
fk_iteration_case_id                  CaseIteration(case_id) → Case(case_id)
fk_iteration_started_by_user_id       CaseIteration(started_by_user_id) → AppUser(app_user_id)
fk_iteration_source_result_id         CaseIteration(case_id, source_result_id) → Result(case_id, result_id)
fk_iteration_source_feedback_id       CaseIteration(case_id, source_feedback_id) → ResidentFeedback(case_id, feedback_id)
fk_iteration_started_by_event_id      CaseIteration(case_id, started_by_event_id) → CaseEvent(case_id, event_id) DEFERRABLE INITIALLY DEFERRED  # цикл § 7.11
# ContractorSelection
cq_selection_case_selection           UNIQUE(case_id, selection_id)
cq_selection_case_no                  UNIQUE(case_id, selection_no)
fk_selection_case_id                  ContractorSelection(case_id) → Case(case_id)
fk_selection_created_iteration_id     ContractorSelection(case_id, created_iteration_id) → CaseIteration(case_id, iteration_id)
fk_selection_contractor_id            ContractorSelection(contractor_id) → Contractor(contractor_id)
fk_selection_selected_by_user_id      ContractorSelection(selected_by_user_id) → AppUser(app_user_id)
# Assignment
ck_assignment_decision                CHECK decision shape § 12.3
cq_assignment_case_assignment         UNIQUE(case_id, assignment_id)
cq_assignment_case_no                 UNIQUE(case_id, assignment_no)
uq_assignment_selection_id            UNIQUE(selection_id)
fk_assignment_case_id                 Assignment(case_id) → Case(case_id)
fk_assignment_selection_id            Assignment(case_id, selection_id) → ContractorSelection(case_id, selection_id)
fk_assignment_created_iteration_id    Assignment(case_id, created_iteration_id) → CaseIteration(case_id, iteration_id)
fk_assignment_contractor_id           Assignment(contractor_id) → Contractor(contractor_id)
fk_assignment_sent_by_user_id         Assignment(sent_by_user_id) → AppUser(app_user_id)
fk_assignment_accepted_by_user_id     Assignment(accepted_by_user_id) → AppUser(app_user_id)
fk_assignment_rejected_by_user_id     Assignment(rejected_by_user_id) → AppUser(app_user_id)
# Result
uq_result_iteration_id                UNIQUE(iteration_id)
cq_result_case_result                 UNIQUE(case_id, result_id)
ck_result_description_not_empty       CHECK length(description) > 0
fk_result_case_id                     Result(case_id) → Case(case_id)
fk_result_iteration_id                Result(case_id, iteration_id) → CaseIteration(case_id, iteration_id)
fk_result_assignment_id               Result(case_id, assignment_id) → Assignment(case_id, assignment_id)
fk_result_contractor_id               Result(contractor_id) → Contractor(contractor_id)
fk_result_author_user_id              Result(author_user_id) → AppUser(app_user_id)
# ResidentFeedback
uq_feedback_result_id                 UNIQUE(result_id)
cq_feedback_case_feedback             UNIQUE(case_id, feedback_id)                                        # M01: composite candidate key
ck_feedback_type                      CHECK type IN ('CONFIRMATION','REMARK')
ck_feedback_remark                    CHECK (type='REMARK' AND length(remark_text) > 0) OR (type='CONFIRMATION' AND (remark_text IS NULL OR remark_text = ''))
fk_feedback_case_id                   ResidentFeedback(case_id) → Case(case_id)
fk_feedback_iteration_id              ResidentFeedback(case_id, iteration_id) → CaseIteration(case_id, iteration_id)
fk_feedback_result_id                 ResidentFeedback(case_id, result_id) → Result(case_id, result_id)
fk_feedback_resident_user_id          ResidentFeedback(resident_user_id) → AppUser(app_user_id)
# Comment
ck_comment_kind                       CHECK comment_kind IN ('WORKING','CLARIFICATION_REQUEST','CLARIFICATION_REPLY')
ck_comment_actor_role_snapshot        CHECK actor_role_snapshot IN ('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE')
cq_comment_case_comment               UNIQUE(case_id, comment_id)                                          # M01: composite candidate key
fk_comment_case_id                    Comment(case_id) → Case(case_id)
fk_comment_iteration_id               Comment(case_id, iteration_id) → CaseIteration(case_id, iteration_id)
fk_comment_author_user_id             Comment(author_user_id) → AppUser(app_user_id)
fk_comment_context_result_id          Comment(case_id, context_result_id) → Result(case_id, result_id)
fk_comment_context_feedback_id        Comment(case_id, context_feedback_id) → ResidentFeedback(case_id, feedback_id)
fk_comment_in_reply_to_comment_id     Comment(case_id, in_reply_to_comment_id) → Comment(case_id, comment_id)
# CaseEvent
uq_event_case_seq                     UNIQUE(case_id, event_seq)
cq_event_case_event                   UNIQUE(case_id, event_id)                                            # M01: composite candidate key
ck_event_type                         CHECK event_type IN ('EVT_001','EVT_002','EVT_003','EVT_004','EVT_005','EVT_006','EVT_007','EVT_008','EVT_009','EVT_010','EVT_011','EVT_012','EVT_013','EVT_014','EVT_015','EVT_016','EVT_017')
ck_event_actor_role_snapshot          CHECK actor_role_snapshot IS NULL OR actor_role_snapshot IN ('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE')
ck_event_from_state                   CHECK from_state IS NULL OR from_state IN (8 CaseState значений)
ck_event_to_state                     CHECK to_state IS NULL OR to_state IN (8 CaseState значений)
ck_event_evt015_result                CHECK (event_type <> 'EVT_015' OR result_id IS NOT NULL)
uq_evt015_per_result                  UNIQUE(result_id, event_type) WHERE event_type = 'EVT_015'           (partial index)
fk_event_case_id                      CaseEvent(case_id) → Case(case_id)
fk_event_iteration_id                 CaseEvent(case_id, iteration_id) → CaseIteration(case_id, iteration_id) DEFERRABLE INITIALLY DEFERRED
fk_event_selection_id                 CaseEvent(case_id, selection_id) → ContractorSelection(case_id, selection_id)
fk_event_assignment_id                CaseEvent(case_id, assignment_id) → Assignment(case_id, assignment_id)
fk_event_result_id                    CaseEvent(case_id, result_id) → Result(case_id, result_id)
fk_event_feedback_id                  CaseEvent(case_id, feedback_id) → ResidentFeedback(case_id, feedback_id)
fk_event_comment_id                   CaseEvent(case_id, comment_id) → Comment(case_id, comment_id)
fk_event_caused_by_event_id           CaseEvent(case_id, caused_by_event_id) → CaseEvent(case_id, event_id)
fk_event_actor_user_id                CaseEvent(actor_user_id) → AppUser(app_user_id)
# DemoRun
fk_demo_run_primary_case              DemoRun(demo_run_id, primary_case_id) → Case(demo_run_id, case_id)
```

(Колонки `CaseEvent.command_id`/`CaseEvent.attachment_id` держатся без FK в TG-006 — § 7.8.)

## 8. Dependency requests

Новые пакеты/изменения shared manifests **не требуются** (`NONE`):

```text
DEPENDENCY_REQUESTS = NONE
ROOT_MANIFEST/LOCKFILE = не трогать; любые изменения - только через Integration Agent на wave-2 checkpoint
```

Cross-task contract dependencies (не пакеты), фиксируются этим контрактом для координации:

- **TG-007 (необходимо учесть в контракте TG-007):** после создания `command_execution` и `attachment`
  добавить `fk_case_event_command_id` (`CaseEvent.command_id → CommandExecution.command_id`) и
  `fk_case_event_attachment_id` (`CaseEvent.attachment_id → Attachment`) в операционной миграции.
- **TG-008:** seed-логика опирается на схему TG-006 (Case-family); дополнительных требований не декларируется.
- `demo_run.primary_case_id` FK и same-run composite — выполнены в TG-006 (§ 7.9); TG-007 их не добавляет повторно.

## 9. Acceptance criteria

1. Чистая миграция `0002_case_workflow` поверх `0001_foundation` успешна; `down` полностью обратный;
   повторный `up` — no-op; миграционный порядок строго версионный (`allowUnorderedMigrations: false`).
2. Initial Case commit создаёт Case + CaseIteration #1 в одной transaction при `current_iteration_id NOT NULL`
   (deferred FK проходит на `COMMIT`); коммит без CaseIteration #1 невозможен.
3. Cross-Case вставки невозможны: pointer/child-ссылки не могут указывать на child другого Case
   (same-case composite FK, negative fixtures green).
4. Один Result на iteration; одна formal feedback на Result; duplicate Result iteration / duplicate feedback /
   duplicate EVT-015 → reject (23505).
5. `EVT_015` без `result_id` → reject (23514); один Result не получает два EVT-015.
6. Immutability матрица (§ 7.12): любые запрещённые `UPDATE`/`DELETE` rejected, stored authoritative fact
   остаётся без изменений (select после попытки возвращает прежние значения).
7. One-way Assignment decision: `PENDING → ACCEPTED` и `PENDING → REJECTED` допустимы; изменение identity
   или повторный/обратный transition rejected.
8. Фикстура same-contractor N+1: accepted Assignment из iteration `N` легально обосновывает Result iteration
   `N+1` (accepted: доработка без повторного accept).
9. `Case.current_iteration_id` не может стать NULL (NOT NULL + deferred FK); no constraint связывает
   result iteration с iteration создания Assignment.
10. `Database` type surface ровно 21 ключ (13 TG-005 + 8 TG-006); закрытые enum-union (`CaseState`, `AssignmentDecision`,
     `ResidentFeedbackType`, `ClosureKind`, `CommentKind`, `CaseEventType`, `IterationStartReason`) закрыты exact-значениями.
11. Frozen workspace checks green: `npm run typecheck`, `npm run build`, workspace `test` script (`vitest run
     src/index.test.ts`) и TG-005 integration suite (`db-foundation.integration.test.ts`, `db-constraints.integration.test.ts`)
     не регрессируют (правки № 3–6 § 5 — только расширение exact-перечней/бюджетов на новый набор).
12. Миграция не содержит state-machine логики (никаких lifecycle-переходов/стеков в DB): изменчивость —
     только bookkeeping/current projection Case (`revision`, `updated_at`, closure) и one-way decision-поля
     Assignment; `CaseEvent` только append.
13. **Closed-domain CHECK registry** (M02): `ck_case_result_requirement_snapshot`, `ck_case_closure_kind`,
     `ck_comment_actor_role_snapshot`, `ck_event_actor_role_snapshot`, `ck_event_from_state`, `ck_event_to_state`
     существуют с exact allowed values; `ck_case_closure_consistency` требует непустой `closure_explanation`
     для `DISPUTED_WITH_EXPLANATION` (AC-019).
14. **Same-case composite candidate keys** (M01): `cq_feedback_case_feedback`, `cq_comment_case_comment`,
     `cq_event_case_event` существуют как usable FK targets; `uq_case_demo_run_case` — полный composite
     (без partial predicate); `fk_demo_run_primary_case` целевой FK проходит.
15. **Verification recipe executable** (M03): recipe § 10 устанавливает оба env (`TG005_TEST_DATABASE_URL`
     с `*_tg005_test` guard, `TG006_TEST_DATABASE_URL` с `*_tg006_test`); TG-005 harness не изменён.

## 10. Required tests

Real PostgreSQL (Postgres 17/18); SQLite/in-memory/mock — не evidence, запрещено. Две независимые БД:
`TG005_TEST_DATABASE_URL` (guard `*_tg005_test`, TG-005 harness) и `TG006_TEST_DATABASE_URL`
(guard `*_tg006_test`, TG-006 suite). Тесты изолированы
в явных transactions; negative-фикстуры ожидают SQLSTATE (`23505`/`23514`/`23503`/trigger-exception) и имя
constraint/trigger в тексте ошибки. Catalog assertions — через `pg_catalog` c полным равенством
`pg_get_indexdef`/`pg_get_constraintdef` (substring-сверка как evidence запрещена, прецедент TG-005 § 14).

Команды из repository root (порядок важен; non-zero exit останавливает commit/push):

```powershell
$ErrorActionPreference = 'Stop'
$BaseSha = '0332bf029ab12a1217f1aef5f6bf0f26e6a2faca'
npm run typecheck
npm run build
npm test                                   # frozen: vitest run src/index.test.ts
npx vitest run packages/db/src/foundation.unit.test.ts
npx vitest run packages/db/src/case-workflow.unit.test.ts
$env:TG005_TEST_DATABASE_URL = '<url: db name *_tg005_test>'   # TG-005 harness, guard без изменений
$env:TG006_TEST_DATABASE_URL = '<url: db name *_tg006_test>'   # TG-006 suite, собственный isolated DB
npx vitest run packages/db/src/db-foundation.integration.test.ts     # расширенный каталог TG-006 (TG005 env)
npx vitest run packages/db/src/db-constraints.integration.test.ts        # TG-005 regression (TG005 env)
npx vitest run packages/db/src/case-workflow.integration.test.ts     # TG-006 suite (TG006 env)
```

`TG005_TEST_DATABASE_URL` и `_tg005_test` guard — **без изменений** (M03): TG-006 не редактирует
TG-005 harness и не нормализует env-имена. Обе БД существуют параллельно; `dropAllUserSchemas`
TG-005 работает только в своей БД (`*_tg005_test`), поэтому не уничтожает TG-006 evidence.

`db-foundation.integration.test.ts` (TG-005-owned, расширен TG-006) применяет миграцию 0001+0002
и проверяет 21 app-таблицу с расширенными каталогами PK/U/C/F (§ 7.13). `case-workflow.integration.test.ts`
использует собственный schema `tg006_case_workflow` и DB `*_tg006_test`.

`case-workflow.integration.test.ts` обязан покрыть:

1. **clean migrate:** в dedicated schema (например `tg006_case_workflow`) migrateToLatest из source; ровно
    21 app-таблица; exact-catalog проверка registry § 7.13 (имена + колонки + предикаты) **по полному равенству
    `pg_get_constraintdef`/`pg_get_indexdef`** (substring-сверка как evidence запрещена); `rollbackAll` → 0
    таблиц; повторный `up` идемпотентен.
2. **deferred FK bootstrap:** positive-фикстура коммита Case+Iteration#1; negative-фикстура обязательства
    `(case_id,current_iteration_id)` → `(case_id,iteration_id)` без записи Iteration#1 — законный сбой на коммите;
    negative-фикстура NULL `current_iteration_id` (NOT NULL).
3. **cross-Case negative matrix (расширена):** Result/Feedback/Comment/Event/Selection/Assignment/Cases
   с `case_id` родителя, отличным от case их child-parent → 23503; current pointers другого Case → 23503;
   same-case composite FKs на sibling pointers (`fk_event_*`, `fk_comment_*`, `fk_feedback_*`,
   `fk_iteration_source_*`, `fk_iteration_started_by_event_id`) — cross-Case вставка → 23503.
4. **closed-domain CHECK fixtures:** каждый новый CHECK из § 7.13 имеет реальный-PostgreSQL negative
    фикстуру, ожидающая SQLSTATE `23514` и имя constraint в `DETAIL`; для `ck_case_closure_consistency`
    отдельный **disputed-with-empty-explanation** negative (DISPUTED_WITH_EXPLANATION + `closure_explanation = ''`)
    → 23514 + имя constraint; CONFIRMED_RESULT / NO_RESIDENT_FEEDBACK с произвольным
    `closure_explanation` остаются валидными (canonical docs не ограничивают — не negative).
    **`ck_feedback_remark` regression test (M02 fix):** PASS — CONFIRMATION + `remark_text IS NULL`;
    PASS — CONFIRMATION + `remark_text = ''`; FAIL — CONFIRMATION + non-empty `remark_text` → 23514.
5. **uniqueness:** второй Result на iteration → 23505; второй feedback на Result → 23505; duplicate
    `(case_id,event_seq)` → 23505; duplicate `(case_id,iteration_no)`, `(case_id,selection_no)`,
    `(case_id,assignment_no)` → 23505; second Assignment на тот же Selection → 23505; duplicate
    `(case_id,event_id)` → 23505 (`cq_event_case_event`); duplicate `(case_id,feedback_id)` → 23505
    (`cq_feedback_case_feedback`); duplicate `(case_id,comment_id)` → 23505 (`cq_comment_case_comment`).
6. **EVT-015:** `EVT_015` c NULL result → 23514; второй `EVT_015` на тот же result → 23505.
7. **immutability UPDATE/DELETE matrix:** для Result, ResidentFeedback, Comment, CaseEvent, CaseIteration
    identity, ContractorSelection, Assignment identity плюс one-way decision флагов (allowed scenario positive,
    все прочие negative); после каждого rejected-attempt `SELECT` возвращает прежние значения (доказательство
    неизменности authoritative fact).
8. **event sequencing:** вставка события с нарушенной `event_seq`-уникальностью rejected; ок исходящая
    sequences проходят; выборка упорядочена.
9. **same-contractor N+1 Result fixture:** bootstrap Case (iteration 1) → Assignment accepted в iteration 1 →
    iteration 2 → Result iteration 2, ссылающийся на этот assignment — вставка **успешна** (доказательство
    законности § 12.4); та же фикстура подтверждает, что своя constraint iteration-привязка отсутствует.
10. **demo_run FK:** `primary_case_id` другого `demo_run_id` → 23503; valid same-run → ok.
11. **compiled-mode smoke** (по прецеденту TG-005 § 13.2): после `npm run build` `dist/migrations/0002_case_workflow.js`
     загружается `FileMigrationProvider` и регистрируется в миграционной цепочке.

Offline `case-workflow.unit.test.ts` — DDL-манифест: 8 новых CREATE TABLE, exact имена
partial-индексов (`uq_evt015_per_result`, `uq_case_display_number`) **и их предикаты**, а также exact имя
полного composite unique `uq_case_demo_run_case` (UNIQUE(demo_run_id, case_id), **без** partial predicate,
FK target по M01); отсутствие state-machine-переходов в trigger-текстах (только immutability-защита).

Если PostgreSQL недоступен и соединение не устанавливается — `POSTGRES_PROVISIONING_BLOCKED`; integration
evidence отсутствует, стоп (не изображать прохождение).

## 11. Git / integration handoff

Ветка для контракта: `codex/tg-006-contract` от exact `BASE_SHA = 0332bf029ab12a1217f1aef5f6bf0f26e6a2faca`.
Контракт пишется в `tasks/TG-006_TASK_CONTRACT.md`; в рамках authoring-стадии коммитятся только этот файл.

После authoring: показать результат, зафиксировать полный commit SHA, push в origin по названной branch
(не в `main`). Использовать существующую человеческую Git identity; без AI author/co-author и
`Generated-by-AI` (AGENTS.md). Перед commit — `git diff` и проверка, что изменён только контракт.

После независимого review и (при `FIX_REQUIRED`) одного batch-fix, контракт становится canonical; реализация
проходит на ветке `codex/tg-006-case-workflow` от того же `BASE_SHA`, затем — передачи Integration Agent
для волновой merge W2 и создания нового стабильного `main`. `BASE_SHA` не меняется правкой семантики:
любое семантическое расхождение — blocker (§ 12), а не адаптация под реализацию.

## 12. Blocker protocol

Остановить затронутую работу и вынести blocker ответственному (Owner/Reviewer/Integration Agent) при любом из:

- `SPEC CONFLICT`: реализация требует изменения Product Freeze/Spec/Data Model/Interface Contracts
  (например, nullable current iteration, cross-Case допустимость, constraint iteration-привязки, ninth state) —
  **не писать обходное решение**; изменение нормативов — только явное решение команды c записью в
  `docs/07_DECISIONS.md`;
- `BASELINE_MISMATCH`: `git rev-parse HEAD` ≠ полному `BASE_SHA` (GitHub совпадения проверять по полному SHA);
- выход за write scope § 5 или нарушение forbidden scope § 6;
- несовместимость утверждённых контрактов (например, конфликт границ TG-006↔TG-007 по FK `CaseEvent`).

CRITICAL review: одно утверждение findings одним полным batch → один batch-fix → только targeted closure.
Новые review/recheck артефакты в repository не коммитятся (BACKLOG).