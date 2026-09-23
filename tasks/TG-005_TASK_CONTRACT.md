# TG-005 TASK CONTRACT

> Статус: **APPROVED / PASS** — canonical Task Contract, канонизирован в repository. Coding разблокирован после repository closure.
> Репо-относительные пути считаются от корня `https://github.com/WorkD69/MAX_hackathon_2026-`.
> Ревизия R3 (FINAL TARGETED FIX): закрыты TG005-R-B02, TG005-R-M05, TG005-TR-01, TG005-TR-02.
> Все previous findings (B01, M01–M04, N01) остаются CLOSED без regression.

## 1. Contract Identity

```text
TASK_ID = TG-005
TYPE = DATA
EXECUTION_CLASS = A — Implementation
BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99
WAVE = WAVE 1
LANE = LANE-B
TASK_GRAPH_GATE = PASS
TASK_CONTRACT_STATUS = APPROVED
TASK_CONTRACT_GATE = PASS
CODING = UNBLOCKED AFTER REPOSITORY CLOSURE
```

Контракт канонизирован в target repository. Он разрешает TG-005 implementation, tests, commit и push строго по
перечисленным ниже условиям после execution-environment bootstrap.

## 2. Canonical Sources

Все нормативные источники прочитаны из immutable checkout target repository на exact `BASE_SHA`
`200b117bd58f7080c15fba1cfa556d386a085c99` (canonical `main`, IC-0 Workspace checkpoint).

1. `AGENTS.md` — правила task contract, `base_sha`, file ownership, Git identity и commit/push.
2. `docs/00_PROJECT_BRIEF.md` — продуктовый контекст Bot + Mini App.
3. `docs/03_ARCHITECTURE.md` §§ 7.4, 10, 12 — MAX identity/outbound delivery binding, authentication, DEMO_MODE;
   §§ 2, 11 — tenant isolation и role semantics; § 22 — Persistence/Kysely baseline.
4. `docs/04_DATA_MODEL.md` §§ 1.4–1.5, 2–8, 23–26, 35 — enum закрытые значения, Entity Overview,
   Organisation/House/Premises/AppUser/bindings/MaxIdentity/Category/Contractor/OrganizationContractor,
   cardinalities, required constraints, unique constraints, foreign keys, DemoRun/DemoRunActor.
5. `docs/05_INTERFACE_CONTRACTS.md` §§ 1.1, 24.7–24.9, 25 — base paths, config/binding semantics, DEMO_MODE contract;
   TG-005 не реализует HTTP.
6. `docs/07_DECISIONS.md`, особенно ADR-016 (MAX auth: raw initData validated server-side; Bot Token server-only),
   ADR-017 (DEMO_MODE: real MAX session + effective synthetic actor), ADR-020 (config snapshot в Case).
7. `docs/08_PROJECT_STATE.md` — `CREATE / WAVE 1 TASK CONTRACTS`, `CODING = BLOCKED`,
   `TG-005 = READY FOR TASK CONTRACT`, `IC-0 = PASS`.
8. `docs/ORCHESTRATOR_HANDOFF.md` — contracts before coding; stable SHA между wave.
9. `tasks/BACKLOG.md` и `tasks/TASK_TEMPLATE.md` — текущий gate и обязательные поля контракта.
10. `tasks/TASK_GRAPH.md` §§ 2, 3 (TG-005), 5 — установлен TG-005 и правила лейнов.
11. `tasks/TG-001_TASK_CONTRACT.md` — канонический формат контракта, frozen baseline, package boundaries,
    dependency policy (§ 12), root scripts (§ 13), workspace scripts (§ 14), placeholder ownership (§ 15).

Time-sensitive версии dependencies независимо проверены 2026-09-23 по npm registry metadata; используются
только stable releases без prerelease identifiers (см. § 12).

## 3. TG-005 Source Definition

Canonical definition из `tasks/TASK_GRAPH.md` § 3 (TG-005 — Configuration, identity и DemoRun schema foundation),
verbatim:

- **Goal:** реализовать первую migration boundary для tenant/config/user/MAX/demo entities и их DB constraints.
- **Type:** `DATA`;
- **Execution Class:** `A — Implementation`;
- **Depends On:** `TG-001`;
- **Unlocks:** `TG-006`, `TG-010`;
- **Parallel With:** `TG-002`, `TG-003`, `TG-004`;
- **Primary Ownership:** `LANE-B`;
- **File / Module Scope:** `packages/db/migrations/*foundation*`, DB types for Organization, House, Premises,
  AppUser, bindings/access, MaxIdentity, Category, Contractor, OrganizationContractor, DemoRun, DemoRunActor;
- **Contract Sources:** Data Model §§ 3–8, 25, 26.1, 35; Architecture §§ 7.4, 10–12; ADR-016, ADR-017, ADR-020;
- **Required Outputs:** versioned up migration(s); exact enums/checks/partial uniques/composite keys;
  Kysely type surface; migration runner foundation;
- **Acceptance Criteria:** unique normal `AppUser → MaxIdentity`; `LINKED_CONFIRMED` requires delivery chat id/type;
  one `ACTIVE` DemoRun per real identity; role-binding shapes and tenant keys enforced by PostgreSQL;
- **Required Tests:** clean migrate; rollback policy test where supported; negative constraint fixtures for
  role shapes, MaxIdentity readiness and duplicate `ACTIVE` DemoRun;
- **Forbidden / Must Not:** не assume `mini_app_user_id == bot_user_id`; не store secrets; не create Case tables yet;
  не add fifth role;
- **Integration Notes:** subsequent migrations append new files; existing foundation migration is immutable after
  Wave 1 checkpoint.

## 4. Goal

Создать в `packages/db` детерминированную foundation migration для ровно 13 конфигурационных/identity/demo-таблиц
и Kysely type surface, на которых:

- PostgreSQL ровно набором таблиц § 6 и их constraints § 7 соблюдает product/architecture invariants
  (unique normal mapping, MAX readiness, один ACTIVE DemoRun, role binding shape, tenant composite keys);
- dependencies `kysely`, `pg`, `@types/pg` exact-pinned и проверены на дату контракта;
- migration runner исполняет версионированную `up`/`down`-миграцию детерминированно против реального PostgreSQL
  на exact API Kysely 0.29.6 (§ 9);
- Case-family таблицы и seed не создаются (owners TG-006, TG-008);
- результат может быть передан отдельному Integration Agent для merge wave-1 и установки нового stable `main`;
- TG-005 не владеет root `package-lock.json` (B01) и не модифицирует frozen `packages/db/tsconfig.json` (B02):
  build-компоновка достигается собственными supplementary конфигами § 10. Frozen `include:["src/index.ts"]` +
  `composite:true` детерминирует single-file boundary `src/index.ts` (§ 6, § 8/9, evidence § 2.8);
- итоговый frozen build выдаёт **flat** layout `dist/` без `dist/src` (B02/TR-01), миграции собираются отдельным
  supplementary конфигом в `dist/migrations/**` (M05/TR-01), а compiled runtime резолвит их как `dist/migrations`.

## 5. Preconditions

Перед любым изменением future coding-agent обязан выполнить:

```powershell
git status --short
git status
git branch --show-current
git rev-parse HEAD
git log -5 --oneline --decorate
```

Обязательные условия:

- `git rev-parse HEAD` равно `200b117bd58f7080c15fba1cfa556d386a085c99` (полный SHA; сокращения запрещены);
- `git status --short` пуст;
- работа ведётся в checkout target repository, а `git rev-parse --show-toplevel` не `C:/`;
- branch ровно `codex/tg-005-db-foundation` и её `HEAD` ровно `BASE_SHA`; detached HEAD, `main` и другая
  самостоятельно выбранная branch для implementation не допускаются;
