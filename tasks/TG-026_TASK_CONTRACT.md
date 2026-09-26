# TG-026 — DB constraints, concurrency и idempotency regression suite

## 1. Identity / BASE_SHA

```text
TASK_ID = TG-026
TITLE = DB constraints, concurrency и idempotency regression suite
TYPE = TEST
EXECUTION_CLASS = A — Implementation/Test
RISK_CLASS = CRITICAL
PRIMARY_OWNERSHIP = LANE-B
CONTRACT_BASE_SHA = 5493905ac2e9ed7bbc21527acd9d4dc0eddc9bc5
CONTRACT_BRANCH = codex/tg-026-contract
UPSTREAM_TG008_CONTRACT_SHA = 77724fa6ef8cc8556488a1f241aa523f32ceb3ed
UPSTREAM_TG012_CONTRACT_SHA = 405c932b0d9362840b3691cba1103e50ac1a19a3
UPSTREAM_TG016_CONTRACT_SHA = 8c51b860fc0d77a918746b259b6724fcf144f161
UPSTREAM_TG018_CONTRACT_SHA = 1dc606b4e510c469a26bb6859c9de949904d0b22
UPSTREAM_TG019_CONTRACT_SHA = a2b89b96d8b33d799483953a71ca0f2f305c4087
IMPLEMENTATION_BLOCKED_UNTIL_ALL_DEPENDENCIES = YES
```

`CONTRACT_BASE_SHA` — actual `origin/main` после `git fetch`, сверенный с `git rev-parse HEAD` ветки `codex/tg-026-contract`. Сейчас разрешены **только** authoring этого файла + self-check → **один** independent review. Это не implementation base: TG-026 implementation получает отдельный актуальный base только после завершения **всех пяти** direct dependencies (TG-008, TG-012, TG-016, TG-018, TG-019) и сверки их финальных implementation SHA. Upstream SHAs — reviewed/final **contracts**; они разрешают authoring, но не доказывают интеграцию implementations в base. Без `main` push и без canonicalize `main`.

## 2. Goal

Доказать на **real PostgreSQL** cross-module invariants, которые реализуются в разных задачах: DB-level constraint negatives для всех canonical immutable facts, first-valid-wins для предписанных race, idempotency/replay поведение TG-012, config-race сериализацию TG-018, worker claim/lease поведение TG-019 и persistence/restart на authoritative данных. TG-026 **ничего не чинит и не реализует product semantics**: он только доказывает, а production failure возвращается owning task с воспроизводимым evidence.

## 3. Canonical sources