- origin remote ровно `https://github.com/WorkD69/MAX_hackathon_2026-` (или c `.git`) — никакой другой repository;
- Node/npm до install строго равны baseline § 11.

Любое несоответствие SHA, ремиota, branch или неизвестные local changes: вывести `BASELINE_MISMATCH` и остановиться.
Не применять `reset --hard`, `clean -fd`, `restore .`, force push и не удалять неизвестные изменения.
(Исключение только для § 16.2: `git restore --source $BaseSha -- package-lock.json` после local install-проверки.)

## 6. Allowed Write Scope

Исчерпывающий whitelist author-created/tracked files. Root `package-lock.json` и frozen
`packages/db/tsconfig.json` **не входят** в author-write scope TG-005 (B01, B02):

| # | Path | Action | Назначение |
|---|---|---|---|
| 1 | `packages/db/package.json` | edit | только exact-pinned deps § 12; frozen поля и layout exports § 10 не меняются |
| 2 | `packages/db/tsconfig.migrations.json` | create | supplementary TG-005 config: `migrations/**` → `dist/migrations/**` § 10 |
| 3 | `packages/db/tsconfig.typecheck.json` | create | supplementary TG-005 config: compile-time type-test (`noEmit`) § 13.1 |
| 4 | `packages/db/migrations/0001_foundation.ts` | create | единственная versioned foundation migration `up`+`down` § 7 |
| 5 | `packages/db/src/index.ts` | replace | единый self-contained public boundary: весь Kysely type surface (§ 8) + migration runner (§ 9) в одном файле |
| 6 | `packages/db/src/index.test.ts` | replace | boundary surface test (workspace `test` должен остаться green) |
| 7 | `packages/db/src/foundation.unit.test.ts` | create | offline unit + compile-time type tests (включая `expectTypeOf`) |
| 8 | `packages/db/src/types.typecheck.ts` | create | compile-time type suite для `tsconfig.typecheck.json` § 13.1 |
| 9 | `packages/db/src/db-foundation.integration.test.ts` | create | real-PostgreSQL clean migrate + rollback + re-up + catalog checks |
| 10 | `packages/db/src/db-constraints.integration.test.ts` | create | real-PostgreSQL negative fixtures § 7 / tests |

> **Layout-примечание (R3).** В whitelist отсутствуют `src/types.ts` и `src/migrator.ts`. Причина — эмпирически
> доказанный факт: frozen `packages/db/tsconfig.json` имеет `"composite": true` и `"include": ["src/index.ts"]`,
> а при `composite:true` TS запрещает файлу проекта импортировать не входящие в проект файлы
> (TS6307: "File ... is not listed within the file list of project ... Projects must list all files or use an
> 'include' pattern"), см. § 2.8. Любой ввод `src/types.ts`/`src/migrator.ts` как sibling-импортов из `src/index.ts`
> ломает frozen `npm run build`/`npm run typecheck`. Поэтому TG-005 структурирует boundary одним
> self-contained `src/index.ts` (§ 8–9). Отдельная сущность-файл `types.ts`/`migrator.ts` для TG-005 исключена
> (LATE_REALIZED_DB_SRC_LAYOUT_FLEXIBILITY = NO).

Автоматические disposable writes инструментов разрешены только в `node_modules/**`, five workspace-local `dist/**`,
`coverage/**`, `*.tsbuildinfo`, `playwright-report/**`, `test-results/**`; они ignored, не stage'ятся и не входят
в deliverable. `packages/db/dist/**` включают `dist/migrations/**` и **не** включают `dist/src/**` (см. § 10;
negative guard § 16.4).

Ни одна иная path не разрешена. Формулировка `other files as needed` запрещена.

### 6.1. Lockfile policy (TG005-R-B01)

- TG-005 **не владеет** root `package-lock.json`. Он не входит в whitelist, не stage'ится и не коммитится.
- Lockfile используется только локально для детерминированной install-проверки (§ 16.2):
  `npm install --package-lock-only --ignore-scripts` → `npm ci` → `git restore --source <BaseSha> -- package-lock.json`.
  После restore рабочее дерево по lockfile идентично `BASE_SHA`.
- Канонический manifest/lockfile batch волны формирует отдельный Integration Agent на Wave-1 checkpoint
  (`SHARED_CONFIG_BATCH_OWNER = INTEGRATION_AGENT`). Параллельные TG-002/003/004/005 одновременно не редактируют
  root lockfile.

### 6.2. Frozen config policy (TG005-R-B02)

- `packages/db/tsconfig.json` (frozen) и прочие frozen workspace config — TG-005 **не модифицирует**
  (`FROZEN_WORKSPACE_CONFIG_OWNED_BY_TG005 = NO`).
- Вместо правки frozen конфига TG-005 создаёт собственные supplementary конфиги внутри `packages/db`:
  `tsconfig.migrations.json` (сборка миграций) и `tsconfig.typecheck.json` (compile-time type gate).
- Публичный layout `dist/index.js`/`dist/index.d.ts` и exports-контракт `.` (ESM) не меняются; меняется только
  внутренняя компоновка `dist` (добавляется `dist/migrations/**`).

## 7. Schema — Foundation Migration `0001_foundation.ts`

Ровно **13 таблиц** (owners TG-005; источники — Data Model §§ 3–8, 35):

| Таблица | Источник | Характеристика |
|---|---|---|
| `organization` | § 3 | `organization_id uuid PK`, `name text NOT NULL`, `active boolean NOT NULL`, `created_at/updated_at timestamptz NOT NULL` |
| `house` | § 4 | `house_id uuid PK`, `organization_id uuid NOT NULL FK→organization`, `address text NOT NULL`, `display_label text NULL`, `active boolean NOT NULL`, timestamps; **`UNIQUE(organization_id, house_id)`** |
| `premises` | § 5 | `premises_id uuid PK`, `house_id uuid NOT NULL FK→house`, `number_or_label text NOT NULL`, `active boolean NOT NULL`, timestamps; **`UNIQUE(house_id, premises_id)`** |
| `app_user` | § 6.1 | `app_user_id uuid PK`, `display_name text NOT NULL`, `is_synthetic boolean NOT NULL DEFAULT false`, `active boolean NOT NULL`, timestamps |
| `user_role_binding` | § 6.2 | см. полный DDL «Role binding» ниже |
| `resident_premises_access` | § 6.3 | **`PRIMARY KEY(app_user_id, premises_id)`**, `active`, `created_at`; FK на обе |
| `uk_house_access` | § 6.4 | **`PRIMARY KEY(app_user_id, house_id)`**, `active`, `created_at`; FK на обе |
| `max_identity` | § 6.5 | см. полный DDL «MAX identity» ниже |
| `category` | § 7 | `category_id uuid PK`, `organization_id uuid NOT NULL FK→organization`, `name text NOT NULL`, `description text NULL`, `default_contractor_id uuid NULL FK→contractor`, `requires_premises_access boolean NOT NULL`, `result_requirement text NOT NULL CHECK`, `active boolean NOT NULL`, `config_revision bigint NOT NULL`, timestamps, `updated_by_user_id uuid NULL FK→app_user`; **`UNIQUE(organization_id, category_id)`** |
| `contractor` | § 8.1 | `contractor_id uuid PK`, `display_name text NOT NULL`, `active boolean NOT NULL`, timestamps |
| `organization_contractor` | § 8.2 | **`PRIMARY KEY(organization_id, contractor_id)`**, `active`, `created_at`; FK на обе |
| `demo_run` | § 35.1 | см. полный DDL «DemoRun» ниже |
| `demo_run_actor` | § 35.2 | **`PRIMARY KEY(demo_run_id, app_user_id)`**, **`UNIQUE(demo_run_id, role, actor_alias)`**, `role`, `actor_alias text NOT NULL`; FK на обе |

### Закрытые enum (CHECK constraints, без native enum types)

- `role` в `user_role_binding` и `demo_run_actor`: ровно четыре значения
  `('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE')` (Data Model § 1.4). Пятая роль запрещена.
- `result_requirement` в `category`: `('NONE','PHOTO','FILE')` (Data Model § 1.5).
- `demo_run_status` в `demo_run`: `('ACTIVE','ARCHIVED')` (§ 1.5).
- `max_identity_link_status` в `max_identity`: `('UNLINKED','LINKED_CONFIRMED')` (§ 1.5).

### Роли

Ровно 4 значения: `RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`. Никакая пятая роль в CHECK
не упоминается. Роль `RESIDENT` называется `'RESIDENT'` (не `'HOUSE_RESIDENT'`), в точности как в Data Model § 1.4
и TASK_GRAPH § 3.

### Role binding (Data Model § 6.2 + § 24 п. 19, полный DDL — TG005-R-M04)

```text
user_role_binding
- role_binding_id uuid PK                      -- surrogate PK
- app_user_id uuid NOT NULL FK -> app_user     (fk_user_role_binding_app_user_id)
- role text NOT NULL                           CHECK (ck_user_role_binding_role)
- organization_id uuid NULL FK -> organization (fk_user_role_binding_organization_id)
- contractor_id uuid NULL FK -> contractor     (fk_user_role_binding_contractor_id)
- active boolean NOT NULL
- created_at timestamptz NOT NULL
- CHECK (ck_user_role_binding_shape)
```

`ck_user_role_binding_role`:

```sql
CHECK (role IN ('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE'))
```

`ck_user_role_binding_shape` (ровно три допустимых шаблона):

```sql
CHECK (
  (role = 'RESIDENT' AND organization_id IS NULL AND contractor_id IS NULL)
  OR (role IN ('UK_EMPLOYEE','UK_ADMIN') AND organization_id IS NOT NULL AND contractor_id IS NULL)
  OR (role = 'CONTRACTOR_EMPLOYEE' AND contractor_id IS NOT NULL AND organization_id IS NULL)
)
```

- `RESIDENT`: `organization_id` и `contractor_id` оба `NULL`; доступ — только через `resident_premises_access`.
- `UK_EMPLOYEE` / `UK_ADMIN`: `organization_id NOT NULL`, `contractor_id NULL`.
- `CONTRACTOR_EMPLOYEE`: `contractor_id NOT NULL`, `organization_id NULL`.
- `active boolean NOT NULL`, `created_at timestamptz NOT NULL`.

### MAX identity (Data Model § 6.5, § 24 пп. 20–21, § 25; Architecture § 7.4)

```text
max_identity
- max_identity_id uuid PK
- mini_app_user_id text NULL
- delivery_chat_id text NULL
- delivery_chat_type text NULL
- bot_user_id text NULL
- link_status text NOT NULL CHECK (link_status IN ('UNLINKED','LINKED_CONFIRMED'))  -- ck_max_identity_link_status
- app_user_id uuid NULL
- first_seen_at timestamptz NOT NULL
- last_seen_at timestamptz NOT NULL
- linked_at timestamptz NULL
- FK app_user_id -> app_user (fk_max_identity_app_user_id)
- CHECK (ck_max_identity_readiness)
```

Partial unique indexes (исполняемые `CREATE UNIQUE INDEX`, TG005-R-M01) — app_user_id не считается
единственным идентификатором; нормализация через все три канала отдельно и в совокупности НЕ запрещена:

```sql
CREATE UNIQUE INDEX uq_max_identity_mini_app_user_id
  ON max_identity (mini_app_user_id) WHERE mini_app_user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_max_identity_bot_user_id
  ON max_identity (bot_user_id) WHERE bot_user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_max_identity_app_user_id
  ON max_identity (app_user_id) WHERE app_user_id IS NOT NULL;   -- unique normal AppUser -> MaxIdentity
```

`ck_max_identity_readiness` (`LINKED_CONFIRMED` ⇒ доставка настроена):

```sql
CHECK (link_status <> 'LINKED_CONFIRMED'
       OR (delivery_chat_id IS NOT NULL AND delivery_chat_type IS NOT NULL));
```

- READINESS CHECK не делает `bot_user_id` обязательным и не вводит assumption `mini_app_user_id == bot_user_id`.
- Ни один из delivery-полей не имеет DB defaults (появляются только из server-validated signed MAX initData).

### DemoRun (Data Model § 35.1, § 25)

```text
demo_run
- demo_run_id uuid PK
- scenario_key text NOT NULL
- status text NOT NULL CHECK (status IN ('ACTIVE','ARCHIVED'))    -- ck_demo_run_status
- created_by_max_identity_id uuid NOT NULL FK -> max_identity    (fk_demo_run_created_by_max_identity_id)
- notification_recipient_max_identity_id uuid NOT NULL FK -> max_identity (fk_demo_run_notification_recipient_max_identity_id)
- primary_case_id uuid NULL            -- FK к Case добавит TG-006 (Case ещё не создан)
- created_at timestamptz NOT NULL
- archived_at timestamptz NULL
```

Partial unique — один `ACTIVE` run на одну real MAX identity (TG005-R-M01):

```sql
CREATE UNIQUE INDEX uq_demo_run_active_per_identity
  ON demo_run (created_by_max_identity_id) WHERE status = 'ACTIVE';
```

`primary_case_id` создаётся как `uuid NULL` **без FK в TG-005** (Case-family таблицы — TG-006). TG-006 добавит
composite same-run FK `(demo_run_id, case_id)` и `primary_case_id`-FK. Ограничение § 26.6 анонсировано в этом
контракте как deferred dependency.

### Exact constraint identifiers (catalog-pin, TG005-R-M01/M05)

Каждый constraint/index объявляется в migration с приведённым ниже именем; таблицы только `CREATE TABLE`
(первичные ключи и NOT NULL в объявлении таблицы), все дополнияющие constraints/индексы — отдельными
`ALTER TABLE ... ADD CONSTRAINT ...` / `CREATE UNIQUE INDEX ...` (по одному оператору на constraint) для
детерминированной проверки и читаемого диффа.

| Имя | Тип | Объект |
|---|---|---|
| `ck_user_role_binding_role` | CHECK | `user_role_binding.role` |
| `ck_user_role_binding_shape` | CHECK | shape `user_role_binding` |
| `ck_max_identity_link_status` | CHECK | `max_identity.link_status` |
| `ck_max_identity_readiness` | CHECK | readiness `max_identity` |
| `ck_demo_run_status` | CHECK | `demo_run.status` |
| `ck_demo_run_actor_role` | CHECK | `demo_run_actor.role` |
| `ck_category_result_requirement` | CHECK | `category.result_requirement` |
| `uq_max_identity_mini_app_user_id` | UNIQUE partial | `max_identity (mini_app_user_id)` WHERE ... IS NOT NULL |
| `uq_max_identity_bot_user_id` | UNIQUE partial | `max_identity (bot_user_id)` WHERE ... IS NOT NULL |
| `uq_max_identity_app_user_id` | UNIQUE partial | `max_identity (app_user_id)` WHERE ... IS NOT NULL |
| `uq_demo_run_active_per_identity` | UNIQUE partial | `demo_run (created_by_max_identity_id)` WHERE status = 'ACTIVE' |
| `cq_house_organization_house` | UNIQUE | `house (organization_id, house_id)` |
| `cq_premises_house_premises` | UNIQUE | `premises (house_id, premises_id)` |
| `cq_category_organization_category` | UNIQUE | `category (organization_id, category_id)` |
| `uq_demo_run_actor_role_alias` | UNIQUE | `demo_run_actor (demo_run_id, role, actor_alias)` |
| `pk_resident_premises_access` | PK | `resident_premises_access (app_user_id, premises_id)` |
| `pk_uk_house_access` | PK | `uk_house_access (app_user_id, house_id)` |
| `pk_organization_contractor` | PK | `organization_contractor (organization_id, contractor_id)` |
| `pk_demo_run_actor` | PK | `demo_run_actor (demo_run_id, app_user_id)` |
| `fk_<child>_<parent>_id` | FK | каждый внешний ключ (наименование по шаблону таблица-ФК-колонка) |

Полный FK-список (19): `fk_house_organization_id`, `fk_premises_house_id`, `fk_category_organization_id`,
`fk_category_default_contractor_id`, `fk_category_updated_by_user_id`, `fk_user_role_binding_app_user_id`,
`fk_user_role_binding_organization_id`, `fk_user_role_binding_contractor_id`,
`fk_resident_premises_access_app_user_id`, `fk_resident_premises_access_premises_id`,
`fk_uk_house_access_app_user_id`, `fk_uk_house_access_house_id`, `fk_max_identity_app_user_id`,
`fk_demo_run_created_by_max_identity_id`, `fk_demo_run_notification_recipient_max_identity_id`,
`fk_demo_run_actor_demo_run_id`, `fk_demo_run_actor_app_user_id`, `fk_organization_contractor_organization_id`,
`fk_organization_contractor_contractor_id`.

Примечание о tenant composite candidate keys: `cq_house_organization_house`, `cq_premises_house_premises`,
`cq_category_organization_category` существуют как unique-constraints в каталоге и являются избыточными относительно
single-column PK соответствующих таблиц (`house_id`, `premises_id`, `category_id` уже уникальны). Поэтому они
**проверяются каталогом** (существование + точные колонки + точное имя), а не дубликатными фикстурами — отрицательная
вставка по такой паре упала бы по single-column PK, а не по составному key (ложно-негативная интерпретация).
Единственная отрицательная составно-ключа фикстура — дубликат `pk_organization_contractor` (настоящий composite PK).

### Общие правила

- Все PK — `uuid` (id-пolicy Data Model § 1.1). Никаких serial/sequence идентификаторов.
- `created_at`/`updated_at` — `timestamptz NOT NULL`, **без DB defaults**; значения предоставляет приложение.
- `app_user.is_synthetic boolean NOT NULL DEFAULT false` — единственный `DEFAULT` в schema (см. § 8).
- CHECK-constraints вместо native enum types (Data Model § 24 п. 4: «CHECK для enum/state-consistent полей»).
- Tenant composite unique keys на `house`, `premises`, `category` закладывают базу для same-tenant composite FK
  Case (Data Model § 26.1), который вводит TG-006.
- Одно `CREATE TABLE` на таблицу + одно `ALTER TABLE ... ADD CONSTRAINT ...` / одно `CREATE UNIQUE INDEX ...` на
  каждом constraint/index для детерминированной проверки и читаемого диффа. `down` — ровно обратные `DROP INDEX`
  и `DROP TABLE` (обратный порядок FK).

## 8. Kysely Type Surface (часть `packages/db/src/index.ts`)

- Типы размещаются в едином boundary-файле `packages/db/src/index.ts` (**без** отдельного `src/types.ts`; основание —
  § 6 layout-примечание, frozen `include:["src/index.ts"]` + `composite:true` ⇒ TS6307). Импорты типов из `kysely`:
  `Generated`, `ColumnType`; импорт типа `Kysely` из `kysely`.
- Интерфейсы таблиц по одной на каждую из 13 таблиц (имена: `OrganizationTable`, `HouseTable`,
  `PremisesTable`, `AppUserTable`, `UserRoleBindingTable`, `ResidentPremisesAccessTable`, `UKHouseAccessTable`,
  `MaxIdentityTable`, `CategoryTable`, `ContractorTable`, `OrganizationContractorTable`, `DemoRunTable`,
  `DemoRunActorTable`); поля соответствуют DDL § 7 1:1:
  - `uuid` → `string`;
  - `text` → `string`;
  - `boolean` → `boolean`;
  - `timestamptz` → `Date`;
  - `config_revision` (`category`, `bigint` / PostgreSQL `int8`) → `ColumnType<string, number | string, number | string>`
    (`pg` по умолчанию возвращает `int8` как string; кастомные `pg.types.setTypeParser` не используются — принцип
    M03: exact Kysely/pg column types);
  - `app_user.is_synthetic` → `Generated<boolean>` (DB default `false`, insert не требуется; `Generated` из `kysely`);
  - nullable → `| null`.
- Закрытые enum union-типы: `Role = 'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'CONTRACTOR_EMPLOYEE'`,
  `ResultRequirement = 'NONE' | 'PHOTO' | 'FILE'`, `DemoRunStatus = 'ACTIVE' | 'ARCHIVED'`,
  `MaxIdentityLinkStatus = 'UNLINKED' | 'LINKED_CONFIRMED'`.
- Public aggregate: `export interface Database { organization: OrganizationTable; ... все 13 ключей ... }` и
  `export type DB = Database` (алиас для краткости будущих consumers).
- `src/index.ts` self-contained: **без** относительных импортов src-модулей (единственные imports — `node:*`,
  `kysely`, `kysely/migration`). Runner-часть (§ 9) экспортируется из того же `src/index.ts`.

## 9. Migration Runner Foundation (часть `packages/db/src/index.ts`)

Exact API Kysely **0.29.6** (проверено по `dist/migration/migrator.d.ts` и `dist/migration/file-migration-provider.js|.d.ts`
пакета `kysely@0.29.6`; M02; эмпирически исполнено на Windows, TS 7.0.2, vitest 5.0.1 — § 2.8). Imports:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ColumnType, Generated, Kysely } from 'kysely';
import { FileMigrationProvider, Migrator, NO_MIGRATIONS } from 'kysely/migration';
import type { MigrationResult, MigrationResultSet } from 'kysely/migration';
```

Зафиксированные детали API (0.29.6):

- `NO_MIGRATIONS` — экспортированная константа `NoMigrations` из `kysely/migration` (rollback до нулевого состояния
  через `migrateTo(NO_MIGRATIONS)`); отдельный статический атрибут класса `Migrator.NO_MIGRATIONS` НЕ существует;
  используется именно импорт из `kysely/migration`.
- `FileMigrationProvider` props: `{ fs: { readdir(path): Promise<string[]> }, import?: (module) => Promise<unknown>,
  migrationFolder: string, onFileIgnored?, path: { join(...p): string } }`. `path` передаётся как `import * as path`
  из `node:path`; `migrationFolder` — абсолютный.
- **`import` prop обязателен** (эмпирически доказано, § 2.8): без него дефолт пути в `file-migration-provider.js`
  делает `await import(filePath)` с **сырым абсолютным путём**, что является невалидным ESM specifier на любой
  платформе (POSIX: "Only URLs with a scheme in: file, data, and node ..."; Windows: `protocol 'd:'`). TG-005
  передаёт `import: (modulePath) => import(pathToFileURL(modulePath).href)`.
- `Migrator` props: `db`, `provider`, опционально `migrationTableName`, `migrationLockTableName`,
  `allowUnorderedMigrations` (default `false`), `migrationTableSchema`, `disableTransactions`.
- `migrateToLatest(...)` / `migrateTo(name | NO_MIGRATIONS, ...)` возвращают `MigrationResultSet`
  `{ error?: unknown, results?: MigrationResult[] }` и **никогда не бросают**; `error` проверяется явно.
- **`exactOptionalPropertyTypes: true` (frozen base):** `return { results }` c `results: MigrationResult[] | undefined`
  не компилируется (TS2375 — `MigrationResult[] | undefined` не assignable к optional `results?`). Возвращается
  `results === undefined ? {} : { results }` (обе функции; эмпирически подтверждено, § 2.8).
- Migration-файлы экспортируют `export async function up(db: Kysely<any>): Promise<void>` и
  `export async function down(db: Kysely<any>): Promise<void>` (Direction по имени файла).

Pinned реализация (public contract модуля `src/index.ts`):

```ts
const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function resolveMigrationsDir(moduleDir: string): string {
  return path.basename(moduleDir) === 'dist'
    ? path.join(moduleDir, 'migrations')
    : path.join(path.dirname(moduleDir), 'migrations');
}