Приоритет — `AGENTS.md`. Продуктовая семантика: `docs/01_PRODUCT_FREEZE.md` §§6–9, 15; `docs/02_PRODUCT_SPEC.md` §§9–19, 22–24 (INV-001…006/014…032, AC-002/005/014…020/050, AC-055–059). Технические границы: `docs/03_ARCHITECTURE.md` §§13, 15–18, 22–23, 26.3–26.4; `docs/04_DATA_MODEL.md` §§24–29, 31–33, 36–37; `docs/05_INTERFACE_CONTRACTS.md` §§4–5, 17–22, 29–34, 37; `docs/07_DECISIONS.md` ADR-013, ADR-014, ADR-021, ADR-022, ADR-026. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` §TG-026.

Upstream contracts на SHA §1 обязательны к сверке: TG-008 — deterministic seed fixtures, TG-012 — reservation/fingerprint/replay/lock order, TG-016 — feedback/clarification/rework/completion facts и его race table, TG-018 — финальные config/audit/lock semantics (включая F1–F4), TG-019 — claim/lease/retry/redrive. Persistence и DB immutability остаются за TG-006 (Case/workflow facts) и TG-007 (Attachment, CommandExecution, audit). TG-027 владеет HTTP wire/authorization conformance, TG-029 — финальной app registry, TG-030 — Docker/compose, TG-032 — public deployment. TG-026 не дублирует их и не подменяет их evidence.

## 4. Dependencies / unlocks

```text
Depends On = TG-008, TG-012, TG-016, TG-018, TG-019
Unlocks = TG-032
Parallel With = TG-029
TASK_GRAPH_DIVERGENCE = NONE
IMPLEMENTATION_BLOCKED_UNTIL_ALL_DEPENDENCIES = YES
```

Implementation gate открывается только когда завершены **все пять** implementations, Integration Agent выдал новый stable `main`, TG-026 сверил фактические финальные SHA и interface surface (kernel, seed manifest, config commands, notification worker) и получен PASS одного independent review этого контракта. TG-016 implementation ещё downstream; TG-008/TG-012/TG-019 implementations выполняются. Любой из пяти pending — gate, а не blocker authoring/review. TG-026 **не** получает зависимость от TG-029: собственный test composition собирается из module entry points, без второго app registry.

## 5. Allowed write scope

Сейчас — **только** `tasks/TG-026_TASK_CONTRACT.md`. Будущий implementation scope: `tests/integration/db/**` и `tests/integration/concurrency/**`, включая принадлежащий TG-026 test runner config, harness, fixtures, suites и test-owned scripts. Разделение: `tests/integration/db/harness/**` — общий deterministic harness (provisioning, migrations, fixtures, barriers, snapshot/diff, report writer), `tests/integration/db/**` — constraint/immutability/restart suites, `tests/integration/concurrency/**` — race/idempotency/config/lease suites; общий harness импортируется, а не дублируется.

Вне repository: артефакты прогонов (JSON/JUnit report) пишутся в каталог вне versioned tree (`TG026_ARTIFACTS_DIR` либо OS temp), чтобы не добавлять `.gitignore`/root manifest edits. Root `package.json`, `package-lock.json`, `tsconfig.base.json`, workspace/runner configs — **TG-001 only**, dependency additions идут через Integration Agent; suite обязана быть запускаемой явной документированной командой независимо от root script wiring.

## 6. Forbidden scope

Не изменять production code вообще: `apps/**`, `packages/**`, migrations, repository/transaction kernel, seed/maintenance, notification worker, domain. Не менять `main`, canonical docs, Task Graph, upstream contracts, root manifests/lockfile/runner configs, `compose.yaml`/`Dockerfile`/`.env.example`, `app.ts`/module registry/router. Не ослаблять и не обходить constraints: запрещены `session_replication_role`, отключение triggers/rules, изменение `search_path`/schema в обход migrations, `TRUNCATE`/`rollbackAll`/удаление истории, ручной DDL вместо canonical migrator. Не использовать mock/эмуляцию PostgreSQL locking, constraints, SKIP LOCKED или lease; не использовать альтернативную БД (SQLite/in-memory/pglite) и не понижать isolation level. Не использовать `sleep`/`setTimeout`/poll как механизм корректности concurrency и не «чинить» гонку сериализацией тестового клиента (один клиент, последовательные шаги вместо перекрывающихся транзакций, `FOR UPDATE` подсказки, которых нет в production). Не делать `skip`/`todo`/`only`, не ослаблять assertion, не маскировать production failure и не заявлять PASS при `passWithNoTests`/exit 0 placeholder. Не собирать второй Fastify app registry и не дублировать TG-027 HTTP/authorization matrix: TG-026 проверяет canonical outcome owning модулей на реальной БД. Не создавать вторую seed/demo фикстуру, не выдавать synthetic сведения за real и не использовать скрытые/случайные user IDs.

## 7. Required behavior / invariants

### 7.1 Real PostgreSQL и deterministic harness

- Harness работает только на **real PostgreSQL**; при отсутствии доступного экземпляра suite падает с явной ошибкой, а не переходит на mock/SQLite. Guard до любой DB операции: `current_database()` соответствует тестовому назначению (имя с суффиксом `_tg026_test` либо явно переданный test target), `APP_ENV=test`; preflight фиксирует и проверяет, что тесты не понижают isolation и не подменяют серверные настройки. Preflight и результат входят в machine-readable report.
- Provisioning детерминирован: отдельный disposable database/schema на прогон, `migrateToLatest` из `@max-smart-city/db` (никакого ручного DDL), затем TG-008 seed CLI/manifest. Параллельные test workers не делят изменяемое состояние: каждый scenario получает собственный tenant/Case, общий read-only setup допускается.
- Fixtures разрешаются по **стабильным business keys** TG-008 manifest (никаких захардкоженных «случайных» UUID, `display_name` или `sequence`-зависимых ID). Акторам соответствуют ровно четыре role views из manifest.
- Общий snapshot/diff helper: нормализованное представление строки (typed values + канонический JSON для JSONB, побитовое для `bytes`) и сравнение до/после. Каждая проверка immutability/idempotency/restart опирается на **persisted rows**, а не только на HTTP-ответ.

### 7.2 Controlled parallel transactions

- Каждая гонка использует две независимые реальные сессии/соединения и детерминированный interleaving: hold-point ставится на канонической точке захвата lock (reservation → Case row → config rows по global order §29.4), после чего вторая сессия стартует и блокируется на реальном DB lock; порядок «A-first» и «B-first» воспроизводится одинаково и проверяется в обоих порядках.
- Harness даёт `race`-helper только для barrier/hold-point/await-commit, а не для бизнес-решений: он не добавляет к production statements locks, hints, retries или `SET` параметров, отсутствующих в canonical protocol. Никакой глобальный sleep, произвольный timeout-as-correctness или «подождать и посмотреть» вместо явного barrier.
- Assertion после завершения обеих сессий: committed rows, количество business facts, `Case.revision`, `event_seq` contiguity, `command_id` correlation, отсутствие orphan `CommandExecution`/intent.

### 7.3 First valid wins

Для каждой гонки обязательны одновременно: (a) **не более одного** допустимого business fact; (b) loser получает canonical semantic `409` с owning code (`STALE_ASSIGNMENT`, `STALE_SELECTION`, `STALE_RESULT`, `NO_FEEDBACK_ALREADY_RECORDED`, `FEEDBACK_ALREADY_SUBMITTED`, `INVALID_STATE`, `TERMINAL_CASE`, `IDEMPOTENCY_KEY_REUSE`, `422` inactive dependency — по upstream contracts) **либо** явно разрешённый canonical replay/no-op; (c) loser не оставляет частичных effects, events, intents и не изменяет authoritative rows. Наблюдаемым считается canonical outcome owning модуля (in-process вызов command entry point на реальной БД и реальном transaction kernel); HTTP wire/middleware conformance — зона TG-027. Если entry point недоступен без TG-029 registry — blocker, а не правка `app.ts`.

### 7.4 Race matrix (обязательный минимум)

Все гонки — в обоих lock orders, на TG-008 fixtures, с проверкой committed rows.

| # | Гонка | Обязательный исход |
|---|---|---|
| R1 | `accept \|\| reject` одного Assignment | одно `PENDING→ACCEPTED\|REJECTED`, loser canonical `409`; second decision невозможен (one-way) |
| R2 | late action на **old Assignment** (accept/reject/result) | `STALE_ASSIGNMENT`/current-context `409`, executor/iteration не меняются |
| R3 | duplicate `SubmitResult` | ровно один `Result` по `UNIQUE(iteration_id)`, один EVT-008, один `RESULT_READY` intent |
| R4 | `confirmation \|\| remark` одного Result | максимум одна formal branch (`UNIQUE(result_id)`), ровно один EVT-010 **или** EVT-011 |
| R5 | `ReturnToRework \|\| disputed completion` | только winner effects: N+1+EVT-013/014 **или** EVT-017; loser `409`, без смешения event sets |
| R6 | `completion \|\| late remark` (fixture без feedback, но с отдельным valid manual basis) | ровно один terminal outcome; remark-first исключает ordinary completion, completion-first даёт `TERMINAL_CASE` |
| R7 | duplicate EVT-015 | один EVT-015 на Result (non-null `result_id` CHECK + partial unique), другой key `409 NO_FEEDBACK_ALREADY_RECORDED` |
| R8 | concurrent **same** `Idempotency-Key` | один reservation owner, второй ждёт и replay'ит exact stored status/body; ни одного второго business fact |
| R9 | same key + **changed** payload / multipart file bytes | `409 IDEMPOTENCY_KEY_REUSE` после security gate, без writes |
| R10 | config races (см. 7.6) | сериализация по §29.4, ровно один допустимый outcome |
| R11 | stale `SendAssignment` по **old Selection** | `STALE_SELECTION` `409`, новая Assignment не создаётся, silent retarget запрещён |
| R12 | two-worker `NotificationIntent` claim/lease | ровно один claim owner; loser/failed worker не может finalize чужой claim; expired lease reclaim с новым `claim_token` |

### 7.5 Immutability regression (real attempted UPDATE/DELETE)

Матрица выполняется прямым SQL на real PostgreSQL по persisted canonical facts. Для каждой строки: снимок до → попытка `UPDATE`/`DELETE` в отдельной transaction (откат/ошибка) → перечитывание → сравнение byte/semantic equivalence authoritative значения. Отказ обязан прийти от DB (ожидаемый SQLSTATE/constraint/trigger), а не от application code.

Обязательный охват: `Result` (полностью); `ResidentFeedback` (полностью); `Comment` (business history); `Attachment` **bytes**; `Attachment` immutable metadata **после** business association; `ContractorSelection` identity (case/iteration/contractor/selected actor/time); immutable `Assignment` identity (case/selection/contractor/created iteration/sent actor/time); one-way `Assignment` decision (`PENDING→ACCEPTED|REJECTED` — ровно один раз: повторное решение, смена terminal decision и обратный переход отвергаются); `CaseEvent` (append-only, `event_seq` и payload); успешный `CommandExecution` (principal/key/fingerprint/command identity и canonical response после `SUCCEEDED`; единственный normal transition `IN_PROGRESS→SUCCEEDED`).

Дополнительно обязательный constraint-negative regression по Data Model §§24–26: cross-tenant FK (organization/house/premises/category), same-case current pointers, same-case child relations, `EVT_015 => result_id IS NOT NULL`, `UNIQUE(result_id,event_type) WHERE EVT_015`, `UNIQUE(case_id,event_seq)`, closure consistency, `UserRoleBinding` role shape, `MaxIdentity` readiness CHECK, DemoRun↔Case same-run, circular Case↔CaseIteration bootstrap.

### 7.6 Config races (финальная семантика TG-018)

Обязательные пары в обоих порядках, с committed-row проверкой и без изменения §29.4: deactivate **House** vs `CreateCase`; deactivate **Category** vs `CreateCase`; Category requirement/default update vs `CreateCase` (snapshot целиком old **или** new, никогда смешанный); **OrganizationContractor deactivation** vs `CreateCase` с non-null default (create-first → coherent прежний `default_contractor_snapshot_id`; deactivate-first → `422` и ноль create effects, default не очищается); deactivate **OrganizationContractor** vs `SelectContractor` и vs `SendAssignment`; actor/access/binding races на нескольких old/new rows для stable PK order; F2 case: два concurrent role-binding PUT с разными keys и UK-ролями → serial replacement, максимум одна active UK binding в `(app_user_id, organization_id)`, foreign bindings неизменны; F2 case: concurrent `house_ids` set replacement (`[A,B] → [B,C]`, повтор ID, `[]`) → сериализованный полный набор без дублей/лишних `UKHouseAccess`; F4 case: два concurrent PATCH разных config entities с разными keys → последовательный `config_revision+1` и правильный `updated_by_user_id` для каждого write. Создание/reactivation отсутствующей child-строки не должно обходить сериализацию. Config write не создаёт `CaseEvent`, не меняет Case snapshots/history и не ретаргетит Selection/Assignment.

### 7.7 Idempotency (TG-012)

Покрытие обязательно: same key + **тот же** request → stored status/body без новых writes/events/revision; same key + **изменённый** normalized body → `IDEMPOTENCY_KEY_REUSE`; same key + изменённые multipart **bytes** (и hash) при прежней metadata → conflict, тогда как transport boundary/header variation при тех же logical bytes fingerprint не меняет; replay после revoke (binding/access) **запрещён** до выдачи stored response; replay после contractor reassignment (old contractor) **запрещён**; authorized replay по неизменной authority возвращает exact canonical stored response без повторной business-transition валидации. Проверяется также, что loser не оставляет orphan `IN_PROGRESS`/`SUCCEEDED`, а rollback reservation исчезает.

### 7.8 Persistence / restart

Restart обязан доказать durability **без** правок compose/Dockerfile и без process-memory state: (a) полное закрытие пулов/соединений и reconnect даёт byte-identical authoritative data; (b) server-side завершение собственных test-сессий (`pg_terminate_backend`) и чтение после reconnect — те же snapshots, history, `CommandExecution` responses, attachments bytes; (c) реальный restart процесса, поднятого harness'ом (API и notification worker), сохраняет Case/current projection, все iterations/selections/assignments/results/feedback/comments/events, configuration, users/bindings, MAX identity links, DemoRuns, command idempotency, attachments и notification intents/status. NotificationIntent `PENDING`/`RETRY` данные переживают restart; expired `CLAIMED`/`lease_expires_at` reclaim даёт тот же intent с новым `claim_token` и без дублей `Result`/EVT-008/intent; старый `claim_token` не может finalize. Ни один restart/lease шаг не создаёт второй business fact.

### 7.9 Machine-readable CI result

Suite эмитит JSON и/или JUnit отчёт с per-test outcome, exit code non-zero при любом failure, и fingerprint окружения: PostgreSQL version, applied migrations, seed manifest version/namespace, build/commit SHA, список активных suites. Артефакты — вне versioned tree; отчёт потребляется deployment gate TG-032. Placeholder/exit-0 suite, `passWithNoTests` и «зелёный» результат без реального PostgreSQL не считаются evidence.

### 7.10 Failure routing

Любой провал — это production failure: минимальный воспроизводимый сценарий (имя теста, шаги, committed evidence, ожидаемый canonical outcome) передаётся owning task; TG-026 **не** чинит production в своей ветке, **не** ослабляет assertion, **не** добавляет skip и **не** сериализует клиента, чтобы получить зелёный результат. Ветка TG-026 содержит только test-файлы; red-статус и blocker фиксируются явно.

## 8. Dependency requests

```text
DEPENDENCY_REQUESTS =
1) TG-001 owner / Integration Agent: подключить реальный suite к root `test:integration`
   (заменить NO_SUITE_YET placeholder) и включить runner config/workspace для
   `tests/integration/**`; TG-026 не правит root `package.json`/lockfile/runner configs
   и остаётся запускаемым явной документированной командой без этой правки.
2) Integration Agent: test-only PostgreSQL provisioning для suites (test database URL
   с guard, либо подтверждённый external instance); TG-030 compose/Docker не редактируются.
3) TG-008 owner: финальный implementation SHA, стабильный seed manifest/business keys и
   seed CLI entry point для fixtures.
4) TG-012 owner: финальный kernel/repository entry points и canonical error codes для
   проверки replay/409 в concurrency suites.
5) TG-019 owner: финальный implementation SHA, worker claim/lease/finalize/redrive entry
   points и typed значения `NOTIFICATION_LEASE_MS`, retry/attempt/backoff для
   детерминированных expired-lease сценариев.
6) TG-018 owner: финальный implementation SHA config command entry points для 7.6.
```

Новых npm packages не требуется: `pg`/`kysely`/`vitest` уже присутствуют. Фактическая несовместимость любого upstream surface — конкретный interface/file request владельцу и Integration Agent до затронутой работы; upstream в TG-026 не править.

## 9. Acceptance criteria

Все обязательные гонки R1–R12 покрыты в обоих lock orders и дают максимум один business fact с canonical `409` либо разрешённым replay/no-op у loser, без частичных effects. Immutability matrix §7.5 даёт DB-level отказ на каждой запрещённой мутации с byte/semantic-equivalent authoritative value плюс полный constraint-negative regression §§24–26. Idempotency §7.7 закрывает все шесть сценариев, включая запрет replay после revoke и после contractor reassignment. Restart §7.8 сохраняет все authoritative data и восстанавливает pending/retry/expired-claim без дублей `Result`/event/intent. Config races §7.6 соответствуют финальной семантике TG-018. Fixtures детерминированы по TG-008 business keys, без reset истории. Machine-readable report и fail-fast exit присутствуют. Production code не изменён; провалы возвращены owning task. Suite не содержит mock/альтернативной БД, sleep-as-correctness, сериализации клиента, skip или ослабленных assertions.

## 10. Required tests

На **будущей implementation stage** — только real PostgreSQL; после targeted suites запустить `npm run typecheck`, `npm run build`, `npm test` (upstream regressions зелёные) и документированную команду TG-026; `git diff --check <TG026_IMPLEMENTATION_BASE_SHA>`. Обязательный состав:

1. **Harness preflight/determinism:** guard test database/APP_ENV, applied migrations, seed manifest namespace/version, детерминированные business keys и ровно четыре role views; повторный прогон даёт тот же fingerprint; preflight фиксирует, что isolation/DB settings не изменены.
2. **Constraint regression:** негативная матрика §§24–26 (FK/UNIQUE/CHECK/cross-tenant/current pointers/closure/role shape/MAX readiness/DemoRun↔Case/circular bootstrap) с проверкой, что отказ пришёл от DB.
3. **Immutability matrix:** attempted `UPDATE`/`DELETE` для всех фактов §7.5, вкл. Attachment bytes и post-association metadata, one-way Assignment decision (включая attempted второй decision), successful `CommandExecution` (principal/key/fingerprint/identity + canonical response); каждый кейс — snapshot до/после с byte/semantic equality.
4. **Race matrix R1–R12:** каждая гонка в обоих lock orders через controlled parallel transactions; assertions на committed rows, count фактов, `revision`, `event_seq`, `command_id` correlation, отсутствие orphan reservation/intent.
5. **Idempotency §7.7:** six scenarios, включая boundary/header variation при неизменных bytes и запрет replay после revoke/reassignment.
6. **Config races §7.6:** все перечисленные пары в обоих порядках, включая F2 double-PUT, `house_ids` replacement и F4 revision increments; проверка отсутствия silent default clear/retarget/partial create.
7. **Restart/persistence §7.8:** reconnect, server-side session termination, реальный process restart API+worker, pending/retry survival, expired-claim reclaim, отсутствие дублей `Result`/EVT-008/intent.
8. **CI artifact:** отчёт содержит per-test outcome, environment fingerprint, exit code; suite падает при недоступном real PostgreSQL и при любом failure, без `passWithNoTests`.
9. **Scope guard:** `git diff --name-only <TG026_IMPLEMENTATION_BASE_SHA>` показывает только `tests/integration/db/**` и `tests/integration/concurrency/**` (+ согласованный shared-file route из §8).

На текущем authoring stage выполняется только self-check документа: ровно 12 Lean sections, канонические graph/SHA/sources/semantics, единственный изменённый файл, `git diff --check`. Runtime tests **NOT_RUN**, их PASS не заявляется; `test:integration` остаётся `NO_SUITE_YET` до TG-026 implementation.

## 11. Git / integration handoff

Authoring: изолированная ветка `codex/tg-026-contract` от `CONTRACT_BASE_SHA` §1, только `tasks/TG-026_TASK_CONTRACT.md`, self-check, commit/push **только этой ветки** с существующей human Git identity (без AI author/co-author/Generated-by подписей). Вернуть full contract SHA, base SHA, upstream SHA, remote SHA match и clean worktree. Без `main` push и без canonicalize `main`. Затем **один independent CRITICAL review** этого contract SHA; review проходит вне canonical repository, review artifacts не коммитятся. При `FIX_REQUIRED` — один полный batch findings → один batch fix → только targeted closure, без нового полного review chain. Implementation получает отдельный актуальный `BASE_SHA` и branch только после завершения **всех пяти** dependencies и PASS review; Integration Agent один собирает stable `main`, TG-026 его не canonicalize. PASS review не снимает implementation gate.

## 12. Blocker protocol

Остановить затронутую работу и сообщить точный источник/владельца/Integration Agent при: неверном `BASE_SHA` или недоступном обязательном upstream; `SPEC CONFLICT` (race/idempotency/immutability/config semantics, расходящиеся с Product Freeze/Product Spec); production-инварианте, который TG-026 не может доказать без изменения production (например, constraint отсутствует в миграциях TG-006/TG-007) — это возвращается owning task, а не чинится здесь; несовместимости фактических kernel/seed/config/worker entry points с §7; command entry point, достижимый только через TG-029 registry (не строить второй registry); необходимости изменить compose/Dockerfile, migrations, root manifests или ослабить constraints; недоступности real PostgreSQL (не подменять mock/альтернативной БД); необходимости shared-file правки вне §8 route. Pending dependencies — gate, не blocker authoring/review. Review findings не превращать в новые process-артефакты.