export const MIGRATIONS_DIR = resolveMigrationsDir(currentDir);

const importModule = (modulePath: string): Promise<unknown> =>
  import(pathToFileURL(modulePath).href);

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    migrationTableName: 'kysely_migration',
    migrationLockTableName: 'kysely_migration_lock',
    allowUnorderedMigrations: false,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_DIR, import: importModule }),
  });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<MigrationResultSet> {
  const { error, results } = await createMigrator(db).migrateToLatest();
  if (error) throw error;
  return results === undefined ? {} : { results };
}

export async function rollbackAll(db: Kysely<Database>): Promise<MigrationResultSet> {
  const { error, results } = await createMigrator(db).migrateTo(NO_MIGRATIONS);
  if (error) throw error;
  return results === undefined ? {} : { results };
}
```

- `MIGRATIONS_DIR` резолвится **dual-anchor** (без выбора агента): для модуля в `.../dist` → `.../dist/migrations`
  (compiled runtime), для модуля в `.../src` → `.../migrations/` (vitest source-mode). Оба пути эмпирически исполнены:
  source-mode грузит `.ts` миграцию через vite-node, compiled-mode грузит `dist/migrations/*.js` в plain Node (§ 2.8).
- Интеграционные тесты импортируют **source** `./index.js` под vitest (НЕ compiled `dist/...`) и создают
  `createMigrator` из исходников; миграции читаются из `packages/db/migrations/` (§ 13.2).
- Никаких новых `scripts` (frozen § 14 TG-001). Значения `TG005_TEST_DATABASE_URL` в runtime самого runner
  не используются; runner принимает `db` как аргумент (инверсия зависимостей).
- Никаких импортов из других workspaces, никаких `process.env` чтений в production-коде пакета.
- Public boundary файла дополнительно экспортирует `MIGRATIONS_DIR`, `resolveMigrationsDir` (diagnostics/testability)
  и возвращаемые типы `MigrationResultSet`/`MigrationResult` ре-экспортированные из `kysely/migration`.

## 10. Build / Layout (packages/db)

- `packages/db/tsconfig.json` — **frozen** (B02). TG-005 его не изменяет. Его актуальные поля (baseline BASE_SHA):
  `module`/`moduleResolution` `NodeNext`, `target` ES2023, `rootDir "src"`, `outDir "dist"`, **`composite: true`**,
  `declaration/declarationMap/sourceMap` true, `tsBuildInfoFile "dist/.tsbuildinfo"`, `types ["node"]`,
  **`include ["src/index.ts"]`**, `exclude ["dist","node_modules"]`. Следствие (эмпирически доказано):
  `composite:true` + узкий `include` запрещает импорты sibling-файлов из `src/index.ts` (TS6307) — поэтому boundary —
  один self-contained `src/index.ts` (§ 6, § 8).
- `packages/db/tsconfig.migrations.json` (new, TG-005-owned) — `extends "./tsconfig.json"` (frozen: наследует
  `module`/`moduleResolution` `NodeNext` и `types:["node"]`; НЕ `extends tsconfig.base.json` — там `types:[]`
  и не заданы module-поля, что даёт TS2591 для `node:*` импортов); overrides:
  `"rootDir": "migrations"`, `"outDir": "dist/migrations"`, `"composite": false`, `"declaration": false`,
  `"declarationMap": false`, `"sourceMap": false`, `"include": ["migrations/**/*.ts"]`, `"exclude": ["dist","node_modules"]`.
  Сборка: `tsc -p tsconfig.migrations.json` → `dist/migrations/0001_foundation.js`. **Проверено: exit 0.**
- `packages/db/tsconfig.typecheck.json` (new, TG-005-owned) — `extends "./tsconfig.json"`; overrides:
  `"composite": false`, `"noEmit": true`, `"include": ["src/index.ts","src/types.typecheck.ts"]`.
  Compile-time gate для type surface и runner. **Проверено: exit 0.**
- `packages/db/package.json` — edit: **только** добавление зависимостей § 12. Frozen поля не меняются:
  `type module`, `private`, `files ["dist"]`, ровно три scripts (`build` / `typecheck` / `test` = `vitest run src/index.test.ts`),
  `types "./dist/index.d.ts"`, `exports { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }`
  (без `require`/`default`/subpath). Frozen поля `types`/`exports` НЕ содержат `dist/src`-префикса (correction R3;
  layout плоский).
- Итоговый layout (flat, без `dist/src`): `dist/index.js`, `dist/index.d.ts`, `dist/index.js.map`,
  `dist/index.d.ts.map`, `dist/.tsbuildinfo`, `dist/migrations/0001_foundation.js`.
- Публичный контракт пары `@max-smart-city/db` для других workspaces сохраняется: единственный entry `.` (ESM);
  меняется только внутренняя компоновка `dist` (добавляется `dist/migrations/**`).

## 11. Node / npm Baseline

Точно как TG-001 § 9 (root `engines` и `packageManager` заморожены):

| Поле | Обязательное значение |
|---|---|
| Node | `24.21.0` (LTS Krypton) |
| npm | `11.19.0` |
| Соответствие | `node --version` = `v24.21.0`, `npm --version` = `11.19.0` |

Локальная среда проверки может давать другой Node (например Current v26): это не повод менять baseline —
использовать инструмент переключения (nvm/volta) или среду Docker. Иначе — `NODE_NPM_BASELINE_MISMATCH`.

## 12. Dependency Manifest

Всё независимо проверено по npm registry metadata **2026-09-23**. Только `latest dist-tag`, только stable
(без `-rc`/`-beta`/`-dev`).

### REQUIRED NOW

| Workspace owner | Dependency | Exact Version | Type | Проверено (registry) |
|---|---:|---:|---|---|
| `packages/db` | `kysely` | `0.29.6` | dependency | последний stable; 0.30.0-* — только prereleases |
| `packages/db` | `pg` | `8.23.0` | dependency | актуальный stable |
| `packages/db` | `@types/pg` | `8.23.1` | devDependency | актуальный stable |

Правила:

- никаких range tokens `^`, `~`, `latest`, `*`;
- других новых dependencies в TG-005 нет; internal workspace links не добавляются (`packages/db` не импортирует
  другие workspaces);
- transitive resolution авторитетен через единственный root lockfile;
- версии выбираются/пинятся только этим контрактом; не наследуются и не переоткрываются coding-agent;
- root `package-lock.json` генерируется только для локальной install-проверки и восстанавливается к `BASE_SHA`
  (B01, § 6.1/§ 16.2).

### Deferred (не устанавливать в TG-005)

- `case`/`result`/`event`/`attachment`/`outbox`/`command` tables — TG-006/TG-007;
- DB repositories/transaction kernel — owner tasks TG-012 и далее;
- seed logic — TG-008;
- `@max-smart-city/contracts` / `@max-smart-city/domain` импорты в db — на текущую дату не требуются и запрещены.

## 13. Tests

### 13.1. Unit / compile-time (offline, без БД) — `src/foundation.unit.test.ts`, `src/types.typecheck.ts`

- `foundation.unit.test.ts`:
  - миграция `0001_foundation.ts` экспортирует функции `up` и `down`, типы соответствуют `Migration` из
    `kysely/migration` (`up(db: Kysely<any>): Promise<void>`);
  - DDL-манифест сверяется со списком § 7: ровно 13 таблиц; ровно 4 partial unique index в `up`-тексте
    (имена `uq_max_identity_mini_app_user_id`, `uq_max_identity_bot_user_id`, `uq_max_identity_app_user_id`,
    `uq_demo_run_active_per_identity`) и их предикаты `WHERE ... IS NOT NULL` / `WHERE status = 'ACTIVE'`;
  - **`resolveMigrationsDir` law (offline, без БД):**
    `expect(resolveMigrationsDir(path.join('packages','db','src'))).toBe(path.join('packages','db','migrations'))`
    и `expect(resolveMigrationsDir(path.join('packages','db','dist'))).toBe(path.join('packages','db','dist','migrations'))`;
  - `expectTypeOf`-проверки: `Database` содержит ровно 13 ключей; `Role`/`ResultRequirement`/`DemoRunStatus`/
    `MaxIdentityLinkStatus` закрыты ровно заданными значениями; `config_revision` имеет тип
    `ColumnType<string, number | string, number | string>`; `is_synthetic` — `Generated<boolean>`.
- `types.typecheck.ts` (compile-time type suite для `tsconfig.typecheck.json`, `noEmit`): импортирует из `./index.js`
  и ассертит те же свойства на уровне типов через локальные `type Expect<T extends true> = T` / `Equal<A, B>`-helper-ы
  (без runtime-зависимостей).
- Запрещено: любое расширение enum-union-ов «на глаз»; любое предположение `mini_app_user_id == bot_user_id`.

### 13.2. Integration (real PostgreSQL) — `src/db-foundation.integration.test.ts`

- подключение по `TG005_TEST_DATABASE_URL` (см. § 14);
- **clean migrate:** на пустую БД мигрировать к latest через `createMigrator`, импортированный из **source**
  `./index.js` (vitest; НЕ compiled `dist/...`); проверить наличие ровно 13 таблиц и ключевых constraint/индекс-имён
  из § 7 в `pg_catalog` (в т.ч. `pg_get_indexdef`/`pg_get_constraintdef` для partial-индексов — assertion по точному
  тексту, не substring);
- **compiled-mode smoke:** отдельно импортировать `./packages/db/dist/index.js` в plain Node (`node --input-type=module`),
  проверить что `MIGRATIONS_DIR` оканчивается на `dist/migrations`, и что `FileMigrationProvider` (с `import` prop)
  загружает `0001_foundation` из `dist/migrations/` (§ 16.4);
- **rollback policy:** полный down `rollbackAll` (= `migrateTo(NO_MIGRATIONS)`) → все 13 таблиц и 4 partial index
  отсутствуют; повторный up → все 13 таблиц снова, содержимое пусто;
- прогон дважды подряд = идемпотентность (повторный up no-op; `error` из `MigrationResultSet` строго `undefined`).

### 13.3. Integration negative fixtures — `src/db-constraints.integration.test.ts`

- каждый negative-инсерт в explicit transaction с ожидаемым SQLSTATE (`23505` unique_violation / `23514`
  check_violation / `23503` foreign_key_violation) **и** `constraint name` в тексте ошибки (pg возвращает `DETAIL`
  с конкретным именем constraint);
- **role shapes (M04):** `RESIDENT` с непустым `organization_id`/`contractor_id` → reject (23514,
  `ck_user_role_binding_shape`); `UK_EMPLOYEE`/`UK_ADMIN` c `organization_id NULL` или `contractor_id NOT NULL` →
  reject; `CONTRACTOR_EMPLOYEE` c `contractor_id NULL`/`organization_id NOT NULL` → reject; валидные инсерты каждой
  роли из 4 → accept;
- **MaxIdentity readiness (M05, R3 — обе NULL-негативные фикстуры):**
  - `LINKED_CONFIRMED` c `delivery_chat_id NULL` и `delivery_chat_type` валидным non-null → reject
    (23514, `ck_max_identity_readiness`);
  - `LINKED_CONFIRMED` c `delivery_chat_id` валидным non-null и `delivery_chat_type NULL` → reject
    (23514, `ck_max_identity_readiness`);
  - c обоими NOT NULL → accept; `UNLINKED` c NULL-ами → accept;
  - фикстуры строятся на строках, удовлетворяющих всем прочим ограничениям (созданы валидные FK-родители,
    уникальные mini/bot/app id), чтобы единственно возможной ошибкой был 23514 на `ck_max_identity_readiness`
    (никакой предшествующий FK/PK failure — требование exact-priority, TR-02);
  - duplicate `app_user_id` (второй любой MaxIdentity c тем же непустым `app_user_id`) → reject
    (23505, `uq_max_identity_app_user_id`);
  - duplicate `mini_app_user_id`/`bot_user_id` → reject (соотв. partial index name);
- **duplicate ACTIVE DemoRun:** два `ACTIVE` run для одного `created_by_max_identity_id` → reject (23505,
  `uq_demo_run_active_per_identity`); `ACTIVE` + `ARCHIVED` → accept;
- **composite candidate keys (M05):** существование `cq_house_organization_house`, `cq_premises_house_premises`,
  `cq_category_organization_category` подтверждается каталогом (`pg_index`/`pg_constraint`: точные имена и колонки) —
  НЕ дубликатными вставками (избыточны относительно single-column PK; п. «Exact constraint identifiers» § 7);
  единственная отрицательная составно-ключа фикстура — дубликат `(organization_id, contractor_id)` в
  `organization_contractor` → reject (23505, `pk_organization_contractor`).

### 13.4. Boundary smoke — `src/index.test.ts` (replaces TG-001 placeholder)

- импортирует `./index.js`; проверяет, что `migrateToLatest`/`createMigrator`/`rollbackAll` присутствуют как
  функции и что тип-поверхность `Database` доступна как type export; тест-имя содержит
  `TG-005 db boundary surface`.

Frozen workspace `test` script (`vitest run src/index.test.ts`) обязан остаться green. Новые unit/integration
файлы запускаются явными командами verification (§ 16, не меняют frozen scripts).

## 14. PostgreSQL Verification Strategy (explicit)

- Integration tests выполняются только против реального PostgreSQL (Postgres 17/18; рекомендуемый 18).
  SQLite/in-memory/mock-only не является evidence и запрещён.
- Соединение: env `TG005_TEST_DATABASE_URL`; **safety-guard:** имя базы обязано заканчиваться на `_tg005_test`
  (проверка `current_database()` в каждом integration-файле; иначе `throw 'UNSAFE_TEST_DATABASE'`).
- Catalog-exact assertions (TG005-R-M05): все проверки существования constraints/индексов идут через `pg_catalog`
  (`pg_constraint`, `pg_index`, `pg_attribute`), где `pg_get_indexdef(index_oid)` / `pg_get_constraintdef(oid)`
  дают точный DDL-текст, и тест ассертит его **полным равенством** заявленной строке (имя + колонки + предикат).
  Substring/grep-соответствия запрещены как evidence.
- Negative fixtures изолированы в explicit transactions; `constraint name` ожидается в `DETAIL` ошибки.
- Provisioning (на выбор Orchestrator/Execution Environment):
  1. локальный сервис `postgresql-x64-18` на `localhost:5432` с выданными credentials (проверен running,
     `pg_isready` OK), либо
  2. эфемерный Docker `postgres:18` (`docker run -d -p 127.0.0.1:54329:5432 -e POSTGRES_PASSWORD=<ephemeral> -e POSTGRES_DB=<name>_tg005_test postgres:18`), Docker 29.7.2 доступен.
- Если ни один вариант недоступен и соединение не устанавливается → `POSTGRES_PROVISIONING_BLOCKED`;
  integration evidence отсутствует; coding-агент останавливается и не изображает прохождение.

## 15. Deterministic Implementation Instructions

1. Выполнить preconditions § 5; при mismatch stop.
2. На readonly `BASE_SHA` зафиксировать эталон: `git rev-parse HEAD` = `200b117bd58f7080c15fba1cfa556d386a085c99`
   (полный SHA; сокращения/elliptic truncation запрещены).
3. Создать/изменить только whitelist § 6; **не** трогать root `package-lock.json` и frozen
   `packages/db/tsconfig.json`.
4. Внести exact-pinned dependencies § 12 в `packages/db/package.json`; layout по § 10.
5. Создать supplementary конфиги `tsconfig.migrations.json` и `tsconfig.typecheck.json` (§ 10); frozen `tsconfig.json`
   не изменять.
6. Написать `migrations/0001_foundation.ts` (DDL § 7, up+down, exact constraint names § 7).
7. Написать единый `src/index.ts` (§ 8–9: type surface + runner, без относительных src-импортов) и
   `src/types.typecheck.ts` (§ 13.1); заменить placeholder boundary. Отдельные `src/types.ts`/`src/migrator.ts`
   **не создаются** (layout-примечание § 6).
8. Обновить `src/index.test.ts`; написать unit и integration tests § 13.
9. При exact Node/npm baseline: `npm install --package-lock-only --ignore-scripts`, затем `npm ci`, затем
   `git restore --source 200b117bd58f7080c15fba1cfa556d386a085c99 -- package-lock.json` (B01; lockfile не stage'ится).
10. Выполнить verification § 16; не исправлять failures расширением scope; при необходимости forbidden
    file/dependency — § 17.
11. Только после всех AC: stage exact whitelist, проверить staged diff, human Git identity, commit/push § 18.

## 16. Verification Commands

Выполнять строго по порядку из repository root в PowerShell. В начале каждой verification session — fail-closed
prologue; после него любой non-zero native exit останавливает script/commit/push:

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true   # PowerShell 7.3+; на Windows PowerShell 5.1 не действует
$BaseSha = '200b117bd58f7080c15fba1cfa556d386a085c99'
```

Примечание (POWERSHELL_VERIFICATION): блок синтаксически валиден и в Windows PowerShell 5.1 (5.1 не знает
`$PSNativeCommandUseErrorActionPreference` — тогда после каждой нативной команды обязательна явная проверка
`if ($LASTEXITCODE -ne 0) { throw '...' }`; недостаток 5.1 не является причиной менять baseline). Команды ниже
используют `$BaseSha` (никаких сокращённых SHA и Unicode-ellipsis).

1. **Preconditions:** команды § 5 + origin-проверка + `node --version` / `npm --version` (baseline § 11) +
   `git merge-base --is-ancestor $BaseSha HEAD` (если это не ancestor — throw `TASK_BRANCH_BASE_MISMATCH`).
2. **Lockfile/repro (B01):**
   ```powershell
   (Get-FileHash -Algorithm SHA256 package-lock.json).Hash
   npm install --package-lock-only --ignore-scripts
   npm ci
   (Get-FileHash -Algorithm SHA256 package-lock.json).Hash   # равен предыдущему
   git restore --source $BaseSha -- package-lock.json       # TG-005 не владеет lockfile
   git status --short                                       # не должно содержать package-lock.json
   ```
3. **Typecheck:** `npm run typecheck`.
4. **Build + supplementary configs (flat layout, no `dist/src`):**
   ```powershell
   npm run build
   npm exec --workspace @max-smart-city/db -- tsc -p tsconfig.migrations.json
   npm exec --workspace @max-smart-city/db -- tsc -p tsconfig.typecheck.json
   -not (Test-Path packages/db/dist/src)               # negative guard: dist/src отсутствует (TR-01)
   Test-Path packages/db/dist/index.js
   Test-Path packages/db/dist/index.d.ts
   Test-Path packages/db/dist/migrations/0001_foundation.js
   Test-Path packages/db/dist/.tsbuildinfo
   node --input-type=module -e "Promise.resolve().then(async () => { const fs = await import('node:fs/promises'); const path = await import('node:path'); const { pathToFileURL } = await import('node:url'); const { FileMigrationProvider } = await import('kysely/migration'); const m = await import('./packages/db/dist/index.js'); const last = m.MIGRATIONS_DIR.split(/[\\/]+/); if (last.slice(-2).join('/') !== 'dist/migrations') { throw new Error('MIGRATIONS_DIR_EXPECTED_DIST_MIGRATIONS'); } const provider = new FileMigrationProvider({ fs, path, migrationFolder: m.MIGRATIONS_DIR, import: (p) => import(pathToFileURL(p).href) }); const loaded = await provider.getMigrations(); if (!Object.keys(loaded).includes('0001_foundation')) { throw new Error('COMPILED_MIGRATIONS_NOT_LOADED'); } })"
   if ($LASTEXITCODE -ne 0) { throw 'COMPILED_MIGRATION_RUNTIME_CHECK_FAILED' }
   ```
   (compiled-mode smoke проверяет flat entry `dist/index.js`, resolution `dist/migrations` и runtime-load
   миграции в plain Node без vitest.)
5. **Workspace test:** `npm test` (все five workspaces green; db — TG-005 boundary smoke).
6. **Unit + compile-time type:** `npm exec --workspace @max-smart-city/db -- vitest run src/index.test.ts src/foundation.unit.test.ts`.
7. **Integration (real PG):**
   ```powershell
   $env:TG005_TEST_DATABASE_URL = '<provisioned>'
   npm exec --workspace @max-smart-city/db -- vitest run src/db-foundation.integration.test.ts src/db-constraints.integration.test.ts
   ```
   (safety-guard обязателен; см. § 14. Catalog-exact assertions — по § 7/§ 13.2.)
8. **Dependency checks:** exact-pin regex по всем manifests; `npm ls --all`; ровно один root `package-lock.json`
   (lockfileVersion 3), его содержимое равно `$BaseSha`-версии (после restore § 16.2); root `package.json`
   и чужие workspace manifests не изменены.
9. **Forbidden artifacts scan:** `Dockerfile*`, `compose*`, `openapi*`, `.env*`, `seed`, `Case`-таблиц в SQL,
   пятой роли, native enum `CREATE TYPE` — отсутствуют; `tests/integration`, `tests/e2e` не создаются.
10. **Diff whitelist:** `git diff --name-only $BaseSha --` + untracked (`git status --porcelain`) ⊂ § 6;
    `git diff --check`; `git diff --stat`. Root `package-lock.json` и `packages/db/tsconfig.json` обязаны
    отсутствовать в diff.
11. **Staged validation:** `git add --` exact whitelist; проверить `git status` staged set == whitelist; diff staged.

Отчёт называет integration/E2E-существа честно: если PG недоступен — `NOT RUN / POSTGRES_PROVISIONING_BLOCKED`,
не `PASS`.

## 17. Escalation Triggers

- SPEC/architecture conflict в источниках § 2 → `SPEC CONFLICT` (STOP; не писать обходных решений).
- BASE_SHA/main-drift или лишние local changes → `BASELINE_MISMATCH`.
- Выход за whitelist § 6 → `WRITE_SCOPE_VIOLATION`.
- Невозможность harness c frozen scripts/manifest root → `FROZEN_MANIFEST_CONFLICT`.
- Попытка закоммитить root `package-lock.json` или изменить frozen `packages/db/tsconfig.json` → `FROZEN_MANIFEST_CONFLICT`.
- Нет PostgreSQL provisioning → `POSTGRES_PROVISIONING_BLOCKED`.
- Dependency version drift от § 12 → `DEPENDENCY_VERSION_DRIFT`.
- Любой запрещённый artifact (§ 16.9) → `FORBIDDEN_ARTIFACT_FOUND`.
- Неисправимая проблема без расширения scope → следовать из § 15.10 и отчитаться, не force-push, не amend.

## 18. Commit / Push Requirements

- Local branch: `codex/tg-005-db-foundation` от `200b117bd58f7080c15fba1cfa556d386a085c99` (bootstrap Orchestrator;
  § 5). После implementation: `git push origin codex/tg-005-db-foundation` без `-u`.
- Один implementation commit. Commit subject (exact): `data(db): establish configuration/identity/demo foundation`.
- Whitelist commit содержит ровно файлы § 6; root `package-lock.json` и frozen configs — НЕ входят (B01/B02).
- Использовать существующую HUMAN Git identity. Никаких AI author/co-author/авто-подписей.
- Никаких secrets в диффе: connection strings/токены/Bot Token не попадают в tracked files.
- Вернуть полный commit SHA и статус push.
- Этот commit НЕ является stable checkpoint. Stable `main` для волны создаёт только отдельный Integration Agent,
  который же формирует канонический manifest/lockfile batch.

## 19. Acceptance Criteria

- **AC-001** — clean migrate: на пустой real-PostgreSQL `*_tg005_test`-базе полный up к latest успешен; 13 таблиц § 7 существуют.
- **AC-002** — rollback policy: `rollbackAll` (down через `NO_MIGRATIONS`) удаляет все 13 таблиц и 4 partial index;
  повторный up идентичен; повторный up no-op без содержимого.
- **AC-003** — unique normal mapping: вставка второго MaxIdentity с тем же непустым `app_user_id` отклонена (23505,
  `uq_max_identity_app_user_id`); единственный mapping допустим.
- **AC-004** — MAX readiness (M05/TR-02, обе NULL-негативные фикстуры): `LINKED_CONFIRMED` c `delivery_chat_id NULL`
  при валидном non-null `delivery_chat_type` → reject (23514, `ck_max_identity_readiness`); `LINKED_CONFIRMED`
  c `delivery_chat_id` валидным non-null при `delivery_chat_type NULL` → reject (23514, `ck_max_identity_readiness`);
  с обоими NOT NULL принят; `UNLINKED` с NULL-ами принят; единственно возможная ошибка в негативных фикстурах — 23514
  readiness (никакой предшествующий FK/PK failure).
- **AC-005** — один ACTIVE DemoRun: второй `ACTIVE` для той же `created_by_max_identity_id` отклонён (23505,
  `uq_demo_run_active_per_identity`); `ACTIVE + ARCHIVED` допустим.
- **AC-006** — role-binding shapes (M04): все запрещённые комбинации § 7 отклоняются (23514); все четыре валидных
  шаблона приняты.
- **AC-007** — tenant keys (M05): `cq_house_organization_house`, `cq_premises_house_premises`,
  `cq_category_organization_category` существуют в каталоге с точными именами/колонками; дубликат
  `(organization_id, contractor_id)` в `organization_contractor` отклонён (23505, `pk_organization_contractor`).
- **AC-008** — Kysely type surface компилируется (`npm run build` + `tsc -p tsconfig.typecheck.json`);
  `export type { Database, DB }` доступен через `.`-entry; union-типы и `ColumnType`/`Generated`-колонки закрыты
  ровно заданными значениями (§ 8).
- **AC-009** — migration runner foundation: `createMigrator`/`migrateToLatest`/`rollbackAll` экспортируются и работают
  против реального PostgreSQL на exact API 0.29.6 (§ 9); возвращаемый объект корректен при
  `results === undefined` (exactOptionalPropertyTypes).
- **AC-013** — compiled layout (B02/TR-01/M05): flat `dist/` без `dist/src` (negative guard § 16.4);
  `dist/migrations/0001_foundation.js` присутствует; compiled `MIGRATIONS_DIR` из `dist/index.js` резолвится
  в `<pkgRoot>/dist/migrations` и загружает миграцию в plain Node (§ 13.2/§ 16.4).
- **AC-010** — no Case tables, нет пятой роли, нет native `CREATE TYPE`, нет `bot_user_id == mini_app_user_id`-assumption
  в DDL, нет secrets.
- **AC-011** — diff whitelist exact § 6; dependencies exact-pinned; единственный root lockfile (содержимое равно
  `BASE_SHA`, не закоммичен); frozen root и `packages/db/tsconfig.json` не изменены.
- **AC-012** — workspace `test` green (boundary surface), unit + integration evidence честно задокументированы.

## 20. Parallel Collision Model (Wave 1, explicit)

- TG-002 (packages/contracts), TG-003 (apps/api), TG-004 (apps/web) — параллельно, каждый в своей директории;
  пересечений по author-write paths нет.
- Общий файл волны — root `package-lock.json`. По B01 TG-005 НЕ владеет root lockfile: он регенерируется каждым
  wave-agent только локально (`npm install --package-lock-only --ignore-scripts` → `npm ci`) для детерминированной
  проверки своей ветки и возвращается к `BASE_SHA` (`git restore --source $BaseSha -- package-lock.json`), никогда
  не stage'ится и не коммитится. Канонический manifest/lockfile batch волны создаёт только Integration Agent на
  Wave-1 checkpoint (`SHARED_CONFIG_BATCH_OWNER = INTEGRATION_AGENT`); одновременные правки root lockfile в волне
  отсутствуют.
- Frozen workspace configs (`packages/db/tsconfig.json` и аналоги) — не owned TG-005 (B02); TG-005 добавляет только
  свои supplementary конфиги `tsconfig.migrations.json`/`tsconfig.typecheck.json` в `packages/db`.
- `packages/db` — монопольно LANE-B в TG-005–TG-008; migrations добавляются новыми файлами, foundation
  immutability — после Wave 1 checkpoint (§ 3 Integration Notes).